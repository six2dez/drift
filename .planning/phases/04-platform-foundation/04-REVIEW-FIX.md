---
phase: 04-platform-foundation
fixed_at: 2026-08-20T11:30:00Z
review_path: .planning/phases/04-platform-foundation/04-REVIEW.md
iteration: 1
scope: critical_warning
findings_in_scope: 13
fixed: 13
skipped: 0
out_of_scope: 7
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Source review:** `.planning/phases/04-platform-foundation/04-REVIEW.md`
**Scope:** Critical + Warning (13 findings). Info (7) out of scope; none was
subsumed by a fix, so all seven remain open and are listed at the bottom with
their current status re-checked against the post-fix tree.

**Summary**

| | count |
|---|---|
| In scope (CR + WR) | 13 |
| Fixed | 13 |
| Skipped | 0 |
| Fixed with a deliberately changed test assertion | 2 (CR-02, WR-09) |

## Gates

All four exit 0 against the final tree:

| gate | result |
|---|---|
| `pnpm -r typecheck` | pass (shared, backend, frontend) |
| `pnpm lint` (`--max-warnings 0`, never `--fix`) | pass |
| `pnpm exec vitest run` | 29 files / **263 tests** pass |
| `pnpm build` | exit 0, `dist/drift.zip` produced |

**Suite delta: 245 → 263 (+18).** Every new test was run against the pre-fix
module to confirm it fails there; a test that passes both before and after
proves nothing. Accounting:

| file | before | after | delta | what the new tests pin |
|---|---|---|---|---|
| `fs-retry.test.ts` | 13 | 17 | +4 | 3 for CR-01 (the literal Rust message strings, the non-transient numeric exclusions, the `os-error-N` token); 1 for CR-02 (a throwing `sleep` is still terminal). The existing throwing-`onRetry` test was **rewritten, not added** — see CR-02. |
| `bounded-buffer.test.ts` | 16 | 21 | +5 | `lastCompleteUtf8Boundary`: ASCII, complete 2/3/4-byte sequences, every split point inside a 3-byte and a 4-byte sequence, round-trip reassembly with no U+FFFD, and invalid bytes released rather than carried forever. |
| `platform.test.ts` | 28 | 32 | +4 | `isAbsolutePath`: win32 spellings accepted on win32 and rejected on POSIX, POSIX spellings, drive-relative rejection, and the unknown-platform arm. |
| `resolution-cache.test.ts` | 10 | 14 | +4 | in-flight collapse, `bypass` never joins, the slot is released on rejection, and the entry is stamped at resolve **completion**. |
| `activity-tail.test.ts` | 20 | 21 | +1 | the cumulative `droppedBytes` tally survives a truncation reset and absorbs the discarded remainder. |

**CMP-01 tripwire — verified by blob hash, not by an empty `--stat`:**

```
provider-launch.ts       f2b84b1 -> f2b84b1  IDENTICAL
provider-launch.test.ts  8646c7a -> 8646c7a  IDENTICAL
command-resolution.ts    00b754d -> 00b754d  IDENTICAL
```

**No raw NUL bytes introduced.** `grep -rlP "\x00" packages/backend/src/` returns
nothing; `resolution-cache.ts`'s `MISSING_COMMAND_PLACEHOLDER` remains a
`\u0000` source escape, which is what keeps git and grep treating the file as text.

**Scope fence respected.** `renderExportExecScript`, `writeMcpWrapper`,
`writeLaunchScript`, `shellQuote`, every `chmod` **spawn**, the Windows candidate
arrays, `where.exe` parsing, `taskkill` and the `sessionId`/`chatId` charset
validation are untouched. The zero-call-site exports `normalizePathForCompare`
and `buildSpawnEnv` are preserved.

---

## Blockers

### CR-01 — the transient-error classifier could not recognise LLRT's error shape

**Status:** fixed · commit `6d5e146` · `fs-retry.ts`, `fs-retry.test.ts`

A third, numeric recogniser keyed on the literal `(os error N)` suffix that
Rust's `impl Display for std::io::Error` emits. Both `isTransientFsError` and
`getFsErrorCode` carry it, so the ladder fires and the diagnostics field reports.

The mapping was researched rather than guessed, and the finding that mattered is
recorded in the code: **`N` is not one namespace.** Rust prints the raw platform
error number, so it is a Win32 code on Windows and an errno on Linux/macOS — and
both runtimes are live, because Caido's LLRT throws this same shape on POSIX.
The list is `[1, 5, 13, 16, 32, 33]`, each entry justified in the namespace that
makes it transient and then checked for harm in the other, as a table in the
source. The wrong-namespace readings cost at most 1,500 ms on an error that was
going to fail anyway, and none of the wrong-namespace meanings (EIO, EPIPE,
EDOM, `ERROR_INVALID_FUNCTION`, `ERROR_CURRENT_DIRECTORY`) can be produced by the
two syscalls the ladder wraps.

**Deviation from the review's suggested list, recorded rather than silent:**
`1314 ERROR_PRIVILEGE_NOT_HELD` is **excluded**. A privilege the account does not
hold does not materialise 1,500 ms later, which is the same rule that excludes
ENOENT/ENOSPC/EROFS. The cost is that libuv maps 1314 to EPERM, so the `.code`
arm and the numeric arm disagree about that one failure; the exclusion and that
disagreement are both written down so a later phase can add it on evidence. A
test asserts `TRANSIENT_OS_ERROR_NUMBERS` does not contain 1314, so the decision
cannot be reversed by accident.

Both required properties hold:

- `getFsErrorCode` returns `os-error-N` for **any** parsable number, transient or
  not — `os-error-28` ("volume full") is worth more in a support bundle than
  `unknown`. `unknown` now means genuinely unclassifiable rather than "this is
  LLRT".
- The `unknown` sentinel stays lower-case, and the new token is lower-case for
  the same reason: no libuv code can collide with either. A test asserts it.

The `[ASSUMED]` comment was extended, not deleted. It now enumerates all three
shapes and grades each: `.code` `[ASSUMED for Caido]`, the errno-name substring
`[ASSUMED]` (still citing `llrt_utils::result::ResultExt`), and the numeric
suffix `[MEASURED SHAPE]` — measured in the sense that the rendering is a
documented property of Rust's `Display` impl, which is a different and weaker
claim than "measured on a Caido host", and the comment says so.

### CR-02 — a throwing `onRetry` cancelled the ladder

**Status:** fixed · commit `8cd52f8` · `fs-retry.ts`, `fs-retry.test.ts`

The shared `try` is split. A throw from `onRetry` is swallowed and the ladder
continues; a throw from `sleep` remains terminal, because there is no honest way
to pace retries without a clock. The comment is rewritten to argue that split
rather than the old conflation — the "the honest answer is still the filesystem
error just caught" reasoning is preserved where it belongs (what to *report*) and
removed from where it did not (whether to *keep climbing*).

**Test assertion deliberately changed.** `fs-retry.test.ts` asserted
`attempts === 1` for the throwing-`onRetry` case, which certified the defect. It
now asserts the new contract — 6 attempts, 6 operation calls, 5 hook calls, and
the full `FS_RETRY_DELAYS_MS` slept — and it **fails against the pre-fix module**
(verified by restoring `HEAD:fs-retry.ts` and re-running: 1 failed, 16 passed).
A companion test pins the sleep-throws asymmetry so it reads as a decision rather
than an accident.

---

## Warnings

### WR-01 — probe gated on the raw `os.tmpdir()`, not the value used downstream

**Status:** fixed · commit `c01a68a` · `index.ts`

The gate now runs on `getTempRoot(...)`, and the already-computed root is passed
into `buildProbeReport` instead of being recomputed, so the report can never
describe a different value than the gate decided on. Note the pre-fix code was
already internally inconsistent: for `tmpdir === "   "`, `describeTmpdirCapability`
trimmed and reported the capability **FAILED** while `probeRuntime` returned
`Ok` anyway. The two now agree.

### WR-02 — `mkdir(recursive, mode)` does not apply the mode to an existing directory

**Status:** fixed · commit `7049641` · `index.ts`

The mode is now **asserted**, not merely requested, and the security comment was
rewritten to claim exactly what the code delivers. `enforceOwnerOnlyDir`
re-applies `0o700` and then measures the result, returning the offending
permission bits only when it positively read a numeric mode; `undefined` means
"fine or unmeasurable", because a value Drift could not measure must never be
reported as a measurement. `startMcpServer` fails closed on non-win32 rather than
writing the Caido token into a directory other local users can read.

Three implementation choices worth recording:

- **`chmod` via the `fs/promises` namespace, never a named import.** A named
  import of an export Caido's LLRT does not provide is an ESM link error that
  kills the whole plugin at load — the failure mode D-02 exists to prevent. The
  namespace import already in the file yields `undefined` instead, and the
  measurement below decides. This is the same shape `detectRealpathRung` uses.
- **win32 is exempt** from the assertion. Windows has no POSIX mode bits and Node
  synthesises `0o777` for directories, so the check would fail closed on every
  Windows start. This does not contradict T-04-30, which keeps the `mode:`
  *options* unconditional because they are a documented no-op off unix; an
  assertion is not a no-op.
- **`recursive: false` was considered and rejected.** It would fail closed on a
  pre-existing directory, but the retry ladder re-enters this same `mkdir`, so
  attempt 2 after a partial success would hit `EEXIST` — non-transient — and abort
  the ladder. It would also lose the ability to create a `%TMP%` that
  `GetTempPath2` reports but that does not exist on disk.

The failure message carries the octal mode and never the path: it reaches
`mcpAuthMessage` and therefore the support bundle twice (IN-05), where a temp
path would carry the account name (T-04-04).

### WR-03 — `mcpTempDir!` dereferenced inside the retry closure

**Status:** fixed · commit `1c3423d` · `index.ts`

Captured in a `const` before the ladder; the closure uses that. `grep -n
'mcpTempDir!'` over `index.ts` now returns nothing.

### WR-04 — cumulative `droppedBytes` zeroed on truncation-reset

**Status:** fixed · commit `c404ac9` · `activity-tail.ts`, `activity-tail.test.ts`

The tally survives the reset, and the discarded remainder is **added** to it —
those bytes were read out of the file and can never be emitted as a line, which
is exactly what `droppedBytes` counts, and discarding them silently understated
the loss. The caller's capture-before-read ordering in `flushActivities` (itself
a prior fix) is untouched and still works: it captures `activityCursor.droppedBytes`
before the tick and compares after, which is now a comparison between two values
on one monotonic scale.

New test fails against the pre-fix module. Building it exposed a premise error in
the first draft — a truncation reset requires `size < cursor.offset`, so the
initial file must be longer than the replacement; the committed test asserts that
precondition explicitly rather than assuming it.

### WR-05 — the finalize-time activity flush was byte-clamped

**Status:** fixed · commit `2a2797f` · `index.ts`

`finalize` now calls `flushActivities({ drain: true })`, which loops until the
cursor stops moving, bounded at 64 ticks. Idle detection is `offset === before`,
so a truncation reset (which moves the offset backwards) keeps draining.

The re-entrancy guard was the harder half. The review asked for a `force` flag
that "waits out `readingActivities`", and waiting on a boolean needs a timer —
which is exactly what Caido's runtime does not guarantee while an RPC handler is
suspended, and a microtask spin would starve the I/O completion it is waiting
for. The guard therefore now holds the in-flight **promise** instead of a flag,
so `drain` waits by awaiting work that is already scheduled. No timer is
involved. The heartbeat and watchdog callers keep the old skip-immediately
behaviour, which is correct for them because the next tick is 250 ms away.

### WR-06 — `chunk.toString()` per chunk at the two highest-volume sites

**Status:** fixed · commit `bd0ec25` · `bounded-buffer.ts`, `bounded-buffer.test.ts`, `index.ts`, `claude-print.ts`

Both CLI handlers now carry the trailing bytes of a split sequence into the next
chunk. `lastCompleteUtf8Boundary` lives in `bounded-buffer.ts` and takes a
`Uint8Array` (a global) rather than a `Buffer`, returning an **index** rather than
a decoded string — so that module keeps its zero-import property and the
concat/decode stays in `index.ts` with the rest of the I/O, matching how every
other function there leaves I/O to the caller. A new module was not needed.

`lastStdoutAt` is recorded **before** the empty-text early return: liveness is a
property of the chunk, not of the decoded text, and a chunk that ends
mid-sequence still proves the child is alive. Missing that would have handed the
stall watchdog a false silence.

`claude-print.ts`'s "the asymmetry is intended because this buffer is a `string`"
comment was corrected as the review's fallback requires — it was describing the
damage rather than justifying it. It now names the caller-side guarantee it
depends on and says explicitly that the comment becomes wrong if a future caller
feeds it raw per-chunk decodes again.

**Recorded, not fixed:** `index.ts:1785` (`callMcpMethod`'s stdout, feeding
`drainCompleteLines`) and `:1830` (its stderr) still decode per chunk. They are
the same defect class and the fix would be three lines each, but the review scoped
WR-06 to the two CLI handlers and expanding a fix silently is how a review round
stops being a review round. Flagging it here instead: `callMcpMethod` carries
JSON-RPC tool results, i.e. HTTP response bodies, and a U+FFFD there survives
`JSON.parse` and corrupts the tool result content invisibly. Worth a follow-up
finding.

### WR-07 — the `path` module's flavour is load-bearing, undocumented and unreported

**Status:** fixed · commit `b09126a` · `platform.ts`, `platform.test.ts`, `index.ts`

Both halves of the review's fix:

1. `platform.ts` gains `isAbsolutePath({ value, platform })`, following the same
   injected-platform discipline as the rest of the module, so both branches are
   provable from the Linux runner. **The module still has zero imports**
   (`grep -c '^import'` → 0) and uses explicit character tests rather than a
   regex, for the same reason `getTempRoot` strips separators by hand. All three
   `path.isAbsolute` call sites in `index.ts` now use it — `resolveCommand`, the
   provider-status error phrasing, and the `absoluteProviderCommands` filter.
2. The probe reports `pathSeparator` and `pathFlavour`. Both REPORT and neither
   gates — nothing branches on the flavour any more, so the fields exist to let
   Phase 6 design against a measurement instead of an assumption.

The `undefined` platform arm (the RUN-05 probe has not run yet — `resolveCommand`
is reachable from a provider status check before MCP start) accepts **either**
spelling. The caller is choosing between "stat this path" and "spawn a PATH
search", so the generous answer is also the one that fails safe: a wrong guess
costs one failed stat and then falls through.

This deliberately stops short of the Phase 6 fence: no candidate arrays and no
`where.exe` parsing were touched, and `resolveCommand` still spawns `which`.

### WR-08 — `buildProviderCommandSignature` and `getNodeExecutable` disagreed

**Status:** fixed · commit `288e07c` · `index.ts`

The defensive reading was chosen, and the evidence says it is the right one
beyond the review's own argument: **every other `providers[...]` read in
`index.ts` already guards with `?.command`** (`:1360`, `:2615`, `:3738`) — the
`getNodeExecutable` line was the sole outlier, so the fix aligns it with the
file's existing convention rather than imposing a new one. `resolution-cache.ts`
is unchanged; its `MISSING_COMMAND_PLACEHOLDER` branch is now reachable in
production, which retires the "dead code" horn of the dilemma.

### WR-09 — three truncation sites, three different (or zero) markers

**Status:** fixed · commit `e04000a` · `claude-print.ts`, `claude-print.test.ts`, `index.ts`

`claude-print.ts` now builds its notice from `TRUNCATION_MARKER_PREFIX`, keeping
the site-specific tail: what was dropped matters as much as how much. This adds
**one import of a string constant** to that module. Its header explains why it
keeps its own copy of the drain *logic* — that reasoning is about logic and wave
scheduling, and it is preserved verbatim and annotated; sharing the marker text
costs nothing and is the only way the "one greppable string" property can hold.

**Test assertion deliberately changed:** `claude-print.test.ts:557` asserted the
old `[drift: dropped N bytes …]` token. It now asserts
`[drift: truncated N bytes of unterminated Claude stream output]`. The count and
the tail are unchanged; only the shared prefix moved. The 393-line CMP-01
regression suite is green (18/18).

The activity tail's drops now reach the artifact users actually submit, as a
cumulative `activityDroppedBytes` field in `getDiagnostics`. Bytes only, never
any of the dropped content, which is target-application data (T-04-04).

### WR-10 — a truncated head-retention buffer returned as a filesystem path

**Status:** fixed · commit `b2b28cd` · `index.ts`

`resolveCommand`'s close handler reads the head's first line. The marker starts
with a newline, so `.trim()` could never remove it, and head+marker would have
been handed to `fileExists`/`spawn`.

Taking one line is also correct on its own terms rather than merely safe: `which`
prints one path per line and only the first is the resolution — which is what
Phase 3's P1-WHERE measured for `where.exe` too. That is a **behaviour change**
for multi-line output (previously the whole trimmed blob was returned as a
"path", which `fileExists` would then reject), recorded here as deliberate.

`spawnAndWait` deliberately keeps `renderBoundedBuffer`: its consumers read
version strings and diagnostics, where the marker is information rather than
corruption. The review suggested "fix the pattern once"; the pattern is only
wrong for **path** consumers, and there is exactly one.

### WR-11 — entry timestamped before the resolve, and no in-flight de-duplication

**Status:** fixed · commit `f3e37f1` · `resolution-cache.ts`, `resolution-cache.test.ts`, `index.ts`

Both halves. `ResolutionCacheState` gains an `inFlight` map; a concurrent caller
for the same key joins the pending promise. `bypass` never joins — it exists so
the manual "Check" button escapes a stale answer, and joining a walk that started
before the user installed the CLI would hand back exactly that answer. The slot
is released on rejection too, or one failed resolve would pin every later caller
to a permanently rejected promise. `clearResolutionCache` deliberately does not
clear `inFlight`: an invalidation must not orphan callers already awaiting.

The write timestamp comes from an **injected** `clock`, not a `Date.now()` call
inside the module — this module reads no clock of its own, which is what keeps
every expiry test deterministic. `now` remains the read timestamp, so no existing
test changed. The default is `input.now`, which is not a compromise: for a
resolver that completes instantly (every injected fake) the two instants *are*
the same. Both production call sites in `index.ts` pass `Date.now`.

---

## Info findings — out of scope, re-checked, all still open

None was subsumed by a fix. Re-verified against the post-fix tree so the next
round starts from an accurate list:

| id | status after this round |
|---|---|
| IN-01 | **still open, and now slightly wider.** The "single `os` read" wording at `index.ts:409` is unchanged and still wrong (four `os.*` sites). This round added two `path.*` reads to `readVersionBlock` for WR-07; they are `path`, not `os`, so the count is unchanged, but the same reword should cover them. |
| IN-02 | still open. `export { genUUID }` untouched. |
| IN-03 | still open. The four unannotated `platform.ts` exports are unchanged. Note `isAbsolutePath`, added this round, is the first of that group's neighbours to have a real production caller, and `getWhichCommand` still sits unused while `resolveCommand` hardcodes `spawn("which")` — that pairing is Phase 6's, per the scope fence. |
| IN-04 | still open. `describeResolutionCache`'s citation is unchanged. |
| IN-05 | still open, and **one new message joins the blast radius**: WR-02's mode-assertion failure also routes through `cleanupMcpRuntime` into `mcpAuthMessage`. It was written to carry an octal mode and no path, precisely so it adds no new PII to the bundle. |
| IN-06 | still open. The inverted test title at `resolution-cache.test.ts` is unchanged; this round appended tests above it without touching it. |
| IN-07 | still open. The `discardUntilNewline` behaviour is unchanged in all three drop-whole implementations. WR-04 improved the *activity tail's* accounting (the discarded remainder is now counted), which narrows IN-07's "counts understate the loss" argument at that one site but does not implement the flag. |

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
