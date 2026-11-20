// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InstrumentPicker } from "./RatiosDashboard";
import type { RatioInstrument } from "./model";
const al30: RatioInstrument = { id: "al30", symbol: "AL30", market: "bm", currency: "ARS", settlement: "2" };
const ggal: RatioInstrument = { ...al30, id: "ggal", symbol: "GGAL" };
let container: HTMLDivElement, root: Root, search: ReturnType<typeof vi.fn<(query: string) => Promise<RatioInstrument[]>>>;
function Probe({ autoFocus = false, disabled = false }: { autoFocus?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState<RatioInstrument>();
  return <><InstrumentPicker label="Instrumento" value={value} onChange={setValue} search={search} disabled={disabled} autoFocus={autoFocus} /><output>{value?.id}</output></>;
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  search = vi.fn().mockResolvedValue([al30, ggal]);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function type(text: string) {
  await act(async () => {
    const input = container.querySelector("input")!; input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function blur() { await act(async () => container.querySelector("input")!.blur()); }
it("focuses the first enabled editor once and does not steal focus after subsequent updates", async () => {
  await act(async () => root.render(<Probe autoFocus disabled />));
  const input = container.querySelector("input")!;
  expect(document.activeElement).not.toBe(input);
  await act(async () => root.render(<Probe autoFocus />));
  expect(document.activeElement).toBe(input);
  const next = container.querySelector("output")!; next.tabIndex = 0;
  await act(async () => next.focus());
  await act(async () => root.render(<Probe autoFocus disabled />));
  await act(async () => root.render(<Probe autoFocus />));
  expect(document.activeElement).toBe(next);
});
it("keeps a selected instrument's suggestions closed on editor focus and opens them on explicit keyboard request", async () => {
  await act(async () => root.render(<InstrumentPicker label="Guardado" value={al30} onChange={() => {}} search={search} disabled={false} autoFocus />));
  const input = container.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  expect(input.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector('[role="listbox"]')).toBeNull();
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(input.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[role="option"]')).not.toBeNull();
});
it("selects the unique exact ticker on blur without waiting for dropdown selection", async () => {
  await type("al30"); await blur();
  expect(container.querySelector("output")!.textContent).toBe("al30");
  expect(container.querySelector("input")!.value).toBe("AL30");
});
it("resolves a typed CI alias without changing the instrument's settlement", async () => {
  search.mockResolvedValue([{ ...al30, id: "ci", symbol: "AL30 (CI)", settlement: "1" }]);
  await type("AL30 CI"); await blur();
  expect(container.querySelector("output")!.textContent).toBe("ci");
  expect(container.querySelector("input")!.value).toBe("AL30 (CI)");
});
it("does not pick an arbitrary instrument for prefixes or ambiguous exact matches", async () => {
  await type("AL3"); await blur(); expect(container.querySelector("output")!.textContent).toBe("");
  search.mockResolvedValue([al30, { ...al30, id: "another-market", market: "other" }]);
  await type("AL30"); await blur();
  expect(container.querySelector("output")!.textContent).toBe("");
  expect(container.querySelector("small")!.textContent).toContain("Más de un instrumento");
});
it("ignores a blur search that resolves after the user has typed another ticker", async () => {
  let resolveOld!: (items: RatioInstrument[]) => void;
  search.mockImplementation((query: string) => query === "AL30" ? new Promise<RatioInstrument[]>(resolve => { resolveOld = resolve; }) : Promise.resolve([ggal]));
  await type("AL30"); await blur();
  await type("GGAL"); await blur();
  await act(async () => resolveOld([al30]));
  expect(container.querySelector("output")!.textContent).toBe("ggal");
  expect(container.querySelector("input")!.value).toBe("GGAL");
});
