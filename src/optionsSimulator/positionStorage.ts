import type { Leg, PositionStorageSession } from "./model";
import { MAX_CONTRACTS, MAX_LEGS, numeric } from "./model";
import type { Contract } from "./market";

const prefix = "OptionsPositionAccountingV1:";
const writes = new Map<string, Promise<void>>();
const savedRevisions = new WeakMap<PositionStorageSession, string>();
const locked = async <T>(key: string, work: () => Promise<T>): Promise<T> =>
  typeof navigator !== "undefined" && navigator.locks ? await navigator.locks.request(key, work) : work();

/** A random local salt partitions accounts without storing their raw identifiers. */
export function positionStorageSalt(): Promise<string> {
  const key = `OptionsPositionSaltV1:${location.origin}`;
  return locked(key, async () => {
    const stored = (await chrome.storage.local.get(key))[key];
    if (typeof stored === "string" && /^[a-f0-9]{64}$/.test(stored)) return stored;
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    await chrome.storage.local.set({ [key]: salt });
    return salt;
  });
}

export function positionStorageKey(scope: string, contract: Contract): string {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw Error("No se pudo identificar el guardado local de la cuenta.");
  return prefix + JSON.stringify([scope, contract.underlyingId, contract.expiration, contract.currency, contract.settlement, contract.factor]);
}

export function underlyingCostStorageKey(scope: string, contract: Contract): string {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw Error("No se pudo identificar el guardado local de la cuenta.");
  return "OptionsUnderlyingCostV1:" + JSON.stringify([scope, contract.underlyingId, contract.currency]);
}

export interface PositionAccounting {
  version: 1;
  revision: string;
  legs: Leg[];
  costs: string;
  realized: string;
}
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 80;
const numberText = (value: unknown, min: number, max: number) => text(value) &&
  (value === "" || Number.isFinite(numeric(value)) && numeric(value) >= min && numeric(value) <= max);
const legRecord = (leg: Leg) => ({ securityId: leg.securityId, kind: leg.kind, side: leg.side, strike: leg.strike,
  premium: leg.premium, contracts: leg.contracts, volatility: leg.volatility, premiumQuantity: leg.premiumQuantity,
  premiumReviewPending: leg.premiumReviewPending || undefined });
function valid(value: unknown): value is PositionAccounting {
  if (!value || typeof value !== "object") return false;
  const data = value as PositionAccounting;
  return data.version === 1 && text(data.revision) && !!data.revision && numberText(data.costs, 0, 1e12) && numberText(data.realized, -1e12, 1e12) &&
    Array.isArray(data.legs) && data.legs.length <= MAX_LEGS && new Set(data.legs.map(leg => leg?.securityId)).size === data.legs.length &&
    data.legs.every(leg => leg && text(leg.securityId) && ["call", "put"].includes(leg.kind) && ["buy", "sell"].includes(leg.side) &&
      numberText(leg.strike, 0, 1e9) && numeric(leg.strike) > 0 && numberText(leg.premium, 0, 1e9) &&
      numberText(leg.volatility, 0, 500) && text(leg.contracts) && Number.isSafeInteger(numeric(leg.contracts)) &&
      numeric(leg.contracts) > 0 && numeric(leg.contracts) <= MAX_CONTRACTS &&
      (leg.premiumReviewPending === undefined || typeof leg.premiumReviewPending === "boolean") &&
      (leg.premiumQuantity === undefined || text(leg.premiumQuantity) && Number.isSafeInteger(numeric(leg.premiumQuantity)) &&
        numeric(leg.premiumQuantity) !== 0 && Math.abs(numeric(leg.premiumQuantity)) <= MAX_CONTRACTS));
}

async function readStored(key: string): Promise<PositionAccounting | undefined> {
  const value = (await chrome.storage.local.get(key))[key];
  if (value === undefined) return;
  if (!valid(value)) throw Error("Los datos históricos guardados requieren revisión. No se reemplazó la simulación.");
  return value;
}
export async function readPositionAccounting(key: string): Promise<PositionAccounting | undefined> {
  await writes.get(key)?.catch(() => {});
  return readStored(key);
}

export class PositionAccountingConflict extends Error {}

function queueWrite(key: string, work: () => Promise<void>): Promise<void> {
  // Serialize writes so a slow previous keystroke cannot replace a later value.
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => locked(key, work));
  writes.set(key, pending);
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => {});
  return pending;
}

export interface UnderlyingCost {
  revision: string;
  quantity: number;
  averageCost: string;
}

function validUnderlyingCost(value: unknown): value is UnderlyingCost {
  if (!value || typeof value !== "object") return false;
  const cost = value as UnderlyingCost;
  return text(cost.revision) && !!cost.revision && Number.isSafeInteger(cost.quantity) && Math.abs(cost.quantity) <= MAX_CONTRACTS &&
    (cost.quantity === 0 ? cost.averageCost === "" : numberText(cost.averageCost, 0, 1e9));
}

async function readStoredUnderlyingCost(key: string): Promise<UnderlyingCost | undefined> {
  const value = (await chrome.storage.local.get(key))[key];
  if (value === undefined) return;
  if (!validUnderlyingCost(value)) throw Error("El costo guardado del subyacente requiere revisión.");
  return value;
}

export async function readUnderlyingCost(key: string): Promise<UnderlyingCost | undefined> {
  await writes.get(key)?.catch(() => {});
  return readStoredUnderlyingCost(key);
}

/** Retire the old basis even when holdings later return to the original quantity. */
export async function reconcileUnderlyingCost(key: string, quantity: number, saved?: UnderlyingCost): Promise<UnderlyingCost | undefined> {
  if (!saved || saved.quantity === quantity) return saved;
  await saveUnderlyingCost({ key, revision: saved.revision }, quantity, "");
  const current = await readUnderlyingCost(key);
  if (current?.quantity !== quantity) throw new PositionAccountingConflict();
  return current;
}

export function saveUnderlyingCost(storage: PositionStorageSession, quantity: number, averageCost: string): Promise<void> {
  const { key } = storage;
  const value = { revision: crypto.randomUUID(), quantity, averageCost };
  if (!validUnderlyingCost(value)) return Promise.reject(Error("Revisá el costo del subyacente antes de guardarlo."));
  return queueWrite(key, async () => {
    const previous = await readStoredUnderlyingCost(key);
    if (previous?.quantity === quantity && previous.averageCost === averageCost) { savedRevisions.set(storage, previous.revision); return; }
    if (previous?.revision !== (savedRevisions.get(storage) ?? storage.revision)) throw new PositionAccountingConflict();
    await chrome.storage.local.set({ [key]: value });
    savedRevisions.set(storage, value.revision);
  });
}

/** Store only the original position's accounting; proposed adjustments never overwrite it. */
export function savePositionAccounting(storage: PositionStorageSession, legs: Leg[], costs: string, realized = ""): Promise<void> {
  const { key } = storage;
  const value: PositionAccounting = { version: 1, revision: crypto.randomUUID(), costs, realized,
    legs: legs.map(leg => ({ id: leg.id, ...legRecord(leg) })) };
  if (!valid(value)) return Promise.reject(Error("Revisá los valores históricos antes de guardarlos."));
  return queueWrite(key, async () => {
    const previous = await readStored(key);
    // Removing a leg from the draft can be temporary. Keep its last cost for a reload, flagged for review.
    const removed = previous?.legs.filter(leg => !value.legs.some(current => current.securityId === leg.securityId))
      .slice(0, MAX_LEGS - value.legs.length).map(leg => ({ ...leg, premiumReviewPending: true })) ?? [];
    const active = value.legs.map(leg => {
      if (leg.premium !== "") return leg;
      const known = previous?.legs.find(item => item.securityId === leg.securityId && item.side === leg.side &&
        item.kind === leg.kind && numeric(item.strike) === numeric(leg.strike) && item.premiumReviewPending && item.premium !== "");
      return known ? { ...leg, premium: known.premium, premiumQuantity: known.premiumQuantity, premiumReviewPending: true } : leg;
    });
    const next = { ...value, legs: [...active, ...removed] };
    const unchanged = previous && previous.costs === costs && previous.realized === realized && previous.legs.length === next.legs.length &&
      next.legs.every(leg => {
        const match = previous.legs.find(item => item.securityId === leg.securityId);
        return match && JSON.stringify(legRecord(match)) === JSON.stringify(legRecord(leg));
      });
    if (unchanged) { savedRevisions.set(storage, previous.revision); return; }
    if (previous?.revision !== (savedRevisions.get(storage) ?? storage.revision)) throw new PositionAccountingConflict();
    await chrome.storage.local.set({ [key]: next });
    savedRevisions.set(storage, value.revision);
  });
}

export const signedPositionQuantity = (leg: Leg) => (leg.side === "buy" ? "" : "-") + leg.contracts;
export const premiumNeedsReview = (leg: Leg) => !!leg.premiumReviewPending ||
  leg.premiumQuantity !== undefined && numeric(leg.premiumQuantity) !== numeric(signedPositionQuantity(leg));
export const validHistoricalPremium = (value: string) => value.trim() !== "" && numberText(value, 0, 1e9);
