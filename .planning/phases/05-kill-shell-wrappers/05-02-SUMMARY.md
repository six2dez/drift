---
phase: 05-kill-shell-wrappers
plan: 02
subsystem: infra
tags: [github-actions, windows-latest, pnpm, caido-dev, jszip, gitattributes, ci, packaging]

requires:
  - phase: 03-windows-llrt-spike
    provides: the three-arm no-secret-material gate (D-10) and the measured setup-node/action-setup ordering failure (run 31702174047)
  - phase: 04-platform-foundation
    provides: the RUN-04 re-target precedent — the structural shape this plan copies for CI-01/CI-03
provides:
  - A blocking `Verify (Windows)` job on windows-latest in ci.yml (install → typecheck → lint → test → build, Node 20)
  - A portable root `build` script — `caido-dev build` alone, runnable under cmd.exe
  - `.gitattributes` with `* text=auto eol=lf`
  - `.github/scripts/check-ci-windows-job.sh` — 14 runnable assertions over the job's shape
  - The D-10 secret gate carried into a permanent home, proven at all three grep statuses
  - Phase 5 structural ownership of CI-01 and CI-03
affects: [05-06, phase-06, phase-07, phase-08, phase-09]

actuals:
  tokens: 4300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Zip parity measured on the checkout (entry names + byte lengths + extracted SHA-256) before deleting a packaging step that release.yml signs"
    - "Three-arm grep gate (0 fail / 1 pass / anything else fail) with no `test -f` pre-check, so the third arm is the live missing-target guard"
    - "Acceptance criteria expressed as a committed runnable script rather than prose"

key-files:
  created:
    - .gitattributes
    - .github/scripts/check-ci-windows-job.sh
  modified:
    - package.json
    - .github/workflows/ci.yml
    - CLAUDE.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Tier 0 — zip parity held on the first measurement, so the POSIX build tail was deleted rather than ported. No contingency tier was needed."
  - "The Windows leg is a sibling job, not a matrix entry on `verify`: the ubuntu leg runs four Node versions and this runs one, so a shared matrix would either quadruple Windows minutes or dilute the Node matrix."
  - "The secret gate omits the probe's `test -f` pre-check so a deleted scan target routes into the third arm through grep's own status 2, which is what makes Phase 9's deletion of windows-llrt-probe.yml fail loudly."
  - "`package-manager-cache` is named in the commit body and this SUMMARY but deliberately absent from ci.yml in any form, config or comment — the static gate asserts a zero count over a comment-stripped view."
  - "timeout-minutes: 20 is provisional; plan 05-06 replaces it from the first real run's measured duration."

patterns-established:
  - "Measure-then-delete: a packaging change to a signed artifact is proven by BEFORE/AFTER listings on this checkout, never by trusting a research measurement"
  - "Prove the scanner, not just its exit code: a gate is demonstrated at every status it can return before it is trusted"

requirements-completed: []

coverage:
  - id: D1
    description: "The root `build` script is a single cross-platform command that still produces a byte-equivalent plugin package"
    requirement: CI-01
    verification:
      - kind: integration
        ref: "rm -rf dist && pnpm build && test -f dist/plugin_package.zip"
        status: pass
      - kind: other
        ref: "diff of unzip -Z1 sorted entry names and unzip -l byte lengths, BEFORE vs AFTER; plus SHA-256 of every extracted file"
        status: pass
    human_judgment: false
  - id: D2
    description: "`.gitattributes` exists at the repo root with `* text=auto eol=lf`"
    requirement: CI-03
    verification:
      - kind: other
        ref: "grep -c 'eol=lf' .gitattributes == 1 && grep -c 'text=auto' .gitattributes == 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "ci.yml carries a blocking windows-latest job with pins matching the ubuntu job, bash pinned on every run step, and read-only job permissions"
    requirement: CI-01
    verification:
      - kind: other
        ref: "bash .github/scripts/check-ci-windows-job.sh (14 assertions, exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The three-arm no-secret-material gate is carried forward and demonstrated to fire at all three grep statuses"
    requirement: CI-01
    verification:
      - kind: other
        ref: "check-ci-windows-job.sh secret-gate assertions — clean=1, seeded token=0, seeded expression=0, missing target=2"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI-01 and CI-03 are structurally owned by Phase 5 in the traceability table and both rollups"
    verification:
      - kind: other
        ref: "grep -c '| CI-01 | Phase 5 | Pending |' .planning/REQUIREMENTS.md == 1; recomputed coverage 43 mapped / 0 unmapped"
        status: pass
    human_judgment: false
  - id: D6
    description: "The authored Windows leg is actually green on a real windows-latest runner"
    verification: []
    human_judgment: true
    rationale: "NOT CLAIMED BY THIS PLAN. No windows-latest run has been executed. Plan 05-06 pushes, reads the real run, and records the run URL, the per-step conclusions and the log line proving the gate's mechanism. Everything above was proven locally on macOS only."

duration: 8 min
completed: 2026-08-20
status: complete
---

# Phase 05 Plan 02: Windows CI Net + Portable Build Summary

**Deleted a measured-no-op POSIX build tail so `pnpm build` runs under cmd.exe, then landed a blocking `Verify (Windows)` job carrying a three-arm secret gate proven at every status it can return — with no CI run claimed.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-20T12:45:05Z
- **Completed:** 2026-08-20T12:53:05Z
- **Tasks:** 3 of 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- **`pnpm build` is now portable.** The root script is exactly `caido-dev build`. The deleted tail (`cp -r`, a glob, `2>/dev/null`, `;` sequencing, `rm -f`, `cd`, `zip -r`, `-x`) was measured on this checkout to be a no-op, and it was the single reason a Windows runner could not build the plugin: pnpm runs script bodies through `cmd.exe` there, and `zip` is absent from the runner image.
- **A blocking `Verify (Windows)` leg exists in `ci.yml`** — `windows-latest`, Node 20, `permissions: contents: read`, `timeout-minutes: 20`, steps `Checkout → Setup pnpm → Setup Node → Gate → Install dependencies → Typecheck → Lint → Test → Build`, with `shell: bash` on all six run steps and no `continue-on-error` or job-level `if:`.
- **The D-10 no-secret-material gate moved into a permanent home** in its three-arm form, and was demonstrated firing at status 0, 1 and 2 rather than assumed.
- **`.github/scripts/check-ci-windows-job.sh`** turns the job's shape into 14 runnable assertions, verified to exit 1 and name the failing assertion when `ci.yml` is mutated.
- **`.gitattributes`** (`* text=auto eol=lf`) landed as prophylaxis, with its own reasoning in the file.
- **CLAUDE.md's five false `dist/drift.zip` claims are corrected** against what `release.yml` and `ci.yml` actually do.
- **CI-01 and CI-03 are owned by Phase 5** in the traceability table and in both rollups, both still `Pending`.

## Task Commits

1. **Task 1: Prove Finding C-1, reduce the build script, land .gitattributes** — `0b7e326` (build)
2. **Task 2: Author the blocking windows-latest job with the three-arm secret gate** — `c05b5e9` (ci)
3. **Task 3: Re-target CI-01 and CI-03 into Phase 5** — `ec654cc` (docs)

## Zip Parity — the BEFORE/AFTER measurement (Task 1, steps 1-3)

Assumption A7 required this to be re-measured here rather than trusted from `05-RESEARCH.md`. Both artifacts were built from a clean `rm -rf dist` on this checkout and copied to scratch paths outside the repo.

### BEFORE — the original `pnpm build` (caido-dev build + the POSIX tail)

`unzip -Z1 before.zip | sort`:

```
backend/
backend/assets/
backend/assets/mcp-server.mjs
backend/index.js
frontend/
frontend/index.css
frontend/index.js
manifest.json
```

`unzip -l before.zip`:

```
  Length      Date    Time    Name
---------  ---------- -----   ----
        0  08-20-2026 14:45   frontend/
  2275965  08-20-2026 14:45   frontend/index.js
    19523  08-20-2026 14:45   frontend/index.css
        0  08-20-2026 14:45   backend/
   151677  08-20-2026 14:45   backend/index.js
        0  08-20-2026 14:45   backend/assets/
    31795  08-20-2026 14:45   backend/assets/mcp-server.mjs
      714  08-20-2026 14:45   manifest.json
---------                     -------
  2479674                     8 files
```

### AFTER — `pnpm exec caido-dev build` alone

`unzip -Z1 after.zip | sort`:

```
backend/
backend/assets/
backend/assets/mcp-server.mjs
backend/index.js
frontend/
frontend/index.css
frontend/index.js
manifest.json
```

`unzip -l after.zip`:

```
  Length      Date    Time    Name
---------  ---------- -----   ----
        0  08-20-2026 12:45   backend/
        0  08-20-2026 12:45   backend/assets/
    31795  08-20-2026 12:45   backend/assets/mcp-server.mjs
   151677  08-20-2026 12:45   backend/index.js
        0  08-20-2026 12:45   frontend/
    19523  08-20-2026 12:45   frontend/index.css
  2275965  08-20-2026 12:45   frontend/index.js
      714  08-20-2026 12:45   manifest.json
---------                     -------
  2479674                     8 files
```

### The comparison

- `diff <(unzip -Z1 before.zip | sort) <(unzip -Z1 after.zip | sort)` → **empty. Entry-name sets identical**, 8 entries each.
- Name+length pairs, sorted and diffed → **empty. Every entry's uncompressed byte length matches**, total 2,479,674 both sides:

```
backend/ 0
backend/assets/ 0
backend/assets/mcp-server.mjs 31795
backend/index.js 151677
frontend/ 0
frontend/index.css 19523
frontend/index.js 2275965
manifest.json 714
```

- Extra evidence beyond what the plan required — both archives extracted and hashed. **All five files byte-identical:**

```
3cac4ed635f40647aebd7c47abb3d5e0ba798db3c8842e6a9480fd2936d4f1a3  ./backend/assets/mcp-server.mjs
6e48a18d342b3519ae5ec881208fd906e45620a03c66b0eab7f7131f7e0c5045  ./backend/index.js
7a0c6ad1def75bb51fd5126f77b824d76788ef3162fc9b22230550fd00177bb0  ./frontend/index.css
06a60f37402147d788577332f19610ca8f744bfb516cc05602ae635fd4c5c65c  ./frontend/index.js
5e5e60e8eb024f95c83037ecb2df74d2f3656470a010fc0bd4a8cd80388bcd32  ./manifest.json
```

**The only differences** are central-directory entry ordering (BEFORE is `zip -r`'s directory-walk order, AFTER is JSZip's) and the timestamp encoding (BEFORE writes local time 14:45, AFTER writes 12:45 — the same instant, different TZ handling by the two writers). `release.yml` consumes the artifact and not the way it was zipped: it signs the bytes with `openssl pkeyutl -rawin` and reads the version with `unzip -p plugin_package.zip manifest.json`. Neither reads entry order or timestamps.

### Contingency tier taken

**Tier 0 — parity held on the first measurement.** No tier of the ladder was needed. `caido.config.ts` was NOT modified, no copy step was re-added to `package.json`, and no packaging dependency was added. Stated explicitly because silence is not the same claim.

Both narrowing facts from the plan were re-verified rather than trusted:
- `@caido-community/dev@0.1.6` declares `jszip@3.10.1` as a dependency and its `dist/cli.js` names `plugin_package.zip` on 4 lines — it emits the zip itself, which is why the deleted tail had to `rm -f` it first.
- `packages/backend/assets/` holds exactly one flat file, `mcp-server.mjs` (31,795 bytes), no nesting and no dotfiles — so `caido.config.ts`'s `./packages/backend/assets/**/*` glob is a superset of the tail's `cp -r`.

## Secret gate — demonstrated at all three statuses (Task 2)

Run against the finished `ci.yml` and the probe workflow, using the same `grep -nE` the job runs. Executed under `bash` explicitly (the local interactive shell is zsh, where `status` is a read-only special variable — worth knowing before anyone re-runs these by hand).

| Arm | Scan targets | Expected | Observed |
|-----|--------------|----------|----------|
| Arm 2 — clean | `ci.yml` + `windows-llrt-probe.yml` | 1 (pass) | **status=1** |
| Arm 1 — seeded token reference | scratch copy of `ci.yml` with a `CAIDO_`+`TOKEN` literal appended | 0 (fail) | **status=0**, matched at line 200 |
| Arm 1 — seeded secrets expression | scratch copy with a `secret`+`s`+`.PRIVATE_KEY` literal appended | 0 (fail) | **status=0**, matched at line 200 |
| Arm 3 — missing target | `ci.yml` + a nonexistent path | 2 (fail) | **status=2**, `grep: ...: No such file or directory` |

Arm 2 returning 1 over the finished file — comments included — is also the proof that the pattern is **self-non-matching against its own source text**. Both seed literals were assembled from fragments so no scratch or committed file ever carries the text the gate detects.

The gate deliberately has **no `test -f` pre-check**, diverging from the probe workflow's copy. That is what makes the third arm the live missing-target guard: when Phase 9 deletes `windows-llrt-probe.yml`, grep returns 2 and this job fails loudly, instead of the scan silently narrowing to one file.

## Job and step names, as shipped

Parsed back out of `ci.yml` with a YAML loader rather than read by eye:

- **job key:** `windows` — **name:** `Verify (Windows)` — **runs-on:** `windows-latest`
- **permissions:** `{contents: read}` — **timeout-minutes:** `20` — no `continue-on-error`, no job-level `if:`
- **steps, in order:** `Checkout`, `Setup pnpm`, `Setup Node`, `Gate: no secret material in CI configuration`, `Install dependencies`, `Typecheck`, `Lint`, `Test`, `Build`
- 6 `run:` steps, all 6 with `shell: bash`
- Setup pnpm at line 109, Setup Node at line 112 — the ordering asserted by line number, not by eye
- The `verify` job's keys are unchanged: `name`, `runs-on`, `steps`, `strategy`

## Static gate output

`bash .github/scripts/check-ci-windows-job.sh` → exit 0, 14 assertions:

```
PASS  exactly one Windows runner declaration
PASS  the leg is blocking — no continue-on-error setting
PASS  the Node setup cache default is left alone
PASS  a run ceiling is pinned exactly once
PASS  every run step in the Windows job pins bash
PASS  pnpm action pin matches the ubuntu job
PASS  node setup action pin matches the ubuntu job
PASS  the probe workflow is still a scan target
PASS  Setup pnpm precedes Setup Node inside the Windows job (109 < 112)
PASS  no job-level conditional on the Windows job
PASS  secret gate arm 2 — the scanned files are clean (status 1)
PASS  secret gate arm 1 — a seeded token reference is caught (status 0)
PASS  secret gate arm 1 — a seeded secrets expression is caught (status 0)
PASS  secret gate arm 3 — a missing scan target fails (status 2)
```

Negative-proof: run against a copy of the tree with `continue-on-error: true` appended to `ci.yml`, the script printed `1 assertion(s) failed.` and exited **1**. A gate that has never failed is not known to be a gate.

## Files Created/Modified

- `.gitattributes` *(created)* — `* text=auto eol=lf`, with a header recording that it is prophylactic and why it is landed anyway.
- `.github/scripts/check-ci-windows-job.sh` *(created)* — 14 assertions over the Windows job's shape and the secret gate's three arms.
- `package.json` *(modified)* — `scripts.build` reduced to `caido-dev build`.
- `.github/workflows/ci.yml` *(modified)* — +129 lines: the `windows` job. The `verify` job, `on:` and `concurrency:` untouched.
- `CLAUDE.md` *(modified)* — all five `dist/drift.zip` references corrected.
- `.planning/REQUIREMENTS.md` *(modified)* — CI-01/CI-03 re-targeted, Phase 9 rollup rewritten, new dated pull-forward section.

## CLAUDE.md — the five corrections

`grep -c 'drift\.zip' CLAUDE.md` was **5** before and is **0** after. Corrected names were derived by reading `.github/workflows/release.yml` and `.github/workflows/ci.yml`, not taken from the plan:

| Line | Section | Was | Now |
|------|---------|-----|-----|
| 72 | Configuration | "`dist/drift.zip` — final deliverable created by the `build` script … assets copied post-build" | `dist/plugin_package.zip` is what `release.yml` signs and publishes; `caido-dev build` emits both `dist/plugin_package/` and the zip itself, assets arriving through `caido.config.ts`'s glob rather than a post-build copy |
| 85 | Release / Signing | "Uploads `dist/drift.zip`" | `dist/plugin_package.zip` (`ci.yml:67`) |
| 88 | Release / Signing | "Signs `dist/drift.zip`" | `dist/plugin_package.zip` (`release.yml:57-60`) |
| 89 | Release / Signing | "Produces `dist/drift.zip.sig`" | `dist/plugin_package.zip.sig` |
| 91 | Release / Signing | "both `drift.zip` and `drift.zip.sig`" | `plugin_package.zip` and `plugin_package.zip.sig` (`release.yml:76`) |

The four release-section lines were not merely stale but **factually false** — nothing in the repo has ever produced `drift.zip`; it was named only by the `rm -f` that Task 1 deleted. No "formerly" or "renamed from" parenthetical was written anywhere: the acceptance criterion is a raw whole-file grep with no comment syntax to strip, so a migration note would have failed the task. The rename lives in the commit body.

## Decisions Made

1. **Tier 0 recorded explicitly.** Parity held first try, so the contingency ladder was not entered. Recorded as a stated claim rather than left implicit.
2. **Content SHA-256 comparison added** beyond the plan's entry-name + byte-length requirement. Equal lengths do not prove equal bytes, and `release.yml` signs the bytes.
3. **No `test -f` pre-check in the gate.** The plan's described shape starts at `status=0`, and the plan's stated intent is that Phase 9's deletion "trips the third arm". A `test -f` loop would have shadowed the third arm and satisfied the letter while defeating the intent. The divergence from the probe's copy is commented in `ci.yml`.
4. **`package-manager-cache` kept out of `ci.yml` entirely** — not in config, not in a comment. The Setup pnpm comment states the mechanism ("the Node setup action's pnpm cache default is deliberately left at its shipped value, and it auto-enables pnpm caching whenever package.json carries a packageManager field") and the option name lives in the commit body and this SUMMARY.
5. **Phase 9's rollup line names neither ID.** The acceptance criterion reads "contains neither CI-01 nor CI-03 and is not an empty list — it carries a sentence explaining the pull-forward." The first draft explained the move by naming both IDs, which fails the literal grep; it was reworded to explain the move without them.
6. **`.planning/milestone.lock` left untracked.** It is a session-scoped orchestrator lock carrying a pid and session id — runtime state, not this plan's artifact, and not something to publish in a public repo.

## Deviations from Plan

None — plan executed exactly as written. Every step of all three tasks ran as specified, the expected Tier 0 outcome held, and no deviation rule was invoked.

## Issues Encountered

**1. `status` is read-only in zsh.** The first attempt to demonstrate the gate's three arms ran in the harness's default zsh and aborted with `read-only variable: status` before printing anything. Not a defect in the gate — the workflow step runs under `bash --noprofile --norc -eo pipefail`, where `status` is an ordinary variable. Re-run under `bash -c`; all three arms then behaved as designed. Noted here because anyone re-running these checks by hand from a zsh prompt will hit the same wall.

**2. `grep -c` counts lines, not occurrences.** The plan cited "8 hits" for `plugin_package.zip` in caido-dev's `cli.js`; `grep -c` returns 4 and `grep -o | wc -l` returns 4 as well. The number differs from the plan's, but the fact it was cited for — that `caido-dev` emits the zip itself — is confirmed, independently corroborated by `jszip@3.10.1` in its dependency list and by the AFTER build producing `dist/plugin_package.zip` with no shell tail at all.

## Verification Results

| # | Check | Result |
|---|-------|--------|
| 1 | `rm -rf dist && pnpm build` exits 0, produces `dist/plugin_package.zip` containing `backend/assets/mcp-server.mjs` | **PASS** |
| 2 | BEFORE/AFTER zip listings recorded with actual entry names and byte lengths | **PASS** (above) |
| 3 | `bash .github/scripts/check-ci-windows-job.sh` exits 0 | **PASS** (14/14) |
| 4 | Secret gate demonstrated at all three statuses | **PASS** (1 / 0 / 2, plus a second arm-1 form) |
| 5 | `pnpm exec vitest run` → 278 passed, 31 files, 0 failures; `pnpm -r typecheck` exit 0; `pnpm lint` exit 0 | **PASS** (baseline held) |
| 6 | `git status --porcelain` captured and discriminated with `test -z` | **PASS** — only `?? .planning/milestone.lock`, the orchestrator's session lock |

Task-level acceptance criteria: 10/10 for Task 1, 10/10 for Task 2, 7/7 for Task 3.

## Explicit Non-Claim

**No `windows-latest` run has been executed.** This plan authored the leg and proved locally, on macOS, everything that is provable without a runner. Nothing here asserts that the job is green, that `pnpm install --frozen-lockfile` completes on a Windows runner (assumption A3, unmeasured), that the 5,000 ms child-process timeouts in `mcp-server.transport.test.ts` survive a slower runner, or that 20 minutes is the right ceiling. Plan 05-06 pushes, reads the real run, and records the run URL, the per-step conclusions and the log line proving the gate's mechanism.

## Next Phase Readiness

Ready for the rest of Phase 5. The net exists and will run on the first push, which means 05-04 and 05-05's rewrite lands with Windows coverage rather than behind it.

- **05-06 is unblocked** — its precondition (a portable `pnpm build` and an authored leg) is met. It owns the timeout-minutes replacement and the run evidence.
- **Expect the first run to be red, and read it rather than retry it.** The two named candidates are the install step (long-path / optional-dep trouble, A3) and process-creation timing in the spawn tests — not line endings, which `.gitattributes` and D-09's measurements already cover.
- **Phase 9 inherits a live trigger:** deleting `windows-llrt-probe.yml` returns grep status 2 and fails the gate's third arm. That is intentional and must be met by re-pointing the scan-target list, not by deleting the gate.

---
*Phase: 05-kill-shell-wrappers*
*Completed: 2026-08-20*

## Self-Check: PASSED

All created files verified present on disk; all four commit hashes verified present in git log.
