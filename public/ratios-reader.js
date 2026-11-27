// Scoped dashboard integration and published market prices only. No execution capabilities.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizRatiosReader) { window.__chuchotrizRatiosReader.attach(channel); return; }
  const TYPE = "ChuchoTrizRatiosWidget", KEY = "chuchotrizRatios";
  const DOLLAR_TYPE = "ChuchoTrizIntradayDollarWidget", DOLLAR_KEY = "chuchotrizIntradayDollar";
  const DAY = 86400000, HISTORY_DAYS = 7;
  const DEFAULT_PAIRS = [["AL30", "AL30D"], ["AL30", "AL30C"], ["AL30D", "AL30C"], ["GD30", "AL30"],
    ["BMA", "GGAL"], ["ALUA", "TXAR"], ["PESOS - 7D", "PESOS - 1D"],
    ["AL30", "AL30D", "DLR/SPOT"], ["AL30", "AL30C", "DLR/SPOT"]];
  const channels = new Set([channel]), retired = new Set(), subscriptions = new Set(), sequences = new Map(), patched = new Map();
  const legacyDollarPairs = new WeakMap();
  let identity, revision = 0, writing = false;
  const intradayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });
  const intradayHistory = new Map(), bookHistory = new Map(), intradaySubscriptions = new Set(), intradaySequences = new Map();
  let intradayScope, intradayConnection, intradayRevision = 0;
  const dailyHistory = new Map(), DAILY_LOOKBACK = 90 * DAY, DAILY_MAX_LOOKBACK = 365 * DAY, DAILY_MAX_RANGE = 366 * DAY;
  let dailyScope;
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const short = (s, limit = 240) => typeof s === "string" && s.length > 0 && s.length <= limit && !/[\u0000-\u001f\u007f]/.test(s);
  const clean = (s, limit = 100) => typeof s === "string" ? s.slice(0, limit) : "";
  const descriptor = i => ({ id: i.id, symbol: clean(i.symbol), market: clean(i.market), currency: clean(i.currency), settlement: clean(i.settlement), ...(i.monitorOnly === true ? { monitorOnly: true } : {}) });
  const tickerKey = s => s.replace(/\(\s*CI\s*\)/gi, " CI ").trim().replace(/\s+/g, " ").toLocaleUpperCase();
  const ownConfig = w => w?.component === TYPE && [1, 2, 3].includes(w.settings?.[KEY]?.schema) && short(w.settings[KEY].id) && Array.isArray(w.settings[KEY].pairs) && w.settings[KEY].pairs.length <= 50 ? w.settings[KEY] : undefined;
  const dollarSelection = cfg => cfg && ["MEP", "CCL"].includes(cfg.kind) && ["AL30", "GD30"].includes(cfg.bond) && ["24h", "CI"].includes(cfg.term);
  function dollarConfig(w) {
    const cfg = w?.settings?.[DOLLAR_KEY];
    if (w?.component !== DOLLAR_TYPE || ![1, 2, 3].includes(cfg?.schema) || !short(cfg.id) ||
      !Number.isSafeInteger(cfg.revision) || cfg.revision < 0) return;
    const custom = cfg.schema === 3;
    if (custom ? !short(cfg.a?.id) || !short(cfg.b?.id) || cfg.a.id === cfg.b.id : !dollarSelection(cfg)) return;
    if (cfg.c === undefined ? cfg.schema === 2 || cfg.cDivisor !== undefined
      : cfg.schema === 1 || !short(cfg.c?.id) || cfg.cDivisor !== undefined && cfg.cDivisor !== 100) return;
    return { schema: cfg.schema, id: cfg.id, revision: cfg.revision,
      ...(custom ? { a: descriptor(cfg.a), b: descriptor(cfg.b) } : { kind: cfg.kind, bond: cfg.bond, term: cfg.term }),
      ...(cfg.c ? { c: descriptor(cfg.c) } : {}), ...(cfg.cDivisor === 100 ? { cDivisor: 100 } : {}) };
  }
  const ownsWidget = w => ownConfig(w) || dollarConfig(w);
  const COLUMN_KEYS = ["lastA", "lastB", "referenceC"];
  function columnsOf(w) {
    const stored = w.settings?.chuchotrizRatiosColumns;
    if (stored === undefined) return { revision: 0, visible: { lastA: true, lastB: true, referenceC: true } };
    if (!stored || !Number.isSafeInteger(stored.revision) || stored.revision < 0 || COLUMN_KEYS.some(key => typeof stored.visible?.[key] !== "boolean")) throw Error("Configuración de columnas de Ratios inválida.");
    return { revision: stored.revision, visible: Object.fromEntries(COLUMN_KEYS.map(key => [key, stored.visible[key]])) };
  }
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
    if (sec?.id === "rx_DDF_DLR_SPOT" && sec.marketId === "rx" && !sec.isProduct && !sec.isPortfolio && sec.currency === "ARS") {
      return { id: sec.id, symbol: "DLR/SPOT", market: "rx", currency: "ARS", settlement: "Referencia", monitorOnly: true };
    }
    if (!sec || sec.isProduct || sec.isPortfolio || !short(sec.id) || !short(sec.symbolStr || sec.symbol, 100)) return;
    if (sec.marketId === "rx" && ["FXXXSX", "FXXXXX"].includes(sec.cfiCode) && short(sec.currency)) {
      return { id: sec.id, symbol: clean(sec.symbolStr || sec.symbol), market: "rx", currency: sec.currency, settlement: "Futuro", monitorOnly: true };
    }
    return { id: sec.id, symbol: clean(sec.symbolStr || sec.symbol), market: clean(sec.marketId), currency: clean(sec.currency), settlement: clean(sec.settlementType) };
  }
  function byId(c, id) {
    if (!short(id)) throw Error("Instrumento inválido.");
    const sec = c.ss.securities.find(s => s?.id === id);
    if (!instrument(sec)) throw Error("El instrumento ya no está disponible en el catálogo de Matriz.");
    return sec;
  }
  function dollarPair(securities, { kind, bond, term }) {
    const suffix = term === "CI" ? " CI" : "";
    const settlement = term === "CI" ? "1" : "2";
    const bSymbol = bond + (kind === "MEP" ? "D" : "C") + suffix;
    const aMatches = new Map(), bMatches = new Map();
    for (const security of securities) {
      if (security?.marketId !== "bm" || String(security.settlementType) !== settlement) continue;
      const rawSymbol = security.symbolStr || security.symbol;
      if (!short(rawSymbol, 100)) continue;
      const symbol = tickerKey(rawSymbol);
      if (symbol !== bond + suffix && symbol !== bSymbol) continue;
      const item = instrument(security);
      if (!item) continue;
      if (symbol === bond + suffix && item.currency === "ARS") aMatches.set(item.id, item);
      if (symbol === bSymbol && (item.currency === "USD" || kind === "CCL" && item.currency === "EXT")) bMatches.set(item.id, item);
    }
    if (aMatches.size === 1 && bMatches.size === 1) return { a: aMatches.values().next().value, b: bMatches.values().next().value };
  }
  function initialPairs(c) {
    const wanted = new Set(DEFAULT_PAIRS.flat()), matches = new Map(), missing = [];
    for (const sec of c.ss.securities) {
      if (sec?.marketId !== "bm" && sec?.id !== "rx_DDF_DLR_SPOT") continue;
      const item = instrument(sec);
      if (!item) continue;
      const symbol = tickerKey(item.symbol);
      if (!wanted.has(symbol) || symbol === "DLR/SPOT" && (item.id !== "rx_DDF_DLR_SPOT" || !item.monitorOnly)) continue;
      if (!matches.has(symbol)) matches.set(symbol, new Map());
      matches.get(symbol).set(item.id, item);
    }
    const pairs = DEFAULT_PAIRS.flatMap(([aSymbol, bSymbol, cSymbol]) => {
      const aMatches = matches.get(aSymbol), bMatches = matches.get(bSymbol), cMatches = cSymbol ? matches.get(cSymbol) : undefined;
      const label = cSymbol ? `(${aSymbol}/${bSymbol}) / ${cSymbol}` : `${aSymbol}/${bSymbol}`;
      if (aMatches?.size !== 1 || bMatches?.size !== 1 || cSymbol && cMatches?.size !== 1) { missing.push(label); return []; }
      const a = aMatches.values().next().value, b = bMatches.values().next().value;
      if (a.id === b.id) { missing.push(`${aSymbol}/${bSymbol}`); return []; }
      return [{ id: crypto.randomUUID(), a, b, ...(cSymbol ? { c: cMatches.values().next().value } : {}), format: cSymbol || a.currency && a.currency === b.currency ? "percent" : "number" }];
    });
    return { pairs, missing };
  }
  function configOf(w) {
    const cfg = ownConfig(w);
    if (!cfg || !Number.isSafeInteger(cfg.revision) || cfg.revision < 0 || cfg.pairs.some(p => !short(p?.id) || !short(p?.a?.id) || !short(p?.b?.id))) throw Error("Configuración de Ratios inválida o de otra versión.");
    if (cfg.pairs.some(p => p.c !== undefined && (cfg.schema < 2 || !short(p.c?.id)) ||
      p.cDivisor !== undefined && (cfg.schema !== 3 || !p.c || p.cDivisor !== 100))) throw Error("Referencia de ratio inválida.");
    if (cfg.pairs.some(p => p.format !== undefined && !["number", "percent"].includes(p.format))) throw Error("Formato de ratio no compatible.");
    return { schema: cfg.schema, id: cfg.id, revision: cfg.revision, pairs: cfg.pairs.map(p => ({ id: p.id, format: p.format || "number",
      a: descriptor(p.a), b: descriptor(p.b), ...(p.c ? { c: descriptor(p.c) } : {}),
      ...(p.cDivisor === 100 ? { cDivisor: p.cDivisor } : {}) })) };
  }
  function timestamp(raw) {
    const value = raw instanceof Date ? raw.getTime() : typeof raw === "string" ? Date.parse(raw) : NaN;
    return finite(value) && value <= Date.now() ? value : undefined;
  }
  function dailyDate(raw) {
    const at = timestamp(raw);
    // Matriz's daily bars are labeled at UTC midnight. Other timestamps
    // identify the Argentina market day in which the trade took place.
    return at === undefined || at % DAY === 0 ? at : Date.parse(intradayDate.format(at));
  }
  function dailyMarket(c) {
    const today = Date.parse(intradayDate.format(Date.now()));
    const store = c.ms.seriesStore;
    const scope = [c.ms, c.ss, c.ms.profileStore?.activeAccount, store, today];
    if (!dailyScope || scope.some((value, i) => value !== dailyScope[i])) {
      dailyScope = scope;
      dailyHistory.clear();
    }
    return { store, today, scope: dailyScope };
  }
  function readDailySeries(store, id, from, to, refresh) {
    const key = JSON.stringify([id, from, to]);
    const cached = dailyHistory.get(key);
    if (cached && (cached.pending || !refresh && cached.until > Date.now())) return cached.result;
    const entry = { pending: true, until: 0 };
    const found = new Map();
    let timer, expired = false;
    const query = async () => {
      if (typeof store?.getDailySeries !== "function") return "Matriz no ofrece cierres diarios";
      let end = to;
      for (let page = 0; page < 4; page++) {
        const response = await store.getDailySeries(id, from / 1000, (end + DAY) / 1000 - 1);
        if (expired) return;
        if (!Array.isArray(response?.series)) return "Respuesta de cierres diarios inválida";
        let earliest;
        for (const point of response.series) {
          const day = dailyDate(point?.date);
          if (day === undefined || day < from || day > end) continue;
          earliest = Math.min(day, earliest ?? day);
          if (finite(point.close) && !found.has(day)) found.set(day, point.close);
        }
        const next = dailyDate(response.nextTime);
        if (next === undefined || next < from || next > end) return;
        end = Math.min(next, (earliest ?? end) - DAY);
        if (end < from) return;
      }
      return "Matriz devolvió un histórico diario incompleto";
    };
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { expired = true; resolve("Matriz no respondió a tiempo al pedir los cierres diarios"); }, 17000);
    });
    entry.result = Promise.race([query(), timeout]).catch(error => {
      const status = error?.response?.status ?? error?.status;
      return Number.isInteger(status) ? `Histórico diario no disponible (HTTP ${status})` : "No se pudo cargar el histórico diario";
    }).then(issue => {
      const points = [...found].sort((a, b) => a[0] - b[0]).map(([day, value]) => ({ day, value }));
      entry.until = Date.now() + (issue || !points.length ? 30000 : 300000);
      return { points, ...(issue ? { issue } : {}) };
    }).finally(() => { clearTimeout(timer); entry.pending = false; });
    if (dailyHistory.size >= 120) dailyHistory.delete(dailyHistory.keys().next().value);
    dailyHistory.set(key, entry);
    return entry.result;
  }
  function dailyInstruments(c, params) {
    const d = selected(c, params);
    if (!short(params.widgetId) || !short(params.pairId)) throw Error("Fila de Ratios inválida.");
    const widget = d.layout.find(w => ownConfig(w)?.id === params.widgetId);
    const pair = widget && configOf(widget).pairs.find(item => item.id === params.pairId);
    if (!pair) throw Error("La fila de Ratios ya no está disponible.");
    return [...new Set([pair.a.id, pair.b.id, ...(pair.c ? [pair.c.id] : [])])];
  }
  async function ratioDailyHistory(c, params) {
    const ids = dailyInstruments(c, params);
    const { store, today, scope } = dailyMarket(c);
    const { from, to } = params;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from % DAY || to % DAY ||
      from < DAILY_LOOKBACK || to >= today || from > to || to - from > DAILY_MAX_RANGE) throw Error("Rango de cierres diarios inválido.");
    const older = params.older === true;
    const start = older ? Math.max(0, from - DAILY_MAX_LOOKBACK) : from - DAILY_LOOKBACK;
    const end = older ? from - DAILY_LOOKBACK - DAY : to;
    if (end < start) return Object.fromEntries(ids.map(id => [id, { points: [] }]));
    const entries = await Promise.all(ids.map(id => c.ss.securities.some(s => s?.id === id && instrument(s))
      ? readDailySeries(store, id, start, end, params.refresh === true)
      : { points: [], issue: "Instrumento no disponible en el catálogo" }));
    const latest = context();
    const currentIds = dailyInstruments(latest, params);
    if (dailyMarket(latest).scope !== scope || currentIds.length !== ids.length || currentIds.some((id, index) => id !== ids[index])) {
      throw Error("Cambió la fila o el contexto de mercado. Volvé a cargar el histórico.");
    }
    return Object.fromEntries(ids.map((id, index) => [id, entries[index]]));
  }
  function currentMarketData(sec, lastSequence) {
    const md = sec.md || {}, seq = md.seq;
    if (finite(seq) && seq < (lastSequence.get(sec.id) ?? -Infinity)) return;
    if (finite(seq)) lastSequence.set(sec.id, seq);
    return md;
  }
  function quote(c, id) {
    const sec = c.ss.securities.find(s => s?.id === id);
    if (!sec) return { issue: "Instrumento no disponible" };
    const md = currentMarketData(sec, sequences);
    if (!md) return { issue: "Esperando datos de mercado actuales" };
    const refAt = timestamp(md.refdStr || md.refd);
    return { last: finite(md.lst) ? md.lst : undefined, reference: finite(md.refp) ? md.refp : undefined,
      tradedAt: timestamp(md.lstdStr || md.lstd), referenceDate: refAt === undefined ? undefined : new Date(refAt).toISOString().slice(0, 10) };
  }
  function intradayMarket(ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every(id => short(id)) || new Set(ids).size !== ids.length) throw Error("Instrumentos intradiarios inválidos.");
    const ms = window.mainStore, ss = ms?.securityStore;
    if (!Array.isArray(ss?.securities)) throw Error("Esperando el catálogo de Matriz.");
    const now = Date.now(), start = Date.parse(intradayDate.format(now) + "T00:00:00-03:00");
    const scope = [ms, ss, ms.profileStore?.activeAccount, ms.seriesStore, start];
    if (!intradayScope || scope.some((value, i) => value !== intradayScope[i])) {
      intradayScope = scope; intradayRevision++; intradayHistory.clear(); bookHistory.clear(); intradaySubscriptions.clear(); intradaySequences.clear();
    }
    const connected = !!ms.webSocketConnectionStatus;
    const connection = [ms.dmaWebSocket, connected];
    if (!intradayConnection || connection.some((value, i) => value !== intradayConnection[i])) {
      intradayConnection = connection; intradaySubscriptions.clear(); intradaySequences.clear();
    }
    const securities = ids.map(id => ss.securities.find(s => s?.id === id && instrument(s)));
    return { ms, now, start, connected, securities, revision: intradayRevision };
  }
  function intradayQuotes(ids) {
    const { ms, connected, securities, revision, start } = intradayMarket(ids);
    const available = securities.filter(Boolean);
    const market = { revision, start, connected, available: available.map(sec => sec.id) };
    if (!connected) return { ...market, points: {} };
    const fresh = available.filter(s => !intradaySubscriptions.has(s.id));
    if (fresh.length) {
      try {
        ms.dmaWebSocket.addSubscription("md", fresh.map(s => "md." + s.id));
      } catch {
        return { ...market, points: {}, issue: "Suscripciones de mercado no disponibles." };
      }
      fresh.forEach(s => intradaySubscriptions.add(s.id));
    }
    const points = available.flatMap(s => {
      const md = currentMarketData(s, intradaySequences), at = timestamp(md?.lstdStr || md?.lstd);
      return finite(at) && at >= start && finite(md?.lst) ? [[s.id, { at, value: md.lst }]] : [];
    });
    return { ...market, points: Object.fromEntries(points) };
  }
  function readIntradaySeries(market, id, { refresh = false, todayOnly = false } = {}) {
    const cache = todayOnly ? bookHistory : intradayHistory;
    const cached = cache.get(id);
    if (cached && (cached.pending || !refresh && cached.until > market.now)) return cached.result;
    const entry = { until: market.now + (todayOnly ? 30000 : 20000), pending: true };
    entry.result = Promise.resolve().then(async () => {
      let timer;
      try {
        const store = market.ms.seriesStore;
        const range = !todayOnly && typeof store?.getIntradaySeries === "function";
        if (!range && typeof store?.getIntradayTodaySeries !== "function") return { points: [], issue: "Histórico no disponible en Matriz" };
        const since = range ? market.start - (HISTORY_DAYS - 1) * DAY : market.start;
        const request = range ? store.getIntradaySeries(id, since / 1000, Math.ceil(market.now / 1000), "1") : store.getIntradayTodaySeries(id);
        const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), 17000); });
        const data = await Promise.race([request, timeout]);
        if (data === null) return { points: [], issue: "Matriz no respondió a tiempo al pedir el histórico" };
        if (!Array.isArray(data?.series)) return { points: [], issue: "Respuesta de histórico inválida" };
        const points = data.series.flatMap(point => {
          const at = timestamp(point?.date), value = point?.close;
          if (!finite(at) || at < since || !finite(value)) return [];
          const provisional = Math.floor(at / 60000) === Math.floor(market.now / 60000);
          return [{ at, value, ...(provisional ? { provisional: true } : {}) }];
        });
        if (points.length && !todayOnly) entry.until = Date.now() + 60000;
        return { points, issue: points.length || todayOnly ? undefined : range ? `Sin histórico intradiario en los últimos ${HISTORY_DAYS} días` : "Sin histórico de la rueda actual" };
      } catch (error) {
        const status = error?.response?.status ?? error?.status;
        return { points: [], issue: Number.isInteger(status) ? `Histórico no disponible (HTTP ${status})` : "No se pudo cargar el histórico" };
      } finally { clearTimeout(timer); }
    }).finally(() => { entry.pending = false; });
    if (cache.size >= 120) cache.delete(cache.keys().next().value);
    cache.set(id, entry);
    return entry.result;
  }
  async function bookIntraday(id) {
    const market = intradayMarket([id]);
    const [security] = market.securities;
    if (!security) throw Error("El instrumento del book no está disponible en Matriz.");
    // The native detail panel uses today's minute closes and the instrument's settlement or previous close.
    const { points, issue } = await readIntradaySeries(market, id, { todayOnly: true });
    if (intradayMarket([id]).revision !== market.revision) throw Error("Cambió el contexto de mercado.");
    if (issue) throw Error(issue);
    const closes = [...new Map(points.map(point => [point.at, point])).values()].sort((a, b) => a.at - b.at);
    const latest = closes.at(-1);
    const md = security.md;
    const lastAt = timestamp(md?.lstdStr || md?.lstd);
    if (lastAt >= market.start && finite(md?.lst)) {
      const trade = { at: lastAt, value: md.lst };
      if (!latest || lastAt > latest.at) closes.push(trade);
      else if (lastAt === latest.at && latest.provisional) closes[closes.length - 1] = trade;
    }
    const reference = security.settlementOrClose;
    return { points: closes.map(({ at, value }) => ({ at, value })), reference: finite(reference) ? reference : undefined };
  }
  function state(visibleWidgetIds) {
    const c = context(), connected = !!c.ms.webSocketConnectionStatus;
    if (!c.d) return { context: c.revision, canAdd: false, connected, widgets: [], quotes: {}, issue: "Abrí o creá un dashboard de Matriz para agregar Ratios." };
    const owned = c.d.layout.filter(ownsWidget);
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
    for (const w of owned) {
      const slot = document.querySelector(".DashboardGridItem-" + CSS.escape(w.key));
      const id = ownsWidget(w).id;
      if (slot && slot.dataset.ctRatiosSlot !== id) slot.dataset.ctRatiosSlot = id;
    }
    const widgets = owned.filter(ownConfig).map(w => {
      const config = configOf(w);
      const missing = w.settings.chuchotrizRatiosInitialMissing;
      return { config, width: w.w, height: w.h, columns: columnsOf(w), issue: Array.isArray(missing) && missing.length && missing.length <= DEFAULT_PAIRS.length && missing.every(p => short(p))
        ? "No se pudieron cargar estos pares iniciales: " + missing.join(", ") + ". Agregalos manualmente cuando estén disponibles." : undefined };
    });
    const visible = visibleWidgetIds === undefined ? undefined : new Set(visibleWidgetIds);
    const dollarWidgets = owned.filter(dollarConfig).map(w => {
      const config = dollarConfig(w);
      let pair;
      if (config.schema === 3) pair = { a: config.a, b: config.b };
      else if (!visible || visible.has(config.id)) {
        pair = dollarPair(c.ss.securities, config);
        legacyDollarPairs.set(w, { context: c.revision, revision: config.revision, pair });
      } else {
        const cached = legacyDollarPairs.get(w);
        if (cached?.context === c.revision && cached.revision === config.revision) pair = cached.pair;
      }
      return { config, width: w.w, height: w.h, pair: pair && { ...pair, c: config.c, cDivisor: config.cDivisor }, issue: pair ? undefined : "Elegí los instrumentos A y B para mostrar el intradiario." };
    });
    const active = new Set(), requested = new Set();
    for (const { config } of widgets) {
      const include = !visible || visible.has(config.id);
      for (const { a, b, c } of config.pairs) {
        for (const id of c ? [a.id, b.id, c.id] : [a.id, b.id]) {
          active.add(id);
          if (include) requested.add(id);
        }
      }
    }
    const ids = [...requested];
    // Track only this dashboard's active instruments. Native subscriptions can
    // be shared with other widgets, so never cancel them when a ratio is removed.
    for (const id of subscriptions) if (!active.has(id)) subscriptions.delete(id);
    for (const id of sequences.keys()) if (!active.has(id)) sequences.delete(id);
    if (connected && ids.length) {
      if (typeof c.ms.dmaWebSocket?.addSubscription !== "function") throw Error("Suscripciones de mercado no disponibles.");
      const fresh = ids.filter(id => !subscriptions.has(id) && c.ss.securities.some(s => s.id === id));
      // A panel supports 50 pairs and several panels may coexist. Send bounded
      // batches without imposing a cumulative limit that could hide all quotes.
      for (let offset = 0; offset < fresh.length; offset += 100) {
        const batch = fresh.slice(offset, offset + 100);
        c.ms.dmaWebSocket.addSubscription("md", batch.map(id => "md." + id));
        batch.forEach(id => subscriptions.add(id));
      }
    }
    return { context: c.revision, dashboardId: c.d.id, canAdd: !finite(c.ds.widgetsLimit) || c.d.layout.length < c.ds.widgetsLimit,
      connected, widgets, dollarWidgets, quotes: connected ? Object.fromEntries(ids.map(id => [id, quote(c, id)])) : {}, issue: connected ? undefined : "Mercado desconectado. Esperando reconexión de Matriz." };
  }
  function assertCurrent(op) {
    if (!channels.has(op.channel) || retired.has(op.id) || Date.now() > op.deadline || context().revision !== op.context) throw Error("Cambió el dashboard o la lectura fue retirada. Volvé a intentarlo.");
  }
  function selected(c, params) {
    if (!c.d || params.context !== c.revision || params.dashboardId !== c.d.id) throw Error("Cambió el dashboard. Volvé a intentarlo.");
    return c.d;
  }
  const delay = ms => new Promise(resolve => setTimeout(() => resolve(), ms));
  const savedSignature = d => JSON.stringify(d.layout.filter(ownsWidget).map(w => {
    const dollar = dollarConfig(w);
    return { config: dollar || configOf(w), columns: dollar ? undefined : columnsOf(w), x: w.x, y: w.y, width: w.w, height: w.h };
  }).sort((a, b) => a.config.id.localeCompare(b.config.id)));
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
  function checkDollarResize(d, widget, width, height) {
    if (!(d.width > 0 && d.cols > 0 && d.rowHeight > 0)) return;
    const unit = d.width / d.cols, row = d.rowHeight;
    const left = widget.x * unit, top = widget.y * row;
    const expandsOverlap = other => {
      if (other === widget) return false;
      const x = other.x * unit, y = other.y * row;
      const sharedLeft = Math.max(left, x), sharedTop = Math.max(top, y);
      const right = Math.min(left + width, x + other.w), bottom = Math.min(top + height, y + other.h);
      return right > sharedLeft && bottom > sharedTop &&
        (right > Math.min(left + widget.w, x + other.w) || bottom > Math.min(top + widget.h, y + other.h));
    };
    if (width > Math.max(widget.w, Math.floor(d.width - left)) ||
      d.layout.some(expandsOverlap)) {
      throw Error("No hay espacio para ese tamaño. Mové el widget o reducí el tamaño.");
    }
  }
  async function mutate(method, params, op) {
    const c = context(), d = selected(c, params);
    assertCurrent(op);
    if (method === "ratiosAdd" || method === "dollarAdd") {
      if (finite(c.ds.widgetsLimit) && d.layout.length >= c.ds.widgetsLimit) throw Error("Se alcanzó el límite de widgets de este dashboard.");
      if (!(d.width > 0 && d.cols > 0 && d.rowHeight > 0)) throw Error("Esperando las dimensiones del dashboard.");
      const isDollar = method === "dollarAdd";
      const width = Math.min(isDollar ? 480 : 560, Math.max(360, d.width - 20)), height = isDollar ? 350 : 300;
      const defaults = isDollar ? undefined : initialPairs(c);
      const identity = { id: crypto.randomUUID(), revision: 0 };
      const settings = defaults
        ? { [KEY]: { ...identity, schema: defaults.pairs.some(p => p.c) ? 2 : 1, pairs: defaults.pairs }, chuchotrizRatiosInitialMissing: defaults.missing }
        : { [DOLLAR_KEY]: { ...identity, schema: 1, kind: "MEP", bond: "AL30", term: "24h" } };
      const widget = c.ds.createDashboard({ id: d.id, name: d.name, layout: [{
        component: isDollar ? DOLLAR_TYPE : TYPE, ...position(c, width, height), w: width, h: height,
        settings: { ...settings, chuchotrizRatiosSize: { width, height } }, selectionCriteria: { securities: [] },
      }] }).layout[0];
      widget.dashboard = d; preserveSizes(d); d.addWidget(widget);
    } else {
      const configFor = method === "dollarEdit" ? dollarConfig : ["ratiosRemove", "ratiosResize"].includes(method) ? ownsWidget : ownConfig;
      const widget = d.layout.find(w => configFor(w)?.id === params.widgetId);
      if (!widget) throw Error("El widget ya no está en este dashboard.");
      const cfg = dollarConfig(widget) || configOf(widget);
      if (params.revision !== cfg.revision) throw Error("El widget cambió mientras lo editabas. Revisá los datos y volvé a intentar.");
      if (method === "ratiosRemove") {
        // Native removeWidget groups by security: empty widgets share that value.
        // Remove this exact instance, without touching any other empty widget.
        d.layout = d.layout.filter(w => w !== widget); d.widgetsDicts.delete(widget.key);
      } else if (method === "dollarEdit") {
        if (cfg.revision === Number.MAX_SAFE_INTEGER) throw Error("Selección de dólar intradiario inválida.");
        const changingPair = params.a !== undefined || params.b !== undefined;
        const keepReference = changingPair && !Object.hasOwn(params, "c") && !Object.hasOwn(params, "cDivisor");
        const referenceId = keepReference ? cfg.c?.id : params.c, divisor = keepReference ? cfg.cDivisor : params.cDivisor;
        if (divisor !== undefined && (referenceId === undefined || divisor !== 100)) throw Error("Divisor inválido para la referencia C.");
        const reference = referenceId === undefined ? undefined : cfg.c?.id === referenceId ? cfg.c : instrument(byId(c, referenceId));
        let legs;
        if (changingPair) {
          if (!short(params.a) || !short(params.b) || params.a === params.b) throw Error("Elegí dos instrumentos diferentes.");
          const existing = [cfg.a, cfg.b];
          const resolve = id => instrument(c.ss.securities.find(s => s?.id === id)) || existing.find(i => i?.id === id) || instrument(byId(c, id));
          legs = { a: resolve(params.a), b: resolve(params.b) };
        } else if (cfg.schema === 3) {
          if (["kind", "bond", "term"].some(key => params[key] !== undefined)) throw Error("Recargá Matriz para editar los instrumentos de este widget.");
          legs = { a: cfg.a, b: cfg.b };
        } else {
          const selection = ["kind", "bond", "term"].some(key => params[key] !== undefined) ? params : cfg;
          if (!dollarSelection(selection)) throw Error("Selección de dólar intradiario inválida.");
          legs = { kind: selection.kind, bond: selection.bond, term: selection.term };
        }
        widget.settings = { ...widget.settings, [DOLLAR_KEY]: {
          schema: legs.a ? 3 : reference ? 2 : 1, id: cfg.id, revision: cfg.revision + 1, ...legs,
          ...(reference ? { c: reference } : {}), ...(divisor === 100 ? { cDivisor: 100 } : {}),
        } };
      } else if (method === "ratiosResize") {
        if (!finite(params.width) || !finite(params.height)) throw Error("Tamaño inválido.");
        const width = Math.round(Math.max(360, Math.min(2200, params.width)));
        const height = Math.round(Math.max(180, Math.min(1400, params.height)));
        if (dollarConfig(widget)) checkDollarResize(d, widget, width, height);
        widget.w = width;
        widget.h = height;
        widget.settings = { ...widget.settings, chuchotrizRatiosSize: { width: widget.w, height: widget.h } };
        d.layout = [...d.layout];
      } else if (method === "ratiosColumns") {
        const previous = columnsOf(widget), visible = params.columns;
        if (params.columnsRevision !== previous.revision) throw Error("Las columnas cambiaron. Revisá la configuración e intentá nuevamente.");
        if (!visible || Array.isArray(visible) || Object.keys(visible).length !== COLUMN_KEYS.length || COLUMN_KEYS.some(key => typeof visible[key] !== "boolean") || previous.revision === Number.MAX_SAFE_INTEGER) throw Error("Elegí las columnas visibles de Ratios.");
        widget.settings = { ...widget.settings, chuchotrizRatiosColumns: { revision: previous.revision + 1, visible: Object.fromEntries(COLUMN_KEYS.map(key => [key, visible[key]])) } };
      } else if (method === "ratiosEdit") {
        if (cfg.schema === 3 && params.schema !== 3 ||
          cfg.schema === 2 && ![2, 3].includes(params.schema)) throw Error("Esta comparación requiere la versión actual de Ratios. Recargá Matriz antes de editarla.");
        if (!Array.isArray(params.pairs) || params.pairs.length > 50) throw Error("Podés agregar hasta 50 ratios por widget.");
        const ids = new Set(), pairs = params.pairs.map(p => {
          if (!short(p?.id) || ids.has(p.id) || p.a === p.b) throw Error("Elegí instrumentos diferentes y ratios válidos.");
          ids.add(p.id);
          const previous = cfg.pairs.find(old => old.id === p.id);
          const resolve = id => {
            const existing = previous && [previous.a, previous.b, previous.c].find(i => i?.id === id);
            // Expired instruments can disappear from Matriz's catalogue. Preserve
            // their saved identity so another row can still be edited or removed.
            const live = c.ss.securities.find(s => s?.id === id);
            return instrument(live) || existing || instrument(byId(c, id));
          };
          const format = p.format ?? previous?.format ?? "number";
          if (!["number", "percent"].includes(format)) throw Error("Elegí formato Número o Porcentaje.");
          if (p.cDivisor !== undefined && (params.schema !== 3 || p.c === undefined || p.cDivisor !== 100)) throw Error("Divisor inválido para la referencia C.");
          return { id: p.id, a: resolve(p.a), b: resolve(p.b), ...(p.c !== undefined ? { c: resolve(p.c) } : {}),
            ...(p.cDivisor === 100 ? { cDivisor: p.cDivisor } : {}), format };
        });
        if (new Set(pairs.map(p => JSON.stringify([p.a.id, p.b.id, p.c?.id ?? null, p.cDivisor ?? 1]))).size !== pairs.length) throw Error("Ese par ya está agregado en el widget.");
        const schema = pairs.some(p => p.cDivisor) ? 3 : pairs.some(p => p.c) ? 2 : 1;
        widget.settings = { ...widget.settings, [KEY]: { ...cfg, schema, revision: cfg.revision + 1, pairs }, chuchotrizRatiosInitialMissing: [] };
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
      if (msg.method === "ratiosState") {
        const { visibleWidgetIds } = params;
        if (visibleWidgetIds !== undefined && (!Array.isArray(visibleWidgetIds) || !visibleWidgetIds.every(id => short(id)))) throw Error("Widgets visibles inválidos.");
        reply({ result: state(visibleWidgetIds) }); return;
      }
      if (msg.method === "bookIntraday") { reply({ result: await bookIntraday(params.id) }); return; }
      if (msg.method === "ratioIntradayQuotes") { reply({ result: intradayQuotes(params.ids) }); return; }
      if (msg.method === "ratioIntradayHistory") {
        const market = intradayMarket(params.ids);
        const entries = await Promise.all(market.securities.map((s, i) => s
          ? readIntradaySeries(market, s.id, { refresh: params.refresh === true })
          : { points: [], issue: "Instrumento no disponible en el catálogo" }));
        if (intradayMarket(params.ids).revision !== market.revision) throw Error("Cambió el contexto de mercado. Volvé a cargar el histórico.");
        reply({ result: { revision: market.revision, series: Object.fromEntries(params.ids.map((id, i) => [id, entries[i]])) } });
        return;
      }
      const c = context();
      if (msg.method === "ratioDailyHistory") { reply({ result: await ratioDailyHistory(c, params) }); return; }
      if (msg.method === "ratiosSearch") {
        selected(c, params);
        if (typeof params.query !== "string" || params.query.length > 60) throw Error("Búsqueda inválida.");
        const query = tickerKey(params.query).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!query) { reply({ result: [] }); return; }
        const result = c.ss.securities.map(instrument).filter(s => s && (tickerKey(s.symbol).normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(query) || s.id === "rx_DDF_DLR_SPOT" && "DOLAR OFICIAL DOLAR USA DLR/SPOT".includes(query))).sort((a, b) => Number(tickerKey(b.symbol) === query) - Number(tickerKey(a.symbol) === query) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id)).slice(0, 40);
        reply({ result }); return;
      }
      if (!["ratiosAdd", "ratiosEdit", "ratiosRemove", "ratiosResize", "ratiosColumns", "dollarAdd", "dollarEdit"].includes(msg.method)) throw Error("Método no permitido por Ratios.");
      if (writing) throw Error("Hay un cambio guardándose. Esperá a que termine.");
      writing = true; ownsWrite = true;
      const result = await mutate(msg.method, params, { id: msg.id, channel: msg.channel, context: c.revision, deadline: Date.now() + 12000 });
      reply({ result });
    } catch (error) { reply({ error: error instanceof Error ? error.message : "Ratios no disponible." }); }
    finally { if (ownsWrite) writing = false; }
  });
  window.__chuchotrizRatiosReader = { attach(next) { if (short(next) && channels.size < 8) channels.add(next); } };
})();
