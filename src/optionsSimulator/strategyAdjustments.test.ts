import { describe, expect, it } from "vitest";
import { exampleLegs, initialSimulation, MAX_CONTRACTS } from "./model";
import { adjustStrategyQuantity, shiftStrategyStrikes, type StrikeMarket } from "./strategyAdjustments";

const input = () => ({ ...initialSimulation("2026-11-03"), underlying: "GGAL", legs: exampleLegs("butterfly").map(leg => ({
  ...leg, securityId: `call-${leg.strike}`, symbol: `CALL ${leg.strike}`,
})) });
const market = (): StrikeMarket => {
  const contracts = [80, 90, 100, 110, 120].flatMap(strike => (["call", "put"] as const).map(kind => ({ id: `${kind}-${strike}`, symbol: `${kind.toUpperCase()} ${strike}`,
    kind, strike, underlyingId: "GGAL", expiration: "20261203", currency: "ARS" as const, strikeCurrency: "ARS", settlement: "2", factor: 100 })));
  return { underlying: "GGAL", expiry: "2026-12-03", currency: "ARS", contracts, quotes: Object.fromEntries(contracts.map(contract => [contract.id, {
    bid: { price: contract.strike / 10, size: 100 }, ask: { price: contract.strike / 10 + 1, size: 100 }, impliedVolatility: contract.strike / 2,
  }])) };
};

describe("quantity adjustments", () => {
  it("steps the whole integer ratio up/down without changing premiums, IV or direction", () => {
    const original = input().legs;
    expect(adjustStrategyQuantity(original, -1).ok).toBe(false);
    const up = adjustStrategyQuantity(original, 1);
    expect(up.ok && up.legs.map(leg => leg.contracts)).toEqual(["2", "4", "2"]);
    if (!up.ok) throw Error(up.reason);
    expect(adjustStrategyQuantity(up.legs, -1)).toEqual({ ok: true, legs: original });
    expect(adjustStrategyQuantity(up.legs, 1)).toEqual({ ok: true, legs: original.map(leg => ({ ...leg, contracts: String(Number(leg.contracts) * 3) })) });
    expect(original.map(leg => leg.contracts)).toEqual(["1", "2", "1"]);
  });
  it.each(["", "0", "1.5", "1e3", String(MAX_CONTRACTS + 1)])("rejects invalid quantity %s atomically", contracts => {
    const legs = input().legs; legs[1].contracts = contracts;
    expect(adjustStrategyQuantity(legs, 1).ok).toBe(false);
    expect(legs[0].contracts).toBe("1");
  });
  it("blocks empty strategies and exceeding the maximum total contracts", () => {
    expect(adjustStrategyQuantity([], 1).ok).toBe(false);
    const legs = input().legs.map(leg => ({ ...leg, contracts: String(MAX_CONTRACTS) }));
    expect(adjustStrategyQuantity(legs, 1).ok).toBe(false);
  });
});

describe("strike adjustments", () => {
  it("moves each native leg to its adjacent base and copies the selected side's premium and IV", () => {
    const original = input(), result = shiftStrategyStrikes(original, 1, market());
    if (!result.ok) throw Error(result.reason);
    expect(result.legs.map(leg => leg.strike)).toEqual(["100", "110", "120"]);
    expect(result.legs.map(leg => leg.premium)).toEqual(["11", "11", "13"]);
    expect(result.legs.map(leg => leg.volatility)).toEqual(["50", "55", "60"]);
    expect(result.legs.map(leg => leg.contracts)).toEqual(["1", "2", "1"]);
    expect(result.legs.map(leg => leg.id)).toEqual(original.legs.map(leg => leg.id));
    expect(shiftStrategyStrikes({ ...original, legs: result.legs }, 1, market()).ok).toBe(false);
    expect(original.legs.map(leg => leg.strike)).toEqual(["90", "100", "110"]);
  });
  it("uses the next listed base even for nonuniform gaps and preserves call/put and buy/sell", () => {
    const source = market(); source.contracts = source.contracts.filter(contract => contract.strike !== 110);
    const original = input(); original.legs = [{ ...original.legs[0], securityId: "put-100", symbol: "PUT 100", kind: "put", strike: "100", side: "sell" }];
    const result = shiftStrategyStrikes(original, 1, source);
    expect(result.ok && result.legs[0]).toMatchObject({ securityId: "put-120", kind: "put", side: "sell", strike: "120", premium: "12" });
  });
  it("blocks missing references, mixed/manual contexts, foreign markets and ambiguous bases", () => {
    const original = input();
    expect(shiftStrategyStrikes(original, 1).ok).toBe(false);
    expect(shiftStrategyStrikes({ ...original, expiry: "2027-01-01" }, 1, market()).ok).toBe(false);
    expect(shiftStrategyStrikes({ ...original, multiplier: "10" }, 1, market()).ok).toBe(false);
    expect(shiftStrategyStrikes({ ...original, legs: [...original.legs, exampleLegs("bull-call")[0]] }, 1, market()).ok).toBe(false);
    const source = market(); source.contracts.push({ ...source.contracts.find(contract => contract.id === "call-100")!, id: "ambiguous" });
    expect(shiftStrategyStrikes(original, 1, source).ok).toBe(false);
    const foreign = market(); foreign.contracts[0].settlement = "1";
    expect(shiftStrategyStrikes(original, 1, foreign).ok).toBe(false);
  });
  it("rejects unavailable/crossed quotes and wrong factors without partially moving the position", () => {
    const original = input();
    for (const change of ["missing", "crossed", "factor"] as const) {
      const source = market();
      if (change === "missing") source.quotes["call-120"].ask = undefined;
      if (change === "crossed") source.quotes["call-120"].bid = source.quotes["call-120"].ask;
      if (change === "factor") source.contracts.find(contract => contract.id === "call-120")!.factor = 200;
      expect(shiftStrategyStrikes(original, 1, source).ok).toBe(false);
      expect(original.legs[0].strike).toBe("90");
    }
  });
  it("preserves an absent native IV rather than inventing it", () => {
    const source = market(); source.quotes["call-100"].impliedVolatility = undefined;
    const result = shiftStrategyStrikes(input(), 1, source);
    expect(result.ok && result.legs[0].volatility).toBe("");
  });
  it("shifts fully manual legs one point while preserving entry data and bounds", () => {
    const original = initialSimulation("2026-11-03");
    const result = shiftStrategyStrikes(original, -1);
    expect(result.ok && result.legs).toEqual(original.legs.map(leg => ({ ...leg, strike: String(Number(leg.strike) - 1) })));
    original.legs[0].strike = "0,5";
    expect(shiftStrategyStrikes(original, -1).ok).toBe(false);
  });
});
