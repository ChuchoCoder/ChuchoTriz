import { OptionQuoteValue } from "../optionsSimulator/OptionQuoteValue";
import { numberLabel } from "./model";
import type { TradingDepthLevel, TradingQuote } from "./trading";

/** Displays native depth; clicking a price changes only the local entry draft. */
export default function RatioOrderBook({ leg, quote, selectedPrice, selectedSide, disabled, onChoose }: {
  leg: "A" | "B"; quote?: TradingQuote; selectedPrice: number; selectedSide?: "bid" | "ask";
  disabled: boolean; onChoose(side: "bid" | "ask", level: TradingDepthLevel): void;
}) {
  const depth = quote?.issue ? [] : quote?.depth ?? [{ bid: quote?.bid, ask: quote?.ask }];
  const selectedIndex = selectedSide ? depth.findIndex(row => row[selectedSide]?.price === selectedPrice) : -1;
  return <table className="ro-book-table" aria-label={`Book de ${leg}`}>
    <thead><tr><th scope="col" className="ro-book-buy-heading" title="Volumen de compra">Vol. C</th><th scope="col" className="ro-book-buy-heading">Compra</th><th scope="col" className="ro-book-sell-heading">Venta</th><th scope="col" className="ro-book-sell-heading" title="Volumen de venta">Vol. V</th></tr></thead>
    <tbody>{Array.from({ length: 5 }, (_, i) => {
      const bid = depth[i]?.bid, ask = depth[i]?.ask;
      const price = (side: "bid" | "ask", level?: TradingDepthLevel) => <button type="button" className={`ro-book-price ${side}`}
        aria-label={`Usar ${side === "bid" ? "Compra" : "Venta"} nivel ${i + 1} de ${leg}`} title={level ? `Precio ${numberLabel(level.price)} · volumen ${numberLabel(level.size)}` : "Sin nivel publicado"}
        disabled={disabled || !level} aria-pressed={!!level && selectedSide === side && selectedIndex === i}
        onClick={event => { event.stopPropagation(); if (level) onChoose(side, level); }}>
        <OptionQuoteValue value={level?.price} formatValue={numberLabel} />
      </button>;
      return <tr key={i}><td className="ro-book-bid-size">{numberLabel(bid?.size)}</td><td className="ro-book-bid">{price("bid", bid)}</td><td className="ro-book-ask">{price("ask", ask)}</td><td className="ro-book-ask-size">{numberLabel(ask?.size)}</td></tr>;
    })}</tbody>
  </table>;
}
