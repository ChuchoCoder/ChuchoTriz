export function formatOptionNumber(value: number, precision?: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("es-AR", precision === undefined ? { maximumSignificantDigits: 21 } : { maximumFractionDigits: precision });
}

export function formatOptionVolatility(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

export function formatOptionAmount(value: number): string {
  return value.toLocaleString("es-AR", value !== 0 && Math.abs(value) < .01 ? { maximumSignificantDigits: 4 } : { maximumFractionDigits: 2 });
}

export function formatExpiryDays(days: number | undefined): string {
  return days === undefined ? "—" : days < 0 ? "Vencido" : `${days}d`;
}

/** Editable numeric fields accept ordinary decimals, including very small prices. */
export function formatOptionInput(value: number): string {
  return value.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 15 });
}
