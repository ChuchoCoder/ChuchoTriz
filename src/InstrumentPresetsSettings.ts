import { IInstrumentPresets } from "./InstrumentPresets";
import { parse } from "./PresetBook";

export interface DraftPreset { cantidad: string; mostrar: string; }
export type DraftPresets = Record<string, DraftPreset[]>;

export function toDraft(presets: IInstrumentPresets): DraftPresets {
  return Object.fromEntries(Object.entries(presets).map(([ticker, values]) => [ticker,
    values.map(({ cantidad, mostrar }) => ({ cantidad: String(cantidad), mostrar: String(mostrar) })),
  ]));
}

export class PresetValidationError extends Error {
  constructor(public ticker: string, message: string) {
    super(`${ticker}: ${message}`);
  }
}

export function serializePresets(draft: DraftPresets): IInstrumentPresets {
  // Storage order breaks ties in prefix matching. Sort only the visible list.
  const tickers = Object.keys(draft);
  for (const ticker of tickers) {
    for (const preset of draft[ticker]) {
      if (!/^\d+$/.test(preset.cantidad) || !/^(?:\d+|R\d+)$/i.test(preset.mostrar)) {
        throw new PresetValidationError(ticker,
          "Cantidad debe ser un entero positivo. A mostrar debe ser un entero o R seguido de un divisor entero desde 2.");
      }
    }
  }
  const text = tickers.map(ticker => ticker + " " + draft[ticker]
    .map(preset => `${preset.cantidad}/${preset.mostrar}`).join(" ")).join("\n");
  const result = parse(text);
  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new PresetValidationError(tickers[error.line - 1], error.message);
  }
  return result.book;
}
