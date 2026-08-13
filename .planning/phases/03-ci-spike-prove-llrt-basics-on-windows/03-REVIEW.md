---
phase: 03-ci-spike-prove-llrt-basics-on-windows
reviewed: 2026-08-13T13:48:27Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - scripts/windows-llrt-probe.mjs
  - .github/workflows/windows-llrt-probe.yml
findings:
  critical: 2
  warning: 7
  info: 6
  total: 15
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-08-13T13:48:27Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two files reviewed: `scripts/windows-llrt-probe.mjs` (449 lines) and
`.github/workflows/windows-llrt-probe.yml` (181 lines). Judged as a CI diagnostic spike
whose deliverable is an *artifact of conclusions*, not a shipping runtime. The deliberate
constraints named in the review brief (single-emission output grammar, `process.exit`,
self-non-matching secret regex, three-arm grep gate, `package-manager-cache: false`, pin
alignment with `ci.yml`, dummy sentinel, POSIX-free scope) were verified and are **not**
reported as findings.

Mechanics that were checked and hold: `spawnCapture` cannot double-settle (I traced all four
surfaces); the timer is cleared on both non-timeout paths; no assertion function can record
two results on any path; `GATING_IDS` is a strict subset of `ASSERTION_IDS` so the summary
loop can never skip a gating ID; nothing outside the `=== Summary ===` block can emit a line
matching `^(PASS|FAIL) \[ID\]:` (every child-derived string reaches `detail` through
`JSON.stringify`); `pipefail` + `2>&1` correctly propagate the probe's exit code past `tee`;
the workflow interpolates no `${{ }}` expression into any shell context, so there is no
Actions-injection surface; `pull_request` (not `pull_request_target`) plus
`permissions: contents: read` and zero secrets is the right shape for fork PRs. I confirmed
the gate regex is self-non-matching by running it (`grep -nE 'CAIDO_(TOKEN)|secret(s)\.'`
over both files exits 1), and confirmed `pnpm lint` is green with `catch { /* ignore */ }`
accepted by `no-empty`.

The two critical findings are the same defect class: **a gating assertion records `PASS` and
prints an architectural directive that its own evidence does not support.** CR-01 is
corroborated by the phase's own `03-FINDINGS.md:167` ("Phase 4 must not adopt it as
written") and by `03-FINDINGS.md:327`, which lists the thing P0-ENV was supposed to measure
as still open. CR-02 I reproduced by running the probe on this host. Because the probe's
entire product is the archived artifact, a `PASS` line carrying a false directive is the
highest-severity outcome for this file pair — a reader of the artifact months from now does
not have `03-FINDINGS.md` open beside it.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: P0-ENV uses `PATH` as its replace-vs-merge discriminator — the one variable Windows back-fills — and emits a provably false directive

**File:** `scripts/windows-llrt-probe.mjs:173-175, 190-197`
**Severity:** BLOCKER

**Issue:** `ENV_CHILD_SCRIPT` reports `PATH-VISIBLE` / `PATH-ABSENT`, and lines 194-197 derive
the entire architectural conclusion from that single bit:

```js
const inheritance = pathVisibility === "PATH-ABSENT" ? "replaced" : "merged into";
info("P0-ENV", `the env option ${inheritance} the parent environment block — child reported ${pathVisibility}, so Phases 4-8 ${pathVisibility === "PATH-ABSENT" ? "MUST spread ...process.env whenever the child needs PATH" : "inherit the parent block and need not spread ...process.env"}`);
pass("P0-ENV", `... that option ${inheritance} the parent environment (child reported ${pathVisibility})`);
```

On Windows, libuv's `make_program_env()` (`src/win/process.c`) does **not** merge the parent
environment. It back-fills a fixed eleven-name `required_vars[]` list into whatever block the
caller supplied — `HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP,
USERDOMAIN, USERNAME, USERPROFILE, WINDIR`. `PATH` is on that list ("Also add PATH to the
list, just for convenience"). So on the only host this probe exists to measure, the
discriminator is guaranteed to read `PATH-VISIBLE` whether the block was replaced or merged.
The bit carries zero information on Windows.

The consequence is not theoretical. The real `windows-latest` run emitted, verbatim
(`03-FINDINGS.md:142` and `:120`):

```
INFO [P0-ENV]: the env option merged into the parent environment block — child reported PATH-VISIBLE, so Phases 4-8 inherit the parent block and need not spread ...process.env
PASS [P0-ENV]: ... that option merged into the parent environment (child reported PATH-VISIBLE)
```

Both sentences are false. `APPDATA` and `LOCALAPPDATA` — exactly the variables
`command-resolution.ts` needs for the Windows nvm/fnm paths per CLAUDE.md's POSIX-surface
table — are **not** in `required_vars[]` and do **not** survive. `03-FINDINGS.md:167` had to
override the probe in prose, and `03-FINDINGS.md:327` still lists "whether a variable outside
libuv's eleven survives" as an open question. The probe's one mechanized job was to answer
that, and it answered the opposite.

I reproduced the failure mode locally by simulating the Windows back-fill:

```
$ node -e '...spawnSync(node, ["-e", ENV_CHILD_SCRIPT], { env: { SENTINEL, PATH: process.env.PATH } })'
simulated-windows-required_vars -> "sent|PATH-VISIBLE"
probe would infer: merged into
truth: env option REPLACED the block; HOME visible in child? false
```

**Fix:** discriminate with a name libuv does not back-fill, and stop asserting a general
inheritance property from one variable. Two fields, not one:

```js
// Set in the PARENT only; not one of libuv's eleven required_vars, so a Windows
// back-fill cannot manufacture a false "merged" reading.
process.env.DRIFT_PROBE_PARENT_ONLY = "1";

const ENV_CHILD_SCRIPT =
  "process.stdout.write((process.env.SENTINEL || 'MISSING') + '|' + " +
  "(process.env.PATH ? 'PATH-VISIBLE' : 'PATH-ABSENT') + '|' + " +
  "(process.env.DRIFT_PROBE_PARENT_ONLY ? 'PARENT-INHERITED' : 'PARENT-CLEARED'))";

// ...
const parentBlock = isolatedFields[2] ?? "UNREPORTED";
const inheritance = parentBlock === "PARENT-CLEARED" ? "replaced" : "merged into";
info("P0-ENV",
  `the env option ${inheritance} the parent environment block (non-back-filled marker: ${parentBlock}); ` +
  `PATH separately reported ${pathVisibility} — on Windows PATH is one of libuv's eleven required_vars ` +
  `and is back-filled even into a replaced block, so it does NOT license "the parent block is inherited". ` +
  `Phases 4-8 MUST pass every variable they need (notably APPDATA/LOCALAPPDATA) explicitly.`);
```

---

#### CR-02: P1-CMD treats any spawn error as "conclusive" regardless of errno or platform, manufacturing a false `PASS` on the gating set

**File:** `scripts/windows-llrt-probe.mjs:271-286`
**Severity:** BLOCKER

**Issue:** The classifier branches only on `observed.surface`. Any `error` event and any
synchronous `throw` — whatever the errno, on whatever OS — is recorded as `PASS` with the
directive "direct `.cmd` spawn is not usable on this host, so Phases 4-8 must route `.cmd`
targets through `cmd.exe /c`". Nothing in the branch inspects `error.code`, and nothing checks
`platform()`.

`writeFileSync(cmdPath, ...)` at line 262 creates the file with the default mode (`0o666 &
~umask` → `0o644`), i.e. **not executable**. On any POSIX host the immediately following
`spawn(cmdPath)` therefore fails with `EACCES` for a reason that has nothing whatsoever to do
with `.cmd` semantics — and P1-CMD reports `PASS`. Reproduced on this machine:

```
INFO [P1-CMD]: surface=error exit=null ... error=EACCES: spawn /var/folders/.../probe-test-1786628483424.cmd EACCES
PASS [P1-CMD]: spawn-error-event — the child emitted an error event with EACCES: ...
              (conclusive: direct .cmd spawn is not usable on this host, so Phases 4-8 must
              route .cmd targets through cmd.exe /c)
```

P1-CMD is in `GATING_IDS`, and under D-07 its `PASS` means "the outcome was conclusive". A
missing execute bit is not a conclusion about `.cmd` handling. This is precisely the
false-green shape the exit contract is supposed to prevent, on a gating ID, and it is
undetected — `03-FINDINGS.md` records the darwin run but never flags this line. The same hole
means a future Defender/AppLocker `EPERM` on Windows, or an `EACCES` from a locked-down
`TEMP`, is silently promoted to an architectural verdict rather than escalated as
indeterminate.

**Fix:** require the errno to be one D-07 actually recognises, and refuse to draw a
`.cmd`-specific conclusion off-platform.

```js
const CONCLUSIVE_CMD_ERRNOS = new Set(["EINVAL", "EPERM", "EBUSY", "ENOENT", "ENOEXEC"]);
const errCode = observed.error?.code;
const onWindows = platform() === "win32";

if (observed.surface === "throw" || observed.surface === "error") {
  if (!onWindows) {
    fail("P1-CMD", `not applicable — this host is ${platform()}, not Windows; the observed ${describeError(observed.error)} is an ordinary POSIX exec failure (the probe writes the .cmd without an execute bit) and says nothing about Windows .cmd handling`);
  } else if (!CONCLUSIVE_CMD_ERRNOS.has(errCode)) {
    fail("P1-CMD", `indeterminate — surface=${observed.surface} with unrecognised ${describeError(observed.error)}; not one of D-07's expected errnos (${[...CONCLUSIVE_CMD_ERRNOS].join(", ")}), so Phase 4 has no architectural basis`);
  } else {
    pass("P1-CMD", `${observed.surface === "throw" ? "spawn-threw-sync" : "spawn-error-event"} — ${describeError(observed.error)} on ${platform()} ... Phases 4-8 must route .cmd targets through cmd.exe /c`);
  }
}
```

Also add `platform()` to every P1-CMD detail string so the archived artifact is
self-describing.

---

### Warnings

#### WR-01: `spawnCapture` never handles `'error'` on the child's stdio streams — a pipe reset kills the probe before the summary is emitted

**File:** `scripts/windows-llrt-probe.mjs:148-149`
**Severity:** WARNING

**Issue:** Only `child.on("close")` and `child.on("error")` are registered. `child.stdout` and
`child.stderr` get `"data"` handlers but no `"error"` handler. An `'error'` emitted by a
stream with no listener is re-thrown as an uncaught exception. On Windows, reading a named
pipe whose writer was abruptly terminated is a known `ECONNRESET`/`EPIPE` source — and the
probe abruptly terminates its child at line 144 (`child.kill("SIGKILL")` → `TerminateProcess`)
on the timeout path, which is exactly the "hangs" branch P1-CMD exists to characterise.

Blast radius: the uncaught exception rejects the top-level `await main()`, so the
`=== Summary ===` block never runs. `probe-results.txt` is uploaded (the step is
`if: always()`) containing zero `PASS`/`FAIL` lines while the job is red — a false-red with
the evidence destroyed, which the brief names as a top-severity outcome. `child.on("error")`
does not cover this; stream errors are a separate emitter.

**Fix:** (verified lint-clean — `no-empty-function` is not enabled in this config)

```js
child.stdout?.on("error", () => { /* pipe teardown after kill; the surface is already classified */ });
child.stderr?.on("error", () => { /* same */ });
child.stdout?.on("data", (d) => { stdout += d.toString(); });
```

---

#### WR-02: P0-TMP passes an 8.3 short path without classifying it

**File:** `scripts/windows-llrt-probe.mjs:230-246`
**Severity:** WARNING

**Issue:** The checks are drive-letter + `existsSync`, and the `PASS` detail asserts only
"is drive-lettered and exists on disk". On `windows-latest` the measured value is
`C:\Users\RUNNER~1\AppData\Local\Temp` while `USERPROFILE` is `C:\Users\runneradmin` — the
8.3 short form. These are both valid and **not string-comparable**, which is a direct hazard
for Phases 4-8 (`startsWith`/`===` against a profile-derived path silently returns false).
The probe is the one component positioned to detect this mechanically and it does not; the
hazard was caught only by a human reading the raw value out of the `INFO` line
(`03-FINDINGS.md`, "os.tmpdir() returned the 8.3 short form"). The evidence is in the
artifact, but the *classification* — the thing the summary line is for — is missing.

**Fix:**

```js
const isShortName = /~\d(?=[\\/]|$)/.test(tempDir);
const realTempDir = (() => { try { return realpathSync.native(tempDir); } catch { return tempDir; } })();
info("P0-TMP", `short-8.3-form=${isShortName} realpath.native=${JSON.stringify(realTempDir)}`);
pass("P0-TMP", `platform is Windows and os.tmpdir()=${JSON.stringify(tempDir)} is drive-lettered and exists on disk${isShortName ? ` — WARNING: this is an 8.3 SHORT PATH (expands to ${JSON.stringify(realTempDir)}); Phases 4-8 must normalise before comparing it to any USERPROFILE/APPDATA-derived path` : ""}`);
```

---

#### WR-03: predictable, non-exclusive temp file is written world-readable into a shared `/tmp` and then executed

**File:** `scripts/windows-llrt-probe.mjs:257, 262, 287-291`
**Severity:** WARNING

**Issue:** `join(tmpdir(), 'probe-test-' + Date.now() + '.cmd')` is a guessable path, and
`writeFileSync` uses the default flag `w` and default mode (`0o644` after umask). On Linux
`tmpdir()` is the shared, world-writable `/tmp`, so this is CWE-377/CWE-367: another local
user can pre-create the path as a symlink and have the probe clobber the target, or win the
write→spawn race at line 271 and get the probe to execute content it controls. This also
diverges from the convention CLAUDE.md codifies for this repo ("Directories holding sensitive
temp files: `0o700`… Executable launch scripts and wrappers: `0o700`").

Secondary: the `finally` at 287-291 swallows the unlink failure. On Windows, `unlinkSync` on a
file whose SIGKILLed `cmd.exe` still holds a handle fails with `EBUSY`/`EPERM`, so the probe
leaves an executable `.cmd` behind in the user's temp directory with no trace in the artifact.

**Fix:**

```js
import { mkdtempSync, rmSync } from "node:fs";
// ...
const cmdDir = mkdtempSync(join(tmpdir(), "drift-probe-"));  // mode 0o700, unpredictable name
const cmdPath = join(cmdDir, "probe-test.cmd");
writeFileSync(cmdPath, "@echo off\r\necho CMD_PROBE_RAN\r\n", { flag: "wx", mode: 0o700 });
// ...
} finally {
  try { rmSync(cmdDir, { recursive: true, force: true }); }
  catch (error) { info("P1-CMD", `could not remove ${cmdDir}: ${describeError(error)} — a probe .cmd may remain on disk`); }
}
```

---

#### WR-04: the header asserts a D-10 invariant the code does not hold

**File:** `scripts/windows-llrt-probe.mjs:31-35` vs `:208`
**Severity:** WARNING

**Issue:** Lines 33-35 state: "it never enumerates or dumps the environment — the three
Windows variables P3-VARS reports are named explicitly, one by one (D-10)." Line 208 is
`{ ...process.env, SENTINEL: sentinel }`, which enumerates the whole environment — on a hosted
runner that block includes `ACTIONS_RUNTIME_TOKEN` and every injected Actions variable — and
hands it to a child process. No leak reaches the artifact (the child prints only two derived
fields, and P0-ENV's failure details `JSON.stringify` only that stdout), so this is not an
exposure. But D-10 is a *gated contract* in this repo, and the file's own statement of it is
false; the next person to edit the retry path has been told an invariant that does not exist.

**Fix:** scope the claim to what holds.

```
 * Credential handling: none. [...] The probe never reads a Caido credential, and it never
 * prints or logs environment values other than the three Windows profile variables P3-VARS
 * names explicitly (D-10). One code path — the P0-ENV merged retry at line ~208 — spreads
 * process.env into a CHILD's env block to isolate "env option ignored" from "cleared block
 * breaks the child"; that child's only output is the sentinel and a PATH-present flag, so no
 * environment value is ever emitted.
```

---

#### WR-05: the D-10 gate's step name over-claims what two literal patterns can prove

**File:** `.github/workflows/windows-llrt-probe.yml:110, 127-129`
**Severity:** WARNING

**Issue:** The step is named "Assert no secret material is reachable (D-10)" but the check is
`grep -nE 'CAIDO_(TOKEN)|secret(s)\.'`. It detects two textual shapes and cannot detect the
single most likely real accident — a literal credential pasted into either file (a bare JWT,
hex string, or `Bearer …`) — nor `${{ secrets['NAME'] }}` bracket indexing, nor
`env.SOMETHING_TOKEN` indirection. The `echo` on line 139 is accurately scoped ("no Caido
token reference and no GitHub secrets expression"); the step name is not, and the step name is
the contract plan 03-04 reads back by name from the API. Since the gate is explicitly designed
to outlive the spike and guard Phases 4-8 edits, the gap matters.

**Fix:** rename the step to match the check, and widen the pattern to cover bracket indexing
(this alternation is still self-non-matching, since the source text has `secret(s)` where the
regex requires the literal `secrets`):

```yaml
      - name: Assert no Caido token reference and no GitHub secrets expression (D-10)
        shell: bash
        run: |
          ...
          grep -nE 'CAIDO_(TOKEN)|secret(s)(\.|\[)' \
```

---

#### WR-06: artifact name is keyed on `run_number`, which is stable across re-run attempts

**File:** `.github/workflows/windows-llrt-probe.yml:177`
**Severity:** WARNING

**Issue:** `name: windows-llrt-probe-${{ github.run_number }}`. `github.run_number` does not
change when a run is re-run; only `github.run_attempt` increments. Artifact names must be
unique within a workflow run for `upload-artifact` v4+ — this repo already documents that
constraint in `ci.yml`'s own comment ("upload-artifact returns 409 on duplicate artifact
names"). A probe that legitimately exits 1 is the *expected* case here (D-05 through D-07 all
define non-zero outcomes as recorded findings), so "re-run the failed job" is a routine
operation, and on that re-run the upload step can fail with a 409 against the artifact the
first attempt already uploaded. Cost of the fix is one token.

**Fix:**

```yaml
          name: windows-llrt-probe-${{ github.run_number }}-${{ github.run_attempt }}
```

Plans 03-03/03-04 already resolve the artifact name from the run's listing rather than
assuming it, so this change is compatible with them.

---

#### WR-07: `scripts/` is outside `pnpm format`'s glob and the file is not Prettier-clean

**File:** `scripts/windows-llrt-probe.mjs` (whole file); `package.json` `format` script
**Severity:** WARNING

**Issue:** A new top-level source directory was added without extending the formatter's reach.
`pnpm format` covers `packages/**/src/**/*.{vue,ts,js,json}` and root-level `*.{ts,mjs}` —
neither matches `scripts/*.mjs`. Verified: `npx prettier --check scripts/windows-llrt-probe.mjs`
fails today (longest line is 438 chars). ESLint cannot catch it because
`eslint-config-prettier` is applied last and disables every formatting rule, so `pnpm lint`
stays green on an unformatted file. The consequence is a trap: any contributor who runs
`npx prettier --write .` instead of `pnpm format` produces a large reformat diff on a file
whose long single-line template literals are load-bearing for the output grammar.

**Fix:** extend the glob so the state is explicit and enforced.

```json
"format": "prettier --write \"packages/**/src/**/*.{vue,ts,js,json}\" \"scripts/*.mjs\" \"*.{ts,mjs}\""
```

then run it once. If the reflow is undesirable for this file specifically, add
`scripts/windows-llrt-probe.mjs` to a `.prettierignore` with a one-line reason — either way,
make the decision explicit rather than an accident of the glob.

---

### Info

#### IN-01: `oneLine` leaves a bare `\r`, which can visually spoof the artifact

**File:** `scripts/windows-llrt-probe.mjs:93-95`
**Issue:** `.replace(/\s*\r?\n\s*/g, " ")` requires an `\n`. A lone `\r` survives (verified:
`oneLine("abc\rPASS [P0-TMP]: x")` → `"abc\rPASS [P0-TMP]: x"`). The grep-counted contract is
safe — grep splits on `\n` only, so the line still starts with `INFO` — but a terminal
rendering `cat probe-results.txt` will overwrite the `INFO [P3-VARS]: ` prefix and display a
forged status line. Reachable via `info("P3-VARS", ...)` at line 343 and the `PROBE-ABORT`
stack at 396, both of which pass unescaped text.
**Fix:** `.replace(/\s*[\r\n]+\s*/g, " ")`.

#### IN-02: `describeError` discards everything for a thrown non-Error

**File:** `scripts/windows-llrt-probe.mjs:109-112`
**Issue:** Verified — `describeError("boom")` returns `"no-code: no-message"`, losing the only
information present. Every current caller feeds it a real `Error`, so this is latent, but it
sits on the diagnostic path where losing the payload is the whole cost.
**Fix:** `if (typeof error !== "object" || error === null) return String(error);` before the
existing return.

#### IN-03: per-chunk `d.toString()` corrupts non-ASCII child output

**File:** `scripts/windows-llrt-probe.mjs:148-149`
**Issue:** Each chunk is decoded independently as UTF-8, so a multi-byte sequence straddling a
chunk boundary becomes U+FFFD. Compounding it, `cmd.exe` and `where.exe` emit console-code-page
(OEM, e.g. CP850) text, not UTF-8, so localized Windows error strings land in the artifact as
mojibake. Diagnostic-only impact, but the artifact is the deliverable.
**Fix:** `child.stdout?.setEncoding("utf8")` (Node's `StringDecoder` then handles boundaries),
or accumulate `Buffer`s and decode once at settle time.

#### IN-04: the summary's "duplicate result recorded" branch is unreachable

**File:** `scripts/windows-llrt-probe.mjs:413-415`
**Issue:** I traced every assertion function: each records exactly one `pass()` or `fail()` on
every path, including the early-return paths in `assertP0Env`, `assertP0Tmp`, `assertP1Where`,
`assertP3Vars`, `assertP3Uuid` and the write-failure path in `assertP1Cmd`. No caller can
produce `recorded.length > 1`. Keeping the branch is correct defence-in-depth, but as written
it reads as if duplicates are a live possibility.
**Fix:** annotate it — `// Unreachable by construction (every assert records exactly one
result on every path); kept so a future edit that breaks that invariant fails loudly instead
of silently dropping a result.`

#### IN-05: the drive-letter check rejects a legal UNC temp path

**File:** `scripts/windows-llrt-probe.mjs:230`
**Issue:** `/^[A-Za-z]:[\\/]/` fails for `\\server\share\...`, which is a valid `TEMP` on a
roaming or redirected Windows profile. P0-TMP would then `fail` and gate the exit code to 1 on
a Windows host that is actually fine. `windows-latest` never hits this, so it is informational
for the spike — but Phases 4-8 inherit the same assumption if it is copied forward.
**Fix:** `/^([A-Za-z]:[\\/]|\\\\[^\\/]+[\\/])/`, and say "drive-lettered or UNC" in the detail.

#### IN-06: P2-OS records `PASS` without evaluating the evidence it just printed

**File:** `scripts/windows-llrt-probe.mjs:325-326`
**Issue:** The `info` line computes `typeof tmpdir` and `typeof platform`, then `pass()` is
called unconditionally. A runtime that resolved the bare `"os"` specifier to an empty or
partial namespace would still be recorded as a pass. Non-gating under D-08, and P0-TMP happens
to exercise both functions first, so the practical risk is nil — but an assertion that ignores
its own measurement is worth closing while it is cheap.
**Fix:**

```js
const resolved = typeof tmpdir === "function" && typeof platform === "function";
if (!resolved) {
  fail("P2-OS", `the bare "os" specifier resolved but did not yield callable members (typeof tmpdir=${typeof tmpdir}, typeof platform=${typeof platform}) (node-vehicle; ...)`);
  return;
}
pass("P2-OS", `...`);
```

---

_Reviewed: 2026-08-13T13:48:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
