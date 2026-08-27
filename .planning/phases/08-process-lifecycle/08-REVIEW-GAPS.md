---
phase: 08-process-lifecycle
increment: gap-closure (08-06 … 08-10)
reviewed: 2026-08-27T00:00:00Z
depth: standard
diff_base: 3a534b0
files_reviewed: 10
files_reviewed_list:
  - packages/backend/src/kill-plan.ts
  - packages/backend/src/platform.ts
  - packages/backend/src/index.ts
  - packages/backend/src/index.source.test.ts
  - packages/backend/src/kill-plan.test.ts
  - packages/backend/src/platform.test.ts
  - packages/backend/src/orphan-reap.posix.test.ts
  - packages/backend/src/kill-tree.posix.test.ts
  - packages/backend/src/kill-tree.win32.test.ts
  - packages/backend/src/spawn-plan.win32.test.ts
  - .planning/phases/08-process-lifecycle/verdict-gate.sh
findings:
  critical: 1
  warning: 6
  info: 3
  total: 10
status: issues_found
---

# Phase 08 gap-closure increment: Code Review

**Reviewed:** 2026-08-27
**Depth:** standard (adversarial)
**Range:** `3a534b0..HEAD`
**Status:** issues_found

## Summary

The pure-helper split holds. Every kill operand on the new path is a positive pid
(`kill-plan.ts:594-620`), `process.kill(-pid, …)` appears only inside comments
(verified: `grep -rn 'process\.kill' packages/backend/src/*.ts` excluding tests
returns four hits, all comment lines), and no new code reads `process.env`,
`process.version` or `process.kill` outside the existing guarded
`readParentEnv()` boundary. The marker validation in `isValidSessionDirName`
genuinely closes the regex-injection surface: `genShortToken` (`index.ts:819`)
emits exactly the 20 lowercase-hex shape the validator accepts, so the accept-set
and the produced marker cannot drift. I executed both scan patterns against a
real `pgrep` on this host and both match the intended fixture and only it — the
class pattern's `{8,64}` interval and the `--` operand separator both work under
BSD `pgrep`, which no committed test covers (`orphan-reap.posix.test.ts` only
exercises the *session* builder). Full suite green: 677 passed / 9 skipped.

The defects are not in the plan builders. They are at the **I/O boundary in
`index.ts`**, where the reaper meets processes Drift itself spawns.

The headline finding is that `mcpDirectCallDepth` — the guard whose entire stated
purpose is "Drift's OWN direct `node mcp-server.mjs` spawns" — covers exactly one
of the **three** places Drift spawns a process whose argv matches the reaper's
pattern. The other two are `validateCaidoAuth` and the `gemini/codex mcp add`
registration, and the failure arm of the first one **tears down the whole MCP
runtime**.

---

## Critical

### CR-01: The idle reap can SIGKILL Drift's own `--validate-auth` child, and the failure arm then tears down the MCP runtime

**Files:**
- `packages/backend/src/index.ts:1531` (`validateCaidoAuth` → `spawnAndWait(spec.command, [...spec.args, "--validate-auth"], …)`)
- `packages/backend/src/mcp-server-spec.ts:598-620` (`mcp add` argv ends `…, input.nodeExecutable, input.mcpScriptPath`)
- `packages/backend/src/index.ts:340`, `:2341`, `:2363` (`mcpDirectCallDepth`, incremented only inside `callMcpMethod`)
- `packages/backend/src/index.ts:3836-3853` (`reapSessionOrphansIfIdle`)
- `packages/backend/src/index.ts:2042-2044` (`refreshActiveMcpRuntime` → `cleanupMcpRuntime` on a failed validation)

**Issue.**
`buildSessionOrphanScanPlan` scans for `<mcpTempDir-basename>/mcp-server\.mjs`
anywhere on a command line. Three Drift-owned processes carry that substring:

1. `callMcpMethod`'s self-test child — **covered** by `mcpDirectCallDepth`.
2. `validateCaidoAuth`'s child: `spec.command` is the node executable and
   `spec.args` is `[<mcpTempDir>/mcp-server.mjs]`, so its argv is
   `node <mcpTempDir>/mcp-server.mjs --validate-auth` — byte-identical to case 1
   plus one trailing flag. **Not counted.**
3. The registration child: `gemini mcp add … drift <node> <mcpScriptPath>` /
   `codex mcp add drift … -- <node> <mcpScriptPath>` (`mcp-server-spec.ts:598`
   and `:612`) — the script path is a positional in the registration process's
   own argv. **Not counted.**

`validateCaidoAuth` is not a rare path. `refreshActiveMcpRuntime`
(`index.ts:2005`) calls it on **every settings save** and on **every effective
token change** — its own header says so: *"It is reached from a settings save AND
from `syncCaidoSessionToken`, which the frontend polls as part of its
keep-alive."* It `await`s a full JSON-RPC round trip to Caido's GraphQL API, so
the child is alive for tens to hundreds of milliseconds.

**Triggering sequence (each step is ordinary usage):**

1. A turn is running; the user toggles an MCP permission (or Caido rotates the
   session token). `updateSettings` → `refreshActiveMcpRuntime` →
   `validateCaidoAuth` spawns `node <mcpTempDir>/mcp-server.mjs --validate-auth`
   and awaits it.
2. Within that window the turn ends (or the user clicks Stop). `finalize`
   (`index.ts:5205`) runs `activeProcesses.delete(...)` then
   `reapSessionOrphansIfIdle(sdk)` (`index.ts:5231`).
3. The gate opens: `activeProcesses.size === 0`, `mcpDirectCallDepth === 0` —
   because nothing incremented it for the validate-auth spawn.
4. `pgrep -f -- drift-mcp-<token>/mcp-server\.mjs` returns the validate-auth
   child's pid. `buildOrphanKillPlan` renders `kill -KILL -- <pid>`. The child
   dies mid-request.
5. `validateCaidoAuth` parses empty output → `parsed.ok` is neither `true` nor
   `false` → generic error → `refreshActiveMcpRuntime` line 2043 calls
   `await cleanupMcpRuntime(sdk, validation.authState, validation.message)`.

Net effect: clicking Stop (or simply finishing a turn) can make Drift kill its
own auth probe, decide its own token is bad, and tear down the entire MCP runtime
— removing `mcpTempDir` and every session's runtime files. Against CLAUDE.md's
stated core value ("if the MCP runtime doesn't launch, nothing else matters")
this is the worst available outcome, and it is self-inflicted by the new code.

Variant 3 is milder but the same shape: a reaped `mcp add` child leaves the
provider unregistered with a spurious non-zero exit — the same class as the
`exit=127` removal failures already recorded under AR-06.

This is **not** AR-07/T-08-50 (that residual is about the reap *not firing*).
It is not T-08-28 either: T-08-28's mitigation is recorded as closed on the
strength of a counter that covers one of the three spawn sites. The register row
says the counter protects "Drift's own MCP self-test"; nothing anywhere records
that the other two Drift-owned spawns share the argv.

**Fix.** Make the depth counter cover the class it claims to cover, rather than
one member of it. Extract the increment/release into a helper and route all three
spawn sites through it:

```ts
// index.ts, beside mcpDirectCallDepth
async function withDirectMcpCall<T>(run: () => Promise<T>): Promise<T> {
  mcpDirectCallDepth += 1;
  try {
    return await run();
  } finally {
    mcpDirectCallDepth -= 1;
  }
}
```

```ts
// index.ts:1531 — validateCaidoAuth
const result = await withDirectMcpCall(() =>
  spawnAndWait(spec.command, [...spec.args, "--validate-auth"], { env: spec.env }),
);
```

and wrap the registration spawn in `tryRegisterMcpForProviders` the same way.
`spawnAndWait` never rejects, so the `finally` is reached on every path — which
also gives these two sites a *stronger* release guarantee than `callMcpMethod`'s
event-bound one (see WR-01).

Add a source gate mirroring the existing census: every `spawnAndWait`/`spawn`
whose argv contains `spec.args` or `mcpScriptPath` must sit inside
`withDirectMcpCall(`, so a fourth such spawn cannot be added silently.

---

## Warnings

### WR-01: `mcpDirectCallDepth` is released only from `close`, is never reset, and its failure is invisible

**File:** `packages/backend/src/index.ts:2341` (increment), `:2355-2366` (release), `:2520`, `:2529` (call sites), `:340` (declaration)

**Issue.** `releaseDirectCall()` is wired to exactly two events: `error` and
`close`. Two independent facts make that fragile in a way nothing records:

1. `callMcpMethod`'s own comment thirty lines below (`index.ts:2394-2400`) states
   that *"Caido's plugin runtime does not reliably deliver child_process data/close
   events while an outer RPC is awaiting"* — which is precisely the window these
   handlers live in, because `runMcpSelfTest` awaits three sequential
   `callMcpMethod`s per enabled provider. `kill-plan.ts:333-347` (this increment)
   goes further and records that under LLRT the handle carries **neither**
   `exitCode` nor `signalCode`, which means the `activeSelfTestPoll` fallback at
   `index.ts:2403-2416` cannot settle either — so `close` is the *only* thing that
   can release the counter on Caido.
2. `mcpDirectCallDepth` is module-level and is **never reset** — not in
   `cleanupMcpRuntime` (`index.ts:3856`), not in `stopMcpServer`, not anywhere.

So a single undelivered `close` on a single self-test child leaves the counter at
≥1 for the entire life of the plugin load, and `shouldReapSessionOrphans`
(`kill-plan.ts:744`) then returns `false` at **all four** idle sites — cancel,
close, delete and turn end — permanently. The reported bug LIF-02 silently
regresses, and the very first thing a user is likely to do (the "Run preflight"
button, `SettingsView.vue:280` → `settings.ts:409` → `runMcpSelfTest`) is what
arms it.

The source comment at `index.ts:2352` accepts "release never runs → reap
suppressed" as the *safe* failure direction. That is a fair judgement about
direction; what is not recorded is that (a) it is permanent rather than
per-operation, (b) it is triggered by the runtime's documented normal behaviour
rather than by an exceptional one, and (c) it produces **zero** evidence
(see WR-02).

**Fix.** Three cheap, independent hardenings:

```ts
// 1. Release on `exit` too — the event kill-plan.ts:340 names as the one LLRT
//    supplies, and the event index.ts:5560 already registers for the provider
//    spawn alongside `close`. releaseDirectCall() is already idempotent.
proc.on("exit", () => { releaseDirectCall(); });

// 2. Fail-safe reset, so a leak cannot outlive the runtime it belongs to.
//    In cleanupMcpRuntime, after the kill loop:
mcpDirectCallDepth = 0;

// 3. Cap the damage even if both above are missed — release at the settle
//    paths as a floor, or clamp: mcpDirectCallDepth = Math.max(0, ...).
```

Update the `index.source.test.ts` symmetry gate (`:5` in the new block) from
`releaseDirectCall\(\)` count `2` to `3` if you take (1).

### WR-02: `reapSessionOrphansIfIdle` refuses silently — the one arm that can suppress the reap indefinitely leaves no trace

**File:** `packages/backend/src/index.ts:3836-3844`

**Issue.** Every other refusal on this path logs. `reapMcpOrphans` logs
`[drift lifecycle] no orphan reap: <reason>` for a plan refusal
(`index.ts:3674`), and logs `kind=noop reason=… exit=… killed=0` for all four
enumerator outcomes (`index.ts:3700`). The gate is the exception:

```ts
if (!shouldReapSessionOrphans({...})) {
  return;                       // <- no log, no counter, nothing
}
```

That is the *only* arm that can suppress the reap for the whole of a Caido
session — through AR-07's accepted multi-session window, through WR-01's counter
leak, or through any future arithmetic error. On a phase whose verdict is
`human_needed` and whose verification vehicle is a human reading diagnostics,
"the reap ran and found nothing" and "the reap never ran" are the two outcomes a
reader most needs to tell apart, and they are indistinguishable in the log today.

**Fix.**

```ts
function reapSessionOrphansIfIdle(sdk: BackendSDK): void {
  const sessions = activeProcesses.size;
  const depth = mcpDirectCallDepth;
  if (!shouldReapSessionOrphans({ activeSessionCount: sessions, directMcpCallDepth: depth })) {
    // Scalars only, per T-04-04: two counts, no pid, no path, no argv.
    sdk.console.log(
      `[drift lifecycle] no orphan reap: gate-closed sessions=${String(sessions)} directDepth=${String(depth)}`,
    );
    return;
  }
  ...
}
```

Two scalars are enough to distinguish AR-07 (`sessions>0`) from a counter leak
(`depth>0`) from the first UAT report onward.

### WR-03: No identity re-check between `pgrep` and `kill` — the reap reintroduces the pid-reuse shape that CR-02/T-08-04 forced `killTree` to guard

**File:** `packages/backend/src/index.ts:3706-3730` (kill loop), `:3796-3808` (close → settleScan), `packages/backend/src/kill-plan.ts:565-590`

**Issue.** The register spends an entire correction section on the fact that a
pid is not an identity: T-08-04's row and `hasTrackedProcessExited`
(`kill-plan.ts:355`) exist because *"`isPidAlive` proves LIVENESS, and a pid the
OS has REASSIGNED is alive"*. `reapMcpOrphans` has the same hazard and **no**
guard at all:

1. `pgrep` reads the process table and exits.
2. Drift's `close` handler fires — and CLAUDE.md's own architectural note is that
   Caido "does NOT reliably deliver child_process data/close callbacks", so this
   gap is not bounded to microseconds; it is bounded by when the event loop next
   drains.
3. `settleScan` then spawns `kill -KILL -- <pid>` for each number, with no
   re-verification that the pid is still the process `pgrep` matched.

Crucially, the reap is issued *at the exact moment processes are dying*: at
`cancelCliMessage` the CLI has just been SIGTERMed, at `cleanupMcpRuntime` the
whole `activeProcesses` loop has just been killed. That is when pids are being
freed. The user population here is pentesters running high-fan-out tooling
(`xargs -P`, `ffuf`, `nuclei`) — pid-table churn measured in thousands per second
is normal on that machine, which is exactly the condition under which wraparound
inside the callback gap stops being theoretical. The operand is `-KILL`, and
`buildOrphanKillPlan`'s comment says this path is for a process Drift "has
ALREADY decided must not survive" — so a reused pid gets SIGKILLed with no
recourse.

T-08-23 covers the *values* the parser accepts; nothing covers reuse between
enumeration and signal.

**Fix (either one closes it):**

- **Collapse the window.** `pkill -f -- <same pattern>` matches and signals
  inside one process, with no event-loop gap between the read and the kill. It is
  the same base-system utility family, the same argv shape, and it removes the
  `parseOrphanScanPids` → `buildOrphanKillPlan` round trip entirely. The recorded
  rationale for `pgrep` (`kill-plan.ts:462-471`) argues `pgrep` over `ps` and
  never considers `pkill`. Cost: you lose the `killed=N` count; keep the `pgrep`
  scan for the log line and use `pkill` for the signal, or accept
  `killed=unknown`.
- **Or re-verify identity before signalling.** Add a pure
  `buildOrphanIdentityCheckPlan({ pid })` → `ps -p <pid> -o command=` and require
  the marker to still be present in the output before the kill plan is built.
  That is one extra spawn per orphan (expected 0-3).

### WR-04: `verdict-gate.sh` ARM C cannot detect what it says it asserts

**File:** `.planning/phases/08-process-lifecycle/verdict-gate.sh:170-177`

**Issue.** The header calls this script *"Re-runnable, committed deliberately so
it is a standing control rather than a one-time check"*, and ARM C's stated claim
is *"the dated `*-SUMMARY.md` class is UNMODIFIED"* — the exclusion from ARM A
"checked in the OTHER direction". The implementation is:

```bash
SUMMARY_DIFF=$(git diff --stat HEAD -- '.planning/phases/08-process-lifecycle/*-SUMMARY.md' 2>/dev/null)
```

`git diff HEAD` compares the index and working tree against `HEAD`. At every
commit boundary — which is the only state a standing control is ever run in (CI,
a fresh clone, a `git bisect` checkout) — that output is empty **by
construction**, whatever the history contains. Someone who rewrites
`08-06-SUMMARY.md` and commits it gets a green ARM C forever after; only an
*uncommitted* edit is red, and only until it is staged and committed. I ran the
gate at HEAD: ARM C passes, and it would pass identically on a tree where every
summary had been rewritten in the previous commit.

This is the "green by accident" shape the script's own ARM A commentary sets out
to eliminate, sitting in the arm that exists to police the exclusion list.

**Fix.** Compare against the commit that introduced each summary, not against
`HEAD`:

```bash
# Fail if any dated SUMMARY has been touched by more than its introducing commit.
for f in .planning/phases/08-process-lifecycle/*-SUMMARY.md; do
  n=$(git log --oneline --follow -- "$f" | wc -l | tr -d ' ')
  [ "$n" = "1" ] || fail "ARM C" "$f has $n commits — a dated SUMMARY is written once"
done
# Keep the working-tree check as a second, cheaper arm.
```

If a one-commit-per-summary rule is too strict for the workflow, pin each file's
blob hash in the script and compare `git rev-parse HEAD:<path>` against it —
either way the assertion becomes about history rather than about dirt.

### WR-05: ARM A's fail-closed discovery loop fails **open** on any path containing whitespace

**File:** `.planning/phases/08-process-lifecycle/verdict-gate.sh:115-120`

**Issue.** ARM A's entire design argument is that an inclusion list *"can only
ever open the files it already names, so a carrier missing from the list is
invisible to it BY CONSTRUCTION — it fails OPEN, silently green"*. The
implementation reintroduces that property through the pipe:

```bash
find .planning packages ... -type f -print 2>/dev/null \
| xargs grep -lE "$STALE_ERE" 2>/dev/null
```

`xargs` without `-0` splits on whitespace and honours quotes, so a path
containing a space, a tab, a single quote or a double quote is silently split
into non-existent operands. `grep` reports "No such file or directory" to
`/dev/null` (`2>/dev/null`) and the real carrier never reaches the loop — the gate
stays green while the stale claim sits in it. Today the repo has zero such paths
(`find … | grep -cE "[[:space:]'\"]"` returns `0`), so this is latent rather than
live — but "Application Support" is a path this project already reasons about,
and a future artifact named `08 UAT notes.md` is all it takes.

**Fix.**

```bash
done < <(
  find .planning packages \
       \( -name node_modules -o -name dist -o -name .git \) -prune -o \
       -type f -print0 2>/dev/null \
  | xargs -0 grep -lZ -E "$STALE_ERE" 2>/dev/null | tr '\0' '\n'
)
```

or drop `xargs` entirely and use `find … -exec grep -lE "$STALE_ERE" {} +`.
While you are there: `grep -lE` on a binary file under `packages/` will report the
filename and then `sed -E … | grep -cE` will read it as text; adding `-I` to the
discovery `grep` keeps the scan to text files.

### WR-06: `platform.test.ts`'s "REFUSES a derived value that is not drive-absolute" does not exercise the case it names

**File:** `packages/backend/src/platform.test.ts:1116-1127` (and the preceding case at `:1106-1115`)

**Issue.** The case passes `systemRootFallback: "   "`. Trace it through
`resolveWindowsSystemBinary` (`platform.ts:302-386`):

- `env` is empty → `systemRoot = ""`.
- `systemRoot = fallbackRoot.trim()` → `""`.
- the trailing-separator loop is a no-op on `""`.
- `if (root === "") return input.binary;` → `"cmd.exe"`.

So no value is *derived* at all: the whitespace is coerced to absent and the
function takes the **bare-name** arm — byte-identically to the preceding case,
which passes `""` and asserts the same `undefined`. The two cases are duplicates
of one another under different titles.

The arm the title describes — a non-empty, non-drive-absolute derived root, e.g.
`systemRootFallback: "Windows"` producing `"Windows\\System32\\cmd.exe"` — is the
only input that reaches `selectComspec`'s `isAbsolutePath` refusal
(`platform.ts:813`) with something other than a bare name, and it is
**unasserted**. That refusal guards T-08-33, rated `high`, on the branch that
carries a live `CAIDO_TOKEN`.

Not vacuous (deleting the `isAbsolutePath` check does turn the case red, because
the bare `"cmd.exe"` would then be returned), but mislabelled, and it leaves a
real coverage hole exactly where the title claims coverage.

**Fix.**

```ts
it("REFUSES a derived value that is not drive-absolute", () => {
  // A root that composes a real path but not a rooted one: the segment is
  // appended, the result is relative, and a relative interpreter is resolved
  // through the search order this function exists to bypass.
  expect(
    selectComspec({ env: {}, platform: "win32", systemRootFallback: "Windows" }),
  ).toBeUndefined();
});
```

Consider also asserting the asymmetry deliberately or removing it:
`getWhichCommand` and `buildKillTreePlan` apply **no** `isAbsolutePath` refusal to
the same ladder's output, so a non-absolute `systemRootFallback` would be handed
straight to `spawn` there. It is unreachable today because
`deriveWindowsSystemRoot` only ever returns `""` or `X:\Windows`, but the
divergence is undocumented.

---

## Info

### IN-01: `reapMcpOrphans`'s `excludePids` parameter is dead in production

**File:** `packages/backend/src/index.ts:3670`, call sites `:3852`, `:3969`, `:4066`

All three production call sites pass `[]`. The parameter is only ever non-empty
in `orphan-reap.posix.test.ts:170`, whose comment reads *"with this test's own pid
excluded for the same reason `reapMcpOrphans` passes an exclusion list at all"* —
which reads as though production uses it. A later reader tracing "how is the
self-test excluded?" may follow this parameter instead of `mcpDirectCallDepth`
and conclude the exclusion is handled here.

**Fix:** either drop the parameter from `reapMcpOrphans` (keep it on the pure
`parseOrphanScanPids`, where the test needs it), or correct the test comment to
say the exclusion is a *test-vehicle* concern and production uses the depth
counter instead.

### IN-02: `killed=N` counts spawn attempts, not kills

**File:** `packages/backend/src/index.ts:3706-3733`

`signalled += 1` runs immediately after `spawn` returns; `killer.on("error", () => undefined)`
(`:3728`) swallows an asynchronous spawn failure without decrementing. On a host
where `kill` is unspawnable-but-not-throwing the log reads
`kind=reap … killed=3` while nothing was signalled. Given WR-02, this log line is
the mechanism's only evidence channel — an overstated count is worse here than
elsewhere.

**Fix:** rename the field to `attempted=` (accurate and costs nothing), or
decrement inside the `error` handler and log from a `setTimeout(0)` so the count
settles first.

### IN-03: `parseOrphanScanPids` accepts integers outside any pid range, and `buildOrphanKillPlan` would render them in exponential notation

**Files:** `packages/backend/src/kill-plan.ts:565-590`, `:594-620`

`Number.parseInt("999999999999999999999", 10)` is `1e21`; `Number.isInteger(1e21)`
is `true` and `1e21 > 1`, so the parser admits it and `isUnusablePid` admits it.
`String(1e21)` is `"1e+21"`, so the argv becomes `kill -KILL -- 1e+21` — the exact
`String(undefined)` → `"undefined"` rendering class the module header calls out at
`kill-plan.ts:41-44` as *"a silent no-op with a non-zero exit nobody reads"*, in a
different flavour. Unreachable from `pgrep` today (which cannot emit such a line),
which is why this is Info and not a Warning — but the parser is documented as
*"the only place text from another process becomes a number this codebase will
signal (T-08-23)"*, and the ceiling is the one shape it does not check.

**Fix:** one line, at the same place the floor is applied:

```ts
// The CEILING, for the same reason as the floor: a value no pid allocator can
// produce is not a pid, and String() would render it in exponential notation.
if (parsed <= 1 || parsed > 4194304) continue;
```

---

## Explicitly checked and clean

Recorded so a later reader does not re-derive them:

- **Positive-pid invariant** — `buildOrphanKillPlan` renders `String(pid)`;
  `kill-plan.test.ts` asserts `not.toContain("-4321")` and a repo-scoped
  `/^-\d/` sweep over all three orphan builders. The only negative operand in the
  module is `buildKillTreePlan`'s pre-existing POSIX group kill.
- **`process.kill(-pid, …)` as code** — absent. Four occurrences repo-wide, all
  comment lines (`index.ts:611`, `:5663`; `kill-plan.ts:121`, `:284`).
- **Marker ↔ generator agreement** — `genShortToken` (`index.ts:819`) emits 20
  lowercase hex; `isValidSessionDirName` accepts `[0-9a-f]{8,64}`. No live marker
  can be refused, and no metacharacter can reach the enumerator.
- **Pattern blast radius, executed rather than asserted** — I ran both production
  patterns against a real `pgrep` on darwin 25.6.0 with a live fixture:
  `drift-mcp-[0-9a-f]{8,64}/mcp-server\.mjs` and the session form both match the
  fixture and exit 0; the `--` separator and the `{8,64}` interval are both
  accepted by BSD `pgrep`. A concurrent reaper's own `pgrep` argv cannot
  self-match (its command line carries the literal `mcp-server\.mjs` with a
  backslash, which the regex `\.` does not match).
- **Provider CLI argv does not match** — `buildClaudeLaunchArgs` /
  `buildCopilotLaunchArgs` (`provider-launch.ts:48`, `:77`) pass a *config file
  path*, never inline JSON, so no provider CLI process carries `mcp-server.mjs` on
  its own command line. The one exception is the `mcp add` registration — CR-01.
- **G-05 mode census** — all seven `writeFile` sites accounted for; the two
  token-bearing writes outside the new five (`writeTemp`, `index.ts:1017`, which
  is what `writeChatMcpConfig` uses for Copilot's token-embedding config)
  already carried `0o600`. No gap.
- **Fire-and-forget throw safety** — both `spawn` calls in `reapMcpOrphans` are
  inside `try`/`catch`; `buildSessionOrphanScanPlan` and `getMcpSessionDirName`
  cannot throw. Nothing escapes into `cancelCliMessage`'s synchronous
  `Result<void>` handler.
- **`functionBody`'s braced-return-type defect** — does not reach any gate in
  this increment. `sendCliMessage` returns `Promise<Result<SendCliMessageOutput>>`
  and `closeCliSession` returns `Result<void>`; the paren-balancing step handles
  their inline object *parameters*. The local `topLevelDeclarationSlice` is only
  needed for `callMcpMethod`, as recorded.
- **Not re-reported** — AR-04, AR-06, AR-07, the `pgrep`-under-LLRT `unrun-verify`,
  `functionBody`'s scoped workaround, and the LIF-01/LIF-02 completion status.

---

_Reviewed: 2026-08-27_
_Reviewer: Claude (gsd-code-reviewer), adversarial pass_
_Depth: standard_
