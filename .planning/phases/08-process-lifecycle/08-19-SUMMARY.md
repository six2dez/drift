---
phase: 08-process-lifecycle
plan: 19
subsystem: process-lifecycle
status: complete
tags: [threat-register, citation-integrity, security-audit, nul-safe, gap-closure]

requires:
  - "08-18: converged A1 carriers, live pointers, and immutable historical record"
  - "08-VERIFICATION.md gap 2: stale 50+SC register and absent standing citation-integrity control"
provides:
  - "Current 88-numeric-plus-sentinel Phase 08 threat register with 38-row responsibility ledger"
  - "NUL-safe live citation-to-register gate with repository-wide newline-path preflight"
  - "Independent 26-case red/green fixture matrix and production two-script self-scan"
affects:
  - "Phase 08 authoritative verification gap 2"
  - "Phase 08 security audit and accepted-risk census"
  - "LIF-01 and LIF-02 evidence records, which remain open"

tech-stack:
  added: []
  patterns:
    - "Two-pass shell discovery: validate all NUL-delimited paths before parsing any citation"
    - "Exact bounded Markdown-table parser joined to dynamic package/support discovery"
    - "Runtime-fragment red fixtures that cannot poison the live support-artifact census"

key-files:
  created:
    - ".planning/phases/08-process-lifecycle/threat-register-gate.sh"
    - ".planning/phases/08-process-lifecycle/threat-register-gate.test.sh"
    - ".planning/phases/08-process-lifecycle/08-19-SUMMARY.md"
  modified:
    - ".planning/phases/08-process-lifecycle/08-SECURITY.md"
    - ".planning/STATE.md"
    - ".planning/ROADMAP.md"

key-decisions:
  - "The package audit boundary is task-1 commit 318fe24a with Git tree 1250a4c4 and zero package-changing commits after it; later plan commits are documentation/support only"
  - "All 13 accepted residuals remain explicit, including accepted-high T-08-47 / AR-06 with decider six2dez; zero open threats does not hide that exception"
  - "LIF-01 and LIF-02 remain unchecked because this record-integrity plan adds neither native-Windows execution nor real-turn causality evidence"
  - "A newline-bearing path is a repository-wide preflight failure: no citation parsing or ID diagnostic is allowed before both discovery families pass"

requirements-completed: []

coverage:
  - id: D1
    description: "Complete current Phase 08 main register and controlled-owner roll-up"
    verification:
      - kind: other
        ref: "threat-register-gate.sh: 88 numeric rows + T-08-SC, 92 package files, 5 support artifacts"
        status: pass
      - kind: other
        ref: "owner-ledger awk gate: exactly 38 T-08-51..T-08-88 rows; accepted-risk census: 13"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-vacuous citation discovery, parser, join, and confidential diagnostics"
    verification:
      - kind: integration
        ref: "bash threat-register-gate.test.sh: 26 independent green/red cases"
        status: pass
      - kind: other
        ref: "threat-register-gate.sh --self-test and --self-scan"
        status: pass
    human_judgment: false
  - id: D3
    description: "Current mechanism and A1 record evidence preserved"
    verification:
      - kind: integration
        ref: "Vitest kill-plan, POSIX-tree, and source-structure suites: 182/182"
        status: pass
      - kind: other
        ref: "verdict-gate.sh ARM A/B/C and verify-a1-patch.sh apply/typecheck/build"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck: shared, backend, frontend"
        status: pass
    human_judgment: false
  - id: D4
    description: "Audit boundary, package immutability, and protected evidence integrity"
    verification:
      - kind: other
        ref: "31 package commits from d2d502b to 318fe24a; zero package commits after audited_at_head"
        status: pass
      - kind: other
        ref: "verify-a1-patch worktrees 1->1; package status 0->0; protected SHA-256 triplet unchanged"
        status: pass
    human_judgment: false

metrics:
  duration: "31 min"
  completed: 2026-08-31
  tasks: 3
  files: 6

actuals:
  tokens: 14252
  tasks: 3
  commits: 3
---

# Phase 8 Plan 19: Current Threat Register and Citation Integrity Summary

Phase 08 now has a current 89-row security register and a standing, independently falsified control that rejects every unregistered live package/support citation without leaking matched content.

## Accomplishments

- Expanded the canonical seven-column main register from 50 numeric rows plus T-08-SC to the complete T-08-01…T-08-88 range plus T-08-SC, preserving all prior severity/disposition decisions and accepted-high T-08-47.
- Added a separate 38-row T-08-51…T-08-88 ledger with mechanically constrained severity, disposition, evidence, outcome, and one of three named six2dez responsibility owners.
- Added a dynamic citation gate over 92 package text files and five depth-one Phase 08 support artifacts, with exact register anchoring, path-specific liveness sentinels, duplicate/range rejection, and value-free diagnostics.
- Added a 26-case independent fixture matrix covering package/support misses, parser false greens, PLAN/SUMMARY exclusions, both-family spaces/tabs/quotes/globs, newline refusal, canary confidentiality, and the final two-script self-scan.
- Re-audited the package boundary at `318fe24a78061db283272d88357185b0fb1e384a`: tree `1250a4c430874212eafad531cc610bbaa27341b5`, SHA-256 census `5116876fd8c85fb0398517c62e0a2b9b8396b9bf134d21f55af5c52f3eea3958`, 31 package commits since `d2d502b`, and zero after the audit SHA.

## Task Commits

| Task | Commit | Result |
|---|---|---|
| 1 | `318fe24` | Added the fail-closed live citation tracer; self-test green and stale live register red at exactly 50 numeric + T-08-SC |
| 2 | `712a5fb` | Re-audited the complete register, added the 38-row owner ledger and four residual records, and pinned the current package audit boundary |
| 3 | `55565b7` | Added the independent matrix and fixed pathname ordering so newline refusal precedes all citation parsing |

## Verification

| Check | Result |
|---|---|
| Pre-roll-up tracer | **EXPECTED RED — parsed 50 numeric + T-08-SC, then named missing package and support IDs** |
| Production self-test | **PASS** |
| Independent fixture matrix | **PASS — 26 cases** |
| Production self-scan | **PASS — both shell files discovered, no literal invalid fixture citation** |
| Live citation gate | **PASS — 88 numeric + T-08-SC; 92 package files; 5 support artifacts** |
| Owner-ledger gate | **PASS — 38/38 rows with allowed severity, disposition, and Owner values** |
| Residual/aggregate census | **PASS — 13 residuals; 13 numeric accepts; T-08-47 accepted-high explicit; threats_open 0** |
| Verdict gate ARM A | **PASS — 9 exact current-verdict records** |
| Verdict gate ARM B | **PASS — 8 A1 carriers, 2 pointers, 8 unchanged A6 carriers** |
| Verdict gate ARM C | **PASS — canonical Spike digest, 17 pinned blobs, 18 summaries accounted for** |
| `verify-a1-patch.sh` | **PASS — applies at 68199fa, backend type-checks, builds 5-file package; scratch worktree removed** |
| Targeted Vitest suites | **PASS — 3 files, 182 tests** |
| `pnpm -r typecheck` | **PASS — shared, backend, frontend** |
| Package/worktree backstop | **PASS — worktrees 1→1, package status 0→0, no package/frontend/shared diff** |
| Protected evidence | **PASS — PROJECT, VERIFICATION, and SPIKE hashes unchanged** |

## TDD Gate Compliance

- Task 1's tracer captured the required pre-roll-up red state only after proving the exact parser was live at 50 numeric rows plus T-08-SC; its fixture self-test was green before the task commit.
- Task 3 RED failed at `newline-preflight-forbidden-one`, proving an earlier malformed citation was processed before a later unsafe pathname.
- Task 3 GREEN introduced a repository-wide two-pass pathname preflight; the unchanged independent matrix then passed all 26 cases. RED and GREEN were retained in one task-atomic commit as required by the sequential execution contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made newline refusal precede all citation processing**

- **Found during:** Task 3 independent RED matrix.
- **Issue:** The initial tracer NUL-safely rejected newline paths, but parsed citations from earlier files before discovery reached a later unsafe pathname. That violated the fail-before-parsing contract and could emit a safe ID diagnostic before the constant newline failure.
- **Fix:** Split discovery into a repository-wide pathname/text preflight and a second citation pass. Citation parsing now starts only when every package and support pathname has passed.
- **Files modified:** `threat-register-gate.sh`, `threat-register-gate.test.sh`, `08-SECURITY.md`
- **Commit:** `55565b7`

No architectural changes, authentication gates, package installs, release actions, pushes, or scope expansions occurred.

## Evidence Boundaries Preserved

- LIF-01 remains unchecked: the `windows-latest` vehicle has still not executed and no native-Windows reading was manufactured.
- LIF-02 remains unchecked: the repaired A1 outcome is preserved with its retracted predecessor, but the zero pre-fix Control does not prove Drift's group-kill causality; direct shipping-runtime reap assertions and real-turn causality remain open.
- The accepted-high registration risk T-08-47 / AR-06 remains visible beside `threats_open: 0`, with six2dez retained as named decider.
- No package, frontend, shared, runtime, UI, requirement checkbox, release, or remote state changed.

## Known Stubs

None. The scan found no TODO, FIXME, placeholder, skipped test, mock-data path, or UI-flow empty initializer in the files created or modified by this plan. The phrase “not available” occurs only in the pre-existing AR-03 explanation of unavailable token revocation and is not a stub.

## Issues Encountered

None remain. The independent RED exposed one in-scope ordering bug and the same task fixed and re-verified it.

## Next Phase Readiness

Authoritative verification gap 2 now has a current register and a standing executable control. The remaining Phase 08 closure work is evidence-owned rather than register-owned: native Windows execution, direct shipping-runtime reap assertions, and real-turn causality must stay open until measured.

## Self-Check: PASSED

- The SUMMARY and all three task-owned artifacts exist.
- Task commits `318fe24`, `712a5fb`, and `55565b7` exist in Git with no tracked-file deletion.
- The SUMMARY passes `git diff --check`; the package tree is clean and the protected PROJECT, VERIFICATION, and SPIKE hashes still match the dispatch manifest.
