import { Dispatch, Fragment, SetStateAction, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { preloadOptionTicket } from "../Matriz";
import { Catalog, Contract, lastTradedPremium, Quote, useOptionMarket } from "./market";
import { deriveOptionMetrics } from "./marketMetrics";
import { caucionReferenceLabel, type CaucionReference } from "./caucionRate";
import { extraMetricLabels, OptionMetricCell, type OptionMetricField } from "./OptionsMetrics";
import { OptionQuoteValue } from "./OptionQuoteValue";
import { formatExpiryDays, formatOptionAmount, formatOptionExpiry, formatOptionInput, formatOptionNumber as fmt, formatOptionVolatility } from "./format";
import { daysToExpiry, Leg, localDate, MAX_LEGS, newLeg, numeric, parseSignedQuantity, simulationLegs, Simulation, type standardDeviationLevels } from "./model";
import { importPosition, readPositionSnapshot, setPositionQuantity, startPositionDraft, type PositionSeries } from "./positions";
import { premiumNeedsReview, signedPositionQuantity, validHistoricalPremium } from "./positionStorage";
import "./MarketChain.css";
import StrategyPicker from "./StrategyPicker";
import ToolbarIcon from "../ToolbarIcon";
import { preferredOptionMarket, quotePrice, recipeDraftPrices, strategyRecipe, type StrategyChoice } from "./strategyTemplates";
import type { StrikeMarket } from "./strategyAdjustments";

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const marketKey = (contract: Contract) => `${contract.currency}|${contract.settlement}`;
const expiryDate = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
const quantityPresets = [1, 10, 25, 50, 100];
const legKey = (leg: Leg) => `${leg.id}:${leg.securityId}:${leg.side}`;
type ChainColumn = OptionMetricField | "bid" | "ask";
type OptionalColumn = Exclude<OptionMetricField, "iv">;
const chainColumns: Record<ChainColumn, { heading: string; compactHeading?: string; label?: string; title?: string; className?: string; width?: number }> = {
  volume: { heading: "Vol. nom.", label: "Volumen nominal", width: 76 },
  change: { heading: "Var. %", label: "Variación diaria", width: 68 },
  lastTradeAt: { heading: "Últ. op.", label: "Fecha y hora de última operación", title: "Fecha y hora de última operación (ART)", width: 126 },
  delta: { heading: "Delta", width: 58 },
  theta: { heading: "Θ/d teór.", compactHeading: "Θ/d", label: "Theta teórico por día", title: "Theta teórico BSM por día calendario y unidad de prima", width: 62 },
  extrinsic: { heading: "Extr. Mid", compactHeading: "Extr.", label: "Extrínseco al Mid", title: "Precio Mid menos intrínseco, por unidad de prima", width: 72 },
  spreadPercent: { heading: "Spread %", title: "(ASK − BID) ÷ Mid × 100, con ambas puntas válidas", width: 76 },
  mid: { heading: "Mid", title: "Promedio de BID y ASK con ambas puntas válidas", width: 72 },
  last: { heading: "Últ.", label: "Último precio operado", title: "Último precio operado informado por Matriz", width: 76 },
  referencePrice: { heading: "Ref.", label: extraMetricLabels.referencePrice, title: "Precio de referencia informado por Matriz", width: 76 },
  intrinsic: { heading: "Intrínseco", label: extraMetricLabels.intrinsic, title: "Valor al ejercicio inmediato con el precio del subyacente y el strike en la misma moneda", width: 85 },
  gamma: { heading: "Gamma", label: extraMetricLabels.gamma, title: "Cambio de Delta por unidad de precio del subyacente. El modelo BSM usa VI nativa, tasa y dividendos de Análisis.", width: 78 },
  vega: { heading: "Vega", label: extraMetricLabels.vega, title: "Cambio de prima por unidad ante +1 punto porcentual de VI. El modelo BSM usa VI nativa, tasa y dividendos de Análisis.", width: 76 },
  bid: { heading: "BID · Vender", className: "ct-opt-bid" },
  ask: { heading: "ASK · Comprar", className: "ct-opt-ask" },
  iv: { heading: "VI", label: "Volatilidad implícita", className: "ct-opt-vi-heading", width: 62 },
};
const optionalColumns: OptionalColumn[] = ["volume", "change", "lastTradeAt", "delta", "theta", "extrinsic", "spreadPercent", "mid", "last",
  "referencePrice", "intrinsic", "gamma", "vega"];
const defaultColumns: OptionalColumn[] = ["volume", "change", "delta", "theta", "extrinsic", "last"];
const columnLabel = (column: OptionalColumn) => chainColumns[column].label ?? chainColumns[column].heading;
const storedColumnOrder = (saved: unknown) => Array.isArray(saved)
  ? [...new Set(saved.filter((item): item is OptionalColumn => optionalColumns.includes(item)))]
  : undefined;
type ColumnEdit = (columns: OptionalColumn[]) => OptionalColumn[];

function useChainColumnPreferences() {
  const [savedColumns, setSavedColumns] = useState<OptionalColumn[]>();
  const confirmedColumns = useRef<OptionalColumn[]>(undefined);
  const pendingEdits = useRef<ColumnEdit[]>([]);
  const writing = useRef(false);
  const writes = useRef(Promise.resolve());
  const key = `OptionsSimulatorChainColumnsV2:${location.origin}`;
  const legacyKey = `OptionsSimulatorChainColumnsV1:${location.origin}`;
  async function readColumns() {
    const values = await chrome.storage.local.get([key, legacyKey]);
    const legacy = values[legacyKey];
    return storedColumnOrder(values[key]) ?? (Array.isArray(legacy)
      ? optionalColumns.filter(column => legacy.includes(column)) : defaultColumns);
  }
  function applyPendingEdits(columns: OptionalColumn[]) {
    return pendingEdits.current.reduce((order, edit) => edit(order), columns);
  }
  function publish(columns: OptionalColumn[]) {
    confirmedColumns.current = columns;
    const visible = applyPendingEdits(columns);
    setSavedColumns(visible);
    return visible;
  }
  useEffect(() => {
    let mounted = true;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      // A local write can emit its change event before the promise resolves.
      if (area !== "local" || !(key in changes) || writing.current) return;
      publish(storedColumnOrder(changes[key].newValue) ?? defaultColumns);
    };
    const storageEvents = globalThis.chrome?.storage?.onChanged;
    storageEvents?.addListener(onChanged);
    void readColumns().catch(() => defaultColumns).then(columns => {
      if (mounted && !confirmedColumns.current) publish(columns);
    });
    return () => {
      mounted = false;
      storageEvents?.removeListener(onChanged);
    };
  }, [key, legacyKey]);

  function saveColumns(edit: ColumnEdit) {
    pendingEdits.current.push(edit);
    publish(confirmedColumns.current ?? defaultColumns);
    async function save() {
      if (!pendingEdits.current.length) return;
      let previous: OptionalColumn[];
      try {
        previous = await readColumns();
      } catch {
        // Keep the edits pending until the shared order can be read.
        return;
      }
      const batchSize = pendingEdits.current.length;
      const columns = publish(previous);
      writing.current = true;
      try {
        await chrome.storage.local.set({ [key]: columns });
        pendingEdits.current.splice(0, batchSize);
        publish(columns);
      } catch {
        // Retry the same edits on the next change.
      } finally {
        writing.current = false;
      }
    }
    writes.current = writes.current.then(async () => {
      // Read, edit and write under one lock shared by tabs of this Matriz origin.
      if (navigator.locks) await navigator.locks.request(key, save).catch(save);
      else await save();
    });
  }
  function resetColumns() {
    const shown = applyPendingEdits(confirmedColumns.current ?? defaultColumns);
    // A reset applies to the layout the user saw when they requested it.
    saveColumns(columns => columns.length === shown.length && columns.every((column, index) => column === shown[index])
      ? defaultColumns : columns);
  }
  return { savedColumns, saveColumns, resetColumns };
}

const strikeWidth = { regular: 104, compact: 76 };
function columnWidth(column: ChainColumn, compact: boolean) {
  const width = chainColumns[column].width;
  return compact && width !== undefined ? Math.round(width * .77) : width;
}
function minimumChainWidth(columns: ChainColumn[], compact: boolean) {
  const bookWidthPerSide = compact ? 176 : 239;
  return strikeWidth[compact ? "compact" : "regular"] +
    2 * (bookWidthPerSide + columns.reduce((total, column) => total + (columnWidth(column, compact) ?? 0), 0));
}
function defaultExpiration(dates: string[]) {
  const today = localDate().replaceAll("-", "");
  return dates.find(date => date >= today) ?? dates[0] ?? "";
}

export function SignedQuantityInput({ id, label, value, className, disabled, title = "Cantidad con signo · + compra, − venta", onCommit }: {
  id?: string; label: string; value: string; className?: string; disabled?: boolean; title?: string; onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState<string>();
  return <input id={id} type="text" data-ct-inline-editor className={className}
    aria-label={label} title={title} placeholder="—" disabled={disabled} value={draft ?? value}
    onFocus={event => event.currentTarget.select()} onChange={event => setDraft(event.target.value)}
    onBlur={() => { if (draft !== undefined) onCommit(draft); setDraft(undefined); }}
    onKeyDown={event => {
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(undefined); }
    }} />;
}

function PositionPremium({ label, leg, disabled, onChange, onReview }: {
  label: string; leg?: Leg; disabled: boolean; onChange(id: number, value: string): void; onReview(id: number): void;
}) {
  const warningId = useId();
  const input = useRef<HTMLInputElement>(null);
  const warning = leg && premiumNeedsReview(leg) ?
    `${numeric(leg.premiumQuantity ?? "") !== numeric(signedPositionQuantity(leg))
      ? `Cambió la cantidad de ${leg.premiumQuantity} a ${signedPositionQuantity(leg)}.` : "La cantidad cambió desde la última revisión."} Revisá la prima histórica.` : undefined;
  return <>
    <input ref={input} type="number" min="0" max="1000000000" step="any" aria-label={`Prima histórica ${label}`} readOnly={!leg} disabled={disabled}
      value={leg?.premium ?? ""} placeholder={leg ? "Completar" : "—"} aria-describedby={warning ? warningId : undefined}
      title={warning ?? "Prima histórica por unidad"}
      onChange={event => { if (leg) onChange(leg.id, event.target.value); }} />
    {leg && warning && <div className="ct-sim-premium-warning">
      <button type="button" className="ct-opt-premium-alert" data-ct-inline-editor disabled={disabled}
        aria-label={`Ver aviso de prima histórica ${label}`} title={warning} popoverTarget={`${warningId}-details`}>!</button>
      <div id={`${warningId}-details`} popover="auto" data-ct-inline-editor className="ct-opt-premium-review">
        <p id={warningId}>{warning}</p>
        {validHistoricalPremium(leg.premium) && <button type="button" disabled={disabled} aria-label={`Confirmar prima histórica ${label}`}
          onClick={() => { onReview(leg.id); input.current?.focus(); }}>Prima revisada</button>}
      </div>
    </div>}
  </>;
}

export default function MarketChain({ active, toolbar, input, setInput, onStrikeMarket, onNewStrategy, deviationReference,
  positionMode, setPositionMode, positionAccounting, onPremiumChange, onPremiumReview, automaticCaucion, caucion, usdRate, onMarketContext }: {
  active: boolean; toolbar: HTMLDivElement | null; input: Simulation; setInput: Dispatch<SetStateAction<Simulation>>;
  onStrikeMarket(market: StrikeMarket | undefined): void;
  onNewStrategy(): void;
  deviationReference: ReturnType<typeof standardDeviationLevels>;
  positionMode: boolean; setPositionMode(value: boolean): void; positionAccounting?: ReactNode;
  onPremiumChange(id: number, value: string): void; onPremiumReview(id: number): void;
  automaticCaucion: boolean; caucion?: CaucionReference; usdRate: string;
  onMarketContext(context: { currency?: Simulation["currency"]; version: string }): void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const chainScroll = useRef<HTMLDivElement>(null);
  const [availableChainWidth, setAvailableChainWidth] = useState(0);
  useLayoutEffect(() => {
    const scroll = chainScroll.current;
    if (!scroll) return;
    const measure = () => setAvailableChainWidth(scroll.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);
  const [strikeRows, setStrikeRows] = useState<{ strike: number; top: number; bottom: number }[]>([]);
  const [underlyingId, setUnderlying] = useState("");
  const [expiration, setExpiration] = useState("");
  const [market, setMarket] = useState("");
  const [selectionReady, setSelectionReady] = useState(false);
  const { savedColumns, saveColumns, resetColumns } = useChainColumnPreferences();
  const chainConfigId = useId();
  const configDialog = useRef<HTMLDialogElement>(null);
  const nativePopover = typeof HTMLElement.prototype.showPopover === "function";
  const visibleColumns = savedColumns ?? defaultColumns;
  const hiddenColumns = optionalColumns.filter(column => !visibleColumns.includes(column));
  const callColumns: ChainColumn[] = [...visibleColumns, "bid", "ask", "iv"];
  const putColumns: ChainColumn[] = ["iv", "bid", "ask", ...visibleColumns.slice().reverse()];
  const columnsPerSide = callColumns.length - 1;
  const regularMinWidth = minimumChainWidth(callColumns, false);
  const compactChain = availableChainWidth > 0 && availableChainWidth < regularMinWidth;
  const marketTableStyle = {
    minWidth: compactChain ? minimumChainWidth(callColumns, true) : regularMinWidth,
    "--ct-opt-metric-strike": `${strikeWidth[compactChain ? "compact" : "regular"]}px`,
  } as CSSProperties;
  function moveColumn(column: OptionalColumn, direction: -1 | 1) {
    saveColumns(previous => {
      const from = previous.indexOf(column), to = from + direction;
      if (from < 0 || to < 0 || to >= previous.length) return previous;
      const columns = previous.slice();
      [columns[from], columns[to]] = [columns[to], columns[from]];
      return columns;
    });
  }
  function replaceColumn(current: OptionalColumn, next: OptionalColumn) {
    saveColumns(columns => columns.includes(current)
      ? columns.map(column => column === current ? next : column === next ? current : column)
      : columns);
  }
  const [viEnabled, setViEnabled] = useState(true), [viMinutes, setViMinutes] = useState("30");
  const [notice, setNotice] = useState<string | { announcement: string }>("");
  const [loadingTicket, setLoadingTicket] = useState(false);
  const ticketRequest = useRef<AbortController>(undefined);
  useEffect(() => () => ticketRequest.current?.abort(), [active]);
  const [openQuote, setOpenQuote] = useState<string>();
  const pendingQuantity = useRef<{ leg: Leg; next: Leg }>(undefined);
  const quantityBar = useRef<HTMLDivElement>(null);
  const [loadingPosition, setLoadingPosition] = useState(false);
  const positionRequest = useRef<AbortController | null>(null);
  const latestInput = useRef(input);
  latestInput.current = input;
  useEffect(() => () => positionRequest.current?.abort(), [active, input.position?.capturedAt]);
  const [catalogCache, setCatalogCache] = useState<Catalog>();
  const selectionKey = `OptionsSimulatorMarketSelectionV1:${location.origin}`;
  useEffect(() => {
    let mounted = true;
    async function restoreSelection() {
      try {
        const saved = (await chrome.storage.local.get(selectionKey))[selectionKey];
        if (mounted && saved && typeof saved === "object" && "underlyingId" in saved && "expiration" in saved &&
          typeof saved.underlyingId === "string" && typeof saved.expiration === "string") {
          setUnderlying(saved.underlyingId);
          setExpiration(saved.expiration);
        }
      } catch { /* Use the catalog defaults when storage is unavailable. */ }
      if (mounted) setSelectionReady(true);
    }
    void restoreSelection();
    return () => { mounted = false; };
  }, [selectionKey]);
  const availableContracts = catalogCache?.contracts.filter(contract => contract.underlyingId === underlyingId && contract.expiration === expiration && marketKey(contract) === market) ?? [];
  const ids = useMemo(() => underlyingId ? [underlyingId, ...availableContracts.map(contract => contract.id)].sort() : [], [underlyingId, availableContracts.map(contract => contract.id).join("|")]);
  const reading = useOptionMarket(active && selectionReady, underlyingId, ids);
  const catalog = reading.catalog;
  useEffect(() => { if (catalog) setCatalogCache(catalog); }, [catalog]);
  const underlyings = catalog?.underlyings ?? [];
  const contracts = catalog?.contracts.filter(contract => contract.underlyingId === underlyingId) ?? [];
  const expirations = [...new Set(contracts.map(contract => contract.expiration))].sort();
  useEffect(() => {
    if (input.position || !selectionReady || !underlyings.length || underlyings.some(item => item.id === underlyingId)) return;
    setUnderlying((underlyings.find(item => item.symbol === "GGAL") ?? underlyings[0]).id);
    setExpiration("");
  }, [catalog, selectionReady, underlyingId, !!input.position]);
  useEffect(() => {
    const currentUnderlying = underlyings.find(item => item.id === underlyingId);
    if (input.position || !selectionReady || !currentUnderlying) return;
    const nextExpiration = expirations.includes(expiration) ? expiration : defaultExpiration(expirations);
    if (expiration !== nextExpiration) setExpiration(nextExpiration);
    const preferred = preferredOptionMarket(contracts.filter(contract => contract.expiration === nextExpiration), currentUnderlying.currency);
    if (market !== preferred) setMarket(preferred);
  }, [selectionReady, expiration, market, expirations.join(), catalog, underlyingId, !!input.position]);
  const selected = contracts.filter(contract => contract.expiration === expiration && marketKey(contract) === market);
  const editingPosition = positionMode && !!input.position;
  const openLeg = active && input.legs.find(leg => legKey(leg) === openQuote && selected.some(contract => contract.id === leg.securityId));
  const shownQuote = openLeg ? openQuote : undefined;
  useEffect(() => {
    if (!shownQuote) setOpenQuote(undefined);
  }, [shownQuote]);
  useLayoutEffect(() => {
    const bar = quantityBar.current, cell = bar?.parentElement, scroll = cell?.closest<HTMLElement>(".ct-opt-chain-scroll");
    if (!bar || !cell || !scroll) return;
    const position = () => {
      const bounds = scroll.getBoundingClientRect(), anchor = cell.getBoundingClientRect();
      const start = bounds.left + scroll.clientLeft, end = start + scroll.clientWidth;
      if (!scroll.clientWidth) return;
      bar.style.maxWidth = `${scroll.clientWidth}px`;
      const width = bar.offsetWidth;
      const preferred = cell.classList.contains("buy") ? anchor.right - width : anchor.left;
      bar.style.left = `${Math.max(start, Math.min(preferred, end - width)) - anchor.left}px`;
      const headerBottom = scroll.querySelector("thead")?.getBoundingClientRect().bottom ?? bounds.top;
      bar.style.visibility = anchor.bottom <= headerBottom || anchor.top >= bounds.bottom || anchor.right <= start || anchor.left >= end ? "hidden" : "";
    };
    position();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(position);
    observer?.observe(bar);
    observer?.observe(scroll);
    scroll.addEventListener("scroll", position, { passive: true });
    return () => { observer?.disconnect(); scroll.removeEventListener("scroll", position); };
  }, [shownQuote, visibleColumns, compactChain]);
  const data = reading.data?.underlyingId === underlyingId && reading.data.catalogRevision === catalog?.catalogRevision && ids.every(id => reading.data?.instruments[id]) ? reading.data : undefined;
  const strategyQuotes = reading.issue ? undefined : data?.instruments;
  const underlying = underlyings.find(item => item.id === underlyingId), spotQuote = data?.instruments[underlyingId];
  const underlyingCurrency = underlying?.currency;
  const marketVersion = catalog?.version;
  useEffect(() => {
    if (active && marketVersion) onMarketContext({ version: marketVersion,
      currency: underlyingCurrency === "ARS" || underlyingCurrency === "USD" ? underlyingCurrency : undefined });
  }, [active, underlyingCurrency, marketVersion, onMarketContext]);
  const spot = positive(spotQuote?.last) ? spotQuote.last : undefined;
  const changePercent = spotQuote?.changePercent;
  const spotChange = changePercent !== undefined && Number.isFinite(changePercent)
    ? <strong className={changePercent > 0 ? "ct-opt-up" : changePercent < 0 ? "ct-opt-down" : undefined}
        aria-label="Variación diaria del subyacente">{changePercent > 0 ? "+" : ""}{formatOptionVolatility(changePercent)} %</strong>
    : null;
  const positionLegs = input.position?.legs ?? [];
  const positionSeries: PositionSeries[] = editingPosition ? selected.filter(contract => contract.factor === numeric(input.multiplier)) : [];
  if (editingPosition) for (const leg of positionLegs) {
    if (leg.securityId && !positionSeries.some(series => series.id === leg.securityId))
      positionSeries.push({ id: leg.securityId, kind: leg.kind, strike: numeric(leg.strike), symbol: leg.symbol ?? leg.securityId });
  }
  const strikes = [...new Set([...selected, ...positionSeries].map(contract => contract.strike))].sort((a, b) => a - b);
  const unique = (kind: "call" | "put", strike: number) => {
    const matches = selected.filter(contract => contract.kind === kind && contract.strike === strike);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const comparable = !!underlying && selected.length > 0 && selected.every(contract => contract.strikeCurrency === underlying.currency);
  useEffect(() => {
    onStrikeMarket(active && comparable && underlying && data && !reading.issue ? {
      underlying: underlying.symbol, currency: underlying.currency, expiry: expiryDate(expiration), contracts: selected, quotes: data.instruments,
    } : undefined);
  }, [active, catalog, data, underlyingId, expiration, market, reading.issue, onStrikeMarket]);
  const itmSpot = comparable ? spot : undefined;
  const sameContext = comparable && input.underlying === underlying?.symbol && input.expiry === expiryDate(expiration) && input.currency === underlying?.currency;
  const deviations = sameContext ? deviationReference : undefined;
  const gridLevels = deviations && deviations.move > 0 && strikes.length > 1 && strikeRows.length === strikes.length && strikeRows.every((row, index) => row.strike === strikes[index])
    ? deviations.levels.flatMap(level => {
      const index = strikes.findIndex(strike => strike >= level.price);
      if (index < 0 || level.price < strikes[0]) return [];
      const upperIndex = Math.max(1, index);
      const low = strikeRows[upperIndex - 1], high = strikeRows[upperIndex];
      return [{ ...level, afterStrike: low.strike, y: (low.bottom + high.top) / 2 }];
    }) : [];
  const spotBoundary = itmSpot === undefined ? undefined : strikes.find((strike, index) => strike < itmSpot && strikes[index + 1] > itmSpot);
  const spotSharesSigma = gridLevels.some(level => level.afterStrike === spotBoundary);
  useEffect(() => {
    const container = grid.current;
    if (!active || !container) return;
    const position = () => {
      const base = container.getBoundingClientRect().top;
      const rows = [...container.querySelectorAll<HTMLTableRowElement>("tr[data-option-strike]")];
      setStrikeRows(rows.flatMap(row => {
        const rect = row.getBoundingClientRect();
        return rect.height > 0 ? [{ strike: Number(row.dataset.optionStrike), top: rect.top - base, bottom: rect.bottom - base }] : [];
      }));
    };
    position();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(position);
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, editingPosition, visibleColumns, strikes.join("|")]);
  const automaticRate = automaticCaucion && underlying?.currency === "ARS";
  const rateSource = automaticRate ? caucion ? caucionReferenceLabel(caucion) : "Caución sin dato reciente" : "Tasa manual de Análisis";
  const metrics = deriveOptionMetrics(selected, data?.instruments, { now: Date.now(), minutes: viMinutes, enabled: viEnabled, available: !!data && !reading.issue,
    spot, currency: underlyingCurrency, rate: automaticRate ? caucion?.annualRate : numeric(underlyingCurrency === "USD" ? usdRate : input.rate) / 100, rateSource,
    dividendYield: numeric(input.dividendYield) / 100 });
  function change(field: "underlying" | "expiration", value: string) {
    const nextUnderlying = field === "underlying" ? value : underlyingId;
    const nextExpiration = field === "expiration" ? value : defaultExpiration((catalog?.contracts ?? [])
      .filter(contract => contract.underlyingId === nextUnderlying).map(contract => contract.expiration).sort());
    setUnderlying(nextUnderlying);
    setExpiration(nextExpiration);
    setMarket("");
    setOpenQuote(undefined);
    setNotice(""); setInput(current => ({ ...current, legs: [] }));
    if (nextUnderlying) void saveSelection(nextUnderlying, nextExpiration);
  }
  async function saveSelection(underlyingId: string, expiration: string) {
    try { await chrome.storage.local.set({ [selectionKey]: { underlyingId, expiration } }); }
    catch { /* The current selection still works without local storage. */ }
  }
  const canLoadPosition = comparable && selected.length <= 160;
  const positionQuotesReady = !!data && selected.every(contract => !!data.instruments[contract.id]);
  const canOpenPosition = canLoadPosition && (positionQuotesReady || !!reading.issue);
  async function loadPosition(draft = input) {
    if (!underlying || !canLoadPosition || positionRequest.current) return;
    const request = new AbortController();
    positionRequest.current = request;
    setLoadingPosition(true); setNotice("");
    try {
      const { snapshot, saved, savedUnderlying, costStorageUnavailable } = await readPositionSnapshot(selected, request.signal);
      if (request.signal.aborted) return;
      const current = latestInput.current;
      const base = current.position ? current : draft;
      const next = importPosition(snapshot, selected, data?.instruments, base, underlying.symbol, spot, saved, savedUnderlying, costStorageUnavailable);
      const hasPosition = !!(next.position?.legs.length || next.position?.underlying?.quantity);
      const underlyingUnavailable = next.position?.underlyingUnavailable;
      setNotice(hasPosition || underlyingUnavailable ? { announcement: "Reporte recibido. Revisá la posición actual en la grilla." }
        : "No hay posición abierta en esta cadena. Podés ingresar una posición manual.");
      onNewStrategy();
      setOpenQuote(undefined);
      setInput(next);
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "No se pudo cargar la posición.");
    } finally {
      if (positionRequest.current === request) {
        positionRequest.current = null;
        setLoadingPosition(false);
        if (request.signal.aborted) setNotice("Se interrumpió la consulta de posición. Usá Recargar tenencia para volver a consultar.");
      }
    }
  }
  function openPosition() {
    if (loadingPosition || editingPosition) return;
    if (input.position) { setPositionMode(true); setOpenQuote(undefined); setNotice(""); return; }
    if (!underlying || !canOpenPosition) return;
    try {
      const draft = startPositionDraft(input, selected, underlying.symbol, spot);
      setInput(draft);
      setPositionMode(true);
      setOpenQuote(undefined);
      void loadPosition(draft);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo abrir la carga de posición.");
    }
  }
  function clearPosition() {
    setInput(current => current.position ? { ...current, position: { legs: [],
      underlying: current.position.underlying && { quantity: 0, averageCost: "" } }, costs: "0", realized: undefined } : current);
    setNotice({ announcement: "Se limpió la posición del borrador. Podés recargar la tenencia. Los ajustes siguen en Armado." });
  }
  function commitPositionQuantity(series: PositionSeries, value: string) {
    const quantity = parseSignedQuantity(value);
    if (quantity === undefined) {
      setNotice("Ingresá una cantidad entera válida, positiva para compra y negativa para venta."); return;
    }
    if (quantity && positionLegs.length >= MAX_LEGS && !positionLegs.some(leg => leg.securityId === series.id)) {
      setNotice(`La posición admite hasta ${MAX_LEGS} patas.`); return;
    }
    setNotice("");
    setInput(current => {
      if (!current.position) return current;
      const legs = setPositionQuantity(current.position.legs, series, quantity, data?.instruments[series.id]);
      return legs === current.position.legs ? current : { ...current, position: { ...current.position, legs } };
    });
  }
  function selectQuote(contract: Contract, side: "buy" | "sell", quote: Quote, premium: number | undefined) {
    const existing = input.legs.find(leg => leg.securityId === contract.id);
    if (existing?.side === side) {
      setInput(current => ({ ...current, legs: current.legs.filter(leg => leg.securityId !== contract.id) }));
      setOpenQuote(undefined);
      return;
    }
    if (!existing && input.legs.length >= MAX_LEGS) { setNotice(`Máximo ${MAX_LEGS} patas.`); return; }
    if (!underlying || !comparable || contract.currency !== underlying.currency || !positive(contract.factor)) {
      setNotice("No se puede simular este contrato: faltan factores o hay monedas de prima, ejercicio y subyacente diferentes."); return;
    }
    const expiry = expiryDate(contract.expiration);
    const allLegs = simulationLegs(input);
    const mismatched = (input.position || allLegs.length) && (input.underlying !== underlying.symbol || input.expiry !== expiry || input.currency !== contract.currency || Number(input.multiplier) !== contract.factor || allLegs.some(leg => !leg.securityId || !selected.some(item => item.id === leg.securityId)));
    if (mismatched) { setNotice("Limpiá las patas antes de cambiar el contexto de la simulación o combinar con datos manuales."); return; }
    const leg: Leg = { ...newLeg(existing?.id ?? Math.max(0, ...input.legs.map(item => item.id)) + 1), securityId: contract.id, symbol: contract.symbol,
      kind: contract.kind, side, strike: String(contract.strike), premium: premium === undefined ? "" : formatOptionInput(premium),
      contracts: existing?.contracts ?? "1", volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    const today = localDate();
    if (!allLegs.length && !input.position) onNewStrategy();
    setInput(current => ({ ...current, underlying: underlying.symbol, currency: contract.currency, expiry, multiplier: String(contract.factor),
      ...(!allLegs.length && !current.position ? { spot: spot === undefined ? "" : String(spot), marketSpotMissing: spot === undefined, valuationDate: today, scenarioDate: today } : {}),
      legs: existing ? current.legs.map(item => item.securityId === contract.id ? leg : item) : [...current.legs, leg] }));
    setOpenQuote(legKey(leg));
    setNotice("");
  }
  function changeQuoteQuantity(leg: Leg, preset: number) {
    // Several clicks can be queued before React commits the new leg.
    const pending = pendingQuantity.current?.leg === leg ? pendingQuantity.current : undefined;
    const before = pending?.next ?? leg;
    if (numeric(before.contracts) === preset) return;
    const next = { ...before, contracts: String(preset) };
    pendingQuantity.current = { leg, next };
    setInput(current => current.legs.includes(before)
      ? { ...current, legs: current.legs.map(item => item === before ? next : item) }
      : current);
  }
  async function loadTicket(contract: Contract, side: "buy" | "sell", price: number, quantity: number) {
    if (ticketRequest.current) return;
    const request = new AbortController();
    ticketRequest.current = request;
    setLoadingTicket(true);
    setNotice("");
    try {
      await preloadOptionTicket(contract.symbol, price, quantity, request.signal);
      const action = side === "buy" ? "Comprar" : "Vender";
      setNotice(`${contract.symbol} · ${fmt(quantity)} a ${fmt(price)}. Revisá el Mini Order Form y elegí ${action}.`);
    } catch (error) {
      if (!request.signal.aborted) {
        const reason = error instanceof Error ? error.message : "La carga quedó incompleta.";
        setNotice(`${reason} Revisá los datos del Mini Order Form.`);
      }
    } finally {
      ticketRequest.current = undefined;
      setLoadingTicket(false);
    }
  }
  function chooseStrategy(choice: StrategyChoice): boolean {
    const recipe = strategyRecipe(choice, selected, spot), prices = recipeDraftPrices(recipe, strategyQuotes, underlying?.currency);
    if (!recipe.ok || !prices.ok || !strategyQuotes || !underlying || !positive(spot)) {
      setNotice(!recipe.ok ? recipe.reason : !prices.ok ? prices.reason : "Esperando una lectura completa de mercado."); return false;
    }
    const factor = recipe.legs[0].contract.factor!;
    if (input.position && (factor !== numeric(input.multiplier) || input.underlying !== underlying.symbol ||
      input.expiry !== expiryDate(expiration) || input.currency !== recipe.legs[0].contract.currency)) {
      setNotice("Los ajustes deben usar el mismo subyacente, vencimiento, moneda y factor que la posición cargada."); return false;
    }
    const legs = recipe.legs.map((item, index): Leg => {
      const contract = item.contract, quote = strategyQuotes[contract.id], premium = prices.premiums[index].value;
      return { ...newLeg(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side: item.side,
        strike: String(contract.strike), premium: premium === undefined ? "" : formatOptionInput(premium), contracts: String(item.ratio),
        volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    });
    const today = localDate();
    onNewStrategy();
    setOpenQuote(undefined);
    setInput(current => ({ ...current, underlying: underlying.symbol, expiry: expiryDate(expiration), currency: recipe.legs[0].contract.currency,
      multiplier: String(factor), ...(!current.position ? { spot: String(spot), marketSpotMissing: false, valuationDate: today, scenarioDate: today } : {}), legs }));
    setNotice("");
    return true;
  }
  const positionCell = (kind: "call" | "put", strike: number, field: "quantity" | "premium") => {
    const entries = positionSeries.filter(series => series.kind === kind && series.strike === strike);
    const held = entries.some(series => positionLegs.some(leg => leg.securityId === series.id));
    const otm = itmSpot !== undefined && (kind === "call" ? strike > itmSpot : strike < itmSpot);
    return <td className={held ? "ct-opt-position-held" : otm ? "ct-opt-position-otm" : undefined}>
      {entries.length ? entries.map(series => {
        const leg = positionLegs.find(item => item.securityId === series.id);
        const label = entries.length > 1 ? series.symbol : `${kind.toUpperCase()} ${fmt(strike)}`;
        return <div key={series.id} className="ct-opt-position-field">
          {entries.length > 1 && <small>{series.symbol}</small>}
          <div>{field === "quantity" ? <SignedQuantityInput label={`Cantidad posición ${label}`} disabled={loadingPosition}
            value={leg ? (leg.side === "sell" ? "−" : "+") + leg.contracts : ""} className={leg && (leg.side === "sell" ? "ct-sim-sell" : "ct-sim-buy")}
            onCommit={value => commitPositionQuantity(series, value)} />
            : <PositionPremium label={label} leg={leg} disabled={loadingPosition}
              onChange={onPremiumChange} onReview={onPremiumReview} />}</div>
        </div>;
      }) : "—"}
    </td>;
  };
  const quoteCell = (contract: Contract | undefined, side: "buy" | "sell") => {
    const quote = contract && data?.instruments[contract.id], level = quote?.[side === "buy" ? "ask" : "bid"];
    const price = quotePrice(quote, side);
    const marked = contract && input.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const held = contract && input.position?.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const selectable = !!quote && !reading.issue && (price.ok || price.kind === "missing");
    const last = lastTradedPremium(quote);
    const fallback = last === undefined ? "Ingresá el precio en Armado." : `Usar último precio operado ($ ${fmt(last)}) como referencia.`;
    const title = price.ok ? contract?.symbol : `${contract?.symbol ?? "Contrato"}: ${price.reason}${selectable ? ` ${fallback}` : ""}`;
    const moneyness = contract && itmSpot !== undefined && contract.strike !== itmSpot ? (contract.kind === "call" ? contract.strike < itmSpot : contract.strike > itmSpot) ? "itm" : "otm" : undefined;
    const key = marked && legKey(marked);
    const visible = key !== undefined && key === shownQuote;
    const quantity = marked ? numeric(marked.contracts) : NaN;
    // Matriz lists these option symbols without a settlement suffix.
    const supportedTicket = contract?.currency === "ARS" && contract.settlement === "2";
    const ambiguousTicket = contract && catalog?.contracts.some(item =>
      item.symbol === contract.symbol && item.id !== contract.id);
    const ticketLabel = `Cargar ${side === "buy" ? "compra" : "venta"} de ${contract?.symbol} en el Mini Order Form`;
    return <td className={`ct-opt-price ${side} ${side === "sell" ? "ct-opt-bid" : "ct-opt-ask"}${marked ? " selected" : ""}${moneyness ? ` ct-opt-${moneyness}` : ""}`}
      onMouseEnter={() => { if (key) setOpenQuote(key); }}
      onMouseLeave={() => {
        if (!quantityBar.current?.contains(document.activeElement)) setOpenQuote(current => current === key ? undefined : current);
      }}
      onFocus={() => { if (key) setOpenQuote(key); }}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) {
          setOpenQuote(current => current === key ? undefined : current);
        }
      }}>
      <button type="button" disabled={!selectable} aria-label={`${side === "buy" ? "Comprar" : "Vender"} ${contract?.symbol ?? "contrato no disponible"} en simulación`}
        aria-pressed={!!marked} title={title} onClick={() => {
          if (selectable && contract && quote) selectQuote(contract, side, quote, price.ok ? price.price : last);
        }}>
        <span className="ct-opt-marker">{marked ? `${side === "buy" ? "Compra" : "Venta"} · ${marked.contracts}` : held ? `Pos. ${held.side === "buy" ? "+" : "−"}${held.contracts}` : ""}</span>
        <Fragment key={contract?.id}>
          <OptionQuoteValue quantity value={selectable && price.ok ? level?.size : undefined} />
          <OptionQuoteValue value={selectable && price.ok ? price.price : undefined} />
        </Fragment>
      </button>
      {visible && marked && <div ref={quantityBar} className="ct-opt-quantity-bar" role="group" aria-label={`Cantidad de ${side === "buy" ? "compra" : "venta"} ${marked.symbol}`}>
        <span>Cant.</span>
        {quantityPresets.map(preset => <button key={preset} type="button" aria-label={`Fijar ${preset} ${preset === 1 ? "contrato" : "contratos"}`}
          onMouseDown={event => event.preventDefault()} onClick={event => {
            const editor = event.currentTarget.closest(".ct-sim")?.querySelector<HTMLElement>("[data-ct-inline-editor]:focus");
            editor?.blur();
            changeQuoteQuantity(marked, preset);
          }}>{preset}</button>)}
        <span className="ct-opt-quantity-total">Total <output aria-label="Cantidad total">{fmt(quantity)}</output></span>
        <button type="button" className="ct-opt-load-ticket" aria-label={ticketLabel}
          title={!supportedTicket ? "Carga disponible para opciones en pesos a 24 h"
            : ambiguousTicket ? "Más de un contrato comparte este símbolo"
            : !price.ok ? price.reason : ticketLabel}
          disabled={!selectable || !price.ok || !supportedTicket || ambiguousTicket ||
            !Number.isSafeInteger(quantity) || quantity <= 0 || loadingTicket}
          onClick={() => { if (contract && price.ok) void loadTicket(contract, side, price.price, quantity); }}>
          <ToolbarIcon name="loadTicket" />
        </button>
      </div>}
    </td>;
  };
  const chainCells = (columns: ChainColumn[], contract: Contract | undefined, kind: "call" | "put") =>
    columns.map(column => column === "bid" || column === "ask"
      ? <Fragment key={column}>{quoteCell(contract, column === "bid" ? "sell" : "buy")}</Fragment>
      : <OptionMetricCell key={column} contract={contract} field={column} cell={contract ? metrics.byId[contract.id] : undefined} scale={metrics.scales[kind]} />);
  const columnWidths = (columns: ChainColumn[]) => columns.map(column => <col key={column} style={{ width: columnWidth(column, compactChain) }} />);
  const columnHeadings = (columns: ChainColumn[], side: "Calls" | "Puts") => columns.map((column, index) => {
    const { heading, compactHeading, title, className } = chainColumns[column];
    if (column === "bid" || column === "ask" || column === "iv") {
      return <th key={column} scope="col" title={title} className={className}>{heading}</th>;
    }
    return <th key={`optional-${index}`} scope="col" className="ct-opt-configurable-heading">
      <select data-ct-inline-editor aria-label={`Cambiar columna ${columnLabel(column)} de ${side}`} disabled={!savedColumns} value={column}
        title={title ? `${title} · Elegir columna` : `${columnLabel(column)} · Elegir columna`}
        onChange={event => replaceColumn(column, event.target.value as OptionalColumn)}>
        {optionalColumns.map(item => <option key={item} value={item}>
          {item === column ? (compactChain && compactHeading ? compactHeading : heading)
            : columnLabel(item) + (visibleColumns.includes(item) ? " (intercambiar)" : "")}
        </option>)}
      </select>
    </th>;
  });
  const money = (value: number | undefined) => value === undefined ? "—" : `${fmt(value)} ${underlying?.currency ?? ""}`;
  const viLegend = (kind: "call" | "put") => {
    const scale = metrics.scales[kind];
    const formatRange = (format: (value: number) => string) => scale.min === undefined || scale.max === undefined ? "—"
      : scale.min === scale.max ? `${format(scale.min)} %` : `${format(scale.min)}–${format(scale.max)} %`;
    const fullRange = formatRange(formatOptionVolatility);
    const range = compactChain ? formatRange(value => fmt(value, 1)) : fullRange;
    return <span className="ct-sim-vi-scale" title={`${fullRange} · ${scale.included}/${scale.total} VI ${viEnabled ? `de operaciones de los últimos ${viMinutes} min` : "con dato"}. Gris: fuera de la escala.`}>
      <i aria-hidden="true" /><strong>{range}</strong></span>;
  };
  const sigmaKey = deviations && deviations.move > 0 && <span className="ct-opt-sigma-key" title={`Desvíos de la simulación · VI ${formatOptionVolatility(deviations.volatility * 100)} % · ${daysToExpiry(input.expiry, input.scenarioDate)} días restantes. Solo se dibujan los niveles dentro de los strikes de la cadena.`}>
    <i className="ct-opt-sigma-1">±1σ</i> <i className="ct-opt-sigma-2">±2σ</i></span>;
  const spotOutsideGrid = spot !== undefined && (itmSpot === undefined || spot < (strikes[0] ?? Infinity) || spot > (strikes.at(-1) ?? -Infinity));
  const chainConfigContents = <>
      <strong>Filtro de VI</strong>
      <div className="ct-opt-metrics-filter" role="group" aria-label="Filtro temporal de VI">
        <div className="ct-opt-metrics-quick-filter">
          <label><input type="checkbox" checked={viEnabled} onChange={event => setViEnabled(event.target.checked)} />Filtrar VI por última operación</label>
          <div className="ct-opt-metrics-presets">{[15, 30, 60].map(value => <button type="button" key={value} className={viMinutes === String(value) ? "on" : ""} disabled={!viEnabled} onClick={() => setViMinutes(String(value))}>{value} min</button>)}</div>
        </div>
        <label>Últimos<input aria-label="Antigüedad máxima de la operación en minutos" type="number" min="1" step="1" disabled={!viEnabled} value={viMinutes} onChange={event => setViMinutes(event.target.value)} />min</label>
      </div>
      {viEnabled && !metrics.windowValid && <div className="ct-opt-metrics-note" role="status">Ingresá minutos enteros mayores que cero.</div>}
      <div className="ct-opt-config-columns" role="group" aria-label="Columnas de cotizaciones">
        <strong>Columnas de cotizaciones</strong>
        <ol className="ct-opt-column-options">
          {[...visibleColumns, ...hiddenColumns].map((column, index) => {
            const shown = index < visibleColumns.length;
            return <li key={column}>
              <label title={chainColumns[column].title}>
                <input type="checkbox" checked={shown} onChange={event => {
                  const checked = event.target.checked;
                  saveColumns(columns => checked
                    ? columns.includes(column) ? columns : [...columns, column]
                    : columns.filter(item => item !== column));
                }} />
                {columnLabel(column)}
              </label>
              {shown && <>
                <button type="button" disabled={index === 0} aria-label={`Mover ${columnLabel(column)} hacia el borde`}
                  title="Mover hacia el borde" onClick={() => moveColumn(column, -1)}>↑</button>
                <button type="button" disabled={index === visibleColumns.length - 1} aria-label={`Mover ${columnLabel(column)} hacia el centro`}
                  title="Mover hacia el centro" onClick={() => moveColumn(column, 1)}>↓</button>
              </>}
            </li>;
          })}
        </ol>
      </div>
      <button type="button" onClick={resetColumns}>Restablecer columnas</button>
      <button type="button" popoverTarget={nativePopover ? chainConfigId : undefined} popoverTargetAction={nativePopover ? "hide" : undefined}
        onClick={nativePopover ? undefined : () => configDialog.current?.close()}>Listo</button>
  </>;
  const configAttributes = { id: chainConfigId, "aria-label": "Configuración de la cadena", className: "ct-opt-chain-config", "data-ct-inline-editor": true };
  const chainConfig = <>
    <button type="button" className="ct-opt-config-trigger" popoverTarget={nativePopover ? chainConfigId : undefined} disabled={!savedColumns}
      aria-controls={chainConfigId} aria-haspopup={nativePopover ? undefined : "dialog"} onClick={nativePopover ? undefined : () => configDialog.current?.showModal()}
      aria-label="Configurar cadena de opciones" title="Configurar columnas y filtro de VI"><span aria-hidden="true">⚙</span> Config.</button>
    {nativePopover
      ? <div {...configAttributes} popover="auto" role="group">{chainConfigContents}</div>
      : <dialog {...configAttributes} ref={configDialog}>{chainConfigContents}</dialog>}
  </>;
  return <section className="ct-sim-card ct-options ct-sim-market">{toolbar && active && createPortal(<div className="ct-sim-market-toolbar" role="group" aria-label="Mercado de opciones">
    <label>Subyacente<select aria-label="Subyacente de opciones" disabled={!!input.position || loadingPosition} value={underlyingId} onChange={event => change("underlying", event.target.value)}><option value="">Seleccionar</option>{underlyings.map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}</select></label>
    <label>Vencimiento<select aria-label="Vencimiento de opciones" disabled={!!input.position || loadingPosition} value={expiration} onChange={event => change("expiration", event.target.value)}><option value="">Seleccionar</option>{expirations.map(value => <option key={value} value={value} title={expiryDate(value)}>{formatOptionExpiry(expiryDate(value), "short")}</option>)}</select>
      <span className="ct-sim-expiry-days" aria-label="Días al vencimiento de la cadena" title={`Días calendario desde hoy · Vencimiento ${expiryDate(expiration)}`}>{formatExpiryDays(daysToExpiry(expiryDate(expiration)))}</span></label>
    <div className="ct-sim-strategy-slot" inert={editingPosition}>
      <StrategyPicker active={!editingPosition} contracts={selected} quotes={strategyQuotes} spot={spot} currency={underlying?.currency}
        costs={numeric(input.position ? input.adjustmentCosts ?? "0" : input.costs)}
        context={`${underlying?.symbol ?? "Sin selección"} · ${formatOptionExpiry(expiryDate(expiration), "short")}${input.position ? " · Ajustes" : ""}`} onApply={chooseStrategy} />
    </div>
    <div className="ct-sim-position-tabs" role="group" aria-label="Modo de la cadena">
      <button type="button" className="ct-tool-icon-button" aria-pressed={!editingPosition} disabled={loadingPosition} onClick={() => { setPositionMode(false); setNotice(""); }}>
        <ToolbarIcon name="quotes" />Cotizaciones
      </button>
      <button type="button" className="ct-tool-icon-button" aria-pressed={editingPosition}
        disabled={loadingPosition || (!input.position && !canOpenPosition)} onClick={openPosition}
        title={!input.position && canLoadPosition && !canOpenPosition ? "Esperando las cotizaciones de la cadena." : undefined}>
        <ToolbarIcon name="position" />Posición actual
      </button>
    </div>
    <span className="ct-sim-chain-counts">
      <span>{strikes.length} ejercicios</span>
      {!!catalog?.excluded && <span title="Contratos del catálogo con metadatos incompletos, excluidos de la cadena">⚠ {catalog.excluded} incompletos</span>}
    </span>
    {spotOutsideGrid && <span className="ct-sim-spot-outside">{money(spot)} {spotChange}</span>}
  </div>, toolbar)}
    {reading.issue && <p role="status" className="ct-sim-error ct-sim-chain-notice">{reading.issue}</p>}
    {editingPosition && <fieldset className="ct-sim-position-toolbar" aria-label="Controles de posición" disabled={loadingPosition}>
      {positionAccounting}
      <button type="button" className="ct-tool-icon-button" onClick={clearPosition} title="Vacía la posición y sus costos del borrador. Conserva los ajustes.">
        <ToolbarIcon name="clear" />Limpiar posición
      </button>
      <button type="button" className="ct-tool-icon-button" disabled={!canLoadPosition} onClick={() => void loadPosition()}>
        <ToolbarIcon name="refresh" />{loadingPosition ? "Cargando posición…" : "Recargar tenencia"}
      </button>
    </fieldset>}
    {notice && (typeof notice === "string" ? <p role="status" className="ct-sim-chain-notice">{notice}</p>
      : <span role="status" className="ct-sim-sr">{notice.announcement}</span>)}
    <div ref={chainScroll} className="ct-table-scroll ct-opt-chain-scroll" role="region" aria-label="Cadena de opciones" aria-busy={loadingPosition} tabIndex={0}>
      <div ref={grid} className={`ct-opt-chain-grid${editingPosition ? " ct-opt-position-grid" : ""}`}><table
        className={editingPosition ? "ct-opt-chain ct-opt-position-chain" : `ct-opt-chain ct-opt-metrics-chain${compactChain ? " ct-opt-compact-chain" : ""}`}
        style={editingPosition ? undefined : marketTableStyle}>
        {editingPosition ? <><colgroup><col /><col /><col className="strike" /><col /><col /></colgroup>
          <thead><tr><th scope="col" title="Cantidad de Calls · + compra, − venta">CALLS · Cant.</th><th scope="col" title="Prima histórica por unidad de Calls">Prima histórica</th>
            <th className="ct-opt-strike" scope="col">Strike</th><th scope="col" title="Cantidad de Puts · + compra, − venta">PUTS · Cant.</th><th scope="col" title="Prima histórica por unidad de Puts">Prima histórica</th></tr></thead>
        </> : <>
        <colgroup>{columnWidths(callColumns)}<col className="strike" />{columnWidths(putColumns)}</colgroup>
        <thead><tr className="ct-sim-chain-legend" aria-label="Resumen de mercado y escala de VI">
          <th colSpan={columnsPerSide} className="ct-opt-calls-heading">CALLS</th>
          <th className="ct-opt-vi-heading">{viLegend("call")}</th>
          <th className="ct-opt-strike">{active && chainConfig}</th>
          <th className="ct-opt-vi-heading">{viLegend("put")}</th>
          <th colSpan={columnsPerSide}><div className="ct-sim-chain-group">PUTS {sigmaKey}</div></th>
        </tr><tr>{columnHeadings(callColumns, "Calls")}<th scope="col" className="ct-opt-strike">Strike</th>{columnHeadings(putColumns, "Puts")}</tr></thead></>}
        <tbody>{strikes.map(strike => {
          const call = editingPosition ? undefined : unique("call", strike), put = editingPosition ? undefined : unique("put", strike);
          return <Fragment key={strike}><tr data-option-strike={strike} className={itmSpot === strike ? "ct-opt-atm" : ""}>
            {editingPosition ? <>{positionCell("call", strike, "quantity")}{positionCell("call", strike, "premium")}</>
              : chainCells(callColumns, call, "call")}
            <th scope="row" className="ct-opt-strike">{fmt(strike)}{itmSpot === strike && <span className="ct-opt-atm-label">ATM {spotChange}</span>}</th>
            {editingPosition ? <>{positionCell("put", strike, "quantity")}{positionCell("put", strike, "premium")}</>
              : chainCells(putColumns, put, "put")}
          </tr>{itmSpot !== undefined && strike === spotBoundary && <tr className="ct-opt-itm-boundary"><td colSpan={editingPosition ? 5 : 2 * callColumns.length + 1}><div className="ct-opt-itm-line" aria-label={`Límite ITM, subyacente ${fmt(itmSpot)}`}><span className="ct-opt-itm-call">↑ ITM</span>{!spotSharesSigma && <span className="ct-opt-itm-spot">$ {fmt(itmSpot)} {spotChange}</span>}<span className="ct-opt-itm-put">↓ ITM</span></div></td></tr>}</Fragment>;
        })}</tbody>
      </table><div className="ct-opt-sigma-overlay" role="group" aria-label="Desvíos estándar en la cadena">{gridLevels.map(level =>
        <div key={level.sigma} className={`ct-opt-sigma-line ct-opt-sigma-${Math.abs(level.sigma)}`} style={{ top: level.y }}
          aria-label={`${level.sigma > 0 ? "+" : ""}${level.sigma}σ en cadena: ${formatOptionAmount(level.price, input.currency)} ${input.currency}`}>
          {gridLevels.find(item => item.y === level.y) === level && <strong className="ct-opt-sigma-center">
            {level.afterStrike === spotBoundary && itmSpot !== undefined && <span className="ct-opt-sigma-spot">$ {fmt(itmSpot)} {spotChange}</span>}
            {gridLevels.filter(item => item.y === level.y).map(item => <span key={item.sigma} className={`ct-opt-sigma-${Math.abs(item.sigma)}`}>
              {item.sigma > 0 ? "+" : ""}{item.sigma}σ · {formatOptionAmount(item.price, input.currency)}
            </span>)}
          </strong>}
        </div>)}</div></div>{!strikes.length && <p role="status" className="ct-opt-empty">
          {!catalog && !reading.issue ? "Leyendo catálogo de opciones de Matriz…" : "Sin contratos completos para esta selección."}
        </p>}
    </div>
  </section>;
}
