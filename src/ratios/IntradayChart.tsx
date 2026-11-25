import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarketReader } from "../optionsSimulator/market";
import ToolbarIcon from "../ToolbarIcon";
import { calculateRatio, pairKey, pairLabel, ratioLabel, type RatioPair } from "./model";
import "./IntradayChart.css";

export type IntradayPair = Pick<RatioPair, "a" | "b" | "c" | "cDivisor">;
type View = "ratio" | "comparison" | "spread" | "dollar-spread";
interface Point { at: number; value: number; provisional?: true }
type History = Record<string, { points: Point[]; issue?: string }>;
type Live = Record<string, Map<number, Point>>;
interface LiveResponse { revision: number; start: number; connected: boolean; points: Record<string, Point>; issue?: string }
interface HistoryResponse { revision: number; series: History }
const MINUTE = 60000;
const INTERVAL = 5 * MINUTE;
const DAY = 86400000, ARGENTINA_MIDNIGHT = 3 * 3600000;
const minute = (at: number) => Math.floor(at / MINUTE) * MINUTE;
const bucket = (at: number) => Math.floor(at / INTERVAL) * INTERVAL;
const sessionDay = (at: number) => Math.floor((at - ARGENTINA_MIDNIGHT) / DAY) * DAY + ARGENTINA_MIDNIGHT;
const time = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const date = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });

// All visible charts share one connection to the page-world reader.
let reader: MarketReader | undefined, subscribers = 0;
function acquireReader() {
  const client = reader ??= new MarketReader("ratios-reader.js");
  subscribers++;
  return { client, release() { if (--subscribers === 0) { client.dispose(); reader = undefined; } } };
}

function useIntraday(ids: readonly string[]) {
  const [history, setHistory] = useState<History>({}), [live, setLive] = useState<Live>({});
  const [start, setStart] = useState<number>(), [connected, setConnected] = useState<boolean>();
  const [loading, setLoading] = useState(true), [historyIssue, setHistoryIssue] = useState(""), [liveIssue, setLiveIssue] = useState("");
  const retryHistory = useRef<() => void>(() => {});
  useEffect(() => {
    const { client, release } = acquireReader();
    let disposed = false, revision: number | undefined, previousConnection: boolean | undefined;
    let timer: ReturnType<typeof setTimeout>, historyRequest = 0;
    const loadHistory = (refresh = false) => {
      const request = ++historyRequest;
      setLoading(true); setHistoryIssue("");
      return client.call<HistoryResponse>("ratioIntradayHistory", { ids, refresh }).then(result => {
        if (disposed || request !== historyRequest || result.revision !== revision) return;
        setHistory(previous => Object.fromEntries(ids.map(id => {
          const incoming = result.series[id], existing = previous[id]?.points ?? [];
          // A failed refresh must not remove history already read for this session.
          return [id, { ...incoming, points: mergeMinutes(existing, incoming.points) }];
        })));
      }).catch(error => {
        if (!disposed && request === historyRequest) setHistoryIssue(error.message);
      }).finally(() => {
        if (!disposed && request === historyRequest) setLoading(false);
      });
    };
    const poll = async () => {
      try {
        const result = await client.call<LiveResponse>("ratioIntradayQuotes", { ids });
        if (disposed) return;
        const switched = result.revision !== revision;
        if (switched) {
          revision = result.revision;
          setStart(result.start); setHistory({});
        }
        setConnected(result.connected); setLiveIssue(result.issue ?? "");
        setLive(previous => {
          const current = switched ? {} : previous;
          let next = current;
          for (const [id, point] of Object.entries(result.points)) {
            const samples = current[id], at = minute(point.at), last = samples?.get(at);
            if (last && (last.at > point.at || last.at === point.at && last.value === point.value)) continue;
            if (next === current) next = { ...current };
            next[id] = new Map(samples).set(at, point);
          }
          return next;
        });
        if (switched || previousConnection === false && result.connected) void loadHistory(!switched);
        previousConnection = result.connected;
      } catch (error) {
        if (!disposed) { setConnected(undefined); setLiveIssue(error instanceof Error ? error.message : "Datos en vivo no disponibles."); setLoading(false); }
      } finally {
        if (!disposed) timer = setTimeout(() => void poll(), 2000);
      }
    };
    retryHistory.current = () => { if (revision !== undefined) void loadHistory(true); };
    void poll();
    return () => { disposed = true; clearTimeout(timer); retryHistory.current = () => {}; release(); };
  }, [ids]);
  return { history, live, start, connected, loading, historyIssue, liveIssue, retry: () => retryHistory.current() };
}

function mergeMinutes(history: Point[], live: Iterable<Point>) {
  const minutes = new Map<number, Point>();
  for (const points of [history, live]) for (const point of points) {
    const key = minute(point.at), previous = minutes.get(key);
    if (!previous || previous.at <= point.at) minutes.set(key, point);
  }
  return [...minutes.values()];
}

export function intradayPoints(pair: IntradayPair, history: History, live: Live = {}) {
  const instruments = [pair.a, pair.b, ...(pair.c ? [pair.c] : [])];
  const prices = instruments.map(({ id }) => {
    const native = new Map(mergeMinutes([], history[id]?.points ?? []).map(point => [minute(point.at), point]));
    // The timestamp of a historical close can be the start of its minute.
    // Once Matriz has returned that completed bar, an earlier live poll cannot replace it.
    const eligibleLive = [...(live[id]?.values() ?? [])].filter(point => {
      const historical = native.get(minute(point.at));
      return !historical || historical.provisional;
    });
    const closes = new Map<number, Point>();
    for (const point of mergeMinutes([...native.values()], eligibleLive)) {
      const key = bucket(point.at), previous = closes.get(key);
      if (!previous || previous.at < point.at) closes.set(key, point);
    }
    return new Map([...closes].map(([at, point]) => [at, point.value]));
  });
  const [a, b, c] = prices;
  const times = [...new Set(prices.flatMap(values => [...values.keys()]))].sort((x, y) => x - y);
  return times.map(at => {
    const left = { last: a.get(at) }, right = { last: b.get(at) }, raw = c?.get(at);
    const reference = raw !== undefined && raw > 0 ? raw / (pair.cDivisor ?? 1) : undefined;
    const ratio = calculateRatio(left, right).ratio;
    const relative = reference === undefined ? undefined : calculateRatio(left, right, { last: reference }).ratio;
    const spread = relative === undefined ? undefined : (relative - 1) * 100;
    return { at, ratio, reference, spread: Number.isFinite(spread) ? spread : undefined };
  });
}

type ChartValue = Exclude<keyof ReturnType<typeof intradayPoints>[number], "at">;
type Line = { key: ChartValue; label: string };
const percentage = new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
function display(value: number | undefined, percent: boolean) {
  return value === undefined ? "—" : percent ? percentage.format(value / 100) : ratioLabel(value);
}

function chartScale(values: number[], percent: boolean, top: number, bottom: number) {
  const low = Math.min(...values, ...(percent ? [0] : [])), high = Math.max(...values, ...(percent ? [0] : []));
  const padding = (high - low) * 0.08 || Math.max(Math.abs(high) * 0.001, 0.0001);
  const min = low - padding, max = high + padding;
  return { percent, min, max, y: (value: number) => bottom - (bottom - top) * (value - min) / (max - min) };
}

function Plot({ rows, lines, dual, label }: {
  rows: ReturnType<typeof intradayPoints>; lines: Line[]; dual: boolean; label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 448, height: 195 });
  const [index, setIndex] = useState<number>();
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const active = index === undefined ? undefined : rows[Math.min(index, rows.length - 1)];
  const width = size.width, height = size.height;
  const left = dual ? 68 : 12, top = 12, bottom = Math.max(top + 8, height - 24), right = Math.max(left + 12, width - 84);
  const onRight = dual ? lines.filter(line => line.key !== "spread") : lines;
  const mainScale = chartScale(rows.flatMap(row => onRight.flatMap(line => row[line.key] ?? [])), onRight[0].key === "spread", top, bottom);
  const spreadScale = dual ? chartScale(rows.flatMap(row => row.spread ?? []), true, top, bottom) : mainScale;
  const from = rows[0].at, to = Math.max(rows[rows.length - 1].at, from + INTERVAL);
  const x = (at: number) => left + (right - left) * (at - from) / (to - from);
  return <div className="ct-intraday-plot" ref={container}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} tabIndex={0}
      onBlur={() => setIndex(undefined)} onPointerLeave={() => setIndex(undefined)}
      onPointerMove={event => {
        const offset = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const at = from + (offset - left) / (right - left) * (to - from);
        const closest = rows.reduce((best, row, i) => Math.abs(row.at - at) < Math.abs(rows[best].at - at) ? i : best, 0);
        setIndex(closest);
      }}
      onKeyDown={event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const step = event.key === "ArrowLeft" ? -1 : 1;
        setIndex(previous => Math.max(0, Math.min(rows.length - 1, (previous ?? rows.length - 1) + step)));
      }}>
      {[0, 1, 2, 3].map(tick => {
        const value = mainScale.min + (mainScale.max - mainScale.min) * tick / 3, yy = mainScale.y(value);
        const spreadTick = spreadScale.min + (spreadScale.max - spreadScale.min) * tick / 3;
        return <g key={tick}><path className="ct-intraday-grid" d={`M${left},${yy}H${right}`} />
          <text className="ct-intraday-axis-right" x={right + 7} y={yy} dominantBaseline="middle">{display(value, mainScale.percent)}</text>
          {dual && <text className="ct-intraday-axis-left" x={left - 7} y={yy} textAnchor="end" dominantBaseline="middle">{display(spreadTick, true)}</text>}
        </g>;
      })}
      {(rows.length === 1 ? [from] : [from, bucket((from + to) / 2), to]).filter((at, i, ticks) => ticks.indexOf(at) === i).map(at =>
        <g key={at}><path className="ct-intraday-grid" d={`M${x(at)},${top}V${bottom}`} /><text x={x(at)} y={bottom + 17} textAnchor={at === from ? "start" : at === to ? "end" : "middle"}>{time.format(at)}</text></g>)}
      {spreadScale.percent && <path className="ct-intraday-zero" d={`M${left},${spreadScale.y(0)}H${right}`} />}
      {lines.map(line => {
        const points = rows.filter(row => row[line.key] !== undefined);
        const { y } = line.key === "spread" ? spreadScale : mainScale;
        const path = points.map((point, i) => {
          const op = i > 0 && point.at - points[i - 1].at === INTERVAL ? "L" : "M";
          return `${op}${x(point.at)},${y(point[line.key]!)}`;
        }).join("");
        return <g key={line.key} className={`ct-intraday-line-${line.key}`}>
          <path className="ct-intraday-line" d={path} />
          {points.map((point, i) => {
            const isolated = point.at - (points[i - 1]?.at ?? -Infinity) > INTERVAL && (points[i + 1]?.at ?? Infinity) - point.at > INTERVAL;
            return isolated || i === points.length - 1 ? <circle key={point.at} cx={x(point.at)} cy={y(point[line.key]!)} r={i === points.length - 1 ? 3.5 : 2} /> : null;
          })}
        </g>;
      })}
      {active && <path className="ct-intraday-cursor" d={`M${x(active.at)},${top}V${bottom}`} />}
    </svg>
    {active && <div className="ct-intraday-tooltip" role="status">
      <strong>{time.format(active.at)}</strong>{lines.map(line => <span key={line.key}>{line.label} {display(active[line.key], line.key === "spread")}</span>)}
    </div>}
  </div>;
}

export function IntradayChart({ pair, view = "ratio" }: { pair: IntradayPair; view?: View }) {
  const [a, b, c] = [pair.a.id, pair.b.id, pair.c?.id];
  const ids = useMemo(() => [...new Set(c ? [a, b, c] : [a, b])], [a, b, c]);
  const market = useIntraday(ids);
  const [chosenDay, setChosenDay] = useState<number>();
  const past = useMemo(() => intradayPoints(pair, market.history), [a, b, c, pair.cDivisor, market.history]);
  const points = useMemo(() => intradayPoints(pair, market.history, market.live),
    [a, b, c, pair.cDivisor, market.history, market.live]);
  const ratio = pairLabel({ a: pair.a, b: pair.b });
  const reference = pair.c ? `${pair.c.symbol}${pair.cDivisor ? ` ÷ ${pair.cDivisor}` : ""}` : "Referencia C";
  const lines: Line[] = view === "spread" ? [{ key: "spread", label: "Brecha" }]
    : [{ key: "ratio", label: ratio }, ...(view === "comparison" ? [{ key: "reference" as const, label: reference }]
      : view === "dollar-spread" ? [{ key: "spread" as const, label: `Brecha vs ${reference}` }] : [])];
  const available = points.filter(point => point.ratio !== undefined || point.reference !== undefined);
  const dates = [...new Set([...available.map(point => sessionDay(point.at)), ...(market.start === undefined ? [] : [market.start])])].sort((x, y) => y - x);
  const aligned = (row: ReturnType<typeof intradayPoints>[number]) => (pair.c ? row.spread : row.ratio) !== undefined;
  const current = available.filter(point => sessionDay(point.at) === market.start && aligned(point));
  // Prefer a developed current series or historical overlap to an isolated current quote.
  const latest = current.length > 1 ? current.at(-1) : past.findLast(aligned) ?? available.findLast(aligned) ?? available.at(-1);
  const activeDay = chosenDay !== undefined && dates.includes(chosenDay) ? chosenDay : latest ? sessionDay(latest.at) : market.start;
  const rows = available.filter(point => sessionDay(point.at) === activeDay && lines.some(line => point[line.key] !== undefined));
  const instruments = [pair.a, pair.b, ...(pair.c ? [pair.c] : [])];
  const historyIssues = instruments.flatMap(i => market.history[i.id]?.issue ? [`${i.symbol} · ${market.history[i.id].issue}`] : []);
  const hasComparison = rows.some(row => row.spread !== undefined);
  const dual = view === "dollar-spread" && hasComparison;
  const plotLines = view === "dollar-spread" && !dual ? lines.filter(line => line.key !== "spread") : lines;
  const description = view === "spread" ? `Brecha intradiaria de ${ratio} contra ${reference}` : `Gráfico intradiario de ${lines.map(line => line.label).join(" y ")}`;
  return <div className="ct-intraday-body NoDraggable" aria-busy={market.loading}>
    <div className="ct-intraday-legend">
      {lines.map(line => {
        const last = rows.findLast(row => row[line.key] !== undefined);
        return <span key={line.key} className={`ct-intraday-line-${line.key}`} title={last && time.format(last.at)}>
          <i aria-hidden="true" />{line.label} <strong>{display(last?.[line.key], line.key === "spread")}</strong>
        </span>;
      })}
      {dates.length > 1 && <label className="ct-intraday-session">Rueda
        <select aria-label="Rueda del gráfico" value={activeDay} onChange={event => setChosenDay(Number(event.target.value))}>
          {dates.map(day => <option key={day} value={day}>{date.format(day)}{day === market.start ? " · hoy" : ""}</option>)}
        </select>
      </label>}
      {dates.length === 1 && <time>{date.format(dates[0])}</time>}
    </div>
    {rows.length > 0 ? <Plot key={`${view}-${activeDay}`} rows={rows} lines={plotLines} dual={dual} label={description} />
      : <p className="ct-intraday-empty" role="status">{market.loading ? "Cargando histórico…" : "Sin cotizaciones coincidentes para esta rueda."}</p>}
    {(view === "comparison" || view === "dollar-spread") && rows.length > 0 && !hasComparison && <small>El dólar y la referencia aún no coinciden en un intervalo de 5 min en esta rueda.</small>}
    {!market.loading && (market.historyIssue || historyIssues.length > 0) && <p className="ct-intraday-status" role="status">
      <span title={historyIssues.join(" · ")}>{market.historyIssue || historyIssues.join(" · ")}</span>
      <button type="button" onClick={market.retry}>Reintentar histórico</button>
    </p>}
    {(market.liveIssue || market.connected === false) && <p className="ct-intraday-status" role="status">{market.liveIssue || "Mercado desconectado."}</p>}
  </div>;
}

function ReferenceDialog({ pair, close }: { pair: IntradayPair; close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  const [view, setView] = useState<"comparison" | "spread">("comparison");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="ct-intraday-dialog" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={heading}>{pairLabel(pair)}</h2><button type="button" aria-label="Cerrar gráfico de referencia" onClick={close}>×</button></header>
    <div className="ct-intraday-views" role="group" aria-label="Vista intradiaria">
      <button type="button" aria-pressed={view === "comparison"} onClick={() => setView("comparison")}>Comparación</button>
      <button type="button" aria-pressed={view === "spread"} onClick={() => setView("spread")}>Brecha %</button>
    </div>
    <IntradayChart key={pairKey(pair)} pair={pair} view={view} />
  </dialog>, document.body);
}

export function ReferenceChartButton({ pair }: { pair: IntradayPair }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!pair.c) return null;
  return <>
    <button type="button" ref={trigger} className="ct-reference-chart-button" aria-haspopup="dialog"
      aria-label={`Comparar ${pairLabel({ a: pair.a, b: pair.b })} con ${pair.c.symbol}`} title="Comparación y brecha intradiarias con Referencia C"
      onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <ToolbarIcon name="analysis" /><span aria-hidden="true">C</span>
    </button>
    {open && <ReferenceDialog pair={pair} close={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </>;
}
