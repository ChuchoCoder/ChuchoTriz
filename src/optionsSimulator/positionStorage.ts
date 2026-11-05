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

/** Store only the original position's accounting; proposed adjustments never overwrite it. */
export function savePositionAccounting(storage: PositionStorageSession, legs: Leg[], costs: string, realized = ""): Promise<void> {
  const { key } = storage;
  const value: PositionAccounting = { version: 1, revision: crypto.randomUUID(), costs, realized,
    legs: legs.map(leg => ({ id: leg.id, ...legRecord(leg) })) };
  if (!valid(value)) return Promise.reject(Error("Revisá los valores históricos antes de guardarlos."));
  // Serialize writes so a slow previous keystroke cannot replace a later value.
  const pending = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(() => locked(key, async () => {
    const previous = await readStored(key);
    const unchanged = previous && previous.costs === costs && previous.realized === realized && previous.legs.length === value.legs.length &&
      value.legs.every(leg => {
        const match = previous.legs.find(item => item.securityId === leg.securityId);
        return match && JSON.stringify(legRecord(match)) === JSON.stringify(legRecord(leg));
      });
    if (unchanged) { savedRevisions.set(storage, previous.revision); return; }
    if (previous?.revision !== (savedRevisions.get(storage) ?? storage.revision)) throw new PositionAccountingConflict();
    await chrome.storage.local.set({ [key]: value });
    savedRevisions.set(storage, value.revision);
  }));
  writes.set(key, pending);
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => {});
  return pending;
}

export const signedPositionQuantity = (leg: Leg) => (leg.side === "buy" ? "" : "-") + leg.contracts;
export const premiumNeedsReview = (leg: Leg) => !!leg.premiumReviewPending ||
  leg.premiumQuantity !== undefined && numeric(leg.premiumQuantity) !== numeric(signedPositionQuantity(leg));
export const validHistoricalPremium = (value: string) => value.trim() !== "" && numberText(value, 0, 1e9);
