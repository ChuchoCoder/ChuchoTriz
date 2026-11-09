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
  const roll = rollCandidates(input, source.securityId!, numeric(costs), market);
  const target = roll.ok ? roll.candidates.find(candidate => candidate.contract.id === targetId) : undefined;
  const qty = numeric(quantity);
  const draft = buildRoll(input, source.securityId!, targetId, qty, numeric(costs), market);
  const nominalFactor = target?.contract.nominalsPerContract;
  const nominal = nominalFactor && Number.isSafeInteger(nominalFactor * qty) && Number.isSafeInteger(qty) && qty > 0 ? nominalFactor * qty : undefined;
  const holding = underlyingExposure(input.position);
  const excess = nominal !== undefined && source.kind === "call" && !input.position?.underlyingUnavailable && holding
    ? Math.max(0, nominal - Math.max(0, holding.quantity)) : undefined;
  return <dialog ref={dialog} className="ct-roll-picker" aria-labelledby={title} data-ct-inline-editor
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header><h3 id={title}>Rolar {kind} {source.strike}</h3><span>{input.underlying} · {input.expiry}</span></header>
    <p>Elegí otra base del mismo vencimiento. Las dos patas se cargan como ajustes simulados.</p>
    <label className="ct-roll-field">Gastos del rolado ({currency})
      <input aria-label="Gastos del rolado" type="number" min="0" step="any" value={costs} onChange={event => setCosts(event.target.value)} />
    </label>
    {roll.ok && <div className="ct-roll-table"><table aria-label="Bases de destino del rolado">
      <thead><tr><th scope="col">Base</th><th scope="col">BID</th><th scope="col">Flujo 1 a 1</th><th scope="col">Mín. sin débito</th></tr></thead>
      <tbody>{roll.candidates.map(candidate => {
        const { contract, bid, max, minimum, oneForOne, reason } = candidate;
        const validMinimum = minimum !== undefined && minimum <= (max ?? 0);
        return <tr key={contract.id} className={contract.id === targetId ? "selected" : undefined}>
          <th scope="row"><button type="button" disabled={bid === undefined || !max} aria-label={`Rolar a ${contract.symbol}`}
            aria-pressed={contract.id === targetId} onClick={() => setTargetId(contract.id)}>{fmt(contract.strike)} <small>{contract.symbol}</small></button></th>
          <td>{bid === undefined ? reason : fmt(bid)}</td>
          <td>{oneForOne === undefined ? "—" : money(oneForOne)}</td>
          <td>{validMinimum ? fmt(minimum) : minimum === undefined ? "—" : "Sin profundidad"}</td>
        </tr>;
      })}</tbody>
    </table>{!roll.candidates.length && <p>Sin otra base compatible en la cadena.</p>}</div>}
    <div className="ct-roll-controls">
      <label className="ct-roll-field">Vender contratos
        <input aria-label="Contratos a vender en rolado" type="number" min="1" max={target?.max} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} />
      </label>
      <button type="button" disabled={target?.minimum === undefined || target.minimum > (target.max ?? 0)}
        onClick={() => setQuantity(String(target?.minimum))}>Usar mínimo sin débito</button>
    </div>
    {roll.ok && <div className="ct-roll-operations" aria-label="Operaciones del rolado">
      <div><strong>Recomprar para cerrar</strong><div className="ct-roll-chips">
        <span className="ct-sim-buy">Compra</span><span className="ct-sim-buy">+{fmt(roll.quantity)} contratos</span>
        <span>{kind} {fmt(roll.source.strike)}</span><span>ASK {money(roll.ask)} / unidad</span>
      </div></div>
      {target?.bid !== undefined && <div><strong>Vender para abrir</strong><div className="ct-roll-chips">
        <span className="ct-sim-sell">Venta</span><span className="ct-sim-sell">−{Number.isSafeInteger(qty) && qty > 0 ? fmt(qty) : "—"} contratos</span>
        <span>{kind} {fmt(target.contract.strike)}</span><span>BID {money(target.bid)} / unidad</span>
      </div></div>}
    </div>}
    <div aria-live="polite">
      {draft.ok ? <p><strong>{draft.net > 0 ? "Crédito" : draft.net < 0 ? "Débito" : "Flujo"} neto estimado · {money(Math.abs(draft.net))}</strong>
        <br />Recompra {money(roll.ok ? roll.close : 0)} · Venta {money(draft.proceeds)} · Gastos {money(numeric(costs))}</p>
        : <p>{!roll.ok ? roll.reason : targetId ? draft.reason : "Elegí una base de destino para ver el flujo del rolado."}</p>}
      {nominal !== undefined && <p>{fmt(nominal)} nominales en la nueva venta{excess !== undefined && excess > 0
        ? ` · ${fmt(excess)} exceden la tenencia informada si solo se considera esta venta` : ""}</p>}
    </div>
    <footer><button type="button" onClick={close}>Cancelar</button>
      <button type="button" className="ct-roll-apply" disabled={!draft.ok}
        onClick={() => { if (draft.ok) { dialog.current?.close?.(); onApply(draft); } }}>Cargar en Cotizaciones →</button></footer>
  </dialog>;
}
