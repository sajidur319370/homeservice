import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // In development the browser talks to Vite (5173); Vite forwards /api to Express (5000).
  // Same origin for the browser → no CORS needed, in dev or in production.
  server: { proxy: { "/api": "http://localhost:5000" } },
});
