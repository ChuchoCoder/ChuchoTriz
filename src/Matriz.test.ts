// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindMiniOrderForm, focusCantidadAfterQuoteClick } from "./Matriz";
import { createPresetSession, PresetSession } from "./PresetSession";

let session: PresetSession | undefined;
let stopQuoteFocus: (() => void) | undefined;
let miniOrderForm: ReturnType<typeof bindMiniOrderForm>;
const bindings: ReturnType<typeof bindMiniOrderForm>[] = [];
new Function(readFileSync("public/mini-order-draft.js", "utf8"))();

afterEach(() => {
  vi.restoreAllMocks();
  session?.dispose();
  session = undefined;
  stopQuoteFocus?.();
  stopQuoteFocus = undefined;
  bindings.splice(0).forEach(binding => binding.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
  { instrumento = "AL30 (CI)", precio = "70000", cantidad = "", expanded = true, deferExpansion = false,
    expandButtonClass = "ExpandButton" } = {}) {
  document.body.innerHTML = `
    <div id="MiniOrderForm">
      <span class="${expandButtonClass}"></span>
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
  const draft = {
    isQuantity: true,
    security: { refData: { sizePrecision: 2 } },
    quantity: Number(cantidad.replaceAll(".", "").replace(",", ".")),
    displayQty: undefined as number | null | undefined,
    setQuantity(value: number) {
      const factor = 10 ** this.security.refData.sizePrecision;
      this.quantity = Math.floor(value * factor) / factor;
      form.querySelector<HTMLInputElement>("#cantidad")!.value = String(this.quantity).replace(".", ",");
    },
    setDisplayQuantity(value: number | null | undefined) {
      this.displayQty = value;
      const shown = form.querySelector<HTMLInputElement>("#cantidadMostrar");
      if (shown) shown.value = value == null ? "" : String(value);
    },
  };
  vi.stubGlobal("mainStore", { uiStore: { newOrderMiniPanel: draft } });
  const onDisplayEdit = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.id !== "cantidadMostrar") return;
    draft.setDisplayQuantity(event.target.value === "" ? null : Number(event.target.value));
  };
  form.addEventListener("change", onDisplayEdit);
  form.addEventListener("input", onDisplayEdit);
  miniOrderForm = bindMiniOrderForm(form);
  bindings.push(miniOrderForm);
  const showCantidadAMostrar = (show: boolean) => {
    form.querySelector(".MiniOrderForm_FormMiniOrdenPanel_row-bottom__div")?.remove();
    form.classList.toggle("ExpandedForm", show);
    if (show) {
      form.querySelector("form")!.insertAdjacentHTML("beforeend", cantidadAMostrarRow);
      draft.setDisplayQuantity(draft.displayQty);
    }
  };
  showCantidadAMostrar(expanded);
  const expandButton = form.querySelector(`.${expandButtonClass}`)!;
  expandButton.addEventListener("click", () => {
    const expand = () => showCantidadAMostrar(!form.classList.contains("ExpandedForm"));
    if (deferExpansion) queueMicrotask(expand);
    else expand();
  });

  return {
    form,
    draft,
    input: (id: string) => form.querySelector<HTMLInputElement>(`#${id}`)!,
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
  describe("quantity focus after a quote click", () => {
    function quote(className = "PriceCell askBook3") {
      const cell = document.createElement("div");
      cell.className = className;
      cell.innerHTML = '<span class="PriceCell-content">86000</span>';
      document.body.append(cell);
      return cell.firstElementChild as HTMLElement;
    }

    it.each(["PriceCell bid", "PriceCell askBook3", "PriceCell lst", "MobilePricePanelItemLstdIsOperative"])(
      "selects the current Cantidad after a delayed %s quote focus, without changing the ticket", async className => {
        const page = renderMiniOrderForm({ cantidad: "500000" });
        stopQuoteFocus = focusCantidadAfterQuoteClick();
        quote(className).click();
        await Promise.resolve();
        replaceInput(page.input("cantidad"), "1234");
        page.input("precio").focus();
        page.input("precio").select();
        await Promise.resolve();

        expect(document.activeElement).toBe(page.input("cantidad"));
        expect([page.input("cantidad").selectionStart, page.input("cantidad").selectionEnd]).toEqual([0, 4]);
        expect(miniOrderForm.read()).toEqual({ instrumento: "AL30 (CI)", ticker: "AL30", precio: "70000", cantidad: "1234" });
      });

    it("allows direct price editing and moving back to Precio after the quote", async () => {
      const page = renderMiniOrderForm();
      stopQuoteFocus = focusCantidadAfterQuoteClick();
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
      page.input("precio").blur();
      quote().click();
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("cantidad"));
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
    });

    it.each(["pointerdown", "keydown", "click"])("cancels a pending redirect on another %s interaction", async type => {
      const page = renderMiniOrderForm();
      stopQuoteFocus = focusCantidadAfterQuoteClick();
      quote().click();
      page.input("precio").dispatchEvent(new Event(type, { bubbles: true }));
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
    });

    it("expires a quote that never focused Precio", async () => {
      vi.useFakeTimers();
      const page = renderMiniOrderForm();
      stopQuoteFocus = focusCantidadAfterQuoteClick();
      quote().click();
      await vi.advanceTimersByTimeAsync(2000);
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
    });

    it("does not steal focus when the user moved away before the redirect", async () => {
      const page = renderMiniOrderForm();
      stopQuoteFocus = focusCantidadAfterQuoteClick();
      quote().click();
      page.input("precio").focus();
      page.input("cantidadMostrar").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("cantidadMostrar"));
    });

    it("removes listeners and cancels an already queued redirect when disposed", async () => {
      const page = renderMiniOrderForm();
      stopQuoteFocus = focusCantidadAfterQuoteClick();
      const cell = quote();
      cell.click();
      page.input("precio").focus();
      stopQuoteFocus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
      page.input("precio").blur();
      cell.click();
      page.input("precio").focus();
      await Promise.resolve();
      expect(document.activeElement).toBe(page.input("precio"));
    });
  });

  it("clears the R6 partial when switching to Mostrar todo and resets with Limpiar", async () => {
    const page = renderMiniOrderForm({ expanded: false });
    const whole = { cantidad: 100, mostrar: 0 };
    const fixed = { cantidad: 100, mostrar: 20 };
    const random = { cantidad: 600, mostrar: "R6" } as const;
    vi.spyOn(Math, "random").mockReturnValue(0);
    session = createPresetSession(miniOrderForm, {
      presetsFor: async () => [whole, fixed, random], autocompletar: async () => true,
    });
    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidad").value).toBe("100"));
    expect(page.isExpanded()).toBe(false);
    session.choose(fixed);
    expect(page.input("cantidadMostrar").value).toBe("20");
    session.choose(whole);
    expect(page.input("cantidadMostrar").value).toBe("");
    session.choose(random);
    expect(page.input("cantidadMostrar").value).toBe("100");
    session.choose(whole);
    expect(page.input("cantidad").value).toBe("100");
    expect(page.draft.displayQty).toBeUndefined();
    expect(page.isExpanded()).toBe(true);
    page.input("cantidad").value = "200";
    page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
    expect(page.input("cantidadMostrar").value).toBe("");
    page.limpiarButton.click();
    page.input("cantidad").value = "";
    page.input("cantidadMostrar").value = "";
    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidad").value).toBe("100"));
    expect(page.input("cantidadMostrar").value).toBe("");
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
      renderMiniOrderForm().form.remove();
      expect(miniOrderForm.read()).toEqual({ instrumento: "", ticker: "", precio: "", cantidad: "" });
    });
  });

  describe("fill", () => {
    it("adds to the current localized quantity and preserves a hidden partial", () => {
      const page = renderMiniOrderForm({ cantidad: "1.234,56", expanded: false });
      page.draft.setDisplayQuantity(100);

      expect(miniOrderForm.fill({ cantidad: 1000, mostrar: 0 }, true)).toBe(true);
      expect(page.input("cantidad").value).toBe("2234,56");
      expect(page.isExpanded()).toBe(false);
      expect(page.draft.displayQty).toBe(100);
    });

    it("keeps the intended fraction when Matriz truncates the binary quantity", () => {
      const page = renderMiniOrderForm({ cantidad: "28,14", expanded: false });
      expect(miniOrderForm.fill({ cantidad: 100, mostrar: 0 }, true)).toBe(true);
      expect(page.draft.quantity).toBe(128.14);
      expect(page.input("cantidad").value).toBe("128,14");
      expect(page.isExpanded()).toBe(false);
    });

    it("continues applying a partial when an additive click lands before expansion renders", async () => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      expect(miniOrderForm.fill({ cantidad: 10000, mostrar: 100 }, false)).toBe(true);
      expect(miniOrderForm.fill({ cantidad: 1000, mostrar: 0 }, true)).toBe(true);
      expect(page.input("cantidad").value).toBe("11000");
      await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("100"));
    });

    it("keeps the pending partial when Mostrar todo cannot be applied", async () => {
      const page = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      expect(miniOrderForm.fill({ cantidad: 10000, mostrar: 100 })).toBe(true);
      vi.stubGlobal("mainStore", undefined);
      expect(miniOrderForm.fill({ cantidad: 1000, mostrar: 0 })).toBe(false);
      expect(page.input("cantidad").value).toBe("10000");
      await vi.waitFor(() => expect(page.input("cantidadMostrar")?.value).toBe("100"));
    });

    it.each(["cantidad inválida", "9007199254740991"])("rejects an invalid sum without changing the draft (%s)", cantidad => {
      const page = renderMiniOrderForm({ cantidad });
      page.draft.setDisplayQuantity(20);
      expect(miniOrderForm.fill({ cantidad: 1, mostrar: 0 }, true)).toBe(false);
      expect(page.input("cantidad").value).toBe(cantidad);
      expect(page.draft.displayQty).toBe(20);
    });

    it("writes Cantidad and Cantidad a mostrar and lets Matriz see the change", () => {
      const page = renderMiniOrderForm();
      const changes: string[] = [];
      document.addEventListener("change", (event) => changes.push((event.target as HTMLInputElement).id));

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      expect(page.input("cantidad").value).toBe("200000");
      expect(page.input("cantidadMostrar").value).toBe("20000");
      expect(changes).toEqual(["cantidad", "cantidadMostrar"]);
    });

    it("removes the previous partial from the draft when switching to Mostrar todo", () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 200, mostrar: 20 });
      expect(page.draft.displayQty).toBe(20);

      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });

      const draft = { quantity: Number(page.input("cantidad").value), displayQty: page.draft.displayQty };
      expect(JSON.stringify(draft)).toBe('{"quantity":100}');
      expect(page.input("cantidadMostrar").value).toBe("");
      expect(page.isExpanded()).toBe(true);
    });

    it("leaves the display quantity unset as the total changes and accepts later manual edits", async () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      page.input("cantidad").value = "200";
      page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      expect(page.draft.displayQty).toBeUndefined();

      page.input("cantidadMostrar").value = "20";
      page.input("cantidadMostrar").dispatchEvent(new Event("input", { bubbles: true }));
      page.input("cantidad").value = "300";
      page.input("cantidad").dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      expect(page.draft.displayQty).toBe(20);
    });

    it("removes a hidden partial and keeps the panel closed even when the new total changes", async () => {
      const page = renderMiniOrderForm();
      miniOrderForm.fill({ cantidad: 200, mostrar: 20 });
      document.querySelector<HTMLElement>(".ExpandButton")!.click();
      expect(page.isExpanded()).toBe(false);
      expect(page.draft.displayQty).toBe(20);

      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      expect(page.input("cantidad").value).toBe("100");
      page.input("cantidad").value = "110";
      page.input("cantidad").dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
      expect(page.isExpanded()).toBe(false);
      expect(page.draft.displayQty).toBeUndefined();
      document.querySelector<HTMLElement>(".ExpandButton")!.click();
      expect(page.input("cantidadMostrar").value).toBe("");
    });

    it("leaves the previous quantity intact if Matriz cannot safely clear the draft", () => {
      const page = renderMiniOrderForm({ expanded: false, cantidad: "200" });
      page.draft.displayQty = 20;
      vi.stubGlobal("mainStore", undefined);
      miniOrderForm.fill({ cantidad: 100, mostrar: 0 });
      expect(page.input("cantidad").value).toBe("200");
      expect(page.draft.displayQty).toBe(20);
      expect(page.isExpanded()).toBe(false);
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

    it.each(["ExpandButton", "MiniOrderForm_ButtonExpandedMiniPanel"])("expands to reach Cantidad a mostrar with %s", expandButtonClass => {
      const page = renderMiniOrderForm({ expanded: false, expandButtonClass });

      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });

      expect(page.isExpanded()).toBe(true);
      expect(page.input("cantidadMostrar").value).toBe("20000");
    });

    it("keeps a collapsed form collapsed when a preset shows the whole quantity", async () => {
      const page = renderMiniOrderForm({ expanded: false });

      miniOrderForm.fill({ cantidad: 100000, mostrar: 0 });
      await Promise.resolve();

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
      expect(page.draft.displayQty).toBe(mostrar || undefined);
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

    it("invalidates a pending write by form identity before disposing the binding", async () => {
      const previous = renderMiniOrderForm({ expanded: false, deferExpansion: true });
      miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
      const replacement = renderMiniOrderForm({ cantidad: "200000" });

      await vi.waitFor(() => expect(previous.isExpanded()).toBe(true));
      expect(previous.input("cantidadMostrar").value).toBe("");
      expect(replacement.input("cantidadMostrar").value).toBe("");
    });

    it.each(["timeout", "dispose"])("stops waiting and cannot write into a field that appears after %s", async stop => {
      vi.useFakeTimers();
      try {
        const page = renderMiniOrderForm({ expanded: false });
        const button = document.querySelector(".ExpandButton")!;
        button.replaceWith(button.cloneNode(true));
        miniOrderForm.fill({ cantidad: 200000, mostrar: 20000 });
        if (stop === "timeout") await vi.advanceTimersByTimeAsync(3000);
        else miniOrderForm.dispose();
        document.querySelector("#MiniOrderForm form")!.insertAdjacentHTML("beforeend", cantidadAMostrarRow);
        await Promise.resolve();

        expect(page.input("cantidadMostrar").value).toBe("");
        expect(vi.getTimerCount()).toBe(0);
      } finally { vi.useRealTimers(); }
    });

    it("does not throw when the Mini Order Form is not on the page", () => {
      renderMiniOrderForm().form.remove();
      expect(() => miniOrderForm.fill({ cantidad: 1, mostrar: 0 })).not.toThrow();
    });

    it("does not toggle an already expanded Mini Order Form for a partial preset", () => {
      const page = renderMiniOrderForm({ expanded: true });
      const toggle = vi.fn();
      page.form.querySelector(".ExpandButton")!.addEventListener("click", toggle);

      miniOrderForm.fill({ cantidad: 100, mostrar: 10 });

      expect(toggle).not.toHaveBeenCalled();
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
      renderMiniOrderForm().form.remove();
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

  it("applies another preset after the trader changes Precio and clicks its button", async () => {
    const page = renderMiniOrderForm();
    const first = { cantidad: 200000, mostrar: 20000 };
    const second = { cantidad: 100000, mostrar: 10000 };
    session = createPresetSession(miniOrderForm, {
      presetsFor: async () => [first, second],
      autocompletar: async () => true,
    });
    page.presetButton.addEventListener("click", () => session?.choose(second));

    page.input("precio").focus();
    await vi.waitFor(() => expect(page.input("cantidad").value).toBe("200000"));
    page.input("precio").value = "69000";
    page.input("precio").dispatchEvent(new Event("change", { bubbles: true }));
    page.presetButton.click();

    expect(page.input("precio").value).toBe("69000");
    expect(page.input("cantidad").value).toBe("100000");
    expect(page.input("cantidadMostrar").value).toBe("10000");
  });
});
