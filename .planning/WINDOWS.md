---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 5
total_count: 5
last_updated: 2026-08-20T18:09:46.155Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 05 | deviation | packages/backend/src/index.ts |  | writeChatMcpConfig ships as (name, spec, sdk); 05-04's <interfaces> block declares (name, spec) — 05-05 must use the shipped signature | fixed |  | 2026-08-20T13:29:26.568Z | 2026-08-20T13:42:01.336Z |
| 2 | 05 | unmet-truth | .planning/phases/05-kill-shell-wrappers/05-VALIDATION.md | 76 | V-6 expects one surviving spawnAndWait(chmod); correct count after 05-04 is 2, becoming 1 after 05-05. 05-06 to correct. | fixed |  | 2026-08-20T13:29:26.633Z | 2026-08-20T18:09:45.845Z |
| 3 | 05 | deviation | packages/backend/src/index.ts |  | 05-05 task 1 AC referenced a post-05-04 redactDebugText count that 05-04-SUMMARY never recorded; the count mechanically drops 4 to 3 because the same task deletes one of its two call sites. Definition byte-unchanged, both arms present. Owned by 05-06 to reconcile. | fixed |  | 2026-08-20T13:41:48.160Z | 2026-08-20T18:09:45.948Z |
| 4 | 05 | deviation | packages/backend/src/index.ts |  | 05-05 task 1 gates the provider spawn's driftVars on runtimeFiles !== undefined rather than passing runtimeEnv unconditionally as the plan text reads, preserving the pre-conversion behaviour that no Caido token reaches a provider child with MCP detached (D-10). Recorded for 05-06's report. | fixed |  | 2026-08-20T13:41:48.225Z | 2026-08-20T18:09:46.050Z |
| 5 | 05 | unrun-verify | packages/backend/src/index.ts |  | 05-05's entire change set is unproven by any executing test: index.ts is not importable under vitest. The static gates recorded in 05-05-SUMMARY are the whole evidence base (V-21 ceiling). Owned by 05-06's human code review. | fixed |  | 2026-08-20T13:41:48.292Z | 2026-08-20T18:09:46.155Z |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "05",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "writeChatMcpConfig ships as (name, spec, sdk); 05-04's <interfaces> block declares (name, spec) — 05-05 must use the shipped signature",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T13:29:26.568Z",
    "resolved_at": "2026-08-20T13:42:01.336Z"
  },
  {
    "id": 2,
    "kind": "unmet-truth",
    "phase": "05",
    "file": ".planning/phases/05-kill-shell-wrappers/05-VALIDATION.md",
    "line": 76,
    "description": "V-6 expects one surviving spawnAndWait(chmod); correct count after 05-04 is 2, becoming 1 after 05-05. 05-06 to correct.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T13:29:26.633Z",
    "resolved_at": "2026-08-20T18:09:45.845Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "05",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "05-05 task 1 AC referenced a post-05-04 redactDebugText count that 05-04-SUMMARY never recorded; the count mechanically drops 4 to 3 because the same task deletes one of its two call sites. Definition byte-unchanged, both arms present. Owned by 05-06 to reconcile.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T13:41:48.160Z",
    "resolved_at": "2026-08-20T18:09:45.948Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "05",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "05-05 task 1 gates the provider spawn's driftVars on runtimeFiles !== undefined rather than passing runtimeEnv unconditionally as the plan text reads, preserving the pre-conversion behaviour that no Caido token reaches a provider child with MCP detached (D-10). Recorded for 05-06's report.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T13:41:48.225Z",
    "resolved_at": "2026-08-20T18:09:46.050Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "05-05's entire change set is unproven by any executing test: index.ts is not importable under vitest. The static gates recorded in 05-05-SUMMARY are the whole evidence base (V-21 ceiling). Owned by 05-06's human code review.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T13:41:48.292Z",
    "resolved_at": "2026-08-20T18:09:46.155Z"
  }
]
````
