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

## The ownerless list — everything Phase 8 leaves open that no remaining phase owns

Written 2026-08-28 by plan 08-17, **at the point that plan halted at its blocking-human gate**, and
therefore describing the state as of that halt. If the maintainer takes the two hardware readings
plan 08-17 is waiting on, entries 1, 2 and 3 below change and this list is revised by the plan's
own task 3 — they are listed here because on the evidence that exists today they are unowned, and a
list that omitted them until they were certain would omit them forever.

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
carrier, and `verdict-gate.sh` now enforces the correction in both directions. **The first half is
still true.** Narrowed 2026-08-28: plan 08-16's Table 5 measured A1's **topology** half favourably
by direct `ps` observation, so what remains ownerless is the **causal** half — that a kill aimed at
that group actually reaches a grandchild inside it. *What would close it:* one diagnostics call on
the probe build plan 08-17 task 1 produced, on a real macOS Caido. Ledger entry **11** stays open.

**2. The pre-fix Control — `08-01` truth 3.**
Abstained 2026-08-24, still unmet, and the phase's most load-bearing open measurement: plan 08-16's
readings show *that* the token-bearing child dies, not *why*. Same three exclusions as entry 1 —
it needs a live turn on a **pre-fix** build on a **macOS** Caido. *What would close it:* the two
`pgrep -f mcp-server.mjs | wc -l` counts of `08-SPIKE.md` § *How to run this spike later*, step 4,
on the same probe build as entry 1.

**3. The CLI-cleanup confounder.**
Closes with entry 2 and with nothing else. Drift's spawned group kill, the single-pid
SIGTERM→SIGKILL ladder, the argv-marker reap and Claude Code's own cleanup of its MCP child are all
consistent with plan 08-16's `1 → 0`, and no reading yet taken separates them. Recorded as accepted
residual behind threat **T-08-14** since 2026-08-24.

**4. Ledger entry 13 — no executed assertion over `reapMcpOrphans` and its `cleanupMcpRuntime` call
site.** Narrowed 2026-08-28 by a runtime observation and deliberately left open, because a runtime
observation is not an executed assertion. Phase 9 is the closest plausible home and still does not
own it: its four success criteria are about the `windows-latest` job, and none of them asks for a
new assertion over this wiring. *What would close it:* a static source gate, or making `index.ts`
reachable by a test — the second is a standing structural problem this milestone never scoped.

**5. Ledger entry 15 — `reapSessionOrphansIfIdle`'s idle-gated call site was never exercised.**
Same exclusions and same reasoning as entry 4. *What would close it:* a reading taken with
`activeSessions > 0` and a Drift-owned MCP call in flight, or an executed assertion over the gate.

**6. A6 for gemini and copilot — unmeasured in either direction.**
A6 is now a per-provider split: TRUE for Claude Code, **FALSIFIED** for codex. Phase 10 SC-6 is the
nearest thing to an owner and is **not** one: it asks whether Gemini works on **Windows**, not
whether Gemini's MCP child shares Gemini's process group. *What would close it:* `08-SPIKE.md`
§ *Step 3*, run against a Drift-spawned gemini turn and a Drift-spawned copilot turn.

**7. The three cells plan 08-16 abstained on**, carried forward verbatim with their blockers:
provider-CLI liveness after Stop (*no post-Stop `ps` was re-run*); provider-CLI liveness after the
timeout fired (*same blocker*); the elapsed interval between the cancel and the diagnostics capture
(*not timed, and `ageMs` is not it*). Same three exclusions. *What would close them:* one more
`ps -eo pid,ppid,pgid,args` immediately after Stop, on any future hardware session.

**8. `SUMMARY_KNOWN_UNPINNED` in `verdict-gate.sh` still lists seven names.** ARM C pins ten summary
blobs and accepts seven by name; each unpinned name is a hole in the immutability assertion.
Inherited from plan 08-11 and not any later plan's to close. *What would close it:* promote all
seven to pinned blob hashes once the gap-closure round is finished and the files stop moving.

**9. Ledger entries 7 and 10 are not byte-identical across their markdown row and their JSON
object** — a doubled backslash in the row where the JSON carries one (entry 7 at char 226, entry 10
at char 255). Both are Phase 6 entries, both already `fixed`. Observed by plan 08-16 and left
unrepaired under its scope boundary; no phase owns register hygiene. *What would close it:* one
escaping fix in whichever representation is wrong, with the parity check re-run.

---

**Two items are deliberately NOT on this list, because they already have a written entry point
elsewhere in this file:** the registration layer (AR-06 / decision GD-02 — *"a registration-focused
phase entered through `/gsd-discuss-phase`"*) and the live Gemini `mcp remove` exit-127 failure.
Both are recorded above with a suggested resolution. Adding them twice would make the ownerless list
look longer than it is.

**Suggested resolution for entries 1, 2, 3 and 7 — an entry point, not an assignment.** They are one
maintainer session on one macOS machine, and plan 08-17 has already built the artifact they need.
The house style in this file is to suggest a route rather than assign work, because assigning it
would imply a decision that has not been made: the cheapest route is `/gsd-phase` to insert a short
hardware-reading phase before the milestone closes, or `/gsd-audit-uat`, which is the command that
exists to sweep exactly this class of outstanding item across phases. What must **not** happen is
the thing this list exists to prevent — the milestone completing with these recorded as closed by
nobody having looked.
