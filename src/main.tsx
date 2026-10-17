import React from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import App from "./App";
import { miniOrderForm } from "./Matriz";
import { createPresetSession } from "./PresetSession";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";
import { presetsFor } from "./PresetBook";
import { SettingsMenu } from "./SettingsMenu";

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

function mountPresets() {
  const buttons = document.querySelector("#MiniOrderForm > div.MiniOrderForm_buttonsBlock");
  if (!buttons) return false;

  const container = document.createElement("div");
  container.id = "root-chuchotriz";
  buttons.append(container);
  const session = createPresetSession(miniOrderForm, {
    presetsFor: async (ticker) => presetsFor((await storedSettings).book, ticker),
    autocompletar: async () => (await storedSettings).autocompletar,
  });
  createRoot(container).render(
    <React.StrictMode><App session={session} /></React.StrictMode>
  );
  return true;
}

if (!mountPresets()) {
  const observer = new MutationObserver(() => {
    if (mountPresets()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
