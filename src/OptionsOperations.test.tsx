// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChuchoTrizTools from "./ChuchoTrizTools";
import OptionsOperations from "./OptionsOperations";
import type { OptionExecution } from "./optionExecutions";

const { executions, dispose } = vi.hoisted(() => ({ executions: vi.fn(), dispose: vi.fn() }));
vi.mock("./optionsSimulator/market", () => ({ MarketReader: class {
  call(method: string) { return method === "executions" ? executions() : Promise.resolve(true); }
  dispose = dispose;
} }));
vi.mock("./optionsSimulator/OptionsSimulator", () => ({ default: () => null }));
vi.mock("./InstrumentPresetsOptions", () => ({ default: () => null }));

const row: OptionExecution = {
  securityId: "call-100", symbol: "CALL100", underlying: "GGAL", expiration: "2026-12-18",
  kind: "call", strike: 100, currency: "ARS", strikeCurrency: "ARS", settlement: "2",
  timestamp: Date.UTC(2026, 10, 12, 15), quantity: 2, price: 10,
};
const report = (quantity = 2) => ({ contextId: "test-account", unmatched: 0,
  rows: [{ ...row, quantity }, { ...row, quantity: 4, price: 16 }] });
let root: Root, host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", { storage: {
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  } });
  executions.mockReset().mockResolvedValue(report());
  dispose.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals();
});
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
const checkbox = () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const cells = () => [...host.querySelectorAll('table[aria-label="Calls"] tbody td')].map(cell => cell.textContent);

it("loads grouped executions immediately on entering and refreshes them on re-entry", async () => {
  await act(async () => root.render(<ChuchoTrizTools embedded />));
  expect(executions).not.toHaveBeenCalled();
  await act(async () => button("Operaciones de opciones").click());
  expect(executions).toHaveBeenCalledTimes(1);
  expect(checkbox().checked).toBe(true);
  expect(cells()).toHaveLength(4);
  expect(cells()[1]).toBe("6");
  expect(cells()[3]).toBe("14");

  await act(async () => checkbox().click());
  expect(cells()).toHaveLength(8);
  await act(async () => button("Cantidades rápidas").click());
  expect(dispose).toHaveBeenCalledTimes(1);
  executions.mockResolvedValue(report(5));
  await act(async () => button("Operaciones de opciones").click());
  expect(executions).toHaveBeenCalledTimes(2);
  expect(checkbox().checked).toBe(true);
  expect(cells()[1]).toBe("9");
});

it("keeps manual refresh available and preserves the grouping choice during that visit", async () => {
  await act(async () => root.render(<OptionsOperations embedded />));
  expect(executions).toHaveBeenCalledTimes(1);
  await act(async () => checkbox().click());
  executions.mockResolvedValue(report(7));
  await act(async () => button("Actualizar desde Matriz").click());
  expect(executions).toHaveBeenCalledTimes(2);
  expect(checkbox().checked).toBe(false);
  expect(cells()).toHaveLength(8);
  expect(cells()).toContain("7");
});

it("does not read Matriz outside the embedded tools", async () => {
  await act(async () => root.render(<OptionsOperations embedded={false} />));
  expect(executions).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Abrí ChuchoTriz dentro de Matriz");
});

it("shows automatic load errors and allows retrying manually", async () => {
  executions.mockRejectedValueOnce(Error("No se pudieron cargar las operaciones."));
  await act(async () => root.render(<OptionsOperations embedded />));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("No se pudieron cargar las operaciones.");
  expect(button("Actualizar desde Matriz").disabled).toBe(false);
  await act(async () => button("Actualizar desde Matriz").click());
  expect(checkbox().checked).toBe(true);
});

it("ignores a disposed reader's late error while StrictMode's active reader is loading", async () => {
  let rejectOld!: (error: Error) => void;
  let resolveCurrent!: (value: ReturnType<typeof report>) => void;
  executions.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject; }))
    .mockReturnValueOnce(new Promise(resolve => { resolveCurrent = resolve; }));
  await act(async () => root.render(<StrictMode><OptionsOperations embedded /></StrictMode>));
  expect(executions).toHaveBeenCalledTimes(2);
  await act(async () => rejectOld(Error("Lectura cerrada.")));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button("Leyendo…").disabled).toBe(true);
  await act(async () => resolveCurrent(report()));
  expect(checkbox().checked).toBe(true);
  expect(cells()[1]).toBe("6");
});
