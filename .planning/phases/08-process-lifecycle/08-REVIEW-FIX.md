---
phase: 08-process-lifecycle
fixed_at: 2026-08-31T13:28:24Z
review_path: .planning/phases/08-process-lifecycle/08-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-08-31T13:28:24Z
**Source review:** `.planning/phases/08-process-lifecycle/08-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 8
- Fixed: 8
- Skipped: 0
- Atomic fix commits: 8

## Fixed Issues

### CR-01: Rejecting a relative COMSPEC re-enables the bare-name hijack with CAIDO_TOKEN

**Files modified:** `packages/backend/src/platform.ts`, `packages/backend/src/platform.test.ts`, `packages/backend/src/spawn-plan.ts`, `packages/backend/src/spawn-plan.test.ts`, `packages/backend/src/spawn-plan.win32.test.ts`, `packages/backend/src/kill-plan.ts`
**Commit:** `8ff2bef`
**Applied fix:** A relative environment `COMSPEC` is rejected and can recover only through an absolute system-root-derived interpreter. The spawn-plan boundary now independently refuses absent, empty, or relative interpreters for Windows command shims, eliminating the bare `cmd.exe` fallback. Composed tests cover all four relative shapes from selection through the final spawn file.

### CR-02: The orphan reaper checks idle before an asynchronous scan, then kills without rechecking

**Status:** Fixed — requires human/runtime verification of the lifecycle interleaving.
**Files modified:** `packages/backend/src/mcp-lifecycle.ts`, `packages/backend/src/mcp-lifecycle.test.ts`, `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`, `packages/backend/src/kill-plan.ts`, `packages/backend/src/kill-plan.test.ts`
**Commit:** `50f7967`
**Applied fix:** Every asynchronous reap carries an epoch-bound gate for its issuance context (`session-idle`, `runtime-absent`, or `runtime-cleanup`). Immediately before the synchronous signal loop, the orchestrator rechecks the epoch, temp-directory identity, live session count, and generation-scoped direct-call count. A changed or uncertain gate records `gate-stale` and attempts no signal. Delayed-callback tests cover a replacement session, a staged startup runtime, and cleanup followed by replacement.

### CR-03: Stale cleanup and direct-call releases can mutate a newer MCP runtime generation

**Status:** Fixed — requires human/runtime verification of the lifecycle interleaving.
**Files modified:** `packages/backend/src/mcp-lifecycle.ts`, `packages/backend/src/mcp-lifecycle.test.ts`, `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
**Commit:** `b83ba62`
**Applied fix:** Start, stop, and refresh now share a FIFO lifecycle operation chain. Cleanup captures its epoch and directory and may clear only that same generation. The scalar direct-call depth was replaced with exact object-identity tokens scoped to an epoch, so retirement and late release from an old generation cannot consume a new generation's call. Tests exercise delayed cleanup and delayed old-child release before replacement.

### WR-01: Truncated or malformed pgrep output can manufacture an unrelated PID

**Files modified:** `packages/backend/src/kill-plan.ts`, `packages/backend/src/kill-plan.test.ts`, `packages/backend/src/index.ts`
**Commit:** `e905f32`
**Applied fix:** PID parsing now accepts only complete ASCII-decimal lines and safe integers greater than one. Any bounded-buffer truncation fails the scan closed before parsing. Tests cover suffixes, embedded whitespace, decimals, overflow, and a partial final line caused by truncation.

### WR-02: A backward wall-clock step makes the freshness bound unbounded

**Files modified:** `packages/backend/src/kill-plan.ts`, `packages/backend/src/kill-plan.test.ts`
**Commit:** `19bd66d`
**Applied fix:** Negative wall-clock age now classifies the scan as `scan-stale`, preserving the fail-closed behavior when elapsed time cannot be bounded. The previous negative-age acceptance test was replaced with the refusal expectation.

### WR-03: The diagnostic reports killed before any killer is known to have started or succeeded

**Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/kill-plan.ts`, `packages/backend/src/kill-plan.test.ts`
**Commit:** `0c20117`
**Applied fix:** The fire-and-forget result and diagnostic field are now named `attempted`, matching the evidence actually observed when `spawn` returns a handle. No `killed` claim is emitted without an asynchronous outcome.

### WR-04: The Windows dead-PID measurement can terminate a recycled, unrelated process tree

**Files modified:** `packages/backend/src/kill-tree.win32.test.ts`
**Commit:** `e1ac837`
**Applied fix:** Removed the shared-runner test that intentionally freed a PID and then passed the recyclable number to forceful `taskkill /t /f`. The functional live-tree Windows measurements remain; no unrelated recycled PID is targeted.

### WR-05: The Windows gate test can pass by reading steps other than the build-and-test step

**Files modified:** `packages/backend/src/kill-tree.win32.gate.test.ts`
**Commit:** `e5e7dd6`
**Applied fix:** The gate extracts exactly one named Windows build-and-test step and evaluates its runner, command, report generation, and artifact upload within that step only. A mutation test proves that moving the report command to another step turns the gate red.

## Verification

All verification ran in the **main checkout** because `.planning/config.json` sets `workflow.use_worktrees` to `false`.

- `pnpm exec vitest run`: 40 files passed, 2 Windows-only files skipped; 753 tests passed, 8 skipped.
- `pnpm -r typecheck`: exit 0 across shared, backend, and frontend.
- `pnpm lint`: exit 0 with `--max-warnings 0`.
- `pnpm build`: exit 0; backend, frontend, package, and ZIP built successfully.
- CR-02 directed set: 193/193 passed (`mcp-lifecycle`, `index.source`, `kill-plan`).
- `threat-register-gate.sh`: pass (`packages=94`, `support=5`, `register=88+SC`).
- `threat-register-gate.test.sh`: 26/26 cases passed.
- `verdict-gate.sh`: Arms A, B, and C passed.
- `verify-a1-patch.sh`: exit 0; the patch applied at `68199fa`, typechecked, and built 5 files / 2,548,188 bytes plus a 2,549,148-byte ZIP.
- `git diff --check`: exit 0.

These results are Node/macOS, build, and static-source evidence. No native-Windows test or real-Caido/LLRT lifecycle interleaving was executed in this fix pass; the Windows-only Vitest files remained skipped on this host.

Pre-existing user changes in `.planning/PROJECT.md`, `.planning/phases/08-process-lifecycle/08-VERIFICATION.md`, and unrelated untracked planning files were preserved and excluded from every fix commit.

---

_Fixed: 2026-08-31T13:28:24Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
