---
phase: 08-process-lifecycle
plan: 13
subsystem: planning-record
tags: [roadmap, requirements, success-criteria, marked-correction, a1, a6, gap-closure, orphan-reap]

requires:
  - phase: 08-process-lifecycle
    provides: "verdict-gate.sh re-pointed by plan 08-11 — the instrument this plan is measured by, and the source of its worklist"
  - phase: 08-process-lifecycle
    provides: "08-VERIFICATION.md gap 1 (A1's retraction) and gap 2 (SC-2 names one mechanism, and that mechanism is measured insufficient)"
  - phase: 08-process-lifecycle
    provides: "the argv-marker orphan reap shipped by plans 08-06/08-07 — the mechanism SC-2 now names"
provides:
  - "ROADMAP SC-2 names BOTH POSIX mechanisms — the process-group path and the argv-marker orphan reap — and states which case each covers"
  - "SC-2 carries the reap's three boundaries inside the criterion: POSIX only (AR-04), idle-gated (AR-07), enumerator spawnability unmeasured (ledger 14/15)"
  - "A third dated amendment note on SC-2 carrying its trigger (A6's pids), its directing decision (GD-01), an explicit unchanged-guarantee statement, and the D-02 precedent"
  - "The override path recorded as considered and NOT taken, with a pointer to 08-VERIFICATION.md § Override suggestion"
  - "Both ROADMAP gap-closure preambles corrected; GD-01 and GD-02 preserved verbatim and stated UNAFFECTED"
  - "REQUIREMENTS LIF-01 and LIF-02 corrected and STILL UNTICKED, citing gaps_found rather than the superseded human_needed verdict"
  - "Coverage rows naming an owning phase for every item not closing in Phase 8, and naming the A1 re-run as ownerless after Phase 8"
  - "verdict-gate.sh names ZERO of this plan's two carriers — the remaining worklist is entirely 08-14's five files"
affects: [08-14, 08-15, 08-16, 08-17]

actuals:
  tokens: 21400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Two-part correction of a single physical line: the correct half stays live, the superseded half moves verbatim into a dated block quote, and the correction states the DIRECTION of the error it replaces"
    - "A criterion amendment that adds boundaries to the mechanism it newly names, so the amendment is strictly harder to satisfy than the claim it replaces"
    - "Moving a quoted-but-indistinguishable phrase off a live line rather than reworditng the claim — a line-oriented scan cannot tell a quotation from an assertion, and the scan is right to refuse both"
    - "Superseded verdict citations named in place (`supersedes the human_needed verdict this row cited until 2026-08-28`) where a table's row count forbids a block quote"

key-files:
  created: []
  modified:
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "SC-2 is AMENDED, not overridden. The override needs an `accepted_by` and an `accepted_at` only the maintainer can supply; the phase already has an honest instrument it has used three times, twice on this very criterion. The override wording stays available and is named inside the new note."
  - "The reap's three boundaries live INSIDE the criterion rather than in a footnote, because that is what makes the amendment harder to satisfy rather than easier — a bare 'the reap closes it' would have been a relaxation."
  - "Clause (a) — the process-group half — is preserved verbatim, including the argv spelling, the negative-pid ban and the KEPT single-pid rung. Nothing in the group half is weakened by naming a second mechanism beside it."
  - "The 2026-08-27 note's error DIRECTION is stated: it UNDER-claimed the rung's necessity. An error toward more caution means nothing shipped wrong on the strength of it, which is why no code changes."
  - "ROADMAP line 371 and REQUIREMENTS LIF-02 each spelled the withdrawn verdict phrase on a LIVE line while describing its withdrawal. Both were moved into the preserved quote rather than reworded away — the claim is unchanged; only the location of the quoted spelling moved."
  - "The coverage table rows carry their superseded `human_needed` citation inline rather than as a block quote, because the acceptance criterion requires the table's row count to stay at 59."
  - "Neither LIF row is ticked. Correcting the sentence beside a checkbox is not the same as earning the checkbox, and 08-VERIFICATION.md confirms leaving both unticked was the right call."

patterns-established:
  - "Every gate-output check captures the gate ONCE and asserts liveness (exactly three `== ARM ` headers) and target-file absence against that SAME capture — demonstrated non-vacuous by sabotaging the gate into silence and watching the weak form go false-green while the strong form refuses"
  - "Every mutation is verified to have LANDED before its result is read, and every restore is verified by checksum rather than asserted"

requirements-completed: []

coverage:
  - id: D1
    description: "ROADMAP SC-2 names both POSIX mechanisms and, for each, the case it covers"
    requirement: LIF-02
    verification:
      - kind: command
        ref: "sed -E '/^[[:space:]]*>/d' .planning/ROADMAP.md | grep -c 'orphan reap' -> 2 (non-zero required)"
        status: pass
      - kind: integration
        ref: "bash verdict-gate.sh — single capture, 3 `== ARM ` headers, 0 occurrences of .planning/ROADMAP.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "SC-2 states all three of the reap's boundaries and cross-references AR-04, AR-07 and ledger entries 14/15 by number"
    requirement: LIF-02
    verification:
      - kind: command
        ref: "criterion 2 body: 'POSIX only' + AR-04, 'idle-gated' + AR-07, 'enumerator being spawnable' + ledger entries 14 and 15 — all three present in the quoted text below"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 2026-08-24 negative-pid amendment note survives byte-unchanged"
    verification:
      - kind: command
        ref: "sha1 of the extracted note before and after = cc3175a4559a491e5b2f391daca0477928bb791c; asserted in the edit script itself"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 2026-08-27 note's A1 argument is preserved verbatim as a dated block quote; every deleted line is accounted for"
    verification:
      - kind: command
        ref: "13-sentence census over the one deleted line; 11 verbatim, 2 split boundaries with both halves individually verified present"
        status: pass
    human_judgment: false
  - id: D5
    description: "GD-01 and GD-02 survive with their original wording and are stated unaffected by the retraction"
    verification:
      - kind: command
        ref: "grep -c 'GD-01' .planning/ROADMAP.md -> 3; grep -c 'GD-02' -> 2; both preamble quotes carry the original decision text verbatim"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both LIF requirement rows remain unticked while their prose is corrected"
    requirement: LIF-01
    verification:
      - kind: command
        ref: "grep -cE '^- \\[ \\] \\*\\*LIF-0[12]\\*\\*' .planning/REQUIREMENTS.md -> 2"
        status: pass
      - kind: integration
        ref: "bash verdict-gate.sh — single capture, 3 `== ARM ` headers, 0 occurrences of .planning/REQUIREMENTS.md"
        status: pass
    human_judgment: false
  - id: D7
    description: "LIF-02 keeps A6's pids and its FALSE verdict; LIF-01 names AR-01, AR-04 and Phase 9 SC-4"
    requirement: LIF-01
    verification:
      - kind: command
        ref: "43921 x2, 43752 x2, 44284 x2, 'measured FALSE' x3, AR-01 x2, AR-04 x2, 'Phase 9 SC-4' x3"
        status: pass
    human_judgment: false
  - id: D8
    description: "The coverage table's row count is unchanged and both LIF rows cite gaps_found with named owners"
    verification:
      - kind: command
        ref: "grep -c '^| ' HEAD vs working -> 59 / 59; both rows carry `gaps_found`, Phase 9 SC-4, and (LIF-02) plans 08-16/08-17 plus the ownerless A1 re-run"
        status: pass
    human_judgment: false
  - id: D9
    description: "No source file is touched and the suite does not move"
    verification:
      - kind: command
        ref: "git diff --name-only 0b1a4c7^..HEAD | grep -c '^packages/' -> 0; npx vitest run -> 727 / 718 passed / 9 skipped; pnpm -r typecheck exit 0; pnpm lint exit 0"
        status: pass
    human_judgment: false
  - id: D10
    description: "Every SC-2 edit moves the criterion toward more precision or more difficulty, and none is a relaxation or a retrofit"
    verification: []
    human_judgment: true
    rationale: "The classification table below is checkable against the diff line by line, and the mechanical half (clause (a) preserved verbatim, three new boundaries added, no deleted reading/pid/date/verdict) is verified. But whether naming a second mechanism after that mechanism shipped is honest amendment or retrofit is a judgment about intent that no grep makes. The evidence offered for the honest reading: the amendment ADDS three constraints that did not exist and preserves every constraint that did."

duration: 24 min
completed: 2026-08-28
status: complete
---

# Phase 8 Plan 13: SC-2 names the mechanism that actually serves the POSIX guarantee, and the LIF rows say what is true

**Criterion 2 no longer describes a guarantee delivered by one mechanism that A6's falsification
measured insufficient: it now names BOTH the process-group path and the argv-marker orphan reap,
says which case each covers, and carries the reap's three boundaries inside the criterion so the
amendment is strictly harder to satisfy than the claim it replaces — and `LIF-01`/`LIF-02` keep
their unticked checkboxes while their prose stops resting on a withdrawn reading and starts naming
an owner for every item Phase 8 does not close.**

## Performance

| | |
|---|---|
| Duration | 24 min |
| Tasks | 3 of 3 |
| Commits | 3 |
| Files modified | 2 |
| Lines | +21 / -7 |

## The state the gate is in, and why non-zero is correct

`bash .planning/phases/08-process-lifecycle/verdict-gate.sh` **exits 1** at the end of this plan.
**That is the correct state and this plan does not assert otherwise** — 08-14 owns the five
remaining carriers and 08-15 owns the exit-0 assertion. What this plan asserts is narrower and is
measured: **the gate names neither of this plan's two carriers, in a capture proven live.**

Every gate check in this plan captured the gate ONCE and asserted, against that same capture, both
LIVENESS (exactly three `== ARM ` header lines) and the target-file absence. The weak form —
`verdict-gate.sh | grep -c <file> | grep -qx 0` — is never used, and § *Red-input demonstration B*
below shows exactly why by making it go false-green.

---

## The full new text of criterion 2

```
  2. On POSIX the same guarantee holds — no orphaned token-bearing process survives a turn — and it
     is served by **TWO mechanisms**, each covering the case the other cannot. **(a) The
     process-group path**, for the case where the CLI's MCP child STAYS in the CLI's process group:
     that child — which carries `CAIDO_TOKEN` in its environment — is killed with the parent, via
     `detached: true` at the provider spawn **plus a spawned `kill` process-group signal** —
     `spawn("kill", ["-TERM", "--", "-<pid>"])`, then the same with `-KILL` — **in addition to** the
     single-pid SIGTERM→SIGKILL ladder, which is KEPT on POSIX rather than replaced (LIF-02); the
     runtime's own negative-pid spelling of that signal stays BANNED, per the 2026-08-24 note below.
     **(b) The argv-marker orphan reap**, for the case where it does NOT — which is the case
     actually measured on 2026-08-27 for the one provider anyone has measured: a scan for Drift's
     own session-unique temp-directory marker adjacent to `mcp-server.mjs`
     (`buildSessionOrphanScanPlan` → `parseOrphanScanPids`), followed by a **POSITIVE single-pid
     kill** (`buildOrphanKillPlan`), wired at start-up (`reapMcpOrphans`) and on the idle-gated
     cancel/close/timeout path (`reapSessionOrphansIfIdle`, gated by `shouldReapSessionOrphans`).
     Clause (b) is a **stronger identity than (a), not a workaround**: it names its target by the
     target's OWN COMMAND LINE, so it is independent of process groups **by construction**, and it
     is the only termination path in Drift that can reach an MCP child Drift did not spawn. **What
     (b) does NOT cover — stated inside the criterion so this amendment cannot be read as claiming
     more than the mechanism delivers:** it is **POSIX only**, with no equivalent command-line
     enumerator on Windows, so the foreign-parented orphan class is unreachable there (**AR-04**);
     it is **idle-gated**, firing when no session is active rather than continuously, so cancelling
     one session while another is live leaves that orphan to clause (a) until the last session
     closes (**AR-07**); and it **depends on the enumerator being spawnable inside Caido's
     sandbox**, which is UNMEASURED and fails closed into an `enumerator-unavailable` no-op that
     removes no pre-existing termination path (broken-windows ledger entries **14** and **15**).
```

*(Line-wrapped here for reading. In `ROADMAP.md` it is one physical line, line 312, because that is
how every other criterion in the file is written.)*

---

## Precision or difficulty: every SC-2 edit classified

The plan's own threat register calls out **T-08-60**: the failure mode of amending a criterion
after the code shipped is retrofitting — relaxing the words until the code passes. Each edit is
classified below, and each classification is checkable against `git show 0b1a4c7 -- .planning/ROADMAP.md`.

| # | Edit | Precision or difficulty | Why it is neither a relaxation nor a retrofit |
|---|------|------------------------|-----------------------------------------------|
| 1 | Opening restated as "the same guarantee holds — **no orphaned token-bearing process survives a turn** — and it is served by **TWO mechanisms**" | **Precision** | The guarantee is spelled out where it was previously only referred to as "the same guarantee". Nothing about what must be true changed; a reader no longer has to walk up to SC-1 to learn what "the same" means. |
| 2 | The whole group mechanism relabelled **clause (a)** and scoped to "the case where the CLI's MCP child STAYS in the CLI's process group" | **Precision** | The scope was always the truth — a group signal has never reached a child in a different group. Before A6 was measured this scope was implicit and read as universal. Naming it is not a narrowing of the requirement; it is a correction of a reader's over-reading. Every substantive clause of (a) is **byte-verbatim**: the argv spelling `spawn("kill", ["-TERM", "--", "-<pid>"])`, the `CAIDO_TOKEN` clause, `-KILL`, "in addition to", and "KEPT on POSIX rather than replaced (LIF-02)" — a 351-character contiguous run, verified present exactly once. |
| 3 | **Clause (b) added** — the argv-marker orphan reap, named by its six shipped symbols, wired at both call sites | **Difficulty** | This is a **second mechanism the criterion now demands**. Before this edit the criterion was satisfiable by clause (a) alone. After it, an implementation with only (a) fails. This is the edit that would be a retrofit if it *replaced* (a) — it does not; it is additive. |
| 4 | "(b) is a **stronger identity than (a), not a workaround**", with the reason (identity by the target's own command line, independent of process groups by construction) | **Precision** | An argument, not a requirement. It exists so a future reader does not "simplify" (b) away as redundant scaffolding around (a). |
| 5 | **Boundary 1 added:** POSIX only, no Windows command-line enumerator, foreign-parented class unreachable there (**AR-04**) | **Difficulty** | The criterion now asserts a *limit* on the mechanism it names. A future verifier who finds (b) claimed as covering Windows has a criterion to fail it against. A bare "the reap closes it" would have had nothing to say. |
| 6 | **Boundary 2 added:** idle-gated, fires when no session is active, multi-session cancel window left to clause (a) (**AR-07**) | **Difficulty** | Same shape. This boundary is the one most likely to be forgotten, because it is invisible in single-session use — which is all anyone has run. |
| 7 | **Boundary 3 added:** enumerator spawnability inside Caido's sandbox is UNMEASURED and fails closed into an `enumerator-unavailable` no-op (ledger **14**/**15**) | **Difficulty** | The strongest of the three. It states, inside the criterion itself, that the mechanism the criterion now relies on **may be inert on the shipping runtime**. A criterion that admits its own mechanism is unmeasured cannot be used to claim the guarantee is proven. |
| 8 | The 2026-08-27 note's A1 re-justification corrected: A1 OPEN, so the single-pid rung defends the **PRESENT** Caido too | **Difficulty** | Strictly *more* justification is now required for the rung's existence, not less. The 2026-08-27 wording said the rung survives only against a hypothetical future Caido; the correction says it is load-bearing now. |
| 9 | Third amendment note added (trigger, decision, unchanged-guarantee statement, precedent, override-not-taken) | **Precision** | Record only. Adds no obligation; makes the three stacked amendments auditable. |

**Nothing was deleted from the criterion's demands.** The one deleted physical line reappears in
full — see the accounting below. **Total: 4 precision edits, 5 difficulty edits, 0 relaxations.**

The check a reader can run: `git show 0b1a4c7 -- .planning/ROADMAP.md` has exactly **one** deleted
line and **nine** added lines. Every clause in the deleted line is locatable among the added ones.

---

## The A1 correction inside the 2026-08-27 note

The note's final argument — that the rung was written against an *unmeasured* A1, that A1 had since
been measured favourably, and that the rung therefore survived only as defence against a **future**
Caido rebasing its LLRT fork — rests on the reading gap 1 retracts. It is now a dated block quote,
with the correction written above it:

> A1's 2026-08-27 reading was withdrawn on 2026-08-28: the probe at `68199fa` determined liveness
> with `signalRef.process?.kill?.(pid, 0) ?? false` on a runtime where the SAME diagnostics run
> measured `process.kill` ABSENT, so the optional chain yielded `undefined`, `?? false` made
> `alive === false`, and the favourable string was emitted UNCONDITIONALLY — the red input did not
> exist, so the reading carries no information. **A1 is OPEN, not measured**, and with A1 open the
> single-pid rung is defence against the **PRESENT** Caido as well as a future one.

**The direction is stated, as 08-12 stated it for OQ-2:** the 2026-08-27 note **UNDER-claimed** the
rung's necessity. That is an error toward more caution, which is why nothing shipped wrong on the
strength of it and why **no code changes as a result**.

**The rest of the 2026-08-27 note stands and is live, unedited:** the original "instead of today's
single-pid ladder" clause really was stale, the shipped `killTree` really does fire both rungs, and
correcting the criterion rather than the code really was the right call. That half is preserved
byte-verbatim (`note27_keep` asserted present exactly once by the edit script).

---

## The 2026-08-24 negative-pid note — byte-unchanged, and the one acceptance criterion I could not meet literally

The plan's acceptance criterion reads: *"The 2026-08-24 negative-pid amendment note is
byte-unchanged … Show it has no diff hunk."* **The byte-unchanged half is met and measured. The
"no diff hunk" half is not achievable and I am recording that rather than quietly reporting a pass.**

Criterion 2 and both of its pre-existing amendment notes are **one physical line** in `ROADMAP.md`
(line 312, 3,079 characters). Correcting the A1 argument requires moving it into a block quote, and
a block quote requires its own line — so the single line must be split, and any split produces a
hunk covering the whole line, including the 2026-08-24 note's text. There is no edit that removes a
live stale claim from that line while leaving the line's tail outside the hunk.

What is measured instead, and is strictly stronger than "no hunk":

```
sha1 of the extracted 2026-08-24 note, in HEAD~3 : cc3175a4559a491e5b2f391daca0477928bb791c
sha1 of the extracted 2026-08-24 note, in HEAD   : cc3175a4559a491e5b2f391daca0477928bb791c
occurrences in the new file                      : 1
```

The assertion is inside the edit script itself (`assert after.count(note24) == 1` plus the sha1
comparison), so the edit could not have completed with the note altered. The note is unchanged in
content, unchanged in position relative to the criterion, and unchanged in role.

---

## Accounting of every deleted line

### `.planning/ROADMAP.md` — task 1: **1 deleted line**, fully accounted

The deleted line is old line 312 in its entirety. A sentence-level census split it into 13
sentences; **11 are present verbatim in the new text**. The 2 that are not are both *split
boundaries*, and both halves of each were verified individually:

| Sentence | Disposition |
|---|---|
| The criterion's opening sentence ("On POSIX the same guarantee holds: the CLI's MCP child — …") | **This IS the amendment.** Its substantive content survives as a 351-character verbatim run inside clause (a) — verified: `which carries \`CAIDO_TOKEN\` … KEPT on POSIX rather than replaced (LIF-02)` present ×1. The opening phrase "On POSIX the same guarantee holds" is also present ×1. |
| `Nothing else in this criterion is weakened.)* *(**Amended 2026-08-24 during Phase 8 planning**, per …` | A straddle across the note27/note24 boundary. Half 1, "Nothing else in this criterion is weakened." → present ×1 (inside the preserved quote). Half 2, the note24 opening → present ×1 (live). |

**No deleted line carries a reading, pid, date or verdict cell that does not reappear.** Verified
individually: `grandchild-died (detached honoured)` ×1, `darwin 25.6.0` ×1, and the A6 pids are not
in this line at all (they are added by the new note, not deleted).

### `.planning/ROADMAP.md` — task 2: **2 deleted lines**, both preserved verbatim

| Deleted | Where it reappears |
|---|---|
| Line 347, the 2026-08-27 gap-closure preamble | Verbatim in the `> *SUPERSEDED (written 2026-08-27; the A1 half was RETRACTED 2026-08-28):*` block quote — asserted present exactly once by the edit script |
| Line 371, the 2026-08-28 second-round preamble | Verbatim in the `> *SUPERSEDED SPELLING (written 2026-08-28, corrected the same day):*` block quote — asserted present exactly once |

Both hunks (`@@ -347 +347,3 @@`, `@@ -371 +373,3 @@`) fall inside Phase 8's section (lines 304–396
in HEAD). **`ROADMAP.md`'s total heading count is unchanged at 31** before and after.

### `.planning/REQUIREMENTS.md` — task 3: **4 deleted lines**, all accounted

| Deleted | Where it reappears |
|---|---|
| The `LIF-01` requirement row | Its full prose, verbatim, in the `> *SUPERSEDED (written 2026-08-27):*` quote beneath the corrected row — asserted present exactly once |
| The `LIF-02` requirement row | Same, in its own dated quote — asserted present exactly once |
| The `LIF-01` coverage-table row | The table's row count is fixed at 59 by an acceptance criterion, so a block quote is not available. The superseded text is preserved **inline**: `Partial — mechanism built, Windows execution unrun` survives verbatim, and the superseded verdict is named rather than deleted (`supersedes the \`human_needed\` verdict this row cited until 2026-08-28`) |
| The `LIF-02` coverage-table row | Same: `Partial — mechanism built, A6 measured FALSE, reap unasserted` survives verbatim, with the `human_needed` citation preserved as a named supersession |

**A6's verdict, pids and date survive in both files.** `REQUIREMENTS.md`: `43921` ×2, `43752` ×2,
`44284` ×2, `measured FALSE` ×3. `ROADMAP.md`: A6's pids are now stated in *more* places than
before, because the new amendment note cites them as its trigger. **A6 is nowhere softened,
reverted, or bundled into the A1 retraction.**

---

## The before/after gate captures, both files

Every capture below carries all three `== ARM ` header lines. A capture without them proves
nothing, which is the whole point of § *Red-input demonstration B*.

### BEFORE (plan start, HEAD = `e3a6efc`) — seven files named, two of them mine

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE] .planning/REQUIREMENTS.md states A1's WITHDRAWN favourable verdict on 1 live line(s) …
FAIL [ARM A/A1-STALE] .planning/STATE.md … on 2 live line(s) …
FAIL [ARM A/A1-STALE] .planning/WINDOWS.md … on 3 live line(s) …
FAIL [ARM A/A1-STALE] .planning/ROADMAP.md … on 3 live line(s) …
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-VALIDATION.md … on 3 live line(s) …
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SECURITY.md … on 2 live line(s) …
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-UAT.md … on 1 live line(s) …
FAIL [ARM A/A1-READING] …08-SECURITY.md / …08-UAT.md / …08-VALIDATION.md / .planning/ROADMAP.md /
                        .planning/STATE.md / .planning/WINDOWS.md  (6 files)
== ARM B: positive content on the known carriers ==
FAIL [ARM B] …08-VALIDATION.md ×2, …08-SECURITY.md ×2, .planning/WINDOWS.md ×2, .planning/STATE.md ×1
== ARM C: the dated *-SUMMARY.md class is unmodified ==

verdict-gate.sh: FAIL
```

`ARM headers: 3` · `ROADMAP.md hits: 2` (A1-STALE + A1-READING) · `REQUIREMENTS.md hits: 1`

### AFTER TASK 1 (SC-2 amended) — ROADMAP down from 2 hits to 1

```
ARM headers: 3
ROADMAP hits: 1
FAIL [ARM A/A1-STALE] .planning/ROADMAP.md states A1's WITHDRAWN favourable verdict on 2 live line(s) …
```

Three live lines → two, and **A1-READING dropped out entirely** because the file now carries
`RETRACTED`. The SC-2 region itself measured clean at this point:

```
$ awk 'NR>=312 && NR<=320' .planning/ROADMAP.md | sed -E '/^[[:space:]]*>/d' \
    | grep -cE 'CLOSED[- ]FAVOURABLY|closed favourably|measured favourably|favourably by measurement'
0
```

### AFTER TASK 2 (both preambles corrected) — ROADMAP clear

```
PASS: 3 ARM headers AND 0 ROADMAP.md hits in the SAME capture
```

### AFTER TASK 3 (LIF rows corrected) — both carriers clear

```
PASS: 3 ARM headers AND 0 REQUIREMENTS.md AND 0 ROADMAP.md hits in ONE capture
PASS: exactly 2 unticked LIF rows
```

### FINAL — the gate's remaining worklist is entirely 08-14's

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE]   .planning/STATE.md (2 lines) · .planning/WINDOWS.md (3) ·
                        …/08-VALIDATION.md (3) · …/08-SECURITY.md (2) · …/08-UAT.md (1)
FAIL [ARM A/A1-READING] …/08-SECURITY.md · …/08-UAT.md · …/08-VALIDATION.md ·
                        .planning/STATE.md · .planning/WINDOWS.md
== ARM B: positive content on the known carriers ==
FAIL [ARM B]            …/08-VALIDATION.md ×2 · …/08-SECURITY.md ×2 ·
                        .planning/WINDOWS.md ×2 · .planning/STATE.md ×1
== ARM C: the dated *-SUMMARY.md class is unmodified ==

verdict-gate.sh: FAIL
```

`ARM headers: 3` · `ROADMAP.md: 0` · `REQUIREMENTS.md: 0` · **files named under `packages/`: 0**

**Five files remain, all five are 08-14's, and nothing is left over.** 08-12's seven-file worklist
minus this plan's two equals exactly this set.

---

## Red-input demonstrations

Both were performed by mutation, with the mutation verified to have LANDED before its result was
read, and both restores verified by checksum rather than asserted — the 08-12 lesson that a
silently-unapplied mutation looks exactly like "the check does not catch this".

### Demonstration A — a live stale spelling re-introduced into `ROADMAP.md`

Mutation: `A1 was measured favourably on 2026-08-27.` inserted as a live line above Phase 8's
**Goal**.

```
mutation landed, occurrences: 1
CHECK: FAIL  (ARM headers=3, ROADMAP hits=1)
--- restored ---
restored sha1: 2914f74bb180323df68939baa6e61e8f7681b092  (backup: 2914f74bb180323df68939baa6e61e8f7681b092)
git status .planning/ROADMAP.md -> 0 lines
CHECK after restore: PASS
```

The check is red on the exact regression it exists to prevent, and green again once removed.

### Demonstration B — THE ONE THAT MATTERS: a SILENT gate

This is the vacuous-gate defect itself, reproduced. Mutation: `exit 3` inserted immediately after
`set -u` in `verdict-gate.sh`, so the gate aborts before any arm runs and prints **nothing**.

```
mutation landed, occurrences: 1
gate output bytes: 0

--- the WEAK (vacuous) form, which this plan's prohibition forbids: ---
   WEAK CHECK: PASS  <-- FALSE GREEN on a silent gate

--- the form this plan actually uses (liveness + absence, one capture): ---
   STRONG CHECK: FAIL  (ARM headers=0) <-- correctly refuses a silent gate

restored gate sha1: 91ca04a2dc0c0bfa8a7da94c000697bc18848f90
git status verdict-gate.sh -> ''
```

**`verdict-gate.sh | grep -c '.planning/ROADMAP.md' | grep -qx 0` reports PASS against a gate that
executed nothing.** That is not a hypothetical; it is the measured output above. The liveness half
is what makes the difference, and it is why it is never split across a second gate run.

---

## A1 hits outside Phase 8's section: none

The plan requires any A1 hit outside Phase 8 to be **reported, not edited**. Measured rather than
assumed: the gate named `.planning/ROADMAP.md` on 3 live lines, at 312, 347 and 371 — Phase 8's
section spans lines 304–396 in HEAD, so all three were inside it. A full `grep -n 'A1'` over the
file confirms every other mention (lines 330, 351, 367, 375, 379, 380, 393) is a plan-list
description of what a plan *does about* A1, none of which asserts A1 was measured.

**Nothing to report as an unowned finding.**

---

## LIF-01 and LIF-02 — what changed, and what deliberately did not

**Neither row is ticked.** `grep -cE '^- \[ \] \*\*LIF-0[12]\*\*' → 2`.

**LIF-02.** The clause asserting A1 was measured favourably on real hardware is retracted with its
mechanism named. Everything else in the row's prose survives and is correct: the mechanism is built,
it is behaviourally proven under Node with a control, **A6 was measured FALSE with pids 43921 /
43752 / 44284**, the argv-marker reap is what closes the requirement independently of process
groups, and that reap is itself covered by no executed assertion on the shipping runtime (ledger
entries 13 and 15).

One wording note, recorded because it is the same shape as ROADMAP line 371: my first draft of the
retraction *spelled* the withdrawn phrase on a live line while describing its withdrawal. The gate
caught it — correctly, because no line-oriented scan can distinguish a quotation from an assertion.
The exact superseded wording lives in the block quote; the live line refers to it rather than
restating it. **The claim is unchanged; only the location of the spelling moved.**

**LIF-01.** Checked against the gate's output rather than assumed — the gate named nothing in it,
so no retraction was needed. What was added is the two residuals that bound it and were not named
there: **AR-01** (`taskkill /T` cannot reach a grandchild whose intermediate parent has already
exited, so the three-level `cmd.exe` → provider → `node mcp-server.mjs` shape can leak the
token-bearing leaf) and **AR-04** (no Windows command-line enumerator, so the foreign-parented
G-04 class the reap reaches on POSIX is unreachable on Windows). **Owner of the one thing that
closes the row: ROADMAP Phase 9 SC-4** — a green `windows-latest` leg. Nothing in Phase 8 can
close it.

**Both coverage rows** now cite `gaps_found` — `08-VERIFICATION.md`'s actual verdict — instead of
the `human_needed` verdict it superseded, with the supersession named rather than deleted. Owners:

| Item | Owner |
|---|---|
| The Windows execution leg | **Phase 9 SC-4** |
| Post-fix POSIX cancel and timeout measurements | **Phase 8, plan 08-16** |
| The A1 re-run with the fixed probe | **Phase 8, plan 08-17** |
| **The A1 re-run after Phase 8 closes** | **NOBODY** — written into the LIF-02 coverage row in plain words, because it is the fact most likely to be lost |

That last row is threat **T-08-62**'s mitigation, and it is the reason the sentence is phrased as an
absence rather than omitted.

---

## Deviations from Plan

**1. [Record-only] The "no diff hunk" acceptance criterion on the 2026-08-24 note is not
literally achievable, and the stronger achievable check was substituted.**

- **Found during:** Task 1.
- **Issue:** Criterion 2 and both existing amendment notes are one physical line. Removing a live
  stale claim from that line requires splitting it, and every split produces a hunk covering the
  whole line including the 2026-08-24 note's tail.
- **What was done instead:** the note's byte-identity is asserted by sha1
  (`cc3175a4559a491e5b2f391daca0477928bb791c`, identical before and after) and by an
  `assert after.count(note24) == 1` inside the edit script, so the edit could not have completed
  with the note altered. Documented in full in § *The 2026-08-24 negative-pid note* above.
- **Files modified:** none beyond the plan's own.
- **Commit:** `0b1a4c7`.

**2. [Record-only] Task 1's `<automated>` verify is only satisfiable after Task 2.**

- **Found during:** Task 1.
- **Issue:** Tasks 1 and 2 both edit `ROADMAP.md`, and the file-level "gate names no
  `.planning/ROADMAP.md`" check is duplicated on both. It cannot pass at the end of Task 1, because
  Task 2 exists precisely to clear the file's other two carrier lines.
- **What was done instead:** Task 1 was verified with a *line-scoped* measurement over the SC-2
  region — `0` live stale spellings across lines 312–320 — asserted against a gate capture proven
  live (3 `== ARM ` headers), plus the drop from 3 hit-lines to 2 and A1-READING dropping out
  entirely. The file-level absence was then measured and pasted at Task 2.
- **Commits:** `0b1a4c7`, `2c5dddc`.

**3. [Rule 1 — consistency] Typographic apostrophes normalised to ASCII.**

- **Found during:** Task 1.
- **Issue:** My first draft of the amendment introduced 12 U+2019 apostrophes into a file that had
  **zero** (`git show HEAD:.planning/ROADMAP.md | grep -c '’'` → 0). A mixed-encoding file breaks
  fixed-string greps against it — including the ones this phase's gates and this SUMMARY's own
  accounting rely on.
- **Fix:** global replacement to ASCII, with the 2026-08-24 note's sha1 re-verified after the pass
  to prove the normalisation had not touched it.
- **Commit:** `0b1a4c7` (fixed before the commit).

**Total deviations:** 2 record-only, 1 auto-fixed (Rule 1).
**Impact:** none on the deliverable. All three acceptance-criterion intents are met; one is met by
a measurement stronger than the literal wording asked for, and that substitution is recorded here
rather than reported as a pass.

**Not a deviation, recorded so a reviewer does not wonder:** `.planning/PROJECT.md` and
`.planning/phases/08-process-lifecycle/08-VERIFICATION.md` carry uncommitted modifications that
predate this run. They were left unstaged and untouched, as instructed.

---

## Authentication Gates

None.

## Known Stubs

None. No placeholder, TODO, FIXME or hardcoded empty value was introduced. This plan creates no
code symbols and no new files; it modifies prose in two planning documents.

## Threat Flags

None. All three threats in the plan's register are in-scope and all three dispositions are honoured:

- **T-08-60** (retrofitting a criterion to match shipped code) — mitigated by the nine-row
  precision/difficulty classification above, checkable against a one-deleted-line diff; by clause
  (a) surviving as a 351-character verbatim run; and by three added boundaries that make the
  criterion strictly harder to satisfy than the bare claim it replaces.
- **T-08-61** (overwriting stacked amendment notes) — mitigated by the block-quote convention, by
  the deleted-line accounting above, and by the 2026-08-24 note's sha1 asserted inside the edit
  script.
- **T-08-62** (an ownerless item that reads as owned) — mitigated by the LIF-02 coverage row
  stating in plain words that no later phase in this milestone owns the A1 re-run.

No security-relevant surface was introduced or changed: no network endpoint, no auth path, no file
access, no schema change. Zero files under `packages/` are touched.

## Issues Encountered

None blocking. Two process notes:

1. **`cp` is aliased to `cp -i` on this host**, so a restore inside demonstration A blocked on an
   interactive prompt and timed out with the mutated file still on disk. Recovered by restoring
   with `cat backup > target`, and the restore verified by sha1 rather than by the absence of an
   error. Recorded because "the restore command exited" and "the file is restored" are different
   claims, and this round exists because of that class of gap.
2. **A gate that catches its own author.** My first draft of LIF-02's retraction spelled the
   withdrawn verdict phrase on a live line while describing its withdrawal, and ARM A/A1-STALE went
   red on it. That is the instrument working, not a false positive — the fix moved the spelling into
   the quote rather than weakening the claim.

## Next Phase Readiness

Ready for **08-14**, which is unblocked and whose worklist is exactly the five files the final gate
capture names: `.planning/STATE.md`, `.planning/WINDOWS.md`, `08-VALIDATION.md`, `08-SECURITY.md`
and `08-UAT.md`. Nothing this plan owns remains.

**The gate is still RED and will stay red until 08-15.** That is correct and expected, and this plan
asserted only the narrower fact it could measure: neither of its two carriers is named, in a capture
proven live.

## Self-Check: PASSED

Files claimed as modified, all present on disk:

```
FOUND: .planning/ROADMAP.md
FOUND: .planning/REQUIREMENTS.md
```

Commits claimed, all present in `git log`:

```
FOUND: 0b1a4c7  docs(08-13): amend SC-2 to name both POSIX mechanisms, and retract A1 inside it
FOUND: 2c5dddc  docs(08-13): correct both ROADMAP gap-closure preambles for A1's retraction
FOUND: e69d7c0  docs(08-13): correct LIF-01/LIF-02 prose and their coverage rows
```

Plan-level `<verification>` re-run at the end of task 3:

- `verdict-gate.sh` names neither `.planning/ROADMAP.md` nor `.planning/REQUIREMENTS.md`, measured
  against a single capture carrying all three `== ARM ` header lines. **PASS**
- Both LIF requirement rows are still unticked — `grep -cE '^- \[ \] \*\*LIF-0[12]\*\*'` → **2**. **PASS**
- `git diff --stat 0b1a4c7^..HEAD` touches exactly **2** files. **PASS**
- `git diff --name-only 0b1a4c7^..HEAD | grep -c '^packages/'` → **0**. **PASS**
- Every SC-2 edit is classified precision-or-difficulty and defended against the diff — 4 precision,
  5 difficulty, 0 relaxations. **PASS**

Baseline held, nothing regressed:

- `npx vitest run` → **39 passed | 2 skipped (41)** files; **718 passed | 9 skipped (727)** tests —
  identical to the dispatch baseline in every column.
- `pnpm -r typecheck` → exit **0**. `pnpm lint` → exit **0**.
- `ROADMAP.md` heading count **31** before and after; `REQUIREMENTS.md` table row count **59** before
  and after.
- Both red-input demonstrations restored by checksum, both files reported clean by `git status`.
