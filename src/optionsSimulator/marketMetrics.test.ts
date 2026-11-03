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
