export interface RatioInstrument {
  id: string; symbol: string; market: string; currency: string; settlement: string;
}
export type RatioFormat = "number" | "percent";
export function defaultRatioFormat(a?: RatioInstrument, b?: RatioInstrument): RatioFormat {
  return a?.currency && a.currency === b?.currency ? "percent" : "number";
}
export interface RatioPair { id: string; a: RatioInstrument; b: RatioInstrument; format?: RatioFormat }
export interface RatioConfig { schema: 1; id: string; revision: number; pairs: RatioPair[] }
export interface RatioQuote {
  last?: number; reference?: number; tradedAt?: number; referenceDate?: string; issue?: string;
}
export interface RatioWidgetState { config: RatioConfig; width: number; height: number; issue?: string }
export interface RatiosState {
  context: number; dashboardId?: string; canAdd: boolean; connected: boolean;
  widgets: RatioWidgetState[]; quotes: Record<string, RatioQuote>; issue?: string;
}
export const emptyState: RatiosState = { context: 0, canAdd: false, connected: false, widgets: [], quotes: {} };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export function calculateRatio(a?: RatioQuote, b?: RatioQuote) {
  if (a?.issue || b?.issue) return { issue: a?.issue || b?.issue };
  if (!finite(a?.last) || !finite(b?.last)) return { issue: "Sin último precio" };
  if (b.last === 0) return { issue: "El precio de B es cero" };
  const ratio = a.last / b.last;
  if (!finite(ratio)) return { issue: "Ratio fuera de rango" };
  if (!finite(a.reference) || !finite(b.reference) || a.reference === 0 || b.reference === 0) {
    return { ratio, referenceIssue: "Sin referencia diaria" };
  }
  if (a.referenceDate && b.referenceDate && a.referenceDate !== b.referenceDate) {
    return { ratio, referenceIssue: "Referencias de fechas distintas" };
  }
  const reference = a.reference / b.reference;
  const change = (ratio / reference - 1) * 100;
  return finite(reference) && reference !== 0 && finite(change) ? { ratio, change } : { ratio, referenceIssue: "Sin referencia diaria válida" };
}
export function marketLabel(value: string) { return ({ bm: "BYMA", rx: "A3" } as Record<string, string>)[value] || value || "S/D"; }
export function currencyLabel(value: string) { return value === "EXT" ? "USD C" : value || "S/D"; }
export function instrumentDetail(i: RatioInstrument) { return `${marketLabel(i.market)} · ${currencyLabel(i.currency)}`; }
export function tickerKey(value: string) { return value.replace(/\(\s*CI\s*\)/gi, " CI ").trim().replace(/\s+/g, " ").toLocaleUpperCase(); }
export function exactTickerMatches(query: string, options: readonly RatioInstrument[]) {
  const key = tickerKey(query);
  return key ? options.filter(option => tickerKey(option.symbol) === key) : [];
}
export function numberLabel(value?: number) {
  if (!finite(value)) return "—";
  return value !== 0 && Math.abs(value) < 0.000001
    ? value.toLocaleString("es-AR", { maximumSignificantDigits: 7 })
    : value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}
export function ratioLabel(value?: number, format: RatioFormat = "number") {
  if (!finite(value)) return "—";
  const shown = format === "percent" ? (value - 1) * 100 : value;
  if (!finite(shown)) return "—";
  const label = format === "percent" || Math.abs(shown) >= 100
    ? shown.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : numberLabel(shown);
  return format === "percent" ? label + "%" : label;
}
export function tradeLabel(timestamp?: number) {
  if (!finite(timestamp)) return "Hora de última operación no disponible";
  return new Date(timestamp).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium" });
}
