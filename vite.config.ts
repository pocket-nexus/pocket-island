import { defineConfig } from "vite";

export default defineConfig({
  server: { strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
