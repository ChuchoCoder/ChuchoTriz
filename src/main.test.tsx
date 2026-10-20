// @vitest-environment jsdom
/// <reference types="node" />
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
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
afterEach(() => { observers.forEach(observer => observer.disconnect()); vi.unstubAllGlobals(); });

it("mounts Configuración in the left menu even before the order form exists", async () => {
  document.body.innerHTML = '<header class="HeaderDMA"></header><nav class="DirectAccessBar"><a class="Item" href="#favoritos">Favoritos</a></nav><aside id="ToolPanel" hidden></aside>';
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("MutationObserver", class extends NativeObserver {
    constructor(callback: MutationCallback) { super(callback); observers.push(this); }
  });
  vi.stubGlobal("chrome", { storage: {
    local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  } });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  let hostBackground = "rgb(245, 246, 250)";
  const nativeComputedStyle = window.getComputedStyle.bind(window);
  const computedStyle = vi.spyOn(window, "getComputedStyle").mockImplementation(element =>
    element.classList.contains("ct-free-settings-panel")
      ? { backgroundColor: hostBackground } as CSSStyleDeclaration : nativeComputedStyle(element));
  await act(async () => { await import("./main"); });
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
