---
phase: 03-ci-spike-prove-llrt-basics-on-windows
plan: 05
subsystem: docs
tags: [findings, ci-02, evidence-record, d-11, d-12, d-13, state-blocker, libuv, transcription-integrity]

# Dependency graph
requires:
  - "03-03 — run 31702392047, the seven verbatim assertion lines, per-step conclusions, exit code, banner and every INFO line"
  - "03-04 — the two falsifiability runs (31703442673, 31703717548) and the teardown assertions"
  - "03-02 — the static half: pin comparison, parsed triggers, the five contract step names, three-branch gate structure"
  - "03-01 — the probe's design, the single-emission contract and the darwin baseline that P0-ENV inverts"
  - "01-06 — the run-table and per-leg-conclusion shapes, and the rule that a CI claim carries its run URL and the log line proving the mechanism"
provides:
  - "03-FINDINGS.md — the durable, citable CI-02 verdict that outlives the 2026-09-12 artifact expiry (D-11)"
  - "CI-02 marked Complete in REQUIREMENTS.md — the first Phase 3 plan authorised to do so, and only after the evidence landed (D-13)"
  - "The STATE.md env-passthrough blocker settled in place with the verbatim PASS line and the libuv eleven-name bound attached"
  - "Two [03-05] decisions: the P1-CMD -> cmd.exe /c consequence, and the Phase 9 deletion date with the D-10 gate named as the surviving property"
affects: [04, 05, 06, 07, 08, 09, 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verbatim evidence lines are machine-diffed against their source summary rather than eyeballed — transcription integrity is measured, not asserted"
    - "A measured PASS is recorded unedited and bounded separately, with the bound explicitly labelled source analysis rather than measurement"
    - "Gaps are explicit `not measured` rows naming what is missing and where it closes, never filled from the research phase's predictions"

key-files:
  created:
    - .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
    - .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-05-SUMMARY.md
  modified:
    - .planning/STATE.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "D-05 branch taken: RESOLVED, not OPEN. P0-ENV returned PASS on a real windows-latest host, so the blocker closes and Phase 4 is unblocked — but the entry carries the libuv eleven-name bound, because a bare 'resolved' would license an architecture the measurement does not support."
  - "The blocker entry was rewritten in place a second time. Plan 03-03 had already converted it from the original `is unverified (P0 risk)` text; 03-05 rewrote that RESOLVED entry rather than appending, keeping the Blockers/Concerns entry count at 7 and preserving the stable `env-passthrough` token."
  - "Every verbatim line in 03-FINDINGS.md was diffed against 03-03-SUMMARY.md / 03-04-SUMMARY.md programmatically — seven PASS lines, the FAIL line, the verdict line, the fifteen INFO lines and the four-line banner all came back byte-identical."
  - "The one quoted string that deliberately does NOT match a measured line — `FAIL [P1-CMD]: spawnError=EINVAL` — is labelled in the document as a quote from 03-RESEARCH.md's prediction table, with the PASS/FAIL divergence from the probe explained rather than silently reconciled."

patterns-established:
  - "The findings document states the ROADMAP success-criterion gap explicitly rather than letting a phase-level tick imply the criterion was literally met"
  - "Falsifiability proofs are recorded as their own section with the failing step named, because a red run in a public archive is otherwise indistinguishable from an unresolved problem"

requirements-completed: [CI-02]

# Metrics
duration: 8min
completed: 2026-08-13
---

# Phase 3 Plan 05: The CI-02 Verdict Summary

**`03-FINDINGS.md` now records all seven assertions with their result, run URL and verbatim probe line, both falsifiability proofs, and the libuv bound that stops P0-ENV's PASS from licensing an architecture the measurement does not support — and CI-02 is marked Complete for the first time in the phase, after the evidence rather than before it.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-08-13T13:21Z
- **Completed:** 2026-08-13T13:29Z
- **Tasks:** 2
- **Files:** 2 created, 2 modified — no product code, no CI runner burned
- **CI runs consumed:** **0.** This plan only re-queried the eight existing run records.

## The D-05 branch taken: RESOLVED, not OPEN

The branch is selected by the measurement, not by judgement. **P0-ENV returned PASS**, so the blocker resolves and Phase 4 is unblocked. The verbatim line that drove it, from [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047):

```
PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)
```

The `.cmd`-launcher fallback named in the original blocker is therefore **not required for env injection**. It is required for a different reason — `PASS [P1-CMD]: spawn-threw-sync … EINVAL` means direct `.cmd` spawn is unusable regardless — and the findings document keeps those two facts separate so a later reader does not collapse them.

**A bare "resolved" would have been the wrong record.** The probe's own derived guidance says Phases 4-8 "need not spread `...process.env`", and that generalises past what was measured. libuv back-fills exactly eleven `required_vars`; `APPDATA` and `LOCALAPPDATA` — the two `command-resolution.ts` needs for the Windows nvm/fnm paths — are not among them. Both the blocker entry and the findings document carry that bound, labelled as **source analysis, not measurement**.

## The STATE.md entry, before and after

**Before** (as written by plan 03-03 — note the entry had already lost the original `is unverified (P0 risk)` wording):

> `- RESOLVED 2026-08-13 (plan 03-03): `spawn({env})` env-passthrough on Windows is **verified**, measured on a real `windows-latest` host ([run 31702392047](…), Windows Server 2025, Node v24.18.1). `PASS [P0-ENV]` — the child received the sentinel through the `env` option and `PATH` remained visible to it. **Bound on the result:** this is not a merge of the parent environment. libuv back-fills exactly eleven `required_vars` (PATH among them; `APPDATA`/`LOCALAPPDATA` **not**), so Phases 4-8 must still spread `...process.env` for anything outside that list. The `.cmd`-launcher fallback is not needed for env injection — but `PASS [P1-CMD]: spawn-threw-sync … EINVAL` means direct `.cmd` spawn is unusable regardless, so **`.cmd` targets must be routed through `cmd.exe /c`** for reasons unrelated to env. Details and verbatim lines: `03-03-SUMMARY.md`.`

**After** (rewritten in place, `.planning/STATE.md:104`):

> `- RESOLVED 2026-08-13 (plan 03-05): Windows `spawn` **env-passthrough** — `spawn(node, [script], { env })` — is **proven** on a real `windows-latest` host ([run 31702392047](…), Windows Server 2025 / 10.0.26100, Node v24.18.1; measured in plan 03-03, verdict recorded here). Verbatim: `PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)`. **Replace-versus-merge, the detail Phase 4 actually builds against:** the `env` option *replaces* on both platforms; what differs is a Windows-only libuv back-fill of exactly eleven `required_vars` (`HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR`), which is why the child saw `PATH-VISIBLE` here and `PATH-ABSENT` on darwin. `APPDATA` and `LOCALAPPDATA` are **not** on that list — exactly what `command-resolution.ts` needs for the Windows nvm/fnm paths — so Phase 4 must pass `{ ...process.env, ...driftVars }`, never `{ ...driftVars }`. The `.cmd`-launcher fallback named in the original entry is therefore **not required** for env injection. Vehicle caveat: Node, not LLRT — faithful for this assertion because LLRT's `child_process` reaches the same Windows `CreateProcess` through `tokio::process::Command` and its `env` option has no Windows-specific branch. Canonical verdict, all seven assertions with verbatim lines, run URLs and both falsifiability proofs: `03-FINDINGS.md`.`

Four things changed and one was preserved: the plan attribution now points at the plan that recorded the verdict (with the measuring plan named inside so attribution is not lost), the **full verbatim** `PASS [P0-ENV]` line replaces the bare `PASS [P0-ENV]` tag, the eleven variable names are enumerated rather than counted, the vehicle caveat is stated, and the pointer moves from `03-03-SUMMARY.md` to `03-FINDINGS.md`. The stable `env-passthrough` token survived the rewrite, which is what keeps the entry greppable (T-03-22).

## Measured verification

Every value is a command's recorded output.

### Task 1 — `03-FINDINGS.md`

| Check | Measured | Required |
|---|---|---|
| File exists | **FOUND**, 365 lines | exists, ≥ 60 lines |
| Per-ID mentions (`P0-ENV`/`P0-TMP`/`P1-CMD`/`P1-WHERE`/`P2-OS`/`P3-VARS`/`P3-UUID`) | **15 / 11 / 16 / 7 / 6 / 8 / 7** | ≥ 1 each |
| `grep -c 'https://github.com/six2dez/drift/actions/runs/'` | **16** | ≥ 3 |
| `grep -c 'node-vehicle'` | **6** | ≥ 2 |
| `grep -c 'if-no-files-found'` | **3** | ≥ 1 |

### Transcription integrity — machine-diffed, not eyeballed (T-03-16)

This is the plan's load-bearing check: the whole document is a transcription, and a paraphrase here becomes fact for Phases 4-8.

| Block | Method | Result |
|---|---|---|
| The seven `PASS [ID]:` lines | `diff` of the sorted extracts from `03-FINDINGS.md` and `03-03-SUMMARY.md` | **SEVEN-LINES-IDENTICAL** (7 vs 7) |
| The seven lines as **inline table cells** | Python extraction of every `` `PASS \|FAIL [...]` `` backtick span, set-membership against both source summaries | **ok=7, drifted=0** |
| `FAIL [P0-TMP]` (probe-negative run) | `diff` against `03-04-SUMMARY.md` | **FAIL-LINE-IDENTICAL** |
| `PROBE PASSED:` verdict line | `diff` against `03-03-SUMMARY.md` | **VERDICT-LINE-IDENTICAL** |
| All 15 `INFO [ID]:` lines | `diff` against `03-03-SUMMARY.md` | **INFO-BLOCK-IDENTICAL** |
| The 4-line banner | `diff` against `03-03-SUMMARY.md` | **BANNER-IDENTICAL** |

Two backtick spans were flagged by the extractor as not matching a measured line, and both are correct:

1. `FAIL [P1-CMD]: spawnError=EINVAL` — a quote from `03-RESEARCH.md:618`'s **prediction** table, verified present there (`grep -cF` → **1**) and labelled in the document as a research-table row key, not a measurement.
2. `FAIL [P0-TMP]` — a bare ID reference inside prose ("green with `FAIL [P0-TMP]` in the artifact"), not an evidence line.

The extractor catching both is itself the point: the check discriminates rather than passing vacuously.

### Run records — all re-queried before citing

`gh run view --json conclusion,headSha,workflowName` on each, **after** 03-04 deleted the branches:

| Run | Workflow | Conclusion | SHA |
|---|---|---|---|
| [31702174047](https://github.com/six2dez/drift/actions/runs/31702174047) | Windows LLRT Primitive Probe | failure (the `setup-node` defect) | `5977634` |
| [31702392047](https://github.com/six2dez/drift/actions/runs/31702392047) | Windows LLRT Primitive Probe | **success** | `0a05174` |
| [31703442673](https://github.com/six2dez/drift/actions/runs/31703442673) | Windows LLRT Primitive Probe | failure (intended) | `faff52f` |
| [31703717548](https://github.com/six2dez/drift/actions/runs/31703717548) | Windows LLRT Primitive Probe | failure (intended) | `4e82c2a` |
| [31702174105](https://github.com/six2dez/drift/actions/runs/31702174105) | CI | success | `5977634` |
| [31702392113](https://github.com/six2dez/drift/actions/runs/31702392113) | CI | success | `0a05174` |
| [31703442594](https://github.com/six2dez/drift/actions/runs/31703442594) | CI | success | `faff52f` |
| [31703717437](https://github.com/six2dez/drift/actions/runs/31703717437) | CI | success | `4e82c2a` |

**8 of 8 still resolve.** No URL was cited on the strength of a prior summary's claim that it resolved.

### Source-claim verification — the hand-off line numbers

The plan asserts Drift's two production `spawn()` call sites pass only `stdio`. Verified against the live file rather than trusted:

```
packages/backend/src/index.ts:853   spawn("which", [command])
packages/backend/src/index.ts:1191  spawn(launchPath, [], { stdio: ["pipe","pipe","pipe"] })
packages/backend/src/index.ts:1521  spawn(cmd, args, { stdio: ["pipe","pipe","pipe"] })
packages/backend/src/index.ts:2188  spawn(launchCommand, launchArgs, { stdio: ["pipe","pipe","pipe"] })
```

Confirmed: **no `env` option at any call site.** The findings document's hand-off says so explicitly — Phase 4 is *adding* a mechanism, not proving an existing one keeps working.

The gate's three `exit 1` sites were also re-measured on the current workflow: lines **116 / 137 / 142** (03-02 measured 97 / 118 / 123 before 03-03's 19-line `package-manager-cache` fix shifted them). The third arm — status 2, unreadable target — is recorded in the findings document as **still unexercised**.

### Task 2 — STATE.md

| Check | Measured | Required |
|---|---|---|
| `grep -c 'env-passthrough'` | **3** | ≥ 1 |
| `grep -nE '^\- (RESOLVED\|OPEN).*env-passthrough'` | matches **line 104** | matches |
| `grep -c 'is unverified (P0 risk)'` | **0** | 0 |
| `grep -c '03-FINDINGS.md'` | **5** | ≥ 1 |
| `grep -c 'https://…/actions/runs/'` | **5** | ≥ 1 |
| Blocker entries before → after | **7 → 7** | unchanged (rewritten, not appended) |
| `check_scope` entry | **1**, diff shows 0 changed lines touching it | untouched |
| `OPEN DECISION (user, outside git)` entry | **1**, untouched | untouched |
| Gemini-on-Windows entry | **1**, untouched | untouched |
| Diff at the content commit | **6 insertions / 4 deletions**, one file | scoped |

### Scope containment

| Path | `git status --porcelain` |
|---|---|
| `.planning/ROADMAP.md` | *(empty)* — **left untouched per the orchestrator's instruction** |
| `packages/`, `scripts/`, `.github/`, `package.json`, `pnpm-lock.yaml` | *(empty)* — **0 paths** |
| `.planning/REQUIREMENTS.md` diff | exactly **2 lines**: `:75` checkbox and `:136` traceability row |

`git add -A` was never used; every stage was a targeted `git add <path>`.

## CI-02 — marked Complete, and the ordering that made it legitimate

This is the first Phase 3 plan authorised to mark it, and the mark came **after** the findings document was written and committed (`b6c480e`), not before. That ordering is the whole point of D-13.

```
.planning/REQUIREMENTS.md:75   - [x] **CI-02**: A CI spike proves the 7 LLRT assertions …
.planning/REQUIREMENTS.md:136  | CI-02 | Phase 3 | Complete |
```

Plans 03-01 through 03-04 all carried `requirements: [CI-02]` and all four correctly declined to mark it — 03-01 had to actively **revert** an automatic mark applied after plan 1 of 5. The requirement reads "A CI spike **proves** the 7 LLRT assertions"; it is now backed by a recorded run that produced all seven assertion lines, plus two runs proving the signal could have gone the other way.

## Task Commits

1. **Task 1: `03-FINDINGS.md`** — `b6c480e` (`docs`) — 1 file, +365
2. **Task 2: STATE.md blocker + decisions + position** — `d9195bd` (`docs`) — 1 file, +6/-4

**Plan metadata:** the `docs(03-05)` commit carrying this SUMMARY, the corrected `STATE.md` and `REQUIREMENTS.md`.

## Decisions Made

- **The findings document is a standalone evidence record, not a plan SUMMARY.** It opens with the verdict and the vehicle caveat *before* any result table, because a reader arriving from a Phase 6 `PLAN.md` citation needs the fidelity ceiling before the numbers, not after them.
- **The verbatim line is a table column AND a diffable fenced block.** The plan mandates the column; the block exists so the whole set can be `diff`ed against the source in one command, which is how the integrity check above was actually run.
- **The ROADMAP criterion-2 gap is stated in prose, not softened.** The criterion says "inside the Caido backend runtime"; what was measured is Node on `windows-latest`. The document says the criterion is **not literally met** and names D-08 labelling as the adopted mitigation.
- **A `## Not measured` section with five explicit rows** rather than silence — including the one that matters most for Phase 4: *no variable outside libuv's eleven was measured*, so the bound is source analysis. `03-RESEARCH.md`'s predictions were never used to fill a gap (D-12).
- **The blocker keeps its `(plan 03-05)` prefix but names 03-03 inside as the measuring plan.** The prefix follows the section convention and the plan's acceptance criterion; the inline clause keeps attribution honest.

## Deviations from Plan

### 1. [Plan-spec note] The blocker entry the plan describes no longer existed

- **Found during:** Task 2
- **Issue:** The plan directs the executor to edit the entry reading "LLRT `spawn({env})` env-passthrough on Windows is unverified (P0 risk)…". Plan 03-03 had already rewritten that entry into a `RESOLVED 2026-08-13 (plan 03-03)` form, so `grep -c 'is unverified (P0 risk)'` was **already 0** before this plan started.
- **Handling:** No deviation rule fired — the plan's *intent* (one entry, rewritten in place, carrying the measured outcome, the verbatim line, an inline run URL and the stable token) is unambiguous regardless of which text is being replaced. The 03-03 entry was rewritten in place. The acceptance criteria are satisfied on their own terms: entry count unchanged at 7, stale phrase 0, exactly one entry covering Windows spawn env-passthrough.
- **Files modified:** `.planning/STATE.md` only.

### 2. [Tooling] `gsd-tools state` writers clobbered STATE.md, as they did in all three prior plans

- **Found during:** state updates, after both task commits
- **Issue:** Four separate defects, matching what 03-01/03-02/03-03 recorded:
  - `state record-metric` (named-flag form; the positional form is still rejected) appended `| Phase 03 P05 | 8min | 2 tasks | 2 files |` **after** the `*Updated after each plan completion*` marker instead of into the `**By Phase:**` table.
  - `state record-session` overwrote the frontmatter `last_activity` and the `Last activity:` line with a bare `2026-08-13`, destroying the descriptive text this plan had just written.
  - `state advance-plan` correctly returned `{advanced: false, reason: "last_plan", status: "ready_for_verification"}` and rewrote `Status:`, dropping the `03-FINDINGS.md` pointer.
  - `state update-progress` reported `percent: 91 (10 of 11)` but the `progress:` block still read `completed_plans: 10 / percent: 5`, and the `Progress:` bar is a hand-curated milestone-phase count the tool's format does not match.
- **Fix:** hand-corrected. The stray row was deleted and the `By Phase` row is now `| 03 | 5 of 5 | 38min | ~8min |`; `last_activity` and `Last activity:` restored with the plan's outcome; `Status:` restored with the findings pointer; `progress:` set to `completed_phases: 2 / completed_plans: 11 / percent: 10` and the bar advanced to `20% (2 of 10 milestone phases)`, since Phase 3 is now complete. Velocity totals and the Recent Trend line updated.
- **Verification:** `grep -c '^| Phase 03 P05'` → **0**; guarded-entry greps all unchanged; blocker count still 7.
- **Note:** the plan says not to hand-maintain the `progress:` block, and the file's own comment says to re-correct it *after* the SDK writers run. That is what was done — corrected once, at the end, rather than maintained throughout.

### 3. [Scope] `ROADMAP.md` deliberately not updated

Per the orchestrator's explicit instruction (`roadmap update-plan-progress` edits the wrong `**Plans:**` line — the defect plan 03-01 hit). `git status --porcelain .planning/ROADMAP.md` is empty.

---

**Total deviations:** 0 auto-fixed (no deviation rule fired), 1 plan-spec note, 1 tooling defect corrected, 1 scope note
**Impact on plan:** none on the deliverable. Every acceptance criterion is satisfied on its own terms.

## Issues Encountered

**1. The log-extraction caveat did not recur — because no log was extracted.** Three consecutive plans hit a silently-empty grep pipeline (`\t` in BSD `sed`, then `\x1b`, then the space-separated timestamp surviving `cut -f3-`). This plan sidestepped the class entirely: all seven lines were already captured verbatim in `03-03-SUMMARY.md` by two independent paths that were `diff`ed at the time, so the correct move was to transcribe from the committed source and **machine-verify the transcription**, not to re-extract from `gh run view --log`. The durable rule from `[03-04]` still applied in spirit — every check above was validated against an independently-known expected count (7 lines, 7 IDs, 8 runs), so a check returning 0 could not masquerade as a pass.

**2. `state record-metric` still rejects positional arguments.** `state record-metric 03 05 8min 2 2` → `{"error": "phase, plan, and duration required"}`; the `--phase/--plan/--duration/--tasks/--files` form works. Fourth plan in a row. Unchanged from 03-02's finding.

**3. A blob-level detail worth carrying:** `03-04-SUMMARY.md` records the gate's third `exit 1` site at workflow line **141**; it is now at **142**. Neither is wrong — 03-02 measured 123 pre-fix, and 03-03's `package-manager-cache` fix added 19 lines above the gate step. Any future assertion on that gate should anchor on text, not on a line number.

## Known Stubs

None. Nothing was mocked, hardcoded or deferred. The `## Not measured` section of `03-FINDINGS.md` is the opposite of a stub: it is an explicit, enumerated record of what this phase could not close and where each gap closes.

## Threat Flags

None — no new security surface. No endpoint, auth path, file-access pattern or schema change. Two documentation files written; nothing installed.

Threat register dispositions applied:

- **T-03-16** (transcription drift between the run output and the committed verdict) — *this is where it is discharged.* Six independent `diff`/set-membership checks, all byte-exact: seven PASS lines, the seven inline table cells, the FAIL line, the verdict line, fifteen INFO lines, and the four-line banner. The extractor additionally flagged the two backtick spans that intentionally do not match a measured line, and both are labelled in the document as a research **prediction** and a prose ID reference respectively. No value came from `03-RESEARCH.md`'s predictions; gaps are five explicit "not measured" rows (D-12).
- **T-03-17** (a Node-vehicle result later read as an LLRT result) — *mitigated.* The vehicle caveat sits **before** the first result table with a per-assertion fidelity column that says "faithful", "source-verified, not measured" and "unverified" rather than one blanket sentence. `grep -c 'node-vehicle'` → **6**; the P2-OS and P3-UUID rows carry their D-08 labels verbatim inside byte-verified lines. The ROADMAP criterion-2 gap is stated as **not literally met**.
- **T-03-18** (a failed P0-ENV downgraded to a note and Phase 4 proceeding on an unproven mechanism) — *not triggered, and the branch was selected by the measurement.* P0-ENV passed. The failure branch was written into the plan in advance and never applied. The residual danger — a PASS being over-read — was handled instead by attaching the libuv bound to both the blocker and the findings document, and by recording that Drift's two production `spawn()` sites have **no** `env` option today (verified against `index.ts`, not quoted from the plan).
- **T-03-19** (collateral edits to unrelated STATE.md entries) — *mitigated and measured.* The four named regions are untouched: `git diff` matching `check_scope|OPEN DECISION \(user|Gemini-on-Windows` → **0 lines**. Blocker entry count 7 → 7. The `progress:` block was touched only in the final correction pass, after the SDK writers ran, which is what the file's own comment prescribes.
- **T-03-22** (the rewritten blocker becoming unfindable) — *mitigated.* `grep -c 'env-passthrough'` → **3**, and `grep -nE '^\- (RESOLVED|OPEN).*env-passthrough'` resolves the entry at line 104. The `spawn({env})` literal the old entry was greppable by did not need to survive.
- **T-03-01** (secret material reaching a committed document) — *mitigated by construction.* The only secret-shaped values quoted anywhere are the synthetic `drift-probe-sentinel-1786625796867` and the deliberately nonexistent `DRIFT_PROBE_GATE_CANARY`. The findings document additionally records *why* the canary is safe (a YAML comment proven not to survive `yaml.safe_load`, naming a secret that does not exist) so a future reader encountering it in the public log is not alarmed.
- **T-03-SC** (npm/pnpm installs) — *n/a and measured.* Nothing installed. `git status --porcelain -- packages/ scripts/ .github/ package.json pnpm-lock.yaml` → **0 paths**.

## Next Phase Readiness

**Phase 3 is complete and CI-02 is closed with evidence.** Phase 4 can start.

What Phase 4 inherits, all citable from `03-FINDINGS.md` rather than from an expiring artifact:

- **The env-injection architecture is confirmed, with a hard constraint.** Pass `{ ...process.env, ...driftVars }`, never `{ ...driftVars }`. The eleven-name libuv back-fill covers `PATH` but not `APPDATA`/`LOCALAPPDATA`, which `command-resolution.ts` needs.
- **`cmd.exe /c` is mandatory for `.cmd`/`.bat` targets**, and `spawn()` throws **synchronously** on them — a `try`/`catch` around the call itself is required, not just an `error` handler.
- **`where.exe` replaces `which` at `index.ts:853`**, invoked by absolute path, split on `/\r?\n/`, expecting multiple lines.
- **Keep the custom hex-loop UUID generator at `index.ts:829`.** P3-UUID is the one assertion with no source-level LLRT confirmation in either direction.
- **Normalise before comparing paths.** `os.tmpdir()` returned the 8.3 short form while `USERPROFILE` returned the long form; they are not string-comparable.
- **Any new Windows CI job must set `package-manager-cache: false`** on `actions/setup-node@v5` unless it also runs `pnpm/action-setup@v6` first. Static review against `ci.yml` cannot catch this.

Open and unchanged by this plan: the `check_scope` correctness gap (Phase 2), the branch-protection user decision, Gemini-on-Windows reliability, and the untracked `IMPROVEMENT-PLAN.md`. Phase 9 still owes the deletion of `windows-llrt-probe.yml` / `windows-llrt-probe.mjs` and must carry the D-10 gate forward.

## Self-Check: PASSED

| Claim | Command | Result |
|---|---|---|
| `03-FINDINGS.md` exists | `[ -f … ]` | **FOUND**, 365 lines |
| `03-05-SUMMARY.md` exists | `[ -f … ]` | **FOUND** |
| `.planning/STATE.md` exists | `[ -f … ]` | **FOUND** |
| `.planning/REQUIREMENTS.md` exists | `[ -f … ]` | **FOUND** |
| Commit `b6c480e` (Task 1) | `git log --oneline --all \| grep` | **FOUND** |
| Commit `d9195bd` (Task 2) | `git log --oneline --all \| grep` | **FOUND** |
| All seven IDs present in findings | `grep -c` ×7 | **15, 11, 16, 7, 6, 8, 7** |
| Run URLs cited | `grep -c 'actions/runs/'` | **16** (≥ 3 required) |
| D-08 labels survive | `grep -c 'node-vehicle'` | **6** (≥ 2 required) |
| `if-no-files-found` proof recorded | `grep -c` | **3** |
| Seven verbatim lines byte-identical to source | `diff` | **IDENTICAL** |
| INFO block / banner / verdict / FAIL line | `diff` ×4 | **IDENTICAL** ×4 |
| 8 run records resolve | `gh run view --json` ×8 | **8/8**, conclusions as recorded |
| Blocker rewritten in place | entry count before/after | **7 → 7** |
| Stale blocker phrase gone | `grep -c 'is unverified (P0 risk)'` | **0** |
| Guarded STATE.md entries untouched | `git diff \| grep -c` | **0 lines** |
| CI-02 marked | `sed -n '75p;136p'` | `- [x] **CI-02**` / `\| CI-02 \| Phase 3 \| Complete \|` |
| `ROADMAP.md` untouched | `git status --porcelain` | *(empty)* |
| Product code untouched | `git status --porcelain -- packages/ scripts/ .github/ …` | **0 paths** |
| `origin/main` unpushed | `git ls-remote --heads origin main` | **`2d8cf16`** — unchanged |
| No `scratch/*` branches | `git ls-remote --heads origin` | only `main` + pre-existing `fix/security-hotfixes` |

---
*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Completed: 2026-08-13*
