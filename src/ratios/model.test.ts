import { expect, it } from "vitest";
import { calculateRatio, instrumentDetail, numberLabel } from "./model";
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
