// Root ESLint flat config. ESLint 10 walks upward from each linted file, so this
// one file covers all three packages; per-package differences are just
// files:-scoped entries in the same array.
//
// Why .mjs and not .js: the root package.json has no "type": "module" (the
// workspace packages declare it, the root does not). A .js config makes ESLint
// re-parse itself as ESM on every single run and print
// [MODULE_TYPELESS_PACKAGE_JSON] ... This incurs a performance overhead.
//
// Why none of this reaches the plugin runtime: ESLint is dev-time only. It emits
// no runtime code and ships nothing into dist/plugin_package/, so CLAUDE.md's
// QuickJS constraints (no Zod, no import.meta, no dynamic require) are unaffected
// by anything in this file.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "dist/**", "**/dist/**"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],

  // vue-eslint-parser must remain the top-level parser for SFCs. The TS parser is
  // nested under parserOptions so <script lang="ts"> is understood without losing
  // template analysis — hoisting it to the top level silently kills the template
  // rules, which is the most common way this config gets broken.
  {
    files: ["**/*.vue"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
  },

  // The frontend runs in a Caido webview; the backend and shared code run in
  // Caido's QuickJS host.
  {
    files: ["packages/frontend/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["packages/backend/**/*.ts", "packages/shared/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // mcp-server.mjs is a standalone Node process spawned outside the plugin
  // bundle, not part of the QuickJS bundle, so it gets real Node globals — as do
  // the root-level build configs.
  {
    files: ["**/*.mjs", "*.config.ts", "vitest.setup.ts"],
    languageOptions: { globals: globals.node },
  },

  // no-focused-tests is the reason this is here: a committed describe.only or
  // it.only reduces the suite to one test and still reports green. Grep cannot
  // see .each.only.
  { files: ["**/*.test.ts"], ...vitest.configs.recommended },

  {
    rules: {
      // The repo already marks intentionally-unused bindings with a leading
      // underscore (five _sdk RPC handler params in index.ts, _content in
      // chat.ts), so match that instead of rewriting the call sites.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Every finding for these two is PrimeVue's own camelCase public API
      // (optionLabel, optionValue, autoResize, modelValue, minSize, inputClass,
      // @update:modelValue). Hyphenating them would be a behavioural change
      // dressed up as formatting.
      "vue/attribute-hyphenation": "off",
      "vue/v-on-event-hyphenation": "off",
    },
  },

  // Inline stub components in the test files are deliberate.
  { files: ["**/*.test.ts"], rules: { "vue/one-component-per-file": "off" } },

  // MUST be last: disables every rule Prettier already owns, which is 168 of the
  // 188 baseline warnings.
  prettier,
);
