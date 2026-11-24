import { pairKey, ratioLabel, tickerKey, type RatioInstrument, type RatioReference } from "./model";

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
export interface RatioExit { quantity: number; price: number; at: string }
export interface TradingLeg {
  instrument: TradingInstrument; side: 1 | -1; quantity: number; entry: number;
  factor: number; step: number; ddmm: number; exits: RatioExit[];
}
export interface RatioOperation {
  id: string; openedAt: string; direction: 1 | -1; commission: number;
  fx: number; // Retained for compatibility with historical records; sizing no longer converts currencies.
  targetRatio: number | null; legs: [TradingLeg, TradingLeg];
}
export interface TradingBook { schema: 1 | 2 | 3; revision: string; watchDefaults?: 1; watch: TradingPair[]; operations: RatioOperation[] }
export function tradingBookSchema(watch: readonly TradingPair[]): TradingBook["schema"] {
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
  return { ...book, schema: tradingBookSchema(watch), watch, watchDefaults: 1 };
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
    o.targetRatio !== null && !positive(o.targetRatio) || !Array.isArray(o.legs) || o.legs.length !== 2 || o.legs[0]?.instrument?.id === o.legs[1]?.instrument?.id) throw Error("Operación de ratio inválida.");
  o.legs.forEach((l, index) => {
    if (!validInstrument(l?.instrument) || l.side !== (index === 0 ? o.direction : -o.direction) || !quantity(l.quantity) || !quantity(l.step) || l.quantity % l.step !== 0 ||
      isMonitorOnly(l.instrument) || !positive(l.entry) || !positive(l.factor) || !rate(l.ddmm) || l.quantity * l.entry * l.factor > 1e15 || !Array.isArray(l.exits) || l.exits.length > 1000) throw Error("Revisá precios, factores, lotes, cantidades y DDMM de ambas patas. Las tasas TNA y referencias sólo se monitorean.");
    let at = Date.parse(o.openedAt);
    for (const e of l.exits) {
      if (!quantity(e?.quantity) || e.quantity % l.step !== 0 || !positive(e.price) || e.quantity * e.price * l.factor > 1e15 || !date(e.at) || Date.parse(e.at) < at || Date.parse(e.at) > Date.now()) throw Error("Los cierres registrados son inválidos.");
      at = Date.parse(e.at);
    }
    if (closedQuantity(l) > l.quantity) throw Error("La cantidad total no puede ser menor que la cantidad ya cerrada.");
  });
}
export function correctOperation(previous: RatioOperation, next: RatioOperation): RatioOperation {
  if (isClosed(previous) || next.id !== previous.id) throw Error("Sólo se puede editar una operación abierta.");
  if (previous.legs.some(l => l.exits.length) && (previous.direction !== next.direction || previous.legs.some((l, i) =>
    l.instrument.id !== next.legs[i].instrument.id || l.factor !== next.legs[i].factor || l.step !== next.legs[i].step))) throw Error("Con cierres registrados se conservan instrumentos, sentido y unidades de cotización.");
  const result: RatioOperation = { ...next, legs: next.legs.map((l, i) => ({ ...l, exits: structuredClone(previous.legs[i].exits) })) as RatioOperation["legs"] };
  validateOperation(result); return result;
}
export function closeOperation(o: RatioOperation, fraction: number, prices: [number, number], at: string): RatioOperation {
  if (isClosed(o) || ![.25, .5, 1].includes(fraction) || !prices.every(positive)) throw Error("Revisá los dos precios de cierre.");
  const quantities = o.legs.map(l => {
    const q = fraction === 1 ? remaining(l) : Math.floor(remaining(l) * fraction / l.step) * l.step;
    if (q <= 0 && fraction !== 1) throw Error("El cierre parcial debe alcanzar al menos un lote de cada pata.");
    return q;
  }) as [number, number];
  return recordClose(o, quantities, prices, at);
}
/** Preserve the open quantities' proportion, independently of currency or current prices. */
export function partialCloseQuantities(o: RatioOperation, leg: 0 | 1, amount: number): [number, number] {
  validateOperation(o);
  if (![0, 1].includes(leg) || isClosed(o)) throw Error("La operación ya está cerrada o la pata no es válida.");
  const source = o.legs[leg], other = o.legs[1 - leg], rest = remaining(source), otherRest = remaining(other);
  if (!quantity(amount) || amount % source.step !== 0) throw Error(`Ingresá una cantidad positiva, múltiplo de ${source.step}, en la pata ${leg === 0 ? "A" : "B"}.`);
  if (amount > rest) throw Error("La cantidad a cerrar supera el remanente de esa pata.");
  const calculated = amount === rest ? otherRest : Math.round((amount / rest) * (otherRest / other.step)) * other.step;
  if (otherRest > 0 && calculated === 0) throw Error("El cierre debe alcanzar al menos un lote de la otra pata.");
  return leg === 0 ? [amount, calculated] : [calculated, amount];
}
export function closeOperationByQuantity(o: RatioOperation, leg: 0 | 1, amount: number, prices: [number, number], at: string): RatioOperation {
  return recordClose(o, partialCloseQuantities(o, leg, amount), prices, at);
}
function recordClose(o: RatioOperation, quantities: [number, number], prices: [number, number], at: string): RatioOperation {
  if (!prices.every(positive)) throw Error("Revisá los dos precios de cierre.");
  const legs = o.legs.map((l, i) => {
    const q = quantities[i];
    if (q === 0) return l;
    return { ...l, exits: [...l.exits, { quantity: q, price: prices[i], at }] };
  }) as RatioOperation["legs"];
  const result = { ...o, legs }; validateOperation(result); return result;
}
export interface CurrencyPnl { currency: string; realized: number; pending?: number; net?: number; gross?: number; commission?: number; ddmm?: number; issue?: string }
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
      positive(quote?.amountFactor) && quote.amountFactor !== l.factor ? "Cambió la unidad de cotización; revisá la operación." : undefined) : undefined;
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
  if (![1, 2, 3].includes(b.schema) || b.watchDefaults !== undefined && b.watchDefaults !== 1 || typeof b.revision !== "string" || b.revision.length > 80 || !Array.isArray(b.watch) || b.watch.length > MAX_WATCH ||
    !Array.isArray(b.operations) || b.operations.length > MAX_OPERATIONS || new Set(b.operations.map(o => o?.id)).size !== b.operations.length ||
    new Set(b.watch.map(p => p?.id)).size !== b.watch.length ||
    b.watch.some(p => !text(p?.id) || !validInstrument(p.a) || !validInstrument(p.b) || p.a.id === p.b.id ||
      p.c !== undefined && (b.schema < 2 || !validInstrument(p.c)) ||
      p.cDivisor !== undefined && (b.schema !== 3 || !p.c || p.cDivisor !== 100)) ||
    new Set(b.watch.map(pairKey)).size !== b.watch.length) throw Error("Registro de ratios inválido; no se reemplazó el guardado.");
  b.operations.forEach(validateOperation); return b;
}
