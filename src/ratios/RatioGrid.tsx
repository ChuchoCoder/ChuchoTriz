import { useEffect, useRef, useState, type DragEvent } from "react";

export const monitorColumns = [ ["a", "Último A"], ["b", "Último B"], ["c", "Referencia C"], ["ratio", "Ratio / brecha"], ["daily", "Var. diaria"], ["updated", "Últ. valor"] ] as const;
export const operationColumns = [ ["quantity", "Cant. abiertas A/B"], ["ratio", "Ratio entrada → actual"], ["realized", "Realizado"], ["pending", "Pendiente"], ["net", "Neto total"], ["updated", "Últ. valor"] ] as const;
type Columns = readonly (readonly [string, string])[];
export const storedGridColumns = (value: unknown, columns: Columns) => Array.isArray(value)
  ? columns.map(([id]) => id).filter(id => value.includes(id)) : columns.map(([id]) => id);

/** UI preferences have their own keys; they never rewrite the trading ledger. */
export function useGridColumns(scope: string | undefined, kind: string, columns: Columns) {
  const key = scope ? `RatioGridColumnsV1:${scope}:${kind}` : undefined;
  const [state, setState] = useState<{ key?: string; visible: string[]; busy?: boolean; error?: string }>();
  const currentKey = useRef(key), writing = useRef(new Map<string, symbol>()); currentKey.current = key;
  useEffect(() => {
    if (!key) return;
    let closed = false, changed = false;
    const publish = (value: unknown) => { if (!closed) setState({ key, visible: storedGridColumns(value, columns) }); };
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && key in changes) { changed = true; if (!writing.current.has(key)) publish(changes[key].newValue); }
    };
    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get(key).then(values => { if (!changed) publish(values[key]); })
      .catch(() => { if (!closed && !changed) setState({ key, visible: storedGridColumns(undefined, columns), error: "No se pudieron leer las columnas." }); });
    return () => { closed = true; chrome.storage.onChanged.removeListener(listener); };
  }, [key, columns]);
  async function change(column?: string, checked?: boolean) {
    if (!key || state?.key !== key || writing.current.has(key)) return;
    const request = Symbol(); writing.current.set(key, request);
    const include = column ? checked ?? !state.visible.includes(column) : false;
    const apply = (visible: string[]) => column ? include ? storedGridColumns([...visible, column], columns) : visible.filter(id => id !== column) : storedGridColumns(undefined, columns);
    const before = state.visible;
    setState({ key, visible: apply(before), busy: true });
    const save = async () => {
      const values = await chrome.storage.local.get(key);
      const previous = storedGridColumns(values[key], columns);
      const visible = apply(previous);
      if (currentKey.current !== key) return;
      await chrome.storage.local.set({ [key]: visible });
      if (currentKey.current === key && writing.current.get(key) === request) setState({ key, visible });
    };
    try { if (navigator.locks) await navigator.locks.request(key, save); else await save(); }
    catch {
      let visible = before;
      try { visible = storedGridColumns((await chrome.storage.local.get(key))[key], columns); } catch { /* Keep the last confirmed layout. */ }
      if (currentKey.current === key && writing.current.get(key) === request) setState({ key, visible, error: "No se pudieron guardar las columnas. Volvé a intentar." });
    }
    finally { if (writing.current.get(key) === request) writing.current.delete(key); }
  }
  const loaded = !!key && state?.key === key;
  return { has: (column: string) => (loaded ? state.visible : columns.map(([id]) => id)).includes(column), change, disabled: !loaded || !!state?.busy || !!key && writing.current.has(key), error: loaded ? state.error : undefined };
}

export function GridColumnPicker({ label, columns, preferences }: { label: string; columns: Columns; preferences: ReturnType<typeof useGridColumns> }) {
  return <details className="ro-columns"><summary>Columnas<span className="ct-ratios-sr"> de {label}</span></summary><div className="ro-column-options" aria-label={`Columnas de ${label}`}>
    {columns.map(([id, name]) => <label key={id}><input type="checkbox" checked={preferences.has(id)} disabled={preferences.disabled} onChange={event => void preferences.change(id, event.target.checked)} />{name}</label>)}
    <button type="button" disabled={preferences.disabled} onClick={() => void preferences.change()}>Restablecer columnas</button>
    {preferences.error && <small role="alert">{preferences.error}</small>}
  </div></details>;
}

export interface GridSort { column: string; direction: "asc" | "desc" }
export type GridValue = string | number | undefined;
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
const usable = (value: GridValue) => typeof value === "number" && !Number.isFinite(value) ? undefined : value;

export function nextGridSort(previous: GridSort | undefined, column: string): GridSort | undefined {
  return previous?.column !== column ? { column, direction: "asc" } : previous.direction === "asc" ? { column, direction: "desc" } : undefined;
}
export function sortGridRows<T>(rows: readonly T[], sort: GridSort | undefined, value: (row: T, column: string) => GridValue): T[] {
  if (!sort) return [...rows];
  return rows.map((row, index) => ({ row, index, value: usable(value(row, sort.column)) })).sort((a, b) => {
    if (a.value === undefined || b.value === undefined) return a.value === b.value ? a.index - b.index : a.value === undefined ? 1 : -1;
    const comparison = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : collator.compare(String(a.value), String(b.value));
    return comparison ? comparison * (sort.direction === "asc" ? 1 : -1) : a.index - b.index;
  }).map(item => item.row);
}

/** Reorder only the visible slots, leaving filtered-out records and all record data intact. */
export function reorderGridRows<T extends { id: string }>(rows: readonly T[], displayedIds: readonly string[], from: string, to: string): T[] {
  const byId = new Map(rows.map(row => [row.id, row])), ids = [...displayedIds];
  if (byId.size !== rows.length || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id)) || !ids.includes(from) || !ids.includes(to)) throw Error("La grilla cambió. Volvé a intentar el movimiento.");
  const source = ids.indexOf(from), target = ids.indexOf(to);
  ids.splice(target, 0, ids.splice(source, 1)[0]);
  const visible = new Set(ids); let index = 0;
  return rows.map(row => visible.has(row.id) ? byId.get(ids[index++])! : row);
}

export function GridSortHeader({ label, column, sort, onSort, disabled, description }: {
  label: string; column: string; sort?: GridSort; onSort(column: string): void; disabled: boolean; description?: string;
}) {
  const active = sort?.column === column;
  return <th scope="col" aria-sort={active ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" className="ro-sort-button" disabled={disabled} onClick={() => onSort(column)} aria-label={`Ordenar por ${label}`} title={description || "Ascendente → descendente → orden manual"}>
      <span className="ro-sort-label">{label}</span><span aria-hidden="true" className={`ro-sort-arrow ${active ? "ro-sort-active" : "ro-sort-idle"}`}>{active ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span>
    </button>
  </th>;
}

export function GridActionIcon({ action }: { action: "detail" | "edit" | "delete" }) {
  return <svg aria-hidden="true" focusable="false" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {action === "detail" ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></> : action === "edit" ? <><path d="m16 4 4 4M4 20l4-1L20 7a2.12 2.12 0 0 0-3-3L5 16l-1 4Z" /></> : <><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></>}
  </svg>;
}

export function GridRowHandle({ label, disabled, busy, onStart, onEnd, onMove }: {
  label: string; disabled: boolean; busy: boolean; onStart(event: DragEvent<HTMLButtonElement>): void; onEnd(): void; onMove(direction: -1 | 1): void;
}) {
  return <button type="button" className="ro-row-handle NoDraggable" aria-label={`Mover ${label}`} title="Arrastrá para mover; con foco, usá ↑ o ↓" draggable={!disabled && !busy} disabled={disabled} aria-disabled={disabled || busy}
    onDragStart={onStart} onDragEnd={onEnd} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); if (!disabled && !busy) onMove(event.key === "ArrowUp" ? -1 : 1); } }}><span aria-hidden="true">⠿</span></button>;
}
