---
phase: 06-windows-command-resolution
plan: 02
subsystem: infra
tags: [windows, install-locations, version-managers, node-resolution, spawn-safety]

requires:
  - phase: 06-windows-command-resolution
    plan: 01
    provides: "joinPath (platform-injected spelling), getWindowsNamedRoots + WindowsNamedRoots, the pure buildCommandCandidatePaths seam with its thin impure caller, and the two CMP-01 regression nets"
  - phase: 04-platform-foundation
    provides: "getExecutableNames' single ordered extension ladder and WINDOWS_EXECUTABLE_EXTENSIONS"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P1-CMD (a direct .cmd spawn throws EINVAL SYNCHRONOUSLY) and P1-WHERE (C:\\Program Files\\nodejs\\node.exe existed on a real windows-latest host)"
provides:
  - "The full sourced Windows install-location table (D-09/D-11/D-12): nine locations, each row citing the installer script, package source or first-party doc it came from"
  - "buildWindowsInstallLocationCandidates — one shared copy of that table, used by both the command builder and the node builder"
  - "WindowsVersionDirs + the bounded win32 version-manager walk (nvm-windows, fnm modern, fnm legacy, Volta node images)"
  - "WIN32_VERSION_WALK_LIMIT — a win32-only emission bound; POSIX stays unbounded"
  - "buildNodeCandidatePaths — the pure, zero-I/O node candidate builder, with the Volta node image ordered ahead of the Volta .cmd shim"
  - "spawnAndWait's documented never-rejects invariant restored, with a greppable PRV-02 hand-off marker"
affects: [06-03, 06-04, 06-05, 06-06, 06-07, phase-07-launch, phase-09-real-machine]

actuals:
  tokens: 14992
  tasks: 4
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Cite-or-drop (D-12): every Windows path carries its installer source inline, and every path that could not be sourced is recorded as an explicit in-code non-claim rather than silently omitted"
    - "Discovery is I/O, spelling is pure: version directory NAMES are read from disk by a thin caller; the pure builder does all joining, which is what makes win32 version rows assertable on a Linux runner"
    - "A rootless row is gated on the LITERAL target platform, because a row with no environment dependency is the only kind that can fire in the pre-probe union arm and break POSIX byte-identity"

key-files:
  created: []
  modified:
    - packages/backend/src/command-resolution.ts
    - packages/backend/src/command-resolution.test.ts
    - packages/backend/src/index.ts

key-decisions:
  - "The .cmd spawn hazard is closed at the spawn HELPER, not by filtering the candidate list — spawnAndWait now wraps its spawn in a try whose catch resolves { code: 1 }, restoring the invariant CLAUDE.md documents for all six call sites"
  - "The rootless nvm-windows literal (C:\\nvm4w\\nodejs) fires only when the platform is literally win32. Every other row vanishes with its absent root, which is exactly why the pre-probe union arm is CMP-01-safe on POSIX; a rootless row is the one thing that could fire on a Linux host and break that"
  - "WIN32_VERSION_WALK_LIMIT bounds the EMISSION in the pure builder rather than the listing in the impure caller — Q3's own wording, where the per-directory stat cost actually lives, and the only place a five-becomes-three assertion is writable from literal inputs"
  - "The win32 install table was extracted into one shared helper so the command builder and the node builder cannot drift; the node builder adds only genuinely node-ONLY rows"
  - "path.dirname stays host-flavoured and moves into the thin impure caller (Q4), so the pure builder receives literal directories and its win32 sibling ladder is assertable on Linux"

patterns-established:
  - "Measuring a Windows-only test failure on a POSIX host: alias the `path` specifier to `path.win32` in a throwaway vitest config. Faithful for I/O-free tests; NOT faithful for tests that mkdtemp, because path.win32.join mangles a POSIX os.tmpdir()"

requirements-completed: [RES-01]

coverage:
  - id: D1
    description: "On win32, buildCommandCandidatePaths emits every KEEP row of the research catalogue and no DROP or UNSOURCED row, location-major (all four ladder spellings of one location before the next)"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#emits every KEEP row of the research catalogue, location-major"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#emits 9 locations x 4 ladder spellings when every root is populated"
        status: pass
      - kind: other
        ref: "grep gates: 0 extension literals outside the exported constant; exactly 1 drive-qualified literal; 0 dropped rows in executable code"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every emitted win32 path carries an inline source citation, and each of the four dropped rows is recorded as an explicit non-claim under its own distinct token"
    requirement: "RES-01"
    verification:
      - kind: other
        ref: "sed -n '/DROPPED/,/^$/p' | grep -c for each of nvm / 'Program Files' / asdf / .volta -> 1, 1, 2, 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "The nvm-windows version row carries the v prefix and NO bin segment; both fnm win32 rows end at installation while the POSIX fnm row keeps its bin segment"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#spells the nvm-windows version row with no bin segment and a v-prefixed directory"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#drops fnm's bin segment on win32 while the POSIX fnm row keeps it"
        status: pass
    human_judgment: false
  - id: D4
    description: "The win32 emission is bounded to three version directories per root; POSIX emission is unbounded"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#emits only the newest three version directories per root on win32"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#does not truncate the POSIX version list"
        status: pass
    human_judgment: false
  - id: D5
    description: "buildNodeCandidatePaths is exported, synchronous and performs no filesystem call; the Volta node image precedes the Volta shim; an absent program-files variable emits no row and never an empty prefix"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#emits the Volta node image before the Volta shim"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#emits no nodejs row at all when neither program-files variable is set"
        status: pass
      - kind: other
        ref: "python range extraction over the full 140-line body: 0 matches for await / stat( / readdir( / async / path.join / deps:"
        status: pass
    human_judgment: false
  - id: D6
    description: "The POSIX arms of both builders are byte-identical to the pre-Phase-6 output, and the CMP-01 tests from plan 06-01 are green and unedited"
    requirement: "RES-01"
    verification:
      - kind: unit
        ref: "pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t \"CMP-01\" (8 passed)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#buildNodeCandidatePaths CMP-01 POSIX order (linux, darwin, pre-probe)"
        status: pass
      - kind: other
        ref: "git diff shows only two removed lines in the test file, both assertions; no CMP-01 expected array touched"
        status: pass
    human_judgment: false
  - id: D7
    description: "spawnAndWait resolves for every input including one whose spawn throws synchronously — the documented never-rejects invariant holds"
    verification:
      - kind: other
        ref: "awk range over spawnAndWait: 1 try, 3 resolve(, 0 throw/reject in executable lines, spawn inside the guarded region, P1-CMD and PRV-02 present, 0 shell: in executable lines"
        status: pass
    human_judgment: false
  - id: D8
    description: "On a real Windows install, each catalogue row names a directory that actually exists"
    requirement: "RES-01"
    verification: []
    human_judgment: true
    rationale: "Unresolved BY DESIGN, carried forward from the plan's flagged_assumptions. Every path here is sourced from an installer script or first-party doc, but none is exercised against a real Windows install — the maintainer has no Windows machine (PROJECT.md § Constraints) and windows-latest ships none of these layouts. A wrong path fails as a silent stat miss, never an error. Closes on the Phase 9/10 real-machine report (@0xMRK0S). The research puts the catalogue's shelf life at roughly 2026-09-20."

duration: 15min
completed: 2026-08-21
status: complete
---

# Phase 6 Plan 02: The Sourced Windows Install-Location Catalogue Summary

**Nine Windows install locations, a bounded three-deep version-manager walk and a node-specific candidate builder — every row citing the installer script that produced it, every dropped row recorded as an in-code non-claim, the whole ordered list asserted byte-for-byte from literal inputs on a POSIX runner, and the spawn helper hardened first so the `.cmd` candidates this plan newly teaches the resolver to find degrade instead of crashing.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-21T11:00:42Z
- **Completed:** 2026-08-21T11:16:00Z
- **Tasks:** 4
- **Files modified:** 3
- **Tests:** 359 → 374 (all green); `pnpm -r typecheck` and `pnpm lint` exit 0

## Accomplishments

- **`spawnAndWait` cannot reject again (T-06-03A, done FIRST).** Its `spawn`/`spawnWithEnv` call now sits inside a `try` whose `catch` resolves the same failure shape `proc.on("error")` already resolves — exit code `1` with the rendered buffers. Both bounded-buffer declarations moved above the guard so the catch arm can render them, with their `maxChars`, `retention` and both explanatory comments byte-unchanged. The comment carries the evidence (`03-FINDINGS.md` § P1-CMD, never the CI artifact) and a greppable `PRV-02` marker stating plainly what the guard does NOT do.
- **The sourced table (T-06-04).** Nine locations — npm global prefix, the Claude native user bin, Volta shims, pnpm and its no-`LOCALAPPDATA` fallback, Bun, scoop per-user and machine-wide, and the nvm-windows symlink default — emitted location-major, each citing `nvm.iss` / `v4.rs` / `dirs.js` / `install.ps1` / npm's folders doc / Claude's setup doc. The three roadmap corrections ship corrected with the correction explained beside them, and the four dropped rows are written down as non-claims.
- **The bounded walk (T-06-05).** `WindowsVersionDirs` carries bare directory NAMES from a thin impure caller into the pure builder. `WIN32_VERSION_WALK_LIMIT = 3` bounds the win32 emission; POSIX stays unbounded and is pinned by its own test. The comment states outright that 3 is a cost bound and not a measurement, and that the reverse-lexical sort is deliberately left non-semver-correct.
- **Node resolution (T-06-06).** `buildNodeCandidatePaths` is pure and zero-I/O over its full 140-line body. The Volta node IMAGE is emitted ahead of the Volta `.cmd` shim, so a Volta user resolves a real `node.exe`. The Node MSI row cites Phase 3's own P1-WHERE measurement; the x86 row is tagged an ASSUMPTION and kept for WOW64 bitness. `path.dirname` stays host-flavoured and moved into the thin caller, with the exception written down beside it.
- **One copy of the table.** The win32 install rows were extracted into `buildWindowsInstallLocationCandidates`, shared by both builders, so a provider CLI and `node` cannot drift apart on where they look.
- **WINDOWS.md entry 6 closed** — and seven further Windows-red assertions in the same file found and fixed alongside it.

## Task Commits

1. **T-06-03A: restore spawnAndWait's never-rejects invariant** — `a3c0508` (fix)
2. **T-06-04 (RED): failing tests for the sourced named-root table** — `8118e26` (test)
3. **T-06-04 (GREEN): the sourced Windows named-root suffix table** — `914ce1e` (feat)
4. **T-06-05: the bounded win32 version-manager walk** — `92708fa` (feat)
5. **T-06-06 (RED): failing tests for buildNodeCandidatePaths** — `e519d8f` (test)
6. **T-06-06 (GREEN): node-specific Windows candidates and the Q4 sibling relocation** — `8e4bba3` (feat)

## Files Created/Modified

- `packages/backend/src/command-resolution.ts` — `NVM_WINDOWS_SYMLINK_DIR`, `WIN32_VERSION_WALK_LIMIT`, `WindowsVersionDirs`, `buildWindowsInstallLocationCandidates`, `listWindowsVersionDirs`, `buildNodeCandidatePaths`; `getCommandExecutableCandidates` and `getNodeExecutableCandidates` reduced to thin impure callers.
- `packages/backend/src/command-resolution.test.ts` — three new win32 describes (named roots, version walk, node builder) plus a node CMP-01 block; nine host-flavoured expectations converted to platform-injected ones.
- `packages/backend/src/index.ts` — `spawnAndWait`'s guard; `getNodeExecutable` now threads `platform: host?.platform` and `roots: getWindowsNamedRoots({ env: readParentEnv() })`. The defensive provider-command reading and its comment are untouched. No logging call added (T-06-T09 / 05-D-11 honoured).

## Decisions Made

- **The rootless nvm-windows literal is gated on the literal `"win32"`, not on the pre-probe union arm.** Plan 06-01's union-arm comment states the arm is CMP-01-safe *because every win32 row is skipped when no Windows root variable is set*. `C:\nvm4w\nodejs` is the only row in the catalogue that depends on no variable, so in the `undefined` arm it would fire on a Linux host and break the byte-identity the three CMP-01 tests pin. Gating it keeps that invariant true for the reason it was written. The cost is that a Windows pre-probe status check misses one broken-`PATH` fallback row; the probe has resolved before any launch resolves a command, and the installer puts that directory on `PATH` anyway.
- **The bound is applied to the EMISSION in the pure builder, not to the listing in the impure caller.** The plan's action text puts it in the caller; Q3's own wording is "bound the win32 *emission*", the per-directory cost it justifies (four `stat` calls through the extension ladder) is incurred by the emitted list rather than by the `readdir`, and the plan's own acceptance criterion demands a test proving a five-entry list becomes three — which is writable from literal inputs only if the builder does the bounding.
- **The win32 table was extracted into one shared helper.** Delegating from the node builder into `buildCommandCandidatePaths` with `command: "node"` would have dragged the POSIX arm along (`/bin/node`, `.npm-global`, a different home order — none of which are in today's node list). Extracting the win32 rows keeps exactly one copy of the catalogue without touching either POSIX arm.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seven further Windows-red test expectations in `command-resolution.test.ts` fixed alongside entry 6**

- **Found during:** T-06-06, while verifying the WINDOWS.md entry-6 fix rather than assuming it.
- **Issue:** 06-01 recorded the `windows-latest` breakage as "two assertions". Measuring it — by aliasing the `path` specifier to `path.win32` in a throwaway vitest config — showed the same defect class in two more tests in the same file: `collects version manager command candidates` (2 assertions) and `builds command candidates from PATH and common install locations` (5 assertions). All seven compare a platform-injected result against a host-flavoured `path.join` expectation, exactly like the two entry 6 names. Fixing only the named two would have left the blocking leg red for an identical reason.
- **Fix:** Converted all nine expectations (the two named plus the seven found) to the injected platform's separator. The directory-creating `path.join` calls are left host-flavoured — those create real directories and are correct.
- **Files modified:** `packages/backend/src/command-resolution.test.ts`
- **Verification:** Proven by construction, not just by the POSIX run — a scratch test asserted `joinPath({platform:"linux", segments:[<drive-lettered homeDir>, ...]})` equals the template-literal form for a Windows-shaped home directory. Both assertions passed.
- **Committed in:** `8e4bba3`

**2. [Rule 1 - Bug] The rootless literal row gated on the literal `"win32"`**

- **Found during:** T-06-04.
- **Issue:** The plan's behaviour spec says the win32 arm emits the rootless nvm-windows row with `roots: {}`. Emitted from the pre-probe union arm, that row fires on a POSIX host with no roots set — which fails all three `buildCommandCandidatePaths CMP-01 POSIX order` tests and violates the plan's own must-have truth that they stay green and unedited.
- **Fix:** The row is emitted only when the platform is literally `"win32"`, with the reasoning written beside it and threaded through the shared helper as an `emitRootlessLiteral` parameter.
- **Files modified:** `packages/backend/src/command-resolution.ts`
- **Verification:** All three CMP-01 POSIX tests green and unedited; `-t "CMP-01"` exits 0 across 8 tests.
- **Committed in:** `914ce1e`

**3. [Rule 3 - Blocking] One 06-01 test's assertion updated to the new no-roots answer**

- **Found during:** T-06-04.
- **Issue:** 06-01's `emits nothing at all for a named root the environment did not provide` asserted `[]` for `platform: "win32", roots: {}`. That was correct when every row depended on an env variable; the sourced catalogue adds one row that does not.
- **Fix:** Renamed to `emits only the rootless nvm-windows symlink row when no named root is set` and updated to the plan's stated behaviour, with a comment recording why the old shape was right and is no longer. It is not a CMP-01 test, and every other row still vanishes with its root — the T-06-T02 mitigation is intact and pinned by the surrounding assertions.
- **Files modified:** `packages/backend/src/command-resolution.test.ts`
- **Committed in:** `8118e26` / `914ce1e`

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3). No scope creep beyond `files_modified`. No architectural change; no Rule 4 escalation.

## Issues Encountered

**The `windows-latest` leg is still red, for a DIFFERENT and newly measured reason — recorded as WINDOWS.md entry 7.**

Verifying entry 6 rather than assuming it produced a real measurement: with `path` aliased to `path.win32`, **27** tests fail, not 2. Two of those are shim artifacts (`path.win32.join` mangles macOS's POSIX `os.tmpdir()`, so `mkdtemp` creates a bogus directory and the real walk finds nothing — impossible on a real Windows host, where `os.tmpdir()` is drive-lettered). The remaining **25 are genuine and faithful**: they are I/O-free.

All 25 live in `packages/backend/src/platform.test.ts`'s `joinPath CMP-01 POSIX byte-identity` block, which uses the **host** `path` module as its oracle. On a POSIX runner the oracle's flavour is POSIX by construction and the block proves what it claims; on Windows the oracle turns win32-flavoured and the block compares `/home/six/.local/bin/claude` against `\home\six\.local\bin\claude`.

**This plan did not fix it, deliberately.** `platform.test.ts` is not in this plan's `files_modified`, and the plan's own prohibitions and must-have truths require the 06-01 CMP-01 blocks to remain **green and unedited**. Editing that block to close the leg would have violated the constraint it was written to protect.

The fix is one token and strictly strengthens the proof: use `path.posix.join` as the oracle. It is byte-identical to `path.join` on a POSIX host — so 06-01's evidence keeps its exact value — and correct on win32, making the oracle POSIX **by construction** rather than by accident of the runner, which is what that block's own comment already claims it is. LLRT's missing `path.posix` namespace constrains the shipped `platform.ts`, not a test file running under vitest on Node.

**Owner:** the next Phase 6 plan permitted to touch `platform.test.ts`. Reproduction is in WINDOWS.md entry 7.

## Known Stubs

None. Every export shipped by this plan has a real implementation and an asserting test.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was introduced. The plan's own register (T-06-T05 through T-06-T10) is addressed in code: the walk reuses the single listing helper, absent roots emit nothing, the win32 emission is bounded, the Volta image outranks the shim, no diagnostic logs a value, and `spawnAndWait`'s guard closes T-06-T10 for all six call sites.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **RES-01's code half is complete.** ROADMAP SC-1 is satisfied in source: Windows candidates exist for npm-global, the user bin directory, Volta (shim *and* node image), Bun, pnpm, scoop (both scopes), nvm-windows (version dirs and symlink), fnm (modern and legacy), and the Node installer directory.
- **Phase 7 (PRV-02) has its seam marked.** `grep -n 'PRV-02' packages/backend/src/command-resolution.ts packages/backend/src/index.ts` finds both the spawn guard and the three rows that can resolve a `.cmd`. After this plan a `.cmd` Windows refuses degrades to a skipped candidate; **making it launchable is still entirely Phase 7's**, and nothing in this plan's output claims otherwise.
- **Blocking for merge:** WINDOWS.md entry 7 (25 assertions in `platform.test.ts`). Small, understood, and measured — but the `windows-latest` leg does not go green without it.
- **Unresolved by design:** RES-01's flagged assumption stands. This plan proves the catalogue's SPELLING against installer sources, not its EXISTENCE on a real machine. That closes on the Phase 9/10 real-machine report.
- **Estimate calibration note (#2632).** `actuals.tokens: 14992` is `chars/4` over the realized production diff (59,971 chars across `packages/backend/src`), the template's declared scale. It is NOT comparable to `estimate.tokens: 95000`, which projects agent-CONTEXT consumption; actual harness context used was roughly **220,000 tokens**, so the projection under-shot context use by about 2.3× — the same direction and rough magnitude 06-01 recorded, which is now a two-point trend rather than a one-off.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- All 3 modified source files and this SUMMARY present on disk.
- All 6 task commits present in `git log` (`a3c0508`, `8118e26`, `914ce1e`, `92708fa`, `e519d8f`, `8e4bba3`).
- `pnpm exec vitest run` — 31 files, 374 tests, 0 skipped, 0 failed.
- `pnpm -r typecheck` and `pnpm lint` both exit 0.
- `-t "CMP-01"` exits 0 across 8 tests; `git diff` removed exactly two lines from the test file, both assertions, no CMP-01 expected array touched.
- `spawnAndWait` awk range: 1 `try`, 3 `resolve(`, 0 `throw`/`reject(` in executable lines, `P1-CMD` and `PRV-02` present, 0 `shell:` in executable lines, `env: options.env` key surviving.
- `command-resolution.ts`: 0 `path.join` and exactly 1 `path.dirname` in executable lines; exactly 1 drive-qualified literal; 0 extension literals outside the exported constant; all four DROPPED tokens distinct.
- `buildNodeCandidatePaths` purity re-verified over its full 140-line body by range extraction, not by the truncating `awk` window: 0 matches for `await` / `stat(` / `readdir(` / `async` / `path.join` / `deps:`.
- WINDOWS.md entry 6 `fixed`; entry 7 recorded `open` with its reproduction.
- STATE.md and ROADMAP.md not modified by this plan (STATE.md's dirty state predates it and belongs to a concurrent session).
