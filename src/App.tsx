/// <reference types="chrome" />
/// <reference types="vite-plugin-svgr/client" />

import "./App.css";
import { useState } from "react";
import matriz from "./Matriz";
import { IInstrumentPreset } from "./InstrumentPresets";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";

var instrumento = "";

function App() {
  const [presets, setPresets] = useState<IInstrumentPreset[]>([]);

  const showHidePresets = async () => {
    const instrumentoText = matriz.getInstrumentoText();
    if (instrumento !== instrumentoText) {
      console.log("Instrument changed previous: '" + instrumento + "' new:'" + instrumentoText + "'");            
      if (matriz.instrumentAndPriceHasValues()) {
        console.log("Show Presets for " + instrumentoText);
        const ticker = matriz.getTicker();
        const instrumentPresets = await instrumentPresetsRepository.read();
        instrumento = instrumentoText;
        if (instrumentPresets[ticker]) {
          setPresets(instrumentPresets[ticker]);
        } else {
          setPresets([{ cantidad: 100, mostrar: 10 }]);
        }
      } else {
        console.log("Hide Presets");
        setPresets([]);
      }
    }
  };

  matriz.getCantidadInput().addEventListener("focus", showHidePresets);
  matriz.getPrecioInput().addEventListener("focus", showHidePresets);
  matriz.getInstrumentoInput().addEventListener("focus", showHidePresets);

  function getCantidadText(cantidad: number): string {
    if (cantidad > 1000) {
      return `${cantidad / 1000}k`;
    }
    return cantidad.toString();
  }

  return presets.length == 0 ? (
    <div></div>
  ) : (
    <div className="MiniOrderForm_buttonsBlock">
      {presets.map((item) => (
        <button
          type="button"
          onClick={() => matriz.setSize(item.cantidad, item.mostrar)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>
            {getCantidadText(item.cantidad)}/{getCantidadText(item.mostrar)}
          </span>
        </button>
      ))}
    </div>
  );
}

export default App;
