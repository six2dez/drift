---
phase: 08-process-lifecycle
plan: 15
subsystem: process-lifecycle
tags: [diagnostics, orphan-reap, ud-01, a1, probe-patch, verdict-gate, gap-closure, tdd]

requires:
  - phase: 08-process-lifecycle
    provides: "verdict-gate.sh re-pointed at A1's actual verdict (plan 08-11) — the instrument this plan turns green"
  - phase: 08-process-lifecycle
    provides: "classifyLivenessObservation / buildLivenessProbePlan / formatSpikeVerdict (plan 08-12) — the helpers the probe patch composes"
  - phase: 08-process-lifecycle
    provides: "ROADMAP.md and REQUIREMENTS.md corrected (plan 08-13) — ARM A carriers this plan's green depends on"
  - phase: 08-process-lifecycle
    provides: "WINDOWS.md, STATE.md, 08-UAT.md, 08-VALIDATION.md, 08-SECURITY.md corrected (plan 08-14) — the last ARM A carriers"
  - phase: 08-process-lifecycle
    provides: "08-UI-SPEC.md decision UD-01, resolved option C — the diagnostics-only key this plan builds"
provides:
  - "formatOrphanReapRecord + OrphanReapRecord in kill-plan.ts — a whitelist formatter for the reap's diagnostics value, never a serializer"
  - "lastOrphanReap in getDiagnostics — the one key that says whether the argv-marker orphan reap is INERT on the machine a bug report came from"
  - "recordOrphanReapOutcome wired at all four reap outcome sites, with a source census that fails closed in BOTH directions"
  - "a1-probe-fix.patch — the repaired A1 probe as a committed, applicable unified diff against 68199fa"
  - "verify-a1-patch.sh — a standing control proving the patch applies, type-checks and builds in a scratch worktree that never touches the main tree"
  - "08-SPIKE.md § How to run this spike later, rewritten around the patch: three outcomes, an empty re-run table, and a step 5 that costs one glance"
  - "verdict-gate.sh at exit 0 — the first green in the gap-closure set, asserted AFTER this plan's own edit to an ARM A carrier"
affects: [08-16, 08-17]

actuals:
  tokens: 16313
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Whitelist formatter over a discriminated record, never a generic serializer: a support-bundle value must be unable to render a field a future edit adds"
    - "Bidirectional source census enumerated per enclosing function, so a redistribution of the same total cannot balance the books"
    - "A repair shipped as a committed patch file plus a standing control that proves it applies and builds, rather than as a description of what someone should write"
    - "Detached scratch worktree as the isolation primitive for a historical-commit build — the main working tree is never mutated, so the control is safe to run mid-edit"

key-files:
  created:
    - .planning/phases/08-process-lifecycle/a1-probe-fix.patch
    - .planning/phases/08-process-lifecycle/verify-a1-patch.sh
  modified:
    - packages/backend/src/kill-plan.ts
    - packages/backend/src/kill-plan.test.ts
    - packages/backend/src/index.ts
    - packages/backend/src/index.source.test.ts
    - .planning/phases/08-process-lifecycle/08-SPIKE.md

key-decisions:
  - "The formatter is a WHITELIST over named fields, and the scalars-only case proves it by feeding every arm a pid, a pid array and an absolute path in fields no arm reads — a JSON.stringify implementation passes every other case and fails only this one"
  - "The classifier's own `scanAgeMs: Date.now() - scanStartedAt` expression is left spelled INLINE and the record takes a second read (`settledAgeMs`), because index.source.test.ts pins that literal as the freshness bound's own gate; hoisting it into a shared local would have silently retired an existing assertion to make a new one convenient"
  - "The `lastOrphanReap` ≥5 acceptance count MEASURED 4 and was NOT padded to reach the floor — the natural implementation has exactly four occurrences, and the mechanism count the criterion most plausibly meant (recordOrphanReapOutcome, 5 comment-stripped lines) does meet it"
  - "The patch carries two NAMED compatibility edits (systemRootFallback: \"\") rather than hiding them in the verify script, so the by-hand recipe in 08-SPIKE.md stays a correct recipe; they were discovered by RUNNING the control, which failed step 3 on its first run"
  - "A corrupted hunk OFFSET is not a red input — git apply re-locates by context and absorbed it silently. The structural corruption a hunk header can carry is its LINE COUNT, and that is what the demonstration uses"
  - "The re-run results table ships EMPTY with every cell marked `not recorded`, in the Control table's own honest-absence form, so plan 08-17 fills cells rather than inventing a structure"

patterns-established:
  - "Every mutation asserted to have LANDED (`assert s.count(old)==1`) before its result is read, and every restore verified by SHA-256 against a backup — a mutation that silently no-ops reads exactly like a check that does not catch it"
  - "Capture the gate ONCE and assert liveness (three `== ARM ` headers) against the SAME capture as the target count, so an instrument that printed nothing cannot register as green"

requirements-completed: [LIF-02]

coverage:
  - id: D1
    description: "getDiagnostics returns a lastOrphanReap key that distinguishes every outcome the reap can produce, including the inert-enumerator no-op"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#distinguishes the inert enumerator from a reap that ran and matched nothing"
        status: pass
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#renders pairwise-distinct strings across the whole no-op reason union"
        status: pass
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#surfaces the key once in getDiagnostics and writes it from one place"
        status: pass
    human_judgment: false
  - id: D2
    description: "The lastOrphanReap value carries scalars only — no pid, no pid list, no path, no argv, no environment value"
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#leaks no pid, no pid list and no path into any outcome's value"
        status: pass
      - kind: integration
        ref: "red input: formatter made to interpolate the pid field; the case fails naming 443921; restored by checksum"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every reap outcome site records, and nothing else does — a source gate that fails closed in both directions"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#pairs a recording call with every outcome log line, function by function"
        status: pass
      - kind: unit
        ref: "packages/backend/src/index.source.test.ts#records a reap outcome from nowhere except the functions that produce one"
        status: pass
      - kind: integration
        ref: "red inputs: one call deleted (fails naming reapSessionOrphansIfIdle); one call added to getMcpSessionDirName (fails naming it); census pointed at raw source (comment-only edit moves the count 5 -> 6 and fails)"
        status: pass
    human_judgment: false
  - id: D4
    description: "a1-probe-fix.patch applies at 68199fa, type-checks and builds, without mutating the main working tree"
    verification:
      - kind: integration
        ref: "bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh — exit 0, plugin_package 5 files / 2,545,673 bytes; git worktree list shows only the main worktree; git status --porcelain packages/ empty"
        status: pass
      - kind: integration
        ref: "red input: hunk line count 7 -> 9 in a scratch copy; exit 1 naming the apply failure, worktree still removed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The patched probe determines liveness by a spawned enumerator and reports three values, and terminates its fixtures through a spawned killer"
    verification:
      - kind: integration
        ref: "a1-probe-fix.patch verdict hunk (buildLivenessProbePlan / classifyLivenessObservation / formatSpikeVerdict, no runtime kill primitive) and cleanup hunk (buildOrphanKillPlan per pid, unconditional across every exit path)"
        status: pass
    human_judgment: false
  - id: D6
    description: "verdict-gate.sh exits 0 with all three arms passing, and returns to 0 after an injected live favourable-verdict line is removed"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "bash verdict-gate.sh: exit 0, 3 ARM headers, 0 FAIL lines -> inject .planning/gate-red-input-08-15.md: exit 1 naming the file, 3 ARM headers -> remove: exit 0 again"
        status: pass
    human_judgment: false
  - id: D7
    description: "08-SPIKE.md § How to run this spike later names the patch, gives apply-and-restore verbatim, enumerates exactly three outcomes, carries an empty re-run table and a step 5 for lastOrphanReap"
    verification: []
    human_judgment: true
    rationale: "Whether the rewritten procedure reads as something a maintainer can execute from cold — in the right order, with the third outcome landing as a result rather than a halt — is a judgment no grep can make. The mechanical half (patch path named, three outcomes enumerated, A1/A6/Control tables with zero diff hunks, both replaced blocks preserved as block quotes) is verified; the runnability half is not, and only the hardware run plan 08-17 owns can settle it."

duration: 25 min
completed: 2026-08-28
status: complete
---

# Phase 8 Plan 15: One diagnostics key for the phase's largest open question, and a probe fix that was built rather than described

**`getDiagnostics` now carries `lastOrphanReap`, a scalars-only value that tells a bug reporter
whether the argv-marker orphan reap actually ran on their machine or was silently refused by
Caido's sandbox; the broken A1 probe ships as a committed patch that was demonstrated to apply,
type-check and build in a scratch worktree; and `verdict-gate.sh` exits 0 for the first time since
`08-VERIFICATION.md` was written — asserted AFTER this plan's own edit to an ARM A carrier, and
re-demonstrated red by injection and green again by removal.**

## Performance

- **Duration:** 25 min
- **Tasks:** 3 of 3
- **Files created:** 2 | **modified:** 5
- **Commits:** 4
- **Test suite:** 727 tests / 718 passing → **738 tests / 729 passing / 9 skipped**, zero failures,
  zero tests removed or skipped

| Commit | Message |
|---|---|
| `0b7f8ed` | `test(08-15): add failing cases for the orphan-reap diagnostics formatter` |
| `5e878c5` | `feat(08-15): surface the orphan reap's last outcome as a diagnostics key (UD-01)` |
| `af2a1ff` | `test(08-15): census that fails closed when a reap arm forgets to record` |
| `4bc6e33` | `docs(08-15): ship the fixed A1 probe as a verified patch, rewrite the spike procedure` |

---

## Task 1 — the diagnostics key

### The before/after source measurements, both taken over the comment-stripped stream

Ledger entries 16, 17 and 18 record three acceptance criteria in this phase that were vacuous
because they measured a comment, or already returned their target value against an unedited tree.
So both ends were measured, with the strip applied:

```
STRIP='/^[[:space:]]*(\/\/|\/\*|\*)/d'

BEFORE  sed -E "$STRIP" packages/backend/src/index.ts | grep -c 'lastOrphanReap'          -> 0
AFTER   sed -E "$STRIP" packages/backend/src/index.ts | grep -c 'lastOrphanReap'          -> 4
```

**The criterion asked for ≥ 5 and the honest measurement is 4. It was not padded to reach the
floor.** A natural implementation has exactly four occurrences and no more — the declaration, the
single assignment inside `recordOrphanReapOutcome`, and the two lines of the `getDiagnostics`
entry (`lastOrphanReap:` / `lastOrphanReap ?? "none (…)"`, split because the joined line is 96
characters). Reaching 5 would have required either a second writer, a second surfaced key or a
re-worded default — each of which the plan's own truths and the task-2 census forbid. The count
the criterion most plausibly meant, the *mechanism* count, does clear the floor:

```
AFTER   sed -E "$STRIP" packages/backend/src/index.ts | grep -c 'recordOrphanReapOutcome('  -> 5
        (1 declaration + 4 call sites)
```

Recorded as a deviation below rather than resolved by writing a fifth occurrence nobody needed.

### Record sites versus log sites

```
recordOrphanReapOutcome( call sites (5 comment-stripped lines − 1 declaration)  -> 4
reap outcome log lines
  sed -E "$STRIP" index.ts | grep -cE '\[drift lifecycle\] (orphan reap:|no orphan reap:)' -> 4
```

Equal, and the task-2 census now asserts that equality per enclosing function in both directions.

### No `await` added on any reap path

```
BEFORE  grep -cE 'await (reapMcpOrphans|reapSessionOrphansIfIdle)'   -> 0
AFTER   grep -cE 'await (reapMcpOrphans|reapSessionOrphansIfIdle)'   -> 0
```

Unchanged, and a new case (`never awaits the recording, and still records`) extends the same
guarantee to the recorder.

### Pairwise distinctness across the no-op reason union

`OrphanScanNoopReason` has **5** members (`enumerator-unavailable`, `scan-timeout`, `scan-stale`,
`scan-failed`, `no-match`). The formatter produces **5** distinct strings —
`expect(new Set(rendered).size).toBe(NOOP_REASONS.length)` — so the count of distinct outputs
equals the size of the union. `KillPlanRefusal`'s 4 members likewise produce 4 distinct strings.

### The added diagnostics key

```ts
    // UD-01 option C. The one key that answers whether the argv-marker orphan
    // reap is INERT on the machine this bundle came from: `kind=noop
    // reason=enumerator-unavailable` means the sandbox refused the enumerator
    // spawn and the mechanism never ran, which reads differently from
    // `reason=no-match` (it ran and matched nothing) and from `kind=reap`.
    // Scalars only — see `lastOrphanReap`'s declaration and T-08-75.
    lastOrphanReap:
      lastOrphanReap ?? "none (no orphan reap has run since this plugin load)",
```

### RED INPUT, DEMONSTRATED (scalars only)

The formatter was made to interpolate the contaminated `pid` field into two of its arms. Both
replacements were asserted to have landed exactly once before the result was read — the first
attempt at this mutation **failed its own assertion** (`AssertionError: ('reap arm count', 0)`,
a six-space indent that did not exist), which is precisely the silent no-op that would otherwise
have read as "the check does not catch this".

**Under the mutation:**

```
     × leaks no pid, no pid list and no path into any outcome's value
 FAIL kill-plan.test.ts > formatOrphanReapRecord renders one scalar-only line per reap outcome
      > leaks no pid, no pid list and no path into any outcome's value
 AssertionError: expected 'kind=reap pid=443921 exit=0 killed=2 …' not to contain '443921'
      Tests  1 failed | 112 passed (113)
```

**Restored, verified by checksum:**

```
9b3574de8d9c8ea063b2390b4f62baced5fdbdaaa98ef9650182f72850b07037  kill-plan.ts.bak
9b3574de8d9c8ea063b2390b4f62baced5fdbdaaa98ef9650182f72850b07037  packages/backend/src/kill-plan.ts
      Tests  113 passed (113)
```

### RED INPUT, DEMONSTRATED (collapsed reasons)

`scan-stale` was made to render as `scan-failed`.

**Under the mutation:**

```
     × renders pairwise-distinct strings across the whole no-op reason union
     × renders a readable, non-empty value naming the reason when the reap errored
 AssertionError: expected 4 to be 5 // Object.is equality
 AssertionError: expected 'kind=noop reason=scan-failed exit=2 k…' to contain 'scan-stale'
      Tests  2 failed | 111 passed (113)
```

**Restored, verified by checksum:** same SHA-256 as above, `113 passed (113)`.

### Gates

`pnpm -r typecheck` exit **0**. `pnpm lint` exit **0**. `npx vitest run` **725 passed | 9 skipped
(734)** at the end of task 1, above the 718/9/727 baseline in every column with zero failures.
Zero files under `packages/frontend`, zero under `packages/shared`.

---

## Task 2 — the census that fails closed in both directions

`index.source.test.ts`: **63 → 67** cases, all passing. The existing reap census
(*wires the orphan reap at every counted site and nowhere else*, **11** cases) and the mode census
(*states an explicit mode at every writeFile but the one named exemption*, **3** cases) both still
pass with their original counts.

### RED INPUT, DEMONSTRATED (direction one)

The `gate-closed` recording call was deleted from `reapSessionOrphansIfIdle`.

```
     × pairs a recording call with every outcome log line, function by function
     ✓ records a reap outcome from nowhere except the functions that produce one
 AssertionError: reapSessionOrphansIfIdle logs 1 reap outcome(s) but records 0 of them —
   every outcome the console reports must also reach lastOrphanReap: expected +0 to be 1
      Tests  1 failed | 66 passed (67)
```

The failure **names the enclosing function**, which is why the census enumerates per function
rather than counting file-wide.

**Restored:** `76d6c18e…` on both backup and target, `67 passed (67)`.

### RED INPUT, DEMONSTRATED (direction two)

A `recordOrphanReapOutcome({ kind: "plan-refused", … })` call was added to
`getMcpSessionDirName`, a function that produces no reap outcome.

```
     × records a reap outcome from nowhere except the functions that produce one
 AssertionError: recordOrphanReapOutcome( is called from getMcpSessionDirName (1 call(s)) —
   a function that produces no reap outcome, so lastOrphanReap would report an outcome that
   never happened: expected [ 'getMcpSessionDirName (1 call(s))' ] to deeply equal []
      Tests  1 failed | 66 passed (67)
```

**Restored:** `76d6c18e…`, `67 passed (67)`.

### RED INPUT, DEMONSTRATED (comment-insensitivity — ledger entry 18 reproduced on demand)

The census was temporarily re-pointed at the RAW source (11 `code` references → `indexSource`)
and **one comment line** was added to `getMcpSessionDirName`:

```
  // SCRATCH: mentions recordOrphanReapOutcome( in a comment and nothing else.
```

The count moved on a change with no behaviour in it at all:

```
RAW      recordOrphanReapOutcome( occurrences: 6
STRIPPED recordOrphanReapOutcome( occurrences: 5

     × records a reap outcome from nowhere except the functions that produce one
 AssertionError: recordOrphanReapOutcome( is called from getMcpSessionDirName (1 call(s)) …
      Tests  1 failed | 66 passed (67)
```

The comment-stripping was then restored **with the identical comment still in `index.ts`**:

```
93aafef3…  index.source.test.ts.bak
93aafef3…  packages/backend/src/index.source.test.ts
3786:  // SCRATCH: mentions recordOrphanReapOutcome( in a comment and nothing else.
      Tests  67 passed (67)
```

Every count unmoved. The comment was then removed and `index.ts` returned to `76d6c18e…`,
byte-identical to its pre-demonstration state.

---

## Task 3 — the probe patch, its control, and the spike procedure

### The apply / type-check / build transcript

```
$ bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh
== step 0: detached scratch worktree at 68199fa ==
   worktree: /var/folders/05/485xn5t96tqcmngzrsd8rh7c0000gn/T//drift-a1-probe-gauSpr
== step 1: apply a1-probe-fix.patch ==
Checking patch packages/backend/src/index.ts...
Applied patch packages/backend/src/index.ts cleanly.
   applied
== step 1b: carry in the HEAD helpers the patch calls ==
   carried in: kill-plan.ts
   carried in: platform.ts
== step 2: install dependencies (frozen lockfile, pnpm store hard-links) ==
   installed
== step 3: type-check the patched source ==
   backend type-check: pass
== step 4: build ==
   built: dist/plugin_package — 5 files, 2545673 bytes
   built: dist/plugin_package.zip — 2546633 bytes

verify-a1-patch.sh: PASS (applies at 68199fa, type-checks, builds)

GREEN_RUN_EXIT=0
```

**Package size: `dist/plugin_package` = 5 files / 2,545,673 bytes; `dist/plugin_package.zip` =
2,546,633 bytes.**

### The control caught a real incompatibility on its first run

This is the part worth keeping. The first run failed at step 3:

```
src/index.ts(608,24): error TS2345: Argument of type '{ env: …; platform: Platform | undefined; }'
  is not assignable to parameter of type '{ …; systemRootFallback: string; }'.
src/index.ts(1542,45): error TS2345: … Property 'systemRootFallback' is missing …
FAIL [step 3] the patched packages/backend/src/index.ts does not type-check
```

HEAD's `platform.ts` — which has to travel with the patch, because HEAD's `kill-plan.ts` imports
`resolveWindowsSystemBinary` and the historical `platform.ts` does not export it — made
`systemRootFallback` a REQUIRED member of `selectComspec` and `getWhichCommand` (G-01), so every
call site must state an answer. The two historical call sites do not. Fixed inside the patch as a
**named section 4**, with `systemRootFallback: ""`, which `selectComspec`'s own comment records as
falling through to exactly the pre-G-01 last-resort behaviour 68199fa already had — and which is
moot in any case, since both are win32-only paths and the probe returns early on win32.

Had the plan only *described* the patch, this would have surfaced on the maintainer's machine an
hour into a hardware session.

### RED INPUT, DEMONSTRATED (corrupted hunk) — with the first attempt recorded rather than hidden

**The first construction did not work, and that matters.** Corrupting a hunk's *offset*
(`@@ -589,7` → `@@ -1489,7`) was **absorbed silently** — `git apply` treats offsets as advisory and
re-locates hunks by context, so the corrupted patch applied cleanly, type-checked and built, and
the control reported PASS. A mutation that no-ops looks exactly like a control that does not
catch it, so it is recorded here rather than quietly replaced.

The structural corruption a hunk header can carry is its **line count**:

```
CORRUPTED: '@@ -589,7 +605,25 @@' -> '@@ -589,9 +605,25 @@'  (declared old-side length 7 -> 9)

$ bash verify-a1-patch.sh "" …/a1-probe-fix.CORRUPT.patch
== step 0: detached scratch worktree at 68199fa ==
   worktree: /var/folders/…/drift-a1-probe-oMTjcF
== step 1: apply a1-probe-fix.CORRUPT.patch ==
error: corrupt patch at …/a1-probe-fix.CORRUPT.patch:146
FAIL [step 1] the patch does not apply to packages/backend/src/index.ts at 68199fa

CORRUPT_RUN_EXIT=1
```

**The scratch worktree was still removed on the failure path:**

```
$ git worktree list
/Users/six2dez/Tools/drift  af2a1ff [main]
```

The real patch was untouched throughout — SHA-256 `4566dc0d…` before and after, against the
corrupted copy's `cbdb35ce…`.

### Main tree untouched

```
$ git status --porcelain packages/    -> 0 lines
$ git worktree list                    -> only /Users/six2dez/Tools/drift
$ npx vitest run                       -> 729 passed | 9 skipped (738)
```

### The verdict hunk — no runtime kill primitive on the liveness path

```diff
+    const probePlan = buildLivenessProbePlan({
+      pid: grandchildPid,
+      platform: host?.platform,
+    });
+    if (probePlan.kind === "none") {
+      spikeDetachedGroupKill = formatSpikeVerdict({
+        verdict: "inconclusive",
+        reason: "unusable-pid",
+      });
+    } else {
+      const probeStartedAt = Date.now();
+      const probe = await spawnAndWait(probePlan.file, probePlan.args, {
+        windowsVerbatimArguments: probePlan.windowsVerbatimArguments,
+      });
+      spikeDetachedGroupKill = formatSpikeVerdict(
+        classifyLivenessObservation({
+          spawnThrew: !probe.spawned,
+          exitCode: probe.spawned ? probe.code : undefined,
+          timedOut: Date.now() - probeStartedAt > SPIKE_PROBE_BUDGET_MS,
+          stdout: probe.stdout,
+          pid: grandchildPid,
+        }),
+      );
+    }
-      const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false;
-      spikeDetachedGroupKill = alive
-        ? "grandchild-survived (detached NOT honoured)"
-        : "grandchild-died (detached honoured)";
```

`spawnThrew: !probe.spawned` is load-bearing and is commented as such in the patch:
`spawnAndWait` resolves a **synthetic `code: 1`** for a spawn that threw, which is byte-identical
to `ps`'s documented "no process matched" — reading the code alone would turn an unspawnable
enumerator into "the grandchild is gone", which is gap 1 rebuilt out of a different operator.

The **synchronous-throw guard around the fixture spawn survives** in the patched source
(`try { … spawnDetached(…) … } catch (e) { return { …, spikeDetachedGroupKill: \`error: …\` } }`,
at patched lines 5053–5079). Only the *verdict's* own try/catch was removed, and it is now
unnecessary rather than merely absent: `buildLivenessProbePlan`, `classifyLivenessObservation` and
`formatSpikeVerdict` are pure, and `spawnAndWait` never rejects.

### The cleanup hunk — a real leak, fixed

```diff
+  for (const pid of [parentPid, grandchildPid]) {
+    if (pid === undefined) continue;
+    const killPlan = buildOrphanKillPlan({ pid, platform: host?.platform });
+    if (killPlan.kind === "none") continue;
+    await spawnAndWait(killPlan.file, killPlan.args, {
+      windowsVerbatimArguments: killPlan.windowsVerbatimArguments,
+    });
+  }
-    try {
-      signalRef.process?.kill?.(pid, "SIGKILL");
-    } catch {
-    }
```

Unconditional, across every exit path including the inconclusive and error arms — the loop sits
below all of them, unchanged in position. On the sandbox the old form was a silent no-op, which
is why the 2026-08-27 run left both fixtures running and every further diagnostics call would
have leaked two more (T-08-76).

### The new step 2 outcome list, quoted in full

> - `spikeDetachedGroupKill` — **this is A1.** Under the PATCHED probe there are **exactly three**
>   outcomes, and the third is a first-class RESULT rather than a halt. The old list enumerated two
>   verdicts plus three halt values; that shape is what let a non-answer be filed as an answer.
>   - `grandchild-survived (detached NOT honoured)` → **A1 FALSIFIED.** The group signal does not
>     reach a detached grandchild on this runtime; the phase's POSIX mechanism does not hold.
>     **STOP** and re-plan.
>   - `grandchild-died (detached honoured)` → **A1 CONFIRMED.** `detached: true` really does put
>     the fixture in its own process group and the group signal reaches the grandchild.
>   - `inconclusive: <reason> — the probe could not tell whether the target is still in the process
>     table` → **A1 stays OPEN.** **RECORD IT VERBATIM, reason token and all.** Do NOT retry it,
>     do NOT average it against another run, and do NOT read it as either verdict above. `<reason>`
>     is one of `enumerator-unavailable`, `probe-timeout`, `no-exit-code`,
>     `unrecognised-exit-code`, `unusable-pid` or `contradictory-output`, and it names *which*
>     question the instrument could not answer. `enumerator-unavailable` in particular means
>     Caido's sandbox refused to spawn `ps` — which is itself the reading step 5 asks for, arriving
>     a second way.
>
>   Coalescing that third outcome into either of the other two is the exact defect that produced
>   the withdrawn 2026-08-27 reading, so `formatSpikeVerdict` (`kill-plan.ts`) shares no verdict
>   word between it and them — no "died", no "survived", no "honoured". The first two strings are
>   byte-identical to what the 2026-08-27 run printed, deliberately, so a re-run is COMPARABLE with
>   the reading that was withdrawn rather than being a second measurement of a different thing.

`08-SPIKE.md` also gained an **empty re-run results table** (every cell `not recorded`, in the
Control table's own honest-absence form) and **step 5**, which reads `lastOrphanReap` from the
diagnostics panel and maps each possible value to what it means. The **A1, A6 and Control tables
have zero diff hunks** in this task — `git diff -U0 -- 08-SPIKE.md | grep '^[-+]| '` returns only
`+` rows, all of them belonging to the two new tables.

---

## The gate goes green here

`bash .planning/phases/08-process-lifecycle/verdict-gate.sh` **exits 0** — for the first time
since `08-VERIFICATION.md` was written. This is the only plan in the gap-closure set entitled to
assert it, because it is the only one that `depends_on` all four carrier-editing plans; the three
wave-7 carriers ran in parallel and could each only assert the absence of their own files. And
because this plan's own task 3 edits `08-SPIKE.md`, which ARM A scans, the green also proves this
plan reintroduced nothing.

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
   ARM A: pass (0 live favourable-A1 verdicts and 0 unretracted readings outside the excluded historical-record class)
== ARM B: positive content on the known carriers ==
   ARM B: pass (8 A6 carriers carry FALSIFIED and 2026-08-27; 8 A1 carriers carry RETRACTED and 2026-08-28)
== ARM C: the dated *-SUMMARY.md class is unmodified ==
   ARM C: pass (10 pinned blobs match HEAD; 14 summaries on disk, 0 unaccounted for; working tree clean)

verdict-gate.sh: PASS (ARM A, ARM B, ARM C)

-- ARM headers (must be 3): 3
-- FAIL lines (must be 0): 0
-- EXIT: 0
```

### RED INPUT, RE-DEMONSTRATED AT GREEN

A gate that has only ever been seen green is not yet a gate. One **live, non-block-quoted**
favourable-verdict line was injected into a scratch file under `.planning/`:

```
.planning/gate-red-input-08-15.md:3:A1 closed favourably on the 2026-08-27 hardware run.
```

**The gate FAILED, naming the file:**

```
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
FAIL [ARM A/A1-STALE] .planning/gate-red-input-08-15.md states A1's WITHDRAWN favourable verdict
  on 1 live line(s) (outside any block quote). A1's reading was retracted 2026-08-28; the verdict
  is OPEN.
== ARM B: positive content on the known carriers ==
== ARM C: the dated *-SUMMARY.md class is unmodified ==

verdict-gate.sh: FAIL

-- ARM headers (must still be 3, or the gate died rather than failed): 3
-- lines naming the fixture (must be >=1): 1
-- EXIT: 1
```

The three `== ARM ` headers are asserted against the **same capture** as the file count, per
08-13's finding on the instrument itself: a gate sabotaged into printing zero bytes passes a
naive absence check and fails this one.

**The fixture was removed and the gate RETURNED to exit 0:**

```
fixture removed (no such file)
== ARM A: repo-wide discovery (.planning/ and packages/, exclusion-list) ==
   ARM A: pass (0 live favourable-A1 verdicts and 0 unretracted readings outside the excluded historical-record class)
== ARM B: positive content on the known carriers ==
   ARM B: pass (8 A6 carriers carry FALSIFIED and 2026-08-27; 8 A1 carriers carry RETRACTED and 2026-08-28)
== ARM C: the dated *-SUMMARY.md class is unmodified ==
   ARM C: pass (10 pinned blobs match HEAD; 14 summaries on disk, 0 unaccounted for; working tree clean)

verdict-gate.sh: PASS (ARM A, ARM B, ARM C)

-- ARM headers (must be 3): 3
-- FAIL lines (must be 0): 0
-- lines naming the fixture (must be 0): 0
-- EXIT: 0
```

---

## Deviations from Plan

### 1. [Rule 3 — Blocking] The `lastOrphanReap` ≥ 5 count measures 4, and was not padded

- **Found during:** Task 1, at the acceptance-criterion measurement.
- **Issue:** The criterion asks for a comment-stripped `grep -c 'lastOrphanReap'` of ≥ 5 in
  `index.ts` after the edit. The natural implementation the plan's own `<action>` describes —
  one declaration, one writer, one surfaced key — yields exactly **4** occupied lines and 4
  occurrences.
- **Fix:** Reported the measured number rather than manufacturing a fifth occurrence. Every route
  to 5 was rejected as padding: a second writer is forbidden by the task-2 census, a second
  surfaced key is forbidden by the same census, and replacing the `??` idiom with a three-line
  ternary contradicts the plan's explicit instruction to use the neighbouring `?? "none (…)"`
  form. The *mechanism* count (`recordOrphanReapOutcome`, 5 comment-stripped lines) does clear the
  floor, and is stated above alongside the 4.
- **Files modified:** none (a measurement, not a code change).
- **Verification:** both counts pasted above, taken over the stripped stream.
- **Commit:** `5e878c5`.

### 2. [Rule 1 — Bug] Hoisting the scan age retired an existing pinned assertion

- **Found during:** Task 1, first full-suite run after wiring `index.ts`.
- **Issue:** The record needs the scan's age, so the first implementation hoisted
  `const scanAgeMs = Date.now() - scanStartedAt;` above the classifier call and passed the local
  to both. `index.source.test.ts` § *bounds the scan with ONE constant* pins the **literal string**
  `scanAgeMs: Date.now() - scanStartedAt,` — the identity that keeps the wall-clock freshness bound
  from becoming stricter than the timer. The hoist turned it red:
  `AssertionError: expected '\n  if (plan.kind === "none") {\n    …' to contain 'scanAgeMs: Date.now() - scanStartedAt,'`.
- **Fix:** Reverted the hoist. The classifier keeps its inline read exactly as pinned, and the
  record takes its own read (`settledAgeMs`) immediately after the classifier call, off the same
  `scanStartedAt` origin — the same interval measured microseconds later, not a second
  measurement of a different one. The reason is written at the site so a future edit does not
  "tidy" it back. **The existing assertion was not edited to accommodate the new code.**
- **Files modified:** `packages/backend/src/index.ts`.
- **Verification:** `729 passed | 9 skipped (738)`, zero failures.
- **Commit:** `5e878c5`.

### 3. [Rule 3 — Blocking] The patch needed two compatibility edits it could not have been written without running

- **Found during:** Task 3, first run of `verify-a1-patch.sh`.
- **Issue:** Two `TS2345` errors at step 3 (transcript above). HEAD's `platform.ts` must travel
  with the patch, and it made `systemRootFallback` a required member at two call sites the
  historical `index.ts` does not satisfy.
- **Fix:** Added both to the patch as an explicitly **named section 4** in its header, with
  `systemRootFallback: ""` — documented in `selectComspec` itself as reproducing the pre-G-01
  behaviour 68199fa already had, and moot for a POSIX-only probe. Named rather than smuggled in,
  because the patch header claims "three things, and only these three" and that claim has to stay
  true.
- **Files modified:** `.planning/phases/08-process-lifecycle/a1-probe-fix.patch`.
- **Verification:** re-run exits 0 through all four steps.
- **Commit:** `4bc6e33`.

### 4. [Rule 1 — Bug] The first corrupted-hunk red input was a silent no-op

- **Found during:** Task 3, constructing the patch red input.
- **Issue:** Corrupting the hunk *offset* produced a patch that applied, type-checked and built —
  `git apply` re-locates hunks by context and treats offsets as advisory. The control reported
  PASS, which would have read as "the control does not catch a corrupted patch".
- **Fix:** Reconstructed the mutation against the hunk's declared **line count**, which is
  structural; `git apply` then refuses with `error: corrupt patch at …:146` and the control exits
  1. Both attempts are recorded above rather than the failed one being deleted.
- **Files modified:** none (a scratch copy only; the committed patch's SHA-256 is unchanged
  throughout).
- **Verification:** `CORRUPT_RUN_EXIT=1`, worktree removed, real patch `4566dc0d…` unchanged.
- **Commit:** `4bc6e33`.

**Total deviations:** 4 auto-fixed (2 × Rule 1, 2 × Rule 3). **Impact:** one acceptance criterion
under-measured and reported honestly rather than satisfied by padding; three defects caught by
running things that this plan could have got away with only describing.

## Threat Flags

None. The two threats this plan owns (`T-08-75` information disclosure via the diagnostics value,
`T-08-76` process leak if the probe reached HEAD) are both mitigated as their register rows
describe, and no new security-relevant surface was introduced: the backend gained one read-only
diagnostics key built from closed unions and scalar counts, and two files under `.planning/`.

## Known Stubs

None. No stub values, no placeholder text, no skipped tests added (`t.skip` / `it.skip` /
`test.todo` count in both touched test files: 0), and no `<verify>` left unrun.

## Follow-ups inherited, not closed here

- **`SUMMARY_KNOWN_UNPINNED` must return to empty when this round closes.** Plan 08-11 recorded
  that the seven gap-closure summaries (08-11 … 08-17, this file among them) are protected only by
  ARM C's working-tree diff check and not yet by content pins. Promotion to
  `git rev-parse HEAD:<path>` blob hashes is the closing action for the round, and is not this
  plan's scope.
- **The two hardware readings are still untaken.** That is the point of this plan rather than a
  gap in it: A1's re-run (plan 08-17, using `verify-a1-patch.sh` to produce the build) and the
  `lastOrphanReap` glance (step 5, one cancel and one Copy-diagnostics) are now both cheap and
  mechanical. The re-run table in `08-SPIKE.md` is empty and says so.

## Next Phase Readiness

Ready for **08-16**. `verdict-gate.sh` is green and both 08-16 and 08-17 re-assert exit 0
downstream as regression checks on the green established here.

## Self-Check: PASSED

Created files, verified on disk:

```
FOUND: .planning/phases/08-process-lifecycle/a1-probe-fix.patch
FOUND: .planning/phases/08-process-lifecycle/verify-a1-patch.sh
```

Commits, verified in `git log`:

```
FOUND: 0b7f8ed  test(08-15): add failing cases for the orphan-reap diagnostics formatter
FOUND: 5e878c5  feat(08-15): surface the orphan reap's last outcome as a diagnostics key (UD-01)
FOUND: af2a1ff  test(08-15): census that fails closed when a reap arm forgets to record
FOUND: 4bc6e33  docs(08-15): ship the fixed A1 probe as a verified patch, rewrite the spike procedure
```

Plan-level verification re-run at close: `npx vitest run` 729 passed / 9 skipped (738), zero
failures; `pnpm -r typecheck` exit 0; `pnpm lint` exit 0;
`bash .planning/phases/08-process-lifecycle/verify-a1-patch.sh` exit 0;
`bash .planning/phases/08-process-lifecycle/verdict-gate.sh` exit 0;
`git status --porcelain packages/` empty; zero files under `packages/frontend` or
`packages/shared` across all four commits. Six `RED INPUT, DEMONSTRATED` criteria, six captured
failures and six captured restorations.
