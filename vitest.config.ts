import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { defineConfig } from "vitest/config";

const frontendPkg = path.resolve(__dirname, "packages/frontend");

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      vue: path.resolve(frontendPkg, "node_modules/vue"),
      pinia: path.resolve(frontendPkg, "node_modules/pinia"),
    },
  },
  test: {
    environmentMatchGlobs: [
      ["packages/frontend/src/views/**/*.test.ts", "happy-dom"],
      ["packages/frontend/src/components/**/*.test.ts", "happy-dom"],
    ],
  },
});
