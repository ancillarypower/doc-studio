import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// base is "/" for CI and local preview; the Pages build passes --base=/doc-studio/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: "es2022", sourcemap: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
