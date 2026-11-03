export function formatOptionNumber(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("es-AR", precision === undefined ? { maximumSignificantDigits: 21 } : { maximumFractionDigits: precision });
}

/** Editable numeric fields accept ordinary decimals, including very small prices. */
export function formatOptionInput(value: number): string {
  return value.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 15 });
}
