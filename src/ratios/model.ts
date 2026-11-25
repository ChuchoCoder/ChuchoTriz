export interface RatioInstrument {
  id: string; symbol: string; market: string; currency: string; settlement: string;
  monitorOnly?: boolean;
}
export type RatioFormat = "number" | "percent";
export function defaultRatioFormat(a?: RatioInstrument, b?: RatioInstrument): RatioFormat {
  return a?.currency && a.currency === b?.currency ? "percent" : "number";
}
export interface RatioReference { c?: RatioInstrument; cDivisor?: 100 }
export interface RatioPair extends RatioReference { id: string; a: RatioInstrument; b: RatioInstrument; format?: RatioFormat }
export interface RatioConfig { schema: 1 | 2 | 3; id: string; revision: number; pairs: RatioPair[] }
export interface RatioQuote {
  last?: number; reference?: number; tradedAt?: number; referenceDate?: string; issue?: string;
}
export interface RatioColumns { lastA: boolean; lastB: boolean; referenceC: boolean }
export const defaultRatioColumns: RatioColumns = { lastA: true, lastB: true, referenceC: true };
export interface RatioWidgetState { config: RatioConfig; width: number; height: number; columns?: { revision: number; visible: RatioColumns }; issue?: string }
export interface DollarSelection { kind: "MEP" | "CCL"; bond: "AL30" | "GD30"; term: "24h" | "CI" }
export interface DollarWidgetState {
  config: DollarSelection & RatioReference & { id: string; revision: number };
  pair?: Pick<RatioPair, "a" | "b"> & RatioReference;
  issue?: string;
}
export interface RatiosState {
  context: number; dashboardId?: string; canAdd: boolean; connected: boolean;
  widgets: RatioWidgetState[]; dollarWidgets?: DollarWidgetState[]; quotes: Record<string, RatioQuote>; issue?: string;
}
export const emptyState: RatiosState = { context: 0, canAdd: false, connected: false, widgets: [], quotes: {} };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export function referenceCQuote(quotes: Record<string, RatioQuote>, { c, cDivisor }: RatioReference): RatioQuote | undefined {
  if (!c) return undefined;
  const quote = quotes[c.id] ?? {};
  if (!cDivisor) return quote;
  return {
    ...quote,
    last: quote.last === undefined ? undefined : quote.last / cDivisor,
    reference: quote.reference === undefined ? undefined : quote.reference / cDivisor,
  };
}
export function referenceCFormula(divisor?: RatioReference["cDivisor"]) {
  return divisor ? `(C ÷ ${divisor})` : "C";
}
export interface RatioResult { ratio?: number; absoluteDifference?: number; change?: number; issue?: string; referenceIssue?: string }
export function calculateRatio(a?: RatioQuote, b?: RatioQuote, c?: RatioQuote): RatioResult {
  if (a?.issue || b?.issue || c?.issue) return { issue: a?.issue || b?.issue || c?.issue };
  if (!finite(a?.last) || !finite(b?.last)) return { issue: "Sin último precio" };
  if (b.last === 0) return { issue: "El precio de B es cero" };
  if (c && (!finite(c.last) || c.last <= 0)) return { issue: "Sin cotización válida de la referencia C" };
  const baseRatio = a.last / b.last;
  const ratio = baseRatio / (c?.last ?? 1);
  const absoluteDifference = c ? Math.abs(baseRatio - c.last!) : undefined;
  if (!finite(ratio) || c && !finite(absoluteDifference)) return { issue: "Ratio fuera de rango" };
  const current = { ratio, absoluteDifference };
  if (!finite(a.reference) || !finite(b.reference) || a.reference === 0 || b.reference === 0 || c && (!finite(c.reference) || c.reference <= 0)) {
    return { ...current, referenceIssue: "Sin referencia diaria" };
  }
  if (new Set([a.referenceDate, b.referenceDate, c?.referenceDate].filter(Boolean)).size > 1) {
    return { ...current, referenceIssue: "Referencias de fechas distintas" };
  }
  const reference = (a.reference / b.reference) / (c?.reference ?? 1);
  const change = (ratio / reference - 1) * 100;
  return finite(reference) && reference !== 0 && finite(change) ? { ...current, change } : { ...current, referenceIssue: "Sin referencia diaria válida" };
}
function financialDollarLabel(a: RatioInstrument, b: RatioInstrument) {
  if (!a.market || a.market !== b.market || a.settlement !== b.settlement) return;

  const aTicker = tickerKey(a.symbol), bTicker = tickerKey(b.symbol);
  const isCash = a.settlement === "1" || aTicker.endsWith(" CI");
  if (isCash !== (b.settlement === "1" || bTicker.endsWith(" CI"))) return;

  const numerator = aTicker.replace(/ CI$/, "");
  const denominator = bTicker.replace(/ CI$/, "");
  const base = denominator.slice(0, -1);
  if (!base) return;

  const instrument = isCash ? `${base} CI` : base;
  if (b.currency === "USD" && denominator.endsWith("D") && a.currency === "ARS" && numerator === base) return `MEP ${instrument}`;
  // Matriz can report BYMA cable species as USD, like their local-dollar counterparts.
  const cableCurrency = b.currency === "EXT" || (b.market === "bm" && b.currency === "USD");
  if (!cableCurrency || !denominator.endsWith("C")) return;
  if (a.currency === "ARS" && numerator === base) return `CCL ${instrument}`;
  if (a.currency === "USD" && numerator === base + "D") return `CANJE ${instrument}`;
}
export function pairLabel({ a, b, c, cDivisor }: Pick<RatioPair, "a" | "b"> & RatioReference) {
  const label = financialDollarLabel(a, b) ?? `${a.symbol}/${b.symbol}`;
  if (!c) return label;
  const reference = cDivisor ? `(${c.symbol} ÷ ${cDivisor})` : c.symbol;
  return `${label} vs ${reference}`;
}
export function pairKey(p: { a: { id: string }; b: { id: string }; c?: { id: string }; cDivisor?: 100 }) {
  return JSON.stringify([p.a.id, p.b.id, p.c?.id ?? null, p.cDivisor ?? 1]);
}
export function marketLabel(value: string) { return ({ bm: "BYMA", rx: "A3" } as Record<string, string>)[value] || value || "S/D"; }
export function currencyLabel(value: string) { return value === "EXT" ? "USD C" : value || "S/D"; }
export function instrumentDetail(i: RatioInstrument) { return `${marketLabel(i.market)} · ${currencyLabel(i.currency)}${i.id === "rx_DDF_DLR_SPOT" ? " · Dólar oficial · sólo monitor" : i.monitorOnly && i.settlement === "Futuro" ? " · Futuro · sólo monitor" : ""}`; }
export function tickerKey(value: string) { return value.replace(/\(\s*CI\s*\)/gi, " CI ").trim().replace(/\s+/g, " ").toLocaleUpperCase(); }
export function exactTickerMatches(query: string, options: readonly RatioInstrument[]) {
  const key = tickerKey(query);
  return key ? options.filter(option => tickerKey(option.symbol) === key || option.id === "rx_DDF_DLR_SPOT" && ["DOLAR", "DOLAR OFICIAL", "DOLAR USA"].includes(key.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) : [];
}
export function numberLabel(value?: number) {
  if (!finite(value)) return "—";
  return value !== 0 && Math.abs(value) < 0.000001
    ? value.toLocaleString("es-AR", { maximumSignificantDigits: 7 })
    : value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
export function ratioLabel(value?: number, format: RatioFormat = "number", absoluteDifference?: number) {
  if (!finite(value)) return "—";
  if (absoluteDifference !== undefined && !finite(absoluteDifference)) return "—";
  const shown = format === "percent" ? (value - 1) * 100 : value;
  if (!finite(shown)) return "—";
  const label = format === "percent" || Math.abs(shown) >= 100
    ? shown.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: format === "percent" && absoluteDifference !== undefined ? "exceptZero" : "auto" })
    : numberLabel(shown);
  const formatted = format === "percent" ? label + "%" : label;
  return absoluteDifference === undefined ? formatted : `${formatted} (${Math.abs(absoluteDifference).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}
export function tradeLabel(timestamp?: number) {
  if (!finite(timestamp)) return "Hora de última operación no disponible";
  return new Date(timestamp).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium" });
}

/** Market time of the latest input trade, never the polling or render time. */
export function ratioUpdatedAt(a?: RatioQuote, b?: RatioQuote, c?: RatioQuote) {
  if (calculateRatio(a, b, c).ratio === undefined) return undefined;
  const times = (c ? [a, b, c] : [a, b]).map(q => q?.tradedAt);
  return times.every((at): at is number => finite(at) && at > 0 && Number.isFinite(new Date(at).getTime())) ? Math.max(...times) : undefined;
}
export function ratioTimeLabel(timestamp?: number) {
  return timestamp === undefined ? "—" : new Date(timestamp).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23" });
}
