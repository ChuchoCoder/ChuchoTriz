/// <reference types="chrome" />
/// <reference types="vite-plugin-svgr/client" />

import "./App.css";
import { useState } from "react";
import matriz from "./Matriz";
import { IInstrumentPreset } from "./InstrumentPresets";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";

var lastInstrumento = "";
var lastInstrumentoKey = "";
var lastPresetsClicked: { [id: string]: IInstrumentPreset; } = {};

function App() {
  const [presets, setPresets] = useState<IInstrumentPreset[]>([]);

  const showHidePresets = async () => {
    try {
      const instrumento = matriz.getInstrumentoText();
      const precio = matriz.getPrecio();
      const size = matriz.getSize();
      const instrumentoKey = instrumento + " " + precio + " " + size;
      if (lastInstrumentoKey !== instrumentoKey) {
        //console.log("Instrument changed previous: '" + lastInstrumentoKey + "' new: '" + instrumentoKey + "'");
        if (matriz.instrumentAndPriceHasValues()) {
          lastInstrumento = instrumento;
          lastInstrumentoKey = instrumentoKey;
          //console.log("Show Presets for " + instrumento);
          const ticker = matriz.getTicker();
          const instrumentPresets = await instrumentPresetsRepository.getInstrumentPresets(ticker);

          if (!matriz.hasSize()) {
            if (await instrumentPresetsRepository.readAutocomplete()) {
              if (lastPresetsClicked[instrumento]) {
                //console.log("Autocomplete presets with last clicked");
                const lastPreset = lastPresetsClicked[instrumento];
                matriz.setSize(lastPreset.cantidad, lastPreset.mostrar);
              }
              else if (instrumentPresets.length > 0) {
                //console.log("Autocomplete presets using first item");
                matriz.setSize(instrumentPresets[0].cantidad, instrumentPresets[0].mostrar);
              }
            }
          }

          // Set Presets as the last operation as this forces a refresh in React
          setPresets(instrumentPresets);
        } else {
          //console.log("Hide Presets");
          setPresets([]);
        }
      }
    }
    catch (error) {
      console.error(error);
    }
  };

  const clearLastPresetClicked = async () => {
    if (lastPresetsClicked[lastInstrumento]) {
      //console.log("Clear last preset clicked for " + lastInstrumento);
      delete lastPresetsClicked[lastInstrumento];
    }
  }

  matriz.getCantidadInput().addEventListener("focus", showHidePresets);
  matriz.getPrecioInput().addEventListener("focus", showHidePresets);
  matriz.getInstrumentoInput().addEventListener("focus", showHidePresets);
  matriz.getLimpiarButton().addEventListener("click", clearLastPresetClicked, { passive: true });

  function getCantidadText(cantidad: number): string {
    if (cantidad >= 1000000) {
      return `${cantidad / 1000000}m`;
    }
    else if (cantidad >= 1000) {
      return `${cantidad / 1000}k`;
    }
    return cantidad.toString();
  }

  function instrumentOnClick(preset: IInstrumentPreset) {
    matriz.setSize(preset.cantidad, preset.mostrar);
    lastPresetsClicked[lastInstrumento] = preset;
    //console.log("Set last preset clicked for " + lastInstrumento + " preset " + JSON.stringify(preset));
  }

  return presets.length == 0 ? (
    <div></div>
  ) : (
    <div className="MiniOrderForm_buttonsBlock">
      {presets.map((item) => (
        <button
          type="button"
          onClick={() => instrumentOnClick(item)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>
            {getCantidadText(item.cantidad)}{item.mostrar > 0 && "/" + getCantidadText(item.mostrar)}
          </span>
        </button>
      ))}
    </div>
  );
}

export default App;
