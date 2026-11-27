import { Component, useEffect, useId, useState, type ComponentType, type ReactNode } from "react";
import InstrumentPresetsOptions, { type PresetEditorRequest } from "./InstrumentPresetsOptions";
import ToolbarIcon from "./ToolbarIcon";
import "./ChuchoTrizTools.css";
import "./ratios/RatiosDashboard.css";
import "./ratios/IntradayChart.css";
import "./ratios/RatioChart.css";

const loadOptionsOperations = () => import("./OptionsOperations");
const loadOptionsSimulator = () => import("./optionsSimulator/OptionsSimulator");
const loadRatioOperations = () => import("./ratios/RatioOperations");

const loadError = <p className="ct-tool-status" role="alert">No se pudo cargar esta herramienta. Recargá la página para volver a intentarlo.</p>;

class ToolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed ? loadError : this.props.children;
  }
}

type ToolModule<Props> = { default: ComponentType<Props> };

function DeferredTool<Props extends object>({ active, keepMounted = false, load, toolProps }: {
  active: boolean; keepMounted?: boolean; load: () => Promise<ToolModule<Props>>; toolProps: Props;
}) {
  const [module, setModule] = useState<ToolModule<Props> | null>();
  useEffect(() => {
    if (!active || module !== undefined) return;
    // Commit the tool as soon as its module resolves, without React's Suspense fallback delay.
    let cancelled = false;
    void load().then(
      next => { if (!cancelled) setModule(next); },
      () => { if (!cancelled) setModule(null); },
    );
    return () => { cancelled = true; };
  }, [active, load, module]);

  if (!active && (!keepMounted || !module)) return null;
  if (module === null) return loadError;
  if (!module) return <p className="ct-tool-status" role="status">Cargando herramienta…</p>;
  const Tool = module.default;
  return <ToolBoundary><Tool {...toolProps} /></ToolBoundary>;
}

export type ChuchoTrizTool = "ratios" | "simulator" | "executions" | "presets";

export default function ChuchoTrizTools({ tab, onTabChange, embedded = false, active = true, headerAction, presetRequest }: {
  tab: ChuchoTrizTool; onTabChange: (tab: ChuchoTrizTool) => void;
  embedded?: boolean; active?: boolean; headerAction?: ReactNode; presetRequest?: PresetEditorRequest;
}) {
  const id = useId();
  const navigation = <nav className="ct-tools-tabs" aria-label="Herramientas de ChuchoTriz">
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "ratios"} aria-controls={`${id}-ratios`}
      onClick={() => onTabChange("ratios")}><ToolbarIcon name="quotes" />Ratios</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "simulator"} aria-controls={`${id}-simulator`}
      onClick={() => onTabChange("simulator")}><ToolbarIcon name="simulator" />Simulador de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "executions"} aria-controls={`${id}-executions`}
      onClick={() => onTabChange("executions")}><ToolbarIcon name="operations" />Operaciones de opciones</button>
    <button type="button" className="ct-tool-icon-button" aria-pressed={tab === "presets"} aria-controls={`${id}-presets`}
      onClick={() => onTabChange("presets")}><ToolbarIcon name="presets" />Cantidades rápidas</button>
  </nav>;
  return <div className={`ct-tools${embedded ? " ct-tools-embedded" : ""}`}>
    {embedded ? <header className="ct-free-settings-header"><h1>ChuchoTriz</h1>{navigation}{headerAction}</header> : navigation}
    <div id={`${id}-ratios`} className="ct-tools-content" hidden={tab !== "ratios"}>
      <DeferredTool active={active && tab === "ratios"} keepMounted load={loadRatioOperations}
        toolProps={{ active: active && tab === "ratios" }} />
    </div>
    <div id={`${id}-simulator`} className="ct-tools-content" hidden={tab !== "simulator"}>
      <DeferredTool active={active && tab === "simulator"} keepMounted load={loadOptionsSimulator}
        toolProps={{ active: active && tab === "simulator", marketReference: embedded }} />
    </div>
    <div id={`${id}-executions`} className="ct-tools-content" hidden={tab !== "executions"}>
      <DeferredTool active={active && tab === "executions"} load={loadOptionsOperations} toolProps={{ embedded }} />
    </div>
    <div id={`${id}-presets`} className="ct-tools-content" hidden={tab !== "presets"}>
      <InstrumentPresetsOptions embedded={embedded} active={active && tab === "presets"} presetRequest={presetRequest} />
    </div>
  </div>;
}
