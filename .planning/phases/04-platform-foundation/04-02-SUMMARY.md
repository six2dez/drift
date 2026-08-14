---
phase: 04-platform-foundation
plan: 02
subsystem: infra
tags: [typescript, vitest, windows, antivirus, retry, backoff, pure-functions, dependency-injection]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — fs-retry.ts imports nothing, not even ./platform. 04-01 supplied the convention (pure core + sibling .test.ts + injected facts), not an API"
provides:
  - "packages/backend/src/fs-retry.ts — six exports: FS_TRANSIENT_ERROR_CODES, FS_RETRY_DELAYS_MS, isTransientFsError, getFsErrorCode, withFsRetry, FsRetryOutcome"
  - "withFsRetry(operation, { delays, sleep, onRetry }) — bounded backoff orchestrator with an INJECTED sleep, so the ladder is assertable without a real filesystem lock; never throws (spawnAndWait's always-resolves contract)"
  - "FsRetryOutcome<T> — kind-discriminated Ok/Error carrying attempts and lastCode, the shape index.ts already branches on"
  - "packages/backend/src/fs-retry.test.ts — 13 cases resolving all five RUN-04 selectors in 04-VALIDATION.md"
affects: [04-08, 04-11, phase-5-launch-path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (seventh instance of the existing repo pattern)"
    - "Injected async dependency (sleep) — the backend's first dependency-injected async wrapper; nothing else in packages/backend takes an injected async dep"
    - "Callback-out, not log-in: a pure module returns data and takes an onRetry hook; index.ts owns sdk.console"

key-files:
  created:
    - packages/backend/src/fs-retry.ts
    - packages/backend/src/fs-retry.test.ts
  modified: []

key-decisions:
  - "fs-retry.ts imports nothing and does no I/O. The sleep is an injected parameter, which is the ONLY way SC-3's ladder is provable: a real Defender lock cannot be induced deterministically on any CI runner, so the proof is reading back what the orchestrator asked to sleep for."
  - "The transient set is an allow-list, never a deny-list. ENOSPC/EROFS are excluded so a full or read-only volume errors honestly instead of stalling 1.5 s on every MCP start (T-04-11); ENOENT is excluded because a missing parent is a real bug."
  - "RUN-04 was NOT marked complete — withFsRetry has zero production call sites until 04-08 wraps the real mkdir+writeFile at index.ts:1717-1720. Same call 04-01 made, and Phase 3 made for CI-02."
  - "A throw from an injected sleep or onRetry hook is terminal, not an escape. 04-08 routes onRetry into sdk.console, which is not guaranteed non-throwing in Caido's runtime, and a throw here would bypass startMcpServer's error path entirely."

patterns-established:
  - "Union outcomes are asserted with a whole-object toEqual, never `if (outcome.kind === \"Error\") expect(...)` — a conditional expect can silently never run and vitest/no-conditional-expect makes `pnpm lint` fail on it"

requirements-completed: []  # Deliberately empty — see Decisions Made. RUN-04 is shared with 04-08 and 04-11; only its pure half landed here.

# Metrics
duration: 7min
completed: 2026-08-14
---

# Phase 4 Plan 02: The RUN-04 Retry Ladder Summary

**A zero-import, I/O-free `fs-retry.ts` whose `sleep` is injected, so the Windows anti-virus write-then-exec tolerance — retry on `EPERM`/`EBUSY`/`EACCES`/`UNKNOWN`, six attempts across exactly `[50, 100, 200, 400, 750]` ms, one attempt for `ENOENT` — is asserted by reading back what the orchestrator *asked* to sleep for, on the POSIX runner the maintainer actually has.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-08-14T12:13:58Z
- **Completed:** 2026-08-14T12:24:00Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/fs-retry.ts` (192 lines) exports exactly the six symbols the plan locks, with **zero import statements** — `grep -c '^import'` returns `0`, the same mechanically-checkable form of the "no I/O" claim that 04-01 established.
- `packages/backend/src/fs-retry.test.ts` (235 lines, 13 cases) resolves all five `04-VALIDATION.md` RUN-04 selectors. The `-t "gives up"` case asserts the injected sleep received the literal `[50, 100, 200, 400, 750]` **and** `[...FS_RETRY_DELAYS_MS]`, so the ladder is *observed*, not merely declared, and the constant cannot drift away from the assertion without one of the two failing.
- The one RUN-04 behaviour classified **N** in `04-VALIDATION.md` (surviving a real Defender lock — not inducible in CI on any runner) has its agreed mitigation shipped: `onRetry` carries the attempt index, the error code and the delay, and `attempts` rides on both outcome arms, which is what 04-08 routes into `sdk.console` and `getDiagnostics`.
- `withFsRetry` never throws. That contract is tested, not just documented: an `onRetry` hook that throws still resolves to an `Error` outcome rather than escaping.
- Full suite went 162 → **175 tests, 25 files, 0 failures**. `provider-launch.test.ts`'s exact `toEqual([...])` argv arrays did not move (CMP-01 tripwire intact). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write fs-retry.ts — classification, ladder constant, injected-sleep orchestrator** — `92b199d` (feat)
2. **Task 2: Write fs-retry.test.ts — prove the ladder without a real filesystem lock** — `166130c` (test)

## Files Created/Modified

- `packages/backend/src/fs-retry.ts` — `FS_TRANSIENT_ERROR_CODES`, `FS_RETRY_DELAYS_MS`, `isTransientFsError`, `getFsErrorCode`, `withFsRetry`, `FsRetryOutcome<T>`. No imports, no I/O, no module state. The libuv `src/win/error.c` mapping, the three ecosystem backoff precedents, and the reason for the 1,500 ms ceiling are all recorded *at* the code that encodes them.
- `packages/backend/src/fs-retry.test.ts` — 4 top-level describes / 13 cases, every dependency an injected `vi.fn()` fake.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Zero imports | `grep -c '^import' packages/backend/src/fs-retry.ts` | `0` |
| Six exports, no more | `grep -nE '^export (const\|function\|async function\|type)' …/fs-retry.ts` | 6 lines, matching the frontmatter list exactly |
| Ladder literal | `grep -n 'FS_RETRY_DELAYS_MS = ' …/fs-retry.ts` | `[50, 100, 200, 400, 750] as const` — 5 entries, sum `1500` |
| Exclusions absent from the code set | `grep -nE '"(ENOENT\|ENOSPC\|EROFS)"' …/fs-retry.ts` | no match (exit 1); they appear only in prose, as the documented exclusions |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/fs-retry.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/fs-retry.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run packages/backend/src/fs-retry.test.ts` | 13 passed / 0 failed |
| RUN-04 | `-t "isTransientFsError"` **4** · `-t "retries a transient"` 1 · `-t "does not retry"` 1 · `-t "gives up"` 1 · `-t "ladder shape"` 1 | all passed, 0 failed |
| Ladder observed, not declared | assertion inside the `-t "gives up"` case | `sleep.mock.calls.flat()` `toEqual([50, 100, 200, 400, 750])` **and** `toEqual([...FS_RETRY_DELAYS_MS])` |
| No fake timers | `grep -cE '^[[:space:]]*vi\.useFakeTimers\(' …/fs-retry.test.ts` | `0` (the file's header comment names `vi.useFakeTimers()` in prose; the anchored form is prose-proof, as the plan specifies) |
| No focused tests | `grep -cE '(describe\|it)\.only\(' …/fs-retry.test.ts` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| No new dependencies (T-04-SC) | `grep -rn "graceful-fs\|write-file-atomic" package.json packages/backend/package.json` | no match (exit 1) |
| Blast radius | `git diff --name-only HEAD~2 HEAD` | exactly the two new files; `package.json` and `pnpm-lock.yaml` untouched |
| CMP-01 regression net | `pnpm exec vitest run` | 25 files / **175** tests / 0 failed (was 24 / 162 — exactly +13) |

Note on method, carrying forward the `[03-03]`/`[03-04]` lesson about log-extraction pipelines: the five `-t` selector runs were parsed with an ANSI strip before the `grep`, and the pipeline was validated against an independently-known nonzero expected count (13 total tests, so each run had to report `N passed | 13-N skipped (13)`). A silently-empty extraction would have been indistinguishable from a green result otherwise.

## Decisions Made

- **`requirements-completed` is deliberately empty.** `RUN-04` appears in this plan's frontmatter but is *also* carried by `04-08` (`requirements: [RUN-03, RUN-04, RUN-05, CMP-02]`) and `04-11`. `withFsRetry` currently has **zero production call sites**: the requirement text is "Drift's temp-file write→spawn path tolerates the Windows AV write-then-exec race", and that path does not tolerate anything until 04-08 wraps the real `mkdir` + `writeFile` at `index.ts:1717-1720`. Marking it complete after plan 2 of 11 would repeat the error Phase 3 caught and reverted for CI-02. It stays `Pending` in REQUIREMENTS.md.
- **The transient set is an allow-list.** `ENOSPC`/`EROFS` retried would add a 1.5 s stall to every MCP start on a full or read-only volume and still fail (T-04-11); `ENOENT` means a missing parent, which is a real bug that must surface immediately. Both exclusions are commented in the code with that reasoning, so a later reader does not "generalise" the set.
- **Both error shapes are accepted, because the runtime is not settled.** Node/libuv attaches a structured `.code`; Caido's LLRT uses `tokio::fs` and throws through `or_throw_msg` with a human message. The message-substring fallback is marked `[ASSUMED]` in the code — inferred from `llrt_utils::result::ResultExt`, not measured — and handling both means either reading being wrong is harmless.
- **A throw from an injected `sleep` or `onRetry` is terminal, not an escape.** The plan's action specifies the always-resolves contract; the concrete risk is that 04-08 routes `onRetry` into `sdk.console`, which is not guaranteed non-throwing in Caido's constrained runtime. A throw escaping `withFsRetry` would bypass `startMcpServer`'s `written.kind === "Error"` branch entirely. Guarded, commented, and covered by a test.
- **`getFsErrorCode`'s fallback sentinel is lower-case `"unknown"`**, deliberately distinguishable from libuv's upper-case `UNKNOWN`, which is a real classification meaning "an AV filter driver returned a nonstandard NTSTATUS".
- **`FsRetryOutcome<T>` is not `Result<T>`.** `Result` is declared inline in `index.ts` (to avoid Zod, which crashes QuickJS) and is not exported, so importing it is impossible and would break the zero-import property. The `kind` discriminator is identical, so `index.ts` branches on it exactly as it does today.

## Deviations from Plan

Neither task deviated in substance — both files were written as specified and the plan's own `<verify>` commands passed. One in-task auto-fix and three bookkeeping-tool misfires are recorded below.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `vitest/no-conditional-expect` rejected the union-narrowing form for `lastCode`**

- **Found during:** Task 2, at the task's own `eslint --max-warnings 0` gate
- **Issue:** `lastCode` exists only on the `Error` arm of `FsRetryOutcome<T>`, so the obvious way to assert it is `if (outcome.kind === "Error") expect(outcome.lastCode).toBe("EBUSY")`. ESLint's vitest plugin errors on that (2 errors, `no-conditional-expect`) — correctly, because a conditional expect silently never runs if the condition is false, which would have made the `-t "gives up"` and `-t "does not retry"` proofs vacuous exactly when they matter.
- **Fix:** Replaced both with a whole-object `expect(outcome).toEqual({ kind, error, attempts, lastCode })`. No narrowing needed, nothing conditional, and it proves *more* — the `error` string shape is now pinned too.
- **Files modified:** `packages/backend/src/fs-retry.test.ts` (pre-commit; the committed file already carries the fix)
- **Commit:** `166130c`

**2. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote a backlog item again**

- **Found during:** post-task state updates (not a task)
- **Issue:** The known carry-forward from 04-01, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matched the first one in the file — backlog item **999.1** — and wrote Phase 4's progress into it. It also re-mangled the Progress table row's trailing cell (`In Progress | - |` → `In Progress|  |`), undoing 04-01's tidy.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 (matching all ten sibling 999.x items) and the table row to `| 4. Platform Foundation | 2/11 | In Progress | - |`. Phase 4's real progress is recorded where it belongs — the Progress table row and the `04-02-PLAN.md` checkbox, both of which the helper sets correctly.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `grep -n '^\*\*Plans:\*\*' .planning/ROADMAP.md` → all eleven backlog items read `0 plans`.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. Check the backlog line after every `roadmap update-plan-progress` call. Ordering also matters — the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written or it records the previous plan's count.

**3. [Rule 1 - Bug] Three `state` helpers were invoked with positional args and silently did the wrong thing**

- **Found during:** post-task state updates (not a task)
- **Issue:** The workflow documents positional argv for `state record-metric`, `state add-decision` and `state record-session`; this installation's `gsd-tools.cjs` takes **named flags**. `record-metric` and `add-decision` failed loudly (`"phase, plan, and duration required"` / `"summary required"`), which is fine. `record-session "" "<stopped-at>" "None"` did **not** fail — it wrote `"None"` into *Resume file* and left *Stopped at* on the previous plan's text. Three further residues: `record-metric` appended a 4-column row (`| Phase 04 P02 | 7min | … |`) below the `*Updated after each plan completion*` footer, orphaned from the 4-column-but-differently-shaped **By Phase** table; `advance-plan` reset `Status:` to "Ready to execute" mid-phase and flattened `Last activity` to a bare date; and `add-decision` prefixed all three entries `[Phase ?]`.
- **Fix:** Re-ran `record-session` with `--stopped-at` / `--resume-file`, and `record-metric` / `add-decision` with named flags. Hand-repaired the residues to the file's existing conventions: relocated the metric into the **By Phase** row (`04 | 2 of 11`) and the **Recent Trend** line rather than leaving a stray table row, restored `Status: Executing Phase 4` and the descriptive `Last activity`, corrected the decision prefixes to `[Phase 04]`, and bumped `completed_plans` 12 → 13 (which `advance-plan` does not touch).
- **Files modified:** `.planning/STATE.md`
- **Note for the next executor:** prefer named flags (`--phase`, `--plan`, `--duration`, `--summary`, `--stopped-at`, `--resume-file`) with this toolchain, and diff `STATE.md` after the state calls. A positional invocation that *succeeds* is the dangerous case.

Two mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter; both paths are inside `pnpm format`'s glob). `fs-retry.ts` was already Prettier-clean; the test file was reflowed twice. No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5–8 byte-stability fence are unaffected.
- Two tests beyond the plan's enumerated list were added inside `describe("withFsRetry")` — one for the never-throws contract the plan's action explicitly states, one for the `delays` override that is the documented escalation path — plus a two-case `describe("getFsErrorCode")` for the sixth export. None of their titles collides with a `-t` selector; the five selector counts above are unaffected.

## Issues Encountered

None in the source work. Both tasks passed their own `<verify>` commands, the second after the single lint fix recorded above.

## Threat Model Disposition

- **T-04-10 (Denial of Service, `withFsRetry`) — mitigated.** The ladder is a fixed, exported, finite array; the loop bound *is* `delays.length`, so termination is structural rather than conventional. No jitter. Proven by the `-t "gives up"` case: exactly 6 operation calls and the exact 5-rung sleep sequence.
- **T-04-11 (Denial of Service, code set) — mitigated.** `ENOSPC` and `EROFS` are excluded from `FS_TRANSIENT_ERROR_CODES` and asserted absent by the `-t "isTransientFsError"` case, so a full or read-only volume fails immediately instead of stalling 1.5 s on every MCP start.
- **T-04-03 (Information Disclosure, retry logging) — mitigated.** `onRetry`'s parameter type is `{ attempt: number; code: string; delayMs: number }` — no message, no path, no file contents can reach it, and the `-t "reports every retry"` case pins the exact object shape. The module contains no logging and cannot reach `sdk.console`. Plan 04-08 must format its log line from those three fields only; that constraint is now enforced by the type, not by convention.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed. `graceful-fs` and `write-file-atomic` are cited in comments as design references only and are absent from both `package.json` files; `pnpm-lock.yaml` is untouched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-08 can consume this immediately.** Its `key_links` already name `./fs-retry withFsRetry`, and the signature matches the call it plans to write: `withFsRetry(async () => { await mkdir(...); await writeFile(...); }, { onRetry: (info) => sdk.console.error(...) })` returning `{ kind: "Ok" | "Error", attempts, … }`. `info.attempt`, `info.code` and `info.delayMs` are all `number`/`string`, so the template literal there needs `String(...)` on the two numbers under this repo's lint settings.
- **Known non-blocker for the verifier:** `withFsRetry` currently has **zero production call sites**, exactly like `buildSpawnEnv` after 04-01. This is expected, not a stub — the plan's objective states the integration is 04-08's, and applying the ladder at `writeLaunchScript`/`writeMcpWrapper`'s `.tmp` → `rename` pair (which RESEARCH calls "the single best-documented case") is fenced to **Phase 5** by `04-CONTEXT.md`'s scope boundary. Do not wire a call site to satisfy a grep.
- **The escalation path is documented in the code, not just the plan.** If the original Windows reporter still sees a failure, the fix is to widen `FS_RETRY_DELAYS_MS` — an exported constant with its rationale (graceful-fs's 60 s and npm arborist's 15.5 s are batch tools; this ladder wraps a button the user is watching) recorded beside it, and a `delays` override already covered by a test.
- `index.ts`, `command-resolution.ts` and `platform.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/fs-retry.ts` — FOUND
- `packages/backend/src/fs-retry.test.ts` — FOUND
- `.planning/phases/04-platform-foundation/04-02-SUMMARY.md` — FOUND
- Commit `92b199d` — FOUND
- Commit `166130c` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
