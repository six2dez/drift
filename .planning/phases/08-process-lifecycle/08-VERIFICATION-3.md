---
phase: 08-process-lifecycle
verified: 2026-08-31T20:58:13Z
status: gaps_found
score: 16/20 must-haves verified
behavior_unverified: 3
behavior_unverified_items:
  - truth: "SC-1: absolute-path taskkill terminates the Windows provider tree"
    test: "Execute the exact two-case native kill-tree suite on windows-latest or real Windows"
    expected: "2 executed, 0 pending, 0 failed; both parent and grandchild are dead"
    why_human: "The local macOS run skips both native Windows cases"
  - truth: "SC-2: POSIX group kill plus argv-marker reap causes the zero-survivor outcome"
    test: "Cancel and time out a Drift-spawned Codex turn in real Caido"
    expected: "During/after counts, a post-stop process-group listing, and lastOrphanReap attribute cleanup to Drift"
    why_human: "Claude provider-owned cleanup can produce the same favorable zero"
  - truth: "SC-3: cancel and timeout leave zero provider/MCP processes on both platforms"
    test: "Combine the native Windows run with the real-Caido Codex causal run"
    expected: "Zero tracked provider and token-bearing MCP survivors after cancel and timeout on both platforms"
    why_human: "Portable tests cannot supply either missing runtime boundary"
supersedes_current_conclusions_of:
  - .planning/phases/08-process-lifecycle/08-VERIFICATION.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-2.md
package_head: 00170eaf8b77dd1180490d68ecd6b6d33ce53cc7
production_source_head: f053a15b4f44ff0a4c507201848826e7e0aa4b35
gaps_remaining:
  - "SC-4: cleanup issues provider kill and orphan scan but starts recursive token-root removal before either completion is observed."
human_evidence_remaining:
  - "SC-1 and the Windows half of SC-3: execute the exact two-case native suite on windows-latest or real Windows."
  - "SC-2 and the POSIX half of SC-3: demonstrate causality on a Drift-spawned Codex provider rather than provider-owned cleanup."
---

# Phase 8: Process Lifecycle — Completion-Order Evidence Update

**Phase Goal:** Make cancel/timeout actually stop work on both platforms so no orphaned
token-bearing process survives a turn.

**Status:** `gaps_found`

## Verdict

The third evidence acquisition from `08-VERIFICATION-2.md` has been executed. Its result is
unfavorable and deterministic: a production-wired injected orchestrator harness observed
recursive runtime-root removal begin while the tracked-provider exit, tree-killer close, and
orphan-scan close were all still pending.

Accordingly, SC-4 is no longer `PRESENT_BEHAVIOR_UNVERIFIED`; it is `FAILED`. Phase 8 keeps the
same 16/20 score because the truth was not previously counted as verified, but the overall status
changes from `human_needed` to `gaps_found`. One actionable implementation gap now exists. The
other 16 truths and all six post-plan-23 closures from `08-VERIFICATION-2.md` carry forward
unchanged.

LIF-01 and LIF-02 remain correctly unchecked.

## Delta From 08-VERIFICATION-2

| Item | Previous | Current |
|---|---|---|
| Overall status | `human_needed` | `gaps_found` |
| Score | 16/20 | 16/20 |
| Behavior-unverified truths | 4 | 3 |
| Actionable gaps | 0 | 1 |
| External evidence acquisitions | 3 | 2 |
| SC-4 | ⚠️ Invocation order only | ✗ Completion order falsified |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Current evidence |
|---|---|---|---|
| 1 | SC-1: absolute-path taskkill terminates the Windows tree | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Exact two-case suite remains skipped locally; no native run exists. |
| 2 | SC-2: POSIX group kill plus argv-marker reap leaves no token-bearing orphan causally because of Drift | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Node control/proof tests pass; a real Drift-spawned Codex causal run remains absent. |
| 3 | SC-3: cancel and timeout leave zero provider/MCP processes on both platforms | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | macOS Claude readings exist but provider cleanup is implicated; Windows is unrun. |
| 4 | SC-4: tracked processes die/reap completes before token-source files are swept | ✗ FAILED | Three identical harness runs reached recursive removal with provider exit, tree-killer close, and reap-scan close all false. |
| 5 | SC-5: POSIX-visible behavior and existing tests stay green | ✓ VERIFIED | Fresh full run: 42 passed files / 2 native files skipped; 801 passed / 8 skipped. Typecheck and lint pass. |
| 6 | Repaired A1 topology and causal measurement | ✓ VERIFIED (coincidental-reliance noted) | Carried forward unchanged from `08-VERIFICATION-2.md`. |
| 7 | A6 is recorded as a per-provider measurement | ✓ VERIFIED | Carried forward unchanged. |
| 8 | Pre-fix Control is recorded as a measurement | ✓ VERIFIED | Carried forward unchanged. |
| 9 | Three-valued liveness instrument defaults to inconclusive | ✓ VERIFIED | Carried forward unchanged. |
| 10 | POSIX enumerator is spawnable in real Caido | ✓ VERIFIED | Carried forward unchanged. |
| 11 | `lastOrphanReap` is bounded to scalar diagnostics | ✓ VERIFIED | Carried forward unchanged. |
| 12 | Open runtime items are owned or explicitly ownerless | ✓ VERIFIED | Updated here: SC-4 is now an implementation gap; two runtime acquisitions remain. |
| 13 | A1 correction propagation and standing gate | ✓ VERIFIED | Carried forward unchanged. |
| 14 | Threat registry and audit gate cover live evidence | ✓ VERIFIED | Carried forward unchanged; the harness introduces no production change. |
| 15 | Invalidated provider-start generations remove retired roots | ✓ VERIFIED | Carried forward unchanged. |
| 16 | Token config ownership survives write/unlink failure | ✓ VERIFIED | Carried forward unchanged. |
| 17 | Runtime reuse requires readable regular files | ✓ VERIFIED | Carried forward unchanged. |
| 18 | Security status is audited at the current production source head | ✓ VERIFIED | Production source remains `f053a15`; commit `00170ea` adds only the isolated evidence harness/config. |
| 19 | LIF-02 traceability pointer is semantically current | ✓ VERIFIED | Requirements remain unchecked; this additive report corrects the current evidence boundary. |
| 20 | Windows evidence records match the current safe suite | ✓ VERIFIED (record contract) | Exact two-case record remains current; this is still not native execution. |

**Score:** 16/20 truths verified; 3 present but behavior-unverified; 1 failed.

## SC-4 Executed Evidence

Dedicated command:

```bash
pnpm exec vitest run \
  --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts \
  --reporter=verbose
```

Runs 1–3 each exited 1 on the final favorable assertion and emitted:

```json
{"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":false,"treeKillSpawned":true,"treeKillComplete":false,"reapScanSpawned":true,"reapScanComplete":false,"requirementSatisfied":false}
```

The complete command/output, non-vacuity controls, isolation audit, production link, and hashes
are recorded in
`.planning/quick/260831-vep-create-a-faithful-completion-order-harne/260831-vep-VERIFICATION.md`.

The production sequence explains the result:

1. `index.ts:4459-4461` issues `killTree(...)` and deletes the tracked-map entry.
2. `index.ts:4508-4523` issues the void `reapMcpOrphans(...)` scan.
3. `index.ts:4525-4527` immediately begins recursive removal.

There is statement order but no completion-bearing edge between steps 1/2 and step 3. The source
itself states at `index.ts:4498-4502` that completion order is not enforced.

## Gap

### SC-4 completion-bearing teardown is missing

- **Missing:** A non-starving lifecycle mechanism that defers recursive token-root removal until
  the tracked provider is dead and the generation-scoped orphan reap has completed, or reaches an
  explicit fail-closed terminal outcome.
- **Impact:** Token-source files and their forensic session/policy trail can be deleted while a
  process that already loaded the Caido token is still running. Deletion is not credential
  revocation.
- **Fix boundary:** A simple awaited child callback inside the RPC handler is not sufficient because
  Caido's constrained runtime can starve those callbacks. The implementation needs a state-machine
  or externally pumped completion barrier, then the dedicated harness must turn green unchanged.
- **Owner:** New Phase 8 gap plan; not silently assigned to the Windows evidence phase.

## Fresh Regression Evidence

| Check | Result |
|---|---|
| Completion-order harness | **EXPECTED RED — 3/3 identical, one final SC-4 assertion failed** |
| Targeted lifecycle tests | **PASS — 3 files, 87/87** |
| Full Vitest | **PASS — 42 files passed / 2 skipped; 801 passed / 8 skipped** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — zero warnings at `--max-warnings 0`** |
| Production source diff from `f053a15` | **NONE** |

The existing green suite continues to prove mechanism selection, statement order, POSIX tree
behavior, and orphan-marker selectivity. It does not override the executed adverse completion
schedule.

## Requirements Coverage

| Requirement | Status | Blocking issue |
|---|---|---|
| LIF-01 | ✗ BLOCKED / correctly unchecked | Native Windows tree execution remains absent. |
| LIF-02 | ✗ BLOCKED / correctly unchecked | Real-Caido Codex causality remains absent, and SC-4 now has a demonstrated completion-order gap. |

## Remaining External Evidence

1. Execute the exact two-case native Windows suite on `windows-latest` or real Windows.
2. Execute real-Caido Codex cancel and absolute-timeout runs with during/after counts, one
   process-group listing, and `lastOrphanReap` to demonstrate Drift causality.

The former third acquisition is complete. It is now engineering work, not human evidence debt.

---
*Verified: 2026-08-31T20:58:13Z*
*Verifier: Codex inline; no subagent used by active instruction*
