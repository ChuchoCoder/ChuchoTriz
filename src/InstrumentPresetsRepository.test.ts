import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import instrumentPresetsRepository, { autocompleteFor } from "./InstrumentPresetsRepository";
import { defaultBook } from "./PresetBook";

type OnChanged = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void;

describe("InstrumentPresetsRepository.watch", () => {
  let listeners: Set<OnChanged>;
  const emit = (changes: { [key: string]: chrome.storage.StorageChange }, areaName = "local") =>
    listeners.forEach((listener) => listener(changes, areaName));

  beforeEach(() => {
    listeners = new Set();
    vi.stubGlobal("chrome", {
      storage: {
        onChanged: {
          addListener: (listener: OnChanged) => listeners.add(listener),
          removeListener: (listener: OnChanged) => listeners.delete(listener),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports only the settings that changed in Opciones", () => {
    const listener = vi.fn();
    instrumentPresetsRepository.watch(listener);

    const book = { AL30: [{ cantidad: 1000, mostrar: 100 }] };
    emit({ InstrumentPresets: { newValue: book } });
    emit({ Autocomplete: { oldValue: true, newValue: false } });

    expect(listener).toHaveBeenNthCalledWith(1, { book });
    expect(listener).toHaveBeenNthCalledWith(2, { autocompletar: false });
  });

  it("falls back to the defaults when a setting is removed", () => {
    const listener = vi.fn();
    instrumentPresetsRepository.watch(listener);

    emit({ InstrumentPresets: { oldValue: {} }, Autocomplete: { oldValue: false } });

    expect(listener).toHaveBeenCalledWith({ book: defaultBook, autocompletar: false });
  });

  it("ignores other keys and other storage areas", () => {
    const listener = vi.fn();
    instrumentPresetsRepository.watch(listener);

    emit({ Other: { newValue: 1 } });
    emit({ Autocomplete: { newValue: false } }, "sync");

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops reporting once unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = instrumentPresetsRepository.watch(listener);

    unsubscribe();
    emit({ Autocomplete: { newValue: false } });

    expect(listener).not.toHaveBeenCalled();
  });

  it("defaults to off, preserves an explicit global choice and reads independent ticker choices", async () => {
    const get = vi.fn().mockResolvedValue({});
    vi.stubGlobal("chrome", { storage: { local: { get } } });
    expect(await instrumentPresetsRepository.readAutocomplete()).toBe(false);
    expect(await instrumentPresetsRepository.readSettings()).toEqual({
      book: defaultBook, autocompletar: false, autocompleteByInstrument: {},
    });
    get.mockResolvedValue({ Autocomplete: true, "AutocompleteInstrument:AL30": false,
      "AutocompleteInstrument:GD30": true, "AutocompleteInstrument:GGAL": "invalid" });
    const settings = await instrumentPresetsRepository.readSettings();
    expect(autocompleteFor(settings, "AL30")).toBe(false);
    expect(autocompleteFor(settings, "GD30")).toBe(true);
    expect(autocompleteFor(settings, "GGAL")).toBe(true);
    expect(autocompleteFor(settings, "AL30D")).toBe(true);
    expect(settings.autocompleteByInstrument).toEqual({ AL30: false, GD30: true });
  });

  it("writes only the selected ticker, and reports external changes and removals", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    Object.assign(chrome.storage, { local: { set } });
    const listener = vi.fn();
    instrumentPresetsRepository.watch(listener);
    await instrumentPresetsRepository.saveInstrumentAutocomplete("AL30", true);
    expect(set).toHaveBeenCalledWith({ "AutocompleteInstrument:AL30": true });
    emit({ "AutocompleteInstrument:AL30": { newValue: false }, "AutocompleteInstrument:GD30": { newValue: true } });
    expect(listener).toHaveBeenLastCalledWith({ autocompleteByInstrument: { AL30: false, GD30: true } });
    emit({ "AutocompleteInstrument:AL30": { oldValue: false } });
    expect(listener).toHaveBeenLastCalledWith({ autocompleteByInstrument: { AL30: undefined } });
  });
});
