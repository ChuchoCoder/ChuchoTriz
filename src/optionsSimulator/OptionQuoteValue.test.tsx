// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OptionQuoteValue } from "./OptionQuoteValue";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});
const render = async (value?: number, quantity = false) => {
  await act(async () => root.render(<OptionQuoteValue value={value} quantity={quantity} />));
};
const advance = async (milliseconds: number) => { await act(async () => vi.advanceTimersByTime(milliseconds)); };
const highlighted = () => container.querySelector(".ct-opt-quote-changed");

it("keeps directional feedback with reduced motion and clears it without animation events", async () => {
  await render(5); expect(highlighted()).toBeNull();
  await render(6); expect(highlighted()?.classList.contains("ct-opt-quote-up")).toBe(true);
  await advance(500); expect(highlighted()).toBeNull();
  await render(4); expect(highlighted()?.classList.contains("ct-opt-quote-down")).toBe(true);
  await advance(500); expect(highlighted()).toBeNull();
});

it("restarts feedback on another update and clears it when the quote disappears", async () => {
  await render(5); await render(6); await advance(400);
  await render(7); await advance(100); expect(highlighted()).not.toBeNull();
  await advance(400); expect(highlighted()).toBeNull();
  await render(8); await render(undefined); expect(highlighted()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  await render(9); expect(highlighted()).toBeNull();
});

it("clears quantity feedback and cancels pending cleanup on unmount", async () => {
  await render(100, true); await render(110, true);
  expect(highlighted()?.classList.contains("ct-opt-quote-quantity")).toBe(true);
  await advance(700); expect(highlighted()).toBeNull();
  await render(120, true); expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.unmount()); expect(vi.getTimerCount()).toBe(0);
  root = createRoot(container);
});
it("uses a custom ratio or price format with the same directional pulse and no dollar prefix", async () => {
  const formatValue = (n: number) => ((n - 1) * 100).toFixed(2) + "%";
  await act(async () => root.render(<OptionQuoteValue value={1.05} formatValue={formatValue} />));
  expect(container.textContent).toBe("5.00%"); expect(highlighted()).toBeNull();
  await act(async () => root.render(<OptionQuoteValue value={1.06} formatValue={formatValue} />));
  expect(container.textContent).toBe("6.00%"); expect(highlighted()?.classList.contains("ct-opt-quote-up")).toBe(true);
  await advance(500); expect(highlighted()).toBeNull();
  await act(async () => root.render(<OptionQuoteValue value={undefined} formatValue={formatValue} />));
  expect(container.textContent).toBe("—"); expect(highlighted()).toBeNull();
});
