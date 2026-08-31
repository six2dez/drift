---
phase: 08-process-lifecycle
reviewed: 2026-08-31T17:09:19Z
depth: standard
supersedes_findings_from: .planning/phases/08-process-lifecycle/08-REVIEW.md
diff_base: 1a1818ff5d4e74a430ab4de942b140980d6e9e0a
package_review_head: 12a7136d358786b15d377c43ed3ba234cc0004b8
planning_review_head: 3226600
files_reviewed: 11
files_reviewed_list:
  - packages/backend/src/index.source.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/mcp-lifecycle.test.ts
  - packages/backend/src/mcp-lifecycle.ts
  - packages/backend/src/mcp-runtime-artifacts.test.ts
  - packages/backend/src/mcp-runtime-artifacts.ts
  - packages/backend/src/owned-temp-file.test.ts
  - packages/backend/src/owned-temp-file.ts
  - .planning/phases/08-process-lifecycle/verdict-gate.sh
  - .planning/phases/08-process-lifecycle/threat-register-gate.sh
  - .planning/phases/08-process-lifecycle/threat-register-gate.test.sh
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: passed
---

# Phase 08: Post-Gap-Fix Code Review

**Reviewed:** 2026-08-31T17:09:19Z
**Depth:** standard, adversarial follow-up on WR-01/02/03 and their standing gates
**Status:** passed

## Outcome

The three warnings in `08-REVIEW.md` are fixed at the current package head, and no new reportable
source or gate defect was found in their replacement paths. This is an additive current review;
the earlier report remains the historical red input that caused Plans 08-20…08-22.

The review does not promote native-Windows or real-Caido behavior. The eight native Windows tests
remain skipped on macOS, and the source-order tests still cannot prove that asynchronous process
termination completes before recursive removal. Those are verification evidence gaps, not hidden
code-review passes.

## Finding Closure

| Prior finding | Current mechanism | Adversarial direction checked | Verdict |
|---|---|---|---|
| WR-01 retired root survives an equal installed pointer | `retiredProviderStarts` stores exact lease objects; `releaseProviderStartLease` consumes one tombstone; `cleanupRetiredProviderStartRoot` acts on that result rather than pathname equality | Equal-looking lease rejected, exact lease consumed once, nested teardown retained, current generation negative control, real recreated root removed while pointer text remains equal, source guard bans the former equality inference | **FIXED** |
| WR-02 token config becomes ownerless on partial write or unlink failure | `writeOwnedTempFile` owns final/staging paths before I/O and atomically renames; `cleanupOwnedPaths` removes ownership only after confirmed deletion | Partial write plus EACCES, rename plus cleanup failure, unlink EACCES plus later retry, overlapping cleanup, both provider call sites and both cleanup funnels | **FIXED** |
| WR-03 existence-only runtime reuse | `inspectRequiredMcpRuntimeArtifacts` requires directory root, regular/openable script, and readable non-null/non-array JSON object context before disposition | Directories at file paths, missing/non-regular objects, stat/open/read EACCES, malformed/null/array/scalar context, real unreadable POSIX file, inspection-before-reuse source order, `fileExists` shortcut absent | **FIXED** |

## Security and Failure-Mode Review

- Provider-start cleanup authorization is exact object/epoch identity. A path string cannot authorize
  deletion of a current generation or suppress deletion of a retired one.
- Token-bearing config bytes are written only to an owned `0o600` staging path inside the existing
  `0o700` runtime root and published by same-directory rename. Every unconfirmed path remains in the
  shared owner set for the other cleanup funnel.
- Artifact inspection is import-free and uses only injected `stat`, `open`/`close`, and `readFile`
  operations already available at the constrained backend boundary. Every exception fails closed to
  replacement and no context bytes or filesystem error text are logged.
- The threat gate derives register/ledger/accepted-risk/high-open totals and rechecks Git package
  freshness. Its fixture diagnostics are IDs, counts, and relative paths; canary content is absent.
- The audit self-test creates isolated temporary Git repositories. Recursive cleanup is bounded to
  the validated `mktemp` root and does not operate on the workspace.
- No dependency, frontend, shared, CI, release, or package file changed in Plan 08-23.

## Verification Evidence

- Full Vitest: **42 files passed, 2 native-Windows files skipped; 801 passed, 8 skipped, 809 total**.
- Directed WR set: **4 files, 119 passed**.
- Workspace typecheck: shared/backend/frontend all exit 0.
- ESLint: exit 0 at `--max-warnings 0`.
- Production build: backend, frontend, package directory, and `plugin_package.zip` built successfully.
- Verdict gate: self-test pass; live ARM A/B/C pass with 9 records, 8/2/8 carrier counts, and 23
  pinned summaries.
- Threat gate: syntax, self-test, self-scan, live 94+SC census, and independent **32-case** matrix pass.
- Package audit: `12a7136` remains the latest package-changing commit; zero later package commits.

## Residual Evidence Boundaries

- Native `windows-latest` process-tree behavior is unexecuted.
- A non-Claude real-provider run has not established that Drift, rather than provider cleanup, caused
  the favorable no-orphan result.
- Source order proves kill/reap invocation precedes removal; it does not prove asynchronous completion
  precedes removal. AR-05 remains the recorded accepted residual.
- `LIF-01` and `LIF-02` therefore remain unchecked.

---
_Reviewed: 2026-08-31T17:09:19Z_
_Reviewer: Codex (inline gsd-code-review follow-up; no subagent available by instruction)_
