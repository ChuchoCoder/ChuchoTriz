import "./Options.css";
import React from 'react';
import ReactDOM from 'react-dom/client';
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";

const root = document.createElement("div")
root.className = "container"
document.body.appendChild(root)
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <React.StrictMode>
    <h1>Opciones ChuchoTriz</h1>
    <InstrumentPresetsOptions />
  </React.StrictMode>
);
