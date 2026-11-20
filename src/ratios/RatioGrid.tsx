import type { DragEvent } from "react";

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
