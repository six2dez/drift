# Phase 7: Provider Spawn & Registration - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the **Claude-on-Windows critical path** (PRV-01, the milestone's blocking must-have),
make provider `.cmd` shims launchable (PRV-02), replace Gemini/Codex's shared-wrapper registration
with `node` + args + `env` (PRV-03), close their approval/activity gap (PRV-05), accept `.exe`/`.cmd`
in the provider command field (UX-01), and **delete the last POSIX shell wrapper** (SC-7).

Requirements: **PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, UX-01.**

**Explicitly NOT this phase:**

- **Process-tree kill / `taskkill` / POSIX process groups** — Phase 8 (LIF-01/LIF-02). PRV-02's
  `cmd.exe` branch *adds a tree level*, which makes Phase 8's job harder; note the seam, do not fix it.
- **`windowsHide: true` on spawns** — UX-04, Phase 10. PRV-02 adds a `cmd.exe` spawn on the turn
  path, so it adds another console-window flash. Mark the site, leave it.
- **Windows install/prereq docs, PowerShell execution-policy note** — UX-03, Phase 10.
- **Making the `windows-latest` CI leg *required*** — Phase 9. Phase 5 (D-07) already landed it as a
  blocking leg in `ci.yml`; Phase 7 rides it.
- **Real-machine confirmation from the original reporter (@0xMRK0S)** — Phase 9/10. SC-1's
  "confirmed on the reporter's machine **where possible**" is not a gate on this phase.
- **`icacls` ACL hardening of the Windows temp dir (HRD-01)** — v2.
- **Aliasing `caido:plugin` in `vitest.config.ts`** — deferred out of Phase 5, natural home Phase 9.
  `index.ts` remains un-importable under vitest, which constrains every "prove it" decision below.

### Six code facts verified during this discussion — planners must not re-derive them

1. **The PRV-05 gap is a lifetime mismatch, not a missing variable.** Gemini/Codex are registered
   **once at MCP start** — `tryRegisterMcpForProviders` (`index.ts:2845`), reached from
   `startMcpServer` (`:1958`) and the settings-save/token-sync refresh (`:3132`) — against a spec
   whose `driftVars` are built at `index.ts:2099` **without** `activityFilePath`/`approvalsFilePath`.
   The activity and approvals files are created **per session**, later, inside `sendCliMessage`
   (`createSessionRuntimeFiles`, `index.ts:3290`). No registration-time value can name a file that
   does not exist yet.
2. **Drift already injects the full per-session `runtimeEnv` into the Gemini/Codex CLI process.**
   `index.ts:3479`: `injectedDriftVars = runtimeFiles === undefined ? {} : runtimeEnv`, merged
   through `buildSpawnEnv` at the spawn (`:3722`). `DRIFT_ACTIVITY_FILE` and `DRIFT_APPROVALS_FILE`
   therefore **already reach the CLI's own environment today**. Whether they reach the MCP server
   the CLI spawns is the CLI's behaviour — that is D-02's open question, and it is the whole phase's
   cheapest possible win.
3. **`mcp-server.mjs` reads the two paths ONCE, at process start** (`:15-16`), from `process.env` —
   unlike `DRIFT_CONTEXT_FILE`, which `loadStoredContext` (`:174`) re-reads from disk on **every**
   call. That asymmetry is what makes a pointer-file alternative possible at all, and what makes
   env inheritance sufficient if it holds.
4. **The refusal is `mcp-server.mjs:623`** — `waitForApproval` throws
   `"Sensitive tool confirmation is unavailable for <tool>."` when **either** file is empty. It
   refuses on the pair, which is why approvals and the activity trace cannot be scoped apart (D-07).
5. **`skippedMcpCliReasons` (`index.ts:2795`) reaches ONLY `getDiagnostics` (`:4473`).** It is not
   plumbed to `getProviderStatuses` and never renders on the provider card in `SettingsView.vue`.
   05-D-03 explicitly **rejected** diagnostics-only ("a brand-new Windows user never looks"), so its
   intent is not yet realised in code. D-08 inherits that wiring as real work, not free reuse.
6. **There is no binary-path "picker" to extend.** `SettingsView.vue:325` is a bare free-text
   `InputText` bound to `providers[pid].command`, with zero validation anywhere in
   `packages/frontend/src`. UX-01 is about `resolveCommand`'s absolute-path arm (which 06-D-06 says
   already shape-sniffs `.exe`/`.cmd`) plus whatever the phase decides the field should say — not
   about widening an existing validator.

</domain>

<decisions>
## Implementation Decisions

### The Gemini/Codex approval + activity channel (PRV-05 / SC-4)

- **D-01: Phase 7 aims for a REAL channel, with per-CLI disable-and-state as the floor.**
  SC-4 offers two exits; this phase attempts the first and keeps the second as a landing zone that
  is decided **per CLI**, not globally. Gemini and Codex can reach different verdicts.

  The reason this is not simply "go for parity": the roadmap already marks Gemini's Windows MCP
  reliability unresolved and its status gated on a real-machine check (SC-5). Committing PRV-05 to
  parity with no floor would put a research-flagged provider on the same critical path as PRV-01,
  the milestone's blocking must-have. The floor is what keeps PRV-05 off PRV-01's path.

  Rejected: **disable outright.** It is the cheapest deterministic close of SC-4, but fact 2 says
  the variables already reach the CLI process — so it would ship a stated limitation without first
  spending the one test that might make the limitation unnecessary.
  — **Reversibility:** reversible.

- **D-02: The carrier is ENV INHERITANCE from the Drift-spawned CLI process — verified, then relied
  upon. No new indirection is built.**

  Drift spawns the provider CLI with `injectedDriftVars` already merged into its environment
  (fact 2). If `gemini` and `codex` pass their environment through to the stdio MCP server they
  spawn — the ordinary behaviour for a child process — then `DRIFT_ACTIVITY_FILE` and
  `DRIFT_APPROVALS_FILE` arrive without Drift building anything at all, and PRV-05 costs one
  confirmation test plus D-04's flag.

  Rejected: **a session-pointer file re-read per call**, mirroring the `DRIFT_CONTEXT_FILE` pattern
  that already ships (fact 3). It is immune to whatever the CLIs do with env, and it is the right
  answer if inheritance fails — but it adds a new indirection to `mcp-server.mjs` and raises a
  concurrent-sessions question (`activeProcesses` is keyed by `sessionId`, so two chats can run at
  once and would race a single shared pointer). Do not build it speculatively. **If D-05's evidence
  falsifies inheritance for a CLI, the pointer file is the first thing to reconsider before
  accepting D-01's floor for that CLI** — but that is a new decision, not a fallback this phase
  pre-authorises.

  Rejected: **re-register per turn** (`mcp remove` + `mcp add` with per-session `--env` before every
  turn). Deterministic and needs no `.mjs` change, but it adds two process spawns per turn on a hot
  path and rewrites the user's persistent `~/.gemini` / `~/.codex` config every turn — so a crash
  mid-turn leaves a **stale token entry outside `%TEMP%`**, which is precisely the hazard
  `PITFALLS.md` § Pitfall 5 and SC-3's `mcp remove` guarantee exist to prevent. It trades a PRV-05
  problem for a PRV-03 one.
  — **Reversibility:** reversible — nothing is built, so nothing is undone.

- **D-03: LOCKED CONSEQUENCE FOR PRV-03 — the Gemini/Codex `--env`/`-e` registration must NOT carry
  `DRIFT_ACTIVITY_FILE` or `DRIFT_APPROVALS_FILE`.**

  This is a direct, non-negotiable consequence of D-02 and it constrains an area the user did not
  select for discussion, so it is recorded here rather than left for the planner to discover.
  A registration-time `--env DRIFT_ACTIVITY_FILE=<path>` would (a) name a file that does not exist
  at registration time (fact 1) and (b) **clobber the inherited per-session value**, converting a
  working channel into a permanently-wrong one. Whatever PRV-03 decides about the token, these two
  keys are inheritance-only.

  The planner must state this at the registration site, because "we pass the env explicitly, so
  pass all of it" is the obvious and wrong instinct.
  — **Reversibility:** costly — undoing it means re-deciding PRV-03's registration payload and
  PRV-05's carrier together; they are one decision surface.

- **D-04: A STATIC per-provider capability flag drives the posture, AND `mcp-server.mjs:623`'s
  message is upgraded regardless.**

  The flag lives in `packages/shared/src` alongside the existing MCP constants so both the tool
  policy sent to that CLI and the user-facing sentence read from one source. It is set by D-05's
  evidence, and — being data behind a pure predicate — it is unit-testable, which matters because
  `index.ts` cannot be imported under vitest.

  The `.mjs` message upgrade is **independent and unconditional**: today a user whose inheritance
  silently fails gets `"Sensitive tool confirmation is unavailable for <tool>."` with no cause and
  no remedy. That string is the safety net for a wrong flag verdict, and it is worth fixing even in
  the world where every flag is right.

  Rejected: **flag only** — a wrong verdict on someone's setup then reproduces today's unexplained
  error exactly. Rejected: **runtime detection only** — no table to keep true, but the user learns
  the limitation by hitting it mid-turn, which is nearer to today's broken behaviour than to a
  stated limitation, and SC-4's wording is *stated*, not *discovered*.
  — **Reversibility:** reversible.

- **D-05: The evidence is an AUTOMATED test for Drift's half and a CITED upstream source for the
  CLI's half. The split is recorded in Phase 3's vehicle-caveat voice.**

  Drift can only test what Drift controls. The two halves:

  1. **Drift's half — automated.** A test proves `runtimeEnv` actually reaches the spawned CLI
     process's environment, **sharing the production builder** rather than reimplementing it —
     05-D-08's shape, and for 05-D-08's reason: a reimplementation would prove nothing and would
     drift from production silently. This runs on the `windows-latest` leg Phase 5 already landed.
  2. **The CLI's half — cited.** Whether `gemini` and `codex` forward their environment to the
     stdio server they spawn is settled by an upstream source or docs citation **per CLI**, under
     Phase 6 D-12's citation requirement. A citation, not a recollection.

  **Caveat to write into the plan and the phase report, verbatim in voice:** this proves that Drift
  *supplies* the variables and that the CLI *documents* forwarding them — **not** that a specific
  installed CLI version on a specific machine did so. Do not report PRV-05 as more than that.

  Rejected: **adding a manual real-run on macOS.** Highest fidelity for the CLI's half, and env
  pass-through is genuinely not platform-shaped the way spawn is — but it is a manual step that
  silently expires on the next CLI release, and nothing in CI defends it. Recorded in Deferred
  Ideas: it is a natural companion to the Phase 9/10 reporter confirmation, which is already a
  manual real-run checkpoint.
  Rejected: **real-run only** — fastest to a verdict, but a later refactor of the env path would
  silently invalidate both flags with no test to catch it.
  — **Reversibility:** reversible.

- **D-06: When the evidence is inconclusive for a CLI, the flag FAILS CLOSED — sensitive tools off.**

  This is the house pattern, not a fresh judgement: `planMcpCliRegistration`
  (`mcp-server-spec.ts:183`) returns `Skip` on an `undefined` platform rather than falling through
  to the POSIX arm, and the `.mjs` allowlist treats an empty list as deny-all
  (`DRIFT_ALLOWLIST_ACTIVE`). Failing closed costs a capability the user might actually have; it
  never grants one they do not. Given the tools in question are the *sensitive* group — replay,
  intercept, workflow — that asymmetry is the correct one.
  — **Reversibility:** reversible.

- **D-07: Approvals and the activity trace are ONE channel; both are in scope for SC-4.**

  Not a scope choice so much as a code fact (fact 4): `waitForApproval` refuses when **either**
  file is empty, and the approval request is itself written as an activity event
  (`appendActivityEvent`, `.mjs:79`). They share one mechanism and one pair of env vars, so scoping
  the trace out as "best effort" would narrow what SC-4 must prove by exactly nothing while adding
  a second thing to report on.
  — **Reversibility:** reversible.

- **D-08: The limitation is stated through `skippedMcpCliReasons` + a README line — and wiring that
  map to the provider card is WORK THIS PHASE OWNS.**

  Same surface and same voice as 05-D-03's Windows registration skip, so a user never learns about
  two different "Drift can't do this with Gemini" mechanisms.

  **Two consequences the planner must not discover the hard way:**

  1. Fact 5 — the map today reaches only `getDiagnostics`. 05-D-03's stated intent (the *provider
     status* carries a real sentence) is **not** realised in code, and 05-D-03 itself rejected
     diagnostics-only. Plumbing `skippedMcpCliReasons` to `getProviderStatuses` and rendering it on
     the provider card in `SettingsView.vue` is part of this decision's cost.
  2. The map's meaning **widens**. Today every entry means *not registered at all*. After this
     phase an entry may also mean *registered, but sensitive tools unavailable* — a materially
     different state for a user who is trying to work out whether Drift is attached. The sentences
     must disambiguate on their own, since the map carries no kind discriminator. The alternative —
     a separate per-provider capability notice — was considered and rejected as new frontend
     surface in a phase that otherwise touches almost none; that rejection is what makes the
     wording requirement binding rather than advisory.
  — **Reversibility:** costly — undo means re-deciding the surface *and* unpicking the widened
  meaning from whatever sentences ship.

### Claude's Discretion

Three gray areas were **offered and not selected**. They are open, not delegated-and-settled, and
this section records my read so research and planning have a starting point rather than a blank —
but nothing here is locked, and the researcher should treat each as live.

- **`.cmd` spawn strategy (PRV-02).** The roadmap's SC-2 already names the shape:
  `cmd.exe /d /s /c <shim> <args>` as an argv array with `shell:false`, or the underlying `node.exe`
  entry directly. `PITFALLS.md` § Pitfall 1 adds the part SC-2 does not — **`cmd.exe` re-parses its
  own arguments even in argv form**, so `%TEMP%` paths under a username containing a space, `&`,
  `(` or `'` still need quoting. Fact from this discussion the planner should carry: the `EINVAL`
  surface is **three** sites, not one — provider launch (`index.ts:3722`), `mcp add`/`mcp remove`
  (`registerMcpWithCli` / `unregisterMcpFromCli`), and the provider `--version` probe. A fix that
  covers only the first leaves Gemini/Codex registration broken on Windows, which is PRV-03's
  whole point.
- **Token hygiene and the guaranteed `mcp remove` (PRV-03 / SC-3).** Two open sub-decisions:
  (a) literal token in `--env` vs `${CAIDO_TOKEN}` vs `DRIFT_TOKEN_FILE` for Codex — note 05-D-10
  **rejected** `${CAIDO_TOKEN}` for Claude's config because an unset reference yields a *silently
  unauthenticated* server, and `findExpandableEnvKeys` (`mcp-server-spec.ts:254`) already exists to
  fail loud on that shape; the roadmap marks Codex `${VAR}` expansion as needing CI confirmation.
  (b) **`unregisterMcpFromCli` (`index.ts:2889`) returns early unless `registeredMcpCliPaths` holds
  an entry from *this process run*** — so a crashed session's `drift` entry, token inside
  `~/.gemini`/`~/.codex` and **outside** `%TEMP%` where `sweepOrphanedMcpTempDirs` never looks,
  is never removed. The roadmap additionally requires removing a stale entry left by a Phase-≤5
  Drift pointing at a deleted `.sh`. SC-3's "a failed remove is logged, not dropped" and
  `PITFALLS.md` § Pitfall 5's "treat a failed `mcp remove` as a security event worth logging" are
  the same requirement stated twice.
- **PRV-01 evidence and Gemini's SC-5 gating.** My read: the CI vehicle is a fixture `.cmd` shim on
  `PATH` driven through the production spawn builder — 05-D-08's shape again, and the same vehicle
  caveat applies (it proves the spawn contract, not `index.ts`'s wiring of it). SC-1's "confirmed on
  the reporter's machine where possible" is explicitly *where possible* and must not become a gate;
  SC-5 gates only **Gemini's status**, not the phase.

Sub-decisions left to the planner inside the locked decisions above:

- Where D-04's capability flag lives in `packages/shared/src` (`mcp.ts` alongside the tool
  definitions, or `cli-providers.ts` alongside the provider identities) and whether it is a plain
  record or a predicate.
- The exact wording of D-04's upgraded `mcp-server.mjs:623` message, and of D-08's two sentence
  shapes — bounded by D-08's disambiguation requirement.
- Whether D-05's Drift-half test extends the existing `mcp-server-spec.spawn.test.ts` or lands as
  its own file.
- **Plan split.** The roadmap's provisional count is **3**. This discussion did not add scope, but
  it did surface D-08's frontend wiring, which the count may not have anticipated. Treat 3 as
  provisional, not binding.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The design already specified for THIS phase — binding

- `.planning/ROADMAP.md` § *Phase 7: Provider Spawn & Registration* — the seven success criteria,
  including SC-7's exact deletion checklist and its `grep -c` gates.
- `.planning/REQUIREMENTS.md` — PRV-01…PRV-05 (lines 61-65), UX-01 (line 80), and the traceability
  table (lines 168-173). SC-7's counted `DELETED IN PHASE 7 (PRV-03)` notices are tracked at
  line 282.

### Prior phases' precedents this phase must not reopen

- `.planning/phases/05-kill-shell-wrappers/05-CONTEXT.md` — **D-01/D-02** name Phase 7 as the owner
  of the surviving POSIX wrapper and its three deletion notices; **D-03** is the in-product +
  README statement shape D-08 reuses; **D-04** is the direct-spawn seam PRV-02 fills; **D-08** is
  the shared-builder test shape D-05 and the PRV-01 evidence both follow; **D-10** is the rejection
  of `${CAIDO_TOKEN}` indirection and its silently-unauthenticated failure mode; **D-11** is the
  key-names-never-values logging rule.
- `.planning/phases/06-windows-command-resolution/06-CONTEXT.md` — **D-06**'s absolute-path
  shape-sniffing is what UX-01 rests on; **D-12**'s citation requirement governs D-05's upstream
  half; its Deferred Ideas hand `.cmd` spawn and the binary-path picker to this phase by name.
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — **binding on every
  spawn site.** § *P1-CMD* measured direct `.cmd` spawn throwing `EINVAL` on `windows-latest` and
  selects the `cmd.exe /c` architecture as **mandatory, not recommended**; § *Vehicle caveat* is
  the voice D-05's caveat is written in; § *P0-ENV* measured that the `env` option **replaces** the
  parent block on Windows, with `APPDATA`/`LOCALAPPDATA` **not** back-filled.

### Research — the provider-specific hazards

- `.planning/research/PITFALLS.md` § *Pitfall 1* — why `shell:true` with dynamic args is
  permanently off the table, and why `cmd.exe` argv still needs quoting.
- `.planning/research/PITFALLS.md` § *Pitfall 2* — the ENOENT/EINVAL squeeze and the inverse POSIX
  regression; names all three affected call sites.
- `.planning/research/PITFALLS.md` § *Pitfall 5* — the token landing in `~/.gemini`/`~/.codex`
  outside `%TEMP%`, unswept until `mcp remove`; "treat a failed `mcp remove` as a security event
  worth logging".
- `.planning/research/PITFALLS.md` § *per-provider table* and § *checklist* — the Gemini/Codex row
  ("register `node <mcpScript>` with env the CLI supports; guarantee `mcp remove` on cleanup") and
  the GitHub Copilot CLI #3576 precedent, a direct mirror of Drift's situation.

### Codebase ground truth — the exact sites this phase edits

- `packages/backend/src/index.ts:2845` `tryRegisterMcpForProviders` — the single registration site,
  reached from `:1958` (MCP start) and `:3132` (settings-save / token-sync refresh).
- `packages/backend/src/index.ts:2803` `registerMcpWithCli` / `:2889` `unregisterMcpFromCli` — the
  `mcp add` / `mcp remove` spawns, both `EINVAL`-exposed and both PRV-03's.
- `packages/backend/src/index.ts:2795` `skippedMcpCliReasons`, surfaced only at `:4473` — D-08's
  wiring gap.
- `packages/backend/src/index.ts:3479` `injectedDriftVars` and `:3722` the provider spawn — where
  the per-session vars already reach the CLI (D-02's premise) and where PRV-02's `.cmd` guard lands.
- `packages/backend/src/index.ts:2099` `requireMcpServerSpec`'s `buildMcpRuntimeEnv` call — the
  registration-time `driftVars`, deliberately without the two per-session paths (D-03).
- `packages/backend/src/index.ts:934` / `:1041` / `:1408` — the three `DELETED IN PHASE 7 (PRV-03)`
  notices on `renderExportExecScript`, `shellQuote` and `writeMcpWrapper`; `getMcpWrapperPath` at
  `:1154` and the last `spawnAndWait("chmod", …)` at `:1446` go with them (SC-7).
- `packages/backend/src/mcp-server-spec.ts:183` `planMcpCliRegistration` — the fail-closed pattern
  D-06 follows, and the predicate whose win32 arm PRV-03 replaces.
- `packages/backend/src/mcp-server-spec.ts:254` `findExpandableEnvKeys` — already-shipped guard
  against a `${VAR}` reference reaching a config `env` field.
- `packages/backend/assets/mcp-server.mjs:15-16` (frozen-at-start reads), `:79`
  `appendActivityEvent`, `:88` `readApprovalDecisions`, `:174` `loadStoredContext` (the per-call
  re-read that fact 3 contrasts against), `:623` `waitForApproval`'s refusal — D-04's message
  upgrade and D-07's one-channel argument.
- `packages/frontend/src/views/SettingsView.vue:322-330` — the free-text command field (fact 6,
  UX-01) and the provider status block D-08 must extend.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`buildSpawnEnv`** (`platform.ts:612`) — Phase 4's parent-merge point, already unit-tested. Every
  new spawn site in this phase calls it; do not hand-roll `{ ...process.env, ...vars }`.
- **`planMcpCliRegistration`** (`mcp-server-spec.ts:183`) — a pure predicate that already owns the
  "should we register this CLI, and if not why" decision, with `skippedMcpCliReasons`-shaped
  reasons. PRV-03 replaces its win32 arm; D-04's capability flag can follow the same pure-predicate
  shape rather than inventing one.
- **`findExpandableEnvKeys`** (`mcp-server-spec.ts:254`) — the fail-loud guard for `${VAR}` in an
  `env` payload. If PRV-03 goes the `${CAIDO_TOKEN}` route for Gemini, this is the existing tool.
- **`getWhichCommand` / `getExecutableNames` / `rankPathSearchHits`** (`platform.ts`) — Phase 6
  wired these; PRV-02 consumes whatever `resolveCommand` returns and must not re-derive extensions.
- **`withFsRetry`** (`fs-retry.ts`) — already wraps the `mcp-server.mjs` staging copy; the AV
  write-then-exec race pattern is established if PRV-03 writes anything new.
- **`mcp-server-spec.spawn.test.ts`** — the shared-production-builder spawn test 05-D-08 established
  and D-05 follows.

### Established Patterns

- **Pure module + `index.ts` orchestration.** `index.ts` cannot be imported under vitest, so
  anything left inside it is unverifiable by construction. Seven modules already exist for this
  reason; D-04's flag and any new predicate follow.
- **Fail closed on an unknown.** `planMcpCliRegistration` on `undefined` platform; the `.mjs`
  allowlist's empty-means-deny. D-06 is the third instance, not a new rule.
- **A literal deletion notice with a named phase.** `windows-llrt-probe.yml`'s header and the three
  `DELETED IN PHASE 7 (PRV-03)` blocks. SC-7 is this phase paying that debt; if anything survives
  Phase 7, it needs a notice naming its new owner.
- **Key names, never values, in logs** (`formatSpawnDebugLine`, `mcp-server-spec.ts:228`; T-04-04).
  Binding on anything PRV-03 logs about the registration payload.
- **The vehicle caveat.** Phase 3 § *Vehicle caveat*, Phase 5 D-08. Every "we proved X" claim in
  this phase states what it did **not** prove.

### Integration Points

- `tryRegisterMcpForProviders` (`index.ts:2845`) is the single seam where PRV-03's registration
  payload, D-03's inheritance-only keys, D-04's capability flag and D-08's reason sentences all
  converge. It has **two** callers (`:1958`, `:3132`) — 05-D-01 put the platform guard inside the
  function precisely so both inherit it. Any new gate belongs there for the same reason.
- `sendCliMessage`'s spawn (`index.ts:3722`) already has a `try/catch` that converts the `.cmd`
  `EINVAL` into a graceful session error (05-D-04). PRV-02 makes the spawn succeed; the catch stays
  as the guard for everything else.
- `cleanupMcpRuntime` (`index.ts:2906`) calls `unregisterMcpFromCli` for both CLIs before sweeping
  the temp dir. SC-3's "guaranteed `mcp remove`" and Phase 8's "kill pids before sweeping" both
  land in this function's ordering.
- `getProviderStatuses` / `SettingsView.vue`'s provider card — D-08's wiring target, and the only
  frontend surface this phase touches.

</code_context>

<specifics>
## Specific Ideas

- The `.mjs`'s existing `DRIFT_CONTEXT_FILE` re-read-per-call pattern (`:174`) is the concrete
  reference design if D-02's inheritance is falsified and a pointer file becomes necessary. It is
  named here so a later reader does not design one from scratch — but see D-02: it is **not**
  pre-authorised, and it carries an unanswered concurrent-sessions question.
- D-08's two sentence shapes should read as one voice with 05-D-03's existing
  `"Drift MCP is not yet supported for {Gemini|Codex} on Windows (Phase 7)."` — a user who sees
  both across an upgrade should recognise them as the same system talking.

</specifics>

<deferred>
## Deferred Ideas

- **A manual real-run confirmation of env pass-through** through `gemini` and `codex` on macOS,
  per CLI. Rejected as D-05's evidence standard because it silently expires on the next CLI release
  and nothing in CI defends it — but it is the highest-fidelity read of the CLI's half, and it is a
  natural companion to the **Phase 9/10 reporter confirmation**, which is already a manual
  real-run checkpoint.
- **A session-pointer file re-read per call in `mcp-server.mjs`** — the D-02 alternative. Revisit
  only if D-05 falsifies inheritance. Carries an open question: `activeProcesses` is keyed by
  `sessionId`, so two concurrent chats would race a single shared pointer.
- **A distinct per-provider capability notice in the frontend** — rejected in D-08 as new surface.
  If `skippedMcpCliReasons`'s widened meaning (registered-but-limited vs not-registered) proves
  confusing in practice, this is the fix.
- **`icacls` ACL hardening of the Windows temp dir (HRD-01)** — v2. The per-user `%TEMP%` ACL
  remains the accepted baseline. Note that PRV-03's Gemini/Codex token lands in `~/.gemini` /
  `~/.codex`, **outside** `%TEMP%` entirely, so HRD-01 would not cover it even when it lands.
- **Aliasing `caido:plugin` in `vitest.config.ts`** — deferred out of Phase 5, natural home Phase 9.
  It is the reason every "prove it" decision in this phase routes through a pure module.
- **Phase 2 (POSIX Correctness & Hardening) is still `Not started`** while Phase 7 is discussed.
  Its **SEC-02** (`sessionId`/`chatId` validated against a strict character set before path
  interpolation) applies to the per-session activity/approvals paths D-02 now makes load-bearing
  for two more providers — this phase slightly raises the stakes on it without absorbing it.
- **`windowsHide: true` (UX-04)** — Phase 10. PRV-02 adds a `cmd.exe` spawn on the turn path and
  therefore another console flash. Mark the site.
- **Process-tree kill (LIF-01)** — Phase 8. PRV-02's `cmd.exe` branch adds a tree level
  (`cmd.exe → claude.cmd → node → mcp-server.mjs`), making Phase 8's job strictly harder. Flag the
  seam at the site so Phase 8 finds it.

</deferred>

---

*Phase: 7-Provider Spawn & Registration*
*Context gathered: 2026-08-21*
