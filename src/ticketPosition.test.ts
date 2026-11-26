// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const script = readFileSync("public/ticket-position.js", "utf8");
const security = (ticker: string, term = "24hs", currency = "ARS", description = ticker) => ({
  id: `bm_MERV_${ticker}_${term}`, symbolStr: term === "CI" ? `${ticker} (CI)` : ticker,
  fixSymbol: `MERV - XMEV - ${ticker} - ${term}`, marketId: "bm", settlementType: term === "CI" ? "1" : "2",
  currency, description, cfiCode: "DBXXXX", refData: { sizePrecision: 0, minTradeVol: 1, maxTradeVol: 500000000, roundLot: 1 },
  securityMepId: undefined as string | undefined, securityCableId: undefined as string | undefined,
});
const al30 = security("AL30"), al30Ci = security("AL30", "CI"), al30d = security("AL30D", "24hs", "USD");
const al30c = security("AL30C", "CI", "USD");
al30.securityMepId = al30d.id;
al30Ci.securityCableId = al30c.id;

const holding = (instrument: ReturnType<typeof security>, settlType: number, totalCurrentSize: number, totalCollateralSize = 0) => ({
  symbolReference: instrument.symbolStr.replace(" (CI)", ""),
  instrumentCurrentSize: totalCurrentSize,
  detailedPositions: [{ tradingSymbol: instrument.fixSymbol, settlType, totalCurrentSize, totalCollateralSize }],
});
const withRows = (...rows: ReturnType<typeof holding>[]) => ({ lastCalculation: new Date(), types: [{ securitiesDetailed: rows }] });
const portfolio = { detailedPositionReport: withRows(), getDetailedPositionReport: vi.fn() };
const catalog = { securities: [al30, al30Ci, al30d, al30c] };
const profile = { accounts: ["TEST-1", "TEST-2"] };
type NativeInput = HTMLInputElement & { __reactProps$fixture: { security: ReturnType<typeof security> } };

const read = () => portfolio.detailedPositionReport;
const wait = async () => { await vi.advanceTimersByTimeAsync(550); };
const panel = () => document.querySelector<HTMLElement>(".ct-ticket-position")!;
const button = () => panel().querySelector<HTMLButtonElement>(".ct-ticket-position-fill")!;
const close = () => panel().querySelector<HTMLButtonElement>(".ct-ticket-position-close")!;
const show = () => document.querySelector<HTMLButtonElement>(".ct-ticket-position-show")!;
const row = (index: number) => [...panel().querySelectorAll<HTMLTableRowElement>("tbody tr")[index].cells].map(cell => cell.textContent);
const qty = () => document.querySelector<NativeInput>(".ant-input-number-input-wrap input")!;
const search = () => document.querySelector<HTMLInputElement>(".SearchSecurity input")!;
function setQuantity(value: string) {
  qty().value = value;
  qty().dispatchEvent(new Event("input", { bubbles: true }));
}
function select(instrument: ReturnType<typeof security>) {
  qty().__reactProps$fixture = { security: instrument };
  search().value = instrument.symbolStr;
  search().dispatchEvent(new Event("input", { bubbles: true }));
}
function fixture() {
  document.body.innerHTML = `<div id="MiniOrderForm"><form>
    <div class="account-form-item"><span class="ant-select-selection-item" title="TEST-1"></span></div>
    <div class="SearchSecurity"><input role="combobox"></div>
    <div class="MiniOrderFormQuantity-amount-input"><div class="ant-form-item-control-input-content">
      <div class="ant-input-number"><div class="ant-input-number-input-wrap"><input></div></div>
    </div></div>
  </form></div>`;
  qty().addEventListener("input", () => qty().setAttribute("aria-valuenow", qty().value.replace(",", ".")));
  select(al30);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MutationObserver", class extends MutationObserver {
    constructor(callback: MutationCallback) { super(callback); observers.push(this); }
  });
  vi.stubGlobal("mainStore", { profileStore: profile, portfolioStore: portfolio, securityStore: catalog });
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 80), holding(al30d, 1, -25), holding(al30c, 0, 5));
  portfolio.getDetailedPositionReport.mockReset().mockImplementation(async () => read());
  catalog.securities = [al30, al30Ci, al30d, al30c];
  fixture();
});

const observers: MutationObserver[] = [];
afterEach(() => {
  observers.splice(0).forEach(observer => observer.disconnect());
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-ct-ticket-position-visible");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("groups pesos, D and C, using the report's effective settlement even for a 24hs symbol", async () => {
  new Function(script)();
  await wait();
  expect(row(0)).toEqual(["CI", "85", "—", "—"]);
  expect(row(1)).toEqual(["24 h", "60", "—", "—"]);
  setQuantity("20");
  await wait();
  expect(row(0)).toEqual(["CI", "85", "85", "85"]);
  expect(row(1)).toEqual(["24 h", "60", "80", "40"]);
  select(al30Ci);
  await wait();
  expect(row(0)).toEqual(["CI", "85", "105", "65"]);
  expect(row(1)).toEqual(["24 h", "60", "80", "40"]);
  expect(button().textContent).toBe("Usar 60");
  select(al30d);
  await wait();
  expect(row(0)).toEqual(["CI", "85", "85", "85"]);
  expect(row(1)).toEqual(["24 h", "60", "80", "40"]);
});

it("does not sell a future long in CI and only writes the native quantity field", async () => {
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 80), holding(al30d, 1, 25));
  const submit = vi.fn();
  document.querySelector("form")!.addEventListener("submit", submit);
  select(al30Ci);
  new Function(script)();
  await wait();
  button().click();
  await wait();
  expect(qty().value).toBe("80");
  expect(row(0)).toEqual(["CI", "80", "160", "0"]);
  expect(row(1)).toEqual(["24 h", "105", "185", "25"]);
  expect(document.activeElement).toBe(qty());
  expect(submit).not.toHaveBeenCalled();
});

it("identifies nonstandard Premium aliases and keeps unrelated D/C tickers separate", async () => {
  const base = security("BA37D", "24hs", "ARS", "BONO X");
  const variant = security("BA7DD", "24hs", "USD", "BONO X");
  const unrelated = security("BA37DD", "24hs", "USD", "BONO Y");
  const similar = security("BA37", "24hs", "ARS", "BONO X");
  catalog.securities = [base, variant, unrelated, similar];
  portfolio.detailedPositionReport = withRows(holding(base, 0, 100), holding(variant, 1, 20), holding(unrelated, 0, 900), holding(similar, 0, 800));
  select(variant);
  new Function(script)();
  await wait();
  expect(row(1)[1]).toBe("120");
});

it("keeps a position visible in guarantee while withholding the fill action", async () => {
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 20, 5));
  new Function(script)();
  await wait();
  expect(row(1)[1]).toBe("20");
  expect(panel().querySelector("[role=status]")?.textContent).toBe("Incluye garantía");
  expect(button().hidden).toBe(true);
});

it("refreshes before loading the full position and preserves a newer manual edit", async () => {
  new Function(script)();
  await wait();
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 30));
  button().click();
  await wait();
  expect(qty().value).toBe("30");

  let resolve!: (report: ReturnType<typeof read>) => void;
  portfolio.getDetailedPositionReport.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  button().click();
  expect(button().disabled).toBe(true);
  setQuantity("12");
  resolve(read());
  await wait();
  expect(qty().value).toBe("12");
});

it("drops replies for another account and hides during instrument search", async () => {
  let resolve!: (report: ReturnType<typeof read>) => void;
  portfolio.getDetailedPositionReport.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  new Function(script)();
  await wait();
  const first = read();
  document.querySelector(".ant-select-selection-item")!.setAttribute("title", "TEST-2");
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 7));
  resolve(first);
  await wait();
  expect(portfolio.getDetailedPositionReport).toHaveBeenLastCalledWith("TEST-2", undefined);
  expect(row(1)[1]).toBe("7");
  search().value = "AL30C";
  search().dispatchEvent(new Event("input", { bubbles: true }));
  await wait();
  expect(panel().hidden).toBe(true);
  button().click();
  expect(qty().value).toBe("");
});

it("distinguishes an empty or short position from an unavailable report", async () => {
  portfolio.detailedPositionReport = withRows();
  new Function(script)();
  await wait();
  expect(row(1)[1]).toBe("0");
  expect(button().hidden).toBe(true);
  portfolio.detailedPositionReport = withRows(holding(al30d, 1, -15));
  select(al30d);
  await wait();
  expect(row(1)[1]).toBe("-15");
  expect(button().hidden).toBe(true);
  portfolio.getDetailedPositionReport.mockRejectedValueOnce(Error("sin conexión"));
  select(al30c);
  await wait();
  expect(panel().textContent).toContain("Posición no disponible");
  expect(button().hidden).toBe(true);
});

it("rejects incomplete detail and recovers from a timed-out native refresh", async () => {
  portfolio.detailedPositionReport = withRows({ ...holding(al30, 0, 30), detailedPositions: [] });
  new Function(script)();
  await wait();
  expect(panel().textContent).toContain("Posición no disponible");

  let resolve!: (report: ReturnType<typeof read>) => void;
  portfolio.getDetailedPositionReport.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  select(al30d);
  await wait();
  expect(panel().textContent).toContain("Consultando posición");
  await vi.advanceTimersByTimeAsync(10_500);
  expect(panel().textContent).toContain("Posición no disponible");
  const oldReport = read();
  portfolio.detailedPositionReport = withRows(holding(al30, 0, 10));
  resolve(oldReport);
  await wait();
  expect(row(1)[1]).toBe("10");
});

it("leaves the eye beside the native field, pauses reads and reloads after reopening", async () => {
  const visibility = (value: boolean) => { document.documentElement.dataset.ctTicketPositionVisible = String(value); };
  visibility(false);
  new Function(script)();
  await wait();
  expect(panel().hidden).toBe(true);
  expect(show().hidden).toBe(false);
  expect(show().previousElementSibling).toBe(qty().closest(".ant-input-number"));
  expect(portfolio.getDetailedPositionReport).not.toHaveBeenCalled();
  setQuantity("15");
  show().focus();
  visibility(true);
  await wait();
  expect(document.activeElement).toBe(close());
  expect(row(1)).toEqual(["24 h", "60", "75", "45"]);
  expect(show().hidden).toBe(true);

  let resolve!: (report: ReturnType<typeof read>) => void;
  portfolio.getDetailedPositionReport.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  button().click();
  visibility(false);
  await wait();
  expect(document.activeElement).toBe(show());
  resolve(read());
  await vi.advanceTimersByTimeAsync(22_000);
  expect(qty().value).toBe("15");
  expect(portfolio.getDetailedPositionReport).toHaveBeenCalledTimes(2);

  const oldEye = show();
  oldEye.parentElement!.replaceWith(oldEye.parentElement!.cloneNode(true));
  await wait();
  expect(show()).not.toBe(oldEye);
  expect(document.querySelectorAll(".ct-ticket-position-show")).toHaveLength(1);
});
