import type { Contract, Quote } from "./market";
import { formatOptionInput } from "./format";
import { MAX_CONTRACTS, MAX_LEGS, numeric, rollFees, type Leg, type Simulation } from "./model";
import type { StrikeMarket } from "./strategyAdjustments";
import { quotePrice } from "./strategyTemplates";

const fail = (reason: string) => ({ ok: false as const, reason });
const validQuantity = (quantity: number) => Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_CONTRACTS;
const rollDecimal = (value: number) => value.toLocaleString("en-US", { useGrouping: false, maximumSignificantDigits: 17 });
const validStrike = (strike: number) => Number.isFinite(strike) && strike >= .000001 && strike <= 1e9;
function decimal(value: number) {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [integer, fraction = ""] = mantissa.split(".");
  return { units: BigInt(integer + fraction), places: fraction.length - Number(exponent) };
}

function rollCash(closeQuantity: number, factor: number, closePrice: number, openPrice: number, feePercent: number, openingSide: Leg["side"]) {
  const lot = decimal(factor), close = decimal(closePrice), open = decimal(openPrice), fee = decimal(feePercent);
  const places = Math.max(lot.places + close.places, lot.places + open.places);
  const scaled = (units: bigint, from: number) => units * 10n ** BigInt(places - from);
  const closeAmount = scaled(BigInt(closeQuantity) * lot.units * close.units, lot.places + close.places);
  const openUnit = scaled(lot.units * open.units, lot.places + open.places);
  const percentPlaces = fee.places + 2;
  const percentScale = 10n ** BigInt(percentPlaces);
  const direction = openingSide === "sell" ? 1n : -1n;
  // Charge the same percentage on each leg's gross amount, with exact decimal sizing.
  const balance = closeAmount * (-direction * percentScale - fee.units);
  const netOpenUnit = openUnit * (direction * percentScale - fee.units);
  const amount = (units: bigint) => Number(`${units}e${-(places + percentPlaces)}`);
  return {
    minimum: openingSide === "sell" ? Number((-balance + netOpenUnit - 1n) / netOpenUnit) : undefined,
    maximum: openingSide === "buy" && balance >= -netOpenUnit ? Number(balance / -netOpenUnit) : undefined,
    net: (quantity: number) => amount(balance + BigInt(quantity) * netOpenUnit),
    costs: (quantity: number) => amount((closeAmount + BigInt(quantity) * openUnit) * fee.units),
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
  if (!position || position.kind !== source.kind || numeric(position.strike) !== source.strike ||
    !validStrike(source.strike) || !validQuantity(numeric(position.contracts)) || factor < .000001 || factor > 100000 || source.factor !== factor ||
    source.currency !== input.currency || source.strikeCurrency !== input.currency ||
    source.expiration.replaceAll("-", "") !== input.expiry.replaceAll("-", "") ||
    market.contracts.some(contract => contract.id !== sourceId && contract.kind === source.kind && contract.strike === source.strike))
    return fail("La posición debe corresponder a un contrato de la cadena y tener una cantidad válida.");
  if (input.legs.length > MAX_LEGS - 2 || input.legs.some(leg => leg.securityId === sourceId))
    return fail("Liberá espacio para las dos patas y quitá cualquier ajuste sobre la base actual.");
  const quote = market.quotes[sourceId];
  const openSide = position.side;
  const closeSide: Leg["side"] = openSide === "sell" ? "buy" : "sell";
  const closeBook = closeSide === "buy" ? "ask" : "bid";
  const closeLevel = quote?.[closeBook];
  const closePrice = quotePrice(quote, closeSide);
  const bookLabel = closeBook.toUpperCase();
  if (!closePrice.ok || closePrice.price > 1e9 || !closeLevel)
    return fail(`La base actual requiere un ${bookLabel} válido para simular el cierre.`);
  const quantity = numeric(position.contracts);
  if (closeLevel.depthUnverified) return fail(`El libro no confirma la profundidad del ${bookLabel} de cierre.`);
  if (closeLevel.size < quantity) return fail(`El ${bookLabel} de la base actual no cubre todo el cierre.`);
  return { ok: true as const, market, source, quantity, factor, closeSide, openSide, closeBook, closePrice: closePrice.price };
}

export function rollCandidates(input: Simulation, sourceId: string, feePercent: number, market?: StrikeMarket) {
  const context = rollContext(input, sourceId, market);
  if (!context.ok) return context;
  const { source, quantity, factor, closePrice, openSide } = context;
  const close = quantity * factor * closePrice;
  const openBook = openSide === "sell" ? "bid" : "ask";
  const bookLabel = openBook.toUpperCase();
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100)
    return fail("Ingresá un porcentaje de gastos desde 0 y menor que 100.");
  const manualCosts = numeric(input.adjustmentCosts ?? "0");
  const previousCosts = manualCosts + rollFees(input.legs, factor);
  if (!Number.isFinite(previousCosts) || manualCosts < 0 || previousCosts > 1e12)
    return fail("Revisá los gastos y las patas de los ajustes existentes.");
  if ((close * (1 + feePercent / 100) + previousCosts) * 100 > Number.MAX_SAFE_INTEGER)
    return fail("Revisá el importe de cierre.");
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
      const level = quote?.[openBook];
      const price = quotePrice(quote, openSide);
      if (input.legs.some(leg => leg.securityId === contract.id)) return { contract, reason: "Ya tiene un ajuste" };
      if (!price.ok || price.price > 1e9 || !level) return { contract, reason: `Sin ${bookLabel} válido` };
      if (level.depthUnverified) return { contract, reason: `Profundidad ${bookLabel} sin verificar` };
      const flow = rollCash(quantity, factor, closePrice, price.price, feePercent, openSide);
      const fits = (amount: number) => {
        const costs = previousCosts + flow.costs(amount);
        return costs <= 1e12 && (close + amount * factor * price.price + costs) * 100 <= Number.MAX_SAFE_INTEGER;
      };
      let max = Math.min(MAX_CONTRACTS, Math.floor(level.size));
      if (!fits(max)) {
        // Feasibility decreases with quantity, so find the largest usable amount.
        let min = 0;
        while (min < max) {
          const middle = Math.ceil((min + max) / 2);
          if (fits(middle)) min = middle;
          else max = middle - 1;
        }
      }
      return { contract, price: price.price, max, minimum: flow.minimum,
        maximum: flow.maximum === undefined ? undefined : Math.min(max, flow.maximum),
        oneForOne: quantity <= max ? flow.net(quantity) : undefined };
    });
  return { ...context, candidates, close, openBook };
}

export function buildRoll(input: Simulation, sourceId: string, targetId: string, quantity: number, feePercent: number, market?: StrikeMarket) {
  const roll = rollCandidates(input, sourceId, feePercent, market);
  if (!roll.ok) return roll;
  const target = roll.candidates.find(candidate => candidate.contract.id === targetId);
  if (!target || target.price === undefined) return fail(`Elegí una base de destino con ${roll.openBook.toUpperCase()} disponible.`);
  if (!validQuantity(quantity) || quantity > target.max) return fail("Ingresá una cantidad entera dentro del máximo disponible.");
  const cash = rollCash(roll.quantity, roll.factor, roll.closePrice, target.price, feePercent, roll.openSide);
  const openingAmount = quantity * roll.factor * target.price;
  const id = Math.max(0, ...input.legs.map(leg => leg.id), ...input.position!.legs.map(leg => leg.id)) + 1;
  const leg = (contract: Contract, quote: Quote | undefined, id: number, side: Leg["side"], amount: number, premium: number): Leg => ({
    id, securityId: contract.id, rollSeriesId: contract.id, rollFeePercent: feePercent, symbol: contract.symbol, kind: contract.kind, side, strike: rollDecimal(contract.strike),
    contracts: String(amount), premium: rollDecimal(premium),
    volatility: quote?.impliedVolatility !== undefined && Number.isFinite(quote.impliedVolatility) &&
      quote.impliedVolatility >= 0 && quote.impliedVolatility <= 500 ? formatOptionInput(quote.impliedVolatility) : "",
  });
  const legs = [leg(roll.source, roll.market.quotes[sourceId], id, roll.closeSide, roll.quantity, roll.closePrice),
    leg(target.contract, roll.market.quotes[targetId], id + 1, roll.openSide, quantity, target.price)];
  return { ok: true as const, legs, openingAmount, costs: cash.costs(quantity), net: cash.net(quantity) };
}
