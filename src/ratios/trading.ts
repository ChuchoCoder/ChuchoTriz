import { calculateRatio, pairKey, ratioLabel, referenceCQuote, tickerKey, type RatioInstrument, type RatioReference } from "./model";
import { formatOptionInput } from "../optionsSimulator/format";

export interface TradingInstrument extends RatioInstrument {
  cfi: string;
  amountFactor?: number;
  quantityStep?: number;
  quantityUnit: "nominales" | "contratos" | "unidades";
}
export interface TradingDepthLevel { price: number; size: number }
export interface TradingQuote {
  last?: number; bid?: TradingDepthLevel; ask?: TradingDepthLevel;
  depth?: { bid?: TradingDepthLevel; ask?: TradingDepthLevel }[];
  tradedAt?: number; amountFactor?: number; issue?: string; reference?: number; referenceDate?: string;
}
export interface TradingPair extends RatioReference { id: string; a: TradingInstrument; b: TradingInstrument; c?: TradingInstrument }
export interface RatioExit { quantity: number; price: number; at: string; closeId?: string; referencePrice?: number }
export type TradingLegIndex = 0 | 1 | 2;
export const tradingLegNames = ["A", "B", "C"] as const;
export interface TradingLeg {
  instrument: TradingInstrument; side: 1 | -1; quantity: number; entry: number;
  factor: number; step: number; ddmm: number; exits: RatioExit[];
}
type TradingLegs = [TradingLeg, TradingLeg] | [TradingLeg, TradingLeg, TradingLeg];
export interface OperationReference {
  instrument: TradingInstrument;
  divisor?: 100;
  entry: number;
  goal?: { value: number; comparison: "above" | "below" };
}
export interface RatioOperation {
  id: string; openedAt: string; direction: 1 | -1; commission: number;
  fx: number; // Retained for compatibility with historical records; sizing no longer converts currencies.
  targetRatio: number | null; legs: TradingLegs; reference?: OperationReference;
}
export interface TradingBook { schema: 1 | 2 | 3 | 4; revision: string; watchDefaults?: 1; watch: TradingPair[]; operations: RatioOperation[] }
export function tradingBookSchema(watch: readonly TradingPair[], operations: readonly RatioOperation[] = []): TradingBook["schema"] {
  if (operations.some(o => o.reference)) return 4;
  return watch.some(p => p.cDivisor) ? 3 : watch.some(p => p.c) ? 2 : 1;
}
export function invertWatchPair(book: TradingBook, id: string): TradingBook {
  const pair = book.watch.find(p => p.id === id);
  if (!pair) throw Error("El par ya no está en el monitor.");
  if (pair.c) throw Error("Para cambiar el sentido de una comparación, quitá la fila y agregá la fórmula deseada.");
  if (book.watch.some(p => p.id !== id && !p.c && p.a.id === pair.b.id && p.b.id === pair.a.id)) throw Error("El par inverso ya está en el monitor.");
  return { ...book, watch: book.watch.map(p => p.id === id ? { ...p, a: p.b, b: p.a } : p) };
}
export const emptyBook = (): TradingBook => ({ schema: 1, revision: "", watch: [], operations: [] });
export const MAX_OPERATIONS = 500, MAX_WATCH = 100;
export const DEFAULT_WATCH_PAIRS = [ ["AL30", "AL30D"], ["AL30", "AL30C"], ["AL30D", "AL30C"], ["GD30", "AL30"],
  ["BMA", "GGAL"], ["ALUA", "TXAR"], ["TGSU2", "TGNO4"], ["PESOS - 7D", "PESOS - 1D"],
  ["AL30", "AL30D", "DLR/SPOT"], ["AL30", "AL30C", "DLR/SPOT"] ] as const;
export const isRateInstrument = (i: Pick<TradingInstrument, "cfi">) => i.cfi === "RPXXXX";
export const isMonitorOnly = (i: TradingInstrument) => isRateInstrument(i) || i.monitorOnly === true || i.id === "rx_DDF_DLR_SPOT";
export const canTradeReference = (i: TradingInstrument) => i.market === "rx" && i.settlement === "Futuro" &&
  i.quantityUnit === "contratos" && (i.cfi === "FXXXSX" || i.cfi === "FXXXXX") && i.id !== "rx_DDF_DLR_SPOT";
export async function resolveDefaultWatch(search: (query: string) => Promise<TradingInstrument[]>) {
  const symbols = [...new Set(DEFAULT_WATCH_PAIRS.flat())], instruments = new Map<string, TradingInstrument>();
  await Promise.all(symbols.map(async symbol => {
    const matches = new Map((await search(symbol)).filter(i => validInstrument(i) && (symbol === "DLR/SPOT"
      ? i.id === "rx_DDF_DLR_SPOT" && i.market === "rx" && i.currency === "ARS" && i.monitorOnly === true
      : i.market === "bm" && tickerKey(i.symbol) === tickerKey(symbol))).map(i => [i.id, i]));
    if (matches.size === 1) instruments.set(symbol, [...matches.values()][0]);
  }));
  const watch: TradingPair[] = [], missing: string[] = [];
  for (const [a, b, c] of DEFAULT_WATCH_PAIRS) {
    if (!instruments.has(a) || !instruments.has(b) || c && !instruments.has(c)) { missing.push(c ? `(${a}/${b}) / ${c}` : `${a}/${b}`); continue; }
    watch.push({ id: crypto.randomUUID(), a: instruments.get(a)!, b: instruments.get(b)!, ...(c ? { c: instruments.get(c)! } : {}) });
  }
  return { watch, missing };
}
/** Seed once per saved book. Explicit restoration adds missing pairs without reordering user rows. */
export function applyDefaultWatch(book: TradingBook, pairs: TradingPair[], restore = false): TradingBook {
  if (book.watchDefaults === 1 && !restore) return book;
  const watch = [...book.watch];
  for (const p of pairs) if (!watch.some(existing => pairKey(existing) === pairKey(p))) watch.push(p);
  if (watch.length > MAX_WATCH) throw Error("El monitor no tiene espacio para los pares predeterminados. Quitá un par y volvé a intentarlo.");
  return { ...book, schema: tradingBookSchema(watch, book.operations), watch, watchDefaults: 1 };
}
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const rate = (n: unknown): n is number => finite(n) && n >= 0 && n <= 100;
const text = (n: unknown): n is string => typeof n === "string" && n.length > 0 && n.length <= 240 && !/[\u0000-\u001f\u007f]/.test(n);
const date = (n: unknown): n is string => typeof n === "string" && Number.isFinite(Date.parse(n)) && new Date(n).toISOString() === n;
const quantity = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0 && (n as number) <= 1e12;
export type InstrumentKind = "Acción" | "CEDEAR" | "Bono" | "ON" | "Letra" | "Opción" | "Futuro" | "Desconocido";
export function instrumentKind(cfi: string): InstrumentKind {
  return ({ ESXXXX: "Acción", EMXXXX: "CEDEAR", DBXXXX: "Bono", DBXXFR: "ON", DYXTXR: "Letra", FXXXSX: "Futuro",
    OCASPS: "Opción", OPASPS: "Opción", OCAFXS: "Opción", OPAFXS: "Opción" } as Record<string, InstrumentKind>)[cfi] || "Desconocido";
}
/** Premium's defaults, excluding its separate broker commission. Equity rights include 21% VAT. */
export function defaultMarketRights(i: Pick<TradingInstrument, "cfi" | "market">): number | undefined {
  if (i.market !== "bm") return;
  const kind = instrumentKind(i.cfi);
  if (kind === "Acción" || kind === "CEDEAR") return .0847;
  if (kind === "Letra") return .001;
  if (kind !== "Desconocido") return .01;
}
export const sameCurrency = (a: RatioInstrument, b: RatioInstrument) => !!a.currency && a.currency === b.currency;
export const pairRatioLabel = (raw: number | undefined, a: RatioInstrument, b: RatioInstrument) => ratioLabel(raw, sameCurrency(a, b) ? "percent" : "number");
export const goalInput = (o: RatioOperation): string => o.targetRatio === null ? "" : String(sameCurrency(o.legs[0].instrument, o.legs[1].instrument) ? Number(((o.targetRatio - 1) * 100).toFixed(10)) : o.targetRatio);
export function parseGoal(value: string, a: RatioInstrument, b: RatioInstrument): number | null {
  if (value.trim() === "") return null;
  const n = Number(value.replace(",", ".")), raw = sameCurrency(a, b) ? 1 + n / 100 : n;
  if (!positive(raw)) throw Error("El objetivo debe ser un ratio positivo; en porcentaje debe superar −100%.");
  return raw;
}
export function parseSpreadGoal(value: string, comparison: "above" | "below"): OperationReference["goal"] {
  if (value.trim() === "") return undefined;
  const raw = 1 + Number(value.replace(",", ".")) / 100;
  if (!positive(raw)) throw Error("El objetivo de brecha debe superar −100%.");
  return { value: raw, comparison };
}
export const spreadGoalInput = (goal: OperationReference["goal"]) => goal ? String(Number(((goal.value - 1) * 100).toFixed(10))) : "";
export const spreadGoalReached = (goal: OperationReference["goal"], spread?: number) =>
  !!goal && positive(spread) && (goal.comparison === "above" ? spread >= goal.value : spread <= goal.value);
export const goalReached = (o: RatioOperation, raw: number | undefined) => o.targetRatio !== null && positive(raw) && (o.direction === 1 ? raw >= o.targetRatio : raw <= o.targetRatio);
export const closedQuantity = (l: TradingLeg) => l.exits.reduce((n, e) => n + e.quantity, 0);
export const remaining = (l: TradingLeg) => l.quantity - closedQuantity(l);
export const isClosed = (o: RatioOperation) => o.legs.every(l => remaining(l) === 0);
export function counterpart(qa: number, pa: number, pb: number, fa: number, fb: number, step: number, a: RatioInstrument, b: RatioInstrument): number {
  if (!sameCurrency(a, b)) return quantity(qa) ? qa : NaN;
  if (![qa, pa, pb, fa, fb, step].every(positive)) return NaN;
  const result = Math.round(qa * pa * fa / (pb * fb * step)) * step;
  return quantity(result) ? result : NaN;
}
export function validateOperation(o: RatioOperation): void {
  if (!text(o?.id) || !date(o.openedAt) || Date.parse(o.openedAt) > Date.now() || ![1, -1].includes(o.direction) || !rate(o.commission) || !positive(o.fx) ||
    o.targetRatio !== null && !positive(o.targetRatio) || !Array.isArray(o.legs) || ![2, 3].includes(o.legs.length) ||
    new Set(o.legs.map(l => l?.instrument?.id)).size !== o.legs.length) throw Error("Operación de ratio inválida.");
  const reference = o.reference, future = o.legs[2];
  if (reference !== undefined && (!validInstrument(reference?.instrument) || !positive(reference.entry) ||
    reference.divisor !== undefined && reference.divisor !== 100 ||
    reference.goal !== undefined && (!positive(reference.goal?.value) || !["above", "below"].includes(reference.goal.comparison)))) {
    throw Error("Revisá el precio y el objetivo de la referencia C.");
  }
  if (o.legs.length === 3 && (!validInstrument(future?.instrument) || !canTradeReference(future.instrument) ||
    future.instrument.id !== reference?.instrument.id || future.entry !== reference.entry ||
    future.instrument.currency !== reference.instrument.currency)) throw Error("Revisá el contrato de la pata C.");
  const closeTimes = new Map<string, string>();
  const closeReferences = new Set<string>();
  const contractCloses = new Set<string>();
  o.legs.forEach((l, index) => {
    if (validInstrument(l?.instrument) && index < 2 && isMonitorOnly(l.instrument)) throw Error("Las tasas TNA y referencias sólo se monitorean en A y B.");
    if (!validInstrument(l?.instrument) || (index === 2 ? ![1, -1].includes(l.side) : l.side !== (index === 0 ? o.direction : -o.direction)) || !quantity(l.quantity) || !quantity(l.step) || l.quantity % l.step !== 0 ||
      !positive(l.entry) || !positive(l.factor) || !rate(l.ddmm) || l.quantity * l.entry * l.factor > 1e15 || !Array.isArray(l.exits) || l.exits.length > 1000) throw Error("Revisá precios, factores, lotes, cantidades y DDMM de las patas registradas.");
    let at = Date.parse(o.openedAt);
    const closeIds = new Set<string>();
    for (const e of l.exits) {
      if (!quantity(e?.quantity) || e.quantity % l.step !== 0 || !positive(e.price) || e.quantity * e.price * l.factor > 1e15 || !date(e.at) || Date.parse(e.at) < at || Date.parse(e.at) > Date.now()) throw Error("Los cierres registrados son inválidos.");
      if (e.closeId !== undefined) {
        if (!text(e.closeId) || closeIds.has(e.closeId) || (closeTimes.get(e.closeId) ?? e.at) !== e.at) throw Error("Los cierres registrados son inválidos.");
        closeIds.add(e.closeId);
        closeTimes.set(e.closeId, e.at);
        if (index === 2) contractCloses.add(e.closeId);
      }
      if (e.referencePrice !== undefined) {
        if (!reference || index === 2 || !e.closeId || closeReferences.has(e.closeId) || !positive(e.referencePrice)) {
          throw Error("El precio de referencia C del cierre es inválido.");
        }
        closeReferences.add(e.closeId);
      }
      at = Date.parse(e.at);
    }
    if (closedQuantity(l) > l.quantity) throw Error("La cantidad total no puede ser menor que la cantidad ya cerrada.");
  });
  if ([...closeReferences].some(id => contractCloses.has(id))) throw Error("El cierre tiene dos precios para C.");
}
export function correctOperation(previous: RatioOperation, next: RatioOperation): RatioOperation {
  if (isClosed(previous) || next.id !== previous.id) throw Error("Sólo se puede editar una operación abierta.");
  if (previous.legs.some(l => l.exits.length) && (previous.legs.length !== next.legs.length ||
    previous.legs.some((l, i) => {
      const leg = next.legs[i];
      return l.instrument.id !== leg?.instrument.id || l.side !== leg.side || l.factor !== leg.factor || l.step !== leg.step;
    }) || previous.reference?.instrument.id !== next.reference?.instrument.id || previous.reference?.divisor !== next.reference?.divisor)) {
    throw Error("Con cierres registrados se conservan instrumentos, sentido y unidades de cotización.");
  }
  const result: RatioOperation = { ...next, legs: next.legs.map((l, i) => ({ ...l, exits: structuredClone(previous.legs[i]?.exits ?? []) })) as TradingLegs };
  validateOperation(result); return result;
}
export function closeOperation(o: RatioOperation, fraction: number, prices: number[], at: string, referencePrice?: number): RatioOperation {
  if (isClosed(o) || ![.25, .5, 1].includes(fraction)) throw Error("Revisá la proporción del cierre.");
  const quantities = o.legs.map(l => {
    const q = fraction === 1 ? remaining(l) : Math.floor(remaining(l) * fraction / l.step) * l.step;
    if (q <= 0 && fraction !== 1) throw Error("El cierre parcial debe alcanzar al menos un lote de cada pata.");
    return q;
  });
  return recordClose(o, quantities, prices, at, referencePrice);
}
/** Preserve the open quantities' proportion, independently of currency or current prices. */
export function partialCloseQuantities(o: RatioOperation, leg: TradingLegIndex, amount: number): number[] {
  validateOperation(o);
  const source = o.legs[leg];
  if (!source || isClosed(o)) throw Error("La operación ya está cerrada o la pata no es válida.");
  const rest = remaining(source);
  if (!quantity(amount) || amount % source.step !== 0) throw Error(`Ingresá una cantidad positiva, múltiplo de ${source.step}, en la pata ${tradingLegNames[leg]}.`);
  if (amount > rest) throw Error("La cantidad a cerrar supera el remanente de esa pata.");
  return o.legs.map((other, i) => {
    if (i === leg) return amount;
    const otherRest = remaining(other);
    const calculated = amount === rest ? otherRest : Math.round((amount / rest) * (otherRest / other.step)) * other.step;
    if (otherRest > 0 && calculated === 0) throw Error("El cierre debe alcanzar al menos un lote de cada pata abierta.");
    return calculated;
  });
}
export function closeOperationByQuantity(o: RatioOperation, leg: TradingLegIndex, amount: number, prices: number[], at: string, referencePrice?: number): RatioOperation {
  return recordClose(o, partialCloseQuantities(o, leg, amount), prices, at, referencePrice);
}
function recordClose(o: RatioOperation, quantities: number[], prices: number[], at: string, referencePrice?: number): RatioOperation {
  if (prices.length !== o.legs.length || quantities.some((q, i) => q > 0 && !positive(prices[i]))) throw Error("Revisá los precios de cierre.");
  const referenceLeg = o.reference && !quantities[2] ? quantities.findIndex(q => q > 0) : -1;
  if (referenceLeg !== -1 && !positive(referencePrice)) throw Error("Ingresá el precio de referencia C al cierre.");
  const closeId = crypto.randomUUID();
  const legs = o.legs.map((l, i) => {
    const q = quantities[i];
    if (q === 0) return l;
    const exit = { quantity: q, price: prices[i], at, closeId, ...(i === referenceLeg ? { referencePrice } : {}) };
    return { ...l, exits: [...l.exits, exit].sort((a, b) => a.at.localeCompare(b.at)) };
  }) as TradingLegs;
  const result = { ...o, legs }; validateOperation(result); return result;
}

interface RecordedCloseLeg extends RatioExit { index: number; leg: TradingLegIndex }
export interface RecordedClose {
  key: string;
  at: string;
  entries: RecordedCloseLeg[];
}

export function recordedCloses(o: RatioOperation): RecordedClose[] {
  const grouped = new Map<string, RecordedClose>();
  o.legs.forEach((position, index) => {
    const leg = index as TradingLegIndex;
    position.exits.forEach((exit, index) => {
      const key = exit.closeId ? `id:${exit.closeId}` : `time:${exit.at}`;
      const group = grouped.get(key) ?? { key, at: exit.at, entries: [] };
      group.entries.push({ ...exit, index, leg });
      grouped.set(key, group);
    });
  });
  return [...grouped.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).flatMap(group => {
    const { at, entries } = group;
    if (new Set(entries.map(entry => entry.leg)).size === entries.length) return [group];
    // A legacy timestamp shared by several exits cannot identify their pairings.
    return entries.map(entry => ({ key: `legacy:${at}:${entry.leg}:${entry.index}`, at, entries: [entry] }));
  });
}

export type CloseCorrection = Pick<RatioExit, "quantity" | "price">;

export function reviseRecordedClose(o: RatioOperation, key: string, corrections: CloseCorrection[] | null, referencePrice?: number): RatioOperation {
  const close = recordedCloses(o).find(item => item.key === key);
  if (!close) throw Error("El cierre ya no está en el historial.");
  if (corrections && corrections.length !== close.entries.length) throw Error("Completá los datos de cada pata del cierre.");
  const legs: RatioOperation["legs"] = [...o.legs];
  close.entries.forEach(({ leg, index }, i) => {
    const position = legs[leg]!;
    const exits = [...position.exits];
    if (corrections) {
      const { quantity: amount, price } = corrections[i];
      if (!quantity(amount) || amount % position.step !== 0 || !positive(price)) {
        throw Error(`Revisá el precio y la cantidad de ${position.instrument.symbol}. La cantidad debe respetar el lote de ${position.step}.`);
      }
      if (amount > remaining(position) + exits[index].quantity) {
        throw Error(`La cantidad de ${position.instrument.symbol} supera el saldo disponible para corregir este cierre.`);
      }
      const previous = exits[index];
      if (previous.referencePrice !== undefined && referencePrice !== undefined && !positive(referencePrice)) throw Error("Ingresá un precio válido para C.");
      exits[index] = { ...previous, quantity: amount, price,
        ...(previous.referencePrice !== undefined && referencePrice !== undefined ? { referencePrice } : {}) };
    } else {
      exits.splice(index, 1);
    }
    legs[leg] = { ...position, exits };
  });
  // After deleting from an ambiguous legacy group, keep the remaining exits
  // distinct even if only one per leg now shares the same timestamp.
  if (!corrections && close.key.startsWith("legacy:")) {
    legs.forEach((position, index) => {
      legs[index] = { ...position, exits: position.exits.map(exit =>
        !exit.closeId && exit.at === close.at ? { ...exit, closeId: crypto.randomUUID() } : exit) };
    });
  }
  const result = { ...o, legs };
  validateOperation(result);
  return result;
}

export interface CurrencyPnl { currency: string; realized: number; pending?: number; net?: number; gross?: number; commission?: number; ddmm?: number; issue?: string }
export function quoteUnitChanged(quote: TradingQuote | undefined, savedFactor: number): boolean {
  // The form saves the factor at its displayed precision.
  const factor = quote?.amountFactor;
  return positive(factor) && factor !== savedFactor && formatOptionInput(factor) !== formatOptionInput(savedFactor);
}
export function operationPnl(o: RatioOperation, quotes: Record<string, TradingQuote>): CurrencyPnl[] {
  const currencies = new Map<string, CurrencyPnl>();
  for (const l of o.legs) {
    const currency = l.instrument.currency, p = currencies.get(currency) || { currency, realized: 0, pending: 0, net: 0, gross: 0, commission: 0, ddmm: 0 };
    const fee = (q: number, price: number, r: number) => q * price * l.factor * r / 100;
    const closed = closedQuantity(l), rest = remaining(l), quote = quotes[l.instrument.id];
    const realizedGross = l.exits.reduce((n, e) => n + l.side * e.quantity * (e.price - l.entry) * l.factor, 0);
    const realizedCommission = fee(closed, l.entry, o.commission) + l.exits.reduce((n, e) => n + fee(e.quantity, e.price, o.commission), 0);
    const realizedDdmm = fee(closed, l.entry, l.ddmm) + l.exits.reduce((n, e) => n + fee(e.quantity, e.price, l.ddmm), 0);
    p.realized += realizedGross - realizedCommission - realizedDdmm;
    const issue = rest ? quote?.issue || (!positive(quote?.last) ? "Sin último precio para valuar el remanente." :
      quoteUnitChanged(quote, l.factor) ? "Cambió la unidad de cotización; revisá la operación." : undefined) : undefined;
    if (issue) { p.issue = issue; p.pending = p.net = p.gross = p.commission = p.ddmm = undefined; }
    else if (!p.issue) {
      const current = rest ? quote!.last! : l.entry;
      const gross = realizedGross + l.side * rest * (current - l.entry) * l.factor;
      const commission = realizedCommission + fee(rest, l.entry, o.commission) + fee(rest, current, o.commission);
      const ddmm = realizedDdmm + fee(rest, l.entry, l.ddmm) + fee(rest, current, l.ddmm);
      p.gross! += gross; p.commission! += commission; p.ddmm! += ddmm;
      p.pending! += gross - commission - ddmm - (realizedGross - realizedCommission - realizedDdmm);
    }
    currencies.set(currency, p);
  }
  return [...currencies.values()].map(p => ({ ...p, net: p.issue ? undefined : p.realized + p.pending! }));
}
export function currentRatio(o: RatioOperation, quotes: Record<string, TradingQuote>): number | undefined {
  const a = quotes[o.legs[0].instrument.id], b = quotes[o.legs[1].instrument.id];
  return !a?.issue && !b?.issue && positive(a?.last) && positive(b?.last) ? a.last / b.last : undefined;
}
export function spreadAt(priceA?: number, priceB?: number, priceC?: number, divisor?: 100) {
  if (!positive(priceA) || !positive(priceB) || !positive(priceC)) return undefined;
  return calculateRatio({ last: priceA }, { last: priceB }, { last: priceC / (divisor ?? 1) }).ratio;
}
export function currentSpread(o: RatioOperation, quotes: Record<string, TradingQuote>): number | undefined {
  if (!o.reference) return;
  const c = referenceCQuote(quotes, { c: o.reference.instrument, cDivisor: o.reference.divisor });
  return calculateRatio(quotes[o.legs[0].instrument.id], quotes[o.legs[1].instrument.id], c).ratio;
}
export function closeMetrics(o: RatioOperation, close: RecordedClose) {
  const a = close.entries.find(entry => entry.leg === 0)?.price, b = close.entries.find(entry => entry.leg === 1)?.price;
  const priceC = close.entries.find(entry => entry.leg === 2)?.price ?? close.entries.find(entry => entry.referencePrice !== undefined)?.referencePrice;
  const ratio = positive(a) && positive(b) ? a / b : undefined;
  return { priceC, ratio: positive(ratio) ? ratio : undefined, spread: spreadAt(a, b, priceC, o.reference?.divisor) };
}
export function dailyPriceChange(quote?: TradingQuote): number | undefined {
  if (quote?.issue || !positive(quote?.last) || !positive(quote?.reference)) return;
  const change = (quote.last / quote.reference - 1) * 100;
  return finite(change) ? change : undefined;
}
export function bestBookPrice(quote: TradingQuote | undefined, side: "bid" | "ask"): number | undefined {
  if (quote?.issue) return;
  const level = quote?.depth ? quote.depth[0]?.[side] : quote?.[side];
  return positive(level?.price) && positive(level?.size) ? level.price : undefined;
}
export function validInstrument(value: unknown): value is TradingInstrument {
  if (!value || typeof value !== "object") return false;
  const i = value as TradingInstrument;
  return text(i.id) && text(i.symbol) && text(i.market) && text(i.currency) && text(i.settlement) && typeof i.cfi === "string" && i.cfi.length <= 12 &&
    (i.monitorOnly === undefined || typeof i.monitorOnly === "boolean") && (i.amountFactor === undefined || positive(i.amountFactor)) && (i.quantityStep === undefined || quantity(i.quantityStep)) && ["nominales", "contratos", "unidades"].includes(i.quantityUnit);
}
export function validateBook(value: unknown): TradingBook {
  if (!value || typeof value !== "object") throw Error("Registro de ratios inválido; no se reemplazó el guardado.");
  const b = value as TradingBook;
  if (![1, 2, 3, 4].includes(b.schema) || b.watchDefaults !== undefined && b.watchDefaults !== 1 || typeof b.revision !== "string" || b.revision.length > 80 || !Array.isArray(b.watch) || b.watch.length > MAX_WATCH ||
    !Array.isArray(b.operations) || b.operations.length > MAX_OPERATIONS || new Set(b.operations.map(o => o?.id)).size !== b.operations.length ||
    new Set(b.watch.map(p => p?.id)).size !== b.watch.length ||
    b.watch.some(p => !text(p?.id) || !validInstrument(p.a) || !validInstrument(p.b) || p.a.id === p.b.id ||
      p.c !== undefined && (b.schema < 2 || !validInstrument(p.c)) ||
      p.cDivisor !== undefined && (b.schema < 3 || !p.c || p.cDivisor !== 100)) ||
    new Set(b.watch.map(pairKey)).size !== b.watch.length) throw Error("Registro de ratios inválido; no se reemplazó el guardado.");
  if (b.schema < 4 && b.operations.some(o => o?.reference !== undefined)) throw Error("El registro de ratios con referencia C necesita el esquema 4.");
  b.operations.forEach(validateOperation); return b;
}
