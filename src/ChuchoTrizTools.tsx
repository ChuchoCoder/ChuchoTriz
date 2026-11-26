import { useEffect, useId, useState, type ReactNode } from "react";
import InstrumentPresetsOptions from "./InstrumentPresetsOptions";
import OptionsOperations from "./OptionsOperations";
import OptionsSimulator from "./optionsSimulator/OptionsSimulator";
import ToolbarIcon from "./ToolbarIcon";
import RatioOperations from "./ratios/RatioOperations";

export default function ChuchoTrizTools({ embedded = false, active = true, headerAction, presetRequest }: {
  embedded?: boolean; active?: boolean; headerAction?: ReactNode; presetRequest?: { ticker: string };
}) {
  const [tab, setTab] = useState(embedded ? "simulator" : "presets");
  useEffect(() => {
    if (presetRequest) setTab("presets");
  }, [presetRequest]);
  const id = useId();
  const navigation = <nav className="ct-tools-tabs" aria-label="Herramientas de ChuchoTriz">
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "ratios"} aria-controls={`${id}-ratios`}
      onClick={() => setTab("ratios")}><ToolbarIcon name="quotes" />Ratios</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "simulator"} aria-controls={`${id}-simulator`}
      onClick={() => setTab("simulator")}><ToolbarIcon name="simulator" />Simulador de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "executions"} aria-controls={`${id}-executions`}
      onClick={() => setTab("executions")}><ToolbarIcon name="operations" />Operaciones de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "presets"} aria-controls={`${id}-presets`}
      onClick={() => setTab("presets")}><ToolbarIcon name="presets" />Cantidades rápidas</button>
  </nav>;
  return <div className={`ct-tools${embedded ? " ct-tools-embedded" : ""}`}>
    {embedded ? <header className="ct-free-settings-header"><h1>ChuchoTriz</h1>{navigation}{headerAction}</header> : navigation}
    <div id={`${id}-ratios`} className="ct-tools-content" hidden={tab !== "ratios"}><RatioOperations active={active && tab === "ratios"} /></div>
    <div id={`${id}-simulator`} className="ct-tools-content" hidden={tab !== "simulator"}><OptionsSimulator active={active && tab === "simulator"} marketReference={embedded} /></div>
    <div id={`${id}-executions`} className="ct-tools-content" hidden={tab !== "executions"}>
      {active && tab === "executions" && <OptionsOperations embedded={embedded} />}
    </div>
    <div id={`${id}-presets`} className="ct-tools-content" hidden={tab !== "presets"}>
      <InstrumentPresetsOptions embedded={embedded} active={active && tab === "presets"} presetRequest={presetRequest} />
    </div>
  </div>;
}
