# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## cleanup-completion-before-rm — Runtime root removed before process cleanup completed
- **Date:** 2026-09-01
- **Error patterns:** cleanupMcpRuntimeGeneration, recursive removal, provider exit pending, tree-killer close pending, orphan-scan close pending, DRIFT_COMPLETION_ORDER_OBSERVATION requirementSatisfied=false
- **Root cause(s):** cleanupMcpRuntimeGeneration mistook kill/reap invocation order for completion order because killTree and reapMcpOrphans returned void, leaving recursive removal without a happens-before edge from provider exit, tree-killer close, or orphan-reap settlement
- **Fix:** Added a generation-scoped callback completion barrier; provider exit, tree-killer settlement, orphan-scan settlement, and spawned orphan-killer settlement now gate recursive removal, while uncertain outcomes retain the root fail-closed and block replacement start
- **Files changed:** .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts, packages/backend/src/index.ts, packages/backend/src/index.source.test.ts, packages/backend/src/mcp-lifecycle.ts, packages/backend/src/mcp-lifecycle.test.ts
- **Why not caught:** No pre-existing gate exercised the production-wired completion predicate at recursive token-root removal; source-shape tests encoded invocation order instead
- **Recurrence guard:** Regression test `.planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts` — `waits for kill and reap completion before recursive token-root removal`, backed by the MCP cleanup completion barrier unit cases in `packages/backend/src/mcp-lifecycle.test.ts`
---

## codex-untrusted-directory — Codex refuses Caido's non-repository working directory
- **Date:** 2026-09-01
- **Error patterns:** Not inside a trusted directory, --skip-git-repo-check, Codex exits before prompt execution
- **Root cause(s):** `buildCodexLaunchArgs` omitted Codex exec's non-repository override even though Caido launches the provider outside a trusted Git checkout
- **Fix:** Added `--skip-git-repo-check` to the fixed Codex exec argv
- **Files changed:** packages/backend/src/provider-launch.ts, packages/backend/src/provider-launch.test.ts
- **Why not caught:** The existing test snapshotted the incomplete argv and did not state Caido's working-directory contract
- **Recurrence guard:** `provider-launch.test.ts` — `allows Codex to run from Caido's non-repository working directory`
---

## codex-timeout-starvation — Absolute timeout never fires in real Caido
- **Date:** 2026-09-01
- **Error patterns:** processTimeoutSeconds ignored, Process timed out absent, provider survives deadline, TIMEOUT_PROBE_DONE appears after sleep 60
- **Root cause(s):** The absolute deadline existed only in a `setTimeout` callback that Caido can starve while the send RPC awaits the child; the keep-alive-pumped heartbeat did not enforce that deadline
- **Fix:** Added a per-turn absolute deadline to heartbeat and routed heartbeat plus the native timer through one kill-before-finalize expiry function
- **Files changed:** packages/backend/src/index.ts, packages/backend/src/index.source.test.ts
- **Why not caught:** Node executes the native timer normally and the prior source gate asserted only the timer handler's ordering
- **Recurrence guard:** `index.source.test.ts` — `enforces one kill-before-finalize timeout from timer and heartbeat`; real-Caido 10-second measurement preserved in the resolved debug record
---
