import { expect, it } from "vitest";
import { deriveOptionMetrics, viGradeColor } from "./marketMetrics";
import { Contract, Quote } from "./market";
const now = Date.parse("2026-11-03T18:00:00Z");
const contracts: Contract[] = [90, 100, 110].flatMap(strike => (["call", "put"] as const).map(kind => ({
  id: `${kind}-${strike}`, kind, strike, symbol: `${kind} ${strike}`, underlyingId: "GGAL", expiration: "20261120", currency: "ARS", settlement: "2",
})));
const settings = { now, minutes: "30", enabled: true, available: true };
function sample(): Record<string, Quote> { return Object.fromEntries(contracts.map(contract => [contract.id, {
  impliedVolatility: contract.kind === "call" ? contract.strike / 2 : contract.strike,
  delta: 0, changePercent: 0, nominalVolume: contract.kind === "call" ? 100 : 1000, lastTradeAt: now - 600000,
}])); }
it("separates calls and puts and excludes old VI from color scales without hiding the value", () => {
  const data = sample(); data["call-90"] = { ...data["call-90"], impliedVolatility: 900, lastTradeAt: now - 31 * 60000 };
  const result = deriveOptionMetrics(contracts, data, settings);
  expect(result.byId["call-90"]).toMatchObject({ impliedVolatility: 900, eligible: false });
  expect(result.scales.call).toMatchObject({ min: 50, max: 55, included: 2, volumeMax: 100 });
  expect(result.scales.put).toMatchObject({ min: 90, max: 110, included: 3, volumeMax: 1000 });
  expect(viGradeColor(result.byId["call-90"], result.scales.call)).toBeUndefined();
});
it.each([undefined, NaN, Infinity, now + 1, now - 86400000])("does not invent a current trade timestamp from %s", stamp => {
  const data = sample(); data["call-90"].lastTradeAt = stamp;
  expect(deriveOptionMetrics(contracts, data, settings).byId["call-90"].eligible).toBe(false);
});
it("ages the VI even without a quote change and allows an explicit filter override", () => {
  const data = sample(); data["call-90"].lastTradeAt = now - 30 * 60000;
  expect(deriveOptionMetrics(contracts, data, settings).byId["call-90"].eligible).toBe(true);
  expect(deriveOptionMetrics(contracts, data, { ...settings, now: now + 1 }).byId["call-90"].eligible).toBe(false);
  expect(deriveOptionMetrics(contracts, data, { ...settings, now: now + 1, enabled: false }).byId["call-90"].eligible).toBe(true);
});
it("keeps genuine zero metrics, rejects an invalid window and invents no range for a single quote", () => {
  const result = deriveOptionMetrics(contracts, sample(), { ...settings, minutes: "1.5" });
  expect(result.windowValid).toBe(false); expect(result.scales.call.min).toBeUndefined();
  expect(result.byId["call-90"]).toMatchObject({ delta: 0, changePercent: 0 });
  const one = deriveOptionMetrics(contracts.slice(0, 1), sample(), settings);
  expect(viGradeColor(one.byId["call-90"], one.scales.call)).toBeUndefined();
});

it("derives per-unit theta and Mid extrinsic only with compatible inputs, retaining zero/negative extrinsic", () => {
  const pool = contracts.map(contract => ({ ...contract, strikeCurrency: "ARS" }));
  const data = sample();
  for (const quote of Object.values(data)) { quote.bid = { price: 9, size: 10 }; quote.ask = { price: 11, size: 10 }; }
  const context = { ...settings, spot: 100, currency: "ARS", rate: 0, dividendYield: 0 };
  const result = deriveOptionMetrics(pool, data, context);
  expect(result.byId['call-90'].extrinsic).toBe(0);
  expect(result.byId['put-110'].extrinsic).toBe(0);
  expect(result.byId['call-100'].extrinsic).toBe(10);
  expect(result.byId['call-100'].theta).toBeLessThan(0);
  data['call-90'].bid!.price = 8; data['call-90'].ask!.price = 10;
  expect(deriveOptionMetrics(pool, data, context).byId['call-90'].extrinsic).toBe(-1);
  data['call-100'].impliedVolatility = undefined;
  const missing = deriveOptionMetrics(pool, data, context).byId['call-100'];
  expect(missing.theta).toBeUndefined(); expect(missing.extrinsic).toBe(10);
  data['call-100'].ask = undefined;
  expect(deriveOptionMetrics(pool, data, context).byId['call-100'].extrinsic).toBeUndefined();
  expect(deriveOptionMetrics(pool, data, { ...context, currency: "USD" }).byId['call-90'].extrinsic).toBeUndefined();
  expect(deriveOptionMetrics(pool, data, { ...context, available: false }).byId['call-90'].theta).toBeUndefined();
  expect(deriveOptionMetrics(pool, data, { ...context, now: Date.parse('2026-11-20T18:00:00Z') }).byId['call-90'].theta).toBeUndefined();
});

it("shows the VI model details only with compatible inputs and an eligible trade", () => {
  const pool = contracts.map(contract => ({ ...contract, strikeCurrency: "ARS" }));
  const data = sample();
  data["call-100"].lastTradeAt = now - 31 * 60000;
  const context = { ...settings, spot: 100, currency: "ARS", rate: .2, dividendYield: .01 };
  const result = deriveOptionMetrics(pool, data, context);
  expect(result.byId["call-100"].viDetails).toBeUndefined();
  expect(result.byId["call-100"].theta).toBeDefined();
  expect(result.byId["put-100"].viDetails).toMatchObject({ spot: 100, days: 17, rate: .2, dividendYield: .01 });
  expect(result.byId["put-100"].viDetails!.theoreticalDelta).toBeLessThan(0);
  expect(result.byId["put-100"].delta).toBe(0);
  expect(deriveOptionMetrics(pool, data, { ...context, enabled: false }).byId["call-100"].viDetails).toBeDefined();
  data["call-100"].lastTradeAt = now - 86400000;
  const previous = deriveOptionMetrics(pool, data, { ...context, enabled: false }).byId["call-100"];
  expect(previous.viDetails).toBeDefined();
  expect(previous.viTradeStatus).toContain("Última operación de otra fecha");
  data["call-100"].lastTradeAt = now + 1;
  expect(deriveOptionMetrics(pool, data, { ...context, enabled: false }).byId["call-100"].viDetails).toBeUndefined();
  expect(deriveOptionMetrics(pool, data, { ...context, currency: "USD" }).byId["put-100"].viDetails).toBeUndefined();
});

it("derives Bid and Ask extrinsic for calls and puts without requiring Mid or VI", () => {
  const pool = contracts.map(contract => ({ ...contract, strikeCurrency: "ARS" }));
  const data = sample();
  for (const quote of Object.values(data)) {
    quote.bid = { price: 10, size: 10 }; quote.ask = { price: 11, size: 10 };
    quote.impliedVolatility = undefined;
  }
  const context = { ...settings, spot: 100, currency: "ARS" };
  const result = deriveOptionMetrics(pool, data, context).byId;
  for (const id of ["call-90", "put-110"]) expect(result[id]).toMatchObject({ extrinsicBid: 0, extrinsicAsk: 1 });
  for (const id of ["call-100", "put-100", "call-110", "put-90"]) {
    expect(result[id]).toMatchObject({ extrinsicBid: 10, extrinsicAsk: 11 });
  }
  data["call-90"].bid!.price = 8; data["call-90"].ask = undefined;
  data["put-110"].bid = undefined; data["put-110"].ask!.price = 9;
  const oneSided = deriveOptionMetrics(pool, data, context).byId;
  expect(oneSided["call-90"].extrinsicBid).toBe(-2);
  expect(oneSided["call-90"].extrinsicAsk).toBeUndefined();
  expect(oneSided["put-110"].extrinsicBid).toBeUndefined();
  expect(oneSided["put-110"].extrinsicAsk).toBe(-1);
  expect(oneSided["call-90"].extrinsic).toBeUndefined();
  expect(oneSided["put-110"].extrinsic).toBeUndefined();
});

it.each(["bid", "ask"] as const)("rejects invalid %s inputs independently and requires a compatible spot", side => {
  const pool = contracts.map(contract => ({ ...contract, strikeCurrency: "ARS" }));
  const data = sample(), context = { ...settings, spot: 100, currency: "ARS" };
  const field = side === "bid" ? "extrinsicBid" : "extrinsicAsk";
  const otherField = side === "bid" ? "extrinsicAsk" : "extrinsicBid";
  for (const invalid of [0, -1, NaN, Infinity]) {
    for (const property of ["price", "size"] as const) {
      data["call-100"] = { bid: { price: 10, size: 1 }, ask: { price: 11, size: 1 } };
      data["call-100"][side]![property] = invalid;
      const cell = deriveOptionMetrics(pool, data, context).byId["call-100"];
      expect(cell[field]).toBeUndefined(); expect(cell[otherField]).toBeDefined();
    }
  }
  data["call-100"] = { bid: { price: 10, size: 1 }, ask: { price: 11, size: 1 } };
  for (const overrides of [{ available: false }, { spot: undefined }, { spot: 0 }, { spot: NaN }, { currency: "USD" }]) {
    expect(deriveOptionMetrics(pool, data, { ...context, ...overrides }).byId["call-100"][field]).toBeUndefined();
  }
  expect(deriveOptionMetrics(contracts, data, context).byId["call-100"][field]).toBeUndefined();
});

it.each([
  [10000.01, 10000, .01],
  [1000, 1000.001, .001],
  [1000000000.01, 1000000000, .01],
  [1.25e-7, 1e-7, 2.5e-8],
])("uses the quoted decimal difference for spot %s and strike %s", (spot, strike, expected) => {
  const pool = contracts.slice(0, 2).map(contract => ({ ...contract, strike, strikeCurrency: "ARS" }));
  const result = deriveOptionMetrics(pool, sample(), { ...settings, spot, currency: "ARS" });
  expect(pool.map(contract => result.byId[contract.id].intrinsic))
    .toEqual(spot > strike ? [expected, 0] : [0, expected]);
});
