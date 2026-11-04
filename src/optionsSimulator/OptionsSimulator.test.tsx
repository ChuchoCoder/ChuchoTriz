// @vitest-environment jsdom
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OptionsSimulator from "./OptionsSimulator";
import { Catalog, Quote, Snapshot } from "./market";
import { addDays, initialSimulation, localDate, Simulation } from "./model";

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
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
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

it("mirrors the Premium calls/strike/puts chain and copies ASK/BID into editable simulation legs", async () => {
  await mount();
  const groupHeaders = container.querySelectorAll('.ct-opt-chain thead tr:first-child th');
  expect(Array.from(groupHeaders).map(node => node.textContent)).toEqual(["CALLS", "Ejercicio", "PUTS"]);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("5");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("4");
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40");
  await showAnalysis();
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
  await showBuild(); await fill("VI pata 1", "45"); await showAnalysis();
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
it("saves simulation data locally and reports storage errors", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Nombre de la estrategia", "Call de prueba");
  await act(async () => button("Guardar estrategia").click());
  expect(write).toHaveBeenCalledTimes(1);
  const saved = (stored.OptionsSimulatorStrategiesV1 as { name: string; simulation: { legs: unknown[] } }[])[0];
  expect(saved.name).toBe("Call de prueba"); expect(saved.simulation.legs).toHaveLength(1);
  expect(container.textContent).toContain("Estrategia guardada");
  write.mockRejectedValueOnce(Error("Sin espacio"));
  await act(async () => button("Actualizar guardada").click()); expect(container.textContent).toContain("Sin espacio");
});
it("contains malformed stored data without breaking the chain", async () => {
  stored.OptionsSimulatorStrategiesV1 = [{ name: "malformed", simulation: null }];
  await mount(); expect(container.textContent).toContain("No se pudieron leer");
  expect(byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").disabled).toBe(false);
});

it("uses each leg's total contracts without a global multiplier in either view", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Contratos pata 1", "3");
  await showAnalysis();
  expect(container.textContent?.toLowerCase()).not.toContain("combo");
  expect(byLabel("Patas analizadas").textContent).toContain("Compra 3× CALL 100");
  expect(container.querySelector('.ct-sim-metrics')!.textContent).toContain("1.500 ARS");
  await showBuild(); await fill("Nombre de la estrategia", "Tres contratos");
  await act(async () => button("Guardar estrategia").click());
  const saved = (stored.OptionsSimulatorStrategiesV1 as { simulation: Simulation }[])[0].simulation;
  expect(saved.legs[0].contracts).toBe("3");
  expect(saved).not.toHaveProperty("combos");
});

it("converts saved legacy combos into total quantities exactly once without changing profit or loss", async () => {
  stored.OptionsSimulatorStrategiesV1 = [{ name: "Anterior", simulation: { ...initialSimulation(localDate()), combos: "3" } }];
  await mount();
  await act(async () => {
    const select = byLabel<HTMLSelectElement>("Cargar estrategia guardada");
    select.value = "Anterior"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  for (const index of [1, 2]) expect(byLabel<HTMLButtonElement>(`Editar Contratos pata ${index}`).textContent).toBe("3");
  await showAnalysis();
  expect(container.querySelector('.ct-sim-metrics')!.textContent).toContain("1.200 ARS");
  expect(container.querySelector('.ct-sim-metrics')!.textContent).toContain("1.800 ARS");
  await showBuild(); await act(async () => button("Actualizar guardada").click());
  const saved = (stored.OptionsSimulatorStrategiesV1 as { simulation: Simulation }[])[0].simulation;
  expect(saved).not.toHaveProperty("combos");
  expect(saved.legs.map(leg => leg.contracts)).toEqual(["3", "3"]);
  await act(async () => button("Actualizar guardada").click());
  expect((stored.OptionsSimulatorStrategiesV1 as { simulation: Simulation }[])[0].simulation.legs.map(leg => leg.contracts)).toEqual(["3", "3"]);
});

it.each(["1.5", "0", "100001", "bad"])("rejects invalid legacy multiplier %s before migration", async combos => {
  stored.OptionsSimulatorStrategiesV1 = [{ name: "Inválida", simulation: { ...initialSimulation(localDate()), combos } }];
  await mount(); expect(container.textContent).toContain("No se pudieron leer");
});

it("edits compact cells on click, accepts on Enter or blur, and restores the original value on Escape", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  expect(container.querySelectorAll('.ct-sim-legs-card tbody input, .ct-sim-legs-card tbody select')).toHaveLength(0);
  await fill("Prima pata 1", "7,5");
  const premium = byLabel<HTMLInputElement>("Prima pata 1");
  expect(document.activeElement).toBe(premium);
  await act(async () => premium.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("7,5");
  expect(document.activeElement).toBe(byLabel("Editar Prima pata 1"));
  expect(container.textContent).toContain("750 ARS");
  await fill("VI pata 1", "60");
  await act(async () => byLabel<HTMLInputElement>("VI pata 1").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40");
  await fill("Contratos pata 1", "3");
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 1").focus());
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 1").textContent).toBe("3");
  expect(container.textContent).toContain("2.250 ARS");
});

it("offers Natural/MID/Opuesto only while editing one premium, using that leg's side", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(container.querySelector('.ct-sim-premium-references')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 1").click());
  expect(byLabel<HTMLButtonElement>("Tomar Natural para Prima pata 1").textContent).toBe("Natural5");
  expect(byLabel<HTMLButtonElement>("Tomar Opuesto para Prima pata 1").textContent).toBe("Opuesto4");
  await act(async () => byLabel<HTMLButtonElement>("Tomar MID para Prima pata 1").click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("4,5");
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("4");
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 2").click());
  expect(byLabel<HTMLButtonElement>("Tomar Natural para Prima pata 2").textContent).toBe("Natural4");
  await act(async () => byLabel<HTMLButtonElement>("Tomar Opuesto para Prima pata 2").click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 2").textContent).toBe("5");
  expect(container.querySelector('.ct-sim-premium-references')).toBeNull();
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 1").click());
  const natural = byLabel<HTMLButtonElement>("Tomar Natural para Prima pata 1");
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => { natural.focus(); natural.dispatchEvent(enter); });
  expect(enter.defaultPrevented, "Enter must preserve the reference button's native activation").toBe(false);
  expect(container.querySelector('.ct-sim-premium-references')).not.toBeNull();
  await act(async () => natural.click());
  expect(byLabel<HTMLButtonElement>("Editar Prima pata 1").textContent).toBe("5");
});

it("removes market references during a disconnect and keeps the VI controls folded initially", async () => {
  await mount();
  expect(byLabel("Configurar filtro de VI").closest("details")!.open).toBe(false);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Editar Prima pata 1").click());
  expect(container.querySelector('.ct-sim-premium-references')).not.toBeNull();
  marketState.current = { catalog: marketState.current.catalog, issue: "Disconnected" };
  await act(async () => root.render(<OptionsSimulator />));
  expect(container.querySelector('.ct-sim-premium-references')).toBeNull();
  expect(byLabel<HTMLInputElement>("Prima pata 1").value).toBe("5");
});

it("separates build and analysis while preserving legs, market selection and scenario assumptions", async () => {
  await mount();
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await fill("Prima pata 1", "7,5");
  await showAnalysis();
  const panels = container.querySelectorAll<HTMLElement>('[role="tabpanel"]');
  expect(panels[0].hidden).toBe(true); expect(panels[1].hidden).toBe(false);
  expect(container.querySelector('.ct-sim-premium-references')).toBeNull();
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
  expect(byLabel("Resultado rápido del armado").textContent).toContain("VI 5 pp");
  await fill("Contratos pata 1", "2");
  expect(outputs()).toEqual(["500 ARS", "500 ARS"]);
  await fill("Precio a evaluar", "105");
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
  expect(byLabel<HTMLButtonElement>("Editar VI pata 1").textContent).toBe("40");
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
  expect(legends[0].textContent).toContain("Calls 40 %"); expect(legends[0].textContent).toContain("Puts 40 %");
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
  await fill("VI pata 1", "2"); await showAnalysis();
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
  await fill("Precio a evaluar", "0.00000095");
  expect(byLabel<HTMLInputElement>("Precio del escenario").value).toBe("0.00000095");
  expect(container.querySelector('.ct-sim-cursor')).not.toBeNull();
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
  expect(container.querySelector('.ct-sim-leg-symbol')!.textContent).toBe("CALL 100");
  await act(async () => byLabel<HTMLButtonElement>("Aplicar Vertical · Short Put").click());
  expect(container.querySelector('[aria-label="Selector visual de estrategias"]')).toBeNull();
  expect(container.querySelectorAll('.ct-sim-legs-card tbody tr')).toHaveLength(2);
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 1").textContent).toBe("1");
  expect(byLabel<HTMLButtonElement>("Editar Contratos pata 2").textContent).toBe("1");
  expect(byLabel<HTMLButtonElement>("Editar Sentido pata 1").textContent).toBe("Venta");
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
