---
phase: 08-process-lifecycle
verified: 2026-08-31T17:10:03Z
status: human_needed
score: 16/20 must-haves verified
behavior_unverified: 4
insufficient_spec: 0
overrides_applied: 0
supersedes_current_conclusions_of: .planning/phases/08-process-lifecycle/08-VERIFICATION.md
package_head: 12a7136d358786b15d377c43ed3ba234cc0004b8
planning_head_at_verification: 32266008afc27d05639456277aba37cb10dee4f5
re_verification:
  previous_status: gaps_found
  previous_score: 10/20
  previous_verified: 2026-08-31T15:01:21Z
  gaps_closed:
    - "WR-01: exact retired provider-start identity now drives one-shot stale-root cleanup; the equal-pointer recreated-root interleaving executes green."
    - "WR-02: final/staging config paths are owned before I/O, atomically promoted, and retained across failed removal for retry."
    - "WR-03: runtime reuse now requires correctly typed/readable artifacts and a parseable object context."
    - "Security audit: T-08-01 through T-08-94 plus T-08-SC are audited at the final package head with Git freshness and false-closure gates."
    - "LIF-02 traceability: the current record requires Plan 08-18, closed item 10, eight carriers, two pointers, and unchecked requirements."
    - "Windows evidence: every living carrier states the safe exact two-case contract and the recycled-pid datum is explicitly deferred."
  gaps_remaining: []
  human_evidence_remaining:
    - "SC-1 and the Windows half of SC-3: execute the exact two-case native suite on windows-latest or real Windows."
    - "SC-2 and the POSIX half of SC-3: demonstrate causality on a Drift-spawned non-Claude provider rather than provider-owned cleanup."
    - "SC-4: execute a faithful completion-order harness proving process death/reap completion before recursive token-source removal."
  regressions:
    - "None in portable evidence: 801 passed, 8 native-Windows tests skipped, typecheck/lint/build green, both standing gates green."
human_verification:
  - test: "Run the exact two-case kill-tree suite on windows-latest through Phase 9 SC-4"
    expected: "2 executed, 0 pending, 0 failed; the behavioral full name passes and both parent and grandchild are dead"
    why_human: "No native-Windows run exists; local macOS collection skips both cases."
  - test: "Run cancel and absolute timeout with a Drift-spawned codex turn in real Caido"
    expected: "During/after counts, one post-stop process-group listing, and lastOrphanReap distinguish Drift cleanup from provider cleanup"
    why_human: "Claude's pre-fix Control already shows provider-owned cleanup can produce the same favorable zero."
  - test: "Exercise kill/reap completion before recursive removal in real Caido or a faithful injected orchestrator harness"
    expected: "Every tracked process is dead or the reap is complete before its token-source root removal begins"
    why_human: "Current source gates prove invocation order only; child callbacks/timers are the constrained-runtime boundary."
---

# Phase 8: Process Lifecycle — Post-Plan-23 Verification

**Phase Goal:** Make cancel/timeout actually stop work on both platforms so no orphaned
token-bearing process survives a turn.

**Verified:** 2026-08-31T17:10:03Z
**Package head:** `12a7136d358786b15d377c43ed3ba234cc0004b8`
**Planning head at verification:** `32266008afc27d05639456277aba37cb10dee4f5`
**Status:** `human_needed`

## Verdict

All six actionable failures from the 10/20 verification are closed. WR-01/02/03 now have
executable failure-path tests and production wiring; the security audit is current at the final
package head; LIF-02 traceability and all living Windows records are current and independently
red-tested. The current follow-up review reports 0 critical, 0 warning, and 0 info findings.

Phase 8 is still not goal-complete. Four original behavior truths remain present but unverified:
native Windows tree death, real-provider causality for the POSIX mechanisms, cross-platform
cancel/timeout zero-survivor behavior, and kill/reap **completion** before recursive removal. No safe
local command can manufacture those readings. `human_needed` is therefore more accurate than the
previous `gaps_found`, and LIF-01/LIF-02 correctly remain unchecked.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Current evidence |
|---|---|---|---|
| 1 | SC-1: absolute-path taskkill terminates the Windows tree | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Pure plan, source, gate, and report-validator tests pass. The exact two native cases are both skipped locally and no windows-latest run exists. |
| 2 | SC-2: POSIX group kill plus argv-marker reap leaves no token-bearing orphan | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Node control/proof tests and Caido premises pass, but Claude's pre-fix Control shows its own cleanup can produce zero. A Drift-spawned codex causal run remains absent. |
| 3 | SC-3: cancel and timeout leave zero provider/MCP processes on both platforms | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Real macOS Claude cancel/timeout measured 1→0; provider cleanup is implicated and Windows is unrun. |
| 4 | SC-4: tracked processes die before token-source files are swept | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Source tests prove kill→reap→rm invocation order. Fire-and-forget process callbacks mean completion order is not executed. AR-05 remains explicit. |
| 5 | SC-5: POSIX-visible behavior and existing tests stay green | ✓ VERIFIED | Fresh full run: 42 files passed, 2 native files skipped; 801 passed, 8 skipped. Typecheck, lint, and build pass. |
| 6 | Repaired A1 topology and causal measurement | ✓ VERIFIED (coincidental-reliance noted) | Prior real-Caido control pair plus repaired three-valued probe remain intact; the invalid 2026-08-27 reading remains retracted. |
| 7 | A6 is recorded as a per-provider measurement | ✓ VERIFIED | Claude true, codex false, Gemini/Copilot explicitly unmeasured. No universal claim is made. |
| 8 | Pre-fix Control is recorded as a measurement | ✓ VERIFIED | 1 during and 0 after Stop with exitCode 143; it falsifies the original non-zero prediction and preserves the discarded non-Stop run. |
| 9 | Three-valued liveness instrument defaults to inconclusive | ✓ VERIFIED | Classifier tests and patch verifier retain the closed union and cannot-tell default. |
| 10 | POSIX enumerator is spawnable in real Caido | ✓ VERIFIED | Recorded exit=1 remains reachable only through the spawned pgrep close callback. |
| 11 | lastOrphanReap is bounded to scalar diagnostics | ✓ VERIFIED | Whitelist formatter and source census remain green. |
| 12 | Open runtime items are owned or explicitly ownerless | ✓ VERIFIED | Deferred ledger and current records retain Phase 9 ownership plus real-provider/harness needs. |
| 13 | A1 correction propagation and standing gate | ✓ VERIFIED | Self-test passes; live ARM A/B/C reports 9 records, 8 carriers, 2 pointers, 8 unchanged A6 carriers, and 23 pinned summaries. |
| 14 | Threat registry and audit gate cover live evidence | ✓ VERIFIED | Live 94+SC join, production self-test/self-scan, and independent 32-case matrix pass; accepted residual count remains 13. |
| 15 | Invalidated provider-start generations remove retired roots | ✓ VERIFIED | Exact lease tombstone is consumed once; equal-looking/current controls pass and a real recreated root is removed while the installed pointer remains textually equal. |
| 16 | Token config ownership survives write/unlink failure | ✓ VERIFIED | Real-filesystem tests cover partial write, failed promote/remove, EACCES retention/retry, and overlapping cleanup; both provider paths share the owner-aware writer/funnels. |
| 17 | Runtime reuse requires readable regular files | ✓ VERIFIED | Directory, missing, non-regular, stat/open/read failure, malformed/null/array/scalar context, and real unreadable cases fail closed; inspection precedes disposition/reuse. |
| 18 | Security status is audited at current package head | ✓ VERIFIED | `audited_at_head=12a7136`; tree `67ece25a…`; SHA-256 census `df578b95…`; 29 post-prior-audit commits inspected; zero later package commits; T-08-89…94 mapped. |
| 19 | LIF-02 traceability pointer is semantically current | ✓ VERIFIED | One bounded current record requires Plan 08-18, closed item 10, exactly eight mutable carriers, two live pointers, and the remaining runtime blockers; stale/empty/duplicate/separated/contradictory fixtures are red. |
| 20 | Windows evidence records match the current safe suite | ✓ VERIFIED (record contract) | Five carriers plus WINDOWS table/JSON agree on exactly 2/2, `e1ac837`, recycled-pid safety, no reserved block, explicit deferral, and open LIF-01. This is not native execution. |

**Score:** 16/20 truths verified; 4 present but behavior-unverified; 0 actionable code/record gaps.

## Closure of the Six Previous Gaps

| Previous gap | Current implementation/evidence | Status |
|---|---|---|
| WR-01 retired-root generation ownership | `retiredProviderStarts`, exact one-shot lease consume, injected interleaving and real temp-root deletion, production source gate | ✓ CLOSED |
| WR-02 config ownership | `writeOwnedTempFile`, `cleanupOwnedPaths`, atomic rename, owner-before-I/O, EACCES retention/retry, shared provider funnels | ✓ CLOSED |
| WR-03 artifact reuse | `inspectRequiredMcpRuntimeArtifacts`, type/read/parse matrix, pre-disposition wiring | ✓ CLOSED |
| Stale security audit | T-08-01…94+SC, 44-row owner/evidence ledger, 13 residuals, derived high-open status, Git latest/tree/digest/delta gate | ✓ CLOSED |
| Stale LIF-02 roll-up | Current marked Plan-08-18/eight/two/open record plus semantic red fixtures | ✓ CLOSED |
| Stale Windows 3/3/dead-pid record | Exact two-case contract across five carriers and dual ledger; unsafe datum deferred without restoring the probe | ✓ CLOSED |

## Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `packages/backend/src/index.ts` | ⚠️ PARTIAL only at runtime boundary | WR-01/02/03 wiring is substantive and gated; SC-4 completion and real-provider causality remain unexecuted. |
| `packages/backend/src/mcp-lifecycle.ts` | ✓ VERIFIED | Exact identity/epoch lifecycle state and retired-root cleanup execute under adversarial interleavings. |
| `packages/backend/src/owned-temp-file.ts` | ✓ VERIFIED | Owner-before-I/O, atomic publication, and delete-after-success semantics execute against real temporary files. |
| `packages/backend/src/mcp-runtime-artifacts.ts` | ✓ VERIFIED | Import-free type/readability/object-context predicate fails closed without logging values. |
| `packages/backend/src/kill-tree.win32.test.ts` | ⚠️ PRESENT | Exactly two safe native cases; both skip off Windows. |
| `.github/workflows/ci.yml` | ✓ VERIFIED (static) | expectedTotal=2 and exact behavioral full name remain pinned; runner execution absent. |
| `verdict-gate.sh` | ✓ VERIFIED | Self-test and live ARM A/B/C pass; all 23 dated summaries are blob-pinned. |
| `threat-register-gate.sh` and test | ✓ VERIFIED | Through-94 citations, owner ledger, aggregates, Git freshness, and 32 red/green directions pass. |
| `08-SECURITY.md` | ✓ VERIFIED (package audit) | Secured register is current to the latest package-changing commit; accepted-high T-08-47 remains explicit. |
| `.planning/REQUIREMENTS.md` | ✓ VERIFIED (record), requirements open | Current LIF traceability is accurate; both boxes remain deliberately unchecked. |
| `08-REVIEW-2.md` | ✓ VERIFIED | Additive current review: 0 critical / 0 warning / 0 info. Historical `08-REVIEW.md` remains the red input. |

## Key Link and Data-Flow Verification

| Link | Status | Evidence |
|---|---|---|
| Provider preparation lease → retired-root cleanup | ✓ WIRED | Teardown tombstones exact leases before await; finally consumes exact identity and removes only retired captured root. |
| Per-turn config write → owner set → cleanup | ✓ WIRED | Both provider writes pass the same set before I/O; finalize and outer finally retry the same owners. |
| Start → artifact inspection → disposition → reuse | ✓ WIRED | Strict inspection precedes disposition and reuse; old existence-only shortcut is absent from the adapter. |
| Verdict gate → REQUIREMENTS/WINDOWS living records | ✓ WIRED | Semantic current markers and table/JSON parity are parsed; historical quoted text cannot satisfy them. |
| Threat gate → package citations/register/ledger/Git | ✓ WIRED | Exact range, path sentinels, mapping parity, aggregates, latest package commit, tree and digest all join. |

## Fresh Verification Evidence

| Check | Result |
|---|---|
| Full Vitest | **PASS — 42 files passed / 2 skipped; 801 passed / 8 skipped / 809 total** |
| Directed WR suites | **PASS — 4 files, 119/119** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — zero warnings at `--max-warnings 0`** |
| Build | **PASS — backend, frontend, package directory, ZIP** |
| Verdict gate | **PASS — self-test and live 9 / 8 / 2 / 8 / 23 counts** |
| Threat gate | **PASS — self-test, self-scan, live 94+SC, independent 32 cases** |
| Native Windows | **UNEXECUTED — 6 spawn-plan and 2 kill-tree tests skipped locally** |
| Package drift after audit | **0 commits; package working diff 0** |

The dirty input hashes stayed fixed throughout execution and verification:
`PROJECT.md` = `5a2bec72…`, authoritative `08-VERIFICATION.md` = `4ff49693…`. This additive
file does not modify or supersede the historical contents on disk; it supersedes only their current
conclusions.

## Requirements Coverage

| Requirement | Status | Evidence boundary |
|---|---|---|
| LIF-01 | ✗ BLOCKED / correctly unchecked | Mechanism, safe two-case suite, CI gate, and living records are current. Native execution has never occurred; Phase 9 SC-4 remains the owner. |
| LIF-02 | ✗ BLOCKED / correctly unchecked | Portable WR fixes and limited macOS evidence are strong, but no non-Claude causal reading shows Drift's group/reap mechanism did the work, and SC-4 completion order remains unexecuted. |

## Current Human Verification Required

1. Execute the exact two-case native Windows suite via Phase 9 SC-4.
2. Run a Drift-spawned codex cancel and absolute-timeout session with during/after counts, one
   process-group listing, and `lastOrphanReap`.
3. Execute a faithful completion-order harness for kill/reap completion before recursive removal.

These are evidence acquisitions, not missing autonomous implementation tasks. Until they exist,
Phase 8, LIF-01, and LIF-02 remain open.

## Final Status

`human_needed` — no actionable code, security-register, traceability, or Windows-record gap remains,
but four behavior truths still lack the runtime evidence required by the phase goal.

---
_Verified: 2026-08-31T17:10:03Z_
_Verifier: Codex (inline gsd-verifier follow-up; no subagent available by instruction)_
