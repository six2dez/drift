---
phase: 03-ci-spike-prove-llrt-basics-on-windows
plan: 01
subsystem: ci
tags: [windows, llrt, node-esm, child-process, spawn-env, probe, ci-spike, eslint]

# Dependency graph
requires:
  - "01-05/01-06 — `eslint.config.mjs` linting every `.mjs` outside node_modules/dist, and the four-leg `Verify (Node N)` matrix that a lint error in a new file would turn red"
  - "03-CONTEXT.md — D-05..D-11 (failure policy, vehicle labelling, sentinel-only secrets)"
provides:
  - "scripts/windows-llrt-probe.mjs — zero-dependency Node ESM probe answering the seven LLRT/Windows assertions (CI-02)"
  - "Single-emission output grammar: exactly one `^PASS|^FAIL [<ID>]:` line per assertion ID, produced only inside the `=== Summary ===` block"
  - "Four-surface spawn classifier (throw / error / close / timeout) that plans 03-02..03-04 and Phases 4-8 read their architecture from"
  - "Measured falsifiability evidence on darwin: exit 1 driven solely by the P0-TMP platform gate, with all seven IDs counted at exactly 1"
  - "Depth-agnostic `.gitignore` rule for `probe-results.txt`, proven against a real subdirectory in the working tree"
affects: [03-02, 03-03, 03-04, 03-05, 04, 05, 06, 07, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recorder/printer split: `pass()`/`fail()` record, only the summary block prints — so a whole-file grep counts exactly one status line per ID"
    - "Summary iterates a frozen `ASSERTION_IDS` array rather than the results array, so a never-reached assertion emits `FAIL ... not reached` instead of vanishing"
    - "Four-surface spawn classification with an explicit indeterminate FAIL branch (conclusive-or-fail)"
    - "Single `process.exit(code)` after one callback-awaited `process.stdout.write`, so a piped tail cannot be truncated"

key-files:
  created:
    - scripts/windows-llrt-probe.mjs
  modified:
    - .gitignore

key-decisions:
  - "P0-ENV measured on darwin that the `env` option REPLACES the parent block (child reported PATH-ABSENT) — Phases 4-8 must spread `...process.env` whenever the child needs PATH. The Windows run re-measures this; the replace/merge fact is emitted as an INFO line because it is not recoverable from a bare PASS."
  - "P0-ENV's failure path retries once with `{ ...process.env, SENTINEL }` so a failure names which mechanism broke (option ignored vs cleared block breaks the child), because D-05 turns it into a Phase-4-halting blocker."
  - "Hand-matched Prettier defaults rather than widening `pnpm format`'s glob — widening edits `package.json`, which Phases 4-8 touch, and enlarges parked backlog item 999.11 for a file Phase 9 deletes."
  - "`process.exit(code)` after a callback-awaited write rather than `process.exitCode` + falling off the end: a stray uncleared timer or an unreaped child would hang the Windows job."
  - "P1-CMD's `finally` only unlinks when the write actually succeeded, so a write failure is reported as `indeterminate` rather than masked by a second error."

patterns-established:
  - "Machine-parseable probe grammar: `INFO [ID]: …` for progress (unlimited), `PASS/FAIL [ID]: …` once per ID in the summary only"
  - "Mandatory non-LLRT vehicle labels on runtime-property assertions (P2-OS, P3-UUID) so an archived artifact cannot be misread as an LLRT result"
  - "Local pre-flight on the dev host proves the gate drives the exit code before a Windows runner is burned"

requirements-completed: [CI-02]

# Metrics
duration: 4min
completed: 2026-08-13
---

# Phase 3 Plan 01: Windows/LLRT Primitive Probe Summary

**A 448-line zero-dependency Node ESM probe that answers all seven LLRT/Windows assertions, classifies `.cmd` spawn into four surfaces with an explicit indeterminate-fails branch, and — proven on the darwin dev host before any Windows runner is burned — exits 1 driven solely by the P0-TMP platform gate while emitting exactly one status line per assertion ID.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-13T12:31:36Z
- **Completed:** 2026-08-13T12:35:30Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `scripts/windows-llrt-probe.mjs` exists in a new top-level `scripts/` directory and passes `pnpm lint` at **exit 0**, so the four pre-existing `Verify (Node N)` legs are not endangered by this phase.
- Single emission is structural, not conventional: `pass()`/`fail()` only push onto `results`, and the `=== Summary ===` block — which iterates the frozen `ASSERTION_IDS` array and looks results up by ID — is the sole producer of `^PASS`/`^FAIL` lines. A never-reached ID emits `FAIL … not reached`; a duplicate emits `FAIL … duplicate result recorded`.
- The four-surface spawn classifier (`throw` / `error` / `close` / `timeout`) replicates the shipped `settled` + `clearTimeout` + `SIGKILL` discipline from `index.ts:852-875` and resolves on both `close` and `error` per `index.ts:1519-1529`, with the synchronous `try`/`catch` around `spawn()` itself that catches Node's CVE-2024-27980 guard.
- The exit contract is one rule with no special cases: non-PASS on any of P0-ENV, P0-TMP, P1-CMD → 1; P1-WHERE, P2-OS, P3-VARS and P3-UUID never gate. One `process.exit(` call site, immediately after a callback-awaited `process.stdout.write` of the whole tail.
- `probe-results.txt` is ignored by a targeted, depth-agnostic rule carrying its rationale — measured against a real subdirectory inside the working tree, not asserted.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the seven-assertion probe with a four-surface spawn classifier** — `d0137d6` (feat)
2. **Task 2: Keep the probe's local output out of git** — `5fc9523` (chore)

**Plan metadata:** see the `docs(03-01)` commit that carries this SUMMARY, STATE.md and ROADMAP.md.

## Files Created/Modified

- `scripts/windows-llrt-probe.mjs` (448 lines, new) — the probe: docblock stating the Node-not-LLRT vehicle and the Phase 9 deletion date, one deliberately bare `import … from "os"`, the recorder/printer emitters, `spawnCapture`, the seven assertion blocks, and `main` with the single flushed tail write.
- `.gitignore` — one ignore pattern (`probe-results.txt`) plus its six-line rationale comment; 8 insertions, 0 deletions, no pre-existing line touched.

## Falsifiability Evidence (the plan's `<output>` record)

**Local darwin run:** `node scripts/windows-llrt-probe.mjs` → **exit 1**, on `node=v26.7.0 process.platform=darwin`.

Verbatim summary block:

```
=== Summary ===
PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786624403366 through the spawn env option; that option replaced the parent environment (child reported PATH-ABSENT)
FAIL [P0-TMP]: os.platform() returned "darwin", which is not the Windows platform id — this host is not Windows, so the Windows temp-dir assertion cannot be satisfied here
PASS [P1-CMD]: spawn-error-event — the child emitted an error event with EACCES: spawn /var/folders/05/485xn5t96tqcmngzrsd8rh7c0000gn/T/probe-test-1786624403395.cmd EACCES (conclusive: direct .cmd spawn is not usable on this host, so Phases 4-8 must route .cmd targets through cmd.exe /c)
FAIL [P1-WHERE]: where.exe produced no parseable output for "node" (surface=error exit=null error=ENOENT: spawn C:\Windows/System32/where.exe ENOENT) — informational only, this does not gate the exit code
PASS [P2-OS]: the bare specifier for the os built-in resolved at import time; reaching this assertion is the proof (node-vehicle; LLRT resolver verified by source analysis)
FAIL [P3-VARS]: missing or empty: USERPROFILE, APPDATA, LOCALAPPDATA — informational only, this does not gate the exit code
PASS [P3-UUID]: randomUUID is available (globalThis.crypto=true, node:crypto=true) (node-vehicle; LLRT crypto surface unverified)

PROBE FAILED: at least one of P0-ENV, P0-TMP, P1-CMD is not PASS — see the summary lines above for which.
If P0-ENV is the failure, the documented fallback is a minimal .cmd launcher that `set`s each variable and then calls node (STATE.md blocker, D-05); Phase 4 does not start until that fallback is decided.
```

**Why exit 1 is the correct local result:** the only gating failure is `P0-TMP`, and it fails on the platform check alone — `P1-WHERE` and `P3-VARS` also FAIL and are correctly ignored by the exit rule. That is the phase's first proof that the P0 gate actually drives the exit code, obtained without burning a Windows runner.

**Per-ID grep counts** (`grep -cE "^(PASS|FAIL) \[<ID>\]:" /tmp/probe-local.txt` over the whole file):

| ID | count |
|---|---|
| P0-ENV | 1 |
| P0-TMP | 1 |
| P1-CMD | 1 |
| P1-WHERE | 1 |
| P2-OS | 1 |
| P3-VARS | 1 |
| P3-UUID | 1 |

Not 0 (which would mean the ID never reached the summary) and not 2 (which would mean an inline emitter was reintroduced). Plans 03-03 and 03-04 count against exactly this property.

**Comment-filtered structural counts** (filter drops every line whose first non-whitespace is `//`, `/*` or `*`):

| Measurement | Value | Meaning |
|---|---|---|
| `exit-sites` | **1** | one `process.exit(` call site, immediately after the awaited write |
| `empty-catch` | **0** | no `catch (_)` — `no-empty` is `[2, { allowEmptyCatch: false }]`; the repo form `catch { /* ignore */ }` is used instead |
| `win32-literal` | **1** | one uncommented occurrence — plan 03-04's Task 1 mutates precisely it |
| `bare-os` | **1** | the bare `from "os"` specifier survived, so P2-OS still asserts something |
| `vehicle-labels` | **3** | ≥ 2 required (D-08); P2-OS PASS, P3-UUID PASS and P3-UUID FAIL all carry the label |

**Security / hygiene gates:**

| Measurement | Value | Meaning |
|---|---|---|
| `d10-secret-refs-absent` | **0** | `grep -nE 'CAIDO_(TOKEN)\|secret(s)\.'` over the probe matched nothing (D-10); the only secret-shaped value is `drift-probe-sentinel-<Date.now()>` |
| `packages-untouched` | **0** | `git status --porcelain -- packages/` is empty — zero files touched under `packages/*/src` |
| `root-ignored` | **0** | `git check-ignore -v probe-results.txt` → `.gitignore:23:probe-results.txt` |
| `depth-ignored` | **0** | same rule bites for `.gsd-depth-check/probe-results.txt` inside the working tree; the check directory was removed (`depth-probe-cleaned`) |
| `broad-txt-rule` | **0** | no blanket `*.txt` rule was introduced |
| `pnpm lint` | **exit 0** | read from `lint-exit=` after a redirect, not after a pipe |
| `pnpm -r typecheck` | **exit 0** | shared, backend and frontend all clean (the `.mjs` is outside every tsconfig include) |

**P2-OS / P3-UUID label check:** the P2-OS summary line ends with the literal `(node-vehicle; LLRT resolver verified by source analysis)` and the P3-UUID line with `(node-vehicle; LLRT crypto surface unverified)` — both verified with anchored `grep -c '…)$'` = 1.

## Decisions Made

- **P0-ENV's replace-vs-merge observation is emitted as its own INFO line and repeated in the PASS detail.** On darwin the `env` option *replaced* the parent block (child reported `PATH-ABSENT`). Phases 4-8 need this to decide whether their spawn options must spread `...process.env`; it is not recoverable from a bare PASS. The Windows run re-measures it.
- **P1-CMD's `finally` unlinks only when the write succeeded** (`written` flag). A write failure already reports `indeterminate`; unlinking a file that was never created would add a second, misleading error.
- **Details are newline-collapsed by a shared `oneLine()` helper** before being recorded or printed. Spawn error messages are single-line in practice, but a multi-line detail would silently break the one-line-per-ID contract that plans 03-03/03-04 count against; collapsing makes it structural rather than incidental.
- **`INFO` is emitted through `process.stdout.write`, never `console.error`.** Nothing is written to stderr deliberately; stderr stays reserved for uncaught runtime noise that the workflow's `2>&1` still folds into the artifact.
- **Prettier's glob was not widened** (PATTERNS option 2 chosen): widening edits `package.json`, a file Phases 4-8 will touch, and enlarges parked backlog item 999.11 for a file Phase 9 deletes. Formatting is not a gate — `eslint-config-prettier` is last in the flat config.

## Deviations from Plan

No deviations in the plan's two tasks — both executed exactly as written, and no auto-fixes were required (`pnpm lint` and `pnpm -r typecheck` were green on the first run of each).

One deviation in the post-plan state update:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted a premature `CI-02: Complete` mark in REQUIREMENTS.md**

- **Found during:** state updates, after both task commits
- **Issue:** The executor workflow marks every ID in the plan's `requirements:` frontmatter complete on plan completion. All five Phase 3 plans carry `requirements: [CI-02]`, and CI-02 reads "A CI spike **proves** the 7 LLRT assertions". Running `requirements mark-complete CI-02` after plan 1 of 5 flipped the checkbox to `[x]` and the traceability row to `Complete` while no `windows-latest` run has happened at all — the exact false-green D-13 forbids ("the files exist and the YAML is valid" is explicitly not sufficient) and the class of defect Phase 1 existed to eliminate.
- **Fix:** Reverted `.planning/REQUIREMENTS.md` to its committed state — CI-02 stays `[ ]` / `Pending`. It is the later Phase 3 plan that records the real run's verdict (D-11/D-12/D-13) that should mark it complete.
- **Files modified:** none (revert restored the file byte-for-byte; `git status --porcelain .planning/REQUIREMENTS.md` is empty)
- **Verification:** `grep -n "CI-02" .planning/REQUIREMENTS.md` → line 75 `- [ ] **CI-02**`, line 136 `| CI-02 | Phase 3 | Pending |`
- **Committed in:** n/a — the revert leaves no diff to commit

---

**Total deviations:** 1 auto-fixed (1 bug — false-green requirement mark)
**Impact on plan:** None on the delivered code. The correction keeps the requirement signal honest for plans 03-02..03-05, which is the phase's whole purpose.

## Issues Encountered

None in the two tasks. Two expected-and-correct local FAILs (`P1-WHERE` ENOENT for the Windows `where.exe` path, `P3-VARS` for the three Windows profile variables) are the informational assertions behaving as designed off-Windows; both are correctly excluded from the exit rule.

One tooling issue during state updates: `gsd-tools roadmap update-plan-progress 03` rewrote the **backlog** Phase 999.1 `**Plans:**` line instead of the Phase 3 one. That single line was reverted to its committed text so the ROADMAP diff is scoped to Phase 3; the defect and two pre-existing ROADMAP formatting oddities are logged in [deferred-items.md](./deferred-items.md) rather than fixed here (out of scope for this plan's `files_modified`). Check the backlog section's diff on future `update-plan-progress` runs.

## Known Stubs

None. Every assertion is fully implemented and measured; nothing is hardcoded, mocked or deferred.

## Threat Flags

None. The plan's `<threat_model>` dispositions were all implemented and measured: T-03-01 (`d10-secret-refs-absent=0`), T-03-02 (three variables printed by explicit name; `process.env` never enumerated), T-03-07 (every spawn bounded at 5000 ms with `settled` on all four paths and an explicit `process.exit`), T-03-08 (one flushed tail write, frozen-array summary, indeterminate-fails branch, single exit rule), T-03-09 (depth-agnostic ignore), T-03-SC (nothing installed — Node built-ins only; `package.json` and `pnpm-lock.yaml` untouched).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for 03-02** (the `windows-latest` workflow): the probe is the artifact that workflow runs and tees. Its exit-code contract, its `probe-results.txt` filename and the `if-no-files-found: error` upload rationale are all now concrete.
- **Ready for 03-03/03-04:** the per-ID count of exactly 1 and `win32-literal=1` are measured facts, so 03-03's artifact verification and 03-04's mutation of that literal both have a stable target.
- **Open until a real Windows run (D-13):** every Windows-specific answer is still unmeasured — the darwin run deliberately proves the *instrument*, not the platform. `P0-TMP`, `P1-WHERE` and `P3-VARS` will only produce real answers on `windows-latest`, and `P1-CMD` will only there distinguish the EINVAL / runs / hangs outcomes that select Phases 4-8's spawn architecture.
- **STATE.md blocker unchanged:** the "LLRT `spawn({env})` env-passthrough on Windows is unverified" entry stays open until the CI run lands; the darwin PASS is evidence about POSIX, not Windows.

## Self-Check: PASSED

- Files: `scripts/windows-llrt-probe.mjs` FOUND, `.gitignore` FOUND, `03-01-SUMMARY.md` FOUND.
- Commits: `d0137d6` FOUND, `5fc9523` FOUND, `a272c61` FOUND.

---
*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Completed: 2026-08-13*
