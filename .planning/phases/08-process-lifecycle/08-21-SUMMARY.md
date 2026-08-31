---
phase: 08-process-lifecycle
plan: 21
subsystem: secure-file-lifecycle
status: complete
tags: [atomic-rename, ownership, token-config, fs-retry, tdd]

requires:
  - "08-20: explicit provider-start retirement and stale-root cleanup"
  - "08-VERIFICATION.md WR-02: partial writes and failed unlinks become ownerless"
provides:
  - "Import-free owned temporary-file state machine with injected I/O"
  - "Atomic 0o600 Claude/Copilot config publication inside the existing retry ladder"
  - "Remove-after-success ownership cleanup shared by finalize and outer finally"
affects:
  - "08-22 MCP runtime artifact validation"
  - "08-23 final Phase 08 security and record convergence"

actuals:
  tokens: 5444
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Own final and staging paths synchronously before any injected filesystem operation"
    - "Delete ownership only after confirmed removal; retain failures for a later cleanup consumer"
    - "Publish credential-bearing documents by same-directory stage-and-rename"

key-files:
  created:
    - "packages/backend/src/owned-temp-file.ts"
    - "packages/backend/src/owned-temp-file.test.ts"
    - ".planning/phases/08-process-lifecycle/08-21-SUMMARY.md"
  modified:
    - "packages/backend/src/index.ts"
    - "packages/backend/src/index.source.test.ts"

key-decisions:
  - "The pure ownership helper imports no runtime API; index.ts injects the already-supported fs/promises write, rename, and remove operations"
  - "Both the final path and unique same-directory staging path are owners before mkdir/write can yield, and only a confirmed removal deletes an owner"
  - "The expandable-value refusal remains before ownership or file creation, and retry diagnostics remain limited to the config label plus scalar attempt/code/delay"
  - "LIF-01 and LIF-02 remain open because portable file-safety proof is not native-Windows execution or real-provider causality"

patterns-established:
  - "Owner-aware retry: every retry re-enters the same atomic state machine while any unconfirmed residue remains visible in the shared set"
  - "Dual cleanup funnel: finalize and outer finally may overlap, but failed paths remain available to the other consumer"

requirements-completed: []

coverage:
  - id: D1
    description: "Atomic owned-file state machine covers complete publication, partial writes, promotion failure, failed unlink retry, and overlapping cleanup"
    requirement: "LIF-02"
    verification:
      - kind: integration
        ref: "packages/backend/src/owned-temp-file.test.ts#owned atomic temporary files (5 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Claude and Copilot use one owner-aware writer and remove-after-success cleanup funnel"
    requirement: "LIF-02"
    verification:
      - kind: integration
        ref: "packages/backend/src/index.source.test.ts (82 tests)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts (57 tests)"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck && pnpm lint"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-08-31
---

# Phase 8 Plan 21: Atomic Owned Provider Config Summary

**Claude and Copilot now publish token-bearing MCP configs atomically, own both possible credential paths before writing, and retain any unlink-failed path for the next cleanup attempt.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-08-31T16:23:09Z
- **Completed:** 2026-08-31T16:26:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added an import-free state machine that owns final/staging paths synchronously, stages content, promotes by rename, and preserves the original failure while retaining every unconfirmed residue.
- Added five real-filesystem/injected-failure tests covering complete JSON bytes, partial staging bytes, promotion failure, EACCES retention with later retry, and overlapping cleanup.
- Routed both provider branches through the same owner-aware `writeChatMcpConfig`, with unique same-directory staging and unconditional `0o700`/`0o600` modes inside the existing bounded retry ladder.
- Replaced eager `Set.clear()` cleanup with remove-after-success semantics; finalize and outer finally now share retryable ownership rather than consuming it speculatively.

## Task Commits

1. **Task 1 RED: define owned config failure contracts** - `8391792` (test)
2. **Task 1 GREEN: preserve ownership through file failures** - `4349fe4` (fix)
3. **Task 2 RED: require owner-aware provider config wiring** - `46da66a` (test)
4. **Task 2 GREEN: atomically own provider configs** - `6e46ebe` (fix)

## Files Created/Modified

- `packages/backend/src/owned-temp-file.ts` - Pure atomic-write and remove-after-success ownership state machine.
- `packages/backend/src/owned-temp-file.test.ts` - Real temp filesystem plus deterministic write/rename/unlink failure coverage.
- `packages/backend/src/index.ts` - Retry-wrapped 0o600 staging, rename promotion, both provider call sites, and shared cleanup adapter.
- `packages/backend/src/index.source.test.ts` - Call-site, mode, retry, guard-order, and no-eager-clear census.

## Verification

| Check | Result |
|---|---|
| Task 1 RED | **EXPECTED RED — 5/5 failed against the typed unimplemented seam, no timeout after harness correction** |
| Task 2 RED | **EXPECTED RED — 2 failed / 142 passed; both missing production wiring assertions** |
| Targeted Vitest | **PASS — 3 files, 144/144 tests** |
| Workspace typecheck | **PASS — shared, backend, frontend** |
| ESLint | **PASS — zero warnings at `--max-warnings 0`** |
| File-mode census | **PASS — 8 writes, exactly 7 with mode and one named plugin-data exemption** |
| Scope/dependency check | **PASS — backend-only; no package manifest or lockfile change** |

## Decisions Made

- The owner set tracks both the final and staging path because either can hold token bytes after an uncertain write or promotion failure.
- A successful rename removes staging ownership but intentionally retains final ownership until process finalization deletes the config.
- Cleanup catches removal failures only inside the pure state machine after leaving the owner intact; the adapter records the existing bounded path label and a value-free `removed`/`retained` status.
- `writeTemp` remains the diagnostics probe writer; credential-bearing provider configs now have their own atomic, owner-aware retry entry point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test harness] Removed a timeout-only RED failure from the overlapping cleanup case**

- **Found during:** Task 1 RED.
- **Issue:** The typed RED seam rejected before invoking the injected removal callback, so a test awaiting only the callback-start signal timed out and left an unhandled rejection.
- **Fix:** Race the callback-start signal against a handled cleanup outcome and always release the held removal in `finally`.
- **Files modified:** `packages/backend/src/owned-temp-file.test.ts`
- **Verification:** The corrected RED collected five tests and failed all five in 9 ms for the intended absent behavior, with no timeout or unhandled error.
- **Committed in:** `8391792`

**2. [Rule 3 - Blocking census] Updated the exact write-mode cardinal after adding the atomic stage writer**

- **Found during:** Task 2 GREEN verification.
- **Issue:** The new 0o600 staging write legitimately raised the `index.ts` `writeFile` census from seven to eight while the historical source test still required seven.
- **Fix:** Require eight total, seven with explicit mode, and the same single positively named plugin-data exemption; update both mutation-direction comments.
- **Files modified:** `packages/backend/src/index.source.test.ts`
- **Verification:** The mode census and all other 143 targeted tests pass.
- **Committed in:** `6e46ebe`

**Total deviations:** 2 auto-fixed (1 test-harness bug, 1 blocking exact census). **Impact:** Both preserve or strengthen falsifiability; neither changes product scope.

## Issues Encountered

None remain. Both issues were deterministic test-contract mismatches exposed before their respective task commits were closed.

## Known Stubs

None. The RED-only throwing seam was fully replaced; the final diff adds no TODO, FIXME, placeholder, “coming soon”, “not available”, skipped test, or mock data path.

## Evidence Boundaries Preserved

- LIF-01 remains unchecked: no native-Windows execution occurred.
- LIF-02 remains unchecked: WR-02 is closed portably, while wider real-provider causality evidence remains open.
- No config content, token, environment value, or matched secret-bearing line enters new diagnostics.
- `PROJECT.md` and the authoritative dirty `08-VERIFICATION.md` were neither staged nor rewritten.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

WR-02 is closed with executable failure directions and production wiring. Plan 08-22 can now make runtime reuse content-aware without relying on the config ownership implementation.

## Self-Check: PASSED

- The summary, both new helper files, and both modified production/source-test files exist.
- Task commits `8391792`, `4349fe4`, `46da66a`, and `6e46ebe` resolve as commits with no tracked-file deletion.
- Coverage classification reports two fully automated deliverables with no schema errors.
- `git diff --check` is clean.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-31*
