/// <reference types="chrome" />
/// <reference types="vite-plugin-svgr/client" />

import "./App.css";



function SetSize(cantidad: number, cantidadMostrar: number)
{
  console.log(`SetSize ${cantidad}/${cantidadMostrar}`);
  
  const cantidadSelector = "#MiniOrderForm > form > div > span > div.ant-form-item.QuantityInputFormItem.MiniOrderFormQuantity-amount-input > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const cantidadInput = document.querySelector(cantidadSelector) as HTMLInputElement;
  console.log(cantidadInput);
  if (cantidadInput != null) {
    cantidadInput.value = cantidad.toString();
  }
  else {
    console.log("No se encontro Cantidad");
  }

  const cantidadMostrarSelector = "#MiniOrderForm > form > div.MiniOrderForm_FormMiniOrdenPanel_row-bottom__div > div.ant-form-item.amount-show__div.miniOrderFormItem > div > div.ant-col.ant-form-item-control > div > div > div > div.ant-input-number-input-wrap > input";
  const cantidadMostrarInput = document.querySelector(cantidadMostrarSelector) as HTMLInputElement;
  if (cantidadMostrarInput != null) {
    cantidadMostrarInput.value = cantidadMostrar.toString();
  }
  else{
    console.log("No se encontro Cantidad A Mostrar");
  }
}

function App() {
  return (
    <div className="MiniOrderForm_buttonsBlock">    
        <button type="button" onClick={() => SetSize(200000, 10000)} className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"><span>200k/10k</span></button>
        <button type="button" onClick={() => SetSize(100000, 10000)} className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"><span>100k/10k</span></button>
        <button type="button" onClick={() => SetSize(50000, 5000)} className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar"><span>50k/5k</span></button>
    </div>
  );
}

export default App;
