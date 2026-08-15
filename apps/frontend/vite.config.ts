import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Browser-safe only — NEVER alias to @tatachio/shared/node
      "@tatachio/shared": resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
