import { useLayoutEffect, useRef, useState } from "react";
import { formatOptionInput } from "../optionsSimulator/format";
import { numeric } from "../optionsSimulator/model";
import { numberLabel } from "./model";
import { recordedCloses, remaining, type CloseCorrection, type RatioOperation } from "./trading";

interface CloseAction {
  key: string;
  snapshot: string;
  kind: "edit" | "delete";
}

interface Props {
  operation: RatioOperation;
  available: boolean;
  onChange: (key: string, snapshot: string, corrections: CloseCorrection[] | null) => Promise<boolean>;
}

export default function RatioCloseHistory({ operation, available, onChange }: Props) {
  const [action, setAction] = useState<CloseAction>();
  const trigger = useRef<HTMLButtonElement | undefined>(undefined);
  const closes = recordedCloses(operation);
  const stale = !!action && (JSON.stringify(operation) !== action.snapshot);

  useLayoutEffect(() => {
    if (!action && trigger.current) {
      trigger.current.focus();
      trigger.current = undefined;
    }
  }, [action]);

  async function save(current: CloseAction, corrections: CloseCorrection[] | null) {
    if (await onChange(current.key, current.snapshot, corrections)) setAction(undefined);
  }

  if (!closes.length) return null;
  return <section className="ro-close-form" aria-labelledby="ro-history-title">
    <h4 id="ro-history-title">Historial de cierres</h4>
    {stale && <p className="ro-close-issue" role="status">La operación cambió. Volvé a seleccionar el cierre para revisar los datos.</p>}
    <ul className="ro-ledger">
      {closes.map(close => {
        const current = !stale && action?.key === close.key ? action : undefined;
        const date = new Date(close.at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" });
        const select = (kind: CloseAction["kind"], button: HTMLButtonElement) => {
          trigger.current = button;
          setAction({ key: close.key, snapshot: JSON.stringify(operation), kind });
        };
        return <li key={close.key} className="ro-ledger-entry">
          <div className="ro-ledger-header">
            <time dateTime={close.at}>{date}</time>
            <div className="ro-actions ro-ledger-controls" hidden={!!current}>
              <button type="button" disabled={!available || (!!action && !stale)} onClick={event => select("edit", event.currentTarget)}>Editar cierre</button>
              <button type="button" className="ro-danger" disabled={!available || (!!action && !stale)} onClick={event => select("delete", event.currentTarget)}>Eliminar cierre</button>
            </div>
          </div>
          {current?.kind === "edit" ? <form aria-label="Editar cierre" onSubmit={event => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            void save(current, close.entries.map(({ leg }) => ({
              quantity: numeric(String(fields.get(`quantity-${leg}`))),
              price: numeric(String(fields.get(`price-${leg}`))),
            })));
          }}>
            <div className="ro-close-legs">{close.entries.map((entry, index) => {
              const leg = operation.legs[entry.leg];
              const name = entry.leg === 0 ? "A" : "B";
              return <div key={entry.leg} className="ro-close-leg">
                <strong>{leg.instrument.symbol}</strong>
                <div className="ro-close-fields">
                  <label>Cantidad {name} · {leg.instrument.quantityUnit}<input name={`quantity-${entry.leg}`} type="number" required autoFocus={index === 0}
                    min={leg.step} step={leg.step} max={remaining(leg) + entry.quantity} defaultValue={entry.quantity} disabled={!available} /></label>
                  <label>Precio {name}<input name={`price-${entry.leg}`} type="number" required min={Number.MIN_VALUE} step="any"
                    defaultValue={formatOptionInput(entry.price, 21)} disabled={!available} /></label>
                </div>
              </div>;
            })}</div>
            <div className="ro-actions ro-ledger-actions">
              <button type="submit" className="ro-primary" disabled={!available}>Guardar cierre</button>
              <button type="button" disabled={!available} onClick={() => setAction(undefined)}>Cancelar</button>
            </div>
          </form> : <>
            <div className="ro-ledger-legs">{close.entries.map(entry => <div key={entry.leg}>
              <strong>{operation.legs[entry.leg].instrument.symbol}</strong> · {numberLabel(entry.quantity)} a {numberLabel(entry.price)}
            </div>)}</div>
            {current?.kind === "delete" && <div className="ro-ledger-confirm" role="group" aria-label="Confirmar eliminación del cierre">
              <p>¿Eliminar este cierre? Sus cantidades volverán a quedar abiertas.</p>
              <div className="ro-actions ro-ledger-actions">
                <button type="button" className="ro-danger" disabled={!available} onClick={() => void save(current, null)}>Confirmar eliminación</button>
                <button type="button" disabled={!available} autoFocus onClick={() => setAction(undefined)}>Cancelar</button>
              </div>
            </div>}
          </>}
        </li>;
      })}
    </ul>
  </section>;
}
