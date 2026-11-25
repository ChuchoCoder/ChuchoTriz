// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { intradayPoints, ReferenceChartButton } from "./IntradayChart";
import type { RatioInstrument } from "./model";

const call = vi.fn(), dispose = vi.fn();
vi.mock("../optionsSimulator/market", () => ({ MarketReader: class { call = call; dispose = dispose; } }));

const a: RatioInstrument = { id: "a", symbol: "AL30", market: "bm", settlement: "2", currency: "ARS" };
const b: RatioInstrument = { ...a, id: "b", symbol: "AL30D", currency: "USD" };
const c: RatioInstrument = { ...a, id: "c", symbol: "D30N6" };
const first = Date.parse("2026-11-25T14:00:00Z");
const next = first + 60000, third = next + 60000;
const pair = { a, b, c, cDivisor: 100 as const };
const history = {
  a: { points: [{ at: first, value: 78000 }, { at: first + 30000, value: 80000 }, { at: next, value: 82000 }, { at: third, value: 80000 }] },
  b: { points: [{ at: first + 10000, value: 50 }, { at: next, value: 50 }] },
  c: { points: [{ at: first, value: 150000 }, { at: next, value: 0 }, { at: third, value: 150000 }] },
};

afterEach(() => { vi.unstubAllGlobals(); call.mockReset(); dispose.mockClear(); });

it("uses the last point in each minute, scales C, and preserves gaps without using older values", () => {
  const rows = intradayPoints(pair, history, {
    a: new Map([[first, { at: first + 15000, value: 70000 }]]),
    b: new Map([[next, { at: next + 1000, value: 40 }]]),
  });
  expect(rows[0]).toMatchObject({ at: first, ratio: 1600, reference: 1500 });
  expect(rows[0].spread).toBeCloseTo(6.666667);
  expect(rows[1]).toEqual({ at: next, ratio: 2050, reference: undefined, spread: undefined });
  expect(rows[2]).toEqual({ at: third, ratio: undefined, reference: 1500, spread: undefined });
  expect(intradayPoints({ a, b, c }, history)[0].reference).toBe(150000);
  expect(intradayPoints({ a: b, b: a }, history)[0].ratio).toBeCloseTo(0.000625);
});

it("opens both intraday views from the row with its exact instruments and divisor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const prototype = HTMLDialogElement.prototype;
  const showModal = Object.getOwnPropertyDescriptor(prototype, "showModal");
  const close = Object.getOwnPropertyDescriptor(prototype, "close");
  if (!showModal) Object.defineProperty(prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  if (!close) Object.defineProperty(prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
  call.mockImplementation((method: string) => Promise.resolve(method === "ratioIntradayQuotes"
    ? { revision: 1, start: first, connected: true, points: {} }
    : { revision: 1, series: history }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<><ReferenceChartButton pair={{ a, b }} /><ReferenceChartButton pair={pair} /></>));
    expect(host.querySelectorAll("button")).toHaveLength(1);
    await act(async () => host.querySelector("button")!.click());
    const dialog = document.querySelector("dialog[open]")!;
    expect(call).toHaveBeenCalledWith("ratioIntradayHistory", { ids: ["a", "b", "c"], refresh: false });
    expect(dialog.querySelector(".ct-intraday-legend")?.textContent).toContain("D30N6 ÷ 100");
    expect(dialog.querySelector(".ct-intraday-legend .ct-intraday-line-reference strong")?.textContent).toBe("1.500");
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Brecha %")!.click());
    expect(dialog.querySelector(".ct-intraday-legend strong")?.textContent).toMatch(/6,67\s*%/);
    expect(dialog.querySelector(".ct-intraday-zero")).not.toBeNull();
    expect(call.mock.calls.filter(([method]) => method === "ratioIntradayHistory")).toHaveLength(1);
    await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true, bubbles: true })));
    expect(document.querySelector("dialog")).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (!showModal) Reflect.deleteProperty(prototype, "showModal");
    if (!close) Reflect.deleteProperty(prototype, "close");
  }
});
