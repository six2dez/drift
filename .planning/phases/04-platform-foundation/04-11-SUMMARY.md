---
phase: 04-platform-foundation
plan: 11
subsystem: infra
tags: [validation, phase-close, static-gates, human-verify, traceability, requirements, windows]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "All ten preceding Phase 4 plans (04-01 … 04-10) — the tree the seven phase-wide static gates are run against, plus runtime-probe.ts's formatProbeFailure/buildProbeReport (04-03, 04-08) and fs-retry.ts's withFsRetry (04-06)"
provides:
  - ".planning/phases/04-platform-foundation/04-VALIDATION.md — status: complete, nyquist_compliant: true, 7/7 gates recorded with their commands and outputs, and the blocking human read closed and dated"
  - "The two rendered RUN-05 probe failure messages, verbatim — the artifact a Windows bug reporter will eventually paste"
  - "Phase 4's traceability write: RUN-03, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04 marked Complete"
  - "A written, evidence-backed reason RUN-04 is held Pending and re-targeted to Phase 5"
affects: [05-kill-shell-wrappers, 09-ci-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A blocking human-verify checkpoint whose result is recorded as a human read with a date, never dressed up as a machine-verified gate"
    - "A secret scanner proven non-vacuous against a seeded positive control before its zero counts are trusted"
    - "A requirement held Pending with its reasoning written into REQUIREMENTS.md, so the gap survives the phase boundary as a fact rather than as a memory"

key-files:
  created:
    - .planning/phases/04-platform-foundation/04-11-SUMMARY.md
  modified:
    - .planning/phases/04-platform-foundation/04-VALIDATION.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "RUN-04 is held Pending, against the plan frontmatter that lists it among the seven. The requirement's own words are 'temp-file write→SPAWN path'. withFsRetry has exactly one production call site (index.ts:2300, the mcp-server.mjs staging copy); writeLaunchScript (:642) and writeMcpWrapper (:1086) still do .tmp write → chmod +x → rename → spawn unwrapped, and that pair is what 04-RESEARCH.md names the single best-documented AV case. Those two sites are inside the bash wrapper Phase 5 rewrites and are explicitly fenced by this plan's own Gate 6. Marking RUN-04 complete would claim coverage of the exact path Phase 4 is forbidden to touch."
  - "RUN-05 IS marked complete, because it was held contingent on precisely this checkpoint and the checkpoint passed. Its remaining clause — 'incl. Caido/runtime version' — is closed by D-08's documented substitution, not left open."
  - "The maintainer's approval is recorded as 'approved 2026-08-20 — a human read', with an explicit note that no gate can stand in for it. Recording it as a result would erase the one honest distinction bucket N exists to draw."
  - "The temp path appearing in variant (b)'s `Write error:` line is accepted as a by-design disclosure rather than a T-04-04 leak. It is the OS's own error string naming the file that could not be written, and on Windows it can carry the account name. A message that hides the failing path cannot diagnose the failure it exists to report."
  - "The scratch render test was created, run, and deleted in the same command — never committed. git status is clean at commit time and the suite count is unchanged at 245."

patterns-established:
  - "Re-render rather than quote: a continuation agent asked to record a message verbatim renders it itself instead of trusting a prior agent's transcription"
  - "A secret scan's zero counts are worthless until the scanner is shown to fire on a seeded positive; the first pass here used a shell-quoted double-backslash pattern that could never have matched anything"

requirements-completed: [RUN-03, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04]

# Metrics
duration: 12min
completed: 2026-08-20
---

# Phase 4 Plan 11: The Seven Phase Gates and the One Human Read Summary

**Phase 4 closes on evidence rather than on assertion: seven phase-wide static gates were executed (not inferred from diffs) and all seven passed, and the one criterion in the phase that no gate can reach — whether the RUN-05 probe failure message is legible and actionable to a Windows user who has never seen Drift's source — was closed by a real human reading two rendered variants on 2026-08-20; six of the phase's seven requirements are now Complete and the seventh, RUN-04, is held Pending with its reason written down, because `withFsRetry`'s single production call site does not cover the write→exec pair that Phase 4's own scope fence forbids it to touch.**

## Performance

- **Duration:** ~12 min (this continuation; task 1 ran under a prior agent)
- **Completed:** 2026-08-20
- **Tasks:** 2 (task 1 committed at `a9d0ced`; task 2 is a checkpoint with no source change)
- **Files modified:** 2 docs (`04-VALIDATION.md`, `REQUIREMENTS.md`) — **zero source files**
- **Suite at close:** 29 files / 245 tests / 0 failures, 806 ms

## Continuation context

Task 1 was executed and committed by a prior agent as `a9d0ced` before it stopped at task 2's
blocking checkpoint. That commit was verified present at `HEAD~1`-adjacent position with
`04-VALIDATION.md` carrying all seven gate results; **it was not redone**. Task 2's steps 1, 3 and 4
had also been run by that agent. This continuation re-ran steps 1, 3 and 4 anyway — see
*Deviations* — and completed the two human-judgement steps, 2 and 5.

## The two rendered messages, verbatim

Rendered by a throwaway vitest file that was **created, run and deleted in a single command** and
never committed (`git status --porcelain` empty at commit time; the suite count is unchanged at 245).
Both use realistic Windows-shaped inputs: `win32`, an 8.3-short-form tmpdir, LLRT's
`process.versions.node === "0.0.0"` discriminator, and `processVersion` absent.

### Variant (a) — `os.tmpdir()` missing

```text
Drift could not start the MCP server: a required runtime capability is missing.

Missing capability: Temp directory (os.tmpdir)
  Observed: os.tmpdir() is not available
  Needed for: Drift needs a temp directory to stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.

What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue at the Drift repository and paste the block below.

Versions:
  driftVersion: 0.5.0
  processVersion: unavailable
  versionsNode: 0.0.0
  versionsLlrt: 0.6.1
  osPlatform: win32
  osRelease: 10.0.26100

Reported (did not block startup):
  realpath: ok - path canonicalisation reached the path.resolve rung; realpathSync.native not probed
  windowsEnv: ok - USERPROFILE=present APPDATA=present LOCALAPPDATA=present TEMP=missing

Path budget:
  tempRootLength: unavailable
  projectedWorstCasePathLength: unavailable
```

### Variant (b) — first write fails `EPERM` after 6 attempts

```text
Drift could not start the MCP server: the first write to its temp directory failed.

Write error: EPERM: operation not permitted, open 'C:\Users\RUNNER~1\AppData\Local\Temp\drift-mcp-3f2a8c1b\mcp-server.mjs'
Attempts before giving up: 6
Needed for: Drift needs a temp directory to stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.

Missing capability: none - every runtime primitive answered, so the temp directory itself is the problem (a read-only or full volume, a redirected %TMP%, or an anti-virus lock on the file Drift just wrote).

What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue at the Drift repository and paste the block below.

Versions:
  driftVersion: 0.5.0
  processVersion: unavailable
  versionsNode: 0.0.0
  versionsLlrt: 0.6.1
  osPlatform: win32
  osRelease: 10.0.26100

Reported (did not block startup):
  realpath: ok - path canonicalisation reached the path.resolve rung; realpathSync.native not probed
  windowsEnv: ok - USERPROFILE=present APPDATA=present LOCALAPPDATA=present TEMP=present

Path budget:
  tempRootLength: 55
  projectedWorstCasePathLength: 127
```

## Step 2 — the human read (the four questions)

| Question | Answered by |
|---|---|
| **What is missing?** | The primitive is **named** — `Missing capability: Temp directory (os.tmpdir)` — with a separate `Observed:` line carrying what the call actually returned. Never "a runtime capability" |
| **Why does Drift care?** | `Needed for: … stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.` A user can tell from this line alone whether the failure is fatal |
| **What do I do now?** | `What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue…` — one concrete action, then one fallback |
| **What do I paste?** | The three trailing blocks. Six version fields, **every one present**, `unavailable` where a source threw rather than a hole. Contiguous, plain text, no markdown fences or ANSI, so it survives being pasted into a GitHub issue body |

**Variant (b) is the one this read mattered for.** Under D-07 the write *is* the `os.tmpdir()`
assertion, so a Defender-locked temp directory answers every capability correctly and still fails —
which made the first draft read as a self-contradiction: "the first write failed" immediately above
"nothing is missing". The shipped `Missing capability: none - every runtime primitive answered, so
the temp directory itself is the problem …` line exists precisely to resolve that pairing, and the
maintainer confirmed it lands as an explanation and not as a contradiction. The three named causes
(read-only or full volume / redirected `%TMP%` / an AV lock) are also the three things a user can
actually go and check.

**Result: APPROVED, 2026-08-20.** Recorded in `04-VALIDATION.md` as a *human read*, dated, with an
explicit note that no gate can substitute for it.

## Step 3 — the T-04-04 secret scan, re-run with a working control

| Pattern | Count | Verdict |
|---|---|---|
| `CAIDO_TOKEN` | 0 | clean |
| `CAIDO_AUTHENTICATION` | 0 | clean |
| `Bearer ` | 0 | clean |
| `C:\Users\runneradmin` (a real profile **value**) | 0 | clean |
| `(APPDATA\|USERPROFILE\|LOCALAPPDATA)=<path>` | 0 | clean |
| **Positive control:** seeded `CAIDO_TOKEN=abc123` | 1 | **scanner fires** |
| **Positive control:** the variable *names* | 5 | `USERPROFILE=present APPDATA=present LOCALAPPDATA=present TEMP=present\|missing` — presence booleans by name, the designed rendering |

The first pass of this scan was **vacuous** and is recorded as such: the profile-value pattern was
written `'C:\\Users\\runneradmin'` inside shell single quotes, so `grep -F` searched for a literal
double backslash and could never have matched. It was rewritten and re-run. A zero from an unproven
scanner is not evidence.

**One residual, disclosed by design:** variant (b)'s `Write error:` line contains the temp path,
because it is the OS's own error string and it names the file that could not be written. On Windows
that path can carry the account name (`C:\Users\RUNNER~1\…` in the render). This is accepted rather
than an oversight — a message that hides the failing path cannot diagnose the failure it exists to
report — and it is written into `04-VALIDATION.md` § *Manual-Only Verifications* so a later reader
does not rediscover it as a finding.

## Step 4 — full suite

`pnpm exec vitest run` → **29 files / 245 tests / 0 failures**, 806 ms. Unchanged from the phase-close
measurement in Gate 5, including `provider-launch.test.ts`'s exact `toEqual([...])` arrays, which are
the CMP-01 regression tripwire.

## Step 5 — the two known-and-accepted gaps

**1. SC-4's "Caido version" — accepted as a substitution, with the record corrected.**

The prior agent found that three Phase 4 artifacts had claimed `sdk.meta` exposes only `db()`,
`path()` and `assetsPath()`. That enumeration is wrong: `MetaSDK` in `@caido/sdk-backend@0.55.3`
(`src/typing.d.ts:164-196`) declares **six** members — `id()`, `path()`, `assetsPath()`, `db()`,
`version()` and `updateAvailable()`. But `version()` is documented as the **plugin's** version, which
`driftVersion` already reports. **The substantive claim is unchanged:** there is no *Caido* version
anywhere in the SDK surface, so D-08's best-effort block is the closest available substitute rather
than an omission. Accepted by the maintainer. Worth keeping the correction visible — the original
three-member claim was wrong in a way that would have made a future reader think the option had never
been checked.

**2. RUN-04's real Defender lock — accepted as a deferral.** Not inducible on any CI runner. Shipped
mitigation: every retry logs its code and attempt index through `sdk.console`, and the attempt count
reaches `getDiagnostics` as `mcpFirstWriteAttempts` (`index.ts:3470`), so the next real bug report
answers whether the 6-attempt / 1,500 ms ladder (`FS_RETRY_DELAYS_MS = [50, 100, 200, 400, 750]`) was
long enough. Real-machine confirmation waits on the original Windows reporter in Phase 9/10.

## RUN-04: why it is held Pending, and why that is not a downgrade

The plan's frontmatter lists seven requirements. Six are marked Complete. RUN-04 is not, and the
reasoning was verified against the tree rather than inherited:

```
grep -rn "withFsRetry" packages/backend/src --include=*.ts | grep -v '\.test\.ts'
  fs-retry.ts:136   export async function withFsRetry<T>(
  index.ts:97       import { withFsRetry } from "./fs-retry";
  index.ts:2300     const written = await withFsRetry(     ← the ONLY production call site
```

| RUN-04 clause | Status | Evidence |
|---|---|---|
| "copy `mcp-server.mjs` once at start" | ✅ shipped | `index.ts:2300` wraps the `mkdir` + `readFile`/`writeFile` staging pair |
| "bounded retry on `EPERM`/`EBUSY`" | ✅ shipped | 6 attempts / 1,500 ms, `onRetry` logging code + attempt, `mcpFirstWriteAttempts` in diagnostics |
| "temp-file write→**spawn** path tolerates the write-then-exec race" | ❌ **not** covered | `writeLaunchScript` (`:642`) and `writeMcpWrapper` (`:1086`) still do `.tmp` write → `chmod +x` (`:654`, `:1114`) → `rename` → spawn, all **unwrapped** |

The third row is the requirement's headline clause and the case `04-RESEARCH.md` names as the single
best-documented AV write-then-exec scenario. Both sites are inside the bash wrapper that **Phase 5**
rewrites, and this plan's own **Gate 6** asserts they are untouched — Phase 4 is forbidden to fix
them. Marking RUN-04 complete would claim coverage of the exact path the phase is fenced away from,
and the fence would then be invisible to Phase 5. The reasoning is written into `REQUIREMENTS.md`
under *Deliberately held Pending at the close of Phase 4* so it survives the phase boundary as a
recorded fact rather than as something a future reader has to re-derive.

A partial-credit reading exists and is worth naming: the parenthetical half of RUN-04 is fully
shipped, so this is "one of two clauses done", not "nothing done". The choice is deliberately the
conservative one — an over-claimed requirement is a defect that only surfaces when someone trusts it.

## Deviations from Plan

### 1. [Rule 2 — missing critical verification] Task 2's steps 1, 3 and 4 were re-run, not inherited

The prior agent had run them before stopping. This continuation re-rendered both variants, re-ran the
secret scan and re-ran the full suite anyway, because the plan's `<output>` block requires the
rendered message **verbatim** in this summary and transcribing a prior agent's paste is not the same
evidence as producing it. The re-run found a real defect in the inherited work: the secret scan's
profile-value pattern was shell-quoted such that it could never match (see *Step 3*). Cost: one
vitest invocation. This is the same lesson Phase 4 already recorded twice — run the gate, do not
infer it.

- **Files modified:** none (scratch render created and deleted in one command)
- **Commit:** this plan's docs commit

### 2. [Judgement call] RUN-04 held Pending against the plan's seven-requirement frontmatter

Documented in full above. This is a deliberate, evidence-backed disagreement with the frontmatter's
implied "all seven complete", not a silent omission — `REQUIREMENTS.md` carries the reason.

### 3. [Record correction, carried forward] The `MetaSDK` three-member claim was wrong

Found by the prior agent, confirmed here against `@caido/sdk-backend@0.55.3 src/typing.d.ts:164-196`:
six members, not three. The SC-4 conclusion is unaffected because the extra `version()` is the
*plugin* version. Recorded because the wrong enumeration reads as "nobody checked".

## Authentication Gates

None.

## Known Stubs

None. This plan modifies no source files.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change — the only
source-adjacent activity was a scratch render that was deleted before commit.

## Verification

| Check | Result |
|---|---|
| Task 1's commit `a9d0ced` present, `04-VALIDATION.md` carries 7/7 gates | ✅ verified, not redone |
| Both variants rendered and recorded verbatim | ✅ |
| T-04-04 secret scan, scanner proven non-vacuous | ✅ 0 leaks + 2 positive controls fire |
| `pnpm exec vitest run` | ✅ 29 files / 245 tests / 0 failures |
| `04-VALIDATION.md` → `status: complete`, `human_read: 2026-08-20` | ✅ |
| Approval line filled, recorded as a human read | ✅ |
| `git status --porcelain` clean before commit (scratch file gone) | ✅ |
| Six requirements Complete, RUN-04 Pending with written reasoning | ✅ |

## Self-Check: PASSED

All three files verified present on disk; both commits (`a9d0ced` task 1, `9130b42` this plan) verified in `git log`. The last commit deletes zero tracked files.
