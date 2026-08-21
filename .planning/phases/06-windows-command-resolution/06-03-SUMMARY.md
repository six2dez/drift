---
phase: 06-windows-command-resolution
plan: 03
subsystem: infra
tags: [windows, where-exe, path-search, pure-helpers, home-variables, cmp-01]

requires:
  - phase: 06-windows-command-resolution
    plan: 01
    provides: "joinPath (platform-injected spelling), getWindowsNamedRoots, and the two CMP-01 regression nets whose oracle this plan corrects"
  - phase: 04-platform-foundation
    provides: "WINDOWS_EXECUTABLE_EXTENSIONS — the ONE ordered extension list — plus getWhichCommand and getHomeDirCandidates as zero-caller exports"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P1-WHERE (where.exe resolved a command by ABSOLUTE path across 2 CRLF-split lines on a real windows-latest host) and P3-VARS (USERPROFILE/APPDATA/LOCALAPPDATA all present and non-empty)"
provides:
  - "rankPathSearchHits — the D-01 ranking: every PATH-search line ordered by the one extension list, with the tool's own emission order as the within-extension tie-break and a POSIX arm that is a byte-identical no-op"
  - "The extension-termination filter — the second of two independent guards keeping a non-path line (the no-match informational sentence, a truncated partial final line) out of a path consumer"
  - "getWhichCommand({platform, env}) — the win32 arm derives <SystemRoot>\\System32\\where.exe from the machine's own environment, with a reachable, tested bare-name fallback (D-02)"
  - "getHomeDirCandidates({platform: undefined, env}) — the pre-probe union of BOTH home-variable name sets, POSIX first, deduped (D-08)"
  - "Both stale hand-off comments corrected in place: neither still promises this phase's work to a future phase"
  - "The CMP-01 oracle is POSIX BY CONSTRUCTION (path.posix), closing WINDOWS.md entry 7 and the 25 assertions that held the blocking windows-latest leg red"
affects: [06-04, 06-05, 06-06, 06-07, phase-07-launch, phase-09-real-machine]

actuals:
  tokens: 6527
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "A named input type where a verification gate must read a function BODY: an inline object parameter closes as `}): T {`, a column-0 brace that silently ends an `awk '/…/,/^}/'` range at the signature"
    - "Design around an undocumented fact rather than answer it: where the search tool's cross-extension order and the no-match line's stream are both unsourced, the ranking and the two independent guards make the code correct under EVERY answer, and the tests assert that rather than the guess"
    - "An oracle, not an implementation, is what a test may import from a host-flavoured module — and it must name the flavour (path.posix), so the block's premise is true by construction rather than by accident of the runner"

key-files:
  created: []
  modified:
    - packages/backend/src/platform.ts
    - packages/backend/src/platform.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "platform: undefined takes the POSIX arm on rankPathSearchHits and getWhichCommand, and this is NOT the POSIX default D-08 rejected: only one binary can be spawned, so no union answer exists, and skipping the search would drop resolution for a PATH-only binary on macOS/Linux — a real CMP-01 regression. The distinction is written into the code beside both arms."
  - "The ranking helper lives in platform.ts beside the extension constant it reads, so exactly one ordered list exists. It carries no Windows install DATA — only a preference order read from an existing constant — so 04-D-03's SHAPE-versus-DATA line is not crossed."
  - "The within-extension tie-break is an EXPLICIT order field, not a reliance on Array.prototype.sort's stability: that guarantee is only specified since ES2019 and this ships into a constrained engine, so the property the contract depends on is written down rather than assumed."
  - "getWhichCommand strips trailing separators with no bare-drive guard, deliberately unlike getTempRoot: a segment is APPENDED here rather than a root preserved, so reducing D:\\ to D: yields the correct D:\\System32\\… instead of a doubled separator."
  - "The CMP-01 oracle swap was made only after BOTH of its properties were measured — 25/25 rows byte-identical on POSIX, and 27 -> 2 failures under a path -> path.win32 alias — because 06-01's prohibition protects the EVIDENCE, and only a proven no-op on POSIX can honour it."

patterns-established:
  - "Gate-shaped signatures: when an acceptance criterion extracts a function body by awk range, give the function a named input type so the range does not terminate on the signature's own closing brace"
  - "Measuring a Windows-only test failure on a POSIX host (extending 06-02's note): alias ONLY the bare `path` specifier — aliasing `node:path` too makes the shim import itself and every suite fails to collect — and expect the run to litter the repository root with backslash-named entries, to be removed by explicit prefix match, never with git clean"

requirements-completed: [RES-02, RES-03]

coverage:
  - id: D1
    description: "Windows extension preference is an implemented ranking rather than an accident of a machine's PATH order: .exe before .cmd before .bat, read from the one exported constant, with the search tool's own emission order breaking ties within an extension"
    requirement: "RES-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > ranks the .exe hit ahead of the .cmd hit ahead of the .bat hit on win32"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > keeps the search tool's own emission order as the tie-break within one extension"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > ranks an uppercase extension with its group and returns the original spelling"
        status: pass
      - kind: other
        ref: "awk range over rankPathSearchHits: 1 reference to WINDOWS_EXECUTABLE_EXTENSIONS, 0 extension literals in executable lines"
        status: pass
    human_judgment: false
  - id: D2
    description: "No output line that is not a path can reach a path consumer — the extension-termination filter discards the no-match informational sentence and the partial final line the bounded buffer leaves above its cap (T-06-T10)"
    requirement: "RES-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > produces no candidate for the no-match informational sentence"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > discards the partial final line the bounded output buffer leaves above its cap"
        status: pass
    human_judgment: false
  - id: D3
    description: "The ranking arm is a byte-identical no-op on POSIX and pre-probe — the CMP-01 obligation for D-01"
    requirement: "RES-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > reproduces the single-line extraction it replaces, byte for byte"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > returns exactly the first line on darwin and linux"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > takes the POSIX arm before the platform probe has run"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Windows PATH-search binary is invoked by an absolute path derived from the running machine's own system root, with a reachable and tested bare-name fallback (D-02 / T-06-T11)"
    requirement: "RES-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand > invokes the search binary by absolute path under the machine's own system root"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand > honours the SCREAMING-case spelling, and prefers the native-cased key when both are present"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand > falls back to the bare binary name when the variable is missing or blank"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand > does not double the separator for a root that already ends in one"
        status: pass
      - kind: other
        ref: "grep gate: 0 drive-qualified literals in executable lines of platform.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "A provider status check running before the runtime probe reads whichever home variables the machine actually sets, and macOS/Linux behaviour is provably unchanged (D-08)"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getHomeDirCandidates > unions both name sets before the platform probe has run"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getHomeDirCandidates > costs a POSIX machine nothing pre-probe"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getHomeDirCandidates > reads the Windows variables pre-probe rather than returning nothing"
        status: pass
      - kind: other
        ref: "awk range over getHomeDirCandidates (18 lines, body covered): 0 default-to-POSIX constructs in executable lines"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both stale hand-off comments are corrected in place; the module still carries zero imports and performs zero I/O"
    verification:
      - kind: other
        ref: "grep -c 'NOT implemented here' -> 0; grep -c 'which this phase does not touch' -> 0; grep -c '^import' packages/backend/src/platform.ts -> 0"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck and pnpm lint both exit 0; pnpm exec vitest run -> 394 passed"
        status: pass
    human_judgment: false
  - id: D7
    description: "WINDOWS.md entry 7 closed: the CMP-01 oracle is path.posix, so its 25 assertions are correct on win32 and byte-identical on POSIX"
    verification:
      - kind: other
        ref: "node check over all 25 CMP-01 rows: path.join(...row) === path.posix.join(...row) -> rows=25 byte-identical=25 differing=0"
        status: pass
      - kind: other
        ref: "path -> path.win32 alias shim, full suite: 27 failures before (25 genuine, I/O-free) -> 2 after (both mkdtemp shim artifacts)"
        status: pass
    human_judgment: true
    rationale: "The 25 assertions are proven fixed by a faithful I/O-free proxy, but nobody has yet watched the real windows-latest leg go green on this commit. That leg is blocking-for-merge (Phase 5 D-09), and the 2 residual failures under the shim are vehicle artifacts that a real Windows host cannot reproduce — which is a prediction, not a measurement. A human should confirm the actual CI run."

duration: 12min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 03: The Two Pure Decisions the Windows PATH Search Rests On Summary

**`.exe`-over-shim is now a ranked, tested behaviour rather than an accident of a machine's `PATH`; the PATH-search binary is invoked by an absolute path built from the running machine's own system root with a proven-reachable fallback; a pre-probe home lookup reads whichever variable set the machine actually populates; and the CMP-01 oracle is POSIX by construction, which took the blocking `windows-latest` leg from 25 red assertions to 0.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-21T11:21:23Z
- **Completed:** 2026-08-21T11:33:00Z
- **Tasks:** 3 (plus the orchestrator-authorised WINDOWS.md entry 7 deliverable)
- **Files modified:** 3
- **Tests:** 374 → 394, all green; `platform.test.ts` 94 → 114

## Accomplishments

- **`rankPathSearchHits` (T-06-07).** Every PATH-search line is ranked by `WINDOWS_EXECUTABLE_EXTENSIONS` — read from the constant, never restated, so exactly one ordered list exists in the codebase. Ties within an extension keep input order via an explicit order field rather than an assumed-stable sort. Matching is case-insensitive and the ORIGINAL spelling is returned. Non-win32, `undefined` included, returns the trimmed first line and nothing else.
- **The second guard is real and asserted.** A line not terminating in a known extension is discarded, so the no-match informational sentence yields zero candidates — the assertion 06-RESEARCH § *Pitfall 1* demands by name — and so does the partial final line the bounded output buffer leaves above its cap. The comment states plainly that this is the guard which survives a future loosening of the exit-code gate at the call site.
- **The ranking's rationale is inverted correctly (D-01).** The comment says outright that the ranking exists BECAUSE the tool's cross-extension order is undocumented and Phase 3's measurement (two lines, same extension) cannot discriminate — so "first line wins" would make SC-2's preference a property of the runner's `PATH`. The two facts the contract actually needs are named, and both hold.
- **`getWhichCommand` resolves by absolute path (T-06-08).** `<SystemRoot>\System32\where.exe`, with the native spelling read first and the SCREAMING-case alternate second, trailing separators stripped before the join, and the bare name when the variable is missing or blank. A NON-C drive letter in the test proves the root is read rather than assumed.
- **`getHomeDirCandidates` unions both name sets pre-probe (T-06-09).** `platform: undefined` reads `HOME` then the three Windows variables, deduped, POSIX first — the third site applying the union-when-unknown rule, named alongside the other two so all three read alike. The POSIX-only case is asserted explicitly, because it is the proof the union costs macOS and Linux nothing.
- **Both stale hand-off comments corrected in place.** Neither still claims this work is unimplemented here, and neither still claims this phase does not touch the function. Both rewrites keep the Phase 3 measurement as the SOURCE and cite the committed findings document by repository path, never the CI artifacts that expire 2026-09-12.
- **WINDOWS.md entry 7 closed by measurement.** The blocking `windows-latest` leg's 25 genuine assertions go to 0. Details below.

## Task Commits

1. **T-06-07 (RED): failing tests for `rankPathSearchHits`** — `84fd0e3` (test)
2. **T-06-07 (GREEN): rank every PATH-search line by the one extension list** — `9b5fbc2` (feat)
3. **T-06-08 (RED): failing tests for the absolute-path win32 arm** — `0bdee09` (test)
4. **T-06-08 (GREEN): resolve the PATH-search binary by absolute path** — `110e670` (feat)
5. **T-06-09 (RED): failing tests for the pre-probe union** — `687fdf5` (test)
6. **T-06-09 (GREEN): union both home-variable name sets pre-probe** — `0856bc3` (feat)
7. **Added deliverable: make the CMP-01 oracle POSIX by construction** — `9effeec` (fix)
8. **Added deliverable: close WINDOWS.md entry 7 with the measured result** — `8a4c2f7` (docs)

## Files Created/Modified

- `packages/backend/src/platform.ts` — `PathSearchHitsInput` + `rankPathSearchHits` (new, placed immediately after `getExecutableNames` so the two readers of the extension constant sit together); `getWhichCommand` widened to `{ platform: Platform | undefined; env }` with the win32 absolute-path arm and its rewritten comment; `HomeDirCandidatesInput` + `getHomeDirCandidates` widened to `Platform | undefined` with the union arm and its rewritten comment. Still zero imports, still zero I/O.
- `packages/backend/src/platform.test.ts` — a new `rankPathSearchHits` describe (11 cases), the `getWhichCommand` block extended from 3 to 8 cases, the `getHomeDirCandidates` block extended from 4 to 8, and the CMP-01 oracle switched to `path.posix` with the reasoning recorded in the block's own comment.
- `.planning/WINDOWS.md` — entry 7 marked `fixed` (`open_count` 0) plus a `## Resolution notes` section recording both measurements, the absence of any discrepancy with 06-02, and a hazard note for anyone re-running the shim.

## Decisions Made

- **`platform: undefined` takes the POSIX arm on both new/widened resolution helpers, and the code says why it is not D-08's rejected default.** Only one binary can actually be spawned, so no union answer exists here; and skipping the search pre-probe would stop resolving a binary that lives only on `PATH` and in none of the known install locations — a real macOS/Linux regression, i.e. CMP-01 surface. On Windows pre-probe the POSIX binary simply fails to spawn and resolution falls through to the candidate walk, which 06-02's union roots have already made productive. Both call sites carry that distinction in a comment so a later reader does not "fix" it to match D-08.
- **Named input types for the two functions whose acceptance gates extract a body by `awk` range.** The plan's own warning that awk ranges silently truncate is not hypothetical here: prettier closes an inline object parameter as `}): string[] {`, which begins with a column-0 brace and ends the range AT the signature. `rankPathSearchHits`'s positive gate (must reference the extension constant) would then have read one line and failed; `getHomeDirCandidates`'s negative gate would have passed vacuously. Naming the input types makes both gates read what they were written to read — the ranges now cover 39 and 18 lines respectively. `getWhichCommand` keeps its inline object because no gate extracts its body.
- **An explicit `order` field for the within-extension tie-break.** `Array.prototype.sort` has only been specified stable since ES2019, and this module ships into a constrained engine; the property the D-01 contract depends on is therefore written down rather than assumed.
- **No bare-drive guard on `getWhichCommand`'s separator strip, unlike `getTempRoot`.** The two functions differ in intent: `getTempRoot` PRESERVES a root, so `C:\` must stay `C:\`; `getWhichCommand` APPENDS a segment, so reducing `D:\` to `D:` produces the correct `D:\System32\where.exe` rather than a doubled separator. The difference is stated beside the loop so it does not read as an oversight.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The `awk`-range acceptance gates could not read either function's body as written**

- **Found during:** T-06-07, before writing the implementation (the plan's `plan_specific_warnings` flagged the hazard; this is the concrete instance).
- **Issue:** The file's house style gives every helper an inline object parameter, which prettier closes as `}): string[] {`. That line starts with `}` in column 0, so `awk '/export function X/,/^}/'` terminates at the signature. T-06-07's gate requiring at least one `WINDOWS_EXECUTABLE_EXTENSIONS` reference inside the range would have failed on correct code, and T-06-09's negative gate would have passed without reading anything.
- **Fix:** Named input types (`PathSearchHitsInput`, `HomeDirCandidatesInput`) for exactly the two functions with body-extracting gates, with the reason recorded in a comment above each alias so the next reader does not "tidy" them back inline.
- **Files modified:** `packages/backend/src/platform.ts`
- **Verification:** The ranges now span 39 and 18 lines; the positive gate returns 1 and both negative gates return 0.
- **Committed in:** `9b5fbc2` and `0856bc3`

**2. [Rule 3 - Blocking] The measurement shim could not be built as 06-02's note describes it**

- **Found during:** the added deliverable.
- **Issue:** Aliasing both `path` and `node:path` to the win32 shim makes the shim's own `import nodePath from "node:path"` resolve to itself. Every suite that touches `path` failed to COLLECT (`Cannot read properties of undefined (reading 'win32')`) — 7 files, 197 of 394 tests never running. A count taken in that state would have been meaningless.
- **Fix:** Alias only the bare `path` specifier and let the shim import `node:path` unaliased. The pattern note in this SUMMARY records the constraint so the next executor does not lose the same twenty minutes.
- **Files modified:** none (throwaway config, deleted after the measurement).
- **Verification:** 31 of 31 files collect; 394 tests run.
- **Committed in:** n/a — measurement scaffolding, not shipped.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking). No scope creep beyond `files_modified` plus the orchestrator-authorised `.planning/WINDOWS.md`.
**Impact on plan:** Neither changed behaviour. The first made two acceptance gates actually test what they claim; the second made a measurement possible at all.

## Issues Encountered

**WINDOWS.md entry 7 — closed, and closed by measuring rather than by trusting the hand-off.**

06-02 identified the fix as one token and asserted two properties. Both were re-derived here rather than taken on trust:

1. **Byte-identical on POSIX.** All 25 CMP-01 rows compared directly: `path.join(...row) === path.posix.join(...row)` for every one (`rows=25 byte-identical=25 differing=0`). 06-01's evidence keeps its exact value and no expected string changed — which is precisely what makes the edit legal despite that plan's "green and unedited" prohibition. That prohibition protects the EVIDENCE; an oracle change that is a provable no-op on POSIX and correct on win32 strengthens it, and the block's own comment now says so.
2. **Correct on win32.** 06-02's method reproduced: `path` aliased to `path.win32`. **Before:** 27 failures — 25 genuine and I/O-free, all in the `joinPath CMP-01 POSIX byte-identity` block, plus 2 artifacts. **After:** 2. The 25 went to 0.

**No discrepancy with 06-02's measurement.** Counts, file, describe block and the characterisation of the residual 2 all reproduce exactly, on a suite that has grown from 374 to 394 tests since — and all 20 of this plan's new tests pass under the win32 shim as well as on the POSIX host.

The 2 residual failures are the shim artifacts 06-02 named: `path.win32.join` mangles macOS's POSIX `os.tmpdir()` (`/var/folders/…` → `\var\folders\…`), so `mkdtemp` builds a bogus directory and the real walk finds nothing. Impossible on a real Windows host, where `os.tmpdir()` is drive-lettered. Not chased, as instructed.

**A hazard the shim carries, recorded in WINDOWS.md and here:** those mangled paths are created relative to the repository root, so a run litters the working tree with ~80 entries whose *names* contain literal backslashes. They were removed by explicit prefix match on `\var\folders\` — never `git clean`, which is prohibited by this repo's execution rules and would have taken untracked project files with it.

## Known Stubs

None. Every export shipped by this plan has a real implementation and asserting tests, and both new `platform.ts` arms are exercised from literal inputs on the POSIX runner.

## Deferred Issues

- **`platform.test.ts` carries 5 pre-existing prettier-formatting divergences** (at the `joinPath`, `getWindowsNamedRoots` and CMP-01 row-table blocks), inherited from plans 06-01/06-02. `pnpm lint` does not enforce formatting, so nothing is red. They were deliberately NOT reformatted: one of them sits on a CMP-01 row, and a whitespace-only edit to that block is exactly the kind of churn 06-01's "green and unedited" rule exists to prevent. Every line this plan added is prettier-clean; `platform.ts` is prettier-clean in full.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary. The plan's own register is addressed in code: T-06-T10 by the extension-termination filter and its two named tests, T-06-T11 by the absolute-path derivation with its stated and tested fallback, T-06-T12 accepted as planned (a process-scoped variable an attacker could only set by already running as the user), T-06-T13 by adding no logging and no diagnostic anywhere near the returned home values, and T-06-SC vacuously — no package was installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 06-05 can wire both helpers.** `getWhichCommand({platform, env})` and `getHomeDirCandidates({platform, env})` have both arms proven from the Linux runner, and `rankPathSearchHits` is ready to replace `out.head.split("\n", 1)[0]` at `index.ts`'s PATH-search close handler — its POSIX arm is asserted byte-identical to that expression, so the swap is a no-op on macOS and Linux by construction.
- **The blocking `windows-latest` leg has no known red assertion left.** `open_count` in the ledger is 0. What remains unproven is whether the real leg goes green on this commit — the 2 shim artifacts are predicted to vanish on a drive-lettered `os.tmpdir()`, and that prediction is recorded as D7's human-judgment item rather than asserted as fact.
- **Unresolved by design (RES-02's flagged assumption).** The search tool's cross-extension output order, and the stream its no-match sentence is written to, remain unanswered by evidence and answered by design: the ranking makes the first irrelevant and two independent guards make the second irrelevant. A real-machine probe would upgrade confidence; it does not unblock anything, and the code is correct under every answer.
- **Estimate calibration note (#2632).** `actuals.tokens: 6527` is `chars/4` over the realized production diff (26,109 chars across `packages/backend/src`), the template's declared scale. It is NOT comparable to `estimate.tokens: 75000`, which projects agent-CONTEXT consumption. This plan's context use came in well UNDER that projection — the opposite direction from 06-01 and 06-02, which both over-ran by roughly 2.3×. The plausible reason is that this plan touched one small pure module with no filesystem behaviour to reason about, so the two-point over-run trend should not be treated as closed by this data point.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- Both modified source files, `.planning/WINDOWS.md` and this SUMMARY present on disk.
- All 8 commits present in `git log` (`84fd0e3`, `9b5fbc2`, `0bdee09`, `110e670`, `687fdf5`, `0856bc3`, `9effeec`, `8a4c2f7`).
- `pnpm exec vitest run` — 31 files, 394 tests, 0 skipped, 0 failed. `platform.test.ts` alone: 114 passed.
- `pnpm -r typecheck` and `pnpm lint` both exit 0. `pnpm exec prettier --check packages/backend/src/platform.ts` clean.
- `grep -c '^import' packages/backend/src/platform.ts` → 0. `grep -c 'NOT implemented here'` → 0. `grep -c 'which this phase does not touch'` → 0. `grep -c '03-FINDINGS'` → 4.
- `awk` range over `rankPathSearchHits` (39 lines): 1 `WINDOWS_EXECUTABLE_EXTENSIONS`, 0 extension literals in executable lines, 0 backslash regexes. Range over `getHomeDirCandidates` (18 lines): 0 default-to-POSIX constructs in executable lines.
- 0 drive-qualified literals in executable lines of `platform.ts`.
- `-t "getWhichCommand"` → 8 passed; `-t "getHomeDirCandidates"` → 8 passed (both ≥ 6).
- WINDOWS.md `open_count` → 0; the ledger's JSON block still parses via `gsd-tools windows status`.
- Measurement scaffolding removed: throwaway vitest config deleted, 80 backslash-named artifacts removed by explicit prefix match. `git status` shows no untracked or modified file outside `.planning/` beyond this plan's own.
- STATE.md and ROADMAP.md not modified by any commit in this plan (the working-tree dirt on both predates it and belongs to a concurrent session).
