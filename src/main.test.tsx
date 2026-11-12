// @vitest-environment jsdom
/// <reference types="node" />
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parse } from "postcss";
import { readFileSync } from "node:fs";
const optionsCss = readFileSync("src/Options.css", "utf8");
const settingsCss = readFileSync("src/SettingsMenu.css", "utf8");

// Read the shipped declarations; jsdom does not resolve custom properties or lay out CSS.
function declarations(selector: string) {
  const result: Record<string, string> = {};
  parse(optionsCss + settingsCss).walkRules(rule => {
    if (rule.selectors.includes(selector)) rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}
function resolveColor(value: string, tokens: Record<string, string>): string {
  for (let index = 0; index < 10 && value.includes("var("); index++) {
    value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_, key, fallback) => tokens[key] ?? fallback ?? "");
  }
  return value;
}
function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    if (/^#[\da-f]{3}$/i.test(hex)) hex = "#" + hex.slice(1).split("").map(channel => channel + channel).join("");
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected an opaque RGB color, got ${hex}`);
    const linear = hex.slice(1).match(/../g)!.map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

it.each(["light", "dark"])("keeps settings text, errors and primary actions legible in %s mode", scheme => {
  const tokens = { ...declarations(".options-window"),
    ...declarations(".ct-free-settings-panel .options-embedded"),
    ...declarations(`.ct-free-settings-panel[data-color-scheme="${scheme}"] .options-embedded`) };
  // Representative Matriz light colors: pale surface, gray hints and navy accent.
  const host: Record<string, string> = scheme === "light" ? { "--panel-body-background": "#f5f6fa", "--direct-access-bar-background": "#eaeaea",
    "--ant-input-background": "#ededed", "--text-color": "#30343b", "--execution-text-color": "#808080",
    "--modal-border-color": "#eaeaea", "--ant-button-text-color": "#170b52" } : {};
  const palette = { ...host, ...tokens };
  const color = (value: string) => resolveColor(value, palette);
  for (const background of ["--options-background", "--options-panel", "--options-field"]) {
    for (const foreground of ["--options-text", "--options-muted"]) {
      expect(contrast(color(`var(${foreground})`), color(`var(${background})`))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(color("var(--options-border)"), color(`var(${background})`))).toBeGreaterThanOrEqual(3);
  }
  expect(contrast(color(declarations(".options-window .raw-errors").color), color("var(--options-background)"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color("var(--options-accent)"), color("var(--options-selected)"))).toBeGreaterThanOrEqual(4.5);
  const button = declarations(".options-window button.primary-button");
  expect(contrast(color(button.color), color(button.background))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color(button.color), color("var(--options-accent-hover)"))).toBeGreaterThanOrEqual(4.5);
});

it("lets the embedded RAW editor use the available panel width", () => {
  expect(declarations(".ct-free-settings-panel .raw-presets-editor")["max-width"]).toBe("none");
});

const observers: MutationObserver[] = [];
const NativeObserver = globalThis.MutationObserver;
let stopQuoteFocus: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("MutationObserver", class extends NativeObserver {
    constructor(callback: MutationCallback) { super(callback); observers.push(this); }
  });
  vi.stubGlobal("chrome", { storage: {
    local: {
      get: vi.fn().mockResolvedValue({ InstrumentPresets: {
        AL30: [
          { cantidad: 100, mostrar: 0 },
          { cantidad: 200, mostrar: 0 },
          { cantidad: 300, mostrar: 30 },
        ],
        GD30: [{ cantidad: 400, mostrar: 0 }],
      }, Autocomplete: true }),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  } });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

afterEach(async () => {
  await act(async () => { document.getElementById("MiniOrderForm")?.remove(); });
  stopQuoteFocus?.();
  stopQuoteFocus = undefined;
  observers.splice(0).forEach(observer => observer.disconnect());
  document.body = document.createElement("body");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createForm(cantidad = "") {
  const form = document.createElement("div");
  form.id = "MiniOrderForm";
  form.innerHTML = `
    <span class="ExpandButton"></span>
    <input id="rc_select_2" value="AL30 (CI)">
    <div class="ant-form-item MiniOrderFormQuantity-price-input">
      <div class="ant-input-number-input-wrap"><input id="precio" value="70000"></div>
    </div>
    <div class="ant-form-item MiniOrderFormQuantity-amount-input">
      <div class="ant-input-number-input-wrap"><input id="cantidad" value="${cantidad}"></div>
    </div>
    <div class="MiniOrderForm_buttonsBlock"><button class="ButtonLimpiar">Limpiar</button></div>`;
  return {
    form,
    amount: form.querySelector<HTMLInputElement>("#cantidad")!,
    price: form.querySelector<HTMLInputElement>("#precio")!,
    buttons: form.querySelector(".MiniOrderForm_buttonsBlock")!,
    showPartial: (value = "") => {
      form.insertAdjacentHTML("beforeend", `
        <div class="ant-form-item amount-show__div">
          <div class="ant-input-number-input-wrap"><input id="mostrar" value="${value}"></div>
        </div>`);
      return form.querySelector<HTMLInputElement>("#mostrar")!;
    },
  };
}

it("guarda el formato regional de operaciones y lo recupera al volver a abrir la pestaña", async () => {
  const { createRoot } = await import("react-dom/client");
  const { default: OptionsOperations } = await import("./OptionsOperations");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const storageKey = "OptionsOperationsLocale";
  const saved: Record<string, unknown> = {};
  const set = vi.fn(async (value: Record<string, unknown>) => { Object.assign(saved, value); });
  vi.stubGlobal("chrome", { storage: { ...chrome.storage, local: { get: async () => ({ ...saved }), set } } });
  const select = () => host.querySelector<HTMLSelectElement>("select")!;
  try {
    await act(async () => { root.render(<OptionsOperations embedded />); });
    expect(select().value).toBe("auto");
    await act(async () => {
      select().value = "es-AR";
      select().dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(set).toHaveBeenCalledWith({ [storageKey]: "es-AR" });
    expect(select().value).toBe("es-AR");

    await act(async () => { root.render(null); });
    await act(async () => { root.render(<OptionsOperations embedded />); });
    expect(select().value).toBe("es-AR");
    await act(async () => {
      const onChanged = vi.mocked(chrome.storage.onChanged.addListener).mock.lastCall![0];
      onChanged({ [storageKey]: { oldValue: "es-AR", newValue: "en-US" } }, "local");
    });
    expect(select().value).toBe("en-US");
  } finally { await act(async () => { root.unmount(); }); }
});

function presetButton(form: HTMLElement, text: string) {
  const button = [...form.querySelectorAll<HTMLButtonElement>(".ButtonPreset")].find(preset => preset.textContent === text);
  expect(button).toBeDefined();
  return button!;
}

async function boot() {
  const startQuoteFocus = vi.spyOn(await import("./Matriz"), "focusCantidadAfterQuoteClick");
  await act(async () => { await import("./main"); });
  stopQuoteFocus = startQuoteFocus.mock.results[0]?.value;
}

function autocompleteStorage(initial: Record<string, unknown> = {}) {
  const saved: Record<string, unknown> = { ...initial };
  const emit = (values: Record<string, unknown>) => {
    Object.assign(saved, values);
    const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }]));
    for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) listener(changes, "local");
  };
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ ...saved }));
  vi.mocked(chrome.storage.local.set).mockImplementation(async values => { emit(values); });
  return { saved, emit };
}

const autocompleteCheckbox = (form: HTMLElement, ticker: string) => {
  const input = form.querySelector<HTMLInputElement>(`[aria-label="Autocompletar para ${ticker}"]`);
  expect(input).not.toBeNull();
  return input!;
};

async function changeInstrument(form: HTMLElement, value: string) {
  await act(async () => {
    const input = form.querySelector<HTMLInputElement>("#rc_select_2")!;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("starts with autocomplete off and still allows manual preset buttons", async () => {
  autocompleteStorage();
  const current = createForm();
  document.body.append(current.form);
  await boot();
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(false);
  await act(async () => { current.price.focus(); });
  expect(current.amount.value).toBe("");
  await act(async () => { presetButton(current.form, "200k").click(); });
  expect(current.amount.value).toBe("200000");
});

it("saves the checkbox per ticker, applies on future focus and keeps the choice across remounts", async () => {
  const storage = autocompleteStorage({ InstrumentPresets: {
    AL30: [{ cantidad: 100, mostrar: 0 }], GD30: [{ cantidad: 400, mostrar: 0 }],
  } });
  const current = createForm();
  document.body.append(current.form);
  await boot();
  await act(async () => { current.price.focus(); });
  expect(current.amount.value).toBe("");
  await act(async () => { autocompleteCheckbox(current.form, "AL30").focus(); autocompleteCheckbox(current.form, "AL30").click(); });
  expect(storage.saved["AutocompleteInstrument:AL30"]).toBe(true);
  expect(current.amount.value, "Toggling must not fill the current ticket").toBe("");
  await act(async () => { current.price.focus(); });
  expect(current.amount.value).toBe("100");
  await changeInstrument(current.form, "GD30 (CI)");
  expect(autocompleteCheckbox(current.form, "GD30").checked).toBe(false);
  await act(async () => { current.amount.value = ""; current.price.blur(); current.price.focus(); });
  expect(current.amount.value).toBe("");
  await act(async () => { presetButton(current.form, "400").click(); });
  expect(current.amount.value).toBe("400");
  const replacement = createForm();
  await act(async () => { current.form.replaceWith(replacement.form); });
  expect(autocompleteCheckbox(replacement.form, "AL30").checked).toBe(true);
  expect(replacement.amount.value).toBe("");
  await act(async () => { replacement.price.focus(); });
  expect(replacement.amount.value).toBe("100");
  await act(async () => { autocompleteCheckbox(replacement.form, "AL30").click(); });
  expect(replacement.amount.value, "Disabling must preserve the current quantity").toBe("100");
  await act(async () => { replacement.buttons.querySelector<HTMLButtonElement>(".ButtonLimpiar")!.click();
    replacement.amount.value = ""; replacement.price.focus(); });
  expect(replacement.amount.value).toBe("");
  expect(storage.saved["AutocompleteInstrument:AL30"]).toBe(false);
});

it("updates from global and external ticker choices, including instruments without a price or presets", async () => {
  const storage = autocompleteStorage();
  const current = createForm();
  current.price.value = "";
  document.body.append(current.form);
  await boot();
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(false);
  await act(async () => { storage.emit({ Autocomplete: true, "AutocompleteInstrument:AL30": false }); });
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(false);
  await changeInstrument(current.form, "NEW (CI)");
  expect(autocompleteCheckbox(current.form, "NEW").checked).toBe(true);
  await act(async () => { storage.emit({ "AutocompleteInstrument:NEW": false }); });
  expect(autocompleteCheckbox(current.form, "NEW").checked).toBe(false);
  await act(async () => { storage.emit({ "AutocompleteInstrument:NEW": undefined }); });
  expect(autocompleteCheckbox(current.form, "NEW").checked).toBe(true);
  await changeInstrument(current.form, "");
  expect(current.form.querySelector('input[type="checkbox"]')).toBeNull();
});

it("reports a failed checkbox save and can retry without changing the ticket", async () => {
  autocompleteStorage();
  const current = createForm("1234");
  document.body.append(current.form);
  await boot();
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("storage unavailable"));
  await act(async () => { autocompleteCheckbox(current.form, "AL30").click(); });
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(false);
  expect(current.form.querySelector('[role="alert"]')?.textContent).toContain("No se pudo guardar");
  expect(current.amount.value).toBe("1234");
  await act(async () => { autocompleteCheckbox(current.form, "AL30").click(); });
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(true);
  expect(current.form.querySelector('[role="alert"]')).toBeNull();
  expect(current.amount.value).toBe("1234");
});

it("keeps a newer external preference when an earlier save resolves late", async () => {
  const storage = autocompleteStorage();
  const current = createForm();
  document.body.append(current.form);
  await boot();
  let finishSave!: () => void;
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(async values => {
    storage.emit(values);
    await new Promise<void>(resolve => { finishSave = resolve; });
  });
  await act(async () => { autocompleteCheckbox(current.form, "AL30").click(); });
  expect(autocompleteCheckbox(current.form, "AL30").disabled).toBe(true);
  await act(async () => { storage.emit({ "AutocompleteInstrument:AL30": false }); });
  await act(async () => { finishSave(); });
  expect(autocompleteCheckbox(current.form, "AL30").checked).toBe(false);
  expect(autocompleteCheckbox(current.form, "AL30").disabled).toBe(false);
  await act(async () => { current.price.focus(); });
  expect(current.amount.value).toBe("");
});

it("mounts Configuración in the left menu even before the order form exists", async () => {
  document.body.innerHTML = `
    <header class="HeaderDMA"><a class="NavItem selected" href="/byma" aria-current="page"><span>BYMA</span></a></header>
    <nav class="DirectAccessBar"><a class="Item" href="#favoritos">Favoritos</a></nav>
    <aside id="ToolPanel" hidden></aside>`;
  let hostBackground = "rgb(245, 246, 250)";
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, "getComputedStyle").mockImplementation(element =>
    element.classList.contains("ct-free-settings-panel")
      ? { backgroundColor: hostBackground } as CSSStyleDeclaration : nativeComputedStyle(element));
  await boot();
  const item = document.querySelector<HTMLAnchorElement>('.DirectAccessBar [aria-label="Configuración (ChuchoTriz)"]');
  expect(item, "Configuration must be reachable from Matriz's left menu").not.toBeNull();
  await act(async () => { item!.click(); });
  const panel = document.querySelector<HTMLElement>('[aria-label="Configuración de ChuchoTriz"]');
  expect(panel).not.toBeNull();
  expect(panel!.hidden).toBe(false);
  expect(panel!.dataset.colorScheme).toBe("light");
  hostBackground = "rgb(33, 41, 54)";
  await act(async () => {
    document.documentElement.classList.add("matriz-dark");
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  expect(panel!.dataset.colorScheme).toBe("dark");
  hostBackground = "rgb(245, 246, 250)";
  await act(async () => {
    document.documentElement.classList.remove("matriz-dark");
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  expect(panel!.dataset.colorScheme).toBe("light");
  expect(panel!.style.right, "A hidden tools panel must not consume the viewport").toBe("0px");
  const tools = document.querySelector<HTMLElement>("#ToolPanel")!;
  tools.hidden = false;
  tools.getBoundingClientRect = () => new DOMRect(innerWidth - 40, 40, 40, 500);
  const drawer = document.createElement("div");
  drawer.className = "ToolContent slideOut";
  drawer.getBoundingClientRect = () => new DOMRect(drawer.classList.contains("slideIn") ? innerWidth - 368 : innerWidth + 2, 40, 328, 500);
  const settleLayout = () => new Promise(resolve => setTimeout(resolve, 40));
  await act(async () => { tools.append(drawer); await settleLayout(); });
  expect(panel!.style.right).toBe("40px");
  await act(async () => { drawer.className = "ToolContent slideIn"; await settleLayout(); });
  expect(panel!.style.right).toBe("368px");
  await act(async () => { drawer.className = "ToolContent slideOut"; await settleLayout(); });
  expect(panel!.style.right).toBe("40px");
  expect(panel!.querySelector('[aria-label="Buscar instrumento por ticker"]')).not.toBeNull();
  await act(async () => { panel!.querySelector<HTMLButtonElement>('[aria-label="Volver a Matriz"]')!.click(); });
  expect(panel!.hidden).toBe(true);
  computedStyle.mockClear();
  hostBackground = "rgb(33, 41, 54)";
  await act(async () => {
    document.documentElement.classList.add("matriz-dark");
    await new Promise(resolve => setTimeout(resolve, 40));
  });
  expect(computedStyle, "Hidden settings must not keep sampling market DOM updates").not.toHaveBeenCalled();
  await act(async () => { item!.click(); });
  expect(panel!.dataset.colorScheme).toBe("dark");
  await act(async () => { panel!.querySelector<HTMLButtonElement>('[aria-label="Volver a Matriz"]')!.click(); });

  const byma = document.querySelector<HTMLAnchorElement>('.HeaderDMA a[href="/byma"]')!;
  const nativeNavigation = vi.fn((event: MouseEvent) => {
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault(); // Matriz can keep the current route when BYMA is already selected.
  });
  byma.addEventListener("click", nativeNavigation);
  for (const label of ["Simulador de opciones", "Cantidades rápidas"]) {
    await act(async () => { item!.click(); });
    const tab = Array.from(panel!.querySelectorAll<HTMLButtonElement>(".ct-tools-tabs button"))
      .find(button => button.textContent === label)!;
    await act(async () => { tab.click(); });
    expect(tab.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { byma.querySelector("span")!.click(); });
    expect(panel!.hidden, `BYMA must close ${label} even on the current route`).toBe(true);
    expect(item!.getAttribute("aria-expanded")).toBe("false");
  }
  expect(nativeNavigation).toHaveBeenCalledTimes(2);

  document.documentElement.classList.remove("matriz-dark");
  await act(async () => {
    document.querySelector('.DirectAccessBar')!.remove();
    document.body.insertAdjacentHTML('beforeend', '<nav class="DirectAccessBar"></nav>');
  });
  expect(document.querySelectorAll('.DirectAccessBar [aria-label="Configuración (ChuchoTriz)"]')).toHaveLength(1);
  expect(document.querySelectorAll('.ct-free-settings-slot a')).toHaveLength(1);

  const form = document.createElement("div");
  form.id = "MiniOrderForm";
  form.innerHTML = '<span class="ExpandButton"></span><div class="MiniOrderForm_buttonsBlock"></div>';
  const expand = vi.fn();
  form.querySelector(".ExpandButton")!.addEventListener("click", expand);
  await act(async () => { document.body.append(form); });
  expect(form.querySelector("#root-chuchotriz")).not.toBeNull();
  expect(expand, "Mounting the extension must preserve the collapsed order form").not.toHaveBeenCalled();
  // Matriz can focus Cantidad first, then select Precio after loading a quote.
  form.insertAdjacentHTML("beforeend", `
    <input id="rc_select_2" value="AL30 (CI)">
    <div class="ant-form-item MiniOrderFormQuantity-price-input">
      <div class="ant-input-number-input-wrap"><input id="quote-price" value="86000,000"></div>
    </div>
    <div class="ant-form-item MiniOrderFormQuantity-amount-input">
      <div class="ant-input-number-input-wrap"><input id="quote-quantity" value="500000"></div>
    </div>`);
  const quote = document.createElement("div");
  quote.className = "PriceCell bid";
  document.body.append(quote);
  const price = document.querySelector<HTMLInputElement>("#quote-price")!;
  const quantity = document.querySelector<HTMLInputElement>("#quote-quantity")!;
  quote.addEventListener("click", () => {
    quantity.focus();
    setTimeout(() => { price.focus(); price.select(); }, 0);
  });
  await act(async () => { quote.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(document.activeElement, "A quote click must finish in Cantidad even when it already has a value").toBe(quantity);
  expect([quantity.selectionStart, quantity.selectionEnd]).toEqual([0, 6]);
  expect(price.value).toBe("86000,000");
  expect(quantity.value).toBe("500000");
  quote.remove();
  const mobileHeader = document.createElement("div"), mobileFooter = document.createElement("footer");
  mobileHeader.className = "MobileHeaderDma";
  mobileFooter.className = "MobileFooterDma";
  mobileHeader.getBoundingClientRect = () => ({ width: 360, height: 88, top: 0, bottom: 88, left: 0, right: 360 } as DOMRect);
  mobileFooter.getBoundingClientRect = () => ({ width: 360, height: 83, top: innerHeight - 83, bottom: innerHeight, left: 0, right: 360 } as DOMRect);
  await act(async () => { document.body.append(mobileHeader, mobileFooter); });
  await act(async () => { document.querySelector<HTMLAnchorElement>('.ct-free-settings-item')!.click(); });
  expect(panel!.style.top, "Keep Matriz's mobile header outside settings").toBe("88px");
  expect(panel!.style.bottom, "Keep native mobile order navigation clear of the footer actions").toBe("83px");
  await act(async () => { panel!.querySelector<HTMLButtonElement>('[aria-label="Volver a Matriz"]')!.click(); mobileHeader.remove(); mobileFooter.remove(); });
  computedStyle.mockRestore();
});

it("remounts on the new form and waits for ticket focus before applying the last chosen preset", async () => {
  const previous = createForm();
  document.body.append(previous.form);
  await boot();
  await act(async () => { presetButton(previous.form, "200").click(); });
  expect(previous.amount.value).toBe("200");

  const replacement = createForm();
  await act(async () => { previous.form.replaceWith(replacement.form); });

  expect(previous.form.querySelector("#root-chuchotriz")).toBeNull();
  expect(replacement.form.querySelectorAll("#root-chuchotriz")).toHaveLength(1);
  presetButton(replacement.form, "200");
  expect(replacement.amount.value).toBe("");
  expect(document.activeElement).not.toBe(replacement.amount);

  await act(async () => { replacement.price.focus(); });
  expect(replacement.amount.value).toBe("200");
  expect(document.activeElement).toBe(replacement.amount);

  const withoutPrice = createForm();
  withoutPrice.price.value = "";
  const afterClear = createForm();
  const limpiar = withoutPrice.form.querySelector<HTMLButtonElement>(".ButtonLimpiar")!;
  limpiar.addEventListener("click", () => { withoutPrice.form.replaceWith(afterClear.form); });
  await act(async () => {
    replacement.form.replaceWith(withoutPrice.form);
    limpiar.click();
  });
  await act(async () => { afterClear.price.focus(); });
  expect(afterClear.amount.value).toBe("100");
});

it("handles ticket focus before the replacement form gets its buttons", async () => {
  const previous = createForm();
  document.body.append(previous.form);
  await boot();
  const replacement = createForm();
  replacement.buttons.remove();
  await act(async () => {
    previous.form.replaceWith(replacement.form);
    replacement.price.focus();
    replacement.form.append(replacement.buttons);
  });

  expect(replacement.amount.value).toBe("100");
  presetButton(replacement.form, "100");
});

it("cancels a pending shown quantity when the form is replaced with identical ticket values", async () => {
  const previous = createForm();
  document.body.append(previous.form);
  await boot();
  const replacement = createForm("300");
  const shown = replacement.showPartial("5");
  await act(async () => {
    presetButton(previous.form, "300/30").click();
    previous.form.replaceWith(replacement.form);
  });

  expect(previous.amount.value).toBe("300");
  expect(replacement.amount.value).toBe("300");
  expect(shown.value).toBe("5");
  presetButton(replacement.form, "300/30");
});

it("remounts after replacing just the buttons and preserves the pending write in the same form", async () => {
  const current = createForm();
  const expand = vi.fn();
  current.form.querySelector(".ExpandButton")!.addEventListener("click", expand);
  document.body.append(current.form);
  await boot();
  const replacement = current.buttons.cloneNode(true) as HTMLElement;

  await act(async () => {
    presetButton(current.form, "300/30").click();
    current.buttons.remove();
  });
  expect(current.buttons.querySelector("#root-chuchotriz")).toBeNull();
  await act(async () => { current.form.append(replacement); });
  const shown = current.showPartial();
  await act(async () => {});

  expect(replacement.querySelectorAll("#root-chuchotriz")).toHaveLength(1);
  presetButton(replacement, "300/30");
  expect(shown.value).toBe("30");
  expect(expand).toHaveBeenCalledTimes(1);
});

it("loads the current ticket's presets when just the buttons and the instrument value change", async () => {
  const current = createForm();
  document.body.append(current.form);
  await boot();
  presetButton(current.form, "100");

  await act(async () => {
    current.form.querySelector<HTMLInputElement>("#rc_select_2")!.value = "GD30 (CI)";
    current.buttons.replaceWith(current.buttons.cloneNode(true));
  });

  expect(current.form.querySelectorAll(".ButtonPreset")).toHaveLength(1);
  presetButton(current.form, "400");
  expect(current.amount.value).toBe("");
  await act(async () => { current.price.focus(); });
  expect(current.amount.value).toBe("400");
});
