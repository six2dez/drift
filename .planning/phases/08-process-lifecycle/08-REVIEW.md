---
phase: 08-process-lifecycle
reviewed: 2026-08-31T13:41:18Z
depth: standard
diff_base: c06dabdaf1029b755cef1018524b5ae9488678ec
review_head: 9bd694194527855db1c11d86d628a106426fb95c
files_reviewed: 20
files_reviewed_list:
  - .github/workflows/ci.yml
  - CLAUDE.md
  - packages/backend/src/index.source.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/kill-plan.test.ts
  - packages/backend/src/kill-plan.ts
  - packages/backend/src/kill-tree.posix.test.ts
  - packages/backend/src/kill-tree.win32.gate.test.ts
  - packages/backend/src/kill-tree.win32.test.ts
  - packages/backend/src/mcp-lifecycle.test.ts
  - packages/backend/src/mcp-lifecycle.ts
  - packages/backend/src/mcp-server-spec.spawn.test.ts
  - packages/backend/src/mcp-server-spec.test.ts
  - packages/backend/src/mcp-server-spec.ts
  - packages/backend/src/orphan-reap.posix.test.ts
  - packages/backend/src/platform.test.ts
  - packages/backend/src/platform.ts
  - packages/backend/src/spawn-plan.test.ts
  - packages/backend/src/spawn-plan.ts
  - packages/backend/src/spawn-plan.win32.test.ts
findings:
  critical: 2
  warning: 3
  info: 0
  total: 5
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-31T13:41:18Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The epoch, direct-call-token, FIFO and stale-reaper fixes close the specific defects recorded by the preceding review, but the resulting lifecycle is still not closed around provider startup. A turn can register its token-bearing process after teardown has performed its only process pass, and the new fail-closed COMSPEC exception is thrown outside the cleanup boundaries at every orchestrator call site. Three further test/lifecycle robustness defects remain.

The evidence below deliberately separates portable Node/static results from native-host claims. The focused Node run passed 440 tests with the six `spawn-plan.win32.test.ts` cases skipped on macOS; typecheck and lint passed. No native Windows, Caido QuickJS/LLRT, or real-Caido process result is claimed by this review.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A provider start can escape MCP teardown after its one-shot process pass

**Classification:** BLOCKER
**Files:** `packages/backend/src/index.ts:4189`, `packages/backend/src/index.ts:4254`, `packages/backend/src/index.ts:4320`, `packages/backend/src/index.ts:4789`, `packages/backend/src/index.ts:4849`, `packages/backend/src/index.ts:5327`, `packages/backend/src/index.ts:5402`
**Issue:** The FIFO protects start, stop and refresh, but `sendCliMessage` is outside it. `cleanupMcpRuntime` captures the generation, walks `activeProcesses` exactly once, and then awaits directory removal. A concurrent send has several filesystem/resolution awaits before `spawn`; it can therefore be pending while cleanup's loop sees no process, then call `spawnWithEnv` and `activeProcesses.set` after that loop. Its local `runtimeFiles` remains defined, so `injectedDriftVars` includes `CAIDO_TOKEN`. Cleanup then clears the runtime and reports completion without making another process pass. The provider remains active with the credential and no `stopped` transition from teardown. The argv orphan reaper is not a substitute: it targets MCP-server argv, not the provider itself, and it can also settle before the provider launches its child.

This is a source-demonstrable interleaving, not a Windows inference: `sendCliMessage` contains no `runMcpLifecycleOperation`; cleanup's only `activeProcesses` loop precedes its `await rm`; and the send registers the process only after its preparation awaits.

**Fix:** Introduce a short-lived provider-start lease tied to the captured `{ epoch, tempDir }`. Revalidate the lease immediately before `spawnWithEnv`, and perform `spawnWithEnv` plus `activeProcesses.set` synchronously as one commit. Teardown must prevent new commits, wait for or invalidate pending leases, then do its kill pass. Do not enqueue the whole provider lifetime, because that would block Stop until the turn ends. Make `createSessionRuntimeFiles` accept the captured directory instead of rereading mutable `mcpTempDir`, and add a controllable test that pauses a send before its commit, completes teardown, then proves the send refuses to spawn and removes its staged files.

### CR-02: The COMSPEC fail-closed throw bypasses orchestrator cleanup

**Classification:** BLOCKER
**Files:** `packages/backend/src/spawn-plan.ts:308`, `packages/backend/src/spawn-plan.ts:315`, `packages/backend/src/index.ts:3375`, `packages/backend/src/index.ts:3418`, `packages/backend/src/index.ts:3641`, `packages/backend/src/index.ts:3780`, `packages/backend/src/index.ts:4662`, `packages/backend/src/index.ts:4849`, `packages/backend/src/index.ts:5079`, `packages/backend/src/index.ts:5987`
**Issue:** `buildSpawnPlan` intentionally throws for a Windows `.cmd`/`.bat` when no absolute interpreter is available. The pure test proves this for absent, empty and relative COMSPEC values. This state is reachable when the constrained parent environment has no usable COMSPEC and the probed temp root cannot derive a drive-qualified Windows root (the existing platform tests explicitly include UNC and absent roots). All five production plan constructions occur before any spawn-specific catch. In `sendCliMessage`, per-session files and Claude/Copilot token-bearing config can already have been written before line 5079; the outer catch at lines 5987-5999 reports the error but does not remove them. During start, a throw from provider registration escapes line 4662 after the runtime directory has been staged, leaving `mcpTempDir` set and the RPC rejected instead of executing `cleanupMcpRuntime`. In unregister paths, the same throw can abort teardown before the kill/reap/remove sequence.

Failing closed at the planner is correct; letting that refusal skip the caller's cleanup is not.

**Fix:** Return a typed planning failure or catch the planner exception at each orchestration boundary. Start/send failures must delete every file staged before the plan and restore an absent/error runtime state. Cleanup must record an external-registration-removal failure but continue through process termination, orphan reap and temp-directory removal. Add orchestration-level tests for a `.cmd` provider with `getComspec() === undefined`; the existing pure throw test does not exercise cleanup.

## Warnings

### WR-01: A second Start abandons the current runtime directory and generation

**Classification:** WARNING
**Files:** `packages/backend/src/index.ts:4425`, `packages/backend/src/index.ts:4441`, `packages/backend/src/index.ts:4488`, `packages/backend/src/index.ts:4535`
**Issue:** Serialization makes two Start calls sequential, but not idempotent. `startMcpServerOperation` has no already-running guard inside the FIFO. With directory A active, the second operation advances the epoch, its startup sweep explicitly excludes A because A is still `mcpTempDir`, and it then replaces the sole reference with directory B. A later Stop removes B only. Directory A and its generation are therefore abandoned until another startup sweep or process restart. Concurrent turn startup makes the state split more serious, but the directory/reference leak exists with two successful Start calls alone.

**Fix:** Inside the queued operation, return the existing healthy status when `mcpTempDir` is already active, or run a complete cleanup of the current generation before beginning the replacement generation. Add a two-Start test asserting one live epoch/directory and no abandoned staging root.

### WR-02: Windows test cleanup can signal a recycled PID after proving the fixture dead

**Classification:** WARNING
**File:** `packages/backend/src/kill-tree.win32.test.ts:67`, `packages/backend/src/kill-tree.win32.test.ts:70`, `packages/backend/src/kill-tree.win32.test.ts:197`, `packages/backend/src/kill-tree.win32.test.ts:235`, `packages/backend/src/kill-tree.win32.test.ts:271`
**Issue:** The fixture stores the parent and grandchild as raw numbers in `strayPids`. The successful behavioral test waits for exit and asserts both numbers dead, but `afterEach` still calls `process.kill(pid, "SIGKILL")` for both. Between the death assertion and cleanup, Windows may recycle either PID; cleanup would then terminate an unrelated process on the shared runner. Removing the earlier dead-PID allocator did not remove this same failure mode from the surviving test.

**Fix:** Remove a PID from the cleanup set as soon as the owned fixture is observed exited, retain/close owned process handles where possible, and never force-kill a numeric PID after establishing that the owned process is dead. For a grandchild without an owned handle, use a fixture-specific identity check before signaling or rely on its bounded self-exit in failure cleanup.

### WR-03: The Windows kill-tree gate can stay green after deletion of the behavioral test

**Classification:** WARNING
**Files:** `.github/workflows/ci.yml:275`, `.github/workflows/ci.yml:282`, `.github/workflows/ci.yml:288`, `packages/backend/src/kill-tree.win32.gate.test.ts:55`, `packages/backend/src/kill-tree.win32.test.ts:248`, `packages/backend/src/kill-tree.win32.test.ts:290`
**Issue:** The suite currently has one real tree-termination test and one path-resolution measurement. The CI gate checks only `pending === 0`, `total > 0`, and `passed === total`. Deleting the behavioral test leaves a report with `{ passed: 1, pending: 0, total: 1 }`, which the exact production predicate accepts; the static gate test asserts the same three weak anchors. The gate would therefore announce that the kill-tree suite ran while no process tree was terminated.

**Fix:** Assert the exact expected count (currently two) and, preferably, inspect the JSON assertion results for the full name and pass status of `the plan's argv brings down a real process tree`. Add a mutation case to the static gate test that feeds a one-test report and requires rejection.

## Verification Performed

- Portable Node/static: focused Vitest selection — 440 passed, 6 Windows-only skipped; exit 0.
- Portable Node/static: `pnpm typecheck` — exit 0.
- Portable Node/static: `pnpm lint` — exit 0.
- Mutation: the exact kill-tree gate predicate accepted `{ passed: 1, pending: 0, total: 1 }` — reproduces WR-03.
- Pure planner: the COMSPEC refusal case passed for absent, empty and relative interpreters — establishes the throw used by CR-02.
- Native Windows: not run in this review; Windows-only tests remained skipped locally.
- Native Caido QuickJS/LLRT and real-Caido lifecycle: not run in this review.

---

_Reviewed: 2026-08-31T13:41:18Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
