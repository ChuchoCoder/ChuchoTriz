// One-shot import of option quantities for the selected chain.
// Account context and the native report stay inside Matriz.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizOptionsPositionReaderV2) {
    window.__chuchotrizOptionsPositionReaderV2.attach(channel); return;
  }
  const channels = new Set([channel]);
  let active, previousContext, contextId;
  class PositionReadError extends Error {}
  const check = (condition, message) => { if (!condition) throw new PositionReadError(message); };
  function context() {
    const ms = window.mainStore, version = document.body.innerText.match(/Versi[oó]n:\s*([\d.]+)/)?.[1];
    check(["4.24.1", "4.24.4"].includes(version), "Versión de Matriz no verificada para importar posiciones.");
    check(ms?.portfolioStore && ms.securityStore && typeof ms.portfolioStore.getDetailedPositionReport === "function" &&
      typeof ms.profileStore?.activeAccount === "string" && ms.profileStore.activeAccount.length > 0,
    "La posición de Matriz todavía no está disponible.");
    const current = { ms, portfolio: ms.portfolioStore, securities: ms.securityStore, account: ms.profileStore.activeAccount,
      collateral: ms.profileStore.context?.riskDetailedCollateralEnabled, version };
    if (!previousContext || Object.keys(current).some(key => previousContext[key] !== current[key])) {
      previousContext = current; contextId = crypto.randomUUID();
    }
    return { ...current, contextId };
  }
  function assertCurrent(operation) {
    check(channels.has(operation.channel) && !operation.retired && Date.now() <= operation.deadline, "Lectura de posición retirada o fuera de tiempo.");
    const current = context();
    check(Object.keys(operation.context).every(key => current[key] === operation.context[key]), "Cambió la cuenta o el contexto durante la lectura. Volvé a cargar la posición.");
  }
  async function read(params, operation) {
    check(typeof params.storageSalt === "string" && /^[a-f0-9]{64}$/.test(params.storageSalt), "Guardado local de posición no disponible.");
    check(Array.isArray(params.ids) && params.ids.length > 0 && params.ids.length <= 160 &&
      new Set(params.ids).size === params.ids.length && params.ids.every(id => typeof id === "string"),
    "Selección de contratos inválida.");
    const { portfolio, securities, account, collateral } = operation.context;
    // Stable only in this local profile and site. The raw account never leaves Matriz.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([params.storageSalt, location.origin, account])));
    const storageScope = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    assertCurrent(operation);
    // This is the same read-only refresh used by the native Matriz position view.
    const report = await portfolio.getDetailedPositionReport(account, collateral);
    assertCurrent(operation);
    check(report === portfolio.detailedPositionReport && Array.isArray(report?.types) && report.types.length <= 50,
      "El reporte de posición está incompleto.");
    const reportedAt = report.lastCalculation instanceof Date ? report.lastCalculation.getTime() : NaN;
    check(Number.isFinite(reportedAt) && reportedAt > 0, "La fecha del reporte de posición no es válida.");
    const options = securities.options;
    check(Array.isArray(options) && options.length <= 10000, "Catálogo de opciones no disponible.");
    const byFix = new Map(), byId = new Map();
    for (const sec of options) {
      if (typeof sec?.id !== "string" || typeof sec.fixSymbol !== "string") continue;
      check(!byId.has(sec.id) && !byFix.has(sec.fixSymbol), "El catálogo contiene referencias de opción ambiguas.");
      byId.set(sec.id, sec); byFix.set(sec.fixSymbol, sec);
    }
    const selected = new Set(params.ids);
    check(params.ids.every(id => {
      const sec = byId.get(id);
      return sec && /^O[CP]ASPS$/.test(sec.cfiCode) && sec.underlying === params.underlyingId &&
        sec.refData?.maturityDateStr === params.expiration && sec.currency === params.currency &&
        sec.settlementType === params.settlement;
    }), "Los contratos ya no coinciden con la cadena seleccionada.");
    const quantities = new Map();
    let rows = 0;
    for (const group of report.types) {
      if (!["STOCK_OPTION_CALL", "STOCK_OPTION_PUT"].includes(group?.type)) continue;
      check(Array.isArray(group.securitiesDetailed), "Falta el detalle de las opciones.");
      for (const instrument of group.securitiesDetailed) {
        check(Array.isArray(instrument?.detailedPositions), "Falta el detalle de una opción.");
        for (const position of instrument.detailedPositions) {
          check(++rows <= 10000, "El reporte de posiciones supera el límite admitido.");
          const quantity = position?.totalCurrentSize;
          check(Number.isSafeInteger(quantity), "Matriz informó una cantidad de opciones inválida.");
          if (quantity === 0) continue;
          const sec = byFix.get(position.tradingSymbol);
          check(sec, "No se pudo asociar una posición al catálogo de opciones. Revisá el reporte de Matriz.");
          if (!selected.has(sec.id)) continue;
          check(Math.abs(quantity) <= 1e10 && !quantities.has(sec.id), "Hay saldos de una serie que requieren revisión en Matriz.");
          check(!position.totalCollateralSize, "La serie incluye cantidades en garantía. Revisá su cantidad antes de cargarla manualmente.");
          quantities.set(sec.id, quantity);
        }
      }
    }
    assertCurrent(operation);
    return { contextId: operation.context.contextId, storageScope, capturedAt: Date.now(), reportedAt, version: operation.context.version,
      positions: [...quantities].map(([securityId, quantity]) => ({ securityId, quantity })) };
  }
  window.addEventListener("message", async event => {
    const msg = event.data;
    if (event.source !== window || !msg || !channels.has(msg.channel)) return;
    if (msg.kind === "detach") {
      channels.delete(msg.channel);
      if (active?.channel === msg.channel) active.retired = true;
      return;
    }
    if (msg.kind === "retire") {
      if (active?.channel === msg.channel && active.id === msg.id) active.retired = true;
      return;
    }
    if (msg.kind !== "request") return;
    const reply = payload => { if (channels.has(msg.channel)) window.postMessage({ channel: msg.channel, kind: "response", id: msg.id, ...payload }, location.origin); };
    let operation;
    try {
      if (msg.method === "verifyPositionContext") {
        check(msg.params?.contextId === context().contextId, "Cambió la cuenta o el contexto durante la lectura. Volvé a cargar la posición.");
        reply({ result: true }); return;
      }
      check(msg.method === "positions", "Método no permitido por el lector de posición.");
      check(!active, "Hay una lectura de posición pendiente.");
      operation = { id: msg.id, channel: msg.channel, context: context(), deadline: Date.now() + 14000 };
      active = operation;
      const result = await read(msg.params || {}, operation);
      assertCurrent(operation); reply({ result });
    } catch (error) {
      reply({ error: error instanceof PositionReadError ? error.message : "No se pudo actualizar la posición de Matriz. Revisá la conexión y volvé a intentar." });
    } finally {
      if (operation && active === operation) active = undefined;
    }
  });
  window.__chuchotrizOptionsPositionReaderV2 = { attach(value) { if (typeof value === "string" && channels.size < 8) channels.add(value); } };
})();
