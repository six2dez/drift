---
phase: 08-process-lifecycle
plan: 05
subsystem: infra
tags: [process-lifecycle, phase-close, roadmap-amendment, validation-contract, security-register, attestation, lif-01, lif-02]

requires:
  - phase: 08-process-lifecycle
    provides: "the measured census from 08-03 (killTree( = 9), the suite total from 08-04 (578), and the two AR-01 source pointers that this plan's 08-SECURITY.md had to make resolve"
  - phase: 07-provider-spawn-registration
    provides: "07-SECURITY.md and 07-VALIDATION.md — the house formats this plan's two artifacts follow, including the marked-correction convention"
provides:
  - "ROADMAP SC-2 amended in place: names detached: true + a spawned kill process-group signal, and the source-verified LLRT reason the canonical spelling was unusable"
  - "CLAUDE.md + .planning/codebase/CONVENTIONS.md — kill-plan.ts as the sixth pure-helper row, in BOTH the rendered block and its generation source"
  - "08-VALIDATION.md — zero {pending} rows, four seed corrections marked as corrections, an honest nyquist_compliant: false with a named Compliance declaration"
  - "08-SECURITY.md — the 21-row register roll-up, three identified accepted residuals (AR-01/02/03), and T-08-01 closed by attestation with its basis recorded"
affects: [LIF-01, LIF-02, SC-2, SC-3, SC-4, SC-5, phase-10-SC-5]

actuals:
  tokens: 34000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Attestation-vs-measurement labelling: a human confirmation that carries no captured values is recorded as an attestation, with its unexcluded confounders named, so a later reader can re-evaluate the closure instead of inheriting a bare status"
    - "Marked seed correction: a validation seed that turns out wrong is recorded in a named Corrections section with the measured value beside the seeded one, never silently overwritten"
    - "Amend-in-place with the mechanism AND the reason: a success criterion naming an unusable mechanism is amended to name what shipped plus why the original spelling throws, so the amendment stops the intent while the static gate stops the code"

key-files:
  created:
    - .planning/phases/08-process-lifecycle/08-SECURITY.md
  modified:
    - .planning/ROADMAP.md
    - CLAUDE.md
    - .planning/codebase/CONVENTIONS.md
    - .planning/phases/08-process-lifecycle/08-VALIDATION.md

key-decisions:
  - "T-08-01 moved to closed and threats_open to 0 — but labelled 'closed by attestation', because the maintainer replied approved without supplying the pgrep counts. The basis, including the unexcluded CLI-cleanup confounder, is written into 08-SECURITY.md rather than left implicit"
  - "The timeout path is recorded as NOT exercised. The cancel-path attestation is not allowed to imply it"
  - "nyquist_compliant stays false. Two validation rows (T-08-10, T-08-11) are unexecuted and one windows-latest run closes both; a validated document with a false compliance flag is how audit-milestone tells PARTIAL from NOT-VALIDATED"
  - "A fourth seed correction (C4) was added beyond the plan's three: the first four rows' Plan column read {01} and the Platform note's line count read 5,240, neither spelled {pending}, so both would have been changed invisibly"
  - "No must_haves block in this plan declares SC-3 PARTIAL — maintainer decision D-02 routes that judgment to /gsd-verify-work; the artifacts state what evidence each half has and stop there"

patterns-established:
  - "Confounder-naming in a security closure: state not just what was observed but what alternative explanation the observation fails to exclude, and what measurement would exclude it"
  - "Sign-off checklists that carry unticked items for known gaps, so the remaining work is visible in the checklist rather than only in prose"

requirements-completed: [LIF-01, LIF-02]

coverage:
  - id: D1
    description: "ROADMAP SC-2 names the mechanism that actually shipped and the source-verified reason the canonical spelling was unusable, so a later reader cannot 'fix' the code back to the broken form"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "grep -c '^### Phase' .planning/ROADMAP.md = 24 (unchanged); 'Amended 2026-08-24 during Phase 8 planning' = 1 (baseline 0); 'Underflow' = 2 (baseline 1); 'a5b021c' = 1 (baseline 0); '05-CONTEXT.md' = 5 (baseline 4); git diff --stat = 1 insertion / 1 deletion, confined to the Phase 8 block"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Pure Helpers Split table carries kill-plan.ts as its sixth row in BOTH CLAUDE.md and its generation source, plus a note that the table is otherwise known-incomplete"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "grep -c 'kill-plan.ts' CLAUDE.md = 1 and .planning/codebase/CONVENTIONS.md = 1; grep -c 'fs-retry.ts' CLAUDE.md = 1 while the fs-retry table-row form = 0, proving the note was added rather than the rows"
        status: pass
    human_judgment: false
  - id: D3
    description: "08-VALIDATION.md's Per-Task Verification Map has zero {pending} task IDs, and every wrong seed is marked as a correction rather than silently overwritten"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "grep -c '{pending}' = 0; grep -c 'T-08-' = 33 (floor 15); '## Corrections to the seed' = 1 with four C-headings; 'wave_0_complete: true' = 1; 'status: validated' = 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "08-SECURITY.md exists and records the residuals this phase accepts rather than mitigates, each with the reason it is not mitigable here and the phase or command that owns it next — and index.ts's AR-01 pointer now resolves"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "test -f 08-SECURITY.md; frontmatter asvs_level: 1 + block_on: high; grep -c 'AR-0' = 12 (floor 3); 'T-08-' = 32 (floor 10); 'OQ-3' = 3 (floor 1); all four high-rated threats (T-08-01/06/12/15) carry disposition mitigate"
        status: pass
    human_judgment: false
  - id: D5
    description: "The full automated close is green with a grown, nothing-removed test count and an empty frontend tripwire"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "pnpm exec vitest run = 578 (569 passed / 9 skipped), grown from 534, zero removed — measured directly by git diff --diff-filter=D over packages/**/*.test.ts across 1b3fde6..HEAD (empty) and a test-file diff of 1,362 insertions / 0 deletions"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck exit 0; pnpm lint exit 0; git diff --stat 1b3fde6 -- ChatView.cancel.test.ts ChatView.vue empty; comment-filtered LLRT-trap scan = 0; repo-wide shell: *true = 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "On the maintainer's own macOS Caido, a real cancel leaves zero mcp-server.mjs processes"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-05-PLAN.md T-08-14 how-to-verify steps 1-5; maintainer replied `approved` 2026-08-24"
        status: pass
    human_judgment: true
    rationale: "SATISFIED BY ATTESTATION, NOT BY RECORDED MEASUREMENT. The maintainer replied `approved`, which under the checkpoint's stated contract means a zero after-Stop count against a non-zero before-Stop count — but supplied NO numeric values, so neither count was captured. The pre-fix control in 08-SPIKE.md was never recorded either (Wave-0 waiver), so there is no measured before/after pair on that machine and one confounder is unexcluded: the provider CLI's own cleanup could explain a zero as readily as this phase's mechanism. The plan asked for a comparison; what exists is an attested after-state. Scope: one machine, one Caido build, one CLI, cancel path only."
  - id: D7
    description: "The timeout path leaves no orphan either"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-05-PLAN.md T-08-14 how-to-verify step 6"
        status: unknown
    human_judgment: true
    rationale: "NOT EXERCISED. The maintainer did not report the timeout path. The plan required it be reported or explicitly declared unexercised, and never inferred from the cancel result — so it is recorded here as unexercised. The timeout handler routes through the same killTree call as cancel, which is a source-level argument, not an observation."

duration: 42 min
completed: 2026-08-24
status: complete
---

# Phase 8 Plan 05: Phase Close — the Artifacts Catch Up With the Code Summary

**SC-2 now names the mechanism that shipped instead of one that throws under Caido's runtime, the validation contract names an owning task for every row and marks four wrong seeds as corrections, `08-SECURITY.md` makes two dangling `AR-01` source pointers resolve — and the phase's gating hardware check passed as a maintainer attestation carrying no numbers, which is recorded as exactly that.**

## Performance

- **Duration:** 42 min
- **Tasks:** 3 of 3
- **Files created/modified:** 5 (1 created, 4 modified)

## Accomplishments

- **Amended ROADMAP SC-2 in place, with the mechanism *and* the reason.** The original clause said "process-group signalling", whose canonical spelling raises an `Underflow` conversion error under Caido's LLRT — `process.kill`'s `pid` is a Rust `u32` and rquickjs range-checks through `f64` — while working perfectly under Node, the only vehicle any CI leg here runs. Left unamended, the criterion was a standing instruction to "fix" the code back to a spelling that is green on all five legs and broken on every real Caido install. The amendment carries the pinned commit `a5b021c` for the `detached` half rather than asserting the behaviour, and explains why the static gate is comment-stripped. **The static gate stops the code; the amendment stops the intent.**
- **Added `kill-plan.ts` to both copies of the Pure Helpers Split table.** Editing only `CLAUDE.md` would have been silently reverted on the next regeneration from `.planning/codebase/CONVENTIONS.md` — which is precisely how a documentation row disappears with nobody noticing. Both carry a note that the table is otherwise known-incomplete (it omits `platform.ts`, `spawn-plan.ts`, `mcp-server-spec.ts`, `fs-retry.ts`) and that the refresh belongs to `/gsd-docs-update`, not to this phase.
- **Filled all 15 validation rows and demonstrated the seed's central error first-hand.** The seeded LLRT-trap gate was a raw `grep -rc 'process\.kill(-'`. Run against the shipped tree it returns a **non-zero** count — one hit, `kill-plan.ts:199`, a whole-line comment quoting the banned form by house rule precisely so a future reader does not reintroduce it. A gate that goes red against its own documentation is a gate that gets deleted. Measured and quoted in the corrections section rather than asserted.
- **Corrected the `killTree(` call-site count from the seed's 5 to the measured 9**, with the enumeration that explains the gap: `requestGracefulShutdown` and `cancelCliMessage` each carry two rungs, which the seed counted as one site each.
- **Created `08-SECURITY.md`, which two source files were already pointing at.** `index.ts` (08-03) and `kill-tree.win32.test.ts` (08-04) both cite `AR-01`; before this plan that pointer resolved to nothing. The register rolls up 21 distinct rows from all five `<threat_model>` blocks and records three accepted residuals — AR-01 (`/T`'s dead-intermediate-parent hole), AR-02 (OQ-3's start-up orphan-*process* sweep, deliberately out of scope because killing by image name is a blast-radius decision needing its own discuss-phase), AR-03 (no real revocation) — each with the reason it is not mitigable here and who owns it next.
- **Declared the phase's compliance honestly.** `nyquist_compliant` stays `false` with a named Compliance declaration saying which two rows are not green and that **one `windows-latest` run** closes both.

## Task Commits

| Task | Name | Type | Commit |
|---|---|---|---|
| T-08-12 | Amend ROADMAP SC-2 in place, add the sixth pure-helper row | auto | `1f3b486` |
| T-08-13 | Fill the validation task IDs and write `08-SECURITY.md` | auto | `d2d502b` |
| T-08-14 | Confirm on real hardware that a cancel leaves no token-bearing orphan | checkpoint:human-verify | `08cbce0` (the artifact updates the attestation triggered) |

## T-08-14 — the hardware check, recorded as an attestation

**This section is the reason the plan existed, and its distinction is load-bearing. A future reader must be able to tell "the maintainer confirmed zero orphans" from "these specific counts were observed and written down." What happened is the first.**

The maintainer replied **`approved`** on 2026-08-24. Under the checkpoint's stated contract that means, and only means:

| Reading | Value |
|---|---|
| Before-Stop `pgrep -f mcp-server.mjs \| wc -l` | **not captured** — attested non-zero |
| After-Stop `pgrep -f mcp-server.mjs \| wc -l` (~5 s) | **not captured** — attested **zero** |
| Caido version string | not recorded |
| Timeout path (`processTimeoutSeconds` elapses instead of Stop) | **NOT REPORTED → recorded as NOT EXERCISED** |
| `08-SPIKE.md` § *Control* pre-fix baseline | **never recorded** — the Wave-0 checkpoint was waived on 2026-08-24 without readings |

Nothing above is inferred, estimated or reconstructed.

**Three consequences, none rhetorical:**

1. **Not reproducible or auditable.** No before-count, no after-count, no build string is attached to this closure. A future regression cannot be diffed against it.
2. **One confounder is unexcluded: the provider CLI's own cleanup.** A zero after-count proves the orphan is gone. It does **not** prove *this phase's mechanism* removed it — Claude Code may terminate its own MCP child on shutdown. The thing that would have excluded this is the pre-fix control (the same procedure against the *old* code, showing a non-zero after-count), and that was never recorded. So there is **no measured before/after pair on that machine**; there is one attested after-state. The plan asked for a comparison and got a reading.
3. **Scope is one machine, one Caido build, one provider CLI, one path.** The timeout path is unexercised and the cancel attestation does not carry to it.

**What it closes.** The *outcome* claim T-08-01 states — after a cancel, no token-bearing MCP child survives — on the runtime users actually run. That is real evidence and it is the evidence this phase's own gate was designed to collect. `threats_open` moved **1 → 0** accordingly.

**What it does not close.** A1 and A6 as *mechanism* claims, for the confounder in (2). Both remain **OPEN — not measured**. Ledger entry **11** is untouched.

## Automated close — measured, not asserted

| Check | Result |
|---|---|
| `pnpm exec vitest run` | **578 tests** — 569 passed, 9 skipped; 38 files passed / 2 skipped |
| Delta from the 534 baseline | **+44** (534 → 561 → 569 → 578) |
| Tests removed | **zero**, measured directly: `git diff --diff-filter=D --name-only 1b3fde6 HEAD -- 'packages/**/*.test.ts'` is **empty**, and the test-file diff is **1,362 insertions / 0 deletions** (CMP-01) |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `git diff --stat 1b3fde6 -- ChatView.cancel.test.ts ChatView.vue` | **empty** (SC-5 tripwire) |
| Comment-filtered LLRT-trap scan | **0** |
| Repo-wide `shell: *true` | **0** |
| `kill-tree.posix.test.ts` | 2/2 — the control asserts the grandchild *surviving* without the mechanism, then the proof kills it |

The 9 skips are two deliberate platform gates, not skipped tests: 6 `spawn-plan.win32.test.ts` + 3 `kill-tree.win32.test.ts`.

**`windows-latest` evidence — stated as the absence it is**, unchanged from `08-04-SUMMARY.md`: run URL **none, nothing was pushed**; the `Gate: the win32 kill-tree suite actually ran` conclusion **not run**; the gate's executed-count log line **not emitted**; the `taskkill` dead-pid exit code and first stderr line **not measured**. The reserved block in `kill-tree.win32.test.ts` is deliberately still empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Three acceptance greps counted their own prose**

- **Found during:** T-08-13
- **Issue:** The criteria require `grep -c '{pending}'` = 0, `grep -c 'wave_0_complete: true'` = 1 and `grep -c 'status: validated'` = 1. My first draft explained each convention *by quoting the literal* in prose — so the counts measured 2, 2 and 2 against a correct document. The same class of defect as 08-02's deviation 3 and 08-04's deviation 3: a document that describes its own gate's needle breaks that gate.
- **Fix:** the three prose mentions now *describe* rather than quote — "the brace-placeholder convention the seed used for unknown task IDs", "the `wave_0_complete` flag is set true in the frontmatter", "the `status` field in the frontmatter reads **validated**". No meaning lost; the frontmatter remains the single literal occurrence of each.
- **Verification:** re-measured 0 / 1 / 1.
- **Committed in:** `d2d502b`

**2. [Rule 2 - Missing critical] A fourth seed correction was owed and not listed**

- **Found during:** T-08-13
- **Issue:** The plan names three corrections. Two further seeded values were wrong but **not spelled `{pending}`**, so changing them would have been invisible — exactly what the file's own convention forbids. The first four rows' Plan column read `{01}`, but those rows are `kill-plan.test.ts` assertions emitted by T-08-05 in **plan 02**; plan 01 was the Wave-0 spike and shipped no test file. And the Platform note's `index.ts` line count read **5,240** against a measured **5,562**.
- **Fix:** added as correction **C4**, carrying both figures labelled. The plan's three remain C1-C3, so the acceptance criterion that the section names all three is met as written.
- **Committed in:** `d2d502b`

### Recorded readings that differ from the plan's expectation

**3. [Recorded, not fixed] The closing confirmation is an attestation, not the comparison the plan specified**

- The plan's `<how-to-verify>` step 7 requires the counts be reported "against the numbers `08-SPIKE.md` recorded on this same machine before the fix, so the confirmation is a **comparison**, not an isolated zero". Neither half of that comparison exists: `08-SPIKE.md`'s control was never recorded (Wave-0 waiver), and the maintainer supplied no counts with `approved`.
- Recorded rather than resolved, because the only honest alternatives were to fabricate numbers or to overrule the maintainer's `approved`. The distinction is written into `08-SECURITY.md`, `08-VALIDATION.md` and this SUMMARY in the same words, and `08-SPIKE.md` still holds the runnable four-step procedure and the probe commit `68199fa` if it is ever wanted as a measurement.

---

**Total deviations:** 2 auto-fixed (1 x Rule 1 correctness, 1 x Rule 2 missing critical) + 1 recorded reading. **Impact:** no scope change and no criterion relaxed. Both fixes were forced by the plan's own greps or by the artifact's own correction convention.

## Verification Results

| Check | Result |
|---|---|
| `grep -c '{pending}'` in `08-VALIDATION.md` | 0 |
| `grep -c 'T-08-'` in `08-VALIDATION.md` | 33 (floor 15) |
| `## Corrections to the seed` + four `### C<n>` headings | 1 / 4 |
| `wave_0_complete: true` / `status: validated` | 1 / 1 |
| `test -f 08-SECURITY.md`, `asvs_level: 1`, `block_on: high` | present |
| `grep -c 'AR-0'` / `'T-08-'` / `'OQ-3'` in `08-SECURITY.md` | 12 / 32 / 3 (floors 3 / 10 / 1) |
| All four high-rated threats carry disposition `mitigate` | T-08-01, T-08-06, T-08-12, T-08-15 |
| `grep -c '^### Phase' .planning/ROADMAP.md` | 24, unchanged |
| `Amended 2026-08-24 during Phase 8 planning` / `Underflow` / `a5b021c` / `05-CONTEXT.md` | 1 / 2 / 1 / 5 (baselines 0 / 1 / 0 / 4) |
| `git diff --stat -- .planning/ROADMAP.md` at T-08-12 | 1 insertion, 1 deletion — Phase 8 block only |
| `grep -c 'kill-plan.ts'` CLAUDE.md / CONVENTIONS.md | 1 / 1 |
| `grep -c 'fs-retry.ts'` CLAUDE.md vs its table-row form | 1 vs 0 |
| Full suite / typecheck / lint | 578 green / exit 0 / exit 0 |
| SC-5 tripwire | empty |
| LLRT-trap (comment-filtered) / `shell: *true` | 0 / 0 |

Every pre-edit ROADMAP baseline the plan-checker verified was **re-measured before editing** and all five still held, so no marked correction was owed on them.

## Known Stubs

None. This plan wrote no code.

## Broken-Windows Ledger

| Entry | Kind | Status after this plan |
|---|---|---|
| **11** | `unmet-truth` | **OPEN, untouched.** A1 and A6 remain not measured. The T-08-14 attestation does not close them — see the confounder above. |
| **12** | `unrun-verify` | **OPEN, untouched.** The three win32 kill-tree cases have never executed; the reserved dead-pid block is empty and no run URL exists. |

No new ledger entry was opened. The attestation's weakness is recorded in `08-SECURITY.md` as part of T-08-01's closure basis rather than as a fresh defect.

## Issues Encountered

**The phase's central mechanism is still unproven on the runtime it ships into.** The T-08-14 attestation is real evidence about the *outcome* and it is what the phase's gate asked for; it is not evidence about the *mechanism*, because the CLI's own cleanup is an unexcluded alternative explanation and the control that would have excluded it was waived. Plan 08-03 took the number of sites depending on A1 from two to nine. OQ-2's single-pid rung remains the only protection, and it degrades a total regression into a partial one rather than preventing one.

**SC-3's Windows behavioural half is evidenced only as a mechanism proof written for a CI runner that has never executed it.** Stated explicitly because the plan's `<output>` requires it: what exists is a unit contract over the `taskkill` argv (T-08-05), source analysis, and a `skipIf`-gated suite plus a `--reporter=json` gate that have never run. Real-hardware confirmation is owned by **ROADMAP Phase 10 SC-5**, whose text already guards the substitution trap — another green CI run does not satisfy it.

**No verdict is pre-declared for SC-3.** Per maintainer decision **D-02**, no `must_haves` block in this phase contains the word PARTIAL. The artifacts state what evidence each half has; `/gsd-verify-work` rules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 8 is code-complete and its artifacts agree with its code. Three things carry forward:

1. **One `windows-latest` run** closes both warning-flagged validation rows, fills the reserved dead-pid block in `kill-tree.win32.test.ts`, and retires ledger entry 12.
2. **`08-SPIKE.md`'s four-step procedure** remains runnable (probe at `68199fa`) and would settle A1, A6 and the T-08-14 confounder in one sitting, retiring ledger entry 11.
3. **ROADMAP Phase 10 SC-5** owns the Windows real-machine confirmation, and `08-SECURITY.md` AR-01 names it as the only place that residual could be observed.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-24*

## Self-Check: PASSED

- Created file verified present on disk (`08-SECURITY.md`); all four modified files present
- All three task commits verified in `git log` (`1f3b486`, `d2d502b`, `08cbce0`)
- Every task `<acceptance_criteria>` re-run at final state; all pass (with the two literal/scope corrections recorded as deviations 1 and 2 — no number relaxed)
- Plan-level `<verification>` block re-run at final state; every locally-runnable line passes
- The one line that is NOT locally runnable — the maintainer's `pgrep` counts — is recorded as an **attestation with no captured values**, and the timeout path as **not exercised**, rather than reported as measured
