---
phase: 04-platform-foundation
reviewed: 2026-08-20T08:54:43Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - packages/backend/src/platform.ts
  - packages/backend/src/platform.test.ts
  - packages/backend/src/fs-retry.ts
  - packages/backend/src/fs-retry.test.ts
  - packages/backend/src/runtime-probe.ts
  - packages/backend/src/runtime-probe.test.ts
  - packages/backend/src/activity-tail.ts
  - packages/backend/src/activity-tail.test.ts
  - packages/backend/src/bounded-buffer.ts
  - packages/backend/src/bounded-buffer.test.ts
  - packages/backend/src/resolution-cache.ts
  - packages/backend/src/resolution-cache.test.ts
  - packages/backend/src/claude-print.ts
  - packages/backend/src/claude-print.test.ts
  - packages/backend/src/index.ts
findings:
  critical: 2
  warning: 11
  info: 7
  total: 20
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-20T08:54:43Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Static gates are green: `tsc --noEmit` (backend), `eslint --max-warnings 0` over
`packages/backend/src`, and `vitest run` (29 files / 245 tests) all pass. The six
new pure modules are genuinely pure (`grep -c '^import'` is 0 for `platform.ts`
and `fs-retry.ts`), the seven accumulator conversions are complete (every
`on("data")` handler in `index.ts` now feeds a `BoundedBuffer` or
`drainCompleteLines`), no `/tmp` literal survives in `index.ts`, and the
cache-invalidation hook does sit ahead of the MCP-refresh branch as designed.
Prettier reports drift on `index.ts` and `claude-print.ts`, but it also reports
drift on nine files this phase never touched, so that is pre-existing and is not
recorded below.

The problems are concentrated where the phase context predicted: the untested
`index.ts` integration surface, and — more seriously — in the RUN-04 retry
mechanism, whose classifier is built on an explicitly `[ASSUMED]` premise about
Caido's LLRT error shape that appears to be wrong. As written the ladder will
never fire on the runtime it was built for, and the diagnostics field added to
measure whether it fired will report "1 attempt" forever, so the gap is
self-concealing. A second control-flow defect in the same module lets a logging
callback cancel the ladder. Those two are the blockers.

Beyond that: the runtime probe validates a different value than the one it hands
downstream, the activity-tail cursor loses its cumulative drop count on
truncation in a way that can swallow a subsequent drop, the finalize-time
activity flush is now byte-clamped where it used to read the whole file, and
`chunk.toString()` at the two highest-volume stdout sites reintroduces exactly
the UTF-8 boundary corruption that `activity-tail.ts` went to considerable
lengths to avoid.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: The transient-error classifier cannot recognise Caido LLRT's error shape, so the RUN-04 retry ladder never fires on the target runtime

**File:** `packages/backend/src/fs-retry.ts:77-104`, wired at `packages/backend/src/index.ts:2300-2313`

**Issue:** `isTransientFsError` has exactly two recognisers, and on Caido's LLRT
neither one can match.

1. The structured branch reads `error.code`. The module's own comment states
   LLRT does not use libuv — it uses `tokio::fs`/`std::fs` and throws through
   `or_throw_msg` — so there is no `.code` property to read.
2. The fallback branch does `message.includes(candidate)` for
   `EPERM|EBUSY|EACCES|UNKNOWN`. Rust's `std::io::Error` `Display` impl renders
   the OS message plus a numeric suffix, e.g.
   `Access is denied. (os error 5)`,
   `The process cannot access the file because it is being used by another process. (os error 32)`,
   `Permission denied (os error 13)`. None of those strings contains an errno
   *name*. The substring check therefore returns `false` for every Windows
   anti-virus symptom the ladder exists to absorb.

The consequence is not a degraded ladder, it is no ladder: `withFsRetry` breaks
out on the first `catch` (`fs-retry.ts:164`), `startMcpServer` reports the raw
error immediately, and RUN-04 is inert. The comment at `fs-retry.ts:69-76`
labels the premise `[ASSUMED]` and says "handling both means either reading
being wrong is harmless" — but that is only true if one of the two readings is
right, and here both fail on the same runtime.

This is self-concealing, which is why it rates BLOCKER rather than WARNING. The
evidence channel built to decide whether the ladder was long enough
(`mcpFirstWriteAttempts`, `index.ts:2313` / `:3470`) is fed by the same
classifier, so it will report `1` on every machine regardless of what actually
happened, and `getFsErrorCode` will report the lower-case `unknown` sentinel —
indistinguishable in a support bundle from "there was no retry because the write
succeeded".

**Fix:** add a runtime-agnostic third recogniser keyed on the numeric OS error,
and treat an unclassifiable failure of the *first* write as retryable once so a
message shape nobody predicted still gets one shot:

```ts
// Win32 codes: 5 ERROR_ACCESS_DENIED, 32 ERROR_SHARING_VIOLATION,
// 33 ERROR_LOCK_VIOLATION, 1314 ERROR_PRIVILEGE_NOT_HELD.
// POSIX codes: 13 EACCES, 16 EBUSY, 1 EPERM.
const TRANSIENT_OS_ERROR_NUMBERS = [1, 5, 13, 16, 32, 33, 1314];

function osErrorNumber(message: string): number | undefined {
  const match = /\(os error (\d+)\)/.exec(message);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

export function isTransientFsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" &&
      FS_TRANSIENT_ERROR_CODES.some((c) => c === code)) return true;

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (FS_TRANSIENT_ERROR_CODES.some((c) => message.includes(c))) return true;

  const osError = osErrorNumber(message);
  return osError !== undefined && TRANSIENT_OS_ERROR_NUMBERS.includes(osError);
}
```

`getFsErrorCode` needs the matching arm so the diagnostics field reports
`os-error-5` rather than `unknown`. Add unit tests asserting the three literal
LLRT/Rust message strings above are classified transient — that is the assertion
the current suite is missing, and its absence is why the gap shipped green.

#### CR-02: A throwing `onRetry` callback cancels the retry ladder — a diagnostic hook is allowed to change control flow

**File:** `packages/backend/src/fs-retry.ts:173-182`

**Issue:** `onRetry` and `sleep` share one `try` whose `catch` is `break`:

```ts
try {
  deps?.onRetry?.({ attempt: attempt + 1, code: getFsErrorCode(error), delayMs });
  await sleep(delayMs);
} catch {
  break;
}
```

The only `onRetry` in production (`index.ts:2304-2308`) calls
`sdk.console.error`, and the module's own comment states that
`sdk.console` "is not guaranteed non-throwing in Caido's runtime". So on the
runtime where the ladder matters most, a single failing log call silently
converts a 6-attempt/1,500 ms ladder into a 1-attempt no-retry — and `attempts`
is then reported as `1`, which is indistinguishable from "the error was not
transient". `fs-retry.test.ts:170-187` locks this behaviour in
(`expect(outcome.attempts).toBe(1)`), so the test suite certifies the defect
rather than catching it.

A logging hook must never be able to abort the operation it observes. The
"honest answer is still the filesystem error just caught" rationale in the
comment is about *what to report*, and it does not require *abandoning the
remaining rungs*.

**Fix:** isolate the hook so only the hook is swallowed, and keep sleeping:

```ts
try {
  deps?.onRetry?.({ attempt: attempt + 1, code: getFsErrorCode(error), delayMs });
} catch {
  // A diagnostics hook must never alter the ladder. Swallow and continue.
}
try {
  await sleep(delayMs);
} catch {
  break; // an injected clock that rejects is a genuine reason to stop
}
```

and update the test to assert `attempts === 6` with a throwing `onRetry`.

### Warnings

#### WR-01: `probeRuntime` gates on the raw `os.tmpdir()` but hands the *normalised* root downstream, so a root that normalises to empty escapes D-05's hard fail

**File:** `packages/backend/src/index.ts:425-431`, `packages/backend/src/platform.ts:65-81`

**Issue:** the gate is `typeof tmpdir === "string" && tmpdir !== ""` on the
untrimmed value, but every consumer uses `getTempRoot(facts)`, which trims
first. For `os.tmpdir() === "   "` the gate passes, `getTempRoot` returns `""`,
and `index.ts:2284` computes
`path.join("", "drift-mcp-<token>")` → the relative path `drift-mcp-<token>`.
The token-bearing MCP runtime directory is then created inside Caido's current
working directory instead of a temp root, `getSweepRoots` will never find it, and
the orphan sweep can never reclaim it. Same class of silent-wrong-answer the
probe exists to eliminate, arriving through the one value the probe does not
check.

**Fix:** gate on the derived value, which is what downstream actually consumes:

```ts
const tempRoot = normalized !== undefined && typeof tmpdir === "string"
  ? getTempRoot({ platform: normalized, tmpdir })
  : "";
const facts =
  normalized !== undefined && tempRoot !== "" ? { platform: normalized, tmpdir } : undefined;
```

and pass the already-computed `tempRoot` into `buildProbeReport` rather than
recomputing it.

#### WR-02: `mkdir(..., { recursive: true, mode: 0o700 })` does not apply the mode to a pre-existing directory, so the stated confidentiality guarantee does not hold on a shared temp root

**File:** `packages/backend/src/index.ts:2284`, `packages/backend/src/index.ts:2302`

**Issue:** the comment above the call states "0o700 so other local users cannot
read the token-bearing wrapper/config files written inside". `mkdir` with
`recursive: true` does not throw `EEXIST` and does not chmod an existing
directory — the `mode` is applied only to directories it actually creates. On
Linux `os.tmpdir()` defaults to the shared, world-writable `/tmp`, so a local
attacker who pre-creates `/tmp/drift-mcp-<name>` with mode `0777` defeats the
protection entirely and reads the Caido bearer token out of `mcp-wrapper.sh`.

The directory name is 20 hex characters from `Math.random()`
(`genShortToken`, `index.ts:~440`), which this phase deliberately shortened from
`genUUID()`. 80 bits is not brute-forceable, so this is a hardening gap and not
an exploitable hole today — but the guarantee the comment asserts is stronger
than the guarantee the code delivers, and the retry ladder now re-enters this
`mkdir` up to six times, every re-entry taking the "already exists, mode
ignored" path.

**Fix:** assert the mode rather than requesting it, and fail closed if the
directory already existed:

```ts
await mkdir(tempDir, { recursive: true, mode: 0o700 });
// mkdir(recursive) is a no-op on an existing dir and does NOT apply `mode`.
// Re-assert it so a pre-created world-readable dir cannot host the token.
try { await chmod(tempDir, 0o700); } catch { /* no-op on win32 */ }
```

(If `chmod` is not available under LLRT, `stat().mode & 0o077 === 0` as a
post-condition check with a hard fail is an acceptable substitute.)

#### WR-03: `mcpTempDir!` is dereferenced inside an async retry closure that can be re-entered after another RPC clears it

**File:** `packages/backend/src/index.ts:2302`

**Issue:** `mcpTempDir` is a module-level `let`. The retry ladder `await`s up to
1,500 ms between attempts, and Caido's runtime services other RPC handlers during
that window. A concurrent `stopMcpServer` → `cleanupMcpRuntime` sets
`mcpTempDir = undefined`, after which attempt N+1 calls `mkdir(undefined)`. That
throws a `TypeError` whose message contains none of the transient codes, so the
ladder aborts and the user sees a `TypeError` rendered through
`formatProbeFailure`'s "Write error:" line — an error message that is actively
misleading about what failed. The `!` assertion hides the possibility from the
type checker.

**Fix:** capture the path in a `const` before entering the ladder and use that
inside the closure:

```ts
const tempDir = path.join(getTempRoot(probe.value), `drift-mcp-${genShortToken()}`);
mcpTempDir = tempDir;
const mcpScriptLocal = path.join(tempDir, "mcp-server.mjs");
const written = await withFsRetry(async () => {
  await mkdir(tempDir, { recursive: true, mode: 0o700 });
  await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"));
}, { /* … */ });
```

#### WR-04: The activity cursor's cumulative `droppedBytes` is reset to 0 on truncation, and the caller's `>` comparison then silently swallows the next drop

**File:** `packages/backend/src/activity-tail.ts:206-210`, consumed at `packages/backend/src/index.ts:2776-2795`

**Issue:** on `plan.action === "reset"` the tick replaces the cursor with
`createActivityCursor()`, whose `droppedBytes` is `0`. `ActivityCursor.droppedBytes`
is documented as cumulative, and `index.ts` relies on that monotonicity —
it reports a drop only when `tick.cursor.droppedBytes > previousDroppedBytes`.

Concrete failure: the cursor has dropped 6 MiB over the turn. The activity file
is truncated. Within that same tick the cursor resets to 0 and
`consumeActivityChunk` then drops a fresh 5 MiB unterminated line. The comparison
is `5 MiB > 6 MiB` → false, and the drop is never reported. The phase's own
stated rule is "a drop nobody can see is a repudiation gap"; this is that gap.
The reset also discards the partial buffer without counting those bytes as
dropped at all.

**Fix:** preserve the counter across a reset — offset and partial describe
content that no longer exists, but the drop tally does not:

```ts
const cursor =
  plan.action === "reset"
    ? { ...createActivityCursor(), droppedBytes: input.cursor.droppedBytes }
    : input.cursor;
```

and add a test asserting `droppedBytes` survives the truncation-reset path (the
existing reset test at `activity-tail.test.ts:255-280` does not check it).

#### WR-05: The finalize-time activity flush is now byte-clamped, so trailing activities can be lost at the end of a turn

**File:** `packages/backend/src/index.ts:3029` (and `:2941`), `packages/backend/src/activity-tail.ts:43`

**Issue:** `finalize()` performs a single `await flushActivities()`. Before this
phase that call did `readFile` of the entire activity file, so it always caught
up completely. `readActivityTick` now clamps one tick to
`ACTIVITY_MAX_TICK_BYTES` (1 MiB) and there is no follow-up tick after
finalize — the 250 ms heartbeat is torn down. Any activity beyond the first
1 MiB of un-consumed bytes at finalize time is dropped from
`collectedActivities`, and therefore from the turn's `mcpActivities` result and
from `buildClaudePostToolStallFallback`.

The `readingActivities` re-entrancy guard compounds this: if a heartbeat tick is
in flight when finalize runs, `flushActivities` returns immediately and the final
flush does not happen at all. That guard is pre-existing, but its cost is higher
now that a single tick no longer reads the whole file.

**Fix:** drain to idle at finalize rather than ticking once:

```ts
// Finalize must catch up completely; one tick is byte-clamped.
for (let i = 0; i < 64; i += 1) {
  const before = activityCursor.offset;
  await flushActivities();
  if (activityCursor.offset === before) break;
}
```

and have `flushActivities` accept a `force` flag that waits out
`readingActivities` instead of returning.

#### WR-06: `chunk.toString()` decodes each child-process chunk independently, reintroducing the exact UTF-8 boundary corruption `activity-tail.ts` was written to prevent

**File:** `packages/backend/src/index.ts:3149`, `packages/backend/src/index.ts:3238`

**Issue:** `activity-tail.ts:120-133` documents at length why the carried
remainder must stay a `Buffer`: "Carrying it as a string instead would decode a
half-finished UTF-8 sequence at the chunk boundary and bake a permanent U+FFFD
into the record… Once decoded, the damage is unrecoverable." That reasoning
applies verbatim to the CLI stdout/stderr handlers, which are far
higher-volume than the activity file — and there the raw `Buffer` is decoded
per-chunk with no carry:

```ts
proc.stdout?.on("data", (chunk: Buffer) => {
  const text = chunk.toString();   // U+FFFD baked in at every chunk boundary
```

A model answer containing an em-dash, a CJK character or an IDN hostname that
straddles a pipe-read boundary is permanently corrupted before it ever reaches
`consumeClaudePrintChunk` or `appendBounded`. `claude-print.ts:17-20` asserts the
asymmetry is "intended" because "this buffer is a `string`" — but the buffer is a
string only because its *input* was already lossily decoded one layer up. The
comment documents the symptom as a design choice.

The line itself predates this phase, so this is not a regression — but the phase
touched both handlers and both buffering modules, and left the stated invariant
contradicted at the site that matters most.

**Fix:** use a `StringDecoder`-equivalent carry, or keep the raw bytes and reuse
`consumeActivityChunk`'s `Buffer` remainder discipline:

```ts
let stdoutBytes = Buffer.alloc(0);
proc.stdout?.on("data", (chunk: Buffer) => {
  const merged = Buffer.concat([stdoutBytes, chunk]);
  const safeEnd = lastCompleteUtf8Boundary(merged); // trailing lead-byte scan
  stdoutBytes = merged.subarray(safeEnd);
  const text = merged.subarray(0, safeEnd).toString("utf-8");
  if (text === "") return;
  // … existing body unchanged
});
```

If that is judged out of scope for Phase 4, the two comment blocks asserting the
string buffer is safe should be corrected so a later reader does not treat the
hazard as already handled.

#### WR-07: The `path` module's platform flavour is load-bearing for every runtime path, is documented as untrustworthy, and is the one unknown the probe does not report

**File:** `packages/backend/src/platform.ts:11-16`, `packages/backend/src/index.ts:2284`, `packages/backend/src/index.ts:1218`, `packages/backend/src/index.ts:2039`

**Issue:** `platform.ts` refuses to import `path` on the explicit grounds that it
"resolves to its POSIX flavour on the Linux runner and would not strip a Windows-shaped
trailing backslash" — i.e. `path` cannot be trusted to apply win32 semantics.
`index.ts` then builds the production temp directory with
`path.join(getTempRoot(probe.value), …)` and justifies it with "path.join
normalises it", which is the opposite assumption about the same module, and is
unverified for Caido's LLRT.

The higher-impact consumer is `resolveCommand`:

```ts
if (path.isAbsolute(command)) {
  return await fileExists(command) ? command : undefined;
}
```

Under a POSIX-flavoured `path`, `path.isAbsolute("C:\\Users\\x\\AppData\\Roaming\\npm\\claude.cmd")`
returns `false`, so a Windows user who configures an absolute provider command
falls through to `spawn("which", …)` — a binary that does not exist on Windows —
and the command is reported unresolvable. The same expression at `index.ts:2039`
silently drops every absolute provider command from the Node candidate list.

The runtime probe was built precisely to convert this class of unknown into a
pasted line, and it costs one field to answer.

**Fix:** report the flavour, then branch on the answer rather than on hope:

```ts
// In readVersionBlock() / the probe report:
pathSeparator: guarded(() => path.sep),
pathFlavour: guarded(() => (path.win32 !== undefined ? "dual" : "posix-only")),
```

and replace the bare `path.isAbsolute` calls with a platform-aware helper in
`platform.ts` (`isAbsolutePath({ value, platform })`) that recognises
`C:\`, `C:/` and `\\server\share` when `platform === "win32"`, matching the
injected-platform discipline the rest of that module already follows.

#### WR-08: `buildProviderCommandSignature` and `getNodeExecutable` make contradictory assumptions about whether `providers[*].command` can be absent

**File:** `packages/backend/src/resolution-cache.ts:158-171`, `packages/backend/src/index.ts:2037-2039`

**Issue:** `buildProviderCommandSignature` declares its parameter as
`Record<string, { command?: string } | undefined> | undefined` and carries a NUL
sentinel plus a security rationale for the case where `command` is missing. But
`Settings.providers` is `Record<string, { command: string; enabled: boolean }>`
(`packages/shared/src/settings.ts:18`), and the sole call site passes exactly
that. So either:

- `command` really is always a string, in which case the
  `MISSING_COMMAND_PLACEHOLDER` branch is unreachable in production and its
  "cannot forge a match" reasoning is dead code; or
- `command` can be missing at runtime (persisted settings from a legacy install
  are loaded with `{ ...DEFAULT_SETTINGS, ...s }`, which *replaces* the whole
  `providers` object rather than merging per-provider), in which case
  `index.ts:2039`'s `path.isAbsolute(command)` throws
  `TypeError: The "path" argument must be of type string` inside
  `getNodeExecutable`. That throw escapes `resolveWithCache` → `requireNodeExecutable`
  → `startMcpServer` with no `catch` on the path, surfacing as an unhandled RPC
  rejection rather than a Drift error message.

Two modules in the same phase cannot hold opposite beliefs about the same field.

**Fix:** pick the defensive reading (it is the safe one given the persisted-blob
path) and make `index.ts` agree:

```ts
absoluteProviderCommands: Object.values(currentSettings.providers)
  .map((provider) => provider?.command)
  .filter((command): command is string =>
    typeof command === "string" && command !== "" && path.isAbsolute(command)),
```

#### WR-09: Three truncation sites emit three different (or zero) markers, defeating the "one greppable string" goal

**File:** `packages/backend/src/bounded-buffer.ts:129-133`, `packages/backend/src/claude-print.ts:386`, `packages/backend/src/index.ts:2788-2795`

**Issue:** `TRUNCATION_MARKER_PREFIX` is exported as "one greppable string, with
the count embedded", but:

- `bounded-buffer.ts` emits `\n…[drift: truncated N bytes]…\n`
- `claude-print.ts:386` emits `\n…[drift: dropped N bytes of unterminated Claude stream output]` — a different token that the exported prefix does not match
- `activity-tail.ts` emits **no** marker; the drop reaches only
  `sdk.console.error` (`index.ts:2792`) and never appears in `getDiagnostics`,
  the support bundle, or the chat transcript

A support tool grepping for `TRUNCATION_MARKER_PREFIX` finds one of three sites.
The activity-tail drop is invisible in the artifact users actually submit, which
is where `mcpFirstWriteAttempts` and `resolutionCache` were deliberately placed
for exactly this reason.

**Fix:** have `claude-print.ts` build its notice from `TRUNCATION_MARKER_PREFIX`
(or export a shared `buildDropNotice(kind, n)`), and surface the activity-tail
tally in `getDiagnostics`:

```ts
activityDroppedBytes: String(lastActivityDroppedBytes),
```

fed from a module-level counter updated in `flushActivities`.

#### WR-10: A truncated head-retention buffer is `.trim()`ed and returned as a filesystem path

**File:** `packages/backend/src/index.ts:1248-1258`

**Issue:** `resolveCommand`'s `which` accumulator uses head retention, and the
close handler does:

```ts
const resolved = renderBoundedBuffer(out).trim();
resolve(code === 0 && resolved !== "" ? resolved : undefined);
```

If `which` ever emits more than `SPAWN_STDOUT_MAX_CHARS` (1 MiB),
`renderBoundedBuffer` inserts `\n…[drift: truncated N bytes]…\n` *between* head
and tail. The marker starts with `\n`, so it survives `.trim()`, and the
resulting string — head + marker — is returned as a resolved executable path and
handed to `fileExists`/`spawn`. The comment claims "Below the cap the rendered
value is byte-identical", which is true, but the above-cap branch produces a
value that is not a path at all.

Practically unreachable for `which`, but this same `renderBoundedBuffer` +
head-retention pattern is used by `spawnAndWait` (`index.ts:2005-2022`) whose
output is parsed by callers, so the pattern is worth fixing once.

**Fix:** read only the head when the consumer wants a path:

```ts
// Path consumers must never see the truncation marker.
const resolved = out.head.split("\n", 1)[0]?.trim() ?? "";
```

#### WR-11: `resolveWithCache` timestamps the entry *before* the resolve, and has no in-flight de-duplication

**File:** `packages/backend/src/resolution-cache.ts:112-137`

**Issue:** two related weaknesses:

1. `now` is captured by the caller before `await input.resolve()` and then
   written as `storedAt`. `getNodeExecutable` spawns `which node`, walks every
   version-manager directory and runs `node --version` on each candidate — on a
   cold cache this can take seconds. The entry is born already aged by that
   amount, so a slow resolve shortens its own TTL. For the 30 s negative TTL —
   the polarity whose resolve is by definition the slow one, since a miss
   exhausts every candidate — that is a meaningful fraction.
2. Concurrent callers with the same key all miss and all run the resolver. There
   is no promise-sharing, so `getDiagnostics` running while `startMcpServer` is
   resolving Node performs the full walk twice. PERF-03's stated aim is
   "collapsing the repeated walk across a burst of turns"; a concurrent burst is
   not collapsed.

**Fix:** stamp after the resolve, and memoise the in-flight promise:

```ts
const inFlight = new Map<string, Promise<string | undefined>>();
// …
const pending = inFlight.get(input.key);
if (pending !== undefined && input.bypass !== true) return await pending;
const run = input.resolve().finally(() => inFlight.delete(input.key));
inFlight.set(input.key, run);
const resolved = await run;
writeResolutionCache(state, { key: input.key, value: resolved, now: Date.now() });
```

(`now` stays an injected parameter for the read path so the expiry tests remain
deterministic; only the write timestamp moves.)

### Info

#### IN-01: The "single `os` read" invariant is asserted five times and is factually wrong

**File:** `packages/backend/src/index.ts:409`, `:250`, `:405-407`

**Issue:** `index.ts:409` reads "The single `os` read of the whole backend, and
the only place os.platform() / os.tmpdir() are called." There are four `os.*`
call sites: `os.platform()` at `:329` and `:414`, `os.release()` at `:337`,
`os.tmpdir()` at `:415`. The extra two live in `readVersionBlock`, are
individually try/caught, and are reached only from inside `probeRuntime`, so
D-02's *safety* property holds — but the *invariant as written* does not, and
`grep -c 'os\.'` is exactly how a later phase will audit it.

**Fix:** reword to "the only *unguarded-consumer* `os` reads; `readVersionBlock`
makes two further reads, each in its own try, for the D-08 version block."

#### IN-02: `export { genUUID }` widens the plugin's public module surface to satisfy a lint rule

**File:** `packages/backend/src/index.ts:1200`

**Issue:** the comment says "nothing imports index.ts", but `packages/frontend`
declares `backend: workspace:*` and imports from it for types, and this is the
Caido plugin entry module. Exporting a symbol solely to defeat `noUnusedLocals`
is a workaround with a side effect.

**Fix:** prefer a scoped suppression that states the reason, matching the pattern
`normalizePathForCompare` already uses:

```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserved per
// P3-UUID; first caller returns in a later phase. Do not delete.
```

#### IN-03: Four `platform.ts` exports have no production caller and are not on the sanctioned do-not-delete list

**File:** `packages/backend/src/platform.ts:113-189`

**Issue:** `getWhichCommand`, `getExecutableNames`, `getHomeDirCandidates` and
`WINDOWS_EXECUTABLE_EXTENSIONS` are referenced only by `platform.test.ts`.
`buildSpawnEnv` and `normalizePathForCompare` carry explicit do-not-delete notes
citing decisions D-04/SC-9; these four do not, so a later "tidy unused exports"
pass has nothing to stop it. Note `resolveCommand` still hardcodes
`spawn("which", …)` at `index.ts:1234` while `getWhichCommand` sits unused.

**Fix:** add the same one-line "Phase 6 is the first caller, per D-03" note above
each, so all six unused exports are protected by the same convention.

#### IN-04: `describeResolutionCache`'s rationale overstates what `getDiagnostics` already surfaces

**File:** `packages/backend/src/resolution-cache.ts:193-198`, `packages/backend/src/index.ts:3497`

**Issue:** the comment justifies rendering key names on the grounds that a key is
"either `node` or a provider command the user typed, both of which getDiagnostics
already surfaces (nodeExecutable at index.ts:2796)". `getDiagnostics` surfaces
`nodeExecutable`, `nodeSearchCandidates` and `mcpRegisteredCliPaths` — it does
*not* surface the configured provider command; that appears only in
`exportSupportBundle`'s `providers[].command`. So `resolutionCache` adds a new
field carrying an absolute path (and therefore the account name) to
`getDiagnostics` specifically. Low impact — the same record already carries
`pluginPath` and `nodeSearchCandidates` — but the stated justification is not
accurate.

**Fix:** correct the citation, or render only the key *prefix* plus a stable
provider id (`cmd:claude-cli`) instead of the raw command string.

#### IN-05: The probe failure message reaches the downloadable support bundle twice, carrying the OS error string

**File:** `packages/backend/src/index.ts:2315-2320`, `:3477`, `:3591`

**Issue:** noted in the phase context as an accepted residual: `Write error:`
carries the raw OS error, which on Windows includes the temp path and hence the
account name. Recording the blast radius, which is wider than "the MCP status
panel": `cleanupMcpRuntime` routes the message into `mcpAuthMessage`, which then
appears **twice** in `exportSupportBundle` output — once as
`diagnostics.caidoAuthMessage` and once as `mcp.authMessage` — in a JSON file
whose own remedy text instructs the user to "paste the block below" into a public
issue. No token is exposed (fs error strings never carry file contents), so this
remains INFO.

**Fix:** if the trade-off is revisited, a single redaction of the home-directory
prefix preserves diagnosability while removing the account name:

```ts
const redactHome = (s: string) =>
  s.replace(/([A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\\/\s"']+/g, "$1<user>");
```

#### IN-06: Test title contradicts what the test asserts

**File:** `packages/backend/src/resolution-cache.test.ts:279`

**Issue:** `it("summarises entry count, ages and clears without leaking anything but resolved paths")`
reads as "resolved paths are leaked". The body asserts the opposite
(`expect(summary).not.toContain("/opt/homebrew")`). Since these titles are a
documented `-t` substring contract with `04-VALIDATION.md`, an inverted title is
worth correcting deliberately rather than incidentally.

**Fix:** `…without leaking resolved paths`.

#### IN-07: After an over-cap remainder is dropped, the tail of that same line is re-emitted as a garbage "complete line" and silently swallowed

**File:** `packages/backend/src/activity-tail.ts:105-118`, `packages/backend/src/bounded-buffer.ts:244-247`, `packages/backend/src/claude-print.ts:194-196`

**Issue:** all three drop-whole implementations reset the remainder to empty and
then keep accumulating. When the oversized line's terminating newline finally
arrives, everything received *after* the drop is emitted as a complete line,
fails `JSON.parse`, and is discarded by the tolerant `catch`. So each drop
produces one counted drop plus one uncounted silent parse failure. Harmless in
effect, but it means the byte counts in the markers understate what was actually
lost, which matters because those counts are the evidence channel.

**Fix:** set a `discardUntilNewline` flag alongside the drop and add the skipped
bytes to the tally, so a single oversized record produces exactly one counted
drop covering its full length.

---

_Reviewed: 2026-08-20T08:54:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
