---
schema_version: 1
open_count: 12
waived_count: 0
fixed_count: 11
total_count: 23
last_updated: 2026-08-28T12:12:47.559Z
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
| 8 | 06 | unrun-verify | packages/backend/src/index.ts |  | WIN32_PATH_SEARCH_TIMEOUT_MS = 5000 is a headroom estimate, not a measurement; closes on the Phase 9/10 real-machine report | open |  | 2026-08-21T11:55:43.210Z |  |
| 9 | 06 | deviation | packages/backend/src/index.ts |  | CR-01/WR-01 (06-REVIEW): the provider spawn in sendCliMessage and the PATH-search spawn in resolveCommand were unguarded Promise-executor spawns, so a synchronous throw rejected the RPC instead of resolving. CLOSED in Phase 6 per 06-VERIFICATION human item 5: both now carry the same try/catch shape spawnAndWait already had. Provider site publishes spawn_error and cleans up runtimeFiles + the token-bearing mcp-<chatId>.json inline (finalize is in its TDZ at that point); PATH-search site resolves undefined, identical to its untouched error handler. Graceful degradation only - .cmd launchability stays PRV-02/Phase 7. | fixed |  | 2026-08-21T13:16:47.639Z | 2026-08-21T13:17:01.634Z |
| 10 | 06 | deviation | packages/backend/src/command-resolution.ts |  | CR-02 (06-REVIEW): two catalogue rows were non-administrator-writable on default Windows ACLs, and a binary resolved from either is spawned with CAIDO_TOKEN in its environment. CLOSED in Phase 6 per 06-VERIFICATION human item 4, option (a): %ProgramData%\\scoop\\shims dropped entirely; C:\\nvm4w\\nodejs now gated on nvm-windows' own NVM_HOME/NVM_SYMLINK contract via the new pure isNvmWindowsInstalled (platform.ts), threaded in as the injected nvmWindowsInstalled input so the three builders stay I/O-free and never read process.env. Both removals recorded as in-code non-claims naming the token exposure. | fixed |  | 2026-08-21T13:16:56.847Z | 2026-08-21T13:17:01.729Z |
| 11 | 08 | unmet-truth | packages/backend/src/kill-plan.ts |  | MEASURED 2026-08-27 on a real macOS Caido (darwin 25.6.0, probe build 68199fa), superseding the 2026-08-24 entry; CORRECTED 2026-08-28, superseding the A1 half of that 2026-08-27 rewrite. Both superseded texts are preserved verbatim in the marked-correction notes at the end of this file. A1 IS RETRACTED, NOT NARROWED: spikeDetachedGroupKill decided liveness with an optional call on process.kill, a primitive the SAME diagnostics run measured ABSENT (spikeProcessKillType: 'undefined'), so the optional chain yielded undefined, '?? false' forced alive === false, and the reading 'grandchild-died (detached honoured)' was emitted UNCONDITIONALLY. The red input did not exist, so that reading carries no information about whether the grandchild died. CONSEQUENCE FOR THIS ENTRY, STATED PLAINLY RATHER THAN LEFT IN A MIDDLE STATE: the nine-site POSIX regression this entry was opened for is LIVE AGAIN. Whether the shipped LLRT honours the detached spawn is UNMEASURED, and the nine POSIX termination sites rest on unexecuted source analysis exactly as they did on 2026-08-24. A6 is FALSIFIED: codex pid 43921 sat in pgid 43752 while its own mcp-server.mjs child pid 44284 sat in pgid 44284, so a group signal aimed at the CLI's group cannot reach the token-bearing child, and OQ-2's single-pid rung does not help because it signals the CLI rather than the child. That reading was taken by direct ps observation, is NOT withdrawn, and is NOT bundled into the A1 retraction. The phase's answer to the falsification is the argv-marker orphan reap shipped by plans 08-06 and 08-07 - pgrep -f over a session-unique temp-dir marker adjacent to mcp-server.mjs, then a POSITIVE single-pid kill - which identifies its target by the target's own command line and is therefore independent of process groups by construction. WHAT KEEPS THIS ENTRY OPEN: A1 is unmeasured and its 2026-08-27 reading is withdrawn, so the detached-spawn premise under the nine POSIX termination sites is unsupported again; the A6 reading covers ONE provider (Codex), on an instance Drift did not spawn, so Claude Code - the active provider - remains unmeasured; the Control (reading 5) was never taken, so the T-08-14 attestation is still an isolated zero with the CLI-cleanup confounder unexcluded; and the reap itself is covered by no executed assertion (entries 13 and 15). Closes on one Drift-spawned Claude Code turn run through 08-SPIKE.md steps 3 and 4 with the FIXED three-valued liveness determination (classifyLivenessObservation in kill-plan.ts, plan 08-12), which reports inconclusive rather than coalescing an absent primitive into a verdict; the re-run itself is owned by plan 08-17 (probe recoverable at 68199fa). | open | A1 RETRACTED 2026-08-28: the 2026-08-27 reading was emitted unconditionally by a probe whose liveness primitive the same run measured absent, so it narrows nothing and the nine-site POSIX concern this entry was opened for is live again. A6 measured FALSE 2026-08-27 by direct ps observation, for one provider on one build; Claude Code unmeasured and the pre-fix Control never taken. | 2026-08-24T15:24:21.284Z |  |
| 12 | 08 | unrun-verify | packages/backend/src/kill-tree.win32.test.ts |  | The three win32 kill-tree cases have never executed: they are skipIf-gated and no windows-latest run exists for them yet. The reserved dead-pid exit-code block is empty and the run URL is unfilled. | open |  | 2026-08-24T15:54:03.743Z |  |
| 13 | 08 | unrun-verify | packages/backend/src/index.ts |  | reapMcpOrphans and its cleanupMcpRuntime call site are covered by no executed assertion — index.ts cannot be imported under vitest and no static source gate was added (plan rated the truth 'verification: backstop'). NARROWED 2026-08-28 by plan 08-16 and NOT CLOSED; the superseded text is preserved verbatim in the marked-correction note at the end of this file. A real cancel on the maintainer's macOS Caido 0.58.2 (darwin 25.6.0, build 39876b5) produced lastOrphanReap = 'kind=noop reason=scan-failed exit=1 killed=0 ageMs=24'. exit=1 is reachable only through scanner.on('close', code) — both spawnThrew paths and the timeout arm pass exitCode undefined, which formatOrphanReapRecord renders as exit=undefined — so the value proves the cleanupMcpRuntime call site EXECUTED on the shipping runtime and wrote its record. WHAT KEEPS THIS ENTRY OPEN: a runtime observation is not an executed assertion. No test asserts this wiring, index.ts is still not importable under vitest, no static source gate was added, and the reading covers ONE platform and ONE build. An entry narrowed is an entry still open. | open |  | 2026-08-27T12:08:50.726Z |  |
| 14 | 08 | unrun-verify | packages/backend/src/kill-plan.ts |  | MEASURED 2026-08-28 by plan 08-16 on the maintainer's own macOS Caido 0.58.2 (darwin 25.6.0, build 39876b5), superseding the 2026-08-27 text preserved verbatim in the marked-correction note at the end of this file. THE QUESTION THIS ENTRY WAS OPENED FOR IS ANSWERED: Caido's plugin sandbox CAN spawn pgrep, and by BARE NAME (ORPHAN_SCAN_FILE = 'pgrep', kill-plan.ts:546). A cancel produced lastOrphanReap = 'kind=noop reason=scan-failed exit=1 killed=0 ageMs=24'; exit=1 is unreachable on both spawnThrew paths (a synchronous spawn throw and scanner.on('error'), which are classified enumerator-unavailable before the exit-code arm is reached) and on the timeout arm, all three of which pass exitCode undefined and render exit=undefined. The value therefore proves pgrep spawned, executed and exited 1 — its documented no-process-matched — so the orphan reap does NOT degrade silently to the enumerator-unavailable no-op and is NOT inert on the runtime users run. It matched nothing because the primary termination path had already cleaned up; activeSessions was 0 in the same capture. SCOPE, STATED RATHER THAN IMPLIED: macOS only. Linux is unmeasured, and on win32 the scan plan refuses on a different arm before any spawn (unsupported-platform), which stays owned by Phase 9 SC-4. | fixed |  | 2026-08-27T12:08:50.833Z | 2026-08-28T11:50:29.110Z |
| 15 | 08 | unrun-verify | packages/backend/src/index.ts |  | reapMcpOrphans / reapSessionOrphansIfIdle wiring is asserted only by source text. NARROWED 2026-08-28 by plan 08-16 and NOT CLOSED; the superseded text is preserved verbatim in the marked-correction note at the end of this file. The SECOND half of the original entry — whether Caido's LLRT sandbox can spawn pgrep at all — is now MEASURED and answered YES, by bare name, on the maintainer's macOS Caido 0.58.2 (build 39876b5); see entry 14 for the reading and its derivation. Neither reap therefore degrades silently to the enumerator-unavailable no-op on that platform. WHAT KEEPS THIS ENTRY OPEN, unchanged by the reading: the wiring is still asserted only by source text, index.ts is still not importable under vitest, and the IDLE-GATED session reap reapSessionOrphansIfIdle was NOT exercised by the 2026-08-28 reading at all — that reading came from the cleanupMcpRuntime path after a cancel, which is a different call site. An entry narrowed is an entry still open. | open |  | 2026-08-27T12:30:13.421Z |  |
| 16 | 08 | deviation | .planning/phases/08-process-lifecycle/08-07-PLAN.md | 193 | Ninth vacuous gate: Task 1 criterion 'grep -c never processes ... is 0' returned 0 at HEAD before any edit; the quoted sentence lives in 08-05-PLAN.md / 08-RESEARCH.md, never in index.ts | open |  | 2026-08-27T12:30:13.533Z |  |
| 17 | 08 | deviation | packages/backend/src/platform.ts |  | 08-08 Task 1 acceptance criterion 'grep -c process.env platform.ts is 0' is VACUOUS: returns 7 at HEAD before any edit (all seven are comment mentions of the rule the module follows). Intent verified instead by comment-stripped grep = 0, before and after. Tenth vacuous gate in Phase 8. | open |  | 2026-08-27T12:53:54.797Z |  |
| 18 | 08 | deviation | packages/backend/src/index.ts |  | Plan 08-09's exact-count criterion grep -c '0o700' index.ts is comment-sensitive: a 'why' comment mentioning the octal moves it with no behavioural change. Satisfied by rephrasing; executable (comment-stripped) count measured separately at 4 -> 4. Specify over the comment-stripped stream if it recurs. | open |  | 2026-08-27T13:06:17.978Z |  |
| 19 | 08 | deviation | .planning/phases/08-process-lifecycle/08-10-PLAN.md |  | 08-10 Task 1's acceptance criterion states its scoped seven-carrier verify 'returns 12 against the uncorrected tree'; measured 7 at this plan's start. The 12 was taken BEFORE plan 08-06 block-quoted the three source carriers, which moved 5 hits inside quotes where the strip removes them. Not a vacuous gate — 7 != 0, so it was still red and still proved the work — but it is the FIFTH wrong census figure in a plan whose own thesis is that enumerated censuses cannot be trusted, which is exactly why verdict-gate.sh consumes no count. | open |  | 2026-08-27T13:30:26.477Z |  |
| 20 | 08 | deviation | packages/backend/src/index.ts |  | Fourteenth vacuous gate in Phase 8, and the first that shipped as a READING rather than as a green tick. The A1 probe at the recoverable commit 68199fa (index.ts:5061) decided the verdict with 'const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false', an optional call on a primitive the SAME diagnostics run measured ABSENT five lines earlier ('spikeProcessKillType: undefined'); the absent case was coalesced to 'not alive', so the favourable string 'grandchild-died (detached honoured)' was emitted UNCONDITIONALLY. THE RED INPUT DID NOT EXIST. WHAT MAKES THIS INSTANCE DIFFERENT FROM THE TWELVE ALREADY RECORDED (entries 16, 17, 18, 19 and the self-reports in this phase's SUMMARYs): those produced a green tick, which a reviewer distrusts by habit; this one produced a plausible-looking hardware READING, which reviewers propagate. It propagated into eleven carriers, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, four phase documents, three source files and this ledger's own entry 11, and was pinned there by verdict-gate.sh ARM B before anybody re-derived it. FIXED IN CODE: classifyLivenessObservation in packages/backend/src/kill-plan.ts (plan 08-12) is three-valued - alive / dead / inconclusive - and reports inconclusive when the liveness primitive is unavailable instead of coalescing it into a verdict. WHAT STILL CLOSES THIS ENTRY: the A1 re-run on real hardware with the fixed probe, owned by plan 08-17. Recording the defect is not fixing the measurement. | open |  | 2026-08-28T09:25:02.483Z |  |
| 21 | 8 | deviation | packages/backend/src/index.ts |  | Plan 08-15 Task 1 acceptance criterion 'comment-stripped grep -c lastOrphanReap in index.ts is >= 5 after' MEASURED 4, not >= 5. The natural implementation the plan's own action describes (one declaration, one writer, one surfaced key with the ?? idiom) has exactly four occurrences; every route to five was padding. Reported rather than padded. The mechanism count (recordOrphanReapOutcome, 5 comment-stripped lines) does clear the floor. Fifteenth criterion-shape defect recorded in Phase 8, and the first recorded as UNDER-measuring rather than as vacuous. | open |  | 2026-08-28T10:06:12.399Z |  |
| 22 | 08 | deviation | packages/backend/src/index.ts |  | OUT-OF-PLAN FIX, recorded by plan 08-16 rather than performed by it: commit 39876b5 gives the spawned provider CLI a POSIX identity when process.env is empty. Caido's sandbox exposes an empty process.env, so readParentEnv() returned {} and buildSpawnEnv handed the provider CLI only Drift's own variables, with no USER. MEASURED 2026-08-28: 'env -i claude -p' reports Not logged in - Please run /login; 'env -i USER=<name> claude -p' succeeds; HOME and PATH are neither sufficient nor required, because the credential lives in the macOS Keychain and the lookup is keyed on the user name. On every real install the provider CLI could therefore not authenticate at all, no turn could start, and no cancel or timeout reading could ever have been taken - which is exactly what blocked plan 08-16 until the fix landed. THE FALSE RESIDUAL THAT LET IT SURVIVE, which is the finding worth keeping: readParentEnv's header said the matter 'needs a real reading rather than a code change' and 'demonstrably works on macOS today'. Both halves were false, and the evidence cited for them was '18 tools registered, authState: valid' - which measures the MCP SERVER reaching CAIDO with a token Drift injects by hand, and could never have measured the PROVIDER CLI reaching Anthropic, which inherits nothing. Both states were visible simultaneously on the same reporting install. That is this phase's own vacuous-reading pattern one level up: a favourable-looking measurement of a different thing. Corrected in place as marked corrections at both carriers. THE FIX: derivePosixIdentity derives HOME/USER/LOGNAME from extractHomeDir(pluginPath), a path Drift already knows, never from the empty environment. It is a FLOOR - real parent values win over it and driftVars win over both, so on a host with a readable environment the output is byte-identical, pinned by a CMP-01 test. PATH is deliberately not synthesised, because every executable Drift spawns is already absolute and a guessed PATH would reopen the bare-name search order T-08-03/T-08-33/T-08-34 closed. identityFallback is a REQUIRED member following 08-08's systemRootFallback precedent, so the compiler forced all four call sites to answer. Red input demonstrated: reverting derivePosixIdentity to return {} fails exactly 3 of the new assertions; restored byte-identical (sha1 0ea0a392361f81e1c871d9238590ab3ba139e332). WHAT KEEPS THIS ENTRY OPEN: the POSIX half is confirmed by the 2026-08-28 readings themselves, which could not have been taken without it, but the WINDOWS half is unmeasured - the claim that libuv back-fills USERNAME and USERPROFILE is source analysis, not a reading, and it stays owned by Phase 9 alongside G-01's Windows half. | open |  | 2026-08-28T11:50:14.370Z |  |
| 23 | 08 | deviation | .planning/phases/08-process-lifecycle/a1-probe-fix.patch |  | a1-probe-fix.patch went STALE the same day plan 08-15 shipped it, and the standing control caught it: verify-a1-patch.sh failed step 3 with four TS2345 errors because out-of-plan commit 39876b5 made identityFallback a REQUIRED member of buildSpawnEnv in platform.ts, and the control carries HEAD's platform.ts into the scratch worktree, so three historical index.ts call sites and one in mcp-server-spec.ts stopped compiling. REPAIRED 2026-08-28 by plan 08-17 as six named compatibility edits under a new patch header section 5; the control now exits 0 again and produces the probe package. THE SPECIFIC BREAK IS FIXED; THE CLASS IS NOT AND CANNOT BE. This patch targets a historical commit while HEAD keeps moving, so any future signature change at HEAD to a symbol the historical call sites touch will break it again. verify-a1-patch.sh MUST be re-run immediately before any future A1 hardware session rather than trusted from a prior VERIFIED line - which is exactly what its own header predicted and what the stale line proves. One of the six edits is not behaviour-preserving and is named as such: the three index.ts sites take HEAD's derived POSIX identity floor because without it the provider CLI has no USER on Caido's empty process.env and cannot authenticate, so the pre-fix Control cannot be taken at all. | fixed |  | 2026-08-28T12:12:39.428Z | 2026-08-28T12:12:47.559Z |

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
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "06",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "WIN32_PATH_SEARCH_TIMEOUT_MS = 5000 is a headroom estimate, not a measurement; closes on the Phase 9/10 real-machine report",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T11:55:43.210Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "06",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "CR-01/WR-01 (06-REVIEW): the provider spawn in sendCliMessage and the PATH-search spawn in resolveCommand were unguarded Promise-executor spawns, so a synchronous throw rejected the RPC instead of resolving. CLOSED in Phase 6 per 06-VERIFICATION human item 5: both now carry the same try/catch shape spawnAndWait already had. Provider site publishes spawn_error and cleans up runtimeFiles + the token-bearing mcp-<chatId>.json inline (finalize is in its TDZ at that point); PATH-search site resolves undefined, identical to its untouched error handler. Graceful degradation only - .cmd launchability stays PRV-02/Phase 7.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T13:16:47.639Z",
    "resolved_at": "2026-08-21T13:17:01.634Z"
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "06",
    "file": "packages/backend/src/command-resolution.ts",
    "line": null,
    "description": "CR-02 (06-REVIEW): two catalogue rows were non-administrator-writable on default Windows ACLs, and a binary resolved from either is spawned with CAIDO_TOKEN in its environment. CLOSED in Phase 6 per 06-VERIFICATION human item 4, option (a): %ProgramData%\\scoop\\shims dropped entirely; C:\\nvm4w\\nodejs now gated on nvm-windows' own NVM_HOME/NVM_SYMLINK contract via the new pure isNvmWindowsInstalled (platform.ts), threaded in as the injected nvmWindowsInstalled input so the three builders stay I/O-free and never read process.env. Both removals recorded as in-code non-claims naming the token exposure.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-21T13:16:56.847Z",
    "resolved_at": "2026-08-21T13:17:01.729Z"
  },
  {
    "id": 11,
    "kind": "unmet-truth",
    "phase": "08",
    "file": "packages/backend/src/kill-plan.ts",
    "line": null,
    "description": "MEASURED 2026-08-27 on a real macOS Caido (darwin 25.6.0, probe build 68199fa), superseding the 2026-08-24 entry; CORRECTED 2026-08-28, superseding the A1 half of that 2026-08-27 rewrite. Both superseded texts are preserved verbatim in the marked-correction notes at the end of this file. A1 IS RETRACTED, NOT NARROWED: spikeDetachedGroupKill decided liveness with an optional call on process.kill, a primitive the SAME diagnostics run measured ABSENT (spikeProcessKillType: 'undefined'), so the optional chain yielded undefined, '?? false' forced alive === false, and the reading 'grandchild-died (detached honoured)' was emitted UNCONDITIONALLY. The red input did not exist, so that reading carries no information about whether the grandchild died. CONSEQUENCE FOR THIS ENTRY, STATED PLAINLY RATHER THAN LEFT IN A MIDDLE STATE: the nine-site POSIX regression this entry was opened for is LIVE AGAIN. Whether the shipped LLRT honours the detached spawn is UNMEASURED, and the nine POSIX termination sites rest on unexecuted source analysis exactly as they did on 2026-08-24. A6 is FALSIFIED: codex pid 43921 sat in pgid 43752 while its own mcp-server.mjs child pid 44284 sat in pgid 44284, so a group signal aimed at the CLI's group cannot reach the token-bearing child, and OQ-2's single-pid rung does not help because it signals the CLI rather than the child. That reading was taken by direct ps observation, is NOT withdrawn, and is NOT bundled into the A1 retraction. The phase's answer to the falsification is the argv-marker orphan reap shipped by plans 08-06 and 08-07 - pgrep -f over a session-unique temp-dir marker adjacent to mcp-server.mjs, then a POSITIVE single-pid kill - which identifies its target by the target's own command line and is therefore independent of process groups by construction. WHAT KEEPS THIS ENTRY OPEN: A1 is unmeasured and its 2026-08-27 reading is withdrawn, so the detached-spawn premise under the nine POSIX termination sites is unsupported again; the A6 reading covers ONE provider (Codex), on an instance Drift did not spawn, so Claude Code - the active provider - remains unmeasured; the Control (reading 5) was never taken, so the T-08-14 attestation is still an isolated zero with the CLI-cleanup confounder unexcluded; and the reap itself is covered by no executed assertion (entries 13 and 15). Closes on one Drift-spawned Claude Code turn run through 08-SPIKE.md steps 3 and 4 with the FIXED three-valued liveness determination (classifyLivenessObservation in kill-plan.ts, plan 08-12), which reports inconclusive rather than coalescing an absent primitive into a verdict; the re-run itself is owned by plan 08-17 (probe recoverable at 68199fa).",
    "status": "open",
    "reason": "A1 RETRACTED 2026-08-28: the 2026-08-27 reading was emitted unconditionally by a probe whose liveness primitive the same run measured absent, so it narrows nothing and the nine-site POSIX concern this entry was opened for is live again. A6 measured FALSE 2026-08-27 by direct ps observation, for one provider on one build; Claude Code unmeasured and the pre-fix Control never taken.",
    "recorded_at": "2026-08-24T15:24:21.284Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "packages/backend/src/kill-tree.win32.test.ts",
    "line": null,
    "description": "The three win32 kill-tree cases have never executed: they are skipIf-gated and no windows-latest run exists for them yet. The reserved dead-pid exit-code block is empty and the run URL is unfilled.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T15:54:03.743Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "reapMcpOrphans and its cleanupMcpRuntime call site are covered by no executed assertion — index.ts cannot be imported under vitest and no static source gate was added (plan rated the truth 'verification: backstop'). NARROWED 2026-08-28 by plan 08-16 and NOT CLOSED; the superseded text is preserved verbatim in the marked-correction note at the end of this file. A real cancel on the maintainer's macOS Caido 0.58.2 (darwin 25.6.0, build 39876b5) produced lastOrphanReap = 'kind=noop reason=scan-failed exit=1 killed=0 ageMs=24'. exit=1 is reachable only through scanner.on('close', code) — both spawnThrew paths and the timeout arm pass exitCode undefined, which formatOrphanReapRecord renders as exit=undefined — so the value proves the cleanupMcpRuntime call site EXECUTED on the shipping runtime and wrote its record. WHAT KEEPS THIS ENTRY OPEN: a runtime observation is not an executed assertion. No test asserts this wiring, index.ts is still not importable under vitest, no static source gate was added, and the reading covers ONE platform and ONE build. An entry narrowed is an entry still open.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T12:08:50.726Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "packages/backend/src/kill-plan.ts",
    "line": null,
    "description": "MEASURED 2026-08-28 by plan 08-16 on the maintainer's own macOS Caido 0.58.2 (darwin 25.6.0, build 39876b5), superseding the 2026-08-27 text preserved verbatim in the marked-correction note at the end of this file. THE QUESTION THIS ENTRY WAS OPENED FOR IS ANSWERED: Caido's plugin sandbox CAN spawn pgrep, and by BARE NAME (ORPHAN_SCAN_FILE = 'pgrep', kill-plan.ts:546). A cancel produced lastOrphanReap = 'kind=noop reason=scan-failed exit=1 killed=0 ageMs=24'; exit=1 is unreachable on both spawnThrew paths (a synchronous spawn throw and scanner.on('error'), which are classified enumerator-unavailable before the exit-code arm is reached) and on the timeout arm, all three of which pass exitCode undefined and render exit=undefined. The value therefore proves pgrep spawned, executed and exited 1 — its documented no-process-matched — so the orphan reap does NOT degrade silently to the enumerator-unavailable no-op and is NOT inert on the runtime users run. It matched nothing because the primary termination path had already cleaned up; activeSessions was 0 in the same capture. SCOPE, STATED RATHER THAN IMPLIED: macOS only. Linux is unmeasured, and on win32 the scan plan refuses on a different arm before any spawn (unsupported-platform), which stays owned by Phase 9 SC-4.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-27T12:08:50.833Z",
    "resolved_at": "2026-08-28T11:50:29.110Z"
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "reapMcpOrphans / reapSessionOrphansIfIdle wiring is asserted only by source text. NARROWED 2026-08-28 by plan 08-16 and NOT CLOSED; the superseded text is preserved verbatim in the marked-correction note at the end of this file. The SECOND half of the original entry — whether Caido's LLRT sandbox can spawn pgrep at all — is now MEASURED and answered YES, by bare name, on the maintainer's macOS Caido 0.58.2 (build 39876b5); see entry 14 for the reading and its derivation. Neither reap therefore degrades silently to the enumerator-unavailable no-op on that platform. WHAT KEEPS THIS ENTRY OPEN, unchanged by the reading: the wiring is still asserted only by source text, index.ts is still not importable under vitest, and the IDLE-GATED session reap reapSessionOrphansIfIdle was NOT exercised by the 2026-08-28 reading at all — that reading came from the cleanupMcpRuntime path after a cancel, which is a different call site. An entry narrowed is an entry still open.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T12:30:13.421Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "deviation",
    "phase": "08",
    "file": ".planning/phases/08-process-lifecycle/08-07-PLAN.md",
    "line": 193,
    "description": "Ninth vacuous gate: Task 1 criterion 'grep -c never processes ... is 0' returned 0 at HEAD before any edit; the quoted sentence lives in 08-05-PLAN.md / 08-RESEARCH.md, never in index.ts",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T12:30:13.533Z",
    "resolved_at": null
  },
  {
    "id": 17,
    "kind": "deviation",
    "phase": "08",
    "file": "packages/backend/src/platform.ts",
    "line": null,
    "description": "08-08 Task 1 acceptance criterion 'grep -c process.env platform.ts is 0' is VACUOUS: returns 7 at HEAD before any edit (all seven are comment mentions of the rule the module follows). Intent verified instead by comment-stripped grep = 0, before and after. Tenth vacuous gate in Phase 8.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T12:53:54.797Z",
    "resolved_at": null
  },
  {
    "id": 18,
    "kind": "deviation",
    "phase": "08",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "Plan 08-09's exact-count criterion grep -c '0o700' index.ts is comment-sensitive: a 'why' comment mentioning the octal moves it with no behavioural change. Satisfied by rephrasing; executable (comment-stripped) count measured separately at 4 -> 4. Specify over the comment-stripped stream if it recurs.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T13:06:17.978Z",
    "resolved_at": null
  },
  {
    "id": 19,
    "kind": "deviation",
    "phase": "08",
    "file": ".planning/phases/08-process-lifecycle/08-10-PLAN.md",
    "line": null,
    "description": "08-10 Task 1's acceptance criterion states its scoped seven-carrier verify 'returns 12 against the uncorrected tree'; measured 7 at this plan's start. The 12 was taken BEFORE plan 08-06 block-quoted the three source carriers, which moved 5 hits inside quotes where the strip removes them. Not a vacuous gate — 7 != 0, so it was still red and still proved the work — but it is the FIFTH wrong census figure in a plan whose own thesis is that enumerated censuses cannot be trusted, which is exactly why verdict-gate.sh consumes no count.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-27T13:30:26.477Z",
    "resolved_at": null
  },
  {
    "id": 20,
    "kind": "deviation",
    "phase": "08",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "Fourteenth vacuous gate in Phase 8, and the first that shipped as a READING rather than as a green tick. The A1 probe at the recoverable commit 68199fa (index.ts:5061) decided the verdict with 'const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false', an optional call on a primitive the SAME diagnostics run measured ABSENT five lines earlier ('spikeProcessKillType: undefined'); the absent case was coalesced to 'not alive', so the favourable string 'grandchild-died (detached honoured)' was emitted UNCONDITIONALLY. THE RED INPUT DID NOT EXIST. WHAT MAKES THIS INSTANCE DIFFERENT FROM THE TWELVE ALREADY RECORDED (entries 16, 17, 18, 19 and the self-reports in this phase's SUMMARYs): those produced a green tick, which a reviewer distrusts by habit; this one produced a plausible-looking hardware READING, which reviewers propagate. It propagated into eleven carriers, .planning/ROADMAP.md, .planning/REQUIREMENTS.md, four phase documents, three source files and this ledger's own entry 11, and was pinned there by verdict-gate.sh ARM B before anybody re-derived it. FIXED IN CODE: classifyLivenessObservation in packages/backend/src/kill-plan.ts (plan 08-12) is three-valued - alive / dead / inconclusive - and reports inconclusive when the liveness primitive is unavailable instead of coalescing it into a verdict. WHAT STILL CLOSES THIS ENTRY: the A1 re-run on real hardware with the fixed probe, owned by plan 08-17. Recording the defect is not fixing the measurement.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T09:25:02.483Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "deviation",
    "phase": "8",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "Plan 08-15 Task 1 acceptance criterion 'comment-stripped grep -c lastOrphanReap in index.ts is >= 5 after' MEASURED 4, not >= 5. The natural implementation the plan's own action describes (one declaration, one writer, one surfaced key with the ?? idiom) has exactly four occurrences; every route to five was padding. Reported rather than padded. The mechanism count (recordOrphanReapOutcome, 5 comment-stripped lines) does clear the floor. Fifteenth criterion-shape defect recorded in Phase 8, and the first recorded as UNDER-measuring rather than as vacuous.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T10:06:12.399Z",
    "resolved_at": null
  },
  {
    "id": 22,
    "kind": "deviation",
    "phase": "08",
    "file": "packages/backend/src/index.ts",
    "line": null,
    "description": "OUT-OF-PLAN FIX, recorded by plan 08-16 rather than performed by it: commit 39876b5 gives the spawned provider CLI a POSIX identity when process.env is empty. Caido's sandbox exposes an empty process.env, so readParentEnv() returned {} and buildSpawnEnv handed the provider CLI only Drift's own variables, with no USER. MEASURED 2026-08-28: 'env -i claude -p' reports Not logged in - Please run /login; 'env -i USER=<name> claude -p' succeeds; HOME and PATH are neither sufficient nor required, because the credential lives in the macOS Keychain and the lookup is keyed on the user name. On every real install the provider CLI could therefore not authenticate at all, no turn could start, and no cancel or timeout reading could ever have been taken - which is exactly what blocked plan 08-16 until the fix landed. THE FALSE RESIDUAL THAT LET IT SURVIVE, which is the finding worth keeping: readParentEnv's header said the matter 'needs a real reading rather than a code change' and 'demonstrably works on macOS today'. Both halves were false, and the evidence cited for them was '18 tools registered, authState: valid' - which measures the MCP SERVER reaching CAIDO with a token Drift injects by hand, and could never have measured the PROVIDER CLI reaching Anthropic, which inherits nothing. Both states were visible simultaneously on the same reporting install. That is this phase's own vacuous-reading pattern one level up: a favourable-looking measurement of a different thing. Corrected in place as marked corrections at both carriers. THE FIX: derivePosixIdentity derives HOME/USER/LOGNAME from extractHomeDir(pluginPath), a path Drift already knows, never from the empty environment. It is a FLOOR - real parent values win over it and driftVars win over both, so on a host with a readable environment the output is byte-identical, pinned by a CMP-01 test. PATH is deliberately not synthesised, because every executable Drift spawns is already absolute and a guessed PATH would reopen the bare-name search order T-08-03/T-08-33/T-08-34 closed. identityFallback is a REQUIRED member following 08-08's systemRootFallback precedent, so the compiler forced all four call sites to answer. Red input demonstrated: reverting derivePosixIdentity to return {} fails exactly 3 of the new assertions; restored byte-identical (sha1 0ea0a392361f81e1c871d9238590ab3ba139e332). WHAT KEEPS THIS ENTRY OPEN: the POSIX half is confirmed by the 2026-08-28 readings themselves, which could not have been taken without it, but the WINDOWS half is unmeasured - the claim that libuv back-fills USERNAME and USERPROFILE is source analysis, not a reading, and it stays owned by Phase 9 alongside G-01's Windows half.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T11:50:14.370Z",
    "resolved_at": null
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "08",
    "file": ".planning/phases/08-process-lifecycle/a1-probe-fix.patch",
    "line": null,
    "description": "a1-probe-fix.patch went STALE the same day plan 08-15 shipped it, and the standing control caught it: verify-a1-patch.sh failed step 3 with four TS2345 errors because out-of-plan commit 39876b5 made identityFallback a REQUIRED member of buildSpawnEnv in platform.ts, and the control carries HEAD's platform.ts into the scratch worktree, so three historical index.ts call sites and one in mcp-server-spec.ts stopped compiling. REPAIRED 2026-08-28 by plan 08-17 as six named compatibility edits under a new patch header section 5; the control now exits 0 again and produces the probe package. THE SPECIFIC BREAK IS FIXED; THE CLASS IS NOT AND CANNOT BE. This patch targets a historical commit while HEAD keeps moving, so any future signature change at HEAD to a symbol the historical call sites touch will break it again. verify-a1-patch.sh MUST be re-run immediately before any future A1 hardware session rather than trusted from a prior VERIFIED line - which is exactly what its own header predicted and what the stale line proves. One of the six edits is not behaviour-preserving and is named as such: the three index.ts sites take HEAD's derived POSIX identity floor because without it the provider CLI has no USER on Caido's empty process.env and cannot authenticate, so the pre-fix Control cannot be taken at all.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-28T12:12:39.428Z",
    "resolved_at": "2026-08-28T12:12:47.559Z"
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

---

## Marked corrections

> **Entry 11, superseded 2026-08-24 — preserved, not deleted.** Rewritten 2026-08-27 by plan
> 08-10 once A1 and A6 were measured. The ledger's two representations are a table row and a
> JSON object, neither of which can carry a block quote, so the superseded text is preserved
> here instead — the `07-VALIDATION.md` marked-correction convention applied to a
> machine-readable register. Original `description`, verbatim:
>
> > LIF-02's POSIX mechanism rests on assumptions A1 and A6, both recorded OPEN - not measured
> > in 08-SPIKE.md after the Wave-0 hardware checkpoint was waived. kill-tree.posix.test.ts
> > proves the group-kill argv under NODE; no CI leg executes Caido's LLRT and none spawns a
> > real provider CLI. Closes only on a real-hardware run of 08-SPIKE.md's four-step procedure
> > (probe recoverable at 68199fa).
>
> Original `reason`: `""` (empty). Entry 11's `status` is unchanged at `open`: A1 closed
> favourably and A6 was FALSIFIED, but Claude Code stays unmeasured and the Control was never
> taken, so the entry narrows rather than closes. **Entry 12 is untouched by that correction in
> both representations.**

> **Entry 11, superseded 2026-08-27 — preserved, not deleted.** Rewritten 2026-08-28 by plan
> 08-14 after `08-VERIFICATION.md` gap 1 RETRACTED A1's 2026-08-27 reading. This is the SECOND
> supersession this entry carries; the 2026-08-24 one above is untouched and both must survive.
> The A6 half of the superseded text below is still current and is NOT withdrawn — only the A1
> half is. Superseded `description`, verbatim:
>
> > MEASURED 2026-08-27 on a real macOS Caido (darwin 25.6.0, probe build 68199fa), superseding
> > the 2026-08-24 entry (preserved verbatim in the marked-correction note at the end of this
> > file). This entry does NOT simply close. A1 is CLOSED FAVOURABLY: spikeDetachedGroupKill read
> > 'grandchild-died (detached honoured)', so the shipped LLRT does honour the detached spawn and
> > the nine-site POSIX regression this entry feared cannot happen. A6 is FALSIFIED: codex pid
> > 43921 sat in pgid 43752 while its own mcp-server.mjs child pid 44284 sat in pgid 44284, so a
> > group signal aimed at the CLI's group cannot reach the token-bearing child, and OQ-2's single-
> > pid rung does not help because it signals the CLI rather than the child. The phase's answer to
> > the falsification is the argv-marker orphan reap shipped by plans 08-06 and 08-07 - pgrep -f
> > over a session-unique temp-dir marker adjacent to mcp-server.mjs, then a POSITIVE single-pid
> > kill - which identifies its target by the target's own command line and is therefore
> > independent of process groups by construction. WHAT KEEPS THIS ENTRY OPEN: the reading covers
> > ONE provider (Codex), on an instance Drift did not spawn, so Claude Code - the active provider
> > - remains unmeasured; the Control (reading 5) was never taken, so the T-08-14 attestation is
> > still an isolated zero with the CLI-cleanup confounder unexcluded; and the reap itself is
> > covered by no executed assertion (entries 13 and 15). Closes on one Drift-spawned Claude Code
> > turn run through 08-SPIKE.md steps 3 and 4 (probe recoverable at 68199fa).
>
> Superseded `reason`, verbatim:
>
> > Narrowed, not closed: A1 measured favourably and A6 measured FALSE on 2026-08-27, both for one
> > provider on one build; Claude Code unmeasured and the pre-fix Control never taken.
>
> Entry 11's `status` is unchanged at `open`, its `recorded_at` is unchanged at
> 2026-08-24T15:24:21.284Z, and its `resolved_at` is unchanged at null. The correction does not
> resolve the entry — it removes a narrowing the entry was never entitled to. **Entry 12 is
> untouched by this correction in both representations.**


> **Entries 13, 14 and 15, superseded 2026-08-27 — preserved, not deleted.** Rewritten
> 2026-08-28 by plan 08-16 after the `lastOrphanReap` reading was taken on the maintainer's own
> macOS Caido 0.58.2 (darwin 25.6.0, build `39876b5`). The ledger's two representations are a
> table row and a JSON object, neither of which can carry a block quote, so the superseded text
> is preserved here instead — the `07-VALIDATION.md` marked-correction convention applied to a
> machine-readable register, exactly as entry 11's two notes above do it.
>
> **Only entry 14 CLOSES.** Entries 13 and 15 are NARROWED and stay `open`; their
> `recorded_at` values are unchanged and their `resolved_at` values are still `null`. An entry
> narrowed is an entry still open, and that rule is why the three outcomes differ here rather
> than moving together.
>
> Entry 13's original `description`, verbatim:
>
> > reapMcpOrphans and its cleanupMcpRuntime call site are covered by no executed assertion —
> > index.ts cannot be imported under vitest and no static source gate was added (plan rated the
> > truth 'verification: backstop')
>
> Entry 14's original `description`, verbatim:
>
> > Whether Caido's plugin sandbox can spawn pgrep at all is unmeasured; if it cannot, the
> > orphan reap degrades silently to the enumerator-unavailable no-op
>
> Entry 15's original `description`, verbatim:
>
> > reapMcpOrphans / reapSessionOrphansIfIdle wiring is asserted only by source text; whether
> > Caido's LLRT sandbox can spawn pgrep at all is unmeasured, so both reaps may degrade silently
> > to the enumerator-unavailable no-op while every gate stays green
>
> All three original `reason` fields were `""` (empty) and remain so. **Entries 11, 12 and 16
> are untouched by this correction in both representations.**
>
> **What the reading was, and what closed entry 14.** A cancel on 2026-08-28 produced
> `lastOrphanReap: kind=noop reason=scan-failed exit=1 killed=0 ageMs=24`, with
> `activeSessions: 0` in the same capture. `exit=1` is unreachable on both `spawnThrew` paths
> and on the timeout arm — all three pass `exitCode: undefined`, which `formatOrphanReapRecord`
> renders as `exit=undefined` — so it can only have come from `scanner.on("close", code)`.
> `pgrep` therefore spawned, executed and exited 1, its documented "no process matched", **by
> bare name**. That is precisely the question entry 14 was opened to ask, so entry 14 is closed
> with `gsd-tools windows fixed 14` rather than by a hand edit. Entries 13 and 15 ask different
> questions — executed-assertion coverage, and the idle-gated `reapSessionOrphansIfIdle` call
> site the reading never touched — and neither is answered.
>
> **Full reading, provenance and the interpretation that must not be read into it:**
> `.planning/phases/08-process-lifecycle/08-SPIKE.md` § *HEAD-build readings, 2026-08-28*,
> Table 3, and § *What these readings close, and what they do not*.

> **Entry 22, recorded 2026-08-28 — an OUT-OF-PLAN fix, filed here because plan 08-16 owns this
> file and does not own `packages/`.** Commit `39876b5` landed outside plan 08-16's scope, at
> the maintainer's explicit direction, while its measurement task was blocked. It is committed
> and green and plan 08-16 neither re-litigated nor re-fixed it. Recorded because the readings
> in `08-SPIKE.md` § *HEAD-build readings, 2026-08-28* were **impossible** before it: with an
> empty `process.env` the spawned provider CLI received no `USER`, could not reach its Keychain
> credential, and answered every turn with `Not logged in - Please run /login`. The build
> attribution of those readings is therefore `39876b5` and not the `abfbc17` plan 08-16 task 1
> staged, and that supersession is recorded as a marked correction in `08-SPIKE.md` itself.
