---
phase: 08-process-lifecycle
plan: 17
subsystem: process-lifecycle
status: complete
tags: [spike, hardware-reading, a1, control, ledger, ownership, verdict-gate]

requires:
  - "08-15: a1-probe-fix.patch and verify-a1-patch.sh — the probe build this plan installed"
  - "08-16: the post-fix HEAD-build readings this plan's Control pairs against"
provides:
  - "A1's causal half, measured on real hardware with an instrument that could have said otherwise"
  - "The pre-fix Control — 08-01 truth 3, abstained since 2026-08-24, now taken and FALSIFIED"
  - "A pre/post process-group control pair, one variable"
  - "The ownership record for everything Phase 8 leaves open"
affects:
  - ".planning/phases/08-process-lifecycle/08-SPIKE.md"
  - ".planning/WINDOWS.md"
  - ".planning/phases/08-process-lifecycle/deferred-items.md"
  - ".planning/phases/08-process-lifecycle/08-UAT.md"
  - ".planning/REQUIREMENTS.md"

tech-stack:
  added: []
  patterns:
    - "Marked correction (07-VALIDATION.md convention): superseded text preserved as a block quote, never deleted"
    - "Block-quoting a policed verdict phrase rather than weakening the claim, so a describing file does not become a second carrier"
    - "Census derived by enumeration, never asserted"

key-files:
  created:
    - ".planning/phases/08-process-lifecycle/08-17-SUMMARY.md"
  modified:
    - ".planning/phases/08-process-lifecycle/08-SPIKE.md"
    - ".planning/WINDOWS.md"
    - ".planning/phases/08-process-lifecycle/deferred-items.md"
    - ".planning/phases/08-process-lifecycle/08-UAT.md"
    - ".planning/REQUIREMENTS.md"

key-decisions:
  - "A1's causal half is recorded as measured favourably in 08-SPIKE.md ONLY, and the resulting verdict-gate.sh ARM A red is recorded as correct rather than resolved by touching the gate"
  - "The pre-fix Control came back ZERO, falsifying 08-01 truth 3; recorded at full strength, with 08-16's claim qualified at both live carriers rather than left standing"
  - "LIF-01 and LIF-02 left UNTICKED despite requirements.ready-ids reporting 2/2 ready — that verb is structural, not substantive"
  - "Ledger entry 20 closed on the reading it named; entries 11, 13, 15 narrowed and left open"
  - "The A1 propagation across the remaining seven carriers is recorded as a named follow-up, not performed here"

requirements-completed: []

coverage:
  - deliverable: "A1's causal half re-run on the patched three-valued probe"
    human_judgment: true
    rationale: "A claim about the LLRT fork a specific Caido ships. No CI leg executes that runtime and none ever will; the reading exists only because the maintainer took it by hand."
  - deliverable: "The pre-fix Control (08-01 truth 3)"
    human_judgment: true
    rationale: "A live turn on a hand-installed pre-fix build inside a real Caido. Not reachable by any automated vehicle in this repository."
  - deliverable: "The pre/post process-group control pair"
    human_judgment: true
    rationale: "Direct ps observation from outside the Caido sandbox on the maintainer's machine."
  - deliverable: "Ledger updates (20 closed; 11, 13, 15 narrowed; 24 added)"
    verification:
      - kind: command
        ref: "gsd-tools windows status"
        status: pass
      - kind: command
        ref: "markdown-row / JSON-object description parity, all 24 entries"
        status: pass
    human_judgment: false
  - deliverable: "The ownership record in deferred-items.md"
    human_judgment: true
    rationale: "A judgment about which remaining phases can own which open items; no test asserts it."
  - deliverable: "The verdict gate's predicted red, with the gate unmodified"
    verification:
      - kind: command
        ref: "bash .planning/phases/08-process-lifecycle/verdict-gate.sh"
        status: pass
      - kind: command
        ref: "git diff .planning/phases/08-process-lifecycle/verdict-gate.sh (empty)"
        status: pass
    human_judgment: false

metrics:
  duration: "continuation session"
  completed: 2026-08-31
  tasks: 3
  files: 5

actuals:
  tokens: 71000
  tasks: 3
  commits: 10
---

# Phase 8 Plan 17: The A1 re-run, the pre-fix Control and the ownership record — Summary

A1's causal half was re-measured on real hardware with an instrument that could have printed the
unfavourable answer, and came back favourable — while the pre-fix Control came back **zero**,
falsifying `08-01` truth 3 and implicating the CLI-cleanup confounder this phase spent two weeks
trying to exclude.

## The two headline results, and the gate

**`verdict-gate.sh` is RED and that is the correct signal.** `08-SPIKE.md` now carries a live
favourable A1 claim that the other seven carriers do not, so ARM A/A1-STALE fails naming exactly
that file. It was written down in advance, before any reading existed, precisely so it could not be
met as a surprise and resolved the cheap way. **The gate is unmodified** — `git diff` on it is
empty, no exclusion was added, no pattern narrowed. The propagation follow-up is recorded as
`deferred-items.md` ownerless item 10, with ARM A's output and ARM B's `CARRIERS_A1` array as its
worklist. **Until it lands, the gate is expected to exit non-zero.**

**A1's causal half: CONFIRMED.** `spikeDetachedGroupKill` read `grandchild-died (detached
honoured)` — `formatSpikeVerdict`'s `dead` arm, one of exactly three permitted values.

**The Control: ZERO, where truth 3 predicted non-zero.** On the pre-fix build the token-bearing MCP
child died anyway. **This contradicts the phase's own expectation and is recorded at full strength.**

## Probe-build provenance

| Field | Value |
|---|---|
| Source commit | `68199fa` |
| Patch | `.planning/phases/08-process-lifecycle/a1-probe-fix.patch` (incl. section 5) |
| Package | `/tmp/drift-a1-build/plugin_package.zip`, 2,549,143 bytes |
| sha256 | `a135fdca6da842beaeea4ab98dd2264be6d7f6035f33dc3601e50e881c88a9d5` |
| Installed at | Caido plugin id `d8aee773-b939-4164-a576-9c276ee30df8` |
| Environment | Caido 0.58.2, darwin 25.6.0, provider claude-cli, `/Users/six2dez/.local/bin/claude` |
| Never committed | `git status --porcelain packages/` empty; `git worktree list` shows one worktree |

Caido's own process group this session: `Caido` pid 91048 pgid 91048; `caido-cli` pid 91056
ppid 91048 pgid 91048.

## The maintainer's pasted block, quoted so the transcription is checkable byte for byte

**Reading A — A1's causal half:**

```
"spikeProcessKillType": "undefined",
"spikeDetachedGroupKill": "grandchild-died (detached honoured)",
"spikeNote": "Phase 8 A1 probe — temporary, removed by T-08-03",
```

Fixture-leak check immediately after: `pgrep -f 'node -e' | wc -l` => `0`.

**Reading B — the topology control pair.** Columns `PID PPID PGID`.

POST-FIX (HEAD build, 10:48:05):
```
 3386 91056  3386  /Users/six2dez/.local/bin/claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json
 3396  3386  3386  /opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs
```
PRE-FIX (probe build `68199fa`, 10:51:37):
```
 5190 91056 91048  /Users/six2dez/.local/bin/claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json
 5200  5190 91048  /opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs
```
PRE-FIX, second run (probe build, 10:55:54):
```
 7005 91056 91048  /Users/six2dez/.local/bin/claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json
 7015  7005 91048  /opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs
```

**Reading C — the Control.** Probe build, pre-fix. Prompt *"resume en detalle qué hace este
proyecto"*. Stop WAS clicked:

```
"chatId": "chat-1788166552577-7obc",
"state": "stopped",
"reason": "Provider exited with code 143.",
"reasonCode": "completed",
"exitCode": 143,
```

Sampler timeline (1 Hz):
```
10:55:53  count=0
10:55:54  count=1     <- child born
   [count=1 continuously]
10:56:04  count=1
10:56:05  count=0     <- first zero AFTER Stop
10:56:07  count=0
10:56:08  count=0
10:56:09  count=0
10:56:10  count=0
10:56:11  count=0
^C
```
`pgrep -f mcp-server.mjs` => `0` at rest afterwards.

**Reading D — DISCARDED** (10:51:33-10:51:46): `0 → 1 → 0`, but
`"reason": "Last provider turn completed. Send another message to continue."`,
`"reasonCode": "completed"`, **no `exitCode`**, chat *"holiiiii"*, 2 messages, ~7 s. **Stop was NOT
clicked; the turn ended on its own.** Not a cancellation measurement. Recorded as taken-and-discarded
so a later reader does not mistake the remaining run for the only attempt.

**Reading E — incidental, HEAD build at 10:47:**
```
"lastOrphanReap": "kind=reap exit=0 killed=2 ageMs=31",
"activeSessions": "0",
```

**Reading F — incidental, both builds:**
```
"runtimeParentEnv": "ok (reported): parent environment carries 0 keys; the PATH variable is absent from that block",
"parentEnvKeyCount": "0",
"parentEnvPathEntryCount": "absent",
```

## Cell census — derived by enumeration, not asserted

Tables 1 and 2 carry **20** value cells (11 + 9; table 2 gained two rows this plan added).

| Class | Count |
|---|---|
| Verbatim transcription of a 2026-08-31 reading | **13** |
| Dated marked abstention naming what stopped it | **1** |
| Not applicable — the cell's precondition did not obtain | **1** |
| Provenance / cross-reference (task 1 or plan 08-16, not this session) | **3** |
| Verdict row — the table's own labelled conclusion | **2** |

13 + 1 + 1 + 3 + 2 = **20**. No unexplained blanks.

**The one abstention:** the eyeball `ps` scan for leftover fixture-shaped rows. The maintainer
reported the `pgrep` count (`0`), which is the stronger reading for the leak question, and did not
additionally paste a listing — so the cross-check against a mis-specified pattern was not performed.

**The one not-applicable:** the inconclusive reason token. Recorded as n/a rather than as an
abstention because the verdict was not inconclusive; this is not a reading anybody failed to take.

**Sixth census defect, self-caught.** The filled-section header first asserted 17 cells / 15 verbatim
/ 2 abstentions. Enumerating the rows gave 20. Corrected in commit `a1e7b04` before this SUMMARY,
and recorded here rather than quietly fixed — asserting a count nobody re-derived is precisely this
phase's own defect.

## Why Reading A is a measurement and not the retraction repeated

**At face value Reading A reproduces the retracted defect's exact signature.** The 2026-08-27
reading was withdrawn because `spikeProcessKillType: "undefined"` sat beside `grandchild-died
(detached honoured)`. **Reading A shows the same two values.** Three independent facts establish
that the code between them is different:

1. **The patch deletes the coalescing line.** `const alive = signalRef.process?.kill?.(grandchildPid,
   0) ?? false;` is removed outright and the verdict routed through
   `formatSpikeVerdict(classifyLivenessObservation({...}))`. The deleted line is preserved as a
   comment, so the substitution is checkable.
2. **The classifier defaults to `inconclusive`.** Reaching `dead` requires clearing five gates: a
   spawned enumerator, no timeout, a usable pid, a numeric exit code that is neither `undefined` nor
   `null`, and that code being one of two recognised values. The patch passes `spawnThrew:
   !probe.spawned` **specifically** so that `spawnAndWait`'s synthetic `code: 1` on an unspawnable
   enumerator — byte-identical to `ps`'s documented "no process matched" — cannot become the answer
   "the grandchild is gone". That is gap 1 rebuilt out of a different operator, and the patch
   refuses it by name.
3. **`pgrep -f 'node -e'` => `0` proves the patched build ran.** The original's cleanup signalled
   through the same absent `process.kill` the verdict used, so on this sandbox it was a silent no-op
   and the 2026-08-27 run leaked both fixtures. A `0` is only reachable on the patched build.

**So `spikeProcessKillType: "undefined"` is now an honest report of a runtime fact sitting beside a
verdict that no longer depends on it.** The instrument could have printed `grandchild-survived
(detached NOT honoured)` or any of six `inconclusive: <reason>` strings, and printed neither.

**The fixture leak is CONFIRMED FIXED by measurement**, not assumed fixed.

## The Control contradicts `08-01` truth 3

Truth 3 predicted a **non-zero** after-Stop count on the pre-fix build. The measurement is **zero**.
On a build with no `detached` at the provider spawn — Reading B shows the pre-fix provider inheriting
Caido's group 91048, twice — and only a single-pid SIGTERM, the token-bearing MCP child died anyway.
**Claude Code cleans up its own MCP child on SIGTERM.**

1. **The CLI-cleanup confounder is IMPLICATED, not merely unexcluded.** It is now the only candidate
   with a positive observation behind it.
2. **Plan 08-16's post-fix zero proves LESS than it appeared to**, because the pre-fix build yields
   the same zero. Qualified at both live carriers — `08-SPIKE.md` § *What these readings close, and
   what they do not* (marked correction, superseded text preserved) and `08-UAT.md` test 9's
   `scope_and_caveats`. **`08-16-SUMMARY.md` is deliberately NOT edited**: it is a dated record in
   the ARM C immutable class and was correct on its date.
3. **For Claude Code on macOS, Drift's group-kill machinery is REDUNDANT with the provider's own
   cleanup on this path.**

**And the limits.** The 2026-08-27 G-04 orphan was a **codex** process, foreign-parented, that Drift
never spawned — a different class this Control did not test. A6 shows codex puts its MCP child in
its **own** process group, so neither the group kill nor this cleanup path is established for it.
**The machinery is not shown useless; it is shown redundant for the one combination measured.**

**Reading B is strictly stronger than plan 08-16's single favourable Table 5:** same machine, same
Caido process, minutes apart, one variable. It demonstrates that Phase 8's `detached: true` is what
creates the group and that Caido's LLRT honours it. Confirmed twice pre-fix.

## Scope

**One provider** (claude-cli). **One platform** (darwin 25.6.0). **One Caido version** (0.58.2).
**One machine.** **codex untested** on both the Control and causal paths, and FALSIFIED for A6.
gemini and copilot unmeasured. **Windows entirely unmeasured and re-deferred to Phase 9 SC-4.**
Linux unmeasured.

## Ledger

**Open entry ids BEFORE:** `8, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22`
**Open entry ids AFTER:** `8, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 24`

**Closed:** entry **20**, on the exact reading it named as its closing condition.

```
$ node gsd-tools.cjs windows fixed 20
(exit 0)
```

**Narrowed and left OPEN:**
- **11** — three of its four clauses answered; the fourth (the Control) answered in the *wrong*
  direction, and the reap still has no executed assertion.
- **13** and **15** — narrowed by Reading E, the first `kind=reap` observation anywhere. **A runtime
  observation is not an executed assertion**, and the record carries a count, not identities, so
  what it killed is not established. `reapSessionOrphansIfIdle`'s idle-gated call site has still
  never been exercised.

**Added:** entry **24** — `reasonCode` reports `completed` for a SIGTERM death. Not cosmetic: the
same session produced Reading D, also `reasonCode: completed`, separable only by the presence of
`exitCode`. That is exactly the discrimination the Control depended on.

**Parity proof (programmatic, from disk):** all 24 entries checked; every entry this plan touched
(11, 13, 15, 20, 24) is byte-identical across its markdown row and its JSON object. Entries **7 and
10 mismatch** — the pre-existing Phase 6 backslash-escaping defect already recorded as ownerless
item 9, left unrepaired under the scope boundary.

```
md_rows=24 json_ids=24  COUNTS EQUAL
entries checked: 24
MISMATCH (7, 'description NOT byte-identical across md row and json object')
MISMATCH (10, 'description NOT byte-identical across md row and json object')
```

## Requirements — LIF-01 and LIF-02 left UNTICKED

`requirements.ready-ids` reported **2/2 ready**. That verb is **structural** — it answers "is any
sibling plan still outstanding?", not "is this requirement met?". The substantive evidence says
neither is met, and marking them complete would be this phase's own vacuous-gate pattern one level
up. So the gate was run, its answer recorded, and neither row forced:

- **LIF-01** — the Windows execution leg is unrun (`kill-tree.win32.test.ts` 3/3 pending on every
  host that has ever run it, ledger entry 12 open). Owner: Phase 9 SC-4. Unchanged by any
  2026-08-31 reading.
- **LIF-02** — A1's causal half re-measured and A6 split per provider, **but** the Control came back
  zero, so the requirement's own stated *"via process-group signalling"* mechanism is not shown to
  be what does the work; the reap still has no executed assertion.

`REQUIREMENTS.md` **references** the new verdict rather than restating it, so it does not become a
second live carrier ahead of the propagation follow-up.

## Ownership record

**`deferred-items.md` carries two records**, revised in place rather than rewritten:

1. **The Windows leg, re-deferred to Phase 9 SC-4.** Closing condition re-verified against source on
   2026-08-31: ROADMAP.md:414 reads *"The full `ubuntu/macos/windows` matrix is green and the Windows
   job is required for merge."* and the `Gate: the win32 kill-tree suite actually ran` step still
   lives at `.github/workflows/ci.yml:269`. Revised to record that Reading F **sharpens** entry 22's
   Windows half rather than answering it.
2. **The ownerless list**, now 11 items. Entries 1 and 2 CLOSED by readings (entry 2 by being
   *falsified*). Entry 3 moved the **wrong** way. Entries 6 and 7 widened. **Entries 10 and 11 are
   new, created by the readings:**
   - **10** — the A1 propagation follow-up. Gate red until it lands; worklist is ARM A's output plus
     ARM B's `CARRIERS_A1` array.
   - **11** — what the nine POSIX termination sites are buying, given the Control. Nothing in this
     repository currently demonstrates a case where Drift's group kill saved a process from being
     orphaned. Recorded, not resolved.

**Entry 1 closed only because a human was asked, in a session this plan halted for. That is not a
mechanism**, and entries 3, 6, 7 and 11 need the same thing again.

## Deviations from Plan

**1. [Rule 1 — Bug] The first ledger-update helper corrupted `WINDOWS.md`**
- **Found during:** Task 3, first ledger edit.
- **Issue:** The helper computed the JSON fence match offsets, then mutated the markdown row
  *before* splicing the JSON body — so the splice used stale offsets, truncating entry 22's row and
  swallowing entry 23 and the ````json` fence. `json.dumps` also defaulted to `ensure_ascii=True`,
  escaping every em-dash to `—` and breaking md/JSON byte-identity across unrelated entries.
- **Fix:** Restored the single file with `git checkout -- .planning/WINDOWS.md` (the sanctioned
  form; no blanket reset, no `git clean`). Rewrote the helper to edit the markdown row first, then
  **recompute** the fence match against the mutated string, use `ensure_ascii=False`, and assert
  round-trip byte-identity plus post-write parity from disk on every call.
- **Verification:** JSON round-trip proven byte-identical before any mutation; all 24 entries
  re-checked after.
- **Commit:** `b6bbbee`

**2. [Rule 2 — Missing critical] `deferred-items.md` and `REQUIREMENTS.md` each became a second live
carrier of the A1 verdict**
- **Found during:** Task 3, after each edit.
- **Issue:** The gate flagged both — `deferred-items.md` for spelling the verdict phrase on a live
  line *and* for quoting the raw reading string without `RETRACTED` in the file;
  `REQUIREMENTS.md` for *"re-measured favourably"*.
- **Fix:** Block-quoted the verdict phrase in `deferred-items.md` and added the (substantively
  required) statement that the 2026-08-27 reading stays retracted; changed `REQUIREMENTS.md` to
  reference `08-SPIKE.md` rather than restate. **No claim was weakened** — this is the constraint's
  own prescribed remedy, and it keeps the propagation a single coherent follow-up rather than a
  partial drift across carriers.
- **Verification:** Gate re-run after each; red narrowed to `08-SPIKE.md` alone.
- **Commits:** `5c7331c`, `0008bf9`

**3. [Rule 1 — Bug] The cell census was asserted, not derived**
- **Found during:** Task 3, pre-SUMMARY verification.
- **Issue:** The filled-section header claimed 17 cells / 15 verbatim / 2 abstentions. Enumeration
  gave 20.
- **Fix:** Replaced with an enumerated classification table.
- **Commit:** `a1e7b04`

**Total deviations:** 3 auto-fixed (2× Rule 1, 1× Rule 2). **Impact:** none on the readings, all
three caught by the plan's own controls before the SUMMARY.

## Verification

| Check | Result |
|---|---|
| `npx vitest run` | **738 passed / 9 skipped / 747** — at baseline |
| `git status --porcelain packages/` | empty |
| `git worktree list` | 1 worktree |
| `git diff verdict-gate.sh` | **empty — gate unmodified** |
| `verdict-gate.sh` | **exit 1, ARM A red on `08-SPIKE.md` only — the predicted, correct signal** |
| `gsd-tools windows status` | exit 0 |
| ledger md rows vs JSON ids | 24 = 24 |
| `08-VERIFICATION.md` | **no diff — left unstaged as required** |
| `.planning/PROJECT.md` | **left unstaged as required** |

**The gate's red is recorded as an expected outcome, not a failure.** Any future run of
`verdict-gate.sh` will exit non-zero naming `08-SPIKE.md` until ownerless item 10 lands.

## Issues Encountered

**The gate is red by design and will stay red.** Anyone running phase gates will see
`verdict-gate.sh: FAIL`. This is documented in three places — `08-SPIKE.md` § *The gate went red,
exactly as predicted*, `deferred-items.md` item 10, and this SUMMARY's first section — so it cannot
be mistaken for a regression and "fixed" by weakening the gate.

## Known Stubs

None.

## Next Phase Readiness

Phase 8's remaining open items all have a written owner or are written down as ownerless. The two
readings only this hardware could produce are taken. **The single highest-value next action is
ownerless item 10** (the A1 propagation), because until it lands the repository is internally
inconsistent about A1 and its own gate says so.

## Self-Check: PASSED

- `.planning/phases/08-process-lifecycle/08-17-SUMMARY.md` — created
- Commits verified present: `305c5a9`, `082ef42`, `6f0665d`, `a700d95` (prior, not redone);
  `b5053ba`, `b6bbbee`, `5c7331c`, `42aa28f`, `a1e7b04`, `0008bf9` (this session)
- All modified files exist on disk and carry the described changes
- `verdict-gate.sh` byte-unmodified; `08-VERIFICATION.md` and `PROJECT.md` unstaged
