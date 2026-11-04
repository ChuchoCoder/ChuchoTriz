import type { Contract, Quote } from "./market";
import { formatOptionInput } from "./format";
import { MAX_CONTRACTS, numeric, type Leg, type Simulation } from "./model";
import { recipePrices } from "./strategyTemplates";

export type Adjustment = { ok: true; legs: Leg[] } | { ok: false; reason: string };
export interface StrikeMarket {
  underlying: string; expiry: string; currency: string; contracts: Contract[]; quotes: Record<string, Quote>;
}
const fail = (reason: string): Adjustment => ({ ok: false, reason });

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
  if (!market || input.underlying !== market.underlying || input.expiry !== market.expiry || input.currency !== market.currency)
    return fail("Esperando la cadena del mismo subyacente, vencimiento y moneda.");
  const first = market.contracts[0];
  if (!first || market.contracts.some(contract => contract.underlyingId !== first.underlyingId || contract.settlement !== first.settlement ||
    contract.expiration.replaceAll("-", "") !== input.expiry.replaceAll("-", "") || contract.currency !== input.currency))
    return fail("La cadena contiene mercados incompatibles.");
  const targets: Contract[] = [];
  for (const leg of input.legs) {
    const current = market.contracts.filter(contract => contract.id === leg.securityId);
    if (current.length !== 1 || current[0].kind !== leg.kind || current[0].strike !== numeric(leg.strike) || current[0].factor !== numeric(input.multiplier))
      return fail("Las patas deben coincidir con los contratos y el factor de la cadena.");
    const strikes = [...new Set(market.contracts.filter(contract => contract.kind === leg.kind).map(contract => contract.strike))].sort((a, b) => a - b);
    const next = strikes[strikes.indexOf(current[0].strike) + direction];
    const candidates = market.contracts.filter(contract => contract.kind === leg.kind && contract.strike === next);
    if (candidates.length !== 1) return fail("Falta una base contigua única para alguna pata en ese sentido.");
    if (candidates[0].factor !== numeric(input.multiplier)) return fail("El contrato de destino tiene otro factor monetario.");
    targets.push(candidates[0]);
  }
  const prices = recipePrices({ ok: true, legs: targets.map((contract, index) => ({ contract, side: input.legs[index].side, ratio: 1 })) }, market.quotes, input.currency);
  if (!prices.ok) return prices;
  return { ok: true, legs: input.legs.map((leg, index) => {
    const contract = targets[index], iv = market.quotes[contract.id].impliedVolatility;
    return { ...leg, securityId: contract.id, symbol: contract.symbol, strike: String(contract.strike), premium: String(prices.premiums[index]),
      volatility: iv !== undefined && Number.isFinite(iv) && iv >= 0 ? String(iv) : "" };
  }) };
}
