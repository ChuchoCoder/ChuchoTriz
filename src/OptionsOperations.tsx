import { useEffect, useMemo, useRef, useState } from "react";
import { MarketReader } from "./optionsSimulator/market";
import { executionClipboard, executionFormatters, groupExecutions, normalizeExecutionLocale, type ExecutionGroup, type ExecutionLocale, type OptionExecution, type OptionKind } from "./optionExecutions";
import "./OptionsOperations.css";

interface ExecutionReport {
  contextId: string;
  rows: OptionExecution[];
  unmatched: number;
}

type CopyScope = OptionKind | "both";
type CopyNotice = { group: string; scope: CopyScope; error?: boolean };

const pageSize = 200;
const copyConfirmationMs = 1600;
const localeKey = "OptionsOperationsLocale";
const contextChanged = "Cambió la cuenta o la sesión de Matriz. Volvé a cargar las operaciones.";

const iconPaths = {
  refresh: "M20 11a8 8 0 1 0-2 6m2-12v6h-6",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  check: "m5 12 4 4L19 6",
  previous: "m15 6-6 6 6 6",
  next: "m9 6 6 6-6 6",
};

function OperationIcon({ icon }: { icon: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[icon]} /></svg>;
}

function CopyButton({ label, disabled, notice, onCopy }: {
  label: string;
  disabled: boolean;
  notice?: CopyNotice;
  onCopy(): void;
}) {
  const copied = !!notice && !notice.error;
  return <button type="button" disabled={disabled} className="ct-operations-copy-button" data-copied={copied || undefined} onClick={onCopy}>
    <OperationIcon icon={copied ? "check" : "copy"} />
    <span className="ct-operations-copy-label">
      <span aria-hidden="true">{label}</span>
      <span aria-live="polite">{copied ? "Copiado!" : label}</span>
    </span>
  </button>;
}

function CopyError({ notice }: { notice?: CopyNotice }) {
  if (!notice?.error) return null;
  return <p className="ct-operations-copy-error" role="alert">
    No se pudo copiar. Volvé a intentar con Matriz en primer plano.
  </p>;
}

function OperationsSide({ label, rows, averaged, format, disabled, notice, onCopy }: {
  label: "Calls" | "Puts";
  rows: OptionExecution[];
  averaged: boolean;
  format: ReturnType<typeof executionFormatters>;
  disabled: boolean;
  notice?: CopyNotice;
  onCopy(): void;
}) {
  const [pageChoice, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageChoice, pages - 1);
  return <div className="ct-operations-side">
    <div className="ct-operations-toolbar ct-operations-heading">
      <h4>{label}</h4>
      <CopyButton label={`Copiar ${label}`} disabled={disabled || !rows.length} notice={notice} onCopy={onCopy} />
    </div>
    <CopyError notice={notice} />
    {rows.length ? <div className="ct-operations-table"><table aria-label={label}>
      <thead><tr><th>Fecha</th><th>Cantidad</th><th>Strike</th><th>{averaged ? "Precio promedio" : "Precio"}</th></tr></thead>
      <tbody>{rows.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => <tr key={index}>
        <td>{format.date(row.timestamp)}</td><td>{format.quantity(row.quantity)}</td>
        <td>{format.number(row.strike)}</td><td>{format.number(row.price)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="ct-operations-empty">Sin ejecuciones de {label.toLowerCase()}.</p>}
    {pages > 1 && <div className="ct-operations-toolbar ct-operations-pagination" role="group" aria-label={`Páginas de ${label}`}>
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><OperationIcon icon="previous" />Anterior</button>
      <span>Página {page + 1} de {pages}</span>
      <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>Siguiente<OperationIcon icon="next" /></button>
    </div>}
  </div>;
}

export default function OptionsOperations({ embedded }: { embedded: boolean }) {
  const reader = useRef<MarketReader | null>(null);
  const [report, setReport] = useState<ExecutionReport>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [copyNotice, setCopyNotice] = useState<CopyNotice>();
  const [averaged, setAveraged] = useState(false);
  const [locale, setLocale] = useState<ExecutionLocale>("auto");
  const [localePending, setLocalePending] = useState(true);
  const [localeIssue, setLocaleIssue] = useState("");
  const localeRevision = useRef(0);
  const format = useMemo(() => executionFormatters(locale), [locale]);

  useEffect(() => {
    if (!copyNotice || copyNotice.error) return;
    const timer = setTimeout(() => setCopyNotice(current => current === copyNotice ? undefined : current), copyConfirmationMs);
    return () => clearTimeout(timer);
  }, [copyNotice]);

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
    setCopyNotice(undefined);
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

  const groups = useMemo(() => groupExecutions(report?.rows ?? [], averaged), [report, averaged]);

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
        setCopyNotice(undefined);
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
    setIssue("");
    setCopyNotice(undefined);
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

  async function copy(group: ExecutionGroup, scope: CopyScope) {
    const current = reader.current;
    if (!report || !current) return;
    setBusy(true);
    setIssue("");
    setCopyNotice(undefined);
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
      await navigator.clipboard.writeText(executionClipboard(group.rows, scope, averaged, format));
      setCopyNotice({ group: group.key, scope });
    } catch {
      setCopyNotice({ group: group.key, scope, error: true });
    } finally { setBusy(false); }
  }

  if (!embedded) return <section className="ct-operations" aria-label="Operaciones de opciones">
    <p>Abrí ChuchoTriz dentro de Matriz para consultar las operaciones de la cuenta activa.</p>
  </section>;

  return <section className="ct-operations" aria-label="Operaciones de opciones">
    <div className="ct-operations-toolbar">
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        <OperationIcon icon="refresh" />{busy && !report ? "Leyendo…" : "Actualizar desde Matriz"}
      </button>
      <label>Formato regional <select value={locale} disabled={busy || localePending}
        onChange={event => void saveLocale(event.target.value)}>
        <option value="auto">Automático</option>
        <option value="es-AR">Argentina (1.234,56)</option>
        <option value="en-US">Estados Unidos (1,234.56)</option>
      </select></label>
      {groups.length > 0 && <label><input type="checkbox" checked={averaged} disabled={busy}
        onChange={event => { setAveraged(event.target.checked); setCopyNotice(undefined); }} /> Agrupar por strike</label>}
    </div>
    {localeIssue && <p role="alert">{localeIssue}</p>}
    {!report && !busy && !issue && <p>Actualizá para ver las ejecuciones de opciones de la cuenta activa.</p>}
    {report?.unmatched ? <p role="status">{report.unmatched} {report.unmatched === 1 ? "ejecución quedó fuera" : "ejecuciones quedaron fuera"} porque faltan datos para identificarlas o copiarlas.</p> : null}
    {report && !report.rows.length && <p>No hay ejecuciones de opciones disponibles en el reporte de Matriz.</p>}
    {issue && <p role="alert">{issue}</p>}
    {groups.map(group => {
      const notice = copyNotice?.group === group.key ? copyNotice : undefined;
      const combinedNotice = notice?.scope === "both" ? notice : undefined;
      return <section key={group.key} className="ct-operations-group" aria-label={`${group.underlying}, vencimiento ${group.expiration}`}>
        <div className="ct-operations-toolbar ct-operations-heading">
          <h3>{group.underlying} <span>· Vencimiento <time dateTime={group.expiration}>{group.expiration}</time></span></h3>
          <CopyButton label="Copiar Calls y Puts" disabled={busy || localePending} notice={combinedNotice} onCopy={() => void copy(group, "both")} />
        </div>
        <CopyError notice={combinedNotice} />
        <div className="ct-operations-sides" key={String(averaged)}>
          {(["call", "put"] as const).map(kind => <OperationsSide key={kind} label={kind === "call" ? "Calls" : "Puts"}
            rows={group.rows.filter(row => row.kind === kind)} averaged={averaged} format={format}
            disabled={busy || localePending} notice={notice?.scope === kind ? notice : undefined}
            onCopy={() => void copy(group, kind)} />)}
        </div>
      </section>;
    })}
  </section>;
}
