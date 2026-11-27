import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarketReader } from "../optionsSimulator/market";
import ToolbarIcon from "../ToolbarIcon";
import { calculateRatio, pairKey, pairLabel, ratioLabel, type RatioFormat, type RatioPair } from "./model";

export type IntradayPair = Pick<RatioPair, "a" | "b" | "c" | "cDivisor" | "format">;
type View = "ratio" | "comparison" | "spread" | "dollar-spread";
interface Point { at: number; value: number; provisional?: true }
type History = Record<string, { points: Point[]; issue?: string }>;
type Live = Record<string, Map<number, Point>>;
interface LiveResponse { revision: number; start: number; connected: boolean; available?: string[]; points: Record<string, Point>; issue?: string }
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

type QuoteUpdate = { result: LiveResponse } | { error: unknown };
type QuoteListener = (update: QuoteUpdate) => void;
type SubscribeToQuoteGroup = (listener: QuoteListener) => () => void;
const quoteGroups = new WeakMap<MarketReader, Map<string, SubscribeToQuoteGroup>>();

function createQuoteGroup(client: MarketReader, ids: string[], onIdle: () => void): SubscribeToQuoteGroup {
  const listeners = new Set<QuoteListener>();
  const controller = new AbortController();
  const { signal } = controller;
  const active = () => !signal.aborted && !document.hidden;
  let timer: ReturnType<typeof setTimeout>;
  async function poll() {
    if (!active()) return;
    let recipients: QuoteListener[] | undefined;
    const canDispatch = () => {
      if (!active()) return false;
      // All charts waiting for reader startup can share its very first response.
      recipients = [...listeners];
      return true;
    };
    const update = await client.call<LiveResponse>("ratioIntradayQuotes", { ids }, { signal, canDispatch })
      .then(result => ({ result }), error => ({ error }));
    if (!active()) return;
    for (const listener of recipients ?? listeners) if (listeners.has(listener)) listener(update);
    timer = setTimeout(() => void poll(), 2000);
  }
  return listener => {
    // Give each registration its own identity when a chart leaves and rejoins.
    const receive: QuoteListener = update => listener(update);
    listeners.add(receive);
    if (listeners.size === 1) void poll();
    return () => {
      if (!listeners.delete(receive) || listeners.size) return;
      clearTimeout(timer);
      controller.abort();
      onIdle();
    };
  };
}

function subscribeQuotes(client: MarketReader, ids: readonly string[], listener: QuoteListener) {
  const sortedIds = [...ids].sort(), key = JSON.stringify(sortedIds);
  let groups = quoteGroups.get(client);
  if (!groups) {
    groups = new Map();
    quoteGroups.set(client, groups);
  }
  let subscribe = groups.get(key);
  if (!subscribe) {
    const currentGroups = groups;
    subscribe = createQuoteGroup(client, sortedIds, () => currentGroups.delete(key));
    groups.set(key, subscribe);
  }
  return subscribe(listener);
}

function useIntraday(ids: readonly string[], active: boolean) {
  const [history, setHistory] = useState<History>({}), [live, setLive] = useState<Live>({});
  const [start, setStart] = useState<number>(), [connected, setConnected] = useState<boolean>();
  const [loading, setLoading] = useState(true), [historyIssue, setHistoryIssue] = useState(""), [liveIssue, setLiveIssue] = useState("");
  const retryHistory = useRef<() => void>(() => {});
  const watching = useRef(active), syncPolling = useRef(() => {});
  useEffect(() => { watching.current = active; syncPolling.current(); }, [active]);
  useEffect(() => {
    let connection: ReturnType<typeof acquireReader> | undefined;
    let disposed = false, revision: number | undefined, previousConnection: boolean | undefined;
    let previousAvailability: string | undefined;
    let stopQuotes: (() => void) | undefined, historyRequest = 0;
    let retryQuotes: ReturnType<typeof setTimeout>;
    const canPoll = () => !disposed && watching.current && !document.hidden;
    const loadHistory = (refresh = false) => {
      if (!connection) return;
      const request = ++historyRequest;
      setLoading(true); setHistoryIssue("");
      return connection.client.call<HistoryResponse>("ratioIntradayHistory", { ids, refresh }).then(result => {
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
    const receiveQuotes: QuoteListener = update => {
      if (!canPoll()) return;
      try {
        if ("error" in update) throw update.error;
        const { result } = update;
        const switched = result.revision !== revision;
        const availability = result.available?.join("\u0000");
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
        const reconnected = previousConnection === false && result.connected;
        if (switched || reconnected || availability !== previousAvailability) void loadHistory(!switched && reconnected);
        previousConnection = result.connected;
        previousAvailability = availability;
      } catch (error) {
        setConnected(undefined); setLiveIssue(error instanceof Error ? error.message : "Datos en vivo no disponibles."); setLoading(false);
      }
    };
    const visibilityChanged = () => {
      clearTimeout(retryQuotes);
      if (!canPoll()) {
        stopQuotes?.();
        stopQuotes = undefined;
      } else if (!stopQuotes) {
        try {
          connection ??= acquireReader();
          stopQuotes = subscribeQuotes(connection.client, ids, receiveQuotes);
        } catch (error) {
          receiveQuotes({ error });
          retryQuotes = setTimeout(visibilityChanged, 2000);
        }
      }
    };
    retryHistory.current = () => { if (revision !== undefined) void loadHistory(true); };
    syncPolling.current = visibilityChanged;
    document.addEventListener("visibilitychange", visibilityChanged);
    visibilityChanged();
    return () => {
      disposed = true; clearTimeout(retryQuotes); stopQuotes?.(); retryHistory.current = () => {};
      document.removeEventListener("visibilitychange", visibilityChanged);
      syncPolling.current = () => {};
      connection?.release();
    };
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
function display(value: number | undefined, key: ChartValue, ratioFormat?: RatioFormat) {
  return key === "spread" && value !== undefined ? percentage.format(value / 100) : ratioLabel(value, key === "ratio" ? ratioFormat : undefined);
}

function chartScale(values: number[], top: number, bottom: number) {
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low, magnitude = Math.max(Math.abs(low), Math.abs(high));
  const padding = span > Number.EPSILON * Math.max(1, magnitude) * 8
    ? span * 0.08 : Math.max(magnitude * 0.001, 0.0001);
  const min = low - padding, max = high + padding;
  return { min, max, y: (value: number) => bottom - (bottom - top) * (value - min) / (max - min) };
}

// The SVG axis text uses 10px type. Allow six pixels per character plus the label gap.
const axisWidth = (labels: string[]) => labels.length ? Math.max(...labels.map(label => label.length)) * 6 + 10 : 6;

function Plot({ rows, lines, dual, label, ratioFormat }: {
  rows: ReturnType<typeof intradayPoints>; lines: Line[]; dual: boolean; label: string; ratioFormat?: RatioFormat;
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
  const spreadOnly = lines.length === 1 && lines[0].key === "spread";
  const hasSpread = dual || spreadOnly;
  const top = 9, bottom = Math.max(top + 8, height - 22);
  const onRight = dual ? lines.filter(line => line.key !== "spread") : lines;
  const mainScale = chartScale(rows.flatMap(row => onRight.flatMap(line => row[line.key] ?? [])), top, bottom);
  const spreadScale = dual ? chartScale(rows.flatMap(row => row.spread ?? []), top, bottom) : mainScale;
  const percentRatio = ratioFormat === "percent";
  const percentSpan = percentRatio ? (mainScale.max - mainScale.min) * 100 : spreadScale.max - spreadScale.min;
  const precision = Math.min(6, Math.max(2, Math.ceil(-Math.log10(percentSpan / 3))));
  const percentAxis = precision === 2 ? percentage : new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: precision, maximumFractionDigits: precision });
  const ticks = [0, 1, 2, 3].map(tick => {
    const value = mainScale.min + (mainScale.max - mainScale.min) * tick / 3;
    const spread = spreadScale.min + (spreadScale.max - spreadScale.min) * tick / 3;
    return { y: mainScale.y(value), main: percentRatio ? percentAxis.format(value - 1) : ratioLabel(value), percent: percentAxis.format(spread / 100) };
  });
  const left = axisWidth(hasSpread ? ticks.map(tick => tick.percent) : []);
  const right = Math.max(left + 12, width - axisWidth(spreadOnly ? [] : ticks.map(tick => tick.main)));
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
      {ticks.map(({ y, main, percent }, index) => <g key={index}><path className="ct-intraday-grid" d={`M${left},${y}H${right}`} />
        {!spreadOnly && <text className="ct-intraday-axis-right" x={right + 4} y={y} dominantBaseline="middle">{main}</text>}
        {hasSpread && <text className="ct-intraday-axis-left" x={left - 4} y={y} textAnchor="end" dominantBaseline="middle">{percent}</text>}
      </g>)}
      {(rows.length === 1 ? [from] : [from, bucket((from + to) / 2), to]).filter((at, i, ticks) => ticks.indexOf(at) === i).map(at =>
        <g key={at}><path className="ct-intraday-grid" d={`M${x(at)},${top}V${bottom}`} /><text x={x(at)} y={bottom + 17} textAnchor={at === from ? "start" : at === to ? "end" : "middle"}>{time.format(at)}</text></g>)}
      {hasSpread && spreadScale.min <= 0 && spreadScale.max >= 0 && <path className="ct-intraday-zero" d={`M${left},${spreadScale.y(0)}H${right}`} />}
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
      <strong>{time.format(active.at)}</strong>{lines.map(line => <span key={line.key}>{line.label} {display(active[line.key], line.key, ratioFormat)}</span>)}
    </div>}
  </div>;
}

export function IntradayChart({ pair, view = "ratio", defaultToToday = false, active = true }: { pair: IntradayPair; view?: View; defaultToToday?: boolean; active?: boolean }) {
  const [a, b, c] = [pair.a.id, pair.b.id, pair.c?.id];
  const ids = useMemo(() => [...new Set(c ? [a, b, c] : [a, b])], [a, b, c]);
  const market = useIntraday(ids, active);
  const [chosenDay, setChosenDay] = useState<number>();
  const past = useMemo(() => defaultToToday ? [] : intradayPoints(pair, market.history), [a, b, c, pair.cDivisor, market.history, defaultToToday]);
  const points = useMemo(() => intradayPoints(pair, market.history, market.live),
    [a, b, c, pair.cDivisor, market.history, market.live]);
  const ratio = pairLabel({ a: pair.a, b: pair.b });
  const ratioFormat = view === "ratio" ? pair.format : undefined;
  const reference = pair.c ? `${pair.c.symbol}${pair.cDivisor ? ` ÷ ${pair.cDivisor}` : ""}` : "Referencia C";
  const lines: Line[] = view === "spread" ? [{ key: "spread", label: `Brecha vs ${reference}` }]
    : [{ key: "ratio", label: ratio }, ...(view === "comparison" ? [{ key: "reference" as const, label: reference }]
      : view === "dollar-spread" ? [{ key: "spread" as const, label: `Brecha vs ${reference}` }] : [])];
  const available = points.filter(point => point.ratio !== undefined || point.reference !== undefined);
  const today = market.start ?? sessionDay(Date.now());
  const dates = [...new Set([today, ...available.map(point => sessionDay(point.at))])].sort((x, y) => y - x);
  const aligned = (row: ReturnType<typeof intradayPoints>[number]) => (pair.c ? row.spread : row.ratio) !== undefined;
  const current = available.filter(point => sessionDay(point.at) === today && aligned(point));
  // Charts opened from a Ratios row still look for a session with comparable history.
  const latest = current.length > 1 ? current.at(-1) : past.findLast(aligned) ?? available.findLast(aligned) ?? available.at(-1);
  const defaultDay = defaultToToday || !latest ? today : sessionDay(latest.at);
  const activeDay = chosenDay !== undefined && dates.includes(chosenDay) ? chosenDay : defaultDay;
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
          <i aria-hidden="true" />{line.label} <strong>{display(last?.[line.key], line.key, ratioFormat)}</strong>
        </span>;
      })}
      {defaultToToday || dates.length > 1 ? <label className="ct-intraday-session"><span>Rueda</span>
        <select aria-label="Rueda del gráfico" value={activeDay} onChange={event => {
          const day = Number(event.target.value);
          setChosenDay(defaultToToday && day === today ? undefined : day);
        }}>
          {dates.map(day => <option key={day} value={day}>{date.format(day)}{day === today ? " · hoy" : ""}</option>)}
        </select>
      </label> : <time>{date.format(activeDay)}</time>}
    </div>
    {rows.length > 0 ? <Plot key={`${view}-${activeDay}`} rows={rows} lines={plotLines} dual={dual} label={description} ratioFormat={ratioFormat} />
      : <p className="ct-intraday-empty" role="status">{market.loading ? "Cargando histórico…" : "Sin cotizaciones coincidentes para esta rueda."}</p>}
    {(view === "comparison" || view === "dollar-spread") && rows.length > 0 && !hasComparison && <small>El ratio y la referencia aún no coinciden en un intervalo de 5 min en esta rueda.</small>}
    {!market.loading && (market.historyIssue || historyIssues.length > 0) && <p className="ct-intraday-status" role="status">
      <span title={historyIssues.join(" · ")}>{market.historyIssue || historyIssues.join(" · ")}</span>
      <button type="button" onClick={market.retry}>Reintentar histórico</button>
    </p>}
    {(market.liveIssue || market.connected === false) && <p className="ct-intraday-status" role="status">{market.liveIssue || "Mercado desconectado."}</p>}
  </div>;
}

function IntradayDialog({ pair, close }: { pair: IntradayPair; close(): void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  const [view, setView] = useState<"comparison" | "spread">("comparison");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="ct-intraday-dialog" aria-labelledby={heading} onClick={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={heading}>{pairLabel(pair)}</h2><button type="button" aria-label="Cerrar gráfico intradiario" onClick={close}>×</button></header>
    {pair.c && <div className="ct-intraday-views" role="group" aria-label="Vista intradiaria">
      <button type="button" aria-pressed={view === "comparison"} onClick={() => setView("comparison")}>Comparación</button>
      <button type="button" aria-pressed={view === "spread"} onClick={() => setView("spread")}>Brecha %</button>
    </div>}
    <IntradayChart key={pairKey(pair)} pair={pair} view={pair.c ? view : "ratio"} />
  </dialog>, document.body);
}

export function IntradayChartButton({ pair }: { pair: IntradayPair }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = pairLabel({ a: pair.a, b: pair.b });
  return <>
    <button type="button" ref={trigger} className="ct-intraday-chart-button" aria-haspopup="dialog"
      aria-label={pair.c ? `Comparar ${label} con ${pair.c.symbol}` : `Ver intradiario de ${label}`}
      title={pair.c ? "Comparación y brecha intradiarias con Referencia C" : "Gráfico intradiario en intervalos de 5 minutos"}
      onMouseDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setOpen(true); }}>
      <ToolbarIcon name="analysis" /><span aria-hidden="true">{pair.c ? "C" : "5m"}</span>
    </button>
    {open && <IntradayDialog pair={pair} close={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </>;
}
