// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { monitorColumns, nextGridSort, reorderGridRows, sortGridRows, storedGridColumns, useGridColumns } from "./RatioGrid";

it("validates optional columns while retaining an intentionally empty selection", () => {
  expect(storedGridColumns(undefined, monitorColumns)).toEqual(monitorColumns.map(([id]) => id));
  expect(storedGridColumns([], monitorColumns)).toEqual([]);
  expect(storedGridColumns(["updated", "a", "a", "unknown", null], monitorColumns)).toEqual(["a", "updated"]);
});

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

describe("scoped column persistence", () => {
  let root: Root, container: HTMLDivElement, preferences: ReturnType<typeof useGridColumns>;
  type StorageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
  let values: Record<string, unknown>, listeners: Set<StorageListener>;
  const key = (scope: string) => `RatioGridColumnsV1:${scope}:monitor`;
  const get = vi.fn(), set = vi.fn();
  function Probe({ scope }: { scope: string }) { preferences = useGridColumns(scope, "monitor", monitorColumns); return null; }
  async function render(scope: string) { await act(async () => root.render(createElement(Probe, { scope }))); }
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    values = {}; listeners = new Set();
    get.mockReset().mockImplementation(async (k: string) => ({ [k]: values[k] }));
    set.mockReset().mockImplementation(async (next: Record<string, unknown>) => {
      Object.assign(values, next);
      for (const listener of listeners) listener(Object.fromEntries(Object.entries(next).map(([k, newValue]) => [k, { newValue }])), "local");
    });
    vi.stubGlobal("chrome", { storage: { local: { get, set }, onChanged: { addListener: (fn: StorageListener) => listeners.add(fn), removeListener: (fn: StorageListener) => listeners.delete(fn) } } });
    container = document.createElement("div"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("responds immediately and restores confirmed columns when persistence fails", async () => {
    await render("a");
    let rejectSave!: (error: Error) => void;
    set.mockImplementation(() => new Promise((_, reject) => { rejectSave = reject; }));
    let saving!: Promise<void>;
    await act(async () => { saving = preferences.change("a", false); });
    expect(preferences.has("a")).toBe(false); expect(preferences.disabled).toBe(true);
    await act(async () => { rejectSave(Error("disk")); await saving; });
    expect(preferences.has("a")).toBe(true); expect(preferences.disabled).toBe(false); expect(preferences.error).toMatch(/guardar/);
  });
  it("applies the requested visibility idempotently while retaining changes from other tabs", async () => {
    await render("a");
    // Another tab already hid A and B after this picker was rendered.
    values[key("a")] = ["ratio", "daily", "updated"];
    await act(async () => preferences.change("a", false));
    expect(values[key("a")]).toEqual(["ratio", "daily", "updated"]);
    expect(preferences.has("a")).toBe(false); expect(preferences.has("b")).toBe(false);
    expect(Object.keys(values)).toEqual([key("a")]);
  });
  it("accepts the new account event while an old account write and new initial read are pending", async () => {
    let unlock!: () => Promise<void>;
    vi.stubGlobal("navigator", { locks: { request: (_name: string, save: () => Promise<void>) => new Promise<void>((resolve, reject) => { unlock = async () => { try { await save(); resolve(); } catch (e) { reject(e); } }; }) } });
    await render("a");
    let saving!: Promise<void>;
    await act(async () => { saving = preferences.change("a", false); });
    let resolveRead!: (value: Record<string, unknown>) => void;
    get.mockImplementation((k: string) => k === key("b") ? new Promise(resolve => { resolveRead = resolve; }) : Promise.resolve({ [k]: values[k] }));
    await render("b");
    await act(async () => { values[key("b")] = ["updated"]; for (const listener of listeners) listener({ [key("b")]: { newValue: ["updated"] } }, "local"); });
    expect(preferences.disabled).toBe(false); expect(preferences.has("updated")).toBe(true); expect(preferences.has("a")).toBe(false);
    await act(async () => { resolveRead({ [key("b")]: undefined }); await unlock(); await saving; });
    expect(preferences.disabled).toBe(false); expect(preferences.has("a")).toBe(false); expect(set).not.toHaveBeenCalled();
  });
  it("keeps pending account writes independent across an A to B to A round trip", async () => {
    const releases = new Map<string, () => Promise<void>>();
    const request = vi.fn((name: string, save: () => Promise<void>) => new Promise<void>((resolve, reject) => {
      releases.set(name, async () => { try { await save(); resolve(); } catch (error) { reject(error); } });
    }));
    vi.stubGlobal("navigator", { locks: { request } });
    await render("a"); let saveA!: Promise<void>, saveB!: Promise<void>;
    await act(async () => { saveA = preferences.change("a", false); });
    await render("b"); await act(async () => { saveB = preferences.change("b", false); });
    await render("a"); expect(preferences.disabled).toBe(true);
    await act(async () => preferences.change("daily", false));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { await releases.get(key("b"))!(); await saveB; });
    expect(preferences.disabled).toBe(true);
    await act(async () => { await releases.get(key("a"))!(); await saveA; });
    expect(preferences.disabled).toBe(false); expect(preferences.has("a")).toBe(false); expect(preferences.has("daily")).toBe(true);
  });
});
