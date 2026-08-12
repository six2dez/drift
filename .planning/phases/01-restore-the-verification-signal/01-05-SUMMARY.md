---
phase: 01-restore-the-verification-signal
plan: 05
subsystem: ci
tags: [github-actions, ci-matrix, node-26, eslint, lint-gate, action-majors, release-signing, branch-protection]

# Dependency graph
requires:
  - "01-03 — `pnpm lint` must exist as `eslint . --max-warnings 0` before CI can invoke it"
provides:
  - "CI triggers on push and pull_request for every branch, not only main"
  - "Four-leg Node matrix 20/22/24/26 under job key `verify` with `fail-fast: false`"
  - "`pnpm lint` wired into CI between Typecheck and Test; a lint failure fails the job"
  - "The same lint step in release.yml, so a release cannot ship code CI would reject"
  - "Zero `--fix` and zero `@v4` action pins in either workflow"
  - "Four verbatim check names for the 01-06 branch-protection hand-off"
affects: [01-04, 01-06, 03, 09]

# Tech tracking
tech-stack:
  added:
    - "actions/checkout@v5 (was @v4)"
    - "actions/setup-node@v5 (was @v4)"
    - "actions/upload-artifact@v5 (was @v4)"
    - "pnpm/action-setup@v6 (was @v4)"
  patterns:
    - "Matrix legs discriminate Node versions; `fail-fast: false` keeps every leg's result recorded"
    - "Artifact upload guarded to a single leg; build still runs on all four"
    - "Concurrency keyed on `pull_request.number || github.ref` to collapse the duplicate same-repo PR run"
    - "Bare `push:` / `pull_request:` keys (null value) as the every-branch trigger form"

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml
    - .github/workflows/release.yml

key-decisions:
  - "Followed the PLAN over 01-PATTERNS.md line 412 on release.yml action majors — PATTERNS relays RESEARCH's 'leave the @v4 majors alone', the plan overrides it and pins `grep -c '@v4' == 0` as acceptance. Same fall-2026 runner removal applies to both workflows."
  - "Added explanatory comments to ci.yml (the repo's workflows previously had none), worded to avoid the literal tripwire strings `--fix`, `@v4`, `cache: pnpm` and `if: matrix.node == '24'` so the exact-count greps stay meaningful."
  - "Kept release.yml comment-free: its acceptance pins the added-line count at exactly 5, so any comment would break the assertion."
  - "Ran `actionlint` on both files as a schema check beyond PyYAML — PyYAML proves the shape, not that GitHub accepts it."

patterns-established:
  - "Every workflow step carries a Sentence-case `name:` key — asserted, not merely conventional"
  - "Non-obvious CI invariants (step ordering, single-leg upload, fail-fast) get an inline comment so a later edit cannot silently break them"

requirements-completed: []  # Neither SIG-03 nor SIG-02 fully closes here — see "Requirement Status".

# Metrics
duration: 6min
completed: 2026-08-12
---

# Phase 1 Plan 05: Wire CI to the Four-Leg Node Matrix Summary

**CI went from a single Node 20 leg gated to `main` — a configuration that could not have caught the bug this phase exists for — to a `fail-fast: false` 20/22/24/26 matrix on every branch, with `pnpm lint` between typecheck and test and zero `--fix` in either workflow.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-12T13:48:56Z
- **Completed:** 2026-08-12T13:54:27Z
- **Tasks:** 2 of 2
- **Files modified:** 2 (0 created, 2 modified)

## Accomplishments

- **The blind spot is closed on both axes.** The `branches: [main]` filter is gone from `push` *and* `pull_request`, so feature branches and fork PRs are now verified. Previously a workflow that only ran from `main` meant no branch was ever checked before merge.
- **Node 26 is now a first-class leg.** It is the only version that reproduces the Web Storage failure; under the ROADMAP's original 20/22/24 matrix this phase would have shipped green with the defect live on Current.
- **`fail-fast: false` protects the discrimination.** A cancelled leg is indistinguishable from a passing one, and version-discrimination is the entire purpose of this matrix.
- **The lint gate is wired in both workflows.** `run: pnpm lint` resolves to `eslint . --max-warnings 0` (verified against `package.json`, not assumed) — no `--fix`, no `continue-on-error`.
- **Off the deprecated actions runtime.** All four `@v4` pins bumped; zero `@v4` remains in either file. Without this, every run would carry a deprecation banner eroding exactly the signal being restored, and the release pipeline would break in fall 2026.
- **The signing pipeline is provably untouched.** It does not appear in the release diff at all.

## Task Commits

1. **Task 1: Restructure ci.yml into the four-leg Node matrix** — `ef33a7c` (chore)
2. **Task 2: Add the same lint step to release.yml and align its action majors** — `c3342c3` (chore)

## The Four New CI Check Names (required verbatim by plan 01-06 task 3)

`ci.yml` sets `jobs.verify.name: Verify (Node ${{ matrix.node }})`. GitHub renders one check per matrix leg, interpolating the explicit job name (it does not append matrix parameters when an explicit `name:` is present). The four required-check names are therefore:

```
Verify (Node 20)
Verify (Node 22)
Verify (Node 24)
Verify (Node 26)
```

**Replacing the single old name:** `Typecheck, test, build`

The job **key** is unchanged (`verify`) — only the display name changed. VALIDATION.md's SIG-03b/c assertions read `jobs.verify.strategy.*` and still resolve.

> **ACTION REQUIRED (human, outside git — assumption A7, threat T-01-21).** If GitHub branch protection on `main` requires the check named `Typecheck, test, build`, that requirement now matches nothing and `main` is left merge-unguarded. This plan cannot fix it: required-check names live in repo settings, not in git. Carried to **plan 01-06 task 3**. Rendered names above are generated from the committed YAML, not hand-typed.

## Verification Evidence

### Assertion script output (plan `<verification>` items 1 and 2)

| Script | Output |
|---|---|
| Task 1 SIG-03a/b/c/d assertions (`ci.yml`) | `SIG-03a/b/c/d OK` |
| Task 2 release-spine assertions (`release.yml`) | `release spine OK` |

Both re-run after committing, so the assertions describe committed state rather than a dirty tree.

### `ci.yml` acceptance criteria

| Check | Expected | Actual |
|---|---|---|
| `on.push` / `on.pull_request` carry no `branches` key (SIG-03a) | pass | pass |
| `jobs.verify.strategy.matrix.node` | `['20','22','24','26']` | exact match |
| `jobs.verify.strategy['fail-fast']` (SIG-03c) | `False` | `False` |
| Ordered `run` commands (SIG-03d) | install → typecheck → lint → test → build | exact match |
| `jobs.verify.name` | `Verify (Node ${{ matrix.node }})` | exact match |
| Step count vs named-step count | `9 9` | `9 9` |
| `Setup pnpm` precedes `Setup Node` (Pitfall 9) | `order OK` | `order OK` |
| `pnpm/action-setup` has no `version:` input | `no version input OK` | `no version input OK` |
| `grep -c 'cache: pnpm'` | `1` | `1` |
| `grep -c "if: matrix.node == '24'"` (Pitfall 8) | `1` | `1` |
| `grep -c -- "--fix"` (SIG-02e, workflow half) | `0` | `0` |
| `grep -c -- '--frozen-lockfile'` | `1` | `1` |
| `grep -c 'github.event.pull_request.number'` (Pitfall 10) | `1` | `1` |
| `grep -c '@v4'` | `0` | `0` |
| `actions/checkout@v5` / `setup-node@v5` / `upload-artifact@v5` / `pnpm/action-setup@v6` | `1` each | `1` each |
| Four artifact inputs preserved | all present | `drift-plugin`, `dist/drift.zip`, `if-no-files-found: error`, `retention-days: 14` |

### `release.yml` acceptance criteria

| Check | Expected | Actual |
|---|---|---|
| Ordered pnpm commands | install → typecheck → lint → test → build | exact match |
| `steps[0].name` | `Verify main branch` | `Verify main branch` |
| `grep -c '@v4'` | `0` | `0` |
| `grep -c -- "--fix"` | `0` | `0` |
| `grep -c 'caido/action-release@v1'` | `1` | `1` |
| `grep -c 'immutableCreate: true'` | `1` | `1` |
| `grep -c 'node-version: 20'` | `1` | `1` |
| `grep -c 'name: Build plugin'` | `1` | `1` |
| `grep -c '^      - name: Build$'` | `0` | `0` |

### Release-workflow diff line counts (required by plan `<output>`)

Measured with the **single-commit working-tree form** `git diff 2c169d0 -- <path>`, not `2c169d0..HEAD` — the two-dot form would pass vacuously on an uncommitted breach.

| Measurement | Expected | Actual |
|---|---|---|
| `git diff 2c169d0 -- .github/workflows/release.yml \| grep -cE '^\+[^+]'` | `5` | **`5`** |
| Signing-pipeline grep (`openssl`, `PRIVATE_KEY`, `caido/action-release`, `drift.zip.sig`, `unzip -p`, `immutableCreate`, `GITHUB_OUTPUT`) | no output | **no output** |
| `git diff --stat` — `release.yml` | small | `9 ++++++---` (6 insertions, 3 deletions) |
| `git diff --stat` — `ci.yml` | — | `39 +++++++++---------` (30 insertions, 9 deletions) |

The 5 counted added lines are exactly the 3 bumped `uses:` pins plus the 2 lint-step lines. The 6th added line is blank (a bare `+` in the diff, which `^\+[^+]` correctly does not count). **The signing pipeline does not appear in the release diff at all** — the last hunk ends at the `Test` step, well above `Sign plugin zip`.

### Beyond the plan

`actionlint` (v-installed, `/opt/homebrew/bin/actionlint`) runs clean on both files — **no output, exit 0**. PyYAML proves the parsed shape but not that GitHub accepts the file; `actionlint` independently validates the workflow schema and the `${{ }}` expressions. This confirms three constructs the plan relies on but that a YAML parser alone cannot vouch for: bare null-valued `push:` / `pull_request:` keys as the every-branch form, matrix interpolation inside a job `name:`, and the `if: matrix.node == '24'` step guard.

### Working-tree cleanliness

`git status --porcelain` (both path-scoped to the two workflows and unscoped) returns **empty** after both commits. Nothing outside `files_modified` was touched — no sibling-plan files, no stray artifacts.

## Expected Red Until 01-04 Merges

**`pnpm lint` currently exits `1`** (4 errors, 3 warnings — enumerated in 01-03-SUMMARY). The new `Lint` step is therefore *expected to fail* on this tree and will go green when sibling plan **01-04** lands its cleanup. That is the wave-2 design, not a defect in this plan.

Per explicit instruction, this plan did **not** touch those lint findings and did **not** weaken the lint step (no `--fix`, no `continue-on-error`, no `--max-warnings` relaxation) to manufacture a pass. A green lint step bought by weakening the gate is precisely the false-pass class this phase was created to eliminate.

## Requirement Status

**Neither SIG-03 nor SIG-02 closes here.** Both need integration proof on a real CI run, which is impossible from this plan: *a workflow only runs from the branch it lives on*, so nothing in `ci.yml` can be exercised until it is pushed — plan **01-06**'s job.

| Sub-criterion | Status | Owner |
|---|---|---|
| SIG-03a — triggers on every branch, both events | ✅ satisfied here | 01-05 |
| SIG-03b — matrix contains 20, 22, 24 **and 26** | ✅ satisfied here | 01-05 |
| SIG-03c — `fail-fast: false` | ✅ satisfied here | 01-05 |
| SIG-03d — step order typecheck → lint → test → build | ✅ satisfied here | 01-05 |
| SIG-02e — no `--fix` in `ci.yml` (workflow half) | ✅ satisfied here | 01-05 |
| SIG-03e — a lint failure actually turns all four legs red | ⬜ open (needs a pushed branch) | **01-06** |
| SIG-03f — the Node 26 leg would have caught the original bug | ⬜ open — *the phase's most important proof* | **01-06** |
| SIG-03g — artifact upload does not 409 | ⬜ open (observational, first real run) | **01-06** |
| SIG-02d — `pnpm lint` passes with `--max-warnings 0` | ⬜ open (4 errors, 3 warnings) | **01-04** |

`requirements-completed` is an empty list. Marking SIG-03 done on static assertions alone would assert a verified matrix that has never executed — the same defect class this phase exists to remove. `REQUIREMENTS.md` was deliberately **not** modified: nothing here is closeable, and sibling plan 01-04 shares this wave, so an edit would manufacture a merge conflict for zero benefit.

## Decisions Made

1. **PLAN over PATTERNS on `release.yml` action majors.** `01-PATTERNS.md:412` relays RESEARCH's guidance to leave that file's `@v4` pins untouched. The PLAN explicitly overrides this and pins `grep -c '@v4' .github/workflows/release.yml == 0` as acceptance. Followed the plan: the fall-2026 Node 20 runner removal applies to both workflows, and leaving the release pipeline on a dying runtime would break signing precisely when it matters. The three bumped steps are pre-signing setup and are exercised on every push by the new four-leg matrix, so they are proven long before the next release runs.
2. **Comments in `ci.yml`, none in `release.yml`.** Three invariants in `ci.yml` are silently breakable by a well-meaning future edit — the pnpm/setup-node ordering (fails with a cryptic `Unable to locate executable file: pnpm`), the single-leg artifact guard (409), and `fail-fast: false` — and Phase 9 will rewrite this same file to add `windows-latest`. Each got a short comment. Wording deliberately avoids the literal strings `--fix`, `@v4`, `cache: pnpm` and `if: matrix.node == '24'`, so the exact-count greps remain meaningful rather than being defeated by a passing mention in prose. `release.yml` got none: its acceptance pins added lines at exactly 5.
3. **Verified the CI→script link rather than assuming it.** Confirmed `scripts.lint` is `eslint . --max-warnings 0` before wiring `run: pnpm lint`. The plan's `key_links` names this edge; a CI step calling a script that does the wrong thing is the failure mode 01-03 just removed.
4. **Node 20 leg retained.** `engines.node >= 20` and `.nvmrc: 20` still promise it, even though Node 20 reached EOL 2026-04-30. Dropping it is a user-facing support decision, not a CI one. If it fails on an ESLint 10 engine error (`^20.19.0 || ^22.13.0 || >=24`), that is a finding for 01-06 to report — not something to work around by deleting the leg.
5. **No floating `current` leg**, per plan: it would make a required check non-deterministic, letting a new Node major turn `main` red with no code change.

## Deviations from Plan

None — plan executed as written. No deviation rules fired: no bugs, no missing critical functionality, no blocking issues, no architectural decisions.

Two notes that are *not* deviations:

- The PATTERNS/PLAN conflict on `release.yml` action majors was resolved in the plan's favour, which is the documented authority order (see Decisions #1).
- `actionlint` validation and the rendered-check-name derivation are additional evidence beyond the plan's required checks, not scope changes.

## Issues Encountered

**1. The worktree was spawned from the wrong base — corrected before any file was read.**

`git merge-base HEAD 0a614ee` returned `f20a3c8`, not `0a614ee`, so HEAD (`91f71f7`, `fix(release): name release assets…`) was **not** a descendant of the expected wave-1 base. The prompt flagged this as a known wave-1 harness behaviour and the reset as load-bearing. Sequence followed exactly: HEAD-safety assertion **first** (branch `worktree-agent-aa8766c5d1d24f922`, in the required namespace, not a protected ref), `git status` confirmed clean, then `git reset --hard 0a614ee`, then re-verified `git rev-parse HEAD == 0a614ee`.

This mattered materially: the pre-reset HEAD did **not** contain wave 1, so `package.json` would have carried the old `--fix`-bearing lint script and `pnpm lint` would have named an uninstalled binary. Wiring CI to it would have produced a plausible-looking but meaningless workflow.

**2. `node_modules` absent in the worktree — no install needed.**

Expected (gitignored, worktrees start bare). Unlike sibling plans, this one required no install: both tasks are YAML-only and every check is static (PyYAML, `grep`, `git diff`, `actionlint`). The one dependency-adjacent fact needed — the value of `scripts.lint` — was read straight from `package.json` via `node -p`, which needs no `node_modules`. No lint/test/build command was run, so no install was performed.

**3. Minor line-count drift in the plan's file references.** The plan describes `release.yml` as "all 74 lines"; it is 75. Every specific line reference it gave (`:23`, `:26`, `:29`, `:46`) was accurate, so this had no effect.

## Known Stubs

None. This plan introduces no placeholder values, empty returns, or unwired data paths. Both files are complete, executable workflow definitions.

## Threat Flags

None — no new security surface. This plan adds no network endpoints, auth paths, file-access patterns, or schema changes. The one boundary that *widens* (fork PRs now trigger CI) was already enumerated as **T-01-26** with disposition `accept`: `ci.yml` uses no secrets, GitHub restricts secret exposure on fork `pull_request` events by default, and `release.yml` — which holds `PRIVATE_KEY` — remains `workflow_dispatch`-only and `main`-gated. Neither property was altered here.

Threat register dispositions applied:

- **T-01-20** (a linter that edits the checkout and reports success) — *mitigated.* CI step is `run: pnpm lint` only; asserted `0` occurrences of `--fix` in both workflows using VALIDATION.md's literal unfiltered form, so no comment-wording assumption is load-bearing.
- **T-01-21** (renamed job vs branch-protection required checks) — *transferred*, as designed. Cannot be fixed from git; the four verbatim names are recorded above for 01-06 task 3, and the risk is already in STATE.md Blockers.
- **T-01-22** (modified release workflow altering the signed artifact) — *mitigated.* Signing pipeline absent from the diff entirely; targeted grep across all seven sensitive tokens returned no output using the non-vacuous single-commit working-tree form; added-line count pinned at exactly 5.
- **T-01-23** (lockfile drift on any leg) — *mitigated.* `pnpm install --frozen-lockfile` retained on every matrix leg.
- **T-01-24** (`fail-fast` cancelling the Node 26 leg) — *mitigated.* `fail-fast: false` asserted `is False`, identity-checked rather than truthiness-checked.
- **T-01-25** (four legs uploading the same artifact name → 409) — *mitigated.* Upload guarded to the Node 24 leg; `pnpm build` still runs on all four so build signal is not lost.
- **T-01-SC** (package installs) — *n/a.* This plan installs nothing.

## Next Phase Readiness

**Ready for plan 01-06** (the integration proofs), which now has everything it needs:

- The four check names verbatim for the branch-protection hand-off (task 3).
- A matrix that will actually run once the branch is pushed — SIG-03e/f/g become executable for the first time.
- `fail-fast: false` in place, without which SIG-03f (*Node 26 red while 20/22/24 stay green*) could not be observed: a cancelled sibling leg cannot be reported green.

**Coordination notes:**

- **Merge order is not constrained.** This plan touches only `.github/workflows/*`; sibling 01-04 owns `mcp-server.mjs`, `index.ts`, `claude-print.test.ts` and `MessageBubble.vue`. Zero file overlap, so no conflict either way.
- **Do not judge this plan by a red Lint step before 01-04 merges** — see "Expected Red" above.
- **`IMPROVEMENT-PLAN.md` is still untracked** at the repo root (STATE.md Session Continuity). Plan 01-06 asserts a globally clean `git status --porcelain` five times before pushing its scratch branch, so it must be committed or removed first. Untouched here.
- **Phase 9 rewrites `ci.yml`** to add `windows-latest`. It inherits the current action majors and must preserve the same three commented invariants; adding an OS axis multiplies legs, so the single-leg artifact guard will need an `if:` on the OS too.

## Self-Check: PASSED

Both claimed files verified present on disk; both task commits verified present in `git log`. Working tree clean.

| Claim | Result |
|---|---|
| `.github/workflows/ci.yml` | FOUND |
| `.github/workflows/release.yml` | FOUND |
| `.planning/phases/01-restore-the-verification-signal/01-05-SUMMARY.md` | FOUND |
| commit `ef33a7c` (Task 1) | FOUND |
| commit `c3342c3` (Task 2) | FOUND |

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
