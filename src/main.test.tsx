// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, expect, it, vi } from "vitest";

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
  await act(async () => { await import("./main"); });
  const item = document.querySelector<HTMLAnchorElement>('.DirectAccessBar [aria-label="Configuración (ChuchoTriz)"]');
  expect(item, "Configuration must be reachable from Matriz's left menu").not.toBeNull();
  await act(async () => { item!.click(); });
  const panel = document.querySelector<HTMLElement>('[aria-label="Configuración de ChuchoTriz"]');
  expect(panel).not.toBeNull();
  expect(panel!.hidden).toBe(false);
  expect(panel!.style.right, "A hidden tools panel must not consume the viewport").toBe("0px");
  expect(panel!.querySelector('[aria-label="Buscar instrumento por ticker"]')).not.toBeNull();
  await act(async () => { panel!.querySelector<HTMLButtonElement>('[aria-label="Volver a Matriz"]')!.click(); });
  expect(panel!.hidden).toBe(true);
  await act(async () => {
    document.querySelector('.DirectAccessBar')!.remove();
    document.body.insertAdjacentHTML('beforeend', '<nav class="DirectAccessBar"></nav>');
  });
  expect(document.querySelectorAll('.DirectAccessBar [aria-label="Configuración (ChuchoTriz)"]')).toHaveLength(1);
  expect(document.querySelectorAll('.ct-free-settings-slot a')).toHaveLength(1);
});
