import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Contract, Quote } from "./market";
import { formatOptionAmount, formatOptionNumber as fmt } from "./format";
import { initialChoice, recipeDraftPrices, recipePayoff, strategyDescription, strategyFamilies, strategyGlyph, strategyLabel, strategyRecipe,
  type StrategyChoice, type StrategyFamily } from "./strategyTemplates";

function PayoffGraphic({ payoff, compact, currency }: { payoff: ReturnType<typeof recipePayoff>; compact?: boolean; currency?: string }) {
  const id = useId().replace(/:/g, "");
  if (!payoff.ok) return null;
  const width = compact ? 40 : 320, height = compact ? 28 : 116, left = compact ? 2 : 48, right = compact ? 2 : 10, top = compact ? 3 : 15, bottom = compact ? 3 : 22;
  const values = payoff.points.map(point => point.result), min = Math.min(0, ...values), max = Math.max(0, ...values), pad = Math.max(1, (max - min) * .12);
  const low = min - pad, high = max + pad;
  const x = (price: number) => left + (price - payoff.strategy.rangeMin) / (payoff.strategy.rangeMax - payoff.strategy.rangeMin) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const zero = y(0), offset = (zero - top) / (height - top - bottom);
  const path = payoff.points.map((point, index) => `${index ? "L" : "M"}${x(point.price).toFixed(3)},${y(point.result).toFixed(3)}`).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} aria-hidden={compact || undefined} role={compact ? undefined : "img"}
    aria-label={compact ? undefined : "Resultado al vencimiento con primas incluidas"} className={compact ? "ct-sim-payoff-mini" : "ct-sim-payoff-preview"}>
    <title>Resultado al vencimiento: verde ganancia, rojo pérdida, con primas y gastos incluidos.</title>
    <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={top} y2={height - bottom}>
      <stop offset="0" stopColor="var(--sim-profit)" /><stop offset={offset} stopColor="var(--sim-profit)" />
      <stop offset={offset} stopColor="var(--sim-loss)" /><stop offset="1" stopColor="var(--sim-loss)" />
    </linearGradient></defs>
    <line className="ct-sim-payoff-zero" x1={left} x2={width - right} y1={zero} y2={zero} />
    {!compact && <><text x={left - 6} y={zero + 3} textAnchor="end">0</text>
      <text x={left} y="10">P&amp;L · {currency}</text>
      {max > 0 && <text x={left - 6} y={y(max) + 3} textAnchor="end">{formatOptionAmount(max, currency)}</text>}
      {min < 0 && <text x={left - 6} y={y(min) + 3} textAnchor="end">{formatOptionAmount(min, currency)}</text>}
      <text x={left} y={height - 5}>{formatOptionAmount(payoff.strategy.rangeMin, currency)}</text>
      <text x={width - right} y={height - 5} textAnchor="end">{formatOptionAmount(payoff.strategy.rangeMax, currency)}</text></>}
    <path className="ct-sim-payoff-line" d={path} style={{ stroke: min === 0 && max === 0 ? "var(--sim-muted)" : `url(#${id})` }} />
  </svg>;
}

export default function StrategyPicker({ active, contracts, quotes, spot, currency, context, onApply, costs = 0 }: {
  active: boolean; contracts: Contract[]; quotes?: Record<string, Quote>; spot?: number; currency?: string; context: string;
  costs?: number;
  onApply(choice: StrategyChoice): boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StrategyFamily>("option");
  const [choices, setChoices] = useState(() => Object.fromEntries(strategyFamilies.map(family => [family.id, initialChoice(family.id)])) as Record<StrategyFamily, StrategyChoice>);
  const panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false), panelId = useId();
  const rows = useMemo(() => strategyFamilies.map(family => {
    const choice = choices[family.id], recipe = strategyRecipe(choice, contracts, spot);
    const payoff = recipePayoff(recipe, quotes, spot, currency, costs);
    return { ...family, choice, recipe, prices: recipeDraftPrices(recipe, quotes, currency), payoff,
      canApply: payoff.ok || "missingPremiums" in payoff, glyph: strategyGlyph(choice) };
  }), [choices, contracts, quotes, spot, currency, costs]);
  const current = rows.find(row => row.id === selected)!;
  const close = (focus: boolean) => { returnFocus.current = focus; setOpen(false); };
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => {
    const popup = panel.current;
    if (!open || !popup || !trigger.current) {
      if (returnFocus.current) { returnFocus.current = false; trigger.current?.focus(); }
      return;
    }
    const position = () => {
      const rect = trigger.current!.getBoundingClientRect(), viewport = trigger.current!.closest(".ct-sim")!.getBoundingClientRect();
      const left = Math.max(8, viewport.left + 4), right = Math.min(innerWidth - 8, viewport.right - 4), width = Math.min(560, right - left);
      popup.style.width = `${width}px`;
      popup.style.left = `${Math.max(left, Math.min(right - width, rect.left))}px`;
      popup.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 220))}px`;
      popup.style.maxHeight = `${Math.max(180, Math.min(innerHeight - 12, viewport.bottom) - Math.max(8, Math.min(rect.bottom + 4, innerHeight - 220)) - 6)}px`;
    };
    position(); popup.showPopover?.();
    popup.querySelector<HTMLButtonElement>(`[data-family-name="${selected}"]`)?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !popup.contains(event.target) && !trigger.current?.contains(event.target)) close(false); };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true);
      if (popup.isConnected) popup.hidePopover?.();
    };
  }, [open]);
  function vary(family: StrategyFamily, field: "direction" | "kind" | "reversed") {
    setSelected(family);
    setChoices(previous => ({ ...previous, [family]: { ...previous[family], [field]: field === "direction" ? previous[family].direction === "long" ? "short" : "long"
      : field === "kind" ? previous[family].kind === "call" ? "put" : "call" : !previous[family].reversed } }));
  }
  function apply(family: StrategyFamily) { if (onApply(choices[family])) close(true); }
  const cash = current.payoff.ok ? current.payoff.summary.entry : undefined;
  return <>
    <button ref={trigger} className="ct-sim-strategy-trigger" type="button" aria-label="Elegir estrategia" aria-haspopup="dialog" aria-controls={panelId} aria-expanded={open}
      onClick={() => open ? close(true) : setOpen(true)}>Estrategia <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    {open && <div ref={panel} id={panelId} popover="manual" role="dialog" aria-label="Selector visual de estrategias" data-ct-inline-editor className="ct-sim-strategy-picker"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || !(event.target instanceof Element) || !event.target.hasAttribute("data-family-name")) return;
        event.preventDefault();
        const index = strategyFamilies.findIndex(family => family.id === selected);
        const next = event.key === "Home" ? 0 : event.key === "End" ? strategyFamilies.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + strategyFamilies.length) % strategyFamilies.length;
        setSelected(strategyFamilies[next].id); panel.current?.querySelector<HTMLButtonElement>(`[data-family-name="${strategyFamilies[next].id}"]`)?.focus();
      }}>
      <header><div><strong>Elegir estructura</strong><small>{context} · Un vencimiento</small></div><button type="button" aria-label="Cerrar selector de estrategias" onClick={() => close(true)}>×</button></header>
      <div className="ct-sim-strategy-rows" role="group" aria-label="Familias de opciones">
        {rows.map(row => <div key={row.id} className={`ct-sim-strategy-row${selected === row.id ? " selected" : ""}`} onMouseEnter={() => setSelected(row.id)}>
          {row.payoff.ok ? <PayoffGraphic payoff={row.payoff} compact currency={currency} /> : <svg viewBox="0 0 40 28" aria-hidden="true"><path d={row.glyph} /></svg>}
          <button type="button" data-family-name={row.id} className="ct-sim-strategy-name" aria-pressed={selected === row.id} onFocus={() => setSelected(row.id)} onClick={() => setSelected(row.id)}>{row.label}</button>
          <button type="button" className={`ct-sim-strategy-variant ${row.mirror ? "mirror" : row.choice.direction}`} aria-label={`Alternar variante de ${row.label}`}
            aria-description={row.mirror ? row.choice.reversed ? "Reversed" : "Normal" : row.choice.direction === "long" ? "Long" : "Short"}
            onFocus={() => setSelected(row.id)} onClick={() => vary(row.id, row.mirror ? "reversed" : "direction")}>{row.mirror ? row.choice.reversed ? "Reversed" : "Normal" : row.choice.direction === "long" ? "Long" : "Short"}</button>
          {row.kinds ? <button type="button" className={`ct-sim-strategy-variant ${row.choice.kind}`} aria-label={`Alternar Call/Put de ${row.label}`}
            aria-description={row.choice.kind === "call" ? "Call" : "Put"} onFocus={() => setSelected(row.id)} onClick={() => vary(row.id, "kind")}>{row.choice.kind === "call" ? "Call" : "Put"}</button>
            : <span className="ct-sim-strategy-both">C + P</span>}
          <button type="button" className="ct-sim-strategy-apply" aria-label={`Armar ${strategyLabel(row.choice)}`} disabled={!row.canApply} title={row.payoff.ok ? "Reemplazar las patas por esta estructura simulada" : row.payoff.reason}
            onFocus={() => setSelected(row.id)} onClick={() => apply(row.id)}>Armar <span aria-hidden="true">↳</span></button>
        </div>)}
      </div>
      <section className="ct-sim-strategy-preview" aria-label="Vista previa de la estrategia">
        <div className="ct-sim-strategy-preview-title"><strong>{strategyLabel(current.choice)}</strong></div>
        <p>{strategyDescription(current.choice)}</p>
        <PayoffGraphic payoff={current.payoff} currency={currency} />
        {current.payoff.ok && <div className="ct-sim-payoff-summary"><span className="ct-sim-profit">Ganancia máx. {current.payoff.summary.maxProfit === Infinity ? "∞" : `${formatOptionAmount(current.payoff.summary.maxProfit, currency)} ${currency}`}</span>
          <span className="ct-sim-loss">Pérdida máx. {current.payoff.summary.maxLoss === Infinity ? "∞" : `${formatOptionAmount(current.payoff.summary.maxLoss, currency)} ${currency}`}</span></div>}
        {current.recipe.ok && <ul aria-label="Patas de la plantilla">{current.recipe.legs.map((item, index) => {
          const premium = current.prices.ok ? current.prices.premiums[index] : undefined;
          return <li key={item.contract.id} className={item.side === "buy" ? "ct-sim-buy" : "ct-sim-sell"}>
            {item.side === "buy" ? "Compra" : "Venta"} {item.ratio}× {item.contract.symbol}
            {premium && (premium.value === undefined ? " · Precio pendiente" : ` · ${fmt(premium.value)}${premium.fromLast ? " (último operado)" : ""}`)}
          </li>;
        })}</ul>}
        {cash !== undefined && <strong>{cash < 0 ? "Crédito" : cash > 0 ? "Débito" : "Neutra"}{costs ? " neto" : ""} por estructura: {formatOptionAmount(Math.abs(cash), currency)} {currency}</strong>}
        {!current.payoff.ok && <p className="ct-sim-strategy-unavailable" role="status">{current.payoff.reason}</p>}
        <small>Resultado al vencimiento por estructura, con primas{costs ? " y gastos" : ""}. Verde: ganancia. Rojo: pérdida. Armar carga las patas.</small>
      </section>
    </div>}
  </>;
}
