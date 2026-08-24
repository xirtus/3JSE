import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // WebGPU requires a secure context; localhost counts, so no extra config needed there.
    port: 5173,
  },
});
