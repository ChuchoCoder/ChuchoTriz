import React from "react";
import { createRoot, Root } from "react-dom/client";
import "./main.css";
import App, { InstrumentAutocompleteSettings } from "./App";
import { IInstrumentPreset } from "./InstrumentPresets";
import { bindMiniOrderForm, focusCantidadAfterQuoteClick, observeMiniOrderForm } from "./Matriz";
import { createPresetSession } from "./PresetSession";
import instrumentPresetsRepository, { autocompleteFor, StoredSettings } from "./InstrumentPresetsRepository";
import { presetTickerFor, presetsFor } from "./PresetBook";
import { SettingsMenu, type PresetSettingsRequest } from "./SettingsMenu";
import RatiosDashboard from "./ratios/RatiosDashboard";
import RatioChart from "./ratios/RatioChart";
import BookIntraday from "./BookIntraday";

focusCantidadAfterQuoteClick();

const draftReady = typeof chrome.runtime?.getURL === "function" ? new Promise<void>(resolve => {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("mini-order-draft.js");
  script.onload = script.onerror = () => {
    script.remove();
    resolve();
  };
  document.documentElement.append(script);
}) : Promise.resolve();

if (typeof chrome.runtime?.getURL === "function") {
  const key = "TicketPositionVisible";
  const root = document.documentElement;
  let revision = 0;
  const publish = (value: unknown) => {
    revision++;
    root.dataset.ctTicketPositionVisible = String(value !== false);
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[key]) publish(changes[key].newValue);
  });
  const initial = revision;
  void chrome.storage.local.get(key).then(
    values => { if (revision === initial) publish(values[key]); },
    () => { if (revision === initial) publish(true); },
  ).then(() => {
    const position = document.createElement("script");
    position.src = chrome.runtime.getURL("ticket-position.js");
    position.onload = position.onerror = () => position.remove();
    root.append(position);
  });

  document.addEventListener("click", event => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLButtonElement>("button.ct-ticket-position-close, button.ct-ticket-position-show");
    if (!control || control.hidden || !control.closest("#MiniOrderForm")) return;
    const visible = control.classList.contains("ct-ticket-position-show");
    const before = revision;
    const apply = () => { if (revision === before) publish(visible); };
    void chrome.storage.local.set({ [key]: visible }).then(apply, apply);
  }, true);
}

// Settings remain accessible independently of the order form.
const settingsContainer = document.createElement("div");
settingsContainer.id = "root-chuchotriz-settings";
document.body.append(settingsContainer);
const settingsRoot = createRoot(settingsContainer);
function renderSettings(presetRequest?: PresetSettingsRequest) {
  settingsRoot.render(<React.StrictMode>
    <SettingsMenu presetRequest={presetRequest} />
    <RatiosDashboard />
    <RatioChart />
    <BookIntraday />
  </React.StrictMode>);
}
renderSettings();

function openPresets(ticker: string, returnFocus: PresetSettingsRequest["returnFocus"]) {
  const sourceTicker = snapshot && presetTickerFor(snapshot.book, ticker);
  renderSettings({ ticker, sourceTicker, returnFocus });
}
// Read once. Publish presets after the draft adapter has had a chance to register.
let storedSettings = Promise.all([instrumentPresetsRepository.readSettings(), draftReady]).then(([settings]) => settings);
let snapshot: StoredSettings | undefined;
const settingsListeners = new Set<() => void>();
const publishSettings = (settings: StoredSettings) => {
  const session = active?.session;
  const previous = snapshot;
  snapshot = settings;
  const ticker = session?.ticker();
  if (previous && previous.book !== settings.book) {
    void session?.reloadPresets(settings.book);
  } else if (previous && ticker && autocompleteFor(previous, ticker) !== autocompleteFor(settings, ticker)) {
    session?.invalidateAutocomplete();
  }
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
    <React.StrictMode><App session={active.session} autocomplete={autocomplete} openPresets={openPresets} /></React.StrictMode>
  );
});
