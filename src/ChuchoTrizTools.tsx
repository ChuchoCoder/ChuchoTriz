import { useId, useState, type ReactNode } from "react";
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";
import OptionsOperations from "./OptionsOperations";
import OptionsSimulator from "./optionsSimulator/OptionsSimulator";
import ToolbarIcon from "./ToolbarIcon";

export default function ChuchoTrizTools({ embedded = false, active = true, headerAction }: {
  embedded?: boolean; active?: boolean; headerAction?: ReactNode;
}) {
  const [tab, setTab] = useState(embedded ? "simulator" : "presets");
  const id = useId();
  const navigation = <nav className="ct-tools-tabs" aria-label="Herramientas de ChuchoTriz">
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "simulator"} aria-controls={`${id}-simulator`}
      onClick={() => setTab("simulator")}><ToolbarIcon name="simulator" />Simulador de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "executions"} aria-controls={`${id}-executions`}
      onClick={() => setTab("executions")}><ToolbarIcon name="operations" />Operaciones de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "presets"} aria-controls={`${id}-presets`}
      onClick={() => setTab("presets")}><ToolbarIcon name="presets" />Cantidades rápidas</button>
  </nav>;
  return <div className={`ct-tools${embedded ? " ct-tools-embedded" : ""}`}>
    {embedded ? <header className="ct-free-settings-header"><h1>ChuchoTriz</h1>{navigation}{headerAction}</header> : navigation}
    <div id={`${id}-simulator`} className="ct-tools-content" hidden={tab !== "simulator"}><OptionsSimulator active={active && tab === "simulator"} marketReference={embedded} /></div>
    <div id={`${id}-executions`} className="ct-tools-content" hidden={tab !== "executions"}>
      {active && tab === "executions" && <OptionsOperations embedded={embedded} />}
    </div>
    <div id={`${id}-presets`} className="ct-tools-content" hidden={tab !== "presets"}><InstrumentPresetsOptions embedded={embedded} /></div>
  </div>;
}
