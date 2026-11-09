import { useId, useLayoutEffect, useRef, useState } from "react";
import { formatOptionNumber as fmt } from "./format";
import { numeric, underlyingExposure, type Leg, type Simulation } from "./model";
import { buildRoll, rollCandidates } from "./rollPosition";
import type { StrikeMarket } from "./strategyAdjustments";

export default function RollPicker({ input, source, market, onClose, onApply }: {
  input: Simulation; source: Leg; market?: StrikeMarket; onClose(): void;
  onApply(result: Extract<ReturnType<typeof buildRoll>, { ok: true }>): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const destinationsHeading = useRef<HTMLHeadingElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const originRow = useRef<HTMLTableRowElement>(null);
  const title = useId();
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState(source.contracts);
  const [feePercent, setFeePercent] = useState("0,2");
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (panel?.showModal) panel.showModal();
    else panel?.setAttribute("open", "");
    destinationsHeading.current?.focus({ preventScroll: true });
  }, []);
  const currency = input.currency;
  const money = (amount: number) => `${fmt(amount, amount !== 0 && Math.abs(amount) < .01 ? 12 : 2)} ${currency}`;
  function close() {
    dialog.current?.close?.();
    onClose();
  }
  const kind = source.kind.toUpperCase();
  const short = source.side === "sell";
  const openVerb = short ? "Vender" : "Comprar";
  const closeVerb = short ? "Recompra" : "Venta de cierre";
  const openBook = short ? "BID" : "ASK";
  const roll = rollCandidates(input, source.securityId!, numeric(feePercent), market);
  const candidates = roll.ok ? roll.candidates : [];
  const sourceStrike = numeric(source.strike);
  const firstHigher = candidates.findIndex(candidate => candidate.contract.strike > sourceStrike);
  const originIndex = firstHigher < 0 ? candidates.length : firstHigher;
  const rows = [...candidates.slice(0, originIndex), null, ...candidates.slice(originIndex)];
  const target = candidates.find(candidate => candidate.contract.id === targetId);
  useLayoutEffect(() => {
    const table = tableScroll.current, row = originRow.current;
    if (!table || !row) return;
    const bounds = row.getBoundingClientRect();
    table.scrollTop += bounds.top - table.getBoundingClientRect().top - (table.clientHeight - bounds.height) / 2;
  }, [roll.ok, originIndex, candidates.length]);
  const qty = numeric(quantity);
  const draft = buildRoll(input, source.securityId!, targetId, qty, numeric(feePercent), market);
  const noDebitQuantity = short
    ? target?.minimum !== undefined && target.minimum <= (target.max ?? 0) ? target.minimum : undefined
    : target?.maximum || undefined;
  const noDebitLabel = short ? "mínimo" : "máximo";
  const nominalFactor = target?.contract.nominalsPerContract;
  const nominal = nominalFactor && Number.isSafeInteger(nominalFactor * qty) && Number.isSafeInteger(qty) && qty > 0 ? nominalFactor * qty : undefined;
  const holding = underlyingExposure(input.position);
  const excess = nominal !== undefined && short && source.kind === "call" && !input.position?.underlyingUnavailable && holding
    ? Math.max(0, nominal - Math.max(0, holding.quantity)) : undefined;
  function operation(title: string, side: Leg["side"], contracts: number, strike: number, book: string, price: number) {
    const buy = side === "buy", color = buy ? "ct-sim-buy" : "ct-sim-sell";
    return <div><strong>{title}</strong><div className="ct-roll-chips">
      <span className={color}>{buy ? "Compra" : "Venta"}</span>
      <span className={color}>{buy ? "+" : "−"}{Number.isSafeInteger(contracts) && contracts > 0 ? fmt(contracts) : "—"} contratos</span>
      <span>{kind} {fmt(strike)}</span><span>{book} {money(price)} / unidad</span>
    </div></div>;
  }
  return <dialog ref={dialog} className="ct-roll-picker" aria-labelledby={title} data-ct-inline-editor
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header><h3 id={title}>Rolar {kind} {source.strike}</h3><span>{input.underlying} · {input.expiry}</span></header>
    <div className="ct-roll-layout">
      <section className="ct-roll-destinations" aria-labelledby={`${title}-destinations`}>
        <h4 ref={destinationsHeading} tabIndex={-1} id={`${title}-destinations`}>Strike de destino</h4>
        <p className="ct-roll-hint">Mismo vencimiento · Importes en {currency}</p>
        <div ref={tableScroll} className="ct-roll-table"><table aria-label="Bases de destino del rolado">
          <colgroup><col className="ct-roll-strike-col" /><col className="ct-roll-price-col" /><col className="ct-roll-flow-col" /><col /></colgroup>
          <thead><tr><th scope="col">Strike</th><th scope="col">{openBook}</th><th scope="col">Flujo 1 a 1</th><th scope="col" aria-label={`${short ? "Mínimo" : "Máximo"} sin débito`} title={`${short ? "Mínimo" : "Máximo"} sin débito`}>{short ? "Mín." : "Máx."} s/déb.</th></tr></thead>
          <tbody>{rows.map(candidate => {
            if (!candidate) return <tr key={source.securityId} ref={originRow} className="ct-roll-origin">
              <th scope="row">{fmt(sourceStrike)}</th><td colSpan={3}>Posición actual</td>
            </tr>;
            const { contract, price, max, minimum, maximum, oneForOne, reason } = candidate;
            const limit = short ? minimum : maximum;
            const limitLabel = limit && limit <= (max ?? 0) ? fmt(limit)
              : short && minimum !== undefined ? "No disponible" : !short && price !== undefined && max ? "Requiere débito" : "—";
            const strike = fmt(contract.strike);
            const flowClass = oneForOne === undefined || oneForOne === 0 ? undefined : oneForOne > 0 ? "ct-sim-profit" : "ct-sim-loss";
            const flow = oneForOne === undefined ? "—" : `${oneForOne > 0 ? "+" : ""}${fmt(oneForOne, Math.abs(oneForOne) < .01 ? 12 : 2)}`;
            return <tr key={contract.id} className={contract.id === targetId ? "selected" : undefined}>
              <th scope="row"><button type="button" disabled={price === undefined || !max} aria-label={`Rolar a ${strike}`} title={reason ?? strike}
                aria-pressed={contract.id === targetId} onClick={() => setTargetId(contract.id)}>{strike}</button></th>
              <td title={reason ?? (price === undefined ? undefined : fmt(price))}>{price === undefined ? "—" : fmt(price)}</td>
              <td className={flowClass}
                title={oneForOne === undefined ? undefined : money(oneForOne)}>{flow}</td>
              <td title={limitLabel}>{limitLabel}</td>
            </tr>;
          })}</tbody>
        </table></div>
        {roll.ok && !candidates.length && <p>Sin otra base compatible en la cadena.</p>}
      </section>
      <section className="ct-roll-details" aria-labelledby={`${title}-operations`}>
        <h4 id={`${title}-operations`}>Operaciones</h4>
        <label className="ct-roll-field">Gastos del rolado (%)
          <input aria-label="Gastos del rolado (%)" title="Porcentaje sobre el importe bruto de cada pata"
            type="text" inputMode="decimal" value={feePercent} onChange={event => setFeePercent(event.target.value)} />
        </label>
        {roll.ok && <div className="ct-roll-operations" aria-label="Operaciones del rolado">
          {operation(short ? "Recomprar para cerrar" : "Vender para cerrar", roll.closeSide, roll.quantity, roll.source.strike,
            roll.closeBook.toUpperCase(), roll.closePrice)}
          {target?.price !== undefined
            ? operation(`${openVerb} para abrir`, roll.openSide, qty, target.contract.strike, openBook, target.price)
            : <div className="ct-roll-hint">{openVerb} para abrir · Elegí el strike de destino.</div>}
        </div>}
        <div className="ct-roll-controls">
          <label className="ct-roll-field">{openVerb} contratos
            <input aria-label={`Contratos a ${openVerb.toLowerCase()} en rolado`} type="number" min="1" max={target?.max} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} />
          </label>
          <button type="button" disabled={noDebitQuantity === undefined}
            onClick={() => setQuantity(String(noDebitQuantity))}>Usar {noDebitLabel} sin débito</button>
        </div>
        <div aria-live="polite">
          {draft.ok ? <p><strong>{draft.net > 0 ? "Crédito" : draft.net < 0 ? "Débito" : "Flujo"} neto estimado · {money(Math.abs(draft.net))}</strong>
            <br />{closeVerb} {money(roll.ok ? roll.close : 0)} · {short ? "Venta" : "Compra"} de apertura {money(draft.openingAmount)} · Gastos {money(draft.costs)}</p>
            : (!roll.ok || targetId) && <p>{!roll.ok ? roll.reason : draft.reason}</p>}
          {nominal !== undefined && <p>{fmt(nominal)} nominales en la nueva {short ? "venta" : "compra"}{excess !== undefined && excess > 0
            ? ` · ${fmt(excess)} exceden la tenencia informada si solo se considera esta venta` : ""}</p>}
        </div>
      </section>
    </div>
    <footer><span className="ct-roll-hint">Las dos patas se cargan como ajustes simulados.</span>
      <button type="button" onClick={close}>Cancelar</button>
      <button type="button" className="ct-roll-apply" disabled={!draft.ok}
        onClick={() => { if (draft.ok) { dialog.current?.close?.(); onApply(draft); } }}>Cargar en Cotizaciones →</button></footer>
  </dialog>;
}
