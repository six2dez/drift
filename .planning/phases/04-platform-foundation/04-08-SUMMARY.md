---
phase: 04-platform-foundation
plan: 08
subsystem: infra
tags: [typescript, windows, cross-platform, runtime-probe, os-tmpdir, retry, max-path, diagnostics, llrt]

# Dependency graph
requires:
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P2-OS (the bare \"os\" specifier resolves), P0-TMP (os.tmpdir() returned the 8.3 short form C:\\Users\\RUNNER~1\\AppData\\Local\\Temp), P3-UUID (NO licence to replace the hand-rolled genUUID hex loop)"
  - phase: 04-platform-foundation
    provides: "04-01's platform.ts (normalizePlatform, getTempRoot, getSweepRoots), 04-02's fs-retry.ts (withFsRetry), 04-03's runtime-probe.ts (buildProbeReport, formatProbeFailure, formatProbeReportFields)"
provides:
  - "packages/backend/src/index.ts — the FIRST `import os from \"os\"` in backend source, and the single guarded os read the whole phase is designed around"
  - "probeRuntime() — the only os.platform() / os.tmpdir() call site, caching HostFacts in a module-level `let host`"
  - "The D-08 version block (readVersionBlock), the rung-2/3 presence check (detectRealpathRung), the Windows env presence booleans (readWindowsEnvPresence) and the 20-hex-char genShortToken"
  - "All three hardcoded /tmp sites migrated onto the cached os.tmpdir(): mcpTempDir, sweepOrphanedMcpTempDirs and getSessionDebugLogPath"
  - "The real first write (mkdir 0o700 + writeFile mcp-server.mjs) wrapped by withFsRetry — RUN-04 and RUN-05 as ONE mechanism (D-07)"
  - "13 new getDiagnostics fields: the 4 PROBE_CAPABILITIES, the 6 D-08 version fields, the 2 MAX_PATH metrics, and mcpFirstWriteAttempts"
  - "First-party evidence that Caido's own @caido/quickjs-types declares `os` (platform/tmpdir/release) and declares NO realpath anywhere"
affects: [04-09, 04-10, 04-11, phase-5-launch-path, phase-6-binary-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The single lazily-read, cached OS fact — `let host` populated only inside the RUN-05 probe, never at module scope"
    - "A four-count mutually-constraining grep gate evaluated over a comment-stripped view, so the mandated rationale comments cannot break the gate they explain"
    - "First Phase 4 plan whose wiring ships live production behaviour in index.ts (04-06 did the same for claude-print.ts)"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "Tasks 1 and 2 shipped as ONE commit. They are not separately compilable: probeRuntime/genShortToken/host have no reader until task 2 adds their call sites, and tsconfig's noUnusedLocals (TS6133) plus eslint --max-warnings 0 fail task 1's own <verify> without them. Verified empirically, not assumed."
  - "genUUID's declaration is preserved byte-for-byte per P3-UUID, but task 2 removed its LAST call site, so a bookkeeping `export { genUUID };` keeps noUnusedLocals from forcing the deletion the plan forbids. It is not an API — nothing imports index.ts."
  - "detectRealpathRung reads `realpath` through an unknown-shaped view because Caido's own fs/promises type surface does not declare it at all. The plan's literal `typeof fsPromisesNs.realpath === \"function\"` is a TS2339 compile error against @caido/quickjs-types — which is itself the strongest available confirmation that rung 2 is absent."
  - "REALPATH_NATIVE_PROBE_NOTE is rendered ASCII-only (em dash -> hyphen, section sign -> the word 'section'), per 04-03's recorded discipline that everything EMITTED is ASCII. Verified: the rendered failure message contains zero non-ASCII characters."
  - "RUN-03/RUN-04/RUN-05/CMP-02 were NOT marked complete — but for a DIFFERENT reason than 04-01..04-07. The behaviour is now live; what is missing is (a) RUN-04's write->SPAWN half, fenced to Phase 5, and (b) any execution on Windows. 04-11 owns the sign-off."

patterns-established:
  - "When a plan's task split is not separately compilable under noUnusedLocals, merge the commits and record the TS6133 evidence rather than committing a tree that does not typecheck"
  - "Caido's shipped @caido/quickjs-types is a FIRST-PARTY capability oracle for the LLRT surface — stronger than source analysis of caido/dependency-llrt@main, and it is already in the typecheck program"

requirements-completed: []  # Deliberately empty — see Decisions Made. RUN-04 is partial (Phase 5 owns the write->spawn half) and nothing has executed on Windows; 04-11 carries the sign-off.

# Metrics
duration: 25min
completed: 2026-08-14
---

# Phase 4 Plan 08: Wiring the Runtime Probe and Killing the Last `/tmp` Summary

**The `os` module is now read in exactly one place in the whole backend — inside `probeRuntime()`, behind a `try`/`catch`, cached in a module-level `let host` — and every downstream site (the temp dir, the orphan sweep, the debug log) reads that cache; the probe wraps the real first write rather than a canary, so RUN-04's retry ladder and RUN-05's actionable failure message are one mechanism; and the whole thing is gated by four mutually-constraining counts over a comment-stripped view of the file that close from both directions.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-14T15:44:00Z (approx)
- **Completed:** 2026-08-14T16:09:00Z
- **Tasks:** 3 (in 2 commits — see Deviations)
- **Files modified:** 1 (`packages/backend/src/index.ts`, +450 / -20)

## Vehicle caveat (carried from Phase 3, required in this summary)

**The Windows *platform* was measured on a real `windows-latest` host; the Caido *runtime* is inferred.** Every Phase 3 result this plan builds on — P2-OS, P0-TMP, P3-UUID — was measured on a **Node** vehicle, not under Caido's LLRT. The canonical citation is
`.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md`, **never** the CI artifacts, which expire 2026-09-12.

That residual gap is precisely why **D-02** reads `os` lazily inside the probe rather than at module scope, and why **D-05** makes the failure loud on every OS instead of quietly degrading POSIX to `/tmp`. This plan narrows the gap but does not close it — see *A first-party capability oracle* below.

## Accomplishments

- **The D-02 single-read gate holds, exactly.** Over the comment-stripped view (`sed -e 's://.*::'`): `os.` total **4**, `os.platform()` **2**, `os.tmpdir()` **1**, `os.release()` **1**. Every one of those call sites is lexically inside a `try` block, and none is at module scope. The two `os` reads in `readVersionBlock` were deliberately written as their own `try` blocks rather than routed through the `guarded()` callback, so "every `os` call sits inside a `try`" is checkable by *reading the function* instead of by following a callback into a helper.
- **All three hardcoded `/tmp` sites are gone.** `grep -c '"/tmp"'` and `grep -c '` + "`" + `/tmp/'` both return `0` in `index.ts`; the only surviving `/tmp` literal in the backend is `platform.ts`'s deliberate legacy sweep arm. `mcpTempDir` is built with `path.join(getTempRoot(probe.value), …)` — never template concatenation, so LLRT's trailing-separator `os.tmpdir()` cannot produce `C:\…\Temp\/drift-mcp-x`.
- **Ordering is correct and mechanically proven.** `const probe = probeRuntime();` (:2057) → `await sweepOrphanedMcpTempDirs(sdk, probe.value);` (:2080) → `mcpTempDir = path.join…` (:2093). Strictly ascending, with each pattern anchored to a form the declaration cannot match.
- **D-07 shipped as designed:** the pre-existing `mkdir(mcpTempDir, { recursive: true, mode: 0o700 })` + `writeFile(mcpScriptLocal, …)` pair is now the *body* of a `withFsRetry` callback, with `onRetry` routed into `sdk.console.error` carrying only the attempt index, the error code and the delay (T-04-03's type-enforced ceiling). No canary file. Both `mode:` options stay unconditional.
- **The RUN-05 failure message was rendered and read end-to-end**, not just typechecked. Both the D-07 case (every primitive answers, the write dies) and the D-05 case (`os` absent entirely) produce legible, actionable text, and `projectedWorstCasePathLength` comes out at **108** for Phase 3's real measured 8.3 short-form tmpdir — matching the "~108" figure the plan's MAX_PATH arithmetic predicts.
- **13 new `getDiagnostics` fields**, verified by executing `formatProbeReportFields` against a real report: `runtimeOsPlatform`, `runtimeOsTmpdir`, `runtimeRealpath`, `runtimeWindowsEnv`, `driftVersion`, `processVersion`, `versionsNode`, `versionsLlrt`, `osPlatform`, `osRelease`, `tempRootLength`, `projectedWorstCasePathLength`, plus `mcpFirstWriteAttempts`.
- **Zero POSIX regressions.** Suite unchanged at **29 files / 245 tests / 0 failures**. `provider-launch.ts` and `provider-launch.test.ts` are byte-identical (CMP-01 tripwire intact), `command-resolution.ts` untouched (D-03), and every Phase 5 scope-fence function — `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call site — is absent from the diff entirely. **Zero packages installed** (T-04-SC).

## A first-party capability oracle nobody had looked at

While resolving a compile error I found that this repo already has, *in its typecheck program*, a first-party description of Caido's runtime surface: **`@caido/quickjs-types@0.25.4`**, pulled in transitively by `@caido/sdk-backend`. It supplies the ambient `declare module` blocks for `fs`, `fs/promises`, `path`, `buffer`, `child_process`, `process`, `os`, … — which is why `tsc --traceResolution` reports `Module name 'fs/promises' was not resolved` and yet the file compiles.

Four findings that bear directly on this phase and the next four:

| Finding | Where | Consequence |
|---|---|---|
| `declare module "os"` exports `platform()`, `tmpdir()`, `release()`, `homedir()`, `type()`, `version()`, `arch()`, `EOL` | `src/extra/os.d.ts` | **First-party type evidence for the phase's single hard dependency.** 04-RESEARCH had only source analysis of `caido/dependency-llrt@main` plus a Node-vehicle P2-OS. This is Caido's own published surface. It does not close the runtime gap (types are declarations, not measurements) but it is materially stronger than what the phase planned against. |
| `type QuickJS.Platform = "darwin" \| "linux" \| "win32"` and `os.platform(): QuickJS.Platform` | `src/extra/globals.d.ts` | **Exactly** 04-01's narrow `Platform` union. D-01's rejection of `NodeJS.Platform` is corroborated by Caido's own typing. Note the type is *optimistic*: LLRT's third arm can still yield `freebsd`/`android` at runtime, which is why `normalizePlatform` still gates. |
| `realpath` appears **nowhere** in the entire package — not in `fs`, not in `fs/promises` | `grep -rn realpath` returns nothing | Corroborates D-04's ladder landing on `path.resolve` under Caido, and is what made the plan's literal `typeof fsPromisesNs.realpath === "function"` a **TS2339 compile error**. |
| The `process` module declares only a `Signals` union — **no `process` global at all** | `src/llrt/process.d.ts` | The mandated `globalThis as typeof globalThis & { process?: … }` guard is a hard requirement here, not defensive padding. A bare `process.version` would not even compile. |

`declare module "fs"` **does** exist in that package. It still must **not** be imported: a type declaration is not a runtime resolution guarantee, a static ESM import cannot be wrapped in `try`/`catch`, and the emitted bundle keeps `import os from "os";` as an external specifier (verified in `dist/plugin_package/backend/index.js:6`) — so an unresolvable specifier would still kill the plugin at load. Recorded for Phase 5/6 to weigh, not acted on.

## Task Commits

Tasks 1 and 2 shipped in one commit because they are not separately compilable — see Deviations.

1. **Task 1 + Task 2: the runtime-probe section, the `startMcpServer` reorder, the retry-wrapped first write, and all three `/tmp` migrations** — `d3d0b46` (feat)
2. **Task 3: surface the probe report, version block and retry count in `getDiagnostics` and the MCP status message** — `e6cf855` (feat)

**Plan metadata:** `9fed710` (docs: the summary), followed by the `docs(04-08): update STATE.md and ROADMAP.md …` commit immediately after it. That commit's hash is deliberately **not** quoted here: it is the commit that carries this file, so any edit naming it invalidates the name.

## Files Created/Modified

- `packages/backend/src/index.ts` — new `// ── Runtime probe ──` section (`HostFacts`, `VERSION_UNAVAILABLE`, `host`, `lastProbeReport`, `lastFirstWriteAttempts`, `REALPATH_NATIVE_PROBE_NOTE`, `readVersionBlock`, `detectRealpathRung`, `readWindowsEnvPresence`, `probeRuntime`, `describeProbeSummary`, `genShortToken`); rewritten `getSessionDebugLogPath` and `sweepOrphanedMcpTempDirs`; reordered `startMcpServer` prologue; extended `getDiagnostics`; three new local imports plus `os` and the `fs/promises` namespace import.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| First `os` import in backend source | `grep -c '^import os from "os";' …/index.ts` | `1` |
| No bare `fs` specifier | `grep -c '^import.*from "fs"'` / `… "node:fs"` | `0` / `0` |
| The guarded namespace source | `grep -c '^import \* as fsPromisesNs from "fs/promises";'` | `1` |
| `fs/promises` occurrences (pre-existing named + new namespace) | `grep -c 'from "fs/promises"'` | `2` |
| **D-02 total** | `sed -e 's://.*::' … \| grep -o 'os\.' \| wc -l` | **`4`** |
| **D-02 `os.platform()`** | `… \| grep -o 'os\.platform()' \| wc -l` | **`2`** |
| **D-02 `os.tmpdir()`** | `… \| grep -o 'os\.tmpdir()' \| wc -l` | **`1`** |
| **D-02 `os.release()`** | `… \| grep -o 'os\.release()' \| wc -l` | **`1`** |
| Rung 1 never returned | `grep -c 'return "realpathSync.native"'` | `0` |
| Rung 1 reported as `not probed` | `grep -c "not probed"` | `3` |
| …and never as absent | `grep -c 'realpathSync.native is absent\|realpathSync.native: absent'` | `0` |
| No `crypto.randomUUID` (code-only view) | `sed -e 's://.*::' … \| grep -c "crypto\.randomUUID"` | `0` |
| `genUUID` declaration preserved | `git diff HEAD~2 … \| grep -c '^-.*function genUUID'` | `0` |
| **RUN-03 static** | `grep -n '"/tmp"' …/index.ts` | no match |
| No `/tmp` template literal | `grep -c '` + "`" + `/tmp/'` | `0` |
| Old call site gone | `grep -c 'drift-mcp-\${genUUID'` | `0` |
| No template-literal temp dir | `grep -c 'mcpTempDir = ` + "`" + `'` | `0` |
| D-07 ladder wired | `grep -c "withFsRetry"` | `2` (import + call) |
| Modes unchanged | `grep -c "mode: 0o700"` / `"mode: 0o600"` | `5` / `1` |
| **RUN-05 static (ordering)** | `grep -n 'const probe = probeRuntime();\|await sweepOrphanedMcpTempDirs(\|mcpTempDir = path.join'` | `2057` → `2080` → `2093`, **strictly ascending** |
| Single probe emission | `grep -c "\[drift\] runtime probe"` | `1` |
| No env enumeration (code-only view) | `sed -e 's://.*::' … \| grep -cE 'Object\.(keys\|entries\|values)\(process\.env\)\|for \(const .* in process\.env'` | `0` |
| Env vars read by name only, inside one function | `grep -n 'env?.USERPROFILE\|env?.APPDATA\|env?.LOCALAPPDATA'` | lines 367-369, all inside `readWindowsEnvPresence` (:356), return type `Record<string, boolean>` |
| `USERPROFILE` never in a string field | `grep -n "USERPROFILE"` | 2 lines, both presence-check contexts |
| Probe-not-run fallback | `grep -c 'runtimeProbe: "not run (MCP not started)"'` | `1` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (file) | `pnpm exec eslint …/index.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Full suite | `pnpm exec vitest run` | **29 files / 245 tests / 0 failed** (unchanged from 04-07) |
| Bundle resolves `os` | `pnpm build` → `grep -n 'from "os"' dist/plugin_package/backend/index.js` | exit 0; `6:import os from "os";` (kept external, as expected) |
| D-03 fence | `git diff --stat HEAD~2 -- …/command-resolution.ts` | empty |
| Phase 5 fence | `git diff -U0 … \| grep -E '^[-+].*(renderExportExecScript\|writeMcpWrapper\|writeLaunchScript\|shellQuote\|chmod)'` | no match |
| CMP-01 tripwire | `git diff --stat HEAD~2 -- …/provider-launch.ts …/provider-launch.test.ts` | empty |
| Blast radius | `git diff --name-only HEAD~2` | exactly `packages/backend/src/index.ts` |
| No deletions | `git diff --diff-filter=D --name-only HEAD~2` | empty |
| T-04-SC | `git diff --stat HEAD~2 -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| **NUL byte scan** (04-07 carry-forward) | byte-level `node` read of `index.ts` | `0` NULs in 133,459 bytes; `git diff --numstat` reports `450 20`, i.e. git sees text, so every `grep` gate above is meaningful |

### Executed verification (not just static)

The pure modules were driven end-to-end with `node --experimental-strip-types` against a Phase-3-realistic input (`tmpdir = "C:\Users\RUNNER~1\AppData\Local\Temp\"`, the measured 8.3 short form *with* the LLRT trailing backslash):

- `formatProbeReportFields` produced exactly the **12** keys the plan's task-3 criterion requires (4 capabilities + 6 version + 2 metrics).
- `getTempRoot` stripped the trailing backslash and `path.join` produced a single separator — the Pitfall-1 failure mode does not occur.
- `tempRootLength: 36`, `projectedWorstCasePathLength: 108`. The directory component measures exactly **31** characters (`\drift-mcp-` + 20 hex), matching `MAX_PATH_DIR_COMPONENT_CHARS` in `runtime-probe.ts`.
- `genShortToken()` output matches `/^[0-9a-f]{20}$/`.
- The rendered failure message contains **zero** non-ASCII characters (`LC_ALL=C`-equivalent codepoint scan).

The D-07 rendering, read as a Windows user at 2 a.m. would:

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
  realpath: ok - path canonicalisation reached the path.resolve rung; realpathSync.native: not probed - Drift does not import the bare "fs" specifier at module scope (D-02); 04-RESEARCH.md section Environment Availability records it as absent from caido/dependency-llrt@main
  windowsEnv: ok - USERPROFILE=present APPDATA=present LOCALAPPDATA=missing

Path budget:
  tempRootLength: 36
  projectedWorstCasePathLength: 108
```

## Decisions Made

- **`requirements-completed` is deliberately empty — and this time for a different reason than 04-01 through 04-07.** Those seven deferred because their exports had zero production call sites. This plan's wiring is **live**. What is still missing:
  1. **RUN-04 is genuinely partial.** The requirement is that the temp-file write→**spawn** path tolerates the AV race. This plan wraps the *first write*; the `.tmp` → `chmod` → `rename` pair in `writeLaunchScript`/`writeMcpWrapper` — which 04-RESEARCH calls "the single best-documented case" — is fenced to **Phase 5** by 04-CONTEXT.md's scope boundary and must not be touched here.
  2. **Nothing has executed on Windows.** `index.ts` has zero direct test coverage (04-04 recorded this), so the integration is proven by static gates, `typecheck`, `build` and the existing suite — not by behaviour on the target platform.
  3. **04-11 is the phase verification plan and carries the same four IDs.** Marking them complete before it runs would put "complete" in the traceability record ahead of the phase's own verification, which is the error Phase 3 caught and reverted for CI-02.

  **Recommendation to 04-11, stated explicitly so this is not a stalemate:** RUN-03, RUN-05 and CMP-02 are **code-complete** and their static gates pass *now* — the evidence table above is the proof. RUN-04 should stay `Pending` until Phase 5 wraps the launch-script writes. `REQUIREMENTS.md` still reads `- [ ] **RUN-03/RUN-04/RUN-05/CMP-02**`, verified after the state updates.
- **Tasks 1 and 2 are one commit, and the reason is mechanical, not stylistic.** `tsconfig.json` sets `noUnusedLocals: true`, so a task-1-only tree fails its own `<verify>` with TS6133 on `probeRuntime`, `host`, `genShortToken` and `lastFirstWriteAttempts` — all four have no reader until task 2 adds their call sites. Confirmed by an isolated `tsc` experiment (write-only `let`, never-called module function, unread `let` — all three reported) rather than assumed. `@typescript-eslint/no-unused-vars` would have failed the same tree independently. The alternative — committing a tree that does not compile — was rejected.
- **`export { genUUID };` is a bookkeeping statement, not an API.** The plan requires the hex loop preserved byte-for-byte (P3-UUID gives *no* licence to swap in `crypto.randomUUID`) while task 2 removes its last call site. `noUnusedLocals` does not flag exported declarations, and a separate `export { … }` statement leaves the declaration line untouched — so `git diff | grep -c '^-.*function genUUID'` still returns `0`, which the plan makes the gate. Rejected alternatives: adding `export` to the declaration line (fails that gate), `void genUUID;` (a hack that reads as an accident), and deriving `genShortToken` from `genUUID` (would drop nominal entropy from 80 bits to ~74, because a v4 UUID's version and variant nibbles are structurally fixed — T-04-01's register entry states 80).
- **`detectRealpathRung` reads through an unknown-shaped view, and that is a finding rather than a workaround.** `typeof fsPromisesNs.realpath === "function"` does not compile: Caido's own `fs/promises` declaration has no `realpath` member. The cast makes the check a genuine *runtime* presence probe rather than a call into something the compiler already believes exists — and the compile error is itself the strongest confirmation available that rung 2 is absent under Caido.
- **The rung note is ASCII-only.** 04-03 recorded "everything emitted is ASCII" as a decision and removed an em dash from an emitted string for exactly this reason: a cp1252 Windows console and a pasted GitHub issue body both want plain ASCII. The plan's literal string carried an em dash and a section sign; both were replaced (`-`, `section`). Content is otherwise verbatim, and the rendered message now scans clean.
- **The note keeps the word "absent" — flagged here deliberately for the verifier.** 04-03's test asserts `expect(detail).not.toContain("absent")` against *its own fixture*, and the recorded principle is that the report must not assert a measurement Drift did not make. This note leads with `not probed` and then **attributes** the absence claim to 04-RESEARCH.md's source analysis rather than to the probe — which is the honest formulation, and is the wording the plan mandates. Both of the plan's absence gates (`realpathSync.native is absent` / `realpathSync.native: absent`) return `0`. If a verifier prefers the word gone entirely, "records it as not present in" is a drop-in replacement with identical meaning and no gate impact.
- **`describeProbeSummary` re-reads `detectRealpathRung()` rather than threading the rung through the report.** It is a pure `typeof` presence check with no I/O, so a second read is free and cannot diverge; the alternative was a fourth module-level `let` the plan did not specify.
- **The one-line console summary carries status words, a rung name and two integers — no paths, no version strings, no environment values.** Those belong in the failure message and in `getDiagnostics`, which is user-triggered. `sdk.console` output can end up in shared logs, so it gets the stricter budget.
- **`mcpFirstWriteAttempts` starts at `0` and stays `0` until MCP is started**, which reads correctly in a support bundle: `0` means "the write never ran", `1` means "first try succeeded", `>1` means the ladder was exercised.

## Deviations from Plan

The plan's *code* was executed literally: every mandated symbol, every mandated rationale comment, the exact `probeRuntime` structure, the unconditional `mode:` options, the `path.join` rule, the per-root `try`/`catch`, and the mandated `[drift] runtime probe` prefix. Every acceptance criterion in all three tasks passes. Four deviations, all Rule 2/3 auto-fixes, plus the bookkeeping misfires.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's task split is not separately compilable under `noUnusedLocals`**

- **Found during:** Task 1, at the task's own `<verify>` (`pnpm typecheck`).
- **Issue:** Task 1 declares `probeRuntime`, `host`, `genShortToken` and `lastFirstWriteAttempts`; all four of their readers arrive in tasks 2 and 3. `tsconfig.json` sets `noUnusedLocals: true`, so the task-1 tree reports TS6133 four times and `pnpm typecheck` exits 2. `@typescript-eslint/no-unused-vars` fails the same tree independently at `--max-warnings 0`. Task 1's `<done>` ("with no behaviour change yet") and its `<verify>` (exit 0) are in direct contradiction. This was **verified**, not inferred: an isolated `tsc --noUnusedLocals` run over a write-only `let`, an unread `let` and a never-called module function reported all three.
- **Fix:** Tasks 1 and 2 committed together as `d3d0b46`. One additional line of task 3 — `mcpFirstWriteAttempts: String(lastFirstWriteAttempts)` in `getDiagnostics` — was pulled into the same commit for the same reason (task 2 *writes* that variable; nothing *reads* it until task 3). Task 3's substantive content is a separate commit. Both trees typecheck, lint and test green; neither is broken history.
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `d3d0b46`

**2. [Rule 3 - Blocking] Task 2 orphaned `genUUID`, whose declaration the plan forbids deleting**

- **Found during:** Task 2, same `pnpm typecheck` run — `src/index.ts(1124,10): error TS6133: 'genUUID' is declared but its value is never read.`
- **Issue:** `` `/tmp/drift-mcp-${genUUID()}` `` was `genUUID`'s **only** call site in the entire file (confirmed by grep). Task 2 legitimately deletes it; task 1's acceptance criterion forbids removing the declaration (`git diff | grep -c '^-.*function genUUID'` must return `0`), because P3-UUID gives no licence to replace the hex loop. The plan anticipated the call-site removal but not that it would strand the function.
- **Fix:** Added `export { genUUID };` immediately below the declaration, with a comment stating it is bookkeeping, why the hex loop is preserved, and to delete the export the moment a caller reappears. The declaration line is byte-identical, so the gate still returns `0`. `pnpm build` confirms the extra export does not disturb the plugin bundle.
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `d3d0b46`

**3. [Rule 3 - Blocking] `typeof fsPromisesNs.realpath === "function"` does not compile**

- **Found during:** Task 1, in an isolated `tsc -p packages/backend/tsconfig.json` probe before writing the section — `error TS2339: Property 'realpath' does not exist on type 'typeof import("fs/promises")'`.
- **Issue:** `fs/promises` in this program resolves to `@caido/quickjs-types`'s ambient declaration, not to `@types/node` (`packages/backend/tsconfig.json` sets `types: ["@caido/sdk-backend"]`, and `tsc --traceResolution` reports the specifier as unresolved-but-ambient). That declaration has no `realpath`.
- **Fix:** Read the member through `(fsPromisesNs as unknown as { realpath?: unknown }).realpath`, keeping the `typeof … === "function"` presence test and the surrounding `try`/`catch` exactly as specified. Commented at the site. The namespace import and its "tolerates a missing member as `undefined`" rationale are unchanged — this makes the check a *genuine* runtime probe rather than a call the compiler has already blessed.
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `d3d0b46`

**4. [Rule 2 - Missing critical functionality] The mandated rung note contained two non-ASCII characters**

- **Found during:** Task 1, while writing `REALPATH_NATIVE_PROBE_NOTE`.
- **Issue:** The plan's literal string carries an em dash (`—`) and a section sign (`§`). That string is **emitted** — it reaches `describeRealpathCapability`'s `detail`, which lands in the MCP status panel, in `sdk.console`, in `getDiagnostics` and in a pasted GitHub issue body. 04-03 recorded "everything emitted is ASCII" as a decision and shipped a fix (`b60e481`) removing an em dash from an emitted string for exactly this reason; a cp1252 Windows console is the failure surface, and this message exists to survive being pasted.
- **Fix:** `—` → `-`, `§ Environment Availability` → `section Environment Availability`. Content otherwise verbatim. Verified by rendering the full failure message and scanning codepoints: zero characters outside printable ASCII.
- **Files modified:** `packages/backend/src/index.ts`
- **Commit:** `d3d0b46`

### Additions beyond the plan's enumerated list

- `describeProbeSummary(report)` — the plan mandates the `[drift] runtime probe` line's prefix and content but not the mechanism. It is a small pure formatter in the same section, so the console line is one expression rather than four inline `.filter`/`.map` chains in `startMcpServer`.
- `VERSION_UNAVAILABLE` — a local `"unavailable"` constant mirroring `runtime-probe.ts`'s private `UNAVAILABLE`, so the D-08 sentinel is not a repeated string literal.

### Mechanical notes that are *not* deviations

- **`prettier --write` was deliberately NOT run on `index.ts`.** It is inside `pnpm format`'s glob but is part of backlog 999.11's pre-existing debt, and `--write` would reformat pre-existing lines — including the Phase 5 scope-fence functions this plan must leave byte-stable. New code was hand-written in Prettier-compatible shape instead. Same call 04-06 made for the same reason; the inverse of 04-01/04-02/04-03/04-05/04-07, which only *created* files.
- Zero packages installed, as T-04-SC requires. `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across both commits.
- `dist/` is gitignored, so the two `pnpm build` runs left the working tree clean.

### Bookkeeping deviations

See *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-07 all recorded, reproduced for the eighth time.

## Issues Encountered

Three blocking compile issues in the source work, all recorded above as Rule 3 auto-fixes and all resolved without weakening a single gate. The bookkeeping tools misfired as usual.

**1. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the eighth time**

- **Found during:** post-summary state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-07, reproduced exactly. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — **`ROADMAP.md:329`, backlog item 999.1** (the event-driven `sendCliMessage` refactor) — and wrote Phase 4's count into it. It also re-mangled the Progress table row's trailing cells.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 and the table row to `| 4. Platform Foundation | 8/11 | In Progress | - |`. What the helper got *right* and was kept: the `04-08-PLAN.md` checkbox → `[x]` and the `7/11` → `8/11` count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** snapshot-before / `diff`-after reduced to exactly the intended lines. `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11`; `grep -c 'plans executed'` → `0`.
- **Carry-forward, unchanged:** three plans remain in this phase and all three will hit it. **Snapshot before, diff after** — a count-only check does not catch the trailing-cell mangling. Ordering matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**2. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 through 04-07 recorded**

- **Found during:** post-summary state updates (not a task)
- **Issue:** Confirmed by `git diff -- .planning/STATE.md` against the committed baseline, never by exit code. `advance-plan` advanced *Plan 8 of 11* → *9 of 11* but also reset `Status:` from "Executing Phase 4" to "Ready to execute" mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare date. `record-metric` appended a 4-column orphan row below the `*Updated after each plan completion*` footer, unrelated to the differently-shaped **By Phase** table above it.
- **Fix:** Restored `Status: Executing Phase 4` and both descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 8 of 11`) and the **Recent Trend** last-5 list, and deleted the stray row.
- **Files modified:** `.planning/STATE.md`

**2b. [Confirmed again] the named-flag rules hold**

- `add-decision --phase 04` (zero-padded) wrote the correct `[Phase 04]` prefix — third consecutive plan with no decision-prefix damage. `record-session` was invoked with `--stopped-at` / `--resume-file`; the positional and argument-less forms both return `"recorded": true` while writing `Resume file: None`, so the durable rule remains **named flags plus a diff**, never the exit code.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [RUN-03, RUN-04, RUN-05, CMP-02]` and the workflow's default is to check them off. That default was **not** followed, for the reason under *Decisions Made*, with the explicit recommendation to 04-11 recorded there so the deferral does not become permanent by inertia.

## Threat Model Disposition

- **T-04-02 (Information Disclosure, `sweepOrphanedMcpTempDirs`) — NOW MITIGATED IN THE RUNNING PRODUCT.** 04-01 shipped `getSweepRoots`'s legacy arm with three unit cases but noted the sweep did not consume it yet; it does now. The sweep iterates every root, keeps the `drift-mcp-` prefix filter and the `!== mcpTempDir` guard, and each root has its **own** `try`/`catch` so a missing legacy root cannot abort the real one. On macOS this is the difference between token-bearing `/tmp/drift-mcp-*` directories from the shipped 0.1.0 being swept after upgrade and never being swept again.
- **T-04-01 (Information Disclosure / Elevation, `genShortToken` + `mkdir(0o700)`) — mitigated.** 20 lowercase hex characters (80 bits nominal, PRNG-bounded in practice), `mkdir(…, { mode: 0o700 })` unchanged on the creation path. The 16-character floor, the `drift-mcp-` prefix requirement and the reason the entropy bound is the PRNG rather than the length are all commented **at** the generator, so a later "tidy-up" has to argue with the reasoning rather than just shorten a number.
- **T-04-30 (Information Disclosure, POSIX modes on Windows) — accepted, as planned.** Both `mode:` options stay unconditional; no `platform !== "win32"` guard was added. LLRT's `set_mode` is a verified no-op on non-unix and Node ignores `mode` on Windows, so a guard would double the branch count for zero behaviour change. HRD-01 (`icacls`) remains deferred to v2 in STATE.md.
- **T-04-04 (Information Disclosure, probe report / version block / `getDiagnostics`) — mitigated.** Every added field is a version string, a path Drift itself constructed or resolved, a boolean or an integer. No `process.env` enumeration (gate over the code-only view returns `0`). The three Windows profile variables are read **by name** inside `readWindowsEnvPresence`, whose return type is `Record<string, boolean>`; `grep -n "USERPROFILE"` shows two lines, both presence contexts, and the rendered message emits `USERPROFILE=present APPDATA=present LOCALAPPDATA=missing` — names and booleans, never values. `redactDebugText` (`index.ts:349`) still covers the debug log; this remains a separate surface.
- **T-04-23 (Denial of Service, transient FS failure at MCP start) — NOW MITIGATED IN THE RUNNING PRODUCT.** `withFsRetry` wraps the real first write with the bounded 1,500 ms ladder. Failure produces `formatProbeFailure(..., { firstWriteError, firstWriteAttempts })` — the actionable RUN-05 message plus the attempt count — routed through the existing `cleanupMcpRuntime` → `setMcpAuthStatus` → `publishMcpStatus` path rather than a cryptic raw error.
- **T-04-24 (Spoofing, unrecognised `os.platform()` silently taking the POSIX arm) — mitigated.** `normalizePlatform` gates: an unrecognised value produces `facts === undefined` and the hard failure, on **every** OS. There is no `platform === "darwin"` arm anywhere in `probeRuntime` — verified over the comment-stripped view of the function.
- **T-04-07 (Tampering, `sessionId`/`chatId` in paths) — transferred to Phase 2's SEC-02, goalposts unmoved.** Only the *directory* component changed. `mcp-activity-<sessionId>.jsonl`, `mcp-approvals-<sessionId>.json`, `copilot-mcp-<chatId>.json` and `mcp-<chatId>.json` derivations are byte-identical.
- **T-04-08 (Denial of Service (self), stale `gemini`/`codex` MCP registration pointing at the old wrapper path) — accepted, and the pre-clean verified to survive.** `registerMcpWithCli`'s best-effort `mcp remove drift` before every `mcp add` is untouched by this plan and registration re-runs on every `startMcpServer`, so a stale entry pointing at a now-deleted `/tmp/drift-mcp-*` wrapper is overwritten on the next start. No migration step added.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plans 04-09 and 04-10 are unblocked and unaffected.** 04-09 wires PERF-04 sites 1-6 and 04-10 wires PERF-03 plus site 7; both touch `index.ts` regions this plan did not (`stdout`/`stderr` accumulators, `resolveCommand`, `updateSettings`). The one thing they inherit is the import block: `./platform`, `./fs-retry` and `./runtime-probe` are already imported, so adding `./bounded-buffer` and `./resolution-cache` follows the same shape.
- **`host` is the phase's new shared fact, and it is `undefined` until MCP starts.** Any later plan that wants a platform decision outside `startMcpServer` must handle `host === undefined` the way `getSessionDebugLogPath` does — degrade, never re-read `os`, and never reintroduce a hardcoded path. Reading `os` at a second site breaks the D-02 total-count gate, which is the intended tripwire.
- **Phase 5 inherits three things.** (1) The launch-script writes (`writeLaunchScript` / `writeMcpWrapper`, `.tmp` → `chmod` → `rename`) are still **unwrapped** by `withFsRetry` — that is RUN-04's remaining half and 04-RESEARCH's best-documented AV case. (2) `renderExportExecScript` still emits `#!/bin/bash`; the scope fence held, so its byte-stability tripwire is intact for the rewrite. (3) `buildSpawnEnv` (04-01) still has zero call sites, by design.
- **Phase 6 should read the `runtimeRealpath` diagnostics field first** on a real Caido install. Research predicts `path.resolve`, and this plan adds first-party corroboration (`realpath` appears nowhere in `@caido/quickjs-types`). If it ever comes back `fs.realpath`, the 8.3-vs-long-form design gets materially easier and the research note should be corrected rather than the ladder changed.
- **`@caido/quickjs-types` is the capability oracle to consult before the next "is X available under LLRT?" question.** It is already in the typecheck program, it is first-party, and it is more current than `caido/dependency-llrt@main`'s `API.md` (Pitfall 7). It does **not** replace a real Windows Caido install — a declaration is not a measurement — but it is a cheaper first check than reading Rust source.
- **The residual risk this plan does not close:** the emitted bundle keeps `import os from "os";` as an **external** module-scope specifier. D-02 protects against `os.*` *calls* throwing, not against the *specifier* failing to resolve. If Caido's LLRT could not resolve `"os"`, the plugin would still die at load on every platform. Phase 3's P2-OS plus Caido's own `declare module "os"` are the evidence that it resolves; only a real Windows Caido install (Phase 9/10) makes it a measurement.
- `platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `activity-tail.ts`, `bounded-buffer.ts`, `resolution-cache.ts`, `claude-print.ts`, `command-resolution.ts`, `provider-launch.ts`, `mcp-runtime.ts` and `persistence.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/index.ts` — FOUND (modified; 133,459 bytes, 0 NUL bytes, `git diff --numstat` over both feat commits = `450 20`)
- `.planning/phases/04-platform-foundation/04-08-SUMMARY.md` — FOUND
- Commit `d3d0b46` — FOUND
- Commit `e6cf855` — FOUND
- Commit `9fed710` — FOUND
- `.planning/ROADMAP.md` — verified by `diff` against a pre-run snapshot: exactly two intended changes (the `04-08-PLAN.md` checkbox and the `7/11` → `8/11` count); all eleven `999.x` backlog items read `**Plans:** 0 plans`; `grep -c 'plans executed'` = `0`
- `.planning/STATE.md` — verified by `diff` against a pre-run snapshot: position, `completed_plans`, By Phase row, Recent Trend, session fields and four `[Phase 04]` decisions, and nothing else
- `.planning/REQUIREMENTS.md` — verified byte-identical; RUN-03/RUN-04/RUN-05/CMP-02 all still `- [ ]`, as intended

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
</content>
</invoke>
