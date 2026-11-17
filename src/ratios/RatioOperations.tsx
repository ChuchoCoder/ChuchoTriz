import { useCallback, useEffect, useRef, useState } from "react";
import { InstrumentPicker } from "./RatiosDashboard";
import { currencyLabel, numberLabel, tradeLabel } from "./model";
import { formatOptionInput } from "../optionsSimulator/format";
import { numeric } from "../optionsSimulator/model";
import { useRatioMarket } from "./tradingMarket";
import { readTradingBook, saveTradingBook, tradingStorageKey } from "./tradingStorage";
import { applyDefaultWatch, closeOperation, closedQuantity, correctOperation, counterpart, currentRatio, defaultMarketRights, emptyBook, goalInput, isRateInstrument, resolveDefaultWatch,
  goalReached, instrumentKind, isClosed, MAX_OPERATIONS, MAX_WATCH, operationPnl, pairRatioLabel, parseGoal, remaining, sameCurrency,
  validateBook, validateOperation, type RatioOperation, type TradingBook, type TradingInstrument, type TradingLeg, type TradingQuote } from "./trading";
import "./RatioOperations.css";

type View = "monitor" | "opening" | "operations";
type Source = "last" | "bid" | "ask" | "manual" | "saved";
interface Draft {
  a?: TradingInstrument; b?: TradingInstrument; pa: string; pb: string; qa: string; fa: string; fb: string; sa: string; sb: string;
  ddmma: string; ddmmb: string; commission: string; fx: string; target: string; at: string; direction: 1 | -1; sourceA: Source; sourceB: Source;
}
const dateInput = (iso = new Date().toISOString()) => new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16).replace(" ", "T");
const emptyDraft = (): Draft => ({ pa: "", pb: "", qa: "100", fa: "", fb: "", sa: "1", sb: "1", ddmma: "", ddmmb: "", commission: "0", fx: "", target: "", at: dateInput(), direction: 1, sourceA: "last", sourceB: "last" });
const input = (n?: number) => n === undefined ? "" : formatOptionInput(n);
const signed = (n?: number) => n === undefined ? "" : n > 0 ? "ro-up" : n < 0 ? "ro-down" : "";
const money = (n: number | undefined, c: string) => `${currencyLabel(c)} ${n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rawRatio = (a?: TradingQuote, b?: TradingQuote) => !a?.issue && !b?.issue && a?.last && b?.last ? a.last / b.last : undefined;

export default function RatioOperations({ active }: { active: boolean }) {
  const [session, setSession] = useState<{ scope: string; book: TradingBook; error?: string }>();
  const [view, setView] = useState<View>("monitor"), [draft, setDraft] = useState<Draft>(emptyDraft);
  const [watchA, setWatchA] = useState<TradingInstrument>(), [watchB, setWatchB] = useState<TradingInstrument>();
  const [selected, setSelected] = useState<string>(), [all, setAll] = useState(false), [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(""), [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<{ id: string; snapshot: string }>();
  const [deleted, setDeleted] = useState<{ scope: string; op: RatioOperation; index: number }>();
  const [closePrices, setClosePrices] = useState<[string, string]>(["", ""]), closeDirty = useRef([false, false]);
  const [pickerSession, setPickerSession] = useState(0);
  const [loadingDefaults, setLoadingDefaults] = useState(false), defaultsAttempt = useRef<string | undefined>(undefined), defaultsGeneration = useRef(0);
  const pending = useRef(false), current = useRef({ session, active }); current.current = { session, active };
  const book = session?.book ?? emptyBook();
  const ids = [...book.watch.flatMap(p => [p.a.id, p.b.id]), ...book.operations.filter(o => !isClosed(o)).flatMap(o => o.legs.map(l => l.instrument.id)),
    ...(draft.a ? [draft.a.id] : []), ...(draft.b ? [draft.b.id] : [])];
  const market = useRatioMarket(active, ids, session?.scope), scope = market.context?.storageScope;
  const marketRef = useRef(market); marketRef.current = market;
  const ready = active && !!scope && session?.scope === scope && !session.error;
  const available = ready && !busy && !loadingDefaults;
  const priceSearch = useCallback(async (query: string) => (await market.search(query)).filter(i => !isRateInstrument(i)), [market.search]);
  const op = ready ? book.operations.find(o => o.id === selected) : undefined;
  const edited = ready && edit ? book.operations.find(o => o.id === edit.id) : undefined;
  const partiallyClosed = !!edited?.legs.some(l => l.exits.length);
  const quotes = market.quotes;

  useEffect(() => {
    setSession(undefined); setSelected(undefined); setEdit(undefined); setDeleted(undefined); setDraft(emptyDraft()); setWatchA(undefined); setWatchB(undefined);
    defaultsGeneration.current++; defaultsAttempt.current = undefined; setLoadingDefaults(false);
    setView("monitor"); setIssue(""); setNotice(""); setPickerSession(n => n + 1);
    if (!active || !scope) return;
    let closed = false;
    const key = tradingStorageKey(scope);
    void readTradingBook(key).then(next => { if (!closed) setSession({ scope, book: next }); })
      .catch(error => { if (!closed) setSession({ scope, book: emptyBook(), error: error.message }); });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes[key]) return;
      try { const next = changes[key].newValue === undefined ? emptyBook() : validateBook(changes[key].newValue); if (!closed) setSession({ scope, book: next }); }
      catch { if (!closed) setSession(previous => previous && { ...previous, error: "El registro cambió a un formato inválido; no se reemplazó el guardado." }); }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { closed = true; chrome.storage.onChanged.removeListener(changed); };
  }, [scope, active]);

  useEffect(() => {
    if (ready && scope && book.watchDefaults !== 1 && defaultsAttempt.current !== scope) {
      defaultsAttempt.current = scope; void loadDefaults(false);
    }
  }, [ready, scope, book.watchDefaults]);

  useEffect(() => { closeDirty.current = [false, false]; setClosePrices(["", ""]); }, [selected]);
  useEffect(() => {
    setDraft(previous => {
      const pa = previous.pa || previous.sourceA !== "last" ? previous.pa : input(quotes[previous.a?.id || ""]?.last);
      const pb = previous.pb || previous.sourceB !== "last" ? previous.pb : input(quotes[previous.b?.id || ""]?.last);
      return pa === previous.pa && pb === previous.pb ? previous : { ...previous, pa, pb };
    });
    setClosePrices(previous => previous.map((p, i) => closeDirty.current[i] ? p : input(quotes[op?.legs[i].instrument.id || ""]?.last)) as [string, string]);
  }, [quotes, op?.id]);

  async function commit(change: (book: TradingBook) => TradingBook): Promise<boolean> {
    const source = current.current.session, context = marketRef.current.context;
    if (!current.current.active || pending.current || !source || source.error || !context || source.scope !== context.storageScope) { setIssue("Esperá a que se cargue el registro de la cuenta activa."); return false; }
    pending.current = true; setBusy(true); setIssue("");
    try {
      const next = change(source.book);
      const saved = await saveTradingBook(tradingStorageKey(source.scope), source.book, next, () => marketRef.current.verify(context));
      if (current.current.session?.scope === source.scope && marketRef.current.context?.storageScope === source.scope) setSession({ scope: source.scope, book: saved });
      return current.current.active && marketRef.current.context?.storageScope === source.scope;
    } catch (error) {
      if (marketRef.current.context?.storageScope === source.scope) setIssue(error instanceof Error ? error.message : "No se pudo guardar el registro.");
      return false;
    } finally { pending.current = false; setBusy(false); }
  }
  async function loadDefaults(restore: boolean) {
    const context = marketRef.current.context, generation = defaultsGeneration.current;
    if (!context || loadingDefaults) return;
    setLoadingDefaults(true);
    try {
      const defaults = await resolveDefaultWatch(marketRef.current.search);
      await marketRef.current.verify(context);
      if (generation !== defaultsGeneration.current || !current.current.active || current.current.session?.scope !== context.storageScope) return;
      if (!defaults.watch.length) throw Error("Los pares predeterminados no están disponibles en este catálogo. Volvé a intentar cuando se complete la carga.");
      const ok = await commit(base => applyDefaultWatch(base, defaults.watch, restore));
      if (ok && generation === defaultsGeneration.current && defaults.missing.length) setNotice(`Pares no disponibles o ambiguos en este catálogo: ${defaults.missing.join(", ")}. Podés reintentar con Agregar pares predeterminados.`);
    } catch (error) {
      if (generation === defaultsGeneration.current) setIssue(error instanceof Error ? error.message : "No se pudieron cargar los pares predeterminados.");
    } finally { if (generation === defaultsGeneration.current) setLoadingDefaults(false); }
  }
  function selectInstrument(key: "a" | "b", instrument?: TradingInstrument) {
    setDraft(previous => {
      if (!instrument) return { ...previous, [key]: undefined };
      const first = key === "a", changed = previous[key]?.id !== instrument.id;
      return { ...previous, [key]: instrument, [first ? "pa" : "pb"]: input(quotes[instrument.id]?.last),
        [first ? "fa" : "fb"]: input(instrument.amountFactor), [first ? "sa" : "sb"]: input(instrument.quantityStep),
        [first ? "ddmma" : "ddmmb"]: input(defaultMarketRights(instrument)), [first ? "sourceA" : "sourceB"]: "last", target: changed ? "" : previous.target };
    });
  }
  function begin(a: TradingInstrument, b: TradingInstrument) {
    if (isRateInstrument(a) || isRateInstrument(b)) { setIssue("Las cauciones se comparan como tasas TNA y sólo se monitorean."); return; }
    const step = a.quantityStep ?? 1;
    setEdit(undefined); setDraft({ ...emptyDraft(), a, b, pa: input(quotes[a.id]?.last), pb: input(quotes[b.id]?.last), qa: String(Math.ceil(100 / step) * step),
      fa: input(a.amountFactor), fb: input(b.amountFactor), sa: input(a.quantityStep), sb: input(b.quantityStep), ddmma: input(defaultMarketRights(a)), ddmmb: input(defaultMarketRights(b)) });
    setPickerSession(n => n + 1); setView("opening"); setIssue(""); setNotice("");
  }
  function beginEdit(o: RatioOperation) {
    setEdit({ id: o.id, snapshot: JSON.stringify(o) }); setSelected(o.id);
    setDraft({ a: o.legs[0].instrument, b: o.legs[1].instrument, pa: input(o.legs[0].entry), pb: input(o.legs[1].entry), qa: input(o.legs[0].quantity),
      fa: input(o.legs[0].factor), fb: input(o.legs[1].factor), sa: input(o.legs[0].step), sb: input(o.legs[1].step), ddmma: input(o.legs[0].ddmm), ddmmb: input(o.legs[1].ddmm),
      commission: input(o.commission), fx: input(o.fx), target: goalInput(o), at: dateInput(o.openedAt), direction: o.direction, sourceA: "saved", sourceB: "saved" });
    setPickerSession(n => n + 1); setView("opening"); setIssue(""); setNotice("");
  }
  const pa = numeric(draft.pa), pb = numeric(draft.pb), qa = numeric(draft.qa), fa = numeric(draft.fa), fb = numeric(draft.fb), sa = numeric(draft.sa), sb = numeric(draft.sb);
  const mixed = draft.a && draft.b && !sameCurrency(draft.a, draft.b);
  const fx = mixed ? numeric(draft.fx) : 1;
  const qb = draft.a && draft.b ? counterpart(qa, pa, pb, fa, fb, sb, draft.a, draft.b, 1 / fx) : NaN;

  async function saveEntry() {
    const a = draft.a, b = draft.b;
    if (!a || !b) { setIssue("Seleccioná ambos instrumentos, con coincidencia exacta o desde el catálogo."); return; }
    try {
      const targetRatio = edited && draft.target === goalInput(edited) ? edited.targetRatio : parseGoal(draft.target, a, b);
      const openedAt = edited && draft.at === dateInput(edited.openedAt) ? edited.openedAt : new Date(draft.at + ":00-03:00").toISOString();
      const makeLeg = (instrument: TradingInstrument, i: number): TradingLeg => ({ instrument, side: (i === 0 ? draft.direction : -draft.direction) as 1 | -1,
        quantity: i === 0 ? qa : qb, entry: i === 0 ? pa : pb, factor: i === 0 ? fa : fb, step: i === 0 ? sa : sb, ddmm: numeric(i === 0 ? draft.ddmma : draft.ddmmb), exits: [] });
      let next: RatioOperation = { id: edit?.id ?? crypto.randomUUID(), openedAt, direction: draft.direction, commission: numeric(draft.commission), fx,
        targetRatio, legs: [makeLeg(a, 0), makeLeg(b, 1)] };
      validateOperation(next);
      const wasEdit = !!edit;
      const ok = await commit(base => {
        const old = edit ? base.operations.find(o => o.id === edit.id) : undefined;
        if (edit && (!old || JSON.stringify(old) !== edit.snapshot)) throw Error("La operación cambió. Volvé a pulsar Editar para cargar su estado actual.");
        if (old) next = correctOperation(old, next);
        if (!old && base.operations.length >= MAX_OPERATIONS) throw Error(`El registro admite ${MAX_OPERATIONS} operaciones. Eliminá un registro antes de agregar otro.`);
        const operations = old ? base.operations.map(o => o.id === old.id ? next : o) : [...base.operations, next];
        return { ...base, operations };
      });
      if (ok) { setSelected(next.id); setEdit(undefined); setAll(isClosed(next)); setView("operations"); setNotice(wasEdit ? "Cambios guardados en la operación." : "Apertura registrada localmente. No se enviaron órdenes."); }
    } catch (error) { setIssue(error instanceof Error ? error.message : "Revisá los datos de la apertura."); }
  }
  async function remove(o: RatioOperation) {
    const index = book.operations.findIndex(p => p.id === o.id), snapshot = JSON.stringify(o);
    const ok = await commit(base => {
      if (JSON.stringify(base.operations.find(p => p.id === o.id)) !== snapshot) throw Error("La operación cambió. Revisala antes de eliminarla.");
      return { ...base, operations: base.operations.filter(p => p.id !== o.id) };
    });
    if (ok && scope) { setDeleted({ scope, op: o, index }); if (selected === o.id) setSelected(undefined); if (edit?.id === o.id) { setEdit(undefined); setDraft(emptyDraft()); } setNotice("Registro eliminado. Podés deshacer la eliminación."); }
  }
  async function undo() {
    const d = deleted;
    if (!d || d.scope !== scope) return;
    const ok = await commit(base => {
      if (base.operations.some(o => o.id === d.op.id) || base.operations.length >= MAX_OPERATIONS) throw Error("No se puede restaurar ese registro en el estado actual.");
      const operations = [...base.operations]; operations.splice(Math.min(d.index, operations.length), 0, d.op); return { ...base, operations };
    });
    if (ok) { setSelected(d.op.id); setDeleted(undefined); setNotice("Registro restaurado."); }
  }
  async function registerClose(fraction: number) {
    if (!op) return;
    const snapshot = JSON.stringify(op);
    const ok = await commit(base => {
      const latest = base.operations.find(o => o.id === op.id);
      if (!latest || JSON.stringify(latest) !== snapshot) throw Error("La operación cambió; revisá sus cantidades antes de registrar el cierre.");
      const next = closeOperation(latest, fraction, closePrices.map(numeric) as [number, number], new Date().toISOString());
      return { ...base, operations: base.operations.map(o => o.id === latest.id ? next : o) };
    });
    if (ok) { setAll(true); setNotice("Cierre registrado localmente con los precios ingresados."); }
  }
  const pnlLines = (o: RatioOperation, field: "realized" | "pending" | "net" | "gross" | "commission" | "ddmm") => operationPnl(o, quotes).map(p =>
    <span key={p.currency} className={field === "commission" || field === "ddmm" ? "" : signed(p[field])} title={p.issue}>{money(p[field], p.currency)}</span>);
  const goalText = (o: RatioOperation) => o.targetRatio === null ? "Sin objetivo de ratio" : `Objetivo: ${pairRatioLabel(o.targetRatio, o.legs[0].instrument, o.legs[1].instrument)}${isClosed(o) ? "" : goalReached(o, currentRatio(o, quotes)) ? " · alcanzado" : " · pendiente"}`;
  const selectedPnl = op ? operationPnl(op, quotes) : [];

  function leg(key: "a" | "b") {
    const first = key === "a", instrument = draft[key], quote = instrument ? quotes[instrument.id] : undefined;
    const side = first ? draft.direction : -draft.direction, priceKey = first ? "pa" : "pb", factorKey = first ? "fa" : "fb", stepKey = first ? "sa" : "sb", ddmmKey = first ? "ddmma" : "ddmmb", sourceKey = first ? "sourceA" : "sourceB";
    const selectedPrice = numeric(draft[priceKey]), source = draft[sourceKey];
    const choose = (field: "last" | "bid" | "ask") => {
      const value = field === "last" ? quote?.last : quote?.[field]?.price;
      if (value === undefined) return;
      setDraft(p => ({ ...p, [priceKey]: input(value), [sourceKey]: field }));
    };
    const picker = (field: "bid" | "ask") => <button type="button" className={`ro-quote ${field}`} disabled={!available || !quote?.[field]}
      aria-label={`Usar ${field === "bid" ? "Bid" : "Ask"} de ${key.toUpperCase()}`} aria-pressed={source === field && selectedPrice === quote?.[field]?.price} onClick={() => choose(field)}>
      <small>{field === "bid" ? "Bid" : "Ask"}</small><strong>{numberLabel(quote?.[field]?.price)}</strong><small>Disponible {quote?.[field] ? numberLabel(quote[field]!.size) : "—"}</small></button>;
    return <section className="ro-leg" aria-label={`Pata ${key.toUpperCase()}`} key={key}>
      <header><strong>{first ? "1" : "2"} · Pata {key.toUpperCase()}</strong><span className={`ro-chip ${side === 1 ? "buy" : "sell"}`}>{side === 1 ? "Compra · Long" : "Venta · Short"}</span>{!first && <small>Cantidad automática</small>}</header>
      <div className="ro-leg-ident"><InstrumentPicker key={`${pickerSession}-${key}`} label={`Instrumento ${key.toUpperCase()}`} value={instrument} onChange={i => selectInstrument(key, i as TradingInstrument | undefined)} search={priceSearch} disabled={!available || partiallyClosed} />
        <label>{edit ? "Cantidad total" : "Cantidad"} {key.toUpperCase()} · {instrument?.quantityUnit || "unidades"}<input aria-label={`Cantidad ${key.toUpperCase()}`} type="number" min="1" step={first && Number.isFinite(sa) ? sa : 1} value={first ? draft.qa : Number.isFinite(qb) ? qb : ""} readOnly={!first} disabled={!available}
          onChange={e => setDraft(p => ({ ...p, qa: e.target.value }))} /></label></div>
      <div className="ro-prices">{picker("bid")}<div><button type="button" className="ro-last" disabled={!available || !quote?.last} onClick={() => choose("last")} aria-label={`Usar último de ${key.toUpperCase()}`}>Último <strong>{numberLabel(quote?.last)}</strong></button>
        <label>Precio de entrada {key.toUpperCase()}<input aria-label={`Precio de entrada ${key.toUpperCase()}`} type="number" min="0" step="any" value={draft[priceKey]} disabled={!available} onChange={e => setDraft(p => ({ ...p, [priceKey]: e.target.value, [sourceKey]: "manual" }))} required /></label>
        <small className="ro-source">Precio elegido: {{ last: "último", bid: "Bid", ask: "Ask", manual: "manual", saved: "registrado" }[source]}</small></div>{picker("ask")}</div>
      <div className="ro-leg-footer"><small>{instrument ? `${instrumentKind(instrument.cfi)} · ${currencyLabel(instrument.currency)} · ${instrument.amountFactor === .01 ? "precio por 100 nominales" : `monto = cantidad × precio × ${numberLabel(numeric(draft[factorKey]))}`}` : "Seleccioná el instrumento"}<br />Última operación: {tradeLabel(quote?.tradedAt)}</small>
        <label>DDMM %<input aria-label={`DDMM ${key.toUpperCase()} %`} type="number" min="0" max="100" step="0.0001" value={draft[ddmmKey]} disabled={!available} onChange={e => setDraft(p => ({ ...p, [ddmmKey]: e.target.value }))} required />
          <small>{instrument && defaultMarketRights(instrument) !== undefined ? `Default Premium: ${input(defaultMarketRights(instrument))}%${["Acción", "CEDEAR"].includes(instrumentKind(instrument.cfi)) ? " · IVA incluido" : ""}` : "Tipo sin default: completá la tasa"}</small></label></div>
      {instrument && (!instrument.amountFactor || !instrument.quantityStep) && <div className="ro-manual-units"><label>Factor monetario por unidad<input type="number" min="0" step="any" value={draft[factorKey]} disabled={!available || partiallyClosed} required onChange={e => setDraft(p => ({ ...p, [factorKey]: e.target.value }))} /></label><label>Lote mínimo<input type="number" min="1" step="1" value={draft[stepKey]} disabled={!available || partiallyClosed} required onChange={e => setDraft(p => ({ ...p, [stepKey]: e.target.value }))} /></label></div>}
    </section>;
  }

  return <section className="ct-ratio-ops" aria-label="Operaciones de ratios">
    <header className="ro-heading"><h2>Ratios · Long / Short</h2><small>Registro manual local por cuenta y sitio. No envía órdenes.</small></header>
    <nav className="ro-steps" aria-label="Pasos de ratios">{([["monitor", "Monitor"], ["opening", "Abrir operación de ratio"], ["operations", "Operaciones abiertas"]] as const).map(([key, label], i) =>
      <button key={key} type="button" aria-pressed={view === key} disabled={busy} onClick={() => { setView(key); setIssue(""); if (key === "operations" && !selected) setSelected(book.operations.find(o => all || !isClosed(o))?.id); }}>{i + 1} · {label}{key === "operations" ? ` (${ready ? book.operations.filter(o => !isClosed(o)).length : 0})` : ""}</button>)}</nav>
    {(market.issue || session?.error || issue) && <p className="ro-issue" role="alert">{issue || session?.error || market.issue}</p>}
    {!ready && !market.issue && !session?.error && <p role="status">Cargando el registro de la cuenta activa…</p>}
    {notice && <div className="ro-notice" role="status">{notice}{deleted?.scope === scope && <button type="button" disabled={!available} onClick={() => void undo()}>Deshacer eliminación</button>}</div>}
    {view === "monitor" && <div>
      <div className="ro-actions"><button type="button" disabled={!available} onClick={() => void loadDefaults(true)}>{loadingDefaults ? "Cargando pares…" : "Agregar pares predeterminados"}</button></div>
      <div className="ro-add-watch"><InstrumentPicker label="Instrumento A" key={`watch-a-${pickerSession}`} value={watchA} onChange={i => setWatchA(i as TradingInstrument | undefined)} search={market.search} disabled={!available} /><InstrumentPicker label="Instrumento B" key={`watch-b-${pickerSession}`} value={watchB} onChange={i => setWatchB(i as TradingInstrument | undefined)} search={market.search} disabled={!available} />
        <button type="button" disabled={!available || !watchA || !watchB} onClick={() => void commit(base => {
          if (!watchA || !watchB || watchA.id === watchB.id) throw Error("Elegí instrumentos diferentes.");
          if (base.watch.length >= MAX_WATCH) throw Error(`Podés observar hasta ${MAX_WATCH} pares.`);
          if (base.watch.some(p => p.a.id === watchA.id && p.b.id === watchB.id)) throw Error("El par ya está en el monitor.");
          return { ...base, watch: [...base.watch, { id: crypto.randomUUID(), a: watchA, b: watchB }] };
        })}>Agregar par</button></div>
      <div className="ro-table-wrap"><table><thead><tr><th>Par A/B</th><th>Último A</th><th>Último B</th><th>Ratio</th><th>Acciones</th></tr></thead><tbody>{ready && book.watch.map(p => {
        const rate = isRateInstrument(p.a) || isRateInstrument(p.b);
        return <tr key={p.id}><td><strong>{p.a.symbol}/{p.b.symbol}</strong><small>{currencyLabel(p.a.currency)} / {currencyLabel(p.b.currency)}{rate ? " · tasas TNA" : ""}</small></td><td>{numberLabel(quotes[p.a.id]?.last)}{isRateInstrument(p.a) ? "% TNA" : ""}</td><td>{numberLabel(quotes[p.b.id]?.last)}{isRateInstrument(p.b) ? "% TNA" : ""}</td><td className="ro-ratio">{pairRatioLabel(rawRatio(quotes[p.a.id], quotes[p.b.id]), p.a, p.b)}</td><td><div className="ro-actions"><button type="button" disabled={!available || rate} title={rate ? "Comparación de tasas TNA; no se valúa una operación con tasas como precios." : undefined} onClick={() => begin(p.a, p.b)}>{rate ? "Sólo monitor" : "Abrir operación"}</button><button type="button" disabled={!available} aria-label={`Quitar par ${p.a.symbol}/${p.b.symbol}`} onClick={() => void commit(base => ({ ...base, watch: base.watch.filter(x => x.id !== p.id) }))}>×</button></div></td></tr>;
      })}</tbody></table></div>
      {ready && !book.watch.length && <p className="ro-empty">Agregá un par al Monitor. Cuando decidas entrar, pulsá Abrir operación.</p>}
    </div>}
    {view === "opening" && <form onSubmit={e => { e.preventDefault(); void saveEntry(); }}>
      <div className="ro-entry-heading"><div><h3>{edit ? "Editar operación de ratio" : "Abrir operación de ratio"}</h3><small>{draft.a?.symbol || "A"}/{draft.b?.symbol || "B"} · precios elegidos de entrada</small></div><div><small>Ratio de apertura</small><output>{draft.a && draft.b && pa > 0 && pb > 0 ? pairRatioLabel(pa / pb, draft.a, draft.b) : "—"}</output></div></div>
      {edit && <p className="ro-notice">Las cantidades son totales de apertura. Los cierres registrados se conservan; corregir precios o gastos recalcula el resultado.</p>}
      <div className="ro-entry-grid"><div className="ro-direction"><button type="button" aria-pressed={draft.direction === 1} disabled={!available || partiallyClosed} onClick={() => setDraft(p => ({ ...p, direction: 1 }))}>Long A / Short B</button><button type="button" aria-pressed={draft.direction === -1} disabled={!available || partiallyClosed} onClick={() => setDraft(p => ({ ...p, direction: -1 }))}>Short A / Long B</button></div>
        {leg("a")}{leg("b")}
        <aside className="ro-entry-costs"><label>Comisión % · compra y venta<input aria-label="Comisión %" type="number" min="0" max="100" step="any" value={draft.commission} disabled={!available} required onChange={e => setDraft(p => ({ ...p, commission: e.target.value }))} /></label><small>Un único porcentaje en cada compra y venta, al abrir y cerrar.</small>
          <label>Fecha/hora de apertura · Argentina<input type="datetime-local" value={draft.at} max={dateInput()} disabled={!available} required onChange={e => setDraft(p => ({ ...p, at: e.target.value }))} /></label>
          <label>Ratio objetivo {draft.a && draft.b && sameCurrency(draft.a, draft.b) ? "(%)" : "(número)"} · opcional<input aria-label="Ratio objetivo" type="number" step="any" value={draft.target} disabled={!available} onChange={e => setDraft(p => ({ ...p, target: e.target.value }))} /></label><small>{draft.a && draft.b && sameCurrency(draft.a, draft.b) ? "(A/B − 1) × 100. Ej.: 1,065 → 6,50%." : "Cociente A/B sin conversiones."} {draft.direction === 1 ? "Objetivo al alza (≥)." : "Objetivo a la baja (≤)."}</small>
          {mixed && <label>1 {currencyLabel(draft.b!.currency)} = X {currencyLabel(draft.a!.currency)}<input aria-label="Conversión para cantidades" type="number" min="0" step="any" value={draft.fx} disabled={!available || partiallyClosed} required onChange={e => setDraft(p => ({ ...p, fx: e.target.value }))} /><small>Sólo para igualar montos. El P&L se mantiene separado por moneda.</small></label>}
        </aside>
        <div className="ro-sizing"><span>Monto A <strong>{money(qa * pa * fa, draft.a?.currency || "")}</strong></span><span>Monto B <strong>{money(qb * pb * fb, draft.b?.currency || "")}</strong></span><small>B se ajusta al lote más cercano con los precios elegidos. DDMM y factores quedan guardados en cada pata.</small></div>
      </div><div className="ro-entry-footer"><button className="ro-primary" type="submit" disabled={!available}>{busy ? "Guardando…" : edit ? "Guardar cambios" : "Abrir operación"}</button><button type="button" disabled={busy} onClick={() => { const wasEdit = !!edit; setEdit(undefined); setDraft(emptyDraft()); setView(wasEdit ? "operations" : "monitor"); setIssue(""); setPickerSession(n => n + 1); }}>{edit ? "Cancelar edición" : "Volver al monitor"}</button><small>Registro de ambas patas; no comprueba tenencia, préstamo de títulos ni ejecución del broker.</small></div>
    </form>}
    {view === "operations" && <div className={`ro-operations-grid${op ? "" : " no-detail"}`}>
      <div><div className="ro-filters"><button type="button" aria-pressed={!all} onClick={() => { setAll(false); if (op && isClosed(op)) setSelected(undefined); }}>Abiertas</button><button type="button" aria-pressed={all} onClick={() => setAll(true)}>Todas</button></div>
        <div className="ro-table-wrap"><table className="ro-operations-table"><thead><tr><th>Par / sentido</th><th>Cant. abiertas A/B</th><th>Ratio entrada → actual</th><th>Realizado</th><th>Pendiente</th><th>Neto total</th><th>Acciones</th></tr></thead><tbody>{ready && book.operations.filter(o => all || !isClosed(o)).map(o => <tr key={o.id} className={selected === o.id ? "ro-selected" : ""}>
          <td><strong>{o.legs[0].instrument.symbol}/{o.legs[1].instrument.symbol}</strong><small>{o.direction === 1 ? "Long A / Short B" : "Short A / Long B"} · {isClosed(o) ? "Cerrada" : o.legs.some(l => l.exits.length) ? "Parcial" : "Abierta"}</small></td><td>{o.legs.map(l => numberLabel(remaining(l))).join(" / ")}</td>
          <td>{pairRatioLabel(o.legs[0].entry / o.legs[1].entry, o.legs[0].instrument, o.legs[1].instrument)} → {pairRatioLabel(currentRatio(o, quotes), o.legs[0].instrument, o.legs[1].instrument)}<small className={goalReached(o, currentRatio(o, quotes)) ? "ro-up" : ""}>{goalText(o)}</small></td>
          <td>{pnlLines(o, "realized")}</td><td>{pnlLines(o, "pending")}</td><td>{pnlLines(o, "net")}</td><td><div className="ro-actions"><button type="button" onClick={() => { setSelected(o.id); setIssue(""); }}>Detalle</button>{!isClosed(o) && <button type="button" disabled={!available} onClick={() => beginEdit(o)}>Editar</button>}<button type="button" className="ro-danger" disabled={!available} onClick={() => void remove(o)}>Eliminar</button></div></td>
        </tr>)}</tbody></table></div>
        {ready && !book.operations.some(o => all || !isClosed(o)) && <p className="ro-empty">Sin operaciones en esta vista. Elegí un par en el Monitor y registrá su apertura.</p>}
      </div>
      {op && <aside className="ro-detail"><h3>{op.legs[0].instrument.symbol}/{op.legs[1].instrument.symbol}</h3><small>{new Date(op.openedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" })}</small>
        <p className={goalReached(op, currentRatio(op, quotes)) ? "ro-up" : ""}>{goalText(op)}</p>
        <div className="ro-pnl-lines">{([ ["gross", "Resultado bruto"], ["commission", "Comisión · apertura + cierre"], ["ddmm", "DDMM · apertura + cierre"], ["net", "Neto al desarme"], ["realized", "Realizado neto"], ["pending", "Remanente neto"] ] as const).map(([field, label]) => <div key={field}><span>{label}</span><strong>{pnlLines(op, field)}</strong></div>)}</div>
        {selectedPnl.some(p => p.issue) && <p className="ro-issue">{selectedPnl.find(p => p.issue)?.issue}</p>}
        <table><thead><tr><th>Pata</th><th>Entrada</th><th>Abierta / total</th></tr></thead><tbody>{op.legs.map((l, i) => <tr key={i}><td>{l.side === 1 ? "Long" : "Short"} {l.instrument.symbol}<small>DDMM {input(l.ddmm)}%</small></td><td>{numberLabel(l.entry)}</td><td>{numberLabel(remaining(l))} / {numberLabel(l.quantity)}</td></tr>)}</tbody></table>
        {!isClosed(op) && <><h4>Registrar cierre</h4><div className="ro-close-prices">{op.legs.map((l, i) => <label key={i}>Precio cierre {i === 0 ? "A" : "B"}<input aria-label={`Precio cierre ${i === 0 ? "A" : "B"}`} type="number" min="0" step="any" value={closePrices[i]} disabled={!available} onChange={e => { closeDirty.current[i] = true; setClosePrices(p => p.map((v, n) => n === i ? e.target.value : v) as [string, string]); }} /></label>)}</div><div className="ro-actions">{[.25, .5, 1].map(f => <button key={f} type="button" disabled={!available} onClick={() => void registerClose(f)}>{f === 1 ? "Cerrar todo" : `Cerrar ${f * 100}%`}</button>)}</div><small>Se registra el porcentaje del remanente con estos precios. Podés reemplazar el último por el precio real de tu cierre.</small></>}
        <div className="ro-ledger">{op.legs.flatMap((l, i) => l.exits.map((e, n) => <div key={`${i}-${n}`}>Cierre {l.instrument.symbol}: {numberLabel(e.quantity)} a {numberLabel(e.price)}<small>{new Date(e.at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" })}</small></div>))}</div>
      </aside>}
    </div>}
  </section>;
}
