import { IInstrumentPreset, IInstrumentPresets } from "./InstrumentPresets";

// Presets configurados por Ticker, en el orden en que el trader los escribió en Opciones
export type PresetBook = IInstrumentPresets;

export interface ParseError {
  // Número de línea del texto de Opciones, empezando en 1
  line: number;
  message: string;
}

export const defaultBook: PresetBook = {
  "AAPL": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "AE38": [
    { cantidad: 100000, mostrar: 0 },
    { cantidad: 50000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
  ],
  "AL": [
    { cantidad: 500000, mostrar: 0 },
    { cantidad: 500000, mostrar: "R6" },
    { cantidad: 300000, mostrar: 0 },
    { cantidad: 200000, mostrar: 0 },
    { cantidad: 100000, mostrar: 0 },
    { cantidad: 75000, mostrar: 0 },
    { cantidad: 50000, mostrar: 0 },
    { cantidad: 25000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
  ],
  "AMD": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "AMZN": [
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "AO2": [
    { cantidad: 300000, mostrar: 100000 },
    { cantidad: 100000, mostrar: 50000 },
    { cantidad: 100000, mostrar: 0 },
    { cantidad: 50000, mostrar: 0 },
    { cantidad: 25000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
  ],
  "BABA": [
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 1000, mostrar: 100 },
    { cantidad: 500, mostrar: 50 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "BBD": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "BOLT": [
    { cantidad: 400000, mostrar: 50000 },
    { cantidad: 200000, mostrar: 50000 },
    { cantidad: 100000, mostrar: 20000 },
    { cantidad: 50000, mostrar: 1000 },
  ],
  "DLR": [
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
    { cantidad: 30, mostrar: 0 },
    { cantidad: 20, mostrar: 0 },
    { cantidad: 10, mostrar: 0 },
    { cantidad: 5, mostrar: 0 },
  ],
  "DOLAR": [
    { cantidad: 300000, mostrar: 0 },
    { cantidad: 200000, mostrar: 0 },
    { cantidad: 100000, mostrar: 0 },
    { cantidad: 50000, mostrar: 0 },
    { cantidad: 25000, mostrar: 0 },
    { cantidad: 15000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
  ],
  "EWZ": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "GD": [
    { cantidad: 300000, mostrar: "R3" },
    { cantidad: 200000, mostrar: "R4" },
    { cantidad: 100000, mostrar: "R2" },
    { cantidad: 100000, mostrar: 0 },
    { cantidad: 50000, mostrar: 0 },
    { cantidad: 25000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
  ],
  "GDX": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "GFG": [
    { cantidad: 300, mostrar: "R10" },
    { cantidad: 200, mostrar: "R5" },
    { cantidad: 200, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 100, mostrar: 20 },
    { cantidad: 50, mostrar: 15 },
    { cantidad: 50, mostrar: 0 },
    { cantidad: 25, mostrar: 0 },
    { cantidad: 10, mostrar: 0 },
    { cantidad: 5, mostrar: 0 },
  ],
  "GGAL": [
    { cantidad: 20000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 10000, mostrar: 5000 },
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
  ],
  "GGAL/": [
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
    { cantidad: 20, mostrar: 0 },
    { cantidad: 10, mostrar: 0 },
    { cantidad: 5, mostrar: 0 },
  ],
  "INTC": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "JD": [
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "OXY": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "PAMP": [
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
  ],
  "PESOS": [
    { cantidad: 200000000, mostrar: 0 },
    { cantidad: 150000000, mostrar: 0 },
    { cantidad: 100000000, mostrar: 0 },
    { cantidad: 50000000, mostrar: 0 },
    { cantidad: 20000000, mostrar: 0 },
    { cantidad: 10000000, mostrar: 0 },
    { cantidad: 5000000, mostrar: 0 },
    { cantidad: 2000000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
    { cantidad: 500000, mostrar: 0 },
    { cantidad: 300000, mostrar: 0 },
    { cantidad: 100000, mostrar: 0 },
  ],
  "PFE": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "QCOM": [
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "QQQ": [
    { cantidad: 1000, mostrar: "R5" },
    { cantidad: 500, mostrar: "R5" },
    { cantidad: 100, mostrar: "R5" },
    { cantidad: 100, mostrar: 0 },
  ],
  "S": [
    { cantidad: 100000000, mostrar: 5000000 },
    { cantidad: 50000000, mostrar: 5000000 },
    { cantidad: 3000000, mostrar: 500000 },
    { cantidad: 2500000, mostrar: 0 },
    { cantidad: 1250000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
    { cantidad: 500000, mostrar: 0 },
  ],
  "SONY": [
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "SPY": [
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
  ],
  "T": [
    { cantidad: 100000000, mostrar: 5000000 },
    { cantidad: 50000000, mostrar: 5000000 },
    { cantidad: 3000000, mostrar: 500000 },
    { cantidad: 2500000, mostrar: 0 },
    { cantidad: 1250000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
    { cantidad: 500000, mostrar: 0 },
  ],
  "T3": [
    { cantidad: 150000000, mostrar: 0 },
    { cantidad: 100000000, mostrar: 0 },
    { cantidad: 50000000, mostrar: 0 },
    { cantidad: 25000000, mostrar: 0 },
    { cantidad: 10000000, mostrar: 0 },
    { cantidad: 5000000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
  ],
  "TSLA": [
    { cantidad: 2000, mostrar: 0 },
    { cantidad: 1000, mostrar: 0 },
    { cantidad: 500, mostrar: 0 },
    { cantidad: 100, mostrar: 0 },
    { cantidad: 50, mostrar: 0 },
  ],
  "TZV": [
    { cantidad: 100000, mostrar: 15000 },
    { cantidad: 50000, mostrar: 15000 },
    { cantidad: 25000, mostrar: 0 },
    { cantidad: 10000, mostrar: 0 },
    { cantidad: 5000, mostrar: 0 },
  ],
  "TZX": [
    { cantidad: 300000000, mostrar: 10000000 },
    { cantidad: 100000000, mostrar: 10000000 },
    { cantidad: 50000000, mostrar: 1000000 },
    { cantidad: 2500000, mostrar: 0 },
    { cantidad: 1250000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
    { cantidad: 500000, mostrar: 0 },
  ],
  "X": [
    { cantidad: 100000000, mostrar: 5000000 },
    { cantidad: 50000000, mostrar: 5000000 },
    { cantidad: 3000000, mostrar: 500000 },
    { cantidad: 2500000, mostrar: 0 },
    { cantidad: 1250000, mostrar: 0 },
    { cantidad: 1000000, mostrar: 0 },
    { cantidad: 500000, mostrar: 0 },
  ],
};

// Presets para un Ticker que no coincide con ninguno del Preset book
export const fallbackPresets: IInstrumentPreset[] = [
  { cantidad: 10000, mostrar: 2500 },
  { cantidad: 5000, mostrar: 2500 },
  { cantidad: 1000, mostrar: 250 },
  { cantidad: 100, mostrar: 25 },
];

const PresetPattern = /^(\d+)(?:\/(\d+|R\d+))?$/i;

// Gramática de Opciones, una línea por Ticker: "Ticker Cantidad/CantidadAMostrar Cantidad ..."
// Las líneas con errores quedan fuera del Preset book
export function parse(text: string): { book: PresetBook; errors: ParseError[] } {
  const book: PresetBook = {};
  const errors: ParseError[] = [];
  const tickerLines = new Map<string, number>();

  text.split(/\r?\n/).forEach((lineText, index) => {
    const line = index + 1;
    const trimmed = lineText.trim();
    if (trimmed === "") {
      return;
    }

    const [word, ...values] = trimmed.split(/\s+/);
    // Matriz busca el Ticker en mayúsculas
    const ticker = word.toUpperCase();
    if (/^[\d/]/.test(ticker)) {
      errors.push({ line, message: `Falta el Ticker al principio de la línea, antes de "${word}"` });
      return;
    }

    const presets: IInstrumentPreset[] = [];
    const lineErrors: string[] = [];
    for (const value of values) {
      const match = PresetPattern.exec(value);
      if (!match) {
        lineErrors.push(`"${value}" no es un Preset; usar Cantidad, Cantidad/Cantidad_A_Mostrar o Cantidad/Rn con divisor entero desde 2`);
        continue;
      }
      const cantidad = Number.parseInt(match[1]);
      const display = match[2]?.toUpperCase();
      const mostrar = display?.startsWith("R") ? `R${Number(display.slice(1))}` as const : Number(display ?? 0);
      const divisor = typeof mostrar === "string" ? Number(mostrar.slice(1)) : null;
      if (cantidad === 0) {
        lineErrors.push(`"${value}": la Cantidad debe ser mayor a cero`);
      }
      else if (!Number.isSafeInteger(cantidad)) {
        lineErrors.push(`"${value}": la Cantidad es demasiado grande`);
      }
      else if (divisor !== null && (!Number.isSafeInteger(divisor) || divisor < 2)) {
        lineErrors.push(`"${value}": usá R seguido de un divisor entero desde 2, por ejemplo R5`);
      }
      else if (typeof mostrar === "number" && mostrar > cantidad) {
        lineErrors.push(`"${value}": la Cantidad a mostrar no puede ser mayor que la Cantidad`);
      }
      else {
        presets.push({ cantidad, mostrar });
      }
    }

    if (lineErrors.length === 0 && presets.length === 0) {
      lineErrors.push(`Falta al menos un Preset para ${ticker}`);
    }
    const previousLine = tickerLines.get(ticker);
    if (previousLine !== undefined) {
      lineErrors.push(`${ticker} ya está configurado en la línea ${previousLine}`);
    }
    else {
      tickerLines.set(ticker, line);
    }

    if (lineErrors.length > 0) {
      errors.push(...lineErrors.map((message) => ({ line, message })));
      return;
    }
    book[ticker] = presets;
  });

  return { book, errors };
}

export function format(book: PresetBook): string {
  let text = "";
  for (const ticker in book) {
    text += ticker;
    for (const preset of book[ticker]) {
      text += " " + preset.cantidad;
      if (typeof preset.mostrar === "string" || preset.mostrar > 0) {
        text += "/" + preset.mostrar;
      }
    }
    text += "\n";
  }
  return text;
}

// Coincidencia exacta; si no, el Ticker más largo del Preset book que es comienzo del buscado
// (AL para AL30); si no, el primero del Preset book que empieza con el buscado (AL30D para AL30).
// Si ninguno coincide, fallbackPresets.
export function presetsFor(book: PresetBook, ticker: string): IInstrumentPreset[] {
  if (book[ticker]) {
    return book[ticker];
  }

  let prefixMatch: string | null = null;
  let partialMatch: string | null = null;
  for (const key in book) {
    if (ticker.startsWith(key)) {
      if (prefixMatch === null || key.length > prefixMatch.length) {
        prefixMatch = key;
      }
    }
    else if (partialMatch === null && ticker !== "" && key.startsWith(ticker)) {
      partialMatch = key;
    }
  }

  const match = prefixMatch ?? partialMatch;
  return match === null ? fallbackPresets : book[match];
}

// Texto del botón de un Preset, por ejemplo "10k/2.5k"
export function label(preset: IInstrumentPreset): string {
  const display = typeof preset.mostrar === "string" ? preset.mostrar : preset.mostrar > 0 ? quantityText(preset.mostrar) : "";
  return quantityText(preset.cantidad) + (display ? "/" + display : "");
}

function quantityText(quantity: number): string {
  if (quantity >= 1000000) {
    return `${quantity / 1000000}m`;
  }
  if (quantity >= 1000) {
    return `${quantity / 1000}k`;
  }
  return quantity.toString();
}
