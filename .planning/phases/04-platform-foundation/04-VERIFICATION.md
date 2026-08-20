---
phase: 04-platform-foundation
verified: 2026-08-20T10:00:00Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
re_verification: null
warnings:
  - id: W-1
    concern: "RUN-04's re-target to Phase 5 is prose-only — no structural owner"
    detail: >-
      REQUIREMENTS.md:183-198 states RUN-04 "re-targets to Phase 5", but
      ROADMAP.md:139 and REQUIREMENTS.md:138 still assign RUN-04 to Phase 4,
      and Phase 5's requirement lists (ROADMAP.md:189, REQUIREMENTS.md:178)
      omit it. A requirement whose only owner is a narrative paragraph can be
      lost at Phase 5 planning time.
    severity: warning
    human_decision_requested: true
    suggested_fix: >-
      Add RUN-04 to ROADMAP.md:189 and REQUIREMENTS.md:178 (Phase 5
      requirements), and change the traceability row at REQUIREMENTS.md:138
      from "RUN-04 | Phase 4 | Pending" to "RUN-04 | Phase 5 | Pending".
  - id: W-2
    concern: "Stale line anchors in REQUIREMENTS.md's RUN-04 rationale"
    detail: >-
      The note cites index.ts:2300 (withFsRetry call site), :642
      (writeLaunchScript) and :1086 (writeMcpWrapper). Measured on the current
      tree those are :2467, :728 and :1172. Line 642 currently lands inside an
      unrelated object literal (`toolName: event.toolName,`). This is the same
      defect class the phase already corrected once (commit 0b44ee3).
    severity: warning
    human_decision_requested: false
    suggested_fix: "Re-anchor by content before Phase 5 planning reads them."
deferred:
  - truth: "RUN-04's headline clause — the temp-file write→spawn path tolerates the Windows AV race"
    addressed_in: "Phase 5"
    evidence: >-
      The .tmp write → chmod +x → rename → spawn pair lives in writeLaunchScript
      (index.ts:728) and writeMcpWrapper (index.ts:1172), both inside the bash
      wrapper Phase 5 replaces. ROADMAP.md:187 Phase 5 goal: "Replace the POSIX
      shell-wrapper launch indirection with a single direct-node-spawn keystone".
      Verified: withFsRetry has exactly one production call site (index.ts:2467)
      and neither writer is wrapped. Note W-1 — this deferral is not yet recorded
      structurally.
  - truth: "SC-1's Windows install-location data and where.exe CRLF parsing"
    addressed_in: "Phase 6"
    evidence: >-
      D-03 ships shape only. getWhichCommand returns where.exe (platform.ts:171)
      but resolveCommand still spawns literal "which" (index.ts:1324) — correct
      per the Phase 4/6 scope fence.
  - truth: "normalizePathForCompare has a production caller"
    addressed_in: "Phase 6"
    evidence: >-
      D-04 (04-CONTEXT.md) makes Phase 6 its first caller. The export carries a
      do-not-delete note at runtime-probe.ts:473-476 and is unit-tested with
      injected fs rungs.
  - truth: "Native Windows behavioural validation"
    addressed_in: "Phase 9"
    evidence: "ROADMAP.md:253 — Phase 9 requirements CI-01, CI-03 (permanent windows-latest CI job)."
human_verification: []
---

# Phase 4: Platform Foundation — Verification Report

**Phase Goal:** Establish the pure platform-abstraction layer and OS-portable temp/runtime plumbing that every later phase builds on, without changing macOS/Linux behavior.
**Verified:** 2026-08-20
**Status:** passed (2 non-blocking warnings, 1 requiring a human decision)
**Re-verification:** No — initial verification
**Tree graded:** working tree clean at `a2510de`, i.e. *after* all 13 code-review fixes, not the tree the SUMMARYs describe.

## Method

Every number below was re-measured against the tree. No SUMMARY claim, no
VALIDATION Phase Gate Result and no REVIEW-FIX status line was accepted as
evidence. Where a claim and the tree disagreed, the tree is reported (see W-2).

## Goal Achievement

### Observable Truths — ROADMAP Success Criteria SC-1…SC-10

| # | Truth | Status | Evidence (measured) |
|---|-------|--------|---------------------|
| SC-1 | Pure `platform.ts`, platform injected, no I/O, fully unit-tested for temp root / which-where / home dirs / executable names | VERIFIED | `grep '^import' platform.ts` → **zero imports**, so purity is structural, not asserted. 10 exports (9 planned + `isAbsolutePath` from WR-07). `platform.test.ts` has 32 tests across 8 describes: `getTempRoot`, `isAbsolutePath`, `getSweepRoots`, `getWhichCommand`, `getExecutableNames`, `getHomeDirCandidates`, `normalizePlatform`, `buildSpawnEnv` — all four named areas covered. |
| SC-2 | All three `/tmp` sites resolve through `os.tmpdir()`; macOS sweep still finds `/var/folders/…` (CMP-02) | VERIFIED | Comment-stripped scan of `packages/backend/src/**/*.ts` finds **exactly one** production `/tmp` literal: `platform.ts:150`, the deliberate legacy sweep arm. The three sites are `getSessionDebugLogPath` → `getTempRoot(host)` (:773), `sweepOrphanedMcpTempDirs` → `getSweepRoots(hostFacts)` (:2362), `mcpTempDir` → `path.join(getTempRoot(probe.value), …)` (:2448). Each sweep root gets its own try/catch. `platform.test.ts:128` asserts darwin → `["/var/folders/ab/cd/T", "/tmp"]`. |
| SC-3 | `mcp-server.mjs` copied **once** at MCP start; retries `EPERM`/`EBUSY`/`UNKNOWN` with bounded backoff; path scheme shortened for MAX_PATH | VERIFIED | Exactly one `writeFile(mcpScriptLocal, …)` in the file (index.ts:2470); every per-turn site only reads `getTempMcpScriptPath()`. Wrapped in `withFsRetry` (:2467). `FS_TRANSIENT_ERROR_CODES = [EPERM, EBUSY, EACCES, UNKNOWN]`; `FS_RETRY_DELAYS_MS = [50,100,200,400,750]` → 5 rungs, **1500 ms exactly**, 6 attempts. Dir token shortened to `genShortToken()` (20 hex) and the probe reports `tempRootLength` + `projectedWorstCasePathLength` against a 259-char budget. |
| SC-4 | Probe fails loud with an actionable message incl. runtime version when a required primitive is missing | VERIFIED (with recorded substitution) | `probeRuntime()` (:436) gates on the **derived** temp root, not raw `os.tmpdir()` (WR-01). D-05 hard-fail on every OS — no POSIX degrade arm exists. `formatProbeFailure` emits lead / write error / attempts / missing capability + observed + needed-for / remedy / full version block, each field individually guarded to `unavailable`. **Substitution:** the Caido SDK exposes no Caido version; D-08's block is the substitute. Recorded as deviation 3 at 04-VALIDATION.md:492. |
| SC-5 | Activity file read incrementally from a byte offset (PERF-02) | VERIFIED | `readActivityTick` imported (:99) and called per tick (:2974); the cursor is closure-local to `sendCliMessage` (:2953) so it is per-session by construction. No whole-file `readFile` of the activity path remains. `seenActivityIds` (:2944) and the re-entrancy flag both survive. `Buffer.alloc(plan.length)` at activity-tail.ts:246 is exact-length (LLRT `copy_from_slice`); handle opened/closed per tick (:193/:269). WR-05's `flushActivities({ drain: true })` at finalize is present (:3291). |
| SC-6 | Provider + Node resolution cached with short TTL, invalidated on provider-command change (PERF-03) | VERIFIED | One `resolutionCache` (:191). `resolveCommand` read-through at :1317 (`cmd:<command>`); `getCachedNodeExecutable` at :2215 (`node`). `lastNodeExecutable` is gone — only a comment survives at :185. Invalidation via `syncResolutionCacheSignature` in the settings-save path (:1510). Manual Check bypasses (:1650, `bypassCache: true`). `getDiagnostics` rewired to `getCachedNodeExecutable` (:3725) plus `resolutionCache` / `resolutionCacheTtls` fields. TTLs 5 min / 30 s. 14 unit tests incl. invalidation, bypass, key isolation, in-flight de-dup. |
| SC-7 | stdout/stderr + Claude parser buffers bounded with marked truncation (PERF-04) | VERIFIED | Comment-stripped gate on index.ts: `out += \|stderr += ` = **0**, `createBoundedBuffer(` = **6**, `appendBounded(` = **7**, `drainCompleteLines(` = **1**, `^\s*while (newlineIndex` = **0**, `^\s*let newlineIndex` = **0** — all six counts hold simultaneously. Seven sites enumerated by line: :1336/1347 (`resolveCommand.out`), :1760/1881 (`callMcpMethod.stderr`), :1834 (`stdoutBuffer` via drain), :2110/2120 + :2116/2121 (`spawnAndWait`), :3110/3426 + :3116/3522 (`sendCliMessage`). Site B: `CLAUDE_LINE_BUFFER_MAX_CHARS = 4 MiB` (claude-print.ts:32), split-once at :204, `droppedChars` notice at :410. |
| SC-8 | Existing macOS/Linux unit and snapshot tests stay green | VERIFIED | `pnpm vitest run` → **29 files / 263 tests / 0 failures** (baseline at `83c4231`: 23 files, `it()` count **134** — exact match to the claimed baseline). Zero test files deleted. Only pre-existing test file touched is `claude-print.test.ts`, and `git diff 83c4231` shows **265 insertions, 0 deletions** — append-only, the 393-line regression net unmodified. |
| SC-9 | Every `spawn` supplying `env` spreads the parent block; a test asserts it | VERIFIED | `buildSpawnEnv` (platform.ts:262) copies `parentEnv` then overlays `driftVars`; 4 unit assertions incl. `APPDATA`/`LOCALAPPDATA` survival. Cross-check: 4 `spawn(` sites in index.ts (:1324, :1733, :2107, :3082); **none** passes an `env` option — the only `env:` key in the file (:2796) is a Copilot MCP **config-file** dict, not a spawn option. Zero call sites is the correct answer, recorded as deviation 2 at 04-VALIDATION.md:476. |
| SC-10 | Profile-path comparisons normalise both sides with `realpathSync.native` first | VERIFIED | `normalizePathForCompare` (runtime-probe.ts:497) implements the exact ladder `realpathSync.native` → `fs/promises.realpath` → `path.resolve`, every rung guarded, and **returns the rung reached** so a caller can never mistake a `path.resolve` for a canonical path. `runtime-probe.ts` has a single import (`path`) — no `fs`, no `os`, matching the plan's key link. |

**Score: 10/10 truths verified.**

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | RUN-04's write→**spawn** clause | Phase 5 | Both unwrapped writers (`writeLaunchScript` :728, `writeMcpWrapper` :1172) are inside the bash wrapper ROADMAP.md:187 says Phase 5 replaces. See W-1 — not yet recorded structurally. |
| 2 | Windows install-location data, `where.exe` CRLF parsing | Phase 6 | D-03 ships shape only; `resolveCommand` still spawns literal `which` (:1324) per the scope fence. |
| 3 | First caller of `normalizePathForCompare` | Phase 6 | D-04; do-not-delete note at runtime-probe.ts:473. |
| 4 | Native Windows behavioural validation | Phase 9 | ROADMAP.md:253, CI-01/CI-03. |

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `packages/backend/src/platform.ts` | 9+ pure exports, min 90 lines | Yes (12.8 KB) | Yes — 10 exports, zero imports | Yes — imported by index.ts:92-93 | VERIFIED |
| `packages/backend/src/platform.test.ts` | min 120 lines | Yes | 32 tests, 8 describes | `from "./platform"` | VERIFIED |
| `packages/backend/src/fs-retry.ts` | 6 exports, min 55 lines | Yes (14.0 KB) | Yes — ladder + 3-shape classifier | index.ts:98 → :2467 | VERIFIED |
| `packages/backend/src/fs-retry.test.ts` | min 80 lines | Yes | 17 tests incl. `(os error N)` and throwing-`onRetry` | `from "./fs-retry"` | VERIFIED |
| `packages/backend/src/runtime-probe.ts` | 8 exports, min 110 lines | Yes (21.1 KB) | Yes | `buildProbeReport`/`formatProbeFailure`/`formatProbeReportFields` all called in index.ts | VERIFIED |
| `packages/backend/src/runtime-probe.test.ts` | min 110 lines | Yes | 17 tests incl. ladder fall-through | `normalizePathForCompare` exercised with injected rungs | VERIFIED |
| `packages/backend/src/activity-tail.ts` | 8 exports, min 100 lines | Yes (12.3 KB) | Yes | index.ts:99 → :2974 | VERIFIED |
| `packages/backend/src/activity-tail.test.ts` | min 160 lines | Yes | 21 tests, `mkdtemp` fixtures present | sibling import | VERIFIED |
| `packages/backend/src/bounded-buffer.ts` | 15 exports, min 95 lines | Yes (14.6 KB) | Yes | 7 sites in index.ts + claude-print.ts:42 | VERIFIED |
| `packages/backend/src/bounded-buffer.test.ts` | min 120 lines | Yes | 21 tests | sibling import | VERIFIED |
| `packages/backend/src/resolution-cache.ts` | 12 exports, min 90 lines | Yes (12.1 KB) | Yes | index.ts:122-126 → 6 call sites | VERIFIED |
| `packages/backend/src/resolution-cache.test.ts` | min 110 lines | Yes | 14 tests | sibling import | VERIFIED |
| `packages/backend/src/claude-print.ts` | contains `CLAUDE_LINE_BUFFER_MAX_CHARS` | Yes | :32, :216, :410 | already wired pre-phase | VERIFIED |
| `packages/backend/src/index.ts` | `probeRuntime`, `readActivityTick`, `resolveWithCache` | Yes | All three present and called | — | VERIFIED |
| `04-VALIDATION.md` | `nyquist_compliant: true` + 3 deviations | Yes | frontmatter `status: complete`, `nyquist_compliant: true`, `human_read: 2026-08-20` | 3 deviations at :465/:476/:492 | VERIFIED |

No artifact is a stub. No artifact is orphaned.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts` | `os` | single guarded read | WIRED | Comment-stripped counts: `os.` = **4**, `os.platform()` = **2**, `os.tmpdir()` = **1**, `os.release()` = **1** — the gate closes from both directions. Sites: :341, :349 (`readVersionBlock`, two separate try blocks) and :439, :440 (`probeRuntime`). All four inside try/catch; `import os` at :29 is the only one. Downstream reads the module-level `let host` (:259), never `os`. |
| `startMcpServer` | `./fs-retry withFsRetry` | wrapping the real first write | WIRED | :2467 wraps `mkdir(0o700)` + `writeFile` — no separate canary. `tempDir` captured in a `const` before the ladder (WR-03). `written.attempts` → `lastFirstWriteAttempts` → `mcpFirstWriteAttempts` in diagnostics (:3753). |
| `index.ts` | `./platform getTempRoot / getSweepRoots` | temp paths + sweep roots | WIRED | :773, :2362, :2448, :463. |
| `flushActivities` | `./activity-tail readActivityTick` | per-tick offset read | WIRED | :2974; drop tally surfaced via `sdk.console` (:2985) and `activityDroppedBytes` (:3781). |
| stdout/stderr handlers | `./bounded-buffer appendBounded` | bounded accumulation | WIRED | 7 occurrences, 6 handlers + 1 truncation-marker append. |
| `callMcpMethod` stdout | `./bounded-buffer drainCompleteLines` | split-once JSON-RPC drain | WIRED | :1834; the old `while (newlineIndex` / `let newlineIndex` loop is gone (both counts 0). |
| `resolveCommand` | `./resolution-cache resolveWithCache` | read-through cache | WIRED | :1317, key `cmd:<command>`; `node` key separately at :2215. |
| `updateSettings` | `syncResolutionCacheSignature` | invalidation on command change | WIRED | :1510, placed after the merge and ahead of `refreshActiveMcpRuntime`. |
| `checkProviderAvailability` | `bypassCache` | manual Check escape hatch | WIRED | :1650; point-free `ids.map(checkProvider)` rewritten to `ids.map((id) => checkProvider(id))` at :1638 and :2029 as the plan predicted. |
| `getDiagnostics` | `getCachedNodeExecutable` | stops bypassing the cache | WIRED | :3725. |
| `runtime-probe.ts` | `path` | the only import | WIRED | Single `import path from "path"` at :28. |
| `platform.ts` | (nothing) | zero imports | WIRED | Confirmed empty. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data? | Status |
|----------|------|--------|-----------|--------|
| `probeRuntime` → `lastProbeReport` | probe capabilities, metrics, version block | live `os.platform()`/`os.tmpdir()`/`os.release()`/`process.versions`/`path.sep` | Yes — no static fixture; unavailable sources render `"unavailable"` by design | FLOWING |
| `getDiagnostics` runtime probe fields | flattened `lastProbeReport` | `formatProbeReportFields(lastProbeReport)` with a `"not run (MCP not started)"` arm | Yes | FLOWING |
| `getDiagnostics.resolutionCache` | live cache map | `describeResolutionCache(resolutionCache, Date.now())` — key, polarity, age only; **no cached values leaked** | Yes | FLOWING |
| `getDiagnostics.mcpFirstWriteAttempts` | `lastFirstWriteAttempts` | assigned from `written.attempts` at :2480 on every start | Yes | FLOWING |
| `flushActivities` events | `tick.events` | `readActivityTick` reading real bytes from `runtimeFiles.activityFilePath` | Yes | FLOWING |
| `renderBoundedBuffer(stdout)` (chat answer) | `stdout` accumulator | `proc.stdout` chunks, UTF-8-boundary-decoded (WR-06), both-ends retention | Yes | FLOWING |

### Behavioural Spot-Checks

| Behaviour | Command | Result | Status |
|-----------|---------|--------|--------|
| Full suite green | `pnpm vitest run` | 29 files / 263 tests / 0 failures, 847 ms | PASS |
| Backend + frontend typecheck | `pnpm -r typecheck` | shared/backend/frontend all "Done", exit 0 | PASS |
| Lint at zero tolerance | `pnpm lint --max-warnings 0` | no output, exit 0 | PASS |
| Bundle builds with the new `os` import | `pnpm build` | exit 0; `dist/plugin_package/backend/index.js` (151 KB), `drift.zip` produced | PASS |
| `os` survives bundling as an external | `grep 'from "os"' dist/plugin_package/backend/index.js` | 1 match, 13 `tmpdir` references — the risk vitest cannot see is closed | PASS |
| SC-9 assertion actually runs | `vitest -t "buildSpawnEnv"` | 4 passed / 28 skipped | PASS |
| CR-01 numeric classifier actually runs | `vitest -t "os error"` | 2 passed / 15 skipped | PASS |
| CMP-01 tripwire (blob hash, not `--stat`) | `git hash-object` vs `git rev-parse 83c4231:<path>` | `provider-launch.ts` `f2b84b1…`, `provider-launch.test.ts` `8646c7a…`, `command-resolution.ts` `00b754d…`, `command-resolution.test.ts` `d13b60c…` — **all four byte-identical** | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | — | No `scripts/*/tests/probe-*.sh` exists in this repo and no PLAN declares one. `scripts/windows-llrt-probe.mjs` is Phase 3's CI spike, not a Phase 4 gate. Phase 4's gates are static greps plus vitest, and every one was independently re-run above rather than transcribed. | SKIPPED (no probes defined) |

### Code-Review Fix Verification (13 findings, re-checked in the tree)

| ID | Claim | Verified in tree |
|----|-------|------------------|
| CR-01 | Numeric `(os error N)` classification | `TRANSIENT_OS_ERROR_NUMBERS = [1,5,13,16,32,33]`, `osErrorNumber()` regex `\(os error (\d+)\)`, third arm in `isTransientFsError`, `os-error-N` token in `getFsErrorCode`. Without it the ladder was inert on LLRT. **Real.** |
| CR-02 | Throwing `onRetry` no longer cancels the ladder | `onRetry` and `sleep` in **separate** try blocks; the hook's throw is swallowed, the sleep's is terminal. **Real.** |
| WR-01 | Probe gates on derived temp root | :463 `const tempRoot = getTempRoot(candidate)`; `facts = tempRoot === "" ? undefined : candidate`. **Real.** |
| WR-02 | Assert 0o700, not only request it | `enforceOwnerOnlyDir(tempDir)` post-condition, fails closed, skipped on win32, message carries mode but never the path. **Real.** |
| WR-03 | No `mcpTempDir!` in the retry closure | `const tempDir` captured at :2448, closure uses it. **Real.** |
| WR-04 | Cumulative `droppedBytes` survives truncation reset | activity-tail.ts:227-228. **Real.** |
| WR-05 | Drain at finalize | `flushActivities({ drain: true })` at :3291. **Real.** |
| WR-06 | UTF-8-boundary decode | `lastCompleteUtf8Boundary` added to bounded-buffer.ts (keeps zero-import), byte carries `stdoutBytes`/`stderrBytes`, liveness recorded before the early return. **Real.** |
| WR-07 | Platform-aware absolute-path test + path flavour reported | `isAbsolutePath` export + `pathSeparator`/`pathFlavour` in the version block. **Real.** |
| WR-08 | `getNodeExecutable` agrees with the signature | `getCachedNodeExecutable` routes through the shared cache. **Real.** |
| WR-09 | One greppable truncation token | `TRUNCATION_MARKER_PREFIX` exported from bounded-buffer.ts and imported by claude-print.ts:42. **Real.** |
| WR-10 | Truncation marker never returned as a path | :1353 takes the head's first line, never `renderBoundedBuffer`. **Real.** |
| WR-11 | In-flight sharing + stamp after resolve | `inFlight: Map` (:55), `clock` second read. **Real.** |

`04-REVIEW-FIX.md` frontmatter: `findings_in_scope: 13, fixed: 13, skipped: 0, status: all_fixed` — matches the tree and the 13 fix commits `6d5e146`…`b09126a`.

### Locked Decisions D-01…D-08

| Decision | Status | Evidence |
|----------|--------|----------|
| D-01 discrete pure functions, object params, no aggregate descriptor | HONOURED | 10 exports, each taking an `{ … }` input; no `createPlatformProfile` anywhere. |
| D-02 `os` touched in one guarded place, cached in module `let` | HONOURED | 4/2/1/1 counts; `let host` at :259; every downstream site reads the cache. |
| D-03 shape + platform-invariant primitives only | HONOURED | `where.exe`, `[.exe,.cmd,.bat]`, `[USERPROFILE,APPDATA,LOCALAPPDATA]` names shipped; install-location arrays absent by design. |
| D-04 `normalizePathForCompare` impure, outside `platform.ts`, uncalled, undeleted | HONOURED | runtime-probe.ts:497 with do-not-delete note at :473. |
| D-05 hard fail on every OS | HONOURED | Single `err(formatProbeFailure(...))` arm; no `platform === "darwin"` fallback exists. |
| D-06 gate table as data; everything reported | HONOURED | `PROBE_CAPABILITIES` with `gating` flags; results reach both the message and `getDiagnostics`. |
| D-07 probe wraps the real first write; no canary | HONOURED | :2467 wraps the actual `mkdir`+`writeFile`; no canary file in the tree. |
| D-08 best-effort version block, per-field `unavailable` | HONOURED | `readVersionBlock` (:315), each field individually guarded, reuses `pluginVersion`. |

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| RUN-03 | 04-01, 04-08, 04-11 | SATISFIED | SC-2. One production `/tmp` literal remains and it is the deliberate CMP-02 legacy arm. |
| RUN-04 | 04-02, 04-08, 04-11 | **PARTIAL — Pending judgement SOUND** | Shipped half independently confirmed: `withFsRetry` has **exactly one** production call site (`index.ts:2467`, the one-time staging copy), a 6-attempt / 1500 ms ladder, `mcpFirstWriteAttempts` in diagnostics, 17 unit tests. Headline half independently confirmed **absent**: `writeLaunchScript` (:728) and `writeMcpWrapper` (:1172) perform `.tmp` write → `chmod +x` → `rename` → spawn with no retry wrapper, and both are inside the Phase-5-owned bash wrapper that Phase 4's own CMP-01 fence forbids touching. Holding it Pending is the honest call — ticking it would claim coverage of the fenced path. See W-1. |
| RUN-05 | 04-01, 04-03, 04-08, 04-11 | SATISFIED | SC-4 + SC-10. Human read of the rendered failure message approved 2026-08-20 (04-VALIDATION.md:555-557). |
| CMP-02 | 04-01, 04-08, 04-11 | SATISFIED | `getSweepRoots` legacy `/tmp` arm survives (platform.ts:150), is unit-asserted for darwin, and is consumed by the real sweep. This is the upgrade path that keeps 0.1.0's token-bearing dirs reclaimable — the security-relevant half. |
| PERF-02 | 04-04, 04-09, 04-11 | SATISFIED | SC-5. |
| PERF-03 | 04-07, 04-10, 04-11 | SATISFIED | SC-6. |
| PERF-04 | 04-05, 04-06, 04-09, 04-10, 04-11 | SATISFIED | SC-7 — **seven of seven** sites, measured with the broad `out += \|stderr += ` pattern that reaches 0, not the narrow `stdout += ` inventory grep that is blind to two of them. |

**Orphaned requirements: none.** All seven ROADMAP-declared IDs appear in at least one PLAN's `requirements` frontmatter, and no additional ID is mapped to Phase 4 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` across all of `packages/backend/src` | — | **Zero occurrences.** Debt-marker gate passes. |
| — | — | `TODO` / `HACK` | — | Zero occurrences. |
| `resolution-cache.ts` | 198, 218 | `MISSING_COMMAND_PLACEHOLDER` | Info | A named ` unset` sentinel constant for a provider configured without a command, not a stub. Not a defect. |
| `index.ts` | 764-769 | `getSessionDebugLogPath` returns `undefined` when `host` is unset | Info | A narrow POSIX behaviour narrowing: with MCP never started, opt-in debug logging now silently no-ops where 0.1.0 wrote `/tmp/drift-session-*.log`. **Pre-decided, not drift** — locked at 04-CONTEXT.md:221, argued at 04-RESEARCH.md:119, defaulted at 04-DISCUSSION-LOG.md:181, and re-stated in the code comment. Accepted. |

The deliberate zero-call-site exports (`normalizePathForCompare`, `buildSpawnEnv`) were checked and are **not** reported as dead code — both carry rationale in-file and both are unit-tested.

### Human Verification Required

**None.** The single non-machine-assertable criterion — RUN-05 failure-message legibility — already has a recorded human read: `04-VALIDATION.md` frontmatter `human_read: 2026-08-20`, closed at 04-11 task 2, approval block at :555-557. I independently read `formatProbeFailure`'s rendered structure and confirm it is actionable: it leads with what failed, states the write error and attempt count, names the missing capability with observed value and purpose, gives a remedy, and closes with a paste-ready version block containing no token and no environment enumeration.

Native Windows behaviour is not verifiable here and is not a Phase 4 obligation — Phase 9 owns the permanent `windows-latest` job.

### Warnings

**W-1 — RUN-04's re-target to Phase 5 is prose-only. Human decision requested.**

The reasoning for holding RUN-04 Pending is sound and I confirmed it independently against the tree. The *bookkeeping* is not. `REQUIREMENTS.md:183-198` says it "re-targets to Phase 5", but:

- `ROADMAP.md:139` still lists RUN-04 under Phase 4's requirements.
- `REQUIREMENTS.md:138` still reads `| RUN-04 | Phase 4 | Pending |`.
- `ROADMAP.md:189` and `REQUIREMENTS.md:178` list Phase 5 as RUN-01, RUN-02, HLT-01, HLT-02, CMP-01 — **RUN-04 is absent.**

Phase 5 planning reads the structural requirement list, not the narrative paragraph. A requirement owned only by prose is a requirement that can be silently dropped. Suggested fix in frontmatter.

**W-2 — Stale line anchors in REQUIREMENTS.md's RUN-04 note.**

Cited `index.ts:2300` / `:642` / `:1086`; measured `:2467` / `:728` / `:1172`. Line 642 currently lands on `toolName: event.toolName,` inside an unrelated object literal. The substantive claims the anchors support are all true — this is a pointer-accuracy defect, the same class the phase already corrected once in commit `0b44ee3`, and it will mislead the Phase 5 executor who follows them. Re-anchor by content.

### Gaps Summary

No gaps. All ten ROADMAP success criteria are achieved in the tree, verified at four levels (exists, substantive, wired, data flowing) and cross-checked by re-running every gate rather than transcribing it. Six of the seven requirements are satisfied; the seventh (RUN-04) is deliberately and correctly held Pending, with both halves of that judgement independently confirmed against the code.

The phase goal — a pure platform-abstraction layer plus OS-portable temp/runtime plumbing, **without changing macOS/Linux behavior** — is achieved. The no-regression clause is the strongest-evidenced part: `provider-launch.ts`, `provider-launch.test.ts`, `command-resolution.ts` and `command-resolution.test.ts` are byte-identical to `83c4231` by blob hash; `claude-print.test.ts` changed by append only; no test file was deleted; 134 → 263 tests, all green; typecheck, lint and build all exit 0 and the new `os` import survives bundling.

Both findings are documentation-traceability warnings, not implementation defects. Neither blocks Phase 5 execution, but **W-1 should be resolved before Phase 5 is planned**, or RUN-04 will have no owner in any machine-readable artifact.

---

_Verified: 2026-08-20_
_Verifier: Claude (gsd-verifier)_
_Tree: `a2510de`, working tree clean_
