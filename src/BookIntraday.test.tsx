// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BookIntraday from "./BookIntraday";

let root: Root;
const readSeries = vi.fn<(method: string, args: { id: string }) => Promise<unknown>>();
const dispose = vi.fn();
vi.mock("./optionsSimulator/market", () => ({ MarketReader: class { call = readSeries; dispose = dispose; } }));
const preview = () => document.querySelector(".ct-book-intraday");
const button = (book: Element) => book.querySelector<HTMLButtonElement>(".ct-book-intraday-button")!;
const move = (element: Element, type: "pointerover" | "pointerout") =>
  element.dispatchEvent(new MouseEvent(type, { bubbles: true }));
const bars = (prices: number[]) => ({ points: prices.map((value, i) => ({ at: Date.UTC(2026, 10, 25, 14, i), value })), reference: 49 });

function book(id: string, label: string) {
  const widget = document.createElement("div");
  widget.className = "DashboardGridItem";
  widget.innerHTML = `<div class="SecurityCardWidget"><div class="NewWidgetHeader"><a href="/security/${id}">${label}</a>
    <a class="SingleWidgetHeaderButtons"><button type="button">Editar</button><button type="button">Cerrar</button></a></div></div>`;
  document.body.append(widget);
  return widget;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<BookIntraday />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  readSeries.mockReset();
  dispose.mockClear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("loads the exact book's minute closes on hover and supports keyboard focus", async () => {
  let ci!: HTMLElement, expired!: HTMLElement;
  await act(async () => { ci = book("bm_MERV_AL30D_CI", "AL30D (CI)"); expired = book("EXPIRADO", "EXPIRADO"); });
  expect(button(expired)).toBeNull();
  expect(button(ci).getAttribute("aria-label")).toBe("Gráfico intradiario de AL30D (CI)");
  expect(readSeries).not.toHaveBeenCalled();
  readSeries.mockResolvedValue(bars([49, 48.3, 49.6]));
  await act(async () => { move(button(ci), "pointerover"); });
  expect(readSeries).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(180); });
  expect(readSeries).toHaveBeenCalledExactlyOnceWith("bookIntraday", { id: "bm_MERV_AL30D_CI" });
  expect(preview()?.querySelector("polyline")?.getAttribute("points")?.split(" ")).toHaveLength(3);
  expect(preview()?.querySelector(".ct-book-intraday-reference")).not.toBeNull();
  await act(async () => { move(button(ci), "pointerout"); move(preview()!, "pointerover"); await vi.advanceTimersByTimeAsync(180); });
  expect(preview()).not.toBeNull();
  await act(async () => { move(preview()!, "pointerout"); await vi.advanceTimersByTimeAsync(180); });
  expect(preview()).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(readSeries).toHaveBeenCalledTimes(1);
  await act(async () => { button(ci).focus(); });
  expect(preview()?.textContent).toContain("AL30D (CI)");
  await act(async () => { move(button(ci), "pointerover"); move(button(ci), "pointerout"); await vi.advanceTimersByTimeAsync(180); });
  expect(preview()).not.toBeNull();
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })); });
  expect(preview()).toBeNull();
});

it("drops an obsolete response after Matriz updates the instrument in place", async () => {
  let widget!: HTMLElement, finish!: (response: unknown) => void;
  readSeries.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  readSeries.mockResolvedValueOnce(bars([]));
  await act(async () => { widget = book("bm_MERV_AL30D_CI", "AL30D (CI)"); });
  await act(async () => { button(widget).focus(); });
  expect(preview()?.textContent).toContain("Cargando gráfico");
  await act(async () => {
    const link = widget.querySelector<HTMLAnchorElement>("a[href]")!;
    link.href = "/security/bm_MERV_AL30D_24hs";
    link.textContent = "AL30D";
  });
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(preview()).toBeNull();
  await act(async () => { button(widget).focus(); });
  expect(preview()?.textContent).toContain("Sin operaciones en la rueda de hoy");
  expect(readSeries).toHaveBeenNthCalledWith(2, "bookIntraday", { id: "bm_MERV_AL30D_24hs" });
  await act(async () => finish(bars([49])));
  expect(preview()?.querySelector("polyline")).toBeNull();
  await act(async () => widget.querySelector(".SecurityCardWidget")?.remove());
  expect(preview()).toBeNull();
});

it("clears a chart after a failed refresh and recovers on retry", async () => {
  let widget!: HTMLElement;
  readSeries.mockResolvedValueOnce(bars([49, 50])).mockRejectedValueOnce(Error("Cambió el contexto de mercado"))
    .mockResolvedValueOnce(bars([51]));
  await act(async () => { widget = book("bm_MERV_AL30D_CI", "AL30D (CI)"); });
  await act(async () => { button(widget).focus(); });
  expect(preview()?.querySelector("polyline")).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(preview()?.querySelector("polyline")).toBeNull();
  expect(preview()?.textContent).toContain("No se pudo cargar el gráfico");
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(preview()?.querySelector(".ct-book-intraday-point")).not.toBeNull();
});
