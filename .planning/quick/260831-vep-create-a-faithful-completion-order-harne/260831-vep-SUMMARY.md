---
phase: quick-260831-vep
plan: 01
subsystem: process-lifecycle
tags: [vitest, teardown, process-tree, orphan-reap, evidence]

requires:
  - phase: 08-process-lifecycle
    provides: kill-tree and orphan-reap mechanisms plus the unresolved SC-4 completion-order evidence boundary
provides:
  - A deterministic production-wired harness for the recursive token-root removal boundary
  - Three identical non-vacuous observations falsifying SC-4 completion ordering
  - An additive current Phase 8 verification verdict with one actionable lifecycle gap
affects: [08-process-lifecycle gap planning, LIF-02 verification, release readiness]

tech-stack:
  added: []
  patterns:
    - "Adverse-schedule evidence harnesses stay outside the default suite and assert the favorable security predicate, so a violation exits non-zero"
    - "Signal issuance, helper spawn, process exit, helper close, and filesystem removal are recorded as distinct lifecycle events"

key-files:
  created:
    - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts
    - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts
    - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/260831-vep-VERIFICATION.md
    - .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
  modified: []

key-decisions:
  - "Treat the identical red runs as evidence of a production happens-before gap, not as a harness failure"
  - "Create 08-VERIFICATION-3.md additively; preserve PROJECT.md and both older Phase 8 verification files byte-for-byte"
  - "Do not redesign lifecycle production code inside an evidence-only acquisition"

patterns-established:
  - "A completion-order claim needs a completion-bearing event at the destructive boundary; source invocation order is insufficient"

duration: 11min
completed: 2026-08-31
---

# Quick Task 260831-vep: Completion-Order Harness — Summary

**The third Phase 8 evidence acquisition is complete and unfavorable: recursive token-root removal
can begin after kill/reap issuance but before provider exit, tree-killer close, or orphan-scan close.
Phase 8 is now `gaps_found` at 16/20, with one actionable SC-4 gap and two external acquisitions
remaining.**

## Result

The dedicated harness drove the real backend through:

```text
init
  -> updateSettings
  -> syncCaidoSessionToken
  -> startMcpServer
  -> createCliSession
  -> sendCliMessage (held in flight)
  -> stopMcpServer
  -> recursive runtime-root rm observation
```

It executed three times in separate Vitest processes. Each run passed every non-vacuity control,
emitted the same observation, then failed only the favorable SC-4 assertion:

```json
{"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":false,"treeKillSpawned":true,"treeKillComplete":false,"reapScanSpawned":true,"reapScanComplete":false,"requirementSatisfied":false}
```

This is a deterministic counterexample to completion-before-removal. The existing source tests
remain correct but prove only invocation order.

## Task Commits

1. **Task 1: Build and execute the controlled completion-order harness** — `00170ea`
2. **Task 2: Record and independently classify the evidence** — `c812420`

## Files Created

- `completion-order.harness.ts` — production-wired adverse-schedule probe with explicit
  non-vacuity, isolation, cleanup, and favorable security assertion.
- `vitest.harness.config.ts` — dedicated config; the `.harness.ts` file is not discovered by the
  default suite.
- `260831-vep-VERIFICATION.md` — exact command, raw observation, three-run result, hashes,
  isolation audit, root cause, and gap classification.
- `08-VERIFICATION-3.md` — additive current Phase 8 verdict: `gaps_found`, 16/20, SC-4 failed,
  three behavior-unverified truths, two external acquisitions remaining.

No production file was changed.

## Gates Run

| Gate | Result |
|---|---|
| Dedicated harness | **EXPECTED RED — 3/3 identical; final SC-4 assertion failed** |
| Harness non-vacuity | **PASS — signal, tree killer, reap scan, event flow, and one root removal observed** |
| Targeted lifecycle tests | **PASS — 87/87** |
| Full suite | **PASS — 801 passed / 8 native-Windows skipped** |
| Typecheck | **PASS — all three packages** |
| Lint | **PASS — zero warnings** |
| Plan structure/frontmatter/references | **PASS** |
| Must-have artifacts/key links | **PASS — 4/4 artifacts, 2/2 links** |
| Production diff from `f053a15` | **NONE** |

## Gap Disposition

SC-4 now needs a production completion barrier that does not depend on awaiting starvable child
callbacks inside a Caido RPC handler. The repair must defer recursive token-root removal until the
tracked provider is dead and the generation-scoped reap has completed or reached an explicit
fail-closed outcome. The committed harness is the acceptance test and must turn green without
weakening its final assertion.

No fix was attempted because this quick task was explicitly evidence-only. The result was not
relabeled as `human_needed` or `passed`.

## Remaining Evidence

1. Run the exact two native lifecycle cases on `windows-latest` or real Windows.
2. Measure cancel and absolute timeout of a Drift-spawned Codex turn in real Caido, with enough
   telemetry to prove Drift caused the cleanup.

The completion-order acquisition is no longer pending evidence; it is a demonstrated engineering
gap.

## Preservation Audit

- `.planning/PROJECT.md` — pre-existing modification preserved and not staged.
- `.planning/phases/08-process-lifecycle/08-VERIFICATION.md` — pre-existing historical
  modification preserved and not staged.
- `.planning/phases/08-process-lifecycle/08-VERIFICATION-2.md` — unchanged.
- All pre-existing untracked files/directories — untouched and never staged.
- Push — not performed.

The normal GSD quick index/state update was intentionally omitted because it would have modified
the user's pre-existing dirty `PROJECT.md`/state artifacts, violating the handoff preservation
boundary.

## Deviations From Plan

- Added additive `08-VERIFICATION-3.md` to Task 2 after the executed result made
  `08-VERIFICATION-2.md`'s “no actionable gaps / three acquisitions” conclusion stale. The plan was
  updated and revalidated before the file was written.
- No production implementation was added after the harness failed; doing so would have expanded an
  evidence acquisition into an architectural lifecycle redesign.

## Self-Check: PASSED

- [x] Harness and dedicated config committed in `00170ea`.
- [x] Quick and Phase 8 verification artifacts committed in `c812420`.
- [x] Three raw runs are identical and record the favorable predicate as false.
- [x] Default suite remains green and excludes the harness.
- [x] LIF-01 and LIF-02 remain open.
- [x] Historical/dirty handoff files remain untouched.

---
*Quick task: 260831-vep*
*Completed: 2026-08-31*
