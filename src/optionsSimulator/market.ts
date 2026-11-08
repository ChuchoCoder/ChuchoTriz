import { useEffect, useRef, useState } from "react";
export interface Contract {
  id: string; symbol: string; underlyingId: string; kind: "call" | "put"; strike: number;
  expiration: string; currency: "ARS" | "USD"; strikeCurrency?: string; settlement: string; factor?: number;
}
export interface Catalog {
  contextRevision: number; catalogRevision: number; version: string; excluded: number;
  underlyings: { id: string; symbol: string; currency: string }[]; contracts: Contract[];
}
export interface Quote {
  bid?: { price: number; size: number }; ask?: { price: number; size: number };
  last?: number; referencePrice?: number; seq?: number; impliedVolatility?: number; delta?: number;
  nominalVolume?: number; changePercent?: number; lastTradeAt?: number;
}
export function lastTradedPremium(quote: Quote | undefined) {
  const last = quote?.last;
  return last !== undefined && Number.isFinite(last) && last > 0 ? last : undefined;
}
export interface Snapshot {
  contextRevision: number; catalogRevision: number; underlyingId: string; capturedAt: number; instruments: Record<string, Quote>;
}
export class MarketReader {
  private channel: string;
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private script = document.createElement("script");
  private ready: Promise<void>;
  private releaseReady?: () => void;
  private disposed = false;
  private receive = (event: MessageEvent) => {
    const msg = event.data;
    if (event.source !== window || msg?.channel !== this.channel || msg.kind !== "response") return;
    const task = this.pending.get(msg.id);
    if (!task) return;
    clearTimeout(task.timer); this.pending.delete(msg.id);
    if (typeof msg.error === "string") task.reject(Error(msg.error)); else task.resolve(msg.result);
  };
  constructor(private resource: "options-market-reader.js" | "options-position-reader.js" = "options-market-reader.js") {
    this.channel = `chuchotriz-options-${resource === "options-position-reader.js" ? "position" : "market"}-${crypto.randomUUID()}`;
    window.addEventListener("message", this.receive);
    this.script.dataset.channel = this.channel;
    this.script.src = chrome.runtime.getURL(resource);
    this.ready = new Promise((resolve, reject) => {
      this.releaseReady = resolve;
      this.script.onload = () => resolve(); this.script.onerror = () => reject(Error("No se pudo cargar el lector de mercado. Recargá Matriz."));
    });
    document.documentElement.append(this.script);
  }
  async call<T>(method: "catalog" | "snapshot" | "positions" | "verifyPositionContext", params = {}): Promise<T> {
    await this.ready;
    if (this.disposed) throw Error("Lectura cerrada.");
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id); window.postMessage({ channel: this.channel, kind: "retire", id }, location.origin);
        reject(Error("La lectura de mercado no respondió a tiempo."));
      }, this.resource === "options-position-reader.js" ? 15000 : 5000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      window.postMessage({ channel: this.channel, kind: "request", id, method, params }, location.origin);
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseReady?.();
    window.postMessage({ channel: this.channel, kind: "detach" }, location.origin);
    window.removeEventListener("message", this.receive); this.script.remove();
    this.pending.forEach(task => { clearTimeout(task.timer); task.reject(Error("Lectura cerrada.")); }); this.pending.clear();
  }
}

export function useOptionMarket(active: boolean, underlyingId: string, ids: string[]) {
  const [state, setState] = useState<{ catalog?: Catalog; data?: Snapshot; issue?: string; selectionKey?: string }>({});
  const sequence = useRef<{ context?: number; highest: Map<string, number> }>({ highest: new Map() });
  const selectionKey = JSON.stringify([...new Set(ids)].sort());
  useEffect(() => {
    if (!active) return;
    if (!/^(?:.+\.)?xoms\.com\.ar$|^remarkets\.matriz\.com\.ar$|^127\.0\.0\.1$/.test(location.hostname)) {
      setState({ issue: "Abrí el simulador desde el icono de ChuchoTriz dentro de Matriz para ver la cadena de mercado." }); return;
    }
    let closed = false, timer: ReturnType<typeof setTimeout>;
    const reader = new MarketReader();
    const tick = async () => {
      try {
        const catalog = await reader.call<Catalog>("catalog");
        if (closed) return;
        if (!catalog || !Array.isArray(catalog.contracts) || !Array.isArray(catalog.underlyings) || !Number.isSafeInteger(catalog.contextRevision)) throw Error("Catálogo inválido.");
        if (sequence.current.context !== catalog.contextRevision) sequence.current = { context: catalog.contextRevision, highest: new Map() };
        const highest = sequence.current.highest;
        setState(previous => ({ catalog, selectionKey, ...(previous.catalog?.contextRevision === catalog.contextRevision && previous.catalog?.catalogRevision === catalog.catalogRevision ? { data: previous.data } : {}) }));
        if (underlyingId && ids.length && catalog.underlyings.some(item => item.id === underlyingId)) {
          const optionIds = (JSON.parse(selectionKey) as string[]).filter(id => id !== underlyingId);
          let data: Snapshot | undefined;
          // Same small sequential read groups as Premium; publish only a complete chain.
          for (let offset = 0; offset < Math.max(1, optionIds.length); offset += 23) {
            const batch = [underlyingId, ...optionIds.slice(offset, offset + 23)];
            const next = await reader.call<Snapshot>("snapshot", { underlyingId, ids: batch });
            if (closed) return;
            if (next.contextRevision !== catalog.contextRevision || next.catalogRevision !== catalog.catalogRevision || next.underlyingId !== underlyingId ||
              !Number.isFinite(next.capturedAt) || batch.some(id => !next.instruments?.[id])) throw Error("Cambió la selección o el contexto de mercado.");
            for (const id of batch) {
              const seq = next.instruments[id].seq, key = `${catalog.contextRevision}|${id}`;
              if (seq !== undefined && (!Number.isFinite(seq) || seq < (highest.get(key) ?? -Infinity))) throw Error("Secuencia de mercado anterior: referencias no disponibles.");
              if (seq !== undefined) highest.set(key, seq);
            }
            data = { ...next, instruments: { ...data?.instruments, ...Object.fromEntries(batch.map(id => [id, next.instruments[id]])) } };
          }
          setState({ catalog, data, selectionKey });
        }
      } catch (error) { if (!closed) setState(previous => ({ catalog: previous.catalog, issue: error instanceof Error ? error.message : "Lectura de mercado no disponible." })); }
      finally { if (!closed) timer = setTimeout(() => void tick(), 1500); }
    };
    setState(previous => ({ catalog: previous.catalog })); void tick();
    return () => { closed = true; clearTimeout(timer); reader.dispose(); };
  }, [active, underlyingId, selectionKey]);
  return { ...state, data: active && state.selectionKey === selectionKey ? state.data : undefined };
}
