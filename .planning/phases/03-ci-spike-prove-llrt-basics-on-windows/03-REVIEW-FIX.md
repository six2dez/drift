---
phase: 03
fixed_at: 2026-08-14T07:24:18Z
review_path: .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-08-14T07:24:18Z
**Source review:** `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-REVIEW.md`
**Iteration:** 1
**Scope:** `critical_warning` — the 2 Critical and 7 Warning findings. The 6 `IN-*` findings are out of scope.

**Summary:**

- Findings in scope: 9
- Fixed: 9 (3 in a prior pass, 6 in this pass)
- Skipped: 0

Files touched across both passes: `scripts/windows-llrt-probe.mjs`,
`.github/workflows/windows-llrt-probe.yml`, `package.json`, and a new `.prettierignore`.
No planning document was edited. `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` and
`03-FINDINGS.md` are byte-identical to their state at the review commit (`4bb73e1`).

---

## Provenance

```
Pre-fix blobs (the code that produced archived run 31702392047, 7/7 PASS):
  scripts/windows-llrt-probe.mjs           bd9338f0dc21
  .github/workflows/windows-llrt-probe.yml 6941ddbbca7b
HEAD no longer matches the probe blob. The measured output remains banked verbatim in
03-FINDINGS.md and the eight run records survive independently, but a new windows-latest run is
required to bank an answer from the corrected P0-ENV discriminator and P1-CMD classifier.
```

Both pre-fix blob hashes were confirmed against the repository
(`git rev-parse 0779f70:<path>`) and match exactly. Current blobs:

| File | Pre-fix blob | HEAD blob |
|---|---|---|
| `scripts/windows-llrt-probe.mjs` | `bd9338f0dc21` | `b319e71ec2b2` |
| `.github/workflows/windows-llrt-probe.yml` | `6941ddbbca7b` | `7119db74ff97` |

---

## Fixed Issues

### Completed in the prior fixer pass (already merged to `main`)

These three were applied, validated and merged before this pass began. They were **not**
redone here; the current file state was read and confirmed to contain them.

#### CR-01: P0-ENV used `PATH` as its replace-vs-merge discriminator

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `2f4db6a`
**Applied fix:** P0-ENV now discriminates via `DRIFT_PROBE_PARENT_ONLY`, a marker present on
neither libuv's eleven `required_vars` nor the child's supplied env block. `PATH` is retained in
the output but explicitly annotated as *not* the discriminator.

#### CR-02: P1-CMD treated any spawn error as conclusive

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `4d5eae2`
**Applied fix:** P1-CMD guards on platform first (off-Windows → `FAIL … indeterminate`) and then
on a `CONCLUSIVE_CMD_ERRNOS` allowlist.

> This fix proved load-bearing during **WR-03** below. Giving the fixture mode `0o700` made it
> executable, which changed the darwin surface from `error`/`EACCES` to `throw`/`ENOEXEC` — and
> `ENOEXEC` **is** in `CONCLUSIVE_CMD_ERRNOS`. Without CR-02's platform-first ordering, WR-03
> would have silently flipped darwin into a false `PASS` on a gating ID. The guard held.

#### WR-01: `spawnCapture` never handled `'error'` on the child's stdio streams

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `7df2b84`
**Applied fix:** `'error'` handlers on `child.stdout` / `child.stderr` so a pipe reset cannot
become an uncaught exception that destroys the `=== Summary ===` block.

---

### Fixed in this pass

#### WR-02: P0-TMP passed an 8.3 short path without classifying it

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `7c3261f`

**Applied fix:** P0-TMP now detects the 8.3 short form with `/~\d(?=[\\/]|$)/`, resolves the long
form with `realpathSync.native` (wrapped in `try`/`catch`, falling back to the raw value and
logging the failure), reports `short-8.3-form=` and `realpath-native=` on the existing `INFO`
line, and appends a directive to the `PASS` detail when the short form is present.

**Gating semantics unchanged, deliberately.** A short path is legal and working, so this is a
reporting addition only: it annotates the `PASS` detail and can never convert a pass into a
fail. The three existing `fail()` early-returns are untouched.

**Verification:** the classifier regex was unit-tested against the real measured value from the
`windows-latest` run and five neighbours — `C:\Users\RUNNER~1\AppData\Local\Temp` → `true`,
short-form-at-end-of-string → `true`, forward-slash separator → `true`, the long
`C:\Users\runneradmin\...` → `false`, a `~` not followed by a digit → `false`, the darwin tmpdir
→ `false`. All six as expected.

#### WR-03: predictable, world-readable, non-exclusive temp file written into shared `/tmp` and executed

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `fbf197d`

**Applied fix:** three changes, exactly as the fix guidance directed.

- `mkdtempSync(join(tmpdir(), "drift-probe-"))` replaces
  ``join(tmpdir(), `probe-test-${Date.now()}.cmd`)`` — an unpredictable name in a parent
  directory created atomically at mode `0o700`.
- `writeFileSync(..., { flag: "wx", mode: 0o700 })` replaces the default `w` / `0o644`. `wx` is
  exclusive-create, which closes the CWE-367 write→spawn race; `0o700` matches CLAUDE.md's
  convention for executable temp files.
- Cleanup becomes a single `rmSync(cmdDir, { recursive: true, force: true })`. `force` also
  covers the never-written path, so the `written` flag is gone.

The `finally` block and its lint-safe `catch { /* ignore */ }` form are preserved per the fix
guidance. See *Deliberate deviations* below regarding the review's secondary suggestion.

**Verification (all four properties measured, not assumed):** directory mode `0o700`; file mode
`0o700`; a pre-planted symlink makes the `wx` write throw `EEXIST` with the victim file's
contents intact; `rmSync` removes the tree and a second call on the missing directory does not
throw. Post-fix run confirmed zero leftover `drift-probe-*` directories in `$TMPDIR`.

#### WR-04: the header asserted a D-10 invariant the code does not hold

**Files modified:** `scripts/windows-llrt-probe.mjs`
**Commit:** `ce310ad`

**Applied fix:** documentation only. The header claimed the probe "never enumerates or dumps the
environment", which is false — P0-ENV's merged retry passes `{ ...process.env, SENTINEL }`. As
the fix guidance directed, the **header text** changed and the real D-10 protection was not
weakened. It now claims what holds (no environment *value* is ever printed beyond P3-VARS' three
named variables), then names the read path explicitly, notes that on a hosted runner that block
carries `ACTIONS_RUNTIME_TOKEN`, and explains why nothing leaks: the child's entire stdout is
three derived fields and P0-ENV `JSON.stringify`s only that stdout.

**Verification:** re-ran the D-10 gate regex over both scanned files after the edit — still exits
1 (no match), so the gate's self-non-matching property survives the new text (which mentions
`ACTIONS_RUNTIME_TOKEN`).

#### WR-05: the D-10 gate's step name over-claimed what two literal patterns can prove

**Files modified:** `.github/workflows/windows-llrt-probe.yml`
**Commit:** `a8efed3`

**Applied fix:** renamed
`Assert no secret material is reachable (D-10)` →
`Assert no Caido token reference and no GitHub secrets expression (D-10)`,
which matches the pass arm's existing `echo` verbatim. The workflow comment that previously said
"the step name is a contract — keep it stable" now records why the rename happened and that the
new name carries the same forward contract.

**The regex was deliberately NOT widened**, per the fix guidance — the review's suggested
`secret(s)(\.|\[)` would have risked the self-non-matching property, which is load-bearing
because a pattern that matched this file would fail the gate permanently. A comment now says so
in-file.

**On the "do not rename" note in `03-02-SUMMARY.md:252`:** that contract existed for plans 03-03
and 03-04, which read step conclusions by name from the API. Both are **complete** and their run
records are archived, so nothing forward-looking depends on the old string. The archived
summaries quoting the old name are accurate records of runs that really did use it and were left
unedited.

**Verification:** `actionlint` exit 0; the workflow still parses to exactly five steps with only
the third renamed; the gate regex still exits 1 over both files; and the complete gate body was
executed locally under the exact Actions invocation
(`bash --noprofile --norc -eo pipefail`), printing its pass arm and exiting 0.

#### WR-06: artifact name keyed on `run_number`, stable across re-run attempts

**Files modified:** `.github/workflows/windows-llrt-probe.yml`
**Commit:** `dc1104b`

**Applied fix:** `name: windows-llrt-probe-${{ github.run_number }}-${{ github.run_attempt }}`.
The adjacent comment now explains the 409 mechanism and why a re-run is the *expected* case here
(D-05 through D-07 all define non-zero outcomes as recorded findings).

**Only the workflow changed**, per the fix guidance. The archived `03-03`/`03-04` summaries
reference the attempt-1 names `windows-llrt-probe-2` and `windows-llrt-probe-3` produced by the
old scheme; those records are accurate and untouched. Both plans already resolve the artifact
name from the run's listing rather than reconstructing it, so they remain compatible.

**Verification:** `actionlint` exit 0 — which also validates `github.run_attempt` as a known
context property, since actionlint errors on unknown ones.

#### WR-07: `scripts/` outside `pnpm format`'s glob and the file not Prettier-clean

**Files modified:** `package.json`, `.prettierignore` (new file)
**Commit:** `03aac07`

**Applied fix:** two parts.

1. `package.json`'s `format` script now includes `"scripts/*.mjs"`, so the directory is covered
   going forward.
2. A new root `.prettierignore` lists `scripts/windows-llrt-probe.mjs` with the reason written
   out, making the decision explicit rather than an accident of the glob (which is what the
   finding asked for either way).

**Why exemption rather than reformat.** The fix guidance said to prefer the smallest change that
makes `npx prettier --check` pass if the reflow would churn the file heavily. Measured: the
reflow rewrites **21 hunks, +240/−59 lines, 599 → 780 lines** (+30%). It is
semantics-preserving — inspected directly: it only expands call arguments and object literals
vertically and never alters a template literal's contents, so the single-emission output grammar
was never actually at risk — but it would bury this pass's reviewed fixes under a mechanical
whole-file rewrite of a file whose value is being diffable against the blob that produced the
banked run, and which is deleted in Phase 9 (D-02) regardless. The `.prettierignore` entry
records all of this and is tagged for deletion together with the probe.

**`pnpm format` was deliberately NOT run.** Measuring first surfaced a pre-existing condition
(see *Observations* below): 46 tracked files under `packages/` are already not Prettier-clean, so
running it would have produced a 46-file diff unrelated to this phase.

**Verification** — the guidance asked specifically for proof that no existing file's treatment
changed:

| Check | Result |
|---|---|
| `npx prettier --check scripts/windows-llrt-probe.mjs` | **exit 0** (was exit 1) |
| `prettier --list-different .` still lists the probe? | **no** — the trap the finding names is closed |
| `--list-different` over the **old** glob | 46 files |
| `--list-different` over the **new** glob | 46 files |
| `diff` of those two file lists | **identical** — extending the glob changes what `pnpm format` does to exactly **zero** existing files |

---

## Deliberate deviations from the review's suggested fixes

Each was an explicit instruction in the fix guidance, not an oversight.

| Finding | Review suggested | Applied instead | Why |
|---|---|---|---|
| WR-03 | `catch (error) { info("P1-CMD", "could not remove …") }` in the `finally` | kept `catch { /* ignore */ }` | Fix guidance: "Keep the `finally`-block cleanup and its lint-safe `catch { /* ignore */ }` form." Cleanup must not mask the assertion's own outcome. The residual exposure is much smaller after the fix — what could leak is now a `0o700` directory rather than a world-readable executable sitting directly in the shared temp root. |
| WR-05 | rename **and** widen the regex to `secret(s)(\.\|\[)` | renamed only | Fix guidance: prefer renaming over widening; widening risks the self-non-matching property. |
| WR-07 | extend the glob, "then run it once" | extended the glob, exempted the probe, did **not** run it | Fix guidance: report heavy churn and prefer the smallest change. Running it would also have reformatted 46 unrelated pre-existing files. |

---

## Observations (not fixed — outside the cited findings)

1. **46 tracked files are not Prettier-clean under the pinned `prettier@3.8.1`.** Discovered
   while measuring WR-07: `pnpm format` is currently *not* a no-op — it rewrites 46 files across
   `packages/backend`, `packages/frontend` and `packages/shared`. This is pre-existing, entirely
   independent of Phase 3, and invisible to CI because `pnpm lint` uses `eslint-config-prettier`
   (which disables every formatting rule) and no `--check` runs anywhere. It is a latent trap of
   the same class WR-07 describes, one order of magnitude larger. Worth its own decision:
   either run `pnpm format` once and commit the result, or add a `prettier --check` gate. **Not
   touched here** — a 46-file reformat has no place in a review-fix commit.

2. **`assertP3Vars` carries a narrower version of WR-04's overstatement.** Its comment and its
   `INFO` line both say "process.env is never enumerated". In context both are scoped to that
   function (which genuinely does read the three names one by one), and the review cited only
   the file header, so this was left alone to keep the fix narrow. If the wording is tightened
   later, note that the `INFO` string reaches the archived artifact.

3. **Nothing in this pass can be confirmed on Windows from here.** WR-02's short-path branch and
   WR-05/WR-06's workflow changes only execute on `windows-latest`. Their local verification was
   as strong as the host allows (regex unit tests against the real measured value; the gate body
   run under the exact Actions bash flags; `actionlint` validating the `run_attempt` context) —
   but the provenance note above stands: a new `windows-latest` run is required.

---

## Out of scope — the 6 `IN-*` findings

Not fixed (scope is `critical_warning`; there was no `--all` flag). Listed so they are not lost:

| ID | Title | File |
|---|---|---|
| IN-01 | `oneLine` leaves a bare `\r`, which can visually spoof the artifact | `scripts/windows-llrt-probe.mjs:93-95` |
| IN-02 | `describeError` discards everything for a thrown non-`Error` | `scripts/windows-llrt-probe.mjs:109-112` |
| IN-03 | per-chunk `d.toString()` corrupts non-ASCII child output | `scripts/windows-llrt-probe.mjs:148-149` |
| IN-04 | the summary's "duplicate result recorded" branch is unreachable | `scripts/windows-llrt-probe.mjs:413-415` |
| IN-05 | the drive-letter check rejects a legal UNC temp path | `scripts/windows-llrt-probe.mjs:230` |
| IN-06 | P2-OS records `PASS` without evaluating the evidence it just printed | `scripts/windows-llrt-probe.mjs:325-326` |

> Line numbers are as cited in `03-REVIEW.md` and refer to the **pre-fix** blob `bd9338f0dc21`.
> The file has since grown; re-locate by symbol, not by line.

---

## Final verification

Run against `HEAD` (`03aac07`) with a clean working tree, measured with redirects rather than
pipes so `$?` reflects the command under test.

| Check | Required | Result |
|---|---|---|
| `pnpm lint` (`eslint . --max-warnings 0`) | exit 0 | **exit 0** |
| `pnpm -r typecheck` | exit 0 | **exit 0** |
| `pnpm exec vitest run` | exit 0 | **exit 0** — 134 passed / 23 files |
| `pnpm build` | exit 0 | **exit 0** |
| `actionlint .github/workflows/windows-llrt-probe.yml` | exit 0 | **exit 0** |
| `node scripts/windows-llrt-probe.mjs` | exit 1 on darwin | **exit 1** — P1-CMD `FAIL … indeterminate`, correct post-CR-02 behaviour |
| `^(PASS\|FAIL) \[ID\]:` count per ID | exactly 1 × 7 | **1, 1, 1, 1, 1, 1, 1** |
| `grep -c '"win32"'` | 1 | **1** |
| `npx prettier --check scripts/windows-llrt-probe.mjs` | exit 0 | **exit 0** |
| D-10 gate regex over both scanned files | exit 1 (no match) | **exit 1** |

**Protected-invariant audit** (the `do_not_touch` list), re-checked at `HEAD`:

| # | Invariant | State |
|---|---|---|
| 1 | `GATING_IDS = ["P0-ENV", "P0-TMP", "P1-CMD"]` | unchanged |
| 2 | Single-emission grammar — 0 inline `PASS`/`FAIL` prints | 0 |
| 3 | Single `process.exit(code)`; no `process.exitCode` | 1 / 0 |
| 4 | `"win32"` literal occurrences | 1 |
| 5 | Gate regex self-non-matching | holds (exit 1) |
| 6 | D-10 gate is three-branch (`-eq 0` / `-eq 1` / `else`) | all three present |
| 7 | `package-manager-cache: false` | present |
| 8 | Action pins match `ci.yml`; `pnpm/action-setup` absent | `checkout@v5`, `setup-node@v5`, `upload-artifact@v5`; 0 `uses:` lines reference pnpm |
| 9 | Zero runtime dependencies | all 5 imports are Node built-ins, bare `"os"` preserved for P2-OS |
| 10 | D-08 non-LLRT labels on P2-OS and P3-UUID | present |

**Working tree:** clean. Six commits on `main`, one per finding, nothing pushed, no CI triggered.

---

_Fixed: 2026-08-14T07:24:18Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
