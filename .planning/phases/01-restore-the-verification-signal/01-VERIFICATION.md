---
phase: 01-restore-the-verification-signal
verified: 2026-08-12T15:10:24Z
status: gaps_found
score: 30/32 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The existing happy path (real token JSON in storage) still resolves accessToken and still pushes it"
    status: failed
    reason: >-
      Measured, not inferred. Mutating `readBrowserStorageItem` to
      `if (key !== "__never__") return undefined;` leaves the full suite green at
      23 files / 131 tests on Node 26. No test anywhere in the repo drives a
      present token through the guard — `CAIDO_AUTHENTICATION` appears exactly
      once in the entire tree (settings.ts:93) and `beforeEach` stubs `getItem`
      to return `null`. All three new guard tests assert
      `syncCaidoSessionToken` was called with `""`, which is precisely what a
      permanently broken read produces. 01-VALIDATION.md records assertion
      SIG-01h ("the existing happy path (real token in storage) still works") as
      `Exists? ✅ exists (vi.stubGlobal)` — that claim is factually wrong, and it
      is the one assertion in this phase's own validation contract that is not
      met. Counter-measured for calibration: reverting the guard to the
      pre-phase unguarded read DOES fail 3/3 guard tests, so the tolerance
      direction is genuinely pinned. Only the forwarding direction is blind.
    artifacts:
      - path: "packages/frontend/src/stores/settings.test.ts"
        issue: "10 tests, none of which drive a present token; beforeEach getItem returns null, so the file's baseline exercises the absent-token branch only"
      - path: "packages/frontend/src/stores/settings.ts"
        issue: "Lines 40-41 (string passthrough) and 99-113 (JSON.parse -> accessToken -> trim -> push) have zero coverage; the catch at 105-111 that toasts and pushes \"\" has zero coverage"
      - path: ".planning/phases/01-restore-the-verification-signal/01-VALIDATION.md"
        issue: "SIG-01h row claims pre-existing happy-path coverage via vi.stubGlobal; the stub returns null, not a token"
    missing:
      - "A test that stubs localStorage.getItem to return JSON.stringify({ accessToken: \"  tok-123  \" }) and asserts syncCaidoSessionToken was called with \"tok-123\" — this is the single assertion that kills the surviving mutant"
      - "A test for the JSON.parse-failure branch (malformed raw -> pushCaidoSessionToken(\"\") + showToast)"
      - "A test for a non-string getItem return (settings.ts:41 ternary false arm)"
      - "Correct the SIG-01h row in 01-VALIDATION.md from '✅ exists' to a Wave-0 item, so the validation contract stops asserting coverage that does not exist"
human_verification: []
---

# Phase 1: Restore the Verification Signal — Verification Report

**Phase Goal:** Restore the Verification Signal — make the test suite green and trustworthy across Node majors, make `pnpm lint` a real installed gate that CI enforces, and prove on real CI that the blind spot which hid a runtime behaviour change is closed.
**Verified:** 2026-08-12T15:10:24Z
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification
**Tree verified:** branch `fix/security-hotfixes`, HEAD `24b82e0`

---

## Goal Achievement

### Observable Truths

Merged from ROADMAP.md Success Criteria (contract, rows R1–R4) and `must_haves.truths`
in all six PLAN frontmatters (rows P*). Every row was checked against the codebase,
not against SUMMARY.md.

#### ROADMAP Success Criteria

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| R1 | `vitest run` green on Node 20/22/24/26; the five `ChatView.mount.test.ts` failures are gone; `window.localStorage` read through a guard tolerating absent-or-throwing storage | ✓ VERIFIED | Ran locally: Node 26.7.0 → 23 files/131 tests pass; Node 22.23.2 → 131 pass; Node 24.13.0 → 131 pass. Node 20.20.2 green on CI run `31605493233`. `ChatView.mount.test.ts` 7/7 pass on all three local majors. Guard at `settings.ts:34-45` handles absent (`:38`), throwing (`:42-44`), and no-`getItem` (`:39`). See gap G1 for the forwarding-direction caveat — it does not falsify R1's literal text |
| R2 | `pnpm lint` invokes a real, installed ESLint with a committed flat config covering TypeScript and Vue, passes `--max-warnings 0`; the CI lint invocation carries no `--fix` | ✓ VERIFIED | `eslint . -f json` → 62 files, 0 errors, 0 warnings. Coverage breakdown: backend 16, frontend 36, shared 6, plus `caido.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`. ESLint 10.8.1 + typescript-eslint 8.67.0 + eslint-plugin-vue 10.10.0 exact-pinned in `package.json:32-48`; `eslint.config.mjs` committed (92 lines). `grep -c -- "--fix" .github/workflows/*.yml` → 0 for both files; `scripts.lint` = `eslint . --max-warnings 0`, `--fix` isolated in `lint:fix` |
| R3 | CI runs typecheck → lint → test → build on push and pull_request for **every** branch, Node 20/22/24/26 matrix, `fail-fast: false`, and a lint failure fails the job | ✓ VERIFIED | `ci.yml:6-8` bare `push:` / `pull_request:` keys, no `branches` filter on either. `:27` matrix `['20','22','24','26']`. `:25` `fail-fast: false`. `:47-57` step order Typecheck → Lint → Test → Build. Lint failure proven on real CI: run `31605906945` — all four legs `failure`, failing step `Lint` on each (verified per-step via the GitHub API, not from SUMMARY) |
| R4 | The blind spot is closed and the closure is **proven**: reverting only the guard and the shim on a scratch branch turns the Node 26 leg red while 20/22/24 stay green | ✓ VERIFIED | Run `31606402559` re-verified against the GitHub API by me: `Verify (Node 26)` = failure at step `Test`; `Verify (Node 20/22/24)` = success, no failing steps. Commit `4e35fbc` file list confirms the revert touched **only** `vitest.setup.ts` (-80), `vitest.config.ts` (-1), `__storage-shim.test.ts` (-63), `settings.test.ts` (-37), `settings.ts` (+2/-24). Job log for the red leg shows the exact historical signature: `ChatView.mount.test.ts (7 tests | 5 failed)`, `Test Files 1 failed | 21 passed` |

#### Plan 01-01 — storage guard (SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P1.1 | Reading the token never throws when `window.localStorage` is absent, throws on property access, or lacks `getItem` | ✓ VERIFIED | `settings.ts:34-45`: optional-chained read inside `try`, null/undefined check, `typeof getItem !== "function"` check, bare `catch` returning `undefined`. Tests at `settings.test.ts:296`, `:307` (throwing getter, `DOMException` SecurityError), `:322`. All 3 pass |
| P1.2 | Every storage failure mode routes to `pushCaidoSessionToken("")` — the existing fail-closed sink | ✓ VERIFIED | `settings.ts:94-97` collapses `undefined`/blank to `pushCaidoSessionToken("")`; all three tests assert `toHaveBeenCalledWith("")`. Sink intact downstream: `index.ts:1696-1702` still aborts `startMcpServer` on an empty effective token, and the phase diff touches no line of that function |
| P1.3 | The existing happy path (real token JSON in storage) still resolves `accessToken` and still pushes it | ✗ **FAILED** | Correct by code inspection (`settings.ts:99-113`) but **unverified and unfalsifiable by the suite**. Mutation `if (key !== "__never__") return undefined;` at the top of `readBrowserStorageItem` → 23 files / 131 tests still pass. Repo-wide grep: `CAIDO_AUTHENTICATION` occurs once, in production code only. See gap G1 |
| P1.4 | Three unit tests assert guard behaviour directly, so the guard is falsifiable independently of the ChatView mount tests | ⚠️ PARTIAL | Independence VERIFIED — `settings.test.ts` carries no `@vitest-environment` docblock, so it runs in the `node` env and never touches the shim; it stubs `window` itself. Falsifiability HALF-VERIFIED: replacing the guard with the pre-phase unguarded read fails 3/3 guard tests (measured), so the tolerance direction is pinned; a guard that always returns `undefined` passes all 3, so the forwarding direction is not. Rolled into gap G1 |

#### Plan 01-02 — vitest storage shim (SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P2.1 | Every Node major exercises the same storage code path in DOM tests — no version-dependent branch divergence | ✓ VERIFIED | `vitest.setup.ts:70-79` installs storage in any DOM env lacking it. Suite is 131/131 on 22, 24 and 26 locally and on 20 in CI, with identical test counts — no leg skips or diverges |
| P2.2 | Node-environment test files still see no browser storage, so they keep exercising the real absent-storage branch | ✓ VERIFIED | Shim gated on `typeof globalThis.document !== "undefined"` (`vitest.setup.ts:70`). Measured in a plain Node 26.7.0 process: `typeof document` → `undefined`, `typeof localStorage` → `undefined` (Node prints `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`). 15 of 23 test files run in the node env, `settings.test.ts` among them |
| P2.3 | The shim is inert when storage already works: it never replaces a working happy-dom Storage with an in-memory stub | ✓ VERIFIED | `hasUsableStorage()` (`:27-36`) gates the `defineProperty`. `__storage-shim.test.ts:35-62` is a real inertness proof, not a round-trip tautology: it asserts `Object.getPrototypeOf(store) !== Object.prototype` and `store.constructor.name === "Storage"`, which the in-memory object literal fallback would fail |
| P2.4 | No test file fails to collect with `Illegal constructor` | ✓ VERIFIED | 23/23 files collect and pass on Node 22, 24 and 26. `createStorage()` (`:38-48`) wraps `new Ctor()` in try/catch precisely for Node's non-constructible native `Storage` |

#### Plan 01-03 — ESLint 10 toolchain (SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P3.1 | `pnpm lint` invokes a real, installed ESLint 10 against a committed flat config | ✓ VERIFIED | `eslint@10.8.1` in devDependencies; `eslint.config.mjs` committed at repo root; `npx eslint . --max-warnings 0` exits 0 |
| P3.2 | The lint run covers the whole repo, including `packages/backend/assets/mcp-server.mjs`, which the old `./packages/**/src` glob never reached | ✓ VERIFIED | JSON formatter output confirms `assets/mcp-server.mjs` is in the linted set (`has mcp-server.mjs: true`). 62 files total (VALIDATION predicted 59 before this phase added `eslint.config.mjs`, `vitest.setup.ts`, `__storage-shim.test.ts`) |
| P3.3 | No `--fix` anywhere on the `pnpm lint` path; `--fix` lives only in `lint:fix` | ✓ VERIFIED | `scripts.lint` = `eslint . --max-warnings 0`; `scripts.lint:fix` = `eslint . --fix`; zero `--fix` occurrences in either workflow file |
| P3.4 | ESLint loads without the `MODULE_TYPELESS_PACKAGE_JSON` reparse warning | ✓ VERIFIED | `npx eslint . --max-warnings 0 2>&1 \| grep -c MODULE_TYPELESS` → 0. Config is `.mjs`, matching the root package having no `"type": "module"` |
| P3.5 | The lockfile lands in the same commit as `package.json`, so `pnpm install --frozen-lockfile` cannot fail in CI | ✓ VERIFIED | Commit `d67e034` contains `package.json` (+15/-4) and `pnpm-lock.yaml` (+760) together. Empirically confirmed downstream: `pnpm install --frozen-lockfile` succeeded on all four legs of run `31605493233` |

#### Plan 01-04 — clear the lint debt (SIG-01, SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P4.1 | `pnpm lint` exits 0 with `--max-warnings 0` across the whole repo | ✓ VERIFIED | 62 files, 0 errors, 0 warnings, exit 0 |
| P4.2 | A deliberately introduced lint error makes `pnpm lint` exit 1 — the gate is proven to bite | ✓ VERIFIED | Non-mutating proof via `--stdin`: `const unused = 1;` as `packages/frontend/src/__probe.ts` → 1 error (`@typescript-eslint/no-unused-vars`). `describe.only` as `__probe.test.ts` → exit 1 with `vitest/no-focused-tests: Focused tests are not allowed`. Also proven end-to-end on CI run `31605906945` (four legs red at `Lint`) |
| P4.3 | The full suite is green on Node 22, 24 and 26 locally, with at least 125 tests and no reduction in test count | ✓ VERIFIED | 131 tests on all three, measured by me in this verification run. 131 ≥ 125. No committed `.only` (grep clean, and `no-focused-tests` fires) |
| P4.4 | `vue/no-v-html` stays enabled at config level; the single legitimate use is suppressed by a narrowly scoped in-template disable/enable pair with a rationale, and `MessageBubble.vue` still compiles and mounts | ✓ VERIFIED | `eslint --print-config MessageBubble.vue` → `vue/no-v-html: [1]` (warn, which `--max-warnings 0` promotes to failure), so the disable is load-bearing. `MessageBubble.vue:104-113`: 3-line rationale comment, `eslint-disable` at `:107`, matching `eslint-enable` at `:113`, wrapping exactly one element, outside the start tag. `MessageBubble.test.ts` 7/7 pass; `vue-tsc --noEmit` exits 0 |
| P4.5 | No file in the Phase 5-8 spawn path changed anywhere in this phase | ✓ VERIFIED | `git diff 06ea0e5..HEAD -- packages/backend/src/` grepped for `renderExportExecScript\|writeMcpWrapper\|writeLaunchScript\|shellQuote\|chmod` → zero matching added/removed lines. The only `index.ts` change in the entire phase is one line in `writeApprovalDecision` (`let` → `const`, `:710`) |

#### Plan 01-05 — CI matrix and lint gate (SIG-03, SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P5.1 | CI runs on push and pull_request for every branch, not only main | ✓ VERIFIED | `ci.yml:6-8`, no `branches:` key under either trigger. Empirically: run `31605493233` fired from `scratch/ci-proof-matrix`, event `push` |
| P5.2 | Four Node legs — 20, 22, 24, 26 — run with `fail-fast: false`, so one leg can never mask another | ✓ VERIFIED | `ci.yml:25-27`. Empirically proven by run `31606402559`: Node 26 failed while 20/22/24 completed and concluded `success` — exactly the discrimination `fail-fast: false` buys |
| P5.3 | The step order is typecheck → lint → test → build, and a lint failure fails the job | ✓ VERIFIED | `ci.yml:47-57` in that order. Run `31605906945` failing step = `Lint` on all four legs, with Test and Build never reached |
| P5.4 | No `--fix` appears anywhere in either workflow | ✓ VERIFIED | `grep -c -- "--fix"` → 0 in `ci.yml` and 0 in `release.yml` |
| P5.5 | The release signing pipeline is byte-identical from `Sign plugin zip` downward | ✓ VERIFIED | `git diff 06ea0e5..HEAD -- .github/workflows/release.yml` ends at line 44 (`Test` step). The `Sign plugin zip` block (`:49-61`), `Resolve plugin version` (`:63-68`) and `Create GitHub release` (`:70-77`) are untouched |

#### Plan 01-06 — CI proofs (SIG-03, SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P6.1 | All four matrix legs run and pass on a real push of the phase branch | ✓ VERIFIED | Run `31605493233`, head `16080519`, event `push`, conclusion `success`; all four `Verify (Node N)` jobs `success` — re-queried by me against the GitHub API |
| P6.2 | The `drift-plugin` artifact is produced exactly once, with no 409 | ✓ VERIFIED | `GET runs/31605493233/artifacts` → `total_count: 1`, names `["drift-plugin"]`. Upload gated on `matrix.node == '24'` (`ci.yml:63`) |
| P6.3 | A deliberate lint error turns all four legs red, at the Lint step | ✓ VERIFIED | Run `31605906945`, head `49f4a9d`: four legs `failure`, per-step query returns `Lint` as the sole failing step on every leg |
| P6.4 | Reverting only the guard and the shim turns the Node 26 leg red while 20, 22 and 24 stay green | ✓ VERIFIED | Run `31606402559` + commit `4e35fbc` file list + red-leg job log, all three independently fetched. See R4 |
| P6.5 | GitHub branch protection on main requires the four new check names, **or the gap is explicitly recorded** | ✓ VERIFIED (second arm) | `GET repos/six2dez/drift/branches/main/protection` → **404 "Branch not protected"**, re-measured by me. The gap is explicitly recorded in `.planning/STATE.md:88` as an OPEN DECISION, with the corrected premise (A7 assumed a required check existed; none ever did) and the four check names to use if the user opts in. The must-have's disjunctive second arm is satisfied |

**Score:** 30/32 truths verified (1 FAILED, 1 PARTIAL — both rolled into gap G1)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/frontend/src/stores/settings.ts` | `readBrowserStorageItem` total function + guarded `syncCaidoSessionToken` | ⚠️ HOLLOW-TESTED | L1 exists · L2 substantive (34-45, real branching, 8-line rationale comment) · L3 wired (called at `:93`, sole `CAIDO_AUTHENTICATION` consumer) · **L4 data-flow: the return value's non-`undefined` path is never exercised by any test** |
| `packages/frontend/src/stores/settings.test.ts` | Guard unit tests for absent / throwing / no-`getItem` | ⚠️ PARTIAL | L1 exists · L2 substantive (10 tests, all pass) · contains `"absent browser storage"` ✓ · but no positive-path test; see gap G1 |
| `vitest.setup.ts` | Web Storage parity shim with delete-on-Vitest-5 note | ✓ VERIFIED | 80 lines (min 40 ✓), contains `sessionStorage` ✓, DELETE-THIS-FILE note at `:15-16` with upstream issue links |
| `vitest.config.ts` | `setupFiles` wiring; dead `environmentMatchGlobs` removed | ✓ VERIFIED | `setupFiles: ["./vitest.setup.ts"]` at `:20`; `environmentMatchGlobs` absent, with a do-not-re-add comment at `:16-19` |
| `packages/frontend/src/__storage-shim.test.ts` | SIG-01i shim inertness + round-trip proof | ✓ VERIFIED | 63 lines, `// @vitest-environment happy-dom` at line 1 ✓, 3 tests, inertness discriminator is prototype+constructor identity rather than a round-trip tautology |
| `eslint.config.mjs` | Root ESLint 10 flat config covering TS, Vue SFCs, `.mjs`, tests | ✓ VERIFIED | 92 lines (min 40 ✓), contains `eslint-config-prettier/flat` ✓ as the final entry, `vue-eslint-parser` kept top-level with `tseslint.parser` nested under `parserOptions` |
| `package.json` | 8 exact-pinned ESLint devDeps; lint / lint:fix split; widened format glob | ✓ VERIFIED | 8 new pinned deps (`@eslint/js` 10.0.1, `@vitest/eslint-plugin` 1.6.27, `eslint` 10.8.1, `eslint-config-prettier` 10.1.8, `eslint-plugin-vue` 10.10.0, `globals` 17.11.0, `typescript-eslint` 8.67.0, `vue-eslint-parser` 10.4.1); contains `--max-warnings 0` ✓; format glob widened to include `"*.{ts,mjs}"` |
| `pnpm-lock.yaml` | Resolved tree for the 8 new devDependencies | ✓ VERIFIED | +760 lines in commit `d67e034` alongside `package.json` |
| `packages/backend/assets/mcp-server.mjs` | GraphQL timeout error that preserves its cause | ✓ VERIFIED | `:278` `throw new Error(..., { cause: error })`; sole change in the file this phase |
| `packages/frontend/src/components/chat/MessageBubble.vue` | Attribute order fixed and a justified element-scoped `vue/no-v-html` disable/enable pair | ✓ VERIFIED | `:104-113`, contains `eslint-disable vue/no-v-html` ✓ and the matching `eslint-enable` |
| `.github/workflows/ci.yml` | Unfiltered triggers, 20/22/24/26 matrix, lint step, current action majors, single-leg artifact | ✓ VERIFIED | contains `fail-fast: false` ✓; `checkout@v5`, `pnpm/action-setup@v6`, `setup-node@v5`, `upload-artifact@v5` |
| `.github/workflows/release.yml` | Lint step in the same slot as CI, action majors aligned | ✓ VERIFIED | contains `pnpm lint` ✓ at `:41`, same slot (after Typecheck, before Test); majors aligned; signing block untouched |
| `01-06-SUMMARY.md` | Recorded CI run URLs and per-leg outcomes for SIG-01d/03e/03f/03g | ✓ VERIFIED | contains `SIG-03f` ✓; every recorded run ID, per-leg conclusion and per-step conclusion was re-queried against the GitHub API and matched |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `settings.ts` | `pushCaidoSessionToken("")` | guard returns `undefined` → empty push → `startMcpServer` aborts | ✓ WIRED | `settings.ts:95`, `:106`; sink at `index.ts:1697-1702` intact and untouched |
| `settings.ts` | `globalThis.window?.localStorage` | optional-chained property read inside try/catch | ✓ WIRED | `settings.ts:36-37` matches `window\?\.localStorage` |
| `vitest.config.ts` | `vitest.setup.ts` | `test.setupFiles` | ✓ WIRED | Exact pattern `setupFiles: ["./vitest.setup.ts"]`; empirically load-bearing — the reviewer disabled the file and 2/3 shim self-tests failed on Node 26 |
| `vitest.setup.ts` | `globalThis.localStorage` / `sessionStorage` | `Object.defineProperty`, gated on `typeof document !== "undefined"` | ✓ WIRED | `:70-79` |
| `package.json scripts.lint` | `eslint.config.mjs` | `eslint .` resolves the flat config upward | ✓ WIRED | 62 files resolved across 3 packages + 4 root files |
| `eslint.config.mjs` | `eslint-config-prettier/flat` | final entry disables Prettier-owned rules | ✓ WIRED | Imported `:18`, applied last `:91` |
| `MessageBubble.vue` | `eslint.config.mjs vue/no-v-html` | template disable/enable pair outside the start tag | ✓ WIRED | Rule resolves to severity 1; pair present and correctly placed |
| `pnpm lint` | CI Lint step | same script, same ratchet, no `--fix` either side | ✓ WIRED | `ci.yml:51` `run: pnpm lint`; `release.yml:41` identical |
| `pnpm/action-setup` | `actions/setup-node cache: pnpm` | pnpm installed before setup-node resolves the store | ✓ WIRED | `ci.yml:35-42` in the correct order; `cache: pnpm` present; install succeeded on all four legs |
| Node 26 matrix leg | storage guard + shim | revert-proof on a scratch branch | ✓ WIRED | `Verify (Node 26)` red at `Test`; siblings green |
| Branch protection on main | `Verify (Node 20\|22\|24\|26)` | required status check names | ⚠️ N/A BY MEASUREMENT | No protection and no rulesets exist on `main` (404 / `[]`). Recorded as an open user decision in STATE.md — satisfies the must-have's second arm |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `settings.ts` `syncCaidoSessionToken` | `raw` / `token` | `readBrowserStorageItem("CAIDO_AUTHENTICATION")` → `window.localStorage.getItem` | In production: yes, by inspection. **Under test: never — every test path yields `undefined` or `null`** | ⚠️ HOLLOW — wired, but no test drives real data through it |
| `vitest.setup.ts` shim | `globalThis.localStorage` | happy-dom `Storage` constructor, else in-memory Map | Yes — round-trip + prototype identity asserted in `__storage-shim.test.ts` | ✓ FLOWING |
| `ChatView.mount.test.ts` | ambient `window.localStorage` | shim-provided happy-dom `Storage` (empty) | Yes, but empty by design — the tests assert flow continuation, not token content | ✓ FLOWING (as designed) |
| `mcp-server.mjs` timeout error | `cause` | caught `AbortError` | Yes — `{ cause: error }` propagates the original | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite green on the bug-reproducing Node major | `npx vitest run` on Node 26.7.0 | 23 files / 131 tests passed | ✓ PASS |
| Suite green on Node 22 | `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run` | v22.23.2 → 131 passed | ✓ PASS |
| Suite green on Node 24 | `PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH npx vitest run` | v24.13.0 → 131 passed | ✓ PASS |
| Lint gate clean | `npx eslint . --max-warnings 0` | exit 0 | ✓ PASS |
| Lint coverage real | `npx eslint . -f json` | 62 files; `mcp-server.mjs` included; 0/0 | ✓ PASS |
| Lint gate bites (unused var) | `echo 'const unused = 1;' \| npx eslint --stdin --stdin-filename …__probe.ts` | 1 error, `no-unused-vars` | ✓ PASS |
| Lint gate bites (focused test) | `describe.only` via `--stdin` as `__probe.test.ts` | exit 1, `vitest/no-focused-tests` | ✓ PASS |
| No `MODULE_TYPELESS` warning | `npx eslint . 2>&1 \| grep -c MODULE_TYPELESS` | 0 | ✓ PASS |
| Typecheck | `pnpm -r typecheck` | shared/backend/frontend all Done, exit 0 | ✓ PASS |
| Build payload complete | `unzip -l dist/drift.zip` | `backend/index.js`, `backend/assets/mcp-server.mjs`, `manifest.json` all present | ✓ PASS |
| Node-env sees no storage | `node -e 'typeof document, typeof localStorage'` on Node 26.7.0 | both `undefined` | ✓ PASS |
| `vue/no-v-html` genuinely enabled | `eslint --print-config MessageBubble.vue` | `vue/no-v-html: [1]` | ✓ PASS |
| No committed focused tests | grep `(describe\|it\|test)\.only` over `**/*.test.ts` | no matches | ✓ PASS |
| **Mutation: guard always returns `undefined`** | inserted `if (key !== "__never__") return undefined;`, ran full suite, reverted via `git checkout` | **23 files / 131 tests still PASS** | ✗ **FAIL** — see gap G1 |
| **Counter-mutation: guard replaced by pre-phase unguarded read** | replaced body with `window.localStorage.getItem(key)`, ran `settings.test.ts`, reverted | **3 failed / 7 passed** — tolerance direction IS pinned | ✓ PASS |
| Working tree restored after mutations | `git diff --quiet -- packages/frontend/src/stores/settings.ts` | clean; `git status --porcelain` shows only the pre-existing untracked `IMPROVEMENT-PLAN.md` | ✓ PASS |

---

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | No `scripts/*/tests/probe-*.sh` exist in this repo and no PLAN declares a probe path. This phase's integration proofs are CI runs, which were executed as probes above | ? SKIP (no probes declared) |

**CI proof runs, re-executed as verifier-side queries (not read from SUMMARY.md):**

| Run | Branch | Purpose | Per-leg result | Verified |
|-----|--------|---------|----------------|----------|
| `31605493233` | `scratch/ci-proof-matrix` | SIG-01d + SIG-03g | 20 ✓ 22 ✓ 24 ✓ 26 ✓; 1 artifact `drift-plugin` | ✓ |
| `31605906945` | `scratch/ci-proof-lint` | SIG-03e | all four `failure` at step `Lint` | ✓ |
| `31606402559` | `scratch/ci-proof-node26` | SIG-03f | 26 `failure` at step `Test`; 20/22/24 `success` | ✓ |

`git ls-remote --heads origin` → `main` only. Both scratch branches are gone from the public remote, as claimed.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SIG-01 | 01-01, 01-02, 01-04, 01-06 | `vitest run` green on Node 20/22/24/26; `window.localStorage` accessed through a guard that tolerates absent-or-throwing storage | ⚠️ SATISFIED WITH GAP | Literal text met and independently measured on all four majors; the guard exists and its tolerance is falsifiable. But the phase's own SIG-01h assertion is unmet and the forwarding direction is mutation-survivable — gap G1 |
| SIG-02 | 01-03, 01-04, 01-05 | `pnpm lint` invokes a real installed ESLint with a committed flat config, passes `--max-warnings 0`, no `--fix` on the CI path; CI fails on lint errors | ✓ SATISFIED | 62 files 0/0; deliberate error → exit 1 locally and four red legs on CI; zero `--fix` in either workflow |
| SIG-03 | 01-05, 01-06 | CI runs typecheck → lint → test → build on push and PR for every branch, 20/22/24/26 with `fail-fast: false`, closure proven by a revert-test on a scratch branch | ✓ SATISFIED | Static YAML verified line by line and every claim re-proven against three real CI runs, including the revert-proof's failing-step and log signature |

**Orphaned requirements:** none. `REQUIREMENTS.md:172` maps exactly SIG-01, SIG-02, SIG-03 to Phase 1, and all three appear in PLAN frontmatter `requirements:` fields. `REQUIREMENTS.md:122-124` marks all three Complete — accurate for SIG-02/SIG-03, and optimistic for SIG-01 pending gap G1.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` debt markers across all 11 phase-modified code files | ✓ NONE | Debt-marker gate passes cleanly — no unreferenced markers introduced |
| `packages/frontend/src/stores/settings.test.ts` | 118-122 | `beforeEach` stubs `getItem` → `null`; VALIDATION.md counts this as happy-path coverage | 🛑 BLOCKER | This is the mechanism of gap G1: a test that passes without testing the stated behaviour |
| `packages/frontend/src/stores/settings.ts` | 105-111 | `JSON.parse` failure branch (`pushCaidoSessionToken("")` + `showToast`) has zero coverage | ⚠️ WARNING | No test asserts the toast; `showToast` is mocked but never asserted in this file. Same root cause as G1 |
| `packages/{backend,frontend}/tsconfig.json` | 8 | `exclude: ["./src/**/*.test.ts"]`; no tsconfig `include`s root-level TS | ⚠️ WARNING | All 23 test files and all four root TS files — including the `vitest.setup.ts` this phase added — are outside `pnpm typecheck`. **Pre-existing** (the exclude dates to the initial commit `3f38cc0`), not introduced here, and not covered by any Phase 1 must-have. Matches review WR-02 |
| repo-wide | — | `prettier --check "packages/**/src/**/*.{vue,ts,js,json}" "*.{ts,mjs}"` → 46 files non-compliant | ⚠️ WARNING | `eslint-config-prettier` silences stylistic rules and nothing runs `prettier --check` on the CI path, so formatting is now unenforced rather than relocated. Not a declared Phase 1 must-have (the plan required only the widened `format` glob, which is present). Matches review WR-04 |
| `CLAUDE.md` | 26 | "CI pins Node 20 via `actions/setup-node`" | ⚠️ WARNING | Stale after the four-leg matrix landed. `CLAUDE.md` **was** edited by plan 01-03 (the ESLint sections at `:73-74`, `:112-115` are correct), so the doc-sync pass was incomplete rather than skipped. Matches review WR-05 |
| `.github/workflows/ci.yml` | 11-15 | Concurrency comment claims same-repo PRs collapse into one group | ℹ️ INFO | `github.event.pull_request.number` is empty on the `push` event, so the two events key differently and 8 jobs still run. Comment is wrong; the workflow is not. Matches review WR-01 |
| `package.json` | 26 | `build` uses `2>/dev/null; ` so the asset copy cannot fail loudly and `caido-dev build`'s exit status is discarded | ℹ️ INFO | **Pre-existing** and outside Phase 1's scope (no must-have touches the build script), but it sits on the release-signing path. Verified non-harmful today: the current `dist/drift.zip` does contain `backend/assets/mcp-server.mjs`. Matches review CR-02 — worth routing into Phase 2 or a hotfix |
| `main` branch | — | No branch protection and no rulesets | ℹ️ INFO | Confirmed by me: `404 "Branch not protected"`. Explicitly recorded as an open user decision in `STATE.md:88`, which is what plan 01-06's must-have permits. Not a phase failure — a standing decision for the maintainer |

---

### Human Verification Required

None outstanding.

All four `Manual-Only Verifications` in `01-VALIDATION.md` (SIG-03e, SIG-03f, A7 branch protection, SIG-01d Node 20) were executed during plan 01-06 **and independently re-verified by this verification** against the GitHub API — run conclusions, per-job conclusions, per-step conclusions, the revert commit's file list, and the red leg's job log. The two `checkpoint:human-verify` gates in `01-06-PLAN.md` (lines 159, 222) correspond to SIG-03e and SIG-03f and are satisfied by that evidence. No `<verify><human-check>` blocks were deferred from `auto` tasks in any plan.

One item awaits a **maintainer decision**, not a verification: whether `main` should get branch protection at all. If yes, the four required-check names are `Verify (Node 20)`, `Verify (Node 22)`, `Verify (Node 24)`, `Verify (Node 26)`.

---

### Gaps Summary

**This phase substantially achieved its goal.** Three of the four ROADMAP Success Criteria are fully met with independently measured evidence, and the fourth — SC4, the revert-proof — is the strongest piece of work in the phase: I re-fetched run `31606402559` and confirmed that with only `settings.ts`, `vitest.setup.ts`, `vitest.config.ts` and the two associated test files reverted, `Verify (Node 26)` fails at the `Test` step with the exact historical `ChatView.mount.test.ts (7 tests | 5 failed)` signature while Nodes 20, 22 and 24 conclude `success`. That is a real, falsifiable closure of the blind spot, not a claim. The lint gate is equally real: 62 files at 0/0, `mcp-server.mjs` now inside coverage for the first time, `--fix` nowhere on the CI path, and the gate proven to bite both locally and across four red CI legs.

**One gap is genuine and must be recorded.** I ran the mutation myself rather than trusting the review: inserting `if (key !== "__never__") return undefined;` at the top of `readBrowserStorageItem` leaves the full suite green at 23 files / 131 tests. The counter-mutation is what makes this precise — replacing the guard with the pre-phase unguarded read *does* fail 3/3 guard tests. So the finding is narrower than "the primary production change is 100% mutation-survivable": **the tolerance direction is pinned; the forwarding direction is blind.**

On the merits of the question this phase poses: SIG-01's literal wording is about tolerance ("a guard that tolerates an environment where storage is absent or throws"), and by that wording SIG-01 passes. But the *phase goal* is trustworthiness, and the phase's own validation contract asserts more than its tests deliver. `01-VALIDATION.md` row SIG-01h states "The existing happy path (real token in storage) still works" and marks it `Exists? ✅ exists (vi.stubGlobal)`. That `vi.stubGlobal` returns `null`. Plan 01-01 carried the same framing forward and satisfied SIG-01h with "suite green, count unchanged". So the single assertion in this phase's 24-row contract that covers the *product-critical* direction of the one function this phase added is the one assertion that was never actually written — in the phase whose entire purpose is to stop exactly this. The blast radius is not cosmetic: a regression to an always-empty token makes `startMcpServer` abort at `index.ts:1697-1702`, which is total loss of the MCP bridge — `CLAUDE.md`'s stated core value.

This is a missing-test gap, not a broken-implementation gap. `settings.ts:99-113` is correct by inspection. The closure is small — the one test that kills the surviving mutant is roughly ten lines, and the code review already drafted it. Recommend closing it before Phase 2 begins, since every later phase in this milestone is meant to be validated by the signal this phase restored.

Three review warnings sit adjacent to the goal but outside its must-haves and are **not** counted as gaps: test files and root-level TS are outside `pnpm typecheck` (pre-existing since the initial commit), `prettier --check` runs nowhere so 46 files have drifted, and `CLAUDE.md:26` still describes the single-Node CI. The first two meaningfully narrow the restored signal and are good candidates for a follow-up; the third is a two-line doc fix.

---

_Verified: 2026-08-12T15:10:24Z_
_Verifier: Claude (gsd-verifier)_
