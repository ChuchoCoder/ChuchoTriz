import type { Contract, Quote } from "./market";
import { expirySummary, intrinsic, resultAt, type OptionKind, type Side, type Strategy } from "./model";

export type StrategyFamily = "option" | "vertical" | "butterfly" | "ratio" | "strangle" | "straddle" | "iron-condor" | "jade-lizard";
export interface StrategyChoice { family: StrategyFamily; direction: "long" | "short"; kind: OptionKind; reversed: boolean }
export interface RecipeLeg { contract: Contract; side: Side; ratio: number }
export type Recipe = { ok: true; legs: RecipeLeg[] } | { ok: false; reason: string };
export const strategyFamilies: { id: StrategyFamily; label: string; kinds: boolean; mirror: boolean }[] = [
  { id: "option", label: "Option", kinds: true, mirror: false },
  { id: "vertical", label: "Vertical", kinds: true, mirror: false },
  { id: "butterfly", label: "Butterfly", kinds: true, mirror: false },
  { id: "ratio", label: "Ratio Spread", kinds: true, mirror: false },
  { id: "strangle", label: "Strangle", kinds: false, mirror: false },
  { id: "straddle", label: "Straddle", kinds: false, mirror: false },
  { id: "iron-condor", label: "Iron Condor", kinds: false, mirror: true },
  { id: "jade-lizard", label: "Jade Lizard", kinds: false, mirror: true },
];
export const initialChoice = (family: StrategyFamily): StrategyChoice => ({ family, direction: "long", kind: "call", reversed: false });
export function strategyLabel(choice: StrategyChoice): string {
  const family = strategyFamilies.find(item => item.id === choice.family)!;
  return `${family.label} · ${family.mirror ? choice.reversed ? "Reversed" : "Normal" : choice.direction === "long" ? "Long" : "Short"}${family.kinds ? ` ${choice.kind === "call" ? "Call" : "Put"}` : ""}`;
}
export function strategyDescription(choice: StrategyChoice): string {
  if (choice.family === "ratio") return choice.direction === "long" ? "Backspread 1×2: vende una opción y compra dos." : "Front spread 1×2: compra una opción y vende dos.";
  if (choice.family === "jade-lizard") return choice.reversed ? "Put spread vendido y call vendida (Twisted Sister)." : "Put vendida y call spread vendido.";
  if (choice.family === "iron-condor") return choice.reversed ? "Compra las opciones interiores y vende las alas exteriores." : "Vende las opciones interiores y compra las alas exteriores.";
  if (choice.family === "butterfly") return "Mariposa 1:2:1 con alas simétricas del mismo tipo.";
  if (choice.family === "straddle") return "Call y put con el mismo strike y vencimiento.";
  if (choice.family === "strangle") return "Put debajo y call por encima del precio de referencia.";
  if (choice.family === "vertical") return "Dos strikes del mismo tipo, elegidos cerca del subyacente.";
  return "Una opción cercana al precio de referencia.";
}

/** Resolve one coherent market automatically; never blend currencies or settlements. */
export function preferredOptionMarket(contracts: readonly Contract[], currency: string | undefined): string {
  const compatible = contracts.filter(contract => contract.currency === currency);
  const groups = [...new Set(compatible.map(contract => `${contract.currency}|${contract.settlement}`))].sort();
  return groups.find(group => group.endsWith("|2")) ?? groups[0] ?? "";
}

/** Metadata only: no ticker parsing, quote inference or order routing. */
export function strategyRecipe(choice: StrategyChoice, contracts: readonly Contract[], spot: number | undefined): Recipe {
  const fail = (reason: string): Recipe => ({ ok: false, reason });
  if (!strategyFamilies.some(family => family.id === choice.family)) return fail("Familia de estrategia no disponible.");
  if (!Number.isFinite(spot) || spot! <= 0) return fail("Esperando un precio de referencia del subyacente.");
  if (!contracts.length) return fail("No hay contratos para este vencimiento.");
  const first = contracts[0];
  if (contracts.some(contract => ["underlyingId", "expiration", "currency", "settlement"].some(key => contract[key as keyof Contract] !== first[key as keyof Contract])))
    return fail("Las patas deben compartir subyacente, vencimiento, moneda y plazo.");
  const unique = (kind: OptionKind) => {
    const list = contracts.filter(contract => contract.kind === kind);
    return list.filter(contract => list.filter(other => other.strike === contract.strike).length === 1).sort((a, b) => a.strike - b.strike);
  };
  const calls = unique("call"), puts = unique("put"), sameKind = choice.kind === "call" ? calls : puts;
  const nearest = (list: readonly Contract[]) => [...list].sort((a, b) => Math.abs(a.strike - spot!) - Math.abs(b.strike - spot!) || a.strike - b.strike)[0];
  const leg = (contract: Contract | undefined, side: Side, ratio = 1): RecipeLeg | undefined => contract ? { contract, side, ratio } : undefined;
  const lowerPut = puts.filter(contract => contract.strike < spot!).at(-1), upperCall = calls.find(contract => contract.strike > spot!);
  const putWing = lowerPut ? puts.filter(contract => contract.strike < lowerPut.strike).at(-1) : undefined;
  const callWing = upperCall ? calls.find(contract => contract.strike > upperCall.strike) : undefined;
  let legs: (RecipeLeg | undefined)[];
  if (choice.family === "option") legs = [leg(nearest(sameKind), "buy")];
  else if (choice.family === "vertical" || choice.family === "ratio") {
    const base = nearest(choice.kind === "call" ? sameKind.slice(0, -1) : sameKind.slice(1));
    const wing = base ? sameKind.find(contract => contract.strike === sameKind[sameKind.indexOf(base) + (choice.kind === "call" ? 1 : -1)]?.strike) : undefined;
    legs = choice.family === "vertical" ? [leg(base, "buy"), leg(wing, "sell")] : [leg(base, "sell"), leg(wing, "buy", 2)];
  } else if (choice.family === "butterfly") {
    let trio: Contract[] | undefined;
    for (const center of [...sameKind].sort((a, b) => Math.abs(a.strike - spot!) - Math.abs(b.strike - spot!) || a.strike - b.strike)) {
      for (const low of sameKind.filter(contract => contract.strike < center.strike).reverse()) {
        const high = sameKind.find(contract => contract.strike > center.strike && Math.abs((center.strike - low.strike) - (contract.strike - center.strike)) <= Math.max(1, center.strike, contract.strike) * Number.EPSILON * 8);
        if (high) { trio = [low, center, high]; break; }
      }
      if (trio) break;
    }
    if (!trio) return fail("Faltan tres strikes únicos con alas simétricas para Butterfly.");
    legs = [leg(trio[0], "buy"), leg(trio[1], "sell", 2), leg(trio[2], "buy")];
  } else if (choice.family === "straddle") {
    const call = nearest(calls.filter(contract => puts.some(put => put.strike === contract.strike)));
    legs = [leg(call, "buy"), leg(puts.find(put => put.strike === call?.strike), "buy")];
  } else if (choice.family === "strangle") legs = [leg(lowerPut, "buy"), leg(upperCall, "buy")];
  else if (choice.family === "iron-condor") legs = [leg(putWing, "buy"), leg(lowerPut, "sell"), leg(upperCall, "sell"), leg(callWing, "buy")];
  else legs = choice.reversed ? [leg(putWing, "buy"), leg(lowerPut, "sell"), leg(upperCall, "sell")]
    : [leg(lowerPut, "sell"), leg(upperCall, "sell"), leg(callWing, "buy")];
  if (!legs.every((item): item is RecipeLeg => !!item)) return fail("Faltan strikes únicos para esta variante. Probá otro tipo o vencimiento.");
  const invert = choice.family === "iron-condor" ? choice.reversed : choice.family !== "jade-lizard" && choice.direction === "short";
  return { ok: true, legs: legs.map(item => ({ ...item, side: invert ? item.side === "buy" ? "sell" : "buy" : item.side })) };
}

export function quotePrice(quote: Quote | undefined, side: Side): { ok: true; price: number } | { ok: false; kind: "missing" | "crossed"; reason: string } {
  const level = quote?.[side === "buy" ? "ask" : "bid"];
  if (!level || !Number.isFinite(level.price) || level.price <= 0 || !Number.isFinite(level.size) || level.size <= 0)
    return { ok: false, kind: "missing", reason: `sin ${side === "buy" ? "ASK" : "BID"} disponible para copiar.` };
  if (quote?.bid && quote.ask && quote.bid.price >= quote.ask.price) return { ok: false, kind: "crossed", reason: "BID/ASK cerrado o cruzado." };
  return { ok: true, price: level.price };
}

export function lastTradedPremium(quote: Quote | undefined) {
  const last = quote?.last;
  return last !== undefined && Number.isFinite(last) && last > 0 ? last : undefined;
}

type PriceResult<T> = { ok: true; price: T } | { ok: false; reason: string };

function collectRecipePrices<T>(recipe: Recipe, quotes: Record<string, Quote> | undefined, currency: string | undefined,
  resolvePrice: (quote: Quote | undefined, side: Side) => PriceResult<T>): { ok: true; premiums: T[] } | { ok: false; reason: string } {
  if (!recipe.ok) return recipe;
  if (!recipe.legs.length) return { ok: false, reason: "No hay patas para calcular el resultado." };
  const factor = recipe.legs[0].contract.factor;
  if (!Number.isFinite(factor) || factor! <= 0 || recipe.legs.some(item => item.contract.factor !== factor || item.contract.currency !== currency || item.contract.strikeCurrency !== currency))
    return { ok: false, reason: "Faltan factores compatibles o las monedas de prima, ejercicio y subyacente son diferentes." };
  const premiums: T[] = [];
  for (const item of recipe.legs) {
    const price = resolvePrice(quotes?.[item.contract.id], item.side);
    if (!price.ok) return { ok: false, reason: `${item.contract.symbol}: ${price.reason}` };
    premiums.push(price.price);
  }
  return { ok: true, premiums };
}

export function recipePrices(recipe: Recipe, quotes: Record<string, Quote> | undefined, currency: string | undefined) {
  return collectRecipePrices(recipe, quotes, currency, quotePrice);
}

export function recipeDraftPrices(recipe: Recipe, quotes: Record<string, Quote> | undefined, currency: string | undefined) {
  return collectRecipePrices<{ value: number | undefined; fromLast: boolean }>(recipe, quotes, currency, (quote, side) => {
    const price = quotePrice(quote, side);
    if (price.ok) return { ok: true, price: { value: price.price, fromLast: false } };
    if (!quote || price.kind === "crossed") return price;
    const last = lastTradedPremium(quote);
    return { ok: true, price: { value: last, fromLast: last !== undefined } };
  });
}

/** Priced expiry P&L for one structure; shares the result engine used by the main chart. */
export function recipePayoff(recipe: Recipe, quotes: Record<string, Quote> | undefined, spot: number | undefined, currency: string | undefined, costs = 0) {
  if (!recipe.ok) return recipe;
  const prices = recipeDraftPrices(recipe, quotes, currency);
  if (!prices.ok) return prices;
  if (!Number.isFinite(spot) || spot! < .000001 || spot! > 1e9 || !Number.isFinite(costs) || costs < 0 || costs > 1e12)
    return { ok: false as const, reason: "Revisá el precio de referencia y los gastos para calcular el resultado." };
  const factor = recipe.legs[0].contract.factor!;
  if (factor < .000001 || factor > 100000 || recipe.legs.some(({ contract, ratio }) =>
    !Number.isInteger(ratio) || ratio <= 0 || !Number.isFinite(contract.strike) || contract.strike < .000001 || contract.strike > 1e9) ||
    prices.premiums.some(({ value }) => value !== undefined && value > 1e9))
    return { ok: false as const, reason: "Los contratos superan los límites del modelo." };
  const exposure = (price: number) => recipe.legs.reduce((sum, { contract, ratio }, index) =>
    sum + ratio * factor * Math.max(price, contract.strike, prices.premiums[index].value ?? 0), costs);
  if (exposure(spot!) > Number.MAX_SAFE_INTEGER) return { ok: false as const, reason: "El importe bruto supera la precisión admitida." };
  if (prices.premiums.some(({ value }) => value === undefined))
    return { ok: false as const, missingPremiums: true, reason: "Completá los precios pendientes en Armado para calcular el resultado." };
  const legs = recipe.legs.map((item, index) => ({ kind: item.contract.kind, side: item.side, strike: item.contract.strike,
    contracts: item.ratio, premium: prices.premiums[index].value!, volatility: NaN }));
  const strategy: Strategy = { legs, multiplier: factor, costs, spot: spot!, years: 0, rate: 0, dividendYield: 0, rangeMin: 0, rangeMax: spot! };
  const summary = expirySummary(strategy);
  const anchors = [spot!, ...legs.map(leg => leg.strike), ...summary.equilibria.flatMap(point => [point.from, point.to]).filter(Number.isFinite)];
  const min = Math.min(...anchors), max = Math.max(...anchors), width = Math.max(spot! * .2, max - min);
  strategy.rangeMin = Math.max(0, min - width * .15); strategy.rangeMax = max + width * .15;
  if (!Number.isFinite(strategy.rangeMax) || exposure(strategy.rangeMax) > Number.MAX_SAFE_INTEGER)
    return { ok: false as const, reason: "El rango del resultado supera la precisión admitida." };
  const points = [...new Set([strategy.rangeMin, ...anchors, strategy.rangeMax])].sort((a, b) => a - b).map(price => ({ price, result: resultAt(strategy, price, "expiry") }));
  return { ok: true as const, strategy, summary, points };
}

/** Unit intrinsic shape, zeroed at spot: a glyph, not a priced P&L estimate. */
export function recipeGlyph(recipe: Recipe, spot: number | undefined): string | undefined {
  if (!recipe.ok || !spot) return;
  const strikes = recipe.legs.map(item => item.contract.strike), low = Math.min(spot * .8, ...strikes) * .95, high = Math.max(spot * 1.2, ...strikes) * 1.05;
  const value = (price: number) => recipe.legs.reduce((sum, item) => sum + (item.side === "buy" ? 1 : -1) * item.ratio * intrinsic(item.contract.kind, price, item.contract.strike), 0);
  const prices = [...new Set([low, high, ...strikes, ...Array.from({ length: 25 }, (_, i) => low + (high - low) * i / 24)])].sort((a, b) => a - b);
  const baseline = value(spot), values = prices.map(price => value(price) - baseline), scale = Math.max(1e-9, ...values.map(Math.abs));
  return prices.map((price, index) => `${index ? "L" : "M"}${(2 + (price - low) / (high - low) * 36).toFixed(2)},${(14 - values[index] / scale * 11).toFixed(2)}`).join(" ");
}

/** Standardized payoff glyph when current market metadata cannot form the structure. */
export function strategyGlyph(choice: StrategyChoice): string | undefined {
  const contracts = [80, 90, 100, 110, 120].flatMap(strike => (["call", "put"] as const).map(kind => ({
    id: `${kind}-${strike}`, symbol: "", underlyingId: "glyph", kind, strike, expiration: "", currency: "ARS" as const, settlement: "2",
  })));
  return recipeGlyph(strategyRecipe(choice, contracts, 100), 100);
}
