---
phase: 04-platform-foundation
plan: 05
subsystem: infra
tags: [typescript, vitest, performance, bounded-buffer, truncation, line-drain, dos-mitigation, pure-functions]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — bounded-buffer.ts imports NOTHING, not even ./platform. 04-01/04-02/04-03/04-04 supplied the convention (pure core + sibling .test.ts + it-titles-as-a-contract), not an API"
provides:
  - "packages/backend/src/bounded-buffer.ts — fifteen exports: BoundedRetention, BoundedBuffer, createBoundedBuffer, appendBounded, TRUNCATION_MARKER_PREFIX, buildTruncationMarker, renderBoundedBuffer, CLI_STDOUT_MAX_CHARS, CLI_STDERR_MAX_CHARS, SPAWN_STDOUT_MAX_CHARS, SPAWN_STDERR_MAX_CHARS, MCP_SELFTEST_STDERR_MAX_CHARS, MCP_SELFTEST_LINE_MAX_CHARS, LineDrainResult, drainCompleteLines"
  - "appendBounded — PERF-04's total-volume mechanism: three retention policies (head/tail/both) over an immutable state object, so the marker carries a CUMULATIVE dropped count rather than one re-derived from a rendered string"
  - "buildTruncationMarker / TRUNCATION_MARKER_PREFIX — the one greppable marker, count embedded (T-04-18: truncation is marked, never silent)"
  - "Five per-site total-volume caps + one unterminated-line cap as exported constants, so the Claude's-Discretion numbers are reviewable and tunable without touching a call site"
  - "drainCompleteLines — PERF-04's line-drain mechanism for site 6 (callMcpMethod's stdoutBuffer): splits once, bounds only the unterminated remainder, drops it whole with a counted droppedChars"
  - "packages/backend/src/bounded-buffer.test.ts — 16 cases resolving all six 04-VALIDATION.md PERF-04 selectors"
affects: [04-06, 04-09, 04-10, 04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (eleventh instance of the existing repo pattern; fifth consecutive Phase 4 plan)"
    - "Two mechanisms in one module because they are deliberately NOT one mechanism — the module header states the collapse it exists to prevent"
    - "A cap constant carries its rationale AND its second consumer inline (SPAWN_STDOUT_MAX_CHARS names site 7), so the reuse is a recorded decision rather than a coincidence a later reader would 'fix'"

key-files:
  created:
    - packages/backend/src/bounded-buffer.ts
    - packages/backend/src/bounded-buffer.test.ts
  modified: []

key-decisions:
  - "drainCompleteLines takes no BoundedBuffer and is NOT a retention policy. Head/tail/both applied to a JSON-RPC line stream drops the middle of a frame and corrupts the protocol; the line hazard is an unterminated remainder, not total volume. Two hazards, two mechanisms, one module — with the header comment stating the collapse it exists to prevent."
  - "The seven-site inventory was confirmed mechanically, not asserted. `grep -n 'stdout += \\|stderr += ' index.ts` returns FIVE lines (:1295, :1524, :1525, :2484, :2573) and is structurally blind to both `stdoutBuffer +=` at :1268 (site 6) and `out += d.toString()` at :862 (site 7) — the variable is named `out`, not `stdout`. That is why the earlier 'four accumulators' and 'six accumulators' drafts were both wrong."
  - "Site 7 gets no seventh constant. resolveCommand's `out` reuses SPAWN_STDOUT_MAX_CHARS with head retention — identical shape — and the reuse is recorded at the constant so 04-10 cannot mistake it for an omission. It is also deliberately NOT exempted on 'it's only which, with a 1-second timeout' grounds: that is the same argument this phase rejects for callMcpMethod, where the timeout bounds the window and not the volume."
  - "MCP_SELFTEST_LINE_MAX_CHARS is 4 MiB, the same as 04-04's ACTIVITY_PARTIAL_MAX_BYTES and 04-06's forthcoming CLAUDE_LINE_BUFFER_MAX_CHARS. One hazard shape, one answer; three numbers for one hazard would read as an oversight. The unit asymmetry (UTF-16 code units here and in 04-06, bytes in 04-04) is intended and commented in both places."
  - "No child is ever killed. Node's child_process.exec maxBuffer precedent (kill on overflow) is deliberately rejected at the top of the module: killing a CLI mid-answer converts a cosmetic problem into a lost turn (T-04-17)."
  - "PERF-04 was NOT marked complete. All seven index.ts accumulator sites are still unbounded and the module has zero production call sites; 04-06, 04-09 and 04-10 carry the wiring. Fifth consecutive Phase 4 plan making this call."

patterns-established:
  - "When two static gates would both be satisfied by the same comment the task mandates, the gate is re-anchored to the call form (`\\.indexOf(`, `\\.split(`) rather than filtered — a leading-character comment filter does not remove a trailing note"
  - "A -t selector run is validated against the independently-known suite total (every run reported `1 passed | 15 skipped (16)`), so a silently-empty selector cannot be mistaken for a green one"

requirements-completed: []  # Deliberately empty — see Decisions Made. PERF-04's seven sites are all still unbounded in index.ts; 04-06/04-09/04-10 carry the integration.

# Metrics
duration: 9min
completed: 2026-08-14
---

# Phase 4 Plan 05: PERF-04's Bounded Buffers and the Split-Once Line Drain Summary

**A zero-import `bounded-buffer.ts` carrying both of PERF-04's mechanisms without collapsing them: `appendBounded` with three retention policies and five exported caps for the six total-volume accumulators, and `drainCompleteLines` — a different mechanism, not a variant — for the one line-DRAIN buffer, where head/tail retention would corrupt JSON-RPC framing and where the caller's `indexOf`/`slice` loop is O(k·n) on the single-threaded event loop the RPC keep-alive depends on.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-14T12:56:50Z
- **Completed:** 2026-08-14T13:06:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/bounded-buffer.ts` (248 lines) exports the **fifteen** symbols the frontmatter locks, in the order the task's action specifies, with **zero import statements** — the mechanical form of the "pure, no I/O" claim, and the reason T-04-SC is trivially satisfied.
- `packages/backend/src/bounded-buffer.test.ts` (346 lines, 16 cases) resolves **all six** `04-VALIDATION.md` PERF-04 selectors, each validated against the independently-known suite total of 16.
- The **seven**-site inventory the plan corrected twice is now confirmed *mechanically* rather than asserted: the natural inventory grep returns five lines and is blind to two of the seven. Both blind spots are named at the constants that bound them.
- The `-t "both ends"` case asserts the numeric bound `rendered.length <= maxChars + marker.length` **and** the exact composition `opening + marker + closing`, so "truncation happened" cannot pass for "truncation is bounded".
- `drainCompleteLines` is falsifiable in **both** directions: an over-cap newline-free remainder drops whole and counts 100, while an over-cap newline-**terminated** chunk drops nothing — the partner case that an implementation bounding the pre-split concatenation would fail.
- A whole-payload vs. one-character-at-a-time equivalence case proves the split-once refactor is chunk-boundary-independent, which is the property plan 04-09 task 3 needs before it touches `callMcpMethod`.
- Full suite went 211 → **227 tests, 28 files, 0 failures** (exactly +16, +1 file). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write bounded-buffer.ts — three retention policies, six caps, one marker, one line drain** — `a2c03a2` (feat)
2. **Task 2: Write bounded-buffer.test.ts — below-cap passthrough, both-ends bound, marker count, line drain** — `5a01353` (test)

## Files Created/Modified

- `packages/backend/src/bounded-buffer.ts` — `BoundedRetention`, `BoundedBuffer`, `createBoundedBuffer`, `appendBounded`, `TRUNCATION_MARKER_PREFIX`, `buildTruncationMarker`, `renderBoundedBuffer`, the five total-volume caps, `MCP_SELFTEST_LINE_MAX_CHARS`, `LineDrainResult`, `drainCompleteLines`. No imports, no I/O, no module state, no `ChildProcess` handle.
- `packages/backend/src/bounded-buffer.test.ts` — 3 top-level describes / 16 cases: 8 for `appendBounded`, 6 for `drainCompleteLines`, 2 for the cap constants.

## The seven-site inventory, confirmed by measurement

| # | Site | Declared | Appended | Hazard | Mechanism | Wired by |
|---|------|----------|----------|--------|-----------|----------|
| 1 | `spawnAndWait` stdout | `:1522` | `:1524` | total volume | `appendBounded` / `SPAWN_STDOUT_MAX_CHARS` / head | 04-09 task 2 |
| 2 | `spawnAndWait` stderr | `:1523` | `:1525` | total volume | `appendBounded` / `SPAWN_STDERR_MAX_CHARS` / tail | 04-09 task 2 |
| 3 | `sendCliMessage` stdout | `:2205` | `:2484` | total volume | `appendBounded` / `CLI_STDOUT_MAX_CHARS` / both | 04-09 task 2 |
| 4 | `sendCliMessage` stderr | `:2206` | `:2573` | total volume | `appendBounded` / `CLI_STDERR_MAX_CHARS` / tail | 04-09 task 2 |
| 5 | `callMcpMethod` stderr | `:1201` | `:1295` | total volume | `appendBounded` / `MCP_SELFTEST_STDERR_MAX_CHARS` / tail | 04-09 task 3 |
| 6 | `callMcpMethod` `stdoutBuffer` | `:1200` | `:1268` | **unterminated line** | `drainCompleteLines` / `MCP_SELFTEST_LINE_MAX_CHARS` | 04-09 task 3 |
| 7 | `resolveCommand`'s `out` | `:854` | `:862` | total volume | `appendBounded` / **reuses** `SPAWN_STDOUT_MAX_CHARS` / head | 04-10 task 1 |

The inventory grep that produced the two earlier undercounts was run again as evidence, not as a formality:

```
$ grep -n "stdout += \|stderr += " packages/backend/src/index.ts
1295:      stderr += chunk.toString();
1524:    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
1525:    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
2484:        stdout += text;
2573:        stderr += text;
```

Five lines, not seven. It misses `:1268` (`stdoutBuffer +=` — no space after `stdout`) and `:862` (`out += d.toString()` — the variable is named `out`). Both are real accumulators, and both are named in the module at the constant that bounds them so the next reader inherits the correction rather than the grep.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Zero imports | `grep -c '^import' …/bounded-buffer.ts` | `0` |
| Fifteen exports | `grep -nE '^export (const\|function\|type)' …/bounded-buffer.ts` | 15 lines, matching the frontmatter list exactly |
| No `indexOf` call | `grep -c '\.indexOf(' …/bounded-buffer.ts` | `0` |
| Splits exactly once | `grep -c '\.split(' …/bounded-buffer.ts` | `1` |
| Module size | `wc -l …/bounded-buffer.ts` | `248` (min 95) |
| Test size | `wc -l …/bounded-buffer.test.ts` | `346` (min 120) |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/bounded-buffer.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/bounded-buffer.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run …/bounded-buffer.test.ts` | 16 passed / 0 failed |
| PERF-04 `-t "below the cap"` | selector run | `1 passed \| 15 skipped (16)` |
| PERF-04 `-t "both ends"` | selector run | `1 passed \| 15 skipped (16)` |
| PERF-04 `-t "marker"` | selector run | `1 passed \| 15 skipped (16)` |
| PERF-04 `-t "drains complete lines"` | selector run | `1 passed \| 15 skipped (16)` |
| PERF-04 `-t "drops an over-cap remainder"` | selector run | `1 passed \| 15 skipped (16)` |
| PERF-04 `-t "keeps the tail only under tail retention"` | selector run | `1 passed \| 15 skipped (16)` |
| Marker wire form | asserted in `-t "marker"` | `buildTruncationMarker(4194304) === "\n…[drift: truncated 4194304 bytes]…\n"` |
| No focused tests | `grep -cE '(describe\|it)\.only\(' …/bounded-buffer.test.ts` | `0` |
| No fake timers | `grep -c 'useFakeTimers' …/bounded-buffer.test.ts` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| Blast radius | `git diff --name-only HEAD~2 HEAD` | exactly the two new files |
| index.ts untouched | `git diff --name-only HEAD~2 HEAD -- …/index.ts` | empty |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~2 HEAD -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| CMP-01 regression net | `pnpm exec vitest run` | 28 files / **227** tests / 0 failed (was 27 / 211 — exactly +16) |

Method note, carrying the `[03-03]`/`[03-04]`/`[04-02]`/`[04-03]`/`[04-04]` lesson about extraction pipelines: each `-t` run was ANSI-stripped before the `grep`, and every one was validated against the independently-known total of 16 — each reported `1 passed | 15 skipped (16)`. A silently-empty extraction is otherwise indistinguishable from a green result, and this file's titles are exactly the kind that invite a fluent reword.

## Decisions Made

- **`drainCompleteLines` is a different mechanism, not a retention policy.** It deliberately takes no `BoundedBuffer` and returns no `BoundedBuffer`. Head/tail/both retention on a JSON-RPC line stream drops the middle of a frame, producing something that parses as neither the first message nor the second — so the "obvious" simplification of routing site 6 through `appendBounded` is the specific failure this module's header exists to forbid. Two hazards (total volume, unterminated line), two mechanisms, one module.
- **The bound is on the remainder, never on the combined buffer.** A buffer containing newlines drains naturally through the split, so the only unbounded case is a trailing fragment with no terminator. Bounding the pre-split concatenation would discard legitimate complete lines that were about to be emitted — and it would still pass a naive over-cap test, which is exactly why `it("does not drop when the over-cap content is newline-terminated")` exists.
- **The over-cap remainder is dropped whole and counted, never truncated.** A truncated JSON-RPC line is unparseable and would be swallowed by `callMcpMethod`'s existing `catch { continue; }` (`index.ts:1279-1281`), converting a counted drop into a silent hole. Same policy as 04-04's `consumeActivityChunk` and 04-06's forthcoming line buffer.
- **The `split`-once fix is a CPU fix, and it matters as much as the memory fix.** `callMcpMethod`'s loop at `index.ts:1269-1291` re-copies the whole remainder and rescans from index 0 once per line — O(k·n). Caido's runtime is single-threaded and that event loop is what runs the RPC keep-alive the whole watchdog pattern depends on.
- **`appendBounded` always returns a new object, including on the below-cap path.** The cheap alternative (return the input unchanged when nothing was dropped) would let a caller alias the previous state and would make the no-mutation contract conditional. Asserted directly.
- **The dropped count lives in the state, not in the rendered string.** Re-parsing a previously-embedded marker back out of the text on every append would be fragile — the child's own output can contain the marker — and it would produce a *per-append* count where the contract needs a *cumulative* one. The `68 / 168 / 268` case is what that alternative implementation fails.
- **The marker says "bytes" while the count is UTF-16 code units.** Kept deliberately: the string is a greppable support-bundle token, the CLI output at these sites is ASCII-dominated so the two numbers usually coincide, and the discrepancy is documented at the function rather than being silently wrong.
- **Site 7 adds no seventh constant and takes no exemption.** `resolveCommand`'s `out` reuses `SPAWN_STDOUT_MAX_CHARS` (identical head-read shape), and the reuse is recorded *at the constant* so plan 04-10 finds it rather than inventing `WHICH_STDOUT_MAX_CHARS`. The "it's only `which`, and there's a 1-second timeout" exemption was rejected on consistency grounds: that is the same argument the phase rejects for `callMcpMethod`, where the ≤10 s timeout bounds the window and not the volume.
- **`requirements-completed` is deliberately empty.** `PERF-04` appears in this plan's frontmatter, but all seven `index.ts` accumulator sites are still unbounded, the `indexOf`/`slice` loop is still there, and the module has **zero** production call sites. Plans 04-06 (`claude-print.ts`), 04-09 (sites 1-6) and 04-10 (site 7) carry the integration. Fifth consecutive Phase 4 plan making this call after 04-01, 04-02, 04-03 and 04-04, matching Phase 3's CI-02 precedent. `REQUIREMENTS.md` still reads `- [ ] **PERF-04**` and `| PERF-04 | Phase 4 | Pending |`.

## Deviations from Plan

Neither task deviated. Both files were written as specified, both passed their own `<verify>` on the first run, and no lint, typecheck or behavioural fix was needed. No Rule 1/2/3 auto-fix was applied to any source file. The plan was executed literally, including the two deliberately re-anchored static gates (`\.indexOf(` and `\.split(` in call form) that exist because the task's own mandated comments name `indexOf`/`slice` and `split` in prose.

Two additions beyond the plan's enumerated assertion list, neither of which changes a `-t` count:

- The `-t "marker"` case also pins the literal wire form `buildTruncationMarker(4194304) === "\n…[drift: truncated 4194304 bytes]…\n"`. That is one of task 1's acceptance criteria, and asserting it from inside the suite makes it a standing gate rather than a one-off grep the next editor never re-runs.
- `it("handles an empty chunk and an empty buffer")` additionally asserts that `maxChars` and `retention` survive an append and that an empty chunk after real content is a no-op rather than a state reset.

Two mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter; both paths are inside `pnpm format`'s glob). Prettier reflowed only the `appendBounded` signature in the module and reported the test file **unchanged**. No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5-8 byte-stability fence are unaffected.
- Zero packages installed, as T-04-SC requires.

### Bookkeeping deviations

See the numbered entries under *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-04 all recorded.

## Issues Encountered

None in the source work. Both tasks passed their own `<verify>` commands on the first attempt, and the 16-case suite was green on its first run.

**1. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the fifth time**

- **Found during:** post-task state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-04, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — backlog item **999.1** (the event-driven `sendCliMessage` refactor) — and writes Phase 4's count into it. It also re-mangled the Progress table row's trailing cell, undoing 04-04's tidy.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 (asserted by count: all eleven 999.x items read it again) and the table row to `| 4. Platform Foundation | 5/11 | In Progress | - |`.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** full `diff` against a pre-run snapshot shows exactly the intended changes and nothing else.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. Snapshot `ROADMAP.md` before the call and `diff` after — a count check alone does **not** catch the trailing-cell mangling. The helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**1b. [Rule 1 - Bug] The ROADMAP's own one-line descriptor for this plan carried the stale "four per-site caps" claim**

- **Found during:** the ROADMAP diff above (not a task)
- **Issue:** `### Phase 4`'s wave-1 list read `04-05-PLAN.md — bounded-buffer.ts + tests: PERF-04 site A, four per-site caps with marked truncation`. That is the *first* of the two undercounts the plan itself corrected twice — it predates both the `callMcpMethod` sites and `resolveCommand`'s `out`. Left alone it is the artifact a 04-06 or 04-09 executor scanning the roadmap would reason from, and "four caps" is not a scoping decision anyone can reconstruct the truth from.
- **Fix:** Rewrote the descriptor to the shipped shape — three retention policies, **five** exported caps covering **six** total-volume sites (the sixth reusing `SPAWN_STDOUT_MAX_CHARS`), plus `drainCompleteLines` for the line-drain site — and named the two lines the inventory grep cannot see (`index.ts:862`, `:1268`) so the correction carries its own reason.
- **Files modified:** `.planning/ROADMAP.md`
- **Why this was in scope:** the plan's own framing is explicit that a surviving "four" or "six" is *"a stale claim to correct, not a target to match"*. Documentation-only, one line, inside a file this step was already repairing.
**2. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02, 04-03 and 04-04 recorded**

- **Found during:** post-task state updates (not a task)
- **Issue:** Confirmed by diffing `STATE.md` against a pre-run snapshot rather than by trusting exit codes. `advance-plan` reset `Status:` mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare date; `record-metric` appended an orphan row below the `*Updated after each plan completion*` footer instead of updating the differently-shaped **By Phase** table.
- **Fix:** Restored `Status: Executing Phase 4` and the descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 5 of 11`) and the **Recent Trend** last-5 list, and deleted the stray table row.
- **Files modified:** `.planning/STATE.md`
- **What did NOT misfire:** `record-session` was invoked with `--stopped-at` / `--resume-file` and `add-decision` with `--phase` / `--summary`, per 04-02's warning; the diff confirms every value landed correctly. The positional form *succeeds silently while writing garbage*, so the named-flag form **plus a diff** is the durable rule, not the exit code.

**2b. Three smaller helper behaviours worth carrying forward, all caught by the same diff**

- **`add-decision --phase 4` writes `- [Phase 4]:`, not `- [Phase 04]:`.** Every pre-existing entry in the Decisions list is zero-padded (`[Phase 03]`, `[Phase 04]`), so five new lines landed off-convention. Repaired with an anchored `perl -0pi` and asserted by count (`^- \[Phase 4\]:` → `0`, `^- \[Phase 04\]: \[04-05\]:` → `5`). Passing `--phase 04` may avoid it; untested, because the repair is one command and the assertion is cheaper than the experiment.
- **`state update-progress` reported `percent: 73` and did not write it.** Its JSON claimed `{"updated": true, "percent": 73, "completed": 16, "total": 22}`, but the only frontmatter field it changed was `completed_plans: 15 → 16`; `percent: 10` and the `Progress: [██░░░░░░░░] 20% (2 of 10 milestone phases)` line are untouched. That is the *desired* outcome here — this project's progress line counts milestone **phases**, not plans — but the mismatch between the reported number and the written one is exactly the shape that would be mistaken for a corruption by the next reader, so it is recorded rather than left to be re-discovered.
- **No helper maintains the Velocity `Total plans completed:` line.** It went 16 → 17 (04-01) → 18 (04-02) → 18 (04-03, missed) → 19 (04-04) purely by hand. Incremented to 20 here, with the total execution time nudged 2.2 → ~2.3 hours.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [PERF-04]` and the workflow's default is to check it off. That default was **not** followed, for the reason under *Decisions Made*. `REQUIREMENTS.md` still reads `- [ ] **PERF-04**` and `| PERF-04 | Phase 4 | Pending |`, verified after the state updates.

## Threat Model Disposition

- **T-04-05 (Denial of Service, the six total-volume accumulators) — mechanism shipped, wiring pending.** Every accumulator has a cap constant and a retention policy sized to what its consumer actually reads, and the `-t "both ends"` case proves the bound *numerically* (`rendered.length <= maxChars + marker.length`) rather than proving that truncation merely occurred. Note this is only the **pure** half: `index.ts` still grows all seven strings without limit. The threat is not mitigated in the running product until 04-09 (sites 1-6) and 04-10 (site 7) wire it.
- **T-04-06 (Denial of Service, `callMcpMethod`'s `stdoutBuffer`) — mechanism shipped, wiring pending.** Both halves are addressed in one function: the carried remainder is capped at 4 MiB and dropped whole with a counted `droppedChars`, and the O(k·n) per-line rescan becomes one split per chunk. The CPU half is not cosmetic — Caido's runtime is single-threaded and that event loop runs the RPC keep-alive. The ≤10 s `callMcpMethod` timeout was explicitly rejected as a substitute: it bounds the window, not the volume.
- **T-04-17 (overflow policy) — mitigated by construction.** The module holds no `ChildProcess` handle and is passed none — it has zero imports, so any `proc.kill(…)` would be a `TS2304` that `pnpm typecheck` fails on. The divergence from Node's `child_process.exec` `maxBuffer` precedent is recorded in the header so a later reader does not "align with Node" and reintroduce it.
- **T-04-18 (Repudiation, silent truncation) — mitigated.** `buildTruncationMarker` embeds the cumulative dropped count, `renderBoundedBuffer` emits it whenever anything was lost, and the `-t "marker"` case reconciles the count against `total - (head.length + tail.length)`. A user reading a short answer can tell it was cut rather than assuming the model stopped.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed; `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across both commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-06 is unblocked and unchanged.** It should still write its **own** `CLAUDE_LINE_BUFFER_MAX_CHARS` and its own split-once loop inside `claude-print.ts` rather than importing `drainCompleteLines`. The reason is recorded at the top of `bounded-buffer.ts`: the Claude remainder lives inside a multi-field `ClaudePrintState` threaded through handler callbacks, its 393-line test file is the CMP-01 regression net, and importing this module would move 04-06 out of wave 1 into a dependency on this plan for zero behavioural gain. **Make the constant 4 MiB** — `bounded-buffer.test.ts`'s `it("uses one shared value for every unterminated-line cap in the phase")` names it in a comment, and a third number for one hazard is the thing that reads as an oversight.
- **Plan 04-09 task 2** wires sites 1-4 with `createBoundedBuffer` + `appendBounded` + `renderBoundedBuffer` at the two `data` handlers per site. The existing `text.slice(0, 400)` at `index.ts:2492`/`:2580` is a **log preview**, not the accumulator — leave it alone.
- **Plan 04-09 task 3** wires sites 5 and 6. Site 6 replaces the whole `:1269-1291` loop body: `const drained = drainCompleteLines({ buffered: stdoutBuffer, chunk: chunk.toString(), maxRemainderChars: MCP_SELFTEST_LINE_MAX_CHARS }); stdoutBuffer = drained.remainder;` then iterate `drained.lines` with the existing `JSON.parse` inside its tolerant `try`. Note that `stdoutBuffer` is *also* read at `:1233` (`activeSelfTestPoll`) and `:1306` (the close handler) as a fallback error string — the remainder is what those two now see, which is correct, but do not delete either read.
- **Plan 04-10 task 1** wires site 7 while it relocates `index.ts:854-862` into the resolution cache's resolver callback. It reuses `SPAWN_STDOUT_MAX_CHARS` with `head` retention; no new constant.
- **`droppedChars` has no consumer yet, on either mechanism.** When the wiring lands, a non-zero value is worth one `sdk.console.log` line — same note 04-04 left for `droppedBytes`. Not required for PERF-04, but a silent 4 MiB drop is exactly the invisible hole the drop-whole policy exists to make visible.
- **Known non-blocker for the verifier:** all fifteen exports have **zero production call sites**. This is expected, not a stub — fifth instance of this shape in Phase 4 after `buildSpawnEnv` (04-01), `withFsRetry` (04-02), the eight `runtime-probe.ts` exports (04-03) and the eight `activity-tail.ts` exports (04-04). `index.ts` is untouched by this plan, verified by `git diff --name-only`.
- `index.ts`, `claude-print.ts`, `command-resolution.ts`, `platform.ts`, `fs-retry.ts`, `runtime-probe.ts` and `activity-tail.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/bounded-buffer.ts` — FOUND
- `packages/backend/src/bounded-buffer.test.ts` — FOUND
- `.planning/phases/04-platform-foundation/04-05-SUMMARY.md` — FOUND
- Commit `a2c03a2` — FOUND
- Commit `5a01353` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
