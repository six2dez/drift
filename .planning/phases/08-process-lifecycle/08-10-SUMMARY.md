---
phase: 08-process-lifecycle
plan: 10
subsystem: planning-records
tags: [gap-closure, marked-corrections, security-register, accepted-residuals, verdict-gate, contract-alignment]
status: complete

# Dependency graph
requires:
  - phase: 08-process-lifecycle (plans 08-06…08-09)
    provides: "the three source carriers already corrected to the measured A1/A6 verdicts (08-06), the argv-marker reap and its idle gate (08-06/08-07), the derived Windows system root (08-08), the owner-only temp modes (08-09), and a clean suite at 686/677/9"
  - phase: 08-process-lifecycle (08-UAT.md, 2026-08-27)
    provides: "the only readings this plan may cite — test 1 (A1), test 2 (A6), test 3 still pending, and gaps G-01…G-05"
provides:
  - "verdict-gate.sh — a repo-wide, exclusion-list, fail-closed scan proving no LIVING artifact presents A1 or A6 as unmeasured, across all three spellings of the stale verdict, with a historical-record immutability arm"
  - "A1 recorded CLOSED FAVOURABLY and A6 recorded FALSIFIED in all NINE carriers, each as a dated marked correction with its superseded text preserved"
  - "The unrunnable A6 command retired everywhere as an instruction — corrected in the two living references, annotated in the two executed plans, with the rule that decides which treatment applies written at each site"
  - "ROADMAP SC-2 stating what the code actually does; LIF-01 and LIF-02 stating what has and has not executed"
  - "AR-04, AR-05, AR-06, AR-07 and AR-08 — five accepted residuals, each with a named DECIDER distinct from its owner"
  - "The threat register rolled up from 21 to 51 rows, with T-08-03 re-rated medium → high on a measured condition"
  - "G-02 recorded as degraded-as-designed with its stale 08-01 prediction retired"
  - "COVERAGE.md — the reasoned no-external-API declaration, so the seal gate passes on a reason rather than an override"
  - "Broken-windows ledger entry 11 rewritten to the measured state in both representations; entry 12 untouched"
affects: [phase-09, phase-10, a future registration-focused phase entered through /gsd-discuss-phase]

actuals:
  tokens: 30200   # chars/4 over the realized diff (120,807 changed chars across 13 files)
  tasks: 3
  commits: 3

tech-stack:
  added: []   # no dependency; no source file under packages/ modified
  patterns:
    - "Exclusion-list scanning over inclusion-list enumeration wherever the census is the thing that keeps being wrong: an inclusion list fails OPEN by construction, an exclusion list fails CLOSED"
    - "Character-class ERE over fixed-string grep where the same claim is spelled more than one way, with the hyphen placed last inside the bracket so it stays a literal"
    - "A marked correction whose superseded text cannot live inline (a table cell, a JSON object, a YAML scalar) is preserved as a block quote in an adjacent prose block, never dropped"
    - "Owner and decider are different columns: an accepted risk at or above the blocking severity names who ACCEPTED it, not only who picks it up"

key-files:
  created:
    - .planning/phases/08-process-lifecycle/verdict-gate.sh
    - .planning/phases/08-process-lifecycle/COVERAGE.md
  modified:
    - .planning/phases/08-process-lifecycle/08-SPIKE.md
    - .planning/phases/08-process-lifecycle/08-VALIDATION.md
    - .planning/phases/08-process-lifecycle/08-SECURITY.md
    - .planning/phases/08-process-lifecycle/08-VERIFICATION.md
    - .planning/phases/08-process-lifecycle/08-RESEARCH.md
    - .planning/phases/08-process-lifecycle/08-01-PLAN.md
    - .planning/phases/08-process-lifecycle/08-05-PLAN.md
    - .planning/phases/08-process-lifecycle/deferred-items.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/WINDOWS.md
    - .planning/STATE.md

key-decisions:
  - "verdict-gate.sh is a repo-wide scan with a four-member exclusion list, NOT a list of carriers. The census was wrong three times during planning (four → seven → nine) and a fourth time in the plan's own prose; an inclusion-list loop cannot detect a carrier absent from its own list, so it fails OPEN. Two real files (WINDOWS.md and STATE.md) were missing from an earlier draft's list and would have shipped stale under a green gate."
  - "The stale pattern is the ERE `OPEN[[:space:]]*[,—-][[:space:]]*not measured`, covering em dash, comma and ASCII hyphen. Measured on the uncorrected tree: an em-dash-only fixed string scores 0 on BOTH 08-SECURITY.md and WINDOWS.md — passing vacuously while both stale claims stand — and finds 11 of the 15 hits overall."
  - "Dated SUMMARY files are historical records and are NOT rewritten. ARM C asserts that class is unmodified, so its exclusion from ARM A is checked in both directions rather than trusted."
  - "LIF-01 and LIF-02 were NOT marked complete, even though `requirements.ready-ids` returns 2/2 ready now that this plan is the last declaring plan. Marking them would re-tick the boxes Task 2 unticked in the same plan and would be the exact failure threat T-08-46 names."
  - "AR-05: awaiting killTree in cleanupMcpRuntime is REJECTED, and not for convenience — awaiting a spawned killer inside an RPC handler is the event-loop starvation CLAUDE.md names as an anti-pattern and the reason killTree is fire-and-forget (OQ-4). Recorded with what genuinely improved: the reap identifies its target by argv, so it is insensitive to losing that race."
  - "AR-07 does NOT say argv cannot distinguish sessions — that claim is false for claude-cli and copilot-cli, whose args array Drift authors itself. It is recorded as a SCOPE decision (closing it means shipping two mechanisms, because gemini-cli/codex-cli share one registration), not as a constraint."
  - "AR-06 is an accepted `high` under `block_on: high` and reads `six2dez (recorded decision GD-02)`. An accepted high with only an owner is a silent carry past the phase's own blocking gate, so `threats_open: 0` now carries a companion note naming it rather than leaving it to be inferred from a zero."
  - "08-SPIKE.md's superseded frontmatter is preserved in a body block quote, not as frontmatter comments, because the acceptance criterion forbids `A1: OPEN` / `status: not-run` in the frontmatter and the preservation rule requires the text to survive. Frontmatter-scoped is the only reading under which both hold."

patterns-established:
  - "Every gate authored here had its red input CONSTRUCTED and run, not asserted: four for verdict-gate.sh, two for Task 2's greps, two for Task 3's, and one for the entry-12 immutability tripwire. All restored, all confirmed clean afterwards."
  - "A criterion that passes at HEAD before any edit is not automatically vacuous — distinguish a PROGRESS gate (must move) from an IMMUTABILITY tripwire (must not). The tripwire is legitimate only if its red input is constructed; entry 12's was."

requirements-completed: []   # deliberately empty — see key-decisions and § Requirement status

coverage:
  - deliverable: "No LIVING artifact presents A1 or A6 as unmeasured; a tenth carrier introduced anywhere fails the gate rather than escaping it"
    human_judgment: false
    verification:
      - kind: command
        ref: "bash .planning/phases/08-process-lifecycle/verdict-gate.sh — exit 0 (ARM A, ARM B, ARM C)"
        status: pass
      - kind: command
        ref: "RED: a tenth carrier named by no list (08-NEWCARRIER-test.md) — ARM A names it and fails"
        status: pass
      - kind: command
        ref: "RED: em-dash-only fixed string scores 0 on 08-SECURITY.md and WINDOWS.md at HEAD while both are stale (11 of 15 hits found vs 15)"
        status: pass
      - kind: command
        ref: "RED: both block-quote dialects (`> ` and `// > `) strip; the same sentence unquoted goes red"
        status: pass
  - deliverable: "Dated SUMMARY files are unmodified and the rule separating a living reference from a historical record is written down"
    human_judgment: false
    verification:
      - kind: command
        ref: "verdict-gate.sh ARM C — git diff --stat HEAD over '*-SUMMARY.md' is empty"
        status: pass
      - kind: command
        ref: "RED: appending one line to 08-02-SUMMARY.md trips ARM C; restored byte-clean"
        status: pass
  - deliverable: "The unrunnable A6 command exists nowhere as an instruction; both executed plans keep their text with dated superseded markers"
    human_judgment: false
    verification:
      - kind: command
        ref: "grep -c 'pid,ppid,pgid,comm' is 0 in 08-VERIFICATION.md and 08-RESEARCH.md; 'pid,ppid,pgid,args' is 1 and 2"
        status: pass
      - kind: command
        ref: "SUPERSEDED >= 2 in 08-01-PLAN.md (3) and >= 3 in 08-05-PLAN.md (3); git diff shows 0 removed lines in both"
        status: pass
  - deliverable: "SC-2 states what the code does; LIF-01 and LIF-02 state what has and has not executed"
    human_judgment: false
    verification:
      - kind: command
        ref: "ROADMAP.md diff is one line (:312, SC-2) containing 'in addition'; SC-1/SC-3/SC-4/SC-5 byte-identical"
        status: pass
      - kind: command
        ref: "grep -c '\\[x\\] \\*\\*LIF-0' .planning/REQUIREMENTS.md is 0; RED: re-tick either and it returns 1"
        status: pass
  - deliverable: "Five accepted residuals with named deciders, the threat register rolled up, T-08-03 re-rated, G-02 recorded"
    human_judgment: false
    verification:
      - kind: command
        ref: "AR-01…AR-08 each parse to exactly 7 columns with a non-empty Accepted By distinct from Owner next"
        status: pass
      - kind: command
        ref: "AR-04/05/06/07 and 'recorded decision GD-02' each 0 at the pre-plan tree, non-zero now — every criterion non-vacuous"
        status: pass
  - deliverable: "Ledger entry 11 reflects the measurement in both representations; entry 12 is untouched"
    human_judgment: false
    verification:
      - kind: command
        ref: "entry 11 markdown description == JSON description == reason, diffed and reported (T-08-48)"
        status: pass
      - kind: command
        ref: "entry 12: 0 changed lines across all three commits in either representation; RED: mutating its kind takes the gate to 0"
        status: pass
  - deliverable: "COVERAGE.md closes the api-coverage seal gate on a reason rather than an override"
    human_judgment: true
    rationale: "Whether the seal-time gate accepts this declaration's FORM cannot be established here — the gate runs at ship time, not in this plan. The reasoning it restates is verifiable (the detector's matched sentence states a Win32 API is NOT available and NOT used; zero dependencies added phase-wide) but the acceptance is the gate's call."
  - deliverable: "The A1/A6 verdicts recorded here are the ones 08-UAT.md actually recorded, and the Control still reads as not taken"
    human_judgment: true
    rationale: "Fidelity to a source document is a reading judgment, not a machine check. Mechanically confirmed: the Control table is byte-unchanged and 08-UAT.md test 3 is still [pending]. Whether every quoted pid, pgid and field value matches the UAT verbatim is for a human to confirm against 08-UAT.md tests 1 and 2."

duration: 74 min
completed: 2026-08-27
---

# Phase 8 Plan 10: Contract Corrections and the Verdict Gate — Summary

Brought every living contract document in line with the 2026-08-27 measurements — A1 closed favourably, A6 falsified — and proved it with a repo-wide fail-closed scan that no forgotten carrier can slip past, then decided in writing the four questions the verifier and the UAT left open.

**Duration:** 74 min · **Tasks:** 3/3 · **Files:** 2 created, 12 modified · **Commits:** 3 · **Source files touched: 0**

---

## What shipped

### 1. `verdict-gate.sh` — and its shape is the deliverable, not the file

The gate is a **repo-wide scan of `.planning/` and `packages/` with a four-member exclusion list**, not a list of carriers. That inversion is the whole point.

The census of carriers was wrong **three times during planning** — four, then seven, then nine — and a fourth time inside the plan's own calibration prose. An inclusion-list loop can only ever open the files it already names, so a carrier missing from the list is invisible to it **by construction**: it fails OPEN, silently green. Two real files, `.planning/WINDOWS.md` and `.planning/STATE.md`, were absent from an earlier draft's list and would have shipped stale under a passing gate.

Three arms:

| Arm | Asserts | Proven red by |
|---|---|---|
| **A — discovery** | 0 live stale verdicts anywhere under `.planning/` or `packages/`, block-quote-stripped, outside the named exclusion list | a tenth carrier (`08-NEWCARRIER-test.md`) that no list names — the gate named it and failed |
| **B — positive content** | all nine carriers carry `2026-08-27`, and the eight that state an A6 verdict carry `FALSIFIED` | reverting either the WINDOWS.md or STATE.md correction — both named |
| **C — immutability** | the dated `*-SUMMARY.md` class is unmodified | appending one line to `08-02-SUMMARY.md` |

**The pattern is an ERE covering all three spellings**, `OPEN[[:space:]]*[,—-][[:space:]]*not measured`, with the hyphen last inside the bracket so it stays a literal. Measured against the uncorrected tree: an em-dash-only fixed string scores **0 on `08-SECURITY.md` and 0 on `WINDOWS.md`** — passing vacuously while both stale claims sit untouched — and finds **11 of the 15** hits overall.

The exclusion list has four members, each verified to actually carry the string rather than assumed to: `*-SUMMARY.md`, `*-PLAN.md`, `08-REVIEW-FIX.md`, and **`verdict-gate.sh` itself** (it defines the pattern, so a repo-wide scan would match its own source and be permanently, unfixably red). Every member carries a written reason at the site, because every member is a hole in the scan.

### 2. A1 and A6 recorded in all nine carriers

Four phase documents corrected here (`08-SPIKE.md`, `08-VALIDATION.md`, `08-SECURITY.md`, `08-VERIFICATION.md`); `.planning/WINDOWS.md` and `.planning/STATE.md` in Task 3; the three source files were corrected by plan 08-06 and are only **gated** here.

`08-SPIKE.md` moved off `status: not-run` with its A1 and A6 tables filled from the UAT verbatim — including a new section recording that **the spike's own conclusion inverted**: the file argued that the phase's single point of failure was a negative A1 and that OQ-2's single-pid rung was the only protection against it. A1 came back **positive**; the failure landed at **A6**, which that rung does not address because it signals the CLI rather than the child. The mechanism that does address it is the argv-marker reap plans 08-06/08-07 shipped, independent of process groups by construction.

**The Control table is deliberately unchanged, and that is a result.** `08-UAT.md` test 3 is still `[pending]`; completing it to match its neighbours is the precise fabrication threat T-08-49 exists to prevent.

### 3. The unrunnable A6 command — five sites, two treatments, the rule written at each

**Corrected in place** in `08-VERIFICATION.md` and `08-RESEARCH.md` — both are living references that later work *follows*, and a document that will be followed must be correct. `08-RESEARCH.md`'s A6 assumptions-log row also moved from *"medium-high, and untested"* to **measured FALSE**.

**Annotated, never rewritten** in `08-01-PLAN.md` (2 sites) and `08-05-PLAN.md` (3). Both diffs are **insertions only, 0 deletions** — an executed plan is the record of the instructions an executor actually received, and the G-03 finding is only legible while the plans still show what they said.

### 4. Contract corrections

**ROADMAP SC-2**: the "instead of today's single-pid ladder" clause was **stale, not the code relaxed** — shipped `killTree` keeps that rung on POSIX *in addition* (OQ-2), so the code does strictly more than the criterion asked. Diff is **one line**; SC-1, SC-3, SC-4, SC-5 byte-identical.

**REQUIREMENTS**: LIF-01 and LIF-02 unticked with dated qualifiers naming exactly what has no execution behind it, and both status rows now point at `08-VERIFICATION.md`.

### 5. The security register and five residuals

Register rolled up **21 → 51 rows**, identifiers and severities taken from each gap plan's own `<threat_model>` block rather than invented. **T-08-03 re-rated medium → high** with the reason in the mitigation cell: the empty-environment condition is measured, not hypothetical.

Five residuals, each with **all seven columns and a named decider distinct from the owner**:

| Risk | Subject | Decider |
|---|---|---|
| AR-04 | The win32 orphan class — three enumerator candidates rejected with reasons | six2dez (GD-02 scope boundary, T-08-26) |
| AR-05 | SC-4's completion-order clause — the await option rejected on runtime grounds | six2dez (recorded decision OQ-4) |
| AR-06 | Registration hygiene — an **accepted `high`** under `block_on: high` | **six2dez (recorded decision GD-02)** |
| AR-07 | The multi-session cancel window — previously in 08-07's prose only | six2dez (GD-02 scope boundary, T-08-50) |
| AR-08 | POSIX modes ignored on Windows — mirrored from 08-09's source note | six2dez (accepted at 08-09) |

**AR-02 was re-examined in place, not deleted**: its blast-radius objection is answered by the two-anchor adjacency pattern, its residual now has a measured instance (G-04), and plan 08-07's start-up reap closes the case it describes — leaving POSIX-only (AR-04) and start-up/teardown-not-continuous (AR-07).

**G-02** recorded as degraded-as-designed with no code change, and the stale 08-01 checkpoint prediction retired — that prediction *predates* the CR-02 fix that put handle identity before liveness.

### 6. Ledger, COVERAGE.md, deferred items

Entry 11 rewritten in **both** representations, diffed and confirmed identical (T-08-48). It **narrows rather than closes**: Claude Code is unmeasured and the Control was never taken, so `status` stays `open`. Entry 12: **0 changed lines** across all three commits in either representation.

`COVERAGE.md` states the reasoned no-external-API declaration with the detector-output citation beneath it, so the seal gate passes on a reason instead of an override.

---

## The eleventh vacuous gate: NOT found — and the audit that says so

Ten vacuous gates have surfaced in this phase, so every criterion this plan authored was measured against the **pre-plan tree** before being trusted:

| Criterion | At pre-plan tree | Now | Verdict |
|---|---|---|---|
| Task 1 scoped stale count (7 carriers) | **7** | 0 | non-vacuous |
| `grep -c 'pid,ppid,pgid,comm'` VERIFICATION / RESEARCH | **1 / 2** | 0 / 0 | non-vacuous |
| `SUPERSEDED` in 08-01 / 08-05 | **0 / 0** | 3 / 3 | non-vacuous |
| `[x] **LIF-0` | **2** | 0 | non-vacuous |
| `AR-04` / `AR-05` / `AR-06` / `AR-07` | **0** each | 6 / 2 / 7 / 6 | non-vacuous |
| `recorded decision GD-02` in 08-SECURITY.md | **0** | 6 | non-vacuous |
| `COVERAGE.md` exists | **absent** | present | non-vacuous |
| `verdict-gate.sh` exit | **1 (FAIL)** | 0 | non-vacuous |
| `grep -c '\| 12 \| 08 \| unrun-verify'` = 1 | **1** | 1 | **tripwire, not vacuous** — see below |

The last row is the interesting one. It returns its passing value at HEAD before any edit, which is the signature of a vacuous gate — but it is an **immutability tripwire**, not a progress gate: it asserts that entry 12 was *not* touched. That distinction is only legitimate if the red input exists, so it was constructed: mutating entry 12's `kind` takes the count to **0** and the gate red. Same category as ARM C. Recorded rather than waved through, because "it passed before I started" is exactly the sentence that preceded the previous ten.

---

## Deviations from Plan

### 1. [Rule 1 — Stale calibration figure in the plan] Task 1's scoped verify returns 7, not 12

- **Found during:** Task 1, before any edit.
- **Issue:** The Task 1 acceptance criterion states its seven-carrier scoped verify "returns `12` against the uncorrected tree". Measured at this plan's start: **7**.
- **Cause:** The 12 was taken *before* plan 08-06 wrapped the three source carriers in `// > ` block quotes, which moves 5 hits inside quotes where the strip removes them. 7 doc hits + 0 stripped source hits = 7.
- **Why this is NOT an eleventh vacuous gate:** 7 ≠ 0, so the gate was still red before the work and still proved it afterwards. The figure is calibration prose, not the contract.
- **Recorded, not worked around:** this is the **fifth** wrong census figure in a plan whose own thesis is that enumerated censuses cannot be trusted — which is precisely why `verdict-gate.sh` consumes no count anywhere. Broken-windows ledger entry **19**.

### 2. [Rule 2 — Missing critical functionality] The A1/A6 rows in `08-VERIFICATION.md`'s truths table were corrected, beyond "verdict text only"

- **Found during:** Task 1, while wiring ARM B.
- **Issue:** Task 1 scoped `08-VERIFICATION.md` to "VERDICT TEXT ONLY … lines 21 and 76". But the file's own A1 and A6 truth rows still read `⚠️ insufficient_spec (abstained)`, which is a *living* claim that the readings were never taken — the exact condition the plan's first must-have forbids, and one ARM B would have caught only if the word `FALSIFIED` happened to appear elsewhere in the file.
- **Fix:** both rows moved to the measured verdicts as marked corrections, with the superseded cells preserved inline.
- **Guarded against overreach:** the frontmatter `status: human_needed`, the score and all three `behavior_unverified_items` are **unchanged**, and a note now says explicitly that the score was *not* recomputed — re-scoring a verification report from later evidence would make it a different report.

### 3. [Rule 2] `AR-08` added for the Windows ACL trade-off

The plan asked in prose to "mirror the Windows ACL acceptance plan 08-09 recorded at the source as a residual row here too", without allocating an identifier. Added as **AR-08** with the same seven columns, so the register is genuinely the single place a reader can enumerate residuals.

### 4. [Rule 2] ROADMAP's 08-10 plan-list line said "all four carriers"

That line contradicted this plan's own truth. Corrected to "all NINE carriers", with the miscount history stated. Not a success criterion — SC-1…SC-5 are untouched apart from SC-2's amended clause.

### 5. [Rule 3 — Blocker] `WINDOWS.md`'s marked correction could not live inline, and the gate caught the first attempt

- **Found during:** Task 3, on the first full-gate run.
- **Issue:** My first entry-11 rewrite preserved the superseded text by quoting it inside the new `description` — which put the stale verdict back in **live** text. ARM A correctly went red on it. The ledger's two representations are a markdown table row and a JSON object, and **neither can carry a block quote**.
- **Fix:** the active description now points at a `## Marked corrections` section appended **after** the JSON fence, where the superseded `description` and `reason` are preserved verbatim as a block quote. Placed after the fence so no table or JSON parser is affected; confirmed by re-running `gsd-tools windows status`, which still parses the ledger, and by a subsequent `windows append` that preserved the section.
- **This is the gate doing its job on its own author**, and it is recorded rather than quietly fixed.

**Total deviations:** 5 — 1 stale-figure finding reported (Rule 1), 3 missing-record additions (Rule 2), 1 blocker resolved (Rule 3). **Impact:** no gate weakened, no criterion relaxed, no source file touched.

---

## Requirement status — reported, not forced

`requirements.ready-ids` for this plan returns **`2/2 requirement(s) ready to mark complete`**, which is correct as far as it goes: 08-10 is the last plan in the phase declaring LIF-01 and LIF-02, so the shared-ID gate no longer blocks them.

**They were deliberately NOT marked complete, and `requirements-completed` in this SUMMARY's frontmatter is empty.** Task 2 of this same plan *unticked* both boxes to agree with `08-VERIFICATION.md`'s `human_needed` verdict, and threat **T-08-46** — a requirement ticked complete without execution behind it — is one of this plan's own high-severity register rows. Running `requirements.mark-complete` here would re-tick the boxes ten minutes after unticking them and would take `grep -c '\[x\] \*\*LIF-0'` from 0 back to 2, failing this plan's own gate.

What each still lacks is concrete:

- **LIF-01** — built and unit-proven; **no `windows-latest` run has ever executed** `kill-tree.win32.test.ts` (3/3 pending everywhere). Ledger entry 12.
- **LIF-02** — built and behaviourally proven under Node; **A6 measured FALSE** for one provider; the argv-marker reap that closes it independently of process groups is itself covered by no executed assertion (ledger 13 and 15); Claude Code unmeasured.

---

## Verification

| Check | Result |
|---|---|
| `bash .planning/phases/08-process-lifecycle/verdict-gate.sh` | **exit 0** — ARM A, ARM B, ARM C |
| `grep -c 'pid,ppid,pgid,comm'` in 08-VERIFICATION.md / 08-RESEARCH.md | **0 / 0** (`args` spelling present: 1 / 2) |
| `grep -c '\[x\] \*\*LIF-0' .planning/REQUIREMENTS.md` | **0** |
| `.planning/WINDOWS.md` JSON block parses; entry 12 identical in both representations | **yes** — 19 entries; 0 changed lines on entry 12 across all three commits |
| `.planning/phases/08-process-lifecycle/COVERAGE.md` exists with a reasoned declaration | **yes** |
| `test -z "$(git diff --stat HEAD -- packages/)"` | **empty** — no source modified |
| `pnpm exec vitest run` | **686 total / 677 passed / 9 skipped**, 39 files passed / 2 skipped — exactly the 08-09 floor, zero removed |
| `pnpm -r typecheck` | **exit 0** |
| `pnpm lint` | **exit 0** |
| SC-5 tripwire — `git diff --stat 1b3fde6 -- ChatView.cancel.test.ts ChatView.vue` | **0 bytes** |
| ROADMAP diff | **1 line** (`:312`, SC-2); SC-1/3/4/5 byte-identical |
| STATE.md diff | **exactly the two A1/A6 bullets** (4 insertions, 2 deletions) |
| 08-01-PLAN.md / 08-05-PLAN.md diffs | **insertions only, 0 deletions** in both |
| AR-01…AR-08 column parse | **8/8 rows at exactly 7 columns**, `Accepted By` non-empty and distinct from `Owner next` |

---

## Known Stubs

**None.** This plan changes no code and leaves no placeholder, no `TODO`, no unwired component. `verdict-gate.sh` and `COVERAGE.md` are both complete and both exercised — the gate by four constructed red inputs, the declaration by the detector citation it restates.

---

## Issues Encountered

**None blocking.** The one hard stop — the `WINDOWS.md` marked correction failing ARM A — was caught by this plan's own gate, diagnosed and resolved inside Task 3 (deviation 5).

---

## What this plan explicitly did NOT close

Stated so a reader does not mistake a records plan for a measurement:

- **Claude Code's A6 reading.** The falsification is one provider (Codex), on an instance Drift did not spawn. The active provider remains unmeasured, and `08-SPIKE.md` § *Step 3* is the procedure.
- **The Control.** Never taken, so the T-08-14 attestation is still an isolated zero with the CLI-cleanup confounder unexcluded. Ledger 11 stays `open` for exactly these two reasons.
- **The `windows-latest` leg.** Ledger 12, untouched by design.
- **The reap's own execution evidence.** Ledger 13, 14 and 15 — whether Caido's sandbox can spawn `pgrep` at all is unmeasured.
- **AR-04, AR-05, AR-06, AR-07, AR-08.** Decided and owned, not fixed. That was the assignment.

---

## Next

Phase 8 has no remaining plans. `08-VERIFICATION.md` still rules `human_needed`, and its three human items are unchanged by this plan — which is the honest outcome, since this plan measured nothing and only recorded what the UAT measured. The two cheapest remaining closures are one Drift-spawned Claude Code turn (`08-SPIKE.md` steps 3 and 4) and one `windows-latest` push.

## Self-Check: PASSED

- `verdict-gate.sh` — FOUND, executable, exit 0
- `COVERAGE.md` — FOUND
- Commit `97ecbbd` (Task 1) — FOUND
- Commit `616f763` (Task 2) — FOUND
- Commit `c1dcd3d` (Task 3) — FOUND
- All 12 modified files present on disk; suite, typecheck and lint re-run green after the final edit
