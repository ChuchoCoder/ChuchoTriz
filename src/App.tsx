/// <reference types="chrome" />
/// <reference types="vite-plugin-svgr/client" />

import "./App.css";
import { useState } from "react";

function App() {
  const [presetsHidden, setPresetsHidden] = useState(true);

  const miniOrderFormExpandSelector =
    "#MiniOrderForm > span.fa-chevron-circle-up";
  const miniOrderFormExpand = document.querySelector(
    miniOrderFormExpandSelector
  ) as HTMLSpanElement;

  const cantidadSelector =
    "#MiniOrderForm > form > div > span > div.ant-form-item.QuantityInputFormItem.MiniOrderFormQuantity-amount-input > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const cantidadInput = document.querySelector(
    cantidadSelector
  ) as HTMLInputElement;

  const cantidadMostrarSelector =
    "#MiniOrderForm > form > div.MiniOrderForm_FormMiniOrdenPanel_row-bottom__div > div.ant-form-item.amount-show__div.miniOrderFormItem > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";

  const instrumentoSelector = "#rc_select_2";
  const instrumentoInput = document.querySelector(
    instrumentoSelector
  ) as HTMLInputElement;

  const precioSelector =
    "#MiniOrderForm > form > div.MiniOrderForm_FormMiniOrdenPanel_row-top__div > span > div.ant-form-item.PriceInputFormItem.MiniOrderFormQuantity-price-input > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const precioInput = document.querySelector(
    precioSelector
  ) as HTMLInputElement;

  cantidadInput.addEventListener("focus", showHidePresets);
  precioInput.addEventListener("focus", showHidePresets);
  instrumentoInput.addEventListener("focus", showHidePresets);

  function instrumentAndPriceHasValues() : boolean {
    return instrumentoInput.value !== "" && precioInput.value !== "";
  }

  function showHidePresets() {
    if (instrumentAndPriceHasValues()) {
      console.log("Show Presets");
      setPresetsHidden(false);
    } else {
      console.log("Hide Presets");
      setPresetsHidden(true);
    }
  }

  //setInterval(showHidePresets, 1000);

  /*
  instrumentoInput.addEventListener("change", triggerSetSize);

  precioInput.addEventListener("change", triggerSetSize);

  function triggerSetSize() {

    console.log("triggerSetSize - instrumento: " + instrumentoInput.value + " precio: " + precioInput.value);
    if (instrumentoInput.value.toUpperCase().indexOf("AL30") >= 0 && precioInput.value !== "")
    {
      setSize(100000, 10000);
    }

  }
  */

  function setInputValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    // This will trigger a new render wor the component
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getCantidadAMostrarInput(): HTMLInputElement {
    // Buscar siempre ya que puede que no este creado el elemento
    let cantidadMostrarInput = document.querySelector(
      cantidadMostrarSelector
    ) as HTMLInputElement;

    if (!cantidadMostrarInput) {
      // Si no está creado hacer click para expandir el Mini Order Form
      miniOrderFormExpand.click();
      cantidadMostrarInput = document.querySelector(
        cantidadMostrarSelector
      ) as HTMLInputElement;
    }

    return cantidadMostrarInput;
  }

  function setSize(cantidad: number, cantidadMostrar: number) {
    console.log(`SetSize ${cantidad}/${cantidadMostrar}`);

    if (instrumentAndPriceHasValues()) {
      setInputValue(cantidadInput, cantidad.toString());
      const cantidadMostrarInput = getCantidadAMostrarInput();
      setInputValue(cantidadMostrarInput, cantidadMostrar.toString());
    }
  }

  return (
    presetsHidden ? <div></div> : 
    <div className="MiniOrderForm_buttonsBlock">      
        <button
          type="button"
          onClick={() => setSize(200000, 10000)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>200k/10k</span>
        </button>
        <button
          type="button"
          onClick={() => setSize(100000, 10000)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>100k/10k</span>
        </button>
        <button
          type="button"
          onClick={() => setSize(50000, 5000)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>50k/5k</span>
        </button>
      
    </div>    
  );
}

export default App;
