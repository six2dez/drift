---
phase: 03-ci-spike-prove-llrt-basics-on-windows
plan: 02
subsystem: ci
tags: [github-actions, windows-latest, workflow, actionlint, secret-gate, shell-bash, pipefail, upload-artifact]

# Dependency graph
requires:
  - "01-05/01-06 — `ci.yml` as it exists post-Phase 1: bare `push`/`pull_request` triggers, the PR-number concurrency expression, and the `@v5`/`@v6` action majors that D-04 pins against"
  - "03-01 — `scripts/windows-llrt-probe.mjs`, the file this workflow invokes and the second target of the D-10 gate"
  - "03-CONTEXT.md — D-01 (bare triggers), D-02 (Phase 9 deletion date), D-03 (separate file), D-04 (pins), D-08 (Node-not-LLRT label), D-10 (secret gate), D-13 (static validation is not sufficient)"
provides:
  - ".github/workflows/windows-llrt-probe.yml — the single-legged `windows-latest` job that runs the seven-assertion probe (CI-02's instrument)"
  - "Three-branch secret gate: `test -f` guards on both targets, explicit `status=$?` capture, and a distinct failure arm for any status other than 0 or 1"
  - "`shell: bash` on both POSIX-semantics steps so `-eo pipefail` carries the probe's exit code through `tee`"
  - "Unconditional artifact upload (`if: always()`, `if-no-files-found: error`) named `windows-llrt-probe-${{ github.run_number }}`"
  - "Measured pin/trigger/step-name evidence that plan 03-05 cites as the static half of the CI-02 verdict"
affects: [03-03, 03-04, 03-05, 04, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-branch grep gate: 0 fails, 1 passes, anything else (including 2 = unreadable target) fails — never if/else"
    - "Anchored or comment-filtered counting for any file required to carry explanatory comments that quote its own check literals"
    - "Pairwise pin extraction against the live `ci.yml` rather than an asserted literal, so a future bump of `ci.yml` invalidates the check instead of silently passing"
    - "Divergences from the analog workflow are commented as deliberate (absent pnpm/install steps, read-only `permissions`) so a reviewer cannot read them as omissions"

key-files:
  created:
    - .github/workflows/windows-llrt-probe.yml
  modified: []

key-decisions:
  - "The D-10 gate branches three ways on grep's status, not two. grep exits 2 on a missing or renamed target; a two-branch gate routes that into its pass arm and green-lights exactly the Phase 4-8 edit the gate exists to catch. Both target paths are additionally asserted with `test -f` before the scan so a rename fails loudly rather than being inferred from an exit status."
  - "Every exact-count check is anchored (`^[[:space:]]*key:`) or run over a comment-filtered stream, because the file's mandated 'why' comments quote the very literals the checks count. `>=` threshold checks are left unanchored on purpose — a comment can only push a count above its threshold, never below it."
  - "`permissions: contents: read` is a deliberate divergence from `ci.yml`, which declares none and inherits the write-capable default on same-repo pushes. Artifact upload uses ACTIONS_RUNTIME_TOKEN, so read-only should suffice; plan 03-03's real run confirms it. On a permissions failure the fix is to widen the block, not to delete the upload step."
  - "`pnpm/action-setup@v6` — D-04's fourth pin — is deliberately absent, and the omission is commented rather than silent. The probe has zero dependencies; an install step would add a Windows failure surface that says nothing about the seven assertions."
  - "The gate's two-file scan is recorded as DEFERRED to plan 03-03's Task 1 pre-flight, not as passed here. Only the single-file scan was run, per the plan's own scoping."

patterns-established:
  - "Pin assertions compare against the live analog file pairwise, not against a hardcoded major"
  - "A verification-only task commits nothing when every check passes on first measurement; its evidence lives in the SUMMARY"
  - "Self-non-matching regexes (`CAIDO_(TOKEN)`, `secret(s)\\.`) so a leak gate cannot fail on its own source"

requirements-completed: [CI-02]

# Metrics
duration: 6min
completed: 2026-08-13
---

# Phase 3 Plan 02: Windows LLRT Probe Workflow Summary

**A 161-line `windows-latest` workflow that runs the seven-assertion probe under `shell: bash` so `pipefail` carries its exit code through `tee`, gates on secret leakage with a three-branch grep that fails rather than passes when it cannot read its targets, uploads results unconditionally with `if-no-files-found: error`, and names its own Phase 9 / CI-01 deletion date — with every pin proven byte-identical to the live `ci.yml` rather than asserted.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-13T12:39:40Z
- **Completed:** 2026-08-13T12:47:30Z
- **Tasks:** 2
- **Files modified:** 1 created, 0 modified

## Accomplishments

- `.github/workflows/windows-llrt-probe.yml` created — the only place in the repository where Windows behaviour can be observed at all, and the first `windows-latest` job this repo has ever had.
- The D-10 secret gate is genuinely three-branch, so a Phase 4-8 rename of either scanned file fails the job instead of passing vacuously.
- Every structural claim is a *measurement against the live `ci.yml`*, not an assertion: the three pins were extracted from `uses:` lines on both sides and compared pairwise, and the concurrency group was compared byte-for-byte.
- `ci.yml` and everything under `packages/` are untouched (D-03), and `ROADMAP.md` / `REQUIREMENTS.md` are byte-identical.

## Task Commits

1. **Task 1: Write the windows-latest probe workflow** — `4b9e6c2` (chore)
2. **Task 2: Prove the workflow's structural claims against ci.yml** — no diff; every check passed on first measurement, so per the plan ("this task changes no file unless a check fails") there was nothing to commit. Its evidence is the Measured Results section below.

**Plan metadata:** see the `docs(03-02)` commit carrying this SUMMARY and `STATE.md`.

## Files Created/Modified

- `.github/workflows/windows-llrt-probe.yml` (new, 161 lines) — single-legged `windows-latest` job: Checkout → Setup Node 24 → three-branch D-10 secret gate → probe under `shell: bash` piped to `tee` → unconditional artifact upload.

## Measured Results

Every value below is the recorded output of the command, not a tick.

### `actionlint`

```
actionlint .github/workflows/windows-llrt-probe.yml
→ (no output)   actionlint-exit=0
```

`actionlint` 1.7.12 with `shellcheck` 0.11.x present at `/opt/homebrew/bin/shellcheck`, so the two `run:` blocks were shellcheck-linted as part of this run — zero findings. Re-run on the final state of the file: still exit 0.

### Parsed YAML (the authoritative trigger check, not a grep)

```
triggers= {'push': None, 'pull_request': None}
perms=    {'contents': 'read'}
runs-on=  windows-latest
steps=    ['Checkout', 'Setup Node', 'Assert no secret material is reachable (D-10)',
           'Run LLRT Windows primitive probe', 'Upload probe results']
```

Both trigger values are empty — no `branches` filter on either key (D-01). The five step names are the contract strings plans 03-03 and 03-04 read from the API.

PyYAML parses the bare `on:` key as the boolean `True`, so the check reads `d[True]` with `d.get("on")` as fallback. A check that silently read a missing `"on"` key would have passed vacuously.

### Pairwise pin comparison against the live `ci.yml` (D-04)

Extraction anchored to `^[[:space:]]*uses:` on **both** sides, so a comment discussing pins cannot contribute a second string.

| Action | probe workflow | `ci.yml` | strings found per side | verdict |
|---|---|---|---|---|
| `actions/checkout` | `actions/checkout@v5` | `actions/checkout@v5` | 1 / 1 | **MATCH** |
| `actions/setup-node` | `actions/setup-node@v5` | `actions/setup-node@v5` | 1 / 1 | **MATCH** |
| `actions/upload-artifact` | `actions/upload-artifact@v5` | `actions/upload-artifact@v5` | 1 / 1 | **MATCH** |

Neither side printed `NONE`. Comparing against the live file — rather than against a literal `@v5` — is what makes this survive a future bump of `ci.yml`; that exact drift is what invalidated the superseded plan's `@v4` gates.

### Concurrency group, byte-compared

```
probe :   group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
ci.yml:   group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
concurrency-group=IDENTICAL
```

Not the older ref-only form from `03-RESEARCH.md:470-473`, which with bare triggers would run the probe twice per same-repo PR.

### Anchored structural counts

| Check | Anchor | Measured | Expected |
|---|---|---|---|
| `shell-bash` | `^[[:space:]]*shell:[[:space:]]*bash` | **2** | 2 |
| `runs-on-windows` | `^[[:space:]]*runs-on:[[:space:]]*windows-latest` | **1** | 1 |
| `timeout-10` | `^[[:space:]]*timeout-minutes:[[:space:]]*10` | **1** | 1 |
| `if-always` | `^[[:space:]]*if:[[:space:]]*always\(\)` | **1** | 1 |
| `no-files-error` | `^[[:space:]]*if-no-files-found:[[:space:]]*error` | **1** | 1 |
| `branches-key` | `^[[:space:]]*branches:` | **0** | 0 |
| `checkout-v5` | `^[[:space:]]*uses:[[:space:]]*actions/checkout@v5` | **1** | 1 |
| `setup-node-v5` | `^[[:space:]]*uses:[[:space:]]*actions/setup-node@v5` | **1** | 1 |
| `upload-artifact-v5` | `^[[:space:]]*uses:[[:space:]]*actions/upload-artifact@v5` | **1** | 1 |
| `any-v4` | `^[[:space:]]*uses:[[:space:]]*actions/(checkout\|setup-node\|upload-artifact)@v4` | **0** | 0 |
| `ci-01-mentions` | *(unanchored, `>=` gate over comment text — counting comments is the point)* | **3** | ≥ 1 |

The anchoring is load-bearing, not cosmetic. This file is required to carry `ci.yml`-density "why" comments, and those comments necessarily quote the literals the checks count — "no branches filter", "`shell: bash` is mandatory and not stylistic", "`pnpm install --frozen-lockfile`", "keep `error` rather than `warn`". A naive `grep -c 'branches:'` counts the comment explaining why there is no `branches:` key and reports a correct file as broken. A YAML `#` comment can never satisfy `^[[:space:]]*key:`; a real key always does.

### Three-branch D-10 gate, structural

| Check | Measured | Expected |
|---|---|---|
| `status-capture` (`grep -c 'status=\$?'`) | **1** | ≥ 1 |
| `exit1-sites` (`grep -c 'exit 1'`) | **3** | ≥ 3 |
| `existence-guards` (`grep -c 'test -f'`) | **1** | ≥ 1 |

All three `exit 1` sites are inside the single gate step — measured line numbers **97, 118, 123** (the step spans lines 88-126): the missing-target guard, the match arm, and the unreadable-target arm. The existence guard is one `for` loop naming both target paths, which the plan explicitly accepts as satisfying the "both target paths are named" requirement:

```
for f in .github/workflows/windows-llrt-probe.yml scripts/windows-llrt-probe.mjs
```

These three are deliberately unanchored `>=` thresholds: the existence guard is written inline after a `||`, so `^[[:space:]]*exit 1` would match zero of the three sites and report a correct gate as broken, and a comment quoting the idiom can only push a count further above its threshold.

The three arms are `status -eq 0` → echo and `exit 1`; `status -eq 1` → echo a confirmation naming both scanned files and fall through; `else` (including status 2) → echo that the gate could not read its targets and `exit 1`. `shell: bash` resolves to `bash --noprofile --norc -eo pipefail {0}`, so `-e` is active — hence the `|| status=$?` form, whose left side is a condition context and therefore `-e`-safe.

### Gate self-scan (single file — the two-file form is DEFERRED)

```
grep -nE 'CAIDO_(TOKEN)|secret(s)\.' .github/workflows/windows-llrt-probe.yml
→ (no output)   gate-self-scan-exit=1
```

**Exit 1 = clean.** Exit 0 would mean the gate fails the job on its own text (patterns written wrong); exit 2 would mean the path was wrong and the check proved nothing. This `$?` is a real three-valued measurement, which is why it is used here rather than a porcelain-emptiness assertion. The patterns are self-non-matching by construction: as literal text `CAIDO_(TOKEN)` and `secret(s)\.` contain neither string they detect, while as extended regexes both match those strings exactly.

**Deferred, explicitly:** the *two-file* form of this command — the identical regex over both `.github/workflows/windows-llrt-probe.yml` and `scripts/windows-llrt-probe.mjs`, which is what the workflow step actually runs — was **not** run here and is **not** claimed as proven. Per this plan's scoping it is plan **03-03's Task 1 pre-flight**, the first point in the phase where both files are guaranteed to coexist, and it runs before anything is pushed. (Note for 03-03: this phase executed sequentially rather than in parallel waves, so `scripts/windows-llrt-probe.mjs` did in fact land first — the pre-flight is unblocked and has no reason to exit 2 on a missing path.)

### pnpm omission, proven the right way round

| Check | Measured | Expected |
|---|---|---|
| `pnpm-mentions` (unfiltered) | **4** | ≥ 1 |
| `pnpm-uncommented` (comment-filtered) | **0** | 0 |
| `pnpm-action` (`uses: pnpm/action-setup`, comment-filtered) | **0** | 0 |
| `pnpm-install` (`pnpm install`, comment-filtered) | **0** | 0 |

`pnpm-uncommented=0` is the direct measurement of the claim "every occurrence is inside a comment" — the last three counts are taken over `grep -v '^[[:space:]]*#'` because Task 1 mandates a comment containing the words `pnpm install --frozen-lockfile`, and a bare `grep -c 'pnpm install'` would count that comment and report a correct file as carrying an install step. This also satisfies threat `T-03-SC`: the workflow installs no packages at all.

### Scope containment

```
git status --porcelain .github/workflows/ci.yml   → (empty)
git status --porcelain -- packages/               → (empty)
git status --porcelain .planning/ROADMAP.md .planning/REQUIREMENTS.md → (empty)
```

## Decisions Made

- **Three-branch gate, not if/else** — the third arm exists specifically because `grep` exits 2 on a missing or unreadable target, and D-10's whole purpose is to keep the no-secret-material property true through Phases 4-8 *including* a rename. A comment above the branch says so, since a future editor will otherwise "simplify" it back.
- **Anchored / comment-filtered counting throughout** — see the note under Anchored structural counts. This is the same lesson `01-06` recorded (a grep returning nothing looks identical to a proof that failed), applied here to the inverse failure: a grep returning *something* that came from the explanatory comment rather than from the code.
- **`permissions: contents: read`** — commented as a deliberate divergence, with the remediation named up front (widen and re-run, do not delete the upload step) so plan 03-03 does not have to invent a response.
- **No `cache:`, no `pnpm/action-setup`, no install step** — commented as deliberate. The probe has zero dependencies; an install step would add roughly a minute of Windows runner time plus a failure surface that could turn this job red for reasons that say nothing about the seven assertions — the noise D-03 separates this workflow to avoid. Any future edit adding pnpm here must use `@v6` to stay aligned with `ci.yml:36`, and that instruction is in the file.
- **Node 24, quoted as `'24'`** — Active LTS (the same reasoning `ci.yml:59-61` uses for its artifact-upload leg) and far past 18.20.2, so the CVE-2024-27980 `.cmd` EINVAL guard P1-CMD characterises is definitely present.
- **Commit type `chore(03-02)`** — matches this repo's existing convention for workflow changes (`chore(01-05): restructure ci.yml…`, `chore(01-05): add the lint gate to release.yml…`).

## Deviations from Plan

None — plan executed exactly as written. No deviation rule fired; no bug, missing critical functionality, or blocking issue was encountered, and no architectural question arose.

Two notes that are *not* deviations:

- Task 2 produced no diff. The plan states it "changes no file unless a check fails"; no check failed, so no second code commit exists. This is the specified behaviour, not a skipped task.
- `requirements-completed: [CI-02]` appears in this SUMMARY's frontmatter because the template requires copying the plan's `requirements` field, but **`.planning/REQUIREMENTS.md` was deliberately left byte-identical with CI-02 at `[ ]` / `Pending`** — identical to how plan 03-01 handled it. CI-02 reads "A CI spike *proves* the 7 LLRT assertions"; marking it before a real `windows-latest` run exists is precisely the false-green D-13 forbids. Plan 03-05, which records the real run's verdict, is the one that marks it. `ROADMAP.md` was likewise left alone — the orchestrator handles phase plan progress centrally.

## Issues Encountered

**1. `gsd-tools state record-metric` and `state add-decision` reject positional arguments.** The documented positional form (`state record-metric 03 02 6min 2 1`) returned `{"error": "phase, plan, and duration required"}`; the named-flag form (`--phase 03 --plan 02 --duration 6min --tasks 2 --files 1`) worked. `state add-decision` behaved the same way and, with `--summary`, emitted `- [Phase ?]: …` — it cannot infer the phase. The stray probe entry was removed and the three real decisions were written directly in the house format `- [Phase 03]: [03-02]: …` to match plan 03-01's entries.

**2. `state record-metric` appended a malformed row after the `*Updated after each plan completion*` marker** rather than into the `**By Phase:**` table, and `state advance-plan` / `state record-session` overwrote `Last activity` with a bare date, blanked `Resume file` to `None`, and reverted a hand-edited frontmatter field. All were corrected by hand: the `By Phase` row is now `| 03 | 2 of 5 | 10min | 5min |`, `completed_plans` is 8, `stopped_at` and `Stopped at` both read `Completed 03-02-PLAN.md`, and `Resume file` points at `03-03-PLAN.md`. Same class of tooling caveat plan 03-01 hit with `roadmap update-plan-progress`, which was avoided entirely here on the orchestrator's instruction.

**3. `state update-progress` reported `64% (7 of 11)` but wrote nothing.** The `Progress:` line in `STATE.md` is a hand-curated milestone-phase count (`10% (1 of 10 milestone phases)`) that the tool's bar format does not match, so the computed value was a no-op. Left as-is — it is the same value plan 03-01 left, and the phase count has not changed.

## Known Stubs

None. The workflow contains no placeholder step, no `TODO`, and no hardcoded empty value. The only things it deliberately does *not* do — install dependencies, use `pnpm/action-setup@v6` — are commented as intentional and measured as absent (`pnpm-uncommented=0`).

The workflow's *dynamic* behaviour is entirely unproven at this point, and that is by design rather than a stub: D-13 states explicitly that "the files exist and the YAML is valid" is **not** sufficient. Everything recorded above is the static half only.

## Threat Flags

None — no new security surface beyond what the plan's own `<threat_model>` already registers. No endpoint, auth path, file-access pattern or schema change.

Threat register dispositions applied:

- **T-03-03** (third-party action supply chain) — *mitigated, and re-measured rather than asserted.* Only `actions/checkout@v5`, `actions/setup-node@v5` and `actions/upload-artifact@v5`, all GitHub-owned and all already trusted by `ci.yml` at the identical majors, proven by the pairwise extraction above. `pnpm/action-setup@v6` — the one third-party action `ci.yml` trusts — is deliberately not added (`pnpm-action=0`). Net third-party trust surface is strictly narrower than `ci.yml`'s.
- **T-03-04** (`GITHUB_TOKEN` scope on an every-branch workflow) — *mitigated.* `permissions: contents: read` parsed as `{'contents': 'read'}`. Plan 03-03's real run is what confirms the upload still succeeds under it; the divergence is recorded as to-be-proven, not assumed.
- **T-03-01** (secret material reaching a public log or artifact) — *mitigated.* The D-10 gate runs before the probe on every push, so the property survives Phases 4-8 edits. Patterns proven not to match their own source (exit 1).
- **T-03-20** (the gate passing vacuously on a renamed or unreadable target) — *mitigated and structurally measured.* `test -f` guards naming both paths, `status=$?` capture, three distinct `exit 1` sites at lines 97/118/123.
- **T-03-06** (integrity of the verification signal) — *partially mitigated; the empirical half is 03-04's.* `shell: bash` ×2, `if: always()` ×1, `if-no-files-found: error` ×1 are all present and anchored-measured. Whether the chain actually bites is proven by 03-04's deliberate-FAIL run, not by this file's YAML.
- **T-03-07** (a hung probe holding a Windows runner) — *mitigated.* `timeout-minutes: 10`, replacing the 360-minute default.
- **T-03-10** (duplicate runs from bare triggers on same-repo PRs) — *mitigated.* Concurrency group byte-identical to `ci.yml:14`, keying on the PR number when present.
- **T-03-SC** (npm/pnpm installs) — *n/a, and measured.* No install step, no lockfile consumed: `pnpm-install=0` over a comment-filtered stream. `package.json` and `pnpm-lock.yaml` untouched.

## Next Phase Readiness

**Ready for plan 03-03.** Both files the phase needs now exist on disk and the workflow is statically clean.

Carried forward:

- **The two-file gate scan is 03-03's Task 1 pre-flight** and is the one deferred check from this plan. Run the identical regex over both paths before pushing anything.
- **The five step names are a contract.** `['Checkout', 'Setup Node', 'Assert no secret material is reachable (D-10)', 'Run LLRT Windows primitive probe', 'Upload probe results']` — 03-03 and 03-04 read step conclusions by these strings from the API. Do not rename them.
- **The artifact name embeds `github.run_number`** (`windows-llrt-probe-${{ github.run_number }}`), so 03-03 and 03-04 must resolve the exact name from the run's artifact listing rather than assume a fixed string when downloading.
- **`permissions: contents: read` is unproven at runtime.** If `Upload probe results` fails with a permissions error on the real run, widen the block and re-run; do not delete the step. Record whichever outcome occurs.
- **CI-02 stays `Pending`.** This plan built the second half of the instrument. D-13 is satisfied only when a real `windows-latest` run has produced all seven assertion lines with a recorded URL — plan 03-05's job.

## Self-Check: PASSED

| Claim | Command | Result |
|---|---|---|
| `.github/workflows/windows-llrt-probe.yml` exists | `[ -f … ]` | **FOUND** |
| `.planning/phases/03-…/03-02-SUMMARY.md` exists | `[ -f … ]` | **FOUND** |
| File is ≥ 60 lines (`min_lines: 60`) | `wc -l` | **161** |
| Task 1 commit exists | `git log --oneline --all \| grep 4b9e6c2` | **FOUND** |
| Plan metadata commit exists | `git log --oneline --all \| grep d72c005` | **FOUND** |
| Working tree clean after commit | `git status --porcelain` | *(empty)* |
| `ci.yml`, `packages/`, `ROADMAP.md`, `REQUIREMENTS.md` unmodified | `git status --porcelain <paths>` | *(empty)* |

---
*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Completed: 2026-08-13*
