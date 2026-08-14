---
phase: 04-platform-foundation
plan: 01
subsystem: infra
tags: [typescript, vitest, windows, cross-platform, pure-functions, os-tmpdir]

# Dependency graph
requires:
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P0-ENV (spawn env REPLACES the parent block on win32; libuv back-fills only eleven vars, APPDATA/LOCALAPPDATA not among them), P0-TMP (8.3 short-form tmpdir), P1-CMD (.cmd spawn throws EINVAL synchronously), P1-WHERE (where.exe by absolute path, 2 CRLF-split lines), P3-VARS (USERPROFILE/APPDATA/LOCALAPPDATA all present)"
provides:
  - "packages/backend/src/platform.ts — nine pure, I/O-free, zero-import OS-decision exports with `platform` as an injected parameter"
  - "getTempRoot — separator-agnostic trailing-separator strip that guards `/` and `C:\\`"
  - "getSweepRoots — the CMP-02 legacy `/tmp` arm on non-win32"
  - "getWhichCommand / WINDOWS_EXECUTABLE_EXTENSIONS / getExecutableNames / getHomeDirCandidates — D-03's platform-invariant Windows primitives (shape, not install-location data)"
  - "normalizePlatform — the RUN-05 gate primitive that returns undefined instead of falling through to POSIX"
  - "buildSpawnEnv — the SC-9 parent-spread helper, unit-tested"
  - "packages/backend/src/platform.test.ts — 28 cases proving every win32 branch on the POSIX runner"
affects: [04-02, 04-03, 04-08, 04-11, phase-5-launch-path, phase-6-binary-resolution, phase-7-provider-spawn]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (sixth instance of the existing repo pattern)"
    - "OS facts as injected parameters rather than ambient reads — the only way a Linux runner can prove Windows behaviour"

key-files:
  created:
    - packages/backend/src/platform.ts
    - packages/backend/src/platform.test.ts
  modified: []

key-decisions:
  - "platform.ts imports NOTHING — not `os` (D-02 puts the single read in index.ts), not `path` (POSIX-flavoured on the Linux runner, so it cannot strip a Windows trailing backslash). Zero imports is the mechanical form of SC-1's no-I/O claim."
  - "getTempRoot strips both `/` and `\\` on all three platforms rather than branching on platform: the runtime, not the OS, decides which separator comes back (LLRT GetTempPath2 vs Node)."
  - "RUN-03 / CMP-02 / RUN-05 were NOT marked complete — plans 04-08 and 04-11 carry the same IDs and index.ts still hardcodes /tmp. Shipping the instrument is not shipping the behaviour (Phase 3 precedent)."

patterns-established:
  - "Describe/it titles are a contract with 04-VALIDATION.md's `-t \"<name>\"` selectors, not free text"
  - "Phase 3 measurements are cited inline at the code that consumes them, with the run URL, so a later reader cannot re-derive them wrongly"

requirements-completed: []  # Deliberately empty — see Decisions Made. RUN-03/CMP-02/RUN-05 are shared with 04-08 and 04-11 and only their pure half landed here.

# Metrics
duration: 10min
completed: 2026-08-14
---

# Phase 4 Plan 01: Platform Foundation — pure OS-decision layer Summary

**A zero-import, I/O-free `platform.ts` with nine exports whose `platform` argument is injected, so all 28 win32 assertions — trailing-separator strip, `where.exe`, the `.exe`/`.cmd`/`.bat` ladder, `%USERPROFILE%`/`%APPDATA%`/`%LOCALAPPDATA%`, the parent-env spread, and the legacy `/tmp` sweep arm — run and pass on the POSIX runner the maintainer actually has.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-14T11:58:00Z (approx; first task commit 2026-08-14T12:05:38Z)
- **Completed:** 2026-08-14T12:08:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/platform.ts` (218 lines) exports the nine symbols D-01 locks, in the order the plan specifies, with **zero import statements** — `grep -c '^import'` returns `0`, which is SC-1's "no I/O" claim in mechanically checkable form.
- `packages/backend/src/platform.test.ts` (260 lines, 28 cases) resolves all seven `04-VALIDATION.md` `-t` selectors; `-t "getSweepRoots"` runs **exactly 3** tests and all pass, which is the entire CMP-02 proof.
- Every Phase 3 measurement this module encodes is cited *at the code that consumes it* — P1-WHERE's absolute-path invocation and 2-CRLF-line output beside `getWhichCommand`, P1-CMD's synchronous `EINVAL` beside the extension list, P0-ENV's `PARENT-CLEARED` result plus [run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574) beside `buildSpawnEnv`.
- Full suite went 134 → **162 tests, 24 files, 0 failures**. `provider-launch.test.ts`'s exact `toEqual([...])` arrays did not move (CMP-01 tripwire intact). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write platform.ts — the nine pure exports D-01 specifies** — `37d82e5` (feat)
2. **Task 2: Write platform.test.ts — the Linux-runner proof of every Windows branch** — `201578b` (test)

## Files Created/Modified

- `packages/backend/src/platform.ts` — pure OS-decision helpers: `Platform`, `normalizePlatform`, `getTempRoot`, `getSweepRoots`, `getWhichCommand`, `WINDOWS_EXECUTABLE_EXTENSIONS`, `getExecutableNames`, `getHomeDirCandidates`, `buildSpawnEnv`. No imports, no I/O, no module state.
- `packages/backend/src/platform.test.ts` — 7 top-level describes / 28 cases, `platform` injected as a literal in every one.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Zero imports (SC-1) | `grep -c '^import' packages/backend/src/platform.ts` | `0` |
| No rejected aggregate (D-01) | `grep -n "function createPlatformProfile\|const createPlatformProfile" …` | no match (exit 1) |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint | `pnpm lint` (`eslint . --max-warnings 0`) | exit 0 |
| Plan tests | `pnpm exec vitest run packages/backend/src/platform.test.ts` | 28 passed / 0 failed |
| RUN-03 | `-t "getTempRoot"` 5 · `-t "getWhichCommand"` 3 · `-t "getExecutableNames"` 5 · `-t "getHomeDirCandidates"` 4 | all passed |
| CMP-02 / T-04-02 | `-t "getSweepRoots"` | **exactly 3** passed |
| RUN-05 (pure half) | `-t "normalizePlatform"` | 4 passed |
| SC-9 | `-t "buildSpawnEnv"` | 4 passed |
| No focused tests | `grep -cE '(describe\|it)\.only\(' packages/backend/src/platform.test.ts` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | nothing |
| CMP-01 regression net | `pnpm exec vitest run` | 24 files / **162** tests / 0 failed (was 134) |

## Decisions Made

- **`requirements-completed` is deliberately empty.** RUN-03, CMP-02 and RUN-05 appear in this plan's frontmatter but are *also* carried by plans 04-08 (the `index.ts` integration) and 04-11 (phase verification). `index.ts` still hardcodes `/tmp` at `:337`, `:1681`, `:1685`, `:1716`, and no runtime probe exists yet. Marking them complete after plan 1 of 11 would repeat the error Phase 3 caught and reverted ("building the instrument is not proving the platform"). They stay `Pending` in REQUIREMENTS.md until 04-08/04-11 land.
- **`getTempRoot` takes `platform` but does not branch on it.** The signature is locked by D-01 and lets `getSweepRoots` forward `input` unchanged; the strip itself is separator-agnostic because the *runtime* decides the separator shape (LLRT's `GetTempPath2` returns a trailing backslash; Node has stripped separators since v2.0.0). Recorded in a comment so a later reader does not "simplify" it into a platform branch.
- **The strip guards two roots explicitly** — it stops at length 1 (`"/"` stays `"/"`) and stops when the remainder ends in `:` (`"C:\\"` stays `"C:\\"`, which is a real path, while bare `"C:"` is drive-relative and is not). Both are asserted.
- **`getExecutableNames` compares extensions case-insensitively** (`claude.CMD` → single element), because that is the spelling a real `%PATH%` entry can carry, and returns the bare name last as a final fallback.

## Deviations from Plan

Neither task deviated — both passed their automated verification on the first run and no source auto-fix was needed. One deviation occurred in the bookkeeping step afterwards.

### Auto-fixed Issues

**1. [Rule 1 - Bug] `roadmap update-plan-progress` wrote Phase 4's plan count into a backlog item**

- **Found during:** post-task state updates (not a task)
- **Issue:** The GSD helper has no `**Plans:**` line inside `### Phase 4: Platform Foundation`, so its regex matched the first such line in the file — backlog item **999.1** (event-driven `sendCliMessage` refactor) — and overwrote it with `**Plans:** 1/11 plans executed`. The same misfire had already left `**Plans:** 5/5 plans complete` there during Phase 3, so the residue was pre-existing and compounding.
- **Fix:** Restored `**Plans:** 0 plans`, matching all ten sibling 999.x backlog items. Phase 4's real progress is recorded where it belongs — the Progress table row (`1/11 | In Progress`) and the `04-01-PLAN.md` checkbox, both of which the helper set correctly. Also tidied that table row's malformed trailing cell (`In Progress|  |` → `In Progress | - |`) to match every other row.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `grep -n '^\*\*Plans:\*\*' .planning/ROADMAP.md` → all eleven backlog items now read `0 plans`; the Progress table row reads `| 4. Platform Foundation | 1/11 | In Progress | - |`.
- **Committed in:** the plan-metadata commit below.
- **Carry-forward:** later Phase 4 plans will hit this again on every `roadmap update-plan-progress` call — check the backlog line after running it.

Two further mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter, and these paths are inside `pnpm format`'s glob). Prettier reflowed one `.some(...)` callback in `platform.ts` and a handful of `expect(...)` calls in the test file. No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5–8 byte-stability fence are unaffected.
- Zero packages were installed, as T-04-SC requires.

## Issues Encountered

None.

## Threat Model Disposition

- **T-04-02 (Information Disclosure, `getSweepRoots`) — mitigated.** The legacy `/tmp` arm ships on non-`win32` and is proven by the three `-t "getSweepRoots"` cases. Note this is only the *pure* half: `sweepOrphanedMcpTempDirs` in `index.ts` does not consume `getSweepRoots` yet, so 0.1.0's token-bearing directories are not actually swept until plan 04-08 wires it.
- **T-04-01 (`getTempRoot` consumers) — transferred as planned.** The random component of the temp-dir name belongs to plan 04-08's `genShortToken()`; this module supplies only the root.
- **T-04-04 (`buildSpawnEnv`) — mitigated.** The function returns data only; the module contains no logging and cannot reach `sdk.console`. A comment records that it must never be used to render an environment into a diagnostic.
- **T-04-SC (npm/pnpm installs) — n/a.** No packages installed; `package.json` and `pnpm-lock.yaml` untouched.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plans 04-02 (`fs-retry.ts`), 04-03 (`runtime-probe.ts`) and 04-08 (`index.ts` integration) can import `./platform` immediately. `normalizePlatform` and `getTempRoot` are the two the probe needs; both are stable.
- Phase 5's `buildMcpServerSpec()` → `spawnNode()` design can consume `buildSpawnEnv` without restructuring — it takes `parentEnv` as an input, so the call site supplies `process.env`.
- **Known non-blocker for the verifier:** `buildSpawnEnv` currently has zero production call sites. This is expected, not a stub — 04-PATTERNS.md records that none of `index.ts`'s four `spawn(` sites passes an `env` option today (env reaches children through the bash `export` wrapper Phase 5 deletes). The static half of the SC-9 check counts zero call sites in Phase 4 by design; do not invent an `env:` option to satisfy a grep.
- `command-resolution.ts` is untouched, as D-03 requires. Its POSIX candidate arrays remain Phase 6's job to extend.

## Self-Check: PASSED

- `packages/backend/src/platform.ts` — FOUND
- `packages/backend/src/platform.test.ts` — FOUND
- `.planning/phases/04-platform-foundation/04-01-SUMMARY.md` — FOUND
- Commit `37d82e5` — FOUND
- Commit `201578b` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
