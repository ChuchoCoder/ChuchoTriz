import { MarketReader, type Contract, type Quote } from "./market";
import { formatOptionInput } from "./format";
import { localDate, MAX_CONTRACTS, MAX_LEGS, numeric, type Leg, type Simulation } from "./model";

export interface PositionSnapshot {
  contextId: string;
  capturedAt: number;
  reportedAt: number;
  positions: { securityId: string; quantity: number }[];
}

export async function readPositionSnapshot(contracts: Contract[], signal: AbortSignal): Promise<PositionSnapshot> {
  const first = contracts[0];
  if (!first || signal.aborted) throw Error("Seleccioná una cadena de opciones para cargar la posición.");
  const reader = new MarketReader("options-position-reader.js");
  const cancel = () => reader.dispose();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await reader.call<PositionSnapshot>("positions", { ids: contracts.map(contract => contract.id),
      underlyingId: first.underlyingId, expiration: first.expiration, currency: first.currency, settlement: first.settlement });
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.dispose();
  }
}

/** Builds a local draft without treating a current quote as historical cost. */
export function importPosition(snapshot: PositionSnapshot, contracts: Contract[], quotes: Record<string, Quote> | undefined,
  input: Simulation, underlying: string, spot: number | undefined): Simulation {
  if (!snapshot || typeof snapshot.contextId !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(snapshot.contextId) ||
    !Number.isFinite(snapshot.capturedAt) || !Number.isFinite(snapshot.reportedAt) ||
    snapshot.reportedAt <= 0 || snapshot.capturedAt < snapshot.reportedAt - 300000 || snapshot.capturedAt > Date.now() + 300000 ||
    !Array.isArray(snapshot.positions) || snapshot.positions.length > MAX_LEGS)
    throw Error("El reporte de posición es inválido o supera las 16 patas admitidas.");
  if (!snapshot.positions.length) throw Error("No hay posición abierta en la cadena seleccionada.");
  const first = contracts[0], factor = first?.factor;
  if (!first || !factor || !Number.isFinite(factor) || factor <= 0 || factor > 100000 ||
    contracts.some(contract => contract.underlyingId !== first.underlyingId || contract.expiration !== first.expiration ||
      contract.currency !== first.currency || contract.strikeCurrency !== first.currency || contract.settlement !== first.settlement))
    throw Error("La posición requiere contratos del mismo subyacente, vencimiento, moneda y plazo.");
  const expiry = first.expiration.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const sameContext = input.position?.contextId === snapshot.contextId && input.underlying === underlying && input.currency === first.currency &&
    input.expiry === expiry && numeric(input.multiplier) === factor;
  const seen = new Set<string>();
  const legs = snapshot.positions.map((position, index): Leg => {
    const matches = contracts.filter(contract => contract.id === position.securityId);
    if (matches.length !== 1 || matches[0].factor !== factor || seen.has(position.securityId) ||
      !Number.isSafeInteger(position.quantity) || position.quantity === 0 || Math.abs(position.quantity) > MAX_CONTRACTS)
      throw Error("Hay cantidades, contratos o factores de posición que requieren revisión.");
    seen.add(position.securityId);
    const contract = matches[0], side = position.quantity > 0 ? "buy" : "sell";
    const previous = sameContext ? input.position?.legs.find(leg => leg.securityId === contract.id && leg.side === side &&
      numeric(leg.contracts) === Math.abs(position.quantity) && numeric(leg.strike) === contract.strike && leg.kind === contract.kind) : undefined;
    const iv = quotes?.[contract.id]?.impliedVolatility;
    return { id: -(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side,
      strike: formatOptionInput(contract.strike), contracts: String(Math.abs(position.quantity)), premium: previous?.premium ?? "",
      volatility: previous?.volatility ?? (iv !== undefined && Number.isFinite(iv) && iv >= 0 ? formatOptionInput(iv) : "") };
  });
  const today = localDate();
  return { ...input, underlying, currency: first.currency, expiry, multiplier: formatOptionInput(factor),
    spot: sameContext ? input.spot : spot !== undefined && spot > 0 ? formatOptionInput(spot) : "",
    marketSpotMissing: sameContext ? input.marketSpotMissing : !(spot !== undefined && spot > 0),
    valuationDate: sameContext ? input.valuationDate : today, scenarioDate: sameContext ? input.scenarioDate : today,
    costs: sameContext ? input.costs : "0", realized: sameContext ? input.realized : "",
    legs: sameContext ? input.legs : [], position: { legs, contextId: snapshot.contextId, capturedAt: snapshot.capturedAt, reportedAt: snapshot.reportedAt } };
}
