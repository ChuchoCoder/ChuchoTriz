import { defaultBook, PresetBook } from "./PresetBook";

const Key = "InstrumentPresets";
const AutocompleteKey = "Autocomplete";

const DefaultAutocomplete = true;

// Lo que Opciones guarda: el Preset book y si Autocompletar está activado
export interface StoredSettings {
  book: PresetBook;
  autocompletar: boolean;
}

const bookFrom = (value: unknown): PresetBook => {
  return value ? value as PresetBook : defaultBook;
};

// En una instalación nueva get() devuelve {} y el valor es undefined
const autocompleteFrom = (value: unknown): boolean => {
  return typeof value === "boolean" ? value : DefaultAutocomplete;
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

const readAutocomplete = async (): Promise<boolean> => {
  var storageValue = await chrome.storage.local.get(AutocompleteKey);
  return autocompleteFrom(storageValue?.[AutocompleteKey]);
};

const saveAutocomplete = async (autocomplete: boolean): Promise<void> => {
  //console.log("Save autocomplete " + autocomplete);
  var allSettings = {
    Autocomplete: autocomplete,
  };
  await chrome.storage.local.set(allSettings);
};

const readSettings = async (): Promise<StoredSettings> => {
  var storageValue = await chrome.storage.local.get([Key, AutocompleteKey]);
  return {
    book: bookFrom(storageValue?.[Key]),
    autocompletar: autocompleteFrom(storageValue?.[AutocompleteKey]),
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
    if (AutocompleteKey in changes) {
      change.autocompletar = autocompleteFrom(changes[AutocompleteKey].newValue);
    }
    if (Object.keys(change).length > 0) {
      listener(change);
    }
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
};

const saveSettings = async (presets: PresetBook, autocomplete: boolean): Promise<void> => {
  await chrome.storage.local.set({ InstrumentPresets: presets, Autocomplete: autocomplete });
};

export default {
  read,
  save,
  readAutocomplete,
  saveAutocomplete,
  saveSettings,
  readSettings,
  watch,
  DefaultAutocomplete
};
