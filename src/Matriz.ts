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

function setInputValue(input: HTMLInputElement, value: string, eventType = "change") {
    Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event(eventType, { bubbles: true }));
}

export async function preloadOptionTicket(symbol: string, price: number, quantity: number, signal: AbortSignal) {
    const form = currentMiniOrderForm();
    const instrument = form?.querySelector<HTMLInputElement>(instrumentoSelector);
    if (!form || !instrument || instrument.disabled || !form.getClientRects().length) {
        throw Error("El Mini Order Form no está disponible.");
    }
    const request = new AbortController();
    const cancel = () => request.abort();
    const interrupted = "Se interrumpió la carga en el Mini Order Form.";
    const current = () => !signal.aborted && !request.signal.aborted && currentMiniOrderForm() === form &&
        form.querySelector(instrumentoSelector) === instrument;
    const matchesSearch = () => current() && instrument.value === symbol;
    const userInteracted = (event: Event) => { if (event.isTrusted) cancel(); };
    const requireCurrent = () => {
        if (!matchesSearch()) throw Error(interrupted);
    };
    const selected = () => instrument.getAttribute("aria-expanded") === "false";
    const findInput = (selector: string) => form.querySelector<HTMLInputElement>(selector);
    const accepts = (input: HTMLInputElement, selector: string, value: number) =>
        findInput(selector) === input && !input.disabled && Number(input.getAttribute("aria-valuenow")) === value;

    // Native React controls can commit selection and numeric edits after dispatch returns.
    function waitFor<T>(read: () => T | undefined, reason: string, timeoutMs = 1000) {
        return new Promise<T>((resolve, reject) => {
            const stop = () => {
                observer.disconnect();
                clearTimeout(timeout);
                request.signal.removeEventListener("abort", abort);
                document.removeEventListener("focusin", check, true);
            };
            const fail = (message: string) => { stop(); reject(Error(message)); };
            const abort = () => fail(interrupted);
            const check = () => {
                if (!matchesSearch()) { abort(); return; }
                const result = read();
                if (result !== undefined) { stop(); resolve(result); }
            };
            const observer = new MutationObserver(check);
            const timeout = setTimeout(() => fail(reason), timeoutMs);
            request.signal.addEventListener("abort", abort);
            document.addEventListener("focusin", check, true);
            observer.observe(document.body, { childList: true, subtree: true, attributes: true,
                attributeFilter: ["aria-expanded", "aria-valuenow", "class", "title", "disabled", "value"] });
            check();
        });
    }

    if (!current()) throw Error(interrupted);
    signal.addEventListener("abort", cancel);
    document.addEventListener("pointerdown", userInteracted, true);
    document.addEventListener("keydown", userInteracted, true);
    try {
        instrument.focus();
        if (!current()) throw Error(interrupted);
        // Trigger a fresh search even when the same contract is already in the form.
        if (instrument.value === symbol) setInputValue(instrument, "", "input");
        if (!current()) throw Error(interrupted);
        setInputValue(instrument, symbol, "input");
        const option = await waitFor(() => {
            if (instrument.getAttribute("aria-expanded") !== "true") return;
            const list = document.getElementById(instrument.getAttribute("aria-controls") ?? "");
            const dropdown = list?.closest(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
            const matches = Array.from(dropdown?.querySelectorAll<HTMLElement>(
                ".ant-select-item-option:not(.ant-select-item-option-disabled)"
            ) ?? []).filter(item => item.title === symbol);
            if (matches.length === 1) return matches[0];
        }, `Matriz no encontró una coincidencia exacta para ${symbol}.`, 2500);
        requireCurrent();
        if (!option.isConnected) throw Error(interrupted);
        option.click();

        const fields = await waitFor(() => {
            const priceInput = findInput(precioSelector), quantityInput = findInput(cantidadSelector);
            // Matriz clears the draft and focuses Precio after resolving the selected security.
            // Closing the dropdown alone can happen before that lookup completes.
            if (selected() && priceInput && document.activeElement === priceInput && !priceInput.disabled &&
                !priceInput.value && quantityInput && !quantityInput.disabled && !quantityInput.value) {
                return { priceInput, quantityInput };
            }
        }, `Matriz no confirmó ${symbol} para cargar la orden.`, 2500);
        const { priceInput, quantityInput } = fields;
        requireCurrent();
        if (!selected() || findInput(precioSelector) !== priceInput) throw Error(interrupted);
        setInputValue(priceInput, price.toLocaleString("es-AR", { useGrouping: false, maximumSignificantDigits: 21 }), "input");
        await waitFor(() => selected() && accepts(priceInput, precioSelector, price) ? true : undefined,
            "Matriz no aceptó el precio indicado.");

        requireCurrent();
        if (!selected() || !accepts(priceInput, precioSelector, price) ||
            findInput(cantidadSelector) !== quantityInput || quantityInput.disabled) throw Error(interrupted);
        setInputValue(quantityInput, String(quantity), "input");
        await waitFor(() => selected() && accepts(quantityInput, cantidadSelector, quantity) ? true : undefined,
            "Matriz no aceptó la cantidad indicada.");

        requireCurrent();
        if (findInput(cantidadSelector) !== quantityInput) throw Error(interrupted);
        selectCantidad(quantityInput);
        await Promise.resolve();
        requireCurrent();
        if (!selected() || !accepts(priceInput, precioSelector, price) || !accepts(quantityInput, cantidadSelector, quantity)) {
            throw Error("Matriz cambió los datos del ticket durante la carga.");
        }
    } finally {
        signal.removeEventListener("abort", cancel);
        document.removeEventListener("pointerdown", userInteracted, true);
        document.removeEventListener("keydown", userInteracted, true);
    }
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
