// Dedicated market-data reader. Only catalog and option snapshots are exposed.
// It has no account, balance, position, order or execution API.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizOptionsMarketReader) { window.__chuchotrizOptionsMarketReader.attach(channel); return; }
  const channels = new Set([channel]), subscribed = new Set();
  let previousContext, revision = 0, signature, catalogRevision = 0, active;
  const finite = value => typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const positive = value => finite(value) !== undefined && value > 0;
  function context() {
    const ms = window.mainStore;
    const version = document.body.innerText.match(/Versi[oó]n:\s*([\d.]+)/)?.[1];
    if (!["4.24.1", "4.24.4"].includes(version)) throw Error("Versión de Matriz no verificada para lectura de opciones.");
    if (!ms?.securityStore || typeof ms.securityStore.getSecurity !== "function" || !ms.dmaWebSocket || typeof ms.dmaWebSocket.addSubscription !== "function")
      throw Error("El catálogo de Matriz todavía no está disponible.");
    const next = [ms, ms.securityStore, ms.dmaWebSocket, ms.profileStore?.activeAccount, ms.webSocketConnectionStatus, version];
    if (!previousContext || next.some((value, i) => value !== previousContext[i])) {
      previousContext = next; revision++; subscribed.clear();
    }
    if (!ms.webSocketConnectionStatus) throw Error("Market data desconectado. Esperando reconexión de Matriz.");
    return { ms, revision, version };
  }
  function sources(ms) {
    const ss = ms.securityStore;
    const options = ss.options, underlyings = ss.underlyingsForMatrix;
    if (!Array.isArray(options) || !Array.isArray(underlyings) || options.length > 10000 || underlyings.length > 2000)
      throw Error("Catálogo de opciones de Matriz no disponible o fuera del límite de lectura.");
    return { options, underlyings };
  }
  function catalogOf(source) {
    const underlyings = source.underlyings.filter(s => s && typeof s.id === "string" && typeof s.symbolStr === "string")
      .map(s => ({ id: s.id, symbol: s.symbolStr, currency: s.currency }));
    const byId = new Map(source.underlyings.map(s => [s?.id, s])), seen = new Set(), contracts = [];
    for (const sec of source.options) {
      if (!sec) continue;
      const { id, symbolStr: symbol, underlying: underlyingId, cfiCode, currency, settlementType: settlement } = sec;
      const ref = sec.refData || {}, underlying = byId.get(underlyingId);
      const kind = typeof cfiCode === "string" ? cfiCode.startsWith("OC") ? "call" : cfiCode.startsWith("OP") ? "put" : undefined : undefined;
      if (typeof id !== "string" || seen.has(id) || typeof symbol !== "string" || !underlying || !kind || !positive(ref.strikePrice) ||
        !/^\d{8}$/.test(ref.maturityDateStr) || !["ARS", "USD"].includes(currency) || typeof settlement !== "string") continue;
      const localEquity = sec.marketId === "bm" && /^O[CP]ASPS$/.test(cfiCode) && currency === "ARS" && underlying.currency === "ARS" && /^ES/.test(underlying.cfiCode);
      const strikeCurrency = typeof ref.strikeCurrency === "string" ? ref.strikeCurrency : ref.strikeCurrency == null && localEquity ? "ARS" : undefined;
      const factor = [ref.totalAmountFactor, ref.contractMultiplier, ref.roundLot].every(positive)
        ? ref.totalAmountFactor * ref.contractMultiplier * ref.roundLot : undefined;
      contracts.push({ id, symbol, underlyingId, kind, strike: ref.strikePrice, expiration: ref.maturityDateStr, currency, strikeCurrency, settlement, factor });
      seen.add(id);
    }
    const next = JSON.stringify([underlyings, contracts]);
    if (next !== signature) { signature = next; catalogRevision++; }
    return { underlyings, contracts, catalogRevision, excluded: source.options.length - contracts.length };
  }
  function snapshotOf(sec) {
    const md = sec.md || {}, book = sec.book || {};
    const level = (side, size) => {
      const price = finite(book[side + "Book1"]), quantity = finite(book[size + "Book1"]);
      if (positive(price) && positive(quantity)) return { price, size: quantity };
      return positive(md[side]) && positive(md[size]) ? { price: md[side], size: md[size] } : undefined;
    };
    let impliedVolatility, delta;
    try { impliedVolatility = finite(sec.impliedVolatility); } catch { /* Native computed value unavailable. */ }
    try { delta = finite(sec.greeks?.ggd); } catch { /* Native computed value unavailable. */ }
    const raw = md.lstdStr;
    const timestamp = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) ? Date.parse(raw) : NaN;
    const canonical = typeof raw === "string" ? raw.replace(/(?:\.(\d{1,3}))?Z$/, (_, ms) => "." + (ms || "").padEnd(3, "0") + "Z") : "";
    const lastTradeAt = Number.isFinite(timestamp) && new Date(timestamp).toISOString() === canonical ? timestamp : undefined;
    return { bid: level("bid", "bsz"), ask: level("ask", "asz"), last: finite(md.lst), referencePrice: finite(md.refp),
      seq: finite(md.seq), impliedVolatility, delta, nominalVolume: finite(md.von), changePercent: finite(sec.change), lastTradeAt };
  }
  function assertCurrent(operation) {
    if (!channels.has(operation.channel) || operation.retired || Date.now() > operation.deadline) throw Error("Lectura retirada o fuera de tiempo.");
    if (context().revision !== operation.revision) throw Error("Cambió el contexto de mercado durante la lectura.");
  }
  async function snapshot(params, operation, ms) {
    if (!Array.isArray(params.ids) || !params.ids.length || params.ids.length > 160)
      throw Error("Selección de opciones inválida (hasta 160 instrumentos por lectura).");
    const requested = new Set(params.ids);
    const source = sources(ms), catalog = catalogOf(source);
    const underlying = source.underlyings.find(u => u.id === params.underlyingId);
    const allowedIds = new Set(catalog.contracts.filter(c => c.underlyingId === params.underlyingId && requested.has(c.id)).map(c => c.id));
    const allowed = new Map();
    for (const sec of source.options) {
      const id = sec?.id;
      if (allowedIds.has(id)) allowed.set(id, sec);
    }
    if (underlying) allowed.set(underlying.id, underlying);
    if (!underlying || requested.size !== params.ids.length || params.ids.some(id => !allowed.has(id)))
      throw Error("Selección de opciones inválida (hasta 160 instrumentos por lectura).");
    if (new Set([...subscribed, ...params.ids]).size > 256) throw Error("Límite de suscripciones de lectura alcanzado. Recargá Matriz para cambiar de mercado.");
    const fresh = params.ids.filter(id => !subscribed.has(id));
    if (fresh.length) {
      // Market subscriptions only. Never unsubscribe: other Matriz views share these topics.
      ms.dmaWebSocket.addSubscription("md", fresh.map(id => "md." + id));
      ms.dmaWebSocket.addSubscription("book", fresh.map(id => "book." + id));
      fresh.forEach(id => subscribed.add(id));
    }
    const instruments = {};
    for (const id of params.ids) {
      assertCurrent(operation);
      const sec = await ms.securityStore.getSecurity(id);
      assertCurrent(operation);
      if (!sec || sec.id !== id) throw Error("Instrumento no disponible en Matriz.");
      instruments[id] = snapshotOf(sec);
    }
    const final = sources(ms), finalOptions = new Map();
    for (const sec of final.options) {
      const id = sec?.id;
      if (allowedIds.has(id) && !finalOptions.has(id)) finalOptions.set(id, sec);
    }
    const finalUnderlying = final.underlyings.find(u => u.id === underlying.id);
    if (catalogOf(final).catalogRevision !== catalog.catalogRevision || params.ids.some(id => allowed.get(id) !== (id === underlying.id ? finalUnderlying : finalOptions.get(id))))
      throw Error("Cambió el catálogo durante la lectura.");
    return { instruments, underlyingId: underlying.id, capturedAt: Date.now(), contextRevision: operation.revision, catalogRevision: catalog.catalogRevision };
  }
  window.addEventListener("message", async event => {
    const msg = event.data;
    if (event.source !== window || !msg || !channels.has(msg.channel)) return;
    if (msg.kind === "detach") { channels.delete(msg.channel); if (active?.channel === msg.channel) active.retired = true; return; }
    if (msg.kind === "retire") { if (active?.channel === msg.channel && active.id === msg.id) active.retired = true; return; }
    if (msg.kind !== "request") return;
    const reply = payload => { if (channels.has(msg.channel)) window.postMessage({ channel: msg.channel, kind: "response", id: msg.id, ...payload }, location.origin); };
    let operation;
    try {
      if (msg.method === "catalog") {
        const current = context();
        reply({ result: { ...catalogOf(sources(current.ms)), contextRevision: current.revision, version: current.version } });
      } else if (msg.method === "snapshot") {
        if (active) throw Error("Hay una lectura de mercado pendiente. Esperando a que termine.");
        const current = context();
        operation = { id: msg.id, channel: msg.channel, revision: current.revision, deadline: Date.now() + 4500 };
        active = operation;
        const result = await snapshot(msg.params || {}, operation, current.ms);
        assertCurrent(operation); reply({ result });
      } else throw Error("Método no permitido por el lector de mercado.");
    } catch (error) { reply({ error: error instanceof Error ? error.message : "Lectura no disponible." }); }
    finally { if (operation && active === operation) active = undefined; }
  });
  window.__chuchotrizOptionsMarketReader = { attach(value) { if (typeof value === "string" && channels.size < 8) channels.add(value); } };
})();
