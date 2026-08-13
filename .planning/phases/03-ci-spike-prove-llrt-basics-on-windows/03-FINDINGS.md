# Phase 3 Findings — Windows/LLRT Primitive Probe (CI-02)

**Recorded:** 2026-08-13, plan 03-05, **after** the runs completed and from their measured output (D-12).
**Canonical for:** Phases 4-8. Cite this file, not the CI artifacts — those expire 2026-09-12 (D-11).
**Vehicle:** Node.js on `windows-latest`, **not** LLRT. Read the vehicle caveat below before any result.

---

## Verdict

**The direct-spawn plus env-injection architecture is confirmed for Phases 4-8, and the `.cmd`-launcher fallback named in the STATE.md blocker is not required for env injection.** On a real `windows-latest` host (Windows Server 2025 / 10.0.26100, Node `v24.18.1`) all seven assertions returned PASS at exit 0 with zero `indeterminate` results — [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047). `spawn(node, [script], { env })` delivered the sentinel to the child and the child still saw `PATH`; `os.tmpdir()` returned a drive-lettered path that exists on disk; and `P1-CMD` fired the **`spawn-threw-sync` / `EINVAL`** surface — conclusive on the first run that reached the probe, so D-07's escalation path was never entered.

Two consequences bind Phases 4-8 harder than the bare PASSes suggest, and both are recorded in full below rather than buried:

1. **P1-CMD selects the `cmd.exe /c` architecture.** Direct `.cmd` spawn is unusable on Node ≥ 18.20.2 because of the CVE-2024-27980 guard. A `cmd.exe /c` branch is **mandatory**, not recommended.
2. **P0-ENV's PASS does not license "the parent environment is inherited".** Source analysis of libuv (below) bounds it to eleven back-filled variable names. `APPDATA` and `LOCALAPPDATA` — precisely what `command-resolution.ts` needs for the Windows nvm/fnm paths — are **not** among them.

Both verification gates were falsified on separate runs, so this is a result that could have been otherwise rather than a green tick.

---

## Vehicle caveat — read this before any result table

**The probe ran on Node.js. LLRT was never executed.** No standalone LLRT Windows binary exists: upstream `awslabs/llrt` dropped the Windows target at `v0.6.0-beta`, and `caido/dependency-llrt` publishes no releases. Running Caido headless in CI to get the real runtime requires a paid Teams plan. The probe therefore measures the *platform* faithfully and the *runtime* only by proxy.

Per-assertion fidelity, stated honestly rather than uniformly:

| Assertion | Fidelity basis | Confidence |
|---|---|---|
| `P0-ENV` | LLRT's `child_process` uses `tokio::process::Command`, reaching the same Windows `CreateProcess` that Node reaches through libuv; LLRT's `env` option calls `env_clear()` then `envs()` with no Windows-specific branch | **Faithful** — the OS-level mechanism is shared |
| `P0-TMP` | Same — `os.tmpdir()` resolves through the same Win32 environment/API surface | **Faithful** |
| `P1-CMD` | The measured EINVAL comes from Node's CVE-2024-27980 guard specifically. The *platform* behaviour (`.cmd` needs a shell) is universal; the *error code* is Node's | **Platform behaviour faithful; the error identity is Node's** |
| `P1-WHERE` | `where.exe` is an OS binary spawned by absolute path — nothing runtime-specific | **Faithful** |
| `P2-OS` | Closed by **source analysis** of LLRT's module resolver, which calls `name.trim_start_matches("node:")` — so a bare `"os"` specifier resolves there too. Not executed under LLRT | **Source-verified, not measured** |
| `P3-VARS` | Reading named `process.env` keys is not runtime-specific | **Faithful** |
| `P3-UUID` | **No source-level confirmation was obtained.** LLRT's crypto surface is unverified in both directions | **Unverified — Node result only** |

The user **accepted this ceiling as-is** (03-CONTEXT.md, `### Claude's Discretion`) and declined to make it a gate. Real-machine confirmation from the original Windows bug reporter (@0xMRK0S, reported 2026-06-24) was explicitly **considered as a completion gate for this phase and declined**, because it depends on a third party and could block Phase 4 indefinitely. It remains valuable before the Windows port ships and belongs to **Phase 9 or 10**. D-08's labelling requirement is the mitigation actually adopted, and the labels survived onto the archived artifact (`grep -c 'node-vehicle;'` = 2 on the downloaded `probe-results.txt`).

### ROADMAP success-criterion gap — stated plainly

The ROADMAP phrases this phase's tmpdir/platform criterion as holding **"inside the Caido backend runtime"**. What was actually measured is **Node.js on `windows-latest`**. That criterion is therefore **not literally met**, and nobody reading it later should treat it as met. The gap is accepted with D-08's labelling as the adopted mitigation, and it is the same gap the per-assertion table above quantifies. It closes only when a real Windows Caido installation exercises a later phase's build (Phase 9 or 10) — see Residual Risk.

---

## The runs

Run table in the `01-06-SUMMARY.md` shape. Every conclusion below was read from `gh run view --json jobs`, never inferred from the YAML. All branches are deleted; all run records were re-queried after deletion and still resolve.

| # | Purpose | Branch (deleted) | Commit | Run URL | Conclusion |
|---|---------|------------------|--------|---------|------------|
| 1 | First `windows-latest` attempt — died at `Setup Node`, never reached the probe | `scratch/ci-proof-windows-probe` | `5977634` | https://github.com/six2dez/drift/actions/runs/31702174047 | **failure** (defect, see Deviation below) |
| 2 | **The authoritative run** — all seven assertions | `scratch/ci-proof-windows-probe` | `0a05174` | https://github.com/six2dez/drift/actions/runs/31702392047 | **success** |
| 3 | Falsifiability — does a probe `FAIL` fail the job? | `scratch/ci-proof-windows-probe-negative` | `faff52f` | https://github.com/six2dez/drift/actions/runs/31703442673 | **failure — INTENDED** |
| 4 | Falsifiability — does the D-10 gate bite? | `scratch/ci-proof-windows-gate-negative` | `4e82c2a` | https://github.com/six2dez/drift/actions/runs/31703717548 | **failure — INTENDED** |

Runs 3 and 4 are red **on purpose**. A future reader must not treat them as unresolved problems — they are the phase's falsifiability evidence, and without them run 2's green would prove nothing.

Control legs on the same commits (`[01-06]`'s negative-legs rule — an all-red push discriminates nothing):

| Control | Commit | Run URL | Conclusion |
|---|---|---|---|
| `CI` (4× `Verify (Node N)`) at the authoritative SHA | `0a05174` | https://github.com/six2dez/drift/actions/runs/31702392113 | **success** (4/4 legs) |
| `CI` at the probe-negative SHA | `faff52f` | https://github.com/six2dez/drift/actions/runs/31703442594 | **success** (4/4 legs) |
| `CI` at the gate-negative SHA | `4e82c2a` | https://github.com/six2dez/drift/actions/runs/31703717437 | **success** (4/4 legs) |
| `CI` at the pre-fix SHA | `5977634` | https://github.com/six2dez/drift/actions/runs/31702174105 | **success** (the `setup-node` defect never touched `ci.yml`) |

### Per-step conclusions on the authoritative run

Job `Windows LLRT primitive assertions (CI-02)` — **success**, `12:56:24Z` → `12:56:42Z` (18s). All five contract step names from 03-02 resolved by their exact strings; none has drifted.

| # | Step | Conclusion |
|---|---|---|
| 2 | `Checkout` | success |
| 3 | `Setup Node` | success |
| 4 | `Assert no secret material is reachable (D-10)` | success |
| 5 | `Run LLRT Windows primitive probe` | **success** |
| 6 | `Upload probe results` | **success** |

`permissions: contents: read` was proven sufficient for `actions/upload-artifact@v5` — 03-02 flagged this as an unproven divergence from `ci.yml` with "widen and re-run" as the remedy. It did not need widening.

Host: runner `2.336.0`, **Microsoft Windows Server 2025 (10.0.26100)**, image `windows-2025-vs2026` version `20260803.193.1`, Azure `eastus`. `GITHUB_TOKEN` logged as `Contents: read`, `Metadata: read`.

### Banner — carries `process.version`, which the P1-CMD result is meaningless without

```
=== Drift Windows/LLRT primitive probe (Phase 3, CI-02) ===
node=v24.18.1 process.platform=win32 execPath=C:\hostedtoolcache\windows\node\24.18.1\x64\node.exe
vehicle: Node.js, NOT LLRT — no standalone LLRT Windows binary exists (upstream dropped it at v0.6.0-beta).
the .cmd guard from CVE-2024-27980 exists only on Node >= 18.20.2, so the node version above is part of the record.
```

`v24.18.1` is far past **18.20.2**, so the CVE-2024-27980 `.cmd` guard is present. Without this line the P1-CMD result would be ambiguous rather than conclusive.

---

## Per-assertion evidence

All from [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047), artifact `windows-llrt-probe-2` (id `9181786136`, 1638 bytes, expires `2026-09-12T12:56:37Z`). Per-ID grep counts on the downloaded artifact: exactly **1** for each of the seven IDs. Whole-file aggregates: `^PASS ` = **7**, `^FAIL ` = **0**, `indeterminate` = **0**.

| ID | Pri | Result | Verbatim probe output line | Consequence for Phases 4-8 |
|---|---|---|---|---|
| **P0-ENV** | P0 (gates) | **PASS** | `PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)` | The `env` option is the env-injection mechanism — the `#!/bin/bash` wrapper is replaceable on Windows. **Bounded:** see the libuv analysis below; `APPDATA`/`LOCALAPPDATA` must still be passed explicitly. |
| **P0-TMP** | P0 (gates) | **PASS** | `PASS [P0-TMP]: platform is Windows and os.tmpdir()="C:\\Users\\RUNNER~1\\AppData\\Local\\Temp" is drive-lettered and exists on disk` | `os.tmpdir()` replaces the hardcoded `/tmp` at `index.ts:1716`, `index.ts:1681–1691` and `index.ts:336`. **It returned the 8.3 short form** — see the normalisation note below. |
| **P1-CMD** | P1 (gates only if indeterminate) | **PASS — conclusive, surface `spawn-threw-sync`** | `PASS [P1-CMD]: spawn-threw-sync — spawn() threw synchronously with EINVAL: spawn EINVAL (EINVAL is expected on Node >= 18.20.2 from the CVE-2024-27980 guard; EPERM/EBUSY from a Defender handle and ENOENT are equally conclusive). Phases 4-8 must route .cmd targets through cmd.exe /c` | **A `cmd.exe /c` branch is mandatory.** Direct `.cmd` spawn is unusable. This is the outcome `03-RESEARCH.md:618` maps to "`buildSpawnSpec` cmd.exe branch is mandatory / Phase 7: cmd.exe /c branch required". |
| **P1-WHERE** | P1 (informational, D-09) | **PASS** | `PASS [P1-WHERE]: where.exe resolved node to "C:\\hostedtoolcache\\windows\\node\\24.18.1\\x64\\node.exe" (ends in .exe) across 2 CRLF-split line(s)` | `03-RESEARCH.md:625` row "first line ends `.exe`" → `node.exe` is on PATH and `where` resolves with extension. Replace the `which` spawn at `index.ts:853` with `where.exe`, invoked **by absolute path**, splitting on `/\r?\n/`. Multi-line CRLF output is confirmed real, not hypothetical. |
| **P2-OS** | P2 (informational, D-08) | **PASS** *(node-vehicle)* | `PASS [P2-OS]: the bare specifier for the os built-in resolved at import time; reaching this assertion is the proof (node-vehicle; LLRT resolver verified by source analysis)` | Bare `import … from "os"` — the form `index.ts` would use — resolves. **Node result; LLRT closed by source analysis only** (`name.trim_start_matches("node:")`). Not a measurement of the Caido runtime. |
| **P3-VARS** | P3 (informational, D-09) | **PASS** | `PASS [P3-VARS]: USERPROFILE, APPDATA, LOCALAPPDATA are all present and non-empty` | `command-resolution.ts`'s Windows nvm/fnm paths (`%APPDATA%\nvm\…`, `%LOCALAPPDATA%\fnm\…`) have their inputs **in the parent process**. Cross-read with P0-ENV's bound: two of these three are *not* back-filled into a child given an explicit `env` block. |
| **P3-UUID** | P3 (informational, D-08) | **PASS** *(node-vehicle)* | `PASS [P3-UUID]: randomUUID is available (globalThis.crypto=true, node:crypto=true) (node-vehicle; LLRT crypto surface unverified)` | **Does NOT license removing the custom hex-loop UUID generator at `index.ts:829`.** The vehicle was Node; Caido's runtime is not Node, and this is the one assertion with no source-level LLRT confirmation either way. Keep the hex loop. |

Final verdict line from the run, verbatim:

```
PROBE PASSED: P0-ENV, P0-TMP, P1-CMD are all PASS — the direct spawn+env architecture holds and P1-CMD was conclusive. Proceed to Phase 4.
```

The seven lines as a diffable block, byte-identical to the artifact and to `03-03-SUMMARY.md`:

```
PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)
PASS [P0-TMP]: platform is Windows and os.tmpdir()="C:\\Users\\RUNNER~1\\AppData\\Local\\Temp" is drive-lettered and exists on disk
PASS [P1-CMD]: spawn-threw-sync — spawn() threw synchronously with EINVAL: spawn EINVAL (EINVAL is expected on Node >= 18.20.2 from the CVE-2024-27980 guard; EPERM/EBUSY from a Defender handle and ENOENT are equally conclusive). Phases 4-8 must route .cmd targets through cmd.exe /c
PASS [P1-WHERE]: where.exe resolved node to "C:\\hostedtoolcache\\windows\\node\\24.18.1\\x64\\node.exe" (ends in .exe) across 2 CRLF-split line(s)
PASS [P2-OS]: the bare specifier for the os built-in resolved at import time; reaching this assertion is the proof (node-vehicle; LLRT resolver verified by source analysis)
PASS [P3-VARS]: USERPROFILE, APPDATA, LOCALAPPDATA are all present and non-empty
PASS [P3-UUID]: randomUUID is available (globalThis.crypto=true, node:crypto=true) (node-vehicle; LLRT crypto surface unverified)
```

These were captured twice by independent paths — downloaded from the name-resolved artifact with `test -f` asserted before any grep, and re-extracted from the ANSI-stripped run log — then `diff`ed: **identical, 7 lines byte-for-byte**. Neither capture is a transcription of the other.

**A naming note for anyone comparing this against `03-RESEARCH.md:616-621`:** that interpretation table keys the EINVAL row as `FAIL [P1-CMD]: spawnError=EINVAL`. The probe as built (03-01) records EINVAL as **PASS**, because D-07 makes *conclusiveness* the pass criterion for P1-CMD rather than the direction of the answer. The interpretation is unchanged — `cmd.exe /c` is mandatory either way. Only the PASS/FAIL label differs from the research prediction.

---

## INFO observations that carry architectural weight

Every `INFO` line from the authoritative run, verbatim:

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

### P0-ENV — replace versus merge, and the eleven-name bound

This is the observation Phases 4-8's env-injection architecture rests on, and it is **not recoverable from a bare PASS**, which is why the probe emits it as its own line. The two platforms disagree:

| Host | Child reported | Probe's wording |
|---|---|---|
| darwin (03-01, local dev host) | `PATH-ABSENT` | "that option **replaced** the parent environment" |
| **`windows-latest`** (run 31702392047) | `PATH-VISIBLE` | "that option **merged** into the parent environment" |

**The measurement is recorded above unedited. The probe's derived guidance in that third INFO line — "Phases 4-8 inherit the parent block and need not spread `...process.env`" — generalises further than the measurement supports, and Phase 4 must not adopt it as written.**

**Source analysis — ANALYSIS, NOT MEASUREMENT.** libuv `src/win/process.c` (`v1.x`) does not merge the parent environment. `make_program_env()` back-fills a fixed, sorted list of variables into the supplied block when they are absent, calling `GetEnvironmentVariableW` against the *parent* process for each missing one. The list — `required_vars[]` — is exactly eleven names:

```
HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT,
TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR
```

Its header comment states the intent: *"Windows has a few 'essential' environment variables… We therefore ensure that these get defined if the input environment block does not contain any values for them."*

So the underlying semantic is **identical on both platforms — the `env` option replaces.** What differs is a Windows-only back-fill of eleven names, `PATH` among them. That is exactly why the child saw `PATH-VISIBLE` here and `PATH-ABSENT` on darwin. The agreement between the measurement and the source is what makes both trustworthy.

**`APPDATA` and `LOCALAPPDATA` are NOT on that list** — and CLAUDE.md's POSIX-surface table names `%APPDATA%\nvm\…` and `%LOCALAPPDATA%\fnm\…` as exactly the Windows version-manager paths `command-resolution.ts` will need. **The safe reading of P0-ENV is: PASS, and `PATH` specifically survives — do not generalise past the eleven.**

### `os.tmpdir()` returned the 8.3 short form

`os.tmpdir()` → `C:\Users\RUNNER~1\AppData\Local\Temp`, while `USERPROFILE` → `C:\Users\runneradmin`. Both are valid, both exist on disk, **and they are not string-comparable.** Any Phase 4-8 code that compares a temp path against a profile-derived path (or against a path built from `USERPROFILE`/`APPDATA`) must normalise first — `fs.realpathSync`, `path.resolve`, or a case-insensitive comparison after short-name expansion. A naive `startsWith` will silently return false.

---

## Exit-code contract, as measured

The policy (D-05, D-06, D-07, D-09):

| Assertion | Gates the exit code? | Governing decision |
|---|---|---|
| `P0-ENV` | **Yes** — plus an explicit STATE.md blocker | D-05 |
| `P0-TMP` | **Yes** | D-06 |
| `P1-CMD` | **Only if indeterminate** — a clear EINVAL / runs / hangs answer never gates; an ambiguous one does | D-07 |
| `P1-WHERE` | No | D-09 |
| `P2-OS` | No | D-08 |
| `P3-VARS` | No | D-09 |
| `P3-UUID` | No | D-08 |

**Measured exit code on the authoritative run: `0`.** Driving condition: **all three of P0-ENV, P0-TMP and P1-CMD were PASS, and P1-CMD was conclusive** — `grep -c 'indeterminate'` over the artifact returned **0**, so D-07's escalation branch was never entered.

The exit code was read two ways, neither of them a tick:

- `Run LLRT Windows primitive probe` concluded `success`, and `shell: bash` resolves to `bash --noprofile --norc -eo pipefail {0}`, so `pipefail` carries the probe's status through `| tee` rather than reporting tee's.
- **No** `Process completed with exit code` line appears anywhere in the run log (`grep -E` over the ANSI-stripped log → no match). Actions emits that line only for a non-zero step.

---

## Falsifiability — two proofs, recorded separately

This is what distinguishes this document from a green tick. Each gate needed its own run; neither could be demonstrated by run 2.

### Proof 1 — the probe's failure path ([run 31703442673](https://github.com/six2dez/drift/actions/runs/31703442673))

A **one-character** mutation of the P0-TMP platform literal (`"win32"` → `"win32x"` at `scripts/windows-llrt-probe.mjs:234`, the single comment-filtered occurrence) on branch `scratch/ci-proof-windows-probe-negative` at commit `faff52f`.

| Property | Measured |
|---|---|
| Job conclusion | **failure** |
| Failing step | **`Run LLRT Windows primitive probe`** (step 5) — *not* an earlier one |
| `Assert no secret material is reachable (D-10)` (step 4) | **success** — it printed its pass arm verbatim, so the red is the probe's exit path and nothing upstream |
| **`Upload probe results`** (step 6) | **`success`** — the artifact uploaded on a red run |
| Artifact contents | `windows-llrt-probe-3`, 1769 bytes, **exactly one summary line for each of the seven IDs** (`^PASS ` = 6, `^FAIL ` = 1, `indeterminate` = 0) |
| The four `Verify (Node N)` legs at the same SHA | **all green** — [run 31703442594](https://github.com/six2dez/drift/actions/runs/31703442594) |

The mutated line, verbatim from the failing run's artifact:

```
FAIL [P0-TMP]: os.platform() returned "win32", which is not the Windows platform id — this host is not Windows, so the Windows temp-dir assertion cannot be satisfied here
```

**What this closes:** `03-RESEARCH.md` **assumption A2** and **Pitfall 1** — the concern that `tee` could swallow the probe's exit code and leave the job green with a `FAIL` line sitting in the artifact. That is now closed **by measurement**, not by reasoning about how GitHub maps `shell: bash`. Confirmed a second way from the log: `##[error]Process completed with exit code 1.` on the probe step. Had `pipefail` not applied, this job would have been **green with `FAIL [P0-TMP]` in the artifact** — precisely the false-green shape D-13 exists to prevent.

It is also the phase's **only** proof of `if: always()` on the upload step: on a green run an unconditional upload and a conditional one are indistinguishable. This is the run where they diverge, and the unconditional one is what actually happened. And the artifact being *complete* rather than a crash trace confirms 03-01's single-emission contract holds under failure — the deliberate FAIL changed one line's status, not the line count.

### Proof 2 — the D-10 gate's failure path ([run 31703717548](https://github.com/six2dez/drift/actions/runs/31703717548))

A **one-line self-labelling canary** in a YAML comment at `.github/workflows/windows-llrt-probe.yml:17`, on branch `scratch/ci-proof-windows-gate-negative` at commit `4e82c2a`:

```
# CANARY (deliberate, plan 03-04): ${{ secrets.DRIFT_PROBE_GATE_CANARY }}
```

| Property | Measured |
|---|---|
| Job conclusion | **failure** |
| Failing step | **`Assert no secret material is reachable (D-10)`** (step 4) |
| **`Run LLRT Windows primitive probe`** (step 5) | **`skipped`** |
| **`Upload probe results`** (step 6) | **`failure`** |
| Artifact count | **0** (`gh api …/artifacts` → `{"names":[],"total":0}`) |
| The four `Verify (Node N)` legs at the same SHA | **all green** — [run 31703717437](https://github.com/six2dez/drift/actions/runs/31703717437) |

The gate's match arm printed verbatim in the public log, preceded by `grep -n`'s own output:

```
.github/workflows/windows-llrt-probe.yml:17:# CANARY (deliberate, plan 03-04): ${{ secrets.DRIFT_PROBE_GATE_CANARY }}
Gate failed: a Caido token reference or a GitHub secrets expression appears in a scanned file (see the match above).
```

**What the gate proof closes — and why it matters more than any other proof here.** The D-10 gate is **the one artefact of this phase that Phase 9 does not delete**, and Phases 4-8 rely on it silently to keep "no secret material in the workflow or the probe" true as they edit those files. An unfalsified gate would have been the weakest link in the entire evidence chain. It is now *observed* to bite: on a real Windows run, at the correct step, before the probe printed anything. Measured rather than inferred — the run log contains **0** lines matching `^(PASS|FAIL) \[` and 0 occurrences of the probe banner.

**What the failing upload closes.** `Upload probe results` ran (`if: always()`) but found no `probe-results.txt`, and `if-no-files-found: error` turned that into a step failure rather than a silent success:

```
  if-no-files-found: error
##[error]No files were found with the provided path: probe-results.txt. No artifacts will be uploaded.
```

**This is the phase's only observation distinguishing `if-no-files-found: error` from `warn`.** Under `warn` the step would have concluded `success` and the run would still have gone red at the gate — indistinguishable at job level, distinguishable only here at step level. It closes 03-02's must-have that "a missing results file fails the job rather than passing quietly".

**On the canary's safety, since it lives in a permanent public run record.** It named `DRIFT_PROBE_GATE_CANARY`, a secret that **does not exist in this repository** — an evaluated expression would have resolved to empty. It was a YAML *comment*, proven not to survive into the parsed document (`canary-in-parsed-yaml=False` via `yaml.safe_load`), so no expression was ever evaluated. It contained the literal `CANARY` plus the plan number, so the text the gate quotes into the public log **announces itself as deliberate**. A Caido-token-shaped string was deliberately *not* used: both alternation branches of the gate regex are equivalent as a control-flow test, but only one of them puts leak-shaped text in a public archive. The branch lived roughly three minutes before deletion.

---

## Hand-off to Phase 4 — the architectural decision each result forces

### P0-ENV → the env-injection path that replaces the `#!/bin/bash` wrapper

Today Drift injects environment variables into children by *generating a bash script*: `renderExportExecScript` (`index.ts:320`) emits `#!/bin/bash`, a block of `export KEY='value'` lines, and `exec <cmd> <args> "$@"`. **None of that exists on Windows.** P0-ENV establishes that the replacement — passing an `env` option straight to `spawn()` — works on a real Windows host.

**This is a new mechanism, not a confirmed existing one.** Drift's two production `spawn()` call sites pass **only** `stdio` and never an `env` option:

- `packages/backend/src/index.ts:1191` — `spawn(launchPath, [], { stdio: ["pipe","pipe","pipe"] })` (MCP self-test / wrapper launch)
- `packages/backend/src/index.ts:2188` — `spawn(launchCommand, launchArgs, { stdio: ["pipe","pipe","pipe"] })` (provider CLI launch)

(`spawnAndWait` at `index.ts:1521` is the same shape.) So Phase 4 is *adding* the `env` option to these call sites, not proving that an existing one keeps working. Concretely:

> **Phase 4 must pass `{ ...process.env, ...driftVars }`, not `{ ...driftVars }`.** The eleven-name back-fill covers `PATH`, `TEMP`, `USERPROFILE`, `SYSTEMROOT` and seven others, but **not** `APPDATA` or `LOCALAPPDATA` — the two variables `command-resolution.ts` needs to build the Windows nvm and fnm candidate paths. Spreading the parent block is the only form that is correct for both platforms, since on POSIX the `env` option replaces outright.

The `.cmd`-launcher fallback named in the STATE.md blocker is **not required** for env injection.

### P1-CMD → a `cmd.exe /c` branch is mandatory

`spawn-threw-sync` / `EINVAL` means Node's CVE-2024-27980 guard refuses to spawn a `.cmd` target directly, and it **throws synchronously** — so a `try`/`catch` around the `spawn()` call itself is required, not just an `error` event handler. Phase 4+ must not treat `.cmd` as spawnable:

> Any resolved provider or Node path ending in `.cmd` (or `.bat`) must be invoked as `spawn("cmd.exe", ["/c", target, ...args])`, behind an `os.platform() === "win32"` guard so the POSIX path is untouched (CMP-01/CMP-02). This matters directly for `command-resolution.ts`, whose Windows nvm/fnm candidates are `.cmd` shims (`%APPDATA%\nvm\<v>\<cmd>.cmd`, `%LOCALAPPDATA%\fnm\…\<cmd>.cmd`). Argument quoting through `cmd.exe /c` is its own hazard and is Phase 4-7's to handle.

### P1-WHERE → replacing the `which` call

`resolveCommand` spawns `which <command>` at `index.ts:853` (promise block `852-875`). On Windows:

> Spawn `where.exe` **by absolute path** (`C:\Windows\System32\where.exe` — the probe did exactly this and it worked), split stdout on `/\r?\n/`, drop empty lines, and take the first. Expect **multiple** lines: the runner returned 2 (hostedtoolcache first, `C:\Program Files\nodejs\node.exe` second). A resolver reading only the first line is correct here, but the multi-line CRLF shape is confirmed real and must not crash the parser. Because the first line ended `.exe`, `03-RESEARCH.md:626`'s `where.exe /f node.exe` contingency is **not** needed.

### P3-UUID → keep the custom hex-loop UUID generator

`randomUUID` was available under Node, but **this is a node-vehicle result with no source-level LLRT confirmation in either direction** — the only assertion of the seven with none.

> Do **not** delete or replace the custom hex-loop UUID generator at `index.ts:829` on the strength of this result. It was written specifically to avoid depending on `crypto` availability in Caido's QuickJS/LLRT-derived runtime, and this phase produced no evidence about that runtime. Revisit only if a later phase measures `randomUUID` inside Caido itself.

---

## Residual risk — the one thing this phase could not close

**Caido's `dependency-llrt` is a maintained fork.** It could have diverged from upstream `awslabs/llrt` with custom shims over `child_process`, `os`, or the module resolver. Every fidelity claim in the vehicle caveat rests on upstream LLRT's Rust source; none of it was verified against Caido's fork, and none of it was executed.

This is not closable inside a CI spike. **Where it gets closed:** the original Windows bug reporter (@0xMRK0S) or a real Windows Caido installation confirming a later phase's build — deferred to **Phase 9 or 10**, per 03-CONTEXT.md's Deferred Ideas. Until then, every Phase 4-8 plan citing this document should carry the same caveat: *the platform is measured; the runtime is inferred.*

---

## Not measured — explicit gaps (D-12)

Recorded as gaps rather than inferred from `03-RESEARCH.md`'s predictions.

| Gap | Why it is a gap | Where it closes |
|---|---|---|
| **Whether a variable outside libuv's eleven `required_vars` (e.g. `APPDATA`) survives into a child spawned with an explicit `env` block** | The probe measured `PATH`, which *is* one of the eleven. The eleven-name bound is **source analysis of libuv, not measurement.** | A probe extension measuring a non-required variable directly — a candidate for Phase 4. 03-03's sanctioned probe edit was not triggered because P1-CMD was conclusive. |
| **LLRT itself, on any assertion** | No standalone LLRT Windows binary exists; Caido headless in CI needs a paid Teams plan | Phase 9/10, real machine — see Residual Risk |
| **LLRT's crypto surface (P3-UUID)** | Unlike P2-OS, no source-level confirmation was obtained in either direction | Phase 9/10 |
| **The D-10 gate's third arm (`grep` status 2 — missing or unreadable target)** | Both the clean arm (status 1, on run 2 and in local pre-flights) and the match arm (status 0, on run 4) fired. The unreadable arm is **structurally present** — the third `exit 1` site, currently `windows-llrt-probe.yml:142` — but was never exercised on a real run | Not planned. Phase 9's replacement job should preserve the three-branch structure regardless. |
| **`P1-CMD`'s "runs" and "hangs" outcomes** | EINVAL fired, so the other two surfaces were never observed. Not a defect — one conclusive answer is what D-07 requires | n/a |

---

## Teardown and hygiene

| Check | Result |
|---|---|
| Scratch branches deleted (local + remote) | `scratch/ci-proof-windows-probe`, `scratch/ci-proof-windows-probe-negative`, `scratch/ci-proof-windows-gate-negative` — all three |
| `scratch/*` glob on origin | `out=$(git ls-remote --heads origin 'scratch/*'); test -z "$out"` → **`scratch-glob-empty=0`** |
| **Full unfiltered remote listing** (so an empty match is provably empty rather than a mistyped pattern) | `fix/security-hotfixes` `0cd81f3` (pre-existing, unrelated) and `main` `2d8cf16` — **nothing else** |
| `origin/main` | **`2d8cf16`** — never pushed by this phase, byte-identical to its value before the phase started |
| Deliberate defects on the working branch | **none** — both mutations were made only after switching to a throwaway branch, proven by blob-hash equality plus marker greps returning 0 |
| All six run records after the deletions | **all still resolve** with their recorded conclusions — re-verified 2026-08-13 while writing this document |

`git ls-remote` exits 0 whether or not the glob matched, which is why the assertion captures the output and discriminates with `test -z`, and why the unfiltered listing is recorded beside it.

**The run records outlive the refs that produced them** — which is what makes every URL in this document a valid citation for Phases 4-8. The *artifacts* do not: `windows-llrt-probe-2` and `windows-llrt-probe-3` expire `2026-09-12`. This document is the durable copy.

---

## Deletion date (D-02) — and the one property that must survive it

`.github/workflows/windows-llrt-probe.yml` and `scripts/windows-llrt-probe.mjs` are **deleted in Phase 9**, when CI-01 lands the permanent `windows-latest` regression job. That is explicit debt with a due date, not an indefinite fixture.

**This document is what survives them.** So does one property of the deleted workflow, and Phase 9's replacement job must carry it forward rather than drop it:

> **The D-10 gate** — the three-branch `grep` asserting that no `CAIDO_TOKEN` reference and no `secrets.` expression appears in the Windows CI surface, failing on status 0 (match) **and** on any status other than 0 or 1 (missing or unreadable target), with `test -f` guards naming every scanned path. It is the only part of this phase observed to bite ([run 31703717548](https://github.com/six2dez/drift/actions/runs/31703717548)), and it is the only part Phases 4-8 depend on silently.

Also worth carrying into any future Windows job in this repository: **`actions/setup-node@v5` defaults `package-manager-cache: true`** and auto-enables caching from `package.json`'s `packageManager` field, then shells out to the named package manager. Without a pnpm step it dies at `Setup Node` with `Unable to locate executable file: pnpm` — which is exactly what killed [run 31702174047](https://github.com/six2dez/drift/actions/runs/31702174047) before the probe ran. `ci.yml` is not a counter-example: it survives only because `pnpm/action-setup@v6` runs first. The input is new in `@v5`, so **static review against `ci.yml` cannot catch this.** Fixed in `0a05174` with `package-manager-cache: false`.

---

*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Written 2026-08-13 by plan 03-05, from the measured output of runs 31702392047, 31703442673 and 31703717548 (D-11, D-12, D-13).*
