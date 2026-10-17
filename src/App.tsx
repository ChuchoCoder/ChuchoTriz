/// <reference types="chrome" />

import "./App.css";
import { useSyncExternalStore } from "react";
import { label } from "./PresetBook";
import { PresetSession } from "./PresetSession";

function App({ session }: { session: PresetSession }) {
  const presets = useSyncExternalStore(session.subscribe, session.presets);

  return presets.length == 0 ? (
    <div></div>
  ) : (
    <div className="DefaultSizeShowButtons">
      {presets.map((item, index) => (
        <button
          key={`${item.cantidad}/${item.mostrar}/${index}`}
          type="button"
          onClick={() => session.choose(item)}
          className="ant-btn ant-btn-primary ant-btn-sm OrderButton ButtonLimpiar ButtonPreset"
        >
          <span>
            {label(item)}
          </span>
        </button>
      ))}
    </div>
  );
}

export default App;
