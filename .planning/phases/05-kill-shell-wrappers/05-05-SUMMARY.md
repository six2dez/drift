---
phase: 05-kill-shell-wrappers
plan: 05
subsystem: backend-orchestrator
tags: [spawn, windows, provider-launch, run-04, fs-retry, dated-deletion, roadmap]

# Dependency graph
requires:
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-04's requireMcpServerSpec keystone, spawnWithEnv, readParentEnv and the win32-guarded tryRegisterMcpForProviders"
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-01's formatSpawnDebugLine — the key-names-only session debug formatter"
  - phase: 04-platform-foundation
    provides: "platform.ts's buildSpawnEnv (the single parent-merge point) and fs-retry.ts's withFsRetry ladder"
provides:
  - "A provider turn that spawns the resolved CLI binary DIRECTLY on every platform, with env = buildSpawnEnv({ parentEnv, driftVars })"
  - "writeLaunchScript, launchCommand/launchArgs/launchScriptPreview and finalize()'s launchCommand !== resolved branch: all gone, in one commit"
  - "withFsRetry's SECOND production call site — writeTemp — with its true scope and true limits written at the call site"
  - "mcpTempWriteAttempts in getDiagnostics, separate from mcpFirstWriteAttempts"
  - "Three literal DELETED IN PHASE 7 (PRV-03) notices; repo-wide dated-notice count is exactly 4"
  - "ROADMAP: amended Phase 5 SC-1, a Phase 5 non-claim table, and Phase 7 SC-7 as the structural owner of the survivors"
affects: [05-06 phase report and gates, 07-provider-launch]

actuals:
  # chars/4 over the two files actually changed, whole-file basis — the SAME
  # basis 05-01, 05-03 and 05-04 used, so the phase's samples stay comparable.
  # The same caveat 05-04 recorded applies and is worth repeating: index.ts is
  # 186,065 chars and this plan rewrote a small fraction of it, so this number
  # measures the FILES touched, not the work done. On a changed-hunk basis
  # (added + removed lines of the 5edae75^..HEAD diff) it is ~4,369.
  tokens: 57954
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A deletion set whose members are enforced by the compiler: noUnusedLocals + --max-warnings 0 turn a half-done conversion into a build failure, so the set cannot be split across commits by accident"
    - "A guard's removal and the operation it guards are deleted together, because a guard that becomes permanently false converts a conditional cleanup into an unconditional one"
    - "A dated deletion notice states WHY the survivor survives, WHO deletes it and WHEN, in a literal string one grep pattern finds repo-wide"
    - "A breadcrumb comment that deliberately withholds an identifier, and says so, because an exact-count gate runs over the raw file"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts
    - .planning/ROADMAP.md

key-decisions:
  - "The provider spawn injects driftVars only when the MCP runtime is attached (runtimeFiles !== undefined) — the same condition that used to gate the launch script — rather than unconditionally as the plan text reads. Unconditional injection would newly hand the Caido token to a provider child with no MCP server to reach"
  - "writeTemp throws when the ladder exhausts, rather than returning a path to a file that may be absent or half-written"
  - "The attempt count lands in a NEW diagnostics field, mcpTempWriteAttempts, not in mcpFirstWriteAttempts — the hot path must not overwrite the start-up answer"
  - "Two comments were reworded after they inflated exact-count gates (withFsRetry 4 to 3, renderExportExecScript 3 to 2). The code moved, never the gate"
  - "No requirement marked Complete: requirements.ready-ids returns 0/3, and the plan's own prohibition forbids RUN-04 here"

requirements-completed: []

coverage:
  - id: D1
    description: "The provider CLI is spawned directly on every platform with a parent-merged env; no platform branch, no generated launch script (D-04, RUN-01)"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "Gate B: comment-stripped `.sh` count 2 -> 1, the survivor being getMcpWrapperPath's own literal; Gate D two-sided: raw 4, allow-list filter empty"
        status: pass
    human_judgment: true
    rationale: "index.ts is not importable under vitest, so no test executes this spawn. The static gates are the entire evidence base — bucket N, row V-21, carried forward from 05-04 unsoftened."
  - id: D2
    description: "The launchCommand/launchArgs indirection, launchScriptPreview, lastSpawnArgs' use of them and finalize()'s launchCommand !== resolved removal branch are deleted AS ONE SET (T-05-20, critical)"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "Comment-stripped grep -c: launchCommand 0, launchArgs 0, launchScriptPreview 0, writeLaunchScript 0; git log --oneline -1 --stat at 5edae75 shows all five sites in one commit"
        status: pass
    human_judgment: false
  - id: D3
    description: "The session debug log records command, args and injected env KEY NAMES through the pure formatter; the wrapper-content dump has no successor and the config-content dump is unchanged (D-11, T-05-21)"
    requirement: "RUN-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatSpawnDebugLine (plan 05-01's cases — the formatter has no parameter through which a value could arrive)"
        status: pass
      - kind: other
        ref: "grep -c formatSpawnDebugLine index.ts = 2 (the import and the one call); redactDebugText's JSON arm still covers the surviving config dump"
        status: pass
    human_judgment: true
    rationale: "The FORMATTER is unit-tested by 05-01. That index.ts calls it, and calls nothing else, is grep evidence."
  - id: D4
    description: "RUN-04's headline half is satisfied structurally — no write-then-execute pair remains on any Windows-reachable path — and the retry ladder has more than one production call site"
    requirement: "RUN-04"
    verification:
      - kind: other
        ref: "grep -c withFsRetry index.ts = 3 (import + 2 call sites); comment-stripped spawnAndWait(\"chmod\" count 2 -> 1, the survivor inside the win32-guarded writeMcpWrapper"
        status: pass
    human_judgment: true
    rationale: "The LADDER itself is unit-tested in fs-retry.test.ts with an injected clock. That writeTemp now runs inside it is grep evidence, and a real Defender lock is not inducible on any runner — which is why the attempt count is surfaced in getDiagnostics instead."
  - id: D5
    description: "renderExportExecScript, shellQuote, writeMcpWrapper and one chmod spawn survive for POSIX Gemini/Codex, fenced by a dated notice in code and an owner in the roadmap (D-01, D-02, CMP-01, T-05-25)"
    requirement: "CMP-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration makes the shared wrapper path unreachable on win32, before wrapperPath is even considered"
        status: pass
      - kind: other
        ref: "grep -c 'DELETED IN PHASE 7 (PRV-03)' index.ts = 3; repo-wide dated-notice count = 4; ROADMAP Phase 7 SC-7 names all four symbols"
        status: pass
    human_judgment: false
  - id: D6
    description: "enforceOwnerOnlyDir's fs/promises namespace chmod is untouched and the whole-file chmod count stays non-zero (T-05-24)"
    requirement: "CMP-01"
    verification:
      - kind: other
        ref: "Function body extracted from HEAD and from the working tree and diffed — EMPTY (25 lines identical); whole-file grep -c chmod = 15"
        status: pass
    human_judgment: false
  - id: D7
    description: "macOS/Linux behaviour preserved — 290 tests green, provider-launch.ts / provider-launch.test.ts / fs-retry.ts byte-unchanged (CMP-01)"
    requirement: "CMP-01"
    verification:
      - kind: other
        ref: "pnpm exec vitest run — 290 passed / 31 files / 0 failures, identical to the post-05-04 total; git diff --stat over the three files — empty"
        status: pass
    human_judgment: false

duration: 8 min
completed: 2026-08-20
status: complete
---

# Phase 5 Plan 5: The Provider Launch Conversion Summary

**Every provider turn now spawns the resolved CLI binary directly with `env = buildSpawnEnv({ parentEnv, driftVars })` on all platforms — `provider-launch-<sessionId>.sh` and `writeLaunchScript` are gone, and the `finalize()` branch that would have deleted the user's `claude` binary went with them in the same commit.**

## The evidentiary ceiling (V-21) — carried forward from 05-04, unsoftened

`index.ts` is **not importable under vitest**. There is no `caido:plugin` alias in `vitest.config.ts` and no test file imports it. **Nothing this plan wrote is executed by any test.** Not the converted spawn, not the deleted indirection, not the `withFsRetry` wrapper around `writeTemp`, not the deletion notices.

What *is* proven, and by whom: plan 05-01 proved `formatSpawnDebugLine` and `planMcpCliRegistration` as pure functions; Phase 4 proved `buildSpawnEnv`'s parent-merge and `withFsRetry`'s ladder with an injected clock. What is **not** proven is this file's **wiring** of them.

That gap is bucket **N**, row **V-21**, and its only mitigations are the gates executed below and a human code review. **The 290 green tests are a regression signal, not coverage of anything this plan wrote.** This plan adds no tests, so any movement in that number would have been a regression. Do not report it as more than that in 05-06.

The second ceiling (**V-22**) also holds unchanged: the env contract's integration evidence spawns through Node, where libuv back-fills eleven `required_vars`. A regression to a bare drift-only `env` dict would pass every test this repo has and break only under Caido's LLRT, where Rust's `make_envp` writes the supplied map verbatim. **Gate D, run two-sided, is the only vehicle-independent control for that.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-20T13:33Z
- **Completed:** 2026-08-20T13:42Z
- **Tasks:** 3 of 3
- **Files modified:** 2

## Every gate in `<verification>`, executed — raw output

Run at the close of the plan, over `packages/backend/src/index.ts` at `4a914d1`. Every number below is the literal output of the command shown, not a reading of the diff.

### V1 — typecheck, lint, suite

```
$ pnpm -r typecheck        → exit 0   (shared tsc, backend tsc, frontend vue-tsc)
$ pnpm lint                → exit 0   (eslint . --max-warnings 0)
$ pnpm exec vitest run     → Test Files  31 passed (31)
                             Tests      290 passed (290)
```

**290 / 31 / 0 failures** — identical to the post-05-04 total, which is the intended result for a plan that adds no tests.

### V2 — the comment-stripped structural gates

The view is `sed -e 's://.*::'` because this plan adds several explanatory comments to exactly the regions being counted; one well-meant aside naming a deleted symbol would otherwise fail a gate for a comment rather than for surviving code.

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c '\.sh'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n '\.sh'
1079:  return path.join(mcpTempDir, "mcp-wrapper.sh");

$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'spawnAndWait("chmod"'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n 'spawnAndWait("chmod"'
1369:  const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);

$ grep -c 'chmod' packages/backend/src/index.ts
15
```

**PASS on all three, and the ladder landed where 05-04 predicted:**

| Stage | `.sh` | `spawnAndWait("chmod"` | Which literals survive |
|---|---|---|---|
| HEAD of Phase 5 (05-04's measurement) | 5 | 2 | — |
| After 05-04 | 2 | 2 | `getMcpWrapperPath`'s literal + `provider-launch-<sid>.sh` |
| **After this plan** | **1** | **1** | `getMcpWrapperPath`'s literal only; the `chmod` inside `writeMcpWrapper` only |
| Phase 7 (PRV-03) takes it to | 0 | 0 | — |

**The whole-file `chmod` count is 15 and that non-zero result is the correct one.** `enforceOwnerOnlyDir` reaches `chmod` through the `fs/promises` **namespace**, not a shell spawn; it re-asserts `0o700` on the token-bearing temp dir and feeds a fail-closed check. A plan whose evidence was `grep -c chmod` → `0` would have deleted a POSIX security control and called it compliance (§ Pitfall 1, T-05-24). Proven untouched:

```
$ git show HEAD:packages/backend/src/index.ts | awk '/^async function enforceOwnerOnlyDir/,/^}$/' > /tmp/e_base.txt
$ awk '/^async function enforceOwnerOnlyDir/,/^}$/' packages/backend/src/index.ts > /tmp/e_now.txt
$ diff /tmp/e_base.txt /tmp/e_now.txt
  diff: EMPTY — byte-identical (25 lines)
```

### V2 continued — Gate D, the parent-spread gate, two-sided

**Half 1 — the raw count must be non-zero, so the filter cannot pass vacuously:**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -cE '(^|[[:space:],{(])env:'
4
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -nE '(^|[[:space:],{(])env:'
1385:    env: spec.env,
1995:      env: spec.env,
2402:        : spawnWithEnv(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env });
3409:        env: buildSpawnEnv({
```

**Half 2 — the three-entry allow-list filter must print nothing:**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -E '(^|[[:space:],{(])env:' \
    | grep -v 'env: spec\.env' | grep -v 'env: buildSpawnEnv(' | grep -v 'env: options\.env'
[no output]
```

**PASS, both halves.** The count went 3 → 4: the new entry at `:3409` is the converted provider spawn, and it is the FIRST `buildSpawnEnv(` site in this file — until this plan the allow-list's `buildSpawnEnv` entry matched nothing at all.

### V3 — the deletion set

```
$ grep -c 'launchCommand'       packages/backend/src/index.ts   → 0
$ grep -c 'launchArgs'          packages/backend/src/index.ts   → 0
$ grep -c 'launchScriptPreview' packages/backend/src/index.ts   → 0
$ grep -c 'writeLaunchScript'   packages/backend/src/index.ts   → 0
```

All four are **0 on the RAW file**, which is stronger than the comment-stripped view the acceptance criterion permits — no comment anywhere in the file names any of them.

**This is threat T-05-20 (severity critical) discharged.** After the conversion `launchCommand !== resolved` is permanently false, so `finalize()`'s guard could not have been kept "for safety": kept alone it becomes an unconditional `rm(resolved)`, and `resolved` is the absolute path of the user's `claude` / `gemini` / `codex` / `copilot` binary. The guard and the removal were deleted together, in **one commit** (`5edae75`), with all five sites in it:

```
$ git log --oneline -1 --stat 5edae75
5edae75 feat(05-05): spawn the provider CLI directly and delete the launch-script indirection
 packages/backend/src/index.ts | 119 +++++++++++++++++++++-------------
 1 file changed, 66 insertions(+), 53 deletions(-)
```

### V4 — the dated deletion notices, repo-wide

```
$ grep -rn 'DELETED IN PHASE [0-9]\+ (' .github/workflows packages/backend/src | wc -l
4
$ grep -rn 'DELETED IN PHASE [0-9]\+ (' .github/workflows packages/backend/src
.github/workflows/windows-llrt-probe.yml:1:# TEMPORARY — DELETED IN PHASE 9 (D-02).
packages/backend/src/index.ts:860:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:967:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:1331:// DELETED IN PHASE 7 (PRV-03).

$ grep -c 'DELETED IN PHASE 7 (PRV-03)' packages/backend/src/index.ts
3
$ grep -c 'DELETED IN PHASE' packages/backend/src/mcp-server-spec.ts
0
```

**PASS.** The `mcp-server-spec.ts` gate is deliberately a **RAW whole-file count** and was NOT converted to the comment-stripped view the absence gates use — there the notices ARE comments, so stripping would make the gate vacuously pass forever. That is stated in the plan and is honoured here.

### V5 — the retry ladder's call-site count

```
$ grep -c 'withFsRetry' packages/backend/src/index.ts
3
$ grep -n 'withFsRetry' packages/backend/src/index.ts
113:import { withFsRetry } from "./fs-retry";
783:  const written = await withFsRetry(     ← writeTemp (NEW)
2790:  const written = await withFsRetry(    ← the mcp-server.mjs staging copy
```

**PASS.** Up from 2. The ladder is no longer one refactor away from being inert.

### V6 — the CMP-01 tripwires, byte-unchanged

```
$ git diff --stat packages/backend/src/provider-launch.ts \
                  packages/backend/src/provider-launch.test.ts \
                  packages/backend/src/fs-retry.ts
[empty]
```

**PASS.** The `provider-launch` argv `toEqual` assertions pass unedited, and the ladder was reused rather than rebuilt.

### Task-level exact-count gates

| Gate | Expected | Measured | Note |
|---|---|---|---|
| `grep -c renderExportExecScript` | 2 | **2** | the definition and the one call inside `writeMcpWrapper` |
| `grep -c shellQuote` | 3 | **3** | the definition and the two calls inside `renderExportExecScript` |
| `grep -c formatSpawnDebugLine` | 2 | **2** | the import and the one call |
| `grep -c redactDebugText` | "unchanged" | **3** (was 4) | see Deviation 1 — the criterion is unsatisfiable as written |
| `pnpm exec vitest run … -t "unreachable on win32"` | passes | **1 passed / 12 skipped** | the D-02 tripwire still fires |

## The enumerated `writeTemp` call sites — the actual `grep -n` output

The plan requires this enumeration, and requires that the comment state the TRUE scope rather than repeat the research document's broader claim. **The enumeration does not support the broader claim.**

```
$ grep -n 'writeTemp(' packages/backend/src/index.ts
779:async function writeTemp(dir: string, name: string, content: string): Promise<string> {
851:  return writeTemp(                                    ← writeChatMcpConfig
4148:      await writeTemp(mcpTempDir, "test-diag.json", "test");   ← getDiagnostics
```

**Exactly two callers.** The ladder covers:

| Caller | What it writes | Token-bearing |
|---|---|---|
| `writeChatMcpConfig` | Claude's `mcp-<chatId>.json` **and** Copilot's `copilot-mcp-<chatId>.json` | **yes** — both embed the literal Caido session token |
| `getDiagnostics` | `test-diag.json`, the temp-dir writability probe | no |

`05-RESEARCH.md` § *Recommendation* claims the edit "covers every token-bearing temp write — the Claude config, the Copilot config, the context file, the per-session activity/approval files". The last three are **false**: `mcp-context.json` is written by `writeMcpContextFile`'s own `writeFile`, and the activity/approvals files by `createSessionRuntimeFiles`' own `writeFile` calls. Neither passes through `writeTemp`, so both are **outside this edit**. The call-site comment says so, in those words.

Two further limits are written at the call site so nobody later justifies the ladder with a failure it cannot reach:

- **It cannot retry the external CLI's READ of the config.** Drift does not perform that read. What is retried is the `mkdir` + `writeFile` under an anti-virus handle — the half Drift owns.
- **It is on the per-turn hot path.** `writeChatMcpConfig` runs on every Claude and Copilot send, so a transient error now costs up to the ladder's full ~1,500 ms instead of failing fast. That duration was chosen to sit inside human tolerance for a button press, which is the only reason the cost is acceptable here — widening `FS_RETRY_DELAYS_MS` is not free on this path.

**RUN-04 idempotency, checked by construction:** `writeTemp` computes `fp` once from `(dir, name)` and calls `writeFile(fp, …)`, whose default flag is `w` — truncate-and-overwrite. `name` is `mcp-<chatId>.json`, so writing the same chat's config twice overwrites in place and leaves exactly one file per chat. The second write neither appends nor creates a duplicate. The retry wrapper does not change this: every attempt targets the same `fp` with the same flag.

**RUN-04 exhaustion:** when the ladder runs out, `writeTemp` **throws** rather than returning `fp`. Returning a path is a promise that the content is on disk, and after an exhausted ladder that promise is false. Both callers already treat a throw as the write having failed (`getDiagnostics` catches it into `tempDirWritable: no: …`; `writeChatMcpConfig`'s throw propagates to `sendCliMessage`'s existing `try/catch`). The attempt count reaches `getDiagnostics` as a **new** field, `mcpTempWriteAttempts`, kept separate from `mcpFirstWriteAttempts` so a per-turn write cannot overwrite the start-up answer.

## The three deletion notices, verbatim

### 1. `renderExportExecScript` (`index.ts:860`)

```
// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
//
// POSIX-only, and it survives this phase for exactly one reason: Gemini and
// Codex are registered with `mcp add drift -- <wrapper>`, which persists a PATH
// and nothing else, so the `export` lines this function renders are the SOLE
// carrier of CAIDO_URL, CAIDO_TOKEN and the DRIFT_* tool-policy variables for
// those two CLIs on darwin and linux. Deleting it now, before Phase 7 lands
// their env-passing registration, would be a live CMP-01 compatibility
// regression for two shipping providers on the platforms the entire user base
// runs today - not a theoretical one (D-01).
//
// The due date is named literally because an undated "temporary" comment
// becomes permanent: Phase 7, PRV-03.
//
// Its `passThroughArgs` option now has exactly one caller, which is correct and
// not an invitation to simplify the body - Phase 7 deletes the whole function.
```

### 2. `shellQuote` (`index.ts:967`)

```
// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
//
// POSIX-only, and it exists solely to quote the values the export-script
// renderer above writes into the surviving Gemini/Codex wrapper - the wrapper
// whose `export` lines are the only carrier of the Caido token and the
// tool-policy variables for those two CLIs on darwin and linux. It has no
// caller outside that render path, so it dies with it. Deleting either one
// before Phase 7's env-passing registration lands would be a live CMP-01
// regression for two shipping providers on the platforms the entire user base
// runs today (D-01).
//
// (That renderer's identifier is deliberately not spelled in this block: the
// phase counts it over the RAW file and expects exactly two - the definition
// and the one call.)
//
// The due date is named literally because an undated "temporary" comment
// becomes permanent: Phase 7, PRV-03.
```

### 3. `writeMcpWrapper` (`index.ts:1331`) — 05-04 wrote the header; this plan added the tripwire note

```
// DELETED IN PHASE 7 (PRV-03).
//
// The last surviving POSIX shell wrapper, and it serves ONLY Gemini and Codex:
// … (05-04's text, unchanged) …
//
// Its ONLY caller is tryRegisterMcpForProviders, which does not call it at all on
// win32 — so no `.sh` is written and no `chmod` is spawned there (D-02/D-03).
//
// The win32-unreachability tripwire D-02 asks for is the pure
// `planMcpCliRegistration` unit case in mcp-server-spec.test.ts, NOT an
// assertion inside this file: index.ts is not importable under vitest (no
// caido:plugin alias), so no test can execute a line of it. The predicate is
// what is tested; that this function sits behind it is static-gate evidence.
```

### The two breadcrumbs that deliberately withhold the dated literal

`getMcpWrapperPath` points at `writeMcpWrapper`'s block and states **in the comment itself** why it does not repeat the literal: the repository-wide notice count is exactly four, so a fourth copy added to be helpful would break the count that keeps the survivors owned. `redactDebugText`'s shell arm names *Phase 7 (PRV-03)* as its removal date in prose that does not match `DELETED IN PHASE [0-9]\+ (`, and records that narrowing a redactor as cosmetic cleanup fails **open** — the failure being a token in a support bundle.

## The amended Phase 5 SC-1, verbatim as it now reads

> 1. The MCP server launches via a single `buildMcpServerSpec()` → spec-to-spawn path that runs `node` directly with `env`. `writeLaunchScript`, the self-test launcher (`mcp-self-test-<id>.sh`), the Claude session wrapper (`mcp-wrapper-<sessionId>.sh`) and the provider launch script (`provider-launch-<sessionId>.sh`) are deleted from the codebase, together with **one** of the two `spawnAndWait("chmod", …)` spawns. `renderExportExecScript`, `shellQuote`, `writeMcpWrapper` and the remaining `chmod` spawn **survive** on darwin and linux for Gemini and Codex only, behind a platform guard, each headed by a literal `DELETED IN PHASE 7 (PRV-03)` notice — see Phase 7 SC-7, which owns their deletion. *(**Amended 2026-08-20** by plan 05-05 task 3, per 05-CONTEXT.md **D-01/D-02**. The original wording claimed `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call and every `.sh` file were deleted. Deleting the survivors now — before Phase 7 lands `--env`/`-e` registration for Gemini and Codex — would be a live CMP-01 regression for two shipping providers on the platforms the entire user base runs today, because the wrapper's `export` lines are their sole carrier of `CAIDO_URL`/`CAIDO_TOKEN`/`DRIFT_*`. Note also that the whole-file `chmod` count stays deliberately **non-zero**: `enforceOwnerOnlyDir`'s `fs/promises` namespace call is a POSIX security control, not a shell spawn, and is out of scope.)*

## The new Phase 7 success criterion, verbatim

> 7. Once Gemini and Codex register with `node` + args + `env` (SC-3 above), the shared POSIX wrapper and the functions that render it are **deleted**: `renderExportExecScript`, `shellQuote` and `writeMcpWrapper` no longer exist in `packages/backend/src/index.ts`, `getMcpWrapperPath` goes with them, the **last** `spawnAndWait("chmod", …)` spawn is gone, and `mcp-wrapper.sh` is written by no code path on any platform. Checkable: `grep -c` for each of those four symbols returns 0, the comment-stripped `.sh` count in `index.ts` reaches 0, and the repository-wide count of `DELETED IN PHASE 7 (PRV-03)` notices drops from 3 to 0 (the `DELETED IN PHASE 9` probe-workflow header is Phase 9's and is untouched). `enforceOwnerOnlyDir`'s `fs/promises` namespace `chmod` is explicitly **out of scope** and must remain. *(Added 2026-08-20 by plan 05-05 task 3, per 05-CONTEXT.md **D-01/D-02** — the structural owner for the survivors Phase 5 SC-1 no longer claims. Phase 7 must also `mcp remove` any stale `drift` entry a Phase-≤5 Drift left pointing at a deleted `.sh`.)*

Phase 7 went from 6 numbered criteria to 7. Nothing was renumbered — `diff` over every `^  [0-9]+\. ` line in the file shows exactly one changed line (SC-1) and one added line (Phase 7 SC-7). No phase status or completion date differs from HEAD.

## Phase 5's non-claim table, as added to the roadmap

| Claimed here | Not claimed here | Where it closes |
|---|---|---|
| The MCP **health check** on the Claude path — `validateCaidoAuth` and the three self-test methods — through a direct `node` spawn with `env` | A real **Claude CLI** connecting to the Drift MCP server end-to-end on Windows | Phase 7, **PRV-01** |
| The launch **shape**: no `.sh`, no `chmod`, no `#!/bin/bash` on any Windows-reachable path | That any of it works under the **real Caido LLRT runtime** — unverified in either direction | Phase 9/10, on a real Windows Caido install |
| macOS/Linux behaviour preserved, existing suite green | Gemini/Codex on Windows — registration is **skipped** there with a stated reason | Phase 7, **PRV-03** |

## Accomplishments

- **One spawn per provider turn, on every platform.** `spawnWithEnv(resolved, args, { env: buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars }), stdio: ["pipe","pipe","pipe"] })`. No platform branch, no generated script, no `chmod`, no `rename`. 05-04's `spawnWithEnv` and `readParentEnv` were reused — no second cast, no second guarded `process.env` read.
- **The deletion set landed whole, in one commit.** `launchCommand`, `launchArgs`, `launchScriptPreview`, the `writeLaunchScript` call, its `launchScriptPath === undefined` failure branch and its two `setSessionState`/`err` lines, `lastSpawnArgs`' composition, both debug dumps, `finalize()`'s removal branch and `writeLaunchScript` itself. `noUnusedLocals` plus `--max-warnings 0` are what make a half-done set a build failure, and that is the enforcement mechanism rather than a hazard.
- **The user-facing failure message has no successor, correctly.** "Drift could not prepare the provider launcher with the current MCP runtime settings." reported a failure that can no longer occur — there is nothing to prepare.
- **The debug log went from two dumps to one line.** The wrapper-content dump has no successor because there is no wrapper; the `Resolved launch:` line is subsumed. The replacement renders command, args and `Object.keys(injectedDriftVars)` through a formatter with **no parameter through which a value could arrive**. The Claude MCP config path and content dumps are untouched — `redactDebugText`'s JSON arm already covers them (D-11).
- **The synchronous error listener is now documented as load-bearing.** A comment at `proc.on("error", …)` records that under Caido's runtime a spawn failure arrives through a deferred task, and with no listener registered when that task runs the error is thrown with no JS frame to catch it — the *plugin* dies, not the turn. It also records that the error carries a message but **no `code`**, so any future classification must match on the message the way `fs-retry.ts` already does for `(os error N)`.
- **`withFsRetry` has a second production call site with honest scope.** `writeTemp`'s `mkdir` + `writeFile` pair, with both `mode:` options left unconditional (a documented no-op off unix; a platform guard would double the branch count for zero behaviour change while risking a POSIX regression).
- **The survivors are owned in two places.** Three literal notices in code and, in the roadmap, an SC-1 that describes the shipped code plus a Phase 7 criterion that names all four symbols so it cannot be satisfied by deleting something else.

## Verification Results

| Check | Result |
|---|---|
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 at `--max-warnings 0` |
| `pnpm exec vitest run` | **290 passed / 31 files / 0 failures** |
| V2 — `.sh` (comment-stripped) | PASS — exactly 1, inside `getMcpWrapperPath` |
| V2 — `spawnAndWait("chmod"` (comment-stripped) | PASS — exactly 1, inside `writeMcpWrapper` |
| V2 — whole-file `chmod` | PASS — 15, deliberately non-zero |
| V2 — `enforceOwnerOnlyDir` body vs HEAD | PASS — byte-identical, 25 lines |
| V2 — Gate D, two-sided | PASS — raw 4 (≥ 3), allow-list filter empty |
| V3 — `launchCommand` / `launchArgs` / `launchScriptPreview` / `writeLaunchScript` | PASS — 0 each, on the RAW file |
| V3 — single-commit criterion | PASS — `5edae75` carries all five sites |
| V4 — repo-wide dated notices | PASS — 4 |
| V4 — `mcp-server-spec.ts` dated notices (RAW by design) | PASS — 0 |
| V5 — `withFsRetry` | PASS — 3 |
| V6 — `provider-launch.ts` / `.test.ts` / `fs-retry.ts` | PASS — empty diff |
| `renderExportExecScript` / `shellQuote` / `formatSpawnDebugLine` | PASS — 2 / 3 / 2 |
| D-02 tripwire `-t "unreachable on win32"` | PASS — 1 passed, 12 skipped |
| `requirements.ready-ids RUN-01 RUN-04 CMP-01` | 0/3 ready — the shared-ID gate holds all three |
| `git diff --stat` overall | touches only `packages/backend/src/index.ts` and `.planning/ROADMAP.md` |

## Task Commits

1. **Task 1: D-04 — the direct spawn and the deletion set, as one set** — `5edae75` (feat)
2. **Task 2: `withFsRetry` around `writeTemp`, three dated notices** — `5d2e5d2` (feat)
3. **Task 3: ROADMAP SC-1 amendment, Phase 7 SC-7, the non-claim table** — `bf2f7ee` (docs)
4. **Comment reflow** — `4a914d1` (style, comment-only, no gate count changed)

## Files Modified

- `packages/backend/src/index.ts` — +191 / −59 across the four commits. **Deleted:** `writeLaunchScript`, `launchCommand`, `launchArgs`, `launchScriptPreview`, the launcher-failure branch, the `launchScriptPreview` debug dump, the `Resolved launch:` line, `finalize()`'s `launchCommand !== resolved` block. **Added:** the `buildSpawnEnv` and `formatSpawnDebugLine` imports, `injectedDriftVars`, the converted `spawnWithEnv` call, one `formatSpawnDebugLine` debug line, `lastTempWriteAttempts` + `mcpTempWriteAttempts`, the `withFsRetry` wrapper around `writeTemp`, two dated notices, and four rationale comments (D-11, the synchronous error listener, the `getMcpWrapperPath` breadcrumb, the `redactDebugText` shell-arm breadcrumb).
- `.planning/ROADMAP.md` — amended Phase 5 SC-1, added the Phase 5 non-claim table, added Phase 7 SC-7. No renumbering, no status or date change.

## Decisions Made

- **The provider spawn injects `driftVars` only when the MCP runtime is attached.** The plan's `<action>` reads `driftVars: runtimeEnv` unconditionally. Under the pre-conversion code the launch script — and therefore the `export CAIDO_TOKEN=…` line — existed **only** when `runtimeFiles !== undefined`, i.e. only when `mcpTempDir` was set. Passing `runtimeEnv` unconditionally would newly hand the Caido session token to a provider child that has no MCP server to reach, widening the token's blast radius for no capability and contradicting D-10's net-reduction accounting. `injectedDriftVars` preserves the original condition exactly, which is also what keeps D-04's "behaviourally identical on POSIX" claim — the plan's own justification that the existing suite exercises this path — actually true. See Deviation 2.
- **`writeTemp` throws on an exhausted ladder.** Returning `fp` after six failed attempts would be a promise that the content is on disk. Both callers already treat a throw as write-failure, so the throw preserves the existing contract rather than inventing one.
- **The attempt count got its own diagnostics field.** `mcpFirstWriteAttempts` answers "did the one-time staging copy survive Defender". Folding the per-turn writes into it would let a chat send overwrite the start-up answer — the exact question a Windows bug report is read for.
- **Two comments were reworded to restore gate signal, and the gates were left alone.** This is the correction-versus-capitulation test from 05-04 task 3, and both failures cited **HEAD-adjacent code that said a symbol more times than it used it**, which is a real signal.
- **No requirement marked Complete.** `requirements.ready-ids` returns 0/3 — RUN-01, RUN-04 and CMP-01 are each also declared by 05-06, which has no SUMMARY. This coincides with the plan's explicit prohibition on marking RUN-04 here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The `redactDebugText` acceptance criterion is unsatisfiable as written**

- **Found during:** Task 1's acceptance gate
- **Issue:** The criterion reads *"`grep -c 'redactDebugText'` is unchanged from the post-05-04 count recorded in `05-04-SUMMARY.md`"*. Two problems. First, **05-04-SUMMARY.md records no such count** — its verification table lists `requireMcpServerSpec`, `writeLaunchScript(`, `parentEnv`, `toMcpConfigDocument`, `findExpandableEnvKeys`, `planMcpCliRegistration`, `writeChatMcpConfig(` and `claudeMcpWrapperPath`, and nothing for `redactDebugText`. Second, the count **cannot** be unchanged: it was 4 at HEAD (definition, one prose mention, two calls) and this same task is instructed to delete the `Provider launch script preview:` dump, which is one of those two calls. A criterion that the task's own required action falsifies cannot be met.
- **Fix:** Measured and recorded instead of retuned. The count is **3**: the definition (`:855`), the surviving prose mention in the D-11 comment block, and the surviving JSON/config-dump call. The property the criterion actually guards — that the redactor is not deleted or narrowed — is asserted directly: `redactDebugText`'s **body is unchanged**, both arms present, and the Phase 7 breadcrumb added to its shell arm sits inside the function and does not name the symbol. The shell arm survives because the POSIX wrapper it guards survives.
- **Files modified:** `packages/backend/src/index.ts` (comment only)
- **Verification:** `grep -c redactDebugText` → 3; `grep -n` confirms one definition, one comment mention, one call; the two `.replace(...)` arms are byte-identical to HEAD.
- **Committed in:** `5edae75`
- **Owned by 05-06:** recorded in `.planning/WINDOWS.md` as item 3, so the phase report reconciles the number rather than inheriting a stale expectation.

**2. [Rule 2 - Missing Critical] Unconditional `driftVars` would have leaked the Caido token to an MCP-detached provider child**

- **Found during:** Task 1
- **Issue:** The plan's `<action>` specifies `spawn(resolved, args, { env: buildSpawnEnv({ parentEnv: process.env, driftVars: runtimeEnv }), … })`. `runtimeEnv` is built unconditionally by `buildMcpRuntimeEnv` and always carries `CAIDO_URL` and `CAIDO_TOKEN`, but the code it replaces only ever exported those values when `runtimeFiles !== undefined` — i.e. only when `mcpTempDir` is set and an MCP server actually exists for the CLI to talk to. Following the plan literally would have handed the live Caido session token to every provider child on every turn, including turns with MCP detached, where the token buys nothing. That is a token blast-radius increase in the phase whose D-10 accounting is a net *reduction*, and it would also have broken D-04's "behaviourally identical on POSIX" claim — the argument on which the plan rests its case that the existing macOS/Linux suite exercises the converted path.
- **Fix:** `const injectedDriftVars: Record<string, string> = runtimeFiles === undefined ? {} : runtimeEnv;`, declared once and used at both the debug line and the spawn. The condition is character-for-character the one that used to gate the launch script. `env: buildSpawnEnv({ … })` stays written as a plain inline object key, so Gate D's allow-list still sees it.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** Gate D half 2 prints nothing with the unmodified three-entry allow-list; `injectedKeys` in the debug line is `Object.keys(injectedDriftVars)`, so the log reports what is actually injected rather than what was merely built; 290 tests green.
- **Committed in:** `5edae75`
- **Recorded in** `.planning/WINDOWS.md` as item 4, for 05-06's report.

**3. [Rule 1 - Bug] Two new comments inflated exact-count gates**

- **Found during:** Task 2's acceptance gate
- **Issue:** `grep -c 'withFsRetry'` returned **4** against an expected 3, and `grep -c 'renderExportExecScript'` returned **3** against an expected 2. Both gates run over the **raw** file. The cause in each case was a comment I had written naming the symbol in prose: the `writeTemp` rationale said "`withFsRetry` wrapped exactly one operation", and `shellQuote`'s deletion notice said "quote the values `renderExportExecScript` writes". This is 05-04's Deviation 3 recurring, and the plan's own task-3 rule applies: *fix the code, never the gate.*
- **Fix:** Both comments reworded to describe the thing without carrying its identifier — "the ladder" and "the export-script renderer above" — and each now states **in the comment** that the identifier is withheld deliberately because the phase counts it over the raw file. That converts a recurring foot-gun into a self-documenting one.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `withFsRetry` → 3 (import + 2 call sites, confirmed by `grep -n`); `renderExportExecScript` → 2 (definition + the one call in `writeMcpWrapper`); typecheck, lint and 290 tests green after each rewording.
- **Committed in:** `5d2e5d2`

---

**Total deviations:** 3 auto-fixed (1 unsatisfiable-criterion correction, 1 missing-critical security preservation, 1 gate-signal defect ×2 sites).
**Impact:** One behavioural decision worth 05-06's attention (Deviation 2 — the spawn's `driftVars` gate). No scope creep, no test edited or removed, no gate threshold relaxed, and every acceptance criterion in all three tasks was **executed** with its output recorded above rather than inferred from the diff.

## Every test file edit, with its reason

**None.** No test file was created, edited or removed. `provider-launch.test.ts` — the CMP-01 tripwire — and `fs-retry.ts` are byte-unchanged, confirmed by `git diff --stat`. The suite total is identical to the post-05-04 figure (290), which is the intended result for a plan that adds no tests and the only signal available that nothing previously covered broke.

## Known Stubs

**None.** Nothing was left half-converted: the compiler would not have allowed it. `noUnusedLocals` plus `--max-warnings 0` mean a surviving `launchCommand`, an unused `renderExportExecScript` import or an orphaned `launchScriptPreview` is a hard build failure, which is why the D-04 change set could be verified as complete by `pnpm -r typecheck` exiting 0 before a single grep was run.

## Threat Flags

**None new.** No network endpoint, auth path, file-access pattern or schema change was introduced. Two threats were *reduced* rather than added:

| Threat | Effect of this plan |
|---|---|
| T-05-22 (EoP — the direct provider spawn) | **Reduced.** The last shell interpolation on the Claude provider path is deleted. The prompt still reaches the child through stdin and never argv; `shell: true` with dynamic args appears nowhere. |
| T-05-20 (DoS — `finalize()`'s cleanup) | **Discharged.** The guard and the removal died together; `grep -c 'launchCommand'` is 0 on the raw file. |

05-04's `SpawnWithEnv` informational flag still stands unchanged — this plan reused the alias rather than adding a second cast, which is what that flag asked for.

## Issues Encountered

None that blocked. Every task's `<verify>` passed, and no fix loop exceeded one attempt.

One thing to carry forward, because it is a live trap rather than a problem encountered: **two of this plan's three deviations were exact-count gates failing on comments I had just written.** That is the third and fourth instance across 05-04 and 05-05 of the same mechanism. The gates worked — each failure pointed at a real fact, that the file named a symbol more times than it used it — but the recurrence is a signal that a future phase should either move these gates to the comment-stripped view uniformly (where the property allows it) or keep writing the "identifier deliberately withheld" note that this plan added at both sites. The one gate that must **stay raw** is `grep -c 'DELETED IN PHASE' mcp-server-spec.ts`, where the comments are the subject.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for 05-06 (the phase report and gates).**

- **RUN-04 was NOT marked Complete here, and neither were RUN-01 or CMP-01.** `requirements.ready-ids` returns **0/3**: all three are also declared by 05-06, which has no SUMMARY, so the shared-ID gate holds them. This coincides with the plan's explicit prohibition — *"Plan 05-06 owns the traceability write, after the phase gates run"* — and with the honest reading: RUN-04's headline half is satisfied **structurally**, and the `windows-latest` leg 05-02 authored has not yet been run. `.planning/REQUIREMENTS.md` is byte-unchanged.
- **Open, and owned by 05-06** (all five are in `.planning/WINDOWS.md`):
  - **item 2** — `05-VALIDATION.md` row V-6 expects one surviving `spawnAndWait("chmod"`. That number is now **correct**: the measured count after this plan is 1. V-6 can be closed rather than corrected. `05-VALIDATION.md` is byte-unchanged here, per the same rule 05-04 followed.
  - **item 3** — the `redactDebugText` criterion (Deviation 1).
  - **item 4** — the spawn's `driftVars` gate (Deviation 2), for the report's behaviour-change section.
  - **item 5** — the V-21 ceiling: this plan's entire change set is unproven by any executing test, and the human code review is its only remaining control.
  - item 1 (`writeChatMcpConfig`'s third parameter) is **marked fixed** — the shipped signature was used and the function was not touched.
- **Carry the V-21 and V-22 paragraphs verbatim, not softened.** They are stronger for this plan than for 05-04: 05-04 could at least point at 05-01's integration test proving the spec drives a real server. Nothing this plan wrote has an equivalent.
- **Open, and unclosable in this repo:** whether any of it works on a real Windows Caido install. That is PRV-01/Phase 7 and the reporter's confirmation in Phase 9/10 — now stated on the roadmap itself, in Phase 5's non-claim table, rather than only in a plan summary.
- **For Phase 7 (PRV-03):** the deletion is a numbered roadmap criterion with a checkable form. Three literal notices point at it from the code, and `getMcpWrapperPath` and `redactDebugText`'s shell arm carry breadcrumbs to it without inflating the count.

## Self-Check: PASSED

- `[ -f packages/backend/src/index.ts ]` — FOUND
- `[ -f .planning/ROADMAP.md ]` — FOUND
- `[ -f .planning/phases/05-kill-shell-wrappers/05-05-SUMMARY.md ]` — FOUND
- `git log --oneline --all | grep 5edae75` — FOUND
- `git log --oneline --all | grep 5d2e5d2` — FOUND
- `git log --oneline --all | grep bf2f7ee` — FOUND
- `git log --oneline --all | grep 4a914d1` — FOUND
- Plan `<verification>` re-run at close: typecheck exit 0; lint exit 0 at `--max-warnings 0`; vitest 290/290 green; all six V-items executed with output recorded above; `git diff --stat` touches only `index.ts` and `ROADMAP.md`; the V-21 ceiling paragraph is present and states what is NOT proven before what is.

---
*Phase: 05-kill-shell-wrappers*
*Completed: 2026-08-20*
