---
status: testing
phase: 08-process-lifecycle
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md
started: 2026-08-24T22:40:00Z
updated: 2026-08-28T11:50:00Z
gate_overrides:
  - gate: api-coverage.verify-pre
    decided: 2026-08-24
    by: maintainer
    reason: >-
      False positive. The detector matched the prose "requires Win32 API calls neither
      Caido's LLRT nor Node exposes without a native addon — banned by the ..." — a sentence
      stating that Win32 API calls are unavailable and NOT used. Phase 8 integrates no
      external API; it terminates processes. The same detector returned detected:false at
      plan time and fires now only because the executed plans added prose containing the
      word. No COVERAGE.md was produced because there is no API surface to enumerate.
---

## Current Test

number: 2
name: A6 — a real provider CLI's MCP child sits in the group the kill reaches
expected: |
  During a LIVE Drift turn, `ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep`
  shows the `node …mcp-server.mjs` row's pgid equal to the pid of the `claude` row that
  carries --mcp-config. (Command corrected 2026-08-27 — see test 2's note.)
awaiting: user response
note: |
  A diagnostics report was submitted 2026-08-27 from a real macOS Caido install. It does
  NOT answer this test: it carries no spike* fields, because it is a HEAD build and the
  probe was removed by T-08-03 (d8ccab8). The probe build is 68199fa. The same report also
  cannot answer tests 2-5, 9 or 10 — activeSessions: 0 and lastSpawnCommand: "" show no
  turn was running when it was captured. It did, however, yield one unrelated finding
  (G-01 below) and confirm three runtime facts — see § Observations.

## Observations from the 2026-08-27 diagnostics

Recorded because they are real-hardware readings the project had not previously taken.
None of them closes a test; G-01 opens a gap.

**Confirmed working on a real Caido install (darwin 25.6.0):**
- `os.platform()` → `"darwin"`, recognised (`runtimeOsPlatform: ok (gating)`)
- `os.tmpdir()` → `/var/folders/05/…/T/`; `mcpTempDir` correctly resolves under it rather
  than a hardcoded `/tmp` — Phase 4's platform work holds outside CI
- MCP running, `authState: valid`, `authSource: session`, 18 tools registered

**Unavailable in the real backend runtime:** `processVersion`, `versionsNode`,
`versionsLlrt` all report `unavailable` — the exact LLRT build users run cannot be
identified from inside the plugin, which is why assumption A1 was closable only by the
spike and not by a version check.

## The root cause behind G-01 and G-02 (2026-08-27, probe build)

Four independent readings from the same real install:

| Reading | Value |
|---|---|
| `typeof process.kill` | `undefined` |
| `parentEnvKeyCount` (`process.env`) | `0` |
| `processVersion` (`process.version`) | `unavailable` |
| `versionsNode` / `versionsLlrt` (`process.versions`) | `unavailable` |

These are not four coincidences. **Caido's plugin sandbox exposes a heavily restricted
`process` shim, not LLRT's full `process` module.** `08-RESEARCH.md` § *Q2* source-read
`modules/llrt_process/src/lib.rs:197-199` and found `process.set("kill", …)` — that
describes LLRT. It does not describe what the plugin sandbox re-exports to a backend
bundle. The distinction was never drawn before this reading, and it is the single
mechanism behind both gaps below.

**ADDED 2026-08-28 — the finding this table was already carrying, four sections above the
test that contradicted it.** The first row here, `typeof process.kill` = `undefined`, is
what INVALIDATES test 1's A1 verdict below: the probe decided A1 by calling that exact
primitive and coalescing its absence to "not alive", so the favourable string was emitted
unconditionally. Both facts came out of the SAME probe run and were written into the SAME
file on the SAME day, five sections apart, and **nobody joined them at the time.** That
is the finding, and this file is where it happened. A1's reading is RETRACTED; see test 1
and `08-VERIFICATION.md` gap 1.

Two consequences, recorded rather than acted on here:

1. **G-01's risk rating rises.** An empty `process.env` on darwin could have been a
   host quirk. A sandbox that also withholds `kill`, `version` and `versions` is a
   *policy*, and a policy is very unlikely to differ on Windows. The `SystemRoot` lookup
   in `buildKillTreePlan` reads that same shim, so the bare-name `taskkill.exe` fallback
   is now the *expected* path on a real Windows install rather than a remote contingency.
2. **ROADMAP SC-2's recorded reason is incomplete, though its conclusion holds.** SC-2
   bans `process.kill(-pid, …)` because rquickjs converts through `f64` to `u32` and a
   negative pid raises `Underflow`. On this build that failure is unreachable — the call
   would be `TypeError: process.kill is not a function` first. The ban is still correct
   and the static gate still earns its place; only the stated mechanism is partial. Worth
   a marked correction in the `07-VALIDATION.md` style, not a scramble.

## Observations from the 2026-08-31 readings (plan 08-17)

Recorded for the same reason the 2026-08-27 observations were: they are real-hardware readings
the project had not previously taken. Neither closes a test on its own.

**G-01 is now STATED BY THE RUNTIME ITSELF, on both builds, rather than inferred.** The
diagnostics reported, verbatim:

```
"runtimeParentEnv": "ok (reported): parent environment carries 0 keys; the PATH variable is absent from that block",
"parentEnvKeyCount": "0",
"parentEnvPathEntryCount": "absent",
```

Since 2026-08-27 the empty `process.env` was an inference from behaviour; the runtime now says so
directly, on a real install, on **both** the probe build and HEAD. This confirms the **POSIX** half
of the identity floor commit `39876b5` shipped (ledger entry 22) — and it confirms it in the
strongest available way, because the pre-fix Control could not have been taken at all without that
floor. **Its Windows half is untouched and stays owned by Phase 9**: the claim that libuv back-fills
`USERNAME` and `USERPROFILE` on win32 is source analysis, not a reading. **G-01's risk rating stated
on 2026-08-27 is unchanged by this** — a policy that is now confirmed rather than inferred is not a
policy that got safer.

**The orphan reap was observed taking its acting arm for the first time anywhere.** HEAD build at
10:47: `"lastOrphanReap": "kind=reap exit=0 killed=2 ageMs=31"`, `"activeSessions": "0"`. Every
prior reading was `kind=noop`, so until now the mechanism had only ever been observed matching
nothing. Three days had elapsed since the 2026-08-28 session, so a start-up previous-run reap
(AR-02 / OQ-3) clearing that session's leftovers is *consistent* with it. **What it killed is not
established by this value** — the record carries a count, not identities, and naming its targets
would be inference. Ledger entries 13 and 15 are narrowed by it and both stay open, because a
runtime observation is not an executed assertion.

**A diagnostics defect, recorded as ledger entry 24.** `reasonCode` reported `completed` for a
**SIGTERM** death (`exitCode: 143`). The human-readable `reason` and `exitCode` carry the truth; the
machine-readable code does not, so a consumer branching on `reasonCode` cannot distinguish a
cancelled turn from a completed one. This is not cosmetic: the same session produced a second run
that ended on its own, also `reasonCode: completed`, and the two were separable only by the presence
of `exitCode`. That is precisely the discrimination test 3's Control depended on.

**Operational, outside Phase 8 scope (Phase 7 / registration territory):**
`mcpCliRemovalFailures: gemini: 2 failed (scope=user exit=127, scope=project exit=127)`.
Drift's own message states a Drift MCP entry carrying a Caido session token may still be
present in the Gemini CLI's configuration on this machine. Clear with
`gemini mcp remove --scope user drift` and `--scope project drift`. Not a Phase 8 defect,
but it is a live token-at-rest condition and should not be lost in a summary.

## Tests

<!--
  All ten checkpoints below are human_judgment items surfaced by the coverage
  classifier. None is a regression: every one is already recorded by its own SUMMARY
  as NOT DELIVERED, unrun, or attestation-only. They cluster into three actions:

    A. Run the A1/A6 spike on a real Caido install   → tests 1, 2, 3, 4, 5
    B. Push the branch to fire the windows-latest leg → tests 6, 7, 8
    C. Re-run cancel + timeout with counts recorded   → tests 9, 10

  The probe for cluster A is recoverable at commit 68199fa:
    git checkout 68199fa -- packages/backend/src/index.ts && pnpm build
  08-SPIKE.md keeps the full four-step procedure runnable.
-->

### 1. A1 — LLRT honours the process-group spawn option
source: 08-01-SUMMARY.md D2
expected: Diagnostics reports `spikeDetachedGroupKill: grandchild-died (detached honoured)`. Any other value — including `inconclusive`, `skipped`, or `error: <ctor>` — is a halt, not a retry.
result: issue
reported: |
  2026-08-27, probe build (68199fa) installed in Caido on darwin 25.6.0:
    spikeProcessKillType:   "undefined"
    spikeDetachedGroupKill: "grandchild-died (detached honoured)"
    spikeNote:              "Phase 8 A1 probe — temporary, removed by T-08-03"
severity: major
evidence: >-
  **A1 IS RETRACTED (2026-08-28). The reading above is an artefact of the instrument, not a
  measurement, and this record is where the reading first became a verdict.** The probe at
  68199fa (`index.ts:5061`) determined liveness with
  `signalRef.process?.kill?.(grandchildPid, 0) ?? false` — an optional call on
  `process.kill`, the very primitive the FIRST field of this same `reported` block records
  as `"undefined"`. With it absent the optional chain yields `undefined`, `?? false`
  coalesces the absent case to "not alive", and the branch prints
  `grandchild-died (detached honoured)` UNCONDITIONALLY. The other branch was unreachable:
  the red input did not exist. So the reading carries NO information about whether the
  grandchild died, and it cannot distinguish "the grandchild died" from "I have no way to
  look". The nine `killTree` sites are back to resting on source analysis of a pinned
  commit, and ledger entry 11's A1 half is NOT closed — it is open, and its nine-site
  POSIX concern is live again.
  **The `reported` block is unchanged and is not the error** — those three field values are
  what the instrument printed, and the first of them is the evidence against the third.
  **Where the fix lives:** `classifyLivenessObservation` in
  `packages/backend/src/kill-plan.ts` (plan 08-12) is three-valued — alive / dead /
  inconclusive — and returns `inconclusive` when the liveness primitive is unavailable
  instead of coalescing it into a verdict. **Who re-runs it:** plan 08-17, on real
  hardware, via 08-SPIKE.md steps 3 and 4. Retraction recorded in `08-VERIFICATION.md`
  gap 1; defect recorded as broken-windows ledger entry 20.
  Second field is a separate matter — see G-02; it does NOT weaken this retraction.

> **SUPERSEDED 2026-08-27 evidence for test 1 — preserved verbatim, not deleted**, per the
> `07-VALIDATION.md` marked-correction convention this phase uses throughout:
>
> > **A1 is CLOSED FAVOURABLY, by measurement rather than inference.** The shipped Caido
> > LLRT honours `detached: true`: a detached spawn's group kill reached the grandchild on
> > real hardware. This is the assumption the phase's entire POSIX mechanism rests on, and
> > the one no CI leg could ever reach — every leg runs Node, which honours the option
> > regardless. Nine `killTree` sites are now backed by execution, not by source analysis
> > of a pinned commit. Ledger entry 11's A1 half is closed.
> > Second field is a separate matter — see G-02; it does NOT weaken this result.

### 2. A6 — a real provider CLI's MCP child sits in the group the kill reaches
source: 08-01-SUMMARY.md D3
expected: During a live Drift turn, `ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep` shows the `node …mcp-server.mjs` row's **pgid** equal to the **pid** of the `claude` row carrying `--mcp-config`.
result: issue
reported: |
  2026-08-27, corrected command, real macOS install:
      PID  PPID  PGID  ARGS
    43921 43752 43752  /Applications/ChatGPT Classic.app/Contents/Resources/codex -c fe
    44284 43921 44284  /opt/homebrew/bin/node /var/folders/.../drift-mcp-9b48c5c2275914bc4fd0/mcp-server.mjs
severity: major
evidence: >-
  **A6 IS FALSIFIED.** The MCP child (44284) has pgid 44284 — its own process group —
  while its parent CLI (codex, 43921) sits in group 43752. A6 was stated as "the provider
  CLIs do not themselves place their MCP child in a different process group"; that is now
  measured FALSE. A group signal aimed at the CLI's group cannot reach the token-bearing
  child, so for this provider LIF-02 is NOT closed by process-group signalling — even
  though A1 (test 1) is green. The single-pid rung kept per OQ-2 does not help either:
  it signals the CLI, not the child.
scope_and_caveats: >-
  Measured on ONE provider (Codex) and on an instance Drift did NOT spawn (see G-04), so
  Drift's own `detached: true` was not in play for the CLI. That does not weaken the
  observation — the child creating its own group is a property of how the CLI launches it,
  not of how the CLI itself was started — but Claude Code, the ACTIVE provider, remains
  unmeasured. Re-run against a Drift-spawned Claude turn before generalising to all
  providers.
attempt_1: |
  2026-08-27. The originally-specified command returned nine `claude` rows and NO
  mcp-server row. Not a result — the command was unrunnable. See G-03.
correction: >-
  `ps -eo comm` prints the executable name, not the command line; `node <tmp>/mcp-server.mjs`
  has comm `node`, so the `mcp-server` alternation could never match. Corrected to `args`
  plus a `--mcp-config` anchor that distinguishes Drift's spawned CLI from the maintainer's
  own concurrent `claude` sessions (all nine returned rows had pgid == pid, i.e. ordinary
  shell job-control groups, and at least one was the session running this workflow).

### 3. The LIF-02 defect reproduces on real hardware (pre-fix baseline)
source: 08-01-SUMMARY.md D4
expected: Against the pre-fix build, a cancel leaves a non-zero `pgrep -f mcp-server.mjs | wc -l`. This is the baseline test 9 compares against; without it, a post-fix zero has no control.
result: issues
reported: |
  2026-08-31, probe build 68199fa + a1-probe-fix.patch installed in Caido 0.58.2 on darwin
  25.6.0, provider claude-cli, plugin id d8aee773-b939-4164-a576-9c276ee30df8. This build
  predates the argv-marker orphan reap entirely, which is what makes it the pre-fix baseline.
  Chat `chat-1788166552577-7obc`, prompt "resume en detalle qué hace este proyecto".
  1 Hz `pgrep -f mcp-server.mjs | wc -l` sampler:
    10:55:53  count=0
    10:55:54  count=1    <- child born
    10:56:04  count=1    <- last non-zero
    10:56:05  count=0    <- first zero AFTER Stop
    10:56:11  count=0    <- sixth consecutive zero
  `pgrep -f mcp-server.mjs` reads 0 at rest afterwards. Stop WAS clicked, corroborated by the
  session record rather than by assertion: state "stopped", reason "Provider exited with code
  143.", exitCode 143. 143 = 128 + 15 = SIGTERM.
evidence: >-
  THE READING WAS TAKEN AND THE TEST'S OWN EXPECTATION WAS FALSIFIED. This test expected a
  NON-ZERO after-Stop count. The measurement is ZERO. It is recorded as `issues` rather than
  `passed` for exactly that reason, and rather than `pending` because a reading exists -- the
  defect did not reproduce, which is a result and not an absence. On a build with no `detached`
  at the provider spawn (the pre-fix provider inherits Caido's own process group 91048, measured
  twice) and only a single-pid SIGTERM, the token-bearing MCP child died anyway. Claude Code
  cleans up its own MCP child on SIGTERM. Full transcription in `08-SPIKE.md` § *The
  patched-probe A1 re-run and the pre-fix Control -- TAKEN 2026-08-31*, Table 2.
scope_and_caveats: >-
  THE CONSEQUENCE RUNS AGAINST THIS PHASE'S OWN EVIDENCE AND IS NOT SOFTENED. The CLI-cleanup
  confounder is no longer merely unexcluded -- it is IMPLICATED, because it is now the only
  candidate with a positive observation behind it. Test 9's post-fix zero therefore proves LESS
  than it appeared to, since the pre-fix build yields the same zero; test 9's own
  `scope_and_caveats` is corrected accordingly. For Claude Code on macOS, Drift's group-kill
  machinery is REDUNDANT with the provider's own cleanup on this path -- redundant, NOT useless:
  the 2026-08-27 G-04 orphan was a codex process, foreign-parented, that Drift never spawned, and
  A6 shows codex puts its MCP child in its OWN process group, so neither the group kill nor this
  cleanup path is established for it. One provider (claude-cli), one platform (darwin 25.6.0),
  one Caido version (0.58.2), one machine. A SECOND RUN THE SAME SESSION WAS DISCARDED, NOT USED:
  it sampled 0->1->0 but its session record read reasonCode "completed" with NO exitCode and its
  turn ended on its own, so it was not a cancellation measurement. Recorded as Reading D in
  `08-SPIKE.md` so it is not later mistaken for this one.
note: >-
  Closes the `insufficient_spec` item (08-01 truth 3) abstained on 2026-08-24, and it closes it by
  FALSIFYING the truth rather than by satisfying it. Ledger entry 11 is narrowed and stays open;
  the follow-on question -- a Control run against codex, whose own cleanup is not implicated -- is
  recorded as ownerless in `deferred-items.md` items 3 and 11.

### 4. Stop terminates the CLI *and* its token-bearing MCP child
source: 08-02-SUMMARY.md D5
expected: On a real Caido install (not Node), clicking Stop kills both the provider CLI and its `mcp-server.mjs` child. Mechanism currently proven under Node only.
result: [pending]

### 5. The whole mechanism works on Caido's LLRT, not just the Node CI vehicle
source: 08-03-SUMMARY.md D8
expected: All nine `killTree` sites behave on the runtime users actually run. Inherited from 08-02, not closed by 08-03.
result: [pending]

### 6. win32 — the built argv terminates a live parent AND its grandchild
source: 08-04-SUMMARY.md D1
expected: On a `windows-latest` runner, `kill-tree.win32.test.ts` executes 3/3 (currently collected-but-pending everywhere) and the tree-kill case passes behaviourally.
result: [pending]

### 7. taskkill.exe resolves by absolute path from the runner's system root
source: 08-04-SUMMARY.md D2
expected: The win32 leg confirms absolute-path resolution, with the bare-name fallback asserted when `SystemRoot` is unset. Turns assumption A7 into a measurement.
result: [pending]

### 8. A kill against an already-exited pid is a logged no-op
source: 08-04-SUMMARY.md D3
expected: The reserved block in `kill-tree.win32.test.ts` gets `taskkill`'s exit code and first stderr line recorded. The prohibition half (nothing branches on the value) is already closed statically on every host.
result: [pending]

### 9. A real cancel on macOS leaves zero mcp-server.mjs processes
source: 08-05-SUMMARY.md D6
expected: `pgrep -f mcp-server.mjs | wc -l` is non-zero during a live turn and **zero** ~5s after clicking Stop. Both numbers recorded, not just the second.
result: passed
reported: |
  2026-08-28, HEAD build 39876b5 installed in Caido 0.58.2 on darwin 25.6.0, provider
  Claude Code 2.1.250. 1 Hz `pgrep -f mcp-server.mjs | wc -l` sampler:
    13:35:43  count=1    <- first non-zero; the turn is streaming
    13:36:12  count=1    <- last non-zero; Stop was clicked while the count was 1
    13:36:13  count=0    <- first zero
    13:36:21  count=0    <- ninth consecutive zero
  Diagnostics from the same capture: activeSessions: 0
evidence: >-
  BOTH numbers are recorded, which is what this test asks for and what the 2026-08-24
  attestation did not supply: non-zero (1) during the live turn, zero after Stop, with nine
  consecutive zero samples. The attestation is now a measurement. Full transcription, the raw
  paste and the provenance are in `08-SPIKE.md` § *HEAD-build readings, 2026-08-28*, Table 1.
scope_and_caveats: >-
  CORRECTED 2026-08-31, AND THE CORRECTION WEAKENS WHAT THIS TEST PROVES. As written on
  2026-08-28 this caveat said the confounder was not excluded and that test 3 would exclude it.
  Test 3 was taken on 2026-08-31 and came back ZERO -- the same result as this test, on the
  PRE-FIX build. So the confounder is not merely unexcluded, it is IMPLICATED, and the numbers
  below prove LESS than they appeared to: a before/after pair whose two halves agree does not
  separate the candidate causes. THE READING ITSELF IS UNCHANGED AND STILL CORRECT -- 1 during
  the turn, 0 after Stop, on build 39876b5. What is corrected is the weight it carries. Drift's
  spawned group kill, the single-pid SIGTERM->SIGKILL ladder, the argv-marker orphan reap and
  Claude Code's own cleanup of its MCP child remain all consistent with 1 -> 0, and the pre-fix
  Control did not separate them. The provider-CLI liveness cell is still a dated abstention --
  no post-Stop `ps` was re-run -- and it is still the single cheapest reading that would narrow
  this. One provider, one platform, one Caido version (0.58.2), one build. See `08-SPIKE.md`
  § *The Control CONTRADICTS `08-01` truth 3*.
superseded_scope_and_caveats: >-
  SUPERSEDED 2026-08-31, preserved because it was correct on 2026-08-28 when test 3 had no
  reading: "THE CONFOUNDER NAMED IN THIS TEST'S OWN NOTE IS NOT EXCLUDED. The reading shows the
  token-bearing child is gone; it does not show that Drift is what removed it. Drift's spawned
  group kill, the single-pid SIGTERM->SIGKILL ladder, the argv-marker orphan reap and Claude
  Code's own cleanup of its MCP child are all consistent with 1 -> 0. The provider-CLI liveness
  cell is a dated abstention -- no post-Stop `ps` was re-run -- so the half of this re-test that
  was meant to exclude the confounder was not achieved. Excluding it needs the PRE-FIX Control,
  which is test 3, still `[pending]`, against build 68199fa, owned by plan 08-17. One provider,
  one platform, one Caido version (0.58.2), one build."
note: Previously satisfied by attestation on 2026-08-24 — `approved` with no numeric values supplied. Re-testing here to convert the attestation into a measurement and to exclude the confounder that the provider CLI may kill its own child.

### 10. The timeout path leaves no orphan either
source: 08-05-SUMMARY.md D7
expected: Let `processTimeoutSeconds` elapse instead of clicking Stop, then `pgrep -f mcp-server.mjs | wc -l` is zero. Must be reported or explicitly declared unexercised — never inferred from the cancel result.
result: passed
reported: |
  2026-08-28, same build (39876b5), platform (darwin 25.6.0), Caido (0.58.2) and provider
  (Claude Code 2.1.250) as test 9, but its OWN turn. `Settings -> Process -> Timeout (s)` = 10,
  the build's minimum. Stop was NOT clicked; the turn was left to time out.
  1 Hz `pgrep -f mcp-server.mjs | wc -l` sampler:
    13:37:45  count=1    <- first non-zero; the turn is streaming
    13:37:54  count=1    <- last non-zero; lifetime 13:37:45-13:37:54 inclusive = 10 samples
    13:37:55  count=0    <- first zero
    13:38:03  count=0    <- ninth consecutive zero
evidence: >-
  FIRST EXERCISE OF THIS CODE PATH ON ANY BUILD, BY ANYBODY. `08-VERIFICATION.md` recorded that
  the timeout path -- named explicitly by SC-3 and by both requirements -- had never been
  exercised at all; as of 2026-08-28 it has. The count is zero after the timeout fired. The
  child's lifetime is exactly 10 one-second samples against the configured 10 s timeout, which
  is what distinguishes the timeout ending the turn from the turn finishing on its own. Full
  transcription in `08-SPIKE.md` § *HEAD-build readings, 2026-08-28*, Table 2.
scope_and_caveats: >-
  NOTHING HERE IS INFERRED FROM TEST 9, AND NOTHING IN TEST 9 IS INFERRED FROM HERE. That was
  checked cell by cell rather than assumed, which is why the reading records whether Stop was
  clicked as its own value (it was not). The same CLI-cleanup confounder applies: the
  provider-CLI liveness cell is a dated abstention on this run too, so this shows the child is
  gone rather than why. One provider, one platform, one Caido version, one build.

## Summary

total: 10
passed: 2
issues: 3
pending: 5
at_risk: 1
degraded_as_designed: 1
skipped: 0
blocked: 0

## Gaps

<!-- APPEND only when a test reports an issue, or when verification surfaces a defect -->

- truth: "On Windows, killTree resolves taskkill.exe by absolute path from SystemRoot, using the bare name only as a last resort (SC-1, threat T-08-03)"
  status: at_risk
  reason: >-
    Not a test failure — a defect surfaced by the 2026-08-27 real-hardware diagnostics.
    That report shows `parentEnvKeyCount: 0` and `parentEnvPathEntryCount: absent`: on a
    real macOS Caido install the backend's parent environment is EMPTY.
    `killTree` (index.ts) passes `env: readParentEnv()` into `buildKillTreePlan`, whose
    win32 arm (kill-plan.ts:143-176) scans that record for `SystemRoot` then `SYSTEMROOT`
    and, finding neither, sets `root === ""` and returns `DEFAULT_TASKKILL` — the bare
    name. If the Windows backend also yields an empty parent env, SC-1's absolute-path
    guarantee degrades to the bare-name fallback on every real install, silently, while
    staying green in CI where Node populates `process.env`. That is the same
    green-on-Node / broken-on-LLRT pattern as the phase's central finding and as WR-03.
    Corroboration in the same report: `nodeExecutable` was resolved from
    `nodeSearchCandidates`, not from PATH.
  severity: major
  test: null
  source: "2026-08-27 getDiagnostics from a real macOS Caido install"
  scope_note: >-
    The reading is darwin, where the POSIX arm never consults `root`, so nothing is broken
    on macOS today. The risk is Windows-only and currently UNMEASURED — no windows-latest
    run exists, and the win32 suite exercises `buildKillTreePlan` from literal inputs
    rather than from a live backend's environment.
  affects_assumption: >-
    A7 ("%SystemRoot% is present in the environment Caido's backend sees on Windows",
    rated **Low**). Its stated basis is Phase 3's P3-VARS check, which measured
    `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` in CI — a different vehicle from the plugin
    backend this reading came from. The rating deserves re-examination on that basis.
  root_cause: >-
    Identified 2026-08-27, ahead of formal diagnosis. Caido's plugin sandbox exposes a
    restricted `process` shim: `process.env` is empty, and `process.kill`,
    `process.version` and `process.versions` are all absent. `readParentEnv()`
    (index.ts:573) reads `processRef.process?.env ?? {}` from that shim, so it can only
    ever return `{}` on a real install. Every consumer of it inherits the emptiness.
  artifacts:
    - path: "packages/backend/src/index.ts:573"
      issue: "readParentEnv() sources from the sandbox's restricted process shim; returns {} on real installs"
    - path: "packages/backend/src/kill-plan.ts:143-176"
      issue: "win32 arm scans that empty record for SystemRoot/SYSTEMROOT, so root === '' and DEFAULT_TASKKILL (bare name) is returned"
  missing:
    - "A SystemRoot source that does not depend on the sandbox's process.env — or an explicit, recorded acceptance that the bare-name fallback is the shipping Windows path, with T-08-03 re-rated accordingly"
    - "The same question asked of every other readParentEnv() consumer (selectComspec/COMSPEC at :601, getWindowsNamedRoots and isNvmWindowsInstalled at :1672-1676, buildSpawnEnv at :653) — Phase 7's cmd.exe absolute-path mitigation reads the same empty shim and is likely inert for the same reason"
  debug_session: ""  # Filled by diagnosis

- truth: "No orphaned token-bearing process survives a turn (the Phase 8 GOAL)"
  status: failed
  reason: >-
    Measured 2026-08-27. A `node .../drift-mcp-9b48c5c2275914bc4fd0/mcp-server.mjs`
    process (pid 44284) is alive and holding a live CAIDO_TOKEN, with **no Drift turn in
    existence** — the same diagnostics run reports `activeSessions: 0`. Its parent is
    `/Applications/ChatGPT Classic.app/Contents/Resources/codex` (pid 43921), NOT the
    `/opt/homebrew/bin/codex` that `mcpRegisteredCliPaths` shows Drift registered and
    would spawn. Drift therefore has no handle on it: it is absent from `activeProcesses`,
    so `killTree` can never reach it, and no cancel, timeout, session close or
    `cleanupMcpRuntime` sweep will terminate it.
  severity: major
  test: 2
  source: "2026-08-27, ps on a real macOS Caido install"
  why_the_phase_missed_it: >-
    Phase 8 modelled orphans as processes Drift SPAWNED and failed to reap — every
    mechanism it built (killTree, the eight rewired sites, SC-4's kill-before-sweep)
    operates on `activeProcesses`. This orphan arrives by a different route: Drift's
    `mcp add drift` registration persists in the CLI's own config, and ANY instance of
    that CLI on the machine can launch Drift's MCP server with a live token on its own
    initiative. OQ-3 deferred the start-up orphan-PROCESS sweep as AR-02 on blast-radius
    grounds; this is the same residual reached by registration rather than by leftovers.
    Same family as the gemini `mcp remove` failures in the same diagnostics
    (`mcpCliRemovalFailures: gemini: 2 failed`), where Drift could not withdraw a
    token-bearing registration it had created.
  scope: >-
    Arguably Phase 7 (registration) rather than Phase 8 (lifecycle) — but it falsifies
    Phase 8's GOAL SENTENCE as written, so it belongs on this record whichever phase
    eventually owns the fix.
  root_cause: ""     # Filled by diagnosis
  artifacts:
    - path: "packages/backend/src/index.ts"
      issue: "killTree/cleanupMcpRuntime operate only over activeProcesses; MCP servers launched by a non-Drift CLI instance from the registered config are invisible to every termination path"
  missing:
    - "A decision on whether Drift's registered MCP config should be usable by CLI instances Drift did not spawn, and if so how those processes are reaped"
    - "Re-examination of AR-02 (OQ-3) now that the residual has a measured instance, not a hypothetical one"
  debug_session: ""

- truth: "Sensitive temp files carrying Caido context are mode 0600 (CLAUDE.md:123)"
  status: failed
  reason: >-
    `mcp-context.json` is written at index.ts:1181-1184 with no `mode` option, so it lands
    at 0644 (`-rw-r--r--`, observed on disk 2026-08-27). CLAUDE.md:123 states
    "Sensitive temp files (MCP config, context file): 0o600 (rw owner only)".
    The 0700 parent directory covers it in practice on POSIX, so this is
    defense-in-depth being one layer thinner than documented rather than an exposure —
    but on Windows POSIX modes are ignored entirely (the constraint driving this whole
    milestone), where the directory mode contributes nothing.
  severity: minor
  test: null
  source: "2026-08-27, ls -la of a live drift-mcp temp dir + source read"
  scope: "MCP runtime bootstrap (Phase 4/5 territory), not Phase 8. Recorded so it is not lost."
  artifacts:
    - path: "packages/backend/src/index.ts:1181"
      issue: "writeFile(contextFilePath, ...) omits { mode: 0o600 }"
  missing:
    - "Pass { mode: 0o600 } at the write, or record an explicit accepted trade-off"
  debug_session: ""

- truth: "The A6 verification procedure recorded across the phase's artifacts can actually produce a reading"
  status: failed
  reason: >-
    Executed 2026-08-27 against a real install and it returned nine `claude` rows and no
    MCP row at all. `ps -eo comm` prints the executable NAME, not the command line: the
    MCP server runs as `node <tmp>/mcp-server.mjs`, so its `comm` is `node` and the
    `mcp-server` alternation can never match — the command is incapable of producing the
    A6 reading under any circumstances, including one where A6 holds perfectly.
    The instruction also gave no way to tell Drift's spawned CLI from the maintainer's own
    concurrent `claude` sessions; all nine rows returned pgid == pid (ordinary shell
    job-control groups) and at least one was the session running this workflow.
  severity: major
  test: 2
  source: "2026-08-27, run against a real macOS Caido install"
  propagation:
    - "08-SPIKE.md:127 — the procedure explicitly preserved to stay runnable (CORRECTED 2026-08-27)"
    - "08-UAT.md — current test + test 2 (CORRECTED 2026-08-27)"
    - "08-VERIFICATION.md:31 — the verifier's stated human test (stale; historical record)"
    - "08-RESEARCH.md:1120 — Validation Architecture, Wave 0 item 5 (stale; historical record)"
    - "08-01-PLAN.md:23 and :225 — including an acceptance criterion (stale; plan already executed)"
    - "08-05-PLAN.md:335, :348, :368 — the non-zero-after-count halt procedure (stale; plan already executed)"
  root_cause: >-
    Wrong `ps` output format specifier (`comm` instead of `args`), authored in
    08-RESEARCH.md and copied unchanged through plan, plan-check, execution and
    verification. It survived every gate because no gate executed it — the same
    pass-by-accident class as the `sed` two-range union, the 19-character `functionBody`
    slice, and the win32 gate-name collision, all of which this phase DID catch by
    running them.
  artifacts:
    - path: ".planning/phases/08-process-lifecycle/08-SPIKE.md:127"
      issue: "unrunnable A6 command in the durable procedure — corrected in place with a marked correction"
  missing:
    - "Corrected command: ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\\.mjs|--mcp-config' | grep -v grep"
    - "A note in 08-VERIFICATION.md that its stated A6 test command is superseded by 08-SPIKE.md's corrected step 3"
  debug_session: ""

- truth: "The deferred SIGKILL rung skips when the tracked process has already exited (T-08-04, review CR-02)"
  status: degraded_as_designed
  reason: >-
    `spikeProcessKillType` measured `undefined` on the real install — the sandbox exposes
    no `process.kill`, so the signal-0 liveness probe cannot run. `isPidAlive`
    (index.ts:5144) already guards this at line 5153 (`typeof killRef !== "function"` →
    return true), so it does not throw; it simply always answers "alive" and never skips.
    The guard therefore reduces on Caido to its identity half alone —
    `hasTrackedProcessExited` over the handle's own observed `exit` event.
    This is NOT a defect: index.ts:4751-4755 documents exactly this fallback in advance
    ("under Caido's LLRT the handle carries no exit state at all … so liveness is the only
    answer left there"), and every unknown resolves toward "alive", so neither check can
    ever ADD a kill. Recorded because the 08-01 checkpoint predicted a value other than
    `function` would mean "the deferred-rung guard needs a redesign" — that warning
    predates the CR-02 fix which introduced `hasTrackedProcessExited`, and is now stale.
  severity: minor
  test: 1
  source: "2026-08-27 spike build (68199fa) on a real macOS Caido install"
  action: >-
    No code change. Update the 08-01 checkpoint's stale prediction and note in
    08-SECURITY.md T-08-04 that on Caido the guard runs on identity only, with the
    accepted residual already stated at index.ts:4757-4763.
