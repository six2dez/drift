---
phase: 4
slug: platform-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-14
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

---

## The constraint this strategy is designed around

**The maintainer cannot test native Windows locally**, and the permanent `windows-latest` job
(CI-01) does not land until **Phase 9**. Every criterion below is therefore classified into
exactly one bucket:

| Bucket | Meaning | Count |
|---|---|---|
| **L** | Provable on the existing Linux/macOS runner, because `platform` is an injected parameter | **33** |
| **W** | Needs a Windows runner this phase does not have | **2** — both already answered by Phase 3 |
| **N** | Not provable in CI on any runner | **2** — both mitigated by diagnostics, not left open |

Maximizing **L** is the *purpose* of the pure/impure split. Anything left inline in the
3,004-line untested `index.ts` falls into **N** by default.

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
| RUN-03 | `getTempRoot({platform,tmpdir})` normalises any trailing separator, all three platforms | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getTempRoot"` | ❌ W0 | ⬜ pending |
| RUN-03 | `getSweepRoots` → `[tmpdir]` on win32, `[tmpdir, "/tmp"]` on darwin, `["/tmp"]` on linux | L | TBD | T-04-02 | unit | `… -t "getSweepRoots"` | ❌ W0 | ⬜ pending |
| RUN-03 | `getWhichCommand` returns `which` on POSIX, `where` on win32 | L | TBD | — | unit | `… -t "getWhichCommand"` | ❌ W0 | ⬜ pending |
| RUN-03 | `getExecutableNames` returns `[command]` on POSIX, the `.exe`/`.cmd` list on win32 | L | TBD | — | unit | `… -t "getExecutableNames"` | ❌ W0 | ⬜ pending |
| RUN-03 | `getHomeDirCandidates` reads `HOME` on POSIX, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` on win32 | L | TBD | — | unit | `… -t "getHomeDirCandidates"` | ❌ W0 | ⬜ pending |
| RUN-03 | No hardcoded `/tmp` remains outside the deliberate legacy sweep arm | L | TBD | — | static | `! grep -n '"/tmp"' packages/backend/src/index.ts` (only permitted occurrence is `platform.ts`'s `getSweepRoots`) | ❌ W0 | ⬜ pending |
| RUN-03 | Real `os.tmpdir()` is drive-lettered and exists on Windows | **W** | — | — | — | **Already measured** — Phase 3 P0-TMP; cite `03-FINDINGS.md`, do not re-prove | ✅ | ✅ green |
| RUN-04 | `isTransientFsError` accepts `EPERM`/`EBUSY`/`EACCES`/`UNKNOWN`, rejects `ENOENT`/`ENOSPC` | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/fs-retry.test.ts -t "isTransientFsError"` | ❌ W0 | ⬜ pending |
| RUN-04 | `withFsRetry` retries a transient failure and succeeds, sleeping the exact ladder | L | TBD | — | unit | `… -t "retries a transient"` | ❌ W0 | ⬜ pending |
| RUN-04 | `withFsRetry` does **not** retry a non-transient failure (exactly one attempt) | L | TBD | — | unit | `… -t "does not retry"` | ❌ W0 | ⬜ pending |
| RUN-04 | `withFsRetry` gives up after the ladder and returns `Error` | L | TBD | — | unit | `… -t "gives up"` | ❌ W0 | ⬜ pending |
| RUN-04 | `FS_RETRY_DELAYS_MS` has ~5 entries summing ≤ 1500 ms (SC-3's shape) | L | TBD | — | unit | `… -t "ladder shape"` | ❌ W0 | ⬜ pending |
| RUN-04 | A **real** Defender lock is survived on real hardware | **N** | — | — | — | Not inducible in CI. **Mitigation:** log every retry with code + attempt index, surface the count in `getDiagnostics` so a bug report answers it | — | ⬜ mitigated |
| RUN-05 | `formatProbeFailure` renders every version-block field, `"unavailable"` for each that throws | L | TBD | T-04-04 | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "unavailable"` | ❌ W0 | ⬜ pending |
| RUN-05 | `buildProbeReport` marks `os.platform`/`os.tmpdir` gating, `realpath`/win-env reported (D-06) | L | TBD | — | unit | `… -t "gating"` | ❌ W0 | ⬜ pending |
| RUN-05 | `normalizePlatform` **rejects** an unrecognised value instead of falling through to POSIX | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "normalizePlatform"` | ❌ W0 | ⬜ pending |
| RUN-05 | The probe runs before the sweep and before `mcpTempDir` assignment | L | TBD | — | static | Ordered-`grep` assertion over `startMcpServer`, or a comment-anchored line-order check | ❌ W0 | ⬜ pending |
| RUN-05 | The failure message is legible to a real bug reporter | **N** | — | — | manual | Human read of one rendered example. Legibility is not machine-assertable | — | ⬜ manual |
| CMP-02 | macOS sweep still finds `drift-mcp-*` under `/var/folders/…` **and** legacy `/tmp` | L | TBD | T-04-02 | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getSweepRoots"` | ❌ W0 | ⬜ pending |
| CMP-01 / CMP-02 | Existing suite stays green — the real regression net | L | TBD | — | regression | `pnpm exec vitest run` — 134 tests stay green; `provider-launch.test.ts` exact snapshots must not move | ✅ | ⬜ pending |
| PERF-02 | `consumeActivityChunk` carries a partial line across chunks | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/activity-tail.test.ts -t "partial"` | ❌ W0 | ⬜ pending |
| PERF-02 | A multi-byte UTF-8 sequence split across chunks survives intact | L | TBD | — | unit | `… -t "utf-8"` | ❌ W0 | ⬜ pending |
| PERF-02 | `offset > size` resets the cursor (truncation/rotation) | L | TBD | — | integration | `… -t "truncation"` — real `mkdtemp` file, matching `command-resolution.test.ts` style | ❌ W0 | ⬜ pending |
| PERF-02 | Re-reading after no writes yields zero new lines (the 250 ms common case) | L | TBD | — | integration | `… -t "no new bytes"` | ❌ W0 | ⬜ pending |
| PERF-02 | `Buffer.alloc(length)` with `length === buffer.byteLength` (LLRT `copy_from_slice` panic) | L | TBD | — | static | Code review + anchored comment. **Not observable on Node** — the constraint is LLRT-only | ❌ W0 | ⬜ pending |
| PERF-03 | A positive result is cached and not re-resolved within TTL | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/resolution-cache.test.ts -t "within TTL"` | ❌ W0 | ⬜ pending |
| PERF-03 | Expiry re-resolves after the injected clock advances past TTL | L | TBD | — | unit | `… -t "expires"` | ❌ W0 | ⬜ pending |
| PERF-03 | Negative results use the shorter TTL | L | TBD | — | unit | `… -t "negative"` | ❌ W0 | ⬜ pending |
| PERF-03 | Changing any `providers[*].command` clears the cache (SC-6) | L | TBD | — | unit | `… -t "invalidates on command change"` | ❌ W0 | ⬜ pending |
| PERF-03 | `checkProviderAvailability` bypasses the cache | L | TBD | — | unit | `… -t "bypass"` | ❌ W0 | ⬜ pending |
| PERF-04 | `appendBounded` returns the input unchanged below the cap | L | TBD | T-04-05 | unit | `pnpm exec vitest run packages/backend/src/bounded-buffer.test.ts -t "below the cap"` | ❌ W0 | ⬜ pending |
| PERF-04 | Above the cap: head + marker + tail, total ≤ cap + marker length | L | TBD | T-04-05 | unit | `… -t "both ends"` | ❌ W0 | ⬜ pending |
| PERF-04 | The marker carries the dropped byte count | L | TBD | — | unit | `… -t "marker"` | ❌ W0 | ⬜ pending |
| PERF-04 | Claude line buffer drops and counts a > 4 MiB unterminated line | L | TBD | T-04-05 | unit | `pnpm exec vitest run packages/backend/src/claude-print.test.ts -t "unterminated"` | ✅ file / ❌ cases | ⬜ pending |
| PERF-04 | The split-once refactor is behaviour-identical | L | TBD | T-04-06 | regression | `pnpm exec vitest run packages/backend/src/claude-print.test.ts` — all existing cases green, unmodified | ✅ | ⬜ pending |
| SC-9 | `buildSpawnEnv` preserves `APPDATA`/`LOCALAPPDATA` and overlays drift vars | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "buildSpawnEnv"` | ❌ W0 | ⬜ pending |
| SC-9 | Every `spawn` site supplying `env` uses `buildSpawnEnv` | L | TBD | — | static | `grep -c "spawn(" packages/backend/src/index.ts` cross-checked against `buildSpawnEnv` call sites | ❌ W0 | ⬜ pending |
| SC-10 | The realpath ladder falls through to `path.resolve` when both upper rungs are absent | L | TBD | — | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "ladder"` — inject fake fs functions | ❌ W0 | ⬜ pending |
| SC-10 | 8.3 short-name expansion produces a comparable path | **W** | — | — | — | Windows-only by nature. Phase 3 measured the *divergence*; expansion itself is Phase 6's problem | — | ⬜ deferred |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files that must exist before the tasks they cover can be verified:

- [ ] `packages/backend/src/platform.test.ts` — RUN-03, CMP-02, SC-9, RUN-05 (`normalizePlatform`)
- [ ] `packages/backend/src/fs-retry.test.ts` — RUN-04
- [ ] `packages/backend/src/activity-tail.test.ts` — PERF-02
- [ ] `packages/backend/src/bounded-buffer.test.ts` — PERF-04 (site A: stdout/stderr accumulators)
- [ ] `packages/backend/src/resolution-cache.test.ts` — PERF-03
- [ ] `packages/backend/src/runtime-probe.test.ts` — RUN-05, SC-10
- [ ] New cases appended to `packages/backend/src/claude-print.test.ts` — PERF-04 (site B: line buffer)

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

---

## Lint note (do not silently "fix")

`normalizePathForCompare` is **deliberately uncalled in Phase 4** — per CONTEXT.md D-04, Phase 6
is its first caller. `pnpm lint` runs at `--max-warnings 0`, so if the unused export trips a rule,
add an explicit `eslint-disable` **with a comment citing D-04**. Do not delete the export to make
the linter quiet.

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ W0 references above
- [ ] No watch-mode flags in any verify command
- [ ] Feedback latency < 2s per task, < 30s per wave
- [ ] `pnpm build` passes (first `import … from "os"` in the backend bundle)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
