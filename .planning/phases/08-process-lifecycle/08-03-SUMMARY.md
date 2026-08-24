---
phase: 08-process-lifecycle
plan: 03
subsystem: infra
tags: [process-lifecycle, sc-4, kill-before-sweep, taskkill, mcp-token, source-gate, lif-01, lif-02]

requires:
  - phase: 08-process-lifecycle
    provides: "killTree(sdk, proc, rung) and isPidAlive from plan 08-02, plus the measured killTree( baseline of 3"
  - phase: 07-provider-launch
    provides: "the two LIF-01 SEAM markers this plan resolves, and buildSpawnPlan's win32 interpreter branch that the second marker describes"
provides:
  - "index.ts: all eight in-scope termination sites routed through killTree, with kill-before-removal ordering at the three removal sites"
  - "index.ts: cleanupMcpRuntime's activeProcesses kill loop — the seam Phase 7 marked and left open, now closed by code"
  - "index.ts: the sendCliMessage provider-spawn resolution note naming the /t ParentProcessId walk and the accepted AR-01 residual"
  - "index.source.test.ts: functionBody(source, name) — the first statement-ORDER scanner over index.ts in this repository"
  - "index.source.test.ts: the SC-4 ordering gate (3 sites), the timeout-handler ordering gate, and the termination call-site census"
  - "A measured census for plan 08-05's validation-map fill: killTree( = 9, function killTree( = 1, proc.kill( = 3, child.kill( = 1"
affects: [08-04, 08-05, LIF-01, LIF-02, SC-4, SC-5]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Statement-position assertion over unimportable source: a brace-balanced body slice that skips the parameter list by balancing PARENTHESES first, so an inline object-type parameter cannot be mistaken for the function body"
    - "Non-vacuity guards as part of the assertion rather than decoration: every slice-based gate asserts its own slice is non-empty and contains both needles before comparing their positions"
    - "Seam resolution rather than seam deletion: a marker whose substance needed no code is rewritten into a resolution note naming the mechanism and the residual, with a greppable token floor that a silent deletion cannot satisfy"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts
    - packages/backend/src/index.source.test.ts

key-decisions:
  - "D-P1 implemented as recorded: the ordering gate is an in-test functionBody helper, with the line-number-derived shell slice kept as an independent second read rather than as the primary control"
  - "The functionBody scanner must balance the PARAMETER LIST before looking for the body brace — measured: without it, closeCliSession returns a 19-character 'body' (its `input: { sessionId: string }` type literal) and every ordering assertion below it passes on nothing"
  - "Pitfall 10 held: in the timeout handler only the kill moved; finalize's declaration is byte-unchanged, verified by a zero-hit diff against 08-02's close"
  - "Pitfall 4 recorded in source at requestGracefulShutdown: on POSIX the two rungs are different signals to the group, on win32 both build the identical forceful plan so the second is a deliberate re-issue — do not delete it and do not restore a direct handle signal"
  - "The requestGracefulShutdown deferred rung's liveness guard runs BEFORE its debug-log line, so the log cannot claim a signal that was never sent"
  - "Block 1 is unrolled into three named assertions rather than an it.each table, so `functionBody(code,` appears at the site a reader greps for and every assertion stays inline for vitest/expect-expect"

requirements-completed: [LIF-01, LIF-02]

coverage:
  - id: D1
    description: "In cleanupMcpRuntime, closeCliSession and deleteChat the kill statement precedes every removal — a token-bearing process dies before the files that carried its token are deleted (SC-4, threats T-08-01 / T-08-12)"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#index.ts kills every tracked tree before it removes the files that carried its token (SC-4)"
        status: pass
      - kind: other
        ref: "awk '/^(async )?function <name>/,/^}/' packages/backend/src/index.ts | grep -n 'killTree(\\|rm(' | head -1 names killTree( at all three sites"
        status: pass
    human_judgment: false
  - id: D2
    description: "The absolute-timeout handler kills before it finalizes, with finalize's declaration untouched (Pitfall 10 — moving finalize hits its temporal dead zone)"
    requirement: LIF-01
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#index.ts kills before it finalizes a timed-out turn (SC-4 / Pitfall 10)"
        status: pass
      - kind: other
        ref: "git diff -U0 ead2770 -- packages/backend/src/index.ts | grep -c '^[-+].*const finalize =' = 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "cleanupMcpRuntime terminates every entry in activeProcesses before the temp directory is removed — closing the seam Phase 7 marked, and covering the startMcpServer failure path as well as the Stop button"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#cleanupMcpRuntime terminates every tracked pid before the temp dir goes"
        status: pass
      - kind: other
        ref: "grep -c 'activeProcesses.entries()' packages/backend/src/index.ts = 1; grep -c 'await killTree' = 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both Phase 7 LIF-01 SEAM markers are resolved rather than deleted — one by an implementation, one by a resolution note naming the /t ParentProcessId walk and the accepted AR-01 residual (threat T-08-14)"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "grep -c 'LIF-01 SEAM' = 0 (baseline 2); grep -c 'NOT acted on' = 0 (baseline 2); grep -c 'LIF-01' = 8 (floor 5); grep -c 'ParentProcessId' = 1 (baseline 0); grep -c 'AR-01' = 1 (baseline 0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every in-scope termination site routes through killTree and the count is pinned to an exact, human-reviewed number, with the three out-of-scope leaf sites still countable as direct handle signals"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#index.ts pins every process-termination site to a counted inventory (LIF-01 / LIF-02)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The deferred rung in requestGracefulShutdown re-checks liveness against a pid captured before the timer was scheduled, so a reassigned pid is never terminated (threat T-08-04)"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "grep -c 'isPidAlive(' packages/backend/src/index.ts = 3 — the declaration plus both deferred rungs"
        status: pass
    human_judgment: false
  - id: D7
    description: "POSIX cancel and timeout semantics visible to the user are unchanged (SC-5)"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "git diff --stat 1b3fde6 -- packages/frontend/src/views/ChatView.cancel.test.ts packages/frontend/src/views/ChatView.vue is empty"
        status: pass
    human_judgment: false
  - id: D8
    description: "The whole termination mechanism works on the runtime users actually run (Caido's LLRT), not only on the Node vehicle every CI leg executes"
    requirement: LIF-02
    verification:
      - kind: manual_procedural
        ref: "08-SPIKE.md § How to run this spike later, steps 1-4"
        status: unknown
    human_judgment: true
    rationale: "Inherited unchanged from 08-02 and NOT closed by this plan. Assumptions A1 (does the shipped Caido LLRT honour the process-group spawn option?) and A6 (does a real provider CLI keep its MCP child inside its own group?) both read OPEN — not measured in 08-SPIKE.md after the Wave-0 hardware checkpoint was waived. This plan multiplies the number of sites that depend on those assumptions from two to nine; it does not make any of them measured. Broken-windows ledger entry 11."

duration: 12 min
completed: 2026-08-24
status: complete
---

# Phase 8 Plan 03: Kill Before Sweep — Every Termination Site, and the Ordering That Makes It a Control Summary

**All eight in-scope termination sites now route through `killTree`, and at the three sites that remove a token-bearing file the kill statement provably precedes the removal — asserted by a new statement-position scanner that runs on every CI leg and corroborated by an independent shell read.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-24T17:26:00Z
- **Completed:** 2026-08-24T17:38:00Z
- **Tasks:** 3 of 3
- **Files modified:** 2

## Accomplishments

- **Closed SC-4, the security-relevant half of this phase.** `cleanupMcpRuntime`, `closeCliSession` and `deleteChat` each remove files that carried `CAIDO_TOKEN` into a child's environment. All three now terminate the tracked tree first. The source says why at each site, in the same words: deleting a token-bearing file is not revocation — it destroys the forensic trail (which pid, which session, which policy) while leaving the capability intact, because the token is in the process's memory rather than in the file it arrived through.
- **Acted on the seam Phase 7 marked and deliberately left open.** `cleanupMcpRuntime` previously killed *nothing at all* — it carried a comment saying in as many words that the statement order was unchanged and no termination was added. It now loops `activeProcesses.entries()` and force-kills every entry before the temp directory is swept. This is load-bearing on more than the Stop button: `startMcpServer`'s own failure path reaches the same function (threat T-08-12), which is why the fix lives there rather than at the button.
- **Resolved the second seam without deleting it.** The `sendCliMessage` provider-spawn marker recorded that Windows' interpreter branch inserts a `cmd.exe` level. Its substance IS resolved by this phase — `taskkill /t` walks the `ParentProcessId` relation recursively, so the extra level costs the mechanism nothing — which is exactly why no code at that site changed. The marker became a resolution note naming the mechanism, the one thing the walk cannot reach (a grandchild whose intermediate parent already exited), and the owner of that residual: accepted as `08-SECURITY.md` AR-01, because the correct primitive is a Windows Job Object that neither LLRT nor Node exposes without a banned native addon.
- **Kept the two-rung ladder on both platforms and said why in the source.** At `requestGracefulShutdown`, Pitfall 4 is recorded at the site: on POSIX the rungs are genuinely different signals to the group; on win32 both build the identical forceful plan, so the second rung is a deliberate re-issue rather than an inert repeat. A later reader is told neither to delete it nor to "restore symmetry" with a direct handle signal that LLRT renders inert.
- **Moved the kill and left `finalize` alone.** In the absolute-timeout handler only two statements swapped. `finalize`'s declaration is byte-unchanged — verified by a zero-hit diff — because it is a `const` arrow declared lower in the same promise executor and hoisting it throws a `ReferenceError` synchronously inside the executor, a bug this file already recorded once at the spawn guard.
- **Built the repository's first statement-ORDER scanner over `index.ts`.** `functionBody(source, name)` returns a brace-balanced body slice. Its non-obvious step is that it balances the *parameter list* first: several declarations take an inline object type, and without that step `closeCliSession` returns a 19-character "body" (its `input: { sessionId: string }` literal) beneath which every ordering assertion passes on nothing.
- **Made the gate falsifiable and proved it three ways by hand.** Moving `cleanupMcpRuntime`'s kill loop below the sweep turns the suite red; renaming a site so the declaration is not found turns it red rather than passing vacuously; replacing Block 2's end anchor with the bare unanchored identifier turns it red on the `endIdx > startIdx` and non-empty-slice guards instead of sliding through on an empty string. Each was verified and reverted.

## Task Commits

| Task | Name | Type | Commit |
|---|---|---|---|
| T-08-07 | Route the four remaining session-level kill sites through `killTree`, kill-before-sweep | auto | `76a863c` |
| T-08-08 | Resolve BOTH `LIF-01 SEAM` markers — `cleanupMcpRuntime` kills every tracked pid before the sweep | auto | `242ac9a` |
| T-08-09 | The ordering gate and the call-site census | auto | `6e14e9f` |

## Measured census — the numbers the gate now pins

Recorded here (as the plan's `<output>` requires) so plan 08-05's validation-map fill cites measurements rather than estimates. Counts are over the **comment-stripped** source, which is what the in-test census reads.

| Measurement | Value | Enumeration |
|---|---|---|
| `killTree(` | **9** | 1 declaration + 8 call sites |
| `function killTree(` | **1** | the single declaration |
| `proc.kill(` | **3** | `callMcpMethod`'s two rungs (leaf, no tree) + `killTree`'s own single-pid rung (OQ-2's A1 defence) |
| `child.kill(` | **1** | `resolveCommand`'s PATH-search timeout — a leaf with no tree |

The eight `killTree` call sites: `deleteChat` 1, the `sendCliMessage` absolute timeout 1, `requestGracefulShutdown` 2, `cancelCliMessage` 2, `closeCliSession` 1, `cleanupMcpRuntime` 1.

Marker and literal counts in `index.ts`:

| Literal | Before | After |
|---|---|---|
| `LIF-01 SEAM` | 2 | **0** |
| `NOT acted on` | 2 | **0** |
| `LIF-01` | 4 | **8** (floor is 5) |
| `ParentProcessId` | 0 | **1** |
| `AR-01` | 0 | **1** |
| `await killTree` | 0 | **0** |
| `isPidAlive(` | 3 | **3** |

Other: `index.ts` is 5,563 lines (was 5,455 at 08-02's close). Suite total **569** (555 → 563 passing, 6 skipped unchanged), grown from 561 with **zero tests removed** (CMP-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Every `killTree` acceptance-criterion literal carries `sdk` as a first argument**
- **Found during:** T-08-07
- **Issue:** The plan's criteria spell the counts as `grep -c 'killTree(proc, "kill")'` and `grep -c 'killTree(proc, "term")'`. Plan 08-02 shipped the function as `killTree(sdk, proc, rung)` — its deviation 1 — because `index.ts` holds no module-level SDK reference and the two-argument shape had no channel for the T-08-05 log lines. Both criteria would have measured `0` against correct code.
- **Fix:** the criteria were read as `killTree(sdk, proc, "kill")` and `killTree(sdk, proc, "term")`. **The numbers were not relaxed**: `5` and `2` were measured and met exactly, and `isPidAlive(` measured `3` as written.
- **Verification:** `grep -c 'killTree(sdk, proc, "kill")'` = 5; `grep -c 'killTree(sdk, proc, "term")'` = 2.
- **Commit:** `76a863c`

**2. [Rule 3 - Blocker] `deleteChat`'s SDK parameter was `_sdk` and had to be unpicked**
- **Found during:** T-08-07
- **Issue:** `async function deleteChat(_sdk: BackendSDK, …)` — the underscore marks it deliberately unused, and `noUnusedLocals` plus `--max-warnings 0` make the mismatch a hard failure the moment the site starts logging through `killTree`. Anticipated by 08-02's summary.
- **Fix:** renamed to `sdk`. No caller changes (parameter name only).
- **Commit:** `76a863c`

**3. [Rule 1 - Bug] The `functionBody` scanner must balance the parameter list before it looks for the body brace**
- **Found during:** T-08-09
- **Issue:** The plan specifies "the first `{` after the parameter list". Implemented literally as *the first `{` after the declaration*, the scanner stops on an inline object-type parameter instead. Measured against the real file: `closeCliSession` returned a **19-character** body (`{ sessionId: string }`) and `sendCliMessage` a **131-character** one — under which `indexOf("killTree(")` and `indexOf("rm(")` both return `-1` and every ordering assertion is vacuously satisfiable. This is precisely the vacuous-pass class the plan spends Block 2 guarding against, arriving through the helper instead of through the anchor.
- **Fix:** the helper balances **parentheses** from the declaration's own `(` first, then takes the first `{` after the closing paren. Measured after the fix: 593 / 988 / 912 / 33,753 characters for the four bodies, with the expected needles present. The reason is written into the helper's comment with the measured 19-character figure, so a later "simplification" back to the naive form is visibly a regression.
- **Verification:** the empty-body guard was confirmed falsifiable by renaming a site — red, not a vacuous pass.
- **Commit:** `6e14e9f`

**4. [Rule 3 - Blocker] Block 1 is three unrolled assertions, not an `it.each` table**
- **Found during:** T-08-09
- **Issue:** Written as `it.each(SITES)` the block calls the helper once, so the acceptance criterion `grep -c 'functionBody(code,' >= 4` measured **2** against a correct and passing gate.
- **Fix:** unrolled into three named `it` blocks, each naming its site at the call to `functionBody`. Measured `4`. This is also the form the criterion was clearly written for, and it keeps every assertion inline where `vitest/expect-expect` can see it — the same lint constraint that forced 08-02's deviation 4.
- **Commit:** `6e14e9f`

**5. [Rule 1 - Correctness] The deferred rung's liveness guard runs before its debug-log line, not after**
- **Found during:** T-08-07
- **Issue:** The plan says to keep both `appendSessionDebugLog` lines and to guard the deferred rung with `isPidAlive`. Written in the plan's literal statement order, the `"requestGracefulShutdown(): SIGKILL"` line emits and *then* the guard returns — so the one artifact a Windows user can send back would claim a signal that was never sent, on exactly the path where knowing whether it was sent is the question.
- **Fix:** guard first, log second. Both lines are kept, as required; only their order relative to the guard changed. The reason is recorded at the site.
- **Commit:** `76a863c`

---

**Total deviations:** 5 auto-fixed (3 × Rule 3 blocker, 2 × Rule 1 correctness). **Impact:** no scope change and no criterion relaxed. Deviations 1, 2 and 4 are gate/compiler literals corrected against measured reality; 3 and 5 are real defects caught inside this plan's own work — one of which would have made the phase's central ordering gate unfalsifiable.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` | 563 passed, 6 skipped (**569** total), grown from 561, zero removed |
| `pnpm exec vitest run packages/backend/src/index.source.test.ts` | 26 passed, 0 pending (was 18) |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `awk` shell read, `cleanupMcpRuntime` | first match is `killTree(` (line 35 of the slice) |
| `awk` shell read, `closeCliSession` | first match is `killTree(` (line 21) |
| `awk` shell read, `deleteChat` | first match is `killTree(` (line 22) |
| Timeout-handler shell read (line-number-derived slice, `s=4583 e=4602`) | first match is `killTree(` |
| `grep -c 'LIF-01 SEAM'` | 0 (baseline 2) |
| `grep -c 'LIF-01'` | 8 (floor 5) |
| `grep -c 'ParentProcessId'` / `AR-01` | 1 / 1 (baseline 0 / 0) |
| `grep -c 'NOT acted on'` | 0 (baseline 2) |
| `grep -c 'await killTree'` | 0 |
| `grep -c 'const finalize = (result: Result<SendCliMessageOutput>) => {'` | 1 |
| `git diff -U0 ead2770 -- index.ts \| grep -c '^[-+].*const finalize ='` | 0 — declaration byte-unchanged |
| `grep -rn 'process\.kill(-' … \| grep -vE '…' \| wc -l` | 0 |
| `grep -rn 'shell: *true' packages/ --include='*.ts' \| wc -l` | 0 |
| `git diff --stat 1b3fde6 -- ChatView.cancel.test.ts ChatView.vue` | empty (SC-5 tripwire) |
| Falsifiability: kill loop moved below the sweep | red — `cleanupMcpRuntime terminates before it removes` fails |
| Falsifiability: site renamed in the assertion | red — fails loudly, does not pass vacuously |
| Falsifiability: Block 2 end anchor unanchored | red on both the guard test and the ordering test |

## Known Stubs

None. No placeholder value, no hardcoded empty return and no unwired data path was introduced.

## Issues Encountered

**A1 and A6 remain OPEN, and this plan raised the stake on them.** Plan 08-01's Wave-0 spike was waived without being run, so it is still unmeasured whether the shipped Caido LLRT honours the process-group spawn option (A1) and whether a real provider CLI keeps its MCP child inside its own group (A6). Plan 08-02 closed LIF-02 on the Node vehicle only. This plan took the number of sites depending on those two assumptions from **two to nine** — which is the right thing to do (the alternative is seven sites that provably leak) but it does mean a negative A1 verdict is now a nine-site regression on POSIX rather than a two-site one.

- **Mitigation in place and untouched:** OQ-2's single-pid rung inside `killTree` still fires first at every one of the nine, and the census asserts it is still there (`proc.kill(` = 3, with the comment naming A1 as the reason). It degrades a total regression into today's partial one; it does not prevent one.
- Already recorded in the broken-windows ledger as entry **11** (`unmet-truth`). No new ledger entry was opened — this is the same open item, not a new one.
- The four-step closing procedure remains runnable in `08-SPIKE.md`.

**Windows evidence is still plan 08-04's.** Nothing in this plan executed a `taskkill`. The `/t` recursion claim in the new `sendCliMessage` resolution note is vendor documentation plus source analysis, and the dead-intermediate-parent residual it names is explicitly tagged `ASSUMED — community/issue-tracker evidence only` at the site, per assumption A3.

## Next Phase Readiness

`08-05` is unblocked and inherits the measured census above for its validation-map fill. `08-04` runs in the same wave against disjoint files (`files_modified` do not intersect), and this plan's suite-total criterion was deliberately written as `>=` rather than `=` so the two can land in either order.

Two things 08-05 should carry forward:

1. The marked correction 08-02 owed `08-VALIDATION.md` (its LLRT-trap row seeds a raw `grep` with no comment filter) is still owed — T-08-13.
2. `08-SECURITY.md` AR-01 is now referenced **from the source** at `sendCliMessage`'s provider-spawn block. Plan 08-05 must actually create that entry, or the code points at a document section that does not exist.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-24*

## Self-Check: PASSED

- Both modified files verified present on disk and staged in their task commits
- All three task commits verified in `git log` (`76a863c`, `242ac9a`, `6e14e9f`)
- Every task `<acceptance_criteria>` re-run at final state; all pass (with the three literal corrections recorded as deviations 1, 2 and 4 — no number relaxed)
- Plan-level `<verification>` block re-run at final state; all pass
- All three falsifiability criteria verified by hand and reverted; working tree confirmed clean after each revert
