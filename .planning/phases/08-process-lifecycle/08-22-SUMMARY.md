---
phase: 08-process-lifecycle
plan: 22
subsystem: runtime-health
status: complete
tags: [mcp, filesystem, fail-closed, json, tdd]

requires:
  - "08-21: atomic ownership of token-bearing provider configs"
  - "08-VERIFICATION.md WR-03: existence-only runtime reuse accepts unusable artifacts"
provides:
  - "Import-free MCP runtime artifact validator with injected filesystem I/O"
  - "Readable regular-file and parseable object-context requirements before Start reuse"
  - "Real-filesystem and injected-error coverage for every WR-03 unhealthy class"
affects:
  - "08-23 final Phase 08 security and record convergence"

actuals:
  tokens: 3961
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Validate staged runtime artifacts by type and attempted read, never by existence alone"
    - "Inject constrained filesystem operations into an import-free QuickJS-safe decision helper"

key-files:
  created:
    - "packages/backend/src/mcp-runtime-artifacts.ts"
    - "packages/backend/src/mcp-runtime-artifacts.test.ts"
    - ".planning/phases/08-process-lifecycle/08-22-SUMMARY.md"
  modified:
    - "packages/backend/src/index.ts"
    - "packages/backend/src/index.source.test.ts"

key-decisions:
  - "Runtime script health means a regular file that can be opened and closed for reading; Drift never executes or imports it during inspection"
  - "Runtime context health means a readable regular file whose bytes parse as a non-null, non-array JSON object"
  - "Every stat, open, close, read, or parse failure returns an explicit false field so the existing disposition selects replacement"
  - "LIF-01 and LIF-02 remain open because portable artifact validation is not native-Windows execution or real-provider causality"

patterns-established:
  - "Content-aware reuse gate: filesystem object type plus actual readability precede lifecycle disposition"
  - "Value-free failure boundary: artifact inspection catches failures without logging context bytes, tokens, errors, or paths"

requirements-completed: []

coverage:
  - id: D1
    description: "Required runtime artifacts are classified by directory/file type, readability, and object-context parsing"
    requirement: "LIF-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-runtime-artifacts.test.ts#required MCP runtime artifact validation (12 cases) and real unreadable artifact (1 case)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-lifecycle.test.ts#MCP start disposition"
        status: pass
    human_judgment: false
  - id: D2
    description: "Start feeds strict artifact health into getMcpStartDisposition before any reuse return"
    requirement: "LIF-02"
    verification:
      - kind: integration
        ref: "packages/backend/src/index.source.test.ts#index.ts makes Start idempotent inside the lifecycle FIFO"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck && pnpm lint"
        status: pass
    human_judgment: false

duration: 4 min
completed: 2026-08-31
---

# Phase 8 Plan 22: Content-Aware Runtime Health Summary

**MCP Start now reuses a staged runtime only when its root, server script, and parsed context are usable filesystem artifacts rather than merely existing paths.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-31T16:31:36Z
- **Completed:** 2026-08-31T16:35:16Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added an import-free validator that fails closed on missing, incorrectly typed, unreadable, uncloseable, or malformed runtime artifacts without exposing bytes or paths.
- Added thirteen executed cases covering healthy real files, directories at file paths, missing files, malformed/non-object JSON, deterministic EACCES failures, non-regular objects, absent runtime state, and a real POSIX unreadable file.
- Replaced Start's two `fileExists` reuse inputs with the stricter stat/open/read adapter while preserving inspection-before-disposition-before-reuse ordering and the existing replacement path.

## Task Commits

1. **Task 1 RED: define content-aware runtime health** - `9753b1c` (test)
2. **Task 1 GREEN: validate runtime artifact content** - `de4bc3c` (fix)
3. **Task 2 RED: require strict runtime inspection wiring** - `2aa931f` (test)
4. **Task 2 GREEN: feed strict runtime health into Start** - `12a7136` (fix)

## Files Created/Modified

- `packages/backend/src/mcp-runtime-artifacts.ts` - Pure typed/readable/parseable artifact inspection boundary.
- `packages/backend/src/mcp-runtime-artifacts.test.ts` - Real temporary-filesystem matrix plus deterministic injected failures.
- `packages/backend/src/index.ts` - QuickJS-supported stat/open/read adapter and pre-disposition Start wiring.
- `packages/backend/src/index.source.test.ts` - Static gate rejecting `fileExists`-only reuse health and preserving call ordering.

## Validation Evidence

| Check | Result |
|---|---|
| Task 1 RED | **EXPECTED RED — 13/13 new cases failed only at the typed unimplemented seam; 19 lifecycle tests passed** |
| Task 2 RED | **EXPECTED RED — 1 new wiring assertion failed; 81 existing source assertions passed** |
| Targeted Vitest | **PASS — 3 files, 114/114 tests** |
| Workspace typecheck | **PASS — shared, backend, frontend** |
| ESLint | **PASS — zero warnings at `--max-warnings 0`** |
| Scope/dependency check | **PASS — backend-only; no package manifest or lockfile change** |

## Decisions Made

- Opening the server script for read and closing its handle proves the access Drift needs without executing untrusted staged code.
- Parsing only to a non-null, non-array object is the narrow reuse predicate; deeper schema ownership stays with the existing runtime-context serializer/parser and no QuickJS-hostile validator dependency is added.
- The helper returns three independent booleans and never throws, allowing the existing `getMcpStartDisposition` truth table to remain the single replacement decision.
- The root adapter uses only `stat`, `openFile`, and `readFile`, which are already imported and exercised in the Caido backend boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Scope hygiene] Removed an unintended whole-file Prettier rewrite**

- **Found during:** Task 2 GREEN diff audit.
- **Issue:** Directly formatting `index.ts` and its source test rewrote more than a thousand unrelated legacy-format lines because the repository intentionally postpones its whole-tree format migration until after Phase 8.
- **Fix:** Reversed only the uncommitted formatter changes with file patches, reapplied the 45-line functional diff, and did not run an auto-formatter over the legacy files again.
- **Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
- **Verification:** Final diff is limited to 14 insertions/31 deletions in `index.ts`; the source test has no uncommitted formatting diff, and the full plan gate remains green.
- **Committed in:** `12a7136` contains only the intended production wiring.

**Total deviations:** 1 auto-fixed scope-hygiene issue. **Impact:** No product behavior or planned artifact changed; unrelated formatting was excluded before commit.

## Issues Encountered

None remain. Both TDD failures matched their missing contracts, and the formatting deviation was removed before the production commit.

## Known Stubs

None. The RED-only throwing seam was replaced, and no TODO, placeholder, skipped platform substitute, or mock production path remains.

## Evidence Boundaries Preserved

- LIF-01 remains unchecked: no native-Windows execution occurred.
- LIF-02 remains unchecked: WR-03 is closed portably, while wider real-provider causality evidence remains open.
- Artifact contents, tokens, filesystem error text, and sensitive absolute paths do not enter the validator or its diagnostics.
- `PROJECT.md` and the authoritative dirty `08-VERIFICATION.md` were neither staged nor rewritten.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

WR-03 is closed with executable failure directions and production wiring. Plan 08-23 can now converge the living requirements/Windows records and audit T-08-01 through T-08-94 against the final package head.

## Self-Check: PASSED

- The summary, both new helper files, and both modified production/source-test files exist.
- Task commits `9753b1c`, `de4bc3c`, `2aa931f`, and `12a7136` resolve as commits with no tracked-file deletion.
- Coverage classifies both shipped deliverables as fully automated with passing evidence.
- `git diff --check` is clean.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-31*
