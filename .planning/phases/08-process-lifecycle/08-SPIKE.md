---
phase: 8
slug: process-lifecycle
status: "measured — A1 RE-MEASURED 2026-08-31 on a repaired instrument and CONFIRMED; its 2026-08-27 reading stays RETRACTED; A6 is a per-provider split (TRUE Claude Code / FALSIFIED codex); the Control was TAKEN 2026-08-31 and CONTRADICTS its own prediction"
measured: "2026-08-27 — readings 1-4 taken on real hardware during UAT; the A1 half was RETRACTED 2026-08-28 because the instrument could not produce the unfavourable answer. 2026-08-28 — four HEAD-build readings (plan 08-16). 2026-08-31 — the A1 re-run on the PATCHED three-valued probe (CONFIRMED), the pre-fix Control (ZERO after Stop, contradicting 08-01 truth 3), a pre/post process-group control pair, one discarded run and two incidental observations (plan 08-17)"
vehicle: "probe build 68199fa + a1-probe-fix.patch, and HEAD build 39876b5, both installed in a real macOS Caido 0.58.2, darwin 25.6.0 — one platform, one provider CLI (claude-cli), one machine"
probe_commit: 68199fa
assumptions:
  A1: "CONFIRMED 2026-08-31 (causal half, patched probe); topology half measured as a control pair; the 2026-08-27 reading stays RETRACTED"
  A6: "per-provider split — TRUE for Claude Code, FALSIFIED for codex"
---

# Phase 8 Wave-0 spike — A1 re-measured and CONFIRMED, A6 a per-provider split, the Control taken and CONTRADICTING its own prediction

> **SUPERSEDED 2026-08-31 (preserved, not deleted — correct as a record of what this file claimed
> on its date, false as a live claim since the 2026-08-31 readings):**
>
> # Phase 8 Wave-0 spike — A1's reading RETRACTED, A6 falsified, the Control still unmeasured
>
> Superseded frontmatter, preserved verbatim:
>
> ```
> status: "one-reading — A6 measured (FALSIFIED); A1's reading RETRACTED 2026-08-28 and its verdict OPEN; the Control never taken"
> measured: "2026-08-27 — readings 1-4 taken on real hardware during UAT. The A6 half (readings 3-4) stands. The A1 half (readings 1-2) was RETRACTED 2026-08-28: the instrument could not produce the unfavourable answer, so the favourable one carries no information. Reading 5 (the Control) was NOT taken and is still an absence"
> vehicle: "probe build 68199fa installed in a real macOS Caido, darwin 25.6.0 — one build, one platform, one provider CLI"
> assumptions:
>   A1: RETRACTED — reading withdrawn, verdict OPEN
>   A6: FALSIFIED
> ```

**THIRD CORRECTION, 2026-08-31 — A1's causal half is MEASURED and CONFIRMED, and the Control
contradicts its own prediction.** The re-run plans 08-11 through 08-15 built toward was taken on the
maintainer's hardware with the patched three-valued probe, an instrument that could have printed
either unfavourable answer and printed neither. **The 2026-08-27 reading is NOT reinstated and stays
RETRACTED** — a later favourable measurement on a repaired instrument does not make an earlier
vacuous one informative, and every correction plans 08-11 through 08-14 made stands unchanged. In
the same session the pre-fix Control came back **ZERO**, which `08-01` truth 3 predicted would be
non-zero, and that result IMPLICATES the CLI-cleanup confounder rather than excluding it. Both
results are recorded at full strength in § *The patched-probe A1 re-run and the pre-fix Control*
below; neither is softened toward the other.

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

## HEAD-build readings, 2026-08-28 — TAKEN on the maintainer's hardware

**Staged empty by plan 08-16 task 1; FILLED 2026-08-28 by plan 08-16 task 3** from readings the
maintainer took on their own machine. Of the **24** staged value cells, **21 carry a verbatim
transcription** and **3 carry a dated marked abstention** naming what stopped them. 21 + 3 = 24;
there are no unexplained blanks. No cell was filled from a neighbouring cell, and no cell was
filled from an expectation.

The raw terminal output and the raw diagnostics values these cells were transcribed from are
preserved verbatim in § *The raw readings, exactly as pasted* below. Every filled cell is
therefore checkable against its source rather than against this document's prose — which is the
point, because this phase's defining defect is a plausible-looking reading nobody re-derived.

**Interpretation is in no cell.** It lives in § *What these readings close, and what they do not*
beneath the tables (threat T-08-71), so a later reader can always tell measured ground from
inference.

**These readings are taken against HEAD, not against the probe build.** They need no probe and no
patch: three of them read `pgrep`/`ps` from a terminal and one reads a diagnostics key that ships
in HEAD. That is what separates them from the A1 re-run in § *How to run this spike later*, which
requires `a1-probe-fix.patch` and is plan 08-17's. **That re-run's table is still empty and is
unchanged by anything in this section.**

### The build these readings are attributed to

A reading is a claim about a specific build, so the build is named before the tables rather than
after them.

**CORRECTED 2026-08-28 — the build changed between staging and measurement, and that change is
the reason any reading exists at all.** Task 1 staged these tables against `abfbc17`. **No reading
could have been taken on that build.** Caido's sandbox exposes an empty `process.env`, so
`readParentEnv()` returned `{}` and `buildSpawnEnv` handed the provider CLI only Drift's own
variables — no `USER`. Measured 2026-08-28: `env -i claude -p` reports
`Not logged in - Please run /login`, `env -i USER=<name> claude -p` succeeds, and `HOME`/`PATH`
are neither sufficient nor required — the credential lives in the macOS Keychain and the lookup is
keyed on the user name. No turn could start, so no cancel and no timeout could be measured.
Commit `39876b5` (`derivePosixIdentity`, an identity FLOOR under `buildSpawnEnv`) fixed that
outside this plan's scope, at the maintainer's direction; see `08-16-SUMMARY.md` § *Deviations*.
The readings below are attributed to the build that carries it.

| Field | Value |
|---|---|
| Built from HEAD commit | `39876b5` — **corrected**; supersedes the staged `abfbc17` attribution, preserved below |
| Build command | `pnpm build` → exit 0, 2026-08-28 |
| Package | `dist/plugin_package.zip`, **2,563,589 bytes** — rebuilt at `39876b5` by the executor on 2026-08-28. **This is NOT the byte size of the artifact the maintainer installed**; that size was not reported and is not inferred from this one. |
| Unzipped | `dist/plugin_package/`, 5 files, **2,562,629 bytes** — same caveat as the row above |
| Probe present? | **No.** T-08-03 removed the A1 probe at `d8ccab8`; this build carries no `spike*` fields and cannot answer A1's causal half. |
| Caido version | **0.58.2** — recorded 2026-08-28 from the maintainer's own About/Settings screen, not from `processVersion`. This closes the absence the A1 table above has carried since 2026-08-27. |
| Platform | **macOS, darwin 25.6.0** |
| Provider CLI under test | **Claude Code 2.1.250** |
| Sampler | a 1 Hz `pgrep -f mcp-server.mjs \| wc -l` loop that also dumped a full `ps -eo pid,ppid,pgid,args` on first sighting |

> **SUPERSEDED 2026-08-28 (preserved, not deleted — correct as a record of what task 1 staged on
> its date, false as the attribution of the readings above).** The staged build table read:
>
> | Field | Value |
> |---|---|
> | Built from HEAD commit | `abfbc17` (`abfbc17173be8fb4b353c89fd9f0e0700f063a30`) |
> | Build command | `pnpm build` → exit 0, 2026-08-28 |
> | Package | `dist/plugin_package.zip`, **2,561,448 bytes** |
> | Unzipped | `dist/plugin_package/`, 5 files, **2,560,488 bytes** |
> | Probe present? | **No.** T-08-03 removed the A1 probe at `d8ccab8`; this build carries no `spike*` fields and cannot answer A1. |
> | Caido version | **not recorded — reading not yet taken.** From Caido's own About/Settings screen, not from `processVersion` (which reports `unavailable` inside the sandbox). The A1 table above has carried this as an absence since 2026-08-27; it is a claim about *the LLRT fork this specific Caido ships*, so it is asked for once here for all four tables below. |

### Table 1 — the cancel path (UAT test 9, SC-3's POSIX half, UAT gap G-04)

| Field | Value |
|---|---|
| Date taken | **2026-08-28** |
| Provider used | **Claude Code 2.1.250** |
| `pgrep -f mcp-server.mjs \| wc -l` **during** the live turn | **1** — first non-zero sample `13:35:43  count=1`, and `count=1` at every sample through `13:36:12` |
| `pgrep -f mcp-server.mjs \| wc -l` **~5s after Stop** | **0** — Stop was clicked while the count was 1, i.e. at or before `13:36:12`; the first zero sample is `13:36:13  count=0` and every one of the nine consecutive samples `13:36:13` → `13:36:21` reads `count=0`. The `~5s` instant falls inside that window. The wall-clock instant of the Stop click was itself not timestamped in the paste. |
| Provider CLI process itself still alive after Stop? | **abstained 2026-08-28 — not measured.** The sampler ran `pgrep -f mcp-server.mjs` only, and the full `ps -eo pid,ppid,pgid,args` was dumped on FIRST SIGHTING alone; no post-Stop `ps` was re-run, and the separate parent resolution looked up `caido-cli`/`Caido`, not the provider row. **This is the cell that bears on the CLI-cleanup confounder, and that confounder therefore remains unexcluded — as it has been since 2026-08-24.** |
| `activeSessions` from the same diagnostics capture | **0** |
| **Verdict** | **MEASURED 2026-08-28 on the `39876b5` build — 1 during the turn, 0 after Stop.** A real before/after pair for the cancel path on this build. It is NOT a causal attribution: see § *What these readings close, and what they do not*. |

> **SUPERSEDED 2026-08-28 (preserved, not deleted).** The six value cells above read
> **not recorded — reading not yet taken** and the verdict read
> **OPEN — not measured on this build**.

### Table 2 — the absolute-timeout path (UAT test 10, SC-3's timeout clause)

**This table is filled from its OWN turn.** It is a different code path from Table 1 and, before
2026-08-28, it had never been exercised on any build by anybody. Nothing here is inferred from
Table 1 and nothing in Table 1 is inferred from here. That was checked cell by cell, not assumed.

| Field | Value |
|---|---|
| Date taken | **2026-08-28** |
| Configured `processTimeoutSeconds` for this run | **10** — set at Settings → Process → Timeout (s); the maintainer records 10 as the build's minimum |
| `pgrep -f mcp-server.mjs \| wc -l` **during** the live turn | **1** — first non-zero sample `13:37:45  count=1`, and `count=1` at every sample through `13:37:54` |
| `pgrep -f mcp-server.mjs \| wc -l` **~5s after the timeout fired** | **0** — first zero sample `13:37:55  count=0`, and nine consecutive zero samples through `13:38:03` |
| Provider CLI process itself still alive after the timeout fired? | **abstained 2026-08-28 — not measured**, for the same reason as Table 1's corresponding cell: no post-timeout `ps` was re-run. |
| Was Stop clicked? | **NO.** Verbatim: *"Stop was **NOT** clicked; the turn was left to time out."* This is therefore a Table 2 reading and not a second Table 1 reading. |
| **Verdict** | **MEASURED 2026-08-28 on the `39876b5` build — 1 during the turn, 0 after the timeout fired. The child's lifetime is 10 samples (`13:37:45` → `13:37:54` inclusive) against a configured 10 s timeout.** This is the FIRST time this code path has been exercised on any build. |

> **SUPERSEDED 2026-08-28 (preserved, not deleted).** The six value cells above read
> **not recorded — reading not yet taken** and the verdict read
> **OPEN — not measured on any build, ever**.

### Table 3 — is the orphan reap inert on this runtime? (ledger entries 13, 14, 15)

The cheapest high-value reading in the phase: one cancel and one glance at a key that ships in
HEAD. The value's grammar and its seven possible shapes are tabulated in § *How to run this spike
later*, step 5.

| Field | Value |
|---|---|
| Date taken | **2026-08-28** |
| `lastOrphanReap`, verbatim | **`kind=noop reason=scan-failed exit=1 killed=0 ageMs=24`** |
| `activeSessions` from the same capture | **0** |
| Elapsed between the cancel and the diagnostics capture | **abstained 2026-08-28 — not measured.** The maintainer captured the panel after the cancel run but did not time the interval, and `ageMs=24` is NOT that interval — it is `scanAgeMs`, the age of the enumerator's own pid sample (`classifyOrphanScanOutcome`, `kill-plan.ts`). Reading it as the elapsed time would be exactly the neighbour-filling this section forbids. |
| What that value establishes, in plain language | **(a) the mechanism RAN and matched nothing — NOT (d) inert.** *This is the one derived cell in these four tables; it is a classification of the transcribed value against the source ladder, not a transcription, and it is flagged as such.* Traced in `kill-plan.ts` `classifyOrphanScanOutcome` and `index.ts`'s scanner wiring: a `spawn` that throws and `scanner.on("error")` BOTH set `spawnThrew: true` with `exitCode: undefined` and return `enumerator-unavailable`; the timeout arm sets `exitCode: undefined` and returns `scan-timeout`. **Only `scanner.on("close", code)` can supply a numeric exit code.** `formatOrphanReapRecord` renders `exit=${String(record.exitCode)}`, so `exit=1` — rather than `exit=undefined` — is only reachable through that close handler. Therefore `pgrep` **spawned, executed and exited 1**, which is its documented "no process matched"; the classifier folds exit 1 into `scan-failed` deliberately (`kill-plan.ts:825-834`: exit 1 is "NOT distinguished from any other non-zero exit"), so `scan-failed` here is not enumerator misbehaviour. Matching nothing is the correct outcome: the primary termination path had already cleaned up. |
| **Verdict** | **MEASURED 2026-08-28 — the enumerator IS spawnable in Caido's sandbox, BY BARE NAME (`ORPHAN_SCAN_FILE = "pgrep"`, `kill-plan.ts:546`). The orphan reap is NOT inert on the shipping runtime.** |

> **SUPERSEDED 2026-08-28 (preserved, not deleted).** The five value cells above read
> **not recorded — reading not yet taken** and the verdict read **OPEN — not measured**.

### Table 4 — A6 against a Drift-spawned Claude Code turn

Extends the 2026-08-27 codex reading in the A6 table above, which was taken on an instance Drift
did **not** spawn. The session-unique temp-directory fragment is redacted in the argv exactly as
the maintainer pasted it (threat T-08-69). Columns are `PID PPID PGID ARGS`.

| Field | Value |
|---|---|
| Date taken | **2026-08-28** |
| Provider CLI row (pid / ppid / pgid / args) | pid **29578**, ppid 41187, pgid **29578** — `/Users/six2dez/.local/bin/claude -p --verbose --output-format stream-json --disable-slash-commands --append-system-prompt <elided> --disallowedTools <elided> --allowedTools <elided> --strict-mcp-config --mcp-config /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-chat-<id>.json` |
| `node …mcp-server.mjs` row (pid / ppid / pgid / args) | pid **29588**, ppid **29578**, pgid **29578** — `/opt/homebrew/bin/node /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-server.mjs` |
| MCP server row's **pgid** | **29578** |
| Provider row's **pid** (the row carrying `--mcp-config`) | **29578** |
| Matched? | **YES.** 29578 == 29578 — the MCP child sits in the provider CLI's own process group. Independently reproduced in the timeout run: provider pid **30372** / pgid **30372**, `mcp-server.mjs` pid **30395** / ppid **30372** / pgid **30372**. |
| **Verdict for Claude Code** | **A6 HOLDS for Claude Code — measured 2026-08-28, twice.** The codex verdict above is **FALSIFIED** and **stands, unchanged, in both direction and wording**. A6 is therefore a **PER-PROVIDER SPLIT**, not a reversal: TRUE for Claude Code, FALSE for codex. This reading does not reopen, weaken or re-word the codex reading. |

> **SUPERSEDED 2026-08-28 (preserved, not deleted).** The six value cells above read
> **not recorded — reading not yet taken** and the verdict read
> **OPEN — not measured. The codex verdict above is FALSIFIED and stands; a Claude Code result
> either extends it or splits A6 per provider. It does not reopen the codex reading in either
> direction.**

### Table 5 — the process-group topology of Drift's own spawn (NEW, not staged by task 1)

**This table was not staged.** The maintainer's readings answer a question the four staged tables
do not ask, and discarding a measurement because no cell was waiting for it would be a worse
failure than adding the cell. It is presented as a new reading, dated, with its scope stated.

**Read the verdict row before the values.** This bears on **A1's topology half only**. A1 asks
whether a `detached: true` spawn produces a process group *whose kill reaches a grandchild*. The
topology half is what a `ps` listing can answer; the causal half is not, and stays OPEN.

| Field | Value |
|---|---|
| Date taken | **2026-08-28** |
| Instrument | `ps -eo pid,ppid,pgid,args`, run from a terminal **outside** the Caido sandbox by the sampler, plus a separate parent lookup by the orchestrator |
| Drift-spawned provider (run 1) | pid **29578**, ppid **41187**, pgid **29578** |
| Drift-spawned provider (run 2) | pid **30372**, ppid **41187**, pgid **30372** |
| The parent | pid **41187**, ppid 41171, pgid **41171** — `/Applications/Caido.app/Contents/Resources/bin/caido-cli` |
| The parent's parent | pid **41171**, ppid 1, pgid **41171** — `/Applications/Caido.app/Contents/MacOS/Caido` |
| `pgrep -f mcp-server.mjs \| wc -l` at rest, after both runs | **0** |
| **Verdict — topology half only** | **MEASURED 2026-08-28, and the observation is favourable: `pgid == pid` on both spawned providers, which is what `setpgid(0,0)` produces.** Had the shipped LLRT ignored `detached: true`, the child would have inherited the parent's group 41171; it did not, in either run. **The causal half of A1 — that a GROUP kill is what killed the grandchild — is NOT measured here and stays OPEN.** |

**Why this reading is not the retracted one, and why it licenses nothing about the retraction.**
The 2026-08-27 A1 reading was withdrawn because the instrument decided the verdict with
`signalRef.process?.kill?.(pid, 0) ?? false` on a runtime where the same run measured
`process.kill` ABSENT, so the favourable string was emitted unconditionally — the red input did
not exist. This reading has no `process.kill` on its path at all: it is a direct `ps` observation
taken from outside the sandbox, and an LLRT that ignored `detached` would have printed pgid 41171
and been visible immediately. **It is nevertheless a DIFFERENT and NARROWER question than the one
that was retracted**, and it does not license reverting any of plans 08-11..08-14's corrections,
does not change A1's verdict, and does not fill plan 08-17's re-run table. The retraction
machinery — `verdict-gate.sh`, the marked corrections, ledger entries 11 and 20 — stays exactly
as it is.

### The raw readings, exactly as pasted

Preserved so every cell above is checkable against its source. Transcribed with no rounding, no
tidying, no unit conversion and no reconstruction — including the sampler's own dropped sample at
`13:35:37`, which is left in because removing it would be tidying.

```
=== RUN 1: CANCEL PATH (readings 1 and 4) ===
=== drift-watch [cancel] started 13:35:28 — Ctrl-C to stop ===
13:35:28  count=0
13:35:29  count=0
13:35:30  count=0
13:35:31  count=0
13:35:32  count=0
13:35:33  count=0
13:35:34  count=0
13:35:35  count=0
13:35:36  count=0
13:35:38  count=0
13:35:39  count=0
13:35:40  count=0
13:35:41  count=0
13:35:42  count=0
13:35:43  count=1
--- FIRST SIGHTING: full ps detail (this is reading 4) ---
29578 41187 29578 /Users/six2dez/.local/bin/claude -p --verbose --output-format stream-json --disable-slash-commands --append-system-prompt <elided> --disallowedTools <elided> --allowedTools <elided> --strict-mcp-config --mcp-config /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-chat-<id>.json
29588 29578 29578 /opt/homebrew/bin/node /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-server.mjs
--- end first sighting ---
13:35:44  count=1
   [count=1 continuously, one sample per second]
13:36:12  count=1
13:36:13  count=0
   [count=0 continuously]
13:36:21  count=0
^C
=== drift-watch [cancel] stopped 13:36:21 ===

POST-CANCEL DIAGNOSTICS (Settings → Diagnostics → Show Diagnostics), verbatim:
lastOrphanReap:   kind=noop reason=scan-failed exit=1 killed=0 ageMs=24
activeSessions:   0

=== RUN 2: ABSOLUTE-TIMEOUT PATH (reading 3) ===
Configured `Settings → Process → Timeout (s)` = 10 (the build's minimum). Stop was NOT clicked;
the turn was left to time out.
=== drift-watch [timeout] started 13:37:27 — Ctrl-C to stop ===
13:37:27  count=0
   [count=0 continuously]
13:37:44  count=0
13:37:45  count=1
--- FIRST SIGHTING: full ps detail ---
30372 41187 30372 /Users/six2dez/.local/bin/claude -p --verbose --output-format stream-json --disable-slash-commands --append-system-prompt <elided> --strict-mcp-config --mcp-config /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-chat-<id>.json
30395 30372 30372 /opt/homebrew/bin/node /var/folders/05/<elided>/T/drift-mcp-<token>/mcp-server.mjs
--- end first sighting ---
13:37:46  count=1
   [count=1 continuously]
13:37:54  count=1
13:37:55  count=0
   [count=0 continuously]
13:38:03  count=0
^C
=== drift-watch [timeout] stopped 13:38:03 ===

Child lifetime 13:37:45 → 13:37:54 inclusive = 10 samples, matching the configured 10 s timeout.
First zero sample 13:37:55. Nine consecutive zero samples observed after.

=== THE PARENT, resolved separately (this is the A1 discriminator) ===
Measured immediately after both runs, by the orchestrator:
  PID  PPID  PGID COMM
41187 41171 41171 /Applications/Caido.app/Contents/Resources/bin/caido-cli
41171     1 41171 /Applications/Caido.app/Contents/MacOS/Caido

And `pgrep -f mcp-server.mjs | wc -l` => 0 at rest afterwards.
```

**Provenance, stated rather than assumed.** Taken 2026-08-28 on the maintainer's machine: Caido
**0.58.2**, macOS (darwin 25.6.0), Claude Code **2.1.250**, provider Claude Code, build HEAD
`39876b5`.

### The abstention rule that governs filling these tables

Written here rather than only in plan 08-16, so it travels with the tables it governs.

1. **A cell is filled only from a reading that was taken.** Every filled cell is a verbatim
   transcription of what a terminal printed or what a diagnostics field said — no rounding, no
   tidying, no unit conversion, no "approximately", no reconstruction from prose.
2. **A cell that could not be filled gets a dated marked abstention** naming what was attempted and
   what stopped it, e.g. *"abstained 2026-08-28 — the turn timeout is not exposed in this build's
   settings, so no timeout could be made to elapse."* An abstention is a complete and correct
   outcome, not a failure.
3. **Never fill a cell from a neighbouring cell.** Tables 1 and 2 describe two different code paths;
   SC-3 and both requirements name both; only the cancel path has ever been attested and that
   attestation is explicitly recorded as not carrying to the timeout.
4. **Never fill a cell from an expectation.** Not from this document, not from a plan, not from what
   the mechanism is supposed to do.
5. **A cannot-tell reading is recorded as cannot-tell.** An ambiguous result is not averaged, retried
   into agreement, or resolved toward either verdict — the ambiguity is the reading.
6. **No unexplained blanks.** Every cell in these four tables ends as either a verbatim value or a
   dated abstention with a named blocker, and the two counts sum to the cell count.
7. **Interpretation lives beneath the tables, in its own labelled paragraph**, never inside a cell
   (threat T-08-71) — so a later reader can always tell measured ground from inference.

### What these readings close, and what they do not

**This is interpretation, and it is deliberately not in any cell above** (threat T-08-71). Every
claim here is traceable to a value in § *The raw readings, exactly as pasted*; where a claim needs
a reading nobody took, it says so instead of reaching for the nearest cell.

**The cancel path — a real before/after pair, and NOT a causal attribution.** Table 1 is the first
cancel reading this project has that carries both numbers. It replaces the 2026-08-24 attestation,
which was an `approved` with no values behind it. What it establishes is that on build `39876b5`,
on macOS, with Claude Code, the token-bearing `mcp-server.mjs` child is present during the turn
and absent after Stop. What it does **not** establish is *why*. Drift's spawned group kill, the
single-pid SIGTERM→SIGKILL ladder, the argv-marker orphan reap, and Claude Code's own cleanup of
its MCP child are all consistent with 1 → 0, and this reading cannot separate them. The
provider-liveness cell — the one cell that would have narrowed this — is abstained.

**The CLI-cleanup confounder is IMPLICATED — CORRECTED 2026-08-31, and the correction runs against
this section's own expectation.** The pre-fix Control this paragraph was waiting on was taken on
2026-08-31 and came back **ZERO**, not non-zero. On the `68199fa` build — no `detached` at the
provider spawn, no orphan reap, only a single-pid SIGTERM — the token-bearing child died anyway.
**So the confounder is not merely unexcluded; it now has a positive observation behind it**, and
Table 1's post-fix zero proves **less** than this section originally claimed for it, because the
pre-fix build yields the same zero. Table 1's reading is unchanged and still correct as a
measurement — 1 during the turn, 0 after Stop, on build `39876b5`. What is corrected is the weight
it carries: it does not distinguish Drift's machinery from Claude Code's own cleanup, and the
Control did not rescue it. Full reasoning in § *The Control CONTRADICTS `08-01` truth 3* below.
`08-UAT.md` test 3 moves out of `[pending]` and is recorded as an **issue** — the reading exists and
the test's own expectation was falsified.

> **SUPERSEDED 2026-08-31 (preserved, not deleted — correct as written on 2026-08-28, when the
> Control did not exist).** This paragraph read:
>
> > **The CLI-cleanup confounder is STILL OPEN.** It has been unexcluded since 2026-08-24 and it is
> > unexcluded now. A favourable before/after pair taken only against the post-fix build is not a
> > control; the thing that would make it one is the **pre-fix Control**, taken against the build at
> > `68199fa`, which is plan **08-17's** and is recorded there as an `insufficient_spec` item. Until
> > that reading exists, Table 1 shows that the child is gone, not that Drift is what removed it.
> > The Control table above therefore stays empty and stays honest, and `08-UAT.md` test 3 stays
> > `[pending]`.

**The timeout path stands entirely on its own.** Table 2 was filled from its own turn, on which
Stop was explicitly not clicked. Its verdict borrows nothing from Table 1 and Table 1's verdict
borrows nothing from it; that was checked cell by cell rather than assumed, which is why the
"Was Stop clicked?" cell exists at all. This is the **first time this code path has ever been
exercised on any build**. `08-VERIFICATION.md` records that "the timeout path — named explicitly
by SC-3 and by both requirements — has never been exercised at all"; as of 2026-08-28 it has. The
child's lifetime is exactly 10 one-second samples against a configured 10 s timeout, which is what
distinguishes "the timeout ended the turn" from "the turn happened to finish": a turn that
completed on its own would not land on the configured value. The same confounder caveat applies
here as to Table 1 — the provider-liveness cell is abstained on this run too.

**The enumerator reading is the one that decides what the rest is worth, and it came back
favourable.** `kind=noop reason=scan-failed exit=1 killed=0 ageMs=24` means the reap **ran**.
`exit=1` is unreachable on every path except `scanner.on("close", code)`: both `spawnThrew: true`
paths (a synchronous `spawn` throw and `scanner.on("error")`) pass `exitCode: undefined` and are
classified `enumerator-unavailable` before the exit-code arm is reached, and the timeout arm also
passes `undefined`. `formatOrphanReapRecord` renders the code with `String(record.exitCode)`, so
an unspawnable enumerator renders `exit=undefined`, never `exit=1`. **`pgrep` spawned, executed
and exited 1** — its documented "no process matched" — inside Caido's plugin sandbox, **by bare
name** (`ORPHAN_SCAN_FILE = "pgrep"`, `kill-plan.ts:546`). Bare-name resolution is precisely what
`08-VERIFICATION.md` named as uncorroborated, and it is now corroborated. The orphan-reap
mechanism plans 08-06 and 08-07 shipped is **not inert on the runtime users run**, which was
recorded as the phase's largest open risk. It matched nothing because there was nothing to match:
the primary termination path had already cleaned up, and `activeSessions: 0` from the same capture
agrees.

**Note the reason token is `scan-failed` and that is not a defect.** `classifyOrphanScanOutcome`
folds exit 1 into `scan-failed` on purpose — the comment at `kill-plan.ts:825` records that exit 1
is "NOT distinguished from any other non-zero exit", because both outcomes reap nothing and a
separate arm would be a distinction with no consequence. Step 5's grammar table above describes
this row as "the enumerator misbehaved or the sample went stale"; on this reading it is neither.
That is a gap in the grammar table's prose, not in the value, and it is recorded here rather than
silently smoothed.

**A6 is a per-provider SPLIT, not a reversal.** Table 4 measures the MCP child's pgid equal to the
provider CLI's pid for Claude Code, twice, on Drift-spawned turns. The 2026-08-27 codex reading
measured the opposite — child pid 44284 in its own group 44284 while the CLI sat in a third group
43752 — on an instance Drift did not spawn. **Both readings stand, and neither weakens the
other.** The codex row and its **FALSIFIED** verdict are unchanged in wording and in direction.
A6 is TRUE for Claude Code and FALSE for codex; gemini and copilot remain unmeasured in either
direction. The operational consequence is unchanged too: because A6 is false for at least one
provider, the phase cannot rely on process groups alone, which is exactly why the argv-marker
reap — now demonstrated to run — exists.

**A1: the topology half is measured here, and the causal half was measured three days later.**
Table 5 shows `pgid == pid` on both Drift-spawned providers while `caido-cli` sits in group 41171 —
the signature of `setpgid(0,0)`, and impossible if the shipped LLRT had ignored `detached: true`.
This is a direct `ps` observation from outside the sandbox, so no `process.kill` is anywhere on its
path and it cannot emit a favourable value unconditionally the way the withdrawn 2026-08-27 probe
reading could. It is nevertheless only half of what A1 asks. A1 asks whether a `detached: true`
spawn produces a process group **whose kill reaches a grandchild**; a listing can show the group
exists, and cannot show that a group kill is what killed anything.

**UPDATED 2026-08-31, and the update goes only in the direction the new reading licenses.** The
causal half was measured on 2026-08-31 with the patched three-valued probe and came back favourable;
the topology half was independently re-measured as a genuine pre/post **control pair** the same day
(§ *Table 3*), which is stronger than this single favourable listing. **This paragraph's own reading
is unchanged in value, in wording and in direction** — Table 5 still shows what it showed, still
answers only the topology half, and is still not the instrument for the causal one. What changed is
elsewhere in the document, not here. The 2026-08-27 probe reading **stays withdrawn**, and every
correction plans 08-11 through 08-14 made **stays exactly as it is**: a later favourable measurement
on a repaired instrument does not retroactively make an earlier vacuous one informative.

> **SUPERSEDED 2026-08-31 (preserved, not deleted — correct as written on 2026-08-28, when the
> re-run table was empty).** The closing sentences of this paragraph read:
>
> > **A1's verdict stays OPEN, its 2026-08-27 reading stays withdrawn, and every correction plans
> > 08-11 through 08-14 made stays exactly as it is.** The re-run that addresses the causal half is
> > plan 08-17's, with the patched three-valued probe, and its results table above is still empty.

**Scope, stated rather than left implied.** One provider (Claude Code 2.1.250). One platform
(macOS, darwin 25.6.0). One Caido version (0.58.2). One build (`39876b5`). One machine. Windows is
entirely unmeasured and stays owned by Phase 9 SC-4 — and note that on win32 the scan plan refuses
on a different arm before any spawn, so nothing here transfers. Linux is unmeasured. A6 for gemini
and copilot is unmeasured. Three cells are abstentions, and each names its blocker rather than
resolving toward a convenient value.



---

## The patched-probe A1 re-run and the pre-fix Control — TAKEN 2026-08-31 on the maintainer's hardware

**Staged empty by plan 08-17 task 1; FILLED 2026-08-31 by plan 08-17 task 3** from readings the
maintainer took on their own machine, on the probe build task 1 produced. Of the **17** staged value
cells, **15 carry a verbatim transcription** and **2 carry a dated marked abstention** naming what
stopped them. 15 + 2 = 17; there are no unexplained blanks. No cell was filled from a neighbouring
cell, and no cell was filled from an expectation.

**Read this before the tables, because it is the largest thing in the section and the tables alone
do not say it.** A1's causal half came back **CONFIRMED** — and the pre-fix **Control came back
ZERO**, which is the opposite of what `08-01` truth 3 predicted and which *implicates* the
CLI-cleanup confounder rather than excluding it. The two results pull in opposite directions and
both are recorded at full strength. The interpretation is in § *What the 2026-08-31 readings
establish, and what they take away* beneath the tables (threat T-08-71); no cell below carries any
of it.

The raw diagnostics values and terminal output these cells were transcribed from are preserved
verbatim in § *The 2026-08-31 raw readings, exactly as pasted*. Every filled cell is therefore
checkable against its source rather than against this document's prose.

> **SUPERSEDED 2026-08-31 (preserved, not deleted — correct as a record of what task 1 staged on
> its date, false as a description of the tables now).** The staged text read:
>
> > ## The patched-probe A1 re-run and the pre-fix Control — staged 2026-08-28 by plan 08-17, EMPTY
> >
> > **Both tables below are EMPTY and empty is the honest state.** They were staged by plan 08-17's
> > task 1 against a probe build that exists, and they are filled only by readings the maintainer
> > takes on their own hardware. A cell nobody measured is never filled from an expectation, from a
> > neighbouring cell, or from this document's own prose. The abstention rule that governs the
> > 2026-08-28 HEAD-build tables above governs these two as well, unchanged and without exception.

### The probe build these tables are waiting on

Produced 2026-08-28 by the committed control rather than reconstructed by hand, because hand
reconstruction is the activity that produced five wrong censuses in this phase.

| Field | Value |
|---|---|
| Command | `bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh /tmp/drift-a1-build` |
| Exit code | **0** — the patch applies at `68199fa`, the patched backend type-checks, `caido-dev build` produces a package |
| Source commit | **`68199fa`** ("feat(08-01): add the temporary A1 probe to the diagnostics block") |
| Patch | `.planning/phases/08-process-lifecycle/a1-probe-fix.patch`, plus HEAD's `kill-plan.ts` and `platform.ts` carried in by the control |
| Package | `/tmp/drift-a1-build/plugin_package.zip`, **2,549,143 bytes**, sha256 `a135fdca6da842beaeea4ab98dd2264be6d7f6035f33dc3601e50e881c88a9d5` |
| Unzipped | `/tmp/drift-a1-build/plugin_package/`, 5 files, **2,548,183 bytes** |
| Where it lives | **outside the repository.** `git status --porcelain` never listed it, `git status --porcelain packages/` is empty, and `git worktree list` shows one worktree |
| Installed at, 2026-08-31 | Caido plugin id **`d8aee773-b939-4164-a576-9c276ee30df8`**, in Caido **0.58.2** on **darwin 25.6.0**, provider **claude-cli** |
| How the 2026-08-31 dump is distinguished from a HEAD dump | **by two structural features of the diagnostics payload, not by trust.** The probe build carries the `spike*` keys (HEAD does not — T-08-03 removed the probe at `d8ccab8`) and LACKS `lastOrphanReap` (there is no orphan reap at `68199fa`; it arrived with plans 08-06/08-07). A HEAD dump has exactly the opposite pair. Reading E below is a HEAD dump by that test and is filed as one |

**What this build does that HEAD does not, and why it must be uninstalled afterwards.** The probe
spawns **two fixture `node` processes on every `getDiagnostics` call** — a parent and a detached
grandchild — kills the parent's process group, then asks a spawned enumerator whether the
grandchild is still in the process table. Opening the Settings panel repeatedly is therefore an
unbounded process spawn on a machine holding a live Caido session token, which is threat
**T-08-76**, and it is why the probe was removed from HEAD by T-08-03 and must never be committed
back. The patched build cleans its fixtures up through a **spawned** positive single-pid killer on
every exit path including the inconclusive and error arms; the original signalled them through the
same absent `process.kill` the verdict used, so on this sandbox its cleanup was a silent no-op and
the 2026-08-27 run leaked both of its fixtures. **That fix is a claim, not yet a measurement** —
which is exactly why table 1 carries a fixture-survivor cell.

**The control went RED before it went green, and that is recorded rather than smoothed over.** The
first run on 2026-08-28 failed step 3 with four `TS2345` errors: commit `39876b5` — the
out-of-plan POSIX-identity fix that landed between plans 08-15 and 08-17 — made `identityFallback`
a **required** member of `buildSpawnEnv`, and `verify-a1-patch.sh` carries HEAD's `platform.ts`
into the scratch worktree, so four historical call sites stopped compiling. Plan 08-15's
`VERIFIED` line was true when written and false the same day. The control caught it exactly where
its own header predicted it would — *"rather than on the maintainer's machine an hour into a
hardware session"* — and section 5 of the patch header now names the six repair edits.

**One of those six edits changes what the Control build IS, so it is stated here and not only in
the patch.** Caido's sandbox exposes an **empty** `process.env`. At `68199fa` that leaves the
spawned provider CLI with no `USER`, and `env -i claude -p` answers *"Not logged in"* because the
credential is in the macOS Keychain keyed on the user name. **Without a derived identity floor no
turn can start on a real install, so the Control — a `pgrep` count taken DURING a live turn —
could not be taken at all.** Plan 08-16 hit that exact wall on `abfbc17`. The probe build therefore
carries HEAD's `getPosixIdentityFallback` at the three `index.ts` call sites. It adds three
environment keys to a spawned child and touches **no** termination path: no group kill, no signal
ladder, and no orphan reap — there is no reap at `68199fa`, which is precisely what makes the build
a Control. It also makes the before/after pair differ in one variable rather than two, because
plan 08-16's post-fix reading was itself taken on a build carrying this floor. The
`mcp-server-spec.ts` site takes the behaviour-preserving answer instead and reproduces `68199fa`
byte for byte. **If the maintainer would rather the Control run on a build carrying nothing from
after `68199fa`, the patch header's section 5 names the one-line change and the cost: the A1
reading survives it, the Control does not.**

### Is the A1 re-run still required after the 2026-08-28 topology reading? — REDUCED, NOT SUPERSEDED

Plan 08-16's **Table 5** measured `pgid == pid` on both Drift-spawned providers by direct `ps`
observation from outside the sandbox, and that reading is sound: it has no `process.kill` anywhere
on its path, so unlike the withdrawn 2026-08-27 probe reading it is structurally capable of
printing the unfavourable value. This section states in the open what that does and does not do to
the re-run below, rather than letting the re-run become a ceremony nobody re-justified.

| A1's half | Status after Table 5 | Does the patched-probe re-run still bear on it? |
|---|---|---|
| **Topology** — does `detached: true` produce a process group of its own? | **Measured 2026-08-28, favourable.** `pgid == pid` is the signature of `setpgid(0,0)`; an LLRT that ignored `detached` would have shown the parent's group 41171, twice, and did not | **No.** A `ps` listing from outside the sandbox is a better instrument for this than any in-sandbox probe, and it has already answered |
| **Causation** — does a kill aimed at that group actually reach a grandchild inside it? | **OPEN. Unmeasured by anything.** A listing can show a group exists; it cannot show that a signal sent to the group was delivered | **Yes, and it is the only instrument that does.** The probe spawns the group kill and then asks a spawned enumerator whether the grandchild survived it |

**The decision: the re-run is REDUCED IN SCOPE and still REQUIRED. It is not superseded and it is
not dropped.** Two of the cells the original re-run existed to fill are already answered elsewhere
and are marked below as such rather than re-asked — the Caido version string (**0.58.2**, recorded
2026-08-28) and the topology question. What survives is the causal half, and it is the half the
nine POSIX termination sites actually rest on: a group reference that names a real group is worth
nothing if the signal to that group does not arrive. **Recording the re-run as done because Table 5
exists would be the same substitution that produced the retracted reading** — a narrower question
answered, filed as the wider one.

### What a definite verdict here does to `verdict-gate.sh`, said in advance

**If the re-run returns the CONFIRMED value, `verdict-gate.sh` ARM A will go RED naming this file,
and that red is CORRECT.** ARM A/A1-STALE fails on any live line, outside a block quote, in any
non-excluded file, that states A1's withdrawn verdict — and this file would then be the only
carrier in the tree stating a live favourable A1 claim while the ROADMAP, `REQUIREMENTS.md`,
`STATE.md`, ledger entry 11 and the source comments all still state the retraction. **The gate
would be reporting a true inconsistency, not malfunctioning.**

It is written here **in advance**, before any reading exists, so it is not met as a surprise
mid-session and resolved the cheap way. The cheap way is to weaken the gate — add an exclusion,
narrow the pattern, reword this file — and that would rebuild the original defect from the other
direction: a gate that softens when the fact changes is not a gate. **The gate is not to be
touched.** The correct response is to propagate the new verdict to every carrier, and ARM A's own
output is the worklist that names them — which is the discovery mechanism the gate was built to be.

If the re-run returns **inconclusive**, or is not taken, the gate stays at exit 0 and nothing about
it changes.

### The three-outcome rule, in this section's own words

The patched probe's `spikeDetachedGroupKill` reports **exactly three** things, and all three are
results:

- `grandchild-died (detached honoured)` — **A1 CONFIRMED.** The group signal reached the detached
  grandchild.
- `grandchild-survived (detached NOT honoured)` — **A1 FALSIFIED.** It did not. The phase's POSIX
  mechanism does not hold on the shipping runtime.
- `inconclusive: <reason> — the probe could not tell whether the target is still in the process
  table` — **A1 stays OPEN.**

**The third is a RESULT, not an error and not a retry.** Record it verbatim, reason token and all.
Do not run the probe again to get a different answer, do not average it against anything, and do
not read it as either of the other two. `<reason>` is one of `enumerator-unavailable`,
`probe-timeout`, `no-exit-code`, `unrecognised-exit-code`, `unusable-pid` or
`contradictory-output`, and it names *which* question the instrument could not answer.
`classifyLivenessObservation` **defaults** to inconclusive and has exactly three arms that return
anything else, so the value is reached rather than defaulted-past. Coalescing a non-answer into a
verdict is the precise defect that produced the withdrawn 2026-08-27 reading; `formatSpikeVerdict`
shares no verdict word between the third string and the first two — no "died", no "survived", no
"honoured" — so a reader skimming a diagnostics report cannot mistake one for the other. A pasted
value that is **none** of the three is an anomaly to report, never a value to normalise into one.

### Table 1 — the A1 re-run with the patched probe

| Field | Value |
|---|---|
| Date taken | **2026-08-31** |
| Platform | **darwin 25.6.0** (macOS), provider **claude-cli**, Claude Code CLI at `/Users/six2dez/.local/bin/claude` |
| Caido version | **0.58.2** — re-confirmed 2026-08-31 by the maintainer for this session; unchanged from the 2026-08-28 About-screen reading recorded in § *The build these readings are attributed to* |
| Probe build | `68199fa` + `a1-probe-fix.patch` (incl. section 5), package sha256 `a135fdca6da842beaeea4ab98dd2264be6d7f6035f33dc3601e50e881c88a9d5`, installed at plugin id `d8aee773-b939-4164-a576-9c276ee30df8` |
| `spikeProcessKillType` | **`"undefined"`** — verbatim. **This is an honest REPORT of a runtime fact, and it no longer decides anything.** Why that is true and not a restatement of the retracted reading is argued in § *Why Reading A is a measurement and not the retraction repeated* below; do not read this cell without reading that paragraph |
| `spikeDetachedGroupKill` | **`"grandchild-died (detached honoured)"`** — verbatim, and it is outcome 1 of the three permitted values, exactly as spelled by `formatSpikeVerdict`'s `dead` arm. **A1 CONFIRMED on the causal half** |
| Reason token, if the verdict is inconclusive | **n/a — the verdict is not inconclusive.** Recorded as not-applicable rather than as an abstention, because the cell's precondition did not obtain; this is not a reading anybody failed to take |
| `spikeNote` | **`"Phase 8 A1 probe — temporary, removed by T-08-03"`** — verbatim |
| Surviving fixture processes after the diagnostics call — `pgrep -f 'node -e' \| wc -l` | **`0`** — verbatim, run immediately after the diagnostics call. **The original probe's fixture LEAK is CONFIRMED FIXED by measurement, not assumed fixed**, and this cell is also what proves the PATCHED build is the one that ran: the original's cleanup signalled through the same absent `process.kill` the verdict used, so on this sandbox it was a silent no-op and would have left 2 |
| Anything in `ps` that looks like a leftover fixture | **abstained 2026-08-31 — not separately measured.** The maintainer reported the `pgrep -f 'node -e' \| wc -l` count and did not additionally paste a raw `ps` listing scanned by eye for fixture-shaped rows. The count is `0`, which is the stronger of the two for the leak question; the eyeball scan would only have added a cross-check against a mis-specified pattern, and that cross-check was not performed |
| **Verdict — causal half only** | **CLOSED FAVOURABLY — MEASURED 2026-08-31 on the probe build, with an instrument that could have printed either of the other two values.** The group kill reached the detached grandchild. The topology half was measured 2026-08-28 (Table 5, and again by the control pair in Table 3 below) and is not re-asked here. **This is the file's only live favourable A1 claim and it turns `verdict-gate.sh` ARM A red — see § *The gate went red, exactly as predicted* below** |

### Table 2 — the pre-fix Control, on that same build

`08-VERIFICATION.md`'s `insufficient_spec` item — 08-01 truth 3 — abstained on 2026-08-24, still
unmet, and now the phase's most load-bearing open measurement. Plan 08-16's readings show **that**
the token-bearing child dies; they do not show **why**. Drift's spawned group kill, the single-pid
SIGTERM→SIGKILL ladder, the argv-marker reap and Claude Code's own cleanup of its MCP child are all
consistent with `1 → 0`, and no reading yet taken separates them. **The CLI-cleanup confounder is
unexcluded, and this table is the only thing that excludes it.**

| Field | Value |
|---|---|
| Date taken | **2026-08-31** |
| Build identity | `68199fa` + `a1-probe-fix.patch`. **This build predates the argv-marker orphan reap entirely** (plans 08-06/08-07), which is what makes it the Control, and it is the SAME install as table 1 — one install, two readings. Structurally corroborated: the diagnostics dump carries `spike*` and carries **no** `lastOrphanReap` |
| What it pairs with | plan 08-16's post-fix counts on build `39876b5`: **1** during the live turn, **0** ~5 s after Stop |
| Chat and turn this reading belongs to | `chat-1788166552577-7obc`, prompt *"resume en detalle qué hace este proyecto"*. Recorded because the session record below is what distinguishes this run from the discarded one in § *Reading D* |
| Was Stop actually clicked? | **YES — corroborated by the session record, not by assertion.** Verbatim: `"state": "stopped"`, `"reason": "Provider exited with code 143."`, `"exitCode": 143`. 143 = 128 + 15 = **SIGTERM**. A turn that ended on its own does not carry a signal-derived exit code |
| `pgrep -f mcp-server.mjs \| wc -l` during a live turn | **`1`** — first non-zero sample `10:55:54  count=1`, and `count=1` continuously through `10:56:04` |
| `pgrep -f mcp-server.mjs \| wc -l` ~5 s after Stop | **`0`** — first zero sample `10:56:05`, and **six consecutive zero samples** `10:56:05` → `10:56:11`. `pgrep -f mcp-server.mjs` reads `0` at rest afterwards |
| Was a survivor cleaned up by pid, and was there one? | **There was NO survivor, so nothing was cleaned up by pid.** Recorded as a measured absence rather than as an unperformed step |
| **Verdict** | **MEASURED 2026-08-31 on the pre-fix build — 1 during the turn, 0 after Stop. THE LIF-02 DEFECT DID NOT REPRODUCE, WHICH CONTRADICTS `08-01` TRUTH 3'S OWN PREDICTION.** The prediction was a NON-ZERO after-Stop count on a build with no `detached` at the provider spawn and only a single-pid SIGTERM. It is zero. See § *What the 2026-08-31 readings establish, and what they take away*; this result is not softened toward the expected one |

**Both directions are results, and neither is the expected one.** A **non-zero** after-Stop count is
the LIF-02 defect reproduced on real hardware, and beside plan 08-16's post-fix zero it is the
before/after pair this phase has wanted since 2026-08-24 — the thing that finally excludes the
confounder. A **zero** after-Stop count is equally a reading: it would mean the defect does not
reproduce on this machine, and that the post-fix zero proves considerably less than it appears to.
Neither outcome is to be softened toward the other.

**Written 2026-08-28, before any reading existed. The second branch is the one that happened, and
this paragraph is left standing exactly as written** — it is the record that the unfavourable
direction was specified in advance rather than reasoned toward afterwards.

### Table 3 — the pre-fix/post-fix process-group CONTROL PAIR (NEW, not staged by task 1)

**This table was not staged, and it is strictly stronger than plan 08-16's Table 5.** Table 5 was a
single favourable post-fix listing; this is a genuine before/after pair — same machine, same Caido
instance, minutes apart, **one variable: the build**. Discarding it because no cell was waiting for
it would be a worse failure than adding the cell, which is the same rule Table 5 was added under.

Caido's own process group this session, resolved directly by the orchestrator with `ps`: `Caido`
pid **91048** pgid **91048**; `caido-cli` pid **91056** ppid 91048 pgid **91048**. Both spawns below
have `caido-cli` (91056) as their parent, so an LLRT that ignored `detached: true` would put the
provider in group **91048**.

Columns are `PID PPID PGID`. The session-unique temp-directory fragment is redacted in the argv
exactly as the maintainer pasted it (threat T-08-69).

| Build | Row | PID | PPID | PGID | pgid == pid? |
|---|---|---|---|---|---|
| **POST-FIX** (HEAD build, 10:48:05) | `claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json` | **3386** | 91056 | **3386** | **YES** — its own group |
| **POST-FIX** (HEAD build, 10:48:05) | `/opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs` | **3396** | 3386 | **3386** | in the provider's group |
| **PRE-FIX** (probe build `68199fa`, 10:51:37) | `claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json` | **5190** | 91056 | **91048** | **NO** — inherits Caido's group |
| **PRE-FIX** (probe build `68199fa`, 10:51:37) | `/opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs` | **5200** | 5190 | **91048** | inherits Caido's group |
| **PRE-FIX, second run** (probe build, 10:55:54) | `claude … --mcp-config …/drift-mcp-<token>/mcp-chat-<id>.json` | **7005** | 91056 | **91048** | **NO** — reproduced |
| **PRE-FIX, second run** (probe build, 10:55:54) | `/opt/homebrew/bin/node …/drift-mcp-<token>/mcp-server.mjs` | **7015** | 7005 | **91048** | inherits Caido's group |

| Field | Value |
|---|---|
| **Verdict — topology half, now as a PAIR** | **MEASURED 2026-08-31. Phase 8's `detached: true` is what creates the group, and Caido's LLRT honours it.** Post-fix `pgid == pid`; pre-fix the provider sits in Caido's own group **91048**, twice. One machine, one Caido process, minutes apart, one variable changed. This is what plan 08-16's Table 5 could not show on its own: a favourable listing with no unfavourable counterpart is consistent with a runtime that simply always gives a child its own group |

### Reading D — a run that was TAKEN AND DISCARDED, recorded so it is not mistaken for the Control

**A discarded run that vanishes from the record is how a later reader mistakes the remaining one for
the only attempt.** So it is written down, with the reason, rather than dropped.

| Field | Value |
|---|---|
| When | probe build, **10:51:33 – 10:51:46**, 2026-08-31 |
| What the sampler saw | `0 → 1 → 0` — superficially the same shape as the Control |
| Its session record, verbatim | `"reason": "Last provider turn completed. Send another message to continue."`, `"reasonCode": "completed"`, **no `exitCode`** |
| Its chat | *"holiiiii"*, 2 messages, ~7 s |
| **Why it was discarded** | **Stop was NOT clicked; the turn ended on its own.** A `0 → 1 → 0` from a turn that finished normally is not a cancellation measurement, and filing it as one would have produced a Control that measured nothing — the same class of error as the retracted A1 reading, one level up. The absent `exitCode` is the discriminator: the Control's record carries `exitCode: 143` |
| Its status | **DISCARDED, not failed.** No cell anywhere is filled from it |

### Readings E and F — two incidental observations, recorded with their limits

Neither was asked for by this plan. Both are transcribed because a measurement discarded for not
having a cell waiting is a measurement lost.

| Reading | Build | Value, verbatim | What it establishes, and what it does NOT |
|---|---|---|---|
| **E** — the orphan reap took its `kind=reap` arm | **HEAD build**, 10:47 (structurally identified: carries `lastOrphanReap`, which does not exist at `68199fa`) | `"lastOrphanReap": "kind=reap exit=0 killed=2 ageMs=31"`, `"activeSessions": "0"` | **FIRST observation anywhere of the reap taking the `kind=reap` arm and signalling pids.** Every prior reading was `kind=noop`. Three days had passed since the 2026-08-28 session, so a start-up previous-run reap (AR-02 / OQ-3) clearing orphans that session left behind is *consistent* with it. **WHAT IT KILLED IS NOT ESTABLISHED BY THIS VALUE.** The record carries a count, not identities. Its targets are deliberately not named here |
| **F** — the parent environment, stated by the runtime | **both builds** | `"runtimeParentEnv": "ok (reported): parent environment carries 0 keys; the PATH variable is absent from that block"`, `"parentEnvKeyCount": "0"`, `"parentEnvPathEntryCount": "absent"` | **G-01 is now stated by the runtime itself on a real install, on both builds, rather than inferred.** Caido's sandbox exposes an empty `process.env`. This is the fact commit `39876b5`'s POSIX identity floor exists for, and it is why the probe build had to carry that floor for the Control to be takeable at all. It says nothing about Windows |


### The abstention rule, restated for these two tables

Identical to the rule governing the 2026-08-28 HEAD-build tables above, and repeated here so it
travels with the tables it governs:

1. **A cell is filled only from a reading that was taken** — verbatim, no rounding, no tidying, no
   unit conversion, no reconstruction from prose.
2. **A cell that could not be filled gets a dated marked abstention** naming what was attempted and
   what stopped it. An abstention is a complete and correct outcome, not a failure.
3. **Never fill a cell from a neighbouring cell**, and never from table 1 into table 2 or back.
4. **Never fill a cell from an expectation** — not from this document, not from a plan, not from
   what the mechanism is supposed to do. **In particular: never infer the Control from the post-fix
   readings.** That inference is the entire thing the Control exists to prevent.
5. **A cannot-tell reading is recorded as cannot-tell.** For table 1 this is the explicit third
   outcome, and it is not retried into a definite answer.
6. **No unexplained blanks.** Every cell ends as a verbatim value or a dated abstention with a named
   blocker, and the two counts sum to the cell count.
7. **Interpretation lives beneath the tables, in its own labelled paragraph**, never inside a cell
   (threat T-08-71).

### The 2026-08-31 raw readings, exactly as pasted

Preserved so every cell above is checkable against its source rather than against this document's
prose. No rounding, no tidying, no unit conversion, no reconstruction.

**READING A — A1's causal half, from `Copy diagnostics` on the probe build:**

```
"spikeProcessKillType": "undefined",
"spikeDetachedGroupKill": "grandchild-died (detached honoured)",
"spikeNote": "Phase 8 A1 probe — temporary, removed by T-08-03",
```

Fixture-leak check immediately after, verbatim: `pgrep -f 'node -e' | wc -l` => `0`.

**READING B — the topology control pair.** Caido's own process group this session: `Caido` pid
`91048` pgid `91048`; `caido-cli` pid `91056` ppid 91048 pgid `91048`. Columns `PID PPID PGID`.

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

**READING C — the Control.** Probe build (`68199fa`, pre-fix). Prompt *"resume en detalle qué hace
este proyecto"*. Stop WAS clicked; the session record:

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

**READING D — the DISCARDED run** (10:51:33-10:51:46), recorded so it is not mistaken for the
Control:

```
"reason": "Last provider turn completed. Send another message to continue.",
"reasonCode": "completed",
```

No `exitCode`. Chat *"holiiiii"*, 2 messages, ~7 s. **Stop was NOT clicked; the turn ended on its
own.**

**READING E — incidental, from the HEAD build at 10:47:**

```
"lastOrphanReap": "kind=reap exit=0 killed=2 ageMs=31",
"activeSessions": "0",
```

**READING F — incidental, both builds:**

```
"runtimeParentEnv": "ok (reported): parent environment carries 0 keys; the PATH variable is absent from that block",
"parentEnvKeyCount": "0",
"parentEnvPathEntryCount": "absent",
```

### What the 2026-08-31 readings establish, and what they take away

**This is interpretation, and it is deliberately in no cell above** (threat T-08-71). Every claim
here is traceable to a value in § *The 2026-08-31 raw readings, exactly as pasted*.

#### Why Reading A is a measurement and not the retraction repeated

**At face value Reading A reproduces the retracted defect's exact signature, and a reader who stops
at the values will reach for the retraction. That reader must find the discriminator already
answered, so it is answered here rather than left to be re-derived.**

The 2026-08-27 reading was withdrawn because `spikeProcessKillType: "undefined"` sat beside
`grandchild-died (detached honoured)`: with `process.kill` absent, the optional chain yielded
`undefined`, `?? false` forced `alive === false`, and the favourable string was emitted
unconditionally. **Reading A shows THE SAME TWO VALUES.** What makes it a measurement this time is
that **the code between them is different**, and three independent facts establish it:

1. **The patch DELETES the line that coalesced.** `a1-probe-fix.patch` removes
   `const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false;` outright and routes the
   verdict through `formatSpikeVerdict(classifyLivenessObservation({...}))`. The deleted line is
   preserved in the patch as a comment, so the substitution is checkable rather than asserted.
2. **The classifier DEFAULTS to inconclusive, and `dead` is reached rather than fallen into.**
   `classifyLivenessObservation` (`kill-plan.ts`) must clear five gates before it can say `dead`: a
   spawned enumerator (`spawnThrew: false`), no timeout, a usable pid, a numeric exit code that is
   neither `undefined` nor `null`, and that code being one of the two recognised values. The patch
   also passes **`spawnThrew: !probe.spawned` specifically** so that `spawnAndWait`'s SYNTHETIC
   `code: 1` on an unspawnable enumerator — **byte-identical to `ps`'s documented "no process
   matched"** — cannot become the answer *"the grandchild is gone"*. That is gap 1 rebuilt out of a
   different operator, and the patch refuses it **by name**, in a comment on the line that refuses
   it.
3. **`pgrep -f 'node -e'` => `0` proves the PATCHED build is what ran.** The original probe's
   fixture cleanup signalled through the same absent `process.kill` the verdict used, so on this
   sandbox it was a silent no-op and the 2026-08-27 run leaked BOTH of its fixtures. The patched
   cleanup spawns a positive single-pid killer. A `0` here is only reachable on the patched build;
   the original would have left `2`. This is a *behavioural* build fingerprint, independent of the
   plugin id and of the `spike*`/`lastOrphanReap` structural test.

**So `spikeProcessKillType: "undefined"` is now an honest REPORT of a runtime fact sitting beside a
verdict that no longer depends on it.** Caido's LLRT genuinely exposes no `process.kill`; that was
always true and is worth recording. What changed is that nothing reads it. **The instrument could
have printed `grandchild-survived (detached NOT honoured)` or any of six `inconclusive: <reason>`
strings, and printed neither.** That is the property the 2026-08-27 instrument lacked, and it is
the whole difference between a reading and a restatement.

#### The Control CONTRADICTS `08-01` truth 3, and this is the most important result in the plan

**Truth 3 predicted a NON-ZERO after-Stop count on the pre-fix build. The measurement is ZERO.** On
a build with no `detached` at the provider spawn — Table 3 shows the provider inheriting Caido's
group 91048, twice — and with only a single-pid SIGTERM, the token-bearing MCP child **died
anyway**. Claude Code cleans up its own MCP child on SIGTERM.

Three consequences, stated plainly and not softened:

1. **The CLI-cleanup confounder is no longer merely unexcluded — it is IMPLICATED.** Since
   2026-08-24 it has been an open possibility. It is now the mechanism with a positive observation
   behind it: on the build where none of Drift's machinery exists, the child still goes away.
2. **Plan 08-16's favourable post-fix zero proves LESS than it appeared to**, because the pre-fix
   build yields the same zero. A before/after pair whose two halves agree does not separate the
   candidate causes; it rules out the hypothesis that the difference is visible at this instrument.
   That qualification is applied at every live carrier of the claim (marked correction in § *What
   these readings close, and what they do not* above, and `08-UAT.md` test 9's
   `scope_and_caveats`). `08-16-SUMMARY.md` is a dated historical record in the ARM C immutable
   class and is deliberately NOT edited — it was correct on its date, and rewriting it would
   falsify the record rather than correct it.
3. **For Claude Code on macOS, Drift's group-kill machinery is REDUNDANT with the provider's own
   cleanup on this path.** Not useless — redundant, for the one combination measured.

**And the limits, equally plainly.** The 2026-08-27 G-04 orphan was a **codex** process,
foreign-parented, that Drift never spawned — a different class this Control did not test. A6 shows
codex puts its MCP child in its **own** process group, so neither the group kill nor this cleanup
path is established for it. **The machinery is not shown useless; it is shown redundant for the one
combination measured.** A reader who takes point 3 as licence to remove a termination rung is
reading past this paragraph.

#### The gate went red, exactly as predicted

`08-SPIKE.md` now carries a live favourable A1 claim that the ROADMAP, `REQUIREMENTS.md`,
`STATE.md`, ledger entry 11 and the source comments do not. **`verdict-gate.sh` ARM A therefore
fails on this file, and that red is CORRECT — the gate is reporting a true inconsistency, not
malfunctioning.** It was written down in advance in § *What a definite verdict here does to
`verdict-gate.sh`, said in advance* above, before any reading existed, so it could not be met as a
surprise and resolved the cheap way.

**The gate is UNMODIFIED by this plan** — no exclusion added, no pattern narrowed, no wording of
this section chosen to dodge the match. The propagation follow-up, with ARM A's own output as its
worklist, is recorded in `deferred-items.md` § *The ownerless list*, item 10. **Until that
follow-up lands, `verdict-gate.sh` is EXPECTED to exit non-zero naming this file.**

#### Scope, stated rather than left implied

**One provider** (claude-cli, Claude Code CLI at `/Users/six2dez/.local/bin/claude`). **One
platform** (macOS, darwin 25.6.0). **One Caido version** (0.58.2). **One machine.** **codex is
untested** on both the Control path and the causal A1 path, and A6 is FALSIFIED for it, so nothing
here transfers to it. gemini and copilot are unmeasured in either direction. **Windows is entirely
unmeasured and stays re-deferred to Phase 9 SC-4** (`deferred-items.md`); on win32 the scan plan
refuses on a different arm before any spawn, so nothing here transfers. Linux is unmeasured. Two
cells are dated abstentions and each names its blocker.

#### A diagnostics defect surfaced by Reading C, worth a ledger entry

`reasonCode` reported **`completed`** for a **SIGTERM** death. The `reason` text
(*"Provider exited with code 143."*) and `exitCode: 143` carry the truth; **the machine-readable
code does not.** A consumer branching on `reasonCode` cannot distinguish a cancelled turn from a
completed one. Recorded as ledger entry **24**. It is also the reason Reading D needed the
`exitCode` field to be discriminated from the Control at all — `reasonCode` was `completed` on both.

---

## How to run this spike later

The probe code is **not in HEAD** — task T-08-03 removed it, as its own plan required, because
it spawns fixture processes on every `getDiagnostics` call and must not ship.

**Do not rebuild it by hand from 68199fa.** The probe *as it exists at that commit* is broken in
two ways, and hand reconstruction is the activity that produced five wrong censuses in this
phase. The repair is a committed, reviewable artifact instead:

- **`.planning/phases/08-process-lifecycle/a1-probe-fix.patch`** — the fixed probe, as a unified
  diff against `packages/backend/src/index.ts` at 68199fa. Its header names the commit, both
  defects, the three-valued contract, the restore command, and why it must never be committed.
- **`.planning/phases/08-process-lifecycle/verify-a1-patch.sh`** — the standing control that
  proves the patch still applies, type-checks and builds, inside a scratch worktree that never
  touches your working tree.

**Verified 2026-08-28:** `bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh` exits
**0** — the patch applies at 68199fa, the patched backend type-checks, and `caido-dev build`
produces `dist/plugin_package` (5 files, 2,545,673 bytes) and `dist/plugin_package.zip`
(2,546,633 bytes).

### Apply and restore, verbatim

The cheapest route is the control itself: it builds the package for you and leaves your working
tree alone.

```
bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh /tmp/drift-a1-build
```

`/tmp/drift-a1-build/plugin_package.zip` is then the probe build to install in Caido.

To do it in the working tree instead — for instance to iterate on the probe:

```
git checkout 68199fa -- packages/backend/src/index.ts
git apply .planning/phases/08-process-lifecycle/a1-probe-fix.patch
pnpm build
```

Restore, whatever happened, with:

```
git checkout HEAD -- packages/backend/src/index.ts
```

`index.ts` at HEAD is byte-equivalent to its pre-spike state apart from the breadcrumb comment
above `getDiagnostics`, so the checkout is clean in both directions. **Never commit the patched
file.** The probe spawns two fixture node processes on every diagnostics call, which is threat
T-08-76.

> **SUPERSEDED 2026-08-28 (preserved, not deleted). The original recipe, which rebuilds the
> DEFECTIVE probe with no patch step:**
>
> ```
> git checkout 68199fa -- packages/backend/src/index.ts
> pnpm build
> ```
>
> Then restore HEAD's version afterwards with `git checkout HEAD -- packages/backend/src/index.ts`.

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
- `spikeDetachedGroupKill` — **this is A1.** Under the PATCHED probe there are **exactly three**
  outcomes, and the third is a first-class RESULT rather than a halt. The old list enumerated two
  verdicts plus three halt values; that shape is what let a non-answer be filed as an answer.
  - `grandchild-survived (detached NOT honoured)` → **A1 FALSIFIED.** The group signal does not
    reach a detached grandchild on this runtime; the phase's POSIX mechanism does not hold.
    **STOP** and re-plan.
  - `grandchild-died (detached honoured)` → **A1 CONFIRMED.** `detached: true` really does put
    the fixture in its own process group and the group signal reaches the grandchild.
  - `inconclusive: <reason> — the probe could not tell whether the target is still in the process
    table` → **A1 stays OPEN.** **RECORD IT VERBATIM, reason token and all.** Do NOT retry it,
    do NOT average it against another run, and do NOT read it as either verdict above. `<reason>`
    is one of `enumerator-unavailable`, `probe-timeout`, `no-exit-code`,
    `unrecognised-exit-code`, `unusable-pid` or `contradictory-output`, and it names *which*
    question the instrument could not answer. `enumerator-unavailable` in particular means
    Caido's sandbox refused to spawn `ps` — which is itself the reading step 5 asks for, arriving
    a second way.

  Coalescing that third outcome into either of the other two is the exact defect that produced
  the withdrawn 2026-08-27 reading, so `formatSpikeVerdict` (`kill-plan.ts`) shares no verdict
  word between it and them — no "died", no "survived", no "honoured". The first two strings are
  byte-identical to what the 2026-08-27 run printed, deliberately, so a re-run is COMPARABLE with
  the reading that was withdrawn rather than being a second measurement of a different thing.

> **SUPERSEDED 2026-08-28 (preserved, not deleted). The original list, written for the probe
> whose third-and-beyond outcomes were all halts:**
>
> - `spikeDetachedGroupKill` — **this is A1.** It is exactly one of:
>   - `grandchild-died (detached honoured)` → A1 closed favourably; the phase proceeds as planned.
>   - `grandchild-survived (detached NOT honoured)` → the phase's POSIX mechanism is falsified.
>     **STOP**, do not run plan 08-02, re-plan the phase.
>   - `inconclusive (no fixture output)`, `skipped (node executable not resolved)`, or
>     `error: <constructor name>` → **also a halt.** An unclear A1 is not a pass. Record verbatim.

### The re-run's results table — empty, and empty is the honest state

Filled in by plan 08-17 when the patched build is run on real hardware. Cells stay marked
**not recorded** until then, in the same form the Control table below uses; a cell nobody
measured must never be filled from an expectation.

| Field | Value |
|---|---|
| Date taken | **not recorded — the patched probe has not been run** |
| Platform | **not recorded** |
| Caido version | **not recorded** (from Caido's own About/Settings, not from `processVersion`) |
| Probe build | `68199fa` + `a1-probe-fix.patch` |
| `spikeProcessKillType` | **not recorded** |
| `spikeDetachedGroupKill` | **not recorded** — one of the three outcomes above, verbatim |
| `spikeNote` | **not recorded** |
| `lastOrphanReap` (step 5) | **not recorded** |
| **Verdict** | **OPEN — A1's 2026-08-28 status, unchanged until this table is filled** |

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

### Step 5 — reading 6: is the orphan reap inert on this runtime?

**One glance, and it needs no probe build at all** — it reads a key that ships in HEAD.

Open Drift → Settings → the Copy-diagnostics action and record **`lastOrphanReap`** verbatim.
It is one of:

| Value | What it means |
|---|---|
| `none (no orphan reap has run since this plugin load)` | Nothing has triggered a reap yet. Cancel a turn or close a session and read it again — an untriggered reap is not a reading. |
| `kind=noop reason=enumerator-unavailable exit=… killed=0 ageMs=…` | **The reading this step exists for.** Caido's sandbox could not spawn `pgrep`, so the entire argv-marker orphan reap plans 08-06/08-07 shipped is **inert on this runtime** while every CI gate stays green. `08-VERIFICATION.md` ledger entries 14 and 15 name this as the phase's largest open risk. |
| `kind=noop reason=no-match exit=… killed=0 ageMs=…` | The reap RAN and matched nothing. Not the same reading as the row above, and telling those two apart is the whole reason the key exists. |
| `kind=noop reason=scan-timeout \| scan-stale \| scan-failed …` | The reap ran and the enumerator misbehaved or the sample went stale. Record the reason token. |
| `kind=reap exit=… killed=N ageMs=…` | The reap ran and signalled N orphans. |
| `kind=refused reason=gate-closed sessions=N directDepth=N killed=0 ageMs=0` | The idle gate refused. `sessions>0` is residual AR-07; `directDepth>0` is a Drift-owned MCP call in flight. |
| `kind=refused reason=no-pid \| unsupported-platform \| bad-marker \| session-active …` | The scan plan itself refused before any spawn. |

The key is **scalars only** — no pid, no path, no argv, no environment value — so it is safe to
paste into a public issue exactly as it appears (threat T-08-75). It was added by plan 08-15 as
decision **UD-01**'s resolved deliverable: diagnostics-only, no user-visible surface, zero
frontend files.

Do not summarise, interpret or round any of the six readings. Record what the terminal said.

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
