---
phase: 04-platform-foundation
plan: 04
subsystem: infra
tags: [typescript, vitest, performance, streaming, utf-8, buffer, llrt, offset-tailing, dependency-injection]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — activity-tail.ts imports only `buffer` and `fs/promises`, no local module, not even ./platform. 04-01/04-02/04-03 supplied the convention (pure core + sibling .test.ts + injected facts), not an API"
provides:
  - "packages/backend/src/activity-tail.ts — eight exports: ActivityCursor, ActivityFileHandle, ACTIVITY_MAX_TICK_BYTES, ACTIVITY_PARTIAL_MAX_BYTES, createActivityCursor, planActivityRead, consumeActivityChunk, readActivityTick"
  - "planActivityRead — the pure offset half of PERF-02: reset below the recorded offset, idle when equal (the 250 ms common case), otherwise a read clamped to ACTIVITY_MAX_TICK_BYTES"
  - "consumeActivityChunk — the byte-safe partial-line carry (Pitfall 4) with the T-04-14 remainder bound and a counted droppedBytes"
  - "readActivityTick — the per-tick open/stat/read/close with an INJECTABLE open, an exact-length Buffer.alloc carrying the LLRT copy_from_slice note, and a never-throws contract"
  - "packages/backend/src/activity-tail.test.ts — 20 cases resolving all five 04-VALIDATION.md PERF-02 selectors, two of them against a real mkdtemp file"
affects: [04-08, 04-11, backlog-999.1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (ninth instance of the existing repo pattern)"
    - "A deliberate, recorded departure: this module owns its own I/O with `open` injected, because that is what moves two validation rows from un-provable to integration-tested"
    - "Positive control before negative assertion, reused from 04-03: the utf-8 case asserts the naive string decode IS lossy at the chosen index before asserting the Buffer carry is not"

key-files:
  created:
    - packages/backend/src/activity-tail.ts
    - packages/backend/src/activity-tail.test.ts
  modified: []

key-decisions:
  - "This module owns open/stat/read/close instead of leaving it in index.ts, with `open` injectable. That is a departure from 'all I/O stays in index.ts' and it is the right one here: index.ts has zero direct test coverage, and 04-VALIDATION.md grades the truncation-reset and no-new-bytes rows as INTEGRATION tests against a real file. Owning the I/O in a testable module is what makes those two rows provable at all. The pure decisions are still separately exported and separately tested."
  - "`partial` is a Buffer and not a string. claude-print.ts is the named analog and `buffer: string` (`:90`) is the ONE field of it that must not be copied — a multi-byte UTF-8 sequence split across a read boundary is decoded permanently wrong if the remainder is carried as a string. Enforced by the type system (a string there is a TS2345 at `Buffer.concat`) and by the `-t \"utf-8\"` case behaviourally."
  - "The remainder is bounded at ACTIVITY_PARTIAL_MAX_BYTES (4 MiB) SEPARATELY from ACTIVITY_MAX_TICK_BYTES (1 MiB). The per-tick clamp caps one allocation; an unterminated line accumulates across ticks, so 100 ticks of 1 MiB reach 100 MiB in cursor.partial. Same value and same drop-whole policy as plan 04-06's CLAUDE_LINE_BUFFER_MAX_CHARS on purpose — identical hazard shape, identical answer."
  - "The over-cap remainder is dropped WHOLE and counted, never truncated-and-parsed: a truncated JSON line is unparseable and index.ts's tolerant catch would swallow it, converting a visible, counted drop into a silent hole in the activity feed."
  - "PERF-02 was NOT marked complete. index.ts:2158 still does readFile(activityFilePath, \"utf-8\") every 250 ms and has no call site for any of these eight exports. Fourth consecutive Phase 4 plan making this call after 04-01 (RUN-03/CMP-02/RUN-05), 04-02 (RUN-04) and 04-03 (RUN-05), matching Phase 3's CI-02 precedent."

patterns-established:
  - "A validation selector is quoted verbatim in the test file's own header comment, with the reason the literal matters (vitest -t is a substring match), so the next editor cannot reword a title into silence"
  - "When a module deliberately breaks a phase-wide layering rule, the reason is written at the top of the module AND in the plan, so the next reader does not 'fix' it back"

requirements-completed: []  # Deliberately empty — see Decisions Made. PERF-02 has zero production call sites; 04-08 carries the integration.

# Metrics
duration: 7min
completed: 2026-08-14
---

# Phase 4 Plan 04: PERF-02's Offset Cursor and Byte-Safe Partial Line Summary

**A two-import `activity-tail.ts` that replaces the *input* to the 250 ms activity loop — a byte cursor, a positional read clamped at 1 MiB, and a partial-line remainder carried as a `Buffer` so an em-dash split across a read boundary survives — with the LLRT `copy_from_slice` panic documented at the exact `Buffer.alloc` site it constrains, because that is the one property no test on Node can ever observe.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-08-14T12:43:12Z
- **Completed:** 2026-08-14T12:50:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/activity-tail.ts` (260 lines) exports the eight symbols the plan locks, in the plan's order. Two imports only — `buffer` and `fs/promises`, both already in `index.ts` (`:4`, `:2`) — so no new runtime surface reaches Caido's LLRT host.
- `packages/backend/src/activity-tail.test.ts` (366 lines, 20 cases) resolves **all five** `04-VALIDATION.md` PERF-02 selectors: `-t "partial"` → 4, `-t "utf-8"` → 1, `-t "truncation"` → 1, `-t "no new bytes"` → 1, `-t "partial cap"` → 3.
- The exact-length allocation is the single statement `const buffer = Buffer.alloc(plan.length);`, carrying a 15-line anchored comment naming `dst_buf[offset..].copy_from_slice(&buf)`, the `validate_length_offset` gap that lets a *smaller* length pass validation and then panic, and the `// -1 is not supported` position note. **That comment is the deliverable** for the one PERF-02 row graded static.
- The `-t "utf-8"` case splits *inside* the em-dash's three-byte sequence and is non-vacuous by construction: it first asserts the naive string decode of that same prefix **does** contain U+FFFD, then asserts the reassembled line does not — so a boundary that happened to be safe would fail the test rather than pass it silently.
- The partial cap is falsifiable in **both** directions (over-cap drops and counts 128 bytes; under-cap stays buffered with `droppedBytes` 0), plus a third case proving the bound reaches the remainder and never a chunk that contains newlines.
- Full suite went 191 → **211 tests, 27 files, 0 failures** (exactly +20, +1 file). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write activity-tail.ts — cursor, read plan, byte-safe bounded chunk consumer, per-tick reader** — `cffddb7` (feat)
2. **Task 2: Write activity-tail.test.ts — pure unit cases plus real-file integration cases** — `f10c0ff` (test)

## Files Created/Modified

- `packages/backend/src/activity-tail.ts` — `ActivityCursor`, `createActivityCursor`, `ACTIVITY_MAX_TICK_BYTES`, `ACTIVITY_PARTIAL_MAX_BYTES`, `planActivityRead`, `consumeActivityChunk`, `ActivityFileHandle`, `readActivityTick`, plus one non-exported `boundPartial`. Every constraint it encodes is cited at the code that consumes it: Pitfall 3 at the `Buffer.alloc`, Pitfall 4 at the decode, T-04-14 at the cap, T-04-16 (`EBUSY`) at the `finally` close, and `parseRuntimeActivityEvents` (`index.ts:622-634`) at the line split.
- `packages/backend/src/activity-tail.test.ts` — 4 top-level describes / 20 cases. Seven pure `consumeActivityChunk` cases, four pure `planActivityRead` cases, six real-file `readActivityTick` cases, two constructor/constant cases.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Eight exports | `grep -nE '^export (const\|function\|async function\|type)' …/activity-tail.ts` | 8 lines, matching the frontmatter list exactly |
| Exact-length alloc in statement position | `grep -cE '^[[:space:]]*const [A-Za-z]+ = Buffer\.alloc\(plan\.length\);' …` | `1` |
| Every other alloc enumerated, not counted | `grep -n 'Buffer\.alloc(' …` | 3 sites: `:36` length `0`, `:113` length `0`, `:226` length `plan.length`. No site reuses a larger buffer with a smaller read length |
| LLRT panic note anchored | `grep -n "copy_from_slice" …` | `:213`, `:214` — inside the comment block that runs `:212-225`, immediately above the `Buffer.alloc` at `:226` |
| Per-tick close rationale | `grep -n "EBUSY" …` | `:242`, in the `finally` |
| Remainder bound declared and used | `grep -c "ACTIVITY_PARTIAL_MAX_BYTES" …/activity-tail.ts` | `2` (declaration + the `??` default in `consumeActivityChunk`); value asserted `4194304` by test |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/activity-tail.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/activity-tail.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run …/activity-tail.test.ts` | 20 passed / 0 failed |
| PERF-02 `-t "partial"` | selector run | `4 passed \| 16 skipped (20)` |
| PERF-02 `-t "utf-8"` | selector run | `1 passed \| 19 skipped (20)` |
| PERF-02 `-t "truncation"` | selector run | `1 passed \| 19 skipped (20)` |
| PERF-02 `-t "no new bytes"` | selector run | `1 passed \| 19 skipped (20)` |
| PERF-02 / T-04-14 `-t "partial cap"` | selector run | `3 passed \| 17 skipped (20)` |
| Real-file harness | `grep -c "mkdtemp" …/activity-tail.test.ts` | `3`; `afterEach` at `:226` with `rm(dir, { recursive: true, force: true })` at `:228` |
| No focused tests | `grep -cE '(describe\|it)\.only\(' …/activity-tail.test.ts` | `0` |
| No fake timers | `grep -c "useFakeTimers" …` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| Blast radius | `git diff --name-only HEAD~2 HEAD` | exactly the two new files |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~2 HEAD -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| CMP-01 regression net | `pnpm exec vitest run` | 27 files / **211** tests / 0 failed (was 26 / 191 — exactly +20) |

Method note, carrying the `[03-03]`/`[03-04]`/`[04-02]`/`[04-03]` lesson about extraction pipelines: each `-t` run was ANSI-stripped before the `grep`, and every one was validated against the independently-known total of 20 — each reported `N passed | 20-N skipped (20)`. A silently-empty extraction would otherwise be indistinguishable from a green result, which is precisely the failure mode the `no new bytes` / "no new lines" hazard describes.

## Decisions Made

- **This module owns its own I/O, deliberately.** `readActivityTick` performs `open` → `stat` → `read` → `close` rather than leaving that sequence in `index.ts`, with `open` injectable and defaulting to the real `fs/promises` one. That is a recorded departure from the phase's "all I/O stays in `index.ts`" convention, taken because `index.ts` has zero direct test coverage and `04-VALIDATION.md` grades the truncation-reset and no-new-bytes behaviours as **integration** tests against a real file. Owning the I/O here is the only thing that makes those two rows provable. The pure decisions (`planActivityRead`, `consumeActivityChunk`) remain separately exported and separately tested, so nothing was lost. **Do not "fix" this back into `index.ts`.**
- **`partial` is a `Buffer`, and that is the one thing the named analog gets wrong for this use.** `claude-print.ts:90` carries `buffer: string`; copying it here would decode a half-finished UTF-8 sequence at every chunk boundary and bake a permanent U+FFFD into any tool result containing an em-dash, an IDN hostname, or a non-ASCII response snippet — `JSON.stringify` does not escape non-ASCII, so those bytes arrive raw. The plan deleted its `grep -c 'partial: string'` gate as duplicative and it was right to: `Buffer.concat([cursor.partial, bytes])` makes a `string` there a compile error, which `pnpm typecheck` — this task's own verify — fails on.
- **Two ceilings, not one, because they bound two different things.** `ACTIVITY_MAX_TICK_BYTES` (1 MiB) clamps a single allocation; `ACTIVITY_PARTIAL_MAX_BYTES` (4 MiB) clamps a remainder that accumulates *across* ticks. One does not imply the other: a 100 MiB unterminated record passes the per-tick clamp 100 times and still reaches 100 MiB in `cursor.partial`. The 4 MiB value and the drop-whole policy match plan 04-06's `CLAUDE_LINE_BUFFER_MAX_CHARS` on purpose — the hazard shape is identical, and two different answers to one hazard inside one phase reads as an oversight. The asymmetry that *is* intended is commented: 04-06 counts UTF-16 code units because its buffer is a string; this one counts **bytes**, because Pitfall 4 requires the remainder to stay a `Buffer`.
- **The over-cap remainder is dropped whole, never truncated and parsed.** A truncated JSON line is unparseable, and `index.ts`'s existing tolerant `catch` would swallow it — converting a visible, counted drop into a silent hole. `droppedBytes` is the counter that keeps it visible.
- **A `"reset"` replaces the cursor with a completely fresh one**, discarding the carried `partial` as well as the offset: after a truncation or rotation, the half-line the old cursor was holding describes content that no longer exists, and prepending it to byte 0 of the new file would manufacture a corrupt record. `droppedBytes` resets with it, which is the plan's literal instruction and the right call — the counter describes the current file's stream.
- **`requirements-completed` is deliberately empty.** `PERF-02` appears in this plan's frontmatter but `index.ts:2158` still does `readFile(activityFilePath, "utf-8")` every 250 ms, and none of the eight exports has a production call site. Fourth consecutive Phase 4 plan making this call, after 04-01, 04-02 and 04-03, and matching Phase 3's CI-02 precedent. It stays `Pending` in `REQUIREMENTS.md` until 04-08 wires it.
- **The `it` titles are quoted in the test file's own header** together with the reason the literal matters. `-t "no new bytes"` versus a natural-reading "no new lines" is a one-word difference that silently matches zero tests while still reading correctly to a human — the same class of silent-empty-extraction failure Phase 3 hit three times in log pipelines.

## Deviations from Plan

Neither task deviated. Both files were written as specified, both passed their own `<verify>` on the first run, and no lint, typecheck or behavioural fix was needed. No Rule 1/2/3 auto-fix was applied to any source file.

Four tests beyond the plan's enumerated list were added; none collides with a `-t` selector in a way that changes the counts recorded above:

- `describe("createActivityCursor")` with two cases, which mechanically discharge two of Task 1's acceptance criteria (`partial` is a `Buffer` of length 0 with `droppedBytes` 0; `ACTIVITY_PARTIAL_MAX_BYTES` is `4194304`) from inside the suite rather than from a one-off grep.
- `it("leaves the offset untouched so the caller can advance it by bytesRead")` — the offset pass-through is a documented contract `readActivityTick` depends on, and nothing else asserted it.
- `it("carries a torn append across ticks and emits the record once its newline lands")` — the real-file counterpart of the `-t "partial"` unit case, which is the scenario RESEARCH assumption **A7** actually describes (a torn `appendFileSync` observed by the reader).
- `it("clamps one tick to maxBytes and finishes the file on the following ticks")` — T-04-09's clamp end to end, proving the clamp, the remainder carry and the offset advance compose correctly across three ticks.

Two mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter; both paths are inside `pnpm format`'s glob). Prettier reflowed the `planActivityRead` reset return, the `maxPartialBytes` default, the `boundPartial` call in the return position, the `handle.read` argument list and several `expect(...)` calls. No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5-8 byte-stability fence are unaffected.
- Zero packages installed, as T-04-SC requires.

### Bookkeeping deviations

See the numbered entries under *Issues Encountered* — the three known `gsd-sdk` misfires that 04-01, 04-02 and 04-03 all recorded reproduced again and were repaired by hand.

## Issues Encountered

None in the source work. Both tasks passed their own `<verify>` commands on the first attempt.

**1. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the fourth time**

- **Found during:** post-task state updates (not a task)
- **Issue:** The known carry-forward from 04-01, 04-02 and 04-03, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — backlog item **999.1** (the event-driven `sendCliMessage` refactor) — and writes Phase 4's count into it. It also re-mangled the Progress table row's trailing cell, undoing 04-03's tidy, which had undone 04-02's, which had undone 04-01's.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 (all eleven 999.x items read it again — asserted by count, not by eye) and the table row to `| 4. Platform Foundation | 4/11 | In Progress | - |`. Phase 4's real progress lives where it belongs: the Progress table row and the `04-04-PLAN.md` checkbox, both of which the helper sets correctly.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** full `diff` against a pre-run snapshot shows exactly the two intended changes and nothing else; `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11`.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. Snapshot `ROADMAP.md` before the call and `diff` after — a count check alone does **not** catch the trailing-cell mangling. Ordering also matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**2. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 and 04-03 recorded**

- **Found during:** post-task state updates (not a task)
- **Issue:** Confirmed by diffing `STATE.md` against a pre-run snapshot rather than by trusting exit codes. `advance-plan` reset `Status:` to "Ready to execute" mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare date; `record-metric` appended a 4-column row below the `*Updated after each plan completion*` footer, orphaned from the differently-shaped **By Phase** table.
- **Fix:** Restored `Status: Executing Phase 4` and the descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 4 of 11`) and the **Recent Trend** last-5 list, and deleted the stray table row.
- **Files modified:** `.planning/STATE.md`
- **What did NOT misfire:** `record-session` was invoked with `--stopped-at` / `--resume-file` and `add-decision` with `--phase` / `--summary`, per 04-02's warning; the diff confirms every value landed correctly. The positional form *succeeds silently while writing garbage*, so the named-flag form **plus a diff** is the durable rule, not the exit code.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [PERF-02]` and the workflow's default is to check it off. That default was **not** followed, for the reason under *Decisions Made*. `REQUIREMENTS.md` still reads `- [ ] **PERF-02**` and `| PERF-02 | Phase 4 | Pending |`, verified after the state updates.

## Threat Model Disposition

- **T-04-09 (Denial of Service, per-tick allocation) — mitigated.** Every read is clamped by `planActivityRead` to `ACTIVITY_MAX_TICK_BYTES` (1 MiB), and the buffer is allocated to exactly that clamped length. A runaway writer cannot force an arbitrarily large single allocation on Caido's single-threaded heap. Proven by the `clamps the planned length to maxBytes` unit case (including that the default really is `ACTIVITY_MAX_TICK_BYTES`) and end to end by the three-tick real-file clamp case.
- **T-04-14 (Denial of Service, carried remainder) — mitigated.** The remainder is capped at `ACTIVITY_PARTIAL_MAX_BYTES` (4 MiB) and dropped whole with a counted `droppedBytes`. Proven in **both** directions by the `-t "partial cap"` trio: over-cap drops and counts, under-cap stays buffered, and a newline-bearing chunk longer than the cap loses nothing. The bound is applied to the remainder only, never to the merged pre-split buffer — a buffer with newlines drains naturally.
- **T-04-15 (Tampering, JSON line parsing) — mitigated, with a standing warning.** Line semantics are `parseRuntimeActivityEvents`'s exactly (split, trim, drop empty); the `JSON.parse` and its tolerant `catch` stay in `index.ts`. **`seenActivityIds` must NOT be removed as "now redundant" when 04-08 wires this in** — a truncation reset re-reads from byte 0, so re-delivery is unlikely but not impossible, and that Set is the correctness backstop.
- **T-04-16 (Denial of Service, held file handle) — mitigated.** The handle is opened and closed every tick, in a `finally` with its own `catch` so a close failure can neither mask a successful read nor make the function throw. A handle held across ticks would block `rm(activityFilePath)` at `finalize()` on Windows with `EBUSY`, leaving a token-adjacent runtime file on disk. Four opens per second is negligible next to that.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed; `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across both commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-08 can consume this immediately.** The wiring is a three-line change inside `sendCliMessage`: `let cursor = createActivityCursor();` in the closure beside `seenActivityIds` (closure-local ⇒ per-session by construction, dies with the turn — do **not** use a Map, which would need explicit cleanup and could leak), then replace the `readFile` + `parseRuntimeActivityEvents` pair at `index.ts:2158-2159` with `const { cursor: next, lines } = await readActivityTick({ filePath: runtimeFiles.activityFilePath, cursor })`, then `JSON.parse` each line inside the existing tolerant `try`. The `readingActivities` re-entrancy flag and the `seenActivityIds` dedupe Set both stay exactly where they are.
- **Known non-blocker for the verifier:** all eight exports have **zero production call sites**. This is expected, not a stub — fourth instance of this shape in Phase 4 after `buildSpawnEnv` (04-01), `withFsRetry` (04-02) and the eight `runtime-probe.ts` exports (04-03). `index.ts` is untouched by this plan.
- **`droppedBytes` currently has no consumer.** When 04-08 wires the cursor in, a non-zero `droppedBytes` is worth one `sdk.console.log` line — a silent 4 MiB drop is exactly the invisible-hole failure the drop-whole policy exists to avoid. Not required for PERF-02, but cheap and the natural place for it is the same tick loop.
- **Do not merge `ACTIVITY_MAX_TICK_BYTES` and `ACTIVITY_PARTIAL_MAX_BYTES` into one constant.** They bound different things (one allocation vs. an accumulation across ticks) and the comment at each says so; collapsing them silently removes the T-04-14 mitigation while leaving a plausible-looking cap in place.
- **Plan 04-06 should reuse the shape, not the units.** `CLAUDE_LINE_BUFFER_MAX_CHARS` should be the same 4 MiB with the same drop-whole-and-count policy, counting UTF-16 code units because its buffer is a string. The asymmetry is already commented here; the two constants should read as one decision.
- `index.ts`, `command-resolution.ts`, `claude-print.ts`, `platform.ts`, `fs-retry.ts` and `runtime-probe.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/activity-tail.ts` — FOUND
- `packages/backend/src/activity-tail.test.ts` — FOUND
- `.planning/phases/04-platform-foundation/04-04-SUMMARY.md` — FOUND
- Commit `cffddb7` — FOUND
- Commit `f10c0ff` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
