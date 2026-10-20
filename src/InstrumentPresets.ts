export interface IInstrumentPresets {
    [index: string]: IInstrumentPreset[]
}

export interface IInstrumentPreset {
    cantidad: number;
    mostrar: number | `R${number}`;
}

// El formulario siempre recibe cantidades concretas, nunca expresiones.
export interface ResolvedInstrumentPreset {
    cantidad: number;
    mostrar: number;
}

export function randomDisplayRange(cantidad: number, divisor: number): { minimum: number; maximum: number } {
    const quantity = BigInt(cantidad);
    const denominator = BigInt(divisor);
    const minimum = Math.max(1, Number(quantity / denominator));
    return { minimum, maximum: Math.max(minimum, Number(quantity * 103n / (denominator * 100n))) };
}

export function resolvePreset(preset: IInstrumentPreset): ResolvedInstrumentPreset {
    if (typeof preset.mostrar === "number") return { ...preset, mostrar: preset.mostrar };
    const divisor = Number(preset.mostrar.slice(1));
    if (!/^R\d+$/.test(preset.mostrar) || !Number.isSafeInteger(divisor) || divisor < 2) {
        throw new Error("Usá R seguido de un divisor entero desde 2, por ejemplo R5.");
    }
    // Enteros equiprobables, con extremos incluidos. Redondear hacia abajo y
    // usar al menos una unidad evita un parcial cero rechazado por ReMarkets.
    // La aritmética entera mantiene el límite del 3% incluso con cantidades grandes.
    const { minimum, maximum } = randomDisplayRange(preset.cantidad, divisor);
    return { cantidad: preset.cantidad,
        mostrar: Math.min(preset.cantidad, minimum + Math.floor(Math.random() * (maximum - minimum + 1))) };
}
