---
phase: 08-process-lifecycle
fixed_at: 2026-08-31T14:40:39Z
review_path: .planning/phases/08-process-lifecycle/08-REVIEW.md
iteration: 3
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-08-31T14:40:39Z
**Source review:** `.planning/phases/08-process-lifecycle/08-REVIEW.md`
**Iteration:** 3 (final fixer iteration)

**Summary:**

- Findings in scope: 3 warnings
- Fixed: 3
- Skipped: 0
- Atomic fix commits: 4 (WR-01 required a second atomic unit for a newly observed retired-root residual)

## Fixed Issues

### WR-01: A send already in preparation can start after Stop has completed

**Status:** Fixed — requires real-Caido runtime verification of the lifecycle interleaving.
**Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
**Commits:** `8f09a58`, `7f73829`
**Applied fix:** `sendCliMessage` now acquires its epoch/temp-directory preparation identity synchronously before `await dataReady`, and one outer `finally` releases it across every early return and exception. Stop can therefore invalidate a send already waiting in data, project, or command preparation; the later synchronous commit refuses the spawn. The provider lifetime remains outside the lifecycle FIFO.

During implementation, the earlier identity exposed a second bounded interleaving: preparation resumed after Stop could recreate the retired directory before the stale commit was refused. The per-file cleanup now removes that captured root only when it is no longer the current runtime, preventing an abandoned empty staging directory without touching a replacement generation. This residual was reproduced red and closed in `7f73829`; no fourth fixer pass was opened.

### WR-02: Successful Copilot turns retain their token-bearing MCP config until full runtime teardown

**Status:** Fixed.
**Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`
**Commit:** `51155ac`
**Applied fix:** Claude and Copilot now transfer every per-turn token-bearing config path into one provider-neutral ownership set. Both the committed `finalize` funnel (success, asynchronous spawn error, timeout) and the outer abort funnel (planning error, synchronous spawn throw, stale lease) consume that same owner. Consumption clears the set synchronously before the first unlink await, so the second funnel is an idempotent no-op rather than a double unlink. Diagnostics also iterate the provider-neutral owner.

### WR-03: Start reuses an auth-valid runtime without checking that its runtime files exist

**Status:** Fixed — requires real-Caido runtime verification of filesystem behavior.
**Files modified:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`, `packages/backend/src/mcp-lifecycle.ts`, `packages/backend/src/mcp-lifecycle.test.ts`
**Commit:** `b765e3b`
**Applied fix:** The reuse contract no longer accepts one opaque `runtimeHealthy` boolean. It requires auth, a current token, a present directory, the staged `mcp-server.mjs`, and `mcp-context.json`. While still inside the lifecycle FIFO, Start captures the current directory and measures it with the existing `fs/promises` `stat`/`fileExists` boundary; a missing or non-directory root, or a missing/unstatable script or context, fails closed to full replacement cleanup.

## Skipped Issues

None.

## Verification

All verification ran in the **main checkout** because `.planning/config.json` sets `workflow.use_worktrees` to `false`.

- WR-01 red/green: the source-order regression failed with lease acquisition after the first await, then the directed lifecycle/source set passed 90/90. The newly observed retired-root ownership test also failed before `cleanupRetiredProviderStartRoot` existed and passed after the fix.
- WR-02 red/green: the ownership regression failed because neither config entered a common owner; after the fix, all 80 source-orchestration tests passed, with backend typecheck and lint at exit 0.
- WR-03 red/green: three directed tests failed before the explicit artifact contract and in-FIFO inspection; afterward the Start/lifecycle set passed 96/96.
- Final `pnpm exec vitest run`: exit 0; 40 test files passed and 2 Windows-only files skipped; 778 tests passed and 8 skipped out of 786.
- Final `pnpm typecheck`: exit 0 across shared, backend, and frontend.
- Final `pnpm lint`: exit 0 with `--max-warnings 0`.
- Final `pnpm build`: exit 0; backend, frontend, package directory, and ZIP built successfully on macOS.
- `threat-register-gate.test.sh`: exit 0; 26 cases passed.
- `threat-register-gate.sh --self-scan`: exit 0; `packages=94`, `support=5`, `register=88+SC`.
- `threat-register-gate.sh`: exit 0 with the same census.
- `verdict-gate.sh`: exit 0; Arms A, B, and C passed.
- `verify-a1-patch.sh`: exit 0; the patch applied at `68199fa`, typechecked, and built 5 files / 2,548,188 bytes plus a 2,549,148-byte ZIP. Registered worktrees remained 1 before and after, and `packages/` remained clean.
- Final `git diff --check`: exit 0.

The eight skipped tests are the six native `spawn-plan.win32.test.ts` cases and two native `kill-tree.win32.test.ts` cases. No native-Windows behavior or real-Caido QuickJS/LLRT lifecycle interleaving was executed in this fix pass. Windows gates remain portable/static evidence plus synthetic-report validation; native behavior remains owned by `windows-latest` CI or real hardware.

Pre-existing user changes in `.planning/PROJECT.md`, `.planning/phases/08-process-lifecycle/08-VERIFICATION.md`, and unrelated untracked planning files were preserved and excluded from every fix commit. This report is deliberately not committed; the review orchestrator owns it.

---

_Fixed: 2026-08-31T14:40:39Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
