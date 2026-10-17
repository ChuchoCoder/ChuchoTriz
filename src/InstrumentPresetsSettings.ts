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
  const text = tickers.map(ticker => ticker + " " + draft[ticker]
    .map(preset => `${preset.cantidad}/${preset.mostrar}`).join(" ")).join("\n");
  const result = parse(text);
  if (result.errors.length > 0) {
    const error = result.errors[0];
    throw new PresetValidationError(tickers[error.line - 1], error.message);
  }
  return result.book;
}
