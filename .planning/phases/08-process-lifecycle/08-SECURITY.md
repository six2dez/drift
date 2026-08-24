---
phase: 8
slug: process-lifecycle
status: secured
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 1
asvs_level: 1
block_on: high
created: 2026-08-24
audited_at_head: 1f3b486
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
`deleteChat` each removed the files that carried that token into the child's environment — while the
child was still alive. Deleting a token-bearing file is **not revocation**: the token is in the
process's memory, not in the file it arrived through. The removal destroyed the forensic trail
(which pid, which session, which policy) and left the capability intact. `cleanupMcpRuntime` killed
**nothing at all**; Phase 7 marked that as a `LIF-01 SEAM` and deliberately left it open.

| Property | Before Phase 8 | After Phase 8 |
|---|---|---|
| POSIX cancel reach | the provider CLI process only | the provider CLI's **whole process group** — `detached: true` at the spawn plus a spawned `kill -TERM -- -<pid>`, then `-KILL` |
| Windows cancel reach | the provider process only | the whole tree — `<SystemRoot>\System32\taskkill.exe /pid <n> /t /f`, resolved by absolute path |
| Termination sites routed through one builder | 0 | **8** call sites, all through `killTree` → `buildKillTreePlan` |
| `cleanupMcpRuntime` | killed nothing | force-kills every `activeProcesses` entry **before** the sweep |
| Kill-before-removal ordering | violated at 3 sites | asserted at all 3 by a statement-position gate on every CI leg |
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

21 distinct rows across five plans (`(NN)` names the plan(s) the row was authored in). Severity and
disposition as authored at plan time.

| Threat ID | Category | Component | Sev | Disposition | Mitigation (verified) | Status |
|---|---|---|---|---|---|---|
| **T-08-01** (02/03/05) | InfoDisc → EoP | the orphaned `mcp-server.mjs` child holding `CAIDO_TOKEN` after a cancel | **high** | mitigate | `detached: true` on the provider spawn + the group-kill spawn in `killTree`, wired at all 8 in-scope sites; proven behaviourally by `kill-tree.posix.test.ts`'s control-plus-proof pair (the control asserts the grandchild **surviving** without the mechanism, and was verified falsifiable by hand) | **open** — see note below |
| **T-08-02** (02/04) | Tampering / EoP | the pid rendered into the killer's argv | medium | mitigate | `buildKillTreePlan` owns both the guard (`Number.isInteger` && `> 0`) and the rendering; `index.ts` passes `proc.pid` through untouched and switches on `plan.kind`. 5 bad-pid inputs asserted (`undefined`, `NaN`, `0`, `-1`, `1.5`). Every argv in the win32 suite comes from the production builder — `grep -c '"/pid"'` in that file = **0** | closed |
| **T-08-03** (02/04) | Spoofing / EoP | resolution of `taskkill.exe` | medium | mitigate | Resolved as `<SystemRoot>\System32\taskkill.exe` by absolute path (both env casings, trailing separators stripped, bare-drive roots), per the shipped `getWhichCommand` precedent; bare name only when neither casing is set. Never `shell: true` | closed (unit); the runner-side measurement (A7) is unrun |
| **T-08-04** (02/03) | DoS | the deferred rungs in `cancelCliMessage` and `requestGracefulShutdown` | medium | mitigate | Pid captured into a `const` **before** the timer is scheduled, plus an `isPidAlive` re-check inside the callback (`isPidAlive(` = 3: declaration + both rungs). The guard runs **before** its debug-log line, so the log cannot claim a signal that was never sent. On Windows the argv is `/t /f`, so acting on a reassigned pid would take an unrelated process's entire tree | closed |
| **T-08-05** (01/02) | InfoDisc | `killTree`'s and the spike's log lines | medium | mitigate | Value-free by construction: plan `kind`/`reason`, exit code, platform. The `error` handler renders the errno **`code`**, never `error.message` — a Node spawn error message embeds the resolved file path. Follows `formatMcpRemoveFailure`'s "three scalars" precedent | closed |
| **T-08-06** (01/02/05) | Repudiation (a security control that fails green) | the group-signalling spelling, and ROADMAP SC-2's unamended mechanism clause | **high** | mitigate | Two halves. **Code:** the comment-stripped static gate in `index.source.test.ts` over `index.ts` **and** `kill-plan.ts`, with a positive companion so it cannot pass by the mechanism having been deleted; verified falsifiable in three directions. The banned form passes on all five CI legs and throws only under Caido's LLRT, so no executed test can catch it. **Intent:** T-08-12 amended SC-2 in place with the shipped mechanism, the source-verified `Underflow` reason and the pinned commit `a5b021c`. The gate stops the code; the amendment stops the intent | closed |
| **T-08-07** (04/05) | InfoDisc | `/T`'s dead-intermediate-parent hole on the three-level `.cmd` shape | low | **accept** | Not mitigable without a Windows Job Object — see **AR-01** | closed (accepted) |
| **T-08-08** (05) | InfoDisc | a hard-killed Caido's surviving MCP orphan (OQ-3) | medium | **accept** | Deliberately out of scope; recorded as a residual, not planned as a task — see **AR-02** | closed (accepted) |
| **T-08-09** (01) | DoS | the spike's fixture parent + grandchild | low | mitigate | Both fixtures self-exit after 30 s and both captured pids are signalled individually on every path including the inconclusive and error arms. Moot in the shipped tree: the probe was removed at `d8ccab8` | closed |
| **T-08-10** (01) | Tampering | temporary diagnostics code surviving into the shipped tree | medium | mitigate | Two ASCII marker lines fenced the section; T-08-03's criteria greped **0** occurrences of every temporary symbol (`runLifecycleSpike`, `SPIKE_*`, `spike*`, `SpawnDetached`) and a 4-insertion net diff. `index.ts` is byte-equivalent to pre-spike apart from a 3-line breadcrumb | closed |
| **T-08-11** (02) | DoS | `detached: true` reaching Drift-owned leaf spawns | medium | mitigate | `detached` is a **required** member of `SpawnWithEnv`, so the compiler forces all three call sites to state an answer; a source assertion pins that exactly one says `true`. A leaf spawn that escaped Drift's group would survive Drift's own exit | closed |
| **T-08-12** (03) | InfoDisc → EoP | the `startMcpServer` failure path reaching `cleanupMcpRuntime` | **high** | mitigate | The kill loop lives in `cleanupMcpRuntime` itself rather than at the Stop button, so the failure path is covered by the same fix. Named explicitly so a later narrowing to the user-facing path is visibly a regression | closed |
| **T-08-13** (03) | DoS | an awaited kill inside teardown | medium | mitigate | `spawnAndWait` has no timer, so a stuck killer would hold the promise forever and cleanup would never complete. `killTree` returns `void`; `grep -c 'await killTree'` = **0** | closed |
| **T-08-14** (03) | Repudiation | a silently-deleted `LIF-01` marker — either of the two Phase 7 left | low | mitigate | Both seams resolved, neither deleted. Measured: `LIF-01 SEAM` = **0** (baseline 2), `NOT acted on` = **0** (baseline 2), `LIF-01` = **8** (floor 5), `ParentProcessId` = **1**, `AR-01` = **1** (both baseline 0). A deletion without a resolution fails the floor; a resolution without the mechanism named fails the two literals | closed |
| **T-08-15** (04) | Repudiation (false-green evidence) | the `windows-latest` leg | **high** | mitigate | The `--reporter=json` gate step with three independent arms (`pending > 0`, `total === 0`, `passed !== total`), an every-platform gate test that the step still exists and points at a real, still-gated file, and the D-P2 distinct anchors. Measured bidirectionally by deleting each step in turn: with Phase 8's step deleted, the three-arm case stayed **GREEN** on Phase 7's step alone — which is the measurement proving the collision was real and the distinct anchors are what close it | closed (control shipped and proven falsifiable; **never fired on a runner** — see § *Evidence gaps*) |
| **T-08-16** (04) | DoS | branching on an undocumented vendor exit code | medium | mitigate | D-P4b: record, never assert, never branch. The only assertion is `typeof code === "number"`, made genuinely falsifiable by typing `RunResult.code` as `number \| null`. `grep -cE 'expect\([^)]*code[^)]*\)\.toBe\([0-9]'` = **0** — this half is proven statically on every platform, which is what assumption A2's low rating actually depends on | closed |
| **T-08-17** (04) | DoS | leaked fixture processes on a shared runner | low | mitigate | Every fixture idles for a bounded 20 s and self-exits; `tempDirs` removed in `afterEach`; stray pids force-killed there too; every case carries the shared 15 s `SPAWN_TIMEOUT_MS` | closed |
| **T-08-18** (05) | Repudiation | a documentation row added only to `CLAUDE.md` | low | mitigate | T-08-12 edited **both** `CLAUDE.md` and its generation source `.planning/codebase/CONVENTIONS.md`; `grep -c 'kill-plan.ts'` = 1 in each is an acceptance criterion. A row added only to the rendered copy is silently reverted on the next regeneration | closed |
| **T-08-19** (05) | Repudiation | a `{pending}` validation row silently overwritten with a wrong seed | medium | mitigate | Four seed corrections recorded as **corrections** in a named section (`08-VALIDATION.md` § *Corrections to the seed*), per the `07-VALIDATION.md` convention. `nyquist_compliant` is set from the actual row statuses, so a `validated` document with unmet rows is distinguishable from a compliant one | closed |
| **T-08-20** (05) | InfoDisc | no real revocation available | medium | **accept** | Killing the process removes the capability from that process; invalidating the credential would require rotating the Caido session token, which Drift cannot do — see **AR-03** | closed (accepted) |
| **T-08-SC** (×5) | Tampering | npm/pip/cargo installs | n/a | accept | **This phase installs zero packages.** `08-RESEARCH.md` § *Package Legitimacy Audit* is present and empty ("audited, empty", not "skipped"). `git diff` over `package.json` / `pnpm-lock.yaml` across the phase is empty. If a later plan proposes a dependency (e.g. `tree-kill`), the gate must be run at that point | closed |

*Status: open · closed · closed (accepted) — an accepted residual is recorded in the Accepted Risks
Log below, never silently closed.*

### Why `threats_open: 1` — T-08-01

T-08-01 is the threat this phase exists to close, and its mitigation is fully implemented and
proven **under Node**. It is nonetheless recorded **open**, because the POSIX arm's correctness on
the runtime users actually run rests on two assumptions that were never measured:

- **A1 — OPEN, not measured.** Whether the shipped Caido LLRT honours the process-group spawn option.
  It rests entirely on source analysis of `caido/dependency-llrt@caido` at the pinned commit
  `a5b021c`, and on nothing that was ever executed.
- **A6 — OPEN, not measured.** Whether a real provider CLI keeps its MCP child inside its own group.
  If any CLI calls `setsid()` on that child, the group signal misses it.

The Wave-0 spike existed to close both on the maintainer's own hardware for the cost of one build.
It was built, type-checked, linted and bundled — then the hardware checkpoint was **waived on
2026-08-24 without readings**, a recorded maintainer decision (`08-SPIKE.md`).

**The consequence, stated plainly.** Plan 08-03 took the number of sites depending on A1 from **two
to nine**. If the shipped LLRT does not honour the option, the group operand names a group that was
never created — a **nine-site POSIX regression** — and **every CI leg stays green through it**,
because every leg runs Node and Node honours the option. That is Phase 5 finding L-4 recurring
verbatim: green CI is not evidence about a runtime CI never exercises.

**The only mitigation is OQ-2's single-pid rung**, which fires first inside `killTree` at all nine
sites, with a source comment naming A1 as the reason and instructing future readers not to delete
it (`proc.kill(` = 3 in the census, deliberately). It **degrades a total regression into the partial
one shipping today; it does not prevent one.**

T-08-01 closes when the real-hardware confirmation is taken — plan 08-05 **T-08-14**, whose result is
recorded in `08-05-SUMMARY.md`. Broken-windows ledger entry **11** (`unmet-truth`).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Not mitigable here because | Owner next | Accepted By | Date |
|---------|------------|-----------|---------------------------|-----------|-------------|------|
| **AR-01** | T-08-07 | **`taskkill /T` cannot reach a grandchild whose intermediate parent has already exited.** On the three-level Windows `.cmd` shape (`cmd.exe` → provider → `node mcp-server.mjs`), the tree switch walks the `ParentProcessId` relation recursively; if `cmd.exe` has exited, the walk finds nothing and the token-bearing `node` process survives. Referenced **from the source** at `sendCliMessage`'s provider-spawn resolution note and from `kill-tree.win32.test.ts` case 1, which deliberately keeps the intermediate alive. **Mitigating facts:** `cmd.exe /c` normally waits for its child, so the window is narrow; and Phase 6 already prefers `.exe` over `.cmd` (RES-02), which removes the level entirely wherever a native install exists. Tagged `ASSUMED — community/issue-tracker evidence only` at the site (assumption A3); if A3 is wrong the residual is *smaller* than recorded, an error in the safe direction | The correct primitive is a Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, which requires Win32 API calls neither Caido's LLRT nor Node exposes without a native addon — banned by the QuickJS runtime constraint (`CLAUDE.md` § *Backend Constraints*) | **ROADMAP Phase 10 SC-5** — the real-machine Windows confirmation is the only place this could be observed. Nothing in CI reaches it | six2dez (via phase plan) | 2026-08-24 |
| **AR-02** | T-08-08 | **A hard-killed Caido leaves an MCP orphan that no start-up sweep touches** (OQ-3). `sweepOrphanedMcpTempDirs` removes residue **directories**, never processes. A token-bearing `mcp-server.mjs` from a previous run therefore survives indefinitely — with its context file deleted underneath it, so the forensic trail is gone while the bearer token in its memory stays valid. `mcp-server-spec.ts` already records that a hard-killed Drift is *"the highest-value case the sweep exists for"*, which is exactly why this gap is worth naming rather than leaving as folklore | **Deliberately out of scope for Phase 8.** Identifying "a Drift MCP process from a previous run" requires image-name matching that could terminate an unrelated `node` belonging to the user or to another tool. A blast-radius decision of that kind needs its own `/gsd-discuss-phase`, not a task appended to a lifecycle phase. Recorded as a residual, **not planned as a task** — recorded decision OQ-3 | **A future phase, entered through `/gsd-discuss-phase`.** Not assigned to an existing phase, because assigning it would imply the blast-radius question had been answered | six2dez (recorded decision OQ-3) | 2026-08-24 |
| **AR-03** | T-08-20 | **Real revocation is not available to Drift.** Killing the process removes the capability *from that process*; it does not invalidate the token. Any orphan that escaped every mechanism in this phase — through AR-01's Windows hole, through AR-02's hard-kill path, or through a negative A1 verdict — still holds a **valid bearer token** with the full authority of the logged-in user until the user's Caido session ends. This is the ceiling on everything above: the phase converts "the agent keeps running" into "the agent is stopped", not "the credential is dead" | Invalidating the credential would require **rotating the Caido session token**, which Drift does not own and cannot do. Drift only transports it (ASVS V2: "indirectly — nothing here mints or validates it") | Upstream Caido. Nothing in this milestone can change it; the honest user-facing remediation is to end the Caido session | six2dez (via phase plan) | 2026-08-24 |

---

## What this phase's evidence does not cover

`08-VALIDATION.md` § *Vehicle caveat* is the standing list, and it is referenced here rather than
restated — a restatement is where a caveat gets softened. Its five items, **by reference and unaltered**:

1. It will not prove `index.ts`'s wiring — no test executes `cancelCliMessage`, `closeCliSession`,
   `cleanupMcpRuntime` or the timeout handler.
2. It will not prove Caido's LLRT — `detached` and `process.kill`'s `u32` typing are source-verified
   and never executed. **A1 and A6 were added to this list by Phase 8, and were not closed.**
3. It will not prove that any real CLI's MCP child is in the killed group — A6 is untested by
   construction.
4. It will not prove SC-3 on Windows behaviourally — and in this phase not even the CI job has run.
5. It will not prove the `/T` residual is bounded in practice — AR-01.

### Evidence gaps a security reader must see alongside the residuals

- **The Windows suite has never executed.** Plan 08-04 built the vehicle and took no reading; nothing
  was pushed. The reserved dead-pid exit-code block in `kill-tree.win32.test.ts` is deliberately
  empty, and the `windows-latest` run URL, exit code and stderr line are all unmeasured. Ledger entry
  **12** (`unrun-verify`). This is why T-08-15 reads *closed (control shipped, never fired)* rather
  than simply closed: a false-green gate that has never run has not yet demonstrated it is not itself
  false-green.
- **The FLAGGED LIF-01 edge-probe assumption** (`08-05-PLAN.md` § *Flagged assumptions*). The
  deterministic edge probe could **not classify** LIF-01 — *"On Windows, cancelling or timing out a
  turn terminates the whole process tree, leaving no orphaned token-bearing process"* — into any of
  its shape categories, and an unclassified row is never auto-resolved with a backstop. Concretely:
  which pids `/T` reaches when the tree is three levels deep, what happens when the intermediate
  `cmd.exe` has already exited, and what the vendor's exit codes mean are covered in this phase only
  by what plan 08-04 could **write** for a runner — and no runner has run it. The residual is AR-01.
  **A verifier must not read the three resolved LIF-02 edges as though they also covered LIF-01.**

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-24 (register roll-up at `1f3b486`) | 21 | 20 | 1 (T-08-01, high — pending the T-08-14 real-hardware confirmation) | plan 08-05 T-08-13 |

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
- [x] Every threat rated `high` carries disposition `mitigate` and a non-empty mitigation
      (T-08-01, T-08-06, T-08-12, T-08-15)
- [x] AR-01 exists — `packages/backend/src/index.ts` and `kill-tree.win32.test.ts` both point at it,
      and the pointer now resolves
- [x] OQ-3 recorded as a deferred residual (AR-02) in the security artifact, where the maintainer's
      decision placed it
- [ ] `threats_open: 0` — **not reached.** T-08-01 stays open until the T-08-14 real-hardware
      confirmation is taken; see § *Why `threats_open: 1`*
