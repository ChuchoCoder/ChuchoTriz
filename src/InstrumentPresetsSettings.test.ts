import { afterEach, describe, expect, it, vi } from "vitest";
import { PresetValidationError, serializePresets, toDraft } from "./InstrumentPresetsSettings";
import repository from "./InstrumentPresetsRepository";
import { presetsFor } from "./PresetBook";

afterEach(() => { vi.unstubAllGlobals(); });

describe("instrument settings drafts", () => {
  it("preserves prefix precedence and saves both settings in one write", async () => {
    const book = { GGALD: [{ cantidad: 100, mostrar: 10 }], GGALC: [{ cantidad: 500, mostrar: 50 }] };
    const draft = toDraft(book);
    expect(Object.keys(draft).sort((a, b) => a.localeCompare(b, "es"))).toEqual(["GGALC", "GGALD"]);
    const serialized = serializePresets(draft);
    expect(presetsFor(serialized, "GGAL")).toEqual(presetsFor(book, "GGAL"));
    expect(Object.keys(serialized)).toEqual(["GGALD", "GGALC"]);
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { set } } });
    await repository.saveSettings(serialized, false);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ InstrumentPresets: book, Autocomplete: false });
  });

  it("round trips preset order, zero display quantity and large peso values", () => {
    const book = {
      PESOS: [{ cantidad: 100000000, mostrar: 0 }, { cantidad: 100, mostrar: 0 }],
      AL30: [{ cantidad: 200000, mostrar: 20000 }, { cantidad: 50000, mostrar: 5000 }],
    };
    expect(serializePresets(toDraft(book))).toEqual(book);
  });

  it.each([["", "0"], ["0", "0"], ["1.5", "0"], ["100", "-1"], ["100", ""],
    ["100", "2.5"], ["9007199254740992", "0"], ["1e2", "0"], ["100", "101"]])(
    "uses PresetBook validation for cantidad=%s mostrar=%s", (cantidad, mostrar) => {
      expect(() => serializePresets({ AL30: [{ cantidad: "100", mostrar: "0" }], GGAL: [{ cantidad, mostrar }] }))
        .toThrowError(PresetValidationError);
      try { serializePresets({ GGAL: [{ cantidad, mostrar }] }); }
      catch (error) { expect((error as PresetValidationError).ticker).toBe("GGAL"); }
    });

  it("rejects an instrument without presets, matching the existing parser", () => {
    expect(() => serializePresets({ AL30: [] })).toThrow("Falta al menos un Preset");
  });

  it("does not mutate loaded defaults while editing", () => {
    const book = { AL30: [{ cantidad: 200000, mostrar: 20000 }] };
    const draft = toDraft(book);
    draft.AL30[0].cantidad = "1";
    draft.AL30.push({ cantidad: "2", mostrar: "0" });
    expect(book).toEqual({ AL30: [{ cantidad: 200000, mostrar: 20000 }] });
  });
});
