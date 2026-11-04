// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OptionsSimulator from "./OptionsSimulator";
import { Catalog, Quote, Snapshot } from "./market";
import { addDays, localDate } from "./model";

const marketState = vi.hoisted(() => ({ current: {} as { catalog?: Catalog; data?: Snapshot; issue?: string } }));
vi.mock("./market", () => ({ useOptionMarket: () => marketState.current }));
let root: Root, container: HTMLDivElement;
let stored: Record<string, unknown>, write: ReturnType<typeof vi.fn>;
const expiry = addDays(localDate(), 30);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stored = {};
  write = vi.fn(async value => { Object.assign(stored, value); });
  vi.stubGlobal("chrome", { storage: { local: { get: vi.fn(async () => stored), set: write } } });
  const contracts: Catalog["contracts"] = [80, 90, 100, 110, 120].flatMap(strike => (["call", "put"] as const).map(kind => ({
    id: `${kind}-${strike}`, symbol: `${kind.toUpperCase()} ${strike}`, underlyingId: "GGAL", kind, strike,
    expiration: expiry.replaceAll("-", ""), currency: "ARS", strikeCurrency: "ARS", settlement: "2", factor: 100,
  })));
  const quote: Quote = { bid: { price: 4, size: 100 }, ask: { price: 5, size: 200 }, impliedVolatility: 40,
    delta: .5, nominalVolume: 1000, changePercent: 0, lastTradeAt: Date.now(), seq: 1 };
  marketState.current = {
    catalog: { contracts, underlyings: [{ id: "GGAL", symbol: "GGAL", currency: "ARS" }], contextRevision: 1, catalogRevision: 1, version: "4.24.4", excluded: 0 },
    data: { contextRevision: 1, catalogRevision: 1, underlyingId: "GGAL", capturedAt: Date.now(), instruments: {
      GGAL: { ...quote, last: 100 }, ...Object.fromEntries(contracts.map(contract => [contract.id, { ...quote }])),
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
  const groupHeaders = container.querySelectorAll('.ct-opt-chain thead tr:first-child th');
  expect(Array.from(groupHeaders).map(node => node.textContent)).toEqual(["CALLS", "Ejercicio", "PUTS"]);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("5");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("4");
  await showAnalysis();
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40,00");
  expect(container.querySelectorAll(".ct-sim-chart path")).toHaveLength(3);
  expect(container.textContent).toContain("GGAL"); expect(write).not.toHaveBeenCalled();
});
it("keeps expiry available when a native VI is missing and blocks missing quotes", async () => {
  marketState.current.data!.instruments["call-100"].impliedVolatility = undefined;
  marketState.current.data!.instruments["put-100"].ask = undefined;
  await mount();
  expect(byLabel<HTMLButtonElement>("Comprar PUT 100 en simulación").disabled).toBe(true);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis();
  expect(container.textContent).toContain("Teórico no disponible");
  expect(container.querySelector(".ct-sim-expiry-line")).not.toBeNull();
  expect(container.querySelector(".ct-sim-theory-line")).toBeNull();
  await fill("VI pata 1", "45");
  expect(container.querySelector(".ct-sim-theory-line")).not.toBeNull();
});
it("selecting a marked quote removes the leg; no execution controls are present", async () => {
  await mount();
  const buy = byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación");
  await act(async () => buy.click()); expect(buy.getAttribute("aria-pressed")).toBe("true");
  await act(async () => buy.click()); expect(container.querySelectorAll(".ct-sim-legs-card tbody tr")).toHaveLength(0);
  for (const label of ["Enviar", "Cancelar orden", "Ejecutar", "Maker", "Cruce", "Preparar operación"]) expect(container.textContent).not.toContain(label);
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
  await showAnalysis();
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



it("removes market references during a disconnect and keeps the VI controls folded initially", async () => {
  await mount();
  expect(byLabel("Configurar filtro de VI").closest("details")!.open).toBe(false);
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
  await act(async () => byLabel<HTMLButtonElement>("Precio Sube (+10 %)").click());
  await act(async () => byLabel<HTMLButtonElement>("VI Sube (+5 pp)").click());
  await showBuild();
  expect(panels[0].hidden).toBe(false); expect(panels[1].hidden).toBe(true);
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("7,5");
  expect(byLabel<HTMLSelectElement>("Subyacente de opciones").value).toBe("GGAL");
  await showAnalysis();
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("110");
  expect(byLabel<HTMLInputElement>("Cambio de VI (puntos porcentuales)").value).toBe("5");
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
  expect(container.querySelector('.ct-sim-results .ct-sim-chart')).not.toBeNull();
  expect(outputs()).toEqual(buildResults);
  await act(async () => byLabel<HTMLButtonElement>("VI Sube (+5 pp)").click());
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento (30 días)").click());
  await act(async () => byLabel<HTMLButtonElement>("Precio Sube (+10 %)").click());
  const scenarioResults = outputs();
  await showBuild();
  expect(outputs()).toEqual(scenarioResults);
  expect(byLabel("Resultado rápido del armado").textContent).toContain("VI 5,00 pp");
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
  await act(async () => byLabel<HTMLButtonElement>("VI Sube (+5 pp)").click());
  expect(outputs()[0]).toBe(initial[0]); expect(outputs()[1]).not.toBe(initial[1]);
  await act(async () => byLabel<HTMLButtonElement>("Precio Sube (+10 %)").click());
  expect(outputs()[0]).toBe("500 ARS");
  expect(byLabel<HTMLInputElement>("Precio de referencia").value).toBe("100");
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40,00");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento (30 días)").click());
  expect(outputs()[0]).toBe(outputs()[1]);
  await act(async () => byLabel<HTMLButtonElement>("Fecha Mitad (15 días)").click());
  expect(byLabel<HTMLInputElement>("Fecha teórica").value).toBe(addDays(localDate(), 15));
});

it("consolidates useful market information into one legend without repeated book/time/volume-scale noise", async () => {
  await mount();
  const legends = container.querySelectorAll('.ct-sim-chain-legend');
  expect(legends).toHaveLength(1);
  expect(legends[0].textContent).toContain("GGAL 100 ARS");
  expect(legends[0].textContent).toContain("Calls 40,00 %"); expect(legends[0].textContent).toContain("Puts 40,00 %");
  for (const text of ["Barra 100", "VN", "BID", "ASK", "Lectura", "Excluidos", "recientes"]) expect(legends[0].textContent).not.toContain(text);
  expect(container.querySelector('.ct-opt-chain-footer')).toBeNull();
});

it("validates a custom scenario price and never clamps its reported profit to the plotted range", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis(); await fill("Precio del escenario", "1000");
  expect(container.querySelector('.ct-sim-inspect output')!.textContent).toBe("89.500 ARS");
  expect(container.querySelector('.ct-sim-cursor')).toBeNull();
  expect(container.textContent).toContain("fuera del rango visible");
  await fill("Precio del escenario", "");
  expect(container.querySelector('.ct-sim-chart')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Precio Mantiene (0 %)").click());
  expect(container.querySelector('.ct-sim-chart')).not.toBeNull();
});

it("disables a VI preset that would make a leg's volatility negative", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await showAnalysis(); await fill("VI pata 1", "2");
  expect(byLabel<HTMLButtonElement>("VI Baja (−5 pp)").disabled).toBe(true);
  expect(byLabel<HTMLButtonElement>("VI Mantiene (0 pp)").getAttribute("aria-pressed")).toBe("true");
});

it("keeps small preset and chart prices as editable decimals rather than rejected exponent notation", async () => {
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Precio de referencia", "0,000001"); await showAnalysis();
  await act(async () => byLabel<HTMLButtonElement>("Precio Baja (−10 %)").click());
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("0.0000009");
  expect(container.querySelector('.ct-sim-chart')).not.toBeNull();
  await fill("Precio mínimo", "0"); await fill("Precio máximo", "0.000002");
  await clickChartAt(.475);
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("0.00000095");
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
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Vertical · Short Put").click());
  expect(container.querySelector('[aria-label="Selector visual de estrategias"]')).toBeNull();
  expect(container.querySelectorAll('.ct-sim-legs-card tbody tr')).toHaveLength(2);
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 1").textContent).toBe("−1");
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 2").textContent).toBe("+1");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("4");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("5");
  expect(document.activeElement).toBe(byLabel("Elegir estrategia"));
});

it("disables unavailable template quotes and closes the strategy picker with Escape", async () => {
  marketState.current.data!.instruments["call-100"].ask = undefined;
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  expect(byLabel<HTMLButtonElement>("Aplicar Option · Long Call").disabled).toBe(true);
  expect(byLabel("Vista previa de la estrategia").textContent).toContain("sin ASK");
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
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("VI ref. 40,00 % · 30 días");
  const initial = labels(); await showAnalysis(); expect(labels()).toEqual(initial);
  await act(async () => byLabel<HTMLButtonElement>("VI Sube (+5 pp)").click());
  expect(labels()).not.toEqual(initial);
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("VI ref. 45,00 %");
  await fill("Precio mínimo", "95"); await fill("Precio máximo", "105");
  expect(labels()).toHaveLength(0);
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("fuera del rango visible");
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento (30 días)").click());
  expect(labels()).toHaveLength(0);
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("Los niveles coinciden");
  await fill("VI pata 1", "");
  expect(byLabel("Referencias de desvío estándar").textContent).toContain("Desvíos no disponibles");
  expect(container.querySelector('.ct-sim-expiry-line')).not.toBeNull();
});

it("positions chain deviation lines on row boundaries without crossing quotes, adding rows or mixing contexts", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const strike = this.dataset.optionStrike;
    return strike === undefined ? new DOMRect(0, 0, 750, 212) : new DOMRect(0, 52 + (Number(strike) - 80) / 10 * 32, 750, 32);
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
  expect(container.querySelectorAll('.ct-opt-chain tbody tr')).toHaveLength(rowCount);
  await showAnalysis(); await fill("VI pata 1", "10"); await showBuild();
  expect(markers()).toHaveLength(4);
  // Levels in the same strike interval share its boundary; none crosses a row's center.
  expect(markers().map(node => parseFloat(node.style.top))).toEqual([116, 116, 148, 148]);
  const chartLabels = [...container.querySelectorAll('.ct-sim-sigma')].map(node => node.getAttribute('aria-label'));
  expect(markers().map(node => node.getAttribute('aria-label')?.replace(' en cadena', ''))).toEqual(chartLabels);
  await fill("Vencimiento", addDays(expiry, 1));
  expect(markers()).toHaveLength(0);
  await fill("Vencimiento", expiry);
  expect(markers()).toHaveLength(4);
  await showAnalysis();
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento (30 días)").click());
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
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Butterfly · Long Call").click());
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
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Butterfly · Long Call").click());
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
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  const panel = container.querySelector('.ct-sim-legs-card')!;
  expect([...panel.querySelectorAll('thead th')].map(node => node.textContent)).toEqual(["Tipo", "Cant.", "Venc.", "Días", "Strike", "Acciones"]);
  expect([1, 2].map(index => byLabel(`Editar Contratos pata ${index}`).textContent)).toEqual(["+1", "−1"]);
  expect([...panel.querySelectorAll('.ct-sim-kind-chip')].map(node => node.textContent)).toEqual(["C", "P"]);
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
  await act(async () => byLabel<HTMLButtonElement>("Fecha Vencimiento (30 días)").click());
  await showBuild();
  expect(container.querySelector('.ct-sim-leg-expiry')!.textContent).toBe("30d");
  await act(async () => button("+ Pata manual").click());
  await act(async () => byLabel<HTMLButtonElement>("Editar Tipo pata 3").click());
  await act(async () => { const select = byLabel<HTMLSelectElement>("Tipo pata 3"); select.value = "put"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => byLabel<HTMLButtonElement>("Editar Contratos pata 3").focus());
  expect(byLabel("Editar Tipo pata 3").textContent).toBe("P");
  await fill("Vencimiento", "");
  expect(container.querySelector('.ct-sim-leg-expiry')!.textContent).toBe("—");
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
  await fill("Vencimiento", "2026-12-13");
  expect(container.querySelector('.ct-sim-leg-expiry-date')!.textContent).toBe("Dic 13");
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

it("removes the library and entry menus without reading or overwriting saved strategies, and adds metrics only to the chain", async () => {
  stored.OptionsSimulatorStrategiesV1 = [{ name: "Conservar", simulation: { original: true } }];
  await mount();
  expect(container.querySelector('.ct-sim-library-menu')).toBeNull();
  expect(container.querySelector('.ct-sim-setup-menu')).toBeNull();
  expect(container.querySelector('[aria-label="Cargar ejemplo"]')).toBeNull();
  expect(chrome.storage.local.get).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
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
  await fill("Contratos pata 1", "-1");
  await act(async () => byLabel<HTMLInputElement>("Contratos pata 1").dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(byLabel("Pérdida máxima del armado al vencimiento").textContent).toBe("Pérdida máx.∞");
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
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Butterfly · Long Call").click());
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
  for (const [id, bid, ask] of [["put-80", 3.9, 4.1], ["put-90", 5.9, 6.1], ["call-110", 5.9, 6.1], ["call-120", 3.9, 4.1]] as const)
    marketState.current.data!.instruments[id] = { ...marketState.current.data!.instruments[id], bid: { price: bid, size: 100 }, ask: { price: ask, size: 100 } };
  await mount(); await act(async () => byLabel<HTMLButtonElement>("Elegir estrategia").click());
  await act(async () => container.querySelector<HTMLButtonElement>('[data-family-name="iron-condor"]')!.click());
  const preview = byLabel("Vista previa de la estrategia");
  expect(preview.textContent).toContain("Crédito por estructura: 360 ARS");
  const svg = preview.querySelector('svg')!;
  const axis = Number(svg.querySelector('line')!.getAttribute('y1'));
  const ordinates = [...svg.querySelector('path')!.getAttribute('d')!.matchAll(/[ML][\d.]+,([\d.-]+)/g)].map(match => Number(match[1]));
  expect(Math.min(...ordinates), 'Credit Condor must show a profitable central plateau above zero').toBeLessThan(axis);
  expect(Math.max(...ordinates), 'Condor wings must show loss below zero').toBeGreaterThan(axis);
  expect(preview.textContent).toContain("Ganancia máx. 360 ARS");
  expect(preview.textContent).toContain("Pérdida máx. 640 ARS");
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
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Iron Condor · Normal").click());
  expect(container.querySelector('.ct-sim-inspect output')!.textContent).toBe("360 ARS");
  expect(byLabel("Pérdida máxima del armado al vencimiento").textContent).toContain("640 ARS");
  const svg = container.querySelector('.ct-sim-chart')!, axis = Number(svg.querySelector('.ct-sim-zero')!.getAttribute('y1'));
  const ordinates = [...svg.querySelector('.ct-sim-expiry-line')!.getAttribute('d')!.matchAll(/[ML][\d.]+,([\d.-]+)/g)].map(match => Number(match[1]));
  expect(Math.min(...ordinates)).toBeLessThan(axis); expect(Math.max(...ordinates)).toBeGreaterThan(axis);
});
