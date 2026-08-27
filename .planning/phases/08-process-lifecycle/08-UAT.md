---
status: testing
phase: 08-process-lifecycle
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md
started: 2026-08-24T22:40:00Z
updated: 2026-08-27T07:30:00Z
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
result: pass
reported: |
  2026-08-27, probe build (68199fa) installed in Caido on darwin 25.6.0:
    spikeProcessKillType:   "undefined"
    spikeDetachedGroupKill: "grandchild-died (detached honoured)"
    spikeNote:              "Phase 8 A1 probe — temporary, removed by T-08-03"
evidence: >-
  **A1 is CLOSED FAVOURABLY, by measurement rather than inference.** The shipped Caido
  LLRT honours `detached: true`: a detached spawn's group kill reached the grandchild on
  real hardware. This is the assumption the phase's entire POSIX mechanism rests on, and
  the one no CI leg could ever reach — every leg runs Node, which honours the option
  regardless. Nine `killTree` sites are now backed by execution, not by source analysis
  of a pinned commit. Ledger entry 11's A1 half is closed.
  Second field is a separate matter — see G-02; it does NOT weaken this result.

### 2. A6 — a real provider CLI's MCP child sits in the group the kill reaches
source: 08-01-SUMMARY.md D3
expected: During a live Drift turn, `ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep` shows the `node …mcp-server.mjs` row's **pgid** equal to the **pid** of the `claude` row carrying `--mcp-config`.
result: [pending]
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
result: [pending]

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
result: [pending]
note: Previously satisfied by attestation on 2026-08-24 — `approved` with no numeric values supplied. Re-testing here to convert the attestation into a measurement and to exclude the confounder that the provider CLI may kill its own child.

### 10. The timeout path leaves no orphan either
source: 08-05-SUMMARY.md D7
expected: Let `processTimeoutSeconds` elapse instead of clicking Stop, then `pgrep -f mcp-server.mjs | wc -l` is zero. Must be reported or explicitly declared unexercised — never inferred from the cancel result.
result: [pending]

## Summary

total: 10
passed: 1
issues: 0
pending: 9
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
