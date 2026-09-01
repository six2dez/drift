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
