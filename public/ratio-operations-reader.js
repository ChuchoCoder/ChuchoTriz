// Read-only catalog, quotes and an opaque local storage scope. No reports or execution APIs.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizRatioOperations) { window.__chuchotrizRatioOperations.attach(channel); return; }
  const channels = new Set([channel]), retired = new Set(), subscribed = new Set(), sequences = new Map();
  let identity, contextId, reading = false;
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const positive = n => finite(n) && n > 0;
  const text = (s, max = 240) => typeof s === "string" && s.length > 0 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);
  const key = s => s.replace(/\(\s*CI\s*\)/gi, " CI ").trim().replace(/\s+/g, " ").toUpperCase();
  class ReadError extends Error {}
  function check(ok, message) { if (!ok) throw new ReadError(message); }
  function context() {
    const ms = window.mainStore, ss = ms?.securityStore, version = document.body?.innerText.match(/Versi[oó]n:\s*(\S+)/)?.[1];
    check(["4.23.16", "4.24.1", "4.24.4", "4.24.5"].includes(version), "Versión de Matriz no verificada para operaciones de ratios.");
    check(ss && Array.isArray(ss.securities) && ss.securities.length <= 30000 && typeof ss.getSecurity === "function" && text(ms.profileStore?.activeAccount), "Esperando el catálogo y la cuenta activa de Matriz.");
    const next = [ms, ss, ms.profileStore.activeAccount, ms.dmaWebSocket, ms.webSocketConnectionStatus, version];
    if (!identity || next.some((x, i) => x !== identity[i])) { identity = next; contextId = crypto.randomUUID(); subscribed.clear(); sequences.clear(); }
    return { ms, ss, contextId, connected: !!ms.webSocketConnectionStatus };
  }
  function descriptor(s) {
    // The Dólar USA header reads this spot security, not the product or a future.
    if (s?.id === "rx_DDF_DLR_SPOT" && s.marketId === "rx" && !s.isProduct && !s.isPortfolio && s.currency === "ARS") {
      return { id: s.id, symbol: "DLR/SPOT", market: "rx", currency: "ARS", settlement: "Referencia",
        cfi: "MRIXXX", quantityUnit: "unidades", monitorOnly: true };
    }
    if (!s || s.isProduct || s.isPortfolio || !text(s.id) || !text(s.symbolStr || s.symbol, 100) || !text(s.marketId) || !text(s.currency)) return;
    const rate = s.cfiCode === "RPXXXX";
    if (rate ? s.marketId !== "bm" || s.currency !== "ARS" || !/^bm_MERV_PESOS_[1-9]\d{0,2}D$/.test(s.id) ||
      s.symbolStr !== `PESOS - ${s.id.slice("bm_MERV_PESOS_".length)}` : !text(s.settlementType)) return;
    const ref = s.refData || {}, cfi = typeof s.cfiCode === "string" && s.cfiCode.length <= 12 ? s.cfiCode : "";
    const derivative = /^(?:O[CP]|FXXXSX)/.test(cfi), spot = ["ESXXXX", "EMXXXX", "DBXXXX", "DBXXFR", "DYXTXR"].includes(cfi);
    const amountFactor = positive(ref.totalAmountFactor) && positive(ref.contractMultiplier) && (spot || derivative && positive(ref.roundLot))
      ? ref.totalAmountFactor * ref.contractMultiplier * (derivative ? ref.roundLot : 1) : undefined;
    const quantityStep = derivative ? 1 : spot && Number.isSafeInteger(ref.roundLot) && ref.roundLot > 0 ? ref.roundLot : undefined;
    return { id: s.id, symbol: s.symbolStr || s.symbol, market: s.marketId, currency: s.currency, settlement: rate ? "TNA" : s.settlementType,
      cfi, amountFactor: positive(amountFactor) ? amountFactor : undefined, quantityStep, quantityUnit: derivative ? "contratos" : spot ? "nominales" : "unidades" };
  }
  function current(op) {
    check(channels.has(op.channel) && !retired.has(op.id) && Date.now() <= op.deadline && context().contextId === op.contextId, "Cambió la cuenta, conexión o lectura de ratios. Volvé a intentarlo.");
  }
  function quote(s) {
    const md = s.md || {}, book = s.book || {};
    if (finite(md.seq) && md.seq < (sequences.get(s.id) ?? -Infinity)) return { issue: "Esperando una secuencia de mercado actual." };
    if (finite(md.seq)) sequences.set(s.id, md.seq);
    const level = (side, size, index) => {
      // Matriz's best level lives in md; Book1..4 are the following four levels.
      const source = index === 0 ? md : book;
      const p = source[index === 0 ? side : side + "Book" + index], q = source[index === 0 ? size : size + "Book" + index];
      return positive(p) && positive(q) ? { price: p, size: q } : undefined;
    };
    const depth = Array.from({ length: 5 }, (_, i) => ({ bid: level("bid", "bsz", i), ask: level("ask", "asz", i) }));
    const at = typeof md.lstdStr === "string" ? Date.parse(md.lstdStr) : NaN;
    const ref = md.refdStr || md.refd;
    const referenceAt = ref instanceof Date ? ref.getTime() : typeof ref === "string" ? Date.parse(ref) : NaN;
    return { last: positive(md.lst) ? md.lst : undefined, bid: depth[0].bid, ask: depth[0].ask, depth,
      reference: positive(md.refp) ? md.refp : undefined,
      referenceDate: finite(referenceAt) && referenceAt <= Date.now() ? new Date(referenceAt).toISOString().slice(0, 10) : undefined,
      tradedAt: finite(at) && at <= Date.now() ? at : undefined, amountFactor: descriptor(s)?.amountFactor };
  }
  async function lookup(ss, id) {
    let timer;
    try {
      return await Promise.race([ss.getSecurity(id), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ReadError("La lectura de cotizaciones demoró demasiado. Volvé a intentarlo.")), 10000);
      })]);
    } finally { clearTimeout(timer); }
  }
  window.addEventListener("message", async event => {
    const m = event.data;
    if (event.source !== window || !channels.has(m?.channel)) return;
    if (m.kind === "detach") { channels.delete(m.channel); if (!channels.size) { subscribed.clear(); sequences.clear(); } return; }
    if (m.kind === "retire") { if (text(m.id)) { retired.add(m.id); if (retired.size > 1000) retired.delete(retired.values().next().value); } return; }
    if (m.kind !== "request" || !text(m.id)) return;
    const reply = payload => { if (channels.has(m.channel) && !retired.has(m.id)) window.postMessage({ channel: m.channel, kind: "response", id: m.id, ...payload }, location.origin); };
    let ownsRead = false;
    try {
      check(["ratioContext", "ratioSearch", "ratioQuotes"].includes(m.method), "Método no permitido por el lector de ratios.");
      const c = context(), p = m.params || {}, op = { channel: m.channel, id: m.id, contextId: c.contextId, deadline: Date.now() + 14000 };
      if (m.method === "ratioContext") {
        check(typeof p.storageSalt === "string" && /^[a-f0-9]{64}$/.test(p.storageSalt), "Guardado local de ratios no disponible.");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([p.storageSalt, location.origin, c.ms.profileStore.activeAccount])));
        current(op);
        reply({ result: { contextId: c.contextId, storageScope: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""), connected: c.connected } }); return;
      }
      check(p.contextId === c.contextId, "Cambió la cuenta o conexión. Esperá la actualización de ratios.");
      if (m.method === "ratioSearch") {
        check(typeof p.query === "string" && p.query.length <= 60, "Búsqueda de instrumento inválida.");
        const query = key(p.query).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const result = query ? c.ss.securities.map(descriptor).filter(s => s && (key(s.symbol).normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query) || s.id === "rx_DDF_DLR_SPOT" && "DOLAR OFICIAL DOLAR USA DLR/SPOT".includes(query)))
          .sort((a, b) => Number(key(b.symbol) === query) - Number(key(a.symbol) === query) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id)).slice(0, 60) : [];
        current(op); reply({ result }); return;
      }
      check(!reading, "Hay una lectura de cotizaciones pendiente.");
      check(Array.isArray(p.ids) && p.ids.length > 0 && p.ids.length <= 100 && new Set(p.ids).size === p.ids.length && p.ids.every(id => text(id)), "Selección de cotizaciones inválida (hasta 100 por lote).");
      reading = true; ownsRead = true;
      const instruments = {}, catalog = new Map(c.ss.securities.map(s => [s?.id, s]));
      if (!c.connected) {
        p.ids.forEach(id => { instruments[id] = { issue: "Mercado desconectado." }; });
      } else {
        check(typeof c.ms.dmaWebSocket?.addSubscription === "function", "Las suscripciones de mercado todavía no están disponibles.");
        const fresh = p.ids.filter(id => descriptor(catalog.get(id)) && !subscribed.has(id));
        if (fresh.length) {
          c.ms.dmaWebSocket.addSubscription("md", fresh.map(id => "md." + id));
          const priced = fresh.filter(id => !descriptor(catalog.get(id)).monitorOnly);
          if (priced.length) c.ms.dmaWebSocket.addSubscription("book", priced.map(id => "book." + id));
          fresh.forEach(id => subscribed.add(id));
        }
        for (const id of p.ids) {
          current(op);
          if (!descriptor(catalog.get(id))) { instruments[id] = { issue: "Instrumento no disponible en el catálogo." }; continue; }
          const s = await lookup(c.ss, id); current(op);
          instruments[id] = s?.id === id && descriptor(s) ? quote(s) : { issue: "Instrumento no disponible en el catálogo." };
        }
      }
      current(op); reply({ result: { contextId: c.contextId, instruments } });
    } catch (error) { reply({ error: error instanceof ReadError ? error.message : "No se pudo leer el mercado de ratios. Volvé a intentarlo." }); }
    finally { if (ownsRead) reading = false; }
  });
  window.__chuchotrizRatioOperations = { attach(next) { if (text(next) && channels.size < 8) channels.add(next); } };
})();
