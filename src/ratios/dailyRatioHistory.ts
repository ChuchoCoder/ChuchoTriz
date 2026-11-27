import { calculateRatio, type RatioFormat } from "./model";

export const dayMilliseconds = 86400000;
export const movingCloseCount = 20;
export const maxHistoryDays = 366;
const marketDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" });

export interface DailyRange { from: number; to: number }
export type DailyHistory = Record<string, { points: { day: number; value: number }[]; issue?: string }>;
export interface DailyHistoryRequest extends DailyRange {
  context: number; dashboardId: string; widgetId: string; pairId: string; refresh: boolean; older?: true;
}
export type ReadDailyHistory = (request: DailyHistoryRequest) => Promise<DailyHistory>;
export interface HistoryPair { a: string; b: string; c?: string; cDivisor?: 100; format?: RatioFormat }
export type BandMode = "static" | "moving";
export interface DailyPoint { day: number; value?: number }
export interface Deviation { mean: number; sigma: number }

export function lastClosedDay(now: number) {
  return Date.parse(marketDate.format(now)) - dayMilliseconds;
}

export function monthRange(to: number, months: number): DailyRange {
  const end = new Date(to), day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() - months);
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  end.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return { from: end.getTime(), to };
}

export function dailyRatioPoints(pair: HistoryPair, history: DailyHistory) {
  const closes = (id: string) => new Map((history[id]?.points ?? []).map(point => [point.day, point.value]));
  const a = closes(pair.a), b = closes(pair.b), c = pair.c ? closes(pair.c) : undefined;
  const days = new Set([...a.keys(), ...b.keys(), ...(c?.keys() ?? [])]);
  if (!days.size) return [];
  const first = Math.min(...days), last = Math.max(...days);
  const points: DailyPoint[] = [];
  // A weekday with no published closes is a gap (including holidays).
  // Weekend dates appear only if a native series actually supplied a bar.
  for (let day = first; day <= last; day += dayMilliseconds) {
    const weekday = new Date(day).getUTCDay();
    if (!days.has(day) && (weekday === 0 || weekday === 6)) continue;
    const reference = c?.get(day);
    const ratio = calculateRatio({ last: a.get(day) }, { last: b.get(day) },
      c ? { last: reference === undefined ? undefined : reference / (pair.cDivisor ?? 1) } : undefined).ratio;
    const shown = ratio !== undefined && pair.format === "percent" ? (ratio - 1) * 100 : ratio;
    points.push({ day, value: shown !== undefined && Number.isFinite(shown) ? shown : undefined });
  }
  return points;
}

function deviation(values: number[]): Deviation | undefined {
  if (values.length < 2) return;
  const mean = values.reduce((sum, value) => sum + value / values.length, 0);
  const sigma = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2 / values.length, 0));
  if (Number.isFinite(mean) && Number.isFinite(sigma) && Number.isFinite(mean + 2 * sigma) && Number.isFinite(mean - 2 * sigma)) return { mean, sigma };
}

export function historicalBands(points: DailyPoint[], { from, to }: DailyRange, mode: BandMode) {
  if (mode === "static") {
    const visible = points.filter(point => from <= point.day && point.day <= to);
    const band = deviation(visible.flatMap(point => point.value ?? []));
    return visible.map(point => ({ ...point, band }));
  }
  const recent: number[] = [];
  return points.flatMap(point => {
    if (point.day > to) return [];
    const visible = point.day >= from;
    const band = visible && recent.length === movingCloseCount ? deviation(recent) : undefined;
    if (point.value !== undefined) {
      if (recent.length === movingCloseCount) recent.shift();
      recent.push(point.value);
    }
    return visible ? [{ ...point, band }] : [];
  });
}
