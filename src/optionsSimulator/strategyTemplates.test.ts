import { describe, expect, it } from "vitest";
import type { Contract, Quote } from "./market";
import { expirySummary, initialSimulation, intrinsic, parseSimulation, resultAt } from "./model";
import { initialChoice, preferredOptionMarket, recipeGlyph, recipePayoff, recipePrices, strategyFamilies, strategyGlyph, strategyRecipe, type StrategyChoice, type StrategyFamily } from "./strategyTemplates";

const contracts: Contract[] = [80, 90, 100, 110, 120].flatMap(strike => (["call", "put"] as const).map(kind => ({
  id: `${kind}-${strike}`, symbol: `${kind} ${strike}`, kind, strike, underlyingId: "GGAL", expiration: "20261203",
  currency: "ARS", strikeCurrency: "ARS", settlement: "2", factor: 100,
})));
const choice = (family: StrategyFamily, change: Partial<StrategyChoice> = {}) => ({ ...initialChoice(family), ...change });
const rows = (selection: StrategyChoice, pool = contracts) => {
  const result = strategyRecipe(selection, pool, 100);
  if (!result.ok) throw Error(result.reason);
  return result.legs.map(item => [item.contract.id, item.side, item.ratio]);
};
describe("single-expiry option recipes", () => {
  it.each([
    [choice("option"), [["call-100", "buy", 1]]],
    [choice("option", { direction: "short", kind: "put" }), [["put-100", "sell", 1]]],
    [choice("vertical"), [["call-100", "buy", 1], ["call-110", "sell", 1]]],
    [choice("vertical", { direction: "short", kind: "put" }), [["put-100", "sell", 1], ["put-90", "buy", 1]]],
    [choice("butterfly"), [["call-90", "buy", 1], ["call-100", "sell", 2], ["call-110", "buy", 1]]],
    [choice("butterfly", { direction: "short", kind: "put" }), [["put-90", "sell", 1], ["put-100", "buy", 2], ["put-110", "sell", 1]]],
    [choice("ratio"), [["call-100", "sell", 1], ["call-110", "buy", 2]]],
    [choice("ratio", { direction: "short", kind: "put" }), [["put-100", "buy", 1], ["put-90", "sell", 2]]],
    [choice("strangle"), [["put-90", "buy", 1], ["call-110", "buy", 1]]],
    [choice("straddle", { direction: "short" }), [["call-100", "sell", 1], ["put-100", "sell", 1]]],
    [choice("iron-condor"), [["put-80", "buy", 1], ["put-90", "sell", 1], ["call-110", "sell", 1], ["call-120", "buy", 1]]],
    [choice("iron-condor", { reversed: true }), [["put-80", "sell", 1], ["put-90", "buy", 1], ["call-110", "buy", 1], ["call-120", "sell", 1]]],
    [choice("jade-lizard"), [["put-90", "sell", 1], ["call-110", "sell", 1], ["call-120", "buy", 1]]],
    [choice("jade-lizard", { reversed: true }), [["put-80", "buy", 1], ["put-90", "sell", 1], ["call-110", "sell", 1]]],
  ] as const)("resolves %j into explicit sides, kinds and ratios", (selection, expected) => expect(rows(selection)).toEqual(expected));
  it("includes exactly the eight requested option families and excludes unknown/calendar recipes", () => {
    expect(strategyFamilies.map(item => item.id)).toEqual(["option", "vertical", "butterfly", "ratio", "strangle", "straddle", "iron-condor", "jade-lizard"]);
    expect(strategyRecipe({ ...choice("option"), family: "calendar" as StrategyFamily }, contracts, 100).ok).toBe(false);
  });
  it("rejects mixed maturities, currencies and settlements before selecting legs", () => {
    for (const change of [{ expiration: "20270101" }, { settlement: "1" }, { currency: "USD" as const }])
      expect(strategyRecipe(choice("straddle"), [...contracts.slice(0, -1), { ...contracts.at(-1)!, ...change }], 100).ok).toBe(false);
  });
  it("never invents symmetric butterfly wings or chooses an ambiguous contract", () => {
    const irregular = contracts.filter(contract => [90, 100, 120].includes(contract.strike));
    expect(strategyRecipe(choice("butterfly"), irregular, 100).ok).toBe(false);
    const duplicate = [...contracts, { ...contracts.find(contract => contract.id === "call-100")!, id: "ambiguous" }];
    expect(rows(choice("option"), duplicate)[0][0]).not.toBe("call-100");
    expect(rows(choice("option"), duplicate)[0][0]).not.toBe("ambiguous");
  });
  it("requires real OTM strikes for strangle, condor and Jade Lizard", () => {
    for (const family of ["strangle", "iron-condor", "jade-lizard"] as const)
      expect(strategyRecipe(choice(family), contracts, 200).ok).toBe(false);
  });
});
describe("pricing references and shapes", () => {
  const quotes = Object.fromEntries(contracts.map(contract => [contract.id, {
    bid: { price: contract.strike === 100 ? 6 : 2, size: 100 }, ask: { price: contract.strike === 100 ? 7 : 3, size: 100 },
  }])) as Record<string, Quote>;
  it("copies ASK for buys and BID for sells, independently of glyph shape", () => {
    expect(recipePrices(strategyRecipe(choice("vertical"), contracts, 100), quotes, "ARS")).toEqual({ ok: true, premiums: [7, 2] });
    expect(recipePrices(strategyRecipe(choice("vertical", { direction: "short" }), contracts, 100), quotes, "ARS")).toEqual({ ok: true, premiums: [6, 3] });
  });
  it("rejects missing/crossed quotes, incompatible factors or exercise currency", () => {
    const recipe = strategyRecipe(choice("option"), contracts, 100);
    expect(recipePrices(recipe, undefined, "ARS").ok).toBe(false);
    expect(recipePrices(recipe, { ...quotes, "call-100": { bid: { price: 7, size: 10 }, ask: { price: 7, size: 10 } } }, "ARS").ok).toBe(false);
    for (const change of [{ factor: undefined }, { strikeCurrency: "USD" }]) {
      const pool = contracts.map(contract => contract.id === "call-100" ? { ...contract, ...change } : contract);
      expect(recipePrices(strategyRecipe(choice("option"), pool, 100), quotes, "ARS").ok).toBe(false);
    }
  });
  it("has a dynamic canonical glyph for every variant, even without current metadata", () => {
    for (const family of strategyFamilies) {
      const original = initialChoice(family.id);
      const other = { ...original, ...(family.mirror ? { reversed: true } : { direction: "short" as const }) };
      expect(strategyGlyph(original)).toMatch(/^M/); expect(strategyGlyph(other)).toMatch(/^M/);
      expect(strategyGlyph(original)).not.toBe(strategyGlyph(other));
    }
    expect(recipeGlyph({ ok: false, reason: "No data" }, undefined)).toBeUndefined();
  });
  it("retains the correct unlimited tails for ratio and reverse Jade Lizard", () => {
    const summary = (selection: StrategyChoice) => {
      const recipe = strategyRecipe(selection, contracts, 100);
      if (!recipe.ok) throw Error(recipe.reason);
      const input = initialSimulation("2026-11-03");
      input.multiplier = "1"; input.legs = recipe.legs.map((item, index) => ({ id: index + 1, kind: item.contract.kind, side: item.side,
        strike: String(item.contract.strike), premium: "0", contracts: String(item.ratio), volatility: "40" }));
      const parsed = parseSimulation(input); if (!parsed.ok) throw Error(parsed.errors.join());
      return expirySummary(parsed.strategy);
    };
    expect(summary(choice("ratio"))).toMatchObject({ maxProfit: Infinity, maxLoss: 10 });
    expect(summary(choice("ratio", { direction: "short" }))).toMatchObject({ maxLoss: Infinity, maxProfit: 10 });
    expect(summary(choice("jade-lizard"))).toMatchObject({ maxLoss: 90 });
    expect(summary(choice("jade-lizard", { reversed: true }))).toMatchObject({ maxLoss: Infinity });
  });
});
it("automatically selects one compatible market and prefers 24h, without currency conversion", () => {
  const pool = [...contracts, ...contracts.map(contract => ({ ...contract, id: contract.id + "ci", settlement: "1" })),
    ...contracts.map(contract => ({ ...contract, id: contract.id + "usd", currency: "USD" as const }))];
  expect(preferredOptionMarket(pool, "ARS")).toBe("ARS|2");
  expect(preferredOptionMarket(pool, "USD")).toBe("USD|2");
  expect(preferredOptionMarket(pool, undefined)).toBe("");
});

describe("priced strategy previews", () => {
  const quotes = Object.fromEntries(contracts.map(contract => {
    const premium = intrinsic(contract.kind, 100, contract.strike) + Math.max(2, 8 - Math.abs(contract.strike - 100) / 5);
    return [contract.id, { bid: { price: premium - .1, size: 100 }, ask: { price: premium + .1, size: 100 } }];
  })) as Record<string, Quote>;
  it.each([
    [choice("option"), -810, 810, Infinity],
    [choice("option", { direction: "short", kind: "put" }), 790, 9210, 790],
    [choice("vertical"), -220, 220, 780],
    [choice("butterfly"), 360, 640, 360],
    [choice("ratio"), -430, 1430, Infinity],
    [choice("ratio", { direction: "short" }), 370, Infinity, 1370],
    [choice("strangle"), -1220, 1220, Infinity],
    [choice("straddle", { direction: "short" }), 1580, Infinity, 1580],
    [choice("iron-condor"), 360, 640, 360],
    [choice("iron-condor", { reversed: true }), -440, 440, 560],
    [choice("jade-lizard"), 770, 8230, 770],
    [choice("jade-lizard", { reversed: true }), 770, Infinity, 770],
  ] as const)("prices %j with actual premiums, factor and exact global risk", (selection, atSpot, loss, profit) => {
    const payoff = recipePayoff(strategyRecipe(selection, contracts, 100), quotes, 100, "ARS");
    if (!payoff.ok) throw Error(payoff.reason);
    expect(resultAt(payoff.strategy, 100, "expiry")).toBeCloseTo(atSpot);
    if (loss === Infinity) expect(payoff.summary.maxLoss).toBe(Infinity);
    else expect(payoff.summary.maxLoss).toBeCloseTo(loss);
    if (profit === Infinity) expect(payoff.summary.maxProfit).toBe(Infinity);
    else expect(payoff.summary.maxProfit).toBeCloseTo(profit);
    for (const root of payoff.summary.equilibria.flatMap(point => [point.from, point.to]).filter(Number.isFinite)) {
      expect(payoff.points.some(point => point.price === root)).toBe(true);
      expect(resultAt(payoff.strategy, root, "expiry")).toBeCloseTo(0);
    }
  });
  it("includes fees without rebasing the profitable plateau to zero", () => {
    const payoff = recipePayoff(strategyRecipe(choice("iron-condor"), contracts, 100), quotes, 100, "ARS", 60);
    if (!payoff.ok) throw Error(payoff.reason);
    expect(payoff.summary.entry).toBeCloseTo(-300);
    expect(payoff.summary.maxProfit).toBeCloseTo(300); expect(payoff.summary.maxLoss).toBeCloseTo(700);
    expect(resultAt(payoff.strategy, 100, "expiry")).toBeCloseTo(300);
    expect(payoff.summary.equilibria.map(point => point.from)).toEqual([87, 113]);
  });
  it("does not invent a profitable region for a debit Condor that loses everywhere", () => {
    const uniform = Object.fromEntries(contracts.map(contract => [contract.id, { bid: { price: 4, size: 100 }, ask: { price: 5, size: 100 } }]));
    const payoff = recipePayoff(strategyRecipe(choice("iron-condor"), contracts, 100), uniform, 100, "ARS");
    if (!payoff.ok) throw Error(payoff.reason);
    expect(payoff.summary.entry).toBe(200); expect(payoff.summary.maxProfit).toBe(0);
    expect(payoff.points.every(point => point.result < 0)).toBe(true);
  });
  it("refuses unavailable prices, invalid fees and unsafe gross amounts before netting", () => {
    const recipe = strategyRecipe(choice("iron-condor"), contracts, 100);
    expect(recipePayoff(recipe, undefined, 100, "ARS").ok).toBe(false);
    expect(recipePayoff({ ok: true, legs: [] }, quotes, 100, "ARS").ok).toBe(false);
    expect(recipePayoff(recipe, quotes, 100, "ARS", NaN).ok).toBe(false);
    expect(recipePayoff(recipe, quotes, 100, "ARS", -1).ok).toBe(false);
    if (!recipe.ok) throw Error(recipe.reason);
    const large = { ...recipe, legs: recipe.legs.map(leg => ({ ...leg, ratio: 1e10 })) };
    expect(recipePayoff(large, quotes, 1e9, "ARS").ok).toBe(false);
  });
});
