import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Build Chrome Extension
    crx({ manifest }),
  ],
  build: {
    target: "chrome107", sourcemap: false, emptyOutDir: true, modulePreload: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Group modules the Matriz content script already needs during startup.
          groups: [{
            name: "ChuchoTrizTools",
            test: /\/src\/(?:ChuchoTrizTools\.tsx|Matriz\.ts|pageStructure\.ts|optionsSimulator\/market\.ts|ratios\/RatiosDashboard\.tsx)$|\/node_modules\/react-dom\/client\.js$/,
          }],
        },
      },
    },
  },
});
