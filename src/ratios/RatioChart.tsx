import { useEffect, useState } from "react";
import ToolbarIcon from "../ToolbarIcon";
import { MarketReader } from "../optionsSimulator/market";
import type { RatioInstrument } from "./model";
import "./RatioChart.css";

type ChartPair = { a: RatioInstrument; b: RatioInstrument; c?: RatioInstrument };
const validId = (id: string) => id.length > 0 && id.length <= 240 && !/[\u0000-\u001f\u007f]/.test(id);
export function ratioChartUrl(pair: ChartPair, origin = location.origin) {
  if (![pair.a.id, pair.b.id, ...(pair.c ? [pair.c.id] : [])].every(validId)) return undefined;
  const url = new URL(`/security/${encodeURIComponent(pair.a.id)}`, origin);
  url.searchParams.set("interval", "5");
  url.searchParams.set("ctRatio", pair.b.id);
  if (pair.c) url.searchParams.set("ctRatioC", pair.c.id);
  return url.href;
}

export function RatioChartLink({ pair }: { pair: ChartPair }) {
  const href = ratioChartUrl(pair), label = `${pair.a.symbol}/${pair.b.symbol}`;
  return <a className="ct-ratio-chart-link" href={href} target="_blank" rel="noopener noreferrer"
    aria-label={`Abrir gráfico de ${label}${pair.c ? ` con referencia ${pair.c.symbol}` : ""} en una pestaña nueva`}
    title={`Gráfico de ${label} · velas de 5 minutos · ${pair.c ? `${pair.c.symbol} en un panel propio` : `${pair.b.symbol} en el eje izquierdo`}`}
    onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}><ToolbarIcon name="analysis" /></a>;
}

export function ratioChartRequest(url: URL) {
  if (!url.searchParams.has("ctRatio")) return undefined;
  const match = /^\/security\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return undefined;
  try {
    const a = decodeURIComponent(match[1]), b = url.searchParams.get("ctRatio") || "", c = url.searchParams.get("ctRatioC");
    if (![a, b, ...(c === null ? [] : [c])].every(validId)) return undefined;
    return { a, b, ...(c ? { c } : {}) };
  } catch { return undefined; }
}

interface ChartResult { a: string; b: string; comparison: string }
export default function RatioChart() {
  const [request, setRequest] = useState(() => ratioChartRequest(new URL(location.href)));
  const [result, setResult] = useState<ChartResult>(), [issue, setIssue] = useState(""), [attempt, setAttempt] = useState(0), [closed, setClosed] = useState(false);
  useEffect(() => {
    // Native Matriz navigation keeps this root mounted. Retire a request when
    // its route changes, including pushState navigation that emits no popstate.
    if (!request) return;
    const refresh = () => {
      const url = new URL(location.href), next = ratioChartRequest(url);
      setRequest(previous => {
        // Keep the captured pair when Matriz canonicalizes its own query.
        if (previous && !url.searchParams.has("ctRatio") && !url.searchParams.has("ctRatioC")) {
          const match = /^\/security\/([^/]+)\/?$/.exec(url.pathname);
          try { if (match && decodeURIComponent(match[1]) === previous.a) return previous; } catch { /* Invalid native route. */ }
        }
        return previous?.a === next?.a && previous?.b === next?.b && previous?.c === next?.c ? previous : next;
      });
    };
    const timer = setInterval(refresh, 250);
    window.addEventListener("popstate", refresh);
    return () => { clearInterval(timer); window.removeEventListener("popstate", refresh); };
  }, []);
  useEffect(() => {
    if (!request) return;
    let disposed = false;
    const reader = new MarketReader("ratio-chart-reader.js");
    setIssue(""); setResult(undefined); setClosed(false);
    void reader.call<ChartResult>("ratioChart", request).then(value => { if (!disposed) setResult(value); })
      .catch(error => { if (!disposed) setIssue(error instanceof Error ? error.message : "No se pudo abrir el indicador Ratio."); });
    return () => { disposed = true; reader.dispose(); };
  }, [request, attempt]);
  if (!request || closed) return null;
  return <aside className="ct-ratio-chart-status" role={issue ? "alert" : "status"} aria-label="Histórico de ratio">
    <span>{issue || (result ? `${result.a}/${result.b} · velas de 5 min · ${result.comparison} ${request.c ? "en un panel propio" : "en el eje izquierdo"} · números` : "Abriendo el histórico del ratio…")}
      {request.c && result && <small>Velas de A arriba, Referencia C en el medio y ratio de cierres A/B abajo.</small>}</span>
    {issue && <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button>}
    <button type="button" aria-label="Cerrar aviso del gráfico" onClick={() => setClosed(true)}>×</button>
  </aside>;
}
