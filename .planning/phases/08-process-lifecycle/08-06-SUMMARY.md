---
phase: 08-process-lifecycle
plan: 06
subsystem: infra
tags: [process-lifecycle, pgrep, orphan-reap, posix, quickjs, llrt, caido-token]

# Dependency graph
requires:
  - phase: 08-process-lifecycle (plans 08-01..08-05)
    provides: "kill-plan.ts (the pure termination-plan module), killTree and its nine wired sites, cleanupMcpRuntime's SC-4 kill-before-sweep order, and the 08-UAT.md readings that falsified A6"
provides:
  - "buildSessionOrphanScanPlan / buildPreviousRunOrphanScanPlan — pgrep scan plans anchored on the session temp-dir marker AND the MCP script name AND their adjacency"
  - "parseOrphanScanPids — the single place enumerator text becomes a signalable pid, floored above 1"
  - "buildOrphanKillPlan — a POSITIVE single-pid kill, deliberately never a process-group reference"
  - "classifyOrphanScanOutcome — the four unavailable-enumeration arms plus the one reaping arm, as a pure function reachable by unit test"
  - "MCP_TEMP_DIR_PREFIX / MCP_SERVER_SCRIPT_NAME — the marker spelled once, imported by index.ts"
  - "reapMcpOrphans + getMcpSessionDirName (index.ts) — the I/O boundary, wired once in cleanupMcpRuntime above the temp-dir removal"
  - "The first termination path in Drift that can reach an MCP child Drift did not spawn (UAT gap 4)"
  - "A1 closed favourably and A6 falsified, recorded as dated marked corrections in all three source carriers"
affects: [08-07-PLAN (remaining reap call sites), 08-10-PLAN (AR-04 win32 residual, AR-05 completion-order residual, verdict-gate.sh), phase-09, phase-10]

actuals:
  tokens: 16659   # chars/4 over the realized diff (66,635 changed chars across 5 files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []   # pgrep is a base-system utility on macOS and every supported Linux; no package.json change
  patterns:
    - "Argv-marker process identity: a session-unique directory name + script name + adjacency, validated before the pattern is composed"
    - "Marked correction as a `// > ` block quote, so a strip-then-count gate can be red in BOTH directions"
    - "A four-arm decision lifted out of index.ts into a pure classifier purely so an assertion can reach it"

key-files:
  created:
    - packages/backend/src/orphan-reap.posix.test.ts
  modified:
    - packages/backend/src/kill-plan.ts
    - packages/backend/src/kill-plan.test.ts
    - packages/backend/src/index.ts
    - packages/backend/src/kill-tree.posix.test.ts

key-decisions:
  - "The orphan's identity is its own argv, not a handle Drift holds and not the process group the CLI chose — the only identity available for a process Drift never spawned."
  - "pgrep, not ps: one integer per line (no parsing surface over user-influenced argv), a distinguishable exit-1 no-match signal, and output that scales with matches rather than with the process table. The earlier truncation argument for rejecting ps was measured WRONG (ps emits ~283k chars against a 1,048,576-char cap) and is not repeated anywhere in source."
  - "The kill operand is a POSITIVE single pid everywhere on the orphan path. A6 was measured FALSE, so a group reference cannot be relied on to reach the child."
  - "The marker shape is validated (prefix + 8-64 lowercase hex, hand-rolled char test, no RegExp) BEFORE any pattern is composed, with no looser fallback arm — that refusal IS the blast-radius guard and the reason no metacharacter can reach the enumerator."
  - "win32 gets no enumerator and refuses with unsupported-platform. taskkill /t walks ParentProcessId and is indifferent to process groups, so A6 was never a Windows question; the foreign-parented orphan class stays unreachable there (AR-04)."
  - "reapMcpOrphans is fire-and-forget and awaits nothing, matching killTree and OQ-4. Losing the race against rm() costs this reaper nothing, because pgrep -f matches the command line the kernel recorded, not a path that must still resolve."
  - "OQ-2's single-pid rung survives A1's closure with a CORRECTED reason: defence against a future Caido that rebases its LLRT fork, not against an unmeasured one. One measurement closes a version, not a dependency."

patterns-established:
  - "Argv-marker identity: two anchors plus adjacency, shape-validated at the pure builder, proven by a behavioural case with two falsifying controls."
  - "Preservation convention: superseded verdicts stay visible as `// > ` block quotes; every phase gate strips comment-prefixed quote lines before counting, so 'zero live occurrences' and 'the old text is still readable' hold at once."

requirements-completed: [LIF-02, LIF-01]

coverage:
  - id: D1
    description: "A token-bearing mcp-server.mjs bearing Drift's session marker, spawned detached from a parent Drift does not own, is terminated by the production scan/parse/kill path"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "packages/backend/src/orphan-reap.posix.test.ts#terminates the marked MCP child even though it is in its own process group"
        status: pass
    human_judgment: false
  - id: D2
    description: "The blast radius is bounded: a sibling under a different drift-mcp token and a decoy under a different directory prefix both SURVIVE the same reap"
    requirement: LIF-02
    verification:
      - kind: integration
        ref: "packages/backend/src/orphan-reap.posix.test.ts#CONTROL: an mcp-server.mjs under a DIFFERENT drift-mcp token survives"
        status: pass
      - kind: integration
        ref: "packages/backend/src/orphan-reap.posix.test.ts#CONTROL: an mcp-server.mjs under a DIFFERENT directory prefix survives"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every unavailable-enumeration outcome (spawn threw, timed out, non-zero exit incl. pgrep's exit 1, zero pids parsed) is a no-op that kills nothing; only exit 0 with at least one pid reaps"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#classifyOrphanScanOutcome — every unavailable-enumeration outcome is a no-op (5 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No marker that is empty, prefix-only, mis-sized, upper-cased, separator-bearing or metacharacter-bearing can compose a scan pattern"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#buildSessionOrphanScanPlan — every unusable marker refuses before a pattern is composed (9 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The orphan path renders no pid as a leading-minus operand — the machine form of GD-01's independence from process groups"
    requirement: LIF-02
    verification:
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#produces no argument derived from a pid that begins with a minus"
        status: pass
      - kind: unit
        ref: "packages/backend/src/kill-plan.test.ts#renders the pid operand POSITIVE on darwin, linux and an undefined platform"
        status: pass
    human_judgment: false
  - id: D6
    description: "All three source carriers record A1 closed favourably and A6 falsified as dated marked corrections, with every superseded line preserved as a `// > ` block quote"
    requirement: LIF-01
    verification:
      - kind: other
        ref: "for f in kill-plan.ts index.ts kill-tree.posix.test.ts; do sed -E 's|^\\s*//\\s*>.*$||' $f | grep -c 'OPEN — not measured' = 0 && grep -c '2026-08-27' $f >= 1; done"
        status: pass
    human_judgment: false
  - id: D7
    description: "cleanupMcpRuntime invokes the reap above its temp-directory removal, and reapMcpOrphans' spawn/timeout/classify wiring behaves on Caido's LLRT"
    requirement: LIF-02
    verification: []
    human_judgment: true
    rationale: "index.ts declares no `caido:plugin` alias and cannot be imported by any test this project can run, so the wiring is verified by reading only — the plan itself rated this truth `verification: backstop`. Separately, no CI leg executes LLRT: whether Caido's plugin sandbox can spawn `pgrep` at all is unmeasured, and if it cannot, the reap degrades to the `enumerator-unavailable` no-op rather than failing loudly. Both need a real Caido install to close."

# Metrics
duration: 25 min
completed: 2026-08-27
status: complete
---

# Phase 8 Plan 06: Orphan Reap by Argv Marker Summary

**Drift can now terminate a token-bearing `mcp-server.mjs` it never spawned, identifying it by the session temp-dir marker in the child's own argv and killing it with a POSITIVE single pid — a path that owns its outcome instead of borrowing the provider CLI's process-group behaviour, which UAT measured unreliable.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-27T11:41:00Z
- **Completed:** 2026-08-27T12:06:24Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified; 1,405 insertions, 59 deletions)

## Accomplishments

- **The mechanism that does not depend on A6.** UAT measured A6 FALSE on real hardware: codex (pid 43921) sat in pgid 43752 while its `mcp-server.mjs` child (pid 44284) sat in pgid 44284, its own group. A group signal aimed at the CLI cannot reach that child, and OQ-2's single-pid rung signals the CLI rather than the child. `buildSessionOrphanScanPlan` → `parseOrphanScanPids` → `buildOrphanKillPlan` reaches it by argv marker and positive pid, with no process-group reference anywhere on the path.
- **The first reachable termination path on a G-04 orphan.** UAT gap 4 found a `node …/drift-mcp-<token>/mcp-server.mjs` alive holding a live `CAIDO_TOKEN` with `activeSessions: 0`, parented by a Codex binary Drift never spawned and absent from `activeProcesses` — invisible to `killTree` by construction. The reap identifies it by the target's own command line, so no handle and no parentage is needed.
- **A bounded blast radius, proven by two survivors.** The behavioural suite creates three fixtures and reaps ONE: a different token survives, and a different directory prefix survives. Verified non-vacuous — dropping the prefix anchor reds the second control, dropping the token anchor reds the first, and refusing in `buildOrphanKillPlan` reds the target case.
- **Every unavailable-enumeration arm is reachable by an executed assertion.** `classifyOrphanScanOutcome` was lifted out of `reapMcpOrphans` for exactly this reason: `index.ts` cannot be imported under vitest, so a four-arm ladder written inline there would be a decision no test could reach.
- **A1 closed favourably and A6 falsified in all three source carriers**, dated, cited to the measured `ps` rows, with every superseded line preserved as a `// > ` block quote.
- **Tests 602 → 642** (633 passed, 9 skipped). Zero tests removed; zero gates weakened.

## Task Commits

1. **Task 1 (tracer): End-to-end — a foreign-parented MCP child bearing Drift's marker dies** — `daedada` (feat)
2. **Task 2: Unit contract — every arm and every refusal, from literal inputs** — `ad5e7c0` (test)
3. **Task 3: Marked correction — A1 closed favourably, A6 falsified, in all three source carriers** — `8503203` (docs)

The tracer feedback gate ran between Tasks 1 and 2: the tracer's own `<verify>` was re-run end-to-end (28 tests green, typecheck 0, lint 0) before any expansion task began.

## Files Created/Modified

- `packages/backend/src/kill-plan.ts` — `MCP_TEMP_DIR_PREFIX`, `MCP_SERVER_SCRIPT_NAME`, `buildSessionOrphanScanPlan`, `buildPreviousRunOrphanScanPlan`, `parseOrphanScanPids`, `buildOrphanKillPlan`, `classifyOrphanScanOutcome`, the widened `KillPlanRefusal` union, the factored `isUnusablePid` predicate, and the dated A1/A6 correction block. Still zero I/O and still exactly one import.
- `packages/backend/src/kill-plan.test.ts` — 37 new cases (25 → 62), insertions only (425 added, 0 removed).
- `packages/backend/src/orphan-reap.posix.test.ts` (new) — the behavioural proof plus the two falsifying controls, with a vehicle caveat stating what a green run does and does not reach.
- `packages/backend/src/index.ts` — `ORPHAN_SCAN_TIMEOUT_MS`, `getMcpSessionDirName`, `reapMcpOrphans`, the single wired call site in `cleanupMcpRuntime`, the two bare `drift-mcp-` literals replaced by the shared constant, and the corrected single-pid-rung comment.
- `packages/backend/src/kill-tree.posix.test.ts` — corrected vehicle caveat, comments only (0 non-comment lines changed).

## Decisions Made

See `key-decisions` in the frontmatter. Two are worth restating because they constrain later plans:

- **The argv marker is now the contract for what counts as a Drift MCP process.** Plan 08-07 and any later registration work build on it, so replacing the identity model afterwards would touch every reap site. The plan rated this `reversibility: costly` and GD-01 had already locked it.
- **`buildPreviousRunOrphanScanPlan` refuses with `session-active` whenever a runtime is staged.** A class-wide pattern matches the live session's own MCP child as readily as a dead run's. Refusing beats filtering pids afterwards: a filter is a second thing that can be got wrong, and the cost of getting it wrong is killing the MCP server of the turn the user is watching. 08-07 is its only consumer and must respect that arm.

## Deviations from Plan

None — plan executed exactly as written.

One point of judgment worth recording rather than hiding: the plan's Task 1 acceptance criterion names the RED input "widen the pattern in `buildSessionOrphanScanPlan` to match `mcp-server\.mjs` alone". Run literally on the maintainer's own machine that is a match-everything reap, and the one thing it could have killed is a live Caido MCP server holding the maintainer's session token — the exact harm this plan exists to prevent. `pgrep -fl 'mcp-server\.mjs'` was checked first and returned nothing, but rather than open a window in which a Caido start mid-run would have been killed, the falsification was performed as two bounded halves that together prove the same thing:

- dropping the **prefix** anchor (keeping the token) → the wrong-prefix control fails, prefix-anchor confirmed load-bearing;
- dropping the **token** anchor (keeping the prefix, i.e. the class-wide pattern) → the different-token control fails, token-anchor confirmed load-bearing.

Both controls were therefore shown red against a real violating input, with a blast radius that could not reach anything outside the test fixtures. The criterion's intent is met; the literal command was not run, and this note is here so that reads as a decision rather than as a skipped gate.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None. No scope creep; `packages/frontend` and `packages/shared` are byte-untouched (SC-5 tripwire PASS).

## Gate Non-Vacuity

Every acceptance criterion in this plan was verified against a real violating input rather than asserted:

| Gate | RED input | Result |
|---|---|---|
| Both blast-radius controls | drop the prefix anchor / drop the token anchor | 1 control fails each time |
| Target dies | `buildOrphanKillPlan` refuses on POSIX | target case fails |
| Marker validation | delete `isValidSessionDirName`'s body | 7 cases fail (incl. metacharacter, separator, upper-case) |
| Positive pid operand | render the operand `-${pid}` | 2 cases fail |
| Classifier positive arm | hardwire the classifier to refuse | the reap case fails |
| Classifier no-op arms | flip the `scan-timeout` arm to `kill: true` | that arm's case fails |
| Verdict gate (live) | preserve a superseded verdict WITHOUT the `// > ` prefix | live count 0 → 2 |
| Verdict gate (preserved) | delete the superseded lines instead of quoting them | quoted count 2 → 0 |

The last two are falsifiable in opposite directions, which is what lets "zero live stale verdicts" and "the superseded text is still visible" both hold.

## Issues Encountered

None affecting the delivered work. Two operational notes:

- The plan's `<precondition>` (`command -v pgrep` exits 0) was checked first and passed: `/usr/bin/pgrep` on darwin 25.6.0.
- The plan's earlier draft rejected `ps` on truncation grounds; the plan itself corrects that (`ps -eo pid=,args=` emits ~283,431 chars against a 1,048,576-char cap, so no truncation would occur). That measurement-that-was-never-taken is not repeated in any source comment or in this SUMMARY — the three surviving reasons for `pgrep` (no parsing surface, a distinguishable no-match exit, output scaling with matches) are what the module records.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Residuals (carried forward, not defects)

- **AR-04 (win32).** `buildSessionOrphanScanPlan` refuses on win32 with `unsupported-platform`. `tasklist` prints no command lines, `wmic` is gone from current Windows, and spawning PowerShell from the plugin is a surface this phase will not open. The Windows termination path stays `taskkill /t`, which walks `ParentProcessId` and is indifferent to process groups — so A6 was never a Windows question — but the foreign-parented orphan class remains unreachable there. Plan 08-10 records it.
- **AR-05 (completion order).** `reapMcpOrphans` is not awaited, so the scan may still be running when `rm(mcpTempDir)` returns. Awaiting would suspend an RPC handler on a child-process callback Caido's runtime does not reliably deliver during an await. The reaper is insensitive to losing that race in a way `killTree` is not, because `pgrep -f` matches the command line the kernel recorded rather than a path that must still resolve. Plan 08-10 records it.
- **The `reapMcpOrphans` boundary itself is not covered by any executed assertion**, and neither is the `cleanupMcpRuntime` call site — `index.ts` cannot be imported under vitest. The plan rated that truth `verification: backstop`, and no static source gate was added because Task 1's `<files>` did not include `index.source.test.ts`. Both are D7 in the coverage block and route to human UAT. A static wiring assertion is the cheap strengthening available to plan 08-07.
- **A6's caveat travels with the verdict.** It was measured on ONE provider (Codex), on an instance Drift did not spawn. Claude Code — the active provider — remains unmeasured. The group kill is therefore KEPT alongside the new path rather than replaced: it is still correct wherever the child does stay in the CLI's group.

## Next Phase Readiness

- **Ready for 08-07**, which expands the reap to the remaining call sites. Everything it needs is exported and unit-asserted: `buildPreviousRunOrphanScanPlan` (with its `session-active` refusal already proven), `reapMcpOrphans` as a reusable boundary, and `getMcpSessionDirName`.
- **08-10** should pick up AR-04, AR-05, and `verdict-gate.sh` — the strip-then-count gate this plan proved in both directions is the one 08-10's gate must reproduce (`^\s*//\s*>` strip; do not invent a second marker).
- **No blockers.** `pnpm exec vitest run` 633 passed / 9 skipped (642), `pnpm -r typecheck` 0, `pnpm lint` 0, `packages/frontend` and `packages/shared` untouched.

## Self-Check: PASSED

- `packages/backend/src/orphan-reap.posix.test.ts` — FOUND
- `packages/backend/src/kill-plan.ts` — FOUND
- `packages/backend/src/kill-plan.test.ts` — FOUND
- `packages/backend/src/index.ts` — FOUND
- `packages/backend/src/kill-tree.posix.test.ts` — FOUND
- Commit `daedada` — FOUND
- Commit `ad5e7c0` — FOUND
- Commit `8503203` — FOUND
- Plan `<verification>` block re-run: import count 1, live `process.kill(-` 0, `shell: true` 0, SC-5 tripwire clean, orphan-reap 3/3, full suite 642 > 602.

---
*Phase: 08-process-lifecycle*
*Completed: 2026-08-27*
