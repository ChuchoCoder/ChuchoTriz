import { FormEvent, useEffect, useRef, useState } from "react";
import { IInstrumentPresets } from "./InstrumentPresets";
import repository, { StoredSettings } from "./InstrumentPresetsRepository";
import { defaultBook, label, parse } from "./PresetBook";
import { DraftPreset, DraftPresets, PresetValidationError, serializePresets, toDraft } from "./InstrumentPresetsSettings";
import "./Options.css";
function sortTickers(presets: DraftPresets): string[] {
  return Object.keys(presets).sort((a, b) => a.localeCompare(b, "es"));
}
const previewLabel = (preset: DraftPreset) => /^\d+$/.test(preset.cantidad) && /^\d+$/.test(preset.mostrar)
  ? label({ cantidad: Number(preset.cantidad), mostrar: Number(preset.mostrar) }) : "—";
type EditorSettings = { presets: DraftPresets; autocomplete: boolean };
const toEditorSettings = (settings: StoredSettings): EditorSettings => ({ presets: toDraft(settings.book), autocomplete: settings.autocompletar });
const sameSettings = (a: EditorSettings, b: EditorSettings) => JSON.stringify(a) === JSON.stringify(b);
const conflictMessage = "Las preferencias cambiaron en otra vista. Tu borrador se conserva. Descartá los cambios para cargar lo guardado antes de volver a guardar.";

function InstrumentPresetsOptions({ embedded = false }: { embedded?: boolean }) {
  const [presets, setPresets] = useState<DraftPresets>({});
  const [selected, setSelected] = useState("");
  const [autocomplete, setAutocomplete] = useState(true);
  const [newTicker, setNewTicker] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const presetRows = useRef<HTMLDivElement>(null);
  const moveFocus = useRef<{ index: number; direction: "up" | "down" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const saved = useRef<EditorSettings>({ presets: {}, autocomplete: true });
  const dirty = useRef(false);
  const conflicted = useRef(false);
  const pendingSave = useRef<EditorSettings | null>(null);
  const loadingSettings = useRef(true);
  const loadingChanges = useRef<Partial<StoredSettings>>({});
  const tickers = sortTickers(presets);
  const query = tickerQuery.trim().toUpperCase();
  const filteredTickers = tickers.filter(ticker => ticker.toUpperCase().includes(query));
  const values = presets[selected] ?? [];

  function receiveSettings(next: EditorSettings) {
    if (sameSettings(next, saved.current)) return;
    saved.current = next;
    // Chrome also notifies this editor about its own write.
    if (pendingSave.current && sameSettings(next, pendingSave.current)) return;
    if (dirty.current || pendingSave.current) {
      conflicted.current = true; setConflict(true); setError(conflictMessage); setStatus("");
      return;
    }
    setPresets(next.presets); setAutocomplete(next.autocomplete);
    setSelected(current => Object.hasOwn(next.presets, current) ? current : sortTickers(next.presets)[0] ?? "");
    setStatus("Preferencias actualizadas");
  }

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    setError("");
    loadingSettings.current = true;
    loadingChanges.current = {};
    try {
      const settings = { ...await repository.readSettings(), ...loadingChanges.current };
      const draft = toDraft(settings.book);
      const enabled = settings.autocompletar;
      saved.current = { presets: draft, autocomplete: enabled };
      dirty.current = false; conflicted.current = false; setConflict(false);
      setPresets(draft);
      setAutocomplete(enabled);
      setSelected(sortTickers(draft)[0] ?? "");
    } catch {
      setLoadFailed(true);
      setError("No se pudo cargar la configuración. Reintentá antes de editar.");
    } finally { loadingSettings.current = false; setLoading(false); }
  }
  useEffect(() => {
    const stop = repository.watch(change => {
      if (loadingSettings.current) { loadingChanges.current = { ...loadingChanges.current, ...change }; return; }
      receiveSettings({ presets: change.book ? toDraft(change.book) : saved.current.presets,
        autocomplete: change.autocompletar ?? saved.current.autocomplete });
    });
    void load();
    return stop;
  }, []);
  useEffect(() => {
    const target = moveFocus.current;
    if (!target) return;
    moveFocus.current = null;
    presetRows.current?.children[target.index]
      ?.querySelector<HTMLButtonElement>(`button[data-direction="${target.direction}"]`)?.focus();
  }, [presets]);

  function markChanged() { dirty.current = true; setError(conflicted.current ? conflictMessage : ""); setStatus("Cambios sin guardar"); }
  function updatePreset(index: number, field: keyof DraftPreset, value: string) {
    setPresets(previous => ({ ...previous,
      [selected]: previous[selected].map((preset, i) => i === index ? { ...preset, [field]: value } : preset),
    }));
    markChanged();
  }
  function movePreset(index: number, step: -1 | 1) {
    const destination = index + step;
    if (destination < 0 || destination >= values.length) return;
    setPresets(previous => {
      const reordered = [...previous[selected]];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return { ...previous, [selected]: reordered };
    });
    moveFocus.current = { index: destination,
      direction: destination === 0 ? "down" : destination === values.length - 1 ? "up" : step === -1 ? "up" : "down" };
    markChanged();
  }
  function addInstrument() {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker || /\s/.test(ticker)) {
      setError("Ingresá un instrumento sin espacios, por ejemplo AL30 o GGAL."); return;
    }
    if (tickers.some(existing => existing.toUpperCase() === ticker)) {
      setError("Ese instrumento ya está configurado."); return;
    }
    const { errors } = parse(`${ticker} 100`);
    if (errors.length > 0) { setError(errors[0].message); return; }
    setPresets(previous => ({ ...previous, [ticker]: [{ cantidad: "100", mostrar: "0" }] }));
    setSelected(ticker); setNewTicker(""); setTickerQuery(""); markChanged();
  }
  function removeInstrument() {
    const remaining = { ...presets };
    delete remaining[selected];
    const remainingTickers = sortTickers(remaining);
    setPresets(remaining);
    setSelected(remainingTickers.find(ticker => ticker.toUpperCase().includes(query)) ?? remainingTickers[0] ?? "");
    markChanged();
  }
  function restoreDefaults() {
    const defaults = toDraft(defaultBook);
    setPresets(defaults); setSelected(sortTickers(defaults)[0] ?? "");
    setAutocomplete(repository.DefaultAutocomplete); setNewTicker(""); setTickerQuery(""); markChanged();
    setStatus("Valores por defecto cargados. Guardá para aplicarlos.");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (conflicted.current) { setError(conflictMessage); return; }
    setError("");
    let parsed: IInstrumentPresets;
    try { parsed = serializePresets(presets); }
    catch (error) {
      if (error instanceof PresetValidationError) { setTickerQuery(""); setSelected(error.ticker); setError(error.message); }
      else { setError("No se pudieron interpretar los presets. Revisá las cantidades."); }
      return;
    }
    setSaving(true); setStatus("Guardando…");
    const candidate = { presets: toDraft(parsed), autocomplete };
    pendingSave.current = candidate;
    try {
      // Re-read as well: a storage notification may still be queued.
      const latest = toEditorSettings(await repository.readSettings());
      if (!sameSettings(latest, saved.current)) {
        receiveSettings(latest);
        return;
      }
      if (conflicted.current) return;
      await repository.saveSettings(parsed, autocomplete);
      if (!conflicted.current) {
        saved.current = candidate; setPresets(candidate.presets); dirty.current = false; setStatus("Cambios guardados");
      }
    } catch {
      setStatus(""); setError("No se pudo guardar la configuración. Tus cambios siguen disponibles para reintentar.");
    } finally { pendingSave.current = null; setSaving(false); }
  }
  function cancel() {
    dirty.current = false; conflicted.current = false; setConflict(false);
    setPresets(saved.current.presets); setAutocomplete(saved.current.autocomplete);
    setSelected(sortTickers(saved.current.presets)[0] ?? ""); setNewTicker(""); setTickerQuery(""); setError("");
    setStatus("Cambios descartados");
    if (!embedded) window.close();
  }

  const feedback = <div className="options-feedback">
    {error && <p role="alert" className="options-error">{error}</p>}<p role="status">{status}</p>
  </div>;

  return (
    <form className={`options-window${embedded ? " options-embedded" : ""}`} onSubmit={save}
      onKeyDown={event => event.stopPropagation()} noValidate aria-busy={loading || saving}>
      {!embedded && <header className="options-brand">
        <img src="/gear48.png" width="20" height="20" alt="" />
        <strong>ChuchoTriz</strong><span>Preferencias</span>
      </header>}
      <div className="options-content">
        {!embedded && <div className="options-heading"><h1>Configuración</h1><p>Personalizá las cantidades rápidas para tus instrumentos.</p></div>}
        {loading && <p role="status">Cargando configuración…</p>}
        {loadFailed && <button type="button" onClick={() => void load()}>Reintentar carga</button>}
        <fieldset disabled={loading || saving || loadFailed} className="options-fields">
          <div className="instrument-layout">
            <aside className="instrument-sidebar">
              <div className="instrument-browser-heading">
                <h2 className="section-label">Instrumentos</h2>
                <div className="instrument-search">
                  <input ref={searchInput} type="text" role="searchbox" aria-label="Buscar instrumento por ticker"
                    placeholder="Buscar ticker" autoComplete="off" spellCheck={false} value={tickerQuery}
                    onChange={event => setTickerQuery(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (filteredTickers.length > 0) setSelected(filteredTickers[0]);
                      } else if (event.key === "Escape") {
                        event.preventDefault(); setTickerQuery("");
                      }
                    }} />
                  <button type="button" aria-label="Limpiar búsqueda" disabled={!tickerQuery}
                    onClick={() => { setTickerQuery(""); searchInput.current?.focus(); }}>×</button>
                </div>
              </div>
              <nav className="instrument-list" aria-label="Instrumentos configurados" tabIndex={embedded ? 0 : undefined}>
                {filteredTickers.map(ticker => <button key={ticker} type="button" aria-current={ticker === selected ? "true" : undefined}
                  onClick={() => setSelected(ticker)}><span>{ticker}</span>
                  <small aria-label={`${presets[ticker].length} presets`}>{presets[ticker].length}</small></button>)}
                {filteredTickers.length === 0 && query && <p className="instrument-search-empty" role="status">Sin coincidencias</p>}
              </nav>
              <div className="add-instrument">
                <label htmlFor="new-instrument">Nuevo instrumento</label>
                <div><input id="new-instrument" type="text" value={newTicker} placeholder="Ej. AL30" autoComplete="off"
                  onChange={event => setNewTicker(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addInstrument(); } }} />
                  <button type="button" onClick={addInstrument} aria-label="Agregar instrumento">+</button></div>
              </div>
            </aside>
            <section className="instrument-detail" aria-labelledby="selected-instrument">
              {selected ? <>
                <div className="instrument-heading"><h2 id="selected-instrument">{selected}</h2>
                  <button type="button" className="text-button" onClick={removeInstrument}>Quitar instrumento</button></div>
                <p className="preset-hint">Reordená con ↑/↓. El primero se usa para autocompletar si no hay uno elegido anteriormente.</p>
                {values.length > 0 && <div className="preset-columns" aria-hidden="true"><span /><span>Cantidad</span><span>A mostrar</span><span /></div>}
                <div className="preset-rows" ref={presetRows}>
                  {values.map((preset, index) => <div className="preset-row" key={`${selected}-${index}`}>
                    <span className={`preset-number${index === 0 ? " preset-first" : ""}`}
                      title={index === 0 ? "Primero para autocompletar si no hay un preset elegido anteriormente" : undefined}>{index + 1}</span>
                    <input type="number" min="1" step="1" value={preset.cantidad} inputMode="numeric"
                      aria-label={`Cantidad del preset ${index + 1} de ${selected}`}
                      onChange={event => updatePreset(index, "cantidad", event.target.value)} />
                    <input type="number" min="0" step="1" value={preset.mostrar} inputMode="numeric"
                      aria-label={`Cantidad a mostrar del preset ${index + 1} de ${selected}`}
                      onChange={event => updatePreset(index, "mostrar", event.target.value)} />
                    <div className="preset-row-actions">
                      <button type="button" className="move-preset" data-direction="up" disabled={index === 0}
                        aria-label={`Subir preset ${index + 1} de ${selected}`} title="Subir preset"
                        onClick={() => movePreset(index, -1)}>↑</button>
                      <button type="button" className="move-preset" data-direction="down" disabled={index === values.length - 1}
                        aria-label={`Bajar preset ${index + 1} de ${selected}`} title="Bajar preset"
                        onClick={() => movePreset(index, 1)}>↓</button>
                      <button type="button" className="remove-preset" aria-label={`Quitar preset ${index + 1} de ${selected}`}
                      onClick={() => {
                        setPresets(previous => ({ ...previous, [selected]: previous[selected].filter((_, i) => i !== index) })); markChanged();
                      }}>×</button>
                    </div>
                  </div>)}
                </div>
                <button type="button" className="text-button add-preset" onClick={() => {
                  setPresets(previous => ({ ...previous, [selected]: [...previous[selected], { cantidad: "100", mostrar: "0" }] })); markChanged();
                }}>+ Agregar preset</button>
                <div className="preset-preview">
                  <h3>Vista previa de cantidades rápidas</h3>
                  <div className="preset-chips" aria-live="polite">
                    {values.map((preset, index) => <span className="preset-chip" key={index}>
                      {previewLabel(preset)}
                    </span>)}
                    {values.length === 0 && <p>Este instrumento no tiene presets. Agregá uno para mostrarlo aquí.</p>}
                  </div><p>Con “A mostrar” en 0, se muestra toda la cantidad.</p>
                </div>
              </> : <div className="empty-instruments"><h2 id="selected-instrument">Agregá tu primer instrumento</h2>
                <p>Ingresá su símbolo y configurá las cantidades rápidas.</p></div>}
            </section>
          </div>
          <label className="autocomplete-setting">
            <span><strong>Autocompletar al seleccionar</strong><span>Usar el último preset elegido o, si no hay uno, el primero configurado.</span></span>
            <span className="setting-switch"><input name="autocompleteWithFirstPreset" type="checkbox" checked={autocomplete}
              onChange={event => { setAutocomplete(event.target.checked); markChanged(); }} /><span aria-hidden="true" /></span>
          </label>
        </fieldset>
      </div>
      <footer className="options-footer">
        <button name="defaultInstrumentPresets" type="button" className="text-button restore-defaults"
          disabled={loading || saving || loadFailed} onClick={restoreDefaults}>Restablecer valores</button>
        {embedded && feedback}
        <div className="options-actions"><button type="button" disabled={loading || saving || loadFailed} onClick={cancel}>{embedded ? "Descartar cambios" : "Cancelar"}</button>
          <button name="saveInstrumentPresets" type="submit" className="primary-button" disabled={loading || saving || loadFailed || conflict}>
            {saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </footer>
      {!embedded && feedback}
    </form>
  );
}
export default InstrumentPresetsOptions;
