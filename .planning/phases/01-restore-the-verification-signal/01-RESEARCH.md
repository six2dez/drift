# Phase 1: Restore the Verification Signal — Research

**Researched:** 2026-08-12
**Domain:** JS/TS build & verification toolchain — Vitest 4 environments, Node Web Storage, ESLint 10 flat config, GitHub Actions matrices
**Confidence:** HIGH (every load-bearing claim was reproduced locally in this session on real Node 22.23.2 / 24.13.0 / 26.7.0 binaries)

> **No CONTEXT.md exists for this phase.** `/gsd-discuss-phase` has not run, so there are no locked user decisions. Everything below is Claude's-discretion territory constrained only by CLAUDE.md and the ROADMAP success criteria. Three findings below **contradict the phase brief** and need a decision before planning locks — see `## Corrections to the Phase Brief`.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIG-01 | `pnpm exec vitest run` is green on Node 20, 22 and 24, and `window.localStorage` is accessed through a guard that tolerates an environment where storage is absent or throws | `## The localStorage Failure — Exact Mechanism`, `## Pattern 1: The Production Storage Guard`, `## Pattern 2: The Vitest Web Storage Shim`. **The stated matrix does not reproduce the bug — see Correction 1.** |
| SIG-02 | `pnpm lint` invokes a real, installed ESLint with a committed flat config for TypeScript and Vue, and CI fails on lint errors | `## Standard Stack`, `## Pattern 3: ESLint 10 Flat Config`, `## Measured Lint Debt` (measured: 4 errors / 20 warnings, not a 10k-line swamp) |
| SIG-03 | CI runs typecheck → lint → test → build on push and pull request for every branch, across a Node 20/22/24 matrix | `## Pattern 4: The CI Matrix`, `## Common Pitfalls` #6–#9. **Matrix must add Node 26 — see Correction 1.** |

---

## Summary

Three separate problems are bundled under "restore the signal," and only one of them is what the brief says it is.

**The test failure is real but the diagnosis in the brief is wrong by two major versions.** The five `ChatView.mount.test.ts` failures do **not** occur on Node ≥ 22. They occur on Node ≥ 25. I ran the full suite on real Node 22.23.2 and Node 24.13.0 binaries in this session: **125/125 green on both, unmodified**. It is red only on Node 26.7.0. The mechanism is precise and now fully understood: Node 25.0.0 unflagged Web Storage, so `"localStorage" in globalThis` became `true`. Vitest's `populateGlobal()` skips any happy-dom window property whose name already exists on the Node global unless that name is in an explicit allow-list — and `localStorage`/`sessionStorage` are **not** in that list (verified: zero occurrences of the string `localStorage` anywhere in vitest 4.0.18's or 4.1.10's environment chunk). So happy-dom's working `Storage` never reaches the test global, and `window.localStorage` resolves to Node's own lazy getter, which returns `undefined` because `--localstorage-file` was not supplied. The consequence for planning is direct: **a Node 20/22/24 matrix, exactly as the ROADMAP specifies it, would ship green and still hide this bug.** Success criterion 4 ("the blind spot is closed") is not satisfiable without a Node 26 leg.

**The lint work is far smaller than feared.** I installed ESLint 10.8.1 + typescript-eslint 8.67 + eslint-plugin-vue 10.10 in an isolated sandbox and ran it read-only against this repo. With `eslint-config-prettier` layered on (Prettier already owns formatting here) and `no-unused-vars` configured for the repo's existing `_`-prefix convention, the whole repo produces **4 errors and 20 warnings across 9 of 59 files**. There is no `any` anywhere and no non-Vue warning at all. Every one of the 4 errors is a one-line fix; 16 of the 20 warnings are PrimeVue camelCase props that `vue/attribute-hyphenation` flags incorrectly for this component library. The dangerous part of SIG-02 is not the debt — it is that the current script is `eslint … --fix`, which in CI would silently rewrite source and then report success.

**The CI work has a second, unrelated deadline attached.** Beyond branch filters and the matrix, every action this repo pins (`checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`, `upload-artifact@v4`) runs on the Node 20 actions runtime, which GitHub began deprecating 2025-09-19, defaulted away from on 2026-06-16, and removes in fall 2026. Phase 9 adds a `windows-latest` job to this same workflow; rewriting it twice is waste.

**Primary recommendation:** Fix the storage read at the source in `settings.ts` (verified: alone it turns the suite green 125/125 on Node 26 and keeps `settings.test.ts`'s existing `vi.stubGlobal` working), add a `vitest.setup.ts` Web Storage shim so every Node version exercises the *same* code path instead of an accidentally environment-dependent one (verified: no-op on 22/24, fixes 26), delete the dead `environmentMatchGlobs` block, land ESLint 10 flat config as `eslint.config.mjs` with `--max-warnings` pinned as a ratchet, and restructure CI as an unfiltered push/PR trigger over a **`[20, 22, 24, 26]`** matrix with `fail-fast: false`, no `--fix`, and artifact upload on one leg only.

---

## Corrections to the Phase Brief

These three items contradict the task brief / ROADMAP and should be resolved before the plan is written.

### Correction 1 — The bug appears on Node ≥ 25, not Node ≥ 22. A 20/22/24 matrix will not catch it. [VERIFIED: local execution]

Measured in this session:

| Node | `"localStorage" in globalThis` (plain node) | happy-dom storage reaches test global | Full suite, unmodified |
|------|--------------------------------------------|----------------------------------------|------------------------|
| 22.23.2 (`/opt/homebrew/opt/node@22`) | `false` | yes | **125/125 pass** |
| 24.13.0 (`~/.nvm/versions/node/v24.13.0`) | `false` | yes | **125/125 pass** |
| 26.7.0 (`/opt/homebrew/bin/node`) | `true` | **no** | **5 fail / 120 pass** |

Node's release history explains the boundary: Web Storage was added behind `--experimental-webstorage` in Node 22.4.0 and **unflagged by default in Node 25.0.0** [CITED: nodejs/node#57666, nodejs.org/en/blog/release/v25.2.0]. Node 25 is EOL (2026-06-01) and Node 26 is Current [VERIFIED: nodejs/Release `schedule.json`].

**Implication:** ROADMAP success criterion 1 ("green on Node 20, 22 and 24") is already true today with zero code changes, and criterion 4 ("the blind spot … is closed") cannot be met by a 20/22/24 matrix. **The matrix must include Node 26.**

### Correction 2 — ESLint 10 is current, not ESLint 9. [VERIFIED: npm registry]

`eslint@10.8.1` (published 2026-08-07). ESLint 9 is a previous major. All required plugins already declare `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0` peers. Planning to "ESLint 9 flat config" would land a stale major on day one. See `## Standard Stack` for the compatibility matrix (including the one real constraint: ESLint 10 requires Node `^20.19.0 || ^22.13.0 || >=24`).

### Correction 3 — `environmentMatchGlobs` in `vitest.config.ts` is already dead config, silently. [VERIFIED: local execution]

`environmentMatchGlobs` was **removed** in Vitest 4 (replaced by `test.projects`) [CITED: vitest.dev/guide/migration]. Vitest 4 does not warn about it — only `test.workspace` throws and `test.poolOptions` deprecates. I proved it is inert: a probe test file placed at `packages/frontend/src/views/__envcheck.test.ts` (matching the glob) reported `typeof document: undefined`, i.e. it ran in the **node** environment.

Good news for scope: deleting the block is a **verified no-op**. Every DOM test file already carries a `// @vitest-environment happy-dom` docblock (7 files), and the only view-directory file without one — `ChatView.cancel.test.ts` — is a pure-logic test that explicitly documents it does not mount anything. Migrating to `test.projects` is unnecessary; deletion plus the existing docblocks is correct and smaller.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Reading the Caido session token from browser storage | Browser / Client (`packages/frontend`) | — | `window.localStorage` only exists in the Caido webview; the backend gets the token pushed to it over RPC (`syncCaidoSessionToken`). The guard belongs in `settings.ts`, not in the backend. |
| Tolerating absent/throwing storage | Browser / Client (production code) | Test harness (parity shim) | A restricted webview, Safari private mode, or a storage-disabled policy is a **runtime** hazard. Fixing it only in the test harness would leave the product fragile — SIG-01 correctly demands a production guard. |
| DOM/Web-Storage emulation for tests | Test harness (`vitest.setup.ts`, root `vitest.config.ts`) | — | Environment parity is a harness concern. Never patch product code to satisfy the harness. |
| Static analysis of TS + Vue SFCs | Build tooling (root `eslint.config.mjs`) | — | Single root flat config; ESLint 10 resolves upward from each file, so one root file covers all three packages. |
| Cross-version execution + gating | CI (`.github/workflows/ci.yml`) | Release (`release.yml`) | Only CI can run four Node majors. The release workflow duplicates typecheck/test/build and should gain the same lint step to stay consistent. |
| Node runtime feature drift detection | CI matrix | — | This entire phase exists because a single-version pin hid a runtime behaviour change. The matrix *is* the control. |

---

## The localStorage Failure — Exact Mechanism

Four verified links in the chain. This matters because it determines which fixes can possibly work.

**1. Node 25.0.0 unflagged Web Storage.** `globalThis.localStorage` became a real own accessor property.
```
$ node -e 'console.log(process.version, "localStorage" in globalThis, typeof globalThis.localStorage)'
v26.7.0 true undefined
(node:79851) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
```
Reading it **returns `undefined` and warns** on Node 26.7.0 — it does not throw. (Node 25.2.0 briefly made it *throw*; 25.2.1 reverted that. [CITED: nodejs.org/en/blog/release/v25.2.1]) Supplying `--localstorage-file` makes it a real SQLite-backed store: `node --localstorage-file=/tmp/x -e '...'` → `typeof getItem: function`. [VERIFIED: local execution]

**2. Vitest's `populateGlobal` filter drops it.** From `vitest@4.0.18/dist/chunks/index.CyBMJtT7.js:242`:
```js
function getWindowKeys(global, win, additionalKeys = []) {
  const keysArray = [...additionalKeys, ...KEYS];
  return new Set(keysArray.concat(Object.getOwnPropertyNames(win)).filter((k) => {
    if (skipKeys.includes(k)) return false;
    if (k in global) return keysArray.includes(k);   // <-- Node's global wins
    return true;
  }));
}
```
`localStorage` is not in `LIVING_KEYS`, not in `OTHER_KEYS`, and not in the happy-dom environment's `additionalKeys`. **`grep -c localStorage` over that whole chunk returns `0`.** So on Node ≥ 25, `"localStorage" in global` is true, the key is filtered out, and happy-dom's storage is never copied. [VERIFIED: source inspection + execution]

**3. It is exactly two properties.** I replicated `getWindowKeys()` offline against a real happy-dom `GlobalWindow` on all three Node versions and diffed the dropped-key sets. Node 26 drops **exactly two more** properties than Node 22/24: `localStorage` and `sessionStorage`. Everything else dropped is intentional (JS intrinsics, `Buffer`, `console`, `crypto`, timers…). **There is no other hidden shadowing in this repo's stack.** [VERIFIED: local execution — answers Key Question 6]

**4. The blast radius inside the app.** `window.localStorage` appears in exactly **one** production location: `packages/frontend/src/stores/settings.ts:72`. There is no `sessionStorage` use anywhere. The throw propagates `syncCaidoSessionToken() → syncCaidoRuntimeContext() → handleSend()`, which aborts before `sendCliMessage` is ever called — hence "expected 1 call, got 0" in four tests and `errorMessage === "TypeError: Cannot read properties of undefined (reading 'getItem')"` in the fifth. [VERIFIED: grep + reproduced failure output]

### Upstream status — no fix is coming to Vitest 4

| Upstream | Status (checked 2026-08-12 via GitHub API) | Consequence |
|---|---|---|
| [vitest-dev/vitest#8757](https://github.com/vitest-dev/vitest/issues/8757) "Node v25 breaks tests with Web Storage API" | **Closed as completed**, 2025-10-29. Maintainer @hi-ogawa: *"This looks like a bug of Node 25 … non-LTS is not officially supported by Vitest, so let me close this for now."* | Vitest will not patch the 4.x line. Do not wait. |
| [capricorn86/happy-dom#1950](https://github.com/capricorn86/happy-dom/issues/1950) "Issues with Node 25" | **Open.** PR #2019 "Handle throwing localStorage getter for Node 26+ compatibility" — open, unmerged. | A happy-dom upgrade cannot fix it anyway: vitest filters the key out *before* happy-dom is consulted. |
| vitest 4.1.10 (latest 4.x, 2026-08-11) | `grep -c localStorage` = **0**. `additionalKeys` unchanged. | **Upgrading vitest 4.0.18 → 4.1.10 does NOT fix this.** [VERIFIED: npm tarball inspection] |
| vitest 5.0.0-rc.1 | `"localStorage"` **added to `OTHER_KEYS`**, and `populateGlobal` now captures the property *descriptor* instead of the value, with an inline comment naming Node's lazy `localStorage` getter. | Fixed upstream in v5 — still RC, and `sessionStorage` is still absent from the list. Retire the shim when the repo adopts Vitest 5. |
| jsdom alternative | vitest's jsdom env calls `populateGlobal(global, dom.window, { bindFunctions: true })` with **no** `additionalKeys` at all. | Switching to jsdom would be **equally broken or worse**. Rejected. |

### Fix options compared — all measured, not guessed

| # | Option | Result on Node 26 | Result on 22/24 | Verdict |
|---|--------|-------------------|-----------------|---------|
| A | **Production guard in `settings.ts`** | **125/125 pass** | 125/125 pass | **Adopt.** Required by SIG-01 regardless; verified sufficient on its own. |
| B | **`test.setupFiles` Web Storage shim** | **125/125 pass** | 125/125 pass (no-op) | **Adopt alongside A.** Restores parity so every Node version exercises the same branch. |
| C | `test.execArgv: ["--no-webstorage"]` (version-gated) | 125/125 pass | 125/125 pass | Works, but **`--no-webstorage` is a fatal `bad option` on Node 22 and 24** — needs a `process.versions.node` gate in the config. Couples the repo to a Node internal flag. Reject as primary. |
| D | `test.execArgv: ["--localstorage-file", …]` (the workaround quoted in vitest#8757) | Would pass | Flag accepted but inert | **Reject.** Gives tests Node's real *disk-backed* store — shared across workers, persists between runs. Test pollution by design. |
| E | Upgrade happy-dom (20.8.9 → 20.11.2) | No effect | No effect | **Reject.** Root cause is in vitest's key filter. |
| F | Upgrade vitest 4.0.18 → 4.1.10 | No effect (verified) | — | **Reject.** |
| G | Upgrade to Vitest 5 | Would fix | — | **Defer.** Only `5.0.0-rc.1` exists; a major test-runner upgrade is its own phase. Leave a TODO in the shim. |
| H | Switch happy-dom → jsdom | Broken too | — | **Reject.** |
| I | `NODE_OPTIONS=--no-webstorage` in CI env | Passes on 26 | **Breaks 22/24 legs fatally** | **Reject.** |

**Why A *and* B, not A alone.** With only the guard, the suite is green everywhere — but for different reasons: on Node ≤ 24 the ChatView tests walk the "token present" path, and on Node ≥ 25 they walk the "no storage" path. That is a matrix whose legs silently test different things, which is precisely the class of blind spot this phase exists to eliminate. The shim costs ~35 lines and removes the divergence.

---

## Standard Stack

### Core — new dev dependencies (ESLint)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eslint` | `^10.8.1` | Linter core | Current major (2026-08-07). Flat config only; `.eslintrc` fully removed. 156M weekly downloads. |
| `@eslint/js` | `^10.0.1` | `js.configs.recommended` ruleset | Official ESLint core rulesets package; peer `eslint: ^10.0.0`. |
| `typescript-eslint` | `^8.67.0` | TS parser + plugin + `tseslint.config()` helper | The official single-entrypoint package. Peers: `eslint: ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`, `typescript: >=4.8.4 <6.1.0` — **TS 5.5.4 is in range**, no version bump needed. |
| `eslint-plugin-vue` | `^10.10.0` | Vue 3 SFC rules, `flat/*` presets | Official Vue plugin. Peers `eslint ^10` and `vue-eslint-parser ^10.3.0`; `@typescript-eslint/parser` and `@stylistic/eslint-plugin` are **optional** peers (verified via `peerDependenciesMeta`) so pnpm's strict peer resolution will not complain. |
| `vue-eslint-parser` | `^10.4.1` | Parses `.vue` SFCs | Required peer of eslint-plugin-vue; must be installed explicitly. |
| `eslint-config-prettier` | `^10.1.8` | Disables formatting rules that fight Prettier | Repo already uses Prettier 3.8.1 as the formatter. **Removes 168 of 188 warnings** (measured). Import as `eslint-config-prettier/flat`. |
| `globals` | `^17.11.0` | `globals.browser` / `globals.node` predefines | Standard companion for flat config; the alternative is hand-maintaining `no-undef` globals. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitest/eslint-plugin` | `^1.6.27` | Vitest-aware rules (`no-focused-tests`, `no-identical-title`, `expect-expect`) | Recommended. Catches a real false-pass class: a committed `it.only` silently skipping the rest of a file. All its peers except `eslint` are optional. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `eslint` + hand-rolled config | `@antfu/eslint-config` / `eslint-config-standard` | Opinionated presets drag in stylistic rules that collide with the repo's Prettier defaults and would manufacture debt this repo does not have. Reject. |
| `tseslint.configs.recommended` | `tseslint.configs.recommendedTypeChecked` | **Measured cost:** 49 errors, of which **33 are parse errors** — test files are `exclude`d from both `packages/*/tsconfig.json`, and `.vue` needs `parserOptions.extraFileExtensions`. Real new findings are only 6 `no-unnecessary-type-assertion` + 1 `no-unsafe-argument` + 1 `await-thenable`. **Defer type-aware linting**; it needs `tsconfig.eslint.json` plumbing that is its own change. |
| `pnpm/action-setup@v6` | `pnpm/setup@v2` | `pnpm/action-setup`'s README: *"For pnpm v11 and newer, use `pnpm/setup`. … `pnpm/action-setup` remains the action to use for installing pnpm v10 and older."* This repo pins `pnpm@9.0.0`. **Stay on `pnpm/action-setup`.** |

**Installation:**
```bash
pnpm add -Dw eslint@^10.8.1 @eslint/js@^10.0.1 typescript-eslint@^8.67.0 \
  eslint-plugin-vue@^10.10.0 vue-eslint-parser@^10.4.1 \
  eslint-config-prettier@^10.1.8 globals@^17.11.0 @vitest/eslint-plugin@^1.6.27
```
> `-w` (root workspace) — the flat config lives at the repo root and ESLint 10 resolves plugins relative to the config file.

**Version verification:** all eight confirmed present with the stated versions via `npm view <pkg> version` on 2026-08-12. `globals` moved 17.10.0 → 17.11.0 *during this research session* — pin with `^` and let the lockfile hold it.

---

## Package Legitimacy Audit

Ran `slopcheck install <8 packages>` (slopcheck 0.6.1) plus per-package `npm view` on the npm registry.

| Package | Registry | Weekly downloads | Source repo | postinstall | slopcheck | Disposition |
|---------|----------|------------------|-------------|-------------|-----------|-------------|
| `eslint` | npm | 156,253,918 | github.com/eslint/eslint | none | `[OK]` | Approved |
| `@eslint/js` | npm | 138,202,805 | github.com/eslint/eslint | none | `[OK]` | Approved |
| `typescript-eslint` | npm | 87,929,172 | github.com/typescript-eslint/typescript-eslint | none | `[OK]` | Approved |
| `eslint-plugin-vue` | npm | 6,370,656 | github.com/vuejs/eslint-plugin-vue | none | `[OK]` | Approved |
| `vue-eslint-parser` | npm | 7,999,120 | github.com/vuejs/vue-eslint-parser | none | `[OK]` | Approved |
| `@vitest/eslint-plugin` | npm | 3,637,523 | github.com/vitest-dev/eslint-plugin-vitest | none | `[OK]` | Approved |
| `eslint-config-prettier` | npm | 64,610,602 | github.com/prettier/eslint-config-prettier | none | `[OK]` | Approved |
| `globals` | npm | 262,605,501 | github.com/sindresorhus/globals | none | `[OK]` | Approved |

**Packages removed due to `[SLOP]`:** none.
**Packages flagged `[SUS]`:** none.

> ⚠️ **Operator note for the executor:** `slopcheck install …` is *not* read-only — after the audit it runs the real `npm install` in the current directory. In this pnpm workspace that install failed harmlessly (`npm error Cannot read properties of null`) and left the repo untouched (verified with `git status`), but **use `slopcheck scan` instead** if re-running the audit.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────────────────────────────┐
   git push (any branch)  │  .github/workflows/ci.yml                    │
   pull_request (any)  ──▶│  trigger: push / pull_request, NO branch     │
                          │           filter                             │
                          └───────────────────┬──────────────────────────┘
                                              │  strategy.matrix.node
                                              │  fail-fast: false
                    ┌─────────────┬───────────┴───────────┬─────────────┐
                    ▼             ▼                       ▼             ▼
                 Node 20       Node 22                 Node 24       Node 26
                (engines      (maint. LTS)           (active LTS)   (Current —
                 floor)                                             REPRODUCES
                                                                    THE BUG)
                    │             │                       │             │
                    └─────────────┴───────────┬───────────┴─────────────┘
                                              ▼
                    checkout ▶ pnpm/action-setup ▶ setup-node(cache:pnpm)
                                              ▼
                                  pnpm install --frozen-lockfile
                                              ▼
                    ┌─────────────────────────────────────────────────┐
                    │ 1. pnpm -r typecheck   tsc + vue-tsc            │
                    │ 2. pnpm lint           eslint .   (NO --fix)    │
                    │ 3. pnpm exec vitest run                         │
                    │ 4. pnpm build          caido-dev + zip          │
                    └─────────────────────────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │  if: matrix.node == '24'      │
                              │  upload-artifact drift.zip    │  (one leg only —
                              └───────────────────────────────┘   v4+ 409s on dupes)


   Runtime path the tests exercise (why step 3 is version-sensitive):

   vitest worker boot
        │
        ├─ happy-dom env setup ──▶ populateGlobal(globalThis, happyDomWindow)
        │                              │
        │                              └─ drops `localStorage` iff it already
        │                                 exists on the Node global (Node ≥ 25)
        │
        ├─ vitest.setup.ts  ────────▶ re-installs a Storage on globalThis
        │   (runs AFTER env setup)     ONLY when document exists AND storage
        │                              is missing/unusable      ◀── PARITY FIX
        │
        └─ ChatView.mount.test.ts
                 │  mount(ChatView) ▶ onMounted ▶ settingsStore.init()
                 ▼
           syncCaidoRuntimeContext()
                 ▼
           syncCaidoSessionToken()
                 ▼
           readBrowserStorageItem("CAIDO_AUTHENTICATION")  ◀── PRODUCT FIX
                 │        try { globalThis.window?.localStorage?.getItem }
                 │        catch → undefined
                 ▼
           pushCaidoSessionToken(token | "")  ──▶ handleSend() proceeds
                                                  ──▶ sendCliMessage called ✅
```

### Recommended Project Structure

```
/                                # repo root — three NEW files, one EDITED, one EDITED
├── eslint.config.mjs            # NEW  — flat config (.mjs, not .js — see Pitfall 5)
├── vitest.setup.ts              # NEW  — Web Storage parity shim
├── vitest.config.ts             # EDIT — drop dead environmentMatchGlobs, add setupFiles
├── package.json                 # EDIT — lint / lint:fix scripts, 8 devDependencies
├── .nvmrc                       # DECISION — currently `20`, which is EOL (2026-04-30)
└── .github/workflows/
    ├── ci.yml                   # EDIT — triggers, matrix, lint step, action majors
    └── release.yml              # EDIT — add the same lint step for consistency
packages/frontend/src/stores/
├── settings.ts                  # EDIT — readBrowserStorageItem() guard at :72
└── settings.test.ts             # EDIT — add absent-storage + throwing-storage cases
```

Nothing in `packages/backend/src` changes except the 2 one-line lint fixes. **No file in the Phase 5–8 spawn path is touched** (`renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, the `chmod` calls) — the only backend edits are `index.ts:710` (`no-useless-assignment`) and `assets/mcp-server.mjs:278` (`preserve-caught-error`), both outside those functions. **Verify this at plan-check time.**

---

### Pattern 1: The Production Storage Guard (SIG-01, product half)

**What:** A total function that turns every browser-storage failure mode into `undefined`.
**When to use:** Any read of `window.localStorage` from frontend code running inside the Caido webview.

**Three failure modes it must absorb** — the brief names two, there are three:
1. `window.localStorage` is `undefined` (Node ≥ 25 test env; some embedded webviews).
2. *Reading the property* throws (Safari private mode historically; storage disabled by enterprise policy; some sandboxed `iframe`/webview origins throw `SecurityError` on access).
3. The property exists but is not a `Storage` (a partial stub, or a page-injected shim). `typeof getItem !== "function"`.

```ts
// packages/frontend/src/stores/settings.ts

type BrowserStorage = { getItem: (key: string) => string | null };

/**
 * Reads one key from the host's local storage.
 *
 * Drift's frontend runs inside a Caido webview, where storage can be absent,
 * disabled by policy, or throw on property access (restricted origins, Safari
 * private mode). Node >= 25 test environments hit the same "absent" path.
 * Every failure collapses to `undefined` so a missing token degrades to
 * "not signed in" instead of aborting syncCaidoRuntimeContext() and, with it,
 * the entire send-a-message flow.
 */
function readBrowserStorageItem(key: string): string | undefined {
  try {
    const storage = (globalThis as { window?: { localStorage?: BrowserStorage } })
      .window?.localStorage;
    if (storage === undefined || storage === null) return undefined;
    if (typeof storage.getItem !== "function") return undefined;
    const value = storage.getItem(key);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
```

Call site:
```ts
async function syncCaidoSessionToken() {
  const raw = readBrowserStorageItem("CAIDO_AUTHENTICATION");
  if (raw === undefined || raw.trim() === "") {
    await pushCaidoSessionToken("");
    return;
  }
  // …existing JSON.parse branch, unchanged…
}
```

**Three properties that were verified, not assumed:**
- Reading through `globalThis.window?.localStorage` (**not** bare `globalThis.localStorage`) is load-bearing. `settings.test.ts:118` does `vi.stubGlobal("window", { localStorage: { getItem: vi.fn(() => null) } })` in a **node**-environment file. Reading `globalThis.localStorage` directly would bypass that stub and break the test. [VERIFIED]
- With this exact guard applied, `pnpm exec vitest run` on Node 26.7.0 is **125/125 green**, and `pnpm -r typecheck` (tsc + vue-tsc, `strict` + `noUncheckedIndexedAccess` + `noUnusedLocals`) passes. [VERIFIED — patch applied, measured, then reverted; `git status` clean]
- Naming follows CLAUDE.md conventions: `read*` verb-noun prefix, `type` over `interface`, camelCase.

**Bonus:** the surrounding `let token = ""` at `settings.ts:78` is one of the 4 ESLint errors (`no-useless-assignment`). Same edit, same file — fold it in.

---

### Pattern 2: The Vitest Web Storage Shim (SIG-01, parity half)

**What:** A `setupFiles` module that reinstalls Web Storage in DOM environments where vitest's `populateGlobal` skipped it.
**When to use:** Until the repo moves to Vitest ≥ 5.

```ts
// vitest.setup.ts
/**
 * Node >= 25.0.0 unflagged Web Storage, so `localStorage` now exists on the
 * Node global. Vitest's populateGlobal() skips any happy-dom window property
 * whose name already exists on the Node global and is not in its explicit
 * KEYS list -- and `localStorage`/`sessionStorage` are not in that list. The
 * result is a DOM test environment with no working storage on Node >= 25.
 *
 * Upstream: vitest-dev/vitest#8757 (closed: "non-LTS is not officially
 * supported"), capricorn86/happy-dom#1950 (open). Fixed only in Vitest 5,
 * which adds `localStorage` to OTHER_KEYS.
 *
 * DELETE THIS FILE when the repo upgrades to Vitest >= 5 (re-verify
 * sessionStorage, which v5 still does not list).
 */
type StorageLike = {
  readonly length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function hasUsableStorage(name: "localStorage" | "sessionStorage"): boolean {
  try {
    const candidate = (globalThis as Record<string, unknown>)[name];
    if (candidate === undefined || candidate === null) return false;
    return typeof (candidate as StorageLike).getItem === "function";
  } catch {
    // Property access itself can throw. Treat as unusable.
    return false;
  }
}

function createStorage(): StorageLike {
  const Ctor = (globalThis as { Storage?: new () => StorageLike }).Storage;
  if (typeof Ctor === "function") {
    try {
      // happy-dom's Storage IS constructible. Node's native Storage is NOT --
      // `new Storage()` throws "Illegal constructor" -- hence the try/catch.
      return new Ctor();
    } catch {
      /* fall through to the in-memory shim */
    }
  }
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
  };
}

// Only patch inside a DOM environment. Node-environment test files must stay
// storage-free so they keep exercising the "no browser storage" branch.
if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    if (!hasUsableStorage(name)) {
      Object.defineProperty(globalThis, name, {
        value: createStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}
```

And the config:
```ts
// vitest.config.ts  (test block only — plugins/resolve unchanged)
  test: {
    // `environmentMatchGlobs` was REMOVED in Vitest 4 and silently ignored.
    // Every DOM test file already carries `// @vitest-environment happy-dom`.
    setupFiles: ["./vitest.setup.ts"],
  },
```

**Verified behaviour** (types are erased by esbuild, so the runtime logic below is exactly what was measured):

| Node | Full suite with shim |
|------|----------------------|
| 22.23.2 | 125/125 pass (shim is a no-op) |
| 24.13.0 | 125/125 pass (shim is a no-op) |
| 26.7.0 | **125/125 pass** (shim active) |

**Both guard clauses are load-bearing — I hit the failure:**
- Without `typeof document !== "undefined"`, the shim runs in node-env files where `globalThis.Storage` is Node's native class, and `new Storage()` throws **`Illegal constructor`** → **15 of 22 test files fail to load.** [VERIFIED: reproduced]
- Without the `try/catch` around `new Ctor()`, same outcome.

---

### Pattern 3: ESLint 10 Flat Config for a pnpm TS+Vue Monorepo (SIG-02)

**What:** One root `eslint.config.mjs`. ESLint 10 walks upward from each linted file, so a single root config covers all three packages; per-package overrides are just `files:`-scoped objects in the same array.

```js
// eslint.config.mjs   <-- .mjs, NOT .js (root package.json has no "type":"module")
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

  // Vue SFCs: vue-eslint-parser stays the top-level parser; the TS parser is
  // nested under parserOptions.parser so <script lang="ts"> is understood.
  {
    files: ["**/*.vue"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
  },

  // Frontend runs in a webview; backend runs in Caido's QuickJS host.
  { files: ["packages/frontend/**/*.ts"], languageOptions: { globals: globals.browser } },
  { files: ["packages/backend/**/*.ts", "packages/shared/**/*.ts"], languageOptions: { globals: globals.node } },

  // mcp-server.mjs is a standalone Node process, not part of the QuickJS bundle.
  { files: ["**/*.mjs", "*.config.ts", "vitest.setup.ts"], languageOptions: { globals: globals.node } },

  { files: ["**/*.test.ts"], ...vitest.configs.recommended },

  {
    rules: {
      // The repo already uses a `_` prefix for intentionally-unused bindings
      // (five `_sdk` RPC handler params in index.ts, `_content` in chat.ts).
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // PrimeVue's public API is camelCase (optionLabel, autoResize, inputClass,
      // modelValue, minSize). Hyphenating them would be wrong for this library.
      "vue/attribute-hyphenation": "off",
      "vue/v-on-event-hyphenation": "off",
    },
  },

  // Test files legitimately declare inline stub components.
  { files: ["**/*.test.ts"], rules: { "vue/one-component-per-file": "off" } },

  prettier, // MUST be last — turns off every rule Prettier already owns.
);
```

**Scripts:**
```jsonc
"lint":      "eslint .",                       // NO --fix. Fails CI on errors.
"lint:fix":  "eslint . --fix",                 // Local convenience only.
```

`eslint .` lints **59 files** including `caido.config.ts`, `vitest.config.ts`, and `packages/backend/assets/mcp-server.mjs` (829 lines) — the last of which the current `eslint ./packages/**/src` glob **never reaches**, because it lives in `assets/`, not `src/`. [VERIFIED]

**QuickJS safety:** ESLint is a dev-time dependency only. It emits no runtime code, ships nothing into `dist/plugin_package/`, and does not change what the backend bundle can use. CLAUDE.md's "no Zod / no `import.meta` / no dynamic require" constraint is unaffected.

---

### Pattern 4: The CI Matrix (SIG-03)

```yaml
name: CI

on:
  push:            # no `branches:` key == every branch
  pull_request:    # no `branches:` key == every target branch

concurrency:
  # A PR from a same-repo branch fires BOTH push and pull_request. Keying on the
  # PR number when present collapses them into one cancellable group.
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: Verify (Node ${{ matrix.node }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false          # never let one leg mask another
      matrix:
        node: ['20', '22', '24', '26']
    steps:
      - uses: actions/checkout@v5

      # pnpm MUST be installed before setup-node's `cache: pnpm` runs.
      - uses: pnpm/action-setup@v6          # reads packageManager: pnpm@9.0.0

      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm lint                       # eslint . — NO --fix
      - run: pnpm exec vitest run
      - run: pnpm build

      - uses: actions/upload-artifact@v5
        if: matrix.node == '24'              # ONE leg only — v4+ 409s on dupes
        with:
          name: drift-plugin
          path: dist/drift.zip
          if-no-files-found: error
          retention-days: 14
```

**Why `[20, 22, 24, 26]`** — Node release state on 2026-08-12 [VERIFIED: nodejs/Release `schedule.json`]:

| Node | Status today | Keep? |
|------|--------------|-------|
| 20 | **EOL 2026-04-30** | Yes — `engines: node >=20` and `.nvmrc: 20` still promise it. Dropping it is a separate, explicit decision. |
| 22 | Maintenance LTS (EOL 2027-04-30) | Yes |
| 24 | **Active LTS** (EOL 2028-04-30) | Yes — best artifact-upload leg |
| 25 | EOL 2026-06-01 | No |
| 26 | **Current**, becomes LTS 2026-10-28 | **Yes — mandatory. This is the only leg that reproduces the bug.** |

Considered and rejected: adding a floating `current` leg. It would catch future drift but makes a required job non-deterministic — a new Node major can turn `main` red with no code change. If wanted, add it as a **separate non-required job** with `continue-on-error: true`.

**Action major bumps.** GitHub deprecated the Node 20 actions runtime on 2025-09-19, switched runners to Node 24 by default on 2026-06-16, and removes Node 20 in fall 2026. Every `@v4` action in this repo is affected. Verified current majors: `checkout@v7.0.1`, `setup-node@v7.0.0`, `pnpm/action-setup@v6.0.10`, `upload-artifact@v7.0.1`. Recommend **v5 for checkout/setup-node/upload-artifact** (smallest jump off the deprecated runtime; setup-node v5 runs on Node 24) and **v6 for pnpm/action-setup** (`runs.using: node24`, verified in its `action.yml`). Going straight to v7 is also defensible; setup-node v6 narrowed automatic caching to npm only, so the **explicit `cache: pnpm` input is required at every major** — do not drop it.

**Alternative worth knowing:** `pnpm/action-setup@v6` gained its own `cache: true` + `cache_dependency_path` inputs, which would let you cache the pnpm store without `setup-node`'s `cache: pnpm` and sidestep the ordering trap. The existing order already works in this repo, so treat that as optional.

**`release.yml`** runs typecheck → test → build with a single Node 20. Add the same `pnpm lint` step so a release cannot ship code that CI would have rejected; leave its single-version pin alone (it produces one signed artifact, not a compatibility matrix).

---

### Anti-Patterns to Avoid

- **`eslint --fix` in CI.** The current script has `--fix`. In CI it rewrites source in the runner's checkout, then reports success — a textbook false pass, and the changes are silently discarded. `--fix` belongs only in `lint:fix`.
- **Patching product code to satisfy the harness, or vice versa.** The guard exists because a webview can genuinely lack storage; the shim exists because the harness genuinely lost it. Neither substitutes for the other.
- **Migrating to `test.projects` "because `environmentMatchGlobs` is deprecated."** It is *removed*, and it is inert here. The docblocks already do the job; adding a projects layer means duplicating `plugins` and `resolve.alias` per project for zero behavioural gain.
- **Pinning `NODE_OPTIONS=--no-webstorage` workflow-wide.** Fatal `bad option` on the Node 20/22/24 legs. Verified.
- **Bulk `--fix` on the Vue warnings before disabling `vue/attribute-hyphenation`.** ESLint would hyphenate PrimeVue's camelCase props (`optionLabel` → `option-label`) across four SFCs. Those are library API names; the "fix" is a behavioural change dressed as formatting.
- **`vue/no-v-html: "off"`.** `MessageBubble.vue:105` renders model output; it is safe *because* `markdown-it({html:false})` + DOMPurify sanitize it. Disable it inline with a one-line rationale so the rule stays a tripwire for the next `v-html`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Storage for tests | A bespoke `localStorage` mock in each test file | `vitest.setup.ts` calling happy-dom's own `Storage` (with an in-memory fallback) | happy-dom's implementation already handles `key(i)` ordering, `length`, and coercion. Per-file mocks drift and only cover files someone remembered. |
| Disabling Prettier-conflicting rules | Hand-listing `indent`, `quotes`, `semi`, `vue/html-indent`, `vue/max-attributes-per-line`… | `eslint-config-prettier/flat` | Measured: it removes **168 of 188** warnings in one line. The hand-list would need maintenance on every plugin upgrade. |
| Vue SFC parsing | `parser: "@typescript-eslint/parser"` at the top level for `.vue` | `vue-eslint-parser` as parser + `parserOptions.parser: tseslint.parser` | Setting the TS parser at top level breaks template analysis entirely. This is the single most common Vue-flat-config mistake. |
| Environment globals | A `no-undef` globals dictionary | `globals.browser` / `globals.node` | 262M weekly downloads, tracks the platforms. |
| Detecting a stray `it.only` | Grep in a pre-commit hook | `@vitest/eslint-plugin`'s `no-focused-tests` | Grep cannot see `describe.only`, `test.only`, or `.each.only`. A focused test is a silent green suite — the exact failure class this phase exists to kill. |
| pnpm store caching in Actions | Manual `actions/cache` with `pnpm store path` | `setup-node`'s `cache: pnpm` (after `pnpm/action-setup`) | Handles key derivation from `pnpm-lock.yaml` and the store path automatically. |

**Key insight:** every item this phase is tempted to hand-roll is an *environment-parity* problem, and hand-rolled parity is parity that only holds where someone remembered to apply it — which is how the repo arrived here.

---

## Measured Lint Debt

Not estimated. Measured, twice: once in an isolated sandbox copy, once read-only against the working tree (identical results).

**Baseline before tuning** — `eslint .` with `js.recommended` + `tseslint.recommended` + `vue flat/recommended`, no Prettier config:
`10 errors, 188 warnings, 15 of 57 files`.

**After `eslint-config-prettier` + `no-unused-vars` `^_` pattern** (the config in Pattern 3, minus the two `vue/*-hyphenation` overrides):
**`4 errors, 20 warnings, 9 of 59 files`.**

### The 4 errors — all one-line fixes

| File:line | Rule | Fix |
|-----------|------|-----|
| `packages/backend/assets/mcp-server.mjs:278` | `preserve-caught-error` (new in eslint:recommended v10) | Attach `{ cause: err }` to the rethrown error |
| `packages/backend/src/index.ts:710` | `no-useless-assignment` (new in v10) | Drop the dead initialiser for `current` |
| `packages/frontend/src/stores/settings.ts:78` | `no-useless-assignment` | Dead initialiser for `token` — **same function as the SIG-01 guard**, fold in |
| `packages/backend/src/claude-print.test.ts:217` | `prefer-const` | `let state` → `const state` |

> None of these are in `renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / the `chmod` calls. **Phase 5–8 boundary is respected.**

### The 20 warnings — 16 vanish with two rule overrides

| Rule | Count | Locations | Recommended disposition |
|------|-------|-----------|-------------------------|
| `vue/attribute-hyphenation` | 11 | `ChatInput.vue` ×4, `ChatView.vue:494`, `SettingsView.vue` ×6 | **Rule off.** All are PrimeVue camelCase props (`optionLabel`, `optionValue`, `autoResize`, `modelValue`, `minSize`, `inputClass`). |
| `vue/v-on-event-hyphenation` | 3 | `ChatInput.vue:103`, `SettingsView.vue:581,592` | **Rule off.** All are `@update:modelValue`. |
| `vue/one-component-per-file` | 3 | `ChatInput.test.ts:15,24,35` | **Off for `**/*.test.ts`.** Inline stub components are intentional. |
| `vue/attributes-order` | 2 | `MessageBubble.vue:106,107` | **Fix** — reorder `style`/`class` before `v-html`. Auto-fixable. |
| `vue/no-v-html` | 1 | `MessageBubble.vue:105` | **Keep the rule on**; add `// eslint-disable-next-line vue/no-v-html` with a comment naming `markdown-it({html:false})` + DOMPurify. Security-relevant tripwire. |

**Residual after all of the above: 0 errors, 0 warnings.** SIG-02's "passes clean" branch is reachable in one plan task — no debt-tracking document is needed. Pin `--max-warnings 0` in CI so it cannot regress.

### Type-aware linting — deliberately out of scope

`tseslint.configs.recommendedTypeChecked` with `projectService: true` produced **49 errors, 33 of them parse errors**: `packages/backend/tsconfig.json` and `packages/frontend/tsconfig.json` both `exclude` `./src/**/*.test.ts`, and `.vue` needs `parserOptions.extraFileExtensions: [".vue"]`. Genuine new findings are only 6 `no-unnecessary-type-assertion`, 1 `no-unsafe-argument`, 1 `await-thenable`. Ship non-type-aware now; file type-aware linting as a backlog item.

> **Adjacent observation, worth a backlog item:** because both package tsconfigs `exclude` `*.test.ts`, `pnpm typecheck` **never type-checks the 3,538 lines of test code**. That is a real hole in the "verification signal" this phase is named after, but closing it is a separate change with its own error surface. Do not silently fold it in.

---

## Common Pitfalls

### Pitfall 1: "The suite is red on Node ≥ 22" — it is not
**What goes wrong:** The plan targets a 20/22/24 matrix, CI goes green, and the bug the phase was created to fix is still live on Current.
**Why:** Node 22.4.0 added Web Storage *behind a flag*; 25.0.0 unflagged it. The `>= 22` framing conflates those.
**How to avoid:** Node 26 in the matrix, non-negotiable. Amend the SIG-01 wording.
**Warning sign:** A "fix" lands and the ChatView tests pass on your machine — check `node --version` before believing it.

### Pitfall 2: Upgrading vitest or happy-dom to "get the fix"
**What goes wrong:** Hours lost to a dependency bump that changes nothing.
**Why:** vitest 4.1.10 (latest 4.x) still has zero occurrences of `localStorage`; the filter runs before happy-dom is consulted, so no happy-dom release can help. The fix exists only in Vitest 5, still RC.
**How to avoid:** Take the shim. Leave the "delete when on Vitest 5" comment.

### Pitfall 3: `new Storage()` throws `Illegal constructor` under Node
**What goes wrong:** A shim that does `new globalThis.Storage()` unconditionally breaks **15 of 22 test files** — every node-environment file — because Node's native `Storage` is not constructible.
**Why:** In node-env files on Node ≥ 25, `globalThis.Storage` is Node's class, not happy-dom's.
**How to avoid:** Gate on `typeof document !== "undefined"` **and** wrap `new Ctor()` in try/catch with an in-memory fallback. Both were verified necessary.
**Warning sign:** `Error: Illegal constructor` in the setup file's stack, reported as a *collection* failure across many files at once.

### Pitfall 4: `--no-webstorage` is fatal on Node < 25
**What goes wrong:** `node: bad option: --no-webstorage`, every Node 20/22/24 leg dies before vitest starts.
**Why:** The flag ships with Web Storage in Node 25.
**How to avoid:** Do not use it. If you must, gate on `Number(process.versions.node.split(".")[0]) >= 25` inside `vitest.config.ts`.

### Pitfall 5: `eslint.config.js` in a CommonJS package root
**What goes wrong:** Every ESLint invocation prints `[MODULE_TYPELESS_PACKAGE_JSON] Warning: … is not specified and it doesn't parse as CommonJS. Reparsing as ES module … This incurs a performance overhead.`
**Why:** The root `package.json` has no `"type": "module"` (the workspace packages do, the root does not).
**How to avoid:** Name it **`eslint.config.mjs`**. [VERIFIED: reproduced the warning]

### Pitfall 6: `--fix` in CI is a false pass
**What goes wrong:** ESLint rewrites source in the runner, reports 0 problems, job goes green, nothing is committed. 1 error and 16 warnings here are auto-fixable, so most of the debt would vanish invisibly.
**How to avoid:** `"lint": "eslint ."`. Separate `lint:fix`.

### Pitfall 7: ESLint exit codes
**What goes wrong:** Assuming warnings fail the build.
**Measured on ESLint 10.8.1:** errors → `1`; warnings only, no `--max-warnings` → **`0`**; warnings exceeding `--max-warnings N` → `1`; a glob matching no files → **`2`** (fatal, "Oops! Something went wrong!" — so a broken glob does *not* silently pass, but it also does not tell you clearly).
**How to avoid:** Use `--max-warnings 0` once the debt is cleared, and assert the linted-file count in the plan's verification step.

### Pitfall 8: `actions/upload-artifact@v4+` 409s on duplicate names across a matrix
**What goes wrong:** Four legs all upload `drift-plugin`; the second one fails the job.
**Why:** *"Artifact names must be unique since each created artifact is idempotent."* [CITED: actions/upload-artifact README]
**How to avoid:** `if: matrix.node == '24'`, or suffix the name with `${{ matrix.node }}`. Keep `pnpm build` running on **all** legs — the build itself is real signal (verified working on Node 26 locally); only the upload is restricted.

### Pitfall 9: `setup-node`'s `cache: pnpm` before pnpm exists
**What goes wrong:** `Error: Unable to locate executable file: pnpm`.
**How to avoid:** `pnpm/action-setup` first — the existing workflow already gets this right; preserve the order through the version bump. Note that setup-node **v6 narrowed automatic caching to npm only**, so the explicit `cache: pnpm` input remains mandatory.

### Pitfall 10: Double CI runs on same-repo PR branches
**What goes wrong:** Removing the `branches: [main]` filter makes every same-repo PR fire both `push` and `pull_request`, doubling minutes across a 4-leg matrix.
**How to avoid:** `group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`.

### Pitfall 11: `fail-fast` masking sibling legs
**What goes wrong:** Node 26 fails, GitHub cancels 20/22/24, and you cannot tell whether the failure is version-specific or universal.
**How to avoid:** `fail-fast: false`. Essential for a matrix whose entire purpose is version discrimination.

### Pitfall 12: CLAUDE.md will be stale after this phase
**What goes wrong:** CLAUDE.md's Conventions section currently states *"ESLint present (`pnpm lint` calls `eslint ./packages/**/src --fix`)"* and *"No project-level ESLint config file; relies on default rules."* Both become false.
**How to avoid:** Update those two lines as a task. Also revisit `.nvmrc: 20` (Node 20 is EOL) — a deliberate decision either way, not an oversight.

---

## Code Examples

### Testing the guard's three failure modes (SIG-01 acceptance)

```ts
// packages/frontend/src/stores/settings.test.ts — node environment (no docblock)

it("treats absent browser storage as no token", async () => {
  vi.stubGlobal("window", {});                       // Node >= 25 test env shape
  const store = useSettingsStore();
  await store.init();
  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
});

it("treats a throwing localStorage getter as no token", async () => {
  vi.stubGlobal("window", {
    get localStorage(): never {                      // Safari private mode / sandboxed origin
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
  const store = useSettingsStore();
  await expect(store.init()).resolves.not.toThrow();
  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
});

it("treats a storage object without getItem as no token", async () => {
  vi.stubGlobal("window", { localStorage: {} });     // partial stub
  const store = useSettingsStore();
  await store.init();
  expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
});
```
These are the only tests that make SIG-01's *guard* clause falsifiable. Without them the guard is proven only by the absence of a crash on one Node version.

### Reproducing the bug on demand (useful in the plan's verification steps)

```bash
# Requires a Node >= 25 binary on PATH. Without the fix, expect 5 failures.
node --version                      # must print v25.x or v26.x
pnpm exec vitest run packages/frontend/src/views/ChatView.mount.test.ts

# One-line environment probe:
node -e 'console.log("localStorage" in globalThis)'   # true on >=25, false on <=24
```

### Verifying the shim is genuinely a no-op on older Node

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" node node_modules/vitest/vitest.mjs run
PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH" node node_modules/vitest/vitest.mjs run
# Both must report 125/125 with and without vitest.setup.ts present.
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|---|---|---|---|
| `.eslintrc.*` cascade | Flat `eslint.config.{js,mjs,ts}` only | ESLint 10.0.0 | Greenfield config — no migration cost. `ESLINT_USE_FLAT_CONFIG` no longer exists. |
| ESLint 9 | **ESLint 10.8.1** | 2026 | Requires Node `^20.19.0 \|\| ^22.13.0 \|\| >=24`. Adds `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error` to `recommended` — 3 of this repo's 4 errors come from those. |
| `test.environmentMatchGlobs` / `poolMatchGlobs` | `test.projects` (or per-file docblocks) | Vitest 4.0.0 | Repo's config is dead. Docblocks already cover it. |
| `test.poolOptions.<pool>.execArgv` | top-level `test.execArgv` | Vitest 4.0.0 | Relevant only if the rejected option C is revisited. |
| `localStorage` absent from Node | Web Storage unflagged | Node 25.0.0 | The root cause of this entire phase. |
| Actions on the Node 20 runtime | Node 24 runtime | Runner default 2026-06-16; Node 20 removed fall 2026 | All four `@v4` pins here are deprecated. |
| `pnpm/action-setup` for all pnpm | `pnpm/setup` for pnpm ≥ 11 | 2026-05 | Repo is on pnpm 9 → **stay on `pnpm/action-setup`**. |

**Deprecated / outdated in this repo right now:**
- `vitest.config.ts` `environmentMatchGlobs` — removed API, silently ignored.
- `package.json` `"lint": "eslint ./packages/**/src --fix"` — no ESLint installed, no config, `--fix` unsafe, and the glob misses `packages/backend/assets/mcp-server.mjs`.
- `.github/workflows/ci.yml` — `branches: [main]` on both triggers, single Node 20, no lint step, four Node-20-runtime actions.
- `.nvmrc: 20` and `engines: {"node": ">=20"}` — Node 20 reached EOL 2026-04-30.

---

## Runtime State Inventory

Not a rename/refactor/migration phase — but this phase *does* change tool configuration that lives outside the repo, so the equivalent audit:

| Category | Items found | Action required |
|----------|-------------|-----------------|
| Stored data | **None.** No database, cache, or datastore is touched. The Caido SQLite chat store is untouched. | None |
| Live service config | **GitHub branch protection.** The required status-check name changes from `Typecheck, test, build` to four matrix-suffixed names (`Verify (Node 20)` …). This lives in GitHub repo settings, **not** in git — a renamed job silently satisfies no required check. | Manual: update required checks after the first matrix run |
| OS-registered state | **None.** No scheduled tasks, daemons, or service registrations. | None |
| Secrets / env vars | **None changed.** `release.yml`'s `PRIVATE_KEY` secret is untouched; adding a lint step does not alter the signing flow. | None |
| Build artifacts | **`node_modules` + `pnpm-lock.yaml`** change (8 new devDependencies). Contributors must re-run `pnpm install`. `dist/` is gitignored and rebuilt. **`pnpm install --frozen-lockfile` in CI will fail on every leg if the lockfile is not committed with `package.json`.** | Commit `pnpm-lock.yaml` in the same commit as `package.json` |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node 26 (reproduces the bug) | SIG-01 local verification | ✓ | v26.7.0 (`/opt/homebrew/bin/node`) | — |
| Node 24 (active LTS) | Matrix parity check | ✓ | v24.13.0 (`~/.nvm/versions/node/v24.13.0/bin`) | — |
| Node 22 (maintenance LTS) | Matrix parity check | ✓ | v22.23.2 (`/opt/homebrew/opt/node@22/bin`) | — |
| Node 20 (engines floor) | Matrix parity check | ✗ | — | **CI only.** `nvm install 20` locally, or accept CI as the sole Node 20 signal. ESLint 10 needs ≥ 20.19.0 — verify the leg installs a recent 20.x. |
| pnpm 9.0.0 | All scripts | ✓ | 9.0.0 — **verified running under Node 26.7.0** | — |
| `gh` CLI | Upstream issue verification during research | ✓ | authenticated | — |
| `slopcheck` | Package legitimacy audit | ✓ | 0.6.1 | — |
| Context7 MCP / `ctx7` CLI | Library docs | ✗ | — | Used official docs + npm registry + direct source inspection of installed packages instead. Where a claim came only from web search it is marked below. |
| GitHub Actions runners | SIG-03 | n/a | — | Only real validation for the Node 20 leg and the workflow trigger semantics. |

**Missing with no fallback:** none.
**Missing with fallback:** Node 20 locally (CI covers it); Context7 (direct source inspection was in fact stronger evidence here — every vitest claim was read out of the installed `dist` and the published tarballs).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 (root-level, single config, no workspace/projects) |
| Config file | `vitest.config.ts` (repo root) — will gain `setupFiles`, lose `environmentMatchGlobs` |
| Setup file | `vitest.setup.ts` (repo root) — **new, Wave 0** |
| Environments | `node` by default; `happy-dom` per-file via `// @vitest-environment happy-dom` docblock (7 files) |
| Quick run command | `pnpm exec vitest run <path>` |
| Full suite command | `pnpm exec vitest run` (22 files, 125 tests, ~1s) |
| Lint command | `pnpm lint` → `eslint .` (59 files) |
| Typecheck command | `pnpm -r typecheck` (tsc ×2 + vue-tsc) |

### Phase Requirements → Test Map

| Req | Behaviour to prove | Type | Automated command | Exists? |
|-----|--------------------|------|-------------------|---------|
| SIG-01a | Full suite green on the Node version that reproduces the bug | integration | `pnpm exec vitest run` **on Node 26** | ✅ (suite exists; currently 5 red on 26) |
| SIG-01b | Full suite green on Node 22 | integration | `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node node_modules/vitest/vitest.mjs run` | ✅ green today — **regression guard** |
| SIG-01c | Full suite green on Node 24 | integration | `PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH" node node_modules/vitest/vitest.mjs run` | ✅ green today — **regression guard** |
| SIG-01d | Full suite green on Node 20 | integration | CI matrix leg only | ✅ green today (current CI) |
| SIG-01e | Guard returns "" when `window.localStorage` is **absent** | unit | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts -t "absent browser storage"` | ❌ **Wave 0** |
| SIG-01f | Guard returns "" when reading `localStorage` **throws** | unit | `… -t "throwing localStorage"` | ❌ **Wave 0** |
| SIG-01g | Guard returns "" when storage exists but has **no `getItem`** | unit | `… -t "without getItem"` | ❌ **Wave 0** |
| SIG-01h | The existing happy path (real token in storage) still works | unit | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` | ✅ exists (`vi.stubGlobal` at :118) |
| SIG-01i | Shim is inert when storage already works | unit | `pnpm exec vitest run packages/frontend/src/__storage-shim.test.ts` asserting `localStorage.setItem/getItem` round-trip **and** that the instance is happy-dom's (not the in-memory fallback) under Node ≤ 24 | ❌ **Wave 0** |
| SIG-02a | ESLint is installed and executable | smoke | `pnpm exec eslint --version` → `10.x` | ❌ Wave 0 |
| SIG-02b | Config is loaded, no `MODULE_TYPELESS_PACKAGE_JSON` warning | smoke | `pnpm lint 2>&1 \| grep -c MODULE_TYPELESS` → `0` | ❌ Wave 0 |
| SIG-02c | Lint covers the whole repo, not a stale glob | smoke | `pnpm exec eslint . -f json \| node -e '…length'` → **59** files; must include `packages/backend/assets/mcp-server.mjs` | ❌ Wave 0 |
| SIG-02d | Zero errors and zero warnings | integration | `pnpm exec eslint . --max-warnings 0` → exit `0` | ❌ Wave 0 |
| SIG-02e | CI's lint invocation contains no `--fix` | static | `grep -c -- "--fix" .github/workflows/ci.yml` → `0`; `node -p "require('./package.json').scripts.lint"` must not contain `--fix` | ❌ Wave 0 |
| SIG-02f | A deliberate error actually fails the command | negative | Insert `const unused = 1;` in a temp file, `pnpm lint` → exit `1`, then revert | ❌ Wave 0 (manual, one-shot) |
| SIG-03a | Workflow triggers on every branch | static | `node -e` on the parsed YAML: `on.push` has no `branches` key and `on.pull_request` has no `branches` key | ❌ Wave 0 |
| SIG-03b | Matrix contains 20, 22, 24 **and 26** | static | parsed YAML `jobs.verify.strategy.matrix.node` deep-equals `['20','22','24','26']` | ❌ Wave 0 |
| SIG-03c | `fail-fast: false` | static | parsed YAML `jobs.verify.strategy['fail-fast'] === false` | ❌ Wave 0 |
| SIG-03d | Step order is typecheck → lint → test → build | static | ordered `run` commands match the expected sequence | ❌ Wave 0 |
| SIG-03e | A lint failure fails the job in reality | integration | Push a branch with one deliberate lint error; **all four legs must go red**; revert | ❌ Wave 0 (manual, one-shot) |
| SIG-03f | Node 26 leg would have caught the original bug | integration | On a scratch branch, revert only the `settings.ts` guard and the shim; **the Node 26 leg must go red while 20/22/24 stay green** | ❌ **Wave 0 — this is the single most important proof in the phase** |
| SIG-03g | Artifact upload does not 409 | integration | First matrix run completes; `drift-plugin` artifact present exactly once | ❌ Wave 0 (observational) |
| CMP-01/02 invariant | No POSIX regression, no spawn-path edits | static | `git diff --name-only` contains no change to `renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / `chmod` call sites | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run <touched file>` + `pnpm exec eslint <touched file>` (sub-second).
- **Per wave merge:** `pnpm -r typecheck && pnpm exec eslint . --max-warnings 0 && pnpm exec vitest run` on the **default Node (26)** — the version that reproduces the bug, so the fast loop is also the sensitive loop.
- **Phase gate:** the full suite on **all four** Node majors (locally on 22/24/26, CI for 20), then `pnpm build`, then the SIG-03f revert-proof on a scratch branch, then `/gsd-verify-work`.

The Nyquist argument: the failure mode being fixed is *version-conditional*, so sampling at one Node version — at any frequency — cannot detect it. The minimum honest sampling rate for SIG-01 is **one run per Node major per merge**, and the matrix is what makes that affordable.

### What would constitute a **false pass**

| Req | False-pass mechanism | Counter-measure |
|-----|---------------------|-----------------|
| SIG-01 | Suite green because it ran on Node ≤ 24, where the bug does not exist. **This is the default outcome of following the ROADMAP matrix literally.** | Mandatory Node 26 leg + SIG-03f revert-proof |
| SIG-01 | Guard "verified" only by the absence of a crash in ChatView tests — no test asserts guard behaviour directly | SIG-01e/f/g unit tests, including the *throwing* getter |
| SIG-01 | Suite green because the shim silently masks a real product regression | Guard has its own unit tests independent of the shim; SIG-01i asserts the shim is inert when storage works |
| SIG-01 | A committed `it.only` / `describe.only` reduces the suite to one test and everything is "green" | `@vitest/eslint-plugin` `no-focused-tests`; also assert the total count is **125+** |
| SIG-02 | `--fix` rewrites the code in CI, reports clean, changes are discarded | SIG-02e greps both `package.json` and the workflow |
| SIG-02 | ESLint exits 0 because it linted **zero** files (bad glob, over-broad `ignores`) | SIG-02c asserts the linted-file count is 59 and names `mcp-server.mjs` explicitly |
| SIG-02 | Warnings exist but exit code is 0 (ESLint does not fail on warnings by default — **measured**) | `--max-warnings 0` |
| SIG-02 | Debt "handled" by disabling the rules that produced it | Rule-off decisions are enumerated in `## Measured Lint Debt` with a per-rule rationale; `vue/no-v-html` stays **on** with an inline disable |
| SIG-03 | Workflow file edited but not exercised, because a workflow only runs from the branch it exists on | SIG-03e pushes a scratch branch and observes four red legs |
| SIG-03 | `fail-fast: true` cancels the Node 26 leg the moment another fails, so its result is never recorded | SIG-03c |
| SIG-03 | The job is renamed, so GitHub branch protection's required check no longer matches and merges proceed unguarded | Runtime State Inventory → update required checks manually |
| SIG-03 | Only the `push` trigger is unfiltered; PRs from forks still skip CI | SIG-03a checks **both** triggers |

### Wave 0 Gaps

- [ ] `vitest.setup.ts` — Web Storage shim (SIG-01)
- [ ] `vitest.config.ts` — remove dead `environmentMatchGlobs`, add `setupFiles` (SIG-01)
- [ ] `packages/frontend/src/stores/settings.test.ts` — three new guard cases: absent / throwing / no-`getItem` (SIG-01e/f/g)
- [ ] `packages/frontend/src/__storage-shim.test.ts` — shim inertness + round-trip (SIG-01i)
- [ ] `eslint.config.mjs` — flat config (SIG-02)
- [ ] `package.json` — 8 devDependencies, `lint` / `lint:fix` scripts, committed `pnpm-lock.yaml` (SIG-02)
- [ ] `.github/workflows/ci.yml` — triggers, matrix, `fail-fast`, lint step, action majors, single-leg artifact (SIG-03)
- [ ] `.github/workflows/release.yml` — add the lint step (consistency)
- [ ] Framework install: none — Vitest 4.0.18 is already present and working

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies. This is tooling work, so the surface is supply chain and the linter's own security signal.

### Applicable ASVS Categories

| ASVS category | Applies | Standard control in this phase |
|---|---|---|
| V2 Authentication | indirect | The guarded read is of the **Caido session token**. A guard that returns `""` must mean *"no token → the backend refuses to start MCP"*, never *"no token → proceed unauthenticated"*. `startMcpServer` already aborts on an empty `sessionCaidoToken` (CLAUDE.md, bootstrap step 1) — **the plan must confirm the fail-closed behaviour is preserved.** |
| V3 Session Management | indirect | Same read. Degrading to "" must not clear or overwrite a previously-synced good token in a transient-failure case. |
| V4 Access Control | no | Nothing in this phase touches the MCP tool allowlist. |
| V5 Input Validation / Output Encoding | yes | `vue/no-v-html` fires once at `MessageBubble.vue:105`. Keep the rule enabled and disable it inline with a rationale citing `markdown-it({html:false})` + DOMPurify, so any *new* `v-html` trips the lint. |
| V6 Cryptography | no | No crypto code in scope. `release.yml`'s Ed25519 signing is untouched. |
| V14 Configuration / Supply Chain | **yes** | 8 new devDependencies. Audited: `## Package Legitimacy Audit` — all `[OK]`, all with official repos, all with **no postinstall scripts**, lowest weekly download count 3.6M. Lockfile must be committed alongside `package.json`, and CI must keep `--frozen-lockfile`. |

### Known Threat Patterns

| Pattern | STRIDE | Mitigation in this phase |
|---|---|---|
| Dependency confusion / slopsquatting on 8 new dev deps | Tampering | slopcheck + `npm view` + official-repo verification, all recorded above |
| Malicious `postinstall` in a new dev dep | Elevation of privilege | `npm view <pkg> scripts.postinstall` → none for all 8 |
| Unpinned lockfile drift in CI | Tampering | `pnpm install --frozen-lockfile` retained on every matrix leg |
| Auto-`--fix` rewriting source unreviewed in CI | Tampering | `--fix` removed from the CI path (Pitfall 6) |
| Silencing a security lint to "clear debt" | Repudiation | `vue/no-v-html` stays enabled; only an inline, justified disable is permitted |
| A guard that fails **open** on token read | Spoofing | Guard returns `""`; the backend's existing empty-token abort must be re-confirmed by the plan |

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | Node 20 rejects `--localstorage-file` as an unknown option (unverified — no Node 20 binary available locally; Web Storage landed in 22.4.0) | Fix options table (option D) | Low — option D is rejected on other grounds |
| A2 | ESLint 10 + all 7 companion packages install cleanly under **pnpm 9.0.0** strict peer resolution in this workspace (the sandbox used `npm`, and the read-only run against this repo used the sandbox's `node_modules`) | Standard Stack | Medium — a peer warning could block `pnpm install`. All non-`eslint` peers are declared **optional** (verified via `peerDependenciesMeta`), so this is unlikely. **First plan task should be the install; treat a peer error as a checkpoint.** |
| A3 | `actions/setup-node@v5` resolves `node-version: '26'` from the version manifest | Pattern 4 | Low — setup-node queries the manifest dynamically; worst case pin `26.x` |
| A4 | pnpm 9.0.0 `install --frozen-lockfile` behaves identically on Node 26 (CLI execution under Node 26 **was** verified; a full install was not) | Pattern 4 | Low-medium — surfaces on the first Node 26 CI leg, loudly |
| A5 | CLAUDE.md's stated conventions include "no `any`" and "prefer `undefined` over `null`" (asserted in the task brief; the committed CLAUDE.md Conventions section does not spell these out, though the codebase does have zero `any` and the guard returns `undefined`) | Pattern 1 | Low — the recommended guard satisfies both readings |
| A6 | Bumping `checkout`/`setup-node`/`upload-artifact` v4 → v5 introduces no behaviour change for this workflow beyond the documented ones | Pattern 4 | Low-medium — verify on the first run; v5 of setup-node added automatic `packageManager` caching, which v6 then narrowed to npm |
| A7 | GitHub branch protection currently requires the check named `Typecheck, test, build` (repo settings were not inspected) | Runtime State Inventory | **Medium** — if true and not updated, renamed jobs leave `main` merge-unguarded |

---

## Open Questions

1. **Should the matrix keep Node 20 at all?**
   - Known: Node 20 hit EOL 2026-04-30. `engines: node >=20`, `.nvmrc: 20`, and CI all still target it. ESLint 10 needs ≥ 20.19.0.
   - Unclear: whether Drift's users (Caido plugin authors, who also need Node ≥ 18 for the MCP server host) are actually on Node 20.
   - Recommendation: **keep the Node 20 leg for this phase** — dropping it is a user-facing support decision, not a CI decision. Raise `.nvmrc` to `24` (active LTS) as a separate, explicit choice.

2. **Should SIG-01's wording be amended to say Node 26?**
   - Known: as written ("green on Node 20, 22 and 24") the criterion is **already satisfied** with zero code changes.
   - Recommendation: amend to *"green on Node 20, 22, 24 and 26"*. Leaving it unamended means the phase can be marked complete without fixing the bug.

3. **Do the action major bumps belong in Phase 1 or Phase 9?**
   - Known: Node 20 actions runtime is removed in fall 2026; Phase 9 rewrites this same workflow to add `windows-latest`.
   - Recommendation: **do it here.** Phase 1 is already restructuring `ci.yml`; doing it twice is waste, and a deprecation-warning banner on every run erodes exactly the signal this phase is restoring.

4. **`--max-warnings 0` now, or after a grace period?**
   - Known: measured residual with the recommended config is 0 errors / 0 warnings.
   - Recommendation: **`--max-warnings 0` immediately.** There is no debt to grandfather, and a ratchet with slack is a ratchet that slips.

5. **Test files are excluded from `pnpm typecheck` — fix now?**
   - Known: both package tsconfigs `exclude: ["./src/**/*.test.ts"]`, so 3,538 lines of test code are never type-checked.
   - Unclear: how many type errors that exposes. The type-aware ESLint probe suggests the count is small but non-zero.
   - Recommendation: **backlog item, not this phase.** It is real signal debt but a distinct change with its own error surface, and folding it in would blur what "Phase 1 green" means.

---

## Sources

### Primary (HIGH confidence — direct execution or source inspection in this session)
- Local execution on real binaries: Node **22.23.2** (`/opt/homebrew/opt/node@22`), **24.13.0** (`~/.nvm/versions/node/v24.13.0`), **26.7.0** (`/opt/homebrew/bin/node`) — full-suite runs, `localStorage` global probes, `--no-webstorage` / `--localstorage-file` flag acceptance, `pnpm -r typecheck`, `pnpm build`
- Source inspection of the **installed** `vitest@4.0.18` — `dist/chunks/index.CyBMJtT7.js` lines 236–300 (`skipKeys`, `getWindowKeys`, `populateGlobal`), 355–400 (happy-dom env `additionalKeys`), 523 (jsdom env); `grep -c localStorage` = 0
- npm tarball inspection of **`vitest@4.1.10`** (`grep -c localStorage` = 0, `additionalKeys` unchanged) and **`vitest@5.0.0-rc.1`** (`"localStorage"` present in `OTHER_KEYS`; descriptor-capture comment in `populateGlobal`)
- Offline replication of `getWindowKeys()` against a real `happy-dom@20.8.9` `GlobalWindow` on all three Node versions — dropped-key set diff
- ESLint **10.8.1** + typescript-eslint 8.67.0 + eslint-plugin-vue 10.10.0 + eslint-config-prettier 10.1.8 + @vitest/eslint-plugin 1.6.27 run read-only against this repo — full JSON report, per-rule and per-location breakdown, exit-code matrix, type-aware comparison
- Temporary application of the Pattern 1 guard to `settings.ts` → 125/125 on Node 26 + clean typecheck → reverted (`git status` clean)
- Reproduction of the `new Storage()` → `Illegal constructor` shim failure (15/22 files) and of the `MODULE_TYPELESS_PACKAGE_JSON` warning
- `npm view` on all 8 candidate packages: version, engines, peerDependencies, peerDependenciesMeta, repository, unpackedSize, `scripts.postinstall`; `api.npmjs.org` weekly download counts
- `slopcheck` 0.6.1 — 8/8 `[OK]`
- GitHub API (`gh api`): vitest#8757 state/comments/timeline, happy-dom#1950, happy-dom PR#2019, latest release tags for checkout / setup-node / pnpm-action-setup / upload-artifact, `pnpm/setup` repo metadata, `pnpm/action-setup` `action.yml` and README
- Repo files read directly: `package.json`, `pnpm-workspace.yaml`, `vitest.config.ts`, `tsconfig.json` ×4, `.nvmrc`, `.gitignore`, `.github/workflows/ci.yml`, `CLAUDE.md`, `.planning/{REQUIREMENTS,ROADMAP,STATE,config.json}`, `settings.ts`, `settings.test.ts`, `ChatView.mount.test.ts`, `ChatView.cancel.test.ts`, `ChatView.vue`

### Secondary (MEDIUM–HIGH — official documentation)
- [nodejs/Release `schedule.json`](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json) — LTS/EOL dates for v20–v26
- [nodejs/node#57666](https://github.com/nodejs/node/pull/57666) — unflag `--experimental-webstorage`
- [Node.js v25.2.0](https://nodejs.org/en/blog/release/v25.2.0) / [v25.2.1](https://nodejs.org/en/blog/release/v25.2.1) — the throw-then-revert history
- [Vitest migration guide](https://vitest.dev/guide/migration.html) — `environmentMatchGlobs`/`poolMatchGlobs`/`workspace` removal
- [ESLint v10 migration guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0) — Node requirements, `.eslintrc` removal, new recommended rules
- [eslint-plugin-vue user guide](https://eslint.vuejs.org/user-guide/) — flat config + TS SFC parser nesting
- [actions/upload-artifact README](https://github.com/actions/upload-artifact/blob/main/README.md) — unique-artifact-name requirement
- [pnpm/action-setup README](https://github.com/pnpm/action-setup) — successor guidance for pnpm ≥ 11
- [GitHub Changelog: Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)

### Tertiary (LOW — web search, used only for orientation; every downstream claim was re-verified above)
- Search results on the Node 25 / vitest / happy-dom interaction — superseded by direct GitHub API and source inspection

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| localStorage root cause | **HIGH** | Reproduced on three real Node binaries; mechanism read directly out of vitest's shipped source; blast radius confirmed by grep |
| Node version boundary (≥ 25, not ≥ 22) | **HIGH** | Measured on 22.23.2 / 24.13.0 / 26.7.0 and corroborated by the Node release history |
| Fix selection (guard + shim) | **HIGH** | Both applied and measured green on all three available Node versions; both rejected alternatives were measured failing |
| Upstream status | **HIGH** | GitHub API, plus tarball inspection of vitest 4.1.10 and 5.0.0-rc.1 |
| ESLint stack + versions | **HIGH** | Registry `engines`/`peerDependencies`/`peerDependenciesMeta` read directly; config executed against this repo |
| Lint debt (4 errors / 20 warnings) | **HIGH** | Measured twice with identical results, per-rule and per-location |
| pnpm 9 install of the ESLint stack | **MEDIUM** | Sandbox used npm; peers are optional, but the real `pnpm add -Dw` is unverified (A2) |
| CI matrix shape | **MEDIUM-HIGH** | Action versions, deprecation timeline, and artifact semantics verified from official sources; the workflow itself can only be proven by running it |
| Node 20 leg behaviour | **MEDIUM** | No Node 20 binary locally; CI is the only signal |

**Research date:** 2026-08-12
**Valid until:** **2026-09-11** for the ESLint/Actions stack (fast-moving — `globals` published a new minor mid-session, `eslint` and `typescript-eslint` both published within the last 5 days). The Node/Vitest/happy-dom findings are stable until **Vitest 5.0.0 stable ships**, which will obsolete `vitest.setup.ts` — re-check at that point.
