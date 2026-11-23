import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarketReader } from "../optionsSimulator/market";
import ToolbarIcon from "../ToolbarIcon";
import { RatioChartLink } from "./RatioChart";
import { calculateRatio, defaultRatioColumns, defaultRatioFormat, emptyState, exactTickerMatches, instrumentDetail, numberLabel, pairLabel, ratioLabel, tickerKey, tradeLabel, type RatioColumns, type RatioFormat, type RatioInstrument, type RatioPair, type RatiosState, type RatioWidgetState } from "./model";
import "./RatiosDashboard.css";

type Mutation = "ratiosAdd" | "ratiosEdit" | "ratiosRemove" | "ratiosResize" | "ratiosColumns";
type Command = (method: Mutation, params?: Record<string, unknown>) => Promise<void>;
type Search = (query: string) => Promise<RatioInstrument[]>;

export function InstrumentPicker({ label, value, onChange, search, disabled, autoFocus = false }: {
  label: string; value?: RatioInstrument; onChange(value?: RatioInstrument): void; search: Search; disabled: boolean; autoFocus?: boolean;
}) {
  const id = useId(), [query, setQuery] = useState(value?.symbol || ""), [options, setOptions] = useState<RatioInstrument[]>([]);
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [issue, setIssue] = useState("");
  const [resolving, setResolving] = useState(false);
  const generation = useRef(0), latestQuery = useRef(query);
  const input = useRef<HTMLInputElement>(null), focused = useRef(false);
  useEffect(() => {
    if (autoFocus && !disabled && !focused.current) { input.current?.focus(); focused.current = true; }
  }, [autoFocus, disabled]);
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
    setOpen(false);
    const text = latestQuery.current.trim();
    if (!text || (value && tickerKey(value.symbol) === tickerKey(text))) return;
    const request = ++generation.current;
    setResolving(true); setIssue("");
    try {
      const matches = exactTickerMatches(text, await search(text));
      if (request !== generation.current) return;
      if (matches.length === 1) choose(matches[0]);
      else setIssue(matches.length > 1 ? "Más de un instrumento coincide; elegí uno de la lista." : "No se encontró ese ticker exacto.");
    } catch (error) { if (request === generation.current) setIssue(error instanceof Error ? error.message : "No se pudo buscar el instrumento."); }
    finally { if (request === generation.current) setResolving(false); }
  };
  return <div className="ct-ratio-picker">
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list"
      aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
      value={query} disabled={disabled} autoComplete="off" maxLength={60} placeholder="Buscar instrumento"
      onChange={event => { generation.current++; setResolving(false); latestQuery.current = event.target.value; setOptions([]); setActive(0); setIssue(""); setQuery(event.target.value); onChange(undefined); setOpen(true); }}
      onFocus={() => { generation.current++; setResolving(false); setOpen(!value || tickerKey(value.symbol) !== tickerKey(query)); }} onBlur={() => void resolveOnBlur()}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(options.length - 1, n + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter" && open && options[active]) { event.preventDefault(); choose(options[active]); }
      }} />
    <small title={value?.id} role="status">{value ? instrumentDetail(value) : resolving ? "Buscando ticker…" : issue || "Ingresá el ticker o elegí un instrumento"}</small>
    {open && query.trim() && <ul id={`${id}-options`} role="listbox" aria-label={`Resultados de ${label}`}>
      {options.map((item, index) => <li key={item.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
        <strong>{item.symbol}</strong><span>{instrumentDetail(item)}</span>
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
  const [formatOverride, setFormatOverride] = useState<RatioFormat>(), [editorSession, setEditorSession] = useState(0);
  const format = formatOverride ?? (compare ? "percent" : defaultRatioFormat(a, b));
  const [issue, setIssue] = useState("");
  const resize = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const revision = useRef(cfg.revision);
  useEffect(() => { if (!editing) revision.current = cfg.revision; }, [cfg.revision, editing]);
  const begin = (pair?: RatioPair) => { setA(pair?.a); setB(pair?.b); setC(pair?.c); setCompare(!!pair?.c); setFormatOverride(pair ? pair.format || "number" : undefined); setEditorSession(n => n + 1); setEditing(pair?.id || "new"); revision.current = cfg.revision; setIssue(""); };
  const run = async (method: Mutation, params: Record<string, unknown>) => {
    setIssue("");
    try { await command(method, { widgetId: cfg.id, revision: cfg.revision, ...params }); return true; }
    catch (error) { setIssue(error instanceof Error ? error.message : "No se pudo guardar el cambio."); return false; }
  };
  const savePairs = (pairs: RatioPair[], expectedRevision = cfg.revision) => run("ratiosEdit", {
    schema: 2, revision: expectedRevision, pairs: pairs.map(p => ({ id: p.id, a: p.a.id, b: p.b.id, ...(p.c ? { c: p.c.id } : {}), format: p.format || "number" }))
  });
  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resize.current) return;
    const start = resize.current; resize.current = null;
    if (root.current) { root.current.style.width = ""; root.current.style.height = ""; }
    void run("ratiosResize", { width: start.width + event.clientX - start.x, height: start.height + event.clientY - start.y });
  };
  return <section className="ct-ratios" ref={root} aria-label="Ratios de instrumentos">
    <header className="ct-ratios-title"><strong>Ratios</strong><span className="ct-ratios-header-actions NoDraggable">
      <button type="button" aria-label="Agregar ratio" title="Agregar ratio" disabled={busy || cfg.pairs.length >= 50} onClick={() => begin()}>＋</button>
      <button type="button" aria-label="Cerrar widget de ratios" title="Quitar este widget del dashboard" disabled={busy} onClick={() => void run("ratiosRemove", {})}>×</button>
    </span></header>
    <div className="ct-ratios-content NoDraggable">
      {editing && <form className="ct-ratios-editor" onSubmit={event => {
        event.preventDefault();
        if (!a || !b || compare && !c) { setIssue("Seleccioná los instrumentos y la referencia de la lista."); return; }
        if (a.id === b.id) { setIssue("Elegí instrumentos diferentes para A y B."); return; }
        const pair = { id: editing === "new" ? crypto.randomUUID() : editing, a, b, ...(compare && c ? { c } : {}), format };
        const pairs = editing === "new" ? [...cfg.pairs, pair] : cfg.pairs.map(p => p.id === editing ? pair : p);
        void savePairs(pairs, revision.current).then(saved => { if (saved) setEditing(null); });
      }}>
        <div className="ct-ratios-pickers">
          <InstrumentPicker key={`${editorSession}-a`} label="A · Numerador" value={a} onChange={setA} search={search} disabled={busy} autoFocus />
          <span className="ct-ratios-division" aria-hidden="true">÷</span>
          <InstrumentPicker key={`${editorSession}-b`} label="B · Denominador" value={b} onChange={setB} search={search} disabled={busy} />
        </div>
        <label className="ct-ratios-compare"><input type="checkbox" checked={compare} disabled={busy} onChange={e => { setCompare(e.target.checked); setC(undefined); setFormatOverride(undefined); }} />Comparar A/B con una referencia</label>
        {compare && <InstrumentPicker key={`${editorSession}-c`} label="Referencia C · ej. Dólar oficial" value={c} onChange={setC} search={search} disabled={busy} />}
        <div className="ct-ratios-editor-actions"><label className="ct-ratios-format">Mostrar <select aria-label="Formato del ratio" value={format} disabled={busy} onChange={event => setFormatOverride(event.target.value as RatioFormat)}><option value="number">Número</option><option value="percent">Porcentaje (%)</option></select></label>
          <span>{compare ? format === "percent" ? "((A ÷ B) ÷ C − 1) × 100" : "(A ÷ B) ÷ C" : format === "percent" ? "(Último A ÷ último B − 1) × 100" : "Último A ÷ último B · sin conversiones"}</span>
          <button type="button" disabled={busy} onClick={() => { setEditing(null); setIssue(""); }}>Cancelar</button>
          <button type="submit" disabled={busy || !a || !b || compare && !c}>{busy ? "Guardando…" : editing === "new" ? "Agregar" : "Guardar"}</button>
        </div>
      </form>}
      {(issue || snapshot.issue || widget.issue) && <p className="ct-ratios-issue" role="status">{issue || snapshot.issue || widget.issue}</p>}
      <div className="ct-ratios-table-wrap"><table>
        <thead><tr><th>Par A/B</th>{columns.lastA && <th>Último A</th>}{columns.lastB && <th>Último B</th>}{showReference && <th>Referencia C</th>}<th>Ratio</th><th title="Comparación con el ratio de las referencias diarias de Matriz">Var. diaria</th><th><span className="ct-ratios-sr">Acciones</span><ColumnOptions visible={columns} busy={busy} onChange={visible => { void run("ratiosColumns", { columnsRevision: widget.columns?.revision ?? 0, columns: visible }); }} /></th></tr></thead>
        <tbody>{cfg.pairs.map(pair => {
          const qa = snapshot.quotes[pair.a.id], qb = snapshot.quotes[pair.b.id], qc = pair.c ? snapshot.quotes[pair.c.id] : undefined;
          const result = calculateRatio(qa, qb, pair.c ? qc ?? {} : undefined);
          const age = Math.max(qa?.tradedAt === undefined ? 0 : Date.now() - qa.tradedAt, qb?.tradedAt === undefined ? 0 : Date.now() - qb.tradedAt, qc?.tradedAt === undefined ? 0 : Date.now() - qc.tradedAt);
          const clock = `A: ${tradeLabel(qa?.tradedAt)} · B: ${tradeLabel(qb?.tradedAt)}${pair.c ? ` · C: ${tradeLabel(qc?.tradedAt)}` : ""}`;
          return <tr key={pair.id}>
            <td className="ct-ratios-pair" title={`A: ${instrumentDetail(pair.a)} · B: ${instrumentDetail(pair.b)}\n${clock}`}><strong>{pairLabel(pair)}</strong>
              {age > 15 * 60 * 1000 && <span className="ct-ratios-old" role="img" aria-label="Última operación antigua" title={clock}>◷</span>}
            </td>
            {columns.lastA && <td title={`Última operación A: ${tradeLabel(qa?.tradedAt)}`}>{numberLabel(qa?.last)}</td>}
            {columns.lastB && <td title={`Última operación B: ${tradeLabel(qb?.tradedAt)}`}>{numberLabel(qb?.last)}</td>}
            {showReference && <td title={pair.c ? `${pair.c.symbol} · ${tradeLabel(qc?.tradedAt)}` : undefined}>{pair.c ? numberLabel(qc?.last) : "—"}</td>}
            <td className="ct-ratios-value" title={result.issue || (pair.c ? "(A/B)/C; porcentaje = ((A/B)/C − 1) × 100. Entre paréntesis: |A/B − C|, en la unidad de C." : undefined) || (pair.format === "percent" ? "(Último A ÷ último B − 1) × 100" : "Último A ÷ último B")} aria-label={result.issue}>{ratioLabel(result.ratio, pair.format, result.absoluteDifference)}</td>
            <td className={result.change === undefined || result.change === 0 ? "" : result.change > 0 ? "ct-ratios-up" : "ct-ratios-down"} title={result.referenceIssue || "(Ratio actual / ratio de referencia diaria − 1) × 100"} aria-label={result.referenceIssue}>
              {result.change === undefined ? "—" : result.change.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) + "%"}
            </td>
            <td className="ct-ratios-actions">
              <RatioChartLink pair={pair} />
              <button type="button" aria-label={`Editar ${pairLabel(pair)}`} title="Editar par" disabled={busy} onClick={() => begin(pair)}>✎</button>
              <button type="button" aria-label={`Invertir ${pairLabel(pair)}`} title={pair.c ? "Comparación (A/B)/C; editá la fórmula para cambiar el sentido" : "Invertir A/B"} disabled={busy || !!pair.c} onClick={() => void savePairs(cfg.pairs.map(p => p.id === pair.id ? { ...p, a: p.b, b: p.a } : p))}>⇄</button>
              <button type="button" aria-label={`Eliminar ${pairLabel(pair)}`} title="Eliminar ratio" disabled={busy} onClick={() => void savePairs(cfg.pairs.filter(p => p.id !== pair.id))}>×</button>
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

export default function RatiosDashboard() {
  const [snapshot, setSnapshot] = useState<RatiosState>(emptyState), [busy, setBusy] = useState(false), [menuIssue, setMenuIssue] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef(snapshot), reader = useRef<MarketReader | null>(null), pending = useRef(false);
  current.current = snapshot;
  const [locations, setLocations] = useState<{ menus: HTMLElement[]; widgets: Map<string, HTMLElement> }>({ menus: [], widgets: new Map() });
  useEffect(() => {
    if (typeof chrome?.runtime?.getURL !== "function") return;
    const client = new MarketReader("ratios-reader.js"); reader.current = client;
    let closed = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try { const next = await client.call<RatiosState>("ratiosState"); if (!closed) setSnapshot(next); }
      catch (error) { if (!closed) setSnapshot(previous => ({ ...previous, canAdd: false, quotes: {}, issue: error instanceof Error ? error.message : "Ratios no disponible." })); }
      finally { if (!closed) timer = setTimeout(() => void tick(), 1500); }
    };
    void tick();
    return () => { closed = true; clearTimeout(timer); reader.current = null; client.dispose(); };
  }, []);
  useEffect(() => {
    const menus = new Map<Element, HTMLElement>(), widgets = new Map<Element, HTMLElement>();
    const reconcile = () => {
      const lists = [...document.querySelectorAll(".WidgetsComponentsPopoverList")];
      // Some Matriz deployments expose the same menu in the right toolbar.
      for (const drawer of document.querySelectorAll("#ToolPanel .ToolContent")) {
        if (drawer.querySelector(".ToolContentHeaderText")?.textContent?.trim() === "Nuevo widget" && !drawer.querySelector(".WidgetsComponentsPopoverList")) lists.push(drawer);
      }
      for (const [parent, slot] of menus) if (!parent.isConnected || !lists.includes(parent)) { slot.remove(); menus.delete(parent); }
      for (const list of lists) if (!menus.get(list)?.isConnected) {
        const slot = document.createElement("div"); slot.className = "WidgetComponentCard ct-ratios-menu-slot"; list.append(slot); menus.set(list, slot);
      }
      const parents = [...document.querySelectorAll<HTMLElement>("[data-ct-ratios-slot]")];
      for (const [parent, slot] of widgets) if (!parent.isConnected || !parents.includes(parent as HTMLElement)) { slot.remove(); widgets.delete(parent); }
      for (const parent of parents) if (!widgets.get(parent)?.isConnected) {
        const slot = document.createElement("div"); slot.className = "ct-ratios-root"; parent.append(slot); widgets.set(parent, slot);
      }
      const next = { menus: [...menus.values()], widgets: new Map([...widgets].map(([parent, slot]) => [(parent as HTMLElement).dataset.ctRatiosSlot!, slot])) };
      setLocations(previous => previous.menus.length === next.menus.length && previous.menus.every((slot, index) => slot === next.menus[index]) && previous.widgets.size === next.widgets.size && [...previous.widgets].every(([id, slot]) => next.widgets.get(id) === slot) ? previous : next);
    };
    const observer = new MutationObserver(reconcile);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ct-ratios-slot"] });
    reconcile();
    return () => { observer.disconnect(); for (const slot of [...menus.values(), ...widgets.values()]) slot.remove(); };
  }, []);
  const command: Command = useCallback(async (method, params = {}) => {
    if (pending.current || !reader.current) throw Error("Hay un cambio guardándose. Esperá a que termine.");
    pending.current = true; setBusy(true);
    const source = current.current;
    try {
      const next = await reader.current.call<RatiosState>(method, { context: source.context, dashboardId: source.dashboardId, ...params });
      setSnapshot(next);
    } catch (error) {
      // A removed panel has already unmounted, so its inline error cannot be seen.
      if (method === "ratiosRemove") setNotice(error instanceof Error ? error.message : "No se pudo confirmar la eliminación del widget. Recargá Matriz para comprobarlo.");
      throw error;
    } finally { pending.current = false; setBusy(false); }
  }, []);
  const search: Search = useCallback(query => {
    const source = current.current;
    return reader.current ? reader.current.call<RatioInstrument[]>("ratiosSearch", { context: source.context, dashboardId: source.dashboardId, query }) : Promise.resolve([]);
  }, []);
  return <>
    {notice && <div className="ct-ratios-notice" role="alert"><span>{notice}</span><button type="button" aria-label="Cerrar aviso de Ratios" onClick={() => setNotice("")}>×</button></div>}
    {locations.menus.map((slot, index) => createPortal(<>
      <button type="button" className="ant-btn ant-btn-default WidgetComponentCardContent ct-ratios-add" disabled={busy || !snapshot.canAdd}
        title={snapshot.issue || "Tabla de ratios de instrumentos"} onClick={() => {
          setMenuIssue(""); void command("ratiosAdd").then(() => {
            // Native popovers can overlap the new panel. Close the add menu just
            // as a native widget selection does, after the saved panel is ready.
            const trigger = slot.closest<HTMLButtonElement>(".CustomDashboardButton") || document.querySelector<HTMLButtonElement>(".CustomDashboardButton");
            if (trigger?.textContent?.trim().startsWith("Cerrar")) trigger.click();
            const drawer = slot.closest("#ToolPanel .ToolContent");
            if (drawer?.querySelector(".ToolContentHeaderText")?.textContent?.trim() === "Nuevo widget") drawer.querySelector<HTMLElement>(".ToolContentHeader .fa-arrow-right[role=button]")?.click();
          }).catch(error => setMenuIssue(error.message));
        }}>{busy ? "Guardando…" : "RATIOS · CHUCHOTRIZ"}</button>
      {menuIssue && <p className="ct-ratios-menu-error" role="status">{menuIssue}</p>}
    </>, slot, `menu-${index}`))}
    {snapshot.widgets.map(widget => {
      const slot = locations.widgets.get(widget.config.id);
      return slot ? createPortal(<RatiosWidget widget={widget} snapshot={snapshot} command={command} search={search} busy={busy} />, slot, widget.config.id) : null;
    })}
  </>;
}
