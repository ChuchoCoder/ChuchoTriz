export interface CaucionTrade {
  currency: string;
  days: number;
  tna: number;
  tradedAt: number;
}

export interface CaucionReference extends CaucionTrade {
  annualRate: number;
}

const maxAge = 60 * 60_000;
const sessionDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const tradeTime = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium", hour12: false,
});

export function isRecentCaucionTrade(tradedAt: number, now: number): boolean {
  return Number.isFinite(tradedAt) && tradedAt <= now && now - tradedAt <= maxAge &&
    sessionDay.format(tradedAt) === sessionDay.format(now);
}

/** Uses the closest eligible term to seven days and the newest print within that term. */
export function selectCaucionReference(trades: readonly CaucionTrade[], now: number): CaucionReference | undefined {
  let best: CaucionReference | undefined;
  for (const trade of trades) {
    if (trade?.currency !== "ARS" || !Number.isInteger(trade.days) || trade.days < 3 || trade.days > 7 ||
      !Number.isFinite(trade.tna) || trade.tna <= 0 || !isRecentCaucionTrade(trade.tradedAt, now)) continue;
    const years = trade.days / 365;
    const annualRate = Math.log1p(trade.tna / 100 * years) / years;
    if (annualRate > 10 || (best && (best.days > trade.days ||
      (best.days === trade.days && best.tradedAt >= trade.tradedAt)))) continue;
    best = { ...trade, annualRate };
  }
  return best;
}

export function caucionReferenceLabel(reference: CaucionReference): string {
  const tna = reference.tna.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  return `Caución ARS ${reference.days} días · TNA ${tna} % · ${tradeTime.format(reference.tradedAt)} ART`;
}
