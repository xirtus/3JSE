import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@galacean/editor-ui";
import { App } from "./App.js";

// StrictMode is deliberately omitted: it double-invokes effects in dev, and the Viewport's
// effect owns a real WebGPU context + async renderer.init() — double-mounting it is a real
// bug risk, not a false positive worth chasing down for this first pass.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
