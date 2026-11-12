/// <reference types="chrome" />

import "./App.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { label } from "./PresetBook";
import { PresetSession } from "./PresetSession";

export interface InstrumentAutocompleteSettings {
  enabled(ticker: string): boolean | undefined;
  subscribe(listener: () => void): () => void;
  save(ticker: string, enabled: boolean): Promise<void>;
}

function AutocompleteCheckbox({ ticker, settings }: { ticker: string; settings: InstrumentAutocompleteSettings }) {
  const enabled = useSyncExternalStore(settings.subscribe, () => settings.enabled(ticker));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async (checked: boolean) => {
    setSaving(true); setError(false);
    try { await settings.save(ticker, checked); }
    catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <div className="instrument-autocomplete">
    <label title={`Autocompletar para ${ticker} al seleccionar: usa el último preset elegido o el primero configurado.`}>
      <input type="checkbox" checked={enabled ?? false} disabled={enabled === undefined || saving}
        aria-label={`Autocompletar para ${ticker}`} onChange={event => { void save(event.target.checked); }} />
      <span>Autocompletar</span>
    </label>
    {error && <span role="alert">No se pudo guardar. Reintentá.</span>}
  </div>;
}

function App({ session, autocomplete }: { session: PresetSession; autocomplete: InstrumentAutocompleteSettings }) {
  const presets = useSyncExternalStore(session.subscribe, session.presets);
  const ticker = useSyncExternalStore(session.subscribe, session.ticker);

  return <div className="preset-panel">
    {ticker && <AutocompleteCheckbox key={ticker} ticker={ticker} settings={autocomplete} />}
    {presets.length > 0 && (
    <div className="DefaultSizeShowButtons">
      {presets.map((item, index) => (
        <button
          key={`${item.cantidad}/${item.mostrar}/${index}`}
          type="button"
          onClick={() => session.choose(item)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>
            {label(item)}
          </span>
        </button>
      ))}
    </div>
    )}
  </div>;
}

export default App;
