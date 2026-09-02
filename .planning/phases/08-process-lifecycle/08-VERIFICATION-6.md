---
phase: 08-process-lifecycle
verified: 2026-09-02T06:57:23Z
status: passed
score: 20/20 must-haves verified
behavior_unverified: 0
behavior_unverified_items: []
supersedes_current_conclusions_of:
  - .planning/phases/08-process-lifecycle/08-VERIFICATION.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-2.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-4.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-5.md
package_head: 9aa22bbd4c26fecabc17745438a2217a24b31d3e
security_audit_head: 9aa22bbd4c26fecabc17745438a2217a24b31d3e
actionable_gaps: []
human_evidence_remaining: []
---

# Phase 8: Process Lifecycle — Release-Readiness Verification

**Phase Goal:** Make cancel/timeout actually stop work on both platforms so no orphaned
token-bearing process survives a turn.

**Status:** `passed`

## Verdict

All three remaining evidence acquisitions are complete on the 0.2.0 code candidate
`9aa22bbd4c26fecabc17745438a2217a24b31d3e`:

1. Native Windows CI executed the exact safe kill-tree suite **2 passed / 0 pending / 0 failed**.
   The production argv killed a live parent and grandchild, and the second case resolved the killer
   to the runner's absolute system-root `taskkill.exe`.
2. A bounded real-Caido Codex cancellation and a separate 10-second timeout already established
   product causality: both reached zero provider/MCP processes after the Drift action or deadline,
   before their requested 60-second work could finish.
3. A new, token-free, separately grouped marker fixture forced the shipping argv-marker reap inside
   Caido 0.58.2. Stop recorded `kind=reap exit=0 attempted=1 ageMs=109`; the target died, marker
   matches fell to zero, and the captured runtime root was removed. Three fresh completion-order
   harness processes independently observed provider exit, tree-killer settlement, and reap
   settlement before recursive token-root removal.

Phase 8 therefore advances from `human_needed` 18/20 to **`passed` 20/20**. LIF-01 and LIF-02 are
closed at the requirements actually stated by ROADMAP SC-1/SC-2. LIF-02 is a two-mechanism POSIX
guarantee — process groups for children that stay in-group, marker reap for children that leave —
not the superseded process-group-only sentence. No actionable or human evidence gap remains.

## Delta From 08-VERIFICATION-5

| Item | Previous | Current |
|---|---|---|
| Overall status | `human_needed` | `passed` |
| Score | 18/20 | 20/20 |
| Behavior-unverified truths | 2 | 0 |
| Native Windows lifecycle | unrun | exact 2/2 suite and identity gate passed |
| POSIX mechanism attribution | bounded product causality only | marker-reap arm forced in real Caido |
| Completion-before-removal | harness only | harness plus real-Caido target death/root removal |
| LIF-01 | unchecked | complete |
| LIF-02 | unchecked under stale group-only wording | complete under SC-2's two-mechanism contract |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Current evidence |
|---|---|---|---|
| 1 | SC-1: absolute-path `taskkill` terminates the Windows tree | ✓ VERIFIED | Native run `33599694679`: exact 2/2, including live parent/grandchild death and absolute path measurement. |
| 2 | SC-2: POSIX cancel/timeout leaves no token-bearing orphan | ✓ VERIFIED | Real-Caido Codex cancel/timeout reached zero; the separate marker fixture forced the out-of-group reap arm. |
| 3 | SC-3: cancel/timeout leaves zero owned provider/MCP processes on both platforms | ✓ VERIFIED | POSIX product-causal runs plus native Windows behavioral tree test. |
| 4 | SC-4: teardown prerequisites settle before recursive token-root removal | ✓ VERIFIED | Three fresh harness processes and the real-Caido fixture/root observation agree. |
| 5 | SC-5: existing POSIX-visible behavior and regression gates remain green | ✓ VERIFIED | 810 local passes, eight native skips; typecheck, lint, build, ZIP, verdict and threat gates pass. |
| 6 | Repaired A1 measurement is current | ✓ VERIFIED | Existing exact marked record remains gate-valid; invalid 2026-08-27 reading remains retracted. |
| 7 | A6 is recorded per provider | ✓ VERIFIED | Existing provider split remains explicit; SC-2 does not assume one topology. |
| 8 | Pre-fix Control remains preserved | ✓ VERIFIED | Historical control is unchanged and still prevents attributing the earlier Claude result to group kill alone. |
| 9 | Three-valued liveness defaults inconclusive | ✓ VERIFIED | Existing pure-helper and gate coverage unchanged. |
| 10 | POSIX enumerator is spawnable in real Caido | ✓ VERIFIED | Shipping scan completed and matched the marker fixture. |
| 11 | Reap diagnostics remain bounded scalars | ✓ VERIFIED | Current record exposes only kind, exit, attempted count, and age. |
| 12 | Evidence boundaries have owners or explicit accepted status | ✓ VERIFIED | AR-01…AR-13 remain enumerable; none is hidden by this verdict. |
| 13 | A1 correction gate remains live | ✓ VERIFIED | Live gate and adversarial self-test pass after closure-state changes. |
| 14 | Threat register covers the release candidate | ✓ VERIFIED | Audit rebased to `9aa22bb`; live, self-test, self-scan, and independent 32-case matrix pass. |
| 15 | Invalidated provider-start generations remove retired roots | ✓ VERIFIED | Carried forward; no later package change touches the mechanism. |
| 16 | Token-config ownership survives write/unlink failure | ✓ VERIFIED | Carried forward; no later package change touches the mechanism. |
| 17 | Runtime reuse requires readable regular artifacts | ✓ VERIFIED | Carried forward; no later package change touches the mechanism. |
| 18 | Security audit matches the latest package-changing commit | ✓ VERIFIED | Head/tree/digest are `9aa22bb` / `d90d3e95…` / `d28734fe…`; zero later package commits. |
| 19 | LIF-02 traceability matches the two-mechanism contract | ✓ VERIFIED | Requirements and verdict gate now require the closed marker-reap evidence rather than stale group-only prose. |
| 20 | Windows evidence matches the safe current suite | ✓ VERIFIED | Exactly two native cases executed; the deliberately removed dead-pid vehicle was not restored. |

**Score:** 20/20 truths verified; 0 behavior-unverified; 0 failed.

## Native Windows Evidence

| Property | Observation |
|---|---|
| Workflow | `CI` run `33599694679` |
| URL | https://github.com/six2dez/drift/actions/runs/33599694679 |
| Candidate | `9aa22bbd4c26fecabc17745438a2217a24b31d3e` |
| Windows job | success |
| Full Windows suite | 42 files passed / 2 skipped; **812 passed / 6 skipped** |
| Native lifecycle file | `kill-tree.win32.test.ts`: **2 passed** |
| Behavioral identity | `the plan's argv brings down a real process tree` — passed |
| Path measurement | `C:\Windows\System32\taskkill.exe` |
| Exact gate | “ran both expected tests, including the behavioural process-tree termination case” |
| Build | `drift@0.2.0`; `dist/plugin_package.zip` created |
| Other CI jobs | Node 20, 22, 24, and 26 — all success |

The companion Windows LLRT Primitive Probe run `33599694508` also completed successfully on the
same candidate: https://github.com/six2dez/drift/actions/runs/33599694508.

This is native Windows process-tree evidence, not a claim that a complete Caido/provider workflow
was exercised on Windows. AR-01's exited-intermediate hole and AR-04's foreign-parented Windows
orphan class remain accepted boundaries.

## Real-Caido Marker-Reap Evidence

The locally built `plugin_package.zip` was installed in Caido 0.58.2. The fixture carried the
active session runtime marker in its argv, ran in a separate process group, contained no token, and
had a bounded lifetime. Before the fix, an equivalent run reproduced the defect exactly:
`kind=noop reason=scan-stale exit=0 attempted=0 ageMs=22750`, with the matched fixture still alive.

After commit `92735ec`, Settings Stop pumped cleanup status at 100 ms until a terminal state:

| Event | Observation |
|---|---|
| Fixture topology | detached/separately grouped, marker-matching, token-free |
| Stop action | `2026-09-02T06:33:46.867Z` |
| External after-state | `2026-09-02T06:33:55Z`: fixture dead, runtime dir removed, zero marker matches |
| Caido diagnostic | `kind=reap exit=0 attempted=1 ageMs=109` |
| Session state | `activeSessions: 0` |

The before/after control demonstrates why the frontend pump is causal: the shipping scanner had
already returned exit 0 pre-fix, but its valid result aged beyond the one-second safety budget while
Caido received no later wake-up. The patched 100 ms condition loop delivered the callbacks inside
the bound without weakening stale-pid refusal. The favorable run therefore exercises the shipping
scanner, classifier, marker-scoped killer, completion barrier, and frontend pump in the constrained
runtime.

Caido was restored after the fixture run; Drift MCP was left running with 18/18 tools.

## Completion-Order Evidence

Three fresh harness processes produced the same observation before recursive removal:

```text
directSignalIssued=true
providerExitComplete=true
treeKillSpawned=true
treeKillComplete=true
reapScanSpawned=true
reapScanComplete=true
requirementSatisfied=true
```

Each process passed 1/1. Combined with the real-Caido target-death/root-removal observation, this
closes the requested proof that kill/reap completion precedes deletion of token-bearing runtime
files for the session-finalize / `stopMcpServer` generation-root path. AR-05 continues to record the
separate `closeCliSession`, `deleteChat`, and startup-sweep boundary.

## Fresh Release and Security Gates

| Check | Result |
|---|---|
| Full local Vitest | **PASS — 42 files passed / 2 skipped; 810 passed / 8 native-Windows skips** |
| Typecheck | **PASS — shared, backend, frontend** |
| Lint | **PASS — zero warnings** |
| Production build / ZIP | **PASS — manifest version 0.2.0** |
| Completion harness | **PASS — 3/3 fresh processes** |
| Verdict gate | **PASS — live and adversarial self-test** |
| Threat gate | **PASS — live, self-test, self-scan, independent 32-case matrix** |
| Package audit identity | **PASS — `9aa22bb`, tree `d90d3e95…`, digest `d28734fe…`, 64-commit census, zero later** |
| Code review | **PASS — `08-REVIEW-3.md`, no findings** |
| Native CI | **PASS — Windows plus Node 20/22/24/26** |
| Windows LLRT probe | **PASS** |

## Requirements Coverage

| Requirement | Status | Closure boundary |
|---|---|---|
| LIF-01 | ✓ COMPLETE | Native owned live-tree behavior and absolute killer resolution executed 2/2. AR-01/AR-04 remain accepted. |
| LIF-02 | ✓ COMPLETE | Real-Caido cancel/timeout outcome plus forced out-of-group marker reap and completion-before-removal proof. |

## Release Boundary

Version 0.2.0 and its changelog are prepared. The candidate was pushed only to
`scratch/ci-08-release-readiness-final` to acquire native evidence. `main` has not been pushed and
no release or tag has been created by this verification.

---
*Verified: 2026-09-02T06:57:23Z*
*Verifier: Codex GSD debug continuation; native CI plus installed real-Caido acquisition*
