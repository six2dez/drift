---
phase: 08-process-lifecycle
reviewed: 2026-09-01T19:41:07Z
depth: standard
supplements: .planning/phases/08-process-lifecycle/08-REVIEW-2.md
diff_base: 415ae7e4704cc23f30dcd9ff959672ed10622ad6
package_review_head: 174c0b6eab9bbc68022d5e2348b76908c0a7a5d7
files_reviewed: 4
files_reviewed_list:
  - packages/backend/src/index.source.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/provider-launch.test.ts
  - packages/backend/src/provider-launch.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: passed
---

# Phase 08: Codex Lifecycle Evidence-Blocker Review

**Reviewed:** 2026-09-01T19:41:07Z
**Depth:** standard, bounded to package commit `174c0b6`
**Status:** passed

## Outcome

No code-review finding remains in the four-file delta from `415ae7e` to `174c0b6`. The changes fix
two blockers discovered by executing Phase 8's remaining real-Caido acquisition: Codex previously
refused Caido's non-repository working directory, and the absolute timeout depended on a timer Caido
can starve while the send RPC awaits its child.

This review does not promote the native Windows requirement or claim that the POSIX group signal or
argv-marker reap directly killed the measured Codex MCP child. Those remain verification boundaries,
not review findings.

## Review Matrix

| Surface | Adversarial question | Evidence | Verdict |
|---|---|---|---|
| Codex argv | Does the fix introduce dynamic shell text, a new path, or provider-wide argument drift? | `--skip-git-repo-check` is one fixed array element inside `buildCodexLaunchArgs`; the focused exact-array test covers the complete invocation and the other provider builders are unchanged | **PASS** |
| Deadline snapshot | Can a later settings mutation silently move a running turn's deadline? | `processDeadlineAt` snapshots the setting once after spawn, matching the native timer's existing per-turn delay semantics | **PASS** |
| Caido wake-up | Does the runtime-stable path actually enforce the same timeout as Node's native timer? | `heartbeat`, already pumped by `getCliSessionState`, compares `Date.now()` with the snapshot; both wake-ups call one `expireTimedOutTurn` | **PASS** |
| Idempotence | Can timer and heartbeat both terminate/finalize one turn? | The shared expiry begins with the existing `settled` guard; `finalize` sets it before asynchronous cleanup and clears the timer/watchdog | **PASS** |
| Credential-file ordering | Can the new heartbeat path delete runtime files before terminating their readers? | The single expiry function calls `killTree` before `finalize`; source wiring asserts that ordering and forbids duplicated kill/finalize bodies in the timer | **PASS** |
| Runtime scheduling | Can `heartbeat` reach the later lexical binding before initialization? | The closure is installed synchronously; interval ticks and frontend RPC pumps can run only after the promise executor completes, by which time `expireTimedOutTurn` and the timer are initialized | **PASS** |
| Cross-platform behavior | Does this bypass the platform kill plan or add a Windows-only primitive? | The expiry reuses `killTree`; platform branching, pid guards, `taskkill`, POSIX group signaling, and orphan-reap plans are unchanged | **PASS** |
| Confidentiality | Is any token, argv, path, prompt, or free-form error newly logged? | The deadline is an internal scalar; no new diagnostic line or environment read was added | **PASS** |

## Executed Evidence

- TDD red: 80 existing source-wiring checks passed and the four new assertions failed on the absent
  shared expiry, heartbeat deadline, and timer routing.
- Focused green: `index.source.test.ts` 84/84; combined with `provider-launch.test.ts`, 95/95.
- Full Vitest: 42 files passed, 2 native-Windows files skipped; 807 passed, 8 skipped.
- Typecheck, lint, production build/ZIP, verdict live/self-test, threat live/self-test/self-scan, the
  independent 32-case threat matrix, and three completion-order harness runs all passed.
- Real Caido: cancellation removed provider and MCP about 210 ms after Stop; the fixed 10-second
  timeout removed both about 10.24 seconds after Send and the UI reported `Process timed out.`

## Residual Boundaries

- The exact two native Windows cases still have no `windows-latest` or real-Windows execution.
- The measured Codex MCP child occupied its own process group. `lastOrphanReap` recorded exit 1/no
  match, so the favorable zero is product-causal but is not evidence that the group signal reached
  the child or that the reap signalled it.
- `LIF-01` and `LIF-02` remain unchecked.

---
_Reviewed: 2026-09-01T19:41:07Z_
_Reviewer: Codex (inline review; no subagent used by session instruction)_
