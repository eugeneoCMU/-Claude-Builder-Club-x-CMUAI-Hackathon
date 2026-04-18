import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: "client",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
        changeOrigin: true,
      },
      "/shards": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
});
