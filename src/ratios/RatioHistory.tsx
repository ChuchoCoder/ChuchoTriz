import { memo, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { pairLabel, type RatioPair } from "./model";
import {
  dailyRatioPoints, dayMilliseconds, historicalBands, lastClosedDay, maxHistoryDays, monthRange, movingCloseCount,
  type BandMode, type DailyHistory, type DailyRange, type ReadDailyHistory,
} from "./dailyRatioHistory";
import "./RatioHistory.css";

const shortDate = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" });
const amount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });
const fieldDate = (day: number) => new Date(day).toISOString().slice(0, 10);
const display = (value: number, percent: boolean) => amount.format(value) + (percent ? "%" : "");
const rangePresets = [["1", "1 mes"], ["3", "3 meses"], ["6", "6 meses"], ["12", "12 meses"]] as const;
type PlotPoints = ReturnType<typeof historicalBands>;
type HistoryReply = { key: string; history?: DailyHistory; error?: string };
const limits = [-2, -1, 1, 2] as const;

export function plotGeometry(points: PlotPoints, range: DailyRange, width: number, height: number, percent: boolean) {
  const values = points.flatMap(({ value, band }) => [
    ...(value === undefined ? [] : [value]),
    ...(band ? [band.mean - 2 * band.sigma, band.mean + 2 * band.sigma] : []),
  ]);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = Math.max((high - low) * 0.06, Math.max(Math.abs(low), Math.abs(high), 1) * Number.EPSILON * 8);
  const min = low - (low === high ? Math.max(0.0001, Math.abs(low) * 0.002) : padding);
  const max = high + (low === high ? Math.max(0.0001, Math.abs(high) * 0.002) : padding);
  const axisValue = new Intl.NumberFormat("es-AR", { maximumFractionDigits: Math.min(8, Math.max(0, Math.ceil(-Math.log10((max - min) / 3)) + 1)) });
  const labels = [0, 1, 2, 3].map(i => {
    const value = min + (max - min) * i / 3;
    return { value, label: axisValue.format(value) + (percent ? "%" : "") };
  });
  const top = 8, bottom = height - 21, left = 6;
  const right = Math.max(left + 24, width - Math.max(...labels.map(({ label }) => label.length)) * 6 - 8);
  const fraction = (day: number) => range.from === range.to ? 0.5 : (day - range.from) / (range.to - range.from);
  const x = (day: number) => left + (right - left) * fraction(day);
  const y = (value: number) => bottom - (bottom - top) * (value - min) / (max - min);
  const path = (valueFor: (point: PlotPoints[number]) => number | undefined) => {
    let continues = false;
    return points.map(point => {
      const value = valueFor(point);
      if (value === undefined) { continues = false; return ""; }
      const op = continues ? "L" : "M";
      continues = true;
      return `${op}${x(point.day)},${y(value)}`;
    }).join("");
  };
  const withBand = points.filter(point => point.band);
  const referencePath = (valueFor: (point: PlotPoints[number]) => number | undefined) => {
    if (withBand.length !== 1) return path(valueFor);
    const value = valueFor(withBand[0]);
    if (value === undefined) return "";
    const center = x(withBand[0].day);
    // A single day gets the full plot width. Within a wider window, a short
    // reference marks the only date with enough history for the bands.
    const start = range.from === range.to ? left : Math.max(left, center - 16);
    const end = range.from === range.to ? right : Math.min(right, center + 16);
    return `M${start},${y(value)}H${end}`;
  };
  const axisDays = range.from === range.to ? [range.to] : [range.from, range.to];
  if (right - left > 155 && range.to - range.from > 2 * dayMilliseconds) {
    axisDays.splice(1, 0, Math.round((range.from + range.to) / (2 * dayMilliseconds)) * dayMilliseconds);
  }
  return {
    top, bottom, left, right, x, y, axisDays, labels,
    actual: path(point => point.value),
    mean: referencePath(point => point.band?.mean),
    bands: limits.map(sigma => ({ sigma, path: referencePath(point => point.band && point.band.mean + sigma * point.band.sigma) })),
  };
}

const HistoryPlot = memo(function HistoryPlot({ points, range, percent, label }: { points: PlotPoints; range: DailyRange; percent: boolean; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 128 });
  const [cursorDay, setCursorDay] = useState<number>();
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const geometry = useMemo(() => plotGeometry(points, range, width, height, percent),
    [points, range, width, height, percent]);
  const { x, y, top, bottom, left, right } = geometry;
  const latest = points.findLast(point => point.value !== undefined)!;
  const focused = points.find(point => point.day === cursorDay);
  const shown = focused ?? latest;
  return <>
    <div className="ct-ratio-history-plot" ref={container}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico diario de ${label}`} tabIndex={0}
        onBlur={() => setCursorDay(undefined)} onPointerLeave={() => setCursorDay(undefined)}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect();
          const pointer = (event.clientX - box.left) * width / box.width;
          const day = range.from + (pointer - left) * (range.to - range.from) / (right - left);
          setCursorDay(points.reduce((best, point) => Math.abs(point.day - day) < Math.abs(best.day - day) ? point : best).day);
        }}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const index = points.indexOf(shown);
          setCursorDay(points[Math.min(points.length - 1, Math.max(0, index + (event.key === "ArrowLeft" ? -1 : 1)))].day);
        }}>
        {geometry.labels.map(({ value, label: tick }, index) => <g key={index}>
          <path className="ct-ratio-history-grid" d={`M${left},${y(value)}H${right}`} />
          <text x={right + 4} y={y(value)} dominantBaseline="middle">{tick}</text>
        </g>)}
        {geometry.axisDays.map(day => <text key={day} x={x(day)} y={bottom + 16}
          textAnchor={range.from === range.to ? "middle" : day === range.from ? "start" : day === range.to ? "end" : "middle"}>{shortDate.format(day)}</text>)}
        {geometry.bands.filter(line => line.path).map(({ sigma, path }) => <path key={sigma} data-sigma={sigma}
          className={`ct-ratio-history-sigma-${Math.abs(sigma)}`} d={path} />)}
        {geometry.mean && <path className="ct-ratio-history-mean" d={geometry.mean} />}
        <path className="ct-ratio-history-line" d={geometry.actual} />
        {points.map(({ day, value }, index) => value !== undefined && (day === latest.day ||
          (points[index - 1]?.value === undefined && points[index + 1]?.value === undefined))
          ? <circle key={day} cx={x(day)} cy={y(value)} r={2.5} /> : null)}
        {focused && <path className="ct-ratio-history-cursor" d={`M${x(focused.day)},${top}V${bottom}`} />}
      </svg>
    </div>
    <p className="ct-ratio-history-point">
      <time dateTime={fieldDate(shown.day)}>{fullDate.format(shown.day)}</time>
      {" · "}{shown.value === undefined ? "Sin cierre coincidente" : display(shown.value, percent)}
    </p>
  </>;
});

export function RatioHistory({ pair, context, dashboardId, widgetId, visible, read, onClose }: {
  pair: RatioPair; context: number; dashboardId?: string; widgetId: string; visible: boolean;
  read: ReadDailyHistory; onClose(): void;
}) {
  const titleId = useId();
  const [preset, setPreset] = useState("3");
  const [custom, setCustom] = useState<DailyRange>();
  const [editing, setEditing] = useState(false);
  const [dateIssue, setDateIssue] = useState("");
  const [mode, setMode] = useState<BandMode>("static");
  const [response, setResponse] = useState<HistoryReply>();
  const [olderResponse, setOlderResponse] = useState<HistoryReply>();
  const [retry, setRetry] = useState<{ key: string; attempt: number }>();
  const usedRetry = useRef(0);
  const usedOlderRetry = useRef(0);
  const end = lastClosedDay(Date.now());
  const range = useMemo(() => preset === "custom" && custom ? custom : monthRange(end, Number(preset)), [preset, custom, end]);
  const { from, to } = range;
  const pairId = pair.id, a = pair.a.id, b = pair.b.id, c = pair.c?.id;
  const cDivisor = pair.cDivisor, format = pair.format, percent = format === "percent";
  const key = JSON.stringify([context, dashboardId, widgetId, pairId, a, b, c, from, to]);
  const attempt = retry?.key === key ? retry.attempt : 0;
  const requestKey = key + ":" + attempt;
  const history = response?.key === requestKey ? response.history : undefined;
  const error = response?.key === requestKey ? response.error : undefined;
  useEffect(() => {
    if (!visible || document.hidden || !dashboardId || response?.key === requestKey) return;
    let cancelled = false;
    const refresh = attempt > usedRetry.current;
    if (refresh) usedRetry.current = attempt;
    void read({ context, dashboardId, widgetId, pairId, from, to, refresh }).then(
      history => { if (!cancelled && !document.hidden) setResponse({ key: requestKey, history }); },
      error => { if (!cancelled && !document.hidden) setResponse({ key: requestKey, error: error instanceof Error ? error.message : "No se pudo cargar el histórico diario." }); },
    );
    return () => { cancelled = true; };
  }, [visible, pairId, context, dashboardId, widgetId, from, to, response?.key, requestKey, attempt, read]);
  const aligned = useMemo(() => history ? dailyRatioPoints({ a, b, c, cDivisor, format }, history, range) : [],
    [history, a, b, c, cDivisor, format, range]);
  const needsOlder = useMemo(() => mode === "moving" && aligned.some(point => point.day >= from && point.value !== undefined) &&
    aligned.filter(point => point.day < from && point.value !== undefined).length < movingCloseCount, [mode, aligned, from]);
  const older = olderResponse?.key === requestKey ? olderResponse : undefined;
  useEffect(() => {
    if (!visible || document.hidden || !dashboardId || !needsOlder || older) return;
    let cancelled = false;
    const refresh = attempt > usedOlderRetry.current;
    if (refresh) usedOlderRetry.current = attempt;
    void read({ context, dashboardId, widgetId, pairId, from, to, refresh, older: true }).then(
      history => { if (!cancelled && !document.hidden) setOlderResponse({ key: requestKey, history }); },
      () => { if (!cancelled && !document.hidden) setOlderResponse({ key: requestKey, error: "No se pudieron buscar cierres previos para las bandas móviles." }); },
    );
    return () => { cancelled = true; };
  }, [visible, needsOlder, older, context, dashboardId, widgetId, pairId, from, to, requestKey, attempt, read]);
  const { points, count, lastBand, hasBands } = useMemo(() => {
    const prefix = mode === "moving" && older?.history ? dailyRatioPoints({ a, b, c, cDivisor, format }, older.history) : [];
    const points = historicalBands([...prefix, ...aligned], range, mode);
    const matched = points.filter(point => point.value !== undefined);
    return { points, count: matched.length, lastBand: matched.at(-1)?.band, hasBands: points.some(point => point.band) };
  }, [aligned, range, mode, older?.history, a, b, c, cDivisor, format]);

  const label = pairLabel(pair);
  const issues = [pair.a, pair.b, ...(pair.c ? [pair.c] : [])].flatMap(({ id, symbol }) =>
    history?.[id]?.issue ? [`${symbol}: ${history[id].issue}`] : []);
  const olderIssue = needsOlder && (older?.error || Object.values(older?.history ?? {}).some(series => series.issue) &&
    "Matriz no devolvió todos los cierres previos para las bandas móviles.");
  const status = error || (issues.length ? [...new Set(issues)].join(" · ") : olderIssue || "");
  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const from = Date.parse(String(fields.get("from"))), to = Date.parse(String(fields.get("to")));
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to > end || to - from > maxHistoryDays * dayMilliseconds) {
      setDateIssue("Elegí un rango válido de hasta 12 meses con ruedas cerradas.");
      return;
    }
    setCustom({ from, to }); setPreset("custom"); setEditing(false); setDateIssue("");
  }
  return <section className="ct-ratio-history" aria-labelledby={titleId}>
    <header>
      <div><span>Histórico diario</span><strong id={titleId}>{label}</strong></div>
      <button type="button" className="ct-ratio-history-close" aria-label="Cerrar histórico de Ratios" onClick={onClose}>×</button>
    </header>
    <div className="ct-ratio-history-controls">
      <label>Rango <select aria-label="Rango histórico" value={editing ? "custom" : preset} onChange={event => {
        const next = event.target.value;
        setDateIssue("");
        setEditing(next === "custom");
        if (next !== "custom") setPreset(next);
      }}>
        {rangePresets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        <option value="custom">Desde / hasta</option>
      </select></label>
      <label>Bandas <select aria-label="Tipo de bandas" value={mode} onChange={event => setMode(event.target.value === "moving" ? "moving" : "static")}>
        <option value="static">Estáticas</option><option value="moving">Móviles</option>
      </select></label>
      {preset === "custom" && !editing && <button type="button" onClick={() => setEditing(true)}>Editar fechas</button>}
    </div>
    {editing && <form className="ct-ratio-history-controls" onSubmit={applyDates}>
      <label>Desde <input type="date" name="from" required min="1971-01-01" max={fieldDate(end)} defaultValue={fieldDate(from)} /></label>
      <label>Hasta <input type="date" name="to" required min="1971-01-01" max={fieldDate(end)} defaultValue={fieldDate(to)} /></label>
      <button type="submit">Aplicar</button>
      <button type="button" onClick={() => { setEditing(false); setDateIssue(""); }}>Cancelar</button>
      {dateIssue && <span role="alert">{dateIssue}</span>}
    </form>}
    {!history && !error && <p className="ct-ratio-history-status" role="status">Cargando cierres diarios…</p>}
    {status && <p className="ct-ratio-history-status" role="status">{status}</p>}
    {history && !count && <p className="ct-ratio-history-status" role="status">Sin cierres coincidentes en el rango.</p>}
    {(status || history && !count) && <button type="button" className="ct-ratio-history-retry"
      onClick={() => setRetry(previous => ({ key, attempt: (previous?.attempt ?? 0) + 1 }))}>Reintentar histórico</button>}
    {!!count && <>
      <div className="ct-ratio-history-legend" aria-label="Leyenda del histórico">
        <span><i className="ct-ratio-history-line" />Ratio</span>
        {hasBands && <><span><i className="ct-ratio-history-mean" />Media</span>
          <span><i className="ct-ratio-history-sigma-1" />±1σ</span><span><i className="ct-ratio-history-sigma-2" />±2σ</span></>}
      </div>
      <HistoryPlot key={requestKey} points={points} range={range} percent={percent} label={label} />
      <p className="ct-ratio-history-summary">
        {count} {count === 1 ? "cierre coincidente" : "cierres coincidentes"}
        {count < points.length && ` de ${points.length}`}
        {lastBand && ` · Media ${display(lastBand.mean, percent)} · σ ${amount.format(lastBand.sigma)}${percent ? " p.p." : ""}`}
      </p>
      {mode === "moving" && <p className="ct-ratio-history-summary">
        {needsOlder && !older ? "Buscando cierres previos…" : hasBands ? `Bandas de los ${movingCloseCount} cierres coincidentes previos.`
          : `Se necesitan ${movingCloseCount} cierres previos para las bandas móviles.`}
      </p>}
    </>}
  </section>;
}
