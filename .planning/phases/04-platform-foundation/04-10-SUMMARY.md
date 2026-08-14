---
phase: 04-platform-foundation
plan: 10
subsystem: infra
tags: [typescript, performance, ttl-cache, invalidation, negative-caching, bounded-buffer, diagnostics, quickjs]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "04-07's resolution-cache.ts (createResolutionCacheState, resolveWithCache, buildProviderCommandSignature, syncResolutionCacheSignature, describeResolutionCache, the two TTL constants), 04-05's bounded-buffer.ts (createBoundedBuffer, appendBounded, renderBoundedBuffer, SPAWN_STDOUT_MAX_CHARS) and 04-09's ./bounded-buffer import block in index.ts"
provides:
  - "packages/backend/src/index.ts — the FIRST production call sites for resolution-cache.ts; all twelve exports go from zero consumers to wired"
  - "One bounded cache serving BOTH binary-resolution paths: resolveCommand under cmd:<command> and the node path under node, via a single getCachedNodeExecutable helper"
  - "The infinite, never-invalidated lastNodeExecutable is deleted — for node this is a TIGHTENING, not a new cache"
  - "getDiagnostics no longer bypasses the cache: its unconditional direct getNodeExecutable() call now goes through getCachedNodeExecutable"
  - "checkProviderAvailability — the manual Check button — forces a fresh resolve through an options?.bypassCache parameter threaded checkProvider -> resolveCommand -> resolveWithCache"
  - "Whole-cache invalidation on any providers[*].command change, seeded at init so the first save after a restart does not clear spuriously"
  - "getDiagnostics reports the cache contents, ages and polarity plus both TTLs rendered from the exported constants"
  - "PERF-04 site 7 bounded — resolveCommand's `out` accumulator, the seventh and last one in index.ts"
affects: [04-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A read-through cache wrapped around an existing function body moved verbatim into a resolver callback, so the function's public shape and its short-circuit both survive"
    - "One helper owning a cache key literal, so a rename cannot split the cache in two"
    - "An invalidation hook placed by DATA-FLOW ordering (ahead of the consumer that bakes the resolved value into a file) rather than by the plan's suggested textual neighbour"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts

key-decisions:
  - "The invalidation sits IMMEDIATELY after the settings merge, ahead of the MCP-refresh branches, not next to the session-reset flag the plan named as its textual neighbour. refreshActiveMcpRuntime calls requireNodeExecutable, whose candidate list is built from the provider commands, and bakes the result into a freshly written wrapper — and the frontend pushes the WHOLE settings object, so input.caidoApi !== undefined is true on every save from the UI. Clearing after that branch would spawn from exactly the stale entry T-04-20 exists to prevent. Every stated acceptance criterion (line order, not conditioned on the reset flag, computed from the merged providers) still holds."
  - "No separately captured pre-merge signature local. syncResolutionCacheSignature already holds the pre-merge signature in state.signature (seeded at init, re-synced on every save), so the comparison genuinely spans the merge; a captured local would have no reader and would fail @typescript-eslint/no-unused-vars at --max-warnings 0 — task 2's own verify. This is 04-09's stdoutDroppedChars lesson applied preventively rather than after a red lint run."
  - "getCachedNodeExecutable's body is written on ONE line, verbatim from the plan's action, because the acceptance criterion is a literal `{ key: \"node\"` grep that a Prettier-style multi-line object breaks. The file already carries 80 lines over 100 characters and eslint-config-prettier only DISABLES formatting rules, so nothing enforces a wrap."
  - "Two keys reach the same binary and that is not double caching: `node` is the VALIDATED executable (passed --version), `cmd:node` is the raw unvalidated `which` hit used only as a candidate input. Recorded as a table in the source comment and never conflated (T-04-29)."
  - "PERF-03 and PERF-04 were NOT marked complete. 04-11 is the phase verification plan, carries both IDs and grades the phase-wide claims; tenth consecutive Phase 4 plan deferring the traceability write."

patterns-established:
  - "When a plan's acceptance gate anchors on a CALL FORM (`fn(firstArg`), the argument must stay on the open-paren line — a Prettier-shaped wrap silently zeroes the gate while the code is correct. Caught by running the gate, not by reading the diff"
  - "A rationale comment must not contain an identifier whose gate is a RAW grep with an exact expected count; name the thing instead of the token (second phase-4 instance, after 04-09's seenActivityIds)"

requirements-completed: []  # Deliberately empty — see Decisions Made. 04-11 carries PERF-03 and PERF-04 sign-off.

# Metrics
duration: 9min
completed: 2026-08-14
---

# Phase 4 Plan 10: PERF-03's Cache Wired Into index.ts, and PERF-04's Last Accumulator Summary

**The two binary-resolution paths that behaved inconsistently — `lastNodeExecutable`, an infinite never-invalidated cache, and `resolveCommand`, which had none and re-spawned `which` plus a version-manager directory walk on every check — now go through one bounded cache with a 5-minute positive TTL, a 30-second negative TTL, whole-cache invalidation on any `providers[*].command` change and a mandatory bypass on the user's manual Check button; `getDiagnostics`, which called the resolver **directly** and would otherwise have kept paying the full cost on every support-bundle render, was rewired in the same edit, and PERF-04's seventh and last accumulator — `resolveCommand`'s `out`, the one every earlier inventory grep was structurally blind to — is bounded in the function body the cache wraps.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-14T14:31:56Z
- **Completed:** 2026-08-14T14:40:35Z
- **Tasks:** 2 (2 commits)
- **Files modified:** 1 (`packages/backend/src/index.ts`, +186 / -43)

## Accomplishments

- **`resolution-cache.ts` went from twelve exports with zero production call sites to wired.** `resolveWithCache(resolutionCache` appears exactly twice — `cmd:<command>` inside `resolveCommand`, `node` inside `getCachedNodeExecutable` — and `syncResolutionCacheSignature(resolutionCache` exactly twice (the init seed and the `updateSettings` invalidation).
- **The dead-conditional trap the plan warned about was avoided by measurement.** `getDiagnostics` calls the resolver **unconditionally and directly**; it never read `lastNodeExecutable`. `sed -e 's://.*::' … | grep -c "await getNodeExecutable()"` now returns **`0`**, so no caller bypasses the cache.
- **`lastNodeExecutable` is gone in the code-only view (`0`), and `lastNodeSearchCandidates` survives at exactly `3`** — declaration, assignment, and the `getDiagnostics` read. The diagnostics data was not collateral damage.
- **The point-free call site that `grep "checkProvider("` cannot see was found and rewritten.** `ids.map(checkProvider)` → `ids.map((id) => checkProvider(id))`; without it, adding `options?: { bypassCache?: boolean }` is a hard `TS2345`. All five sites were enumerated by the **bare identifier**, as the plan mandates.
- **PERF-04 is complete for `index.ts`.** `sed … | grep -c "out += \|stderr += "` returns **`0`** over the broad pattern that plan 04-11's Gate 7 uses — seven of seven, not six of seven. `createBoundedBuffer(` = **6**, `appendBounded(` = **7**, exactly the counts 04-11 grades.
- **Zero regressions.** Suite unchanged at **29 files / 245 tests / 0 failures**; `pnpm typecheck`, `pnpm exec eslint …/index.ts --max-warnings 0`, `pnpm lint` and `pnpm build` all exit 0. Blast radius is one file; **zero packages installed** (T-04-SC).

## The seven-site inventory, closed

| # | Site | Mechanism | Status |
|---|------|-----------|--------|
| 1 | `spawnAndWait` stdout | `appendBounded` / `SPAWN_STDOUT_MAX_CHARS` / head | done (04-09) |
| 2 | `spawnAndWait` stderr | `appendBounded` / `SPAWN_STDERR_MAX_CHARS` / tail | done (04-09) |
| 3 | `sendCliMessage` stdout | `appendBounded` / `CLI_STDOUT_MAX_CHARS` / both | done (04-09) |
| 4 | `sendCliMessage` stderr | `appendBounded` / `CLI_STDERR_MAX_CHARS` / tail | done (04-09) |
| 5 | `callMcpMethod` stderr | `appendBounded` / `MCP_SELFTEST_STDERR_MAX_CHARS` / tail | done (04-09) |
| 6 | `callMcpMethod` `stdoutBuffer` | `drainCompleteLines` / `MCP_SELFTEST_LINE_MAX_CHARS` | done (04-09) |
| 7 | `resolveCommand`'s `out` (`:1237` decl, `:1248` append) | `appendBounded` / **reuses** `SPAWN_STDOUT_MAX_CHARS` / head | **done (this plan)** |

Site 7 is bounded rather than excluded. The available exemption — "it is only `which`, the output is one short path, and there is a 1-second timeout" — is the same argument plan 04-09 rejects for `callMcpMethod` ("the timeout bounds the window, not the volume"). Shipping that reading in one place while rejecting it in the other is how an inconsistency becomes a precedent, so the reason is written at the site.

## Which key is authoritative for `node`

| Key | Value | Produced by | Authoritative for |
|-----|-------|-------------|-------------------|
| `node` | the **validated** executable — a candidate that exists and whose `--version` exited `0` | `getNodeExecutable` | **Yes.** The path Drift actually spawns, and the only value `requireNodeExecutable` and `getDiagnostics` read |
| `cmd:node` | the raw `which node` PATH hit, **unvalidated** — may not even be executable | `resolveCommand("node")` | No. One *input* to the candidate list, never an answer (T-04-29) |

The nesting is a saving rather than a duplication: a miss on `node` costs at most a **cached** `cmd:node` hit instead of a second `which` spawn. That table is reproduced as a comment at `getCachedNodeExecutable`, which is the single `{ key: "node"` call site — a helper rather than two inline literals, so a future key rename cannot split the cache in two.

## Task Commits

Each task was committed atomically:

1. **Task 1: Route resolveCommand and the node resolution path through the one cache, with bypass plumbing** — `016a026` (perf)
2. **Task 2: Invalidate on provider-command change and report the cache in diagnostics** — `3203a4e` (feat)

## Files Created/Modified

- `packages/backend/src/index.ts` — one new local import (`./resolution-cache`, seven symbols); `lastNodeExecutable` and both its write sites deleted and replaced by a `const resolutionCache` singleton; `resolveCommand` given an options parameter with its body moved verbatim into a `resolveWithCache` resolver callback and its `out` accumulator bounded; `getCachedNodeExecutable` added; `requireNodeExecutable` and `getDiagnostics` rewired through it; `checkProvider` given an options parameter, `checkProviderAvailability` passing `{ bypassCache: true }`, `getProviderStatuses`' point-free map rewritten; the init seed and the `updateSettings` invalidation added; two new `getDiagnostics` keys.

## Verification Evidence

| Gate | Command | Result |
|---|---|---|
| **T1** infinite cache gone | `sed -e 's://.*::' … \| grep -c "lastNodeExecutable"` | **`0`** |
| **T1** diagnostics data survives | `grep -c "lastNodeSearchCandidates" …` | `3` (decl `:190`, assign `:2041`, read `:3489`) |
| **T1** two cache call sites | `grep -c "resolveWithCache(resolutionCache" …` | `2` — `:1219` (`cmd:<command>`), `:2072` (`node`); bare token `3`, incl. the import |
| **T1** both node consumers cached | `grep -c "await getCachedNodeExecutable()" …` | `2` — `:2081` (`requireNodeExecutable`), `:3442` (`getDiagnostics`) |
| **T1** one node key literal | `grep -c '{ key: "node"' …` | `1` — `:2072` |
| **T1** nothing bypasses the cache | `sed … \| grep -c "await getNodeExecutable()"` | **`0`** |
| **T1** manual Check bypasses | `grep -n "bypassCache: true" …` | one line, `:1538`, inside `checkProviderAvailability` |
| **T1** point-free site gone | `grep -c 'ids.map(checkProvider)' …` | `0` |
| **T1** wrapper form present | `grep -c 'map((id) => checkProvider(id))' …` | `2` (rewritten `:1526`, pre-existing `:1917`) |
| **T1** all five callers enumerated | `grep -n "checkProvider" …` (bare identifier) | `:1294` decl, `:1526` rewritten, `:1538` bypass, `:1917` unchanged, `:2425` unchanged |
| **T1** short-circuit before the cache | `grep -n "path.isAbsolute(command)\|resolveWithCache(resolutionCache, {"` | `:1211` **<** `:1219` |
| **T1** site 7 bounded | `sed … \| grep -c "out += "` | **`0`** |
| **T1** phase-wide accumulator pattern | `sed … \| grep -c "out += \|stderr += "` | **`0`** (04-11 Gate 7's broad form) |
| **T1** buffer counts | `sed … \| grep -c "createBoundedBuffer(" / "appendBounded("` | **`6`** / **`7`** |
| **T1** diagnostics still resolves node | `grep -n "nodeExecutable: nodeExecutable" …` | `:3488`, `\|\| "not found"`, fed by the `node` key |
| **T2** two signature call sites | `grep -c "syncResolutionCacheSignature(resolutionCache" …` | `2` (bare token `3`, incl. the import) |
| **T2** invalidation is post-merge | `grep -n "currentSettings = { ...currentSettings\|syncResolutionCacheSignature(resolutionCache"` | `1375` (merge) **<** `1398` (updateSettings) **<** `3680` (init seed) |
| **T2** not conditioned on the reset flag | `grep -n "resetCliSessions" …` vs `git show HEAD~2:…` | `2` uses, same forms (`const …` + `if (…) cliSessions.clear();`), only line numbers moved |
| **T2** diagnostics keys | `grep -n "resolutionCache: describeResolutionCache\|resolutionCacheTtls:"` | `:3497` / `:3500`, TTLs rendered from `RESOLUTION_POSITIVE_TTL_MS` / `RESOLUTION_NEGATIVE_TTL_MS` |
| **T2** no env enumeration | `sed … \| grep -cE 'Object\.(keys\|entries\|values)\(process\.env\)'` | `0` |
| **T2** signature never leaked | `grep -n "providerSignature\|seedSignature" …` | 4 lines, all `buildProviderCommandSignature` → `syncResolutionCacheSignature`; no log, no write |
| **T2** log line is ASCII | codepoint scan of the new `sdk.console.log` line | `0` characters above `0x7E` |
| Typecheck | `pnpm typecheck` | exit 0 (shared, backend, frontend) |
| Lint (file) | `pnpm exec eslint …/index.ts --max-warnings 0` | exit 0 |
| Lint (repo-wide) | `pnpm lint` | exit 0 |
| Full suite | `pnpm exec vitest run` | **29 files / 245 tests / 0 failed** (unchanged from 04-09) |
| Build | `pnpm build` | exit 0, `dist/drift.zip` produced |
| **NUL byte scan** (04-07 carry-forward) | byte-level `node` read of `index.ts` | `0` NULs in 150,967 bytes; `git diff --numstat HEAD~2 HEAD` = `186 43`, i.e. git sees text, so every `grep` gate above is meaningful |
| D-03 fence | `git diff --stat HEAD~2 -- …/command-resolution.ts` | empty |
| Phase 5 fence | `git diff -U0 HEAD~2 -- …/index.ts \| grep -E '(renderExportExecScript\|writeMcpWrapper\|writeLaunchScript\|shellQuote\|chmod)'` | no match |
| CMP-01 tripwire | `git diff --stat HEAD~2 -- …/provider-launch.ts …/provider-launch.test.ts` | empty |
| Blast radius | `git diff --name-only HEAD~2` | exactly `packages/backend/src/index.ts` |
| No deletions | `git diff --diff-filter=D --name-only HEAD~2` | empty |
| No new dependencies (T-04-SC) | `git diff --stat HEAD~2 -- package.json packages/backend/package.json pnpm-lock.yaml` | empty |

## Decisions Made

- **The invalidation is placed by data flow, not by textual neighbourhood, and this is the one judgement call in the plan.** The action says to place it "alongside the existing `resetCliSessions` handling" — which is `if (resetCliSessions) cliSessions.clear();`, *after* the two `input.caidoApi !== undefined` MCP-refresh branches. That ordering is unsafe, and the reason was measured rather than guessed: `refreshActiveMcpRuntime` calls `requireNodeExecutable()`, whose candidate list is built from `currentSettings.providers` (both `getKnownHomeDirs()` and `absoluteProviderCommands`), and writes the resolved path into a fresh MCP wrapper. `packages/frontend/src/stores/settings.ts:338` pushes `settings.value` — the **whole** settings object — so `input.caidoApi !== undefined` is true on **every** save from the settings UI, and that branch runs on the very save that changed a provider command. Invalidating afterwards would let the stale entry be baked into the wrapper, which is precisely T-04-20. Moving the hook to immediately after the merge satisfies every stated acceptance criterion — it is after the merge line, it computes from the merged `currentSettings.providers`, and it is its own condition rather than a rider on the reset flag — and closes the window.
- **No separately captured pre-merge signature.** The plan's action says "capture the signature before the merge"; mechanically, `syncResolutionCacheSignature` already *holds* the pre-merge signature in `state.signature` (seeded at init, re-synced on every save), so the comparison spans the merge without a local. A captured local would have no reader and would fail `@typescript-eslint/no-unused-vars` at `--max-warnings 0`, which is task 2's own `<verify>` — the identical trap 04-09 hit with `stdoutDroppedChars`, avoided here before a red run rather than after one. The reason is commented at the site. No race: the init seed runs inside the same `Promise.all` whose `.finally` resolves `dataReady`, and `updateSettings` awaits `dataReady` first.
- **`getCachedNodeExecutable`'s body is one line, verbatim from the plan.** The acceptance criterion is a literal `{ key: "node"` grep, which a Prettier-shaped multi-line object silently zeroes — the first draft did exactly that and the gate read `0`. Writing it as the plan gives it satisfies both the criterion and the action, and costs nothing: `index.ts` already has 80 lines over 100 characters (max 783), and `eslint-config-prettier/flat` only *disables* formatting rules, so nothing in the toolchain enforces a wrap.
- **The `path.isAbsolute` short-circuit stays outside the cache, and the reason is written at it.** It is one `fileExists` call, not worth an entry, and caching it would let a deleted or replaced absolute path linger for the whole 5-minute positive TTL (T-04-25). It is evaluated at `:1211`, before the cache lookup opens at `:1219`.
- **`Date.now()` is read only at the `index.ts` call sites.** `resolution-cache.ts` reads no wall clock at all, which is exactly what makes its expiry tests deterministic; keeping the clock on this side of the boundary is what preserves that property.
- **`resolveCommand`'s body moved verbatim into the resolver callback.** The only logic change inside it is site 7's conversion, and even that is behaviour-preserving below the cap: `renderBoundedBuffer(out)` is byte-identical to the string that used to accumulate, and the `close` handler now reads it **once** into `const resolved` instead of calling `.trim()` twice — today's exact semantics with one fewer call.
- **`process.execPath` was left alone.** It is absent from Caido's LLRT `process` object, so `getNodeExecutableCandidates`' `execPath` candidate contributes nothing in production. The optional chaining already handles it and `pushUniqueCandidate` drops `undefined`; the plan's instruction not to "restore" it as a Windows candidate was followed, and nothing here assumes it yields a free `node.exe`.
- **The log line is ASCII.** An em-dash in the first draft was replaced with a colon. This is the Windows-port phase; a legacy console code page mangling a diagnostic line is a small, avoidable own-goal, and the phase already checks emitted strings for codepoints above `0x7E`.
- **`requirements-completed` is deliberately empty, and both IDs are now code-complete.** **PERF-03** is fully wired: both resolution paths go through one cache, invalidation and the bypass are in place, and diagnostics reports it. **PERF-04** is now complete for `index.ts` as well — site 7 was the last one, and the broad `out += \|stderr += ` pattern returns `0`. Neither is marked here because `index.ts` has zero direct test coverage, so both claims rest on static gates plus unit-proven mechanisms, and 04-11 is the phase verification plan that carries both IDs and grades them. **Recommendation to 04-11, stated so the deferral does not become permanent by inertia:** PERF-02, PERF-03 and PERF-04 can all be marked complete on the combined 04-04/04-05/04-06/04-07/04-09/04-10 evidence once Gate 7 confirms seven of seven. Tenth consecutive Phase 4 plan making this call. `REQUIREMENTS.md` still reads `- [ ] **PERF-03**` / `- [ ] **PERF-04**` and `| PERF-03 | Phase 4 | Pending |`, verified after the state updates.

## Deviations from Plan

The plan's code was executed literally: every mandated symbol, every mandated rationale comment, the verbatim one-line helper body, the two-key table, the bypass thread through all three levels, the point-free rewrite, and site 7's three edits. Every acceptance criterion in both tasks passes. No Rule 1/2/3 auto-fix was needed on any source file — the two adjustments below are gate- and correctness-forced, and neither weakens a gate.

### Adjustments the gates and the data flow forced, which are *not* deviations

- **The invalidation hook sits after the merge rather than next to the session-reset flag.** Explained in full under *Decisions Made*. Every acceptance criterion the plan states for this hook is satisfied; the move closes a window in which `refreshActiveMcpRuntime` would resolve Node from a cache that was about to be cleared. This is the plan's own T-04-20 disposition applied to the ordering the plan did not examine.
- **Two rationale comments were reworded so they could not defeat their own gates.** The first draft's invalidation comment contained the token `resetCliSessions` twice, which is graded by a **raw** `grep -n` required to show that variable's uses "unchanged from their pre-plan form"; it now says "the session-reset flag declared above". Directly analogous to 04-09's `seenActivityIds` finding, and the second instance in this phase. Separately, no comment contains `resolveWithCache(resolutionCache`, `syncResolutionCacheSignature(resolutionCache`, `await getCachedNodeExecutable()`, `{ key: "node"`, `bypassCache: true`, `ids.map(checkProvider)` or `lastNodeSearchCandidates`, each of which is graded by a raw exact-count grep. Comments that *do* mention `lastNodeExecutable` are safe by design: that gate runs over the `sed -e 's://.*::'` code-only view, which the plan chose specifically so the mandated "this tightens the former infinite cache" note could be written as a trailing comment.
- **Both `syncResolutionCacheSignature` calls keep `resolutionCache` on the open-paren line.** The first draft wrapped the arguments Prettier-style, which zeroed the `syncResolutionCacheSignature(resolutionCache` gate while the code was entirely correct — caught by running the gate, not by reading the diff. Introducing a named `providerSignature` / `seedSignature` local for the second argument keeps both lines short *and* the anchor intact.

### Mechanical notes that are *not* deviations

- **`prettier --write` was deliberately NOT run on `index.ts`.** It is inside `pnpm format`'s glob but is part of backlog 999.11's pre-existing debt, and `--write` would reformat pre-existing lines — including the Phase 5 scope-fence functions this plan must leave byte-stable. New code was hand-written in a shape consistent with the file. Same call 04-06, 04-08 and 04-09 made, for the same reason.
- Zero packages installed, as T-04-SC requires. `package.json`, `packages/backend/package.json` and `pnpm-lock.yaml` are byte-identical across both commits.
- `dist/` is gitignored, so the `pnpm build` run left the working tree clean.

### Bookkeeping deviations

See *Issues Encountered* — the known `gsd-sdk` misfires that 04-01 through 04-09 all recorded, reproduced for the tenth time.

## Issues Encountered

No blocking issues in the source work. Both tasks passed `pnpm typecheck`, `pnpm exec eslint --max-warnings 0` and the full suite; the only source-side corrections were the two gate-form fixes recorded above, both caught by running the gates rather than by a failing build.

**0. [Gate-form defect, caught pre-commit] A Prettier-shaped argument wrap silently zeroed two exact-count gates**

- **Found during:** Task 2, running the acceptance criteria before committing.
- **Issue:** `syncResolutionCacheSignature(\n  resolutionCache,\n  …\n)` is correct code that typechecks, lints and behaves identically — and makes `grep -c "syncResolutionCacheSignature(resolutionCache"` return **`0`** instead of `2`. The same class had already bitten `{ key: "node"` in task 1 (multi-line object → `0` instead of `1`). Neither is detectable from `typecheck`, `lint` or the suite; only running the gate exposes it.
- **Fix:** Both call sites reshaped so the first argument sits on the open-paren line, using named signature locals to keep the lines short. `getCachedNodeExecutable`'s body written on one line, verbatim from the plan's action.
- **Carry-forward:** when a gate anchors on a **call form**, the formatting of that call is load-bearing. Run the gate, do not infer it from the diff — this phase's gates are overwhelmingly `grep -c … returns N`, and a wrap reads as a broken implementation while a comment reads as a passing one.

**1. [Rule 1 - Bug] `roadmap update-plan-progress 4` overwrote backlog item 999.1 for the tenth time**

- **Found during:** post-summary state updates (not a task)
- **Issue:** The known carry-forward from 04-01 through 04-09, reproduced exactly and in both forms. `### Phase 4: Platform Foundation` has no `**Plans:**` line, so the helper's regex matches the first one in the file — **`ROADMAP.md:329`, backlog item 999.1** (the event-driven `sendCliMessage` refactor) — and writes Phase 4's count into it. It also re-mangles the Progress table row's trailing cells.
- **Observed:** `**Plans:** 0 plans` → `**Plans:** 10/11 plans executed`, and the Progress row's trailing cells mangled again, undoing 04-09's tidy.
- **Fix:** Restored `**Plans:** 0 plans` on 999.1 and the table row's trailing cells. What the helper got *right* and was kept: the `04-10-PLAN.md` checkbox → `[x]` and the `9/11` → `10/11` count.
- **Files modified:** `.planning/ROADMAP.md`
- **Verification:** `git diff` against the committed baseline reduced to exactly the intended lines; `grep -c '^\*\*Plans:\*\* 0 plans$'` → `11`, `grep -c 'plans executed'` → `0`.
- **Carry-forward, unchanged:** one plan remains in this phase and it will hit this. **Snapshot before, diff after** — a count-only check does not catch the trailing-cell mangling. Ordering matters: the helper counts `*-SUMMARY.md` files on disk, so it must run *after* the summary is written.

**2. [Rule 1 - Bug] `state advance-plan` and `state record-metric` left the same residues 04-02 through 04-09 recorded**

- **Found during:** post-summary state updates (not a task)
- **Issue:** Confirmed by `git diff -- .planning/STATE.md` against the committed baseline, never by exit code. `advance-plan` advanced *Plan 10 of 11* → *11 of 11* but also reset `Status:` mid-phase and flattened both `last_activity` (frontmatter) and `Last activity` (Current Position) to a bare date. `record-metric` appended a 4-column orphan row below the `*Updated after each plan completion*` footer, unrelated to the differently-shaped **By Phase** table above it.
- **Fix:** Restored `Status: Executing Phase 4` and both descriptive activity lines, relocated the metric into the **By Phase** row (`04 | 10 of 11`) and the **Recent Trend** last-5 list, and deleted the stray row.
- **Files modified:** `.planning/STATE.md`

**2b. [Confirmed again] the named-flag rules hold, and the hand-maintained Velocity line was checked against history**

- `add-decision --phase 04` (zero-padded) wrote the correct `[Phase 04]` prefix — fifth consecutive plan with no decision-prefix damage. `record-session` was invoked with `--stopped-at` / `--resume-file`; the positional and argument-less forms both return `"recorded": true` while writing `Resume file: None`, so the durable rule remains **named flags plus a diff**, never the exit code. `update-progress` again reported a plan-based percent while writing only `completed_plans`, leaving the milestone-phase-based `Progress:` line untouched — the desired outcome here, recorded for the fifth time so it is not mistaken for corruption. The Velocity `Total plans completed:` line was verified against `git log -- .planning/STATE.md` rather than blindly incremented (04-09's carry-forward): it read `24` and is correct through 04-09, so it goes to `25`.

**3. [Deliberate omission, not a misfire] `requirements mark-complete` was not run**

- The plan's frontmatter carries `requirements: [PERF-03, PERF-04]` and the workflow's default is to check them off. That default was **not** followed, for the reason under *Decisions Made*, with the explicit recommendation to 04-11 recorded there.

## Threat Model Disposition

- **T-04-20 (Tampering / Elevation, stale cached binary path after a command change) — NOW MITIGATED IN THE RUNNING PRODUCT, and more tightly than the plan's placement would have been.** `updateSettings` clears the whole cache whenever the signature built from the merged `providers` differs from the pre-merge one the cache holds, and the hook sits **ahead of** `refreshActiveMcpRuntime`, which resolves Node from those same provider commands and writes the result into a fresh MCP wrapper. Seeded at init so the first save after a restart does not clear spuriously. The mechanism is unit-proven by 04-07's `-t "invalidates on command change"` and its unchanged-settings partner.
- **T-04-21 (Denial of Service (self), negative caching hiding a freshly installed CLI) — NOW MITIGATED IN THE RUNNING PRODUCT.** The window is bounded at 30 s by `RESOLUTION_NEGATIVE_TTL_MS`, and the escape hatch exists at the button: `checkProviderAvailability` → `checkProvider(providerId, { bypassCache: true })` → `resolveCommand(command, options)` → `resolveWithCache`'s `bypass`, which always re-resolves **and** refreshes. All three levels were required; a gap at any one of them would have left the flag unreachable from the UI.
- **T-04-29 (Tampering, reading the unvalidated `cmd:node` entry as "the Node executable") — mitigated by construction.** `getCachedNodeExecutable` is the single `{ key: "node"` call site and the only sanctioned node read; `requireNodeExecutable` and `getDiagnostics` both go through it and nothing reads `cmd:node` as an answer. The distinction is a table in the source comment, not folklore.
- **T-04-25 (Tampering, absolute-path resolution being cached) — mitigated.** The `path.isAbsolute` short-circuit is evaluated at `:1211`, before the cache lookup at `:1219`, so a deleted or replaced absolute path is re-checked on every call rather than lingering for the positive TTL. The reason is commented at the branch.
- **T-04-04 (Information Disclosure, `describeResolutionCache` in diagnostics) — mitigated, and more strictly than the register requires.** The new `resolutionCache` field carries key names, ages in seconds, a positive/negative marker and the clear count, and **no cached values** — 04-07 built it that way deliberately. No provider *command* strings beyond what `getDiagnostics` already reported, nothing derived from enumerating `process.env` (gate returns `0`), and the invalidation **signature is never emitted, logged or persisted** — it carries a NUL sentinel for a provider configured without a command, which would both leak a control character into a log and binary-classify any file it reached.
- **T-04-22 (Denial of Service, unbounded cache growth) — accepted, as planned.** Keys are `node` plus one `cmd:<command>` per configured provider (at most five, since `resolveCommand` is only reached for non-absolute commands). Entries expire by TTL, are deleted on the read that finds them expired, and the whole map is cleared on any command change. `describeResolutionCache` surfaces the count, so a key explosion would be visible rather than silent.
- **T-04-05 (Denial of Service, total-volume accumulators) — NOW FULLY MITIGATED for `index.ts`.** Site 7 was the residual 04-09 named explicitly. All seven sites are capped with per-site retention and a counted `buildTruncationMarker`; the broad `out += \|stderr += ` pattern returns `0`.
- **T-04-17 (overflow policy) — unchanged and honoured.** No `proc.kill` was added to enforce a bound. The existing `child.kill("SIGKILL")` in `resolveCommand` is the pre-existing **1-second timeout**, untouched by this plan and unrelated to the cap.
- **T-04-18 (Repudiation, silent truncation) — mitigated at the new site.** `renderBoundedBuffer(out)` emits the cumulative marker whenever anything was dropped, so a truncated `which` result is marked rather than silently short.
- **T-04-SC (Tampering, package installs) — n/a.** Zero packages installed across both commits; only local module imports were added.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 04-11 (phase verification) is unblocked, and its Gate 7 can now assert seven of seven.** The counts it grades are `sed -e 's://.*::' … | grep -c "createBoundedBuffer("` = **6**, `"appendBounded("` = **7**, and the broad `"out += \|stderr += "` = **0**. Use the broad pattern: `stdout += ` contains `out += `, so the narrow inventory grep would report a false `0` while a site named `out` hid behind it.
- **The traceability recommendation, consolidated:** PERF-02 (04-09), PERF-03 (this plan) and PERF-04 (04-06 + 04-09 + this plan) are all code-complete with passing static gates. 04-11 carries all three IDs and is the right place to mark them. RUN-03, RUN-05 and CMP-02 were similarly recommended by 04-08; RUN-04 stays Pending until Phase 5 wraps the `.tmp`/`chmod`/`rename` pair.
- **Line numbers in every earlier Phase 4 summary are now stale for `index.ts`** — it has taken +450/-20 (04-08), +181/-41 (04-09) and +186/-43 (this plan). Re-locate by content, never by number. The current anchors, all re-measured after both commits: `resolveCommand` `:1204` (absolute short-circuit `:1211`, cache open `:1219`), its `out` declaration `:1237` and append `:1248`, `checkProvider` `:1294`, `updateSettings`' merge `:1375` and invalidation `:1397-1402`, `getProviderStatuses`' rewritten map `:1526`, `checkProviderAvailability`'s bypass `:1538`, `getNodeExecutable` `:2029` (`lastNodeSearchCandidates` assign `:2041`), `getCachedNodeExecutable` `:2071-2073`, `requireNodeExecutable` `:2075`, `getDiagnostics`' node read `:3442` and its two new keys `:3497`/`:3500`, the init seed `:3679-3680`.
- **`readResolutionCache` and `writeResolutionCache` still have no direct production consumer**, exactly as 04-07 predicted — `index.ts` goes through `resolveWithCache` only. They are the two halves it is composed from, not stubs.
- **Phase 5 owns the spawn path and this plan did not touch it.** `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote` and every `chmod` call are absent from both commits' diffs. `resolveCommand` still spawns the literal `which`; the Windows `where.exe` branch is a later phase's, and the comment at site 7 already names both.
- **Known non-blocker for the verifier:** `index.ts` has zero direct test coverage, so this integration is proven by static gates, `typecheck`, `lint`, `build` and the existing 245-test suite — not by behaviour. The mechanisms are unit-proven elsewhere: 10 cases in `resolution-cache.test.ts` and 16 in `bounded-buffer.test.ts`.
- `resolution-cache.ts`, `bounded-buffer.ts`, `activity-tail.ts`, `platform.ts`, `fs-retry.ts`, `runtime-probe.ts`, `claude-print.ts`, `command-resolution.ts`, `provider-launch.ts`, `mcp-runtime.ts` and `persistence.ts` are all untouched by this plan.

## Self-Check: PASSED

- `packages/backend/src/index.ts` — FOUND (modified; 150,967 bytes, 0 NUL bytes, `git diff --numstat HEAD~2 HEAD` = `186 43`, so git sees text and every grep gate is meaningful)
- `.planning/phases/04-platform-foundation/04-10-SUMMARY.md` — FOUND
- Commit `016a026` — FOUND
- Commit `3203a4e` — FOUND

---
*Phase: 04-platform-foundation*
*Completed: 2026-08-14*
