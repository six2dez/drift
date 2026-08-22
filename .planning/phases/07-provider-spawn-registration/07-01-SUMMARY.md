---
phase: 07-provider-spawn-registration
plan: 01
subsystem: infra
tags: [windows, cmd.exe, child_process, spawn, cross-spawn, escaping, vitest, github-actions]

# Dependency graph
requires:
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "P1-CMD — the measured synchronous EINVAL that makes a cmd.exe branch mandatory rather than optional"
  - phase: 04-platform-primitives
    provides: "platform.ts — the injected `Platform` union and `WINDOWS_EXECUTABLE_EXTENSIONS`, both read (never re-derived) by the new module"
  - phase: 05-mcp-runtime-direct-spawn
    provides: "SpawnWithEnv, the sync-throw guards at both spawn sites, and the blocking windows-latest CI leg"
  - phase: 06-command-resolution
    provides: "resolveCommand emitting `.cmd`/`.bat` candidates — the inputs this plan makes launchable"
provides:
  - "`buildSpawnPlan` — the single decision point turning a resolved provider binary into a spawn (file, argv, verbatim-arguments flag)"
  - "A ported, MIT-attributed cross-spawn escaping implementation (`escapeCmdCommand`, `escapeCmdArgument`, `needsDoubleEscape`) with no dependency added"
  - "`windowsVerbatimArguments` as a REQUIRED member of `SpawnWithEnv` and an OPTIONAL member of `spawnAndWait`'s options, forwarded into BOTH of its internal branches — the channel 07-03 and 07-04's registration and removal spawns need"
  - "A measured A1 verdict: escaping depth for an npm-global shim, plus the empty-string and single-space edge-probe outcomes, each with a windows-latest run URL"
  - "The first win32-gated test file in this repo (`describe.skipIf`) and the convention note justifying it"
affects: [07-02, 07-03, 07-04, 07-05, phase-08-process-lifecycle, phase-10-ux-polish]

actuals:
  tokens: 12181
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Pure spawn-decision module: platform injected, zero I/O, one import, ported algorithm carrying its upstream licence and URLs"
    - "win32-gated integration test via `describe.skipIf(process.platform !== 'win32')` — new convention for this repo"
    - "Falsifiability leg per architectural claim: one leg proves the cmd.exe branch is needed (direct spawn EINVAL), one proves the escaping is needed (caret pass removed)"

key-files:
  created:
    - packages/backend/src/spawn-plan.ts
    - packages/backend/src/spawn-plan.test.ts
    - packages/backend/src/spawn-plan.win32.test.ts
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "`buildSpawnPlan` is applied at CALL SITES, never inside `spawnAndWait` (OQ-3) — putting it inside would silently capture the `--version` candidate loop and the `where.exe` spawn, adding a process-tree level to every Drift spawn"
  - "`windowsVerbatimArguments` is REQUIRED on `SpawnWithEnv` (omission is a compile error, Pitfall B) but OPTIONAL on `spawnAndWait` (its ~8 pre-existing callers spawn plain executables and the non-verbatim default is correct for them)"
  - "The flag is forwarded into BOTH of `spawnAndWait`'s internal branches, including the no-env one — that branch is the only channel every registration and removal spawn has"
  - "A1 measured, not guessed: upstream's single-escape heuristic is kept, but the prediction that the opposite depth would corrupt the round trip was FALSIFIED on a real runner and the test now asserts the measured behaviour"
  - "The escaping falsifiability leg uses one percent-bearing argument rather than the full unescaped hazard set — `& | < >` outside a quote pair would run and redirect on the CI runner"
  - "`CMD_INTERPRETED_EXTENSIONS` is derived by filtering the shipped `WINDOWS_EXECUTABLE_EXTENSIONS`, so extending the resolver's ladder automatically extends the interpreter branch"

patterns-established:
  - "Measured-claim comment block: every CI-derived fact in a source header carries its run URL, the job conclusion, the step conclusion and the proving log line — the red run is kept alongside the green one because it is the evidence"
  - "Falsified-prediction handling: when a runner contradicts a planned assertion, the assertion is rewritten to state the measurement with its mechanism, and a NEW leg is added that still discriminates — never deleted, never widened"

requirements-completed: [PRV-01, PRV-02, UX-01]

coverage:
  - id: D1
    description: "A Windows provider command resolving to a `.cmd`/`.bat` shim spawns through `cmd.exe /d /s /c` with `windowsVerbatimArguments: true`, and the process starts instead of throwing EINVAL"
    requirement: PRV-01
    verification:
      - kind: unit
        ref: "packages/backend/src/spawn-plan.test.ts#routes a .cmd shim through cmd.exe with /d /s /c, one outer quote pair and verbatim arguments on"
        status: pass
      - kind: integration
        ref: "packages/backend/src/spawn-plan.win32.test.ts#round-trips the hazard set through an npm-global-shaped .cmd shim byte-identically (windows-latest run 32563543158)"
        status: pass
      - kind: integration
        ref: "packages/backend/src/spawn-plan.win32.test.ts#refuses a DIRECT spawn of the same .cmd with a synchronous EINVAL — the falsifiability leg for the cmd.exe branch"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Windows provider command resolving to a `.exe` spawns DIRECTLY — no cmd.exe layer, verbatim arguments off"
    requirement: PRV-01
    verification:
      - kind: unit
        ref: "packages/backend/src/spawn-plan.test.ts#spawns a .exe directly with no cmd.exe layer and verbatim arguments off"
        status: pass
      - kind: integration
        ref: "packages/backend/src/spawn-plan.win32.test.ts#spawns a real .exe directly with no interpreter and still round-trips the hazard set"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every hazard-shaped argument (space, `&`, `(`, `)`, `,`, `|`, `<`, `>`, `^`, a literal `%TEMP%`, an embedded quoted phrase, an empty string and a single space) arrives at the shim byte-identical to what Drift passed"
    requirement: PRV-02
    verification:
      - kind: unit
        ref: "packages/backend/src/spawn-plan.test.ts#caret-prefixes every character in the exported metacharacter set"
        status: pass
      - kind: unit
        ref: "packages/backend/src/spawn-plan.test.ts#keeps an empty-string argument and a single-space argument as their own distinct elements"
        status: pass
      - kind: integration
        ref: "packages/backend/src/spawn-plan.win32.test.ts#round-trips the hazard set through an npm-global-shaped .cmd shim byte-identically"
        status: pass
      - kind: integration
        ref: "packages/backend/src/spawn-plan.win32.test.ts#does NOT round-trip with the caret pass removed — the falsifiability leg for the escaping"
        status: pass
    human_judgment: false
  - id: D4
    description: "On darwin, linux and an undefined platform the spawn is byte-identical to the pre-plan tree — same file, same argv array, no new interpreter (CMP-01)"
    verification:
      - kind: unit
        ref: "packages/backend/src/spawn-plan.test.ts#returns the command and argv unchanged on darwin, linux and an undefined platform"
        status: pass
      - kind: unit
        ref: "packages/backend/src/provider-launch.test.ts (11 tests, unchanged file, green)"
        status: pass
      - kind: unit
        ref: "packages/backend/src/platform.test.ts (120 tests, unchanged file, green)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The verbatim-arguments flag reaches EVERY exposed spawn site, including the shared helper's no-environment branch that 07-03 and 07-04's registration and removal spawns take"
    requirement: PRV-02
    verification:
      - kind: other
        ref: "awk '/^function spawnAndWait/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments' => 3"
        status: pass
      - kind: other
        ref: "grep -c 'windowsVerbatimArguments' packages/backend/src/index.ts => 9 (>= 6)"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck => 0 (a REQUIRED member means an omitted flag is a compile error)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A user who pins an absolute `C:\\...\\claude.cmd` in the Settings command field can complete a turn — the resolver's green dot becomes true rather than misleading"
    requirement: UX-01
    verification: []
    human_judgment: true
    rationale: "CI proves the spawn CONTRACT, not `index.ts`'s wiring of it — `index.ts` is not importable under vitest, so nothing executes `sendCliMessage`. The residual is the reporter confirmation SC-1 marks 'where possible' and 07-CONTEXT.md places in Phase 9/10. Do not report PRV-01 as more than this (plan `<flagged_assumptions>`)."
  - id: D7
    description: "A real `windows-latest` run measured the escaping against an npm-global-shaped shim, and the A1 verdict plus the two edge-probe outcomes are recorded in-repo with their run URLs"
    requirement: PRV-01
    verification:
      - kind: other
        ref: "gh run view 32563543158 — job `Verify (Windows)` = success, step `Test` = success; the same gate is RED on run 32563348727"
        status: pass
      - kind: other
        ref: "log proof: `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 508ms` and `Tests 444 passed (444)` with no skips"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-08-22
status: complete
---

# Phase 7 Plan 01: Windows provider spawn plan Summary

**A pure `buildSpawnPlan` module routes Windows `.cmd`/`.bat` provider shims through `cmd.exe /d /s /c` with a ported cross-spawn escaping and `windowsVerbatimArguments: true`, wired into the real `sendCliMessage` spawn and proven against a real cmd.exe on `windows-latest`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-22T08:35:00Z (approx., dispatch)
- **Completed:** 2026-08-22T09:00:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `packages/backend/src/spawn-plan.ts` — a pure, one-import module that is now the ONLY path from a resolved provider binary to a `spawn`. POSIX and `undefined` platform pass through byte-identically; a Windows `.exe` spawns directly; a Windows `.cmd`/`.bat` becomes `cmd.exe /d /s /c "<one escaped, outer-quoted line>"` with verbatim arguments on.
- cross-spawn's escaping algorithm ported under MIT attribution with its upstream URLs and both deliberate divergences recorded — **no dependency added** (`package.json` and `pnpm-lock.yaml` unchanged).
- `windowsVerbatimArguments` opened as a channel to **every** exposed spawn site: REQUIRED on `SpawnWithEnv` (so omission is a compile error, Pitfall B) and forwarded into **both** of `spawnAndWait`'s internal branches — including the no-environment one that 07-03's and 07-04's registration and removal spawns take. Without that branch those plans could not deliver the flag at all.
- 20 unit cases on the Linux/macOS runner covering the metacharacter set (driven from the exported constant), backslash doubling, the `/s` command-vs-argument escaping split, ordering/stability, and the empty and adjacency edge probes.
- 5 win32-gated integration cases driving a real `cmd.exe` against a runtime-built npm-global-shaped shim in a directory whose name carries a space and a parenthesis pair — including two falsifiability legs, one for the cmd.exe branch and one for the escaping.
- **Open question A1 closed by measurement**, and the measurement contradicted the prediction. Recorded honestly in the module header with both run URLs.

## Task Commits

1. **Task 1 (tracer, TDD RED): spawn-plan unit suite** — `08d0db7` (test)
2. **Task 1 (tracer, TDD GREEN): module + index.ts wiring** — `c4aaee1` (feat)
3. **Task 2: win32 integration file** — `7a46f2c` (test)
4. **Task 3 (re-measure): reshape the falsified leg** — `73aca08` (test)
5. **Task 3: record the measured A1 verdict** — `ecb1854` (docs)

## Files Created/Modified

- `packages/backend/src/spawn-plan.ts` — `buildSpawnPlan`, `SpawnPlan`, `escapeCmdCommand`, `escapeCmdArgument`, `needsDoubleEscape`, `CMD_META_CHARACTERS`, `CMD_INTERPRETED_EXTENSIONS`, `DEFAULT_COMSPEC`
- `packages/backend/src/spawn-plan.test.ts` — 20 unit cases, provable on the Linux runner
- `packages/backend/src/spawn-plan.win32.test.ts` — 5 win32-gated integration cases against a real cmd.exe
- `packages/backend/src/index.ts` — `buildSpawnPlan` import; `SpawnWithEnv` widened with a REQUIRED flag; `spawnAndWait` options widened and both branches forwarding; the MCP server spawn stating its honest `false`; `sendCliMessage` building the plan, setting `lastSpawnArgs` from it and spawning `plan.file`/`plan.args`

## The measurement — A1, and a prediction that did not survive

The plan asked for A1 (single or double caret escaping for an npm-global `.cmd` shim) to be **measured, not guessed**, with a leg asserting the opposite depth does **not** round-trip so a green case one could not be vacuous.

The runner disagreed with the prediction.

| Run | Windows job | `Test` step | What it measured |
|---|---|---|---|
| [32563348727](https://github.com/six2dez/drift/actions/runs/32563348727) | **failure** | **failure** | The opposite (double) escaping depth **also round-trips** the full hazard set byte-identically. The `not.toEqual` leg failed with "Compared values have no visual difference." |
| [32563543158](https://github.com/six2dez/drift/actions/runs/32563543158) | **success** | **success** | The reshaped suite: `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 508ms`, `Tests 444 passed (444)` with no skips |

**Verdict.** The module keeps upstream's heuristic unchanged — a global shim is SINGLE-escaped — because case one proves that choice round-trips byte-identically and because upstream's shape carries a decade of use. But depth is **not** the discriminator A1 expected. The mechanism, now that the answer is in hand: after `/s` strips the single outer quote pair, each argument still carries its **own** quote pair, `%*` proxies those quotes into the shim's second parse, and inside quotes cmd treats `&`, `|`, `<` and `>` as ordinary text. The extra caret layer is consumed harmlessly.

**What that does not license.** Escaping *depth* is not load-bearing on this shim shape; escaping *itself* is. The falsified leg was therefore replaced rather than deleted, and a new leg was added that genuinely discriminates: the same shim driven with the caret pass removed, asserting cmd expands a literal `%TEMP%`. Case one is non-vacuous again, on a claim the runner actually supports.

**Edge probes (only obtainable from a real Windows host).** An empty-string argument **survives** the round trip as its own distinct argv element. A single-space argument **survives** as its own distinct argv element with its space intact. Both are recorded in the module header with the run URL.

## Decisions Made

- **`buildSpawnPlan` at the call sites, never inside `spawnAndWait`** (plan OQ-3). Inside the helper it would silently capture `getNodeExecutable`'s `--version` candidate loop and the `where.exe` path-search spawn, adding a process-tree level to every Drift spawn — a direct cost to Phase 8's `taskkill /T /F` and Phase 10's console-flash count.
- **Required on `SpawnWithEnv`, optional on `spawnAndWait`.** The former has three call sites, all of which must state their answer; the latter has ~8 pre-existing callers spawning plain executables for which the non-verbatim default is correct. A caller routing through `buildSpawnPlan` passes the plan's answer explicitly.
- **The escaping falsifiability leg uses one percent-bearing argument, not the full unescaped hazard set.** Unescaped `&`, `|`, `<` and `>` outside a quote pair would make cmd run and redirect fragments of a Drift argument on the CI runner's filesystem. A falsifiability leg must not be the most dangerous line in the suite; `%` discriminates just as sharply and expands to text rather than to an action.
- **The provider-launch site's stale "PRV-02 will own this" paragraph was rewritten**, since this plan is what made a `.cmd` launch there. The sync-throw guard is explicitly kept and explicitly not dead code (a NUL byte in a rehydrated `resolved`, and an unspawnable `cmd.exe`, both still throw synchronously). The equivalent paragraph at `spawnAndWait` was left alone — plan 07-04 task 3 owns replacing it with the OQ-3 decision.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two acceptance criteria for task 1 were mutually unsatisfiable; the must-have won**

- **Found during:** Task 1
- **Issue:** The plan required BOTH `grep -c '^import type { Platform } from "./platform";'` to return 1 (an exactly-typed, type-only single import) AND `CMD_INTERPRETED_EXTENSIONS` to be *derived by filtering the shipped `WINDOWS_EXECUTABLE_EXTENSIONS`* — which is a VALUE import. A type-only import cannot carry a value, and a second `import` line would break the `grep -c '^import' == 1` criterion. No file satisfies both literal greps.
- **Fix:** Used one combined import — `import { WINDOWS_EXECUTABLE_EXTENSIONS, type Platform } from "./platform";`. This satisfies the purity claim's substance (`grep -c '^import'` = 1, the single import justified by name in the header, zero `path`/`os`/`process`/`child_process`/`require`) and satisfies the plan's `must_haves.key_links` binding that the extension list is READ, never re-derived (06-CONTEXT on PRV-02). The must-have outranks the literal form of the grep.
- **Files modified:** `packages/backend/src/spawn-plan.ts`
- **Verification:** `grep -c '^import' packages/backend/src/spawn-plan.ts` = 1; `grep -Ec 'require\(|from "(path|os|process|child_process|node:)'` = 0; unit test asserts `CMD_INTERPRETED_EXTENSIONS` equals `[".cmd", ".bat"]` derived from the shipped constant.
- **Committed in:** `c4aaee1`
- **Adjusted criterion for the verifier:** `grep -c '^import { WINDOWS_EXECUTABLE_EXTENSIONS, type Platform } from "./platform";' packages/backend/src/spawn-plan.ts` returns 1.

**2. [Rule 1 - Falsified assertion] The opposite-escaping falsifiability leg asserted something untrue**

- **Found during:** Task 3 (first `windows-latest` run)
- **Issue:** Task 2's case three asserted that the OPPOSITE double-escaping depth would NOT round-trip. Run 32563348727 measured that it round-trips byte-identically, so the assertion was false and the Windows job went red on a correct implementation.
- **Fix:** The case now asserts the MEASURED behaviour with the mechanism written down, and the original prediction is described in the comment rather than deleted (never widen an assertion to hide a difference). A NEW leg was added — the same shim driven with the caret pass removed, asserting cmd expands a literal `%TEMP%` — so case one remains non-vacuous on a claim the runner supports. The module's heuristic was NOT flipped: case one proves the shipped choice correct, and flipping it would trade a decade-exercised shape for one whose only advantage is that it also happens to work here.
- **Files modified:** `packages/backend/src/spawn-plan.win32.test.ts`, `packages/backend/src/spawn-plan.ts` (header)
- **Verification:** Run 32563543158 — Windows job success, `Test` step success, 5 win32 cases ran (not skipped).
- **Committed in:** `73aca08`, `ecb1854`
- **Scope note:** the win32 file now carries FIVE cases where the plan's `<done>` says four. The extra one is the escaping falsifiability leg the plan's own reasoning demands; nothing was dropped.

**3. [Rule 3 - Blocking] The plan's own log-extraction pipeline was a silent no-op for the ANSI strip**

- **Found during:** Task 3
- **Issue:** The plan mandated `cut -f3- | perl -pe 's/\x1b\[[0-9;]*m//g' | perl -pe 's/^\d{4}-…Z //'` per STATE `[03-03]`. The `cut` and timestamp stages work, but `gh run view --log` emits the colour sequences as **literal two-character `^` `[` text**, not as real `0x1b` bytes (confirmed with `od -c`), so the `\x1b` substitution matched nothing and left every line coloured.
- **Fix:** Used `perl -pe 's/\^\[\[[0-9;]*m//g'` for this tool's output, and validated the whole pipeline against an independently known non-zero control before trusting any count from it (STATE `[03-03]`'s durable rule).
- **Files modified:** none (tooling only)
- **Verification:** Cleaned log yields readable `✓`/`×` lines and the `Test Files`/`Tests` totals.
- **Committed in:** n/a — no source change.
- **Carry-forward:** this is the fourth recurrence of the same class in four phases. The durable rule stands: validate any log-extraction pipeline against a known non-zero expected count before trusting it.

### Placement note (not a deviation in substance)

The plan said to build the spawn plan "immediately before the try block". It is built ~20 lines earlier, at the `injectedDriftVars` site, because the plan also required `lastSpawnArgs` to be set from the plan's file and args and that diagnostics assignment happens there. One construction, two consumers, and the diagnostics field now reports what was actually handed to the OS. Both related acceptance criteria hold: `grep -c 'spawnWithEnv(resolved' packages/backend/src/index.ts` returns 0, and the site passes `plan.file`/`plan.args`.

---

**Total deviations:** 3 auto-fixed (1 blocking plan-internal contradiction, 1 falsified assertion corrected by measurement, 1 blocking tooling defect)
**Impact on plan:** No scope creep. Deviation 2 is the plan working as designed — it asked for a measurement and got one that contradicted the guess, which is the outcome the "measure, do not guess" instruction existed to make possible. Deviation 1 resolved a contradiction inside the plan itself in favour of its stated must-have.

## Issues Encountered

- The first `windows-latest` run was RED. This was the measurement, not a defect: see § *The measurement* above. It is deliberately kept in the record — without it the green run would prove less.
- `String.raw` templates containing `\"` were rejected by esbuild's TS parser during test authoring; the two affected expectations were rewritten as ordinary quoted strings. No behavioural difference.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` (macOS host) | 32 passed, 1 skipped — 439 passed, 5 skipped. The win32 file reports SKIPPED, not passed. |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` (`--max-warnings 0`) | exit 0 |
| `windows-latest` leg | [run 32563543158](https://github.com/six2dez/drift/actions/runs/32563543158) — job `Verify (Windows)` success, every step success including `Test` and `Build` |
| Win32 cases RAN, not skipped | `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 508ms`; `Tests 444 passed (444)`; the only `skipped` string in the whole job log is pnpm's "resolution step is skipped" |
| Gate discriminates | The same `gh` gate is RED against run 32563348727 and PASS against 32563543158 |
| CMP-01 net | `provider-launch.test.ts`, `platform.test.ts`, `provider-launch.ts`, `platform.ts` untouched (`git diff --stat` empty) and green |
| No dependency added | `git diff --stat package.json pnpm-lock.yaml` empty |
| `grep -c 'shell: true\|shell:true'` | 0 in both `index.ts` and `spawn-plan.ts` |
| Spawn-site inventory | 5 spawn calls in `index.ts`; the ONLY one not carrying the key is the path-search spawn at line 1638 (`which`/`where.exe`, a real executable deliberately outside the interpreter plan) |
| Scratch-branch teardown | `git ls-remote --heads origin 'refs/heads/scratch/ci-proof-07-01-spawn-plan'` returns empty (asserted on the SPECIFIC name, not a glob) |

**Full unfiltered remote listing after teardown:**

```
0cd81f3c0cf31bb4f7c4916bf595ec07a358b628	refs/heads/fix/security-hotfixes
2d8cf16004b40a30dfd7721d99f2bf3e2b19e270	refs/heads/main
3f7c7b3816c0cdd3b8936afdcccc723cb1591151	refs/heads/scratch/ci-06-07-phase-close
```

`scratch/ci-06-07-phase-close` is **pre-existing**, created by a previous phase, and is outside this plan's authorization to delete. It is named here so a future reader does not mistake it for this plan's leftover. `git status --porcelain` for the four paths this plan owns is empty, and the untracked `.planning/` documents at the repo root were never staged (every `git add` used targeted paths; `-A` was never used).

## Known Stubs

None.

## Threat Flags

None. The plan's `<threat_model>` dispositions were all honoured: T-07-01 (verbatim escaping port + banned `shell: true`, proven by the round trip and made non-vacuous by the caret-pass-removed leg), T-07-02 (`/d` is part of the plan object's return value, not a call-site choice, asserted by the four-element argv shape test), T-07-03 (the flag is a REQUIRED type member, so omission is a compile error). No new network endpoint, auth path, file-access pattern or schema change was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 07-02 and, through it, for 07-03 and 07-04.** The blocker a plan review caught is closed: `spawnAndWait`'s options type carries `windowsVerbatimArguments` and forwards it into **both** internal branches, so the registration and removal spawns — none of which pass an environment — have the channel they need. Without it those plans could not have satisfied their own acceptance criteria while every call-count gate still passed.

Binding on the later plans in this phase:

- `buildSpawnPlan` is applied at CALL SITES. Do not move it inside `spawnAndWait` (OQ-3).
- Pass `windowsVerbatimArguments` as a LITERAL object key, never a spread from the plan object — Phase 5's static env-site gate greps for literal keys.
- 07-04 task 3 still owns replacing `spawnAndWait`'s "deliberately absent" paragraph with the OQ-3 decision. It was deliberately left untouched here.

**Concerns carried forward, stated at their true strength:**

- **PRV-01 is proven to the CI ceiling, not beyond it.** Nothing in CI executes `sendCliMessage`; `index.ts` is not importable under vitest, so the path from the resolver's answer through the plan to the spawn is unexercised by construction. The residual is the reporter confirmation SC-1 marks "where possible" and 07-CONTEXT.md places in Phase 9/10.
- **Assumption A2 remains open.** `windowsVerbatimArguments` is source-verified in Caido's LLRT fork and declared in the vendored type surface, but has never been EXECUTED under LLRT. Only a real Windows Caido closes this.
- **Seams marked, not fixed:** the cmd.exe branch introduces a console-window flash (Phase 10, UX-04) and an extra process-tree level for a cancel (Phase 8, LIF-01). Both are marked in `buildSpawnPlan` and neither was acted on.

---
*Phase: 07-provider-spawn-registration*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All three created files present on disk (`spawn-plan.ts`, `spawn-plan.test.ts`, `spawn-plan.win32.test.ts`).
- All six commits resolve in `git log --oneline --all`: `08d0db7`, `c4aaee1`, `7a46f2c`, `73aca08`, `ecb1854`, `1d63180`.
- Every `<acceptance_criteria>` from all three tasks re-run and passing, with the single documented exception in Deviation 1 (mutually unsatisfiable greps; the must-have was honoured and the adjusted machine form is stated there).
- Plan-level `<verification>` re-run: full suite green on POSIX with the win32 file skipped, `pnpm -r typecheck` and `pnpm lint` exit 0, `windows-latest` green on run 32563543158, CMP-01 nets untouched and green, `package.json`/`pnpm-lock.yaml` unchanged.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes.
