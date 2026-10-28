import { MiniOrderForm } from "./MiniOrderForm";

// Selectores anclados en las clases propias de cada campo, no en la estructura completa
// de Ant Design: siguen funcionando si Matriz agrega o quita contenedores intermedios.
const numberInput = (formItemClass: string) =>
    `#MiniOrderForm div.ant-form-item.${formItemClass} div.ant-input-number-input-wrap > input`;

const instrumentoSelector = "#rc_select_2";
const precioSelector = numberInput("MiniOrderFormQuantity-price-input");
const cantidadSelector = numberInput("MiniOrderFormQuantity-amount-input");
const cantidadAMostrarSelector = numberInput("amount-show__div");
const expandButtonSelector = "#MiniOrderForm > span.ExpandButton";
// Hijo directo: los botones de Presets usan la misma clase ButtonLimpiar para tomar su estilo
const limpiarButtonSelector = "#MiniOrderForm > div.MiniOrderForm_buttonsBlock > button.ButtonLimpiar";

// Siempre se busca el elemento vigente: Matriz puede reemplazar sus inputs en cualquier momento
function find<T extends HTMLElement>(selector: string): T | null {
    return document.querySelector<T>(selector);
}

function valueOf(selector: string): string {
    return find<HTMLInputElement>(selector)?.value ?? "";
}

function setInputValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )!.set!.call(input, value);
    // This will trigger a new render wor the component
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

let pendingExpansion: { form: HTMLElement; stop: () => void } | undefined;

// Cantidad a mostrar solo existe con el Mini Order Form expandido.
// Track the UI transition separately: cancelling a write must not issue a second toggle.
function expandMiniOrderForm() {
    const form = find("#MiniOrderForm");
    if (pendingExpansion && pendingExpansion.form !== form) pendingExpansion.stop();
    if (find(cantidadAMostrarSelector)) {
        pendingExpansion?.stop();
        return;
    }
    if (pendingExpansion) return;
    const button = find(expandButtonSelector);
    if (!button || !form) return;
    const observer = new MutationObserver(() => {
        if (!form.isConnected || find(cantidadAMostrarSelector)) stop();
    });
    const stop = () => {
        observer.disconnect(); clearTimeout(timeout);
        if (pendingExpansion?.stop === stop) pendingExpansion = undefined;
    };
    const timeout = setTimeout(stop, 2000);
    pendingExpansion = { form, stop };
    observer.observe(document.body, { childList: true, subtree: true });
    button.click();
    if (find(cantidadAMostrarSelector)) stop();
}

function toTicker(instrumento: string): string {
    return instrumento.replace(" (CI)", "").replace(" (24hs)", "").split(" ")[0].toUpperCase();
}

let cancelPendingShownQuantity: (() => void) | undefined;
let cancelWholeQuantity: (() => void) | undefined;

// Mostrar todo remains a mode while the trader edits the total. A manual
// display-quantity edit takes ownership; fixed/random presets never follow it.
function followWholeQuantity(form: HTMLElement, instrumento: string, precio: string) {
    let writing = false;
    let applied = false;
    let lastQuantity = valueOf(cantidadSelector);
    const current = () => form.isConnected && form === find("#MiniOrderForm") &&
        valueOf(instrumentoSelector) === instrumento && (applied || valueOf(precioSelector) === precio);
    const sync = () => {
        if (!current()) { stop(); return; }
        const quantity = valueOf(cantidadSelector);
        const input = find<HTMLInputElement>(cantidadAMostrarSelector);
        if (!input) {
            // Preserve a deliberate collapse until the total actually changes.
            if (quantity !== lastQuantity) expandMiniOrderForm();
        } else {
            if (input.value !== quantity) {
                writing = true;
                try { setInputValue(input, quantity); }
                finally { writing = false; }
            }
            applied = true;
            clearTimeout(timeout);
        }
        lastQuantity = quantity;
    };
    const edited = (event: Event) => {
        if (writing) return;
        const target = event.target instanceof Element ? event.target : null;
        const stepping = ["click", "pointerdown"].includes(event.type) && !!target?.closest(".ant-input-number-handler-wrap") ||
            event instanceof KeyboardEvent && ["ArrowUp", "ArrowDown"].includes(event.key);
        const displayEdited = target?.closest(".amount-show__div") &&
            (["input", "change"].includes(event.type) || stepping);
        if (!current() || target?.matches(instrumentoSelector) && ["input", "change"].includes(event.type) || displayEdited) {
            stop();
        } else if (event.eventPhase !== Event.CAPTURING_PHASE && target?.closest(".MiniOrderFormQuantity-amount-input")) sync();
    };
    const observer = new MutationObserver(sync);
    const stop = () => {
        observer.disconnect(); clearTimeout(timeout); unsubscribeLimpiar();
        for (const type of ["input", "change", "click", "keyup", "pointerdown", "keydown"]) document.removeEventListener(type, edited, true);
        for (const type of ["input", "change", "click", "keyup"]) document.removeEventListener(type, edited);
        if (cancelWholeQuantity === stop) cancelWholeQuantity = undefined;
    };
    const unsubscribeLimpiar = onLimpiar(stop);
    const timeout = setTimeout(() => { if (!applied) stop(); }, 2000);
    cancelWholeQuantity = stop;
    // Relinquish manual display edits before Matriz handles/stops the event.
    for (const type of ["input", "change", "click", "keyup", "pointerdown", "keydown"]) document.addEventListener(type, edited, true);
    // Let Matriz consume the new total before writing the related field.
    for (const type of ["input", "change", "click", "keyup"]) document.addEventListener(type, edited);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
    expandMiniOrderForm();
    sync();
}

function fill(cantidad: number, cantidadAMostrar: number) {
    cancelPendingShownQuantity?.();
    cancelWholeQuantity?.();
    const cantidadInput = find<HTMLInputElement>(cantidadSelector);
    const instrumento = valueOf(instrumentoSelector);
    const precio = valueOf(precioSelector);
    if (!cantidadInput || instrumento === "" || precio === "") {
        return;
    }

    setInputValue(cantidadInput, cantidad.toString());
    const showPartial = Number.isInteger(cantidadAMostrar) && cantidadAMostrar > 0;
    // Equal total/display was accepted as no iceberg by ReMarkets. Start the
    // mode before expansion so manual total edits cannot leave a hidden partial.
    if (!showPartial) {
        followWholeQuantity(find("#MiniOrderForm")!, instrumento, precio);
        return;
    }
    expandMiniOrderForm();
    const current = () => valueOf(instrumentoSelector) === instrumento && valueOf(precioSelector) === precio &&
        valueOf(cantidadSelector) === cantidad.toString();
    const apply = () => {
        if (!current()) return true;
        const input = find<HTMLInputElement>(cantidadAMostrarSelector);
        if (!input) return false;
        setInputValue(input, cantidadAMostrar.toString());
        return true;
    };
    if (apply()) return;

    // Expansion can render on a later turn. Only the latest untouched ticket may receive this write.
    const observer = new MutationObserver(() => { if (apply()) stop(); });
    const edited = (event: Event) => {
        if (isTicketInput(event.target) && (event.type === "input" || !current())) stop();
    };
    const collapsed = (event: Event) => {
        if (event.target instanceof Element && event.target.closest(expandButtonSelector)) stop();
    };
    const stop = () => {
        observer.disconnect(); clearTimeout(timeout); unsubscribeLimpiar();
        for (const type of ["input", "change", "focusin"]) document.removeEventListener(type, edited);
        document.removeEventListener("click", collapsed);
        if (cancelPendingShownQuantity === stop) cancelPendingShownQuantity = undefined;
    };
    const timeout = setTimeout(stop, 2000);
    const unsubscribeLimpiar = onLimpiar(stop);
    cancelPendingShownQuantity = stop;
    for (const type of ["input", "change", "focusin"]) document.addEventListener(type, edited);
    document.addEventListener("click", collapsed);
    observer.observe(document.body, { childList: true, subtree: true });
}

function editCantidad() {
    const cantidadInput = find<HTMLInputElement>(cantidadSelector);
    if (cantidadInput) {
        cantidadInput.focus();
        cantidadInput.select();
        cantidadInput.setSelectionRange(0, cantidadInput.value.length);
    }
}

// Only a market quote click may redirect Matriz's subsequent Precio focus.
// Direct field clicks and keyboard navigation keep their native behavior.
export function focusCantidadAfterQuoteClick(): () => void {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    const cancel = () => {
        clearTimeout(timeout);
        timeout = undefined;
        revision++;
    };
    const clicked = (event: Event) => {
        cancel();
        if (event.target instanceof Element &&
            event.target.closest(".PriceCell, .MobilePricePanelItemLstdIsOperative") &&
            !event.target.closest("#MiniOrderForm")) {
            timeout = setTimeout(cancel, 2000);
        }
    };
    const focused = (event: Event) => {
        const input = event.target;
        if (timeout === undefined || !(input instanceof HTMLInputElement) || !input.matches(precioSelector)) return;
        clearTimeout(timeout);
        timeout = undefined;
        const request = revision;
        // Let Matriz finish focus()/select() before selecting Cantidad.
        queueMicrotask(() => {
            if (request === revision && document.activeElement === input && input.isConnected) editCantidad();
        });
    };
    document.addEventListener("click", clicked, true);
    document.addEventListener("focusin", focused, true);
    document.addEventListener("pointerdown", cancel, true);
    document.addEventListener("keydown", cancel, true);
    return () => {
        cancel();
        document.removeEventListener("click", clicked, true);
        document.removeEventListener("focusin", focused, true);
        document.removeEventListener("pointerdown", cancel, true);
        document.removeEventListener("keydown", cancel, true);
    };
}

function isTicketInput(target: EventTarget | null): boolean {
    return target instanceof Element &&
        (target.matches(instrumentoSelector) || target.matches(precioSelector) || target.matches(cantidadSelector));
}

// Se escucha en el document para no depender de que Matriz mantenga los mismos elementos
function onTicketFocus(listener: () => void): () => void {
    const handler = (event: Event) => {
        if (isTicketInput(event.target)) {
            listener();
        }
    };
    document.addEventListener("focusin", handler);
    return () => document.removeEventListener("focusin", handler);
}

function onLimpiar(listener: () => void): () => void {
    const handler = (event: Event) => {
        if (event.target instanceof Element && event.target.closest(limpiarButtonSelector)) {
            listener();
        }
    };
    document.addEventListener("click", handler, { passive: true });
    return () => document.removeEventListener("click", handler);
}

export const miniOrderForm: MiniOrderForm = {
    read: () => {
        const instrumento = valueOf(instrumentoSelector);
        return {
            instrumento,
            ticker: toTicker(instrumento),
            precio: valueOf(precioSelector),
            cantidad: valueOf(cantidadSelector),
        };
    },
    fill: (preset) => fill(preset.cantidad, preset.mostrar),
    editCantidad,
    onTicketFocus,
    onLimpiar,
};

export { expandMiniOrderForm };
