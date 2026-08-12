---
phase: 01-restore-the-verification-signal
plan: 02
subsystem: testing
tags: [vitest, happy-dom, web-storage, node-26, test-harness]

# Dependency graph
requires: []
provides:
  - "vitest.setup.ts — Web Storage parity shim for DOM test environments on Node >= 25"
  - "vitest.config.ts wired to setupFiles; dead environmentMatchGlobs API removed"
  - "packages/frontend/src/__storage-shim.test.ts — SIG-01i inertness proof"
  - "Full suite green on Node 22.23.2, 24.13.0 and 26.7.0 (23 files / 128 tests)"
affects: [01-04, ci-matrix, node-version-upgrades, vitest-5-upgrade]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Root setupFiles module compensating for a runtime/vitest interaction, carrying its own delete-on-upgrade exit condition"
    - "Inertness proof via prototype/constructor discriminator rather than a round-trip both implementations pass"

key-files:
  created:
    - vitest.setup.ts
    - packages/frontend/src/__storage-shim.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "Kept RESEARCH Pattern 2 byte-for-byte in behaviour, including both measured-necessary guard clauses"
  - "Reworded the vitest.config.ts comment to avoid the literal identifier `environmentMatchGlobs`, which the plan's own grep gate requires to be absent"
  - "Evaluated the prototype comparison outside expect() — same predicate, avoids vitest inspecting a native WebIDL prototype"
  - "Left Node's native sessionStorage in place on Node >= 25 (the shim's inertness guard is correct); no product code reads sessionStorage"

patterns-established:
  - "Pattern 1: setupFiles shim gated on `typeof document !== undefined` so node-env files keep exercising the real absent-storage branch"
  - "Pattern 2: discriminator assertions must be proven to fail against the thing they discriminate (verified with a throwaway negative probe)"

requirements-completed: [SIG-01]

# Metrics
duration: 12min
completed: 2026-08-12
---

# Phase 01 Plan 02: Vitest Web Storage Parity Shim Summary

**A `setupFiles` shim that reinstalls Web Storage in happy-dom tests on Node >= 25, turning the ChatView suite from 120/125 back to 125/125 and eliminating the version-dependent branch divergence — plus an inertness test that proves the shim never substitutes a stub for real storage.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Diagnosed and closed the parity half of SIG-01: on Node 26 the DOM tests were silently walking the "no storage" branch, so the matrix was green for different reasons per Node major.
- `vitest.setup.ts` (80 lines) implements RESEARCH Pattern 2 with both measured-necessary guard clauses and a documented delete-on-Vitest-5 exit condition.
- Removed the `environmentMatchGlobs` block — a *removed* (not deprecated) Vitest 4 API that was silently inert.
- SIG-01i proof written and, critically, **verified to have teeth**: a throwaway negative probe confirmed the in-memory fallback violates both discriminator assertions.
- Full suite green on **three** Node majors (22.23.2 / 24.13.0 / 26.7.0), de-risking plan `01-04`'s cross-version gate ahead of schedule.

## Task Commits

1. **Task 1: Create vitest.setup.ts and rewire vitest.config.ts** — `4706558` (test)
2. **Task 2: Prove the shim is inert when storage already works (SIG-01i)** — `8ae1961` (test)

## Files Created/Modified

- `vitest.setup.ts` (created, 80 lines) — Web Storage parity shim. Reinstalls `localStorage`/`sessionStorage` in DOM environments only, using happy-dom's `Storage` when constructible and an in-memory `Map` otherwise.
- `vitest.config.ts` (modified) — `setupFiles: ["./vitest.setup.ts"]` replaces the dead per-glob environment mapping. `plugins`, `resolve.alias` and `frontendPkg` left byte-identical (verified: no removed line matches `alias|plugins|frontendPkg|node_modules/(vue|pinia)`).
- `packages/frontend/src/__storage-shim.test.ts` (created, 63 lines) — happy-dom, zero-mock, single `describe`, 3 tests.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` (Node 26.7.0) | **23 files, 128 tests, 0 failed** |
| `pnpm exec vitest run` (Node 24.13.0) | 23 files, 128 tests, 0 failed |
| `pnpm exec vitest run` (Node 22.23.2) | 23 files, 128 tests, 0 failed |
| `pnpm exec vitest run packages/backend` | 9 files, 47 tests, 0 failed; `Illegal constructor` count = **0** |
| `pnpm exec vitest run …/__storage-shim.test.ts` | 3 tests, 0 failed |
| `grep -c environmentMatchGlobs vitest.config.ts` | `0` |
| `grep -c 'setupFiles: \["./vitest.setup.ts"\]'` | `1` |
| `prettier --check` (all three files) | exit `0` — "All matched files use Prettier code style!" |
| `git status --porcelain` (path-scoped) | clean |

**Baseline before this plan (Node 26.7.0):** 22 files, 125 tests, **5 failed** — all in `ChatView.mount.test.ts`. After: 0 failed.

**Observed `constructor.name` of `globalThis.localStorage`** under local Node 26 happy-dom env: **`"Storage"`**, and it is genuinely happy-dom's (`localStorage instanceof globalThis.Storage === true`; `Object.getPrototypeOf(localStorage) === globalThis.Storage.prototype`).

## Decisions Made

- **Kept both guard clauses exactly as measured.** The `typeof document !== "undefined"` gate and the try/catch around `new Ctor()` are each independently load-bearing; without either, 15 of 22 files fail to collect.
- **Did not migrate to `test.projects`** — would force duplicating `plugins`/`resolve.alias` per project for zero behavioural gain.
- **Did not redesign the shim** to force happy-dom's Storage onto `sessionStorage`. The plan specifies Pattern 2 exactly, and the current behaviour is what the plan's own inertness requirement demands ("never replaces a working Storage").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's own grep gate contradicted the comment RESEARCH prescribed**

- **Found during:** Task 1
- **Issue:** RESEARCH Pattern 2's config snippet comments the change with the literal word `environmentMatchGlobs`. The plan's acceptance criterion and phase verification step 4 both require `grep -c 'environmentMatchGlobs' vitest.config.ts` to return `0`. Writing the snippet verbatim produced `1` — a guaranteed failure of the plan's own gate, which plan `01-04` re-runs read-only.
- **Fix:** Reworded the comment to preserve the full "why" (removed in Vitest 4, not deprecated; silently inert; do not re-add; DOM files select environment via line-1 docblock) without the literal identifier.
- **Files modified:** `vitest.config.ts`
- **Verification:** `grep -c` now returns `0`; `prettier --check` clean.
- **Committed in:** `4706558`

**2. [Rule 1 - Bug] Assertion 3 threw `TypeError: Illegal invocation` as written**

- **Found during:** Task 2
- **Issue:** The plan prescribes `expect(Object.getPrototypeOf(store)).not.toBe(Object.prototype)`. Passing a **native WebIDL prototype** into `expect()` makes vitest inspect the value, which invokes `Storage.prototype`'s `length` getter with the prototype as `this` — a TypeError. This fired on the `sessionStorage` iteration.
- **Fix:** Evaluate the comparison to a boolean *before* handing it to `expect()`: `const isPlainObjectLiteral = Object.getPrototypeOf(store) === Object.prototype; expect(isPlainObjectLiteral).toBe(false);`. The predicate is unchanged — this is an evaluation-order fix, **not** a relaxation.
- **Verification:** Proved the discriminator still has teeth with a throwaway negative probe that builds the exact in-memory fallback shape: it yields `isPlainObjectLiteral: true` and `constructor.name: "Object"`, violating **both** assertions. Probe deleted before commit; working tree verified clean.
- **Committed in:** `8ae1961`

**3. [Rule 3 - Blocking] Worktree had no `node_modules`**

- **Found during:** Task 1 setup
- **Issue:** Fresh worktree; nothing executable, so no verification was possible.
- **Fix:** `pnpm install --frozen-lockfile --offline`. Lockfile-pinned and offline, so no new or unvetted package name could enter — 367 packages resolved, **0 downloaded**, all reused from the local store. This is environment restoration, not a package add.
- **Verification:** `pnpm exec vitest run` executes; `git status` shows `node_modules` correctly gitignored.
- **Committed in:** n/a (no tracked files changed)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking). **Impact:** No scope creep. Deviations 1 and 2 were required to satisfy the plan's own acceptance gates; neither weakens an assertion.

## Issues Encountered

**The one genuine finding — `sessionStorage` identity differs by Node major (documented, not a blocker):**

Measured inside a happy-dom env on Node 26.7.0:

| Global | What it actually is on Node >= 25 | Why |
|---|---|---|
| `localStorage` | **happy-dom's** `Storage` (installed by the shim) | Node's native `localStorage` is inert without `--localstorage-file` (Node emits `ExperimentalWarning`), so `hasUsableStorage()` returns `false` and the shim replaces it. |
| `sessionStorage` | **Node's native** in-memory `Storage` | It is fully usable, so `hasUsableStorage()` returns `true` and the shim deliberately leaves it alone. |

On Node <= 24 both are happy-dom's, since vitest never skips the keys.

This is **not** the failure mode the plan warned about — the shim never fell through to the in-memory fallback (confirmed: both globals have a non-`Object` prototype and `constructor.name === "Storage"`). It is the shim's inertness guard behaving exactly as specified. Impact is nil in practice: **no product code reads `sessionStorage`** (grep over `packages/**` returns only the new test file). Both implementations expose the same Web Storage API and round-trip identically.

Consequence for the phase's parity claim: parity is complete for `localStorage` — the storage the product actually uses, and the one the SIG-01 token guard depends on. A residual, behaviourally-inert implementation difference remains for `sessionStorage`. Recorded here rather than "fixed", because forcing happy-dom's Storage over a working one would contradict the plan's own inertness requirement and threat T-01-06.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ready for plan `01-04`. All three files arrive **Prettier-clean**, so task 3 step F's read-only five-file `--check` will pass without needing to format.
- Cross-version legs SIG-01b (Node 22) and SIG-01c (Node 24) already confirmed green locally with these changes — `01-04` should reproduce, not discover.
- `vitest.setup.ts` carries its own removal instruction; whoever upgrades to Vitest >= 5 should delete it and re-verify `sessionStorage`, which v5 still does not list in `OTHER_KEYS`.
- No blockers.

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
