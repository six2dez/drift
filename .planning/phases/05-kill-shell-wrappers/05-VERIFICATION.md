---
phase: 05-kill-shell-wrappers
verified: 2026-08-20T20:25:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
# SC-4's behavioural half was closed by human UAT on 2026-08-20 (see § UAT Close).
# Retained verbatim so the ORIGINAL gap and its reason stay legible: this was closed by a
# two-minute smoke test on one machine, NOT by an automated net. Phase 9's deferred
# caido:plugin alias remains the only thing that would close it structurally.
behavior_unverified_items_closed_by_uat:
  - truth: "SC-4 — the macOS/Linux launch path is unchanged (CMP-01)"
    test: "On macOS or Linux, against a live Caido: start the MCP server, then run one full chat turn with Claude Code, and one with Gemini or Codex. Confirm the MCP attaches, tools resolve, and the turn completes."
    expected: "Identical behaviour to a pre-Phase-5 Drift build. Specifically: the provider child receives CAIDO_URL / CAIDO_TOKEN / every DRIFT_* var (previously delivered by provider-launch-<sid>.sh's `export` lines, now by the spawn `env` option), and no turn fails to start."
    why_human: "D-04 converted the POSIX provider launch from write-a-.sh-then-exec to a direct spawn on ALL platforms. That change lives entirely in packages/backend/src/index.ts, which cannot be imported under vitest (no caido:plugin alias) — so not one line of the converted provider path is executed by any test in this repo. The provider-launch tripwire proves the argv arrays are byte-identical; it does not exercise env delivery, and env delivery is the half that changed. The phase discloses this itself as V-21 and as ledger item 5; the dated human code review (05-REPORT.md §7.2) is recorded by the phase as a human read, not as behavioural evidence."
coincidental_reliance_items: []
# Performed and PASSED 2026-08-20 by the maintainer; see § UAT Close for the full record.
human_verification_completed:
  - test: "On macOS or Linux, against a live Caido: start the MCP server, then run one full chat turn with Claude Code, and one with Gemini or Codex."
    expected: "MCP attaches, tools resolve, both turns complete — identical to a pre-Phase-5 build."
    why_human: "The converted POSIX provider spawn lives in index.ts and is executed by no test. It is the one user-facing behaviour change on the platform the entire existing user base runs."
---

# Phase 5: Kill Shell Wrappers — Verification Report

**Phase Goal:** Replace the POSIX shell-wrapper launch indirection with a single direct-`node`-spawn keystone so the MCP self-test and health check pass on Windows for the Claude path — the direct fix for the reported bug — with zero POSIX regressions.
**Verified:** 2026-08-20T20:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Verification stance

This phase's declared central risk is **overclaiming**. Accordingly, every number in
`05-REPORT.md` § 3 was re-measured from the working tree by this verifier rather than read,
the CI run was fetched through `gh` and its log parsed independently rather than accepted from
the report, and the five bucket-N non-claims were checked for quiet promotion across
`05-REPORT.md`, all six SUMMARYs, `ROADMAP.md` and `REQUIREMENTS.md`.

**Nothing in this phase overclaims.** The failure mode the phase was built to prevent did not
occur. The single open item below runs the other way — a real behaviour change on POSIX that
no test exercises, which the phase itself named and which the report's own evidence class
labelling (`§7` "These are HUMAN READS. They are not gate results") makes it easy to see.

---

## Goal Achievement

### Observable Truths (ROADMAP § Phase 5 Success Criteria, SC-1 as amended)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **SC-1 (amended)** — one `buildMcpServerSpec()` → spec-to-spawn keystone running `node` directly with `env`; `writeLaunchScript`, `mcp-self-test-*.sh`, `mcp-wrapper-<sid>.sh`, `provider-launch-<sid>.sh` deleted together with one of the two `chmod` spawns; `renderExportExecScript`/`shellQuote`/`writeMcpWrapper`/the remaining `chmod` survive on darwin+linux for Gemini/Codex only behind a platform guard, each headed by a literal `DELETED IN PHASE 7 (PRV-03)` notice, with Phase 7 SC-7 owning their deletion | ✓ VERIFIED | Gates 1/2/6 re-derived by this verifier and reproduce **exactly** (below). `requireMcpServerSpec` is the single keystone, reached at `index.ts:1743`, `:2192`, `:2854` and both config writers `:3062`/`:3111`. Guard verified two-sided: `writeMcpWrapper` is called only at `:2592` under `host.platform !== "win32"`, **and** `planMcpCliRegistration` independently returns `Skip` on win32 and fails closed on `platform === undefined`. Three `DELETED IN PHASE 7 (PRV-03)` notices at `:860`, `:967`, `:1334`. ROADMAP amendment present with its D-01/D-02 rationale; Phase 7 SC-7 exists and names the exact closing counts (3 notices → 0) |
| 2 | **SC-2** — on `windows-latest` CI, `validateCaidoAuth` (HLT-01) and the MCP self-test of `tools/list`, `get_environment`, `search_history` (HLT-02) pass for the Claude `node`/`mjs` path | ✓ VERIFIED (bounded by V-21) | Run [32378434081](https://github.com/six2dez/drift/actions/runs/32378434081) fetched via `gh`: conclusion `success`, head `4b70d85`, all ten `Verify (Windows)` steps `success`. Log parsed independently: `Test Files 31 passed (31)` / `Tests 290 passed (290)`, `mcp-server-spec.spawn.test.ts (2 tests) 570ms`, `✓ authenticates against a stub Caido via --validate-auth 364ms`. The only `skipped` string in the whole job is pnpm's lockfile line in *Install dependencies* — **zero** in the Test step, so both integration cases executed. **The seam is two lines and the test is a character-identical replica of it:** production `validateCaidoAuth` is `spawnAndWait(spec.command, [...spec.args, "--validate-auth"], { env: spec.env })` (`:1386`); the test spawns `spawn(spec.command, [...spec.args, "--validate-auth"], { env: spec.env, … })` (`spawn.test.ts:189`) from the **same** `buildMcpServerSpec`. D-08 defines this as SC-2's agreed proof standard |
| 3 | **SC-3** — the Caido token and `DRIFT_*` vars reach the MCP server only via the spawn `env` option / config-JSON `env` field, no shell `export` wrapper, verified by the integration spawn test | ✓ VERIFIED (scope caveat, see W-1) | Gate 4 re-derived **two-sided**: raw `env:` count **4** (`:1388`, `:1998`, `:2405`, `:3412`) and the three-entry allow-list filter prints nothing (exit 1). `buildSpawnEnv` (`platform.ts`) merges parent-then-drift-overlay and is unit-tested; `readParentEnv` (`:470`) returns the full `process.env`. V-2/V-3/V-4/V-10 green (re-run locally: 13 spec tests + 2 spawn tests, all pass). Caveat: true **for the Claude and self-test paths**, which is how `05-REPORT.md` §8 states it — the surviving Gemini/Codex POSIX wrapper still carries the token via `export`, deliberately (D-01) |
| 4 | **SC-4** — the macOS/Linux launch path is unchanged and the existing `provider-launch` exact tests stay green (CMP-01) | ✅ VERIFIED — tested half by gate, untested half by UAT (see § UAT Close) | The **tested half is fully verified**: `git diff --stat cd22833 -- provider-launch.ts provider-launch.test.ts` is **empty** (re-run by this verifier), 6 `toEqual` exact assertions unedited, 11 tests green; `enforceOwnerOnlyDir` byte-identical to `cd22833` (re-diffed, IDENTICAL); whole-file `chmod` count 15, correctly non-zero; full suite **290 passed / 31 files** re-run locally by this verifier. The **untested half**: D-04 converted the POSIX provider launch to a direct spawn on *all* platforms — env delivery moved from the launch script's `export` lines to the spawn `env` option — and that code is in `index.ts`, which no test imports. See Human Verification below |

**Score:** 3/4 truths verified (1 present, behaviour-unverified)

---

### Non-Claim Integrity (V-20 … V-24) — the phase's central risk

Every bucket-N row was checked for quiet promotion across the report, all six SUMMARYs,
`ROADMAP.md` and `REQUIREMENTS.md`.

| Row | Non-claim | Intact? | Evidence |
|---|---|---|---|
| **V-20** | A real Defender lock survived on real hardware | ✓ INTACT | Named as the residual in `REQUIREMENTS.md`'s RUN-04 paragraph **in the same paragraph as the Complete verdict** (adjacency requirement met), and reproduced in `05-REPORT.md` §1.2 with Phase 9/10 as its closing condition |
| **V-21** | `index.ts`'s wiring of the keystone | ✓ INTACT | Stated in `05-REPORT.md` §1.1 unsoftened, in `mcp-server-spec.spawn.test.ts`'s own header comment (lines 26-40), in every one of the six SUMMARYs, and in `REQUIREMENTS.md`'s Phase-5 preamble. `05-REPORT.md` §7 explicitly forbids promoting the two human reads into the gate tables |
| **V-22** | The env contract under LLRT | ✓ INTACT | Named as RUN-02's residual in `REQUIREMENTS.md`; the two-sided Gate 4 is correctly described as "the only vehicle-independent control", not as proof of LLRT behaviour |
| **V-23** | Anything under the real Caido LLRT runtime | ✓ INTACT | `05-REPORT.md` §1.2 states "**Every Windows result in this phase was measured on Node, not on Caido's runtime**"; ROADMAP's Results table repeats it; REQUIREMENTS' preamble repeats it |
| **V-24** | A real Claude CLI connecting on Windows (PRV-01) | ✓ INTACT | **PRV-01 remains `- [ ]` unchecked, `Pending`, mapped to Phase 7** in `REQUIREMENTS.md:61/153/180`. Every one of the 20 PRV-01 mentions inside `.planning/phases/05-kill-shell-wrappers/` is a *disclaimer*, not a claim. The green spawn test is nowhere reported as PRV-01 — `05-REPORT.md` §1.3 exists specifically to block that reading, and the test file itself carries the same warning inline |

**Verdict: no non-claim was promoted anywhere.** The `05-REPORT.md` §1-before-§8 ordering is
intact and the ROADMAP carries its own "what this phase does NOT claim" table, so the claim
boundary survives outside the phase directory.

---

### Static Gates — re-derived independently, not read from the report

Measured by this verifier on the current working tree (`1b69d8a`;
`git diff --stat 4b70d85..HEAD -- packages/ .github/` is **empty**, so the code is identical
to the tree the report measured and to the tree CI ran).

| Gate | Command | Report claims | This verifier measured | Match |
|---|---|---|---|---|
| 1 — `.sh` literals (V-5) | `sed -e 's://.*::' index.ts \| grep -c '\.sh'` | 1, at `:1082` | **1**, at `:1082` (`getMcpWrapperPath`) | ✓ |
| 2a — chmod spawn (V-6) | `… \| grep -c 'spawnAndWait("chmod"'` | 1, at `:1372` | **1**, at `:1372` | ✓ |
| 2b — whole-file chmod | `grep -c 'chmod' index.ts` | 15 (deliberately non-zero) | **15** | ✓ |
| 2c — `enforceOwnerOnlyDir` | body diff vs `cd22833` | byte-identical | **IDENTICAL** (`diff` empty) | ✓ |
| 3 — site inventory (V-7) | `grep -n` over five symbols | 1+1 / 1+2 / 1+2 / 1+2 / 1+2 | reproduced; `writeMcpWrapper` has exactly one call, inside the win32 guard | ✓ |
| 4a — parent-spread raw (V-22) | `grep -cE '(^\|[[:space:],{(])env:'` | 4 | **4** (`:1388`, `:1998`, `:2405`, `:3412`) | ✓ |
| 4b — allow-list filter | 3-entry `grep -v` chain | no output | **no output**, exit 1 | ✓ |
| 5 — dated notices | `grep -rn 'DELETED IN PHASE [0-9]\+ ('` | 4 (3× Phase 7, 1× Phase 9) | **4**, same four lines | ✓ |
| 6 — launch indirection | 4 symbols, stripped **and** raw | 0/0/0/0 both views | **0/0/0/0 stripped and raw** | ✓ |
| 7 — CMP-01 tripwire (V-11) | `git diff --stat cd22833 -- provider-launch*` | empty; 11 tests pass | **empty**; 11 pass, 6 `toEqual` | ✓ |
| 8 — line endings (V-15) | `.gitattributes` | both present | **`* text=auto eol=lf` present** | ✓ |
| 9 — suite + static checks | `vitest run` / typecheck / lint | 290 / 31, 0, 0 | **290 passed / 31 files** re-run locally | ✓ |
| — CI job shape (CI-03) | `.github/scripts/check-ci-windows-job.sh` | 14 assertions, exit 0 | **14 PASS, exit 0** (run by this verifier) | ✓ |
| — test-removal audit | `--diff-filter=D` + removed `it(` count | 0 deleted files, 1 removed `it(` (a rename) | **0 deleted, 1 removed `it(`** | ✓ |

**Every published gate number reproduces exactly. Not one was inferred from a diff.**

---

### Windows CI Evidence — fetched and parsed first-hand

| Claim | Report's assertion | Independently confirmed |
|---|---|---|
| Authoritative run | [32378434081](https://github.com/six2dez/drift/actions/runs/32378434081), head `4b70d85`, success | ✓ `gh run view` → `conclusion success`, `headSha 4b70d852850c…` |
| Five jobs | Windows + Node 20/22/24/26 all success | ✓ all five `success` |
| Per-step | 10 named steps, all success | ✓ steps 1-10 all `success`, names match verbatim |
| Test counts | `Test Files 31 passed (31)` / `Tests 290 passed (290)` | ✓ quoted verbatim from the parsed Test step |
| Not skipped | `grep -icE 'skipped\|todo'` over the Test step → 0 | ✓ the only match in the entire job is pnpm's "resolution step is skipped" in *Install dependencies* |
| Build artifact by path | `-rw-r--r-- 1 runneradmin 197121 2487350 Aug 20 14:10 dist/plugin_package.zip` | ✓ line present, plus the `test -f` that produced it |
| Secret gate executed | `Gate passed: no Caido token reference…` | ✓ the echoed output line is present, not merely a green step |
| First run RED | [32376894371](https://github.com/six2dez/drift/actions/runs/32376894371), head `aa56d94`, `Verify (Windows)` failure | ✓ `conclusion failure`, Windows job `failure`, four Node jobs `success` |
| `extractHomeDir` was a real production defect, recorded not smoothed | Fixed at the correct layer; test defect fixed separately | ✓ `normalizePosixPath` + the rewritten `extractHomeDir` are in `command-resolution.ts` with the failing assertion and the run URL quoted **in-code**; `path.posix` rejection reasoned against the LLRT type surface; recorded as a finding under **CI-03** in `REQUIREMENTS.md`, not buried. `cd22833..aa56d94` over that file is genuinely empty, so "untouched at the time" holds |

---

### Requirements Coverage

| Requirement | Status in REQUIREMENTS.md | Verified basis | Verdict |
|---|---|---|---|
| RUN-01 | Complete | Gates 1/2/6 re-derived; win32-guarded survivor; V-1/V-12/V-16 green | ✓ SATISFIED (residuals V-21/V-23 named) |
| RUN-02 | Complete | Gate 4 two-sided re-derived; V-2/V-3/V-4/V-10 green | ✓ SATISFIED (residual V-22 named) |
| RUN-04 | Complete | **Challenged, and the recorded basis holds.** The structural argument is *in the same paragraph* as the verdict, and V-20 is named there too, so neither travels without the other. Verified mechanically: `writeLaunchScript` is gone (0 raw), `writeMcpWrapper` is win32-guarded by a unit-tested predicate, `withFsRetry` now has **two** production call sites (`:783` `writeTemp`, `:2795` staging copy — confirmed), and both `mcpFirstWriteAttempts` and `mcpTempWriteAttempts` are surfaced in `getDiagnostics` (`:4089`, `:4091`). Phase 4 held it Pending under a scope fence that Phase 5 legitimately removed. The maintainer was shown the "Complete ≠ no longer applicable" objection and did not overturn it | ✓ SATISFIED (residual V-20 named, adjacent) |
| HLT-01 | Complete | V-12 local + V-16 on `windows-latest`; seam is 2 lines with a character-identical test replica | ✓ SATISFIED (residual V-21 named) |
| HLT-02 | Complete | V-13 local + V-17 on `windows-latest`, both cases executed | ✓ SATISFIED (residual V-21 named) |
| CMP-01 | Complete | Tripwire empty, 290 green, `enforceOwnerOnlyDir` identical, **plus the POSIX UAT close below** | ✅ SATISFIED — both halves; see § UAT Close |
| CI-01 | Complete | Blocking Windows leg green, artifact asserted by path, `timeout-minutes: 6` from three measured runs | ✓ SATISFIED |
| CI-03 | Complete | `.gitattributes`, `shell: bash` pinned, 14-assertion checker exit 0, red-run-read-not-retried narrative verified against the real run | ✓ SATISFIED |

**Orphaned requirements:** none. All eight IDs on the ROADMAP's Phase 5 line are claimed and evidenced.

---

### Behavioural Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Spec + spawn contract works locally | `pnpm exec vitest run mcp-server-spec.test.ts mcp-server-spec.spawn.test.ts` | 15 passed (13 + 2) | ✓ PASS |
| Full suite green | `pnpm exec vitest run` | 31 files / 290 tests passed | ✓ PASS |
| CI job shape is what CI-03 claims | `bash .github/scripts/check-ci-windows-job.sh` | 14 PASS, exit 0 | ✓ PASS |
| Windows leg green for the right reasons | `gh run view 32378434081 --log` | 290/290 on `windows-latest`, 0 skips | ✓ PASS |
| POSIX provider turn still works end-to-end | — | requires a live Caido + a real CLI | ? SKIP → human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | none | — | `TBD`/`FIXME`/`XXX` and `TODO`/`HACK`/`PLACEHOLDER` scans over all 12 files this phase modified return **zero matches**. No debt markers introduced into `ROADMAP.md`/`REQUIREMENTS.md` either |

---

## Findings

### ⚠️ W-1 — SC-3 and SC-4 were left literally inaccurate when SC-1 was amended

`05-05` amended **SC-1** because D-01/D-02 keep the Gemini/Codex wrapper alive. The same design
decision makes two neighbouring criteria literally wrong, and neither was amended:

- **SC-3** reads "the Caido token and `DRIFT_*` vars reach the MCP server **only** via the spawn
  `env` option / config-JSON `env` field — **no shell `export` wrapper**." On POSIX, Gemini and
  Codex still reach the MCP server through `mcp-wrapper.sh`, whose `export CAIDO_TOKEN='…'` line
  is — per the SC-1 amendment's own words — "their sole carrier". `05-REPORT.md` §8 states the
  claim correctly ("on the Claude and self-test paths"); the roadmap criterion does not carry
  that scope.
- **SC-4** reads "the macOS/Linux launch path is unchanged **behind `os.platform()` guards**."
  D-04 deliberately converted the provider launch on *all* platforms with **no** guard
  (`index.ts:3412` — one `spawnWithEnv` + `buildSpawnEnv`, no branch). The outcome SC-4 wants
  (POSIX behaviour preserved) is the phase's claim; the mechanism it names is not what shipped.

Neither is an overclaim — both under-describe a correctly-made decision. But a future reader
auditing SC-3 against the code will find a shell `export` wrapper and conclude the criterion
failed. The phase already owns the right fix mechanism: an inline amendment note, exactly as
SC-1 received.

**Suggested:** add amendment notes to SC-3 and SC-4 mirroring SC-1's, or accept via override.

### ⚠️ W-2 — a report citation that no longer reproduces

`05-REPORT.md` §5.2 says of `command-resolution.test.ts`: *"a file this phase had **not**
touched (`git diff --stat cd22833..HEAD` over it is empty)"*. Run today that command returns
**19 insertions / 2 deletions** — because the very fix being described landed in it. The
substantive statement is true at the correct anchor (`cd22833..aa56d94` **is** empty, confirmed),
but the command as published contradicts its own stated result. In a phase whose §3 preamble
insists "every number below is the literal output of the command shown", this one is not.

**Suggested:** re-anchor the parenthetical to `cd22833..aa56d94`.

### ℹ️ I-1 — FA-3 paraphrases `validateCaidoAuth` with its args dropped

`05-REPORT.md` §1.2 FA-3 quotes the wrapper as
`spawnAndWait(spec.command, ["--validate-auth"], { env: spec.env })`. The shipped code
(`index.ts:1386`) is `spawnAndWait(spec.command, [...spec.args, "--validate-auth"], …)`. The
paraphrase, taken literally, describes a `node` invocation with no script — i.e. non-functional
code. The real signature is *stronger* for the phase's argument, since it is character-identical
to `spawn.test.ts:189`. Minor, but FA-3 is load-bearing for HLT-01's residual-risk reasoning.

Also minor: `command-resolution.ts`'s in-code comment cites "run 32376894337's sibling CI run
32376894371" — the first id resolves to nothing; likely a job id. The run id quoted second is
correct and was verified.

---

## UAT Close — the POSIX behavioural verification, performed

### 1. One real POSIX chat turn — the CMP-01 behavioural close *(PASSED 2026-08-20)*

**Test:** On macOS or Linux, against a live Caido: start the Drift MCP server, then run one full
chat turn with **Claude Code**, and one with **Gemini or Codex**.

**Expected:** MCP attaches, tools resolve, both turns complete — indistinguishable from a
pre-Phase-5 build. In particular the provider child must still receive `CAIDO_URL`,
`CAIDO_TOKEN` and every `DRIFT_*` var, which previously arrived through
`provider-launch-<sid>.sh`'s `export` lines and now arrive through the spawn `env` option.

**Why human:** This is the one user-facing behaviour change on the platform the entire existing
user base runs, and it is executed by **no test in this repository**. `index.ts` cannot be
imported under vitest, so the converted provider spawn — a ~300-line change set — has zero
executing coverage. The `provider-launch` tripwire proves the **argv arrays** are byte-identical;
it does not touch env delivery, and env delivery is precisely the half that changed. The static
gates prove the old mechanism is *gone*; they cannot prove the new one *works*.

The phase is not hiding this: it is V-21, it is ledger item 5 ("05-05's entire change set is
unproven by any executing test"), and `05-REPORT.md` §7 explicitly labels the closing evidence
as "**HUMAN READS. They are not gate results**". A maintainer's read of a 55 KB diff is the
correct evidence class for *code correctness review*; it is not behavioural evidence that a
POSIX turn still starts. Phase 9's deferred `caido:plugin` vitest alias would raise the ceiling;
no later phase in the roadmap owns a POSIX regression smoke test, so this does not defer.

**Cost:** roughly two minutes with Caido already running.

---

### Result — PASSED, 2026-08-20

**Performed by:** six2dez (maintainer), on macOS, against a live Caido.
**Recorded via:** the orchestrating workflow, in answer to this document's own request.
**Type:** human UAT. **This is not a gate result** — the same evidence-class rule §7 of
`05-REPORT.md` applies, and this entry must not be promoted into any gate table.

**Verdict:** both turns ran. A Claude Code turn and a Gemini/Codex turn each attached the Drift
MCP server and completed against live Caido data.

**What this closes, stated no more broadly than it is:** the converted POSIX provider spawn
delivers `CAIDO_URL`, `CAIDO_TOKEN` and the `DRIFT_*` vars to the provider child through the
spawn `env` option, as the launch script's `export` lines previously did. That is the untested
half of SC-4 / CMP-01, and it was the last must-have outstanding.

**What it does NOT close, and what still owns each:**

- It is a **smoke test on one machine, one OS, one session** — not a regression suite. The
  structural gap that made it necessary is unchanged: `index.ts` is not importable under vitest,
  so a future edit to the provider spawn has no automated net either. **Phase 9's deferred
  `caido:plugin` alias is the only thing that closes that**, and it remains deferred.
- It says nothing about **Windows** behaviour (V-21/V-22/V-23) or about a **real Claude CLI
  connecting on Windows** (V-24 — Phase 7's PRV-01). Those five non-claims stand exactly as
  written in `05-REPORT.md` § 1.


---

## Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | A real Claude CLI reading `mcp-<chatId>.json` and connecting on Windows (V-24) | Phase 7 | Phase 7 SC-1: "On Windows, a user can run a Claude Code chat end-to-end with the Drift MCP attached — the blocking must-have (PRV-01)" |
| 2 | Deletion of `renderExportExecScript` / `shellQuote` / `writeMcpWrapper` / `getMcpWrapperPath` / the last `chmod` spawn (SC-1's amended remainder) | Phase 7 | Phase 7 SC-7, added 2026-08-20 by 05-05 task 3, with the exact closing counts and the stale-`mcp remove` obligation |
| 3 | Real Defender lock on real hardware (V-20) | Phase 9/10 | RUN-04's residual paragraph; reporter confirmation |
| 4 | `index.ts` importable under vitest (`caido:plugin` alias), raising V-21's fidelity | Phase 9 | REQUIREMENTS.md CI-01 "What remains for Phase 9" |
| 5 | Behaviour under the real Caido LLRT runtime (V-22/V-23) | Phase 9/10 | Both criteria name a real Windows Caido install as the only close |
| 6 | `extractHomeDir` learning `C:\Users\<name>` | Phase 6 | RES-03; explicitly disclaimed in-code and in REQUIREMENTS.md |

---

## Gaps Summary

**No gaps.** Every artifact exists, is substantive, and is wired; every static gate reproduces
exactly under independent measurement; the Windows CI evidence is real, correctly attributed to
its run URL, and reads the way the report says it reads; no debt markers were introduced; no
non-claim was promoted anywhere in the phase's output or in the two cross-phase documents it
edits.

The phase's declared central risk — overclaiming — did not materialise. The claim boundary is
stated in five places (report §1, the validation contract, the test file's own header, the
ROADMAP Results table, and the REQUIREMENTS preamble) and survives outside the phase directory,
which is what makes it durable.

What remains is the mirror image: **one real behaviour change with no executing coverage**, on
POSIX, which the phase named honestly and closed with the strongest evidence available to it
(a dated, first-hand-attested human code review) while labelling that evidence for what it is.
Two minutes of live use closes it. Until then, "zero POSIX regressions" is a well-reasoned
expectation rather than an observation, and this verification declines to round it up.

Two documentation-fidelity warnings (W-1, W-2) and one paraphrase nit (I-1) are recorded above.
None blocks the phase.

---

*Verified: 2026-08-20T20:25:00Z*
*Verifier: Claude (gsd-verifier)*
