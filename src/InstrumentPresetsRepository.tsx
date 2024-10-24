import { IInstrumentPresets, IInstrumentPreset } from "./InstrumentPresets";

const Key = "InstrumentPresets";
const AutocompleteKey = "Autocomplete";

const DefaultAutocomplete = true;
const defaultInstrumentPresets = [{ cantidad: 10000, mostrar: 2500 }, { cantidad: 5000, mostrar: 2500 }, { cantidad: 1000, mostrar: 250 }, { cantidad: 100, mostrar: 25 }];
const DefaultPresets: IInstrumentPresets = {
  AL30: [
    { cantidad: 200000, mostrar: 20000 },
    { cantidad: 100000, mostrar: 10000 },
    { cantidad: 50000, mostrar: 5000 },
  ],
  GD30: [{ cantidad: 200000, mostrar: 100000 }, { cantidad: 100000, mostrar: 50000 }],
  GGAL: [{ cantidad: 5000, mostrar: 1000 }, { cantidad: 1000, mostrar: 500 }],
  YPFD: [{ cantidad: 2000, mostrar: 500 }],
  SPY: [{ cantidad: 100, mostrar: 10 }],
  QQQ: [{ cantidad: 100, mostrar: 10 }],
  "DLR/MAR25": [{ cantidad: 100, mostrar: 10 }],
  PESOS: [{ cantidad: 100000000, mostrar: 0 }, { cantidad: 10000000, mostrar: 0 }, { cantidad: 1000000, mostrar: 0 }, { cantidad: 100000, mostrar: 0 }],
};

const getInstrumentPresets = async (instrument: string): Promise<IInstrumentPreset[]> => {
  const instrumentPresets = await read();

  if (instrumentPresets && instrumentPresets[instrument]) {
    var preset = instrumentPresets[instrument];
    return preset;
  }
  return defaultInstrumentPresets;
};

const read = async (): Promise<IInstrumentPresets> => {
  var storageValue = await chrome.storage.local.get(Key);

  if (storageValue && storageValue[Key]) {
    var presets = storageValue[Key];
    return presets;
  }
  return DefaultPresets;
};

const save = async (presets: IInstrumentPresets): Promise<void> => {
  //console.log("Save presets " + JSON.stringify(presets));
  var allSettings = {
    InstrumentPresets: presets,
  };
  await chrome.storage.local.set(allSettings);
};

const readAutocomplete = async (): Promise<boolean> => {
  var storageValue = await chrome.storage.local.get(AutocompleteKey);
  let autocomplete = DefaultAutocomplete;
  if (storageValue) {
    autocomplete = storageValue[AutocompleteKey];
  }
  return autocomplete;
};

const saveAutocomplete = async (autocomplete: boolean): Promise<void> => {
  //console.log("Save autocomplete " + autocomplete);
  var allSettings = {
    Autocomplete: autocomplete,
  };
  await chrome.storage.local.set(allSettings);
};

export default {
  read,
  save,
  readAutocomplete,
  saveAutocomplete,
  getInstrumentPresets,
  DefaultPresets,
  DefaultAutocomplete
};
