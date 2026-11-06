import React from "react";
import { createRoot, Root } from "react-dom/client";
import "./main.css";
import App from "./App";
import { IInstrumentPreset } from "./InstrumentPresets";
import { bindMiniOrderForm, focusCantidadAfterQuoteClick, observeMiniOrderForm } from "./Matriz";
import { createPresetSession } from "./PresetSession";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";
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
instrumentPresetsRepository.watch((change) => {
  storedSettings = storedSettings.then((current) => ({ ...current, ...change }));
});

const presetSettings = {
  presetsFor: async (ticker: string) => presetsFor((await storedSettings).book, ticker),
  autocompletar: async () => (await storedSettings).autocompletar,
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
  if (!buttons || panel) return;
  void active.session.refresh();

  const container = document.createElement("div");
  container.id = "root-chuchotriz";
  // Matriz puede reconstruir el bloque copiando su contenido, incluido un panel sin listeners.
  buttons.querySelectorAll(":scope > #root-chuchotriz").forEach(stale => stale.remove());
  buttons.append(container);
  const root = createRoot(container);
  panel = { buttons, container, root };
  root.render(
    <React.StrictMode><App session={active.session} /></React.StrictMode>
  );
});
