import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, proxy /api to the FastAPI server so the app uses same-origin URLs everywhere.
export default defineConfig({
  plugins: [react()],
  build: {
    // Recharts (with its d3 deps) is the bulk of the bundle; keep it in its own cacheable chunk.
    rollupOptions: { output: { manualChunks: { charts: ["recharts"] } } },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    proxy: { "/api": process.env.API_URL ?? "http://localhost:8000" },
  },
});
