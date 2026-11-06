import { MarketReader, type Contract, type Quote } from "./market";
import { formatOptionInput } from "./format";
import { localDate, MAX_CONTRACTS, MAX_LEGS, numeric, type Leg, type Simulation } from "./model";
import { positionStorageKey, positionStorageSalt, premiumNeedsReview, readPositionAccounting, readUnderlyingCost, reconcileUnderlyingCost,
  signedPositionQuantity, underlyingCostStorageKey, type PositionAccounting, type UnderlyingCost } from "./positionStorage";

export interface PositionSnapshot {
  contextId: string;
  storageScope: string;
  capturedAt: number;
  reportedAt: number;
  positions: { securityId: string; quantity: number }[];
  underlyingQuantity?: number;
  underlyingUnavailable?: true;
}

export async function readPositionSnapshot(contracts: Contract[], signal: AbortSignal): Promise<{
  snapshot: PositionSnapshot; saved?: PositionAccounting; savedUnderlying?: UnderlyingCost; costStorageUnavailable?: boolean;
}> {
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
    const verify = async () => {
      if (signal.aborted || await reader.call<boolean>("verifyPositionContext", { contextId: snapshot.contextId }) !== true || signal.aborted)
        throw Error("No se pudo verificar la cuenta activa. Volvé a cargar la posición.");
    };
    const quantity = snapshot.underlyingQuantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || Math.abs(quantity) > MAX_CONTRACTS) {
      await verify();
      return { snapshot, saved };
    }
    const costKey = underlyingCostStorageKey(snapshot.storageScope, first);
    let savedUnderlying, costStorageUnavailable = false;
    try { savedUnderlying = await readUnderlyingCost(costKey); }
    catch { costStorageUnavailable = true; }
    await verify();
    if (savedUnderlying && savedUnderlying.quantity !== quantity) {
      try { savedUnderlying = await reconcileUnderlyingCost(costKey, quantity, savedUnderlying); }
      catch { savedUnderlying = undefined; costStorageUnavailable = true; }
      await verify();
    }
    return { snapshot, saved, savedUnderlying, costStorageUnavailable };
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.dispose();
  }
}

function positionChain(contracts: Contract[]) {
  const first = contracts[0], factor = first?.factor;
  if (!first || !factor || !Number.isFinite(factor) || factor <= 0 || factor > 100000 ||
    contracts.some(contract => contract.underlyingId !== first.underlyingId || contract.expiration !== first.expiration ||
      contract.currency !== first.currency || contract.strikeCurrency !== first.currency || contract.settlement !== first.settlement))
    throw Error("La posición requiere contratos del mismo subyacente, vencimiento, moneda y plazo.");
  return { first, factor, expiry: first.expiration.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") };
}

export function startPositionDraft(input: Simulation, contracts: Contract[], underlying: string, spot: number | undefined): Simulation {
  const { first, factor, expiry } = positionChain(contracts);
  const sameChain = input.underlying === underlying && input.currency === first.currency && input.expiry === expiry && numeric(input.multiplier) === factor;
  if (input.legs.length && !sameChain) throw Error("Limpiá los ajustes antes de cargar una posición de otra cadena.");
  const today = localDate();
  const hasSpot = spot !== undefined && spot > 0;
  return { ...input, underlying, currency: first.currency, expiry, multiplier: formatOptionInput(factor),
    spot: sameChain ? input.spot : hasSpot ? formatOptionInput(spot) : "",
    marketSpotMissing: sameChain ? input.marketSpotMissing : !hasSpot,
    valuationDate: sameChain ? input.valuationDate : today, scenarioDate: sameChain ? input.scenarioDate : today,
    adjustmentCosts: sameChain ? input.costs : "0", costs: "0", realized: undefined, position: { legs: [] } };
}

export type PositionSeries = Pick<Contract, "id" | "kind" | "strike" | "symbol">;

export function setPositionQuantity(legs: Leg[], series: PositionSeries, signedQuantity: number, quote?: Quote): Leg[] {
  if (!Number.isSafeInteger(signedQuantity) || Math.abs(signedQuantity) > MAX_CONTRACTS) return legs;
  const previous = legs.find(leg => leg.securityId === series.id);
  if (signedQuantity === 0) return previous ? legs.filter(leg => leg !== previous) : legs;
  if (previous && numeric(signedPositionQuantity(previous)) === signedQuantity) return legs;
  if (!previous && legs.length >= MAX_LEGS) return legs;
  const side = signedQuantity > 0 ? "buy" : "sell";
  const iv = quote?.impliedVolatility;
  const leg: Leg = { id: previous?.id ?? Math.min(0, ...legs.map(item => item.id)) - 1,
    securityId: series.id, symbol: series.symbol, kind: series.kind, strike: formatOptionInput(series.strike),
    side, contracts: String(Math.abs(signedQuantity)), premium: previous?.side === side ? previous.premium : "",
    volatility: previous?.volatility ?? (iv !== undefined && Number.isFinite(iv) && iv >= 0 && iv <= 500 ? formatOptionInput(iv) : ""),
    premiumQuantity: previous?.premiumQuantity ?? (previous ? signedPositionQuantity(previous) : String(signedQuantity)),
    premiumReviewPending: !!previous };
  return previous ? legs.map(item => item === previous ? leg : item) : [...legs, leg];
}

/** Builds a local draft without treating a current quote as historical cost. */
export function importPosition(snapshot: PositionSnapshot, contracts: Contract[], quotes: Record<string, Quote> | undefined,
  input: Simulation, underlying: string, spot: number | undefined, saved?: PositionAccounting, savedUnderlying?: UnderlyingCost,
  costStorageUnavailable = false): Simulation {
  if (!snapshot || typeof snapshot.contextId !== "string" || !/^[A-Za-z0-9-]{1,80}$/.test(snapshot.contextId) ||
    !Number.isFinite(snapshot.capturedAt) || !Number.isFinite(snapshot.reportedAt) ||
    snapshot.reportedAt <= 0 || snapshot.reportedAt > 8.64e15 || snapshot.capturedAt <= 0 || snapshot.capturedAt > Date.now() + 300000 ||
    !Array.isArray(snapshot.positions) || snapshot.positions.length > MAX_LEGS ||
    (snapshot.underlyingQuantity !== undefined && (!Number.isSafeInteger(snapshot.underlyingQuantity) || Math.abs(snapshot.underlyingQuantity) > MAX_CONTRACTS)) ||
    (snapshot.underlyingUnavailable !== undefined && (snapshot.underlyingUnavailable !== true || snapshot.underlyingQuantity !== undefined)))
    throw Error("El reporte de posición es inválido o supera las 16 patas admitidas.");
  const { first, factor, expiry } = positionChain(contracts);
  const storageKey = positionStorageKey(snapshot.storageScope, first);
  const sameAccounting = input.position?.storage?.key === storageKey;
  const useDraftAccounting = sameAccounting && !!(input.position?.legs.length || input.position?.underlying?.quantity);
  const storage = useDraftAccounting ? input.position!.storage : { key: storageKey, revision: saved?.revision };
  const sameChain = input.underlying === underlying && input.currency === first.currency && input.expiry === expiry && numeric(input.multiplier) === factor;
  const sameContext = sameChain && (!input.position?.contextId || input.position.contextId === snapshot.contextId && sameAccounting);
  const accounting = useDraftAccounting ? { legs: input.position!.legs, costs: input.costs, realized: input.realized } : saved;
  const quantity = snapshot.underlyingQuantity;
  const costKey = underlyingCostStorageKey(snapshot.storageScope, first);
  const previousHolding = input.position?.underlying;
  const sameHolding = quantity !== undefined && quantity !== 0 && previousHolding?.quantity === quantity &&
    (previousHolding.storage?.key === costKey || (sameAccounting && costStorageUnavailable && previousHolding.costStorageUnavailable));
  const holding = quantity === undefined ? undefined
    : sameHolding && !costStorageUnavailable ? previousHolding
    : { quantity, averageCost: sameHolding ? previousHolding.averageCost : savedUnderlying?.quantity === quantity ? savedUnderlying.averageCost : "",
      storage: quantity && !costStorageUnavailable ? { key: costKey, revision: savedUnderlying?.revision } : undefined, costStorageUnavailable };
  const seen = new Set<string>();
  const legs = snapshot.positions.map((position, index): Leg => {
    const matches = contracts.filter(contract => contract.id === position.securityId);
    if (matches.length !== 1 || matches[0].factor !== factor || seen.has(position.securityId) ||
      !Number.isSafeInteger(position.quantity) || position.quantity === 0 || Math.abs(position.quantity) > MAX_CONTRACTS)
      throw Error("Hay cantidades, contratos o factores de posición que requieren revisión.");
    seen.add(position.securityId);
    const contract = matches[0], side = position.quantity > 0 ? "buy" : "sell";
    const matchesSeries = (leg: Leg) => leg.securityId === contract.id && numeric(leg.strike) === contract.strike && leg.kind === contract.kind;
    const edited = accounting?.legs.find(matchesSeries), stored = saved?.legs.find(matchesSeries);
    const previous = stored?.premiumReviewPending && edited?.premium === "" && edited.side === stored.side
      ? stored : edited ?? stored;
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
    adjustmentCosts: sameContext ? input.position ? input.adjustmentCosts : input.costs : "0",
    legs: sameContext ? input.legs : [], position: { legs, underlying: holding, underlyingUnavailable: snapshot.underlyingUnavailable,
      storage, contextId: snapshot.contextId, capturedAt: snapshot.capturedAt, reportedAt: snapshot.reportedAt } };
}
