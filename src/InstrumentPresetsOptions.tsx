import { FormEvent, useEffect, useRef, useState } from "react";
import { IInstrumentPresets, randomDisplayRange } from "./InstrumentPresets";
import repository, { StoredSettings } from "./InstrumentPresetsRepository";
import { defaultBook, format, label, parse } from "./PresetBook";
import { DraftPreset, DraftPresets, PresetValidationError, serializePresets, toDraft } from "./InstrumentPresetsSettings";
import "./Options.css";
function sortTickers(presets: DraftPresets): string[] {
  return Object.keys(presets).sort((a, b) => a.localeCompare(b, "es"));
}
const previewLabel = (preset: DraftPreset) => {
  try { return label(serializePresets({ PREVIEW: [preset] }).PREVIEW[0]); }
  catch { return "—"; }
};
function rawTextFor(presets: DraftPresets): string {
  try { return format(serializePresets(presets)); }
  // Keep incomplete visual edits available for repair in the text editor.
  catch { return Object.entries(presets).map(([ticker, values]) => ticker + " " + values
    .map(preset => `${preset.cantidad}/${preset.mostrar}`).join(" ")).join("\n"); }
}
type DisplayMode = "all" | "fixed" | "random";
type EditingPreset = { ticker: string; index: number; mode: DisplayMode; fixed: string; divisor: string };
const displayMode = (preset: DraftPreset): DisplayMode => /^r/i.test(preset.mostrar) ? "random" : /^0+$/.test(preset.mostrar) ? "all" : "fixed";
const quantityLabel = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value).toLocaleString("es-AR") : value || "—";
function displaySummary(preset: DraftPreset): { title: string; detail: string } {
  try {
    const parsed = serializePresets({ PREVIEW: [preset] }).PREVIEW[0];
    if (typeof parsed.mostrar === "number") return { title: parsed.mostrar === 0 ? "Mostrar todo" : `Fija: ${quantityLabel(String(parsed.mostrar))}`, detail: "" };
    const divisor = Number(parsed.mostrar.slice(1));
    const { minimum, maximum } = randomDisplayRange(parsed.cantidad, divisor);
    return { title: `Aleatoria ÷${divisor}`, detail: `${quantityLabel(String(minimum))}–${quantityLabel(String(maximum))}` };
  } catch { return { title: "Revisar valores", detail: "" }; }
}
type EditorSettings = { presets: DraftPresets; autocomplete: boolean };
const toEditorSettings = (settings: StoredSettings): EditorSettings => ({ presets: toDraft(settings.book), autocomplete: settings.autocompletar });
const sameSettings = (a: EditorSettings, b: EditorSettings) => JSON.stringify(a) === JSON.stringify(b);
const conflictMessage = "Las preferencias cambiaron en otra vista. Tu borrador se conserva. Descartá los cambios para cargar lo guardado antes de volver a guardar.";

function InstrumentPresetsOptions({ embedded = false }: { embedded?: boolean }) {
  const [presets, setPresets] = useState<DraftPresets>({});
  const [editorMode, setEditorMode] = useState<"visual" | "raw">("visual");
  const [rawText, setRawText] = useState("");
  const rawInput = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<EditingPreset | null>(null);
  const editFocus = useRef<{ index: number; field: "cantidad" | "mostrar" | "action" } | null>(null);
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
  const rawErrors = editorMode === "raw" ? parse(rawText).errors : [];

  function receiveSettings(next: EditorSettings) {
    if (sameSettings(next, saved.current)) return;
    saved.current = next;
    // Chrome also notifies this editor about its own write.
    if (pendingSave.current && sameSettings(next, pendingSave.current)) return;
    if (dirty.current || pendingSave.current) {
      conflicted.current = true; setConflict(true); setError(conflictMessage); setStatus("");
      return;
    }
    setPresets(next.presets); setAutocomplete(next.autocomplete); setEditing(null);
    setRawText(rawTextFor(next.presets));
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
      setRawText(rawTextFor(draft));
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
  useEffect(() => {
    const target = editFocus.current;
    if (!target) return;
    editFocus.current = null;
    const row = presetRows.current?.children[target.index];
    const input = row?.querySelector<HTMLInputElement>(`input[data-field="${target.field}"]`);
    if (input) { input.focus(); input.select(); }
    else row?.querySelector<HTMLButtonElement>(target.field === "action" ? ".edit-preset" : '[aria-pressed="true"]')?.focus();
  }, [editing]);

  function selectTicker(ticker: string) { setSelected(ticker); setEditing(null); }
  function readRawPresets(): IInstrumentPresets | null {
    const result = parse(rawText);
    if (result.errors.length > 0) {
      const first = result.errors[0];
      setError(`Línea ${first.line}: ${first.message}`);
      rawInput.current?.focus();
      return null;
    }
    return result.book;
  }
  function switchEditorMode(mode: "visual" | "raw") {
    if (mode === editorMode) return;
    if (mode === "raw") setRawText(rawTextFor(presets));
    else {
      const book = readRawPresets();
      if (book === null) return;
      const draft = toDraft(book);
      setPresets(draft);
      setSelected(current => Object.hasOwn(draft, current) ? current : sortTickers(draft)[0] ?? "");
      setTickerQuery("");
    }
    setEditing(null); setEditorMode(mode);
    setError(conflicted.current ? conflictMessage : "");
  }
  function beginEditing(index: number, field: "cantidad" | "mostrar" = "cantidad") {
    if (loading || saving || loadFailed || (editing?.ticker === selected && editing.index === index)) return;
    const preset = values[index];
    const mode = displayMode(preset);
    editFocus.current = { index, field };
    setEditing({ ticker: selected, index, mode,
      fixed: mode === "fixed" ? preset.mostrar : String(Math.max(1, Math.floor(Number(preset.cantidad) / 5))),
      divisor: mode === "random" ? preset.mostrar.slice(1) : "5" });
  }
  function finishEditing(index: number) {
    try { serializePresets({ [selected]: [values[index]] }); }
    catch (error) { setError(error instanceof Error ? error.message : "Revisá los valores del preset."); return; }
    editFocus.current = { index, field: "action" };
    setEditing(null);
  }
  function changeDisplayMode(mode: DisplayMode) {
    if (!editing) return;
    setEditing({ ...editing, mode });
    updatePreset(editing.index, "mostrar", mode === "all" ? "0" : mode === "fixed" ? editing.fixed : `R${editing.divisor}`);
  }
  function updateDisplayValue(value: string) {
    if (!editing) return;
    const field = editing.mode === "random" ? "divisor" : "fixed";
    setEditing({ ...editing, [field]: value });
    updatePreset(editing.index, "mostrar", editing.mode === "random" ? `R${value}` : value);
  }

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
    setEditing(current => !current || current.ticker !== selected ? current : { ...current,
      index: current.index === index ? destination : current.index === destination ? index : current.index });
    setPresets(previous => {
      const reordered = [...previous[selected]];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return { ...previous, [selected]: reordered };
    });
    moveFocus.current = { index: destination,
      direction: destination === 0 ? "down" : destination === values.length - 1 ? "up" : step === -1 ? "up" : "down" };
    markChanged();
  }
  function removePreset(index: number) {
    setPresets(previous => ({ ...previous, [selected]: previous[selected].filter((_, i) => i !== index) }));
    setEditing(current => !current || current.ticker !== selected ? current : current.index === index ? null
      : { ...current, index: current.index > index ? current.index - 1 : current.index });
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
    setSelected(ticker); setNewTicker(""); setTickerQuery("");
    editFocus.current = { index: 0, field: "cantidad" };
    setEditing({ ticker, index: 0, mode: "all", fixed: "20", divisor: "5" }); markChanged();
  }
  function removeInstrument() {
    setEditing(null);
    const remaining = { ...presets };
    delete remaining[selected];
    const remainingTickers = sortTickers(remaining);
    setPresets(remaining);
    setSelected(remainingTickers.find(ticker => ticker.toUpperCase().includes(query)) ?? remainingTickers[0] ?? "");
    markChanged();
  }
  function restoreDefaults() {
    setEditing(null);
    const defaults = toDraft(defaultBook);
    setRawText(rawTextFor(defaults));
    setPresets(defaults); setSelected(sortTickers(defaults)[0] ?? "");
    setAutocomplete(repository.DefaultAutocomplete); setNewTicker(""); setTickerQuery(""); markChanged();
    setStatus("Valores por defecto cargados. Guardá para aplicarlos.");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (conflicted.current) { setError(conflictMessage); return; }
    setError("");
    let parsed: IInstrumentPresets;
    try {
      if (editorMode === "raw") {
        const book = readRawPresets();
        if (book === null) return;
        parsed = book;
      } else parsed = serializePresets(presets);
    }
    catch (error) {
      if (error instanceof PresetValidationError) {
        setTickerQuery(""); setSelected(error.ticker); setError(error.message);
        const index = presets[error.ticker].findIndex(preset => {
          try { serializePresets({ [error.ticker]: [preset] }); return false; } catch { return true; }
        });
        if (index >= 0) {
          const preset = presets[error.ticker][index], mode = displayMode(preset);
          setEditing({ ticker: error.ticker, index, mode, fixed: mode === "fixed" ? preset.mostrar : "1", divisor: mode === "random" ? preset.mostrar.slice(1) : "5" });
          editFocus.current = { index, field: /^\d+$/.test(preset.cantidad) && Number.isSafeInteger(Number(preset.cantidad)) && Number(preset.cantidad) > 0 ? "mostrar" : "cantidad" };
        }
      }
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
        saved.current = candidate; setPresets(candidate.presets); setRawText(format(parsed));
        dirty.current = false; setEditing(null); setStatus("Cambios guardados");
      }
    } catch {
      setStatus(""); setError("No se pudo guardar la configuración. Tus cambios siguen disponibles para reintentar.");
    } finally { pendingSave.current = null; setSaving(false); }
  }
  function cancel() {
    setEditing(null);
    dirty.current = false; conflicted.current = false; setConflict(false);
    setPresets(saved.current.presets); setAutocomplete(saved.current.autocomplete);
    setRawText(rawTextFor(saved.current.presets));
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
          <div className="preset-editor-toolbar">
            <div className="preset-editor-modes" role="group" aria-label="Modo de edición de presets">
              <button type="button" aria-pressed={editorMode === "visual"} onClick={() => switchEditorMode("visual")}>Visual</button>
              <button type="button" aria-pressed={editorMode === "raw"} onClick={() => switchEditorMode("raw")}>RAW</button>
            </div>
            {editorMode === "raw" && <span>Todos los instrumentos · Una línea por instrumento</span>}
          </div>
          {editorMode === "raw" ? <section className="raw-presets-editor" aria-label="Editor RAW de presets">
            <label htmlFor="raw-presets">Presets RAW</label>
            <textarea id="raw-presets" ref={rawInput} aria-label="Presets RAW" value={rawText} rows={16}
              spellCheck={false} autoCapitalize="off" autoComplete="off" wrap="off" aria-invalid={rawErrors.length > 0}
              aria-describedby="raw-presets-syntax raw-presets-errors"
              onChange={event => { setRawText(event.target.value); markChanged(); }} />
            <p id="raw-presets-syntax">Ejemplo: <code>AL30 100000/R5 50000/5000 100</code><br />
              Cantidades enteras sin separadores. Cantidad sola o /0: mostrar todo; /n: fija; /Rn: aleatoria, con divisor entero desde 2.</p>
            <ul id="raw-presets-errors" className="raw-errors" hidden={rawErrors.length === 0}>
              {rawErrors.map((error, index) => <li key={index}>Línea {error.line}: {error.message}</li>)}
            </ul>
          </section> : <div className="instrument-layout">
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
                        if (filteredTickers.length > 0) selectTicker(filteredTickers[0]);
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
                  onClick={() => selectTicker(ticker)}><span>{ticker}</span>
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
                <p className="preset-hint">Hacé clic en cualquier celda para editar. Reordená con ↑/↓. El primero se usa para autocompletar si no hay uno elegido anteriormente.</p>
                {values.length > 0 && <div className="preset-columns" aria-hidden="true"><span /><span>Cantidad</span><span>A mostrar</span><span /></div>}
                <div className="preset-rows" ref={presetRows}>
                  {values.map((preset, index) => {
                    const active = editing?.ticker === selected && editing.index === index ? editing : null;
                    const summary = displaySummary(preset);
                    return <div className={`preset-row${active ? " preset-editing" : ""}`} key={`${selected}-${index}`}
                      onClick={event => { if (!(event.target as Element).closest("button, input")) beginEditing(index); }}
                      onKeyDown={event => {
                        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
                          event.preventDefault(); finishEditing(index);
                        }
                      }}>
                    <button type="button" className={`preset-number${index === 0 ? " preset-first" : ""}`}
                      aria-label={`Editar preset ${index + 1} de ${selected} desde el número`}
                      title={index === 0 ? "Primero para autocompletar si no hay un preset elegido anteriormente" : undefined}
                      onClick={() => beginEditing(index)}>{index + 1}</button>
                    {active ? <>
                      <input type="number" min="1" step="1" value={preset.cantidad} inputMode="numeric" data-field="cantidad"
                        aria-label={`Cantidad del preset ${index + 1} de ${selected}`}
                        onChange={event => updatePreset(index, "cantidad", event.target.value)} />
                      <div className="preset-display-modes" role="group" aria-label={`A mostrar del preset ${index + 1} de ${selected}`}>
                        {([['all', 'Mostrar todo'], ['fixed', 'Fija'], ['random', 'Aleatoria']] as const).map(([mode, text]) =>
                          <button type="button" key={mode} data-display-mode={mode} aria-pressed={active.mode === mode}
                            onClick={() => changeDisplayMode(mode)}>{text}</button>)}
                      </div>
                      <div className="preset-display-value">
                        {active.mode !== "all" && <label><span>{active.mode === "random" ? "Divisor" : "Valor"}</span>
                          <input type="number" min={active.mode === "random" ? 2 : 1} step="1" inputMode="numeric" data-field="mostrar"
                            value={active.mode === "random" ? active.divisor : active.fixed}
                            aria-label={`${active.mode === "random" ? "Divisor" : "Cantidad a mostrar"} del preset ${index + 1} de ${selected}`}
                            onChange={event => updateDisplayValue(event.target.value)} />
                        </label>}
                      </div>
                    </> : <>
                      <button type="button" className="preset-cell preset-quantity-cell"
                        aria-label={`Editar cantidad del preset ${index + 1} de ${selected}`}
                        onClick={() => beginEditing(index)}>{quantityLabel(preset.cantidad)}</button>
                      <button type="button" className="preset-cell preset-display-cell"
                        aria-label={`Editar cantidad a mostrar del preset ${index + 1} de ${selected}`}
                        onClick={() => beginEditing(index, "mostrar")}>
                        <span>{summary.title}</span>{summary.detail && <small>{summary.detail}</small>}
                      </button>
                    </>}
                    <div className="preset-row-actions" onClick={event => event.stopPropagation()}>
                      <button type="button" className="edit-preset"
                        aria-label={`${active ? "Terminar edición del" : "Editar"} preset ${index + 1} de ${selected}`}
                        title={active ? "Terminar edición" : "Editar preset"}
                        onClick={() => active ? finishEditing(index) : beginEditing(index)}>{active ? "✓" : "✎"}</button>
                      <button type="button" className="move-preset" data-direction="up" disabled={index === 0}
                        aria-label={`Subir preset ${index + 1} de ${selected}`} title="Subir preset"
                        onClick={() => movePreset(index, -1)}>↑</button>
                      <button type="button" className="move-preset" data-direction="down" disabled={index === values.length - 1}
                        aria-label={`Bajar preset ${index + 1} de ${selected}`} title="Bajar preset"
                        onClick={() => movePreset(index, 1)}>↓</button>
                      <button type="button" className="remove-preset" aria-label={`Quitar preset ${index + 1} de ${selected}`}
                      onClick={() => removePreset(index)}>×</button>
                    </div>
                    {active && active.mode === "random" && <p className="preset-range" aria-live="polite">
                      {summary.detail ? `${summary.detail} unidades · +0% a +3% · Nuevo sorteo al aplicar.` : "Usá un divisor entero desde 2."}
                    </p>}
                  </div>; })}
                </div>
                <button type="button" className="text-button add-preset" onClick={() => {
                  setPresets(previous => ({ ...previous, [selected]: [...previous[selected], { cantidad: "100", mostrar: "0" }] })); markChanged();
                  editFocus.current = { index: values.length, field: "cantidad" };
                  setEditing({ ticker: selected, index: values.length, mode: "all", fixed: "20", divisor: "5" });
                }}>+ Agregar preset</button>
                <div className="preset-preview">
                  <h3>Vista previa de cantidades rápidas</h3>
                  <div className="preset-chips" aria-live="polite">
                    {values.map((preset, index) => <span className="preset-chip" key={index}>
                      {previewLabel(preset)}
                    </span>)}
                    {values.length === 0 && <p>Este instrumento no tiene presets. Agregá uno para mostrarlo aquí.</p>}
                  </div><p>Elegí Mostrar todo, Fija o Aleatoria al editar el preset. Aleatoria divide la cantidad
                    y suma entre 0% y 3% en cada aplicación, incluido el autocompletado. El resultado queda fijo al editar el ticket.
                    {" "}El ✓ termina la edición; Guardar cambios guarda la configuración.</p>
                </div>
              </> : <div className="empty-instruments"><h2 id="selected-instrument">Agregá tu primer instrumento</h2>
                <p>Ingresá su símbolo y configurá las cantidades rápidas.</p></div>}
            </section>
          </div>}
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
