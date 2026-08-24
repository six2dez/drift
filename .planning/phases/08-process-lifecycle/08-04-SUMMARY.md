---
phase: 08-process-lifecycle
plan: 04
subsystem: infra
tags: [process-lifecycle, taskkill, win32, ci-gate, false-green, lif-01, measurement]

requires:
  - phase: 08-process-lifecycle
    provides: "buildKillTreePlan and DEFAULT_TASKKILL from plan 08-02 — the production builder every argv in this suite comes from"
  - phase: 07-provider-launch
    provides: "spawn-plan.win32.test.ts and spawn-plan.win32.gate.test.ts — the structural quartet this plan mirrors, and the gate step whose anchors it must NOT collide with"
provides:
  - "packages/backend/src/kill-tree.win32.test.ts — the win32-gated integration suite: the tree-kill proof, the SystemRoot resolution measurement (A7), and the dead-pid exit-code measurement (A2)"
  - "packages/backend/src/kill-tree.win32.gate.test.ts — the every-platform guard that the CI gate still exists and still points at a real, still-gated file"
  - ".github/workflows/ci.yml — the `Gate: the win32 kill-tree suite actually ran` step, writing $RUNNER_TEMP/win32-kill-tree-report.json"
  - "The D-P2 collision closure: both Windows gate tests now assert BOTH step names and BOTH report filenames, verified falsifiable in both directions"
affects: [08-05, LIF-01, SC-3]

actuals:
  tokens: 6200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Mutually non-satisfiable CI gates: two structurally identical gate steps made independently deletable-with-a-red-test by pinning distinct step names and distinct report filenames, and by each gate test asserting BOTH phases' anchors"
    - "Record-never-assert for an undocumented vendor exit code: capture { code, stderrFirstLine }, assert only that a number came back, emit one [measurement] log line, and reserve an empty slot for the value and its run URL"
    - "Two-armed platform measurement as ONE unconditional assertion: both arms described as data and compared through a ternary, so no `expect` sits inside a branch that can silently assert nothing"

key-files:
  created:
    - packages/backend/src/kill-tree.win32.test.ts
    - packages/backend/src/kill-tree.win32.gate.test.ts
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "D-P2 implemented and verified falsifiable in BOTH directions: deleting the Phase 8 step turns 3 kill-tree gate cases red while all 5 spawn-plan cases stay green; deleting the Phase 7 step turns 2 spawn-plan cases red plus the Phase 8 collision case"
  - "The three-arm assertion (pending>0 / total===0 / passed!==total) stayed GREEN in direction 1 — measured proof that the collision was real and that the distinct-anchor cases are what actually close it"
  - "D-P4b implemented: the dead-pid exit code is emitted as a [measurement] log line, the only assertion is `typeof code === \"number\"`, and RunResult.code is typed `number | null` so that assertion is genuinely falsifiable"
  - "The suite path is spelled ONCE in ci.yml, at the invocation rather than also in the prose, so the acceptance criterion's grep counts the gate rather than the comment"
  - "Case 2 is a single unconditional assertion over both arms rather than an if/return pair — `vitest/no-conditional-expect` is right that an early-returning branch can silently assert nothing"

patterns-established:
  - "Bidirectional gate-collision proof: before committing two structurally identical CI gates, delete each in turn and record WHICH cases go red — the shared arms staying green is the measurement that justifies the distinct anchors"
  - "Reserved measurement slot written as visibly empty placeholders rather than a plausible guess, in the spawn-plan.ts:47-62 shape"

requirements-completed: []

coverage:
  - id: D1
    description: "On a real windows-latest host, the argv buildKillTreePlan produces for \"win32\" terminates a live parent AND its grandchild — LIF-01's mechanism proven behaviourally rather than only as a spawn contract"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "packages/backend/src/kill-tree.win32.test.ts#win32 process-tree termination (LIF-01) > the plan's argv brings down a real process tree"
        status: unknown
    human_judgment: true
    rationale: "WRITTEN AND COLLECTED, NEVER EXECUTED. The case is skipIf-gated to win32 and no windows-latest run exists for it yet — nothing was pushed during this plan. Off Windows it reports as a visible skip, which is a non-result rather than a pass. Its status becomes `pass` only when the gate step below reports a non-zero executed count on a real runner. Broken-windows ledger entry 12 (unrun-verify)."
  - id: D2
    description: "taskkill.exe resolves by absolute path from the runner's own system root, with the documented bare-name fallback asserted instead when the runner has no SystemRoot (assumption A7 turned into a measurement)"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "packages/backend/src/kill-tree.win32.test.ts#win32 process-tree termination (LIF-01) > resolves taskkill.exe by absolute path from the runner's own SystemRoot"
        status: unknown
    human_judgment: true
    rationale: "Same vehicle caveat as D1: collected everywhere, executable only on the windows-latest leg, and not yet run. A7 remains an assumption until that leg reports."
  - id: D3
    description: "A kill issued against a pid that has already exited is a logged no-op: taskkill's exit code and its first stderr line are RECORDED as a measurement and never compared against a literal, and no code path branches on that exit code"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "grep -cE 'expect\\([^)]*code[^)]*\\)\\.toBe\\([0-9]' packages/backend/src/kill-tree.win32.test.ts = 0 — the no-branch half is proven on every platform, statically"
        status: pass
      - kind: integration
        ref: "packages/backend/src/kill-tree.win32.test.ts#win32 process-tree termination (LIF-01) > [measurement] records taskkill's exit code and stderr for an already-dead pid"
        status: unknown
    human_judgment: true
    rationale: "The PROHIBITION half (nothing branches on the value) is closed statically and verifiable on any host — that is the half assumption A2's low rating actually depends on. The MEASUREMENT half is unrun: the reserved comment block in the file is deliberately empty, and the value plus its run URL are owed as a follow-up commit after the first real windows-latest run."
  - id: D4
    description: "The Windows suite is proven to have actually executed on the Windows host — a --reporter=json gate with three independent arms, each of which fails a different way of going green with nothing run"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-tree.win32.gate.test.ts#the windows CI leg asserts the win32 kill-tree suite ran (LIF-01) > fails on a skipped, uncollected or partly-failing run"
        status: pass
      - kind: other
        ref: "python3 -c \"import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))\" exits 0; grep -c 'Gate: the win32 kill-tree suite actually ran' = 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 8's gate step and Phase 7's gate step cannot satisfy each other's assertions: they carry distinct step names and distinct report filenames, and the gate test asserts both are present"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-tree.win32.gate.test.ts#the windows CI leg asserts the win32 kill-tree suite ran (LIF-01) > cannot be satisfied by the Phase 7 gate step, nor it by this one"
        status: pass
      - kind: other
        ref: "Bidirectional deletion measured by hand: Phase 8 step removed -> 3 kill-tree cases red / 5 spawn-plan cases green; Phase 7 step removed -> 2 spawn-plan cases red + the Phase 8 collision case"
        status: pass
    human_judgment: false

duration: 20 min
completed: 2026-08-24
status: complete
---

# Phase 8 Plan 04: The Windows Evidence — a Tree Kill on a Real Runner, and a Gate That Cannot Be Satisfied by Its Twin Summary

**The win32 half of LIF-01 now has a vehicle: a three-case `skipIf`-gated suite that drives the production `buildKillTreePlan` argv against a real Windows process tree, plus a `--reporter=json` CI gate whose anchors are deliberately distinct from Phase 7's — measured, by deleting each step in turn, to be the only thing standing between the two gates and mutual satisfaction.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-24T15:34:00Z
- **Completed:** 2026-08-24T15:54:00Z
- **Tasks:** 2 of 2
- **Files created/modified:** 3 (2 created, 1 modified)

## Accomplishments

- **Built the win32 integration suite through the production builder and nowhere else.** Every termination argv in `kill-tree.win32.test.ts` comes from `buildKillTreePlan`; `grep -c '"/pid"'` returns `0`, which is the machine form of "this file cannot agree with itself instead of with production" (threat T-08-02). It collects three cases on every platform and executes them only on `windows-latest`.
- **Closed the naming collision that was the central hazard of this plan — and measured that it was real.** Direction 1 (Phase 8 step deleted) is the important reading: the three-arm case `"fails on a skipped, uncollected or partly-failing run"` stayed **GREEN**, satisfied entirely by Phase 7's step. Only `"carries a gate step for it"`, `"re-runs the suite under the JSON reporter"` and the new sixth case went red. Had Phase 8 reused Phase 7's step name and report filename, all six would have stayed green with the gate deleted.
- **Made the undocumented exit code a measurement rather than a control-flow input.** `RunResult.code` is typed `number | null` on purpose, so the single assertion `expect(typeof result.code).toBe("number")` is genuinely falsifiable rather than a tautology over a `number`-typed field. One `[measurement]` line carries the code and the first stderr line into the runner log, and a reserved block holds visibly empty placeholders for the value and its run URL.
- **Turned assumption A7 into a two-armed measurement with no conditional assertion.** A runner with no system root is a real answer, not a failure, so the bare-name fallback arm is asserted instead — but as *data* compared in one unconditional `expect`, because `vitest/no-conditional-expect` is right that an early-returning branch can silently assert nothing.
- **Kept the fixtures leak-free on a shared runner.** Both fixture processes idle for a bounded 20 s and self-exit, `tempDirs` are removed in `afterEach`, stray pids are force-killed there too, and every case carries the shared 15 s `SPAWN_TIMEOUT_MS` (threat T-08-17).
- **Named Pitfall 5's residual at the site rather than papering over it.** The tree switch walks the `ParentProcessId` relation, so a descendant whose intermediate parent has already exited is unreachable. Case 1 deliberately keeps the intermediate alive; the hole is accepted as `08-SECURITY.md` AR-01, which plan 08-05 still owes.

## Task Commits

| Task | Name | Type | Commit |
|---|---|---|---|
| T-08-10 | The win32-gated integration suite — prove the tree kill, measure the dead-pid exit code | auto | `9e1214f` |
| T-08-11 | The CI execution gate and the every-platform guard that it still exists | auto | `0df5e8d` |

## The bidirectional falsifiability measurement

Run by hand against the real files, both directions, each restored immediately after. This is the evidence for D-P2 and it is recorded here because the plan asked for it to be verified rather than asserted.

| Direction | `kill-tree.win32.gate.test.ts` | `spawn-plan.win32.gate.test.ts` |
|---|---|---|
| **Phase 8 step deleted** | 3 passed, **3 RED** — `carries a gate step for it`, `re-runs the suite under the JSON reporter`, `cannot be satisfied by the Phase 7 gate step` | **5 passed, 0 failed** |
| **Phase 7 step deleted** | 5 passed, **1 RED** — `cannot be satisfied by the Phase 7 gate step` | 3 passed, **2 RED** — `carries a gate step for it`, `re-runs the suite under the JSON reporter` |

The property that matters: **neither step can be deleted without turning a test red**, and each phase's own anchors are asserted independently of the other's.

## Measurements

| Measurement | Value |
|---|---|
| Suite total | **578** (569 at 08-03's close + 9), zero removed (CMP-01) |
| Skipped | **9** — 6 pre-existing `spawn-plan.win32.test.ts` + 3 new `kill-tree.win32.test.ts` |
| Passing | 569 (was 563) — the 6 new gate cases execute on every platform |
| `kill-tree.win32.test.ts` off Windows | `numTotalTests` 3, `numPendingTests` 3, no collection error |
| `kill-tree.win32.gate.test.ts` on POSIX | 6 passed, `numPendingTests` 0 |
| `grep -c 'Gate: the win32 kill-tree suite actually ran' ci.yml` | 1 |
| `grep -c 'Gate: the win32 spawn-plan suite actually ran' ci.yml` | 1 (Phase 7 untouched) |
| `grep -c 'win32-kill-tree-report.json'` / `'win32-report.json'` | 1 / 1 |
| `grep -c 'kill-tree.win32.test.ts' ci.yml` | 1 |
| `grep -c 'shell'` in the new suite | 0 |
| `grep -rn 'shell: *true' packages/ --include='*.ts'` | 0 (shipped Phase 7 gate, re-run) |
| `grep -rn 'process\.kill(-' …` comment-filtered | 0 (08-02's static gate, re-run) |

## Windows evidence — **NOT YET COLLECTED**

Stated as an absence rather than softened, in the `07-VALIDATION.md` § *Windows evidence* format the plan's `<output>` asks for:

| Field | Value |
|---|---|
| `windows-latest` run URL | **none — nothing was pushed during this plan** |
| `Gate: the win32 kill-tree suite actually ran` conclusion | **not run** |
| Gate's executed-count log line | **not emitted** |
| Measured `taskkill` exit code for an already-dead pid | **not measured** |
| Measured first stderr line | **not measured** |

The plan's `<output>` block asks for these values and for a follow-up that writes them into the reserved comment block in `kill-tree.win32.test.ts`. **That follow-up is owed and is now the phase's single largest open item.** The reserved block in the file is deliberately empty — an empty slot is visibly unfilled, a guessed number is not — and the ledger entry below is what keeps it visible after this SUMMARY scrolls out of context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] T-08-10's `<automated>` verify command cannot read its own report**
- **Found during:** T-08-10
- **Issue:** The command creates the report with `mktemp -t drift-kt-report.XXXXXX`, which on macOS yields a path with **no `.json` extension**, then reads it with `require(process.argv[1])`. Node loads an extensionless file as CommonJS JavaScript, so the run died with `SyntaxError: Unexpected token ':'` on the report's first key — while the report itself was perfectly correct (`numTotalTests` 3, `numPendingTests` 3).
- **Fix:** read the report with `JSON.parse(fs.readFileSync(path, "utf-8"))`, which is the exact shape `ci.yml`'s shipped gate step already uses. The `mktemp` discipline the plan's non-negotiables require is kept; only the reader changed.
- **Impact:** none on the artifact. The criterion's *numbers* were met as written on the first run.

**2. [Rule 3 - Blocker] `vitest/no-conditional-expect` rejected case 2's two-armed shape**
- **Found during:** T-08-10
- **Issue:** The plan specifies "if `process.env.SystemRoot` is unset on the runner … assert that arm instead". Written literally as an `if` with an `expect` and an early `return` in each branch, `pnpm lint` fails at `--max-warnings 0`. The rule is correct here rather than pedantic: a branch that returns early is a branch that can silently assert nothing, which is the exact vacuous-pass class this phase spends its gates guarding against.
- **Fix:** both arms are described as **data** and compared in ONE unconditional `expect` through a ternary. The arm choice still logs which arm was taken, so the measurement stays readable. Nothing was relaxed — the absolute arm still asserts both `endsWith("\\System32\\taskkill.exe")` and `existsSync`.
- **Commit:** `9e1214f`

**3. [Rule 1 - Correctness] The ci.yml comment restated the suite filename and broke its own grep criterion**
- **Found during:** T-08-11
- **Issue:** The step was first written with the suite path in both the comment header and the invocation, making `grep -c 'kill-tree.win32.test.ts' ci.yml` return **2** against the criterion's **1**. Phase 7's shipped step has the same doubling (its own count is 2), so copying it "structurally in full" reproduces the doubling.
- **Fix:** the comment names "the win32 kill-tree suite named below" and the path is spelled once, at the invocation, with a sentence saying why. The criterion is met as written rather than relaxed, and the file now counts the gate rather than the prose.
- **Commit:** `0df5e8d`

### Recorded readings that differ from the plan's prediction

**4. [Recorded, not fixed] The Phase-7-deletion direction turns the Phase 8 collision case red too**
- The criterion predicts that deleting the Phase 7 step "turns **only** `spawn-plan.win32.gate.test.ts` red". Measured, it also turns the Phase 8 sixth case red — because that case asserts, as the plan's own `<action>` text requires, that the workflow contains **both** step names and **both** report filenames.
- This is **stronger** than the criterion, not weaker: the essential property ("neither gate can be satisfied by the other's step, and neither step can be deleted with both suites green") holds in both directions, and the sixth case is bidirectional by design. Recorded rather than "fixed" by weakening the assertion, which would have reopened half the collision.

---

**Total deviations:** 3 auto-fixed (1 × Rule 3 blocker, 2 × Rule 1 correctness) + 1 recorded reading. **Impact:** no scope change and no criterion relaxed. Two were forced by a lint rule and a grep count; one corrects a defect in the plan's own verify command.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run kill-tree.win32.test.ts --reporter=json` off Windows | `{ total: 3, pending: 3 }` — collected, not errored |
| `pnpm exec vitest run kill-tree.win32.gate.test.ts` | 6 passed, 0 pending |
| `pnpm exec vitest run` | 569 passed, 9 skipped (**578**), grown from 569, **zero removed** |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` | exit 0 |
| `grep -c 'describe.skipIf(process.platform !== "win32")'` in the suite | 1 |
| `grep -c 'buildKillTreePlan'` in the suite | 6 (floor 2) |
| `grep -c '"/pid"'` / `grep -c 'shell'` in the suite | 0 / 0 |
| `grep -c '\[measurement\]'` in the suite | 4 (floor 1) |
| `grep -cE 'expect\([^)]*code[^)]*\)\.toBe\([0-9]'` in the suite | 0 |
| Collision falsifiability, both directions | verified by hand, table above, both restored |
| `git status --short` after each restore | clean of plan files |

## Known Stubs

None in the code sense — no placeholder value, no hardcoded empty return, no unwired data path.

**One deliberate empty slot, and it is not a stub:** the reserved comment block in `kill-tree.win32.test.ts` case 3 holds `RUN`, `CODE` and `TEXT` placeholders for the dead-pid measurement. It is empty because the measurement has not been taken, and D-P4b specifies that it stays empty until a real `windows-latest` run fills it. Filling it with a plausible community-knowledge value (0/128/1) is the precise failure this plan exists to avoid.

The 9 skips in the full-suite total are two deliberate platform gates, not skipped tests: 6 pre-existing `spawn-plan.win32.test.ts` cases and this plan's 3.

## Broken-Windows Ledger

| Entry | Kind | Item |
|---|---|---|
| **12** | `unrun-verify` | The three win32 kill-tree cases have never executed: they are `skipIf`-gated and no `windows-latest` run exists for them yet. The reserved dead-pid exit-code block is empty and the run URL is unfilled. |

Entry **11** (`unmet-truth`, A1/A6 OPEN) is unchanged and untouched by this plan.

## Issues Encountered

**The Windows half of SC-3 is now *runnable*, not *run*.** Everything this plan produced is a vehicle. Until a `windows-latest` run executes it, LIF-01's Windows mechanism has exactly the evidence it had before: a unit contract over the argv (08-02) and source analysis. The honest statement is that this plan built the apparatus and took no reading. Ledger entry 12 exists so that gap survives context loss.

**The three gaps `08-VALIDATION.md` § *Vehicle caveat* names are NOT narrowed by this plan, and the suite's own preamble says so before any result is cited:**
1. `index.ts`'s wiring is unproven — it declares no `caido:plugin` alias and cannot be imported by any test this project can run.
2. Caido's LLRT is unproven — no CI leg executes it.
3. A real Drift turn on a real Windows desktop is unproven — ROADMAP Phase 10 SC-5 owns it, and that criterion correctly guards the substitution trap: another green CI run does not satisfy it.

**A1 and A6 remain OPEN — not measured**, exactly as 08-02 and 08-03 recorded. Nothing in this plan touches them: `taskkill /t` walks the parent-child relation rather than process groups, so both are POSIX questions and this plan is Windows-only. No statement here should be read as narrowing either.

**`08-SECURITY.md` AR-01 is now referenced from a second place.** `index.ts` already points at it (08-03), and case 1's comment in the new suite now does too. Plan 08-05 must actually create that entry, or two files point at a document section that does not exist.

## Next Phase Readiness

`08-05` is unblocked and inherits:

- The measured suite total **578** with 9 skips, for its validation-map fill.
- Two owed items it should carry: **AR-01 must exist in `08-SECURITY.md`** (now referenced from two places), and the marked correction `08-VALIDATION.md`'s LLRT-trap row still needs (T-08-13, owed since 08-02).
- **A follow-up this plan opens:** after the first `windows-latest` run, write the measured `taskkill` exit code, its first stderr line and the run URL into the reserved block in `kill-tree.win32.test.ts`, so the number lives next to the code that produced it rather than only in a planning document.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-24*

## Self-Check: PASSED

- Both created files verified present on disk (`kill-tree.win32.test.ts`, `kill-tree.win32.gate.test.ts`); `ci.yml` present and valid YAML
- Both task commits verified in `git log` (`9e1214f`, `0df5e8d`)
- Every task `<acceptance_criteria>` re-run at final state; all pass (with the three literal/shape corrections recorded as deviations 1–3 — no number relaxed, and deviation 4 recorded as a stronger-than-specified reading)
- Plan-level `<verification>` block re-run at final state; every locally-runnable line passes. The one line that is NOT locally runnable — the `windows-latest` leg's conclusions and the `[measurement]` log — is recorded as **not collected** above rather than reported as passing
- Both collision falsifiability directions verified by hand and restored; `git status --short` confirmed clean of plan files after each
- Repo-wide security gates from prior plans re-run and unchanged: `shell: true` = 0, comment-filtered `process.kill(-` = 0
