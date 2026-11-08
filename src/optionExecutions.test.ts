import { describe, expect, it } from "vitest";
import { executionClipboard, executionFormatters, groupExecutions, summarizeExecutions, type OptionExecution } from "./optionExecutions";

const execution: OptionExecution = {
  securityId: "series-call", symbol: "GFGC1234", underlying: "GGAL", expiration: "2026-12-18", kind: "call",
  strike: 1234.5, currency: "ARS", strikeCurrency: "ARS", settlement: "1",
  timestamp: new Date(2026, 10, 6, 12).getTime(), quantity: 2, price: 10,
};

describe("operaciones de opciones", () => {
  it("agrupa por subyacente y vencimiento y limita la copia a ese grupo y lado", () => {
    const groups = groupExecutions([
      { ...execution, expiration: "2027-02-19", quantity: 9 },
      { ...execution, underlying: "YPFD", quantity: 7 },
      execution,
      { ...execution, quantity: 6, price: 16 },
      { ...execution, kind: "put", quantity: -3, price: 8 },
    ], true);
    expect(groups.map(({ underlying, expiration }) => [underlying, expiration])).toEqual([
      ["GGAL", "2026-12-18"], ["GGAL", "2027-02-19"], ["YPFD", "2026-12-18"],
    ]);
    const format = executionFormatters("en-US");
    expect(executionClipboard(groups[0].rows, "call", true, format)).toBe("11/06/2026\t8\t1,234.5\t14.5");
    expect(executionClipboard(groups[0].rows, "put", true, format)).toBe("11/06/2026\t-3\t1,234.5\t8");
  });

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

  it("mantiene separadas las series nativas aunque tengan los mismos datos visibles", () => {
    const rows = summarizeExecutions([
      execution,
      { ...execution, quantity: 6, price: 16 },
      { ...execution, securityId: "other-series", quantity: 3, price: 18 },
    ], true);
    expect(rows.map(row => [row.securityId, row.quantity, row.price])).toEqual([
      ["other-series", 3, 18], [execution.securityId, 8, 14.5],
    ]);
    expect(executionClipboard(rows, "call", true, executionFormatters("en-US"))).toBe(
      "11/06/2026\t3\t1,234.5\t18\n11/06/2026\t8\t1,234.5\t14.5",
    );
  });

  it("conserva la salida tabulada sin encabezados de columnas y los títulos del modo combinado", () => {
    const rows = [execution, { ...execution, kind: "put" as const, quantity: -1000, price: 1.23456 }];
    const format = executionFormatters("auto", ["es-AR", "en-US"]);
    expect(executionClipboard(rows, "call", false, format)).toBe("11/06/2026\t2\t1,234.5\t10");
    expect(executionClipboard(rows, "both", true, format)).toBe(
      "OPERACIONES CALLS (CON PROMEDIOS)\n11/06/2026\t2\t1,234.5\t10\n\n" +
      "OPERACIONES PUTS (CON PROMEDIOS)\n11/06/2026\t-1000\t1,234.5\t1.2346",
    );
    expect(executionClipboard([execution], "both", false, format)).toBe(
      "OPERACIONES CALLS (SIN PROMEDIOS)\n11/06/2026\t2\t1,234.5\t10",
    );
  });

  it("respeta la región elegida en la fecha, el strike y el precio sin cambiar el TSV", () => {
    const rows = [{ ...execution, quantity: -1000, price: 1.23456 }];
    expect(executionClipboard(rows, "call", false, executionFormatters("es-AR", ["en-US"])))
      .toBe("06/11/2026\t-1000\t1.234,5\t1,2346");
    expect(executionClipboard(rows, "call", false, executionFormatters("en-US", ["en-GB"])))
      .toBe("11/06/2026\t-1000\t1,234.5\t1.2346");
    expect(executionFormatters("auto", ["es-AR"]).number(1234.5)).toBe("1,234.5");
  });
});
