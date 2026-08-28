---
phase: 08-process-lifecycle
plan: 12
subsystem: process-lifecycle
tags: [liveness, three-valued, a1, retraction, marked-correction, gap-closure, tdd]

requires:
  - phase: 08-process-lifecycle
    provides: "verdict-gate.sh re-pointed by plan 08-11 — the instrument this plan is measured by"
  - phase: 08-process-lifecycle
    provides: "08-VERIFICATION.md gap 1 — the defective expression and the reading it produced"
provides:
  - "classifyLivenessObservation — alive / dead / inconclusive, with a closed reason vocabulary and a ladder whose default is inconclusive"
  - "buildLivenessProbePlan — a spawned single-pid process-table lookup, replacing the absent process.kill primitive as the liveness source"
  - "formatSpikeVerdict — the two 2026-08-27 strings byte-identical plus a third that shares no verdict word with either"
  - "An executed 120-combination totality case that no coalescing implementation can pass"
  - "kill-plan.ts, index.ts and kill-tree.posix.test.ts each state A1's actual verdict, with every superseded line preserved"
  - "verdict-gate.sh names ZERO files under packages/ — the remaining worklist is entirely 08-13's and 08-14's"
affects: [08-13, 08-14, 08-15, 08-17]

actuals:
  tokens: 13344
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Three-valued determination with a closed reason union: the cannot-tell answer is a first-class result, not an error case or a default"
    - "Totality case over the cartesian product of the input domain, with the expected verdict re-derived from the contract rather than from the implementation"
    - "Red input demonstrated by mutation: corrupt, capture, restore, and pin the restored file by checksum"
    - "Marked correction with full preservation, applied to a claim that was WRONG rather than merely superseded"

key-files:
  created: []
  modified:
    - packages/backend/src/kill-plan.ts
    - packages/backend/src/kill-plan.test.ts
    - packages/backend/src/index.ts
    - packages/backend/src/kill-tree.posix.test.ts

key-decisions:
  - "The classifier takes exit code 0 and exit code 1 as the ONLY recognised codes; 2, 127 and -1 are the instrument misbehaving and return inconclusive rather than being folded into the non-match arm"
  - "Exit 0 with no matching row is `contradictory-output` (inconclusive), not `dead` — an enumerator that reports success and prints nothing is contradicting itself, and that is not evidence of absence"
  - "Exit 1 WITH a matching row is also inconclusive, so the contradiction is caught in both directions rather than only in the one that would have shipped"
  - "buildLivenessProbePlan spawns `ps` by bare name, accepted under T-08-55 on two bounds: it is consumed only by an uncommitted local diagnostic build, and a hijacked binary yields `inconclusive` rather than a wrong verdict because the classifier requires a pid-matching row"
  - "The A1 Reading line is KEPT live in every carrier and only the Verdict line is retracted — the instrument really printed that string, and deleting it would hide what the phase acted on"
  - "OQ-2's correction states its DIRECTION: the 2026-08-27 revision under-claimed the rung's necessity, an error toward more caution, which is why nothing shipped wrong on the strength of it"

patterns-established:
  - "A gate-output absence check captures the gate ONCE and asserts liveness (exactly three `== ARM ` headers) against the SAME capture as the file-absence count, so an empty match set cannot satisfy it"
  - "Every mutation demonstration restores from a checksummed backup and re-prints the checksum, so 'restored' is measured rather than asserted"

requirements-completed: [LIF-01, LIF-02]

coverage:
  - id: D1
    description: "classifyLivenessObservation returns inconclusive — never dead — for every input shape that is not a confident observation"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#classifyLivenessObservation — TOTALITY: a definite verdict is reachable ONLY from the enumerated confident shapes"
        status: pass
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#classifyLivenessObservation — every unanswerable shape is inconclusive, never dead"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pid that is a prefix, suffix or substring of the requested pid is not treated as a match"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#does not treat a prefix, suffix or substring pid as the requested pid"
        status: pass
      - kind: mutation
        ref: "pid equality replaced by rawLine.includes(String(pid)); 2 failed | 104 passed"
        status: pass
    human_judgment: false
  - id: D3
    description: "The target row is located by pid equality anywhere in stdout, not by line index"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#yields the SAME verdict wherever the matching row sits"
        status: pass
      - kind: mutation
        ref: "line scan replaced by stdout.split(\"\\n\")[0]; 5 failed | 101 passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "buildLivenessProbePlan refuses an unusable pid and win32, and emits a positive single-pid operand with no process-group reference"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#buildLivenessProbePlan — a POSITIVE single-pid operand, never a group (GD-01)"
        status: pass
      - kind: command
        ref: "printed argv for pid 44284 on darwin: [\"-o\",\"pid=,state=\",\"-p\",\"44284\"]"
        status: pass
    human_judgment: false
  - id: D5
    description: "formatSpikeVerdict renders inconclusive as a string containing neither verdict's word, and the three outputs are pairwise distinct"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#formatSpikeVerdict — an inconclusive answer never wears a verdict's clothes"
        status: pass
      - kind: mutation
        ref: "inconclusive branch made to fall through to the favourable string; 3 failed | 103 passed"
        status: pass
    human_judgment: false
  - id: D6
    description: "kill-plan.ts, index.ts and kill-tree.posix.test.ts each state A1's verdict as withdrawn, with the 2026-08-27 reading preserved and the A6 verdict unchanged"
    requirement: LIF-01
    verification:
      - kind: integration
        ref: "bash .planning/phases/08-process-lifecycle/verdict-gate.sh — single capture carrying all three `== ARM ` headers, 0 occurrences of any packages/ file"
        status: pass
    human_judgment: false
  - id: D7
    description: "kill-plan.ts still declares exactly one import, ./platform"
    verification:
      - kind: command
        ref: "sed -E 's://.*::' packages/backend/src/kill-plan.ts | grep -cE '^import' -> 1"
        status: pass
    human_judgment: false
  - id: D8
    description: "The suite count does not decrease; every added test executes on this host"
    verification:
      - kind: command
        ref: "npx vitest run -> 39 passed | 2 skipped (41) files; 718 passed | 9 skipped (727) tests"
        status: pass
    human_judgment: false
  - id: D9
    description: "The cancel and timeout surfaces visible to the user are unchanged by construction — no frontend or shared file is touched"
    verification:
      - kind: command
        ref: "git log --name-only f53796c^..HEAD | grep -cE '^packages/(frontend|shared)/' -> 0"
        status: pass
    human_judgment: false
  - id: D10
    description: "The corrected prose reads as one argument rather than a retraction bolted onto a contradicting paragraph"
    verification: []
    human_judgment: true
    rationale: "Whether the joined A1 block reads as a coherent finding — the verdict line called a primitive the same reading measured absent — rather than as two paragraphs that happen to sit together is a judgment no grep makes. The mechanical half (no live stale verdict, every deleted line accounted for, A6 byte-unchanged) is verified."

duration: 16 min
completed: 2026-08-28
status: complete
---

# Phase 8 Plan 12: A three-valued liveness determination, and A1 retracted in all three source carriers

**Gap 1's defect — `signalRef.process?.kill?.(pid, 0) ?? false` on a runtime the same
diagnostics run measured as having no `process.kill`, so the favourable verdict string was
emitted unconditionally — is now a tested pure function whose cannot-tell answer cannot be
reached by a coalescing operator, proven by four executed red-input mutations and a
120-combination totality case; and `kill-plan.ts`, `index.ts` and `kill-tree.posix.test.ts`
each state A1's actual verdict, leaving `verdict-gate.sh` naming zero files under `packages/`.**

## Performance

| | |
|---|---|
| Duration | 16 min |
| Tasks | 3 |
| Commits | 4 (RED + GREEN + two comment-only corrections) |
| Files modified | 4 |
| Lines | +1061 / -44 |

## Accomplishments

### 1. The decision that produced gap 1 now lives where a test can reach it

`packages/backend/src/kill-plan.ts` gained `LivenessVerdict`, `LivenessReason`,
`LivenessObservation`, `classifyLivenessObservation`, `buildLivenessProbePlan` and
`formatSpikeVerdict`, under an ASCII box header that states the finding rather than the
mechanism. The rule the phase earned is written at the site:

> an assertion whose red input requires hardware must state what a CANNOT-TELL answer looks
> like, and must never coalesce it into either verdict. A `??`, an `||` or a `default:` on the
> liveness path is the bug — not a shortcut that happens to be wrong, the bug itself, because
> each of them manufactures a definite answer out of an absent one.

The classifier's ladder is ordered exactly as `classifyOrphanScanOutcome` orders its own —
unspawnable, timeout, the caller's own bad input, then the arms that can reach a definite
answer — and its default is `inconclusive`. Three arms can leave that default and each
requires a positive observation:

| Arm | Requires | Verdict |
|---|---|---|
| `matched-running` | exit 0 AND a row whose parsed pid equals the requested pid AND a state not starting with `Z` | `alive` |
| `matched-zombie` | exit 0 AND a matching row whose state starts with `Z` | `dead` |
| `successful-non-match` | exit 1 AND no matching row | `dead` |

Everything else — including exit 0 with no matching row, and exit 1 *with* one — is
`contradictory-output`, i.e. `inconclusive`. The contradiction is caught in both directions.

`buildLivenessProbePlan` returns the existing `KillTreePlan` union so it inherits the refusal
vocabulary. Printed argv for pid 44284 on darwin:

```json
{"kind":"spawn","file":"ps","args":["-o","pid=,state=","-p","44284"],"windowsVerbatimArguments":false}
```

No argument is the pid with a leading minus sign and nothing in the argv is a process-group
reference — A1 asks whether a group exists at all, and a probe that poses the question with a
group reference cannot answer it. The bare-name spawn is recorded at the site against
**T-08-55** with its two bounds: the builder is consumed only by an uncommitted local
diagnostic build, and a hijacked binary yields `inconclusive` rather than a wrong verdict
because the classifier requires a pid-matching row and does not trust a bare exit code.

**The module still declares exactly one import.** Comment-stripped:

```
$ sed -E 's://.*::' packages/backend/src/kill-plan.ts | grep -cE '^import'
1
$ sed -E 's://.*::' packages/backend/src/kill-plan.ts | grep -E '^import'
import { type Platform, resolveWindowsSystemBinary } from "./platform";
```

### 2. A1's verdict is retracted in all three source carriers

`kill-plan.ts`'s LIVE VERDICTS block previously recorded A1 as closed on a favourable reading
and, forty lines further down, recorded that the same run found `typeof process.kill ===
"undefined"` — the very primitive the verdict line called. Both halves were written in one
comment and neither was joined to the other. They are now joined in one dated marked
correction, the Verdict line reads `**RETRACTED 2026-08-28 — OPEN, not measured**` with a
`Why retracted:` line beneath it, and the `Reading:` line is kept because the instrument
really did print that string.

`index.ts`'s `getDiagnostics` breadcrumb was stale in the **other** direction: it said no
Wave-0 spike ran, which read as *untried* rather than *tried-and-found-blind* and would have
sent the next maintainer back to commit 68199fa to rebuild the same broken instrument. It now
states all three facts and ends `DO NOT RE-RUN THE PROBE FROM 68199fa`, pointing at
`classifyLivenessObservation` and at `.planning/phases/08-process-lifecycle/a1-probe-fix.patch`.

`kill-tree.posix.test.ts`'s `THIS SUITE'S OWN REACH IS UNCHANGED` paragraph is extended rather
than softened: with A1 withdrawn, this suite's Node-only reach is the phase's **only** executed
behavioural evidence for the POSIX group path, and it is evidence about Node.

## The four red-input demonstrations

Every one was performed by mutating the shipped implementation, running the suite, and
restoring from a checksummed backup. The backup checksum is
`de687d083b3c9ef3f9a06ee34143676b75e2b5b5`, re-printed after the last restore, so "restored"
is measured rather than asserted.

### Demonstration 1 — the ORIGINAL DEFECT: the unspawnable case coalesced to a verdict

Mutation: `return { verdict: "inconclusive", reason: "enumerator-unavailable" }` →
`return { verdict: "dead", reason: "successful-non-match" }`.

```
--- RED ---
 FAIL  packages/backend/src/kill-plan.test.ts > classifyLivenessObservation — every unanswerable shape is inconclusive, never dead > reports inconclusive when the enumerator could not be spawned at all
 FAIL  packages/backend/src/kill-plan.test.ts > classifyLivenessObservation — TOTALITY: a definite verdict is reachable ONLY from the enumerated confident shapes > agrees with the contract on every one of the 120 combinations
 FAIL  packages/backend/src/kill-plan.test.ts > classifyLivenessObservation — TOTALITY: a definite verdict is reachable ONLY from the enumerated confident shapes > reaches a definite verdict on exactly 6 of the 120 combinations — 2 alive, 4 dead
      Tests  3 failed | 103 passed (106)
--- RESTORED ---
      Tests  106 passed (106)
```

Both the named case and the totality case go red, which is the point: the totality case would
have caught this defect even if nobody had thought to write the named one.

### Demonstration 2 — ADJACENCY: pid equality replaced by substring containment

Mutation: `if (Number.parseInt(pidField, 10) !== pid) continue;` →
`if (!rawLine.includes(String(pid))) continue;`.

```
--- RED ---
 FAIL  packages/backend/src/kill-plan.test.ts > classifyLivenessObservation — a pid is compared as a NUMBER, never as a substring (adjacency) > does not treat a prefix, suffix or substring pid as the requested pid
 FAIL  packages/backend/src/kill-plan.test.ts > classifyLivenessObservation — a pid is compared as a NUMBER, never as a substring (adjacency) > still reaches the successful-non-match arm when the only rows are adjacent pids
      Tests  2 failed | 104 passed (106)
--- RESTORED ---
      Tests  106 passed (106)
```

Both directions fail, which matters: a loose comparison makes a stranger's row read as `alive`
AND makes a genuine non-match read as `inconclusive`, silently disabling the probe's one
informative negative.

### Demonstration 3 — ORDERING: the line scan replaced by a read of the first line only

Mutation: `for (const rawLine of stdout.split("\n")) {` →
`for (const rawLine of [stdout.split("\n")[0] ?? ""]) {`.

```
--- RED ---
 FAIL  packages/backend/src/kill-plan.test.ts > ... (ordering) > finds the matching row after a leading blank line
 FAIL  packages/backend/src/kill-plan.test.ts > ... (ordering) > finds the matching row last, after two lines of noise
 FAIL  packages/backend/src/kill-plan.test.ts > ... (ordering) > yields the SAME verdict wherever the matching row sits
 FAIL  packages/backend/src/kill-plan.test.ts > ... TOTALITY ... > agrees with the contract on every one of the 120 combinations
 FAIL  packages/backend/src/kill-plan.test.ts > ... TOTALITY ... > reaches a definite verdict on exactly 6 of the 120 combinations — 2 alive, 4 dead
      Tests  5 failed | 101 passed (106)
--- RESTORED ---
      Tests  106 passed (106)
```

**A note on the first attempt at this mutation, recorded because it is the class of error this
round exists to remove.** The first attempt used `perl -0pi -e 's/\Q…\E/…/'`, printed no error,
and the suite stayed at 106 passed — which looks exactly like "the test does not catch this".
The mutation had simply not applied. It was caught by grepping for the mutated text rather than
trusting the exit code, and re-run through `python3` with an `assert s.count(old) == 1`. A
mutation demonstration that does not verify the mutation landed is itself a vacuous gate.

### Demonstration 4 — the FORMATTER's inconclusive branch falling through to a verdict

This is the one that matters most: the whole defect being corrected is an inconclusive answer
wearing a verdict's clothes. Mutation: the `inconclusive` return replaced by
`return "grandchild-died (detached honoured)";`, producing

```ts
export function formatSpikeVerdict(observation: LivenessObservation): string {
  if (observation.verdict === "alive") {
    return "grandchild-survived (detached NOT honoured)";
  }
  if (observation.verdict === "dead") {
    return "grandchild-died (detached honoured)";
  }
  return "grandchild-died (detached honoured)";
}
```

```
--- RED ---
 FAIL  packages/backend/src/kill-plan.test.ts > formatSpikeVerdict — an inconclusive answer never wears a verdict's clothes > renders inconclusive sharing no verdict word with either outcome, and names the reason
 FAIL  packages/backend/src/kill-plan.test.ts > formatSpikeVerdict — an inconclusive answer never wears a verdict's clothes > renders three pairwise-distinct strings across the three verdicts
 FAIL  packages/backend/src/kill-plan.test.ts > formatSpikeVerdict — an inconclusive answer never wears a verdict's clothes > names the reason for every inconclusive reason the classifier can produce
      Tests  3 failed | 103 passed (106)
--- RESTORED ---
      Tests  106 passed (106)
final sha: de687d083b3c9ef3f9a06ee34143676b75e2b5b5  packages/backend/src/kill-plan.ts
```

That mutation is a byte-for-byte reconstruction of what the 2026-08-27 probe did: an answer of
"I could not tell" rendered as `grandchild-died (detached honoured)`.

## The totality case

The cartesian product is `spawnThrew ∈ {true, false}` × `timedOut ∈ {true, false}` ×
`exitCode ∈ {0, 1, 2, null, undefined}` × six stdout shapes (empty, a single blank line, a
matching running row, a matching zombie row, an adjacent 4428 row, and a matching row after two
noise lines) = **120 combinations**, all executed on this host.

The expected verdict is re-derived in the test from the contract, in a helper that does not call
the implementation, so the case compares two independent statements of the rule rather than the
implementation with itself.

**Definite verdicts across the product: 6 of 120 — 2 `alive`, 4 `dead`, 114 `inconclusive`.**
Asserted as an exact `toEqual({ alive: 2, dead: 4, inconclusive: 114 })`, which pins both
directions: an implementation with a definite default drives the count up, and one hardwired to
refuse drives it to zero.

## The test-count ladder

| Point | `kill-plan.test.ts` | Full suite (total / passed / skipped) |
|---|---|---|
| Plan start (baseline) | 74 | 695 / 686 / 9 |
| Task 1 RED (commit `f53796c`) | 106 (32 failed, 74 passed) | — |
| Task 1 GREEN (commit `3a9bb12`) | 106 passed | 727 / 718 / 9 |
| Task 2 (commit `d2db57f`) | 106 passed | — |
| Task 3 (commit `491c398`) | 106 passed | 727 / 718 / 9 |

`+32` cases in `kill-plan.test.ts`, `+32` in the full suite. **No test was removed, skipped,
relaxed or converted to a weaker assertion; the skipped count is unchanged at 9.** All 41 test
files and 39 non-skipped files pass, 0 failures.

`pnpm -r typecheck` exit 0 and `pnpm lint` exit 0 at every commit.

## Accounting of deleted lines in all three diffs

`git diff -U0` for `kill-plan.ts`, `index.ts` and `kill-tree.posix.test.ts` contains **zero**
executable TypeScript lines across tasks 2 and 3 — every changed line begins with a comment
marker. Executable-line-change count for task 3's two files: **0**.

### `packages/backend/src/kill-plan.ts` — 15 deleted, 15 accounted for

Mechanically verified: every deleted line reappears in the added set as the same line with
`// ` rewritten to `// > `. Zero unaccounted.

| Deleted | Where it reappears |
|---|---|
| `//        Verdict: **CLOSED FAVOURABLY — measured**` (1 line) | the correction preamble's `SUPERSEDED (written 2026-08-27)` quote |
| The `A1 CLOSED FAVOURABLY.` paragraph (9 lines) | quoted verbatim beneath the replacement paragraph |
| OQ-2's justification, lines 2-6 (5 lines) | quoted verbatim beneath the corrected OQ-2 paragraph |

**No deleted line carries a reading value or a date** — verified by regex over the deleted set
for `20\d\d-\d\d-\d\d`, `grandchild-`, `43921`, `43752`, `44284` and `spike…:`: 0 matches. The
A6 region produced **no diff hunk at all**: `git diff -U0` contains 0 changed lines matching
`43921|43752|A6 FALSIFIED|FALSIFIED — measured`.

### `packages/backend/src/index.ts` — 14 deleted, 14 accounted for

| Deleted | Where it reappears |
|---|---|
| The 2026-08-27 `CORRECTION` paragraph (6 lines) | quoted verbatim beneath the `RETRACTION (2026-08-28)` paragraph |
| The `THE RUNG STAYS ANYWAY` paragraph (5 lines) | quoted verbatim beneath the corrected `THE RUNG STAYS` paragraph |
| The three-line `getDiagnostics` breadcrumb (3 lines) | quoted verbatim in the rewritten breadcrumb's `SUPERSEDED` block |

Normalized-content check: 0 deleted lines whose text does not reappear among the added lines.

### `packages/backend/src/kill-tree.posix.test.ts` — 15 deleted, 15 accounted for

| Deleted | Where it reappears |
|---|---|
| The A1 sentence of the 2026-08-27 `CORRECTION` (3 lines) | quoted verbatim beneath the `A1 RETRACTED (2026-08-28)` paragraph |
| The A6 sentence of the same correction (4 lines) | **live, unchanged in content**, moved to the top of the paragraph and re-wrapped |
| The `THIS SUITE'S OWN REACH IS UNCHANGED` paragraph (8 lines) | quoted verbatim beneath its corrected-and-extended replacement |

Two deleted lines are re-wrap boundaries rather than losses — `25.6.0; \`08-UAT.md\` tests 1 and
2). **A1 is CLOSED FAVOURABLY** —` and `shipped LLRT does create the group this file's argv aims
at. **A6 is` each straddle the boundary between text that stayed live and text that moved into
the quote. Both halves of each are present; verified by fixed-string grep:

```
25.6.0; `08-UAT.md` tests 1 and 2)                             -> 1
**A1 is CLOSED FAVOURABLY**                                    -> 1
shipped LLRT does create the group this file's argv aims at    -> 1
**A6 is FALSIFIED**                                            -> 1
```

A6's verdict, its pids and its `FALSIFIED` word survive in both source carriers:
`43921` ×1, `43752` ×1, `44284` ×2, `FALSIFIED` ×1 in `kill-tree.posix.test.ts`; `FALSIFIED` ×2
in `kill-plan.ts`. The `THIS SUITE'S OWN REACH IS UNCHANGED` phrase appears twice — once live
(extended) and once in the preserved quote.

## What `verdict-gate.sh` still names

The gate's exit code is **1**, which is expected and is not this plan's to fix: plan 08-15 owns
the exit-0 assertion. Every gate check in this plan captured the gate ONCE and asserted, against
that same capture, both liveness (exactly three `== ARM ` header lines) and the target-file
absence — never a bare `grep -c <file> | grep -qx 0`, which an empty match set satisfies.

**Zero files under `packages/` are named in any arm.** The gate output's single occurrence of
the string `packages/` is ARM A's own header line, `== ARM A: repo-wide discovery (.planning/
and packages/, exclusion-list) ==`.

The seven files it still names, and their owner:

| File | Owner | Arms |
|---|---|---|
| `.planning/ROADMAP.md` | **08-13** | A1-STALE (3 lines), A1-READING |
| `.planning/REQUIREMENTS.md` | **08-13** | A1-STALE (1 line) |
| `.planning/STATE.md` | **08-14** | A1-STALE (2 lines), A1-READING, ARM B |
| `.planning/WINDOWS.md` | **08-14** | A1-STALE (3 lines), A1-READING, ARM B ×2 |
| `.planning/phases/08-process-lifecycle/08-VALIDATION.md` | **08-14** | A1-STALE (3 lines), A1-READING, ARM B ×2 |
| `.planning/phases/08-process-lifecycle/08-SECURITY.md` | **08-14** | A1-STALE (2 lines), A1-READING, ARM B ×2 |
| `.planning/phases/08-process-lifecycle/08-UAT.md` | **08-14** | A1-STALE (1 line), A1-READING |

Remaining failure counts by arm: ARM A/A1-STALE **7**, ARM A/A1-READING **6**, ARM B **7**,
ARM C **0**. That is the complete worklist for the rest of the wave, split exactly two ways
between 08-13 and 08-14 with nothing left over.

## Deviations from Plan

None — plan executed as written.

Two things worth recording that are not deviations:

1. **`pnpm prettier --write` was run on `kill-plan.ts` only.** The file was prettier-clean at
   HEAD and my additions made it unclean; the test file was ALREADY prettier-unclean at HEAD, so
   formatting it would have produced a large diff unrelated to this plan. Out of scope, left
   alone. `pnpm lint` exits 0 on both either way.
2. **Task 1 was committed as two commits, not one** (`test(08-12)` then `feat(08-12)`), because
   the task carries `tdd="true"` and the RED/GREEN gate sequence is the contract. The RED commit
   `f53796c` is genuinely red — 32 failed | 74 passed (106).

## Authentication Gates

None.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO or FIXME was introduced. The one
deliberately deferred item is not a stub in this plan's files: the fixed probe itself is plan
08-15's `a1-probe-fix.patch`, and `index.ts`'s breadcrumb now names that path so the next
maintainer applies it rather than rebuilding the broken instrument from 68199fa.

## Threat Flags

None. `T-08-55` (bare-name enumerator), `T-08-57` (a classifier reaching a definite verdict
through a default), `T-08-58` (deleting superseded text) and `T-08-59` (verdict strings leaking
values) are all in the plan's own register and all four dispositions are honoured in the shipped
code: T-08-55 is recorded at the call site with both bounds, T-08-57 is mitigated by the
executed totality case and three of the four demonstrations, T-08-58 by the block-quote
preservation accounted for above, and T-08-59 by the closed `LivenessReason` union — the
formatter can only ever emit a state word and a reason token, never a pid, path or environment
value.

No security-relevant surface outside the register was introduced: no network endpoint, no auth
path, no file access, no schema change. `buildLivenessProbePlan` builds an argv and performs no
I/O, in a module that carries one import and cannot spawn.

## Issues Encountered

None blocking. One process note, recorded above under Demonstration 3: a mutation that silently
failed to apply produced a green run that read as "the test does not catch this". Verifying the
mutation landed — by grepping for the mutated text, and by `assert s.count(old) == 1` — is now
part of how these demonstrations are performed.

## Next Phase Readiness

Ready for **08-13** and **08-14**, which are unblocked and whose worklists are the seven files
tabulated above. Plan **08-15** can now compose `classifyLivenessObservation`,
`buildLivenessProbePlan` and `formatSpikeVerdict` in its `a1-probe-fix.patch` rather than
re-deriving the determination — and `index.ts`'s breadcrumb already points at that patch file by
path.

**The gate is still RED and will stay red until 08-15.** That is correct and expected: 08-13's
and 08-14's carriers are still uncorrected, and plan 08-15 owns the exit-0 assertion.

## Self-Check: PASSED

Files claimed as modified, all present on disk:

```
FOUND: packages/backend/src/kill-plan.ts
FOUND: packages/backend/src/kill-plan.test.ts
FOUND: packages/backend/src/index.ts
FOUND: packages/backend/src/kill-tree.posix.test.ts
```

Commits claimed, all present in `git log`:

```
FOUND: f53796c  test(08-12): add the failing three-valued liveness contract
FOUND: 3a9bb12  feat(08-12): determine liveness by a spawned enumerator, three-valued
FOUND: d2db57f  docs(08-12): retract A1's verdict in kill-plan.ts's LIVE VERDICTS block
FOUND: 491c398  docs(08-12): retract A1 in index.ts and kill-tree.posix.test.ts
```

Plan-level `<verification>` re-run at the end of task 3:

- `npx vitest run` → 727 total / 718 passed / 9 skipped, **0 failures**, at or above the
  695 / 686 / 9 baseline in every column.
- `pnpm -r typecheck` → exit 0. `pnpm lint` → exit 0.
- `verdict-gate.sh` names **no file under `packages/`**, measured against a capture carrying all
  three `== ARM ` header lines.
- `git log --name-only` for this plan → **0** files under `packages/frontend`, **0** under
  `packages/shared`.
- **Four** red-input demonstrations recorded with pasted before/after output.
