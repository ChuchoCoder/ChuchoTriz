import { Dispatch, Fragment, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { Catalog, Contract, PremiumReference, Quote, useOptionMarket } from "./market";
import { deriveOptionMetrics } from "./marketMetrics";
import { OptionMetricCell } from "./OptionsMetrics";
import { OptionQuoteValue } from "./OptionQuoteValue";
import { formatOptionNumber as fmt } from "./format";
import { Leg, localDate, MAX_LEGS, newLeg, Simulation } from "./model";
import "./MarketChain.css";

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const marketKey = (contract: Contract) => `${contract.currency}|${contract.settlement}`;
const expiryDate = (value: string) => value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
const settlement = (value: string) => value === "1" ? "CI" : value === "2" ? "24 hs" : value;

export default function MarketChain({ active, input, setInput, onPremiumReferences }: {
  active: boolean; input: Simulation; setInput: Dispatch<SetStateAction<Simulation>>;
  onPremiumReferences(references: Record<string, PremiumReference>): void;
}) {
  const root = useRef<HTMLElement>(null);
  const [chainHeight, setChainHeight] = useState<number>();
  const [underlyingId, setUnderlying] = useState("");
  const [expiration, setExpiration] = useState("");
  const [market, setMarket] = useState("");
  const [filter, setFilter] = useState("Ambos");
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
  const markets = [...new Set(contracts.filter(contract => contract.expiration === expiration).map(marketKey))].sort();
  useEffect(() => {
    if (!underlyingId && underlyings.length) setUnderlying((underlyings.find(item => item.symbol === "GGAL") ?? underlyings[0]).id);
  }, [catalog, underlyingId]);
  useEffect(() => {
    if (!expiration && expirations.length) setExpiration(expirations.find(value => value >= localDate().replaceAll("-", "")) ?? expirations[0]);
    if (!market && markets.length) setMarket(markets[0]);
  }, [expiration, market, expirations.join(), markets.join()]);
  const selected = contracts.filter(contract => contract.expiration === expiration && marketKey(contract) === market);
  const data = reading.data?.underlyingId === underlyingId && reading.data.catalogRevision === catalog?.catalogRevision && ids.every(id => reading.data?.instruments[id]) ? reading.data : undefined;
  useEffect(() => {
    const references: Record<string, PremiumReference> = {};
    for (const contract of selected) {
      const quote = data?.instruments[contract.id];
      if (quote?.bid && quote.ask && positive(quote.bid.price) && positive(quote.ask.price) && quote.bid.price < quote.ask.price)
        references[contract.id] = { bid: quote.bid.price, ask: quote.ask.price };
    }
    onPremiumReferences(references);
  }, [data, onPremiumReferences, underlyingId, expiration, market]);
  const underlying = underlyings.find(item => item.id === underlyingId), spotQuote = data?.instruments[underlyingId];
  const spot = positive(spotQuote?.last) ? spotQuote.last : undefined;
  const strikes = [...new Set(selected.map(contract => contract.strike))].sort((a, b) => a - b);
  const unique = (kind: "call" | "put", strike: number) => {
    const matches = selected.filter(contract => contract.kind === kind && contract.strike === strike);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const comparable = !!underlying && selected.length > 0 && selected.every(contract => contract.strikeCurrency === underlying.currency);
  const itmSpot = comparable ? spot : undefined;
  const metrics = deriveOptionMetrics(selected, data?.instruments, { now: Date.now(), minutes: viMinutes, enabled: viEnabled, available: !!data && !reading.issue });
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
  function change(field: "underlying" | "expiration" | "market", value: string) {
    if (field === "underlying") { setUnderlying(value); setExpiration(""); setMarket(""); }
    if (field === "expiration") { setExpiration(value); setMarket(""); }
    if (field === "market") setMarket(value);
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
    if (!level || !positive(level.price) || !positive(level.size)) return;
    const leg: Leg = { ...newLeg(existing?.id ?? Math.max(0, ...input.legs.map(item => item.id)) + 1), securityId: contract.id, symbol: contract.symbol,
      kind: contract.kind, side, strike: String(contract.strike), premium: String(level.price),
      contracts: existing?.contracts ?? "1", volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    setInput(current => ({ ...current, underlying: underlying.symbol, currency: contract.currency, expiry, multiplier: String(contract.factor),
      ...(current.legs.length === 0 ? { spot: spot === undefined ? "" : String(spot), rangeMin: String(Math.max(0, (spot ?? contract.strike) * .75)), rangeMax: String((spot ?? contract.strike) * 1.25), scenarioDate: current.valuationDate } : {}),
      legs: existing ? current.legs.map(item => item.securityId === contract.id ? leg : item) : [...current.legs, leg] }));
    setNotice("Pata agregada a la simulación. Prima y VI copiadas de esta lectura; quedan editables y no siguen al mercado automáticamente.");
  }
  function chooseStrategy(value: string) {
    if (!value || !data || !underlying || !comparable || !positive(spot)) { setNotice("Esperá una lectura completa con precio del subyacente para armar una estructura."); return; }
    const center = strikes.reduce((best, strike, index) => Math.abs(strike - spot) < Math.abs(strikes[best] - spot) ? index : best, 0);
    const at = (kind: "call" | "put", offset: number, side: "buy" | "sell", ratio = 1) => ({ contract: unique(kind, strikes[center + offset]), side, ratio });
    const recipe = value === "vertical-call" ? [at("call", 0, "buy"), at("call", 1, "sell")]
      : value === "vertical-put" ? [at("put", 0, "buy"), at("put", -1, "sell")]
      : value === "condor" ? [at("put", -2, "buy"), at("put", -1, "sell"), at("call", 1, "sell"), at("call", 2, "buy")]
      : value === "straddle" ? [at("call", 0, "buy"), at("put", 0, "buy")]
      : [at("call", -1, "buy"), at("call", 0, "sell", 2), at("call", 1, "buy")];
    const factor = recipe[0].contract?.factor;
    if (!positive(factor) || recipe.some(item => !item.contract || item.contract.factor !== factor || item.contract.currency !== underlying.currency ||
      !positive(data.instruments[item.contract.id]?.[item.side === "buy" ? "ask" : "bid"]?.price))) {
      setNotice("Faltan ejercicios únicos, factores compatibles o puntas para esa estructura. Seleccioná las patas desde la cadena."); return;
    }
    const legs = recipe.map((item, index): Leg => {
      const contract = item.contract!, quote = data.instruments[contract.id];
      return { ...newLeg(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side: item.side,
        strike: String(contract.strike), premium: String(quote[item.side === "buy" ? "ask" : "bid"]!.price), contracts: String(item.ratio),
        volatility: positive(quote.impliedVolatility) ? String(quote.impliedVolatility) : "" };
    });
    setInput(current => ({ ...current, underlying: underlying.symbol, expiry: expiryDate(expiration), currency: recipe[0].contract!.currency,
      multiplier: String(factor), spot: String(spot), rangeMin: String(spot * .75), rangeMax: String(spot * 1.25), scenarioDate: current.valuationDate, legs }));
    setNotice("Estructura simulada cargada desde la cadena. Revisá proporciones, primas y VI antes de interpretar el gráfico.");
  }
  const metricCell = (contract: Contract | undefined, field: "volume" | "change" | "delta" | "iv", kind: "call" | "put") =>
    <OptionMetricCell contract={contract} field={field} cell={contract ? metrics.byId[contract.id] : undefined} scale={metrics.scales[kind]} />;
  const quoteCell = (contract: Contract | undefined, side: "buy" | "sell") => {
    const quote = contract && data?.instruments[contract.id], level = quote?.[side === "buy" ? "ask" : "bid"];
    const marked = contract && input.legs.find(leg => leg.securityId === contract.id && leg.side === side);
    const available = !!contract && !!quote && !!level && positive(level.price) && positive(level.size) && !reading.issue;
    const moneyness = contract && itmSpot !== undefined && contract.strike !== itmSpot ? (contract.kind === "call" ? contract.strike < itmSpot : contract.strike > itmSpot) ? "itm" : "otm" : undefined;
    return <td className={`ct-opt-price ${side} ${side === "sell" ? "ct-opt-bid" : "ct-opt-ask"}${marked ? " selected" : ""}${moneyness ? ` ct-opt-${moneyness}` : ""}`}>
      <button type="button" disabled={!available} aria-label={`${side === "buy" ? "Comprar" : "Vender"} ${contract?.symbol ?? "contrato no disponible"} en simulación`}
        aria-pressed={!!marked} title={contract?.symbol} onClick={() => contract && quote && selectQuote(contract, side, quote)}>
        <span className="ct-opt-marker">{marked ? `${side === "buy" ? "Compra" : "Venta"} · ${marked.contracts}` : ""}</span><OptionQuoteValue quantity value={available ? level.size : undefined} /><OptionQuoteValue value={available ? level.price : undefined} />
      </button></td>;
  };
  const money = (value: number | undefined) => value === undefined ? "—" : `${fmt(value)} ${underlying?.currency ?? ""}`;
  const viLegend = (kind: "call" | "put") => {
    const scale = metrics.scales[kind];
    const range = scale.min === undefined || scale.max === undefined ? "—"
      : scale.min === scale.max ? `${fmt(scale.min, 2)} %` : `${fmt(scale.min, 2)}–${fmt(scale.max, 2)} %`;
    return <span title={`${scale.included}/${scale.total} VI ${viEnabled ? `de operaciones de los últimos ${viMinutes} min` : "con dato"}. Gris: fuera de la escala.`}>
      {kind === "call" ? "Calls" : "Puts"} <strong>{range}</strong></span>;
  };
  return <section ref={root} className="ct-sim-card ct-options ct-sim-market"><div className="ct-opt-controls" role="group" aria-label="Mercado de opciones">
    <label>Subyacente<select aria-label="Subyacente de opciones" value={underlyingId} onChange={event => change("underlying", event.target.value)}><option value="">Seleccionar</option>{underlyings.map(item => <option key={item.id} value={item.id}>{item.symbol}</option>)}</select></label>
    <label>Vencimiento<select aria-label="Vencimiento de opciones" value={expiration} onChange={event => change("expiration", event.target.value)}><option value="">Seleccionar</option>{expirations.map(value => <option key={value} value={value}>{expiryDate(value)}</option>)}</select></label>
    <label>Moneda / plazo<select aria-label="Moneda y plazo de opciones" value={market} onChange={event => change("market", event.target.value)}><option value="">Seleccionar</option>{markets.map(value => <option key={value} value={value}>{value.split("|")[0]} · {settlement(value.split("|")[1])}</option>)}</select></label>
    <label>Mostrar<select aria-label="Filtrar calls y puts" value={filter} onChange={event => setFilter(event.target.value)}>{["Calls", "Ambos", "Puts"].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>Estrategia<select aria-label="Armar estrategia desde la cadena" value="" onChange={event => chooseStrategy(event.target.value)}><option value="">Personalizada</option><option value="vertical-call">Vertical call</option><option value="vertical-put">Vertical put</option><option value="condor">Iron condor</option><option value="butterfly">Mariposa call</option><option value="straddle">Straddle comprado</option></select></label>
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
      <span>{underlying?.symbol ?? "Subyacente"} <strong>{money(spot)}</strong></span>
      <span className="ct-sim-vi-scale" title="VI relativa de menor a mayor; el filtro se configura desde ⚙ VI">VI <i aria-hidden="true" /></span>
      {filter !== "Puts" && viLegend("call")}{filter !== "Calls" && viLegend("put")}
      <span className="ct-sim-strike-count">{strikes.length} ejercicios</span>
      {!!catalog?.excluded && <span title="Contratos del catálogo con metadatos incompletos, excluidos de la cadena">⚠ {catalog.excluded} incompletos</span>}
    </div>
    <div className="ct-table-scroll ct-opt-chain-scroll" style={chainHeight === undefined ? undefined : { maxHeight: chainHeight }} role="region" aria-label="Cadena de opciones" tabIndex={0}>
      <table className={`ct-opt-chain ct-opt-metrics-chain${filter !== "Ambos" ? " single" : ""}`}>
        <colgroup>{filter !== "Puts" && <><col className="nominal" /><col className="change" /><col className="delta" /><col /><col /><col className="iv" /></>}<col className="strike" />{filter !== "Calls" && <><col className="iv" /><col /><col /><col className="delta" /><col className="change" /><col className="nominal" /></>}</colgroup>
        <thead><tr>{filter !== "Puts" && <th colSpan={6}>CALLS</th>}<th className="ct-opt-strike">Ejercicio</th>{filter !== "Calls" && <th colSpan={6}>PUTS</th>}</tr><tr>{filter !== "Puts" && <><th>Vol. nom.</th><th>Var. %</th><th>Delta</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th>VI</th></>}<th className="ct-opt-strike">Strike</th>{filter !== "Calls" && <><th>VI</th><th className="ct-opt-bid">BID · Vender</th><th className="ct-opt-ask">ASK · Comprar</th><th>Delta</th><th>Var. %</th><th>Vol. nom.</th></>}</tr></thead>
        <tbody>{strikes.map((strike, index) => {
          const call = unique("call", strike), put = unique("put", strike);
          return <Fragment key={strike}><tr className={itmSpot === strike ? "ct-opt-atm" : ""}>
            {filter !== "Puts" && <>{metricCell(call, "volume", "call")}{metricCell(call, "change", "call")}{metricCell(call, "delta", "call")}{quoteCell(call, "sell")}{quoteCell(call, "buy")}{metricCell(call, "iv", "call")}</>}
            <th className="ct-opt-strike">{fmt(strike)}{itmSpot === strike && <span className="ct-opt-atm-label">ATM · Subyacente</span>}</th>
            {filter !== "Calls" && <>{metricCell(put, "iv", "put")}{quoteCell(put, "sell")}{quoteCell(put, "buy")}{metricCell(put, "delta", "put")}{metricCell(put, "change", "put")}{metricCell(put, "volume", "put")}</>}
          </tr>{itmSpot !== undefined && strike < itmSpot && strikes[index + 1] > itmSpot && <tr className="ct-opt-itm-boundary"><td colSpan={filter === "Ambos" ? 13 : 7}><div className={`ct-opt-itm-line ${filter === "Calls" ? "calls-only" : filter === "Puts" ? "puts-only" : ""}`} aria-label={`Límite ITM, subyacente ${fmt(itmSpot)}`}><span className="ct-opt-itm-call">{filter !== "Puts" && "↑ ITM"}</span><span className="ct-opt-itm-spot">$ {fmt(itmSpot)}</span><span className="ct-opt-itm-put">{filter !== "Calls" && "↓ ITM"}</span></div></td></tr>}</Fragment>;
        })}</tbody>
      </table>{!strikes.length && <p className="ct-opt-empty">Sin contratos completos para esta selección.</p>}
    </div>
  </section>;
}
