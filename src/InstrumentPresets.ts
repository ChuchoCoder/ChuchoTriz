export interface IInstrumentPresets {
    [index: string]: IInstrumentPreset[]
}

export interface IInstrumentPreset {
    cantidad: number;
    mostrar: number;
}
