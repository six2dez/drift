---
phase: 08-process-lifecycle
reviewed: 2026-08-31T13:00:41Z
depth: standard
files_reviewed: 16
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
  - packages/backend/src/mcp-server-spec.spawn.test.ts
  - packages/backend/src/mcp-server-spec.test.ts
  - packages/backend/src/mcp-server-spec.ts
  - packages/backend/src/orphan-reap.posix.test.ts
  - packages/backend/src/platform.test.ts
  - packages/backend/src/platform.ts
  - packages/backend/src/spawn-plan.win32.test.ts
findings:
  critical: 3
  warning: 5
  info: 0
  total: 8
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-08-31T13:00:41Z
**Depth:** standard
**Files Reviewed:** 16
**Diff Base:** `c06dabdaf1029b755cef1018524b5ae9488678ec`
**Status:** issues_found

## Summary

The current Phase 8 source still has three ship-blocking failure classes: an invalid
Windows `COMSPEC` falls through to the bare `cmd.exe` name on a token-bearing
spawn; the asynchronous orphan reaper performs its irreversible kill from a gate that
may have become stale; and start/stop/refresh operations can overwrite a newer MCP
runtime because their module-global state has neither serialization nor a generation
identity. Five additional findings affect PID parsing and freshness, the truthfulness
of the reap diagnostic, Windows-test safety, and the non-vacuity of the Windows CI
gate.

The review was performed against the actual current tree at
`98a5ac3fbca4029075f5cfc2b81fbdca98f6b932`, not the Phase summaries. The explicit
16-file scope exactly matches the non-planning diff from the supplied base. I also
traced the relevant current verification/security records so accepted boundaries were
not recast as defects.

### Evidence boundary

- Static/data-flow evidence proves the findings below from the current source. The
  orchestrator in `index.ts` remains unimportable in Vitest, so green helper tests do
  not execute its lifecycle interleavings.
- The directed local run was green: 410 tests passed and 9 were skipped across the
  Phase 8 suites; `pnpm -r typecheck` and `pnpm lint` also passed. On this macOS
  host, `/usr/bin/pgrep -f -- <pattern>` accepted the planned argv. These are
  Node/macOS/static results, not Caido-LLRT or native-Windows execution.
- No native-Windows suite ran in this review, and no new real-Caido turn was executed.
  The deferred Windows/real-Caido proof recorded by the phase verifier is therefore
  kept separate and is not itself reported as a code defect.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: Rejecting a relative COMSPEC re-enables the bare-name hijack with CAIDO_TOKEN

**Classification:** BLOCKER
**File:** `packages/backend/src/platform.ts:775-821`; `packages/backend/src/index.ts:814-831,4990-4995,5240-5257`; `packages/backend/src/platform.test.ts:1159-1180`

**Issue:** `selectComspec` describes its relative-value arm as fail-closed, but it
returns `undefined` immediately when the first populated `COMSPEC` spelling is not
drive-absolute. Its caller explicitly documents that `undefined` makes
`buildSpawnPlan` use the bare `cmd.exe` name. The provider spawn then executes that
plan with the merged environment containing the live `CAIDO_TOKEN`.

Consequently, an inherited `COMSPEC=cmd.exe`, `.\cmd.exe`,
`system32\cmd.exe`, or `C:cmd.exe` does not refuse the launch and does not use the
already-derived absolute system-root fallback. It selects Windows executable search
order again. A planted `cmd.exe` in an earlier search location executes with the
user's Caido bearer token. The unit test makes the false boundary explicit: it asserts
only that `selectComspec` returns `undefined`; it never composes that answer through
the production spawn plan, where `undefined` means the insecure default.

**Fix:** Make the invalid-present case distinct from the absent case. Prefer a
discriminated result such as `{ kind: "Error", reason: "invalid-comspec" }` and abort
the interpreted provider launch. Alternatively, resolve and require the absolute
`systemRootFallback` after rejecting the environment value; if no absolute fallback
exists, refuse the launch rather than return `undefined`. Add a composed test that
feeds every relative `COMSPEC` shape together with a valid derived root through
`selectComspec` and the spawn-plan boundary, and asserts that the final `file` is
absolute (or that no spawn plan is produced), never `cmd.exe`.

---

#### CR-02: The orphan reaper checks “idle” before an asynchronous scan, then kills without rechecking

**Classification:** BLOCKER
**File:** `packages/backend/src/index.ts:3888-3977,4041-4053,4081-4120,4320-4355,4414-4456`; `packages/backend/src/kill-plan.ts:608-639,903-910`; `packages/backend/src/index.source.test.ts:916-938,974-982`

**Issue:** `reapSessionOrphansIfIdle` snapshots
`activeProcesses.size` and `mcpDirectCallDepth`, checks both once, and starts
`pgrep` fire-and-forget. The `close` callback later parses whatever processes
`pgrep` observed and immediately spawns `kill -KILL`; it never re-evaluates either
idle condition and carries no runtime generation.

A concrete reachable interleaving is: a turn finalizes or the user presses Stop; the
map becomes empty and the scan is issued; the user immediately starts another turn in
the same shared `mcpTempDir`; `pgrep` samples after that child starts; the old scan
then SIGKILLs the new turn's MCP process. The start-up class scan has the same defect:
the `currentSessionDirName` guard is evaluated while `mcpTempDir` is undefined, but
the scan is not awaited; `startMcpServer` can stage a new runtime before its callback
settles, and the class-wide pattern matches that new runtime.

This is the exact T-08-27 “new turn killed” outcome the design says must be prevented.
The source tests prove call placement and the absence of `await`; they do not prove
that the gate remains true when the kill decision is consumed.

**Fix:** Give every runtime an epoch/generation and make reaping a two-stage decision.
For a session scan, re-check immediately before signaling that the same generation is
current, `activeProcesses.size === 0`, and the direct-call guard is empty. For a
previous-run class scan, require that no runtime has been staged since issuance
(`mcpTempDir`/generation still matches the “none” snapshot). If the check changed,
record a `gate-stale` no-op and kill nothing. Add an orchestrator-level test with a
controllable scanner whose close is delayed until after a replacement session/runtime
is registered.

---

#### CR-03: Stale cleanup and direct-call releases can mutate a newer MCP runtime generation

**Classification:** BLOCKER
**File:** `packages/backend/src/index.ts:365-407,4123-4270,4373-4584,4587-4593`; `packages/backend/src/index.source.test.ts:1001-1057`

**Issue:** MCP lifecycle operations share mutable singletons but have no operation
queue, mutex, or epoch. `cleanupMcpRuntime` crosses several awaits, reads the mutable
`mcpTempDir` again for `rm`, and then unconditionally assigns
`mcpTempDir = undefined`. A concurrent `startMcpServer` can therefore assign and
stage a new directory while an older cleanup is suspended; the old cleanup can either
remove the new path (if it observes it after an earlier await) or clear the global
after its old-path `rm` completes. The new start then fails its spec/auth path or
publishes state for a runtime the backend no longer knows exists.

The direct-call counter has the same cross-generation bug. Cleanup resets the scalar
to zero. If an old self-test/auth/registration child later emits its release after a
new generation has acquired depth, `Math.max(0, depth - 1)` consumes the new
generation's slot. The idle reaper can then open while that new direct child is alive.
The exact-count source tests verify spelling and arithmetic, not this interleaving.

**Fix:** Serialize start, stop, and refresh through one lifecycle operation chain and
make every state mutation conditional on an epoch captured at operation entry. Capture
the directory being cleaned and clear the global only when
`mcpTempDir === capturedDir`. Replace the scalar depth with generation-scoped
operation tokens (for example a `Set` of token IDs containing the epoch); a release
may delete only its own token and cleanup may retire an epoch without allowing a late
release to affect the next one. Add delayed-`rm` and delayed-child-release tests that
start a replacement runtime before the stale operation settles.

### Warnings

#### WR-01: Truncated or malformed pgrep output can manufacture an unrelated PID

**Classification:** WARNING
**File:** `packages/backend/src/kill-plan.ts:642-669`; `packages/backend/src/index.ts:3980-3984,4026-4028,4041-4053`; `packages/backend/src/kill-plan.test.ts:684-753`

**Issue:** `parseOrphanScanPids` uses `Number.parseInt` and accepts a numeric
prefix, so `123junk`, `123 456`, and `123.9` all become PID 123. Separately,
`reapMcpOrphans` retains only the bounded output head but ignores
`out.droppedChars`. If the cap cuts a PID line, the surviving digit prefix is parsed
as a different PID and sent to `kill -KILL`. The tests cover a wholly nonnumeric
diagnostic line but not numeric suffixes, unsafe integers, or truncated output.

**Fix:** Treat any truncated enumerator output as `scan-failed` and kill nothing.
Accept only complete ASCII-decimal lines, then require
`Number.isSafeInteger(pid) && pid > 1`. Add cases for numeric suffixes, decimals,
overflow, and a bounded buffer whose final retained line is partial.

---

#### WR-02: A backward wall-clock step makes the “freshness bound” unbounded

**Classification:** WARNING
**File:** `packages/backend/src/kill-plan.ts:785-848`; `packages/backend/src/index.ts:3882-3925`; `packages/backend/src/kill-plan.test.ts:1007-1022`

**Issue:** Scan age is computed with `Date.now()`, but the classifier rejects only
ages above the budget and deliberately treats every negative age as fresh. If the
system clock steps backward while a callback is delayed, an arbitrarily old PID list
has a negative age and remains eligible for SIGKILL. That contradicts the source and
security record's claim that the wall-clock check removes the unbounded stale-PID
window. The unit test currently pins the unsafe policy.

**Fix:** Prefer a monotonic clock if the supported Caido runtime exposes one. Otherwise
treat `scanAgeMs < 0` as `scan-stale`; leaving an orphan for the next sweep is safer
than signaling a PID whose sampling time cannot be bounded. Replace the negative-age
test with the fail-closed expectation.

---

#### WR-03: The diagnostic reports “killed=N” before any killer is known to have started or succeeded

**Classification:** WARNING
**File:** `packages/backend/src/index.ts:3945-3977`; `packages/backend/src/kill-plan.ts:1255-1274,1283-1303`; `packages/backend/src/kill-plan.test.ts:1697-1708`

**Issue:** The loop increments `signalled` immediately after `spawn` returns,
swallows the child's asynchronous `error`, never observes its exit code, and records
the count as `killed`. Node reports ENOENT and many other spawn failures
asynchronously, and a successfully started `kill` can still exit nonzero because the
target disappeared or permission was denied. Therefore
`lastOrphanReap: ... killed=2` proves two spawn attempts returned handles; it does
not prove that two signals were delivered or two processes died. Treating that field as
runtime kill evidence is a false positive.

**Fix:** Rename the immediate field to `attempted` and state that boundary in the
formatter. If confirmed results are required, update a later diagnostic from the
killer's `close` event only when exit code is zero, while preserving the
fire-and-forget RPC contract. Do not emit `killed` without an observed outcome.

---

#### WR-04: The Windows dead-PID measurement can terminate a recycled, unrelated process tree

**Classification:** WARNING
**File:** `packages/backend/src/kill-tree.win32.test.ts:146-159,362-411`

**Issue:** `createDeadPid` waits for a process to exit and returns the now-free
numeric PID. The test then executes `taskkill /pid <that-number> /t /f`. Observing
the original process's close proves that process ended; it does not reserve the PID.
Windows may recycle it before `taskkill` runs, at which point a shared runner's
unrelated process and its descendants are force-terminated. The test's only assertion
is that the command returned a numeric exit code, so it would still pass after doing
that damage.

**Fix:** Remove this non-functional measurement from the shared CI suite; no product
branch consumes the dead-PID exit code. If the datum is still required, run it only in
an isolated disposable Windows environment with an OS-level handle/job that prevents
PID reuse, and assert the target identity rather than reusing a free number.

---

#### WR-05: The win32 gate test does not bind its anchors to the kill-tree step

**Classification:** WARNING
**File:** `packages/backend/src/kill-tree.win32.gate.test.ts:47-95`; `.github/workflows/ci.yml:269-296`

**Issue:** Every assertion searches the entire workflow independently. The unique
step name and report filename prevent wholesale deletion from passing against the
spawn-plan twin, but they do not prove that the kill-tree step invokes the kill-tree
suite, writes its unique report, and validates that same report in one `run` block.
For example, changing only the final Node invocation to read
`$RUNNER_TEMP/win32-report.json` leaves every asserted anchor present. The kill-tree
suite could then be fully skipped while the validator reads the already-green
spawn-plan report, and this guard test would remain green.

**Fix:** Parse the workflow or extract the exact named step, then assert inside that
single step that the command contains the exact suite path, writes
`win32-kill-tree-report.json`, passes the same `$report` to the validator, and
contains all three count checks. Add a mutation-style assertion for cross-reading the
spawn-plan report.

---

_Reviewed: 2026-08-31T13:00:41Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
