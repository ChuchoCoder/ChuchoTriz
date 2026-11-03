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
    const node = byLabel<HTMLInputElement>(label);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount() { await act(async () => root.render(<OptionsSimulator />)); }

it("mirrors the Premium calls/strike/puts chain and copies ASK/BID into editable simulation legs", async () => {
  await mount();
  const groupHeaders = container.querySelectorAll('.ct-opt-chain thead tr:first-child th');
  expect(Array.from(groupHeaders).map(node => node.textContent)).toEqual(["CALLS", "Ejercicio", "PUTS"]);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
  await act(async () => byLabel<HTMLButtonElement>("Vender PUT 90 en simulación").click());
  expect(byLabel<HTMLInputElement>("Prima pata 1").value).toBe("5");
  expect(byLabel<HTMLInputElement>("Prima pata 2").value).toBe("4");
  expect(byLabel<HTMLInputElement>("VI pata 1").value).toBe("40");
  expect(container.querySelectorAll(".ct-sim-chart path")).toHaveLength(3);
  expect(container.textContent).toContain("GGAL"); expect(write).not.toHaveBeenCalled();
});
it("keeps expiry available when a native VI is missing and blocks missing quotes", async () => {
  marketState.current.data!.instruments["call-100"].impliedVolatility = undefined;
  marketState.current.data!.instruments["put-100"].ask = undefined;
  await mount();
  expect(byLabel<HTMLButtonElement>("Comprar PUT 100 en simulación").disabled).toBe(true);
  await act(async () => byLabel<HTMLButtonElement>("Comprar CALL 100 en simulación").click());
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
