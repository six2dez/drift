---
phase: 08-process-lifecycle
plan: 07
subsystem: infra
tags: [process-lifecycle, orphan-reap, pgrep, idle-gate, caido-token, source-gates, quickjs]

# Dependency graph
requires:
  - phase: 08-process-lifecycle (plan 08-06)
    provides: "buildPreviousRunOrphanScanPlan with its session-active refusal, buildSessionOrphanScanPlan, reapMcpOrphans as a reusable I/O boundary, getMcpSessionDirName, MCP_TEMP_DIR_PREFIX"
provides:
  - "shouldReapSessionOrphans — the idle gate as a pure predicate, exact-zero on both injected scalars, unit-asserted from literals"
  - "mcpDirectCallDepth — one increment after callMcpMethod's direct spawn, one guarded release called from both close and error"
  - "reapSessionOrphansIfIdle — a void, non-awaiting reap callable from a synchronous Result<void> handler (OQ-4 intact)"
  - "The previous-run reap inside sweepOrphanedMcpTempDirs, above every rm — AR-02 / recorded decision OQ-3 closed for the measured case"
  - "Four idle-gated session reap sites: deleteChat, sendCliMessage's finalize, cancelCliMessage, closeCliSession"
  - "Six executed source gates over index.ts wiring, each with a red input constructed and confirmed red"
affects: [08-10-PLAN (AR-04, AR-05, AR-07, verdict-gate.sh), 08-UAT (multi-session cancel), phase-09, phase-10]

actuals:
  tokens: 8682    # chars/4 over the realized diff (34,728 changed chars across 4 files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []   # no dependency added; pgrep is a base-system utility
  patterns:
    - "Depth counter instead of a pid exclusion list, chosen because a counter cannot go stale in the dangerous direction"
    - "Census by ENCLOSING FUNCTION NAME plus a sum-versus-total guard, rather than a whole-file count that any redistribution satisfies"
    - "A rejected gate recorded inline at the site that would have carried it, with the reason it is coincidence-shaped"

key-files:
  created: []
  modified:
    - packages/backend/src/kill-plan.ts
    - packages/backend/src/kill-plan.test.ts
    - packages/backend/src/index.ts
    - packages/backend/src/index.source.test.ts

key-decisions:
  - "The idle gate is a SCOPE decision, not a constraint, and the source says so. `claude-cli` and `copilot-cli` take an args array Drift authors itself, so a per-chat argv token would make the scan session-precise for them; delivering it forks the plan into two mechanisms and is recorded as AR-07 rather than half-built here."
  - "A depth COUNTER, not a pid exclusion list, excludes Drift's own self-test. A stale pid in a list shields a genuine orphan that reused the number — T-08-04 pointed the wrong way. A counter that fails to release SUPPRESSES the reap instead."
  - "The release fires from `close` and `error`, ABOVE the settled guard, and never at the settle paths. The counter measures the PROCESS's end, not the promise's: `finish()` settles and only then asks the child to exit."
  - "One previous-run scan for the whole sweep, not one per directory — the class pattern reaches an orphan whose directory a previous sweep already removed, which is AR-02 in its purest form."
  - "`getMcpSessionDirName()` is passed to the previous-run builder as a GUARD: the builder refuses with `session-active` when it is defined, so moving the call below the `mcpTempDir` assignment stops the scan rather than pointing it at the live session's child."
  - "The count-equality gate (`activeProcesses.delete(` == `reapSessionOrphansIfIdle(`) stays rejected and the rejection is recorded inline at the census that replaced it."

patterns-established:
  - "Every gate authored in this plan had its red input CONSTRUCTED and run; seven mutations, seven single-test failures, all restored. The table is in this SUMMARY."
  - "Where a shared source scanner is wrong for a new site, write a local slice with its own non-vacuity guards rather than widening the scanner every existing gate depends on."

requirements-completed: [LIF-02, LIF-01]

coverage:
  - id: D1
    description: "The idle gate opens only on a pair of exact zeros; a live session, a live direct MCP call, a negative count or a non-integer on either scalar all refuse"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#shouldReapSessionOrphans — only a pair of exact zeros opens the idle gate (T-08-27 / T-08-28) (5 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reap boundary is called from exactly three functions and the idle reap from exactly four, with cleanupMcpRuntime holding zero idle reaps; no call exists in an unenumerated function"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#calls the reap boundary from exactly the three functions that own a reap"
        status: pass
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#calls the idle reap from exactly the four session sites, and never from cleanup"
        status: pass
    human_judgment: false
  - id: D3
    description: "The start-up reap is issued above every rm in sweepOrphanedMcpTempDirs, and is handed the session dir name as a session-active guard"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#sweepOrphanedMcpTempDirs kills previous-run orphans before it removes any directory"
        status: pass
    human_judgment: false
  - id: D4
    description: "The teardown reap and the killTree loop both precede every rm in cleanupMcpRuntime"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#cleanupMcpRuntime reaps before it removes the temp dir, alongside the kill loop"
        status: pass
    human_judgment: false
  - id: D5
    description: "Neither reap is ever awaited, both are still called, and cancelCliMessage keeps its synchronous Result<void> declaration (OQ-4)"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#never awaits either reap, and still calls both"
        status: pass
      - kind: other
        ref: "grep -c 'function cancelCliMessage(sdk: BackendSDK, sessionId: string): Result<void>' packages/backend/src/index.ts = 1"
        status: pass
    human_judgment: false
  - id: D6
    description: "The direct-call depth has exactly one increment and one release, the increment sits inside callMcpMethod, and the release is called from both handlers"
    requirement: LIF-02
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#increments and releases the direct-call depth exactly once each, inside callMcpMethod"
        status: pass
    human_judgment: false
  - id: D7
    description: "The drift-mcp- prefix has one spelling in index.ts — the shared constant — with the single surviving prose occurrence enumerated by content"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "packages/backend/src/index.source.test.ts#spells the temp-dir prefix once, through the shared constant"
        status: pass
    human_judgment: false
  - id: D8
    description: "A previous-run MCP orphan actually dies at the next MCP start on a real Caido install, and the idle reap actually terminates the cancel orphan"
    requirement: LIF-02
    verification: []
    human_judgment: true
    rationale: "`index.ts` cannot be imported under vitest, so every claim above is about SOURCE TEXT — statement position, call-site presence, absence of `await`. Nothing here executes `reapMcpOrphans` against a real orphan; 08-06's `orphan-reap.posix.test.ts` proves the scan/parse/kill path under Node, not under Caido's LLRT. Whether Caido's plugin sandbox can spawn `pgrep` at all remains UNMEASURED (08-06 residual, still open): if it cannot, both reaps degrade silently to the `enumerator-unavailable` no-op and every gate in this plan stays green. Needs a real Caido install."

# Metrics
duration: 12 min
completed: 2026-08-27
status: complete
---

# Phase 8 Plan 07: Idle-Gated and Previous-Run Orphan Reap Summary

**The reap 08-06 wired at one site now reaches the two orphan classes that matter to the reported bug: a previous run's token-bearing `mcp-server.mjs` dies at the next MCP start before the directories that fed it are removed, and a cancel, close, chat deletion or turn completion that leaves Drift idle reaps the session's MCP children by argv rather than through the process group UAT measured unreliable — with six executed source gates over the wiring, every one of them falsified against a constructed red input.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-27T12:15:00Z
- **Completed:** 2026-08-27T12:27:27Z
- **Tasks:** 3
- **Files modified:** 4 (0 created; 622 insertions, 6 deletions)

## Accomplishments

- **AR-02 / recorded decision OQ-3 closed for the case it was deferred on.** `sweepOrphanedMcpTempDirs` had never touched a process. It now issues one class-wide previous-run reap above every `rm()`, so a hard-killed Caido's surviving MCP server dies while the env-source documents that named it are still on disk. OQ-3's blast-radius objection ("image-name matching that could terminate an unrelated `node`") is answered rather than waived: the pattern requires the `drift-mcp-` prefix, an 8-to-64 lowercase-hex token, a separator and `mcp-server.mjs`, all adjacent on one command line.
- **One scan for the whole sweep, and the reason is reach, not economy.** The class pattern finds an orphan whose directory a PREVIOUS sweep already removed — AR-02 in its purest form, where a per-directory scan has nothing left to iterate over.
- **The cancel orphan closed without A6.** `reapSessionOrphansIfIdle` is wired at all four `activeProcesses.delete` sites outside `cleanupMcpRuntime`, each placed AFTER the deletion so the gate reads the post-deletion count. `cancelCliMessage` keeps its exact declaration, its synchronous `Result<void>` and its user-visible semantics; `await reapSessionOrphansIfIdle` is gated at zero across the comment-stripped source.
- **Drift's own self-test is excluded by a counter, not a list.** `mcpDirectCallDepth` increments once immediately after `callMcpMethod`'s direct spawn returns, and releases once from a guarded helper called by both the `close` and the `error` handler — ABOVE `close`'s `settled` early return, so a child whose promise the timeout arm already settled still returns its depth. A release that never runs suppresses the reap; it cannot enable a wrong kill.
- **Six source gates, seven red inputs, all confirmed.** The census is by enclosing function name with a sum-versus-total guard for unnamed functions, so a redistribution of the same number of calls across the wrong functions fails. See the Gate Non-Vacuity table.
- **Tests 642 → 654** (645 passed, 9 skipped). `index.source.test.ts` 44 → 51; `kill-plan.test.ts` 62 → 67. Zero removed, zero relaxed. `killTree(` census unmoved at 9, as the plan required.

## Task Commits

1. **Task 1: Kill before removing at start-up — the previous-run orphan** — `11b70be` (feat)
2. **Task 2: Idle-gated reap at cancel, close, delete and timeout** — `cfb4409` (feat)
3. **Task 3: Static gates — the census, both orderings, and the fire-and-forget guarantee** — `b6965f8` (test)

## Files Modified

- `packages/backend/src/kill-plan.ts` — `shouldReapSessionOrphans`, placed beside `hasTrackedProcessExited` and `shouldDetachProviderSpawn` because it is the same kind of thing: one decision from injected scalars, living outside `index.ts` so a test can reach it. Its header carries the argv correction and names AR-07 / T-08-50 at the predicate that creates the gap. Still zero I/O, still one import.
- `packages/backend/src/kill-plan.test.ts` — 5 new cases (62 → 67), insertions only.
- `packages/backend/src/index.ts` — `mcpDirectCallDepth`, the increment and guarded release inside `callMcpMethod`, `reapSessionOrphansIfIdle`, the previous-run reap inside `sweepOrphanedMcpTempDirs`, four idle-reap call sites, the `buildPreviousRunOrphanScanPlan` / `shouldReapSessionOrphans` imports, and a rewritten sweep header.
- `packages/backend/src/index.source.test.ts` — 7 new cases (44 → 51) across six numbered gates, plus one local `topLevelDeclarationSlice` helper.

## Decisions Made

See `key-decisions` in the frontmatter. Three are worth restating because they constrain later work:

- **The idle gate's narrowing is written down at the predicate, not just in the plan.** `shouldReapSessionOrphans`'s header states the argv correction explicitly — that for `claude-cli` and `copilot-cli` Drift authors the `args` array itself, so a per-chat token WOULD make the scan session-precise for those two — and then states that not delivering it is a scope decision recorded as AR-07 and T-08-50. A reader of the predicate sees the gap rather than inferring completeness. The plan was emphatic that the false unqualified claim must not be written, and it is not: the source names `gemini-cli`, `codex-cli` and the self-test spawn as the cases where the claim genuinely holds.
- **The release site is `close`/`error` and never the settle paths.** `finish()` settles the promise and only THEN asks the child to exit, and the timeout arm settles while the child is still being SIGKILLed. Releasing at either would open the idle gate on a process still in the table and still matching the reaper's argv pattern.
- **The rejected count-equality gate is recorded inline at the census that replaced it,** with the measured reason (`5 == 5` over two different populations; a legitimate `activeProcesses.delete(` added inside `cleanupMcpRuntime` would turn it red for a correct change). It should not be reinstated because it looks tidier.

## Deviations from Plan

**None affecting delivered behaviour — plan executed as written.** Two points of judgment are recorded below rather than hidden, per the phase's own standard.

## The Ninth Vacuous Gate — reported, not worked around

Task 1's fifth acceptance criterion reads:

> `grep -c 'removes residue directories, never processes\|never processes' packages/backend/src/index.ts` is `0` — the superseded claim is gone from the source.

**That criterion was already satisfied at HEAD, before any edit.** Measured against the pre-edit tree:

```
$ git show HEAD:packages/backend/src/index.ts | grep -c 'removes residue directories, never processes\|never processes'
0
```

Its stated red input — "the superseded claim is gone from the source" — could not have been red, because the claim was never in `index.ts`. The sentence AR-02 quotes lives in the planning artifacts, not the code:

- `.planning/phases/08-process-lifecycle/08-05-PLAN.md:257` — "`sweepOrphanedMcpTempDirs` removes residue **directories**, never processes"
- `.planning/phases/08-process-lifecycle/08-RESEARCH.md:1031` — "removes residue directories but never processes"
- `08-SECURITY.md` AR-02 quotes the same sentence

The plan attributed it to `index.ts`'s opening sentence. What `index.ts` actually carried was `"Remove orphaned drift-mcp-* dirs left by a previous run that did not stop cleanly (crash, hard kill)."` — directory-only in effect, but not that string, so no grep for that string could ever have measured it.

**What was done instead of working around it.** The criterion's *intent* — the sweep must no longer be framed as directory-only — was carried out in full: the header now opens "Kill, then remove, the residue a previous run … left behind", names AR-02 and OQ-3 by identifier, and records that the blast-radius objection is answered by the two-anchor adjacency pattern rather than waived. The intent is also covered **non-vacuously** by Task 3's gates 1 and 2, both of which were falsified against constructed inputs: dropping the reap fails the census, moving it below the loop fails the ordering. No gate was weakened and no substitute grep was invented to make a number look green. This is the ninth such gate this phase has surfaced.

## Judgment call: the `functionBody` scanner is wrong for `callMcpMethod`

Task 3's fifth gate requires "the single increment sits inside `callMcpMethod`'s body". The shared `functionBody` scanner in `index.source.test.ts` cannot supply that. It finds a body by taking the first `{` after the parameter list, and `callMcpMethod`'s return type is an inline object type:

```ts
async function callMcpMethod(
  spec: McpServerSpec,
  request: Record<string, unknown>,
): Promise<{ response: JsonRpcResponse; durationMs: number }> {
```

so the first brace belongs to the **return type**. Measured, not assumed: `functionBody(code, "callMcpMethod")` returns a non-empty slice containing neither `mcpDirectCallDepth` nor any statement — a slice that would have satisfied the existing non-vacuity guard (`expect(body).not.toBe("")`) while proving nothing. This is the same failure shape as the 19-character `closeCliSession` body the file's own header records.

Rather than widen a scanner eight existing gates depend on — which would have silently changed what those gates assert, in the same edit that added a new one — the depth-symmetry case uses a local `topLevelDeclarationSlice` with its own non-vacuity guards (`slice` non-empty, `slice` contains `spawnWithEnv(`). The limitation and the migration note are written into the test file so a future widening of `functionBody` can retire the local helper deliberately.

**The existing gates are unaffected**: `cleanupMcpRuntime`, `closeCliSession`, `deleteChat`, `sendCliMessage`, `killTree`, `killWin32Leaf` and `isPidAlive` all have brace-free return annotations (`Promise<void>`, `Result<void>`, `boolean`, `void`), which is why the defect has not bitten before. No existing count moved.

## Gate Non-Vacuity

Every gate authored in this plan had its red input constructed and executed. Each mutation produced exactly one failing test; the tree was restored and re-verified green after each.

| Gate | RED input constructed | Result |
|---|---|---|
| `shouldReapSessionOrphans` unit contract | relax both conditions to truthiness checks (`if (input.activeSessionCount)`) | 1 failed / 66 passed — the non-integer case, because `NaN` is falsy and a truthiness gate REAPS on it |
| Idle-reap census (four sites) | drop the reap from `closeCliSession` | 1 failed / 50 passed |
| Idle-reap census (the zero) | add a reap inside `cleanupMcpRuntime` | 1 failed / 50 passed |
| Fire-and-forget | add `await` at `deleteChat`'s call site | 1 failed / 50 passed |
| Start-up ordering | move the reap below the root loop | 1 failed / 50 passed |
| Teardown ordering | move the reap below `rm(mcpTempDir)` | 1 failed / 50 passed |
| Depth-counter symmetry | add a second `mcpDirectCallDepth -= 1` at the timeout arm | 1 failed / 50 passed |
| Marker single-spelling | reintroduce a bare `` `drift-mcp-${genShortToken()}` `` literal | 1 failed / 50 passed |

The Task 1 ordering criterion was additionally falsified outside vitest, on a constructed variant of `index.ts`: the reap's statement index moves from 3 to 543 while the first `rm(` stays at 329, so the comparison inverts. That measurement is quoted in the test's own comment.

## Verification

- `pnpm exec vitest run` — **645 passed / 9 skipped (654)**, against 08-06's 633/9 (642). +12, zero removed.
- `pnpm exec vitest run packages/backend/src/index.source.test.ts` — 51 green (was 44, plan required > 44).
- `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` — 67 green (was 62).
- `pnpm -r typecheck` — 0. `pnpm lint` — 0 (`--max-warnings 0`, no `--no-verify` anywhere).
- `git diff --stat HEAD -- packages/frontend packages/shared` — **byte-empty** (SC-5 tripwire).
- `killTree(` census — **9** (1 declaration + 8 call sites), unmoved as required. Had it moved, the plan directed a halt.
- Live `process.kill(-` in `packages/backend/src` — **0**. `shell: true` across `packages/` — **0**.
- Each of `deleteChat`, `sendCliMessage`, `cancelCliMessage`, `closeCliSession` carries exactly one `reapSessionOrphansIfIdle(`; `cleanupMcpRuntime` carries **zero**.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Residuals (carried forward, not defects)

- **AR-07 / T-08-50 — the multi-session cancel.** With two or more sessions live, cancelling one leaves its token-bearing MCP child to the process-group path A6 falsified; that orphan survives until the last session closes and the idle gate opens. **This is a scope decision, not an unavoidable limit** — a per-chat argv token would make the scan session-precise for `claude-cli` and `copilot-cli`, whose `args` array Drift authors itself. It is not delivered because it forks the work into two mechanisms (session-precise for two providers, idle-gated for the other two and the self-test) landing on the shared `buildMcpServerSpec` keystone every provider path reads. Named in `kill-plan.ts` at the predicate; owner recorded for plan 08-10.
- **The whole mechanism remains unreachable by any executed assertion on the real runtime.** Everything this plan proves is about source text. `index.ts` cannot be imported under vitest, and no CI leg runs LLRT. **Whether Caido's plugin sandbox can spawn `pgrep` at all is still unmeasured** — 08-06 filed it and this plan does not close it. If it cannot, both reaps degrade silently to the `enumerator-unavailable` no-op while every gate here stays green. Needs a real Caido install; routed to human UAT as D8.
- **AR-05 (completion order)** is now carried at two sites rather than one: neither reap is awaited, so a scan may still be running when the following `rm` returns. The reaper is insensitive to losing that race — `pgrep -f` matches the command line the kernel recorded at exec — but the residual is unchanged and plan 08-10 owns it.
- **AR-04 (win32)** unchanged: both scan builders refuse with `unsupported-platform`, so neither reap exists on Windows. That also means T-08-32's per-turn enumerator cost is zero there, leaving UX-04's console-window count unaffected.
- **T-08-32 accepted, not mitigated:** the `finalize` site fires after every completed turn, so an idle Drift spawns one short-lived enumerator per turn. Bounded by `ORPHAN_SCAN_TIMEOUT_MS`, fire-and-forget, and the price of covering the normal-exit orphan — which is exactly as real as the cancel orphan, since the MCP child is absent from `activeProcesses` either way.

## Issues Encountered

- **One vacuous acceptance criterion (the ninth of this phase)** — reported in full above, not worked around.
- **One shared-scanner limitation** discovered and routed around locally rather than by widening the scanner — reported in full above.

Neither affects delivered behaviour. No blockers.

## Next Phase Readiness

- **Phase 8 plan set 06–07 is coherent:** `kill-plan.ts` owns every decision, `index.ts` owns only spawning and wiring, and the wiring is now gated. 08-10 has three named residuals (AR-04, AR-05, AR-07) plus `verdict-gate.sh`.
- **The one thing a human must still do** is run a real Caido install and confirm (a) that `pgrep` is spawnable from the plugin sandbox at all, and (b) that a cancel on a single session leaves no `node …/drift-mcp-<token>/mcp-server.mjs` behind. Until (a) is measured, every green gate in this plan is consistent with the reap never running.
- **No blockers.** Suite 654, typecheck 0, lint 0, frontend and shared byte-untouched.

## Self-Check: PASSED

- `packages/backend/src/kill-plan.ts` — FOUND
- `packages/backend/src/kill-plan.test.ts` — FOUND
- `packages/backend/src/index.ts` — FOUND
- `packages/backend/src/index.source.test.ts` — FOUND
- Commit `11b70be` — FOUND
- Commit `cfb4409` — FOUND
- Commit `b6965f8` — FOUND
- Plan `<verification>` block re-run in full: suite 654 > 642, index.source 51 > 44, typecheck 0, lint 0, SC-5 byte-empty, four named functions carry exactly one idle reap and `cleanupMcpRuntime` none, live `process.kill(-` 0, `shell: true` 0.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-27*
