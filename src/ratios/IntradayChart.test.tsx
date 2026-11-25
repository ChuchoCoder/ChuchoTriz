// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { IntradayChart, intradayPoints, ReferenceChartButton } from "./IntradayChart";
import type { RatioInstrument } from "./model";

const call = vi.fn(), dispose = vi.fn();
vi.mock("../optionsSimulator/market", () => ({ MarketReader: class { call = call; dispose = dispose; } }));

const a: RatioInstrument = { id: "a", symbol: "AL30", market: "bm", settlement: "2", currency: "ARS" };
const b: RatioInstrument = { ...a, id: "b", symbol: "AL30D", currency: "USD" };
const c: RatioInstrument = { ...a, id: "c", symbol: "D30N6" };
const first = Date.parse("2026-11-25T14:00:00Z");
const next = first + 300000, third = next + 300000;
const pair = { a, b, c, cDivisor: 100 as const };
const history = {
  a: { points: [{ at: first, value: 78000 }, { at: first + 30000, value: 80000 }, { at: next, value: 82000 }, { at: third, value: 80000 }] },
  b: { points: [{ at: first + 10000, value: 50 }, { at: next, value: 50 }] },
  c: { points: [{ at: first, value: 150000 }, { at: next, value: 0 }, { at: third, value: 150000 }] },
};

afterEach(() => { vi.unstubAllGlobals(); call.mockReset(); dispose.mockClear(); });

it("uses the last sample in each five-minute interval, scales C, and preserves gaps", () => {
  const rows = intradayPoints(pair, history, {
    a: new Map([[first, { at: first + 15000, value: 70000 }]]),
    b: new Map([[next, { at: next + 1000, value: 40 }]]),
  });
  expect(rows[0]).toMatchObject({ at: first, ratio: 1600, reference: 1500 });
  expect(rows[0].spread).toBeCloseTo(6.666667);
  expect(rows[1]).toEqual({ at: next, ratio: 1640, reference: undefined, spread: undefined });
  expect(rows[2]).toEqual({ at: third, ratio: undefined, reference: 1500, spread: undefined });
  expect(intradayPoints({ a, b, c }, history)[0].reference).toBe(150000);
  expect(intradayPoints({ a: b, b: a }, history)[0].ratio).toBeCloseTo(0.000625);
  const provisional = { ...history, b: { points: history.b.points.map(point => ({ ...point, provisional: true as const })) } };
  expect(intradayPoints(pair, provisional, { b: new Map([[next, { at: next + 1000, value: 40 }]]) })[1].ratio).toBe(2050);
  const differentMinute = { ...history, b: { points: [{ at: first + 240000, value: 40 }] } };
  expect(intradayPoints(pair, differentMinute)[0].spread).toBeCloseTo(33.333333);
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
    expect(dialog.querySelector(".ct-intraday-legend .ct-intraday-line-reference strong")?.textContent).toBe("1.500,00");
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Brecha %")!.click());
    expect(dialog.querySelector(".ct-intraday-legend strong")?.textContent).toMatch(/6,67\s*%/);
    expect(dialog.querySelector(".ct-intraday-zero")).toBeNull();
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

it.each([[4, 6], [-6, -4], [-2, 2]])("uses the visible spread bounds (%s to %s) with a margin", async (low, high) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const start = Date.parse("2026-11-25T03:00:00Z");
  call.mockImplementation((method: string) => Promise.resolve(method === "ratioIntradayQuotes"
    ? { revision: 1, start, connected: true, points: {} }
    : { revision: 1, series: { ...history, c: { points: [
      { at: first, value: 160000 / (1 + low / 100) },
      { at: next, value: 164000 / (1 + high / 100) },
    ] } } }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<IntradayChart pair={pair} view="spread" />));
    const ticks = [...host.querySelectorAll(".ct-intraday-axis-left")].map(node => Number(node.textContent?.replace(",", ".").replace("%", "").trim()));
    const margin = (high - low) * 0.08;
    expect(ticks[0]).toBeCloseTo(low - margin);
    expect(ticks.at(-1)).toBeCloseTo(high + margin);
    expect(!!host.querySelector(".ct-intraday-zero")).toBe(low < 0 && high > 0);
    expect(host.querySelector(".ct-intraday-axis-right")).toBeNull();
    expect(host.querySelector("svg .ct-intraday-line-ratio")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});

it("opens on today without quotes and lets the widget select a historical session", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const today = Date.parse("2026-11-26T03:00:00Z"), yesterday = today - 86400000;
  call.mockImplementation((method: string) => Promise.resolve(method === "ratioIntradayQuotes"
    ? { revision: 1, start: today, connected: true, points: {} }
    : { revision: 1, series: history }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<IntradayChart pair={pair} view="dollar-spread" defaultToToday />));
    const session = host.querySelector<HTMLSelectElement>('[aria-label="Rueda del gráfico"]')!;
    expect(session.value).toBe(String(today));
    expect(session.selectedOptions[0].textContent).toContain("hoy");
    expect(host.querySelector("svg[role=img]")).toBeNull();
    expect(host.textContent).toContain("Sin cotizaciones coincidentes para esta rueda.");
    await act(async () => { session.value = String(yesterday); session.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector(".ct-intraday-axis-left")?.textContent).toContain("%");
    expect(host.querySelector(".ct-intraday-axis-right")?.textContent).not.toContain("%");
    expect(host.querySelector(".ct-intraday-legend .ct-intraday-line-spread strong")?.textContent).toMatch(/6,67\s*%/);
    await act(async () => { session.value = String(today); session.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.querySelector(".ct-intraday-legend .ct-intraday-line-ratio strong")?.textContent).toBe("—");
    expect(host.querySelector(".ct-intraday-legend .ct-intraday-line-spread strong")?.textContent).toBe("—");
    expect(host.querySelector(".ct-intraday-axis-left")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});

it("keeps today selectable when there are no quotes for any session", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const start = Date.parse("2026-11-26T03:00:00Z");
  call.mockImplementation((method: string) => Promise.resolve(method === "ratioIntradayQuotes"
    ? { revision: 1, start, connected: true, points: {} }
    : { revision: 1, series: { a: { points: [] }, b: { points: [] } } }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<IntradayChart pair={{ a, b }} defaultToToday />));
    const session = host.querySelector<HTMLSelectElement>('[aria-label="Rueda del gráfico"]')!;
    expect(session.options).toHaveLength(1);
    expect(session.value).toBe(String(start));
    expect(session.selectedOptions[0].textContent).toContain("hoy");
    expect(host.textContent).toContain("Sin cotizaciones coincidentes para esta rueda.");
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});
