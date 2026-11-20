import { emptyBook, validateBook, type TradingBook } from "./trading";

export const tradingStorageKey = (scope: string) => {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw Error("No se pudo identificar el registro local de la cuenta.");
  return "RatioOperationsV1:" + scope;
};
export async function readTradingBook(key: string): Promise<TradingBook> {
  const value = (await chrome.storage.local.get(key))[key];
  return value === undefined ? emptyBook() : validateBook(value);
}
export async function saveTradingBook(key: string, base: TradingBook, next: TradingBook, verify: () => Promise<void>): Promise<TradingBook> {
  if (!navigator.locks) throw Error("El navegador no permite coordinar el guardado del registro. Recargá Matriz.");
  return navigator.locks.request(key, async () => {
    await verify();
    const current = await readTradingBook(key);
    if (current.revision !== base.revision) throw Error("Otra pestaña actualizó este registro. Revisá los datos actualizados antes de repetir el cambio.");
    const updated = validateBook({ ...next, schema: next.watch.some(p => p.c) ? 2 : 1, revision: crypto.randomUUID() });
    await verify();
    await chrome.storage.local.set({ [key]: updated });
    const saved = await readTradingBook(key);
    if (saved.revision !== updated.revision) throw Error("No se pudo confirmar el guardado. Recargá el registro antes de repetir el cambio.");
    return saved;
  });
}
