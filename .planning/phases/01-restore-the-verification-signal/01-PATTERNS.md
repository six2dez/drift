# Phase 1: Restore the Verification Signal - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 9 (2 new source, 1 new test, 6 modified)
**Analogs found:** 7 / 9 (2 genuinely have no analog — see `## No Analog Found`)

> This is a **tooling phase**. Six of the nine files are configs or edits to files that are their own best analog. The high-value analogs are concentrated in the two test files and in `settings.ts`. Weight your reading accordingly.

---

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `packages/frontend/src/stores/settings.ts` | MODIFY | store (Pinia setup-store) | request-response (RPC sync) | itself, `packages/frontend/src/utils/http-parse.ts:16` + `packages/backend/src/command-resolution.ts:47` for the guard shape | exact (in-place) + role-match |
| `packages/frontend/src/stores/settings.test.ts` | MODIFY | test (unit, node env) | request-response | itself, lines 116–145 | exact (in-place) |
| `packages/frontend/src/__storage-shim.test.ts` | NEW | test (unit, happy-dom env) | transform / assertion-only | `packages/frontend/src/components/chat/MessageList.test.ts:1-4` (docblock + import order) + `packages/frontend/src/utils/http-parse.test.ts:1-2` (zero-mock shape) | role-match |
| `vitest.config.ts` | MODIFY | config (test harness) | — | itself, lines 15–20 | exact (in-place) |
| `vitest.setup.ts` | NEW | config (test-harness bootstrap module) | side-effecting init | **none** | no-analog |
| `eslint.config.mjs` | NEW | config (build tooling) | — | **none** | no-analog |
| `package.json` | MODIFY | config (manifest) | — | itself, lines 21–40 | exact (in-place) |
| `.github/workflows/ci.yml` | MODIFY | CI workflow | batch pipeline | itself + `.github/workflows/release.yml` | exact (in-place) |
| `.github/workflows/release.yml` | MODIFY | CI workflow | batch pipeline | `.github/workflows/ci.yml:33-37` (the step to copy) | exact |

---

## Pattern Assignments

### `packages/frontend/src/stores/settings.ts` (store, request-response) — MODIFY

**Analog:** itself. This is an in-place surgical edit to one function; the surrounding file *is* the convention.

**1. The unguarded read to be replaced** — `settings.ts:71-93`, whole function:

```typescript
  async function syncCaidoSessionToken() {
    const raw = window.localStorage.getItem("CAIDO_AUTHENTICATION");   // <-- :72, the failure
    if (raw === null || raw.trim() === "") {
      await pushCaidoSessionToken("");
      return;
    }

    let token = "";                                                    // <-- :78, no-useless-assignment
    try {
      const parsed = JSON.parse(raw) as { accessToken?: string };
      token = typeof parsed.accessToken === "string"
        ? parsed.accessToken.trim()
        : "";
    } catch (error) {
      await pushCaidoSessionToken("");
      sdk.window.showToast(`Failed to read the current Caido session token: ${String(error)}`, {
        variant: "warning",
      });
      return;
    }

    await pushCaidoSessionToken(token);
  }
```

Two of this phase's edits live in this one function: the SIG-01 guard (`:72`) and one of the four lint errors (`:78`). Fold them into a single change.

**2. Where the new `type BrowserStorage` goes** — the file's type block, `settings.ts:16-24`. Note: `type`, never `interface`, and these sit above `defineStore`, at module scope, not inside the closure:

```typescript
type StoredData = { settings: Settings };
type SubscriptionHandle = { stop: () => void };
type ReadinessCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nextAction: string;
};
```

> The repo is not uniform on this: `packages/frontend/src/utils/http-parse.ts:1` uses `export interface ParsedHttpRequest`. But **inside `settings.ts` the convention is 3/3 `type`**, and CLAUDE.md states `type` is preferred. Use `type`.

**3. Total-function-returns-`undefined` guard shape** — the repo has two established examples of "unparseable/absent input collapses to `undefined`", both worth copying in spirit.

`packages/frontend/src/utils/http-parse.ts:12-30` — doc comment states the `undefined` contract, then a run of early-return guards:
```typescript
// Parses the raw HTTP request shapes Drift captures:
//   1. Full raw:  "GET /path HTTP/1.1\nHost: x\n...\n\n<body>" — CRLF or LF.
//   2. Fallback:  "GET http://x/path\n<body>" — used when Caido SDK only
//      exposes getMethod/getUrl/getBody (no getRaw).
// Returns `undefined` when the input does not look like an HTTP request.
export function parseHttpRequest(raw: string): ParsedHttpRequest | undefined {
  ...
  if (requestLine === "") return undefined;
  ...
  if (match === null) return undefined;
  ...
  if (method === "" || pathOrUrl === "") return undefined;
```

`packages/backend/src/command-resolution.ts:47-63` — same shape, one-line early returns, explicit `=== undefined` comparison, terminal `return undefined`:
```typescript
export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  const normalized = candidatePath?.trim();
  if (normalized === undefined || normalized === "") return undefined;
  const resolved = path.normalize(normalized);

  if (resolved.startsWith("/Users/")) {
    const parts = resolved.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
  }
  ...
  return undefined;
}
```

**House rules these two encode — apply all of them to `readBrowserStorageItem`:**
- `verb-noun` name; `read*` matches the existing `render*`/`resolve*`/`extract*`/`build*` family.
- Explicit `=== undefined` / `=== null` comparisons, never truthiness.
- One-line `if (…) return undefined;` guards, no `else`.
- A leading comment stating *why* the function is total, not what it does.
- Two-space indent, double quotes (Prettier defaults, no `.prettierrc`).

**4. Bare `catch {` with no binding** — the convention when the error is intentionally discarded. `packages/frontend/src/chat-context.ts:47`, `packages/backend/src/index.ts:710`:
```typescript
    } catch {
      current = {};
```
Use `catch {` (not `catch (_e)`) in the guard. Note the planned ESLint `caughtErrorsIgnorePattern: "^_"` covers the other form, but the repo's existing style is the bare one.

**5. Fail-closed sink the guard must keep feeding (ASVS V2 / V2-inv)** — `settings.ts:60-69`. The guard's `undefined` must route to `pushCaidoSessionToken("")`, which is the *existing* fail-closed path. Do not add a "skip the push" branch:
```typescript
  async function pushCaidoSessionToken(token: string) {
    const result = await withTimeout(
      sdk.backend.syncCaidoSessionToken(token),
      INIT_REQUEST_TIMEOUT_MS,
      "Syncing the Caido session token",
    );
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
  }
```

**6. The `globalThis.window?.localStorage` access path is load-bearing.** `settings.test.ts:118` stubs `window`, not `localStorage`. Reading bare `globalThis.localStorage` would bypass the stub and break the existing green test. Confirmed: `window.localStorage` appears in exactly two places repo-wide — `settings.ts:72` and `settings.test.ts:119`. There is no `sessionStorage` anywhere in product code.

---

### `packages/frontend/src/stores/settings.test.ts` (test, unit/node-env) — MODIFY

**Analog:** itself. Three new `it` blocks appended inside the existing `describe`.

**Import block** — `settings.test.ts:1-4`. Note: named vitest imports, alphabetical; relative `./` and `../` paths; `shared` as a bare workspace specifier:
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { DEFAULT_SETTINGS, type McpServerInfo } from "shared";
import { INIT_REQUEST_TIMEOUT_MS } from "../utils/promise-timeout";
```

**SDK mock shape** — `settings.test.ts:6-42`. A hoisted `const mockSdk` object literal of `vi.fn()`s grouped by SDK namespace, then `vi.mock`, then the subject imported **after** the mock:
```typescript
const mockSdk = {
  backend: {
    syncCaidoSessionToken: vi.fn(),
    syncCaidoHistoryContext: vi.fn(),
    ...
    onEvent: vi.fn(() => ({ stop: vi.fn() })),
  },
  filters: { getCurrentFilter: vi.fn(() => undefined), ... },
  ...
  window: { showToast: vi.fn() },
};

vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
}));

import { useSettingsStore } from "./settings";
```
`packages/frontend/src/views/ChatView.mount.test.ts:67-74` uses the identical pattern and documents why the import order matters:
```typescript
vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
  SDKPlugin: { install: () => undefined },
}));

// Importing after the mock is declared so that modules pulling in `useSDK`
// see the stubbed backend instead of throwing on the real inject() call.
import ChatView from "./ChatView.vue";
```

**⚠️ The excerpt the new guard tests must not fight** — `settings.test.ts:117-122`, first statement in `beforeEach`:
```typescript
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => null),
      },
    });
    setActivePinia(createPinia());
```
and its teardown, `settings.test.ts:143-145`:
```typescript
  afterEach(() => {
    vi.unstubAllGlobals();
  });
```
**Implication for SIG-01e/f/g:** the harness is already correct. Each new `it` re-calls `vi.stubGlobal("window", …)` with its own shape (`{}`, a throwing getter, `{ localStorage: {} }`); the later call wins over `beforeEach`, and the existing `afterEach` unstubs. **Do not add a second `afterEach`, do not touch the `beforeEach` block, and do not add a `// @vitest-environment` docblock to this file** — it is deliberately a node-env file, which is exactly why the `vi.stubGlobal("window", …)` seam works.

**Mock reset convention** — `settings.test.ts:124-140`, one line per mock, `.mockReset().mockResolvedValue(…)` chained, `Result`-shaped values:
```typescript
    mockSdk.backend.syncCaidoSessionToken.mockReset().mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.getMcpStatus.mockReset().mockResolvedValue({ kind: "Ok", value: createMcpStatus() });
```

**Test naming** — one top-level `describe` named after the unit (`describe("settings store", …)`, verified: **zero nested describes anywhere in this repo's 22 test files**), and `it` titles as full third-person sentences with no "should":
```typescript
  it("passes an empty provider id to the backend when running the live test for all providers", async () => {
  it("clears stale provider init errors after a successful refresh", async () => {
  it("drops legacy `scanner` key from storage during init", async () => {
```
The VALIDATION.md `-t` selectors (`"absent browser storage"`, `"throwing localStorage"`, `"without getItem"`) must appear as substrings of the chosen `it` titles.

**Two corrections to RESEARCH.md `## Code Examples` the planner must apply:**

1. **The store action is `initialize`, not `init`.** `settings.ts:605` exports `initialize`; there is no `init`. RESEARCH's snippets call `await store.init()` — that would throw `store.init is not a function`.
2. **Prefer `store.syncCaidoRuntimeContext()` over `store.initialize()`** for these three tests. It is exported (`settings.ts:615`), it calls `syncCaidoSessionToken()` directly (`settings.ts:113-116`), and it skips `schedulePostInitBootstrap()`'s real 750 ms `setTimeout` (`settings.ts:191-199`) that `initialize()` leaves dangling. Existing tests that need the bootstrap wrap themselves in `vi.useFakeTimers()` (`settings.test.ts:186-199`, `:203-228`, `:232-256`); a focused guard test should not have to.

```typescript
// Shape to use, following the above:
  it("treats absent browser storage as no token", async () => {
    vi.stubGlobal("window", {});
    const store = useSettingsStore();

    await store.syncCaidoRuntimeContext();

    expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
  });
```

---

### `packages/frontend/src/__storage-shim.test.ts` (test, unit/happy-dom env) — NEW

**Analog A — the docblock + import ordering:** `packages/frontend/src/components/chat/MessageList.test.ts:1-5`. This is the exact 4-line header shape shared by all 7 happy-dom files in the repo (`ApprovalDialog`, `AttachmentPreview`, `ChatInput`, `ChatSidebar`, `MessageBubble`, `MessageList`, `ChatView.mount`):
```typescript
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MessageList from "./MessageList.vue";
```
The docblock is **line 1, above every import** — verified in all 7 files. This is what makes deleting `environmentMatchGlobs` a no-op, and it is what the new shim test needs in order to exercise the DOM branch of the shim.

**Analog B — the zero-mock, pure-assertion body:** `packages/frontend/src/utils/http-parse.test.ts:1-4`. No pinia, no sdk mock, no `beforeEach`. This is the right body shape for a shim-inertness test:
```typescript
import { describe, expect, it } from "vitest";
import { parseHttpRequest, rawHttpRequestToCurl, toCurl } from "./http-parse";

describe("parseHttpRequest", () => {
```

**Combined target shape:** `// @vitest-environment happy-dom` + `import { describe, expect, it } from "vitest"` + a single `describe("web storage shim", …)` + `it`s that assert against `globalThis.localStorage` directly. No import of `vitest.setup.ts` — it runs via `setupFiles` before the file loads.

**Naming note:** every other test file in the repo is `<subject>.test.ts` mirroring a sibling source file. `__storage-shim.test.ts` has no sibling (its subject is the root `vitest.setup.ts`), which is why it carries the `__` prefix. It matches vitest's default `**/*.test.ts` include and both packages' `tsconfig.json` `exclude: ["./src/**/*.test.ts"]`, so it will run but will not be typechecked — consistent with all 22 existing test files.

**Assertion the SIG-01i inertness proof needs:** VALIDATION.md requires distinguishing happy-dom's `Storage` from the in-memory fallback. The fallback object literal in RESEARCH Pattern 2 has `Object.getPrototypeOf(x) === Object.prototype` and `x.constructor === Object`; happy-dom's instance does not. That is the discriminator — assert on it, not just on a `setItem`/`getItem` round-trip (which both implementations pass).

---

### `vitest.config.ts` (config, test harness) — MODIFY

**Analog:** itself. Current file in full (21 lines) — `plugins` and `resolve` are untouched; only the `test` block changes:
```typescript
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
    environmentMatchGlobs: [                                              // <-- delete (dead in Vitest 4)
      ["packages/frontend/src/views/**/*.test.ts", "happy-dom"],
      ["packages/frontend/src/components/**/*.test.ts", "happy-dom"],
    ],
  },
});
```
The `resolve.alias` block is load-bearing (pnpm hoisting — `vue` and `pinia` live under `packages/frontend/node_modules`). **Do not migrate to `test.projects`**; that would force duplicating `plugins` and `resolve.alias` per project.

**Root-config file conventions** (from `caido.config.ts` and this file): `.ts` with `__dirname` (root `package.json` is CommonJS-typed — no `"type": "module"`), `export default defineConfig({…})`, `import path from "node:path"` (this file) though `caido.config.ts:7` uses bare `"path"` — prefer the `node:` prefix, which is also what `mcp-server.mjs:10` uses.

---

### `package.json` (config, manifest) — MODIFY

**Analog:** itself, `package.json:21-40`.

```jsonc
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint ./packages/**/src --fix",        // <-- :23, replace
    "format": "prettier --write \"packages/**/src/**/*.{vue,ts,js,json}\"",
    "build": "caido-dev build && cp -r … zip -r ../drift.zip . -x '*.DS_Store'",
    "watch": "caido-dev watch"
  },
  "devDependencies": {
    "@caido-community/dev": "0.1.6",
    "@caido/tailwindcss": "0.1.0",
    "@vitejs/plugin-vue": "6.0.1",
    "postcss": "8.5.6",
    "postcss-prefixwrap": "1.57.2",
    "prettier": "3.8.1",
    "tailwindcss": "3.4.13",
    "tailwindcss-primeui": "0.3.4",
    "typescript": "5.5.4",
    "vite": "6.0.7",
    "vitest": "4.0.18"
  },
```

**⚠️ Convention conflict the planner must resolve:** all **11/11 root `devDependencies` are exact-pinned with no caret**, alphabetically sorted. RESEARCH's install command (`## Standard Stack`) specifies `^` ranges for all 8 new packages, and its "Version verification" note explicitly recommends `^` + lockfile. Those are incompatible. The **house convention is exact pins at the root** (carets appear only in `packages/frontend/package.json`: `highlight.js`, `markdown-it-highlightjs`, `@vue/test-utils`, `happy-dom`). Recommend exact pins for consistency; whichever is chosen, insert alphabetically into the existing block — `@eslint/js` and `@vitest/eslint-plugin` sort before `@vitejs/plugin-vue`.

**Script naming:** the existing scripts are single lowercase words. `lint:fix` is the first colon-namespaced script in the file — acceptable (it is the ecosystem standard) but worth noting it is new to this repo.

**Lockfile:** `pnpm-lock.yaml` is committed at the root. CI uses `--frozen-lockfile` on every leg, so it must land in the same commit as `package.json` or all four legs fail.

---

### `.github/workflows/ci.yml` (CI workflow, batch pipeline) — MODIFY

**Analog:** itself. Current file is 49 lines and **already gets three things right that the matrix restructure must preserve verbatim.**

**Preserve #1 — pnpm before setup-node (Pitfall 9)**, `ci.yml:18-28`:
```yaml
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4          # no `version:` input — reads packageManager: pnpm@9.0.0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20                  # <-- becomes ${{ matrix.node }}
          cache: pnpm                       # <-- mandatory at every major; do not drop
```
Note `pnpm/action-setup` carries **no `version:` input** — it derives pnpm 9.0.0 from `package.json`'s `packageManager` field. Keep it that way through the v6 bump.

**Preserve #2 — `--frozen-lockfile`**, `ci.yml:30-31`:
```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
```

**Preserve #3 — the artifact block**, `ci.yml:42-48`. All four inputs stay; only `if: matrix.node == '24'` is added and the major bumps:
```yaml
      - name: Upload plugin artifact
        uses: actions/upload-artifact@v4
        with:
          name: drift-plugin
          path: dist/drift.zip
          if-no-files-found: error
          retention-days: 14
```

**Step-naming convention:** every step has a `name:` in Sentence case (`Checkout`, `Setup pnpm`, `Setup Node`, `Install dependencies`, `Typecheck`, `Test`, `Build`, `Upload plugin artifact`). RESEARCH Pattern 4's snippet drops all `name:` keys and uses bare `- uses:` / `- run:`. **Keep the `name:` keys** — this repo names every step, in both workflows. The new lint step should be `- name: Lint` / `run: pnpm lint`, inserted between `Typecheck` and `Test` (SIG-03d's required order).

**The bits that change**, `ci.yml:3-16`:
```yaml
on:
  push:
    branches: [main]        # <-- delete the branches key (SIG-03a)
  pull_request:
    branches: [main]        # <-- delete the branches key (SIG-03a)

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}      # <-- add pull_request.number fallback (Pitfall 10)
  cancel-in-progress: true

jobs:
  verify:
    name: Typecheck, test, build      # <-- renaming breaks branch protection (assumption A7)
    runs-on: ubuntu-latest
```
The job key `verify` is what VALIDATION.md's SIG-03b/c assertions address (`jobs.verify.strategy.matrix.node`) — **keep the key `verify`**; only the `name:` gains `(Node ${{ matrix.node }})`.

---

### `.github/workflows/release.yml` (CI workflow, batch pipeline) — MODIFY

**Analog:** `ci.yml:33-37` — the exact step to copy.

Current `release.yml:34-44` has the identical install → typecheck → test → build spine as `ci.yml`, same step names, same commands. Insert `Lint` in the same slot:
```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm -r typecheck
                                          # <-- insert: - name: Lint / run: pnpm lint
      - name: Test
        run: pnpm exec vitest run

      - name: Build plugin
        run: pnpm build
```
Note the step is named **`Build plugin`** here vs **`Build`** in `ci.yml` — leave that asymmetry alone. Everything from `release.yml:46` down (signing, version extraction, `caido/action-release@v1`) is out of scope: RESEARCH says leave the single Node 20 pin and the `@v4` action majors in this file untouched apart from the lint step.

---

## Shared Patterns

### Prettier-default formatting (no config file)
**Source:** absence of `.prettierrc` anywhere; `prettier@3.8.1` in root devDependencies; `"format": "prettier --write \"packages/**/src/**/*.{vue,ts,js,json}\""`
**Apply to:** every TS file touched
2-space indent, double quotes, semicolons, trailing commas in multiline, ~80–100 col. Note the format glob covers only `packages/**/src` — the new **root-level** `vitest.setup.ts` and `eslint.config.mjs` are **not** reachable by `pnpm format`. Match the style by hand, or widen the glob as part of this phase.

### `Result<T>` discriminated union at every RPC boundary
**Source:** `packages/frontend/src/stores/settings.ts:66-68`, mirrored in every test mock
**Apply to:** the three new `settings.test.ts` cases
```typescript
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
```
Mocks must resolve `{ kind: "Ok", value: … }` / `{ kind: "Error", error: "…" }` — never a bare value.

### Explicit `undefined` / `null` comparisons, never truthiness
**Source:** `settings.ts:42, 55, 192, 202, 242, 247, 521, 565`
**Apply to:** the guard and its call site
```typescript
    if (initError.value === null || initError.value.trim() === "") return;
    if (postInitBootstrapHandle !== undefined) { … }
    if (stored?.settings !== undefined) { … }
```
Required by `strict` + `noUncheckedIndexedAccess` in the root `tsconfig.json`. The guard should read `if (raw === undefined || raw.trim() === "")`, matching the existing `raw === null || raw.trim() === ""` it replaces.

### "Why", not "what", in comments — with the constraint named
**Source:** `settings.ts:236-239`, `settings.ts:332-338`, `ChatView.cancel.test.ts:3-13`, `caido.config.ts:27-28`, `vitest.config.ts` (target state)
**Apply to:** `vitest.setup.ts`, `eslint.config.mjs`, and the guard
```typescript
    // Pump the backend plugin's event loop while the self-test is in
    // flight. Caido suspends plugin timers and child_process events when
    // the plugin is idle, so the spawn-based callMcpMethod inside
    // runSharedMcpSelfTest would otherwise hang forever …
```
The repo's comment style names the external constraint (Caido's runtime, pnpm hoisting, caido-dev's cwd) and the consequence of removing the code. RESEARCH's Pattern 1 and Pattern 2 headers already follow this — carry them across intact, including the "DELETE THIS FILE when the repo upgrades to Vitest >= 5" note.

### The four measured lint errors — all confirmed present, all one-line
**Apply to:** the SIG-02d "zero errors" task

| File:line | Rule | Confirmed current code |
|-----------|------|------------------------|
| `packages/backend/assets/mcp-server.mjs:280` | `preserve-caught-error` | `throw error;` inside `catch (error) { if (error?.name === "AbortError" …) throw new Error(\`GraphQL request timed out after ${timeoutMs}ms\`); throw error; }` — the **`new Error(...)` at :278** is the unattributed rethrow; add `{ cause: error }` |
| `packages/backend/src/index.ts:710` | `no-useless-assignment` | `let current: Record<string, ApprovalDecision> = {};` immediately followed by `try { … current = JSON.parse(raw) } catch { current = {}; }` |
| `packages/frontend/src/stores/settings.ts:78` | `no-useless-assignment` | `let token = "";` — same function as the SIG-01 guard |
| `packages/backend/src/claude-print.test.ts:217` | `prefer-const` | `let state = consumeClaudePrintChunk(` |

Verified none of these sit in `renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / any `chmod` call site — the Phase 5–8 boundary (CMP-inv) holds.

### The `vue/no-v-html` element-scoped disable (ASVS V5)
**Source:** `packages/frontend/src/components/chat/MessageBubble.vue:104-108` — confirmed:
```html
    <div
      v-html="renderedHtml"
      style="line-height: 1.7;"
      class="max-w-none [&_p]:mb-2 …"
    />
```
`v-html` is on **line 105**; `style` on **106** and `class` on **107** are the two `vue/attributes-order` warnings. Fixing the order moves `style`/`class` above `v-html`. Do both edits together.

**`eslint-disable-next-line` cannot be used here — corrected 2026-08-12 during plan review.** `vue/no-v-html` reports on the `v-html` *attribute* node, and after the reorder that attribute is the last one *inside* the multi-line start tag. An HTML comment in that position is a Vue parse error, reproduced against this repo's own `@vue/compiler-sfc@3.5.29`: `Illegal '/' in tags.` plus `Element is missing end tag.`. Collapsing the element to one line is not stable either — the `class` value is ~500 characters and Prettier re-expands the tag.

The mechanism plan `01-04` task 2 prescribes, verified to parse with zero errors against the same compiler, is a **closed disable/enable pair placed outside the start tag**: a rationale comment, then `<!-- eslint-disable vue/no-v-html -->` on its own line immediately before `<div`, and `<!-- eslint-enable vue/no-v-html -->` on its own line immediately after the element's `/>`. The `enable` half is mandatory — without it the rule is off for the rest of the file. This works because `vue/comment-directive` ships in `pluginVue.configs["flat/base"]`, which `flat/recommended` pulls in.

---

## No Analog Found

Two files have no meaningful precedent in this repo. Do not manufacture one — RESEARCH.md carries the reference implementations and they are already convention-aligned.

| File | Role | Data Flow | Reason | Use instead |
|------|------|-----------|--------|-------------|
| `vitest.setup.ts` | test-harness bootstrap | side-effecting init | No `setupFiles` module has ever existed here; `vitest.config.ts` currently has no `setupFiles` key. The only remotely similar thing is `packages/backend/assets/mcp-server.mjs:1-8` — a standalone top-level-side-effect module with a `/** … */` header naming its environment contract, which is a *stylistic* reference at best. | `01-RESEARCH.md` **Pattern 2** (lines 349–428). Both guard clauses (`typeof document !== "undefined"` and the `try/catch` around `new Ctor()`) were measured necessary — removing either breaks 15 of 22 test files with `Illegal constructor`. |
| `eslint.config.mjs` | build tooling config | — | Zero ESLint config has ever existed in this repo (verified: no `.eslintrc*`, no `eslint.config.*` anywhere, and `eslint` is not in any `package.json`). `packages/backend/assets/mcp-server.mjs` is the only other `.mjs` file and is a runtime server, not a config. `caido.config.ts` and `vitest.config.ts` are the only root configs and both are `.ts` with `defineConfig`. | `01-RESEARCH.md` **Pattern 3** (lines 458–513). The `.mjs` extension is mandatory — root `package.json` has no `"type": "module"`, so `eslint.config.js` triggers `MODULE_TYPELESS_PACKAGE_JSON` on every run (SIG-02b). |

---

## Notes for the Planner

1. **`store.init()` does not exist.** RESEARCH's `## Code Examples` uses it three times; the store exports `initialize` (`settings.ts:605`). Prefer the exported `syncCaidoRuntimeContext` (`settings.ts:615`) for the three new guard tests — it reaches the guard in two hops and avoids the 750 ms bootstrap timer.
2. **Root devDependency pinning is exact, not caret.** RESEARCH's install line uses `^`. Pick one deliberately; 11/11 existing root devDeps are exact.
3. **Keep `name:` on every workflow step.** RESEARCH's Pattern 4 snippet drops them; both existing workflows name every step.
4. **Keep the job key `verify`.** VALIDATION.md's static assertions read `jobs.verify.strategy.*`. Only the human-facing `name:` changes.
5. **`pnpm format` cannot reach the two new root files.** Its glob is `packages/**/src/**/*`. Either widen it or hand-match Prettier defaults.
6. **`settings.test.ts`'s existing harness needs no change.** `beforeEach` stubs `window` (`:118`), `afterEach` unstubs (`:144`). New `it`s re-stub locally. Editing the shared `beforeEach` would break the six existing green tests.
7. **Premise re-confirmed on this machine:** default `node --version` → `v26.7.0`, `"localStorage" in globalThis` → `true`. The bug is live in the default local toolchain.

---

## Metadata

**Analog search scope:** repo root, `.github/workflows/`, `packages/frontend/src/**`, `packages/backend/src/**`, `packages/backend/assets/`, `packages/shared/`
**Files scanned:** 22 test files enumerated, 14 files read in full or targeted range
**Analogs read:** `settings.ts`, `settings.test.ts`, `ChatView.mount.test.ts`, `ChatView.cancel.test.ts`, `MessageList.test.ts`, `http-parse.test.ts`, `http-parse.ts`, `promise-timeout.ts`, `command-resolution.ts` (targeted), `caido.config.ts`, `vitest.config.ts`, `package.json`, `ci.yml`, `release.yml`
**Pattern extraction date:** 2026-08-12
