import type { CSSProperties } from "react";
import { formatOptionAmount, formatOptionNumber, formatOptionVolatility } from "./format";
import type { MetricCell, MetricScale } from "./marketMetrics";
import { viGradeColor } from "./marketMetrics";
import type { Contract as OptionContract } from "./market";
import "./OptionsMetrics.css";
const tradeTimeFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium", hour12: false });
const fmt = (value: number, precision?: number) => formatOptionNumber(value === 0 ? 0 : value, precision);

export function OptionMetricCell({ contract, field, cell, scale }: {
  contract?: OptionContract; field: "volume" | "change" | "delta" | "iv" | "theta" | "extrinsic"; cell?: MetricCell; scale: MetricScale;
}) {
  const symbol = contract?.symbol ?? "Contrato no disponible";
  if (field === "theta" || field === "extrinsic") {
    const value = cell?.[field], label = field === "theta" ? "Theta teórico" : "Extrínseco";
    const explanation = field === "theta" ? "Theta BSM europeo por unidad de prima y día calendario. Usa VI nativa, fecha de hoy y tasa/dividendos de Análisis. La antigüedad de la VI se consulta en su columna."
      : "Precio Mid (BID/ASK) menos valor intrínseco, por unidad de prima. Los valores negativos no se recortan.";
    return <td className="ct-opt-metric" aria-label={`${label} ${symbol}`} title={`${explanation}${value === undefined ? " Sin datos compatibles suficientes." : ""}`}>
      {value === undefined ? "—" : formatOptionAmount(value)}
    </td>;
  }
  if (field === "iv") {
    const color = viGradeColor(cell, scale), value = cell?.impliedVolatility;
    const reason = cell?.eligible && !color ? "Sin rango suficiente para una escala comparativa" : cell?.reason ?? "Sin datos";
    const stamp = cell?.lastTradeAt === undefined ? "" : ` · Última operación: ${tradeTimeFormat.format(cell.lastTradeAt)} ART`;
    return <td className="ct-opt-metric ct-opt-iv" aria-label={`VI ${symbol}`}><span className={`ct-opt-iv-value${color ? "" : " excluded"}`} data-grading={color ? "included" : "excluded"}
      style={color ? { "--ct-iv": color } as CSSProperties : undefined} title={`${symbol} · ${reason}${stamp}${color ? "" : " · Fuera de la escala"}`}>
      {value === undefined ? "—" : `${formatOptionVolatility(value)} %`}</span></td>;
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
