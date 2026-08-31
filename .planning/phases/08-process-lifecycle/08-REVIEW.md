---
phase: 08-process-lifecycle
reviewed: 2026-08-31T14:24:45Z
depth: standard
diff_base: c06dabdaf1029b755cef1018524b5ae9488678ec
review_head: 9eaaa5267298c082661230ce507e5f61067b4601
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
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-08-31T14:24:45Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The iteration-2 fixes close the reported COMSPEC refusal, Windows fixture ownership, and Windows report-gate defects, and the provider lease closes the interleaving it tests. The current integration still leaves three reproducible lifecycle/credential-hygiene gaps: a send can acquire its lease only after Stop has finished, a successful Copilot turn does not delete its token-bearing config, and Start calls an auth-only predicate “runtime healthy” even when its staging directory no longer exists.

Portable Node evidence is green: the full suite passed 772 tests with eight native-Windows tests skipped; typecheck and lint exited 0. Those results do not execute native Windows, Caido QuickJS/LLRT, or a real provider process. The Windows fixture and exact-report gate were therefore reviewed as source/portable-gate evidence only, not claimed as native runtime proof.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: A send already in preparation can start after Stop has completed

**Classification:** WARNING
**Files:** `packages/backend/src/index.ts:4952-5007`, `packages/backend/src/index.ts:5508-5559`, `packages/backend/src/mcp-lifecycle.test.ts:212-258`
**Issue:** `sendCliMessage` awaits `dataReady`, project refresh, and command resolution before it calls `acquireProviderStartLease`. Stop invalidates only leases that already exist, performs its sole `activeProcesses` pass, removes the runtime, and releases the teardown blocker. A send paused in `resolveCommand` is absent from both sets. When it resumes after Stop, it acquires a fresh current lease and its synchronous commit is accepted, so the provider is spawned and tracked after Stop has already returned. With no replacement runtime this path injects no Caido token because `runtimeFiles` is undefined, so this is a lifecycle/cancellation defect rather than the credential-bearing escape reported in iteration 2.

The portable helper reproduction completed teardown before acquisition and printed:

```json
{"stopped":true,"leaseAcquired":true,"result":"committed","spawned":1}
```

The new regression at `mcp-lifecycle.test.ts:213` pauses only *after* acquisition, so it cannot detect this earlier window.

**Fix:** Acquire the preparation lease synchronously at `sendCliMessage` entry, before its first await, and release it through one outer `finally`; teardown can continue clearing it without waiting for the turn. Alternatively capture a monotonically increasing lifecycle-operation revision at entry and require it to remain unchanged at commit. Add a regression that pauses before lease acquisition, completes teardown, resumes the send, and proves that no spawn commits.

### WR-02: Successful Copilot turns retain their token-bearing MCP config until full runtime teardown

**Classification:** WARNING
**File:** `packages/backend/src/index.ts:5122-5133`, `packages/backend/src/index.ts:5817-5827`
**Issue:** The Copilot config is added to `stagedMcpConfigPaths`, but that list is consumed only when provider-start commit fails. On a successful commit, normal `finalize` deletes the activity and approvals files and the separately retained Claude config only. The Copilot path is block-local and is then lost. The file embeds the literal Caido session token (documented at `index.ts:1124-1126`), so every successful Copilot turn extends a credential artifact's lifetime until a later full MCP Stop removes the directory. The directory permissions limit exposure on POSIX, which keeps this at Warning, but the lifetime is inconsistent with the equivalent Claude artifact and with per-turn cleanup.

**Fix:** Retain a provider-neutral list of committed config paths and remove every entry from `finalize` after the child has ended. Keep the uncommitted cleanup using the same ownership list. Add a source or orchestrator regression proving both `mcp-*.json` and `copilot-mcp-*.json` are removed on success, spawn error, timeout, and stale lease.

### WR-03: Start reuses an auth-valid runtime without checking that its runtime files exist

**Classification:** WARNING
**Files:** `packages/backend/src/index.ts:4584-4598`, `packages/backend/src/mcp-lifecycle.ts:62-70`, `packages/backend/src/mcp-lifecycle.test.ts:167-209`
**Issue:** Inside the FIFO, production computes `runtimeHealthy` solely as `mcpAuthState === "valid" && getEffectiveCaidoToken() !== ""`. It does not verify that `mcpTempDir`, `mcp-server.mjs`, or the context file still exists. If the staging directory is removed or becomes unreadable after a successful start, the next Start reports success and reuses the dead generation instead of replacing it. The portable helper confirms that a caller-supplied “healthy” flag returns `reuse` even for a definitely missing path; the production caller is what supplies that incomplete flag:

```text
getMcpStartDisposition({
  tempDir: "/definitely-missing-drift-runtime",
  runtimeHealthy: true
}) -> reuse
```

The two-Start test defines health as `tempDir !== undefined`, so it proves idempotence only for its model and does not exercise production's files.

**Fix:** While still inside the lifecycle FIFO, make the reuse predicate validate the captured directory and its required script/context files with the runtime-compatible filesystem helpers already used by this module. If any check fails, select `replace` and run full cleanup. Add an orchestration-level test for an auth-valid state whose directory or script has disappeared.

## Verification Evidence

- `pnpm exec vitest run`: exit 0; 40 files passed, two Windows-only files skipped; 772 tests passed and eight skipped.
- Focused iteration-2 set: exit 0; 184 tests passed and eight Windows-only tests skipped.
- `pnpm typecheck`: exit 0 across shared, backend, and frontend.
- `pnpm lint`: exit 0 with `--max-warnings 0`.
- Provider-lease helper reproduction: teardown completed, a post-teardown lease was acquired, and its commit spawned once.
- Start-disposition helper reproduction: a missing runtime path with the production-equivalent boolean “healthy” input returned `reuse`.
- Native Windows was not executed locally. The six spawn-plan and two kill-tree native cases were skipped; the strengthened JSON gate and fixture checks are portable/static evidence.
- No real-Caido QuickJS/LLRT lifecycle interleaving or provider launch was executed in this review.

---

_Reviewed: 2026-08-31T14:24:45Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
