import { defaultBook, PresetBook } from "./PresetBook";

const Key = "InstrumentPresets";
const InstrumentAutocompletePrefix = "AutocompleteInstrument:";

export interface StoredSettings {
  book: PresetBook;
  autocompleteByInstrument: Record<string, boolean | undefined>;
}

export const autocompleteFor = (settings: StoredSettings, ticker: string): boolean =>
  settings.autocompleteByInstrument[ticker] ?? false;

const saveInstrumentAutocomplete = async (ticker: string, enabled: boolean): Promise<void> => {
  await chrome.storage.local.set({ [InstrumentAutocompletePrefix + ticker]: enabled });
};

const bookFrom = (value: unknown): PresetBook => {
  return value ? value as PresetBook : defaultBook;
};

const read = async (): Promise<PresetBook> => {
  var storageValue = await chrome.storage.local.get(Key);
  return bookFrom(storageValue?.[Key]);
};

const save = async (presets: PresetBook): Promise<void> => {
  //console.log("Save presets " + JSON.stringify(presets));
  var allSettings = {
    InstrumentPresets: presets,
  };
  await chrome.storage.local.set(allSettings);
};

const readSettings = async (): Promise<StoredSettings> => {
  var storageValue = await chrome.storage.local.get(null);
  return {
    book: bookFrom(storageValue?.[Key]),
    autocompleteByInstrument: Object.fromEntries(Object.entries(storageValue).flatMap(([key, value]) =>
      key.startsWith(InstrumentAutocompletePrefix) && typeof value === "boolean"
        ? [[key.slice(InstrumentAutocompletePrefix.length), value]] : [])),
  };
};

// Avisa cada vez que se guarda algo en Opciones, sólo con lo que cambió; devuelve la función para dejar de escuchar
const watch = (listener: (change: Partial<StoredSettings>) => void): (() => void) => {
  const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== "local") {
      return;
    }
    const change: Partial<StoredSettings> = {};
    if (Key in changes) {
      change.book = bookFrom(changes[Key].newValue);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith(InstrumentAutocompletePrefix)) {
        change.autocompleteByInstrument ??= {};
        change.autocompleteByInstrument[key.slice(InstrumentAutocompletePrefix.length)] =
          typeof value.newValue === "boolean" ? value.newValue : undefined;
      }
    }
    if (Object.keys(change).length > 0) {
      listener(change);
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
};

export default {
  read,
  save,
  saveInstrumentAutocomplete,
  readSettings,
  watch,
};
