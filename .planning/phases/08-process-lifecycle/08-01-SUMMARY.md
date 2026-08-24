---
phase: 08-process-lifecycle
plan: 01
subsystem: infra
tags: [process-lifecycle, quickjs, llrt, spike, diagnostics, posix, process-group]

requires:
  - phase: 07-provider-launch
    provides: buildSpawnPlan, the SpawnWithEnv narrowed cast, and the T-04-04 diagnostics-rendering rule this spike had to obey
provides:
  - "08-SPIKE.md — a NOT-RUN record for assumptions A1 and A6, with the full four-step procedure preserved verbatim"
  - "A reusable probe implementation, reachable at commit 68199fa, that can be rebuilt and run later without redesign"
  - "A clean tree: zero temporary diagnostics scaffolding carried into wave 2"
affects: [08-02, 08-03, 08-05, kill-plan, LIF-02]

actuals:
  tokens: 5443
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Two ASCII marker lines fencing a temporary section, so its removal is a two-marker operation rather than a judgement call"

key-files:
  created:
    - .planning/phases/08-process-lifecycle/08-SPIKE.md
    - .planning/phases/08-process-lifecycle/deferred-items.md
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "Maintainer waived the T-08-02 hardware checkpoint on 2026-08-24 without supplying readings; A1 and A6 therefore remain OPEN and 08-SPIKE.md was written as a not-run record rather than a results record"
  - "No A1/A6 value was inferred, estimated or reconstructed — a fabricated confirmation is the exact failure the spike existed to prevent"
  - "The probe was still removed from HEAD as planned: it spawns fixture processes on every getDiagnostics call and must not ship"
  - "The breadcrumb comment was rephrased as a negation ('No ... ran here') so it is factually true after the waiver, while still matching the plan's grep gate"

patterns-established:
  - "Fenced-temporary-code: an ASCII open/close marker pair makes scaffolding removal mechanical and greppable"
  - "Not-run spike records: when a measurement is waived, record the absence and the procedure rather than deleting the planned expectation"

requirements-completed: [LIF-02]

coverage:
  - id: D1
    description: "Temporary A1/A6 probe added to the diagnostics block, fenced by two ASCII markers"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "pnpm -r typecheck && pnpm lint && pnpm exec vitest run (534 tests, 528 passed, 6 skipped)"
        status: pass
      - kind: other
        ref: "grep gates: markers=1/1, runLifecycleSpike=2, spikeDetachedGroupKill=7, 'detached: boolean'=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "A1 CLOSED — the shipped Caido LLRT honours the process-group spawn option on real hardware"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-SPIKE.md § How to run this spike later, steps 1-2"
        status: unknown
    human_judgment: true
    rationale: "NOT DELIVERED. The hardware checkpoint was waived on 2026-08-24 with no readings supplied. A1 is OPEN and rests entirely on source analysis of caido/dependency-llrt@caido a5b021c, never on execution. No CI leg can close it — every leg runs Node."
  - id: D3
    description: "A6 CLOSED — a real provider CLI's MCP child sits in a process group the group-kill reaches"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-SPIKE.md § How to run this spike later, step 3"
        status: unknown
    human_judgment: true
    rationale: "NOT DELIVERED. Checkpoint waived; no pgid/pid pair was observed. A6 is OPEN and untested by construction — no CLI binary is executed anywhere in this project's CI."
  - id: D4
    description: "The LIF-02 defect reproduced on real hardware, with its pgrep count recorded as plan 08-05's baseline"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-SPIKE.md § How to run this spike later, step 4"
        status: unknown
    human_judgment: true
    rationale: "NOT DELIVERED. Checkpoint waived. Plan 08-05's closing human-verify now has no measured before/after baseline to compare its fix against."
  - id: D5
    description: "Zero temporary spike scaffolding survives into wave 2; index.ts byte-equivalent to pre-plan apart from one breadcrumb"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "grep -c 'runLifecycleSpike|SPIKE_FIXTURE_SOURCE|SPIKE_GRANDCHILD_SOURCE|spikeDetachedGroupKill|spikeProcessKillType|SpawnDetached' = 0; grep -c detached = 0; git diff --stat 1c7a22f = 4 insertions (breadcrumb only)"
        status: pass
    human_judgment: false

duration: 1h 55m
completed: 2026-08-24
status: complete
---

# Phase 8 Plan 01: Wave-0 Risk-Closure Spike Summary

**The A1/A6 probe was built, bundled and then removed without ever being executed — the hardware checkpoint was waived, so the phase's two highest-risk assumptions remain OPEN and 08-SPIKE.md records the absence of evidence rather than evidence.**

## Performance

- **Duration:** 1h 55m
- **Started:** 2026-08-24T13:12:00Z (approx, first gate run)
- **Completed:** 2026-08-24T15:07:23Z
- **Tasks:** 2 of 3 executed; 1 waived
- **Files modified:** 3 (1 source, 2 planning artifacts)

## Accomplishments

- Built a temporary, fenced diagnostics probe that spawns a fixture parent + grandchild from Caido's own LLRT backend, group-signals them via the OS `kill` utility, and reports the verdict through the existing Copy-diagnostics action — verified present in the built `dist/plugin_package.zip`.
- Deliberately used the OS `kill` utility rather than the runtime's negative-pid signalling form, which `08-RESEARCH.md` § Q2 proves raises an `Underflow` conversion error under LLRT while passing under Node. The broken spelling would have made the probe report a **false negative for A1** — the exact inversion the probe existed to prevent (threat T-08-06).
- Removed 100% of the scaffolding again: `runLifecycleSpike`, `SpawnDetached`/`spawnDetached`, both `SPIKE_*` constants and all three `spike*` diagnostics keys. `index.ts` is byte-equivalent to its pre-plan state apart from a three-line breadcrumb.
- Wrote `08-SPIKE.md` preserving the complete four-step procedure verbatim, plus the commit to rebuild the probe from, so the measurement can be taken later without redesign.

## Task Commits

1. **T-08-01: Add the temporary A1 probe to the diagnostics block** — `68199fa` (feat)
2. **T-08-02: Run the spike on a real Caido install** — **WAIVED, NOT SATISFIED.** No commit; no readings taken.
3. **T-08-03: Record measurements and delete every temporary symbol** — `d8ccab8` (chore)

## Files Created/Modified

- `.planning/phases/08-process-lifecycle/08-SPIKE.md` — a NOT-RUN record: A1 OPEN, A6 OPEN, control never observed, full re-run procedure preserved
- `.planning/phases/08-process-lifecycle/deferred-items.md` — logs the untracked `.planning/milestone.lock` as out-of-scope
- `packages/backend/src/index.ts` — probe added then removed; net change is one three-line breadcrumb above `getDiagnostics`

## Decisions Made

- **The checkpoint was waived by the maintainer, not satisfied.** Asked explicitly for the six readings and told that `08-SPIKE.md` is built from them, the maintainer replied `approved` then `continue` without supplying any. Recorded as their decision.
- **Nothing was inferred to fill the gap.** There is no honest value for the A1/A6 result fields, so every one reads "not recorded — spike not run".
- **The probe was still removed.** Leaving it in HEAD would spawn two fixture processes on every `getDiagnostics` call — including every support-bundle copy — which must not ship.
- **`.planning/milestone.lock` was left uncommitted.** It carries a session id, a machine-local pid and a timestamp, has never been tracked, and committing it would bake a lock naming a dead pid into history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] ESLint `no-useless-assignment` rejected the probe's initialiser**
- **Found during:** Task T-08-01
- **Issue:** `let spikeProcessKillType = "unavailable";` was flagged because both the `try` and `catch` arms below assign it, so no path ever reads the initial value. `pnpm lint` runs `--max-warnings 0`, so this blocked the task's own verify gate.
- **Fix:** Declared as `let spikeProcessKillType: string;` without an initialiser, with a comment recording why. Both arms still assign, so TypeScript's definite-assignment analysis is satisfied.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `pnpm lint` exit 0; `pnpm -r typecheck` exit 0
- **Committed in:** `68199fa`

**2. [Rule 1 - Correctness] The planned breadcrumb text would have been false after the waiver**
- **Found during:** Task T-08-03
- **Issue:** The plan specifies the literal breadcrumb `// Phase 8 Wave-0 spike (A1/A6) ran here and was removed; readings in 08-SPIKE.md.` After the waiver the spike never ran and there are no readings, so that sentence asserts two things that did not happen — in the one place a future reader would trust it.
- **Fix:** Rephrased as a negation that still contains the plan's grep substring verbatim: `// No Phase 8 Wave-0 spike (A1/A6) ran here.` followed by two lines naming the probe's commit, the waiver, and the OPEN status. The acceptance grep still returns 1.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `grep -c 'Phase 8 Wave-0 spike (A1/A6) ran here'` = 1; `grep -c 'detached'` = 0 (the breadcrumb deliberately avoids the word the 08-02 gate reserves)
- **Committed in:** `d8ccab8`
- **Note:** The breadcrumb is 3 lines rather than the planned 1. The waiver made a one-line breadcrumb unable to carry both the pointer and the not-run status honestly.

---

**Total deviations:** 2 auto-fixed (1 × Rule 3 blocker, 1 × Rule 1 correctness)
**Impact on plan:** No scope creep. Both were forced by gates or by the waiver; neither changes what the plan built.

## Issues Encountered

**The plan's central purpose was not achieved, by maintainer decision.** Plan 08-01 existed to close A1 and A6 before plan 08-02 bets the phase's POSIX mechanism on them. It did not. The mechanism now proceeds on source analysis alone.

### UNMET must_have truths

The plan's `must_haves.truths` are recorded here as unmet rather than quietly satisfied:

| # | Truth | Status |
|---|---|---|
| 1 | A real Caido install reports whether a detached spawn's group kill reaches a grandchild (A1) | **UNMET — waived** |
| 2 | The pgid of a real provider CLI's `mcp-server.mjs` child is recorded against the CLI's pid (A6) | **UNMET — waived** |
| 3 | The pre-fix control is recorded: `pgrep -f mcp-server.mjs` is non-zero after Stop | **UNMET — waived** |
| 4 | Every temporary spike symbol is gone at the plan's final commit | **MET** — verified by grep and by a 4-insertion net diff |

### Open risks carried forward

- **A1 — OPEN.** Whether the shipped Caido LLRT honours the process-group spawn option is unverified on any real install. If the shipped fork differs from `caido/dependency-llrt@caido a5b021c`, the group kill signals a group that was never created, LIF-02 is not closed, and **every CI leg stays green while it happens** — because every leg runs Node, and Node honours the option. This is finding L-4 of `05-RESEARCH.md` recurring.
- **A6 — OPEN.** If any provider CLI calls `setsid()` on its MCP child, the group signal misses it and LIF-02 is not closed by process groups alone.
- **No LIF-02 baseline.** Plan 08-05's closing human-verify has no measured before/after count to demonstrate its fix against.

**Mitigation now load-bearing:** plan 08-02's recorded decision OQ-2 — keep the single-pid signal alongside the group signal, explicitly as defence against A1 — is the phase's only remaining protection. It degrades a total regression into a partial one; it does not prevent one.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`08-02` is unblocked and can proceed: this plan left no scaffolding, the suite is at its 534/528/6 baseline, and typecheck and lint are clean.

It proceeds **without** the risk closure it was sequenced to receive. Plan 08-02 task T-08-04 was to copy the A1/A6 verdict lines into `kill-plan.ts`'s module header; those verdicts are **`A1: OPEN — not measured`** and **`A6: OPEN — not measured`**, and they should be carried across in that form so the module header records what is assumed rather than implying something was proven. The four-step procedure in `08-SPIKE.md` remains runnable at any later point.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-24*

## Self-Check: PASSED

- All created files verified present on disk (`08-SPIKE.md`, `deferred-items.md`, `index.ts`)
- Both task commits verified in git log (`68199fa`, `d8ccab8`)
- Removal gate re-asserted: zero temporary symbols, breadcrumb = 1, `detached` = 0
- Gates re-run at final state: typecheck 0, lint 0, vitest 534 tests / 528 passed / 6 skipped
