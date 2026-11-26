// Runs beside Matriz so the account, report and ticket stay in the page.
(() => {
  "use strict";

  const quantitySelector = ".MiniOrderFormQuantity-amount-input .ant-input-number-input-wrap > input";
  const preferenceAttribute = "data-ct-ticket-position-visible";
  const isVisible = () => document.documentElement.getAttribute(preferenceAttribute) !== "false";
  const refreshMs = 20_000;
  const requestTimeoutMs = 10_000;
  const maxPendingReads = 2;
  const maxFillAgeMs = 5 * 60_000;
  const clockSkewMs = 30_000;
  const format = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 8 });
  const timeZone = "America/Argentina/Buenos_Aires";
  const reportTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone });
  const reportDay = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone });
  const isCurrentReport = (time, now) => Number.isFinite(time) && time > 0 &&
    time <= now + clockSkewMs && reportDay.format(time) === reportDay.format(now);
  const isRecentReport = time => Date.now() - time <= maxFillAgeMs;
  // Equivalencias no triviales de Resources/Defaults/dollar_cable_equivalences.json (ChuchoBot Premium).
  const equivalents = new Map([
    ["AEC2O", ["AEC2D", "AEC2C"]], ["AER1O", ["AER1D", "AER1C"]],
    ["AER4O", ["AER4D", "AER4C"]], ["AER5O", ["AER5D", "AER5C"]],
    ["BA37D", ["BA7DD", "BA7DC"]], ["BA37E", ["BA7ED", "BA7EC"]],
    ["BB37D", ["BB7DD", "BB7DC"]], ["BB37E", ["BB7ED", "BB7EC"]],
    ["BC37D", ["BC7DD", "BC7DC"]], ["BC37E", ["BC7ED", "BC7EC"]],
    ["BDC28", ["BC28D", "BC28C"]], ["BDC36", ["BC36D", "BC36C"]],
    ["BPO27", ["BP27D", "BP27C"]], ["BPO28", ["BPO8D", "BPO8C"]],
    ["BPOA7", ["BPA7D", "BPA7C"]], ["BPOA8", ["BPA8D", "BPA8C"]],
    ["BPOB7", ["BPB7D", "BPB7C"]], ["BPOB8", ["BPB8D", "BPB8C"]],
    ["BPOC7", ["BPC7D", "BPC7C"]], ["BPOD7", ["BPD7D", "BPD7C"]],
    ["BU3S6", ["B3S6D", "B3S6C"]], ["CO26", ["CO26D", "CCO26"]],
    ["COY27", ["CY27D", "CY27C"]], ["CRCJO", ["CRCJD", "CRCJC"]],
    ["D31G6", ["DG6D", "DG6C"]], ["DNC3O", ["DNC3D", "DNC3C"]],
    ["ERF25", ["EF25D", "EF25C"]], ["ERM33", ["EM33D", "EM33C"]],
    ["GOOGL", ["GOGLD", "GOGLC"]], ["IRCOO", ["IRCOD", "IRCOC"]],
    ["LBJ26", ["LBJ6D", "LBJ6C"]], ["M31G6", ["MG6D"]],
    ["NDT25", ["NDT5D", "NDT5C"]], ["RND25", ["RN25D", "RN25C"]],
    ["S14G6", ["S2G6D", "S2G6C"]], ["S15S6", ["S2S6D", "S2S6C"]],
    ["S17L6", ["S2L6D", "S2L6C"]], ["S30N6", ["SN6D", "SN6C"]],
    ["S30O6", ["SO6D", "SO6C"]], ["S30S6", ["SS6D", "SS6C"]],
    ["S31G6", ["SG6D", "SG6C"]], ["S31L6", ["SL6D", "SL6C"]],
    ["T30A7", ["TA7D", "TA7C"]], ["TZXY7", ["TXY7D", "TXY7C"]],
    ["WBS1O", ["WBS1D", "WBS1C"]], ["X30N6", ["XN6D"]], ["X31L6", ["XL6D", "XL6C"]],
  ]);

  function fixSymbol(value) {
    const match = typeof value === "string" && /^(MERV - [A-Z0-9]+) - ([A-Z0-9.]+) - (CI|24hs|48hs)$/.exec(value);
    return match ? { segment: match[1], ticker: match[2], term: match[3] } : undefined;
  }

  function readTicket(form) {
    const instrument = form?.querySelector(".SearchSecurity input[role=combobox]");
    const quantity = form?.querySelector(quantitySelector);
    if (!instrument || !quantity || instrument.getAttribute("aria-expanded") === "true") return;
    // The displayed search text can change before Matriz commits the security to Cantidad.
    const reactKey = Object.keys(quantity).find(key => /^__react(?:Props|EventHandlers)\$/.test(key));
    const security = reactKey && quantity[reactKey]?.security;
    const symbol = fixSymbol(security?.fixSymbol);
    if (!symbol || !security.id || security.marketId !== "bm" || security.isProduct || security.isPortfolio ||
        instrument.value !== security.symbolStr ||
        !((symbol.term === "CI" && security.settlementType === "1") || (symbol.term === "24hs" && security.settlementType === "2"))) return;

    const { profileStore: profile, portfolioStore: portfolio, securityStore: securities } = window.mainStore ?? {};
    const account = form.querySelector(".account-form-item .ant-select-selection-item")?.title?.trim();
    const readReport = portfolio && Object.getPrototypeOf(portfolio)?.getDetailedPositionReport;
    const Report = portfolio?.detailedPositionReport?.constructor;
    if (!account || !Array.isArray(profile?.accounts) || !profile.accounts.includes(account) ||
        typeof readReport !== "function" || readReport !== portfolio.getDetailedPositionReport ||
        typeof Report !== "function" || Report === Object || !Array.isArray(securities?.securities)) return;
    return { account, profile, activeAccount: profile.activeAccount, portfolio, securities, security, symbol, quantity,
      readReport, Report };
  }

  function sameTicket(a, b) {
    return a?.account === b?.account && a?.security === b?.security && a?.profile === b?.profile && a?.activeAccount === b?.activeAccount &&
      a?.portfolio === b?.portfolio && a?.securities === b?.securities && a?.Report === b?.Report;
  }

  function familyTickers(ticket) {
    const { security, symbol } = ticket;
    const instruments = new Map();
    for (const candidate of ticket.securities.securities) {
      if (candidate?.marketId !== "bm" || !candidate.id || candidate.cfiCode !== security.cfiCode || candidate.isProduct || candidate.isPortfolio) continue;
      const parsed = fixSymbol(candidate.fixSymbol);
      if (parsed?.segment !== symbol.segment) continue;
      const series = instruments.get(parsed.ticker) ?? [];
      series.push(candidate);
      instruments.set(parsed.ticker, series);
    }
    const related = (base, variant) => {
      if (base === variant) return false;
      const pesos = instruments.get(base)?.filter(item => item.currency === "ARS") ?? [];
      const usd = instruments.get(variant)?.filter(item => item.currency === "USD") ?? [];
      return pesos.some(p => usd.some(u => {
        if ([p.securityMepId, p.securityCableId].includes(u.id) || [u.securityMepId, u.securityCableId].includes(p.id)) return true;
        const variants = equivalents.get(base) ?? [`${base}D`, `${base}C`];
        return variants.includes(variant) && !!p.description && p.description === u.description;
      }));
    };
    const tickers = [...instruments.keys()];
    const bases = security.currency === "USD" ? tickers.filter(ticker => related(ticker, symbol.ticker)) : [];
    if (bases.length > 1) throw Error("Familia de instrumentos ambigua");
    const base = security.currency === "ARS" ? symbol.ticker : bases[0];
    return new Set(base ? [base, symbol.ticker, ...tickers.filter(ticker => related(base, ticker))] : [symbol.ticker]);
  }

  function validQuantity(value) {
    return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  }

  function sameQuantity(left, right) {
    return validQuantity(left) && validQuantity(right) &&
      Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
  }

  const summaryCollateral = ["instrumentCollateralSize", "instrumentInitialCollateralSize", "instrumentFilledCollateralSize"];
  const rowCollateral = ["totalCollateralSize", "totalInitialCollateralSize", "totalFilledCollateralSize",
    "buyCollateralSize", "sellCollateralSize", "buyInitialCollateralSize", "sellInitialCollateralSize",
    "buyFilledCollateralSize", "sellFilledCollateralSize"];
  function collateralState(record, fields) {
    const [total, initial, filled] = fields;
    const values = fields.map(field => record[field]).filter(value => value != null);
    if (values.some(value => validQuantity(value) && value !== 0)) return "pledged";
    if (!values.every(validQuantity)) return "unknown";
    return record[total] === 0 || record[initial] === 0 && record[filled] === 0 ? "clear" : "unknown";
  }

  function readPosition(report, ticket) {
    if (!Array.isArray(report?.types)) throw Error("Reporte de posición incompleto");
    const tickers = familyTickers(ticket);
    let ci = 0, nextDay = 0, pledged = false, collateralUnknown = false;
    for (const group of report.types) {
      if (!Array.isArray(group?.securitiesDetailed)) throw Error("Falta el detalle de posición");
      for (const instrument of group.securitiesDetailed) {
        const expectsFamily = tickers.has(instrument?.symbolReference);
        const rows = instrument?.detailedPositions;
        if (!Array.isArray(rows)) throw Error("Falta el detalle del instrumento");
        let matched = false, missingCollateralDetail = false;
        for (const row of rows) {
          const symbol = fixSymbol(row?.tradingSymbol);
          if (!symbol && expectsFamily) throw Error("Símbolo de posición inválido");
          if (symbol?.segment !== ticket.symbol.segment || !tickers.has(symbol.ticker)) continue;
          matched = true;
          const size = row.totalCurrentSize;
          if (!validQuantity(size) || ![0, 1, 2].includes(row.settlType)) throw Error("Nominales o plazo de posición inválidos");
          // settlType in the risk report is the effective time to settlement. A settled
          // holding can retain its original 24hs trading symbol and belong to bucket 0.
          if (row.settlType === 0) ci += size;
          else if (row.settlType === 1) nextDay += size;
          const collateral = collateralState(row, rowCollateral);
          pledged ||= collateral === "pledged";
          missingCollateralDetail ||= size !== 0 && collateral === "unknown";
        }
        if ((expectsFamily || matched) && (!rows.every(row => validQuantity(row?.totalCurrentSize)) ||
            !sameQuantity(instrument.instrumentCurrentSize, rows.reduce((sum, row) => sum + row.totalCurrentSize, 0)))) {
          throw Error("El detalle y el total de nominales no coinciden");
        }
        if (matched) {
          const collateral = collateralState(instrument, summaryCollateral);
          pledged ||= collateral === "pledged";
          collateralUnknown ||= missingCollateralDetail && collateral === "unknown";
        }
      }
    }
    if (![ci, nextDay, ci + nextDay].every(validQuantity)) throw Error("Saldo de posición fuera de rango");
    const immediate = ticket.symbol.term === "CI";
    // Same inventory capacity as SettlementInventoryCapacity in ChuchoBot Premium.
    return {
      ci,
      at24h: ci + nextDay,
      sellable: Math.max(0, immediate ? ci + Math.min(0, nextDay) : ci + nextDay),
      collateral: pledged ? "pledged" : collateralUnknown ? "unknown" : "clear",
    };
  }

  function usableQuantity(ticket, position, reportedAt) {
    const { quantity, security } = ticket;
    if (!position || !isRecentReport(reportedAt) || position.collateral !== "clear" || quantity.disabled || quantity.readOnly) return;
    const { sellable } = position;
    const max = Number(quantity.getAttribute("aria-valuemax") ?? Number.MAX_SAFE_INTEGER);
    const precision = security.refData?.sizePrecision ?? 0;
    if (!Number.isInteger(precision) || precision < 0 || precision > 8) return;
    const rounded = Number(sellable.toFixed(precision));
    const minTrade = security.refData?.minTradeVol || 0;
    const maxTrade = security.refData?.maxTradeVol || max;
    const lot = security.refData?.roundLot || 10 ** -precision;
    const lots = rounded / lot;
    if (rounded > 0 && rounded >= minTrade && rounded <= Math.min(max, maxTrade) &&
        Math.abs(lots - Math.round(lots)) < 1e-8 &&
        sameQuantity(rounded, sellable)) return rounded;
  }

  let form, panel, status, table, orderTerm, rows, fill, close, show, selection, snapshot, inFlight, fillRequest;
  let nextRefresh = 0, failure, pendingReads = 0, queued = false;
  function currentPosition() {
    const now = Date.now();
    if (snapshot && now - snapshot.readAt < 2 * refreshMs && isCurrentReport(snapshot.reportedAt, now)) return snapshot.position;
  }

  function text(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function render(ticket) {
    panel.hidden = !ticket;
    if (!ticket) return;
    const position = currentPosition();
    const term = ticket.symbol.term === "CI" ? "CI" : "24 h";
    if (!position) {
      text(status, failure === "timeout" || !inFlight && pendingReads >= maxPendingReads ? "Matriz no respondió. Si el problema continúa, recargá la página." :
        failure ? "Posición no disponible" : `Consultando posición ${term}…`);
      status.hidden = false;
      table.hidden = true;
      fill.hidden = true;
      return;
    }
    const reportLabel = `Último cálculo de Matriz: ${reportTime.format(snapshot.reportedAt)}`;
    const notices = [];
    if (!isRecentReport(snapshot.reportedAt)) notices.push(reportLabel);
    if (position.collateral === "pledged") notices.push("Incluye garantía");
    if (position.collateral === "unknown" && position.sellable > 0) notices.push("Garantía sin verificar");
    status.hidden = notices.length === 0;
    text(status, notices.join(" · "));
    table.hidden = false;
    table.title = reportLabel;
    text(orderTerm, term === "CI" ? "Orden en CI" : "Orden a 24 h");
    const value = Number(ticket.quantity.getAttribute("aria-valuenow"));
    const amount = ticket.quantity.value.trim() && value > 0 && validQuantity(value) ? value : 0;
    for (const [row, balance, delta] of [[rows[0], position.ci, term === "CI" ? amount : 0], [rows[1], position.at24h, amount]]) {
      const buy = balance + delta;
      const sell = balance - delta;
      text(row.cells[1], format.format(balance));
      text(row.cells[2], amount && validQuantity(buy) ? format.format(buy) : "—");
      text(row.cells[3], amount && validQuantity(sell) ? format.format(sell) : "—");
    }
    const quantity = usableQuantity(ticket, position, snapshot.reportedAt);
    fill.hidden = quantity === undefined;
    const filling = fillRequest?.selection === selection;
    fill.setAttribute("aria-disabled", String(filling));
    if (quantity !== undefined) {
      const label = `Cargar ${format.format(quantity)} nominales en Cantidad`;
      text(fill, filling ? "Consultando…" : `Usar ${format.format(quantity)}`);
      fill.title = label;
      fill.setAttribute("aria-label", `${fill.textContent}: ${label}`);
    }
  }

  function mount() {
    form.querySelector(":scope > .ct-ticket-position")?.remove();
    panel = document.createElement("section");
    panel.id = "ct-ticket-position";
    panel.className = "ct-ticket-position";
    panel.setAttribute("aria-label", "Tenencia del instrumento");
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ct-ticket-position-projection" aria-live="polite" aria-atomic="true" hidden>
        <div class="ct-ticket-position-label" id="ct-ticket-projection-label"><strong>Proyección</strong><span></span></div>
        <table aria-label="Tenencia actual y proyecciones" aria-describedby="ct-ticket-projection-label">
          <thead><tr><th scope="col">Plazo</th><th scope="col">Tenencia actual</th><th scope="col" class="ct-buy">Si comprás</th><th scope="col" class="ct-sell">Si vendés</th></tr></thead>
          <tbody>
            <tr><th scope="row">CI</th><td class="ct-current"></td><td class="ct-buy"></td><td class="ct-sell"></td></tr>
            <tr><th scope="row">24 h</th><td class="ct-current"></td><td class="ct-buy"></td><td class="ct-sell"></td></tr>
          </tbody>
        </table>
      </div>
      <span class="ct-ticket-position-status" role="status"></span>
      <button type="button" class="ct-ticket-position-fill" hidden></button>
      <button type="button" class="ct-ticket-position-close" aria-label="Ocultar tenencia" title="Ocultar tenencia">
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m4 4 8 8m0-8-8 8"/></svg>
      </button>`;
    status = panel.querySelector("[role=status]");
    table = panel.querySelector(".ct-ticket-position-projection");
    orderTerm = panel.querySelector(".ct-ticket-position-label span");
    rows = [...table.querySelectorAll("tbody tr")];
    close = panel.querySelector(".ct-ticket-position-close");
    fill = panel.querySelector(".ct-ticket-position-fill");
    fill.addEventListener("click", async event => {
      const ticket = readTicket(form);
      if (event.currentTarget !== fill || !isVisible() || !ticket || fillRequest || currentForm() !== form || !sameTicket(ticket, selection) ||
          (!inFlight && pendingReads >= maxPendingReads) || usableQuantity(ticket, currentPosition(), snapshot?.reportedAt) === undefined) return;
      const { quantity } = ticket;
      const request = { selection, quantity, value: quantity.value };
      fillRequest = request;
      render(ticket);
      try {
        await (inFlight?.promise ?? refresh(selection));
        const current = readTicket(currentForm());
        if (!isVisible() || fillRequest !== request || request.selection !== selection || !sameTicket(current, ticket) ||
            current.quantity !== quantity || quantity.value !== request.value) return;
        const nominal = usableQuantity(current, currentPosition(), snapshot?.reportedAt);
        if (nominal === undefined) return;
        const value = nominal.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 8 });
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(quantity, value);
        quantity.dispatchEvent(new Event("input", { bubbles: true }));
        if (document.activeElement === fill) quantity.focus();
      } finally {
        if (fillRequest === request) fillRequest = undefined;
        schedule();
      }
    });
    form.append(panel);
  }

  function reconcileShowButton(quantity, visible) {
    const number = quantity?.closest(".ant-input-number");
    const content = number?.parentElement;
    if (!content) {
      show?.remove();
      show = undefined;
      return;
    }
    if (show?.parentElement !== content) {
      show?.remove();
      content.querySelector(":scope > .ct-ticket-position-show")?.remove();
      show = document.createElement("button");
      show.type = "button";
      show.className = "ct-ticket-position-show";
      show.setAttribute("aria-label", "Mostrar tenencia");
      show.setAttribute("aria-controls", panel.id);
      show.title = "Mostrar tenencia";
      show.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
      number.after(show);
    }
    show.hidden = visible;
  }

  function refresh(ticket) {
    const request = {};
    inFlight = request;
    pendingReads++;
    failure = undefined;
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => {
        request.expired = true;
        if (inFlight === request) inFlight = undefined;
        if (ticket === selection) {
          snapshot = undefined;
          failure = "timeout";
          nextRefresh = Date.now() + refreshMs;
        }
        schedule();
        resolve();
      }, requestTimeoutMs);
    });
    const nativeRead = (async () => {
      try {
        // The native method writes to its receiver. Give each account read its
        // own report and skip the UI-specific enrichment of the broker rows.
        const reader = { detailedPositionReport: new ticket.Report(), setSecurityToDetailPosition() {} };
        const report = await ticket.readReport.call(reader, ticket.account, true);
        if (!isVisible() || request.expired || ticket !== selection || !sameTicket(ticket, readTicket(currentForm()))) return;
        const reportedAt = report?.lastCalculation?.getTime?.();
        // The native settlement buckets are relative to the report's trading day.
        if (report !== reader.detailedPositionReport || !isCurrentReport(reportedAt, Date.now())) {
          throw Error("Reporte de posición sin verificar");
        }
        snapshot = { position: readPosition(report, ticket), reportedAt, readAt: Date.now() };
      } catch {
        if (!request.expired && ticket === selection) {
          snapshot = undefined;
          failure = "unavailable";
        }
      } finally {
        clearTimeout(timer);
        pendingReads--;
        if (inFlight === request) {
          inFlight = undefined;
          if (ticket === selection) nextRefresh = Date.now() + refreshMs;
        }
        schedule();
      }
    })();
    request.promise = Promise.race([nativeRead, timeout]);
    return request.promise;
  }

  const currentForm = () => document.getElementById("MiniOrderForm");
  const formObserver = new MutationObserver(records => {
    if (records.some(record => !panel?.contains(record.target))) schedule();
  });
  function reconcile() {
    const nextForm = currentForm();
    if (form !== nextForm) {
      formObserver.disconnect();
      form = nextForm;
      panel = show = selection = snapshot = fillRequest = undefined;
      if (form) formObserver.observe(form, { subtree: true, childList: true, attributes: true,
        attributeFilter: ["aria-expanded", "aria-valuenow", "disabled", "readonly", "title", "value"] });
    }
    if (!form) return;
    if (panel?.parentElement !== form) mount();
    const visible = isVisible();
    const quantity = form.querySelector(quantitySelector);
    const focused = document.activeElement;
    const opening = visible && focused === show;
    const closing = !visible && panel.contains(focused);
    reconcileShowButton(quantity, visible);
    const ticket = visible ? readTicket(form) : undefined;
    if (!sameTicket(selection, ticket)) {
      selection = ticket;
      snapshot = fillRequest = undefined;
      failure = undefined;
      nextRefresh = Date.now() + 200;
    }
    render(ticket);
    if (opening) (ticket ? close : quantity)?.focus();
    if (closing) show?.focus();
    if (ticket && !inFlight && pendingReads < maxPendingReads && !document.hidden && Date.now() >= nextRefresh) void refresh(selection);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; reconcile(); });
  }

  new MutationObserver(() => { if (form !== currentForm()) schedule(); }).observe(document.body, { subtree: true, childList: true });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: [preferenceAttribute] });
  for (const event of ["input", "change", "focusin", "focusout"]) {
    document.addEventListener(event, ({ target }) => {
      if (!form?.contains(target)) return;
      if ((event === "input" || event === "change") && target === fillRequest?.quantity) fillRequest = undefined;
      schedule();
    }, true);
  }
  document.addEventListener("visibilitychange", schedule);
  setInterval(schedule, 500);
  reconcile();
})();
