---
phase: 04-platform-foundation
plan: 06
subsystem: infra
tags: [typescript, vitest, performance, streaming, dos-mitigation, refactor, split-once, claude-cli, production-wired]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — claude-print.ts still imports NOTHING, and deliberately does NOT import ./bounded-buffer. 04-04 and 04-05 supplied the cap VALUE and the drop-whole policy as a convention to match, not an API to call"
provides:
  - "packages/backend/src/claude-print.ts — two new exports (CLAUDE_LINE_BUFFER_MAX_CHARS, getClaudePrintDroppedChars) and one new ClaudePrintState field (droppedChars)"
  - "PERF-04 site B, LIVE: the Claude stream parser's line buffer is bounded at 4 MiB with a counted whole-drop, in the running product — index.ts:2496 already calls consumeClaudePrintChunk on every Claude turn"
  - "The O(k·n) per-line indexOf/slice rescan replaced by one split(\"\\n\") + pop() per chunk, with one state spread per chunk instead of one per line (T-04-06)"
  - "finalizeClaudePrintOutput surfaces the drop, guarded on droppedChars > 0 so every pre-drop return value is byte-identical"
  - "packages/backend/src/claude-print.test.ts — 10 → 18 cases, ADDITIONS ONLY (261 insertions, 0 deletions)"
affects: [04-09, 04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "First Phase 4 plan to MODIFY an existing, production-wired file rather than create a pure module — the pattern it establishes is the proof discipline, not the module shape"
    - "A behaviour-identical refactor is proven by `git diff --numstat` reporting 0 deletions PLUS an explicit equivalence test, never by 'the suite is still green'"
    - "A second import block rather than an edit to the first, when the existing lines are themselves the regression evidence"
    - "New lines hand-aligned to Prettier's output instead of running `prettier --write`, because the file carries pre-existing 999.11 debt"

key-files:
  created: []
  modified:
    - packages/backend/src/claude-print.ts
    - packages/backend/src/claude-print.test.ts

key-decisions:
  - "This is the FIRST Phase 4 plan whose code ships live behaviour. index.ts:65 imports claude-print.ts and :2207/:2496 call it on every Claude turn, so unlike 04-01..04-05 (whose exports all had zero production call sites) T-04-05 and T-04-06 are mitigated in the running product today. The verifier should NOT expect the 'zero call sites, expected not a stub' note here — it does not apply."
  - "PERF-04 was still NOT marked complete, but for a DIFFERENT reason than the five plans before it. Site B is wired and live; PERF-04 also covers the seven index.ts accumulators, every one of which is still unbounded (04-09 wires sites 1-6, 04-10 site 7). Marking it complete here would claim six unbounded sites are bounded."
  - "The bound is on the POST-SPLIT remainder, never on the concatenation. Everything before the last newline is a complete line about to be emitted; bounding `combined` would discard legitimate output AND still pass a naive over-cap test. The falsifiability partner — an over-cap but newline-TERMINATED chunk drops nothing — is exactly what that wrong implementation fails."
  - "CLAUDE_LINE_BUFFER_MAX_CHARS is 4 MiB with the drop-whole-and-count policy, closing the phase's three-way cap symmetry with ACTIVITY_PARTIAL_MAX_BYTES (04-04) and MCP_SELFTEST_LINE_MAX_CHARS (04-05). The value is asserted from inside the suite, mirroring bounded-buffer.test.ts's identically-purposed case, rather than left to a one-off grep."
  - "claude-print.ts still imports nothing — ./bounded-buffer's drainCompleteLines was deliberately NOT used. 04-05's own header records why: the Claude remainder lives inside a multi-field ClaudePrintState threaded through handler callbacks, and importing it would have moved this plan out of wave 1 for zero behavioural gain."
  - "`prettier --write` was deliberately not run on either file. Both are inside `pnpm format`'s glob but carry backlog 999.11's pre-existing debt, so --write would have reformatted pre-existing lines and destroyed the additions-only property that 04-VALIDATION.md's regression row grades."

patterns-established:
  - "When the existing lines of a file ARE the evidence, additions go in a second import block and a diff-level `0 deletions` assertion becomes a first-class gate alongside the test run"
  - "Prettier compliance for new lines in a not-yet-formatted file is verified by formatting a scratch COPY and confirming every remaining delta lands on a pre-existing line"

requirements-completed: []  # Deliberately empty — see Decisions Made. Site B is live but PERF-04's seven index.ts accumulators are still unbounded; 04-09/04-10 carry them.

# Metrics
duration: 10min
completed: 2026-08-14
---

# Phase 4 Plan 06: PERF-04 Site B — the Bounded Claude Line Buffer and the Split-Once Drain Summary

**The first Phase 4 change that is live rather than staged: `claude-print.ts` — already called on every Claude turn at `index.ts:2496` — stops growing an unterminated line without bound (4 MiB cap, dropped whole, counted, surfaced) and stops re-copying the whole remainder once per line, all while the ten pre-existing test cases stay green and byte-for-byte unedited, which is the only thing that makes "behaviour-identical" a claim rather than an assertion.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-14T13:12:00Z
- **Completed:** 2026-08-14T13:24:00Z
- **Tasks:** 2 (plus one cap-symmetry addition, committed separately)
- **Files modified:** 2 (both pre-existing; **0 created**)

## Accomplishments

- `packages/backend/src/claude-print.ts` (346 → **415** lines) gained exactly two exports and one state field. It still has **zero import statements**, and in particular does **not** import `./bounded-buffer`.
- The `while (newlineIndex !== -1)` loop with its per-line `slice` + rescan + object spread is gone, replaced by `combined.split("\n")` + `parts.pop()` + a `for (const raw of parts)` loop and **one** state spread after it.
- `packages/backend/src/claude-print.test.ts` (393 → **654** lines, 10 → **18** cases) is **261 insertions and 0 deletions**. All ten pre-existing `it` titles compare byte-for-byte identical against `HEAD~3`.
- `-t "unterminated"` resolves to **4 passed | 14 skipped (18)** — validated against the independently-known total, so a silently-empty selector cannot be mistaken for a green one.
- The drop path is falsifiable in **both** directions and at the boundary: over-cap drops and counts; under-cap stays buffered; **exactly at the cap** stays buffered (the bound drops on `>`, not `>=`); and an over-cap **newline-terminated** chunk loses nothing.
- Full suite went 227 → **235 tests, 28 files, 0 failures** (exactly +8, no new file). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Bound the line buffer and replace the per-line slice loop with a single split** — `2626aa2` (feat)
2. **Task 2: Append drop-path and split-equivalence cases to claude-print.test.ts** — `aa11a33` (test)
3. *Addition beyond the plan's enumerated list:* **pin the 4 MiB cap symmetry from inside the suite** — `46a0738` (test)

## Files Created/Modified

- `packages/backend/src/claude-print.ts` — **modified**. New: `CLAUDE_LINE_BUFFER_MAX_CHARS`, `ClaudePrintState.droppedChars`, `getClaudePrintDroppedChars`, the split-once prologue, the post-split remainder bound, and the `droppedChars > 0`-guarded notice in `finalizeClaudePrintOutput`. Untouched: `normalizeUsage`, `mergeUsage`, `normalizeToolId`, the two content-type predicates, `clearRecoverableText`, every per-event branch inside the loop, `getClaudePrintUsage`, `getClaudePrintRecoveryMode`, `didClaudeStopWithoutResult`.
- `packages/backend/src/claude-print.test.ts` — **modified, additions only**. Two new top-level describes (`claude-print line buffer bounds`, 6 cases; `claude-print chunk splitting`, 2 cases) plus a second import block. The original `describe("claude print parsing")` and all ten of its cases are untouched.

## The two changes, and why conflating them was the named pitfall

| | Hazard | Mechanism | Threat | Proven by |
|---|---|---|---|---|
| **1** | One never-terminated line grows `state.buffer` for the whole turn | Cap the **post-split remainder** at 4 MiB, drop it **whole**, count it in `droppedChars`, surface it in `finalizeClaudePrintOutput` | T-04-05, T-04-18 | `-t "unterminated"` + three partners (under-cap, at-cap, newline-terminated) |
| **2** | `indexOf`/`slice` copies the whole remainder and rescans from 0 **per line**, plus a spread per line — O(k·n), k routinely 10-50 | One `split("\n")` + `pop()` per chunk; one state spread per chunk | T-04-06 | 0 deletions in the 393-line suite + an explicit single-chunk-vs-byte-by-byte equivalence case |

RESEARCH § *Pitfall 5* names the failure mode precisely: bounding without fixing the slicing caps the memory and leaves the stutter. Under Caido's single-threaded runtime the parser shares an event loop with the RPC keep-alive the watchdog depends on, which is why the CPU half is an **availability** concern and not a cosmetic one.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Cap declared and used | `grep -c "CLAUDE_LINE_BUFFER_MAX_CHARS" …/claude-print.ts` | `3` (≥ 2 required) |
| Cap value | `grep -n 'export const CLAUDE_LINE_BUFFER_MAX_CHARS' …` + suite assertion | `4 * 1024 * 1024`; asserted `=== 4194304` inside the suite |
| Counter threaded through | `grep -c "droppedChars" …/claude-print.ts` | `7` (≥ 4 required) |
| Old loop gone — statement anchor 1 | `grep -cE '^[[:space:]]*while \(newlineIndex' …` | `0` |
| Old loop gone — statement anchor 2 | `grep -cE '^[[:space:]]*let newlineIndex' …` | `0` |
| Split-once form present | `grep -c '\.split("\\n")' …` | `1` (≥ 1 required; two-backslash BRE form, as the plan specifies) |
| No bounded-buffer import | `grep -c '^import.*from "./bounded-buffer"' …` | `0` |
| No imports at all | `grep -c '^import' …/claude-print.ts` | `0` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/claude-print.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/claude-print.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run …/claude-print.test.ts` | 18 passed / 0 failed (was 10) |
| PERF-04 `-t "unterminated"` | selector run, ANSI-stripped | `4 passed \| 14 skipped (18)` |
| **Additions only** | `git diff --numstat HEAD~3 HEAD -- …/claude-print.test.ts` | `261  0` — **zero deletions** |
| Existing cases textually unmodified | `git show HEAD~3:…` vs `git show HEAD:…`, `it("` lines sorted + `comm -23` | `0` pre-existing titles missing; count `10` |
| Existing cases green | included in the 18 above | all 10 pass |
| No focused tests | `grep -cE '(describe\|it)\.only\(' …/claude-print.test.ts` | `0` |
| No fake timers | `grep -c "useFakeTimers" …` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| Blast radius | `git diff --name-only HEAD~3 HEAD` | exactly the two files |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~3 HEAD -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| No file deletions | `git diff --diff-filter=D --name-only` per commit | none |
| CMP-01 regression net | `pnpm exec vitest run` | 28 files / **235** tests / 0 failed (was 28 / 227 — exactly +8) |

Method note, carrying the `[03-03]`/`[03-04]`/`[04-02]`/`[04-03]`/`[04-04]`/`[04-05]` lesson about extraction pipelines: the `-t` run was ANSI-stripped before the `grep` and validated against the independently-known total of 18 (`4 passed | 14 skipped (18)`). A silently-empty selector is otherwise indistinguishable from a green result.

## Decisions Made

- **This plan's code is LIVE, and that is the single most important thing for the verifier to know.** Five consecutive Phase 4 summaries carried a "known non-blocker: all exports have zero production call sites, this is expected, not a stub" note. **That note does not apply here.** `index.ts:65` imports `claude-print.ts` and `:2207`/`:2496` call `createClaudePrintState`/`consumeClaudePrintChunk` on every Claude turn, so `T-04-05` and `T-04-06` are mitigated in the running product as of commit `2626aa2`. The only genuinely unwired new export is `getClaudePrintDroppedChars`.
- **PERF-04 still not marked complete — sixth time, first time for this reason.** 04-01 through 04-05 all withheld their requirement because the module had no call sites. Here site B *is* wired; PERF-04 is withheld because it also covers the **seven** `index.ts` accumulators enumerated in 04-05's inventory table, every one of which is still unbounded. `REQUIREMENTS.md` still reads `- [ ] **PERF-04**` and `| PERF-04 | Phase 4 | Pending |`, verified after the state updates. 04-09 (sites 1-6) and 04-10 (site 7) carry the rest.
- **The bound is on the remainder, never on the concatenation.** A buffer containing newlines drains through the split, so the only unbounded case is a trailing fragment with no terminator. Bounding `combined` would throw away complete lines that were about to be emitted — and it would *still pass* a naive over-cap test, which is precisely why `it("does not drop when the oversized content is newline-terminated")` exists as its partner.
- **Dropped whole, never truncated-and-parsed.** A truncated JSON line is unparseable and the existing `catch { continue; }` would swallow it, converting a counted, visible drop into a silent hole in the answer. Same policy as `consumeActivityChunk` (04-04) and `drainCompleteLines` (04-05), and it is stated in a comment at the drop site so the "cheap" truncate-and-keep alternative reads as forbidden rather than unconsidered.
- **`nextState` starts as `state` itself, not as a spread of it.** The old prologue spread `state` immediately to set `buffer`; the new one does not, because the loop body never reads `.buffer` and the single spread after the loop is what makes the returned object new. The invariant that makes this safe is worth naming: handlers receive only a `delta` or a `sessionId`, never the state, so the momentarily-stale `buffer` field is unobservable. Return-value identity is unchanged — a new object every call, exactly as before.
- **The `> 0` guard in `finalizeClaudePrintOutput` is load-bearing, not defensive.** It is what makes the function byte-identical for every input that dropped nothing, which is the property `04-VALIDATION.md`'s behaviour-identical regression row actually grades. The test asserts the clean path against a **directly-constructed literal** rather than against the function's own earlier output, because comparing a function to itself would pass for any implementation.
- **A second import block, not an edit to the first.** Adding `CLAUDE_LINE_BUFFER_MAX_CHARS` and `getClaudePrintDroppedChars` to the existing import would have put a modified line inside the 393 lines that *are* the behaviour-identity proof. Two import declarations from one module is legal ESM, passes lint and typecheck, and the comment above it states the constraint so the "obvious tidy" is a recorded decision. Merge them once 04-VALIDATION's regression row is discharged, not before.
- **`prettier --write` was deliberately not run.** Both files are inside `pnpm format`'s glob and both are currently *unformatted* — part of backlog 999.11's repo-wide debt. Running `--write` would have reformatted pre-existing lines and destroyed the additions-only property. Instead the three new lines Prettier would have reflowed (`const dropped`, `const output`, one `expect(...)`) were hand-aligned to its output, verified by formatting a scratch **copy** and confirming every remaining delta lands on a pre-existing line. This is the inverse of 04-04's and 04-05's note, and the inversion is caused entirely by "modifies an existing file" versus "creates a new one".
- **`claude-print.ts` still imports nothing.** `drainCompleteLines` was not used, exactly as 04-05's *Next Phase Readiness* instructed and for the reason recorded in `bounded-buffer.ts`'s own header. The two sites are deliberately independent; the shared thing is the 4 MiB value and the drop-whole policy, not code.

## Deviations from Plan

Neither task deviated. Both were implemented exactly as the action specified, both passed their own `<verify>` on the first run, and no Rule 1/2/3 auto-fix was applied to any source file. All seven of Task 1's and all seven of Task 2's acceptance criteria were met as literally written, including the deliberately two-backslash `grep -c '\.split("\\n")'` form and the two statement-anchored `newlineIndex` gates.

**One addition beyond the plan's enumerated list**, committed separately as `46a0738`:

- `it("uses the phase's one shared value for every unterminated-line cap")` asserts `CLAUDE_LINE_BUFFER_MAX_CHARS === 4 * 1024 * 1024` and `=== 4194304` from inside the suite. Task 1's acceptance criterion required the *value* to be `4194304`; it was already satisfied by grep, but `bounded-buffer.test.ts` carries an identically-purposed case that names this constant in a comment while asserting only its own, and 04-04/04-05 both established that a value gate belongs in the suite rather than in a one-off grep the next editor never re-runs. **Side effect worth recording:** its title contains the word "unterminated", so `-t "unterminated"` now matches **4** tests rather than 3. All four are the same T-04-05 bound, so this is a widening of the selector's scope within its own subject, not a dilution.

Two mechanical notes that are *not* deviations:

- Three newly-added lines were hand-reflowed to Prettier's output rather than the files being run through `prettier --write` — see *Decisions Made*. Verified by formatting a scratch copy of each file: every remaining Prettier delta lands on a pre-existing line (999.11's debt), none on a line this plan added.
- Zero packages installed, as T-04-SC requires.

### Bookkeeping deviations

See the numbered entries under *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-05 all recorded reproduced again and were repaired by hand, plus one *new* observation and one *resolved* open question.

## Issues Encountered

None in the source work. Both tasks passed their own `<verify>` commands on the first attempt, the 18-case suite was green on its first run, and the ten pre-existing cases never went red at any point.

**1. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 through 04-05 recorded**

- **Found during:** post-task state updates (not a task)
- **Issue:** Confirmed by diffing `STATE.md` against the committed baseline (`git diff -- .planning/STATE.md`) rather than by trusting exit codes. `advance-plan` correctly advanced *Plan 6 of 11* → *7 of 11* but also reset `Status:` from "Executing Phase 4" to "Ready to execute" mid-phase, and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare `2026-08-14`. `record-metric` appended a 4-column orphan row (`| Phase 04 P06 | 10min | 3 tasks | 2 files |`) *below* the `*Updated after each plan completion*` footer, unrelated to the differently-shaped **By Phase** table above it.
- **Fix:** Restored `Status: Executing Phase 4` and both descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 6 of 11`) and the **Recent Trend** last-5 list, and deleted the stray row.
- **Files modified:** `.planning/STATE.md`
- **Verification:** `git diff -- .planning/STATE.md` reduced to exactly the intended changes and nothing else.

**1b. [Rule 1 - Bug] `state record-session` with NO arguments returned `"recorded": true` and wrote `Resume file: None`**

- **Found during:** probing for the helper's argument names (not a task)
- **Issue:** 04-02's warning is about the *positional* form; this is the **empty** form, and it is worse. `node gsd-tools.cjs state record-session` with no flags at all reported `{"recorded": true, "updated": ["Last session", "Resume File"]}` and overwrote the resume pointer with the literal string `None`, silently discarding `.planning/phases/04-platform-foundation/04-06-PLAN.md`. A workflow that trusts the exit code would leave the next session with no resume file and a success message.
- **Fix:** Re-ran with `--stopped-at` / `--resume-file`; the diff confirms all three fields landed correctly.
- **Carry-forward:** the durable rule stands and gets stronger — **named flags plus a diff**, never the exit code, and never an argument-less invocation to "see what it does".

**1c. [Resolved open question] `add-decision --phase 04` writes the correctly zero-padded prefix**

- 04-05 left this untested: "`add-decision --phase 4` writes `- [Phase 4]:`, not `- [Phase 04]:` … Passing `--phase 04` may avoid it; untested." **Measured here: it does.** Seven decisions were added with `--phase 04` and all seven landed as `- [Phase 04]: [04-06]: …`; `grep -c '^- \[Phase 4\]:'` returns `0` and `grep -c '^- \[Phase 04\]: \[04-06\]:'` returns `7`. No manual `perl -0pi` repair was needed for the first time in the phase. **Use `--phase 04`, zero-padded, from now on.**

**2. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the sixth time**

- **Found during:** post-summary state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-05, reproduced exactly and in both of its forms. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — **`ROADMAP.md:329`, backlog item 999.1** (the event-driven `sendCliMessage` refactor) — and wrote `**Plans:** 6/11 plans executed` into it. It also re-mangled the Progress table's trailing cells, turning `| 4. Platform Foundation | 5/11 | In Progress | - |` into `| 4. Platform Foundation | 6/11 | In Progress|  |` — the count correct, the last two cells corrupted. **A count-only check does not catch the second defect**, which is why the snapshot-and-diff rule exists.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 and the table row to `| 4. Platform Foundation | 6/11 | In Progress | - |`. What the helper got *right* and was kept: the `04-06-PLAN.md` checkbox → `[x]` and the `5/11` → `6/11` count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `git diff -- .planning/ROADMAP.md` reduced to exactly two lines — the checkbox and the count. `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11` (all eleven 999.x items); `grep -c 'plans executed'` → `0`.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. `git diff` before and after the call — a count check alone does **not** catch the trailing-cell mangling. Ordering matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written (`summary_count: 6` confirms it saw this one).

**2b. [Confirmed again, still benign] `state update-progress` reports a percent it does not write**

- Its JSON claimed `{"updated": true, "percent": 77, "completed": 17, "total": 22, "bar": "[████████░░] 77%"}`, but the only frontmatter field it changed was `completed_plans: 16 → 17`. `percent: 10` and the `Progress: [██░░░░░░░░] 20% (2 of 10 milestone phases)` line are both untouched — verified by diff. That is the **desired** outcome for this project, whose progress line counts milestone *phases* and not plans; recorded again only because the gap between the reported number and the written one is exactly the shape a later reader would mistake for corruption. Identical to 04-05's observation.

**1d. [Method note, not a helper bug] A stale scratchpad snapshot produced a misleading first diff**

- The pre-run `cp .planning/STATE.md "$SCRATCH/STATE.before.md"` hit an interactive `overwrite?` prompt because a snapshot from an earlier plan's session was still sitting in the scratch directory. `cp` declined, printed `not overwritten`, and the subsequent `diff` compared today's file against **04-03's** state — showing dozens of unrelated deltas that would have been read as catastrophic corruption. The authoritative baseline for any tracked file is **`git diff`**, not a hand-rolled snapshot; snapshots are only needed for files git does not yet track. Corrected immediately and all findings above are from `git diff`.

## Threat Model Disposition

- **T-04-05 (Denial of Service, `ClaudePrintState.buffer`) — mitigated, and LIVE.** The post-split remainder is capped at `CLAUDE_LINE_BUFFER_MAX_CHARS` (4 MiB) and dropped whole with a counted `droppedChars`. Falsifiable in both directions plus at the boundary: over-cap drops and counts exactly `4195328`; under-cap stays buffered with `droppedChars` 0; **exactly at the cap** stays buffered, pinning the `>` versus `>=` off-by-one; and an over-cap *newline-terminated* chunk loses nothing, proving the bound never reaches the concatenation. Unlike 04-04's and 04-05's mechanisms, this one is already on the production path.
- **T-04-06 (Denial of Service, the slicing loop) — mitigated, and LIVE.** One `split("\n")` per chunk and one state spread per chunk replace the per-line `slice` + rescan + spread. The behaviour-equivalence claim is carried by two independent instruments: `git diff --numstat` reporting `261 0` over the file that *is* the regression net, and an explicit case running one payload as a single chunk and as single-character chunks and comparing the collected `onText` deltas, the `sessionId` and the finalized output. That second instrument is what "the old suite still passes" cannot give you — a suite can be kept green by editing it.
- **T-04-18 (Repudiation, silent drop) — mitigated.** `getClaudePrintDroppedChars` exposes the counter and `finalizeClaudePrintOutput` appends `…[drift: dropped N bytes of unterminated Claude stream output]` whenever anything was lost, so a user reading a truncated answer can tell it was cut. The notice says "bytes" while the counter is UTF-16 code units — the same deliberate wording as `bounded-buffer.ts`'s marker, documented at the function rather than left silently wrong.
- **T-04-19 (Tampering, behaviour drift during the refactor) — mitigated.** Zero deletions in `claude-print.test.ts` across all three commits; all ten pre-existing `it` titles byte-for-byte identical against `HEAD~3`; the full suite `227 → 235` with no file count change. `provider-launch.test.ts`'s exact `toEqual([...])` arrays — the CMP-01 tripwire — are untouched, confirmed by `git diff --name-only HEAD~3 HEAD` listing exactly two files.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed; `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across all three commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **`getClaudePrintDroppedChars` has no consumer.** It is the one genuinely unwired export this plan adds. A non-zero value is worth exactly one `sdk.console.log` line in `sendCliMessage`'s close path — the same note 04-04 left for `droppedBytes` and 04-05 for `drainCompleteLines`. Not required for PERF-04; the natural home is next to the existing watchdog logging.
- **Plan 04-09 is unaffected by this plan and must not "unify" with it.** Its sites 1-6 live in `index.ts` and use `appendBounded` / `drainCompleteLines` from `bounded-buffer.ts`. `claude-print.ts` deliberately owns its own copy of the mechanism and imports nothing; three modules now state that reasoning independently. Do not refactor `claude-print.ts` to call `drainCompleteLines` "for consistency" — the consistency that matters (one 4 MiB value, one drop-whole policy) is already there and is asserted in two suites.
- **The second import block in `claude-print.test.ts` is safe to merge into the first** once `04-VALIDATION.md`'s PERF-04 behaviour-identical regression row is marked discharged, and not before. Its comment says so.
- **`finalizeClaudePrintOutput` now has one behaviour change on the production path**, and it is intentional: with `droppedChars > 0` and no other output it returns a non-empty string, so the `!== ""` guards at `index.ts:2250`, `:2430` and `:2522` will see a value. That is the point — a 4 MiB drop should suppress the watchdog's "no visible output" backstop and surface the notice instead of a blank answer. With `droppedChars === 0` every one of those call sites is byte-identical.
- **Backlog 999.11 (repo-wide Prettier sweep) now has two more files with mixed formatting** — pre-existing lines unformatted, new lines Prettier-clean. The sweep will still be a single mechanical pass; nothing here makes it harder, and the Phase 5-8 spawn-path byte-stability fence is unaffected because `index.ts` was not touched.
- `index.ts`, `command-resolution.ts`, `provider-launch.ts`, `mcp-runtime.ts`, `persistence.ts`, `platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `activity-tail.ts` and `bounded-buffer.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/claude-print.ts` — FOUND (415 lines, 0 imports, 3 × `CLAUDE_LINE_BUFFER_MAX_CHARS`, 7 × `droppedChars`)
- `packages/backend/src/claude-print.test.ts` — FOUND (654 lines, 18 cases)
- `.planning/phases/04-platform-foundation/04-06-SUMMARY.md` — FOUND
- Commit `2626aa2` — FOUND
- Commit `aa11a33` — FOUND
- Commit `46a0738` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
</content>
</invoke>
