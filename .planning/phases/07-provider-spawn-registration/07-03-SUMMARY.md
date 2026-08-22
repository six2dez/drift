---
phase: 07-provider-spawn-registration
plan: 03
subsystem: infra
tags: [windows, mcp, registration, gemini-cli, codex-cli, credential-hygiene, fail-closed, vitest]

# Dependency graph
requires:
  - phase: 07-provider-spawn-registration (plan 01)
    provides: "`buildSpawnPlan` and `windowsVerbatimArguments` forwarded into `spawnAndWait`'s NO-ENV branch — the only channel these registration and pre-clean spawns have"
  - phase: 07-provider-spawn-registration (plan 02)
    provides: "`providerMcpApprovalChannel` (the capability table that decides Codex's tool policy), `excludeSensitiveToolNames`, and the `skippedMcpCliReasons` -> provider-card wire this plan had to make safe"
  - phase: 05-kill-shell-wrappers
    provides: "The surviving POSIX wrapper and its three `DELETED IN PHASE 7 (PRV-03)` notices, plus 05-D-10's literal-token precedent and 05-D-11's key-names-never-values rule"
provides:
  - "`buildMcpCliRegistrationEnv` — one Drift-variables dict projected into each CLI's registration payload, with D-03's per-session strip and D-06's fail-closed allowlist built in"
  - "`buildMcpCliRegistrationArgv` — the complete `mcp add` argv per CLI, with each parser's own ordering and flag spelling"
  - "`CAIDO_TOKEN_REFERENCE`, `MCP_CLI_ENV_FLAG`, `MCP_CLI_REGISTRATION_SCOPES`, `MCP_CLI_REMOVAL_SCOPES`, `MCP_CLI_SERVER_NAME`, `McpCliName`"
  - "`planMcpCliRegistration` reshaped: the register arm carries argv, the win32 skip is gone, and two fail-closed arms precede it"
  - "Gemini/Codex registration on EVERY platform, both spawns routed through the phase's spawn plan with its verbatim-arguments flag"
  - "SC-7 discharged: the four wrapper symbols, the last permission-bit spawn and all three deletion notices are gone"
affects: [07-04, 07-05, phase-08-process-lifecycle, phase-09-ci-hardening, phase-10-ux-polish]

actuals:
  tokens: 19400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Payload builder as the security boundary: the per-session strip and the sensitive-tool filter are STRUCTURAL steps inside the builder, not caller discipline — the builder distrusts its own caller"
    - "One table, two readers: `MCP_CLI_EXPANDS_ENV_REFERENCES` decides both what the payload substitutes and what the planner refuses, so the substitution and its guard cannot disagree"
    - "Deletion forced into the rewrite commit by the compiler: under `noUnusedLocals` + `--max-warnings 0`, a module-scope function that loses its last caller is a hard build failure, so a green typecheck IS the proof both halves landed together"

key-files:
  created: []
  modified:
    - packages/backend/src/mcp-server-spec.ts
    - packages/backend/src/mcp-server-spec.test.ts
    - packages/backend/src/mcp-server-spec.spawn.test.ts
    - packages/backend/src/index.ts

key-decisions:
  - "Codex carries the LITERAL Caido token in `~/.codex/config.toml` (checkpoint option `literal-plus-guarantees`, chosen by the user). This DEVIATES from ROADMAP SC-3, which authorises only a `${VAR}` reference or a token-file indirection for Codex; the user was offered an SC-3 amendment and declined it, so the roadmap text stands and this summary is the record of the deviation."
  - "Gemini carries a token REFERENCE, and registration is REFUSED when the reference is used and Drift's own spawn environment has no non-empty token — the loud check that reopens 05-D-10 honestly rather than silently"
  - "The pre-clean removes EVERY scope Drift has ever written for Gemini, not just the one it writes now: releases up to Phase 5 passed no `--scope`, so their entry went to the project scope, and a workspace entry shadows the user one"
  - "`mcp-server-spec.ts`'s import count went 1 -> 2 (it now reads `shared`), and the header's count claim was updated rather than left stale — computing Codex's filtered allowlist at the call site would have put a second sensitive-tool list one import away from the shipped one"
  - "`redactDebugText`'s shell arm is KEPT even though Drift no longer writes `export CAIDO_TOKEN='…'` anywhere — debug text is whatever a spawned CLI prints, and narrowing a redactor fails OPEN"

patterns-established:
  - "Refuse-before-register branch order: every new hazard arm in `planMcpCliRegistration` is written above the register arm, so no input reaches a spawn ahead of a refusal"
  - "Both-directions guard assertions: the unbacked-reference refusal is asserted alongside its positive case, because the negative alone passes for a planner that never registers anything"

requirements-completed: [PRV-03, PRV-04, PRV-05]

coverage:
  - id: D1
    description: "Gemini and Codex register with the validated Node executable plus arguments plus an explicit environment on EVERY platform — the Phase 5 win32 skip is gone"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration returns the REGISTER arm on win32 — the Phase 5 Windows skip is gone"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration registers on win32, darwin and linux alike, carrying the planned argv"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration fails closed on an unknown platform rather than falling through to the POSIX arm"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gemini's registration is written into USER scope, with the flags ahead of the positionals its parser requires"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationArgv puts every Gemini flag BEFORE the positionals and ends with node then the script"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationArgv puts the Codex server name first, then the flag pairs, then the separator"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationArgv uses each CLI's OWN env-flag spelling, not a shared one"
        status: pass
    human_judgment: false
  - id: D3
    description: "No Caido credential reaches Gemini's settings file or its `mcp add` command line; the reference is refused when unbacked, in both directions"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv carries a token REFERENCE for Gemini — exactly one expandable key, and it is the token"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationArgv never puts the Caido token BYTES on Gemini's command line"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration refuses Gemini when the reference is used and the spawn environment carries no token"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration registers Gemini when the reference is used and the spawn environment carries a non-empty token"
        status: pass
    human_judgment: false
  - id: D4
    description: "Codex's payload carries no variable-reference syntax anywhere, and a payload that did would be refused rather than registered"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv carries the LITERAL token for Codex, with no reference syntax anywhere in the payload"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration refuses Codex when its payload carries ANY expandable reference"
        status: pass
    human_judgment: false
  - id: D5
    description: "Codex is offered a read-only tool set — the sensitive group is absent from its allowlist, derived from the shipped tool definitions rather than restated"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv gives Codex a sensitive-filtered allowlist derived from the shared filter, not a second list"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv gives Gemini the full policy allowlist, sensitive names included"
        status: pass
    human_judgment: false
  - id: D6
    description: "Neither registration payload carries a per-session file path, even when the caller over-supplies them"
    requirement: PRV-05
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv strips the two per-session file keys for BOTH CLIs even when the caller supplies them"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpCliRegistrationEnv preserves the shipping Drift key ORDER minus the stripped per-session pair"
        status: pass
    human_judgment: false
  - id: D7
    description: "Drift's half of D-05: the per-session paths DO reach the spawn environment for a session that has runtime files, and do NOT for a session that does not"
    requirement: PRV-05
    verification:
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec per-session channel (D-05, Drift's half) puts both per-session file paths in the spawn environment, with their exact values, for a session that HAS runtime files"
        status: pass
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec per-session channel (D-05, Drift's half) puts NEITHER per-session file path in the spawn environment for a session that has none"
        status: pass
    human_judgment: false
  - id: D8
    description: "Both registration spawns go through the phase's spawn plan AND deliver its verbatim-arguments flag, so a `.cmd`-resolved Gemini or Codex on Windows registers instead of failing or receiving corrupted argv"
    requirement: PRV-03
    verification:
      - kind: other
        ref: "awk '/^async function registerMcpWithCli/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments' => 2"
        status: pass
      - kind: other
        ref: "grep -c 'buildSpawnPlan(' packages/backend/src/index.ts => 3 (>= 2); no spawn in the registration helper passes the resolved binary directly"
        status: pass
    human_judgment: true
    rationale: "`index.ts` is not importable under vitest (no `caido:plugin` alias), so nothing executes `registerMcpWithCli`. The flag's DELIVERY is proven by an awk-scoped source count and by the compiler, which is strictly weaker than an executed assertion. Only a real Windows Caido closes it — 07-05 grades this row."
  - id: D9
    description: "No CLI's raw stderr reaches a user-visible reason string or the support bundle (T-07-11, live since 07-02, closed here)"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "awk '/^async function registerMcpWithCli/,/^}/' packages/backend/src/index.ts | sed -e 's://.*::' | grep -c 'stderr' => 0"
        status: pass
      - kind: other
        ref: "git diff on the four per-CLI guard assignments => empty (their sentences are byte-unchanged, as 07-02 renders them on the provider card)"
        status: pass
    human_judgment: false
  - id: D10
    description: "The shared POSIX wrapper and the four functions that rendered it no longer exist, no code path writes a shell script on any platform, and the last permission-bit spawn is gone (SC-7)"
    verification:
      - kind: other
        ref: "grep -c over packages/backend/src/index.ts: renderExportExecScript 2->0, shellQuote 3->0, writeMcpWrapper 4->0, getMcpWrapperPath 3->0, spawnAndWait(\"chmod\" 1->0"
        status: pass
      - kind: other
        ref: "sed -e 's://.*::' packages/backend/src/index.ts | grep -c '\\.sh' => 0 (pre-phase 1); repository-wide DELETED IN PHASE 7 (PRV-03) => 0 (pre-phase 3)"
        status: pass
      - kind: other
        ref: "enforceOwnerOnlyDir's fs/promises namespace chmod confirmed still present (index.ts:801-814); .github/workflows/windows-llrt-probe.yml's DELETED IN PHASE 9 header confirmed untouched"
        status: pass
    human_judgment: false
  - id: D11
    description: "A crashed or hard-killed Drift leaves a Codex registration entry holding a live credential in a file outside the swept temp root"
    verification: []
    human_judgment: true
    rationale: "BACKSTOP, not a delivered guarantee. Nothing in this plan can assert what a crash leaves behind. The guarantee is carried by 07-04's unconditional dual-CLI startup sweep and by the removal being exit-zero idempotent — this row exists so the residual is not mistaken for closed."

# Metrics
duration: 15min
completed: 2026-08-22
status: complete
---

# Phase 7 Plan 03: Gemini/Codex env-passing registration Summary

**Gemini and Codex now register on every platform with `node` + args + an explicit `-e`/`--env` environment built by a pure module — Gemini with a `${CAIDO_TOKEN}` reference refused when unbacked, Codex with the literal token and a sensitive-filtered read-only allowlist — and the POSIX shell wrapper, its four rendering functions and the last `chmod` spawn were deleted in the same commit the compiler forced them into.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-22T09:25:00Z
- **Completed:** 2026-08-22T09:40:00Z
- **Tasks:** 3
- **Files modified:** 4

## The checkpoint, and the roadmap deviation it creates

**Checkpoint (`checkpoint:decision`): where the Caido session token rests for Codex once the wrapper is deleted.**

**Resolved by the user: option `literal-plus-guarantees`.** The literal Caido token is written into `~/.codex/config.toml`, with the two conditions this plan already carried:

1. 07-04's unconditional dual-CLI startup sweep runs **outside** the four gates that keep today's pre-clean from firing on the paths that matter.
2. A failed removal is logged as a security event carrying the exact remediation command.

**This deviates from ROADMAP SC-3, knowingly, and the roadmap text was NOT amended.**

SC-3 authorises exactly two shapes for Codex: a `${CAIDO_TOKEN}` reference, or a `DRIFT_TOKEN_FILE` indirection. Research established that the first is **impossible** — Codex performs no expansion anywhere on its read path (`create_env_for_mcp_server` does `env.insert(name, value)` verbatim), so the reference text would be handed to the MCP server *as* the token, always, not merely when unset. That leaves the indirection, which research recommends against for this phase. The shipped choice is the literal, which SC-3 does not name.

The user was separately offered an SC-3 amendment — the same amend-in-place move that was applied to SC-2 earlier in this planning run — and **declined it**. So SC-3 still reads as it did, this implementation does not satisfy it as written, and this paragraph is the record. It should not be softened, and it should not be closed by editing the roadmap after the fact: the user's decision was to accept the deviation, not to redefine the criterion.

**What the residual actually is.** A live Caido session token rests in a home-directory file between sessions, outside the swept temp root and outside the accepted per-user temp ACL baseline. Any backup, profile-sync or dotfile repository covering the home directory captures it. Removing the entry later deletes the bytes from the live file; it does not recall them from a backup taken while they were there. This is the phase's highest-severity accepted residual (T-07-03).

## Deferred Ideas (recorded here, not built)

- **`DRIFT_TOKEN_FILE` indirection for Codex.** The natural companion to the deferred temp-directory ACL hardening (**HRD-01**, v2). Worth stating explicitly: **the ACL work would not have covered `~/.codex/config.toml` anyway**, because that file lives outside the temp root entirely — so the indirection is not a subset of HRD-01, it is the only mechanism that would close this particular exposure. Its cost, unchanged from research: a new environment key, a read with its own failure handling in `mcp-server.mjs`, a decision about frozen-at-start versus per-call re-reading (only the per-call form buys token rotation, which is the sole reason to prefer a file over a value), and a matching write, lifetime and cleanup in `index.ts`. 05-D-10 declined to build exactly this in the phase whose job was deleting mechanisms; the same argument held here.

## Accomplishments

- **`mcp-server-spec.ts` gained the registration half of the phase.** `buildMcpCliRegistrationEnv` projects one Drift-variables dict into each CLI's payload; `buildMcpCliRegistrationArgv` turns that payload into each CLI's own `mcp add` command line. Both are pure, so the Windows-relevant behaviour is provable on the Linux runner — which matters more here than anywhere else, because this is the path PRV-03 changes on Windows and `index.ts`, where it is called, is not importable under vitest.
- **Two fail-closed arms, written above the register arm.** Codex is refused if its payload carries *any* expandable reference (that CLI cannot expand, so the text would become the value). Gemini is refused if it uses the reference and Drift's own spawn environment has no non-empty token — the silently-unauthenticated failure mode 05-D-10 rejected, now caught at the registration site instead of inside the CLI.
- **D-03 enforced structurally.** `DRIFT_ACTIVITY_FILE` and `DRIFT_APPROVALS_FILE` are stripped inside the builder even when the caller supplies them, and the test supplies them deliberately. For Gemini a registration-time value would clobber a live inherited one with a path from a dead session; for Codex the channel is dead anyway.
- **D-06 expressed as a payload rather than a runtime refusal.** When the capability table reports no approval channel, the allowlist becomes the sensitive-filtered form from `excludeSensitiveToolNames`, the confirmation list is forced empty and the confirm flag goes off. A tool absent from `DRIFT_ALLOWED_TOOLS` is never even *listed* to that CLI. `DRIFT_ALLOWLIST_ACTIVE` stays `"1"`, which is what makes an empty allowlist mean deny-all rather than allow-all.
- **T-07-11 closed.** `registerMcpWithCli` no longer interpolates a CLI's raw `result.stderr` into the log line or into `skippedMcpCliReasons` — the map 07-02 wired to the provider card and that already reaches the diagnostics bundle. The reason now carries three scalars: the CLI, the operation, the exit code. 07-02's summary named this as the first thing to re-check if 07-03 slipped; it did not slip.
- **`--scope user` on the write, and EVERY scope on the pre-clean.** Gemini's `--scope` defaults to `project`, which writes `<cwd>/.gemini/settings.json` and hard-exits 1 when cwd is the home directory. Drift passed no scope before this plan, so it wrote project-scope entries — which a removal covering only the user scope would leave in place, still pointing at the wrapper this same commit deletes, and shadowing the new user-scope entry.
- **SC-7 discharged in the same commit as the rewrite**, because the compiler leaves no other option: under `noUnusedLocals` plus `eslint --max-warnings 0`, `renderExportExecScript`, `shellQuote`, `getMcpWrapperPath` and `writeMcpWrapper` become hard build failures the moment they lose their last caller. A green typecheck IS the proof both halves landed together.

## Task Commits

1. **Task 1 (TDD RED): the registration payload, argv and guard assertions** — `606ff57` (test)
2. **Task 1 (TDD GREEN): `buildMcpCliRegistrationEnv` / `buildMcpCliRegistrationArgv` / reshaped planner** — `a69b4aa` (feat)
3. **Task 2: register through the plan, and delete the wrapper in the same commit** — `6c66bdf` (feat)

**Task 3** produced no commit by design: it is SC-7's measurement task, and every gate already read zero on the tree task 2 left. Its recorded values are in the table below.

_No REFACTOR commit: the GREEN implementation needed no cleanup pass._

**Bisect warning.** Commits `606ff57` and `a69b4aa` do **not** typecheck standalone — see Deviation 1. 07-02 recorded the same property for three of its commits, for the same structural reason.

## Files Created/Modified

- `packages/backend/src/mcp-server-spec.ts` — `McpCliName`; `McpCliRegistration`'s register arm now carries `argv`; `planMcpCliRegistration` reshaped (win32 arm and wrapper arm deleted, two hazard arms added); new exports `CAIDO_TOKEN_REFERENCE`, `MCP_CLI_ENV_FLAG`, `MCP_CLI_REGISTRATION_SCOPES`, `MCP_CLI_REMOVAL_SCOPES`, `MCP_CLI_SERVER_NAME`, `buildMcpCliRegistrationEnv`, `buildMcpCliRegistrationArgv`; header import-count claim updated 1 -> 2
- `packages/backend/src/mcp-server-spec.test.ts` — the `planMcpCliRegistration` describe rewritten; two new describes; 25 cases total in the file
- `packages/backend/src/mcp-server-spec.spawn.test.ts` — D-05's Drift-half describe, built through the production builders per the file's standing rule
- `packages/backend/src/index.ts` — `registerMcpWithCli` and `tryRegisterMcpForProviders` rewritten; four functions, three deletion notices and the last `chmod` spawn removed; `rename` dropped from the `fs/promises` import; five stale wrapper comments rewritten

## SC-7 deletion checklist — measured, beside its pre-phase value

Pre-phase tree is `4203dbd` (`docs(state): record phase 7 planning session`), the last commit before any Phase 7 code.

| Gate | Command | Pre-phase | Now |
|---|---|---|---|
| `renderExportExecScript` | `grep -c 'renderExportExecScript' packages/backend/src/index.ts` | 2 | **0** |
| `shellQuote` | `grep -c 'shellQuote' packages/backend/src/index.ts` | 3 | **0** |
| `writeMcpWrapper` | `grep -c 'writeMcpWrapper' packages/backend/src/index.ts` | 4 | **0** |
| `getMcpWrapperPath` | `grep -c 'getMcpWrapperPath' packages/backend/src/index.ts` | 3 | **0** |
| last permission-bit spawn | `grep -c 'spawnAndWait("chmod"' packages/backend/src/index.ts` | 1 | **0** |
| shell-script extension | `sed -e 's://.*::' packages/backend/src/index.ts \| grep -c '\.sh'` | 1 | **0** |
| deletion notices, repo-wide | `grep -rc 'DELETED IN PHASE 7 (PRV-03)' . --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.git` | 3 | **0** |

Every gate moved. Each pre-phase number was measured against `4203dbd` rather than assumed from the roadmap text — this project's own recorded lesson (STATE `[03-02]`, `[05-06]`) is that a gate returning its expected value on the tree it exists to discriminate against proves nothing.

Two explicitly out-of-scope survivors, confirmed untouched:

- **`enforceOwnerOnlyDir`'s `fs/promises` namespace `chmod`** (`index.ts:801-814`) — present. The roadmap places it out of scope: it is a POSIX security control, not a shell spawn.
- **`.github/workflows/windows-llrt-probe.yml`'s `TEMPORARY — DELETED IN PHASE 9 (D-02)` header** — present and byte-identical to the pre-phase tree (`git diff 4203dbd -- .github/workflows/windows-llrt-probe.yml` is empty). It belongs to Phase 9 and was deliberately not folded into the count above.

## Decisions Made

- **Codex takes the literal token; Gemini takes the reference.** See the checkpoint section. The asymmetry is not inconsistency — it follows two source-verified facts that point in opposite directions, and the `MCP_CLI_EXPANDS_ENV_REFERENCES` table is where both live so the substitution and its guard cannot disagree.
- **The pre-clean removes every scope Drift has ever written.** Introduced as `MCP_CLI_REMOVAL_SCOPES`, iterated by a loop so the flag-delivery criterion still reads exactly 2. See Deviation 2 for why this was necessary rather than tidy.
- **`mcp-server-spec.ts` now imports `shared`.** The alternative — filtering Codex's allowlist at the `index.ts` call site — would have put a second sensitive-tool list one import away from the shipped one, which is the exact failure mode `excludeSensitiveToolNames` exists to prevent. The header's import-count claim was updated to 2 with each import justified by name; a stale purity number is worse than none.
- **`redactDebugText`'s shell arm was kept, its comment rewritten.** The old comment said Phase 7 would remove "both the wrapper and this arm". Drift no longer emits `export CAIDO_TOKEN='…'`, but debug text is whatever a spawned CLI prints, and a redactor that stops covering a shape which can still appear fails OPEN. The comment now says that instead of promising a deletion that would weaken the redactor.
- **`unregisterMcpFromCli` was left alone.** The plan's `read_first` marks it read-only and assigns it to 07-04. Its `spawnAndWait(storedPath, ["mcp", "remove", "drift"])` is therefore still a raw, unplanned, single-scope spawn — carried forward below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1's `pnpm -r typecheck` criterion is unsatisfiable at the task-1 boundary, by construction of the plan's own design**

- **Found during:** Task 1
- **Issue:** Task 1's `<acceptance_criteria>` requires `pnpm -r typecheck` to exit 0. But task 1 reshapes `McpCliRegistration`'s register arm from `wrapperPath` to `argv` and changes `planMcpCliRegistration`'s input shape, and the plan's own objective states that the rewrite and the deletion are ONE commit *in task 2* because the compiler forces them together. The two `index.ts` call sites cannot be migrated inside task 1 without collapsing task 2 into it.
- **Fix:** Ran the gates where they are meaningful. Task 1: the two spec suites green (29/29), `pnpm lint` exit 0, `packages/shared` `tsc --noEmit` exit 0, and exactly two backend compile errors — `index.ts(2985)` and `index.ts(2992)`, both the predicted `wrapperPath` sites and both task 2's work. Task 2: `pnpm -r typecheck` exit 0 across all three packages, full suite green, lint exit 0. Identical in shape and resolution to 07-01 deviation 1 and 07-02 deviation 1.
- **Files modified:** none — a verification-sequencing deviation, not a code change.
- **Verification:** `pnpm -r typecheck` exit 0 at HEAD.
- **Committed in:** n/a
- **Consequence a reader should know:** `606ff57` and `a69b4aa` do not typecheck standalone. A `git bisect` across this plan's range will hit that. The alternative — one commit for both — would have lost the RED/GREEN atomicity the executor contract requires.

**2. [Rule 2 - Missing critical] The pre-clean covered only the scope Drift now writes, leaving a shadowing stale entry from every release up to Phase 5**

- **Found during:** Task 2
- **Issue:** The plan's action describes a single pre-clean spawn and its acceptance criterion pins the awk-scoped `windowsVerbatimArguments` count at exactly 2 — but the plan's own `<prohibitions>` carry "Never remove only one scope for Gemini" (07-RESEARCH Pitfall D). This is not a stylistic rule here: Drift passed **no** `--scope` on every release up to and including Phase 5, so those registrations landed in the PROJECT scope, and a workspace entry shadows the user one. Registering into the user scope while removing only the user scope would leave an existing POSIX user with a live project-scope entry pointing at the `mcp-wrapper.sh` this same commit deletes — a CMP-01 regression introduced by this plan, on the platforms the entire user base runs today.
- **Fix:** Added `MCP_CLI_REMOVAL_SCOPES` to `mcp-server-spec.ts` (`gemini: [["--scope","user"],["--scope","project"]]`, `codex: [[]]`) and iterated it in a loop. The loop keeps ONE `spawnAndWait` call site for the removal, so the awk-scoped flag count is still exactly 2 and the criterion holds unchanged. 07-04's unconditional startup sweep can read the same table rather than restating it.
- **Files modified:** `packages/backend/src/mcp-server-spec.ts`, `packages/backend/src/index.ts`
- **Verification:** `awk '/^async function registerMcpWithCli/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments'` returns 2; `pnpm -r typecheck` and `pnpm lint` exit 0.
- **Committed in:** `a69b4aa` (the table), `6c66bdf` (the loop)
- **Scope note:** this is one export beyond the plan's `<artifacts_this_plan_produces>` list. Stated rather than hidden, because 07-04 owns removal and should consume this table instead of writing a second one.

**3. [Rule 1 - Bug] The Codex opener-token assertion was written against a token containing the two-character opener, which cannot both be present and undetected**

- **Found during:** Task 1
- **Issue:** The plan's behaviour block asks for `findExpandableEnvKeys` over the Codex payload to return an empty array "with a token value that itself contains the opener characters". Read as the two-character *sequence*, those two requirements contradict each other: the detector matches on that sequence, so a token carrying it necessarily yields `["CAIDO_TOKEN"]`.
- **Fix:** Read as the opener **characters** — the fixture token is `tok$en{with-both-opener-characters`, which carries `$` and `{` without forming the sequence. That satisfies the criterion literally, is non-vacuous in the intended way (a sloppier detector matching bare `$` or `{` fails it), and still proves Drift wrote no reference into Codex's payload. The *sequence* case is covered separately and in the correct direction, by `planMcpCliRegistration refuses Codex when its payload carries ANY expandable reference` — which exercises the new fail-closed arm rather than asserting it away.
- **Files modified:** `packages/backend/src/mcp-server-spec.test.ts`
- **Verification:** both cases green.
- **Committed in:** `606ff57`, `a69b4aa`

**4. [Rule 3 - Blocking] `pnpm format` reformatted 55 unrelated files; reverted**

- **Found during:** Task 1
- **Issue:** `pnpm format` was run to normalise the new code. The repository is not Prettier-clean, so it rewrote 51 files this plan does not own (`ChatView.vue`, `settings.ts`, every spawn-plan test, and more) — a change set that would have buried the plan's real diff and touched files 07-01 and 07-02 had just verified as untouched.
- **Fix:** Reverted all 51 unrelated files with a targeted `git checkout --`, and reverted the one incidental reformat Prettier applied to a pre-existing line inside a file this plan does own. `pnpm lint` had already been exit-0 before formatting, so nothing was lost. **Do not run `pnpm format` in this repository without narrowing it to the files you own.**
- **Files modified:** none, net.
- **Verification:** `git status --porcelain` shows only this plan's four files plus pre-existing untracked planning artefacts; `git diff --stat package.json pnpm-lock.yaml` empty.
- **Committed in:** n/a

**5. [Rule 1 - Bug] Five comments in `index.ts` still described the deleted wrapper**

- **Found during:** Task 2 (the plan's own "sweep the file for text that now contradicts the code" instruction)
- **Issue:** `writeChatMcpConfig`'s "`command` used to be the wrapper `.sh` this very plan deletes", the settings-save invalidation note about "a freshly written wrapper", the user-facing string "Drift failed to refresh the MCP wrapper", the orphan-sweep comment claiming those directories "hold the token-bearing wrapper scripts", and `startMcpServer`'s "this path writes no `.sh` and spawns no chmod on Windows".
- **Fix:** All five rewritten to describe what the code now does. The user-facing string became "failed to refresh the MCP runtime". Purely historical comments that say "used to" or "is GONE" were left alone — they are accurate narrative, and rewriting them would erase the record of why the current shape exists.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `grep -niE 'wrapper|chmod|\.sh\b'` over `index.ts` reviewed line by line; every remaining hit is either historical narrative, the out-of-scope namespace `chmod`, or a Phase 8/9/10 seam marker.
- **Committed in:** `6c66bdf`

---

**Total deviations:** 5 auto-fixed (2 blocking, 1 missing critical, 2 bugs)
**Impact on plan:** No scope creep. Deviation 2 is the only one that added code, and it added it because the plan's own prohibition and a live CMP-01 regression both demanded it. Deviation 1 changed nothing and resolved a contradiction inside the plan in favour of its stated must-have, exactly as 07-01 and 07-02 did before it.

## Issues Encountered

- The plan's five old `planMcpCliRegistration` test titles are gone, and two Phase 5 summaries (`05-01`, `05-04`, `05-05`) cite them by name in their `coverage[].ref` fields. Those citations are historical records of what Phase 5 delivered; SC-7 explicitly supersedes them, so they were not edited. A reader following one of those refs will find the case absent — by design, and this line is the pointer.
- Nothing else. No auth gates, no package installs, no fix-attempt limit reached.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` (whole suite) | 33 files passed, 1 skipped — **472 passed, 5 skipped** (the win32 file skips on macOS, as designed) |
| `pnpm exec vitest run` on the two spec suites | 29 passed |
| `pnpm -r typecheck` | exit 0 (shared, backend, frontend) |
| `pnpm lint` (`--max-warnings 0`) | exit 0 |
| SC-7 checklist | every gate 0, each beside its measured pre-phase value — see the table above |
| `enforceOwnerOnlyDir` namespace `chmod` | present (`index.ts:801-814`), out of scope, untouched |
| Phase 9 probe-workflow notice | present, `git diff` against the pre-phase tree empty |
| Flag delivery at both registration spawns | `awk '/^async function registerMcpWithCli/,/^}/' … \| grep -c 'windowsVerbatimArguments'` = **2** |
| Spawn plan at both registration spawns | `grep -c 'buildSpawnPlan('` = 3 (criterion: >= 2); no spawn in the helper passes the resolved binary directly |
| No stderr read in the registration helper | `awk … \| sed -e 's://.*::' \| grep -c 'stderr'` = **0** (two remaining hits are the comment explaining the removal) |
| Four per-CLI guard sentences byte-unchanged | `git diff` over those four assignments returns no `-`/`+` line |
| No second reference detector | `grep -n 'findExpandableEnvKeys'` in `mcp-server-spec.ts` = one definition, one call site, one comment mention; no regex literal over an env payload |
| `mcp-server-spec.ts` import count | `grep -cE '^import'` = 2, matching the header's updated claim |
| No dependency added (T-07-SC) | `git diff --stat package.json pnpm-lock.yaml` empty |
| STATE.md / ROADMAP.md untouched | not staged, not modified |

## Known Stubs

None.

## Threat Flags

No **new** surface. The plan's `<threat_model>` dispositions were honoured, with one accepted residual:

- **T-07-03 (Info disclosure, high) — ACCEPTED, not mitigated to zero.** The Codex registration entry holds a live credential in `~/.codex/config.toml`. Bounded by the removal on cleanup and by 07-04's unconditional startup sweep; **not** bounded against a crash, a home-directory backup, or a dotfile sync. Accepted by the user's checkpoint answer. This is the SC-3 deviation recorded above.
- **T-07-04 (Info disclosure, high)** — mitigated for Gemini (no token byte on its argument list, asserted by a search of the built argv for the literal value); accepted for Codex, whose argument list is transient and process-local, unlike its config file.
- **T-07-05 (Info disclosure, high)** — mitigated: the stderr interpolation is removed, and the reason carries three scalars. Asserted as a comment-stripped source count.
- **T-07-06 (Spoofing, high)** — mitigated: the unbacked-reference refusal, asserted in both directions.
- **T-07-07 (Tampering, medium)** — mitigated: the reference contains no `=`, so the token never traverses Gemini's truncating `split('=')` parser. Assumption A3 (that a Caido access token never contains `=`) is retired for Gemini and remains live only for Codex's literal.
- **T-07-09 (EoP, high)** — mitigated: the sensitive group is filtered out of Codex's allowlist from the shipped definitions, and `DRIFT_ALLOWLIST_ACTIVE` stays set.
- **T-07-13 (Tampering, high)** — mitigated: stripped structurally, asserted with a deliberately over-supplied input.
- **T-07-14 (EoP, high)** — mitigated: both spawns route through the spawn plan and deliver its flag.
- **T-07-SC (Tampering, high)** — no package installed; lockfile unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 07-04, which this plan hands three things:**

- `MCP_CLI_REMOVAL_SCOPES` — read it for the dual-scope sweep rather than restating the scope list.
- `MCP_CLI_SERVER_NAME` — the registered name, so the sweep and the write cannot disagree.
- The reason-sentence contract: everything written into `skippedMcpCliReasons` renders on the provider card and must disambiguate "never registered" from "registered, but limited" on its own (D-08).

**Carried forward, at true strength:**

- **`unregisterMcpFromCli` is still raw and single-scope.** It spawns `storedPath` directly with `["mcp","remove","drift"]` — no spawn plan, no verbatim-arguments flag, no project scope. The plan marks it read-only and assigns it to 07-04. On Windows, a `.cmd`-resolved CLI will fail that removal with EINVAL until 07-04 lands. **This is the first thing to re-check if 07-04 slips**, in the same voice 07-02 used about T-07-11.
- **PRV-03 is proven to the unit ceiling, not beyond it.** Nothing in CI executes `registerMcpWithCli`; `index.ts` is not importable under vitest, so the path from the payload builder through the spawn plan to a real `gemini mcp add` is unexercised by construction. D8's `human_judgment: true` records that honestly.
- **PRV-05 remains source-verified, never measured** (07-02's caveat, unchanged). No CLI binary was executed in this plan either.
- **Gemini's expansion verdict is a re-check point.** `google-gemini/gemini-cli#28863` is open and moves toward more sanitization; the reference resolves from `{ ...process.env, ...extensionEnv }` today. If that changes, the loud check will start refusing rather than silently failing — which is the correct direction, but it will look like a regression to a user.
- **The token-file indirection is deferred, with its cost stated.** See Deferred Ideas.

---
*Phase: 07-provider-spawn-registration*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All four modified files present on disk (`[ -f ]` on each — all FOUND).
- All three commits resolve in `git log --oneline --all`: `606ff57`, `a69b4aa`, `6c66bdf`.
- Every `<acceptance_criteria>` from all three tasks re-run at HEAD and passing, with the single documented exception in Deviation 1 (the mid-migration typecheck gate, satisfied at the end of task 2) and the reading recorded in Deviation 3.
- Plan-level `<verification>` re-run at HEAD: `pnpm -r typecheck` exit 0, `pnpm exec vitest run` green (472 passed / 5 skipped), `pnpm lint` exit 0, every SC-7 gate 0 beside its measured pre-phase value, `package.json` / `pnpm-lock.yaml` unchanged.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes. `ROADMAP.md` in particular was left alone on purpose: the SC-3 deviation is recorded here rather than edited away there.
