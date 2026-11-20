import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyBook, type TradingInstrument } from "./trading";
import { readTradingBook, saveTradingBook, tradingStorageKey } from "./tradingStorage";
let stored: Record<string, unknown>, writes: number;
beforeEach(() => {
  stored = {}; writes = 0;
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_key: string, fn: () => Promise<unknown>) => { const next = queue.then(fn); queue = next.then(() => undefined, () => undefined); return next; } } });
  vi.stubGlobal("chrome", { storage: { local: { get: async (key: string) => structuredClone({ [key]: stored[key] }), set: async (v: Record<string, unknown>) => { writes++; Object.assign(stored, structuredClone(v)); } } } });
});
afterEach(() => vi.unstubAllGlobals());
const key = tradingStorageKey("a".repeat(64));
it("versions composite books so old clients reject them and reads existing two-price books", async () => {
  const i = (id: string): TradingInstrument => ({ id, symbol: id, market: "bm", currency: "ARS", settlement: "2", cfi: "DBXXXX", quantityUnit: "nominales" });
  const base = emptyBook(), pair = { id: "spread", a: i("AL30"), b: i("AL30D"), c: i("official") };
  const saved = await saveTradingBook(key, base, { ...base, watch: [pair] }, async () => {});
  expect(saved.schema).toBe(2); expect((await readTradingBook(key)).watch[0].c).toEqual(pair.c);
  const legacy = { ...base, watch: [{ id: pair.id, a: pair.a, b: pair.b }] };
  await expect(saveTradingBook(key, legacy, legacy, async () => {})).rejects.toThrow(/Otra pestaña/);
  const cleared = await saveTradingBook(key, saved, { ...saved, watch: [] }, async () => {});
  expect(cleared.schema).toBe(1);
});
it("persists revisions and isolates local books by opaque account scope", async () => {
  const b = await readTradingBook(key), saved = await saveTradingBook(key, b, b, async () => {});
  expect(saved.revision).not.toBe(""); expect(await readTradingBook(key)).toEqual(saved);
  expect(await readTradingBook(tradingStorageKey("b".repeat(64)))).toEqual(emptyBook());
  expect(() => tradingStorageKey("raw-account")).toThrow();
});
it("serializes competing writers and rejects stale revisions without overwriting", async () => {
  const base = emptyBook();
  const result = await Promise.allSettled([saveTradingBook(key, base, base, async () => {}), saveTradingBook(key, base, base, async () => {})]);
  expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(writes).toBe(1);
});
it("checks context again immediately before a write and preserves corrupt or failed storage", async () => {
  let checks = 0;
  await expect(saveTradingBook(key, emptyBook(), emptyBook(), async () => { if (++checks === 2) throw Error("account changed"); })).rejects.toThrow("account changed"); expect(writes).toBe(0);
  stored[key] = { schema: 99 };
  await expect(saveTradingBook(key, emptyBook(), emptyBook(), async () => {})).rejects.toThrow(); expect(writes).toBe(0);
  stored = {}; vi.stubGlobal("navigator", {});
  await expect(saveTradingBook(key, emptyBook(), emptyBook(), async () => {})).rejects.toThrow(/coordinar/); expect(writes).toBe(0);
});
