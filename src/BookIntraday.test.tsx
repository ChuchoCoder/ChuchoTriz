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
const move = (element: Element, type: "pointerover" | "pointerout", relatedTarget?: Element) =>
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
const bars = (prices: number[]) => ({ points: prices.map((value, i) => ({ at: Date.UTC(2026, 10, 25, 14, i), value })), reference: 49 });

function book(id: string, label: string) {
  const widget = document.createElement("div");
  widget.className = "DashboardGridItem";
  widget.innerHTML = `<div class="SecurityCardWidget"><div class="NewWidgetHeader"><a href="/security/${id}">${label}</a>
    <a class="SingleWidgetHeaderButtons"><button type="button">Editar</button><button type="button">Cerrar</button></a></div></div>`;
  document.body.append(widget);
  return widget;
}

function priceRow(className: string, id: string, label: string) {
  const row = document.createElement("div");
  row.className = className;
  row.innerHTML = `<div class="SymbolCell"><a href="/security/${id}">${label}</a></div>
    <div class="ActionCell"><a class="FavoriteButton">★</a><span class="TradingChartModal">
    <span class="TradingChartModal-Icon" aria-hidden="true"><svg><path></path></svg></span></span></div>`;
  document.body.append(row);
  return {
    row,
    link: row.querySelector<HTMLAnchorElement>(".SymbolCell a")!,
    star: row.querySelector(".FavoriteButton")!,
    icon: row.querySelector(".TradingChartModal-Icon")!,
    line: row.querySelector("path")!,
  };
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

it.each(["PricePanelRow-row", "PricePanelRowWidget-row"])("previews the exact instrument from the native chart in %s", async className => {
  const ci = priceRow(className, "bm_MERV_AL30D_CI", "AL30D (CI)");
  const next = priceRow(className, "bm_MERV_AL30D_24hs", "AL30D");
  const expired = priceRow(className, "EXPIRADO", "EXPIRADO");
  const clickNative = vi.fn((event: Event) => event.defaultPrevented);
  ci.icon.parentElement!.addEventListener("click", clickNative);
  readSeries.mockResolvedValue(bars([49, 50]));
  await act(async () => {
    move(ci.star, "pointerover");
    move(expired.icon, "pointerover");
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(readSeries).not.toHaveBeenCalled();
  expect(button(ci.row)).toBeNull();
  await act(async () => {
    move(ci.icon, "pointerover");
    await vi.advanceTimersByTimeAsync(100);
    move(ci.icon, "pointerout", ci.line);
    move(ci.line, "pointerover", ci.icon);
    await vi.advanceTimersByTimeAsync(80);
  });
  expect(readSeries).toHaveBeenCalledExactlyOnceWith("bookIntraday", { id: "bm_MERV_AL30D_CI" });
  expect(preview()?.textContent).toContain("AL30D (CI)");
  await act(async () => { ci.line.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  expect(clickNative).toHaveBeenCalledTimes(1);
  expect(clickNative).toHaveReturnedWith(false);
  expect(preview()).toBeNull();
  await act(async () => { move(next.line, "pointerover"); await vi.advanceTimersByTimeAsync(180); });
  expect(readSeries).toHaveBeenNthCalledWith(2, "bookIntraday", { id: "bm_MERV_AL30D_24hs" });
  expect(preview()?.querySelector("strong")?.textContent).toBe("Intradiario · AL30D");
});

it("discards the pending hover and later the preview when Matriz recycles a price row", async () => {
  const { icon, link } = priceRow("PricePanelRow-row", "bm_MERV_AL30D_CI", "AL30D (CI)");
  readSeries.mockResolvedValue(bars([49]));
  await act(async () => {
    move(icon, "pointerover");
    link.href = "/security/bm_MERV_AL30D_24hs";
    link.textContent = "AL30D";
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(readSeries).not.toHaveBeenCalled();
  await act(async () => { move(icon, "pointerout"); move(icon, "pointerover"); await vi.advanceTimersByTimeAsync(180); });
  expect(readSeries).toHaveBeenCalledExactlyOnceWith("bookIntraday", { id: "bm_MERV_AL30D_24hs" });
  expect(preview()).not.toBeNull();
  await act(async () => { link.href = "/security/bm_MERV_GD30_24hs"; link.textContent = "GD30"; });
  expect(preview()).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it("fits the native preview beside the icon column in a narrow window", async () => {
  const { icon } = priceRow("PricePanelRow-row", "bm_MERV_AL30D_CI", "AL30D (CI)");
  let widget!: HTMLElement;
  await act(async () => { widget = book("bm_MERV_AL30D_CI", "AL30D (CI)"); });
  vi.stubGlobal("innerWidth", 600);
  vi.stubGlobal("innerHeight", 300);
  vi.spyOn(icon, "getBoundingClientRect").mockReturnValue(new DOMRect(290, 100, 16, 16));
  readSeries.mockResolvedValue(bars([49, 50]));
  await act(async () => { move(icon, "pointerover"); await vi.advanceTimersByTimeAsync(180); });
  const styles = (preview() as HTMLElement).style;
  expect(parseFloat(styles.left)).toBeGreaterThan(306);
  expect(parseFloat(styles.left) + parseFloat(styles.width)).toBeLessThan(600);
  await act(async () => { move(icon, "pointerout"); move(button(widget), "pointerover"); await vi.advanceTimersByTimeAsync(180); });
  expect((preview() as HTMLElement).style.width).toBe("");
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

it("keeps the preview open when the trigger loses focus while the chart is hovered", async () => {
  let widget!: HTMLElement;
  readSeries.mockResolvedValue(bars([49, 50]));
  await act(async () => { widget = book("bm_MERV_AL30D_CI", "AL30D (CI)"); });
  await act(async () => { button(widget).focus(); });
  await act(async () => {
    move(preview()!, "pointerover");
    button(widget).blur();
    await vi.advanceTimersByTimeAsync(180);
  });
  expect(preview()).not.toBeNull();
  await act(async () => { move(preview()!, "pointerout"); await vi.advanceTimersByTimeAsync(180); });
  expect(preview()).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(1);
});

it.each([
  ["a reader error", () => Promise.reject(Error("Cambió el contexto de mercado"))],
  ["a malformed response", () => Promise.resolve({})],
] as const)("clears a chart after %s and recovers on retry", async (_, failedRead) => {
  let widget!: HTMLElement;
  readSeries.mockResolvedValueOnce(bars([49, 50])).mockImplementationOnce(failedRead)
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
