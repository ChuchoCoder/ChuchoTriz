import { useCallback, useEffect, useRef, useState } from "react";
import { MarketReader } from "../optionsSimulator/market";
import { positionStorageSalt } from "../optionsSimulator/positionStorage";
import type { TradingInstrument, TradingQuote } from "./trading";

export interface RatioContext { contextId: string; storageScope: string; connected: boolean }
const supportedHost = () => /^(?:.+\.)?xoms\.com\.ar$|^remarkets\.matriz\.com\.ar$|^127\.0\.0\.1$/.test(location.hostname);
export function useRatioMarket(active: boolean, ids: string[], loadedScope?: string) {
  const [market, setMarket] = useState<{ context?: RatioContext; quotes: Record<string, TradingQuote>; issue?: string }>({ quotes: {} });
  const reader = useRef<MarketReader | null>(null), current = useRef(market), wanted = useRef(ids), bookScope = useRef(loadedScope);
  current.current = market; wanted.current = [...new Set(ids)].sort(); bookScope.current = loadedScope;
  useEffect(() => {
    if (!active) { setMarket({ quotes: {} }); return; }
    if (!supportedHost()) { setMarket({ quotes: {}, issue: "Abrí Ratios desde ChuchoTriz dentro de Matriz para leer cotizaciones y guardar el registro de la cuenta activa." }); return; }
    const client = new MarketReader("ratio-operations-reader.js"); reader.current = client;
    let closed = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let confirmed: RatioContext | undefined;
      try {
        const storageSalt = await positionStorageSalt();
        const context = await client.call<RatioContext>("ratioContext", { storageSalt });
        if (closed) return;
        if (!/^[a-f0-9]{64}$/.test(context.storageScope) || typeof context.contextId !== "string") throw Error("Contexto de cuenta no disponible.");
        confirmed = context;
        const source = current.current.context;
        setMarket(previous => ({ context, quotes: previous.context?.contextId === context.contextId ? previous.quotes : {}, issue: context.connected ? undefined : "Mercado desconectado; los precios elegidos y el registro se conservan." }));
        // The account's requested IDs arrive only after its own local book loads.
        if (source?.storageScope !== context.storageScope || bookScope.current !== context.storageScope) return;
        const selection = [...wanted.current], quotes: Record<string, TradingQuote> = {};
        for (let n = 0; n < selection.length; n += 100) {
          const response = await client.call<{ contextId: string; instruments: Record<string, TradingQuote> }>("ratioQuotes", { contextId: context.contextId, ids: selection.slice(n, n + 100) });
          if (closed) return;
          if (response.contextId !== context.contextId) throw Error("Cambió el contexto durante la lectura de ratios.");
          Object.assign(quotes, response.instruments);
        }
        const verify = await client.call<RatioContext>("ratioContext", { storageSalt });
        if (!closed && verify.contextId === context.contextId && JSON.stringify(selection) === JSON.stringify(wanted.current)) setMarket({ context, quotes, issue: context.connected ? undefined : "Mercado desconectado." });
      } catch (error) {
        if (closed) return;
        let context: RatioContext | undefined;
        if (confirmed) {
          try { context = await client.call<RatioContext>("ratioContext", { storageSalt: await positionStorageSalt() }); } catch { /* An unverified account must clear the previous scope. */ }
        }
        if (!closed) setMarket({ context, quotes: {}, issue: error instanceof Error ? error.message : "No se pudo leer Ratios." });
      }
      finally { if (!closed) timer = setTimeout(() => void tick(), 1200); }
    };
    void tick();
    return () => { closed = true; clearTimeout(timer); reader.current = null; client.dispose(); };
  }, [active]);
  const verify = useCallback(async (expected: RatioContext) => {
    if (!reader.current) throw Error("Lectura de ratios cerrada.");
    const next = await reader.current.call<RatioContext>("ratioContext", { storageSalt: await positionStorageSalt() });
    if (current.current.context?.storageScope !== expected.storageScope || next.storageScope !== expected.storageScope || next.contextId !== expected.contextId) throw Error("Cambió la cuenta o conexión. Volvé a intentar el cambio.");
  }, []);
  const search = useCallback(async (query: string) => {
    const context = current.current.context;
    if (!reader.current || !context) return [];
    return reader.current.call<TradingInstrument[]>("ratioSearch", { contextId: context.contextId, query });
  }, []);
  return { ...market, search, verify };
}
