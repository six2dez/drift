---
phase: 04-platform-foundation
plan: 03
subsystem: infra
tags: [typescript, vitest, windows, cross-platform, pure-functions, runtime-probe, realpath, max-path, dependency-injection]

# Dependency graph
requires:
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P0-TMP (os.tmpdir() returned the 8.3 short form C:\\Users\\RUNNER~1\\AppData\\Local\\Temp while USERPROFILE returned the long form C:\\Users\\runneradmin — both valid, both on disk, not string-comparable; the whole reason D-04's ladder exists)"
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — runtime-probe.ts imports only `path` and nothing local, not even ./platform. 04-01 and 04-02 supplied the convention (pure core + sibling .test.ts + injected facts), not an API"
provides:
  - "packages/backend/src/runtime-probe.ts — eight exports: PROBE_CAPABILITIES, ProbeCapabilityResult, ProbeReport, RealpathRung, buildProbeReport, formatProbeReportFields, formatProbeFailure, normalizePathForCompare"
  - "PROBE_CAPABILITIES — D-06's gate table encoded as DATA in fixed order, so the gating/reported classification is assertable rather than implied by control flow"
  - "buildProbeReport — the RUN-05 report, including the realpathRungNote hook that lets plan 04-08 claim `not probed` for rung 1 without ever claiming `absent`"
  - "formatProbeFailure — the D-08 version block plus the actionable, ASCII-only message a Windows bug reporter pastes into an issue"
  - "formatProbeReportFields — the flat Record<string, string> shape getDiagnostics already collects (index.ts:2771+)"
  - "normalizePathForCompare — D-04's realpathSync.native -> fs.realpath -> path.resolve ladder with INJECTED rungs; always returns, always names the rung reached"
  - "packages/backend/src/runtime-probe.test.ts — 16 cases resolving 04-VALIDATION.md's RUN-05 and SC-10 selectors for this file"
affects: [04-08, 04-11, phase-6-binary-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (eighth instance of the existing repo pattern)"
    - "A gate table encoded as an exported constant array rather than as branches — the MCP_SELF_TEST_CHECKS shape (mcp-runtime.ts:21-25) applied to a policy decision, not just to render order"
    - "An honesty hook in a report format: realpathRungNote exists so a caller can say `not probed` where it cannot say `absent`"

key-files:
  created:
    - packages/backend/src/runtime-probe.ts
    - packages/backend/src/runtime-probe.test.ts
  modified: []

key-decisions:
  - "runtime-probe.ts imports exactly one thing — `path` — and the pair of greps that proves it (`^import` returns 1, `^import path from \"path\";$` returns 1) IS the D-02 claim in mechanical form. No `os` (D-02 keeps the single read in index.ts so an LLRT gap is a loud MCP-start error, not a module-evaluation throw that kills the plugin), no `fs` (normalizePathForCompare's rungs are injected precisely because that surface is unproven under LLRT), no `./platform` (this module deals in raw strings and booleans, which is what let it build in the same wave)."
  - "D-06's gate table ships as an exported 4-entry `as const` array with the reason for each `gating` value commented at the entry, so the classification can be read back off the returned report in a test instead of inferred from an `if`."
  - "The report distinguishes `not probed` from `absent` by construction. The realpathRungNote hook carries plan 04-08's claim verbatim, and a test asserts the rendered detail contains `not probed` and does NOT contain `absent`."
  - "RUN-05 was NOT marked complete — plans 04-08 and 04-11 carry the same id, index.ts has no probe call site, and nothing yet reads a single one of these exports. Third consecutive plan making the same call, after 04-01 (RUN-03/CMP-02/RUN-05) and 04-02 (RUN-04)."
  - "Everything the message emits is ASCII. A cp1252 Windows console and a pasted GitHub issue body both want it, and one em dash survived the first draft until the manual legibility read caught it."

patterns-established:
  - "A no-secrets gate anchored to the member-access form (`process\\.env[.[]`) rather than to a comment-stripped stream — the V7 rationale a security-conscious module is REQUIRED to carry names the very literal a naive grep counts"
  - "Positive control before negative assertion: the CAIDO_TOKEN tripwire asserts `USERPROFILE=present` renders BEFORE asserting the values do not, so the no-secrets proof cannot pass vacuously"

requirements-completed: []  # Deliberately empty — see Decisions Made. RUN-05 is shared with 04-08 and 04-11; only its pure half landed here.

# Metrics
duration: 9min
completed: 2026-08-14
---

# Phase 4 Plan 03: The RUN-05 Probe Report and the D-04 Ladder Summary

**A single-import, log-free `runtime-probe.ts` that encodes D-06's gate rule as a four-entry data table, renders D-08's version block with `unavailable` for every source that threw, ships D-04's `realpathSync.native → fs.realpath → path.resolve` ladder with injected rungs — and is honest enough to report rung 1 as `not probed` rather than `absent`, because Drift never measured it.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-14T12:26:41Z
- **Completed:** 2026-08-14T12:36:05Z
- **Tasks:** 2 (plus one in-flight legibility fix)
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/runtime-probe.ts` (541 lines) exports the eight symbols the plan locks. `grep -c '^import'` returns **1** and `grep -c '^import path from "path";$'` returns **1** — the exact pair the plan makes load-bearing, which together subsume the deleted narrower `os`/`fs`/`./platform` gates.
- `PROBE_CAPABILITIES` is a 4-entry `as const` array; `os.platform` and `os.tmpdir` carry `gating: true`, `realpath` and `windowsEnv` carry `gating: false`, and D-06's reason for each is commented at the entry rather than in a header.
- `packages/backend/src/runtime-probe.test.ts` (434 lines, 16 cases) resolves all three of this file's `04-VALIDATION.md` selectors: `-t "gating"` → 1, `-t "unavailable"` → 1, `-t "ladder"` → 2. The gating test reads the classification back **off the returned `capabilities` array**, not off the constant, so a report that dropped or reordered the table fails.
- The `not probed` / `absent` distinction is asserted, not just documented: the rung-note test pins `detail` to exactly `${detailWithoutNote}; ${note}`, requires the literal `not probed`, and forbids the word `absent`.
- The T-04-04 tripwire is non-vacuous by construction — it asserts `USERPROFILE=present` and `LOCALAPPDATA=missing` **do** render before asserting that `CAIDO_TOKEN`, a token-shaped fixture, a profile-value fixture and any `C:\` substring do **not**.
- Full suite went 175 → **191 tests, 26 files, 0 failures** (exactly +16, +1 file). `provider-launch.test.ts`'s exact `toEqual([...])` argv arrays did not move (CMP-01 tripwire intact). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write runtime-probe.ts — capability report, D-08 version block, failure message, D-04 ladder** — `657e254` (feat)
2. **Task 2: Write runtime-probe.test.ts — gating classification, "unavailable" fallbacks, ladder fall-through** — `a8aefeb` (test)
3. *(deviation, see below)* **Legibility fix found by the manual verification read** — `b60e481` (fix)

## Files Created/Modified

- `packages/backend/src/runtime-probe.ts` — `PROBE_CAPABILITIES`, `ProbeCapabilityResult`, `ProbeReport`, `RealpathRung`, `buildProbeReport`, `formatProbeReportFields`, `formatProbeFailure`, `normalizePathForCompare`. One import (`path`), no I/O, no module state, no logging. The MAX_PATH arithmetic (`31` + `41` against the 259-usable-character budget), the LLRT realpath absence, and Phase 3's P0-TMP measurement are all cited *at* the code that encodes them.
- `packages/backend/src/runtime-probe.test.ts` — 4 top-level describes / 16 cases. Every fs rung is an injected `vi.fn()` fake.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Exactly one import (D-02) | `grep -c '^import' …/runtime-probe.ts` | `1` |
| And it is byte-for-byte `path` | `grep -c '^import path from "path";$' …` | `1` |
| Eight exports | `grep -nE '^export (const\|function\|async function\|type)' …` | 8 lines, matching the frontmatter list exactly |
| D-06 gate table shape | `grep -cE '^    name: "' …` / `^    gating: true,$` / `^    gating: false,$` | `4` / `2` / `2`, in the order `os.platform`, `os.tmpdir`, `realpath`, `windowsEnv` |
| D-04 do-not-delete comment | `grep -c "D-04" …` | `7`, and the block immediately above `normalizePathForCompare` carries the `DO NOT DELETE IT TO SATISFY --max-warnings 0` line |
| No environment access (T-04-04) | `grep -cE 'process\.env[.[]' …` | `0` |
| No global-object escape hatch (T-04-04) | `grep -c 'globalThis' …` | `0` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/runtime-probe.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/runtime-probe.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run …/runtime-probe.test.ts` | 16 passed / 0 failed |
| RUN-05 | `-t "gating"` **1** · `-t "unavailable"` **1** | passed |
| SC-10 | `-t "ladder"` **2** | passed; the fall-through case asserts `rung === "path.resolve"` and `path === path.resolve(input)` |
| No snapshot method calls | `grep -cE '\.toMatch(Inline)?Snapshot\(' …/runtime-probe.test.ts` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| No focused tests | `grep -cE '(describe\|it)\.only\(' …/runtime-probe.test.ts` | `0` |
| Rendered message is ASCII-only | `LC_ALL=C grep '[^ -~]'` over the rendered example | no match (exit 1) |
| Blast radius | `git diff --name-only HEAD~3 HEAD` | exactly the two new files |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~3 HEAD -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| CMP-01 regression net | `pnpm exec vitest run` | 26 files / **191** tests / 0 failed (was 25 / 175 — exactly +16) |

Note on method, carrying the `[03-03]`/`[03-04]`/`[04-02]` lesson about extraction pipelines: each `-t` run was ANSI-stripped before the `grep`, and the pipeline was validated against an independently-known nonzero expected count (16 total tests, so every run had to report `N passed | 16-N skipped (16)`). A silently-empty extraction would otherwise be indistinguishable from a green result.

### Manual verification (04-VALIDATION.md § Manual-Only Verifications)

The RUN-05 row "the probe failure message is legible and actionable to a real bug reporter" was executed, not deferred: two example failures were rendered from the real exports and read as a Windows user would. The reachable D-07 case (temp dir answers, the real first write fails) renders as:

```
Drift could not start the MCP server: the first write to its temp directory failed.

Write error: EPERM: operation not permitted
Attempts before giving up: 6
Needed for: Drift needs a temp directory to stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.

Missing capability: none - every runtime primitive answered, so the temp directory itself is the problem (a read-only or full volume, a redirected %TMP%, or an anti-virus lock on the file Drift just wrote).

What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue at the Drift repository and paste the block below.

Versions:
  driftVersion: 0.1.0
  processVersion: unavailable
  versionsNode: 0.0.0
  versionsLlrt: 0.6.1-beta
  osPlatform: win32
  osRelease: unavailable

Reported (did not block startup):
  realpath: ok - path canonicalisation reached the path.resolve rung; realpathSync.native: not probed
  windowsEnv: ok - USERPROFILE=present APPDATA=present LOCALAPPDATA=missing

Path budget:
  tempRootLength: 46
  projectedWorstCasePathLength: 118
```

That read is what produced the one deviation below. Note `versionsNode: 0.0.0` — Phase 3's free LLRT-vs-Node discriminator (T-04-13) is legible in the block without needing a Caido version the SDK does not expose.

## Decisions Made

- **`requirements-completed` is deliberately empty.** `RUN-05` appears in this plan's frontmatter but is *also* carried by `04-08` (`requirements: [RUN-03, RUN-04, RUN-05, CMP-02]`) and `04-11`. The requirement text is "fail loud at MCP start with an actionable message when a required runtime capability is missing" — and nothing fails loud at MCP start yet, because `index.ts` has no probe, no `os` import, and no call site for any of these eight exports. Third consecutive Phase 4 plan making this call, matching Phase 3's CI-02 precedent. It stays `Pending` in REQUIREMENTS.md until 04-08/04-11 land.
- **The `realpathRungNote` hook is a report-honesty mechanism, not a formatting convenience.** Plan 04-08's detector cannot probe rung 1 at all: doing so needs a module-scope import of the bare `"fs"` specifier, which is not source-verified for Caido's LLRT and would kill the whole plugin at load if it failed to resolve. So the report carries `not probed` — a strictly weaker claim than `absent` — and a test forbids the word `absent` from appearing in that detail. A document whose whole purpose is to be pasted into a public bug report must never assert a measurement Drift did not make.
- **`ok` for the `realpath` capability is true whenever *any* rung was reached.** The ladder always terminates at `path.resolve`, so the field answers "did canonicalisation produce an answer", and the *rung name* — not the boolean — is what Phase 6 designs against. Under Caido that name will always read `path.resolve` (no `realpath`/`realpathSync` symbol anywhere in `caido/dependency-llrt@main`'s `fs` module), which is the expected answer rather than a failure.
- **The MAX_PATH metrics are two integers, and the arithmetic is commented rather than derived at the call site.** `projectedWorstCasePathLength = tempRootLength + 31 + 41` where `31` is `\drift-mcp-<20 hex>` (plan 04-08's shortened directory component) and `41` is `\copilot-mcp-chat-<13 digits>-<4 chars>.json` (the longest leaf, deliberately unchanged so Phase 2's SEC-02 is not re-pointed at a moving target). The 259-usable-character budget and the fact that long-path opt-in needs both `LongPathsEnabled` *and* a `longPathAware` manifest — neither of which Drift controls, because the process is Caido's — are recorded at the constants.
- **`CAPABILITY_PURPOSE` is a `Record<ProbeCapabilityName, string>` rather than an inline string in the message builder.** A new entry in `PROBE_CAPABILITIES` cannot then silently render a "Missing capability" block with no "what for" clause — the type makes the omission a compile error.
- **Everything emitted is ASCII.** Comments keep the repo's em dashes; emitted strings do not. A cp1252 Windows console and a GitHub issue body both want plain ASCII, and this message exists to survive being pasted.

## Deviations from Plan

Neither task deviated in substance — both files were written as specified and both passed their own `<verify>` commands on the first run, with no lint or typecheck fix needed. One deviation was produced by the plan's own mandated manual verification.

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The no-missing-capability line read as a contradiction under a write failure**

- **Found during:** the `04-VALIDATION.md` § *Manual-Only Verifications* legibility read, after Task 2 was committed
- **Issue:** With `context.firstWriteError` supplied and every gating primitive fine, the message led with *"the first write to its temp directory failed"* and then said *"Missing capability: none — every gating runtime capability reported ok."* Read as a Windows user at 2 a.m., those two lines contradict each other. And under **D-07 this is the COMMON pairing, not an edge case**: the write *is* the `os.tmpdir()` assertion, so a read-only or Defender-locked temp directory answers `os.tmpdir()` perfectly well and still dies at the copy. RUN-05's entire value is that this message is actionable, so an apparent self-contradiction in its most likely rendering is a correctness defect in the requirement, not a wording preference.
- **Fix:** The line now branches on `firstWriteError` and, in that case, names what "none" *means* — "every runtime primitive answered, so the temp directory itself is the problem (a read-only or full volume, a redirected `%TMP%`, or an anti-virus lock on the file Drift just wrote)" — which is also the list of things a reporter should check. The same edit replaced the one em dash still living in an emitted string with an ASCII hyphen.
- **Files modified:** `packages/backend/src/runtime-probe.ts`
- **Verification:** re-rendered both examples; `LC_ALL=C grep '[^ -~]'` over the rendered message returns no match. `pnpm typecheck`, `pnpm lint` and the full 191-test suite all re-run green after the edit.
- **Commit:** `b60e481`

**2. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the third time**

- **Found during:** post-task state updates (not a task)
- **Issue:** The known carry-forward from 04-01 and 04-02, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matched the first one in the file — backlog item **999.1** (the event-driven `sendCliMessage` refactor) — and wrote `**Plans:** 3/11 plans executed` into it. It also re-mangled the Progress table row's trailing cell (`In Progress | - |` → `In Progress|  |`), undoing 04-02's tidy, which had itself undone 04-01's.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 (all eleven 999.x items now read it again — asserted by count, not by eye) and the table row to `| 4. Platform Foundation | 3/11 | In Progress | - |`. Phase 4's real progress is recorded where it belongs: the Progress table row and the `04-03-PLAN.md` checkbox, both of which the helper sets correctly.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `grep -c '^\*\*Plans:\*\* 0 plans$' .planning/ROADMAP.md` → `11`; a full `diff` against the pre-run snapshot now shows exactly the two intended changes (the checkbox and the table row) and nothing else.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. Snapshot `ROADMAP.md` before the call and `diff` after — the count check alone would not have caught the trailing-cell mangling. Ordering also matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**3. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 recorded**

- **Found during:** post-task state updates (not a task)
- **Issue:** Four residues, all confirmed by diffing `STATE.md` against a pre-run snapshot rather than by trusting exit codes. `advance-plan` reset `Status:` to "Ready to execute" mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare `2026-08-14`; `record-metric` appended a 4-column row (`| Phase 04 P03 | 9min | 2 tasks | 2 files |`) *below* the `*Updated after each plan completion*` footer, orphaned from the differently-shaped **By Phase** table.
- **Fix:** Restored `Status: Executing Phase 4` and the descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 3 of 11`) and the **Recent Trend** last-5 list, and deleted the stray table row.
- **Files modified:** `.planning/STATE.md`
- **What did NOT misfire this time:** 04-02's warning was followed — `record-session` was invoked with `--stopped-at` / `--resume-file` and `add-decision` with `--phase` / `--summary`, and the diff confirms all four values landed correctly (`Stopped at` and `Resume file` both point at 04-04, and the three decisions carry the `[Phase 04]` prefix). The positional form 04-02 hit *succeeds silently* while writing garbage, so the named-flag form plus a diff is the durable rule, not the exit code.

**4. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [RUN-05]` and the workflow's default is to check it off. That default was **not** followed, for the reason recorded under Decisions Made. `REQUIREMENTS.md` still reads `- [ ] **RUN-05**` and `| RUN-05 | Phase 4 | Pending |`, verified after the state updates.

Two mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter; both paths are inside `pnpm format`'s glob). Prettier reflowed the `RealpathRung` union, several `expect(...)` calls and the `capabilityNamed` signature. No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5–8 byte-stability fence are unaffected.
- Two tests beyond the plan's enumerated list were added: a one-case `describe("formatProbeReportFields")` covering the eighth export's key shape (`runtimeOsPlatform` / `runtimeOsTmpdir` / `runtimeRealpath` / `runtimeWindowsEnv`, then the version keys unprefixed, then the metrics), and a second assertion inside the rung-detail case for `realpathSync.native`. Neither title collides with a `-t` selector; the three selector counts above are unaffected.

## Issues Encountered

None in the source work. Both tasks passed their own `<verify>` commands on the first attempt.

## Threat Model Disposition

- **T-04-04 (Information Disclosure, `formatProbeFailure` / `buildProbeReport`) — mitigated.** The module cannot reach the environment at all: `grep -cE 'process\.env[.[]'` returns `0` and `grep -c 'globalThis'` returns `0`, which are the only two routes available to a module whose sole import is `path`. Both anchors are the member-access / identifier form, so the V7 security rationale the header is *required* to carry does not fail its own gate. Windows profile variables render as presence booleans **by name** (`USERPROFILE=present APPDATA=present LOCALAPPDATA=missing`), never as values, and the dedicated test asserts the rendered message contains no `CAIDO_TOKEN` literal, no token-shaped fixture, no profile-value fixture and no `C:\` substring — with a positive control first so it cannot pass vacuously. Note that `redactDebugText` (`index.ts:349`) covers the debug log; this is a **different** surface with its own discipline.
- **T-04-12 (Spoofing / Tampering, `normalizePathForCompare`) — mitigated.** The ladder never throws — every rung is inside a `try`/`catch`, including the bottom one, which returns the input unchanged rather than escaping — and it always reports the rung actually reached. A Phase 6 caller therefore cannot silently believe it holds a canonical path when it holds a `path.resolve`. Under Caido it will always be `path.resolve`; surfacing that is the point. Five test cases cover rungs 1, 2, 3, an upper rung throwing, and every rung throwing.
- **T-04-13 (Repudiation, probe report contents) — mitigated.** `formatProbeFailure` renders every key in the supplied version block, with `unavailable` for any source that threw, so a bug report is self-identifying and has no holes. `versionsNode: 0.0.0` is visible in the rendered example — Phase 3's free LLRT-vs-Node discriminator. The block also carries the honest note that the SDK exposes no Caido version (D-08), so this is the closest available substitute rather than an omission.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed; `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across all three commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-08 can consume this immediately.** `buildProbeReport`'s input object is exactly what a `probeRuntime()` in `index.ts` can fill: `rawPlatform` from the guarded `os.platform()` read, `normalizedPlatform` from 04-01's `normalizePlatform`, `tmpdir` from the guarded `os.tmpdir()` read, `tempRoot` from 04-01's `getTempRoot`, `realpathRung` from probing rungs 2–3 only, `realpathRungNote` carrying the rung-1 `not probed` string, `windowsEnvPresent` as a presence map (**build it from named keys — never enumerate**), and `version` from `pluginVersion` (`index.ts:129`, already populated by the existing `detectPluginVersion()` at `:455`) plus the `process` reads. `formatProbeReportFields` output merges straight into `getDiagnostics`'s existing flat record at `index.ts:2771+`.
- **Known non-blocker for the verifier:** `normalizePathForCompare` has **zero production call sites**, and so do the other seven exports. This is expected, not a stub — CONTEXT.md D-04 makes **Phase 6** its first caller and 04-VALIDATION.md § *Lint note* forbids deleting it. It did not in fact trip any lint rule (ESLint's `no-unused-vars` does not flag exported symbols), so no `eslint-disable` was needed; if a future rule change flags it, the fix is a disable comment citing D-04, never a deletion. Third instance of this shape in Phase 4 after `buildSpawnEnv` (04-01) and `withFsRetry` (04-02).
- **The `realpath` rung is the field to read first** when 04-08's probe runs for real. Research predicts `path.resolve` (source-verified: no `realpath` symbol in `caido/dependency-llrt@main`'s `fs` module), and 04-RESEARCH calls it "the highest-value single field in the probe report" for Phase 6's design. If it ever comes back `fs.realpath` under Caido, Phase 6's 8.3-vs-long-form design gets materially easier and the research note should be corrected rather than the ladder changed.
- **Do not merge the `realpathRungNote` into the rung string.** The `not probed` / `absent` distinction only survives because they are separate inputs; collapsing them is exactly the "upgrade a non-measurement into a measurement" failure the test guards.
- `index.ts`, `command-resolution.ts`, `platform.ts` and `fs-retry.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/runtime-probe.ts` — FOUND
- `packages/backend/src/runtime-probe.test.ts` — FOUND
- `.planning/phases/04-platform-foundation/04-03-SUMMARY.md` — FOUND
- Commit `657e254` — FOUND
- Commit `a8aefeb` — FOUND
- Commit `b60e481` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
