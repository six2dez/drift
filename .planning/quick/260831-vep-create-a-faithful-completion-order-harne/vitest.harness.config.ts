import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    environment: "node",
    include: [
      ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts",
    ],
    setupFiles: [],
  },
});
