import { describe, expect, it } from "vitest";
import { chartPriceRange, curve, dateDay, daysToExpiry, exampleLegs, expirySummary, initialSimulation, numeric, parseSimulation, resultAt, Simulation, standardDeviationLevels, theoreticalGreeks, theoreticalPrice } from "./model";

function strategy(change: Partial<Simulation> = {}) {
  const parsed = parseSimulation({ ...initialSimulation("2026-11-03"), ...change });
  if (!parsed.ok) throw Error(parsed.errors.join("\n"));
  return parsed.strategy;
}
describe("total profit and loss at expiry", () => {
  it("does not turn small valid losses into equilibrium intervals", () => {
    const value = strategy({ multiplier: "0.000001", legs: [
      { id: 1, kind: "call", side: "buy", strike: "1", premium: "0.000001", contracts: "1", volatility: "40" },
    ] });
    const summary = expirySummary(value);
    expect(resultAt(value, 0, "expiry")).toBeCloseTo(-1e-12, 18);
    expect(summary.equilibria).toHaveLength(1);
    expect(summary.equilibria[0].from).toBeCloseTo(1.000001, 12);
    expect(summary.equilibria[0].to).toBe(summary.equilibria[0].from);
  });
  it("keeps distinct nearby break-even prices separate", () => {
    const value = strategy({ multiplier: "1", legs: [
      { id: 1, kind: "call", side: "buy", strike: "1", premium: "0.00000001", contracts: "1", volatility: "40" },
      { id: 2, kind: "call", side: "sell", strike: "1.00000002", premium: "0", contracts: "2", volatility: "40" },
      { id: 3, kind: "call", side: "buy", strike: "1.00000004", premium: "0", contracts: "1", volatility: "40" },
    ] });
    const summary = expirySummary(value);
    expect(summary.equilibria).toHaveLength(2);
    expect(summary.equilibria[0].from).toBeCloseTo(1.00000001, 14);
    expect(summary.equilibria[1].from).toBeCloseTo(1.00000003, 14);
    expect(summary.equilibria.every(point => point.from === point.to)).toBe(true);
  });
  it("bull spread accounts for both premiums, per-leg contracts and entry costs", () => {
    const value = strategy({ legs: exampleLegs("bull-call").map(leg => ({ ...leg, contracts: "3" })), costs: "15" });
    expect(resultAt(value, 95, "expiry")).toBe(-1215);
    expect(resultAt(value, 105, "expiry")).toBe(285);
    expect(resultAt(value, 150, "expiry")).toBe(1785);
    const summary = expirySummary(value);
    expect(summary).toMatchObject({ entry: 1215, maxProfit: 1785, maxLoss: 1215 });
    expect(summary.equilibria[0].from).toBeCloseTo(104.05);
  });
  it.each([
    ["bear-put", 600, 400, [96]], ["straddle", Infinity, 1100, [89, 111]],
    ["butterfly", 700, 300, [93, 107]], ["iron-condor", 400, 600, [86, 114]],
  ] as const)("%s has exact extrema and equilibrium prices", (example, maxProfit, maxLoss, equilibria) => {
    const summary = expirySummary(strategy({ legs: exampleLegs(example) }));
    expect(summary.maxProfit).toBe(maxProfit); expect(summary.maxLoss).toBe(maxLoss);
    expect(summary.equilibria.map(point => point.from)).toEqual(equilibria);
  });
  it("short calls have unlimited loss even when the plotted range looks profitable", () => {
    const value = strategy({ rangeMin: "0", rangeMax: "50", legs: [{ ...exampleLegs("bull-call")[0], side: "sell", premium: "5" }] });
    expect(expirySummary(value)).toMatchObject({ maxLoss: Infinity, maxProfit: 500, equilibria: [{ from: 105, to: 105 }] });
    expect(curve(value).every(point => point.expiry === 500)).toBe(true);
  });
  it("put losses are bounded at zero underlying", () => {
    const value = strategy({ legs: [{ ...exampleLegs("bear-put")[0], side: "sell", premium: "5" }] });
    expect(expirySummary(value)).toMatchObject({ maxLoss: 9500, maxProfit: 500 });
  });
  it("represents entire equilibrium intervals, including an infinite flat tail", () => {
    const leg = { ...exampleLegs("bull-call")[0], premium: "0" };
    expect(expirySummary(strategy({ legs: [leg] })).equilibria).toEqual([{ from: 0, to: 100 }]);
    expect(expirySummary(strategy({ legs: [leg, { ...leg, id: 2, side: "sell" }] })).equilibria).toEqual([{ from: 0, to: Infinity }]);
  });
  it("includes every strike and equilibrium exactly in the graph", () => {
    const value = strategy({ rangeMin: "70", rangeMax: "130", legs: exampleLegs("butterfly") });
    const points = curve(value);
    expect(points.map(point => point.price)).toEqual(expect.arrayContaining([90, 93, 100, 107, 110]));
    expect(points[0].price).toBe(70); expect(points.at(-1)!.price).toBe(130);
  });
});
it("keeps the default chart near the strikes when nominal holdings add a distant equilibrium", () => {
  const value = strategy({ spot: "100", rangeMin: undefined, rangeMax: undefined, legs: [], position: {
    underlying: { quantity: 8, averageCost: "100" },
    legs: [
      { id: -1, kind: "call", side: "sell", strike: "100", premium: "5", contracts: "1", volatility: "40" },
      { id: -2, kind: "call", side: "buy", strike: "110", premium: "2", contracts: "1", volatility: "40" },
    ],
  } });
  const { equilibria } = expirySummary(value);
  expect(equilibria).toHaveLength(3);
  expect(equilibria.at(-1)?.from).toBe(187.5);
  const initial = chartPriceRange(value, equilibria, 0);
  expect(initial.rangeMin).toBeLessThan(equilibria[0].from);
  expect(initial.rangeMax).toBe(125);
  expect(chartPriceRange(value, equilibria, 2).rangeMax).toBeGreaterThan(187.5);
});
describe("European theoretical prices", () => {
  it("keeps exactly hedged decimal-factor call tails bounded in either direction", () => {
    for (const reverse of [false, true]) {
      const value = strategy({ multiplier: "0.1", legs: [
        { id: 1, kind: "call", side: reverse ? "sell" : "buy", strike: "100", premium: "0", contracts: "3", volatility: "40" },
        { id: 2, kind: "call", side: reverse ? "buy" : "sell", strike: "110", premium: "0", contracts: "1", volatility: "40" },
        { id: 3, kind: "call", side: reverse ? "buy" : "sell", strike: "120", premium: "0", contracts: "2", volatility: "40" },
      ] });
      const summary = expirySummary(value);
      expect(summary.maxProfit).toBeCloseTo(reverse ? 0 : 5);
      expect(summary.maxLoss).toBeCloseTo(reverse ? 5 : 0);
      expect(summary.equilibria).toEqual([{ from: 0, to: 100 }]);
      expect(resultAt(value, 10000, "expiry")).toBeCloseTo(reverse ? -5 : 5);
    }
  });
  it("matches analytical BSM sensitivities to finite price differences for calls and puts", () => {
    expect(theoreticalGreeks("call", 100, 100, 1, .2, .05, 0)?.theta).toBeCloseTo(-6.4140275 / 365, 8);
    for (const kind of ["call", "put"] as const) {
      const price = (spot: number, years: number, iv: number) => theoreticalPrice(kind, spot, 107, years, iv, .2, .03);
      const greeks = theoreticalGreeks(kind, 93, 107, .7, .35, .2, .03);
      const timeStep = 1e-5, spotStep = .1, ivStep = 1e-4;
      expect(greeks?.theta).toBeCloseTo((price(93, .7 - timeStep, .35) - price(93, .7 + timeStep, .35)) / (2 * timeStep * 365), 6);
      expect(greeks?.gamma).toBeCloseTo((price(93 + spotStep, .7, .35) - 2 * price(93, .7, .35) + price(93 - spotStep, .7, .35)) / spotStep ** 2, 5);
      expect(greeks?.vega).toBeCloseTo((price(93, .7, .35 + ivStep) - price(93, .7, .35 - ivStep)) / (2 * ivStep * 100), 5);
    }
    expect(theoreticalGreeks("call", 100, 100, 0, .2, 0, 0)).toBeUndefined();
    expect(theoreticalGreeks("call", 100, 100, 1, 0, 0, 0)).toBeUndefined();
    expect(theoreticalGreeks("call", 100, 100, 1, NaN, 0, 0)).toBeUndefined();
  });
  it("matches the standard S=K=100, r=5%, sigma=20%, T=1 benchmark", () => {
    expect(theoreticalPrice("call", 100, 100, 1, .2, .05, 0)).toBeCloseTo(10.45058, 4);
    expect(theoreticalPrice("put", 100, 100, 1, .2, .05, 0)).toBeCloseTo(5.573526, 4);
  });
  it.each([0, .03, .1])("satisfies put-call parity with dividend yield %s", dividend => {
    const call = theoreticalPrice("call", 93, 107, .7, .35, .2, dividend);
    const put = theoreticalPrice("put", 93, 107, .7, .35, .2, dividend);
    expect(call - put).toBeCloseTo(93 * Math.exp(-dividend * .7) - 107 * Math.exp(-.2 * .7), 8);
  });
  it("equals expiry for every leg when the scenario reaches maturity", () => {
    const value = strategy({ scenarioDate: "2026-12-03", legs: exampleLegs("iron-condor") });
    for (const price of [0, 70, 80, 86, 100, 114, 120, 1000]) expect(resultAt(value, price, "theoretical")).toBe(resultAt(value, price, "expiry"));
  });
  it("handles zero volatility, zero underlying and negative rates without NaN", () => {
    expect(theoreticalPrice("call", 100, 100, 1, 0, .05, 0)).toBeCloseTo(100 - 100 * Math.exp(-.05));
    expect(theoreticalPrice("put", 0, 100, 1, .2, -.03, 0)).toBeCloseTo(100 * Math.exp(.03));
    expect(theoreticalPrice("call", 0, 100, 1, .2, 0, 0)).toBe(0);
  });
  it("shifts each leg's VI in percentage points without repricing its entry premium", () => {
    const original = strategy(), shifted = strategy({ volatilityShift: "5" });
    expect(shifted.legs[0].volatility).toBe(.45);
    expect(shifted.legs[0].premium).toBe(original.legs[0].premium);
    expect(resultAt(shifted, 105, "expiry")).toBe(resultAt(original, 105, "expiry"));
    expect(resultAt(shifted, 105, "theoretical")).not.toBe(resultAt(original, 105, "theoretical"));
  });
  it("keeps expiry available without inventing a missing VI", () => {
    const legs = exampleLegs("straddle").map(leg => ({ ...leg, volatility: "" }));
    const value = strategy({ legs });
    expect(resultAt(value, 100, "expiry")).toBe(-1100);
    expect(resultAt(value, 100, "theoretical")).toBeNaN();
  });
});
describe("standard deviation reference levels", () => {
  const annual = () => strategy({ expiry: "2027-11-03", legs: exampleLegs("bull-call").map(leg => ({ ...leg, volatility: leg.strike === "100" ? "20" : "80" })) });
  it("uses S × IV × sqrt(T) at the nearest selected strike, independently of cursor and range", () => {
    const reference = standardDeviationLevels(annual())!;
    expect(reference).toMatchObject({ volatility: .2, move: 20, strikes: [100] });
    expect(reference.levels.map(level => level.price)).toEqual([60, 80, 120, 140]);
    const value = annual(); value.rangeMin = 90; value.rangeMax = 110;
    expect(standardDeviationLevels(value)).toEqual(reference);
  });
  it("averages equally near types and strikes without buy/sell or quantity weighting", () => {
    const value = annual(), leg = value.legs[0];
    value.legs = [{ ...leg, strike: 90, volatility: .2, contracts: 100 }, { ...leg, kind: "put", strike: 110, volatility: .4, side: "sell", contracts: 1 }];
    expect(standardDeviationLevels(value)!.volatility).toBeCloseTo(.3);
    value.legs.push({ ...value.legs[0], side: "sell", contracts: 3 });
    expect(standardDeviationLevels(value)!.volatility).toBeCloseTo(.3);
    value.legs[0].volatility = NaN;
    expect(standardDeviationLevels(value)).toBeUndefined();
  });
  it("scales with remaining time and effective scenario IV and collapses at zero time/VI", () => {
    const value = annual(); value.years = .25;
    expect(standardDeviationLevels(value)!.move).toBe(10);
    value.legs[0].volatility = .25;
    expect(standardDeviationLevels(value)!.move).toBe(12.5);
    value.years = 0;
    expect(standardDeviationLevels(value)!.levels.every(level => level.price === 100)).toBe(true);
    value.years = 1; value.legs[0].volatility = 0;
    expect(standardDeviationLevels(value)!.move).toBe(0);
  });
  it("keeps negative or offscreen approximate levels unchanged instead of clamping them", () => {
    const value = annual(); value.legs[0].volatility = 5;
    expect(standardDeviationLevels(value)!.levels.map(level => level.price)).toEqual([-900, -400, 600, 1100]);
    value.legs = [];
    expect(standardDeviationLevels(value)).toBeUndefined();
  });
});

describe("input validation", () => {
  it("counts calendar days to expiry without time-of-day or DST offsets", () => {
    expect(daysToExpiry("2026-11-26", "2026-11-03")).toBe(23);
    expect(daysToExpiry("2026-11-03", "2026-11-03")).toBe(0);
    expect(daysToExpiry("2026-11-02", "2026-11-03")).toBe(-1);
    expect(daysToExpiry("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysToExpiry("bad", "2026-11-03")).toBeUndefined();
  });
  it.each(["0", "1.5", "10000000001"])("rejects invalid per-leg total contracts %s", contracts => {
    const input = initialSimulation("2026-11-03"); input.legs[0].contracts = contracts;
    expect(parseSimulation(input).ok).toBe(false);
  });
  it("accepts the previous maximum total quantity without a hidden multiplier", () => {
    const input = initialSimulation("2026-11-03"); input.legs[0].contracts = "10000000000";
    const parsed = parseSimulation(input);
    expect(parsed.ok && parsed.strategy.legs[0].contracts).toBe(1e10);
  });
  it("does not attribute an adjustment's precision overflow to an included position", () => {
    const input = initialSimulation("2026-11-03");
    input.position = { legs: [], underlying: { quantity: 1, averageCost: "90" } };
    input.legs[0] = { ...input.legs[0], contracts: "10000000000", premium: "1000000000" };
    const parsed = parseSimulation(input);
    expect(parsed).toEqual({ ok: false, errors: [expect.stringContaining("el importe total supera la precisión admitida")],
      positionCorrections: new Set() });
  });
  it.each(["", "NaN", "Infinity", "1.000,50", "1,000.50", "1e6", "0x10"])("rejects ambiguous or missing numeric input %s", value => expect(numeric(value)).toBeNaN());
  it("accepts decimal comma and decimal point", () => { expect(numeric("12,5")).toBe(12.5); expect(numeric("12.5")).toBe(12.5); });
  it.each(["2026-02-29", "2026-11-31", "2026-1-01", ""])("rejects invalid date %s", date => expect(dateDay(date)).toBeNaN());
  it.each([
    { scenarioDate: "2026-11-02" }, { scenarioDate: "2026-12-04" }, { expiry: "2026-11-02" },
    { multiplier: "0" }, { costs: "-1" }, { rangeMin: "150", rangeMax: "100" }, { volatilityShift: "-41" },
  ])("blocks invalid scenario %j", change => expect(parseSimulation({ ...initialSimulation("2026-11-03"), ...change }).ok).toBe(false));
});
