import { useEffect, useMemo, useRef, useState } from "react";
import { MarketReader } from "./optionsSimulator/market";
import { executionClipboard, executionFormatters, normalizeExecutionLocale, summarizeExecutions, type ExecutionLocale, type OptionExecution, type OptionKind } from "./optionExecutions";
import "./OptionsOperations.css";

interface ExecutionReport {
  contextId: string;
  rows: OptionExecution[];
  unmatched: number;
}

const pageSize = 200;
const localeKey = "OptionsOperationsLocale";
const contextChanged = "Cambió la cuenta o la sesión de Matriz. Volvé a cargar las operaciones.";

export default function OptionsOperations({ embedded }: { embedded: boolean }) {
  const reader = useRef<MarketReader | null>(null);
  const [report, setReport] = useState<ExecutionReport>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [underlyingChoice, setUnderlying] = useState("");
  const [expirationChoice, setExpiration] = useState("");
  const [kindChoice, setKind] = useState<OptionKind>();
  const [averaged, setAveraged] = useState(false);
  const [pageChoice, setPage] = useState(0);
  const [locale, setLocale] = useState<ExecutionLocale>("auto");
  const [localePending, setLocalePending] = useState(true);
  const [localeIssue, setLocaleIssue] = useState("");
  const localeRevision = useRef(0);
  const format = useMemo(() => executionFormatters(locale), [locale]);

  useEffect(() => {
    if (!embedded) return;
    let active = true;
    const revision = localeRevision.current;
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !Object.hasOwn(changes, localeKey)) return;
      localeRevision.current++;
      setLocale(normalizeExecutionLocale(changes[localeKey].newValue));
      setLocaleIssue("");
    };
    chrome.storage.onChanged.addListener(onChanged);
    void chrome.storage.local.get(localeKey).then(values => {
      if (active && revision === localeRevision.current) setLocale(normalizeExecutionLocale(values[localeKey]));
    }).catch(() => {
      if (active && revision === localeRevision.current) setLocaleIssue("No se pudo leer el formato guardado. Se usa Automático.");
    }).finally(() => { if (active) setLocalePending(false); });
    return () => { active = false; chrome.storage.onChanged.removeListener(onChanged); };
  }, [embedded]);

  async function saveLocale(value: string) {
    const next = normalizeExecutionLocale(value);
    const revision = localeRevision.current;
    setLocalePending(true);
    setLocaleIssue("");
    setFeedback("");
    try {
      await chrome.storage.local.set({ [localeKey]: next });
      if (revision === localeRevision.current) setLocale(next);
    } catch {
      setLocaleIssue("No se pudo guardar el formato regional. Volvé a intentar.");
    } finally { setLocalePending(false); }
  }

  useEffect(() => () => {
    reader.current?.dispose();
    reader.current = null;
  }, []);

  const underlyings = [...new Set(report?.rows.map(row => row.underlying))].sort();
  const underlying = underlyings.includes(underlyingChoice) ? underlyingChoice : underlyings[0];
  const byUnderlying = useMemo(() => report?.rows.filter(row => row.underlying === underlying) ?? [], [report, underlying]);
  const expirations = [...new Set(byUnderlying.map(row => row.expiration))].sort();
  const expiration = expirations.includes(expirationChoice) ? expirationChoice : expirations[0];
  const rows = useMemo(() => summarizeExecutions(byUnderlying.filter(row => row.expiration === expiration), averaged), [byUnderlying, expiration, averaged]);
  const kind = kindChoice ?? (rows.some(row => row.kind === "call") ? "call" : "put");
  const visible = rows.filter(row => row.kind === kind);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(pageChoice, pages - 1);

  useEffect(() => {
    const current = reader.current;
    if (!report || !current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const verify = async () => {
      const valid = await current.call("verifyExecutionContext", { contextId: report.contextId }).catch(() => false);
      if (cancelled) return;
      if (valid !== true) {
        setReport(undefined);
        setFeedback("");
        setIssue(contextChanged);
      } else {
        timer = setTimeout(() => void verify(), 2000);
      }
    };
    timer = setTimeout(() => void verify(), 2000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [report]);

  async function refresh() {
    setBusy(true);
    setReport(undefined);
    setPage(0);
    setIssue("");
    setFeedback("");
    let current: MarketReader | null = null;
    try {
      current = reader.current ??= new MarketReader("options-executions-reader.js");
      const next = await current.call<ExecutionReport>("executions");
      if (!next || typeof next.contextId !== "string" || !Array.isArray(next.rows)) throw Error("Reporte de operaciones inválido.");
      if (reader.current === current) setReport(next);
    } catch (error) {
      setIssue(error instanceof Error ? error.message : "No se pudieron cargar las operaciones.");
      if (current && reader.current === current) {
        current.dispose();
        reader.current = null;
      }
    } finally { setBusy(false); }
  }

  async function copy(scope: OptionKind | "both") {
    const current = reader.current;
    if (!report || !current) return;
    setBusy(true);
    setIssue("");
    setFeedback("");
    try {
      if (await current.call("verifyExecutionContext", { contextId: report.contextId }) !== true) throw Error(contextChanged);
    } catch {
      setReport(undefined);
      setIssue(contextChanged);
      setBusy(false);
      return;
    }
    if (reader.current !== current) return;
    try {
      await navigator.clipboard.writeText(executionClipboard(rows, scope, averaged, format));
      setFeedback("Operaciones copiadas al portapapeles.");
    } catch {
      setIssue("No se pudo copiar. Volvé a intentar con Matriz en primer plano.");
    } finally { setBusy(false); }
  }

  if (!embedded) return <section className="ct-operations" aria-label="Operaciones de opciones">
    <p>Abrí ChuchoTriz dentro de Matriz para consultar las operaciones de la cuenta activa.</p>
  </section>;

  return <section className="ct-operations" aria-label="Operaciones de opciones">
    <div className="ct-operations-toolbar">
      <button type="button" disabled={busy} onClick={() => void refresh()}>{busy && !report ? "Leyendo…" : "Actualizar desde Matriz"}</button>
      {underlying && <label>Subyacente <select value={underlying} disabled={busy}
        onChange={event => { setUnderlying(event.target.value); setExpiration(""); setKind(undefined); setPage(0); setFeedback(""); }}>
        {underlyings.map(value => <option key={value}>{value}</option>)}
      </select></label>}
      {expiration && <label>Vencimiento <select value={expiration} disabled={busy}
        onChange={event => { setExpiration(event.target.value); setKind(undefined); setPage(0); setFeedback(""); }}>
        {expirations.map(value => <option key={value}>{value}</option>)}
      </select></label>}
      <label>Formato regional <select value={locale} disabled={busy || localePending}
        onChange={event => void saveLocale(event.target.value)}>
        <option value="auto">Automático</option>
        <option value="es-AR">Argentina (1.234,56)</option>
        <option value="en-US">Estados Unidos (1,234.56)</option>
      </select></label>
    </div>
    {localeIssue && <p role="alert">{localeIssue}</p>}
    {!report && !busy && !issue && <p>Actualizá para ver las ejecuciones de opciones de la cuenta activa.</p>}
    {report?.unmatched ? <p role="status">{report.unmatched} {report.unmatched === 1 ? "ejecución quedó fuera" : "ejecuciones quedaron fuera"} porque faltan datos para identificarlas o copiarlas.</p> : null}
    {report && !report.rows.length && <p>No hay ejecuciones de opciones disponibles en el reporte de Matriz.</p>}
    {!!rows.length && <>
      <div className="ct-operations-toolbar">
        {(["call", "put"] as const).map(value => <button type="button" key={value} aria-pressed={kind === value}
          disabled={busy} onClick={() => { setKind(value); setPage(0); setFeedback(""); }}>{value === "call" ? "Calls" : "Puts"}</button>)}
        <label><input type="checkbox" checked={averaged} disabled={busy}
          onChange={event => { setAveraged(event.target.checked); setPage(0); setFeedback(""); }} /> Agrupar por strike</label>
        <button type="button" disabled={busy || localePending || !visible.length} onClick={() => void copy(kind)}>Copiar vista</button>
        <button type="button" disabled={busy || localePending} onClick={() => void copy("both")}>Copiar Calls y Puts</button>
      </div>
      {visible.length ? <div className="ct-operations-table"><table>
        <thead><tr><th>Fecha</th><th>Serie</th><th>Cantidad</th><th>Strike</th><th>{averaged ? "Precio promedio" : "Precio"}</th></tr></thead>
        <tbody>{visible.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => <tr key={index}>
          <td>{format.date(row.timestamp)}</td><td>{row.symbol}</td><td>{format.quantity(row.quantity)}</td>
          <td>{format.number(row.strike)}</td><td>{format.number(row.price)}</td>
        </tr>)}</tbody>
      </table></div> : <p>Sin ejecuciones de {kind === "call" ? "calls" : "puts"} para esta selección.</p>}
      {pages > 1 && <div className="ct-operations-toolbar" role="group" aria-label="Páginas de operaciones">
        <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
        <span>Página {page + 1} de {pages}</span>
        <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>Siguiente</button>
      </div>}
    </>}
    {issue && <p role="alert">{issue}</p>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
