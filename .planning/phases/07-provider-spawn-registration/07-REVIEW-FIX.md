---
phase: 07-provider-spawn-registration
fixed_at: 2026-08-24T10:27:00Z
review_path: .planning/phases/07-provider-spawn-registration/07-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-08-24
**Source review:** `.planning/phases/07-provider-spawn-registration/07-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, WR-01, WR-02, WR-04, WR-05, WR-06, WR-08)
- Fixed: 7
- Skipped: 0
- Out of scope, untouched: WR-03, WR-07, IN-01…IN-07

**Gates at HEAD:** `vitest run` 525 passed / 5 skipped (baseline 486/5), `pnpm -r typecheck` 0, `pnpm lint` 0.
The 5 skips are the win32-gated suite, which is by design off-Windows and is now
asserted to execute on the Windows leg (WR-08).

## Fixed Issues

### CR-01: `cmd.exe` spawned by bare name

**Commit:** `624083b`
**Files:** `packages/backend/src/platform.ts`, `packages/backend/src/platform.test.ts`,
`packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`

`selectComspec({ env, platform })` added to `platform.ts` — the same pure,
env-injected shape `getWindowsNamedRoots` and `isNvmWindowsInstalled` already use,
so the win32 answers are provable on the Linux runner. Reads `COMSPEC` / `ComSpec`
/ `comspec` explicitly (the comment records why: `process.env` is case-insensitive
on Windows only, cmd.exe exports `ComSpec`, and Caido's runtime is LLRT rather than
Node). Refuses a relative value, returns `undefined` off win32 so a Wine/msys
COMSPEC cannot reach the POSIX passthrough arm. `index.ts` reads the environment at
the I/O boundary via `getComspec()` and passes it at all five call sites. The pure
module was not changed — it already handled `undefined`/`""`.

**Asserted by:** 9 cases in `platform.test.ts` (both spellings, absent, empty,
whitespace, relative including drive-relative `C:cmd.exe`, fail-closed first-hit,
three non-win32 platforms) + a new comment-stripped source scan
(`index.source.test.ts`) that counts the `buildSpawnPlan` call sites, pins the count
at five, and requires `comspec` at each.

### WR-01 + WR-02: unreachable loud check, and the comment that named the wrong environment

**Commit:** `5ff48fa`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/mcp-server-spec.test.ts`,
`packages/backend/src/index.source.test.ts`

Fixed together because the comment WAS the justification for the guard's shape.
`spawnEnvToken` is now composed with the same production builder `sendCliMessage`
uses (`buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: spec.driftVars })`)
instead of `spec.env.CAIDO_TOKEN`, which belongs to the MCP server's own node
process. The rewritten comment states plainly that with a spec in hand the value
still cannot be empty, so the check is a **structural backstop**, not a live gate,
and points at WR-06's guard as the reachable one.

**Asserted by:** two cases in `mcp-server-spec.test.ts` that compose the value the
way `index.ts` now does and pin the invariant (including that the two environments
are different objects that merely agree on this key); three source-scan cases for
the wiring. No existing test weakened — the synthetic `[undefined, "", "   "]` cases
still run.

### WR-04: the "unconditional" sweep's two undocumented gates

**Commit:** `e37f436`
**Files:** `packages/backend/src/mcp-server-spec.ts`, `packages/backend/src/index.ts`,
`packages/backend/src/mcp-server-spec.test.ts`,
`packages/backend/src/index.source.test.ts`, `README.md`

Implemented the review's *better* option, not the minimum. `formatMcpSweepBlockedResidual`
(pure) renders a per-CLI residual notice with the paste-able commands drawn from the
same per-CLI policy `planMcpCliRemoval` iterates — so a Codex user is never handed
`--scope`, which that CLI does not accept. Codex is told the entry carries the token
in plain text; Gemini is told it carries a `CAIDO_TOKEN` reference that can shadow
the next entry. The claim is conditional ("if Drift ever registered"), which is the
strongest true statement available across process lifetimes. Emitted on
`sdk.console.error`, **once per process per command value** rather than once per MCP
start — a line that repeats forever is the one nobody reads, which is the argument
the sweep already makes for its own banner.

The card sentence keeps its wording and channel, with a comment now stating why it is
*not* the residual notice (`checkProvider` short-circuits an unresolvable command to
`capability: "unavailable"` before `applyProviderLimitation` runs, so it does not
render in this case). The sweep's comment now lists gates 5 and 6 and says they are
forced rather than chosen. README.md no longer says "unconditionally" and states the
exception in the user's own words.

**Asserted by:** four cases in `mcp-server-spec.test.ts` reading the sentence as data;
two source-scan cases for the console channel and the once-per-process gate.

### WR-05: a spawn failure could not be told from a removal failure

**Commit:** `aa14da4`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/mcp-server-spec.ts`,
`packages/backend/src/mcp-server-spec.test.ts`,
`packages/backend/src/index.source.test.ts`

`spawnAndWait`'s result gains `spawned: boolean` (true on close, false on the catch
and `error` paths; additive, no existing caller changed). `McpRemoveOutcome` gains
`"unusable"` and `classifyMcpRemoveExit` takes a **required** `spawnFailed` — required
so a new call site cannot silently reintroduce the defect, which is exactly how the
missing `comspec` shipped. All three removal sites drop `"unusable"`: nothing recorded
(a removal that did not run is evidence neither way) and nothing claimed, via a
separate renderer `formatMcpRemoveUnusable` with no SECURITY marker and no remediation
command. A distinct function rather than a flag, because the two sentences make
opposite claims.

**Residual recorded in the docblock, not fixed:** a removal that *did* run and exited
non-zero for a non-removal reason (a `gemini` too old for `--scope` on `mcp remove`)
is still `"failed"`. Separating those needs the CLI's stderr, which this path refuses
on purpose (T-07-05) — a CLI echoing its config back on an error would put a live token
on the provider card and into the support bundle.

**Asserted by:** the two-directional property preserved and made explicit (genuine
non-zero still `"failed"`; `spawnFailed: true` is `"unusable"` for every code including
0), three `formatMcpRemoveUnusable` cases, and source-scan cases for the three
classification sites, the three `"unusable"` early exits, and the one `spawned: true`
against two `spawned: false`.

### WR-06: an empty `CAIDO_TOKEN` would register Codex unauthenticated

**Commit:** `51b5e1b`
**Files:** `packages/backend/src/mcp-server-spec.ts`, `packages/backend/src/mcp-server-spec.test.ts`

`planMcpCliRegistration` now refuses, before the register arm, when
`registrationEnv[CAIDO_TOKEN]` is empty or whitespace. Deliberately CLI-independent
and read off `registrationEnv` — the dict actually written into the CLI's config
file — rather than off a token argument. Gemini's payload carries the reference
literal, so it is a no-op there and the symmetry is free. It lives in the pure layer
for the module's founding reason: the only thing making the case unreachable today is
an invariant in `index.ts`, which no test this project can run is able to import.

**Asserted by:** Codex refused through the real builders for `""` and `"   "`; the
same guard driven directly for Gemini with an empty payload value (its builder cannot
produce that input); and the falsifiability partner that both CLIs still register with
a token present.

### WR-08: nothing asserted the win32 suite ran on the Windows leg

**Commit:** `7e79b3f`
**Files:** `.github/workflows/ci.yml`, `packages/backend/src/spawn-plan.win32.gate.test.ts`

The Windows leg re-runs `spawn-plan.win32.test.ts` under the JSON reporter and fails
unless the report shows tests ran. Three conditions, each closing a different
false-green: `pending > 0` (still gated out), `total === 0` (no longer collected),
`passed !== total` (a real failure the step would otherwise not read). The report goes
to `$RUNNER_TEMP`, not the checkout, because `pnpm build` runs after it. The step name
avoids the `CAIDO_(TOKEN)|secret(s)\.` pattern the repo's own CI gate scans for.

**Verified by hand** with the exact `node -e` form the workflow uses, against four
report shapes: this machine's real 5-skipped report FAILS (the false-green case), a
windows-shaped 5-passed report passes, a 0-collected report fails, a 4-of-5 report
fails.

**Asserted by:** `spawn-plan.win32.gate.test.ts`, which runs on every platform and
guards the guard — the step exists, uses the JSON reporter, carries all three
conditions, names a suite path that exists on disk, and (falsifiability partner) the
suite is still `skipIf`-gated, so removing the gating forces the CI gate's
justification to be re-read. It asserts presence, not behaviour, and says so.

## Skipped Issues

None.

## Notes on evidence quality

Three fixes are wired inside `index.ts`, which cannot be imported under vitest.
Those are asserted by a new comment-stripped source scan
(`packages/backend/src/index.source.test.ts`) that counts call sites and requires
specific arguments at each. That file states in its own header what it does and does
not prove: an argument is present, not what it evaluates to. The value-level proofs
live in the pure modules' suites.

---

_Fixed: 2026-08-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
