import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rawPort = process.env.PORT ?? "5174";
const port = Number(rawPort);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  root: path.resolve(import.meta.dirname),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
