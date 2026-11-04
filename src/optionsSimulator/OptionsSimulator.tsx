import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, curve, dateDay, daysToExpiry, expirySummary, initialSimulation, Leg, MAX_LEGS,
  newLeg, numeric, parseSimulation, resultAt, Simulation, standardDeviationLevels, Strategy } from "./model";
import "./OptionsSimulator.css";
import MarketChain from "./MarketChain";
import { formatExpiryDays, formatOptionAmount as fmt, formatOptionExpiry, formatOptionInput, formatOptionNumber, formatOptionVolatility } from "./format";
import { adjustStrategyQuantity, setStrategyPrice, shiftStrategyStrikes, strategyPriceReferences, type StrikeMarket } from "./strategyAdjustments";

// A native double click delivers two click events: 1 + 9 makes ten in total.
const quantityClickSteps = (detail: number) => detail > 0 && detail % 2 === 0 ? 9 : 1;

function Field({ label, value, onChange, type = "text", ...attributes }: {
  label: string; value: string; onChange(value: string): void; type?: string; min?: string; max?: string;
}) {
  return <label className="ct-sim-field"><span>{label}</span><input aria-label={label} type={type} value={value}
    inputMode={type === "text" ? "decimal" : undefined} onChange={event => onChange(event.target.value)} {...attributes} /></label>;
}

function EditableLegValue({ label, value, onChange, options, className = "", formatValue = formatOptionNumber, valueDescription, inputMode = "decimal" }: {
  label: string; value: string; onChange(value: string): void;
  options?: readonly (readonly [string, string])[]; className?: string;
  formatValue?(value: number): string;
  valueDescription?: string;
  inputMode?: "decimal" | "text";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const original = useRef(value);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (editing) {
      control.current?.focus();
      if (control.current instanceof HTMLInputElement) control.current.select();
    } else if (returnFocus.current) {
      returnFocus.current = false; button.current?.focus();
    }
  }, [editing]);
  const display = options ? options.find(([key]) => key === value)?.[1] ?? value
    : value.trim() === "" ? "—" : Number.isFinite(numeric(value)) ? formatValue(numeric(value)) : value;
  const finish = (focus: boolean) => { returnFocus.current = focus; setEditing(false); };
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    if (event.key === "Enter" && event.target instanceof HTMLButtonElement) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") onChange(original.current);
    finish(true);
  };
  return <span className={`ct-sim-editable ${className}`} onKeyDown={editing ? keyDown : undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) finish(false); }}>
    {editing ? options ? <select ref={node => { control.current = node; }} data-ct-inline-editor aria-label={label} value={draft}
      onChange={event => { setDraft(event.target.value); onChange(event.target.value); }}>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select> : <input ref={node => { control.current = node; }} data-ct-inline-editor aria-label={label} value={draft} inputMode={inputMode}
      onChange={event => { setDraft(event.target.value); onChange(event.target.value); }} />
      : <button ref={button} type="button" className="ct-sim-cell-value" aria-label={`Editar ${label}`} aria-description={`Valor actual: ${valueDescription ?? display}`}
        title={`${label}: ${valueDescription ?? display} · Clic para editar`} onClick={() => { original.current = value; setDraft(value); setEditing(true); }}>{display}</button>}

  </span>;
}

function StrategyPriceControl({ input, market, entry, maxProfit, maxLoss, onChange }: {
  input: Simulation; market?: StrikeMarket; entry?: number; maxProfit?: number; maxLoss?: number; onChange(position: number): void;
}) {
  const references = useMemo(() => strategyPriceReferences(input, market), [input, market]);
  const total = references.ok ? references.currentTotal : entry;
  const span = references.ok ? references.natural.total - references.opposite.total : 0;
  const position = references.ok && total !== undefined && span > 0 ? (references.natural.total - total) / span : 0;
  const text = (amount: number | undefined) => amount === undefined ? "—" : `${amount < 0 ? "Crédito" : amount > 0 ? "Débito" : "Neutra"} ${fmt(Math.abs(amount))} ${input.currency}`;
  const compactText = (amount: number | undefined) => amount === undefined ? "—" : `${fmt(Math.abs(amount))} ${amount < 0 ? "cr" : amount > 0 ? "db" : "neutro"}`;
  const marker = Math.max(0, Math.min(100, position * 100));
  const tone = total === undefined || total === 0 ? "var(--sim-muted)" : total < 0 ? "var(--sim-profit)" : "var(--sim-loss)";
  const costs = numeric(input.costs);
  const credit = references.ok && references.natural.total - costs < 0 && references.opposite.total - costs < 0;
  const debit = references.ok && references.natural.total - costs > 0 && references.opposite.total - costs > 0;
  return <section className="ct-sim-strategy-price" aria-label="Precio total de entrada de la estrategia">
    <header><strong aria-label="Crédito o débito de la estrategia" title="Precio total de entrada">{text(total)}</strong>
      {([ ["profit", "Ganancia", maxProfit], ["loss", "Pérdida", maxLoss] ] as const).map(([kind, label, amount]) =>
        <div key={kind} className={`ct-sim-max-${kind}`} aria-label={`${label} máxima del armado al vencimiento`}><span>{label} máx.</span>
          <strong title={amount === Infinity ? `${label} ilimitada` : `${label} máxima al vencimiento`}>
            {amount === undefined ? "—" : amount === Infinity ? "∞" : `${fmt(amount)} ${input.currency}`}</strong></div>)}</header>
    <div className="ct-sim-price-bar" style={{ "--ct-entry-color": tone } as React.CSSProperties}>
      <div className="ct-sim-price-rail" aria-hidden="true"><i style={{ left: `${Math.min(50, marker)}%`, width: `${total === undefined || !references.ok ? 0 : Math.abs(marker - 50)}%` }} />
        <b /><b /><b /></div>
      <input type="range" aria-label="Precio de entrada de la estrategia" min="0" max="100" step="1" disabled={!references.ok || span <= 0}
        value={marker} aria-valuetext={text(total)} onChange={event => onChange(Number(event.target.value) / 100)} />
      {([ ["natural", "Natural", 0], ["mid", "Mid", .5], ["opposite", "Opuesto", 1] ] as const).map(([key, label, value]) => {
        const amount = references.ok ? references[key].total : undefined;
        const caption = key === "mid" ? "MID" : key === "natural" ? credit ? "BID (NAT)" : debit ? "ASK (NAT)" : "NATURAL"
          : credit ? "ASK (OPP)" : debit ? "BID (OPP)" : "OPUESTO";
        return <button key={key} type="button" aria-label={`Tomar precio ${label} de la estrategia`} aria-description={text(amount)} disabled={!references.ok}
          aria-pressed={references.ok && total !== undefined && Math.abs(position - value) < 1e-8}
          title={`${label}: ${text(amount)}`} onClick={() => onChange(value)}><span>{caption}</span><strong>{compactText(amount)}</strong></button>;
      })}
    </div>
    {!references.ok && <p className="ct-sim-hint" role="status">{references.reason}</p>}
    {references.ok && total !== undefined && (position < -1e-8 || position > 1 + 1e-8) && <p className="ct-sim-hint">La entrada fijada está fuera de las referencias actuales.</p>}
    {numeric(input.costs) > 0 && <p className="ct-sim-hint">Incluye gastos de entrada: {fmt(numeric(input.costs))} {input.currency}.</p>}
  </section>;
}

function ScenarioButtons({ label, value, options, onChange, numericValues = false }: {
  label: string; value: string; options: { label: string; value: string; detail: string; disabled?: boolean }[];
  onChange(value: string): void; numericValues?: boolean;
}) {
  const selected = options.findIndex(option => numericValues ? Math.abs(numeric(value) - numeric(option.value)) < 1e-8 : value === option.value);
  return <fieldset className="ct-sim-scenario-buttons"><legend>{label}</legend><div>
    {options.map((option, index) => <button key={option.label} type="button" aria-label={`${label} ${option.label} (${option.detail})`}
      aria-pressed={selected === index} disabled={option.disabled} onClick={() => onChange(option.value)}>
      {option.label}<small>{option.detail}</small>
    </button>)}
  </div></fieldset>;
}

function ResultsChart({ strategy, currency, scenarioDate, selectedPrice, onPriceChange, compact = false }: {
  strategy: Strategy; currency: string; scenarioDate: string; selectedPrice: number; onPriceChange(price: number): void;
  compact?: boolean;
}) {
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => curve(strategy), [strategy]);
  const deviations = useMemo(() => standardDeviationLevels(strategy), [strategy]);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const chart = svg.current;
    if (!chart) return;
    const resize = (measured: number) => { if (measured > 0) setWidth(Math.max(260, Math.round(measured))); };
    resize(chart.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => resize(entries[0].contentRect.width));
    observer.observe(chart); return () => observer.disconnect();
  }, []);
  const clamp = (value: number) => Math.max(strategy.rangeMin, Math.min(strategy.rangeMax, value));
  const price = selectedPrice;
  const cursorVisible = price >= strategy.rangeMin && price <= strategy.rangeMax;
  const height = compact ? 190 : 340, left = width < 500 ? 64 : 92, right = width < 500 ? 12 : 24, top = compact ? 20 : 26, bottom = compact ? 26 : 48;
  const hasTheory = strategy.years === 0 || strategy.legs.every(leg => Number.isFinite(leg.volatility));
  const values = points.flatMap(point => hasTheory ? [point.expiry, point.theoretical] : [point.expiry]);
  const expiryResult = resultAt(strategy, price, "expiry"), theoreticalResult = resultAt(strategy, price, "theoretical");
  if ([...values, expiryResult, ...(hasTheory ? [theoreticalResult] : [])].some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    return <p role="alert">El resultado supera la precisión admitida. Reducí cantidades, plazo o tasas.</p>;
  const minValue = Math.min(0, ...values), maxValue = Math.max(0, ...values);
  const padding = Math.max(1, (maxValue - minValue) * .1);
  const low = minValue - padding, high = maxValue + padding;
  const x = (value: number) => left + (value - strategy.rangeMin) / (strategy.rangeMax - strategy.rangeMin) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const zeroOffset = (y(0) - top) / (height - top - bottom);
  const pnlGradientId = `${gradientId}-pnl`;
  const path = (mode: "expiry" | "theoretical") => points.map((point, index) => `${index ? "L" : "M"}${x(point.price)},${y(point[mode])}`).join(" ");
  const area = `${path("expiry")} L${x(strategy.rangeMax)},${y(0)} L${x(strategy.rangeMin)},${y(0)} Z`;
  const pointerPrice = (event: { currentTarget: SVGSVGElement; clientX: number }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp(strategy.rangeMin + ((event.clientX - rect.left) / rect.width * width - left) / (width - left - right) * (strategy.rangeMax - strategy.rangeMin));
  };
  return <>
    <div className="ct-sim-legend"><span><i className="ct-sim-expiry-key" /> {compact ? "Vencimiento" : "Al vencimiento"}</span>
      {hasTheory && <span title={`Teórico · ${scenarioDate}`}><i className="ct-sim-theory-key" /> {compact ? "Teórico" : `Teórico · ${scenarioDate}`}</span>}
      {!compact && deviations && deviations.move > 0 && <><span><i className="ct-sim-sigma-one-key" /> ±1σ</span><span><i className="ct-sim-sigma-two-key" /> ±2σ</span></>}</div>
    {!hasTheory && <p role="status" className="ct-sim-hint">{compact ? "Teórico no disponible: falta VI." : "Teórico no disponible: completá la VI de cada pata en Análisis → VI por pata. El resultado al vencimiento no necesita VI."}</p>}
    <svg ref={svg} className="ct-sim-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Resultado de la estrategia según el precio del subyacente"
      onClick={event => onPriceChange(pointerPrice(event))}>
      <title>Resultado total en {currency}. Línea continua al vencimiento y línea punteada teórica.</title>
      <desc>Verde indica ganancia y rojo pérdida respecto del eje cero. La curva continua es al vencimiento y la punteada es teórica. Hacé clic o tocá el gráfico para fijar un precio; también podés editar Precio del escenario en Análisis.</desc>
      <defs>
        <linearGradient id={pnlGradientId} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={height - bottom}>
          <stop offset="0" stopColor="var(--sim-profit)" /><stop offset={zeroOffset} stopColor="var(--sim-profit)" />
          <stop offset={zeroOffset} stopColor="var(--sim-loss)" /><stop offset="1" stopColor="var(--sim-loss)" />
        </linearGradient>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={height - bottom}>
          <stop offset="0" stopColor="var(--sim-profit)" stopOpacity=".2" /><stop offset={zeroOffset} stopColor="var(--sim-profit)" stopOpacity=".03" />
          <stop offset={zeroOffset} stopColor="var(--sim-loss)" stopOpacity=".03" /><stop offset="1" stopColor="var(--sim-loss)" stopOpacity=".2" />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }, (_, index) => {
        const value = low + (high - low) * index / 4;
        return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="ct-sim-grid" />
          {Math.abs(y(value) - y(0)) > 12 && <text x={left - 10} y={y(value) + 4} textAnchor="end">{fmt(value)}</text>}</g>;
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="ct-sim-zero" />
      <text className="ct-sim-zero-label" x={left - 10} y={y(0) + 4} textAnchor="end">0</text>
      {deviations && deviations.move > 0 && deviations.levels.filter(level => level.price >= strategy.rangeMin && level.price <= strategy.rangeMax).map(level =>
        <g key={level.sigma} className={`ct-sim-sigma ct-sim-sigma-${Math.abs(level.sigma)}`} aria-label={`${level.sigma > 0 ? "+" : ""}${level.sigma}σ: ${fmt(level.price)} ${currency}`}>
          <title>{level.sigma > 0 ? "+" : ""}{level.sigma}σ: {fmt(level.price)} {currency}</title>
          <line x1={x(level.price)} x2={x(level.price)} y1={top} y2={height - bottom} />
          <text x={Math.max(left + 13, Math.min(width - right - 13, x(level.price)))} y={top + (Math.abs(level.sigma) === 1 ? 11 : 24)} textAnchor="middle">{level.sigma > 0 ? "+" : ""}{level.sigma}σ</text>
        </g>)}
      {strategy.spot >= strategy.rangeMin && strategy.spot <= strategy.rangeMax && <line x1={x(strategy.spot)} x2={x(strategy.spot)} y1={top} y2={height - bottom} className="ct-sim-spot" />}
      {Array.from({ length: 5 }, (_, index) => {
        const value = strategy.rangeMin + (strategy.rangeMax - strategy.rangeMin) * index / 4;
        return <text key={index} x={x(value)} y={height - (compact ? 7 : 24)} textAnchor="middle">{fmt(value)}</text>;
      })}
      <path d={path("expiry")} className="ct-sim-expiry-line" stroke={`url(#${pnlGradientId})`} />
      {hasTheory && <path d={path("theoretical")} className="ct-sim-theory-line" stroke={`url(#${pnlGradientId})`} />}
      {cursorVisible && <><line x1={x(price)} x2={x(price)} y1={top} y2={height - bottom} className="ct-sim-cursor" />
      <circle cx={x(price)} cy={y(expiryResult)} r="4" className="ct-sim-expiry-dot" fill={expiryResult >= 0 ? "var(--sim-profit)" : "var(--sim-loss)"} />
      {hasTheory && <circle cx={x(price)} cy={y(theoreticalResult)} r="4" className="ct-sim-theory-dot" fill={theoreticalResult >= 0 ? "var(--sim-profit)" : "var(--sim-loss)"} />}</>}
      <text x={left} y="14">{compact ? currency : `Resultado · ${currency}`}</text>
      {!compact && <text x={(width + left - right) / 2} y={height - 3} textAnchor="middle">Precio del subyacente · {currency}</text>}
    </svg>
    {!compact && <div className="ct-sim-deviations" aria-label="Referencias de desvío estándar">
      {!deviations ? <span>Desvíos no disponibles: completá la VI de las patas más cercanas al subyacente.</span> : <>
        <span title={`VI promedio por tipo y strike entre las patas más cercanas: ${deviations.strikes.map(fmt).join(" / ")}. Incluye el cambio de VI del escenario. Aproximación: precio de referencia × VI × raíz(días/365).`}>
          Desvíos aprox. · VI ref. {formatOptionVolatility(deviations.volatility * 100)} % · {Math.round(strategy.years * 365)} días restantes</span>
        {([1, 2] as const).map(sigma => <span key={sigma} className={`ct-sim-sigma-${sigma}`}>±{sigma}σ: {fmt(strategy.spot - sigma * deviations.move)} / {fmt(strategy.spot + sigma * deviations.move)} {currency}</span>)}
        {deviations.move === 0 && <span>Los niveles coinciden con el precio de referencia.</span>}
        {deviations.levels.some(level => level.price < strategy.rangeMin || level.price > strategy.rangeMax) && <span>Hay niveles σ fuera del rango visible.</span>}
      </>}
    </div>}
    <div className="ct-sim-inspect">
      <div className="ct-sim-selected-price"><span>{compact ? "Precio" : "Precio fijado"}</span><strong aria-label="Precio fijado">{fmt(price)} {currency}</strong></div>
      <div><span>Al vencimiento</span><output className={expiryResult >= 0 ? "ct-sim-profit" : "ct-sim-loss"}>{fmt(expiryResult)} {currency}</output></div>
      <div title={`Teórico · ${scenarioDate}`}><span>{compact ? "Teórico" : `Teórico · ${scenarioDate}`}</span><output className={theoreticalResult >= 0 ? "ct-sim-profit" : "ct-sim-loss"}>{hasTheory ? `${fmt(theoreticalResult)} ${currency}` : "Sin VI"}</output></div>
    </div>
    {!cursorVisible && <p className="ct-sim-hint">El precio evaluado está fuera del rango visible. Ampliá el rango para ubicarlo en el gráfico.</p>}
    {!compact && <p className="ct-sim-hint">Hacé clic o tocá el gráfico para fijar otro precio. La línea vertical punteada marca el precio de referencia.</p>}
  </>;
}

export default function OptionsSimulator({ active = true }: { active?: boolean }) {
  const [view, setView] = useState<"build" | "analysis">("build");
  const [scenarioPoint, setScenarioPoint] = useState<{ context: string; price: string }>();
  const viewport = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState<Simulation>(() => ({ ...initialSimulation(), underlying: "", spot: "", legs: [] }));
  const [status, setStatus] = useState("");
  const [strikeMarket, setStrikeMarket] = useState<StrikeMarket>();
  const menusId = useId();
  const nextId = useRef(3);
  const parsed = useMemo(() => parseSimulation(input), [input]);
  const summary = parsed.ok ? expirySummary(parsed.strategy) : undefined;
  const days = dateDay(input.expiry) - dateDay(input.valuationDate);
  const elapsed = dateDay(input.scenarioDate) - dateDay(input.valuationDate);
  const datesValid = Number.isFinite(days) && days >= 0 && days <= 3650 && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= days;
  const baseDatesValid = Number.isFinite(days) && days >= 0 && days <= 3650;
  const scenarioContext = JSON.stringify([input.underlying, input.currency, input.expiry, input.spot]);
  const scenarioPrice = scenarioPoint?.context === scenarioContext ? scenarioPoint.price : input.spot;
  const selectedPrice = numeric(scenarioPrice), spot = numeric(input.spot);
  const priceTarget = (factor: number) => Number((spot * factor).toPrecision(15));
  const scenarioPriceValid = Number.isFinite(selectedPrice) && selectedPrice >= 0 && selectedPrice <= 1e9;
  const setScenarioPrice = (price: string) => setScenarioPoint({ context: scenarioContext, price });
  function changeView(next: "build" | "analysis") {
    setView(next);
    if (viewport.current) {
      viewport.current.scrollTop = 0;
    }
  }
  function update(key: keyof Omit<Simulation, "legs">, value: string) {
    setStatus(""); setInput(current => ({ ...current, [key]: value }));
  }
  function updateLeg(id: number, key: keyof Leg, value: string) {
    setStatus(""); setInput(current => ({ ...current, legs: current.legs.map(leg => leg.id === id ? { ...leg, [key]: value } : leg) }));
  }
  function updateQuantity(id: number, value: string) {
    const signed = value.trim().replace(/^−/, "-");
    const contracts = signed.replace(/^[+-]/, "");
    setStatus("");
    setInput(current => ({ ...current, legs: current.legs.map(leg => leg.id === id ? {
      ...leg, contracts, side: numeric(contracts) > 0 ? signed.startsWith("-") ? "sell" : "buy" : leg.side,
    } : leg) }));
  }
  function stepQuantity(id: number, direction: -1 | 1, steps: number) {
    setStatus("");
    setInput(current => ({ ...current, legs: current.legs.map(leg => {
      if (leg.id !== id) return leg;
      const result = adjustStrategyQuantity([leg], direction, steps);
      return result.ok ? result.legs[0] : leg;
    }) }));
  }
  function adjust(kind: "strike" | "quantity", direction: -1 | 1, steps = 1) {
    setInput(current => {
      const result = kind === "strike" ? shiftStrategyStrikes(current, direction, strikeMarket) : adjustStrategyQuantity(current.legs, direction, steps);
      return result.ok ? { ...current, legs: result.legs } : current;
    });
    setStatus(kind === "quantity" ? "Cantidades ajustadas conservando las proporciones de todas las patas."
      : input.legs.some(leg => leg.securityId) ? "Strikes desplazados a bases contiguas. Primas y VI copiadas de esta lectura."
      : "Strikes manuales desplazados un punto; primas y VI conservadas.");
  }
  function changeEntryPrice(position: number) {
    setStatus("");
    setInput(current => {
      const result = setStrategyPrice(current, position, strikeMarket);
      return result.ok ? { ...current, legs: result.legs } : current;
    });
  }
  const money = (value: number) => `${fmt(value)} ${input.currency}`;
  const chart = !input.legs.length ? <p>Armá una estrategia para ver su resultado al vencimiento y teórico.</p>
    : !parsed.ok ? <div className="ct-sim-errors" role="alert"><p>Revisá los datos para calcular:</p><ul>{parsed.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>
    : !scenarioPriceValid ? <p role="alert">Ingresá un precio de escenario válido entre 0 y 1000000000.</p>
    : <ResultsChart strategy={parsed.strategy} currency={input.currency} scenarioDate={input.scenarioDate} selectedPrice={selectedPrice}
      onPriceChange={price => setScenarioPrice(formatOptionInput(price))} compact={view === "build"} />;
  return <div ref={viewport} className="ct-sim" aria-label="Simulador de opciones">
    <div className="ct-sim-topbar"><header className="ct-sim-heading"><h2>Simulador de opciones</h2><span className="ct-sim-badge">Solo simulación</span></header>
    <div className="ct-sim-view-tabs" role="tablist" aria-label="Armado y análisis" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "build" : event.key === "End" ? "analysis" : view === "build" ? "analysis" : "build";
      changeView(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus();
    }}>{([ ["build", "Armado"], ["analysis", "Análisis"] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" data-view={key}
      id={`${menusId}-${key}-tab`} aria-controls={`${menusId}-${key}-panel`} aria-selected={view === key} tabIndex={view === key ? 0 : -1} onClick={() => changeView(key)}>{label}</button>)}</div>
    </div>
    {status && <p role="status" className="ct-sim-status">{status}</p>}
    <div id={`${menusId}-build-panel`} role="tabpanel" aria-labelledby={`${menusId}-build-tab`} hidden={view !== "build"} className="ct-sim-market-layout"><MarketChain active={active && view === "build"} input={input} setInput={setInput} onStrikeMarket={setStrikeMarket} />
    <div className="ct-sim-build-summary"><section key={view} className="ct-sim-card ct-sim-legs-card"><div className="ct-sim-leg-toolbar"><h3>Patas</h3>
      <div className="ct-sim-quick-adjustments" aria-label="Ajustar toda la estrategia">{([ ["strike", "Strike"], ["quantity", "Cantidad"] ] as const).map(([kind, label]) =>
        <div key={kind} className="ct-sim-adjustment-group" role="group" aria-label={label}><span>{kind === "quantity" ? "Cant." : label}</span><div>{([-1, 1] as const).map(direction => {
          const result = kind === "strike" ? shiftStrategyStrikes(input, direction, strikeMarket) : adjustStrategyQuantity(input.legs, direction);
          const action = `${direction < 0 ? "Bajar" : "Subir"} ${kind === "strike" ? "strikes" : "cantidades"} de toda la estrategia`;
          return <button key={direction} type="button" aria-label={action} disabled={!result.ok} onClick={event => adjust(kind, direction, kind === "quantity" ? quantityClickSteps(event.detail) : 1)}
            title={result.ok ? kind === "strike" ? input.legs.some(leg => leg.securityId) ? "Base contigua por pata; copia prima y VI del destino" : "Paso manual de un punto; conserva prima y VI"
              : "Clic: 1 unidad de proporción · Doble clic: 10 · Conserva las relaciones entre patas" : result.reason}>{kind === "quantity" ? direction < 0 ? "−" : "+" : direction < 0 ? "↓" : "↑"}</button>;
        })}</div></div>)}</div>
      <button type="button" className="ct-sim-clear-legs" aria-label="Limpiar patas" onClick={() => { setInput(current => ({ ...current, legs: [] })); setStatus(""); }}>Limpiar</button></div>
      <div className="ct-sim-table-scroll"><table aria-label="Patas simuladas con strike, cantidad y prima por unidad">
        <colgroup><col className="ct-sim-leg-kind" /><col className="ct-sim-leg-quantity" /><col className="ct-sim-leg-date" /><col className="ct-sim-leg-days" /><col /><col className="ct-sim-leg-remove" /></colgroup>
        <thead><tr><th>Tipo</th><th title="Cantidad positiva: compra. Cantidad negativa: venta.">Cant.</th><th>Venc.</th><th>Días</th><th>Strike</th><th><span className="ct-sim-sr">Acciones</span></th></tr></thead>
        <tbody>{input.legs.map((leg, index) => <tr key={leg.id}>
          <td><span className={`ct-sim-kind-chip ct-sim-kind-${leg.kind}`}>
            {leg.securityId ? <abbr title={leg.kind === "call" ? "Call" : "Put"}>{leg.kind === "call" ? "C" : "P"}</abbr>
              : <EditableLegValue label={`Tipo pata ${index + 1}`} value={leg.kind} options={[["call", "C"], ["put", "P"]]}
                valueDescription={leg.kind === "call" ? "Call" : "Put"} onChange={value => updateLeg(leg.id, "kind", value)} />}
          </span></td>
          <td><div className="ct-sim-quantity-stepper">
            <button type="button" className="ct-sim-quantity-step" aria-label={`Reducir contratos pata ${index + 1}`} disabled={!adjustStrategyQuantity([leg], -1).ok}
              title="Clic: quitar 1 · Doble clic: quitar 10 · Conserva compra/venta" onClick={event => { event.currentTarget.focus(); stepQuantity(leg.id, -1, quantityClickSteps(event.detail)); }}>−</button>
            <EditableLegValue label={`Contratos pata ${index + 1}`} value={leg.contracts === "" ? "" : `${leg.side === "sell" ? "-" : ""}${leg.contracts}`}
            formatValue={value => `${value < 0 ? "−" : "+"}${formatOptionNumber(Math.abs(value))}`}
            valueDescription={`${leg.side === "buy" ? "Compra" : "Venta"} · ${leg.contracts} contratos`}
            className={leg.side === "buy" ? "ct-sim-buy" : "ct-sim-sell"} inputMode="text" onChange={value => updateQuantity(leg.id, value)} />
            <button type="button" className="ct-sim-quantity-step" aria-label={`Aumentar contratos pata ${index + 1}`} disabled={!adjustStrategyQuantity([leg], 1).ok}
              title="Clic: agregar 1 · Doble clic: agregar 10 · Conserva compra/venta" onClick={event => { event.currentTarget.focus(); stepQuantity(leg.id, 1, quantityClickSteps(event.detail)); }}>+</button>
          </div></td>
          <td className="ct-sim-leg-expiry-date" title={`Vencimiento ${input.expiry}`}>{formatOptionExpiry(input.expiry)}</td>
          <td className="ct-sim-leg-expiry" title={`Días calendario desde hoy · Vencimiento ${input.expiry}`}>{formatExpiryDays(daysToExpiry(input.expiry))}</td>
          <th scope="row">
            {leg.securityId ? <span className="ct-sim-leg-strike" aria-label={`Strike pata ${index + 1}`}>{formatOptionNumber(numeric(leg.strike))}</span>
              : <EditableLegValue label={`Strike pata ${index + 1}`} value={leg.strike} onChange={value => updateLeg(leg.id, "strike", value)} />}
          </th>
          <td><button type="button" className="ct-sim-remove-leg" aria-label={`Quitar pata ${index + 1}`} onClick={() => { setInput(current => ({ ...current, legs: current.legs.filter(item => item.id !== leg.id) })); setStatus(""); }}>×</button></td>
        </tr>)}</tbody></table></div>
      {!input.legs.length && <p>Seleccioná precios de la cadena. BID simula venta; ASK simula compra.</p>}
      <div className="ct-sim-legs-footer"><button type="button" disabled={input.legs.length >= MAX_LEGS} onClick={() => {
        setInput(current => ({ ...current, legs: [...current.legs, newLeg(Math.max(nextId.current++, ...current.legs.map(leg => leg.id + 1)), numeric(current.spot) > 0 ? numeric(current.spot) : 100)] })); setStatus("");
      }}>+ Pata manual</button><small>+ compra · − venta</small></div>
      {!!input.legs.length && <StrategyPriceControl input={input} market={strikeMarket} entry={summary?.entry} maxProfit={summary?.maxProfit} maxLoss={summary?.maxLoss} onChange={changeEntryPrice} />}
    </section>
    {view === "build" && <section className="ct-sim-card ct-sim-quick-results" aria-label="Resultado rápido del armado">
      <div className="ct-sim-section-heading"><h3>Resultado rápido</h3><button type="button" title={`Supuestos: ${input.scenarioDate} · Cambio de VI ${formatOptionVolatility(numeric(input.volatilityShift))} pp`} onClick={() => changeView("analysis")}>Análisis →</button></div>
      {chart}
    </section>}</div></div>
    <div id={`${menusId}-analysis-panel`} role="tabpanel" aria-labelledby={`${menusId}-analysis-tab`} hidden={view !== "analysis"} className="ct-sim-analysis-panel">
    <div className="ct-sim-analysis"><section className="ct-sim-card ct-sim-scenario"><h3>Escenarios</h3>
      <div className="ct-sim-scenario-group"><ScenarioButtons label="Precio" value={scenarioPrice} numericValues options={[
        { label: "Baja", value: formatOptionInput(priceTarget(.9)), detail: "−10 %", disabled: !Number.isFinite(spot) || spot <= 0 },
        { label: "Mantiene", value: input.spot, detail: "0 %", disabled: !Number.isFinite(spot) || spot <= 0 },
        { label: "Sube", value: formatOptionInput(priceTarget(1.1)), detail: "+10 %", disabled: !Number.isFinite(spot) || spot <= 0 || priceTarget(1.1) > 1e9 },
      ]} onChange={setScenarioPrice} />
      <Field label="Precio del escenario" value={scenarioPrice} onChange={setScenarioPrice} /></div>
      <div className="ct-sim-scenario-group"><ScenarioButtons label="VI" value={input.volatilityShift} numericValues options={[
        { label: "Baja", value: "-5", detail: "−5 pp" }, { label: "Mantiene", value: "0", detail: "0 pp" }, { label: "Sube", value: "5", detail: "+5 pp" },
      ].map(option => ({ ...option, disabled: input.legs.some(leg => Number.isFinite(numeric(leg.volatility)) && (numeric(leg.volatility) + Number(option.value) < 0 || numeric(leg.volatility) + Number(option.value) > 500)) }))}
        onChange={value => update("volatilityShift", value)} />
      <Field label="Cambio de VI (puntos porcentuales)" value={input.volatilityShift} onChange={value => update("volatilityShift", value)} />
      <details className="ct-sim-leg-volatilities"><summary>VI por pata</summary>{input.legs.map((leg, index) => <div key={leg.id}>
        <span>{leg.side === "buy" ? "+" : "−"} {leg.kind === "call" ? "C" : "P"} {formatOptionNumber(numeric(leg.strike))}</span>
        <EditableLegValue label={`VI pata ${index + 1}`} value={leg.volatility} formatValue={formatOptionVolatility} onChange={value => updateLeg(leg.id, "volatility", value)} /><span>%</span>
      </div>)}</details>
      <p className="ct-sim-hint">Se suma a la VI de cada pata. +5 lleva 40% a 45%.</p></div>
      <div className="ct-sim-scenario-group"><ScenarioButtons label="Fecha" value={input.scenarioDate} options={!baseDatesValid ? [] : days === 0 ? [
        { label: "Vencimiento", value: input.expiry, detail: "0 días" },
      ] : [ { label: "Entrada", value: input.valuationDate, detail: "Inicio" },
        ...(days > 1 ? [{ label: "Mitad", value: addDays(input.valuationDate, Math.floor(days / 2)), detail: `${Math.floor(days / 2)} días` }] : []),
        { label: "Vencimiento", value: input.expiry, detail: `${days} días` },
      ]} onChange={value => update("scenarioDate", value)} />
      <Field label="Fecha teórica" type="date" value={input.scenarioDate} min={input.valuationDate} max={input.expiry} onChange={value => update("scenarioDate", value)} />
      {datesValid && <label className="ct-sim-field"><span>{days - elapsed} días al vencimiento</span><input aria-label="Avanzar fecha teórica" type="range" min="0" max={Math.max(1, days)} step="1" disabled={days === 0} value={elapsed}
        onChange={event => update("scenarioDate", addDays(input.valuationDate, Number(event.target.value)))} /></label>}</div>
      <details className="ct-sim-scenario-advanced"><summary>Más supuestos y rango</summary>
      <label className="ct-sim-field"><span>Subyacente</span><input aria-label="Subyacente manual" value={input.underlying} maxLength={40} onChange={event => update("underlying", event.target.value)} /></label>
      <label className="ct-sim-field"><span>Moneda común</span><select value={input.currency} onChange={event => update("currency", event.target.value)}><option>ARS</option><option>USD</option></select></label>
      <Field label="Precio de referencia" value={input.spot} onChange={value => update("spot", value)} />
      <Field label="Fecha de entrada" type="date" value={input.valuationDate} onChange={value => update("valuationDate", value)} />
      <Field label="Vencimiento" type="date" value={input.expiry} min={input.valuationDate} onChange={value => update("expiry", value)} />
      <Field label="Factor monetario por contrato" value={input.multiplier} onChange={value => update("multiplier", value)} />
      <Field label="Gastos de entrada totales" value={input.costs} onChange={value => update("costs", value)} />
      <details key={`${view}-${active}`} className="ct-sim-leg-prices"><summary>Precios de entrada por pata</summary>{input.legs.map((leg, index) => <div key={leg.id}>
        <span>{leg.side === "buy" ? "+" : "−"} {leg.kind === "call" ? "C" : "P"} {formatOptionNumber(numeric(leg.strike))}</span>
        <EditableLegValue label={`Prima pata ${index + 1}`} value={leg.premium} onChange={value => updateLeg(leg.id, "premium", value)} />
      </div>)}</details>
      <Field label="Tasa anual continua %" value={input.rate} onChange={value => update("rate", value)} />
      <Field label="Dividendos anuales continuos %" value={input.dividendYield} onChange={value => update("dividendYield", value)} />
      <h4>Rango del gráfico</h4><Field label="Precio mínimo" value={input.rangeMin} onChange={value => update("rangeMin", value)} />
      <Field label="Precio máximo" value={input.rangeMax} onChange={value => update("rangeMax", value)} />
      </details>
    </section><section className="ct-sim-card ct-sim-results" aria-label="Resultados de la simulación"><div className="ct-sim-section-heading"><h3>{input.underlying || "Sin selección"} · {input.expiry} · {input.legs.length} patas</h3><button type="button" onClick={() => changeView("build")}>Editar armado</button></div>
      <div className="ct-sim-strategy-summary" aria-label="Patas analizadas">{input.legs.map(leg => <span key={leg.id} className={leg.side === "buy" ? "ct-sim-buy" : "ct-sim-sell"}>
        {leg.side === "buy" ? "Compra" : "Venta"} {leg.contracts}× {leg.symbol ?? `${leg.kind === "call" ? "Call" : "Put"} ${leg.strike}`}
      </span>)}</div>
      {(!parsed.ok || !summary) ? view === "analysis" && chart : <>
        <div className="ct-sim-metrics">
          <div><span>{summary.entry < 0 ? "Crédito inicial neto" : "Débito inicial total"}</span><strong>{money(Math.abs(summary.entry))}</strong></div>
          <div><span>Ganancia máxima al vencimiento</span><strong className="ct-sim-profit" title={summary.maxProfit === Infinity ? "Ganancia ilimitada" : undefined}>{summary.maxProfit === Infinity ? "∞" : money(summary.maxProfit)}</strong></div>
          <div><span>Pérdida máxima al vencimiento</span><strong className="ct-sim-loss" title={summary.maxLoss === Infinity ? "Pérdida ilimitada" : undefined}>{summary.maxLoss === Infinity ? "∞" : money(summary.maxLoss)}</strong></div>
        </div>
        <p className="ct-sim-equilibria"><span>Equilibrio al vencimiento: </span>{summary.equilibria.length ? summary.equilibria.map(point => point.from === point.to ? fmt(point.from) : `${fmt(point.from)} a ${point.to === Infinity ? "∞" : fmt(point.to)}`).join(" · ") + ` ${input.currency}` : "Sin puntos de equilibrio"}</p>
        {view === "analysis" && chart}
        {(parsed.strategy.legs.some(leg => leg.strike < parsed.strategy.rangeMin || leg.strike > parsed.strategy.rangeMax) || summary.equilibria.some(point => point.from < parsed.strategy.rangeMin || point.from > parsed.strategy.rangeMax)) && <p className="ct-sim-hint">Hay strikes o equilibrios fuera del rango visible. Ampliá el rango para verlos.</p>}
        <p className="ct-sim-hint">Máximos y equilibrios calculados para todo precio del subyacente desde 0 hasta ∞, independientemente del rango visible.</p>
      </>}
    </section></div>
    <details className="ct-sim-card ct-sim-assumptions"><summary>Cómo se calcula y qué supuestos usa</summary>
      <p>Resultado total = suma de (valor de cada opción − prima de entrada) × contratos × unidades por contrato, con signo positivo para compra y negativo para venta, menos los gastos de entrada totales.</p>
      <p>Al vencimiento se usa valor intrínseco. El teórico usa Black–Scholes–Merton europeo, días calendario / 365, tasa y dividendos continuos, y VI constante por pata más el cambio de escenario. Es una estimación: no modela ejercicio anticipado, dividendos en efectivo, garantías, financiación de primas ni gastos de salida o ejercicio.</p>
      <p>La cadena muestra cotizaciones y métricas nativas de Matriz; la hora de lectura local no certifica frescura bursátil. Theta es una estimación BSM por unidad y día calendario; Extrínseco es Mid menos intrínseco. Tasa y dividendos empiezan en 0%, sin representar condiciones actuales. No se infiere VI a partir de primas: si falta, se muestra solo el resultado al vencimiento hasta ingresarla. Cambiar la VI no cambia las primas de entrada.</p>
    </details></div>
  </div>;
}
