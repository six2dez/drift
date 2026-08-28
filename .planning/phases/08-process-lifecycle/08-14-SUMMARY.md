---
phase: 08-process-lifecycle
plan: 14
subsystem: planning-artifacts
tags: [windows-ledger, marked-correction, a1, a6, retraction, gap-closure, uat, validation, security]

requires:
  - phase: 08-process-lifecycle
    provides: "verdict-gate.sh re-pointed at A1's actual verdict (plan 08-11) — the instrument this plan is measured by"
  - phase: 08-process-lifecycle
    provides: "08-VERIFICATION.md gap 1 — the retraction of A1's 2026-08-27 reading"
  - phase: 08-process-lifecycle
    provides: "classifyLivenessObservation, three-valued (plan 08-12) — the fix this plan's corrections point at"
provides:
  - "Broken-windows ledger entry 11 corrected in BOTH representations with one byte-identical description: A1 RETRACTED, the nine-site POSIX concern live again, status still open"
  - "Ledger entry 20 — the unfalsifiable probe verdict recorded as its own broken window, the first Phase-8 vacuous gate that shipped as a READING rather than a green tick"
  - "A second preserved supersession for entry 11 in ## Marked corrections, alongside the untouched 2026-08-24 one"
  - ".planning/STATE.md — the A1 half of the Phase 8 record corrected; Current Position and frontmatter now cite 08-VERIFICATION.md's gaps_found / 4-of-9 verdict"
  - "08-UAT.md test 1 corrected from result: pass to result: issue with severity: major, and the file now names the contradiction it was carrying between two of its own sections"
  - "08-VALIDATION.md — A1 bullet, item-5 clause, assumption-table row and Vehicle caveat item 2 corrected; a THIRD nyquist reason added, none removed"
  - "08-SECURITY.md — the A1 paragraph and its consequence paragraph corrected, with the G-02 section named as the contrast case; register and all nine residuals untouched"
  - "A measured residual ARM A hit list for plan 08-15: EMPTY"
affects: [08-15, 08-16, 08-17]

actuals:
  tokens: 10525
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Dual-representation correction: one string written twice (markdown row + JSON object), replaced as ONE string and then proven byte-identical by programmatic extraction and diff — never by eye"
    - "Marked correction for a machine-readable register: the register cannot carry a block quote, so supersessions stack in the file's own ## Marked corrections section"
    - "Capture-once gate check: liveness (exactly three `== ARM ` headers) AND target absence asserted against the SAME capture, never split across two runs"

key-files:
  created: []
  modified:
    - .planning/WINDOWS.md
    - .planning/STATE.md
    - .planning/phases/08-process-lifecycle/08-UAT.md
    - .planning/phases/08-process-lifecycle/08-VALIDATION.md
    - .planning/phases/08-process-lifecycle/08-SECURITY.md

key-decisions:
  - "Entry 11 is NOT narrowed on the A1 side and says so in plain words: the nine-site POSIX regression it was opened for is LIVE AGAIN. A middle state that reads as partial progress was the specific failure mode to avoid."
  - "The new ledger entry names what made this instance different from the twelve already recorded — it produced a READING rather than a green tick, which is why it propagated instead of being noticed."
  - "This plan asserts only the narrower fact it can measure — none of ITS five files is named, in a capture proven live. The gate's exit code is recorded as an observation, never as this plan's criterion; the exit-0 assertion and the green re-demonstration belong to plan 08-15."
  - "No threat disposition changed. All 50 STRIDE rows and all 9 accepted residuals are byte-identical after the edit; threats_open stays 0."
  - "08-VALIDATION.md Vehicle caveat item 2 goes back to FULLY undischarged. The process.kill moot-ness note survives because it rests on a typeof reading, a different instrument from the coalesced call."

requirements-completed: []

coverage:
  - id: D1
    description: "Ledger entry 11 states A1's verdict as withdrawn in BOTH representations, with the same description text, and keeps status: open"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "programmatic extraction of the markdown cell and the JSON value + difflib.unified_diff -> empty diff; status/recorded_at/resolved_at re-read"
        status: pass
    human_judgment: false
  - id: D2
    description: "Entry 11's superseded 2026-08-27 description and reason are preserved verbatim in ## Marked corrections, and the 2026-08-24 block is undisturbed"
    verification:
      - kind: integration
        ref: "`grep -c '**Entry 11, superseded'` -> 2; git diff shows 0 deleted lines in the Marked corrections section"
        status: pass
    human_judgment: false
  - id: D3
    description: "A new ledger entry records the unfalsifiable probe verdict as a distinct defect, created by the tool rather than by hand, with counts consistent afterwards"
    verification:
      - kind: integration
        ref: "`gsd-tools windows append --kind deviation --phase 08 ...` -> entry 20; `windows status` ok; md rows == json ids == 20"
        status: pass
    human_judgment: false
  - id: D4
    description: "08-UAT.md test 1 no longer reads result: pass, its reported block is byte-identical, and test 2 is byte-unchanged"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "`grep -c '^result: pass$'` -> 0; segment compare of test 2 against HEAD -> True; reported block absent from the diff"
        status: pass
    human_judgment: false
  - id: D5
    description: "None of this plan's five files is named by verdict-gate.sh, measured against a single capture carrying all three == ARM headers"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "capture-once check: 3 ARM headers AND 0 hits, run per task; full capture pasted below"
        status: pass
    human_judgment: false
  - id: D6
    description: "The check used here is red on its own red input and refuses a silent gate, demonstrated by mutation rather than asserted"
    verification:
      - kind: integration
        ref: "Demonstrations A/C (stale spelling reintroduced, check FAIL) and D (gate sabotaged to print 0 bytes: weak form FALSE GREEN, strong form ARM headers=0 FAIL); both restored and verified by sha1"
        status: pass
    human_judgment: false
  - id: D7
    description: "08-SECURITY.md's register, threats_open and nine accepted residuals survive the edit intact, and no disposition depends on A1"
    verification:
      - kind: integration
        ref: "50 register rows byte-identical; 9 AR rows byte-identical with 7 non-empty columns each; threats_open: 0; § G-02 no diff hunk; per-row disposition sweep"
        status: pass
    human_judgment: false
  - id: D8
    description: "The corrected prose reads as one coherent record rather than a set of patched sentences contradicting their own surroundings"
    verification: []
    human_judgment: true
    rationale: "Three of the five corrections cut a sentence out of the middle of a running paragraph and re-flowed it; two of those re-flows orphaned their tail on the first attempt and were caught and fixed by reading the rendered result. Whether the final prose reads as one argument is a judgment no grep makes. The mechanical half — no live line asserts A1 was measured, every superseded line preserved, every deleted line accounted — is verified."

duration: 26 min
completed: 2026-08-28
status: complete
---

# Phase 8 Plan 14: Retract A1 in the ledger, the project state file, and the last three phase documents

**The broken-windows register now states A1's verdict as withdrawn in both of the representations it
carries it in — proven byte-identical rather than eyeballed — entry 11 says in plain words that the
nine-site POSIX concern it was opened for is LIVE AGAIN rather than sitting in a middle state that
reads as progress, the defect that caused this whole round is itself recorded as ledger entry 20 with
a named fix and a named closing condition, and `08-UAT.md` now names the contradiction it had been
carrying between two of its own sections since the day both were written.**

## Performance

- **Duration:** 26 min
- **Tasks:** 3 of 3
- **Files modified:** 5
- **Commits:** 3
- **Files under `packages/`:** 0

---

## THE HEADLINE THIS PLAN DOES *NOT* CLAIM

`verdict-gate.sh` exits **0** at the end of this plan. **That is recorded as an observation, not as
this plan's criterion, and this SUMMARY does not treat it as one.**

This plan ran in wave 7 alongside 08-12 and 08-13. It could not know, when it started, whether its
siblings' carriers would still be named when it finished. Its criterion was therefore the narrower
fact it could measure: **none of ITS five files is named, in a capture proven live**. It happens that
its siblings finished first and the worklist at dispatch was exactly this plan's five files with
nothing left over — so clearing them turned the whole gate green. That is a fact about the ordering,
not a fact this plan established.

**Plan 08-15 owns the exit-0 assertion and the re-demonstration of the gate's red input at green**,
and it is the right owner because it also edits `08-SPIKE.md`, which makes its assertion self-proving.
Asserting green here would be asserting a property of somebody else's work.

---

## THE RESIDUAL ARM A HIT LIST FOR PLAN 08-15

Measured, not assumed, from the single captured run at the end of task 3:

```
=== RESIDUAL ARM A HIT LIST (for plan 08-15) ===
  (none — ARM A names zero files)
```

**08-15 inherits an EMPTY ARM A worklist.** Every name that was on it belonged to 08-12, 08-13 or
this plan, and all three are done. Nothing outside those plans' `files_modified` ever appeared, so
there is no unowned finding to report.

### The full captured gate output, task 3's single run

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
   ARM A: pass (0 live favourable-A1 verdicts and 0 unretracted readings outside the excluded historical-record class)
== ARM B: positive content on the known carriers ==
   ARM B: pass (8 A6 carriers carry FALSIFIED and 2026-08-27; 8 A1 carriers carry RETRACTED and 2026-08-28)
== ARM C: the dated *-SUMMARY.md class is unmodified ==
   ARM C: pass (10 pinned blobs match HEAD; 13 summaries on disk, 0 unaccounted for; working tree clean)

verdict-gate.sh: PASS (ARM A, ARM B, ARM C)
```

`== ARM ` header lines: **3**. Hits for `08-VALIDATION.md` / `08-SECURITY.md`: **0**. Both counted
against that same capture, in one `&&` chain, which is the whole point — see § *Red-input
demonstrations* below for the measured reason the two halves are never split.

### The worklist, before and after

| Run | ARM A/A1-STALE | ARM A/A1-READING | ARM B | Files named |
|-----|---------------:|-----------------:|------:|-------------|
| At dispatch (after 08-11/12/13) | 5 files, 11 lines | 5 files | 7 failures | `STATE.md`, `WINDOWS.md`, `08-VALIDATION.md`, `08-SECURITY.md`, `08-UAT.md` |
| After task 1 | 4 files | 4 files | 5 | `WINDOWS.md` dropped |
| After task 2 | 2 files | 2 files | 4 | `STATE.md`, `08-UAT.md` dropped |
| After task 3 | **0** | **0** | **0** | — |

---

## Task 1 — the register

### The byte-identity diff for entry 11's two representations

Extracted programmatically — the markdown cell by splitting the `| 11 | 08 |` row on ` | `, the JSON
value by `json.loads` over the fenced array — and diffed with `difflib.unified_diff`:

```
BYTE-IDENTITY DIFF (md row description vs JSON description) for entry 11:
(empty diff — byte-identical)

BYTE-IDENTITY DIFF (md row reason vs JSON reason):
(empty diff — byte-identical)
```

Re-measured **after** `windows append` rewrote the file, not only before it, because the tool
rewrites both representations and a check that ran only before the tool would prove nothing about
the shipped state.

**How the edit avoided the divergence in the first place.** The two representations were measured to
be the SAME bytes today — `json.dumps(desc)[1:-1] == desc`, i.e. the description needs no JSON
escaping — so the edit was a single `str.replace(OLD, NEW)` with `count == 2` asserted before and
after. One string, replaced once, in two places. The script also asserts that the NEW text needs no
escaping either, so the day someone introduces a quote or a backslash the script fails loudly instead
of silently writing a divergence. That assertion is the guard, not the diff; the diff is the proof.

### The `windows append` command and its output

Never hand-edited: the table, the JSON array and the three frontmatter counts are three places to get
wrong, and the tool writes all three.

```bash
node "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" windows append \
  --kind deviation \
  --phase 08 \
  --file packages/backend/src/index.ts \
  --description "Fourteenth vacuous gate in Phase 8, and the first that shipped as a READING
  rather than as a green tick. …"
```

Invoked bare first, as the plan required, and it enumerated its own contract:

```
$ node .../gsd-tools.cjs windows append
Error: Missing required flag: --kind
```

Output (elided to the appended entry and the counts):

```json
{
  "ok": true,
  "ledger": { "open_count": 11, "waived_count": 0, "fixed_count": 9, "total_count": 20,
              "last_updated": "2026-08-28T09:25:02.483Z" },
  "entry": { "id": 20, "kind": "deviation", "phase": "08",
             "file": "packages/backend/src/index.ts", "status": "open",
             "recorded_at": "2026-08-28T09:25:02.483Z", "resolved_at": null }
}
```

`gsd-tools windows status` runs clean and reports it: `ok=True open=11 fixed=9 total=20 entries=20`,
`entry 20: deviation 08 packages/backend/src/index.ts open`.

### Counts and open-entry ids, before and after

| | `open_count` | `fixed_count` | `total_count` | md rows | JSON objects |
|---|---:|---:|---:|---:|---:|
| Before | 10 | 9 | 19 | 19 | 19 |
| After  | 11 | 9 | 20 | 20 | 20 |

```
open ids BEFORE: 8,11,12,13,14,15,16,17,18,19
open ids AFTER:  8,11,12,13,14,15,16,17,18,19,20
fixed ids BEFORE / AFTER: 1,2,3,4,5,6,7,9,10  (identical)
```

**Exactly one id gained, none lost, and no `status` changed from `open` to anything else.** Entry 11
keeps `status: open`, `recorded_at: 2026-08-24T15:24:21.284Z` and `resolved_at: null`. Correcting a
description is not resolving a defect, and the counts prove it was not treated as one.

### What entry 11 now says, and why the wording matters

The A1 half is rewritten to state the withdrawal *and its consequence in the entry's own terms*:

> the nine-site POSIX regression this entry was opened for is LIVE AGAIN. Whether the shipped LLRT
> honours the detached spawn is UNMEASURED, and the nine POSIX termination sites rest on unexecuted
> source analysis exactly as they did on 2026-08-24.

That sentence is the point of the task. The 2026-08-27 rewrite had declared the entry's founding
fear resolved; with the reading withdrawn the fear is live, and an entry that merely dropped the
favourable claim without saying so would sit in a middle state reading as partial progress. The
`reason` column carries the same correction so the two columns cannot tell different stories.

**The A6 half came through unchanged** — pids **43921 / 43752 / 44284**, the word FALSIFIED, and the
argv-marker-reap conclusion — with an added clause stating explicitly that it was taken by direct `ps`
observation, is not withdrawn, and is not bundled into the A1 retraction.

### Two supersessions, both surviving

`## Marked corrections` now carries **two** blocks for entry 11: the 2026-08-24 one plan 08-10 wrote,
byte-untouched, and the 2026-08-27 one this task added. `grep -c '**Entry 11, superseded'` → **2**.
The new block preserves the full 2026-08-27 `description` and `reason` verbatim, wrapped at the same
width and with the same nested `> >` form the existing block uses, and states which half of the
preserved text is still current (A6) and which is withdrawn (A1).

### Deleted-line accounting — `.planning/WINDOWS.md`, 6 lines

| # | Deleted | Where it went |
|---|---------|---------------|
| 1-3 | `open_count: 10`, `total_count: 19`, `last_updated: …` | rewritten by `windows append` |
| 4 | entry 11's markdown row | replaced; superseded text preserved in `## Marked corrections` |
| 5 | entry 11's JSON `description` | same string, same replacement |
| 6 | entry 11's JSON `reason` | replaced; superseded text preserved |

---

## Task 2 — the project state file and the UAT record

### `08-UAT.md` test 1 — the record where the reading first became a verdict

`result: pass` → **`result: issue`**, matching the vocabulary test 2 already uses for a finding rather
than a failure, plus `severity: major` in test 2's field position.

**The `reported` block is byte-identical.** Proven two ways: no `-` line in the diff touches it, and
a segment comparison against `HEAD` from the `reported: |` anchor returns `True`. Those three field
values are what the instrument printed — and the *first* of them is the evidence against the *third*:

```
  spikeProcessKillType:   "undefined"
  spikeDetachedGroupKill: "grandchild-died (detached honoured)"
```

The `evidence` field is rewritten to state the mechanism rather than the conclusion, and the
2026-08-27 evidence is preserved verbatim below it as a nested block quote. It names where the fix
lives (`classifyLivenessObservation`, `kill-plan.ts`, plan 08-12) and who re-runs it (plan 08-17).

**The sentence added to § *The root cause behind G-01 and G-02*** is the finding, and it belongs in
that section because that is where it happened:

> The first row here, `typeof process.kill` = `undefined`, is what INVALIDATES test 1's A1 verdict
> below … Both facts came out of the SAME probe run and were written into the SAME file on the SAME
> day, five sections apart, and **nobody joined them at the time.**

### § *Summary* — recounted from the file, not adjusted arithmetically

```
### test headings : 10
result: pass      : 0
result: issue     : 2
result: [pending] : 8
```

`passed: 1 → 0`, `issues: 1 → 2`, `pending: 8` unchanged. `at_risk: 1` and `degraded_as_designed: 1`
were left alone after checking what they count: they are *gap* statuses (lines 218 and 357), not test
results, so recounting the tests must not touch them.

**Test 2 is byte-unchanged** — a segment comparison from its heading to test 3's returns `True`, 2344
bytes before and after — as is the entire `## Gaps` section, G-01 through G-05 included.

### `STATE.md`

The Phase 8 bullet's A1 half is corrected with its mechanism named; the A6 half (pids, verdict word,
argv-marker conclusion) is carried through verbatim; the `STILL OPEN` clause is extended with the A1
re-run rather than replaced. The ledger-11 state bullet is corrected the same way. `## Current
Position` and the frontmatter now cite `08-VERIFICATION.md`'s **`gaps_found`, 4/9 must-haves
verified** instead of the superseded `human_needed` / 2-of-8, with two new frontmatter keys
(`verification_status`, `verification_score`) carrying it machine-readably.

`gsd-tools query state.load` parses the file after every edit — run three times, always clean.

### Deleted-line accounting — 16 lines across the two files

**`.planning/STATE.md`, 6 lines.** (1) frontmatter `last_activity_desc`, (2-3) two `## Current
Position` lines — all three replaced with text citing `gaps_found`; (4) the A1/A6 measurement bullet
and (5) the ledger-11 state bullet — both replaced, both superseded texts preserved verbatim as dated
block quotes; (6) the phase-close bullet, whose `human_needed` clause is replaced and preserved as a
block quote while the rest of the bullet is carried through.

**`08-UAT.md`, 10 lines.** (1) `result: pass` → `result: issue`; (2-8) the seven-line 2026-08-27
`evidence` field, re-appearing verbatim in the preserved block quote; (9-10) `passed: 1` / `issues: 1`,
replaced by the recount.

---

## Task 3 — the validation and security documents

Driven from the gate's output, not from any count written anywhere: run it, take the hit list for
these two files, correct each hit. Four hits, all cleared.

### `08-VALIDATION.md`

- **The A1 findings bullet.** The framing "a pair of measurements, one of them negative" is corrected
  to what it actually is — one measurement (A6) and one retracted reading (A1). Both superseded
  texts preserved.
- **The item-5 checklist clause** and **the assumption-table row.** The table row already carried one
  preserved cell from 2026-08-24 in parentheses; a second (2026-08-27) was added in that exact form,
  so the row now carries two.
- **§ *Vehicle caveat* item 2 is RESTORED to fully undischarged.** The `detached` half is no longer
  "proven on the shipped runtime"; it is unmeasured, as it was on 2026-08-24. The `process.kill`
  moot-ness note **survives**, and deliberately: it rests on a `typeof` reading, which is a different
  instrument from the coalesced call, and is not withdrawn.
- **Item 3 is byte-unchanged** — A6 stays a negative measurement.
- **`nyquist_compliant: false` and both existing reasons are intact.** A **third** reason was added
  (A1's retraction), explicitly as an addition rather than a substitution. Nothing was relaxed.

**One trap hit and cleared, worth recording because 08-13 hit the same one.** The first draft of the
item-5 correction spelled the withdrawn verdict on a live line while describing its withdrawal —
inside an italic `*(Correction …)*` parenthetical. ARM A/A1-STALE would have gone red on it. The fix
moved the spelling into a block quote; the claim is unchanged, only the location of the spelling
moved. This is the third time in this round the gate has caught its own author, and it is the
instrument working.

### `08-SECURITY.md`

Two A1-STALE hits, one of them the **line-wrapped fifth spelling** at 601-602 (`closed` / `favourably
by measurement` split across a newline) that a four-spelling scan would have failed open on silently.
Both cleared, plus the A1-READING hit.

- **The A1 paragraph** is corrected with both supersessions preserved, and carries the sentence the
  plan asked for: **the analysis that would have caught this was already in this file.** §
  *G-02 — recorded, not fixed* traces the very same absent primitive correctly and in detail. Two
  sections of one document read the same reading; only one read it correctly. § *G-02* is left
  exactly as it is, as the contrast case.
- **The consequence paragraph** said the nine-site regression was "retired by A1's closure". It is
  now stated as **live again**. The rest of that paragraph — the argv-marker reap, OQ-2's rung, "one
  measurement closes a version, not a dependency" — survives, with an added clause noting the reap is
  untouched by the retraction because it depends on command-line identity rather than process groups.
- **The outcomes checklist** item is corrected with both prior lines preserved as block quotes.

### Every threat disposition was checked against the A1 retraction — result

**Checked, not assumed: all 50 rows, one at a time.** Three rows mention A1 or `detached` anywhere in
their threat or mitigation text, and each was read in full:

| Threat | Disposition | Does it depend on A1's *verdict*? |
|--------|-------------|-----------------------------------|
| **T-08-01** — orphaned `mcp-server.mjs` holding `CAIDO_TOKEN` after a cancel | `mitigate`, *closed by attestation* | **No.** Its evidence is `kill-tree.posix.test.ts`'s control-plus-proof pair under Node plus the T-08-14 attestation — never A1's reading. Its status note already qualifies the attestation. |
| **T-08-10** — temporary diagnostics code surviving into the shipped tree | `mitigate`, closed | **No.** A `grep` census over `spike*` symbols and a net-diff count. It is about the probe's *removal*, not its *output*. |
| **T-08-11** — `detached: true` reaching Drift-owned leaf spawns | `mitigate`, closed | **No.** A compiler-enforced required member plus a source assertion that exactly one call site says `true`. Independent of whether the runtime honours the flag. |
| The other 47 rows | unchanged | **No** — none mentions A1 in either direction. |

**Finding: no disposition depends on A1's verdict; nothing changed and nothing needed to.** Every
threat in the register was written against a mechanism, not against a reading, which is exactly why
the register survived a retraction that invalidated eleven carriers.

### What came through untouched, measured

```
residual rows: 9 -> 9
rows with 7 non-empty columns: 9 -> 9
non-empty 'Accepted By' cells: 9 -> 9
residual table byte-unchanged: True
STRIDE register rows: 50 -> 50 ; byte-unchanged: True
§ G-02 — recorded, not fixed: byte-unchanged: True
threats_open: 0   (unchanged)
threats_open_note: "0 open; 1 accepted high (T-08-47 / AR-06, decider six2dez per GD-02)"  (unchanged)
```

AR-01 through AR-09, all seven columns each, every `Accepted By` naming a decider rather than an
owner. No residual lost a column; no threat changed disposition; `threats_open` did not move.

### Deleted-line accounting — 47 lines across the two files

**`08-VALIDATION.md`, 24 lines.** 1-8 the 2026-08-27 correction header and A1 bullet (preserved
verbatim in a nested block quote); 9-10 the ledger-11 sentence (replaced, strengthened, nothing
dropped); 11-14 the item-5 clause and its 2026-08-27 parenthetical (both preserved as block quotes);
15-23 Vehicle caveat item 2 (preserved as a block quote); 24 the assumption-table row (two preserved
cells carried inline).

**`08-SECURITY.md`, 23 lines.** 1-8 the 2026-08-27 correction header and A1 bullet (preserved
verbatim); 9-16 the consequence paragraph — its first two sentences superseded and preserved as a
block quote, sentences 3-6 surviving in content and only re-wrapped, plus one added clause; 17-23 the
outcomes checklist item (both superseded lines preserved as block quotes).

---

## Red-input demonstrations

Every mutation was verified to have **landed** before its result was read — `assert s.count(old) == 1`
in `python3` before writing — because 08-12 measured that a silently-unapplied mutation looks exactly
like "the check does not catch this". Every restore used `cat backup > target` and was verified **by
checksum**, because `cp` is aliased to `cp -i` on this host and an interactive prompt once left a
mutated file on disk past a timeout.

### Demonstration A — a stale spelling re-introduced into `.planning/WINDOWS.md`

```
mutation landed, live occurrences: 1
   CHECK: FAIL  (ARM headers=3, WINDOWS.md hits=1)  <-- correctly red
FAIL [ARM A/A1-STALE] .planning/WINDOWS.md states A1's WITHDRAWN favourable verdict on 1 live line(s)
--- restore (cat backup > target; cp is aliased to cp -i on this host) ---
restored sha1: fd3d35b47d9f23926cdecbbea900329c0c0b7c2b  (pre-mutation sha1: fd3d35b47d9f23926cdecbbea900329c0c0b7c2b)
restore verified by checksum: MATCH
   CHECK after restore: ARM headers=3, WINDOWS.md hits=0 -> PASS
```

### Demonstration C — the same, on `08-SECURITY.md`

```
mutation landed, live occurrences: 1
   CHECK: FAIL (ARM headers=3, target hits=1)  <-- correctly red
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SECURITY.md states A1's WITHDRAWN favourable verdict on 1 live
   restored sha1: 92126fc043c50f40f5177fef3040ab792b29dec3  (pre-mutation: 92126fc043c50f40f5177fef3040ab792b29dec3)
   restore verified by checksum: MATCH
   CHECK after restore: ARM headers=3, target hits=0 -> PASS
```

### Demonstration D — THE ONE THAT MATTERS: a silent gate

The vacuous-gate defect itself, reproduced against **this plan's own check shape**. Mutation: `exit 3`
inserted immediately after `set -u` in `verdict-gate.sh`, so the gate aborts before any arm runs and
prints zero bytes.

```
mutation landed, occurrences of 'exit 3' after set -u: 1
gate output bytes: 0
--- the WEAK (vacuous) form this plan PROHIBITS: ---
   WEAK CHECK: PASS  <-- FALSE GREEN against a gate that executed nothing
--- the form this plan actually uses (liveness AND absence, ONE capture): ---
   STRONG CHECK: FAIL  (ARM headers=0)  <-- correctly refuses a silent gate
restored gate sha1: 91ca04a2dc0c0bfa8a7da94c000697bc18848f90  (pre-mutation: 91ca04a2dc0c0bfa8a7da94c000697bc18848f90)
restore verified by checksum: MATCH
git status verdict-gate.sh -> ''
```

`verdict-gate.sh | grep -c '08-SECURITY.md' | grep -qx 0` reports **PASS** against a gate that
executed nothing. That is measured output, not a hypothetical, and it is why the liveness half is
never split off into a second run — a second run is a second gate invocation, and the whole
demonstration is that you cannot trust an invocation you did not prove ran.

---

## Deviations from Plan

**None affecting scope or outcome.** Three process notes, all self-caught and recorded because each
is the kind of thing that reads as "fine" in a diff:

1. **[Rule 1 — Bug] The entry-11 edit script's first assertion was wrong, and it failed loudly.**
   It asserted the markdown description occurred once and the JSON-escaped form twice, on the
   assumption they were different strings. They are not: entry 11's description needs no JSON
   escaping, so it occurs **twice** as identical bytes. The script aborted with
   `AssertionError: ('md desc occurrences', 2)` before touching the file. Corrected to assert
   `count == 2` and to assert *explicitly* that neither the old nor the new text needs escaping — so
   the day a quote or backslash enters, the script fails instead of silently writing a divergence.
   No file was modified by the failed run. Commit `01d092c`.

2. **[Rule 1 — Bug] Two mid-paragraph insertions orphaned their tail, caught by reading the result.**
   In `08-UAT.md` the added root-cause paragraph glued the following `08-RESEARCH.md` sentence onto
   its end; in `08-SECURITY.md` the block quote landed mid-paragraph and left "The mechanism that
   answers A6 …" hanging after it. Both were found by printing the rendered section rather than by
   trusting the replacement, and both were relocated. This is why coverage item **D8** is marked
   `human_judgment: true`: a `grep` cannot tell you a paragraph was severed.

3. **[Rule 1 — Bug] A superseded spelling on a live line.** The first draft of `08-VALIDATION.md`'s
   item-5 correction spelled the withdrawn verdict inside a live italic parenthetical while
   describing its withdrawal. Moved into a block quote — the claim unchanged, only the spelling
   relocated. Same shape 08-13 recorded; recorded again because it recurs.

**Total: 3 auto-fixed, 0 escalated.** Nothing under `packages/` was touched; `git diff --name-only`
over the plan's three commits shows **0** files under `packages/`.

---

## What was deliberately NOT done

- **`08-VERIFICATION.md` and `.planning/PROJECT.md` were not touched.** Both carried uncommitted
  modifications predating this run; both were left unstaged, and `git status` confirms they still are.
- **No entry was closed, waived or marked fixed.** Entries 8, 11-19 stay open; entry 20 joins them.
- **A6 was not reverted, softened or bundled into the A1 retraction** anywhere — its pids, its verdict
  word and `08-UAT.md` test 2 are all intact, and three of the five corrections say so explicitly.
- **The gate was not made green by rewriting an artifact.** Every correction preserves its superseded
  text as a dated block quote, or — for the register, which cannot carry one — in its own
  `## Marked corrections` section.

---

## Baseline

Identical to the dispatch baseline in every column:

- `npx vitest run` → **39 passed | 2 skipped (41)** files; **718 passed | 9 skipped (727)** tests
- `pnpm -r typecheck` → exit **0**
- `pnpm lint` → exit **0**

## Known Stubs

None. This plan creates no code.

## Issues Encountered

None blocking. The three process notes above are recorded as deviations.

## Next Phase Readiness

Ready for **08-15**, which is unblocked and inherits an **empty** ARM A worklist — the four carrier
plans (08-11, 08-12, 08-13, 08-14) are complete and every file the gate named has been corrected.
08-15 owns the exit-0 assertion, the re-demonstration of the gate's red input at green, and the
`08-SPIKE.md` edit that makes that assertion self-proving. Nothing this plan owns remains.

Also outstanding, inherited from 08-11 and unchanged by this plan: when this gap-closure round
closes, the seven names in `SUMMARY_KNOWN_UNPINNED` must be promoted to pinned blob hashes and that
list returned to empty.

## Self-Check: PASSED

Files claimed as modified, all present on disk:

```
FOUND: .planning/WINDOWS.md
FOUND: .planning/STATE.md
FOUND: .planning/phases/08-process-lifecycle/08-UAT.md
FOUND: .planning/phases/08-process-lifecycle/08-VALIDATION.md
FOUND: .planning/phases/08-process-lifecycle/08-SECURITY.md
```

Commits claimed, all present in `git log`:

```
FOUND: 01d092c  docs(08-14): retract A1 in ledger entry 11, and record the unfalsifiable probe verdict
FOUND: 72c8dcf  docs(08-14): retract A1 in STATE.md and in 08-UAT.md test 1
FOUND: c58ff15  docs(08-14): retract A1 in 08-VALIDATION.md and 08-SECURITY.md
```

Plan-level `<verification>` re-run at the end of task 3:

- `verdict-gate.sh`, captured once, prints all three `== ARM ` headers and names **none** of this
  plan's five files. **PASS**
- `gsd-tools query state.load` parses `STATE.md`. **PASS**
- `gsd-tools windows status` runs and reports entry 20; table rows (20) == JSON objects (20). **PASS**
- `08-UAT.md` test 2 and `08-SECURITY.md` § *G-02* have no diff hunks. **PASS**
- `git diff --name-only` shows nothing under `packages/`. **PASS**
- All 69 deleted lines across the five diffs accounted for, every superseded claim preserved. **PASS**
