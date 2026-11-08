import { expect, it } from "vitest";
import { selectCaucionReference, type CaucionTrade } from "./caucionRate";

const now = Date.parse("2026-11-09T15:00:00Z");
const trade = (days: number, overrides: Partial<CaucionTrade> = {}): CaucionTrade =>
  ({ currency: "ARS", days, tna: 30, tradedAt: now - 60_000, ...overrides });

it("prefers seven days, uses the newest trade at that term, and converts simple TNA to continuous ACT/365", () => {
  const selected = selectCaucionReference([trade(7, { tna: 25, tradedAt: now - 120_000 }), trade(6), trade(7)], now);
  expect(selected).toMatchObject({ days: 7, tna: 30 });
  expect(selected?.annualRate).toBeCloseTo(.29914028, 6);
});

it("falls back to the closest fresh ARS term and rejects stale, future, unsupported and undated data", () => {
  const trades = [trade(7, { tradedAt: now - 3_600_001 }), trade(7, { currency: "USD" }), trade(7, { tradedAt: now + 1 }),
    trade(6, { tradedAt: NaN }), trade(3), trade(5), trade(8), trade(7, { tna: 0 })];
  expect(selectCaucionReference(trades, now)).toMatchObject({ days: 5 });
  expect(selectCaucionReference(trades.filter(item => item.days !== 3 && item.days !== 5), now)).toBeUndefined();
});

it("uses the Buenos Aires trade date even within the age limit", () => {
  const midnight = Date.parse("2026-11-10T03:00:00Z");
  expect(selectCaucionReference([trade(7, { tradedAt: midnight - 1 })], midnight)).toBeUndefined();
});
