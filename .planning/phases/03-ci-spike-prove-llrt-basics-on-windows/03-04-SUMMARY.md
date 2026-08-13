---
phase: 03-ci-spike-prove-llrt-basics-on-windows
plan: 04
subsystem: ci
tags: [falsifiability, windows-latest, deliberate-defect, pipefail, if-always, if-no-files-found, secret-gate, scratch-branch, teardown]

# Dependency graph
requires:
  - "03-03 — run 31702392047 (7/7 PASS, exit 0) is the positive result this plan falsifies, plus its resolved-artifact-name download pattern and the BSD-sed log caveat"
  - "03-02 — the five contract step names, read back by name from the API on both negative runs"
  - "01-06 — the scratch-branch → push → `gh run view --json jobs` → delete pattern and its negative-legs-must-stay-green rule"
provides:
  - "Research assumption A2 / Pitfall 1 CLOSED EMPIRICALLY: a probe FAIL exits non-zero, survives `| tee`, and turns the job red — measured, not reasoned"
  - "`if: always()` on the upload step PROVEN: on the red probe run the artifact still uploaded and still carried all seven summary lines"
  - "D-10 secret gate PROVEN TO BITE: its match arm fired on a real run and failed the job at the gate step, before the probe printed anything"
  - "`if-no-files-found: error` PROVEN NOT DECORATIVE: with the probe skipped the upload step concluded failure on the missing results file"
  - "A clean public remote — zero `scratch/*` branches — with all five run records still resolving after the deletions"

affects: [03-05, 04, 05, 06, 07, 08, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Falsification by two independent single-defect branches, both cut from the same baseline, never from each other — because the gate step precedes the probe step and a combined mutation would skip the probe"
    - "Branch-before-mutate: the defect never exists in a commit on the working branch, so the revert is a branch switch and the proof is a blob-hash comparison rather than an eyeballed restore"
    - "A self-labelling canary (literal `CANARY` + plan number, naming a nonexistent secret, inside a YAML comment) so the gate's own `grep -n` output in the public log cannot be mistaken for a real leak"
    - "`gh run view --log` prefix stripping: `cut -f3-` leaves the ISO timestamp behind — it must be followed by a timestamp strip, and ANSI must be stripped with perl because BSD sed does not interpret `\\x1b` either"

key-files:
  created:
    - .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-04-SUMMARY.md
  modified: []

key-decisions:
  - "Two independent negative branches rather than one combined mutation. The D-10 gate step (4) precedes the probe step (5), and a step without `if:` defaults to `if: success()`, so a single commit carrying both defects would fail at the gate and SKIP the probe — destroying the probe-exit-path proof, which requires the failing step to be `Run LLRT Windows primitive probe` specifically. Measured, not theorised: the gate-negative run shows exactly that skip."
  - "P0-TMP was mutated rather than P0-ENV. D-05 makes a `FAIL [P0-ENV]` line a project-stopping blocker; a fabricated one sitting in a permanent public run record is a trap for a later reader. P0-TMP is equally gating under D-06 and equally proves the exit path."
  - "The gate canary is a YAML comment naming a nonexistent secret, not a Caido-token-shaped string. Both alternation branches of the gate regex are equivalent as a control-flow test, but only one of them puts leak-shaped text in a public archive."
  - "Neither mutation was reverted, because neither was ever committed on the working branch. Net-zero is proven by blob-hash equality plus a marker `grep -c` returning 0, not by a restore that could go wrong."

patterns-established:
  - "A green run cannot distinguish an unconditional upload from a conditional one — `if: always()` is only provable on a red run"
  - "`git ls-remote --heads origin 'scratch/*'` exits 0 whether or not it matched, so teardown must capture the output and discriminate with `test -z`, and record the full unfiltered listing so an empty match is provably empty rather than mistyped"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-08-13
---

# Phase 3 Plan 04: Falsifiability — Prove Both Gates Bite Summary

**Two deliberate one-line defects turned the `windows-latest` job red in two different, precisely-predicted ways: a broken `P0-TMP` assertion failed the job AT the probe step while the artifact still uploaded with all seven summary lines intact, and a canary secrets expression failed the job AT the D-10 gate step with the probe skipped and the upload failing on a missing results file. Plan 03-03's 7/7 PASS is now a result that could have been otherwise, and the one artefact this phase leaves behind for Phases 4-8 — the D-10 gate — has been observed failing.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-13T13:04Z
- **Completed:** 2026-08-13T13:15Z
- **Tasks:** 3
- **Files modified on the working branch:** **0** — net-zero by construction, proven by blob hash

## The Two Falsifiability Runs

Run table in the `01-06-SUMMARY.md` shape. Both branches were cut from the **same baseline `0a05174`** (03-03's authoritative SHA), never from each other, and both are now deleted.

| # | Purpose | Branch (deleted) | Commit | Run URL | Conclusion |
|---|---------|------------------|--------|---------|------------|
| 0 | *(03-03 baseline, for reference)* | `scratch/ci-proof-windows-probe` | `0a05174` | https://github.com/six2dez/drift/actions/runs/31702392047 | **success** (7/7 PASS) |
| 1 | Probe-negative — does a probe FAIL fail the job? | `scratch/ci-proof-windows-probe-negative` | `faff52f` | https://github.com/six2dez/drift/actions/runs/31703442673 | **failure** (intended) |
| 2 | Gate-negative — does the D-10 gate bite? | `scratch/ci-proof-windows-gate-negative` | `4e82c2a` | https://github.com/six2dez/drift/actions/runs/31703717548 | **failure** (intended) |

Job `Windows LLRT primitive assertions (CI-02)` on both. Run 1: `13:08:38Z` → `13:08:57Z` (19s). Run 2: `13:11:59Z` → `13:12:17Z` (18s).

---

## Task 1 — the probe-negative run

### The mutation

One character, on the single comment-filtered occurrence of the platform literal, at `scripts/windows-llrt-probe.mjs:234`:

```diff
-  if (osPlatform !== "win32") { // single uncommented occurrence of this literal — plan 03-04 mutates exactly it
+  if (osPlatform !== "win32x") { // single uncommented occurrence of this literal — plan 03-04 mutates exactly it
```

Ambiguity was measured before editing, not trusted from prose:

| Check | Measured | Required |
|---|---|---|
| `grep -vE '^[[:space:]]*(//\|/\*\|\*)' … \| grep -c '"win32"'` | **1** | exactly 1 (03-01's `win32-literal=1`) |
| Occurrence line number | **234**, sole hit | single |
| `git diff --stat` after the edit | **1 file changed, 1 insertion(+), 1 deletion(-)** | one line |
| `eslint scripts/windows-llrt-probe.mjs --max-warnings 0` | **exit 0** | 0 — so the `Verify` legs can stay green |

### Per-step conclusions, read from `gh run view 31703442673 --json jobs`

| # | Step (03-02's contract names) | Conclusion |
|---|---|---|
| 1 | `Set up job` | success |
| 2 | `Checkout` | success |
| 3 | `Setup Node` | success |
| 4 | `Assert no secret material is reachable (D-10)` | success |
| **5** | **`Run LLRT Windows primitive probe`** | **failure** |
| **6** | **`Upload probe results`** | **success** |
| 11 | `Post Setup Node` | skipped |
| 12 | `Post Checkout` | success |
| 13 | `Complete job` | success |

**All four required properties hold, and each closes a distinct hole:**

1. **Job conclusion `failure`** — the empirical closure of research **assumption A2** and **Pitfall 1**. The probe's non-zero exit survived the pipe into `tee`. Confirmed a second way from the log: `##[error]Process completed with exit code 1.` appears on the probe step. Had `pipefail` not applied, this job would have been **green with `FAIL [P0-TMP]` sitting in the artifact** — the exact false-green shape D-13 exists to prevent.
2. **The failing step is step 5, `Run LLRT Windows primitive probe`** — not an earlier one. `Setup Node` (3) and the D-10 gate (4) both concluded `success` and the gate printed its pass arm verbatim: `Gate passed: no Caido token reference and no GitHub secrets expression in .github/workflows/windows-llrt-probe.yml or scripts/windows-llrt-probe.mjs`. So the red is the probe's exit path and nothing upstream of it.
3. **`Upload probe results` concluded `success`, not `skipped`** — **this is the phase's only proof of `if: always()`.** On a green run an unconditional upload and a conditional one are indistinguishable; this is the run where they diverge, and the unconditional one is what actually happened.
4. **The artifact is complete, not a crash trace** — see below.

### Artifact capture (name-resolved, `test -f` before any grep)

| Property | Value |
|---|---|
| Resolved name | `windows-llrt-probe-3` (via `gh api repos/six2dez/drift/actions/runs/31703442673/artifacts --jq '.artifacts[0].name'`) |
| Artifact id / size | `9182180741` / **1769 bytes** |
| Expires | `2026-09-12T13:08:52Z` |
| Download | `gh run download 31703442673 -n "$ART" -D /tmp/drift-probe-negative` |
| Landed at | `/tmp/drift-probe-negative/probe-results.txt` (**32 lines**) |
| `test -f` before any grep | **PASS** — printed `ARTIFACT-PRESENT=yes` |

### Per-ID grep counts on the failing run's artifact

`grep -cE "^(PASS|FAIL) \[<ID>\]:"` over the whole downloaded file:

| ID | Artifact count | Log count | Required |
|---|---|---|---|
| P0-ENV | **1** | 1 | exactly 1 |
| P0-TMP | **1** | 1 | exactly 1 |
| P1-CMD | **1** | 1 | exactly 1 |
| P1-WHERE | **1** | 1 | exactly 1 |
| P2-OS | **1** | 1 | exactly 1 |
| P3-VARS | **1** | 1 | exactly 1 |
| P3-UUID | **1** | 1 | exactly 1 |

`grep -cE '^FAIL \[P0-TMP\]:'` → **1**. Whole-file aggregates: `^PASS ` = **6**, `^FAIL ` = **1** (6 + 1 = 7), `grep -c 'indeterminate'` = **0**.

**The deliberate FAIL changed one line's status, not the line count** — exactly as 03-01's single-emission contract predicts, because the seven lines are produced only by the `=== Summary ===` block iterating the frozen `ASSERTION_IDS` array. A red run whose artifact held only a crash trace would have meant the probe died rather than reported, and the gate would still be untested.

### The mutated line, verbatim from the artifact

```
FAIL [P0-TMP]: os.platform() returned "win32", which is not the Windows platform id — this host is not Windows, so the Windows temp-dir assertion cannot be satisfied here
```

Self-evidently the injected defect: the message reports `"win32"` while claiming it is not the Windows platform id. The comparison literal was mutated, not the platform.

Verdict line, verbatim — the failing arm of the probe's own exit-code contract:

```
PROBE FAILED: at least one of P0-ENV, P0-TMP, P1-CMD is not PASS — see the summary lines above for which.
```

The other six lines are byte-identical to 03-03's baseline run apart from the timestamped sentinel, including both D-08 vehicle labels.

### Log cross-check

The seven summary lines were independently re-extracted from `gh run view 31703442673 --log`, ANSI-stripped and prefix-stripped, and `diff`ed against the artifact extract: **IDENTICAL, 7 lines byte-for-byte.** Two independent capture paths agree.

### The four `Verify (Node N)` legs — same commit `faff52f`

`CI` run [31703442594](https://github.com/six2dez/drift/actions/runs/31703442594) — conclusion **success**.

| Leg | Conclusion | Typecheck | Lint | Test | Build |
|---|---|---|---|---|---|
| `Verify (Node 20)` | **success** | success | success | success | success |
| `Verify (Node 22)` | **success** | success | success | success | success |
| `Verify (Node 24)` | **success** | success | success | success | success |
| `Verify (Node 26)` | **success** | success | success | success | success |

`[01-06]`'s negative-legs rule satisfied: **an all-red push would discriminate nothing.** The probe job's red is attributable to the probe alone.

---

## Task 2 — the gate-negative run

### The mutation

Exactly one line, a YAML **comment** in the header block at `.github/workflows/windows-llrt-probe.yml:17`:

```diff
 # the YAML first.
+# CANARY (deliberate, plan 03-04): ${{ secrets.DRIFT_PROBE_GATE_CANARY }}
 name: Windows LLRT Primitive Probe
```

Four properties make it safe and make it a real test, each measured rather than asserted:

| Property | Measurement |
|---|---|
| It is a comment, so no expression is ever evaluated | `python3 -c "yaml.safe_load(...)"` → **`canary-in-parsed-yaml= False`** — the string does not survive into the parsed document |
| The YAML is still valid and the step names unchanged | `actionlint` **exit 0**; parsed steps = `['Checkout', 'Setup Node', 'Assert no secret material is reachable (D-10)', 'Run LLRT Windows primitive probe', 'Upload probe results']` |
| The named secret does not exist in the repository | an evaluated expression would resolve to empty; nothing secret is referenced or reachable |
| It is textually matched by the gate's `secret(s)\.` pattern | local dry run of the exact two-file gate command → **`secret-gate-status=0`** (the match arm), on the branch, before pushing |

A Caido-token-shaped string was deliberately **not** used: the two alternation branches are equivalent as a test of the gate's control flow, but only one of them puts leak-shaped text in a permanent public archive.

### Per-step conclusions, read from `gh run view 31703717548 --json jobs`

| # | Step | Conclusion |
|---|---|---|
| 1 | `Set up job` | success |
| 2 | `Checkout` | success |
| 3 | `Setup Node` | success |
| **4** | **`Assert no secret material is reachable (D-10)`** | **failure** |
| **5** | **`Run LLRT Windows primitive probe`** | **skipped** |
| **6** | **`Upload probe results`** | **failure** |
| 11 | `Post Setup Node` | skipped |
| 12 | `Post Checkout` | success |
| 13 | `Complete job` | success |

**All four required properties hold:**

1. **Job conclusion `failure`.**
2. **The failing step is step 4, `Assert no secret material is reachable (D-10)`.** This is the gate biting. Its match arm printed verbatim in the public log, preceded by `grep -n`'s own output:

   ```
   .github/workflows/windows-llrt-probe.yml:17:# CANARY (deliberate, plan 03-04): ${{ secrets.DRIFT_PROBE_GATE_CANARY }}
   Gate failed: a Caido token reference or a GitHub secrets expression appears in a scanned file (see the match above).
   ```

   **The self-labelling worked as designed:** the line the gate quotes into the permanent public record announces itself as a deliberate canary from plan 03-04. Step exit: `##[error]Process completed with exit code 1.`
3. **`Run LLRT Windows primitive probe` concluded `skipped`.** Steps without an `if:` default to `if: success()`, so a failed gate prevents the probe from ever running. Measured directly rather than inferred: the run log contains **0** lines matching `^(PASS|FAIL) \[` and **0** occurrences of the probe's banner string. This is the "fails fast, before anything could be printed" property the gate step's placement claims — and it is why the two defects had to be on separate commits.
4. **`Upload probe results` concluded `failure`, and this is INTENDED — not a defect.** `if: always()` still ran the step; with the probe skipped, `probe-results.txt` never existed; `if-no-files-found: error` turned that into a step failure rather than a silent success. Verbatim from the log:

   ```
     if-no-files-found: error
   ##[error]No files were found with the provided path: probe-results.txt. No artifacts will be uploaded.
   ```

   Artifact count for this run: **0** (`gh api …/artifacts` → `{"names":[],"total":0}`).

   **This is the phase's only observation that distinguishes `if-no-files-found: error` from `warn`**, and it closes plan 03-02's must-have that "a missing results file fails the job rather than passing quietly". Under `warn` this step would have concluded `success` and the run would still have gone red at the gate — indistinguishable at job level, distinguishable only here at step level.

### The four `Verify (Node N)` legs — same commit `4e82c2a`

`CI` run [31703717437](https://github.com/six2dez/drift/actions/runs/31703717437) — conclusion **success**.

| Leg | Conclusion | Typecheck | Lint | Test | Build |
|---|---|---|---|---|---|
| `Verify (Node 20)` | **success** | success | success | success | success |
| `Verify (Node 22)` | **success** | success | success | success | success |
| `Verify (Node 24)` | **success** | success | success | success | success |
| `Verify (Node 26)` | **success** | success | success | success | success |

ESLint does not lint `.github/workflows/*.yml`, so a workflow comment cannot affect these legs — which is precisely why they are the control that proves this run's red is the gate and nothing else.

---

## No-net-change proof — both files, both directions

Neither mutation was ever committed on the working branch, **by construction**: each branch was created at baseline `0a05174` *before* anything was edited, so the "revert" is a branch switch rather than a restore that could go wrong. Proven rather than assumed:

| File | Blob hash before mutation | Blob hash on `main` after both tasks | Identical? |
|---|---|---|---|
| `scripts/windows-llrt-probe.mjs` | `bd9338f0dc217a4710fd1f7df1ce850b63e9566c` | `bd9338f0dc217a4710fd1f7df1ce850b63e9566c` | **yes** |
| `.github/workflows/windows-llrt-probe.yml` | `6941ddbbca7b18757cf551580d4308a26c19b7b3` | `6941ddbbca7b18757cf551580d4308a26c19b7b3` | **yes** |

Both pre-mutation hashes were additionally confirmed equal to the baseline commit's (`git rev-parse 0a05174:<path>`), so `main` and the branch point agreed before anything was touched.

| Marker check on `main` | Measured | Required |
|---|---|---|
| `grep -c 'win32x' scripts/windows-llrt-probe.mjs` | **0** | 0 |
| `grep -c 'CANARY' .github/workflows/windows-llrt-probe.yml` | **0** | 0 |
| `git status --porcelain -- scripts/windows-llrt-probe.mjs` | *(empty)* | empty |
| `git status --porcelain -- .github/workflows/` | *(empty)* | empty |
| Commits matching `DELIBERATE DEFECT` on `main` | **0** | 0 |

### The two-file D-10 gate on `main` after both tasks

The identical command the workflow step runs, in its real two-file form:

```
both-gate-targets-present
secret-gate-status=1 (1 clean)
```

**Status 1 = clean by the gate's own standard**, not by inspection — the same measurement 03-03's pre-flight made, re-taken after this plan pushed a canary through it and switched away. Status 0 would mean a real match survived; status 2 would mean a path was wrong and the check proved nothing.

---

## Task 3 — teardown assertion table

In the `01-06-SUMMARY.md` shape. Every row is a measured output, not a tick.

| Check | Command | Result |
|---|---|---|
| Working branch checked out before any deletion | `git branch --show-current` | `main` |
| Remote deletions | `git push origin --delete <3 branches>` | `- [deleted] scratch/ci-proof-windows-gate-negative`, `- [deleted] scratch/ci-proof-windows-probe`, `- [deleted] scratch/ci-proof-windows-probe-negative` |
| Local deletions | `git branch -D <3 branches>` | `Deleted branch scratch/ci-proof-windows-probe (was 0a05174)`, `… -probe-negative (was faff52f)`, `… -gate-negative (was 4e82c2a)` |
| **Scratch glob empty (discriminating)** | `out=$(git ls-remote --heads origin 'scratch/*'); test -z "$out"; echo $?` | **`scratch-glob-empty=0`**, `scratch-survivors:` *(empty)* |
| Full unfiltered remote listing | `git ls-remote --heads origin` | **`fix/security-hotfixes` `0cd81f3`** and **`main` `2d8cf16`** — nothing else |
| Local scratch refs | `git branch --list 'scratch/*'` | *(empty)* |
| All local branches | `git branch --list` | `drift-v1-hardening`, `fix/security-hotfixes`, `* main` — no scratch ref |
| **Working tree clean for the phase's paths** | `out=$(git status --porcelain -- scripts/ .github/workflows/ packages/ package.json pnpm-lock.yaml); test -z "$out"; echo $?` | **`tree-clean-for-phase=0`**, `tree-dirty:` *(empty)* |
| Whole working tree | `git status --porcelain` | *(empty — not even an untracked file)* |
| `origin/main` never pushed | `git ls-remote --heads origin main` | **`2d8cf16`** — byte-identical to its value before this phase started |

**Why `scratch-glob-empty` is captured into a variable and tested with `test -z`:** `git ls-remote` exits **0 whether or not the glob matched anything**. A bare `echo "scratch-glob-empty=$?"` after it would print `0` even with all three branches still alive on the public remote — a labelled non-proof of the single assertion in this plan whose failure has real consequences. The unfiltered listing alongside it is what makes an empty match provably empty rather than a mistyped pattern.

`fix/security-hotfixes` is pre-existing and unrelated (it predates this phase and is the merged hotfix branch from `2d8cf16`'s PR). It was deliberately left alone — only `scratch/*` was this phase's to clean up.

### Run records survive the branch deletions

All five re-queried **after** the branches were deleted. Every one still resolves with its recorded conclusion, which is what makes the URLs valid citations in plan 03-05's findings document — the evidence outlives the refs it was produced from.

| Run | Workflow | Conclusion | SHA | Still resolves |
|---|---|---|---|---|
| [31702392047](https://github.com/six2dez/drift/actions/runs/31702392047) | Windows LLRT Primitive Probe | **success** | `0a05174` | **yes** |
| [31703442673](https://github.com/six2dez/drift/actions/runs/31703442673) | Windows LLRT Primitive Probe | **failure** | `faff52f` | **yes** |
| [31703717548](https://github.com/six2dez/drift/actions/runs/31703717548) | Windows LLRT Primitive Probe | **failure** | `4e82c2a` | **yes** |
| [31703442594](https://github.com/six2dez/drift/actions/runs/31703442594) | CI | **success** | `faff52f` | **yes** |
| [31703717437](https://github.com/six2dez/drift/actions/runs/31703717437) | CI | **success** | `4e82c2a` | **yes** |

The probe-negative **artifact** also survives: `name=windows-llrt-probe-3 id=9182180741 size=1769 expired=false`.

---

## Task Commits

1. **Task 1: probe-negative** — `faff52f` (`test(03-04)`) on `scratch/ci-proof-windows-probe-negative`, **deliberately destroyed with its branch**. It survives only in run record `31703442673`. No working-branch commit: the plan's output is "no net change to any repository file", so there was nothing to commit on `main` — the 01-06 Task 2 / 03-02 Task 2 / 03-03 Task 1 precedent.
2. **Task 2: gate-negative** — `4e82c2a` (`chore(03-04)`) on `scratch/ci-proof-windows-gate-negative`, likewise destroyed with its branch, surviving in run record `31703717548`.
3. **Task 3: teardown** — verification and remote cleanup only, no file changed, **no commit**. Its evidence is the assertion table above.

Both scratch commit messages open with `DELIBERATE DEFECT`, name plan 03-04, state that the branch is throwaway, and enumerate the expected CI outcome — so the run record is self-labelling at commit level as well as at log level.

**Plan metadata:** see the `docs(03-04)` commit carrying this SUMMARY and `STATE.md`.

## Decisions Made

- **Two independent branches, both cut from `0a05174`, never from each other.** The gate step (4) precedes the probe step (5) and a step without `if:` defaults to `if: success()`. A combined mutation would have failed at the gate and skipped the probe, destroying Task 1's proof. The gate-negative run demonstrates that skip directly, so this is now measured rather than predicted.
- **P0-TMP mutated, not P0-ENV.** D-05 makes `FAIL [P0-ENV]` a project-stopping blocker; a fabricated one in a permanent public archive is a trap. P0-TMP gates the exit code identically under D-06.
- **A self-labelling canary naming a nonexistent secret, in a comment.** Its text is what the gate quotes into the public log, so the mitigation had to be in the canary itself rather than in commentary elsewhere.
- **Net-zero proven by blob hash, not by revert.** Branch-before-mutate means the working branch never held the defect at all; the hash comparison is the proof that this construction actually held.

## Deviations from Plan

None — plan executed exactly as written. No deviation rule fired: no bug, no missing critical functionality, no blocking issue, no architectural question. Both mutations behaved exactly as the plan predicted, on the first run each.

One note that is **not** a deviation: Tasks 1 and 3 produced no working-branch commit, and Task 2's only commit lives on a deleted branch. That is the specified output ("no net change to any repository file"), not a skipped task.

## Issues Encountered

**1. `cut -f3-` alone does not strip the `gh run view --log` prefix — it leaves the timestamp.** 03-03 handed forward "strip the prefix with `cut -f3-`, never with a BSD-`sed` `\t` class", which is correct as far as it goes but incomplete. The real structure is `<job>\t<step>\t<ISO-timestamp> <content>` — the timestamp is separated from the content by a **space**, not a tab, so it is part of field 3. After `cut -f3-` an anchored `grep -cE '^(PASS|FAIL) \['` returned **0 for all seven IDs** while the artifact held 7. Caught only because the artifact count was already known. The full working form is:

```bash
cut -f3- raw.txt \
  | perl -pe 's/\x1b\[[0-9;]*m//g' \
  | perl -pe 's/^\d{4}-\d{2}-\d{2}T[\d:.]+Z //'
```

**2. BSD `sed` does not interpret `\x1b` either.** The same class of bug, one layer down: `sed -E 's/\x1b\[[0-9;]*m//g'` is a silent no-op on macOS, leaving `^[[36;1m` sequences in the "stripped" output. `perl -pe` handles both the escape and the timestamp. This is `[01-06]` issue 2 and `[03-03]` issue 1 recurring a third time in a third costume — **the durable lesson is not about `\t` or `\x1b` specifically, it is that any log-extraction pipeline must be validated against a known-nonzero expected count before its result is trusted.** Every extraction in this plan was cross-checked against an independently-obtained count.

**3. Both Windows probe runs completed in 18-19 seconds**, consistent with 03-03. The `CI` runs on the same commits were already `completed` on the first poll.

## Known Stubs

None. Nothing was mocked, hardcoded or deferred. Both defects were real code changes running on a real Windows host, both were observed through the API rather than narrated, and both were destroyed with their branches.

## Threat Flags

None — no new security surface. No endpoint, auth path, file-access pattern or schema change was introduced. The one secrets-shaped string that briefly existed on the public remote is analysed below.

Threat register dispositions applied:

- **T-03-13** (a deliberate mutation escaping onto the working branch) — *mitigated, and proven rather than asserted.* Each mutation was made only **after** switching to its own throwaway branch cut from `0a05174`, so neither ever existed in a commit on `main` by construction. Each was staged with a targeted `git add <single path>`; `git add -A` was never used. Both files' blob hashes on `main` equal the values recorded before the edits, and both marker greps (`win32x`, `CANARY`) return **0**. `git log main | grep -c 'DELIBERATE DEFECT'` = **0**.
- **T-03-14** (fabricating a misleading failure in the permanent run archive) — *mitigated.* The probe mutation targeted **P0-TMP, not P0-ENV**, so no fabricated `FAIL [P0-ENV]` — the line D-05 makes a project-stopping blocker — exists in a public run record. The gate canary names a nonexistent secret and contains the literal `CANARY` plus this plan's number, so the gate's own `grep -n` output in the public log announces itself: `# CANARY (deliberate, plan 03-04): …`. Both commit messages open with `DELIBERATE DEFECT` and cite plan 03-04, and this SUMMARY labels both runs.
- **T-03-21** (committing a secrets expression to a public branch) — *accepted, and every accepting condition was measured.* The canary was a YAML comment (`canary-in-parsed-yaml=False` — it does not survive into the parsed document, so the expression was never evaluated); it named `DRIFT_PROBE_GATE_CANARY`, which does not exist in this repository, so an evaluated expression would have resolved to empty; and it lived on a branch for ~3 minutes before Task 3 deleted it. No real secret value was referenced, printed or reachable at any point. Both negative runs' `GITHUB_TOKEN` was `contents: read`.
- **T-03-05** (scratch branches surviving on a public remote) — *mitigated.* All three deleted locally and remotely; `scratch-glob-empty=0` from a `test -z` discrimination, with the full unfiltered listing recorded showing only `main` and the pre-existing `fix/security-hotfixes`. The `T-01-32` precedent from `01-06` carried forward.
- **T-03-06** (a green probe job that proves nothing) — *this is where it is discharged.* The job concluded `failure` at the probe step **specifically** (step 5, gate green at step 4), the artifact still uploaded with exactly one summary line per ID, and the four `Verify (Node N)` legs stayed green on the same commit so the run discriminates rather than being uniformly red.
- **T-03-24** (a D-10 gate that cannot fail outliving the spike into Phases 4-8) — *this is where it is discharged.* The gate's match arm was exercised on a real Windows run, read back as a step-level conclusion from the API by its contract name, with the probe step observed `skipped` and the upload step observed `failure` — simultaneously proving `if-no-files-found: error` is not decorative. The gate is the only part of this phase that survives Phase 9's deletion, which is why it is the one assertion that had to be falsified rather than reasoned about.
- **T-03-15** (a second workflow firing on each negative branch confusing attribution) — *accepted, and wanted.* Both `CI` and the probe fired on every branch by design (D-01). The four green `CI` legs on each negative commit are exactly what make each probe-workflow red attributable.
- **T-03-11** (a probe result quietly retried until green) — *not triggered.* Nothing was re-run. Each defect produced its intended red on its first and only run, and both are recorded.
- **T-03-SC** (npm/pnpm installs) — *n/a and measured.* Nothing was installed. `package.json` and `pnpm-lock.yaml` are unmodified (`tree-clean-for-phase=0` covers both paths explicitly).

## Next Phase Readiness

**Ready for 03-05 (D-12, the findings document).** Every falsifiability input it needs is above and measured: two run URLs with per-step conclusions read by contract name, the failing artifact's per-ID counts, the verbatim `FAIL [P0-TMP]` line, the gate's quoted match and failure arm, the `No files were found` upload error, and the four green `Verify` legs on each negative commit.

Carried forward:

- **A2 and Pitfall 1 are closed empirically.** `shell: bash` → `bash --noprofile --norc -eo pipefail {0}` → the probe's exit code survives `| tee`. Any Phase 4-9 workflow that pipes a gating command must keep `shell: bash`; without it a `FAIL` can sit in an artifact under a green tick.
- **The five step names are still an unbroken contract.** All five resolved by their exact 03-02 strings on both negative runs, in a third and fourth independent reading.
- **The D-10 gate is proven in all three of its arms across the phase:** the clean arm (status 1) on 03-03's run and in both of this plan's local pre-flights, the match arm (status 0) on run `31703717548`, and the unreadable arm is the one still unexercised — structurally present (03-02 measured the third `exit 1` site at line 141) but never fired. Phases 4-8 inherit a gate that has been *observed* to bite.
- **`if-no-files-found: error` and `if: always()` are both proven, and each needed a different run to prove it.** `if: always()` is only visible on a red probe run; `if-no-files-found: error` is only visible when the results file is genuinely absent. A single run cannot demonstrate both.
- **`ROADMAP.md` and `REQUIREMENTS.md` left byte-identical.** CI-02 stays `[ ]` / `Pending` — **plan 03-05 owns that mark**, and it now has the falsifiability evidence D-13's spirit requires alongside 03-03's positive result.
- **The public remote is clean.** Zero `scratch/*` branches; `origin/main` still `2d8cf16`, never pushed by this phase. Local `main` is 17 commits ahead and remains unpushed.

## Self-Check: PASSED

| Claim | Command | Result |
|---|---|---|
| `03-04-SUMMARY.md` exists | `[ -f … ]` | verified at commit time |
| Probe-negative run `31703442673` | `gh run view --json jobs` | **failure**, step 5 `Run LLRT Windows primitive probe` = failure, step 6 `Upload probe results` = **success** |
| Gate-negative run `31703717548` | `gh run view --json jobs` | **failure**, step 4 gate = failure, step 5 probe = **skipped**, step 6 upload = **failure** |
| CI run `31703442594` (same SHA as probe-negative) | `gh run view --json jobs` | **success**, 4/4 legs |
| CI run `31703717437` (same SHA as gate-negative) | `gh run view --json jobs` | **success**, 4/4 legs |
| Baseline run `31702392047` still resolves | `gh run view --json conclusion` | **success** |
| Artifact `windows-llrt-probe-3` | `gh api …/artifacts` | **FOUND**, 1769 bytes, `expired=false` |
| `/tmp/drift-probe-negative/probe-results.txt` | `test -f` | **FOUND**, 32 lines |
| Seven IDs, one line each, on the failing artifact | `grep -cE` ×7 | **1, 1, 1, 1, 1, 1, 1** |
| `FAIL [P0-TMP]` present exactly once | `grep -cE '^FAIL \[P0-TMP\]:'` | **1** |
| `indeterminate` absent | `grep -c` | **0** |
| Probe blob byte-identical on `main` | `git rev-parse HEAD:scripts/windows-llrt-probe.mjs` | `bd9338f…` — **matches pre-mutation** |
| Workflow blob byte-identical on `main` | `git rev-parse HEAD:.github/workflows/windows-llrt-probe.yml` | `6941ddb…` — **matches pre-mutation** |
| Two-file D-10 gate on `main` | `grep -nE 'CAIDO_(TOKEN)\|secret(s)\.' <2 files>` | **`secret-gate-status=1`** (clean) |
| `scratch/*` on origin | `test -z "$(git ls-remote --heads origin 'scratch/*')"` | **`scratch-glob-empty=0`** — none survive |
| `origin/main` unchanged | `git ls-remote --heads origin main` | `2d8cf16` — **unchanged** |
| Working tree clean | `git status --porcelain` | *(empty)* |

---
*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Completed: 2026-08-13*
