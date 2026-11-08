import { lastTradedPremium, type Contract as OptionContract, type Quote as OptionMarketMetrics, type Snapshot as OptionsSnapshot } from "./market";
import { dateDay, theoreticalGreeks } from "./model";

export const finiteMetric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): value is number => finiteMetric(value) && value > 0;
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const day = (time: number) => dateFormat.format(time);

function decimalPrice(price: number) {
  const [significand, exponent = "0"] = String(price).split("e");
  const [whole, fraction = ""] = significand.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

/** Subtract the quoted decimals before converting back to a number. */
function quotedIntrinsic(kind: OptionContract["kind"], spot: number, strike: number) {
  const [high, low] = kind === "call" ? [spot, strike] : [strike, spot];
  if (high <= low) return 0;
  const left = decimalPrice(high), right = decimalPrice(low);
  const scale = Math.max(left.scale, right.scale);
  const difference = left.units * 10n ** BigInt(scale - left.scale) - right.units * 10n ** BigInt(scale - right.scale);
  return Number(`${difference}e${-scale}`);
}

export interface MetricCell extends OptionMarketMetrics {
  eligible: boolean; reason: string; theta?: number; extrinsic?: number; mid?: number; spreadPercent?: number;
  intrinsic?: number; gamma?: number; vega?: number; viTradeStatus?: string;
  viDetails?: NonNullable<ReturnType<typeof theoreticalGreeks>> & { spot: number; days: number; rate: number; dividendYield: number };
}
export interface MetricScale { min?: number; max?: number; volumeMax: number; included: number; total: number }
export function deriveOptionMetrics(contracts: OptionContract[], instruments: OptionsSnapshot["instruments"] | undefined,
  settings: { now: number; minutes: string; enabled: boolean; available: boolean; spot?: number; currency?: string; rate?: number; dividendYield?: number }) {
  const parsed = /^\d+$/.test(settings.minutes) ? Number(settings.minutes) : NaN;
  const windowValid = Number.isSafeInteger(parsed) && parsed > 0;
  const nowValid = finiteMetric(settings.now) && settings.now >= 0 && !Number.isNaN(new Date(settings.now).getTime());
  const today = nowValid ? day(settings.now) : "";
  const todayDay = dateDay(today);
  const byId: Record<string, MetricCell> = {};
  const scales: Record<"call" | "put", MetricScale> = {
    call: { volumeMax: 0, included: 0, total: 0 }, put: { volumeMax: 0, included: 0, total: 0 },
  };
  for (const contract of contracts) {
    const raw = instruments?.[contract.id];
    const vi = finiteMetric(raw?.impliedVolatility) ? raw.impliedVolatility : undefined;
    const stamp = finiteMetric(raw?.lastTradeAt) && raw.lastTradeAt >= 0 && !Number.isNaN(new Date(raw.lastTradeAt).getTime()) ? raw.lastTradeAt : undefined;
    const volume = finiteMetric(raw?.nominalVolume) && raw.nominalVolume >= 0 ? raw.nominalVolume : undefined;
    const comparable = settings.available && positive(settings.spot) && positive(contract.strike) && ["ARS", "USD"].includes(settings.currency ?? "")
      && contract.currency === settings.currency && contract.strikeCurrency === settings.currency;
    const days = dateDay(contract.expiration.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")) - todayDay;
    const years = days / 365;
    const modelValid = comparable && years > 0 && years <= 10 && positive(vi) && vi <= 500 && finiteMetric(settings.rate) && settings.rate >= -1 && settings.rate <= 10
      && finiteMetric(settings.dividendYield) && settings.dividendYield >= 0 && settings.dividendYield <= 1;
    const greeks = modelValid ? theoreticalGreeks(contract.kind, settings.spot!, contract.strike, years, vi! / 100, settings.rate!, settings.dividendYield!) : undefined;
    const bid = raw?.bid, ask = raw?.ask;
    let mid: number | undefined, spreadPercent: number | undefined;
    if (settings.available && bid && ask && positive(bid.price) && positive(ask.price) && positive(bid.size) && positive(ask.size) && bid.price < ask.price) {
      mid = bid.price / 2 + ask.price / 2;
      spreadPercent = (ask.price - bid.price) / mid * 100;
    }
    const intrinsicValue = comparable ? quotedIntrinsic(contract.kind, settings.spot!, contract.strike) : undefined;
    const extrinsic = intrinsicValue !== undefined && mid !== undefined ? mid - intrinsicValue : undefined;
    const tradeIssue = stamp === undefined ? "Sin fecha verificable de última operación"
      : stamp > settings.now ? "Fecha de operación posterior al reloj actual"
      : nowValid && day(stamp) !== today ? "Última operación de otra fecha" : undefined;
    const age = stamp === undefined ? NaN : (settings.now - stamp) / 60000;
    const tradeStatus = tradeIssue ?? `Última operación hace ${age.toLocaleString("es-AR", { maximumFractionDigits: 1 })} min`;
    let reason = "", eligible = false;
    if (!settings.available || !nowValid) reason = "Sin lectura de mercado vigente";
    else if (!positive(vi)) reason = "VI no disponible o no válida";
    else if (!settings.enabled) { eligible = true; reason = "Filtro temporal desactivado"; }
    else if (!windowValid) reason = "Ingresá minutos enteros mayores que cero";
    else if (tradeIssue) reason = tradeIssue;
    else {
      eligible = age <= parsed;
      reason = `${tradeStatus}${eligible ? "" : ` · supera ${parsed} min`}`;
    }
    const cell: MetricCell = { impliedVolatility: vi, lastTradeAt: stamp, nominalVolume: volume,
      last: settings.available ? lastTradedPremium(raw) : undefined, mid, spreadPercent,
      referencePrice: settings.available && positive(raw?.referencePrice) ? raw.referencePrice : undefined,
      delta: finiteMetric(raw?.delta) ? raw.delta : undefined,
      changePercent: finiteMetric(raw?.changePercent) ? raw.changePercent : undefined,
      theta: greeks?.theta, gamma: greeks?.gamma, vega: greeks?.vega,
      viTradeStatus: eligible && !settings.enabled ? `${tradeStatus} · ${reason}` : undefined,
      viDetails: eligible && stamp !== undefined && stamp <= settings.now && greeks && Number.isFinite(greeks.probabilityItm) ? {
        ...greeks, spot: settings.spot!, days, rate: settings.rate!, dividendYield: settings.dividendYield!,
      } : undefined,
      intrinsic: intrinsicValue, extrinsic, eligible, reason };
    byId[contract.id] = cell;
    const scale = scales[contract.kind]; scale.total++;
    if (volume !== undefined && settings.available) scale.volumeMax = Math.max(scale.volumeMax, volume);
    if (eligible && vi !== undefined) {
      scale.included++; scale.min = Math.min(scale.min ?? vi, vi); scale.max = Math.max(scale.max ?? vi, vi);
    }
  }
  return { byId, scales, windowValid };
}
/** Green → yellow → orange → red. Undefined means no comparative range. */
export function viGradeColor(cell: MetricCell | undefined, scale: MetricScale) {
  if (!cell?.eligible || !finiteMetric(cell.impliedVolatility) || scale.min === undefined || scale.max === undefined || scale.max <= scale.min) return;
  const stops = [[111, 212, 165], [236, 218, 105], [247, 163, 92], [239, 120, 136]];
  const position = Math.max(0, Math.min(1, (cell.impliedVolatility - scale.min) / (scale.max - scale.min))) * 3;
  const i = Math.min(2, Math.floor(position)), weight = position - i;
  return `rgb(${stops[i].map((v, channel) => Math.round(v + (stops[i + 1][channel] - v) * weight)).join(",")})`;
}
