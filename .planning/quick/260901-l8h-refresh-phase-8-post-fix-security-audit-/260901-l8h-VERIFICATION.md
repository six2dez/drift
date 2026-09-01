---
phase: quick-260901-l8h
verified: 2026-09-01T13:55:32Z
status: passed
task_1_commit: 24a4046cbb8f14b0ffbf3645d3e50be7b77f7eab
package_head: 415ae7e4704cc23f30dcd9ff959672ed10622ad6
untracked_manifest_match: true
pre_manifest_sha256: 778c901bfb1d8e0267015f4916e46b17785e1c1af5c5ef7b1c29aa0cb68b4ce9
post_manifest_sha256: 778c901bfb1d8e0267015f4916e46b17785e1c1af5c5ef7b1c29aa0cb68b4ce9
manifest_entries: 24
manifest_directories: 8
manifest_regular_files: 16
manifest_symlinks: 0
---

# Quick Task 260901-l8h: Post-Fix Phase 8 Evidence

## Verdict

The post-fix audit is green at package commit
`415ae7e4704cc23f30dcd9ff959672ed10622ad6`. ROADMAP SC-4's session-finalize /
`stopMcpServer` generation-root completion predicate passed three controlled adverse-schedule runs,
and the user separately confirmed the real-Caido Stop/restart workflow. The refreshed security
record retains all 13 accepted residuals and narrows AR-05 to `closeCliSession`, `deleteChat`, and
the startup sweep. Native Windows execution and real-Caido Codex cancel/absolute-timeout causality
remain the only external acquisitions; LIF-01 and LIF-02 remain unchecked.

## Git Package Identity

Commands and fresh results:

```text
$ git rev-list --count d2d502b..415ae7e -- packages/
61
exit 0

$ git log -1 --format=%H 415ae7e -- packages/
415ae7e4704cc23f30dcd9ff959672ed10622ad6
exit 0

$ git rev-parse 415ae7e:packages
8ec7d8d8f47b9406f844c4223b4d04d9171ffaa5
exit 0

$ git ls-tree -r 415ae7e -- packages | shasum -a 256 | awk '{print $1}'
d404134003d4a37b6424ac294a0e640e14d3f602da8c51a7ec60424f8b6f27bd
exit 0

$ git rev-list --count 12a7136d358786b15d377c43ed3ba234cc0004b8..415ae7e4704cc23f30dcd9ff959672ed10622ad6 -- packages/
1
exit 0
```

The audited production delta contains one commit, four changed backend source/test files, 443
insertions, 39 deletions, and no dependency-manifest change:

```text
38  11  packages/backend/src/index.source.test.ts
272 22  packages/backend/src/index.ts
89   3  packages/backend/src/mcp-lifecycle.test.ts
44   3  packages/backend/src/mcp-lifecycle.ts
```

Commit: `415ae7e4704cc23f30dcd9ff959672ed10622ad6 fix: wait for cleanup completion before removing runtime root`.

## Security Classification

The production chain is completion-bearing for the generation root:

1. `cleanupMcpRuntimeGeneration` captures the epoch and exact root, registers `provider:<session>`
   and `tree:<session>` prerequisites for every tracked provider, and adds `orphan-reap`.
2. Provider `exit`/`close` settles the provider prerequisite. Provider `error` fails it closed.
3. The tree helper settles from its terminal callback. Spawn error/throw fails closed. A `close`
   event is treated as settlement regardless of exit code; provider exit and the POSIX orphan-reap
   result are independent prerequisites.
4. The orphan scan treats a complete no-match as safe; bad marker, failed scan, stale gate, refused
   orphan kill, non-zero/error orphan killer, or truncation fails closed.
5. Only barrier disposition `ready` calls recursive `rm`. Failure or the 3 s completion timeout
   retains the root, and replacement Start is refused while cleanup is pending or failed closed.

The validated plan's phrase “non-zero exit retains the root” was broader than the code. It is true
for spawned orphan killers, not for the tree-killer `close` code. The security/verifier prose records
the observed narrower truth and keeps the native-Windows consequence under SC-1/SC-3 and LIF-01.
No production code was changed by this evidence-only task.

The canonical register remains exactly 94 numeric rows plus T-08-SC. The T-08-51…T-08-94 ledger
has 44 rows, and AR-01…AR-13 remain current. No T-08-95 was allocated.

## Completion-Order Oracle

Exact command, run in three fresh Vitest processes:

```bash
pnpm exec vitest run --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts --reporter=verbose
```

Run 1, exit 0:

```text
DRIFT_COMPLETION_ORDER_OBSERVATION={"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":true,"treeKillSpawned":true,"treeKillComplete":true,"reapScanSpawned":true,"reapScanComplete":true,"requirementSatisfied":true}
Test Files  1 passed (1)
Tests  1 passed (1)
Duration  240ms (transform 134ms, setup 0ms, import 31ms, tests 141ms, environment 0ms)
```

Run 2, exit 0:

```text
DRIFT_COMPLETION_ORDER_OBSERVATION={"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":true,"treeKillSpawned":true,"treeKillComplete":true,"reapScanSpawned":true,"reapScanComplete":true,"requirementSatisfied":true}
Test Files  1 passed (1)
Tests  1 passed (1)
Duration  226ms (transform 128ms, setup 0ms, import 31ms, tests 134ms, environment 0ms)
```

Run 3, exit 0:

```text
DRIFT_COMPLETION_ORDER_OBSERVATION={"event":"token_root_remove_started","directSignalIssued":true,"providerExitComplete":true,"treeKillSpawned":true,"treeKillComplete":true,"reapScanSpawned":true,"reapScanComplete":true,"requirementSatisfied":true}
Test Files  1 passed (1)
Tests  1 passed (1)
Duration  232ms (transform 137ms, setup 0ms, import 30ms, tests 143ms, environment 0ms)
```

All seven non-vacuity/completion fields and the final favorable assertion are true in all three
runs. This does not substitute for live-runtime evidence.

## Live-Runtime Provenance

The resolved debug record at
`.planning/debug/resolved/cleanup-completion-before-rm.md` records the human checkpoint at
`2026-09-01T15:08:30+02:00`: the user response was `confirmed fixed` after exercising the original
real-Caido workflow with a live provider turn, MCP Stop, and restart. That verifies the workflow no
longer reproduces. It does not attribute cancel/absolute-timeout teardown on a Drift-spawned Codex
turn, and it is not represented as native Windows evidence.

The same resolved record preserves the scoped revert/reconfirm guardrail: reverting only the fix
made the favorable harness assertion return false and exit 1; restoring the exact fix made it true
and exit 0.

## Fresh Test and Release Gates

### Focused lifecycle suites

```text
$ pnpm exec vitest run packages/backend/src/index.source.test.ts packages/backend/src/mcp-lifecycle.test.ts packages/backend/src/kill-plan.test.ts
packages/backend/src/mcp-lifecycle.test.ts  23 passed
packages/backend/src/index.source.test.ts  82 passed
packages/backend/src/kill-plan.test.ts      115 passed
Test Files  3 passed (3)
Tests       220 passed (220)
Duration    151ms
exit 0
```

### Full suite

```text
$ pnpm exec vitest run
Test Files  42 passed | 2 skipped (44)
Tests       805 passed | 8 skipped (813)
Duration    3.32s
exit 0
```

The eight skips are the two native-Windows files. They remain unexecuted evidence, not passes.

### Typecheck, lint, and package

```text
$ pnpm typecheck
shared: tsc --noEmit — Done
backend: tsc --noEmit — Done
frontend: vue-tsc --noEmit — Done
exit 0

$ pnpm lint
eslint . --max-warnings 0
exit 0

$ pnpm build
backend ESM build success; frontend 387 modules transformed; plugin package ZIP created
exit 0

$ test -f dist/plugin_package.zip
exit 0
ZIP bytes: 2588058
ZIP SHA-256: 7709f5c1f526edd112fe9cca8eb7bf5e902519e2706b7854549c46148db33b06
```

## Verdict and Threat Gates

```text
$ bash .planning/phases/08-process-lifecycle/verdict-gate.sh
ARM A: pass (9 exact current-verdict records)
ARM B: pass (8 A1 carriers, 2 pointers, 8 unchanged A6 carriers)
ARM C: pass (canonical Spike digest; 23 pinned blobs; 23 summaries)
verdict-gate.sh: PASS
exit 0

$ bash .planning/phases/08-process-lifecycle/verdict-gate.sh --self-test
verdict-gate.sh --self-test: PASS
exit 0

$ bash .planning/phases/08-process-lifecycle/threat-register-gate.sh
register_numeric=94 register_sentinel=1
threat-register-gate.sh: PASS packages=98 support=5 register=94+SC
exit 0

$ bash .planning/phases/08-process-lifecycle/threat-register-gate.sh --self-test
threat-register-gate.sh --self-test: PASS
exit 0

$ bash .planning/phases/08-process-lifecycle/threat-register-gate.sh --self-scan
register_numeric=94 register_sentinel=1
threat-register-gate.sh: PASS packages=98 support=5 register=94+SC
exit 0

$ bash .planning/phases/08-process-lifecycle/threat-register-gate.test.sh
threat-register-gate.test.sh: PASS cases=32
exit 0
```

The threat tracer gate was independently rerun after Task 1's commit and produced the same four
green results.

## Artifact Hashes

SHA-256 at the evidence boundary:

| Artifact | SHA-256 |
|---|---|
| `.planning/debug/resolved/cleanup-completion-before-rm.md` | `33b6e4efa412cccac72c4cc15d997ccafcdb8b1e303f2cdab58835f5b022b579` |
| `completion-order.harness.ts` | `415556509b96b65b086276941facad67331349cece8fb09653fc604330eb7539` |
| `vitest.harness.config.ts` | `2a730feb099488b66b8988ba0e12bf161025dc2a4ab190f0c40e3b10e07d1009` |
| `packages/backend/src/index.ts` | `790de9072abb630626cc419888b2e4a5894140072847a3ffc1e54743ad686502` |
| `packages/backend/src/index.source.test.ts` | `1b7e829ae763ef898c58a99ba85be5753fec64873cf90aba5e87d06eea872b39` |
| `packages/backend/src/mcp-lifecycle.ts` | `979b5ec17888160f688dfb8f4cec5bdbe84f3150d4a96517d40bd6ff482d908e` |
| `packages/backend/src/mcp-lifecycle.test.ts` | `52b7cfee7ba71991945af929dd04f811f506eecd97c4cbffe3e548e3666d5d2f` |
| `packages/backend/src/kill-plan.test.ts` | `c338317ff00fd54be9df534ebd0182a8642b45f3ed551e23d89649ce480ff38d` |
| `08-SECURITY.md` | `82bdee305704cf9ddc787d4e618e9ac2a7a7a6aea2a230f5eea59786130ba056` |
| `threat-register-gate.sh` | `56f641cfdda850324f83cf247a34b9c54c8f5742e7ef39d0ee55ce38b560fe0d` |
| `threat-register-gate.test.sh` | `78e76ed9cb089ce32065af704071ee54e949b371453265c058fe264c8a657003` |
| `verdict-gate.sh` | `7b30a7dcf49b3de82261f59740eb6c17349408733d1ff3018a4896c611ab1d6a` |

## Protected Tracked Inputs

The four protected inputs matched their planning pins before any task edit and after both intended
documents were authored:

| Protected input | Expected Git blob | Before | After |
|---|---|---|---|
| `.planning/PROJECT.md` | `3375850f4940dad4914e30ed32860f590286d329` | match | match |
| historical `08-VERIFICATION.md` | `2b9c8991f94934a0fded1dc1134678175135b44c` | match | match |
| `08-VERIFICATION-2.md` | `dc3a9f9a341829c9357a0d05aeb6422a4342c407` | match | match |
| `08-VERIFICATION-3.md` | `1f69cac956256a0809711ba64c7ead0f4fcaa040` | match | match |

`ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, production code, review files, and the independent
threat-register test script were not edited by this executor. The LIF checkbox census is still 2
unchecked entries.

## Canonical Pre-Run Untracked Manifest

The manifest was generated from a fresh NUL-delimited
`git status --porcelain=v1 -z --untracked-files=all` observation. The only exclusions are
`.planning/quick/260901-l8h-refresh-phase-8-post-fix-security-audit-/` and
`.planning/phases/08-process-lifecycle/08-VERIFICATION-4.md`, the intended outputs of this quick
task. Each path uses `lstat` without following symlinks; regular bytes and symlink-target strings
are SHA-256 hashed, and no file bytes or link target are recorded. Ancestor directories are included.

```json
[
  {"path":".gsd","type":"directory","mode":493},
  {"path":".gsd/dispatch-isolation-sentinel.json","type":"regular","mode":420,"sha256":"319a7479b384f87fb0863236d58419ad2230ccf5bccdf3cfce3367d963cc0516"},
  {"path":".planning","type":"directory","mode":493},
  {"path":".planning/milestone.lock","type":"regular","mode":420,"sha256":"6f015560600b7f752f188631849f88aa82556b0cafdcfbd372fe419c95590b9f"},
  {"path":".planning/phases","type":"directory","mode":493},
  {"path":".planning/phases/11-plugin-capability-discovery","type":"directory","mode":493},
  {"path":".planning/phases/11-plugin-capability-discovery/.gitkeep","type":"regular","mode":420,"sha256":"01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"},
  {"path":".planning/phases/12-plugin-call-bridge","type":"directory","mode":493},
  {"path":".planning/phases/12-plugin-call-bridge/.gitkeep","type":"regular","mode":420,"sha256":"01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"},
  {"path":".planning/phases/13-plugin-events-and-bridge-validation","type":"directory","mode":493},
  {"path":".planning/phases/13-plugin-events-and-bridge-validation/.gitkeep","type":"regular","mode":420,"sha256":"01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"},
  {"path":".planning/research","type":"directory","mode":493},
  {"path":".planning/research/.cache","type":"directory","mode":493},
  {"path":".planning/research/.cache/4567051da5417ceacb08306e53afe1afd94001fefba28063be6a2f32f0c03e71.json","type":"regular","mode":420,"sha256":"d5418d85cfdbcb1d518d702bfa9581465187b8fab965ef7527efe2d164b55326"},
  {"path":".planning/research/.cache/4b272eb7645903a3c8380062010d14eca154de9d88e01980eab3f1bafb33f8d1.json","type":"regular","mode":420,"sha256":"6db23fcb6d5d0d1df4331fcaf01b007371c1380e15bec70e602cee11381a1811"},
  {"path":".planning/research/.cache/52cec779c330cf715c98deb175cdb924c7da4749ef580018b9eec693dd300864.json","type":"regular","mode":420,"sha256":"84031cc425b9a565de7b01f4b62dc67e2f7a93b5fe7bed77509af6c12b1c4d9b"},
  {"path":".planning/research/.cache/56e0e2d891764514fe4cb73734d331dd0a64b5afcb98ee437360f988e5ad6833.json","type":"regular","mode":420,"sha256":"4f729a8a5040ec75715a1e36acc052530d7d2324833a229501c5509e85e7155d"},
  {"path":".planning/research/.cache/756a861dc37ffcf83516df661a880afec2f2d8abc2efd85e8fbd21d8f9e9f798.json","type":"regular","mode":420,"sha256":"a4a574d1f05a5466835f2c5f65095d627a7d5979ddaeeda3bd0af999a8f0c63f"},
  {"path":".planning/research/.cache/8c5429b5d42c1302a26e623c1749b11138f21fbc1cc494ba9233d855660abf45.json","type":"regular","mode":420,"sha256":"4aaaa3f50805649a5001416cd6a2519276959629aee8fe870d995ac6c68137e3"},
  {"path":".planning/research/.cache/ae474ce6cb75595a9ff7c24c0a8e7a15af07ff5318af520a8ffd8dbb2a2bab7a.json","type":"regular","mode":420,"sha256":"e39017edc0a07bb66a94bfccf4e8cbdaa3e1e593b1d79ff65b24f0b8f54c70da"},
  {"path":".planning/research/.cache/b3c6fee671862ffe357a7df6fd9ce6080534c8a3e09e6d570b8829a7514aad4e.json","type":"regular","mode":420,"sha256":"a0f550cc2f2ac35db7016d110ff497728a7afe8d7587760bf40884a6373f03c7"},
  {"path":".planning/research/PLUGIN-BRIDGE.md","type":"regular","mode":420,"sha256":"9bf52efd2037ad1c22958c287e240c53c80880c8cae183a80569afa311226067"},
  {"path":".planning/state.json","type":"regular","mode":420,"sha256":"97bd0d4bb08beef19bafebb6db49244cd7e41efff1a6b0446deb3cda9d7c6d8d"},
  {"path":"AGENTS.md","type":"regular","mode":420,"sha256":"cec89e41a5f92bdd349b574bc15c59cbde796b5f9036aae5bccfc73dc1819259"}
]
```

Pre-run manifest summary: 24 entries — 8 directories, 16 regular files, 0 symlinks; SHA-256
`778c901bfb1d8e0267015f4916e46b17785e1c1af5c5ef7b1c29aa0cb68b4ce9`.

## Post-Run Preservation Result

The identical generator was rerun after both intended evidence outputs existed. It again produced
24 entries — 8 directories, 16 regular files, 0 symlinks — with SHA-256
`778c901bfb1d8e0267015f4916e46b17785e1c1af5c5ef7b1c29aa0cb68b4ce9`.
`cmp pre.json post.json` exited 0. The protected Git-blob checks and the two unchecked LIF checkbox
count also exited 0. No pre-existing untracked path, entry type, numeric mode, regular-file bytes,
symlink-target hash, or represented ancestor-directory shape changed.

---
*Evidence captured: 2026-09-01T13:55:32Z*
*No push performed; no secret values or file contents included in the preservation manifest.*
