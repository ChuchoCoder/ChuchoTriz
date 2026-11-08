import type { CSSProperties } from "react";
import { formatOptionAmount, formatOptionNumber, formatOptionVolatility } from "./format";
import type { MetricCell, MetricScale } from "./marketMetrics";
import { viGradeColor } from "./marketMetrics";
import type { Contract as OptionContract } from "./market";
import "./OptionsMetrics.css";
const tradeTimeFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium", hour12: false });
const fmt = (value: number, precision?: number) => formatOptionNumber(value === 0 ? 0 : value, precision);
const formatSensitivity = (value: number) => value.toLocaleString("es-AR", value !== 0 && (value < .0001 || value >= 10000)
  ? { notation: "scientific", maximumSignificantDigits: 4 } : { maximumSignificantDigits: 5 });

export type OptionMetricField = "volume" | "change" | "delta" | "iv" | "theta" | "extrinsic" | "last" | "mid" | "spreadPercent" | "lastTradeAt"
  | "referencePrice" | "intrinsic" | "gamma" | "vega";

export const extraMetricLabels = {
  referencePrice: "Precio de referencia", intrinsic: "Valor intrínseco", gamma: "Gamma teórica", vega: "Vega teórica",
};

export function OptionMetricCell({ contract, field, cell, scale }: {
  contract?: OptionContract; field: OptionMetricField; cell?: MetricCell; scale: MetricScale;
}) {
  const symbol = contract?.symbol ?? "Contrato no disponible";
  if (field === "referencePrice" || field === "intrinsic" || field === "gamma" || field === "vega") {
    const value = cell?.[field];
    const format = field === "referencePrice" ? fmt : field === "intrinsic"
      ? (amount: number) => fmt(Number(amount.toPrecision(12))) : formatSensitivity;
    const text = value === undefined ? undefined : format(value);
    return <td className="ct-opt-metric" aria-label={`${extraMetricLabels[field]} ${symbol}`} title={text}>{text ?? "—"}</td>;
  }
  if (field === "last" || field === "lastTradeAt") {
    const stamp = cell?.lastTradeAt === undefined ? undefined : tradeTimeFormat.format(cell.lastTradeAt);
    const label = field === "last" ? "Último precio operado" : "Última operación";
    const lastPrice = cell?.last === undefined ? undefined : fmt(cell.last);
    const tradeTime = stamp ? `Última operación · ${stamp} ART` : "Sin fecha verificable de última operación";
    return <td className="ct-opt-metric" aria-label={`${label} ${symbol}`}
      title={field === "last" && lastPrice ? `${lastPrice} · ${tradeTime}` : tradeTime}>
      {(field === "last" ? lastPrice : stamp) ?? "—"}
    </td>;
  }
  if (field === "mid" || field === "spreadPercent") {
    const value = cell?.[field], label = field === "mid" ? "Mid" : "Spread %";
    return <td className="ct-opt-metric" aria-label={`${label} ${symbol}`}>
      {value === undefined ? "—" : field === "mid" ? fmt(Number(value.toPrecision(15))) : `${fmt(value, 2)} %`}
    </td>;
  }
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
    const text = value === undefined ? "—" : fmt(value, 0);
    return <td className={`ct-opt-metric ct-opt-nominal ${contract?.kind ?? ""}`} aria-label={`Volumen nominal ${symbol}`} title={`${text} · Volumen nominal operado acumulado`}>
      <span>{text}</span>{value !== undefined && <span className="ct-opt-volume-track" aria-hidden="true">{percent > 0 && <span className="ct-opt-volume-fill" style={{ width: `${percent}%` }} />}</span>}
    </td>;
  }
  const value = field === "delta" ? cell?.delta : cell?.changePercent;
  return <td className={`ct-opt-metric${field === "change" && value !== undefined ? value > 0 ? " ct-opt-up" : value < 0 ? " ct-opt-down" : "" : ""}`} aria-label={`${field === "delta" ? "Delta" : "Variación"} ${symbol}`}>
    {value === undefined ? "—" : field === "delta" ? fmt(value, 3) : `${value > 0 ? "+" : ""}${fmt(value, 2)} %`}
  </td>;
}
