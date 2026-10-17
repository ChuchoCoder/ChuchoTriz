// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";
import { defaultBook, format } from "./PresetBook";

let root: Root;
let container: HTMLDivElement;
let set: ReturnType<typeof vi.fn>;
let stored: { InstrumentPresets: typeof defaultBook; Autocomplete: boolean };
let storageListeners: Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>;

async function externalSave(quantity: number) {
  await act(async () => {
    const previous = stored;
    stored = { InstrumentPresets: { ...stored.InstrumentPresets,
      AL30: [{ ...stored.InstrumentPresets.AL30[0], cantidad: quantity }, ...stored.InstrumentPresets.AL30.slice(1)],
    }, Autocomplete: false };
    storageListeners.forEach(listener => listener({
      InstrumentPresets: { oldValue: previous.InstrumentPresets, newValue: stored.InstrumentPresets },
      Autocomplete: { oldValue: previous.Autocomplete, newValue: stored.Autocomplete },
    }, "local"));
  });
}

function button(text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(element => element.textContent?.trim() === text);
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}
function quantity(label: string): HTMLInputElement {
  const rowIndex = Number(/preset (\d+)/.exec(label)?.[1]) - 1;
  const row = container.querySelectorAll<HTMLDivElement>(".preset-row")[rowIndex];
  if (!container.querySelector(`input[aria-label="${label}"]`) && row) {
    if (!row.classList.contains('preset-editing')) act(() => row.querySelector<HTMLButtonElement>('.edit-preset')?.click());
    if (label.startsWith("Cantidad a mostrar") && !row.querySelector(`input[aria-label="${label}"]`)) {
      act(() => row.querySelector<HTMLButtonElement>('[data-display-mode="fixed"]')?.click());
    }
  }
  const match = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!match) throw new Error(`Missing input: ${label}`);
  return match;
}
async function edit(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const displayedTickers = () => Array.from(container.querySelectorAll(".instrument-list button > span")).map(element => element.textContent);
const search = () => container.querySelector<HTMLInputElement>('[role="searchbox"]')!;
const moveButton = (direction: "Subir" | "Bajar", index: number, ticker = "AL30") =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${direction} preset ${index} de ${ticker}"]`)!;
const chips = () => Array.from(container.querySelectorAll(".preset-chip")).map(element => element.textContent);
const rawEditor = () => container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Presets RAW"]')!;
const rowAt = (index: number) => container.querySelectorAll<HTMLDivElement>(".preset-row")[index - 1];
const modeButton = (mode: string, index = 1) => rowAt(index).querySelector<HTMLButtonElement>(`[data-display-mode="${mode}"]`)!;
async function chooseMode(mode: string, index = 1) {
  await act(async () => rowAt(index).querySelector<HTMLButtonElement>('.edit-preset')?.click());
  await act(async () => modeButton(mode, index).click());
}

beforeEach(async () => {
  stored = { InstrumentPresets: structuredClone(defaultBook), Autocomplete: true };
  storageListeners = new Set();
  set = vi.fn().mockImplementation(async values => {
    const previous = stored;
    stored = structuredClone({ ...stored, ...values });
    storageListeners.forEach(listener => listener({
      InstrumentPresets: { oldValue: previous.InstrumentPresets, newValue: stored.InstrumentPresets },
      Autocomplete: { oldValue: previous.Autocomplete, newValue: stored.Autocomplete },
    }, "local"));
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", { storage: { local: {
    get: vi.fn().mockImplementation(async () => structuredClone(stored)), set,
  }, onChanged: {
    addListener: (listener: Parameters<typeof storageListeners.add>[0]) => storageListeners.add(listener),
    removeListener: (listener: Parameters<typeof storageListeners.delete>[0]) => storageListeners.delete(listener),
  } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<InstrumentPresetsOptions />); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Opciones por instrumento", () => {
  it("shares unsaved presets between visual and RAW, preserves order and saves either mode", async () => {
    const random = vi.spyOn(Math, 'random');
    await edit(quantity('Cantidad del preset 1 de AL30'), '234567');
    await act(async () => button('RAW').click());
    expect(rawEditor().value).toContain('AL30 234567/20000');
    const text = 'GD30 200000/R4\nAL30 100000/R5 50000/5000 100\n';
    await edit(rawEditor(), text);
    await act(async () => button('Visual').click());
    expect(displayedTickers()).toEqual(['AL30', 'GD30']);
    expect(chips()).toEqual(['100k/R5', '50k/5k', '100']);
    expect(set).not.toHaveBeenCalled();
    await edit(quantity('Cantidad del preset 1 de AL30'), '110000');
    await act(async () => button('RAW').click());
    expect(rawEditor().value).toContain('AL30 110000/R5');
    await act(async () => button('Guardar cambios').click());
    expect(Object.keys(stored.InstrumentPresets)).toEqual(['GD30', 'AL30']);
    expect(stored.InstrumentPresets.AL30).toEqual([{cantidad:110000,mostrar:'R5'},{cantidad:50000,mostrar:5000},{cantidad:100,mostrar:0}]);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(['AL30 100000/R5\nGD30 100/R1\n', 'AL30 100/10\nAL30 200/20\n'])(
    'keeps invalid RAW intact and blocks partial saves and switching: %s', async text => {
      await act(async () => button('RAW').click());
      await edit(rawEditor(), text);
      expect(rawEditor().getAttribute('aria-invalid')).toBe('true');
      expect(container.querySelector('.raw-errors')?.textContent).toContain('Línea 2');
      await act(async () => button('Visual').click());
      expect(rawEditor().value).toBe(text);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain('Línea 2');
      await act(async () => button('Guardar cambios').click());
      expect(set).not.toHaveBeenCalled();
      expect(stored.InstrumentPresets).toEqual(defaultBook);
      await edit(rawEditor(), 'AL30 100000/R5 100/0');
      await act(async () => button('Guardar cambios').click());
      expect(set).toHaveBeenCalledTimes(1);
      expect(stored.InstrumentPresets).toEqual({AL30:[{cantidad:100000,mostrar:'R5'},{cantidad:100,mostrar:0}]});
    });

  it('refreshes clean RAW, preserves conflicting text and discards to the latest saved version', async () => {
    await act(async () => root.render(<InstrumentPresetsOptions embedded />));
    await act(async () => button('RAW').click());
    await externalSave(333333);
    expect(rawEditor().value).toContain('AL30 333333/20000');
    const draft = 'AL30 111111/R5\n';
    await edit(rawEditor(), draft);
    await externalSave(444444);
    expect(rawEditor().value).toBe(draft);
    expect(button('Guardar cambios').disabled).toBe(true);
    await act(async () => button('Visual').click());
    await act(async () => button('RAW').click());
    expect(rawEditor().value).toBe(draft);
    await act(async () => button('Descartar cambios').click());
    expect(rawEditor().value).toContain('AL30 444444/20000');
    expect(button('Guardar cambios').disabled).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('retains RAW on failed save, supports retry, and restores defaults in the active view', async () => {
    await act(async () => button('RAW').click());
    await edit(rawEditor(), 'AL30 100000/R5');
    set.mockRejectedValueOnce(new Error('Storage unavailable'));
    await act(async () => button('Guardar cambios').click());
    expect(rawEditor().value).toBe('AL30 100000/R5');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo guardar');
    await act(async () => button('Guardar cambios').click());
    expect(stored.InstrumentPresets).toEqual({AL30:[{cantidad:100000,mostrar:'R5'}]});
    await act(async () => button('Restablecer valores').click());
    expect(rawEditor().value).toBe(format(defaultBook));
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('allows repairing an incomplete visual draft in RAW without losing its contents', async () => {
    await edit(quantity('Cantidad del preset 1 de AL30'), '');
    await act(async () => button('RAW').click());
    expect(rawEditor().value).toContain('AL30 /20000');
    await edit(rawEditor(), 'AL30 100000/R5');
    await act(async () => button('Visual').click());
    expect(rowAt(1).textContent).toContain('Aleatoria ÷5');
    expect(chips()).toEqual(['100k/R5']);
  });

  it("starts compact, edits from every data cell, and shows choices for only one row", async () => {
    expect(container.querySelectorAll('.preset-display-modes')).toHaveLength(0);
    expect(container.querySelectorAll('.preset-row input')).toHaveLength(0);
    for (const cell of ['.preset-number', '.preset-quantity-cell', '.preset-display-cell']) {
      await act(async () => rowAt(1).querySelector<HTMLButtonElement>(cell)!.click());
      expect(container.querySelectorAll('.preset-display-modes')).toHaveLength(1);
      expect(modeButton('fixed').getAttribute('aria-pressed')).toBe('true');
      await act(async () => rowAt(1).querySelector<HTMLButtonElement>('.edit-preset')!.click());
      expect(container.querySelectorAll('.preset-display-modes')).toHaveLength(0);
    }
    await act(async () => rowAt(1).click());
    await act(async () => rowAt(2).querySelector<HTMLButtonElement>('.preset-display-cell')!.click());
    expect(container.querySelectorAll('.preset-display-modes')).toHaveLength(1);
    expect(rowAt(1).querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(quantity('Cantidad a mostrar del preset 2 de AL30'));
    expect(set).not.toHaveBeenCalled();
  });

  it("switches explicit modes, remembers values during editing and persists the selected mode", async () => {
    await chooseMode('random');
    const divisor = quantity('Divisor del preset 1 de AL30');
    expect(divisor.value).toBe('5');
    await edit(divisor, '10');
    expect(chips()[0]).toBe('200k/R10');
    expect(rowAt(1).textContent).toContain('20.000–20.600');
    await act(async () => modeButton('fixed').click());
    expect(quantity('Cantidad a mostrar del preset 1 de AL30').value).toBe('20000');
    await act(async () => modeButton('all').click());
    expect(rowAt(1).querySelectorAll('input')).toHaveLength(1);
    expect(chips()[0]).toBe('200k');
    await act(async () => modeButton('random').click());
    expect(quantity('Divisor del preset 1 de AL30').value).toBe('10');
    await act(async () => button('Guardar cambios').click());
    expect(stored.InstrumentPresets.AL30[0]).toEqual({cantidad:200000,mostrar:'R10'});
    expect(container.querySelector('.preset-display-modes')).toBeNull();
    expect(rowAt(1).textContent).toContain('Aleatoria ÷10');
  });

  it("finishes editing with Enter without submitting and returns focus to its edit button", async () => {
    await act(async () => rowAt(1).querySelector<HTMLButtonElement>('.preset-quantity-cell')!.click());
    const input = quantity('Cantidad del preset 1 de AL30');
    await edit(input, '250000');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true})));
    expect(rowAt(1).querySelector('input')).toBeNull();
    expect(set).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rowAt(1).querySelector('.edit-preset'));
  });

  it("keeps random mode and divisor attached to the edited preset across moves and earlier deletion", async () => {
    await chooseMode('random', 2);
    await edit(quantity('Divisor del preset 2 de AL30'), '7');
    await act(async () => moveButton('Bajar', 2).click());
    expect(rowAt(3).classList.contains('preset-editing')).toBe(true);
    expect(quantity('Divisor del preset 3 de AL30').value).toBe('7');
    await act(async () => rowAt(1).querySelector<HTMLButtonElement>('.remove-preset')!.click());
    expect(rowAt(2).classList.contains('preset-editing')).toBe(true);
    expect(quantity('Cantidad del preset 2 de AL30').value).toBe('100000');
    expect(quantity('Divisor del preset 2 de AL30').value).toBe('7');
    await act(async () => button('Guardar cambios').click());
    expect(stored.InstrumentPresets.AL30).toEqual([{cantidad:50000,mostrar:5000},{cantidad:100000,mostrar:'R7'}]);
    expect(container.querySelector('.preset-display-modes')).toBeNull();
  });

  it("persists Mostrar todo and prevents finishing an invalid divisor", async () => {
    await chooseMode('random');
    await edit(quantity('Divisor del preset 1 de AL30'), '1');
    await act(async () => rowAt(1).querySelector<HTMLButtonElement>('.edit-preset')!.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('divisor entero desde 2');
    expect(rowAt(1).classList.contains('preset-editing')).toBe(true);
    await act(async () => modeButton('all').click());
    await act(async () => button('Guardar cambios').click());
    expect(stored.InstrumentPresets.AL30[0]).toEqual({cantidad:200000,mostrar:0});
    expect(rowAt(1).textContent).toContain('Mostrar todo');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("previews and saves a rule, then reloads it without replacing it by a random result", async () => {
    await edit(quantity("Cantidad del preset 1 de AL30"), "100000");
    await act(async () => modeButton('random').click());
    await edit(quantity("Divisor del preset 1 de AL30"), "005");
    expect(chips()[0]).toBe("100k/R5");
    await act(async () => button("Guardar cambios").click());
    expect(stored.InstrumentPresets.AL30[0]).toEqual({ cantidad: 100000, mostrar: "R5" });
    expect(rowAt(1).textContent).toContain('Aleatoria ÷5');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<InstrumentPresetsOptions embedded />));
    expect(rowAt(1).textContent).toContain('Aleatoria ÷5');
    expect(chips()[0]).toBe("100k/R5");
  });

  it.each(["0", "1", "2.5", "-5", "9007199254740992", ""])("blocks saving invalid divisor %s", async rule => {
    await chooseMode('random');
    await edit(quantity("Divisor del preset 1 de AL30"), rule);
    expect(chips()[0]).toBe("—");
    await act(async () => button("Guardar cambios").click());
    expect(set).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("divisor entero desde 2");
    expect(quantity("Divisor del preset 1 de AL30").value).toBe(rule);
  });
  it("does not treat normalization in its own save notification as an external conflict", async () => {
    await edit(quantity("Cantidad del preset 1 de AL30"), "0234567");
    await edit(quantity("Cantidad a mostrar del preset 1 de AL30"), "00");
    await act(async () => button("Guardar cambios").click());
    expect(stored.InstrumentPresets.AL30[0]).toEqual({ cantidad: 234567, mostrar: 0 });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Cambios guardados");
    expect(button("Guardar cambios").disabled).toBe(false);
    await act(async () => button("Guardar cambios").click());
    expect(set).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("refreshes a clean persistent editor after preferences are saved from another view", async () => {
    await act(async () => root.render(<InstrumentPresetsOptions embedded />));
    await externalSave(333333);
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("333333");
    expect(container.querySelector<HTMLInputElement>('[name="autocompleteWithFirstPreset"]')!.checked).toBe(false);
    await act(async () => button("Guardar cambios").click());
    expect(stored.InstrumentPresets.AL30[0].cantidad).toBe(333333);
    expect(container.textContent).toContain("Cambios guardados");
    expect(button("Guardar cambios").disabled).toBe(false);
  });

  it("preserves a dirty draft, blocks overwriting external preferences, and discards to the latest saved snapshot", async () => {
    await act(async () => root.render(<InstrumentPresetsOptions embedded />));
    await edit(quantity("Cantidad del preset 1 de AL30"), "234567");
    await externalSave(333333);
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("234567");
    expect(button("Guardar cambios").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("otra vista");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(set).not.toHaveBeenCalled();
    expect(stored.InstrumentPresets.AL30[0].cantidad).toBe(333333);
    await act(async () => button("Descartar cambios").click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("333333");
    expect(container.querySelector<HTMLInputElement>('[name="autocompleteWithFirstPreset"]')!.checked).toBe(false);
    expect(button("Guardar cambios").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("checks storage again before saving when an external change notification has not arrived", async () => {
    await edit(quantity("Cantidad del preset 1 de AL30"), "234567");
    stored = { ...stored, Autocomplete: false };
    await act(async () => button("Guardar cambios").click());
    expect(set).not.toHaveBeenCalled();
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("234567");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("otra vista");
  });

  it("preserves an external save that arrives while a clean editor is checking storage", async () => {
    let finishRead!: (value: typeof stored) => void;
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
    await act(async () => button("Guardar cambios").click());
    await externalSave(333333);
    await act(async () => finishRead(structuredClone(stored)));
    expect(set).not.toHaveBeenCalled();
    expect(stored.InstrumentPresets.AL30[0].cantidad).toBe(333333);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("otra vista");
    expect(button("Guardar cambios").disabled).toBe(true);
  });

  it("reorders quantity/display pairs, preserves edits across filtering and saves the same preview order", async () => {
    await edit(quantity("Cantidad del preset 2 de AL30"), "123456");
    await act(async () => moveButton("Subir", 2).click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("123456");
    expect(quantity("Cantidad a mostrar del preset 1 de AL30").value).toBe("10000");
    expect(chips()).toEqual(["123.456k/10k", "200k/20k", "50k/5k"]);
    expect(document.activeElement).toBe(moveButton("Bajar", 1));
    expect(set).not.toHaveBeenCalled();
    await edit(search(), "GGAL");
    await act(async () => container.querySelector<HTMLButtonElement>(".instrument-list button")!.click());
    await edit(search(), "AL30");
    await act(async () => container.querySelector<HTMLButtonElement>(".instrument-list button")!.click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("123456");
    await act(async () => moveButton("Bajar", 2).click());
    expect(chips()).toEqual(["123.456k/10k", "50k/5k", "200k/20k"]);
    await act(async () => button("Guardar cambios").click());
    expect(set.mock.calls[0][0].InstrumentPresets).toEqual({ ...defaultBook, AL30: [
      { cantidad: 123456, mostrar: 10000 }, { cantidad: 50000, mostrar: 5000 }, { cantidad: 200000, mostrar: 20000 },
    ] });
  });

  it("disables moves past the ends and restores the saved order when discarding", async () => {
    await act(async () => root.render(<InstrumentPresetsOptions embedded />));
    expect(moveButton("Subir", 1).disabled).toBe(true);
    expect(moveButton("Bajar", 3).disabled).toBe(true);
    await act(async () => moveButton("Subir", 3).click());
    await act(async () => moveButton("Subir", 2).click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("50000");
    await act(async () => button("Guardar cambios").click());
    await act(async () => moveButton("Bajar", 1).click());
    await act(async () => button("Descartar cambios").click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("50000");
    expect(chips()).toEqual(["50k/5k", "200k/20k", "100k/10k"]);
    await edit(search(), "DLR");
    await act(async () => container.querySelector<HTMLButtonElement>(".instrument-list button")!.click());
    expect(moveButton("Subir", 1, "DLR").disabled).toBe(true);
    expect(moveButton("Bajar", 1, "DLR").disabled).toBe(true);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("filters tickers ignoring case and surrounding spaces without losing edits or saving only the matches", async () => {
    await edit(quantity("Cantidad del preset 1 de AL30"), "234567");
    await edit(search(), " g ");
    expect(displayedTickers()).toEqual(["GD30", "GFG", "GGAL"]);
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("234567");
    await act(async () => button("Guardar cambios").click());
    const stored = set.mock.calls[0][0].InstrumentPresets;
    expect(Object.keys(stored)).toEqual(Object.keys(defaultBook));
    expect(stored.AL30[0].cantidad).toBe(234567);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Limpiar búsqueda"]')!.click());
    expect(displayedTickers()).toHaveLength(Object.keys(defaultBook).length);
    expect(search().value).toBe("");
    expect(document.activeElement).toBe(search());
  });

  it("selects a search result with Enter, handles no matches, and clears with Escape without submitting", async () => {
    await edit(search(), "ggal");
    await act(async () => search().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(container.querySelector("#selected-instrument")?.textContent).toBe("GGAL");
    await edit(search(), "ZZZZ");
    expect(displayedTickers()).toEqual([]);
    expect(container.textContent).toContain("Sin coincidencias");
    await act(async () => search().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(container.querySelector("#selected-instrument")?.textContent).toBe("GGAL");
    await act(async () => search().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(displayedTickers()).toHaveLength(Object.keys(defaultBook).length);
    expect(search().value).toBe("");
    expect(set).not.toHaveBeenCalled();
  });

  it("reveals a newly added instrument and an invalid instrument hidden by the filter", async () => {
    await edit(search(), "ZZZZ");
    await edit(container.querySelector<HTMLInputElement>("#new-instrument")!, "BONO");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Agregar instrumento"]')!.click());
    expect(search().value).toBe("");
    expect(displayedTickers()).toContain("BONO");
    expect(container.querySelector("#selected-instrument")?.textContent).toBe("BONO");
    await edit(quantity("Cantidad a mostrar del preset 1 de BONO"), "101");
    await edit(search(), "AL30");
    await act(async () => button("Guardar cambios").click());
    expect(search().value).toBe("");
    expect(container.querySelector("#selected-instrument")?.textContent).toBe("BONO");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("no puede ser mayor");
    expect(set).not.toHaveBeenCalled();
  });

  it("orders instruments alphabetically, including a new instrument, and preserves edits when switching", async () => {
    expect(displayedTickers()).toEqual(["AL30", "DLR", "GD30", "GFG", "GGAL", "PESOS", "QQQ", "SPY", "YPFD"]);
    await edit(quantity("Cantidad del preset 1 de AL30"), "234567");
    await edit(container.querySelector<HTMLInputElement>("#new-instrument")!, "BONO");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Agregar instrumento"]')!.click());
    expect(displayedTickers().slice(0, 3)).toEqual(["AL30", "BONO", "DLR"]);
    await act(async () => container.querySelector<HTMLButtonElement>(".instrument-list button")!.click());
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("234567");
    await act(async () => button("Guardar cambios").click());
    expect(set).toHaveBeenCalledTimes(1);
    const stored = set.mock.calls[0][0];
    expect(stored.InstrumentPresets.AL30[0]).toEqual({ cantidad: 234567, mostrar: 20000 });
    expect(Object.keys(stored.InstrumentPresets)).toEqual([...Object.keys(defaultBook), "BONO"]);
    expect(container.textContent).toContain("Cambios guardados");
  });

  it("selects an invalid instrument and blocks save even when editing another instrument", async () => {
    await edit(quantity("Cantidad a mostrar del preset 1 de AL30"), "300000");
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".instrument-list button")[1].click());
    await act(async () => button("Guardar cambios").click());
    expect(set).not.toHaveBeenCalled();
    expect(container.querySelector("#selected-instrument")?.textContent).toBe("AL30");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("no puede ser mayor");
  });

  it("retains edits after a failed save and allows retry", async () => {
    set.mockRejectedValueOnce(new Error("Storage unavailable"));
    await edit(quantity("Cantidad del preset 1 de AL30"), "250000");
    await act(async () => button("Guardar cambios").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("No se pudo guardar");
    expect(quantity("Cantidad del preset 1 de AL30").value).toBe("250000");
    expect(button("Guardar cambios").disabled).toBe(false);
    await act(async () => button("Guardar cambios").click());
    expect(set).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Cambios guardados");
  });
});
