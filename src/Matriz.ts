import { MiniOrderForm, Ticket } from "./MiniOrderForm";

// Selectores anclados en las clases propias de cada campo.
const numberInput = (formItemClass: string) =>
    `div.ant-form-item.${formItemClass} div.ant-input-number-input-wrap > input`;

const instrumentoSelector = "#rc_select_2";
const precioSelector = numberInput("MiniOrderFormQuantity-price-input");
const cantidadSelector = numberInput("MiniOrderFormQuantity-amount-input");
const ticketInputSelector = [instrumentoSelector, precioSelector, cantidadSelector].join(", ");
const cantidadAMostrarSelector = numberInput("amount-show__div");
const expandButtonSelector = "span.ExpandButton";
const buttonsSelector = "div.MiniOrderForm_buttonsBlock";
// Hijo directo: los botones de Presets usan la misma clase ButtonLimpiar para tomar su estilo.
const limpiarButtonSelector = `#MiniOrderForm > ${buttonsSelector} > button.ButtonLimpiar`;

const currentMiniOrderForm = () => document.getElementById("MiniOrderForm");

export function observeMiniOrderForm(update: (form: HTMLElement | null, buttons: HTMLElement | null) => void) {
    const reconcile = () => {
        const form = currentMiniOrderForm();
        update(form, form?.querySelector<HTMLElement>(`:scope > ${buttonsSelector}`) ?? null);
    };
    const body = document.body;
    new MutationObserver(reconcile).observe(body, { childList: true, subtree: true });
    // Matriz puede enfocar el formulario nuevo antes de que se ejecute el observador.
    body.addEventListener("focusin", ({ target }) => {
        if (target instanceof Element && target.matches(ticketInputSelector) && target.closest("#MiniOrderForm")) {
            reconcile();
        }
    }, true);
    body.addEventListener("click", ({ target }) => {
        if (target instanceof Element && target.closest(limpiarButtonSelector)) reconcile();
    }, true);
    reconcile();
}

function setInputValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function toTicker(instrumento: string): string {
    return instrumento.replace(" (CI)", "").replace(" (24hs)", "").split(" ")[0].toUpperCase();
}

function selectCantidad(input: HTMLInputElement | null) {
    if (input) {
        input.focus();
        input.select();
        input.setSelectionRange(0, input.value.length);
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
        const form = currentMiniOrderForm();
        if (!form?.contains(input)) return;
        clearTimeout(timeout);
        timeout = undefined;
        const request = revision;
        // Let Matriz finish focus()/select() before selecting Cantidad.
        queueMicrotask(() => {
            if (request === revision && document.activeElement === input && currentMiniOrderForm() === form) {
                selectCantidad(form.querySelector<HTMLInputElement>(cantidadSelector));
            }
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

export function bindMiniOrderForm(form: HTMLElement): MiniOrderForm & { dispose(): void } {
    let disposed = false;
    let fillRevision = 0;
    let stopExpansion: (() => void) | undefined;
    let cancelPendingShownQuantity: (() => void) | undefined;
    let cancelWholeQuantity: (() => void) | undefined;

    const isCurrent = () => !disposed && currentMiniOrderForm() === form;
    // Matriz puede reemplazar un input dentro del mismo formulario.
    const find = <T extends HTMLElement>(selector: string) =>
        isCurrent() ? form.querySelector<T>(selector) : null;
    const valueOf = (selector: string) => find<HTMLInputElement>(selector)?.value ?? "";
    const inForm = (target: EventTarget | null): target is Element =>
        target instanceof Element && isCurrent() && form.contains(target);
    const isTicketInput = (target: EventTarget | null) => inForm(target) && target.matches(ticketInputSelector);

    function onLimpiar(listener: () => void) {
        const handler = (event: Event) => {
            if (inForm(event.target) && event.target.closest(limpiarButtonSelector)) listener();
        };
        // Limpiar puede reemplazar el formulario en el propio handler de Matriz.
        form.addEventListener("click", handler, { capture: true, passive: true });
        return () => form.removeEventListener("click", handler, true);
    }

    // La expansión y la escritura tienen ciclos independientes. Cancelar la escritura
    // durante la expansión conserva el toggle que ya está en curso.
    function expand() {
        if (stopExpansion || find(cantidadAMostrarSelector)) return;
        const button = find(`:scope > ${expandButtonSelector}`);
        if (!button) return;
        const observer = new MutationObserver(() => {
            if (!isCurrent() || find(cantidadAMostrarSelector)) stop();
        });
        const stop = () => {
            observer.disconnect();
            clearTimeout(timeout);
            stopExpansion = undefined;
        };
        const timeout = setTimeout(stop, 2000);
        stopExpansion = stop;
        observer.observe(form, { childList: true, subtree: true });
        button.click();
        if (!isCurrent() || find(cantidadAMostrarSelector)) stop();
    }

    // Mostrar todo sigue al total mientras el trader edita el ticket.
    function followWholeQuantity(instrumento: string, precio: string, revision: number) {
        let writing = false;
        let applied = false;
        let lastQuantity = valueOf(cantidadSelector);
        const current = () => isCurrent() && fillRevision === revision &&
            valueOf(instrumentoSelector) === instrumento && (applied || valueOf(precioSelector) === precio);
        const sync = () => {
            if (!current()) { stop(); return; }
            const quantity = valueOf(cantidadSelector);
            const input = find<HTMLInputElement>(cantidadAMostrarSelector);
            if (!input) {
                // Preserve a deliberate collapse until the total actually changes.
                if (quantity !== lastQuantity) expand();
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
            const target = inForm(event.target) ? event.target : null;
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
            observer.disconnect();
            clearTimeout(timeout);
            unsubscribeLimpiar();
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
        observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ["value"] });
        expand();
        sync();
    }

    function read(): Ticket {
        const instrumento = valueOf(instrumentoSelector);
        return {
            instrumento,
            ticker: toTicker(instrumento),
            precio: valueOf(precioSelector),
            cantidad: valueOf(cantidadSelector),
        };
    }

    return {
        read,
        fill: ({ cantidad, mostrar }) => {
            const revision = ++fillRevision;
            cancelPendingShownQuantity?.();
            cancelWholeQuantity?.();
            const input = find<HTMLInputElement>(cantidadSelector);
            const instrumento = valueOf(instrumentoSelector);
            const precio = valueOf(precioSelector);
            if (!input || instrumento === "" || precio === "") return;

            const quantity = cantidad.toString();
            const sameTicket = () => isCurrent() && fillRevision === revision &&
                valueOf(instrumentoSelector) === instrumento && valueOf(precioSelector) === precio;
            setInputValue(input, quantity);
            if (!sameTicket()) return;
            const showPartial = Number.isInteger(mostrar) && mostrar > 0;
            if (!showPartial) {
                followWholeQuantity(instrumento, precio, revision);
                return;
            }
            const current = () => sameTicket() && valueOf(cantidadSelector) === quantity;
            if (!current()) return;
            expand();

            const apply = () => {
                if (!current()) return true;
                const shown = find<HTMLInputElement>(cantidadAMostrarSelector);
                if (!shown) return false;
                setInputValue(shown, mostrar.toString());
                return true;
            };
            if (apply()) return;

            const observer = new MutationObserver(() => { if (apply()) stop(); });
            const edited = (event: Event) => {
                if (isTicketInput(event.target) && (event.type === "input" || !current())) stop();
            };
            const collapsed = (event: Event) => {
                if (inForm(event.target) && event.target.closest(expandButtonSelector)?.parentElement === form) stop();
            };
            const stop = () => {
                observer.disconnect();
                clearTimeout(timeout);
                unsubscribeLimpiar();
                for (const type of ["input", "change", "focusin"]) document.removeEventListener(type, edited);
                document.removeEventListener("click", collapsed);
                if (cancelPendingShownQuantity === stop) cancelPendingShownQuantity = undefined;
            };
            const timeout = setTimeout(stop, 2000);
            const unsubscribeLimpiar = onLimpiar(stop);
            cancelPendingShownQuantity = stop;
            for (const type of ["input", "change", "focusin"]) document.addEventListener(type, edited);
            document.addEventListener("click", collapsed);
            observer.observe(form, { childList: true, subtree: true });
        },
        editCantidad: () => selectCantidad(find<HTMLInputElement>(cantidadSelector)),
        onTicketFocus: (listener) => {
            // Escuchamos en el document para seguir el orden de eventos de Matriz.
            const handler = (event: Event) => { if (isTicketInput(event.target)) listener(); };
            document.addEventListener("focusin", handler);
            return () => document.removeEventListener("focusin", handler);
        },
        onLimpiar,
        dispose: () => {
            disposed = true;
            cancelPendingShownQuantity?.();
            cancelWholeQuantity?.();
            stopExpansion?.();
        },
    };
}
