---
phase: 4
slug: platform-foundation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-14
gates_run: 2026-08-14
human_read: 2026-08-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § *Validation Architecture*. Read that section for the
> full rationale behind every bucket assignment.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root; `setupFiles: ["./vitest.setup.ts"]`) |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/<module-touched>.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Static gates** | `pnpm -r typecheck` and `pnpm lint` (`--max-warnings 0`, never `--fix`) |
| **Estimated runtime** | Quick: < 2s per module. Full suite: ~15s (134 tests / 23 files at phase start) |
| **Measured at phase close** | Full suite **245 tests / 29 files / 0 failures**, wall clock **750 ms**. Phase 4 added 111 tests and 6 files |

---

## The constraint this strategy is designed around

**The maintainer cannot test native Windows locally**, and the permanent `windows-latest` job
(CI-01) does not land until **Phase 9**. Every criterion below is therefore classified into
exactly one bucket:

| Bucket | Meaning | Count |
|---|---|---|
| **L** | Provable on the existing Linux/macOS runner, because `platform` is an injected parameter | **39** |
| **W** | Needs a Windows runner this phase does not have | **2** — both already answered by Phase 3 |
| **N** | Not provable in CI on any runner | **2** — both mitigated by diagnostics, not left open |

**Bucket arithmetic corrected at phase close (04-11 task 1).** This table previously read
**37 / 2 / 2 = 41** against a map that carries **43** data rows — an internal contradiction
inherited from the same undercount the 04-11 plan flags in its `<read_first>` ("43 data rows, not
the 40 an earlier draft recorded"). The three rows added during planning are all bucket **L**
(PERF-04's `drainCompleteLines` row, its over-cap-remainder partner, and the `callMcpMethod` stderr
row), so **L is 39**. Measured, not asserted: the bucket column of the 43 map rows tallies
`39 L · 2 W · 2 N`.

Maximizing **L** is the *purpose* of the pure/impure split. Anything left inline in the
3,004-line untested `index.ts` falls into **N** by default. (That figure is the phase-start
measurement and is kept as history; `index.ts` closes the phase at 3,717 lines, and still has
zero direct test coverage — every `index.ts` claim in this map is graded by a static gate plus a
unit-proven mechanism in a sibling module, never by behaviour.)

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run packages/backend/src/<the-module-touched>.test.ts` — sub-second, no excuse to skip.
- **After every plan wave:** `pnpm -r typecheck && pnpm lint && pnpm exec vitest run` — full suite plus both static gates, at `--max-warnings 0`.
- **Before `/gsd-verify-work`:** full suite green on the CI Node 20/22/24/26 matrix **plus `pnpm build`**. The build gate matters specifically here — this phase adds the first `import … from "os"` to the backend bundle, and a bundler resolution failure would be invisible to vitest.
- **Max feedback latency:** < 2 seconds per task; < 30 seconds per wave.

---

## Per-Requirement Verification Map

Task IDs are assigned during planning; the `Plan`/`Task` columns are filled by `gsd-planner`
and updated by the executor. Bucket, test type, and command are fixed here.

| Requirement | Behavior | Bucket | Plan / Task | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|
| RUN-03 | `getTempRoot({platform,tmpdir})` normalises any trailing separator, all three platforms | L | 04-01 / T1–T2 | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getTempRoot"` | ✅ | ✅ green (5 passed) |
| RUN-03 | `getSweepRoots` → `[tmpdir]` on win32, `[tmpdir, "/tmp"]` on darwin, `["/tmp"]` on linux | L | 04-01 / T1–T2 | T-04-02 | unit | `… -t "getSweepRoots"` | ✅ | ✅ green (3 passed) |
| RUN-03 | `getWhichCommand` returns `which` on POSIX, `where` on win32 | L | 04-01 / T1–T2 | — | unit | `… -t "getWhichCommand"` | ✅ | ✅ green (3 passed) |
| RUN-03 | `getExecutableNames` returns `[command]` on POSIX, the `.exe`/`.cmd` list on win32 | L | 04-01 / T1–T2 | — | unit | `… -t "getExecutableNames"` | ✅ | ✅ green (5 passed) |
| RUN-03 | `getHomeDirCandidates` reads `HOME` on POSIX, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` on win32 | L | 04-01 / T1–T2 | — | unit | `… -t "getHomeDirCandidates"` | ✅ | ✅ green (4 passed) |
| RUN-03 | No hardcoded `/tmp` remains outside the deliberate legacy sweep arm | L | 04-08 / T2 · asserted 04-11 / T1 **Gate 1** | — | static | `! grep -n '"/tmp"' packages/backend/src/index.ts` (only permitted occurrence is `platform.ts`'s `getSweepRoots`) | ✅ | ✅ green |
| RUN-03 | Real `os.tmpdir()` is drive-lettered and exists on Windows | **W** | — [^w1] | — | — | **Already measured** — Phase 3 P0-TMP; cite `03-FINDINGS.md`, do not re-prove | ✅ | ✅ green |
| RUN-04 | `isTransientFsError` accepts `EPERM`/`EBUSY`/`EACCES`/`UNKNOWN`, rejects `ENOENT`/`ENOSPC` | L | 04-02 / T1–T2 | — | unit | `pnpm exec vitest run packages/backend/src/fs-retry.test.ts -t "isTransientFsError"` | ✅ | ✅ green (4 passed) |
| RUN-04 | `withFsRetry` retries a transient failure and succeeds, sleeping the exact ladder | L | 04-02 / T1–T2 | — | unit | `… -t "retries a transient"` | ✅ | ✅ green (1 passed) |
| RUN-04 | `withFsRetry` does **not** retry a non-transient failure (exactly one attempt) | L | 04-02 / T1–T2 | — | unit | `… -t "does not retry"` | ✅ | ✅ green (1 passed) |
| RUN-04 | `withFsRetry` gives up after the ladder and returns `Error` | L | 04-02 / T1–T2 | — | unit | `… -t "gives up"` | ✅ | ✅ green (1 passed) |
| RUN-04 | `FS_RETRY_DELAYS_MS` has ~5 entries summing ≤ 1500 ms (SC-3's shape) | L | 04-02 / T1–T2 | — | unit | `… -t "ladder shape"` | ✅ | ✅ green (1 passed) |
| RUN-04 | A **real** Defender lock is survived on real hardware | **N** | — [^n1] | — | — | Not inducible in CI. **Mitigation:** log every retry with code + attempt index, surface the count in `getDiagnostics` so a bug report answers it | — | ⬜ mitigated |
| RUN-05 | `formatProbeFailure` renders every version-block field, `"unavailable"` for each that throws | L | 04-03 / T1–T2 | T-04-04 | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "unavailable"` | ✅ | ✅ green (1 passed) |
| RUN-05 | `buildProbeReport` marks `os.platform`/`os.tmpdir` gating, `realpath`/win-env reported (D-06) | L | 04-03 / T1–T2 | — | unit | `… -t "gating"` | ✅ | ✅ green (1 passed) |
| RUN-05 | `normalizePlatform` **rejects** an unrecognised value instead of falling through to POSIX | L | 04-01 / T1–T2 | T-04-24 | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "normalizePlatform"` | ✅ | ✅ green (4 passed) |
| RUN-05 | The probe runs before the sweep and before `mcpTempDir` assignment | L | 04-08 / T2 · asserted 04-11 / T1 **Gate 2** | — | static | Ordered-`grep` assertion over `startMcpServer`, or a comment-anchored line-order check | ✅ | ✅ green (`:2248` → `:2271` → `:2284`) |
| RUN-05 | The failure message is legible to a real bug reporter | **N** | — [^n2] | T-04-26 | manual | Human read of one rendered example. Legibility is not machine-assertable | 04-11 / 2 | ✅ read 2026-08-20 |
| CMP-02 | macOS sweep still finds `drift-mcp-*` under `/var/folders/…` **and** legacy `/tmp` | L | 04-01 / T1–T2 (mechanism) · 04-08 / T2 (wiring) | T-04-02 | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getSweepRoots"` | ✅ | ✅ green (3 passed) |
| CMP-01 / CMP-02 | Existing suite stays green — the real regression net | L | every plan · asserted 04-11 / T1 **Gates 5–6** | — | regression | `pnpm exec vitest run` — 134 tests stay green; `provider-launch.test.ts` exact snapshots must not move | ✅ | ✅ green (245/245; the 134 baseline is a subset — Phase 4 added 111 and moved none) |
| PERF-02 | `consumeActivityChunk` carries a partial line across chunks | L | 04-04 / T1–T2 | — | unit | `pnpm exec vitest run packages/backend/src/activity-tail.test.ts -t "partial"` | ✅ | ✅ green (4 passed) |
| PERF-02 | A multi-byte UTF-8 sequence split across chunks survives intact | L | 04-04 / T1–T2 | — | unit | `… -t "utf-8"` | ✅ | ✅ green (1 passed) |
| PERF-02 | `offset > size` resets the cursor (truncation/rotation) | L | 04-04 / T1–T2 | T-04-15 | integration | `… -t "truncation"` — real `mkdtemp` file, matching `command-resolution.test.ts` style | ✅ | ✅ green (1 passed) |
| PERF-02 | Re-reading after no writes yields zero new lines (the 250 ms common case) | L | 04-04 / T1–T2 | — | integration | `… -t "no new bytes"` — the `it` title must contain this literal substring; vitest `-t` is a substring match | ✅ | ✅ green (1 passed) |
| PERF-02 | An unterminated `cursor.partial` above `ACTIVITY_PARTIAL_MAX_BYTES` (4 MiB) is dropped whole and counted, and an under-cap one is not | L | 04-04 / T1–T2 | T-04-14 | unit | `… -t "partial cap"` | ✅ | ✅ green (3 passed) |
| PERF-02 | `Buffer.alloc(length)` with `length === buffer.byteLength` (LLRT `copy_from_slice` panic) | L | 04-04 / T1 · asserted 04-11 / T1 | — | static | Code review + anchored comment. **Not observable on Node** — the constraint is LLRT-only | ✅ | ✅ green — **graded against `activity-tail.ts:226`, not `index.ts` (deviation 1)** |
| PERF-03 | A positive result is cached and not re-resolved within TTL | L | 04-07 / T1–T2 | — | unit | `pnpm exec vitest run packages/backend/src/resolution-cache.test.ts -t "within TTL"` | ✅ | ✅ green (1 passed) |
| PERF-03 | Expiry re-resolves after the injected clock advances past TTL | L | 04-07 / T1–T2 | — | unit | `… -t "expires"` | ✅ | ✅ green (1 passed) |
| PERF-03 | Negative results use the shorter TTL | L | 04-07 / T1–T2 | T-04-21 | unit | `… -t "negative"` | ✅ | ✅ green (1 passed) |
| PERF-03 | Changing any `providers[*].command` clears the cache (SC-6) | L | 04-07 / T1–T2 (mechanism) · 04-10 / T2 (wiring) | T-04-20 | unit | `… -t "invalidates on command change"` | ✅ | ✅ green (1 passed) |
| PERF-03 | `checkProviderAvailability` bypasses the cache | L | 04-07 / T1–T2 (mechanism) · 04-10 / T1 (wiring) | T-04-21 | unit | `… -t "bypass"` | ✅ | ✅ green (1 passed) |
| PERF-04 | `appendBounded` returns the input unchanged below the cap | L | 04-05 / T1–T2 | T-04-05 | unit | `pnpm exec vitest run packages/backend/src/bounded-buffer.test.ts -t "below the cap"` | ✅ | ✅ green (1 passed) |
| PERF-04 | Above the cap: head + marker + tail, total ≤ cap + marker length | L | 04-05 / T1–T2 | T-04-05 | unit | `… -t "both ends"` | ✅ | ✅ green (1 passed) |
| PERF-04 | The marker carries the dropped byte count | L | 04-05 / T1–T2 | T-04-18 | unit | `… -t "marker"` | ✅ | ✅ green (1 passed) |
| PERF-04 | Claude line buffer drops and counts a > 4 MiB unterminated line | L | 04-06 / T1–T2 | T-04-05 | unit | `pnpm exec vitest run packages/backend/src/claude-print.test.ts -t "unterminated"` | ✅ | ✅ green (4 passed) |
| PERF-04 | The split-once refactor is behaviour-identical | L | 04-06 / T1–T2 | T-04-06 | regression | `pnpm exec vitest run packages/backend/src/claude-print.test.ts` — all existing cases green, unmodified | ✅ | ✅ green (18/18; `git diff --numstat` reported `261 0` — additions only) |
| PERF-04 | `drainCompleteLines` splits once, emits complete lines and carries the remainder (`callMcpMethod`'s `stdoutBuffer`, site 6) | L | 04-05 / T1–T2 (mechanism) · 04-09 / T3 (wiring) | T-04-06 | unit | `pnpm exec vitest run packages/backend/src/bounded-buffer.test.ts -t "drains complete lines"` | ✅ | ✅ green (1 passed) |
| PERF-04 | An over-cap unterminated remainder is dropped whole and counted; an over-cap **newline-terminated** chunk is not | L | 04-05 / T1–T2 | T-04-28 | unit | `… -t "drops an over-cap remainder"` | ✅ | ✅ green (1 passed) |
| PERF-04 | `callMcpMethod`'s stderr accumulator (site 5, now `index.ts:1648`/`:1769`) is bounded — its ≤10 s timeout bounds the window, not the volume | L | 04-05 / T1–T2 (mechanism) · 04-09 / T3 (wiring) | T-04-05 | unit | `… -t "keeps the tail only under tail retention"` proves the mechanism; the wiring is graded by `pnpm exec vitest run` + 04-11 **Gate 7** | ✅ | ✅ green (1 passed) |
| SC-9 | `buildSpawnEnv` preserves `APPDATA`/`LOCALAPPDATA` and overlays drift vars | L | 04-01 / T1–T2 | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "buildSpawnEnv"` | ✅ | ✅ green (4 passed) |
| SC-9 | Every `spawn` site supplying `env` uses `buildSpawnEnv` | L | 04-11 / T1 **Gate 3** | — | static | `grep -c "spawn(" packages/backend/src/index.ts` cross-checked against `buildSpawnEnv` call sites | ✅ | ✅ green — **count is `0` and that is the correct answer (deviation 2)** |
| SC-10 | The realpath ladder falls through to `path.resolve` when both upper rungs are absent | L | 04-03 / T1–T2 | T-04-12 | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "ladder"` — inject fake fs functions | ✅ | ✅ green (2 passed) |
| SC-10 | 8.3 short-name expansion produces a comparable path | **W** | — [^w2] | — | — | Windows-only by nature. Phase 3 measured the *divergence*; expansion itself is Phase 6's problem | — | ⬜ deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Footnotes — where the four non-`L` rows' evidence actually lives.** The `Plan / Task` column reads
`—` for these four because no Phase 4 plan *proved* them; that is not the same as no plan touching
them, and a reader chasing provenance should not have to re-derive it:

[^w1]: Measured on a real `windows-latest` host in **Phase 3, assertion P0-TMP**. Canonical citation
    `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — **never** the CI
    artifacts, which expire 2026-09-12. Consumed in Phase 4 by 04-01's `getTempRoot` and 04-08's
    `probeRuntime`.
[^n1]: Mitigation shipped by **04-02** (the ladder) and **04-08 / T2–T3** (the real first write wrapped
    in `withFsRetry` at `index.ts:2300`, every retry logged through `sdk.console` with its code and
    attempt index, and the count surfaced as `mcpFirstWriteAttempts` in `getDiagnostics`). Final
    confirmation waits on a real Windows machine — Phase 9/10, or the original reporter.
[^n2]: The message is produced by **04-03**'s `formatProbeFailure` and rendered live by **04-08**'s
    `probeRuntime`. Everything machine-assertable about it is covered by the two RUN-05 `L` rows
    above plus the T-04-04 no-secrets tripwire. The legibility judgement itself is **04-11 / T2**, a
    blocking human-verify checkpoint.

---

## Wave 0 Requirements

New test files that must exist before the tasks they cover can be verified:

- [x] `packages/backend/src/platform.test.ts` — RUN-03, CMP-02, SC-9, RUN-05 (`normalizePlatform`) — **28 tests**
- [x] `packages/backend/src/fs-retry.test.ts` — RUN-04 — **13 tests**
- [x] `packages/backend/src/activity-tail.test.ts` — PERF-02 — **20 tests**
- [x] `packages/backend/src/bounded-buffer.test.ts` — PERF-04 (the **six** total-volume stdout/stderr accumulators **and** `drainCompleteLines`, the line-drain helper for `callMcpMethod`'s `stdoutBuffer`) — **16 tests**
- [x] `packages/backend/src/resolution-cache.test.ts` — PERF-03 — **10 tests**
- [x] `packages/backend/src/runtime-probe.test.ts` — RUN-05, SC-10 — **16 tests**
- [x] New cases appended to `packages/backend/src/claude-print.test.ts` — PERF-04 (the Claude line buffer) — **18 tests** (8 appended, additions-only)

**Accumulator site inventory (corrected during planning; count corrected again at phase close).**
`index.ts` has **seven** accumulator sites, not four and not six:

| # | Site | Buffer declared | Appended | Mechanism | Wiring owner |
|---|------|-----------------|----------|-----------|--------------|
| 1 | `spawnAndWait` stdout | `:1998` | `:2008` | `appendBounded` / `SPAWN_STDOUT_MAX_CHARS` / head | 04-09 / T2 |
| 2 | `spawnAndWait` stderr | `:2004` | `:2009` | `appendBounded` / `SPAWN_STDERR_MAX_CHARS` / tail | 04-09 / T2 |
| 3 | `sendCliMessage` stdout | `:2863` | `:3150` | `appendBounded` / `CLI_STDOUT_MAX_CHARS` / both | 04-09 / T2 |
| 4 | `sendCliMessage` stderr | `:2869` | `:3239` | `appendBounded` / `CLI_STDERR_MAX_CHARS` / tail | 04-09 / T2 |
| 5 | `callMcpMethod` stderr | `:1648` | `:1769` | `appendBounded` / `MCP_SELFTEST_STDERR_MAX_CHARS` / tail | 04-09 / T3 |
| 6 | `callMcpMethod` `stdoutBuffer` | plain `string` (deliberately **not** a `BoundedBuffer`) | drained `:1722` | `drainCompleteLines` / `MCP_SELFTEST_LINE_MAX_CHARS` | 04-09 / T3 |
| 7 | `resolveCommand`'s `out` | `:1237` | `:1248` | `appendBounded` / **reuses** `SPAWN_STDOUT_MAX_CHARS` / head | **04-10 / T1** |

**Six** are total-volume accumulators bounded by `appendBounded`; the **seventh — `callMcpMethod`'s
`stdoutBuffer`, site 6 — is a line-drain buffer** bounded by `drainCompleteLines`, because
head/tail/both retention would drop the middle of a JSON-RPC frame and corrupt the protocol
framing. Plan 04-05 supplies both mechanisms; plans **04-09 tasks 2 and 3** wire sites 1–6 and plan
**04-10 task 1** wires site 7.

**Why the count moved twice, recorded so it does not move a third time.** The natural inventory
query `grep -n "stdout += \|stderr += "` returns only five of the seven lines: it is structurally
blind to `stdoutBuffer +=` (site 6) and to `out +=` (site 7, whose variable is simply named `out`).
That blindness produced first a four-site draft and then a six-site one, and it is why **04-11
Gate 7 uses the broader `out += ` pattern** — a strict superset (`stdout += ` *contains*
`out += `) that cannot be defeated by another variable of the same shape. Both earlier counts
appeared in this very section until plan 04-11 task 1 replaced them: the `bounded-buffer.test.ts`
bullet undercounted the total-volume accumulators by one, and the inventory paragraph undercounted
the sites by one. Both are superseded by the table above, and the totals now agree across this
file, plans 04-05 / 04-09 / 04-10 and Gate 7. Site 7's line numbers have also moved three times
this phase (`:862` → `:1200` → `:1237`); **re-locate by content, never by number.**

**Framework install:** none needed — vitest 4.0.18 is present and configured.
**Shared fixtures:** none needed — the `mkdtemp` + `afterEach` cleanup pattern at
`command-resolution.test.ts:17–21` is the template for `activity-tail.test.ts`'s two
integration cases.
**`.gitattributes` (`eol=lf`):** *not* needed for Phase 4 — nothing here asserts on generated
newline-bearing content. CI-03 owns it in Phase 9.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| The probe failure message is legible and actionable to a real bug reporter | RUN-05 | Legibility is not machine-assertable | Render one example failure with a forced-missing primitive; read it as a Windows user would. It must name the missing primitive, what Drift needed it for, the remedy, and the version block |
| A real Defender / AV write-then-exec lock is survived | RUN-04 | Not inducible in CI on any runner | Deferred to a real Windows machine (Phase 9/10, or the original reporter). Mitigation in-phase: every retry logs code + attempt index, and the retry count surfaces in `getDiagnostics` |

**Closed at 04-11 task 2, 2026-08-20 — by a human read, not a machine result.**

The maintainer read two rendered variants of `formatProbeFailure` — (a) `os.tmpdir()` absent,
and (b) the first write failing `EPERM` after 6 attempts — and judged both legible and
actionable against the four questions the row demands. Both renders are recorded verbatim in
`04-11-SUMMARY.md`. What the read confirmed, question by question:

| Question | Answered by |
|---|---|
| **What is missing?** | `Missing capability: Temp directory (os.tmpdir)` — the primitive is named, with an `Observed:` line carrying what the call actually returned |
| **Why does Drift care?** | `Needed for: Drift needs a temp directory to stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.` |
| **What do I do now?** | `What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue…` |
| **What do I paste?** | The `Versions:` / `Reported (did not block startup):` / `Path budget:` blocks — six version fields, every one present, `unavailable` where a source threw, contiguous and copy-pasteable |

Variant (b) is the one the read most mattered for. Under D-07 the write **is** the `os.tmpdir()`
assertion, so a Defender-locked temp dir answers every capability and still fails — which made the
first draft read as a self-contradiction ("the write failed" immediately above "nothing is
missing"). The shipped
`Missing capability: none - every runtime primitive answered, so the temp directory itself is the
problem (a read-only or full volume, a redirected %TMP%, or an anti-virus lock on the file Drift
just wrote)` line is what resolves it, and the maintainer confirmed it lands as an explanation
rather than as a contradiction.

**T-04-04 secret scan (step 3), re-run over the rendered text at close:** zero matches for
`CAIDO_TOKEN`, `CAIDO_AUTHENTICATION`, `Bearer `, and any `APPDATA|USERPROFILE|LOCALAPPDATA=<path>`
form. The scanner was proven non-vacuous against a seeded `CAIDO_TOKEN=…` line and against the
variable **names**, which do appear (`USERPROFILE=present APPDATA=present LOCALAPPDATA=present
TEMP=missing`) — presence booleans by name, which is the designed and correct rendering.
One residual is disclosed **by design**: the temp path itself appears in variant (b)'s
`Write error:` line, because the OS error string names the file that could not be written and that
path *is* the diagnosis. On Windows that path can carry the account name (`C:\Users\RUNNER~1\…`
in the render). This is accepted, not an oversight — a message that hides the failing path cannot
diagnose the failure it exists to report.

**The two known-and-accepted gaps (step 5), both confirmed by the maintainer:**

1. **SC-4's "Caido version".** The SDK exposes no *Caido* version. Correcting the record that three
   Phase 4 artifacts got wrong: `MetaSDK` in `@caido/sdk-backend@0.55.3` (`src/typing.d.ts:164-196`)
   declares **six** members — `id()`, `path()`, `assetsPath()`, `db()`, `version()` and
   `updateAvailable()` — not the three earlier drafts listed. But `version()` is documented as the
   **plugin's** version, which `driftVersion` already reports, so the substantive claim is unchanged:
   there is no Caido version anywhere in the SDK surface. D-08's best-effort block is the closest
   available substitute, **not** an omission. Accepted.
2. **RUN-04's real Defender lock.** Not inducible on any CI runner. The shipped mitigation is retry
   logging plus `mcpFirstWriteAttempts` in `getDiagnostics`; real-machine confirmation waits on the
   original Windows reporter in Phase 9/10. Accepted as a deferral, and RUN-04 is therefore held
   **Pending** in `REQUIREMENTS.md` rather than marked complete — see `04-11-SUMMARY.md` § *RUN-04*.

---

## Lint note (do not silently "fix")

`normalizePathForCompare` is **deliberately uncalled in Phase 4** — per CONTEXT.md D-04, Phase 6
is its first caller. `pnpm lint` runs at `--max-warnings 0`, so if the unused export trips a rule,
add an explicit `eslint-disable` **with a comment citing D-04**. Do not delete the export to make
the linter quiet.

**Phase-close status (04-11 Gate 4):** the export survives, has zero non-test callers, and **no
`eslint-disable` was needed** — ESLint's `no-unused-vars` does not flag exported symbols. The
do-not-delete instruction ships as a comment block at `runtime-probe.ts:471–476`, which cites D-04
by name and names this section as the rule to follow if a future lint rule ever does flag it.

---

## Phase Gate Results

Seven phase-wide gates, run against the tree at the close of wave 5 (`HEAD` = `eba8d3b`,
`git status --porcelain` empty). Every gate below was **executed**, not inferred from a diff —
plan 04-10 recorded two exact-count gates silently zeroed by Prettier-shaped argument wraps that
`typecheck`, `lint` and the full suite all pass, so a gate result read off source is not a result.

### Gate 1 — RUN-03, no hardcoded `/tmp`

```
$ grep -rn '"/tmp"' packages/backend/src --include=*.ts | grep -v '\.test\.ts'
packages/backend/src/platform.ts:97:  if (input.platform !== "win32" && !roots.includes("/tmp")) roots.push("/tmp");

$ grep -rn '`/tmp/' packages/backend/src --include=*.ts | grep -v '\.test\.ts'
(no match — exit 1)
```

**PASS.** Exactly one match, and it is the deliberate legacy arm inside `getSweepRoots`
(`platform.ts:92–99`) — the CMP-02 mechanism that keeps token-bearing `/tmp/drift-mcp-*`
directories from the shipped 0.1.0 reachable by the sweep after upgrade on macOS. Zero
`` `/tmp/ `` template literals anywhere in non-test backend source. The `.test.ts` exclusion is
deliberate and narrow: `command-resolution.test.ts`, `mcp-server.context.test.ts` and
`mcp-server.transport.test.ts` use `os.tmpdir()` for their own fixtures and are not production
paths.

### Gate 2 — RUN-05, probe ordering

```
$ grep -n 'const probe = probeRuntime();\|await sweepOrphanedMcpTempDirs(\|mcpTempDir = path.join' \
    packages/backend/src/index.ts
2248:  const probe = probeRuntime();
2271:  await sweepOrphanedMcpTempDirs(sdk, probe.value);
2284:  mcpTempDir = path.join(getTempRoot(probe.value), `drift-mcp-${genShortToken()}`);
```

**PASS.** Exactly three lines, **strictly ascending: 2248 → 2271 → 2284.** Transcribed here so a
later reader can re-check without re-deriving the query. Each pattern is anchored to a form the
*declaration* cannot match — `function probeRuntime(): Result<HostFacts>` contains the literal
substring `probeRuntime()`, so a bare-call pattern would self-match the declaration hundreds of
lines above `startMcpServer` and grade that line instead of the call.

### Gate 3 — SC-9 cross-check

```
$ grep -n "spawn(" packages/backend/src/index.ts
181:// (resolveCommand), which had no cache at all and re-ran spawn("which") plus the
1225:        const child = spawn("which", [command]);
1621:    const proc = spawn(launchPath, [], {
1995:    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
2835:      const proc = spawn(launchCommand, launchArgs, {
2840:        `spawn() started pid=${String(proc.pid ?? "unknown")}`,
```

**PASS, with the count of `env`-supplying spawn sites recorded as `0`.**

**Six** lines, not the five the plan predicted — and the plan's own instruction is what makes that
harmless: *do not gate on the line count, enumerate and read.* Two of the six are not spawn sites:
`:181` is a **rationale comment** added by plan 04-10 that quotes `spawn("which")`, and `:2840` is
the **log string** `` `spawn() started pid=…` `` inside an `appendSessionDebugLog` call. A gate
written against "five lines" would have failed on a correct tree, exactly as a gate written against
"four" would have.

The four real call sites, each read for an `env` option:

| Site | Call | Options object | Supplies `env`? |
|------|------|----------------|-----------------|
| `:1225` | `spawn("which", [command])` | **none at all** | No |
| `:1621` | `spawn(launchPath, [], {…})` | `{ stdio: ["pipe","pipe","pipe"] }` | No |
| `:1995` | `spawn(cmd, args, {…})` | `{ stdio: ["pipe","pipe","pipe"] }` | No |
| `:2835` | `spawn(launchCommand, launchArgs, {…})` | `{ stdio: ["pipe","pipe","pipe"] }` | No |

Cross-checked independently rather than only by reading the four: `sed -e 's://.*::'
packages/backend/src/index.ts | grep -n "env:"` returns **one** line, `:2609`
(`env: buildMcpRuntimeEnv({…})`), and that is a field of the **Copilot MCP config JSON** written to
disk by `writeChatMcpConfig` — not a `spawn()` options object.

**`buildSpawnEnv` is exported and unit-tested:** declared `platform.ts:209`;
`pnpm exec vitest run packages/backend/src/platform.test.ts -t "buildSpawnEnv"` → **4 passed / 24
skipped (28)**, exit 0.

**The zero is the correct answer, not a gap** — see deviation 2 below.

### Gate 4 — D-04, `normalizePathForCompare` survives

```
$ grep -c "export async function normalizePathForCompare" packages/backend/src/runtime-probe.ts
1

$ grep -rn "normalizePathForCompare" packages/backend/src --include=*.ts \
    | grep -v '\.test\.ts' | grep -v "runtime-probe.ts"
(no match — exit 1)
```

**PASS.** The export survives (1), has **zero** non-test callers outside its own module, and the
only other references are 3 in `runtime-probe.ts` itself and 9 in `runtime-probe.test.ts`. No
`eslint-disable` was required — ESLint's `no-unused-vars` does not flag exported symbols — and the
do-not-delete block at `runtime-probe.ts:471–476` cites **D-04** by name plus this file's *Lint
note*. Deleting the export to quiet a future linter would be a gate failure, not a tidy-up.

### Gate 5 — the full static and test suite

| Command | Exit | Result |
|---|---|---|
| `pnpm typecheck` | **0** | `shared` ✓ `backend` ✓ `frontend` ✓ (`tsc --noEmit` ×2, `vue-tsc --noEmit`) |
| `pnpm lint` | **0** | `eslint . --max-warnings 0`, no output |
| `pnpm exec vitest run` | **0** | **29 files / 245 tests / 0 failed**, 750 ms |
| `pnpm build` | **0** | `dist/drift.zip` produced; working tree still clean afterwards |

`pnpm build` is called out specifically because this phase adds the first `import … from "os"` to
the backend bundle and a bundler resolution failure would be invisible to vitest. Verified at the
emitted artifact, not just at the exit code: `dist/plugin_package/backend/index.js:6` reads
`import os from "os";` — kept **external**, which is the expected shape (Caido's runtime resolves
it) and the residual risk 04-08 recorded: D-02 protects against `os.*` *calls* throwing, not
against the *specifier* failing to resolve.

### Gate 6 — CMP-01 tripwire and the Phase 5 scope fence

Measured across the **whole phase**, from `83c4231` (*docs(04): record phase 4 planning
completion*, the commit immediately before `04-01`'s first) to `HEAD`.

```
$ git diff --stat 83c4231 HEAD -- packages/backend/src/provider-launch.ts \
    packages/backend/src/provider-launch.test.ts packages/backend/src/command-resolution.ts
(empty)
```

**PASS**, and proven by blob identity rather than by an empty `--stat` (an empty stat is also what a
path typo produces):

| File | Blob at `83c4231` | Blob at `HEAD` |
|---|---|---|
| `provider-launch.ts` | `f2b84b14e699c26aba57bd278a951a61fa550b03` | **identical** |
| `provider-launch.test.ts` | `8646c7a195aee8b2274217703ded24f3b0f42b84` | **identical** |
| `command-resolution.ts` | `00b754dce61c8102c8be5cdf40dd3e87b6e188e2` | **identical** |

So `provider-launch.test.ts`'s exact `toEqual([...])` argv arrays — the CMP-01 regression tripwire —
have not moved by a single byte, and D-03's `command-resolution.ts` fence held.

**Phase 5 scope fence, same range:**

```
$ git diff -U0 83c4231 HEAD -- packages/backend/src/index.ts \
    | grep -E '^[-+].*(renderExportExecScript|writeMcpWrapper|writeLaunchScript|shellQuote|chmod)'
(no match — exit 1)
```

Not one added or removed line in `index.ts` touches `renderExportExecScript`, `writeMcpWrapper`,
`writeLaunchScript`, `shellQuote` or any `chmod` call site. Phase 5 inherits them byte-stable.

**T-04-SC — zero packages installed:**

```
$ git diff --stat 83c4231 HEAD -- package.json packages/*/package.json pnpm-lock.yaml
(empty)
```

### Gate 7 — PERF-04, no unbounded accumulator remains

All six counts, run over the **code-only view** `sed -e 's://.*::' packages/backend/src/index.ts`
(strips `//` to end-of-line, trailing comments included, so a note recording what was converted
cannot inflate a count meant to reach `0`) — the same view plans 04-09 and 04-10 used, so the
numbers are directly comparable across the three plans:

| Query | Expected | **Measured** |
|---|---|---|
| `grep -c "out += \|stderr += "` | `0` | **0** ✅ |
| `grep -c "createBoundedBuffer("` | `6` | **6** ✅ |
| `grep -c "appendBounded("` | `7` | **7** ✅ |
| `grep -c "drainCompleteLines("` | `1` | **1** ✅ |
| `grep -cE '^[[:space:]]*while \(newlineIndex'` (raw file) | `0` | **0** ✅ |
| `grep -cE '^[[:space:]]*let newlineIndex'` (raw file) | `0` | **0** ✅ |

**PASS — seven of seven.** The six counts are satisfiable *simultaneously* only when every one of
`index.ts`'s seven accumulator sites is converted, which is what makes this a gate rather than six
independent observations. `createBoundedBuffer(` is `6` and not `7` because site 6 is deliberately
**not** a `BoundedBuffer`; `appendBounded(` is `7` and not `6` because the seventh is the
truncation-marker append on `callMcpMethod`'s stdout drop path (`:1742`), not a seventh
accumulator. The two statement anchors cover the removed drain loop's declaration and condition;
they replace a `grep -v '^[[:space:]]*[/*]'` form that dropped only lines whose *first* non-space
character is `/` or `*`, so a trailing note recording which loop was replaced survived it and
failed the gate. A comment line can never begin with `while` or with `let`.

**The pattern is `out += `, not `stdout += `, and that is the whole point of this gate.** Site 7
(`resolveCommand`'s `out`, now `:1237` decl / `:1248` append) hid from every earlier inventory in
this phase because its variable is named `out`, so the natural query `grep -n "stdout += \|stderr
+= "` could never see it — the same query the earlier drafts of plans 04-05, 04-09 and this gate
all trusted. `out += ` is a strict superset (`stdout += ` *contains* `out += `), so the broader
pattern covers all seven with one query and cannot be defeated by another variable of the same
shape. Running the narrow pattern at phase level would report a false `0`. The full site table is
in § *Wave 0 Requirements* above.

---

## Recorded Deviations

`/gsd-verify-work` grades against this artifact, so a deviation that is not written here does not
exist as far as the verifier is concerned. **Four**, of which three were known and expected during
planning.

### 1. PERF-02's `Buffer.alloc` static row is graded against `activity-tail.ts`, not `index.ts`

An **improvement, not a miss.** The row's original framing implied the LLRT `copy_from_slice`
constraint would be reviewed wherever the read happened; plan 04-04 moved the read itself into a
tested module, so the constraint now lives at `activity-tail.ts:226` with its rationale anchored at
`:212–225` (`grep -rn "Buffer.alloc" packages/backend/src --include=*.ts` finds **no** occurrence in
`index.ts` at all). The comment states the panic mechanism, that
`validate_length_offset` only checks `length <= buffer_length - offset` so a *smaller* explicit
length passes validation and then panics inside the host, and — critically — that none of it is
observable on Node, so no local or CI test can catch a violation and **the comment is the artifact**.

### 2. SC-9's static row counts **zero** `env`-supplying `spawn` sites

**Correct, not a gap.** No `spawn()` call site in `index.ts` passes an `env` option today: `:1225`
passes no options object at all, and `:1621` / `:1995` / `:2835` each pass only
`{ stdio: ["pipe","pipe","pipe"] }`. Environment reaches child processes through the bash `export`
wrapper — `renderExportExecScript` → `mcp-wrapper.sh` / `provider-launch-<id>.sh` — which **Phase 5
deletes and replaces with a direct `spawnNode()` carrying `env`**. `buildSpawnEnv` therefore shipped
in Phase 4 as a pure function plus its unit tests **with no production caller by design**, and the
static half of SC-9 is a *forward-looking* guarantee: it confirms that no spawn site supplies `env`
**without** going through `buildSpawnEnv`. A zero count satisfies that vacuously today and becomes
load-bearing the moment Phase 5's first `env`-supplying spawn lands. Phase 3's measurement is what
makes the function necessary: the `env` option **replaces** the parent block on Windows as well as
POSIX (parent-only marker `PARENT-CLEARED`, run 31780073574), and libuv back-fills only eleven
`required_vars` — `APPDATA` and `LOCALAPPDATA`, the two `command-resolution.ts` needs for the
Windows nvm/fnm candidate paths, are **not** among them.

### 3. SC-4's "Caido/runtime version" clause — the substitution

Recorded in D-08's own terms, because this is the one deviation a strict verifier will otherwise
read as a straight requirement failure:

> SC-4's literal wording asks for an actionable message "including the Caido/runtime version".
> **The Caido SDK exposes no *Caido* version anywhere.** Per **D-08**, the shipped substitute is a
> best-effort version block: `driftVersion` (from the existing `detectPluginVersion()` at
> `index.ts:805`), `processVersion`, `versionsNode`, `versionsLlrt`, `osPlatform` and `osRelease`,
> each individually guarded and rendering `"unavailable"` when its source throws.
> `process.versions.node === "0.0.0"` under LLRT is a free LLRT-vs-Node discriminator for bug
> reports. This is the closest available substitute, **not** an omission.

**Correction to the supporting enumeration, measured during this gate run.** Three Phase 4
artifacts — `index.ts:287`'s comment, 04-03's summary and 04-08's summary — state that "`sdk.meta`
exposes only `db()`, `path()` and `assetsPath()`". Read directly from the shipped typings
(`@caido/sdk-backend@0.55.3`, `src/typing.d.ts:164–196`), `MetaSDK` actually declares **six**
members: `id()`, `path()`, `assetsPath()`, `db()`, `version()` and `updateAvailable()`. The
**substantive claim is unchanged and still correct** — none of the six yields a *Caido* version;
`version()` is documented *"Get the version of the **plugin**. This uses the semver format"*, i.e.
Drift's own version, which is exactly what `driftVersion` already reports. But the enumeration as
written is trivially falsifiable by anyone who opens the typings, and a falsifiable supporting
statement makes a correct deviation record look unreliable. The corrected enumeration is recorded
here rather than transcribed verbatim from the plan.

**Follow-on for a later phase, deliberately not actioned here** (this plan's `files_modified` is
this file alone, and `detectPluginVersion()` works — it returns `0.1.0`): `sdk.meta.version()` is a
more direct source for `driftVersion` than reading `manifest.json` / `package.json` off disk
through four candidate paths. It is a *declaration* in the typings rather than a measurement under
Caido's LLRT — the same caveat 04-08 recorded for `@caido/quickjs-types` — so it wants a real-install
check before being adopted, not a blind swap. Also relevant to HRD-02 (expanded Windows
diagnostics, deferred to v2).

### 4. The static gates' predicted line numbers and match counts were stale — a *method* finding

Every line number the plan quotes for `index.ts` had moved before this gate ran: the file took
+450/−20 (04-08), +181/−41 (04-09) and +186/−43 (04-10), closing the phase at **3,717 lines**. Two
gates would have mis-graded on a *count* if they had been written to expect one:

- **Gate 3** was specified as "returns **five** lines (`:853`, `:1191`, `:1521`, `:2188`, `:2193`)".
  It returns **six**, at entirely different numbers, because plan 04-10 added a rationale comment
  quoting `spawn("which")`. The plan's own instruction — *do not gate on the line count, enumerate
  and read* — is what kept the gate correct.
- **Gate 7's** site table cited `:862`/`:1268`/`:1295`/`:1524`/`:1525`/`:2484`/`:2573`; the measured
  anchors are `:1237`/`:1248`, `:1648`/`:1769`, `:1722`, `:1998`/`:2008`, `:2004`/`:2009`,
  `:2863`/`:3150`, `:2869`/`:3239`. The *counts* — the thing the gate actually asserts — all hold
  exactly.

Recorded as a deviation because the same trap is waiting for Phases 5–8: **re-locate by content,
never by number, and anchor a gate on a form rather than on a position or a total.**

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify or a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all ❌ W0 references above — all seven files exist, 111 tests added
- [x] No watch-mode flags in any verify command
- [x] Feedback latency < 2s per task, < 30s per wave — measured: full suite 750 ms
- [x] `pnpm build` passes (first `import … from "os"` in the backend bundle) — exit 0, specifier kept external
- [x] `nyquist_compliant: true` set in frontmatter
- [x] All seven phase gates run and recorded in § *Phase Gate Results* — **7 / 7 pass**
- [x] The one non-machine-assertable criterion (RUN-05 legibility) got a real human read — approved 2026-08-20 (04-11 task 2)

**Approval: approved 2026-08-20.** The blocking human-verify checkpoint (04-11 task 2) is closed.
The maintainer read the two rendered RUN-05 failure messages and judged them legible and actionable
to a Windows bug reporter, and confirmed the two known-and-accepted gaps recorded in § *Manual-Only
Verifications* above. This is a **human read**, recorded as such — it is the one criterion in this
phase that is not machine-assertable, which is why it is bucket **N** and why no gate can stand in
for it. The `status:` front-matter field is now `complete`. The seven gates above were complete and
independent of this approval.
