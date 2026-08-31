---
phase: 08-process-lifecycle
fixed_at: 2026-08-31T14:15:19Z
review_path: .planning/phases/08-process-lifecycle/08-REVIEW.md
iteration: 2
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-08-31T14:15:19Z
**Source review:** `.planning/phases/08-process-lifecycle/08-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 5
- Fixed: 5
- Skipped: 0
- Atomic fix commits: 5

## Fixed Issues

### CR-01: A provider start can escape MCP teardown after its one-shot process pass

**Status:** Fixed — requires human/runtime verification of the lifecycle interleaving.
**Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`, `packages/backend/src/mcp-lifecycle.ts`, `packages/backend/src/mcp-lifecycle.test.ts`
**Commit:** `4e170a7`
**Applied fix:** Added short provider-start leases bound to the captured MCP epoch and temp directory. Teardown invalidates pending leases before its process pass; immediately before launch, a send revalidates its lease and commits `spawnWithEnv` plus `activeProcesses.set` synchronously. Session files and provider configuration are built against the captured directory and are removed when preparation fails or the lease becomes stale. The provider lifetime is not placed on the lifecycle FIFO.

### CR-02: The COMSPEC fail-closed throw bypasses orchestrator cleanup

**Status:** Fixed — requires human/runtime verification of every orchestration boundary.
**Files modified:** `packages/backend/src/spawn-plan.ts`, `packages/backend/src/spawn-plan.test.ts`, `packages/backend/src/mcp-server-spec.ts`, `packages/backend/src/mcp-server-spec.test.ts`, `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
**Commit:** `8b6b00a`
**Applied fix:** Added a typed spawn-planning result while retaining the pure planner's fail-closed throw. Start and refresh propagate registration refusals into full runtime cleanup; send removes every staged session/config/debug file; unregister and sweep record `MCP_REMOVE_PLAN_REFUSED` but continue through termination, reap, and directory cleanup. Refusals are diagnosed as `plan=refused` without inventing an exit code.

### WR-01: A second Start abandons the current runtime directory and generation

**Status:** Fixed — requires human/runtime verification of lifecycle reuse/replacement behavior.
**Files modified:** `packages/backend/src/mcp-lifecycle.ts`, `packages/backend/src/mcp-lifecycle.test.ts`, `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
**Commit:** `a77a42c`
**Applied fix:** Added an explicit `start`, `reuse`, or `replace` disposition inside the lifecycle FIFO. A healthy active runtime returns its current status without advancing the epoch; an unhealthy active runtime receives complete cleanup before replacement. The two-Start model asserts a single live epoch and staging root.

### WR-02: Windows test cleanup can signal a recycled PID after proving the fixture dead

**Status:** Fixed.
**Files modified:** `packages/backend/src/kill-tree.win32.test.ts`, `packages/backend/src/kill-tree.win32.gate.test.ts`
**Commit:** `917a3f8`
**Applied fix:** Cleanup now retains owned parent process handles, removes them as soon as their exit event is observed, and never force-signals a numeric PID already established dead. The unowned grandchild relies on its bounded self-exit instead of a raw PID signal. The portable gate prohibits reintroducing raw `process.kill(..., "SIGKILL")` cleanup.

### WR-03: The Windows kill-tree gate can stay green after deletion of the behavioral test

**Status:** Fixed.
**Files modified:** `.github/workflows/ci.yml`, `packages/backend/src/kill-tree.win32.gate.test.ts`
**Commit:** `72dad7c`
**Applied fix:** The Windows CI predicate now requires exactly two passed assertions, zero pending assertions, and the exact passed behavioral assertion named `the plan's argv brings down a real process tree`. Portable mutation tests prove that a one-test report and a report lacking that behavioral identity are rejected, while the exact two-test report is accepted.

## Skipped Issues

None.

## Verification

All verification ran in the **main checkout** because `.planning/config.json` sets `workflow.use_worktrees` to `false`.

- Red/green regression checks were captured before each fix: CR-01 reproduced four failures then passed its 82-test directed set; CR-02 reproduced eight failures then passed 165 directed tests; WR-01 reproduced four failures then passed 90 directed tests; WR-02 and WR-03 each reproduced their unsafe/weak gate condition before their focused portable gates passed.
- `pnpm exec vitest run`: exit 0; 40 files passed and 2 Windows-only files skipped; 772 tests passed and 8 skipped out of 780.
- `pnpm typecheck`: exit 0 across shared, backend, and frontend.
- `pnpm lint`: exit 0 with `--max-warnings 0`.
- `pnpm build`: exit 0; backend, frontend, package directory, and ZIP built successfully on macOS.
- `threat-register-gate.test.sh`: exit 0; 26 cases passed.
- `threat-register-gate.sh --self-scan`: exit 0; `packages=94`, `support=5`, `register=88+SC`.
- `threat-register-gate.sh`: exit 0 with the same census.
- `verdict-gate.sh`: exit 0; Arms A, B, and C passed.
- `verify-a1-patch.sh`: exit 0; the patch applied at `68199fa`, typechecked, and built 5 files / 2,548,188 bytes plus a 2,549,148-byte ZIP. Registered worktrees remained 1 before and after, and `packages/` remained clean.
- `git diff --check`: exit 0.

The full suite's eight skips are six `spawn-plan.win32.test.ts` cases and two `kill-tree.win32.test.ts` cases. No native-Windows behavior or real-Caido QuickJS/LLRT lifecycle interleaving was executed in this fix pass. The strengthened Windows gate is portable/static and synthetic-report evidence; native behavior remains owned by `windows-latest` CI or real hardware.

Pre-existing user changes in `.planning/PROJECT.md`, `.planning/phases/08-process-lifecycle/08-VERIFICATION.md`, and unrelated untracked planning files were preserved and excluded from every fix commit. This report is deliberately not committed; the review orchestrator owns it.

---

_Fixed: 2026-08-31T14:15:19Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
