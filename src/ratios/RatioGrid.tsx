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
      {label}<span aria-hidden="true" className={active ? "ro-sort-active" : "ro-sort-idle"}>{active ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span>
    </button>
  </th>;
}

export function GridRowHandle({ label, disabled, busy, onStart, onEnd, onMove }: {
  label: string; disabled: boolean; busy: boolean; onStart(event: DragEvent<HTMLButtonElement>): void; onEnd(): void; onMove(direction: -1 | 1): void;
}) {
  return <button type="button" className="ro-row-handle NoDraggable" aria-label={`Mover ${label}`} title="Arrastrá para mover; con foco, usá ↑ o ↓" draggable={!disabled && !busy} disabled={disabled} aria-disabled={disabled || busy}
    onDragStart={onStart} onDragEnd={onEnd} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); if (!disabled && !busy) onMove(event.key === "ArrowUp" ? -1 : 1); } }}><span aria-hidden="true">⠿</span></button>;
}
