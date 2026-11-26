import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ToolbarIcon from "./ToolbarIcon";
import { MarketReader } from "./optionsSimulator/market";
import "./BookIntraday.css";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const HOVER_DELAY = 180;
const DASHBOARD_BOOK_HEADER = ".DashboardGridItem .SecurityCardWidget > .NewWidgetHeader";
const BOOK_BUTTON = ".ct-book-intraday-button";
const NATIVE_CHART_ICON = ".TradingChartModal > .TradingChartModal-Icon";
const CHART_TRIGGER = `${BOOK_BUTTON}, ${NATIVE_CHART_ICON}`;
const PRICE_ROW = ".PricePanelRow-row, .PricePanelRowWidget-row";
const argentina = "America/Argentina/Buenos_Aires";
const time = new Intl.DateTimeFormat("es-AR", { timeZone: argentina, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const price = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });

interface Point { at: number; value: number }
interface Instrument { id: string; label: string }
interface Book extends Instrument { key: number; actions: HTMLElement }
interface ChartTarget extends Instrument { anchor: HTMLElement }
interface Series { points: Point[]; reference?: number }

function readInstrument(link?: HTMLAnchorElement | null): Instrument | undefined {
  const label = link?.textContent?.trim();
  if (!link || !label || link.origin !== location.origin) return;
  const match = /^\/security\/([^/]+)\/?$/.exec(link.pathname);
  if (!match) return;
  try {
    const id = decodeURIComponent(match[1]);
    if (id && id.toUpperCase() !== "EXPIRADO" && !/[\u0000-\u001f\u007f]/.test(id)) return { id, label };
  } catch { /* Matriz can temporarily render a link without a usable instrument. */ }
}

function chartContainer(anchor: HTMLElement) {
  return anchor.matches(BOOK_BUTTON)
    ? anchor.closest(".NewWidgetHeader")
    : anchor.closest(PRICE_ROW) ?? anchor.closest("a[href]");
}

function instrumentFor(anchor: HTMLElement) {
  if (!anchor.isConnected || !anchor.matches(CHART_TRIGGER)) return;
  const container = chartContainer(anchor);
  if (anchor.matches(BOOK_BUTTON)) return readInstrument(container?.querySelector<HTMLAnchorElement>(":scope > a[href]"));
  const link = container?.matches(PRICE_ROW)
    ? container.querySelector<HTMLAnchorElement>(".SymbolCell > a[href]")
    : container instanceof HTMLAnchorElement ? container : undefined;
  return readInstrument(link);
}

function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    let current = new Map<HTMLElement, Book>(), nextKey = 0;
    const sync = () => {
      const next = new Map<HTMLElement, Book>();
      document.querySelectorAll(DASHBOARD_BOOK_HEADER).forEach(header => {
        const instrument = readInstrument(header.querySelector<HTMLAnchorElement>(":scope > a[href]"));
        const actions = header.querySelector<HTMLElement>(":scope > .SingleWidgetHeaderButtons");
        if (!instrument || !actions) return;
        const previous = current.get(actions);
        next.set(actions, previous?.id === instrument.id && previous.label === instrument.label ? previous : { ...instrument, actions, key: nextKey++ });
      });
      if (next.size === current.size && [...next].every(([actions, book]) => current.get(actions) === book)) return;
      current = next;
      setBooks([...next.values()]);
    };
    const observer = new MutationObserver(records => {
      if (records.some(({ target, addedNodes, removedNodes }) => {
        const element = target instanceof Element ? target : target.parentElement;
        return element?.closest(".NewWidgetHeader") || [...addedNodes, ...removedNodes].some(node => node instanceof Element &&
          (node.matches(".SecurityCardWidget, .NewWidgetHeader") || node.querySelector(".SecurityCardWidget, .NewWidgetHeader")));
      })) sync();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"], characterData: true });
    sync();
    return () => observer.disconnect();
  }, []);
  return books;
}

function Plot({ points, reference, label }: { points: Point[]; reference?: number; label: string }) {
  const [cursor, setCursor] = useState<number>();
  const values = points.map(point => point.value);
  if (reference !== undefined) values.push(reference);
  const low = Math.min(...values), high = Math.max(...values);
  const padding = high === low ? Math.max(Math.abs(high) * 0.002, 0.000001) : (high - low) * 0.08;
  const min = low - padding, max = high + padding;
  const size = (max - min) / 6, magnitude = 10 ** Math.floor(Math.log10(size));
  const step = ([1, 2, 2.5, 5, 10].find(unit => unit * magnitude >= size) ?? 10) * magnitude;
  const bottom = 163, top = 14, left = 12, width = 330;
  const prices = Array.from({ length: 7 }, (_, index) => (Math.ceil(min / step) + index) * step).filter(value => value <= max);
  const right = width - Math.max(42, ...prices.map(value => price.format(value).length * 6 + 8));
  const y = (value: number) => bottom - (bottom - top) * (value - min) / (max - min);
  const from = points[0].at, to = Math.max(from + MINUTE, points[points.length - 1].at);
  const x = (at: number) => left + (right - left) * (at - from) / (to - from);
  const firstHour = Math.ceil(from / HOUR) * HOUR;
  const hours = Array.from({ length: Math.max(0, Math.floor((to - firstHour) / HOUR) + 1) }, (_, index) => firstHour + index * HOUR);
  const active = cursor === undefined ? undefined : points.reduce((best, point) => Math.abs(point.at - cursor) < Math.abs(best.at - cursor) ? point : best);
  return <svg className="ct-book-intraday-plot" viewBox={`0 0 ${width} 190`} role="img" aria-label={`Precios intradiarios de ${label}`}
    onPointerLeave={() => setCursor(undefined)} onPointerMove={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const position = (event.clientX - rect.left) * width / rect.width;
      setCursor(from + (position - left) * (to - from) / (right - left));
    }}>
    {prices.map(value => <text key={value} x={right + 6} y={y(value)} dominantBaseline="middle">{price.format(value)}</text>)}
    {(hours.length ? hours : [from]).map(at => <text key={at} x={x(at)} y="183" textAnchor={at === from ? "start" : "middle"}>
      {hours.length ? time.format(at).slice(0, 2) : time.format(at)}
    </text>)}
    {reference !== undefined && <path className="ct-book-intraday-reference" d={`M${left},${y(reference)}H${right}`} />}
    <polyline className="ct-book-intraday-line" points={points.map(point => `${x(point.at)},${y(point.value)}`).join(" ")} />
    {points.length === 1 && <circle className="ct-book-intraday-point" cx={x(from)} cy={y(points[0].value)} r="2" />}
    {active && <g>
      <path className="ct-book-intraday-cursor" d={`M${x(active.at)},${top}V${bottom}`} />
      <circle className="ct-book-intraday-point" cx={x(active.at)} cy={y(active.value)} r="3" />
      <text className="ct-book-intraday-value" x={left} y="11">{time.format(active.at)} · {price.format(active.value)}</text>
    </g>}
  </svg>;
}

function Preview({ target, id, onEnter, onLeave }: {
  target: ChartTarget; id: string; onEnter: () => void; onLeave: () => void;
}) {
  const { anchor, id: instrumentId, label } = target;
  const panel = useRef<HTMLElement>(null);
  const [series, setSeries] = useState<Series>(), [failed, setFailed] = useState(false);
  useEffect(() => {
    const reader = new MarketReader("ratios-reader.js");
    let disposed = false, refreshTimer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let delay = 2000;
      try {
        const result = await reader.call<Series>("bookIntraday", { id: instrumentId });
        if (disposed) return;
        if (!Array.isArray(result?.points) || !result.points.every(point => Number.isFinite(point?.at) && Number.isFinite(point?.value)) ||
            result.reference !== undefined && !Number.isFinite(result.reference)) throw Error("Serie intradiaria inválida.");
        setSeries(result);
        setFailed(false);
      } catch {
        delay = 30_000;
        if (!disposed) { setSeries(undefined); setFailed(true); }
      } finally {
        if (!disposed) refreshTimer = setTimeout(() => void load(), delay);
      }
    };
    void load();
    return () => { disposed = true; reader.dispose(); clearTimeout(refreshTimer); };
  }, [instrumentId]);

  useLayoutEffect(() => {
    const element = panel.current!;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const gap = 5, inset = 8;
      const below = rect.bottom + gap;
      let side: number | undefined, alignAbove: boolean | undefined;
      element.style.width = "";
      element.style.maxHeight = "";
      element.style.pointerEvents = "";
      if (anchor.matches(NATIVE_CHART_ICON)) {
        const favorite = anchor.closest(".ActionCell")?.querySelector(".FavoriteButton")?.getBoundingClientRect();
        const controlsLeft = favorite?.width ? Math.min(rect.left, favorite.left) : rect.left;
        const controlsRight = favorite?.width ? Math.max(rect.right, favorite.right) : rect.right;
        const rightRoom = window.innerWidth - controlsRight - gap - inset, leftRoom = controlsLeft - gap - inset;
        if (Math.max(rightRoom, leftRoom) >= 180) {
          const onRight = rightRoom >= 354 || rightRoom >= leftRoom;
          const width = Math.min(354, onRight ? rightRoom : leftRoom);
          element.style.width = `${width}px`;
          side = onRight ? controlsRight + gap : controlsLeft - gap - width;
        } else {
          const belowRoom = window.innerHeight - below - inset, aboveRoom = rect.top - gap - inset;
          alignAbove = aboveRoom > belowRoom;
          element.style.maxHeight = `${Math.max(0, alignAbove ? aboveRoom : belowRoom)}px`;
          // A stacked preview must leave the surrounding rows' controls clickable.
          element.style.pointerEvents = "none";
        }
      }
      const { width, height } = element.getBoundingClientRect();
      const above = rect.top - gap - height;
      const maxLeft = window.innerWidth - width - inset, maxTop = window.innerHeight - height - inset;
      const x = side ?? rect.right - width;
      const y = side !== undefined ? rect.top : (alignAbove ?? (below > maxTop)) ? above : below;
      element.style.left = `${Math.max(inset, Math.min(x, maxLeft))}px`;
      element.style.top = `${Math.max(inset, Math.min(y, maxTop))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [anchor]);

  return <aside ref={panel} id={id} className="ct-book-intraday" role="tooltip" onPointerEnter={onEnter} onPointerLeave={onLeave}>
    <strong>Intradiario · {label}</strong>
    {series?.points.length ? <Plot points={series.points} reference={series.reference} label={label} />
      : <p role="status">{failed ? "No se pudo cargar el gráfico." : series ? "Sin operaciones en la rueda de hoy." : "Cargando gráfico…"}</p>}
  </aside>;
}

export default function BookIntraday() {
  const books = useBooks(), id = useId();
  const [active, setActive] = useState<ChartTarget>();
  const hovered = useRef<HTMLElement>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelTimers = useCallback(() => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); }, []);
  const closeSoon = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setActive(current => current && (hovered.current === current.anchor || current.anchor.matches(":focus-visible")) ? current : undefined);
    }, HOVER_DELAY);
  }, []);
  const leave = useCallback((anchor: HTMLElement) => {
    if (hovered.current === anchor) {
      hovered.current = undefined;
      clearTimeout(openTimer.current);
    }
    closeSoon();
  }, [closeSoon]);
  const open = useCallback((anchor: HTMLElement, expected?: Instrument) => {
    cancelTimers();
    const instrument = instrumentFor(anchor);
    if (!instrument || expected && (instrument.id !== expected.id || instrument.label !== expected.label)) {
      if (hovered.current === anchor) hovered.current = undefined;
      closeSoon();
      return;
    }
    setActive(current => current?.anchor === anchor && current.id === instrument.id && current.label === instrument.label ? current : { ...instrument, anchor });
  }, [cancelTimers, closeSoon]);

  useEffect(() => {
    // Delegate to the shared Matriz icon so virtualized rows don't need their own listeners.
    const trigger = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(CHART_TRIGGER) : null;
    const crossed = (anchor: HTMLElement, related: EventTarget | null) => !(related instanceof Node && anchor.contains(related));
    const pointerOver = (event: PointerEvent) => {
      const anchor = trigger(event.target);
      if (!anchor || event.pointerType === "touch" || !crossed(anchor, event.relatedTarget)) return;
      const instrument = instrumentFor(anchor);
      if (!instrument) return;
      hovered.current = anchor;
      cancelTimers();
      const container = chartContainer(anchor);
      openTimer.current = setTimeout(() => {
        if (chartContainer(anchor) === container) open(anchor, instrument);
        else leave(anchor);
      }, HOVER_DELAY);
    };
    const pointerOut = (event: PointerEvent) => {
      const anchor = trigger(event.target);
      if (anchor && crossed(anchor, event.relatedTarget)) leave(anchor);
    };
    const focusIn = (event: FocusEvent) => {
      const anchor = trigger(event.target);
      if (anchor && crossed(anchor, event.relatedTarget)) open(anchor);
    };
    const focusOut = (event: FocusEvent) => {
      const anchor = trigger(event.target);
      if (anchor && crossed(anchor, event.relatedTarget)) closeSoon();
    };
    const dismiss = () => { cancelTimers(); setActive(undefined); };
    const nativeClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".TradingChartModal")) dismiss();
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("pointerover", pointerOver, true);
    document.addEventListener("pointerout", pointerOut, true);
    document.addEventListener("focusin", focusIn, true);
    document.addEventListener("focusout", focusOut, true);
    document.addEventListener("click", nativeClick, true);
    document.addEventListener("keydown", keyDown, true);
    return () => {
      cancelTimers();
      document.removeEventListener("pointerover", pointerOver, true);
      document.removeEventListener("pointerout", pointerOut, true);
      document.removeEventListener("focusin", focusIn, true);
      document.removeEventListener("focusout", focusOut, true);
      document.removeEventListener("click", nativeClick, true);
      document.removeEventListener("keydown", keyDown, true);
    };
  }, [open, leave, closeSoon, cancelTimers]);
  useEffect(() => {
    if (!active) return;
    const anchor = active.anchor;
    const scope = chartContainer(anchor) ?? anchor;
    const checkAnchor = () => {
      const instrument = instrumentFor(anchor);
      if (chartContainer(anchor) === scope && instrument?.id === active.id && instrument.label === active.label) return;
      if (hovered.current === anchor) hovered.current = undefined;
      setActive(current => current === active ? undefined : current);
    };
    const observer = new MutationObserver(records => {
      if (!anchor.isConnected || !scope.contains(anchor) || records.some(({ target }) => scope.contains(target))) checkAnchor();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(scope, { attributes: true, attributeFilter: ["href", "class"], characterData: true, subtree: true });
    checkAnchor();
    return () => observer.disconnect();
  }, [active]);

  return <>
    {books.map(book => createPortal(<button type="button" className="ct-book-intraday-button NoDraggable"
      aria-label={`Gráfico intradiario de ${book.label}`} aria-describedby={active?.anchor.parentElement === book.actions ? id : undefined}
      onClick={event => { event.stopPropagation(); open(event.currentTarget); }}>
      <ToolbarIcon name="analysis" />
    </button>, book.actions, book.key))}
    {active && createPortal(<Preview key={active.id} target={active} id={id}
      onEnter={() => { hovered.current = active.anchor; cancelTimers(); }} onLeave={() => leave(active.anchor)} />, document.body)}
  </>;
}
