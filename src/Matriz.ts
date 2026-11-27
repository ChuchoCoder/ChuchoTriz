import { MiniOrderForm, Ticket } from "./MiniOrderForm";
import { containsChangedElements, observePageStructure } from "./pageStructure";

// Selectores anclados en las clases propias de cada campo.
const numberInput = (formItemClass: string) =>
    `div.ant-form-item.${formItemClass} div.ant-input-number-input-wrap > input`;

const instrumentoSelector = "#rc_select_2";
const precioSelector = numberInput("MiniOrderFormQuantity-price-input");
const cantidadSelector = numberInput("MiniOrderFormQuantity-amount-input");
const ticketInputSelector = [instrumentoSelector, precioSelector, cantidadSelector].join(", ");
const cantidadAMostrarSelector = numberInput("amount-show__div");
const expandButtonSelector = "span:is(.ExpandButton, .MiniOrderForm_ButtonExpandedMiniPanel)";
const buttonsSelector = "div.MiniOrderForm_buttonsBlock";
// Hijo directo: los botones de Presets usan la misma clase ButtonLimpiar para tomar su estilo.
const limpiarButtonSelector = `#MiniOrderForm > ${buttonsSelector} > button.ButtonLimpiar`;

const currentMiniOrderForm = () => document.getElementById("MiniOrderForm");

export function observeMiniOrderForm(update: (form: HTMLElement | null, buttons: HTMLElement | null) => void) {
    let form: HTMLElement | null = null;
    const reconcile = () => {
        form = currentMiniOrderForm();
        update(form, form?.querySelector<HTMLElement>(`:scope > ${buttonsSelector}`) ?? null);
    };
    const body = document.body;
    observePageStructure(({ targets, elements }) => {
        const ticket = form;
        const insideTicket = ticket && targets.some(target => ticket.contains(target) &&
            target instanceof Element && !target.closest("#root-chuchotriz"));
        if (insideTicket || containsChangedElements(elements, "#MiniOrderForm")) reconcile();
    });
    // Matriz puede enfocar el formulario nuevo antes de que se ejecute el observador.
    body.addEventListener("focusin", ({ target }) => {
        if (target instanceof Element && target.matches(ticketInputSelector) && target.closest("#MiniOrderForm")) {
            reconcile();
        }
    }, true);
    body.addEventListener("click", ({ target }) => {
        if (target instanceof Element && target.closest(limpiarButtonSelector)) reconcile();
    }, true);
    body.addEventListener("input", ({ target }) => {
        if (target instanceof Element && target.matches(instrumentoSelector) && target.closest("#MiniOrderForm")) reconcile();
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

function normalizedQuantity(input: HTMLInputElement): string | undefined {
    const raw = input.value.trim();
    if (!raw) return "0";
    const ungrouped = raw.replaceAll(".", "");
    // Matriz uses decimal comma. The native numeric value disambiguates a lone grouping dot.
    const grouped = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw) &&
        (raw.includes(",") || input.getAttribute("aria-valuenow") === ungrouped);
    const parsed = /^(\d+)(?:[.,](\d+))?$/.exec(grouped ? ungrouped : raw);
    if (!parsed) return;
    const integer = parsed[1].replace(/^0+(?=\d)/, "");
    const decimals = parsed[2]?.replace(/0+$/, "");
    return decimals ? `${integer}.${decimals}` : integer;
}

function addPresetQuantity(input: HTMLInputElement, cantidad: number): string | undefined {
    const current = normalizedQuantity(input);
    if (current === undefined) return;
    // Only the integer part changes. Keep the exact decimals already typed in Matriz.
    const [whole, decimals] = current.split(".");
    const total = Number(whole) + cantidad;
    if (!Number.isSafeInteger(total) || total <= 0 || (decimals && total === Number.MAX_SAFE_INTEGER)) return;
    return decimals ? `${total}.${decimals}` : String(total);
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
    let pendingShownQuantity: { stop(): void; continueWithQuantity(quantity: string): void } | undefined;

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
        fill: ({ cantidad, mostrar }, sumar = false) => {
            let input = find<HTMLInputElement>(cantidadSelector);
            const instrumento = valueOf(instrumentoSelector);
            const precio = valueOf(precioSelector);
            if (!input || instrumento === "" || precio === "") return false;

            if (sumar) {
                const quantity = addPresetQuantity(input, cantidad);
                if (quantity === undefined) return false;
                if (quantity.includes(".")) {
                    const change = new CustomEvent("ct-set-fractional-draft-quantity", { detail: quantity, cancelable: true });
                    return !form.dispatchEvent(change) && isCurrent() &&
                        valueOf(instrumentoSelector) === instrumento && valueOf(precioSelector) === precio;
                }
                pendingShownQuantity?.continueWithQuantity(quantity);
                setInputValue(input, quantity);
                return isCurrent() && valueOf(instrumentoSelector) === instrumento && valueOf(precioSelector) === precio;
            }

            let revision = fillRevision;
            let quantity = cantidad.toString();
            const sameTicket = () => isCurrent() && fillRevision === revision &&
                valueOf(instrumentoSelector) === instrumento && valueOf(precioSelector) === precio;
            const showPartial = Number.isInteger(mostrar) && mostrar > 0;
            if (!showPartial) {
                // Require acknowledgment before changing the total with a potentially hidden partial.
                const clear = new Event("ct-clear-draft-display-quantity", { cancelable: true });
                if (form.dispatchEvent(clear) || !sameTicket()) return false;
                input = find<HTMLInputElement>(cantidadSelector);
                if (!input) return false;
            }
            revision = ++fillRevision;
            pendingShownQuantity?.stop();
            setInputValue(input, quantity);
            if (!showPartial) return sameTicket();
            const current = () => {
                const amount = find<HTMLInputElement>(cantidadSelector);
                return amount !== null && sameTicket() && normalizedQuantity(amount) === quantity;
            };
            if (!current()) return false;
            expand();

            const apply = () => {
                if (!current()) return true;
                const shown = find<HTMLInputElement>(cantidadAMostrarSelector);
                if (!shown) return false;
                setInputValue(shown, mostrar.toString());
                return true;
            };
            if (apply()) return current();

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
                if (pendingShownQuantity?.stop === stop) pendingShownQuantity = undefined;
            };
            const timeout = setTimeout(stop, 2000);
            const unsubscribeLimpiar = onLimpiar(stop);
            pendingShownQuantity = {
                stop,
                continueWithQuantity: next => {
                    if (current()) quantity = next;
                    else stop();
                },
            };
            for (const type of ["input", "change", "focusin"]) document.addEventListener(type, edited);
            document.addEventListener("click", collapsed);
            observer.observe(form, { childList: true, subtree: true });
            return true;
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
            pendingShownQuantity?.stop();
            stopExpansion?.();
        },
    };
}
