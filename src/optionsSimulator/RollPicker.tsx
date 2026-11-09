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
  const title = useId();
  const [targetId, setTargetId] = useState("");
  const [quantity, setQuantity] = useState(source.contracts);
  const [costs, setCosts] = useState("0");
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (panel?.showModal) panel.showModal();
    else panel?.setAttribute("open", "");
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
  const roll = rollCandidates(input, source.securityId!, numeric(costs), market);
  const target = roll.ok ? roll.candidates.find(candidate => candidate.contract.id === targetId) : undefined;
  const qty = numeric(quantity);
  const draft = buildRoll(input, source.securityId!, targetId, qty, numeric(costs), market);
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
    <p>Elegí otra base del mismo vencimiento. Las dos patas se cargan como ajustes simulados.</p>
    <label className="ct-roll-field">Gastos del rolado ({currency})
      <input aria-label="Gastos del rolado" type="number" min="0" step="any" value={costs} onChange={event => setCosts(event.target.value)} />
    </label>
    {roll.ok && <div className="ct-roll-table"><table aria-label="Bases de destino del rolado">
      <thead><tr><th scope="col">Base</th><th scope="col">{openBook}</th><th scope="col">Flujo 1 a 1</th><th scope="col">{short ? "Mín." : "Máx."} sin débito</th></tr></thead>
      <tbody>{roll.candidates.map(candidate => {
        const { contract, price, max, minimum, maximum, oneForOne, reason } = candidate;
        const limit = short ? minimum : maximum;
        const limitLabel = limit && limit <= (max ?? 0) ? fmt(limit)
          : short && minimum !== undefined ? "Sin profundidad" : !short && price !== undefined && max ? "Requiere débito" : "—";
        return <tr key={contract.id} className={contract.id === targetId ? "selected" : undefined}>
          <th scope="row"><button type="button" disabled={price === undefined || !max} aria-label={`Rolar a ${contract.symbol}`}
            aria-pressed={contract.id === targetId} onClick={() => setTargetId(contract.id)}>{fmt(contract.strike)} <small>{contract.symbol}</small></button></th>
          <td>{price === undefined ? reason : fmt(price)}</td>
          <td>{oneForOne === undefined ? "—" : money(oneForOne)}</td>
          <td>{limitLabel}</td>
        </tr>;
      })}</tbody>
    </table>{!roll.candidates.length && <p>Sin otra base compatible en la cadena.</p>}</div>}
    <div className="ct-roll-controls">
      <label className="ct-roll-field">{openVerb} contratos
        <input aria-label={`Contratos a ${openVerb.toLowerCase()} en rolado`} type="number" min="1" max={target?.max} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} />
      </label>
      <button type="button" disabled={noDebitQuantity === undefined}
        onClick={() => setQuantity(String(noDebitQuantity))}>Usar {noDebitLabel} sin débito</button>
    </div>
    {roll.ok && <div className="ct-roll-operations" aria-label="Operaciones del rolado">
      {operation(short ? "Recomprar para cerrar" : "Vender para cerrar", roll.closeSide, roll.quantity, roll.source.strike,
        roll.closeBook.toUpperCase(), roll.closePrice)}
      {target?.price !== undefined && operation(`${openVerb} para abrir`, roll.openSide, qty, target.contract.strike, openBook, target.price)}
    </div>}
    <div aria-live="polite">
      {draft.ok ? <p><strong>{draft.net > 0 ? "Crédito" : draft.net < 0 ? "Débito" : "Flujo"} neto estimado · {money(Math.abs(draft.net))}</strong>
        <br />{closeVerb} {money(roll.ok ? roll.close : 0)} · {short ? "Venta" : "Compra"} de apertura {money(draft.openingAmount)} · Gastos {money(numeric(costs))}</p>
        : <p>{!roll.ok ? roll.reason : targetId ? draft.reason : "Elegí una base de destino para ver el flujo del rolado."}</p>}
      {nominal !== undefined && <p>{fmt(nominal)} nominales en la nueva {short ? "venta" : "compra"}{excess !== undefined && excess > 0
        ? ` · ${fmt(excess)} exceden la tenencia informada si solo se considera esta venta` : ""}</p>}
    </div>
    <footer><button type="button" onClick={close}>Cancelar</button>
      <button type="button" className="ct-roll-apply" disabled={!draft.ok}
        onClick={() => { if (draft.ok) { dialog.current?.close?.(); onApply(draft); } }}>Cargar en Cotizaciones →</button></footer>
  </dialog>;
}
