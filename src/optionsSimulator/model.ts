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
}
export interface Simulation {
  underlying: string;
  currency: "ARS" | "USD";
  spot: string;
  valuationDate: string;
  expiry: string;
  scenarioDate: string;
  rate: string;
  dividendYield: string;
  multiplier: string;
  costs: string;
  volatilityShift: string;
  rangeMin: string;
  rangeMax: string;
  legs: Leg[];
}
export interface ParsedLeg {
  kind: OptionKind; side: Side; strike: number; premium: number; contracts: number; volatility: number;
}
export interface Strategy {
  legs: ParsedLeg[];
  multiplier: number; costs: number; spot: number; years: number; rate: number; dividendYield: number;
  rangeMin: number; rangeMax: number;
}
export const MAX_LEGS = 16;
export const MAX_CONTRACTS = 1e10;
const dayMs = 86_400_000;

// Decimal comma and decimal point are accepted; grouping separators are deliberately rejected.
export function numeric(value: string): number {
  return /^-?\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : NaN;
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

export function parseSimulation(input: Simulation): { ok: true; strategy: Strategy } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const read = (value: string, label: string, min: number, max: number, integer = false) => {
    const result = numeric(value);
    if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result)))
      errors.push(`${label}: ingresá ${integer ? "un entero" : "un número"} entre ${min} y ${max}, sin separadores de miles.`);
    return result;
  };
  const spot = read(input.spot, "Precio del subyacente", .000001, 1e9);
  const multiplier = read(input.multiplier, "Factor monetario por contrato", .000001, 100000);
  const costs = read(input.costs, "Gastos de entrada", 0, 1e12);
  const rate = read(input.rate, "Tasa anual", -100, 1000) / 100;
  const dividendYield = read(input.dividendYield, "Dividendos anuales", 0, 100) / 100;
  const shift = read(input.volatilityShift, "Cambio de VI", -500, 500);
  const rangeMin = read(input.rangeMin, "Precio mínimo del gráfico", 0, 1e9);
  const rangeMax = read(input.rangeMax, "Precio máximo del gráfico", .000001, 1e9);
  if (rangeMin >= rangeMax) errors.push("El precio máximo del gráfico debe superar al mínimo.");
  const valuation = dateDay(input.valuationDate), expiry = dateDay(input.expiry), scenario = dateDay(input.scenarioDate);
  if (![valuation, expiry, scenario].every(Number.isFinite)) errors.push("Completá las tres fechas con días válidos.");
  else if (expiry < valuation || scenario < valuation || scenario > expiry || expiry - valuation > 3650)
    errors.push("La fecha teórica debe estar entre la fecha de entrada y el vencimiento (hasta 10 años).");
  if (!input.underlying.trim()) errors.push("Indicá un subyacente común para todas las patas.");
  if (!input.legs.length || input.legs.length > MAX_LEGS) errors.push(`Armá una estrategia de 1 a ${MAX_LEGS} patas.`);
  const legs = input.legs.map((leg, index): ParsedLeg => {
    const prefix = `Pata ${index + 1}`;
    if (!["call", "put"].includes(leg.kind) || !["buy", "sell"].includes(leg.side)) errors.push(`${prefix}: elegí tipo y sentido válidos.`);
    // Missing native VI blocks the theoretical curve, but expiry needs no volatility.
    const volatility = leg.volatility.trim() === "" ? NaN : read(leg.volatility, `${prefix}, VI`, 0, 500) + shift;
    if (volatility < 0 || volatility > 500) errors.push(`${prefix}: la VI más el cambio debe estar entre 0% y 500%.`);
    return { kind: leg.kind, side: leg.side, strike: read(leg.strike, `${prefix}, strike`, .000001, 1e9),
      premium: read(leg.premium, `${prefix}, prima`, 0, 1e9), contracts: read(leg.contracts, `${prefix}, contratos`, 1, MAX_CONTRACTS, true),
      volatility: volatility / 100 };
  });
  const exposure = legs.reduce((sum, leg) => sum + leg.contracts * multiplier * Math.max(spot, rangeMax, leg.strike, leg.premium), costs);
  if (exposure > Number.MAX_SAFE_INTEGER) errors.push("Reducí precios o cantidades: el importe total supera la precisión admitida.");
  return errors.length ? { ok: false, errors } : { ok: true, strategy: { legs, multiplier, costs, spot,
    years: (expiry - scenario) / 365, rate, dividendYield, rangeMin, rangeMax } };
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
/** European BSM theta per calendar day and premium unit; undefined at expiry/zero VI. */
export function theoreticalTheta(kind: OptionKind, spot: number, strike: number, years: number, volatility: number, rate: number, dividendYield: number): number | undefined {
  if (![spot, strike, years, volatility, rate, dividendYield].every(Number.isFinite) || spot <= 0 || strike <= 0 || years <= 0 || volatility <= 0) return;
  const sqrt = Math.sqrt(years), d1 = (Math.log(spot / strike) + (rate - dividendYield + volatility * volatility / 2) * years) / (volatility * sqrt);
  const d2 = d1 - volatility * sqrt, sign = kind === "call" ? 1 : -1;
  const discountedSpot = spot * Math.exp(-dividendYield * years), discountedStrike = strike * Math.exp(-rate * years);
  const density = Math.exp(-.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const theta = (-discountedSpot * density * volatility / (2 * sqrt) + sign * dividendYield * discountedSpot * normalCdf(sign * d1)
    - sign * rate * discountedStrike * normalCdf(sign * d2)) / 365;
  return Number.isFinite(theta) ? theta : undefined;
}
const direction = (leg: ParsedLeg) => leg.side === "buy" ? 1 : -1;
export function entryCost(strategy: Strategy): number {
  return strategy.costs + strategy.legs.reduce((sum, leg) => sum + direction(leg) * leg.contracts * strategy.multiplier * leg.premium, 0);
}
export function resultAt(strategy: Strategy, spot: number, mode: "expiry" | "theoretical"): number {
  return strategy.legs.reduce((sum, leg) => sum + direction(leg) * leg.contracts * strategy.multiplier *
    (mode === "expiry" ? intrinsic(leg.kind, spot, leg.strike) : theoreticalPrice(leg.kind, spot, leg.strike, strategy.years, leg.volatility, strategy.rate, strategy.dividendYield)), -entryCost(strategy));
}
export interface Equilibrium { from: number; to: number }
export function expirySummary(strategy: Strategy) {
  const knots = [...new Set([0, ...strategy.legs.map(leg => leg.strike)])].sort((a, b) => a - b);
  const values = knots.map(price => resultAt(strategy, price, "expiry"));
  // Integer quantities cancel exactly before applying a potentially fractional factor.
  const slope = strategy.legs.filter(leg => leg.kind === "call").reduce((sum, leg) => sum + direction(leg) * leg.contracts, 0) * strategy.multiplier;
  // Bound rounding relative to the actual terms, so tiny valid losses remain losses.
  const zeros = values.map((value, index) => Math.abs(value) <= Number.EPSILON * 32 * (Math.abs(strategy.costs) + strategy.legs.reduce((sum, leg) =>
    sum + leg.contracts * strategy.multiplier * (intrinsic(leg.kind, knots[index], leg.strike) + leg.premium), 0)));
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
export function curve(strategy: Strategy) {
  const prices = [...new Set([strategy.rangeMin, strategy.rangeMax, strategy.spot,
    ...strategy.legs.map(leg => leg.strike), ...expirySummary(strategy).equilibria.flatMap(point => [point.from, point.to]),
    ...Array.from({ length: 201 }, (_, index) => strategy.rangeMin + (strategy.rangeMax - strategy.rangeMin) * index / 200)])]
    .filter(price => price >= strategy.rangeMin && price <= strategy.rangeMax).sort((a, b) => a - b);
  return prices.map(price => ({ price, expiry: resultAt(strategy, price, "expiry"), theoretical: resultAt(strategy, price, "theoretical") }));
}
