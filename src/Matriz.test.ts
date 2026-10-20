// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandMiniOrderForm, miniOrderForm } from "./Matriz";
import { createPresetSession, PresetSession } from "./PresetSession";

let session: PresetSession | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  session?.dispose();
  session = undefined;
  document.body.replaceChildren();
});

function numberInput(formItemClasses: string, id: string, value = "") {
  return `
    <div class="ant-form-item ${formItemClasses}">
      <div><div class="ant-col ant-form-item-control"><div><div><div>
        <div class="ant-input-number-input-wrap"><input id="${id}" value="${value}"></div>
      </div></div></div></div></div>
    </div>`;
}

const cantidadAMostrarRow = `
  <div class="MiniOrderForm_FormMiniOrdenPanel_row-bottom__div">
    ${numberInput("amount-show__div miniOrderFormItem", "cantidadMostrar")}
  </div>`;

// Mini Order Form de Matriz, con la misma estructura que esperan los selectores.
// Como en Matriz, Cantidad a mostrar solo existe con el formulario expandido.
function renderMiniOrderForm(
  { instrumento = "AL30 (CI)", precio = "70000", cantidad = "", expanded = true, deferExpansion = false } = {}) {
  document.body.innerHTML = `
    <div id="MiniOrderForm">
      <span class="ExpandButton"></span>
      <form>
        <div class="MiniOrderForm_FormMiniOrdenPanel_row-top__div"><span>
          <input id="rc_select_2" value="${instrumento}">
          ${numberInput("PriceInputFormItem MiniOrderFormQuantity-price-input", "precio", precio)}
        </span></div>
        <div><span>
          ${numberInput("QuantityInputFormItem MiniOrderFormQuantity-amount-input", "cantidad", cantidad)}
        </span></div>
      </form>
      <div class="MiniOrderForm_buttonsBlock">
        <button class="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"><span>Limpiar</span></button>
        <div id="root-chuchotriz"><div class="DefaultSizeShowButtons">
          <button class="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"><span>10k</span></button>
        </div></div>
      </div>
    </div>`;

  const form = document.getElementById("MiniOrderForm")!;
  const showCantidadAMostrar = (show: boolean) => {
    form.querySelector(".MiniOrderForm_FormMiniOrdenPanel_row-bottom__div")?.remove();
    form.classList.toggle("ExpandedForm", show);
    if (show) {
      form.querySelector("form")!.insertAdjacentHTML("beforeend", cantidadAMostrarRow);
    }
  };
  showCantidadAMostrar(expanded);
  const expandButton = form.querySelector(".ExpandButton")!;
  expandButton.addEventListener("click", () => {
    const expand = () => showCantidadAMostrar(!form.classList.contains("ExpandedForm"));
    if (deferExpansion) queueMicrotask(expand);
    else expand();
  });

  return {
    input: (id: string) => document.getElementById(id) as HTMLInputElement,
    limpiarButton: form.querySelector(".MiniOrderForm_buttonsBlock > button") as HTMLButtonElement,
    presetButton: form.querySelector(".ButtonPreset") as HTMLButtonElement,
    isExpanded: () => form.classList.contains("ExpandedForm"),
  };
}

function replaceInput(input: HTMLInputElement, value: string) {
  const replacement = document.createElement("input");
  replacement.id = input.id;
  replacement.value = value;
  input.replaceWith(replacement);
  return replacement;
}

describe("Matriz Mini Order Form", () => {
  it("autocompletes Mostrar todo and switches through fixed/random/full presets, then resets with Limpiar", async () => {
    const page = renderMiniOrderForm({ expanded: false });
    const whole = { cantidad: 100, mostrar: 0 };
    const fixed = { cantidad: 100, mostrar: 20 };
    const random = { cantidad: 100, mostrar: "R5" } as const;
    vi.spyOn(Math, "random").mockReturnValue(0);
    session = createPresetSession(miniOrderForm, {
      presetsFor: async () => [whole, fixed, random], autocompletar: async () => true,
    });
    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("100"));
    session.choose(fixed);
    expect(page.input("cantidadMostrar").value).toBe("20");
    session.choose(whole);
    expect(page.input("cantidadMostrar").value).toBe("100");
    session.choose(random);
    expect(page.input("cantidadMostrar").value).toBe("20");
    session.choose(whole);
    page.input("cantidad").value = "200";
    page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
    expect(page.input("cantidadMostrar").value).toBe("200");
    page.limpiarButton.click();
    page.input("cantidad").value = "";
    page.input("cantidadMostrar").value = "";
    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidadMostrar").value).toBe("100"));
  });

  it("applies random rules as numeric DOM values and preserves them after manual quantity changes", async () => {
    const page = renderMiniOrderForm({ expanded: false });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const preset = { cantidad: 100000, mostrar: "R5" } as const;
    session = createPresetSession(miniOrderForm, {
      presetsFor: async () => [preset], autocompletar: async () => true,
    });
    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidadMostrar").value).toBe("20000"));
    expect(page.isExpanded()).toBe(true);
    expect(random).toHaveBeenCalledTimes(1);
    page.input("cantidad").value = "10000";
    page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
    page.input("precio").focus();
    await new Promise(resolve => setTimeout(resolve));
    expect(page.input("cantidadMostrar").value).toBe("20000");
    expect(random).toHaveBeenCalledTimes(1);
    random.mockReturnValue(0.999999);
    session.choose(preset);
    expect(page.input("cantidad").value).toBe("100000");
    expect(page.input("cantidadMostrar").value).toBe("20600");
    expect(random).toHaveBeenCalledTimes(2);
  });
  describe("read", () => {
    it("reads Instrumento, Ticker, Precio and Cantidad", () => {
      renderMiniOrderForm({ instrumento: "AL30 (CI)", precio: "70000", cantidad: "100" });

      expect(miniOrderForm.read()).toEqual({
        instrumento: "AL30 (CI)", ticker: "AL30", precio: "70000", cantidad: "100",
      });
    });

    it.each([
      ["AL30 (CI)", "AL30"],
      ["gd30 (24hs)", "GD30"],
      ["GGAL", "GGAL"],
      ["", ""],
    ])("derives the Ticker of %j as %j", (instrumento, ticker) => {
      renderMiniOrderForm({ instrumento });

      expect(miniOrderForm.read().ticker).toBe(ticker);
    });

    it("reads an empty ticket when the Mini Order Form is not on the page", () => {
      expect(miniOrderForm.read()).toEqual({ instrumento: "", ticker: "", precio: "", cantidad: "" });
    });
  });

  describe("fill", () => {
    it("writes Cantidad and Cantidad a mostrar and lets Matriz see the change", () => {
      const page = renderMiniOrderForm();
      const changes: string[] = [];
      document.addEventListener("change", (event) => changes.push((event.target as HTMLInputElement).id));

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      expect(page.input("cantidad").value).toBe("200000");
      expect(page.input("cantidadMostrar").value).toBe("20000");
      expect(changes).toEqual(["cantidad", "cantidadMostrar"]);
    });

    it("replaces a partial with the numeric total for Mostrar todo, never displayQty null", () => {
      const page = renderMiniOrderForm();
      page.input("cantidadMostrar").value = "20";
      // Native Matriz 4.23.16: clearing this control produces null. A total of
      // 100 with displayQty 100 was accepted and normalized to no iceberg.
      let displayQty: number | null = 20;
      page.input("cantidadMostrar").addEventListener("change", () => {
        const value = page.input("cantidadMostrar").value;
        displayQty = value === "" ? null : Number(value);
      });

      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });

      expect(JSON.parse(JSON.stringify({ quantity: Number(page.input("cantidad").value), displayQty })))
        .toEqual({ quantity: 100, displayQty: 100 });
      expect(page.input("cantidadMostrar").value).toBe("100");
      expect(page.isExpanded()).toBe(true);
    });

    it("keeps Mostrar todo fully disclosed when the total is edited, until the display field is edited", async () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      expect(page.input("cantidadMostrar").value).toBe("200");

      page.input("cantidadMostrar").value = "20";
      page.input("cantidadMostrar").dispatchEvent(new Event("input", { bubbles: true }));
      page.input("cantidad").value = "300";
      page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      expect(page.input("cantidadMostrar").value).toBe("20");
    });

    it("resynchronizes a hidden full quantity before another total is used", async () => {
      const page = renderMiniOrderForm({ deferExpansion: true });
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      document.querySelector<HTMLElement>(".ExpandButton")!.click();
      await vi.waitFor(() => expect(page.isExpanded()).toBe(false));
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("200"));
    });

    it("keeps the latest whole quantity when typing during expansion", async () => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("200"));
    });

    it("follows a native quantity stepper that changes its controlled value without a DOM input event", () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      const stepper = document.createElement("button");
      stepper.type = "button";
      stepper.className = "ant-input-number-handler-up";
      page.input("cantidad").closest(".ant-form-item")!.append(stepper);
      stepper.addEventListener("click", () => { page.input("cantidad").value = "101"; });
      stepper.click();
      expect(page.input("cantidadMostrar").value).toBe("101");
    });

    it("follows a controlled quantity rendered after its keyboard event", async () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      page.input("cantidad").dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }));
      page.input("cantidad").value = "101";
      page.input("cantidad").setAttribute("value", "101");
      await Promise.resolve();
      expect(page.input("cantidadMostrar").value).toBe("101");
    });

    it("respects manual display edits even when the native control stops event bubbling", async () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      page.input("cantidadMostrar").addEventListener("input", event => event.stopPropagation());
      page.input("cantidadMostrar").value = "20";
      page.input("cantidadMostrar").dispatchEvent(new Event("input", { bubbles: true }));
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      expect(page.input("cantidadMostrar").value).toBe("20");
    });

    it("abandons an unavailable full-quantity field after the initial timeout", async () => {
      vi.useFakeTimers();
      try {
        const page = renderMiniOrderForm({ expanded: false });
        const button = document.querySelector(".ExpandButton")!;
        button.replaceWith(button.cloneNode(true));
        miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
        await vi.advanceTimersByTimeAsync(3000);
        document.querySelector("#MiniOrderForm form")!.insertAdjacentHTML("beforeend", cantidadAMostrarRow);
        await Promise.resolve();
        expect(page.input("cantidadMostrar").value).toBe("");
        expect(vi.getTimerCount()).toBe(0);
      } finally { vi.useRealTimers(); }
    });

    it.each([20, 100])("does not turn a fixed display quantity %s into Mostrar todo", async mostrar => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      miniOrderForm.fill({ cantidad: 100, mostrar });
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      expect(page.input("cantidadMostrar").value).toBe(String(mostrar));
    });

    it.each(["instrumento", "limpiar", "replacement"])("stops following the previous full ticket after %s", async action => {
      let page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      if (action === "instrumento") {
        page.input("rc_select_2").value = "GD30 (CI)";
        page.input("rc_select_2").dispatchEvent(new Event("input", { bubbles: true }));
      } else if (action === "limpiar") page.limpiarButton.click();
      else page = renderMiniOrderForm();
      page.input("cantidadMostrar").value = "20";
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      expect(page.input("cantidadMostrar").value).toBe("20");
    });

    it("does nothing until Instrumento and Precio have values", () => {
      const page = renderMiniOrderForm({ precio: "" });

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      expect(page.input("cantidad").value).toBe("");
    });

    it("expands the Mini Order Form to reach Cantidad a mostrar", () => {
      const page = renderMiniOrderForm({ expanded: false });

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      expect(page.isExpanded()).toBe(true);
      expect(page.input("cantidadMostrar").value).toBe("20000");
    });

    it("expands a collapsed form to replace any hidden partial with the whole quantity", () => {
      const page = renderMiniOrderForm({ expanded: false });

      miniOrderForm.fill({ cantidad: 100000, mostrar: 0 });

      expect(page.input("cantidad").value).toBe("100000");
      expect(page.isExpanded()).toBe(true);
      expect(page.input("cantidadMostrar").value).toBe("100000");
    });

    it("fills Cantidad a mostrar when Matriz renders the expanded fields later", async () => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("20000"));
      expect(page.input("cantidad").value).toBe("200000");
    });

    it.each(["instrumento", "precio", "cantidad", "limpiar"])("discards pending shown quantity after %s changes", async change => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      if (change === "limpiar") page.limpiarButton.click();
      else {
        const input = page.input(change === "instrumento" ? "rc_select_2" : change);
        input.value = change === "instrumento" ? "GD30 (CI)" : "1";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      await vi.waitFor(() => expect(page.isExpanded()).toBe(true));
      expect(page.input("cantidadMostrar").value).toBe("");
    });

    it.each([0, 15000])("uses the latest preset while expansion is pending (mostrar: %s)", async mostrar => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      miniOrderForm.fill({ cantidad: 100000, mostrar });

      await vi.waitFor(() => expect(page.isExpanded()).toBe(true));
      expect(page.input("cantidad").value).toBe("100000");
      expect(page.input("cantidadMostrar").value).toBe(mostrar ? mostrar.toString() : "100000");
    });

    it.each(["input", "limpiar"])("does not toggle twice when %s cancels a write before another partial preset", async cancel => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      if (cancel === "limpiar") page.limpiarButton.click();
      else {
        page.input("cantidad").value = "50";
        page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      }
      miniOrderForm.fill({ cantidad: 100000, mostrar: 10000 });

      await vi.waitFor(() => expect(page.isExpanded()).toBe(true));
      expect(page.input("cantidad").value).toBe("100000");
      expect(page.input("cantidadMostrar").value).toBe("10000");
    });

    it("rechecks ticket identity when Matriz replaces an input without an input event", async () => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      replaceInput(page.input("rc_select_2"), "GD30 (CI)");

      await vi.waitFor(() => expect(page.isExpanded()).toBe(true));
      expect(page.input("cantidadMostrar").value).toBe("");
    });

    it("can expand a replacement form while the previous form is still rendering", async () => {
      renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      const replacement = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 100000, mostrar: 10000 });

      await vi.waitFor(() => expect(replacement.isExpanded()).toBe(true));
      expect(replacement.input("cantidadMostrar").value).toBe("10000");
    });

    it("stops waiting and cannot write into a field that appears after the timeout", async () => {
      vi.useFakeTimers();
      try {
        const page = renderMiniOrderForm({ expanded: false });
        const button = document.querySelector(".ExpandButton")!;
        button.replaceWith(button.cloneNode(true));
        miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
        await vi.advanceTimersByTimeAsync(3000);
        document.querySelector("#MiniOrderForm form")!.insertAdjacentHTML("beforeend", cantidadAMostrarRow);
        await Promise.resolve();

        expect(page.input("cantidadMostrar").value).toBe("");
        expect(vi.getTimerCount()).toBe(0);
      } finally { vi.useRealTimers(); }
    });

    it("does not throw when the Mini Order Form is not on the page", () => {
      expect(() => miniOrderForm.fill({ cantidad: 1, mostrar: 0 })).not.toThrow();
    });
  });

  describe("expandMiniOrderForm", () => {
    it("expands a collapsed Mini Order Form", () => {
      const page = renderMiniOrderForm({ expanded: false });

      expandMiniOrderForm();

      expect(page.isExpanded()).toBe(true);
    });

    it("leaves an expanded Mini Order Form expanded", () => {
      const page = renderMiniOrderForm({ expanded: true });

      expandMiniOrderForm();

      expect(page.isExpanded()).toBe(true);
    });
  });

  describe("editCantidad", () => {
    it("focuses Cantidad with its text selected", () => {
      const page = renderMiniOrderForm({ cantidad: "200000" });

      miniOrderForm.editCantidad();

      const cantidad = page.input("cantidad");
      expect(document.activeElement).toBe(cantidad);
      expect([cantidad.selectionStart, cantidad.selectionEnd]).toEqual([0, 6]);
    });

    it("does not throw when the Mini Order Form is not on the page", () => {
      expect(() => miniOrderForm.editCantidad()).not.toThrow();
    });
  });

  describe("onTicketFocus", () => {
    it("fires for Instrumento, Precio and Cantidad but not Cantidad a mostrar", () => {
      const page = renderMiniOrderForm();
      const listener = vi.fn();
      const unsubscribe = miniOrderForm.onTicketFocus(listener);

      page.input("rc_select_2").focus();
      page.input("precio").focus();
      page.input("cantidad").focus();
      page.input("cantidadMostrar").focus();
      unsubscribe();

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("keeps firing after Matriz replaces the Precio input", () => {
      const page = renderMiniOrderForm();
      const listener = vi.fn();
      const unsubscribe = miniOrderForm.onTicketFocus(listener);

      replaceInput(page.input("precio"), "71000").focus();
      unsubscribe();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(miniOrderForm.read().precio).toBe("71000");
    });

    it("stops firing once unsubscribed", () => {
      const page = renderMiniOrderForm();
      const listener = vi.fn();

      miniOrderForm.onTicketFocus(listener)();
      page.input("precio").focus();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("onLimpiar", () => {
    it("fires when the trader clicks Limpiar, including its label", () => {
      const page = renderMiniOrderForm();
      const listener = vi.fn();
      const unsubscribe = miniOrderForm.onLimpiar(listener);

      page.limpiarButton.click();
      page.limpiarButton.querySelector("span")!.click();
      unsubscribe();

      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("does not fire for a Preset button, which shares Limpiar's styling", () => {
      const page = renderMiniOrderForm();
      const listener = vi.fn();
      const unsubscribe = miniOrderForm.onLimpiar(listener);

      page.presetButton.click();
      unsubscribe();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  it("uses the new Instrumento's Preset after Matriz replaces its input", async () => {
    const page = renderMiniOrderForm({ cantidad: "1" });
    const al30Preset = { cantidad: 200000, mostrar: 20000 };
    const gd30Preset = { cantidad: 100, mostrar: 10 };
    const presetsFor = vi.fn(async (ticker: string) =>
      ticker === "AL30" ? [al30Preset] : ticker === "GD30" ? [gd30Preset] : []);
    session = createPresetSession(miniOrderForm, {
      presetsFor,
      autocompletar: async () => true,
    });
    const activeSession = session;

    page.input("rc_select_2").focus();
    await vi.waitFor(() => expect(activeSession.presets()).toEqual([al30Preset]));

    const newInstrumento = replaceInput(page.input("rc_select_2"), "GD30 (CI)");
    page.input("cantidad").value = "";
    newInstrumento.focus();

    await vi.waitFor(() => expect(page.input("cantidad").value).toBe("100"));
    expect(miniOrderForm.read()).toEqual({
      instrumento: "GD30 (CI)", ticker: "GD30", precio: "70000", cantidad: "100",
    });
    expect(presetsFor).toHaveBeenCalledWith("GD30");
    expect(activeSession.presets()).toEqual([gd30Preset]);
    expect(page.input("cantidadMostrar").value).toBe("10");
  });
});
