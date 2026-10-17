import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";
import "./SettingsMenu.css";

const barSelector = ".DirectAccessBar";
const boundarySelectors = [".HeaderDMA", barSelector, "#ToolPanel", "#MiniOrderForm"];

function bounds() {
  const [header, bar, tools, ticket] = boundarySelectors.map(selector => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0 ? rect : undefined;
  });
  return {
    top: Math.max(0, header?.bottom ?? 0), left: Math.max(0, bar?.right ?? 0),
    right: tools ? Math.max(0, innerWidth - tools.left) : 0,
    bottom: ticket ? Math.max(0, innerHeight - ticket.top) : 0,
  };
}

export function SettingsMenu() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const [position, setPosition] = useState(bounds);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const item = document.createElement("div");
    item.className = "ct-free-settings-slot";
    const attach = () => {
      const bar = document.querySelector(barSelector);
      if (bar && item.parentElement !== bar) bar.append(item);
      setSlot(bar ? item : null);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); item.remove(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = bounds();
        setPosition(previous => Object.keys(next).every(key => next[key as keyof typeof next] === previous[key as keyof typeof previous]) ? previous : next);
      });
    };
    const resize = new ResizeObserver(update);
    let observed: Element[] = [];
    const bind = () => {
      const nodes = boundarySelectors.map(selector => document.querySelector(selector)).filter((node): node is Element => node !== null);
      if (nodes.length === observed.length && nodes.every((node, index) => node === observed[index])) return;
      resize.disconnect(); observed = nodes;
      nodes.forEach(node => resize.observe(node)); update();
    };
    bind(); update();
    const mutation = new MutationObserver(bind);
    mutation.observe(document.body, { childList: true, subtree: true });
    const navigate = (event: MouseEvent) => {
      if (event.target instanceof Element) {
        const item = event.target.closest(`${barSelector} a.Item`);
        if (item && !item.closest(".ct-free-settings-slot")) setOpen(false);
      }
    };
    document.addEventListener("click", navigate, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
      document.removeEventListener("click", navigate, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  function close() {
    setOpen(false);
    slot?.querySelector<HTMLAnchorElement>("a")?.focus();
  }

  return <>
    {slot && createPortal(
      <a className={`Item ct-free-settings-item${open ? " selected" : ""}`} href="#"
        aria-label="Configuración (ChuchoTriz)" title="Configuración · ChuchoTriz"
        aria-controls="ct-free-settings-panel" aria-expanded={open} aria-current={open ? "page" : undefined}
        onClick={event => { event.preventDefault(); setPosition(bounds()); setVisited(true); setOpen(true); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <path fillRule="evenodd" d="M9.96 4.89 10.44 2.12 13.56 2.12 14.04 4.89 15.59 5.53 17.88 3.91 20.09 6.12 18.47 8.41 19.11 9.96 21.88 10.44 21.88 13.56 19.11 14.04 18.47 15.59 20.09 17.88 17.88 20.09 15.59 18.47 14.04 19.11 13.56 21.88 10.44 21.88 9.96 19.11 8.41 18.47 6.12 20.09 3.91 17.88 5.53 15.59 4.89 14.04 2.12 13.56 2.12 10.44 4.89 9.96 5.53 8.41 3.91 6.12 6.12 3.91 8.41 5.53Z M15.3 12a3.3 3.3 0 1 0-6.6 0a3.3 3.3 0 1 0 6.6 0Z" />
        </svg>
      </a>, slot)}
    {visited && <section id="ct-free-settings-panel" className="ct-free-settings-panel" style={position}
      aria-label="Configuración de ChuchoTriz" hidden={!open}
      onKeyDownCapture={event => {
        if (event.key !== "Escape") return;
        if (event.target instanceof HTMLInputElement && event.target.getAttribute("role") === "searchbox" && event.target.value) return;
        event.preventDefault(); event.stopPropagation(); close();
      }}>
      <header className="ct-free-settings-header"><h1>ChuchoTriz · Configuración</h1>
        <button ref={closeButton} type="button" aria-label="Volver a Matriz" onClick={close}>×</button>
      </header>
      <InstrumentPresetsOptions embedded />
    </section>}
  </>;
}
