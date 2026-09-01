---
phase: 08-process-lifecycle
verified: 2026-09-01T13:55:32Z
status: human_needed
score: 17/20 must-haves verified
behavior_unverified: 3
behavior_unverified_items:
  - truth: "SC-1: absolute-path taskkill terminates the Windows provider tree"
    test: "Execute the exact two-case native kill-tree suite on windows-latest or real Windows"
    expected: "2 executed, 0 pending, 0 failed; both parent and grandchild are dead"
    why_human: "The local macOS run skips both native Windows cases"
  - truth: "SC-2: POSIX group kill plus argv-marker reap causes the zero-survivor outcome"
    test: "Cancel and time out a Drift-spawned Codex turn in real Caido"
    expected: "During/after counts, a post-stop process-group listing, and lastOrphanReap attribute cleanup to Drift"
    why_human: "Provider-owned cleanup can produce the same favorable zero"
  - truth: "SC-3: cancel and timeout leave zero provider/MCP processes on both platforms"
    test: "Combine the native Windows run with the real-Caido Codex causal run"
    expected: "Zero tracked provider and token-bearing MCP survivors after cancel and timeout on both platforms"
    why_human: "Portable tests cannot supply either missing runtime boundary"
supersedes_current_conclusions_of:
  - .planning/phases/08-process-lifecycle/08-VERIFICATION.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-2.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
package_head: 415ae7e4704cc23f30dcd9ff959672ed10622ad6
security_audit_head: 415ae7e4704cc23f30dcd9ff959672ed10622ad6
actionable_gaps: []
human_evidence_remaining:
  - "SC-1 and the Windows half of SC-3: execute the exact two-case native suite on windows-latest or real Windows."
  - "SC-2 and the POSIX half of SC-3: demonstrate cancel plus absolute-timeout causality on a Drift-spawned Codex provider in real Caido."
---

# Phase 8: Process Lifecycle — Post-Fix Verification

**Phase Goal:** Make cancel/timeout actually stop work on both platforms so no orphaned
token-bearing process survives a turn.

**Status:** `human_needed`

## Verdict

The ROADMAP SC-4 path is now verified. Commit
`415ae7e4704cc23f30dcd9ff959672ed10622ad6` replaces immediate recursive generation-root removal
with a callback-driven completion barrier. Three fresh production-wired adverse-schedule runs
observed provider exit, tree-killer close, and orphan-reap close before the single recursive
removal; the unchanged favorable predicate was true in every run. The resolved debug record also
contains the scoped revert/reconfirm proof, and the user separately confirmed that the original
live-provider Stop/restart workflow no longer reproduces the defect in real Caido.

Those are different evidence surfaces: the harness proves the completion predicate under a
controlled schedule; the user confirmation proves the real workflow. Neither proves native
Windows tree behavior or attributes a real Codex cancel/timeout zero-survivor result to Drift.

Phase 8 is therefore `human_needed` at **17/20**: seventeen truths are verified, three remain
`PRESENT_BEHAVIOR_UNVERIFIED`, and there are no actionable code or record gaps in this verdict.
LIF-01 and LIF-02 remain correctly unchecked.

## Delta From 08-VERIFICATION-3

| Item | Previous | Current |
|---|---|---|
| Overall status | `gaps_found` | `human_needed` |
| Score | 16/20 | 17/20 |
| Behavior-unverified truths | 3 | 3 |
| Actionable gaps | 1 | 0 |
| External evidence acquisitions | 2 | 2 |
| SC-4 | ✗ Completion order falsified | ✓ Generation-root completion order verified |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Current evidence |
|---|---|---|---|
| 1 | SC-1: absolute-path taskkill terminates the Windows tree | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Exact two-case suite remains skipped locally; no native run exists. |
| 2 | SC-2: POSIX group kill plus argv-marker reap leaves no token-bearing orphan causally because of Drift | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Node control/proof tests pass; a real Drift-spawned Codex causal run remains absent. |
| 3 | SC-3: cancel and timeout leave zero provider/MCP processes on both platforms | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | macOS workflow evidence exists without Codex causality; Windows is unrun. |
| 4 | SC-4: session finalize / `stopMcpServer` kills tracked pids and completes the generation-scoped reap before recursive token-root removal | ✓ VERIFIED | Three fresh harness runs emitted all completion flags plus `requirementSatisfied=true`; user confirmed live Stop/restart; focused barrier tests and revert/reconfirm are green. |
| 5 | SC-5: POSIX-visible behavior and existing tests stay green | ✓ VERIFIED | Fresh full run: 42 passed files / 2 native files skipped; 805 passed / 8 skipped. Typecheck, lint, and build pass. |
| 6 | Repaired A1 topology and causal measurement | ✓ VERIFIED (coincidental-reliance noted) | Carried forward unchanged from `08-VERIFICATION-3.md`. |
| 7 | A6 is recorded as a per-provider measurement | ✓ VERIFIED | Carried forward unchanged. |
| 8 | Pre-fix Control is recorded as a measurement | ✓ VERIFIED | Carried forward unchanged. |
| 9 | Three-valued liveness instrument defaults to inconclusive | ✓ VERIFIED | Carried forward unchanged. |
| 10 | POSIX enumerator is spawnable in real Caido | ✓ VERIFIED | Carried forward unchanged. |
| 11 | `lastOrphanReap` is bounded to scalar diagnostics | ✓ VERIFIED | Carried forward unchanged. |
| 12 | Open runtime items are owned or explicitly ownerless | ✓ VERIFIED | Only the native Windows and real-Caido Codex acquisitions remain. |
| 13 | A1 correction propagation and standing gate | ✓ VERIFIED | Fresh verdict live/self-test gates pass. |
| 14 | Threat registry and audit gate cover live evidence | ✓ VERIFIED | Security audit is current at `415ae7e`; live, self-test, self-scan, and independent 32-case matrix pass. |
| 15 | Invalidated provider-start generations remove retired roots | ✓ VERIFIED | Carried forward unchanged. |
| 16 | Token config ownership survives write/unlink failure | ✓ VERIFIED | Carried forward unchanged. |
| 17 | Runtime reuse requires readable regular files | ✓ VERIFIED | Carried forward unchanged. |
| 18 | Security status is audited at the current production package head | ✓ VERIFIED | Package tree `8ec7d8d8…`, SHA-256 census `d4041340…`, 61 package commits since `d2d502b`, zero later package commits. |
| 19 | LIF-02 traceability pointer is semantically current | ✓ VERIFIED | Requirements remain unchecked; this additive report keeps the two external boundaries explicit. |
| 20 | Windows evidence records match the current safe suite | ✓ VERIFIED (record contract) | Exact two-case record remains current; this is still not native execution. |

**Score:** 17/20 truths verified; 3 present but behavior-unverified; 0 failed.

## SC-4 Executed Evidence

Dedicated command, run three times in fresh Vitest processes:

```bash
pnpm exec vitest run \
  --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts \
  --reporter=verbose
```

Each run exited 0 and emitted the same security observation:

```json
{"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":true,"treeKillSpawned":true,"treeKillComplete":true,"reapScanSpawned":true,"reapScanComplete":true,"requirementSatisfied":true}
```

The harness still asserts the favorable conjunction directly; it was not weakened. The controlled
schedule releases terminal callbacks only after Stop yields, which proves the repair is
non-starving rather than an awaited-child workaround. Exactly one recursive removal occurs after
all three completion flags are true.

Focused verification passed **220/220** tests across `index.source.test.ts` (82),
`mcp-lifecycle.test.ts` (23), and `kill-plan.test.ts` (115). The barrier cases cover empty-ready,
all-safe completion, fail-closed retention, and duplicate/unknown terminal events. The resolved
debug record additionally preserves the scoped proof that reverting only the fix makes the same
favorable assertion fail and reapplying it makes the assertion pass.

### Claim width and the AR-05 boundary

ROADMAP SC-4 is specifically the session-finalize / `stopMcpServer` recursive generation-root
path. On that path, every tracked provider contributes an observed-exit prerequisite, every
tree-killer contributes a settlement prerequisite, and the generation-scoped orphan reap is an
independent prerequisite. Only `ready` reaches recursive `rm`; error, stale reap, orphan-killer
failure, or completion timeout retains the root and blocks replacement Start.

A tree-killer `close` is treated as settlement regardless of its exit code. Provider exit and the
POSIX orphan-reap result remain independent prerequisites, so the harness is not proof of native
Windows tree termination. That consequence stays under SC-1/SC-3 and LIF-01.

AR-05 remains one of 13 current accepted residuals because the favorable harness does not exercise
the other removal paths. `closeCliSession` and `deleteChat` still issue `killTree` and the idle reap
before fire-and-forget removal of their per-session activity/approval files;
`sweepOrphanedMcpTempDirs` still issues the class-wide reap before recursive stale-root removal.
Their kill/reap completion is not observed before removal. The refreshed security artifact records
that marked narrowing without calling AR-05 resolved.

## Fresh Regression and Audit Evidence

| Check | Result |
|---|---|
| Completion-order harness | **PASS — 3/3; 1/1 test each; identical favorable observation** |
| Focused lifecycle suites | **PASS — 3 files; 220/220** |
| Full Vitest | **PASS — 42 files passed / 2 skipped; 805 passed / 8 skipped** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — exit 0, zero warnings at `--max-warnings 0`** |
| Production build / ZIP | **PASS — `dist/plugin_package.zip` exists** |
| Verdict gate | **PASS — live and 35-case self-test** |
| Threat gate | **PASS — live, self-test, self-scan, independent 32-case matrix** |
| Package identity | **PASS — `415ae7e`, tree `8ec7d8d8…`, digest `d4041340…`, 61 former-baseline commits, 0 later** |

The eight skipped tests are still the two native-Windows files. No skipped test is counted as
executed Windows evidence.

## Requirements Coverage

| Requirement | Status | Remaining acquisition |
|---|---|---|
| LIF-01 | ✗ BLOCKED / correctly unchecked | Execute the exact two native lifecycle cases on `windows-latest` or real Windows. |
| LIF-02 | ✗ BLOCKED / correctly unchecked | Demonstrate Drift-caused cancel and absolute-timeout teardown on a Drift-spawned Codex turn in real Caido. |

SC-4's completion repair supplies neither native Windows behavior nor provider-independent POSIX
causality. Closing this implementation gap therefore does not close either lifecycle requirement.

## Remaining External Evidence

1. Execute the exact two-case native Windows suite on `windows-latest` or real Windows.
2. Execute real-Caido Codex cancel and absolute-timeout runs with during/after counts, one
   process-group listing, and `lastOrphanReap` to demonstrate Drift causality.

---
*Verified: 2026-09-01T13:55:32Z*
*Verifier: Codex quick-task executor; real-Caido confirmation supplied by the user and preserved in the resolved debug record*
