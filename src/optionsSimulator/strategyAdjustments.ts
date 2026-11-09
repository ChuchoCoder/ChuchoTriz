import type { Contract, Quote } from "./market";
import { formatOptionInput } from "./format";
import { MAX_CONTRACTS, numeric, rollFees, type Leg, type Simulation } from "./model";
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

/** Adjust ratio units, stopping at the minimum/maximum without changing proportions. */
export function adjustStrategyQuantity(legs: Leg[], direction: -1 | 1, steps = 1): Adjustment {
  if (!legs.length) return fail("Agregá patas a la estrategia.");
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_CONTRACTS) return fail("El paso de cantidad no es válido.");
  const quantities = legs.map(leg => numeric(leg.contracts));
  if (quantities.some(quantity => !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CONTRACTS))
    return fail("Completá cantidades enteras válidas en todas las patas.");
  const gcd = (a: number, b: number): number => { while (b) [a, b] = [b, a % b]; return a; };
  const units = quantities.reduce(gcd);
  const maxUnits = Math.min(...quantities.map(quantity => Math.floor(MAX_CONTRACTS / (quantity / units))));
  const nextUnits = Math.max(1, Math.min(maxUnits, units + direction * steps));
  if (nextUnits === units) return fail(direction < 0 ? "Ya está en la cantidad mínima de su proporción." : "La cantidad supera el máximo admitido.");
  const next = quantities.map(quantity => nextUnits * (quantity / units));
  return { ok: true, legs: legs.map((leg, index) => ({ ...leg, contracts: String(next[index]) })) };
}

function moveStrategyStrikes(input: Simulation, directions: readonly (-1 | 0 | 1)[], market?: StrikeMarket): Adjustment {
  if (!input.legs.length) return fail("Agregá patas a la estrategia.");
  const native = input.legs.filter(leg => leg.securityId);
  if (!native.length) {
    const strikes = input.legs.map(leg => numeric(leg.strike));
    if (strikes.some((strike, index) => !Number.isFinite(strike) || strike <= 0 || strike > 1e9 ||
      strike + directions[index] <= 0 || strike + directions[index] > 1e9))
      return fail("No se pueden desplazar todos los strikes manuales un punto en ese sentido.");
    return { ok: true, legs: input.legs.map((leg, index) => directions[index] === 0 ? leg
      : { ...leg, strike: formatOptionInput(strikes[index] + directions[index]) }) };
  }
  if (native.length !== input.legs.length) return fail("Para mover strikes, usá todas las patas de la cadena o todas manuales.");
  const context = nativeContext(input, market);
  if (!context.ok) return context;
  const source = context.market;
  const targets: { contract: Contract; index: number }[] = [];
  for (const [index, current] of context.contracts.entries()) {
    const direction = directions[index];
    if (!direction) continue;
    const strikes = [...new Set(source.contracts.filter(contract => contract.kind === current.kind).map(contract => contract.strike))].sort((a, b) => a - b);
    const next = strikes[strikes.indexOf(current.strike) + direction];
    const candidates = source.contracts.filter(contract => contract.kind === current.kind && contract.strike === next);
    if (candidates.length !== 1) return fail("Falta una base contigua única para alguna pata en ese sentido.");
    if (candidates[0].factor !== numeric(input.multiplier)) return fail("El contrato de destino tiene otro factor monetario.");
    targets.push({ contract: candidates[0], index });
  }
  const prices = recipePrices({ ok: true, legs: targets.map(({ contract, index }) => ({ contract, side: input.legs[index].side, ratio: 1 })) },
    source.quotes, input.currency);
  if (!prices.ok) return prices;
  const legs = [...input.legs];
  targets.forEach(({ contract, index }, targetIndex) => {
    const iv = source.quotes[contract.id].impliedVolatility;
    legs[index] = { ...legs[index], securityId: contract.id, symbol: contract.symbol, strike: formatOptionInput(contract.strike, 21),
      premium: formatOptionInput(prices.premiums[targetIndex], 21),
      volatility: iv !== undefined && Number.isFinite(iv) && iv >= 0 ? formatOptionInput(iv, 21) : "" };
  });
  return { ok: true, legs };
}

/** Atomic move to adjacent listed strikes; manual-only strategies use a step of one. */
export function shiftStrategyStrikes(input: Simulation, direction: -1 | 1, market?: StrikeMarket): Adjustment {
  return moveStrategyStrikes(input, input.legs.map(() => direction), market);
}

export function adjustStrategyWidth(input: Simulation, direction: -1 | 1, market?: StrikeMarket): Adjustment {
  const strikes = input.legs.map(leg => numeric(leg.strike));
  const distinct = [...new Set(strikes)].sort((a, b) => a - b);
  if (distinct.length < 2 || distinct.some(strike => !Number.isFinite(strike) || strike <= 0)) {
    return fail("Ingresá al menos dos strikes distintos y válidos para ajustar el ancho.");
  }
  const low = distinct[0], high = distinct[distinct.length - 1];
  const lowDirection = direction === 1 ? -1 : 1;
  const directions = strikes.map(strike => strike === low ? lowDirection : strike === high ? direction : 0);
  const result = moveStrategyStrikes(input, directions, market);
  if (!result.ok) return result;
  const moved = result.legs.map(leg => numeric(leg.strike));
  const boundaries = distinct.map(strike => new Set(moved.filter((_, index) => strikes[index] === strike)));
  const next = boundaries.map(group => [...group][0]);
  if (boundaries.some(group => group.size !== 1) || next.some((strike, index) => index > 0 && strike <= next[index - 1])) {
    return fail("Los extremos deben mantenerse separados y en el mismo orden.");
  }
  return result;
}

export function strategyPriceReferences(input: Simulation, market?: StrikeMarket) {
  if (!input.legs.length || input.legs.some(leg => !leg.securityId)) return fail("Natural, Mid y Opuesto requieren todas las patas de la cadena. Los precios manuales se editan en Análisis → Supuestos de valuación.");
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
    let gross = costs + rollFees(input.legs, factor, premiums);
    for (let index = 0; index < premiums.length; index++) {
      gross += quantities[index] * factor * premiums[index];
      if (!Number.isFinite(gross) || gross > Number.MAX_SAFE_INTEGER) return true;
    }
    return false;
  })) return fail("Reducí precios o cantidades: la exposición bruta supera la precisión admitida.");
  const hasRollFees = input.legs.some(leg => leg.rollFeePercent);
  const total = (premiums: number[]) => {
    let net = costs + rollFees(input.legs, factor, premiums);
    let gross = net;
    for (let index = 0; index < premiums.length; index++) {
      const amount = quantities[index] * factor * premiums[index];
      gross += amount;
      net += input.legs[index].side === "buy" ? amount : -amount;
    }
    // A decimal-neutral roll can leave float noise after opposing premiums and fees cancel.
    return hasRollFees && Math.abs(net) <= gross * Number.EPSILON ? 0 : net;
  };
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
