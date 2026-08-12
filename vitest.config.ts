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
    // The per-glob environment mapping that used to live here was REMOVED in
    // Vitest 4, not merely deprecated, so it was silently inert. Do not
    // re-add it: every DOM test file already selects its environment with a
    // line-1 `// @vitest-environment happy-dom` docblock.
    setupFiles: ["./vitest.setup.ts"],
  },
});
