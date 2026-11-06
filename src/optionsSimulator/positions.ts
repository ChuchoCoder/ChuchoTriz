import { MarketReader, type Contract, type Quote } from "./market";
import { formatOptionInput } from "./format";
import { localDate, MAX_CONTRACTS, MAX_LEGS, numeric, type Leg, type Simulation } from "./model";
import { positionStorageKey, positionStorageSalt, premiumNeedsReview, readPositionAccounting, signedPositionQuantity, type PositionAccounting } from "./positionStorage";

export interface PositionSnapshot {
  contextId: string;
  storageScope: string;
  capturedAt: number;
  reportedAt: number;
  positions: { securityId: string; quantity: number }[];
}

export async function readPositionSnapshot(contracts: Contract[], signal: AbortSignal): Promise<{ snapshot: PositionSnapshot; saved?: PositionAccounting }> {
  const first = contracts[0];
  if (!first || signal.aborted) throw Error("Seleccioná una cadena de opciones para cargar la posición.");
  const reader = new MarketReader("options-position-reader.js");
  const cancel = () => reader.dispose();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const storageSalt = await positionStorageSalt();
    if (signal.aborted) throw Error("Lectura de posición cancelada.");
    const snapshot = await reader.call<PositionSnapshot>("positions", { ids: contracts.map(contract => contract.id),
      underlyingId: first.underlyingId, expiration: first.expiration, currency: first.currency, settlement: first.settlement, storageSalt });
    const saved = await readPositionAccounting(positionStorageKey(snapshot.storageScope, first));
    if (signal.aborted) throw Error("Lectura de posición cancelada.");
    // The account may have changed while waiting for local storage.
    if (await reader.call<boolean>("verifyPositionContext", { contextId: snapshot.contextId }) !== true)
      throw Error("No se pudo verificar la cuenta activa. Volvé a cargar la posición.");
    return { snapshot, saved };
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.dispose();
  }
}

/** Builds a local draft without treating a current quote as historical cost. */
export function importPosition(snapshot: PositionSnapshot, contracts: Contract[], quotes: Record<string, Quote> | undefined,
  input: Simulation, underlying: string, spot: number | undefined, saved?: PositionAccounting): Simulation {
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
  const storageKey = positionStorageKey(snapshot.storageScope, first);
  const sameAccounting = input.position?.storage?.key === storageKey;
  const storage = sameAccounting ? input.position!.storage : { key: storageKey, revision: saved?.revision };
  const sameContext = input.position?.contextId === snapshot.contextId && input.underlying === underlying && input.currency === first.currency &&
    input.expiry === expiry && numeric(input.multiplier) === factor && sameAccounting;
  const accounting = sameAccounting ? { legs: input.position!.legs, costs: input.costs, realized: input.realized } : saved;
  const seen = new Set<string>();
  const legs = snapshot.positions.map((position, index): Leg => {
    const matches = contracts.filter(contract => contract.id === position.securityId);
    if (matches.length !== 1 || matches[0].factor !== factor || seen.has(position.securityId) ||
      !Number.isSafeInteger(position.quantity) || position.quantity === 0 || Math.abs(position.quantity) > MAX_CONTRACTS)
      throw Error("Hay cantidades, contratos o factores de posición que requieren revisión.");
    seen.add(position.securityId);
    const contract = matches[0], side = position.quantity > 0 ? "buy" : "sell";
    const previous = accounting?.legs.find(leg => leg.securityId === contract.id &&
      numeric(leg.strike) === contract.strike && leg.kind === contract.kind);
    const iv = quotes?.[contract.id]?.impliedVolatility;
    return { id: -(index + 1), securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side,
      strike: formatOptionInput(contract.strike), contracts: String(Math.abs(position.quantity)),
      premium: previous?.side === side ? previous.premium : "",
      premiumQuantity: previous ? previous.premiumQuantity ?? signedPositionQuantity(previous) : String(position.quantity),
      premiumReviewPending: !!previous && (premiumNeedsReview(previous) || numeric(signedPositionQuantity(previous)) !== position.quantity),
      volatility: previous?.volatility ?? (iv !== undefined && Number.isFinite(iv) && iv >= 0 && iv <= 500 ? formatOptionInput(iv) : "") };
  });
  const today = localDate();
  return { ...input, underlying, currency: first.currency, expiry, multiplier: formatOptionInput(factor),
    spot: sameContext ? input.spot : spot !== undefined && spot > 0 ? formatOptionInput(spot) : "",
    marketSpotMissing: sameContext ? input.marketSpotMissing : !(spot !== undefined && spot > 0),
    valuationDate: sameContext ? input.valuationDate : today, scenarioDate: sameContext ? input.scenarioDate : today,
    costs: accounting?.costs ?? "0", realized: accounting?.realized ?? "",
    legs: sameContext ? input.legs : [], position: { legs, storage, contextId: snapshot.contextId, capturedAt: snapshot.capturedAt, reportedAt: snapshot.reportedAt } };
}
