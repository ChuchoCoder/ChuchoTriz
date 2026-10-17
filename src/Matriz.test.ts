// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandMiniOrderForm, miniOrderForm } from "./Matriz";
import { createPresetSession, PresetSession } from "./PresetSession";

let session: PresetSession | undefined;

afterEach(() => {
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

    it("clears Cantidad a mostrar for a Preset that shows the whole Cantidad", () => {
      const page = renderMiniOrderForm();
      page.input("cantidadMostrar").value = "5";

      miniOrderForm.fill({ cantidad: 100000, mostrar: 0 });

      expect(page.input("cantidadMostrar").value).toBe("");
      expect(page.isExpanded()).toBe(true);
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

    it("keeps a collapsed form collapsed when a preset shows the whole quantity", () => {
      const page = renderMiniOrderForm({ expanded: false });

      miniOrderForm.fill({ cantidad: 100000, mostrar: 0 });

      expect(page.input("cantidad").value).toBe("100000");
      expect(page.isExpanded()).toBe(false);
      expect(page.input("cantidadMostrar")).toBeNull();
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
      expect(page.input("cantidadMostrar").value).toBe(mostrar ? mostrar.toString() : "");
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
