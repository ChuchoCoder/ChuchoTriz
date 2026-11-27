import { ResolvedInstrumentPreset } from "./InstrumentPresets";

// Lo que el trader cargó en el Mini Order Form
export interface Ticket {
    instrumento: string;
    ticker: string;
    precio: string;
    cantidad: string;
}

export interface MiniOrderForm {
    read(): Ticket;
    // Carga Cantidad y Cantidad a mostrar si el ticket tiene Instrumento y Precio.
    // Expande para una cantidad parcial y espera el campo mientras siga vigente el ticket.
    // En modo Sumar modifica solo Cantidad y conserva el parcial del ticket.
    // Devuelve si se pudo aplicar Cantidad.
    fill(preset: ResolvedInstrumentPreset, sumar?: boolean): boolean;
    // Hace foco en Cantidad con el texto seleccionado
    editCantidad(): void;
    // Foco en Instrumento, Precio o Cantidad. Devuelve la función para desuscribirse
    onTicketFocus(listener: () => void): () => void;
    onLimpiar(listener: () => void): () => void;
}
