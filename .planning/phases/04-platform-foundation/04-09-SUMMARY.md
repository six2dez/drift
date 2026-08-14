---
phase: 04-platform-foundation
plan: 09
subsystem: infra
tags: [typescript, performance, offset-tailing, bounded-buffer, line-drain, dos-mitigation, quickjs, event-loop]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "04-04's activity-tail.ts (createActivityCursor, readActivityTick), 04-05's bounded-buffer.ts (createBoundedBuffer, appendBounded, renderBoundedBuffer, buildTruncationMarker, drainCompleteLines and six caps), 04-08's index.ts import block and the regions it reordered"
provides:
  - "packages/backend/src/index.ts — the FIRST production call sites for activity-tail.ts and bounded-buffer.ts; both modules go from zero consumers to wired"
  - "flushActivities reads only newly appended bytes through readActivityTick, with a closure-local per-session cursor"
  - "A once-per-drop sdk.console.error surfacing ACTIVITY_PARTIAL_MAX_BYTES drops, the consumer 04-04 asked for"
  - "Six of index.ts's seven accumulator sites bounded: five total-volume through appendBounded, one line-drain through drainCompleteLines"
  - "callMcpMethod's O(k*n) indexOf/slice-per-line rescan replaced by one split per chunk"
affects: [04-10, 04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A bounded accumulator rendered at the resolve boundary, so a function's public string-returning shape survives the conversion and no call site moves"
    - "A pre-read baseline capture whose ORDERING is the mitigation, with the x > x failure mode written at the capture site"
    - "A parse-only try declared ahead of the loop body, chosen specifically so a byte-identity diff gate stays satisfiable"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "The activity cursor is a closure-local `let` inside sendCliMessage, not a module-level Map. All three callers (the 250 ms setInterval, runWatchdog, finalize) close over that scope, so it is per-session by construction and dies with the turn; a Map would need explicit cleanup and could leak."
  - "seenActivityIds and readingActivities both survive with exactly their pre-plan usage counts (3 and 4). Neither identifier appears in any new comment, because the acceptance gate for this task is a raw grep -c, not a comment-stripped view — the rationale comment refers to 'the dedupe Set below' instead."
  - "stdoutBuffer stays a plain string. It is a line-DRAIN buffer, not an accumulator; head/tail/both retention would drop the middle of a JSON-RPC frame."
  - "[Rule 3] The plan's write-only `stdoutDroppedChars` passes tsc --noUnusedLocals (a compound assignment counts as a read — verified in isolation) but fails @typescript-eslint/no-unused-vars at --max-warnings 0, which is task 3's own verify. Fixed by making the truncation marker carry the CUMULATIVE total instead of the per-drain delta, which reads the counter and matches what renderBoundedBuffer already does at every other site."
  - "PERF-02 and PERF-04 were NOT marked complete. PERF-02 is code-complete here; PERF-04 is not — site 7 (resolveCommand's `out`) belongs to plan 04-10, and 04-11's Gate 7 grades the phase-wide claim. Ninth consecutive Phase 4 plan deferring to 04-11."

patterns-established:
  - "When a plan's acceptance gate is a RAW grep -c on an identifier that the same task's action asks you to write about, the comment names the thing rather than the token — the gate and the comment are both satisfiable, and the gate is the one that cannot be renegotiated"
  - "tsc --noUnusedLocals and @typescript-eslint/no-unused-vars disagree about write-only compound assignment; when a plan mandates a counter with no reader, the eslint rule is the binding constraint"

requirements-completed: []  # Deliberately empty — see Decisions Made. PERF-04 is one site short (04-10 owns site 7) and 04-11 carries the sign-off for both IDs.

# Metrics
duration: 10min
completed: 2026-08-14
---

# Phase 4 Plan 09: PERF-02's Offset Read and PERF-04's Bounded Accumulators Summary

**The two pure modules that plans 04-04 and 04-05 shipped with zero production call sites are now wired into `index.ts`: the 250 ms activity tick reads only the bytes appended since the previous tick instead of `readFile`-ing and re-parsing the whole growing file, and six of the file's seven unbounded `stdout`/`stderr` accumulators are capped — five through `appendBounded` with per-site retention, and `callMcpMethod`'s JSON-RPC drain buffer through `drainCompleteLines`, which also kills an O(k·n) per-line rescan on the single-threaded event loop the RPC keep-alive depends on.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-14T14:14:00Z
- **Completed:** 2026-08-14T14:24:00Z
- **Tasks:** 3 (3 commits)
- **Files modified:** 1 (`packages/backend/src/index.ts`, +181 / -41)

## Accomplishments

- **`flushActivities` no longer re-reads the file.** `readFile(runtimeFiles.activityFilePath, "utf-8")` + `parseRuntimeActivityEvents` is replaced by a single `readActivityTick({ … })` at `:2667`. `grep -c "readFile(runtimeFiles.activityFilePath"` returns `0`; `grep -c "readActivityTick({"` returns `1`.
- **The ordering mitigation shipped in the only form that can fire.** `const previousDroppedBytes = activityCursor.droppedBytes;` is at `:2660`, strictly ahead of `activityCursor = tick.cursor;` at `:2671`. The comparison at `:2672` reads the captured number, not the aliased object. The prose comment at the capture site names the `x > x` failure mode so a later tidy-up has to argue with it.
- **The comment that would have broken its own gate was written around.** Task 1's action asks for a comment saying `seenActivityIds` must not be deleted, while its acceptance criterion is a **raw** `grep -c "seenActivityIds"` that must still return `3`. Both are satisfiable: the comment sits directly above the declaration and calls it "the dedupe Set below". Same for the re-entrancy flag. Counts are `3` and `4`, exactly as measured during planning.
- **The emission calls are byte-unchanged.** `git diff | grep -c '^-.*sdk.api.send("mcp-tool-'` returns `0`, achieved via the mandated parse form (`let event: RuntimeActivityEvent;` ahead of a `try` wrapping the `JSON.parse` alone) — the same shape the file already uses at `callMcpMethod`'s former `:1610`.
- **All six accumulator sites this plan owns are bounded**, and the three staged counts that can only hold together after both tasks 2 and 3 all hold: `appendBounded(` = **6**, `createBoundedBuffer(` = **5**, `drainCompleteLines(` = **1**, `stdout += |stderr += ` = **0** — every one over the code-only view.
- **`spawnAndWait`'s public shape survived.** `renderBoundedBuffer` is applied at the two `resolve(...)` sites, so all seven `await spawnAndWait(` call sites are absent from the diff: `git diff -U0 | grep '^[+-]' | grep -c 'await spawnAndWait('` returns `0`.
- **Zero POSIX regressions, zero packages installed.** Suite unchanged at **29 files / 245 tests / 0 failures**. `pnpm typecheck`, `pnpm lint` (`--max-warnings 0`) and `pnpm build` all exit 0. `provider-launch.ts` / `provider-launch.test.ts` byte-identical (CMP-01 tripwire intact); every Phase 5 scope-fence symbol absent from the diff.

## The site inventory, as it stands after this plan

| # | Site | Declared | Appended | Mechanism | Status |
|---|------|----------|----------|-----------|--------|
| 1 | `spawnAndWait` stdout | `:1906` | `:1916` | `appendBounded` / `SPAWN_STDOUT_MAX_CHARS` / head | **done** (task 2) |
| 2 | `spawnAndWait` stderr | `:1912` | `:1917` | `appendBounded` / `SPAWN_STDERR_MAX_CHARS` / tail | **done** (task 2) |
| 3 | `sendCliMessage` stdout | `:2747` | `:3034` | `appendBounded` / `CLI_STDOUT_MAX_CHARS` / both | **done** (task 2) |
| 4 | `sendCliMessage` stderr | `:2753` | `:3123` | `appendBounded` / `CLI_STDERR_MAX_CHARS` / tail | **done** (task 2) |
| 5 | `callMcpMethod` stderr | `:1556` | `:1677` | `appendBounded` / `MCP_SELFTEST_STDERR_MAX_CHARS` / tail | **done** (task 3) |
| 6 | `callMcpMethod` `stdoutBuffer` | `:1545` | `:1630` | `drainCompleteLines` / `MCP_SELFTEST_LINE_MAX_CHARS` | **done** (task 3) |
| 7 | `resolveCommand`'s `out` | `:1192` | `:1200` | `appendBounded` / `SPAWN_STDOUT_MAX_CHARS` / head | **plan 04-10** |

**Read the `0` literally.** `sed -e 's://.*::' … | grep -c "stdout += \|stderr += "` returning `0` means the five sites *that pattern can see* are converted. It says nothing about site 7, whose variable is named `out` — `sed … | grep -c "out += "` still returns `1`, and that is expected, not a miss. Nothing in this plan claims "no unbounded accumulator remains"; plan **04-11's Gate 7** grades the phase-wide claim with the broader `out += \|stderr += ` pattern.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace the whole-file activity read with the per-tick offset read** — `643de82` (perf)
2. **Task 2: Bound the four spawnAndWait / sendCliMessage accumulators with marked truncation** — `b720576` (perf)
3. **Task 3: Bound callMcpMethod's stderr and replace its per-line drain with drainCompleteLines** — `9285c5b` (perf)

## Files Created/Modified

- `packages/backend/src/index.ts` — two new local import statements (`./activity-tail`, `./bounded-buffer`); `parseRuntimeActivityEvents` removed and replaced by a tombstone comment; `flushActivities` rewritten around `readActivityTick` with a closure-local cursor and a drop notice; `spawnAndWait`'s two accumulators converted and rendered at both `resolve` sites; `sendCliMessage`'s two accumulators converted and rendered at its three read sites; `callMcpMethod`'s `stderr` converted and its `while (newlineIndex …)` drain loop replaced by `drainCompleteLines`.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| **T1** whole-file read gone | `grep -c "readFile(runtimeFiles.activityFilePath" …` | `0` |
| **T1** exactly one tick call | `grep -c "readActivityTick({" …` | `1` |
| **T1** cursor adjacency | `grep -n "createActivityCursor()\|let readingActivities" …` | `:2642` / `:2648` (5-line rationale block between) |
| **T1** no cursor Map | `grep -c "Map<string, ActivityCursor>\|activityCursors" …` | `0` |
| **T1** dedupe Set survives | `grep -c "seenActivityIds" …` | `3` (matches planning measurement) |
| **T1** re-entrancy flag survives | `grep -c "readingActivities" …` | `4` (matches planning measurement) |
| **T1** drop surfaced | `grep -c "droppedBytes" …` | `3` (≥ 3 required) |
| **T1** ordering is the mitigation | `grep -n "previousDroppedBytes\|activityCursor = tick.cursor" …` | `2660` (capture) **<** `2671` (assign) — no other line matches either token |
| **T1** emissions byte-unchanged | `git diff … \| grep -c '^-.*sdk.api.send("mcp-tool-'` | `0` |
| **T1** dead helper removed | `grep -c "^function parseRuntimeActivityEvents" …` | `0`; eslint exits 0 |
| **T2** staged accumulator count | `sed -e 's://.*::' … \| grep -c "stdout += \|stderr += "` | `1` — and `grep -n` confirmed it was `:1629`, inside `callMcpMethod` (`async function callMcpMethod(` at `:1502`) |
| **T2** appendBounded sites | `sed … \| grep -c "appendBounded("` | `4` |
| **T2** createBoundedBuffer sites | `sed … \| grep -c "createBoundedBuffer("` | `4` |
| **T2** caps referenced | `grep -c "SPAWN_STD…\|CLI_STD…" …` | `8` (≥ 4 required) |
| **T2** no call site edited | `git diff -U0 … \| grep '^[+-]' \| grep -c 'await spawnAndWait('` | `0` |
| **T2** retention policies | `grep -n 'retention: "…"' …` | `head` `:1908`, `tail` `:1914`, `both` `:2749`, `tail` `:2755` |
| **T2** debug previews untouched | `grep -c "summarizeDebugChunk(text)"` / `"text.slice(0, 400)"` | `2` / `2` |
| **T2** Claude stream gets raw chunks | `grep -c "consumeClaudePrintChunk(claudePrintState, text" …` | `1` |
| **T3** all visible sites converted | `sed … \| grep -c "stdout += \|stderr += "` | **`0`** |
| **T3** site 7 still open (expected) | `sed … \| grep -c "out += "` | `1` — `:1200`, plan 04-10's |
| **T3** appendBounded sites | `sed … \| grep -c "appendBounded("` | **`6`** |
| **T3** createBoundedBuffer sites | `sed … \| grep -c "createBoundedBuffer("` | **`5`** |
| **T3** one drain call | `sed … \| grep -c "drainCompleteLines("` | `1` |
| **T3** rescan gone (statement anchors) | `grep -cE '^[[:space:]]*while \(newlineIndex'` / `'^[[:space:]]*let newlineIndex'` | `0` / `0` |
| **T3** drain buffer stayed a string | `grep -c 'let stdoutBuffer = "";'` | `1` |
| **T3** …and was not converted | `grep -c 'createBoundedBuffer({ maxChars: MCP_SELFTEST_LINE_MAX_CHARS'` | `0` |
| **T3** self-test caps referenced | `grep -c "MCP_SELFTEST_STDERR_MAX_CHARS\|MCP_SELFTEST_LINE_MAX_CHARS" …` | `4` (≥ 2 required) |
| **T3** control flow untouched | `git diff … \| grep -c '^-.*SIGKILL\|^-.*activeSelfTestPoll = \|^-.*cleanupLaunchScript'` | `0` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (file) | `pnpm exec eslint …/index.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Full suite | `pnpm exec vitest run` | **29 files / 245 tests / 0 failed** (unchanged from 04-08) |
| Named integration files | `pnpm exec vitest run …/mcp-self-test.test.ts …/mcp-server.transport.test.ts` | 2 files / 6 tests / 0 failed |
| Build | `pnpm build` | exit 0, `dist/drift.zip` produced |
| Phase 5 scope fence | `git diff -U0 HEAD~3 -- …/index.ts \| grep -E '^[-+].*(renderExportExecScript\|writeMcpWrapper\|writeLaunchScript\|shellQuote\|chmod)'` | no match |
| CMP-01 tripwire | `git diff --stat HEAD~3 -- …/provider-launch.ts …/provider-launch.test.ts` | empty |
| Blast radius | `git diff --name-only HEAD~3` | exactly `packages/backend/src/index.ts` |
| No deletions | `git diff --diff-filter=D --name-only HEAD~3` | empty |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~3 -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| **NUL byte scan** (04-07 carry-forward) | byte-level `node` read of `index.ts` | `0` NULs in 141,921 bytes; `git diff --numstat HEAD~3` reports `181 41`, i.e. git sees text, so every `grep` gate above is meaningful |
| Emitted string is ASCII | codepoint scan of the new `sdk.console.error` line | `0` characters above `0x7E` |

## Decisions Made

- **The cursor is a closure-local `let`, and that is a structural property rather than a style choice.** All three callers — the 250 ms `setInterval` heartbeat, `runWatchdog` and `finalize()` — close over `sendCliMessage`'s scope, so one declaration makes the cursor per-session **by construction** and lets it die with the turn. A `Map<sessionId, cursor>` would need explicit cleanup on every unhandled path. The reason is commented at the declaration, and the acceptance gate (`grep -c "Map<string, ActivityCursor>\|activityCursors"` → `0`) is what keeps a later reader from "improving" it into a Map — which is also why that phrase does **not** appear in the comment: it is written as "a module-level Map keyed by session id".
- **The drop baseline is captured before the read, and the comment says why in the imperative.** After `activityCursor = tick.cursor;` the two names are one object, so a comparison written afterwards is `x > x` — a mitigation that compiles, lints, ships and never fires. `index.ts` has zero direct test coverage, so line order is the only defence. The comment at `:2655-2659` states the failure mode; it deliberately does **not** quote the assignment verbatim, so the ordering grep gate returns two unambiguous lines instead of a comment that looks like an out-of-order assignment.
- **The `seenActivityIds` / `readingActivities` comments name the thing, not the token.** Task 1's action asks for a comment; task 1's acceptance criterion is a *raw* `grep -c` on those identifiers with exact expected values (`3` and `4`) — unlike tasks 2 and 3, whose gates run over `sed -e 's://.*::'`. Writing either identifier in a comment would have pushed the count to `4`/`5` and failed a gate on work that is otherwise correct. Both are satisfiable together: the rationale sits immediately above the declaration and refers to "the dedupe Set below" and "the re-entrancy flag under it". The gate was not weakened and the comment was not dropped.
- **The parse form was chosen by the diff gate, not by taste.** `let event: RuntimeActivityEvent;` ahead of a `try` containing only the `JSON.parse` keeps the preserved loop body at its original 10-space indentation, so `git diff | grep -c '^-.*sdk.api.send("mcp-tool-'` returns `0`. Wrapping the whole body in `try { … } catch { continue; }` — the natural rendering — would reindent every preserved line and turn a pure-input change into a whole-block rewrite. The same shape already exists in this file at `callMcpMethod`'s JSON-RPC parse, so it is a local convention rather than an invention.
- **`parseRuntimeActivityEvents` was deleted, not left dead.** `readActivityTick` already splits, trims and drops empty lines, so the function lost its only caller; `noUnusedLocals` and eslint at `--max-warnings 0` would both have failed. Its tolerant semantics are unchanged, just inlined at the one call site, and a tombstone comment at the old location records where they went.
- **`spawnAndWait` renders at the resolve boundary.** The alternative — returning the `BoundedBuffer` objects and rendering in each of the seven callers — would have been seven edits, seven chances to miss one, and a changed public contract. Rendering inside the two `resolve(...)` calls keeps `{ code, stdout: string, stderr: string }` intact, which the `await spawnAndWait(` diff gate then proves mechanically.
- **`sendCliMessage`'s stdout is both-ends and its stderr is tail, for different reasons.** For gemini/codex/copilot the stdout string *is* the chat answer read at `:2882`/`:2890`, so the opening and the conclusion both matter and a middle-drop preserves both. stderr is diagnostics, where the last error is the actionable one and warnings pile up ahead of it.
- **No child is ever killed to enforce a bound**, recorded at the `sendCliMessage` stdout declaration because that is where a later reader will reach for Node's precedent. `child_process.exec`'s `maxBuffer` kills on overflow; doing that here would convert a cosmetic problem — an answer longer than anyone will read — into a lost turn (T-04-17).
- **`callMcpMethod` was not exempted on the strength of its timeout**, and the reason is written at the declaration next to the timeout it refers to: `Math.min(processTimeoutSeconds * 1000, 10000)` plus `SIGKILL` bounds the exposure **window** to ten seconds, not the **volume**, and a child writing at pipe speed for ten seconds is a multi-hundred-megabyte allocation on a single-threaded runtime.
- **`stdoutBuffer` stays a plain string.** It is a line-DRAIN buffer: complete lines are parsed out and only the trailing partial survives. Head/tail/both retention on a JSON-RPC line stream drops the middle of a frame and produces something that parses as neither the first message nor the second. That reason is commented at the declaration, and the gate `grep -c 'createBoundedBuffer({ maxChars: MCP_SELFTEST_LINE_MAX_CHARS'` → `0` is the tripwire.
- **`requirements-completed` is deliberately empty, and the two IDs are in different states.** **PERF-02** is code-complete: `flushActivities` reads incrementally, all four of its behaviours are unit-proven in 04-04, and the static gates pass now. **PERF-04 is not** — six of seven sites are bounded and site 7 (`resolveCommand`'s `out` at `:1200`) is plan 04-10's, so marking it complete here would put a false "complete" in the traceability record. 04-11 is the phase verification plan, carries both IDs, and grades the phase-wide accumulator claim in its Gate 7. **Recommendation to 04-11, stated so the deferral does not become permanent by inertia:** PERF-02 can be marked complete on this plan's evidence; PERF-04 should wait for 04-10. `REQUIREMENTS.md` still reads `- [ ] **PERF-02**` / `- [ ] **PERF-04**`, verified after the state updates.

## Deviations from Plan

The plan's code was executed literally: every mandated symbol, every mandated rationale comment, the exact parse form, the exact capture-before-read ordering, the per-site retention policies, and the `drainCompleteLines` call shape. Every acceptance criterion in all three tasks passes. One deviation, a Rule 3 auto-fix, plus the bookkeeping misfires.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's write-only `stdoutDroppedChars` fails `pnpm lint`, which is task 3's own `<verify>`**

- **Found during:** Task 3, at the task's own `<verify>` (`pnpm exec eslint … --max-warnings 0`).
- **Issue:** The action mandates `let stdoutDroppedChars = 0;` whose only use is `stdoutDroppedChars += drain.droppedChars;`. `tsc --noUnusedLocals` accepts that — a compound assignment reads the variable — so `pnpm typecheck` exits 0 and the problem is invisible there. `@typescript-eslint/no-unused-vars` does not: `1546:9 error 'stdoutDroppedChars' is assigned a value but never used`. Both `pnpm exec eslint …/index.ts --max-warnings 0` and `pnpm lint` exit 1. **Verified in isolation, not inferred:** a three-line file with `let acc = 0; acc += n;` compiles clean under `tsc --noEmit --noUnusedLocals --strict`, so the two tools genuinely disagree about write-only compound assignment. This is the same class of finding as 04-08's TS6133 issue, in the opposite direction.
- **Fix:** The truncation marker now carries the **cumulative** total — `buildTruncationMarker(stdoutDroppedChars)` — rather than the per-drain delta `buildTruncationMarker(drain.droppedChars)`. That is a one-token change from the plan's literal snippet, it gives the counter a genuine read, and it matches `bounded-buffer.ts`'s own recorded contract for this marker: 04-05's *Decisions Made* states that the dropped count is kept cumulative precisely because a per-append count is the wrong shape for a reader. Successive markers now read as one monotonic record whose last value is the answer, instead of N deltas a reader has to add up. The reason is commented at the site. Rejected alternatives: renaming to `_stdoutDroppedChars` (the repo's `^_` convention means "deliberately unused", which would be a lie about a counter that is the whole point of the drop path), `void stdoutDroppedChars;` (04-08 already rejected this shape as reading like an accident), and adding a reader on the `close` handler's final fallback (unreachable — the marker append makes `renderBoundedBuffer(stderr).trim()` non-empty, so the earlier branch always wins).
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `9285c5b`

### Adjustments the gates forced, which are *not* deviations

- **The `seenActivityIds` / `readingActivities` rationale comments do not contain those identifiers.** Explained under *Decisions Made*; both the action's requirement (a comment stating the Set must not be removed) and the criterion's exact counts (`3`, `4`) are satisfied simultaneously.
- **The capture-before-read comment does not quote `activityCursor = tick.cursor` verbatim.** The first draft did, which made `grep -n "previousDroppedBytes\|activityCursor = tick.cursor"` print a comment line *above* the capture — readable as a failing ordering gate. Reworded to "assigning the returned cursor back into the closure variable below". This is exactly the prose-proof-anchor lesson 04-05 recorded and the plan's own task-3 statement anchors encode.

### Mechanical notes that are *not* deviations

- **`prettier --write` was deliberately NOT run on `index.ts`.** It is inside `pnpm format`'s glob but is part of backlog 999.11's pre-existing debt, and `--write` would reformat pre-existing lines — including the Phase 5 scope-fence functions this plan must leave byte-stable. New code was hand-written in Prettier-compatible shape instead. Same call 04-06 and 04-08 made, for the same reason.
- Zero packages installed, as T-04-SC requires. `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across all three commits.
- `dist/` is gitignored, so the `pnpm build` run left the working tree clean.

### Bookkeeping deviations

See *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-08 all recorded, reproduced for the ninth time.

## Issues Encountered

One blocking lint issue in the source work, recorded above as a Rule 3 auto-fix and resolved without weakening a single gate. The bookkeeping tools misfired as usual.

**1. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the ninth time**

- **Found during:** post-summary state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-08, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — backlog item **999.1** (the event-driven `sendCliMessage` refactor) — and writes Phase 4's count into it. It also re-mangles the Progress table row's trailing cells.
- **Observed:** `ROADMAP.md:329` went `**Plans:** 0 plans` → `**Plans:** 9/11 plans executed`, and the Progress row went `| 4. Platform Foundation | 8/11 | In Progress | - |` → `| 4. Platform Foundation | 9/11 | In Progress|  |` — the trailing cells mangled again, undoing 04-08's tidy.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 and the table row's trailing cells. What the helper got *right* and was kept: the `04-09-PLAN.md` checkbox → `[x]` and the `8/11` → `9/11` count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `git diff` against the committed baseline reduced to exactly the three intended lines; `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11`, `grep -c 'plans executed'` → `0`.
- **Carry-forward, unchanged:** two plans remain in this phase and both will hit it. **Snapshot before, diff after** — a count-only check does not catch the trailing-cell mangling. Ordering matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**1b. [Rule 1 - Bug] The ROADMAP's own one-line descriptor for this plan still carried the stale "four bounded accumulators" claim**

- **Found during:** the ROADMAP diff above (not a task)
- **Issue:** Wave 3's entry read `04-09-PLAN.md — index.ts: PERF-02's offset read …, and PERF-04's four bounded accumulators`. That is the *first* of the two undercounts this plan's own `<objective>` corrects — the count is **seven** sites, of which this plan owns **six**. 04-05 hit and fixed the identical stale wording on its own descriptor and recorded the precedent. Left alone it is the artifact a 04-10 or 04-11 executor scanning the roadmap would reason from, and "four" is not a number anyone can reconstruct the truth from.
- **Fix:** Rewrote the descriptor to the shipped shape — six of seven sites, five through `appendBounded` and one through `drainCompleteLines` — and named *why* the undercount happened (the inventory grep is structurally blind to `stdoutBuffer +=` and `out +=`) so the correction carries its own reason. Site 7's ownership by 04-10 is stated inline.
- **Files modified:** `.planning/ROADMAP.md`
- **Why this was in scope:** documentation-only, one line, describing the plan just executed, inside a file this step was already repairing — and the plan's own framing calls a surviving "four" a stale claim to correct rather than a target to match.

**2. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 through 04-08 recorded**

- **Found during:** post-summary state updates (not a task)
- **Issue:** Confirmed by `git diff -- .planning/STATE.md` against the committed baseline, never by exit code. `advance-plan` advanced *Plan 9 of 11* → *10 of 11* but also reset `Status:` mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare date. `record-metric` appended a 4-column orphan row below the `*Updated after each plan completion*` footer, unrelated to the differently-shaped **By Phase** table above it.
- **Fix:** Restored `Status: Executing Phase 4` and both descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 9 of 11`) and the **Recent Trend** last-5 list, and deleted the stray row.
- **Files modified:** `.planning/STATE.md`
- **What did NOT misfire:** `update-progress` again reported `percent: 91` while writing only `completed_plans: 19 → 20` — the `percent: 10` field and the `Progress: [██░░░░░░░░] 20% (2 of 10 milestone phases)` line are untouched, which is the *desired* outcome for this project (its progress line counts milestone phases, not plans). Fourth plan to record the reported-vs-written mismatch so it is not mistaken for corruption.

**2c. [Rule 1 - Bug] The hand-maintained Velocity line was two plans behind, not one**

- **Found during:** the STATE.md repair above (not a task)
- **Issue:** `Total plans completed:` read `22`. Checking the line across the last eight `docs(04-0x)` commits shows it going 17 → 18 → 18 (04-03 missed) → 19 → 20 → 21 → 22 → **22** — i.e. **04-08 did not increment it**, even though it updated the By Phase row from `7 of 11` to `8 of 11` in the same commit. No helper maintains this line, which is why it silently drifts.
- **Fix:** Set to `24` (04-08's missed increment plus this plan's) and nudged `Total execution time` from `~2.7` to `~3.3 hours` to absorb 04-08's 25 min and this plan's 10 min, which were also never added.
- **Files modified:** `.planning/STATE.md`
- **Carry-forward:** check this line against `git log -- .planning/STATE.md` rather than incrementing whatever is there; a missed increment is invisible to any exit code and compounds silently.

**2b. [Confirmed again] the named-flag rules hold**

- `add-decision --phase 04` (zero-padded) wrote the correct `[Phase 04]` prefix — fourth consecutive plan with no decision-prefix damage. `record-session` was invoked with `--stopped-at` / `--resume-file`; the positional and argument-less forms both return `"recorded": true` while writing `Resume file: None`, so the durable rule remains **named flags plus a diff**, never the exit code.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [PERF-02, PERF-04]` and the workflow's default is to check them off. That default was **not** followed, for the reason under *Decisions Made*, with the explicit split recommendation to 04-11 recorded there (PERF-02 code-complete now; PERF-04 waits for 04-10's site 7).

## Threat Model Disposition

- **T-04-09 (Denial of Service, per-tick activity read) — NOW MITIGATED IN THE RUNNING PRODUCT.** The 250 ms tick allocates at most `ACTIVITY_MAX_TICK_BYTES` (1 MiB) per read instead of a `readFile` whose cost grew with the turn. 04-04 shipped the clamp with six real-file cases and no consumer; it has one now.
- **T-04-06 (Denial of Service, event-loop CPU) — NOW MITIGATED IN THE RUNNING PRODUCT, both halves.** The activity tick no longer re-parses the whole file four times a second, and `callMcpMethod`'s `indexOf`/`slice`-per-line rescan — which re-copied the remainder and rescanned from index 0 once *per line*, O(k·n) — is one `split` per chunk. Both run on the single-threaded loop that also runs the RPC keep-alive the whole watchdog pattern depends on.
- **T-04-05 (Denial of Service, total-volume accumulators) — mitigated at five of six sites, with the residual named.** Sites 1-5 are capped with per-site retention and a counted marker. **Site 7 (`resolveCommand`'s `out` at `:1200`) is still unbounded** and belongs to plan 04-10 under the same `SPAWN_STDOUT_MAX_CHARS` cap. Recorded here so the residual is visible rather than implied.
- **T-04-28 (Denial of Service, `callMcpMethod`'s line drain) — mitigated.** The carried remainder is capped at `MCP_SELFTEST_LINE_MAX_CHARS` (4 MiB) and dropped **whole**, never truncated-and-parsed, with the byte count appended to `stderr` so it surfaces in the rejection the user sees. The ≤10 s timeout plus `SIGKILL` was explicitly rejected as a substitute: it bounds the window, not the volume.
- **T-04-17 (Denial of Service (self), overflow policy) — mitigated, and the divergence is written down at the site a reader would question it.** No `proc.kill` was added to any bound; every site truncates and keeps reading. Node's `child_process.exec` `maxBuffer` precedent is named and rejected at the `sendCliMessage` stdout declaration.
- **T-04-15 (Tampering, activity line parsing) — mitigated, and the standing warning was honoured.** The tolerant parse is verbatim (bad JSON skipped, never thrown) and `seenActivityIds` survives with its exact pre-plan usage count, with a comment forbidding its removal — 04-04's explicit instruction, because a truncation reset re-reads from byte zero.
- **T-04-16 (Denial of Service, held file handle) — mitigated by construction.** `readActivityTick` opens and closes per tick; `index.ts` never holds the handle. A held handle would block `rm(activityFilePath)` at `finalize()` on Windows with `EBUSY`.
- **T-04-18 (Repudiation, silent truncation) — mitigated at every new site.** Five accumulators render `buildTruncationMarker` with a cumulative count; the drain site appends the same marker into `stderr`; and the activity tail's `droppedBytes` now has the `sdk.console.error` consumer 04-04 asked for, guarded on a pre-read baseline so it can actually fire.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed across all three commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-10 is unblocked and its scope is unchanged.** Site 7 is `let out = "";` at `index.ts:1192`, appended at `:1200` inside `resolveCommand`'s `which`/`where.exe` promise. It reuses `SPAWN_STDOUT_MAX_CHARS` with `head` retention (no new constant — the reuse is recorded at the constant in `bounded-buffer.ts`). The `./bounded-buffer` import block is already in place at `index.ts:99-111`; adding `SPAWN_STDOUT_MAX_CHARS` is unnecessary because it is already imported for `spawnAndWait`. After 04-10, `sed -e 's://.*::' … | grep -c "out += \|stderr += "` should reach `0`.
- **Plan 04-11's Gate 7 should use the broader pattern, as its plan already specifies.** `stdout += ` contains `out += `, so `out += \|stderr += ` is a strict superset of the narrow inventory grep and is the only form that cannot let a site hide behind a variable name. Running the narrow pattern at phase level would report a false `0`.
- **`droppedChars` and `droppedBytes` now both have consumers, but of different kinds.** The activity tail's drop goes to `sdk.console.error` (a diagnostics channel); the drain site's drop goes into `stderr` (the error the user sees). Neither emits an `mcp-tool-activity` event, deliberately — the activity stream is the tool log.
- **The line numbers in 04-04's and 04-05's summaries are now stale for `index.ts`.** They were measured before 04-08 (+450/-20) and this plan (+181/-41). Re-locate by content, never by number: `04-05-SUMMARY.md`'s seven-site table cites `:854`/`:862`/`:1200`/`:1201`/`:1268`/`:1295`/`:1522`-`:1525`/`:2205`-`:2206`/`:2484`/`:2573`, none of which still hold. The updated table is in this summary.
- **`stdoutDroppedChars` is the one new local with a subtle constraint.** It is read only by the marker call. If a later edit reverts the marker to the per-drain delta, `pnpm lint` will fail again with the same error — that is the intended tripwire, and the comment at the site explains it.
- **Known non-blocker for the verifier:** `index.ts` still has zero direct test coverage, so this integration is proven by static gates, `typecheck`, `lint`, `build` and the existing 245-test suite, not by behaviour. The mechanisms themselves are unit-proven: 20 cases in `activity-tail.test.ts` and 16 in `bounded-buffer.test.ts`.
- `activity-tail.ts`, `bounded-buffer.ts`, `platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `claude-print.ts`, `command-resolution.ts`, `provider-launch.ts`, `mcp-runtime.ts` and `persistence.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/index.ts` — FOUND (modified; 141,921 bytes, 0 NUL bytes, `git diff --numstat HEAD~3 HEAD` = `181 41`)
- `.planning/phases/04-platform-foundation/04-09-SUMMARY.md` — FOUND
- Commit `643de82` — FOUND
- Commit `b720576` — FOUND
- Commit `9285c5b` — FOUND
- `.planning/ROADMAP.md` — verified by `git diff` against the committed baseline: exactly three intended changes (the `04-09-PLAN.md` checkbox, its corrected descriptor, and the `8/11` → `9/11` count); all eleven `999.x` backlog items read `**Plans:** 0 plans`; `grep -c 'plans executed'` = `0`
- `.planning/STATE.md` — verified by `git diff` against the committed baseline: position, `completed_plans`, Status, both activity lines, the Velocity block, the By Phase row, Recent Trend, the three session fields and six `[Phase 04]` decisions, and nothing else. `grep -c '^- \[Phase 4\]:'` = `0` (zero-padded `--phase 04` again wrote the correct prefix)
- `.planning/REQUIREMENTS.md` — verified byte-identical (`git diff --stat` empty); PERF-02 and PERF-04 both still `- [ ]` and `Pending`, as intended

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
</content>
</invoke>
