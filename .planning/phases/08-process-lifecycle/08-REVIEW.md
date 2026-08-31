---
phase: 08-process-lifecycle
reviewed: 2026-08-31T14:48:23Z
depth: standard
diff_base: c06dabdaf1029b755cef1018524b5ae9488678ec
review_head: 1a1818ff5d4e74a430ab4de942b140980d6e9e0a
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

# Phase 08: Final Code Review Report

**Reviewed:** 2026-08-31T14:48:23Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The iteration-3 fix does acquire the provider preparation identity before the first await, and no regression was demonstrated in the typed plan-refusal path or the strengthened Windows fixture/report gate. Final convergence nevertheless stops with three warnings. The retired-root helper still confuses a live pointer with a live lease, config ownership does not survive write/unlink failures, and Start's filesystem health check treats any existing object as a usable script or context file.

Portable Node evidence is green: 778 tests passed and the eight native-Windows tests were skipped; typecheck and lint exited 0. The filesystem and lifecycle models below are portable/static evidence. This review did not execute native Windows, real-Caido QuickJS/LLRT, or a real provider launch.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Retired-root cleanup skips an invalidated generation while its pointer is still installed

**Classification:** WARNING

**Files:** `packages/backend/src/index.ts:1633-1640`, `packages/backend/src/index.ts:4514-4529`, `packages/backend/src/index.ts:6274-6283`, `packages/backend/src/mcp-lifecycle.ts:206-214`, `packages/backend/src/index.source.test.ts:1236-1248`

**Issue:** `runMcpProviderTeardown` invalidates the lease immediately by clearing `providerStarts`, but `mcpTempDir` continues to equal the captured directory until teardown reaches its final clear. `cleanupRetiredProviderStartRoot` receives neither the lease nor its epoch/retirement state; it returns solely because `currentTempDir === leaseTempDir`. Therefore an invalidated send that reaches its finalizer while the old pointer is still installed does not remove a root that exists or was recreated by its paused preparation. Clearing the pointer later does not schedule another send-side cleanup. The source test asserts this equality guard rather than exercising the invalidated-lease state.

The portable state model using the production guard produced:

```json
{"leaseWasInvalidated":true,"pointerAtCleanup":"same","retiredRootSurvived":true}
```

This is a generation-ownership defect. The exact callback ordering that recreates the root after teardown's main unlink remains unexecuted in Caido/LLRT; the fix report itself identifies that recreation as the residual this helper is meant to close.

**Fix:** Carry an explicit retired-generation/tombstone state instead of inferring ownership from path equality. A stale send should clean its captured root only after the teardown kill/reap boundary, even if the global pointer has not yet been cleared. Add an executable interleaving test that invalidates the lease, recreates the captured root, runs stale-send cleanup while the pointer still equals that root, completes teardown, and proves the root is absent.

### WR-02: Token-config ownership starts too late and is discarded before unlink succeeds

**Classification:** WARNING

**Files:** `packages/backend/src/index.ts:1151-1175`, `packages/backend/src/index.ts:1613-1625`, `packages/backend/src/index.ts:5143-5154`, `packages/backend/src/index.ts:5196-5207`, `packages/backend/src/index.source.test.ts:1251-1283`

**Issue:** Both provider branches add a config path to `ownedMcpConfigPaths` only after `writeChatMcpConfig` resolves. Yet `writeTemp` explicitly acknowledges that an exhausted write can leave a half-written file before it throws. That file can contain the literal Caido token but never enters the owner. For paths that do enter the set, `cleanupOwnedMcpConfigPaths` clears the entire set before attempting `rm`, catches every unlink failure, and retains no failed path for the outer cleanup funnel to retry. The source regression deliberately requires `clear` before `rm`, so it locks in the ownership loss rather than testing deletion.

A portable filesystem model made the config directory non-writable and ran the same clear-before-unlink algorithm. It produced:

```json
{"unlinkResult":"EACCES","owners":0,"configSurvived":true}
```

The artifact remains protected by the runtime directory permissions and is removed by a later successful full Stop, so this is Warning rather than a cross-user credential disclosure.

**Fix:** Establish ownership from the computed path before the first write, preferably write through an owned temporary path and atomically rename it. During cleanup, remove a path from the set only after confirmed deletion; retry transient failures and record permanent ones. `rm(..., { force: true })` is already idempotent, so a second funnel does not require throwing ownership away first. Replace the source-order assertion with injected write/unlink failures that prove no token-bearing artifact survives.

### WR-03: Runtime reuse accepts directories or unreadable objects as the required files

**Classification:** WARNING

**Files:** `packages/backend/src/index.ts:1062-1064`, `packages/backend/src/index.ts:1202-1229`, `packages/backend/src/index.ts:4651-4660`, `packages/backend/src/index.source.test.ts:254-273`

**Issue:** The root is checked with `stat(...).isDirectory()`, but the script and context checks use `fileExists`, which returns true after any successful `stat`. A directory, unreadable file, or otherwise unusable filesystem object at `mcp-server.mjs` or `mcp-context.json` therefore satisfies every boolean passed to `getMcpStartDisposition`. Start returns the current status as a successful reuse even though Node cannot execute the script object or the MCP server cannot read the context as a file.

The portable filesystem reproduction created directories at both required file paths:

```json
{
  "scriptPresent": true,
  "contextPresent": true,
  "scriptIsFile": false,
  "contextIsFile": false,
  "scriptRead": "EISDIR"
}
```

The new source test checks only that `fileExists` is called twice, so this false-positive health result remains green.

**Fix:** Probe each required artifact with `stat().isFile()` and a readable-file check; validate that the context can be read and parsed before declaring the generation reusable. Fail closed to `replace` on type, access, or parse failure. Add real temporary-filesystem tests for directories, unreadable files, and malformed context content rather than source-text assertions alone.

## Verification Evidence

- `pnpm exec vitest run`: exit 0; 40 test files passed, two native-Windows files skipped; 778 tests passed and eight skipped.
- `pnpm typecheck`: exit 0 across shared, backend, and frontend.
- `pnpm lint`: exit 0 with `--max-warnings 0`.
- Portable retired-root state model: an invalidated lease plus an equal installed pointer skipped cleanup and left the root present.
- Portable unlink-failure model: `EACCES` left the config present after its owner set had been cleared.
- Portable artifact-type reproduction: both required paths passed the current existence predicate while being directories; reading the script path failed with `EISDIR`.
- Native Windows was not executed locally. The six spawn-plan and two kill-tree native cases remained skipped; their gates provide portable/static evidence only.
- No real-Caido QuickJS/LLRT lifecycle interleaving or provider process was executed.

---

_Reviewed: 2026-08-31T14:48:23Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
