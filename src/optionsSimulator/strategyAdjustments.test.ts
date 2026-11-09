import { describe, expect, it } from "vitest";
import { exampleLegs, initialSimulation, MAX_CONTRACTS } from "./model";
import { adjustStrategyQuantity, adjustStrategyWidth, setStrategyPrice, shiftStrategyStrikes, strategyPriceReferences, type StrikeMarket } from "./strategyAdjustments";
import { buildRoll, rollCandidates } from "./rollPosition";

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

describe("adjusting strategy width", () => {
  it("reprices only moved wings, keeping the middle leg and its edited inputs", () => {
    const draft = input(), book = market();
    draft.legs[1].premium = "7.25";
    delete book.quotes["call-100"];
    book.quotes["call-120"] = { bid: { price: 1e-7, size: 100 }, ask: { price: 1.2e-7, size: 100 }, impliedVolatility: 1e-7 };
    const wider = adjustStrategyWidth(draft, 1, book);
    expect(wider).toMatchObject({ ok: true, legs: [
      { securityId: "call-80", strike: "80", premium: "9" },
      { securityId: "call-100", strike: "100", premium: "7.25" },
      { securityId: "call-120", strike: "120", premium: "0.00000012", volatility: "0.0000001" },
    ] });
    expect(wider.ok && wider.legs[1]).toBe(draft.legs[1]);
    delete book.quotes["call-120"];
    expect(adjustStrategyWidth(draft, 1, book).ok).toBe(false);
    expect(draft.legs.map(leg => leg.strike)).toEqual(["90", "100", "110"]);
  });

  it("narrows manual spreads by one point per extreme and stops before they meet", () => {
    const draft = { ...input(), legs: exampleLegs("butterfly").map((leg, index) => ({ ...leg, strike: String(98 + 2 * index) })) };
    const narrower = adjustStrategyWidth(draft, -1);
    expect(narrower.ok && narrower.legs.map(leg => leg.strike)).toEqual(["99", "100", "101"]);
    expect(narrower.ok && adjustStrategyWidth({ ...draft, legs: narrower.legs }, -1).ok).toBe(false);
  });
});

describe("rolling an option position", () => {
  const sold = () => ({ ...input(), legs: [], position: { legs: [{ ...input().legs[1], contracts: "10", volatility: "40" }] } });
  it("finds either direction and prices the minimum at ASK/BID with fees on both legs", () => {
    const draft = sold(), book = market();
    book.quotes["call-110"].bid!.price = 8;
    const candidates = rollCandidates(draft, "call-100", .2, book);
    expect(candidates.ok && candidates.candidates.map(item => item.contract.strike)).toEqual([80, 90, 110, 120]);
    expect(candidates.ok && candidates.candidates.find(item => item.contract.id === "call-110")?.minimum).toBe(14);
    expect(buildRoll(draft, "call-100", "call-110", 14, .2, book)).toMatchObject({
      ok: true, net: 155.6, costs: 44.4, legs: [
        { securityId: "call-100", side: "buy", contracts: "10", premium: "11", volatility: "50", rollSeriesId: "call-100" },
        { securityId: "call-110", side: "sell", contracts: "14", premium: "8" },
      ],
    });
    expect(draft.position.legs[0].side).toBe("sell");
    expect(draft.legs).toHaveLength(0);
  });
  it("rejects insufficient depth, ambiguous rows and adjustments on either leg", () => {
    const draft = sold(), book = market();
    book.quotes["call-110"].bid!.size = 4;
    expect(buildRoll(draft, "call-100", "call-110", 10, 0, book).ok).toBe(false);
    expect(buildRoll({ ...draft, legs: [{ ...draft.position.legs[0], side: "buy" }] }, "call-100", "call-90", 10, 0, book).ok).toBe(false);
    book.contracts.push({ ...book.contracts.find(item => item.id === "call-90")!, id: "duplicate" });
    expect(buildRoll(draft, "call-100", "call-90", 10, 0, book).ok).toBe(false);
  });
  it("rejects unverified book depth on either side even when the displayed size is sufficient", () => {
    const book = market();
    book.quotes["call-110"].bid!.depthUnverified = true;
    expect(buildRoll(sold(), "call-100", "call-110", 10, 0, book).ok).toBe(false);
    expect(buildRoll(sold(), "call-100", "call-90", 10, 0, book).ok).toBe(true);
    book.quotes["call-100"].ask!.depthUnverified = true;
    expect(rollCandidates(sold(), "call-100", 0, book).ok).toBe(false);
  });
  it("stores the premium precision used in the preview", () => {
    const draft = sold(), book = market();
    draft.multiplier = "100000";
    draft.position.legs[0].contracts = "40000000";
    for (const contract of book.contracts) contract.factor = 100000;
    book.quotes["call-100"].ask = { price: 10.00000000000001, size: 40000000 };
    book.quotes["call-110"].bid = { price: 10, size: 40000000 };
    expect(buildRoll(draft, "call-100", "call-110", 40000000, 0, book)).toMatchObject({
      ok: true, net: -.04, legs: [{ premium: "10.00000000000001" }, { premium: "10" }],
    });
  });
  it("closes a bought put at BID and caps the debit-free ASK purchase by depth and cash", () => {
    const draft = sold(), book = market();
    draft.position.legs[0] = { ...draft.position.legs[0], securityId: "put-100", kind: "put", side: "buy" };
    book.quotes["put-100"].bid = { price: 10, size: 10 };
    book.quotes["put-90"].ask = { price: 4, size: 30 };
    book.quotes["put-90"].bid = { price: 3, size: 30 };
    const maximum = (feePercent: number) => {
      const roll = rollCandidates(draft, "put-100", feePercent, book);
      return roll.ok && roll.candidates.find(candidate => candidate.contract.id === "put-90")?.maximum;
    };
    expect(maximum(2)).toBe(24);
    expect(maximum(2.05)).toBe(23);
    expect(maximum(92.3)).toBe(1);
    expect(maximum(92.31)).toBeUndefined();
    expect(buildRoll(draft, "put-100", "put-90", 24, 2, book)).toMatchObject({
      ok: true, net: 8, costs: 392, legs: [
        { securityId: "put-100", side: "sell", contracts: "10", premium: "10", rollSeriesId: "put-100" },
        { securityId: "put-90", side: "buy", contracts: "24", premium: "4" },
      ],
    });
    expect(buildRoll(draft, "put-100", "put-90", 25, .2, book)).toMatchObject({ ok: true, net: -40 });
    book.quotes["put-90"].ask.size = 20;
    expect(maximum(2)).toBe(20);
    expect(buildRoll(draft, "put-100", "put-90", 21, 0, book).ok).toBe(false);
    book.quotes["put-100"].bid.size = 9;
    expect(rollCandidates(draft, "put-100", 0, book).ok).toBe(false);
  });
  it("keeps the exact neutral roll neutral in the pricing control", () => {
    const draft = sold(), book = market();
    draft.position.legs[0].contracts = "5";
    book.quotes["call-100"].ask!.price = 64.87;
    book.quotes["call-110"].ask!.price = 66;
    book.quotes["call-110"].bid!.price = 65.13;
    const roll = buildRoll(draft, "call-100", "call-110", 5, .2, book);
    expect(roll.ok && roll.net).toBe(0);
    if (!roll.ok) throw Error(roll.reason);
    const references = strategyPriceReferences({ ...draft, legs: roll.legs }, book);
    expect(references.ok && references.currentTotal).toBe(0);
  });
  it("caps the suggested purchase at a quantity that passes monetary validation", () => {
    const draft = sold(), book = market();
    draft.multiplier = "100000";
    draft.position.legs[0].contracts = "60000000";
    draft.position.legs[0].side = "buy";
    for (const contract of book.contracts) contract.factor = 100000;
    book.quotes["call-100"].bid = { price: 10, size: 1e9 };
    book.quotes["call-90"].bid = { price: 4, size: 1e9 };
    book.quotes["call-90"].ask = { price: 5, size: 1e9 };
    const candidates = rollCandidates(draft, "call-100", 0, book);
    if (!candidates.ok) throw Error(candidates.reason);
    const target = candidates.candidates.find(candidate => candidate.contract.id === "call-90")!;
    expect(target.maximum).toBe(60143985);
    expect(buildRoll(draft, "call-100", "call-90", target.maximum!, 0, book).ok).toBe(true);
    expect(buildRoll(draft, "call-100", "call-90", target.maximum! + 1, 0, book).ok).toBe(false);
  });
  it("requires a nonnegative raw flow and leaves out-of-range destination IV blank", () => {
    const draft = sold(), book = market();
    draft.position.legs[0].contracts = "1";
    book.quotes["call-100"].bid = { price: .00008, size: 100 };
    book.quotes["call-100"].ask!.price = .00009;
    book.quotes["call-110"].bid!.price = .00001;
    book.quotes["call-110"].impliedVolatility = 900;
    const candidates = rollCandidates(draft, "call-100", 0, book);
    expect(candidates.ok && candidates.candidates.find(item => item.contract.id === "call-110")?.minimum).toBe(9);
    const withFees = rollCandidates(draft, "call-100", .2, book);
    expect(withFees.ok && withFees.candidates.find(item => item.contract.id === "call-110")?.minimum).toBe(10);
    expect(buildRoll(draft, "call-100", "call-110", 9, .2, book)).toMatchObject({ ok: true, net: -.000036 });
    expect(buildRoll(draft, "call-100", "call-110", 10, 100, book).ok).toBe(false);
    expect(buildRoll(draft, "call-100", "call-110", 8, 0, book)).toMatchObject({ ok: true, net: -.001 });
    expect(buildRoll(draft, "call-100", "call-110", 9, 0, book)).toMatchObject({ ok: true, net: 0,
      legs: [{ volatility: "50" }, { volatility: "" }] });
  });
});

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
  it("adjusts ten ratio units and clamps at either bound while preserving sides and proportions", () => {
    const original = input().legs;
    const up = adjustStrategyQuantity(original, 1, 10);
    if (!up.ok) throw Error(up.reason);
    expect(up.legs.map(leg => leg.contracts)).toEqual(["11", "22", "11"]);
    expect(up.legs.map(leg => leg.side)).toEqual(original.map(leg => leg.side));
    expect(adjustStrategyQuantity(up.legs, -1, 10)).toEqual({ ok: true, legs: original });
    const small = original.map(leg => ({ ...leg, contracts: String(Number(leg.contracts) * 3) }));
    expect(adjustStrategyQuantity(small, -1, 10)).toEqual({ ok: true, legs: original });
    const nearMax = original.map(leg => ({ ...leg, contracts: String(Number(leg.contracts) * (MAX_CONTRACTS / 2 - 2)) }));
    const capped = adjustStrategyQuantity(nearMax, 1, 10);
    expect(capped.ok && capped.legs.map(leg => Number(leg.contracts))).toEqual([MAX_CONTRACTS / 2, MAX_CONTRACTS, MAX_CONTRACTS / 2]);
    for (const steps of [0, -1, 1.5, NaN, Infinity, MAX_CONTRACTS + 1]) expect(adjustStrategyQuantity(original, 1, steps).ok).toBe(false);
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

describe("whole-strategy entry pricing", () => {
  it("prices Natural/Mid/Opposite with signed sides, ratios, multiplier and fixed total costs", () => {
    const original = { ...input(), costs: "15" };
    const references = strategyPriceReferences(original, market());
    if (!references.ok) throw Error(references.reason);
    expect([references.natural.total, references.mid.total, references.opposite.total, references.currentTotal]).toEqual([215, 15, -185, 315]);
    const double = strategyPriceReferences({ ...original, legs: original.legs.map(leg => ({ ...leg, contracts: String(Number(leg.contracts) * 2) })) }, market());
    expect(double.ok && [double.natural.total, double.mid.total, double.opposite.total]).toEqual([415, 15, -385]);
  });
  it("interpolates every premium together without modifying quantities, side or VI", () => {
    const original = { ...input(), costs: "15" };
    const adjusted = setStrategyPrice(original, .25, market());
    if (!adjusted.ok) throw Error(adjusted.reason);
    expect(adjusted.legs.map(leg => leg.premium)).toEqual(["9.75", "10.25", "11.75"]);
    expect(adjusted.legs.map(({ premium: _premium, ...leg }) => leg)).toEqual(original.legs.map(({ premium: _premium, ...leg }) => leg));
    const references = strategyPriceReferences({ ...original, legs: adjusted.legs }, market());
    expect(references.ok && references.currentTotal).toBe(115);
    expect(original.legs.map(leg => leg.premium)).toEqual(["13", "6", "2"]);
  });
  it("rejects missing book sides, incompatible contexts, invalid quantities and invalid interpolation", () => {
    const original = input(), source = market(); source.quotes['call-90'].bid = undefined;
    expect(strategyPriceReferences(original, source).ok).toBe(false);
    expect(setStrategyPrice(original, .5, source).ok).toBe(false);
    expect(strategyPriceReferences({ ...original, expiry: "2027-01-01" }, market()).ok).toBe(false);
    expect(strategyPriceReferences({ ...original, legs: exampleLegs('butterfly') }, market()).ok).toBe(false);
    expect(strategyPriceReferences({ ...original, legs: original.legs.map(leg => ({ ...leg, contracts: "0" })) }, market()).ok).toBe(false);
    for (const position of [-1, 2, NaN]) expect(setStrategyPrice(original, position, market()).ok).toBe(false);
  });
  it("never changes a chosen entry when fresh references arrive", () => {
    const original = input(), adjusted = setStrategyPrice(original, .5, market());
    if (!adjusted.ok) throw Error(adjusted.reason);
    const chosen = { ...original, legs: adjusted.legs }, source = market();
    source.quotes['call-90'].ask!.price = 20;
    const references = strategyPriceReferences(chosen, source);
    expect(references.ok && references.currentTotal).toBe(0);
    expect(chosen.legs.map(leg => leg.premium)).toEqual(["9.5", "10.5", "11.5"]);
  });
  it("rejects unsafe gross amounts before large buy/sell legs can cancel and lose fees", () => {
    const original = input(), leg = original.legs[1];
    original.costs = "1";
    original.legs = [{ ...leg, id: 1, side: "buy", contracts: "10000000000", premium: "5" },
      { ...leg, id: 2, side: "sell", contracts: "10000000000", premium: "5" }];
    const source = market();
    source.quotes['call-100'] = { bid: { price: 100000000, size: 10 }, ask: { price: 100000001, size: 10 } };
    expect(strategyPriceReferences(original, source)).toMatchObject({ ok: false, reason: expect.stringContaining('exposición bruta') });
    expect(setStrategyPrice(original, .5, source).ok).toBe(false);
    // Safe new quotes must not legitimize an existing unsafe entry either.
    original.legs = original.legs.map(item => ({ ...item, premium: "100000000" }));
    expect(strategyPriceReferences(original, market())).toMatchObject({ ok: false, reason: expect.stringContaining('exposición bruta') });
  });
});
