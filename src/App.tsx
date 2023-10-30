/// <reference types="chrome" />
/// <reference types="vite-plugin-svgr/client" />

import "./App.css";

function App() {
  const cantidadSelector =
    "#MiniOrderForm > form > div > span > div.ant-form-item.QuantityInputFormItem.MiniOrderFormQuantity-amount-input > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const cantidadInput = document.querySelector(
    cantidadSelector
  ) as HTMLInputElement;

  const cantidadMostrarSelector =
    "#MiniOrderForm > form > div.MiniOrderForm_FormMiniOrdenPanel_row-bottom__div > div.ant-form-item.amount-show__div.miniOrderFormItem > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";

  /*  
  const instrumentoSelector = "#rc_select_2";
  const instrumentoInput = document.querySelector(instrumentoSelector) as HTMLInputElement;

  const precioSelector = "#MiniOrderForm > form > div.MiniOrderForm_FormMiniOrdenPanel_row-top__div > span > div.ant-form-item.PriceInputFormItem.MiniOrderFormQuantity-price-input > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const precioInput = document.querySelector(precioSelector) as HTMLInputElement;

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

  function setSize(cantidad: number, cantidadMostrar: number) {
    console.log(`SetSize ${cantidad}/${cantidadMostrar}`);

    cantidadInput.value = cantidad.toString();
    var event = new Event("input", { bubbles: true });
    cantidadInput.dispatchEvent(event);

    // Buscar siempre ya que puede que no este creado el elemento
    const cantidadMostrarInput = document.querySelector(
      cantidadMostrarSelector
    ) as HTMLInputElement;

    if (cantidadMostrarInput) {
      cantidadMostrarInput.value = cantidadMostrar.toString();
      var event = new Event("input", { bubbles: true });
      cantidadMostrarInput.dispatchEvent(event);
    }

    cantidadInput.focus();
  }

  return (
    <div className="MiniOrderForm_buttonsBlock">
      <button
        type="button"
        onClick={() => setSize(200000, 10000)}
        className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"
      >
        <span>200k/10k</span>
      </button>
      <button
        type="button"
        onClick={() => setSize(100000, 10000)}
        className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"
      >
        <span>100k/10k</span>
      </button>
      <button
        type="button"
        onClick={() => setSize(50000, 5000)}
        className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"
      >
        <span>50k/5k</span>
      </button>
    </div>
  );
}

export default App;
