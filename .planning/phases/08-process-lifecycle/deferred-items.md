# Phase 8 — deferred items

Out-of-scope discoveries made during execution. Logged, not fixed (executor scope boundary).

## `.planning/milestone.lock` is untracked and not gitignored

Found during: 08-01 T-08-01 commit.

The GSD tooling writes `.planning/milestone.lock` while a phase executes. It carries a
session id, a machine-local pid and a timestamp — pure runtime state. It has never been
tracked, no comparable lock file is tracked anywhere in the repo, and it is not listed in
`.gitignore`, so it shows up as untracked noise in every `git status` during a phase run.

Not fixed here: adding it to `.gitignore` is a repo-config change outside plan 08-01's
declared `files_modified` (`packages/backend/src/index.ts`, `08-SPIKE.md`). Committing the
file itself would be worse — it would bake a lock naming a dead pid into git history.

Suggested resolution: add `.planning/milestone.lock` to `.gitignore` in a standalone chore
commit, outside this phase.

## Registration hygiene — a token-bearing MCP registration Drift cannot withdraw

Found during: 08-10 Task 3, from the 2026-08-27 UAT diagnostics (gaps G-04 and the
`mcpCliRemovalFailures` observation).

Drift's `mcp add drift` registration persists in the provider CLI's **own** configuration. **Any
instance of that CLI on the machine can therefore launch Drift's MCP server on its own
initiative, with a live `CAIDO_TOKEN`**, without Drift spawning it, tracking it in
`activeProcesses`, or holding any handle on it. That is the route UAT gap G-04's orphan arrived
by: pid 44284 alive with `activeSessions: 0`, parented by a `codex` binary at a path Drift never
registered. Phase 8 closes this at the **process** layer — the argv-marker reap plans 08-06 and
08-07 shipped can now terminate such a process — but it does nothing at the **registration**
layer, so the same orphan can be created again a second later.

Not fixed here: recorded decision **GD-02** puts the registration layer explicitly out of scope
for Phase 8, which is a lifecycle phase. Whether Drift's registered MCP config *should* be usable
by CLI instances Drift did not spawn is a product decision with its own blast radius, and it is
not a question an executor answers inside a documentation plan. Recorded as accepted residual
**AR-06** in `08-SECURITY.md` (threat T-08-47, an accepted `high` with a named decider) rather
than left as an absence.

Suggested resolution: a registration-focused phase entered through `/gsd-discuss-phase`. Not
assigned to an existing phase, because assigning it would imply the decision had been made.

## The Gemini `mcp remove` failures — AR-06's live instance

Found during: 08-10 Task 3, same 2026-08-27 diagnostics report.

`mcpCliRemovalFailures: gemini: 2 failed (scope=user exit=127, scope=project exit=127)`. Drift
attempted to withdraw a Drift MCP registration **it had itself created**, at both the user and
the project scope, and **could not** — exit 127 at both. Drift's own message states that a Drift
MCP entry carrying a Caido session token may still be present in the Gemini CLI's configuration
on that machine. This is not a hypothetical: it is a **live token-at-rest condition** on the
maintainer's own install, and it is the concrete instance of the class AR-06 describes.

Not fixed here: this is Phase 7 (registration) territory, not Phase 8 (lifecycle), and plan 08-10
modifies no source at all. Exit 127 is "command not found", so the likely cause is binary
resolution at removal time rather than a Gemini-side refusal — which would make it the same
resolution family Phase 6 and Phase 8 plan 08-08 worked on, but that is a hypothesis and this
entry is not the place to test it.

Suggested resolution: clear the live condition by hand today —
`gemini mcp remove --scope user drift` and `gemini mcp remove --scope project drift` — and
diagnose the exit-127 resolution failure in the registration phase AR-06 points at.

## The Windows execution leg — RE-DEFERRED to Phase 9 SC-4, not dropped

Written 2026-08-28 by plan 08-17. Recorded as an explicit re-deferral because the alternative —
letting it fall out of the record at phase close — is exactly how this phase inherited an
ownerless A1 in the first place.

Found during: 08-17, from `08-VERIFICATION.md`'s `deferred` block and `behavior_unverified_items`.

**What is deferred.** SC-1's terminal verb — that `killTree` *terminates* the whole process tree on
Windows via `<SystemRoot>\System32\taskkill.exe` — and the Windows half of SC-3. Every *specified*
property of the argv is proven by executed unit tests on this host, including plan 08-08's derived
system-root rung. "Terminates" is the only clause with no execution behind it anywhere.
`packages/backend/src/kill-tree.win32.test.ts` is 3 cases, collected **3/3 pending on every host
that has ever run it**, and the reserved dead-pid exit-code measurement block is empty — honestly
empty, not fabricated. The branch is unpushed, so the `windows-latest` leg has never fired.

**Ledger entry.** `.planning/WINDOWS.md` entry **12** — *"The three win32 kill-tree cases have never
executed: they are skipIf-gated and no windows-latest run exists for them yet. The reserved dead-pid
exit-code block is empty and the run URL is unfilled."* It stays **open** and closes on the same
event.

**Its owner, and its closing condition, quoted from Phase 9's own text rather than restated from
memory.** ROADMAP.md § *Phase 9: CI Hardening*, success criterion 4 reads verbatim:

> The full `ubuntu/macos/windows` matrix is green and the Windows job is required for merge.

and `08-VERIFICATION.md`'s `deferred` block names the mechanism that makes SC-4 sufficient:

> Phase 9 SC-4: 'The full ubuntu/macos/windows matrix is green and the Windows job is required for
> merge.' The `Gate: the win32 kill-tree suite actually ran` step lives in that job, so one green
> matrix run executes kill-tree.win32.test.ts (3 cases) and fills the reserved dead-pid block.
> Carried forward unchanged from the 2026-08-24 verification.

**So the closing condition is one green matrix run**: the `Gate: the win32 kill-tree suite actually
ran` step reports 3 executed / 0 pending / 0 failed, and the `[measurement]` line records taskkill's
exit code and first stderr line for an already-dead pid. Checked against Phase 9's actual wording on
2026-08-28: SC-4 exists, says what is quoted above, and the gate step lives at `.github/workflows/
ci.yml:269`. **This is a real owner with a real closing condition, and it is the only item in this
file that has one.**

Not fixed here: no plan in Phase 8 can push a branch or run a Windows host, and the maintainer
cannot test native Windows locally — CI on `windows-latest` is the only vehicle, by the project's
own stated constraint.

**REVISED 2026-08-31 — the re-deferral stands unchanged, and the 2026-08-31 readings widened what
sits behind it rather than narrowing it.** Everything measured on 2026-08-31 is macOS
(darwin 25.6.0, Caido 0.58.2, claude-cli), so **none of it transfers to win32 and none of it is
offered as if it did**:

- **A1's causal half is now CONFIRMED on POSIX** — and A1 is a POSIX question by construction. The
  win32 arm has no process groups and no `detached` semantics to honour; `buildOrphanScanPlan`
  refuses on `unsupported-platform` before any spawn. A favourable POSIX reading says nothing about
  the Windows leg and must not be cited as if the mechanism were now "measured".
- **Reading F is the one that touches Windows, and only by making its absence sharper.** The
  runtime reported `parentEnvKeyCount: "0"` on both builds, so G-01 — Caido's sandbox exposing an
  empty `process.env` — is now stated by the runtime itself on a real install rather than inferred.
  That confirms the **POSIX** half of ledger entry 22's identity floor. **Its Windows half is
  untouched**: the claim that libuv back-fills `USERNAME` and `USERPROFILE` is still source
  analysis, not a reading, and it stays owned by Phase 9 alongside G-01's Windows half. If that
  analysis is wrong, the Windows provider CLI cannot authenticate for the same reason macOS could
  not before `39876b5` — and **no green CI matrix run would detect it**, because CI never spawns a
  provider CLI.
- **Ledger entry 12 is unchanged and stays open.** No 2026-08-31 reading touched
  `kill-tree.win32.test.ts`, which is still 3 cases collected 3/3 pending on every host that has
  ever run it, and the reserved dead-pid block is still honestly empty.

**So the closing condition is unchanged** — one green matrix run, the `Gate: the win32 kill-tree
suite actually ran` step reporting 3 executed / 0 pending / 0 failed, and the `[measurement]` line
filled. Re-checked against Phase 9's actual wording on 2026-08-31: SC-4 still reads as quoted above
and the gate step still lives at `.github/workflows/ci.yml:269`.

## The ownerless list — everything Phase 8 leaves open that no remaining phase owns

Written 2026-08-28 by plan 08-17 at the point that plan halted at its blocking-human gate, and
**REVISED 2026-08-31 by the same plan's task 3** once the maintainer supplied the readings. The
revision is applied in place, entry by entry, rather than by rewriting the list: what each entry
said on 2026-08-28 was true on 2026-08-28, and the point of the list is that items do not quietly
change status. Entries **1, 2, 3, 6 and 7** are revised below and each carries its own dated note;
entries **4, 5, 8 and 9** are unchanged; entries **10 and 11** are NEW, created by the readings
rather than closed by them.

**The headline of the revision, stated once here so it is not buried in an entry:** A1's causal
half was measured and came back favourable, so entry 1 CLOSES. The pre-fix Control was taken and
came back **ZERO**, which is the opposite of what it was expected to show, so entry 2 closes as a
*reading* while entry 3 — the CLI-cleanup confounder — **gets worse rather than better**: the
confounder is now implicated rather than merely unexcluded.

Found during: 08-17, by checking every remaining phase in `.planning/ROADMAP.md` against every item
this phase leaves open, rather than by assuming.

**The phases checked, and why each is excluded** — stated once, since the same three exclusions
apply to most entries below:

| Phase | Its actual scope | Why it cannot own a Caido-runtime hardware reading |
|---|---|---|
| **Phase 9: CI Hardening** | A required `windows-latest` job, `.gitattributes`, `\r?\n`-safe snapshots, the full matrix green | Every CI leg runs **Node**, not Caido's LLRT. `packages/backend/src/index.ts` cannot be imported under vitest at all. A green CI run is structurally incapable of answering any question below |
| **Phase 10: Windows Polish** | SC-1..SC-4 install docs / PATH messaging / diagnostics / `windowsHide`; **SC-5** is a real Claude Code turn on a real **Windows** desktop; **SC-6** is Gemini's **Windows** status | Both human criteria are **Windows** confirmations. Nothing in Phase 10 asks anyone to run anything on macOS or Linux |
| **Phases 11-13: the plugin bridge** | Capability discovery, `plugin_call`, event subscription and bridge validation | A different subsystem entirely. Nothing in any of the three touches process lifecycle, termination or the spike |

---

**1. A1's causal half — the patched-probe re-run.**
`08-VERIFICATION.md` states the ownership problem in its own words, quoted verbatim rather than
paraphrased:

> No CI leg executes LLRT and none ever will. NO LATER PHASE OWNS THIS: Phase 9 is CI (Node only),
> Phase 10 SC-5/SC-6 are Windows and Gemini, Phases 11-13 are the plugin bridge. If Phase 8 closes
> without it, A1 is ownerless AND currently recorded as closed.

The second half of that sentence is no longer true — plans 08-11 through 08-14 corrected every
carrier, and `verdict-gate.sh` now enforces the correction in both directions. Narrowed 2026-08-28:
plan 08-16's Table 5 measured A1's **topology** half favourably by direct `ps` observation, so what
remained ownerless was the **causal** half — that a kill aimed at that group actually reaches a
grandchild inside it.

**CLOSED 2026-08-31 — the reading was taken, on the artifact this plan built, by the one person who
could take it.** One diagnostics call on the probe build (`68199fa` + `a1-probe-fix.patch`, plugin
id `d8aee773-b939-4164-a576-9c276ee30df8`) on a real macOS Caido 0.58.2 returned
`spikeDetachedGroupKill: "grandchild-died (detached honoured)"` — `formatSpikeVerdict`'s `dead` arm,
from a classifier that defaults to `inconclusive` and could have printed either of the other two
values. Ledger entry **20** is CLOSED on it.

**The 2026-08-27 reading of that same string stays RETRACTED, and this sentence exists so the two
travel together in this file as well.** The string above is byte-identical to the one withdrawn on
2026-08-28, and that is not a coincidence to be smoothed over — it is the reason `08-SPIKE.md`
carries a written discriminator (§ *Why Reading A is a measurement and not the retraction
repeated*). What makes the 2026-08-31 value a reading is that the code between
`spikeProcessKillType` and the verdict is different: the coalescing `?? false` on an absent
`process.kill` is deleted, the verdict runs through a classifier that defaults to `inconclusive`,
and `pgrep -f 'node -e'` returning `0` proves the patched build is what ran. **A later favourable
measurement on a repaired instrument does not make the earlier vacuous one informative**, and no
correction plans 08-11 through 08-14 made is reverted. **Ledger entry 11 stays OPEN**, narrowed: three of its
four clauses are answered and the fourth — the Control — is answered in the wrong direction (entry 3
below).

**This entry is closed as an OWNERSHIP problem, and the ownership problem was real.** No later phase
would have taken this reading; the milestone would have closed with A1's causal half unmeasured. It
was closed by the maintainer running it by hand in a session this plan halted for, which is not a
mechanism and does not generalise. **The next hardware-only reading this project needs will be
ownerless in exactly the same way**, which is what entries 10 and 11 below now record.

**2. The pre-fix Control — `08-01` truth 3.**
Abstained 2026-08-24, still unmet, and the phase's most load-bearing open measurement: plan 08-16's
readings show *that* the token-bearing child dies, not *why*. Same three exclusions as entry 1 —
it needs a live turn on a **pre-fix** build on a **macOS** Caido. *What would close it:* the two
`pgrep -f mcp-server.mjs | wc -l` counts of `08-SPIKE.md` § *How to run this spike later*, step 4,
on the same probe build as entry 1.

**CLOSED AS A READING 2026-08-31 — and the reading came back the other way.** Both counts were
taken on the probe build: **1** during a live turn (10:55:54), **0** at the first post-Stop sample
(10:56:05), six consecutive zero samples, and `0` at rest afterwards. Stop was corroborated by the
session record rather than asserted — `exitCode: 143` = 128 + 15 = SIGTERM. **`08-01` truth 3
predicted a NON-ZERO count and the measurement is zero**, so the truth is closed by being
*falsified*, not by being satisfied. `08-UAT.md` test 3 moves out of `[pending]` and is recorded as
an **issue** for that reason. **This entry closes; entry 3 does not, and gets worse.**

**3. The CLI-cleanup confounder — REVISED 2026-08-31, and it moved in the wrong direction.**
It was recorded here on 2026-08-28 as closing with entry 2. **It did not close with entry 2; entry 2
made it worse.** Drift's spawned group kill, the single-pid SIGTERM→SIGKILL ladder, the argv-marker
reap and Claude Code's own cleanup of its MCP child were all consistent with plan 08-16's `1 → 0`,
and the Control was supposed to separate them by showing a non-zero on a build where none of Drift's
machinery exists. **The pre-fix build produced the SAME zero.** So:

- The confounder is **no longer merely unexcluded — it is IMPLICATED.** It is now the only candidate
  with a positive observation behind it: on the build with no `detached` at the provider spawn
  (Table 3 shows the pre-fix provider inheriting Caido's group 91048, twice) and only a single-pid
  SIGTERM, the token-bearing child died anyway.
- **Plan 08-16's post-fix zero proves LESS than it appeared to.** Qualified in place at both live
  carriers (`08-SPIKE.md` § *What these readings close, and what they do not*, and `08-UAT.md`
  test 9's `scope_and_caveats`). `08-16-SUMMARY.md` is a dated record in the ARM C immutable class
  and is deliberately **not** edited — it was correct on its date.
- **For Claude Code on macOS, Drift's group-kill machinery is REDUNDANT with the provider's own
  cleanup on this path.** Redundant, not useless: the 2026-08-27 G-04 orphan was a **codex**
  process, foreign-parented, that Drift never spawned, and A6 shows codex puts its MCP child in its
  **own** process group — so neither the group kill nor this cleanup path is established for it.

Still recorded as accepted residual behind threat **T-08-14**, and still ownerless. *What would now
close it:* a Control run against a provider whose own cleanup is NOT implicated — codex is the
obvious candidate and is the one this phase already has an orphan report for. **That reading has
never been taken on any build.**

**4. Ledger entry 13 — no executed assertion over `reapMcpOrphans` and its `cleanupMcpRuntime` call
site.** Narrowed 2026-08-28 by a runtime observation and deliberately left open, because a runtime
observation is not an executed assertion. Phase 9 is the closest plausible home and still does not
own it: its four success criteria are about the `windows-latest` job, and none of them asks for a
new assertion over this wiring. *What would close it:* a static source gate, or making `index.ts`
reachable by a test — the second is a standing structural problem this milestone never scoped.

**5. Ledger entry 15 — `reapSessionOrphansIfIdle`'s idle-gated call site was never exercised.**
Same exclusions and same reasoning as entry 4. *What would close it:* a reading taken with
`activeSessions > 0` and a Drift-owned MCP call in flight, or an executed assertion over the gate.

**6. A6 for gemini and copilot — unmeasured in either direction. WIDENED 2026-08-31.**
A6 is a per-provider split: TRUE for Claude Code, **FALSIFIED** for codex. Phase 10 SC-6 is the
nearest thing to an owner and is **not** one: it asks whether Gemini works on **Windows**, not
whether Gemini's MCP child shares Gemini's process group. *What would close it:* `08-SPIKE.md`
§ *Step 3*, run against a Drift-spawned gemini turn and a Drift-spawned copilot turn.

**Widened by the 2026-08-31 readings, because the per-provider gap now costs more than it did.**
Every reading this phase has — the A1 causal half, the topology control pair, both Controls, all
four HEAD-build readings — is **claude-cli only**. With the Control showing that Claude Code cleans
up its own MCP child, "which provider" stopped being a coverage detail and became the variable that
decides what Drift's termination machinery is actually doing. **codex now belongs on this entry
too**: it is not merely unmeasured for A6 (it is measured, and FALSIFIED), it is unmeasured on the
Control path, which is the path that matters most for it.

**7. The abstained cells, carried forward verbatim with their blockers. EXTENDED 2026-08-31.**

*The three from plan 08-16, unchanged:* provider-CLI liveness after Stop (*no post-Stop `ps` was
re-run*); provider-CLI liveness after the timeout fired (*same blocker*); the elapsed interval
between the cancel and the diagnostics capture (*not timed, and `ageMs` is not it*).

*The two added by plan 08-17 on 2026-08-31:* a raw `ps` listing scanned by eye for leftover
fixture-shaped rows after the A1 diagnostics call (*the maintainer reported the
`pgrep -f 'node -e' | wc -l` count, which is the stronger reading for the leak question, and did not
additionally paste a listing — so the cross-check against a mis-specified pattern was not
performed*); and the identity of the **two pids Reading E's `kind=reap exit=0 killed=2` signalled**
(*the reap's record carries a count, not identities; naming its targets would be inference*).

Same three exclusions for all five. *What would close them:* one more
`ps -eo pid,ppid,pgid,args` immediately after Stop, on any future hardware session — which would
also, in the same command, answer the provider-liveness cells that are the direct route to entry 3.

**8. `SUMMARY_KNOWN_UNPINNED` in `verdict-gate.sh` still lists seven names.** ARM C pins ten summary
blobs and accepts seven by name; each unpinned name is a hole in the immutability assertion.
Inherited from plan 08-11 and not any later plan's to close. *What would close it:* promote all
seven to pinned blob hashes once the gap-closure round is finished and the files stop moving.

**9. Ledger entries 7 and 10 are not byte-identical across their markdown row and their JSON
object** — a doubled backslash in the row where the JSON carries one (entry 7 at char 226, entry 10
at char 255). Both are Phase 6 entries, both already `fixed`. Observed by plan 08-16 and left
unrepaired under its scope boundary; no phase owns register hygiene. *What would close it:* one
escaping fix in whichever representation is wrong, with the parity check re-run.

**10. THE A1 PROPAGATION FOLLOW-UP — `verdict-gate.sh` is RED and is EXPECTED to stay red until
this lands. NEW 2026-08-31, created by the reading rather than closed by it.**

`08-SPIKE.md` now states A1's causal half favourably, in Table 1's verdict cell, and it is the only
carrier in the tree that does. Its exact wording is block-quoted here rather than restated on a live
line — **this file must not become a second carrier of the claim while describing it**, which is a
trap the gate itself catches and which is why the quote marks are load-bearing:

> **CLOSED FAVOURABLY — MEASURED 2026-08-31 on the probe build, with an instrument that could have
> printed either of the other two values.**

ARM A/A1-STALE therefore fails on `08-SPIKE.md`. **That red is the
gate working, not the gate breaking** — it was written down in advance in `08-SPIKE.md` § *What a
definite verdict here does to `verdict-gate.sh`, said in advance*, before any reading existed,
specifically so it could not be met as a surprise and resolved the cheap way. The gate is
**UNMODIFIED**: `git diff` on `verdict-gate.sh` is empty, no exclusion was added, no pattern was
narrowed, and no wording in `08-SPIKE.md` was chosen to dodge the match.

The gate's own output, verbatim, is the discovery half of the worklist:

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE] .planning/phases/08-process-lifecycle/08-SPIKE.md states A1's WITHDRAWN
favourable verdict on 1 live line(s) (outside any block quote). A1's reading was retracted
2026-08-28; the verdict is OPEN.
```

**And ARM B's `CARRIERS_A1` array is the list of files that must change**, quoted from the gate's
own source rather than re-enumerated by hand — this phase's carrier census has been wrong five
times, which is why the gate consumes no count:

```
.planning/phases/08-process-lifecycle/08-SPIKE.md   <- already updated; the red is here
.planning/phases/08-process-lifecycle/08-VALIDATION.md
.planning/phases/08-process-lifecycle/08-SECURITY.md
.planning/WINDOWS.md                                 <- entry 11 narrowed, entry 20 closed
.planning/STATE.md
packages/backend/src/index.ts
packages/backend/src/kill-plan.ts
packages/backend/src/kill-tree.posix.test.ts
```

plus `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md`, which ARM B does not police in this
direction but which ledger entry 20 records as having carried the propagated claim.

**Why this plan did not do the propagation itself:** its `files_modified` frontmatter names three
files, the source carriers are code, and rewriting eight carriers' A1 verdicts is a change with its
own review surface — doing it as an unplanned tail on a transcription plan is how the original
defect propagated in the first place. *What would close it:* one plan that rewrites the eight
carriers to state the 2026-08-31 verdict **while preserving the 2026-08-27 retraction as a marked
correction**, then updates `RETRACTION_TOKEN`/`RETRACTION_DATE` handling in ARM B to match, and
turns the gate green by making the tree consistent rather than by making the gate quieter.
**Nobody owns it.** Same three exclusions as every entry above; it is not a hardware reading, so it
is the one item on this list that any phase *could* technically absorb — none of them says it will.

**11. WHAT THE NINE POSIX TERMINATION SITES ARE BUYING, given the Control. NEW 2026-08-31.**

The Control shows that for **claude-cli on macOS** the token-bearing child dies with or without
Drift's machinery. That does not make the machinery removable — codex is measured FALSIFIED for A6
and untested on the Control path, and it is the provider the one real orphan report came from — but
it does mean **nothing in this repository currently demonstrates a case where Drift's group kill is
what saved a process from being orphaned.** That is a real open question about the phase's central
mechanism and it did not exist before 2026-08-31.

Recorded here rather than resolved, because resolving it either way from this evidence would be
exactly the over-reach this phase exists to correct: **redundant for one combination is not useless,
and it is not proven-necessary either.** *What would close it:* the Control path run against codex,
which is entry 3's own suggested resolution — the two entries close together or not at all.
**Nobody owns it.**

---

**Two items are deliberately NOT on this list, because they already have a written entry point
elsewhere in this file:** the registration layer (AR-06 / decision GD-02 — *"a registration-focused
phase entered through `/gsd-discuss-phase`"*) and the live Gemini `mcp remove` exit-127 failure.
Both are recorded above with a suggested resolution. Adding them twice would make the ownerless list
look longer than it is.

**Suggested resolution — an entry point, not an assignment. REVISED 2026-08-31.**

*Entries 1 and 2 are closed by readings.* What is left splits in two, and the two halves want
different routes.

**The hardware half — entries 3, 6, 7 and 11.** Still one maintainer session on one macOS machine,
and the probe build already exists. But the shopping list changed: on 2026-08-28 the ask was "take
the two readings"; after 2026-08-31 it is **"take them again against codex, and run one
`ps -eo pid,ppid,pgid,args` immediately after Stop."** That single extra command answers entry 7's
provider-liveness cells, and codex answers entries 3, 6 and 11 together, because codex is the one
provider whose own cleanup is not implicated and whose MCP child is known to sit outside the CLI's
group. The route is unchanged: `/gsd-phase` to insert a short hardware-reading phase before the
milestone closes, or `/gsd-audit-uat` to sweep this class across phases.

**The desk half — entry 10.** Not a reading; it is eight carriers and a gate. It needs a plan, not
a machine, and it is the one item here that any remaining phase could absorb without a hardware
session. Until it lands, **`verdict-gate.sh` exits non-zero by design** and anyone running it should
expect ARM A red on `08-SPIKE.md` — that expectation is written into `08-SPIKE.md` itself so a
future reader meets it there and not only here.

The house style in this file is to suggest a route rather than assign work, because assigning it
would imply a decision that has not been made. What must **not** happen is the thing this list
exists to prevent — the milestone completing with these recorded as closed by nobody having looked.
**Note that entry 1 closed only because a human was asked, in a session a plan halted for. That is
not a mechanism, and entries 3, 6, 7 and 11 need the same thing again.**
