// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChuchoTrizTools from "./ChuchoTrizTools";
import OptionsOperations from "./OptionsOperations";
import type { OptionExecution } from "./optionExecutions";

const { executions, dispose, verifyContext } = vi.hoisted(() => ({ executions: vi.fn(), dispose: vi.fn(), verifyContext:vi.fn() }));
vi.mock("./optionsSimulator/market", () => ({ MarketReader: class {
  call(method: string) { return method === "executions" ? executions() : verifyContext(); }
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
  verifyContext.mockReset().mockResolvedValue(true);
  dispose.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals();
});
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent === text)!;
const checkbox = () => host.querySelector<HTMLInputElement>('.ct-operations input[type="checkbox"]')!;
const cells = () => [...host.querySelectorAll('table[aria-label="Calls"] tbody td')].map(cell => cell.textContent);
const copyButton = (label: string) => [...host.querySelectorAll("button")]
  .find(node => node.querySelector('.ct-operations-copy-label > [aria-hidden]')?.textContent === label)!;

const formatRow: OptionExecution = { ...row, timestamp:new Date(2026, 10, 16, 12).getTime(), strike:1234.5, price:10.25 };
async function changeSelect(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles:true })); });
}
const numberSelect = () => host.querySelectorAll<HTMLSelectElement>("select")[0];
const dateSelect = () => host.querySelectorAll<HTMLSelectElement>("select")[1];
const legacyKey = "OptionsOperationsLocale", numberKey = "OptionsOperationsNumberLocale", dateKey = "OptionsOperationsDateLocale";

it.each([true, false])("copies the operation date shown in each table, with grouping %s", async averaged => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { languages:["es-AR"], clipboard:{ writeText } });
  executions.mockResolvedValue({ ...report(), rows:[
    formatRow,
    { ...formatRow, securityId:"put", kind:"put", timestamp:new Date(2026, 10, 17, 12).getTime(), quantity:-3 },
  ] });
  await act(async () => root.render(<OptionsOperations embedded />));
  await changeSelect(dateSelect(), "es-AR");
  if (!averaged) await act(async () => checkbox().click());
  const calls = cells().join("\t");
  const puts = [...host.querySelectorAll('table[aria-label="Puts"] tbody td')].map(cell => cell.textContent).join("\t");
  expect(calls.split("\t")[0]).toBe("16/11/2026");
  expect(puts.split("\t")[0]).toBe("17/11/2026");
  expect(host.querySelector("time")?.textContent).toBe("18/12/2026");
  await act(async () => copyButton("Copiar Calls").click());
  expect(writeText).toHaveBeenLastCalledWith(calls);
  await act(async () => copyButton("Copiar Puts").click());
  expect(writeText).toHaveBeenLastCalledWith(puts);
  await act(async () => copyButton("Copiar Calls y Puts").click());
  const mode = averaged ? "CON PROMEDIOS" : "SIN PROMEDIOS";
  expect(writeText).toHaveBeenLastCalledWith(`OPERACIONES CALLS (${mode})\n${calls}\n\nOPERACIONES PUTS (${mode})\n${puts}`);
});

it.each([
  ["es-AR", "es-AR", "16/11/2026", "18/12/2026", "1.234,5", "10,25", "1.234,56"],
  ["es-AR", "en-US", "11/16/2026", "12/18/2026", "1.234,5", "10,25", "1.234,56"],
  ["en-US", "es-AR", "16/11/2026", "18/12/2026", "1,234.5", "10.25", "1,234.56"],
  ["en-US", "en-US", "11/16/2026", "12/18/2026", "1,234.5", "10.25", "1,234.56"],
  ["auto", "es-AR", "16/11/2026", "18/12/2026", "1,234.5", "10.25", "1,234.56"],
  ["es-AR", "auto", "11/16/2026", "12/18/2026", "1.234,5", "10,25", "1.234,56"],
])("updates grid and all copy buttons independently: numbers %s, dates %s", async (numbers, dates, operationDate, expiry, strike, callPrice, putPrice) => {
  executions.mockResolvedValue({ ...report(), rows:[formatRow, { ...formatRow, securityId:"put", kind:"put", quantity:-3, price:1234.56 }] });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { languages:["en-US"], clipboard:{ writeText } });
  await act(async () => root.render(<OptionsOperations embedded />));
  const initialDate = cells()[0];
  await changeSelect(numberSelect(), numbers);
  expect(cells()[0]).toBe(initialDate);
  const currentNumbers = cells().slice(1);
  await changeSelect(dateSelect(), dates);
  expect(cells().slice(1)).toEqual(currentNumbers);
  expect(cells()).toEqual([operationDate, "2", strike, callPrice]);
  expect([...host.querySelectorAll('table[aria-label="Puts"] tbody td')].map(e => e.textContent))
    .toEqual([operationDate, "-3", strike, putPrice]);
  expect(host.querySelector("time")?.textContent).toBe(expiry);
  expect(host.querySelector("time")?.dateTime).toBe("2026-12-18");
  const calls = `${operationDate}\t2\t${strike}\t${callPrice}`, puts = `${operationDate}\t-3\t${strike}\t${putPrice}`;
  await act(async () => copyButton("Copiar Calls").click());
  expect(writeText).toHaveBeenLastCalledWith(calls);
  await act(async () => copyButton("Copiar Puts").click());
  expect(writeText).toHaveBeenLastCalledWith(puts);
  await act(async () => copyButton("Copiar Calls y Puts").click());
  expect(writeText).toHaveBeenLastCalledWith(`OPERACIONES CALLS (CON PROMEDIOS)\n${calls}\n\nOPERACIONES PUTS (CON PROMEDIOS)\n${puts}`);
});

it("formats the displayed expiry in the group header too", async () => {
  await act(async () => root.render(<OptionsOperations embedded />));
  await changeSelect(dateSelect(), "es-AR");
  expect(host.querySelector("time")?.textContent).toBe("18/12/2026");
});

function installStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: chrome.storage.AreaName) => void>();
  const emit = (patch: Record<string, unknown>) => {
    const changes = Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { oldValue:values[key], newValue }]));
    Object.assign(values, patch); listeners.forEach(listener => listener(changes, "local"));
  };
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ ...values }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async patch => emit(patch));
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation(listener => { listeners.add(listener); });
  vi.mocked(chrome.storage.onChanged.removeListener).mockImplementation(listener => { listeners.delete(listener); });
  return { values, emit };
}

it("inherits legacy preferences for both fields, writes only the changed field and restores independent choices", async () => {
  const storage = installStorage({ [legacyKey]:"es-AR" });
  await act(async () => root.render(<OptionsOperations embedded />));
  expect([numberSelect().value, dateSelect().value]).toEqual(["es-AR", "es-AR"]);
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  await changeSelect(numberSelect(), "en-US");
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith({ [numberKey]:"en-US" });
  expect(dateSelect().value).toBe("es-AR");
  await act(async () => root.render(null));
  await act(async () => root.render(<OptionsOperations embedded />));
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "es-AR"]);
  await act(async () => storage.emit({ [legacyKey]:"en-US" }));
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "en-US"]);
  await changeSelect(dateSelect(), "es-AR");
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith({ [dateKey]:"es-AR" });
  await act(async () => storage.emit({ [legacyKey]:"auto" }));
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "es-AR"]);
});

it("merges a format changed during the initial read without dropping the untouched legacy format", async () => {
  const storage = installStorage();
  let finishRead!: (values: Record<string, unknown>) => void;
  vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  await act(async () => root.render(<OptionsOperations embedded />));
  await act(async () => storage.emit({ [numberKey]:"en-US" }));
  await act(async () => finishRead({ [legacyKey]:"es-AR" }));
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "es-AR"]);
});

it("preserves an external change to dates while a number preference save is pending", async () => {
  const storage = installStorage({ [legacyKey]:"es-AR" });
  await act(async () => root.render(<OptionsOperations embedded />));
  let finishSave!: () => void;
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
  await changeSelect(numberSelect(), "en-US");
  expect(copyButton("Copiar Calls").disabled).toBe(true);
  await act(async () => storage.emit({ [dateKey]:"en-US" }));
  await act(async () => finishSave());
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "en-US"]);
});

it("keeps a newer external number preference over a late local save result", async () => {
  const storage = installStorage({ [legacyKey]:"en-US" });
  await act(async () => root.render(<OptionsOperations embedded />));
  let finishSave!: () => void;
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(() => new Promise<void>(resolve => { finishSave = resolve; }));
  await changeSelect(numberSelect(), "es-AR");
  await act(async () => storage.emit({ [numberKey]:"auto" }));
  await act(async () => finishSave());
  expect([numberSelect().value, dateSelect().value]).toEqual(["auto", "en-US"]);
});

it("keeps the previous formats on save failure and lets the user retry", async () => {
  installStorage({ [legacyKey]:"es-AR" });
  await act(async () => root.render(<OptionsOperations embedded />));
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(Error("storage unavailable"));
  await changeSelect(dateSelect(), "en-US");
  expect([numberSelect().value, dateSelect().value]).toEqual(["es-AR", "es-AR"]);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("No se pudo guardar");
  await changeSelect(dateSelect(), "en-US");
  expect([numberSelect().value, dateSelect().value]).toEqual(["es-AR", "en-US"]);
});

it("uses the formats currently displayed if preferences change while clipboard context verification is pending", async () => {
  const storage = installStorage({ [legacyKey]:"es-AR" });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { languages:["en-US"], clipboard:{ writeText } });
  executions.mockResolvedValue({ ...report(), rows:[formatRow] });
  await act(async () => root.render(<OptionsOperations embedded />));
  let finishVerify!: (valid: boolean) => void;
  verifyContext.mockImplementationOnce(() => new Promise(resolve => { finishVerify = resolve; }));
  await act(async () => copyButton("Copiar Calls").click());
  await act(async () => storage.emit({ [dateKey]:"en-US" }));
  expect(cells()[0]).toBe("11/16/2026");
  await act(async () => finishVerify(true));
  expect(writeText).toHaveBeenLastCalledWith("11/16/2026\t2\t1.234,5\t10,25");
});

it("handles removed and invalid independent preferences without changing the other format", async () => {
  const storage = installStorage({ [legacyKey]:"es-AR", [numberKey]:"en-US", [dateKey]:"en-US" });
  await act(async () => root.render(<OptionsOperations embedded />));
  await act(async () => storage.emit({ [dateKey]:undefined }));
  expect([numberSelect().value, dateSelect().value]).toEqual(["en-US", "es-AR"]);
  await act(async () => storage.emit({ [numberKey]:"invalid" }));
  expect([numberSelect().value, dateSelect().value]).toEqual(["auto", "es-AR"]);
});

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
