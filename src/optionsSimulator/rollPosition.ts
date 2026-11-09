import type { Contract, Quote } from "./market";
import { formatOptionInput } from "./format";
import { MAX_CONTRACTS, MAX_LEGS, numeric, type Leg, type Simulation } from "./model";
import type { StrikeMarket } from "./strategyAdjustments";
import { quotePrice } from "./strategyTemplates";

const fail = (reason: string) => ({ ok: false as const, reason });
const validQuantity = (quantity: number) => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_CONTRACTS;
const validStrike = (strike: number) => Number.isFinite(strike) && strike >= .000001 && strike <= 1e9;
function decimal(value: number) {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [integer, fraction = ""] = mantissa.split(".");
  return { units: BigInt(integer + fraction), places: fraction.length - Number(exponent) };
}

function rollCash(closeQuantity: number, factor: number, ask: number, bid: number, costs: number) {
  const lot = decimal(factor), close = decimal(ask), sale = decimal(bid), fee = decimal(costs);
  const places = Math.max(lot.places + close.places, lot.places + sale.places, fee.places);
  const scaled = (units: bigint, from: number) => units * 10n ** BigInt(places - from);
  const debit = scaled(BigInt(closeQuantity) * lot.units * close.units, lot.places + close.places) + scaled(fee.units, fee.places);
  const income = scaled(lot.units * sale.units, lot.places + sale.places);
  return {
    minimum: Number((debit + income - 1n) / income),
    net: (quantity: number) => Number(`${BigInt(quantity) * income - debit}e${-places}`),
  };
}

function rollContext(input: Simulation, sourceId: string, market?: StrikeMarket) {
  const positions = input.position?.legs.filter(leg => leg.securityId === sourceId);
  const position = positions?.length === 1 ? positions[0] : undefined;
  const sources = market?.contracts.filter(contract => contract.id === sourceId);
  const source = sources?.length === 1 ? sources[0] : undefined;
  const factor = numeric(input.multiplier);
  if (!market || !source || market.underlying !== input.underlying || market.expiry !== input.expiry || market.currency !== input.currency)
    return fail("Esperando cotizaciones de la misma posición y vencimiento.");
  if (!position || position.side !== "sell" || position.kind !== source.kind || numeric(position.strike) !== source.strike ||
    !validStrike(source.strike) || !validQuantity(numeric(position.contracts)) || factor < .000001 || factor > 100000 || source.factor !== factor ||
    source.currency !== input.currency || source.strikeCurrency !== input.currency ||
    source.expiration.replaceAll("-", "") !== input.expiry.replaceAll("-", "") ||
    market.contracts.some(contract => contract.id !== sourceId && contract.kind === source.kind && contract.strike === source.strike))
    return fail("La posición vendida debe corresponder a un contrato de la cadena y tener una cantidad válida.");
  if (input.legs.length > MAX_LEGS - 2 || input.legs.some(leg => leg.securityId === sourceId))
    return fail("Liberá espacio para las dos patas y quitá cualquier ajuste sobre la base actual.");
  const quote = market.quotes[sourceId];
  const ask = quotePrice(quote, "buy");
  if (!ask.ok || ask.price > 1e9) return fail("La base actual requiere un ASK válido para simular la recompra.");
  const quantity = numeric(position.contracts);
  if (quote.ask!.size < quantity) return fail("El ASK de la base actual no cubre toda la recompra.");
  return { ok: true as const, market, source, position, quantity, factor, ask: ask.price };
}

export function rollCandidates(input: Simulation, sourceId: string, costs: number, market?: StrikeMarket) {
  const context = rollContext(input, sourceId, market);
  if (!context.ok) return context;
  const { source, quantity, factor, ask } = context;
  const close = quantity * factor * ask;
  if (!Number.isFinite(costs) || costs < 0 || costs > 1e12 || (close + costs) * 100 > Number.MAX_SAFE_INTEGER)
    return fail("Revisá los gastos y el importe de recompra.");
  const seriesByStrike = new Map<number, number>();
  for (const contract of context.market.contracts) if (contract.kind === source.kind)
    seriesByStrike.set(contract.strike, (seriesByStrike.get(contract.strike) ?? 0) + 1);
  const candidates = context.market.contracts.filter(contract => contract.strike !== source.strike && contract.kind === source.kind &&
    validStrike(contract.strike) && seriesByStrike.get(contract.strike) === 1 &&
    contract.underlyingId === source.underlyingId && contract.settlement === source.settlement && contract.currency === source.currency &&
    contract.strikeCurrency === source.strikeCurrency && contract.factor === factor &&
    contract.expiration.replaceAll("-", "") === source.expiration.replaceAll("-", ""))
    .sort((a, b) => a.strike - b.strike).map(contract => {
      const quote = context.market.quotes[contract.id];
      const bid = quotePrice(quote, "sell");
      if (input.legs.some(leg => leg.securityId === contract.id)) return { contract, reason: "Ya tiene un ajuste" };
      if (!bid.ok || bid.price > 1e9) return { contract, reason: "Sin BID válido" };
      const max = Math.min(MAX_CONTRACTS, Math.floor(quote.bid!.size));
      const flow = rollCash(quantity, factor, ask, bid.price, costs);
      return { contract, bid: bid.price, max, minimum: flow.minimum, oneForOne: quantity <= max ? flow.net(quantity) : undefined };
    });
  return { ...context, candidates, close, costs };
}

export function buildRoll(input: Simulation, sourceId: string, targetId: string, quantity: number, costs: number, market?: StrikeMarket) {
  const roll = rollCandidates(input, sourceId, costs, market);
  if (!roll.ok) return roll;
  const target = roll.candidates.find(candidate => candidate.contract.id === targetId);
  if (!target || target.bid === undefined) return fail("Elegí una base de destino con BID disponible.");
  if (!validQuantity(quantity) || quantity > target.max) return fail("Ingresá una cantidad entera que entre en el BID disponible.");
  const previousCosts = input.legs.length ? numeric(input.adjustmentCosts ?? "0") : 0;
  const adjustmentCosts = previousCosts + costs;
  const proceeds = quantity * roll.factor * target.bid;
  if (!Number.isFinite(previousCosts) || previousCosts < 0 || adjustmentCosts > 1e12 ||
    (proceeds + roll.close + adjustmentCosts) * 100 > Number.MAX_SAFE_INTEGER)
    return fail("Revisá los gastos y la precisión de los importes del ajuste.");
  const id = Math.max(0, ...input.legs.map(leg => leg.id), ...input.position!.legs.map(leg => leg.id)) + 1;
  const leg = (contract: Contract, quote: Quote | undefined, id: number, side: Leg["side"], amount: number, premium: number): Leg => ({
    id, securityId: contract.id, symbol: contract.symbol, kind: contract.kind, side, strike: formatOptionInput(contract.strike),
    contracts: String(amount), premium: formatOptionInput(premium),
    volatility: quote?.impliedVolatility !== undefined && Number.isFinite(quote.impliedVolatility) &&
      quote.impliedVolatility >= 0 && quote.impliedVolatility <= 500 ? formatOptionInput(quote.impliedVolatility) : "",
  });
  // Both sides of the closed series must use the same IV so their theoretical values cancel.
  const close = { ...leg(roll.source, roll.market.quotes[sourceId], id, "buy", roll.quantity, roll.ask), volatility: roll.position.volatility };
  const legs = [close,
    leg(target.contract, roll.market.quotes[targetId], id + 1, "sell", quantity, target.bid)];
  return { ok: true as const, legs, adjustmentCosts: formatOptionInput(adjustmentCosts), proceeds,
    net: rollCash(roll.quantity, roll.factor, roll.ask, target.bid, costs).net(quantity) };
}
