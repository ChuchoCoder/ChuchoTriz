// Scoped dashboard integration and published market prices only. No execution capabilities.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizRatiosReader) { window.__chuchotrizRatiosReader.attach(channel); return; }
  const TYPE = "ChuchoTrizRatiosWidget", KEY = "chuchotrizRatios";
  const channels = new Set([channel]), retired = new Set(), subscriptions = new Set(), sequences = new Map(), patched = new Map();
  let identity, revision = 0, writing = false;
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const short = (s, limit = 240) => typeof s === "string" && s.length > 0 && s.length <= limit && !/[\u0000-\u001f\u007f]/.test(s);
  const clean = (s, limit = 100) => typeof s === "string" ? s.slice(0, limit) : "";
  const tickerKey = s => s.replace(/\(\s*CI\s*\)/gi, " CI ").trim().replace(/\s+/g, " ").toLocaleUpperCase();
  const ownConfig = w => w?.component === TYPE && w.settings?.[KEY]?.schema === 1 && short(w.settings[KEY].id) && Array.isArray(w.settings[KEY].pairs) && w.settings[KEY].pairs.length <= 50 ? w.settings[KEY] : undefined;
  function restore(d) {
    const hook = patched.get(d);
    if (hook && d.updateLayout === hook.wrapper) d.updateLayout = hook.original;
    patched.delete(d);
  }
  function preserveSizes(d) {
    if (patched.has(d)) return;
    const original = d.updateLayout;
    const wrapper = function (layout) {
      const keep = layout.flatMap(next => {
        const w = this.widgetsDicts.get(next.i);
        return w && Math.abs(next.w - w.cols()) < 0.00001 && Math.abs(next.h - w.rows()) < 0.00001 ? [{ w, width: w.w, height: w.h }] : [];
      });
      original.call(this, layout);
      // Avoid Matriz's upward rounding twice when unchanged grid sizes round-trip.
      keep.forEach(({ w, width, height }) => { w.w = width; w.h = height; });
    };
    d.updateLayout = wrapper; patched.set(d, { original, wrapper });
  }
  function context() {
    const ms = window.mainStore, ds = ms?.dashboardStore, ss = ms?.securityStore;
    const version = document.body?.innerText.match(/Versi[oó]n:\s*(\S+)/)?.[1];
    if (!["4.23.16", "4.24.1", "4.24.4"].includes(version)) throw Error("Esta versión de Matriz todavía no es compatible con Ratios.");
    if (!ds || !ss || !Array.isArray(ss.securities) || typeof ss.getSecurity !== "function" || typeof ds.createDashboard !== "function" || typeof ds.getDashboard !== "function") throw Error("Esperando el catálogo y los dashboards de Matriz.");
    const d = ds.currentDashboard;
    const next = [ms, ds, ss, d, ms.profileStore?.activeAccount, ms.dmaWebSocket, ms.webSocketConnectionStatus];
    if (!identity || next.some((v, i) => v !== identity[i])) {
      identity = next; revision++; subscriptions.clear(); sequences.clear();
      for (const old of patched.keys()) if (old !== d) restore(old);
    }
    const custom = d && Array.isArray(d.layout) && ds.dashboards?.includes(d) && document.querySelector(".CustomDashboard") && typeof d.addWidget === "function" && typeof d.onSave === "function" && typeof d.widgetsDicts?.get === "function" && typeof d.widgetsDicts?.delete === "function";
    return { ms, ds, ss, d: custom ? d : undefined, revision };
  }
  function instrument(sec) {
    if (!sec || sec.isProduct || sec.isPortfolio || !short(sec.id) || !short(sec.symbolStr || sec.symbol, 100)) return;
    return { id: sec.id, symbol: clean(sec.symbolStr || sec.symbol), market: clean(sec.marketId), currency: clean(sec.currency), settlement: clean(sec.settlementType) };
  }
  function byId(c, id) {
    if (!short(id)) throw Error("Instrumento inválido.");
    const sec = c.ss.securities.find(s => s?.id === id);
    if (!instrument(sec)) throw Error("El instrumento ya no está disponible en el catálogo de Matriz.");
    return sec;
  }
  function configOf(w) {
    const cfg = ownConfig(w);
    if (!cfg || !Number.isSafeInteger(cfg.revision) || cfg.revision < 0 || cfg.pairs.some(p => !short(p?.id) || !short(p?.a?.id) || !short(p?.b?.id))) throw Error("Configuración de Ratios inválida o de otra versión.");
    if (cfg.pairs.some(p => p.format !== undefined && !["number", "percent"].includes(p.format))) throw Error("Formato de ratio no compatible.");
    return { schema: 1, id: cfg.id, revision: cfg.revision, pairs: cfg.pairs.map(p => ({ id: p.id, format: p.format || "number",
      a: { id: p.a.id, symbol: clean(p.a.symbol), market: clean(p.a.market), currency: clean(p.a.currency), settlement: clean(p.a.settlement) },
      b: { id: p.b.id, symbol: clean(p.b.symbol), market: clean(p.b.market), currency: clean(p.b.currency), settlement: clean(p.b.settlement) } })) };
  }
  function timestamp(raw) {
    const value = raw instanceof Date ? raw.getTime() : typeof raw === "string" ? Date.parse(raw) : NaN;
    return finite(value) && value <= Date.now() ? value : undefined;
  }
  function quote(c, id) {
    const sec = c.ss.securities.find(s => s?.id === id);
    if (!sec) return { issue: "Instrumento no disponible" };
    const md = sec.md || {}, seq = md.seq;
    if (finite(seq) && seq < (sequences.get(id) ?? -Infinity)) return { issue: "Esperando datos de mercado actuales" };
    if (finite(seq)) sequences.set(id, seq);
    const refAt = timestamp(md.refdStr || md.refd);
    return { last: finite(md.lst) ? md.lst : undefined, reference: finite(md.refp) ? md.refp : undefined,
      tradedAt: timestamp(md.lstdStr || md.lstd), referenceDate: refAt === undefined ? undefined : new Date(refAt).toISOString().slice(0, 10) };
  }
  function state() {
    const c = context(), connected = !!c.ms.webSocketConnectionStatus;
    if (!c.d) return { context: c.revision, canAdd: false, connected, widgets: [], quotes: {}, issue: "Abrí o creá un dashboard de Matriz para agregar Ratios." };
    const owned = c.d.layout.filter(ownConfig);
    if (owned.length) preserveSizes(c.d); else restore(c.d);
    let corrected = false;
    for (const w of owned) {
      const size = w.settings.chuchotrizRatiosSize;
      // The native grid can round once before the document_end extension starts.
      // Keep our own canonical pixel size without correcting other native widgets.
      if (size && finite(size.width) && finite(size.height) && size.width >= 360 && size.width <= 2200 && size.height >= 180 && size.height <= 1400 && (w.w !== size.width || w.h !== size.height)) {
        w.w = size.width; w.h = size.height; corrected = true;
      }
    }
    if (corrected) c.d.layout = [...c.d.layout];
    const widgets = owned.map(w => {
      const config = configOf(w), slot = document.querySelector(".DashboardGridItem-" + CSS.escape(w.key));
      if (slot) slot.dataset.ctRatiosSlot = config.id;
      return { config, width: w.w, height: w.h };
    });
    const ids = [...new Set(widgets.flatMap(w => w.config.pairs.flatMap(p => [p.a.id, p.b.id])))];
    if (connected && ids.length) {
      if (typeof c.ms.dmaWebSocket?.addSubscription !== "function") throw Error("Suscripciones de mercado no disponibles.");
      const fresh = ids.filter(id => !subscriptions.has(id) && c.ss.securities.some(s => s.id === id));
      if (new Set([...subscriptions, ...fresh]).size > 256) throw Error("Límite de instrumentos leídos alcanzado. Recargá Matriz.");
      if (fresh.length) {
        c.ms.dmaWebSocket.addSubscription("md", fresh.map(id => "md." + id));
        fresh.forEach(id => subscriptions.add(id));
      }
    }
    return { context: c.revision, dashboardId: c.d.id, canAdd: !finite(c.ds.widgetsLimit) || c.d.layout.length < c.ds.widgetsLimit,
      connected, widgets, quotes: connected ? Object.fromEntries(ids.map(id => [id, quote(c, id)])) : {}, issue: connected ? undefined : "Mercado desconectado. Esperando reconexión de Matriz." };
  }
  function assertCurrent(op) {
    if (!channels.has(op.channel) || retired.has(op.id) || Date.now() > op.deadline || context().revision !== op.context) throw Error("Cambió el dashboard o la lectura fue retirada. Volvé a intentarlo.");
  }
  function selected(c, params) {
    if (!c.d || params.context !== c.revision || params.dashboardId !== c.d.id) throw Error("Cambió el dashboard. Volvé a intentarlo.");
    return c.d;
  }
  const delay = ms => new Promise(resolve => setTimeout(() => resolve(), ms));
  const savedSignature = d => JSON.stringify(d.layout.filter(ownConfig).map(w => ({ config: configOf(w), x: w.x, y: w.y, width: w.w, height: w.h })).sort((a, b) => a.config.id.localeCompare(b.config.id)));
  async function verifiedSave(c, op) {
    const expected = savedSignature(c.d);
    c.d.onSave(true);
    for (let i = 0; i < 6; i++) {
      await delay(700); assertCurrent(op);
      let timer;
      try {
        const saved = await Promise.race([c.ds.getDashboard(c.d.id), new Promise((_, reject) => { timer = setTimeout(() => reject(Error("Sin respuesta al comprobar el guardado.")), 3000); })]);
        assertCurrent(op);
        const actual = savedSignature(saved);
        if (actual === expected) return;
      } finally { clearTimeout(timer); }
    }
    throw Error("No se pudo confirmar el guardado. Recargá Matriz para comprobarlo antes de repetir el cambio.");
  }
  function position(c, width, height) {
    const unit = c.d.width / c.d.cols, row = c.d.rowHeight;
    const boxes = c.d.layout.map(w => {
      const slot = document.querySelector(".DashboardGridItem-" + CSS.escape(w.key));
      const rect = slot?.firstElementChild?.getBoundingClientRect();
      return { x: w.x * unit, y: w.y * row, w: Math.max(w.w, rect?.width || 0), h: Math.max(w.h, rect?.height || 0) };
    });
    for (let y = 0; y < 5000; y += row) for (let x = 0; x + width <= c.d.width; x += 50) {
      if (boxes.every(b => x + width + 8 <= b.x || x >= b.x + b.w + 8 || y + height + 8 <= b.y || y >= b.y + b.h + 8)) return { x: Math.ceil(x / unit), y: Math.ceil(y / row) };
    }
    return { x: 0, y: Math.ceil(Math.max(0, ...boxes.map(b => b.y + b.h)) / row) + 1 };
  }
  async function mutate(method, params, op) {
    const c = context(), d = selected(c, params);
    assertCurrent(op);
    if (method === "ratiosAdd") {
      if (finite(c.ds.widgetsLimit) && d.layout.length >= c.ds.widgetsLimit) throw Error("Se alcanzó el límite de widgets de este dashboard.");
      if (!(d.width > 0 && d.cols > 0 && d.rowHeight > 0)) throw Error("Esperando las dimensiones del dashboard.");
      const width = Math.min(560, Math.max(360, d.width - 20)), height = 300;
      const config = { schema: 1, id: crypto.randomUUID(), revision: 0, pairs: [] };
      const widget = c.ds.createDashboard({ id: d.id, name: d.name, layout: [{ component: TYPE, ...position(c, width, height), w: width, h: height, settings: { [KEY]: config, chuchotrizRatiosSize: { width, height } }, selectionCriteria: { securities: [] } }] }).layout[0];
      widget.dashboard = d; preserveSizes(d); d.addWidget(widget);
    } else {
      const widget = d.layout.find(w => ownConfig(w)?.id === params.widgetId);
      if (!widget) throw Error("El widget ya no está en este dashboard.");
      const cfg = configOf(widget);
      if (params.revision !== cfg.revision) throw Error("El widget cambió mientras lo editabas. Revisá los datos y volvé a intentar.");
      if (method === "ratiosRemove") {
        // Native removeWidget groups by security: empty widgets share that value.
        // Remove this exact instance, without touching any other empty widget.
        d.layout = d.layout.filter(w => w !== widget); d.widgetsDicts.delete(widget.key);
      } else if (method === "ratiosResize") {
        if (!finite(params.width) || !finite(params.height)) throw Error("Tamaño inválido.");
        widget.w = Math.round(Math.max(360, Math.min(2200, params.width)));
        widget.h = Math.round(Math.max(180, Math.min(1400, params.height)));
        widget.settings = { ...widget.settings, chuchotrizRatiosSize: { width: widget.w, height: widget.h } };
        d.layout = [...d.layout];
      } else if (method === "ratiosEdit") {
        if (!Array.isArray(params.pairs) || params.pairs.length > 50) throw Error("Podés agregar hasta 50 ratios por widget.");
        const ids = new Set(), pairs = params.pairs.map(p => {
          if (!short(p?.id) || ids.has(p.id) || p.a === p.b) throw Error("Elegí instrumentos diferentes y ratios válidos.");
          ids.add(p.id);
          const previous = cfg.pairs.find(old => old.id === p.id);
          const resolve = id => {
            const existing = previous && [previous.a, previous.b].find(i => i.id === id);
            // Expired instruments can disappear from Matriz's catalogue. Preserve
            // their saved identity so another row can still be edited or removed.
            const live = c.ss.securities.find(s => s?.id === id);
            return instrument(live) || existing || instrument(byId(c, id));
          };
          const format = p.format ?? previous?.format ?? "number";
          if (!["number", "percent"].includes(format)) throw Error("Elegí formato Número o Porcentaje.");
          return { id: p.id, a: resolve(p.a), b: resolve(p.b), format };
        });
        if (new Set(pairs.map(p => JSON.stringify([p.a.id, p.b.id]))).size !== pairs.length) throw Error("Ese par ya está agregado en el widget.");
        widget.settings = { ...widget.settings, [KEY]: { ...cfg, revision: cfg.revision + 1, pairs } };
      } else throw Error("Cambio de Ratios no permitido.");
    }
    await verifiedSave(c, op);
    return state();
  }
  window.addEventListener("message", async event => {
    const msg = event.data;
    if (event.source !== window || !channels.has(msg?.channel)) return;
    if (msg.kind === "detach") {
      channels.delete(msg.channel);
      if (!channels.size) { for (const d of patched.keys()) restore(d); }
      return;
    }
    if (msg.kind === "retire") { if (short(msg.id)) { retired.add(msg.id); if (retired.size > 1000) retired.delete(retired.values().next().value); } return; }
    if (msg.kind !== "request" || !short(msg.id)) return;
    const reply = value => { if (channels.has(msg.channel) && !retired.has(msg.id)) window.postMessage({ channel: msg.channel, kind: "response", id: msg.id, ...value }, location.origin); };
    let ownsWrite = false;
    try {
      const params = msg.params || {};
      if (msg.method === "ratiosState") { reply({ result: state() }); return; }
      const c = context();
      if (msg.method === "ratiosSearch") {
        selected(c, params);
        if (typeof params.query !== "string" || params.query.length > 60) throw Error("Búsqueda inválida.");
        const query = tickerKey(params.query);
        if (!query) { reply({ result: [] }); return; }
        const result = c.ss.securities.map(instrument).filter(s => s && tickerKey(s.symbol).includes(query)).sort((a, b) => Number(tickerKey(b.symbol) === query) - Number(tickerKey(a.symbol) === query) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id)).slice(0, 40);
        reply({ result }); return;
      }
      if (!["ratiosAdd", "ratiosEdit", "ratiosRemove", "ratiosResize"].includes(msg.method)) throw Error("Método no permitido por Ratios.");
      if (writing) throw Error("Hay un cambio guardándose. Esperá a que termine.");
      writing = true; ownsWrite = true;
      const result = await mutate(msg.method, params, { id: msg.id, channel: msg.channel, context: c.revision, deadline: Date.now() + 12000 });
      reply({ result });
    } catch (error) { reply({ error: error instanceof Error ? error.message : "Ratios no disponible." }); }
    finally { if (ownsWrite) writing = false; }
  });
  window.__chuchotrizRatiosReader = { attach(next) { if (short(next) && channels.size < 8) channels.add(next); } };
})();
