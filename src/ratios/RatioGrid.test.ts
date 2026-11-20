import { expect, it } from "vitest";
import { nextGridSort, reorderGridRows, sortGridRows } from "./RatioGrid";

it("cycles a column ascending, descending and back to manual order", () => {
  const ascending = nextGridSort(undefined, "ratio"), descending = nextGridSort(ascending, "ratio");
  expect(ascending).toEqual({ column: "ratio", direction: "asc" });
  expect(descending).toEqual({ column: "ratio", direction: "desc" });
  expect(nextGridSort(descending, "ratio")).toBeUndefined();
  expect(nextGridSort(descending, "pair")).toEqual({ column: "pair", direction: "asc" });
});
it("sorts native numeric values including losses and zero, keeping missing values last in both directions", () => {
  const values = [undefined, 10, -2, 0, NaN, Infinity];
  expect(sortGridRows(values, { column: "net", direction: "asc" }, v => v)).toEqual([-2, 0, 10, undefined, NaN, Infinity]);
  expect(sortGridRows(values, { column: "net", direction: "desc" }, v => v)).toEqual([10, 0, -2, undefined, NaN, Infinity]);
  expect(values).toEqual([undefined, 10, -2, 0, NaN, Infinity]);
});
it("keeps manual order for ties and compares tickers naturally", () => {
  const rows = [{ id: "first", value: 5 }, { id: "second", value: 5 }];
  expect(sortGridRows(rows, { column: "value", direction: "desc" }, r => r.value).map(r => r.id)).toEqual(["first", "second"]);
  expect(sortGridRows(["AL10", "AL2", "BMA"], { column: "pair", direction: "asc" }, v => v)).toEqual(["AL2", "AL10", "BMA"]);
});
it("reorders a sorted visible projection without moving hidden records or changing record identities and fields", () => {
  const a = { id: "a", entry: 100 }, hidden = { id: "closed", entry: 123 }, b = { id: "b", entry: 50 }, c = { id: "c", entry: 75 };
  const rows = [a, hidden, b, c], result = reorderGridRows(rows, ["c", "b", "a"], "a", "c");
  expect(result).toEqual([a, hidden, c, b]);
  expect(result[1]).toBe(hidden); expect(result[2]).toBe(c); expect(result[3]).toBe(b);
  expect(rows).toEqual([a, hidden, b, c]);
  expect(reorderGridRows(rows, ["a", "b", "c"], "a", "c")).toEqual([b, hidden, c, a]);
});
it("rejects stale identities and duplicate visible records", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  for (const ids of [["a", "missing"], ["a", "a"], ["b"]]) expect(() => reorderGridRows(rows, ids, "a", "b")).toThrow(/grilla cambió/);
});
