import { expect, it } from "vitest";
import { closeOperation, correctOperation, counterpart, currentRatio, defaultMarketRights, emptyBook, goalInput, goalReached, isClosed, operationPnl, pairRatioLabel, parseGoal, validateBook, validateOperation, type RatioOperation, type TradingInstrument } from "./trading";

const instrument = (id: string, currency = "ARS"): TradingInstrument => ({ id, symbol: id, market: "bm", currency, settlement: "2", cfi: "ESXXXX", amountFactor: 1, quantityStep: 1, quantityUnit: "nominales" });
const at = "2026-01-01T13:00:00.000Z", exitAt = "2026-01-02T13:00:00.000Z";
const operation = (): RatioOperation => ({ id: "operation", openedAt: at, direction: 1, commission: 1, fx: 1, targetRatio: 1.2,
  legs: [ { instrument: instrument("A"), side: 1, quantity: 100, entry: 100, factor: 1, step: 1, ddmm: .1, exits: [] },
    { instrument: instrument("B"), side: -1, quantity: 200, entry: 50, factor: 1, step: 1, ddmm: .2, exits: [] } ] });
it("uses Premium DDMM defaults by CFI, equity VAT included and no broker commission", () => {
  for (const [cfi, fee] of [["ESXXXX", .0847], ["EMXXXX", .0847], ["DBXXXX", .01], ["DBXXFR", .01], ["DYXTXR", .001], ["OCASPS", .01], ["FXXXSX", .01]] as const)
    expect(defaultMarketRights({ cfi, market: "bm" })).toBe(fee);
  expect(defaultMarketRights({ cfi: "ESXXXX", market: "rx" })).toBeUndefined();
  expect(defaultMarketRights({ cfi: "UNKNOWN", market: "bm" })).toBeUndefined();
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
it("sizes B using entry prices, nominal factors, lots and explicit FX", () => {
  const a = instrument("A"), b = instrument("B");
  expect(counterpart(100, 100, 50, 1, 1, 1, a, b, NaN)).toBe(200);
  expect(counterpart(100, 80000, 50, .01, .01, 1, a, instrument("B", "USD"), 1 / 1600)).toBe(100);
  expect(counterpart(101, 100, 50, 1, 1, 10, a, b, 1)).toBe(200);
  expect(counterpart(100, 100, 50, 1, 1, 1, a, instrument("B", "USD"), NaN)).toBeNaN();
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
