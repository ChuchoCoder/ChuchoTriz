import { describe, expect, it } from "vitest";
import { executionClipboard, executionFormatters, summarizeExecutions, type OptionExecution } from "./optionExecutions";

const execution: OptionExecution = {
  symbol: "GFGC1234", underlying: "GGAL", expiration: "2026-12-18", kind: "call",
  strike: 1234.5, currency: "ARS", strikeCurrency: "ARS", settlement: "1",
  timestamp: new Date(2026, 10, 6, 12).getTime(), quantity: 2, price: 10,
};

describe("operaciones de opciones", () => {
  it("separa ejecuciones y pondera compras y ventas por separado en cada strike", () => {
    const rows = [
      execution,
      { ...execution, quantity: 6, price: 16 },
      { ...execution, quantity: -1, price: 12 },
      { ...execution, quantity: -3, price: 20 },
      { ...execution, quantity: 5, price: 17, kind: "put" as const },
      { ...execution, quantity: 7, price: 11, expiration: "2027-02-19" },
      { ...execution, quantity: 4, price: 9, currency: "USD" },
    ];
    expect(summarizeExecutions(rows, false)).toHaveLength(7);
    expect(summarizeExecutions(rows, true).map(row => [row.quantity, row.price])).toEqual([
      [-4, 18], [5, 17], [8, 14.5], [7, 11], [4, 9],
    ]);
  });

  it("conserva la salida tabulada sin encabezados de columnas y los títulos del modo combinado", () => {
    const rows = [execution, { ...execution, kind: "put" as const, quantity: -1000, price: 1.23456 }];
    const format = executionFormatters(["es-AR", "en-US"]);
    expect(executionClipboard(rows, "call", false, format)).toBe("11/06/2026\t2\t1,234.5\t10");
    expect(executionClipboard(rows, "both", true, format)).toBe(
      "OPERACIONES CALLS (CON PROMEDIOS)\n11/06/2026\t2\t1,234.5\t10\n\n" +
      "OPERACIONES PUTS (CON PROMEDIOS)\n11/06/2026\t-1000\t1,234.5\t1.2346",
    );
    expect(executionClipboard([execution], "both", false, format)).toBe(
      "OPERACIONES CALLS (SIN PROMEDIOS)\n11/06/2026\t2\t1,234.5\t10",
    );
  });
});
