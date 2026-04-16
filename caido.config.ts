import { defineConfig } from "@caido-community/dev";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "tailwindcss";
// @ts-expect-error no declared types at this time
import tailwindPrimeui from "tailwindcss-primeui";
import tailwindCaido from "@caido/tailwindcss";
import path from "path";
import prefixwrap from "postcss-prefixwrap";
import type { UserConfig } from "vite";

const id = "drift";
export default defineConfig({
  id,
  name: "Drift",
  description: "Security copilot for manual web security testing in Caido (MCP + local CLI)",
  version: "0.1.0",
  author: {
    name: "six2dez",
    email: "six2dez@gmail.com",
    url: "https://github.com/six2dez",
  },
  plugins: [
    {
      kind: "backend",
      id: "backend",
      root: "packages/backend",
      // Asset globs are resolved by caido-dev from the workspace root (cwd),
      // not the plugin root, so the path must be repo-relative.
      assets: ["./packages/backend/assets/**/*"],
    },
    {
      kind: "frontend",
      id: "frontend",
      root: "packages/frontend",
      backend: {
        id: "backend",
      },
      vite: {
        plugins: [vue()],
        build: {
          sourcemap: false,
          reportCompressedSize: false,
          rollupOptions: {
            external: ["@caido/frontend-sdk", "vue"],
          },
        },
        resolve: {
          alias: [
            {
              find: "@",
              replacement: path.resolve(__dirname, "packages/frontend/src"),
            },
          ],
        },
        css: {
          postcss: {
            // @ts-expect-error Tailwind and Caido resolve different PostCSS type trees here.
            plugins: [
              prefixwrap(`#plugin--${id}`),
              tailwindcss({
                corePlugins: {
                  preflight: false,
                },
                content: [
                  "./packages/frontend/src/**/*.{vue,ts}",
                  "./node_modules/@caido/primevue/dist/primevue.mjs",
                ],
                darkMode: ["selector", '[data-mode="dark"]'],
                plugins: [tailwindPrimeui, tailwindCaido],
              }),
            ],
          },
        },
      } as UserConfig,
    },
  ],
});
