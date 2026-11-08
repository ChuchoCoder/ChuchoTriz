export type OptionKind = "call" | "put";
export type ExecutionLocale = "auto" | "es-AR" | "en-US";

export function normalizeExecutionLocale(value: unknown): ExecutionLocale {
  return value === "es-AR" || value === "en-US" ? value : "auto";
}

export interface OptionExecution {
  securityId: string;
  symbol: string;
  underlying: string;
  expiration: string;
  kind: OptionKind;
  strike: number;
  currency: string;
  strikeCurrency: string;
  settlement: string;
  timestamp: number;
  quantity: number;
  price: number;
}

export interface ExecutionGroup {
  key: string;
  underlying: string;
  expiration: string;
  rows: OptionExecution[];
}

export function groupExecutions(executions: OptionExecution[], averaged: boolean): ExecutionGroup[] {
  const groups = new Map<string, ExecutionGroup>();
  for (const row of executions) {
    const { underlying, expiration } = row;
    const key = JSON.stringify([underlying, expiration]);
    let group = groups.get(key);
    if (!group) {
      group = { key, underlying, expiration, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()]
    .sort((a, b) => a.underlying.localeCompare(b.underlying) || a.expiration.localeCompare(b.expiration))
    .map(group => ({ ...group, rows: summarizeExecutions(group.rows, averaged) }));
}

export function summarizeExecutions(executions: OptionExecution[], averaged: boolean): OptionExecution[] {
  let rows = executions;
  if (averaged) {
    const groups = new Map<string, { first: OptionExecution; quantity: number; notional: number }>();
    for (const row of executions) {
      const key = JSON.stringify([row.securityId, row.underlying, row.expiration, row.kind, row.strike, row.currency,
        row.strikeCurrency, row.settlement, Math.sign(row.quantity)]);
      const group = groups.get(key);
      if (group) {
        group.quantity += row.quantity;
        group.notional += row.quantity * row.price;
      } else {
        groups.set(key, { first: row, quantity: row.quantity, notional: row.quantity * row.price });
      }
    }
    rows = Array.from(groups.values(), ({ first, quantity, notional }) => ({
      ...first, quantity, price: Math.round((notional / quantity + Number.EPSILON) * 10000) / 10000,
    }));
  }
  return [...rows].sort((a, b) => a.strike - b.strike || b.price - a.price);
}

export function executionFormatters(preference: ExecutionLocale = "auto", languages: readonly string[] = navigator.languages) {
  const locale = preference === "auto"
    ? languages.find(language => new Intl.NumberFormat(language).format(1.1).includes(".")) ?? "en-US"
    : preference;
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
  const dates = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
  return {
    date: (value: number) => dates.format(value),
    number: (value: number) => numbers.format(value),
    quantity: (value: number) => Number.isInteger(value) ? String(value) : numbers.format(value),
  };
}

export function executionClipboard(rows: OptionExecution[], scope: OptionKind | "both", averaged: boolean,
  format = executionFormatters()): string {
  const line = (row: OptionExecution) => [
    format.date(row.timestamp), format.quantity(row.quantity), format.number(row.strike), format.number(row.price),
  ].join("\t");
  if (scope !== "both") return rows.filter(row => row.kind === scope).map(line).join("\n");

  const mode = averaged ? "CON PROMEDIOS" : "SIN PROMEDIOS";
  return (["call", "put"] as const).flatMap(kind => {
    const section = rows.filter(row => row.kind === kind).map(line);
    return section.length ? [[`OPERACIONES ${kind.toUpperCase()}S (${mode})`, ...section].join("\n")] : [];
  }).join("\n\n");
}
