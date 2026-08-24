---
phase: 08-process-lifecycle
plan: 02
subsystem: infra
tags: [process-lifecycle, process-group, taskkill, llrt, quickjs, posix, cancel, mcp-token]

requires:
  - phase: 07-provider-launch
    provides: buildSpawnPlan, the narrowed SpawnWithEnv cast whose required-member convention this plan extends, getWhichCommand's env-record precedent, and the T-04-04 diagnostics-rendering rule
  - phase: 08-process-lifecycle
    provides: "08-SPIKE.md — the NOT-RUN record whose A1/A6 verdict lines are quoted verbatim in kill-plan.ts's module header"
provides:
  - "packages/backend/src/kill-plan.ts — the pure termination-plan builder: buildKillTreePlan (refusal / win32 / POSIX arms) and shouldDetachProviderSpawn"
  - "packages/backend/src/kill-plan.test.ts — 19 unit assertions covering every arm from literal inputs, including both %SystemRoot% casings"
  - "packages/backend/src/kill-tree.posix.test.ts — the behavioural proof that a group kill takes the grandchild, paired with the control that shows it surviving without the mechanism"
  - "index.ts: the Process lifecycle (LIF-01 / LIF-02) section — isPidAlive and killTree, fire-and-forget"
  - "index.ts: detached as a REQUIRED member of SpawnWithEnv, answered at all three call sites"
  - "index.source.test.ts: the comment-stripped LLRT-trap gate over index.ts AND kill-plan.ts, plus the detached-answer and D-P4 boundary assertions"
  - "A measured killTree( occurrence count of 3 in index.ts, for plan 08-03 to assert its post-wiring count against"
affects: [08-03, 08-04, 08-05, LIF-01, LIF-02, SC-1, SC-2, SC-4, SC-5]

actuals:
  tokens: 14057
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Termination plan as a discriminated union with an explicit refusal arm that carries no argv, so a call site that forgets to switch on `kind` cannot spawn a refusal"
    - "Behavioural test paired with a falsifying control, the control written FIRST because it is what makes the proof mean anything"
    - "A static gate whose needle is an escaped RegExp, so the gate's own source text does not match the companion repo-wide scan"

key-files:
  created:
    - packages/backend/src/kill-plan.ts
    - packages/backend/src/kill-plan.test.ts
    - packages/backend/src/kill-tree.posix.test.ts
  modified:
    - packages/backend/src/index.ts
    - packages/backend/src/index.source.test.ts

key-decisions:
  - "D-01 implemented: the group kill is a SPAWN of the OS `kill` utility with [\"-TERM\",\"--\",\"-<pid>\"], never the runtime's negative-pid signalling form, which throws Underflow under Caido's LLRT while passing on every Node CI leg"
  - "OQ-2 implemented and its comment says why: killTree issues the single-pid signal on the ChildProcess handle FIRST, then spawns the group kill — explicitly as defence against assumption A1, which 08-01 left OPEN and unmeasured"
  - "OQ-4 held: cancelCliMessage keeps its synchronous Result<void> signature; killTree returns void and awaits nothing"
  - "D-P4 implemented: buildKillTreePlan takes an `env` record, not a `systemRoot` scalar, so the SystemRoot/SYSTEMROOT dual-casing fallback is asserted on the Linux runner"
  - "killTree takes `sdk` as its first parameter — index.ts holds no module-level SDK reference, so the plan's two-argument shape had no logging channel"
  - "Lifecycle error lines render the errno `code`, never `error.message`, because a spawn error message embeds the resolved file path (threat T-08-05)"
  - "The A1/A6 verdicts are written into kill-plan.ts's module header as `OPEN — not measured`, not as anything implying either was proven"

patterns-established:
  - "Escaped-needle static gate: a repo-wide scan whose in-test assertion spells the banned form as an escaped RegExp, verified in three directions (code = red, whole-line comment = green, gate does not fire against itself)"
  - "Control-first behavioural pairs: the falsifying case is written and asserted before the proof case"
  - "Placement-as-contract: a source section positioned by line number relative to a later gate's slice, with a comment saying so and deliberately NOT quoting the literals those gates match on"

requirements-completed: [LIF-01, LIF-02]

coverage:
  - id: D1
    description: "buildKillTreePlan refuses every unusable pid (undefined, NaN, 0, -1, 1.5) in the one place a test can reach, and the refusal arm exposes no file or args"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#buildKillTreePlan — the refusal arms return no-pid (SC-1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Windows argv contract — <SystemRoot>\\System32\\taskkill.exe with [/pid, <n>, /t, /f], both env casings, trailing-separator and bare-drive roots, the bare-name fallback and rung invariance — proven on the Linux runner"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#buildKillTreePlan — the win32 arm resolves taskkill by absolute path (LIF-01 / SC-1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The POSIX arm emits kill with a process-group operand for both rungs on darwin, linux and an undefined platform, and shouldDetachProviderSpawn answers false only on win32"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#buildKillTreePlan — the POSIX arm signals a process group (LIF-02 / SC-2 / CMP-01)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#shouldDetachProviderSpawn — only the provider spawn gets its own group (SC-2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "On POSIX, a detached parent plus the production plan's group-kill argv takes a grandchild down with it — and the paired control demonstrates that grandchild surviving a single-pid kill without the mechanism"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "packages/backend/src/kill-tree.posix.test.ts#POSIX process-group termination (LIF-02)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Stop button on a real Caido install terminates the provider CLI AND its token-bearing mcp-server.mjs child"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-SPIKE.md § How to run this spike later, steps 1-4"
        status: unknown
    human_judgment: true
    rationale: "The mechanism is proven under NODE only. Assumptions A1 (does the shipped Caido LLRT honour the process-group spawn option?) and A6 (does a real provider CLI keep its MCP child inside its own group?) both read OPEN — not measured in 08-SPIKE.md after the Wave-0 hardware checkpoint was waived on 2026-08-24. No CI leg executes LLRT and none spawns a real CLI binary, so nothing automated can close this. Recorded in the broken-windows ledger as entry 11."
  - id: D6
    description: "Every spawnWithEnv call site states a detached answer; exactly one detaches, and the plan builder is reached through the D-P4 injected-boundary shape"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#index.ts states a detached answer at every spawnWithEnv call site (LIF-02 / T-08-11)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The LLRT-incompatible negative-pid signalling spelling cannot re-enter index.ts or kill-plan.ts as code without a red suite on every CI leg — verified falsifiable in three directions"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#the LLRT-incompatible group-signalling spelling cannot re-enter as code (Pitfall 1)"
        status: pass
      - kind: other
        ref: "grep -rn 'process\\.kill(-' packages/backend/src --include='*.ts' | grep -vE ':[0-9]+:[[:space:]]*(//|\\*)' | wc -l = 0"
        status: pass
    human_judgment: false
  - id: D8
    description: "cancelCliMessage is still synchronous and the frontend cancel path is byte-unchanged (SC-5)"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "grep -c 'function cancelCliMessage(sdk: BackendSDK, sessionId: string): Result<void>' = 1; git diff --stat 1b3fde6 -- packages/frontend/ is empty"
        status: pass
    human_judgment: false

duration: 15 min
completed: 2026-08-24
status: complete
---

# Phase 8 Plan 02: The POSIX Tracer — a Cancel That Takes the Token With It Summary

**A cancel on macOS/Linux now group-signals the provider CLI's whole process tree, so the `mcp-server.mjs` child carrying `CAIDO_TOKEN` dies with it — proven behaviourally by a test whose control first demonstrates that grandchild surviving without the mechanism.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-24T15:09:00Z (approx, first context read)
- **Completed:** 2026-08-24T15:24:00Z
- **Tasks:** 3 of 3
- **Files created/modified:** 5 (3 created, 2 modified)

## Accomplishments

- Built `kill-plan.ts` with all three arms shipping, not prototyped: the refusal arm (SC-1's guard, in the one place a test can reach it), the win32 `taskkill` arm resolved by absolute path from either `%SystemRoot%` casing, and the POSIX arm that spawns the OS `kill` utility against a process group.
- **Deliberately did NOT use the runtime's negative-pid signalling form.** Caido's LLRT types that parameter as a Rust `u32` and rquickjs range-checks it through `f64`, so it raises an `Underflow` conversion error there while passing on every Node CI leg this repository has — and every kill site in `index.ts` wraps its call in `catch { /* already dead */ }`, so the throw would be swallowed and the orphan would survive in silence (D-01, threat T-08-06).
- Proved the mechanism behaviourally with a **control-first** pair: `"CONTROL: without detached, a single-pid kill leaves the grandchild alive"` runs before the proof and asserts the defect exists. Verified by hand that inverting the control turns the suite red, then restored it.
- Made `detached` a **required** member of `SpawnWithEnv`, so the compiler forces all three call sites to state an answer. Both Drift-owned leaf spawns say `false` (they must die with Drift); only the provider spawn detaches.
- Added the `// ── Process lifecycle (LIF-01 / LIF-02) ──` section **below** the `sendCliMessage` absolute-timeout handler, so plan 08-03's ordering gate cannot match the `killTree` declaration line instead of the statement order it exists to measure. Its own comment says so and deliberately does not quote the literals those gates match on.
- Rewired `cancelCliMessage`'s two rungs, guarding the deferred one with a liveness re-check against a pid captured **before** the timer was scheduled (Pitfall 2 / threat T-08-04). Kept the function synchronous and the frontend byte-unchanged.
- Landed the phase's most important control: a comment-stripped static gate over **both** `index.ts` and `kill-plan.ts`, with a positive companion so it cannot pass by the mechanism having been deleted. Verified falsifiable in three directions — as code it goes red, inside a whole-line comment it does not, and the gate does not fire against its own source.

## Task Commits

| Task | Name | Type | Commit |
|---|---|---|---|
| T-08-04 | End-to-end — a POSIX cancel takes the token-bearing grandchild with it | tracer | `d9d73a8` |
| T-08-05 | The unit contract for every arm of the plan builder | auto (tdd) | `7e3f2fb` |
| T-08-06 | The vehicle-independent static gates | auto | `ead2770` |

## Measurements for plan 08-03

Recorded because 08-03's gates should assert against a measured starting point rather than a guess:

| Measurement | Value |
|---|---|
| `grep -c 'killTree(' packages/backend/src/index.ts` | **3** — the declaration plus `cancelCliMessage`'s two rungs |
| Remaining `proc.kill(` sites still to route through `killTree` | **4** — `closeCliSession`, `deleteChat`, the `sendCliMessage` absolute-timeout handler, and `requestGracefulShutdown` (2 rungs). `cleanupMcpRuntime` still kills nothing at all. |
| `killTree` signature | `killTree(sdk: BackendSDK, proc: ChildProcessWithoutNullStreams, rung: KillRung): void` |
| Executed test total | **561** (534 baseline + 2 + 19 + 6), 6 skipped, zero removed |
| `packages/backend/src/index.ts` line count | 5,455 (was 5,244 at `0f0564a`) |

## Files Created/Modified

- `packages/backend/src/kill-plan.ts` — 240 lines. One import (`./platform`), zero I/O, no module state. Header carries the A1/A6 verdicts verbatim.
- `packages/backend/src/kill-plan.test.ts` — 19 assertions, every input a literal.
- `packages/backend/src/kill-tree.posix.test.ts` — 2 executed cases, runtime-built fixtures under `mkdtemp`, nothing committed.
- `packages/backend/src/index.ts` — the required `detached` member and its three answers, the Process lifecycle section, the `cancelCliMessage` rewire.
- `packages/backend/src/index.source.test.ts` — +6 assertions in two new blocks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `killTree` takes `sdk` as its first parameter**
- **Found during:** T-08-04
- **Issue:** The plan's `key_links` spell the call as `killTree(proc, "term")`, and `08-RESEARCH.md`'s glue example logs through a bare `sdk.console.log`. There is **no module-level SDK reference in `index.ts`** — every function that logs receives `sdk: BackendSDK` as its first parameter — so the two-argument shape had no logging channel and would not compile. Threat T-08-05 requires lifecycle log lines, so dropping the logging was not an option.
- **Fix:** `killTree(sdk, proc, rung)`, matching this file's universal convention. All five call sites plan 08-03 must wire (`cleanupMcpRuntime`, `closeCliSession`, `deleteChat`, the timeout handler, `requestGracefulShutdown`) already have an `sdk` in scope; `deleteChat` has it as `_sdk` and will need the underscore dropped.
- **Impact on gates:** none. `grep -c 'killTree('` is still **3**, exactly as the acceptance criterion requires.
- **Committed in:** `d9d73a8`

**2. [Rule 1 - Correctness] Lifecycle error lines render the errno code, not the error message**
- **Found during:** T-08-04
- **Issue:** `08-RESEARCH.md`'s glue example logs `e.message` on the killer's `error` event and `String(e)` in the synchronous-throw catch. A Node spawn error message embeds the **resolved file path** (`spawn taskkill.exe ENOENT`), and threat T-08-05 / rule T-04-04 forbid a path in a process-lifecycle line.
- **Fix:** the `error` handler renders `error.code` only; the catch arm renders the platform scalar only. Both stay within the "pid, exit code and platform" contract the plan's prohibitions state.
- **Committed in:** `d9d73a8`

**3. [Rule 1 - Correctness] The placement comment could not quote the literals it describes**
- **Found during:** T-08-04
- **Issue:** The plan asks the new section's comment to explain its placement relative to `}, currentSettings.processTimeoutSeconds * 1000);` and to name the `killTree(` declaration. Writing either verbatim broke its own gate: the placement criterion's `grep -n … | cut -d: -f1` returned **two** line numbers and failed with `integer expression expected`, and the occurrence count read **4** instead of 3.
- **Fix:** the comment now *describes* both — "the closing line of the setTimeout whose delay is currentSettings.processTimeoutSeconds", "the declaration of `killTree` below" — and states in a second paragraph that neither is reproduced verbatim, and why, so the next reader does not "restore" the quotation.
- **Verification:** placement check `4854 > 4578` OK; `grep -c 'killTree('` = 3.
- **Committed in:** `d9d73a8`

**4. [Rule 3 - Blocker] `vitest/expect-expect` rejected the refusal-block helper**
- **Found during:** T-08-05
- **Issue:** The five refusal cases initially shared an `expectRefusal(pid)` helper. `pnpm lint` runs at `--max-warnings 0`, and the rule cannot see assertions through a helper — five errors, blocking the task's own verify gate.
- **Fix:** converted to `it.each` over a `REFUSED` table with the assertions inline, and recorded why in the block's comment. Titles remain distinct and the `-t "no-pid"` selector still resolves the block.
- **Committed in:** `7e3f2fb`

**5. [Rule 1 - Correctness] The module header records the measured line count, not the plan's**
- **Found during:** T-08-04
- **Issue:** The plan instructs the header to use "the current measured figure of **5,240 lines**". `wc -l` at the plan's base commit `0f0564a` reports **5,244** — plan 08-01's three-line breadcrumb landed after the research measurement was taken.
- **Fix:** wrote `5,244 lines (measured at commit 0f0564a, this plan's base)`. A header that states a measurement is the one place a stale number should not be copied forward.
- **Committed in:** `d9d73a8`

---

**Total deviations:** 5 auto-fixed (2 × Rule 3 blocker, 3 × Rule 1 correctness). **Impact:** no scope change. Four were forced by gates or by the compiler; the fifth corrects a measurement. Nothing in the plan's `must_haves` was weakened.

## TDD Gate Compliance

T-08-05 carries `tdd="true"`, and its gate order is **inverted by the plan's own design**: the tracer task T-08-04 ships `kill-plan.ts` complete (`feat`, `d9d73a8`) before T-08-05 writes its unit contract (`test`, `7e3f2fb`). RED-before-GREEN was therefore not achievable — the implementation is the tracer's deliverable, and a "failing first" test would have required deferring the tracer, which is the one thing a tracer-first plan must not do.

Recorded rather than papered over. The unit contract is nonetheless genuinely falsifying: it asserts nine distinct win32 behaviours, five refusal shapes across eight platform/rung combinations, and both POSIX rungs across three platforms — none of which the tracer's single behavioural pair reaches.

The tracer feedback gate itself was honoured: `kill-tree.posix.test.ts` was re-run end-to-end after `d9d73a8` and passed 2/2 before any expansion task started.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run packages/backend/src/kill-tree.posix.test.ts` | 2 passed, 0 pending |
| `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | 19 passed, 0 pending |
| `pnpm exec vitest run packages/backend/src/kill-plan.test.ts -t "no-pid"` | 5 passed, 14 filtered |
| `pnpm exec vitest run packages/backend/src/index.source.test.ts` | 18 passed, 0 pending |
| `pnpm exec vitest run` | 555 passed, 6 skipped (561 total) — grown from 534, **zero removed** |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `grep -rn 'process\.kill(-' packages/backend/src --include='*.ts' \| grep -vE ':[0-9]+:[[:space:]]*(//\|\*)' \| wc -l` | 0 |
| `grep -rn 'shell: *true' packages/ --include='*.ts' \| wc -l` | 0 (shipped Phase 7 gate, re-run) |
| `git diff --stat 1b3fde6 -- packages/frontend/` | empty (SC-5 tripwire) |
| Control falsifiability (invert → red, restore → green) | verified by hand |
| Gate falsifiability, all three directions | verified by hand |

## Known Stubs

None. No placeholder value, no hardcoded empty return and no unwired data path was introduced.

The `describe.skipIf(process.platform === "win32")` on `kill-tree.posix.test.ts` is a deliberate platform gate specified by the plan, not a skipped test: the file asserts POSIX process-group semantics that do not exist on Windows, and the win32 evidence is plan 08-04's separate suite. The 6 skips in the full-suite total are the pre-existing `spawn-plan.win32.test.ts` cases.

## Issues Encountered

**LIF-02 is closed on the Node vehicle, not on the runtime users actually run.** This is not a defect in the work; it is the risk plan 08-01 was sequenced to retire and did not.

- **A1 — OPEN, not measured.** Whether the shipped Caido LLRT honours the process-group spawn option is unverified on any real install. The POSIX arm rests on source analysis of `caido/dependency-llrt@caido a5b021c` and on nothing that was ever executed. If the shipped fork differs, the group operand names a group that was never created — and **every CI leg stays green while it happens**, because every leg runs Node and Node honours the option.
- **A6 — OPEN, not measured.** If any provider CLI calls `setsid()` on its own MCP child, the group signal misses it.
- **Mitigation in place, and now visibly load-bearing:** OQ-2's single-pid rung ships, first, with a comment naming A1 as the reason and instructing future readers not to delete it. It degrades a total regression into the partial one that ships today; it does not prevent one.
- Recorded in the broken-windows ledger as entry **11** (`unmet-truth`). The four-step closing procedure remains runnable in `08-SPIKE.md`; the probe is recoverable at `68199fa`.

**One marked correction is owed to `08-VALIDATION.md`.** Its LLRT-trap row seeds a raw `grep` with no comment filter. That spelling is wrong: `kill-plan.ts`'s POSIX branch and `index.ts`'s tree-kill comment both quote the banned form verbatim, by house rule, so a raw grep goes red against the very comments that prevent the defect. The in-test comment-stripped form is the primary gate and the shell scan is its comment-filtered companion. Plan 08-05 task T-08-13 owns recording this.

## Next Phase Readiness

`08-03` is unblocked. It inherits:

- `killTree(sdk, proc, rung)` and `isPidAlive(pid)`, both declared **below** the `sendCliMessage` timeout handler, so its SC-4 ordering gate slices cleanly.
- A measured `killTree(` count of **3**, four remaining `proc.kill(` sites to route, and `cleanupMcpRuntime` still killing nothing.
- A `deleteChat` whose SDK parameter is still spelled `_sdk` and will need the underscore dropped when it starts logging through `killTree`.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-24*

## Self-Check: PASSED

- All created files verified present on disk (`kill-plan.ts`, `kill-plan.test.ts`, `kill-tree.posix.test.ts`)
- All three task commits verified in git log (`d9d73a8`, `7e3f2fb`, `ead2770`)
- Every task `<acceptance_criteria>` re-run at final state; all pass
- Plan-level `<verification>` block re-run at final state; all pass
- Both falsifiability criteria (the control, and the gate in three directions) verified by hand and reverted
