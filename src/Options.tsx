import "./OptionsPage.css";
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import ChuchoTrizTools, { type ChuchoTrizTool } from "./ChuchoTrizTools";

function OptionsPage() {
  const [tab, setTab] = useState<ChuchoTrizTool>("presets");
  return <ChuchoTrizTools tab={tab} onTabChange={setTab} />;
}

const root = document.createElement("div")
root.className = "container"
document.body.appendChild(root)
const rootDiv = ReactDOM.createRoot(root);
rootDiv.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
