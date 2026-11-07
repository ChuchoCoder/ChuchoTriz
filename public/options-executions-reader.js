// Reads the same account report as Matriz. Raw events and account identifiers stay in the page.
(() => {
  const channel = document.currentScript?.dataset.channel;
  if (!channel) return;
  if (window.__chuchotrizOptionsExecutionsReader) {
    window.__chuchotrizOptionsExecutionsReader.attach(channel);
    return;
  }

  const channels = new Map([[channel, null]]);
  const contextChanged = "Cambió la cuenta o la sesión de Matriz. Volvé a cargar las operaciones.";
  let previousContext, contextId;
  class ExecutionReadError extends Error {}
  const check = (condition, message) => { if (!condition) throw new ExecutionReadError(message); };

  function context() {
    const ms = window.mainStore, profile = ms?.profileStore;
    const version = document.body?.innerText.match(/Versi[oó]n:\s*([\d.]+)/)?.[1];
    check(typeof profile?.activeAccount === "string" && profile.activeAccount,
      "Iniciá sesión en Matriz para consultar las operaciones.");
    check(version === "4.24.4", "Versión de Matriz no verificada para leer operaciones.");
    const events = ms.orderEventStore, securities = ms.securityStore;
    check(typeof events?.getOrderEventsForAccountReport === "function" && typeof securities?.getSecurity === "function",
      "El reporte de operaciones de Matriz todavía no está disponible.");
    const current = [ms, profile, profile.activeAccount, events, securities, version];
    if (!previousContext || current.some((value, index) => value !== previousContext[index])) {
      previousContext = current;
      contextId = crypto.randomUUID();
    }
    return { account: profile.activeAccount, events, securities, contextId };
  }

  const numeric = value => typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))
    ? Number(value) : NaN;

  async function projectExecutions(report, { account, securities }, assertCurrent) {
    const events = Array.isArray(report) ? report : report?.orderEvents;
    check(Array.isArray(events) && events.length <= 50000 && !(report?.nextTime && report.noData !== true),
      "Matriz devolvió un reporte incompleto o fuera del límite de lectura.");
    const options = securities.options, underlyings = securities.underlyingsForMatrix;
    check(Array.isArray(options) && options.length <= 10000 && Array.isArray(underlyings) && underlyings.length <= 2000,
      "El catálogo de opciones de Matriz todavía no está disponible.");
    const byId = new Map(options.map(sec => [sec.id, sec]));
    const byUnderlying = new Map(underlyings.map(sec => [sec.id, sec.symbolStr]));
    const seen = new Set(), rows = [];
    let unmatched = 0;

    for (const event of events) {
      if (event?.account !== account || event.eventSubtype !== "execution_report" || event.execType !== "F" ||
        !["1", "2"].includes(String(event.ordStatus))) continue;

      const securityId = event.securityId;
      if (typeof securityId !== "string" || !securityId) {
        unmatched++;
        continue;
      }
      if (!byId.has(securityId)) {
        const security = await securities.getSecurity(securityId).catch(() => undefined);
        assertCurrent();
        byId.set(securityId, security);
      }
      const security = byId.get(securityId);
      if (security?.id !== securityId) {
        unmatched++;
        continue;
      }
      const kind = /^OC/.test(security.cfiCode) ? "call" : /^OP/.test(security.cfiCode) ? "put" : undefined;
      if (!kind) continue;

      const id = event.id, side = String(event.side), quantity = numeric(event.lastQty), price = numeric(event.lastPx);
      const timestamp = typeof event.transactTime === "string" ? Date.parse(event.transactTime) : NaN;
      const symbol = security.symbolStr, underlying = byUnderlying.get(security.underlying) || security.underlyingSymbol;
      const { strikePrice: strike, maturityDateStr, strikeCurrency = "" } = security.refData ?? {};
      const { currency, settlementType: settlement } = security;
      if (!(typeof id === "number" && Number.isSafeInteger(id) || typeof id === "string" && id) ||
        !["1", "2"].includes(side) || !Number.isSafeInteger(quantity) || quantity <= 0 ||
        !Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp) ||
        typeof symbol !== "string" || !symbol || typeof underlying !== "string" || !underlying ||
        !Number.isFinite(strike) || strike <= 0 || typeof maturityDateStr !== "string" || !/^\d{8}$/.test(maturityDateStr) ||
        typeof currency !== "string" || !currency || typeof settlement !== "string" ||
        (strikeCurrency != null && typeof strikeCurrency !== "string")) {
        unmatched++;
        continue;
      }
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      const expiration = maturityDateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
      rows.push({ symbol, underlying, expiration, kind, strike, currency, strikeCurrency: strikeCurrency ?? "",
        settlement, timestamp, quantity: side === "1" ? quantity : -quantity, price });
    }
    return { rows, unmatched };
  }

  window.addEventListener("message", async event => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || !msg || !channels.has(msg.channel)) return;
    if (msg.kind === "detach") { channels.delete(msg.channel); return; }
    if (msg.kind === "retire") {
      if (channels.get(msg.channel)?.id === msg.id) channels.set(msg.channel, null);
      return;
    }
    if (msg.kind !== "request") return;
    const reply = payload => {
      if (channels.has(msg.channel)) window.postMessage({ channel: msg.channel, kind: "response", id: msg.id, ...payload }, location.origin);
    };
    let operation;
    try {
      if (msg.method === "verifyExecutionContext") {
        check(msg.params?.contextId === context().contextId, contextChanged);
        reply({ result: true });
        return;
      }
      check(msg.method === "executions", "Método no permitido por el lector de operaciones.");
      check(!channels.get(msg.channel), "Hay una lectura de operaciones pendiente.");
      const current = context();
      operation = { id: msg.id };
      channels.set(msg.channel, operation);
      const assertCurrent = () => {
        check(channels.get(msg.channel) === operation, "Lectura de operaciones cerrada.");
        check(context().contextId === current.contextId, contextChanged);
      };
      const report = await current.events.getOrderEventsForAccountReport(current.account);
      assertCurrent();
      const result = await projectExecutions(report, current, assertCurrent);
      assertCurrent();
      reply({ result: { contextId: current.contextId, ...result } });
    } catch (error) {
      if (operation && channels.get(msg.channel) !== operation) return;
      const status = error?.response?.status;
      reply({ error: error instanceof ExecutionReadError ? error.message : status === 401 || status === 403
        ? "Matriz no autorizó la lectura. Volvé a iniciar sesión e intentá de nuevo."
        : "No se pudo leer el reporte de operaciones. Revisá la conexión de Matriz y volvé a intentar." });
    } finally {
      if (operation && channels.get(msg.channel) === operation) channels.set(msg.channel, null);
    }
  });

  window.__chuchotrizOptionsExecutionsReader = {
    attach(value) {
      if (typeof value === "string" && !channels.has(value) && channels.size < 8) channels.set(value, null);
    },
  };
})();
