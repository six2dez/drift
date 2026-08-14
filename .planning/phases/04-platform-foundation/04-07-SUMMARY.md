---
phase: 04-platform-foundation
plan: 07
subsystem: infra
tags: [typescript, vitest, performance, ttl-cache, injected-clock, invalidation, negative-caching, pure-functions]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "Nothing at the code level — resolution-cache.ts imports NOTHING. 04-01..04-06 supplied the convention (pure core + sibling .test.ts + it-titles-as-a-contract + injected dependency for the untestable axis), not an API"
provides:
  - "packages/backend/src/resolution-cache.ts — twelve exports: RESOLUTION_POSITIVE_TTL_MS, RESOLUTION_NEGATIVE_TTL_MS, ResolutionCacheEntry, ResolutionCacheState, createResolutionCacheState, readResolutionCache, writeResolutionCache, resolveWithCache, clearResolutionCache, buildProviderCommandSignature, syncResolutionCacheSignature, describeResolutionCache"
  - "resolveWithCache — the ONE entry point index.ts uses from both resolveCommand (:848, no cache today) and the node path (:1558, an infinite never-invalidated cache today), with an explicit bypass"
  - "Two distinct TTLs chosen per ENTRY POLARITY, not per cache: 5 min positive / 30 s negative, both exported so the Claude's-Discretion numbers are reviewable and tunable without touching a call site"
  - "buildProviderCommandSignature + syncResolutionCacheSignature — ROADMAP SC-6's whole-cache invalidation, with a SORTED signature so object key order cannot force a spurious clear"
  - "describeResolutionCache — the getDiagnostics one-liner: key names, ages, polarity, clear count, and no cached values at all"
  - "packages/backend/src/resolution-cache.test.ts — 10 cases resolving all five 04-VALIDATION.md PERF-03 selectors plus the stable-signature case that replaced a deleted .sort() grep"
affects: [04-10, 04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper + sibling .test.ts (thirteenth instance of the existing repo pattern; seventh consecutive Phase 4 plan)"
    - "Injected clock as a per-call PARAMETER rather than a captured closure — second Phase 4 use of the injected-dependency shape after fs-retry.ts's injected sleep (04-02)"
    - "A downstream plan's exact call shapes type-checked against the shipped API BEFORE the wave closes, so a wave-1/wave-3 signature mismatch cannot survive to 04-10"

key-files:
  created:
    - packages/backend/src/resolution-cache.ts
    - packages/backend/src/resolution-cache.test.ts
  modified: []

key-decisions:
  - "State-object shape (createResolutionCacheState(): PlainObject + free functions), NOT 04-RESEARCH's createResolutionCache({ now, ttlMs }) closure factory. 04-PATTERNS.md § No Analog Found is explicit that the backend has ZERO closure-factory precedent — they exist only in the frontend's Pinia stores — while claude-print.ts:129-144 and bounded-buffer.ts:47-58 are the proven backend shape. The plan overrode the research sketch deliberately and this executed it literally."
  - "The clock is an INJECTED per-call parameter, never a captured one. That is what makes -t \"expires\" a real gate rather than documentation: it primes at now = 0 and re-reads at now = POSITIVE_TTL + 1 with under a millisecond of real elapsed time, so any wall-clock read keeps the entry live and the resolver is called once instead of twice. The plan deleted its Date.now() grep gate as duplicative for exactly this reason — the test IS the gate — and the module contains no wall-clock read of any kind (grep for Date.now/new Date/performance.now returns nothing)."
  - "The TTL is chosen per ENTRY, not per cache. A negative entry sitting comfortably inside the 5 minute positive window is still expired, and the test asserts RESOLUTION_NEGATIVE_TTL_MS + 1 < RESOLUTION_POSITIVE_TTL_MS as a guarded PREMISE before relying on it — so the two TTLs are distinguished by assertion rather than assumed to differ."
  - "resolveWithCache's bypass always re-resolves AND always rewrites. Skipping only the read would leave the stale value in place, so the user who pressed the manual Check button after installing a CLI would see the fresh answer once and the stale one on the very next turn. The test asserts the refreshed value survives into a later NON-bypass call, which is what an only-skips-the-read implementation fails."
  - "Whole-cache clearing on any providers[*].command change, never per-key. Per-key invalidation invites a missed key — the node entry is the obvious one to forget and it is the entry whose staleness breaks MCP start — and the cache holds at most a handful of entries."
  - "The signature sorts provider IDS. Without the sort, a settings object rebuilt with its keys in a different order clears the whole cache on every save and PERF-03 becomes a pessimisation that STILL passes a naive 'it invalidates' test. The stable-signature case asserts both the equality and its consequence (a reordered map produces syncResolutionCacheSignature === false)."
  - "describeResolutionCache emits NO cached values — key names, ages in seconds, a positive/negative marker and the clear count only. This is deliberately stricter than T-04-04's ceiling, which would permit a resolved binary path since getDiagnostics already surfaces nodeExecutable."
  - "PERF-03 was NOT marked complete. index.ts has zero references to this module — lastNodeExecutable is still the infinite cache at :119 and resolveCommand at :848 still has none — so all twelve exports have zero production call sites. Plan 04-10 carries the wiring. Seventh consecutive Phase 4 plan making this call."

patterns-established:
  - "Before a wave-1 module closes, the downstream plan's literal call shapes are compiled against the shipped signatures with a standalone tsc run, so a wave-3 mismatch surfaces now rather than three plans later"
  - "A NUL byte in a source file makes git treat it as binary and makes EVERY grep gate over that file return nothing — which reads as a pass on any negative gate. Byte-level content is verified, not assumed, when a module deliberately uses a control-character sentinel"

requirements-completed: []  # Deliberately empty — see Decisions Made. index.ts has zero references to resolution-cache.ts; 04-10 carries the integration.

# Metrics
duration: 11min
completed: 2026-08-14
---

# Phase 4 Plan 07: PERF-03's Bounded, Invalidatable Resolution Cache Summary

**A zero-import `resolution-cache.ts` whose clock is a parameter rather than a wall-clock read — which is the entire reason its 5-minute positive TTL, its 30-second negative TTL, its whole-cache invalidation on any `providers[*].command` change and its always-refreshing bypass are assertable behaviours instead of documentation; and for `node` specifically this is a TIGHTENING, replacing the infinite, never-invalidated `lastNodeExecutable` with a bounded cache, not adding caching where there was none.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-08-14T15:28:00Z
- **Completed:** 2026-08-14T15:39:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/backend/src/resolution-cache.ts` (212 lines) exports **exactly the twelve** symbols the frontmatter locks, in the frontmatter's order, with **zero import statements** — the mechanical form of the "pure, no I/O" claim and the reason T-04-SC is trivially satisfied.
- `packages/backend/src/resolution-cache.test.ts` (308 lines, 10 cases) resolves **all five** `04-VALIDATION.md` PERF-03 selectors plus `-t "stable signature"`, each validated against the independently-known suite total of 10.
- **The two TTLs are distinguished by assertion, not assumption.** The `-t "negative"` case asserts `RESOLUTION_NEGATIVE_TTL_MS + 1 < RESOLUTION_POSITIVE_TTL_MS` as a guarded premise, *then* proves the resolver runs again at that point. A single-TTL implementation, or one with the polarity check inverted, fails it.
- **The bypass proves the write, not just the read skip.** After a bypassed call refreshes an entry, a later non-bypass call inside the TTL returns the refreshed value without resolving again.
- Plan **04-10's literal call shapes compile against the shipped API** — including `Settings["providers"]` (`Record<string, { command: string; enabled: boolean }>`) flowing into `buildProviderCommandSignature` and `getNodeExecutable` as the `resolve` callback. Verified with a standalone `tsc` run, not by reading.
- Full suite went 235 → **245 tests, 29 files, 0 failures** (exactly +10, +1 file). `pnpm typecheck` and `pnpm lint` (`--max-warnings 0`) both exit 0. **Zero packages installed** (T-04-SC).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write resolution-cache.ts — state object, TTLs, signature invalidation, bypass** — `ccaa033` (feat)
2. **Task 2: Write resolution-cache.test.ts — TTL, expiry, negative caching, invalidation, bypass** — `98de3c7` (test)

## Files Created/Modified

- `packages/backend/src/resolution-cache.ts` — the two TTL constants, `ResolutionCacheEntry`, `ResolutionCacheState`, `createResolutionCacheState`, `readResolutionCache`, `writeResolutionCache`, `resolveWithCache`, `clearResolutionCache`, `buildProviderCommandSignature`, `syncResolutionCacheSignature`, `describeResolutionCache`. No imports, no I/O, no module state, no wall-clock read.
- `packages/backend/src/resolution-cache.test.ts` — 3 top-level describes / 10 cases: 5 for `resolveWithCache`, 4 for invalidation, 1 for the diagnostics line.

## The asymmetry this module exists to resolve

| Consumer | Today | After 04-10 wires this module |
|---|---|---|
| `node` (`index.ts:119`, `:1558-1562`) | `lastNodeExecutable` — an **infinite** cache, cleared only inside `getNodeExecutable()` on total failure. Survives settings saves, MCP restarts and provider changes | Bounded at 5 min, cleared on any command change. **A tightening, not an addition** |
| providers (`index.ts:848-888` `resolveCommand`) | **No cache at all.** Full `spawn("which")` + version-manager directory walk on every `checkProvider` call | Cached under the same two TTLs, with the manual Check button bypassing |

Both must go through the one cache or the phase ships two inconsistent behaviours. That is why `resolveWithCache` is a single entry point with a `bypass` flag rather than two call paths.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| Zero imports | `grep -c '^import' …/resolution-cache.ts` | `0` |
| Twelve exports | `grep -cE '^export ' …/resolution-cache.ts` | `12` |
| Export list matches frontmatter | `grep -nE '^export (const\|function\|async function\|type)' …` | 12 lines, in the frontmatter's order |
| TTL values | `node -e` eval of both constant expressions | `5 * 60 * 1000` → **300000**; `30 * 1000` → **30000** |
| No wall-clock read | `grep -n "Date\.now\|new Date\|performance\.now\|Math\.random" …` | no match (exit 1) |
| Module size | `wc -l …/resolution-cache.ts` | `212` (min 90) |
| Test size | `wc -l …/resolution-cache.test.ts` | `308` (min 110) |
| Sibling import (key_link) | `grep -c 'from "./resolution-cache"' …test.ts` | `1` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (module) | `pnpm exec eslint …/resolution-cache.ts --max-warnings 0` | exit 0 |
| Lint (test) | `pnpm exec eslint …/resolution-cache.test.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Plan tests | `pnpm exec vitest run …/resolution-cache.test.ts` | 10 passed / 0 failed |
| PERF-03 `-t "within TTL"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| PERF-03 `-t "expires"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| PERF-03 `-t "negative"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| PERF-03 `-t "invalidates on command change"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| PERF-03 `-t "bypass"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| Task 1 replacement gate `-t "stable signature"` | selector run, ANSI-stripped | `1 passed \| 9 skipped (10)` |
| No fake timers (statement-anchored) | `grep -cE '^[[:space:]]*vi\.useFakeTimers\(' …test.ts` | `0` |
| No focused tests (call form) | `grep -cE '(describe\|it)\.only\(' …test.ts` | `0` |
| No snapshot artifacts | `ls packages/backend/src/__snapshots__` | no such directory |
| Blast radius | `git diff --name-only HEAD~2 HEAD` | exactly the two new files |
| index.ts untouched | `grep -n "resolution-cache\|resolveWithCache" …/index.ts` | no match (exit 1) |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~2 HEAD -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |
| No file deletions | `git diff --diff-filter=D --name-only HEAD~2 HEAD` | empty |
| **04-10 consumer fit** | standalone `tsc --strict --noUncheckedIndexedAccess` over 04-10's literal call shapes | exit 0 |
| CMP-01 regression net | `pnpm exec vitest run` | 29 files / **245** tests / 0 failed (was 28 / 235 — exactly +10) |

Method note, carrying the `[03-03]`/`[03-04]`/`[04-02]`…`[04-06]` lesson about extraction pipelines: every `-t` run was ANSI-stripped before the `grep` and validated against the independently-known total of 10 — each reported `1 passed | 9 skipped (10)`. A silently-empty selector is otherwise indistinguishable from a green result.

## Decisions Made

- **The state-object shape, not the closure factory, and the override is the recorded decision.** `04-RESEARCH.md` § *PERF-03* proposes `createResolutionCache({ now, ttlMs })` returning closures. `04-PATTERNS.md` § *No Analog Found* flags that the backend has **no closure-factory precedent at all** — they exist only in the frontend's Pinia stores — while `claude-print.ts:129-144` and `bounded-buffer.ts:47-58` are the proven backend shape. The plan chose the state object and this executed it literally. Three consequences that matter: it matches the six existing pure modules, it keeps `now` an explicit per-call parameter so no test has to reason about a captured clock, and it makes cache contents (`state.entries.size`, `state.clears`) directly assertable — three of the ten cases read them.
- **`now` is a parameter on every single function that needs it, and the module reads no clock.** The plan deleted its `Date.now()` grep gate as duplicative, correctly: `-t "expires"` fails *deterministically* under any wall-clock implementation, because it re-reads at `POSITIVE_TTL + 1` while under a millisecond of real time has passed. A module that stamped `storedAt` from `Date.now()` would compute `300001 - 1.7e12` and keep the entry live (1 call, not 2); a module that compared against `Date.now()` would expire the entry in `-t "within TTL"` (2 calls, not 1). One of the two fails either way. The deleted grep also leaned on a comment filter that leaves trailing comments intact — and the header comment this task mandates names the clock in prose.
- **The TTL is per ENTRY, not per cache.** `readResolutionCache` picks `negativeTtlMs` or `positiveTtlMs` from the entry's own polarity, so a 45-second-old miss is expired even though the same age on a hit would be live. Asserting `RESOLUTION_NEGATIVE_TTL_MS + 1 < RESOLUTION_POSITIVE_TTL_MS` *before* using that point is what turns "the two TTLs differ" from an assumption into a guarded premise.
- **`undefined` IS the negative cache; absence is the miss.** The two are distinguished by Map membership, never by the value, and `resolveWithCache` writes `undefined` rather than skipping the write. Without that, "cache misses too" would silently degrade to "cache nothing", and the version-manager walk would repeat every turn *precisely in the slow case* — a miss is exactly the input that exhausts every candidate.
- **An expired entry is deleted on read.** Otherwise the map keeps one dead entry per never-requeried key and `describeResolutionCache` reports a count that overstates what the cache can actually serve — a diagnostics line that lies is worse than no diagnostics line.
- **`bypass` refreshes as well as re-resolves.** Skipping only the read leaves the stale value for the next caller, so the user who pressed the manual Check button after installing a CLI would see the fresh answer once and the stale one immediately afterwards. The assertion that catches this is the *third* one in the bypass case — the later non-bypass call — not the obvious "the resolver ran" one.
- **Whole-cache clearing is deliberate, per-key invalidation is the trap.** Per-key invites a missed key, and the entry easiest to forget is `node`, whose staleness breaks MCP start rather than merely one provider's badge. The cache holds at most a handful of entries (node plus one per configured provider), so total clearing costs nothing.
- **The signature sorts the provider IDs, and that sort is load-bearing.** `Object.keys` returns insertion order, so a settings object rebuilt with its keys in a different order would produce a different signature, clear the cache on every settings save, and turn PERF-03 into a pessimisation — while still passing a naive "it invalidates on change" test. The plan deleted its `grep -c "\.sort("` gate in favour of `it("produces a stable signature regardless of provider key order")`, which asserts the behaviour rather than the implementation detail; the case also asserts the *premise* (`Object.keys(a)` genuinely differs from `Object.keys(b)`) and the *consequence* (`syncResolutionCacheSignature` returns `false` for the reordered map).
- **A missing command uses a NUL-prefixed sentinel (`"\u0000unset"`), written as an escape sequence in source.** A NUL byte cannot appear in a path on any platform Drift supports, so a provider whose command is literally the placeholder text cannot forge a match against a provider with no command configured. The signature is built and compared in memory only — **04-10 must not log it or write it to a file**, which is why `describeResolutionCache` deliberately emits the cache summary and never the signature.
- **`describeResolutionCache` emits no cached values at all**, which is stricter than T-04-04's ceiling (that register entry would permit a resolved binary path, since `getDiagnostics` already surfaces `nodeExecutable` at `index.ts:2796`). Key names, ages in seconds, a positive/negative marker and the clear count are everything a support bundle needs; the test asserts `/opt/homebrew` does not appear in the summary of a cache holding `/opt/homebrew/bin/node`. `clears` is exported in that line specifically so a cache being invalidated on every save — the failure mode an unsorted signature causes — shows up in diagnostics as a number rather than as unexplained slowness.
- **The first `syncResolutionCacheSignature` call after startup returns `true` and clears an empty cache.** Special-casing the `""` seed was rejected: it would hide a genuine first-turn change behind the same branch. 04-10 already plans to seed at init (`04-10-PLAN.md` T-04-20: *"Seeded at init so the first save does not clear spuriously"*), which makes the seed transition a no-op with an honest return value.
- **`requirements-completed` is deliberately empty.** `PERF-03` is in this plan's frontmatter, but `grep` for `resolution-cache`/`resolveWithCache` in `index.ts` returns **nothing**: `lastNodeExecutable` is still the infinite cache at `:119`, `resolveCommand` at `:848` still has none, and all twelve exports have zero production call sites. Plan 04-10 carries the integration. **Seventh consecutive Phase 4 plan making this call** after 04-01 (RUN-03/CMP-02/RUN-05), 04-02 (RUN-04), 04-03 (RUN-05), 04-04 (PERF-02), 04-05 and 04-06 (PERF-04), matching Phase 3's CI-02 precedent. `REQUIREMENTS.md` still reads `- [ ] **PERF-03**` and `| PERF-03 | Phase 4 | Pending |`, verified after the state updates.

## Deviations from Plan

Neither task deviated. Both files were written as specified, both passed their own `<verify>` on the first run, and no Rule 1/2/3 auto-fix was applied to any source file. The plan was executed literally — including the state-object shape override, the injected clock, the exact twelve exports in frontmatter order, and all six `it` titles whose substrings are the `04-VALIDATION.md` contract.

Two additions beyond the plan's enumerated assertion list, neither of which changes any `-t` count:

- The `-t "stable signature"` case additionally asserts the *premise* (`Object.keys(inserted)` is genuinely not `Object.keys(reordered)`) and the *consequence* (`syncResolutionCacheSignature` returns `false` for the reordered map). The plan's action names the consequence in prose — *"Without this, the cache could clear on every settings save for no reason"* — so asserting it rather than describing it is the same move 04-05 and 04-06 made with their in-suite value gates.
- `it("changes the signature when a provider is added or removed")` additionally asserts that a provider **present with no command** differs from a provider **absent**, which is the only thing that exercises the missing-command placeholder.

Three mechanical notes that are *not* deviations:

- Both new files were run through `pnpm exec prettier --write` (the repo's declared formatter; both paths are inside `pnpm format`'s glob). No pre-existing file was touched, so backlog 999.11's repo-wide sweep and the Phase 5-8 spawn-path byte-stability fence are unaffected. This follows 04-05's precedent for **created** files and is the inverse of 04-06's hand-alignment note, which applied only because 04-06 modified pre-existing files.
- Plan 04-10's literal call shapes were compiled against the shipped API in a scratch file outside the repo. Nothing was added to the working tree.
- Zero packages installed, as T-04-SC requires.

### Bookkeeping deviations

See the numbered entries under *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-06 all recorded, plus one authoring defect caught before commit.

## Issues Encountered

Both tasks passed their own `<verify>` commands on the first attempt and the 10-case suite was green on its first run. One authoring defect was caught before it reached a commit.

**0. [Rule 1 - Bug, caught pre-commit] A raw NUL byte in `resolution-cache.ts` silently disabled every `grep` gate over the file**

- **Found during:** Task 1, while verifying the missing-command placeholder.
- **Issue:** The placeholder was authored with a **literal** NUL character rather than the `\u0000` escape sequence. Git and `grep` both classify a file containing a NUL as **binary**, so `grep -n "MISSING_COMMAND_PLACEHOLDER" …` printed **nothing at all** and `grep -c '^import' …` printed nothing — while `pnpm typecheck` and `pnpm exec eslint --max-warnings 0` both exited **0**, because the byte is a legal string literal in TypeScript. This is the dangerous shape: every negative gate in this phase is of the form *"grep returns 0"*, and a binary file returns nothing, which reads as a pass. Had it been committed, the module would also have shown as a binary blob in every future diff.
- **Fix:** Replaced the byte with the source escape `"\u0000unset"` — identical runtime value, no NUL in the source bytes — via a Python byte-level substitution after `perl -0pi` silently failed (the `-0` flag sets `$/` to NUL, so the pattern spanning the NUL never matched a record; `-0777` would have been the slurp form). Confirmed by re-reading the file as bytes: `NUL count: 0`, and both greps then behaved normally.
- **Files modified:** `packages/backend/src/resolution-cache.ts` (pre-commit; the committed file has never contained a NUL).
- **Carry-forward:** when a module deliberately uses a control-character sentinel, verify the file's **bytes**, not its rendered text. `grep -an` (treat binary as text) is what exposed it — the plain `grep` gave no output and no error.

**1. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 through 04-06 recorded**

- **Found during:** post-summary state updates (not a task)
- **Issue:** Confirmed by `git diff -- .planning/STATE.md` against the committed baseline rather than by trusting exit codes. `advance-plan` advanced *Plan 7 of 11* → *8 of 11* but also reset `Status:` from "Executing Phase 4" to "Ready to execute" mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare `2026-08-14`. `record-metric` appended a 4-column orphan row below the `*Updated after each plan completion*` footer, unrelated to the differently-shaped **By Phase** table above it.
- **Fix:** Restored `Status: Executing Phase 4` and both descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 7 of 11`) and the **Recent Trend** last-5 list, and deleted the stray row.
- **Files modified:** `.planning/STATE.md`
- **Verification:** `git diff -- .planning/STATE.md` reduced to exactly the intended changes and nothing else.

**1b. [Confirmed again] `add-decision --phase 04` (zero-padded) writes the correct prefix**

- 04-06 resolved 04-05's open question and instructed the padded form. Used here, and it holds: every decision landed as `- [Phase 04]: [04-07]: …`, `grep -c '^- \[Phase 4\]:'` returns `0`. No `perl -0pi` repair needed. Second consecutive plan with no decision-prefix damage.

**1c. [Confirmed again] `state record-session` needs named flags**

- Invoked with `--stopped-at` / `--resume-file` per 04-02's and 04-06's warning, and the diff confirms all three fields landed. The positional form and the argument-less form both return `"recorded": true` while writing `Resume file: None` — the durable rule remains **named flags plus a diff**, never the exit code.

**2. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the seventh time**

- **Found during:** post-summary state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-06, reproduced exactly and in both of its forms. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — **`ROADMAP.md:329`, backlog item 999.1** (the event-driven `sendCliMessage` refactor) — and wrote Phase 4's count into it. It also re-mangled the Progress table's trailing cells.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 and the table row to `| 4. Platform Foundation | 7/11 | In Progress | - |`. What the helper got *right* and was kept: the `04-07-PLAN.md` checkbox → `[x]` and the `6/11` → `7/11` count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `git diff -- .planning/ROADMAP.md` reduced to exactly the intended lines. `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11` (all eleven 999.x items); `grep -c 'plans executed'` → `0`.
- **Carry-forward, unchanged:** every remaining Phase 4 plan will hit this. **Snapshot before, diff after** — a count-only check does **not** catch the trailing-cell mangling. Ordering matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**2b. [Confirmed again, still benign] `state update-progress` reports a percent it does not write**

- Identical to 04-05's and 04-06's observation: the JSON reports a plan-based percent while the only frontmatter field it changes is `completed_plans`, leaving `percent: 10` and the `Progress: [██░░░░░░░░] 20% (2 of 10 milestone phases)` line untouched. That is the **desired** outcome for this project, whose progress line counts milestone *phases*. Recorded again only because the gap between the reported number and the written one is exactly the shape a later reader would mistake for corruption.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [PERF-03]` and the workflow's default is to check it off. That default was **not** followed, for the reason under *Decisions Made*. `REQUIREMENTS.md` still reads `- [ ] **PERF-03**` and `| PERF-03 | Phase 4 | Pending |`, verified after the state updates.

## Threat Model Disposition

- **T-04-20 (Tampering / Elevation, stale cached binary path after a command change) — mechanism shipped, wiring pending.** `syncResolutionCacheSignature` clears the **whole** cache whenever `buildProviderCommandSignature` differs, and the signature covers every `providers[*].command` with the ids sorted. Falsifiable in both directions: `-t "invalidates on command change"` proves the clear *and* that the next resolution re-runs, while `it("does not clear when the provider commands are unchanged")` proves an unchanged settings object leaves the entry and the `clears` counter alone. Not mitigated in the running product until 04-10 calls it from `updateSettings`.
- **T-04-21 (Denial of Service (self), negative caching hiding a freshly installed binary) — mitigated by construction, wiring pending.** The window is bounded at 30 s by `RESOLUTION_NEGATIVE_TTL_MS`, proven distinct from the positive TTL by an assertion rather than by reading the constants. The escape hatch — `bypass`, wired to the manual Check button by 04-10 — always re-resolves *and* refreshes, which is what makes any TTL choice safe rather than a gamble.
- **T-04-22 (Denial of Service, unbounded cache growth) — accepted, as planned.** Keys are `node` plus one per configured provider (at most five). No eviction policy: entries expire by TTL, are deleted on the read that finds them expired, and the whole map is cleared on any command change. `describeResolutionCache` surfaces the count so an unexpected key explosion would be visible rather than silent.
- **T-04-04 (Information Disclosure, `describeResolutionCache` in diagnostics) — mitigated, and more strictly than the register requires.** The line carries key names, ages in seconds, a positive/negative marker and the clear count, and **no cached value at all** — the register would have permitted the resolved binary path, since `getDiagnostics` already surfaces `nodeExecutable`. Asserted directly: the summary of a cache holding `/opt/homebrew/bin/node` does not contain `/opt/homebrew`. The signature string, which carries the NUL sentinel, is never emitted.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed; `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across both commits. The module has no imports at all.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-10 is unblocked and its API expectations are already proven to compile.** `04-10-PLAN.md:151/:160/:168/:302/:320` names five literal call shapes; all five were type-checked against the shipped signatures with `--strict --noUncheckedIndexedAccess` and exit 0. Specifically confirmed: `Settings["providers"]` is `Record<string, { command: string; enabled: boolean }>` and is assignable to `buildProviderCommandSignature`'s `Record<string, { command?: string } | undefined> | undefined`; and `getNodeExecutable` (`() => Promise<string | undefined>`) can be passed directly as `resolve`. **No signature change is needed in 04-10.**
- **04-10 must not log or persist the signature string.** It contains a NUL sentinel for any provider configured without a command. Surface `describeResolutionCache(...)` in `getDiagnostics` — which never emits the signature — and nothing else from the invalidation path.
- **The seed transition returns `true`.** 04-10's plan to seed at init makes that a no-op over an empty cache, which is correct and is exactly why the seed is not special-cased inside the module. Do not "fix" `syncResolutionCacheSignature` to return `false` on the `""` → real transition: that would hide a genuine first-turn change.
- **The bypass has to thread through `checkProvider` to reach `checkProviderAvailability`.** `checkProviderAvailability` (`index.ts:1104-1109`) is a two-line RPC handler that calls `checkProvider` (`:902-918`), which calls `resolveCommand` (`:848`). 04-10's `options?.bypassCache` parameter must be added at all three levels or the escape hatch that T-04-21 depends on does not exist at the button.
- **04-10 also wires PERF-04 site 7** (`resolveCommand`'s `out` at `index.ts:854/:862`, reusing `SPAWN_STDOUT_MAX_CHARS` with head retention, per 04-05's inventory) into the *same function* this cache wraps. The two changes land in one place; keep the accumulator bound inside the `resolve` callback so the bounded read happens on a cache miss and not on every call.
- **`readResolutionCache` and `writeResolutionCache` have no planned production consumer.** 04-10 goes through `resolveWithCache` only. They are exported because they are the two halves `resolveWithCache` is composed from, and the diagnostics case uses `writeResolutionCache` to build a cache state without a resolver. Not stubs — same shape as `getClaudePrintDroppedChars` (04-06) and `droppedChars` (04-04/04-05).
- **Wave 1 is complete.** 04-05, 04-06 and 04-07 are all done; the phase's six pure modules (`platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `activity-tail.ts`, `bounded-buffer.ts`, `resolution-cache.ts`) all exist with sibling suites.
- `index.ts`, `claude-print.ts`, `command-resolution.ts`, `provider-launch.ts`, `mcp-runtime.ts`, `persistence.ts`, `platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `activity-tail.ts` and `bounded-buffer.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/resolution-cache.ts` — FOUND (212 lines, 0 imports, 12 exports, 0 NUL bytes, no wall-clock read)
- `packages/backend/src/resolution-cache.test.ts` — FOUND (308 lines, 10 cases, all 6 selectors resolve)
- `.planning/phases/04-platform-foundation/04-07-SUMMARY.md` — FOUND
- Commit `ccaa033` — FOUND
- Commit `98de3c7` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
