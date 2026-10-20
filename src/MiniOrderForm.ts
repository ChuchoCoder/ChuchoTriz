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
    // Carga Cantidad y Cantidad a mostrar; no hace nada si falta Instrumento o Precio
    // Expande para escribir ambas cantidades; espera el campo sin reutilizar un ticket modificado.
    // Mostrar todo sigue al total hasta editar el parcial, cambiar de instrumento/preset o Limpiar.
    fill(preset: ResolvedInstrumentPreset): void;
    // Hace foco en Cantidad con el texto seleccionado
    editCantidad(): void;
    // Foco en Instrumento, Precio o Cantidad. Devuelve la función para desuscribirse
    onTicketFocus(listener: () => void): () => void;
    onLimpiar(listener: () => void): () => void;
}
