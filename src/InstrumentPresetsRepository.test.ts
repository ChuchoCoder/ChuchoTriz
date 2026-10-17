import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";
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

    expect(listener).toHaveBeenCalledWith({ book: defaultBook, autocompletar: true });
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
});
