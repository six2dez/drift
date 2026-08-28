---
phase: 8
slug: process-lifecycle
status: "one-reading — A6 measured (FALSIFIED); A1's reading RETRACTED 2026-08-28 and its verdict OPEN; the Control never taken"
measured: "2026-08-27 — readings 1-4 taken on real hardware during UAT. The A6 half (readings 3-4) stands. The A1 half (readings 1-2) was RETRACTED 2026-08-28: the instrument could not produce the unfavourable answer, so the favourable one carries no information. Reading 5 (the Control) was NOT taken and is still an absence"
vehicle: "probe build 68199fa installed in a real macOS Caido, darwin 25.6.0 — one build, one platform, one provider CLI"
probe_commit: 68199fa
assumptions:
  A1: RETRACTED — reading withdrawn, verdict OPEN
  A6: FALSIFIED
---

# Phase 8 Wave-0 spike — A1's reading RETRACTED, A6 falsified, the Control still unmeasured

> **SUPERSEDED 2026-08-27 (preserved, not deleted — correct as a record of what this file
> claimed on its date, false as a live claim since 2026-08-28):**
>
> # Phase 8 Wave-0 spike — A1 closed favourably, A6 falsified, the Control still unmeasured
>
> Superseded frontmatter, preserved verbatim:
>
> ```
> status: partially-measured
> measured: "2026-08-27 — readings 1-4 (A1 and A6) taken on real hardware during UAT; reading 5 (the Control) was NOT taken and is still an absence"
> assumptions:
>   A1: CLOSED-FAVOURABLY
>   A6: FALSIFIED
> ```

**CORRECTION, 2026-08-27.** This file recorded a spike that was built and never run.
Two of its three readings have now been taken, on the maintainer's own macOS hardware,
during UAT. It is a **partial** results document: A1 and A6 carry measurements, the
Control carries an absence, and the difference between the two is the whole point of
keeping them in one file. The superseded 2026-08-24 text is preserved throughout as
`> ` block quotes and is never deleted — the `07-VALIDATION.md` marked-correction
convention, applied here for the same reason `packages/backend/src/spawn-plan.ts:46-80`
keeps its own falsified prediction.

**SECOND CORRECTION, 2026-08-28 — A1's reading is RETRACTED.** The 2026-08-27 A1 entry
below was not a measurement. The probe at `68199fa` decided the verdict with
`const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false;` — and the SAME probe
run, five lines earlier in the SAME diagnostics report, measured
`spikeProcessKillType: "undefined"`. With `process.kill` absent the optional chain yields
`undefined`, `?? false` makes `alive === false`, and the favourable string is emitted
UNCONDITIONALLY. The instrument could not print the unfavourable answer on the runtime it
was run on, so the favourable one carries **zero information**. The reading below is
preserved because it is what the terminal printed; the verdict drawn from it is withdrawn.
See `08-VERIFICATION.md` gap 1.

**What reads what, as of 2026-08-28:**

- **A1 — RETRACTED; verdict OPEN, not measured.** The instrument output was
  `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` on darwin 25.6.0, probe
  build `68199fa` — a real string that could not have been any other string. A1 is back
  where it was on 2026-08-24: unmeasured on the shipping runtime.
- **A6 — FALSIFIED, by measurement.** The provider CLI (codex, pid **43921**) sat in
  process group 43752 while its own `mcp-server.mjs` child (pid **44284**) sat in group
  44284 — a group of its own.
- **The Control — still NOT taken.** No pre-fix after-Stop count exists on any machine.
  `08-UAT.md` test 3 is `[pending]`, and this file must continue to say so. A fabricated
  confirmation here is the precise failure the spike existed to prevent.

> **SUPERSEDED 2026-08-27 (preserved, not deleted — the A1 bullet as it read that day):**
>
> **What reads what, as of 2026-08-27:**
>
> - **A1 — CLOSED FAVOURABLY, by measurement.** `spikeDetachedGroupKill:
>   "grandchild-died (detached honoured)"` on darwin 25.6.0, probe build `68199fa`.

> **SUPERSEDED (written 2026-08-24, after the hardware checkpoint was waived):**
>
> # Phase 8 Wave-0 spike — A1 and A6, NOT measured
>
> **This file records a spike that was built but never run.** It is not a results
> document. Every result field below reads OPEN, and that is the finding.
>
> Superseded frontmatter, preserved verbatim:
>
> ```
> status: not-run
> measured: none — the hardware checkpoint was waived on 2026-08-24 and no readings were taken
> vehicle: "none — built and bundled, never executed against a real Caido install"
> assumptions:
>   A1: OPEN
>   A6: OPEN
> ```

A1 and A6 are the two highest-risk assumptions in `08-RESEARCH.md`. Neither is closable
by CI, which is exactly why the spike was the only vehicle available: every CI leg runs Node rather than Caido's LLRT, and no CI leg executes a provider
CLI binary (`08-VALIDATION.md` § *Vehicle caveat* items 2 and 3). A temporary diagnostics
probe was written, type-checked, linted and bundled into `dist/plugin_package.zip` to close
them on the maintainer's own macOS hardware for the cost of one build and one chat turn.

**How the readings were finally taken (2026-08-27).** The probe was not executed in Wave 0; the
maintainer waived its hardware checkpoint on 2026-08-24. It was executed on **2026-08-27**,
during UAT, rebuilt from the same recoverable commit `68199fa`, and readings 1-4 were taken
then. Reading 5, the Control, still was not — it requires the *pre-fix* build, and nobody has
run one. Nothing in this file is inferred, estimated or reconstructed: a fabricated A1
confirmation is the precise failure the spike existed to prevent, and it would have silently
invalidated every downstream plan in the phase. That rule now cuts in the other direction too —
it is why the Control table below still reads as an absence rather than being completed to
match its neighbours.

The 2026-08-24 record is preserved below rather than rewritten. It was correct on its date, and
the fact that a measurement was planned, budgeted, waived and only later taken is itself part of
the record.

> **SUPERSEDED 2026-08-24 (preserved, not deleted — correct on its date, false as a live claim
> since 2026-08-27):**
>
> The probe was never executed. On 2026-08-24 the maintainer waived the `checkpoint:human-verify`
> that would have run it, replying `approved` and `continue` without supplying any of the six
> readings, after being asked for them explicitly and told that this file is built from them.
> That is a recorded maintainer decision, not an oversight or an executor omission. **No reading
> was taken, so no reading is written here.** Nothing in this file is inferred, estimated or
> reconstructed — a fabricated A1 confirmation is the precise failure the spike existed to
> prevent, and it would have silently invalidated every downstream plan in the phase.
>
> The falsified expectation is kept in place rather than deleted, per the house style at
> `packages/backend/src/spawn-plan.ts:46-80`: deleting the expectation would hide the fact that
> a measurement was planned, budgeted and then not taken.

---

## A1 — does the shipped Caido LLRT honour `detached: true`?

| Field | Value |
|---|---|
| Date taken | **2026-08-27** |
| Platform | `darwin 25.6.0` (real macOS Caido install, probe build `68199fa`) |
| Caido version | **not recorded** — the diagnostics block reports `processVersion: unavailable` and Caido's own About string was not captured. Recorded as an absence rather than filled in |
| `spikeProcessKillType` | `"undefined"` |
| `spikeDetachedGroupKill` | `"grandchild-died (detached honoured)"` |
| `spikeNote` | `"Phase 8 A1 probe — temporary, removed by T-08-03"` |
| **Verdict** | **RETRACTED 2026-08-28 — the reading is real, the verdict drawn from it is withdrawn. A1 is OPEN, not measured.** |
| **Why retracted** | The probe determined liveness with an optional call (`signalRef.process?.kill?.(grandchildPid, 0) ?? false`) on a primitive the same run measured ABSENT (`spikeProcessKillType: "undefined"`), coalesced the absent case to "not alive", and therefore emitted the favourable string unconditionally — the red input did not exist. |

> **SUPERSEDED 2026-08-27 (preserved, not deleted — what the Verdict cell read that day):**
>
> | **Verdict** | **CLOSED FAVOURABLY — measured 2026-08-27** |

> **SUPERSEDED 2026-08-24 (preserved, not deleted).** The four cells above read:
>
> | Caido version | **not recorded — spike not run** |
> | `spikeProcessKillType` | **not recorded — spike not run** |
> | `spikeDetachedGroupKill` | **not recorded — spike not run** |
> | **Verdict** | **OPEN — not measured** |

**The two reading rows above STAY, and that is the point.** `spikeProcessKillType:
"undefined"` and `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` are what the
instrument printed on 2026-08-27 on darwin 25.6.0. Deleting them would falsify the record. What
is withdrawn is the inference from the second row, because the first row explains why the second
row could not have read anything else.

A1 rests on source analysis alone again, exactly as it did before 2026-08-27. The source is the
mechanism — `caido/dependency-llrt`, branch `caido`, commit
`a5b021c51d1521f32018d3f3f2e70291df50501d`, `modules/llrt_child_process/src/lib.rs:448, 462,
512-521`, which calls `command.process_group(0)` on unix for a detached spawn — and it has
**never been executed under the runtime a user actually runs**. The failure mode this section
warned about (a shipped fork that ignores `detached`, so the group reference names a group that
was never created, while every CI leg stays green) is neither confirmed nor refuted. It is
unobserved.

> **SUPERSEDED 2026-08-27 (preserved, not deleted — false as a live claim since 2026-08-28):**
>
> A1 no longer rests on source analysis alone. The source is still the mechanism —
> `caido/dependency-llrt`, branch `caido`, commit
> `a5b021c51d1521f32018d3f3f2e70291df50501d`, `modules/llrt_child_process/src/lib.rs:448, 462,
> 512-521`, which calls `command.process_group(0)` on unix for a detached spawn — and it is now
> **corroborated by execution on the runtime users actually run**. The failure mode this section
> warned about (a shipped fork that ignores `detached`, so the group reference names a group that
> was never created, while every CI leg stays green) did **not** occur.

> **SUPERSEDED 2026-08-24:** *A1 rests entirely on source analysis: `caido/dependency-llrt`,
> branch `caido`, commit `a5b021c51d1521f32018d3f3f2e70291df50501d`,
> `modules/llrt_child_process/src/lib.rs:448, 462, 512-521`, which calls
> `command.process_group(0)` on unix for a detached spawn. That source was read; it was never
> executed under the runtime a user actually runs.*

**Second field, SAME matter — corrected 2026-08-28.** `spikeProcessKillType` came back
`"undefined"`, not `"function"`. This was filed on 2026-08-27 as a *separate* finding (UAT
**G-02**) that did not bear on A1. It is not separate. It is the reason A1's reading is
withdrawn: Caido's plugin sandbox exposes a restricted `process` shim with no kill primitive,
the probe's verdict line called that missing primitive optionally and defaulted the miss to
"dead", and so the row directly above it was forced. The consequence for the *production* code
is still what `08-SECURITY.md` § *G-02 — recorded, not fixed* records — `isPidAlive` guards
`typeof killRef !== "function"` by answering "alive", so every unknown resolves toward alive and
neither check can ever ADD a kill. The consequence for the *probe* is the opposite direction and
nobody traced it: there, the unknown resolved toward the favourable verdict.

> **SUPERSEDED 2026-08-27 (preserved, not deleted):**
>
> **Second field, second matter.** `spikeProcessKillType` came back `"undefined"`, not
> `"function"`. That is a separate finding (UAT **G-02**) and it does **not** weaken A1: Caido's
> plugin sandbox exposes a restricted `process` shim with no kill primitive, so the signal-0
> liveness probe cannot run there. It is recorded as *degraded as designed* — see
> `08-SECURITY.md` § *G-02 — recorded, not fixed* — and the step-2 expectation below is annotated
> accordingly.

---

## A6 — is the CLI's MCP child in the CLI's process group?

| Field | Value |
|---|---|
| Date taken | **2026-08-27** (corrected command — see § *Step 3*) |
| Provider CLI row | pid **43921**, ppid 43752, pgid **43752** — `/Applications/ChatGPT Classic.app/Contents/Resources/codex -c fe` |
| `node …mcp-server.mjs` row | pid **44284**, ppid **43921**, pgid **44284** — `/opt/homebrew/bin/node /var/folders/.../drift-mcp-9b48c5c2275914bc4fd0/mcp-server.mjs` |
| Matched? | **NO.** The child's pgid (44284) equals its own pid, not the CLI's pid (43921); and the CLI itself sits in a third group (43752) |
| **Verdict** | **FALSIFIED — measured 2026-08-27** |

> **SUPERSEDED 2026-08-24 (preserved, not deleted).** The four cells above read:
>
> | `node …mcp-server.mjs` pgid | **not recorded — spike not run** |
> | `claude` pid | **not recorded — spike not run** |
> | Matched? | **not determined** |
> | **Verdict** | **OPEN — not measured** |

A6 was rated *"medium-high, and untested"* in `08-RESEARCH.md` § *Assumptions Log*. It is now
**measured, and measured FALSE**: the CLI's MCP child creates its own process group, so a group
signal aimed at the CLI's group cannot reach the token-bearing child. OQ-2's single-pid rung
does not rescue it either — that rung signals the CLI, not the child.

**The caveat travels with the verdict, and is not a softening.** This is **one** provider
(Codex), on an instance Drift did **not** spawn (UAT gap G-04), so Drift's own `detached: true`
was not in play for the CLI. That does not weaken the observation — a child creating its own
group is a property of how the CLI launches it, not of how the CLI itself was started — but
**Claude Code, the active provider, remains unmeasured**. Re-run against a Drift-spawned Claude
turn before generalising to all providers.

> **SUPERSEDED 2026-08-24:** *A6 was rated "medium-high, and untested" in `08-RESEARCH.md`
> § Assumptions Log before this plan, and it is unchanged by this plan. If any provider CLI
> calls `setsid()` on its own MCP child, a process-group signal misses it and LIF-02 is not
> closed by process groups alone.*

---

## Control — the LIF-02 defect, reproduced

| Field | Value |
|---|---|
| `pgrep -f mcp-server.mjs \| wc -l` before Stop | **not recorded — spike not run** |
| `pgrep -f mcp-server.mjs \| wc -l` after Stop | **not recorded — spike not run** |
| **Verdict** | **OPEN — the defect was never observed on real hardware** |

**This table is DELIBERATELY UNCHANGED on 2026-08-27, and that is a result, not an oversight.**
Its neighbours above were filled from readings taken that day; this one was not, because the
Control requires the **pre-fix** build and no such build has been run on any machine.
`08-UAT.md` test 3 is still `[pending]`. Completing this table to match the other two would be
the exact fabrication the spike exists to prevent — see `08-SECURITY.md` threat **T-08-49**.

The after-Stop count was to be the number plan 08-05's closing human-verify drives to zero.
That closing checkpoint has **no measured baseline to compare against**; it will have to
establish its own before/after on the day, or accept that it is demonstrating a fix to a
defect this phase never observed directly. The T-08-14 attestation of 2026-08-24 is therefore
still an isolated zero, and the CLI-cleanup confounder it carries is still unexcluded.

---

## How to run this spike later

The probe code is **not in HEAD** — task T-08-03 removed it, as its own plan required, because
it spawns fixture processes on every `getDiagnostics` call and must not ship. To re-run it,
build from the commit that carries it:

```
git checkout 68199fa -- packages/backend/src/index.ts
pnpm build
```

Then restore HEAD's version afterwards with `git checkout HEAD -- packages/backend/src/index.ts`.
`index.ts` at HEAD is byte-equivalent to its pre-spike state apart from a three-line breadcrumb
comment above `getDiagnostics`, so the checkout is clean in both directions.

The procedure below is preserved so it can be executed later without reconstruction. **Steps 1-3
were executed on 2026-08-27 and their readings are in the tables above; step 4 was not.** Re-run
steps 1-3 against a **Drift-spawned Claude Code** turn to extend A6 beyond the single Codex
reading; run step 4 against the pre-fix build to take the Control.

### Step 1 — install

1. `pnpm build`
2. Install `dist/plugin_package.zip` into Caido (or point Caido at the dev build) and restart Caido.
3. Note the Caido version string from Caido's own About/Settings. It goes in the A1 table above,
   because A1 is a claim about *the LLRT fork this specific Caido ships*.

### Step 2 — readings 1 and 2 (A1)

Open Drift → Settings → the Copy-diagnostics action, and record the three `spike*` fields.

- `spikeProcessKillType` — **measured `"undefined"` on 2026-08-27, and the prediction attached
  to that value is SUPERSEDED.** Caido's plugin sandbox exposes a restricted `process` shim
  with no kill primitive, so the `08-RESEARCH.md` § *Q5* liveness probe cannot run there. This
  is **not** a halt and **not** a redesign trigger: the CR-02 fix (post-dating the original
  prediction) put a handle-identity check ahead of the liveness probe, `isPidAlive` already
  guards `typeof killRef !== "function"` by answering "alive", and every unknown resolves
  toward alive — so neither check can ever ADD a kill. Recorded as *degraded as designed* in
  `08-SECURITY.md` § *G-02 — recorded, not fixed* and at `index.ts:5319-5331`.

> **SUPERSEDED 2026-08-24 (preserved, not deleted):**
>
> - `spikeProcessKillType` — expected `function`. Anything else means the liveness probe in
>   `08-RESEARCH.md` § *Q5* is not available on that build, and plan 08-03's deferred-rung guard
>   needs a redesign.
- `spikeDetachedGroupKill` — **this is A1.** It is exactly one of:
  - `grandchild-died (detached honoured)` → A1 closed favourably; the phase proceeds as planned.
  - `grandchild-survived (detached NOT honoured)` → the phase's POSIX mechanism is falsified.
    **STOP**, do not run plan 08-02, re-plan the phase.
  - `inconclusive (no fixture output)`, `skipped (node executable not resolved)`, or
    `error: <constructor name>` → **also a halt.** An unclear A1 is not a pass. Record verbatim.

### Step 3 — readings 3 and 4 (A6)

> **CORRECTION (2026-08-27, during UAT — this step was unrunnable as first written).**
> The original command was:
>
> ```
> ps -eo pid,ppid,pgid,comm | grep -E 'mcp-server|claude'
> ```
>
> `ps -eo comm` prints the **executable name**, not the command line. The MCP server runs
> as `node <tmp>/mcp-server.mjs`, so its `comm` is `node` — the `mcp-server` alternation
> can never match, and the command returns only `claude` rows however many MCP servers are
> alive. Run against a real install it produced nine `claude` rows and no MCP row at all.
> The fix is `args` (full command line) instead of `comm`, plus an anchor that distinguishes
> the **Drift-spawned** CLI from the maintainer's own `claude` sessions — Drift attaches via
> `--mcp-config` (see CLAUDE.md § *Per-Provider MCP Attachment Strategy*), the user's own
> sessions do not.
>
> The same broken spelling was propagated to `08-RESEARCH.md` § *Validation Architecture*
> (Wave 0 item 5), `08-01-PLAN.md` (incl. an acceptance criterion), `08-05-PLAN.md` ×3 and
> `08-VERIFICATION.md`. Those are historical records of what was planned; **this file is the
> procedure meant to stay runnable, so it is corrected here.** Nobody caught it through
> research → plan → plan-check → execute → verify because nobody executed it — the same
> class as the three pass-by-accident gates this phase did catch.

Start a Claude Code chat turn in Drift with the MCP attached, and while it is still running:

```
ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep
```

Record the **pgid** of the `node …mcp-server.mjs` row and the **pid** of the `claude` row
carrying `--mcp-config` (that is Drift's child; unadorned `claude` rows are unrelated
sessions).
Equal → A6 closed favourably: the MCP child sits in the CLI's group, so a group signal reaches
it. Different → the CLI calls `setsid()` on its own child; LIF-02 is **not** closed by process
groups alone. Report and stop.

### Step 4 — reading 5 (the LIF-02 control)

With that same turn still running:

```
pgrep -f mcp-server.mjs | wc -l
```

Click Stop in the Drift chat, wait ~3 seconds, then run it again:

```
pgrep -f mcp-server.mjs | wc -l
```

Record both counts. A non-zero count **after** Stop is the LIF-02 defect reproduced on real
hardware. Clean up any survivor by pid before continuing.

Do not summarise, interpret or round any of the five readings. Record what the terminal said.

---

## What this spike does and does NOT close

**Rewritten 2026-08-27.** Stated unsoftened in both directions, because the whole point of a
spike record is that a later reader can tell measured ground from assumed ground.

**Corrected again 2026-08-28.** One of the two entries below moved back across that line: A1's
reading was withdrawn, so A1 returns to the does-NOT-close list it left on 2026-08-27.

**What it CLOSES:**

- **A6, closed in the NEGATIVE, for one provider.** Codex's `mcp-server.mjs` child sits in its
  own process group (44284), not the CLI's (43752). For that provider, LIF-02 is **not** closed
  by process-group signalling.

**What it still does NOT close — measured on one build, one platform, one provider:**

- **A1 — RETRACTED 2026-08-28, and back in this list.** The 2026-08-27 entry moved A1 into the
  CLOSES list above; it is moved back here because the instrument that produced its reading
  could not have printed the other answer. The A1 bullet as it read on 2026-08-27 is preserved
  in the block quote below. The mechanism: the probe decided the verdict with an optional call on
  `process.kill`, a primitive the same run measured absent, so it could only ever print the
  favourable string.
- **Whether the shipped Caido LLRT honours `detached: true` at all.** The nine `killTree` sites
  that depend on it are backed by **source analysis of a pinned commit** — `caido/dependency-llrt`
  branch `caido` at `a5b021c`, `modules/llrt_child_process/src/lib.rs:448, 462, 512-521` — and
  **not** by execution on the shipping runtime. That sentence was correct before 2026-08-27 and is
  correct again; it is reinstated here rather than left to be reconstructed later.

> **SUPERSEDED 2026-08-27 (preserved, not deleted — this bullet sat in the CLOSES list above
> until 2026-08-28):**
>
> - **A1, closed favourably.** The shipped Caido LLRT honours `detached: true` on darwin 25.6.0.
>   The nine `killTree` sites that depend on it are backed by execution on the shipping runtime,
>   not by source analysis of a pinned commit alone.

- **Nothing about Claude Code**, which is the maintainer's active provider and the one the whole
  phase was written around. A6 is measured for Codex only.
- **Nothing about Gemini or Copilot.**
- **Nothing about Windows.** `taskkill /t` walks `ParentProcessId` and is indifferent to process
  groups, so A6 was never a Windows question — but nothing here is evidence about win32 either.
- **Nothing about a future Caido that rebases its LLRT fork.** One measurement closes a version,
  not a dependency. That is the surviving justification for OQ-2's single-pid rung.
- **Nothing about the Control.** No pre-fix after-Stop count exists, so the T-08-14 attestation
  is still an isolated zero with the CLI-cleanup confounder unexcluded.
- `08-VALIDATION.md` § *Vehicle caveat* remains the standing list of what this phase's evidence
  does not cover. Item 2 there is now **partly** discharged — the `detached` half is measured,
  the kill-primitive half is not (and is moot: the sandbox exposes no such function) — and item
  3 has moved from an absence to a **negative measurement**.

> **SUPERSEDED 2026-08-24 (preserved, not deleted):**
>
> ## What this spike does NOT close
>
> Everything. Stated unsoftened, because the whole point of a spike record is that a later reader
> can tell measured ground from assumed ground:
>
> - **It closes nothing at all.** A1 and A6 are exactly as open as they were before Phase 8 began.
>   This file adds no evidence; it documents the absence of evidence and the decision that caused it.
> - Had it run, it would still have measured **one** Caido build, on **one** platform, with **one**
>   provider CLI. It would have said nothing about Windows, nothing about Gemini, Codex or Copilot,
>   and nothing about a future Caido that rebases its LLRT fork.
> - `08-VALIDATION.md` § *Vehicle caveat* remains the standing list of what this phase's evidence
>   does not cover. Items 2 and 3 there — "it will not prove Caido's LLRT" and "it will not prove
>   that any real CLI's MCP child is in the killed group" — now apply **in full**, with the Wave 0
>   partial closure they each name as mitigation not taken.

### The spike's own conclusion INVERTED, and this is the finding that mattered

**Added 2026-08-27.** This file previously argued that the phase's single point of failure was a
negative A1, and that OQ-2's single-pid rung was the **only** protection against it. Both halves
of that argument are now wrong, and the way they are wrong is worth reading carefully:

**Amended 2026-08-28: only the SECOND half is wrong.** Point 1 below is corrected in place —
A1 was not answered at all, so the first half of the 2026-08-27 argument is neither confirmed nor
refuted. Points 2 and 3 stand with their original force.

1. **A1 is UNDETERMINED — the instrument could not see.** *(Point 1 corrected in place
   2026-08-28; the 2026-08-27 text is preserved in the block quote directly below.)* The probe's
   verdict line called `process.kill` optionally on a runtime where the same run measured it
   absent, and defaulted the miss to "dead", so the favourable answer was the only answer it
   could give. The failure this section predicted — a fork that ignores `detached`, so the group
   operand names a group that was never created — is **unobserved**, neither confirmed nor
   refuted.

> **SUPERSEDED 2026-08-27 (preserved, not deleted — point 1 as it read that day):**
>
> 1. **A1 came back positive.** The failure this section predicted — a fork that ignores
>    `detached`, so the group operand names a group that was never created — did not happen.

2. **The failure landed at A6 instead**, which the section treated as the lesser risk.
3. **OQ-2's rung does not address A6 at all.** It signals the tracked CLI pid. A6's falsification
   is about the CLI's *child* sitting outside the CLI's group. The rung Phase 8 kept as its
   insurance policy insures against the wrong event.

**And the consequence runs toward MORE caution, not less (added 2026-08-28).** With A1 open,
OQ-2's single-pid rung is defence against the **present** Caido and not only against a future one
that rebases its LLRT fork. The 2026-08-27 re-justification therefore **UNDER-claimed** the rung's
necessity: it narrowed the rung's purpose on the strength of a reading that carried no
information. That is an error toward more caution rather than less, and saying so explicitly is
part of the record — a correction that only ever discovered under-claims would be a suspicious
correction.

**What DOES address it** is the argv-marker orphan reap that plans **08-06** and **08-07**
shipped: `pgrep -f` over a session-unique temp-directory marker adjacent to `mcp-server.mjs`,
followed by a **positive single-pid** kill. It identifies its target by **the target's own
command line** — not by a process group the CLI chose, and not by a handle Drift holds — so it
is **independent of process groups by construction** and therefore insensitive to A6 in either
direction. It is also the first termination path in Drift that can reach an MCP child Drift did
not spawn (UAT gap G-04). Its own limits are recorded rather than implied: POSIX only
(`08-SECURITY.md` **AR-04**), and it fires at start-up and at teardown rather than continuously,
with the multi-session cancel window recorded as **AR-07**.

### The consequence, plainly

**Corrected 2026-08-27. Corrected AGAIN 2026-08-28, in the other direction.** The phase's POSIX
group mechanism for LIF-02 rests on source analysis alone: `caido/dependency-llrt@caido` at
pinned commit `a5b021c` has never been executed on the runtime users actually run. The nine-site
regression the 2026-08-24 paragraph feared is **an open risk again**, because the reading that
retired it has been withdrawn.

There are now **TWO** live risks, and the 2026-08-27 revision traded one for the other instead of
naming both:

- **A6 is FALSIFIED** — for the one provider measured (codex), the group signal cannot reach the
  token-bearing child however faithfully the runtime honours `detached`, because that child sits
  in a group of its own. The answer to this one is the argv-marker reap (§ above), not the group
  operand and not OQ-2's rung.
- **A1 is UNMEASURED** — whether the group reference names a group that exists **at all** on the
  shipping runtime is unknown. If the shipped fork ignores `detached`, the group operand names a
  group that was never created, and **every CI leg stays green while it happens**, because every
  CI leg runs Node and Node honours the option.

OQ-2's single-pid rung **survives, and its justification reverts to the original one**: it is
defence against an *unmeasured* runtime — the **present** Caido — and only secondarily against a
future Caido that rebases its LLRT fork. The 2026-08-27 wording narrowed it to the future case on
the strength of the withdrawn reading, and that narrowing is withdrawn with it. **Do not delete
that rung.** The same wording is carried at `packages/backend/src/kill-plan.ts`'s module header;
keep the two consistent — plan **08-12** makes the matching correction there.

> **SUPERSEDED 2026-08-27 (preserved, not deleted — correct as a record of what this section
> argued on its date, false as a live claim since 2026-08-28):**
>
> **Corrected 2026-08-27.** The phase's POSIX group mechanism for LIF-02 no longer rests on source
> analysis alone: `caido/dependency-llrt@caido` at pinned commit `a5b021c` is now corroborated by
> execution on a real install, so the nine-site regression this paragraph feared did not occur and
> is not the live risk.
>
> The live risk moved. **A6 is falsified**, so on at least one provider the group signal cannot
> reach the token-bearing child however faithfully the runtime honours `detached`. The answer is
> the argv-marker reap (§ above), not the group operand and not OQ-2's rung.
>
> OQ-2's single-pid rung **survives with a corrected justification**, and the correction must be
> written down or the rung will read as redundant to the next reader: it is no longer defence
> against an *unmeasured* runtime, it is defence against a **future Caido that rebases its LLRT
> fork**. One measurement closes a version, not a dependency. Do not delete that rung. The same
> wording is carried at `packages/backend/src/kill-plan.ts`'s module header, which plan 08-06
> corrected on the same date; keep the two consistent.

> **SUPERSEDED 2026-08-24 (preserved, not deleted):**
>
> The phase's POSIX mechanism for LIF-02 rests on source analysis of `caido/dependency-llrt@caido`
> at the pinned commit `a5b021c`, and on nothing that was ever executed. If the Caido build users
> actually run ships a fork that differs — an older one without the `detached` branch, or one that
> handles it differently — then the group kill signals a process group that was never created,
> LIF-02 is not closed, and **every CI leg stays green while it happens**, because every CI leg runs
> Node and Node honours the option. That is finding L-4 of `05-RESEARCH.md` recurring: green CI is
> not evidence about a runtime CI never exercises. Plan 08-02's decision OQ-2 — keep the single-pid
> signal alongside the group signal, explicitly as defence against A1 — is now the phase's **only**
> protection against this, and it degrades a total regression into a partial one rather than
> preventing it.

---

## The rule this spike cost us, stated as a rule

**Added 2026-08-28.** Not an anecdote about one bad line — a standing rule for every assertion in
this repository whose red input requires hardware.

**An assertion whose red input requires hardware MUST state, in the same breath, what a
"cannot tell" answer looks like, and MUST NEVER coalesce it into either verdict.** Three values,
always: alive / dead / cannot-tell. `?? false` on an unavailable primitive is not a default, it is
a fabricated measurement — it converts "I could not look" into "I looked and saw nothing", and a
reader downstream cannot tell the two apart, because the string printed is identical.

That is exactly what happened here. The probe asked
`signalRef.process?.kill?.(pid, 0) ?? false`, the sandbox exposed no `kill`, the miss became
`alive === false`, and the favourable verdict was emitted unconditionally — the red input did not
exist, so a favourable result meant nothing. It is the same vacuous-gate shape this phase caught
thirteen times in its own gates; the fourteenth instance produced a *reading* rather than a green
tick, which is why it propagated into eleven carriers, the ROADMAP, REQUIREMENTS.md and the
Windows ledger before anyone re-read it.

The fixed three-valued determination lives in `packages/backend/src/kill-plan.ts` as
**`classifyLivenessObservation`** (plan **08-15**), which returns `alive`, `dead` or
`inconclusive` and forces every caller to answer the third case explicitly. A re-run of this spike
must consume it rather than re-deriving a boolean; see § *How to run this spike later*, step 2.
