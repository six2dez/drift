---
phase: 07-provider-spawn-registration
plan: 04
subsystem: infra
tags: [windows, mcp, credential-hygiene, gemini-cli, codex-cli, sweep, security-logging, vitest]

# Dependency graph
requires:
  - phase: 07-provider-spawn-registration (plan 01)
    provides: "`buildSpawnPlan` and the `windowsVerbatimArguments` forwarding into `spawnAndWait`'s NO-ENV branch — the only channel every removal spawn has; and OQ-3, the call-site-application decision task 3 transcribes"
  - phase: 07-provider-spawn-registration (plan 02)
    provides: "`skippedMcpCliReasons` -> `getProviderStatuses` -> the Settings CLI Providers card, which is what makes a security line something the user sees rather than a support-bundle string"
  - phase: 07-provider-spawn-registration (plan 03)
    provides: "`MCP_CLI_REGISTRATION_SCOPES`, `MCP_CLI_SERVER_NAME`, `McpCliName`, the `MCP_CLI_REMOVAL_SCOPES` table this plan absorbs into a policy, and the literal-token decision whose two conditions this plan IS"
provides:
  - "`planMcpCliRemoval` — one removal policy, three callers, covering every scope each CLI supports on every platform including an undefined one"
  - "`classifyMcpRemoveExit` — only a non-zero exit reaches the security formatter; the structural backstop against a permanent false banner"
  - "`formatMcpRemoveFailure` / `MCP_CLI_REMOVE_REMEDIATION` — a three-scalar security line whose remediation command is derived from the policy's own argv"
  - "`McpCliRemovalScope`, `MCP_CLI_UNSCOPED`, `McpRemoveOutcome`, `McpCliRemovalPlanEntry`"
  - "`sweepStaleMcpCliRegistrations` — an unconditional dual-CLI startup sweep sitting beside the orphan temp-dir sweep and running before the registration loop"
  - "`mcpCliRemovalFailures` — a per-CLI, per-scope failure map surfaced as a diagnostics field"
  - "The OQ-3 decision recorded at the shared spawn helper, the node-validation candidate loop and the path-search spawn; LIF-01 SEAM marked exactly twice"
affects: [07-05, phase-08-process-lifecycle, phase-09-ci-hardening, phase-10-ux-polish]

actuals:
  tokens: 11800
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "One policy, three loops: `planMcpCliRemoval` is shared, the spawn loop is written at each of the three removal sites, because the phase's source criteria assert flag DELIVERY per site and a shared helper would make that assertion unavailable exactly where a dropped flag leaves a credential in place"
    - "Inverted fail-closed, commented at the site: every other predicate in `mcp-server-spec.ts` skips on an unknown platform; the removal policy deliberately does not, because the cost of skipping is a credential left behind rather than a capability withheld"
    - "Total-by-construction remediation record: `MCP_CLI_REMOVE_REMEDIATION` covers every scope name the type allows, so the formatter needs no fallback branch nobody exercises"
    - "Outstanding-failure guard on a success path: a successful `mcp add` clears the skip reason ONLY when no removal failure is outstanding, so a green write cannot wipe a security line about a stale entry it did not remove"

key-files:
  created: []
  modified:
    - packages/backend/src/mcp-server-spec.ts
    - packages/backend/src/mcp-server-spec.test.ts
    - packages/backend/src/index.ts

key-decisions:
  - "`McpRemoveOutcome` ships TWO members, `removed-or-absent | failed`, not the plan's three. Drift cannot distinguish a deleted entry from an absent one without reading the CLI's stdout — the one input this path refuses to take — so a third member would have been a branch no input can reach. The name states the indistinguishability instead of hiding it. See Deviation 1."
  - "`registerMcpWithCli`'s pre-clean was upgraded from best-effort to a classified, logged removal like the other two sites, and the unconditional `skippedMcpCliReasons.delete(cli)` on a successful add was guarded. Together those close a wipe path the plan did not name. See Deviation 2."
  - "The sweep records a resolution failure as an ordinary skip reason, never as a security event. A CLI that is not installed has no configuration to clean, and `applyProviderLimitation` only renders reasons on the RESOLVED arm anyway, so the line cannot reach the card as noise."
  - "`MCP_CLI_REMOVAL_SCOPES` (07-03 deviation 2) is retired. Its content is now `planMcpCliRemoval`'s, read by all three removal sites, so the phase ends with one removal policy rather than a table plus a policy."
  - "The console-flash marker was NOT duplicated. 07-01 left exactly one, at the path-search spawn, and it says `Grep UX-04 to find every site that phase owns`. The two new mentions of the console-window cost are the node loop's required two-part rationale, phrased as a cost the decision AVOIDS incurring, not as a second seam."

patterns-established:
  - "Two-directional classifier tests: a classifier that suppressed everything would pass `never failed for a zero exit` while destroying the whole signal, so `always failed for a non-zero exit` is asserted beside it"
  - "Signature pinning with `satisfies`: the formatter's parameter object is written as a `satisfies Parameters<typeof fn>[0]` literal, so TypeScript's excess-property check rejects a fourth member at the test site and 'no value can arrive' is enforced by the compiler"
  - "Distinct seam tokens: `LIF-01 SEAM` marks the two places Phase 8 must act, while bare `LIF-01` mentions are decision rationale — `grep -c 'LIF-01 SEAM'` returns exactly 2 without the count being polluted by the reasoning that references it"

requirements-completed: [PRV-03, PRV-04]

coverage:
  - id: D1
    description: "The removal policy returns both Gemini scopes in a stable order and one unscoped Codex removal, with the scope flag before the positional"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval returns BOTH Gemini scopes, in a stable order, with the user scope first"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval puts the Gemini scope flag BEFORE the positional, matching that CLI's parser"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval returns exactly ONE unscoped removal for Codex — its config home is global"
        status: pass
    human_judgment: false
  - id: D2
    description: "A scope Drift writes is always a scope Drift removes — the register and remove paths read the same record"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval removes the scope Drift WRITES — the register and remove paths cannot disagree"
        status: pass
    human_judgment: false
  - id: D3
    description: "Removal is never skipped for an unknown platform — the fail-closed instinct inverts, because refusing to remove leaves a credential in place"
    requirement: PRV-03
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval returns IDENTICAL output for win32, darwin, linux and an undefined platform"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRemoval returns a FRESH array on each call — mutating one result cannot poison the next"
        status: pass
    human_judgment: false
  - id: D4
    description: "A clean start produces no security event, and a failed removal always does — the classifier is the backstop against a permanent false banner"
    requirement: PRV-04
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#classifyMcpRemoveExit NEVER returns the failed outcome for a zero exit"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#classifyMcpRemoveExit ALWAYS returns the failed outcome for a non-zero exit"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#classifyMcpRemoveExit reads ONLY the exit code and the CLI — no parameter can carry output text"
        status: pass
    human_judgment: false
  - id: D5
    description: "The security line names the CLI, the scope and the exit code, ends with a working remediation command derived from the policy, and can carry no path, environment value or CLI output"
    requirement: PRV-04
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure names the CLI, the scope, the exit code and the exact remediation command"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure says the CLI is unscoped for Codex rather than inventing a scope name"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure carries no path, no environment value and no CLI output"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure pins the signature to THREE scalars — a fourth member must be a deliberate act"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure covers every scope the policy can produce, for both CLIs"
        status: pass
    human_judgment: false
  - id: D6
    description: "The startup sweep runs unconditionally — outside the enabled flag, the process-lifetime registered-paths map, any platform condition and any prior registration — beside the orphan sweep and before the registration loop"
    requirement: PRV-03
    verification:
      - kind: other
        ref: "awk '/^async function sweepStaleMcpCliRegistrations/,/^}/' packages/backend/src/index.ts | sed -e 's://.*::' | grep -cE 'enabled|registeredMcpCliPaths|=== \"win32\"' => 0"
        status: pass
      - kind: other
        ref: "line order in startMcpServer: sweepOrphanedMcpTempDirs (3289) -> sweepStaleMcpCliRegistrations (3299) -> tryRegisterMcpForProviders (3429)"
        status: pass
    human_judgment: true
    rationale: "`index.ts` declares no `caido:plugin` alias and is not importable under vitest, so nothing executes the sweep. Its gate-freedom and call order are proven by comment-stripped source counts and by reading line order — strictly weaker than an executed assertion. Only a real Windows Caido, or a POSIX machine with a stale pre-Phase-7 Gemini entry, closes it. 07-05 grades this row."
  - id: D7
    description: "Every removal spawn delivers the plan's verbatim-arguments flag as a literal key, at all three removal sites, so a `.cmd`-resolved CLI on Windows can actually be cleaned up"
    requirement: PRV-03
    verification:
      - kind: other
        ref: "awk '/^async function sweepStaleMcpCliRegistrations/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments' => 1 (>= 1)"
        status: pass
      - kind: other
        ref: "awk '/^async function unregisterMcpFromCli/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments' => 2 (>= 1)"
        status: pass
      - kind: other
        ref: "awk '/^async function registerMcpWithCli/,/^}/' packages/backend/src/index.ts | grep -c 'windowsVerbatimArguments' => 2 (07-03's criterion, unmoved); grep -c 'buildSpawnPlan(' => 5 (>= 4)"
        status: pass
    human_judgment: true
    rationale: "Same ceiling as 07-03's D8, and for the same reason. A source-scoped count proves the key is written at the site; it does not prove the OS received it. Only a real Windows machine does, which is SC-5's checkpoint in Phase 9/10."
  - id: D8
    description: "A failed removal reaches the error console, the provider card and the support bundle; a clean start reaches none of them"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "grep -c 'formatMcpRemoveFailure(' packages/backend/src/index.ts => 4 (>= 2); grep -c 'classifyMcpRemoveExit(' => 3 (>= 2); every formatter call is downstream of a classifier result"
        status: pass
      - kind: other
        ref: "`if (!failed) continue;` precedes every console.error and every skippedMcpCliReasons.set on the removal path — a clean start writes no reason-map entry and no console line"
        status: pass
      - kind: other
        ref: "getDiagnostics carries the new mcpCliRemovalFailures field (index.ts:4804), rendering count and scope only"
        status: pass
    human_judgment: true
    rationale: "Not test-reachable. The channels are proven by source counts and by the guard's position, not by an executed assertion. The provider-card half additionally depends on 07-02's wire, which is itself source-verified rather than measured."
  - id: D9
    description: "No spawn result stderr is read anywhere on the removal path"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "awk over sweepStaleMcpCliRegistrations and unregisterMcpFromCli | sed -e 's://.*::' | grep -c 'stderr' => 0 for both"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatMcpRemoveFailure carries no path, no environment value and no CLI output"
        status: pass
    human_judgment: false
  - id: D10
    description: "The comments at the shared spawn helper, the node-validation loop and the path-search spawn record the OQ-3 decision instead of promising work PRV-02 already did; the two deferred seams are marked once each"
    verification:
      - kind: other
        ref: "grep -c 'LIF-01 SEAM' packages/backend/src/index.ts => 2 (interpreter branch, cleanup ordering); grep -c 'console window' => 1 (the single UX-04 marker 07-01 placed)"
        status: pass
      - kind: other
        ref: "cleanupMcpRuntime's comment-stripped body diffed against the pre-task tree => byte-identical; the synchronous-throw guard's own explanation and its 03-FINDINGS.md § P1-CMD citation are outside the replaced hunk"
        status: pass
      - kind: other
        ref: "SC-7 gates re-run on this tree: renderExportExecScript / shellQuote / writeMcpWrapper / getMcpWrapperPath / spawnAndWait(\"chmod\" / comment-stripped '.sh' / repo-wide DELETED IN PHASE 7 => all 0"
        status: pass
    human_judgment: false
  - id: D11
    description: "A Drift killed mid-turn leaves an entry holding a live credential in a CLI config file until the next start"
    verification: []
    human_judgment: true
    rationale: "BACKSTOP, as 07-03's D11 said it would be. Nothing observes a crash. What this plan delivers is the structural guarantee — the sweep runs at every start, before registration, unconditionally, and the removal is exit-zero idempotent — plus 07-05's README line telling the user what a crash leaves and when it is cleaned. The residual window itself is not closed and is not closeable from inside the plugin."

# Metrics
duration: 12min
completed: 2026-08-22
status: complete
---

# Phase 7 Plan 04: Guaranteed `mcp remove` Summary

**Every Drift start now removes stale `drift` entries from Gemini and Codex across every scope they support, unconditionally and on every platform including an unknown one — and a removal that fails is a three-scalar SECURITY line carrying a paste-able remediation command, written to the error console, to the provider card and to a new diagnostics field, with `classifyMcpRemoveExit` as the structural guarantee that a clean start says nothing at all.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-22T09:55:00Z
- **Completed:** 2026-08-22T10:07:00Z
- **Tasks:** 3
- **Files modified:** 3

## What this plan is, in one paragraph

07-03's checkpoint put a live Caido session token into `~/.codex/config.toml`, outside the temp root `sweepOrphanedMcpTempDirs` watches. The user chose `literal-plus-guarantees` on two stated conditions: an unconditional dual-CLI startup sweep running outside the four gates that keep today's pre-clean from firing, and a failed removal logged as a security event with a remediation command. **Both conditions are this plan's content.** They landed. The sweep reads no `enabled` flag, no `registeredMcpCliPaths` entry, no platform and no prior-registration state — a comment-stripped `grep` over its body for all four returns zero — and it runs beside the orphan sweep, before the registration loop.

## Accomplishments

- **One removal policy, and the register path now cannot outrun it.** `MCP_CLI_WRITE_SCOPE` is read by both `MCP_CLI_REGISTRATION_SCOPES` and the removal scope list, so "a scope Drift writes is always a scope Drift removes" is structural rather than two lists agreeing today. The plan's whole reason for existing is the opposite case: a scope Drift can write and cannot remove is an orphan holding a credential forever.
- **Both Gemini scopes, always.** The working-directory scope is not hypothetical residue — every release up to Phase 5 passed no `--scope` at all, so that is where those entries are, and a workspace entry SHADOWS the user one. The scope entry carries a fresh `[VERIFIED: …]` citation for the fact the unconditional sweep rests on: gemini's `inHome` / `process.exit(1)` guard is on `add.ts:41-48` ONLY, `remove.ts:26-30` carries none and returns cleanly for an absent server. Without that read, sweeping the working-directory scope from a plugin host launched in the user profile would have painted a permanent false banner on every start.
- **`classifyMcpRemoveExit` is the backstop, and its test is two-directional.** A classifier that suppressed everything would pass "never failed for a zero exit" while destroying the entire signal, so "always failed for a non-zero exit" is asserted beside it. It reads the exit code and the CLI, nothing else — the same no-value-parameter property the formatter has, asserted by arity and by a named-keys check.
- **The security line cannot carry a value even if someone tries.** Three scalars, a `satisfies Parameters<typeof fn>[0]` signature-pinning case so a fourth member is a compile error at the test site, and leak-shaped fixtures (a JWT, an absolute config path, a stderr blob echoing a token) asserted absent from every line the formatter can produce — including `not.toMatch(/[/\\]/)`, so no path shape survives at all. The remediation command is asserted against `planMcpCliRemoval`'s own argv, never a literal, so a scope rename cannot leave the user with a command that does not work.
- **The three removal sites now cover the same ground.** The startup sweep, the session cleanup and `registerMcpWithCli`'s pre-clean all iterate `planMcpCliRemoval`, all route through `buildSpawnPlan`, and all deliver `windowsVerbatimArguments` as a literal key with its value from the plan. 07-03's `MCP_CLI_REMOVAL_SCOPES` table is retired now that its last caller is migrated — the phase ends with one policy, not a table plus a policy.
- **`getNodeExecutable`'s candidate loop and the `where.exe` path search keep exactly the behaviour they have**, and the comment at `spawnAndWait` says so as a DECISION rather than as an unfinished edge. It previously promised that an interpreter wrapper, a shell option and an extension check were deliberately absent pending PRV-02 — which stopped being true when 07-01 landed.

## Task Commits

1. **Task 1 (TDD RED): the removal policy and security-line cases** — `a0827b7` (test)
2. **Task 1 (TDD GREEN): `planMcpCliRemoval` / `classifyMcpRemoveExit` / `formatMcpRemoveFailure`** — `c3dc3ec` (feat)
3. **Task 2: the unconditional startup sweep and a cleanup removal covering every scope** — `ac91645` (feat)
4. **Task 3: the OQ-3 decision at its three sites, and the deferred seams marked** — `2d218e2` (docs)

_No REFACTOR commit: the GREEN implementation needed no cleanup pass._

**Unlike 07-01, 07-02 and 07-03, every commit in this plan typechecks standalone.** Task 1 kept `MCP_CLI_REMOVAL_SCOPES` alive for exactly one commit as a value DERIVED from the new policy, so the `index.ts` caller compiled unchanged; task 2 deleted it in the same commit that migrated that caller. `pnpm -r typecheck`, `pnpm exec vitest run` and `pnpm lint` were all exit 0 at every one of the four commit boundaries. A `git bisect` across this range is clean.

## Files Created/Modified

- `packages/backend/src/mcp-server-spec.ts` — new scope plumbing (`MCP_CLI_UNSCOPED`, `McpCliRemovalScope`, `mcpCliScopeArgs`, `MCP_CLI_WRITE_SCOPE`, `MCP_CLI_REMOVAL_SCOPE_NAMES` with its verified-source citation); `MCP_CLI_REGISTRATION_SCOPES` now derived; `MCP_CLI_REMOVAL_SCOPES` removed; new exports `McpCliRemovalPlanEntry`, `planMcpCliRemoval`, `McpRemoveOutcome`, `classifyMcpRemoveExit`, `MCP_CLI_REMOVE_REMEDIATION`, `formatMcpRemoveFailure`
- `packages/backend/src/mcp-server-spec.test.ts` — three new describes, 14 new cases (39 in the file, up from 25)
- `packages/backend/src/index.ts` — `mcpCliRemovalFailures` + `recordMcpCliRemovalOutcome`; `sweepStaleMcpCliRegistrations`; `unregisterMcpFromCli` and `registerMcpWithCli`'s pre-clean rewritten onto the policy; the sweep called from `startMcpServer`; a new `mcpCliRemovalFailures` diagnostics field; the `LIF-01 SEAM` markers; the OQ-3 decision recorded at three sites; two stale counterfactuals about the deleted launch script rewritten

## Decisions Made

See `key-decisions` in the frontmatter. The two that a reader should not skip:

- **`McpRemoveOutcome` has two members, not three** — because Drift genuinely cannot tell a deleted entry from an absent one without reading the CLI's stdout, and the name `removed-or-absent` says that rather than hiding it behind a third variant nothing can produce.
- **The pre-clean inside `registerMcpWithCli` was upgraded too, and a wipe path was closed** — a successful `mcp add` used to `skippedMcpCliReasons.delete(cli)` unconditionally, which would have erased a security line written seconds earlier in the same function.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's three-outcome `McpRemoveOutcome` contains a branch no input can reach**

- **Found during:** Task 1
- **Issue:** The plan's `<action>` specifies three outcomes — `removed`, `nothing-to-remove`, `failed` — while its `<behavior>` and its prohibitions require the classifier to read ONLY the exit code and the CLI name. Both CLIs exit zero in both the deleted and the absent case (source-verified in 07-RESEARCH § Q4: Codex prints `No MCP server named 'drift' found.` and returns `Ok(())`; Gemini logs a debug line and returns). Distinguishing them therefore requires the CLI's stdout — the exact input the design forbids. Shipped literally, one of the three variants would be unreachable, and an unreachable branch on this path is an invitation: the natural "fix" a later reader reaches for is a stdout read, which is the leak channel `formatMcpRemoveFailure` exists to make impossible.
- **Fix:** `McpRemoveOutcome = "removed-or-absent" | "failed"`. The first member's NAME is the plan's own sentence ("classifies as removed or as nothing-to-remove"), so the indistinguishability is stated at the type rather than papered over. Every behaviour the plan requires is preserved and asserted: only `"failed"` reaches the formatter, a zero exit never produces it, a non-zero exit always does.
- **Files modified:** `packages/backend/src/mcp-server-spec.ts`, `packages/backend/src/mcp-server-spec.test.ts`
- **Verification:** `classifyMcpRemoveExit NEVER returns the failed outcome for a zero exit` and `... ALWAYS returns it for a non-zero one` both green; `grep -c 'stderr\|stdout'` over the classifier and formatter returns 0.
- **Committed in:** `c3dc3ec`

**2. [Rule 2 - Missing critical] A successful `mcp add` would have silently wiped the security line the same function had just written**

- **Found during:** Task 2
- **Issue:** The plan directs that a failed removal be written into `skippedMcpCliReasons`, and it names `registerMcpWithCli`'s pre-clean as a removal. But `registerMcpWithCli` ends with an unconditional `skippedMcpCliReasons.delete(cli)` on a zero-exit `mcp add`. Routing the pre-clean's failures into the reason map without touching that line would mean: pre-clean fails on Gemini's working-directory scope, the security line is written, the user-scope `mcp add` succeeds moments later, and the line is deleted — leaving a shadowing stale entry holding a live token with no surface reporting it. That is worse than not logging at all, because the log would have appeared and vanished. The plan does not name this interaction.
- **Fix:** Added `mcpCliRemovalFailures`, a per-CLI/per-scope map that a successful removal of the SAME scope clears and a failure sets. `registerMcpWithCli` now clears the skip reason only when that map holds nothing for the CLI, and re-renders the outstanding failure's security line otherwise. The pre-clean itself was upgraded from best-effort to classified-and-logged, matching the other two removal sites — which the plan's own prohibition ("never treat a failed removal as ignorable") requires.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `grep -c 'formatMcpRemoveFailure('` = 4 and `grep -c 'classifyMcpRemoveExit('` = 3 (both criteria: >= 2); the `mcpCliRemovalFailures.has(cli)` guard precedes the only `skippedMcpCliReasons.delete(cli)` in the function; `pnpm -r typecheck`, full suite and lint all exit 0.
- **Committed in:** `ac91645`
- **Scope note:** `mcpCliRemovalFailures` is in the plan's `<artifacts_this_plan_produces>` list; the guard on the delete is not. Stated rather than hidden.

**3. [Rule 3 - Blocking] The removal loop had to be written at each of the three sites, not factored into one helper**

- **Found during:** Task 2
- **Issue:** The obvious shape is one `removeMcpCliRegistrations(cli, binary, sdk)` helper called three times. But the plan's flag-delivery criteria are `awk`-scoped to the sweep and to the session-cleanup helper individually, and a shared helper would satisfy neither — which is not a criterion-gaming problem but the substance the criterion protects: a review that can only see a call to a shared helper cannot see whether the flag reached the OS from that site, and a dropped flag on Windows means a removal that removes nothing while a credential stays where it was. The same reasoning 07-01 recorded for OQ-3.
- **Fix:** The POLICY is shared (`planMcpCliRemoval` — the part that must never diverge); the ~12-line spawn loop is written at all three sites, with a comment at two of them naming why it is not factored.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** the three `awk`-scoped counts are 1, 2 and 2 respectively; `grep -c 'buildSpawnPlan('` = 5 (criterion: >= 4).
- **Committed in:** `ac91645`

**4. [Rule 1 - Bug] The console-flash marker the plan asked to confirm is not at the interpreter branch, and adding one there would have broken the count**

- **Found during:** Task 3
- **Issue:** The plan's action says to confirm "the console-window flash introduced by the interpreter branch on the turn path, owned by the polish phase" is marked exactly once, while its acceptance criterion says the marker "appears exactly once". The one marker 07-01 placed is at the `where.exe` path-search spawn (`index.ts:1508`), not at the interpreter branch. Adding a second at the interpreter branch to match the action's wording would have made the criterion read 2.
- **Fix:** Left the existing marker alone, as the plan's own "if 07-01 already placed the console-flash marker, leave it and do not duplicate it" instructs. It already ends with `Grep UX-04 to find every site that phase owns`, which is the discoverability the marker exists for. The two new mentions of the console-window cost are the node loop's REQUIRED two-part rationale and are phrased as a cost the decision avoids incurring, not as a seam — they use the hyphenated `console-window`, so `grep -c 'console window'` still returns exactly 1.
- **Files modified:** none beyond the intended comment edits.
- **Verification:** `grep -c 'console window' packages/backend/src/index.ts` = 1.
- **Committed in:** `2d218e2`

**5. [Rule 1 - Bug] `grep -c 'LIF-01'` cannot express "the markers appear exactly twice" once the rationale references LIF-01**

- **Found during:** Task 3
- **Issue:** The criterion requires exactly two process-tree markers naming the lifecycle phase. But the node-loop criterion separately requires a two-part rationale whose first part IS the process-tree cost, so `LIF-01` necessarily appears in prose that is not a seam marker. A bare token count would have read 5 and looked like four duplicated markers.
- **Fix:** The two MARKERS carry the distinct token `LIF-01 SEAM`; the rationale mentions stay bare. `grep -c 'LIF-01 SEAM'` returns exactly 2 — the interpreter branch and the cleanup ordering — and Phase 8 gets a search that finds its two sites and nothing else.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `grep -c 'LIF-01 SEAM'` = 2; `grep -n 'LIF-01 SEAM'` resolves to `index.ts:3221` (cleanup ordering) and `index.ts:3820` (interpreter branch).
- **Committed in:** `2d218e2`

---

**Total deviations:** 5 auto-fixed (1 blocking, 1 missing critical, 3 bugs)
**Impact on plan:** No scope creep. Deviation 2 is the only one that added code beyond the plan's artifact list, and it added a guard closing a path that would have made the plan's headline guarantee self-cancelling. Deviations 1, 4 and 5 each resolved a contradiction inside the plan in favour of its stated must-have — the same shape 07-01, 07-02 and 07-03 each recorded before it.

## Issues Encountered

- **`pnpm format` was NOT run**, per 07-03's deviation 4: the repository is not Prettier-clean and formatting would rewrite ~50 files this plan does not own. All new code was hand-formatted to match the surrounding style, and `pnpm lint --max-warnings 0` is exit 0.
- Nothing else. No auth gates, no package installs, no fix-attempt limit reached, no checkpoints in this plan.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` (whole suite) | 33 files passed, 1 skipped — **486 passed, 5 skipped** (up from 472; +14 new cases) |
| `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` | **39 passed** (25 before this plan) |
| `pnpm -r typecheck` | exit 0 (shared, backend, frontend) — and at all four commit boundaries |
| `pnpm lint` (`--max-warnings 0`) | exit 0 |
| Sweep carries none of the four gates | `awk` over its body, comment-stripped, `grep -E 'enabled\|registeredMcpCliPaths\|=== "win32"\|!== "win32"'` = **0 hits** |
| Sweep call order | `sweepOrphanedMcpTempDirs` (3289) → `sweepStaleMcpCliRegistrations` (3299) → `tryRegisterMcpForProviders` (3429) |
| Flag delivery, sweep | `awk '/^async function sweepStaleMcpCliRegistrations/,/^}/' \| grep -c 'windowsVerbatimArguments'` = **1** (>= 1) |
| Flag delivery, session cleanup | same over `unregisterMcpFromCli` = **2** (>= 1) |
| Flag delivery, registration (07-03's gate, unmoved) | same over `registerMcpWithCli` = **2** |
| Spawn plan at every removal | `grep -c 'buildSpawnPlan('` = **5** (>= 4); no removal spawn passes a resolved binary directly |
| Both channels on failure | `grep -c 'formatMcpRemoveFailure('` = **4** (>= 2) |
| Classifier gates every security line | `grep -c 'classifyMcpRemoveExit('` = **3** (>= 2); `if (!failed) continue;` / `if (failed)` precedes every emit |
| No stderr on the removal path | `awk` over the sweep and the cleanup helper, comment-stripped, `grep -c 'stderr'` = **0** for both |
| Diagnostics field | `mcpCliRemovalFailures` present at `index.ts:4804`, rendering count and scope only |
| `cleanupMcpRuntime` statement order | comment-stripped body diffed against the pre-task tree — **identical** |
| Verified-source citation added | `grep -c 'VERIFIED' packages/backend/src/mcp-server-spec.ts` = **7** (was 6) |
| Scope names read, not restated | `grep -c 'MCP_CLI_REGISTRATION_SCOPES' packages/backend/src/mcp-server-spec.ts` = **3** (>= 2) |
| `LIF-01 SEAM` markers | **2** (interpreter branch, cleanup ordering) |
| Console-window marker | **1** (unchanged from 07-01) |
| SC-7 counts re-run on this tree | every gate **0** — `renderExportExecScript`, `shellQuote`, `writeMcpWrapper`, `getMcpWrapperPath`, `spawnAndWait("chmod"`, comment-stripped `.sh`, repo-wide `DELETED IN PHASE 7 (PRV-03)` |
| No dependency added (T-07-SC) | `git diff --stat package.json pnpm-lock.yaml` empty |
| STATE.md / ROADMAP.md untouched | not staged, not modified |

## Known Stubs

None.

## Threat Flags

No **new** surface. Dispositions from the plan's `<threat_model>`, as delivered:

- **T-07-03 (Info disclosure, high) — mitigated as far as this plan can.** The sweep runs outside all four gates, on every platform, across every scope, before registration. The residual is the crash window (T-07-17 / D11) and any backup taken while the bytes were in `~/.codex/config.toml` — a removal deletes them from the live file, it does not recall them from a backup.
- **T-07-15 (Info disclosure, high) — mitigated.** Both scopes for Gemini, read from a record shared with the write path.
- **T-07-08 (Repudiation, high) — mitigated.** Console + reason map + diagnostics field, with a remediation command. Silence is no longer a possible outcome of a non-zero exit.
- **T-07-05 (Info disclosure, high) — mitigated.** Three scalars, a signature-pinning test, the rejected redaction-pass alternative recorded at the site, and zero comment-stripped `stderr` reads on the path.
- **T-07-14 (EoP, high) — mitigated.** All three removal sites route through the spawn plan and deliver its flag.
- **T-07-22 (Repudiation, medium) — mitigated.** The `remove.ts`-has-no-`inHome`-guard citation is at the scope entry; `classifyMcpRemoveExit` is the structural backstop; the clean-start-writes-nothing property is enforced by the guard's position, not by discipline.
- **T-07-16 (DoS, medium) — mitigated.** Per-iteration try/catch copied from the orphan sweep; `spawnAndWait` always resolves.
- **T-07-17 (Info disclosure, high) — TRANSFERRED to Phase 8, unchanged.** `LIF-01 SEAM` marks the two sites. Nothing here reorders or terminates anything.
- **T-07-SC (Tampering, high)** — no package installed; lockfile unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for 07-05**, which this plan hands:

- **`MCP_CLI_REMOVE_REMEDIATION`** — the README line 07-05 owes the user ("after a crash, a `drift` entry may persist in `~/.gemini/settings.json` or `~/.codex/config.toml`, and the next Drift start removes it") should quote its commands from this record rather than typing them, for the same reason the formatter does.
- **D6, D7 and D8 are `human_judgment: true`** and are the rows 07-05 grades. Their common ceiling: `index.ts` is not importable under vitest, so the sweep, its gate-freedom and its flag delivery are proven by source counts and the compiler, never executed.
- **The 07-03 carry-forward is discharged.** `unregisterMcpFromCli` is no longer raw, no longer single-scope and no longer unplanned — it was named as "the first thing to re-check if 07-04 slips". It did not slip.

**Carried forward, at true strength:**

- **Nothing in CI executes a real `gemini mcp remove` or `codex mcp remove`.** The idempotence both the sweep and the policy rest on is source-verified upstream, not measured against a running binary. `classifyMcpRemoveExit` exists precisely because that verification has a shelf life.
- **The crash window is not closed and is not closeable from inside the plugin.** The guarantee is structural (unconditional sweep at start + idempotent removal) plus the README line. Between a hard kill and the next start, a live token sits in a home-directory file.
- **A5 remains unresolved** (07-03's note, unchanged): no open upstream Gemini Windows-MCP issue was found, but the search read titles and a two-term query. SC-5's real-machine checkpoint stays.

---
*Phase: 07-provider-spawn-registration*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All three modified files present on disk (`[ -f ]` on each — all FOUND).
- All four commits resolve in `git log --oneline --all`: `a0827b7`, `c3dc3ec`, `ac91645`, `2d218e2`.
- Every `<acceptance_criteria>` from all three tasks re-run at HEAD and passing, with the five readings recorded as deviations above. Unlike the three prior plans in this phase, no criterion was unsatisfiable at a task boundary: all gates were exit 0 at every commit.
- Plan-level `<verification>` re-run at HEAD: `pnpm -r typecheck` exit 0, `pnpm exec vitest run` green (486 passed / 5 skipped), `pnpm lint` exit 0, every SC-7 gate 0, the sweep confirmed gate-free by a comment-stripped source read, zero `stderr` reads on the removal path, and the diagnostics bundle carrying `mcpCliRemovalFailures`.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes.
