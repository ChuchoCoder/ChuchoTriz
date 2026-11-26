/// <reference types="chrome" />

import "./App.css";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { IInstrumentPreset } from "./InstrumentPresets";
import { label } from "./PresetBook";
import { PresetSession } from "./PresetSession";
import ToolbarIcon from "./ToolbarIcon";

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

function App({ session, autocomplete, openPresets }: {
  session: PresetSession; autocomplete: InstrumentAutocompleteSettings;
  openPresets: (ticker: string, returnFocus: () => HTMLButtonElement | null) => void;
}) {
  const presets = useSyncExternalStore(session.subscribe, session.presets);
  const ticker = useSyncExternalStore(session.subscribe, session.ticker);
  const slot = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const overflowButton = useRef<HTMLButtonElement>(null);
  const [capacity, setCapacity] = useState<{ columns: number; rows: number }>();
  const [expanded, setExpanded] = useState(false);
  const hasControls = !!ticker || presets.length > 0;

  useLayoutEffect(() => {
    const element = slot.current;
    const inline = grid.current;
    if (!element || !inline) return;

    const measure = () => {
      const style = getComputedStyle(inline);
      const cellWidth = parseFloat(style.getPropertyValue("--chuchotriz-preset-width"));
      const cellHeight = parseFloat(style.gridAutoRows);
      if (!cellWidth || !cellHeight) return;
      const { width, height } = element.getBoundingClientRect();
      const columnGap = parseFloat(style.columnGap);
      const rowGap = parseFloat(style.rowGap);
      const columns = Math.floor((width + columnGap) / (cellWidth + columnGap));
      const rows = Math.floor((height + rowGap) / (cellHeight + rowGap));
      setCapacity(current => current?.columns === columns && current.rows === rows ? current : { columns, rows });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasControls]);

  const columns = capacity?.columns ?? Infinity;
  const rows = capacity?.rows ?? Infinity;
  const autocompleteAlongside = !!ticker && rows > 0 && presets.length + 2 <= columns;
  const autocompleteAbove = !!ticker && !autocompleteAlongside && columns >= 2 && rows >= 2;
  const autocompleteCells = autocompleteAbove ? columns : autocompleteAlongside ? 2 : 0;
  const available = columns * rows - autocompleteCells;
  const menuAutocomplete = !!ticker && !autocompleteAlongside && !autocompleteAbove;
  const overflow = menuAutocomplete || presets.length > available;
  const inlineCount = Math.min(presets.length, Math.max(0, available - Number(overflow)));
  useEffect(() => {
    if (!overflow) setExpanded(false);
  }, [overflow]);

  if (!hasControls) return null;

  const settingsLabel = `Configurar cantidades rápidas de ${ticker}`;
  const presetControls = <div className="preset-panel-actions">
    <AutocompleteCheckbox key={ticker} ticker={ticker} settings={autocomplete} />
    <button type="button" className="preset-settings-button" aria-label={settingsLabel} title={settingsLabel}
      aria-controls="ct-free-settings-panel" onClick={event => {
        event.currentTarget.closest<HTMLElement>(".preset-panel:popover-open")?.hidePopover();
        openPresets(ticker, () => grid.current?.querySelector<HTMLButtonElement>(".preset-settings-button") ?? overflowButton.current);
      }}>
      <ToolbarIcon name="settings" />
    </button>
  </div>;

  const renderPreset = (item: IInstrumentPreset, index: number) => (
    <button key={`${item.cantidad}/${item.mostrar}/${index}`} type="button" title={label(item)}
      onClick={event => {
        event.currentTarget.closest<HTMLElement>(".preset-panel")?.hidePopover?.();
        session.choose(item);
      }}
      className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset">
      <span>{label(item)}</span>
    </button>
  );

  return <div className="preset-slot" ref={slot}>
    <div className="preset-inline" ref={grid} data-autocomplete-row={autocompleteAbove || undefined}>
      {(autocompleteAlongside || autocompleteAbove) && presetControls}
      {presets.slice(0, inlineCount).map(renderPreset)}
      {overflow && <button type="button" className="preset-overflow" ref={overflowButton} popoverTarget="chuchotriz-mini-presets"
        aria-controls="chuchotriz-mini-presets" aria-expanded={expanded}
        aria-label="Presets de cantidad" title="Más presets de cantidad">…</button>}
    </div>
    {overflow && <div className="preset-panel" id="chuchotriz-mini-presets" popover="auto"
      onToggle={event => setExpanded(event.newState === "open")}>
      {menuAutocomplete && presetControls}
      {presets.slice(inlineCount).map((item, index) => renderPreset(item, inlineCount + index))}
    </div>}
  </div>;
}

export default App;
