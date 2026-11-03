export function formatOptionNumber(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("es-AR", precision === undefined ? { maximumSignificantDigits: 21 } : { maximumFractionDigits: precision });
}
