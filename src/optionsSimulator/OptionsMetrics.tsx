import type { CSSProperties } from "react";
import { formatOptionNumber } from "./format";
import type { MetricCell, MetricScale } from "./marketMetrics";
import { viGradeColor } from "./marketMetrics";
import type { Contract as OptionContract } from "./market";
import "./OptionsMetrics.css";
const tradeTimeFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium", hour12: false });
const fmt = (value: number, precision?: number) => formatOptionNumber(value === 0 ? 0 : value, precision);

export function OptionMetricCell({ contract, field, cell, scale }: {
  contract?: OptionContract; field: "volume" | "change" | "delta" | "iv"; cell?: MetricCell; scale: MetricScale;
}) {
  const symbol = contract?.symbol ?? "Contrato no disponible";
  if (field === "iv") {
    const color = viGradeColor(cell, scale), value = cell?.impliedVolatility;
    const reason = cell?.eligible && !color ? "Sin rango suficiente para una escala comparativa" : cell?.reason ?? "Sin datos";
    const stamp = cell?.lastTradeAt === undefined ? "" : ` · Última operación: ${tradeTimeFormat.format(cell.lastTradeAt)} ART`;
    return <td className="ct-opt-metric ct-opt-iv" aria-label={`VI ${symbol}`}><span className={`ct-opt-iv-value${color ? "" : " excluded"}`} data-grading={color ? "included" : "excluded"}
      style={color ? { "--ct-iv": color } as CSSProperties : undefined} title={`${symbol} · ${reason}${stamp}${color ? "" : " · Fuera de la escala"}`}>
      {value === undefined ? "—" : `${fmt(value, 2)} %`}</span></td>;
  }
  if (field === "volume") {
    const value = cell?.nominalVolume, percent = value === undefined || scale.volumeMax === 0 ? 0 : value / scale.volumeMax * 100;
    return <td className={`ct-opt-metric ct-opt-nominal ${contract?.kind ?? ""}`} aria-label={`Volumen nominal ${symbol}`} title="Volumen nominal operado acumulado; no es cantidad disponible en las puntas.">
      <span>{value === undefined ? "—" : fmt(value, 0)}</span>{value !== undefined && <span className="ct-opt-volume-track" aria-hidden="true">{percent > 0 && <span className="ct-opt-volume-fill" style={{ width: `${percent}%` }} />}</span>}
    </td>;
  }
  const value = field === "delta" ? cell?.delta : cell?.changePercent;
  return <td className={`ct-opt-metric${field === "change" && value !== undefined ? value > 0 ? " ct-opt-up" : value < 0 ? " ct-opt-down" : "" : ""}`} aria-label={`${field === "delta" ? "Delta" : "Variación"} ${symbol}`}>
    {value === undefined ? "—" : field === "delta" ? fmt(value, 3) : `${value > 0 ? "+" : ""}${fmt(value, 2)} %`}
  </td>;
}
export function OptionsMetricsLegend({ kind, scale, enabled }: { kind: "call" | "put"; scale: MetricScale; enabled: boolean }) {
  return <div className={`ct-opt-metrics-legend ${kind}`} aria-label={`Escala de ${kind === "call" ? "Calls" : "Puts"}`}>
    <strong>{kind === "call" ? "CALLS" : "PUTS"}</strong><span>VI · {scale.included}/{scale.total} {enabled ? "recientes" : "con dato"}</span>
    {scale.min !== undefined && scale.max !== undefined && scale.min < scale.max ? <><span>{fmt(scale.min, 2)} %</span><i aria-hidden="true" /><span>{fmt(scale.max, 2)} %</span></> : <span>Sin rango para colorear</span>}
    <span className="ct-opt-volume-max">Barra 100 % = {fmt(scale.volumeMax, 0)} VN</span>
  </div>;
}
