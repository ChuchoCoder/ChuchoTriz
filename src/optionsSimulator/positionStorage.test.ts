import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { PositionAccountingConflict, positionStorageKey, positionStorageSalt, premiumNeedsReview, readPositionAccounting, readUnderlyingCost, reconcileUnderlyingCost,
  savePositionAccounting, saveUnderlyingCost, underlyingCostStorageKey } from "./positionStorage";
import { importPosition, type PositionSnapshot } from "./positions";
import { addDays, initialSimulation, localDate, type Simulation } from "./model";
import type { Contract } from "./market";

const expiration = addDays(localDate(), 30).replaceAll("-", "");
const contract: Contract = { id: "C100", symbol: "DEMO C100", underlyingId: "DEMO", kind: "call", strike: 100,
  expiration, currency: "ARS", strikeCurrency: "ARS", settlement: "2", factor: 100 };
const snapshot = (quantity = 2, scope = "a".repeat(64)): PositionSnapshot => ({ contextId: "demo", storageScope: scope,
  capturedAt: Date.now(), reportedAt: Date.now(), positions: [{ securityId: contract.id, quantity }] });
const draft = () => importPosition(snapshot(), [contract], undefined, { ...initialSimulation(), legs: [] }, "DEMO", 100);
const keyFor = (input: Simulation) => input.position!.storage!.key;
const save = (input: Simulation) => savePositionAccounting(input.position!.storage!, input.position!.legs, input.costs, input.realized);
let stored: Record<string, unknown>;
beforeEach(() => {
  stored = {};
  vi.stubGlobal("chrome", { storage: { local: {
    get: vi.fn(async () => structuredClone(stored)),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(stored, structuredClone(values)); }),
  } } });
});
afterEach(() => vi.unstubAllGlobals());

it("restores historical costs after a fresh session without restoring proposed adjustments or scenarios", async () => {
  const input = draft(); input.position!.legs[0].premium = "8.125"; input.costs = "42.50"; input.realized = "-125.75";
  input.legs = [{ ...input.position!.legs[0], id: 1, premium: "99" }];
  await save(input);
  const saved = await readPositionAccounting(keyFor(input));
  const next = importPosition({ ...snapshot(), contextId: "fresh-page" }, [contract], undefined, initialSimulation(), "DEMO", 100, saved);
  expect(next.position!.legs[0].premium).toBe("8.125");
  expect(next.costs).toBe("42.50"); expect(next.realized).toBe("-125.75"); expect(next.legs).toEqual([]);
  expect(JSON.stringify(saved)).not.toContain("symbol");
});
it("isolates accounts, expiries, currencies, settlement, underlying and factors", async () => {
  const input = draft(); input.position!.legs[0].premium = "0"; input.realized = "0";
  await save(input);
  const key = keyFor(input);
  for (const other of [positionStorageKey("b".repeat(64), contract),
    ...[{ expiration: "20991218" }, { currency: "USD" as const }, { settlement: "1" }, { underlyingId: "OTHER" }, { factor: 1 }]
      .map(change => positionStorageKey("a".repeat(64), { ...contract, ...change }))]) {
    expect(other).not.toBe(key); expect(await readPositionAccounting(other)).toBeUndefined();
  }
  expect((await readPositionAccounting(key))?.legs[0].premium).toBe("0");
});
it("stores underlying cost per account, ticker and currency across option expiries", async () => {
  const scope = "a".repeat(64);
  const key = underlyingCostStorageKey(scope, contract);
  const session = { key };
  await saveUnderlyingCost(session, 100, "123.45");
  const saved = await readUnderlyingCost(underlyingCostStorageKey(scope, { ...contract, expiration: "20991218", factor: 1 }));
  expect(saved).toMatchObject({ quantity: 100, averageCost: "123.45" });
  expect(await readUnderlyingCost(underlyingCostStorageKey("b".repeat(64), contract))).toBeUndefined();
  expect(await readUnderlyingCost(underlyingCostStorageKey(scope, { ...contract, underlyingId: "OTHER" }))).toBeUndefined();
  await saveUnderlyingCost(session, 100, "125");
  await expect(saveUnderlyingCost({ key, revision: saved!.revision }, 100, "124")).rejects.toBeInstanceOf(PositionAccountingConflict);
  const closed = await reconcileUnderlyingCost(key, 0, await readUnderlyingCost(key));
  expect(closed).toMatchObject({ quantity: 0, averageCost: "" });
  const reopened = await reconcileUnderlyingCost(key, 100, closed);
  expect(reopened).toMatchObject({ quantity: 100, averageCost: "" });
});
it("preserves pending quantity review through writes and repeated imports until explicitly confirmed", async () => {
  const input = draft(); input.position!.legs[0].premium = "8";
  await save(input);
  const changed = importPosition(snapshot(3), [contract], undefined, initialSimulation(), "DEMO", 100,
    await readPositionAccounting(keyFor(input)));
  expect(changed.position!.legs[0].premium).toBe("8"); expect(premiumNeedsReview(changed.position!.legs[0])).toBe(true);
  await save(changed);
  const again = importPosition(snapshot(3), [contract], undefined, initialSimulation(), "DEMO", 100,
    await readPositionAccounting(keyFor(input)));
  expect(premiumNeedsReview(again.position!.legs[0])).toBe(true);
  const back = importPosition(snapshot(2), [contract], undefined, initialSimulation(), "DEMO", 100,
    await readPositionAccounting(keyFor(input)));
  expect(premiumNeedsReview(back.position!.legs[0])).toBe(true);
  again.position!.legs[0].premiumQuantity = "3";
  again.position!.legs[0].premiumReviewPending = false;
  await save(again);
  expect(premiumNeedsReview((await readPositionAccounting(keyFor(input)))!.legs[0])).toBe(false);
});
it("clears premiums on side reversals and warns even after restoration", async () => {
  const input = draft(); input.position!.legs[0].premium = "8";
  await save(input);
  const next = importPosition(snapshot(-2), [contract], undefined, initialSimulation(), "DEMO", 100,
    await readPositionAccounting(keyFor(input)));
  expect(next.position!.legs[0].premium).toBe(""); expect(premiumNeedsReview(next.position!.legs[0])).toBe(true);
});
it("prefers the current edited accounting over an older saved record", () => {
  const input = draft(); input.position!.legs[0].premium = "9"; input.costs = "40";
  const next = importPosition(snapshot(), [contract], undefined, input, "DEMO", 100, { version: 1, revision: "old", costs: "1", realized: "0", legs: [] });
  expect(next.costs).toBe("40"); expect(next.position!.legs[0].premium).toBe("9");
});
it("serializes slow writes and reads the latest pending edit", async () => {
  let release!: () => void;
  const original = chrome.storage.local.set;
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(values => new Promise<void>(resolve => {
    release = () => { Object.assign(stored, structuredClone(values)); resolve(); };
  }));
  const input = draft(); input.position!.legs[0].premium = "1";
  const first = save(input);
  input.position!.legs[0].premium = "2";
  const second = save(input);
  let read = false;
  const latest = readPositionAccounting(keyFor(input)).then(value => { read = true; return value; });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(read).toBe(false); expect(original).toHaveBeenCalledTimes(1);
  release(); await first; await second;
  expect((await latest)?.legs[0].premium).toBe("2");
});
it("rejects stale writers from another tab without overwriting newer historical entries", async () => {
  const first = draft(); first.position!.legs[0].premium = "8"; await save(first);
  const second = importPosition({ ...snapshot(), contextId: "other-tab" }, [contract], undefined, initialSimulation(), "DEMO", 100,
    await readPositionAccounting(keyFor(first)));
  await save(second); // No changes, so the stored revision remains the same.
  first.position!.legs[0].premium = "9"; await save(first);
  second.realized = "500";
  await expect(save(second)).rejects.toBeInstanceOf(PositionAccountingConflict);
  expect((await readPositionAccounting(keyFor(first)))?.legs[0].premium).toBe("9");
  expect((await readPositionAccounting(keyFor(first)))?.realized).toBe("");
});
it("reports storage errors and refuses malformed records or invalid edits", async () => {
  const input = draft(), key = keyFor(input);
  stored[key] = { version: 1, revision: "bad-record", costs: "0", realized: "0", legs: [null] };
  await expect(readPositionAccounting(key)).rejects.toThrow(/requieren revisión/);
  stored[key] = undefined;
  input.costs = "-1";
  await expect(save(input)).rejects.toThrow(/Revisá/);
  input.costs = "0";
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(Error("unavailable"));
  await expect(save(input)).rejects.toThrow();
  await expect(save(input)).resolves.toBeUndefined();
});
it("reuses the random profile salt and never regenerates it on subsequent reads", async () => {
  vi.stubGlobal("location", { origin: "https://fixture.test" });
  const first = await positionStorageSalt(), second = await positionStorageSalt();
  expect(first).toMatch(/^[a-f0-9]{64}$/); expect(second).toBe(first);
  expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
});
