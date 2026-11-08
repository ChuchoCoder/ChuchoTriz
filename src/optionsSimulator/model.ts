export type OptionKind = "call" | "put";
export type Side = "buy" | "sell";
export interface Leg {
  id: number;
  securityId?: string;
  symbol?: string;
  kind: OptionKind;
  side: Side;
  strike: string;
  premium: string;
  contracts: string;
  volatility: string;
  /** Signed native quantity when the user last reviewed the historical premium. */
  premiumQuantity?: string;
  premiumReviewPending?: boolean;
}
export interface PositionStorageSession { key: string; revision?: string }
export interface UnderlyingHolding {
  quantity: number;
  averageCost: string;
  storage?: PositionStorageSession;
  costEdited?: boolean;
  costStorageUnavailable?: boolean;
}
export interface Simulation {
  underlying: string;
  currency: "ARS" | "USD";
  spot: string;
  marketSpotMissing?: boolean;
  valuationDate: string;
  expiry: string;
  scenarioDate: string;
  rate: string;
  dividendYield: string;
  multiplier: string;
  costs: string;
  realized?: string;
  adjustmentCosts?: string;
  position?: { legs: Leg[]; underlying?: UnderlyingHolding; nominalOverride?: Pick<UnderlyingHolding, "quantity" | "averageCost">; underlyingUnavailable?: boolean;
    capturedAt?: number; reportedAt?: number; contextId?: string; storage?: PositionStorageSession };
  volatilityShift: string;
  rangeMin?: string;
  rangeMax?: string;
  legs: Leg[];
}
export interface ParsedLeg {
  kind: OptionKind; side: Side; strike: number; premium: number; contracts: number; volatility: number;
}
export interface Strategy {
  legs: ParsedLeg[];
  underlying?: { quantity: number; averageCost: number };
  multiplier: number; costs: number; spot: number; years: number; rate: number; dividendYield: number;
  rangeMin: number; rangeMax: number;
  realized?: number;
}
/** Historical position and prospective trades remain separate in the draft. */
export function simulationLegs(input: Simulation): Leg[] {
  return [...(input.position?.legs ?? []), ...input.legs];
}
export function underlyingExposure(position: Simulation["position"]) {
  return position?.nominalOverride ?? position?.underlying;
}
export const MAX_LEGS = 16;
export const MAX_CONTRACTS = 1e10;
const dayMs = 86_400_000;

// Decimal comma and decimal point are accepted; grouping separators are deliberately rejected.
export function numeric(value: string): number {
  return /^-?\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : NaN;
}
export function parseSignedQuantity(value: string): number | undefined {
  const raw = value.trim().replace(/^−/, "-");
  const quantity = raw === "" ? 0 : /^[+-]?\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(quantity) && Math.abs(quantity) <= MAX_CONTRACTS ? quantity : undefined;
}
export function dateDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed / dayMs : NaN;
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function daysToExpiry(expiry: string, today = localDate()): number | undefined {
  const days = dateDay(expiry) - dateDay(today);
  return Number.isFinite(days) ? days : undefined;
}
export function addDays(date: string, days: number): string {
  return new Date((dateDay(date) + days) * dayMs).toISOString().slice(0, 10);
}
export function newLeg(id: number, spot = 100): Leg {
  return { id, kind: "call", side: "buy", strike: String(spot), premium: "5", contracts: "1", volatility: "40" };
}
export type Example = "bull-call" | "bear-put" | "straddle" | "butterfly" | "iron-condor";
export function exampleLegs(example: Example): Leg[] {
  const leg = (id: number, kind: OptionKind, side: Side, strike: number, premium: number, contracts = 1): Leg =>
    ({ ...newLeg(id), kind, side, strike: String(strike), premium: String(premium), contracts: String(contracts) });
  switch (example) {
    case "bull-call": return [leg(1, "call", "buy", 100, 7), leg(2, "call", "sell", 110, 3)];
    case "bear-put": return [leg(1, "put", "buy", 100, 7), leg(2, "put", "sell", 90, 3)];
    case "straddle": return [leg(1, "call", "buy", 100, 6), leg(2, "put", "buy", 100, 5)];
    case "butterfly": return [leg(1, "call", "buy", 90, 13), leg(2, "call", "sell", 100, 6, 2), leg(3, "call", "buy", 110, 2)];
    case "iron-condor": return [leg(1, "put", "buy", 80, 1), leg(2, "put", "sell", 90, 3), leg(3, "call", "sell", 110, 3), leg(4, "call", "buy", 120, 1)];
  }
}
export function initialSimulation(today = localDate()): Simulation {
  return { underlying: "EJEMPLO", currency: "ARS", spot: "100", valuationDate: today,
    expiry: addDays(today, 30), scenarioDate: today, rate: "0", dividendYield: "0", multiplier: "100", costs: "0",
    volatilityShift: "0", rangeMin: "60", rangeMax: "140", legs: exampleLegs("bull-call") };
}

function maximumChartPrice(legs: ParsedLeg[], multiplier: number, costs: number, realized = 0, nominalQuantity = 0) {
  const contracts = legs.reduce((sum, leg) => sum + leg.contracts, 0);
  return Math.min(1e9, (Number.MAX_SAFE_INTEGER - costs - Math.abs(realized)) / (contracts * multiplier + Math.abs(nominalQuantity)));
}

type PositionCorrection = "chain" | "volatility";

export function parseSimulation(input: Simulation): { ok: true; strategy: Strategy } | { ok: false; errors: string[]; positionCorrections: ReadonlySet<PositionCorrection> } {
  const errors: string[] = [];
  const positionCorrections = new Set<PositionCorrection>();
  const report = (message: string, correction?: PositionCorrection) => {
    errors.push(message);
    if (correction) positionCorrections.add(correction);
  };
  const read = (value: string, label: string, min: number, max: number,
    { integer = false, correction }: { integer?: boolean; correction?: PositionCorrection } = {}) => {
    const result = numeric(value);
    if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result)))
      report(`${label}: ingresá ${integer ? "un entero" : "un número"} entre ${min} y ${max}, sin separadores de miles.`, correction);
    return result;
  };
  const accounting = input.position ? "chain" : undefined;
  const spot = read(input.spot, "Precio del subyacente", .000001, 1e9);
  const multiplier = read(input.multiplier, "Factor monetario por contrato", .000001, 100000);
  const entryCosts = read(input.costs, input.position ? "Gastos de la posición" : "Gastos de entrada", 0, 1e12, { correction: accounting });
  const adjustmentCosts = input.position && input.legs.length && input.adjustmentCosts !== undefined
    ? read(input.adjustmentCosts, "Gastos de los ajustes", 0, 1e12) : 0;
  const costs = entryCosts + adjustmentCosts;
  const realized = !input.realized?.trim() ? 0 : read(input.realized, "Resultado realizado neto", -1e12, 1e12, { correction: accounting });
  const rate = read(input.rate, "Tasa anual", -100, 1000) / 100;
  const dividendYield = read(input.dividendYield, "Dividendos anuales", 0, 100) / 100;
  const shift = read(input.volatilityShift, "Cambio de VI", -500, 500);
  const rangeMin = input.rangeMin === undefined ? spot * .75 : read(input.rangeMin, "Precio mínimo del gráfico", 0, 1e9);
  const explicitMax = input.rangeMax === undefined ? undefined : read(input.rangeMax, "Precio máximo del gráfico", .000001, 1e9);
  const valuation = dateDay(input.valuationDate), expiry = dateDay(input.expiry), scenario = dateDay(input.scenarioDate);
  if (![valuation, expiry, scenario].every(Number.isFinite)) errors.push("Completá las tres fechas con días válidos.");
  else if (expiry < valuation || scenario < valuation || scenario > expiry || expiry - valuation > 3650)
    errors.push("La fecha teórica debe estar entre la fecha de entrada y el vencimiento (hasta 10 años).");
  if (!input.underlying.trim()) errors.push("Indicá un subyacente común para todas las patas.");
  const allLegs = simulationLegs(input);
  if (input.position?.underlyingUnavailable) report("No se pudieron verificar los nominales del subyacente. Revisá el reporte de Matriz y recargá la tenencia.", "chain");
  const holding = underlyingExposure(input.position);
  const underlying = holding?.quantity ? {
    quantity: read(String(holding.quantity), "Nominales del subyacente", -MAX_CONTRACTS, MAX_CONTRACTS, { integer: true, correction: "chain" }),
    averageCost: read(holding.averageCost, "Costo promedio por nominal", 0, 1e9, { correction: "chain" }),
  } : undefined;
  const historicalCount = input.position?.legs.length ?? 0;
  const tooManyHistoricalLegs = historicalCount > MAX_LEGS;
  if ((!allLegs.length && !underlying && !input.position?.underlyingUnavailable) || input.legs.length > MAX_LEGS || tooManyHistoricalLegs)
    report(`Usá hasta ${MAX_LEGS} patas de posición y ${MAX_LEGS} ajustes.`, tooManyHistoricalLegs ? "chain" : undefined);
  const legs = allLegs.map((leg, index): ParsedLeg => {
    const historical = index < historicalCount;
    const prefix = historical ? `Posición, pata ${index + 1}` : `Pata ${index + 1 - historicalCount}`;
    const correction = historical ? "chain" : undefined;
    const volatilityCorrection = historical ? "volatility" : undefined;
    if (!["call", "put"].includes(leg.kind) || !["buy", "sell"].includes(leg.side)) report(`${prefix}: elegí tipo y sentido válidos.`, correction);
    // Missing native VI blocks the theoretical curve, but expiry needs no volatility.
    const volatility = leg.volatility.trim() === "" ? NaN : read(leg.volatility, `${prefix}, VI`, 0, 500, { correction: volatilityCorrection }) + shift;
    if (volatility < 0 || volatility > 500) report(`${prefix}: la VI más el cambio debe estar entre 0% y 500%.`, volatilityCorrection);
    return { kind: leg.kind, side: leg.side, strike: read(leg.strike, `${prefix}, strike`, .000001, 1e9, { correction }),
      premium: read(leg.premium, `${prefix}, prima`, 0, 1e9, { correction }),
      contracts: read(leg.contracts, `${prefix}, contratos`, 1, MAX_CONTRACTS, { integer: true, correction }),
      volatility: volatility / 100 };
  });
  const nominalExposure = underlying ? Math.abs(underlying.quantity) * Math.max(spot, explicitMax ?? 0, underlying.averageCost) : 0;
  const addExposure = (sum: number, leg: ParsedLeg) =>
    sum + leg.contracts * multiplier * Math.max(spot, explicitMax ?? 0, leg.strike, leg.premium);
  const exposure = legs.reduce(addExposure, costs + Math.abs(realized) + nominalExposure);
  if (exposure > Number.MAX_SAFE_INTEGER) {
    const positionCausedOverflow = input.position && legs.slice(historicalCount).reduce(addExposure, adjustmentCosts) <= Number.MAX_SAFE_INTEGER;
    report("Reducí precios o cantidades: el importe total supera la precisión admitida.", positionCausedOverflow ? "chain" : undefined);
  }
  const rangeMax = explicitMax ?? Math.min(maximumChartPrice(legs, multiplier, costs, realized, underlying?.quantity), spot * 1.25);
  if (rangeMin >= rangeMax) errors.push("El precio máximo del gráfico debe superar al mínimo.");
  return errors.length ? { ok: false, errors, positionCorrections } : { ok: true, strategy: { legs, underlying, multiplier, costs, spot,
    years: (expiry - scenario) / 365, rate, dividendYield, rangeMin, rangeMax, realized } };
}

export function intrinsic(kind: OptionKind, spot: number, strike: number): number {
  return Math.max(0, kind === "call" ? spot - strike : strike - spot);
}

/** Linear expected-move approximation, using the nearest selected strikes and ACT/365. */
export function standardDeviationLevels(strategy: Strategy) {
  const distance = Math.min(...strategy.legs.map(leg => Math.abs(leg.strike - strategy.spot)));
  const nearest = strategy.legs.filter(leg => Math.abs(Math.abs(leg.strike - strategy.spot) - distance) <= Math.max(1, strategy.spot) * Number.EPSILON * 8);
  if (!nearest.length || nearest.some(leg => !Number.isFinite(leg.volatility))) return undefined;
  // Equal weight per contract identity (kind + strike), independent of side/quantity.
  const groups = new Map<string, number[]>();
  for (const leg of nearest) {
    const key = `${leg.kind}|${leg.strike}`;
    groups.set(key, [...groups.get(key) ?? [], leg.volatility]);
  }
  const volatilities = [...groups.values()].map(values => values.reduce((sum, value) => sum + value, 0) / values.length);
  const volatility = volatilities.reduce((sum, value) => sum + value, 0) / volatilities.length;
  const move = strategy.spot * volatility * Math.sqrt(strategy.years);
  return { volatility, move, strikes: [...new Set(nearest.map(leg => leg.strike))],
    levels: ([-2, -1, 1, 2] as const).map(sigma => ({ sigma, price: strategy.spot + sigma * move })) };
}
// Abramowitz & Stegun 26.2.17; absolute CDF error below 7.5e-8.
function normalCdf(x: number): number {
  const t = 1 / (1 + .2316419 * Math.abs(x));
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * t *
    (.319381530 + t * (-.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - tail : tail;
}
/** European Black–Scholes–Merton, continuous annual rate and dividend yield, ACT/365. */
export function theoreticalPrice(kind: OptionKind, spot: number, strike: number, years: number, volatility: number, rate: number, dividendYield: number): number {
  if (years === 0) return intrinsic(kind, spot, strike);
  const discountedSpot = spot * Math.exp(-dividendYield * years), discountedStrike = strike * Math.exp(-rate * years);
  if (spot === 0) return kind === "put" ? discountedStrike : 0;
  if (volatility === 0) return Math.max(0, kind === "call" ? discountedSpot - discountedStrike : discountedStrike - discountedSpot);
  const sigmaTime = volatility * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate - dividendYield + volatility * volatility / 2) * years) / sigmaTime;
  const d2 = d1 - sigmaTime;
  return Math.max(0, kind === "call" ? discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2)
    : discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1));
}
/** European BSM sensitivities per premium unit, using calendar-day theta and vega per percentage point of IV. */
export function theoreticalGreeks(kind: OptionKind, spot: number, strike: number, years: number, volatility: number, rate: number, dividendYield: number) {
  if (![spot, strike, years, volatility, rate, dividendYield].every(Number.isFinite) || spot <= 0 || strike <= 0 || years <= 0 || volatility <= 0) return;
  const sqrt = Math.sqrt(years), d1 = (Math.log(spot / strike) + (rate - dividendYield + volatility * volatility / 2) * years) / (volatility * sqrt);
  const d2 = d1 - volatility * sqrt, sign = kind === "call" ? 1 : -1;
  const discountedSpot = spot * Math.exp(-dividendYield * years), discountedStrike = strike * Math.exp(-rate * years);
  const density = Math.exp(-.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const cdfD1 = normalCdf(sign * d1), probabilityItm = normalCdf(sign * d2);
  const theta = (-discountedSpot * density * volatility / (2 * sqrt) + sign * dividendYield * discountedSpot * cdfD1
    - sign * rate * discountedStrike * probabilityItm) / 365;
  const gamma = Math.exp(-dividendYield * years) * density / spot / (volatility * sqrt);
  const vega = discountedSpot * density * sqrt / 100;
  return {
    theta: Number.isFinite(theta) ? theta : undefined,
    gamma: Number.isFinite(gamma) ? gamma : undefined,
    vega: Number.isFinite(vega) ? vega : undefined,
    theoreticalDelta: sign * Math.exp(-dividendYield * years) * cdfD1,
    probabilityItm,
    probabilityOtm: normalCdf(-sign * d2),
  };
}
const direction = (leg: ParsedLeg) => leg.side === "buy" ? 1 : -1;
export function entryCost(strategy: Strategy): number {
  const stockCost = strategy.underlying ? strategy.underlying.quantity * strategy.underlying.averageCost : 0;
  return strategy.costs + strategy.legs.reduce((sum, leg) => sum + direction(leg) * leg.contracts * strategy.multiplier * leg.premium, stockCost);
}
export function resultAt(strategy: Strategy, spot: number, mode: "expiry" | "theoretical"): number {
  const stockValue = (strategy.underlying?.quantity ?? 0) * spot;
  return strategy.legs.reduce((sum, leg) => sum + direction(leg) * leg.contracts * strategy.multiplier *
    (mode === "expiry" ? intrinsic(leg.kind, spot, leg.strike) : theoreticalPrice(leg.kind, spot, leg.strike, strategy.years, leg.volatility, strategy.rate, strategy.dividendYield)), (strategy.realized ?? 0) - entryCost(strategy) + stockValue);
}
export interface Equilibrium { from: number; to: number }
export function expirySummary(strategy: Strategy) {
  const knots = [...new Set([0, ...strategy.legs.map(leg => leg.strike)])].sort((a, b) => a - b);
  const values = knots.map(price => resultAt(strategy, price, "expiry"));
  // Integer quantities cancel exactly before applying a potentially fractional factor.
  const slope = strategy.legs.filter(leg => leg.kind === "call").reduce((sum, leg) => sum + direction(leg) * leg.contracts, 0) * strategy.multiplier + (strategy.underlying?.quantity ?? 0);
  // Bound rounding relative to the actual terms, so tiny valid losses remain losses.
  const zeros = values.map((value, index) => Math.abs(value) <= Number.EPSILON * 32 * (Math.abs(strategy.costs) + strategy.legs.reduce((sum, leg) =>
    sum + leg.contracts * strategy.multiplier * (intrinsic(leg.kind, knots[index], leg.strike) + leg.premium), Math.abs(strategy.realized ?? 0) +
    (strategy.underlying ? Math.abs(strategy.underlying.quantity) * (knots[index] + strategy.underlying.averageCost) : 0))));
  const equilibria: Equilibrium[] = [];
  const add = (from: number, to = from) => {
    const last = equilibria.at(-1);
    if (last && last.to === from) last.to = to;
    else equilibria.push({ from, to });
  };
  for (let i = 0; i < knots.length - 1; i++) {
    const [a, b] = [values[i], values[i + 1]];
    const [zeroA, zeroB] = [zeros[i], zeros[i + 1]];
    if (zeroA && zeroB) add(knots[i], knots[i + 1]);
    else {
      if (zeroA) add(knots[i]);
      if (!zeroA && !zeroB && Math.sign(a) !== Math.sign(b)) add(knots[i] - a * (knots[i + 1] - knots[i]) / (b - a));
    }
  }
  const lastPrice = knots.at(-1)!, lastValue = values.at(-1)!;
  if (slope === 0 && zeros.at(-1)) add(lastPrice, Infinity);
  else {
    if (zeros.at(-1)) add(lastPrice);
    else if (slope !== 0 && -lastValue / slope > 0) add(lastPrice - lastValue / slope);
  }
  return { entry: entryCost(strategy), maxProfit: slope > 0 ? Infinity : Math.max(0, ...values),
    maxLoss: slope < 0 ? Infinity : Math.max(0, ...values.map(value => -value)), equilibria };
}
export function chartPriceRange(strategy: Strategy, equilibria: Equilibrium[], zoom: number) {
  const limit = maximumChartPrice(strategy.legs, strategy.multiplier, strategy.costs, strategy.realized, strategy.underlying?.quantity);
  const anchors = [strategy.spot, ...strategy.legs.map(leg => leg.strike)];
  const equilibriumPrices = equilibria.flatMap(({ from, to }) => Number.isFinite(to) ? [from, to] : [from]);
  if (strategy.underlying?.quantity) {
    // A small stock slope can move a break-even far beyond the working range of the options.
    const focusMin = Math.min(strategy.rangeMin, ...anchors), focusMax = Math.max(strategy.rangeMax, ...anchors);
    const margin = (focusMax - focusMin) / 2;
    anchors.push(...equilibriumPrices.filter(price => price >= focusMin - margin && price <= focusMax + margin));
  } else {
    anchors.push(...equilibriumPrices);
  }
  const low = Math.min(...anchors), high = Math.max(...anchors);
  const padding = (strategy.rangeMax - strategy.rangeMin) * .1;
  const min = Math.max(0, Math.min(strategy.rangeMin, low - padding));
  const max = Math.min(limit, Math.max(strategy.rangeMax, high + padding));
  const span = Math.min(limit, (max - min) * 2 ** zoom);
  const rangeMin = Math.min(limit - span, Math.max(0, (min + max - span) / 2));
  return { rangeMin, rangeMax: rangeMin + span, full: span === limit };
}
export function curve(strategy: Strategy) {
  const prices = [...new Set([strategy.rangeMin, strategy.rangeMax, strategy.spot,
    ...strategy.legs.map(leg => leg.strike), ...expirySummary(strategy).equilibria.flatMap(point => [point.from, point.to]),
    ...Array.from({ length: 201 }, (_, index) => strategy.rangeMin + (strategy.rangeMax - strategy.rangeMin) * index / 200)])]
    .filter(price => price >= strategy.rangeMin && price <= strategy.rangeMax).sort((a, b) => a - b);
  return prices.map(price => ({ price, expiry: resultAt(strategy, price, "expiry"), theoretical: resultAt(strategy, price, "theoretical") }));
}
