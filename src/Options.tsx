import "./OptionsPage.css";
import React from 'react';
import ReactDOM from 'react-dom/client';
import ChuchoTrizTools from "./ChuchoTrizTools";

const root = document.createElement("div")
root.className = "container"
document.body.appendChild(root)
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <React.StrictMode>
    <ChuchoTrizTools />
  </React.StrictMode>
);
