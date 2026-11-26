import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ToolbarIcon from "./ToolbarIcon";
import { MarketReader } from "./optionsSimulator/market";
import "./BookIntraday.css";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DASHBOARD_BOOK_HEADER = ".DashboardGridItem .SecurityCardWidget > .NewWidgetHeader";
const argentina = "America/Argentina/Buenos_Aires";
const time = new Intl.DateTimeFormat("es-AR", { timeZone: argentina, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const price = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });

interface Point { at: number; value: number }
interface Book { key: number; id: string; label: string; actions: HTMLElement }
interface Series { points: Point[]; reference?: number }

function readBook(header: Element) {
  const link = header.querySelector<HTMLAnchorElement>(":scope > a[href]"), label = link?.textContent?.trim();
  const actions = header.querySelector<HTMLElement>(":scope > .SingleWidgetHeaderButtons");
  if (!link || !label || !actions || link.origin !== location.origin) return;
  const match = /^\/security\/([^/]+)\/?$/.exec(link.pathname);
  if (!match) return;
  try {
    const id = decodeURIComponent(match[1]);
    if (id && id.toUpperCase() !== "EXPIRADO" && !/[\u0000-\u001f\u007f]/.test(id)) return { id, label, actions };
  } catch { /* Matriz can temporarily render a link without a usable instrument. */ }
}

function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => {
    let current = new Map<HTMLElement, Book>(), nextKey = 0;
    const sync = () => {
      const next = new Map<HTMLElement, Book>();
      document.querySelectorAll(DASHBOARD_BOOK_HEADER).forEach(header => {
        const book = readBook(header);
        if (!book) return;
        const previous = current.get(book.actions);
        next.set(book.actions, previous?.id === book.id && previous.label === book.label ? previous : { ...book, key: nextKey++ });
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

function Preview({ book, button, id, onEnter, onLeave }: {
  book: Book; button: HTMLButtonElement; id: string; onEnter: () => void; onLeave: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [series, setSeries] = useState<Series>(), [failed, setFailed] = useState(false);
  useEffect(() => {
    const reader = new MarketReader("ratios-reader.js");
    let disposed = false, refreshTimer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let delay = 2000;
      try {
        const result = await reader.call<Series>("bookIntraday", { id: book.id });
        if (disposed) return;
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
  }, [book.id]);

  useLayoutEffect(() => {
    const element = panel.current!;
    const position = () => {
      const anchor = button.getBoundingClientRect(), { width, height } = element.getBoundingClientRect();
      const gap = 5, inset = 8;
      const below = anchor.bottom + gap, above = anchor.top - gap - height;
      element.style.left = `${Math.max(inset, Math.min(anchor.right - width, window.innerWidth - width - inset))}px`;
      element.style.top = `${Math.max(inset, Math.min(below + height > window.innerHeight - inset ? above : below, window.innerHeight - height - inset))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [button]);

  return <aside ref={panel} id={id} className="ct-book-intraday" role="tooltip" onPointerEnter={onEnter} onPointerLeave={onLeave}>
    <strong>Intradiario · {book.label}</strong>
    {series?.points.length ? <Plot points={series.points} reference={series.reference} label={book.label} />
      : <p role="status">{failed ? "No se pudo cargar el gráfico." : series ? "Sin operaciones en la rueda de hoy." : "Cargando gráfico…"}</p>}
  </aside>;
}

export default function BookIntraday() {
  const books = useBooks(), id = useId();
  const [active, setActive] = useState<{ book: Book; button: HTMLButtonElement }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelTimer = () => clearTimeout(timer.current);
  const closeSoon = () => {
    cancelTimer();
    timer.current = setTimeout(() => {
      setActive(current => current?.button.matches(":focus-visible") ? current : undefined);
    }, 180);
  };
  const open = (book: Book, button: HTMLButtonElement) => { cancelTimer(); setActive({ book, button }); };
  const preview = active && books.includes(active.book) && active.button.isConnected ? active : undefined;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!preview) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { clearTimeout(timer.current); setActive(undefined); }
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [preview]);

  return <>
    {books.map(book => createPortal(<button type="button" className="ct-book-intraday-button NoDraggable"
      aria-label={`Gráfico intradiario de ${book.label}`} aria-describedby={preview?.book === book ? id : undefined}
      onPointerEnter={event => {
        if (event.pointerType === "touch") return;
        const button = event.currentTarget;
        cancelTimer();
        if (preview?.book !== book) timer.current = setTimeout(() => open(book, button), 180);
      }} onPointerLeave={closeSoon} onFocus={event => open(book, event.currentTarget)} onBlur={closeSoon}
      onClick={event => { event.stopPropagation(); open(book, event.currentTarget); }}>
      <ToolbarIcon name="analysis" />
    </button>, book.actions, book.key))}
    {preview && createPortal(<Preview key={preview.book.key} book={preview.book} button={preview.button} id={id}
      onEnter={cancelTimer} onLeave={closeSoon} />, document.body)}
  </>;
}
