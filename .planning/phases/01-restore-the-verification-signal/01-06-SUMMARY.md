---
phase: 01-restore-the-verification-signal
plan: 06
subsystem: ci
tags: [github-actions, ci-matrix, node-26, revert-proof, lint-gate, branch-protection, integration-proof]

# Dependency graph
requires:
  - "01-04 — a green local gate (lint 0/0, 23 files / 131 tests) so any CI red is a real finding, not inherited debt"
  - "01-05 — `ci.yml` must contain the four-leg matrix and the Lint step before a push can exercise them"
provides:
  - "Three recorded CI runs proving the matrix runs, discriminates by Node version, and fails on lint errors"
  - "SIG-01d — Node 20 leg green on real CI (20.20.2); the one leg with no local binary"
  - "SIG-03e — a deliberate lint error turns all four legs red at the Lint step, Test and Build skipped"
  - "SIG-03f — the revert-proof: Node 26 red at Test with the historical 5-failure signature, Node 20/22/24 green"
  - "SIG-03g — exactly one `drift-plugin` artifact, no 409"
  - "Empirical proof that `fail-fast: false` works — sibling legs completed AFTER the failing leg and concluded success"
  - "Corrected A7 finding: `main` has no branch protection and no rulesets at all"
affects: [02, 03, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration proof by throwaway scratch branch: push, observe, record run URL, delete locally and remotely"
    - "Four-part local pre-flight before pushing a revert-proof, so a botched revert is caught before it burns a CI run"
    - "Targeted `git add <path>` instead of `git add -A` on scratch branches pushed to a public remote"

key-files:
  created:
    - .planning/phases/01-restore-the-verification-signal/01-06-SUMMARY.md
  modified:
    - .planning/STATE.md

key-decisions:
  - "Pushed `scratch/ci-proof-matrix` at the phase branch's exact commit instead of pushing `fix/security-hotfixes` itself — the plan asked for the latter, the execution authorization explicitly forbade it. Same SHA, same proof, no phase branch on the public remote."
  - "Scratch branches named `scratch/ci-proof-*` rather than the plan's `gsd/phase-01-proof-*`, per the explicit authorization to name them unmistakably throwaway on a public repo. Both globs asserted empty at teardown."
  - "A7's premise measured false first-hand: `main` has no classic protection and no rulesets, so there is no required-check name to rename. Recorded as a NEW user decision, not a rename cleanup. No protection created — outside authorization."
  - "`IMPROVEMENT-PLAN.md` left untracked rather than committed or deleted: it is a user file outside this plan's `files_modified`. Every scratch commit used targeted `git add`, so it was never staged and never pushed to the public remote."

patterns-established:
  - "A CI claim is recorded with its run URL, per-leg conclusion, per-step conclusion and the log line that proves the mechanism — not just a green tick"
  - "Version-discrimination proofs assert the negative legs stay green, because an all-red run discriminates nothing"

requirements-completed: [SIG-01, SIG-02, SIG-03]

# Metrics
duration: 21min
completed: 2026-08-12
---

# Phase 1 Plan 06: Prove the Matrix on Real CI Summary

**Three real CI runs turned every remaining Phase 1 claim from static YAML parsing into measured fact — including the one that matters most: with only the storage guard and the vitest shim removed, `Verify (Node 26)` goes red at the Test step with the exact historical five-failure signature while Node 20, 22 and 24 stay green.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-08-12T14:11:08Z
- **Completed:** 2026-08-12T14:32:00Z
- **Tasks:** 3 of 3
- **Files modified:** 2 (1 created, 1 modified) — no source file touched

## The Three CI Runs

| # | Purpose | Branch (deleted) | Commit | Run URL | Conclusion |
|---|---|---|---|---|---|
| 1 | SIG-01d, SIG-03g — first real matrix run | `scratch/ci-proof-matrix` | `1608051` | https://github.com/six2dez/drift/actions/runs/31605493233 | **success** |
| 2 | SIG-03e — a lint error must fail the job | `scratch/ci-proof-lint` | `49f4a9d` | https://github.com/six2dez/drift/actions/runs/31605906945 | **failure** (intended) |
| 3 | SIG-03f — the revert-proof | `scratch/ci-proof-node26` | `4e35fbc` | https://github.com/six2dez/drift/actions/runs/31606402559 | **failure** (intended, Node 26 only) |

### Run 1 — per-leg conclusions

| Leg | Conclusion | Node resolved | Test result |
|---|---|---|---|
| `Verify (Node 20)` | **success** | 20.20.2 | 23 files / 131 tests / 0 failed |
| `Verify (Node 22)` | **success** | 22.23.1 | 23 files / 131 tests / 0 failed |
| `Verify (Node 24)` | **success** | 24.19.0 | 23 files / 131 tests / 0 failed |
| `Verify (Node 26)` | **success** | 26.7.0 | 23 files / 131 tests / 0 failed |

Step order on all four legs, read from the API not from the YAML: `Typecheck` (6) → `Lint` (7) → `Test` (8) → `Build` (9). Counts are identical across legs and identical to the local Node 26 run, so the legs provably exercise the same code paths.

### Run 2 — per-leg conclusions

| Leg | Conclusion | Failed at | Test | Build |
|---|---|---|---|---|
| `Verify (Node 20)` | **failure** | `Lint` (step 7) | skipped | skipped |
| `Verify (Node 22)` | **failure** | `Lint` (step 7) | skipped | skipped |
| `Verify (Node 24)` | **failure** | `Lint` (step 7) | skipped | skipped |
| `Verify (Node 26)` | **failure** | `Lint` (step 7) | skipped | skipped |

`Typecheck` was **green** on every leg before `Lint` failed, so the failure is attributable to the lint gate alone. Artifact count for this run: **0**.

### Run 3 — per-leg conclusions (the proof)

| Leg | Conclusion | Failed at | Detail |
|---|---|---|---|
| `Verify (Node 20)` | **success** | — | full pipeline through Build |
| `Verify (Node 22)` | **success** | — | full pipeline through Build |
| `Verify (Node 24)` | **success** | — | full pipeline through Build + artifact upload |
| `Verify (Node 26)` | **failure** | `Test` (step 8) | `Typecheck` and `Lint` both **green** first |

## Accomplishments

- **SIG-03f is proven, not asserted.** This is the assertion VALIDATION.md marks "the single most important proof in this phase" and "this phase is not done without it". On `scratch/ci-proof-node26`, with only the guard and the shim removed, the Node 26 leg failed at `Test` with `Test Files 1 failed | 21 passed (22)` / `Tests 5 failed | 120 passed (125)`, the only failing file being `packages/frontend/src/views/ChatView.mount.test.ts`. Node 20, 22 and 24 all concluded `success`. The blind spot is closed and the new matrix leg is what closes it.
- **The failure signature matches the documented history exactly.** RESEARCH.md predicted four "expected 1 call, got 0" plus one asserting the `getItem` TypeError. CI produced exactly that: 4 × `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` and 1 × `AssertionError: expected 'TypeError: Cannot read properties of …' to be 'boom'`. This is the original bug reproduced, not merely *a* failure.
- **SIG-01d closed — the leg no machine here can run.** Node 20 resolved to **20.20.2** and passed all of Typecheck, Lint, Test and Build. This also settles the open question from 01-05 decision #4: **ESLint 10's engine range `^20.19.0 || ^22.13.0 || >=24` is satisfied on the Node 20 leg** — the Lint step succeeded, so the leg does not need deleting.
- **SIG-03e closed — the gate bites in CI, not just locally.** 01-04 proved `pnpm lint` exits 1 locally; this proves the job acts on that exit code. The CI log names the probe by path and rule: `/home/runner/work/drift/drift/__lint-negative-probe.ts  1:7  error  'unused' is assigned a value but never used  @typescript-eslint/no-unused-vars`, then `Process completed with exit code 1`. No `continue-on-error` swallowed it, and `Test`/`Build` never ran.
- **SIG-03g closed — the artifact does not 409.** Run 1 produced **exactly one** `drift-plugin` artifact (600,922 bytes). `Upload plugin artifact` ran on the Node 24 leg and was `skipped` on the other three, confirming the single-leg guard.
- **`fail-fast: false` verified empirically, not by reading the YAML.** In run 3 Node 26 completed (failure) at `14:22:59Z`; Node 24 completed (success) at `14:23:00Z` and Node 22 at `14:23:02Z` — **after** the failing leg, and neither was `cancelled`. Without this the three green legs would be indistinguishable from cancelled ones and the discrimination would be worthless.
- **Nothing was left behind on a public remote.** All three scratch branches deleted locally and remotely; `git ls-remote --heads origin` now lists **only `main`**.

## Task Commits

1. **Task 1: First real matrix run + the A7 hand-off** — `9a6ce4e` (docs) — STATE.md: corrected A7 finding
2. **Task 2: SIG-03e lint-failure proof** — *verification only, no tracked file change, no commit* (its artifact is run 31605906945, recorded above)
3. **Task 3: SIG-03f revert-proof** — `0c6ed05` (docs) — STATE.md: Node >= 25 blocker resolved

Following the 01-04 Task 3 precedent, a verification-only task with no file change gets no empty commit. The two scratch-branch commits (`49f4a9d`, `4e35fbc`) were deliberately destroyed with their branches — they exist only in the run records.

## A7 — Branch Protection: outcome (c), with a corrected premise

**Assumption A7's premise is false.** It assumed branch protection on `main` required the check named `Typecheck, test, build`, so the 01-05 job rename would leave it matching nothing and `main` merge-unguarded. Measured read-only:

| Query | Result |
|---|---|
| `GET repos/six2dez/drift/branches/main/protection` | **404 "Branch not protected"** |
| `GET repos/six2dez/drift/rulesets` | **`[]`** |
| `GET repos/six2dez/drift/branches/main` | `protected: false` |

`main` has **no** classic branch protection and **no** rulesets. There was never a required-check name to update, so the rename broke nothing — the plan's acceptance outcome **(c)**.

But the corrected framing matters: `main` is not "unguarded because of a rename", it is **unguarded and always has been**. Adding protection is therefore a **new decision for the user**, not a cleanup task. If they want it, the four check names — now proven to run and pass on a real push — are:

```
Verify (Node 20)
Verify (Node 22)
Verify (Node 24)
Verify (Node 26)
```

**Not actioned.** Creating or modifying branch protection was outside this execution's authorization. Recorded in STATE.md Blockers as an open user decision.

## Verification Evidence

### Local pre-flight before pushing the revert-proof (all four required to hold)

| Check | Required | Measured |
|---|---|---|
| `pnpm lint` on the reverted tree | exit `0` | **exit `0`** |
| `pnpm -r typecheck` | exit `0` | **exit `0`** |
| Node **26.7.0** `pnpm exec vitest run` | exactly 5 failures, all in `ChatView.mount.test.ts` | **`Tests 5 failed \| 120 passed (125)`**, `Test Files 1 failed \| 21 passed (22)`, sole file `ChatView.mount.test.ts` |
| Node **22.23.2** direct vitest | `0 failed` | **`125 passed (125)` / `22 passed (22)`** |
| Node **24.13.0** direct vitest | `0 failed` | **`125 passed (125)` / `22 passed (22)`** |

The local Node 26 result (`5 failed | 120 passed (125)`) matched the CI Node 26 result **exactly**, so the pre-flight was a true dry run rather than a hopeful one. The lint check is the load-bearing one: keeping the `settings.ts` `let token: string;` fix is what kept `Lint` green so the failure could land at `Test`.

### Revert scope — exactly five paths, nothing else

```
packages/frontend/src/__storage-shim.test.ts  | 63 ---------- (deleted)
packages/frontend/src/stores/settings.test.ts | 37 ---------- (3 guard `it` blocks)
packages/frontend/src/stores/settings.ts      | 26 +--------- (guard removed, unguarded read restored)
vitest.config.ts                              |  1 -          (setupFiles line)
vitest.setup.ts                               | 80 ---------- (deleted)
5 files changed, 2 insertions(+), 205 deletions(-)
```

The 2 insertions are the unguarded `window.localStorage.getItem(...)` read and its `raw === null` guard. `environmentMatchGlobs` was **not** restored (inert, per the plan). `let token: string;` was **kept**.

### Teardown

| Check | Result |
|---|---|
| `git ls-remote --heads origin 'scratch/*'` | *(empty)* |
| `git ls-remote --heads origin 'gsd/phase-01-proof*'` | *(empty)* |
| `git branch --list 'scratch/*' 'gsd/phase-01-proof*'` | *(empty)* |
| `git ls-remote --heads origin` (all) | **`main` only** |
| Run records survive branch deletion | run 31605493233 still `success`; artifact count still `1` |

### Phase branch after all three proofs

| Check | Result |
|---|---|
| `git branch --show-current` | `fix/security-hotfixes` |
| `git status --porcelain` | only the pre-existing `?? IMPROVEMENT-PLAN.md` |
| `vitest.setup.ts`, `__storage-shim.test.ts` | both **restored** |
| `readBrowserStorageItem` in `settings.ts` | present (`:34` definition, `:93` call site) |
| `setupFiles` in `vitest.config.ts` | present (`:20`) |
| `__lint-negative-probe.ts` | **absent** |
| `pnpm lint` | exit **`0`** |
| `pnpm -r typecheck` | exit **`0`** |
| `pnpm exec vitest run` (Node 26.7.0) | **23 files / 131 tests / 0 failed** |

## Requirement Status — SIG-01, SIG-02 and SIG-03 all close here

Every sub-criterion that prior plans deferred for want of a real CI run is now measured.

| Sub-criterion | Status | Evidence |
|---|---|---|
| SIG-01a/b/c — suite green on Node 26 / 22 / 24 | ✅ | 01-04 locally; re-confirmed on CI run 1 |
| **SIG-01d** — suite green on Node **20** | ✅ **closed here** | run 1, `Verify (Node 20)` success, Node 20.20.2, 131 tests |
| SIG-01e/f/g/h/i — guard + shim unit tests | ✅ | 01-01 / 01-02 |
| SIG-02a-d — real ESLint, flat config, `--max-warnings 0` | ✅ | 01-03 / 01-04 |
| SIG-02e — no `--fix` on the CI path | ✅ | 01-05 |
| SIG-02f — the command exits 1 on a real error | ✅ | 01-04 |
| **SIG-02 "CI fails on lint errors"** | ✅ **closed here** | run 2, four legs failure at `Lint` |
| SIG-03a/b/c/d — triggers, matrix, fail-fast, step order | ✅ | 01-05 statically; all four re-confirmed dynamically here |
| **SIG-03e** — a lint failure fails the job in reality | ✅ **closed here** | run 2 |
| **SIG-03f** — the Node 26 leg would have caught the original bug | ✅ **closed here** | run 3 |
| **SIG-03g** — artifact upload does not 409 | ✅ **closed here** | run 1, exactly one `drift-plugin` |

`requirements-completed: [SIG-01, SIG-02, SIG-03]`. Unlike 01-03/01-04/01-05, which all correctly declined to close anything, every half of every requirement is now backed by a recorded run.

## Deviations from Plan

### 1. [Rule 3 - Blocking] The plan says push the phase branch; the execution authorization forbids it

- **Found during:** Task 1
- **Issue:** Plan task 1 step 2 is `git push -u origin "$(git branch --show-current)"` — i.e. push `fix/security-hotfixes`. The execution authorization is explicit: "Do NOT push `fix/security-hotfixes`."
- **Fix:** Created `scratch/ci-proof-matrix` pointing at the **exact same commit** (`1608051`, verified byte-identical SHA against `fix/security-hotfixes` before pushing) and pushed that instead. CI ran on the identical tree, so every SIG-01d / SIG-03g conclusion is unchanged; only the ref name differs. Branch deleted after the run was recorded.
- **Files modified:** none.

### 2. [Deviation - naming] Scratch branches renamed from `gsd/phase-01-proof-*` to `scratch/ci-proof-*`

- **Found during:** Task 1
- **Issue:** The plan names the branches `gsd/phase-01-proof-lint` / `gsd/phase-01-proof-node26`. The authorization requires names that are unmistakably throwaway on a **public** repo, giving `scratch/ci-proof-<purpose>` as the form.
- **Fix:** Used `scratch/ci-proof-matrix`, `scratch/ci-proof-lint`, `scratch/ci-proof-node26`. The plan's teardown assertion is a glob check, so **both** globs were asserted empty at the end — the plan's literal `gsd/phase-01-proof*` check passes vacuously and the real `scratch/*` check passes substantively.
- **Files modified:** none.

### 3. [Plan-spec defect] The "`git status --porcelain` is empty" assertions are unsatisfiable

- **Found during:** Task 1
- **Issue:** The plan asserts a globally empty `git status --porcelain` five times, but `IMPROVEMENT-PLAN.md` has been untracked at the repo root since before this phase began (flagged in STATE.md Session Continuity and again in 01-05's coordination notes). The assertion cannot hold without committing or deleting a user file this plan does not own — and the plan's task 3 uses `git add -A`, which would have **published that file to a public remote**.
- **Fix:** Left the file untouched and replaced `git add -A` with targeted `git add <path>` on every scratch commit. Verified after each commit that `git status --short` showed the file still as `??` and it never entered a pushed tree. The status assertions were satisfied in their path-scoped form: the only entry is the pre-existing untracked file, and every tracked path is clean.
- **Files modified:** none. STATE.md's Session Continuity note was rewritten to say what was actually done and to name the three options (commit / delete / gitignore) as an open decision.

### 4. [Corrected premise] A7 is not a rename cleanup

Covered in its own section above. Not a deviation in execution — the plan explicitly anticipated outcome (c) — but the *framing* changed: A7 assumed protection existed and needed renaming; the measurement shows none exists, which converts a cleanup task into a new user decision. Recorded that way rather than silently ticking outcome (c).

### Not deviations

- **No source file was modified on the phase branch.** The five-file revert lived only on a scratch branch and died with it; the phase branch was verified byte-restored afterwards.
- **Task 2 produced no commit** because it produced no tracked file change, following the 01-04 Task 3 precedent. Its evidence is the run record.

## Issues Encountered

**1. `${PIPESTATUS[0]}` does not work in zsh.** The first lint pre-flight measurement piped `pnpm lint` into `tail` and tried to read `${PIPESTATUS[0]}`, which is a bash array; zsh uses `$pipestatus` (lowercase). The variable came back empty, which would have left the exit code unmeasured. Re-ran redirecting to a file and reading `$?` directly. The same shell-difference class as 01-04's aliased-`rm` finding.

**2. `gh run view --log` output carries ANSI escapes and a `<step>\t<timestamp>` prefix.** Naive greps for `Tests  ` silently matched nothing even though the line was present. Stripped escapes with `sed -E 's/\x1b\[[0-9;]*m//g'` before asserting. Worth noting because a grep that returns nothing looks identical to a proof that failed — the exact false-pass shape this phase exists to remove.

**3. No `node_modules` install needed and no Node 20 binary exists locally** (only 22.23.2, 24.13.0, 26.7.0). That is precisely why SIG-01d was CI-only, and it is now the one leg whose only evidence is a CI run — which is the correct and intended place for it.

## Known Stubs

None. This plan wrote no code and left no placeholder. Its only tracked outputs are this SUMMARY and two STATE.md blocker edits, both of which record measured facts with their run URLs.

## Threat Flags

None — no new security surface. No endpoints, auth paths, file-access patterns or schema changes.

Threat register dispositions applied:

- **T-01-27** (scratch branches surviving on `origin`) — *mitigated.* Three branches created, three deleted locally and remotely. `git ls-remote --heads origin` returns **`main` only**. Neither branch was merged and no PR was opened.
- **T-01-28** (SIG-03f skipped or self-reported because it is awkward) — *mitigated.* Executed in full, with the run URL, per-leg conclusions, per-step conclusions, the failing file, the failure counts and the four distinct assertion messages all recorded from the CI log rather than narrated.
- **T-01-29** (a botched revert making all four legs red, which discriminates nothing) — *mitigated.* The `settings.ts:78` lint fix was kept; `Lint` concluded **success** on the Node 26 leg, and the failure landed at `Test`. The four-part local pre-flight ran and matched CI exactly before anything was pushed.
- **T-01-30** (branch protection requiring a retired check name) — *measured false and recorded.* No protection and no rulesets exist. No protection was created — outside authorization.
- **T-01-31** (the Node 26 leg cancelled before recording a result) — *mitigated.* Conclusion is `failure`, not `cancelled`, and two sibling legs completed **after** it and still concluded `success` — a direct measurement of `fail-fast: false` rather than an inference from the YAML.
- **T-01-32** (scratch branches triggering secret-bearing workflows) — *held as accepted.* Only `CI` ran on all three branches; `release.yml` is `workflow_dispatch`-only and `main`-gated, and no run consumed a secret. Confirmed additionally by the targeted-`git add` handling of the untracked `IMPROVEMENT-PLAN.md`, which kept an unreviewed local document off the public remote.
- **T-01-SC** (package installs) — *n/a.* This plan installed nothing.

## Next Phase Readiness

**Phase 1 is complete and its central claim is now evidence-backed.** Later phases can trust the validation signal: a version-specific regression on any of Node 20/22/24/26 will surface, and the mechanism has been observed working rather than assumed.

**Carried into Phase 2 and beyond:**

- **Open user decision — branch protection on `main`.** None exists. If wanted, require the four `Verify (Node N)` names, all proven passing. Recorded in STATE.md Blockers.
- **Open user decision — `IMPROVEMENT-PLAN.md`.** Still untracked at the repo root. Commit, delete, or `.gitignore` it. Until then, avoid `git add -A` anywhere in this repo: it would publish the file.
- **Phase 9 rewrites `ci.yml`** to add `windows-latest`. It now inherits a matrix proven to work end-to-end. Two invariants it must preserve are now measured, not just commented: the single-leg artifact guard (adding an OS axis multiplies legs, so the `if:` will need an OS term or the 409 returns) and `fail-fast: false`.
- **Phase 3's `windows-latest` spike** can reuse this plan's pattern directly — scratch branch, push, read per-step conclusions via `gh run view --json jobs`, delete.
- **Backlog 999.11** (repo-wide Prettier sweep) remains parked; untouched here.

## Self-Check: PASSED

| Claim | Result |
|---|---|
| `.planning/phases/01-restore-the-verification-signal/01-06-SUMMARY.md` | FOUND |
| `.planning/STATE.md` | FOUND |
| commit `9a6ce4e` (Task 1) | FOUND |
| commit `0c6ed05` (Task 3) | FOUND |
| CI run 31605493233 (matrix, success) | FOUND, conclusion `success` |
| CI run 31605906945 (lint proof, failure) | FOUND, conclusion `failure` |
| CI run 31606402559 (revert-proof, Node 26 only red) | FOUND, conclusion `failure` |
| `scratch/*` on origin | CONFIRMED ABSENT |
| `gsd/phase-01-proof*` on origin | CONFIRMED ABSENT |
| Phase branch green (lint 0, typecheck 0, 131 tests) | CONFIRMED |

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
</content>
</invoke>
