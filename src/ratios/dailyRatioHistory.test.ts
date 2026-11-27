import { describe, expect, it } from "vitest";
import { dailyRatioPoints, dayMilliseconds, historicalBands, lastClosedDay, monthRange, type DailyPoint } from "./dailyRatioHistory";

const date = (day: number) => Date.UTC(2026, 0, day);
const range = { from: date(2), to: date(6) };
const row = (day: number, value: number) => ({ day: date(day), value });

describe("histórico diario de Ratios", () => {
  it("respeta las ruedas argentinas y los meses calendario", () => {
    expect(lastClosedDay(Date.parse("2026-06-01T01:30:00Z"))).toBe(Date.parse("2026-05-30"));
    expect(lastClosedDay(Date.parse("2026-06-01T03:00:00Z"))).toBe(Date.parse("2026-05-31"));
    expect(monthRange(Date.parse("2026-05-31"), 3)).toEqual({ from: Date.parse("2026-02-28"), to: Date.parse("2026-05-31") });
    expect(monthRange(Date.parse("2024-05-31"), 3).from).toBe(Date.parse("2024-02-29"));
  });

  it("alinea A/B/C por rueda, mantiene faltantes y aplica el divisor y formato de la fila", () => {
    const history = {
      a: { points: [row(3, 115), row(2, 120), row(5, 150), row(6, 180)] },
      b: { points: [row(6, 0), row(2, 30), row(5, 50), row(4, 50)] },
      c: { points: [row(2, 200), row(3, 150), row(6, 200)] },
    };
    const series = dailyRatioPoints({ a: "a", b: "b", c: "c", cDivisor: 100, format: "percent" }, history);
    expect(series).toEqual([row(2, 100), ...[3, 4, 5, 6].map(day => ({ day: date(day), value: undefined }))]);
    expect(dailyRatioPoints({ a: "b", b: "a" }, history)[0]).toEqual(row(2, 0.25));
  });

  it("calcula la media y el desvío poblacional sólo con cierres del rango visible", () => {
    const points = [row(1, 100), row(2, 1), row(3, 3), { day: date(4) }, row(6, 5), row(7, 200)];
    const result = historicalBands(points, range, "static");
    expect(result.map(point => point.band?.mean)).toEqual([3, 3, 3, 3]);
    expect(result[2]).toMatchObject({ day: date(4), band: { mean: 3, sigma: Math.sqrt(8 / 3) } });
    expect(result[2].value).toBeUndefined();
    expect(historicalBands(points, { from: date(2), to: date(2) }, "static")[0].band).toBeUndefined();
  });

  it("marca como hueco una fecha hábil omitida por todas las patas pero conserva el fin de semana", () => {
    const bars = [row(2, 15), row(6, 30)];
    expect(dailyRatioPoints({ a: "a", b: "b" }, { a: { points: bars }, b: { points: bars } })).toEqual([
      row(2, 1), { day: date(5), value: undefined }, row(6, 1),
    ]);
  });

  it("usa los 20 cierres válidos previos en modo móvil, incluidos los anteriores al rango", () => {
    const days: DailyPoint[] = Array.from({ length: 23 }, (_, i) => ({ day: date(i + 1), value: i === 5 ? undefined : i }));
    const result = historicalBands(days, { from: date(21), to: date(23) }, "moving");
    expect(result[0].band).toBeUndefined();
    expect(result[1].band?.mean).toBeCloseTo(10.25);
    expect(result[2].band?.mean).toBeCloseTo(11.30);
    expect(result[2].day - result[1].day).toBe(dayMilliseconds);
  });
});
