import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Contract, Quote } from "./market";
import { formatOptionNumber as fmt } from "./format";
import { initialChoice, recipeGlyph, recipePrices, strategyDescription, strategyFamilies, strategyGlyph, strategyLabel, strategyRecipe,
  type StrategyChoice, type StrategyFamily } from "./strategyTemplates";

export default function StrategyPicker({ active, contracts, quotes, spot, currency, context, onApply }: {
  active: boolean; contracts: Contract[]; quotes?: Record<string, Quote>; spot?: number; currency?: string; context: string;
  onApply(choice: StrategyChoice): boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StrategyFamily>("option");
  const [choices, setChoices] = useState(() => Object.fromEntries(strategyFamilies.map(family => [family.id, initialChoice(family.id)])) as Record<StrategyFamily, StrategyChoice>);
  const panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false), panelId = useId();
  const rows = useMemo(() => strategyFamilies.map(family => {
    const choice = choices[family.id], recipe = strategyRecipe(choice, contracts, spot);
    return { ...family, choice, recipe, prices: recipePrices(recipe, quotes, currency), glyph: recipeGlyph(recipe, spot) ?? strategyGlyph(choice) };
  }), [choices, contracts, quotes, spot, currency]);
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
  const cash = current.recipe.ok && current.prices.ok ? current.recipe.legs.reduce((sum, item, index) => sum + (item.side === "buy" ? 1 : -1) * item.ratio * item.contract.factor! * (current.prices.ok ? current.prices.premiums[index] : 0), 0) : undefined;
  return <>
    <button ref={trigger} className="ct-sim-strategy-trigger" type="button" aria-label="Elegir estrategia" aria-haspopup="dialog" aria-controls={panelId} aria-expanded={open}
      onClick={() => open ? close(true) : setOpen(true)}>Estrategia <span aria-hidden="true">⌄</span></button>
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
          <svg viewBox="0 0 40 28" aria-hidden="true"><line x1="1" x2="39" y1="14" y2="14" /><path d={row.glyph} /></svg>
          <button type="button" data-family-name={row.id} className="ct-sim-strategy-name" aria-pressed={selected === row.id} onFocus={() => setSelected(row.id)} onClick={() => setSelected(row.id)}>{row.label}</button>
          <button type="button" className={`ct-sim-strategy-variant ${row.mirror ? "mirror" : row.choice.direction}`} aria-label={`Alternar variante de ${row.label}`}
            aria-description={row.mirror ? row.choice.reversed ? "Reversed" : "Normal" : row.choice.direction === "long" ? "Long" : "Short"}
            onFocus={() => setSelected(row.id)} onClick={() => vary(row.id, row.mirror ? "reversed" : "direction")}>{row.mirror ? row.choice.reversed ? "Reversed" : "Normal" : row.choice.direction === "long" ? "Long" : "Short"}</button>
          {row.kinds ? <button type="button" className={`ct-sim-strategy-variant ${row.choice.kind}`} aria-label={`Alternar Call/Put de ${row.label}`}
            aria-description={row.choice.kind === "call" ? "Call" : "Put"} onFocus={() => setSelected(row.id)} onClick={() => vary(row.id, "kind")}>{row.choice.kind === "call" ? "Call" : "Put"}</button>
            : <span className="ct-sim-strategy-both">C + P</span>}
          <button type="button" className="ct-sim-strategy-apply" aria-label={`Aplicar ${strategyLabel(row.choice)}`} disabled={!row.prices.ok} title={row.prices.ok ? "Reemplazar las patas por esta estructura simulada" : row.prices.reason}
            onFocus={() => setSelected(row.id)} onClick={() => apply(row.id)}>↳</button>
        </div>)}
      </div>
      <section className="ct-sim-strategy-preview" aria-label="Vista previa de la estrategia">
        <div className="ct-sim-strategy-preview-title"><strong>{strategyLabel(current.choice)}</strong><svg viewBox="0 0 40 28" aria-label="Forma orientativa del pago al vencimiento" role="img"><line x1="1" x2="39" y1="14" y2="14" /><path d={current.glyph} /></svg></div>
        <p>{strategyDescription(current.choice)}</p>
        {current.recipe.ok && <ul aria-label="Patas de la plantilla">{current.recipe.legs.map((item, index) => <li key={item.contract.id} className={item.side === "buy" ? "ct-sim-buy" : "ct-sim-sell"}>
          {item.side === "buy" ? "Compra" : "Venta"} {item.ratio}× {item.contract.symbol}{current.prices.ok ? ` · ${fmt(current.prices.premiums[index])}` : ""}
        </li>)}</ul>}
        {cash !== undefined && <strong>{cash < 0 ? "Crédito" : "Débito"} por estructura: {fmt(Number(Math.abs(cash).toPrecision(12)))} {currency}</strong>}
        {!current.prices.ok && <p className="ct-sim-strategy-unavailable" role="status">{current.prices.reason}</p>}
        <small>El icono indica la forma del pago. La flecha carga las patas; podés editar sus cantidades.</small>
      </section>
    </div>}
  </>;
}
