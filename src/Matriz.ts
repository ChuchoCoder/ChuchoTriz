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

// Cantidad a mostrar solo existe con el Mini Order Form expandido
function expandMiniOrderForm() {
    if (!find(cantidadAMostrarSelector)) {
        find(expandButtonSelector)?.click();
    }
}

function toTicker(instrumento: string): string {
    return instrumento.replace(" (CI)", "").replace(" (24hs)", "").split(" ")[0].toUpperCase();
}

function fill(cantidad: number, cantidadAMostrar: number) {
    const cantidadInput = find<HTMLInputElement>(cantidadSelector);
    if (!cantidadInput || valueOf(instrumentoSelector) === "" || valueOf(precioSelector) === "") {
        return;
    }

    setInputValue(cantidadInput, cantidad.toString());
    expandMiniOrderForm();
    const cantidadAMostrarInput = find<HTMLInputElement>(cantidadAMostrarSelector);
    if (!cantidadAMostrarInput) {
        return;
    }
    if (Number.isInteger(cantidadAMostrar) && cantidadAMostrar > 0) {
        setInputValue(cantidadAMostrarInput, cantidadAMostrar.toString());
    }
    else {
        // Hack: Matriz tira error al limpiar la cantidad a mostrar
        setInputValue(cantidadAMostrarInput, "");
    }
}

function editCantidad() {
    const cantidadInput = find<HTMLInputElement>(cantidadSelector);
    if (cantidadInput) {
        cantidadInput.focus();
        cantidadInput.select();
        cantidadInput.setSelectionRange(0, cantidadInput.value.length);
    }
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
