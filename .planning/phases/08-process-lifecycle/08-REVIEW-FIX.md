---
phase: 08-process-lifecycle
fixed_at: 2026-08-24T21:58:00Z
review_path: .planning/phases/08-process-lifecycle/08-REVIEW.md
review_commit: 612b330
iteration: 1
scope: critical_warning
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-08-24T21:58:00Z
**Source review:** `.planning/phases/08-process-lifecycle/08-REVIEW.md` (committed at `612b330`)
**Iteration:** 1
**Scope:** Critical + Warning. Info findings out of scope; IN-01 was fixed anyway because CR-02's
edit rewrote the exact comments it names, and leaving a comment the fix proves false directly
adjacent to the fix would have been worse than the finding.

**Summary:**

| | |
|---|---|
| Findings in scope | 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04) |
| Fixed | 6 |
| Skipped | 0 |
| Applied as suggested | 3 (WR-01 variant b, WR-02, WR-04) |
| Applied differently, with reason | 3 (CR-01, CR-02, WR-03) |

**Gates, re-run after every commit and again at the end:**

| Gate | Baseline (`612b330`) | Now |
|---|---|---|
| `pnpm exec vitest run` | 578 total (569 passed / 9 skipped) | **602 total (593 passed / 9 skipped)** — +24, **zero removed** |
| `pnpm -r typecheck` | 0 | **0** |
| `pnpm lint` (`--max-warnings 0`) | 0 | **0** |
| `grep -rn 'shell: *true' packages/` | 0 | **0** |
| banned kill spelling, comment-filtered | 0 | **0** |
| `grep -c 'await killTree'` | 0 | **0** |
| SC-5 frontend cancel tripwire (`git diff 1b3fde6 -- ChatView.vue ChatView.cancel.test.ts`) | empty | **empty** |

`.planning/PROJECT.md` (modified, predates this phase) and `.planning/milestone.lock` (untracked)
were left alone and appear in no commit.

**Verification note.** All gates ran in the **main checkout** (`workflow.use_worktrees` is `false`
in `.planning/config.json`; work was sequential on `main` per the fix brief). The numbers above are
reproducible from the tree as it stands.

---

## Fixed Issues

### CR-01 — the single-pid rung terminated the win32 target before `taskkill /t` could walk it

**Commit:** `151af8f`
**Files:** `packages/backend/src/index.ts`, `packages/backend/src/index.source.test.ts`

**Verified before changing anything.** Read `killTree` at source; the pre-kill was unconditional and
its comment justified it for POSIX only, exactly as reported. Cross-checked the mechanism against
`kill-plan.ts:163-168`, which already relies on the same fact ("LLRT maps every signal name to one
`TerminateProcess`") to refuse a graceful win32 rung, and against `08-RESEARCH.md` § Pitfall 4,
which independently recommends *"on win32 issue one `taskkill /t /f` and drop the second rung, or
make the rung a re-issue of the same plan rather than a `proc.kill`"*. The finding holds.

**Applied.** The rung is guarded to non-win32 — **not deleted**. It is recorded decision OQ-2, kept
as defence against assumption A1, which `08-SPIKE.md` still records as **OPEN — not measured**. The
OQ-2 comment and its A1 rationale are intact; a new paragraph states why win32 is excluded (A1 is a
POSIX assumption — it is about `process_group(0)`, an option the win32 arm never takes — so the rung
was never A1 defence there).

Added `killWin32Leaf`, a win32-only forceful signal called from `killTree`'s two spawn-failure arms
(the `error` event and the synchronous-throw `catch`). Without it, guarding the preamble would leave
a Windows host that cannot spawn `taskkill.exe` at all with **no killer whatsoever** — worse than
what shipped. Written as a named function so the census has one site to enumerate rather than two
identical ones.

I did **not** take the review's suggested reordering of `buildKillTreePlan` above the pre-kill. The
plan builder is pure, so the reordering buys no behaviour; it exists only to support the suggested
positional gate. The gate below asserts the guard directly, which is the fact that matters.

**How I confirmed the POSIX path is unchanged.** Three independent ways:

1. **Textual.** `git diff` on the signal statement shows only re-indentation:
   `proc.kill(rung === "kill" ? "SIGKILL" : "SIGTERM");` is byte-identical to the line it replaces,
   in the same position relative to `buildKillTreePlan` and the spawn. On any non-win32 platform the
   guard evaluates true and the statement executes exactly as before.
2. **Reachability.** The only other new statements are two `killWin32Leaf(proc)` calls, and
   `killWin32Leaf`'s first line is `if (host?.platform !== "win32") return;` — a no-op off win32,
   asserted by the gate.
3. **Behavioural.** `kill-tree.posix.test.ts` — the phase's real POSIX proof, with its falsifying
   control — is green (2/2), and the full suite is green with zero tests removed.

**Gate added** (`index.source.test.ts`, 5 assertions): the guard string precedes `proc.kill(` inside
`killTree`'s body; exactly one direct signal in that body; both fallback arms present;
`killWin32Leaf` scoped to win32 in its own declaration. **Verified falsifiable**: removing the
platform guard turns *"puts the single-pid rung behind a non-win32 guard"* red (measured), and the
guard was restored and re-measured green.

The `proc.kill(` census moved **3 → 4** with its enumeration updated in the same edit, per that
file's own rule.

---

### CR-02 — `isPidAlive` proves liveness, not identity, so T-08-04 was not closed

**Commit:** `b969d23`
**Files:** `packages/backend/src/kill-plan.ts`, `kill-plan.test.ts`, `index.ts`,
`index.source.test.ts`, `08-SECURITY.md`

**Verified.** The finding's reasoning holds exactly: signal 0 reports a reassigned pid as alive, so
the guard discriminated only the harmless case; and `killTree` does re-read `proc.pid`, so the
capture-before-schedule control is worth nothing on its own.

**The review's suggested fix does not compile here, and that is the substantive finding of this
fix pass.** `08-REVIEW.md` CR-02 proposes:

```ts
if (proc.exitCode !== null || proc.signalCode !== null) return;
```

`pnpm -r typecheck` rejects it:

```
src/index.ts(4704,20): error TS2339: Property 'exitCode' does not exist on type 'ChildProcessWithoutNullStreams'.
```

The ambient type this package compiles against is Caido's `@caido/quickjs-types`
`child_process.d.ts`, which declares `stdin`/`stdout`/`stderr`/`pid`/`kill` and the emitter surface
and **no exit state at all**. That matches LLRT's own class (`caido/dependency-llrt` branch `caido`,
`modules/llrt_child_process/src/lib.rs`: a `#[qjs(get)] pid` getter and a `kill` method, nothing
else; the exit code and signal are delivered only as `exit`/`close` event arguments).

Had the ambient type been widened to make it compile, that spelling would have shipped a **second**
instance of this phase's own defect class: under LLRT both reads are `undefined`, and
`undefined !== null` is **`true`**, so the guard would have returned early for every pid on every
real install — silently disabling the deferred forceful rung on **both** platforms while staying
green on all five CI legs. Finding L-4 verbatim, plus a CMP-01 POSIX regression.

**Applied instead.** `hasTrackedProcessExited` in `kill-plan.ts` — a pure decision over three
injected scalars, in the same D-P4 shape as `buildKillTreePlan`:

- `observedExitEvent` — the `exit` event the handle itself emitted, recorded by the caller. Only
  the process we spawned can fire it. It is the only identity source that survives under LLRT, and
  best-effort there, since Caido's runtime does not reliably deliver `child_process` callbacks while
  an RPC is awaiting.
- `exitCode` / `signalCode` — Node's properties, read at one cast-carrying boundary
  (`readHandleExitState`) and treated as **`undefined` ⇒ not proven exited**, which is what makes
  the LLRT arm safe rather than catastrophic. The cast is documented as deliberate, with an explicit
  "do not widen the ambient type" note.

Both rungs check identity first, liveness second. `isPidAlive` is kept, not replaced — under LLRT it
is the only answer left. Every arm is strictly subtractive: the guard skips a kill on evidence,
never on ignorance, so it can neither add a kill nor disable the rung.

The caller-side exit flags differ by site, on purpose: `requestGracefulShutdown` uses a closure flag
set by `sendCliMessage`'s existing `close`/`exit` handlers (it is reachable from four call sites and
can fire repeatedly in one turn, so a listener per schedule would accumulate on the emitter), while
`cancelCliMessage` registers one `once("exit")` (at most one per session, because
`activeProcesses.delete` runs immediately after).

**Accepted residual, recorded in `08-SECURITY.md` rather than papered over:** on POSIX a process
group outlives its leader, so a handle that has exited while group members survive skips a deferred
group kill that would still have worked. This was **already true** of the `isPidAlive` guard as
shipped (a dead leader answers signal 0 with `false`), so the correction does not widen it.

**Gates added:** 6 literal-input cases in `kill-plan.test.ts` including the LLRT no-exit-state arm
and a falsy-zero exit code; 5 positional/census assertions in `index.source.test.ts` that also ban
the inline `proc.exitCode !==` spelling outright. **Verified falsifiable** twice: simplifying
`hasTrackedProcessExited`'s body back to `exitCode !== null` turns 2 cases red (measured, reverted);
swapping the two guard statements in `cancelCliMessage` turns the ordering assertion red (measured,
reverted).

`08-SECURITY.md` T-08-04 is amended in place and a marked § *T-08-04 — the correction* records what
the row claimed, why neither control closed it, why the suggested fix does not compile, and what
closes it now.

**Also fixed here (IN-01, out of scope but adjacent):** the two comments claiming the pid is "never
re-read from `proc` inside it" on the line before `killTree` re-reads it. CR-02's edit rewrote those
exact comments; leaving a claim the fix disproves next to the fix was not defensible.

---

### WR-01 — `cleanupMcpRuntime`'s kill loop reaches twelve callers, not two

**Commit:** `a4cdbdf`
**Files:** `packages/backend/src/index.ts`, `index.source.test.ts`, `08-SECURITY.md`

**Verified.** `grep -n "cleanupMcpRuntime("` returns the twelve sites the review lists, and
`refreshActiveMcpRuntime`'s own comment at `:1876-1878` confirms the token path is reached from the
frontend keep-alive. The finding holds in full, including the compounding half: `activeProcesses`
has already been deleted from, so a later `cancelCliMessage` finds `proc === undefined` and returns
`ok` without publishing a `stopped` state.

**Applied variant (b) — kept the loop, made it honest.** Variant (a), narrowing to the teardown
callers, was **rejected on inspection**: every one of the other ten paths continues into the
temp-directory removal below the loop, so narrowing would remove the env-source documents that
carried `CAIDO_TOKEN` while a child that read them is still running. That is SC-4 inverted — it
trades a visible defect for an invisible one. The reasoning is written into the source comment so a
future narrowing reads as the regression it would be.

Each killed session now gets a `stopped` session-state event (`reasonCode: "closed"`,
`mcpAttached: false`) and its `sessionWatchdogs` entry dropped, mirroring `closeCliSession`. The
comment enumerates all twelve callers by line, grouped by what actually triggers them.

**Gate added:** 3 assertions pinning the loop, the published state and the watchdog delete.
`08-SECURITY.md` T-08-12 amended in place with a marked § *T-08-12 — the caller enumeration was
wrong*.

---

### WR-02 — the LLRT trap gate could not see the `kill` indirection this phase introduced

**Commit:** `b0a91e4`
**File:** `packages/backend/src/index.source.test.ts`

**Verified.** Measured the old needle against the current stripped source plus the reflective
negative spelling: `/process\s*\.\s*kill\s*\(\s*-/` does not match
`killRef.call(processRef.process, -pid, "SIGTERM")`. Blind spot confirmed.

**Applied — widened, and not merely doubled.** Two alternations: any receiver's `.kill( -`, and the
reflective `kill*.call(…, -` / `.apply(…, -)` form. Measured against the real source: `null` (no
false positives), and against both attack spellings: matched.

The finding asks that the control be genuinely widened rather than a second narrow one added, so
three things beyond the regex:

1. **A positive match test against synthetic text** for both arms, plus a not-match on the
   positive-pid idiom that legitimately ships. A needle only ever asserted *absent* can rot into one
   matching nothing and nobody would notice.
2. **A census of every reference that takes the kill primitive as a value** rather than calling it
   (`/\.\s*kill\b(?!\s*\()/`), currently exactly **1** — `isPidAlive`'s `killRef`. This is the
   generalisation the regex cannot make: a negative pid bound to a variable first, a computed member
   access, `Reflect.apply`, or a differently-named callee all pass the regex, but every one of them
   must first bind the primitive as a value, and that trips the count.
3. **The blind spots written into the comment**, named individually, rather than left implied.

**Verified falsifiable:** appending `killRef.call(processRef.process, -pid, "SIGTERM")` to
`index.ts` turns the gate red (measured), and the probe line was removed and the file confirmed
clean against the index. The shell companion scan still measures **0**.

---

### WR-03 — `isPidAlive` is an untested decision function with an asymmetric failure mode

**Commit:** `4859039`
**Files:** `packages/backend/src/index.ts`, `index.source.test.ts`, `08-SECURITY.md`

**Verified — and the real failure mode is worse than the one hypothesised.** The review reasons
that LLRT's `process.kill` "may not accept a *numeric* signal `0`". Reading the source
(`caido/dependency-llrt` branch `caido`, `llrt_utils/src/signals.rs`), it does accept it —
`parse_signal` handles a JS number on both unix and windows. What it does instead is convert the
missing-pid case to a **return value**: `kill` maps ESRCH (unix) / a failed `OpenProcess` (windows)
at signal 0 to `Ok(false)`. Node's `process.kill(pid, 0)` **throws** ESRCH.

The shipped body returned `true` unless the call threw. So under Caido it reported **every pid as
alive**, and the guard cited as T-08-04's evidence never skipped anything on any real install —
while behaving correctly on all five CI legs. Same defect class as the negative-pid trap this phase
built a gate for, in the code sitting next to it.

A second runtime fact, needed for the calibration the review asks for: Node exposes `process.pid`;
LLRT's process module sets **`id`** (`process.set("id", std::process::id())`) and declares no `pid`
at all. The review's suggested `processRef.process?.pid` would be `undefined` under LLRT, so the
calibration would bail on every real install and the guard would stay inert there — safe, but
silently useless. Both spellings are read.

**Applied.** The body now (a) reads the primitive's result as well as catching it, (b) calibrates by
signalling a pid that must be alive — our own — so a throw *or* a `false` there means the **probe**
is unusable rather than the target dead, and (c) resolves every unknown toward "alive", keeping the
guard strictly subtractive relative to the unconditional rung that shipped in 0.1.0.

**Measured**, by transcribing the body into a scratch script and running it under Node plus an
LLRT-shaped stub (`index.ts` cannot be imported):

| Case | Result | Expected |
|---|---|---|
| self pid | `true` | `true` |
| unallocatable pid (2147483646) | `false` | `false` |
| genuinely reaped child | `false` | `false` |
| LLRT-shaped stub, self | `true` | `true` |
| LLRT-shaped stub, dead pid | `false` | `false` |
| **same case, OLD body** | **`true`** | — the defect |
| probe throws for every call | `true` | `true` (subtractive) |
| no self pid on the runtime | `true` | `true` (subtractive) |

**Gates added:** `isPidAlive(` = **3** is an assertion now rather than a one-time grep (the review's
specific ask), plus body assertions for the result read and the dual self-pid spelling, plus the
WR-02 positive companion extended to both reflective calls.

**One half of this finding not applied, stated plainly.** The decision is **not** moved into a pure
module. `isPidAlive` is a runtime read at its core; the interpretation left over after the read is
two comparisons; and the defect above was a *fact about LLRT*, not a logic error a pure test would
have caught without already knowing that fact. Splitting it would have added a module and moved the
untestable part unchanged. The compensating controls are the standing census, the three body
assertions, and the recorded measurement above.

---

### WR-04 — ROADMAP SC-1 still specified the bare-name `taskkill` spawn

**Commit:** `fb0200a`
**File:** `.planning/ROADMAP.md`

**Verified.** SC-1 read `spawn("taskkill", ["/pid", pid, "/T", "/F"])`. The shipped mechanism is
`<SystemRoot>\System32\taskkill.exe`, and `08-SECURITY.md` T-08-03 records the move as a *Spoofing /
EoP* decision. SC-1 as written was satisfied by the insecure form.

**Applied.** Amended in place, in the SC-2 amendment's voice and with its precedent citation
(Phase 5 SC-1, Phase 7 SC-2, `05-CONTEXT.md` D-02): names the absolute resolution, both env casings
and why both are read, the trailing-separator strip, `["/pid","<n>","/t","/f"]`,
`windowsVerbatimArguments: false`, the bare-name last resort and `DEFAULT_TASKKILL`, the T-08-03
pointer, and the location of the pid guard in `buildKillTreePlan`. States explicitly that the
original wording would not have flagged the insecure form's reintroduction.

---

## Skipped Issues

None. All six in-scope findings were applied; three were applied differently from the review's
suggestion, with the reason recorded above and in the relevant commit message.

## Info findings — disposition

Out of scope per the brief. Recorded here so the next reader does not have to re-derive it:

- **IN-01** — **fixed** as part of CR-02, because that edit rewrote the exact comments the finding
  names.
- **IN-02** — **not fixed.** `08-VALIDATION.md`'s SC-4 row says "before every `rm`"; the gate
  compares against the **first** `rm`. True at all three sites today. Recorded as a deliberate
  non-correction in `08-VALIDATION.md` § Corrections C5.
- **IN-03** — not fixed. The `detached` census counts `spawnWithEnv(`, not spawning.
- **IN-04** — not fixed. `createDeadPid()`'s reuse window in the never-executed win32 suite.

## Planning artifacts amended

All as **marked corrections**, in the `07-VALIDATION.md` style, never a silent overwrite:

| File | What | Commit |
|---|---|---|
| `08-SECURITY.md` | T-08-04 row + new § *T-08-04 — the correction* (CR-02, and WR-03's LLRT return-value fact) | `b969d23`, `4859039` |
| `08-SECURITY.md` | T-08-12 row + new § *T-08-12 — the caller enumeration was wrong* (WR-01) | `a4cdbdf` |
| `.planning/ROADMAP.md` | SC-1 amended in place (WR-04) | `fb0200a` |
| `08-VALIDATION.md` | T-08-14 / T-08-06 / T-08-09 rows + new § *Corrections C5* | `8ce7296` |

---

_Fixed: 2026-08-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
