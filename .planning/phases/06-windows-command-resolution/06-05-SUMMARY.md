---
phase: 06-windows-command-resolution
plan: 05
subsystem: infra
tags: [windows, path-search, spawn-seam, wiring, where-exe, home-dirs, cmp-01]

requires:
  - phase: 06-windows-command-resolution
    plan: 03
    provides: "rankPathSearchHits (the D-01 ranking with its extension-termination filter and byte-identical POSIX no-op arm), getWhichCommand({platform, env}) with the win32 absolute-path arm and its reachable bare-name fallback, and getHomeDirCandidates' pre-probe union of both home-variable name sets"
  - phase: 06-windows-command-resolution
    plan: 04
    provides: "extractHomeDir's Windows profile arm — the consumer that only becomes reachable through the Windows home VARIABLES once this plan's D-08 wiring lands — and the win32 candidate dedup fold that collapses the extra spellings a wider home set produces"
  - phase: 06-windows-command-resolution
    plan: 02
    provides: "spawnAndWait's restored never-rejects invariant, so a `.cmd` Windows refuses degrades to {code: 1} rather than an unhandled rejection travelling out of the resolver this plan feeds"
  - phase: 04-platform-foundation
    provides: "getWhichCommand and getHomeDirCandidates as zero-caller exports, WINDOWS_EXECUTABLE_EXTENSIONS, and isAbsolutePath's platform-undefined threading — the shape this plan copies at the spawn seam"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P1-WHERE (where.exe printing an absolute path across two CRLF-split lines on a real windows-latest host) — the measurement that makes the carriage-return-tolerant split and the multi-line ranking necessary rather than speculative"
provides:
  - "resolveCommand spawns the PLATFORM-CHOSEN PATH-search binary: getWhichCommand({platform: host?.platform, env: readParentEnv()}) supplies both the command and its argument builder, so Phase 4's zero-caller export is now shipped behaviour"
  - "POSIX_PATH_SEARCH_TIMEOUT_MS (1000, extracted unchanged) and WIN32_PATH_SEARCH_TIMEOUT_MS (5000), selected on the literal \"win32\" at the timeout — the asymmetry stated by two named constants rather than hidden behind one bare literal"
  - "The win32 timeout's provenance written in the source as a headroom estimate bounded by three numbers this codebase already accepts, with the forbidden 'measurably slower' framing explicitly not used"
  - "The PATH-search result is split carriage-return-tolerantly and ranked: a Windows PATH listing a shim directory ahead of an executable directory now resolves the executable (SC-2)"
  - "D-03's cost recorded beside the cap: the tail head-retention drops is the LOWEST PATH-priority hits, and the partial final line dies on the ranker's extension check — so the shared limit needs no per-site exemption"
  - "getKnownHomeDirs calls getHomeDirCandidates — the D-08 wiring gap 06-04 explicitly left open is closed; the Windows home variables now reach both candidate builders"
  - "A greppable UX-04 / Phase 10 marker at the new Windows spawn site, naming the console-window flash this plan ADDS and does not fix"
affects: [06-06, 06-07, phase-07-launch, phase-09-real-machine, phase-10-ux]

actuals:
  tokens: 2252
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A platform ternary reading TWO named constants rather than one constant and one bare literal — the naming is what makes the asymmetry legible at the call site instead of requiring a jump to the definition"
    - "An unsourced number labelled in the source with (a) that no measurement exists, (b) the existing project values that bound it above and below, and (c) the event that revises it — so a later reader cannot mistake headroom for evidence"
    - "Marking a defect a plan KNOWINGLY introduces with the requirement ID of the phase that owns it, plus the reason it is not a one-line fix, so the owning phase finds every site by grep instead of re-inventorying the file"
    - "Correcting a comment that the SAME plan's earlier task falsified, in the later task's commit, rather than leaving a straw-man quoting a value the code no longer uses"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "The win32 PATH-search timeout is 5000 ms and the comment says plainly it is a headroom estimate, not a measurement. It is bounded below by the POSIX 1000 at the same site, above by the 10 s ceiling the MCP self-test's timeout clamps to (the longest spawn budget this codebase sanctions), and sanity-checked against RESOLUTION_NEGATIVE_TTL_MS (30 s) — beyond which one cold miss would cost more than its own cache lifetime. The 'measurably slower' framing was deliberately NOT used: no latency figure for where.exe under real-time antivirus scanning exists in this repository or any first-party source found."
  - "getWhichCommand's POSIX arm on `platform: undefined` is kept and is NOT the pre-probe POSIX default D-08 rejected. Only one binary can be spawned, so no union answer exists; skipping the search pre-probe would drop resolution for a PATH-only binary on macOS/Linux, which is a CMP-01 regression rather than a Windows-only cost. The distinction is written at the call site, and the child.on(\"error\") handler is named there as the mechanism that makes it safe."
  - "The child.on(\"error\") handler was treated as load-bearing, not incidental cleanup. On Windows the POSIX binary this task replaced cannot be spawned at all, and an ENOENT on a ChildProcess with no error listener THROWS — so the graceful fall-through to the candidate walk exists only because that handler converts the async failure to undefined. It survives the rewrite byte for byte."
  - "The timeout selection was hoisted to a `searchTimeoutMs` const on the line above setTimeout rather than inlined into the setTimeout argument. Inlined, prettier breaks the ternary across the closing `}, ...)` of the callback and the platform asymmetry becomes unreadable; hoisted, the selection is one legible expression immediately at the timeout."
  - "The console-window flash is marked, not fixed. This plan ADDS a Windows spawn on a hot path (resolveCommand runs on every provider status check), so it adds a flash. The marker says the per-spawn suppression is not declared in this runtime's spawn options surface at all — so Phase 10 knows it is real work rather than a flag to flip — and no suppression option was added anywhere."
  - "getKnownHomeDirs' own local globalThis cast was DELETED rather than kept, because readParentEnv() already carries the same cast plus optional chaining plus a try/catch the local never had. The prohibition protects the defensive READ, not that particular local; keeping it would have failed noUnusedLocals anyway."

patterns-established:
  - "Print the awk-extracted range and eyeball it BEFORE reading a gate's number. Applied to all three body-scoped gates in this plan (65 lines for the promise range, 148 for the resolveWithCache range, 10 for getKnownHomeDirs); each was confirmed to reach the intended body rather than terminating on a signature."
  - "Where a gate is comment-filtered because the task's own action mandates a comment containing the forbidden token, ALSO run the unfiltered form and confirm it returns the expected non-zero — that is what proves the mandated comment survived rather than that the filter is hiding an omission."

requirements-completed: [RES-02, RES-03]

coverage:
  - id: D1
    description: "resolveCommand no longer hardcodes the POSIX PATH-search binary: the binary and its argument list come from getWhichCommand({platform: host?.platform, env: readParentEnv()}), whose win32 arm resolves an absolute path under the machine's own system root"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "grep -v '^\\s*//' packages/backend/src/index.ts | grep -Ec 'spawn(\"which\"' returns 0; grep -Eq 'getWhichCommand\\(\\{' succeeds and the symbol is in the ./platform import list"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand > invokes the search binary by absolute path under the machine's own system root (the helper this seam now calls; 06-03)"
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run — 402 passed across 31 files, unchanged from 06-04"
        status: pass
    human_judgment: false
  - id: D2
    description: "The PATH-search stdout is split on a carriage-return-tolerant newline and every resulting line is ranked, so a Windows machine whose PATH lists a shim directory before an executable directory still resolves the executable (SC-2)"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "awk '/resolveWithCache\\(resolutionCache/,/^  \\}\\);/' packages/backend/src/index.ts | grep -Ec 'split\\(/' returns 1 (range printed first: 148 lines, terminating on the correct `  });`)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > ranks the .exe hit ahead of the .cmd hit ahead of the .bat hit on win32"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > keeps the search tool's own emission order as the tie-break within one extension"
        status: pass
    human_judgment: false
  - id: D3
    description: "The rendered form of the bounded output buffer is never read at the PATH-search site: only the retained head is, so the truncation marker can never be handed to an existence check or a spawn as a path (T-06-T18)"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "awk '/const pathResolution = await new Promise/,/^      \\}\\);/' | grep -v '^\\s*//' | grep -c 'renderBoundedBuffer' returns 0, while the UNFILTERED form returns 1 — proving the mandated comment survived rather than the filter hiding an omission"
        status: pass
      - kind: other
        ref: "The exit-code gate survives: same awk range, grep -Ec 'code === 0' returns 1"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > discards the partial final line the bounded output buffer leaves above its cap (the second independent guard)"
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run packages/backend/src/bounded-buffer.test.ts — 21 passed; SPAWN_STDOUT_MAX_CHARS = 1024 * 1024 unchanged and bounded-buffer.ts untouched by this plan"
        status: pass
    human_judgment: false
  - id: D4
    description: "The PATH-search timeout is platform-aware — unchanged on POSIX, longer on win32 — and the win32 number is documented in code as a headroom estimate rather than a measurement"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "grep -Eq 'WIN32_PATH_SEARCH_TIMEOUT_MS = 5000' and 'POSIX_PATH_SEARCH_TIMEOUT_MS = 1000' both succeed; grep -Ec 'headroom estimate' returns 1; grep -Ec 'measurably slower' returns 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "getKnownHomeDirs reads whichever home variables the machine sets, through getHomeDirCandidates, and no longer hardcodes the POSIX home variable — while keeping the defensive global-object read (D-08 wiring, the gap 06-04 recorded as open)"
    requirement: "RES-03"
    verification:
      - kind: other
        ref: "grep -v '^\\s*//' packages/backend/src/index.ts | grep -Ec 'env\\?\\.HOME' returns 0 (returned 1 before this plan); grep -Eq 'getHomeDirCandidates\\(\\{' succeeds and the symbol is in the ./platform import list"
        status: pass
      - kind: other
        ref: "awk '/^function getKnownHomeDirs/,/^\\}/' (range printed: 10 lines, whole body) — 1 match for readParentEnv(), 0 for process.env; signature grep 'function getKnownHomeDirs(): string[]' succeeds; the trailing non-string/blank filter is present"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getHomeDirCandidates (06-03) — the pre-probe union arm this call site now exercises"
        status: pass
    human_judgment: false
  - id: D6
    description: "The new Windows PATH-search spawn site carries a marker naming the deferred console-window suppression, and no suppression option was actually added"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "grep -Ec 'UX-04' packages/backend/src/index.ts returns 2; grep -v '^\\s*//' | grep -Ec 'windowsHide' returns 0"
        status: pass
    human_judgment: false
  - id: D7
    description: "The PATH-search spawn keeps its error handler, so a search binary that cannot be spawned resolves to undefined and resolution falls through to the candidate walk rather than throwing"
    requirement: "RES-02"
    verification:
      - kind: other
        ref: "awk '/const pathResolution = await new Promise/,/^      \\}\\);/' | grep -Ec 'child.on(\"error\"' returns 1 (range printed first: 65 lines, ending on the promise's own closing `      });`)"
        status: pass
    human_judgment: false
  - id: D8
    description: "macOS and Linux resolution is unchanged: the binary is the same, the argument list is the same, the timeout is the same number, and the extracted line is the same string (CMP-01)"
    requirement: "RES-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#rankPathSearchHits > reproduces the single-line extraction it replaces, byte for byte"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts#getWhichCommand — the non-win32 arm returns { command: \"which\", args: cmd => [cmd] }, byte-identical to the replaced literal"
        status: pass
      - kind: other
        ref: "POSIX_PATH_SEARCH_TIMEOUT_MS = 1000 is the extracted literal, asserted unchanged by grep; the win32 branch is taken only on the literal \"win32\""
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run — 402 passed (identical count to 06-04); pnpm -r typecheck and pnpm lint both exit 0"
        status: pass
    human_judgment: false
  - id: D9
    description: "A COLD Windows PATH-search spawn under real-time antivirus completes inside WIN32_PATH_SEARCH_TIMEOUT_MS on a real machine"
    verification: []
    human_judgment: true
    rationale: "Cannot be measured here. No latency figure for the Windows PATH-search tool under real-time antivirus scanning exists in this repository or in any first-party source found, and the maintainer has no Windows machine (PROJECT.md § Constraints). The number is labelled a headroom estimate in the source and closes on the Phase 9/10 real-machine report. Carried forward as the plan's flagged assumption (RES-02, measurement-gap, unresolved)."

duration: 6min
completed: 2026-08-21
status: complete
---

# Phase 06 Plan 05: Wiring the Windows PATH Search into the Resolver Seam Summary

**`resolveCommand` now spawns the platform-chosen search binary with a platform-aware timeout and ranks its multi-line output, and `getKnownHomeDirs` reads whichever home variables the machine actually sets — turning Phase 4's two zero-caller exports and Phase 6's three pure decisions into shipped behaviour, with POSIX byte-identical.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-21T13:47Z (local 13:47)
- **Completed:** 2026-08-21T13:52:50+02:00
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **The hot seam is wired.** `resolveCommand` — reachable from a provider status check at plugin load, on every Settings render, and on every MCP start — no longer spawns a binary that does not exist on Windows. It calls `getWhichCommand({platform: host?.platform, env: readParentEnv()})` and spawns the returned command with the returned argument builder, so on win32 the search runs by an absolute path under the machine's own system root rather than a bare name any writable PATH entry could satisfy (T-06-T22).
- **SC-2's executable-over-shim preference is implemented rather than accidental.** The result is split on `/\r?\n/` (Phase 3 measured CRLF-split output) and every line goes through `rankPathSearchHits`, so a Windows box whose PATH lists a shim directory ahead of an executable directory now resolves the `.exe`. On POSIX the ranker's non-win32 arm returns exactly the first non-empty trimmed line, so the single-answer semantics at this site are what they always were.
- **The D-08 wiring gap 06-04 recorded as open is closed.** `getKnownHomeDirs` no longer hardcodes the POSIX home variable; it spreads `getHomeDirCandidates({platform: host?.platform, env: readParentEnv()})` into the same array position. Pre-probe — which is the *normal* path for a plugin-load provider check, not an edge case — that unions both name sets, so a Windows user's home-derived candidates stop being uniformly empty and 06-04's new `extractHomeDir` arm becomes reachable through the Windows home variables rather than only through the plugin-path and provider-command routes.
- **The phase's single largest unsourced number is labelled as one, in the source.** `WIN32_PATH_SEARCH_TIMEOUT_MS = 5000` carries a comment saying no latency measurement exists for this project, naming the three existing project values that bound it (1000 below, the MCP self-test's 10 s clamp above, `RESOLUTION_NEGATIVE_TTL_MS` at 30 s as the sanity check), stating the mechanism (cold process creation behind a real-time scanner) and the symptom that makes it matter (a silent timeout is indistinguishable from "not installed"), and naming the event that revises it. The forbidden "measurably slower" framing is absent — `grep -Ec` returns 0.
- **The defect this plan knowingly introduces is marked for its owner.** Adding a Windows spawn on a hot path adds a console-window flash. It is marked `UX-04 / Phase 10` at the spawn, with the note that the per-spawn suppression is not declared in this runtime's spawn options surface at all — so the owning phase knows it is real work, not a flag to flip. No suppression option was added: the comment-filtered gate returns 0.
- **Zero POSIX movement, zero test movement.** 402 tests green across 31 files — the identical count 06-04 left — with no test file touched by this plan. `pnpm -r typecheck` and `pnpm lint` both exit 0.

## Task Commits

Each task was committed atomically. All three are `feat` on `packages/backend/src/index.ts`; no test file needed changing because every behaviour this plan wires was already asserted at the pure-helper level by 06-03.

1. **T-06-13: Wire the platform-chosen PATH-search binary and the platform-aware timeout (D-02, D-04)** — `12870df`
2. **T-06-14: Parse the multi-line PATH-search result and rank it (D-01, D-03)** — `12ff3ae`
3. **T-06-15: getKnownHomeDirs reads whichever home variables the machine sets (D-08)** — `83013a3`

## Files Created/Modified

- `packages/backend/src/index.ts` — three symbols added to the `./platform` import list (`getHomeDirCandidates`, `getWhichCommand`, `rankPathSearchHits`); two new module-level timing constants with the win32 provenance comment; `resolveCommand`'s PATH-search block rewritten (platform-chosen spawn, hoisted platform-aware timeout, split-and-rank extraction, extended buffer comment, `UX-04` marker); `getKnownHomeDirs` rewritten to spread the union reader and drop its now-dead local cast. `+128 / -16` lines, one file, no deletions.

## Decisions Made

- **5000 ms for win32, chosen on bounds rather than a guess, and said so in code.** The three anchors are all values this codebase already accepts, so the number is framed rather than invented; the comment states it is a headroom estimate to be revised on the Phase 9/10 real-machine report and that nothing later may cite it as evidence.
- **`getWhichCommand`'s POSIX arm on `platform: undefined` is correct and the reason is written at the call site.** It looks like the pre-probe POSIX default D-08 rejected and is not: only one binary can be spawned so no union answer exists, and skipping the search pre-probe would drop resolution for a PATH-only binary on macOS and Linux — a CMP-01 regression, not a Windows-only cost.
- **`child.on("error")` is documented as load-bearing at the call site, not just preserved.** The comment now names it as the mechanism that turns the POSIX binary's Windows `ENOENT` into a fall-through to the candidate walk instead of a throw, so the next person rewriting this block sees why deleting it converts graceful degradation into a crash on exactly the platform the phase is for.
- **The timeout selection is a hoisted `searchTimeoutMs` const rather than an inline ternary.** Inlined, prettier breaks the ternary across the callback's closing `}, ...)` and the platform asymmetry stops being readable; hoisted one line above `setTimeout`, the selection is still at the timeout and is one legible expression.
- **`getKnownHomeDirs`' local `globalThis` cast was deleted, not kept.** `readParentEnv()` carries the same cast plus optional chaining plus a `try/catch` the local never had, so the defensive READ — the thing the prohibition protects — strengthened rather than weakened. The plan anticipated this explicitly; keeping the local would have failed `noUnusedLocals` regardless.

## Deviations from Plan

Plan executed as written, with one in-scope correction:

**1. [Rule 1 — Bug] Corrected two details inside the PERF-04 straw-man that this plan's own T-06-13 falsified**
- **Found during:** Task 2 (T-06-14), while re-reading the PERF-04 comment the task is instructed to leave intact.
- **Issue:** The comment quotes a tempting-exemption straw-man reading *"it is only `which`, the output is one short path, and the 1-second timeout below caps it"*. After T-06-13 all three details are wrong on Windows: the binary is not `which`, the output is measured at two lines, and the timeout is 5000 there. A comment that states a falsehood about the code directly beneath it is a defect, and it was one my own earlier task introduced.
- **Fix:** Minimal rewording of the quoted parenthetical only — *"it is only a PATH search, the output is a few short paths, and the timeout below caps it"*. The argument the comment exists to make (a timeout bounds the exposure WINDOW, not the VOLUME; granting the exemption in one place while refusing it for `callMcpMethod` turns an inconsistency into a precedent) is verbatim unchanged, as is the `PERF-04 site 7` anchor its gate greps for.
- **Why this does not violate "leave that comment intact":** the instruction protects the anti-exemption ARGUMENT, and the argument is byte-for-byte preserved. What changed is a factual detail about the code that my own commit one task earlier made untrue. This follows 06-04's precedent of correcting stale claims in place rather than leaving them to mislead a later reader.
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `12ff3ae`

No architectural decisions were needed, no packages were installed, no checkpoints were reached, and no authentication gates occurred.

## Issues Encountered

- **The three `awk`-range gates were all shape-checked before their numbers were read**, per the precedent 06-04 set after the same trap bit two waves. Ranges printed and eyeballed: the promise range extracted 65 lines and terminated on the promise's own `      });`; the `resolveWithCache` range extracted 148 lines and terminated on the correct `  });`; the `getKnownHomeDirs` range extracted the whole 10-line body including the trailing filter. None terminated early on a signature, so none of the three gate results was vacuous.
- **Two of this plan's gates are comment-filtered because the tasks' own actions mandate comments containing the forbidden token.** For the `renderBoundedBuffer` gate the unfiltered form was ALSO run and returned `1`, which is the evidence that the mandated comment survived rather than that the filter is masking a deletion. The filtered form returns `0`, the invariant actually wanted. The `launchable` and `env?.HOME` gates were handled the same way.
- **No new tests were written and none were changed.** Every behaviour wired here is asserted at the pure-helper level by 06-03's `platform.test.ts` (the ranker's byte-identical POSIX arm, `getWhichCommand`'s absolute-path and fallback arms, `getHomeDirCandidates`' pre-probe union), and this plan's own frontmatter lists no test artifact. `index.ts` has no test file in this repository — it is the Caido-runtime module — so the wiring itself is covered by the type checker plus the unchanged 402-test suite acting as the CMP-01 regression net. This is a known and accepted coverage shape for `index.ts`, not an omission introduced here.
- **No `git stash`, no `git clean`, no worktree operations, no `--no-verify`.** The concurrent session's `.planning/` edits (`PROJECT.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, and the untracked phase 11–13 directories) were left untouched and appear in no commit here. `git diff --diff-filter=D HEAD~3 HEAD` is empty — nothing was deleted.

## Known Stubs

None. Stub scan across every added line: 0 matches for TODO / FIXME / placeholder / "coming soon" / "not available".

The `UX-04` marker is deliberately NOT a stub — it names a defect this plan knowingly introduces and hands to Phase 10 by requirement ID, with the reason it cannot be fixed inline. `WIN32_PATH_SEARCH_TIMEOUT_MS` is deliberately NOT a stub either — it is a working value labelled as an estimate, tracked as this plan's flagged assumption and as coverage row D9.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was introduced. The three boundaries this plan touches were all in the plan's own `<threat_model>` and each carries its mitigation in shipped code:

- **T-06-T18** (search stdout → resolved path): both independent guards verified present — the exit-code gate (`code === 0`) unchanged in the block, and the ranker's extension-termination filter now on the path. The rendered buffer form is still never read here.
- **T-06-T20** (diagnostics at the search site): no diagnostic was added at all. `readParentEnv()`'s values are consumed and none is passed to any console, log or event function.
- **T-06-T22** (search binary resolved by bare name): closed on win32 — the binary is now an absolute path under the machine's own `SystemRoot`, with the bare-name fallback retained as 06-03's tested arm.

## Nothing here claims a `.cmd` is launchable

Stated explicitly because the wider candidate set this plan feeds makes it easier to assume otherwise. Widening the home variables and ranking `.cmd`/`.bat` hits is a resolution-INPUT change: it decides which path is handed to `fileExists` and then to a spawn. Whether Windows will actually spawn that path is Phase 7 / PRV-02. 06-02 restored `spawnAndWait`'s never-rejects invariant so a `.cmd` Windows refuses degrades to `{code: 1}` — graceful degradation, not launchability. The `getKnownHomeDirs` comment says so in the source.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 4's two zero-caller exports now have production callers**, and so does 06-03's ranker. The "declared but never wired" state that 06-CONTEXT flagged as a verified code fact is gone for all three.
- **ROADMAP SC-2 is satisfied end to end at the resolver:** on Windows a provider CLI resolves to an absolute path with an explicit extension, preferring an executable over a shim, from carriage-return-tolerant multi-line search output.
- **The Windows half of SC-3 reaches the candidate builders:** home-derived candidate rows are no longer uniformly empty on Windows.
- **Open, and deliberately so:** the win32 timeout is an estimate that closes on the Phase 9/10 real-machine report (coverage D9, `human_judgment: true`); the console-window flash is marked for Phase 10 / UX-04; and launchability of a resolved `.cmd` remains Phase 7 / PRV-02.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- `packages/backend/src/index.ts` and `06-05-SUMMARY.md` both present on disk.
- All three task commits present in `git log` (`12870df`, `12ff3ae`, `83013a3`), plus the
  metadata commit `d3f191c`.
- `git diff --name-only HEAD~4 HEAD` touches only `packages/backend/src/index.ts`,
  `06-05-SUMMARY.md` and `.planning/WINDOWS.md`. `STATE.md` and `ROADMAP.md` are untouched and
  unstaged, as are the concurrent session's `.planning/` edits.
- `git diff --diff-filter=D HEAD~4 HEAD` is empty — nothing was deleted.
- Stub scan over all added lines: 0 matches for TODO / FIXME / placeholder / "coming soon".
- Every acceptance criterion in all three tasks was run; all three `awk`-scoped gates had their
  extracted range printed and eyeballed before the result was read.
- `pnpm exec vitest run` 402 passed (31 files); `pnpm -r typecheck` and `pnpm lint` both exit 0.
