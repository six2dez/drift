---
phase: 08-process-lifecycle
verified: 2026-08-24T22:15:00Z
status: human_needed
score: 2/8 must-haves verified
behavior_unverified: 3
insufficient_spec: 3
overrides_applied: 0
deferred:
  - truth: "SC-1 / SC-3 (Windows half) — the win32 kill-tree suite executes on a real windows-latest host and the taskkill dead-pid exit code is recorded"
    addressed_in: "Phase 9"
    evidence: "Phase 9 SC-4: 'The full ubuntu/macos/windows matrix is green and the Windows job is required for merge.' The `Gate: the win32 kill-tree suite actually ran` step lives in that job, so one green matrix run executes kill-tree.win32.test.ts (3 cases) and fills the reserved dead-pid measurement block."
behavior_unverified_items:
  - truth: "SC-1 — killTree terminates the whole process tree on Windows via <SystemRoot>\\System32\\taskkill.exe"
    test: "Push the branch so the `windows` CI job runs. Confirm the `Gate: the win32 kill-tree suite actually ran` step reports a non-zero executed count, and that `the plan's argv brings down a real process tree` passes."
    expected: "3/3 executed, 0 pending, 0 failed; the [measurement] line records taskkill's exit code and first stderr line for an already-dead pid."
    why_human: "kill-tree.win32.test.ts is skipIf-gated to win32 and is 3/3 pending on every host that has ever run it. Nothing is pushed (294 commits ahead of origin/main), so no runner has fired the gate. Every specified property of the argv is proven by executed unit tests on this host; the terminal verb 'terminates' is the only clause with no execution behind it."
  - truth: "SC-2 — on POSIX the CLI's token-bearing MCP child is killed with the parent, via `detached: true` plus a spawned `kill` group signal"
    test: "Run 08-SPIKE.md's four-step procedure against a real Caido install (probe at commit 68199fa). Record `spikeDetachedGroupKill`, and the pgid of `node …mcp-server.mjs` against the pid of the `claude` process during a live turn."
    expected: "`grandchild-died (detached honoured)` for A1; equal pgid/pid for A6."
    why_human: |
      CORRECTED 2026-08-27. The mechanism IS behaviourally proven — kill-tree.posix.test.ts
      executes and passes on this host with a genuine falsifying control (grandchild survives
      without `detached`, dies with it). But that runs under NODE, and the shipping runtime is
      Caido's LLRT, which no CI leg executes. A1 now reads CLOSED FAVOURABLY — measured
      2026-08-27 (`spikeDetachedGroupKill: "grandchild-died (detached honoured)"`, darwin
      25.6.0, probe build 68199fa), so the nine-site regression this field feared is retired.
      THE VERDICT DOES NOT SOFTEN, and the reason is not A1: kill-tree.posix.test.ts still
      executes NO line of index.ts and still runs under Node, so the wiring at the nine sites
      remains unproven on the shipping runtime. A1's closure NARROWS that gap; it does not
      remove it. And A6 was measured FALSE on 2026-08-27 (codex pid 43921 in pgid 43752, its
      mcp-server.mjs child pid 44284 in pgid 44284), so for at least one provider the group
      signal cannot reach the token-bearing child at all — the argv-marker reap shipped by
      plans 08-06/08-07 is what answers that, not the group operand. human_needed stands.
      > SUPERSEDED 2026-08-24: "The mechanism IS behaviourally proven — kill-tree.posix.test.ts
      > executes and passes on this host with a genuine falsifying control (grandchild survives
      > without `detached`, dies with it). But that runs under Node. The shipping runtime is
      > Caido's LLRT, which no CI leg executes, and A1 reads OPEN — not measured in 08-SPIKE.md.
      > Nine kill sites depend on it: if the shipped fork does not honour the option, the group
      > operand names a group that was never created and all five CI legs stay green through it."
  - truth: "SC-3 — cancelling or timing out a turn leaves zero lingering node.exe/provider processes on either platform"
    test: "(a) Windows: as above. (b) POSIX timeout path: let a turn hit the absolute timeout on a real Caido and run `pgrep -f mcp-server.mjs | wc -l` before and after. (c) POSIX cancel: re-run the T-08-14 check capturing both numeric counts, and take the pre-fix control from commit 68199fa on the same machine."
    expected: "Non-zero before, zero after, on both the cancel and the timeout path, on both platforms; and a non-zero after-count from the pre-fix build, which is what excludes the CLI's own cleanup as the explanation."
    why_human: "The Windows half has zero execution. The POSIX half rests on a maintainer attestation (`approved`, 2026-08-24) with no numeric values captured, no Caido version recorded, the timeout path explicitly not exercised, and one unexcluded confounder — the provider CLI may terminate its own MCP child on shutdown, which produces the same zero. The pre-fix control that would exclude it was waived at Wave 0, so there is no before/after pair on that machine."
  - truth: "08-01 truth 1 (A1) — a real Caido install reports whether a `detached: true` spawn produces a process group whose kill reaches a grandchild"
    test: "08-SPIKE.md § How to run this spike later, steps 1-2."
    expected: "`spikeDetachedGroupKill` reads exactly one of the four documented values."
    why_human: "insufficient_spec — abstained rather than passed. Recorded UNMET with `status: unknown` / `human_judgment: true`. The hardware checkpoint was waived on 2026-08-24 with no readings supplied. No CI leg can close it; every leg runs Node."
  - truth: "08-01 truth 2 (A6) — a real provider CLI's mcp-server.mjs child sits in a process group the group-kill reaches"
    test: |
      08-SPIKE.md § How to run this spike later, step 3 — during a live turn:
      `ps -eo pid,ppid,pgid,args | grep -E 'mcp-server\.mjs|--mcp-config' | grep -v grep`
      CORRECTED IN PLACE 2026-08-27 (UAT gap G-03). This document is a LIVING REFERENCE — a
      re-run consults this human-test list — and a document that will be FOLLOWED must be
      correct, so the command is fixed here rather than annotated. The superseded spelling used
      the `comm` output specifier, which prints the executable NAME: the MCP server runs as
      `node <tmp>/mcp-server.mjs`, so its `comm` is `node` and the `mcp-server` alternation
      could never match. Run against a real install it returned nine `claude` rows and no MCP
      row at all — not a result, an unrunnable command. The `--mcp-config` anchor is what
      distinguishes Drift's spawned CLI from the user's own concurrent sessions. Canonical
      procedure: 08-SPIKE.md § Step 3.
    expected: "The `node …mcp-server.mjs` pgid equals the `claude` pid."
    why_human: "insufficient_spec — abstained rather than passed. Recorded UNMET. If any provider CLI calls setsid() on its own MCP child, a process-group signal misses it and LIF-02 is not closed by process groups alone."
  - truth: "08-01 truth 3 — the pre-fix control is recorded: with the shipped-at-the-time code, `pgrep -f mcp-server.mjs` returns non-zero after Stop"
    test: "08-SPIKE.md § How to run this spike later, step 4, built from commit 68199fa."
    expected: "A non-zero after-Stop count — the LIF-02 defect reproduced on real hardware."
    why_human: "insufficient_spec — abstained rather than passed. Recorded UNMET. This is the single measurement that would convert the T-08-14 attestation from an isolated zero into a before/after pair, and it is the only thing that excludes the CLI-cleanup confounder."
coincidental_reliance_items:
  - truth: "SC-4 — session finalize / stopMcpServer kills all tracked pids before sweeping the temp dir, so token-bearing processes die before their env-source files are removed"
    reason: undeclared-precondition
    harden: "The statement ORDER is enforced by code and independently verified at all three sites. The 'so … die before' clause is not: `killTree` is fire-and-forget by design (`grep -c 'await killTree'` = 0, a deliberate gate protecting cancelCliMessage's synchronous Result<void>) and the removals are unawaited `void rm(...)`. Nothing enforces that the killer wins that race. Declare it as an accepted residual alongside AR-01/02/03, or make the sweep await the killer's close where the call site is already async (cleanupMcpRuntime)."
human_verification:
  - test: "Run 08-SPIKE.md's four-step procedure on a real Caido install (probe at 68199fa; `git checkout 68199fa -- packages/backend/src/index.ts && pnpm build`, restore afterwards)"
    expected: "A1 closed favourably (`grandchild-died (detached honoured)`), A6 closed favourably (pgid == claude pid), and a non-zero pre-fix after-Stop count"
    why_human: "Closes ledger entry 11, retires the T-08-14 confounder, and is the ONLY thing that can. No CI leg executes LLRT, and NO LATER PHASE IN THE ROADMAP OWNS THIS — Phase 9 is CI (Node only) and Phase 10 SC-5/SC-6 are Windows/Gemini checks. It has no owner after Phase 8 closes."
  - test: "Push the branch so the `windows` CI job fires"
    expected: "`Gate: the win32 kill-tree suite actually ran` reports 3 executed / 0 pending / 0 failed; follow-up commit fills the reserved dead-pid block with the code, stderr line and run URL"
    why_human: "Closes ledger entry 12 and both ⚠️ rows in 08-VALIDATION.md. Deferrable to Phase 9 SC-4, but nothing about the Windows half of LIF-01 has executed anywhere yet."
  - test: "Exercise the POSIX absolute-timeout path on a real Caido, capturing pgrep counts before and after"
    expected: "Non-zero during the turn, zero after the timeout fires"
    why_human: "The T-08-14 attestation covers the cancel path only and is recorded as explicitly not carrying to timeout. SC-3 and both requirements name timeout as well as cancel."
---

# Phase 8: Process Lifecycle Verification Report

**Phase Goal:** Make cancel/timeout actually stop work on **both** platforms so no orphaned token-bearing process survives a turn.
**Verified:** 2026-08-24T22:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Verdict up front

**The code is built, wired and of high quality. The evidence that it achieves the goal on the two runtimes that matter is incomplete, and the phase's own artifacts say so in the same words I would have used.**

There are **no blockers**. Nothing is stubbed, nothing is orphaned, nothing is falsified. What is missing is *execution* — on Caido's LLRT (POSIX) and on any Windows host at all. Both gaps are recorded, both have a named procedure, and one of the two has no owner after this phase closes.

I applied maintainer decision D-02 and made the SC-3 call rather than deferring it: **SC-3 is not met as written.** It claims zero lingering processes *on either platform*; the Windows half has zero execution behind it and the POSIX half rests on an attestation with an unexcluded confounder.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `killTree` terminates the whole process tree on Windows via `<SystemRoot>\System32\taskkill.exe`, both env casings, separators stripped, `/pid /t /f`, `windowsVerbatimArguments: false`, bare name last resort, pid guarded in `buildKillTreePlan` | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Every specified property is proven by executed tests.** `kill-plan.test.ts` runs 25 assertions green on this host: all five refusal shapes (`undefined`/NaN/`0`/`-1`/`1.5`), the rooted path, trailing-separator stripping, bare-drive reduction, `SYSTEMROOT`-only casing, the bare-name fallback, whitespace-only root, and rung-invariance. `kill-plan.ts` is imported at `index.ts:97` and called at `:5273`. **Unverified: the verb.** `kill-tree.win32.test.ts` is 3/3 pending on every host that has run it; 294 commits unpushed, no `windows-latest` run exists. |
| SC-2 | On POSIX the MCP child is killed with the parent via `detached: true` at the provider spawn plus a spawned `kill` group signal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Strongest evidence in the phase, and still short of the runtime.** `kill-tree.posix.test.ts` EXECUTES and passes here with a real falsifying control: `CONTROL: without detached, a single-pid kill leaves the grandchild alive` (1034ms), then the grandchild dying with `detached` + the production argv. It imports the production `buildKillTreePlan`/`shouldDetachProviderSpawn` and re-derives no argv. `detached: shouldDetachProviderSpawn(host?.platform)` at `index.ts:4428`. **Unverified: the vehicle.** That proof runs under Node, and `kill-tree.posix.test.ts` executes no line of `index.ts`. **A1 CORRECTED 2026-08-27: CLOSED FAVOURABLY — measured** (`grandchild-died (detached honoured)`, darwin 25.6.0). That narrows the gap without removing it — the wiring at the nine sites is still unproven on LLRT. **And A6 is measured FALSE** (codex pid 43921 in pgid 43752; `mcp-server.mjs` child pid 44284 in pgid 44284), so the group signal alone does not close LIF-02 for that provider. See the marked correction below this table. |
| SC-3 | Cancelling or timing out a turn leaves zero lingering `node.exe`/provider processes **on either platform** | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Windows half: no evidence of any kind.** **POSIX half: a maintainer attestation** — real evidence, weaker than a measurement. `approved` on 2026-08-24 with no counts captured, no Caido version, timeout path explicitly not exercised, and the CLI's own cleanup unexcluded as an alternative explanation because the pre-fix control was waived. |
| SC-4 | Session finalize / `stopMcpServer` kills all tracked pids before sweeping the temp dir | ✓ VERIFIED (coincidental-reliance) | **Independently re-measured, not taken from the gate.** `awk`+`grep` over comment-stripped bodies: `cleanupMcpRuntime` killTree@10 < rm@30; `closeCliSession` killTree@8 < rm@14,15; `deleteChat` killTree@9 < rm@15,16. `stopMcpServer` delegates to `cleanupMcpRuntime`, whose `LIF-01 SEAM` marker is gone (0 occurrences repo-wide) and is replaced by a real `activeProcesses` kill loop. Census re-measured: `killTree(` = 9 = 1 declaration + 8 in-scope call sites. See `coincidental_reliance_items` for the completion-ordering caveat. |
| SC-5 | macOS/Linux cancellation and timeout semantics visible to the user are unchanged and existing tests stay green | ✓ VERIFIED | **602 tests, 593 passed, 9 skipped, 38 files / 2 skipped** — re-run by me, matching the reported state. Baseline 534 at phase start, zero tests removed. `pnpm -r typecheck` = 0, `pnpm lint` = 0. **Zero `packages/frontend` and zero `packages/shared` files touched in the entire phase** (`git log --name-only 1c7a22f..HEAD`), so the `[Cancelled]` rendering is unchanged by construction; `cancelCliMessage` keeps its synchronous `Result<void>`. The two-rung graceful→forceful ladder is preserved on POSIX. |
| A1 | A real Caido install reports whether a `detached: true` spawn produces a killable process group | ✓ **CLOSED FAVOURABLY — measured 2026-08-27** | **Corrected 2026-08-27.** No longer abstained: the probe was rebuilt from `68199fa` and run on a real macOS Caido (darwin 25.6.0) during UAT. `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` (`08-UAT.md` test 1). *(Superseded 2026-08-24 cell: "⚠️ insufficient_spec (abstained) — 08-01 plan truth, recorded UNMET, `status: unknown`, `human_judgment: true`. Checkpoint waived 2026-08-24 without readings.")* |
| A6 | A real provider CLI's `mcp-server.mjs` pgid matches the tracked CLI pid | ❌ **FALSIFIED — measured 2026-08-27** | **Corrected 2026-08-27.** No longer abstained: measured on a real macOS install (`08-UAT.md` test 2). Provider CLI codex pid **43921** in pgid 43752; its `mcp-server.mjs` child pid **44284** in pgid **44284**. The pgid does **not** match the tracked CLI pid, so this truth is **FALSIFIED** for that provider. One provider, on an instance Drift did not spawn; Claude Code unmeasured. *(Superseded 2026-08-24 cell: "⚠️ insufficient_spec (abstained) — 08-01 plan truth, recorded UNMET. Rated \"medium-high, and untested\" before the phase; unchanged by it.")* |
| — | The pre-fix control is recorded (non-zero `pgrep` after Stop on the old code) | ⚠️ insufficient_spec (abstained) | 08-01 plan truth, recorded UNMET. Its absence is what leaves the T-08-14 confounder unexcluded. |

> **MARKED CORRECTION, 2026-08-27 — the SC-2 row's A1 clause.** The cell above previously read:
>
> **Unverified: the vehicle.** That proof runs under Node. A1 (does the shipped LLRT honour
> `detached`?) reads **OPEN — not measured**; nine sites depend on it.
>
> Superseded by the UAT readings of 2026-08-27 (`08-UAT.md` tests 1 and 2, `08-SPIKE.md`).
> Preserved rather than overwritten, per the `07-VALIDATION.md` convention.

**The verdict is UNCHANGED and this is deliberate.** A1's closure and A6's falsification move
the *evidence*, not the *status*. `status: human_needed` stands, the score stands, and all three
`behavior_unverified_items` stand — because the thing they are about is that the behavioural
proof runs under Node against a module (`index.ts`) that vitest cannot import, and neither
reading changes that. The A6 falsification, if anything, adds a reason for the human item rather
than removing one: the mechanism SC-2 names does not reach the child on the one provider anyone
has measured, and the mechanism that does (the argv-marker reap from plans 08-06/08-07) is
itself covered by no executed assertion — broken-windows ledger entries 13 and 15.

**Score:** 2/8 truths verified (3 present-but-behaviour-unverified, 3 abstained as insufficient_spec)
— **as ruled on 2026-08-24, and NOT recomputed on 2026-08-27.** The two abstentions that became
readings did so *after* this report was written, and one of the two came back **FALSIFIED**;
re-scoring a verification report from later evidence would make it a different report. The
readings are recorded in the rows above and the frontmatter verdict is unchanged.

A low score here is a statement about **evidence**, not about workmanship. Read it next to the Anti-Patterns and Prohibitions sections, which are clean.

### Are the amendments honest?

Both were checked against their commit diffs. **Both are honest, and one is unusually so.**

- **SC-1 (`fb0200a`)** — the original read `spawn("taskkill", ["/pid", pid, "/T", "/F"]) (guarded against undefined pid)`. The amended text is **strictly harder to satisfy**: absolute path, both env casings, hand-stripped separators, `windowsVerbatimArguments: false`, bare name demoted to last resort, and the guard widened from `undefined` alone to `0`/negative/non-integer. This is a criterion **tightened** because a code review found the original was satisfied by the insecure form (T-08-03, spoofing via `%PATH%` search order). That is the opposite of retrofitting.
- **SC-2 (`1f3b486`)** — the original said `detached: true` + process-group signalling, abstractly. The amendment names the concrete spelling and records a real discovery: LLRT types `process.kill`'s pid as a Rust `u32`, so the canonical negative-pid form throws `Underflow` there while passing on every Node CI leg. The **guarantee is unchanged**; only the mechanism is now specified, and the reason is a falsifiable technical claim with a pinned commit. Legitimate, and matched by the shipped code and a comment-stripped static gate.
- **One residual wording nit, non-blocking:** SC-2 still says "**instead of** today's single-pid SIGTERM→SIGKILL ladder", but the shipped `killTree` keeps that single-pid rung on POSIX *in addition to* the group spawn — deliberately, as recorded decision OQ-2, the only remaining protection if A1 turns out unfavourable. The code does strictly **more** than the criterion, so this is a stale clause, not a relaxation. Worth a one-line correction at phase close.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/kill-plan.ts` | Pure termination-plan builder | ✓ VERIFIED | 295 lines. Exactly **1** import (`./platform`) — the module's own self-enforcing claim, re-measured. No Zod, no `import.meta`, no `require(`. Imported and called from `index.ts`. |
| `packages/backend/src/kill-plan.test.ts` | Unit contract for every arm | ✓ VERIFIED | 25 assertions, all executing, all green. |
| `packages/backend/src/kill-tree.posix.test.ts` | Behavioural proof + falsifying control | ✓ VERIFIED | 2 cases, both executing (1034ms each), control-first, symmetric settle budgets, production builder imported. |
| `packages/backend/src/kill-tree.win32.test.ts` | win32-gated integration suite | ⚠️ PRESENT, NEVER EXECUTED | 413 lines, collected 3/3 **pending** everywhere. `expect(code).toBe(<literal>)` count = **0** — the record-never-assert prohibition holds. Reserved measurement block is visibly empty, not a fabricated value. |
| `packages/backend/src/kill-tree.win32.gate.test.ts` | Every-platform gate guard | ✓ VERIFIED | 6 cases green, including `cannot be satisfied by the Phase 7 gate step, nor it by this one`. |
| `.github/workflows/ci.yml` | The kill-tree gate step | ⚠️ SHIPPED, NEVER FIRED | YAML parses (`yaml.safe_load` OK, jobs `verify`/`windows`). Step present at :269 with the three-arm check and a report filename distinct from Phase 7's. No runner has executed it. |
| `packages/backend/src/index.source.test.ts` | Ordering gates + census | ✓ VERIFIED | 44 cases green, including the three SC-4 ordering assertions, the CR-01 win32 guard assertions, the CR-02 identity assertions and the termination census. |
| `08-SPIKE.md` | The three A1/A6/control measurements | ⚠️ SUBSTANTIVE, RECORDS ABSENCE | Not a stub — it preserves the runnable four-step procedure, the probe commit `68199fa`, the falsified expectation and the consequence. It reports OPEN rather than fabricating a reading, which is the correct behaviour and the reason I abstained rather than failed those three truths. |
| `08-SECURITY.md` | Threat register + accepted residuals | ✓ VERIFIED | 21 threats, `threats_open: 0`, three residuals AR-01/02/03 each with an owner. T-08-01's closure is labelled **closed by attestation** in the frontmatter comment, the register row and a dedicated section that names all three consequences including the unexcluded confounder. Exemplary. |
| `08-VALIDATION.md` | Per-task map, zero `{pending}` | ✓ VERIFIED | `grep -c '{pending}'` = **0**. `nyquist_compliant: false` correctly set, with the two ⚠️ rows named as the reason. |
| `CLAUDE.md` + `.planning/codebase/CONVENTIONS.md` | Sixth pure-helper row | ✓ VERIFIED | `kill-plan.ts` row present in both (CLAUDE.md:133, CONVENTIONS.md:145). |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `index.ts` `killTree` | `kill-plan.ts` `buildKillTreePlan` | `buildKillTreePlan({ pid, platform: host?.platform, env: readParentEnv(), rung })` at `:5273` | ✓ WIRED |
| `index.ts` provider spawn | `shouldDetachProviderSpawn` | `detached: shouldDetachProviderSpawn(host?.platform)` at `:4428` | ✓ WIRED |
| Both deferred rungs | `hasTrackedProcessExited` | `:4765` and `:5363`, identity checked before liveness (CR-02 fix) | ✓ WIRED |
| `stopMcpServer` | `cleanupMcpRuntime` kill loop | `:3761` → `activeProcesses.entries()` loop → `rm(mcpTempDir)` | ✓ WIRED |
| `kill-tree.posix.test.ts` | production builder | imports `buildKillTreePlan`, `shouldDetachProviderSpawn`; no local argv | ✓ WIRED |
| `ci.yml` gate step | `$RUNNER_TEMP/win32-kill-tree-report.json` | three-arm node check on `pending`/`total`/`passed` | ⚠️ WIRED BUT NEVER FIRED |

### Behavioural Spot-Checks

| Behaviour | Command | Result | Status |
|-----------|---------|--------|--------|
| Full suite | `npx vitest run` | 602 tests / 593 passed / 9 skipped; 38 files / 2 skipped | ✓ PASS |
| POSIX group kill takes the grandchild | `npx vitest run kill-tree.posix.test.ts` | 2 passed, control + proof | ✓ PASS |
| Argv contract, both arms | `npx vitest run kill-plan.test.ts` | 25 passed | ✓ PASS |
| Source gates and ordering | `npx vitest run index.source.test.ts` | 44 passed | ✓ PASS |
| win32 tree kill | `npx vitest run kill-tree.win32.test.ts` | 3 **pending**, 0 executed | ? SKIP → human |
| Typecheck / lint | `pnpm -r typecheck`; `pnpm lint` | exit 0 / exit 0 | ✓ PASS |
| Kill-before-sweep ordering | `awk`/`grep` per function, comment-stripped | killTree precedes every `rm` at all 3 sites | ✓ PASS |
| Kill-site census | node comment-stripped count | `killTree(`=9, `function killTree(`=1, negative-pid form=**0** | ✓ PASS |
| CI YAML validity | `python3 -c "yaml.safe_load(...)"` | parsed OK | ✓ PASS |
| Windows leg ever run | `git rev-list --count origin/main..HEAD` | **294** — nothing pushed | ✗ NEVER RUN |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist in this repository; this phase declares none. The nearest equivalents — the vitest suites and the two CI gate steps — were run directly above. The Wave-0 diagnostics probe is not in HEAD by design (it spawns fixture processes on every `getDiagnostics` call); it is reachable at `68199fa`.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| LIF-01 | On Windows, cancel/timeout terminates the whole process tree, leaving no orphaned token-bearing process | ? NEEDS HUMAN | Mechanism built and unit-proven; **never executed on Windows**. Additionally bounded by accepted residual **AR-01**: `taskkill /T` cannot reach a grandchild whose intermediate parent has already exited, which is exactly the three-level `cmd.exe → provider → node` shape Phase 7 introduced. Closing that needs a Job Object and is owned elsewhere. |
| LIF-02 | On POSIX, cancel/timeout also terminates the CLI's MCP child via process-group signalling | ? NEEDS HUMAN | Mechanism built, behaviourally proven under Node with a falsifying control, and attested once on real hardware with an unexcluded confounder. A1 and A6 OPEN. |

**Observation (warning-level, not a blocker):** both are ticked `[x]` in `.planning/REQUIREMENTS.md`. Read alone, those checkboxes overstate what the phase's own artifacts record. The artifacts are honest; the checkbox is the one place that isn't. Consider annotating both rows the way Phase 7's deferrals were.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD`/`FIXME`/`XXX` in any file this phase touched | — | **None found.** The debt-marker gate is clean. |
| — | — | `TODO`/`HACK`/`PLACEHOLDER` | ℹ️ Info | One hit, `index.ts:2744`, inside a comment naming the pre-existing `MISSING_COMMAND_PLACEHOLDER` sentinel. Not debt. |
| — | — | `shell: true`, `taskkill /im`, `pkill`, `killall` | — | **Zero occurrences.** Prohibitions hold. |
| — | — | Negative-pid signalling form in code | — | **Zero occurrences** comment-stripped, with a gate that is proven falsifiable in three directions. |
| — | — | Literal assertion on `taskkill`'s exit code | — | **Zero occurrences.** Record-never-assert prohibition holds; reserved slot honestly empty. |

### Human Verification Required

**1. Run the Wave-0 spike — the one item with no owner after this phase**

- **Test:** `git checkout 68199fa -- packages/backend/src/index.ts && pnpm build`, install into Caido, then 08-SPIKE.md steps 1-4. Restore HEAD afterwards.
- **Expected:** `spikeDetachedGroupKill` = `grandchild-died (detached honoured)`; `mcp-server.mjs` pgid == `claude` pid; a non-zero pre-fix after-Stop `pgrep` count.
- **Why human:** No CI leg executes LLRT and none ever will. I checked Phases 9-13: **none of them names A1, A6, or a macOS LLRT check.** Phase 9 is CI (Node only); Phase 10 SC-5/SC-6 are Windows and Gemini confirmations. If Phase 8 closes without this, ledger entry 11 becomes ownerless and nine POSIX kill sites ship on source analysis alone. This is the single highest-value 30 minutes available to this milestone.

**2. Push, so the `windows` leg runs**

- **Test:** push the branch; read the `Gate: the win32 kill-tree suite actually ran` step.
- **Expected:** 3 executed / 0 pending / 0 failed, then a follow-up commit filling the reserved dead-pid block with the exit code, first stderr line and run URL.
- **Why human:** requires a push; nothing else about the Windows half of LIF-01 has executed anywhere. Deferrable to Phase 9 SC-4, which owns it explicitly.

**3. Exercise the POSIX timeout path**

- **Test:** let a turn hit the absolute timeout on a real Caido; `pgrep -f mcp-server.mjs | wc -l` before and after.
- **Expected:** non-zero before, zero after.
- **Why human:** the T-08-14 attestation is recorded as covering the cancel path only and explicitly not carrying to timeout, yet SC-3 and both requirements name timeout as well.

### Gaps Summary

No gaps in the blocking sense — nothing is missing, stubbed or unwired, and I found no defect the review pass had not already caught and fixed (CR-01's win32 pre-termination and CR-02's liveness-vs-identity confusion are both closed in the shipped code, verified by hand at `index.ts:5266` and `kill-plan.ts:hasTrackedProcessExited`).

What is missing is execution, in exactly the two places the phase's own artifacts name:

1. **The runtime that ships (POSIX).** The mechanism is proven under Node with a real falsifying control — genuinely good evidence, and better than most phases produce. It is evidence about Node. A1 turns it into evidence about Caido, and A1 was waived. The asymmetry matters more than the volume of green here: all five CI legs run Node, Node honours `detached`, so a shipped LLRT that does not would leave every leg green while LIF-02 goes unfixed on every real install. That is Phase 5 finding L-4 recurring, and the phase says so itself, repeatedly, without softening.

2. **The platform this milestone is about (Windows).** SC-1 and the Windows half of SC-3 rest on the compiler, on unit tests of a pure function, and on source-text assertions over a file vitest cannot import. That is the strongest substitute available and it was built carefully — the bidirectional gate-collision proof is a genuinely good piece of work. It is not execution.

Three things I want on the record as *credits*, because they are why this reads `human_needed` rather than `gaps_found`:

- The phase **refused to fabricate** the A1/A6 readings when the checkpoint was waived, and wrote the absence up as the finding. That decision is the reason this verification could be honest at all.
- `08-SECURITY.md` labels its own `threats_open: 0` as attestation-based **in the frontmatter comment**, so a reader who only skims the YAML still gets the caveat.
- The SC-1 amendment **tightened** a criterion after a review found the original was satisfied by an insecure implementation. Amendments in this project are being used to close drift, not to launder it.

---

_Verified: 2026-08-24T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
