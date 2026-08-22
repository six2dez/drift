---
phase: 07-provider-spawn-registration
plan: 02
subsystem: api
tags: [capability-model, mcp, approvals, fail-closed, vue, pinia, vitest, typescript]

# Dependency graph
requires:
  - phase: 05-mcp-runtime-direct-spawn
    provides: "05-D-03's in-product limitation-statement shape, 05-D-11's key-names-never-values rule, and `planMcpCliRegistration`'s fail-closed discriminated union — the three shapes this plan copies rather than invents"
  - phase: 07-provider-spawn-registration (plan 01)
    provides: "The proven spawn slice this plan expands from; `windowsVerbatimArguments` on `spawnAndWait`'s no-env branch, which 07-03/07-04 need and this plan leaves untouched"
provides:
  - "`ProviderCapability` + `isProviderUsable` — provider status promoted from a presence boolean to a capability level, the boolean surviving only as a derived predicate (PD-01)"
  - "`PROVIDER_MCP_APPROVAL_CHANNELS` + `providerMcpApprovalChannel` — ONE source-verified per-CLI table deciding both the tool policy 07-03 sends and the sentence the provider card renders (D-04), fail-closed on an unknown id (D-06)"
  - "`SENSITIVE_MCP_TOOL_NAMES` / `excludeSensitiveToolNames` — the derived sensitive-tool filter 07-03's Codex allowlist consumes"
  - "The D-08 wire: `skippedMcpCliReasons` -> `checkProvider` -> `getProviderStatuses` -> the provider card, with the map's widened meaning documented at its declaration"
  - "An amber three-way status dot and a fourth conditional detail element rendering the limitation sentence"
  - "An upgraded `waitForApproval` refusal naming its cause, both env KEY names and where to look — unconditional, the safety net for a wrong table entry"
affects: [07-03, 07-04, 07-05, phase-09-ci-hardening, phase-10-ux-polish]

actuals:
  tokens: 8570
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Capability level over presence boolean: the narrower question is removed outright, not deprecated, so every unmigrated read is a compile error rather than a silent behaviour gap"
    - "One table, two surfaces: the same static per-CLI record decides a security posture and the user-facing sentence, so the two cannot disagree"
    - "Self-disambiguating sentences in place of a discriminator field, when the carrying map deliberately gains none"

key-files:
  created:
    - packages/shared/src/cli-providers.test.ts
  modified:
    - packages/shared/src/cli-providers.ts
    - packages/shared/src/mcp.ts
    - packages/backend/src/index.ts
    - packages/backend/assets/mcp-server.mjs
    - packages/frontend/src/stores/settings.ts
    - packages/frontend/src/stores/settings.test.ts
    - packages/frontend/src/views/SettingsView.vue

key-decisions:
  - "`ProviderStatus.available` is REMOVED, not deprecated — leaving it would let a stale consumer keep compiling against the narrower question; the compile errors ARE the migration checklist (7 backend + 5 frontend sites, all found by the compiler, none by grep)"
  - "The known-id check uses `Object.values(CliProvider).includes(id)`, not `id in PROVIDER_MCP_APPROVAL_CHANNELS` — `in` walks the prototype chain, so `toString` and `constructor` would have read as known providers and reached the table read"
  - "The skip reason WINS over the approval-channel verdict when both sources speak: 'Drift could not register this CLI at all' is a stronger fact than what it would have been able to do had it registered"
  - "A skip reason drops the dot to amber rather than leaving it green — a provider that resolved but was not registered is genuinely between states, and the sentence is what tells the two apart"
  - "`mcpCliForProviderId` reads THROUGH the existing `MCP_CLI_TO_PROVIDER` map rather than adding a second inverted one"
  - "The support bundle KEEPS `available` under its existing key, now derived, and adds `capability` + `limitation` beside it — the v2 diagnostics consumer's shape is unchanged"

patterns-established:
  - "Removing a field to force a migration: the plan's own acceptance gate ('typecheck is stronger than any grep') only holds if the old field is deleted, and the cost is that intermediate commits do not typecheck — see Deviation 1"
  - "A limitation never rides the error channel: `error` paints the status dot red, so a working-but-limited provider needs its own field and its own tone"

requirements-completed: [PRV-04, PRV-05, UX-01]

coverage:
  - id: D1
    description: "Provider status carries a three-level capability instead of a boolean, and usability is derived from it for every member of the union including a future fourth"
    requirement: PRV-04
    verification:
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#agrees with the capability level for every member of the union"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#treats an absent status as not usable"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#treats a limited provider as usable — a stated limitation is not a failure (PD-01)"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck => exit 0 with the boolean removed; 12 unmigrated reads were surfaced as compile errors and all migrated"
        status: pass
    human_judgment: false
  - id: D2
    description: "One table decides both the tool policy and the user-facing sentence, is exhaustive over the provider union, and fails closed on an unknown id"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#has an entry for every provider in the CliProvider union"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#fails closed on an empty provider id"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#fails closed on an arbitrary unknown provider id"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#never returns the working arm for an id outside the union"
        status: pass
    human_judgment: false
  - id: D3
    description: "The per-CLI verdicts are source-verified and carry their upstream citations: Gemini forwards its environment (with the surviving-keys analysis and the #28863 re-check note), Codex clears it and no registration flag can add to its whitelist"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#reports a working inherited channel for Gemini"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#reports no channel for Codex, with a limitation sentence"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#states Codex's limitation as a positive negative result, not as an inconclusive one"
        status: pass
      - kind: other
        ref: "grep -c 'VERIFIED' packages/shared/src/cli-providers.ts => 9 (>= 2)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every limitation sentence reads as 'registered, but limited' on its own, without depending on any other field (D-08)"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#carries no limitation sentence that claims the provider is unregistered or unsupported (D-08)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The sensitive-tool name set is derived from the shipped tool definitions, and the exclusion filter preserves order and duplicates while yielding the deny-all shape on an all-sensitive input"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#equals exactly the names the shipped tool definitions mark sensitive"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#removes exactly the sensitive names and preserves order and duplicates of the rest"
        status: pass
      - kind: unit
        ref: "packages/shared/src/cli-providers.test.ts#returns an empty array when every input name is sensitive — the deny-all shape"
        status: pass
    human_judgment: false
  - id: D6
    description: "`skippedMcpCliReasons` reaches `getProviderStatuses` and the provider card, and its widened meaning is documented at its only declaration"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "grep -c 'D-08' packages/backend/src/index.ts => 8 (>= 1); the declaration comment states both meanings and why no discriminator is added"
        status: pass
      - kind: other
        ref: "Source read: checkProvider -> applyProviderLimitation -> skippedMcpCliReasons.get(cli) on the resolved arm; getProviderStatuses returns those statuses unchanged"
        status: pass
    human_judgment: true
    rationale: "`index.ts` is not importable under vitest (aliasing `caido:plugin` is deferred to Phase 9), so no test executes `checkProvider`. The wire is verified by source read and by the compiler, which is strictly weaker than an executed assertion. 07-VALIDATION.md's manual row grades this in 07-05."
  - id: D7
    description: "A limited provider renders with an amber dot and a self-explaining sentence on its card; every frontend usability read goes through the shared predicate"
    requirement: PRV-04
    verification:
      - kind: unit
        ref: "packages/frontend/src/stores/settings.test.ts (13 tests, all four status fixtures migrated, green)"
        status: pass
      - kind: other
        ref: "grep -c 'isProviderUsable' packages/frontend/src/views/SettingsView.vue => 2 (>= 1); no local usability rule remains"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck => exit 0 (the component and the store ARE in the vue-tsc program)"
        status: pass
    human_judgment: true
    rationale: "No component test renders SettingsView.vue; the amber dot and the fourth detail element are proven present in source and type-correct, not proven to LOOK right. This is 07-VALIDATION.md's manual row: open Settings and confirm a limited provider reads as 'attached, but limited' without needing the dot to explain it."
  - id: D8
    description: "A refused sensitive tool now names its cause, both environment KEY names, and where the per-provider status is explained — with no value interpolation"
    requirement: PRV-05
    verification:
      - kind: other
        ref: "Source read of packages/backend/assets/mcp-server.mjs waitForApproval: the thrown string is `${toolName}` plus string literals only; DRIFT_APPROVALS_FILE / DRIFT_ACTIVITY_FILE appear as NAMES, never as interpolated values; the `||` pair condition is byte-unchanged"
        status: pass
    human_judgment: true
    rationale: "`mcp-server.mjs` is a standalone asset with no test harness in this repo — nothing imports or executes it under vitest. The assertion is a source read, and the message is user-visible prose whose usefulness only a human can grade."
  - id: D9
    description: "The command field gained a hint naming a bare command and a pinned Windows path, and gained no validator"
    requirement: UX-01
    verification:
      - kind: other
        ref: "git diff on SettingsView.vue: the @change handler is byte-unchanged; the only addition to the input is a :placeholder binding"
        status: pass
    human_judgment: true
    rationale: "Whether the hint actually teaches a Windows user that a pinned absolute path is accepted is a judgment about wording, not a testable property. UX-01's substance was delivered by 07-01's spawn work; this is the UI half."

# Metrics
duration: 12min
completed: 2026-08-22
status: complete
---

# Phase 7 Plan 02: Provider capability level Summary

**`ProviderStatus` promoted from an `available` boolean to a three-level `capability` with an optional `limitation`, backed by one source-verified per-CLI approval-channel table that fails closed on an unknown id and now feeds both the tool policy and an amber-dotted, self-explaining sentence on the provider card.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-22T11:09:00Z
- **Completed:** 2026-08-22T11:21:00Z
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- **The capability level exists and the boolean is gone.** `ProviderCapability` is `"available" | "limited" | "unavailable"`; `isProviderUsable` is the only surviving read of the old question. Removing `available` outright — rather than deprecating it — turned every stale consumer into a compile error: **12 of them**, 7 in the backend and 5 in the frontend, every one found by `tsc`/`vue-tsc` and none by grep. That is the acceptance gate working exactly as the plan argued it would.
- **One table, two surfaces.** `PROVIDER_MCP_APPROVAL_CHANNELS` is a `Record<CliProvider, McpApprovalChannel>`, so an omitted provider is a compile error rather than a runtime `undefined` that would silently reach the fail-closed arm meant for genuinely unknown ids. 07-03's Codex allowlist and the provider-card sentence read the same entry.
- **Fail closed, with the non-happy branch written first.** `providerMcpApprovalChannel` rejects an unrecognised id before it ever reads the table. Both unknown-id cases are asserted, plus three prototype-chain ids — see Decisions for why that mattered.
- **The D-08 wire is open.** `skippedMcpCliReasons` reached only `getDiagnostics` before this plan; it now reaches `checkProvider` -> `getProviderStatuses` -> the provider card, which is what 05-D-03 intended and never built. Its declaration comment now states both meanings an entry can carry and why it deliberately gains no discriminator.
- **The refusal explains itself.** `waitForApproval`'s message named the tool and nothing else. It now names the cause, both environment KEY names (never values), the mechanism, and Settings -> CLI Providers. Unconditional and independent of any table verdict — the safety net for an entry that is wrong on someone's machine.
- **19 new unit cases** in the repo's first `packages/shared` test file, all provable in the browser-and-QuickJS-safe zero-import module.

## Task Commits

1. **Task 1 (TDD RED): the shared suite** — `2727e2c` (test) — 19 cases, all failing
2. **Task 1 (TDD GREEN): capability level + approval-channel table + derived sensitive-tool filter** — `f45e033` (feat)
3. **Task 2: backend migration and the D-08 wire, plus the MCP refusal upgrade** — `b312d36` (feat)
4. **Task 3: provider card capability rendering and the UX-01 field hint** — `aa84094` (feat)

_No REFACTOR commit: the GREEN implementation needed no cleanup pass._

## Files Created/Modified

- `packages/shared/src/cli-providers.ts` — `ProviderCapability`, `isProviderUsable`, `McpApprovalChannel`, `PROVIDER_MCP_APPROVAL_CHANNELS`, `providerMcpApprovalChannel`, `isCliProvider`; `ProviderStatus` reshaped (gains `capability` + `limitation`, loses `available`)
- `packages/shared/src/cli-providers.test.ts` — **new**, 19 cases across five describes
- `packages/shared/src/mcp.ts` — `SENSITIVE_MCP_TOOL_NAMES`, `excludeSensitiveToolNames`
- `packages/backend/src/index.ts` — `checkProvider` returns capabilities; `applyProviderLimitation` + `mcpCliForProviderId` added beside the skip-reason map; the map's declaration comment rewritten for D-08; three status reads and the support-bundle projection migrated
- `packages/backend/assets/mcp-server.mjs` — the `waitForApproval` refusal text
- `packages/frontend/src/stores/settings.ts` — three reads through `isProviderUsable`
- `packages/frontend/src/stores/settings.test.ts` — all four status fixture sites
- `packages/frontend/src/views/SettingsView.vue` — `getProviderDotClass` (three-way), `getCommandPlaceholder`, `isProviderAvailable` delegating to the shared predicate, a fourth conditional detail element, a `placeholder` binding

## Decisions Made

- **`Object.values(CliProvider).includes(id)`, not `id in PROVIDER_MCP_APPROVAL_CHANNELS`.** The obvious known-id check is an `in` test against the table. `in` walks the prototype chain, so `"toString"`, `"constructor"` and `"__proto__"` would all have answered "known" and then indexed the table — reaching the working arm for an id that is not a provider at all. That is precisely the elevation-of-privilege path T-07-09 disposes as `mitigate`, so the test asserts those three ids explicitly alongside the empty and arbitrary ones.
- **The skip reason wins when both sources speak.** A provider Drift could not register at all is a stronger fact than what it would have been able to do had it registered, so the live map overwrites the static table's sentence.
- **A skip reason drops the dot to amber, not green.** The alternative — leaving a resolved-but-unregistered provider green because "the binary is there" — is the same false-reassurance failure the whole capability promotion exists to remove.
- **The support bundle keeps `available`, derived.** A v2 diagnostics consumer parsing this JSON does not break; `capability` and `limitation` are added beside it. Three keys where there was one, and the derived boolean is the concrete form of "the boolean is demoted to a derived detail".
- **No second inverted provider map.** `mcpCliForProviderId` iterates the existing `MCP_CLI_TO_PROVIDER` rather than declaring its mirror; two tables would be two things to keep in step, which is the same argument D-04 makes one level up.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm -r typecheck` cannot be green at the task 1 and task 2 boundaries, by construction of the plan's own decision**

- **Found during:** Task 1
- **Issue:** Task 1's `<acceptance_criteria>` requires `pnpm -r typecheck` to exit 0, and task 2's repeats it. But task 1's *action* removes `available` from `ProviderStatus`, and the plan's own reasoning for doing so is that this "turns every unmigrated read into a compile error, which is stronger than any grep over the call sites." Those two cannot both hold at the task 1 boundary: the 7 backend reads migrate in task 2 and the 5 frontend reads migrate in task 3, so the criterion is first satisfiable only at the end of task 3. Task 2's copy of the criterion is unsatisfiable for the same reason — `settings.ts` and `SettingsView.vue` are in the `vue-tsc` program and are task 3's work.
- **Fix:** Executed the tasks in the plan's order and verified the criterion where it is meaningful. Per-task, the gates actually run were: **task 1** — new suite green (19/19), full suite green (458 passed / 5 skipped), `pnpm lint` exit 0, `packages/shared` `tsc --noEmit` exit 0, and the 7 backend compile errors recorded as the migration checklist; **task 2** — `packages/shared` and `packages/backend` typecheck exit 0 with only the 5 known frontend sites failing, full suite green, lint exit 0; **task 3** — `pnpm -r typecheck` exit 0 across all three packages, full suite green, lint exit 0. The must-have (promote, boolean removed) outranks the literal per-task form of the gate, exactly as 07-01 deviation 1 resolved its own plan-internal contradiction.
- **Files modified:** none beyond the planned set — this is a verification-sequencing deviation, not a code change.
- **Verification:** `pnpm -r typecheck` exit 0 at HEAD; the intermediate failures were exactly the 12 sites the plan predicted and are listed above.
- **Committed in:** n/a — no source change.
- **Consequence a reader should know:** commits `2727e2c`, `f45e033` and `b312d36` do **not** typecheck standalone. A `git bisect` across this plan's range will hit that. The alternative — one giant commit — would have lost the per-task atomicity the executor contract requires, and deferring the field removal to a later task would have removed the compile-error migration checklist that is the whole point of the promote decision.

**2. [Rule 2 - Missing critical] The known-id check was hardened against prototype-chain keys**

- **Found during:** Task 1
- **Issue:** The plan says "an id that is not a key of the table". The literal implementation of that is `id in PROVIDER_MCP_APPROVAL_CHANNELS`, which answers `true` for `"toString"`, `"constructor"`, `"valueOf"` and `"__proto__"` because `in` walks the prototype chain. Those ids would then index the table, get `undefined`, and be returned as the channel — reaching neither arm honestly, and in the `07-03` consumer that reads `channel.kind === "None"` to decide the allowlist, an `undefined` channel takes the *permissive* path. That is T-07-09's elevation-of-privilege threat arriving through the door D-06 was written to close.
- **Fix:** `isCliProvider` uses `Object.values(CliProvider).includes(id)`, with the reason recorded in a comment beside it, and the test asserts `__proto__`, `constructor` and `toString` never return the working arm.
- **Files modified:** `packages/shared/src/cli-providers.ts`, `packages/shared/src/cli-providers.test.ts`
- **Verification:** `packages/shared/src/cli-providers.test.ts#never returns the working arm for an id outside the union` — green.
- **Committed in:** `2727e2c` (assertion), `f45e033` (implementation)

---

**Total deviations:** 2 auto-fixed (1 blocking plan-internal contradiction, 1 missing critical hardening)
**Impact on plan:** No scope creep. Deviation 1 changed no code — it resolved a contradiction inside the plan in favour of its own stated must-have, and records the bisect consequence honestly rather than hiding it. Deviation 2 closed a real fail-open path on the exact predicate the plan's threat model marks `high`.

## Issues Encountered

- None beyond Deviation 1's sequencing. `packages/shared/tsconfig.json` has **no** test-file exclude (unlike backend and frontend), so `packages/shared/src/cli-providers.test.ts` **is** in the type-check program — a stronger position than the plan assumed for the other two packages, and worth knowing before anyone "fixes" the inconsistency.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run packages/shared/src/cli-providers.test.ts` | 19 passed |
| `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` | 13 passed |
| `pnpm exec vitest run` (whole suite) | 33 files passed, 1 skipped — 458 passed, 5 skipped (the win32 file skips on macOS, as designed) |
| `pnpm -r typecheck` | exit 0 (shared, backend, frontend) |
| `pnpm lint` (`--max-warnings 0`) | exit 0 |
| `grep -c '^import' packages/shared/src/cli-providers.ts` | 0 — the data-only contract holds |
| `grep -c '^import' packages/shared/src/mcp.ts` | 0 |
| `grep -c 'VERIFIED' packages/shared/src/cli-providers.ts` | 9 (criterion: >= 2) |
| `grep -c 'D-08' packages/backend/src/index.ts` | 8 (criterion: >= 1) |
| `grep -c 'isProviderUsable' packages/frontend/src/views/SettingsView.vue` | 2 (criterion: >= 1) |
| `checkProvider` error strings byte-unchanged | `git diff -U2` on those two returns shows only the capability field changed |
| Command-field change handler byte-unchanged | `git diff` on `SettingsView.vue` shows no `-`/`+` line touching `updateProviderCommand` |
| Provider-card status expressions | exactly four: the three-way dot class binding plus three `v-if="... !== undefined"` elements (resolvedPath, error, limitation) |
| Status fixture sites migrated | 4 of 4 — found by searching the status shape (lines 167-176, 212, 223-225, 264), counted before editing |
| Refusal text: key names only | thrown string is `${toolName}` + literals; `DRIFT_APPROVALS_FILE` / `DRIFT_ACTIVITY_FILE` appear as names, never interpolated |
| No dependency added (T-07-SC) | `git diff --stat HEAD~4 HEAD -- package.json pnpm-lock.yaml packages/*/package.json` is empty |
| STATE.md / ROADMAP.md untouched | `git status --porcelain .planning/STATE.md .planning/ROADMAP.md` empty |

## Known Stubs

None.

## Threat Flags

None new. The plan's `<threat_model>` dispositions were honoured:

- **T-07-09 (EoP, high)** — fail-closed branch written first, both unknown-id cases asserted, and hardened beyond the plan against prototype-chain ids (Deviation 2). The `Record<CliProvider, …>` keying makes an omitted provider a compile error.
- **T-07-10 (Info disclosure, medium)** — the upgraded refusal carries key NAMES and no interpolation of any environment value or path (05-D-11), and points at Settings rather than dumping state.
- **T-07-11 (Info disclosure, medium)** — **carried forward, and this is the one to watch.** The wire this plan opened now renders whatever `skippedMcpCliReasons` holds, and `registerMcpWithCli` still interpolates a CLI's raw `result.stderr` into that map (`index.ts`, the `mcp add exited with code …` branch). **07-03 removes that interpolation.** Until it does, a CLI's stderr can reach the provider card. The plans were sequenced deliberately so no *shipped* commit does that; if 07-03 slips, this is the first thing to re-check.
- **T-07-12 (Spoofing, medium)** — the unconditional refusal upgrade is the safety net, and the Gemini entry carries its `#28863` re-check note.
- **T-07-SC (Tampering, high)** — no package installed; `package.json` and `pnpm-lock.yaml` unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 07-03 and 07-04.** Both consume what this plan built:

- 07-03's Codex allowlist reads `providerMcpApprovalChannel` and `excludeSensitiveToolNames`. Both are pure, zero-import and unit-proven; neither needs `index.ts` to be importable.
- 07-04's failure sentences write into `skippedMcpCliReasons`, whose declaration now states the binding constraint: **every sentence must disambiguate "registered, but limited" from "never registered" on its own.** The map gains no discriminator; that rejection is what makes the wording requirement binding.

**Carried forward, at true strength:**

- **PRV-05 is source-verified, never measured.** No CLI binary was executed. The Gemini verdict rests on reading `mcp-client.ts` and `environmentSanitization.ts`; the Codex verdict on `stdio_server_launcher.rs`, `utils.rs` and `mcp_cmd.rs`. Do not report it as more than that (D-05's caveat, Pitfall E).
- **Gemini's entry is a re-check point.** `google-gemini/gemini-cli#28863` is open and moves toward more sanitization; strict mode (`GITHUB_SHA` / `SURFACE=Github`) already drops every `DRIFT_*` key, which would kill the channel inside any Drift CI job that shells a real gemini.
- **T-07-11's stderr interpolation is live until 07-03 lands.** Named above.
- **The D-08 wire is verified by compiler and source read, not by an executed test.** `index.ts` remains un-importable under vitest (aliasing `caido:plugin` is deferred to Phase 9), so `checkProvider` -> `applyProviderLimitation` is unexercised by construction. 07-VALIDATION.md's manual row is the closing evidence and 07-05 grades it.
- **Three commits in this range do not typecheck standalone.** See Deviation 1 before bisecting.

---
*Phase: 07-provider-spawn-registration*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All 8 key files present on disk (`[ -f ]` on each of the 1 created and 7 modified paths — all FOUND).
- All 4 commits resolve in `git log --oneline --all`: `2727e2c`, `f45e033`, `b312d36`, `aa84094`.
- Every `<acceptance_criteria>` from all three tasks re-run at HEAD and passing, with the single documented exception in Deviation 1 (the mid-migration typecheck gate, satisfied at the end of task 3 as the table above records).
- Plan-level `<verification>` re-run at HEAD: `pnpm -r typecheck` exit 0, `pnpm exec vitest run` green (458 passed / 5 skipped), `pnpm lint` exit 0. The manual read of the amber dot and the limitation sentence is recorded as a human row (D7), not claimed as a machine result.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes. `REQUIREMENTS.md` also untouched: PRV-04 and PRV-05 are declared by 07-03, 07-04 and 07-05 as well, so the shared-ID gate holds them until the last declaring plan finishes.
