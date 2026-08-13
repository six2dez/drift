---
phase: 01-restore-the-verification-signal
verified: 2026-08-13T09:58:00Z
status: human_needed
score: 32/32 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 30/32
  gaps_closed:
    - "The existing happy path (real token JSON in storage) still resolves accessToken and still pushes it (P1.3 / SIG-01h)"
    - "Guard falsifiable in both directions, not only the tolerance direction (P1.4)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Push branch `fix/security-hotfixes` (currently local-only, no upstream) and confirm the `Verify (Node 20)` leg is green at 23 files / 134 tests"
    expected: "Node 20 leg concludes success with 134 tests, matching the 134 measured locally on Node 22.23.2 / 24.13.0 / 26.7.0"
    why_human: "No Node 20 binary exists on this machine (`~/.nvm/versions/node/` holds only v24.13.0; no `node@20` in Homebrew) and the branch has never been pushed, so no CI run has executed the 3 tests added by quick task 260813-dc7. The prior CI proof run `31605493233` proved Node 20 green at the 131-test state; `git diff --numstat 16080519 HEAD` shows the only delta is `settings.test.ts +46/-0`. Structurally low-risk — `settings.test.ts` carries no `@vitest-environment` docblock, runs in the `node` env and stubs `window` itself, so it never touches the ambient storage that is the sole Node-version-conditional behaviour in this phase — but formally unmeasured on that leg."
---

# Phase 1: Restore the Verification Signal — Verification Report

**Phase Goal:** Restore the Verification Signal — make the test suite green and trustworthy across Node majors, make `pnpm lint` a real installed gate that CI enforces, and prove on real CI that the blind spot which hid a runtime behaviour change is closed.
**Verified:** 2026-08-13T09:58:00Z
**Status:** human_needed (0 gaps; 1 CI-dependent measurement)
**Re-verification:** Yes — after gap closure by quick task `260813-dc7`
**Tree verified:** branch `fix/security-hotfixes`, HEAD `5d8155a` (was `24b82e0` at initial verification)

---

## Re-Verification Outcome

**Gap G1 is CLOSED, proven by execution rather than by reading the SUMMARY.**

The prior verification recorded one gap: `readBrowserStorageItem`'s *forwarding* direction was
mutation-survivable. Inserting `if (key !== "__never__") return undefined;` left the full suite
green at 131 tests, because every guard test asserted `syncCaidoSessionToken` was called with
`""` — precisely what a permanently broken read also produces.

I re-ran that exact mutation myself on the current tree. It now kills tests, and it kills them
at the full-suite level that CI actually runs.

### The mutation, re-executed

| Step | Command | Result |
|------|---------|--------|
| Baseline | `npx vitest run` (Node 26.7.0) | 23 files / **134 tests** passed |
| Backup | `shasum -a 256 settings.ts` | `162c813d…bb29f0f7` recorded before touching anything |
| Apply | `perl -0pi -e 's/(function readBrowserStorageItem…)/$1  if (key !== "__never__") return undefined;\n/'` | applied |
| **Landing check** | `git diff -- settings.ts` | `1 insertion(+)` at `settings.ts:35`, immediately inside the function body, before the `try` — confirmed by reading the diff, not assumed |
| Targeted | `vitest run settings.test.ts -t "forwards the parsed accessToken"` | **1 failed** — `AssertionError`: expected `"tok-123"`, received `""`, at `settings.test.ts:345` |
| **Whole file** | `vitest run settings.test.ts` | **2 failed \| 11 passed (13)**, exit **1** |
| **Full suite** | `npx vitest run` | **1 file failed / 22 passed; 2 tests failed / 132 passed (134)**, exit **1** |
| Revert | `git checkout -- settings.ts` | `git diff --quiet` exit **0**; sha256 back to `162c813d…bb29f0f7`; `diff -q` against the pristine backup reports identical |

The prediction the quick task derived — **2 failed / 11 passed** — is confirmed exactly, and for
the stated reasons. Test A dies on the token value; Test B dies because a broken read returns
early at `settings.ts:94-97` and never reaches the parse, so the warning toast is never raised;
Test C survives by design because it asserts `""`, covering the non-string arm rather than the
forwarding direction.

The decisive delta versus the prior run: **the same mutation that previously left the full suite
green at 131 now turns it red at 134 with exit code 1.** That is the property the phase goal
requires — the signal can now detect this regression.

### The counter-mutation, re-executed

The prior verification pinned the tolerance direction; I re-ran it because the test file changed.
Replacing the guarded call with the true pre-phase unguarded read (extracted from `70e72f9`,
the guard-introducing commit: `window.localStorage.getItem("CAIDO_AUTHENTICATION")`):

**4 failed | 9 passed (13)** — up from 3 failed before the quick task. The new non-string test
also dies, because the unguarded read hands back `42` and `raw.trim()` throws.

**Both mutation directions are now pinned.** This upgrades P1.4 from PARTIAL to VERIFIED — the
half-verified falsifiability that forced the earlier PARTIAL is resolved.

### Working tree left clean

`git status --porcelain` → only the pre-existing untracked `IMPROVEMENT-PLAN.md`.
`git diff --quiet` → exit 0. `settings.ts` sha256 matches the pristine backup byte for byte.
`grep -rn "__never__" packages/` → empty. **Nothing was committed.** The always-empty-token
hazard (`startMcpServer` aborting at `index.ts:1697-1702`) is not present in the tree.

---

## Goal Achievement

### Observable Truths

Rows R1–R4 are the ROADMAP Success Criteria (the contract); rows P* are `must_haves.truths`
from the six PLAN frontmatters. Rows unaffected by the quick task carry forward the prior
run's evidence with a regression re-check; rows the quick task could touch were fully re-measured.

#### ROADMAP Success Criteria

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| R1 | `vitest run` green on Node 20/22/24/26; the five `ChatView.mount.test.ts` failures are gone; `window.localStorage` read through a guard tolerating absent-or-throwing storage | ✓ VERIFIED | Re-measured at the new count: Node 22.23.2 → 134 passed; Node 24.13.0 (nvm) → 134 passed; Node 26.7.0 → 134 passed. `ChatView.mount.test.ts` 7/7 on all three. Guard at `settings.ts:34-45` handles absent (`:38`), throwing (`:42-44`), no-`getItem` (`:39`), non-string (`:41`). Node 20 green on CI run `31605493233` at the 131-test state — see the human-verification item for the 134-test delta. Note: Homebrew `node@23/24/25` are 50320-byte shims that all report v26.7.0; only `node@22` and nvm `v24.13.0` are genuine distinct majors, so only those are claimed |
| R2 | `pnpm lint` invokes a real, installed ESLint with a committed flat config covering TypeScript and Vue, passes `--max-warnings 0`; the CI lint invocation carries no `--fix` | ✓ VERIFIED | Re-measured: `eslint . -f json` → **62 files, 0 errors, 0 warnings**; `mcp-server.mjs` in the linted set ✓; `settings.test.ts` in the linted set ✓ (so the new tests are gated too). `npx eslint . --max-warnings 0` exit 0. `grep -c -- "--fix"` → 0 in both workflows. `scripts.lint` = `eslint . --max-warnings 0`; `--fix` isolated in `lint:fix` |
| R3 | CI runs typecheck → lint → test → build on push and pull_request for **every** branch, Node 20/22/24/26 matrix, `fail-fast: false`, and a lint failure fails the job | ✓ VERIFIED | Re-read `ci.yml`: bare `push:` / `pull_request:` with no `branches` filter; `fail-fast: false`; matrix `['20','22','24','26']`; steps Typecheck → Lint → Test → Build. Lint failure proven on real CI run `31605906945` (all four legs failed at step `Lint`) — carried forward, workflow files unchanged since |
| R4 | The blind spot is closed and the closure is **proven**: reverting only the guard and the shim on a scratch branch turns the Node 26 leg red while 20/22/24 stay green | ✓ VERIFIED | Run `31606402559` re-confirmed present in `gh run list` with `conclusion: failure` on `scratch/ci-proof-node26`, head `4e35fbc`. Per-leg/per-step evidence carried forward from the initial verification (Node 26 red at `Test`; 20/22/24 success). Nothing in the quick task touched the guard, the shim, or the workflows |

#### Plan 01-01 — storage guard (SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P1.1 | Reading the token never throws when `window.localStorage` is absent, throws on property access, or lacks `getItem` | ✓ VERIFIED | `settings.ts:34-45` unchanged (byte-identical to `aee377c` and to the prior verification's HEAD `24b82e0`). Tests at `:296`, `:307` (throwing getter, `DOMException` SecurityError), `:322` all pass and each is individually selectable |
| P1.2 | Every storage failure mode routes to `pushCaidoSessionToken("")` — the existing fail-closed sink | ✓ VERIFIED | `settings.ts:94-97`. Four tests now assert `toHaveBeenCalledWith("")` (three tolerance + the new non-string arm). Sink intact: `index.ts:1696-1702` re-read, still aborts `startMcpServer` on an empty token; `git diff --stat aee377c..HEAD -- packages/backend/src/index.ts` empty |
| P1.3 | The existing happy path (real token JSON in storage) still resolves `accessToken` and still pushes it | ✓ **VERIFIED** (was ✗ FAILED) | **`settings.test.ts:333-347`** drives `JSON.stringify({ accessToken: "  tok-123  " })` through the guard and asserts `syncCaidoSessionToken` received the **trimmed** `"tok-123"` — not the raw JSON — plus `getItem` called with `"CAIDO_AUTHENTICATION"`, which pins the key name. Falsifiability measured by me: under the mutation this test fails with expected `"tok-123"` / received `""`, and the full suite exits 1. The gap's own kill-criterion is met |
| P1.4 | Three unit tests assert guard behaviour directly, so the guard is falsifiable independently of the ChatView mount tests | ✓ **VERIFIED** (was ⚠️ PARTIAL) | Independence holds — `settings.test.ts` has no `@vitest-environment` docblock, runs in the `node` env, never touches the shim, stubs `window` itself. Falsifiability now complete in **both** directions, measured: forward mutation → 2 failed / 11 passed; tolerance counter-mutation → 4 failed / 9 passed. Six guard tests, each individually selectable by the `-t` titles the VALIDATION contract names |

#### Plan 01-02 — vitest storage shim (SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P2.1 | Every Node major exercises the same storage code path in DOM tests — no version-dependent branch divergence | ✓ VERIFIED | Identical 23 files / 134 tests on Node 22, 24 and 26 — no leg skips or diverges. `vitest.setup.ts` unchanged this task |
| P2.2 | Node-environment test files still see no browser storage, so they keep exercising the real absent-storage branch | ✓ VERIFIED | Shim gated on `typeof globalThis.document !== "undefined"`. The Node 26 suite run still emits `ExperimentalWarning: localStorage is not available…`, confirming the node env has no storage. Only 8 files carry `@vitest-environment`; `settings.test.ts` is not among them |
| P2.3 | The shim is inert when storage already works: it never replaces a working happy-dom Storage with an in-memory stub | ✓ VERIFIED | `__storage-shim.test.ts` 3/3 pass on all measured majors; inertness discriminator is prototype + constructor identity, not a round-trip tautology. Unchanged this task |
| P2.4 | No test file fails to collect with `Illegal constructor` | ✓ VERIFIED | 23/23 files collect and pass on Node 22, 24 and 26 |

#### Plan 01-03 — ESLint 10 toolchain (SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P3.1 | `pnpm lint` invokes a real, installed ESLint 10 against a committed flat config | ✓ VERIFIED | `npx eslint . --max-warnings 0` exit 0; `eslint.config.mjs` committed |
| P3.2 | The lint run covers the whole repo, including `packages/backend/assets/mcp-server.mjs` | ✓ VERIFIED | Re-measured 62 files; `mcp-server.mjs linted: true` |
| P3.3 | No `--fix` anywhere on the `pnpm lint` path; `--fix` lives only in `lint:fix` | ✓ VERIFIED | Re-read `package.json` scripts; 0 occurrences in both workflows |
| P3.4 | ESLint loads without the `MODULE_TYPELESS_PACKAGE_JSON` reparse warning | ✓ VERIFIED | Carried forward; config remains `.mjs` and unchanged |
| P3.5 | The lockfile lands in the same commit as `package.json` | ✓ VERIFIED | Commit `d67e034`; unchanged by the quick task |

#### Plan 01-04 — clear the lint debt (SIG-01, SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P4.1 | `pnpm lint` exits 0 with `--max-warnings 0` across the whole repo | ✓ VERIFIED | Re-measured post-quick-task: 62 files, 0 errors, 0 warnings, exit 0 — the 46 new test lines introduced no debt |
| P4.2 | A deliberately introduced lint error makes `pnpm lint` exit 1 — the gate is proven to bite | ✓ VERIFIED | Carried forward (non-mutating `--stdin` probes + four red CI legs on run `31605906945`) |
| P4.3 | The full suite is green on Node 22, 24 and 26 locally, with at least 125 tests and no reduction in test count | ✓ VERIFIED | **134** on all three, re-measured. 134 ≥ 125, and **up** from 131 — no reduction. No committed `.only` (grep clean) |
| P4.4 | `vue/no-v-html` stays enabled; the single use is suppressed by a narrowly scoped in-template disable/enable pair; `MessageBubble.vue` still compiles and mounts | ✓ VERIFIED | `MessageBubble.test.ts` 7/7 in the suite run; `pnpm -r typecheck` exit 0; file unchanged this task |
| P4.5 | No file in the Phase 5-8 spawn path changed anywhere in this phase | ✓ VERIFIED | Re-checked across the quick task: `git diff --name-only aee377c..HEAD -- packages/backend/` is **empty**. CMP-inv holds |

#### Plan 01-05 — CI matrix and lint gate (SIG-03, SIG-02)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P5.1 | CI runs on push and pull_request for every branch, not only main | ✓ VERIFIED | `ci.yml:6-8` re-read, no `branches:` key under either trigger |
| P5.2 | Four Node legs — 20, 22, 24, 26 — run with `fail-fast: false` | ✓ VERIFIED | `ci.yml` matrix `['20','22','24','26']`, `fail-fast: false`, with the rationale comment intact |
| P5.3 | The step order is typecheck → lint → test → build, and a lint failure fails the job | ✓ VERIFIED | Re-read: Typecheck → Lint → Test → Build. Proven on run `31605906945` |
| P5.4 | No `--fix` appears anywhere in either workflow | ✓ VERIFIED | `grep -c` → 0 and 0 |
| P5.5 | The release signing pipeline is byte-identical from `Sign plugin zip` downward | ✓ VERIFIED | Carried forward; `release.yml` untouched by the quick task |

#### Plan 01-06 — CI proofs (SIG-03, SIG-01)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| P6.1 | All four matrix legs run and pass on a real push of the phase branch | ✓ VERIFIED | Run `31605493233`, head `16080519`, `conclusion: success` — re-confirmed in `gh run list` |
| P6.2 | The `drift-plugin` artifact is produced exactly once, with no 409 | ✓ VERIFIED | Carried forward (`total_count: 1`) |
| P6.3 | A deliberate lint error turns all four legs red, at the Lint step | ✓ VERIFIED | Run `31605906945` re-confirmed `conclusion: failure` on `scratch/ci-proof-lint` |
| P6.4 | Reverting only the guard and the shim turns the Node 26 leg red while 20, 22 and 24 stay green | ✓ VERIFIED | Run `31606402559` re-confirmed `conclusion: failure` on `scratch/ci-proof-node26`, head `4e35fbc` |
| P6.5 | GitHub branch protection on main requires the four new check names, **or the gap is explicitly recorded** | ✓ VERIFIED (second arm) | Unchanged: no protection on `main`; the gap is explicitly recorded in `.planning/STATE.md` as an open decision. The disjunctive second arm is satisfied |

**Score:** 32/32 truths verified (was 30/32 — P1.3 FAILED → VERIFIED, P1.4 PARTIAL → VERIFIED)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/frontend/src/stores/settings.ts` | `readBrowserStorageItem` total function + guarded `syncCaidoSessionToken` | ✓ **VERIFIED** (was ⚠️ HOLLOW-TESTED) | L1 exists · L2 substantive (`:34-45`, real branching, 8-line rationale) · L3 wired (called at `:93`) · **L4 data-flow now real: `settings.test.ts:333-347` drives a present token end-to-end and the value is pinned by a mutation-falsifiable assertion.** Byte-identical to `aee377c` (sha256 `162c813d…`) — no production change |
| `packages/frontend/src/stores/settings.test.ts` | Guard unit tests for absent / throwing / no-`getItem` / **present token / malformed JSON / non-string** | ✓ **VERIFIED** (was ⚠️ PARTIAL) | 378 lines, **13 tests**, all pass. Append-only proven independently: `diff` of lines 1-331 against `aee377c` is identical, single hunk `@@ -329,4 +329,50 @@`, **0 removed lines**. Shared `beforeEach`/`afterEach` untouched |
| `.planning/…/01-VALIDATION.md` | A contract that no longer asserts coverage it does not have | ✓ **VERIFIED** (was flagged) | SIG-01h row corrected — see the dedicated section below |
| `vitest.setup.ts` | Web Storage parity shim with delete-on-Vitest-5 note | ✓ VERIFIED | Unchanged; 3/3 shim tests pass on all measured majors |
| `vitest.config.ts` | `setupFiles` wiring; dead `environmentMatchGlobs` removed | ✓ VERIFIED | Unchanged |
| `packages/frontend/src/__storage-shim.test.ts` | SIG-01i shim inertness + round-trip proof | ✓ VERIFIED | Unchanged; passes |
| `eslint.config.mjs` | Root ESLint 10 flat config covering TS, Vue SFCs, `.mjs`, tests | ✓ VERIFIED | Unchanged; resolves 62 files at 0/0, and lints the new test code |
| `package.json` | 8 exact-pinned ESLint devDeps; lint / lint:fix split | ✓ VERIFIED | Re-read; unchanged |
| `pnpm-lock.yaml` | Resolved tree for the 8 new devDependencies | ✓ VERIFIED | Unchanged |
| `packages/backend/assets/mcp-server.mjs` | GraphQL timeout error preserving its cause | ✓ VERIFIED | Unchanged (no backend diff in the quick task) |
| `MessageBubble.vue` | Attribute order + justified element-scoped `vue/no-v-html` pair | ✓ VERIFIED | Unchanged; 7/7 tests pass; typecheck clean |
| `.github/workflows/ci.yml` | Unfiltered triggers, 20/22/24/26 matrix, lint step, single-leg artifact | ✓ VERIFIED | Re-read line by line |
| `.github/workflows/release.yml` | Lint step in the same slot as CI; signing block untouched | ✓ VERIFIED | Unchanged |

---

### The corrected SIG-01h contract row

The prior verification flagged `01-VALIDATION.md` for asserting coverage that did not exist.
I checked the corrected row states something **true**, rather than merely that it changed.

Current row:

> `| SIG-01h | A present `CAIDO_AUTHENTICATION` token is parsed and its **trimmed `accessToken`** is forwarded — not the raw JSON | SIG-01 | unit | `… -t "forwards the parsed accessToken"` | ❌ Wave 0 — was mis-recorded as pre-existing `vi.stubGlobal` coverage; that stub returns `null`, so nothing drove a present token through the guard. Added by gap-closure `260813-dc7` | ⬜ pending |`

| Claim in the row | Verified how | Result |
|---|---|---|
| The behaviour described is what the test actually asserts | Read `settings.test.ts:333-347` | ✓ True — trimmed `"tok-123"` asserted, raw JSON explicitly not |
| The named command selects that test | Ran `vitest run settings.test.ts -t "forwards the parsed accessToken"` | ✓ True — `1 passed \| 12 skipped (13)` |
| "that stub returns `null`" — the corrective claim | Read `settings.test.ts:117-122` | ✓ True — `getItem: vi.fn(() => null)` |
| "Added by gap-closure `260813-dc7`" | `git log`, commit `6a5d31b` | ✓ True |
| No `✅ exists` claim survives on the row | `grep 'SIG-01h' \| grep -c '✅ exists'` | ✓ 0 |
| Marked as a Wave 0 item | `grep -c '❌ Wave 0'` | ✓ 1 |
| Map still exactly 24 assertions, 7 columns | `grep -cE '^\\| (\\*\\*)?(SIG-0[0-9][a-z]\|CMP-inv\|V2-inv)'` | ✓ 24 |
| False-pass table gained one SIG-01 row | `grep -cE '^\\| SIG-01 \\| '` | ✓ 5 (was 4) |
| Wave 0 bullet lists six `settings.test.ts` cases | Read line 113 | ✓ True |

All six SIG-01e/f/g/h selectors resolve to exactly one test each — the contract's automated
commands are executable, not decorative. **The validation contract now describes the suite it has.**

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `settings.test.ts` | `readBrowserStorageItem` forwarding path | `vi.stubGlobal("window", { localStorage: { getItem } })` returning JSON | ✓ **WIRED** (new) | `:339-340`; the link is proven load-bearing by the mutation, which severs it and fails the test |
| `settings.test.ts` | `mockSdk.backend.syncCaidoSessionToken` | `await store.syncCaidoRuntimeContext()` | ✓ WIRED | `:343-345`, asserts `"tok-123"` |
| `settings.test.ts` | `mockSdk.window.showToast` | malformed-JSON branch | ✓ **WIRED** (new) | `:360-363`, asserts the warning variant — previously zero-coverage |
| `settings.ts` | `pushCaidoSessionToken("")` | guard returns `undefined` → empty push → `startMcpServer` aborts | ✓ WIRED | `settings.ts:95`, `:106`; sink at `index.ts:1696-1702` re-read and intact |
| `settings.ts` | `globalThis.window?.localStorage` | optional-chained read inside try/catch | ✓ WIRED | `settings.ts:36-37` |
| `vitest.config.ts` | `vitest.setup.ts` | `test.setupFiles` | ✓ WIRED | Unchanged |
| `package.json scripts.lint` | `eslint.config.mjs` | `eslint .` resolves the flat config upward | ✓ WIRED | 62 files, including `settings.test.ts` |
| `pnpm lint` | CI Lint step | same script, no `--fix` either side | ✓ WIRED | `ci.yml` `run: pnpm lint` |
| Node 26 matrix leg | storage guard + shim | revert-proof on a scratch branch | ✓ WIRED | Run `31606402559` |
| Branch protection on main | `Verify (Node 20\|22\|24\|26)` | required status check names | ⚠️ N/A BY MEASUREMENT | No protection exists; recorded as an open user decision in STATE.md — the must-have's second arm |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `settings.ts` `syncCaidoSessionToken` | `raw` / `token` | `readBrowserStorageItem("CAIDO_AUTHENTICATION")` → `window.localStorage.getItem` | **Yes — under test as well as in production.** A present token now flows through and the trimmed output is pinned | ✓ **FLOWING** (was ⚠️ HOLLOW) |
| `settings.ts` malformed-JSON branch | `error` → toast message | `JSON.parse` throw | Yes — `showToast` asserted with the real message substring and `{ variant: "warning" }` | ✓ **FLOWING** (was zero-coverage) |
| `vitest.setup.ts` shim | `globalThis.localStorage` | happy-dom `Storage`, else in-memory Map | Yes — round-trip + prototype identity asserted | ✓ FLOWING |
| `ChatView.mount.test.ts` | ambient `window.localStorage` | shim-provided happy-dom `Storage` (empty) | Empty by design — asserts flow continuation | ✓ FLOWING (as designed) |
| `mcp-server.mjs` timeout error | `cause` | caught `AbortError` | Yes | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite green on the bug-reproducing major | `npx vitest run` on Node 26.7.0 | 23 files / 134 tests passed | ✓ PASS |
| Suite green on Node 22 | `PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vitest run` | v22.23.2 → 134 passed | ✓ PASS |
| Suite green on Node 24 | `PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH npx vitest run` | v24.13.0 → 134 passed | ✓ PASS |
| **Mutation: guard always returns `undefined`** | applied, landing-checked, full suite run, reverted | **full suite 2 failed / 132 passed, exit 1** | ✓ **PASS — mutant killed** |
| **Mutation, file scope** | `vitest run settings.test.ts` under mutation | **2 failed \| 11 passed (13)** — matches the predicted shape exactly | ✓ PASS |
| **Counter-mutation: pre-phase unguarded read** | replaced the guarded call, ran, reverted | **4 failed \| 9 passed (13)** | ✓ PASS — tolerance direction pinned |
| Working tree restored after both mutations | `git diff --quiet`; sha256; `diff -q` vs pristine backup | exit 0; `162c813d…`; identical | ✓ PASS |
| No mutation string in source | `grep -rn "__never__" packages/` | empty (planning docs only) | ✓ PASS |
| Each guard test individually selectable | `-t` for all six SIG-01e/f/g/h titles | each → `1 passed \| 12 skipped` | ✓ PASS |
| Lint gate clean | `npx eslint . --max-warnings 0` | exit 0 | ✓ PASS |
| Lint coverage real | `npx eslint . -f json` | 62 files, 0/0; `mcp-server.mjs` and `settings.test.ts` both linted | ✓ PASS |
| Typecheck | `pnpm -r typecheck` | exit 0 | ✓ PASS |
| No committed focused tests | grep `(describe\|it\|test)\.only` | no matches | ✓ PASS |
| No debt markers in changed file | grep `TBD\|FIXME\|XXX\|HACK\|PLACEHOLDER` on `settings.test.ts` | none | ✓ PASS |
| Append-only property | `diff` lines 1-331 vs `aee377c`; `git diff --numstat` | identical; `46 / 0`; single hunk | ✓ PASS |
| No production/backend change | `git diff --name-only aee377c..HEAD -- packages/backend/`; `git diff --quiet aee377c HEAD -- settings.ts` | empty; exit 0 | ✓ PASS |
| Node 20 at 134 tests | no local binary; branch never pushed | not measurable here | ? SKIP → human verification |

---

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | No `scripts/*/tests/probe-*.sh` exist and no PLAN declares a probe path. This phase's integration proofs are CI runs, re-queried below | ? SKIP (no probes declared) |

**CI proof runs, re-queried by me via `gh run list` (not read from any SUMMARY):**

| Run | Branch | Purpose | Conclusion | Verified |
|-----|--------|---------|------------|----------|
| `31605493233` | `scratch/ci-proof-matrix` | SIG-01d + SIG-03g | `success` | ✓ |
| `31605906945` | `scratch/ci-proof-lint` | SIG-03e | `failure` (at `Lint`) | ✓ |
| `31606402559` | `scratch/ci-proof-node26` | SIG-03f | `failure` (Node 26 at `Test`) | ✓ |

`git ls-remote --heads origin` → `main` only; both scratch branches are gone from the remote,
and the working branch `fix/security-hotfixes` has **no upstream** — it has never been pushed.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SIG-01 | 01-01, 01-02, 01-04, 01-06 | `vitest run` green on Node 20/22/24/26; `window.localStorage` accessed through a guard tolerating absent-or-throwing storage | ✓ **SATISFIED** (was ⚠️ SATISFIED WITH GAP) | Suite green at 134 on Nodes 22/24/26 measured locally, Node 20 green on CI at 131 with a version-agnostic +3 delta. The guard is now falsifiable in **both** directions by measured mutation, and the phase's own SIG-01h assertion is met by a real test rather than asserted |
| SIG-02 | 01-03, 01-04, 01-05 | `pnpm lint` invokes a real installed ESLint with a committed flat config, `--max-warnings 0`, no `--fix` on the CI path; CI fails on lint errors | ✓ SATISFIED | 62 files 0/0 re-measured, now covering the new test code; four red CI legs on `31605906945`; zero `--fix` in either workflow |
| SIG-03 | 01-05, 01-06 | CI runs typecheck → lint → test → build on push and PR for every branch, 20/22/24/26 with `fail-fast: false`, closure proven by a revert-test | ✓ SATISFIED | YAML re-read line by line; all three CI runs re-queried and matching |

**Orphaned requirements:** none. `REQUIREMENTS.md:172` maps exactly SIG-01, SIG-02, SIG-03 to
Phase 1, and all three appear in PLAN frontmatter. `REQUIREMENTS.md:122-124` marks all three
Complete — now accurate for all three, where SIG-01 was previously optimistic.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` debt markers across phase-modified files | ✓ NONE | Debt-marker gate passes; the 46 new lines introduced none |
| `packages/frontend/src/stores/settings.test.ts` | 118-122 | `beforeEach` stubs `getItem` → `null` | ✓ **RESOLVED** (was 🛑 BLOCKER) | Still returns `null`, but it is no longer load-bearing as happy-path evidence: three appended tests override the stub locally, and the contract no longer claims otherwise |
| `packages/frontend/src/stores/settings.ts` | 105-111 | `JSON.parse` failure branch had zero coverage | ✓ **RESOLVED** (was ⚠️ WARNING) | `settings.test.ts:349-364` now asserts both the `""` push and the `showToast` warning |
| `packages/{backend,frontend}/tsconfig.json` | 8 | `exclude: ["./src/**/*.test.ts"]`; no tsconfig `include`s root-level TS | ⚠️ WARNING (observation) | All 23 test files — including the 3 new ones — sit outside `pnpm typecheck`. **Pre-existing** since the initial commit, not introduced here, and not covered by any Phase 1 must-have. Explicitly out of scope per the re-verification brief |
| repo-wide | — | `prettier --check` covers 46 non-compliant files and runs nowhere on the CI path | ⚠️ WARNING (observation) | Formatting is unenforced rather than relocated. Not a declared Phase 1 must-have. Out of scope per the brief |
| `CLAUDE.md` | 26 | "CI pins Node 20 via `actions/setup-node`" | ⚠️ WARNING (observation) | Stale after the four-leg matrix landed. Two-line doc fix. Out of scope per the brief |
| `.github/workflows/ci.yml` | 11-15 | Concurrency comment claims same-repo PRs collapse into one group | ℹ️ INFO | `github.event.pull_request.number` is empty on `push`, so the events key differently. Comment is wrong; the workflow is not |
| `package.json` | 26 | `build` uses `2>/dev/null` so the asset copy cannot fail loudly | ℹ️ INFO | **Pre-existing**, outside Phase 1 scope, but sits on the release-signing path. Worth routing into a later phase |
| `main` branch | — | No branch protection and no rulesets | ℹ️ INFO | Recorded as an open user decision in STATE.md, which plan 01-06's must-have permits |
| `01-VALIDATION.md` | false-pass table | The new row says "the suite stays green at **131** tests" | ℹ️ INFO | Accurate as a record of the historical false-pass mechanism, and its counter-measure column states the fix. Slightly ambiguous now that the suite is 134 and does **not** stay green. Cosmetic only — not a false claim about current state |

---

### Human Verification Required

One item, and it is a measurement this machine cannot take rather than a judgment call.

#### 1. Node 20 leg green at 134 tests

**Test:** Push branch `fix/security-hotfixes` (currently local-only — `git rev-parse @{u}` reports
no upstream) and observe the `Verify (Node 20)` leg of the resulting CI run.
**Expected:** `success`, 23 files / 134 tests — matching Node 22.23.2, 24.13.0 and 26.7.0 locally.
**Why human:** No Node 20 binary exists here (`~/.nvm/versions/node/` holds only `v24.13.0`; no
Homebrew `node@20`), and no CI run has ever executed the 3 tests added by quick task `260813-dc7`.
CI proof run `31605493233` proved Node 20 green at the **131**-test state; `git diff --numstat
16080519 HEAD -- settings.test.ts` shows the only delta is `46 / 0`.

**Assessed risk: low.** `settings.test.ts` carries no `@vitest-environment` docblock, so it runs
in the `node` environment and stubs `window` itself — it never touches ambient storage, which is
the sole Node-version-conditional behaviour in this phase. The eight files that *are*
version-sensitive all carry the docblock and none changed. This resolves itself automatically on
the next push, because unfiltered branch triggers are exactly what SIG-03 delivered.

A second item awaits a **maintainer decision**, not a verification: whether `main` should get
branch protection. If yes, the required-check names are `Verify (Node 20)`, `Verify (Node 22)`,
`Verify (Node 24)`, `Verify (Node 26)`.

---

### Gaps Summary

**No gaps remain. The phase goal is achieved.**

The single gap from the initial verification is closed, and I closed the question the same way I
opened it — by running the mutation rather than reading about it. Inserting
`if (key !== "__never__") return undefined;` at the top of `readBrowserStorageItem` now produces
**2 failed / 11 passed** within `settings.test.ts` and turns the **full suite red at exit 1**,
where the identical mutation previously left all 131 tests green. The quick task's predicted
failure shape was exact, and it is exact for the predicted reasons: Test A dies on the token
value, Test B dies because a broken read returns early at `settings.ts:94-97` and never reaches
the parse that would raise the toast, and Test C survives by design because it asserts the `""`
of a different arm. I also re-ran the counter-mutation, which now fails 4 tests rather than 3 —
so both directions of the guard are pinned and P1.4's earlier PARTIAL is fully resolved.

The closure was achieved without touching production code, which I verified independently rather
than accepting: `settings.ts` is byte-identical to the pre-task HEAD `aee377c` and to the prior
verification's HEAD `24b82e0`, its sha256 matches the pristine backup I took before mutating, the
test-file diff is a single hunk with **0 removed lines**, lines 1-331 are identical, and no
backend file changed at all. The mutation string appears nowhere in `packages/`. The working tree
is clean; nothing was committed. That last point matters more than it sounds — a
permanently-applied mutant would ship an always-empty Caido token and abort `startMcpServer` at
`index.ts:1697-1702`, which is total loss of the MCP bridge, the stated core value.

The phase's own validation contract is now honest, which was the deeper problem the gap exposed.
`01-VALIDATION.md`'s SIG-01h row previously claimed pre-existing `vi.stubGlobal` coverage for the
happy path when that stub returns `null`. I checked the corrected row states something true on
every one of its claims, including running its named command and reading the `beforeEach` it
denies. The map still holds exactly 24 assertions with intact columns, and all six guard-test
selectors resolve to exactly one test each.

Everything else regression-checked clean at the new baseline: 62 lint files at 0 errors / 0
warnings now including the new test code, typecheck exit 0, no focused tests, no debt markers, CI
workflow unchanged and re-read line by line, and all three CI proof runs re-queried with matching
conclusions. Score moves from 30/32 to **32/32**.

Status is `human_needed` rather than `passed` for one narrow reason: the three new tests have
never executed on Node 20. No Node 20 binary exists locally and the branch has never been pushed,
so the 134-test state is unproven on that one leg. I judge the risk low on structural grounds and
say so above, but I will not record it as verified when it was not measured — that is the precise
habit this phase exists to establish.

Three items remain adjacent to the goal and outside its must-haves, unchanged and explicitly not
promoted to gaps: test files and root-level TS sit outside `pnpm typecheck` (pre-existing since
the initial commit), `prettier --check` runs nowhere so 46 files have drifted, and `CLAUDE.md:26`
still describes the single-Node CI.

---

_Verified: 2026-08-13T09:58:00Z_
_Verifier: Claude (gsd-verifier)_
