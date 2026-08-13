---
phase: 03-ci-spike-prove-llrt-basics-on-windows
plan: 03
subsystem: ci
tags: [windows-latest, llrt, probe, ci-proof, scratch-branch, setup-node, spawn-env, cmd-einval, libuv]

# Dependency graph
requires:
  - "03-01 — scripts/windows-llrt-probe.mjs, the instrument whose seven assertions this plan measures on a real host"
  - "03-02 — .github/workflows/windows-llrt-probe.yml, the five-step contract this plan reads conclusions from"
  - "01-06 — the scratch-branch → push → `gh run view --json jobs` → delete pattern, and its two recorded grep failure modes"
provides:
  - "D-13 satisfied: a real windows-latest run (31702392047) produced all seven assertion lines, all PASS, recorded verbatim with the run URL"
  - "P0-ENV measured on Windows: the spawn env option did NOT clear PATH (child reported PATH-VISIBLE) — the opposite of the darwin measurement"
  - "P1-CMD conclusive: spawn-threw-sync / EINVAL — Phases 4-8 must route .cmd targets through cmd.exe /c"
  - "permissions: contents: read proven sufficient for actions/upload-artifact@v5 (03-02's open question, closed)"
  - "The setup-node@v5 package-manager-cache defect and its fix, without which no Windows job in this repo can run without a pnpm step"
  - "Source-analysis caveat bounding the P0-ENV result to libuv's 11-name required_vars back-fill"
affects: [03-04, 03-05, 04, 05, 06, 07, 08, 09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Artifact captured by resolved name into an explicit out-of-tree directory with `test -f` asserted before any grep"
    - "Log cross-check strips ANSI with sed but splits the `<job>\\t<step>\\t<ts>` prefix with `cut -f3-`, because BSD sed does not interpret `\\t`"
    - "A measured CI result is bounded by source analysis when the probe's own conclusion line generalises further than the measurement supports"

key-files:
  created:
    - .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-03-SUMMARY.md
  modified:
    - .github/workflows/windows-llrt-probe.yml

key-decisions:
  - "setup-node@v5 defaults package-manager-cache to true and auto-enables caching from package.json's packageManager field, so it shells out to a pnpm binary this workflow deliberately never installs. Fixed with `package-manager-cache: false` rather than by adding pnpm/action-setup@v6, which would have undone 03-02's zero-dependency design."
  - "The fix was committed on the working branch and the scratch branch fast-forwarded to it, rather than committed only to the scratch branch — the defect is real and permanent, and 03-04 runs the same workflow."
  - "P0-ENV's PASS is recorded verbatim AND bounded: libuv back-fills exactly 11 named variables (PATH among them, APPDATA and LOCALAPPDATA not) into a supplied env block on Windows. The probe's derived guidance 'need not spread ...process.env' holds only for those 11."

patterns-established:
  - "Both runs are recorded when a fix-and-rerun happens, including the run that never reached the probe"
  - "A green tick on a step is not the exit code; the probe's exit 0 is read from the step conclusion plus the absence of a 'Process completed with exit code' line"

requirements-completed: []

# Metrics
duration: 9min
completed: 2026-08-13
---

# Phase 3 Plan 03: Real windows-latest Probe Run Summary

**A real `windows-latest` host ran the seven-assertion probe and returned **all seven PASS at exit 0** — but only after the first run died at `Setup Node` with `Unable to locate executable file: pnpm`, a `setup-node@v5` default that would have blocked every Windows job in this repo. The headline result inverts the darwin baseline: on Windows the spawn `env` option left `PATH` visible to the child, where on darwin it was absent.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-13T12:51:43Z
- **Completed:** 2026-08-13T13:00:26Z
- **Tasks:** 2
- **Files modified:** 1 (`.github/workflows/windows-llrt-probe.yml`, +19 lines) — no product code

## The Two Probe Runs

Run table in the `01-06-SUMMARY.md` shape.

| # | Purpose | Branch | Commit | Run URL | Conclusion |
|---|---------|--------|--------|---------|------------|
| 1 | First real `windows-latest` run | `scratch/ci-proof-windows-probe` | `5977634` | https://github.com/six2dez/drift/actions/runs/31702174047 | **failure** (never reached the probe — see Deviations) |
| 2 | The D-13 run — all seven assertions | `scratch/ci-proof-windows-probe` | `0a05174` | https://github.com/six2dez/drift/actions/runs/31702392047 | **success** |

Both ran on a genuine Windows host: runner `2.336.0`, **Microsoft Windows Server 2025 (10.0.26100)**, image `windows-2025-vs2026` version `20260803.193.1`, Azure region `eastus`. `GITHUB_TOKEN` permissions logged as `Contents: read`, `Metadata: read` — the `permissions: contents: read` block took effect.

### Run 2 — per-step conclusions, read from `gh run view 31702392047 --json jobs`

Job `Windows LLRT primitive assertions (CI-02)` — **success**, `12:56:24Z` → `12:56:42Z` (18s).

| # | Step (03-02's contract names) | Conclusion |
|---|---|---|
| 1 | `Set up job` | **success** |
| 2 | `Checkout` | **success** |
| 3 | `Setup Node` | **success** |
| 4 | `Assert no secret material is reachable (D-10)` | **success** |
| 5 | `Run LLRT Windows primitive probe` | **success** |
| 6 | `Upload probe results` | **success** |
| 11 | `Post Setup Node` | **success** |
| 12 | `Post Checkout` | **success** |
| 13 | `Complete job` | **success** |

All five contract step names resolved by the exact strings 03-02 recorded — none has drifted.

### Run 1 — per-step conclusions (the failure, recorded not discarded)

Job **failure**, `12:53:12Z` → `12:53:28Z` (16s).

| # | Step | Conclusion |
|---|---|---|
| 1 | `Set up job` | success |
| 2 | `Checkout` | success |
| 3 | `Setup Node` | **failure** |
| 4 | `Assert no secret material is reachable (D-10)` | skipped |
| 5 | `Run LLRT Windows primitive probe` | skipped |
| 6 | `Upload probe results` | **failure** |

`Upload probe results` failed with `No files were found with the provided path: probe-results.txt. No artifacts will be uploaded.` — **not** a permissions error. That is `if-no-files-found: error` doing exactly the job 03-02 designed it for: the run had no evidence, so it refused to be green. Artifact count for run 1: **0**.

## Probe exit code

**0.** Measured two ways, neither of them a tick:

- `Run LLRT Windows primitive probe` concluded `success`, and `shell: bash` resolves to `bash --noprofile --norc -eo pipefail {0}`, so `pipefail` carries the probe's status through `tee` rather than reporting tee's.
- No `Process completed with exit code` line appears anywhere in the run log (`grep -E 'Process completed with exit code'` over the ANSI-stripped log → no match). Actions emits that line only for a non-zero step.

Consistent with the probe's own verdict line, which only prints on the all-PASS path.

## Banner line (carries `process.version`, pitfall 5)

```
node=v24.18.1 process.platform=win32 execPath=C:\hostedtoolcache\windows\node\24.18.1\x64\node.exe
```

`v24.18.1` is far past **18.20.2**, so the CVE-2024-27980 `.cmd` EINVAL guard is present — which is what makes the P1-CMD result below interpretable rather than ambiguous.

Full header, verbatim:

```
=== Drift Windows/LLRT primitive probe (Phase 3, CI-02) ===
node=v24.18.1 process.platform=win32 execPath=C:\hostedtoolcache\windows\node\24.18.1\x64\node.exe
vehicle: Node.js, NOT LLRT — no standalone LLRT Windows binary exists (upstream dropped it at v0.6.0-beta).
the .cmd guard from CVE-2024-27980 exists only on Node >= 18.20.2, so the node version above is part of the record.
```

## Artifact capture

| Property | Value |
|---|---|
| Resolved name | `windows-llrt-probe-2` (via `gh api repos/six2dez/drift/actions/runs/31702392047/artifacts --jq '.artifacts[0].name'`) |
| Artifact id / size | `9181786136` / **1638 bytes** |
| Expires | `2026-09-12T12:56:37Z` (30 days — hence D-11's committed findings document) |
| Download command | `gh run download 31702392047 -n "$ART" -D /tmp/drift-probe-artifact` |
| Landed at | `/tmp/drift-probe-artifact/probe-results.txt` (**31 lines**) |
| `test -f` before any grep | **PASS** — asserted, printed `ARTIFACT-PRESENT=yes` |

The name is `windows-llrt-probe-**2**` — `github.run_number`, not the run id `31702392047`. Reconstructing it from the run id, or running a bare `gh run download`, would have produced a `windows-llrt-probe-2/` subdirectory and every grep below would have measured nothing while looking successful. 03-02's hand-off note about this was correct and load-bearing.

## The seven assertion lines — verbatim, unedited

Copied byte-for-byte from `/tmp/drift-probe-artifact/probe-results.txt`, `=== Summary ===` block.

```
PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)
PASS [P0-TMP]: platform is Windows and os.tmpdir()="C:\\Users\\RUNNER~1\\AppData\\Local\\Temp" is drive-lettered and exists on disk
PASS [P1-CMD]: spawn-threw-sync — spawn() threw synchronously with EINVAL: spawn EINVAL (EINVAL is expected on Node >= 18.20.2 from the CVE-2024-27980 guard; EPERM/EBUSY from a Defender handle and ENOENT are equally conclusive). Phases 4-8 must route .cmd targets through cmd.exe /c
PASS [P1-WHERE]: where.exe resolved node to "C:\\hostedtoolcache\\windows\\node\\24.18.1\\x64\\node.exe" (ends in .exe) across 2 CRLF-split line(s)
PASS [P2-OS]: the bare specifier for the os built-in resolved at import time; reaching this assertion is the proof (node-vehicle; LLRT resolver verified by source analysis)
PASS [P3-VARS]: USERPROFILE, APPDATA, LOCALAPPDATA are all present and non-empty
PASS [P3-UUID]: randomUUID is available (globalThis.crypto=true, node:crypto=true) (node-vehicle; LLRT crypto surface unverified)
```

Final verdict line, verbatim:

```
PROBE PASSED: P0-ENV, P0-TMP, P1-CMD are all PASS — the direct spawn+env architecture holds and P1-CMD was conclusive. Proceed to Phase 4.
```

D-08's labels survived onto the archived artifact: the P2-OS line ends `(node-vehicle; LLRT resolver verified by source analysis)` and P3-UUID ends `(node-vehicle; LLRT crypto surface unverified)`. `grep -c 'node-vehicle;'` = **2**. The artifact cannot be misread as an LLRT result.

### Per-ID grep counts

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

Not 0 (ID never reached the summary) and not 2 (inline emission reintroduced). 03-01's single-emission contract holds on Windows exactly as it did on darwin.

Whole-file aggregates: `^PASS ` = **7**, `^FAIL ` = **0**, `grep -c 'indeterminate'` = **0**. D-07 is satisfied without any escalation — P1-CMD named its surface on the first run that reached it.

### Log cross-check

The seven lines were independently extracted from `gh run view 31702392047 --log`, ANSI-stripped and prefix-stripped, and `diff`ed against the artifact extract: **IDENTICAL, 7 lines byte-for-byte**. Two independent capture paths agree, so neither is a transcription.

## Every INFO line — verbatim

```
INFO [P0-ENV]: spawning C:\hostedtoolcache\windows\node\24.18.1\x64\node.exe -e <inline> with env={SENTINEL} and nothing else (execPath is absolute, so the child needs no PATH to start)
INFO [P0-ENV]: isolated-env surface=close exit=0 stdout="drift-probe-sentinel-1786625796867|PATH-VISIBLE" stderr="" error=none
INFO [P0-ENV]: the env option merged into the parent environment block — child reported PATH-VISIBLE, so Phases 4-8 inherit the parent block and need not spread ...process.env
INFO [P0-TMP]: os.tmpdir()="C:\\Users\\RUNNER~1\\AppData\\Local\\Temp" os.platform()="win32"
INFO [P0-TMP]: drive-letter=true exists-on-disk=true
INFO [P1-CMD]: wrote C:\Users\RUNNER~1\AppData\Local\Temp\probe-test-1786625796936.cmd with CRLF line endings; spawning it directly with a 5000 ms bound
INFO [P1-CMD]: surface=throw exit=null stdout="" stderr="" error=EINVAL: spawn EINVAL
INFO [P1-WHERE]: resolving the binary by absolute path: C:\Windows\System32\where.exe
INFO [P1-WHERE]: surface=close exit=0 parsed-lines=2 lines=["C:\\hostedtoolcache\\windows\\node\\24.18.1\\x64\\node.exe","C:\\Program Files\\nodejs\\node.exe"]  stderr="" error=none
INFO [P2-OS]: the un-prefixed built-in specifier "os" resolved at module load (typeof tmpdir=function, typeof platform=function)
INFO [P3-VARS]: checking USERPROFILE, APPDATA, LOCALAPPDATA by explicit name (process.env is never enumerated)
INFO [P3-VARS]: USERPROFILE = C:\Users\runneradmin
INFO [P3-VARS]: APPDATA = C:\Users\runneradmin\AppData\Roaming
INFO [P3-VARS]: LOCALAPPDATA = C:\Users\runneradmin\AppData\Local
INFO [P3-UUID]: globalThis.crypto.randomUUID=true node:crypto randomUUID=true
```

## P0-ENV — the replace-versus-merge observation, and its boundary

This is the result Phases 4-8's env-injection architecture rests on, and the two platforms disagree:

| Host | Child reported | Probe's wording |
|---|---|---|
| darwin (03-01, local) | `PATH-ABSENT` | "that option **replaced** the parent environment" |
| **windows-latest** (this run) | `PATH-VISIBLE` | "that option **merged** into the parent environment" |

**The measurement is exactly as recorded and is not edited here.** But the probe's *derived guidance* — "Phases 4-8 inherit the parent block and need not spread `...process.env`" — generalises further than the measurement supports, and Phase 4 must not adopt it as written.

**Source analysis (analysis, NOT measurement — flagged as such per D-08's spirit).** libuv `src/win/process.c` (`v1.x`) does not merge the parent environment. It back-fills a fixed, sorted list of variables into the supplied block when they are absent — `make_program_env()` compares against `required_vars[]` and, for each missing one, calls `GetEnvironmentVariableW` against the *parent* process (line 715). The list is exactly eleven names:

```
HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT,
TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR
```

The header comment states the intent: *"Windows has a few 'essential' environment variables… We therefore ensure that these get defined if the input environment block does not contain any values for them."*

So the underlying semantic is **identical on both platforms — the `env` option replaces**. What differs is a Windows-only back-fill of eleven names, `PATH` among them. That is precisely why the child saw `PATH-VISIBLE` here and `PATH-ABSENT` on darwin, and the agreement between the measurement and the source is what makes both trustworthy.

**Consequence for Phase 4, stated plainly:** `APPDATA` and `LOCALAPPDATA` are **not** on that list. CLAUDE.md's POSIX-surface table already names `%APPDATA%\nvm\…` and `%LOCALAPPDATA%\fnm\…` as the Windows version-manager paths `command-resolution.ts` will need. Any child spawned with an explicit `env` option that must see those variables still has to spread `...process.env` (or name them explicitly). The safe reading of P0-ENV is: **PASS, and PATH specifically survives — do not generalise past the eleven.** Plan 03-05 should carry this bound into the findings document; a probe extension that measures a non-required variable directly is a candidate for Phase 4 rather than an edit here (P1-CMD was conclusive, so this plan's only sanctioned probe edit was not triggered).

## Other results worth carrying forward

- **P1-CMD is `spawn-threw-sync` / `EINVAL: spawn EINVAL`** — the CVE-2024-27980 guard fires. Direct `.cmd` spawn is unusable; **Phases 4-8 must route `.cmd` targets through `cmd.exe /c`**. One of the four surfaces, named, on the first attempt.
- **`os.tmpdir()` returned the 8.3 short form** `C:\Users\RUNNER~1\AppData\Local\Temp`, while `USERPROFILE` returned the long form `C:\Users\runneradmin`. Both are valid and both exist on disk, but they are not string-comparable. Any Phase 4-8 code that compares a temp path against a profile-derived path must normalise first.
- **`where.exe` returned 2 CRLF-split lines**, first being the hostedtoolcache node. A resolver that reads only the first line gets the right answer here, but the multi-line CRLF shape is confirmed real.
- **`permissions: contents: read` is sufficient** for `actions/upload-artifact@v5` — 03-02 flagged this as an unproven divergence with "widen and re-run" as the remedy. It did not need widening. **03-02's open question is closed.**
- **The D-10 gate ran on a real Windows host and passed**, printing its status-1 arm verbatim: `Gate passed: no Caido token reference and no GitHub secrets expression in .github/workflows/windows-llrt-probe.yml or scripts/windows-llrt-probe.mjs`.

## Task 1 — local pre-flight, measured exit codes

Verification-only; no file changed, so no commit (the 01-06 Task 2 / 03-02 Task 2 precedent).

| Gate | Measured | Required |
|---|---|---|
| `pnpm lint` (redirect, `$?` read directly — **not** through a pipe) | **exit 0** | 0 |
| `pnpm -r typecheck` (shared, backend, frontend) | **exit 0** | 0 |
| `actionlint .github/workflows/windows-llrt-probe.yml` (1.7.12) | **exit 0**, no output | 0 |
| D-10 two-file `test -f` loop | printed `both-gate-targets-present`, no `GATE-TARGET-MISSING` | both present |
| **D-10 two-file gate grep** | **`secret-gate-status=1`** | exactly 1 |
| `git ls-files --error-unmatch` both new files | **both-tracked** | tracked |
| `git status --porcelain -- packages/ package.json pnpm-lock.yaml` via `test -z` | **`product-code-clean=0`**, `product-code-dirty:` empty | 0 |
| Phase diff vs merge-base `2d8cf16` under those paths | **0 paths** | 0 |
| Working tree | fully clean — **no untracked files at all** | — |
| `git add -A` used anywhere | **never** — targeted `git add <path>` only | never |

**The D-10 two-file gate is now proven, and this is the phase's only pre-push execution of it in the exact form the workflow step runs.** 03-02 explicitly deferred it and declined to claim it; `secret-gate-status=1` is the substantive result, distinct from that plan's single-file scan. Status 0 would have meant a real match or self-matching patterns; status 2 would have meant a path was wrong and the check proved nothing.

Re-run **after** the Task 2 fix edited the workflow: still `secret-gate-status=1`, `actionlint` still exit 0, and 03-02's anchored invariants all still hold (`pnpm-uncommented=0`, `shell-bash=2`, `runs-on-windows=1`, `branches-key=0`, `setup-node-v5=1`, plus the new `package-manager-cache: false` at count 1).

## The four `Verify (Node N)` legs — same SHA

`CI` run [31702392113](https://github.com/six2dez/drift/actions/runs/31702392113) at `0a05174` — the identical commit the probe ran on. Conclusion **success**.

| Leg | Conclusion | Typecheck | Lint | Test | Build |
|---|---|---|---|---|---|
| `Verify (Node 20)` | **success** | success | success | success | success |
| `Verify (Node 22)` | **success** | success | success | success | success |
| `Verify (Node 24)` | **success** | success | success | success | success |
| `Verify (Node 26)` | **success** | success | success | success | success |

This applies `[01-06]`'s negative-leg rule: the new top-level `scripts/` directory passes real-CI `eslint . --max-warnings 0` on all four Node majors, so the pre-existing quality gate is provably intact and any red on the probe job is attributable to the probe alone. The CI run at the pre-fix SHA `5977634` ([31702174105](https://github.com/six2dez/drift/actions/runs/31702174105)) was **also** success — the `setup-node` defect was confined to the probe workflow and never touched `ci.yml`.

## Task Commits

1. **Task 1: Local pre-flight** — verification only, no file changed, **no commit**. Evidence is the table above.
2. **Task 2: Real `windows-latest` run** — `0a05174` (`fix`) — the Rule 3 auto-fix below. The run evidence itself is not a file.

**Plan metadata:** see the `docs(03-03)` commit carrying this SUMMARY and `STATE.md`.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `setup-node@v5` auto-enables a pnpm cache and fails without a pnpm binary

- **Found during:** Task 2, run 1 (`31702174047`)
- **Issue:** `Setup Node` failed with `##[error]Unable to locate executable file: pnpm. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable.` The D-10 gate and the probe were both **skipped**, so the run produced no assertion lines at all — and `Upload probe results` then failed on `if-no-files-found: error`. Zero of the seven measurements existed.
- **Root cause (confirmed against the action's own `action.yml` at `v5`, not from memory):** `package-manager-cache` is a `@v5` input defaulting to `true`, described as *"Set to false to disable automatic caching based on the package manager field in package.json. By default, caching is enabled if the package manager field is present."* This repo's `package.json:20` declares `"packageManager": "pnpm@9.0.0"`, so the action enabled pnpm caching and shelled out to a pnpm binary. The run log's echoed inputs show `package-manager-cache: true` even though the workflow never set it. `ci.yml` survives its explicit `cache: pnpm` only because `pnpm/action-setup@v6` runs **ahead** of `Setup Node` — its comment at `ci.yml:32-34` says exactly that. Under `@v4` caching was opt-in through `cache:` alone, which is why `ci.yml` has no analogous line and why 03-02's static review could not have caught this.
- **Fix:** added `package-manager-cache: false` to the `Setup Node` step with a 16-line comment recording the run id, the mechanism, the `ci.yml` asymmetry, and a "do not delete this to match ci.yml" warning. Deliberately **not** fixed by adding `pnpm/action-setup@v6`, which would have reversed 03-02's considered decision that this workflow installs nothing (the probe has zero dependencies; an install step adds ~1 min of Windows runner time plus a failure surface that says nothing about the seven assertions).
- **Files modified:** `.github/workflows/windows-llrt-probe.yml` (+19 lines, 0 deletions; no pre-existing line touched)
- **Verification:** `actionlint` exit 0; D-10 two-file gate still `secret-gate-status=1`; 03-02's anchored invariants unchanged; run 2 reached all five steps and concluded success.
- **Commit:** `0a05174`
- **Not a retry-until-green.** T-03-11 governs re-running an inconvenient *probe* result. This job never reached the probe — there was no assertion outcome to re-roll. Both runs are recorded above, including the failure.

### 2. [Deviation - scope] The fix was committed on the working branch, not only on the scratch branch

- **Issue:** The plan's remediation text says "commit to the scratch branch with a targeted `git add`, push, and re-run". Taken literally, the fix would die with the branch at 03-04's teardown.
- **Fix:** committed on `main` (the working branch) and fast-forwarded `scratch/ci-proof-windows-probe` to that SHA, preserving the plan's SHA-identity property (`SHA-MATCH=yes` re-asserted, `0a05174` on both). The defect is permanent and 03-04 runs the same workflow, so the fix must outlive the scratch branch.
- **`main` was never pushed.** `origin/main` is still `2d8cf16004b40a30dfd7721d99f2bf3e2b19e270`, byte-identical to its value before this plan started. Every push used the explicit refspec `scratch/ci-proof-windows-probe:refs/heads/scratch/ci-proof-windows-probe`.

### 3. [Plan-spec note] The plan's `<files>none</files>` on Task 2 could not hold

Task 2 declares "verification only". A Rule 3 blocking fix was unavoidable — without it no `windows-latest` job in this repository can run at all, and D-13 would be unreachable. One file changed, in the phase's own workflow; no product code.

---

**Total deviations:** 1 auto-fixed (1 blocking issue), 1 scope adjustment, 1 plan-spec note
**Impact on plan:** none on the deliverable. All seven assertions were measured, the escalation path was never entered, and the scratch branch is left in the state 03-04 expects.

## Issues Encountered

**1. BSD `sed` does not interpret `\t`, so the log cross-check silently measured nothing.** The first attempt used `sed -E 's/^[^\t]*\t[^\t]*\t//'` to strip `gh run view --log`'s `<job>\t<step>\t<timestamp>` prefix. On macOS that character class excludes a literal backslash and `t`, not a tab, so the substitution was a no-op — and the subsequent anchored grep returned **0 lines** while the artifact held 7. This is `01-06`'s issue 2 in a new costume: a grep returning nothing is indistinguishable from a proof that failed. Caught only because the artifact count was already known to be 7. Fixed with `cut -f3-` (tab is `cut`'s default delimiter) plus `LC_ALL=C` for the multi-byte em-dash in the P1-CMD line. **Carry to 03-04:** strip the log prefix with `cut -f3-`, never with a BSD-`sed` `\t` class.

**2. The Windows probe job is fast — 16-18s.** Run 1 was already `completed`/`failure` within ~15s of the push. Do not assume a `windows-latest` run needs a long poll before it is worth reading.

## Known Stubs

None. Nothing was mocked, hardcoded or deferred. The one caveat above is a *bound on interpretation* of a real measurement, explicitly labelled as source analysis rather than measurement, not a placeholder.

## Threat Flags

None — no new security surface. No endpoint, auth path, file-access pattern or schema change.

Threat register dispositions applied:

- **T-03-05** (information disclosure via a public remote) — *mitigated.* One scratch branch, created at an already-committed SHA. Every push used an explicit scratch-only refspec; `origin/main` is unchanged. Every stage was a targeted `git add <path>`; `git add -A` was never used. The working tree had **no** untracked files at any point (`IMPROVEMENT-PLAN.md` is now `.gitignore`d), so nothing unreviewed could have been staged.
- **T-03-06** (integrity of the recorded verification signal) — *mitigated.* Per-step conclusions read from `gh run view --json jobs`, never inferred from the YAML. The seven lines were taken verbatim from a name-resolved artifact download into `/tmp/drift-probe-artifact` with `test -f` asserted before any grep, then independently re-extracted from the ANSI-stripped log and `diff`ed — **identical**. The one grep that did silently measure nothing was caught and is recorded above rather than hidden.
- **T-03-11** (a non-zero probe exit quietly retried until green) — *not triggered, and could not have been.* The probe reached its summary exactly once and returned 7/7 PASS at exit 0. Run 1 never executed the probe, so no assertion result was ever re-rolled. Both runs are recorded.
- **T-03-02** (probe output in a public artifact) — *held as accepted, and inspected.* The 1638-byte artifact contains three runner-scoped `C:\Users\runneradmin` paths, hostedtoolcache paths, version strings, and the synthetic `drift-probe-sentinel-1786625796867`. No user or org data. The D-10 gate ran and passed before the probe printed anything.
- **T-03-12** (a probe defect turning the pre-existing quality gate red) — *mitigated and measured.* `pnpm lint` exit 0 in the pre-flight via redirect, and all four `Verify (Node N)` legs concluded `success` at the identical SHA with `Lint` green on each.
- **T-03-23** (the D-10 gate never proven in its real two-file form) — *mitigated, and this is where it was discharged.* Both targets asserted present, identical command string, `secret-gate-status=1`, re-run after the workflow edit. Additionally observed passing on the real Windows host.
- **T-03-SC** (npm/pnpm installs) — *n/a and measured.* Nothing installed. `package.json` and `pnpm-lock.yaml` unmodified, confirmed both in the working tree and across the full phase diff against `2d8cf16`. Ironically the phase's one defect was caused by an action trying to *use* pnpm, and the fix was to stop it rather than to install anything.

## Scratch branch state — normal path

P1-CMD was conclusive on the first run that reached the probe, so the early-termination teardown was **not** entered. Per the plan, the branch is deliberately left alive for 03-04.

```
git ls-remote --heads origin            → fix/security-hotfixes  0cd81f3   (pre-existing, not ours)
                                          main                   2d8cf16   (UNCHANGED)
                                          scratch/ci-proof-windows-probe  0a05174
git ls-remote --heads origin 'scratch/*' → scratch/ci-proof-windows-probe only
```

Exactly one `scratch/*` branch. **Plan 03-04 owns its deletion.**

## Next Phase Readiness

- **Ready for 03-04.** The baseline it compares its deliberate-FAIL runs against exists: run `31702392047`, 7/7 PASS, exit 0. The workflow is now proven to actually run on Windows — 03-04 would otherwise have spent its first run rediscovering the `setup-node` defect. Two hand-offs: strip log prefixes with `cut -f3-`, and `win32-literal=1` in the probe is unchanged by this plan.
- **Ready for 03-05 (D-12).** Every input the findings document needs is above and measured: run URL, per-step conclusions, exit code, banner, seven verbatim lines, all INFO lines, per-ID counts, and the four negative legs. **03-05 must carry the P0-ENV bound**, not just the PASS.
- **CI-02 still `[ ]` / `Pending`** in `.planning/REQUIREMENTS.md`, left byte-identical, as was `ROADMAP.md`. The evidence D-13 demands now exists, but 03-05 records the verdict and owns the mark.
- **STATE.md blocker resolved.** "LLRT `spawn({env})` env-passthrough on Windows is unverified (P0 risk)" is closed by this run — with the eleven-name bound attached, and the `.cmd` fallback it named now known to be *required* for `.cmd` targets regardless, since P1-CMD returned EINVAL.

## Self-Check: PASSED

| Claim | Command | Result |
|---|---|---|
| `03-03-SUMMARY.md` exists | `[ -f … ]` | verified at commit time |
| `.github/workflows/windows-llrt-probe.yml` modified | `git show --stat 0a05174` | 1 file, +19/-0 |
| Commit `0a05174` exists | `git log --oneline -1` | **FOUND** |
| Probe run 31702392047 | `gh run view` | **success**, sha `0a05174` |
| Probe run 31702174047 | `gh run view` | **failure**, sha `5977634` |
| CI run 31702392113 (same SHA) | `gh run view --json jobs` | **success**, 4/4 legs |
| Artifact `windows-llrt-probe-2` | `gh api …/artifacts` | **FOUND**, 1638 bytes |
| `/tmp/drift-probe-artifact/probe-results.txt` | `test -f` | **FOUND**, 31 lines |
| Seven IDs, one line each | `grep -cE` ×7 | **1, 1, 1, 1, 1, 1, 1** |
| `indeterminate` absent | `grep -c` | **0** |
| `origin/main` unchanged | `git ls-remote --heads origin main` | `2d8cf16` — **unchanged** |
| Working tree clean | `git status --porcelain` | *(empty)* |

---
*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Completed: 2026-08-13*
</content>
</invoke>
</invoke>
