import { useId, useState, type CSSProperties } from "react";
import { formatOptionAmount, formatOptionNumber, formatOptionVolatility } from "./format";
import type { MetricCell, MetricScale } from "./marketMetrics";
import { viGradeColor } from "./marketMetrics";
import type { Contract as OptionContract } from "./market";
import "./OptionsMetrics.css";
const tradeTimeFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium", hour12: false });
const fmt = (value: number, precision?: number) => formatOptionNumber(value === 0 ? 0 : value, precision);
const formatSensitivity = (value: number) => value.toLocaleString("es-AR", value !== 0 && (value < .0001 || value >= 10000)
  ? { notation: "scientific", maximumSignificantDigits: 4 } : { maximumSignificantDigits: 5 });
const formatTooltipGamma = (value: number) => value > 0 && value < 1e-12 ? "<0,000000000001"
  : value.toLocaleString("es-AR", { maximumSignificantDigits: 5 });
const formatProbability = (value: number) => value < .001 ? "<0,1 %" : value > .999 ? ">99,9 %" : `${fmt(value * 100, 1)} %`;
const viPopover = (() => {
  if (typeof HTMLElement === "undefined" || typeof HTMLElement.prototype.showPopover !== "function") return;
  const probe = document.createElement("div");
  probe.setAttribute("popover", "hint");
  return probe.popover === "hint" ? "hint" : "auto";
})();

function VolatilityCell({ contract, cell, scale }: { contract: OptionContract; cell?: MetricCell; scale: MetricScale }) {
  const id = useId();
  const anchor = `--ct-vi-${id.replace(/[^\w-]/g, "")}`;
  const [open, setOpen] = useState(false);
  const { symbol, kind, strike, strikeCurrency } = contract;
  const color = viGradeColor(cell, scale), value = cell?.impliedVolatility;
  const details = cell?.viDetails;
  const price = `${fmt(strike)}${strikeCurrency ? ` ${strikeCurrency}` : ""}`;
  const stamp = cell?.lastTradeAt === undefined ? undefined : tradeTimeFormat.format(cell.lastTradeAt);
  const text = value === undefined ? "—" : `${formatOptionVolatility(value)} %`;
  const label = value === undefined ? "VI sin dato" : `VI ${text}`;
  const tradeStatus = `${cell?.viTradeStatus ?? cell?.reason ?? "Sin datos"}${stamp ? ` · ${stamp} ART` : ""}`;
  const badge = { className: `ct-opt-iv-value${color ? "" : " excluded"}`, "data-grading": color ? "included" : "excluded",
    style: color ? { "--ct-iv": color } as CSSProperties : undefined };

  if (!viPopover) return <td className="ct-opt-metric ct-opt-iv" aria-label={`VI ${symbol}`}>
    <span {...badge}>{text}</span>
  </td>;

  return <td className="ct-opt-metric ct-opt-iv" aria-label={`VI ${symbol}`} style={{ "--ct-vi-anchor": anchor } as CSSProperties}>
    <button type="button" {...badge} popoverTarget={id}
      aria-label={`${label} · ${symbol}`} aria-controls={id} aria-expanded={open} aria-describedby={id}>
      {text}
    </button>
    <div id={id} className="ct-opt-iv-detail" role="tooltip" popover={viPopover}
      onToggle={event => setOpen(event.newState === "open")}>
      {open ? <>
        <header><strong>{symbol}</strong><span>{label}</span></header>
        {details ? <>
          <strong>Probabilidad teórica al vencimiento</strong>
          <dl>
            <div><dt>ITM · Con valor intrínseco</dt><dd><strong>{formatProbability(details.probabilityItm)}</strong>
              <small>Subyacente {kind === "call" ? "por encima" : "por debajo"} de {price}</small></dd></div>
            <div><dt>OTM · Sin valor intrínseco</dt><dd><strong>{formatProbability(details.probabilityOtm)}</strong>
              <small>Subyacente {kind === "call" ? "por debajo" : "por encima"} de {price}</small></dd></div>
          </dl>
          <strong>Griegas teóricas de la opción</strong>
          <dl>
            <div><dt>Delta</dt><dd><strong>{fmt(details.theoreticalDelta, 4)}</strong><small>Prima por +1 unidad de precio</small></dd></div>
            <div><dt>Theta</dt><dd><strong>{details.theta === undefined ? "—" : formatOptionAmount(details.theta)}</strong><small>Prima por día calendario</small></dd></div>
            <div><dt>Gamma</dt><dd><strong>{details.gamma === undefined ? "—" : formatTooltipGamma(details.gamma)}</strong><small>Delta por +1 unidad de precio</small></dd></div>
            <div><dt>Vega</dt><dd><strong>{details.vega === undefined ? "—" : formatSensitivity(details.vega)}</strong><small>Prima por +1 punto de VI</small></dd></div>
          </dl>
          <p>Subyacente {fmt(details.spot)} {strikeCurrency} · {details.days} días al vencimiento</p>
          <p>Modelo BSM (neutral al riesgo) · Tasa {fmt(details.rate * 100, 2)} % · Dividendos {fmt(details.dividendYield * 100, 2)} %</p>
        </> : <p>Probabilidades y griegas teóricas no disponibles.
          {cell?.eligible && " Revisá el spot, el vencimiento y los parámetros de Análisis."}</p>}
        {cell?.rateSource && <p>{cell.rateSource}</p>}
        <p>{tradeStatus}</p>
        {cell?.eligible && !color && <p>Sin rango suficiente para una escala comparativa.</p>}
      </> : "Probabilidades y griegas de la opción"}
    </div>
  </td>;
}

export type OptionMetricField = "volume" | "change" | "delta" | "iv" | "theta" | "extrinsic" | "last" | "mid" | "spreadPercent" | "lastTradeAt"
  | "referencePrice" | "intrinsic" | "gamma" | "vega" | "extrinsicBid" | "extrinsicAsk";

export const extraMetricLabels = {
  referencePrice: "Precio de referencia", intrinsic: "Valor intrínseco", gamma: "Gamma teórica", vega: "Vega teórica",
};

export function OptionMetricCell({ contract, field, cell, scale }: {
  contract?: OptionContract; field: OptionMetricField; cell?: MetricCell; scale: MetricScale;
}) {
  const symbol = contract?.symbol ?? "Contrato no disponible";
  if (field === "referencePrice" || field === "intrinsic" || field === "gamma" || field === "vega") {
    const value = cell?.[field];
    const format = field === "gamma" || field === "vega" ? formatSensitivity : fmt;
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
  if (field === "theta" || field === "extrinsic" || field === "extrinsicBid" || field === "extrinsicAsk") {
    const value = cell?.[field], label = field === "theta" ? "Theta teórico" : field === "extrinsicBid" ? "Extrínseco Bid"
      : field === "extrinsicAsk" ? "Extrínseco Ask" : "Extrínseco";
    const price = field === "extrinsicBid" ? "Bid" : field === "extrinsicAsk" ? "Ask" : "Mid (BID/ASK)";
    const explanation = field === "theta" ? "Theta BSM europeo por unidad de prima y día calendario. Usa VI nativa, fecha de hoy y tasa/dividendos de Análisis. La antigüedad de la VI se consulta en su columna."
      : `Precio ${price} menos valor intrínseco, por unidad de prima. Los valores negativos no se recortan.`;
    return <td className="ct-opt-metric" aria-label={`${label} ${symbol}`} title={`${explanation}${value === undefined ? " Sin datos compatibles suficientes." : ""}`}>
      {value === undefined ? "—" : formatOptionAmount(value)}
    </td>;
  }
  if (field === "iv") {
    return contract ? <VolatilityCell key={contract.id} contract={contract} cell={cell} scale={scale} />
      : <td className="ct-opt-metric ct-opt-iv" aria-label={`VI ${symbol}`}><span className="ct-opt-iv-value excluded" data-grading="excluded">—</span></td>;
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
