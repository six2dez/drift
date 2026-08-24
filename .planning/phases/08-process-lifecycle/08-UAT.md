---
status: testing
phase: 08-process-lifecycle
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md
started: 2026-08-24T22:40:00Z
updated: 2026-08-24T22:40:00Z
gate_overrides:
  - gate: api-coverage.verify-pre
    decided: 2026-08-24
    by: maintainer
    reason: >-
      False positive. The detector matched the prose "requires Win32 API calls neither
      Caido's LLRT nor Node exposes without a native addon — banned by the ..." — a sentence
      stating that Win32 API calls are unavailable and NOT used. Phase 8 integrates no
      external API; it terminates processes. The same detector returned detected:false at
      plan time and fires now only because the executed plans added prose containing the
      word. No COVERAGE.md was produced because there is no API surface to enumerate.
---

## Current Test

number: 1
name: A1 — the shipped Caido LLRT honours the process-group spawn option
expected: |
  Drift → Settings → Copy diagnostics reports spikeDetachedGroupKill as
  "grandchild-died (detached honoured)".
awaiting: user response

## Tests

<!--
  All ten checkpoints below are human_judgment items surfaced by the coverage
  classifier. None is a regression: every one is already recorded by its own SUMMARY
  as NOT DELIVERED, unrun, or attestation-only. They cluster into three actions:

    A. Run the A1/A6 spike on a real Caido install   → tests 1, 2, 3, 4, 5
    B. Push the branch to fire the windows-latest leg → tests 6, 7, 8
    C. Re-run cancel + timeout with counts recorded   → tests 9, 10

  The probe for cluster A is recoverable at commit 68199fa:
    git checkout 68199fa -- packages/backend/src/index.ts && pnpm build
  08-SPIKE.md keeps the full four-step procedure runnable.
-->

### 1. A1 — LLRT honours the process-group spawn option
source: 08-01-SUMMARY.md D2
expected: Diagnostics reports `spikeDetachedGroupKill: grandchild-died (detached honoured)`. Any other value — including `inconclusive`, `skipped`, or `error: <ctor>` — is a halt, not a retry.
result: [pending]

### 2. A6 — a real provider CLI's MCP child sits in the group the kill reaches
source: 08-01-SUMMARY.md D3
expected: During a live Claude turn, `ps -eo pid,ppid,pgid,comm | grep -E 'mcp-server|claude'` shows the `node …mcp-server.mjs` row's **pgid** equal to the `claude` row's **pid**.
result: [pending]

### 3. The LIF-02 defect reproduces on real hardware (pre-fix baseline)
source: 08-01-SUMMARY.md D4
expected: Against the pre-fix build, a cancel leaves a non-zero `pgrep -f mcp-server.mjs | wc -l`. This is the baseline test 9 compares against; without it, a post-fix zero has no control.
result: [pending]

### 4. Stop terminates the CLI *and* its token-bearing MCP child
source: 08-02-SUMMARY.md D5
expected: On a real Caido install (not Node), clicking Stop kills both the provider CLI and its `mcp-server.mjs` child. Mechanism currently proven under Node only.
result: [pending]

### 5. The whole mechanism works on Caido's LLRT, not just the Node CI vehicle
source: 08-03-SUMMARY.md D8
expected: All nine `killTree` sites behave on the runtime users actually run. Inherited from 08-02, not closed by 08-03.
result: [pending]

### 6. win32 — the built argv terminates a live parent AND its grandchild
source: 08-04-SUMMARY.md D1
expected: On a `windows-latest` runner, `kill-tree.win32.test.ts` executes 3/3 (currently collected-but-pending everywhere) and the tree-kill case passes behaviourally.
result: [pending]

### 7. taskkill.exe resolves by absolute path from the runner's system root
source: 08-04-SUMMARY.md D2
expected: The win32 leg confirms absolute-path resolution, with the bare-name fallback asserted when `SystemRoot` is unset. Turns assumption A7 into a measurement.
result: [pending]

### 8. A kill against an already-exited pid is a logged no-op
source: 08-04-SUMMARY.md D3
expected: The reserved block in `kill-tree.win32.test.ts` gets `taskkill`'s exit code and first stderr line recorded. The prohibition half (nothing branches on the value) is already closed statically on every host.
result: [pending]

### 9. A real cancel on macOS leaves zero mcp-server.mjs processes
source: 08-05-SUMMARY.md D6
expected: `pgrep -f mcp-server.mjs | wc -l` is non-zero during a live turn and **zero** ~5s after clicking Stop. Both numbers recorded, not just the second.
result: [pending]
note: Previously satisfied by attestation on 2026-08-24 — `approved` with no numeric values supplied. Re-testing here to convert the attestation into a measurement and to exclude the confounder that the provider CLI may kill its own child.

### 10. The timeout path leaves no orphan either
source: 08-05-SUMMARY.md D7
expected: Let `processTimeoutSeconds` elapse instead of clicking Stop, then `pgrep -f mcp-server.mjs | wc -l` is zero. Must be reported or explicitly declared unexercised — never inferred from the cancel result.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

<!-- APPEND only when a test reports an issue -->
