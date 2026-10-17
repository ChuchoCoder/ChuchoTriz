import { describe, it, expect } from "vitest";
import { defaultBook, fallbackPresets, format, label, parse, presetsFor, PresetBook } from "./PresetBook";

describe("parse y format", () => {
  it("parse(format(book)) devuelve el mismo Preset book", () => {
    const { book, errors } = parse(format(defaultBook));

    expect(errors).toEqual([]);
    expect(book).toEqual(defaultBook);
    expect(Object.keys(book)).toEqual(Object.keys(defaultBook));
  });

  it("lee Cantidad sola como Cantidad a mostrar cero y format la escribe igual", () => {
    const text = "AL30 200000/25000 100000/10000 50000\nDLR 5000/500 1000/100 100 50\n";

    const { book, errors } = parse(text);

    expect(errors).toEqual([]);
    expect(book).toEqual({
      AL30: [{ cantidad: 200000, mostrar: 25000 }, { cantidad: 100000, mostrar: 10000 }, { cantidad: 50000, mostrar: 0 }],
      DLR: [{ cantidad: 5000, mostrar: 500 }, { cantidad: 1000, mostrar: 100 }, { cantidad: 100, mostrar: 0 }, { cantidad: 50, mostrar: 0 }],
    });
    expect(format(book)).toBe(text);
  });

  it("ignora líneas vacías, espacios repetidos o de cualquier tipo y CRLF", () => {
    const { book, errors } = parse("\r\n  AL30  100/10 \r\n   \r\n\tGD30\t50/0 \r\n");

    expect(errors).toEqual([]);
    expect(book).toEqual({ AL30: [{ cantidad: 100, mostrar: 10 }], GD30: [{ cantidad: 50, mostrar: 0 }] });
    expect(format(book)).toBe("AL30 100/10\nGD30 50\n");
  });

  it("pasa el Ticker a mayúsculas, como lo busca Matriz", () => {
    expect(parse("gd30 100\nGgal 50").book).toEqual({ GD30: [{ cantidad: 100, mostrar: 0 }], GGAL: [{ cantidad: 50, mostrar: 0 }] });
  });

  it("acepta Cantidad a mostrar igual a la Cantidad y la Cantidad más grande segura", () => {
    expect(parse("AL30 100/100 9007199254740991").book).toEqual({
      AL30: [{ cantidad: 100, mostrar: 100 }, { cantidad: 9007199254740991, mostrar: 0 }],
    });
  });
});

describe("parse con errores", () => {
  it.each([
    ["Ticker sin Presets", "AL30", 1, "Falta al menos un Preset para AL30"],
    ["Ticker con espacio al final y sin Presets", "AL30 ", 1, "Falta al menos un Preset para AL30"],
    ["valor que no es número", "AL30 abc", 1, '"abc" no es un Preset'],
    ["número con letras", "AL30 10k", 1, '"10k" no es un Preset'],
    ["decimal", "AL30 1.5", 1, '"1.5" no es un Preset'],
    ["negativo", "AL30 -5", 1, '"-5" no es un Preset'],
    ["Cantidad a mostrar vacía", "AL30 100/", 1, '"100/" no es un Preset'],
    ["Cantidad a mostrar no numérica", "AL30 100/abc", 1, '"100/abc" no es un Preset'],
    ["Cantidad vacía", "AL30 /100", 1, '"/100" no es un Preset'],
    ["Cantidad cero", "AL30 0/0", 1, "la Cantidad debe ser mayor a cero"],
    ["Ticker repetido", "AL30 100\nGD30 50\nAL30 200", 3, "AL30 ya está configurado en la línea 1"],
    ["Ticker repetido con otras mayúsculas", "AL30 100\nal30 200", 2, "AL30 ya está configurado en la línea 1"],
    ["línea sin Ticker", "200000/25000 50000", 1, 'Falta el Ticker al principio de la línea, antes de "200000/25000"'],
    ["línea sin Ticker que empieza con espacio", " 100 50", 1, 'Falta el Ticker al principio de la línea, antes de "100"'],
    ["línea sin Ticker que empieza con /", "/100 50", 1, "Falta el Ticker"],
    ["Cantidad a mostrar mayor que la Cantidad", "AL30 1000/5000", 1, '"1000/5000": la Cantidad a mostrar no puede ser mayor que la Cantidad'],
    ["Cantidad demasiado grande", "AL30 9007199254740992", 1, "la Cantidad es demasiado grande"],
    ["Cantidad que no entra en un número", "AL30 99999999999999999999999", 1, "la Cantidad es demasiado grande"],
  ])("%s", (_, text, line, message) => {
    const { errors } = parse(text);

    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(line);
    expect(errors[0].message).toContain(message);
  });

  it("informa cada valor inválido y deja la línea fuera del Preset book", () => {
    const { book, errors } = parse("GD30 50\nAL30 100 abc 200 x/1");

    expect(errors.map((error) => error.line)).toEqual([2, 2]);
    expect(book).toEqual({ GD30: [{ cantidad: 50, mostrar: 0 }] });
  });

  it("informa el error de un Preset book guardado vacío para un Ticker", () => {
    const { errors } = parse(format({ AL30: [] }));

    expect(errors).toEqual([{ line: 1, message: "Falta al menos un Preset para AL30" }]);
  });
});

describe("presetsFor", () => {
  const al = [{ cantidad: 1, mostrar: 0 }];
  const al30 = [{ cantidad: 2, mostrar: 0 }];
  const al30d = [{ cantidad: 3, mostrar: 0 }];
  const gd30 = [{ cantidad: 4, mostrar: 0 }];
  const ggal = [{ cantidad: 5, mostrar: 0 }];
  const gfg = [{ cantidad: 6, mostrar: 0 }];

  it.each<[string, PresetBook, string, unknown]>([
    ["coincidencia exacta", { AL: al, AL30: al30, AL30D: al30d }, "AL30", al30],
    ["Ticker del Preset book que es comienzo del buscado", { AL: al, GD30: gd30 }, "AL30", al],
    ["gana el comienzo más largo", { A: gd30, AL: al, AL3: al30 }, "AL30", al30],
    ["Ticker del Preset book que empieza con el buscado", { GD30: gd30, AL30D: al30d }, "AL30", al30d],
    ["el que es comienzo del buscado gana al que empieza con el buscado", { AL30D: al30d, AL: al }, "AL30", al],
    ["prefijo corto ambiguo: el primero del Preset book", { GD30: gd30, GGAL: ggal, GFG: gfg }, "G", gd30],
    ["prefijo corto ambiguo en otro orden", { GGAL: ggal, GFG: gfg, GD30: gd30 }, "G", ggal],
    ["Ticker de una letra en el Preset book", { G: al, GD30: gd30 }, "GGAL", al],
    ["Presets vacíos guardados para el Ticker", { AL30: [], GD30: gd30 }, "AL30", []],
    ["sin coincidencia", { AL30: al30, GD30: gd30 }, "YPFD", fallbackPresets],
    ["Preset book vacío", {}, "AL30", fallbackPresets],
    ["no ignora mayúsculas", { al30: al30 }, "AL30", fallbackPresets],
  ])("%s", (_, book, ticker, expected) => {
    expect(presetsFor(book, ticker)).toEqual(expected);
  });
});

describe("label", () => {
  it.each([
    [{ cantidad: 10000, mostrar: 2500 }, "10k/2.5k"],
    [{ cantidad: 50000, mostrar: 0 }, "50k"],
    [{ cantidad: 100, mostrar: 25 }, "100/25"],
    [{ cantidad: 999, mostrar: 0 }, "999"],
    [{ cantidad: 1000, mostrar: 1 }, "1k/1"],
    [{ cantidad: 1500000, mostrar: 250000 }, "1.5m/250k"],
    [{ cantidad: 100000000, mostrar: 0 }, "100m"],
    [{ cantidad: 1234, mostrar: 0 }, "1.234k"],
  ])("%o → %s", (preset, expected) => {
    expect(label(preset)).toBe(expected);
  });
});
