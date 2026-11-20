import { expect, it } from "vitest";
import { calculateRatio, defaultRatioFormat, exactTickerMatches, instrumentDetail, numberLabel, ratioLabel, ratioUpdatedAt, ratioTimeLabel } from "./model";
it("compares MEP against the official dollar and uses all three dated references", () => {
  const a = { last: 80000, reference: 78000, referenceDate: "2026-11-19" };
  const b = { last: 50, reference: 50, referenceDate: "2026-11-19" };
  const c = { last: 1572.5, reference: 1565, referenceDate: "2026-11-19" };
  const result = calculateRatio(a, b, c);
  expect(result.ratio).toBeCloseTo(1600 / 1572.5);
  expect(ratioLabel(result.ratio, "percent")).toBe("1,75%");
  expect(result.change).toBeCloseTo(((1600 / 1572.5) / (1560 / 1565) - 1) * 100);
  expect(calculateRatio(a, b, { ...c, referenceDate: "2026-11-18" })).toMatchObject({ ratio: result.ratio, referenceIssue: "Referencias de fechas distintas" });
  expect(calculateRatio(a, b, { last: c.last }).referenceIssue).toContain("referencia");
  for (const missing of [{}, { last: 0 }, { last: -1 }, { last: Infinity }, { issue: "Mercado desconectado" }]) {
    expect(calculateRatio(a, b, missing).ratio).toBeUndefined();
  }
});
it("resolves the official-dollar aliases to the native spot identity", () => {
  const spot = { id: "rx_DDF_DLR_SPOT", symbol: "DLR/SPOT", market: "rx", currency: "ARS", settlement: "Referencia", monitorOnly: true };
  for (const alias of ["Dólar oficial", "dolar usa", "DLR/SPOT", "Dólar"]) expect(exactTickerMatches(alias, [spot])).toEqual([spot]);
  expect(instrumentDetail(spot)).toContain("Dólar oficial");
});
it("defaults to percent only for matching known currencies and keeps USD and cable distinct", () => {
  const a = { id: "a", symbol: "A", market: "bm", settlement: "2", currency: "ARS" };
  const b = { ...a, id: "b", symbol: "B" };
  expect(defaultRatioFormat(a, b)).toBe("percent");
  expect(defaultRatioFormat({ ...a, currency: "USD" }, { ...b, currency: "USD" })).toBe("percent");
  expect(defaultRatioFormat(a, { ...b, currency: "USD" })).toBe("number");
  expect(defaultRatioFormat({ ...a, currency: "USD" }, { ...b, currency: "EXT" })).toBe("number");
  expect(defaultRatioFormat({ ...a, currency: "" }, { ...b, currency: "" })).toBe("number");
  expect(defaultRatioFormat(a)).toBe("number");
});
it("compares ratios to their daily reference rather than subtracting changes", () => {
  const result = calculateRatio({ last: 120, reference: 100 }, { last: 110, reference: 100 });
  expect(result.ratio).toBeCloseTo(120 / 110); expect(result.change).toBeCloseTo(9.090909);
});
it("uses published prices directly across currencies and quotation units", () => {
  expect(calculateRatio({ last: 70000 }, { last: 50 }).ratio).toBe(1400);
  expect(calculateRatio({ last: 776 }, { last: 724 }).ratio).toBeCloseTo(1.071823);
});
it("does not substitute missing last prices or references", () => {
  expect(calculateRatio({ reference: 100 }, { last: 100 }).ratio).toBeUndefined();
  expect(calculateRatio({ last: 100 }, { last: 50 }).referenceIssue).toContain("referencia");
  expect(calculateRatio({ last: 100 }, { last: 0 }).ratio).toBeUndefined();
  expect(calculateRatio({ last: Infinity }, { last: 1 }).ratio).toBeUndefined();
  expect(calculateRatio({ last: 100, reference: 0 }, { last: 50, reference: 2 }).change).toBeUndefined();
});
it("does not compare daily reference prices from different dates", () => {
  expect(calculateRatio({ last: 100, reference: 90, referenceDate: "2026-11-16" }, { last: 50, reference: 40, referenceDate: "2026-11-13" })).toMatchObject({ ratio: 2, referenceIssue: "Referencias de fechas distintas" });
});
it("handles signed and zero numerator prices without dividing by zero", () => {
  expect(calculateRatio({ last: 0, reference: 10 }, { last: 5, reference: 5 })).toMatchObject({ ratio: 0, change: -100 });
  expect(calculateRatio({ last: -10 }, { last: 5 }).ratio).toBe(-2);
});
it("distinguishes cable currency without repeating settlement and does not round tiny ratios to zero", () => {
  expect(instrumentDetail({ id: "a", symbol: "AL30C", currency: "EXT", market: "bm", settlement: "2" })).toBe("BYMA · USD C");
  expect(numberLabel(1e-9)).not.toBe("0,00");
});
it("formats a ratio's percentage as its distance from one", () => {
  expect(ratioLabel(1.065, "percent")).toBe("6,50%");
  expect(ratioLabel(.95, "percent")).toBe("-5,00%");
  expect(ratioLabel(1, "percent")).toBe("0,00%");
  expect(ratioLabel(undefined, "percent")).toBe("—");
});
it("uses two decimals for ratios at least 100 and keeps precision for smaller ratios", () => {
  expect(ratioLabel(1584.986387)).toBe("1.584,99");
  expect(ratioLabel(-1584.986387)).toBe("-1.584,99");
  expect(ratioLabel(100)).toBe("100,00");
  expect(ratioLabel(1.916579)).toBe("1,916579");
  expect(ratioLabel(1e-9)).not.toBe("0,00");
});
it("matches exact tickers without treating a prefix or CI as the default species", () => {
  const base = { market: "bm", currency: "ARS", settlement: "2" };
  const a = { ...base, id: "a", symbol: "AL30" }, ci = { ...base, id: "ci", symbol: "AL30 (CI)", settlement: "1" };
  expect(exactTickerMatches(" al30 ", [a, ci])).toEqual([a]);
  expect(exactTickerMatches("AL30 CI", [a, ci])).toEqual([ci]);
  expect(exactTickerMatches("AL3", [a, ci])).toEqual([]);
});
it("dates a valid ratio from the latest market trade including C, without inventing missing times", () => {
  const at = Date.parse("2026-11-20T17:42:05Z");
  const a = { last: 80000, tradedAt: at - 1000 }, b = { last: 50, tradedAt: at }, c = { last: 1500, tradedAt: at + 1000 };
  expect(ratioUpdatedAt(a, b)).toBe(at);
  expect(ratioUpdatedAt(a, b, c)).toBe(at + 1000);
  expect(ratioTimeLabel(at)).toBe("14:42:05");
  expect(ratioTimeLabel(undefined)).toBe("—");
  for (const broken of [{ last: 50 }, { last: 0, tradedAt: at }, { last: 50, tradedAt: NaN }, { last: 50, tradedAt: 1e20 }, { last: 50, tradedAt: at, issue: "Sin datos" }]) expect(ratioUpdatedAt(a, broken)).toBeUndefined();
  expect(ratioUpdatedAt(a, b, {})).toBeUndefined();
});
