import { useState, useEffect } from "react";
import { IInstrumentPreset, IInstrumentPresets } from "./InstrumentPresets";
import instrumentPresetsRepository from "./InstrumentPresetsRepository";

function InstrumentPresets() {
  const [instrumentPresets, setInstrumentPresets] = useState("");

  useEffect(() => {
    LoadPresets();
  }, []);

  function LoadPresets() {
    instrumentPresetsRepository.read().then((presets) => {
      renderPresets(presets);
    });
  }

  function renderPresets(presets: IInstrumentPresets) {
    let presetsText = "";
    for (const key in presets) {
      var instrumentPresets = presets[key];
      presetsText += key;
      for (let preset of instrumentPresets) {
        presetsText += " " + preset.cantidad + "/" + preset.mostrar;
      }
      presetsText += "\n";
    }
    setInstrumentPresets(presetsText);
  }

  function SavePresets() {
    var presets: IInstrumentPresets = {};

    var lines = instrumentPresets.split("\n");
    for (let line of lines) {
      if (line.trim() !== "") {
        console.log("Line: " + line);
        var tickerSepIndex = line.indexOf(" ");
        var ticker = line.substring(0, tickerSepIndex);
        if (ticker.trim() !== "") {
          console.log("Ticker: " + ticker);
          var presetValues: IInstrumentPreset[] = [];
          var valuesText = line.substring(tickerSepIndex + 1);
          var values = valuesText.split(" ");
          for (let value of values) {
            const cantidades = value.split("/");
            const cantidad = Number.parseInt(cantidades[0]);
            const mostrar = Number.parseInt(cantidades[1]);
            if (cantidad && mostrar) {
              presetValues.push({ cantidad: cantidad, mostrar: mostrar });
            }
          }
          presets[ticker] = presetValues;
        }
      }
    }
    console.log("Presets: " + JSON.stringify(presets));
    instrumentPresetsRepository.save(presets);
    window.close();
  }

  function LoadDefaults() {
    renderPresets(instrumentPresetsRepository.DefaultPresets);
  }

  return (
    <div>
      Configurar las diferentes cantidades y cantidades a mostrar por cada
      instrumento.
      <div>
        <strong>Sintaxis:</strong>
      </div>
      <pre>
        Instrumento Cantidad/Cantidad_A_Mostrar Cantidad/Cantidad_A_Mostrar
        Cantidad/Cantidad_A_Mostrar
      </pre>
      Ejemplos:
      <pre>
        <pre>AL30 200000/25000 100000/10000 50000/5000</pre>
        <pre>GGAL 5000/500 1000/100</pre>
        <pre>SPY 100/25</pre>
      </pre>
      <label>
        Valores
        <textarea
          name="instrumentPresets"
          rows={20}
          cols={100}
          value={instrumentPresets}
          onChange={(e) => setInstrumentPresets(e.target.value)}
        />
      </label>
      <button name="saveInstrumentPresets" onClick={SavePresets}>
        Guardar
      </button>
      <button name="defaultInstrumentPresets" onClick={LoadDefaults}>
        Valores por defecto
      </button>
      <button name="defaultInstrumentPresets" onClick={() => window.close()}>
        Cerrar
      </button>
    </div>
  );
}

export default InstrumentPresets;
