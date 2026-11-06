import { Dispatch, Fragment, SetStateAction, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Catalog, Contract, Quote, useOptionMarket } from "./market";
import { deriveOptionMetrics } from "./marketMetrics";
import { OptionMetricCell } from "./OptionsMetrics";
import { OptionQuoteValue } from "./OptionQuoteValue";
import { formatExpiryDays, formatOptionAmount, formatOptionExpiry, formatOptionNumber as fmt, formatOptionVolatility } from "./format";
import { daysToExpiry, Leg, localDate, MAX_CONTRACTS, MAX_LEGS, newLeg, numeric, simulationLegs, Simulation, type standardDeviationLevels } from "./model";
import { importPosition, readPositionSnapshot, setPositionQuantity, startPositionDraft, type PositionSeries } from "./positions";
import { premiumNeedsReview, signedPositionQuantity, validHistoricalPremium } from "./positionStorage";
import "./MarketChain.css";
import StrategyPicker from "./StrategyPicker";
import { preferredOptionMarket, quotePrice, recipePrices, strategyRecipe, type StrategyChoice } from "./strategyTemplates";
import type { StrikeMarket } from "./strategyAdjustments";

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const marketKey = (contract: Contract) => `${contract.currency}|${contract.settlement}`;
const expiryDate = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
const quantityPresets = [1, 10, 25, 50, 100];
const legKey = (leg: Leg) => `${leg.id}:${leg.securityId}:${leg.side}`;
function defaultExpiration(dates: string[]) {
  const today = localDate().replaceAll("-", "");
  return dates.find(date => date >= today) ?? dates[0] ?? "";
}

function PositionQuantity({ label, leg, disabled, onCommit }: {
  label: string; leg?: Leg; disabled: boolean; onCommit(value: string): void;
}) {
  const [draft, setDraft] = useState<string>();
  const value = leg ? (leg.side === "sell" ? "−" : "+") + leg.contracts : "";
  return <input type="text" data-ct-inline-editor className={leg ? leg.side === "sell" ? "ct-sim-sell" : "ct-sim-buy" : undefined}
    aria-label={`Cantidad posición ${label}`} placeholder="—" disabled={disabled} value={draft ?? value}
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
  const pending = !!leg && premiumNeedsReview(leg);
  return <>
    <input type="number" min="0" max="1000000000" step="any" aria-label={`Prima histórica ${label}`} readOnly={!leg} disabled={disabled}
      value={leg?.premium ?? ""} placeholder={leg ? "Completar" : "—"} aria-describedby={pending ? warningId : undefined}
      onChange={event => { if (leg) onChange(leg.id, event.target.value); }} />
    {leg && pending && <div className="ct-sim-premium-warning" id={warningId} role="alert">
      {numeric(leg.premiumQuantity ?? "") !== numeric(signedPositionQuantity(leg))
        ? `Cambió la cantidad de ${leg.premiumQuantity} a ${signedPositionQuantity(leg)}.` : "La cantidad cambió desde la última revisión."} Revisá la prima histórica.
      {validHistoricalPremium(leg.premium) && <button type="button" disabled={disabled} aria-label={`Confirmar prima histórica ${label}`}
        onClick={() => onReview(leg.id)}>Prima revisada</button>}
    </div>}
  </>;
}

export default function MarketChain({ active, toolbar, input, setInput, onStrikeMarket, onNewStrategy, deviationReference,
  positionMode, setPositionMode, positionAccounting, onPremiumChange, onPremiumReview }: {
  active: boolean; toolbar: HTMLDivElement | null; input: Simulation; setInput: Dispatch<SetStateAction<Simulation>>;
  onStrikeMarket(market: StrikeMarket | undefined): void;
  onNewStrategy(): void;
  deviationReference: ReturnType<typeof standardDeviationLevels>;
  positionMode: boolean; setPositionMode(value: boolean): void; positionAccounting?: ReactNode;
  onPremiumChange(id: number, value: string): void; onPremiumReview(id: number): void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [strikeRows, setStrikeRows] = useState<{ strike: number; top: number; bottom: number }[]>([]);
  const [underlyingId, setUnderlying] = useState("");
  const [expiration, setExpiration] = useState("");
  const [market, setMarket] = useState("");
  const [selectionReady, setSelectionReady] = useState(false);
  const [viEnabled, setViEnabled] = useState(true), [viMinutes, setViMinutes] = useState("30");
  const [notice, setNotice] = useState("");
  const [openQuote, setOpenQuote] = useState<string>();
  const pendingQuantity = useRef<{ leg: Leg; next: Leg }>(undefined);
  const quantityBar = useRef<HTMLDivElement>(null);
  const [loadingPosition, setLoadingPosition] = useState(false);
  const positionRequest = useRef<AbortController | null>(null);
  const initialPositionAttempted = useRef(false);
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
  }, [shownQuote]);
  const data = reading.data?.underlyingId === underlyingId && reading.data.catalogRevision === catalog?.catalogRevision && ids.every(id => reading.data?.instruments[id]) ? reading.data : undefined;
  const underlying = underlyings.find(item => item.id === underlyingId), spotQuote = data?.instruments[underlyingId];
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
  const deviations = sameContext && !editingPosition ? deviationReference : undefined;
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
    if (!active || editingPosition || !container) return;
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
  }, [active, editingPosition, strikes.join("|")]);
  const metrics = deriveOptionMetrics(selected, data?.instruments, { now: Date.now(), minutes: viMinutes, enabled: viEnabled, available: !!data && !reading.issue,
    spot, currency: underlying?.currency, rate: numeric(input.rate) / 100, dividendYield: numeric(input.dividendYield) / 100 });
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
  async function loadPosition(draft = input, automatic = false) {
    if (!underlying || positionRequest.current) return;
    const request = new AbortController();
    positionRequest.current = request;
    initialPositionAttempted.current = true;
    setLoadingPosition(true); setNotice("");
    try {
      const { snapshot, saved } = await readPositionSnapshot(selected, request.signal);
      if (request.signal.aborted) return;
      const current = latestInput.current;
      if (automatic && current.position) return;
      const base = automatic ? startPositionDraft(current, selected, underlying.symbol, spot) : current.position ? current : draft;
      const next = importPosition(snapshot, selected, data?.instruments, base, underlying.symbol, spot, saved);
      const hasPosition = !!next.position?.legs.length;
      setNotice(hasPosition ? "Tenencia cargada. Revisá las primas históricas en la grilla."
        : "No hay posición abierta en esta cadena. Podés ingresar una posición manual.");
      if (automatic && !hasPosition) return;
      if (automatic) setPositionMode(true);
      onNewStrategy();
      setOpenQuote(undefined);
      setInput(next);
    } catch (error) {
      if (!request.signal.aborted) setNotice(error instanceof Error ? error.message : "No se pudo cargar la posición.");
    } finally {
      if (positionRequest.current === request) {
        positionRequest.current = null;
        if (automatic && request.signal.aborted) initialPositionAttempted.current = false;
        setLoadingPosition(false);
      }
    }
  }
  const canLoadPosition = comparable && selected.length <= 160;
  const selectedMarketKey = JSON.stringify([...new Set([underlyingId, ...selected.map(contract => contract.id)])].sort());
  useEffect(() => {
    if (active && selectionReady && canLoadPosition && data && !reading.issue && reading.selectionKey === selectedMarketKey &&
      !loadingPosition && !input.position && !initialPositionAttempted.current) void loadPosition(input, true);
  }, [active, selectionReady, canLoadPosition, data, reading.issue, reading.selectionKey, selectedMarketKey, loadingPosition, input.position]);
  function openPosition() {
    if (!underlying) return;
    if (input.position) { setPositionMode(true); setOpenQuote(undefined); setNotice(""); return; }
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
    setInput(current => current.position ? { ...current, position: { legs: [] }, costs: "0", realized: undefined } : current);
    setNotice("Se limpió la posición del borrador. Podés recargar la tenencia. Los ajustes siguen en Armado.");
  }
  function commitPositionQuantity(series: PositionSeries, value: string) {
    const raw = value.trim().replace(/^−/, "-");
    const quantity = raw === "" ? 0 : /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(quantity) || Math.abs(quantity) > MAX_CONTRACTS) {
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
  function selectQuote(contract: Contract, side: "buy" | "sell", quote: Quote) {
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
    const level = quote[side === "buy" ? "ask" : "bid"];
    const price = quotePrice(quote, side);
    if (!price.ok) { setNotice(price.reason); return; }
    if (!level) return;
    const leg: Leg = { ...newLeg(existing?.id ?? Math.max(0, ...input.legs.map(item => item.id)) + 1), securityId: contract.id, symbol: contract.symbol,
      kind: contract.kind, side, strike: String(contract.strike), premium: String(level.price),
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
  function chooseStrategy(choice: StrategyChoice): boolean {
    const recipe = strategyRecipe(choice, selected, spot), prices = recipePrices(recipe, data?.instruments, underlying?.currency);
    if (!recipe.ok || !prices.ok || !data || !underlying || !positive(spot)) {
      setNotice(!recipe.ok ? recipe.reason : !prices.ok ? prices.reason : "Esperando una lectura completa de mercado."); return false;
    }
    const factor = recipe.legs[0].contract.factor!;
    if (input.position && (factor !== numeric(input.multiplier) || input.underlying !== underlying.symbol ||
      input.expiry !== expiryDate(expiration) || input.currency !== recipe.legs[0].contract.currency)) {
      setNotice("Los ajustes deben usar el mismo subyacente, vencimiento, moneda y factor que la posición cargada."); return false;
    }
    const legs = recipe.legs.map((item, index): Leg => {
      const contract = item.contract, quote = data.instruments[contract.id];
      return { ...newLeg(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side: item.side,
        strike: String(contract.strike), premium: String(prices.premiums[index]), contracts: String(item.ratio),
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
  const metricCell = (contract: Contract | undefined, field: "volume" | "change" | "delta" | "iv" | "theta" | "extrinsic", kind: "call" | "put") =>
    <OptionMetricCell contract={contract} field={field} cell={contract ? metrics.byId[contract.id] : undefined} scale={metrics.scales[kind]} />;
  const positionCell = (kind: "call" | "put", strike: number, field: "quantity" | "premium") => {
    const entries = positionSeries.filter(series => series.kind === kind && series.strike === strike);
    return <td className={entries.some(series => positionLegs.some(leg => leg.securityId === series.id)) ? "ct-opt-position-held" : undefined}>
      {entries.length ? entries.map(series => {
        const leg = positionLegs.find(item => item.securityId === series.id);
        const label = entries.length > 1 ? series.symbol : `${kind.toUpperCase()} ${fmt(strike)}`;
        return <div key={series.id} className="ct-opt-position-field">
          {entries.length > 1 && <small>{series.symbol}</small>}
          {field === "quantity" ? <PositionQuantity label={label} leg={leg} disabled={loadingPosition}
            onCommit={value => commitPositionQuantity(series, value)} />
            : <PositionPremium label={label} leg={leg} disabled={loadingPosition}
              onChange={onPremiumChange} onReview={onPremiumReview} />}
        </div>;
      }) : "—"}
    </td>;
  };
  const quoteCell = (contract: Contract | undefined, side: "buy" | "sell") => {
    const quote = contract && data?.instruments[contract.id], level = quote?.[side === "buy" ? "ask" : "bid"];
    const price = quotePrice(quote, side);
    const marked = contract && input.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const held = contract && input.position?.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const available = !!contract && !!quote && !!level && price.ok && !reading.issue;
    const moneyness = contract && itmSpot !== undefined && contract.strike !== itmSpot ? (contract.kind === "call" ? contract.strike < itmSpot : contract.strike > itmSpot) ? "itm" : "otm" : undefined;
    const key = marked && legKey(marked);
    const visible = key !== undefined && key === shownQuote;
    const quantity = marked ? numeric(marked.contracts) : NaN;
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
      <button type="button" disabled={!available} aria-label={`${side === "buy" ? "Comprar" : "Vender"} ${contract?.symbol ?? "contrato no disponible"} en simulación`}
        aria-pressed={!!marked} title={price.ok ? contract?.symbol : `${contract?.symbol ?? "Contrato"}: ${price.reason}`} onClick={() => contract && quote && selectQuote(contract, side, quote)}>
        <span className="ct-opt-marker">{marked ? `${side === "buy" ? "Compra" : "Venta"} · ${marked.contracts}` : held ? `Pos. ${held.side === "buy" ? "+" : "−"}${held.contracts}` : ""}</span>
        <Fragment key={contract?.id}>
          <OptionQuoteValue quantity value={available ? level.size : undefined} />
          <OptionQuoteValue value={available ? level.price : undefined} />
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
      </div>}
    </td>;
  };
  const money = (value: number | undefined) => value === undefined ? "—" : `${fmt(value)} ${underlying?.currency ?? ""}`;
  const viLegend = (kind: "call" | "put") => {
    const scale = metrics.scales[kind];
    const range = scale.min === undefined || scale.max === undefined ? "—"
      : scale.min === scale.max ? `${formatOptionVolatility(scale.min)} %` : `${formatOptionVolatility(scale.min)}–${formatOptionVolatility(scale.max)} %`;
    return <span className="ct-sim-vi-scale" title={`${scale.included}/${scale.total} VI ${viEnabled ? `de operaciones de los últimos ${viMinutes} min` : "con dato"}. Gris: fuera de la escala.`}>
      <i aria-hidden="true" /><strong>{range}</strong></span>;
  };
  const sigmaKey = deviations && deviations.move > 0 && <span className="ct-opt-sigma-key" title={`Desvíos de la simulación · VI ${formatOptionVolatility(deviations.volatility * 100)} % · ${daysToExpiry(input.expiry, input.scenarioDate)} días restantes. Solo se dibujan los niveles dentro de los strikes de la cadena.`}>
    <i className="ct-opt-sigma-1">±1σ</i> <i className="ct-opt-sigma-2">±2σ</i></span>;
  const spotOutsideGrid = spot !== undefined && (itmSpot === undefined || spot < (strikes[0] ?? Infinity) || spot > (strikes.at(-1) ?? -Infinity));
  const viSettings = <details className="ct-sim-market-settings"><summary aria-label="Configurar filtro de VI" title="Configurar filtro y escala de VI">⚙ VI</summary><div className="ct-sim-market-settings-panel">
    <div className="ct-opt-metrics-filter" role="group" aria-label="Filtro temporal de VI">
      <label><input type="checkbox" checked={viEnabled} onChange={event => setViEnabled(event.target.checked)} />Filtrar VI por última operación</label>
      <label>Últimos<input aria-label="Antigüedad máxima de la operación en minutos" type="number" min="1" step="1" disabled={!viEnabled} value={viMinutes} onChange={event => setViMinutes(event.target.value)} />min</label>
      <div className="ct-opt-metrics-presets">{[15, 30, 60].map(value => <button type="button" key={value} className={viMinutes === String(value) ? "on" : ""} disabled={!viEnabled} onClick={() => setViMinutes(String(value))}>{value} min</button>)}</div>
      <span className="ct-opt-metrics-grey-key"><i aria-hidden="true" />Gris: excluida de la escala</span>
    </div>
    <div className="ct-opt-metrics-note">{viEnabled && !metrics.windowValid ? "Ingresá minutos enteros mayores que cero." : "VI nativa de Matriz. La antigüedad usa la última operación; una lectura local no acredita vigencia bursátil."}</div>
  </div></details>;
  return <section className="ct-sim-card ct-options ct-sim-market">{toolbar && active && createPortal(<div className="ct-sim-market-toolbar" role="group" aria-label="Mercado de opciones">
    <label>Subyacente<select aria-label="Subyacente de opciones" disabled={!!input.position || loadingPosition} value={underlyingId} onChange={event => change("underlying", event.target.value)}><option value="">Seleccionar</option>{underlyings.map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}</select></label>
    <label>Vencimiento<select aria-label="Vencimiento de opciones" disabled={!!input.position || loadingPosition} value={expiration} onChange={event => change("expiration", event.target.value)}><option value="">Seleccionar</option>{expirations.map(value => <option key={value} value={value} title={expiryDate(value)}>{formatOptionExpiry(expiryDate(value), "short")}</option>)}</select>
      <span className="ct-sim-expiry-days" aria-label="Días al vencimiento de la cadena" title={`Días calendario desde hoy · Vencimiento ${expiryDate(expiration)}`}>{formatExpiryDays(daysToExpiry(expiryDate(expiration)))}</span></label>
    {!editingPosition && <StrategyPicker active={active} contracts={selected} quotes={data?.instruments} spot={spot} currency={underlying?.currency}
      costs={numeric(input.position ? input.adjustmentCosts ?? "0" : input.costs)}
      context={`${underlying?.symbol ?? "Sin selección"} · ${formatOptionExpiry(expiryDate(expiration), "short")}${input.position ? " · Ajustes" : ""}`} onApply={chooseStrategy} />}
    {input.position ? <div className="ct-sim-position-tabs" role="group" aria-label="Modo de la cadena">
      <button type="button" aria-pressed={!editingPosition} disabled={loadingPosition} onClick={() => { setPositionMode(false); setNotice(""); }}>Cotizaciones</button>
      <button type="button" aria-pressed={editingPosition} disabled={loadingPosition} onClick={openPosition}>Posición actual</button>
    </div> : <button type="button" disabled={!canLoadPosition || loadingPosition} onClick={openPosition}
      aria-label="Cargar posición actual" title="Leer la posición de la cuenta activa para este subyacente y vencimiento">{loadingPosition ? "Cargando posición…" : "Cargar posición"}</button>}
    <span className="ct-sim-chain-counts">
      <span>{strikes.length} ejercicios</span>
      {!!catalog?.excluded && <span title="Contratos del catálogo con metadatos incompletos, excluidos de la cadena">⚠ {catalog.excluded} incompletos</span>}
    </span>
    {spotOutsideGrid && <span className="ct-sim-spot-outside">{money(spot)} {spotChange}</span>}
  </div>, toolbar)}
    {reading.issue && <p role="status" className="ct-sim-error ct-sim-chain-notice">{reading.issue}</p>}
    {editingPosition && <div className="ct-sim-position-toolbar">
      <small>Cantidad con signo · + compra, − venta. Ingresá la prima histórica por unidad.</small>
      <button type="button" disabled={loadingPosition} onClick={clearPosition}>Limpiar posición</button>
      <button type="button" disabled={!canLoadPosition || loadingPosition} onClick={() => void loadPosition()}>
        {loadingPosition ? "Cargando posición…" : "Recargar tenencia"}</button>
    </div>}
    {notice && <p role="status" className="ct-sim-chain-notice" title={notice}>{notice}</p>}
    <div className="ct-table-scroll ct-opt-chain-scroll" role="region" aria-label="Cadena de opciones" aria-busy={loadingPosition} tabIndex={0}>
      <div ref={grid} className="ct-opt-chain-grid"><table className={editingPosition ? "ct-opt-chain ct-opt-position-chain" : "ct-opt-chain ct-opt-metrics-chain"}>
        {editingPosition ? <thead><tr><th colSpan={2} scope="colgroup">CALLS</th><th className="ct-opt-strike" rowSpan={2} scope="col">Strike</th><th colSpan={2} scope="colgroup">PUTS</th></tr>
          <tr><th scope="col">Cantidad</th><th scope="col">Prima histórica</th><th scope="col">Prima histórica</th><th scope="col">Cantidad</th></tr>
        </thead> : <>
        <colgroup><col className="nominal" /><col className="change" /><col className="delta" /><col className="theta" /><col className="extrinsic" /><col /><col /><col className="iv" /><col className="strike" /><col className="iv" /><col /><col /><col className="extrinsic" /><col className="theta" /><col className="delta" /><col className="change" /><col className="nominal" /></colgroup>
        <thead><tr className="ct-sim-chain-legend" aria-label="Resumen de mercado y escala de VI">
          <th colSpan={7} className="ct-opt-calls-heading">CALLS</th>
          <th className="ct-opt-vi-heading">{viLegend("call")}</th>
          <th className="ct-opt-strike">{viSettings}</th>
          <th className="ct-opt-vi-heading">{viLegend("put")}</th>
          <th colSpan={7}><div className="ct-sim-chain-group">PUTS {sigmaKey}</div></th>
        </tr><tr><th>Vol. nom.</th><th>Var. %</th><th>Delta</th><th title="Theta teórico BSM por día calendario y unidad de prima">Θ/d teór.</th><th title="Precio Mid menos intrínseco, por unidad de prima">Extr. Mid</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th className="ct-opt-vi-heading">VI</th><th className="ct-opt-strike">Strike</th><th className="ct-opt-vi-heading">VI</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th title="Precio Mid menos intrínseco, por unidad de prima">Extr. Mid</th><th title="Theta teórico BSM por día calendario y unidad de prima">Θ/d teór.</th><th>Delta</th><th>Var. %</th><th>Vol. nom.</th></tr></thead></>}
        <tbody>{strikes.map(strike => {
          const call = editingPosition ? undefined : unique("call", strike), put = editingPosition ? undefined : unique("put", strike);
          return <Fragment key={strike}><tr data-option-strike={strike} className={itmSpot === strike ? "ct-opt-atm" : ""}>
            {editingPosition ? <>{positionCell("call", strike, "quantity")}{positionCell("call", strike, "premium")}</>
              : <>{metricCell(call, "volume", "call")}{metricCell(call, "change", "call")}{metricCell(call, "delta", "call")}{metricCell(call, "theta", "call")}{metricCell(call, "extrinsic", "call")}{quoteCell(call, "sell")}{quoteCell(call, "buy")}{metricCell(call, "iv", "call")}</>}
            <th scope="row" className="ct-opt-strike">{fmt(strike)}{itmSpot === strike && <span className="ct-opt-atm-label">ATM {spotChange}</span>}</th>
            {editingPosition ? <>{positionCell("put", strike, "premium")}{positionCell("put", strike, "quantity")}</>
              : <>{metricCell(put, "iv", "put")}{quoteCell(put, "sell")}{quoteCell(put, "buy")}{metricCell(put, "extrinsic", "put")}{metricCell(put, "theta", "put")}{metricCell(put, "delta", "put")}{metricCell(put, "change", "put")}{metricCell(put, "volume", "put")}</>}
          </tr>{!editingPosition && itmSpot !== undefined && strike === spotBoundary && <tr className="ct-opt-itm-boundary"><td colSpan={17}><div className="ct-opt-itm-line" aria-label={`Límite ITM, subyacente ${fmt(itmSpot)}`}><span className="ct-opt-itm-call">↑ ITM</span>{!spotSharesSigma && <span className="ct-opt-itm-spot">$ {fmt(itmSpot)} {spotChange}</span>}<span className="ct-opt-itm-put">↓ ITM</span></div></td></tr>}</Fragment>;
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
    {editingPosition && positionAccounting && <fieldset className="ct-sim-position-accounting" disabled={loadingPosition}>{positionAccounting}</fieldset>}
  </section>;
}
