import type { Contract, Quote } from "./market";
import { formatOptionInput } from "./format";
import { MAX_CONTRACTS, numeric, type Leg, type Simulation } from "./model";
import { recipePrices } from "./strategyTemplates";

export type Adjustment = { ok: true; legs: Leg[] } | { ok: false; reason: string };
export interface StrikeMarket {
  underlying: string; expiry: string; currency: string; contracts: Contract[]; quotes: Record<string, Quote>;
}
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function nativeContext(input: Simulation, market?: StrikeMarket): { ok: true; market: StrikeMarket; contracts: Contract[] } | { ok: false; reason: string } {
  if (!market || input.underlying !== market.underlying || input.expiry !== market.expiry || input.currency !== market.currency)
    return fail("Esperando la cadena del mismo subyacente, vencimiento y moneda.");
  const first = market.contracts[0];
  if (!first || market.contracts.some(contract => contract.underlyingId !== first.underlyingId || contract.settlement !== first.settlement ||
    contract.expiration.replaceAll("-", "") !== input.expiry.replaceAll("-", "") || contract.currency !== input.currency))
    return fail("La cadena contiene mercados incompatibles.");
  const contracts: Contract[] = [];
  for (const leg of input.legs) {
    const current = market.contracts.filter(contract => contract.id === leg.securityId);
    if (current.length !== 1 || current[0].kind !== leg.kind || current[0].strike !== numeric(leg.strike) || current[0].factor !== numeric(input.multiplier) || !["buy", "sell"].includes(leg.side))
      return fail("Las patas deben coincidir con los contratos y el factor de la cadena.");
    contracts.push(current[0]);
  }
  return { ok: true, market, contracts };
}

/** One unit of the existing integer ratio, with no global quantity multiplier. */
export function adjustStrategyQuantity(legs: Leg[], direction: -1 | 1): Adjustment {
  if (!legs.length) return fail("Agregá patas a la estrategia.");
  const quantities = legs.map(leg => numeric(leg.contracts));
  if (quantities.some(quantity => !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CONTRACTS))
    return fail("Completá cantidades enteras válidas en todas las patas.");
  const gcd = (a: number, b: number): number => { while (b) [a, b] = [b, a % b]; return a; };
  const units = quantities.reduce(gcd);
  if (direction < 0 && units === 1) return fail("Ya está en la cantidad mínima de su proporción.");
  const next = quantities.map(quantity => quantity + direction * (quantity / units));
  if (next.some(quantity => quantity > MAX_CONTRACTS)) return fail("La cantidad supera el máximo admitido.");
  return { ok: true, legs: legs.map((leg, index) => ({ ...leg, contracts: String(next[index]) })) };
}

/** Atomic move to adjacent listed strikes; manual-only strategies use a step of one. */
export function shiftStrategyStrikes(input: Simulation, direction: -1 | 1, market?: StrikeMarket): Adjustment {
  if (!input.legs.length) return fail("Agregá patas a la estrategia.");
  const native = input.legs.filter(leg => leg.securityId);
  if (!native.length) {
    const strikes = input.legs.map(leg => numeric(leg.strike));
    if (strikes.some(strike => !Number.isFinite(strike) || strike <= 0 || strike > 1e9 || strike + direction <= 0 || strike + direction > 1e9))
      return fail("No se pueden desplazar todos los strikes manuales un punto en ese sentido.");
    return { ok: true, legs: input.legs.map((leg, index) => ({ ...leg, strike: formatOptionInput(strikes[index] + direction) })) };
  }
  if (native.length !== input.legs.length) return fail("Para mover strikes, usá todas las patas de la cadena o todas manuales.");
  const context = nativeContext(input, market);
  if (!context.ok) return context;
  const source = context.market;
  const targets: Contract[] = [];
  for (const current of context.contracts) {
    const strikes = [...new Set(source.contracts.filter(contract => contract.kind === current.kind).map(contract => contract.strike))].sort((a, b) => a - b);
    const next = strikes[strikes.indexOf(current.strike) + direction];
    const candidates = source.contracts.filter(contract => contract.kind === current.kind && contract.strike === next);
    if (candidates.length !== 1) return fail("Falta una base contigua única para alguna pata en ese sentido.");
    if (candidates[0].factor !== numeric(input.multiplier)) return fail("El contrato de destino tiene otro factor monetario.");
    targets.push(candidates[0]);
  }
  const prices = recipePrices({ ok: true, legs: targets.map((contract, index) => ({ contract, side: input.legs[index].side, ratio: 1 })) }, source.quotes, input.currency);
  if (!prices.ok) return prices;
  return { ok: true, legs: input.legs.map((leg, index) => {
    const contract = targets[index], iv = source.quotes[contract.id].impliedVolatility;
    return { ...leg, securityId: contract.id, symbol: contract.symbol, strike: String(contract.strike), premium: String(prices.premiums[index]),
      volatility: iv !== undefined && Number.isFinite(iv) && iv >= 0 ? String(iv) : "" };
  }) };
}

export function strategyPriceReferences(input: Simulation, market?: StrikeMarket) {
  if (!input.legs.length || input.legs.some(leg => !leg.securityId)) return fail("Natural, Mid y Opuesto requieren todas las patas de la cadena. Los precios manuales se editan en Análisis, Más supuestos y rango.");
  const context = nativeContext(input, market);
  if (!context.ok) return context;
  const quantities = input.legs.map(leg => numeric(leg.contracts)), factor = numeric(input.multiplier), costs = numeric(input.costs);
  if (quantities.some(value => !Number.isSafeInteger(value) || value < 1 || value > MAX_CONTRACTS) || !Number.isFinite(factor) || factor <= 0 || factor > 100000 || !Number.isFinite(costs) || costs < 0 || costs > 1e12)
    return fail("Revisá cantidades, factor y gastos para calcular las referencias.");
  const recipe = { ok: true as const, legs: context.contracts.map((contract, index) => ({ contract, side: input.legs[index].side, ratio: 1 })) };
  const natural = recipePrices(recipe, context.market.quotes, input.currency);
  const opposite = recipePrices({ ok: true, legs: recipe.legs.map(leg => ({ ...leg, side: leg.side === "buy" ? "sell" : "buy" })) }, context.market.quotes, input.currency);
  if (!natural.ok) return natural;
  if (!opposite.ok) return opposite;
  if ([...natural.premiums, ...opposite.premiums].some(value => value > 1e9)) return fail("Las primas superan el máximo admitido.");
  const current = input.legs.map(leg => numeric(leg.premium));
  const currentValid = current.every(value => Number.isFinite(value) && value >= 0 && value <= 1e9);
  // Check gross exposure before signed summation: cancellation can hide lost precision.
  if ([natural.premiums, opposite.premiums, ...(currentValid ? [current] : [])].some(premiums => {
    let gross = costs;
    for (let index = 0; index < premiums.length; index++) {
      gross += quantities[index] * factor * premiums[index];
      if (!Number.isFinite(gross) || gross > Number.MAX_SAFE_INTEGER) return true;
    }
    return false;
  })) return fail("Reducí precios o cantidades: la exposición bruta supera la precisión admitida.");
  const total = (premiums: number[]) => premiums.reduce((sum, premium, index) => sum + (input.legs[index].side === "buy" ? 1 : -1) * quantities[index] * factor * premium, costs);
  const mid = natural.premiums.map((premium, index) => (premium + opposite.premiums[index]) / 2);
  const references = { natural: { premiums: natural.premiums, total: total(natural.premiums) }, mid: { premiums: mid, total: total(mid) },
    opposite: { premiums: opposite.premiums, total: total(opposite.premiums) } };
  if (Object.values(references).some(reference => !Number.isFinite(reference.total) || Math.abs(reference.total) > Number.MAX_SAFE_INTEGER))
    return fail("Los importes superan la precisión admitida.");
  const entry = currentValid ? total(current) : NaN;
  const currentTotal = Number.isFinite(entry) && Math.abs(entry) <= Number.MAX_SAFE_INTEGER ? entry : undefined;
  return { ok: true as const, ...references, currentTotal };
}

/** Sets every entry premium together; quote refreshes alone never change the draft. */
export function setStrategyPrice(input: Simulation, position: number, market?: StrikeMarket): Adjustment {
  if (!Number.isFinite(position) || position < 0 || position > 1) return fail("Elegí un precio entre Natural y Opuesto.");
  const references = strategyPriceReferences(input, market);
  if (!references.ok) return references;
  return { ok: true, legs: input.legs.map((leg, index) => ({ ...leg,
    premium: formatOptionInput(references.natural.premiums[index] + position * (references.opposite.premiums[index] - references.natural.premiums[index])),
  })) };
}
