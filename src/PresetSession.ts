import { IInstrumentPreset } from "./InstrumentPresets";
import { MiniOrderForm, Ticket } from "./MiniOrderForm";

export interface PresetSettings {
  presetsFor(ticker: string): Promise<IInstrumentPreset[]>;
  autocompletar(): Promise<boolean>;
}

export interface PresetSession {
  // Presets visibles; devuelve la misma referencia mientras no cambien
  presets(): IInstrumentPreset[];
  subscribe(listener: () => void): () => void;
  choose(preset: IInstrumentPreset): void;
  dispose(): void;
}

const NoPresets: IInstrumentPreset[] = [];

const keyOf = (ticket: Ticket) => ticket.instrumento + " " + ticket.precio + " " + ticket.cantidad;
const identityOf = (ticket: Ticket) => JSON.stringify([ticket.instrumento, ticket.ticker, ticket.precio]);

export function createPresetSession(form: MiniOrderForm, settings: PresetSettings): PresetSession {
  let visiblePresets = NoPresets;
  let lastInstrumento = "";
  let lastTicketKey = "";
  let revision = 0;
  let disposed = false;
  let visibleIdentity = "";
  const lastUsedPresets = new Map<string, IInstrumentPreset>();
  const listeners = new Set<() => void>();

  const show = (presets: IInstrumentPreset[], identity = "") => {
    visibleIdentity = identity;
    if (presets !== visiblePresets) {
      visiblePresets = presets;
      listeners.forEach((listener) => listener());
    }
  };

  const onTicketFocus = async () => {
    try {
      const ticket = form.read();
      const ticketKey = keyOf(ticket);
      if (disposed || lastTicketKey === ticketKey) {
        return;
      }
      const request = ++revision;
      const identity = identityOf(ticket);
      const current = () => !disposed && request === revision && identityOf(form.read()) === identity;
      if (ticket.instrumento === "" || ticket.precio === "") {
        // Olvidar el ticket: si vuelve el mismo Instrumento y Precio hay que evaluarlo de nuevo
        lastTicketKey = "";
        show(NoPresets);
        return;
      }

      lastInstrumento = ticket.instrumento;
      lastTicketKey = ticketKey;
      show(NoPresets);
      const presets = await settings.presetsFor(ticket.ticker);
      if (!current()) return;

      // Every await can outlive an instrument change, Limpiar, or manual typing.
      const enabled = !form.read().cantidad && await settings.autocompletar();
      if (!current()) return;
      if (!form.read().cantidad && enabled) {
        const lastUsed = lastUsedPresets.get(ticket.instrumento);
        if (lastUsed) {
          form.fill(lastUsed);
        }
        else if (presets.length > 0) {
          form.fill(presets[0]);
        }
        // Record the write before focusing: focusin can re-enter this handler.
        lastTicketKey = keyOf(form.read());
        form.editCantidad();
      }

      if (current()) show(presets, identity);
    }
    catch (error) {
      console.error(error);
    }
  };

  const onLimpiar = () => {
    revision++;
    lastTicketKey = "";
    lastUsedPresets.delete(lastInstrumento);
    show(NoPresets);
  };

  const unsubscribeFocus = form.onTicketFocus(onTicketFocus);
  const unsubscribeLimpiar = form.onLimpiar(onLimpiar);

  return {
    presets: () => visiblePresets,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    choose: (preset) => {
      if (disposed || identityOf(form.read()) !== visibleIdentity) return;
      revision++;
      form.fill(preset);
      lastTicketKey = keyOf(form.read());
      form.editCantidad();
      lastUsedPresets.set(lastInstrumento, preset);
    },
    dispose: () => {
      disposed = true;
      revision++;
      unsubscribeFocus();
      unsubscribeLimpiar();
      listeners.clear();
    },
  };
}
