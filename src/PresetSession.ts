import { IInstrumentPreset, resolvePreset } from "./InstrumentPresets";
import { MiniOrderForm, Ticket } from "./MiniOrderForm";

export interface PresetSettings {
  presetsFor(ticker: string): Promise<IInstrumentPreset[]>;
  autocompletar(): Promise<boolean>;
}

export interface PresetSession {
  // Presets visibles; devuelve la misma referencia mientras no cambien
  presets(): IInstrumentPreset[];
  subscribe(listener: () => void): () => void;
  // Carga los botones al montar sin consumir el próximo foco del ticket.
  refresh(): Promise<void>;
  choose(preset: IInstrumentPreset): void;
  dispose(): void;
}

const NoPresets: IInstrumentPreset[] = [];

const keyOf = (ticket: Ticket) => ticket.instrumento + " " + ticket.precio + " " + ticket.cantidad;
const identityOf = (ticket: Ticket) => JSON.stringify([ticket.instrumento, ticket.ticker, ticket.precio]);
const instrumentOf = (ticket: Ticket) => JSON.stringify([ticket.instrumento, ticket.ticker]);

export function createPresetSession(
  form: MiniOrderForm,
  settings: PresetSettings,
  lastUsedPresets = new Map<string, IInstrumentPreset>(),
): PresetSession {
  let visiblePresets = NoPresets;
  let lastInstrumento = "";
  let lastTicketKey = "";
  let pendingLookup: { identity: string } | undefined;
  let disposed = false;
  let visibleInstrument = "";
  const listeners = new Set<() => void>();

  const show = (presets: IInstrumentPreset[], instrument = "") => {
    visibleInstrument = instrument;
    if (presets !== visiblePresets) {
      visiblePresets = presets;
      listeners.forEach((listener) => listener());
    }
  };

  const update = async (fromFocus: boolean) => {
    let request: typeof pendingLookup;
    try {
      const ticket = form.read();
      const ticketKey = keyOf(ticket);
      const identity = identityOf(ticket);
      const instrument = instrumentOf(ticket);
      const alreadyLoadingOrVisible = pendingLookup?.identity === identity ||
        (!!ticket.precio && visibleInstrument === instrument);
      if (disposed || (fromFocus ? lastTicketKey === ticketKey : alreadyLoadingOrVisible)) {
        return;
      }
      if (ticket.instrumento === "" || ticket.precio === "") {
        // Olvidar el ticket: si vuelve el mismo Instrumento y Precio hay que evaluarlo de nuevo
        pendingLookup = undefined;
        lastTicketKey = "";
        show(NoPresets);
        return;
      }

      pendingLookup = request = { identity };
      const current = () => pendingLookup === request && identityOf(form.read()) === identity;
      lastInstrumento = ticket.instrumento;
      lastTicketKey = fromFocus ? ticketKey : "";
      if (visibleInstrument !== instrument) show(NoPresets);
      const presets = await settings.presetsFor(ticket.ticker);
      if (!current()) return;

      // Every await can outlive an instrument change, Limpiar, or manual typing.
      const enabled = fromFocus && !form.read().cantidad && await settings.autocompletar();
      if (!current()) return;
      if (!form.read().cantidad && enabled) {
        const lastUsed = lastUsedPresets.get(ticket.instrumento);
        if (lastUsed) {
          form.fill(resolvePreset(lastUsed));
        }
        else if (presets.length > 0) {
          form.fill(resolvePreset(presets[0]));
        }
        // Record the write before focusing: focusin can re-enter this handler.
        lastTicketKey = keyOf(form.read());
        form.editCantidad();
      }

      if (current()) show(presets, instrument);
    }
    catch (error) {
      console.error(error);
    }
    finally {
      if (pendingLookup === request) pendingLookup = undefined;
    }
  };

  const onLimpiar = () => {
    pendingLookup = undefined;
    lastTicketKey = "";
    lastUsedPresets.delete(form.read().instrumento || lastInstrumento);
    show(NoPresets);
  };

  const unsubscribeFocus = form.onTicketFocus(() => { void update(true); });
  const unsubscribeLimpiar = form.onLimpiar(onLimpiar);

  return {
    presets: () => visiblePresets,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: () => update(false),
    choose: (preset) => {
      const ticket = form.read();
      // Presets belong to the instrument; editing Precio must not invalidate their buttons.
      if (disposed || !ticket.precio || instrumentOf(ticket) !== visibleInstrument) return;
      const resolved = resolvePreset(preset);
      pendingLookup = undefined;
      lastUsedPresets.set(ticket.instrumento, preset);
      form.fill(resolved);
      lastTicketKey = keyOf(form.read());
      form.editCantidad();
    },
    dispose: () => {
      disposed = true;
      pendingLookup = undefined;
      unsubscribeFocus();
      unsubscribeLimpiar();
      listeners.clear();
    },
  };
}
