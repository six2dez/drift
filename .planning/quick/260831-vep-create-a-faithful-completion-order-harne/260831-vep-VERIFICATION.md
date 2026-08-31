---
phase: quick-260831-vep
verified: 2026-08-31T20:58:13Z
status: gaps_found
score: 6/6 evidence must-haves verified
product_gap_count: 1
package_head: 00170eaf8b77dd1180490d68ecd6b6d33ce53cc7
---

# Quick Task 260831-vep: Completion-order Evidence Verification

**Task goal:** Acquire faithful executable evidence for whether Drift completes provider-tree
termination and the MCP orphan reap before recursively removing the runtime root containing
token-source files.

**Verdict:** `gaps_found`

The evidence acquisition itself is complete and non-vacuous. It falsifies SC-4 on the current
tree: recursive removal begins after both mechanisms are **issued**, but before the tracked
provider exit, tree-killer close, or orphan-scan close has completed. This converts the former
human-evidence item into one actionable lifecycle implementation gap. It does not close LIF-01 or
LIF-02.

## Exact Predicate and Result

The harness samples the following predicate synchronously on entry to the production
`fs/promises.rm(runtimeRoot, { recursive: true, force: true })` boundary:

```text
requirementSatisfied =
  providerExitComplete && treeKillComplete && reapScanComplete
```

All three runs emitted the same observation:

```json
{"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":false,"treeKillSpawned":true,"treeKillComplete":false,"reapScanSpawned":true,"reapScanComplete":false,"requirementSatisfied":false}
```

Interpretation:

| Datum at removal start | Observed | Meaning |
|---|---:|---|
| `directSignalIssued` | `true` | `killTree` reached the tracked provider handle. |
| `treeKillSpawned` | `true` | The process-group killer was issued. |
| `reapScanSpawned` | `true` | The argv-marker orphan scan was issued. |
| `providerExitComplete` | `false` | No tracked-provider exit completion preceded removal. |
| `treeKillComplete` | `false` | The process-group killer had not closed. |
| `reapScanComplete` | `false` | Enumeration/reap had not completed. |
| `requirementSatisfied` | `false` | SC-4's completion-before-removal predicate is false. |

The earliest violating event is therefore `token_root_remove_started`: all three completion flags
are still false at that boundary.

## Reproduction

Command, run three times in fresh Vitest processes:

```bash
pnpm exec vitest run \
  --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts \
  --reporter=verbose
```

Observed on runs 1, 2, and 3:

```text
Test Files  1 failed (1)
     Tests  1 failed (1)
AssertionError: expected false to be true
DRIFT_COMPLETION_ORDER_OBSERVATION={"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":false,"treeKillSpawned":true,"treeKillComplete":false,"reapScanSpawned":true,"reapScanComplete":false,"requirementSatisfied":false}
exit 1
```

The final assertion is intentionally favorable (`requirementSatisfied === true`). A non-zero exit
is therefore the evidence verdict, not a broken harness invocation. The non-vacuity assertions
precede that final line; Vitest reports only the final assertion failing, so runtime start, API
registration, provider tracking, direct signal issuance, group-killer spawn, orphan-scan spawn,
event publication, and exactly one isolated target-root removal all passed.

## Faithfulness and Isolation Audit

The verifier read the complete harness and checked these links:

1. It dynamically imports the real `packages/backend/src/index.ts` and calls its exported `init()`.
2. It captures the real functions supplied to `sdk.api.register` and drives
   `updateSettings` → `syncCaidoSessionToken` → `startMcpServer` → `createCliSession` →
   an in-flight `sendCliMessage` → `stopMcpServer`.
3. The staged `mcp-server.mjs`, context, per-turn files, and recursive root are real filesystem
   artifacts under a unique synthetic temp root.
4. Only host boundaries are controlled: `os` facts, child-process completion timing, safe
   no-match prerequisite probes, and observation/delegation of `fs.rm`.
5. `readdir` returns no entries outside the isolated root, so the startup legacy `/tmp` sweep
   cannot discover a live Drift directory. Recursive removal of any `drift-mcp-*` path outside the
   isolated root throws before touching the filesystem.
6. The only token is the literal `synthetic-token-not-a-secret`; no environment or argv values are
   printed. Auth validation is synthetic and performs no network request.
7. Every held child is completed in `finally`, the in-flight send promise is awaited, all boundary
   hooks are disarmed, and the fixture root is removed.

This is a controlled adverse-schedule proof of the missing happens-before relation, not a claim
about typical OS latency. That distinction is sufficient for the verifier's requested “faithful
injected orchestrator harness”: if production enforces completion before removal, delaying valid
host completions cannot make removal overtake them. Here it does.

## Production Cause

At package source SHA-256
`cbf2832d22434e8425ec19b110bfc9c3627fab8b6387f1af2b59c876d75558d3`:

- `packages/backend/src/index.ts:4459-4461` calls `killTree(...)` and immediately removes the
  process from `activeProcesses`.
- `packages/backend/src/index.ts:4498-4502` explicitly states that completion order is not
  enforced.
- `packages/backend/src/index.ts:4508-4523` issues `reapMcpOrphans(...)`, which returns `void`.
- `packages/backend/src/index.ts:4525-4527` immediately begins the awaited recursive removal.

Existing source tests correctly prove statement order (`kill` → `reap` → `rm`) but do not prove
completion order. The new harness exercises the missing boundary and shows the distinction is
material.

## Artifact Integrity

| Artifact | SHA-256 |
|---|---|
| `completion-order.harness.ts` | `fbb26377b639b078b998d46bc7997d7f835e22565679b621ed54e3bb4dfd5d33` |
| `vitest.harness.config.ts` | `2a730feb099488b66b8988ba0e12bf161025dc2a4ab190f0c40e3b10e07d1009` |
| `packages/backend/src/index.ts` | `cbf2832d22434e8425ec19b110bfc9c3627fab8b6387f1af2b59c876d75558d3` |

Harness commit: `00170eaf8b77dd1180490d68ecd6b6d33ce53cc7`.

## Regression Controls

| Check | Result |
|---|---|
| Harness reproducibility | **3/3 identical observations; 3/3 intentional exit 1** |
| Lifecycle controls | **PASS — 3 files, 87/87 tests** |
| Full Vitest | **PASS — 42 files passed / 2 skipped; 801 passed / 8 skipped** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — exit 0, zero warnings at `--max-warnings 0`** |
| Default-suite isolation | **PASS — full Vitest did not discover the `.harness.ts` file** |

The eight skipped tests remain the two native-Windows files; no native Windows evidence was
manufactured by this task.

## Must-Have Verification

| # | Evidence must-have | Status | Evidence |
|---|---|---|---|
| 1 | Production public API path | ✓ VERIFIED | `init()` plus six registered handlers execute before observation. |
| 2 | Only host boundaries controlled | ✓ VERIFIED | Mocks are limited to `os`, `child_process`, `fs/promises.rm`, and safe `readdir`. |
| 3 | Issuance and completion separate | ✓ VERIFIED | Seven booleans and one named removal event are emitted. |
| 4 | Exact SC-4 classification | ✓ VERIFIED | Favorable conjunction fails on all three runs. |
| 5 | Unfavorable result preserved | ✓ VERIFIED | Explicit run exits 1; this report is `gaps_found`; requirements remain open. |
| 6 | No live Drift target | ✓ VERIFIED | Isolated root, external sweep suppression, and recursive-removal refusal guard. |

**Evidence score:** 6/6. **Product result:** one critical lifecycle gap found.

## Gap

### SC-4 completion barrier is absent

- **Missing:** A completion-bearing teardown design that reaches recursive root removal only after
  tracked-provider termination and the generation-scoped orphan reap have completed or have
  produced an explicit fail-closed outcome.
- **Impact:** Drift can delete the token-source files and their session/policy trail while a process
  that already read the Caido token is still live. File deletion does not revoke the token in
  process memory.
- **Constraint:** A direct `await` on child callbacks inside the RPC handler is not an accepted fix;
  the code records Caido event-loop starvation on that shape. The repair needs a non-starving
  completion/state-machine boundary and must make this harness green without weakening its final
  assertion.
- **Scope:** Production design and implementation were not authorized by this evidence-only task.

## Remaining External Evidence

This task retires the third acquisition as an evidence question and replaces it with a code gap.
The two external acquisitions remain:

1. Execute the exact two native lifecycle cases on `windows-latest` or real Windows.
2. Measure cancellation and absolute timeout of a Drift-spawned Codex turn in real Caido, proving
   Drift—not provider-owned cleanup—caused the zero-survivor outcome.

---
*Verified: 2026-08-31T20:58:13Z*
*Verifier: Codex inline; subagent dispatch prohibited by active collaboration instructions*
