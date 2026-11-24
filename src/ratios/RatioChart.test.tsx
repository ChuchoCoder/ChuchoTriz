// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import RatioChart, { RatioChartLink, ratioChartRequest, ratioChartUrl } from "./RatioChart";
import type { RatioInstrument } from "./model";

const call = vi.fn(), dispose = vi.fn();
vi.mock("../optionsSimulator/market", () => ({ MarketReader: class { call = call; dispose = dispose; } }));
const a: RatioInstrument = { id: "bm_MERV_AL30_24hs", symbol: "AL30", market: "bm", currency: "ARS", settlement: "2" };
const b: RatioInstrument = { ...a, id: "bm_MERV_AL30D_CI", symbol: "AL30D CI", currency: "USD", settlement: "1" };
const c: RatioInstrument = { ...a, id: "rx_DDF_DLR_SPOT", symbol: "DLR/SPOT", market: "rx" };
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

it("links to a new tab on the same broker with exact IDs, order and five-minute interval", () => {
  const url = new URL(ratioChartUrl({ a, b }, "https://broker.xoms.com.ar")!);
  expect(url.origin).toBe("https://broker.xoms.com.ar"); expect(url.pathname).toBe("/security/" + a.id);
  expect(url.searchParams.get("ctRatio")).toBe(b.id); expect(url.searchParams.get("interval")).toBe("5");
  expect(ratioChartRequest(url)).toEqual({ a: a.id, b: b.id });
  const inverse = new URL(ratioChartUrl({ a: b, b: a }, url.origin)!);
  expect(ratioChartRequest(inverse)).toEqual({ a: b.id, b: a.id });
});

it("roundtrips C and encoded instrument IDs without inferring a ticker", () => {
  const url = new URL(ratioChartUrl({ a: { ...a, id: "PESOS - 7D/2" }, b, c }, "https://remarkets.matriz.com.ar")!);
  expect(ratioChartRequest(url)).toEqual({ a: "PESOS - 7D/2", b: b.id, c: c.id });
});

it("ignores ordinary chart pages and malformed requests", () => {
  for (const path of ["/security/a?interval=5", "/dashboards?ctRatio=b", "/security/a?ctRatio=", "/security/%zz?ctRatio=b", "/security/a?ctRatio=%00"]) {
    expect(ratioChartRequest(new URL(path, "https://remarkets.matriz.com.ar"))).toBeUndefined();
  }
});

it("renders an accessible chart icon with a safe new-tab link and the C limitation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"), root = createRoot(host);
  await act(async () => root.render(<RatioChartLink pair={{ a, b, c }} />));
  const link = host.querySelector("a")!;
  expect(link.target).toBe("_blank"); expect(link.rel).toBe("noopener noreferrer");
  expect(link.getAttribute("aria-label")).toContain("sin referencia C"); expect(link.title).toContain("DLR/SPOT en el eje izquierdo");
  expect(link.querySelector("svg")).not.toBeNull();
  await act(async () => root.unmount());
});

it("passes both legs and C to the native reader and shows a persistent explanation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", `/security/${a.id}?interval=5&ctRatio=${b.id}&ctRatioC=${c.id}`);
  call.mockResolvedValue({ a: a.symbol, b: b.symbol, comparison: c.symbol });
  const host = document.createElement("div"), root = createRoot(host);
  await act(async () => root.render(<RatioChart />));
  expect(call).toHaveBeenCalledWith("ratioChart", { a: a.id, b: b.id, c: c.id });
  expect(host.textContent).toContain("velas de 5 min"); expect(host.textContent).toContain("DLR/SPOT en el eje izquierdo");
  expect(host.textContent).toContain("A/B sin dividir por C");
  await act(async () => {
    window.history.replaceState({}, "", `/security/${a.id}?interval=5`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(host.textContent).toContain("DLR/SPOT en el eje izquierdo");
  expect(dispose).not.toHaveBeenCalled();
  await act(async () => {
    window.history.pushState({}, "", "/principal/favoritos");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(host.querySelector('[aria-label="Histórico de ratio"]')).toBeNull();
  expect(dispose).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.history.pushState({}, "", `/security/${b.id}?interval=5&ctRatio=${a.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(call).toHaveBeenLastCalledWith("ratioChart", { a: b.id, b: a.id });
  expect(host.textContent).not.toContain("A/B sin dividir por C");
  await act(async () => root.unmount()); expect(dispose).toHaveBeenCalled();
});
