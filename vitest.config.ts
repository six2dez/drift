import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "packages/frontend/src"),
      shared: path.resolve(__dirname, "packages/shared/src"),
    },
  },
  test: {
    include: ["packages/**/src/**/*.spec.ts"],
  },
});
