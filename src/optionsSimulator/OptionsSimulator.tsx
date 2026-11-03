import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, curve, dateDay, Example, exampleLegs, expirySummary, initialSimulation, Leg, MAX_LEGS,
  newLeg, numeric, parseSimulation, resultAt, Simulation, Strategy } from "./model";
import "./OptionsSimulator.css";
import MarketChain from "./MarketChain";
import { formatOptionNumber } from "./format";
import type { PremiumReference } from "./market";

const storageKey = "OptionsSimulatorStrategiesV1";
const fmt = (value: number) => value.toLocaleString("es-AR", value !== 0 && Math.abs(value) < .01 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 });
const examples: [Example, string][] = [["bull-call", "Bull call spread"], ["bear-put", "Bear put spread"],
  ["straddle", "Straddle comprado"], ["butterfly", "Mariposa de calls"], ["iron-condor", "Iron condor"]];
type Saved = { name: string; simulation: Simulation };

function readSaved(value: unknown): Saved[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw Error("Formato de estrategias guardadas inválido.");
  return value.map(entry => {
    const input = entry?.simulation;
    const keys = Object.keys(initialSimulation()).filter(key => key !== "legs") as (keyof Simulation)[];
    if (typeof entry?.name !== "string" || !entry.name.trim() || entry.name.length > 80 || !input ||
      !keys.every(key => typeof input[key] === "string") || !Array.isArray(input.legs) ||
      !input.legs.every((leg: Leg) => leg && ["strike", "premium", "contracts", "volatility"].every(key => typeof leg[key as keyof Leg] === "string") &&
        Number.isSafeInteger(leg.id) && leg.id > 0 && [leg.securityId, leg.symbol].every(value => value === undefined || typeof value === "string")) || new Set(input.legs.map((leg: Leg) => leg.id)).size !== input.legs.length ||
      !["ARS", "USD"].includes(input.currency) || !parseSimulation(input).ok) throw Error("Hay una estrategia guardada inválida.");
    return { name: entry.name, simulation: input as Simulation };
  });
}

function Field({ label, value, onChange, type = "text", ...attributes }: {
  label: string; value: string; onChange(value: string): void; type?: string; min?: string; max?: string;
}) {
  return <label className="ct-sim-field"><span>{label}</span><input type={type} value={value}
    inputMode={type === "text" ? "decimal" : undefined} onChange={event => onChange(event.target.value)} {...attributes} /></label>;
}

function EditableLegValue({ label, value, onChange, options, references, className = "" }: {
  label: string; value: string; onChange(value: string): void;
  options?: readonly (readonly [string, string])[]; references?: readonly (readonly [string, number])[]; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const original = useRef(value);
  const returnFocus = useRef(false);
  const referencePopup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) {
      control.current?.focus();
      if (control.current instanceof HTMLInputElement) control.current.select();
    } else if (returnFocus.current) {
      returnFocus.current = false; button.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    const popup = referencePopup.current;
    if (!editing || !control.current || !popup || typeof popup.showPopover !== "function") return;
    const position = () => {
      const rect = control.current?.getBoundingClientRect();
      if (!rect) return;
      popup.style.left = `${Math.max(8, Math.min(innerWidth - 268, rect.right - 260))}px`;
      popup.style.top = `${Math.max(8, Math.min(innerHeight - 90, rect.bottom + 4))}px`;
    };
    position();
    popup.showPopover();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
      if (popup.isConnected) popup.hidePopover();
    };
  }, [editing, references?.length]);
  const display = options ? options.find(([key]) => key === value)?.[1] ?? value
    : value.trim() === "" ? "—" : Number.isFinite(numeric(value)) ? formatOptionNumber(numeric(value)) : value;
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
    {editing ? options ? <select ref={node => { control.current = node; }} data-ct-inline-editor aria-label={label} value={value}
      onChange={event => onChange(event.target.value)}>
      {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select> : <input ref={node => { control.current = node; }} data-ct-inline-editor aria-label={label} value={value} inputMode="decimal"
      onChange={event => onChange(event.target.value)} />
      : <button ref={button} type="button" className="ct-sim-cell-value" aria-label={`Editar ${label}`} aria-description={`Valor actual: ${display}`}
        title={`${label}: ${display} · Clic para editar`} onClick={() => { original.current = value; setEditing(true); }}>{display}</button>}
    {editing && !!references?.length && <div ref={referencePopup} popover="manual" data-ct-inline-editor className="ct-sim-premium-references" role="group" aria-label={`Referencias para ${label}`}>
      <span>Prima por unidad · referencia de mercado</span><div>{references.map(([name, price]) => <button key={name} type="button" aria-label={`Tomar ${name} para ${label}`}
        onMouseDown={event => event.preventDefault()} onClick={() => { onChange(String(price)); finish(true); }}>{name}<strong>{formatOptionNumber(price)}</strong></button>)}</div>
    </div>}
  </span>;
}

function ResultsChart({ strategy, currency, scenarioDate }: { strategy: Strategy; currency: string; scenarioDate: string }) {
  const gradientId = useId().replace(/:/g, "");
  const points = useMemo(() => curve(strategy), [strategy]);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [hover, setHover] = useState<number | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(260, Math.round(entries[0].contentRect.width))));
    observer.observe(svg.current); return () => observer.disconnect();
  }, []);
  const clamp = (value: number) => Math.max(strategy.rangeMin, Math.min(strategy.rangeMax, value));
  const price = clamp(hover ?? selected ?? strategy.spot);
  const height = 340, left = width < 500 ? 64 : 92, right = width < 500 ? 12 : 24, top = 26, bottom = 48;
  const hasTheory = strategy.years === 0 || strategy.legs.every(leg => Number.isFinite(leg.volatility));
  const values = points.flatMap(point => hasTheory ? [point.expiry, point.theoretical] : [point.expiry]);
  if (values.some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    return <p role="alert">El resultado teórico supera la precisión admitida. Reducí cantidades, plazo o tasas.</p>;
  const minValue = Math.min(0, ...values), maxValue = Math.max(0, ...values);
  const padding = Math.max(1, (maxValue - minValue) * .1);
  const low = minValue - padding, high = maxValue + padding;
  const x = (value: number) => left + (value - strategy.rangeMin) / (strategy.rangeMax - strategy.rangeMin) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const path = (mode: "expiry" | "theoretical") => points.map((point, index) => `${index ? "L" : "M"}${x(point.price)},${y(point[mode])}`).join(" ");
  const area = `${path("expiry")} L${x(strategy.rangeMax)},${y(0)} L${x(strategy.rangeMin)},${y(0)} Z`;
  const expiryResult = resultAt(strategy, price, "expiry"), theoreticalResult = resultAt(strategy, price, "theoretical");
  const pointerPrice = (event: { currentTarget: SVGSVGElement; clientX: number }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clamp(strategy.rangeMin + ((event.clientX - rect.left) / rect.width * width - left) / (width - left - right) * (strategy.rangeMax - strategy.rangeMin));
  };
  return <>
    <div className="ct-sim-legend"><span><i className="ct-sim-expiry-key" /> Al vencimiento</span>
      {hasTheory && <span><i className="ct-sim-theory-key" /> Teórico · {scenarioDate}</span>}</div>
    {!hasTheory && <p role="status" className="ct-sim-hint">Teórico no disponible: completá la VI de cada pata. El resultado al vencimiento no necesita VI.</p>}
    <svg ref={svg} className="ct-sim-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Resultado de la estrategia según el precio del subyacente"
      onPointerMove={event => { if (event.pointerType === "mouse") setHover(pointerPrice(event)); }} onPointerLeave={() => setHover(undefined)}
      onClick={event => { setHover(undefined); setSelected(pointerPrice(event)); }}>
      <title>Resultado total en {currency}. Línea continua al vencimiento y línea punteada teórica.</title>
      <desc>Usá el control Precio a evaluar debajo del gráfico para consultar ambas curvas con teclado o pantalla táctil.</desc>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--sim-accent)" stopOpacity=".22" /><stop offset="100%" stopColor="var(--sim-accent)" stopOpacity=".02" />
      </linearGradient></defs>
      {Array.from({ length: 5 }, (_, index) => {
        const value = low + (high - low) * index / 4;
        return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="ct-sim-grid" />
          <text x={left - 10} y={y(value) + 4} textAnchor="end">{fmt(value)}</text></g>;
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="ct-sim-zero" />
      {strategy.spot >= strategy.rangeMin && strategy.spot <= strategy.rangeMax && <line x1={x(strategy.spot)} x2={x(strategy.spot)} y1={top} y2={height - bottom} className="ct-sim-spot" />}
      {Array.from({ length: 5 }, (_, index) => {
        const value = strategy.rangeMin + (strategy.rangeMax - strategy.rangeMin) * index / 4;
        return <text key={index} x={x(value)} y={height - 24} textAnchor="middle">{fmt(value)}</text>;
      })}
      <path d={path("expiry")} className="ct-sim-expiry-line" />
      {hasTheory && <path d={path("theoretical")} className="ct-sim-theory-line" />}
      <line x1={x(price)} x2={x(price)} y1={top} y2={height - bottom} className="ct-sim-cursor" />
      <circle cx={x(price)} cy={y(expiryResult)} r="4" className="ct-sim-expiry-dot" />
      {hasTheory && <circle cx={x(price)} cy={y(theoreticalResult)} r="4" className="ct-sim-theory-dot" />}
      <text x={left} y="14">Resultado · {currency}</text>
      <text x={(width + left - right) / 2} y={height - 3} textAnchor="middle">Precio del subyacente · {currency}</text>
    </svg>
    <div className="ct-sim-inspect">
      <label>Precio a evaluar <strong>{fmt(price)} {currency}</strong><input aria-label="Precio a evaluar" type="range"
        min={strategy.rangeMin} max={strategy.rangeMax} step={(strategy.rangeMax - strategy.rangeMin) / 1000}
        value={price} onChange={event => { setHover(undefined); setSelected(Number(event.target.value)); }} /></label>
      <div><span>Al vencimiento</span><output className={expiryResult >= 0 ? "ct-sim-profit" : "ct-sim-loss"}>{fmt(expiryResult)} {currency}</output></div>
      <div><span>Teórico · {scenarioDate}</span><output className={theoreticalResult >= 0 ? "ct-sim-profit" : "ct-sim-loss"}>{hasTheory ? `${fmt(theoreticalResult)} ${currency}` : "Sin VI"}</output></div>
    </div>
    <p className="ct-sim-hint">Pasá el cursor para explorar o hacé clic para fijar un precio. La línea vertical punteada marca el precio de referencia.</p>
  </>;
}

export default function OptionsSimulator({ active = true }: { active?: boolean }) {
  const [input, setInput] = useState<Simulation>(() => ({ ...initialSimulation(), underlying: "", spot: "", legs: [] }));
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [selectedSaved, setSelectedSaved] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [storageError, setStorageError] = useState("");
  const [status, setStatus] = useState("");
  const [premiumReferences, setPremiumReferences] = useState<Record<string, PremiumReference>>({});
  const menusId = useId();
  const nextId = useRef(3);
  const results = useRef<HTMLElement>(null);
  const parsed = useMemo(() => parseSimulation(input), [input]);
  const summary = parsed.ok ? expirySummary(parsed.strategy) : undefined;
  const days = dateDay(input.expiry) - dateDay(input.valuationDate);
  const elapsed = dateDay(input.scenarioDate) - dateDay(input.valuationDate);
  const datesValid = Number.isFinite(days) && days >= 0 && days <= 3650 && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= days;
  useEffect(() => {
    let active = true;
    void chrome.storage.local.get(storageKey).then(result => {
      if (active) setSaved(readSaved(result[storageKey]));
    }).catch(() => { if (active) setStorageError("No se pudieron leer las estrategias guardadas. El simulador sigue disponible."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  function update(key: keyof Omit<Simulation, "legs">, value: string) {
    setStatus(""); setInput(current => ({ ...current, [key]: value }));
  }
  function updateLeg(id: number, key: keyof Leg, value: string) {
    setStatus(""); setInput(current => ({ ...current, legs: current.legs.map(leg => leg.id === id ? { ...leg, [key]: value } : leg) }));
  }
  async function save() {
    if (!parsed.ok || busy || loading || !name.trim()) return;
    setBusy(true); setStatus("");
    try {
      // Re-read before writing so strategies saved from another view are preserved.
      const latest = readSaved((await chrome.storage.local.get(storageKey))[storageKey]);
      const next = [...latest.filter(entry => entry.name !== name.trim()), { name: name.trim(), simulation: input }];
      if (next.length > 20) throw Error("Se pueden guardar hasta 20 estrategias.");
      await chrome.storage.local.set({ [storageKey]: next });
      setSaved(next); setStorageError(""); setSelectedSaved(name.trim()); setStatus("Estrategia guardada en este perfil de Chrome.");
    } catch (error) { setStorageError(error instanceof Error ? error.message : "No se pudo guardar la estrategia."); }
    finally { setBusy(false); }
  }
  const money = (value: number) => `${fmt(value)} ${input.currency}`;
  const referencesFor = (leg: Leg): readonly (readonly [string, number])[] | undefined => {
    const quote = leg.securityId ? premiumReferences[leg.securityId] : undefined;
    return quote ? [["Natural", leg.side === "buy" ? quote.ask : quote.bid], ["MID", (quote.bid + quote.ask) / 2], ["Opuesto", leg.side === "buy" ? quote.bid : quote.ask]] : undefined;
  };
  return <div className="ct-sim" aria-label="Simulador de opciones">
    <div className="ct-sim-topbar"><header className="ct-sim-heading"><h2>Simulador de opciones</h2><span className="ct-sim-badge">Solo simulación</span></header>
    <details className="ct-sim-library-menu" name={`ct-sim-tools-${menusId}`}><summary>Estrategias</summary><div className="ct-sim-library"><label>Ejemplos con datos ficticios <select aria-label="Cargar ejemplo" value="" onChange={event => {
      if (!event.target.value) return;
      const initial = initialSimulation(input.valuationDate && Number.isFinite(dateDay(input.valuationDate)) ? input.valuationDate : undefined);
      const legs = exampleLegs(event.target.value as Example);
      setInput(current => ({ ...initial, expiry: current.expiry, scenarioDate: current.scenarioDate, legs }));
      nextId.current = legs.length + 1; setStatus("Ejemplo cargado: subyacente 100, primas ficticias y 100 unidades por contrato. Reemplazá los datos para tu simulación.");
    }}><option value="">Elegir y reemplazar datos…</option>{examples.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>Estrategias guardadas <select aria-label="Cargar estrategia guardada" value={selectedSaved} disabled={loading || busy} onChange={event => {
        const entry = saved.find(item => item.name === event.target.value);
        if (!entry) { setSelectedSaved(""); return; }
        setInput(entry.simulation); setName(entry.name); setSelectedSaved(entry.name);
        nextId.current = Math.max(...entry.simulation.legs.map(leg => leg.id)) + 1; setStatus("Estrategia cargada.");
      }}><option value="">{loading ? "Cargando…" : "Seleccionar…"}</option>{saved.map(entry => <option key={entry.name}>{entry.name}</option>)}</select></label>
      <label>Nombre de la estrategia <input aria-label="Nombre de la estrategia" value={name} maxLength={80} placeholder="Mi estrategia" onChange={event => setName(event.target.value)} /></label>
      <button type="button" disabled={!parsed.ok || !name.trim() || loading || busy} onClick={() => void save()}>{busy ? "Guardando…" : saved.some(entry => entry.name === name.trim()) ? "Actualizar guardada" : "Guardar estrategia"}</button>
    </div></details>
    <details className="ct-sim-setup-menu" name={`ct-sim-tools-${menusId}`}><summary title="Subyacente, vencimiento, factor y gastos de la simulación">Supuestos</summary><div className="ct-sim-setup-panel"><div className="ct-sim-fields">
      <label className="ct-sim-field"><span>Subyacente</span><input value={input.underlying} maxLength={40} onChange={event => update("underlying", event.target.value)} /></label>
      <label className="ct-sim-field"><span>Moneda común</span><select value={input.currency} onChange={event => update("currency", event.target.value)}><option>ARS</option><option>USD</option></select></label>
      <Field label="Precio de referencia" value={input.spot} onChange={value => update("spot", value)} />
      <Field label="Fecha de entrada" type="date" value={input.valuationDate} onChange={value => update("valuationDate", value)} />
      <Field label="Vencimiento" type="date" value={input.expiry} min={input.valuationDate} onChange={value => update("expiry", value)} />
      <Field label="Factor monetario por contrato" value={input.multiplier} onChange={value => update("multiplier", value)} />
      <Field label="Gastos de entrada totales" value={input.costs} onChange={value => update("costs", value)} />
    </div><p className="ct-sim-hint">Todas las patas comparten subyacente, moneda y vencimiento. Desde la cadena se copia el factor nativo: totalAmountFactor × contractMultiplier × roundLot. Las primas y VI quedan fijas al agregarlas; son referencias de simulación.</p></div></details></div>
    {storageError && <p className="ct-sim-error" role="alert">{storageError}</p>}
    {status && <p role="status" className="ct-sim-status">{status}</p>}
    <div className="ct-sim-market-layout"><MarketChain active={active} input={input} setInput={setInput} onPremiumReferences={setPremiumReferences} />
    <section className="ct-sim-card ct-sim-legs-card"><div className="ct-sim-section-heading"><h3>Patas de la estrategia</h3><button type="button" onClick={() => { setInput(current => ({ ...current, legs: [] })); setStatus(""); }}>Limpiar patas</button></div>
      <div className="ct-sim-table-scroll"><table aria-label="Patas simuladas con primas por unidad y VI anual">
        <colgroup><col className="ct-sim-leg-side" /><col /><col className="ct-sim-leg-quantity" /><col className="ct-sim-leg-premium" /><col className="ct-sim-leg-vi" /><col className="ct-sim-leg-remove" /></colgroup>
        <thead><tr><th>Lado</th><th>Instrumento</th><th title="Contratos por combo">Cant.</th><th>Prima</th><th>VI %</th><th><span className="ct-sim-sr">Acciones</span></th></tr></thead>
        <tbody>{input.legs.map((leg, index) => <tr key={leg.id}>
          <td><EditableLegValue label={`Sentido pata ${index + 1}`} value={leg.side} className={leg.side === "buy" ? "ct-sim-buy" : "ct-sim-sell"}
            options={[["buy", "Compra"], ["sell", "Venta"]]} onChange={value => updateLeg(leg.id, "side", value)} /></td>
          <th scope="row" title={leg.symbol ? `${leg.symbol} · ${leg.kind === "call" ? "Call" : "Put"} ${leg.strike} · Elegí el instrumento desde la cadena` : `Pata manual ${index + 1}`}>
            {leg.securityId ? <span className="ct-sim-leg-symbol">{leg.symbol}</span> : <span className="ct-sim-leg-instrument">
              <EditableLegValue label={`Tipo pata ${index + 1}`} value={leg.kind} options={[["call", "Call"], ["put", "Put"]]} onChange={value => updateLeg(leg.id, "kind", value)} />
              <EditableLegValue label={`Strike pata ${index + 1}`} value={leg.strike} onChange={value => updateLeg(leg.id, "strike", value)} />
            </span>}
          </th>
          {([ ["contracts", "Contratos por combo"], ["premium", "Prima"], ["volatility", "VI"] ] as const).map(([key, label]) => <td key={key}>
            <EditableLegValue label={`${label} pata ${index + 1}`} value={leg[key]} references={key === "premium" ? referencesFor(leg) : undefined} onChange={value => updateLeg(leg.id, key, value)} />
          </td>)}
          <td><button type="button" className="ct-sim-remove-leg" aria-label={`Quitar pata ${index + 1}`} onClick={() => { setInput(current => ({ ...current, legs: current.legs.filter(item => item.id !== leg.id) })); setStatus(""); }}>×</button></td>
        </tr>)}</tbody></table></div>
      {!input.legs.length && <p>Seleccioná precios de la cadena. BID simula venta; ASK simula compra.</p>}
      <div className="ct-sim-legs-footer"><button type="button" disabled={input.legs.length >= MAX_LEGS} onClick={() => {
        setInput(current => ({ ...current, legs: [...current.legs, newLeg(Math.max(nextId.current++, ...current.legs.map(leg => leg.id + 1)), numeric(current.spot) > 0 ? numeric(current.spot) : 100)] })); setStatus("");
      }}>+ Pata manual</button>
      <Field label="Combos simulados" value={input.combos} onChange={value => update("combos", value)} /></div>
      <p className="ct-sim-hint">Clic en un valor para editar · Enter o salir para aceptar · Esc para deshacer. Cantidad por combo.</p>
      {summary && <p className="ct-sim-equilibria">{summary.entry < 0 ? "Crédito" : "Débito"} total: <strong>{money(Math.abs(summary.entry))}</strong></p>}
      <button type="button" className="ct-sim-results-link" onClick={() => { results.current?.scrollIntoView({ block: "start" }); results.current?.focus({ preventScroll: true }); }}>Ver gráfico de resultados ↓</button>
    </section></div>
    <div className="ct-sim-analysis"><section className="ct-sim-card ct-sim-scenario"><h3>Escenario teórico</h3>
      <Field label="Fecha teórica" type="date" value={input.scenarioDate} min={input.valuationDate} max={input.expiry} onChange={value => update("scenarioDate", value)} />
      {datesValid && <label className="ct-sim-field"><span>{days - elapsed} días al vencimiento</span><input aria-label="Avanzar fecha teórica" type="range" min="0" max={Math.max(1, days)} step="1" disabled={days === 0} value={elapsed}
        onChange={event => update("scenarioDate", addDays(input.valuationDate, Number(event.target.value)))} /></label>}
      <Field label="Cambio de VI (puntos porcentuales)" value={input.volatilityShift} onChange={value => update("volatilityShift", value)} />
      <p className="ct-sim-hint">Se suma a la VI de cada pata. +5 lleva una VI de 40% a 45%.</p>
      <Field label="Tasa anual continua %" value={input.rate} onChange={value => update("rate", value)} />
      <Field label="Dividendos anuales continuos %" value={input.dividendYield} onChange={value => update("dividendYield", value)} />
      <h4>Rango del gráfico</h4><Field label="Precio mínimo" value={input.rangeMin} onChange={value => update("rangeMin", value)} />
      <Field label="Precio máximo" value={input.rangeMax} onChange={value => update("rangeMax", value)} />
    </section><section ref={results} tabIndex={-1} className="ct-sim-card ct-sim-results" aria-label="Resultados de la simulación"><h3>Resultado de la estrategia · {input.underlying || "sin selección"} · {input.expiry}</h3>
      {!input.legs.length ? <p>Armá una estrategia para ver su resultado al vencimiento y teórico.</p> : !parsed.ok ? <div className="ct-sim-errors" role="alert"><p>Revisá los datos para calcular:</p><ul>{parsed.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div> : summary && <>
        <div className="ct-sim-metrics">
          <div><span>{summary.entry < 0 ? "Crédito inicial neto" : "Débito inicial total"}</span><strong>{money(Math.abs(summary.entry))}</strong></div>
          <div><span>Ganancia máxima al vencimiento</span><strong className="ct-sim-profit">{summary.maxProfit === Infinity ? "Ilimitada" : money(summary.maxProfit)}</strong></div>
          <div><span>Pérdida máxima al vencimiento</span><strong className="ct-sim-loss">{summary.maxLoss === Infinity ? "Ilimitada" : money(summary.maxLoss)}</strong></div>
        </div>
        <p className="ct-sim-equilibria"><span>Equilibrio al vencimiento: </span>{summary.equilibria.length ? summary.equilibria.map(point => point.from === point.to ? fmt(point.from) : `${fmt(point.from)} a ${point.to === Infinity ? "∞" : fmt(point.to)}`).join(" · ") + ` ${input.currency}` : "Sin puntos de equilibrio"}</p>
        <ResultsChart strategy={parsed.strategy} currency={input.currency} scenarioDate={input.scenarioDate} />
        {(parsed.strategy.legs.some(leg => leg.strike < parsed.strategy.rangeMin || leg.strike > parsed.strategy.rangeMax) || summary.equilibria.some(point => point.from < parsed.strategy.rangeMin || point.from > parsed.strategy.rangeMax)) && <p className="ct-sim-hint">Hay strikes o equilibrios fuera del rango visible. Ampliá el rango para verlos.</p>}
        <p className="ct-sim-hint">Máximos y equilibrios calculados para todo precio del subyacente desde 0 hasta ∞, independientemente del rango visible.</p>
      </>}
    </section></div>
    <details className="ct-sim-card ct-sim-assumptions"><summary>Cómo se calcula y qué supuestos usa</summary>
      <p>Resultado total = suma de (valor de cada opción − prima de entrada) × contratos × unidades por contrato, con signo positivo para compra y negativo para venta, menos los gastos de entrada totales.</p>
      <p>Al vencimiento se usa valor intrínseco. El teórico usa Black–Scholes–Merton europeo, días calendario / 365, tasa y dividendos continuos, y VI constante por pata más el cambio de escenario. Es una estimación: no modela ejercicio anticipado, dividendos en efectivo, garantías, financiación de primas ni gastos de salida o ejercicio.</p>
      <p>La cadena muestra cotizaciones y métricas nativas de Matriz; la hora de lectura local no certifica frescura bursátil. Los ejemplos son ficticios. Tasa y dividendos empiezan en 0%, sin representar condiciones actuales. No se infiere VI a partir de primas: si falta, se muestra solo el resultado al vencimiento hasta ingresarla. Cambiar la VI no cambia las primas de entrada.</p>
    </details>
  </div>;
}
