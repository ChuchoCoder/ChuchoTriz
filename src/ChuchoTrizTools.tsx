import { useId, useState } from "react";
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";
import OptionsSimulator from "./optionsSimulator/OptionsSimulator";

export default function ChuchoTrizTools({ embedded = false, active = true }: { embedded?: boolean; active?: boolean }) {
  const [tab, setTab] = useState("presets");
  const [simulatorVisited, setSimulatorVisited] = useState(false);
  const id = useId();
  return <div className={`ct-tools${embedded ? " ct-tools-embedded" : ""}`}>
    <nav className="ct-tools-tabs" aria-label="Herramientas de ChuchoTriz">
      <button type="button" aria-pressed={tab === "presets"} aria-controls={`${id}-presets`} onClick={() => setTab("presets")}>Cantidades rápidas</button>
      <button type="button" aria-pressed={tab === "simulator"} aria-controls={`${id}-simulator`} onClick={() => { setSimulatorVisited(true); setTab("simulator"); }}>Simulador de opciones</button>
    </nav>
    <div id={`${id}-presets`} className="ct-tools-content" hidden={tab !== "presets"}><InstrumentPresetsOptions embedded={embedded} /></div>
    {simulatorVisited && <div id={`${id}-simulator`} className="ct-tools-content" hidden={tab !== "simulator"}><OptionsSimulator active={active && tab === "simulator"} /></div>}
  </div>;
}
