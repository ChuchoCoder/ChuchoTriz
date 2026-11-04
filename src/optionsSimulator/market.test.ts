// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Catalog, MarketReader, Snapshot, useOptionMarket } from "./market";

let root: Root, container: HTMLDivElement, state: ReturnType<typeof useOptionMarket>;
let sequence: number, context: number, catalogRevision: number;
let read: ReturnType<typeof vi.spyOn>;
const catalog: Catalog = { contextRevision: 1, catalogRevision: 1, version: "4.24.4", excluded: 0, contracts: [], underlyings: [{ id: "GGAL", symbol: "GGAL", currency: "ARS" }] };
function Probe({ active = true, ids = ["GGAL", "option"] }: { active?: boolean; ids?: string[] }) {
  state = useOptionMarket(active, "GGAL", ids); return null;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("location", { hostname: "matriz.cocos.xoms.com.ar", origin: "https://matriz.cocos.xoms.com.ar" });
  vi.stubGlobal("chrome", { runtime: { getURL: (path: string) => "/" + path } });
  sequence = 10; context = 1; catalogRevision = 1;
  read = vi.spyOn(MarketReader.prototype, "call").mockImplementation(async (method: string, params?: unknown) => {
    if (method === "catalog") return { ...catalog, contextRevision: context, catalogRevision };
    const selected = params as { ids: string[]; underlyingId: string };
    return { contextRevision: context, catalogRevision, underlyingId: selected.underlyingId, capturedAt: Date.now(),
      instruments: Object.fromEntries(selected.ids.map(id => [id, { seq: sequence, last: 100 }])) } as Snapshot;
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render(active = true, ids?: string[]) { await act(async () => root.render(createElement(Probe, { active, ids }))); }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); }
it("stops polling when the panel is hidden", async () => {
  await render(); expect(state.data?.instruments.option.seq).toBe(10);
  await render(false); const calls = read.mock.calls.length;
  await tick(); expect(read.mock.calls).toHaveLength(calls); expect(state.data).toBeUndefined();
});
it("keeps sequence protection across selections and catalogue revisions", async () => {
  await render(); expect(state.data).toBeDefined();
  sequence = 9; catalogRevision = 2; await tick();
  expect(state.data).toBeUndefined(); expect(state.issue).toContain("Secuencia");
  await render(true, ["GGAL", "option", "other"]); expect(state.data).toBeUndefined(); expect(state.issue).toContain("Secuencia");
  sequence = 10; await tick(); expect(state.data?.instruments.other.seq).toBe(10);
});
it("accepts a verified context change as a new sequence domain", async () => {
  await render(); context = 2; sequence = 1; await tick();
  expect(state.issue).toBeUndefined(); expect(state.data?.instruments.option.seq).toBe(1);
});
it("reads a large chain in small sequential groups and publishes the whole result", async () => {
  const ids = ["GGAL", ...Array.from({ length: 170 }, (_, index) => `option-${index}`)];
  await render(true, ids);
  const groups = read.mock.calls.filter((call: unknown[]) => call[0] === "snapshot");
  expect(groups.length).toBe(8); expect(groups.every((call: unknown[]) => (call[1] as { ids: string[] }).ids.length <= 24)).toBe(true);
  expect(Object.keys(state.data!.instruments)).toHaveLength(171);
});
it("discards an incomplete batch and never publishes a partially read chain", async () => {
  let snapshotCount = 0;
  const original = read.getMockImplementation()!;
  read.mockImplementation(async (method: string, params: unknown) => {
    if (method === "snapshot" && ++snapshotCount === 2) throw Error("Batch unavailable");
    return original(method, params);
  });
  await render(true, ["GGAL", ...Array.from({ length: 30 }, (_, index) => `option-${index}`)]);
  expect(state.data).toBeUndefined(); expect(state.issue).toContain("Batch unavailable");
});
