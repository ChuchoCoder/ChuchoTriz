/// <reference types="chrome" />

import "./App.css";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { IInstrumentPreset } from "./InstrumentPresets";
import { label } from "./PresetBook";
import { PresetSession } from "./PresetSession";
import ToolbarIcon from "./ToolbarIcon";

const presetButtonClass = "ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar";

type PresetCapacity = { columns: number; rows: number; oversized: boolean[] };
type AutocompleteSaveStatus = "saving" | "error";

export interface InstrumentAutocompleteSettings {
  enabled(ticker: string): boolean | undefined;
  subscribe(listener: () => void): () => void;
  save(ticker: string, enabled: boolean): Promise<void>;
}

function App({ session, autocomplete, openPresets }: {
  session: PresetSession; autocomplete: InstrumentAutocompleteSettings;
  openPresets: (ticker: string, returnFocus: () => HTMLButtonElement | null) => void;
}) {
  const presets = useSyncExternalStore(session.subscribe, session.presets);
  const ticker = useSyncExternalStore(session.subscribe, session.ticker);
  const autocompleteEnabled = useSyncExternalStore(autocomplete.subscribe, () => autocomplete.enabled(ticker));
  const [saveStatuses, setSaveStatuses] = useState(() => new Map<string, AutocompleteSaveStatus>());
  const slot = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const labelRuler = useRef<HTMLButtonElement>(null);
  const overflowButton = useRef<HTMLButtonElement>(null);
  const lastMeasurement = useRef<PresetCapacity>(null);
  const focusBeforeLayout = useRef<HTMLElement>(null);
  const [capacity, setCapacity] = useState<PresetCapacity>();
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
      const ruler = labelRuler.current;
      const rulerStyle = ruler && getComputedStyle(ruler);
      const textWidth = ruler && rulerStyle ? ruler.getBoundingClientRect().width
        - parseFloat(rulerStyle.paddingLeft) - parseFloat(rulerStyle.paddingRight)
        - parseFloat(rulerStyle.borderLeftWidth) - parseFloat(rulerStyle.borderRightWidth) : 0;
      const oversized = ruler ? Array.from(ruler.children, label => label.getBoundingClientRect().width > textWidth) : [];
      const current = lastMeasurement.current;
      if (current?.columns === columns && current.rows === rows && current.oversized.length === oversized.length &&
        current.oversized.every((value, index) => value === oversized[index])) return;

      const focused = document.activeElement;
      if (focused instanceof HTMLElement && element.contains(focused)) focusBeforeLayout.current = focused;
      const next = { columns, rows, oversized };
      lastMeasurement.current = next;
      setCapacity(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [hasControls, presets]);

  useLayoutEffect(() => {
    const previous = focusBeforeLayout.current;
    focusBeforeLayout.current = null;
    if (!previous || previous.getClientRects().length || document.activeElement !== document.body) return;

    const visibleControls = Array.from(slot.current?.querySelectorAll<HTMLElement>("[data-preset-focus]") ?? [])
      .filter(control => control.getClientRects().length);
    const replacement = visibleControls.find(control => control.dataset.presetFocus === previous.dataset.presetFocus);
    (replacement ?? overflowButton.current ?? visibleControls[0])?.focus();
  }, [capacity]);

  const columns = capacity?.columns ?? Infinity;
  const rows = capacity?.rows ?? Infinity;
  const entries = presets.map((item, index) => ({ item, index }));
  const fitsInline = entries.filter(({ index }) => !capacity?.oversized[index]);
  const hasOversized = fitsInline.length < entries.length;
  const autocompleteAlongside = !!ticker && rows > 0 && fitsInline.length + 2 + Number(hasOversized) <= columns;
  const autocompleteAbove = !!ticker && !autocompleteAlongside && columns >= 2 && rows >= 2;
  const autocompleteCells = autocompleteAbove ? columns : autocompleteAlongside ? 2 : 0;
  const available = columns * rows - autocompleteCells;
  const menuAutocomplete = !!ticker && !autocompleteAlongside && !autocompleteAbove;
  const overflow = menuAutocomplete || hasOversized || fitsInline.length > available;
  const inlinePresets = fitsInline.slice(0, Math.max(0, available - Number(overflow)));
  const lastInline = inlinePresets.at(-1)?.index ?? -1;
  useEffect(() => {
    if (!overflow) setExpanded(false);
  }, [overflow]);

  if (!hasControls) return null;

  const saveAutocomplete = async (checked: boolean) => {
    const setStatus = (status?: AutocompleteSaveStatus) => setSaveStatuses(current => {
      const next = new Map(current);
      if (status) next.set(ticker, status);
      else next.delete(ticker);
      return next;
    });
    setStatus("saving");
    try {
      await autocomplete.save(ticker, checked);
      setStatus();
    } catch {
      setStatus("error");
    }
  };

  const saveStatus = saveStatuses.get(ticker);
  const settingsLabel = `Configurar cantidades rápidas de ${ticker}`;
  const presetControls = <div className="preset-panel-actions">
    <div className="instrument-autocomplete">
      <label title={`Autocompletar para ${ticker} al seleccionar: usa el último preset elegido o el primero configurado.`}>
        <input type="checkbox" checked={autocompleteEnabled ?? false} disabled={autocompleteEnabled === undefined || saveStatus === "saving"}
          data-preset-focus="autocomplete" aria-label={`Autocompletar para ${ticker}`}
          onChange={event => { void saveAutocomplete(event.target.checked); }} />
        <span>Autocompletar</span>
      </label>
      {saveStatus === "error" && <span role="alert">No se pudo guardar. Reintentá.</span>}
    </div>
    <button type="button" className="preset-settings-button" data-preset-focus="settings" aria-label={settingsLabel} title={settingsLabel}
      aria-controls="ct-free-settings-panel" onClick={event => {
        event.currentTarget.closest<HTMLElement>(".preset-panel:popover-open")?.hidePopover();
        openPresets(ticker, () => grid.current?.querySelector<HTMLButtonElement>(".preset-settings-button") ?? overflowButton.current);
      }}>
      <ToolbarIcon name="settings" />
    </button>
  </div>;

  const renderPreset = ({ item, index }: { item: IInstrumentPreset; index: number }) => (
    <button key={`${item.cantidad}/${item.mostrar}/${index}`} type="button" title={label(item)} data-preset-focus={`preset-${index}`}
      onClick={event => {
        event.currentTarget.closest<HTMLElement>(".preset-panel")?.hidePopover?.();
        session.choose(item);
      }}
      className={`${presetButtonClass} ButtonPreset`}>
      <span>{label(item)}</span>
    </button>
  );

  return <div className="preset-slot" ref={slot}>
    {presets.length > 0 && <button type="button" ref={labelRuler} className={`${presetButtonClass} preset-label-ruler`}
      aria-hidden="true" tabIndex={-1}>
      {presets.map((item, index) => <span key={index}>{label(item)}</span>)}
    </button>}
    <div className="preset-inline" ref={grid} data-autocomplete-row={autocompleteAbove || undefined}>
      {(autocompleteAlongside || autocompleteAbove) && presetControls}
      {inlinePresets.map(renderPreset)}
      {overflow && <button type="button" className="preset-overflow" data-preset-focus="overflow" ref={overflowButton} popoverTarget="chuchotriz-mini-presets"
        aria-controls="chuchotriz-mini-presets" aria-expanded={expanded}
        aria-label="Presets de cantidad" title="Más presets de cantidad">…</button>}
    </div>
    {overflow && <div className="preset-panel" id="chuchotriz-mini-presets" popover="auto"
      onToggle={event => setExpanded(event.newState === "open")}>
      {menuAutocomplete && presetControls}
      {entries.filter(({ index }) => index > lastInline || capacity?.oversized[index]).map(renderPreset)}
    </div>}
  </div>;
}

export default App;
