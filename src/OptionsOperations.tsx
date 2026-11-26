import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MarketReader } from "./optionsSimulator/market";
import { executionClipboard, executionFormatters, groupExecutions, normalizeExecutionLocale, type ExecutionGroup, type ExecutionLocale, type OptionExecution, type OptionKind } from "./optionExecutions";
import styles from "./OptionsOperations.css?inline";
import { installToolStyles } from "./toolStyles";

installToolStyles(styles);

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
const localeKeys = { numbers:"OptionsOperationsNumberLocale", dates:"OptionsOperationsDateLocale" } as const;
type LocaleField = keyof typeof localeKeys;
const localeFields = ["numbers", "dates"] as const;
const allLocaleKeys = [localeKey, ...Object.values(localeKeys)];
const localesFrom = (values: Record<string, unknown>): Record<LocaleField, ExecutionLocale> => ({
  numbers:normalizeExecutionLocale(values[localeKeys.numbers] === undefined ? values[localeKey] : values[localeKeys.numbers]),
  dates:normalizeExecutionLocale(values[localeKeys.dates] === undefined ? values[localeKey] : values[localeKeys.dates]),
});
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

function useExecutionLocales(embedded: boolean) {
  const [locales, setLocales] = useState(() => localesFrom({}));
  const [pending, setPending] = useState(true);
  const [issue, setIssue] = useState("");
  const stored = useRef<Record<string, unknown>>({});
  const revisions = useRef({ numbers:0, dates:0 });
  const session = useRef(0);

  useEffect(() => {
    if (!embedded) return;
    const current = ++session.current;
    const changesDuringRead: Record<string, unknown> = {};
    setPending(true); setIssue("");
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || current !== session.current) return;
      const changedKeys = allLocaleKeys.filter(key => Object.hasOwn(changes, key));
      if (!changedKeys.length) return;
      for (const field of localeFields) {
        if (changedKeys.includes(localeKeys[field]) ||
          (changedKeys.includes(localeKey) && stored.current[localeKeys[field]] === undefined)) revisions.current[field]++;
      }
      for (const key of changedKeys) changesDuringRead[key] = changes[key].newValue;
      stored.current = { ...stored.current, ...Object.fromEntries(changedKeys.map(key => [key, changes[key].newValue])) };
      setLocales(localesFrom(stored.current)); setIssue("");
    };
    chrome.storage.onChanged.addListener(onChanged);
    void chrome.storage.local.get(allLocaleKeys).then(values => {
      if (current !== session.current) return;
      stored.current = { ...values, ...changesDuringRead };
      setLocales(localesFrom(stored.current));
    }).catch(() => {
      if (current === session.current) setIssue("No se pudieron leer todos los formatos guardados. Revisá las preferencias.");
    }).finally(() => { if (current === session.current) setPending(false); });
    return () => { session.current++; chrome.storage.onChanged.removeListener(onChanged); };
  }, [embedded]);

  async function save(field: LocaleField, value: string) {
    const next = normalizeExecutionLocale(value), current = session.current, revision = revisions.current[field];
    setPending(true); setIssue("");
    try {
      await chrome.storage.local.set({ [localeKeys[field]]:next });
      if (current === session.current && revision === revisions.current[field]) {
        stored.current = { ...stored.current, [localeKeys[field]]:next };
        setLocales(localesFrom(stored.current));
      }
    } catch {
      if (current === session.current) setIssue("No se pudo guardar el formato. Volvé a intentar.");
    } finally { if (current === session.current) setPending(false); }
  }
  return { locales, pending, issue, save };
}

export default function OptionsOperations({ embedded }: { embedded: boolean }) {
  const reader = useRef<MarketReader | null>(null);
  const readRevision = useRef(0);
  const [report, setReport] = useState<ExecutionReport>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [copyNotice, setCopyNotice] = useState<CopyNotice>();
  const [averaged, setAveraged] = useState(true);
  const { locales, pending:localePending, issue:localeIssue, save:saveLocale } = useExecutionLocales(embedded);
  const format = useMemo(() => executionFormatters(locales.numbers, undefined, locales.dates), [locales.numbers, locales.dates]);
  const currentFormat = useRef(format);
  useLayoutEffect(() => { currentFormat.current = format; }, [format]);
  const localeOptions = useMemo(() => ([
    ["auto", "Automático", "Automático"], ["es-AR", "Argentina", "Día/mes/año"], ["en-US", "Estados Unidos", "Mes/día/año"],
  ] as const).map(([value, numberName, dateName]) => {
    const example = executionFormatters(value);
    return { value, numberLabel:`${numberName} (${example.number(1234.56)})`, dateLabel:`${dateName} (${example.expiration("2026-12-18")})` };
  }), []);

  useEffect(() => { setCopyNotice(undefined); }, [locales.numbers, locales.dates]);

  useEffect(() => {
    if (!copyNotice || copyNotice.error) return;
    const timer = setTimeout(() => setCopyNotice(current => current === copyNotice ? undefined : current), copyConfirmationMs);
    return () => clearTimeout(timer);
  }, [copyNotice]);

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

  const refresh = useCallback(async () => {
    const revision = ++readRevision.current;
    setBusy(true);
    setReport(undefined);
    setIssue("");
    setCopyNotice(undefined);
    let current: MarketReader | null = null;
    try {
      current = reader.current ??= new MarketReader("options-executions-reader.js");
      const next = await current.call<ExecutionReport>("executions");
      if (revision !== readRevision.current) return;
      if (!next || typeof next.contextId !== "string" || !Array.isArray(next.rows)) throw Error("Reporte de operaciones inválido.");
      if (reader.current === current) setReport(next);
    } catch (error) {
      if (revision !== readRevision.current) return;
      setIssue(error instanceof Error ? error.message : "No se pudieron cargar las operaciones.");
      if (current && reader.current === current) {
        current.dispose();
        reader.current = null;
      }
    } finally { if (revision === readRevision.current) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!embedded) return;
    void refresh();
    return () => {
      readRevision.current++;
      reader.current?.dispose();
      reader.current = null;
    };
  }, [embedded, refresh]);

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
      await navigator.clipboard.writeText(executionClipboard(group.rows, scope, averaged, currentFormat.current));
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
      <label>Formato de números <select value={locales.numbers} disabled={busy || localePending}
        onChange={event => { setCopyNotice(undefined); void saveLocale("numbers", event.target.value); }}>
        {localeOptions.map(option => <option key={option.value} value={option.value}>{option.numberLabel}</option>)}
      </select></label>
      <label>Formato de fecha <select value={locales.dates} disabled={busy || localePending}
        onChange={event => { setCopyNotice(undefined); void saveLocale("dates", event.target.value); }}>
        {localeOptions.map(option => <option key={option.value} value={option.value}>{option.dateLabel}</option>)}
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
      return <section key={group.key} className="ct-operations-group" aria-label={`${group.underlying}, vencimiento ${format.expiration(group.expiration)}`}>
        <div className="ct-operations-toolbar ct-operations-heading">
          <h3>{group.underlying} <span>· Vencimiento <time dateTime={group.expiration}>{format.expiration(group.expiration)}</time></span></h3>
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
