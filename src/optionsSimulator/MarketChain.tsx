import { Dispatch, Fragment, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { Catalog, Contract, Quote, useOptionMarket } from "./market";
import { deriveOptionMetrics } from "./marketMetrics";
import { OptionMetricCell } from "./OptionsMetrics";
import { OptionQuoteValue } from "./OptionQuoteValue";
import { formatExpiryDays, formatOptionAmount, formatOptionNumber as fmt, formatOptionVolatility } from "./format";
import { daysToExpiry, Leg, localDate, MAX_LEGS, newLeg, numeric, parseSimulation, Simulation, standardDeviationLevels } from "./model";
import "./MarketChain.css";
import StrategyPicker from "./StrategyPicker";
import { preferredOptionMarket, quotePrice, recipePrices, strategyLabel, strategyRecipe, type StrategyChoice } from "./strategyTemplates";
import type { StrikeMarket } from "./strategyAdjustments";

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const marketKey = (contract: Contract) => `${contract.currency}|${contract.settlement}`;
const expiryDate = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

export default function MarketChain({ active, input, setInput, onStrikeMarket }: {
  active: boolean; input: Simulation; setInput: Dispatch<SetStateAction<Simulation>>;
  onStrikeMarket(market: StrikeMarket | undefined): void;
}) {
  const root = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [strikeRows, setStrikeRows] = useState<{ strike: number; top: number; bottom: number }[]>([]);
  const [chainHeight, setChainHeight] = useState<number>();
  const [underlyingId, setUnderlying] = useState("");
  const [expiration, setExpiration] = useState("");
  const [market, setMarket] = useState("");
  const [viEnabled, setViEnabled] = useState(true), [viMinutes, setViMinutes] = useState("30");
  const [notice, setNotice] = useState("");
  const [catalogCache, setCatalogCache] = useState<Catalog>();
  const availableContracts = catalogCache?.contracts.filter(contract => contract.underlyingId === underlyingId && contract.expiration === expiration && marketKey(contract) === market) ?? [];
  const ids = useMemo(() => underlyingId ? [underlyingId, ...availableContracts.map(contract => contract.id)].sort() : [], [underlyingId, availableContracts.map(contract => contract.id).join("|")]);
  const reading = useOptionMarket(active, underlyingId, ids);
  const catalog = reading.catalog;
  useEffect(() => { if (catalog) setCatalogCache(catalog); }, [catalog]);
  const underlyings = catalog?.underlyings ?? [];
  const contracts = catalog?.contracts.filter(contract => contract.underlyingId === underlyingId) ?? [];
  const expirations = [...new Set(contracts.map(contract => contract.expiration))].sort();
  useEffect(() => {
    if (!underlyingId && underlyings.length) setUnderlying((underlyings.find(item => item.symbol === "GGAL") ?? underlyings[0]).id);
  }, [catalog, underlyingId]);
  useEffect(() => {
    if (!expiration && expirations.length) setExpiration(expirations.find(value => value >= localDate().replaceAll("-", "")) ?? expirations[0]);
    const preferred = preferredOptionMarket(contracts.filter(contract => contract.expiration === expiration), underlyings.find(item => item.id === underlyingId)?.currency);
    if (market !== preferred) setMarket(preferred);
  }, [expiration, market, expirations.join(), catalog, underlyingId]);
  const selected = contracts.filter(contract => contract.expiration === expiration && marketKey(contract) === market);
  const data = reading.data?.underlyingId === underlyingId && reading.data.catalogRevision === catalog?.catalogRevision && ids.every(id => reading.data?.instruments[id]) ? reading.data : undefined;
  const underlying = underlyings.find(item => item.id === underlyingId), spotQuote = data?.instruments[underlyingId];
  const spot = positive(spotQuote?.last) ? spotQuote.last : undefined;
  const strikes = [...new Set(selected.map(contract => contract.strike))].sort((a, b) => a - b);
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
  const parsed = useMemo(() => parseSimulation(input), [input]);
  const deviationReference = useMemo(() => parsed.ok ? standardDeviationLevels(parsed.strategy) : undefined, [parsed]);
  const sameContext = comparable && input.underlying === underlying?.symbol && input.expiry === expiryDate(expiration) && input.currency === underlying?.currency;
  const deviations = sameContext ? deviationReference : undefined;
  const gridLevels = deviations && deviations.move > 0 && strikes.length > 1 && strikeRows.length === strikes.length && strikeRows.every((row, index) => row.strike === strikes[index])
    ? deviations.levels.flatMap(level => {
      const index = strikes.findIndex(strike => strike >= level.price);
      if (index < 0 || level.price < strikes[0]) return [];
      const upperIndex = Math.max(1, index);
      const low = strikeRows[upperIndex - 1], high = strikeRows[upperIndex];
      return [{ ...level, y: (low.bottom + high.top) / 2 }];
    }) : [];
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
  }, [active, strikes.join("|")]);
  const metrics = deriveOptionMetrics(selected, data?.instruments, { now: Date.now(), minutes: viMinutes, enabled: viEnabled, available: !!data && !reading.issue,
    spot, currency: underlying?.currency, rate: numeric(input.rate) / 100, dividendYield: numeric(input.dividendYield) / 100 });
  useEffect(() => {
    const viewport = root.current?.closest<HTMLElement>(".ct-sim");
    const scroll = root.current?.querySelector<HTMLElement>(".ct-opt-chain-scroll");
    if (!active || !viewport || !scroll || typeof ResizeObserver === "undefined") return;
    const resize = new ResizeObserver(() => {
      const offset = scroll.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      setChainHeight(Math.max(180, Math.floor(viewport.clientHeight - offset - 16)));
    });
    [viewport, ...root.current!.querySelectorAll(".ct-opt-controls, .ct-sim-chain-legend, .ct-sim-chain-notice")].forEach(node => resize.observe(node));
    return () => resize.disconnect();
  }, [active, !!reading.issue, !!notice]);
  function change(field: "underlying" | "expiration", value: string) {
    if (field === "underlying") { setUnderlying(value); setExpiration(""); setMarket(""); }
    if (field === "expiration") { setExpiration(value); setMarket(""); }
    setNotice(""); setInput(current => ({ ...current, legs: [] }));
  }
  function selectQuote(contract: Contract, side: "buy" | "sell", quote: Quote) {
    const existing = input.legs.find(leg => leg.securityId === contract.id);
    if (existing?.side === side) { setInput(current => ({ ...current, legs: current.legs.filter(leg => leg.securityId !== contract.id) })); return; }
    if (!existing && input.legs.length >= MAX_LEGS) { setNotice(`Máximo ${MAX_LEGS} patas.`); return; }
    if (!underlying || !comparable || contract.currency !== underlying.currency || !positive(contract.factor)) {
      setNotice("No se puede simular este contrato: faltan factores o hay monedas de prima, ejercicio y subyacente diferentes."); return;
    }
    const expiry = expiryDate(contract.expiration);
    const mismatched = input.legs.length && (input.underlying !== underlying.symbol || input.expiry !== expiry || input.currency !== contract.currency || Number(input.multiplier) !== contract.factor || input.legs.some(leg => !leg.securityId || !selected.some(item => item.id === leg.securityId)));
    if (mismatched) { setNotice("Limpiá las patas antes de cambiar el contexto de la simulación o combinar con datos manuales."); return; }
    const level = quote[side === "buy" ? "ask" : "bid"];
    const price = quotePrice(quote, side);
    if (!price.ok) { setNotice(price.reason); return; }
    if (!level) return;
    const leg: Leg = { ...newLeg(existing?.id ?? Math.max(0, ...input.legs.map(item => item.id)) + 1), securityId: contract.id, symbol: contract.symbol,
      kind: contract.kind, side, strike: String(contract.strike), premium: String(level.price),
      contracts: existing?.contracts ?? "1", volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    setInput(current => ({ ...current, underlying: underlying.symbol, currency: contract.currency, expiry, multiplier: String(contract.factor),
      ...(current.legs.length === 0 ? { spot: spot === undefined ? "" : String(spot), rangeMin: String(Math.max(0, (spot ?? contract.strike) * .75)), rangeMax: String((spot ?? contract.strike) * 1.25), scenarioDate: current.valuationDate } : {}),
      legs: existing ? current.legs.map(item => item.securityId === contract.id ? leg : item) : [...current.legs, leg] }));
    setNotice("Pata agregada a la simulación. Prima y VI copiadas de esta lectura; quedan editables y no siguen al mercado automáticamente.");
  }
  function chooseStrategy(choice: StrategyChoice): boolean {
    const recipe = strategyRecipe(choice, selected, spot), prices = recipePrices(recipe, data?.instruments, underlying?.currency);
    if (!recipe.ok || !prices.ok || !data || !underlying || !positive(spot)) {
      setNotice(!recipe.ok ? recipe.reason : !prices.ok ? prices.reason : "Esperando una lectura completa de mercado."); return false;
    }
    const factor = recipe.legs[0].contract.factor!;
    const legs = recipe.legs.map((item, index): Leg => {
      const contract = item.contract, quote = data.instruments[contract.id];
      return { ...newLeg(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side: item.side,
        strike: String(contract.strike), premium: String(prices.premiums[index]), contracts: String(item.ratio),
        volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    });
    setInput(current => ({ ...current, underlying: underlying.symbol, expiry: expiryDate(expiration), currency: recipe.legs[0].contract.currency,
      multiplier: String(factor), spot: String(spot), rangeMin: String(spot * .75), rangeMax: String(spot * 1.25), scenarioDate: current.valuationDate, legs }));
    setNotice(`${strategyLabel(choice)} cargada. Primas y VI copiadas de esta lectura.`);
    return true;
  }
  const metricCell = (contract: Contract | undefined, field: "volume" | "change" | "delta" | "iv" | "theta" | "extrinsic", kind: "call" | "put") =>
    <OptionMetricCell contract={contract} field={field} cell={contract ? metrics.byId[contract.id] : undefined} scale={metrics.scales[kind]} />;
  const quoteCell = (contract: Contract | undefined, side: "buy" | "sell") => {
    const quote = contract && data?.instruments[contract.id], level = quote?.[side === "buy" ? "ask" : "bid"];
    const price = quotePrice(quote, side);
    const marked = contract && input.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const available = !!contract && !!quote && !!level && price.ok && !reading.issue;
    const moneyness = contract && itmSpot !== undefined && contract.strike !== itmSpot ? (contract.kind === "call" ? contract.strike < itmSpot : contract.strike > itmSpot) ? "itm" : "otm" : undefined;
    return <td className={`ct-opt-price ${side} ${side === "sell" ? "ct-opt-bid" : "ct-opt-ask"}${marked ? " selected" : ""}${moneyness ? ` ct-opt-${moneyness}` : ""}`}>
      <button type="button" disabled={!available} aria-label={`${side === "buy" ? "Comprar" : "Vender"} ${contract?.symbol ?? "contrato no disponible"} en simulación`}
        aria-pressed={!!marked} title={price.ok ? contract?.symbol : `${contract?.symbol ?? "Contrato"}: ${price.reason}`} onClick={() => contract && quote && selectQuote(contract, side, quote)}>
        <span className="ct-opt-marker">{marked ? `${side === "buy" ? "Compra" : "Venta"} · ${marked.contracts}` : ""}</span><OptionQuoteValue quantity value={available ? level.size : undefined} /><OptionQuoteValue value={available ? level.price : undefined} />
      </button></td>;
  };
  const money = (value: number | undefined) => value === undefined ? "—" : `${fmt(value)} ${underlying?.currency ?? ""}`;
  const viLegend = (kind: "call" | "put") => {
    const scale = metrics.scales[kind];
    const range = scale.min === undefined || scale.max === undefined ? "—"
      : scale.min === scale.max ? `${formatOptionVolatility(scale.min)} %` : `${formatOptionVolatility(scale.min)}–${formatOptionVolatility(scale.max)} %`;
    return <span title={`${scale.included}/${scale.total} VI ${viEnabled ? `de operaciones de los últimos ${viMinutes} min` : "con dato"}. Gris: fuera de la escala.`}>
      {kind === "call" ? "Calls" : "Puts"} <strong>{range}</strong></span>;
  };
  return <section ref={root} className="ct-sim-card ct-options ct-sim-market"><div className="ct-opt-controls" role="group" aria-label="Mercado de opciones">
    <label>Subyacente<select aria-label="Subyacente de opciones" value={underlyingId} onChange={event => change("underlying", event.target.value)}><option value="">Seleccionar</option>{underlyings.map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}</select></label>
    <label>Vencimiento<select aria-label="Vencimiento de opciones" value={expiration} onChange={event => change("expiration", event.target.value)}><option value="">Seleccionar</option>{expirations.map(value => <option key={value} value={value}>{expiryDate(value)}</option>)}</select>
      <span className="ct-sim-expiry-days" aria-label="Días al vencimiento de la cadena" title={`Días calendario desde hoy · Vencimiento ${expiryDate(expiration)}`}>{formatExpiryDays(daysToExpiry(expiryDate(expiration)))}</span></label>
    <StrategyPicker active={active} contracts={selected} quotes={data?.instruments} spot={spot} currency={underlying?.currency} costs={numeric(input.costs)}
      context={`${underlying?.symbol ?? "Sin selección"} · ${expiryDate(expiration)}`} onApply={chooseStrategy} />
    <details className="ct-sim-market-settings"><summary aria-label="Configurar filtro de VI" title="Configurar filtro y escala de VI">⚙ VI</summary><div className="ct-sim-market-settings-panel">
    <div className="ct-opt-metrics-filter" role="group" aria-label="Filtro temporal de VI">
      <label><input type="checkbox" checked={viEnabled} onChange={event => setViEnabled(event.target.checked)} />Filtrar VI por última operación</label>
      <label>Últimos<input aria-label="Antigüedad máxima de la operación en minutos" type="number" min="1" step="1" disabled={!viEnabled} value={viMinutes} onChange={event => setViMinutes(event.target.value)} />min</label>
      <div className="ct-opt-metrics-presets">{[15, 30, 60].map(value => <button type="button" key={value} className={viMinutes === String(value) ? "on" : ""} disabled={!viEnabled} onClick={() => setViMinutes(String(value))}>{value} min</button>)}</div>
      <span className="ct-opt-metrics-grey-key"><i aria-hidden="true" />Gris: excluida de la escala</span>
    </div>
    <div className="ct-opt-metrics-note">{viEnabled && !metrics.windowValid ? "Ingresá minutos enteros mayores que cero." : "VI nativa de Matriz. La antigüedad usa la última operación; una lectura local no acredita vigencia bursátil."}</div>
    </div></details>
  </div>
    {reading.issue && <p role="status" className="ct-sim-error ct-sim-chain-notice">{reading.issue}</p>}
    {!catalog && !reading.issue && <p role="status" className="ct-sim-chain-notice">Leyendo catálogo de opciones de Matriz…</p>}
    {notice && <p role="status" className="ct-sim-chain-notice" title={notice}>{notice}</p>}
    <div className="ct-sim-chain-legend" aria-label="Resumen de mercado y escala de VI">
      <span title={market ? `${market.split("|")[0]} · ${market.split("|")[1] === "2" ? "24 hs" : `Plazo ${market.split("|")[1]}`} · Selección automática sin mezclar mercados` : "Sin mercado compatible"}>{underlying?.symbol ?? "Subyacente"} <strong>{money(spot)}</strong></span>
      <span className="ct-sim-vi-scale" title="VI relativa de menor a mayor; el filtro se configura desde ⚙ VI">VI <i aria-hidden="true" /></span>
      {viLegend("call")}{viLegend("put")}
      {deviations && deviations.move > 0 && <span className="ct-opt-sigma-key" title={`Desvíos de la simulación · Precio de referencia ${fmt(parsed.ok ? parsed.strategy.spot : NaN)} · VI ${formatOptionVolatility(deviations.volatility * 100)} % · ${parsed.ok ? Math.round(parsed.strategy.years * 365) : 0} días restantes. Los niveles fuera de los strikes de la cadena no se dibujan.`}>
        <i className="ct-opt-sigma-1">±1σ</i> <i className="ct-opt-sigma-2">±2σ</i></span>}
      <span className="ct-sim-strike-count">{strikes.length} ejercicios</span>
      {!!catalog?.excluded && <span title="Contratos del catálogo con metadatos incompletos, excluidos de la cadena">⚠ {catalog.excluded} incompletos</span>}
    </div>
    <div className="ct-table-scroll ct-opt-chain-scroll" style={chainHeight === undefined ? undefined : { maxHeight: chainHeight }} role="region" aria-label="Cadena de opciones" tabIndex={0}>
      <div ref={grid} className="ct-opt-chain-grid"><table className="ct-opt-chain ct-opt-metrics-chain">
        <colgroup><col className="nominal" /><col className="change" /><col className="delta" /><col className="theta" /><col className="extrinsic" /><col /><col /><col className="iv" /><col className="strike" /><col className="iv" /><col /><col /><col className="extrinsic" /><col className="theta" /><col className="delta" /><col className="change" /><col className="nominal" /></colgroup>
        <thead><tr><th colSpan={8}>CALLS</th><th className="ct-opt-strike">Ejercicio</th><th colSpan={8}>PUTS</th></tr><tr><th>Vol. nom.</th><th>Var. %</th><th>Delta</th><th title="Theta teórico BSM por día calendario y unidad de prima">Θ/d teór.</th><th title="Precio Mid menos intrínseco, por unidad de prima">Extr. Mid</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th>VI</th><th className="ct-opt-strike">Strike</th><th>VI</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th title="Precio Mid menos intrínseco, por unidad de prima">Extr. Mid</th><th title="Theta teórico BSM por día calendario y unidad de prima">Θ/d teór.</th><th>Delta</th><th>Var. %</th><th>Vol. nom.</th></tr></thead>
        <tbody>{strikes.map((strike, index) => {
          const call = unique("call", strike), put = unique("put", strike);
          return <Fragment key={strike}><tr data-option-strike={strike} className={itmSpot === strike ? "ct-opt-atm" : ""}>
            {metricCell(call, "volume", "call")}{metricCell(call, "change", "call")}{metricCell(call, "delta", "call")}{metricCell(call, "theta", "call")}{metricCell(call, "extrinsic", "call")}{quoteCell(call, "sell")}{quoteCell(call, "buy")}{metricCell(call, "iv", "call")}
            <th className="ct-opt-strike">{fmt(strike)}{itmSpot === strike && <span className="ct-opt-atm-label">ATM · Subyacente</span>}</th>
            {metricCell(put, "iv", "put")}{quoteCell(put, "sell")}{quoteCell(put, "buy")}{metricCell(put, "extrinsic", "put")}{metricCell(put, "theta", "put")}{metricCell(put, "delta", "put")}{metricCell(put, "change", "put")}{metricCell(put, "volume", "put")}
          </tr>{itmSpot !== undefined && strike < itmSpot && strikes[index + 1] > itmSpot && <tr className="ct-opt-itm-boundary"><td colSpan={17}><div className="ct-opt-itm-line" aria-label={`Límite ITM, subyacente ${fmt(itmSpot)}`}><span className="ct-opt-itm-call">↑ ITM</span><span className="ct-opt-itm-spot">$ {fmt(itmSpot)}</span><span className="ct-opt-itm-put">↓ ITM</span></div></td></tr>}</Fragment>;
        })}</tbody>
      </table><div className="ct-opt-sigma-overlay" role="group" aria-label="Desvíos estándar en la cadena">{gridLevels.map(level =>
        <div key={level.sigma} className={`ct-opt-sigma-line ct-opt-sigma-${Math.abs(level.sigma)}`} style={{ top: level.y }}
          aria-label={`${level.sigma > 0 ? "+" : ""}${level.sigma}σ en cadena: ${formatOptionAmount(level.price)} ${input.currency}`}>
          <span className={level.sigma < 0 ? "ct-opt-sigma-left" : "ct-opt-sigma-right"}>{level.sigma > 0 ? "+" : ""}{level.sigma}σ · {formatOptionAmount(level.price)}</span>
        </div>)}</div></div>{!strikes.length && <p className="ct-opt-empty">Sin contratos completos para esta selección.</p>}
    </div>
  </section>;
}
