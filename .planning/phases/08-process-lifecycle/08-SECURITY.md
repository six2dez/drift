---
phase: 8
slug: process-lifecycle
status: secured
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
# threats_open moved 1 → 0 on 2026-08-24 when T-08-01 closed. The closer was a maintainer
# ATTESTATION, not a recorded measurement — see § "T-08-01 — closed by attestation" for that
# historical closure basis. The 2026-09-01 re-audit adds recorded Codex cancel/timeout evidence
# without rewriting how the threat originally moved to closed.
#
# RE-AUDITED 2026-09-02 after the cleanup-status pump and 0.2.0 release metadata at the latest
# package-changing commit. The main register still has 94 numeric rows plus T-08-SC
# (95 rows total), including the complete T-08-51…T-08-94 roll-up. Closure comes from current
# source/tests, executable gates, native Windows CI, and bounded real-Caido measurements; PLAN/SUMMARY
# prose is used only to locate an allocated mechanism. Thirteen accepted residuals remain explicit,
# while LIF-01/LIF-02 are closed at the two-mechanism contract stated in ROADMAP SC-2.
#
# Among those thirteen, T-08-47 is an ACCEPTED `high` under `block_on: high`. It does not count toward
# threats_open — an accepted residual is closed-with-a-decision, not open — but it is called out
# HERE rather than left to be inferred from a zero, because a `high` accepted silently past the
# phase's own blocking gate is exactly the failure this comment exists to prevent. It carries a
# NAMED DECIDER, not merely an owner: AR-06, "six2dez (recorded decision GD-02)".
threats_open_note: "0 open; 1 accepted high (T-08-47 / AR-06, decider six2dez per GD-02)"
asvs_level: 1
block_on: high
created: 2026-08-24
audited_at_head: 9aa22bbd4c26fecabc17745438a2217a24b31d3e
package_tree_at_audit: d90d3e9552d11533f91d35122bcb89f1032b0376
package_tree_sha256_at_audit: d28734feecddd8fd381fbfe0f4fbb95d79b22549a0a1d0de20803e66f6ad16e2
former_baseline_package_commits: 64
package_commits_after_audit: 0
register_numeric_rows: 94
register_sentinel_rows: 1
accepted_residuals: 13
register_authored_at_plan_time: true
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time across five `<threat_model>` blocks (21 distinct rows) and
> rolled up here by plan 08-05 T-08-13. Severity and disposition are as authored at plan time;
> the Status column is set from the four plan SUMMARYs.

---

## What this phase changed about credential exposure

Stated first because it is the phase's defining security fact.

**Before Phase 8, cancelling a turn did not withdraw the agent's capability.** The cancel path
issued a single-pid `SIGTERM` → `SIGKILL` ladder against the provider CLI and left the CLI's
`mcp-server.mjs` child to the CLI's own cleanup. That child holds `CAIDO_TOKEN` in its environment
block — a **bearer** credential with the full authority of the logged-in Caido user. An orphan
retains everything Drift's ~18 tools can do: `search_history` over the user's entire proxy traffic
including credentials captured in flight, `send_request` replay against live targets from the user's
own machine and IP, `create_finding`, environment reads. The tool policy is delivered by environment
variable at spawn, so **a policy tightened after the orphan spawned does not apply to it** — the
orphan runs forever under the policy in force when it started.

**And the ordering made it worse in one specific way.** `cleanupMcpRuntime`, `closeCliSession` and
`deleteChat` each removed files that carried the token into a child's environment while termination
could still be in flight. Deleting a token-bearing file is **not revocation**: the token is in the
process's memory, not in the file it arrived through. Commit `415ae7e` now protects the
session-finalize / `stopMcpServer` generation-root path: provider exit, tree-killer settlement, and
the generation-scoped orphan reap all settle a callback barrier before recursive root removal can
begin. `closeCliSession`, `deleteChat`, and the startup sweep remain outside that barrier; their
accepted completion-order boundary is recorded precisely in AR-05 below.

| Property | Before Phase 8 | After Phase 8 |
|---|---|---|
| POSIX cancel reach | the provider CLI process only | the provider CLI's **whole process group** — `detached: true` at the spawn plus a spawned `kill -TERM -- -<pid>`, then `-KILL` |
| Windows cancel reach | the provider process only | the whole tree — `<SystemRoot>\System32\taskkill.exe /pid <n> /t /f`, resolved by absolute path |
| Termination sites routed through one builder | 0 | **8** call sites, all through `killTree` → `buildKillTreePlan` |
| `cleanupMcpRuntime` | killed nothing | force-kills every `activeProcesses` entry **before** the sweep |
| Session-finalize / `stopMcpServer` generation-root ordering | removal could overtake provider/tree/reap completion | recursive removal is callback-barrier-authorized only after provider exit, tree-killer settlement, and orphan-reap settlement |
| Other per-session/startup removals | removal could overtake kill/reap completion | statement order remains enforced; completion order remains accepted as AR-05 for `closeCliSession`, `deleteChat`, and `sweepOrphanedMcpTempDirs` |
| pid validation | at the call site, or nowhere | inside the pure module (`Number.isInteger` + `> 0`), with an explicit refusal arm carrying no argv |

**What did NOT change: real revocation is still unavailable.** Killing the process removes the
capability *from that process*. The token itself stays valid until the user's Caido session ends.
See **AR-03**.

---

## Trust Boundaries

Rolled up from the five plan blocks.

| Boundary | Description | Data crossing |
|----------|-------------|---------------|
| user cancel (consent withdrawal) → live agent process | Cancellation **is** a consent-withdrawal action. A mechanism that leaves the agent running defeats it. This is the phase's ASVS V3 anchor. | the withdrawal itself — and, if it fails, continued proxy/replay authority |
| Caido backend (LLRT) → OS process table | Drift renders a pid, typed `number \| undefined`, into an argv that terminates processes | a pid, a signal, a process-group operand |
| live MCP child ↔ its env-source files on disk | The MCP server polls `DRIFT_APPROVALS_FILE` synchronously before every sensitive tool. Removing it while the process lives destroys evidence without removing capability | approval decisions, activity records, MCP context |
| `%SystemRoot%` / `%PATH%` → the killer binary | The environment selects which executable receives the termination argv | the argv, and by extension the authority to kill |
| deferred timer callback → OS process table | A 3000 ms-later kill acts on a pid whose owner may have changed | a possibly-reassigned pid |
| `stopMcpServer` / `startMcpServer` failure path → `cleanupMcpRuntime` | Both reach the same teardown; a fix at the Stop button only would leave the failure path exposed | tracked pids, the temp root |
| backend → `sdk.console` / session log / support bundle | Lifecycle diagnostics leave the machine in bug reports | pid, exit code, platform — and nothing else, by design |
| CI evidence → the phase's LIF-01 claim | Windows is the one platform in this milestone the maintainer cannot check by hand. Whatever the runner reports is the entire basis for the claim | the win32 mechanism's evidence |
| the phase's artifacts → the next reader | A criterion naming an unusable mechanism is a standing instruction to reintroduce a defect. Documentation is a control here, not decoration | ROADMAP SC-2, the validation contract, the generated conventions block |

---

## Threat Register

**95 distinct rows: 94 numeric rows plus T-08-SC.** (`(NN)` names the plan(s) the row was authored
in.) Severity and disposition remain as authored at plan time, except where a row records an
explicit re-rating with its reason.

**Re-audited 2026-09-02 at `9aa22bbd4c26fecabc17745438a2217a24b31d3e`.** The canonical
through-94 register plus T-08-SC is unchanged. The cleanup-status pump closes an already allocated
T-08-01/T-08-12/T-08-13 callback-starvation boundary: it publishes a closed cleanup-state union,
polls at 100 ms, stops on terminal state, and remains bounded by the existing initialization timeout.
It adds no dynamic command input, process authority, token flow, dependency, or free-form diagnostic,
so it does not create T-08-95. The 0.2.0 commit changes only release metadata and the MCP server's
reported version. The package tree at the audit boundary is Git tree
`d90d3e9552d11533f91d35122bcb89f1032b0376` (SHA-256 census
`d28734feecddd8fd381fbfe0f4fbb95d79b22549a0a1d0de20803e66f6ad16e2`), with 64
package-changing commits after former baseline `d2d502b`, two after the prior `174c0b6` audit, and
zero after the current package boundary. The standing gate recomputes the latest package-changing
commit, tree, digest, and post-audit commit count rather than trusting these fields.
Identifiers, categories, severities, and dispositions are transcribed from the allocating plan;
current source/tests/gates determine closure. **T-08-03 remains RE-RATED** in place, from medium to
high, with its original reason intact.

| Threat ID | Category | Component | Sev | Disposition | Mitigation (verified) | Status |
|---|---|---|---|---|---|---|
| **T-08-01** (02/03/05) | InfoDisc → EoP | the orphaned `mcp-server.mjs` child holding `CAIDO_TOKEN` after a cancel | **high** | mitigate | `detached: true` on the provider spawn + the group-kill spawn in `killTree`, wired at all 8 in-scope sites; proven behaviourally by `kill-tree.posix.test.ts`'s control-plus-proof pair (the control asserts the grandchild **surviving** without the mechanism, and was verified falsifiable by hand) | **closed by attestation** — see note below |
| **T-08-02** (02/04) | Tampering / EoP | the pid rendered into the killer's argv | medium | mitigate | `buildKillTreePlan` owns both the guard (`Number.isInteger` && `> 0`) and the rendering; `index.ts` passes `proc.pid` through untouched and switches on `plan.kind`. 5 bad-pid inputs asserted (`undefined`, `NaN`, `0`, `-1`, `1.5`). Every argv in the win32 suite comes from the production builder — `grep -c '"/pid"'` in that file = **0** | closed |
| **T-08-03** (02/04/**08**) | Spoofing / EoP | resolution of `taskkill.exe` | **high** *(RE-RATED 2026-08-27 from medium)* | mitigate | **Why re-rated:** the empty-environment condition is **measured, not hypothetical** — a real macOS install reports `parentEnvKeyCount: 0`, and the same four readings show the sandbox withholds `kill`, `version` and `versions` too, which is a *policy* and very unlikely to differ on Windows. `buildKillTreePlan`'s win32 arm reads `SystemRoot`/`SYSTEMROOT` from that same empty shim, so the bare-name arm was the **expected** Windows path rather than a remote contingency, silently, while staying green in CI where Node populates `process.env`. **Mitigation shipped by plan 08-08:** a **derived system root** — `deriveWindowsSystemRoot` takes the drive letter from the cached `os.tmpdir()`, which is not the parent environment — inserted as a middle rung between the environment read and the bare name, via one `resolveWindowsSystemBinary` ladder applied **identically to the command interpreter (`selectComspec`, T-08-33) and the path-search binary (`getWhichCommand`, T-08-34)**. The bare name is KEPT as the last resort and stays tested: G-01 did not find the constant wrong, it found that an empty environment reached it first. `systemRootFallback` is a **required** input member, so the compiler forces every production call site to answer. Never `shell: true` | closed (unit + derived rung + native A7); CI run 33599694679 measured `C:\Windows\System32\taskkill.exe` |
| **T-08-04** (02/03) | DoS | the deferred rungs in `cancelCliMessage` and `requestGracefulShutdown` | medium | mitigate | A **handle-identity** check FIRST at both rungs — `hasTrackedProcessExited` (`kill-plan.ts`), a pure decision over the handle's own `exit` event plus Node's `exitCode`/`signalCode` — then the `isPidAlive` liveness probe, then the kill. Identity discriminates a reassigned pid; liveness does not. Gated in two places: 6 literal-input cases in `kill-plan.test.ts` including the LLRT no-exit-state arm, and positional/census assertions in `index.source.test.ts` (2 call sites, both before `isPidAlive`, both fed the handle's own flag; the inline `proc.exitCode !==` spelling banned outright). The guards run **before** the debug-log line, so the log cannot claim a signal that was never sent. On Windows the argv is `/t /f`, so acting on a reassigned pid would take an unrelated process's entire tree | closed — **corrected 2026-08-24, see § *T-08-04 — the correction***; **and see the 2026-08-27 note below: on Caido the guard runs on handle IDENTITY ALONE**, because the sandbox exposes no kill primitive so the liveness probe cannot run. Documented in advance at `index.ts:5319-5331`, accepted residual stated at the same site. Strictly subtractive either way — see § *G-02 — recorded, not fixed* |
| **T-08-05** (01/02) | InfoDisc | `killTree`'s and the spike's log lines | medium | mitigate | Value-free by construction: plan `kind`/`reason`, exit code, platform. The `error` handler renders the errno **`code`**, never `error.message` — a Node spawn error message embeds the resolved file path. Follows `formatMcpRemoveFailure`'s "three scalars" precedent | closed |
| **T-08-06** (01/02/05) | Repudiation (a security control that fails green) | the group-signalling spelling, and ROADMAP SC-2's unamended mechanism clause | **high** | mitigate | Two halves. **Code:** the comment-stripped static gate in `index.source.test.ts` over `index.ts` **and** `kill-plan.ts`, with a positive companion so it cannot pass by the mechanism having been deleted; verified falsifiable in three directions. The banned form passes on all five CI legs and throws only under Caido's LLRT, so no executed test can catch it. **Intent:** T-08-12 amended SC-2 in place with the shipped mechanism, the source-verified `Underflow` reason and the pinned commit `a5b021c`. The gate stops the code; the amendment stops the intent | closed |
| **T-08-07** (04/05) | InfoDisc | `/T`'s dead-intermediate-parent hole on the three-level `.cmd` shape | low | **accept** | Not mitigable without a Windows Job Object — see **AR-01** | closed (accepted) |
| **T-08-08** (05) | InfoDisc | a hard-killed Caido's surviving MCP orphan (OQ-3) | medium | **accept** | Deliberately out of scope; recorded as a residual, not planned as a task — see **AR-02** | closed (accepted) |
| **T-08-09** (01) | DoS | the spike's fixture parent + grandchild | low | mitigate | Both fixtures self-exit after 30 s and both captured pids are signalled individually on every path including the inconclusive and error arms. Moot in the shipped tree: the probe was removed at `d8ccab8` | closed |
| **T-08-10** (01) | Tampering | temporary diagnostics code surviving into the shipped tree | medium | mitigate | Two ASCII marker lines fenced the section; T-08-03's criteria greped **0** occurrences of every temporary symbol (`runLifecycleSpike`, `SPIKE_*`, `spike*`, `SpawnDetached`) and a 4-insertion net diff. `index.ts` is byte-equivalent to pre-spike apart from a 3-line breadcrumb | closed |
| **T-08-11** (02) | DoS | `detached: true` reaching Drift-owned leaf spawns | medium | mitigate | `detached` is a **required** member of `SpawnWithEnv`, so the compiler forces all three call sites to state an answer; a source assertion pins that exactly one says `true`. A leaf spawn that escaped Drift's group would survive Drift's own exit | closed |
| **T-08-12** (03) | InfoDisc → EoP | the `startMcpServer` failure path reaching `cleanupMcpRuntime` | **high** | mitigate | The kill loop lives in `cleanupMcpRuntimeGeneration` rather than only at the Stop button, so all twelve callers retain the same teardown. Commit `415ae7e` adds a generation-scoped callback barrier on this path: observed provider exit, tree-killer settlement, and orphan-reap settlement are all prerequisites; only `ready` reaches recursive root removal, while failed or timed-out completion retains the root and blocks replacement Start. Tree-killer `close` is settlement regardless of exit code by design; provider exit and the POSIX orphan-reap result remain independent prerequisites. `closeCliSession`, `deleteChat`, and the startup sweep are not covered by this barrier and remain AR-05 | closed — **corrected 2026-08-24; narrowed 2026-09-01** |
| **T-08-13** (03) | DoS | an awaited kill inside teardown | medium | mitigate | The initiating RPC still awaits no child callback: `killTree` remains callback-based and `grep -c 'await killTree'` = **0**. Commit `415ae7e` replaces the unsafe immediate `rm` with a non-starving state transition: Stop yields after issuance, terminal callbacks advance the barrier, and only its `ready` disposition starts removal. Error, stale-reap, orphan-killer failure, or the 3 s completion timeout fail closed and retain the root; Start reports the retained-generation error instead of replacing it | closed — **completion barrier audited 2026-09-01** |
| **T-08-14** (03) | Repudiation | a silently-deleted `LIF-01` marker — either of the two Phase 7 left | low | mitigate | Both seams resolved, neither deleted. Measured: `LIF-01 SEAM` = **0** (baseline 2), `NOT acted on` = **0** (baseline 2), `LIF-01` = **8** (floor 5), `ParentProcessId` = **1**, `AR-01` = **1** (both baseline 0). A deletion without a resolution fails the floor; a resolution without the mechanism named fails the two literals | closed |
| **T-08-15** (04) | Repudiation (false-green evidence) | the `windows-latest` leg | **high** | mitigate | The `--reporter=json` gate pins `pending === 0`, `total === expectedTotal === 2`, `passed === 2`, and the behavioral test identity. Its every-platform source test keeps the step and native file coupled. CI run `33599694679` on candidate `9aa22bb` then executed the gate for real: both expected cases passed, including live process-tree termination | closed (control proven falsifiable and fired on native Windows) |
| **T-08-16** (04/23) | DoS | branching on an undocumented vendor exit code or signalling a recycled pid to measure it | medium | mitigate | D-P4b remains record-never-branch. The safe current suite has exactly two native cases: real-tree teardown and absolute `taskkill.exe` resolution; CI pins total 2 and the behavioral full name. Commit `e1ac837` removed the former already-exited/dead-pid exit-code and stderr probe because its numeric pid could be recycled to an unrelated process. No assertion or branch consumes the behavioral call's result. The missing exit-code/stderr datum is explicitly deferred until an owned-live-process design can measure it safely | closed (safe two-case contract + native 2/2 execution; dead-pid datum intentionally deferred) |
| **T-08-17** (04) | DoS | leaked fixture processes on a shared runner | low | mitigate | Every fixture idles for a bounded 20 s and self-exits; `tempDirs` removed in `afterEach`; stray pids force-killed there too; every case carries the shared 15 s `SPAWN_TIMEOUT_MS` | closed |
| **T-08-18** (05) | Repudiation | a documentation row added only to `CLAUDE.md` | low | mitigate | T-08-12 edited **both** `CLAUDE.md` and its generation source `.planning/codebase/CONVENTIONS.md`; `grep -c 'kill-plan.ts'` = 1 in each is an acceptance criterion. A row added only to the rendered copy is silently reverted on the next regeneration | closed |
| **T-08-19** (05) | Repudiation | a `{pending}` validation row silently overwritten with a wrong seed | medium | mitigate | Four seed corrections recorded as **corrections** in a named section (`08-VALIDATION.md` § *Corrections to the seed*), per the `07-VALIDATION.md` convention. `nyquist_compliant` is set from the actual row statuses, so a `validated` document with unmet rows is distinguishable from a compliant one | closed |
| **T-08-20** (05) | InfoDisc | no real revocation available | medium | **accept** | Killing the process removes the capability from that process; invalidating the credential would require rotating the Caido session token, which Drift cannot do — see **AR-03** | closed (accepted) |
| **T-08-21** (06) | DoS | `buildSessionOrphanScanPlan` pattern construction | **high** | mitigate | Two anchors plus adjacency — the session-unique `drift-mcp-<8..64 hex>` directory name AND `mcp-server\.mjs` — with the marker shape validated (hand-rolled char test, no RegExp) **before** any pattern is composed, and **no looser fallback arm**. That refusal IS the blast-radius guard | closed (08-06) |
| **T-08-22** (06) | Tampering | regular-expression injection through the marker | **high** | mitigate | The marker is generated by `genShortToken` (20 lowercase hex) and re-validated at the pure builder against `[0-9a-f]{8,64}` before it reaches the enumerator; no metacharacter can survive that validation | closed (08-06) |
| **T-08-23** (06) | EoP | the pid list returned by the enumerator | medium | mitigate | `parseOrphanScanPids` accepts integers strictly greater than 1 only — `0` is a group reference and `1` is init — and `buildOrphanKillPlan` emits a **POSITIVE single pid**, never a group operand, because A6 is measured FALSE | closed (08-06); **AMENDED 2026-08-27 (review WR-03) — see § *T-08-23 / T-08-24 — the window between enumeration and signal*.** The row covered the **values** the parser accepts and not the **interval** between `pgrep` sampling the table and `kill` being spawned; that interval is now bounded on the wall clock (`scan-stale`), with the residual inside the bound accepted as **AR-09** |
| **T-08-24** (06) | DoS | enumerator unavailable, hung or truncated | medium | mitigate | Bounded stdout, a `setTimeout` bound with a settled flag copied from `resolveCommand`, and four explicit unavailable-enumeration arms in `classifyOrphanScanOutcome` — a pure function an assertion can reach | closed (08-06); **CORRECTED 2026-08-27 (review WR-03): FIVE arms, not four.** `scan-stale` was added so the scan's age bound holds on a starved event loop where the `setTimeout` did not get to fire first. The count above is left as written — it was correct on its date — and the correction travels here and at `classifyOrphanScanOutcome`'s own docblock |
| **T-08-25** (06) | InfoDisc | the reaper's log line | low | mitigate | Scalars only — plan kind, exit code, count of pids signalled. No path, no argv, no environment value, no pid. Same rendering rule as `killTree` (T-04-04) | closed (08-06) |
| **T-08-26** (06) | Repudiation | win32 has no enumerator | medium | **accept** | `taskkill /t` walks `ParentProcessId` and is indifferent to process groups, so A6 was never a Windows question and LIF-01's mechanism is unaffected. What Windows does not get is the G-04 foreign-parented orphan class — see **AR-04** | closed (accepted) |
| **T-08-27** (07) | DoS | the idle reap terminating a **live** session's MCP child | **high** | mitigate | `shouldReapSessionOrphans` opens only on a pair of exact zeros (`activeProcesses.size` and `mcpDirectCallDepth`), unit-asserted from literals; a negative count or a non-integer on either scalar refuses | closed (08-07) |
| **T-08-28** (07) | DoS | the idle reap terminating Drift's own MCP self-test | medium | mitigate | A depth **counter**, not a pid exclusion list — a stale pid in a list would shield a genuine orphan that reused the number, while a counter that fails to release SUPPRESSES the reap instead. Released from `close` and `error`, above the settled guard | closed (08-07) |
| **T-08-29** (07) | EoP | the class-wide previous-run scan firing while a session is live | **high** | mitigate | `buildPreviousRunOrphanScanPlan` refuses with `session-active` whenever a session directory name is supplied, so moving the call below the `mcpTempDir` assignment stops the scan rather than pointing it at the live session's child | closed (08-07) |
| **T-08-30** (07) | InfoDisc | a previous-run orphan holding a live `CAIDO_TOKEN` indefinitely | **high** | mitigate | The start-up reap terminates it, and terminates it **above every `rm`**, so the env-source documents naming it are not destroyed before the process that read them dies. This is **AR-02's** measured case, closed | closed (08-07) |
| **T-08-31** (07) | Repudiation | `cancelCliMessage` becoming async to accommodate the reap | medium | mitigate | `reapSessionOrphansIfIdle` returns `void` and awaits nothing; the exact declaration string is asserted and `await reapSessionOrphansIfIdle` is gated at `0`. OQ-4 holds by construction | closed (08-07) |
| **T-08-32** (07) | DoS | one enumerator spawn per completed turn | low | **accept** | Bounded by `ORPHAN_SCAN_TIMEOUT_MS`, fire-and-forget, refused entirely on win32 so UX-04's console-window count is unaffected. The price of covering the normal-exit orphan, which is as real as the cancel orphan | closed (accepted) |
| **T-08-33** (08) | Spoofing / EoP | resolution of `cmd.exe` via `selectComspec` | **high** | mitigate | The same derived-root rung as T-08-03. **Highest severity of the three** because this is the spawn that carries a live `CAIDO_TOKEN`; Phase 7's CR-01 absolute-interpreter mitigation was **inert on every real install** for exactly the empty-environment reason, and now runs. `selectComspec` passes an EMPTIED env to the ladder: its variable is `COMSPEC`, not a system root | closed (08-08) |
| **T-08-34** (08) | Spoofing / EoP | resolution of `where.exe` via `getWhichCommand` | medium | mitigate | The same derived-root rung, reached from `resolveCommand` on every provider status check | closed (08-08) |
| **T-08-35** (08) | DoS | a derived root pointing at the wrong drive | low | **accept** | `TEMP` redirected across drives yields a wrong absolute path and a **loud** file-not-found spawn failure a diagnostics report shows — the stated asymmetry: a wrong absolute path fails loudly, a bare name resolves silently | closed (accepted) |
| **T-08-36** (08) | Repudiation | a security-relevant parameter no call site passes (CR-01's failure shape) | **high** | mitigate | `systemRootFallback` is a **REQUIRED** input member on all three consumers, so the compiler forces every production call site to state an answer rather than inheriting a default nobody chose | closed (08-08) |
| **T-08-37** (08) | InfoDisc | rendering the derived root in a log or diagnostics line | medium | mitigate | Never logged. A derived system path is an environment-derived value and falls under the T-04-04 rendering rule | closed (08-08) |
| **T-08-38** (09) | Tampering → EoP | staged `mcp-server.mjs` at `0644` | **high** | mitigate | Explicit owner-only mode at the staging write, no execute bit. **This site, not the filed one, was the severe case:** the staged copy is what `node` executes with `CAIDO_TOKEN` in its environment. G-05 was filed against the least severe of five | closed (09) |
| **T-08-39** (09) | Tampering → EoP | `mcp-approvals-<id>.json` at `0644` | **high** | mitigate | Explicit owner-only mode at both the create and the rewrite. A locally-writable approvals file is a pre-approval channel for a sensitive MCP tool | closed (09) |
| **T-08-40** (09) | InfoDisc | `mcp-activity-<id>.jsonl` at `0644` | medium | mitigate | Explicit owner-only mode. The file carries tool activity drawn from the user's Caido history | closed (09) |
| **T-08-41** (09) | InfoDisc | `mcp-context.json` at `0644` | medium | mitigate | Explicit owner-only mode — the site UAT gap **G-05** was filed against | closed (09) |
| **T-08-42** (09) | Repudiation | a future temp write shipping without a mode | medium | mitigate | A `writeFile` mode census with a **named single exemption asserted positively** (the plugin-data write outside the temp root), plus a paren-balanced execute-bit scan where a line-oriented grep is structurally blind — the blindness measured on a violating tree rather than argued | closed (09) |
| **T-08-43** (09) | InfoDisc | POSIX modes ignored on Windows | low | **accept** | `os.tmpdir()` on Windows resolves beneath the user's profile, a directory Windows already ACLs to that user. Recorded at the source as the accepted trade-off and mirrored here as **AR-08** so the register is the single place a reader can enumerate residuals | closed (accepted) |
| **T-08-44** (10) | Repudiation | a stale verdict surviving in a document a later phase reads | **high** | mitigate | `verdict-gate.sh` — a **repo-wide, exclusion-list, fail-closed** scan of `.planning/` and `packages/`, block-quote-stripped in both the markdown `> ` and source `// > ` dialects so a preserved superseded quote cannot satisfy it and a re-introduced active claim cannot hide in one, matching all **three** spellings of the stale verdict. Committed, so it is re-runnable rather than a one-time check. Proven red four ways | closed (10) |
| **T-08-45** (10) | Repudiation | an unrunnable command surviving as an instruction | medium | mitigate | Corrected in the two living-reference documents and gated at `0`; annotated in the two executed plans and gated at a minimum annotation count, so the audit trail survives while no follower can be misled | closed (10) |
| **T-08-46** (10) | Repudiation | a requirement ticked complete without execution behind it | **high** | mitigate | Both LIF boxes unticked with dated qualifiers naming exactly what has no execution, gated by a negative grep on the ticked form; both status rows point at `08-VERIFICATION.md` | closed (10) |
| **T-08-47** (10) | InfoDisc | a token-bearing MCP registration Drift cannot withdraw | **high** | **accept** | **AR-06.** Explicitly out of scope per **recorded decision GD-02**; recorded with the Gemini exit-127 `mcp remove` failures as its live instance and pointed at a registration-focused phase entered through a discussion. The user-facing remediation is recorded alongside it. **An accepted `high` under `block_on: high` — see AR-06's `Accepted By` cell, which names the decider, not merely an owner** | closed (accepted) |
| **T-08-48** (10) | Repudiation | the two `WINDOWS.md` representations diverging | medium | mitigate | Both edited together, the JSON block re-parsed, and the two descriptions **diffed and the comparison reported** rather than assumed | closed (10) |
| **T-08-49** (10) | Repudiation | fabricating the Control reading to complete a table | **high** | mitigate | Prohibited in plan frontmatter and asserted in acceptance criteria: `08-SPIKE.md` § *Control* still records that no reading was taken, because `08-UAT.md` test 3 is still `[pending]`. A fabricated confirmation is the precise failure the spike existed to prevent | closed (10) |
| **T-08-50** (07) | DoS (a security control that does not reach) | multi-session cancel: the idle gate suppresses the reap while another session is live | medium | **accept** | The uncovered case, stated as the gap it is. See **AR-07** — bounded by the fact that the reap DOES fire at the last close, so the window is the multi-session period rather than indefinite. Inverse of T-08-27; both directions are now on the register | closed (accepted) |
| **T-08-51** (11) | Tampering | `verdict-gate.sh` ARM A pattern | **high** | mitigate | Current `verdict-gate.sh` retains the measured spelling set, fail-closed exclusions, and positive retraction requirement; its self-test keeps stale, missing, and excluded-carrier controls red | closed (gate self-test + ARM A) |
| **T-08-52** (11) | Repudiation | `08-SPIKE.md` A1 correction | medium | mitigate | The exact `DRIFT:A1-CORRECTION` record preserves the retraction and current repaired-probe result as one marked correction; ARM B validates the live pointer while the pinned Spike digest prevents historical rewriting | closed (current marker + ARM B) |
| **T-08-53** (11) | Tampering | dated `*-SUMMARY.md` class | medium | mitigate | ARM C pins committed summary blobs, rejects working-tree mutation, and requires every dated Phase 08 summary to be either pinned or explicitly not yet generated | closed (ARM C) |
| **T-08-54** (11) | Information disclosure | gate output | low | **accept** | Gate diagnostics are intentionally bounded to record labels, relative repository paths, and counts. The remaining disclosure of repository-relative names is explicit in **AR-10** | closed (accepted; AR-10) |
| **T-08-55** (12) | Spoofing | `buildLivenessProbePlan` bare-name enumerator | medium | mitigate | Current `kill-plan.ts` keeps the diagnostic-only scope and `classifyLivenessObservation` requires the requested pid row; `kill-plan.test.ts` covers absent, unrelated, and malformed output as inconclusive | closed (source + kill-plan suite) |
| **T-08-56** (16) | Tampering | the recording of a hardware measurement | **high** | mitigate | The blocking-human measurement record preserves verbatim readings and abstentions; the current A1 marker records only the repaired three-valued result while retaining the invalid reading as retracted history | closed (record-integrity control; no causal upgrade) |
| **T-08-57** (12) | Tampering | `classifyLivenessObservation` | **high** | mitigate | The production classifier has an explicit closed result union and the executed totality/red-input cases reject defaults, missing adjacency, and ordering shortcuts | closed (kill-plan suite) |
| **T-08-58** (12) | Repudiation | source-comment marked corrections | medium | mitigate | Current source comments retain the dated superseded wording beside the corrected classifier contract; structural tests pin the correction markers and reason vocabulary | closed (source + source-structure suite) |
| **T-08-59** (12) | Information disclosure | `formatSpikeVerdict` output | low | **accept** | `formatSpikeVerdict` renders only a state and closed-union reason token. The bounded diagnostic disclosure is explicit in **AR-11** | closed (accepted; AR-11) |
| **T-08-60** (13) | Tampering | ROADMAP SC-2 amendment | **high** | mitigate | ROADMAP SC-2 keeps the group mechanism and adds the stricter argv-adjacency, bounded-enumerator, and idle-gate boundaries; the amendment remains a harder current criterion rather than a relaxed retrofit | closed (current ROADMAP criterion) |
| **T-08-61** (13) | Repudiation | superseded amendment text | medium | mitigate | The dated amendment and its earlier independent note remain preserved as explicit supersessions rather than overwritten prose | closed (current ROADMAP history) |
| **T-08-62** (13) | Denial of service | requirement ownership | medium | mitigate | REQUIREMENTS and the authoritative verification record still state that no later phase owns the remaining A1/LIF evidence; both LIF boxes remain unticked | closed (current requirement/verification records) |
| **T-08-63** (14) | Tampering | `.planning/WINDOWS.md` dual representation | **high** | mitigate | The table and JSON representations retain the same entry-11 correction history and are parsed together by the GSD windows tooling | closed (dual-representation parse) |
| **T-08-64** (14) | Tampering | `08-SECURITY.md` register and residuals | **high** | mitigate | The canonical seven-column table is now mechanically parsed by `threat-register-gate.sh`; range, uniqueness, sentinel, and live-citation joins all fail closed | closed (citation gate) |
| **T-08-65** (14) | Repudiation | ledger entry 11's two supersessions | medium | mitigate | Both the 2026-08-24 and 2026-08-27 superseded entry-11 descriptions remain in the current ledger history and the current description carries the repaired result | closed (current ledger history) |
| **T-08-66** (14) | Denial of service | `.planning/STATE.md` | medium | mitigate | `state.load` parses the current planning state and the plan close-out uses the same SDK handlers rather than hand-editing its structure | closed (SDK parse) |
| **T-08-67** (15) | Tampering | `a1-probe-fix.patch` | medium | mitigate | `verify-a1-patch.sh` applies the committed patch at `68199fa`, carries the current helpers, type-checks, builds, and removes its detached scratch worktree | closed (current patch verifier) |
| **T-08-68** (15) | Elevation of privilege | patched build installed in a live Caido | medium | **accept** | The maintainer-only unsigned diagnostic build was bounded to one local run, never released, and restored to HEAD. The explicit privilege trade-off is **AR-12** | closed (accepted; AR-12) |
| **T-08-69** (16) | Information disclosure | pasted `ps` output | medium | mitigate | The protected Spike records only load-bearing pid/pgid/count evidence and uses the established redacted argv form; the current digest is pinned by ARM B | closed (redacted evidence + ARM B) |
| **T-08-70** (16) | Denial of service | orphaned survivors after the measurement | medium | mitigate | The hardware procedure required survivor cleanup and the later patch verifier proves fixture cleanup plus restoration without changing the main package tree | closed (recorded cleanup + patch verifier) |
| **T-08-71** (16) | Repudiation | the interpretation paragraph | medium | mitigate | Measured cells and inference remain in separately labelled sections; the repaired A1 result does not erase the zero-control causality caveat | closed (separated evidence record) |
| **T-08-72** (17) | Tampering | `verdict-gate.sh`, under a favourable re-run | **high** | mitigate | The favourable repaired result was propagated through carriers without weakening `verdict-gate.sh`; the unchanged gate now passes all three arms | closed (verdict gate) |
| **T-08-73** (17) | Elevation of privilege | unsigned build installed into Caido | medium | **accept** | The one-off build came from a committed patch and base, was locally installed then removed, never published, and did not enter the signed pipeline. The decision is **AR-13** | closed (accepted; AR-13) |
| **T-08-74** (17) | Repudiation | the ownerless list | medium | mitigate | The authoritative verification record names the phases checked and explicitly retains the items with no later owner instead of assigning a fictional owner | closed (current verification ownership record) |
| **T-08-75** (15) | Information disclosure | `lastOrphanReap` diagnostics value | **high** | mitigate | Current formatters consume only closed reason unions and scalar counts; the executed unit case supplies pid-shaped unread data and proves it is absent from output | closed (source + kill-plan suite) |
| **T-08-76** (15) | Denial of service | the A1 probe, if reintroduced to HEAD | **high** | mitigate | The probe remains outside HEAD in `a1-probe-fix.patch`; its spawned-killer cleanup is verified in a detached worktree and the main package status remains unchanged | closed (patch-only + current verifier) |
| **T-08-77** (17) | Denial of service | the probe build left installed | **high** | mitigate | The recorded procedure restored the HEAD build and the current patch verifier again builds only in a removed scratch worktree; no package or release artifact changed in the main tree | closed (restore record + current verifier) |
| **T-08-78** (17) | Tampering | the recording of the A1 re-run | **high** | mitigate | The canonical marker records the repaired three-valued result, keeps the 2026-08-27 reading retracted, and is parsed as one inseparable record by ARM A/B | closed (current marker + verdict gate) |
| **T-08-79** (18) | Tampering | `verdict-gate.sh` current-truth logic | **high** | mitigate | The production parser is shared by live and fixture modes; stale, missing, duplicate, separated, and empty records remain demonstrated red | closed (verdict gate self-test) |
| **T-08-80** (18) | Repudiation | Eight A1 carriers and live pointers | **high** | mitigate | ARM B measures exactly eight mutable A1 carriers, two live pointers, and eight unchanged A6 carriers while preserving the immutable Spike digest | closed (ARM B census) |
| **T-08-81** (18) | Tampering | Carrier/pointer census | **high** | mitigate | The exact carrier array, ROADMAP/REQUIREMENTS pointers, root discovery, and non-empty census remain executable in the standing gate | closed (ARM B) |
| **T-08-82** (18) | Information disclosure | gate diagnostics and execution records | medium | mitigate | Verdict-gate diagnostics remain labels, counts, IDs, and relative paths only; no matched source line or environment value is emitted | closed (value-free gate output) |
| **T-08-83** (18) | Tampering | ARM C historical-summary integrity | **high** | mitigate | ARM C pins the canonical Spike digest and every committed Phase 08 summary blob while rejecting committed, working-tree, and unexpected-discovery mutations | closed (ARM C) |
| **T-08-84** (19/23) | Tampering | live citation and allocation census | **high** | mitigate | `threat-register-gate.sh` requires contiguous T-08-01…T-08-94 plus T-08-SC, dynamically discovers both live families, and pins the original sentinels plus exact source citations for T-08-89…T-08-94 | closed (citation gate + self-test) |
| **T-08-85** (19/23) | Repudiation | `audited_at_head` and package-history comparison | **high** | mitigate | Current audit baseline `9aa22bbd4c26fecabc17745438a2217a24b31d3e`, package tree `d90d3e95…`, SHA-256 census `d28734fe…`, 64 package commits since `d2d502b`, both package commits after `174c0b6` inspected, and zero package-changing commits after this boundary. The gate recomputes the latest package commit, tree, digest, and delta; a fixture commit after the audit is red | closed (standing Git audit gate) |
| **T-08-86** (19/23) | Repudiation | threat disposition and mitigation closure | **high** | mitigate | Every rolled row points to current source, a current record, or an executable suite/gate. The 44-row T-08-51…T-08-94 ledger must match register severity/disposition, carry an accountable owner, and map T-08-89…T-08-94 to their helper plus executable test; plans and summaries cannot satisfy the live join | closed (current evidence audit + ledger gate) |
| **T-08-87** (19/23) | Tampering | `status`, `threats_open`, totals, and accepted residuals | **high** | mitigate | Parsed aggregates require 94 numeric rows plus T-08-SC, 13 numeric accepts, exactly AR-01…AR-13, and zero open high mitigations, with accepted-high T-08-47 separately visible. An empty mitigation or non-closed high mitigation makes `secured` and `threats_open: 0` red | closed (derived totals + false-closure fixture) |
| **T-08-88** (19/23) | Tampering | `threat-register-gate.sh` discovery/parser/output | **high** | mitigate | One implementation serves live and fixture roots with pathname preflight, NUL-delimited discovery, newline refusal, bounded diagnostics, through-94 citation/ledger checks, and Git audit integrity. Both production self-test and the independent 32-case matrix exercise missing new citations/mappings, empty high mitigation, stale digest, false aggregate closure, and a package commit after audit | closed (production self-test + independent matrix) |
| **T-08-89** (20) | Information Disclosure | retired provider-start root after teardown | **high** | mitigate | `runMcpProviderTeardown` tombstones every exact `ProviderStartLease` before its awaited operation; `releaseProviderStartLease` consumes that exact identity once; `cleanupRetiredProviderStartRoot` recursively removes the captured root even when the installed pointer is textually equal. `mcp-lifecycle.test.ts` holds teardown, recreates the real directory, and proves it disappears | closed (WR-01 helper + executable interleaving) |
| **T-08-90** (20) | Denial of Service / Tampering | wrong-generation provider-start cleanup | **high** | mitigate | Retirement and cleanup authorization use exact object identity and epoch, never path equality. Equal-looking, double-consume, nested teardown, and current-generation negative controls execute in `mcp-lifecycle.test.ts`; `index.source.test.ts` forbids the former `currentTempDir === leaseTempDir` guard and pins one release/cleanup path | closed (WR-01 identity controls) |
| **T-08-91** (21) | Information Disclosure | partial or staging per-turn MCP config | **high** | mitigate | `writeOwnedTempFile` owns final and unique same-directory staging paths synchronously before the first I/O, writes at `0o600`, promotes atomically, and retains any path whose cleanup is unconfirmed. Real-file tests cover partial write and failed rename/removal; source structure pins both providers to the one helper | closed (WR-02 helper + executable failures) |
| **T-08-92** (21) | Repudiation / Information Disclosure | config cleanup owner set | **high** | mitigate | `cleanupOwnedPaths` snapshots without eager clear and deletes ownership only after `rm` resolves. EACCES and overlapping-cleanup tests prove ownership survives a failed unlink and a later retry removes it; finalize and outer finally share the same set | closed (WR-02 ownership retry controls) |
| **T-08-93** (22) | Tampering / Denial of Service | MCP runtime artifact reuse | **high** | mitigate | `inspectRequiredMcpRuntimeArtifacts` requires a directory root plus regular, openable script before reuse; missing, directory-at-file-path, non-regular, stat/open EACCES, and real unreadable cases fail closed. `index.source.test.ts` pins inspection before disposition/reuse and bans the old `fileExists` shortcut | closed (WR-03 helper + executable artifact matrix) |
| **T-08-94** (22) | Tampering / Information Disclosure | MCP context reuse | **high** | mitigate | Context must be a readable regular file whose bytes parse as a non-null, non-array JSON object. Malformed JSON, null, array, scalar, read failure, and non-regular inputs force replacement without logging bytes; production wiring passes only `readFile` into the import-free helper | closed (WR-03 parse matrix + source wiring) |
| **T-08-SC** (×5) | Tampering | npm/pip/cargo installs | n/a | accept | **This phase installs zero packages.** `08-RESEARCH.md` § *Package Legitimacy Audit* is present and empty ("audited, empty", not "skipped"). The cleanup-status pump and 0.2.0 metadata commits change no dependency declaration or lockfile. If a later plan proposes a dependency, the gate must be run then. `pgrep` remains a base-system utility on macOS and supported Linux | closed |

*Status: open · closed · closed (accepted) — an accepted residual is recorded in the Accepted Risks
Log below, never silently closed.*

## T-08-51..T-08-94 Roll-up Evidence Ledger

This compact ledger assigns current evidence and one accountable responsibility owner without
changing the canonical main register's seven-column contract. Hardware/runtime coordination remains
distinct from implementation and from the person accepting a residual.

| Threat ID | Severity | Disposition | Owner | Evidence | Outcome |
|-----------|----------|-------------|-------|----------|---------|
| T-08-51 | high | mitigate | six2dez:implementation | `verdict-gate.sh` self-test and ARM A | closed |
| T-08-52 | medium | mitigate | six2dez:implementation | canonical A1 marker and ARM B | closed |
| T-08-53 | medium | mitigate | six2dez:implementation | ARM C summary-blob pins | closed |
| T-08-54 | low | accept | six2dez:risk-acceptance | bounded gate-output contract | accepted; AR-10 |
| T-08-55 | medium | mitigate | six2dez:implementation | `kill-plan.ts` and kill-plan suite | closed |
| T-08-56 | high | mitigate | six2dez:evidence-coordination | blocking hardware record plus repaired A1 marker | closed as record control |
| T-08-57 | high | mitigate | six2dez:implementation | classifier totality and red-input tests | closed |
| T-08-58 | medium | mitigate | six2dez:implementation | marked source correction and structure tests | closed |
| T-08-59 | low | accept | six2dez:risk-acceptance | closed verdict reason union | accepted; AR-11 |
| T-08-60 | high | mitigate | six2dez:implementation | current ROADMAP SC-2 boundaries | closed |
| T-08-61 | medium | mitigate | six2dez:implementation | preserved dated ROADMAP supersessions | closed |
| T-08-62 | medium | mitigate | six2dez:implementation | unticked requirements and explicit ownerlessness | closed |
| T-08-63 | high | mitigate | six2dez:implementation | current WINDOWS table/JSON parse | closed |
| T-08-64 | high | mitigate | six2dez:implementation | main-register parser and live join | closed |
| T-08-65 | medium | mitigate | six2dez:implementation | entry-11 supersession history | closed |
| T-08-66 | medium | mitigate | six2dez:implementation | GSD `state.load` parse | closed |
| T-08-67 | medium | mitigate | six2dez:implementation | current `verify-a1-patch.sh` pass | closed |
| T-08-68 | medium | accept | six2dez:risk-acceptance | bounded local probe-build decision | accepted; AR-12 |
| T-08-69 | medium | mitigate | six2dez:evidence-coordination | redacted protected Spike evidence | closed |
| T-08-70 | medium | mitigate | six2dez:evidence-coordination | survivor cleanup record and patch verifier | closed |
| T-08-71 | medium | mitigate | six2dez:evidence-coordination | measured cells separated from interpretation | closed |
| T-08-72 | high | mitigate | six2dez:implementation | unchanged verdict gate passes | closed |
| T-08-73 | medium | accept | six2dez:risk-acceptance | one-off unsigned-build decision | accepted; AR-13 |
| T-08-74 | medium | mitigate | six2dez:implementation | authoritative ownerless-item record | closed |
| T-08-75 | high | mitigate | six2dez:implementation | scalar formatter and confidentiality unit case | closed |
| T-08-76 | high | mitigate | six2dez:implementation | patch-only probe and current patch verifier | closed |
| T-08-77 | high | mitigate | six2dez:implementation | restored HEAD build and clean main package tree | closed |
| T-08-78 | high | mitigate | six2dez:evidence-coordination | repaired three-valued A1 recording plus ARM A/B | closed |
| T-08-79 | high | mitigate | six2dez:implementation | verdict-gate shared parser red matrix | closed |
| T-08-80 | high | mitigate | six2dez:implementation | eight-carrier/two-pointer ARM B census | closed |
| T-08-81 | high | mitigate | six2dez:implementation | exact carrier array and non-empty discovery | closed |
| T-08-82 | medium | mitigate | six2dez:implementation | value-free verdict-gate diagnostics | closed |
| T-08-83 | high | mitigate | six2dez:implementation | ARM C Spike/summary immutability | closed |
| T-08-84 | high | mitigate | six2dez:implementation | 94+SC citation census and original plus T-08-89…94 sentinels | closed |
| T-08-85 | high | mitigate | six2dez:implementation | final package SHA/tree/digest/latest-commit/delta Git gate | closed |
| T-08-86 | high | mitigate | six2dez:implementation | current source/suites/gates and 44-row ledger join | closed |
| T-08-87 | high | mitigate | six2dez:implementation | derived high-open, numeric accept, AR-01…13, and status totals | closed |
| T-08-88 | high | mitigate | six2dez:implementation | production self-test plus independent 32-case through-94 audit red matrix | closed |
| T-08-89 | high | mitigate | six2dez:implementation | WR-01 `mcp-lifecycle.ts` and `mcp-lifecycle.test.ts` retired-root interleaving | closed |
| T-08-90 | high | mitigate | six2dez:implementation | WR-01 `mcp-lifecycle.ts` and `mcp-lifecycle.test.ts` exact-identity controls | closed |
| T-08-91 | high | mitigate | six2dez:implementation | WR-02 `owned-temp-file.ts` and `owned-temp-file.test.ts` failure matrix | closed |
| T-08-92 | high | mitigate | six2dez:implementation | WR-02 `owned-temp-file.ts` and `owned-temp-file.test.ts` unlink retry | closed |
| T-08-93 | high | mitigate | six2dez:implementation | WR-03 `mcp-runtime-artifacts.ts` and `mcp-runtime-artifacts.test.ts` type/readability matrix | closed |
| T-08-94 | high | mitigate | six2dez:implementation | WR-03 `mcp-runtime-artifacts.ts` and `mcp-runtime-artifacts.test.ts` context parse matrix | closed |

## Register Corrections and Evidence Notes

### T-08-12 — the caller enumeration was wrong

**Recorded as a correction rather than silently overwritten.** Applied by the `--fix` pass over
`08-REVIEW.md` finding **WR-01**.

**What the row claimed.** That the kill loop in `cleanupMcpRuntime` covers two entry points — the
Stop button and `startMcpServer`'s own failure path — which is what the source comment said too.

**Measured.** `cleanupMcpRuntime` has **twelve** call sites (`index.ts:1847, 1873, 1888, 1894, 1900,
3545, 3639, 3658, 3671, 3682, 3688, 3715`). Two of the unnamed ones fire during **normal operation**,
not teardown:

- `updateSettings:1847` — any settings save carrying `caidoApi` while MCP is up, if
  `refreshActiveMcpRuntime` throws.
- `refreshActiveMcpRuntime:1873/1888/1894/1900` — four error branches (empty token, spec failure,
  context-file write failure, auth validation failure), reached from `syncCaidoSessionToken`, which
  **the frontend keep-alive drives** whenever the effective Caido token changes. A token rotation
  mid-turn, or one momentarily-empty `CAIDO_AUTHENTICATION` read, force-kills the in-flight provider
  turn. Before this phase the same sequence tore down the MCP runtime and left the turn running.

**Why the loop was NOT narrowed.** Narrowing to the teardown callers would re-open SC-4 on the other
ten: every one of those paths enters the same generation cleanup and its completion barrier, so a
path that could bypass provider exit and orphan-reap settlement before removing the env-source
documents carrying `CAIDO_TOKEN` would be exactly the case SC-4 forbids. Deleting a token-bearing
file is not revocation.

**What changed instead.** The loop is kept wide and made honest. Each session it kills now gets a
`stopped` session-state event and its `sessionWatchdogs` entry removed, mirroring `closeCliSession`.
The silent failure this closes: `activeProcesses.delete` had already run, so a later
`cancelCliMessage` for that session found `proc === undefined` and returned `ok` **without**
publishing any state — the user's Stop button became a no-op for a session still visible in the UI,
with recovery depending entirely on the child's `close` handler reaching `finalize`. Three
assertions in `index.source.test.ts` now pin the loop, the published state and the watchdog delete.

**CURRENT narrowing (2026-09-01, `415ae7e`).** The wide loop now feeds a callback-driven barrier
instead of an immediate recursive removal. This protects `cleanupMcpRuntimeGeneration` for all
twelve callers without awaiting child callbacks inside the initiating RPC. It does not retrofit the
same barrier into `closeCliSession`, `deleteChat`, or `sweepOrphanedMcpTempDirs`; those paths remain
the current AR-05 boundary.

### T-08-04 — the correction

**Recorded as a correction rather than silently overwritten**, per the `07-VALIDATION.md`
convention. Applied by the `--fix` pass over `08-REVIEW.md` finding **CR-02**.

**What this row claimed at phase close.** That T-08-04 was closed by two controls: the pid captured
into a `const` before the timer is scheduled, and an `isPidAlive` re-check inside the callback.

**Why neither closed it.** `isPidAlive` sends signal `0`, and signal `0` answers *"does a process
with this number exist and may I signal it"* — which is exactly `true` for a pid the OS has handed
to an **unrelated** process. Its only discriminating power was over pids that are dead *and not yet
reused*: the harmless case. In the dangerous case — the one this row is about — it passed. The
capture-before-schedule control did not save it either: the callback calls `killTree`, whose first
statement re-reads `proc.pid`, and Node does **not** clear `pid` after reaping (measured by the
reviewer: `after exit, proc.pid = 99641`). So the reachable win32 sequence was cancel at T0 → tree
gone by T0+ε → pid reassigned before T0+3s → `isPidAlive` returns `true` → `taskkill /pid <n> /t /f`
against an unrelated process **and its whole child tree**.

**The fix the review proposed does not compile here, and that is worth recording.** `08-REVIEW.md`
CR-02 suggests `if (proc.exitCode !== null || proc.signalCode !== null) return;`. `pnpm -r typecheck`
**rejects it**: `error TS2339: Property 'exitCode' does not exist on type
'ChildProcessWithoutNullStreams'`. The ambient type this package compiles against is Caido's
`@caido/quickjs-types` `child_process.d.ts`, which declares `stdin`/`stdout`/`stderr`/`pid`/`kill`
and the emitter surface — **no exit state at all** — and that matches LLRT's own class definition
(`caido/dependency-llrt` branch `caido`, `modules/llrt_child_process/src/lib.rs`: a `#[qjs(get)] pid`
getter and a `kill` method, nothing else; the exit code and signal are delivered only as `exit`/
`close` event arguments).

Had the ambient type been widened to make it compile, the spelling would have shipped a **second**
instance of the exact defect class this phase exists to prevent. Under LLRT both reads are
`undefined`, and `undefined !== null` is **`true`** — so the guard would have returned early for
every pid on every real install, silently disabling the deferred forceful rung on **both** platforms
while staying green on all five CI legs. That is finding L-4's shape verbatim, and a CMP-01 POSIX
regression on top of it.

**What closes it now.** `hasTrackedProcessExited` in `kill-plan.ts` — a pure decision over three
injected scalars, in the same D-P4 shape as `buildKillTreePlan`:

- `observedExitEvent` — the `exit` event the handle itself emitted, recorded by the caller. Only the
  process **we** spawned can fire it, so it is identity in the strict sense, and it is the only
  identity source that survives under LLRT. Best-effort there, because Caido's runtime does not
  reliably deliver `child_process` callbacks while an RPC is awaiting.
- `exitCode` / `signalCode` — Node's handle properties, read at one cast-carrying boundary
  (`readHandleExitState`) and treated as **`undefined` ⇒ not proven exited**, which is what makes the
  LLRT arm safe rather than catastrophic.

Both rungs check identity first and liveness second. `isPidAlive` is kept rather than replaced: under
LLRT it is the only answer left. Every arm is strictly subtractive — the guard can skip a kill on
evidence, never on ignorance, so it can never *add* a kill and never *disable* the rung.

**A second correction to the same row, from review WR-03: `isPidAlive` was inert under LLRT.** The
probe returned `true` unless the kill primitive **threw**. Node's `process.kill(pid, 0)` throws ESRCH
for a missing pid; Caido's LLRT does not — `llrt_utils/src/signals.rs` `kill` converts that case to
`Ok(false)`, a RETURN VALUE. So the shipped probe reported **every** pid as alive on every real
install, and the guard citing it as T-08-04's evidence never skipped anything there, while behaving
correctly on all five CI legs. The body now reads the result as well as catching, calibrates against
a pid known to be alive (`process.pid` on Node, `process.id` on LLRT — neither runtime has both),
and resolves every unknown toward "alive" so it stays strictly subtractive. Measured under Node and
against an LLRT-shaped stub: self `true`, unallocatable pid `false`, reaped child `false`,
LLRT-stub dead pid `false` (the old body: `true`), unusable probe `true`, no self-pid `true`. The
`isPidAlive(` = 3 census is now an assertion in `index.source.test.ts` rather than a one-time grep.

**The residual this leaves, stated rather than papered over.** On POSIX a process group outlives its
leader, so a handle that has exited while group members survive skips a deferred group kill that
would still have worked. That was already true of the `isPidAlive` guard as shipped — a dead leader
answers signal 0 with `false` — so this correction does not widen it. Closing it needs an
identity-bearing group reference that neither Node nor LLRT exposes.

### T-08-01 — closed by attestation, and exactly what that is worth

T-08-01 is the threat this phase exists to close. Its mitigation is fully implemented, and it is
proven behaviourally **under Node** by `kill-tree.posix.test.ts`'s control-plus-proof pair. What Node
cannot supply is evidence about Caido's LLRT, which no CI leg executes.

**What closed it.** Plan 08-05 **T-08-14**, the phase's designated gating manual verification: the
maintainer ran a real Claude turn in a real Caido on their own macOS machine, clicked Stop, and
confirmed on 2026-08-24 that `pgrep -f mcp-server.mjs` returned **zero** afterwards against a
**non-zero** count during the turn.

**The basis, stated so a later reader can re-evaluate it rather than inherit a bare number.** This is
a **maintainer attestation, not a recorded measurement.** The maintainer replied `approved` — which
under the checkpoint's stated contract means exactly the two facts above — but **did not supply the
numeric counts**, and they were therefore not written down. Three consequences follow, and none of
them is rhetorical:

1. **The reading is not reproducible or auditable.** There is no before-count, no after-count and no
   Caido version string attached to this closure. A future regression cannot be diffed against it.
2. **One specific confounder is unexcluded: the CLI's own cleanup.** A zero after-count proves the
   orphan is gone; it does **not** prove *this phase's mechanism* is what removed it. Claude Code may
   terminate its own MCP child on shutdown. The thing that would have excluded this is the pre-fix
   control — the same procedure against the *old* code, showing a non-zero after-count — and
   `08-SPIKE.md` § *Control* records that as **not recorded either**, because the Wave-0 checkpoint
   was waived on 2026-08-24 without readings. So there is **no measured before/after pair on this
   machine** for the phase's POSIX claim; there is one attested after-state.
3. **The scope is one machine, one Caido build, one provider CLI, one path.** The **timeout path was
   not reported** and is recorded as **not exercised** — the cancel-path attestation does not carry
   to it.

**CURRENT ADDENDUM (2026-09-01, `174c0b6`).** The historical closure above is preserved as
historical provenance, but limitations (1) and (3) are now narrower. A recorded Codex run captured
clean/during/after counts, parent and process-group topology, a Stop timestamp, and zero provider/MCP
processes about 210 ms later. A separate 10-second run captured the provider and MCP before the
deadline, zero at about 10.24 seconds after Send, the UI's timeout state, and absence of the requested
60-second completion marker. The original timeout implementation first failed this control and was
fixed before the successful re-run. Limitation (2) remains: the MCP child was in a distinct group
and `lastOrphanReap` reported exit 1/no match, so the evidence is product-causal without proving
that group signalling or a reap signal removed the child.

**What this does and does not close.** It closes the *outcome* claim T-08-01 actually states — after
a cancel, no token-bearing MCP child survives — on the runtime users run. It does **not** close A1 or
A6 as *mechanism* claims, for the confounder in (2):

**CORRECTED 2026-08-28, superseding the 2026-08-27 correction preserved below — ONE assumption was
measured, not both.** A6 was measured. A1's reading is **RETRACTED**. The superseded 2026-08-24 and
2026-08-27 texts are both preserved as block quotes and neither is deleted.

<!-- DRIFT:A1-CORRECTION:BEGIN -->
**A1 correction:** The repaired three-valued probe CONFIRMED the favourable A1 outcome on 2026-08-31. The invalid 2026-08-27 reading remains RETRACTED as of 2026-08-28 and is preserved only as history.
<!-- DRIFT:A1-CORRECTION:END -->

- **A1 — RETRACTED 2026-08-28, NOT measured.** The probe determined liveness with
  `signalRef.process?.kill?.(grandchildPid, 0) ?? false` — an optional call on a primitive the SAME
  diagnostics run measured absent (`typeof process.kill` = `"undefined"`) — and coalesced the absent
  case to "not alive", so the reading `spikeDetachedGroupKill: "grandchild-died (detached honoured)"`
  was emitted UNCONDITIONALLY on darwin 25.6.0, probe build `68199fa`. **The red input did not
  exist**, so the reading carries no information about whether the grandchild died. The source
  analysis of `caido/dependency-llrt@caido` at pinned commit `a5b021c` **stands alone again**, exactly
  as it did before the run; it is not corroborated by execution. Retraction recorded in
  `08-VERIFICATION.md` gap 1; the defect is broken-windows ledger entry **20**; the fixed
  three-valued determination is `classifyLivenessObservation` (`kill-plan.ts`, plan 08-12) and the
  re-run is owned by plan 08-17.

  **The analysis that would have caught this was already in this file.** § *G-02 — recorded, not
  fixed* traces the very same absent primitive correctly and in detail — it reasons from
  `typeof process.kill` = `"undefined"` to what the sandbox does and does not expose, and draws a
  conservative conclusion. Two sections of one document read the same reading; only one of them
  read it correctly. § *G-02* is left exactly as it is, as the contrast case.

  > **SUPERSEDED 2026-08-27 (preserved, not deleted):** *"CORRECTED 2026-08-27 — both assumptions
  > are now MEASURED, and they did not both come back the same way."* and its A1 bullet:
  > *"**A1 — CLOSED FAVOURABLY, measured 2026-08-27.** The shipped Caido LLRT does honour the
  > process-group spawn option: `spikeDetachedGroupKill: "grandchild-died (detached honoured)"` on
  > darwin 25.6.0, probe build `68199fa`, rebuilt from the recoverable commit and run during UAT
  > (`08-UAT.md` test 1). The source analysis of `caido/dependency-llrt@caido` at pinned commit
  > `a5b021c` is now corroborated by execution on the runtime users run, not standing alone."*
  > The A6 bullet below is NOT superseded and is NOT withdrawn.
- **A6 — FALSIFIED, measured 2026-08-27.** A real provider CLI does **not** keep its MCP child
  inside its own group. Measured on a real macOS install (`08-UAT.md` test 2): the CLI (codex,
  pid **43921**) sat in process group 43752, while its own `mcp-server.mjs` child (pid **44284**)
  sat in group **44284**. A group signal aimed at the CLI's group cannot reach the token-bearing
  child, and OQ-2's single-pid rung does not rescue it — that rung signals the CLI, not the child.

**What each verdict does to the consequence recorded here. CORRECTED 2026-08-28.** The nine-site
POSIX regression this section feared — the group operand naming a group that was never created,
green on every CI leg — is **NOT retired: it is live again**, because the reading that retired it is
withdrawn and A1 is unmeasured. The risk is now on BOTH assumptions: A1 unmeasured and A6 measured
false. The mechanism that answers A6 is not the group operand and not OQ-2's rung; it is the
**argv-marker orphan reap** plans **08-06** and **08-07** shipped, which identifies its target by
the target's own command line and is therefore independent of process groups by construction — and
that mechanism is untouched by A1's retraction, because it depends on command-line identity rather
than on process groups. OQ-2's rung survives with a **corrected justification** — defence against a
future Caido that rebases its LLRT fork, not against an unmeasured one. One measurement closes a
version, not a dependency.

> **SUPERSEDED 2026-08-27 (preserved, not deleted):** *"The nine-site POSIX regression this
> section feared … is **retired by A1's closure**. The risk moved to A6, which the section rated
> lower."*

**What is still NOT measured, stated so the closure is not read wider than it is.** One build, one
platform, one provider. **Claude Code — the active provider — remains unmeasured**, and the codex
reading was taken on an instance Drift did not spawn (UAT gap G-04). The **Control** was never
taken, so the T-08-14 attestation above is still an isolated zero with the CLI-cleanup confounder
unexcluded. Broken-windows ledger entry **11** is therefore rewritten to the measured state rather
than closed.

> **SUPERSEDED 2026-08-24 (preserved, not deleted — the `07-VALIDATION.md` convention):**
>
> - **A1 — OPEN, not measured.** Whether the shipped Caido LLRT honours the process-group spawn option.
>   It rests on source analysis of `caido/dependency-llrt@caido` at the pinned commit `a5b021c`, and on
>   nothing that was ever executed.
> - **A6 — OPEN, not measured.** Whether a real provider CLI keeps its MCP child inside its own group.
>   If any CLI calls `setsid()` on that child, the group signal misses it.
>
> Both stay open as broken-windows ledger entry **11** (`unmet-truth`), untouched by this reading. The
> consequence they carry is unchanged: plan 08-03 took the number of sites depending on A1 from **two
> to nine**, so if the shipped LLRT does not honour the option, the group operand names a group that
> was never created — a **nine-site POSIX regression** — and **every CI leg stays green through it**,
> because every leg runs Node and Node honours the option. Phase 5 finding L-4 recurring verbatim.
> OQ-2's single-pid rung, which fires first inside `killTree` at all nine sites (`proc.kill(` = 3 in
> the census, deliberately, with a source comment naming A1 and forbidding its deletion), degrades a
> total regression into a partial one; it does not prevent one.

**What would re-open or strengthen this. UPDATED 2026-08-27 — steps 1-3 have now been run; step 4
has not.** Re-open: any report of a surviving `mcp-server.mjs` after a cancel — and one such report
already exists, though by a different route (UAT gap G-04: pid 44284 alive with `activeSessions: 0`,
launched by a CLI instance Drift never spawned). Strengthen to a measurement: run `08-SPIKE.md`
step 4 against the **pre-fix** build (recoverable at `68199fa`) for the Control, and re-run step 3
against a **Drift-spawned Claude Code** turn so A6 covers the active provider. Those two readings
are what remain; the A1 verdict and the A6 pgid/pid pair are taken.

### The sandbox finding — what four readings from one real install actually established

**Added 2026-08-27.** This is the single mechanism behind UAT gaps G-01 and G-02, and it is a
security finding in its own right because two of this phase's mitigations read the shim it
describes.

Four independent readings, same real macOS install, probe build `68199fa`:

| Reading | Value |
|---|---|
| `typeof process.kill` | `undefined` |
| `parentEnvKeyCount` (`process.env`) | `0` |
| `processVersion` (`process.version`) | `unavailable` |
| `versionsNode` / `versionsLlrt` (`process.versions`) | `unavailable` |

**These are not four coincidences. Caido's plugin sandbox re-exports a heavily restricted
`process` shim, not LLRT's own `process` module.** `08-RESEARCH.md` § *Q2* source-read
`modules/llrt_process/src/lib.rs:197-199` and found `process.set("kill", …)` — that describes
**LLRT**. It does not describe what the plugin sandbox hands a backend bundle. The distinction
was never drawn before this reading, and the research that read the runtime's source was
therefore answering a different question than the one that mattered. A single absent value could
have been a host quirk; four absences are a **policy**, and a policy is very unlikely to differ
on Windows.

**Consequence 1 — T-08-03's rating.** `buildKillTreePlan`'s win32 arm reads `SystemRoot` from
that same empty shim, which made the bare-name `taskkill.exe` fallback the **expected** Windows
path rather than a remote contingency. T-08-03 is re-rated **high** accordingly and mitigated by
plan 08-08's derived system root — see the register row.

**Consequence 2 — SC-2's stated reason is incomplete, though its conclusion holds. A marked
correction, not a scramble.** ROADMAP SC-2 bans `process.kill(-pid, …)` because rquickjs converts
through `f64` to `u32` and a negative pid raises `Underflow`. On this build that failure is
**unreachable**: the call would fail as `TypeError: process.kill is not a function` first. The
ban is still correct, the comment-stripped static gate still earns its place, and nothing about
the shipped mechanism changes — only the stated mechanism of the failure is partial. Recorded
here rather than by editing the criterion's `Underflow` reasoning, because that reasoning is
accurate about the runtime it describes and would become false if rewritten.

**Consequence 3 — T-08-04 degrades to identity-only on Caido.** See § *G-02 — recorded, not
fixed* below.

### AR-02 re-examined — a measured instance, and mostly closed

**Added 2026-08-27.** AR-02 is re-examined rather than deleted, because deleting it would erase
the reasoning that deferred it and leave the residual with no history.

**What changed.** AR-02 was deferred on **blast-radius** grounds: identifying "a Drift MCP
process from a previous run" was said to require **image-name matching**, which could terminate
an unrelated `node` belonging to the user or to another tool. That objection was correct about
image-name matching and **is answered by a different identity**. Plan 08-06's scan is a
**two-anchor adjacency pattern** — the session-unique `drift-mcp-<8..64 hex>` directory name AND
`mcp-server.mjs`, required to be adjacent — with the marker shape validated before any pattern is
composed and **no looser fallback arm**. A process that is not Drift's cannot carry Drift's
session-unique temp-directory token in its command line, so the blast radius the objection
described does not exist for this mechanism.

**And the residual is no longer hypothetical.** UAT gap **G-04** measured one: pid 44284, a live
`node .../drift-mcp-.../mcp-server.mjs` holding a valid `CAIDO_TOKEN`, with `activeSessions: 0`.
Plan **08-07** wired the class-wide previous-run reap into `sweepOrphanedMcpTempDirs`, **above
every `rm`**, so the case AR-02 describes is now terminated rather than merely swept around.

**What remains, precisely.** Two things, and they are why AR-02 is re-examined and not closed:

1. **POSIX only.** There is no Windows enumerator — **AR-04**.
2. **It fires at start-up and at teardown, not continuously.** Between those points, and in
   particular while a second session is live, the reap is suppressed by the idle gate — **AR-07**.

### G-02 — recorded, not fixed, and the stale prediction retired

**Added 2026-08-27. This is a record, not a defect, and the distinction is what the source
documents in advance.**

**The reading.** `spikeProcessKillType` measured `"undefined"` on a real macOS install. Caido's
plugin sandbox exposes no `process.kill`, so the **signal-0 liveness probe cannot run there**.

**The mechanism.** `isPidAlive` (`index.ts`) already guards this — `typeof killRef !== "function"`
returns `true` — so it does not throw; it simply always answers "alive" and never skips. The
T-08-04 guard therefore reduces on Caido to its **identity half alone**:
`hasTrackedProcessExited` over the handle's own observed `exit` event.

**Why no code change follows.** Three reasons, all of them already true in the shipped tree:

1. **The source documents exactly this fallback in advance**, at `index.ts:5319-5331`: *"under
   Caido's LLRT the handle carries no exit state at all … so liveness is the only answer left
   there."* This is the designed degradation, not a discovered hole.
2. **Every unknown resolves toward "alive"**, so **neither check can ever ADD a kill** — the guard
   is strictly subtractive. It can skip a kill on evidence; it can never manufacture one on
   ignorance.
3. The accepted residual that remains is **already stated at the same site** (a POSIX process
   group outliving its leader), and it was not widened by this reading.

**The stale prediction, retired.** The 08-01 Wave-0 checkpoint predicted that a value other than
`function` for `spikeProcessKillType` would mean the deferred-rung guard *"needs a redesign"*.
**That prediction PREDATES the CR-02 fix** which introduced `hasTrackedProcessExited` and put
identity **before** liveness; at the time it was written, liveness was the only check there was,
so its absence would indeed have been fatal. It is annotated as superseded in `08-01-PLAN.md`
(dated, annotate-do-not-rewrite, the same rule plan 08-10 Task 2 applies to executed plans) and
in `08-SPIKE.md` § *Step 2*, which is the living procedure a re-run would follow.

### T-08-23 / T-08-24 — the window between enumeration and signal

**Added 2026-08-27 (review WR-03). A bound was shipped; the hazard is narrowed, not closed, and
this section says which is which.**

**The hazard.** A pid is not an identity. This register spends an entire correction section on that
fact for T-08-04 — `isPidAlive` proves LIVENESS, and a pid the OS has REASSIGNED is alive — and
`hasTrackedProcessExited` exists because of it. The orphan reap has the **same** hazard on the one
path that holds **no handle at all**: `pgrep` samples the process table and exits, Drift's `close`
handler runs some time later, and `kill -KILL -- <pid>` is spawned for numbers nobody re-verified.
The operand is forceful and the reap is issued **at the exact moment processes are dying** — at
`cancelCliMessage` the CLI has just been SIGTERMed, at `cleanupMcpRuntime` the whole
`activeProcesses` loop has just been killed — which is when pids are being freed. Drift's users run
high-fan-out tooling (`xargs -P`, `ffuf`, `nuclei`), where pid-table churn in the thousands per
second is ordinary rather than exotic.

**What shipped.** A fifth `classifyOrphanScanOutcome` arm, `scan-stale`. The caller already armed a
`setTimeout` for the scan budget, so in the ordinary case the window was bounded. What was **not**
bounded is the case that matters: on a starved Caido event loop neither the timer nor the `close`
callback runs, and whichever becomes runnable first when the loop drains decides the outcome. If
`close` wins, the pids are arbitrarily old. The age is now measured on the **wall clock** and
compared against the caller's own scan timeout — the same identifier, gated in
`index.source.test.ts` so the two bounds cannot drift apart — so the bound holds in both orderings.
An unusable age or budget resolves toward stale; a **negative** age (a system clock stepped
backwards) does not, because refusing there would disable the reaper for the length of the step.

**The two closures the review proposed, and why neither was taken.** Recorded here rather than left
to be re-derived, since both look like strict improvements until the second-order cost is priced:

1. **`pkill -f -- <pattern>`** matches and signals inside one process, so the window genuinely
   closes. But it signals every match **at kill time** rather than the frozen list `pgrep` returned.
   A user who clicks Stop and immediately starts a new turn — an ordinary interaction, and more
   likely than pid reuse — would have the **new** turn's MCP child killed. That is **T-08-27**, the
   precise harm the idle gate exists to prevent, traded in at a higher probability than the reuse it
   removes.
2. **A `ps -p <pid> -o command=` identity re-check** before the signal costs one more spawn **and
   one more child-process `close` delivery per orphan**. At decision time, whether Caido's LLRT
   delivered the *first* callback was unverified. The 2026-09-02 pump acquisition now proves that
   first scan/kill chain settles when explicitly pumped, but a second per-pid callback would still
   enlarge the teardown dependency and failure surface — which can prevent signalling and violate
   **LIF-02**, the reported bug the whole mechanism exists to fix. The `ps` invocation itself was
   executed on darwin 25.6.0 during this fix and does print the full command line with no
   truncation, so the objection is to the extra event dependency and not to the utility.

**What remains, and it is recorded as AR-09:** inside the budget, a reused pid is still signalled.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Not mitigable here because | Owner next | Accepted By | Date |
|---------|------------|-----------|---------------------------|-----------|-------------|------|
| **AR-01** | T-08-07 | **`taskkill /T` cannot reach a grandchild whose intermediate parent has already exited.** On the three-level Windows `.cmd` shape (`cmd.exe` → provider → `node mcp-server.mjs`), the tree switch walks the `ParentProcessId` relation recursively; if `cmd.exe` has exited, the walk finds nothing and the token-bearing `node` process survives. Referenced **from the source** at `sendCliMessage`'s provider-spawn resolution note and from `kill-tree.win32.test.ts` case 1, which deliberately keeps the intermediate alive. **Mitigating facts:** `cmd.exe /c` normally waits for its child, so the window is narrow; and Phase 6 already prefers `.exe` over `.cmd` (RES-02), which removes the level entirely wherever a native install exists. Tagged `ASSUMED — community/issue-tracker evidence only` at the site (assumption A3); if A3 is wrong the residual is *smaller* than recorded, an error in the safe direction | The correct primitive is a Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, which requires Win32 API calls neither Caido's LLRT nor Node exposes without a native addon — banned by the QuickJS runtime constraint (`CLAUDE.md` § *Backend Constraints*) | **ROADMAP Phase 10 SC-5** — the real-machine Windows confirmation is the only place this could be observed. Nothing in CI reaches it | six2dez (via phase plan) | 2026-08-24 |
| **AR-02** | T-08-08 | **A hard-killed Caido leaves an MCP orphan that no start-up sweep touches** (OQ-3). `sweepOrphanedMcpTempDirs` removes residue **directories**, never processes. A token-bearing `mcp-server.mjs` from a previous run therefore survives indefinitely — with its context file deleted underneath it, so the forensic trail is gone while the bearer token in its memory stays valid. `mcp-server-spec.ts` already records that a hard-killed Drift is *"the highest-value case the sweep exists for"*, which is exactly why this gap is worth naming rather than leaving as folklore | **Deliberately out of scope for Phase 8.** Identifying "a Drift MCP process from a previous run" requires image-name matching that could terminate an unrelated `node` belonging to the user or to another tool. A blast-radius decision of that kind needs its own `/gsd-discuss-phase`, not a task appended to a lifecycle phase. Recorded as a residual, **not planned as a task** — recorded decision OQ-3 | **RE-EXAMINED 2026-08-27, and largely CLOSED — see § *AR-02 re-examined* below.** The residual now has a **measured instance** rather than a hypothetical one (UAT gap G-04, pid 44284 alive with `activeSessions: 0`), the blast-radius objection is answered by the two-anchor adjacency pattern, and plan **08-07**'s start-up reap closes the case this row describes. **What remains:** the reap is **POSIX-only** (AR-04), and it fires at start-up and at teardown rather than continuously (AR-07). Remaining owner: a future registration-focused phase, entered through `/gsd-discuss-phase` | six2dez (recorded decision OQ-3; re-examination accepted 2026-08-27) | 2026-08-24, re-examined 2026-08-27 |
| **AR-03** | T-08-20 | **Real revocation is not available to Drift.** Killing the process removes the capability *from that process*; it does not invalidate the token. Any orphan that escaped every mechanism in this phase — through AR-01's Windows hole, through AR-02's hard-kill path, or through a negative A1 verdict — still holds a **valid bearer token** with the full authority of the logged-in user until the user's Caido session ends. This is the ceiling on everything above: the phase converts "the agent keeps running" into "the agent is stopped", not "the credential is dead" | Invalidating the credential would require **rotating the Caido session token**, which Drift does not own and cannot do. Drift only transports it (ASVS V2: "indirectly — nothing here mints or validates it") | Upstream Caido. Nothing in this milestone can change it; the honest user-facing remediation is to end the Caido session | six2dez (via phase plan) | 2026-08-24 |
| **AR-04** | T-08-26 | **The win32 orphan class the reaper cannot reach.** Plans 08-06/08-07 ship a POSIX orphan reap that identifies an MCP server by its own argv (`pgrep -f` over a session-unique temp-directory marker adjacent to `mcp-server.mjs`). **Windows gets no equivalent.** This is narrower than it sounds and the boundary matters: `taskkill /t` walks `ParentProcessId` and is **indifferent to process groups**, so A6 was never a Windows question and **LIF-01's mechanism is unaffected**. What Windows does not get is the **G-04 class** — an MCP server launched by a CLI instance Drift did not spawn, which no `activeProcesses` entry names and no `/t` walk from a Drift-held pid reaches | Reaching that class needs a **command-line enumerator**, and the three candidates were each rejected with a reason rather than left unexamined: **`tasklist` does not print command lines** (so a Drift MCP server is indistinguishable from any other `node.exe`); **`wmic` is removed from current Windows** (deprecated and absent from recent builds, so a mechanism built on it would be dead on the platforms this milestone targets); and **spawning PowerShell from the plugin opens a surface this phase will not open** — a scripting host launched from a backend that holds a live `CAIDO_TOKEN`, for an enumeration convenience. Recorded with an owner rather than left as an absence | **ROADMAP Phase 10** — the real-machine Windows confirmation is the only place this class could be observed at all; a mechanism decision belongs to whatever phase owns Windows registration | **six2dez** (recorded decision GD-02 scope boundary; threat T-08-26 disposition `accept`, plan 08-06) | 2026-08-27 |
| **AR-05** | SC-4's completion-order clause | **SC-4's ORDER is enforced; its "so … die before" CONSEQUENCE is not.** `08-VERIFICATION.md` verified statement order independently at all three sites (`cleanupMcpRuntime`, `closeCliSession`, `deleteChat`) — the kill precedes the removal in the source, gated by a statement-position scanner on every CI leg. What is **not** enforced is that the killer WINS that race: `killTree` is fire-and-forget by design (`grep -c 'await killTree'` = 0, a deliberate gate) and the removals are unawaited `void rm(...)` | **The verifier's alternative — await the killer in `cleanupMcpRuntime`, where the call site is already async — is REJECTED, and not for convenience.** Awaiting a spawned killer inside an RPC handler suspends that handler while waiting on a child-process callback and a timer that **Caido's runtime does not reliably deliver during an await**. That is the event-loop starvation `CLAUDE.md` names as an anti-pattern and the reason `killTree` is fire-and-forget in the first place (**OQ-4**, T-08-13). Buying an ordering guarantee with a hang is not a trade this phase will make. **What genuinely improved, recorded alongside:** the reaper plans 08-06/08-07 shipped identifies its target by the target's **own argv** rather than by anything on disk, so unlike `killTree` it is **INSENSITIVE to losing that race** — `pgrep -f` matches the command line the kernel recorded, not a path that must still resolve. Statement order is still enforced, and now enforced for the reap as well as for the kill | **Phase 9** — if the `caido:plugin` vitest alias lands, `index.ts` becomes importable and the completion order becomes assertable rather than merely orderable | **six2dez** (recorded decision OQ-4; accepted at 08-10 planning against `08-VERIFICATION.md`'s `coincidental_reliance_items` option list) | 2026-08-27 |
| **AR-06** | T-08-47 | **Registration hygiene — a token-bearing MCP registration Drift cannot withdraw.** Drift's `mcp add drift` registration persists in the CLI's **own** configuration, and **any instance of that CLI on the machine can launch Drift's MCP server on its own initiative, with a live `CAIDO_TOKEN`**, without Drift spawning it, tracking it or holding a handle on it. This is the route UAT gap **G-04** arrived by: pid 44284 alive with `activeSessions: 0`, parented by a `codex` binary at a path Drift never registered. **Live same-family evidence in the same diagnostics:** `mcpCliRemovalFailures: gemini: 2 failed (scope=user exit=127, scope=project exit=127)` — Drift attempted to withdraw a token-bearing registration it had itself created, at both scopes, and **could not**. The user-facing remediation, recorded because it is the only one available today: run `gemini mcp remove --scope user drift` and `gemini mcp remove --scope project drift` by hand | **Explicitly OUT of scope for Phase 8 per recorded decision GD-02**, which fixes G-04 at the *process* layer (the argv-marker reap) and deliberately does **not** touch the *registration* layer. Whether Drift's registered MCP config should be usable by CLI instances Drift did not spawn is a product decision with a blast radius of its own, and it needs its own `/gsd-discuss-phase` rather than a task appended to a lifecycle phase | **A future registration-focused phase, entered through `/gsd-discuss-phase`.** Not assigned to an existing phase, because assigning it would imply the decision had been made | **six2dez (recorded decision GD-02)** | 2026-08-27 |
| **AR-07** | T-08-50 | **The multi-session cancel window.** Plan 08-07's reap is **idle-gated**: `shouldReapSessionOrphans` opens only when `activeProcesses.size` and `mcpDirectCallDepth` are both exactly zero. So **while a second session is live, cancelling one leaves its token-bearing MCP child to the group path — the path UAT measured FALSE (A6)** — and the orphan survives, holding a valid `CAIDO_TOKEN`, until the last session closes and the idle reap fires. **The bound, stated so this is not read as indefinite:** the reap DOES fire at the last close, so the window is the multi-session period, not forever. This residual previously existed **only in plan 08-07's prose**, where no verifier or executor would find it; it is recorded here for that reason | **This is a SCOPE decision, not a constraint, and the distinction is load-bearing.** A session-precise reap needs a **per-chat argv marker**. Drift **CAN** author one for `claude-cli` and `copilot-cli` — it writes their `args` array itself, via `buildMcpServerSpec` → `toMcpConfigDocument` → the per-chat config at `index.ts:3960`/`:4009`. It **CANNOT** for `gemini-cli`/`codex-cli`, which share one `mcp add drift` registration with no per-chat argv to mark. Closing this therefore means shipping **two mechanisms, not one**, which is a plan of its own rather than a half-built arm here. **Do not record this as "argv cannot distinguish sessions" — that claim is false for two of the four providers, and one of them is the maintainer's active provider** | **A future phase**, alongside AR-06's registration work, since the `gemini`/`codex` half of the problem *is* the shared-registration problem | **six2dez** (recorded decision GD-02 scope boundary; threat T-08-50 disposition `accept`, plan 08-07) | 2026-08-27 |
| **AR-08** | T-08-43 | **POSIX file modes are ignored on Windows.** Plan 08-09 put an explicit `0o600` on all five MCP temp-directory writes, unconditionally and with no platform guard (the standing T-04-30 house rule: LLRT's `set_mode` is a total no-op off unix and Node ignores `mode` on Windows, so a guard would double the branch count for zero behaviour change while risking a POSIX regression). **On Windows those modes therefore contribute nothing.** Mirrored here from the source, where plan 08-09 recorded it, so the register is the single place a reader can enumerate this phase's residuals | The Windows-appropriate equivalent is a per-user ACL, which Drift cannot set without Win32 API calls neither Caido's LLRT nor Node exposes without a native addon — the same QuickJS constraint that blocks AR-01's Job Object. **The accepted trade-off, stated:** `os.tmpdir()` on Windows resolves beneath the user's profile, a directory Windows already ACLs to that user, so the protection exists — it is provided by the OS rather than by Drift, and Drift cannot verify it | **ROADMAP Phase 10** — alongside the Windows real-machine confirmation, which is the only place the effective ACL could be observed | **six2dez** (accepted at plan 08-09 and recorded at the source; mirrored here 2026-08-27) | 2026-08-27 |
| **AR-09** | T-08-23 (amended) | **A pid reused inside the freshness budget is still signalled.** The orphan reap enumerates with `pgrep` and signals with a separate `kill` spawn, so there is an interval in which the OS can reassign a matched pid to an unrelated process — which then receives `SIGKILL` with no recourse. Review WR-03 bounded that interval on the wall clock (`scan-stale`, and see § *T-08-23 / T-08-24 — the window between enumeration and signal*), which removes the **unbounded** case: a scan settled after a starved event loop no longer kills on stale numbers. **Inside** the bound — the caller's scan timeout — the hazard is unchanged and is accepted | **Both available closures cost more than they buy, and both were priced rather than dismissed.** `pkill -f` closes the window but signals at kill time rather than from the frozen list, so it would kill the MCP child of a turn started during the gap (**T-08-27**, a likelier harm than the reuse it removes). A `ps` identity re-check adds a second child-process `close` delivery per orphan on a runtime whose delivery of the *first* one is an unrun-verify residual, raising the chance the orphan is never signalled — **LIF-02**, the reported bug itself. Closing this properly needs a primitive that matches and signals atomically **against a frozen candidate list**, which neither base utility provides | **A future phase**, alongside AR-04's Windows enumerator question — both are "what primitive enumerates and signals" problems | **six2dez** (accepted at the WR-03 fix, 2026-08-27) | 2026-08-27 |
| **AR-10** | T-08-54 | **The verdict gate can disclose repository-relative paths and match counts in a failure diagnostic.** It never prints a matched line, token, pid, environment value, or absolute path, but a pasted failure still reveals the relative document name | Removing paths would make a cross-carrier failure unactionable and would weaken the fail-closed correction control; the bounded names are already part of the repository | Re-review if gate output ever includes source content or absolute paths | **six2dez** (risk acceptance for T-08-54) | 2026-08-31 |
| **AR-11** | T-08-59 | **`formatSpikeVerdict` exposes a state word and one closed-union reason token.** Those scalars reveal whether the local diagnostic classified a process as alive, dead, or inconclusive, but carry no pid, path, token, or free prose | The two scalars are the evidence product the diagnostic exists to record; removing them would make the result unusable, while widening them would violate the confidentiality test | Re-review if the reason type stops being a closed union | **six2dez** (risk acceptance for T-08-59) | 2026-08-31 |
| **AR-12** | T-08-68 | **A locally installed patched probe build ran with Drift/Caido privileges and spawned diagnostic child processes.** The run was maintainer-driven, based on committed inputs, restored to HEAD, never signed, and never released | Obtaining the repaired LLRT reading required executing the probe in the actual Caido runtime; CI cannot substitute for that runtime boundary | No continuing owner: the probe remains patch-only and `verify-a1-patch.sh` must keep it out of HEAD | **six2dez** (risk acceptance for T-08-68) | 2026-08-31 |
| **AR-13** | T-08-73 | **The one-off diagnostic build bypassed the signed release pipeline when installed locally.** Its provenance was bounded by committed base `68199fa`, committed patch, current verifier, and explicit teardown; it was not distributed | The Caido runtime measurement cannot be obtained from a signed store build without shipping diagnostic code to users, a larger and less reversible exposure | Re-open only if an unsigned diagnostic artifact is published or left installed | **six2dez** (risk acceptance for T-08-73) | 2026-08-31 |

<!-- DRIFT:AR-05-COMPLETION-CORRECTION:BEGIN -->
**CURRENT AR-05 narrowing (re-verified 2026-09-02 at `9aa22bbd4c26fecabc17745438a2217a24b31d3e`):**
The original AR-05 rationale above remains accepted, but its current boundary is narrower.
`415ae7e` protects only `cleanupMcpRuntimeGeneration`'s recursive generation-root removal — the
session-finalize / `stopMcpServer` behavior ROADMAP SC-4 scores. For every tracked session, observed
provider exit and tree-killer settlement feed the callback barrier; the generation-scoped orphan
reap is a separate prerequisite, including settlement of any orphan killers it launches. Only the
barrier's `ready` disposition starts recursive removal. Error, stale reap, orphan-killer failure, or
completion timeout retains the token-bearing root and blocks replacement Start. The frontend now
pumps the closed cleanup state until that callback barrier reaches a terminal state; a real-Caido
fixture forced the reap arm and observed `kind=reap exit=0 attempted=1 ageMs=109`, fixture death,
and only then removal of the captured runtime root. A tree-killer
`close` event is treated as settlement regardless of its exit code; provider exit and POSIX
orphan-reap success are independent prerequisites, so this is not native-Windows termination proof.

What remains accepted under AR-05 is mechanically separate. `closeCliSession` and `deleteChat`
still issue `killTree` and the idle reap before fire-and-forget removal of their per-session
activity/approval files, without observing kill/reap completion. `sweepOrphanedMcpTempDirs` still
issues the class-wide reap before recursively removing stale roots, without observing scan or kill
completion. The favorable completion harness does not exercise those three residual paths. AR-05
therefore remains current and all 13 accepted residual decisions remain; this residual does not
re-open LIF-01/LIF-02's narrower cancel/timeout and session-finalize contract.
<!-- DRIFT:AR-05-COMPLETION-CORRECTION:END -->

---

## What this phase's evidence does not cover

`08-VALIDATION.md` § *Vehicle caveat* is the standing list. The current boundary below incorporates
the 2026-09-02 Windows CI and real-Caido reap acquisition without widening either result.

1. It will not prove `index.ts`'s wiring — no test executes `cancelCliMessage`, `closeCliSession`,
   `cleanupMcpRuntime` or the timeout handler. **CORRECTED 2026-09-01:** the production-wired
   completion-order harness now executes the session-finalize / `stopMcpServer` generation cleanup
   and observes its recursive removal boundary. It does not execute `closeCliSession`, `deleteChat`,
   or the startup sweep. **CORRECTED AGAIN 2026-09-01 at `174c0b6`:** bounded real-Caido Codex
   runs now execute both cancel and absolute timeout with an external process watcher. They prove
   the product-level causal zero-survivor outcome on the measured POSIX provider; they do not prove
   which internal mechanism removed the MCP child. The child occupied a different process group,
   and `lastOrphanReap` observed exit 1/no match, so neither group-kill reach nor a reap signal is
   inferred from that result. **CORRECTED 2026-09-02:** a separate marker-matching fixture forced
   the shipping reap arm in real Caido and produced `kind=reap exit=0 attempted=1 ageMs=109`; the
   fixture was dead and the runtime root absent after Stop. This supplies mechanism-specific reap
   causality for the two-mechanism POSIX contract without rewriting the earlier Codex observation.
2. It will not prove Caido's LLRT — `detached` and `process.kill`'s `u32` typing are source-verified
   and never executed. **CORRECTED 2026-08-27: the `detached` half IS now proven on the shipped
   runtime by measurement (A1); the `u32`-typing half is not, and is moot because the sandbox
   exposes no `process.kill` at all.** *(Superseded 2026-08-24 clause: "**A1 and A6 were added to
   this list by Phase 8, and were not closed.**")*
3. It will not prove that any real CLI's MCP child is in the killed group — **CORRECTED
   2026-08-27: no longer an absence. A6 was measured by hand outside CI and came back FALSE**
   (codex pid 43921 / pgid 43752; `mcp-server.mjs` pid 44284 / pgid 44284). It remains untested
   *in CI*, by construction, and untested for Claude Code on any vehicle. *(Superseded 2026-08-24
   clause: "A6 is untested by construction.")*
4. **CORRECTED 2026-09-02:** native Windows CI executed the exact two-case suite: two passed, zero
   pending, including live parent/grandchild termination through the production argv and absolute
   resolution to `C:\Windows\System32\taskkill.exe`. This proves the owned live-tree path; it does
   not claim a full Caido-on-Windows provider turn or close AR-01/AR-04.
5. It will not prove the `/T` residual is bounded in practice — AR-01.

### Closed acquisitions and remaining residual boundaries

- **Native Windows acquisition closed:** CI run
  `https://github.com/six2dez/drift/actions/runs/33599694679`, candidate
  `9aa22bbd4c26fecabc17745438a2217a24b31d3e`, executed the exact safe 2/2 contract. The full Windows
  job passed 812 tests with six POSIX skips; the dedicated gate confirmed both expected cases ran,
  including behavioral tree termination. The separately removed dead-pid exit/stderr vehicle stays
  intentionally absent because pid reuse made that proposed measurement unsafe.
- **POSIX mechanism acquisition closed:** the locally installed candidate in Caido 0.58.2 reaped a
  bounded, token-free, separately grouped process carrying the active runtime marker. Stop yielded
  `kind=reap exit=0 attempted=1 ageMs=109`; the target died, marker matches fell to zero, and the
  runtime directory was removed. The completion-order harness independently forces adverse callback
  ordering and observes all three prerequisites before recursive removal.
- **Residuals remain residuals:** AR-01's exited-intermediate Windows hole and AR-04's foreign-parented
  Windows orphan class are not exercised by the owned live-tree suite. They remain accepted and do
  not negate LIF-01's stated owned-tree guarantee.

---

## Final package-head delta audit (2026-09-02)

The prior package boundary was `174c0b6eab9bbc68022d5e2348b76908c0a7a5d7`; the current package
boundary is `9aa22bbd4c26fecabc17745438a2217a24b31d3e`. Git reports exactly two
package-changing commits and no dependency-graph or lockfile change:

| Package commit | Paths inspected | Security conclusion |
|----------------|-----------------|---------------------|
| `92735ec4cb2f25d5885e747ab5d5900336aaf50d` | Backend/shared cleanup-state plumbing, frontend Settings store, and focused tests | Exposes only the closed cleanup-state union and pumps `getMcpStatus` every 100 ms until idle, failed-closed, or the existing bounded timeout. It does not log or transport the token, spawn a new privileged process, weaken stale-pid refusal, or broaden the cleanup authorization. This strengthens already allocated T-08-01/T-08-12/T-08-13 and the bounded scalar diagnostic control T-08-75; no new threat identifier is needed. |
| `9aa22bbd4c26fecabc17745438a2217a24b31d3e` | `package.json`, `caido.config.ts`, `CHANGELOG.md`, `packages/backend/assets/mcp-server.mjs` | Changes release and advertised MCP versions from 0.1.0 to 0.2.0 and records the release notes. It changes no command, environment, permission, dependency, or token behavior. |

The production-wired completion-order oracle is separate from the new real-Caido measurements.
The oracle controls an adverse schedule and proves that recursive removal observes all three
completion flags. The measured Codex cancellation ties provider/MCP disappearance to the Stop
action from a clean baseline; the measured timeout ties disappearance and the UI timeout state to
the pumped 10-second deadline, long before the requested 60-second work could complete. This is
product-level causality. That observation did not claim the argv-marker reap sent a signal: its diagnostic was
the current no-match spelling (`kind=noop reason=scan-failed exit=1 attempted=0`), and the observed
MCP child was outside the provider's process group. The later marker fixture independently forced
that arm and recorded `kind=reap exit=0 attempted=1 ageMs=109`, target death, and runtime-root
removal. Native Windows CI independently executed the owned live-tree path 2/2.

The standing gate separately proves that `audited_at_head` is the latest package-changing commit
and that tree `d90d3e9552d11533f91d35122bcb89f1032b0376`, SHA-256 census
`d28734feecddd8fd381fbfe0f4fbb95d79b22549a0a1d0de20803e66f6ad16e2`, 64-commit census, and
zero post-audit package commits agree. Planning-only commits after it do not invalidate the package
boundary; any package commit does.

### Preserved earlier audit boundaries

The `174c0b6` re-audit remains historical evidence: one package-changing commit after `415ae7e`,
four backend source/test paths, 73 insertions, 47 deletions, and no dependency-manifest change.
Its Codex launch and absolute-timeout conclusions remain intact.

The `415ae7e` re-audit remains historical evidence: one package-changing commit after `12a7136`,
four backend source/test paths, 443 insertions, 39 deletions, and no dependency-manifest change.
Its generation-root completion-barrier conclusion and AR-05 narrowing remain intact.

The preceding `318fe24a..12a7136` re-audit remains historical evidence: 29 package-changing
commits, 19 changed backend source/test paths, 2,861 insertions, 515 deletions, and no dependency
manifest change. Its final boundary, tree, and digest are superseded only as the *current* package
identity; its allocations T-08-89…T-08-94 and conclusions remain intact.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-24 (register roll-up at `1f3b486`) | 21 | 20 | 1 (T-08-01, high — pending the T-08-14 real-hardware confirmation) | plan 08-05 T-08-13 |
| 2026-08-24 (T-08-14 close at `d2d502b`) | 21 | **21** | **0** — T-08-01 closed by maintainer **attestation** (counts not captured; confounder unexcluded — see § *T-08-01 — closed by attestation*) | plan 08-05 T-08-14 |
| 2026-08-27 (gap-closure roll-up) | **51** (+30 from plans 08-06…08-10) | **51** | **0 open**, and **1 accepted `high`** — T-08-47 / AR-06, decider **six2dez** per recorded decision **GD-02**. Called out rather than inferred from the zero, because `block_on: high`. T-08-03 **re-rated** medium → high on a measured empty environment and mitigated by 08-08's derived system root | plan 08-10 |
| 2026-08-31 (current-head re-audit at `318fe24a`) | **89** (88 numeric + T-08-SC) | **89** | **0 open; 13 accepted residuals**, including accepted `high` T-08-47 / AR-06 with decider **six2dez**. Current package tree `1250a4c4`, SHA-256 census `5116876f…`, 31 package commits since `d2d502b`, zero after the audit boundary | plan 08-19 |
| 2026-08-31 (final package-head re-audit at `12a7136`) | **95** (94 numeric + T-08-SC) | **95** | **0 open; 13 accepted residuals**, including accepted `high` T-08-47 / AR-06 with decider **six2dez**. Package tree `67ece25a`, SHA-256 census `df578b95…`, 60 package commits since `d2d502b`, 29 inspected after the prior audit, zero after the final boundary | plan 08-23 |
| 2026-09-01 (post-fix package-head re-audit at `415ae7e`) | **95** (94 numeric + T-08-SC) | **95** | **0 open; 13 accepted residuals**. Package tree `8ec7d8d8`, SHA-256 census `d4041340…`, 61 package commits since `d2d502b`, the one post-`12a7136` package commit inspected, and zero after the current boundary. ROADMAP SC-4's generation-root path is protected; AR-05 remains current for close/delete/startup removals | quick 260901-l8h |
| 2026-09-01 (Codex lifecycle package-head re-audit at `174c0b6`) | **95** (94 numeric + T-08-SC) | **95** | **0 open; 13 accepted residuals**. Package tree `1d12c91f`, SHA-256 census `ca4f8ae4…`, 62 package commits since `d2d502b`, the one post-`415ae7e` package commit inspected, and zero after the current boundary. Real-Caido cancel/timeout is product-causal on measured Codex; mechanism-specific attribution and native Windows remain open | GSD debug continuation |
| 2026-09-02 (release-candidate re-audit at `9aa22bb`) | **95** (94 numeric + T-08-SC) | **95** | **0 open; 13 accepted residuals**. Package tree `d90d3e95`, SHA-256 census `d28734fe…`, 64 package commits since `d2d502b`, both post-`174c0b6` package commits inspected, and zero after the current boundary. Real-Caido marker reap and native Windows 2/2 close the remaining Phase 8 acquisitions without changing AR-01/AR-04 | GSD debug release-readiness closure |

**Note on this phase's dominant defect class**, recorded because it recurred across three plans: a
**control that is green for the wrong reason**. The LLRT trap itself (green on every CI vehicle,
broken on the shipped runtime); the seeded LLRT-trap gate (red against its own documentation, so it
would have been deleted); `functionBody`'s naive form (a 19-character "body" under which every
ordering assertion passes vacuously); and the two win32 gate steps (mutually satisfiable until
measured by deleting each in turn). Every instance was caught by asking *what would make this pass
if the mechanism were absent* — never by the gate itself.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept)
- [x] Accepted risks documented in the Accepted Risks Log with a reason, a blocker and an owner
- [x] Every threat rated `high` carries disposition `mitigate`, a non-empty mitigation, and a closed
      current status; the gate now derives that condition across all 94 numeric rows — **with ONE
      deliberate exception recorded 2026-08-27:**
      T-08-47 is a `high` with disposition `accept` (AR-06), carrying a named decider
      (`six2dez (recorded decision GD-02)`) rather than an owner alone. Stated as an exception
      instead of being absorbed into the checkbox, because `block_on: high` makes a silent
      accepted high the exact failure this line exists to catch.**
- [x] AR-01 exists — `packages/backend/src/index.ts` and `kill-tree.win32.test.ts` both point at it,
      and the pointer now resolves
- [x] OQ-3 recorded as a deferred residual (AR-02) in the security artifact, where the maintainer's
      decision placed it — **RE-EXAMINED 2026-08-27** against its measured instance (G-04) and
      largely closed by plan 08-07's start-up reap; what remains is AR-04 (POSIX-only) and AR-07
      (idle-gated, not continuous)
- [x] **Every accepted residual is enumerable from this one file, with a decider and not merely an
      owner.** AR-01…AR-13, each carrying all seven columns including a non-empty `Accepted By`
      distinct from `Owner next`. AR-10/AR-11 make the two bounded diagnostic-output accepts
      explicit; AR-12/AR-13 preserve the two local probe-build accepts. T-08-47 / AR-06 remains the
      separately visible accepted-high exception
- [x] **The three questions the verifier and the UAT left open are DECIDED in writing, not
      implied:** SC-4's session-finalize / `stopMcpServer` generation-root completion order is now
      protected by the callback barrier, while AR-05 remains current and explicitly narrowed to
      `closeCliSession`, `deleteChat`, and the startup sweep; the win32 orphan class (AR-04 — three enumerator candidates rejected with reasons),
      and G-02 (§ *G-02 — recorded, not fixed* — recorded, no code change, stale prediction
      retired). AR-07 is added on top, because the multi-session cancel window existed in plan
      08-07's prose only and no verifier would have found it there
- [x] `threats_open` reaches **0** — T-08-01 closed 2026-08-24 by the T-08-14 real-hardware
      confirmation. **Qualified:** the closer is a maintainer *attestation*, not a recorded
      measurement — no counts were captured and the timeout path was not exercised at that closure.
      The `174c0b6` addendum records Codex cancel and timeout outcomes, and the 2026-09-02 fixture
      records an actual marker-reap signal and completion-before-removal outcome. Read
      § *T-08-01 — closed by attestation*
      before treating the original zero as equivalent to Phase 7's
- [~] A1 and A6 closed as mechanism claims — **PARTIALLY REACHED, CORRECTED 2026-08-31.** The
      repaired three-valued A1 probe produced the favourable outcome; the invalid 2026-08-27
      reading remains explicitly RETRACTED and is not rehabilitated. The pre-fix Control also
      produced zero survivors, so the favourable A1 outcome does **not** establish that Drift's
      group kill, rather than provider cleanup, caused it. A6 remains provider-split (Claude true,
      codex false). The 2026-09-01 Codex runs establish product-level cancel/timeout causality but
      do not attribute the MCP child's death to one mechanism. The separate 2026-09-02 fixture does
      establish the marker-reap arm, and native Windows CI establishes the owned live-tree arm 2/2.
      The exact
      current-plus-retraction record is bounded by `DRIFT:A1-CORRECTION`; the gate treats it as one
      inseparable record.

      > *Superseded 2026-08-28 sign-off (preserved, not deleted):* "A1 is RETRACTED and unmeasured;
      > A6 is measured and falsified for one provider (codex), with Claude Code unmeasured and the
      > Control not taken."

      > *Superseded 2026-08-27 line:* "- [~] A1 and A6 closed as mechanism claims — **PARTIALLY
      > REACHED, 2026-08-27.** A1 is **closed favourably by measurement**; A6 is **measured and
      > FALSIFIED** for one provider (codex), with Claude Code still unmeasured and the Control
      > still not taken. Ledger entry **11** is rewritten to the measured state rather than
      > closed. `08-SPIKE.md` holds both readings and the remaining procedure."
      >
      > *Superseded 2026-08-24 line:* "- [ ] A1 and A6 closed as mechanism claims — **not reached,
      > and not touched by the T-08-14 reading.** Ledger entry **11** stays open; `08-SPIKE.md`
      > holds the runnable procedure"
- [ ] The `windows-latest` leg has executed — **not reached.** Ledger entry **12** stays open; two
      rows in `08-VALIDATION.md` are ⚠️ on it
