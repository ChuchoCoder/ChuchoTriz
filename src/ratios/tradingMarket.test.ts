// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketReader } from "../optionsSimulator/market";
import { useRatioMarket } from "./tradingMarket";
vi.mock("../optionsSimulator/positionStorage", () => ({ positionStorageSalt: async () => "a".repeat(64) }));
let root: Root, node: HTMLDivElement, state: ReturnType<typeof useRatioMarket>, scope: string, fail: boolean, contextFail: boolean;
function Probe() { state = useRatioMarket(true, ["BMA"], "a".repeat(64)); return null; }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("location", { hostname: "matriz.cocos.xoms.com.ar", origin: "https://matriz.cocos.xoms.com.ar" });
  vi.stubGlobal("chrome", { runtime: { getURL: (s: string) => "/" + s } });
  scope = "a".repeat(64); fail = contextFail = false;
  vi.spyOn(MarketReader.prototype, "call").mockImplementation(async method => {
    if (method === "ratioContext") { if (contextFail) throw Error("no context"); return { contextId: scope, storageScope: scope, connected: true }; }
    if (fail) throw Error("transient quotes"); return { contextId: scope, instruments: { BMA: { last: 100 } } };
  });
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tick = async () => { await act(async () => vi.advanceTimersByTimeAsync(1300)); };
it("preserves verified account scope on quote-only failure and recovers without resetting the draft owner", async () => {
  await act(async () => root.render(createElement(Probe))); await tick(); expect(state.quotes.BMA.last).toBe(100);
  fail = true; await tick(); expect(state.context?.storageScope).toBe(scope); expect(state.quotes).toEqual({}); expect(state.issue).toBe("transient quotes");
  fail = false; await tick(); expect(state.quotes.BMA.last).toBe(100);
  contextFail = true; await tick(); expect(state.context).toBeUndefined(); expect(state.quotes).toEqual({});
});
it("clears old quotes and withholds old account IDs after a verified account switch", async () => {
  await act(async () => root.render(createElement(Probe))); await tick(); scope = "b".repeat(64); await tick();
  expect(state.context?.storageScope).toBe(scope); expect(state.quotes).toEqual({}); await tick(); expect(state.quotes).toEqual({});
});
