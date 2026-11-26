import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarketReader } from "../optionsSimulator/market";
import { containsChangedElements, observePageStructure } from "../pageStructure";
import ToolbarIcon from "../ToolbarIcon";
import { IntradayChart, ReferenceChartButton } from "./IntradayChart";
import { RatioChartLink } from "./RatioChart";
import { calculateRatio, defaultRatioColumns, defaultRatioFormat, emptyState, exactTickerMatches, instrumentDetail, numberLabel, pairKey, pairLabel, ratioLabel, referenceCFormula, referenceCQuote, tickerKey, tradeLabel, type DollarWidgetState, type RatioColumns, type RatioFormat, type RatioInstrument, type RatioPair, type RatioReference, type RatiosState, type RatioWidgetState } from "./model";
import "./RatiosDashboard.css";

type Mutation = "ratiosAdd" | "ratiosEdit" | "ratiosRemove" | "ratiosResize" | "ratiosColumns" | "dollarAdd" | "dollarEdit";
type Command = (method: Mutation, params?: Record<string, unknown>) => Promise<void>;
type Search = (query: string) => Promise<RatioInstrument[]>;
const dashboardSelector = ".CustomDashboard";
const menuSelector = ".WidgetsComponentsPopoverList";
const drawerSelector = "#ToolPanel .ToolContent";
const drawerHeaderSelector = ".ToolContentHeaderText";
const widgetSelector = "[data-ct-ratios-slot]";
const nativeStructure = [dashboardSelector, ".GridLayout", ".DashboardGridItem", menuSelector, "#ToolPanel", ".ToolContent", drawerHeaderSelector].join(", ");
const discoveryDelays = [250, 750, 2000];

export function InstrumentPicker({ label, value, onChange, search, disabled, autoFocus = false, onAutoFocus, acceptSuggestionOnTab = false, divisor, describe = instrumentDetail }: {
  label: string; value?: RatioInstrument; onChange(value?: RatioInstrument): void; search: Search; disabled: boolean; autoFocus?: boolean;
  onAutoFocus?(): void;
  acceptSuggestionOnTab?: boolean;
  divisor?: { checked: boolean; onChange(checked: boolean): void; label?: string; disabled?: boolean };
  describe?(instrument: RatioInstrument): string;
}) {
  const id = useId(), [query, setQuery] = useState(value?.symbol || ""), [options, setOptions] = useState<RatioInstrument[]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [issue, setIssue] = useState("");
  const [resolving, setResolving] = useState(false);
  const generation = useRef(0), latestQuery = useRef(query);
  const input = useRef<HTMLInputElement>(null), focused = useRef(false), tabbingForward = useRef(false);
  useEffect(() => {
    if (autoFocus && !disabled && !focused.current) {
      input.current?.focus();
      focused.current = true;
      onAutoFocus?.();
    }
  }, [autoFocus, disabled, onAutoFocus]);
  latestQuery.current = query;
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (value) setQuery(value.symbol); }, [value?.id, value?.symbol]);
  useEffect(() => {
    if (!open || !query.trim()) { setOptions([]); return; }
    let closed = false;
    const timer = setTimeout(() => {
      setIssue("");
      void search(query).then(items => { if (!closed) { setOptions(items); setActive(0); } }).catch(error => { if (!closed) { setOptions([]); setIssue(error.message); } });
    }, 180);
    return () => { closed = true; clearTimeout(timer); };
  }, [query, open, search]);
  const choose = (item: RatioInstrument) => { generation.current++; setResolving(false); onChange(item); setQuery(item.symbol); setOpen(false); setOptions([]); setIssue(""); };
  const resolveOnBlur = async () => {
    const acceptSuggestion = tabbingForward.current && open;
    tabbingForward.current = false;
    setOpen(false);
    const highlighted = acceptSuggestion ? options[active] : undefined;
    if (highlighted) { choose(highlighted); return; }
    const text = latestQuery.current.trim();
    if (!text || (value && tickerKey(value.symbol) === tickerKey(text))) return;
    const request = ++generation.current;
    setResolving(true); setIssue("");
    try {
      const results = await search(text);
      if (request !== generation.current) return;
      const matches = exactTickerMatches(text, results);
      const match = matches.length === 1 ? matches[0] : acceptSuggestion && matches.length === 0 ? results[0] : undefined;
      if (match) choose(match);
      else setIssue(matches.length > 1 ? "Más de un instrumento coincide; elegí uno de la lista." : "No se encontró ese ticker exacto.");
    } catch (error) { if (request === generation.current) setIssue(error instanceof Error ? error.message : "No se pudo buscar el instrumento."); }
    finally { if (request === generation.current) setResolving(false); }
  };
  return <div className={divisor ? "ct-ratio-picker ct-ratio-picker-with-divisor" : "ct-ratio-picker"}>
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
      value={query} disabled={disabled} autoComplete="off" maxLength={60} placeholder="Buscar instrumento"
      onChange={event => { generation.current++; setResolving(false); latestQuery.current = event.target.value; setOptions([]); setActive(0); setIssue(""); setQuery(event.target.value); onChange(undefined); setOpen(true); }}
      onFocus={() => { generation.current++; setResolving(false); setOpen(!value || tickerKey(value.symbol) !== tickerKey(query)); }} onBlur={() => void resolveOnBlur()}
      onKeyDown={event => {
        tabbingForward.current = acceptSuggestionOnTab && event.key === "Tab" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(options.length - 1, n + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
      }} />
    {divisor && <label className="ct-ratio-divisor">
      <input type="checkbox" checked={divisor.checked} disabled={disabled || divisor.disabled}
        onChange={event => divisor.onChange(event.target.checked)} />{divisor.label ?? "Dividir Referencia C por 100"}
    </label>}
    <small title={value?.id} role="status">{value ? describe(value) : resolving ? "Buscando ticker…" : issue || "Ingresá el ticker o elegí un instrumento"}</small>
    {open && query.trim() && <ul id={`${id}-options`} role="listbox" aria-label={`Resultados de ${label}`}>
      {options.map((item, index) => <li key={item.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
        <strong>{item.symbol}</strong><span>{describe(item)}</span>
      </li>)}
      {!options.length && <li role="presentation">{issue || "Sin coincidencias en el catálogo de Matriz"}</li>}
    </ul>}
  </div>;
}

function ColumnOptions({ visible, busy, onChange }: { visible: RatioColumns; busy: boolean; onChange(visible: RatioColumns): void }) {
  const id = useId(), button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const focusedColumn = useRef<keyof RatioColumns | null>(null);
  const reposition = useCallback(() => {
    const anchor = button.current?.getBoundingClientRect();
    if (!anchor) return;
    const box = panel.current?.getBoundingClientRect(), width = box?.width || 220, height = box?.height || 150;
    setPosition({ top: Math.max(8, Math.min(anchor.bottom + 5, window.innerHeight - height - 8)), left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)) });
  }, []);
  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition); document.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); document.removeEventListener("scroll", reposition, true); };
  }, [open, visible, reposition]);
  useEffect(() => {
    if (!busy && focusedColumn.current && panel.current?.matches(":popover-open")) panel.current.querySelector<HTMLInputElement>(`input[data-column="${focusedColumn.current}"]`)?.focus();
  }, [busy]);
  return <>
    <button ref={button} type="button" className="ct-ratios-columns-button" aria-label="Opciones de columnas" title="Mostrar u ocultar columnas" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} popoverTarget={id} disabled={busy} onClick={reposition}><ToolbarIcon name="settings" /></button>
    <div ref={panel} id={id} popover="auto" role="dialog" aria-label="Columnas del widget de Ratios" className="ct-ratios-column-menu" style={position}
      onToggle={event => { setOpen(event.newState === "open"); if (event.newState === "open") { focusedColumn.current = null; panel.current?.querySelector<HTMLInputElement>("input")?.focus(); } }}>
      <strong>Mostrar columnas</strong>
      {([["lastA", "Último A"], ["lastB", "Último B"], ["referenceC", "Referencia C"]] as const).map(([key, label]) => <label key={key}><input type="checkbox" data-column={key} checked={visible[key]} disabled={busy} onChange={event => { focusedColumn.current = key; onChange({ ...visible, [key]: event.target.checked }); }} />{label}</label>)}
      {busy && <small role="status">Guardando…</small>}
    </div>
  </>;
}

function RatiosWidget({ widget, snapshot, command, search, busy }: { widget: RatioWidgetState; snapshot: RatiosState; command: Command; search: Search; busy: boolean }) {
  const cfg = widget.config;
  const columns = widget.columns?.visible ?? defaultRatioColumns;
  const showReference = columns.referenceC && cfg.pairs.some(p => p.c);
  const [editing, setEditing] = useState<string | null>(cfg.pairs.length ? null : "new");
  const [a, setA] = useState<RatioInstrument>(), [b, setB] = useState<RatioInstrument>(), [c, setC] = useState<RatioInstrument>();
  const [compare, setCompare] = useState(false);
  const [focusReference, setFocusReference] = useState(false);
  const [divideCBy100, setDivideCBy100] = useState(false);
  const [formatOverride, setFormatOverride] = useState<RatioFormat>(), [editorSession, setEditorSession] = useState(0);
  const format = formatOverride ?? (compare ? "percent" : defaultRatioFormat(a, b));
  const referenceFormula = referenceCFormula(divideCBy100 ? 100 : undefined);
  const [issue, setIssue] = useState("");
  const resize = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const revision = useRef(cfg.revision);
  useEffect(() => { if (!editing) revision.current = cfg.revision; }, [cfg.revision, editing]);
  const begin = (pair?: RatioPair) => {
    setA(pair?.a); setB(pair?.b); setC(pair?.c); setCompare(!!pair?.c); setFocusReference(false); setDivideCBy100(pair?.cDivisor === 100);
    setFormatOverride(pair ? pair.format || "number" : undefined); setEditorSession(n => n + 1);
    setEditing(pair?.id || "new"); revision.current = cfg.revision; setIssue("");
  };
  const run = async (method: Mutation, params: Record<string, unknown>) => {
    setIssue("");
    try { await command(method, { widgetId: cfg.id, revision: cfg.revision, ...params }); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : "No se pudo guardar el cambio."); return false; }
  };
  const savePairs = (pairs: RatioPair[], expectedRevision = cfg.revision) => run("ratiosEdit", {
    schema: 3, revision: expectedRevision, pairs: pairs.map(p => ({
      id: p.id, a: p.a.id, b: p.b.id, ...(p.c ? { c: p.c.id, cDivisor: p.cDivisor } : {}), format: p.format || "number",
    })),
  });
  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resize.current) return;
    const start = resize.current; resize.current = null;
    if (root.current) { root.current.style.width = ""; root.current.style.height = ""; }
    void run("ratiosResize", { width: start.width + event.clientX - start.x, height: start.height + event.clientY - start.y });
  };
  return <section className="ct-ratios ct-ratios-widget" ref={root} aria-label="Ratios de instrumentos">
    <header className="ct-ratios-title"><strong>Ratios</strong><span className="ct-ratios-header-actions NoDraggable">
      <button type="button" aria-label="Agregar ratio" title="Agregar ratio" disabled={busy || cfg.pairs.length >= 50} onClick={() => begin()}>＋</button>
      <button type="button" aria-label="Cerrar widget de ratios" title="Quitar este widget del dashboard" disabled={busy} onClick={() => void run("ratiosRemove", {})}>×</button>
    </span></header>
    <div className="ct-ratios-content NoDraggable">
      {editing && <form className="ct-ratios-editor" onSubmit={event => {
        event.preventDefault();
        if (!a || !b || compare && !c) { setIssue("Seleccioná los instrumentos y la referencia de la lista."); return; }
        if (a.id === b.id) { setIssue("Elegí instrumentos diferentes para A y B."); return; }
        const pair: RatioPair = { id: editing === "new" ? crypto.randomUUID() : editing, a, b, ...(compare && c ? { c, cDivisor: divideCBy100 ? 100 : undefined } : {}), format };
        const pairs = editing === "new" ? [...cfg.pairs, pair] : cfg.pairs.map(p => p.id === editing ? pair : p);
        void savePairs(pairs, revision.current).then(saved => { if (saved) setEditing(null); });
      }}>
        <div className="ct-ratios-pickers">
          <InstrumentPicker key={`${editorSession}-a`} label="A · Numerador" value={a} onChange={setA} search={search} disabled={busy} autoFocus />
          <span className="ct-ratios-division" aria-hidden="true">÷</span>
          <InstrumentPicker key={`${editorSession}-b`} label="B · Denominador" value={b} onChange={setB} search={search} disabled={busy} />
        </div>
        {compare && <InstrumentPicker key={`${editorSession}-c`} label="Referencia C · ej. Dólar oficial" value={c} onChange={setC} search={search} disabled={busy}
          autoFocus={focusReference} onAutoFocus={() => setFocusReference(false)}
          divisor={{ checked: divideCBy100, onChange: setDivideCBy100 }} />}
        <label className="ct-ratios-compare"><input type="checkbox" checked={compare} disabled={busy} onChange={e => {
          setCompare(e.target.checked); setFocusReference(e.target.checked); setC(undefined); setDivideCBy100(false); setFormatOverride(undefined);
        }} />Comparar A/B con una referencia</label>
        <div className="ct-ratios-editor-actions"><label className="ct-ratios-format">Mostrar <select aria-label="Formato del ratio" value={format} disabled={busy} onChange={event => setFormatOverride(event.target.value as RatioFormat)}><option value="number">Número</option><option value="percent">Porcentaje (%)</option></select></label>
          <span>{compare ? format === "percent" ? `((A ÷ B) ÷ ${referenceFormula} − 1) × 100` : `(A ÷ B) ÷ ${referenceFormula}` : format === "percent" ? "(Último A ÷ último B − 1) × 100" : "Último A ÷ último B · sin conversiones"}</span>
          <button type="button" disabled={busy} onClick={() => { setEditing(null); setIssue(""); }}>Cancelar</button>
          <button type="submit" disabled={busy || !a || !b || compare && !c}>{busy ? "Guardando…" : editing === "new" ? "Agregar" : "Guardar"}</button>
        </div>
      </form>}
      {(issue || snapshot.issue || widget.issue) && <p className="ct-ratios-issue" role="status">{issue || snapshot.issue || widget.issue}</p>}
      <div className="ct-ratios-table-wrap"><table>
        <thead><tr><th>Par A/B</th>{columns.lastA && <th>Último A</th>}{columns.lastB && <th>Último B</th>}{showReference && <th>Referencia C</th>}<th>Ratio</th><th title="Comparación con el ratio de las referencias diarias de Matriz">Var. diaria</th><th><span className="ct-ratios-sr">Acciones</span><ColumnOptions visible={columns} busy={busy} onChange={visible => { void run("ratiosColumns", { columnsRevision: widget.columns?.revision ?? 0, columns: visible }); }} /></th></tr></thead>
        <tbody>{cfg.pairs.map(pair => {
          const label = pairLabel(pair);
          const qa = snapshot.quotes[pair.a.id], qb = snapshot.quotes[pair.b.id], qc = referenceCQuote(snapshot.quotes, pair);
          const result = calculateRatio(qa, qb, qc), reference = referenceCFormula(pair.cDivisor);
          const { change } = result;
          const changeClass = change === undefined ? undefined : change > 0 ? "ct-ratios-up" : change < 0 ? "ct-ratios-down" : "ct-ratios-flat";
          const age = Math.max(qa?.tradedAt === undefined ? 0 : Date.now() - qa.tradedAt, qb?.tradedAt === undefined ? 0 : Date.now() - qb.tradedAt, qc?.tradedAt === undefined ? 0 : Date.now() - qc.tradedAt);
          const clock = `A: ${tradeLabel(qa?.tradedAt)} · B: ${tradeLabel(qb?.tradedAt)}${pair.c ? ` · C: ${tradeLabel(qc?.tradedAt)}` : ""}`;
          return <tr key={pair.id}>
            <td className="ct-ratios-pair" title={`A: ${pair.a.symbol} · ${instrumentDetail(pair.a)} · B: ${pair.b.symbol} · ${instrumentDetail(pair.b)}\n${clock}`}><strong>{label}</strong>
              {age > 15 * 60 * 1000 && <span className="ct-ratios-old" role="img" aria-label="Última operación antigua" title={clock}>◷</span>}
            </td>
            {columns.lastA && <td className={qa?.last === undefined ? undefined : "ct-ratios-quote"} title={`Última operación A: ${tradeLabel(qa?.tradedAt)}`}>{numberLabel(qa?.last)}</td>}
            {columns.lastB && <td className={qb?.last === undefined ? undefined : "ct-ratios-quote"} title={`Última operación B: ${tradeLabel(qb?.tradedAt)}`}>{numberLabel(qb?.last)}</td>}
            {showReference && <td className={qc?.last === undefined ? undefined : "ct-ratios-quote"} title={pair.c ? `${pair.c.symbol}${pair.cDivisor ? ` ÷ ${pair.cDivisor}` : ""} · ${tradeLabel(qc?.tradedAt)}` : undefined}>{numberLabel(qc?.last)}</td>}
            <td className="ct-ratios-value" title={result.issue || (pair.c ? `(A/B) ÷ ${reference}. Porcentaje = ((A/B) ÷ ${reference} − 1) × 100. Diferencia absoluta |A/B − ${reference}| entre paréntesis.` : undefined) || (pair.format === "percent" ? "(Último A ÷ último B − 1) × 100" : "Último A ÷ último B")} aria-label={result.issue}>{ratioLabel(result.ratio, pair.format, result.absoluteDifference)}</td>
            <td className={changeClass} title={result.referenceIssue || "(Ratio actual / ratio de referencia diaria − 1) × 100"} aria-label={result.referenceIssue}>
              {change === undefined ? "—" : change.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) + "%"}
            </td>
            <td className="ct-ratios-actions">
              <RatioChartLink pair={pair} />
              <ReferenceChartButton pair={pair} />
              <button type="button" aria-label={`Editar ${label}`} title="Editar par" disabled={busy} onClick={() => begin(pair)}>✎</button>
              <button type="button" aria-label={`Invertir ${label}`} title={pair.c ? "Comparación (A/B)/C; editá la fórmula para cambiar el sentido" : "Invertir A/B"} disabled={busy || !!pair.c} onClick={() => void savePairs(cfg.pairs.map(p => p.id === pair.id ? { ...p, a: p.b, b: p.a } : p))}>⇄</button>
              <button type="button" aria-label={`Eliminar ${label}`} title="Eliminar ratio" disabled={busy} onClick={() => void savePairs(cfg.pairs.filter(p => p.id !== pair.id))}>×</button>
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!cfg.pairs.length && !editing && <button type="button" className="ct-ratios-empty" onClick={() => begin()}>Agregá tu primer ratio</button>}
      </div>
    </div>
    <button type="button" className="ct-ratios-resize NoDraggable" aria-label="Redimensionar Ratios" title="Arrastrá para cambiar el tamaño; también podés usar las flechas" disabled={busy}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => {
        if (event.button !== 0 || !root.current) return;
        event.preventDefault(); event.stopPropagation();
        const box = root.current.getBoundingClientRect();
        resize.current = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        if (!resize.current || !root.current) return;
        root.current.style.width = Math.max(360, Math.min(2200, resize.current.width + event.clientX - resize.current.x)) + "px";
        root.current.style.height = Math.max(180, Math.min(1400, resize.current.height + event.clientY - resize.current.y)) + "px";
      }} onPointerUp={finishResize} onPointerCancel={() => { resize.current = null; if (root.current) { root.current.style.width = ""; root.current.style.height = ""; } }}
      onKeyDown={event => {
        const step: Record<string, number[]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
        if (!step[event.key]) return;
        event.preventDefault(); event.stopPropagation();
        void run("ratiosResize", { width: widget.width + step[event.key][0], height: widget.height + step[event.key][1] });
      }}>◢</button>
  </section>;
}

function intradayInstrumentDetail(instrument: RatioInstrument) {
  const term = instrument.settlement === "1" ? "CI" : instrument.settlement === "2" ? "24 h" : "";
  return instrumentDetail(instrument) + (term ? ` · ${term}` : "");
}

function DollarWidget({ widget, command, search, busy, visible }: { widget: DollarWidgetState; command: Command; search: Search; busy: boolean; visible: boolean }) {
  const { config, pair } = widget;
  const [issue, setIssue] = useState("");
  const [legs, setLegs] = useState<Partial<Pick<RatioPair, "a" | "b">> & { revision: number }>();
  const [reference, setReference] = useState<RatioReference & { revision: number }>();
  const [spreadOnly, setSpreadOnly] = useState(false);
  const run = async (method: "dollarEdit" | "ratiosRemove", selection?: Partial<Pick<RatioPair, "a" | "b">> & RatioReference, expectedRevision = config.revision) => {
    setIssue("");
    try {
      await command(method, { widgetId: config.id, revision: expectedRevision,
        a: selection?.a?.id, b: selection?.b?.id, c: selection?.c?.id, cDivisor: selection?.cDivisor });
      return true;
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "No se pudo guardar el widget.");
      return false;
    }
  };
  const label = pair ? pairLabel({ a: pair.a, b: pair.b }) : undefined;
  const sameInstrument = !!legs?.a && legs.a.id === legs.b?.id;
  return <section className="ct-ratios ct-intraday-widget" aria-label={label ? `Dólar intradiario · ${label}` : "Dólar intradiario"}>
    <header className="ct-ratios-title"><strong>{label ?? "Dólar intradiario"}</strong><div className="ct-ratios-header-actions NoDraggable">
      <button type="button" aria-label="Cerrar widget de dólar intradiario" disabled={busy} onMouseDown={event => event.stopPropagation()}
        onClick={() => void run("ratiosRemove")}>×</button>
    </div></header>
    <div className="ct-intraday-controls NoDraggable" onMouseDown={event => event.stopPropagation()}>
      <button type="button" className="ct-intraday-config" aria-expanded={!!legs} aria-label="Configurar instrumentos A y B" disabled={busy}
        title={pair && `A: ${pair.a.symbol} · ${intradayInstrumentDetail(pair.a)} | B: ${pair.b.symbol} · ${intradayInstrumentDetail(pair.b)}`}
        onClick={() => {
          setReference(undefined);
          setLegs(value => value ? undefined : { a: pair?.a, b: pair?.b, revision: config.revision });
        }}>
        {pair ? `${pair.a.symbol} / ${pair.b.symbol}` : "Seleccionar A y B"}
      </button>
      <button type="button" className="ct-intraday-config" aria-expanded={!!reference} aria-label="Configurar Referencia C" disabled={busy}
        onClick={() => {
          setLegs(undefined);
          setReference(value => value ? undefined : { c: config.c, cDivisor: config.cDivisor, revision: config.revision });
        }}>
        {config.c ? `C · ${config.c.symbol}${config.cDivisor ? ` ÷ ${config.cDivisor}` : ""}` : "+ Referencia C"}
      </button>
      {config.c && <button type="button" className="ct-intraday-mode" aria-pressed={spreadOnly}
        onClick={() => setSpreadOnly(value => !value)}>Sólo brecha</button>}
    </div>
    {legs && <form className="ct-intraday-editor ct-ratios-editor NoDraggable" aria-label="Instrumentos del dólar intradiario"
      onMouseDown={event => event.stopPropagation()} onSubmit={event => {
        event.preventDefault();
        if (legs.a && legs.b && !sameInstrument) void run("dollarEdit", { ...legs, c: config.c, cDivisor: config.cDivisor }, legs.revision)
          .then(saved => { if (saved) setLegs(undefined); });
      }}>
      <div className="ct-ratios-pickers">
        <InstrumentPicker label="Instrumento A" value={legs.a} onChange={a => setLegs(previous => previous && { ...previous, a })} search={search} disabled={busy} describe={intradayInstrumentDetail} autoFocus />
        <span className="ct-ratios-division" aria-hidden="true">÷</span>
        <InstrumentPicker label="Instrumento B" value={legs.b} onChange={b => setLegs(previous => previous && { ...previous, b })} search={search} disabled={busy} describe={intradayInstrumentDetail} />
      </div>
      <div className="ct-ratios-editor-actions">
        {sameInstrument && <span role="status">Elegí dos instrumentos diferentes.</span>}
        <button type="button" disabled={busy} onClick={() => setLegs(undefined)}>Cancelar</button>
        <button type="submit" disabled={busy || !legs.a || !legs.b || sameInstrument}>Guardar</button>
      </div>
    </form>}
    {reference && <form className="ct-intraday-editor ct-ratios-editor NoDraggable" aria-label="Referencia del dólar intradiario"
      onMouseDown={event => event.stopPropagation()} onSubmit={event => {
        event.preventDefault();
        if (reference.c) void run("dollarEdit", reference, reference.revision).then(saved => { if (saved) setReference(undefined); });
      }}>
      <InstrumentPicker label="Referencia C" value={reference.c} search={search} disabled={busy} autoFocus
        onChange={c => setReference(previous => previous && { ...previous, c, cDivisor: c && c.id === previous.c?.id ? previous.cDivisor : undefined })}
        divisor={{ checked: reference.cDivisor === 100, disabled: !reference.c, label: "Dividir C por 100",
          onChange: checked => setReference({ ...reference, cDivisor: checked ? 100 : undefined }) }} />
      <div className="ct-ratios-editor-actions">
        {config.c && <button type="button" disabled={busy} onClick={() => void run("dollarEdit", undefined, reference.revision)
          .then(saved => { if (saved) setReference(undefined); })}>Quitar C</button>}
        <button type="button" disabled={busy} onClick={() => setReference(undefined)}>Cancelar</button>
        <button type="submit" disabled={busy || !reference.c}>Guardar</button>
      </div>
    </form>}
    {issue && <p className="ct-intraday-settings-error" role="alert">{issue}</p>}
    {pair ? <IntradayChart key={pairKey(pair)} pair={pair} view={pair.c ? (spreadOnly ? "spread" : "dollar-spread") : "ratio"} defaultToToday active={visible} /> : <p className="ct-intraday-empty" role="status">{widget.issue}</p>}
  </section>;
}

export default function RatiosDashboard() {
  const [snapshot, setSnapshot] = useState<RatiosState>(emptyState), [busy, setBusy] = useState(false), [menuIssue, setMenuIssue] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef(snapshot), reader = useRef<MarketReader | null>(null), pending = useRef(false);
  const commandVersion = useRef(0), resume = useRef(() => {});
  const publish = useCallback((next: RatiosState) => {
    current.current = next;
    setSnapshot(next);
  }, []);
  const [locations, setLocations] = useState({ menus: [] as HTMLElement[], widgets: new Map<string, HTMLElement>(), visible: new Set<string>() });
  useEffect(() => {
    if (typeof globalThis.chrome?.runtime?.getURL !== "function") return;
    const menus = new Map<Element, HTMLElement>(), widgets = new Map<HTMLElement, HTMLElement>();
    const visible = new Set<Element>();
    let slots = new Map<string, HTMLElement>();
    let drawerHeaders: Element[] = [];
    let closed = false, inScope = false, running = false, queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry = 0, retryDelay: number | undefined;

    const isVisible = (id: string) => {
      const host = slots.get(id)?.parentElement;
      return host?.isConnected && visible.has(host);
    };
    const shouldPoll = () => current.current.widgets.some(({ config }) => config.pairs.length > 0 && isVisible(config.id)) ||
      // A visible legacy dollar widget can resolve its legs after the security list arrives.
      current.current.dollarWidgets?.some(({ config }) => isVisible(config.id));
    const schedule = () => {
      clearTimeout(timer);
      if (closed || pending.current) return;
      if (!inScope) {
        reader.current?.dispose(); reader.current = null;
        if (current.current !== emptyState) publish(emptyState);
        return;
      }
      if (document.hidden || running) return;
      const delay = queued ? 0 : retryDelay ?? (shouldPoll() ? 1500 : undefined);
      if (delay !== undefined) timer = setTimeout(() => void refresh(), delay);
    };
    const requestRefresh = () => { queued = true; retry = 0; retryDelay = undefined; schedule(); };
    const refresh = async () => {
      if (closed || !inScope || document.hidden || running || pending.current) return;
      queued = false;
      retryDelay = undefined;
      running = true;
      const client = reader.current ??= new MarketReader("ratios-reader.js");
      const version = commandVersion.current;
      const isCurrent = () => !closed && !document.hidden && reader.current === client && commandVersion.current === version;
      try {
        const next = await client.call<RatiosState>("ratiosState");
        if (isCurrent()) {
          publish(next);
          // The native shell may mount before its dashboard store has hydrated.
          if (!next.dashboardId && document.querySelector(dashboardSelector)) retryDelay = discoveryDelays.at(retry++);
          else retry = 0;
        }
      } catch (error) {
        if (isCurrent()) {
          publish({ ...current.current, canAdd: false, quotes: {}, issue: error instanceof Error ? error.message : "Ratios no disponible." });
          if (!shouldPoll()) retryDelay = discoveryDelays.at(retry++);
        }
      } finally {
        running = false;
        schedule();
      }
    };
    const intersection = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
      const wasPolling = shouldPoll();
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting && widgets.has(target as HTMLElement)) visible.add(target); else visible.delete(target);
      }
      showLocations();
      if (!wasPolling && shouldPoll()) requestRefresh(); else schedule();
    });

    const reconcileMenus = () => {
      const lists = [...document.querySelectorAll(menuSelector)];
      const headers: Element[] = [];
      // Some Matriz deployments expose the same menu in the right toolbar.
      for (const drawer of document.querySelectorAll(drawerSelector)) {
        const header = drawer.querySelector(drawerHeaderSelector);
        if (header) headers.push(header);
        if (header?.textContent?.trim() === "Nuevo widget" && !drawer.querySelector(menuSelector)) lists.push(drawer);
      }
      if (headers.length !== drawerHeaders.length || headers.some((header, index) => header !== drawerHeaders[index])) {
        drawerObserver.disconnect();
        for (const header of headers) drawerObserver.observe(header, { childList: true, characterData: true, subtree: true });
        drawerHeaders = headers;
      }
      for (const [parent, slot] of menus) if (!parent.isConnected || !lists.includes(parent)) { slot.remove(); menus.delete(parent); }
      for (const list of lists) if (!menus.get(list)?.isConnected) {
        const slot = document.createElement("div"); slot.className = "WidgetComponentCard ct-ratios-menu-slot"; list.append(slot); menus.set(list, slot);
      }
    };
    const reconcileWidgets = () => {
      const parents = new Set(document.querySelectorAll<HTMLElement>(widgetSelector));
      for (const [parent, slot] of widgets) if (!parents.has(parent)) {
        intersection?.unobserve(parent); visible.delete(parent); slot.remove(); widgets.delete(parent);
      }
      for (const parent of parents) if (!widgets.get(parent)?.isConnected) {
        if (intersection) intersection.observe(parent); else visible.add(parent);
        const slot = document.createElement("div"); slot.className = "ct-ratios-root"; parent.append(slot); widgets.set(parent, slot);
      }
      slots = new Map([...widgets].map(([parent, slot]) => [parent.dataset.ctRatiosSlot!, slot]));
    };
    const showLocations = () => {
      const visibleIds = new Set([...widgets].flatMap(([host]) => visible.has(host) ? [host.dataset.ctRatiosSlot!] : []));
      const next = { menus: [...menus.values()], widgets: slots, visible: visibleIds };
      setLocations(previous => previous.menus.length === next.menus.length && previous.menus.every((slot, index) => slot === next.menus[index]) &&
        previous.widgets.size === next.widgets.size && [...previous.widgets].every(([id, slot]) => next.widgets.get(id) === slot) &&
        previous.visible.size === visibleIds.size && [...previous.visible].every(id => visibleIds.has(id)) ? previous : next);
    };
    const discover = () => {
      reconcileMenus(); reconcileWidgets(); showLocations();
      inScope = menus.size > 0 || !!document.querySelector(dashboardSelector);
      if (inScope) requestRefresh(); else schedule();
    };
    const drawerObserver = new MutationObserver(discover);
    const stop = observePageStructure(records => {
      if (containsChangedElements(records, nativeStructure)) discover();
      else if (records.some(({ type }) => type === "attributes") || containsChangedElements(records, widgetSelector) ||
        [...menus.entries(), ...widgets.entries()].some(([parent, slot]) => slot.parentElement !== parent)) {
        reconcileMenus(); reconcileWidgets(); showLocations(); schedule();
      }
    });
    const visibilityChanged = () => { if (document.hidden) schedule(); else discover(); };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    let path = location.pathname;
    const navigated = () => {
      if (path === location.pathname) return;
      path = location.pathname;
      discover();
    };
    resume.current = schedule;
    document.addEventListener("visibilitychange", visibilityChanged);
    navigation?.addEventListener("currententrychange", navigated);
    window.addEventListener("popstate", navigated);
    discover();
    return () => {
      closed = true; clearTimeout(timer); intersection?.disconnect(); drawerObserver.disconnect(); stop();
      document.removeEventListener("visibilitychange", visibilityChanged);
      navigation?.removeEventListener("currententrychange", navigated);
      window.removeEventListener("popstate", navigated);
      resume.current = () => {};
      reader.current?.dispose(); reader.current = null;
      for (const slot of [...menus.values(), ...widgets.values()]) slot.remove();
    };
  }, [publish]);
  const command: Command = useCallback(async (method, params = {}) => {
    if (pending.current || !reader.current) throw Error("Hay un cambio guardándose. Esperá a que termine.");
    pending.current = true; commandVersion.current++; setBusy(true);
    const source = current.current;
    try {
      const next = await reader.current.call<RatiosState>(method, { context: source.context, dashboardId: source.dashboardId, ...params });
      publish(next);
    } catch (error) {
      // A removed panel has already unmounted, so its inline error cannot be seen.
      if (method === "ratiosRemove") setNotice(error instanceof Error ? error.message : "No se pudo confirmar la eliminación del widget. Recargá Matriz para comprobarlo.");
      throw error;
    } finally { pending.current = false; setBusy(false); resume.current(); }
  }, [publish]);
  const search: Search = useCallback(query => {
    const source = current.current;
    return reader.current ? reader.current.call<RatioInstrument[]>("ratiosSearch", { context: source.context, dashboardId: source.dashboardId, query }) : Promise.resolve([]);
  }, []);
  function addWidget(method: "ratiosAdd" | "dollarAdd", slot: HTMLElement) {
    setMenuIssue("");
    void command(method).then(() => {
      // Native popovers can overlap the new panel. Close the add menu once the saved panel is ready.
      const trigger = slot.closest<HTMLButtonElement>(".CustomDashboardButton") || document.querySelector<HTMLButtonElement>(".CustomDashboardButton");
      if (trigger?.textContent?.trim().startsWith("Cerrar")) trigger.click();
      const drawer = slot.closest("#ToolPanel .ToolContent");
      if (drawer?.querySelector(".ToolContentHeaderText")?.textContent?.trim() === "Nuevo widget") drawer.querySelector<HTMLElement>(".ToolContentHeader .fa-arrow-right[role=button]")?.click();
    }).catch(error => setMenuIssue(error.message));
  }
  return <>
    {notice && <div className="ct-ratios-notice" role="alert"><span>{notice}</span><button type="button" aria-label="Cerrar aviso de Ratios" onClick={() => setNotice("")}>×</button></div>}
    {locations.menus.map((slot, index) => createPortal(<>
      <button type="button" className="ant-btn ant-btn-default WidgetComponentCardContent ct-ratios-add" disabled={busy || !snapshot.canAdd}
        title={snapshot.issue || "Tabla de ratios de instrumentos"} onClick={() => addWidget("ratiosAdd", slot)}>{busy ? "Guardando…" : "RATIOS · CHUCHOTRIZ"}</button>
      <button type="button" className="ant-btn ant-btn-default WidgetComponentCardContent ct-ratios-add" disabled={busy || !snapshot.canAdd}
        title={snapshot.issue || "Gráfico intradiario de un par de instrumentos"} onClick={() => addWidget("dollarAdd", slot)}>DÓLAR INTRADIARIO · CHUCHOTRIZ</button>
      {menuIssue && <p className="ct-ratios-menu-error" role="status">{menuIssue}</p>}
    </>, slot, `menu-${index}`))}
    {snapshot.widgets.map(widget => {
      const slot = locations.widgets.get(widget.config.id);
      return slot ? createPortal(<RatiosWidget widget={widget} snapshot={snapshot} command={command} search={search} busy={busy} />, slot, widget.config.id) : null;
    })}
    {snapshot.dollarWidgets?.map(widget => {
      const slot = locations.widgets.get(widget.config.id);
      return slot ? createPortal(<DollarWidget widget={widget} command={command} search={search} busy={busy} visible={locations.visible.has(widget.config.id)} />, slot, widget.config.id) : null;
    })}
  </>;
}
