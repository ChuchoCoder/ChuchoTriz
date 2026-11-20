import { expect, it } from "vitest";
import { applyDefaultWatch, bestBookPrice, DEFAULT_WATCH_PAIRS, resolveDefaultWatch, closeOperation, correctOperation, counterpart, currentRatio, dailyPriceChange, defaultMarketRights, emptyBook, goalInput, goalReached, invertWatchPair, isClosed, operationPnl, pairRatioLabel, parseGoal, validateBook, validateOperation, type RatioOperation, type TradingInstrument } from "./trading";
import { calculateRatio } from "./model";

const instrument = (id: string, currency = "ARS"): TradingInstrument => ({ id, symbol: id, market: "bm", currency, settlement: "2", cfi: "ESXXXX", amountFactor: 1, quantityStep: 1, quantityUnit: "nominales" });
const at = "2026-01-01T13:00:00.000Z", exitAt = "2026-01-02T13:00:00.000Z";
it("uses the complete best published level without substituting last, deeper levels or stale top fields", () => {
  const bid = { price: 99, size: 10 }, ask = { price: 101, size: 20 };
  expect(bestBookPrice({ bid, ask }, "ask")).toBe(101);
  expect(bestBookPrice({ bid, ask }, "bid")).toBe(99);
  expect(bestBookPrice({ bid, ask, depth: [{ bid, ask: { price: 102, size: 5 } }] }, "ask")).toBe(102);
  for (const quote of [undefined, { last: 100 }, { ask, depth: [] }, { ask, depth: [{}, { ask }] }, { ask, issue: "disconnected" }, { ask: { price: 101, size: 0 } }, { ask: { price: Infinity, size: 1 } }]) expect(bestBookPrice(quote, "ask")).toBeUndefined();
});
const operation = (): RatioOperation => ({ id: "operation", openedAt: at, direction: 1, commission: 1, fx: 1, targetRatio: 1.2,
  legs: [ { instrument: instrument("A"), side: 1, quantity: 100, entry: 100, factor: 1, step: 1, ddmm: .1, exits: [] },
    { instrument: instrument("B"), side: -1, quantity: 200, entry: 50, factor: 1, step: 1, ddmm: .2, exits: [] } ] });
it("retains the optional comparison reference across storage and excludes spot references from operations", () => {
  const a = instrument("AL30"), b = instrument("AL30D", "USD");
  const c = { ...instrument("rx_DDF_DLR_SPOT"), symbol: "DLR/SPOT", market: "rx", settlement: "Referencia", cfi: "MRIXXX", monitorOnly: true };
  const book = { ...emptyBook(), schema: 2 as const, watch: [{ id: "mep", a, b }, { id: "spread", a, b, c }] };
  expect(() => validateBook({ ...book, schema: 1 })).toThrow();
  expect(validateBook(JSON.parse(JSON.stringify(book)))).toEqual(book);
  expect(() => validateBook({ ...book, watch: [...book.watch, { ...book.watch[1], id: "duplicate" }] })).toThrow();
  expect(() => validateBook({ ...book, watch: [{ ...book.watch[1], c: null }] })).toThrow();
  expect(() => invertWatchPair(book, "spread")).toThrow(/fórmula/);
  const op = operation(); op.legs[0].instrument = c;
  expect(() => validateOperation(op)).toThrow(/referencias/);
  op.legs[0].instrument = { ...c, monitorOnly: undefined };
  expect(() => validateOperation(op)).toThrow(/referencias/);
});
it("resolves the eight defaults in user order using unique exact BYMA matches", async () => {
  const { watch, missing } = await resolveDefaultWatch(async symbol => [instrument(symbol), { ...instrument(symbol + " CI"), symbol: symbol + " CI" }, { ...instrument("rx-" + symbol), market: "rx", symbol }]);
  expect(missing).toEqual([]);
  expect(watch.map(p => `${p.a.symbol}/${p.b.symbol}`)).toEqual(["AL30/AL30D", "AL30/AL30C", "AL30D/AL30C", "GD30/AL30", "BMA/GGAL", "ALUA/TXAR", "TGSU2/TGNO4", "PESOS - 7D/PESOS - 1D"]);
  expect(new Set(watch.map(p => p.id)).size).toBe(8);
});
it("preserves custom rows, pair IDs and operations; removed defaults stay removed across reload", async () => {
  const { watch } = await resolveDefaultWatch(async symbol => [instrument(symbol)]);
  const custom = { id: "custom", a: instrument("SPY"), b: instrument("GGAL") }, existing = { ...watch[4], id: "saved-bma" };
  const book = { ...emptyBook(), watch: [custom, existing], operations: [operation()] };
  const seeded = applyDefaultWatch(book, watch);
  expect(seeded.watch.slice(0, 2)).toEqual(book.watch); expect(seeded.watch).toHaveLength(9); expect(seeded.operations).toBe(book.operations);
  const removed = validateBook(JSON.parse(JSON.stringify({ ...seeded, watch: seeded.watch.filter(p => p.id !== "saved-bma") })));
  expect(applyDefaultWatch(removed, watch)).toBe(removed);
  expect(applyDefaultWatch(removed, watch, true).watch).toHaveLength(9);
  expect(applyDefaultWatch(seeded, watch, true).watch).toEqual(seeded.watch);
});
it("does not guess missing or ambiguous tickers or overwrite a full monitor", async () => {
  const result = await resolveDefaultWatch(async symbol => symbol === "AL30" ? [instrument("AL30"), { ...instrument("other"), symbol: "AL30" }] : symbol === "AL30C" ? [] : [instrument(symbol)]);
  expect(result.missing).toEqual(["AL30/AL30D", "AL30/AL30C", "AL30D/AL30C", "GD30/AL30"]);
  expect(result.watch).toHaveLength(DEFAULT_WATCH_PAIRS.length - result.missing.length);
  const full = { ...emptyBook(), watch: Array.from({ length: 100 }, (_, i) => ({ id: String(i), a: instrument("custom" + i), b: instrument("GGAL") })) };
  expect(() => applyDefaultWatch(full, result.watch)).toThrow(/espacio/); expect(full.watch).toHaveLength(100);
});
it("allows TNA pairs in the monitor but never accepts a rate as an operation entry price", () => {
  const rate = { ...instrument("bm_MERV_PESOS_7D"), cfi: "RPXXXX", symbol: "PESOS - 7D", settlement: "TNA" };
  expect(validateBook({ ...emptyBook(), watchDefaults: 1, watch: [{ id: "rates", a: rate, b: instrument("B") }] }).watch).toHaveLength(1);
  const o = operation(); o.legs[0].instrument = rate; expect(() => validateOperation(o)).toThrow(/TNA/);
  expect(() => validateBook({ ...emptyBook(), watchDefaults: 2 })).toThrow();
});
it("uses Premium DDMM defaults by CFI, equity VAT included and no broker commission", () => {
  for (const [cfi, fee] of [["ESXXXX", .0847], ["EMXXXX", .0847], ["DBXXXX", .01], ["DBXXFR", .01], ["DYXTXR", .001], ["OCASPS", .01], ["FXXXSX", .01]] as const)
    expect(defaultMarketRights({ cfi, market: "bm" })).toBe(fee);
  expect(defaultMarketRights({ cfi: "ESXXXX", market: "rx" })).toBeUndefined();
  expect(defaultMarketRights({ cfi: "UNKNOWN", market: "bm" })).toBeUndefined();
});
it("calculates the instrument header's daily price change independently of the pair ratio", () => {
  expect(dailyPriceChange({ last: 110, reference: 100 })).toBeCloseTo(10);
  expect(dailyPriceChange({ last: 90, reference: 100 })).toBeCloseTo(-10);
  expect(dailyPriceChange({ last: 100, reference: 100 })).toBe(0);
  for (const quote of [undefined, { last: 100 }, { last: 100, reference: 0 }, { last: 110, reference: 100, issue: "disconnected" }, { last: Infinity, reference: 100 }, { last: 1e308, reference: 1e-308 }]) expect(dailyPriceChange(quote)).toBeUndefined();
});
it("inverts only the watched pair, retains its row ID/order, and leaves the ledger unchanged", () => {
  const pair = { id: "pair", a: instrument("A"), b: instrument("B") }, other = { id: "other", a: instrument("C"), b: instrument("D") };
  const book = { ...emptyBook(), watchDefaults: 1 as const, watch: [pair, other], operations: [operation()] };
  const next = invertWatchPair(book, pair.id);
  expect(next.watch).toEqual([{ ...pair, a: pair.b, b: pair.a }, other]); expect(next.operations).toBe(book.operations);
  expect(book.watch[0]).toBe(pair); expect(next.watchDefaults).toBe(1);
  const original = calculateRatio({ last: 110, reference: 100 }, { last: 100, reference: 100 });
  const inverse = calculateRatio({ last: 100, reference: 100 }, { last: 110, reference: 100 });
  expect(original.change).toBeCloseTo(10); expect(inverse.change).toBeCloseTo(-9.090909);
  const duplicate = { ...book, watch: [pair, { ...pair, id: "inverse", a: pair.b, b: pair.a }] };
  expect(() => invertWatchPair(duplicate, "pair")).toThrow(/inverso/); expect(() => invertWatchPair(book, "gone")).toThrow(/no está/);
});
it("uses raw positive ratio targets and percentage minus one for equal currencies", () => {
  const a = instrument("A"), b = instrument("B"), usd = instrument("B", "USD");
  expect(parseGoal("0", a, b)).toBe(1); expect(parseGoal("-50", a, b)).toBe(.5);
  expect(parseGoal("6,5", a, b)).toBe(1.065); expect(parseGoal("", a, b)).toBeNull();
  expect(() => parseGoal("-100", a, b)).toThrow(); expect(() => parseGoal("0", a, usd)).toThrow();
  expect(parseGoal("1584,99", a, usd)).toBe(1584.99);
  expect(pairRatioLabel(1.065, a, b)).toMatch(/6,50/); expect(pairRatioLabel(1584.986387, a, usd)).toMatch(/1.584,99/);
  const o = operation(); o.targetRatio = 1; expect(goalInput(o)).toBe("0");
  expect(goalReached(o, 1)).toBe(true); o.direction = -1; expect(goalReached(o, .9)).toBe(true);
});
it("sizes same-currency B using entry prices, nominal factors and lots", () => {
  const a = instrument("A"), b = instrument("B");
  expect(counterpart(100, 100, 50, 1, 1, 1, a, b)).toBe(200);
  expect(counterpart(101, 100, 50, 1, 1, 10, a, b)).toBe(200);
});
it("copies mixed-currency nominal quantities without FX, prices or silent lot rounding", () => {
  const a = instrument("AL30"), b = instrument("AL30D", "USD");
  expect(counterpart(137, 80000, 50, .01, .01, 1, a, b)).toBe(137);
  expect(counterpart(250, 81000, 53, .01, 1, 1, a, b)).toBe(250);
  expect(counterpart(103, NaN, NaN, NaN, NaN, 10, a, b)).toBe(103);
  expect(counterpart(100.5, 80000, 50, .01, .01, 1, a, b)).toBeNaN();
  const o = operation(); o.legs[0].quantity = 103; o.legs[1].instrument = b; o.legs[1].quantity = 103; o.legs[1].step = 10;
  expect(() => validateOperation(o)).toThrow(/lotes/);
});
it("charges entry and estimated exit fees on both long and short", () => {
  const o = operation(), quotes = { A: { last: 110 }, B: { last: 45 } };
  const p = operationPnl(o, quotes)[0];
  expect(p.gross).toBe(2000); expect(p.commission).toBe(400); expect(p.ddmm).toBe(59);
  expect(p.net).toBe(1541); expect(p.realized).toBe(0); expect(p.pending).toBe(1541);
  o.legs.forEach(l => { l.factor = .01; }); expect(operationPnl(o, quotes)[0].net).toBeCloseTo(15.41);
});
it("freezes partial close history and realized P&L across market updates and reloads", () => {
  const o = closeOperation(operation(), .25, [110, 45], exitAt);
  expect(o.legs.map(l => l.exits[0].quantity)).toEqual([25, 50]);
  const first = operationPnl(o, { A: { last: 110 }, B: { last: 45 } })[0];
  const next = operationPnl(o, { A: { last: 130 }, B: { last: 40 } })[0];
  expect(next.realized).toBe(first.realized); expect(first.realized).toBeCloseTo(1541 / 4);
  expect(next.net).not.toBe(first.net);
  const closed = closeOperation(o, 1, [120, 40], exitAt); expect(isClosed(closed)).toBe(true);
  expect(operationPnl(closed, {})[0].pending).toBe(0); expect(operationPnl(closed, {})[0].net).toBe(operationPnl(closed, {})[0].realized);
  expect(validateBook(JSON.parse(JSON.stringify({ ...emptyBook(), operations: [closed] })))).toMatchObject({ operations: [closed] });
});
it("separates currencies, preserves realized when quotes fail, and rejects unit drift", () => {
  const o = closeOperation(operation(), .25, [110, 45], exitAt); o.legs[1].instrument.currency = "USD";
  const p = operationPnl(o, { A: { last: 110 } });
  expect(p.map(x => x.currency)).toEqual(["ARS", "USD"]); expect(p[0].net).toBeDefined(); expect(p[1].net).toBeUndefined(); expect(p[1].realized).toBeDefined();
  expect(operationPnl(o, { A: { last: 110, amountFactor: .01 }, B: { last: 45 } })[0].issue).toMatch(/unidad/);
  expect(currentRatio(o, { A: { last: 110, issue: "stale" }, B: { last: 45 } })).toBeUndefined();
});
it("edits the same record, keeps closes and prevents invalid quantity or identity corrections", () => {
  const o = closeOperation(operation(), .25, [110, 45], exitAt), draft = structuredClone(o); draft.legs[0].entry = 101; draft.legs[0].exits = [];
  const changed = correctOperation(o, draft); expect(changed.id).toBe(o.id); expect(changed.legs[0].exits).toEqual(o.legs[0].exits);
  draft.legs[0].quantity = 24; expect(() => correctOperation(o, draft)).toThrow(/cantidad/);
  draft.legs[0].quantity = 100; draft.legs[0].instrument.id = "OTHER"; expect(() => correctOperation(o, draft)).toThrow(/conservan/);
  const reduced = structuredClone(o); reduced.legs[0].quantity = 25;
  expect(isClosed(closeOperation(correctOperation(o, reduced), 1, [110, 45], exitAt))).toBe(true);
});
it("rejects corrupt storage, duplicates, future dates and fractional invalid lots", () => {
  for (const invalid of [null, {}, { ...emptyBook(), operations: [null] }, { ...emptyBook(), operations: [operation(), operation()] }]) expect(() => validateBook(invalid)).toThrow();
  const o = operation(); o.legs[0].quantity = 1.1; expect(() => validateOperation(o)).toThrow();
  o.legs[0].quantity = 100; o.openedAt = "2999-01-01T00:00:00.000Z"; expect(() => validateOperation(o)).toThrow();
});
