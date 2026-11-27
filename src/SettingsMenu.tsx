import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChuchoTrizTools, { type ChuchoTrizTool } from "./ChuchoTrizTools";
import type { PresetEditorRequest } from "./InstrumentPresetsOptions";
import { containsChangedElements, observePageStructure } from "./pageStructure";
import chuchotrizIcon from "../public/logo48.png?inline";
import "./SettingsMenu.css";

const barSelector = ".DirectAccessBar";
const menuHash = "#chuchotriz";
const headerSelector = ".HeaderDMA";
const toolsSelector = "#ToolPanel";
const drawerSelector = "#ToolPanel .ToolContent";
const boundarySelectors = [headerSelector, barSelector, toolsSelector, drawerSelector, "#MiniOrderForm", ".MobileHeaderDma", ".MobileFooterDma"];

function bounds() {
  const [header, bar, tools, drawer, ticket, mobileHeader, mobileFooter] = boundarySelectors.map(selector => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : undefined;
  });
  return {
    top: Math.max(0, header?.bottom ?? 0, mobileHeader?.bottom ?? 0), left: Math.max(0, bar?.right ?? 0),
    right: Math.max(0, innerWidth - Math.min(tools?.left ?? innerWidth, drawer?.left ?? innerWidth)),
    bottom: Math.max(0, ticket ? innerHeight - ticket.top : 0, mobileFooter ? innerHeight - mobileFooter.top : 0),
  };
}

export type PresetSettingsRequest = PresetEditorRequest & { returnFocus: () => HTMLElement | null };

export function SettingsMenu({ presetRequest }: { presetRequest?: PresetSettingsRequest }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const [tab, setTab] = useState<ChuchoTrizTool>("ratios");
  const [position, setPosition] = useState(bounds);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<PresetSettingsRequest["returnFocus"] | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [colorScheme, setColorScheme] = useState("dark");

  function openPanel(tool: ChuchoTrizTool, resolveTrigger?: PresetSettingsRequest["returnFocus"]) {
    returnFocus.current = resolveTrigger ?? null;
    setPosition(bounds());
    setTab(tool);
    setVisited(true);
    setOpen(true);
  }

  useEffect(() => {
    const openFromUrl = (event?: HashChangeEvent) => {
      if (location.hash === menuHash) openPanel("ratios");
      else if (event && new URL(event.oldURL).hash === menuHash) setOpen(false);
    };
    openFromUrl();
    window.addEventListener("hashchange", openFromUrl);
    return () => window.removeEventListener("hashchange", openFromUrl);
  }, []);

  useEffect(() => {
    if (presetRequest) openPanel("presets", presetRequest.returnFocus);
  }, [presetRequest]);

  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open, presetRequest]);

  useEffect(() => {
    if (!open || !panel.current) return;
    let frame = 0;
    const update = () => {
      // The panel background follows Matriz's theme; its child editor has its own palette.
      const channels = getComputedStyle(panel.current!).backgroundColor.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) return;
      const [r, g, b] = channels;
      setColorScheme((r * .2126 + g * .7152 + b * .0722) > 128 ? "light" : "dark");
    };
    update();
    const observer = new MutationObserver(records => {
      if (records.every(record => panel.current?.contains(record.target))) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true,
      attributeFilter: ["class", "style", "href", "media"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open]);

  useEffect(() => {
    const item = document.createElement("div");
    item.className = "ct-free-settings-slot";
    let bar: Element | null = null;
    const attach = () => {
      bar = document.querySelector(barSelector);
      if (bar && item.parentElement !== bar) bar.append(item);
      setSlot(bar ? item : null);
    };
    attach();
    const stop = observePageStructure(({ elements }) => {
      if (bar && (!bar.isConnected || item.parentElement !== bar) || containsChangedElements(elements, barSelector)) attach();
    });
    return () => { stop(); item.remove(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = bounds();
        setPosition(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next);
        // The fixed drawer slides independently of the toolbar without resizing.
        if (document.querySelector(drawerSelector)?.getAnimations?.().some(animation => animation.pending || animation.playState === "running")) update();
      });
    };
    const resize = new ResizeObserver(update);
    const toolState = new MutationObserver(update);
    let observed: Element[] = [];
    const bind = () => {
      const nodes = boundarySelectors.map(selector => document.querySelector(selector)).filter((node): node is Element => node !== null);
      if (nodes.length === observed.length && nodes.every((node, index) => node === observed[index])) return;
      resize.disconnect(); observed = nodes;
      toolState.disconnect();
      nodes.forEach(node => {
        resize.observe(node);
        if (node.matches(`${toolsSelector}, ${drawerSelector}`)) toolState.observe(node, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
      });
      update();
    };
    bind(); update();
    const structureSelector = boundarySelectors.join(", ");
    const stop = observePageStructure(({ elements }) => {
      if (observed.some(node => !node.isConnected) || containsChangedElements(elements, structureSelector)) bind();
    });
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element) {
        const item = event.target.closest(`${barSelector} a.Item, ${headerSelector} a.NavItem`);
        if (item && !item.closest(".ct-free-settings-slot")) hidePanel();
      }
    };
    document.addEventListener("click", navigate, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); toolState.disconnect(); stop();
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function hidePanel() {
    setOpen(false);
    if (location.hash === menuHash) {
      const url = new URL(location.href);
      url.hash = "";
      history.replaceState(history.state, "", url);
    }
  }

  function close() {
    hidePanel();
    const trigger = returnFocus.current?.();
    (trigger?.isConnected ? trigger : slot?.querySelector<HTMLAnchorElement>("a"))?.focus();
  }

  return <>
    {slot && createPortal(
      <a className={`Item ct-free-settings-item${open ? " selected" : ""}`} href={menuHash}
        aria-label="Configuración (ChuchoTriz)" title="Configuración · ChuchoTriz"
        aria-controls="ct-free-settings-panel" aria-expanded={open} aria-current={open ? "page" : undefined}
        onClick={event => {
          if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const trigger = event.currentTarget;
          openPanel("ratios", () => trigger);
        }}>
        <img src={chuchotrizIcon} width="20" height="20" alt="" />
      </a>, slot)}
    {visited && <section ref={panel} id="ct-free-settings-panel" className="ct-free-settings-panel" style={position}
      data-color-scheme={colorScheme}
      aria-label="Configuración de ChuchoTriz" hidden={!open}
      onKeyDownCapture={event => {
        if (event.key !== "Escape") return;
        const popover = typeof HTMLElement.prototype.hidePopover === "function"
          ? event.currentTarget.querySelector<HTMLElement>('[popover="hint"]:popover-open')
            ?? event.currentTarget.querySelector<HTMLElement>('[popover="auto"]:popover-open') : null;
        if (popover) {
          event.preventDefault(); event.stopPropagation(); popover.hidePopover(); return;
        }
        if (event.target instanceof Element && event.target.closest("[data-ct-inline-editor]")) return;
        if (event.target instanceof HTMLInputElement && event.target.getAttribute("role") === "searchbox" && event.target.value) return;
        event.preventDefault(); event.stopPropagation(); close();
      }}>
      <ChuchoTrizTools tab={tab} onTabChange={setTab} embedded active={open} presetRequest={presetRequest} headerAction={
        <button ref={closeButton} type="button" aria-label="Volver a Matriz" onClick={close}>×</button>
      } />
    </section>}
  </>;
}
