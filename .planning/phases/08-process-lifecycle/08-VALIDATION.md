---
phase: 8
slug: process-lifecycle
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-24
filled: 2026-08-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `08-RESEARCH.md` § *Validation Architecture* by `/gsd-plan-phase 8`.
> **Filled 2026-08-24 by plan 08-05 task T-08-13**, once every task id existed. Where the seed
> turned out to be wrong, the correction is marked as a correction rather than silently
> overwritten — the `07-VALIDATION.md` convention. See § *Corrections to the seed*.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root) — `resolve.alias` contains **only** `vue` and `pinia`; **no `caido:plugin` alias**, deferred to Phase 9 |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Typecheck** | `pnpm -r typecheck` |
| **Lint** | `pnpm lint` (`eslint . --max-warnings 0`) |
| **Measured runtime** | Baseline measured 2026-08-24 at phase start: 36 test files, **534 tests — 528 passed, 6 skipped** (the 6 are `spawn-plan.win32.test.ts`, correctly skipped off win32); vitest-reported duration **971 ms**, wall clock ~1.8 s. **At phase close: 578 tests — 569 passed, 9 skipped** (the 9 are two deliberate platform gates: 6 `spawn-plan.win32.test.ts` + 3 `kill-tree.win32.test.ts`). **After the 2026-08-27 gap-closure set (plans 08-06…08-09): 686 tests — 677 passed, 9 skipped.** The skipped 9 are the same two platform gates, unchanged. The `Verify (Windows)` job is ~90 s end to end with `timeout-minutes: 6` (`ci.yml`). |

**There is no `test` package script.** `package.json` defines `typecheck`, `lint`, `lint:fix`,
`format`, `build`, `watch` only — the same correction `07-VALIDATION.md` had to make. Both CI legs
invoke `pnpm exec vitest run`; use that spelling.

**Platform note — the constraint that governs this phase.** `packages/backend/src/index.ts`
(**5,562 lines at phase close**; 5,240 when this document was seeded) is **not importable under
vitest**. Every behaviour that must be tested belongs in a pure module; everything left in
`index.ts` is verified by comment-stripped source counts (`index.source.test.ts`'s balanced-paren
`callArgumentTexts` scanner is the established vehicle, joined this phase by the statement-position
`functionBody` scanner) and by the compiler — strictly weaker than an executed assertion, and
labelled as such in every row below that relies on it.

**Baseline for CMP-01.** 534 tests at phase start. At every close the count must have **grown, with
zero tests removed as obsolete**, verified mechanically — the check `05-REPORT.md` used for the
263 → 290 transition. **Measured at the original phase close: 578, zero removed.** Per-plan
progression: 534 → 561 (08-02) → 569 (08-03) → 578 (08-04).

**Extended 2026-08-27 for the gap-closure set.** The rule is unchanged and still the point: the
count GROWS and nothing is removed. Progression, each figure taken from the plan's own SUMMARY:
578 (08-04) → **602** (the 08-REVIEW `--fix` pass, +24) → **642** (08-06, 633 passed / 9 skipped)
→ **654** (08-07, 645 / 9) → **683** (08-08, 674 / 9) → **686** (08-09, 677 / 9). **Zero tests
removed at any step, and zero gates weakened.** 686 is the floor for anything that follows;
plan 08-10 changes no source and must therefore hold it exactly.

**Extended again 2026-08-27 — the `08-REVIEW-GAPS.md` fix pass (CR-01, WR-01…WR-06).** The
progression continues **686 (08-09/08-10) → 695 (695 total: 686 passed / 9 skipped)**, `+9`. The
nine skipped are the same two deliberate platform gates as before, unchanged. **Zero tests removed
and zero gates weakened; three gates were made ABLE TO FAIL that previously could not** —
`verdict-gate.sh` ARM C (asserted against `git diff HEAD`, empty by construction at every commit
boundary), ARM A (`find | xargs` without `-0`, invisible to any path containing whitespace), and
`platform.test.ts`'s "REFUSES a derived value that is not drive-absolute" (whose input took the
bare-name arm, duplicating the case above it). **695 is the floor for anything that follows.**
Full detail, per finding, in `08-REVIEW-GAPS-FIX.md`.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run <the task's own suite>` + `pnpm -r typecheck` — < 5 s
- **After every plan:** `pnpm exec vitest run` + `pnpm lint` — ~2 s locally
- **Before `/gsd-verify-work`:** full suite green on **both** the ubuntu matrix (Node 20/22/24/26)
  and the `windows-latest` leg, with the run URL, per-step conclusions and the win32 execution log
  line recorded — the `07-VALIDATION.md` § *Windows evidence* format. **The `windows-latest` half of
  this has NOT happened** — see § *Compliance declaration*.
- **Max feedback latency:** < 5 s locally; ~90 s for the Windows leg

---

## Per-Task Verification Map

> Task ID and Plan columns filled 2026-08-24 by plan 08-05 T-08-13 from the tasks the planner
> actually emitted. Status is set from each plan's SUMMARY, not from the seed's expectation.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T-08-05 | 02 | 0 | LIF-01 / SC-1 | — | `buildKillTreePlan` on win32 emits `%SystemRoot%\System32\taskkill.exe` with `["/pid","<n>","/t","/f"]`, `windowsVerbatimArguments: false`; trailing separators stripped; bare-name fallback when SystemRoot is empty | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ✅ | ✅ green |
| T-08-05 | 02 | 0 | SC-1 | T-08-02 | `pid: undefined`, `NaN`, `0` and negatives all return `{ kind: "none", reason: "no-pid" }` — the guard, in the one place a test can reach it | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ✅ | ✅ green |
| T-08-05 | 02 | 0 | LIF-02 / SC-2 | — | POSIX arm emits `kill` with `["-TERM","--","-<n>"]`; `"kill"` rung emits `-KILL`; **`undefined` platform takes the POSIX arm** (CMP-01) | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ✅ | ✅ green |
| T-08-05 | 02 | 0 | SC-2 | — | `shouldDetachProviderSpawn` returns `false` on `"win32"` and `true` on `"darwin"`, `"linux"` and `undefined` | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ✅ | ✅ green |
| T-08-04 | 02 | 0 | LIF-02 / SC-3 (POSIX half) | T-08-01 | **Behavioural.** Control: no `detached` + single-pid kill → grandchild **survives**. Then: `detached` + the production plan's argv → parent **and** grandchild die | integration (skipIf win32) | `pnpm exec vitest run packages/backend/src/kill-tree.posix.test.ts` | ✅ | ✅ green (2/2, control verified falsifiable by hand) |
| T-08-10 | 04 | 0 | LIF-01 / SC-3 (Windows half) | T-08-01 | `taskkill.exe` resolves and runs on a real Windows host; **exit code and stderr for an already-dead pid are RECORDED** (measurement, not assertion) | integration (skipIf ≠ win32) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.test.ts` — **only executes on the `windows-latest` leg** | ✅ | ⚠️ **NOT EXECUTED** — collected everywhere (3 total / 3 pending), never run; no `windows-latest` run exists. Ledger entry 12 |
| T-08-11 | 04 | 0 | LIF-01 / SC-3 | — | The win32 suite **actually ran** on the Windows host — a `--reporter=json` gate with the three arms (`pending > 0`, `total === 0`, `passed !== total`) | CI gate | the `Gate: the win32 kill-tree suite actually ran` step in `ci.yml`, writing `$RUNNER_TEMP/win32-kill-tree-report.json` | ✅ | ⚠️ **SHIPPED, NEVER FIRED** — step present, YAML valid, anchors verified distinct from Phase 7's in both deletion directions; no runner has executed it |
| T-08-11 | 04 | 0 | LIF-01 / SC-3 | — | The gate itself still exists and points at a file that exists — runs on **every** platform, so a deleted gate is noticed on Linux | unit (static) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.gate.test.ts` — mirrors `spawn-plan.win32.gate.test.ts` | ✅ | ✅ green (6/6 on POSIX) |
| T-08-09 | 03 | 1+ | SC-4 | T-08-01 | In `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`, the kill statement precedes every `rm` | static gate | primary: `pnpm exec vitest run packages/backend/src/index.source.test.ts` (the `functionBody` positional gate, 3 sites); second read: the `awk`-scoped shell slice | ✅ | ✅ green (falsifiable in 3 directions, verified by hand) |
| T-08-08 | 03 | 1+ | SC-4 | T-08-01 | `cleanupMcpRuntime` kills at all — the marker changes from seam to implementation | static gate | `awk '/^async function cleanupMcpRuntime/,/^}/' … \| grep -c 'killTree'` ≥ 1; asserted in-test by `index.source.test.ts` | ✅ | ✅ green (`activeProcesses.entries()` = 1, `await killTree` = 0) |
| T-08-09 | 03 | 1+ | SC-1 / SC-2 wiring | — | All in-scope sites route through `killTree`; the out-of-scope leaf sites still call `proc.kill`/`child.kill` directly | static gate | the call-site census in `packages/backend/src/index.source.test.ts` | ✅ | ✅ green — **measured `killTree(` = 9 (1 declaration + 8 call sites), not the seed's 5; see § Corrections C3. `proc.kill(` moved 3 → 4 in the fix pass; see § Corrections C5** |
| T-08-06 | 02 | 0 | Pitfall 1 — the LLRT trap | T-08-03 | **The LLRT-incompatible negative-pid signalling spelling appears nowhere as code.** The only vehicle-independent control against the Node-green/LLRT-broken regression | static gate | primary: the comment-stripped assertion in `packages/backend/src/index.source.test.ts` over `index.ts` **and** `kill-plan.ts`; shell companion: `grep -rn 'process\.kill(-' packages/backend/src --include='*.ts' \| grep -vE ':[0-9]+:[[:space:]]*(//\|\*)' \| wc -l` = `0` | ✅ | ✅ green — **the seeded raw-grep command was wrong and would go red on correct code; see § Corrections C1. The in-test needle was WIDENED after phase close; see § Corrections C5** |
| T-08-09 | 03 | 1+ | C-4 | — | `shell: true` still appears nowhere (the shipped Phase 7 gate, re-run) | static gate | `test "$(grep -rn 'shell: *true' packages/ --include='*.ts' \| wc -l \| tr -d ' ')" = 0` | ✅ | ✅ green (measured `0`) |
| T-08-14 | 05 | last | SC-5 / CMP-01 | — | Full suite green; test count **grew** from 534 with zero removals; typecheck and lint clean | regression | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | ✅ | ✅ green — **602 tests, zero removed** (578 at phase close; +24 from the code-review fix pass — see § Corrections C5) |
| T-08-14 | 05 | last | SC-5 | — | The frontend cancel-race guard is byte-unchanged — the user-visible `[Cancelled]` semantics | tripwire | `git diff --stat 1b3fde6 -- packages/frontend/src/views/ChatView.cancel.test.ts packages/frontend/src/views/ChatView.vue` is empty | ✅ | ✅ green (empty at every plan close) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky, unexecuted or shipped-but-unfired*

---

## Corrections to the seed

Recorded as corrections rather than silently overwritten, per the `07-VALIDATION.md` convention.
Owed since plan 08-02 (C1) and plan 08-03 (C3); discharged here by T-08-13.

### C1 — the LLRT-trap gate's command was wrong as seeded

The seed specified a raw
`test "$(grep -rc 'process\.kill(-' packages/backend/src | grep -v ':0$' | wc -l | tr -d ' ')" = 0`.

**That spelling fails against correct code.** Measured at phase close, the raw form returns a
non-zero file count:

```
$ grep -rc 'process\.kill(-' packages/backend/src | grep -v ':0$'
packages/backend/src/kill-plan.ts:1
```

and the single hit is line 199 — a **whole-line comment** that quotes the banned form verbatim by
house rule, precisely so a future reader does not reintroduce it:

```
packages/backend/src/kill-plan.ts:199:  //      negative-pid signalling form — process.kill(-pid, …) — deliberately.
```

`index.ts`'s tree-kill comment does the same. A gate that goes red against its own documentation is
a gate that gets deleted.

**What shipped instead (T-08-06):** the primary control is the comment-stripped vitest assertion in
`index.source.test.ts`, over both `index.ts` and `kill-plan.ts`, reusing the existing whole-line-only
`stripCommentLines`. Its needle is spelled as an **escaped RegExp** so the gate's own source text
does not match the companion repo-wide scan. It was verified falsifiable in three directions: as
code it goes red, inside a whole-line comment it does not, and it does not fire against itself. The
shell form retained in the plans is its comment-filtered companion:
`| grep -vE ':[0-9]+:[[:space:]]*(//|\*)'`. Measured: **0**.

**A second reason not to take the seed's alternative.** The seeded row 9 used `sed -e 's://.*::'` to
strip comments. That expression strips `//` **inside string literals** as well — and `index.ts`
carries URLs and Windows-shaped paths, which it would corrupt mid-scan. `stripCommentLines`
deliberately removes whole comment lines only, which is why it is the vehicle here.

### C2 — the ordering gate's vehicle changed

Seeded as an `awk`+`sed` shell pipeline
(`awk '/^async function cleanupMcpRuntime/,/^}/' … | sed -e 's://.*::' | grep -n 'killTree\|rm('`).
Shipped (D-P1, plan 08-03) as an in-test `functionBody(source, name)` helper in
`index.source.test.ts`, for two reasons: the same string-literal corruption C1 describes, and the
fact that a vitest assertion runs on all five CI legs unprompted while a shell pipeline runs only
when somebody types it.

The shell form is **retained as an independent second read**, not as the evidence. Both agree at all
three sites.

Recorded alongside it, because it is the defect that made the change load-bearing: implemented
literally as "the first `{` after the declaration", `functionBody` stops on an **inline object-type
parameter**. Measured, `closeCliSession` returned a **19-character** body (`{ sessionId: string }`),
under which every ordering assertion is vacuously satisfiable. The shipped helper balances the
parameter list's parentheses first.

### C3 — the `killTree(` call-site count is not 5

The seed said *"a `killTree(` call-site count of 5 (or the count the reviewer measures)"*.

**Measured at phase close, over the comment-stripped source that the in-test census reads:**

| Measurement | Seeded | Measured |
|---|---|---|
| `killTree(` | 5 | **9** — 1 declaration + **8** call sites |
| `function killTree(` | — | **1** |
| `proc.kill(` | — | **3** (raw grep says 5; two are comment lines) |
| `child.kill(` | — | **1** |

The eight call sites: `deleteChat` 1, the `sendCliMessage` absolute timeout 1,
`requestGracefulShutdown` **2**, `cancelCliMessage` **2**, `closeCliSession` 1, `cleanupMcpRuntime` 1.
The seed undercounted because `requestGracefulShutdown` and `cancelCliMessage` each carry **two
rungs** (SIGTERM then a deferred SIGKILL), which the seed counted as one site each.

The three surviving direct-handle sites are leaves with no tree, and are deliberately not routed:
`callMcpMethod`'s two rungs, `resolveCommand`'s PATH-search timeout, and `killTree`'s own single-pid
rung — the last being OQ-2's explicit defence against assumption A1.

### C5 — facts this document recorded that the code-review fix pass changed

Applied 2026-08-24 by the `--fix` pass over `08-REVIEW.md` (findings CR-01, CR-02, WR-01, WR-02,
WR-04). Recorded as a correction rather than silently overwritten, per the `07-VALIDATION.md`
convention this file already follows.

**Test count — T-08-14's row.** 578 at phase close → **602**. Zero tests removed; the delta is 24
added by the fix pass (6 literal-input cases for `hasTrackedProcessExited` in `kill-plan.test.ts`,
18 source assertions in `index.source.test.ts`). Re-measured with the same command:
`pnpm exec vitest run` → 593 passed / 9 skipped / 602 total; `pnpm -r typecheck` and `pnpm lint`
exit 0.

**The LLRT-trap needle — T-08-06's row.** Was `/process\s*\.\s*kill\s*\(\s*-/`, anchored on the
RECEIVER. Review WR-02 found it blind to the indirection this same phase introduced twenty lines
above `killTree` (`killRef.call(processRef.process, pid, 0)` in `isPidAlive`), which had become the
established local idiom for reaching that primitive. Widened to
`/\.\s*kill\s*\(\s*-|kill\w*\s*\.\s*(?:call|apply)\s*\(\s*[^,()]*,\s*-/` — receiver-agnostic, plus
the reflective form — and given two new companions: a positive match test against synthetic text for
both arms (a needle only ever asserted *absent* can rot into one matching nothing), and a census of
every reference that takes the kill primitive as a **value** rather than calling it, currently
**1**. The shell companion is unchanged and still measures **0**. What the widened needle still
cannot see is written into the block itself: a negative pid bound to a variable first, a computed
member access, `Reflect.apply`, or a callee not named `kill*`.

**The single-pid census — T-08-09's row.** `proc.kill(` measured **3** at phase close, **4** now.
CR-01 guarded `killTree`'s preamble rung to non-win32 (on Windows it is an unconditional
`TerminateProcess`, so it removed the target from the process table before `taskkill /t` could walk
its `ParentProcessId` children) and added `killWin32Leaf` as the win32 last resort at the two
spawn-failure arms — without which a Windows host that cannot spawn `taskkill.exe` at all would lose
nothing. `killTree(` is **unchanged at 9**; `child.kill(` unchanged at **1**; `await killTree`
unchanged at **0**.

**New standing controls this document should now count.** Four blocks were added to
`index.source.test.ts` and one to `kill-plan.test.ts`, all of them evidence for rows already in the
table above rather than new requirements: the CR-01 win32 ordering gate (5 assertions, verified
falsifiable by deleting the platform guard), the CR-02 identity-before-liveness gate (5, verified
falsifiable by swapping the two guard statements), the WR-01 cleanup-loop reporting gate (3), the
WR-03 `isPidAlive(` census and body assertions (2), and `hasTrackedProcessExited`'s six literal-input
cases (verified falsifiable by simplifying its body back to `exitCode !== null`, 2 red).

**Still uncorrected, deliberately.** `IN-02` — this document's SC-4 row says the kill statement
precedes *every* `rm`, while the shipped gate compares against the **first** `rm`. It is true today
at all three sites, it was rated Info, and the fix pass was scoped to Critical and Warning. Left as
a known documentation-vs-gate mismatch rather than silently reworded.

### C4 — seed cells that were wrong but carried no placeholder marker

Two seeded values sat outside the brace-placeholder convention the seed used for unknown task IDs,
and so would have been changed invisibly. Recorded here instead:

- **The Plan column of the first four rows read `{01}`.** Those four rows are `kill-plan.test.ts`
  assertions and were emitted by **T-08-05 in plan 02**, not plan 01. Plan 01 was the Wave-0 spike
  and shipped no test file.
- **The Platform note's `index.ts` line count read 5,240.** Measured **5,562** at phase close (and
  5,244 already at plan 08-02's base, before any Phase 8 code — plan 08-01's breadcrumb landed after
  the research measurement was taken). Both figures are now carried, labelled.

---

## Compliance declaration

The `status` field in the frontmatter reads **validated** — every row names an owning task and an
executed (or explicitly unexecuted) command.

`nyquist_compliant: **false**` — deliberately, and it is not a formality. **Two rows are not ✅:**

1. **T-08-10 / plan 04 — the win32 integration suite has never executed.** It is `skipIf`-gated to
   win32, collects cleanly everywhere (3 total / 3 pending) and nothing was pushed during plan 08-04.
   Off Windows a skip is a **non-result**, not a pass. The reserved dead-pid exit-code block in
   `kill-tree.win32.test.ts` is deliberately empty. Broken-windows ledger entry **12**
   (`unrun-verify`).
2. **T-08-11 / plan 04 — the CI gate step ships but has never fired.** The step exists, the YAML
   parses, and the two-directional deletion measurement proves its anchors cannot be satisfied by
   Phase 7's step. No runner has executed it, so there is no executed-count log line and no run URL.

Both close the same way: **one `windows-latest` run**. Until then, LIF-01's Windows mechanism has
exactly the evidence it had before plan 08-04 — a unit contract over the argv (T-08-05) plus source
analysis. Plan 08-04 built the apparatus and took no reading.

**ADDED 2026-08-28 — a third reason, which is not a row in that table.** A1's 2026-08-27 reading is
**RETRACTED** (`08-VERIFICATION.md` gap 1): the probe coalesced an absent `process.kill` into a
definite "not alive" and emitted the favourable string unconditionally, so the LLRT `detached`
premise under the nine POSIX termination sites is **unmeasured**, not proven. This reason is added,
not substituted — neither of the two rows above is relaxed by it, and `nyquist_compliant` stays
**false**. It closes on the A1 re-run with the three-valued `classifyLivenessObservation`
(`kill-plan.ts`, plan 08-12), owned by plan 08-17.

A third gap sits outside this table and is recorded so it is not read as covered by it.
**CORRECTED 2026-08-28, superseding the 2026-08-27 correction preserved below — it is ONE
measurement (A6, negative) and one RETRACTED reading (A1), not a pair of measurements.** The
Wave-0 probe was built, type-checked, linted and bundled, and its hardware checkpoint was waived on
2026-08-24 without readings; it was rebuilt from commit `68199fa` and **run on 2026-08-27** during
UAT, on a real macOS Caido (darwin 25.6.0). Only one of the two readings survives scrutiny:

- **A1 — RETRACTED 2026-08-28, NOT measured.** The probe determined liveness with
  `signalRef.process?.kill?.(grandchildPid, 0) ?? false`, an optional call on a primitive the SAME
  run measured absent (`typeof process.kill` = `"undefined"`), so the absent case was coalesced to
  "not alive" and `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` was emitted
  UNCONDITIONALLY. **The red input did not exist.** The nine sites plan 08-03 made dependent on A1
  are back to resting on source analysis of a pinned commit, exactly as before the run. Fixed
  determination: `classifyLivenessObservation` (`kill-plan.ts`, plan 08-12), three-valued; re-run
  owned by plan 08-17. See `08-VERIFICATION.md` gap 1 and ledger entry 20.

  > **SUPERSEDED 2026-08-27 (preserved, not deleted):** *"CORRECTED 2026-08-27 — it is no longer
  > an absence; it is a pair of measurements, one of them negative."* and the A1 bullet it
  > introduced: *"**A1 — CLOSED FAVOURABLY, measured.** `spikeDetachedGroupKill:
  > "grandchild-died (detached honoured)"`. The nine sites plan 08-03 made dependent on A1 are
  > backed by execution on the shipping runtime."* The A6 bullet below is NOT superseded.
- **A6 — FALSIFIED, measured.** Provider CLI codex pid **43921** in pgid 43752; its own
  `mcp-server.mjs` child pid **44284** in pgid **44284**. A group signal aimed at the CLI's
  group cannot reach the token-bearing child. One provider, on an instance Drift did not spawn;
  **Claude Code remains unmeasured.**

The mechanism that answers the falsification is the argv-marker orphan reap plans **08-06** and
**08-07** shipped — identity by the target's own command line, independent of process groups by
construction. Ledger entry **11** (`unmet-truth`) is rewritten to this state rather than closed, and after the
2026-08-28 retraction it narrows nothing on the A1 side: A1 is unmeasured, the Claude Code half of
A6 is still unmeasured, and the Control was never taken.

> **SUPERSEDED 2026-08-24 (preserved, not deleted — the `07-VALIDATION.md` convention):**
>
> A third gap sits outside this table and is recorded so it is not read as covered by it:
> **assumptions A1 and A6 are OPEN — not measured** (`08-SPIKE.md`). The Wave-0 probe was built,
> type-checked, linted and bundled, then the hardware checkpoint was waived on 2026-08-24 without
> readings. Plan 08-03 raised the number of sites depending on those assumptions from **two to nine**.
> Ledger entry **11** (`unmet-truth`).

---

## Wave 0 Requirements

- [x] `packages/backend/src/kill-plan.ts` + `kill-plan.test.ts` — LIF-01, LIF-02, SC-1, SC-2 (08-02 T-08-04/T-08-05)
- [x] `packages/backend/src/kill-tree.posix.test.ts` + a runtime-built fork-a-grandchild fixture
      (built by the test, **not** committed — the `spawn-plan.win32.test.ts` precedent) — LIF-02, SC-3 (08-02 T-08-04)
- [x] `packages/backend/src/kill-tree.win32.test.ts` (skipIf ≠ win32) — LIF-01, SC-3 (08-04 T-08-10) — *file shipped; never executed, see § Compliance declaration*
- [x] `packages/backend/src/kill-tree.win32.gate.test.ts` + the matching `ci.yml` gate step — the false-green guard (08-04 T-08-11)
- [⚠] **Spike (strongly recommended):** the temporary diagnostics path reporting, from a **real Caido
      install on macOS/Linux**, (a) `typeof process.kill`, (b) that a `detached: true` spawn's group
      kill reaches a grandchild, and (c) the `pgid` of a real CLI's MCP child. **BUILT AND WAIVED, NOT
      RUN IN WAVE 0; **RUN 2026-08-27** — 08-01 T-08-01 shipped the probe (`68199fa`), the
      maintainer waived the T-08-02 hardware checkpoint, and T-08-03 removed the probe as planned.
      This was the **only** available closure for A1 and A6, and it was finally taken during UAT:
      **A6 FALSIFIED (a real measurement); A1's reading RETRACTED 2026-08-28 and therefore still
      OPEN; the Control (c) still not taken.** `08-SPIKE.md` holds the readings and the procedure,
      and the commit to rebuild from.

      > *Correction 2026-08-28. The superseded 2026-08-27 clause read:* "**A1 closed favourably,
      > A6 FALSIFIED, the Control (c) still not taken.**"
      >
      > *Correction 2026-08-27. The superseded 2026-08-24 clause read:* "This was the **only**
      > available closure for A1 and A6; both remain OPEN."


The `wave_0_complete` flag is set true in the frontmatter because the four **code** artifacts all
exist and the wave's gate was passed by maintainer decision. It does **not** claim item 5 was
measured.

Each of the four files was confirmed present on disk with `[ -f ]` at phase close. No framework
install was needed and no shared fixture module was needed beyond the per-file fixtures.

---

## Vehicle caveat — what this phase's evidence will NOT cover

Written in the voice Phase 3 § *Vehicle caveat* and `07-VALIDATION.md` established, and deliberately
not softened. Reproduced by reference in `08-SECURITY.md` § *What this phase's evidence does not
cover* rather than restated there.

1. **It will not prove `index.ts`'s wiring.** No test executes `cancelCliMessage`, `closeCliSession`,
   `cleanupMcpRuntime` or the timeout handler. What is proven at those sites is *the source text
   delivers the right arguments in the right order*, by comment-stripped `awk`-scoped counts, by the
   `functionBody` statement-position scanner, and by the compiler. That is the strongest available
   substitute; it is not a test.
2. **It will not prove Caido's LLRT — RESTORED 2026-08-28 to FULLY UNDISCHARGED.** The
   2026-08-27 text below recorded this item as partly discharged on the strength of A1's reading.
   **That reading is RETRACTED**: the probe decided liveness with an optional call on
   `process.kill`, a primitive the SAME run measured absent, and coalesced the absent case to "not
   alive", so `grandchild-died (detached honoured)` was emitted unconditionally and the red input
   did not exist. *The `detached` half is therefore NOT proven on the shipped runtime* — it is
   unmeasured, as it was on 2026-08-24. *The `process.kill` `u32`-typing half is not proven
   either* — and that half remains **doubly moot**, because the same UAT measured `typeof
   process.kill` as `"undefined"`: Caido's plugin sandbox exposes no such function at all, so the
   conversion error SC-2 cites is unreachable behind a `TypeError`. That note is a real reading by
   a different route (a `typeof`, not a coalesced call) and is NOT withdrawn. The ban still holds
   and the static gate still earns its place; only its stated mechanism is partial. No CI leg
   executes LLRT, so this whole item stands undischarged, and assumption A2 (Phase 5's) stays open
   alongside A1.

   > **SUPERSEDED 2026-08-27 (preserved, not deleted):** *It will not prove Caido's LLRT — PARTLY
   > FALSE since 2026-08-27, and exactly which part matters. The `detached` half IS proven on the
   > shipped runtime by measurement: A1 came back `grandchild-died (detached honoured)` on a real
   > macOS Caido (`08-SPIKE.md`). The `process.kill` `u32`-typing half is not proven — and it is
   > doubly moot, because the same UAT measured `typeof process.kill` as `"undefined"` … No CI leg
   > executes LLRT, so everything else in this item stands, and assumption A2 (Phase 5's) stays
   > open.*

   > **SUPERSEDED 2026-08-24:** *It will not prove Caido's LLRT. `detached` and `process.kill`'s
   > `u32` typing are **source-verified and never executed**. Every CI leg runs Node. Assumption
   > A2 (Phase 5's) stays open, and this phase adds **A1** and **A6** to it. The Wave 0 spike was
   > the cheapest partial closure, it covered POSIX only, and **it was not run**.*

3. **It will not prove that any real CLI's MCP child is in the killed group — and on 2026-08-27
   this stopped being an absence and became a NEGATIVE MEASUREMENT.** No CLI binary is executed
   anywhere in this project's CI, so the statement still holds *of CI*. Outside CI, UAT measured
   it by hand: codex pid **43921** in pgid 43752, its `mcp-server.mjs` child pid **44284** in
   pgid **44284**. A6 is **FALSIFIED for that provider**; Claude Code is still untested.

   > **SUPERSEDED 2026-08-24:** *It will not prove that any real CLI's MCP child is in the killed
   > group. No CLI binary is executed anywhere in this project's CI. A6 is untested by
   > construction.*
4. **It will not prove SC-3 on Windows behaviourally.** A CI job proves the *spawn contract* — that
   the right `taskkill` argv is built and reaches `spawn`. It does not prove a real turn's tree came
   down. That belongs beside Phase 10 SC-5, whose text already guards the substitution trap: another
   green CI run does not satisfy it. **And in this phase not even the CI job has run yet.**
5. **It will not prove the `/T` residual is bounded in practice.** Pitfall 5's dead-intermediate-parent
   hole is a source-and-community claim; nothing observes how often it bites. Accepted as
   `08-SECURITY.md` **AR-01**.

---

## Manual-Only Verifications

| Behavior | Requirement | Owning phase | Gates this phase? | Test Instructions |
|----------|-------------|--------------|-------------------|-------------------|
| A real cancel on macOS/Linux leaves no `node mcp-server.mjs` behind | LIF-02 / SC-3 | **Phase 8 (this one)** | **Yes — SATISFIED 2026-08-24 by maintainer ATTESTATION, not by a recorded measurement.** Plan 08-05 **T-08-14**: the maintainer replied `approved`, which under the checkpoint's contract means a zero after-Stop count against a non-zero before-Stop count — but **supplied no numeric values**, so neither count was captured. **Timeout path: not reported → recorded as NOT exercised.** Full basis and the unexcluded confounder in `08-SECURITY.md` § *T-08-01 — closed by attestation*; verbatim record in `08-05-SUMMARY.md` | Start a Claude turn in Caido, note `pgrep -f mcp-server.mjs \| wc -l`, click Stop, wait ~5 s, re-run `pgrep`. Expect zero. **Cheap, decisive, and on hardware the maintainer owns.** Compare against `08-SPIKE.md` § *Control* — which is itself **unrecorded**, so T-08-14 must establish its own before-count on the day. |
| A real cancel on native Windows leaves no `node.exe` behind | LIF-01 / SC-3 | **Phase 10** | **No** — hardware-blocked (C-5) | Reporter or any Windows user: start a turn, cancel, check Task Manager for orphaned `node.exe`. ROADMAP Phase 10 **SC-5** owns it. |
| LLRT honours `detached` on the shipped Caido build | A1 | **Phase 8** | **Recommended** — the Wave 0 spike | **RUN 2026-08-27, READING RETRACTED 2026-08-28 — A1 IS OPEN.** The probe coalesced an absent `process.kill` to "not alive" and emitted `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` unconditionally; the red input did not exist, so the run answers nothing about this assumption (`08-VERIFICATION.md` gap 1; ledger entry 20). Re-run with the three-valued `classifyLivenessObservation` (plan 08-12), owned by plan 08-17. *(Superseded cell, 2026-08-27, preserved: "RUN 2026-08-27 — A1 &lt;the withdrawn favourable verdict&gt;. `spikeDetachedGroupKill: …` on darwin 25.6.0, probe build `68199fa`." Superseded cell, 2026-08-24: "NOT RUN — waived 2026-08-24. Procedure preserved verbatim in `08-SPIKE.md` § How to run this spike later; probe recoverable at commit `68199fa`.")* Still open on the same procedure: **A1 itself**, **A6 against a Drift-spawned Claude Code turn** (measured FALSE for codex, pids 43921/44284) and the **Control** (never taken). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — the four code artifacts exist; item 5 was a
      risk-closure recommendation rather than a MISSING reference, and it was built and waived
- [x] No watch-mode flags
- [x] Feedback latency < 5s (local) / ~90s (Windows leg)
- [x] Task ID column filled from the emitted PLAN.md files
- [ ] `nyquist_compliant: true` set in frontmatter — **NOT set.** Two rows are ⚠️ (T-08-10 and
      T-08-11, both closing on one `windows-latest` run). See § *Compliance declaration*.

**Approval:** validated 2026-08-24 by plan 08-05 T-08-13, with `nyquist_compliant: false`.
