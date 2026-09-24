import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:27183",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(dirname, "../dist-web"),
    emptyOutDir: true,
  },
});
