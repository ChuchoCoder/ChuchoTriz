// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RatioOrderBook from "./RatioOrderBook";
import type { TradingQuote } from "./trading";

let root: Root, node: HTMLDivElement;
const choose = vi.fn(), submit = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); choose.mockClear(); submit.mockClear();
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const quote: TradingQuote = { depth: [
  { bid: { price: 100, size: 500 }, ask: { price: 101, size: 600 } },
  { bid: { price: 99, size: 400 }, ask: { price: 102, size: 300 } },
  { bid: { price: 98, size: 200 } },
] };
async function render(data = quote, selectedPrice = 100, selectedSide: "bid" | "ask" = "bid", disabled = false) {
  await act(async () => root.render(<form onSubmit={submit}><RatioOrderBook leg="A" quote={data} selectedPrice={selectedPrice} selectedSide={selectedSide} disabled={disabled} onChoose={choose} /></form>));
}
const button = (name: string) => node.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
it("shows five separate levels with sizes and does not repeat missing depth", async () => {
  await render(); expect(node.querySelectorAll("tbody tr")).toHaveLength(5);
  expect(node.querySelector("tbody tr")?.textContent).toBe("500,00100,00101,00600,00");
  expect(button("Usar Compra nivel 3 de A").textContent).toBe("98,00");
  expect(button("Usar Venta nivel 3 de A").disabled).toBe(true);
  expect(button("Usar Compra nivel 5 de A").textContent).toBe("—");
});
it("chooses a price and side from depth without submitting the entry form or copying volume", async () => {
  await render(); await act(async () => button("Usar Venta nivel 2 de A").click());
  expect(choose).toHaveBeenCalledExactlyOnceWith("ask", { price: 102, size: 300 }); expect(submit).not.toHaveBeenCalled();
  await act(async () => node.querySelector<HTMLTableCellElement>(".ro-book-bid-size")!.click()); expect(choose).toHaveBeenCalledTimes(1);
});
it("marks only one selected price and suppresses all depth on invalid market data", async () => {
  await render({ depth: [quote.depth![0], quote.depth![0]] }); expect(node.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  await render({ ...quote, issue: "Mercado desconectado" });
  expect([...node.querySelectorAll("button")].every(b => b.disabled)).toBe(true);
  expect(node.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  await render(quote, 102, "ask", true); expect([...node.querySelectorAll("button")].every(b => b.disabled)).toBe(true);
});
