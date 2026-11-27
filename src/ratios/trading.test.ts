import { expect, it } from "vitest";
import { applyDefaultWatch, bestBookPrice, DEFAULT_WATCH_PAIRS, resolveDefaultWatch, closeOperation, closeOperationByQuantity, partialCloseQuantities, correctOperation, counterpart, currentRatio, dailyPriceChange, defaultMarketRights, emptyBook, goalInput, goalReached, invertWatchPair, isClosed, operationPnl, pairRatioLabel, parseGoal, validateBook, validateOperation, type RatioOperation, type TradingInstrument } from "./trading";
import { calculateRatio, instrumentDetail, pairLabel } from "./model";
import { canTradeReference, closeMetrics, closeOperationIndependently, currentSpread, isMonitorOnly, parseSpreadGoal, recordedCloses, remaining, reviseRecordedClose, spreadAt, spreadGoalReached, tradingBookSchema } from "./trading";

const instrument = (id: string, currency = "ARS"): TradingInstrument => ({ id, symbol: id, market: "bm", currency, settlement: "2", cfi: "ESXXXX", amountFactor: 1, quantityStep: 1, quantityUnit: "nominales" });
const defaultInstrument = (symbol: string): TradingInstrument => symbol === "DLR/SPOT" ? { ...instrument("rx_DDF_DLR_SPOT"), symbol, market: "rx", settlement: "Referencia", cfi: "MRIXXX", monitorOnly: true } : instrument(symbol, symbol === "AL30D" ? "USD" : symbol === "AL30C" ? "EXT" : "ARS");
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
it("retains the optional comparison reference across storage and excludes spot references from the A/B legs", () => {
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
it("retains the exact future reference while still excluding it from the A/B legs", () => {
  const c: TradingInstrument = { id: "rx_DDF_DLR_DIC26", symbol: "DLR/DIC26", market: "rx", currency: "ARS", settlement: "Futuro", cfi: "FXXXSX", quantityUnit: "contratos", monitorOnly: true };
  const book = { ...emptyBook(), schema: 2 as const, watch: [{ id: "future", a: instrument("AL30"), b: instrument("AL30D", "USD"), c }] };
  expect(validateBook(JSON.parse(JSON.stringify(book)))).toEqual(book);
  expect(isMonitorOnly(c)).toBe(true);
  expect(instrumentDetail(c)).toContain("Futuro · referencia");
  const op = operation(); op.legs[0].instrument = c;
  expect(() => validateOperation(op)).toThrow(/referencias/);
});
it("resolves ten defaults including both AL30 dollar spreads with the native official reference", async () => {
  const { watch, missing } = await resolveDefaultWatch(async symbol => [defaultInstrument(symbol), { ...instrument(symbol + " CI"), symbol: symbol + " CI" }, { ...instrument("rx-" + symbol), market: "rx", symbol }]);
  expect(missing).toEqual([]);
  expect(watch.map(pairLabel)).toEqual(["MEP AL30", "CCL AL30", "CANJE AL30", "GD30/AL30", "BMA/GGAL", "ALUA/TXAR", "TGSU2/TGNO4", "PESOS - 7D/PESOS - 1D", "MEP AL30 vs DLR/SPOT", "CCL AL30 vs DLR/SPOT"]);
  expect(new Set(watch.map(p => p.id)).size).toBe(10);
});
it("omits both dollar spreads when the official native spot is absent, then restores them without duplicating MEP or CCL", async () => {
  const missing = await resolveDefaultWatch(async symbol => [instrument(symbol)]);
  expect(missing.watch).toHaveLength(8);
  expect(missing.missing).toEqual(["(AL30/AL30D) / DLR/SPOT", "(AL30/AL30C) / DLR/SPOT"]);
  const base = applyDefaultWatch(emptyBook(), missing.watch);
  const complete = await resolveDefaultWatch(async symbol => [defaultInstrument(symbol)]);
  expect(applyDefaultWatch(base, complete.watch)).toBe(base);
  const restored = applyDefaultWatch(base, complete.watch, true);
  expect(restored.watch).toHaveLength(10); expect(restored.watch.slice(0, 8)).toEqual(base.watch);
  expect(restored.schema).toBe(2); expect(restored.watch.slice(-2).every(p => p.c?.id === "rx_DDF_DLR_SPOT")).toBe(true);
  expect(applyDefaultWatch(restored, complete.watch, true).watch).toEqual(restored.watch);
});
it("preserves custom rows, pair IDs and operations; removed defaults stay removed across reload", async () => {
  const { watch } = await resolveDefaultWatch(async symbol => [defaultInstrument(symbol)]);
  const custom = { id: "custom", a: instrument("SPY"), b: instrument("GGAL") }, existing = { ...watch[4], id: "saved-bma" };
  const book = { ...emptyBook(), watch: [custom, existing], operations: [operation()] };
  const seeded = applyDefaultWatch(book, watch);
  expect(seeded.watch.slice(0, 2)).toEqual(book.watch); expect(seeded.watch).toHaveLength(11); expect(seeded.operations).toBe(book.operations);
  const removed = validateBook(JSON.parse(JSON.stringify({ ...seeded, watch: seeded.watch.filter(p => p.id !== "saved-bma") })));
  expect(applyDefaultWatch(removed, watch)).toBe(removed);
  expect(applyDefaultWatch(removed, watch, true).watch).toHaveLength(11);
  expect(applyDefaultWatch(seeded, watch, true).watch).toEqual(seeded.watch);
});
it("does not guess missing or ambiguous tickers or overwrite a full monitor", async () => {
  const result = await resolveDefaultWatch(async symbol => symbol === "AL30" ? [instrument("AL30"), { ...instrument("other"), symbol: "AL30" }] : symbol === "AL30C" ? [] : [defaultInstrument(symbol)]);
  expect(result.missing).toEqual(["AL30/AL30D", "AL30/AL30C", "AL30D/AL30C", "GD30/AL30", "(AL30/AL30D) / DLR/SPOT", "(AL30/AL30C) / DLR/SPOT"]);
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
it("corrects an older paired close and reopens the remaining balance without rewriting later exits", () => {
  const first = closeOperation(operation(), .25, [110, 45], exitAt);
  const later = "2026-01-03T13:00:00.000Z";
  const closed = closeOperation(first, 1, [120, 40], later);
  const [newer, older] = recordedCloses(closed);
  expect([newer.at, older.at]).toEqual([later, exitAt]);
  expect(older.entries.map(e => [e.leg, e.quantity])).toEqual([[0, 25], [1, 50]]);
  const corrected = reviseRecordedClose(closed, older.key, [{ quantity: 20, price: 105 }, { quantity: 40, price: 46 }]);
  expect(corrected.legs.map(remaining)).toEqual([5, 10]);
  expect(corrected.legs.map(l => l.exits[1])).toEqual(closed.legs.map(l => l.exits[1]));
  expect(corrected.legs.map(l => l.exits[0].at)).toEqual([exitAt, exitAt]);
  expect(operationPnl(corrected, {})[0].realized).toBeCloseTo(2825.32);
  expect(isClosed(closed)).toBe(true);
  expect(() => reviseRecordedClose(closed, older.key, [{ quantity: 26, price: 105 }, { quantity: 50, price: 45 }])).toThrow(/saldo/);
  expect(() => reviseRecordedClose(closed, older.key, [{ quantity: 20, price: 0 }, { quantity: 40, price: 46 }])).toThrow(/precio/);
  const reopened = reviseRecordedClose(corrected, newer.key, null);
  expect(reopened.legs.map(remaining)).toEqual([80, 160]);
  const restored = reviseRecordedClose(reopened, older.key, null);
  expect(restored).toEqual(operation());
  expect(operationPnl(restored, {})[0].realized).toBe(0);
  expect(() => reviseRecordedClose(restored, older.key, null)).toThrow(/historial/);
});
it("identifies new closes independently of timestamps and preserves a historical one-leg close", () => {
  const first = closeOperation(operation(), .25, [110, 45], exitAt);
  const second = closeOperation(first, 1, [120, 40], exitAt);
  const [older, newer] = recordedCloses(second);
  expect([older, newer].map(close => close.entries.map(e => e.price))).toEqual([[110, 45], [120, 40]]);
  expect(older.key).not.toBe(newer.key);
  expect(reviseRecordedClose(second, newer.key, null)).toEqual(first);
  const malformed = structuredClone(second);
  malformed.legs[0].exits[1].closeId = malformed.legs[0].exits[0].closeId;
  expect(() => validateOperation(malformed)).toThrow(/inválidos/);

  const legacy = operation();
  legacy.legs[1].exits = [{ at: exitAt, quantity: 200, price: 45 }];
  const only = recordedCloses(legacy)[0];
  expect(only.entries.map(e => e.leg)).toEqual([1]);
  const corrected = reviseRecordedClose(legacy, only.key, [{ quantity: 100, price: 44 }]);
  expect(corrected.legs.map(remaining)).toEqual([100, 100]);
  expect(reviseRecordedClose(corrected, only.key, null)).toEqual(operation());
});
it("separates ambiguous legacy exits before and after deletion and still groups historical paired exits", () => {
  const legacy = operation();
  const firstA = { at: exitAt, quantity: 10, price: 100 };
  const secondA = { at: exitAt, quantity: 15, price: 105 };
  const pairedB = { at: exitAt, quantity: 30, price: 45 };
  legacy.legs[0].exits = [firstA, secondA];
  legacy.legs[1].exits = [pairedB];
  const [single] = recordedCloses(legacy);
  expect(recordedCloses(legacy).map(group => group.entries.length)).toEqual([1, 1, 1]);
  const revised = reviseRecordedClose(legacy, single.key, null);
  expect(recordedCloses(revised).map(group => group.entries.length)).toEqual([1, 1]);
  expect(revised.legs.map(l => l.exits[0])).toEqual([expect.objectContaining(secondA), expect.objectContaining(pairedB)]);
  legacy.legs[0].exits = [secondA];
  expect(recordedCloses(legacy)[0].entries.map(e => e.leg)).toEqual([0, 1]);
  expect(reviseRecordedClose(legacy, recordedCloses(legacy)[0].key, null)).toEqual(operation());
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

it("calculates a proportional nominal close from either leg without current prices", () => {
  const o = operation();
  expect(partialCloseQuantities(o, 0, 30)).toEqual([30, 60]);
  expect(partialCloseQuantities(o, 1, 60)).toEqual([30, 60]);
  const mixed = operation(); mixed.legs[1].instrument.currency = "USD"; mixed.legs[1].quantity = 100;
  expect(partialCloseQuantities(mixed, 1, 37)).toEqual([37, 37]);
  mixed.legs[1].quantity = 80;
  expect(partialCloseQuantities(mixed, 0, 25)).toEqual([25, 20]);
});
it("uses the remaining proportion after rounded percentage closes and rounds only the automatic leg", () => {
  const o = operation(); o.legs[1].quantity = 199;
  const partial = closeOperation(o, .25, [110, 45], exitAt);
  expect(partial.legs.map(l => l.exits[0].quantity)).toEqual([25, 49]);
  expect(partialCloseQuantities(partial, 0, 15)).toEqual([15, 30]);
  const lots = operation(); lots.legs[0].step = 10; lots.legs[1].step = 5; lots.legs[1].quantity = 195;
  expect(partialCloseQuantities(lots, 0, 30)).toEqual([30, 60]);
  expect(partialCloseQuantities(lots, 1, 30)).toEqual([20, 30]);
  expect(partialCloseQuantities(lots, 0, 100)).toEqual([100, 195]);
  expect(partialCloseQuantities(lots, 1, 195)).toEqual([100, 195]);
});
it("rejects invalid nominal closes and closes below one automatic lot without changing the record", () => {
  const o = operation(), before = JSON.stringify(o);
  for (const amount of [0, -1, NaN, Infinity, 1.5, 101, 1e13]) expect(() => partialCloseQuantities(o, 0, amount)).toThrow();
  o.legs[0].step = 10; expect(() => partialCloseQuantities(o, 0, 25)).toThrow(/múltiplo/);
  o.legs[0].step = 1; o.legs[1].quantity = 10; o.legs[1].step = 10;
  expect(() => partialCloseQuantities(o, 0, 1)).toThrow(/lote/);
  const original = operation();
  for (const prices of [[0, 10], [10, NaN], [Infinity, 10]]) expect(() => closeOperationByQuantity(original, 0, 25, prices as [number, number], exitAt)).toThrow();
  expect(JSON.stringify(original)).toBe(before);
});
it("persists nominal exit history and keeps realized P&L fixed across subsequent market updates", () => {
  const original = operation(), snapshot = JSON.stringify(original);
  const closed = closeOperationByQuantity(original, 1, 60, [110, 45], exitAt);
  const closeId = closed.legs[0].exits[0].closeId;
  expect(closeId).toBeTruthy();
  expect(closed.legs.map(l => l.exits)).toEqual([[{ quantity: 30, price: 110, at: exitAt, closeId }], [{ quantity: 60, price: 45, at: exitAt, closeId }]]);
  const first = operationPnl(closed, { A: { last: 110 }, B: { last: 45 } })[0];
  const second = operationPnl(closed, { A: { last: 130 }, B: { last: 40 } })[0];
  expect(first.realized).toBeCloseTo(1541 * .3); expect(second.realized).toBe(first.realized);
  expect(second.pending).not.toBe(first.pending); expect(JSON.stringify(original)).toBe(snapshot);
  expect(validateBook(JSON.parse(JSON.stringify({ ...emptyBook(), operations: [closed] })))).toMatchObject({ operations: [closed] });
  const done = closeOperationByQuantity(closed, 0, 70, [120, 40], exitAt);
  expect(isClosed(done)).toBe(true); expect(done.legs.map(l => l.exits.map(e => e.quantity))).toEqual([[30, 70], [60, 140]]);
  expect(() => closeOperationByQuantity(done, 0, 1, [110, 45], exitAt)).toThrow(/cerrada/);
});
it("can finish a historical position with one already closed leg and validates exit dates", () => {
  const o = operation(); o.legs[1].exits = [{ quantity: 200, price: 45, at: exitAt }];
  expect(partialCloseQuantities(o, 0, 50)).toEqual([50, 0]);
  const next = closeOperationByQuantity(o, 0, 50, [110, 45], exitAt);
  expect(next.legs[1]).toBe(o.legs[1]); expect(next.legs[0].exits[0].quantity).toBe(50);
  expect(() => partialCloseQuantities(o, 1, 1)).toThrow(/remanente/);
  expect(() => closeOperationByQuantity(o, 0, 50, [110, 45], at)).not.toThrow();
  const backdated = closeOperationByQuantity(next, 0, 50, [115, 45], at);
  expect(backdated.legs[0].exits.map(e => [e.at, e.price])).toEqual([[at, 115], [exitAt, 110]]);
  expect(() => closeOperationByQuantity(o, 0, 50, [110, 45], "2025-12-31T13:00:00.000Z")).toThrow(/cierres/);
});

it("tracks a manually entered reference and two independent goals with a historical partial close", () => {
  const o = operation(), c = defaultInstrument("DLR/SPOT"), goal = parseSpreadGoal("1", "below");
  o.reference = { instrument: c, entry: 195, divisor: 100, goal };
  o.targetRatio = 2.1;
  expect(spreadAt(100, 50, o.reference.entry, o.reference.divisor)).toBeCloseTo(2 / 1.95);
  const quotes = { A: { last: 100 }, B: { last: 50 }, [c.id]: { last: 200 } };
  expect(spreadGoalReached(goal, currentSpread(o, quotes))).toBe(true);
  expect(goalReached(o, currentRatio(o, quotes))).toBe(false);
  expect(spreadGoalReached(goal, currentSpread(o, { ...quotes, [c.id]: { last: 197 } }))).toBe(false);
  expect(currentSpread(o, { A: quotes.A, B: quotes.B })).toBeUndefined();
  expect(() => closeOperation(o, .25, [105, 50], exitAt)).toThrow(/precio de referencia C/);
  const closed = closeOperation(o, .25, [105, 50], exitAt, 200);
  const first = recordedCloses(closed)[0];
  expect(closeMetrics(closed, first)).toMatchObject({ priceC: 200, ratio: 2.1, spread: 1.05 });
  const corrected = reviseRecordedClose(closed, first.key, [{ quantity: 25, price: 106 }, { quantity: 50, price: 50 }], 212);
  expect(closeMetrics(corrected, recordedCloses(corrected)[0]).spread).toBeCloseTo(1);
  expect(tradingBookSchema([], [corrected])).toBe(4);
  expect(validateBook(JSON.parse(JSON.stringify({ ...emptyBook(), schema: 4, operations: [corrected] }))).operations).toHaveLength(1);
  expect(() => validateBook({ ...emptyBook(), schema: 3, operations: [corrected] })).toThrow(/esquema 4/);
  expect(operationPnl(o, quotes)).toEqual(operationPnl({ ...o, reference: undefined }, quotes));
});

it("allows a future only as the optional C leg and values and closes it in contracts", () => {
  const o = operation(), c: TradingInstrument = { ...instrument("DIC26"), market: "rx", settlement: "Futuro", cfi: "FXXXXX", quantityUnit: "contratos", monitorOnly: true };
  expect(canTradeReference(c)).toBe(true);
  expect(canTradeReference(defaultInstrument("DLR/SPOT"))).toBe(false);
  o.reference = { instrument: c, entry: 2 };
  o.legs = [o.legs[0], o.legs[1], { instrument: c, side: -1, quantity: 4, entry: 2, factor: 1000, step: 1, ddmm: 0, exits: [] }];
  const quotes = { A: { last: 100 }, B: { last: 50 }, [c.id]: { last: 1.9 } };
  expect(operationPnl(o, quotes)[0].gross).toBeCloseTo(400);
  expect(() => validateOperation({ ...o, reference: { ...o.reference!, entry: 2.1 } })).toThrow(/contrato/);
  expect(() => partialCloseQuantities(o, 0, 2)).toThrow(/lote/);
  expect(partialCloseQuantities(o, 2, 1)).toEqual([25, 50, 1]);
  const partial = closeOperationByQuantity(o, 2, 1, [100, 50, 1.9], exitAt), close = recordedCloses(partial)[0];
  expect(close.entries.map(entry => entry.leg)).toEqual([0, 1, 2]);
  expect(closeMetrics(partial, close).priceC).toBe(1.9);
  expect(() => correctOperation(partial, { ...partial, legs: [partial.legs[0], partial.legs[1]] })).toThrow(/conservan/);
  const full = closeOperation(partial, 1, [100, 50, 1.95], "2026-01-03T13:00:00.000Z");
  expect(isClosed(full)).toBe(true);
  expect(operationPnl(full, {})[0].gross).toBeCloseTo(250);
  expect(reviseRecordedClose(full, recordedCloses(full)[0].key, null)).toEqual(partial);
});

it("calculates a plain closing ratio from recorded prices rather than market prices", () => {
  const closed = closeOperation(operation(), 1, [120, 40], exitAt);
  const close = recordedCloses(closed)[0];
  expect(closeMetrics(closed, close)).toEqual({ priceC: undefined, ratio: 3, spread: undefined });
  const edited = reviseRecordedClose(closed, close.key, [{ quantity: 100, price: 110 }, { quantity: 200, price: 40 }]);
  expect(closeMetrics(edited, recordedCloses(edited)[0]).ratio).toBe(2.75);
});

it("reaches an inclusive spread objective at a floating-point boundary", () => {
  const below = parseSpreadGoal("-5", "below");
  expect(spreadGoalReached(below, spreadAt(71250.95, 50, 1500))).toBe(false);
  expect(spreadGoalReached(below, spreadAt(71250.95, 50, 1500.02))).toBe(true);
  expect(spreadGoalReached(parseSpreadGoal("6.5", "above"), 1.0649999999999997)).toBe(true);
});

it("records exits of the futures leg and the A/B legs on different dates", () => {
  const o = operation();
  const c: TradingInstrument = { ...instrument("DIC26"), market: "rx", settlement: "Futuro", cfi: "FXXXXX", quantityUnit: "contratos", monitorOnly: true };
  o.reference = { instrument: c, entry: 2 };
  o.legs = [o.legs[0], o.legs[1], { instrument: c, side: -1, quantity: 1, entry: 2, factor: 1000, step: 1, ddmm: 0, exits: [] }];
  expect(() => closeOperationIndependently(o, [0, 0, 2], [0, 0, 1.99], exitAt)).toThrow(/remanente/);
  expect(() => closeOperationIndependently(o, [25, 0, 0], [103, 0, 0], exitAt)).toThrow(/A y B/);
  const first = closeOperationIndependently(o, [25, 50, 0], [103, 51, 0], exitAt, 2.02);
  expect(first.legs.map(remaining)).toEqual([75, 150, 1]);
  expect(closeMetrics(first, recordedCloses(first)[0]).priceC).toBe(2.02);
  const second = closeOperationIndependently(first, [0, 0, 1], [0, 0, 1.99], "2026-01-03T13:00:00.000Z");
  expect(second.legs.map(remaining)).toEqual([75, 150, 0]);
  expect(recordedCloses(second)[0].entries.map(e => e.leg)).toEqual([2]);
  const percent = closeOperation(second, .25, [103, 51, 0], "2026-01-04T13:00:00.000Z", 2.02);
  expect(recordedCloses(percent)[0].entries.map(e => e.quantity)).toEqual([18, 37]);
  expect(percent.legs.map(remaining)).toEqual([57, 113, 0]);
});

it("validates A/B pairing against historical balances when inserting or correcting an exit", () => {
  const o = operation();
  const c: TradingInstrument = { ...instrument("DIC26"), market: "rx", settlement: "Futuro", cfi: "FXXXXX", quantityUnit: "contratos", monitorOnly: true };
  o.reference = { instrument: c, entry: 2 };
  o.legs = [o.legs[0], { ...o.legs[1], quantity: 50 }, { instrument: c, side: -1, quantity: 5, entry: 2, factor: 1000, step: 1, ddmm: 0, exits: [] }];
  const later = "2026-01-03T13:00:00.000Z";
  const paired = closeOperationIndependently(o, [50, 50, 0], [103, 51, 0], later, 2.02);
  expect(() => closeOperationIndependently(paired, [10, 0, 0], [103, 0, 0], exitAt)).toThrow(/fecha del cierre/);
  const solo = closeOperationIndependently(paired, [10, 0, 0], [103, 0, 0], later);
  expect(solo.legs.map(remaining)).toEqual([40, 0, 5]);
  const pairedKey = recordedCloses(solo).find(close => close.entries.length === 2)!.key;
  expect(() => reviseRecordedClose(solo, pairedKey, null)).toThrow(/cierres posteriores/);
  expect(() => reviseRecordedClose(solo, pairedKey, [{ quantity: 50, price: 103 }, { quantity: 49, price: 51 }])).toThrow(/cierres posteriores/);
  expect(() => correctOperation(solo, { ...solo, legs: [solo.legs[0], { ...solo.legs[1], quantity: 51 }, solo.legs[2]!] })).toThrow(/cierres posteriores/);
});
