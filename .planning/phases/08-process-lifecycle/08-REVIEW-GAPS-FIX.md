---
phase: 08-process-lifecycle
increment: gap-closure fix pass
source_review: .planning/phases/08-process-lifecycle/08-REVIEW-GAPS.md
review_commit: aa8e6bf
fixed_at: 2026-08-27
scope: critical + warning (CR-01, WR-01…WR-06); IN-01…IN-03 out of scope
findings_in_scope: 7
fixed: 6
partially_fixed: 1
skipped: 0
status: all_addressed
suite_before: 686 total (677 passed / 9 skipped)
suite_after: 695 total (686 passed / 9 skipped)
tests_removed: 0
gates_weakened: 0
---

# Phase 08 gap-closure increment — review fix report

**Source review:** `08-REVIEW-GAPS.md` (committed `aa8e6bf`)
**Base:** `aa8e6bf` · **Head after this pass:** the seven commits below, on `main`, hooks on,
no `--no-verify`.

Every finding in scope was verified against the source before anything was changed. All six
review claims held. **One suggested fix was rejected on its merits and replaced with a different
one (WR-03), and one fix had to be redone because the first attempt was worse than the bug it
fixed (WR-05).** Both are recorded below rather than smoothed over.

## Gates, after every commit and again at the end

| Gate | Result |
|---|---|
| `pnpm exec vitest run` | **695 total — 686 passed / 9 skipped.** Floor was 686. Zero tests removed |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` | exit 0 (`--max-warnings 0`, no Prettier run on `index.ts` or the test files) |
| `verdict-gate.sh` | exit 0 (ARM A, ARM B, ARM C) |

The nine skipped are the two deliberate platform gates (`spawn-plan.win32.test.ts` ×6,
`kill-tree.win32.test.ts` ×3), unchanged.

---

## CR-01 — the idle reap could SIGKILL Drift's own `--validate-auth` child — **FIXED**

**Commit:** `5c5a3aa`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`

**Verified before changing anything.** `mcpDirectCallDepth` had exactly one increment, at
`index.ts:2341` inside `callMcpMethod`. `grep -n 'spec\.args\|addPlan\.args'` over `index.ts`
returns the three script-path-bearing sites the review names, and only one of them was inside the
counter. `buildMcpCliRegistrationArgv` (`mcp-server-spec.ts:598`, `:612`) does put
`input.mcpScriptPath` in the registration process's own argv for both gemini and codex. The claim
holds in full.

**What shipped.** The arithmetic moved out of `callMcpMethod` into two shared mutators
(`acquireDirectMcpCall` / `releaseDirectMcpCall`) plus an awaited `withDirectMcpCall<T>` wrapper.
`validateCaidoAuth` and `registerMcpWithCli`'s `mcp add` spawn now route through the wrapper. The
pre-clean `mcp remove` spawns are deliberately NOT wrapped — their argv is `mcp remove drift
--scope …` and carries no script path.

`spawnAndWait` resolves rather than rejects, including for a spawn that never started, so the
wrapper's `finally` is reached on every path — a **stronger** release than `callMcpMethod`'s
event-bound one.

**The input that proves the reaper still fires when it should** (the guidance's requirement, since
a guard that errs toward never reaping recreates the original defect quietly):

1. **The gate itself, from literal scalars.** `shouldReapSessionOrphans({ activeSessionCount: 0,
   directMcpCallDepth: 0 })` → `true`. That case already existed in `kill-plan.test.ts` and is
   still green; it is the LIF-02 scenario exactly (one turn, click Stop, nothing else in flight).
2. **That the counter RETURNS to zero rather than merely leaving it.** The wrapper's release is in
   a `finally` over an await that cannot reject, and the source gate asserts `mcpDirectCallDepth
   += 1` and its clamped release each appear **exactly once in the whole file** — so there is one
   spelling in each direction and they are paired inside the two mutators. Combined with WR-01's
   `exit` release and the `cleanupMcpRuntime` reset, the depth cannot be left standing by any path
   this pass introduces: the two new sites release synchronously in a `finally`, and the one old
   site now has three independent release events plus a per-runtime reset.
3. **The behavioural vehicle is unchanged and still green.** `orphan-reap.posix.test.ts` spawns
   real detached `mcp-server.mjs` fixtures, runs the production `pgrep` plan against them and
   asserts the marked one dies while two controls survive — 3/3 passing after this pass. Nothing
   in CR-01's fix touches the scan, the pattern or the kill.

The direction the fix could have gone wrong is **more suppression**, and it is bounded: the two
new increments are held only across a single `await spawnAndWait`, which is itself bounded by that
function's own behaviour, and both release in a `finally`.

**New gate, fail-closed by census.** `index.source.test.ts` now enumerates the `spec.args` and
`addPlan.args` populations per enclosing function and balances the sum against the file total, so
a fourth script-path-bearing spawn added outside the guard goes red instead of being absorbed —
which is precisely the failure that let two of three sites sit outside the counter for the whole
phase.

**Red inputs executed:**
- unwrapping `validateCaidoAuth` → `withDirectMcpCall(` count 1 → 0, red;
- adding a fourth `spec.args`-bearing spawn in an unenumerated function → sum-versus-total 3 → 4,
  red.

---

## WR-01 — one undelivered event permanently disabled the idle reap — **FIXED**

**Commit:** `3645880`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`

**Verified.** Release was wired to `error` and `close` only; `grep -n 'mcpDirectCallDepth'` showed
no reset anywhere in the file. `kill-plan.ts:331-345` does record that LLRT's `ChildProcess`
carries neither `exitCode` nor `signalCode`, so `activeSelfTestPoll` cannot settle there either.
The claim holds.

**What shipped**, three independent hardenings in the order they catch the failure:

1. `proc.on("exit", …)` as a third release — the event `kill-plan.ts:341` names as the one LLRT
   *does* supply, and the one `sendCliMessage`'s provider spawn already registers.
   `releaseDirectCall()` is idempotent.
2. `mcpDirectCallDepth = 0` in `cleanupMcpRuntime`, after the kill loop. The counter belongs to the
   MCP runtime and that is where the runtime ends; this bounds a leak to one runtime instead of one
   plugin load.
3. The release is clamped: `Math.max(0, mcpDirectCallDepth - 1)`. **Without the clamp, (2) creates
   the failure it fixes** — a release arriving after a reset drives the depth negative, and
   `shouldReapSessionOrphans` demands an exact zero, so a negative depth is permanent suppression
   all over again.

**Interaction with CR-01, stated because the two pull in opposite directions.** CR-01 makes the
counter cover more spawns (more chances to leak); WR-01 makes a leak recoverable and bounded. The
primitive was NOT changed to an exclude-set of live pids, and the reason is recorded rather than
assumed: `kill-plan.ts:733-736` and `index.ts:332-339` both record that a stale pid in such a list
would shield a genuine orphan that later reused the number — T-08-04's failure shape pointed the
wrong way. `reapMcpOrphans`'s dead `excludePids` parameter (IN-01, out of scope) was left alone
rather than pressed into a role that recorded decision rejected.

**Red inputs executed:** dropping the `exit` handler (`releaseDirectCall()` 3 → 2); deleting the
reset (`mcpDirectCallDepth = 0` count 2 → 1); unclamping the release. Each turns the gate red. The
gate also asserts the bare `-= 1` spelling is **gone**, not merely outnumbered.

---

## WR-02 — the idle gate refused silently — **FIXED**

**Commit:** `7d79e20`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`

**Verified.** `reapSessionOrphansIfIdle` had a bare `return;`, while `reapMcpOrphans` logs a
reason for a plan refusal and for all four enumerator outcomes. The claim holds.

**What shipped.** Two scalars, per T-04-04's rendering rule — no pid, no path, no argv:
`[drift lifecycle] no orphan reap: gate-closed sessions=N directDepth=N`. `sessions>0` is AR-07;
`directDepth>0` is a direct MCP call in flight or a release that never arrived.

**Red input executed:** dropping either scalar from the line turns the new gate red (the gate
asserts the scalars by name, not a bare `console.log` count — a log line without the counts
distinguishes nothing).

---

## WR-03 — no identity re-check between `pgrep` and `kill` — **PARTIALLY FIXED, and the review's two suggested closures were both REJECTED**

**Commit:** `3e0d5cf`
**Files:** `packages/backend/src/kill-plan.ts`, `kill-plan.test.ts`, `index.ts`,
`index.source.test.ts`, `08-SECURITY.md`

**Verified.** The hazard is real and is the codebase's own argument turned on itself: T-08-04 and
`hasTrackedProcessExited` exist because a pid is not an identity, and the reap has the same hazard
on the one path holding no handle. It is issued at the moment processes are dying, with a `-KILL`
operand and no recourse.

**Both suggested fixes were rejected on their merits**, and the reasoning is recorded at
`kill-plan.ts`'s FRESHNESS BOUND block and in `08-SECURITY.md` § *T-08-23 / T-08-24 — the window
between enumeration and signal*, not only here:

- **`pkill -f`** does close the window — but it signals every match **at kill time** rather than
  the frozen list `pgrep` returned. A user who clicks Stop and immediately starts a new turn (an
  ordinary interaction, and far likelier than pid reuse) would have the **new** turn's MCP child
  killed. That is **T-08-27**, the exact harm the idle gate exists to prevent. It trades a
  low-probability harm for a higher-probability one.
- **A `ps -p <pid> -o command=` identity re-check** costs one more spawn **and one more
  child-process `close` delivery per orphan**. Whether Caido's LLRT delivers the *first* one is
  recorded in this phase as an **unrun-verify** residual. Gating the kill on a **second**
  unverified delivery multiplies the chance the orphan is never signalled — which is **LIF-02**,
  the reported bug this whole mechanism exists to fix. (The `ps` invocation itself was executed on
  darwin 25.6.0 during this pass and does print the full command line untruncated with `-o
  command=`; the objection is the extra event dependency, not the utility.)

**What shipped instead.** A fifth `classifyOrphanScanOutcome` arm, `scan-stale`. The caller already
arms a `setTimeout` for the scan budget, so in the ordinary case the window is bounded. The case
that is **not** bounded is the one that matters: on a starved Caido event loop neither the timer
nor the `close` callback runs, and whichever becomes runnable first when the loop drains decides
the outcome — if `close` wins, the pids are arbitrarily old. The age is now measured on the **wall
clock** against the caller's own scan timeout (the same identifier at both, gated in
`index.source.test.ts` so the two bounds cannot drift apart), so the bound holds in **both**
orderings.

Shape is checked as well as size, per the module's subtractive rule: an unusable age or budget
resolves toward stale. A **negative** age does not — `Date.now()` is not monotonic, and refusing on
a backwards clock step would disable the reaper for the length of the step, which is the reaper
erring toward never firing.

**What remains, recorded rather than hidden:** inside the budget a reused pid is still signalled.
Accepted as **AR-09** in `08-SECURITY.md` with a named decider. `08-SECURITY.md`'s T-08-24 row is
corrected from four arms to five as a **marked amendment** — the original count is left as written,
because it was correct on its date — and T-08-23 carries a marked amendment pointing at the new
section.

**Red inputs executed:** deleting the freshness arm turns two `kill-plan.test.ts` cases red;
passing a literal budget instead of the shared constant turns the source gate red. The suite also
asserts the bound in the **other** direction — an at-budget scan still reaps, and a negative age
still reaps — so the fix cannot pass by refusing everything.

---

## WR-04 — `verdict-gate.sh` ARM C could not detect what it asserted — **FIXED**

**Commit:** `cfa12a4`
**File:** `.planning/phases/08-process-lifecycle/verdict-gate.sh`

**Verified.** `git diff --stat HEAD -- '…/*-SUMMARY.md'` is empty at every commit boundary by
construction. Confirmed by executing the real red input: a summary edited **and committed** left
the old arm green.

**What shipped.** A pinned blob hash per summary compared against `git rev-parse HEAD:<path>`, a
count check so an unpinned new summary goes red, and the original working-tree diff retained as a
second, cheaper arm for the one case it does cover.

**The review's suggested `git log --oneline --follow | wc -l` was NOT taken.** Under
`actions/checkout`'s default `fetch-depth: 1`, or any shallow clone, every file reads as one commit
and the check passes vacuously — the same failure relocated. `git rev-parse HEAD:<path>` reads
HEAD's own tree and is depth-independent. (All ten summaries do currently have exactly one commit,
so the suggested check would have been green here — which is the point: green for the wrong
reason.)

**Red inputs executed, all three:**
- a summary rewritten **and committed** — `08-01-SUMMARY.md is eb9af8e… in HEAD, pinned at
  725ba46…`. Produced by genuinely committing the edit and unwinding it with `reset --soft` plus a
  `git restore --source=HEAD`; the working tree and `.planning/PROJECT.md` were left untouched;
- an unpinned new summary — `11 dated SUMMARY files on disk but 10 pinned`;
- an uncommitted edit — the retained working-tree arm names the file.

---

## WR-05 — ARM A's fail-closed discovery loop failed **open** on whitespace paths — **FIXED (second attempt; the first was worse than the bug)**

**Commit:** `eab0bf0`
**File:** `.planning/phases/08-process-lifecycle/verdict-gate.sh`

**Verified live**, not by reading: an in-repo `08 UAT notes.md` carrying the stale verdict is found
**0 times** by the shipped `find … -print | xargs grep -lE …` pipeline.

**The first attempt was rejected after testing it.** It used `grep -lIZE` plus `read -r -d ''`, on
the assumption that `-Z` means `--null`. On GNU grep it does. On FreeBSD/macOS grep — and on the
`ugrep` shadowing `grep` on this machine's PATH (`grep --version` → `ugrep 7.8.4`) — **`-Z` means
`--decompress`**. The output stayed newline-delimited, `read -d ''` never found a NUL, and the loop
ran **zero times** while ARM A still printed "pass". ARM A would have gone from failing open on
whitespace paths to failing open on everything. Caught by running the fixture; the episode is
recorded **in the script** so the flag is not "restored" later.

**What shipped.** `find … -type f -exec grep -lIE "$STALE_ERE" {} +`, newline-delimited, using only
flags GNU grep, BSD grep and ugrep agree on. `-I` skips binaries, which `grep -l` would otherwise
name and the loop would then `sed` as text.

The one shape a newline-delimited read cannot enumerate is a filename containing a **newline**.
Rather than leave an unstated hole in a fail-closed arm, it is **detected**: `find -print0` and
`find -print` must agree on the name count, and they cannot when one contains a newline.

**Red inputs executed:** the `08 UAT notes.md` fixture (old pipeline 0 hits, new gate names it and
exits 1); a probe file with an embedded newline (`291 names, 292 lines`, arm red).

---

## WR-06 — `platform.test.ts`'s non-drive-absolute case did not exercise its own title — **FIXED**

**Commit:** `63d9fa1`
**File:** `packages/backend/src/platform.test.ts`

**Verified by tracing `platform.ts:302-386`** exactly as the review does: `"   "` is trimmed to
`""`, the trailing-separator loop is a no-op, and `if (root === "") return input.binary` returns the
bare `"cmd.exe"` — the same arm the preceding case takes with `""`. Duplicates under different
titles. The whitespace-is-absent rule is separately asserted on the ladder itself at
`platform.test.ts:271`, so nothing is lost by changing this input.

**What shipped.** The case now passes `"Windows"`, which composes the real but **relative**
`Windows\System32\cmd.exe` — the only input reaching `isAbsolutePath`'s refusal with something
other than a bare name. That refusal guards **T-08-33**, rated `high`, on the branch carrying a
live `CAIDO_TOKEN`. The composition is asserted alongside the refusal, so the case cannot pass
because nothing was derived at all — which is exactly how the superseded input passed.

Also added: a case that **pins the asymmetry** the review flagged rather than leaving it
undocumented — `getWhichCommand` applies no `isAbsolutePath` refusal to the same ladder's output. It
is unreachable in production today (`deriveWindowsSystemRoot` returns only `""` or `X:\Windows`), so
it is recorded as a documented divergence rather than closed: tightening a third consumer is a
behaviour change on the Windows spawn path, and native Windows cannot be tested locally
(CLAUDE.md § *Testing*).

**Red inputs executed:**
- weakening `selectComspec`'s guard to accept a relative **composed** path fails **exactly one**
  case — the corrected one — while the previously-duplicate `""` case stays green. That is the
  coverage hole, demonstrated rather than argued;
- adding an `isAbsolutePath` refusal to `getWhichCommand` fails the new asymmetry case, so the
  divergence cannot be closed silently in either direction.

---

## Out of scope, and their status after this pass

- **IN-01** (`excludePids` dead in production) — untouched. WR-01's write-up records *why* the
  parameter was not pressed into service as the CR-01 primitive, which is the confusion IN-01
  warns about, but the parameter and the test comment are unchanged.
- **IN-02** (`killed=N` counts spawn attempts) — untouched. The kill loop was not restructured, so
  the field is as it was.
- **IN-03** (parser accepts integers above any pid range) — untouched. Still unreachable from
  `pgrep`.

## Artifacts corrected, all as marked corrections

- `08-SECURITY.md` — T-08-24 row (four arms → five, original count preserved), T-08-23 row
  (amendment pointer), new § *T-08-23 / T-08-24 — the window between enumeration and signal*, new
  accepted residual **AR-09**.
- `08-VALIDATION.md` — the test-count ladder extended `686 → 695`, with the new floor stated and
  the three now-able-to-fail gates named.

Nothing was rewritten in place: `08-REVIEW-GAPS.md` and every dated `*-SUMMARY.md` are byte-for-byte
unchanged, which ARM C now enforces against pinned blob hashes rather than against dirt.

---

_Fixed: 2026-08-27_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
