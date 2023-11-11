import { IInstrumentPresets } from "./InstrumentPresets";

const Key = "InstrumentPresets";

const DefaultPresets: IInstrumentPresets = {
  AL30: [
    { cantidad: 200000, mostrar: 20000 },
    { cantidad: 100000, mostrar: 10000 },
    { cantidad: 50000, mostrar: 5000 },
  ],
  GD30: [{ cantidad: 200000, mostrar: 10000 }],
  SPY: [{ cantidad: 100, mostrar: 10 }],
  QQQ: [{ cantidad: 100, mostrar: 10 }],
  INTC: [{ cantidad: 100, mostrar: 10 }],
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
  console.log(presets);
  var allSettings = {
    InstrumentPresets: presets,
  };
  await chrome.storage.local.set(allSettings);
};

export default {
  read,
  save,
  DefaultPresets,
};
