---
phase: 06-windows-command-resolution
plan: 04
subsystem: infra
tags: [windows, home-dir, path-dedup, recorded-non-claims, cmp-01]

requires:
  - phase: 06-windows-command-resolution
    plan: 02
    provides: "buildCommandCandidatePaths / buildNodeCandidatePaths with an injected platform in scope at every pushUniqueCandidate call site, plus the win32 install-location table whose emissions the fold now dedups"
  - phase: 06-windows-command-resolution
    plan: 01
    provides: "joinPath (platform-injected spelling) and the CMP-01 whole-array regression blocks that pin the POSIX candidate order byte-for-byte"
  - phase: 04-platform-foundation
    provides: "isAbsolutePath's drive-letter character tests and its platform: undefined arm — the shape D-06 copies — and normalizePathForCompare, the export D-07 declines to call"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P0-TMP — os.tmpdir() measured returning the 8.3 short form while USERPROFILE returned the long form; the measurement that motivated 04-D-04 and that D-07 shows does not bite here"
provides:
  - "extractHomeDir recognises C:\\Users\\<name> and C:/Users/<name>, emitting the separator spelling and the casing it was given, while staying platform-blind (one string in, no injected platform)"
  - "Three recorded non-claims written beside the code that makes them: UNC paths, non-\"Users\" profile roots, and traversal segments all yield undefined by design"
  - "foldCandidateKey(value, platform) — the pure win32 dedup key: lowercased and separator-normalized on the literal win32 only, a no-op on every other platform value including undefined"
  - "pushUniqueCandidate compares folded keys while still storing the ORIGINAL spelling; all 29 call sites pass the platform already in scope"
  - "D-07's decline of 04-D-04 recorded in TWO places in code: the rejected alternative beside the fold, and the preservation note beside the still-uncalled export"
  - "Four stale Phase 6 claims corrected in place across two files; both stale-comment gates now return 0"
affects: [06-05, 06-06, 06-07, phase-07-launch, phase-09-real-machine]

actuals:
  tokens: 6621
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A shape-sniffing arm that runs BEFORE an existing normaliser and returns only on a match, so the pre-existing route through the function is byte-for-byte unchanged — ordering stated as deliberate rather than left as an accident of how the normaliser happens to tokenise"
    - "A pure comparison KEY that is never an emitted value: fold for equality, store and spawn the original spelling"
    - "Recording the REJECTED alternative next to the code that chose against it, naming the case the earlier decision anticipated and why it does not arise — so a reader arriving with only the earlier decision can reconstruct the decline"

key-files:
  created: []
  modified:
    - packages/backend/src/command-resolution.ts
    - packages/backend/src/command-resolution.test.ts
    - packages/backend/src/runtime-probe.ts

key-decisions:
  - "extractHomeDir stays PLATFORM-BLIND (D-06, locked): one optional string in, one optional string out. Injecting a platform was rejected because getKnownHomeDirs is reachable from a provider status check at plugin load, before the runtime probe sets the host facts, so every pre-probe call site would pass undefined anyway and the shape-sniffing arm would be needed regardless — with more ceremony around it."
  - "A traversal segment REJECTS the whole input rather than being collapsed. The POSIX arm reaches the same outcome by normalising first and then failing the prefix test; matching that on the Windows side would have meant shipping a second, drive-aware normaliser this phase has no other use for."
  - "The Windows arm runs before normalizePosixPath and returns only on a match. A backslash-spelled path happens to survive that normaliser unchanged today (it splits on \"/\" only), but relying on that accident would couple the two arms silently, so the ordering is stated as deliberate in code."
  - "The dedup fold is applied on the literal win32 platform ONLY, never on undefined — the deliberate opposite of D-08's union-when-unknown rule. The failure modes are not symmetric: a missed dedup costs one extra existence check, while an over-eager fold DROPS a real candidate, and a POSIX path differing only in case names a different file."
  - "D-07 declines 04-D-04's expectation rather than manufacturing a caller. normalizePathForCompare is neither deleted, nor wired, nor marked deprecated; the reason now lives beside the export in the same comment shape index.ts already uses for the preserved genUUID re-export."

patterns-established:
  - "Non-claims are code, not planning prose: every path shape a recogniser deliberately refuses (UNC, a redirected profile root, a traversal segment) is named beside the recogniser, with the reason it is a decision rather than a gap"
  - "When a plan's acceptance gate greps a source file for evidence, assert it CASE-SENSITIVELY where the case-insensitive form would match an unrelated substring — `grep -i UNC` matches the \"unc\" inside \"function\" and would have passed vacuously"

requirements-completed: [RES-03]

coverage:
  - id: D1
    description: "extractHomeDir returns the Windows profile directory for a drive-qualified path in BOTH the backslash and the forward-slash spelling, for any drive letter, in any casing — emitting the separator spelling and the casing it was given"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#command resolution helpers > extracts home directories from Windows profile paths in both spellings"
        status: pass
      - kind: other
        ref: "grep -Eq 'export function extractHomeDir\\(candidatePath: string \\| undefined\\)' — signature unchanged, function stays platform-blind (D-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Windows path shapes extractHomeDir deliberately does not recognise — a UNC path (T-06-T15), a traversal path (T-06-T14), a non-profile path, a bare drive, and a profile root with no user segment — all return undefined, and each non-recognition is recorded in code as a reasoned non-claim"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#command resolution helpers > declines the Windows path shapes it deliberately does not recognise"
        status: pass
      - kind: other
        ref: "grep -Ec 'UNC|network share' packages/backend/src/command-resolution.ts returns 2 (case-sensitive; returned 0 before this plan)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The macOS and Linux arms of extractHomeDir are byte-identical — every pre-existing assertion in the home-directory test passes unedited (CMP-01)"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#command resolution helpers > extracts home directories from macOS and Linux-style paths"
        status: pass
    human_judgment: false
  - id: D4
    description: "Candidate-path equality on win32 is a pure lowercased, separator-normalized key: two spellings of one Windows path collapse to a single entry and the FIRST spelling pushed is the one retained, while two POSIX paths differing only in case both survive"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#foldCandidateKey (D-07) > collapses case and separator spelling into one key on win32"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#foldCandidateKey (D-07) > does not fold on a POSIX platform, where case names another file"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#foldCandidateKey (D-07) > does not fold before the platform is known"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#pushUniqueCandidate dedup key (D-07) > keeps the FIRST win32 spelling and drops the second"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#pushUniqueCandidate dedup key (D-07) > keeps BOTH POSIX paths that differ only in case (CMP-01 guard)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#pushUniqueCandidate dedup key (D-07) > still trims and still skips empty values on every platform"
        status: pass
      - kind: other
        ref: "awk range over foldCandidateKey, comment lines filtered: 0 matches for await|async|stat(|realpath — the fold is pure"
        status: pass
    human_judgment: false
  - id: D5
    description: "The whole-array CMP-01 blocks from 06-01/06-02 are still green with their expected arrays unedited — the fold changed no POSIX candidate list"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t \"CMP-01\" — 9 passed, 28 skipped"
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run — 402 passed across 31 files (was 394 before this plan; 8 added, 0 changed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "normalizePathForCompare still exists, is still exported, and is still uncalled by production code — with the decline recorded beside the export in the shape index.ts already uses for the preserved genUUID re-export, not only in a planning document"
    requirement: "RES-03"
    verification:
      - kind: other
        ref: "grep -rn 'normalizePathForCompare' packages/ — 4 hits in runtime-probe.ts (1 export, 2 comments) and 1 comment in command-resolution.test.ts; zero production call sites"
        status: pass
      - kind: other
        ref: "grep -Eci 'DO NOT DELETE' and grep -Eci 'declin' over runtime-probe.ts both return >= 1; grep -c 'P0-TMP' returns 1 (measured evidence intact)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts — 28 passed, file unmodified by this plan"
        status: pass
    human_judgment: false
  - id: D7
    description: "No comment in the repository still claims Phase 6 will call normalizePathForCompare or that Phase 6 compares a temp-directory path against a home-directory path — four stale claims corrected in place across two files"
    requirement: "RES-03"
    verification:
      - kind: other
        ref: "grep -c 'belongs to Phase 6' packages/backend/src/command-resolution.ts returns 0 (returned 1 before this plan)"
        status: pass
      - kind: other
        ref: "grep -c 'Phase 6 compares exactly those' and grep -c 'makes Phase 6' over runtime-probe.ts both return 0 (each returned 1 before this plan)"
        status: pass
      - kind: other
        ref: "git diff -U0 packages/backend/src/runtime-probe.ts, non-comment changed lines: 0 — the file's diff is comment-only"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-21
status: complete
---

# Phase 06 Plan 04: Windows Home-Directory Recognition and the Pure Candidate Dedup Fold Summary

**`extractHomeDir` now recognises `C:\Users\<name>` in both separator spellings while staying platform-blind, win32 candidates dedup through a pure lowercased/separator-folded key rather than a filesystem call, and the four stale Phase 6 claims those two changes falsified are corrected in place.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-21T13:35:40Z (11:35 UTC)
- **Completed:** 2026-08-21T13:44:24Z (11:44 UTC)
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **RES-03's residual half is closed.** A Windows user whose plugin path or configured provider command sits under their profile directory now yields a usable home directory — in `C:\Users\six` or `C:/Users/six` spelling, any drive letter, any casing — which is what seeds the whole family of home-derived candidate rows that returned nothing on Windows before.
- **The win32 candidate set no longer carries duplicates produced purely by a spelling difference.** `foldCandidateKey` collapses `C:\Program Files\nodejs\node.exe` and `c:/program files/nodejs/node.exe` to one key while the array keeps the first ORIGINAL spelling, so the string that is later `stat`-ed and spawned is untouched by the fold.
- **Three deliberate non-claims are now recorded in code rather than only in planning artifacts** — UNC paths, non-`Users` profile roots, and traversal segments. Each says why it is a decision rather than a gap, so a later reader does not "fix" it by guessing.
- **D-07's decline of 04-D-04 is written down twice, in both places a reader could arrive from.** The rejected canonicalisation ladder is named beside the fold that replaced it (with the four reasons it was rejected and the 8.3 short-form case it anticipated), and the still-uncalled export in `runtime-probe.ts` carries the preservation note in the same shape `index.ts` already uses for the preserved `genUUID` re-export.
- **Zero POSIX movement.** 402 tests green (394 before, 8 added, none changed); every CMP-01 whole-array block still passes with its expected arrays unedited.

## Task Commits

Each task was committed atomically; the two TDD tasks are RED → GREEN pairs.

1. **T-06-10: extractHomeDir recognises the Windows profile path in both spellings (D-06)** — `598765d` (test, RED) → `17f80a0` (feat, GREEN)
2. **T-06-11: pushUniqueCandidate folds the win32 dedup key (D-07)** — `988a3a6` (test, RED) → `5aa9869` (feat, GREEN)
3. **T-06-12: Correct the canonicalisation ladder's stale Phase 6 claims (D-07)** — `b8e287c` (docs)

## Files Created/Modified

- `packages/backend/src/command-resolution.ts` — the Windows profile arm in `extractHomeDir` (explicit character tests, no regex containing a backslash), the new `foldCandidateKey` export, `pushUniqueCandidate`'s third `platform` parameter and folded-key comparison, 29 call sites updated, `WINDOWS_PROFILE_DIR_NAME` added, and `normalizePosixPath`'s stale hand-off paragraph rewritten in the present tense
- `packages/backend/src/command-resolution.test.ts` — 8 new tests across two new describe blocks plus two new `it`s in the existing block; no existing assertion edited
- `packages/backend/src/runtime-probe.ts` — comment-only diff correcting three stale claims above `normalizePathForCompare` and adding the preservation note

## Decisions Made

- **`extractHomeDir` keeps its exact signature (D-06, locked).** Adding a `platform` parameter was declined for the reason 06-CONTEXT records: `getKnownHomeDirs` is reachable from a provider status check at plugin load, before the runtime probe sets the host facts, so every pre-probe call site would pass `undefined` and the shape-sniffing arm would be needed anyway.
- **The Windows arm runs on the trimmed input, before `normalizePosixPath`, and returns only on a match.** A backslash-spelled path already survives that normaliser unchanged (it splits on `/` only), but relying on that accident would couple the two arms silently — so the ordering is stated in code as deliberate, and the POSIX route is byte-for-byte the one it always was.
- **A `.` or `..` segment rejects the whole input.** The POSIX arm reaches the same outcome by normalising and then failing the prefix test; matching that here would have meant shipping a second, drive-aware normaliser this phase has no other use for.
- **The fold applies on the literal `"win32"` only, never on `undefined`.** This is the deliberate opposite of D-08's union-when-unknown rule and the asymmetry is stated in code: a missed dedup costs one extra existence check, an over-eager fold DROPS a real candidate, and macOS being case-insensitive while Linux is not means an unknown platform cannot be folded safely.
- **`buildWindowsInstallLocationCandidates` passes the literal `"win32"`** rather than a threaded platform, because it is a win32-only helper with no platform in its input; every other call site passes the `input.platform` it already had in scope.

## Deviations from Plan

None — plan executed exactly as written. All three tasks landed with their prescribed behaviour, both TDD tasks failed RED before implementation (1 failure for T-06-10, 4 for T-06-11), and every acceptance criterion was run and passed.

Two small judgment calls made inside the plan's own latitude, recorded for transparency:

- **Formatting of touched lines.** `command-resolution.ts` and its test carry widespread pre-existing prettier divergences at the default 80-column width. Per the wave-2 apparatus note, existing divergences were left alone; the three lines I added that diverged were reformatted to prettier's output, and the 29 call sites — every one of which I was modifying anyway to add the argument — were emitted in prettier's multi-line call form. No line I did not otherwise touch was reformatted, and no CMP-01 test expectation was touched.
- **`WINDOWS_PROFILE_DIR_NAME` as a module constant.** The plan specifies the comparison but not where the name lives. It was made a module-level constant beside `NVM_WINDOWS_SYMLINK_DIR`, compared `.toLowerCase()` on both sides, so the one recognised profile-root name has exactly one definition.

## Issues Encountered

- **The `awk`-range acceptance gate on `foldCandidateKey` needed a shape check before it could be trusted.** Wave 2 recorded that prettier closes an inline object parameter as `}): T {` — a column-0 brace that terminates `awk '/…/,/^}/'` at the signature. `foldCandidateKey` takes two positional parameters, so prettier closes it as `): string {`, which starts with `)` and does not terminate the range. Verified by printing the extracted range (7 lines, whole body including the `return`) before reading the gate's `0`. No code change was needed — checking the range first is what stopped this from looking like a passing gate over nothing.
- **The plan's own warning about `grep -i UNC` proved out.** Case-insensitively, `UNC` matches the `unc` inside `function` and returns 12 against this file with no non-claim written at all. The gate was run case-sensitively as the plan specifies: 0 before, 2 after.
- **No `git stash`, no `git clean`, no worktree operations** were used; the concurrent `.planning/` edits from the other session were left untouched and are not in any commit here.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for 06-05 onward.** The two pure functions RES-03 needed are done and asserted from literal inputs on the POSIX runner, so nothing here waits on a Windows host to be believed.
- **Still open in this phase:** `getKnownHomeDirs` (`index.ts`) still hardcodes `process.env.HOME` and does not yet call `getHomeDirCandidates` — that is D-08's wiring and belongs to a later plan in this phase. Until it lands, `extractHomeDir`'s new arm is reachable only through the plugin-path and provider-command routes, not through the Windows home variables.
- **Carried forward deliberately:** `normalizePathForCompare` remains exported and uncalled. The next reader to consider deleting it will find the reason next to it; if a genuine caller ever appears, the preservation note says to delete the bookkeeping rather than keep it.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- All three modified files present on disk.
- All five task commits present in `git log` (`598765d`, `17f80a0`, `988a3a6`, `5aa9869`, `b8e287c`).
- Every commit touches only `packages/backend/src/` — `STATE.md`, `ROADMAP.md` and the
  concurrently-edited `.planning/` files are untouched and unstaged.
- Stub scan over all added lines: 0 matches for TODO / FIXME / placeholder / coming soon.
- `pnpm exec vitest run` 402 passed (31 files); `pnpm -r typecheck` and `pnpm lint` both exit 0.
