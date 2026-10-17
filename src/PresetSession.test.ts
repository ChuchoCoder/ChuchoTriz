import { afterEach, describe, it, expect, vi } from "vitest";
import { IInstrumentPreset } from "./InstrumentPresets";
import { MiniOrderForm, Ticket } from "./MiniOrderForm";
import { createPresetSession, PresetSettings } from "./PresetSession";

const big = { cantidad: 200000, mostrar: 20000 };
const medium = { cantidad: 100000, mostrar: 10000 };
const small = { cantidad: 50000, mostrar: 0 };

afterEach(() => vi.restoreAllMocks());

type Field = "instrumento" | "precio" | "cantidad" | "limpiar";

// Mini Order Form en memoria: Instrumento, Precio y Cantidad son lo que el trader escribió.
// Como en el navegador, el foco del ticket solo se dispara cuando el foco pasa a otro campo.
function fakeMiniOrderForm(ticket: Partial<Ticket> = {}) {
  const focusListeners = new Set<() => void>();
  const limpiarListeners = new Set<() => void>();
  const state = {
    ticket: { instrumento: "", ticker: "", precio: "", cantidad: "", ...ticket },
    cantidadAMostrar: "",
    edits: 0,
    focused: null as Field | null,
  };
  const moveFocus = (field: Field) => {
    if (state.focused !== field) {
      state.focused = field;
      if (field !== "limpiar") {
        focusListeners.forEach((listener) => listener());
      }
    }
  };
  const form: MiniOrderForm = {
    read: () => ({ ...state.ticket }),
    fill: (preset) => {
      if (state.ticket.instrumento !== "" && state.ticket.precio !== "") {
        state.ticket.cantidad = preset.cantidad.toString();
        state.cantidadAMostrar = preset.mostrar > 0 ? preset.mostrar.toString() : "";
      }
    },
    editCantidad: () => {
      state.edits++;
      moveFocus("cantidad");
    },
    onTicketFocus: (listener) => {
      focusListeners.add(listener);
      return () => focusListeners.delete(listener);
    },
    onLimpiar: (listener) => {
      limpiarListeners.add(listener);
      return () => limpiarListeners.delete(listener);
    },
  };
  return {
    form,
    state,
    type: (changes: Partial<Ticket>) => { state.ticket = { ...state.ticket, ...changes }; },
    focus: async (field: Field = "cantidad") => {
      moveFocus(field);
      await new Promise((resolve) => setTimeout(resolve));
    },
    blur: () => { state.focused = null; },
    limpiar: () => {
      moveFocus("limpiar");
      limpiarListeners.forEach((listener) => listener());
      state.ticket = { instrumento: "", ticker: "", precio: "", cantidad: "" };
      state.cantidadAMostrar = "";
    },
    listenerCount: () => focusListeners.size + limpiarListeners.size,
  };
}

function fakeSettings(presetsByTicker: Record<string, IInstrumentPreset[]>, autocompletar = true) {
  const lookups: string[] = [];
  const settings: PresetSettings = {
    presetsFor: async (ticker) => {
      lookups.push(ticker);
      return [...(presetsByTicker[ticker] ?? [])];
    },
    autocompletar: async () => autocompletar,
  };
  return { settings, lookups };
}

const al30 = { instrumento: "AL30 (CI)", ticker: "AL30", precio: "70000" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Preset session", () => {
  it("draws on each application including last-used autocomplete, but not focus or manual edits", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const preset = { cantidad: 100000, mostrar: "R5" } as const;
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, preset] }).settings);
    await page.focus(); // Numeric first preset does not draw.
    expect(random).not.toHaveBeenCalled();
    session.choose(preset);
    expect(page.state.cantidadAMostrar).toBe("20000");
    random.mockReturnValue(0.999999);
    session.choose(preset);
    expect(page.state.cantidadAMostrar).toBe("20600");
    page.type({ cantidad: "10000" }); // Matriz owns validation of this mismatch.
    await page.focus("precio");
    await page.focus("cantidad");
    expect(page.state.cantidadAMostrar).toBe("20600");
    expect(random).toHaveBeenCalledTimes(2);
    random.mockReturnValue(0.5);
    page.type({ cantidad: "" });
    await page.focus("precio");
    expect(page.state.ticket.cantidad).toBe("100000");
    expect(page.state.cantidadAMostrar).toBe("20300");
    expect(random).toHaveBeenCalledTimes(3);
    expect(preset.mostrar).toBe("R5");
    session.dispose();
  });

  it("draws for the first preset on autocomplete, including after Limpiar", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [{ cantidad: 100000, mostrar: "R5" }] }).settings);
    await page.focus();
    expect(page.state.cantidadAMostrar).toBe("20000");
    page.limpiar();
    page.type(al30);
    random.mockReturnValue(0.999999);
    await page.focus();
    expect(page.state.cantidadAMostrar).toBe("20600");
    expect(random).toHaveBeenCalledTimes(2);
    session.dispose();
  });
  it.each([true, false])("ignores stale instrument lookups (old resolves first: %s)", async oldFirst => {
    const page = fakeMiniOrderForm(al30);
    const old = deferred<IInstrumentPreset[]>();
    const current = deferred<IInstrumentPreset[]>();
    const gd30Preset = { cantidad: 100, mostrar: 0 };
    const session = createPresetSession(page.form, {
      presetsFor: ticker => ticker === "AL30" ? old.promise : current.promise,
      autocompletar: async () => true,
    });
    await page.focus("cantidad");
    page.type({ instrumento: "GD30 (CI)", ticker: "GD30", cantidad: "" });
    await page.focus("precio");
    if (oldFirst) { old.resolve([big]); await new Promise(resolve => setTimeout(resolve)); }
    current.resolve([gd30Preset]);
    await new Promise(resolve => setTimeout(resolve));
    if (!oldFirst) { old.resolve([big]); await new Promise(resolve => setTimeout(resolve)); }
    expect(page.state.ticket.cantidad).toBe("100");
    expect(session.presets()).toEqual([gd30Preset]);
    session.dispose();
  });

  it("preserves a quantity typed while the autocomplete setting is pending", async () => {
    const page = fakeMiniOrderForm(al30);
    const enabled = deferred<boolean>();
    const session = createPresetSession(page.form, {
      presetsFor: async () => [big], autocompletar: () => enabled.promise,
    });
    await page.focus();
    page.type({ cantidad: "7" });
    enabled.resolve(true);
    await new Promise(resolve => setTimeout(resolve));
    expect(page.state.ticket.cantidad).toBe("7");
    session.dispose();
  });

  it.each(["limpiar", "dispose"] as const)("invalidates pending work on %s", async action => {
    const page = fakeMiniOrderForm(al30);
    const pending = deferred<IInstrumentPreset[]>();
    const session = createPresetSession(page.form, {
      presetsFor: () => pending.promise, autocompletar: async () => true,
    });
    await page.focus();
    if (action === "limpiar") { page.limpiar(); page.type(al30); }
    else session.dispose();
    pending.resolve([big]);
    await new Promise(resolve => setTimeout(resolve));
    expect(page.state.ticket.cantidad).toBe("");
    expect(session.presets()).toEqual([]);
    session.dispose();
  });

  it("rejects a click on presets shown for a previous instrument", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1" });
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);
    await page.focus();
    page.type({ instrumento: "GD30 (CI)", ticker: "GD30", cantidad: "" });
    session.choose(big);
    expect(page.state.ticket.cantidad).toBe("");
    session.dispose();
  });

  it("shows no Presets until Instrumento and Precio have values", async () => {
    const page = fakeMiniOrderForm({ instrumento: "AL30 (CI)", ticker: "AL30" });
    const { settings, lookups } = fakeSettings({ AL30: [big] });
    const session = createPresetSession(page.form, settings);

    await page.focus();

    expect(session.presets()).toEqual([]);
    expect(lookups).toEqual([]);
  });

  it("shows the Presets of the Ticker once Instrumento and Precio have values", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);

    await page.focus();

    expect(session.presets()).toEqual([big, medium]);
  });

  it("hides the Presets again when Precio is cleared", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);
    await page.focus();

    page.type({ precio: "" });
    await page.focus("precio");

    expect(session.presets()).toEqual([]);
  });

  it("Autocompletar fills an empty Cantidad with the first Preset and selects it", async () => {
    const page = fakeMiniOrderForm(al30);
    createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);

    await page.focus();

    expect(page.state.ticket.cantidad).toBe("200000");
    expect(page.state.cantidadAMostrar).toBe("20000");
    expect(page.state.edits).toBe(1);
  });

  it("Autocompletar leaves a Cantidad the trader already typed", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1234" });
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);

    await page.focus();

    expect(page.state.ticket.cantidad).toBe("1234");
    expect(page.state.edits).toBe(0);
    expect(session.presets()).toEqual([big]);
  });

  it("does not fill anything when Autocompletar is off, but still shows the Presets", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }, false).settings);

    await page.focus();

    expect(page.state.ticket.cantidad).toBe("");
    expect(page.state.edits).toBe(0);
    expect(session.presets()).toEqual([big]);
  });

  it("Autocompletar prefers the Last-used Preset of the Instrumento", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, medium], GD30: [small] }).settings);
    await page.focus();
    session.choose(medium);

    page.type({ instrumento: "GD30 (CI)", ticker: "GD30", cantidad: "" });
    await page.focus("instrumento");
    page.type({ ...al30, cantidad: "" });
    await page.focus("instrumento");

    expect(page.state.ticket.cantidad).toBe("100000");
  });

  it("remembers the Last-used Preset per Instrumento, not per Ticker", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);
    await page.focus();
    session.choose(medium);

    page.type({ instrumento: "AL30 (24hs)", cantidad: "" });
    await page.focus("instrumento");

    expect(page.state.ticket.cantidad).toBe("200000");
  });

  it("Limpiar forgets the Last-used Preset", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);
    await page.focus();
    session.choose(medium);

    page.limpiar();
    page.type(al30);
    await page.focus();

    expect(page.state.ticket.cantidad).toBe("200000");
  });

  it("choosing a Preset fills Cantidad and Cantidad a mostrar and selects Cantidad", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1" });
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, small] }).settings);
    await page.focus();

    session.choose(small);

    expect(page.state.ticket.cantidad).toBe("50000");
    expect(page.state.cantidadAMostrar).toBe("");
    expect(page.state.edits).toBe(1);
  });

  it("does not look up Presets again while the ticket is unchanged", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1" });
    const { settings, lookups } = fakeSettings({ AL30: [big] });
    createPresetSession(page.form, settings);

    await page.focus("precio");
    await page.focus("cantidad");
    await page.focus("instrumento");

    expect(lookups).toEqual(["AL30"]);
  });

  it("shows the Presets again when the same Instrumento and Precio are entered after Limpiar", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);
    await page.focus("cantidad");

    page.limpiar();
    await page.focus("instrumento");
    page.type({ instrumento: al30.instrumento, ticker: al30.ticker });
    await page.focus("precio");
    page.type({ precio: al30.precio });
    await page.focus("cantidad");

    expect(session.presets()).toEqual([big, medium]);
    expect(page.state.ticket.cantidad).toBe("200000");
  });

  it("shows the Presets again when Matriz fills the same ticket right after Limpiar", async () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);
    await page.focus("cantidad");

    page.limpiar();
    page.type(al30);
    await page.focus("cantidad");

    expect(session.presets()).toEqual([big]);
    expect(page.state.ticket.cantidad).toBe("200000");
  });

  it("shows the Presets again when Precio is cleared and typed back", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1" });
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);
    await page.focus("cantidad");

    page.type({ precio: "" });
    await page.focus("precio");
    page.type({ precio: al30.precio });
    await page.focus("cantidad");

    expect(session.presets()).toEqual([big]);
  });

  it("Autocompletar fills Cantidad again after Matriz empties it without a focus change", async () => {
    const page = fakeMiniOrderForm(al30);
    createPresetSession(page.form, fakeSettings({ AL30: [big, medium] }).settings);
    await page.focus("cantidad");

    // Por ejemplo, después de enviar una orden: Instrumento y Precio quedan, Cantidad se vacía
    page.blur();
    page.type({ cantidad: "" });
    await page.focus("cantidad");

    expect(page.state.ticket.cantidad).toBe("200000");
  });

  it("notifies subscribers when the visible Presets change", async () => {
    const page = fakeMiniOrderForm({ ...al30, cantidad: "1" });
    const session = createPresetSession(page.form, fakeSettings({ AL30: [big] }).settings);
    let notifications = 0;
    session.subscribe(() => notifications++);

    await page.focus();

    expect(notifications).toBe(1);
    expect(session.presets()).toBe(session.presets());
  });

  it("dispose stops listening to the Mini Order Form", () => {
    const page = fakeMiniOrderForm(al30);
    const session = createPresetSession(page.form, fakeSettings({}).settings);

    session.dispose();

    expect(page.listenerCount()).toBe(0);
  });
});
