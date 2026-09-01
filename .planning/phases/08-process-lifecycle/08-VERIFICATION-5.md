---
phase: 08-process-lifecycle
verified: 2026-09-01T19:41:07Z
status: human_needed
score: 18/20 must-haves verified
behavior_unverified: 2
behavior_unverified_items:
  - truth: "SC-1: absolute-path taskkill terminates the Windows provider tree"
    test: "Execute the exact two-case native kill-tree suite on windows-latest or real Windows"
    expected: "2 executed, 0 pending, 0 failed; both parent and grandchild are dead"
    why_human: "The local macOS run skips both native Windows cases"
  - truth: "SC-3: cancel and timeout leave zero provider/MCP processes on both platforms"
    test: "Combine the now-recorded POSIX cancel/timeout run with the exact native Windows run"
    expected: "Zero tracked provider and token-bearing MCP survivors after cancel and timeout on both platforms"
    why_human: "The POSIX half is measured; the Windows half is still unrun"
supersedes_current_conclusions_of:
  - .planning/phases/08-process-lifecycle/08-VERIFICATION.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-2.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-4.md
package_head: 174c0b6eab9bbc68022d5e2348b76908c0a7a5d7
security_audit_head: 174c0b6eab9bbc68022d5e2348b76908c0a7a5d7
actionable_gaps: []
human_evidence_remaining:
  - "SC-1 and the Windows half of SC-3: execute the exact two-case native suite on windows-latest or real Windows."
---

# Phase 8: Process Lifecycle — Real-Caido Codex Verification

**Phase Goal:** Make cancel/timeout actually stop work on both platforms so no orphaned
token-bearing process survives a turn.

**Status:** `human_needed`

## Verdict

The remaining POSIX acquisition is now executed against a Drift-spawned Codex CLI turn in real
Caido. From a clean global MCP baseline, cancellation removed the provider and its token-bearing MCP
child about 210 ms after the Drift Stop action. A separate fixed 10-second timeout run removed both
about 10.24 seconds after Send, the UI reported `Process timed out.`, and the requested 60-second
completion marker never appeared. `activeSessions` and the global MCP count were both zero after
each path.

The acquisition exposed two code defects before it could become valid evidence. Codex refused
Caido's non-repository working directory without `--skip-git-repo-check`. After that fix, the first
timeout control demonstrated that Caido starved the native timer: a configured 10-second turn
completed `sleep 60` naturally. Commit `174c0b6` fixes both blockers with TDD. The timeout now has a
per-turn absolute deadline enforced by the frontend-pumped heartbeat and the native timer through
one kill-before-finalize function. The repeated real-Caido run then timed out at the configured
boundary.

The causal claim is deliberately bounded. Codex's MCP child had its own process group, so the
provider group signal could not directly reach it. `lastOrphanReap` recorded the current exit-1
no-match spelling, not a signalled survivor. The measurements therefore prove the user-visible
Drift action/deadline caused the zero-survivor result on this provider; they do not prove whether
Codex cleanup or a particular Drift fallback removed the MCP child. That distinction keeps the
mechanism-specific `LIF-02` wording unchecked.

Phase 8 advances from 17/20 to **18/20**. Only the two truths that require native Windows behavior
remain unverified. There are no actionable code or record gaps in this verdict, and both lifecycle
requirements remain correctly unchecked.

## Delta From 08-VERIFICATION-4

| Item | Previous | Current |
|---|---|---|
| Overall status | `human_needed` | `human_needed` |
| Score | 17/20 | 18/20 |
| Behavior-unverified truths | 3 | 2 |
| Actionable gaps | 0 | 0 |
| External evidence acquisitions | 2 | 1 |
| Real-Caido Codex cancel | absent | executed with clean baseline, topology, Stop timestamp, and zero-survivor observation |
| Real-Caido Codex timeout | absent | initial defect reproduced; fixed 10-second run executed and classified by the UI |
| Native Windows | unrun | unchanged; exact two-case suite remains unrun |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Current evidence |
|---|---|---|---|
| 1 | SC-1: absolute-path taskkill terminates the Windows tree | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Exact two-case suite remains skipped locally; no native run exists. |
| 2 | SC-2: POSIX cancellation/timeout leaves no token-bearing orphan causally after a Drift action | ✓ VERIFIED (mechanism attribution bounded) | Clean-baseline real-Caido Codex cancel and timeout runs reached zero provider/MCP processes. Distinct groups and no-match reap diagnostics prevent attributing the MCP death to one internal fallback. |
| 3 | SC-3: cancel and timeout leave zero provider/MCP processes on both platforms | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | POSIX cancel and timeout are now measured; Windows is unrun. |
| 4 | SC-4: session finalize / `stopMcpServer` completes provider/tree/reap prerequisites before recursive token-root removal | ✓ VERIFIED | Three fresh harness processes again emitted all completion flags and `requirementSatisfied=true`. |
| 5 | SC-5: POSIX-visible behavior and existing tests stay green | ✓ VERIFIED | Fresh full run: 42 passed files / 2 native files skipped; 807 passed / 8 skipped. Typecheck, lint, and build pass. |
| 6 | Repaired A1 topology and causal measurement | ✓ VERIFIED (coincidental-reliance noted) | Carried forward; the new Codex topology independently confirms the provider/MCP group split. |
| 7 | A6 is recorded as a per-provider measurement | ✓ VERIFIED | Codex remains the false arm: provider and MCP used distinct process groups. |
| 8 | Pre-fix Control is recorded as a measurement | ✓ VERIFIED | Carried forward unchanged. |
| 9 | Three-valued liveness instrument defaults to inconclusive | ✓ VERIFIED | Carried forward unchanged. |
| 10 | POSIX enumerator is spawnable in real Caido | ✓ VERIFIED | `lastOrphanReap` again recorded a completed exit-1 scan rather than an unspawnable/timeout arm. |
| 11 | `lastOrphanReap` is bounded to scalar diagnostics | ✓ VERIFIED | Recorded values contained only closed reason, exit, attempted count, and age scalars. |
| 12 | Open runtime items are owned or explicitly ownerless | ✓ VERIFIED | The single remaining acquisition is the native Windows run, owned by Phase 9 SC-4. |
| 13 | A1 correction propagation and standing gate | ✓ VERIFIED | Fresh verdict live and 35-case self-test pass. |
| 14 | Threat registry and audit gate cover live evidence | ✓ VERIFIED | Security audit is current at `174c0b6`; live, self-test, self-scan, and independent 32-case matrix pass. |
| 15 | Invalidated provider-start generations remove retired roots | ✓ VERIFIED | Carried forward unchanged. |
| 16 | Token config ownership survives write/unlink failure | ✓ VERIFIED | Carried forward unchanged. |
| 17 | Runtime reuse requires readable regular files | ✓ VERIFIED | Carried forward unchanged. |
| 18 | Security status is audited at the current production package head | ✓ VERIFIED | Package tree `1d12c91f…`, SHA-256 census `ca4f8ae4…`, 62 package commits since `d2d502b`, zero later. |
| 19 | LIF-02 traceability pointer is semantically current | ✓ VERIFIED | The requirement remains unchecked; this report narrows the missing boundary to mechanism attribution rather than missing real-turn execution. |
| 20 | Windows evidence records match the current safe suite | ✓ VERIFIED (record contract) | Exact two-case record remains current; this is still not native execution. |

**Score:** 18/20 truths verified; 2 present but behavior-unverified; 0 failed.

## Real-Caido Cancellation Evidence

| Event | UTC observation |
|---|---|
| Clean baseline | `19:19:46`, global Drift MCP count `0` |
| Provider visible | `19:19:46.727`, pid 64663, parent Caido, pgid 64663 |
| MCP visible | `19:19:46.979`, pid 64693, parent provider, pgid 64693, global MCP count `1` |
| Drift Stop clicked | `19:20:13.221` while the prompt's `sleep 60` remained in progress |
| Zero-survivor observation | `19:20:13.431`, target set empty, global MCP count `0` |

The provider and MCP process groups were different. That falsifies direct group reach for this
Codex topology and is why the result is not rounded up to mechanism-specific group-kill proof.
The Stop action still supplies product causality: natural completion was excluded by the outstanding
60-second work and the whole observed topology disappeared about 210 ms after the user action.

Post-cancel diagnostics showed `activeSessions: 0` and
`kind=noop reason=scan-failed exit=1 attempted=0`. In this codebase the orchestration treats exit 1
as the clean pgrep no-match result even though the diagnostic classifier renders `scan-failed`.
The value is recorded literally and is not used to claim that the reap signalled a process.

## Timeout Defect, Repair, and Re-Measurement

### Falsifying control

With the real UI showing a 10-second timeout, the pre-fix turn spawned a provider and MCP child but
both remained alive more than 32 seconds. Codex later returned the requested `TIMEOUT_PROBE_DONE`
after completing `sleep 60`. Source inspection showed the only absolute-deadline enforcement lived
in `setTimeout`; the explicit keep-alive-pumped heartbeat checked process exit and Claude-specific
silence but never checked the absolute deadline.

The source-wiring regression was red before production changed: 80 existing checks passed and all
four new deadline/shared-expiry assertions failed for the expected missing wiring.

### Fixed run

| Event | UTC observation |
|---|---|
| Clean baseline | `19:31:23`, global Drift MCP count `0` |
| Send | `19:31:38.176`, Codex CLI, timeout `10` seconds |
| Provider visible | `19:31:38.339`, pid 70756, parent Caido, pgid 70756 |
| MCP visible | `19:31:38.603`, pid 70799, parent provider, pgid 70799, global MCP count `1` |
| Zero-survivor observation | `19:31:48.419`, target set empty, global MCP count `0` |
| UI / session result | `Process timed out.`; no exact `TIMEOUT_FIXED_PROBE_DONE` marker; `activeSessions: 0` |

Elapsed Send-to-zero was approximately 10.24 seconds; provider-visible-to-zero was approximately
10.08 seconds. The requested natural work was 60 seconds, so the deadline rather than normal
completion explains the result. After the measurement, the original timeout `120` and provider
`Claude Code` were restored. The authenticated ephemeral browser profile was stopped and moved to
the macOS Trash; no token value entered any record.

## Code Defects Closed During Acquisition

| Defect | Red evidence | Fix | Green/runtime evidence |
|---|---|---|---|
| Codex rejects Caido's non-repository cwd | Exact CLI error plus focused argv test: 10 pass / 1 fail | Add fixed `--skip-git-repo-check` to `buildCodexLaunchArgs` | Provider suite 11/11; real-Caido Codex turn spawned and stayed live |
| Absolute timeout starved in Caido | Real 10-second control completed `sleep 60`; 4 new source assertions red | Snapshot `processDeadlineAt`; heartbeat and timer share `expireTimedOutTurn` | Source wiring 84/84; fixed real-Caido zero at 10.24 seconds |

Both resolved debug records are under `.planning/debug/resolved/`, and the current additive review
is `08-REVIEW-3.md` with no findings.

## Fresh Regression, Audit, and Build Evidence

| Check | Result |
|---|---|
| Provider + timeout wiring focus | **PASS — 2 files; 95/95** |
| Completion-order harness | **PASS — 3/3 fresh processes; identical favorable observation** |
| Full Vitest | **PASS — 42 files passed / 2 skipped; 807 passed / 8 skipped** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — exit 0, zero warnings at `--max-warnings 0`** |
| Production build / ZIP | **PASS — `dist/plugin_package.zip` built** |
| Verdict gate | **PASS — live and 35-case self-test** |
| Threat gate | **PASS — live, self-test, self-scan, independent 32-case matrix** |
| Package identity | **PASS — `174c0b6`, tree `1d12c91f…`, digest `ca4f8ae4…`, 62 former-baseline commits, 0 later** |
| Code review | **PASS — `08-REVIEW-3.md`, 0 findings** |

The eight skipped tests are still the two native-Windows files. No skipped test is counted as
executed Windows evidence.

## Requirements Coverage

| Requirement | Status | Remaining boundary |
|---|---|---|
| LIF-01 | ✗ BLOCKED / correctly unchecked | Execute the exact two native lifecycle cases on `windows-latest` or real Windows. |
| LIF-02 | ✗ OPEN / correctly unchecked | Product-level POSIX cancel/timeout is now measured, but the requirement's exact process-group mechanism is not what reached the measured Codex MCP child; no reap signal was observed. |

## Remaining External Evidence

Execute the exact two-case native Windows suite on `windows-latest` or real Windows. Expect two
executed, zero pending, zero failed, with the live parent/grandchild tree dead and the absolute
`taskkill.exe` resolution case passing. This one acquisition supplies SC-1 and the Windows half of
SC-3; it does not change the accepted AR-01/AR-04 boundaries.

---
*Verified: 2026-09-01T19:41:07Z*
*Verifier: Codex GSD debug continuation; real-Caido runs executed through the installed local build*
