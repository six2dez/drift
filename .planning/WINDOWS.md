---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 7
total_count: 7
last_updated: 2026-08-21T11:31:37.409Z
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
| 6 | 06 | deviation | packages/backend/src/command-resolution.test.ts | 90 | windows-latest CI leg fails two node-candidate assertions until 06-02 T-06-06 lands: getNodeExecutableCandidates now spells paths through joinPath's temporary POSIX-arm pass-through while the test expectation is host-flavoured path.join. POSIX green; Windows-only, test-expectation mismatch, no runtime break. | fixed |  | 2026-08-21T10:57:32.676Z | 2026-08-21T11:15:49.095Z |
| 7 | 06 | unmet-truth | packages/backend/src/platform.test.ts | 518 | joinPath CMP-01 POSIX byte-identity uses the HOST path module as its oracle, so its 25 assertions are red on the blocking windows-latest leg: joinPath({platform:'linux'}) spells with '/' while path.join on win32 spells with '\\'. MEASURED with a path->path.win32 alias shim (25 failures, all I/O-free and therefore faithful). Plan 06-02 was forbidden from editing the CMP-01 blocks, so this is left open. Fix is one token: use path.posix.join as the oracle, which is byte-identical on POSIX and correct on win32. | fixed |  | 2026-08-21T11:15:49.193Z | 2026-08-21T11:31:37.409Z |

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
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "06",
    "file": "packages/backend/src/command-resolution.test.ts",
    "line": 90,
    "description": "windows-latest CI leg fails two node-candidate assertions until 06-02 T-06-06 lands: getNodeExecutableCandidates now spells paths through joinPath's temporary POSIX-arm pass-through while the test expectation is host-flavoured path.join. POSIX green; Windows-only, test-expectation mismatch, no runtime break.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T10:57:32.676Z",
    "resolved_at": "2026-08-21T11:15:49.095Z"
  },
  {
    "id": 7,
    "kind": "unmet-truth",
    "phase": "06",
    "file": "packages/backend/src/platform.test.ts",
    "line": 518,
    "description": "joinPath CMP-01 POSIX byte-identity uses the HOST path module as its oracle, so its 25 assertions are red on the blocking windows-latest leg: joinPath({platform:'linux'}) spells with '/' while path.join on win32 spells with '\\'. MEASURED with a path->path.win32 alias shim (25 failures, all I/O-free and therefore faithful). Plan 06-02 was forbidden from editing the CMP-01 blocks, so this is left open. Fix is one token: use path.posix.join as the oracle, which is byte-identical on POSIX and correct on win32.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T11:15:49.193Z",
    "resolved_at": "2026-08-21T11:31:37.409Z"
  }
]
````

## Resolution notes

### Entry 7 — closed by plan 06-03 (commit `9effeec`)

Closed by MEASUREMENT, not by inspection. Both properties the fix rests on were checked
independently before the ledger row was flipped:

1. **Byte-identical on POSIX.** All 25 CMP-01 rows were compared directly:
   `path.join(...row) === path.posix.join(...row)` holds for every one (`rows=25 byte-identical=25
   differing=0`). 06-01's CMP-01 evidence therefore keeps its exact value and no expected string in
   the block changed — which is what makes the edit legal despite that plan's "green and unedited"
   prohibition. The prohibition protects the evidence; an oracle change that is provably a no-op on
   POSIX and correct on win32 strengthens it.
2. **Correct on win32.** 06-02's method was reproduced, not taken on trust: the `path` specifier was
   aliased to `path.win32` in a throwaway vitest config. **Before:** 27 failures — 25 of them the
   genuine, I/O-free `joinPath CMP-01 POSIX byte-identity` rows, 2 shim artifacts. **After:** 2,
   i.e. the 25 genuine failures went to 0.

**No discrepancy with 06-02's measurement.** The counts, the file, the describe block and the
characterisation of the 2 residual artifacts all reproduce exactly, on a suite that has grown from
374 to 394 tests since.

The 2 residual failures are **not** Windows defects and are **not** owned by any plan: under the
shim, `path.win32.join` mangles macOS's POSIX `os.tmpdir()` (`/var/folders/…` → `\var\folders\…`)
so `mkdtemp` builds a bogus directory and the real walk finds nothing. On a real Windows host
`os.tmpdir()` is drive-lettered and the mangling cannot occur. They are an artifact of the
measurement vehicle, exactly as 06-02 recorded.

**Hazard note for anyone re-running that measurement:** the mangled `mkdtemp` paths are created
relative to the repository root, so the run litters the working tree with ~80 entries whose *names*
contain literal backslashes. Remove them by explicit prefix match (`\var\folders\`) — never with
`git clean`, which is prohibited in this repo's execution rules.
