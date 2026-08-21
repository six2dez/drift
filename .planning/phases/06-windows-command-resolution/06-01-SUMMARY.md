---
phase: 06-windows-command-resolution
plan: 01
subsystem: infra
tags: [windows, path-resolution, pure-helpers, tracer, command-resolution, llrt]

requires:
  - phase: 04-platform-foundation
    provides: "platform.ts — the zero-import, zero-I/O pure module with injected `platform`, `getExecutableNames`' extension ladder, and `getHomeDirCandidates`' env-name reader shape"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P3-VARS (USERPROFILE/APPDATA/LOCALAPPDATA present and non-empty on windows-latest) and P1-CMD (a .cmd cannot be spawned directly)"
provides:
  - "joinPath({platform, segments}) — path spelling driven by the TARGET platform, never the host's `path` flavour (D-05)"
  - "getWindowsNamedRoots({env}) + the WindowsNamedRoots type — the six Windows install roots read by name, both casings (D-09's input shape)"
  - "buildCommandCandidatePaths — a pure, synchronous, zero-I/O candidate builder (D-10's seam, which SC-5's Windows evidence is written against)"
  - "getCommandExecutableCandidates as a thin impure caller that owns all stat/readdir"
  - "One sourced Windows install location resolving end to end: %APPDATA%\\npm (catalogue row P-01)"
  - "Two named CMP-01 regression nets pinning the POSIX spelling and the POSIX candidate ORDER"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, phase-07-launch, phase-09-real-machine]

actuals:
  tokens: 9100
  tasks: 4
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Platform-injected path spelling: every path a module builds is spelled through joinPath for the TARGET platform, so a Linux-runner assertion states what a Windows box will produce"
    - "Pure/impure split at the candidate builder: the ordered list is built with zero I/O; stat/readdir live in a thin caller (D-10) — no injected filesystem fake"
    - "Named roots over a flat home-dir cross product: an absent root emits NO candidate, never an empty prefix"

key-files:
  created: []
  modified:
    - packages/backend/src/platform.ts
    - packages/backend/src/platform.test.ts
    - packages/backend/src/command-resolution.ts
    - packages/backend/src/command-resolution.test.ts
    - packages/backend/src/index.ts

key-decisions:
  - "joinPath and getWindowsNamedRoots live in platform.ts — both satisfy that file's two load-bearing, mechanically-checkable properties (zero I/O, zero imports); the install-location DATA stays in command-resolution.ts per 04-D-03's shape-versus-data line"
  - "The win32 row's separator AND its extension ladder are pinned to the literal \"win32\" even when the host platform is undefined: both are properties of the Windows row, not of the host"
  - "getNodeExecutableCandidates' joins take a temporary `platform: undefined` POSIX-arm pass-through (CMP-01-safe, since the POSIX arm IS the pre-sweep spelling) until plan 06-02's T-06-06 substitutes the real probe value"
  - "The T-06-06 marker required by T-06-01B's awk gate was placed inside the signature's parameter object, because the awk range terminates at the `}): Promise<string[]> {` line and never reaches the body"

patterns-established:
  - "Comment-carried evidence for a hand-rolled helper: state the runtime fact (LLRT declares no posix/win32 namespace), the alternative rejected, and where the byte-identity proof lives"
  - "A CMP-01 block is a named, loop-driven table addressable by `-t \"CMP-01\"`, so a suffix added to a builder without a row shows up as an omission"

requirements-completed: [RES-01, RES-03]

coverage:
  - id: D1
    description: "joinPath spells paths for the injected target platform — backslash on win32, forward slash otherwise, seams collapsed, empty segments dropped, first segment's leading separator preserved"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#joinPath"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#joinPath CMP-01 POSIX byte-identity"
        status: pass
    human_judgment: false
  - id: D2
    description: "getWindowsNamedRoots reads the six Windows install roots by name in both casings, native spelling first, and leaves an absent or whitespace-only root ABSENT rather than empty"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWindowsNamedRoots"
        status: pass
    human_judgment: false
  - id: D3
    description: "buildCommandCandidatePaths is a pure, synchronous, zero-I/O builder emitting the %APPDATA%\\npm ladder in .exe/.cmd/.bat/bare order from literal roots, with an absent root emitting nothing"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#buildCommandCandidatePaths (win32 named roots)"
        status: pass
      - kind: other
        ref: "python range extraction over the full 66-line body: 0 matches for await / stat( / readdir( / async / path.join / deps:"
        status: pass
    human_judgment: false
  - id: D4
    description: "The POSIX candidate list and its ORDER are byte-identical to the pre-split list on linux, darwin, and the pre-probe undefined arm"
    requirement: "RES-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#buildCommandCandidatePaths CMP-01 POSIX order"
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run (full suite, 359 tests, 0 skipped)"
        status: pass
    human_judgment: false
  - id: D5
    description: "resolveCommand is wired to the seam: it passes the RUN-05 probe platform and getWindowsNamedRoots({ env: readParentEnv() }) into the thin impure caller, and logs no environment value"
    verification:
      - kind: other
        ref: "grep -Eq 'getWindowsNamedRoots\\(\\{ env: readParentEnv\\(\\) \\}\\)' packages/backend/src/index.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "On a real Windows install, the candidate resolveCommand selects is a path that actually exists on disk"
    requirement: "RES-01"
    verification: []
    human_judgment: true
    rationale: "No Windows machine is available (PROJECT.md Constraints) and windows-latest carries none of the version-manager or installer layouts the catalogue names. This plan proves the catalogue's SPELLING, not its EXISTENCE. Closes on the Phase 9/10 real-machine report — the plan's `flagged_assumptions` entry for RES-01, left unresolved on purpose."

duration: 12min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 01: Windows Command Resolution Substrate Summary

**A platform-injected `joinPath`, a six-root Windows env reader, and the pure/impure split of the command-candidate builder — with one sourced Windows install location (`%APPDATA%\npm`) resolving end to end from literal inputs on a POSIX runner, and the POSIX spelling and order pinned by two named CMP-01 regression nets.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-21T10:46:30Z
- **Completed:** 2026-08-21T10:58:00Z
- **Tasks:** 4
- **Files modified:** 5

## Accomplishments

- **`joinPath` (D-05)** — the separator comes only from the injected `platform`, never from the `path` module's host-flavoured separator. This is what makes a Windows candidate assertable on the Linux CI runner instead of being an accident of the runner.
- **`getWindowsNamedRoots` + `WindowsNamedRoots` (D-09's input shape)** — the six install roots read by NAME from an injected env, native casing first and SCREAMING casing as the fallback. An absent or whitespace-only root is left absent, so no candidate can ever carry an empty prefix (the T-06-T02 mitigation).
- **The D-10 seam** — `buildCommandCandidatePaths` is a pure, synchronous, zero-I/O export; `getCommandExecutableCandidates` became the thin impure caller that owns every `stat`/`readdir`. No filesystem dependency object was injected, per D-10's explicit rejection of that alternative.
- **One Windows install location, end to end** — `%APPDATA%\npm\<cmd>.exe|.cmd|.bat|<cmd>` (catalogue row P-01, sourced to npm's own folders documentation, with the missing `bin` segment called out in the comment), wired through `resolveCommand` and asserted with `toEqual` against a four-entry literal array with no directory created.
- **Two CMP-01 regression nets** — 50 assertions proving `joinPath`'s POSIX output is byte-identical to the module join it replaces across 25 enumerated segment rows, and a 12-entry literal-array assertion pinning the candidate ORDER on `linux`, `darwin` and the pre-probe `undefined` arm.
- **The D-05 sweep is complete across the module** — zero `path.join` in executable code, exactly one `path.dirname` surviving as the recorded host-flavoured exception.

## Task Commits

1. **T-06-01 (RED): failing tests for the three new exports** — `fca3353` (test)
2. **T-06-01 (GREEN): joinPath, getWindowsNamedRoots, the D-10 seam, and the index.ts wiring** — `df75dc5` (feat)
3. **T-06-02: CMP-01 — joinPath POSIX byte-identity** — `8d77156` (test)
4. **T-06-03: CMP-01 — the pre-split candidate order** — `543ba27` (test)
5. **T-06-01B: finish the D-05 sweep in the impure version walk** — `2903576` (refactor)

## Files Created/Modified

- `packages/backend/src/platform.ts` — added `joinPath`, `WindowsNamedRoots`, `getWindowsNamedRoots`. Zero-import property preserved (`grep -c '^import'` returns 0); header comment untouched.
- `packages/backend/src/platform.test.ts` — `joinPath` and `getWindowsNamedRoots` describes, plus the `joinPath CMP-01 POSIX byte-identity` block. The `path` module is imported HERE only, as the oracle.
- `packages/backend/src/command-resolution.ts` — pure `buildCommandCandidatePaths`; `getCommandExecutableCandidates` reduced to the thin impure caller; `listVersionDirectories` and `collectVersionManagerCommandCandidates` moved to object params carrying the target platform; every module join swept onto `joinPath`.
- `packages/backend/src/command-resolution.test.ts` — the win32 named-root block, the `buildCommandCandidatePaths CMP-01 POSIX order` block, and two mechanical call-shape updates.
- `packages/backend/src/index.ts` — `resolveCommand` now passes `platform: host?.platform` and `roots: getWindowsNamedRoots({ env: readParentEnv() })`. No logging call added (T-06-T03 / 05-D-11 honoured).

## Decisions Made

- **The win32 row's `joinPath` platform argument is the literal `"win32"`, not `input.platform`.** The plan pinned the *extension ladder* to `"win32"` on the grounds that the ladder is a property of the Windows row rather than of the host; the same reasoning applies to the row's separator, so a Windows row emitted from the pre-probe `undefined` arm is still backslash-spelled rather than spelled with the runner's separator. Stated in a comment beside the arm.
- **`getNodeExecutableCandidates` was swept too, not just the two walk helpers.** T-06-01B's action text names the two walk helpers, but its acceptance criterion and the plan-level `<verification>` both require `path.join` to reach ZERO in the whole module's executable code — and four of those calls live in `getNodeExecutableCandidates`. They were converted with a `platform: undefined` POSIX-arm pass-through, which is byte-identical on POSIX, and each site carries the comment naming plan 06-02's T-06-06 as its replacement.
- **The `T-06-06` marker sits in the signature's parameter object.** T-06-01B's gate is `awk '/export async function getNodeExecutableCandidates/,/^}/' | grep -Ec 'T-06-06'`. That awk range terminates at the `}): Promise<string[]> {` line — a `}` in column 0 — and so never reaches the function body where the substantive explanation lives. A short note naming T-06-06 was added inside the parameter object, where a reader of the signature sees it, so the gate passes for the reason it was written rather than by accident. The full explanation stays in the body beside the pass-through sites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getNodeExecutableCandidates`' own `path.join` calls swept**

- **Found during:** Task 4 (T-06-01B)
- **Issue:** T-06-01B's action text scopes the sweep to `listVersionDirectories` and `collectVersionManagerCommandCandidates`, but its own acceptance criterion (`grep -v '^\s*//' … | grep -c 'path\.join'` returns `0`) and the plan-level `<verification>` are whole-module. Four `path.join` calls in `getNodeExecutableCandidates` would have failed the gate.
- **Fix:** Converted all four to `joinPath` with an explicit `platform: undefined` POSIX-arm pass-through and a comment naming plan 06-02's T-06-06 as the task that substitutes the real probe value. `path.dirname` was NOT converted — it remains the one deliberate exception, as both this plan and 06-02 require.
- **Files modified:** `packages/backend/src/command-resolution.ts`
- **Verification:** `grep -v '^\s*//' … | grep -c 'path\.join'` → `0`; `grep -c 'path\.dirname'` → `1`; full suite green.
- **Committed in:** `2903576`

**2. [Rule 3 - Blocking] `T-06-06` marker relocated into the signature so its gate is meaningful**

- **Found during:** Task 4 (T-06-01B)
- **Issue:** The gate's `awk` range ends at the first column-0 `}`, which for this function is the `}): Promise<string[]> {` line closing the parameter object — so the body comment naming T-06-06 was invisible to the gate and it returned `0`.
- **Fix:** Added a three-line note naming T-06-06 inside the parameter object, keeping the substantive explanation in the body. The same `awk`-range truncation was noticed for the T-06-01 purity/async/join gates on `buildCommandCandidatePaths`; those properties were therefore re-verified over the function's real 66-line body with an exact range extraction rather than trusting the truncated `awk` window — 0 matches for `await`, `stat(`, `readdir(`, `async`, `path.join`, `deps:`.
- **Files modified:** `packages/backend/src/command-resolution.ts`
- **Verification:** `awk … | grep -Ec 'T-06-06'` → `1`; full-body extraction reported above.
- **Committed in:** `2903576`

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking, both required to clear the plan's own acceptance gates).
**Impact on plan:** No scope creep. Both changes are inside `files_modified`, both were demanded by criteria the plan already states, and neither alters POSIX behaviour — the two CMP-01 blocks are green and unedited.

## Issues Encountered

**The `windows-latest` CI leg will fail two assertions until plan 06-02's T-06-06 lands.** `ci.yml` runs `pnpm exec vitest run` on a `windows-latest` job. `getNodeExecutableCandidates` now spells its paths through `joinPath`'s POSIX arm (the temporary pass-through above), while the existing node-candidate test at `command-resolution.test.ts:90-122` builds its expectations with the host-flavoured `path.join` — legitimately so, per the comment at `:97-110` that records the real CI red which taught it. On a POSIX runner the two agree exactly (the full suite is green here); on a Windows host they will not:

- `expect(candidates).toContain(path.join(providerDir, "node"))`
- `expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "node"))`

This is a spelling mismatch in the TEST's expectation, not a runtime break — win32 APIs accept mixed separators. Plan 06-01 forbids touching that block (T-06-01 action step 6: "`:90-122` moves in plan 06-02's T-06-06; leave both untouched here"), and 06-02's T-06-06 rewrites both the function and the test. It is recorded in `.planning/WINDOWS.md` so it cannot be forgotten if 06-02 slips.

## Known Stubs

None. Every export shipped by this plan has a real implementation and an asserting test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **The seam every other Phase 6 plan depends on exists and is proven.** 06-02, 06-03 and 06-04 can now add Windows rows as pure DATA against `buildCommandCandidatePaths` and assert them from literal inputs, with the POSIX arm protected by two CMP-01 nets that fail loudly on a reordering or a respelling.
- **Blocking for 06-02:** T-06-06 must give `getNodeExecutableCandidates` a real `platform`, replace the four `platform: undefined` pass-throughs, and update `command-resolution.test.ts:90-122`. Until it does, the `windows-latest` CI leg is red (see Issues Encountered).
- **Unresolved by design:** RES-01's flagged assumption stands — this plan proves the catalogue's SPELLING, not its EXISTENCE on a real machine. That closes on the Phase 9/10 real-machine report and is not claimed here.
- **Estimate calibration note (#2632).** `actuals.tokens: 9100` is `chars/4` over the realized production diff (36,343 chars across `packages/backend/src`), which is the template's declared scale and the same output-size proxy Phase 05 used — it is NOT comparable to this plan's `estimate.tokens: 95000`, which projects agent-CONTEXT consumption. The context-basis figure for this executor was roughly **194,000 tokens of harness budget consumed**, i.e. the 95,000 projection under-shot actual context use by about 2×. Both numbers are recorded separately and on purpose: the plan's own frontmatter warns that mixing the two scales measures the measurement methods rather than the miss.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- All 5 modified files present on disk.
- All 5 task commits present in `git log`.
- `pnpm exec vitest run` — 31 files, 359 tests, 0 skipped, 0 failed.
- `pnpm -r typecheck` and `pnpm lint` both exit 0.
- `grep -c '^import' packages/backend/src/platform.ts` → 0.
- `grep -v '^\s*//' packages/backend/src/command-resolution.ts | grep -c 'path\.join'` → 0; `path\.dirname` → 1.
- Both CMP-01 blocks addressable by `-t "CMP-01"` and green.
