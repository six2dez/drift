---
phase: 08-process-lifecycle
plan: 11
subsystem: verification-gates
tags: [verdict-gate, bash, marked-correction, a1, a6, retraction, gap-closure]

requires:
  - phase: 08-process-lifecycle
    provides: "verdict-gate.sh (plan 08-10) — the three-arm A1/A6 consistency gate this plan re-points"
  - phase: 08-process-lifecycle
    provides: "08-VERIFICATION.md gap 1 — the retraction of A1's 2026-08-27 reading"
provides:
  - "verdict-gate.sh re-pointed at A1's ACTUAL verdict: the favourable A1 claim is now the stale string and RETRACTED is the required word"
  - "ARM A split into two scans (A1-STALE and A1-READING) with the fail-closed exclusion-list discovery shape kept intact"
  - "A five-spelling STALE_VERDICT_ERE measured from the tree on 2026-08-28, each alternative verified against a real line before shipping"
  - "*-VERIFICATION.md exclusion, closed in the other direction by a positive retraction requirement"
  - "ARM C membership rule (pinned OR known-unpinned) so this gap-closure round's seven summaries can land without the arm going permanently red"
  - "A written red-input sentence for each of the three arms"
  - "08-SPIKE.md: A1 retracted as a marked correction across frontmatter, verdict cell, and all four argument sections"
  - "The gate's own ARM A output as the authoritative worklist for sibling plans 08-12, 08-13 and 08-14"
affects: [08-12, 08-13, 08-14, 08-15, 08-16, 08-17]

actuals:
  tokens: 15900
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Two-scan gate arm: a claim scan (any live occurrence fails) plus a context scan (the raw datum may live anywhere, but only with its retraction in the same file)"
    - "Exclusion entries closed in the other direction: every hole in a fail-closed scan carries a positive counter-assertion"
    - "Membership rule instead of count equality for a pin list that must tolerate expected new members"

key-files:
  created: []
  modified:
    - .planning/phases/08-process-lifecycle/verdict-gate.sh
    - .planning/phases/08-process-lifecycle/08-SPIKE.md

key-decisions:
  - "STALE_VERDICT_ERE enumerates five MEASURED spellings, not four invented ones — the line-wrapped `favourably by measurement` form in 08-SECURITY.md:601-602 was found only because the scan ran before the pattern was written"
  - "The outcome-mapping exemption (verdict phrase as the consequent of `→`) is the one discriminator available between a decision RULE and a CLAIM, and it is counterweighted by scan A1-READING, which covers the same line via the raw reading string"
  - "*-VERIFICATION.md is excluded from the stale scan and covered by a positive requirement instead — the report that retracted A1 must not be reworded to make its own gate green"
  - "ARM B splits into CARRIERS_A6 (FALSIFIED + 2026-08-27, unchanged) and CARRIERS_A1 (RETRACTED + 2026-08-28, flipped); 08-VERIFICATION.md is deliberately absent from the A1 list because it carries no 2026-08-28 date and must not be edited"
  - "A second date requirement (the retraction date) is what stops a carrier satisfying ARM B on the strength of the very date whose reading was withdrawn"
  - "ARM C's strict count equality is replaced by membership, not deleted — a summary in neither list is still a hard failure"

patterns-established:
  - "Red input demonstrated, not asserted: every scan in this gate was broken on a scratch fixture, the failure captured, the fixture removed, and the count shown returning to its prior value"
  - "Marked correction with full preservation: 40 deleted lines in 08-SPIKE.md, 37 of them re-appearing verbatim as block-quoted text and 3 blank"

requirements-completed: []

coverage:
  - id: D1
    description: "verdict-gate.sh ARM A goes RED on any live occurrence of A1's withdrawn favourable verdict, in every spelling measured in the tree"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "scratch fixture .planning/gate-red-input-fixture.md with one live line per measured spelling; `bash verdict-gate.sh`"
        status: pass
    human_judgment: false
  - id: D2
    description: "verdict-gate.sh ARM A goes RED on a file carrying the raw 2026-08-27 reading without the retraction word, and green once the word is added"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "scratch fixture, before/after adding RETRACTED; `bash verdict-gate.sh`"
        status: pass
    human_judgment: false
  - id: D3
    description: "The block-quote strip is still bidirectional — a preserved supersession does not fail either scan, in both markdown and source-comment dialects"
    verification:
      - kind: integration
        ref: "scratch fixture with all five spellings plus the reading inside `>` and `// >` quotes; `bash verdict-gate.sh`"
        status: pass
    human_judgment: false
  - id: D4
    description: "ARM C tolerates this round's seven expected summaries while still failing closed on an unlisted one, and its pin half still catches a working-tree edit"
    verification:
      - kind: integration
        ref: "scratch 08-99-SUMMARY.md; one appended byte on the pinned 08-10-SUMMARY.md; `bash verdict-gate.sh`"
        status: pass
    human_judgment: false
  - id: D5
    description: "08-SPIKE.md records A1 as retracted rather than closed favourably, with every superseded cell, verdict line and paragraph preserved as dated block quotes"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "git diff 015d9da^..HEAD -- 08-SPIKE.md: 40 deleted lines, 37 re-appearing as block-quoted text, 3 blank, 0 missing"
        status: pass
    human_judgment: false
  - id: D6
    description: "The gate's ARM A output is a correct, strictly shorter worklist naming only carriers owned by sibling plans 08-12, 08-13 and 08-14"
    verification:
      - kind: integration
        ref: "`bash verdict-gate.sh` before/after the 08-SPIKE.md edit: 11 distinct files -> 10, 08-SPIKE.md dropped"
        status: pass
    human_judgment: false
  - id: D7
    description: "A1's retraction is argued consistently through 08-SPIKE.md's four argument sections, with A6 and the Control left exactly as they were"
    verification: []
    human_judgment: true
    rationale: "Whether the corrected prose reads as one coherent argument rather than a table contradicting three paragraphs is a judgment no grep can make. The mechanical half (no live sentence asserts A1 closed/measured/corroborated; A6 and Control tables byte-unchanged) is verified; the readability half is not."

duration: 22 min
completed: 2026-08-28
status: complete
---

# Phase 8 Plan 11: Re-point the verdict gate, then retract A1 in the spike record

**`verdict-gate.sh` no longer hardcodes a withdrawn verdict as ground truth: ARM A now scans for
five measured spellings of A1's favourable claim plus an unretracted raw reading, ARM B requires
`RETRACTED` + the retraction date on every A1 carrier, ARM C tolerates this round's seven
summaries without losing its fail-closed property, and `08-SPIKE.md` is the first carrier through
the fixed instrument — leaving the gate's own output as the worklist for the rest of the set.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-28T08:16Z (approx., plan dispatch)
- **Tasks:** 3 of 3
- **Files modified:** 2
- **Commits:** 3

## The state the gate is in, and why non-zero is correct

`bash .planning/phases/08-process-lifecycle/verdict-gate.sh` **exits 1** at the end of this plan.
**That is the correct state.** ARM C passes (0 failures). ARM A and ARM B name exactly the
carriers that sibling plans 08-12, 08-13 and 08-14 own and have not yet corrected. The gate is now
red for the right reason — a set of uncorrected carriers — where before this plan it was red for
the wrong one: the report that retracted A1.

Note on the plan's own `<verification>` line "ARM B and ARM C pass": that cannot hold at the end of
this plan, because ARM B's A1 half was flipped by task 1 and the carriers it now polices are
corrected by 08-12/08-14 in later waves. Task 1's acceptance criterion states the true
end-state ("exits non-zero … and names ONLY carriers owned by sibling plans 08-12, 08-13 and
08-14"), and that is the criterion honoured. Recorded rather than quietly reconciled.

---

## STEP 1 — The measured spelling list

Scanned `.planning/` and `packages/` (pruning `node_modules`, `dist`, `.git`) case-insensitively
on the stem `favourabl` **before** any pattern was written. No count from any plan document was
trusted. Five spellings, each verified to match at least one real line before its alternative
shipped:

| # | Spelling | Shape | Files matching | Example |
|---|----------|-------|---------------:|---------|
| 1 | `CLOSED-FAVOURABLY` | hyphenated frontmatter | 3 | `08-SPIKE.md` frontmatter `A1: CLOSED-FAVOURABLY` |
| 2 | `CLOSED FAVOURABLY` | spaced uppercase prose | 15 | `kill-plan.ts:77` `Verdict: **CLOSED FAVOURABLY — measured**` |
| 3 | `closed favourably` | lowercase prose | 15 | `STATE.md:255` `(A1 closed favourably, A6 **FALSIFIED** …)` |
| 4 | `measured favourably` | the ROADMAP/REQUIREMENTS form | 7 | `REQUIREMENTS.md:70` LIF-02, `ROADMAP.md:312` SC-2 |
| 5 | `favourably by measurement` | **line-wrapped** | 1 | `08-SECURITY.md:601-602` wraps between `closed` and `favourably` |

Spelling 5 is the one the plan did not predict and the scan found. `08-SECURITY.md` wraps the
phrase across a newline, so spellings 2 and 3 both miss it; a line-oriented gate that did not
enumerate the wrap would have failed **open** on exactly one file, silently. The header records
all five as a dated measured fact, with the note that each was verified against a real line first.

Final pattern:

```bash
STALE_VERDICT_ERE='CLOSED[- ]FAVOURABLY|closed favourably|measured favourably|favourably by measurement'
READING_ERE='grandchild-died \(detached honoured\)'
RETRACTION_TOKEN='RETRACTED'
RETRACTION_DATE='2026-08-28'
MEASUREMENT_DATE='2026-08-27'
OUTCOME_RULE_ERE='→.*(closed favourably|CLOSED[- ]FAVOURABLY)'
```

### The one exemption, and its counterweight

`08-SPIKE.md` § *How to run this spike later* contains two lines that are byte-for-byte
indistinguishable from a live claim but are **decision rules for a future re-run**, and remain true
after the retraction:

```
  - `grandchild-died (detached honoured)` → A1 closed favourably; the phase proceeds as planned.
Equal → A6 closed favourably: the MCP child sits in the CLI's group, so a group signal reaches
```

The only discriminator available is the arrow: the verdict phrase as the **consequent** of `→`.
Measured 2026-08-28: exactly two lines in the whole tree match that shape, both in the procedure
section (plan 08-15 owns it). Because this is a hole, it is closed in the other direction rather
than trusted — the A1 line also carries the raw reading string, so scan **A1-READING** requires its
file to carry `RETRACTED`, which `08-SPIKE.md` now does. `ROADMAP.md`'s `SIGTERM→SIGKILL` is
unaffected, verified by measurement: that line carries spelling 4, not spellings 2-3.

---

## The before/after ARM A runs, pasted

### BEFORE (rewritten gate, before any edit to `08-SPIKE.md`) — 11 distinct files

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE] .planning/REQUIREMENTS.md states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/STATE.md states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/WINDOWS.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/ROADMAP.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-VALIDATION.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SECURITY.md states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-UAT.md states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SPIKE.md states A1's WITHDRAWN favourable verdict on 5 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/kill-plan.ts states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/kill-tree.posix.test.ts states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/index.ts states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-SECURITY.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-SPIKE.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-UAT.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-VALIDATION.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/ROADMAP.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/STATE.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/WINDOWS.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/index.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/kill-plan.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/kill-tree.posix.test.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
```

Distinct files named by ARM A, BEFORE (11):

```
.planning/phases/08-process-lifecycle/08-SECURITY.md
.planning/phases/08-process-lifecycle/08-SPIKE.md
.planning/phases/08-process-lifecycle/08-UAT.md
.planning/phases/08-process-lifecycle/08-VALIDATION.md
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/STATE.md
.planning/WINDOWS.md
packages/backend/src/index.ts
packages/backend/src/kill-plan.ts
packages/backend/src/kill-tree.posix.test.ts
```

### AFTER (end of the plan) — 10 distinct files, `08-SPIKE.md` dropped

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE] .planning/REQUIREMENTS.md states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/STATE.md states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/WINDOWS.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/ROADMAP.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-VALIDATION.md states A1's WITHDRAWN favourable verdict on 3 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SECURITY.md states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-UAT.md states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/kill-plan.ts states A1's WITHDRAWN favourable verdict on 2 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/kill-tree.posix.test.ts states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-STALE] packages/backend/src/index.ts states A1's WITHDRAWN favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-SECURITY.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-UAT.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/phases/08-process-lifecycle/08-VALIDATION.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/ROADMAP.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/STATE.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] .planning/WINDOWS.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/index.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/kill-plan.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
FAIL [ARM A/A1-READING] packages/backend/src/kill-tree.posix.test.ts carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
```

Distinct files named by ARM A, AFTER (10):

```
.planning/phases/08-process-lifecycle/08-SECURITY.md
.planning/phases/08-process-lifecycle/08-UAT.md
.planning/phases/08-process-lifecycle/08-VALIDATION.md
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/STATE.md
.planning/WINDOWS.md
packages/backend/src/index.ts
packages/backend/src/kill-plan.ts
packages/backend/src/kill-tree.posix.test.ts
```

**11 → 10, strictly smaller, and the file that dropped is the one this plan corrected.** Both
readings come from captures that each carry all three `== ARM ` header lines, so neither could
have been produced by a gate that syntax-errored, aborted early or matched nothing.

### The worklist this leaves for the rest of the set

| Owner | Carriers ARM A / ARM B still names |
|-------|-----------------------------------|
| 08-12 | `packages/backend/src/index.ts`, `packages/backend/src/kill-plan.ts`, `packages/backend/src/kill-tree.posix.test.ts` |
| 08-13 | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` |
| 08-14 | `.planning/WINDOWS.md`, `.planning/STATE.md`, `08-UAT.md`, `08-VALIDATION.md`, `08-SECURITY.md` |

No other file is named. The census this set consumes is now produced by the instrument rather than
by hand, so the sixth wrong carrier count in this phase cannot happen.

---

## The five red-input demonstrations

### 1. Scan A1-STALE — a live claim in each measured spelling

Fixture `.planning/gate-red-input-fixture.md`:

```
# scratch red-input fixture (plan 08-11) — deleted immediately after measurement
1. frontmatter form: A1: CLOSED-FAVOURABLY
2. uppercase prose form: A1 is CLOSED FAVOURABLY as of that date
3. lowercase prose form: A1 closed favourably, A6 falsified
4. roadmap form: A1 was measured favourably on real hardware
5. wrapped form: A1 is closed
   favourably by measurement
```

```
### D1a — baseline (no fixture): ARM A/A1-STALE lines
10
### D1b — WITH fixture (5 live spellings):
FAIL [ARM A/A1-STALE] .planning/gate-red-input-fixture.md states A1's WITHDRAWN favourable verdict on 5 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict is OPEN.
### D1b — ARM A/A1-STALE line count with fixture:
11
### D1c — after delete, ARM A/A1-STALE line count returns to:
10
```

The count of **5** is the load-bearing number: it is one hit per spelling, which is the evidence
that all five alternatives match and none is a vacuous branch. The file count returns to its prior
value on deletion.

### 2. Scan A1-READING — the raw reading without its retraction

```
### D2a — fixture: raw reading, NO retraction word
FAIL [ARM A/A1-READING] .planning/gate-red-input-fixture.md carries the raw 2026-08-27 A1 reading (or states an A1 claim in a verification report) but never says RETRACTED — the reading is a fact, the verdict drawn from it is withdrawn, and the two must travel together.
### D2b — same file, retraction word added
(not named — gate is satisfied by the retraction)
```

### 3. The block-quote strip is still bidirectional

Fixture carrying all five spellings **and** the raw reading, each inside a `>` quote, plus one in
the `// >` source-comment dialect:

```
### D3 — same claims + reading, but inside a > block quote
(not named — preserved supersession does NOT fail the gate; strip works in both dialects)
```

A preserved supersession therefore does not fail the gate, which is what makes the marked-correction
convention usable at all.

### 4. ARM C — an unlisted summary

```
### D4a — baseline ARM C:
0
### D4b — with an unlisted 08-99-SUMMARY.md:
FAIL [ARM C] 08-99-SUMMARY.md is in the dated SUMMARY class but is in NEITHER the pin list NOR the known-unpinned list — pin it, or say why it exists
### D4c — after delete, ARM C failures:
0
```

Also verified in the permissive direction: a `08-11-SUMMARY.md` touched into the phase directory
produces **0** ARM C failures, because it is in `SUMMARY_KNOWN_UNPINNED`.

### 5. ARM C — the pin half, via a modified pinned summary

```
### D5a — append one byte to a pinned summary (08-10-SUMMARY.md):
== ARM C: the dated *-SUMMARY.md class is unmodified ==
FAIL [ARM C] a dated SUMMARY is modified in the working tree — historical records are never rewritten:
 .planning/phases/08-process-lifecycle/08-10-SUMMARY.md | 1 +
 1 file changed, 1 insertion(+)

verdict-gate.sh: FAIL
### D5b — after git checkout --, ARM C failures:
0
### D5c — 08-10-SUMMARY.md byte-identical to HEAD? 0 diff lines
```

`08-10-SUMMARY.md` is byte-identical to HEAD at the end of this plan (`git diff --stat` = 0 lines).

---

## The three red-input sentences, quoted

**ARM A:**
> RED INPUT: a non-excluded file under .planning/ or packages/ carrying, outside a block quote,
> any of the five measured spellings of A1's favourable verdict — or carrying the raw 2026-08-27
> reading string without the word RETRACTED anywhere in the same file.

**ARM B:**
> RED INPUT: any listed carrier that loses the word FALSIFIED or its 2026-08-27 date, or any A1
> carrier that does not carry both RETRACTED and 2026-08-28.

**ARM C:**
> RED INPUT: a `*-SUMMARY.md` in the phase directory that is in neither list; a pinned summary
> whose blob in HEAD differs from its pin; or any modification to a dated summary sitting
> uncommitted in the working tree.

All three were constructed and demonstrated above (ARM A twice, ARM C twice). ARM B's red input was
demonstrated by construction rather than fixture: it is currently RED on 13 assertions across seven
carriers, which is exactly the condition the sentence describes.

---

## Accounting for every deleted line

### `08-SPIKE.md` — 206 insertions, 40 deletions across the plan

Checked mechanically: for each deleted line, is the same text present in the final file prefixed
with `> ` (i.e. moved into a block quote)?

```
   3 OK(blank)
  37 OKQ        (present verbatim as block-quoted text)
   0 MISSING
```

**Zero deleted lines carry a reading value, a pid, a date or a verdict cell that is not preserved.**
The 37 accounted-for lines are:

| Superseded text | Where it now lives |
|---|---|
| `status: partially-measured`, the 2026-08-27 `measured:` value, `A1: CLOSED-FAVOURABLY` | fenced block inside the title's superseded quote |
| The 2026-08-27 title line | same quote |
| `**What reads what, as of 2026-08-27:**` + the two-line A1 bullet with the reading string | "the A1 bullet as it read that day" quote |
| `\| **Verdict** \| **CLOSED FAVOURABLY — measured 2026-08-27** \|` | "what the Verdict cell read that day" quote, directly under the A1 table |
| The 5-line "A1 no longer rests on source analysis alone …" paragraph | superseded quote under the A1 table |
| The 6-line "Second field, second matter …" paragraph | superseded quote in § A1 |
| The 3-line "**A1, closed favourably.**" CLOSES-list bullet | superseded quote in § *What this spike does and does NOT close* |
| Point 1 "**A1 came back positive.** …" (2 lines) | superseded quote inside § *The spike's own conclusion INVERTED* |
| The 3-paragraph 2026-08-27 § *The consequence, plainly* body (13 lines) | superseded quote directly beneath the corrected body |

3 further deletions are blank lines absorbed by re-flow.

**One line needs its own note.** `  in the block quote below.` shows as deleted-and-present-unquoted
rather than deleted-and-quoted. It is not superseded 2026-08-27 text: it is a line **this plan
itself wrote in task 1**, extended in task 3 with a trailing clause on the same line. The words are
still present verbatim in the live bullet. Nothing from the historical record is involved.

### `verdict-gate.sh` — 298 insertions, 61 deletions

Code, not record. The deletions are the `STALE_ERE` variable and its header block (replaced by
`STALE_VERDICT_ERE` with a five-spelling measured list), the single-scan ARM A loop (replaced by
two scans), the ARM B carrier loop (split into `CARRIERS_A6` and `CARRIERS_A1`), the `WHAT IT
ASSERTS` header block (rewritten as four claims), and ARM C's count-equality block (replaced by the
membership loop). Every retained argument the plan named as worth keeping is kept **verbatim**: the
inclusion-list-vs-exclusion-list paragraph, the `xargs`/`-Z`/`ugrep` commentary, the
newline-in-filename detector, ARM B's "sound only because ARM A covers discovery" argument, ARM C's
`git diff --stat HEAD` and shallow-clone arguments, and the deliberate-friction paragraph.

---

## `08-SPIKE.md`: what changed and what did not

**Changed** — the A1 verdict, and every sentence that argued from it:

- Frontmatter: `A1: RETRACTED — reading withdrawn, verdict OPEN`; `status` now states what is true
  of the file (A6 measured, A1 withdrawn, Control never taken); `measured` splits the A6 half
  (stands) from the A1 half (retracted).
- Title, the "what reads what" bullet list, the A1 `Verdict` cell, and a new `Why retracted` row
  stating the mechanism in one sentence.
- § A1's prose: A1 rests on source analysis alone again; the "Second field, second matter" paragraph
  corrected from *separate finding* to *the same finding*, in both directions (production code:
  unknowns resolve toward alive, so no kill can be added; the probe: the unknown resolved toward the
  favourable verdict, and nobody traced that consumer).
- § *What this spike does and does NOT close*: A1 moved back to the does-NOT-close list; the item
  that the nine `killTree` sites rest on source analysis of a pinned commit reinstated.
- § *The spike's own conclusion INVERTED*: point 1 corrected in place (A1 undetermined, not
  positive); points 2 and 3 kept with their original force; the 2026-08-27 re-justification
  recorded as having **under-claimed** OQ-2's necessity — an error toward more caution, stated as
  such because a correction that only ever finds under-claims is a suspicious correction.
- § *The consequence, plainly*: **both** live risks named rather than one traded for the other (A6
  falsified; A1 unmeasured), and OQ-2's justification reverted to defence against the present
  runtime. The "do not delete that rung" instruction is kept.
- New § *The rule this spike cost us, stated as a rule*, naming `classifyLivenessObservation`
  (plan 08-15, `kill-plan.ts`) as where the three-valued liveness determination now lives.

**Unchanged, by construction:**

- The `spikeProcessKillType` and `spikeDetachedGroupKill` reading rows — what the instrument
  printed, kept.
- `A6: FALSIFIED` in frontmatter, byte-identical. The A6 pids all still present: `43921` ×4,
  `43752` ×4, `44284` ×5.
- The § *A6* table — no diff hunk touches it (`FALSIFIED — measured 2026-08-27`: 0 hunks;
  `ppid 43752`: 0 hunks).
- The § *Control* table — no diff hunk touches it (`the defect was never observed on real
  hardware`: 0 hunks). It was already an honest absence and is defended as such in the file's own
  prose.
- § *How to run this spike later* — untouched; plan 08-15 owns it.

---

## Verification results

| Check | Result |
|---|---|
| `bash verdict-gate.sh` runs to completion, 3 `== ARM ` headers | ✓ PASS |
| ARM C failures | ✓ **0** |
| ARM A names only 08-12/08-13/08-14 carriers | ✓ PASS (10 files, all owned) |
| ARM B failures | 13 assertions / 7 carriers, all owned by 08-12 and 08-14 — expected until those plans land |
| Five red-input demonstrations with pasted output | ✓ all five, above |
| `git diff --stat` for this plan touches exactly `verdict-gate.sh` and `08-SPIKE.md` | ✓ PASS (`git diff --stat 015d9da^..HEAD` = 2 files) |
| `08-VERIFICATION.md` byte-unchanged by this plan | ✓ PASS — see note below |
| `pnpm -r typecheck` | ✓ 0 (shared, backend, frontend all Done) |
| `pnpm lint` | ✓ exit 0 |
| `grep -c RETRACTED verdict-gate.sh` non-zero | ✓ 11 |
| `08-SPIKE.md` names `classifyLivenessObservation` | ✓ 1 |
| No live sentence in `08-SPIKE.md` asserts A1 closed/measured/corroborated | ✓ the only two hits are negations (`A1 is OPEN, not measured`, `A1 is UNMEASURED`) |

**On `08-VERIFICATION.md`.** The plan's literal check is
`git diff --stat -- 08-VERIFICATION.md | wc -l | grep -qx 0`. That check **cannot** return 0 in this
working tree, and not because of anything this plan did: the file carried **uncommitted
modifications that predate this run** (474 insertions / 181 deletions vs HEAD), which the phase
dispatch explicitly flagged and instructed to leave unstaged. The check was therefore replaced by
two stronger measurements of the same intent:

1. `stat` mtime of `08-VERIFICATION.md` is **2026-08-27T16:41:04** — roughly 18 hours before this
   plan started (2026-08-28T10:16). The file was not written during this run.
2. `git log --name-only 015d9da^..HEAD | grep -c VERIFICATION` = **0**. The file appears in none of
   this plan's three commits, and it is still unstaged.

The report that diagnosed the defect stands as written, and was not reworded to make the gate green.

---

## Deviations from Plan

### 1. [Rule 3 — Blocking] The § *What this spike does and does NOT close* A1 bullet had to move in task 1, not task 3

- **Found during:** Task 1, step 6.
- **Issue:** Task 1's own `<verify>` requires ARM A to name zero occurrences of `08-SPIKE.md`, and
  task 1's scope as written is frontmatter + the § A1 table. But the file's CLOSES-list bullet
  (`- **A1, closed favourably.** …`) is a live claim in measured spelling 3 and sits in § *What this
  spike does and does NOT close*, which the plan assigns to task 3. Task 1 could not pass its own
  verification without it.
- **Fix:** The minimal move (bullet out of the CLOSES list, into the does-NOT-close list, with the
  2026-08-27 text preserved as a dated block quote) was done in task 1. Task 3 then completed the
  section as specified — stating the mechanism in the bullet itself and reinstating the
  "nine `killTree` sites rest on source analysis of a pinned commit" item.
- **Files modified:** `.planning/phases/08-process-lifecycle/08-SPIKE.md`
- **Verification:** ARM A named 0 occurrences of `08-SPIKE.md` at the end of task 1; the task-3
  acceptance criteria for that section all hold at the end of the plan.
- **Commit:** `015d9da` (task 1), completed in `e9b2842` (task 3).

### 2. [Rule 3 — Blocking] The § A1 prose was corrected in task 1 rather than left to task 3

- **Found during:** Task 1, step 6.
- **Issue:** The two paragraphs immediately below the A1 table ("A1 no longer rests on source
  analysis alone…" and "Second field, second matter…") assert corroboration by execution and that
  the absent kill primitive does not weaken A1. Neither contains a favourable spelling, so the gate
  would not have caught them — but leaving a corrected verdict cell directly above two paragraphs of
  the withdrawn argument is exactly the half-correction task 3 exists to prevent.
- **Fix:** Corrected in task 1 as part of § A1, with both superseded paragraphs preserved as dated
  block quotes. Task 3 handled the three later argument sections as planned.
- **Files modified:** `.planning/phases/08-process-lifecycle/08-SPIKE.md`
- **Commit:** `015d9da`

### 3. [Rule 2 — Missing critical] A fifth spelling, and a discriminator the plan did not anticipate

- **Found during:** Task 1, step 1.
- **Issue (a):** The plan named four spellings as the minimum. The measured scan found a fifth:
  `08-SECURITY.md` wraps the phrase across a line break (`closed` / `favourably by measurement`), so
  a gate carrying only the four would have failed **open** on that file.
- **Issue (b):** The lowercase prose spelling is byte-identical in two lines of `08-SPIKE.md`'s
  procedure section, where it is a decision rule for a future re-run rather than a claim. With no
  discriminator the gate would have been permanently red on a section this plan is forbidden to
  touch (plan 08-15 owns it) — the same "gate forbids the correct next step" defect this plan
  exists to remove.
- **Fix:** (a) added spelling 5, verified to match. (b) added `OUTCOME_RULE_ERE`, exempting the
  verdict phrase when it is the consequent of `→`, with the hole closed in the other direction:
  those lines carry the raw reading string, so scan A1-READING requires their file to carry
  `RETRACTED`. Measured before shipping: exactly two lines in the tree match the exemption, both in
  the procedure section, and `ROADMAP.md`'s `SIGTERM→SIGKILL` is unaffected because that line
  carries spelling 4.
- **Files modified:** `.planning/phases/08-process-lifecycle/verdict-gate.sh`
- **Commit:** `015d9da`

### 4. [Rule 1 — Correctness] `08-VERIFICATION.md` excluded from ARM B's A1 requirement

- **Found during:** Task 1, step 4.
- **Issue:** The plan's step 4 says every carrier stating an A1 verdict must carry `RETRACTED` and
  the retraction date. `08-VERIFICATION.md` states A1's verdict, but it performed the retraction on
  **2026-08-27**, carries no 2026-08-28 date, and this plan is prohibited from editing it. Applying
  the requirement literally would make ARM B permanently red on a file nobody may fix — and would
  have violated the acceptance criterion that only 08-12/08-13/08-14 carriers are named.
- **Fix:** `08-VERIFICATION.md` stays in `CARRIERS_A6` (FALSIFIED + 2026-08-27, both satisfied) and
  is deliberately absent from `CARRIERS_A1`. Its A1 obligation is asserted instead by ARM A's
  A1-READING scan, which requires every `*-VERIFICATION.md` mentioning A1 to carry `RETRACTED`.
  That is the counterweight to the new exclusion, and it is the same shape the plan asked for in
  step 3. Verified by inspection: today's `08-VERIFICATION.md` carries "reading RETRACTED" and
  "RECORDS A RETRACTED READING". The reason is written into the ARM B header.
- **Files modified:** `.planning/phases/08-process-lifecycle/verdict-gate.sh`
- **Commit:** `015d9da`

### 5. [Documentation] The plan's `<verification>` "ARM B and ARM C pass" cannot hold at this plan's end

- **Found during:** final verification.
- **Issue:** Task 1 flips ARM B's A1 half onto seven carriers owned by 08-12 and 08-14, so ARM B is
  necessarily red until those plans land. The plan's own task-1 acceptance criterion states the
  opposite and correct end-state.
- **Resolution:** honoured the task-level criterion (non-zero exit naming only 08-12/08-13/08-14
  carriers) and recorded the tension here rather than reconciling it silently. No artifact was
  edited to make the line true.

**Total deviations:** 5 — 2 task-boundary shifts (Rule 3), 1 pattern widening plus one new
discriminator (Rule 2), 1 carrier-list correctness fix (Rule 1), 1 documentation reconciliation.
**Impact:** none negative. The two boundary shifts moved work earlier within the same plan; the
pattern widening closed a fail-open hole the plan did not know about; the ARM B fix is what keeps
the gate satisfiable by the correction it is meant to permit.

## Authentication Gates

None.

## Known Stubs

None. No stub, placeholder, TODO or unwired path was introduced. Both modified files are
documentation/tooling; no source file under `packages/` was touched.

## Threat Flags

None. This plan modifies no network endpoint, auth path, file-access pattern or schema. The
threat register's four entries (T-08-51 … T-08-54) are all addressed above: T-08-51 by the measured
spelling list, the per-alternative verification, the two demonstrated red inputs and the retained
fail-closed shape; T-08-52 by the marked-correction convention with a zero-missing deleted-line
audit; T-08-53 by ARM C keeping both the pins and the working-tree diff check while widening only
the membership rule; T-08-54 accepted as recorded.

## Follow-ups

1. **Promote the seven known-unpinned summaries to pinned blob hashes when this gap-closure round
   closes.** `SUMMARY_KNOWN_UNPINNED` currently lists `08-11-SUMMARY.md` through
   `08-17-SUMMARY.md`. Until they are promoted (`git rev-parse HEAD:<path>` into `SUMMARY_PINS`) and
   the known-unpinned list is emptied, those seven files are protected by the working-tree diff
   check but **not** by a content pin. This is written into `verdict-gate.sh`'s ARM C header as an
   explicit outstanding action as well, so it survives this SUMMARY scrolling out of view.
2. **`RETRACTION_DATE` is a literal `2026-08-28`.** If any sibling plan in this round lands on a
   later date, ARM B will fail on its carriers for a date reason rather than a content reason. The
   variable is in one place at the top of the script; change it there, not per-arm.
3. **A1 still needs a real reading.** Nothing in this plan measures A1; it only stops the repository
   claiming it was measured. Plan 08-15 fixes the probe (`classifyLivenessObservation`); running it
   on hardware remains unowned after Phase 8 closes.

## Next

Wave 6 complete. The gate is fixed and its output is the worklist. Ready for the plans that depend
on it: **08-12** (source carriers), **08-13** (ROADMAP + REQUIREMENTS), **08-14** (WINDOWS, STATE,
UAT, VALIDATION, SECURITY).

## Self-Check: PASSED

- `verdict-gate.sh`, `08-SPIKE.md`, `08-11-SUMMARY.md` all present on disk.
- Commits `015d9da`, `9476d25`, `e9b2842`, `bdf2234` all present in `git log --all`.
- Gate re-run with this SUMMARY on disk: 3 `== ARM ` headers, **ARM C failures: 0** (the
  membership rule works in production, not only on the fixture), ARM A names 10 files, and
  `08-SPIKE.md` appears 0 times.
