import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { InstrumentPicker } from "./RatiosDashboard";
import RatioOrderBook from "./RatioOrderBook";
import RatioCloseHistory from "./RatioCloseHistory";
import { RatioChartLink } from "./RatioChart";
import { ReferenceChartButton } from "./IntradayChart";
import { GridActionIcon, GridColumnPicker, GridRowHandle, GridSortHeader, monitorColumns, operationColumns, useGridColumns, nextGridSort, reorderGridRows, sortGridRows, type GridSort, type GridValue } from "./RatioGrid";
import { calculateRatio, currencyLabel, numberLabel, pairKey, pairLabel, ratioLabel, ratioTimeLabel, ratioUpdatedAt, referenceCFormula, referenceCQuote, tradeLabel } from "./model";
import { formatOptionInput } from "../optionsSimulator/format";
import { OptionQuoteValue } from "../optionsSimulator/OptionQuoteValue";
import { numeric } from "../optionsSimulator/model";
import { useRatioMarket } from "./tradingMarket";
import { readTradingBook, saveTradingBook, tradingStorageKey } from "./tradingStorage";
import { applyDefaultWatch, bestBookPrice, closeOperation, closeOperationByQuantity, partialCloseQuantities, closedQuantity, correctOperation, counterpart, currentRatio, dailyPriceChange, defaultMarketRights, emptyBook, goalInput, invertWatchPair, isMonitorOnly, isRateInstrument, resolveDefaultWatch,
  canTradeReference, closeMetrics, currentSpread, goalReached, instrumentKind, isClosed, MAX_OPERATIONS, MAX_WATCH, operationPnl, pairRatioLabel, parseGoal, quoteUnitChanged, remaining, sameCurrency,
  parseSpreadGoal, recordedCloses, reviseRecordedClose, spreadAt, spreadGoalInput, spreadGoalReached, tradingLegNames, validateBook, validateOperation, type CloseCorrection, type OperationReference, type TradingLegIndex, type RatioOperation, type TradingBook, type TradingInstrument, type TradingLeg, type TradingPair, type TradingQuote } from "./trading";
import styles from "./RatioOperations.css?inline";
import { installToolStyles } from "../toolStyles";

installToolStyles(styles);

type View = "monitor" | "opening" | "operations";
type GridKind = "watch" | "operations";
interface GridDrag { kind: GridKind; scope: string; revision: string; ids: string[]; from: string }
interface CloseDraft { id: string; snapshot: string; leg: TradingLegIndex; value: string }
interface ClosePrice { value: string; fromMarket?: boolean }
interface ClosePriceDraft { key: string; prices: (ClosePrice | undefined)[]; reference?: ClosePrice; at?: string }
type BookSide = "bid" | "ask";
type Source = "last" | BookSide | "manual" | "saved" | `pending-${BookSide}`;
interface Draft {
  a?: TradingInstrument; b?: TradingInstrument; pa: string; pb: string; qa: string; fa: string; fb: string; sa: string; sb: string;
  ddmma: string; ddmmb: string; commission: string; preservedB?: number; target: string; at: string; direction: 1 | -1; sourceA: Source; sourceB: Source;
  reference?: ReferenceDraft;
  explicitDate?: boolean;
}
interface ReferenceDraft {
  instrument: TradingInstrument; divisor?: 100; price: string; copiedPrice?: boolean; goal: string; comparison: "above" | "below";
  future: boolean; side: 1 | -1; quantity: string; factor: string; step: string; ddmm: string;
}
function referenceDraft(instrument: TradingInstrument, divisor?: 100, saved?: OperationReference, future?: TradingLeg): ReferenceDraft {
  return {
    instrument, divisor, price: saved ? formatOptionInput(saved.entry, 21) : "", goal: spreadGoalInput(saved?.goal),
    comparison: saved?.goal?.comparison ?? "below", future: !!future, side: future?.side ?? 1,
    quantity: future ? String(future.quantity) : "", factor: future ? formatOptionInput(future.factor, 21) : "",
    step: String(future?.step ?? 1), ddmm: future ? formatOptionInput(future.ddmm, 21) : "",
  };
}
const dateInput = (iso = new Date().toISOString()) => new Date(iso).toLocaleString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 16).replace(" ", "T");
const emptyDraft = (): Draft => ({ pa: "", pb: "", qa: "100", fa: "", fb: "", sa: "1", sb: "1", ddmma: "", ddmmb: "", commission: "0", target: "", at: dateInput(), direction: 1, sourceA: "last", sourceB: "last" });
const input = (n?: number) => n === undefined ? "" : formatOptionInput(n);
const entrySourceLabels = { last: "mercado", bid: "Compra", ask: "Venta", manual: "manual", saved: "registrado" } as const;
function resolveEntryPrice(price: string, source: Source, quote?: TradingQuote): { price: string; source: Source } {
  if (source === "last" && !price) return { price: input(quote?.last), source };
  if (quote && (source === "pending-bid" || source === "pending-ask")) {
    const side = source === "pending-bid" ? "bid" : "ask";
    return { price: input(bestBookPrice(quote, side)), source: side };
  }
  return { price, source };
}
const signed = (n?: number) => n === undefined ? "" : n > 0 ? "ro-up" : n < 0 ? "ro-down" : "";
const money = (n: number | undefined, c: string) => `${currencyLabel(c)} ${n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const positiveInput = (value: string) => {
  const number = Number(value);
  return number > 0 && Number.isFinite(number);
};
const operationPair = (o: RatioOperation) => ({ a: o.legs[0].instrument, b: o.legs[1].instrument, c: o.reference?.instrument, cDivisor: o.reference?.divisor });
function lastPairedCloseMetrics(o: RatioOperation) {
  const closes = recordedCloses(o), latest = closes.find(close => close.entries.some(e => e.leg === 0) && close.entries.some(e => e.leg === 1));
  if (!latest) return undefined;
  // Multiple fills recorded in the same minute keep their insertion order within A.
  const last = closes.findLast(close => close.at === latest.at && close.entries.some(e => e.leg === 0) && close.entries.some(e => e.leg === 1)) ?? latest;
  return { at: last.at, ...closeMetrics(o, last) };
}
const operationQuoteTime = (o: RatioOperation, quotes: Record<string, TradingQuote>) =>
  isClosed(o) ? undefined : ratioUpdatedAt(quotes[o.legs[0].instrument.id], quotes[o.legs[1].instrument.id], referenceCQuote(quotes, operationPair(o)));
const operationStatus = (o: RatioOperation) => isClosed(o) ? "Cerrada" : o.legs.some(l => l.exits.length) ? "Parcial" : "Abierta";
const dailyLabel = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }) + "%";

export default function RatioOperations({ active }: { active: boolean }) {
  const [session, setSession] = useState<{ scope: string; book: TradingBook; error?: string }>();
  const [view, setView] = useState<View>("monitor"), [draft, setDraft] = useState<Draft>(emptyDraft);
  const [watchA, setWatchA] = useState<TradingInstrument>(), [watchB, setWatchB] = useState<TradingInstrument>(), [watchC, setWatchC] = useState<TradingInstrument>();
  const [compare, setCompare] = useState(false);
  const [focusReference, setFocusReference] = useState(false);
  const [divideCBy100, setDivideCBy100] = useState(false);
  const [selected, setSelected] = useState<string>(), [all, setAll] = useState(false), [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState(""), [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<{ id: string; snapshot: string }>();
  const [deleted, setDeleted] = useState<{ scope: string; op: RatioOperation; index: number }>();
  const [closePriceDraft, setClosePriceDraft] = useState<ClosePriceDraft>();
  const [closeDraft, setCloseDraft] = useState<CloseDraft>();
  const [pickerSession, setPickerSession] = useState(0);
  const [loadingDefaults, setLoadingDefaults] = useState(false), defaultsAttempt = useRef<string | undefined>(undefined), defaultsGeneration = useRef(0);
  const [monitorSort, setMonitorSort] = useState<GridSort>(), [operationsSort, setOperationsSort] = useState<GridSort>();
  const gridSortVersion = useRef({ watch: 0, operations: 0 });
  const [pnlCurrency, setPnlCurrency] = useState("ARS");
  const [gridDrag, setGridDrag] = useState<GridDrag>(), gridDragRef = useRef<GridDrag | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string>();
  const pending = useRef(false), current = useRef({ session, active }); current.current = { session, active };
  const book = session?.book ?? emptyBook();
  const closedMetrics = useMemo(() => new Map(book.operations.filter(isClosed).map(o => [o.id, lastPairedCloseMetrics(o)])), [book.operations]);
  const ids = [...book.watch.flatMap(p => [p.a.id, p.b.id, ...(p.c ? [p.c.id] : [])]), ...book.operations.filter(o => !isClosed(o)).flatMap(o => [...o.legs.map(l => l.instrument.id), ...(o.reference && !o.legs[2] ? [o.reference.instrument.id] : [])]),
    ...(draft.a ? [draft.a.id] : []), ...(draft.b ? [draft.b.id] : []), ...(draft.reference ? [draft.reference.instrument.id] : [])];
  const market = useRatioMarket(active, ids, session?.scope), scope = market.context?.storageScope;
  const marketRef = useRef(market); marketRef.current = market;
  const ready = active && !!scope && session?.scope === scope && !session.error;
  const available = ready && !busy && !loadingDefaults;
  const priceSearch = useCallback(async (query: string) => (await market.search(query)).filter(i => !isMonitorOnly(i)), [market.search]);
  const op = ready ? book.operations.find(o => o.id === selected) : undefined;
  const edited = ready && edit ? book.operations.find(o => o.id === edit.id) : undefined;
  const partiallyClosed = !!edited?.legs.some(l => l.exits.length);
  const quotes = market.quotes;
  const closePriceKey = useMemo(() => op ? JSON.stringify([scope, op.id, op.direction,
    op.legs.map(leg => [leg.instrument.id, leg.factor]), op.reference ? [op.reference, op.legs.map(leg => leg.exits)] : undefined]) : "", [op, scope]);
  const closeInput = closePriceDraft?.key === closePriceKey ? closePriceDraft : undefined;
  const closeReferenceQuote = op?.reference && quotes[op.reference.instrument.id];
  const closeQuotes = op?.legs.map(leg => {
    const quote = quotes[leg.instrument.id];
    const issue = !market.context?.connected ? "Mercado desconectado." : quote?.issue ||
      (quoteUnitChanged(quote, leg.factor) ? "Cambió la unidad de cotización." : undefined);
    return { quote: issue ? undefined : quote, issue };
  });
  const closePrices = closeQuotes?.map(({ quote }, i) => closeInput?.prices[i]?.value ?? (i === 2 || closeInput?.at ? "" : input(quote?.last))) ?? [];
  const closeReferencePrice = closeInput?.reference?.value ?? "";
  const monitorPreferences = useGridColumns(ready ? scope : undefined, "monitor", monitorColumns);
  const operationPreferences = useGridColumns(ready ? scope : undefined, "operations", operationColumns);
  const showMonitor = monitorPreferences.has, showOperation = operationPreferences.has;
  const hasReference = book.watch.some(p => p.c);
  useEffect(() => {
    if (monitorSort && monitorSort.column !== "pair" && !showMonitor(monitorSort.column)) changeGridSort("watch");
    if (operationsSort && !["pair", "status"].includes(operationsSort.column) && !showOperation(operationsSort.column)) changeGridSort("operations");
  });

  useEffect(() => {
    gridSortVersion.current.watch++; gridSortVersion.current.operations++;
    setMonitorSort(undefined); setOperationsSort(undefined); setPnlCurrency("ARS"); clearGridDrag();
    setSession(undefined); setSelected(undefined); setEdit(undefined); setDeleted(undefined); setDraft(emptyDraft()); setWatchA(undefined); setWatchB(undefined); setWatchC(undefined); setCompare(false); setFocusReference(false); setDivideCBy100(false);
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

  useEffect(() => { setClosePriceDraft(undefined); setCloseDraft(undefined); }, [closePriceKey]);
  useEffect(() => {
    setDraft(previous => {
      const a = resolveEntryPrice(previous.pa, previous.sourceA, quotes[previous.a?.id || ""]);
      const b = resolveEntryPrice(previous.pb, previous.sourceB, quotes[previous.b?.id || ""]);
      return a.price === previous.pa && b.price === previous.pb && a.source === previous.sourceA && b.source === previous.sourceB
        ? previous : { ...previous, pa: a.price, pb: b.price, sourceA: a.source, sourceB: b.source };
    });
  }, [quotes]);

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
  function clearGridDrag() { gridDragRef.current = undefined; setGridDrag(undefined); setDropTarget(undefined); }
  function changeGridSort(kind: GridKind, column?: string) {
    gridSortVersion.current[kind]++; clearGridDrag();
    if (kind === "watch") setMonitorSort(previous => column ? nextGridSort(previous, column) : undefined);
    else setOperationsSort(previous => column ? nextGridSort(previous, column) : undefined);
  }
  function projectGrid<T extends { id: string }>(rows: T[], kind: GridKind, sort: GridSort | undefined, value: (row: T, column: string) => GridValue): T[] {
    if (gridDrag?.kind === kind && gridDrag.scope === scope && gridDrag.revision === book.revision) {
      const rank = new Map(gridDrag.ids.map((id, index) => [id, index]));
      return sortGridRows(rows, { column: "drag", direction: "asc" }, row => rank.get(row.id));
    }
    return sortGridRows(rows, sort, value);
  }
  async function moveGrid(drag: GridDrag, target: string) {
    if (!available || scope !== drag.scope || drag.from === target) return;
    const sortVersion = gridSortVersion.current[drag.kind];
    const ok = await commit(base => {
      if (base.revision !== drag.revision) throw Error("La grilla cambió durante el movimiento. Volvé a intentarlo.");
      return drag.kind === "watch" ? { ...base, watch: reorderGridRows(base.watch, drag.ids, drag.from, target) }
        : { ...base, operations: reorderGridRows(base.operations, drag.ids, drag.from, target) };
    });
    if (ok && sortVersion === gridSortVersion.current[drag.kind]) { if (drag.kind === "watch") setMonitorSort(undefined); else setOperationsSort(undefined); }
  }
  function rowHandle(kind: GridKind, id: string, label: string, ids: string[]) {
    return <GridRowHandle label={label} disabled={!ready || loadingDefaults} busy={busy} onEnd={clearGridDrag}
      onStart={event => {
        if (!available || !scope) { event.preventDefault(); return; }
        event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id);
        const drag = { kind, scope, revision: book.revision, ids, from: id };
        gridDragRef.current = drag; setGridDrag(drag);
      }} onMove={direction => {
        const target = ids[ids.indexOf(id) + direction];
        if (scope && target) void moveGrid({ kind, scope, revision: book.revision, ids, from: id }, target);
      }} />;
  }
  function rowDrop(kind: GridKind, id: string) {
    const accepts = () => available && gridDragRef.current?.kind === kind && gridDragRef.current.scope === scope && gridDragRef.current.ids.includes(id);
    return {
      onDragOver: (event: DragEvent<HTMLTableRowElement>) => { if (accepts()) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(`${kind}:${id}`); } },
      onDrop: (event: DragEvent<HTMLTableRowElement>) => {
        if (!accepts()) return;
        event.preventDefault(); event.stopPropagation(); const drag = gridDragRef.current!; clearGridDrag(); void moveGrid(drag, id);
      },
    };
  }
  function selectInstrument(key: "a" | "b", instrument?: TradingInstrument) {
    setDraft(previous => {
      if (!instrument) return { ...previous, [key]: undefined, preservedB: undefined };
      const first = key === "a", changed = previous[key]?.id !== instrument.id;
      return { ...previous, [key]: instrument, preservedB: undefined, [first ? "pa" : "pb"]: previous.explicitDate ? "" : input(quotes[instrument.id]?.last),
        [first ? "fa" : "fb"]: input(instrument.amountFactor), [first ? "sa" : "sb"]: input(instrument.quantityStep),
        [first ? "ddmma" : "ddmmb"]: input(defaultMarketRights(instrument)), [first ? "sourceA" : "sourceB"]: previous.explicitDate ? "manual" : "last", target: changed ? "" : previous.target,
        reference: changed && previous.reference ? { ...previous.reference, goal: "" } : previous.reference };
    });
  }
  function entryPrices(direction: Draft["direction"], a?: TradingInstrument, b?: TradingInstrument, waitForQuotes = false) {
    const sideA = direction === 1 ? "ask" : "bid", sideB = direction === 1 ? "bid" : "ask";
    const quoteA = quotes[a?.id || ""], quoteB = quotes[b?.id || ""];
    return { direction, pa: input(bestBookPrice(quoteA, sideA)), pb: input(bestBookPrice(quoteB, sideB)),
      sourceA: waitForQuotes && !quoteA ? `pending-${sideA}` : sideA,
      sourceB: waitForQuotes && !quoteB ? `pending-${sideB}` : sideB,
    } satisfies Pick<Draft, "direction" | "pa" | "pb" | "sourceA" | "sourceB">;
  }
  function begin({ a, b, c, cDivisor }: TradingPair) {
    if (isMonitorOnly(a) || isMonitorOnly(b)) { setIssue("Las cauciones y referencias sólo se monitorean."); return; }
    const initial = emptyDraft(), step = a.quantityStep ?? 1;
    const prices = entryPrices(initial.direction, a, b, market.context?.connected);
    setEdit(undefined); setDraft({ ...initial, ...prices, a, b, reference: c ? referenceDraft(c, cDivisor) : undefined, qa: String(Math.ceil(100 / step) * step),
      fa: input(a.amountFactor), fb: input(b.amountFactor), sa: input(a.quantityStep), sb: input(b.quantityStep), ddmma: input(defaultMarketRights(a)), ddmmb: input(defaultMarketRights(b)) });
    setPickerSession(n => n + 1); setView("opening"); setIssue(""); setNotice("");
  }
  function beginEdit(o: RatioOperation) {
    setEdit({ id: o.id, snapshot: JSON.stringify(o) }); setSelected(o.id);
    setDraft({ a: o.legs[0].instrument, b: o.legs[1].instrument, pa: input(o.legs[0].entry), pb: input(o.legs[1].entry), qa: input(o.legs[0].quantity),
      fa: input(o.legs[0].factor), fb: input(o.legs[1].factor), sa: input(o.legs[0].step), sb: input(o.legs[1].step), ddmma: input(o.legs[0].ddmm), ddmmb: input(o.legs[1].ddmm),
      commission: input(o.commission), preservedB: !sameCurrency(o.legs[0].instrument, o.legs[1].instrument) && o.legs[0].quantity !== o.legs[1].quantity ? o.legs[1].quantity : undefined,
      target: goalInput(o), at: dateInput(o.openedAt), direction: o.direction, sourceA: "saved", sourceB: "saved",
      reference: o.reference && referenceDraft(o.reference.instrument, o.reference.divisor, o.reference, o.legs[2]) });
    setPickerSession(n => n + 1); setView("opening"); setIssue(""); setNotice("");
  }
  const pa = numeric(draft.pa), pb = numeric(draft.pb), qa = numeric(draft.qa), fa = numeric(draft.fa), fb = numeric(draft.fb), sa = numeric(draft.sa), sb = numeric(draft.sb);
  const mixed = draft.a && draft.b && !sameCurrency(draft.a, draft.b);
  const qb = mixed && draft.preservedB !== undefined ? draft.preservedB : draft.a && draft.b ? counterpart(qa, pa, pb, fa, fb, sb, draft.a, draft.b) : NaN;
  const marketRatio = !edit && draft.a && draft.b ? calculateRatio(quotes[draft.a.id], quotes[draft.b.id]) : undefined;
  const formRatio = edit && pa > 0 && pb > 0 ? pa / pb : marketRatio?.ratio;
  const formRatioLabel = edit ? "Ratio de apertura" : "Ratio de mercado A/B";
  const ref = draft.reference;
  const openReferenceQuote = ref && quotes[ref.instrument.id];
  const marketSpread = ref && draft.a && draft.b
    ? calculateRatio(quotes[draft.a.id], quotes[draft.b.id], referenceCQuote(quotes, { c: ref.instrument, cDivisor: ref.divisor })).ratio : undefined;
  function changeReference(change: Partial<ReferenceDraft>) {
    setDraft(previous => previous.reference ? { ...previous, reference: { ...previous.reference, ...change } } : previous);
  }
  const missingEntrySides = view === "opening" ? [
    { price: draft.pa, source: draft.sourceA, symbol: draft.a?.symbol || "A" },
    { price: draft.pb, source: draft.sourceB, symbol: draft.b?.symbol || "B" },
  ].flatMap(({ price, source, symbol }) => !price && (source === "bid" || source === "ask") ? [`${source === "ask" ? "Ask" : "Bid"} de ${symbol}`] : []) : [];
  const entryIssue = missingEntrySides.length
    ? `Sin mejor punta publicada: ${missingEntrySides.join(" y ")}. Ingresá el precio manualmente o volvé a pulsar la dirección cuando esté disponible.`
    : "";
  const currentIssue = issue || session?.error || entryIssue || market.issue;

  function selectDirection(direction: 1 | -1) {
    if (!available || partiallyClosed) return;
    setDraft(previous => previous.explicitDate ? { ...previous, direction }
      : { ...previous, ...entryPrices(direction, previous.a, previous.b) });
    setIssue("");
  }

  function changeEntryDate(at: string) {
    setDraft(previous => {
      const keepA = previous.sourceA === "manual" || previous.sourceA === "saved";
      const keepB = previous.sourceB === "manual" || previous.sourceB === "saved";
      return {
        ...previous, at, explicitDate: true,
        pa: keepA ? previous.pa : "", sourceA: keepA ? previous.sourceA : "manual",
        pb: keepB ? previous.pb : "", sourceB: keepB ? previous.sourceB : "manual",
        reference: previous.reference?.copiedPrice ? { ...previous.reference, price: "", copiedPrice: false } : previous.reference,
      };
    });
  }

  async function saveEntry() {
    const a = draft.a, b = draft.b;
    if (!a || !b) { setIssue("Seleccioná ambos instrumentos, con coincidencia exacta o desde el catálogo."); return; }
    try {
      const targetRatio = edited && draft.target === goalInput(edited) ? edited.targetRatio : parseGoal(draft.target, a, b);
      const openedAt = edited && draft.at === dateInput(edited.openedAt) ? edited.openedAt : new Date(draft.at + ":00-03:00").toISOString();
      const makeLeg = (instrument: TradingInstrument, i: number): TradingLeg => ({ instrument, side: (i === 0 ? draft.direction : -draft.direction) as 1 | -1,
        quantity: i === 0 ? qa : qb, entry: i === 0 ? pa : pb, factor: i === 0 ? fa : fb, step: i === 0 ? sa : sb, ddmm: numeric(i === 0 ? draft.ddmma : draft.ddmmb), exits: [] });
      let next: RatioOperation = { id: edit?.id ?? crypto.randomUUID(), openedAt, direction: draft.direction, commission: numeric(draft.commission), fx: edited?.fx ?? 1,
        targetRatio, legs: [makeLeg(a, 0), makeLeg(b, 1)] };
      if (ref) {
        if (!positiveInput(ref.price)) throw Error("Ingresá el precio de C al momento de la apertura.");
        const goal = edited?.reference?.goal;
        const savedGoal = goal && ref.goal === spreadGoalInput(goal) && ref.comparison === goal.comparison ? goal : parseSpreadGoal(ref.goal, ref.comparison);
        next.reference = { instrument: ref.instrument, divisor: ref.divisor, entry: Number(ref.price), goal: savedGoal };
        if (ref.future) {
          if (ref.ddmm.trim() === "") throw Error("Ingresá los DDMM del contrato C, o 0 si no corresponden.");
          next.legs = [next.legs[0], next.legs[1], {
            instrument: ref.instrument, side: ref.side, quantity: Number(ref.quantity), entry: next.reference.entry,
            factor: Number(ref.factor), step: Number(ref.step), ddmm: Number(ref.ddmm), exits: [],
          }];
        }
      }
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
  let closeQuantities: number[] | undefined, closeIssue: string | undefined;
  if (op && closeDraft?.id === op.id && closeDraft.value.trim()) {
    try {
      if (closeDraft.snapshot !== JSON.stringify(op)) throw Error("La operación cambió. Volvé a ingresar la cantidad para revisar el cierre.");
      closeQuantities = partialCloseQuantities(op, closeDraft.leg, numeric(closeDraft.value));
    } catch (error) { closeIssue = error instanceof Error ? error.message : "Revisá las cantidades de cierre."; }
  }
  function changeCloseInput(change: Partial<Omit<ClosePriceDraft, "key">>) {
    setClosePriceDraft(previous => ({ ...(previous?.key === closePriceKey ? previous : { key: closePriceKey, prices: [] }), ...change }));
  }
  function setClosePrice(leg: number, value: string, fromMarket = false) {
    const prices = [...(closeInput?.prices ?? [])];
    prices[leg] = { value, fromMarket };
    changeCloseInput({ prices });
  }
  function changeCloseDate(at: string) {
    changeCloseInput({
      at, prices: (closeInput?.prices ?? []).map(price => price?.fromMarket ? undefined : price),
      reference: closeInput?.reference?.fromMarket ? undefined : closeInput?.reference,
    });
  }
  const referenceOnlyAtClose = !!op?.reference && (!op.legs[2] || remaining(op.legs[2]) === 0);
  const closeHasPrices = !!op && op.legs.every((leg, i) => !remaining(leg) || positiveInput(closePrices[i])) &&
    (!referenceOnlyAtClose || positiveInput(closeReferencePrice));
  async function registerClose(fraction?: number) {
    if (!op) return;
    if (fraction === undefined && (!closeDraft || !closeQuantities || closeIssue)) { setIssue(closeIssue || "Ingresá una cantidad válida para el cierre."); return; }
    const snapshot = JSON.stringify(op);
    const ok = await commit(base => {
      const latest = base.operations.find(o => o.id === op.id);
      if (!latest || JSON.stringify(latest) !== snapshot) throw Error("La operación cambió; revisá sus cantidades antes de registrar el cierre.");
      const prices = closePrices.map(Number);
      const at = closeInput?.at ? new Date(closeInput.at + ":00-03:00").toISOString() : new Date().toISOString();
      const referencePrice = referenceOnlyAtClose ? Number(closeReferencePrice) : undefined;
      const next = fraction === undefined
        ? closeOperationByQuantity(latest, closeDraft!.leg, numeric(closeDraft!.value), prices, at, referencePrice)
        : closeOperation(latest, fraction, prices, at, referencePrice);
      return { ...base, operations: base.operations.map(o => o.id === latest.id ? next : o) };
    });
    if (ok) { setCloseDraft(undefined); setClosePriceDraft(undefined); setAll(true); setNotice("Cierre registrado localmente con los precios ingresados."); }
  }
  async function changeRecordedClose(key: string, snapshot: string, corrections: CloseCorrection[] | null, referencePrice?: number) {
    if (!op) return false;
    let closed = false;
    const ok = await commit(base => {
      const latest = base.operations.find(o => o.id === op.id);
      if (!latest || JSON.stringify(latest) !== snapshot) throw Error("La operación cambió. Volvé a seleccionar el cierre para revisar los datos.");
      const next = reviseRecordedClose(latest, key, corrections, referencePrice);
      closed = isClosed(next);
      return { ...base, operations: base.operations.map(o => o.id === next.id ? next : o) };
    });
    if (ok) {
      setCloseDraft(undefined);
      setClosePriceDraft(undefined);
      if (closed) setAll(true);
      setNotice(corrections ? "Cierre actualizado." : "Cierre eliminado del registro local.");
    }
    return ok;
  }
  const pnlLines = (o: RatioOperation, field: "realized" | "pending" | "net" | "gross" | "commission" | "ddmm") => operationPnl(o, quotes).map(p =>
    <span key={p.currency} className={field === "commission" || field === "ddmm" ? "" : signed(p[field])} title={p.issue}>{money(p[field], p.currency)}</span>);
  const goalText = (o: RatioOperation) => o.targetRatio === null ? "Sin objetivo de ratio" : `Objetivo${o.reference ? " A/B" : ""}: ${pairRatioLabel(o.targetRatio, o.legs[0].instrument, o.legs[1].instrument)}${isClosed(o) ? "" : goalReached(o, currentRatio(o, quotes)) ? " · alcanzado" : " · pendiente"}`;
  function spreadGoalText(o: RatioOperation) {
    const goal = o.reference?.goal;
    if (!goal) return undefined;
    const spread = isClosed(o) ? undefined : currentSpread(o, quotes);
    return `Objetivo de brecha ${goal.comparison === "above" ? "≥" : "≤"} ${ratioLabel(goal.value, "percent")}${isClosed(o) ? "" : spread === undefined ? " · sin cotización" : spreadGoalReached(goal, spread) ? " · alcanzado" : " · pendiente"}`;
  }
  function ratioSummary(o: RatioOperation) {
    const [a, b] = o.legs, closed = isClosed(o), closing = closedMetrics.get(o.id);
    const reference = o.reference;
    return <>
      <span title={closed ? `A/B de entrada y último cierre con ambas patas · ${tradeLabel(closing ? Date.parse(closing.at) : undefined)}` : "A/B de entrada y actual"}>{pairRatioLabel(a.entry / b.entry, a.instrument, b.instrument)} → {pairRatioLabel(closed ? closing?.ratio : currentRatio(o, quotes), a.instrument, b.instrument)}</span>
      {reference && <small>Brecha {closed ? "de entrada → último cierre A/B" : "de entrada → actual"} · {ratioLabel(spreadAt(a.entry, b.entry, reference.entry, reference.divisor), "percent")} → {ratioLabel(closed ? closing?.spread : currentSpread(o, quotes), "percent")}</small>}
    </>;
  }
  const selectedPnl = op ? operationPnl(op, quotes) : [];
  const allLegsOpen = op?.legs.every(leg => remaining(leg) > 0);
  const shownRatio = (raw: number | undefined, percent: boolean) => raw === undefined ? undefined : percent ? (raw - 1) * 100 : raw;
  const monitorRows = projectGrid(book.watch, "watch", monitorSort, (pair, column) => {
    if (column === "pair") return pairLabel(pair);
    const a = quotes[pair.a.id], b = quotes[pair.b.id], c = referenceCQuote(quotes, pair);
    if (column === "updated") return ratioUpdatedAt(a, b, c);
    if (column === "a") return a?.issue ? undefined : a?.last;
    if (column === "b") return b?.issue ? undefined : b?.last;
    if (column === "c") return c?.issue ? undefined : c?.last;
    const result = calculateRatio(a, b, c);
    return column === "daily" ? result.change : shownRatio(result.ratio, !!pair.c || sameCurrency(pair.a, pair.b));
  });
  const pnlCurrencies = [...new Set(book.operations.flatMap(o => o.legs.map(l => l.instrument.currency)))].sort();
  const sortCurrency = pnlCurrencies.includes(pnlCurrency) ? pnlCurrency : pnlCurrencies[0] || "ARS";
  const operationsRows = projectGrid(book.operations.filter(o => all || !isClosed(o)), "operations", operationsSort, (operation, column) => {
    if (column === "pair") return operation.reference ? pairLabel(operationPair(operation)) : operation.legs.map(l => l.instrument.symbol).join("/");
    if (column === "status") return operationStatus(operation);
    if (column === "quantity") return remaining(operation.legs[0]);
    const [a, b] = operation.legs;
    if (column === "updated") return operationQuoteTime(operation, quotes);
    if (column === "ratio") {
      const value = isClosed(operation) ? closedMetrics.get(operation.id)?.ratio : currentRatio(operation, quotes);
      return shownRatio(value, sameCurrency(a.instrument, b.instrument));
    }
    if (column === "realized" || column === "pending" || column === "net") return operationPnl(operation, quotes).find(p => p.currency === sortCurrency)?.[column];
    return undefined;
  });
  const monitorRowIds = monitorRows.map(row => row.id), operationsRowIds = operationsRows.map(row => row.id);
  const monitorHeader = (label: string, column: string) => <GridSortHeader label={label} column={column} sort={monitorSort} disabled={!ready} onSort={key => changeGridSort("watch", key)} />;
  const operationsHeader = (label: string, column: string) => <GridSortHeader label={label} column={column} sort={operationsSort} disabled={!ready}
    description={column === "quantity" ? "Ordenar por la cantidad abierta de A" : ["realized", "pending", "net"].includes(column) ? `Ordenar importes en ${currencyLabel(sortCurrency)}; sin valor al final` : undefined}
    onSort={key => changeGridSort("operations", key)} />;

  function leg(key: "a" | "b") {
    const first = key === "a", instrument = draft[key], quote = instrument ? quotes[instrument.id] : undefined;
    const side = first ? draft.direction : -draft.direction, priceKey = first ? "pa" : "pb", factorKey = first ? "fa" : "fb", stepKey = first ? "sa" : "sb", sourceKey = first ? "sourceA" : "sourceB";
    const selectedPrice = numeric(draft[priceKey]), source = draft[sourceKey];
    const last = quote?.issue ? undefined : quote?.last, priceChange = dailyPriceChange(quote);
    return <section className="ro-leg" aria-label={`Pata ${key.toUpperCase()}`} key={key}>
      <header><div className="ro-leg-header-identity"><strong className="ro-leg-title">{instrument?.symbol || `Instrumento ${key.toUpperCase()}`}</strong><small className="ro-leg-label">Pata {key.toUpperCase()}</small><span className={`ro-chip ${side === 1 ? "buy" : "sell"}`}>{side === 1 ? "Compra · Long" : "Venta · Short"}</span></div>
        <div className="ro-leg-header-quote"><button type="button" className="ro-header-last" disabled={!available || last === undefined} title="Usar este precio de mercado" aria-label={`Usar último de ${key.toUpperCase()}`} onClick={() => { if (last !== undefined) setDraft(p => ({ ...p, [priceKey]: input(last), [sourceKey]: "last" })); }}><OptionQuoteValue key={instrument?.id || key} value={last} formatValue={numberLabel} /></button>
          <span className={signed(priceChange)} aria-label={`Variación diaria de ${key.toUpperCase()}`} title={priceChange === undefined ? quote?.issue || "Sin referencia diaria del instrumento" : "(Precio actual / referencia diaria − 1) × 100"}>{priceChange === undefined ? "—" : dailyLabel(priceChange)}</span></div>
        <small className="ro-leg-header-note">{!first ? draft.preservedB !== undefined ? "Cantidad registrada" : "Cantidad automática" : ""}</small></header>
      <div className="ro-entry-fields"><div className="ro-leg-instrument"><InstrumentPicker key={`${pickerSession}-${key}`} label={`Instrumento ${key.toUpperCase()}`} value={instrument} onChange={i => selectInstrument(key, i as TradingInstrument | undefined)} search={priceSearch} disabled={!available || partiallyClosed} /></div>
        <label><span title={`Precio de entrada ${key.toUpperCase()}`}>Precio de entrada {key.toUpperCase()}</span><input aria-label={`Precio de entrada ${key.toUpperCase()}`} type="number" min="0" step="any" value={draft[priceKey]} disabled={!available} onChange={e => setDraft(p => ({ ...p, [priceKey]: e.target.value, [sourceKey]: "manual" }))} required /><small className="ro-price-source">{source === "pending-bid" || source === "pending-ask" ? "Esperando mejor punta…" : `Precio elegido: ${entrySourceLabels[source]}`}</small></label>
        <label><span title={`${edit ? "Cantidad total" : "Cantidad"} ${key.toUpperCase()} · ${instrument?.quantityUnit || "unidades"}`}>{edit ? "Cantidad total" : "Cantidad"} {key.toUpperCase()} · {instrument?.quantityUnit || "unidades"}</span><input aria-label={`Cantidad ${key.toUpperCase()}`} type="number" min={first && Number.isFinite(sa) && sa > 0 ? sa : 1} step={first && Number.isFinite(sa) && sa > 0 ? sa : 1} value={first ? draft.qa : Number.isFinite(qb) ? qb : ""} readOnly={!first} disabled={!available}
          onChange={e => setDraft(p => ({ ...p, qa: e.target.value, preservedB: undefined }))} /></label></div>
      <RatioOrderBook leg={first ? "A" : "B"} quote={quote} selectedPrice={selectedPrice} selectedSide={source === "bid" || source === "ask" ? source : undefined} disabled={!available}
        onChoose={(side, level) => setDraft(p => ({ ...p, [priceKey]: input(level.price), [sourceKey]: side }))} />
      <div className="ro-leg-footer"><small>{instrument ? `${instrumentKind(instrument.cfi)} · ${currencyLabel(instrument.currency)} · ${instrument.amountFactor === .01 ? "precio por 100 nominales" : `monto = cantidad × precio × ${numberLabel(numeric(draft[factorKey]))}`}` : "Seleccioná el instrumento"}<br />Última operación: {tradeLabel(quote?.tradedAt)}</small></div>
      {instrument && (!instrument.amountFactor || !instrument.quantityStep) && <div className="ro-manual-units"><label>Factor monetario por unidad<input type="number" min="0" step="any" value={draft[factorKey]} disabled={!available || partiallyClosed} required onChange={e => setDraft(p => ({ ...p, [factorKey]: e.target.value }))} /></label><label>Lote mínimo<input type="number" min="1" step="1" value={draft[stepKey]} disabled={!available || partiallyClosed} required onChange={e => setDraft(p => ({ ...p, [stepKey]: e.target.value }))} /></label></div>}
    </section>;
  }

  function sizing(key: "a" | "b") {
    const first = key === "a", instrument = draft[key], ddmmKey = first ? "ddmma" : "ddmmb";
    const defaultDdmm = instrument ? defaultMarketRights(instrument) : undefined;
    return <div className="ro-sizing-leg" aria-label={`Gastos y monto de ${key.toUpperCase()}`}>
      <label>DDMM {key.toUpperCase()} %<input aria-label={`DDMM ${key.toUpperCase()} %`} type="number" min="0" max="100" step="0.0001" value={draft[ddmmKey]} disabled={!available} onChange={e => setDraft(p => ({ ...p, [ddmmKey]: e.target.value }))} required />
        <small>{instrument && defaultDdmm !== undefined ? `Default Premium: ${input(defaultDdmm)}%${["Acción", "CEDEAR"].includes(instrumentKind(instrument.cfi)) ? " · IVA incluido" : ""}` : "Tipo sin default: completá la tasa"}</small></label>
      <span>Monto {key.toUpperCase()}<strong>{money(first ? qa * pa * fa : qb * pb * fb, instrument?.currency || "")}</strong></span>
    </div>;
  }

  return <section className="ct-ratio-ops" aria-label="Operaciones de ratios">
    <header className="ro-heading"><h2>Ratios · Long / Short</h2><small>Registro manual local por cuenta y sitio. No envía órdenes.</small></header>
    <nav className="ro-steps" aria-label="Pasos de ratios">{([["monitor", "Monitor"], ["opening", "Abrir operación de ratio"], ["operations", "Operaciones abiertas"]] as const).map(([key, label], i) =>
      <button key={key} type="button" aria-pressed={view === key} disabled={busy} onClick={() => { setView(key); setIssue(""); if (key === "operations" && !selected) setSelected(book.operations.find(o => all || !isClosed(o))?.id); }}>{i + 1} · {label}{key === "operations" ? ` (${ready ? book.operations.filter(o => !isClosed(o)).length : 0})` : ""}</button>)}</nav>
    {currentIssue && <p className="ro-issue" role="alert">{currentIssue}</p>}
    {!ready && !market.issue && !session?.error && <p role="status">Cargando el registro de la cuenta activa…</p>}
    {notice && <div className="ro-notice" role="status">{notice}{deleted?.scope === scope && <button type="button" disabled={!available} onClick={() => void undo()}>Deshacer eliminación</button>}</div>}
    {view === "monitor" && <div>
      <div className="ro-monitor-controls">
        <InstrumentPicker label="Instrumento A" key={`watch-a-${pickerSession}`} value={watchA} onChange={i => setWatchA(i as TradingInstrument | undefined)} search={market.search} disabled={!available} acceptSuggestionOnTab />
        <InstrumentPicker label="Instrumento B" key={`watch-b-${pickerSession}`} value={watchB} onChange={i => setWatchB(i as TradingInstrument | undefined)} search={market.search} disabled={!available} acceptSuggestionOnTab />
        {compare && <InstrumentPicker label="Referencia C · ej. DLR/SPOT" key={`watch-c-${pickerSession}`} value={watchC} onChange={i => setWatchC(i as TradingInstrument | undefined)} search={market.search} disabled={!available}
          autoFocus={focusReference} onAutoFocus={() => setFocusReference(false)}
          divisor={{ checked: divideCBy100, onChange: setDivideCBy100 }} />}
        <label className="ro-compare"><input type="checkbox" checked={compare} disabled={!available} onChange={e => {
          setCompare(e.target.checked); setFocusReference(e.target.checked); setWatchC(undefined); setDivideCBy100(false);
        }} />Agregar referencia C</label>
        <button type="button" disabled={!available || !watchA || !watchB || compare && !watchC} onClick={() => void commit(base => {
          if (!watchA || !watchB || watchA.id === watchB.id) throw Error("Elegí instrumentos diferentes.");
          if (base.watch.length >= MAX_WATCH) throw Error(`Podés observar hasta ${MAX_WATCH} pares.`);
          const pair: TradingPair = { id: crypto.randomUUID(), a: watchA, b: watchB, ...(compare && watchC ? { c: watchC, cDivisor: divideCBy100 ? 100 : undefined } : {}) };
          if (compare && !watchC) throw Error("Seleccioná la referencia C.");
          if (base.watch.some(p => pairKey(p) === pairKey(pair))) throw Error("El par ya está en el monitor.");
          return { ...base, watch: [...base.watch, pair] };
        }).then(saved => { if (saved) setDivideCBy100(false); })}>Agregar par</button>
        <button type="button" className="ro-defaults" disabled={!available} onClick={() => void loadDefaults(true)}>{loadingDefaults ? "Cargando pares…" : "Agregar pares predeterminados"}</button>
      </div>
      <div className="ro-grid-tools"><GridColumnPicker label="Monitor" columns={monitorColumns} preferences={monitorPreferences} /><small>Arrastrá ⠿ para mover · con foco, usá ↑/↓</small><button type="button" className="ro-manual-order" disabled={!monitorSort} onClick={() => changeGridSort("watch")}>Orden manual</button></div>
      <div className="ro-table-wrap ro-grid-wrap ro-monitor-wrap"><table className="ro-monitor-table"><thead><tr>{monitorHeader("Par A/B", "pair")}{monitorColumns.map(([column, label]) => showMonitor(column) && (column !== "c" || hasReference) && <GridSortHeader key={column} label={label} column={column} sort={monitorSort} disabled={!ready} onSort={key => changeGridSort("watch", key)} />)}<th scope="col">Acciones</th></tr></thead><tbody>{ready && monitorRows.map(p => {
        const label = pairLabel(p);
        const rate = isRateInstrument(p.a) || isRateInstrument(p.b);
        const monitorOnly = isMonitorOnly(p.a) || isMonitorOnly(p.b);
        const a = quotes[p.a.id], b = quotes[p.b.id], c = referenceCQuote(quotes, p);
        const result = calculateRatio(a, b, c), reference = referenceCFormula(p.cDivisor), updatedAt = ratioUpdatedAt(a, b, c);
        return <tr key={p.id} data-row-id={p.id} {...rowDrop("watch", p.id)} className={dropTarget === `watch:${p.id}` ? "ro-drop-target" : gridDrag?.from === p.id ? "ro-dragging" : undefined}><td><div className="ro-pair-cell">{rowHandle("watch", p.id, `par ${label}`, monitorRowIds)}<div><strong title={`${p.a.symbol}/${p.b.symbol}`}>{label}</strong><small>{currencyLabel(p.a.currency)} / {currencyLabel(p.b.currency)}{p.c ? ` · brecha (A/B ÷ ${reference} − 1) × 100` : rate ? " · tasas TNA" : ""}</small></div></div></td>
          {showMonitor("a") && <td title={`Última operación A: ${tradeLabel(a?.tradedAt)}`}><OptionQuoteValue key={p.a.id} value={a?.issue ? undefined : a?.last} formatValue={n => numberLabel(n) + (isRateInstrument(p.a) ? "% TNA" : "")} /></td>}
          {showMonitor("b") && <td title={`Última operación B: ${tradeLabel(b?.tradedAt)}`}><OptionQuoteValue key={p.b.id} value={b?.issue ? undefined : b?.last} formatValue={n => numberLabel(n) + (isRateInstrument(p.b) ? "% TNA" : "")} /></td>}
          {showMonitor("c") && hasReference && <td title={p.c ? `${p.c.symbol}${p.cDivisor ? ` ÷ ${p.cDivisor}` : ""} · ${tradeLabel(c?.tradedAt)}` : undefined}>{p.c ? <OptionQuoteValue key={p.c.id} value={c?.issue ? undefined : c?.last} formatValue={numberLabel} /> : "—"}</td>}
          {showMonitor("ratio") && <td className="ro-ratio" title={result.issue || (p.c ? `((A/B) ÷ ${reference} − 1) × 100. Diferencia absoluta |A/B − ${reference}| entre paréntesis.` : undefined)}><OptionQuoteValue key={pairKey(p)} value={result.ratio} formatValue={n => p.c ? ratioLabel(n, "percent", result.absoluteDifference) : pairRatioLabel(n, p.a, p.b)} /></td>}
          {showMonitor("daily") && <td className={`ro-daily ${signed(result.change)}`} title={result.referenceIssue || result.issue || "(Ratio actual / ratio de referencia diaria − 1) × 100"}>{result.change === undefined ? "—" : dailyLabel(result.change)}</td>}
          {showMonitor("updated") && <td className="ro-updated" title={`Hora de mercado del último precio de A/B${p.c ? "/C" : ""}: ${tradeLabel(updatedAt)}`}>{ratioTimeLabel(updatedAt)}</td>}
          <td><div className="ro-actions">
            <RatioChartLink pair={p} />
            <ReferenceChartButton pair={p} />
            <button type="button" className="ro-monitor-operation" disabled={!available || monitorOnly} title={monitorOnly ? "A y B deben admitir el registro de una posición." : undefined} onClick={() => begin(p)}>{monitorOnly ? "Sólo monitor" : "Abrir operación"}</button>
            <button type="button" disabled={!available || !!p.c} aria-label={`Invertir ${label}`} title={p.c ? "Comparación (A/B)/C; agregá otra fórmula para cambiar el sentido" : "Invertir A/B"} onClick={() => void commit(base => invertWatchPair(base, p.id))}>⇄</button>
            <button type="button" disabled={!available} aria-label={`Quitar par ${label}`} onClick={() => void commit(base => ({ ...base, watch: base.watch.filter(x => x.id !== p.id) }))}>×</button>
          </div></td></tr>;
      })}</tbody></table></div>
      {ready && !book.watch.length && <p className="ro-empty">Agregá un par al Monitor. Cuando decidas entrar, pulsá Abrir operación.</p>}
    </div>}
    {view === "opening" && <form aria-label={edit ? "Editar operación de ratio" : "Abrir operación de ratio"} onSubmit={e => { e.preventDefault(); void saveEntry(); }}>
      {edit && <p className="ro-notice">Las cantidades son totales de apertura. Los cierres registrados se conservan; corregir precios o gastos recalcula el resultado.</p>}
      <div className="ro-entry-grid"><div className="ro-direction"><button type="button" aria-pressed={draft.direction === 1} disabled={!available || partiallyClosed} onClick={() => selectDirection(1)}>Long {draft.a?.symbol || "A"} / Short {draft.b?.symbol || "B"}</button>
        <div className="ro-opening-ratio" title={edit ? undefined : marketRatio?.issue || "Calculado con el último precio de A y de B, igual que en el Monitor."}>
          <small>{formRatioLabel}</small><output aria-label={formRatioLabel} aria-live={edit ? undefined : "off"}>{draft.a && draft.b ? pairRatioLabel(formRatio, draft.a, draft.b) : "—"}</output>
        </div>
        <button type="button" aria-pressed={draft.direction === -1} disabled={!available || partiallyClosed} onClick={() => selectDirection(-1)}>Long {draft.b?.symbol || "B"} / Short {draft.a?.symbol || "A"}</button></div>
        {leg("a")}{leg("b")}
        <aside className="ro-entry-costs"><label>Comisión % · compra y venta<input aria-label="Comisión %" type="number" min="0" max="100" step="any" value={draft.commission} disabled={!available} required onChange={e => setDraft(p => ({ ...p, commission: e.target.value }))} /></label><small>Un único porcentaje en cada compra y venta, al abrir y cerrar.</small>
          <label>Fecha/hora de apertura · Argentina<input type="datetime-local" value={draft.at} max={dateInput()} disabled={!available} required onChange={e => changeEntryDate(e.target.value)} /></label>
          <label>Ratio objetivo {ref ? "A/B " : ""}{draft.a && draft.b && sameCurrency(draft.a, draft.b) ? "(%)" : "(número)"} · opcional<input aria-label="Ratio objetivo" type="number" step="any" value={draft.target} disabled={!available} onChange={e => setDraft(p => ({ ...p, target: e.target.value }))} /></label><small>{draft.a && draft.b && sameCurrency(draft.a, draft.b) ? "(A/B − 1) × 100. Ej.: 1,065 → 6,50%." : "Cociente A/B sin conversiones."} {draft.direction === 1 ? "Objetivo al alza (≥)." : "Objetivo a la baja (≤)."}</small>
          {mixed && <small>{draft.preservedB !== undefined ? "Cantidad B histórica conservada hasta cambiar A." : "Distinta moneda: B copia los nominales de A."} El P&L se mantiene separado por moneda.</small>}
        </aside>
        <div className="ro-sizing">{sizing("a")}{sizing("b")}<small>{draft.preservedB !== undefined ? "Se conserva la cantidad B registrada. Cambiar A sincroniza ambos nominales." : mixed ? "B copia exactamente los nominales de A. La cantidad debe respetar los lotes de ambas patas." : "B se ajusta al lote más cercano con los precios elegidos para igualar montos."} DDMM y factores quedan guardados en cada pata.</small></div>
      </div>
      {ref && <section className="ro-close-form" aria-labelledby="ro-reference-title">
        <h4 id="ro-reference-title">Referencia C · {ref.instrument.symbol}{ref.divisor ? " ÷ 100" : ""}</h4>
        <div className="ro-close-legs">
          <div className="ro-close-leg">
            <div className="ro-close-fields">
              <label>Precio C al abrir<input type="number" step="any" min={Number.MIN_VALUE} required value={ref.price} disabled={!available}
                onChange={e => changeReference({ price: e.target.value, copiedPrice: false })} /></label>
              <button type="button" disabled={!available || !market.context?.connected || !!openReferenceQuote?.issue || !openReferenceQuote?.last}
                onClick={() => changeReference({ price: formatOptionInput(openReferenceQuote!.last!, 21), copiedPrice: true })}>Usar último C · {numberLabel(openReferenceQuote?.last)}</button>
            </div>
            <small>Ingresá el precio original de C. La brecha aplica el divisor guardado.</small>
            <div>Brecha de entrada · <output>{ratioLabel(spreadAt(pa, pb, Number(ref.price), ref.divisor), "percent")}</output></div>
            <div>Brecha de mercado · <output>{ratioLabel(marketSpread, "percent")}</output></div>
          </div>
          <div className="ro-close-leg">
            <div className="ro-close-fields">
              <label>Objetivo de brecha (%)<input type="number" step="any" value={ref.goal} disabled={!available}
                onChange={e => changeReference({ goal: e.target.value })} /></label>
              <label>Condición de brecha<select aria-label="Condición de brecha" value={ref.comparison} disabled={!available}
                onChange={e => changeReference({ comparison: e.target.value === "above" ? "above" : "below" })}>
                <option value="below">Menor o igual (≤)</option><option value="above">Mayor o igual (≥)</option>
              </select></label>
            </div>
          </div>
        </div>
        {canTradeReference(ref.instrument) && <div className="ro-close-leg">
          <label className="ro-compare"><input type="checkbox" checked={ref.future} disabled={!available || partiallyClosed}
            onChange={e => changeReference({ future: e.target.checked })} />Registrar C como tercera pata</label>
          {ref.future && <>
            <div className="ro-close-fields">
              <label>Sentido C<select aria-label="Sentido C" value={ref.side} disabled={!available || partiallyClosed}
                onChange={e => changeReference({ side: e.target.value === "1" ? 1 : -1 })}>
                <option value={1}>Long</option><option value={-1}>Short</option>
              </select></label>
              <label>Contratos C<input type="number" step="1" min="1" value={ref.quantity} required disabled={!available}
                onChange={e => changeReference({ quantity: e.target.value })} /></label>
              <label>Factor monetario C<input type="number" step="any" min={Number.MIN_VALUE} value={ref.factor} required disabled={!available || partiallyClosed}
                onChange={e => changeReference({ factor: e.target.value })} /></label>
              <label>Lote mínimo C<input type="number" step="1" min="1" value={ref.step} required disabled={!available || partiallyClosed}
                onChange={e => changeReference({ step: e.target.value })} /></label>
              <label>DDMM C (%)<input type="number" step="any" min="0" max="100" value={ref.ddmm} required disabled={!available}
                onChange={e => changeReference({ ddmm: e.target.value })} /></label>
            </div>
            <small>Resultado bruto del futuro = contratos × variación de precio × factor monetario, según el sentido.</small>
          </>}
        </div>}
      </section>}
      <div className="ro-entry-footer"><button className="ro-primary" type="submit" disabled={!available}>{busy ? "Guardando…" : edit ? "Guardar cambios" : "Abrir operación"}</button><button type="button" disabled={busy} onClick={() => { const wasEdit = !!edit; setEdit(undefined); setDraft(emptyDraft()); setView(wasEdit ? "operations" : "monitor"); setIssue(""); setPickerSession(n => n + 1); }}>{edit ? "Cancelar edición" : "Volver al monitor"}</button><small>Registro local de las patas ingresadas. Verificá las ejecuciones y tenencias en tu cuenta.</small></div>
    </form>}
    {view === "operations" && <div className={`ro-operations-grid${op ? "" : " no-detail"}`}>
      <div><div className="ro-grid-tools"><GridColumnPicker label="Operaciones abiertas" columns={operationColumns} preferences={operationPreferences} /><small>Arrastrá ⠿ para mover · con foco, usá ↑/↓</small><button type="button" className="ro-manual-order" disabled={!operationsSort} onClick={() => changeGridSort("operations")}>Orden manual</button>
        {pnlCurrencies.length > 1 && <label className="ro-sort-currency">P&amp;L en <select aria-label="Moneda para ordenar P&L" value={sortCurrency} onChange={event => { gridSortVersion.current.operations++; setPnlCurrency(event.target.value); }}>{pnlCurrencies.map(currency => <option key={currency} value={currency}>{currencyLabel(currency)}</option>)}</select></label>}
        <div className="ro-filters"><button type="button" aria-pressed={!all} onClick={() => { setAll(false); if (op && isClosed(op)) setSelected(undefined); }}>Abiertas</button><button type="button" aria-pressed={all} onClick={() => setAll(true)}>Todas</button></div></div>
        <div className="ro-table-wrap ro-grid-wrap"><table className="ro-operations-table"><thead><tr>{operationsHeader("Par / sentido", "pair")}{operationsHeader("Estado", "status")}{operationColumns.map(([column, label]) => showOperation(column) && <GridSortHeader key={column} label={label} column={column} sort={operationsSort} disabled={!ready} description={column === "quantity" ? "Ordenar por la cantidad abierta de A" : ["realized", "pending", "net"].includes(column) ? `Ordenar importes en ${currencyLabel(sortCurrency)}; sin valor al final` : undefined} onSort={key => changeGridSort("operations", key)} />)}<th scope="col">Acciones</th></tr></thead><tbody>{ready && operationsRows.map(o => <tr key={o.id} data-row-id={o.id} {...rowDrop("operations", o.id)} onClick={event => { if (!(event.target as Element).closest("button,input,select,a")) setSelected(o.id); }} className={[selected === o.id ? "ro-selected" : "", dropTarget === `operations:${o.id}` ? "ro-drop-target" : gridDrag?.from === o.id ? "ro-dragging" : ""].filter(Boolean).join(" ")}>
          <td><div className="ro-pair-cell">{rowHandle("operations", o.id, `operación ${o.legs[0].instrument.symbol}/${o.legs[1].instrument.symbol}`, operationsRowIds)}<div><div className="ro-pair-chips" aria-label={`Par ${o.legs[0].instrument.symbol}/${o.legs[1].instrument.symbol}`}>{o.legs.map(l => <span key={l.instrument.id} className={`ro-chip ${l.side === 1 ? "buy" : "sell"}`}><strong>{l.instrument.symbol}</strong><span>{l.side === 1 ? "Long" : "Short"}</span></span>)}</div>{o.reference && <small>vs {o.reference.instrument.symbol}{o.reference.divisor ? " ÷ 100" : ""}</small>}</div></div></td><td className="ro-state">{operationStatus(o)}</td>{showOperation("quantity") && <td>{o.legs.map(l => numberLabel(remaining(l))).join(" / ")}</td>}
          {showOperation("ratio") && <td>{ratioSummary(o)}<small className={!isClosed(o) && goalReached(o, currentRatio(o, quotes)) ? "ro-up" : ""}>{goalText(o)}</small>
            {o.reference?.goal && <small className={!isClosed(o) && spreadGoalReached(o.reference.goal, currentSpread(o, quotes)) ? "ro-up" : ""}>{spreadGoalText(o)}</small>}</td>}
          {(["realized", "pending", "net"] as const).map(field => showOperation(field) && <td key={field}>{pnlLines(o, field)}</td>)}{showOperation("updated") && <td className="ro-updated" title={`Hora de mercado del ratio: ${tradeLabel(operationQuoteTime(o, quotes))}`}>{ratioTimeLabel(operationQuoteTime(o, quotes))}</td>}<td><div className="ro-actions"><RatioChartLink pair={operationPair(o)} /><ReferenceChartButton pair={operationPair(o)} /><button type="button" className="ro-action-icon" aria-label="Detalle" title="Ver detalle" onClick={() => { setSelected(o.id); setIssue(""); }}><GridActionIcon action="detail" /></button>{!isClosed(o) && <button type="button" className="ro-action-icon" aria-label="Editar" title="Editar operación" disabled={!available} onClick={() => beginEdit(o)}><GridActionIcon action="edit" /></button>}<button type="button" className="ro-action-icon ro-danger" aria-label="Eliminar" title="Eliminar operación" disabled={!available} onClick={() => void remove(o)}><GridActionIcon action="delete" /></button></div></td>
        </tr>)}</tbody></table></div>
        {ready && !book.operations.some(o => all || !isClosed(o)) && <p className="ro-empty">Sin operaciones en esta vista. Elegí un par en el Monitor y registrá su apertura.</p>}
      </div>
      {op && <aside className="ro-detail">
        <header className="ro-detail-heading">
          <h3>{op.reference ? pairLabel(operationPair(op)) : `${op.legs[0].instrument.symbol}/${op.legs[1].instrument.symbol}`}</h3>
          <small>{new Date(op.openedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" })}</small>
          <p className={!isClosed(op) && goalReached(op, currentRatio(op, quotes)) ? "ro-up" : ""}>{goalText(op)}</p>
          {op.reference?.goal && <p className={!isClosed(op) && spreadGoalReached(op.reference.goal, currentSpread(op, quotes)) ? "ro-up" : ""}>{spreadGoalText(op)}</p>}
          <div className="ro-detail-ratio" aria-label="Ratio de la operación">{ratioSummary(op)}</div>
          {op.reference && <small>C de entrada · {numberLabel(op.reference.entry)}{op.reference.divisor ? " (precio antes de dividir por 100)" : ""}</small>}
        </header>
        <div className="ro-detail-summary">
          <div className="ro-pnl-lines">{([ ["gross", "Resultado bruto"], ["commission", "Comisión · apertura + cierre"], ["ddmm", "DDMM · apertura + cierre"], ["net", "Neto al desarme"], ["realized", "Realizado neto"], ["pending", "Remanente neto"] ] as const).map(([field, label]) => <div key={field}><span>{label}</span><strong>{pnlLines(op, field)}</strong></div>)}</div>
          <table><thead><tr><th>Pata</th><th>Entrada</th><th>Abierta / total</th></tr></thead><tbody>{op.legs.map((l, i) => <tr key={i}><td>{l.side === 1 ? "Long" : "Short"} {l.instrument.symbol}<small>DDMM {input(l.ddmm)}%</small></td><td>{numberLabel(l.entry)}</td><td>{numberLabel(remaining(l))} / {numberLabel(l.quantity)}</td></tr>)}</tbody></table>
        </div>
        {selectedPnl.some(p => p.issue) && <p className="ro-issue">{selectedPnl.find(p => p.issue)?.issue}</p>}
        {closeQuotes && !isClosed(op) && <section className="ro-close-form" aria-labelledby="ro-close-title"><h4 id="ro-close-title">Registrar cierre</h4>
          <div className="ro-close-legs">{op.legs.map((leg, i) => {
            const name = tradingLegNames[i];
            const open = remaining(leg);
            const { quote, issue: quoteIssue } = closeQuotes[i];
            const bookSide = leg.side === 1 ? "Compra" : "Venta";
            const bookHint = leg.side === 1 ? "Punta compradora para vender el Long" : "Punta vendedora para recomprar el Short";
            const marketPrices = [["Último", quote?.last], ["Compra", bestBookPrice(quote, "bid")], ["Venta", bestBookPrice(quote, "ask")]] as const;
            return <div key={leg.instrument.id} className="ro-close-leg">
              <div className="ro-close-fields">
                <label><span title={leg.instrument.symbol}>Precio cierre {name} · {leg.instrument.symbol}</span>
                  <input aria-label={`Precio cierre ${name}`} type="number" min="0" step="any" value={closePrices[i]} disabled={!available || !open} onChange={e => setClosePrice(i, e.target.value)} />
                </label>
                <label className="ro-close-quantity"><span title={leg.instrument.quantityUnit}>Cantidad · {leg.instrument.quantityUnit}</span>
                  <input aria-label={`Cantidad cierre ${name}`} aria-describedby="ro-close-help" type="number" min={leg.step} max={open} step={leg.step} value={closeDraft?.id === op.id && closeDraft.leg === i ? closeDraft.value : input(closeQuantities?.[i])} className={closeQuantities && closeDraft?.leg !== i ? "ro-calculated" : undefined} disabled={!available || open === 0} onChange={e => { setIssue(""); setCloseDraft({ id: op.id, snapshot: JSON.stringify(op), leg: i as TradingLegIndex, value: e.target.value }); }} />
                </label>
              </div>
              <div className="ro-close-quotes" role="group" aria-label={`Cotizaciones de ${leg.instrument.symbol} para el cierre`}>
                {marketPrices.map(([label, price]) => <button key={label} type="button"
                  className={label === bookSide && price !== undefined ? "ro-close-book-side" : undefined}
                  title={price === undefined ? quoteIssue || "Sin precio publicado" : label === bookSide ? bookHint : label === "Último" ? tradeLabel(quote?.tradedAt) : undefined}
                  aria-label={`Usar ${label} para el cierre ${name}: ${numberLabel(price)}`}
                  disabled={!available || !open || price === undefined}
                  onClick={() => setClosePrice(i, input(price), true)}>
                  <span>{label}</span><OptionQuoteValue value={price} formatValue={numberLabel} />
                </button>)}
              </div>
              <small className="ro-close-balance">Abiertos: {numberLabel(open)}{closeQuantities && <> · Luego: {numberLabel(open - closeQuantities[i])}</>}</small>
            </div>;
          })}</div>
          <div className="ro-close-fields">
            <label>Fecha/hora del cierre · Argentina<input type="datetime-local" min={dateInput(op.openedAt)} max={dateInput()} value={closeInput?.at ?? ""}
              disabled={!available} onChange={e => changeCloseDate(e.target.value)} /></label>
            {referenceOnlyAtClose && <label>Precio C al cerrar<input type="number" step="any" min={Number.MIN_VALUE} value={closeReferencePrice}
              disabled={!available} onChange={e => changeCloseInput({ reference: { value: e.target.value } })} /></label>}
          </div>
          {referenceOnlyAtClose && <button type="button" disabled={!available || !market.context?.connected || !!closeReferenceQuote?.issue || !closeReferenceQuote?.last}
            onClick={() => changeCloseInput({ reference: { value: formatOptionInput(closeReferenceQuote!.last!, 21), fromMarket: true } })}>Usar último C · {numberLabel(closeReferenceQuote?.last)}</button>}
          <small id="ro-close-help">Ingresá la cantidad de una pata. Las demás conservan la proporción abierta, al lote más cercano.</small>
          {closeIssue && <p className="ro-close-issue" role="alert">{closeIssue}</p>}
          <div className="ro-close-actions">
            <button type="button" className="ro-primary ro-register-close" disabled={!available || !closeQuantities || !closeHasPrices} onClick={() => void registerClose()}>Registrar cierre</button>
            <div className="ro-actions">{[.25, .5, 1].map(f => <button key={f} type="button" disabled={!available || !closeHasPrices || f < 1 && !allLegsOpen}
              title={f < 1 && !allLegsOpen ? "Ingresá una cantidad para cerrar una sola pata." : undefined}
              onClick={() => void registerClose(f)}>{f === 1 ? "Cerrar todo" : `Cerrar ${f * 100}%`}</button>)}</div>
          </div>
          <small>Los porcentajes se aplican al remanente. Si dejás la fecha vacía, se registra con la hora actual.</small>
        </section>}

        <RatioCloseHistory key={`${scope}:${op.id}`} operation={op} available={available} onChange={changeRecordedClose} />
      </aside>}
    </div>}
  </section>;
}
