import React from "react";
import { createRoot, Root } from "react-dom/client";
import "./main.css";
import App, { InstrumentAutocompleteSettings } from "./App";
import { IInstrumentPreset } from "./InstrumentPresets";
import { bindMiniOrderForm, focusCantidadAfterQuoteClick, observeMiniOrderForm } from "./Matriz";
import { createPresetSession } from "./PresetSession";
import instrumentPresetsRepository, { autocompleteFor, StoredSettings } from "./InstrumentPresetsRepository";
import { presetsFor } from "./PresetBook";
import { SettingsMenu } from "./SettingsMenu";

focusCantidadAfterQuoteClick();

// Settings remain accessible independently of the order form.
const settingsContainer = document.createElement("div");
settingsContainer.id = "root-chuchotriz-settings";
document.body.append(settingsContainer);
createRoot(settingsContainer).render(<React.StrictMode><SettingsMenu /></React.StrictMode>);

// Read once; subsequent settings changes arrive through Chrome Storage.
let storedSettings = instrumentPresetsRepository.readSettings();
let snapshot: StoredSettings | undefined;
const settingsListeners = new Set<() => void>();
const publishSettings = (settings: StoredSettings) => {
  const ticker = active?.session.ticker();
  if (snapshot && ticker && autocompleteFor(snapshot, ticker) !== autocompleteFor(settings, ticker)) {
    active?.session.invalidateAutocomplete();
  }
  snapshot = settings;
  settingsListeners.forEach(listener => listener());
};
const updateSettings = (change: Partial<StoredSettings>) => {
  storedSettings = storedSettings.then(current => ({ ...current, ...change,
    autocompleteByInstrument: { ...current.autocompleteByInstrument, ...change.autocompleteByInstrument } }));
  void storedSettings.then(publishSettings).catch(console.error);
};
void storedSettings.then(publishSettings).catch(console.error);
instrumentPresetsRepository.watch(updateSettings);
const autocomplete: InstrumentAutocompleteSettings = {
  enabled: ticker => snapshot ? autocompleteFor(snapshot, ticker) : undefined,
  subscribe: listener => { settingsListeners.add(listener); return () => { settingsListeners.delete(listener); }; },
  save: instrumentPresetsRepository.saveInstrumentAutocomplete,
};

const presetSettings = {
  presetsFor: async (ticker: string) => presetsFor((await storedSettings).book, ticker),
  autocompletar: async (ticker: string) => autocompleteFor(await storedSettings, ticker),
};
const lastUsedPresets = new Map<string, IInstrumentPreset>();
let active: {
  form: HTMLElement;
  adapter: ReturnType<typeof bindMiniOrderForm>;
  session: ReturnType<typeof createPresetSession>;
} | undefined;
let panel: { buttons: HTMLElement; container: HTMLElement; root: Root } | undefined;

observeMiniOrderForm((form, buttons) => {
  if (active && active.form !== form) {
    active.session.dispose();
    active.adapter.dispose();
    active = undefined;
  }
  if (panel && (!active || panel.buttons !== buttons || panel.container.parentElement !== buttons)) {
    panel.root.unmount();
    panel.container.remove();
    panel = undefined;
  }
  if (!form) return;

  // Reemplazar el bloque de botones conserva la sesión del mismo formulario.
  if (!active) {
    const adapter = bindMiniOrderForm(form);
    const session = createPresetSession(adapter, presetSettings, lastUsedPresets);
    active = { form, adapter, session };
  }
  void active.session.refresh();
  if (!buttons || panel) return;

  const container = document.createElement("div");
  container.id = "root-chuchotriz";
  // Matriz puede reconstruir el bloque copiando su contenido, incluido un panel sin listeners.
  buttons.querySelectorAll(":scope > #root-chuchotriz").forEach(stale => stale.remove());
  buttons.append(container);
  const root = createRoot(container);
  panel = { buttons, container, root };
  root.render(
    <React.StrictMode><App session={active.session} autocomplete={autocomplete} /></React.StrictMode>
  );
});
