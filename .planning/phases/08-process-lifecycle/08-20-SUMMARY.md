---
phase: 08-process-lifecycle
plan: 20
subsystem: process-lifecycle
status: complete
tags: [provider-start, tombstone, lifecycle-identity, stale-cleanup, tdd]

requires:
  - "08-19: current Phase 08 threat register and citation-integrity gate"
  - "08-VERIFICATION.md WR-01: invalidated provider-start root survives an equal installed pointer"
provides:
  - "Exact provider-start retirement tombstones consumed once by the stale sender"
  - "Equal-pointer retired-root removal driven by lifecycle identity instead of pathname inference"
  - "Executable real-filesystem interleaving and source-wiring regression controls"
affects:
  - "08-21 token-bearing config ownership"
  - "08-22 MCP runtime artifact validation"
  - "08-23 final Phase 08 security and record convergence"

actuals:
  tokens: 2773
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Exact-object tombstones cross an await boundary without weakening into path equality"
    - "Pure lifecycle helpers decide ownership; index.ts injects best-effort filesystem effects"

key-files:
  created:
    - ".planning/phases/08-process-lifecycle/08-20-SUMMARY.md"
  modified:
    - "packages/backend/src/mcp-lifecycle.ts"
    - "packages/backend/src/mcp-lifecycle.test.ts"
    - "packages/backend/src/index.ts"
    - "packages/backend/src/index.source.test.ts"

key-decisions:
  - "A teardown retires the exact ProviderStartLease object before clearing active starts; only that object can authorize stale-root cleanup and only once"
  - "Path equality remains a valid synchronous commit guard but is never a retirement classifier or retired-root cleanup veto"
  - "LIF-01 and LIF-02 remain open because this portable repair adds neither native-Windows execution nor real-provider causality evidence"

patterns-established:
  - "Retirement fact before I/O: releaseProviderStartLease returns a one-shot boolean which the index adapter preserves across cleanup awaits"
  - "Wrong-generation safety: equal-looking lease objects and current committed leases cannot consume another lease's tombstone"

requirements-completed: []

coverage:
  - id: D1
    description: "Exact one-shot provider-start retirement identity and equal-pointer real-filesystem cleanup"
    requirement: "LIF-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-lifecycle.test.ts#provider start lease (19 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Production send cleanup consumes explicit retirement and contains no path-equality retirement guard"
    requirement: "LIF-02"
    verification:
      - kind: integration
        ref: "packages/backend/src/index.source.test.ts#index.ts lifecycle wiring (81 tests)"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck && pnpm lint"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-08-31
---

# Phase 8 Plan 20: Explicit Retired Provider-Start Identity Summary

**Provider teardown now leaves an exact, one-shot lease tombstone that removes a stale sender's recreated runtime root even while the installed pointer has the same path.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-31T16:15:32Z
- **Completed:** 2026-08-31T16:18:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `retiredProviderStarts` and moved every pending exact lease into it before teardown clears the active-start set or performs its process pass.
- Made lease release return a one-shot retirement result; an equal-looking object, a second release, and a committed current lease all return false.
- Replaced `index.ts`'s equal-path early return with the pure lifecycle decision plus an injected, recursive, best-effort root removal.
- Executed the verifier's full interleaving against a real temporary root: invalidate, recreate, keep the simulated installed pointer equal, remove, finish teardown, and observe `ENOENT`.

## Task Commits

1. **Task 1 RED: expose retired provider-start gap** - `0a8c052` (test)
2. **Task 1 GREEN: track retired provider starts by identity** - `2b84b69` (fix)
3. **Task 2 RED: require retired identity in send cleanup** - `3a92f31` (test)
4. **Task 2 GREEN: remove retired roots by lease identity** - `1b0746d` (fix)

## Files Created/Modified

- `packages/backend/src/mcp-lifecycle.ts` - Exact retirement set, one-shot consumption, and injected cleanup helper.
- `packages/backend/src/mcp-lifecycle.test.ts` - Identity, nested teardown, current-lease, and real-filesystem interleaving cases.
- `packages/backend/src/index.ts` - Production adapter captures retirement before cleanup awaits and injects recursive removal.
- `packages/backend/src/index.source.test.ts` - Non-vacuous call census and old equality-guard rejection.

## Verification

| Check | Result |
|---|---|
| Task 1 RED | **EXPECTED RED — 4 failed / 15 passed; missing retirement result/helper only** |
| Task 2 RED | **EXPECTED RED — 1 failed / 99 passed; missing production retirement acquisition only** |
| Targeted Vitest | **PASS — 2 files, 100/100 tests** |
| Workspace typecheck | **PASS — shared, backend, frontend** |
| ESLint | **PASS — zero warnings at `--max-warnings 0`** |
| Wiring census | **PASS — one retirement acquisition, one retired-root call, zero former equality guards** |
| Scope check | **PASS — no frontend/shared package file and no requirement checkbox changed** |

## Decisions Made

- Retired state is keyed by the immutable `ProviderStartLease` object, not by a reusable pathname or numeric ID alone.
- The tombstone is deliberately retained until the stale sender reaches its `finally`; nested teardown cannot clear it accidentally.
- The pure helper propagates removal failures to its I/O owner, while `index.ts` keeps the existing best-effort cleanup policy at the adapter boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Anchored cleanup ordering to the outer `finally` consumer**

- **Found during:** Task 2 GREEN verification.
- **Issue:** The new source test used the first `cleanupOwnedMcpConfigPaths` occurrence in `sendCliMessage`, which is the earlier `finalize` consumer, then compared it with the later retirement acquisition in `finally`.
- **Fix:** Search for the config cleanup starting at the exact retirement-result offset, so the assertion measures the intended outer cleanup path.
- **Files modified:** `packages/backend/src/index.source.test.ts`
- **Verification:** The same two-file suite changed from 1 failed / 99 passed to 100/100 passed without weakening any production assertion.
- **Committed in:** `1b0746d`

**Total deviations:** 1 auto-fixed (Rule 1 test bug). **Impact:** The test now measures the intended call site; production scope and behavior are unchanged.

## Issues Encountered

None remain. The sole GREEN failure was the source test selecting the wrong one of two legitimate cleanup consumers; systematic tracing identified and corrected the matcher. During close-out, `state.advance-plan` misparsed the project's customized “19 of 23 complete” position as plan 1; the live 20-summary count remained correct and the derived position was corrected to “20 of 23 complete; next 08-21”.

## Known Stubs

None. No added line contains TODO, FIXME, placeholder, “coming soon”, or “not available”, and no test was skipped.

## Evidence Boundaries Preserved

- LIF-01 remains unchecked: no native-Windows test ran.
- LIF-02 remains unchecked: WR-01 is repaired portably, but native provider teardown causality and the wider Phase 08 runtime evidence boundary remain open.
- No recycled PID is restored, signaled, or used as evidence.
- `PROJECT.md` and the authoritative dirty `08-VERIFICATION.md` were neither staged nor rewritten.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

WR-01 is closed in the lifecycle model and production wiring. Plan 08-21 can now harden token-bearing per-turn config ownership without sharing or re-deriving provider-start identity.

## Self-Check: PASSED

- The summary and all four task-owned package files exist.
- Task commits `0a8c052`, `2b84b69`, `3a92f31`, and `1b0746d` resolve as commits with no tracked-file deletion.
- Coverage classification reports two fully automated deliverables with no schema errors.
- `git diff --check` is clean.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-31*
