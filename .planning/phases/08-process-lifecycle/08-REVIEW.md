---
phase: 08-process-lifecycle
reviewed: 2026-08-24T20:55:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - packages/backend/src/kill-plan.ts
  - packages/backend/src/kill-plan.test.ts
  - packages/backend/src/kill-tree.posix.test.ts
  - packages/backend/src/kill-tree.win32.test.ts
  - packages/backend/src/kill-tree.win32.gate.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/index.source.test.ts
  - .github/workflows/ci.yml
  - .planning/ROADMAP.md
  - CLAUDE.md
  - .planning/codebase/CONVENTIONS.md
  - .planning/phases/08-process-lifecycle/08-VALIDATION.md
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-08-24T20:55:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

`kill-plan.ts` is the strongest artifact in the phase: pure, single-import, every arm
reachable from literal inputs, the refusal branch asserted on all six platform/rung
combinations, and the POSIX behavioural suite carries a real falsifying control that I
re-ran and confirmed measures what it claims. `pnpm exec vitest run` is green at 578
(569 passed / 9 skipped) and `pnpm -r typecheck` is clean. The SC-4 statement ordering
was verified by reading the actual statements in `cleanupMcpRuntime`, `closeCliSession`
and `deleteChat` rather than by trusting the gate — it holds at all three. The banned
`process.kill(-pid, …)` spelling appears only in comments. I found no fourth
pass-by-accident gate of the kind the phase already caught three of: I re-implemented
`functionBody` against the real stripped source and measured every body it extracts
(`cleanupMcpRuntime` 21 lines, `closeCliSession` 27, `deleteChat` 23, `sendCliMessage`
810), and the `rm(` needle resolves to the intended `rm` call at every site.

The defects are all in the **glue**, not the plan builder — precisely the layer that
`index.ts` being un-importable leaves unverifiable. Two of them are load-bearing:

1. `killTree` fires a single-pid signal **before** it spawns the tree killer. On POSIX
   I measured that this is harmless (the group survives the leader's death). On win32 —
   the platform the whole milestone exists for — Node/LLRT implement that signal as an
   unconditional `TerminateProcess`, so `taskkill /t` is handed a pid whose process has
   already left the process table, and the deferred second rung then self-skips on its
   own `isPidAlive` guard.
2. The `isPidAlive` guard recorded in `08-SECURITY.md` as closing threat T-08-04
   (pid reassignment) checks pid *liveness*, which is exactly what a reassigned pid
   reports. I measured that `proc.pid` remains a valid number after the child is
   reaped under Node 20 on darwin, so `killTree`'s re-read of `proc.pid` inside the
   deferred timer does not save it either.

Neither is reachable by any test this repository can run, which is why both survived a
phase that otherwise gated itself unusually hard.

Out of scope per the brief and **not** re-reported: A1/A6 OPEN, the never-executed win32
suite and its empty exit-code slot, T-08-14's attestation-only closure, and the untracked
`.planning/milestone.lock`.

## Critical Issues

### CR-01: On win32, `killTree`'s single-pid rung terminates the target before `taskkill /t` can walk it

**File:** `packages/backend/src/index.ts:5039-5043` (the pre-kill), `5046-5052` (the plan), `5063` (the spawn)

**Issue:**
`killTree` runs, in this order:

```ts
const pid = proc.pid;                                     // :5029
try { proc.kill(rung === "kill" ? "SIGKILL" : "SIGTERM"); } catch {}   // :5041
const plan = buildKillTreePlan({ pid, platform: host?.platform, … });  // :5046
const killer = spawn(plan.file, plan.args, { … });                     // :5063
```

The comment above the pre-kill justifies it for **POSIX only** — "On POSIX this is the
behaviour that ships today, kept deliberately as defence against assumption A1". It says
nothing about win32, and the branch is unconditional.

On POSIX the ordering is safe, and I verified that rather than assuming it: I spawned a
`detached` parent with a child, `SIGKILL`ed the parent, awaited its `exit`, then ran
`kill -KILL -- -<pid>` — exit status **0**, because POSIX keeps a process-group ID
reserved until the last member leaves the group. So the group reference still resolves
after the leader dies.

Windows has no equivalent. Node's own documentation states that on Windows `'SIGTERM'`
and `'SIGKILL'` "will cause the unconditional termination of the target process"
(libuv's `uv__kill` calls `TerminateProcess` for `SIGTERM`/`SIGKILL`/`SIGINT`), and
`kill-plan.ts:163-168` already relies on exactly this fact when it refuses to build a
graceful win32 rung. So on Windows line :5041 **kills the tracked process synchronously**,
and `taskkill.exe /pid <n> /t /f` is then spawned milliseconds later against a pid whose
process has already been removed from the process table (the pid itself is still
reserved, because the runtime holds a handle, but a terminated process is not returned by
process enumeration). `taskkill` reports `ERROR: The process "<n>" not found.` and
terminates nothing — the `node mcp-server.mjs` grandchild carrying `CAIDO_TOKEN` survives,
which is LIF-01/LIF-02 unfixed on the one platform this milestone is about.

The second rung does not rescue it, and this is the part that makes the chain closed
rather than speculative. `requestGracefulShutdown` (`:4658`, `:4678`) and
`cancelCliMessage` (`:5101`, `:5114`) both guard the deferred forceful rung with
`isPidAlive(pid)`. After :5041 has already terminated the process, `isPidAlive` returns
`false` and both deferred rungs `return` without doing anything. So the full win32 cancel
sequence is: terminate the CLI leaf, no-op the tree kill, skip the escalation.

Concrete trigger: a Windows user clicks Stop on a streaming turn (`cancelCliMessage` →
`killTree(sdk, proc, "term")`), or a turn hits `processTimeoutSeconds`
(`killTree(sdk, proc, "kill")` at `:4650`).

Nothing in the suite can catch this. `kill-tree.win32.test.ts` calls
`buildKillTreePlan` and then `runToCompletion(plan.file, plan.args, …)` directly — it
never goes through `killTree`, so it exercises the argv against a **live** tree and would
stay green. `index.source.test.ts` counts `killTree(` and `proc.kill(` occurrences but
asserts nothing about their order inside `killTree`.

**Fix:** make the pre-kill POSIX-only — it is only ever justified as A1 defence, which is
a POSIX concern — and on win32 keep `proc.kill` as the *fallback* rather than the
*preamble*:

```ts
  const pid = proc.pid;
  const plan = buildKillTreePlan({ pid, platform: host?.platform, env: readParentEnv(), rung });

  // A1 defence, POSIX only: the group reference in the plan below names a group
  // that was never created if `detached` silently did nothing. A process group
  // outlives its dead leader (measured), so this is safe to send first here.
  // On win32 it is NOT: `proc.kill` is an unconditional TerminateProcess, and a
  // pid that has left the process table is invisible to `taskkill /t`.
  if (host?.platform !== "win32") {
    try { proc.kill(rung === "kill" ? "SIGKILL" : "SIGTERM"); } catch { /* already dead */ }
  }

  if (plan.kind === "none") { …; return; }

  try {
    const killer = spawn(plan.file, plan.args, { … });
    // win32 fallback: only if the tree killer could not run at all.
    killer.on("error", (error: Error & { code?: string }) => {
      sdk.console.log(`[drift lifecycle] tree kill spawn error code=${String(error.code ?? "unknown")}`);
      if (host?.platform === "win32") { try { proc.kill("SIGKILL"); } catch { /* already dead */ } }
    });
    …
  } catch {
    if (host?.platform === "win32") { try { proc.kill("SIGKILL"); } catch { /* already dead */ } }
    sdk.console.log(`[drift lifecycle] tree kill threw synchronously platform=…`);
  }
```

Add a gate that this ordering cannot silently invert. `killTree`'s body is reachable from
`functionBody(code, "killTree")`, so the existing positional vehicle already works:

```ts
it("does not pre-terminate the target on win32 before the tree killer runs", () => {
  const body = functionBody(code, "killTree");
  expect(body).not.toBe("");
  expect(body).toContain('host?.platform !== "win32"');
  expect(body.indexOf("buildKillTreePlan(")).toBeLessThan(body.indexOf("proc.kill("));
});
```

Note that `index.source.test.ts:302` pins `proc.kill(` at exactly 3 occurrences; that
count changes with this fix and must be updated in the same edit, per the file's own rule.

---

### CR-02: `isPidAlive` proves liveness, not identity — the recorded T-08-04 mitigation does not close T-08-04

**File:** `packages/backend/src/index.ts:4983-4996` (the probe), `4678` and `5114` (the two guarded rungs), `5029`/`5046` (the re-read inside `killTree`)

**Issue:**
`08-SECURITY.md:90` records T-08-04 (*"the deferred rungs … acting on a reassigned pid
would take an unrelated process's entire tree"*) as **closed**, on the strength of two
controls: the pid captured into a `const` before the timer is scheduled, and an
`isPidAlive` re-check inside the callback.

Neither control addresses reassignment.

`isPidAlive(pid)` sends signal `0`. Signal 0 answers "does *a* process with this pid
exist and may I signal it" — which is precisely `true` for a pid the OS has handed to an
unrelated process. The threat is a pid that is alive *and belongs to someone else*; the
guard's only discriminating power is over pids that are dead *and not yet reused*, which
is the harmless case. In the dangerous case the guard passes.

The capture-before-schedule control is also weaker than the comments claim, and this is
the part I measured rather than reasoned about. Both call sites comment that the pid is
"never re-read from `proc` inside it" (`:4656-4658`, `:5099-5101`), but the callback then
calls `killTree(sdk, proc, …)`, and `killTree:5029` does `const pid = proc.pid` — an
unconditional re-read. I checked whether Node clears `pid` after reaping, which would
have made the re-read self-limiting: it does not. On Node 20 / darwin, after `SIGKILL`
and after the `exit` event has fired, `proc.pid` still returns the original number.

So on win32 the reachable sequence is: cancel at T0 → the tree is gone by T0+ε → Windows
reassigns that pid to an unrelated process before T0+3s → `isPidAlive` returns `true` →
`killTree` re-reads the same number from `proc.pid` → `taskkill.exe /pid <n> /t /f`
terminates that unrelated process **and its whole child tree**. On POSIX the same race
produces `kill -KILL -- -<n>` against whatever group now owns that id.

This is a lower-probability failure than CR-01 — it needs pid reuse inside the 3-second
window — but the consequence class (force-terminating an arbitrary user process tree) is
why the phase rated it `medium` and wrote a mitigation for it in the first place. The
mitigation is the part that does not work.

**Fix:** guard on process *identity*, which the `ChildProcess` handle already carries,
and keep `isPidAlive` only as a secondary check:

```ts
// `exitCode`/`signalCode` are properties of the HANDLE, so they answer
// "is the process we spawned still running", which is what the rung needs.
// A pid the OS has reassigned reads as alive to signal 0 but leaves both of
// these non-null, which is the discrimination T-08-04 actually requires.
if (proc.exitCode !== null || proc.signalCode !== null) return;
if (pid === undefined || !isPidAlive(pid)) return;
killTree(sdk, proc, "kill");
```

Apply at both `:4678` and `:5114`. Update `08-SECURITY.md:90` to state what the control
proves (a dead-and-unreused pid is skipped) and what it does not, rather than "closed".

## Warnings

### WR-01: `cleanupMcpRuntime`'s new kill loop reaches ten more call sites than its comment and T-08-12 enumerate

**File:** `packages/backend/src/index.ts:3459-3470`

**Issue:**
The loop at `:3467-3470` is new in this phase and SIGKILLs every entry in
`activeProcesses`. Its comment names two entry points — the Stop button and
"`startMcpServer`'s own failure path" — and `08-SECURITY.md` T-08-12 records the same two.
`cleanupMcpRuntime` actually has **twelve** call sites (`index.ts:1846, 1872, 1887, 1893,
1899, 3544, 3638, 3657, 3670, 3681, 3687, 3714`). Two of the unnamed ones fire during
normal operation, not teardown:

- `updateSettings:1839-1847` — any settings save that carries `caidoApi` while MCP is up,
  if `refreshActiveMcpRuntime` throws.
- `syncCaidoSessionToken:1909` → `refreshActiveMcpRuntime:1861` — reached whenever the
  effective Caido token *changes*, and then `cleanupMcpRuntime` on four separate error
  branches: empty token (`:1872`), `requireMcpServerSpec` failure (`:1887`),
  `writeMcpContextFile` failure (`:1893`), and `validateCaidoAuth` failure (`:1899`).
  `:1876-1878` documents that this path is reached from the frontend's keep-alive.

Concrete trigger: a user is mid-turn; Caido rotates its session token (or the frontend
momentarily reads an empty `CAIDO_AUTHENTICATION`); `validateCaidoAuth` — a spawned
network round-trip — returns not-ok once. The in-flight provider turn is now force-killed
and removed from `activeProcesses`. Before this phase, the same sequence tore down the
MCP runtime but left the turn running.

Compounding it: this path publishes no session-state event and does not clear
`sessionWatchdogs` or `sessionRuntimeFiles`. Because `activeProcesses.delete` has already
run, a subsequent `cancelCliMessage` for that session finds `proc === undefined` and
returns `ok` **without** publishing a `stopped` state — so the user's Stop button becomes
a silent no-op for a session it can still see. Recovery depends entirely on the child's
`close` handler reaching `finalize`.

**Fix:** either narrow the loop to the teardown callers (pass a flag from
`stopMcpServer` / the `startMcpServer` failure path, keeping T-08-12's coverage), or keep
the loop and make it honest — publish a `stopped` session-state event per killed session
and delete the matching `sessionWatchdogs` entry, and correct the comment and
`08-SECURITY.md` T-08-12 to enumerate the settings-save and token-refresh callers.

---

### WR-02: the LLRT trap gate cannot see the `kill` indirection this same phase introduced

**File:** `packages/backend/src/index.source.test.ts:299`, defeated by `packages/backend/src/index.ts:4988-4990`

**Issue:**
The gate the phase calls "its single most important control" matches
`/process\s*\.\s*kill\s*\(\s*-/`. Twenty lines above `killTree`, this phase added
`isPidAlive`, which reaches the same primitive as:

```ts
const killRef = processRef.process?.kill;      // :4988
if (typeof killRef !== "function") return true;
killRef.call(processRef.process, pid, 0);      // :4990
```

That spelling is invisible to the regex, and it is now the **established local idiom for
calling the runtime's kill primitive in this file** — sitting immediately adjacent to the
code the gate exists to protect. A future edit written in the idiom its neighbour uses
(`killRef.call(processRef.process, -pid, "SIGTERM")`) reintroduces the exact `Underflow`
defect while the gate stays green on all five CI legs, which is finding L-4 recurring for
the third time.

**Fix:** widen the needle to the property access rather than the receiver, and add the
`.call`/`.apply` form:

```ts
// Any `.kill(` whose first argument is negative, plus the reflective forms —
// `isPidAlive` establishes `killRef.call(receiver, pid, sig)` in this same file,
// and a needle anchored on the receiver name cannot see it.
const LLRT_NEGATIVE_PID_SIGNAL = /\.\s*kill\s*\(\s*-|kill\w*\s*\.\s*(?:call|apply)\s*\([^,)]*,\s*-/g;
```

Then assert positively that the one reflective site is not negative, so the widened gate
has a falsifying partner:

```ts
it("passes a positive pid to the reflective kill primitive", () => {
  expect(functionBody(code, "isPidAlive")).toContain("killRef.call(processRef.process, pid, 0)");
});
```

---

### WR-03: `isPidAlive` is an untested decision function with an asymmetric failure mode, in the one file no test can import

**File:** `packages/backend/src/index.ts:4983-4996`

**Issue:**
CLAUDE.md § *Pure Helpers Split for Testability* is explicit that a decision goes into a
pure module and only orchestration stays in `index.ts` — and `kill-plan.ts`'s own header
argues the case at length. `isPidAlive` is a decision: it gates whether the forceful rung
fires at all, at both deferred sites. It lives in `index.ts`, is imported by nothing, and
`grep -rn isPidAlive packages/` returns **zero** matches outside `index.ts` and the
gitignored `dist/`. `08-SECURITY.md:90` cites "`isPidAlive(` = 3: declaration + both
rungs" as T-08-04's evidence, but that count is a one-time grep from the plan — there is
no assertion for it in `index.source.test.ts`, unlike every other Phase 8 census
(`killTree(` = 9, `proc.kill(` = 3, `child.kill(` = 1). Deleting either guard leaves the
suite green.

The failure mode the header does not cover is the realistic one. It reasons about "the
runtime exposes no kill primitive at all" (→ `true`, strictly subtractive, correct) but
not about "the primitive exists and rejects this call shape". Under Caido's LLRT,
`process.kill` may not accept a *numeric* signal `0`; if it throws for that reason,
`isPidAlive` returns `false` **for every pid, forever**, and the deferred SIGKILL rung —
which fires unconditionally in the shipped 0.1.0 — is silently disabled on every real
install. That is a CMP-01 POSIX regression that no CI leg can observe, because Node
handles signal 0 correctly.

**Fix:** distinguish "the probe is unusable" from "the target is dead", by first probing a
pid that must be alive:

```ts
function isPidAlive(pid: number): boolean {
  const processRef = globalThis as typeof globalThis & {
    process?: { pid?: number; kill?: (pid: number, signal: number) => boolean };
  };
  const killRef = processRef.process?.kill;
  const selfPid = processRef.process?.pid;
  if (typeof killRef !== "function" || typeof selfPid !== "number") return true;
  // Calibration: signalling OURSELVES with 0 must succeed on any runtime whose
  // kill primitive accepts this call shape. A throw here means the PROBE is
  // unusable, not that the target is gone — resolve toward "alive" (CMP-01).
  try { killRef.call(processRef.process, selfPid, 0); } catch { return true; }
  try { killRef.call(processRef.process, pid, 0); return true; } catch { return false; }
}
```

Add the missing census row to `index.source.test.ts`
(`expect(code.match(/isPidAlive\(/g)).toHaveLength(3)`) so T-08-04's stated evidence has a
standing control rather than a historical grep.

---

### WR-04: ROADMAP SC-1 still specifies the bare-name `taskkill` spawn that T-08-03 exists to prevent

**File:** `.planning/ROADMAP.md:311`

**Issue:**
SC-1 reads:

> A platform-branched `killTree(proc)` terminates the whole process tree on Windows via
> `spawn("taskkill", ["/pid", pid, "/T", "/F"])` (guarded against undefined pid).

The shipped mechanism is `<SystemRoot>\System32\taskkill.exe` with `["/pid","<n>","/t","/f"]`,
and the move away from the bare name is a **security** decision, recorded as T-08-03
(*Spoofing / EoP*): Windows resolves a bare `taskkill` through a search order that includes
the working directory the Caido plugin host chose. SC-1 as written is satisfied by the
insecure form and would not flag its reintroduction.

Plan 08-05 amended SC-2 in place for precisely this class of drift, and T-08-06 argues the
case explicitly — "the gate stops the code; the amendment stops the intent". SC-1 has the
same problem and was not amended.

**Fix:** amend SC-1 in place, in the same voice as the SC-2 amendment: name the absolute
`<SystemRoot>\System32\taskkill.exe` resolution, both env casings, and the bare-name
fallback as a last resort, with a pointer to T-08-03 and `DEFAULT_TASKKILL`.

## Info

### IN-01: two comments assert a pid is "never re-read from `proc`" on the line before it is

**File:** `packages/backend/src/index.ts:4656-4658` and `5099-5101`

**Issue:** Both read "Captured BEFORE the timer is scheduled, and never re-read from
`proc` inside it (§ Pitfall 2)". The timer body then calls `killTree`, whose first
statement (`:5029`) is `const pid = proc.pid`. The claim is false as written, and it is
the claim CR-02 shows a reader should not rely on.

**Fix:** restate as what is true — the pid is captured for the *guard*; `killTree` derives
its own from the handle — and cross-reference CR-02's identity check.

---

### IN-02: the SC-4 gate proves "before the first `rm`", `08-VALIDATION.md` claims "before every `rm`"

**File:** `.planning/phases/08-process-lifecycle/08-VALIDATION.md:81`, gate at `packages/backend/src/index.source.test.ts:365-408`

**Issue:** The gate compares `body.indexOf("killTree(")` against `body.indexOf("rm(")` —
first occurrence against first occurrence. The claim in the validation row is "the kill
statement precedes every `rm`". It happens to be true today (I read all three functions),
but a second `rm` added above the kill in a later edit would leave the gate green.

**Fix:** compare against the **last** `rm`: `expect(body.indexOf("killTree(")).toBeLessThan(body.lastIndexOf("rm("))`,
which makes the assertion match the sentence, or narrow the sentence to "the first `rm`".

---

### IN-03: the `detached` census covers only `spawnWithEnv(` and cannot see a bare `spawn(` with an inline env

**File:** `packages/backend/src/index.source.test.ts:325-345`

**Issue:** The block asserts three `spawnWithEnv(` call sites and argues that "a fourth
site added WITH an answer still fails this count, [because] a new spawn carrying a live
Caido session token is a decision a human should read". The count is over the *alias*, not
over spawning. `index.ts` already contains bare `spawn(` calls outside it —
`spawnAndWait:2664`, `resolveCommand`, and this phase's own `killTree:5063` — so a new
`spawn(cmd, args, { env: { …CAIDO_TOKEN… } })` written directly against the import passes
the census silently.

**Fix:** add a companion count over bare `spawn(` occurrences (currently a small, stable
number) so a new direct spawn also has to be read by a human, and note in the block that
the alias census is not a spawn census.

---

### IN-04: `createDeadPid()` hands `taskkill /t /f` a pid whose process is gone and may be reused

**File:** `packages/backend/src/kill-tree.win32.test.ts:149-159`, used at `:382-397`

**Issue:** The dead-pid measurement case runs `process.exit(0)` to completion, then
targets the freed pid with the production `/t /f` argv on a shared `windows-latest`
runner. If that pid is reassigned between the `close` event and the `taskkill` spawn, the
case terminates an unrelated process tree on the runner and still records `typeof
result.code === "number"` — a green measurement of the wrong thing. The suite has never
executed, so this has never had the chance to bite.

**Fix:** target a pid that cannot be reassigned — e.g. keep the probe's `ChildProcess`
handle open (the OS reserves a pid while a handle exists) and kill the *handle* after the
measurement, or use a pid from the high end of the range that was never allocated. Failing
that, note the caveat in the reserved block so a surprising recorded value is readable
rather than misleading.

---

_Reviewed: 2026-08-24T20:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
