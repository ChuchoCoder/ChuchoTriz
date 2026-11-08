// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OptionsSimulator from "./OptionsSimulator";
import { Catalog, Contract, Quote, Snapshot } from "./market";
import { positionStorageKey, readPositionAccounting, readUnderlyingCost, underlyingCostStorageKey } from "./positionStorage";
import { addDays, localDate } from "./model";
import { formatOptionExpiry } from "./format";

const marketState = vi.hoisted(() => ({ current: {} as { catalog?: Catalog; data?: Snapshot; issue?: string; selectionKey?: string } }));
vi.mock("./market", async original => ({ ...await original<typeof import("./market")>(), useOptionMarket: () => marketState.current }));
const readPosition = vi.hoisted(() => vi.fn());
vi.mock("./positions", async original => ({ ...await original<typeof import("./positions")>(),
  readPositionSnapshot: async (contracts: Contract[], signal: AbortSignal) => {
    const snapshot = await readPosition(contracts, signal);
    if (signal.aborted) return { snapshot };
    return { snapshot, saved: await readPositionAccounting(positionStorageKey(snapshot.storageScope, contracts[0])),
      savedUnderlying: snapshot.underlyingQuantity ? await readUnderlyingCost(underlyingCostStorageKey(snapshot.storageScope, contracts[0])) : undefined };
  },
}));
let root: Root, container: HTMLDivElement;
let stored: Record<string, unknown>, write: ReturnType<typeof vi.fn>;
let storageListeners: Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>;
const expiry = addDays(localDate(), 30);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stored = {};
  storageListeners = new Set();
  write = vi.fn(async value => { Object.assign(stored, value); });
  readPosition.mockReset();
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 2 }] });
  vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => stored), set: write },
    onChanged: { addListener: storageListeners.add.bind(storageListeners), removeListener: storageListeners.delete.bind(storageListeners) } } });
  const contracts: Catalog["contracts"] = [80, 90, 100, 110, 120].flatMap(strike => (["call", "put"] as const).map(kind => ({
    id: `${kind}-${strike}`, symbol: `${kind.toUpperCase()} ${strike}`, underlyingId: "GGAL", kind, strike,
    expiration: expiry.replaceAll("-", ""), currency: "ARS", strikeCurrency: "ARS", settlement: "2", factor: 100,
  })));
  const quote: Quote = { bid: { price: 4, size: 100 }, ask: { price: 5, size: 200 }, impliedVolatility: 40,
    delta: .5, nominalVolume: 1000, changePercent: 0, lastTradeAt: Date.now(), seq: 1 };
  marketState.current = {
    catalog: { contracts, underlyings: [{ id: "GGAL", symbol: "GGAL", currency: "ARS" }], contextRevision: 1, catalogRevision: 1, version: "4.24.4", excluded: 0 },
    data: { contextRevision: 1, catalogRevision: 1, underlyingId: "GGAL", capturedAt: Date.now(), instruments: {
      GGAL: { ...quote, last: 100, changePercent: 1.25 }, ...Object.fromEntries(contracts.map(contract => [contract.id, { ...quote }])),
    } },
  };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const byLabel = <T extends HTMLElement>(label: string) => {
  const node = Array.from(container.querySelectorAll<T>("[aria-label]")).find(element => element.getAttribute("aria-label") === label);
  if (!node) throw Error("Missing: " + label); return node;
};
const button = (label: string) => {
  const node = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(element => element.textContent?.trim() === label);
  if (!node) throw Error("Missing button: " + label); return node;
};
const positionCheckbox = () => container.querySelector<HTMLInputElement>(".ct-sim-include-position input")!;
async function fill(label: string, value: string) {
  await act(async () => {
    container.querySelector<HTMLButtonElement>(`[aria-label="Editar ${label}"]`)?.click();
  });
  await act(async () => {
    const node = byLabel<HTMLInputElement>(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount() { await act(async () => root.render(<OptionsSimulator />)); }
async function showAnalysis() { await act(async () => button("Análisis").click()); }
async function showBuild() { await act(async () => button("Armado").click()); }
async function clickChartAt(fraction: number) {
  const chart = container.querySelector<SVGSVGElement>('.ct-sim-chart')!;
  const [, , width, height] = chart.getAttribute('viewBox')!.split(' ').map(Number);
  const left = width < 500 ? 64 : 92, right = width < 500 ? 12 : 24;
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, height));
  await act(async () => chart.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: left + fraction * (width - left - right) })));
}

it("mirrors the Premium calls/strike/puts chain and copies ASK/BID into editable simulation legs", async () => {
  await mount();
  const groupHeaders = container.querySelectorAll('.ct-opt-chain thead tr:first-child th:not(.ct-opt-vi-heading)');
  expect(Array.from(groupHeaders).map(node => node.textContent?.split(/\s/)[0])).toEqual(["CALLS", "⚙", "PUTS"]);
  expect(byLabel("Configurar cadena de opciones").closest("th")).toBe(groupHeaders[1]);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("5");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("4");
  await showAnalysis();
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40,00");
  expect(container.querySelectorAll(".ct-sim-chart path")).toHaveLength(3);
  expect(container.textContent).toContain("GGAL"); expect(write).not.toHaveBeenCalled();
});

it("uses the last trade when ASK is missing and lets Armado edit the premium", async () => {
  const quotes = marketState.current.data!.instruments;
  quotes["call-100"] = { ...quotes["call-100"], ask: undefined, last: 3.75 };
  await mount();
  const buy = byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación");
  expect(buy.disabled).toBe(false);
  expect(buy.title).toContain("último precio operado ($ 3,75)");
  expect(buy.querySelector(".ct-opt-quote-value")?.textContent).toBe("—");
  await act(async () => buy.click());
  expect(buy.getAttribute("aria-pressed")).toBe("true");
  expect(byLabel("Editar Precio pata 1").textContent).toBe("3,75");
  await fill("Precio pata 1", "4,25");
  await act(async () => byLabel("Precio pata 1").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  quotes["call-100"].ask = { price: 5, size: 200 };
  await mount();
  expect(byLabel("Editar Precio pata 1").textContent).toBe("4,25");
});

it.each(["chain", "template"])("keeps a very small last-traded premium editable when loaded from the %s", async source => {
  marketState.current.data!.instruments["call-100"] = { ask: undefined, last: 0.0000001 };
  await mount();
  if (source === "template") {
    await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
    await act(async () => byLabel<HTMLButtonElement>("Armar Option · Long Call").click());
  } else {
    await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  }
  expect(container.querySelector(".ct-sim-errors")).toBeNull();
  expect(container.querySelector(".ct-sim-chart")).not.toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Editar Precio pata 1").click());
  expect(byLabel<HTMLInputElement>("Precio pata 1").value).toBe("0.0000001");
});

it("adds a sale with an empty premium when neither BID nor last trade is available", async () => {
  marketState.current.data!.instruments["put-90"] = {};
  await mount();
  const sell = byLabel<HTMLButtonElement>("Vender PUT 90 en simulación");
  expect(sell.disabled).toBe(false);
  expect(sell.title).toContain("Ingresá el precio en Armado");
  await act(async () => sell.click());
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−1");
  expect(byLabel("Editar Precio pata 1").textContent).toBe("—");
  await showAnalysis();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("prima");
  expect(container.querySelector(".ct-sim-errors button")).toBeNull();
  expect(container.querySelector(".ct-sim-chart")).toBeNull();
  await showBuild();
  await fill("Precio pata 1", "2,5");
  await showAnalysis();
  expect(container.querySelector(".ct-sim-chart")).not.toBeNull();
});

it("reorders and replaces mirrored chain columns while keeping the book, IV and strike fixed", async () => {
  const quotes = marketState.current.data!.instruments;
  quotes.GGAL.last = 105;
  quotes["call-100"].last = 3.75;
  quotes["call-100"].referencePrice = 3.5;
  quotes["call-90"].bid = { price: 1.001, size: 100 };
  quotes["call-90"].ask = { price: 1.002, size: 100 };
  quotes["call-90"].impliedVolatility = 5;
  quotes["put-100"].ask = undefined;
  quotes["put-100"].impliedVolatility = undefined;
  await mount();
  expect(byLabel("Último precio operado CALL 100").textContent).toBe("3,75");
  expect(byLabel("Último precio operado PUT 100").textContent).toBe("—");
  const choose = async (label: string, value: string) => act(async () => {
    const select = byLabel<HTMLSelectElement>(label);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const headers = () => [...container.querySelectorAll(".ct-opt-chain thead tr:last-child th")].map(node =>
    node.querySelector("select")?.selectedOptions[0]?.textContent ?? node.textContent);
  const checkbox = (label: string) => [...byLabel("Columnas de cotizaciones").querySelectorAll("label")]
    .find(node => node.textContent?.trim() === label)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(checkbox("Volumen nominal").checked).toBe(true);
  expect(checkbox("Gamma teórica").checked).toBe(false);
  await choose("Cambiar columna Último precio operado de Calls", "referencePrice");
  expect(byLabel("Precio de referencia CALL 100").textContent).toBe("3,5");
  expect(byLabel("Precio de referencia PUT 100").textContent).toBe("—");
  await choose("Cambiar columna Precio de referencia de Puts", "delta");
  expect(headers().slice(0, 6)).toEqual(["Vol. nom.", "Var. %", "Ref.", "Θ/d teór.", "Extr. Mid", "Delta"]);
  await act(async () => byLabel<HTMLButtonElement>("Mover Precio de referencia hacia el borde").click());
  await act(async () => checkbox("Volumen nominal").click());
  for (const label of ["Valor intrínseco", "Gamma teórica", "Vega teórica", "Mid", "Spread %", "Fecha y hora de última operación"]) {
    await act(async () => checkbox(label).click());
  }
  await act(async () => root.render(null));
  await mount();
  expect(checkbox("Volumen nominal").checked).toBe(false);
  expect(checkbox("Gamma teórica").checked).toBe(true);
  const outside = ["Ref.", "Var. %", "Θ/d teór.", "Extr. Mid", "Delta", "Intrínseco", "Gamma", "Vega", "Mid", "Spread %", "Últ. op."];
  expect(headers()).toEqual([...outside, "BID · Vender", "ASK · Comprar", "VI", "Strike", "VI", "BID · Vender", "ASK · Comprar", ...outside.toReversed()]);
  expect(container.querySelectorAll(".ct-opt-chain tr[data-option-strike]:first-child > *")).toHaveLength(headers().length);
  expect(container.querySelector(".ct-opt-itm-boundary td")?.getAttribute("colspan")).toBe(String(headers().length));
  expect(container.querySelector(".ct-opt-calls-heading")?.getAttribute("colspan")).toBe("13");
  const headerOptions = Array.from(byLabel<HTMLSelectElement>("Cambiar columna Precio de referencia de Calls").options, option => option.value);
  expect(headerOptions.filter(column => ["bid", "ask", "iv", "strike"].includes(column))).toEqual([]);
  expect(byLabel("Mid CALL 100").textContent).toBe("4,5");
  expect(byLabel("Mid CALL 90").textContent).toBe("1,0015");
  expect(byLabel("Spread % CALL 100").textContent).toBe("22,22 %");
  expect(byLabel("Mid PUT 100").textContent).toBe("—");
  expect(byLabel("Spread % PUT 100").textContent).toBe("—");
  expect(byLabel("Valor intrínseco CALL 100").textContent).toBe("5");
  expect(byLabel("Valor intrínseco PUT 100").textContent).toBe("0");
  expect(byLabel("Gamma teórica CALL 100").textContent).not.toBe("—");
  expect(byLabel("Gamma teórica CALL 90").textContent).toMatch(/E[-−]\d+$/);
  expect(byLabel("Vega teórica CALL 100").textContent).not.toBe("—");
  expect(byLabel("Gamma teórica PUT 100").textContent).toBe("—");
  expect(byLabel("Última operación CALL 100").getAttribute("title")).toMatch(/ART$/);
  quotes.GGAL.last = 100.0125;
  await mount();
  expect(byLabel("Valor intrínseco CALL 100").textContent).toBe("0,0125");
  expect(byLabel("Valor intrínseco CALL 100").title).toBe("0,0125");
  await act(async () => button("Restablecer columnas").click());
  expect(byLabel("Último precio operado CALL 100").textContent).toBe("3,75");
  expect(byLabel("Configurar cadena de opciones")).toBeTruthy();
});

it("restores a prior visibility preference while retaining the now fixed IV columns", async () => {
  stored[`OptionsSimulatorChainColumnsV1:${location.origin}`] = ["last", "delta"];
  await mount();
  const headings = container.querySelectorAll(".ct-opt-chain thead tr:last-child th");
  expect(headings).toHaveLength(11);
  expect(Array.from(headings, heading => heading.querySelector("select")?.value ?? heading.textContent))
    .toEqual(["delta", "last", "BID · Vender", "ASK · Comprar", "VI", "Strike", "VI", "BID · Vender", "ASK · Comprar", "last", "delta"]);
  expect(write).not.toHaveBeenCalled();
});

it("syncs external column changes and applies edits to the latest saved order", async () => {
  const key = `OptionsSimulatorChainColumnsV2:${location.origin}`;
  stored[key] = ["last"];
  await mount();
  await act(async () => {
    stored[key] = ["last", "gamma"];
    storageListeners.forEach(listener => listener({ [key]: { newValue: stored[key] } }, "local"));
  });
  const config = byLabel("Columnas de cotizaciones");
  const checkbox = (label: string) => [...config.querySelectorAll("label")]
    .find(node => node.textContent?.trim() === label)!.querySelector<HTMLInputElement>("input")!;
  expect(checkbox("Gamma teórica").checked).toBe(true);
  stored[key] = ["last", "gamma", "referencePrice"];
  await act(async () => checkbox("Vega teórica").click());
  expect(stored[key]).toEqual(["last", "gamma", "referencePrice", "vega"]);
  expect(checkbox("Precio de referencia").checked).toBe(true);
});

it("pulses each price in its own direction and ignores the first quote after a gap", async () => {
  const snapshot = marketState.current.data!;
  const original = snapshot.instruments["call-100"];
  const ask = () => byLabel("Comprar CALL 100 en simulación").querySelector(".ct-opt-quote-value")!;
  const bid = () => byLabel("Vender CALL 100 en simulación").querySelector(".ct-opt-quote-value")!;
  const pulses = () => container.querySelectorAll(".ct-opt-quote-changed");
  marketState.current.data = undefined;
  await mount();
  expect(ask().textContent).toBe("—");
  expect(pulses()).toHaveLength(0);

  marketState.current.data = snapshot;
  await mount();
  expect(ask().textContent).toBe("$ 5");
  expect(pulses()).toHaveLength(0);

  snapshot.instruments["call-100"] = { ...original, ask: { price: 6, size: 200 }, bid: { price: 3, size: 110 } };
  await mount();
  expect(ask().classList.contains("ct-opt-quote-up")).toBe(true);
  expect(bid().classList.contains("ct-opt-quote-down")).toBe(true);
  expect(byLabel("Vender CALL 100 en simulación").querySelector(".ct-opt-quantity.ct-opt-quote-quantity")).not.toBeNull();
  expect(pulses()).toHaveLength(3);

  const previousAsk = ask();
  snapshot.instruments["call-100"] = { ...snapshot.instruments["call-100"], ask: { price: 7, size: 200 } };
  await mount();
  expect(ask()).not.toBe(previousAsk);
  expect(ask().classList.contains("ct-opt-quote-up")).toBe(true);
  await act(async () => ask().dispatchEvent(new Event("animationend")));
  expect(ask().classList.contains("ct-opt-quote-changed")).toBe(false);

  marketState.current.data = undefined;
  await mount();
  expect(bid().textContent).toBe("—");
  expect(pulses()).toHaveLength(0);
  snapshot.instruments["call-100"] = original;
  marketState.current.data = snapshot;
  await mount();
  expect(bid().textContent).toBe("$ 4");
  expect(pulses()).toHaveLength(0);
});

it("sets only the clicked quote's contracts using the compact quantity bar", async () => {
  await mount();
  const buy = byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación");
  const sell = byLabel<HTMLButtonElement>("Vender PUT 90 en simulación");
  const bar = () => container.querySelector(".ct-opt-quantity-bar");
  expect(bar()).toBeNull();
  await act(async () => buy.click());
  expect(bar()?.parentElement).toBe(buy.parentElement);
  expect(bar()?.firstElementChild?.textContent).toBe("Cant.");
  expect([...bar()!.querySelectorAll("button")].map(node => node.textContent)).toEqual(["1", "10", "25", "50", "100"]);
  expect(byLabel("Cantidad total").textContent).toBe("1");
  await act(async () => {
    byLabel<HTMLButtonElement>("Fijar 50 contratos").click();
    const preset = byLabel<HTMLButtonElement>("Fijar 25 contratos");
    preset.click(); preset.click();
  });
  expect(byLabel("Cantidad total").textContent).toBe("25");
  expect(buy.textContent).toContain("Compra · 25");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+25");

  await act(async () => buy.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: sell })));
  expect(bar()).toBeNull();
  await act(async () => sell.click());
  await act(async () => byLabel<HTMLButtonElement>("Fijar 100 contratos").click());
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+25");
  expect(byLabel("Editar Contratos pata 2").textContent).toBe("−100");
  expect(byLabel("Editar Prima pata 2").textContent).toBe("4");
  await act(async () => sell.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: buy })));
  expect(bar()?.parentElement).toBe(buy.parentElement);
  await act(async () => buy.click());
  expect(bar()).toBeNull();
  expect(buy.getAttribute("aria-pressed")).toBe("false");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−100");
});

it("closes the active Armado editor and replaces its quantity from the grid", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Fijar 10 contratos").click());
  await fill("Contratos pata 1", "15");
  const editor = byLabel<HTMLInputElement>("Contratos pata 1");
  expect(document.activeElement).toBe(editor);
  const quote = byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación");
  await act(async () => quote.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(byLabel("Cantidad total").textContent).toBe("15");
  await act(async () => byLabel<HTMLButtonElement>("Fijar 25 contratos").click());
  expect(editor.isConnected).toBe(false);
  expect(byLabel("Cantidad total").textContent).toBe("25");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+25");
  await fill("Contratos pata 1", "9999999999");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await act(async () => quote.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  await act(async () => byLabel<HTMLButtonElement>("Fijar 1 contrato").click());
  expect(byLabel("Cantidad total").textContent).toBe("1");
});

it("does not overwrite an Armado change with a stale grid change", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => {
    byLabel<HTMLButtonElement>("Aumentar contratos pata 1").click();
    byLabel<HTMLButtonElement>("Fijar 10 contratos").click();
  });
  expect(byLabel("Cantidad total").textContent).toBe("2");
});

it("keeps expiry available when a native VI is missing", async () => {
  marketState.current.data!.instruments["call-100"].impliedVolatility = undefined;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(container.querySelector(".ct-sim-scenario-results")).toBeNull();
  await showAnalysis();
  const table = container.querySelector<HTMLTableElement>(".ct-sim-scenario-results table")!;
  expect(table.tBodies[0].rows).toHaveLength(25);
  expect(table.querySelectorAll("tbody [data-band]")).toHaveLength(1);
  const reference = table.querySelector<HTMLTableRowElement>('tr[data-band="spot"]')!;
  expect(Array.from(reference.cells, cell => cell.textContent)).toEqual(["0%", "100,00", "-500", "—"]);
  const upTen = Array.from(table.tBodies[0].rows).find(row => row.cells[0].textContent === "+10%")!;
  expect(Array.from(upTen.cells, cell => cell.textContent)).toEqual(["+10%", "110,00", "500", "—"]);
  expect(container.textContent).toContain("Teórico no disponible");
  expect(container.querySelector(".ct-sim-expiry-line")).not.toBeNull();
  expect(container.querySelector(".ct-sim-theory-line")).toBeNull();
  await fill("VI pata 1", "45");
  expect(container.querySelector(".ct-sim-theory-line")).not.toBeNull();
  expect(reference.cells[3].textContent).not.toBe("—");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  expect(reference.cells[3].textContent).toBe(reference.cells[2].textContent);
});
it("loads the initial position once when the selected chain is ready", async () => {
  await mount();
  expect(readPosition).not.toHaveBeenCalled();

  marketState.current.selectionKey = JSON.stringify(Object.keys(marketState.current.data!.instruments).sort());
  await mount();
  expect(readPosition).toHaveBeenCalledTimes(1);
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("+2");
  expect(positionCheckbox().checked).toBe(false);

  await showAnalysis();
  await showBuild();
  await act(async () => button("Limpiar posición").click());
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("");
  await act(async () => positionCheckbox().click());
  await act(async () => button("Nueva simulación").click());
  expect(positionCheckbox().checked).toBe(false);
  expect(readPosition).toHaveBeenCalledTimes(1);
});

it("loads nominal holdings without open options and includes them only while the position is checked", async () => {
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(),
    reportedAt: Date.now(), positions: [], underlyingQuantity: 100 });
  marketState.current.selectionKey = JSON.stringify(Object.keys(marketState.current.data!.instruments).sort());
  await mount();
  expect(byLabel<HTMLInputElement>("Nominales del subyacente").value).toBe("100");
  await showAnalysis();
  const include = positionCheckbox();
  expect(include.checked).toBe(false);
  expect(container.querySelector(".ct-sim-errors")).toBeNull();
  await act(async () => include.click());
  expect(container.querySelector(".ct-sim-errors")?.textContent).toContain("Costo promedio por nominal");
  await act(async () => button("Corregir posición").click());
  expect(button("Armado").getAttribute("aria-selected")).toBe("true");
  await fill("Costo promedio por nominal", "90");
  await showAnalysis();
  expect(byLabel("Patas analizadas").textContent).toContain("+100 nominales de GGAL");
  expect([...container.querySelectorAll(".ct-sim-analysis-chart .ct-sim-inspect output")].map(node => node.textContent)).toEqual(["1.000 ARS", "1.000 ARS"]);
  await act(async () => include.click());
  expect(byLabel("Patas analizadas").textContent).not.toContain("nominales");
  expect(container.querySelector(".ct-sim-analysis-chart .ct-sim-chart")).toBeNull();
  await act(async () => include.click());
  expect(container.querySelector(".ct-sim-analysis-chart .ct-sim-chart")).not.toBeNull();
  await act(async () => root.render(<OptionsSimulator key="fresh-position" />));
  expect(byLabel<HTMLInputElement>("Costo promedio por nominal").value).toBe("90");
});

it("offers to correct the position when its nominal exposure exceeds the precision limit", async () => {
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(),
    reportedAt: Date.now(), positions: [], underlyingQuantity: 10_000_000 });
  marketState.current.selectionKey = JSON.stringify(Object.keys(marketState.current.data!.instruments).sort());
  await mount();
  await fill("Costo promedio por nominal", "1000000000");
  await showAnalysis();
  expect(container.querySelector(".ct-sim-errors")).toBeNull();
  await act(async () => positionCheckbox().click());
  expect(container.querySelector(".ct-sim-errors")?.textContent).toContain("el importe total supera la precisión admitida");
  await act(async () => button("Corregir posición").click());
  expect(button("Armado").getAttribute("aria-selected")).toBe("true");
  await fill("Costo promedio por nominal", "90");
  await showAnalysis();
  expect(container.querySelector(".ct-sim-analysis-chart .ct-sim-chart")).not.toBeNull();
});

it("values edited nominal quantities locally and restores the imported quantity and basis on reload", async () => {
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(),
    reportedAt: Date.now(), positions: [], underlyingQuantity: 100 });
  marketState.current.selectionKey = JSON.stringify(Object.keys(marketState.current.data!.instruments).sort());
  await mount();
  await fill("Costo promedio por nominal", "90");
  const nominals = byLabel<HTMLInputElement>("Nominales del subyacente");
  await act(async () => nominals.focus());
  await fill("Nominales del subyacente", "200");
  await act(async () => nominals.blur());
  await fill("Costo promedio por nominal", "95");
  const key = underlyingCostStorageKey("a".repeat(64), marketState.current.catalog!.contracts[0]);
  expect(await readUnderlyingCost(key)).toMatchObject({ quantity: 100, averageCost: "90" });
  await act(async () => positionCheckbox().click());
  await showAnalysis();
  expect(byLabel("Patas analizadas").textContent).toContain("+200 nominales de GGAL");
  expect(container.querySelector(".ct-sim-analysis-chart .ct-sim-inspect output")?.textContent).toBe("1.000 ARS");
  await showBuild();
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Nominales del subyacente").value).toBe("100");
  expect(byLabel<HTMLInputElement>("Costo promedio por nominal").value).toBe("90");
});

it("loads holdings and shows the local read time if Matriz reports a future date", async () => {
  const capturedAt = Date.now();
  readPosition.mockResolvedValueOnce({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt,
    reportedAt: capturedAt + 25 * 60 * 60 * 1000, positions: [{ securityId: "call-100", quantity: 2 }] });
  marketState.current.selectionKey = JSON.stringify(Object.keys(marketState.current.data!.instruments).sort());
  await mount();
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("+2");
  expect(container.textContent).toContain("Consulta local · " + new Date(capturedAt).toLocaleString("es-AR"));
  expect(container.textContent).toContain("La fecha informada por Matriz es posterior a la consulta.");
});

it("keeps position accounting above the single-row header and shows deviations while premiums are incomplete", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const strike = this.dataset.optionStrike;
    return strike === undefined ? new DOMRect(0, 0, 496, 186) : new DOMRect(0, 26 + (Number(strike) - 80) / 10 * 32, 496, 32);
  });
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  const chain = container.querySelector<HTMLTableElement>(".ct-opt-position-chain")!;
  expect(chain.tHead?.rows).toHaveLength(1);
  expect(Array.from(chain.tHead!.rows[0].cells, cell => cell.textContent)).toEqual([
    "CALLS · Cant.", "Prima histórica", "Strike", "PUTS · Cant.", "Prima histórica",
  ]);
  const strikeRow = chain.querySelector<HTMLTableRowElement>('tr[data-option-strike="100"]')!;
  expect(strikeRow.cells[3].contains(byLabel("Cantidad posición PUT 100"))).toBe(true);
  expect(strikeRow.cells[4].contains(byLabel("Prima histórica PUT 100"))).toBe(true);
  const controls = byLabel("Controles de posición");
  for (const label of ["Gastos de la posición", "Resultado realizado neto"]) {
    const field = byLabel(label);
    expect(controls.contains(field)).toBe(true);
    expect(field.compareDocumentPosition(button("Limpiar posición"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  }
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("");
  expect(container.querySelector(".ct-sim-chart")).toBeNull();
  expect(container.querySelectorAll(".ct-opt-sigma-line")).toHaveLength(2);
  await fill("Prima histórica CALL 100", "8");
  expect(container.querySelectorAll(".ct-opt-sigma-line")).toHaveLength(2);
});

it("imports a historical position and preserves its premiums and accounting through every adjustment control", async () => {
  await mount();
  expect(readPosition).not.toHaveBeenCalled();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  expect(container.querySelector('.ct-sim-position')).not.toBeNull();
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("");
  expect(container.querySelector('.ct-sim-chart')).toBeNull();
  await act(async () => positionCheckbox().click());
  await fill("Prima histórica CALL 100", "8");
  await fill("Gastos de la posición", "40");
  await fill("Resultado realizado neto", "200");
  const baseResults = [...container.querySelectorAll('.ct-sim-inspect output')].map(node => node.textContent);
  await act(async () => button("Cotizaciones").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Subir cantidades de toda la estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Subir strikes de toda la estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Tomar precio Mid de la estrategia").click());
  await act(async () => button("Posición actual").click());
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
  expect(byLabel<HTMLInputElement>("Gastos de la posición").value).toBe("40");
  expect(byLabel<HTMLInputElement>("Resultado realizado neto").value).toBe("200");
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("+2");
  expect(byLabel<HTMLSelectElement>("Subyacente de opciones").disabled).toBe(true);
  await act(async () => byLabel<HTMLButtonElement>("Limpiar ajustes").click());
  expect([...container.querySelectorAll('.ct-sim-inspect output')].map(node => node.textContent)).toEqual(baseResults);
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
  await showAnalysis();
  expect(container.querySelector('.ct-sim-analysis-panel .ct-opt-position-chain')).toBeNull();
  expect(byLabel<HTMLInputElement>("Gastos de la posición").value).toBe("40");
  expect(byLabel<HTMLInputElement>("Resultado realizado neto").value).toBe("200");
  expect(container.querySelectorAll('.ct-sim-position')).toHaveLength(1);
  expect(write).toHaveBeenCalled();
  await act(async () => button("Nueva simulación").click());
  expect(container.querySelector('.ct-sim-position')).toBeNull();
});
it("restores saved accounting after resetting the draft and remounting the simulator", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await fill("Prima histórica CALL 100", "8.25"); await fill("Gastos de la posición", "40"); await fill("Resultado realizado neto", "-200");
  await act(async () => button("Nueva simulación").click());
  await act(async () => root.render(<OptionsSimulator key="new-session" />));
  readPosition.mockResolvedValueOnce({ contextId: "new-session", storageScope: "a".repeat(64), capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 2 }] });
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8.25");
  expect(byLabel<HTMLInputElement>("Gastos de la posición").value).toBe("40");
  expect(byLabel<HTMLInputElement>("Resultado realizado neto").value).toBe("-200");
  expect(byLabel("Guardado de datos históricos").textContent).toContain("Guardado en este perfil");
});
it("warns on quantity changes until the user confirms or edits the premium, including on later imports", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await fill("Prima histórica CALL 100", "8");
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 3 }] });
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
  expect(container.querySelector('.ct-sim-premium-warning')?.textContent).toContain("Cambió la cantidad de 2 a 3");
  await act(async () => button("Recargar tenencia").click());
  expect(container.querySelector('.ct-sim-premium-warning')).not.toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Ver aviso de prima histórica CALL 100").click());
  expect(container.querySelector('.ct-sim-premium-warning')).not.toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Confirmar prima histórica CALL 100").click());
  expect(container.querySelector('.ct-sim-premium-warning')).toBeNull();
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64), capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 4 }] });
  await act(async () => button("Recargar tenencia").click());
  expect(container.querySelector('.ct-sim-premium-warning')).not.toBeNull();
  await fill("Prima histórica CALL 100", "-1");
  expect(container.querySelector('.ct-opt-premium-review button')).toBeNull();
  expect(container.querySelector('.ct-sim-premium-warning')).not.toBeNull();
  await fill("Prima histórica CALL 100", "8.50");
  expect(container.querySelector('.ct-sim-premium-warning')).toBeNull();
});
it("shows an error if historical accounting cannot be saved", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  write.mockRejectedValueOnce(Error("storage unavailable"));
  await fill("Prima histórica CALL 100", "8");
  expect(byLabel("Guardado de datos históricos").textContent).toContain("No se pudo guardar");
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
});
it("cancels an in-flight import when leaving Armado and never overwrites the draft with its late response", async () => {
  let resolve!: (value: unknown) => void;
  readPosition.mockImplementation(() => new Promise(done => { resolve = done; }));
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  const signal = readPosition.mock.calls[0][1] as AbortSignal;
  await showAnalysis();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ contextId: "demo-context", capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 2 }] }));
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("");
  expect(container.textContent).not.toContain("Reporte de Matriz");
});

it("edits position in the chain and toggles its effect without discarding the simulated strategy or accounting", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  await fill("Gastos de entrada totales", "15");
  await showBuild();
  const chain = byLabel("Cadena de opciones");
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  const quantity = byLabel<HTMLInputElement>("Cantidad posición CALL 100");
  expect(chain.contains(quantity)).toBe(true);
  expect(quantity.value).toBe("+2");
  const include = positionCheckbox();
  expect(include.checked).toBe(false);
  expect(container.querySelector(".ct-sim-inspect output")?.textContent).toBe("-515 ARS");
  await act(async () => button("Cotizaciones").click());
  await showAnalysis();
  await act(async () => include.click());
  expect(container.querySelector(".ct-sim-errors")?.textContent).toContain("Posición, pata 1, prima");
  await act(async () => button("Corregir posición").click());
  expect(button("Armado").getAttribute("aria-selected")).toBe("true");
  expect(button("Posición actual").getAttribute("aria-pressed")).toBe("true");
  expect(include.checked).toBe(true);
  await fill("Prima histórica CALL 100", "8");
  await fill("Gastos de la posición", "40");
  await fill("Resultado realizado neto", "200");
  await act(async () => byLabel<HTMLInputElement>("Cantidad posición PUT 90").focus());
  await fill("Cantidad posición PUT 90", "−3");
  await act(async () => byLabel<HTMLInputElement>("Cantidad posición PUT 90").blur());
  expect(byLabel<HTMLInputElement>("Cantidad posición PUT 90").value).toBe("−3");
  await fill("Prima histórica PUT 90", "2.5");
  await showAnalysis();
  await act(async () => include.click());
  expect(include.checked).toBe(false);
  expect(container.querySelector(".ct-sim-inspect output")?.textContent).toBe("-515 ARS");
  expect(byLabel("Patas analizadas").textContent).not.toContain("PUT 90");
  await act(async () => include.click());
  expect(container.querySelector(".ct-sim-inspect output")?.textContent).toBe("-1.205 ARS");
  expect(byLabel("Patas analizadas").textContent).toContain("Venta 3× PUT 90");
  await act(async () => button("Editar posición en la cadena").click());
  await act(async () => button("Limpiar posición").click());
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("");
  expect(byLabel<HTMLInputElement>("Cantidad posición PUT 90").value).toBe("");
  expect(byLabel<HTMLInputElement>("Gastos de la posición").value).toBe("0");
  expect(container.querySelector(".ct-sim-inspect output")?.textContent).toBe("-515 ARS");
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("+2");
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
  expect(byLabel<HTMLInputElement>("Cantidad posición PUT 90").value).toBe("");
  expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(1);
});

it("opens the volatility editor for a valuation error on a historical leg", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await fill("Prima histórica CALL 100", "8");
  await act(async () => positionCheckbox().click());
  await showAnalysis();
  const details = container.querySelector<HTMLDetailsElement>(".ct-sim-leg-volatilities")!;
  await act(async () => details.querySelector("summary")!.click());
  await fill("VI pata 1", "510");
  await act(async () => details.querySelector("summary")!.click());
  expect(details.open).toBe(false);
  expect(container.querySelector(".ct-sim-errors")?.textContent).toContain("Posición, pata 1, VI");
  await act(async () => {
    button("Revisar VI de la posición").click();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  });
  expect(details.open).toBe(true);
  expect(document.activeElement).toBe(details.querySelector("summary"));
  await fill("VI pata 1", "40");
  expect(container.querySelector(".ct-sim-errors")).toBeNull();
});

it("keeps manual position editing available when the native report fails", async () => {
  readPosition.mockRejectedValueOnce(Error("El reporte no respondió."));
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  expect(container.textContent).toContain("El reporte no respondió.");
  const quantity = byLabel<HTMLInputElement>("Cantidad posición PUT 90");
  await act(async () => quantity.focus());
  await fill("Cantidad posición PUT 90", "-2");
  await act(async () => quantity.blur());
  await fill("Prima histórica PUT 90", "3");
  expect(quantity.value).toBe("−2");
  await act(async () => positionCheckbox().click());
  expect(container.querySelector(".ct-sim-inspect output")?.textContent).toBe("600 ARS");
  expect(byLabel("Guardado de datos históricos").textContent).toContain("Edición manual");
  expect(write).not.toHaveBeenCalled();
});

it("recovers saved premiums after a verified empty report and a later reload", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await fill("Prima histórica CALL 100", "8");
  const written = write.mock.calls.length;
  readPosition.mockResolvedValueOnce({ contextId: "demo-context", storageScope: "a".repeat(64),
    capturedAt: Date.now(), reportedAt: Date.now(), positions: [] });
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("");
  expect(write.mock.calls).toHaveLength(written);
  await act(async () => button("Recargar tenencia").click());
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("+2");
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
});

it("keeps the position factor locked even when the verified report is empty", async () => {
  marketState.current.catalog!.contracts.find(contract => contract.id === "put-90")!.factor = 200;
  readPosition.mockResolvedValueOnce({ contextId: "demo-context", storageScope: "a".repeat(64),
    capturedAt: Date.now(), reportedAt: Date.now(), positions: [] });
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await act(async () => button("Cotizaciones").click());
  await act(async () => byLabel<HTMLButtonElement>("Comprar PUT 90 en simulación").click());
  expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(0);
  await act(async () => button("Posición actual").click());
  expect(container.querySelector('[aria-label="Cantidad posición PUT 90"]')).toBeNull();
  expect(byLabel<HTMLInputElement>("Cantidad posición CALL 100").value).toBe("");
});

it("recovers a removed series' saved premium for review when it is still held", async () => {
  readPosition.mockResolvedValue({ contextId: "demo-context", storageScope: "a".repeat(64),
    capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: "call-100", quantity: 2 }, { securityId: "put-90", quantity: -1 }] });
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Cargar posición actual").click());
  await fill("Prima histórica CALL 100", "8");
  await fill("Prima histórica PUT 90", "3");
  const quantity = byLabel<HTMLInputElement>("Cantidad posición CALL 100");
  await act(async () => quantity.focus());
  await fill("Cantidad posición CALL 100", "0");
  await act(async () => quantity.blur());
  expect(quantity.value).toBe("");
  await act(async () => quantity.focus());
  await fill("Cantidad posición CALL 100", "+2");
  await act(async () => quantity.blur());
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("");
  await act(async () => button("Recargar tenencia").click());
  expect(quantity.value).toBe("+2");
  expect(byLabel<HTMLInputElement>("Prima histórica CALL 100").value).toBe("8");
  expect(byLabel("Confirmar prima histórica CALL 100")).not.toBeNull();
});
it("selecting a marked quote removes the leg; no execution controls are present", async () => {
  await mount();
  const buy = byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación");
  await act(async () => buy.click()); expect(buy.getAttribute("aria-pressed")).toBe("true");
  await act(async () => buy.click()); expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(0);
  for (const label of ["Enviar", "Cancelar orden", "Ejecutar", "Maker", "Cruce", "Preparar operación"]) expect(container.textContent).not.toContain(label);
});
it("rejects crossed and locked books on direct chain selection and recovers with valid quotes", async () => {
  for (const ask of [10, 12]) {
    marketState.current.data!.instruments["call-100"] = { bid: { price: 12, size: 100 }, ask: { price: ask, size: 100 } };
    await mount();
    for (const action of ["Comprar", "Vender"]) {
      const quote = byLabel<HTMLButtonElement>(`${action} CALL 100 en simulación`);
      expect(quote.disabled).toBe(true);
      expect(quote.title).toContain("cerrado o cruzado");
      await act(async () => quote.click());
    }
    expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(0);
  }
  marketState.current.data!.instruments["call-100"].ask = { price: 13, size: 100 };
  await mount();
  expect(byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").disabled).toBe(false);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(byLabel("Editar Prima pata 1").textContent).toBe("13");
  await showAnalysis();
  expect([...container.querySelectorAll('label')].some(label => label.textContent?.includes("Moneda común"))).toBe(false);
});
it("rejects incoherent currencies or native factors rather than assuming a lot of 100", async () => {
  marketState.current.catalog!.contracts.find(contract => contract.id === "call-100")!.factor = undefined;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(0);
  expect(container.textContent).toContain("faltan factores");
});



it("uses each leg's total contracts without a global multiplier in either view", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Contratos pata 1", "3");
  await showAnalysis();
  expect(container.textContent?.toLowerCase()).not.toContain("combo");
  expect(byLabel("Patas analizadas").textContent).toContain("Compra 3× CALL 100");
  expect(container.querySelector('.ct-sim-metrics')!.textContent).toContain("1.500 ARS");

});





it("edits compact cells on click, accepts on Enter or blur, and restores the original value on Escape", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(container.querySelectorAll('.ct-sim-legs-card tbody input, .ct-sim-legs-card tbody select')).toHaveLength(0);
  await fill("Precio pata 1", "6,25");
  await act(async () => byLabel<HTMLInputElement>("Precio pata 1").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(byLabel("Editar Precio pata 1").textContent).toBe("6,25");
  expect(container.textContent).toContain("625 ARS");
  await showAnalysis();
  expect(byLabel("Editar Prima pata 1").textContent).toBe("6,25");
  await fill("Prima pata 1", "7,5");
  const premium = byLabel<HTMLInputElement>("Prima pata 1");
  expect(document.activeElement).toBe(premium);
  await act(async () => premium.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("7,5");
  expect(document.activeElement).toBe(byLabel("Editar Prima pata 1"));
  expect(container.textContent).toContain("750 ARS");
  await fill("Prima pata 1", "60");
  await act(async () => byLabel<HTMLInputElement>("Prima pata 1").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("7,5");
  await showBuild();
  await fill("Contratos pata 1", "3");
  await act(async () => byLabel("Limpiar patas").focus());
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 1").textContent).toBe("+3");
  expect(container.textContent).toContain("2.250 ARS");
});



it("groups VI and columns in the chain settings and removes market references during a disconnect", async () => {
  await mount();
  const config = byLabel<HTMLDialogElement>("Configuración de la cadena");
  const trigger = byLabel<HTMLButtonElement>("Configurar cadena de opciones");
  expect(trigger.getAttribute("aria-controls")).toBe(config.id);
  expect(config.localName).toBe("dialog");
  const open = vi.fn(), close = vi.fn();
  Object.defineProperties(config, { showModal: { value: open }, close: { value: close } });
  await act(async () => trigger.click());
  expect(open).toHaveBeenCalledOnce();
  expect(config.contains(byLabel("Columnas de cotizaciones"))).toBe(true);
  expect(config.contains(byLabel("Filtro temporal de VI"))).toBe(true);
  await act(async () => button("15 min").click());
  expect(byLabel<HTMLInputElement>("Antigüedad máxima de la operación en minutos").value).toBe("15");
  await act(async () => button("Listo").click());
  expect(close).toHaveBeenCalledOnce();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(byLabel<HTMLButtonElement>("Tomar precio Mid de la estrategia").disabled).toBe(false);
  marketState.current = { catalog: marketState.current.catalog, issue: "Disconnected" };
  await act(async () => root.render(<OptionsSimulator />));
  expect(byLabel<HTMLButtonElement>("Tomar precio Mid de la estrategia").disabled).toBe(true);
  expect(byLabel("Editar Prima pata 1").textContent).toBe("5");
});

it("separates build and analysis while preserving legs, market selection and scenario assumptions", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Prima pata 1", "7,5");
  await showAnalysis();
  const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');
  expect(panels[0].hidden).toBe(true); expect(panels[1].hidden).toBe(false);
  expect(byLabel("Patas analizadas").textContent).toContain("Compra 1× CALL 100");
  await act(async () => byLabel<HTMLButtonElement>("Precio +10%").click());
  await act(async () => byLabel<HTMLButtonElement>("VI +5 pp").click());
  await showBuild();
  expect(panels[0].hidden).toBe(false); expect(panels[1].hidden).toBe(true);
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("7,5");
  expect(byLabel<HTMLSelectElement>("Subyacente de opciones").value).toBe("GGAL");
  await showAnalysis();
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("110");
  expect(byLabel<HTMLInputElement>("Cambio de VI (pp)").value).toBe("5");
});

it("shows a live chart below the legs and shares its scenario with the full analysis chart", async () => {
  await mount();
  const quick = byLabel("Resultado rápido del armado");
  expect(quick.textContent).toContain("Armá una estrategia");
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(quick.querySelector('.ct-sim-chart')).not.toBeNull();
  expect(container.querySelectorAll('.ct-sim-chart')).toHaveLength(1);
  const outputs = () => Array.from(container.querySelectorAll('.ct-sim-inspect output')).map(output => output.textContent);
  expect(outputs()[0]).toBe("-500 ARS");
  await fill("Prima pata 1", "7,5");
  expect(outputs()[0]).toBe("-750 ARS");
  const buildResults = outputs();
  await act(async () => button("Análisis →").click());
  expect(container.querySelectorAll('.ct-sim-chart')).toHaveLength(1);
  const results = byLabel("Resultados de la simulación");
  const analysisChart = results.querySelector('.ct-sim-chart')!;
  expect(analysisChart.compareDocumentPosition(results.querySelector('h3')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(analysisChart.compareDocumentPosition(byLabel("Patas analizadas"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(outputs()).toEqual(buildResults);
  await act(async () => byLabel<HTMLButtonElement>("VI +5 pp").click());
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  await act(async () => byLabel<HTMLButtonElement>("Precio +10%").click());
  const scenarioResults = outputs();
  await showBuild();
  expect(outputs()).toEqual(scenarioResults);
  expect(byLabel("Resultado rápido del armado").querySelector('button')!.title).toContain("VI 5,00 pp");
  await fill("Contratos pata 1", "2");
  expect(outputs()).toEqual(["500 ARS", "500 ARS"]);
  await clickChartAt(.6);
  expect(outputs()).toEqual(["-500 ARS", "-500 ARS"]);
  await showAnalysis();
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("105");
  expect(outputs()).toEqual(["-500 ARS", "-500 ARS"]);
  await showBuild(); await fill("Contratos pata 1", "0");
  expect(container.querySelector('.ct-sim-chart')).toBeNull();
  expect(byLabel("Resultado rápido del armado").textContent).toContain("Revisá los datos");
});

it("scenario toggles change only the hypothetical price, VI and date, and coincide at expiry", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  const outputs = () => Array.from(container.querySelectorAll('.ct-sim-inspect output')).map(output => output.textContent);
  const initial = outputs();
  await act(async () => byLabel<HTMLButtonElement>("VI +5 pp").click());
  expect(outputs()[0]).toBe(initial[0]); expect(outputs()[1]).not.toBe(initial[1]);
  await act(async () => byLabel<HTMLButtonElement>("Precio +10%").click());
  expect(outputs()[0]).toBe("500 ARS");
  expect(container.querySelector('[aria-label="Precio de referencia"]')).toBeNull();
  expect(container.querySelector('.ct-sim-scenario [aria-label="Vencimiento"]')).toBeNull();
  expect(container.querySelector('[aria-label="Factor monetario por contrato"]')).toBeNull();
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40,00");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  expect(outputs()[0]).toBe(outputs()[1]);
  await act(async () => byLabel<HTMLButtonElement>("Fecha 15 días").click());
  expect(byLabel<HTMLInputElement>("Fecha teórica").value).toBe(addDays(localDate(), 15));
});

it("consolidates useful market information into one legend without repeated book/time/volume-scale noise", async () => {
  await mount();
  const legends = container.querySelectorAll('.ct-sim-chain-legend');
  expect(legends).toHaveLength(1);
  expect(legends[0].closest('thead')).not.toBeNull();
  expect(legends[0].textContent).not.toContain("GGAL 100 ARS");
  expect([...legends[0].querySelectorAll('.ct-opt-vi-heading')].map(cell => cell.textContent)).toEqual(["40,00 %", "40,00 %"]);
  expect(byLabel("Variación diaria del subyacente").textContent).toBe("+1,25 %");
  for (const text of ["Barra 100", "VN", "BID", "ASK", "Lectura", "Excluidos", "recientes"]) expect(legends[0].textContent).not.toContain(text);
  expect(container.querySelector('.ct-opt-chain-footer')).toBeNull();
});

it("synchronizes scenario sliders with the chart, exact fields and presets", async () => {
  marketState.current.data!.instruments["call-100"].impliedVolatility = 2;
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  const price = byLabel<HTMLInputElement>("Deslizar precio del escenario");
  const volatility = byLabel<HTMLInputElement>("Deslizar cambio de VI");
  const date = byLabel<HTMLInputElement>("Deslizar fecha teórica");
  expect(volatility.min).toBe("-2");
  expect(date.max).toBe("30");
  await fill("Deslizar precio del escenario", "200");
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("125");
  expect(byLabel("Precio fijado").textContent).toBe("125 ARS");
  await fill("Precio del escenario", "100.125");
  await act(async () => byLabel<HTMLButtonElement>("Ampliar rango de precios").click());
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("100.125");
  await act(async () => byLabel<HTMLButtonElement>("Precio 0%").click());
  expect(price.value).toBe("100");
  await fill("Deslizar cambio de VI", "-2");
  expect(byLabel<HTMLInputElement>("Cambio de VI (pp)").value).toBe("-2");
  await act(async () => byLabel<HTMLButtonElement>("VI +5 pp").click());
  expect(volatility.value).toBe("5");
  await fill("Deslizar fecha teórica", "7");
  expect(byLabel<HTMLInputElement>("Fecha teórica").value).toBe(addDays(localDate(), 7));
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  expect(date.value).toBe("30");
});

it("validates a custom scenario price and never clamps its reported profit to the plotted range", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis(); await fill("Precio del escenario", "1000");
  expect(container.querySelector('.ct-sim-inspect output')!.textContent).toBe("89.500 ARS");
  expect(container.querySelector('.ct-sim-cursor')).toBeNull();
  expect(container.textContent).toContain("fuera del rango visible");
  await fill("Precio del escenario", "");
  expect(container.querySelector('.ct-sim-chart')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Precio 0%").click());
  expect(container.querySelector('.ct-sim-chart')).not.toBeNull();
});

it.each([
  ["ARS", "5.374 ARS", "4.457 ARS", "5.329 ARS"],
  ["USD", "5.373,75 USD", "4.456,64 USD", "5.329,18 USD"],
] as const)("formats large %s chart amounts without changing the scenario calculation", async (currency, price, result, equilibrium) => {
  const { catalog, data } = marketState.current;
  catalog!.underlyings[0].currency = currency;
  for (const contract of catalog!.contracts) {
    contract.currency = currency;
    contract.strikeCurrency = currency;
  }
  catalog!.contracts.find(contract => contract.id === "call-100")!.strike = 5000;
  data!.instruments.GGAL.last = 5000;
  data!.instruments["call-100"].ask!.price = 329.1836;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  await fill("Precio del escenario", "5373.75");
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("5373.75");
  expect(byLabel("Precio fijado").textContent).toBe(price);
  expect([...container.querySelectorAll('.ct-sim-inspect output')].map(output => output.textContent)).toEqual([result, result]);
  expect(container.querySelector('.ct-sim-equilibria')?.textContent).toContain(equilibrium);
});

it("accepts a reference price when the chain provides a leg quote but no underlying price", async () => {
  marketState.current.data!.instruments.GGAL.last = undefined;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  expect(container.querySelector(".ct-sim-chart")).toBeNull();
  await fill("Precio de referencia", "100");
  expect(container.querySelector(".ct-sim-chart")).not.toBeNull();
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("100");
  expect(container.querySelector('[aria-label="Factor monetario por contrato"]')).toBeNull();
});

it("disables a VI preset that would make a leg's volatility negative", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis(); await fill("VI pata 1", "2");
  expect(byLabel<HTMLButtonElement>("VI −5 pp").disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("VI 0 pp").getAttribute("aria-pressed")).toBe("true");
});

it("keeps small preset and chart prices as editable decimals rather than rejected exponent notation", async () => {
  marketState.current.data!.instruments.GGAL.last = .000001;
  marketState.current.catalog!.contracts.find(contract => contract.id === "call-100")!.strike = .000001;
  marketState.current.data!.instruments["call-100"].bid = undefined;
  marketState.current.data!.instruments["call-100"].ask!.price = .000001;
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  await act(async () => byLabel<HTMLButtonElement>("Precio −10%").click());
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("0.0000009");
  expect(container.querySelector('.ct-sim-chart')).not.toBeNull();
  await clickChartAt(.5);
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("0.0000014");
  expect(container.querySelector('.ct-sim-cursor')).not.toBeNull();
});

it("pins the clicked analysis price through pointer movement, replaces it on another click and has no price slider", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis(); await clickChartAt(.7);
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("110");
  expect(byLabel("Precio fijado").textContent).toBe("110 ARS");
  const chart = container.querySelector('.ct-sim-chart')!;
  const cursor = container.querySelector('.ct-sim-cursor')!.getAttribute('x1');
  const outputs = () => [...container.querySelectorAll('.ct-sim-inspect output')].map(node => node.textContent);
  const results = outputs();
  await act(async () => {
    const event = new MouseEvent('pointermove', { bubbles: true, clientX: 150 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    chart.dispatchEvent(event);
  });
  expect(container.querySelector('.ct-sim-cursor')!.getAttribute('x1')).toBe(cursor);
  expect(outputs()).toEqual(results);
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("110");
  expect(container.querySelector('.ct-sim-inspect input[type="range"]')).toBeNull();
  expect(container.querySelector('[aria-label="Precio a evaluar"]')).toBeNull();
  await clickChartAt(.3);
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("90");
  expect(byLabel("Precio fijado").textContent).toBe("90 ARS");
  await showBuild();
  expect(byLabel("Precio fijado").textContent).toBe("90 ARS");
  expect(container.querySelector('.ct-sim-inspect input')).toBeNull();
});

it("replaces the selectors with eight visual option families and previews variant changes before applying", async () => {
  await mount();
  expect(container.querySelector('[aria-label="Moneda y plazo de opciones"]')).toBeNull();
  expect(container.querySelector('[aria-label="Filtrar calls y puts"]')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Contratos pata 1", "3");
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 1").focus());
  await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  const picker = byLabel("Selector visual de estrategias");
  expect(picker.querySelectorAll('[data-family-name]')).toHaveLength(8);
  for (const label of ["Calendar", "Covered", "Futures"]) expect(picker.textContent).not.toContain(label);
  await act(async () => byLabel<HTMLButtonElement>("Alternar Call/Put de Vertical").click());
  await act(async () => byLabel<HTMLButtonElement>("Alternar variante de Vertical").click());
  expect(byLabel("Patas de la plantilla").textContent).toContain("Venta 1× PUT 100");
  expect(byLabel("Patas de la plantilla").textContent).toContain("Compra 1× PUT 90");
  expect(container.querySelectorAll('.ct-sim-legs-card tbody tr')).toHaveLength(1);
  expect(container.querySelector('.ct-sim-leg-strike')!.textContent).toBe("100");
  await act(async () => byLabel<HTMLButtonElement>("Armar Vertical · Short Put").click());
  expect(container.querySelector('[aria-label="Selector visual de estrategias"]')).toBeNull();
  expect(container.querySelectorAll('.ct-sim-legs-card tbody tr')).toHaveLength(2);
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 1").textContent).toBe("−1");
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 2").textContent).toBe("+1");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("4");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("5");
  expect(document.activeElement).toBe(byLabel("Elegir estrategia"));
});

it("uses quoted and last-traded template premiums and leaves unpriced legs editable", async () => {
  const quotes = marketState.current.data!.instruments;
  quotes["call-90"].last = 17;
  quotes["call-100"] = { ...quotes["call-100"], bid: undefined, last: 3.75 };
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => button("Butterfly").click());
  const preview = byLabel("Vista previa de la estrategia");
  expect(byLabel("Patas de la plantilla").textContent).toContain("Venta 2× CALL 100 · 3,75 (último operado)");
  expect(preview.querySelector(".ct-sim-payoff-preview")).not.toBeNull();

  quotes["call-110"].ask = undefined;
  await mount();
  expect(byLabel("Patas de la plantilla").textContent).toContain("Compra 1× CALL 110 · Precio pendiente");
  expect(preview.querySelector(".ct-sim-payoff-preview")).toBeNull();
  expect(preview.textContent).toContain("Completá los precios pendientes en Armado");
  const apply = byLabel<HTMLButtonElement>("Armar Butterfly · Long Call");
  expect(apply.disabled).toBe(false);
  await act(async () => apply.click());
  expect([1, 2, 3].map(index => byLabel(`Editar Precio pata ${index}`).textContent)).toEqual(["5", "3,75", "—"]);
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+1", "−2", "+1"]);
  expect(container.querySelector(".ct-sim-chart")).toBeNull();
  await fill("Precio pata 3", "2,5");
  expect(container.querySelector(".ct-sim-chart")).not.toBeNull();
});

it("disables crossed template quotes and closes the strategy picker with Escape", async () => {
  marketState.current.data!.instruments["call-100"] = { bid: { price: 6, size: 100 }, ask: { price: 5, size: 100 }, last: 4 };
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  expect(byLabel<HTMLButtonElement>("Armar Option · Long Call").disabled).toBe(true);
  expect(byLabel("Vista previa de la estrategia").textContent).toContain("cerrado o cruzado");
  await act(async () => byLabel("Selector visual de estrategias").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector('[aria-label="Selector visual de estrategias"]')).toBeNull();
  expect(container.querySelectorAll('.ct-sim-legs-card tbody tr')).toHaveLength(0);
});

it("shows native and leg IV with exactly two decimals while preserving precision for editing", async () => {
  marketState.current.data!.instruments["call-100"].impliedVolatility = 40.12987;
  await mount();
  expect(byLabel("VI CALL 100").textContent).toBe("40,13 %");
  expect(byLabel("VI PUT 100").textContent).toBe("40,00 %");
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  expect(byLabel("Editar VI pata 1").textContent).toBe("40,13");
  await act(async () => byLabel<HTMLButtonElement>("Editar VI pata 1").click());
  expect(byLabel<HTMLInputElement>("VI pata 1").value).toBe("40.12987");
});

it("draws four standard-deviation references in both charts and updates them with VI and date", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  const labels = () => Array.from(container.querySelectorAll('.ct-sim-sigma')).map(node => node.getAttribute('aria-label'));
  expect(labels()).toHaveLength(4);
  expect(labels()[0]).toMatch(/^-2σ/); expect(labels()[3]).toMatch(/^\+2σ/);
  const initial = labels(); await showAnalysis(); expect(labels()).toEqual(initial);
  const bandAt = (change: string) => Array.from(container.querySelectorAll<HTMLTableRowElement>(".ct-sim-scenario-results tbody tr"))
    .find(row => row.cells[0].textContent === change)?.dataset.band;
  expect(["-24%", "-12%", "0%", "+10%", "+12%", "+24%"].map(bandAt))
    .toEqual(["outside-sigma", "sigma-two", "spot", "sigma-one", "sigma-two", "outside-sigma"]);
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("VI ref. 40,00 % · 30 días");
  await act(async () => byLabel<HTMLButtonElement>("VI +5 pp").click());
  expect(labels()).not.toEqual(initial);
  expect(["-24%", "-12%", "+12%", "+24%"].map(bandAt)).toEqual(["sigma-two", "sigma-one", "sigma-one", "sigma-two"]);
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("VI ref. 45,00 %");
  for (let step = 0; step < 3; step++) await act(async () => byLabel<HTMLButtonElement>("Acercar rango de precios").click());
  expect(labels()).toHaveLength(0);
  expect(bandAt("+24%")).toBe("sigma-two");
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("fuera del rango visible");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  expect(labels()).toHaveLength(0);
  expect(bandAt("+12%")).toBeUndefined();
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("Los niveles coinciden");
  await fill("VI pata 1", "");
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("Desvíos no disponibles");
  expect(container.querySelector('.ct-sim-expiry-line')).not.toBeNull();
});

it("colors both sides of the exact deviation boundaries symmetrically at a decimal spot", async () => {
  const annualExpiry = addDays(localDate(), 365).replaceAll("-", "");
  for (const contract of marketState.current.catalog!.contracts) contract.expiration = annualExpiry;
  marketState.current.data!.instruments.GGAL.last = 1800.32;
  marketState.current.data!.instruments["call-100"].impliedVolatility = 10;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>(".ct-sim-scenario-results tbody tr"));
  const bandAt = (change: string) => rows.find(row => row.cells[0].textContent === change)?.dataset.band;
  expect(["-20%", "-10%", "+10%", "+20%"].map(bandAt)).toEqual(["sigma-two", "sigma-one", "sigma-one", "sigma-two"]);
});

it("positions chain deviation lines on row boundaries without crossing quotes, adding rows or mixing contexts", async () => {
  const priceScale = 100;
  for (const contract of marketState.current.catalog!.contracts) contract.strike *= priceScale;
  marketState.current.data!.instruments.GGAL.last = 100 * priceScale;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const strike = this.dataset.optionStrike;
    return strike === undefined ? new DOMRect(0, 0, 750, 212) : new DOMRect(0, 52 + (Number(strike) / priceScale - 80) / 10 * 32, 750, 32);
  });
  await mount();
  const markers = () => [...container.querySelectorAll<HTMLElement>('.ct-opt-sigma-line')];
  const rowCount = container.querySelectorAll('.ct-opt-chain tbody tr').length;
  expect(markers()).toHaveLength(0);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  // ±2σ are outside this chain's 80..120 strikes: never pin them to its edges.
  expect(markers()).toHaveLength(2);
  const lower = markers().find(node => node.getAttribute('aria-label')?.startsWith('-1σ'))!;
  expect(parseFloat(lower.style.top)).toBe(84); // Boundary between the 80 and 90 rows.
  expect(lower.querySelectorAll('span')).toHaveLength(1);
  expect(lower.querySelector('.ct-opt-sigma-center')?.textContent).toMatch(/^-1σ/);
  expect(container.querySelectorAll('.ct-opt-chain tbody tr')).toHaveLength(rowCount);
  await showAnalysis(); await fill("VI pata 1", "10"); await showBuild();
  expect(markers()).toHaveLength(4);
  // Levels in the same strike interval share its boundary; none crosses a row's center.
  expect(markers().map(node => parseFloat(node.style.top))).toEqual([116, 116, 148, 148]);
  const chartLabels = [...container.querySelectorAll('.ct-sim-sigma')].map(node => node.getAttribute('aria-label'));
  expect(markers().map(node => node.getAttribute('aria-label')?.replace(' en cadena', ''))).toEqual(chartLabels);
  expect(chartLabels.every(label => /σ: [\d.]+ ARS$/.test(label ?? ""))).toBe(true);
  expect(markers().flatMap(node => [...node.querySelectorAll('.ct-opt-sigma-center span')]).every(node => !node.textContent?.includes(','))).toBe(true);
  await fill("Fecha teórica", addDays(expiry, 1));
  expect(markers()).toHaveLength(0);
  await fill("Fecha teórica", localDate());
  expect(markers()).toHaveLength(4);
  await showAnalysis();
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  await showBuild(); expect(markers()).toHaveLength(0);
});

it("adjusts all quantities proportionally and shifts the whole strategy to native neighboring strikes", async () => {
  marketState.current.data!.instruments["call-110"] = { bid: { price: 8, size: 100 }, ask: { price: 9, size: 100 }, impliedVolatility: 50 };
  marketState.current.data!.instruments["call-120"] = { bid: { price: 1, size: 100 }, ask: { price: 2, size: 100 }, impliedVolatility: 60 };
  await mount();
  const upQuantity = () => byLabel<HTMLButtonElement>("Subir cantidades de toda la estrategia");
  const downQuantity = () => byLabel<HTMLButtonElement>("Bajar cantidades de toda la estrategia");
  const upStrike = () => byLabel<HTMLButtonElement>("Subir strikes de toda la estrategia");
  expect(upQuantity().disabled).toBe(true); expect(upStrike().disabled).toBe(true);
  await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Armar Butterfly · Long Call").click());
  expect(downQuantity().disabled).toBe(true);
  await act(async () => { upQuantity().click(); upQuantity().click(); });
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+3", "−6", "+3"]);
  await act(async () => downQuantity().click());
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+2", "−4", "+2"]);
  await act(async () => upStrike().click());
  expect([...container.querySelectorAll('.ct-sim-leg-strike')].map(node => node.textContent)).toEqual(["100", "110", "120"]);
  expect([1, 2, 3].map(index => byLabel(`Editar Prima pata ${index}`).textContent)).toEqual(["5", "8", "2"]);
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+2", "−4", "+2"]);
  expect(upStrike().disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("Comprar CALL 120 en simulación").getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.ct-sim-quick-results .ct-sim-chart')).not.toBeNull();
  await showAnalysis();
  expect([1, 2, 3].map(index => byLabel(`Editar VI pata ${index}`).textContent)).toEqual(["40,00", "50,00", "60,00"]);
});

it("disables a whole-strategy strike move when any destination quote is missing or the feed disconnects", async () => {
  marketState.current.data!.instruments["call-120"].ask = undefined;
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Armar Butterfly · Long Call").click());
  expect(byLabel<HTMLButtonElement>("Subir strikes de toda la estrategia").disabled).toBe(true);
  expect(byLabel("Subir strikes de toda la estrategia").title).toContain("sin ASK");
  expect([...container.querySelectorAll('.ct-sim-leg-strike')].map(node => node.textContent)).toEqual(["90", "100", "110"]);
  marketState.current = { catalog: marketState.current.catalog, issue: "Sin conexión" };
  await act(async () => root.render(<OptionsSimulator />));
  expect(byLabel<HTMLButtonElement>("Bajar strikes de toda la estrategia").disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("Subir cantidades de toda la estrategia").disabled).toBe(false);
});

it("shows days after the expiry selector and compact signed C/P legs without instrument names or IV", async () => {
  await mount();
  const expiryControl = byLabel<HTMLSelectElement>("Vencimiento de opciones");
  expect(expiryControl.nextElementSibling).toBe(byLabel("Días al vencimiento de la cadena"));
  expect(byLabel("Días al vencimiento de la cadena").textContent).toBe("30d");
  expect(expiryControl.selectedOptions[0].textContent).toBe(formatOptionExpiry(expiry, "short"));
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  const panel = container.querySelector('.ct-sim-legs-card')!;
  expect([...panel.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(["Tipo", "Cant.", "Venc.", "Días", "Strike", "Precio", "Acciones"]);
  expect([1, 2].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+1", "−1"]);
  expect([...panel.querySelectorAll('.ct-sim-kind-chip')].map(node => node.textContent)).toEqual(["C", "P"]);
  expect(panel.querySelector('[role="switch"]')).toBeNull();
  expect([...panel.querySelectorAll('.ct-sim-leg-strike')].map(node => node.textContent)).toEqual(["100", "90"]);
  expect([...panel.querySelectorAll('.ct-sim-leg-expiry')].map(node => node.textContent)).toEqual(["30d", "30d"]);
  expect(panel.textContent).not.toContain("CALL 100"); expect(panel.textContent).not.toContain("PUT 90");
  expect(panel.querySelector('[aria-label="Editar VI pata 1"]')).toBeNull();
  expect(byLabel("Editar Contratos pata 1").getAttribute('aria-description')).toContain("Compra");
  expect(panel.querySelector('[aria-label^="Editar Sentido"]')).toBeNull();
  expect([...panel.querySelectorAll('.ct-sim-leg-expiry-date')].every(node => /^[A-Z][a-z]{2} \d{1,2}$/.test(node.textContent!))).toBe(true);
  expect(panel.querySelector('[aria-label="Editar Prima pata 1"]')).toBeNull();
  await showAnalysis();
  expect(byLabel("Editar VI pata 1").textContent).toBe("40,00");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento").click());
  await showBuild();
  expect(container.querySelector('.ct-sim-leg-expiry')!.textContent).toBe("30d");
  await act(async () => button("+ Pata manual").click());
  const kind = byLabel<HTMLButtonElement>("Put en pata 3");
  expect(kind.getAttribute("aria-checked")).toBe("false");
  await act(async () => kind.click());
  expect(kind.getAttribute("aria-checked")).toBe("true");
  expect(panel.querySelector("select")).toBeNull();
  await act(async () => kind.click());
  expect(kind.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('.ct-sim-scenario [aria-label="Vencimiento"]')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Limpiar patas").click());
  await act(async () => button("+ Pata manual").click());
  await fill("Vencimiento", "2030-12-18");
  expect(container.querySelector('.ct-sim-leg-expiry-date')!.textContent).toBe("Dic 18");
  await fill("Vencimiento", "");
  expect(container.querySelector('.ct-sim-leg-expiry')!.textContent).toBe("—");
});

it("fits distant expiry equilibria and shares the horizontal zoom without changing the evaluated price", async () => {
  marketState.current.data!.instruments["call-100"].ask!.price = 80;
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  const curvePath = () => container.querySelector(".ct-sim-expiry-line")!.getAttribute("d");
  const fitted = curvePath();
  await showAnalysis();
  expect(container.textContent).not.toContain("Hay strikes o equilibrios fuera del rango visible");
  expect(container.querySelector(".ct-sim-equilibria")?.textContent).toContain("180 ARS");
  await fill("Precio del escenario", "230");
  expect(container.querySelector(".ct-sim-cursor")).toBeNull();
  const pnl = container.querySelector(".ct-sim-inspect output")!.textContent;
  await act(async () => byLabel<HTMLButtonElement>("Ampliar rango de precios").click());
  expect(container.querySelector(".ct-sim-cursor")).not.toBeNull();
  expect(container.querySelector(".ct-sim-inspect output")!.textContent).toBe(pnl);
  await showBuild();
  expect(curvePath()).not.toBe(fitted);
  await act(async () => button("Ajustar").click());
  expect(curvePath()).toBe(fitted);
  expect(container.querySelector(".ct-sim-inspect output")!.textContent).toBe(pnl);
  await act(async () => byLabel<HTMLButtonElement>("Acercar rango de precios").click());
  await act(async () => byLabel<HTMLButtonElement>("Limpiar patas").click());
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(button("Ajustar").disabled).toBe(true);
});

it("edits quantity signs as buy/sell, preserves partial drafts and restores both quantity and side on Escape", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Contratos pata 1", "-3");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−3");
  expect(byLabel("Vender CALL 100 en simulación").getAttribute('aria-pressed')).toBe('true');
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Crédito 1.500 ARS");
  await fill("Contratos pata 1", "+2");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−3");
  expect(byLabel("Vender CALL 100 en simulación").getAttribute('aria-pressed')).toBe('true');
  await fill("Contratos pata 1", "");
  expect(byLabel<HTMLInputElement>("Contratos pata 1").value).toBe("");
  await fill("Contratos pata 1", "-");
  expect(byLabel<HTMLInputElement>("Contratos pata 1").value).toBe("-");
  expect(container.querySelector('.ct-sim-chart')).toBeNull();
  await fill("Contratos pata 1", "2");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+2");
  expect(byLabel("Comprar CALL 100 en simulación").getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('.ct-sim-leg-expiry-date')!.textContent).toBe(formatOptionExpiry(expiry, "short"));
});

it("replaces per-leg prices with a total-price slider showing Natural, Mid and Opposite debit/credit", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender CALL 110 en simulación").click());
  const panel = container.querySelector('.ct-sim-legs-card')!;
  expect(panel.querySelector('[aria-label^="Editar Prima"]')).toBeNull();
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Débito 100 ARS");
  expect(byLabel("Tomar precio Mid de la estrategia").textContent).toContain("0 neutro");
  expect(byLabel("Tomar precio Opuesto de la estrategia").textContent).toContain("100 cr");
  await act(async () => byLabel<HTMLButtonElement>("Tomar precio Mid de la estrategia").click());
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Neutra 0 ARS");
  expect(byLabel<HTMLInputElement>("Precio de entrada de la estrategia").value).toBe("50");
  await fill("Precio de entrada de la estrategia", "25");
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Débito 50 ARS");
  await act(async () => byLabel<HTMLButtonElement>("Tomar precio Opuesto de la estrategia").click());
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Crédito 100 ARS");
  expect(byLabel("Editar Prima pata 1").textContent).toBe("4");
  expect(byLabel("Editar Prima pata 2").textContent).toBe("5");
  expect(byLabel("Editar VI pata 1").textContent).toBe("40,00");
  marketState.current.data = { ...marketState.current.data!, instruments: { ...marketState.current.data!.instruments,
    "call-100": { bid: { price: 10, size: 100 }, ask: { price: 11, size: 100 } } } };
  await act(async () => root.render(<OptionsSimulator />));
  expect(byLabel("Crédito o débito de la estrategia").textContent).toBe("Crédito 100 ARS");
  expect(panel.textContent).toContain("fuera de las referencias actuales");
});

it("remembers the selected underlying and expiry across opens, with a fallback for missing expiries", async () => {
  const key = `OptionsSimulatorMarketSelectionV1:${location.origin}`;
  const catalog = marketState.current.catalog!;
  const early = addDays(localDate(), 45).replaceAll("-", "");
  const late = addDays(localDate(), 60).replaceAll("-", "");
  catalog.underlyings.push({ id: "PAMP", symbol: "PAMP", currency: "ARS" });
  const sample = catalog.contracts[0];
  for (const date of [early, late]) catalog.contracts.push({ ...sample, id: `PAMP-${date}`, underlyingId: "PAMP", expiration: date });
  await mount();
  async function choose(label: string, value: string) {
    const select = byLabel<HTMLSelectElement>(label);
    await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  }
  await choose("Subyacente de opciones", "PAMP");
  await choose("Vencimiento de opciones", late);
  expect(stored[key]).toEqual({ underlyingId: "PAMP", expiration: late });
  await act(async () => root.render(null));
  await mount();
  expect(byLabel<HTMLSelectElement>("Subyacente de opciones").value).toBe("PAMP");
  expect(byLabel<HTMLSelectElement>("Vencimiento de opciones").value).toBe(late);
  await act(async () => root.render(null));
  catalog.contracts = catalog.contracts.filter(contract => contract.id !== `PAMP-${late}`);
  await mount();
  expect(byLabel<HTMLSelectElement>("Vencimiento de opciones").value).toBe(early);
  expect(stored[key]).toEqual({ underlyingId: "PAMP", expiration: late });
});

it("removes the library and entry menus without reading or overwriting saved strategies, and adds metrics only to the chain", async () => {
  stored.OptionsSimulatorStrategiesV1 = [{ name: "Conservar", simulation: { original: true } }];
  await mount();
  expect(container.querySelector('.ct-sim-library-menu')).toBeNull();
  expect(container.querySelector('.ct-sim-setup-menu')).toBeNull();
  expect(container.querySelector('[aria-label="Cargar ejemplo"]')).toBeNull();
  expect(chrome.storage.local.get).toHaveBeenCalledWith(`OptionsSimulatorMarketSelectionV1:${location.origin}`);
  expect(chrome.storage.local.get).not.toHaveBeenCalledWith("OptionsSimulatorStrategiesV1");
  expect(write).not.toHaveBeenCalled();
  expect(stored.OptionsSimulatorStrategiesV1).toEqual([{ name: "Conservar", simulation: { original: true } }]);
  expect(byLabel("Theta teórico CALL 100").textContent).not.toBe("—");
  expect(byLabel("Extrínseco CALL 100").textContent).toBe("4,5");
  expect(byLabel("Extrínseco PUT 100").textContent).toBe("4,5");
  expect(container.querySelector('.ct-opt-chain thead th')?.getAttribute('colspan')).toBe('8');
  const headers = [...container.querySelectorAll('.ct-sim-legs-card thead th')].map(node => node.textContent);
  expect(headers).not.toContain('Theta'); expect(headers).not.toContain('Extrínseco');
});

it("shows exact bounded maximum loss in the build and infinity for an uncovered short call", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(byLabel("Pérdida máxima del armado al vencimiento").textContent).toContain("500 ARS");
  expect(byLabel("Ganancia máxima del armado al vencimiento").textContent).toBe("Ganancia máx.∞");
  await fill("Contratos pata 1", "-1");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(byLabel("Pérdida máxima del armado al vencimiento").textContent).toBe("Pérdida máx.∞");
  expect(byLabel("Ganancia máxima del armado al vencimiento").textContent).toContain("500 ARS");
  await showAnalysis();
  expect(container.querySelector('.ct-sim-metrics .ct-sim-loss')!.textContent).toBe('∞');
});

it("steps each leg independently without flipping its side or crossing zero, including rapid clicks and editing", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(byLabel<HTMLButtonElement>("Reducir contratos pata 2").disabled).toBe(true);
  await act(async () => { byLabel<HTMLButtonElement>("Aumentar contratos pata 2").click(); byLabel<HTMLButtonElement>("Aumentar contratos pata 2").click(); });
  expect(byLabel("Editar Contratos pata 2").textContent).toBe("−3");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+1");
  expect(byLabel("Vender PUT 90 en simulación").getAttribute('aria-pressed')).toBe('true');
  await act(async () => byLabel<HTMLButtonElement>("Reducir contratos pata 2").click());
  expect(byLabel("Editar Contratos pata 2").textContent).toBe("−2");
  await fill("Contratos pata 1", "4");
  await act(async () => byLabel<HTMLButtonElement>("Aumentar contratos pata 1").click());
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("+5");
  expect(container.querySelector('[aria-label="Contratos pata 1"]')).toBeNull();
  await fill("Contratos pata 1", "10000000000");
  expect(byLabel<HTMLButtonElement>("Aumentar contratos pata 1").disabled).toBe(true);
  await fill("Contratos pata 1", "");
  expect(byLabel<HTMLButtonElement>("Aumentar contratos pata 1").disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("Reducir contratos pata 1").disabled).toBe(true);
});

async function doubleQuantityClick(label: string) {
  for (const detail of [1, 2]) await act(async () => byLabel(label).dispatchEvent(new MouseEvent("click", { bubbles: true, detail })));
  await act(async () => byLabel(label).dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 })));
}

it("adjusts a leg by ten per double click, preserving buy/sell and stopping at one", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  await doubleQuantityClick("Aumentar contratos pata 1");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−11");
  await doubleQuantityClick("Reducir contratos pata 1");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−1");
  await act(async () => byLabel<HTMLButtonElement>("Aumentar contratos pata 1").click());
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−2");
  await doubleQuantityClick("Reducir contratos pata 1");
  expect(byLabel("Editar Contratos pata 1").textContent).toBe("−1");
  expect(byLabel<HTMLButtonElement>("Reducir contratos pata 1").disabled).toBe(true);
});

it("double clicks adjust ten whole-strategy units without counting extra clicks or changing ratios", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Armar Butterfly · Long Call").click());
  await doubleQuantityClick("Subir cantidades de toda la estrategia");
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+11", "−22", "+11"]);
  await doubleQuantityClick("Bajar cantidades de toda la estrategia");
  expect([1, 2, 3].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+1", "−2", "+1"]);
});

it("colors both curves and the expiry fill on the zero axis and each marker by its own profit/loss", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  function verifyGradient() {
    const chart = container.querySelector('.ct-sim-chart')!;
    const gradient = chart.querySelector('linearGradient[id$="-pnl"]')!;
    expect(gradient.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
    const stops = [...gradient.querySelectorAll('stop')];
    expect(stops.map(node => node.getAttribute('stop-color'))).toEqual(['var(--sim-profit)', 'var(--sim-profit)', 'var(--sim-loss)', 'var(--sim-loss)']);
    const zero = Number(chart.querySelector('.ct-sim-zero')!.getAttribute('y1'));
    const top = Number(gradient.getAttribute('y1')), bottom = Number(gradient.getAttribute('y2'));
    expect(Number(stops[1].getAttribute('offset'))).toBeCloseTo((zero - top) / (bottom - top));
    expect(stops[1].getAttribute('offset')).toBe(stops[2].getAttribute('offset'));
    for (const path of chart.querySelectorAll('.ct-sim-expiry-line, .ct-sim-theory-line')) expect(path.getAttribute('stroke')).toBe(`url(#${gradient.id})`);
    const fill = chart.querySelector('linearGradient:not([id$="-pnl"])')!;
    expect(fill.querySelectorAll('stop')[1].getAttribute('offset')).toBe(stops[1].getAttribute('offset'));
  }
  verifyGradient();
  await clickChartAt(.58); // 104: expiry is losing while the theoretical value is profitable.
  expect(container.querySelector('.ct-sim-expiry-dot')!.getAttribute('fill')).toBe('var(--sim-loss)');
  expect(container.querySelector('.ct-sim-theory-dot')!.getAttribute('fill')).toBe('var(--sim-profit)');
  await showAnalysis(); verifyGradient();
  await clickChartAt(.8);
  expect(container.querySelector('.ct-sim-expiry-dot')!.getAttribute('fill')).toBe('var(--sim-profit)');
});

it("shows both profit and loss around zero in the priced Iron Condor selector preview", async () => {
  for (const contract of marketState.current.catalog!.contracts) contract.factor = 1000;
  for (const [id, bid, ask] of [["put-80", 3.9, 4.1], ["put-90", 5.90018, 6.1], ["call-110", 5.9, 6.1], ["call-120", 3.9, 4.1]] as const)
    marketState.current.data!.instruments[id] = { ...marketState.current.data!.instruments[id], bid: { price: bid, size: 100 }, ask: { price: ask, size: 100 } };
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => container.querySelector<HTMLButtonElement>('[data-family-name="iron-condor"]')!.click());
  const preview = byLabel("Vista previa de la estrategia");
  expect(preview.textContent).toContain("Crédito por estructura: 3.600 ARS");
  const svg = preview.querySelector('svg')!;
  const axis = Number(svg.querySelector('line')!.getAttribute('y1'));
  const ordinates = [...svg.querySelector('path')!.getAttribute('d')!.matchAll(/[ML][\d.]+,([\d.-]+)/g)].map(match => Number(match[1]));
  expect(Math.min(...ordinates), 'Credit Condor must show a profitable central plateau above zero').toBeLessThan(axis);
  expect(Math.max(...ordinates), 'Condor wings must show loss below zero').toBeGreaterThan(axis);
  expect(preview.textContent).toContain("Ganancia máx. 3.600 ARS");
  expect(preview.textContent).toContain("Pérdida máx. 6.400 ARS");
  const gradient = svg.querySelector('linearGradient')!, stops = [...gradient.querySelectorAll('stop')];
  expect(gradient.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
  expect(stops.map(stop => stop.getAttribute('stop-color'))).toEqual(['var(--sim-profit)', 'var(--sim-profit)', 'var(--sim-loss)', 'var(--sim-loss)']);
  const top = Number(gradient.getAttribute('y1')), bottom = Number(gradient.getAttribute('y2'));
  expect(Number(stops[1].getAttribute('offset'))).toBeCloseTo((axis - top) / (bottom - top));
  expect(stops[1].getAttribute('offset')).toBe(stops[2].getAttribute('offset'));
  expect(svg.querySelector<SVGPathElement>('path')!.style.stroke.replaceAll('"', '')).toBe(`url(#${gradient.id})`);
});

it("confirms the same credit Iron Condor has a 360 profit plateau and 640 maximum loss in the result graph", async () => {
  for (const [id, bid, ask] of [["put-80", 3.9, 4.1], ["put-90", 5.9, 6.1], ["call-110", 5.9, 6.1], ["call-120", 3.9, 4.1]] as const)
    marketState.current.data!.instruments[id] = { ...marketState.current.data!.instruments[id], bid: { price: bid, size: 100 }, ask: { price: ask, size: 100 } };
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => byLabel<HTMLButtonElement>("Armar Iron Condor · Normal").click());
  expect(container.querySelector('.ct-sim-inspect output')!.textContent).toBe("360 ARS");
  expect(byLabel("Pérdida máxima del armado al vencimiento").textContent).toContain("640 ARS");
  expect(byLabel("Ganancia máxima del armado al vencimiento").textContent).toContain("360 ARS");
  const svg = container.querySelector('.ct-sim-chart')!, axis = Number(svg.querySelector('.ct-sim-zero')!.getAttribute('y1'));
  const ordinates = [...svg.querySelector('.ct-sim-expiry-line')!.getAttribute('d')!.matchAll(/[ML][\d.]+,([\d.-]+)/g)].map(match => Number(match[1]));
  expect(Math.min(...ordinates)).toBeLessThan(axis); expect(Math.max(...ordinates)).toBeGreaterThan(axis);
});
