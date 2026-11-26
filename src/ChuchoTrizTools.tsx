import { Component, lazy, Suspense, useId, useState, type ReactNode } from "react";
import InstrumentPresetsOptions, { type PresetEditorRequest } from "./InstrumentPresetsOptions";
import ToolbarIcon from "./ToolbarIcon";
import "./ChuchoTrizTools.css";
import "./ratios/RatiosDashboard.css";
import "./ratios/IntradayChart.css";
import "./ratios/RatioChart.css";

const OptionsOperations = lazy(() => import("./OptionsOperations"));
const OptionsSimulator = lazy(() => import("./optionsSimulator/OptionsSimulator"));
const RatioOperations = lazy(() => import("./ratios/RatioOperations"));

class ToolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed
      ? <p className="ct-tool-status" role="alert">No se pudo cargar esta herramienta. Recargá la página para volver a intentarlo.</p>
      : this.props.children;
  }
}

function DeferredTool({ active, keepMounted = false, children }: { active: boolean; keepMounted?: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  if (active && keepMounted && !opened) setOpened(true);
  if (!active && !opened) return null;
  return <ToolBoundary>
    <Suspense fallback={<p className="ct-tool-status" role="status">Cargando herramienta…</p>}>{children}</Suspense>
  </ToolBoundary>;
}

export default function ChuchoTrizTools({ embedded = false, active = true, headerAction, presetRequest }: {
  embedded?: boolean; active?: boolean; headerAction?: ReactNode; presetRequest?: PresetEditorRequest;
}) {
  const [tab, setTab] = useState(embedded && !presetRequest ? "simulator" : "presets");
  const [lastPresetRequest, setLastPresetRequest] = useState(presetRequest);
  // Resolve the shortcut before rendering a pane, including the first visit from the ticket.
  if (lastPresetRequest !== presetRequest) {
    setLastPresetRequest(presetRequest);
    if (presetRequest) setTab("presets");
  }
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
    <div id={`${id}-ratios`} className="ct-tools-content" hidden={tab !== "ratios"}>
      <DeferredTool active={active && tab === "ratios"} keepMounted>
        <RatioOperations active={active && tab === "ratios"} />
      </DeferredTool>
    </div>
    <div id={`${id}-simulator`} className="ct-tools-content" hidden={tab !== "simulator"}>
      <DeferredTool active={active && tab === "simulator"} keepMounted>
        <OptionsSimulator active={active && tab === "simulator"} marketReference={embedded} />
      </DeferredTool>
    </div>
    <div id={`${id}-executions`} className="ct-tools-content" hidden={tab !== "executions"}>
      <DeferredTool active={active && tab === "executions"}>
        <OptionsOperations embedded={embedded} />
      </DeferredTool>
    </div>
    <div id={`${id}-presets`} className="ct-tools-content" hidden={tab !== "presets"}>
      <InstrumentPresetsOptions embedded={embedded} active={active && tab === "presets"} presetRequest={presetRequest} />
    </div>
  </div>;
}
