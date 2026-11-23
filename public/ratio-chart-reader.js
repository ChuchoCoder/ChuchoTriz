// Only native chart studies and instrument identity. No account or execution access.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  const tasks = new Map();
  let detached = false;
  const validId = id => typeof id === "string" && id.length > 0 && id.length <= 240 && !/[\u0000-\u001f\u007f]/.test(id);
  function current(a, b, c) {
    const url = new URL(location.href);
    const match = /^\/security\/([^/]+)\/?$/.exec(url.pathname);
    try { return !!match && decodeURIComponent(match[1]) === a && url.searchParams.get("ctRatio") === b && (url.searchParams.get("ctRatioC") || undefined) === c; }
    catch { return false; }
  }
  function assertCurrent(task, a, b, c) {
    if (detached || task.cancelled || !current(a, b, c)) throw Error("La apertura del ratio se canceló al cambiar de gráfico.");
  }
  function chartFor(a) {
    const element = document.getElementById("tv_chart_container");
    if (!element) return;
    const key = Object.keys(element).find(name => /^__react(?:Fiber|InternalInstance)/.test(name));
    let fiber = element[key];
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
      const component = fiber.stateNode;
      if (component?.props?.security?.id === a && component.widget) {
        try {
          const chart = component.widget.activeChart();
          if (chart && typeof chart.createStudy === "function" && typeof chart.getAllStudies === "function") return chart;
        } catch { /* The native widget is still initializing. */ }
      }
    }
  }
  function instrument(securities, id) {
    const sec = securities.find(s => s?.id === id && !s.isProduct && !s.isPortfolio);
    if (!sec || typeof sec.symbol !== "string" || !sec.symbol) throw Error("El instrumento del ratio ya no está disponible en Matriz.");
    // The native datafeed resolves an exact symbol, not an instrument ID.
    const matches = securities.filter(s => !s.isProduct && typeof s.symbol === "string" && s.symbol.toUpperCase() === sec.symbol.toUpperCase());
    if (matches.length !== 1 || matches[0].id !== id) throw Error(`Matriz no identifica de forma única ${sec.symbol}; no se agregó el indicador para evitar otra liquidación o mercado.`);
    return sec;
  }
  async function open(task, params) {
    const { a, b, c } = params || {};
    if (!validId(a) || !validId(b) || a === b || c !== undefined && !validId(c)) throw Error("Instrumentos del gráfico de ratio inválidos.");
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      assertCurrent(task, a, b, c);
      const version = document.body?.innerText.match(/Versi[oó]n:\s*(\S+)/)?.[1];
      if (version && !["4.23.16", "4.24.1", "4.24.4"].includes(version)) throw Error("Esta versión de Matriz todavía no es compatible con el gráfico de ratios.");
      const securities = window.mainStore?.securityStore?.securities;
      const chart = chartFor(a);
      if (version && Array.isArray(securities) && securities.length && chart) {
        const first = instrument(securities, a), second = instrument(securities, b), comparison = c ? instrument(securities, c) : second;
        if (chart.symbol() !== first.symbol) {
          await new Promise(resolve => setTimeout(() => resolve(), 100)); continue;
        }
        if (chart.resolution() !== "5") await chart.setResolution("5");
        assertCurrent(task, a, b, c);
        chart.setChartType(1); // Native TradingView enum: candles.
        const series = chart.getSeries();
        series.changePriceScale("new-right");
        series.priceScale().setMode(0); // Normal numeric prices, never percentage/indexed.
        const existing = chart.getAllStudies().find(study => {
          if (study.name !== "Ratio") return false;
          const inputs = chart.getStudyById(study.id).getInputValues();
          return inputs.some(i => i.id === "source" && i.value === "close") && inputs.some(i => i.id === "symbol2" && i.value === second.symbol);
        });
        const added = [];
        try {
          const ratioId = existing?.id ?? await chart.createStudy("Ratio", false, false, { source: "close", symbol2: second.symbol });
          if (ratioId == null) throw Error("Matriz no pudo agregar el indicador Ratio. Revisá el límite de indicadores del gráfico.");
          if (!existing) added.push(ratioId);
          assertCurrent(task, a, b, c);
          const ratio = chart.getStudyById(ratioId), inputs = ratio.getInputValues();
          if (!inputs.some(i => i.id === "source" && i.value === "close") || !inputs.some(i => i.id === "symbol2" && i.value === second.symbol)) throw Error("Matriz no confirmó los instrumentos del indicador Ratio.");
          ratio.setVisible(true); ratio.priceScale().setMode(0);
          const overlay = chart.getAllStudies().find(study => study.name === "Overlay" && chart.getStudyById(study.id).paneIndex() === 0 && chart.getStudyById(study.id).getInputValues().some(i => i.id === "symbol" && i.value === comparison.symbol));
          const overlayId = overlay?.id ?? await chart.createStudy("Overlay", true, false, { symbol: comparison.symbol }, undefined, { priceScale: "new-left" });
          if (overlayId == null) throw Error("Matriz no pudo agregar el instrumento a comparar.");
          if (!overlay) added.push(overlayId);
          assertCurrent(task, a, b, c);
          if (chartFor(a) !== chart || chart.symbol() !== first.symbol) throw Error("El instrumento principal cambió mientras se abría el ratio.");
          const study = chart.getStudyById(overlayId);
          study.setVisible(true);
          if (overlay) study.changePriceScale("new-left");
          const scale = study.priceScale(); scale.setMode(0); scale.setAutoScale(true);
          if (!study.getInputValues().some(i => i.id === "symbol" && i.value === comparison.symbol) || scale.getMode() !== 0 || chart.resolution() !== "5" || chart.chartType() !== 1) throw Error("Matriz no confirmó la comparación en números y velas de 5 minutos.");
          return { a: first.symbolStr || first.symbol, b: second.symbolStr || second.symbol, comparison: comparison.symbolStr || comparison.symbol };
        } catch (error) { added.forEach(id => chart.removeEntity(id)); throw error; }
      }
      await new Promise(resolve => setTimeout(() => resolve(), 100));
    }
    throw Error("El gráfico de Matriz no estuvo listo a tiempo. Esperá a que cargue y pulsá Reintentar.");
  }
  async function receive(event) {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.channel !== channel) return;
    if (msg.kind === "detach") {
      detached = true; tasks.forEach(task => { task.cancelled = true; }); window.removeEventListener("message", receive); return;
    }
    if (msg.kind === "retire") { const task = tasks.get(msg.id); if (task) task.cancelled = true; return; }
    if (detached || msg.kind !== "request" || msg.method !== "ratioChart" || !validId(msg.id) || tasks.size || tasks.has(msg.id)) return;
    const task = { cancelled: false }; tasks.set(msg.id, task);
    try {
      const result = await open(task, msg.params);
      if (!detached && !task.cancelled) window.postMessage({ channel, kind: "response", id: msg.id, result }, location.origin);
    } catch (error) {
      if (!detached && !task.cancelled) window.postMessage({ channel, kind: "response", id: msg.id, error: error instanceof Error ? error.message : "No se pudo abrir el indicador Ratio." }, location.origin);
    } finally { tasks.delete(msg.id); }
  }
  window.addEventListener("message", receive);
})();
