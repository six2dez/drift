---
phase: 07-provider-spawn-registration
verified: 2026-08-24T10:52:00Z
status: human_needed
score: 4/7 must-haves verified as written
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/7
  verified_at_head: 345b4f5
  gaps_closed:
    - "SC-1 — the Windows CI spawn path, which SC-1 names as its evidence vehicle, covers the tree that ships"
  gaps_remaining: []
  regressions: []
  note: >-
    Score is unchanged and SC-1 remains PARTIAL. The closed gap was about evidence
    STALENESS, not about any criterion flipping. SC-1's evidence-vehicle clause moved
    from unsatisfied to satisfied; its outcome clause ("a user can run a Claude Code
    chat end-to-end") is untouched by the new run and remains undemonstrated.
gaps: []
deferred: []
roadmap_gaps:
  - item: "SC-1's reporter confirmation — a real Claude Code turn on native Windows"
    issue: >-
      07-CONTEXT.md and 07-VALIDATION.md place this in "Phase 9/10", but ROADMAP.md
      § Phase 9 and § Phase 10 success criteria name neither it nor any equivalent.
      It is a live residual with no owner in the roadmap — NOT a deferred item.
    action: "Add explicitly to Phase 9 or Phase 10 success criteria, or accept it as permanently unowned."
  - item: "SC-5's Gemini real-machine confirmation gate"
    issue: >-
      SC-5 gates Gemini's status on a real-machine check by its own text. Same
      situation: placed in phase-local documents, named by no later phase's success
      criteria. Verified by reading ROADMAP.md §§ 303-350.
    action: "Add explicitly to Phase 9 or Phase 10 success criteria."
behavior_unverified_items:
  - truth: "SC-1 — a user can run a Claude Code chat end-to-end on Windows with the Drift MCP attached"
    test: "Reporter (@0xMRK0S) runs a chat turn on native Windows against a Drift build from HEAD."
    expected: "Claude Code launches, the Drift MCP server attaches, and at least one Drift tool returns live Caido data."
    why_human: >-
      No CLI binary was executed anywhere in this phase and nothing in CI executes
      `sendCliMessage`. `packages/backend/src/index.ts` declares no `caido:plugin`
      alias and cannot be imported under vitest, so the wiring between the proven
      spawn contract and a real turn is asserted by a comment-stripped source scan
      and the compiler, never by execution. Caido's LLRT honouring
      `windowsVerbatimArguments` is source-verified in the fork and never run
      (assumption A2 stays open; every CI leg runs Node, not LLRT). None of this is
      changed by run 32708029055.
  - truth: "SC-5 — Gemini is usable on Windows (its status is explicitly gated on a real-machine confirmation)"
    test: "On a real Windows machine, enable Gemini in Drift, start the MCP server, and run a turn that triggers a sensitive tool approval."
    expected: "`gemini mcp add` writes the drift entry to `~/.gemini/settings.json`, the turn attaches, and the approval prompt reaches the Drift chat (proving env inheritance actually delivered DRIFT_APPROVALS_FILE / DRIFT_ACTIVITY_FILE)."
    why_human: >-
      SC-5 gates Gemini's status on a real-machine check by its own text. That check
      has not happened. Gemini's approval channel verdict is source-read out of
      gemini-cli (`mcp-client.ts`, `environmentSanitization.ts`), and the code itself
      names an OPEN upstream PR (google-gemini/gemini-cli#28863) moving toward more
      sanitization. No installed binary was measured.
human_verification:
  - test: "Reporter runs a Claude Code chat turn on native Windows with Drift MCP attached (SC-1's 'where possible' clause)."
    expected: "Turn completes, MCP attached, a Drift tool returns live Caido data."
    why_human: "No CI vehicle attaches a real CLI; index.ts is unimportable under vitest."
  - test: "Real-machine Gemini confirmation on Windows (SC-5's explicit gate)."
    expected: "Registration lands in ~/.gemini/settings.json and an approval prompt reaches the Drift chat."
    why_human: "SC-5 names this as the gate on Gemini's status. Source citation cannot substitute for it."
  - test: "Build the plugin, load it in Caido, open Settings → CLI Providers and read the Codex limitation sentence on the rendered card."
    expected: "Codex shows an amber (not red) dot with the limitation sentence, and it reads as 'registered, but limited' on its own."
    why_human: >-
      The 07-05 checkpoint was approved RELAYED — a human signed off on the wording
      AS TEXT. Nobody is asserting the plugin was built or the rendered card was
      looked at. The phase's own record (commit c677fe7) says so explicitly. This is
      the residual that qualifier names.
---

# Phase 7: Provider Spawn & Registration — Verification Report

**Phase Goal:** Complete the Claude end-to-end critical path (the blocking must-have) and bring up the remaining three CLIs — spawning `.cmd` shims safely, registering external CLIs with token hygiene, and closing the Gemini/Codex approval gap.
**Verified:** 2026-08-24
**Verified at:** HEAD = `345b4f5`
**Status:** human_needed (was `gaps_found` on first pass at `02b403f`)
**Re-verification:** Yes — after gap closure. One gap raised, one gap closed, no regressions.

## Verdict in one paragraph

The engineering work of this phase is real and is on disk. Four of seven success criteria are met
as written, verified by reading the shipped code rather than the summaries. One (SC-3) is a
knowingly-approved deviation from roadmap text the user declined to amend. Two (SC-1, SC-5) are
partial by their own terms, with the open items named honestly in the phase's own
07-VALIDATION.md § *Vehicle caveat* — that document is, unusually, more conservative than the
evidence requires and I found nothing in it overstated. The stale-CI gap raised on the first pass
is **closed with real evidence** (run `32708029055` @ `345b4f5`, verified independently below).
**No criterion changed verdict as a result**, and that is the correct outcome: the gap was about
whether the evidence covered the shipped tree, not about whether any criterion was met.

## Goal Achievement — Per-Criterion Verdict

| # | Success Criterion | Verdict | One-line basis |
|---|---|---|---|
| SC-1 | Claude chat end-to-end on Windows, exercised via CI spawn path, reporter-confirmed where possible | **PARTIAL** | Evidence-vehicle clause now fully satisfied at HEAD; outcome clause still undemonstrated — no CLI binary ever executed |
| SC-2 | `cmd.exe /d /s /c` + `windowsVerbatimArguments: true`, no `shell:true` | **MET** | Shipped incantation matches the amended text byte-for-byte and reaches the real `spawn` |
| SC-3 | Gemini/Codex `-e`/`--env` with token hygiene; guaranteed `mcp remove` | **DEVIATION** (hygiene half) / **MET** (removal half) | Codex ships the LITERAL token; roadmap authorises reference or file indirection |
| SC-4 | Gemini/Codex get an approval channel, or sensitive tools off + stated | **MET** (with evidence warning) | Gemini Delivered (source-cited); Codex fails closed, stated on card + README + `.mjs` |
| SC-5 | Gemini/Codex/Copilot best-effort on Windows, Gemini gated on real-machine check | **PARTIAL** | Windows skip arm deleted for all three; Gemini's own gate is open and unclosed |
| SC-6 | Provider binary-path picker accepts `.exe`/`.cmd` | **MET** | Free-text field, zero validators anywhere on the path, `.cmd` example in the hint |
| SC-7 | Delete the POSIX wrapper; four symbols to 0; last `chmod` spawn gone | **MET** | Every literal `grep -c` gate re-run at `345b4f5`; all still pass |

**Score:** 4/7 verified as written. 2 partial (behaviour/real-machine unverified), 1 recorded deviation. **Unchanged from the first pass.**

---

## ✅ CLOSED — the stale Windows CI gap

Raised on the first pass at `02b403f`; closed at `345b4f5`. I verified each claim independently
rather than accepting the closure report.

**Independent verification:**

```
$ gh run view 32708029055 --json headSha,conclusion,jobs
  sha:         345b4f59a1292937dbc2225e337f0e808b332186   ← equals HEAD
  conclusion:  success
  jobs:        Verify (Windows), Verify (Node 20/22/24/26) — all success
  failedSteps: 0
```

Log lines pulled from the run itself, not from the report:

| Evidence | Leg | Line |
|---|---|---|
| win32 suite executed | Windows | `✓ packages/backend/src/spawn-plan.win32.test.ts (6 tests) 496ms` |
| full suite | Windows | `Tests 531 passed (531)` — no skips |
| **WR-08 gate ran for the first time** | Windows | `Gate passed: the win32 spawn-plan suite ran 6 tests on this host.` |
| gate discriminates | Node 20/22/24/26 | `↓ spawn-plan.win32.test.ts (6 tests \| 6 skipped)` + `525 passed \| 6 skipped (531)` |

That last row is the one that matters: the same file that reports 6 executed on Windows reports 6
skipped on every Linux leg. The gate is reading a real difference, not a constant.

**All three sub-points closed:**

1. **The six review-fix commits have now run on Windows.** The run is at HEAD, not behind it.
2. **CR-01 has real-Windows coverage.** Commit `345b4f5` adds a sixth leg to
   `spawn-plan.win32.test.ts`. I read it rather than trusting the description, and it is built
   correctly — the discriminating assertions come *before* the round-trip:

   ```ts
   const comspec = selectComspec({ env: process.env, platform: "win32" });
   expect(comspec).toBeDefined();
   expect(path.isAbsolute(comspec as string)).toBe(true);
   expect((comspec as string).toLowerCase()).toContain("cmd.exe");
   // …
   expect(plan.file).toEqual(comspec);
   expect(plan.file).not.toEqual("cmd.exe");   // ← refuses the fallback literal
   ```

   The reasoning in its comment is right and matters: a regression dropping the env read returns
   `undefined`, `buildSpawnPlan` falls back to the bare literal, and a round-trip-only assertion
   would still pass. `expect(plan.file).not.toEqual("cmd.exe")` is what makes this leg aimed at
   `file` rather than at the argv — which was the structural blind spot that let CR-01 through
   every other gate in this phase. Reading the real `process.env` rather than a fixture is also
   the right call for this specific property: what a genuine Windows host supplies is exactly what
   an injected dict cannot falsify.
3. **The WR-08 gate no longer rests on a hand-check.** It executed and printed its pass line.

**Narrower residual that replaces the closed one (not a gap — recorded for accuracy):** the new leg
calls `selectComspec({ env: process.env, platform: "win32" })` directly. `index.ts`'s `getComspec()`
is `selectComspec({ env: readParentEnv(), platform: host?.platform })`. So what is now proven on
real Windows is that the pure selector returns a spawnable absolute interpreter from a genuine
Windows environment and that `buildSpawnPlan` carries it into a working spawn. Whether
`readParentEnv()` returns that environment and whether `host?.platform` is `"win32"` under Caido's
LLRT remains source-scan-and-compiler asserted — which is residual #3 below (the standing
`index.ts` unimportability limit), not a new finding. The closure is real; it is one layer short of
the whole path, and that layer is the one nothing in this project can reach.

**Housekeeping verified:** `scratch/ci-07-post-review` is gone from both local and remote
(`git ls-remote --heads origin` shows only the pre-existing `scratch/ci-06-07-phase-close` at
`3f7c7b3`, left untouched as claimed).

---

### SC-1 (PRV-01, the blocking must-have) — PARTIAL, and it stays PARTIAL

You asked me not to soft-upgrade this. I am not upgrading it, and here is precisely why.

SC-1 reads: *"On Windows, a user can run a Claude Code chat end-to-end with the Drift MCP attached
— the blocking must-have (PRV-01), **exercised via the Windows CI spawn path** and confirmed on the
reporter's machine where possible."* That is an outcome clause plus an evidence clause.

**The evidence clause is now fully satisfied.** It was not on the first pass — the CI path had been
exercised on a tree seven commits behind what ships. Run `32708029055` fixes that at HEAD, and adds
coverage of the one argument (`file`) that no prior gate examined. This is a genuine improvement in
evidence quality, not just a re-run.

**The outcome clause is untouched.** Nothing in run `32708029055` moves any of these:

1. **No CLI binary was executed anywhere in this phase.** No Claude turn ran on Windows. The run
   spawns a fixture `.cmd` shim that reports its own argv — a spawn contract, not a turn.
2. **Nothing in CI executes `index.ts`.** It declares no `caido:plugin` alias and cannot be
   imported under vitest. `sendCliMessage`, `registerMcpWithCli`, `unregisterMcpFromCli` and
   `sweepStaleMcpCliRegistrations` are executed by nothing. `index.source.test.ts` (12 cases)
   stands in, and states in its own header that it proves an argument is *present*, not what it
   *evaluates to*. That is still the correct reading.
3. **Caido's runtime is never exercised.** `windowsVerbatimArguments` is source-verified in the
   LLRT fork and declared in the vendored types; every CI leg runs Node. Assumption A2 is open.
4. **The reporter confirmation has not happened.**

A criterion whose subject is "a user can run a chat end-to-end" cannot be MET on evidence that
never ran a chat, never ran a CLI, and never ran the runtime the code ships into. What improved is
the confidence that the spawn layer beneath it is correct — which is real and was worth the run,
and is not the same thing.

**What is genuinely proven now, on a real Windows host:** `spawn-plan.win32.test.ts` builds an
npm-GLOBAL-shaped `.cmd` shim (`@ECHO off` / `SETLOCAL` / `"node" "script" %*`) in a directory whose
name carries a space and a parenthesis pair, drives it through the **production** `buildSpawnPlan`,
spawns it against a real `cmd.exe` resolved from the real `%COMSPEC%`, and asserts the received
`process.argv.slice(2)` is byte-identical to the hazard set. It carries a falsifiability leg (direct
spawn of the same shim throws synchronous `EINVAL`), a "caret pass removed" leg that watches cmd
expand a literal `%TEMP%`, and now the CR-01 leg. Six cases, all executed on `windows-latest`.

The phase must still not be reported as having closed the milestone's blocking must-have.
07-VALIDATION.md line 164 says exactly this and remains correct.

---

### SC-2 — MET

Verified against the **current** amended text (commit `ba0d46a`), not a recollection.

`packages/backend/src/spawn-plan.ts` `buildSpawnPlan` returns, on the interpreted branch:

```ts
return {
  file: comspec === "" ? DEFAULT_COMSPEC : comspec,
  args: ["/d", "/s", "/c", `"${parts.join(" ")}"`],
  windowsVerbatimArguments: true,
};
```

where `parts = [escapeCmdCommand(command), ...args.map(a => escapeCmdArgument(a, doubleEscape))]`.
That is the amended shape exactly, including the `^`-escaping contract (`CMD_META_CHARACTERS`
exported as data; the regex built from it, not restated).

**The distinction the review flagged once — does the flag reach the actual spawn?** Yes, and it is
structurally enforced rather than incidentally correct:

| Site | Line | Delivery |
|---|---|---|
| Provider launch (`sendCliMessage`) | index.ts:4247 | `spawnWithEnv(spawnPlan.file, spawnPlan.args, { …, windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments })` |
| `mcp add` pre-clean removal | index.ts:2957 | `spawnAndWait(…, { windowsVerbatimArguments: removePlan.windowsVerbatimArguments })` |
| `mcp add` | index.ts:2999 | same |
| Session-cleanup removal | index.ts:3198 | same |
| Startup-sweep removal | index.ts:3334 | same |

`spawnAndWait` threads the option into both of its `spawn(...)` arms (index.ts:2638, 2643). The
`SpawnWithEnv` alias (index.ts:2003-2009) declares `windowsVerbatimArguments: boolean` as
**required**, so omitting it at a new call site is a compile error — `pnpm -r typecheck` exit 0 is
therefore load-bearing evidence here, not ceremony.

`shell:true` appears nowhere: `grep -rn 'shell:\s*true' packages/backend/src packages/backend/assets`
returns no match, and no `shell` option is passed on any spawn path.

The escaping contract is now measured on `windows-latest` with an absolute interpreter as well as
the bare one, and both round-trip the hazard set identically — confirming the CR-01 fix closes a
resolution hole without touching the escaping contract.

**Caveat:** whether Caido's LLRT honours the flag is source-verified (`command.raw_arg(…)`) and
never executed. Real on real Node, unmeasured on the runtime that ships.

---

### SC-3 — DEVIATION (token hygiene) / MET (guaranteed removal)

**Token hygiene — knowing deviation, recorded as such.** SC-3 authorises `${CAIDO_TOKEN}` or
`DRIFT_TOKEN_FILE` indirection for Codex. Neither shipped. `mcp-server-spec.ts:553` selects the
payload from `MCP_CLI_EXPANDS_ENV_REFERENCES`, which is `{ gemini: true, codex: false }`
(source-cited to `openai/codex codex-rs/rmcp-client/src/utils.rs`), so Codex receives the literal
token bytes — **both** at rest in `~/.codex/config.toml` and on the `codex mcp add` argv, which is
readable by any process that can enumerate arguments. The research is correct that Codex performs
no `${VAR}` expansion at all, and `planMcpCliRegistration` refuses outright (Skip) if any
`${…}`-shaped value would reach a non-expanding CLI — the right fail-closed shape.

The user approved this at a blocking checkpoint (`literal-plus-guarantees`) and separately
**declined** amending SC-3. So the roadmap text stands and the implementation knowingly departs
from it. Recorded as DEVIATION: not met as written, and not an execution failure.

Gemini's half is met as written: `${CAIDO_TOKEN}` reference, with a loud fail-closed check
(`mcp-server-spec.ts:257-266`) refusing registration when Drift's own spawn environment carries no
token — the "silently unauthenticated server" failure 05-D-10 rejected.

**Guaranteed `mcp remove` — MET.** Three paths, one policy:

- `unregisterMcpFromCli` (index.ts:3177) on session cleanup, iterating every scope in
  `planMcpCliRemoval`, gated on this run's registration map;
- `sweepStaleMcpCliRegistrations` (index.ts:3279), called unconditionally at index.ts:3491 **before**
  `tryRegisterMcpForProviders`, covering both CLIs across every scope Drift ever wrote — the cover
  for a crashed run's entry that no live map remembers;
- a pre-clean inside `registerMcpWithCli`.

A failure is never dropped: `formatMcpRemoveFailure` is written to `sdk.console.error` **and** to
`skippedMcpCliReasons`, which 07-02 wired to the Settings provider card. Reasons are value-free by
construction (key names only, never bytes).

**On the "unconditional sweep" claim flagged as a live claims-vs-code risk:** I re-read the sweep
rather than trusting the fix report. Gates 5 and 6 (empty command; unresolvable command) are
present at index.ts:3288-3317, are now named in the comment as *forced rather than chosen*, and
emit `formatMcpSweepBlockedResidual` on `sdk.console.error`, once per process per command value.
README.md line 49 states the same exception in the user's own words and no longer says
"unconditionally". The two claims agree. This is fixed, not fixed-in-the-summary.

---

### SC-4 (PRV-05) — MET, with one evidence warning

Per-CLI verdict, both halves checked in code.

**Gemini — real channel.** `PROVIDER_MCP_APPROVAL_CHANNELS[Gemini] = { kind: "Delivered" }`, via
env inheritance, source-cited to `google-gemini/gemini-cli packages/core/src/tools/mcp-client.ts`
(`finalEnv` seeded from `sanitizeEnvironment({...process.env, ...extensionEnv})`) and to
`environmentSanitization.ts` (whose `NEVER_ALLOWED_NAME_PATTERNS` do not match `DRIFT_ACTIVITY_FILE`
or `DRIFT_APPROVALS_FILE`). The code names an **open** upstream PR (#28863) as a re-check point.
D-03's constraint holds structurally: `buildMcpCliRegistrationEnv` strips `PER_SESSION_ENV_KEYS`
unconditionally from the registration payload, so a registration-time value cannot clobber the
inherited per-session one.

**Codex — fails closed, limitation stated.** `{ kind: "None", limitation: … }`, source-cited to
`stdio_server_launcher.rs` (`.env_clear().envs(&envs)`). The fail-closed is a *payload*, not a
runtime refusal (`mcp-server-spec.ts:526-551`): sensitive names stripped via the shared
`excludeSensitiveToolNames`, `DRIFT_CONFIRMATION_REQUIRED_TOOLS` emptied,
`DRIFT_CONFIRM_SENSITIVE_ACTIONS` set `"0"`, and `DRIFT_ALLOWLIST_ACTIVE` deliberately kept `"1"`
so an empty allowlist means deny-all rather than allow-all. Correct.

**Stated in-product and in README — both confirmed:**
- Provider card: `SettingsView.vue:361-363` renders `limitation` in amber; `applyProviderLimitation`
  (index.ts:2891) sets `capability: "limited"` and never routes a limitation through `error` (which
  paints red). Correct posture — a limited provider is working, not broken.
- README.md rows 43/44 and the shared-contract paragraph 47; row 44 reproduces the shared table's
  sentence.
- `mcp-server.mjs:635` — the unexplained-error message upgrade shipped, unconditional, key names
  only, and points the user at Settings → CLI Providers.

**⚠️ WARNING — WR-07 remains unfixed and its test overstates itself.**
`mcp-server-spec.spawn.test.ts:373` — `describe("mcp-server-spec per-session channel (D-05, Drift's half)")`
— opens by claiming "Drift can prove that it SUPPLIES the two per-session variables **to the CLI
child it spawns**". It then asserts on `buildMcpServerSpec(...).env`, which is the **MCP server's**
node process environment, not the provider CLI's. The provider child's env is composed in
`sendCliMessage` from `injectedDriftVars = runtimeFiles === undefined ? {} : runtimeEnv`
(index.ts:3968) — and that branch, the one that can drop both keys, is exercised by nothing.

Mitigating: both paths go through the same `buildSpawnEnv(parentEnv, driftVars)` and the same
`buildMcpDriftVars`, so the substitution is tight. Not mitigating: the review offered a one-line
minimum fix (narrow the block's title) and even that was not applied, so the test now asserts less
than its own comment says it does. D-05 required an *automated* proof for Drift's half; what exists
is an automated proof of a near-neighbour. Does not sink SC-4 — the limitation and fail-closed
halves are fully shipped — but the Gemini "Delivered" verdict rests on a source citation plus a
proxy test, and should be reported at that strength.

---

### SC-5 — PARTIAL

**Structurally met.** `planMcpCliRegistration`'s win32 arm — which returned "Drift MCP is not yet
supported for <CLI> on Windows (Phase 7)" — is gone (mcp-server-spec.ts:210-213). Windows now takes
the same register arm as darwin and linux for both Gemini and Codex. Copilot was already
config-document based (`env` dict + node path) and needed no change. `grep -c 'not yet supported' README.md`
is 0. "Usable on a best-effort basis" is satisfied as far as code can satisfy it.

**Gemini's gate is open, and belongs to nobody.** SC-5 gates Gemini's *status* on a real-machine
confirmation. That confirmation has not happened, and — this is the part that matters for planning
— **it is not carried by any later phase's success criteria.** 07-CONTEXT.md and 07-VALIDATION.md
place it in "Phase 9/10", but I read ROADMAP.md § Phase 9 and § Phase 10 in full and neither names
a real-machine Gemini check. The same is true of SC-1's reporter confirmation. See the roadmap-gap
section below — these are **not** deferred items and must not be filed as such.

---

### SC-6 (UX-01) — MET

There was never a picker. There is no file dialog, no browse button, and none is claimed. The field
is a plain `InputText` (`SettingsView.vue:348-353`) bound to `updateProviderCommand`, which writes
the raw string through with **no** transformation and **no** validation (`SettingsView.vue:87-93`).
There is no extension allow-list anywhere on the path — frontend or backend. `getCommandPlaceholder`
supplies a hint that names a Windows `.cmd` path (`…\AppData\Roaming\npm\claude.cmd`), and the
comment states the design intent plainly: a hint only, because the frontend cannot know the host
platform and `checkProvider` already returns a precise per-case error a weaker second check would
contradict.

"Accepts `.exe`/`.cmd` paths" is therefore true by construction — nothing can reject them — and
Phase 6's resolver handles both extensions downstream. That is what actually satisfies UX-01.

ℹ️ Info (IN-05, accepted unfixed): the placeholder shows a Windows path on macOS and Linux too.

---

### SC-7 — MET. Every literal `grep -c` gate re-run at `345b4f5`

| Gate (ROADMAP text) | Command | Result |
|---|---|---|
| `renderExportExecScript` gone | `grep -c renderExportExecScript packages/backend/src/index.ts` | **0** ✓ |
| `shellQuote` gone | `grep -c shellQuote packages/backend/src/index.ts` | **0** ✓ |
| `writeMcpWrapper` gone | `grep -c writeMcpWrapper packages/backend/src/index.ts` | **0** ✓ |
| `getMcpWrapperPath` gone | `grep -c getMcpWrapperPath packages/backend/src/index.ts` | **0** ✓ |
| Last `chmod` spawn gone | `grep -rn 'spawnAndWait("chmod"' packages/backend/src/` | **no match** ✓ |
| Comment-stripped `.sh` count in index.ts → 0 | block+line comment strip, then `/\.sh\b/g` | **0** ✓ (4 raw hits, all inside `//` comments) |
| `DELETED IN PHASE 7 (PRV-03)` notices 3 → 0 | repo-wide, excluding `.planning/` | **0** ✓ |
| `DELETED IN PHASE 9` probe header untouched | `grep -rn 'DELETED IN PHASE 9' .github` | **present**, `windows-llrt-probe.yml:1` ✓ |
| `enforceOwnerOnlyDir`'s `fs/promises` namespace `chmod` **must remain** | read index.ts:826-842 | **present** ✓ — reached through the namespace, never a named import, exactly as specified |
| `mcp-wrapper.sh` written by no code path | `grep -rn mcp-wrapper packages/*/src` | 2 hits, **both comments** ✓ |

No regressions from the `345b4f5` commit (it touches only `spawn-plan.win32.test.ts`).

---

## 🔴 ROADMAP GAP — two confirmed residuals own by no phase

This survives into the final record as a **roadmap gap, not a deferred item.** I verified it by
reading ROADMAP.md §§ 303-350 (Phases 8, 9, 10) in full.

| Residual | Where phase docs place it | Where ROADMAP actually places it |
|---|---|---|
| SC-1's reporter confirmation — a real Claude turn on native Windows | 07-CONTEXT.md, 07-VALIDATION.md: "Phase 9/10" | **Nowhere.** Phase 9 SCs cover CI pinning, `.gitattributes`, the secret gate, `mcp-server.*.test.ts` on Windows, matrix green. Phase 10 SCs cover install docs, PATH messaging, diagnostics, `windowsHide`. Neither names a real CLI turn. |
| SC-5's Gemini real-machine confirmation gate | 07-CONTEXT.md, 07-VALIDATION.md: "Phase 9/10" | **Nowhere.** Same reading. |

The distinction matters: a deferred item has an owner and will be verified when that phase is
verified. These have neither. If they stay as they are, the milestone can complete with both
silently unclosed — and one of them is the gate on the blocking must-have's only real-world
confirmation.

**Action:** add both explicitly to Phase 9 or Phase 10 success criteria, or record a deliberate
decision to accept them as permanently unowned. Do not file them as deferred.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/backend/src/spawn-plan.ts` | Pure Windows spawn plan, zero I/O, one import | ✓ VERIFIED | `grep -cE '^import'` = 1; ported from cross-spawn v7.0.6 with both divergences documented |
| `packages/backend/src/spawn-plan.win32.test.ts` | Real `cmd.exe` round-trip, win32-gated | ✓ VERIFIED | **6** cases incl. EINVAL falsifiability leg and the new CR-01 comspec leg; executed on `windows-latest` at HEAD |
| `packages/backend/src/spawn-plan.win32.gate.test.ts` | Guards the CI gate on every platform | ✓ VERIFIED | 5 cases, runs everywhere; asserts presence, and says so |
| `packages/backend/src/platform.ts` `selectComspec` | Env-injected, absolute-only, win32-only | ✓ VERIFIED | 9 cases in platform.test.ts incl. both spellings and drive-relative `C:cmd.exe`; now also exercised against a real Windows `%COMSPEC%` |
| `packages/backend/src/mcp-server-spec.ts` | Registration payload/argv/removal policy, pure | ✓ VERIFIED | Every per-CLI fact carries a `[VERIFIED: repo path]` citation |
| `packages/shared/src/cli-providers.ts` | Capability level + approval-channel table | ✓ VERIFIED | Exhaustive `Record<CliProvider, …>`; omission is a compile error |
| `packages/frontend/src/views/SettingsView.vue` | Renders capability + limitation; free-text command field | ✓ VERIFIED | Amber for `limited`; limitation never on the error channel |
| `packages/backend/assets/mcp-server.mjs` | Upgraded no-channel message | ✓ VERIFIED | Line 635; key names only, no value interpolation |
| `README.md` | Provider rows + crash-residue paragraph | ✓ VERIFIED | Rows 43/44/47, residual line 49 with paste-able commands matching `MCP_CLI_REMOVE_REMEDIATION` |
| `packages/backend/src/index.source.test.ts` | Stand-in for unimportable index.ts | ⚠️ PARTIAL | 12 cases, but covers **only** the review-fix wiring (CR-01, WR-01, WR-04, WR-05) — it does not assert SC-2's `windowsVerbatimArguments` delivery at the provider spawn site. That one is held by the required-key type instead, which is adequate but is a different mechanism than the phase's stated one |
| `.github/workflows/ci.yml` | Windows leg + win32-ran gate | ✓ VERIFIED | Gate executed at HEAD: `Gate passed: the win32 spawn-plan suite ran 6 tests on this host.` |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `buildSpawnPlan` | real `spawn` (provider launch) | `spawnWithEnv(plan.file, plan.args, {…, windowsVerbatimArguments: plan.windowsVerbatimArguments})` index.ts:4247 | ✓ WIRED |
| `buildSpawnPlan` | `spawnAndWait` (4 registration/removal sites) | literal key, value from plan | ✓ WIRED |
| `getComspec()` | all 5 `buildSpawnPlan` call sites | `comspec: getComspec()` | ✓ WIRED (source-scan pinned at 5; the *selector*'s output now measured on real Windows) |
| `PROVIDER_MCP_APPROVAL_CHANNELS` | tool policy payload | `buildMcpCliRegistrationEnv({approvalChannel})` index.ts:3101 | ✓ WIRED |
| `PROVIDER_MCP_APPROVAL_CHANNELS` | provider card | `applyProviderLimitation` → `ProviderStatus.limitation` → `SettingsView.vue:361` | ✓ WIRED |
| `skippedMcpCliReasons` | provider card | `applyProviderLimitation` source 2 | ✓ WIRED (D-08's cost, actually paid) |
| `sweepStaleMcpCliRegistrations` | startup | index.ts:3491, before `tryRegisterMcpForProviders` | ✓ WIRED |
| `formatMcpSweepBlockedResidual` | user | `sdk.console.error`, once per process per command | ✓ WIRED |
| `injectedDriftVars` | Gemini child env | `buildSpawnEnv({parentEnv, driftVars: injectedDriftVars})` index.ts:4241 | ⚠️ WIRED, UNTESTED — the `runtimeFiles === undefined ? {} : runtimeEnv` branch is exercised by nothing (WR-07) |

## Behavioural Spot-Checks

| Behaviour | Command | Result | Status |
|---|---|---|---|
| Full suite green at HEAD (local) | `pnpm exec vitest run` | 525 passed / 6 skipped (531) | ✓ PASS |
| The 6 skips are the win32 suite only | reporter output | `spawn-plan.win32.test.ts (6 tests \| 6 skipped)` | ✓ PASS — gated by design, nothing else skipped |
| Typecheck | `pnpm -r typecheck` | exit 0 | ✓ PASS (load-bearing: enforces SC-2's required flag) |
| Lint | `pnpm lint` | exit 0 | ✓ PASS |
| SC-7 deletion gates | see SC-7 table | all pass | ✓ PASS |
| **Windows CI covers HEAD** | `gh run view 32708029055` | sha = HEAD, 5/5 legs success, 0 failed steps | ✓ **PASS — gap closed** |
| **win32 suite executed on Windows** | CI log | `✓ spawn-plan.win32.test.ts (6 tests) 496ms`, `531 passed (531)` | ✓ **PASS** |
| **WR-08 gate executed** | CI log | `Gate passed: the win32 spawn-plan suite ran 6 tests on this host.` | ✓ **PASS — first execution** |
| Scratch branch cleanup | `git ls-remote --heads origin` | only pre-existing `scratch/ci-06-07-phase-close` remains | ✓ PASS |
| A real Claude turn on Windows | — | no vehicle exists | ? SKIP → human |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | `TBD` / `FIXME` / `XXX` across all phase-modified files | — | **none found** |
| `packages/backend/src/index.ts` | 2707 | `MISSING_COMMAND_PLACEHOLDER` | ℹ️ Info | Named sentinel constant in a comment, not a stub |
| `packages/backend/src/mcp-server-spec.spawn.test.ts` | 358-373 | Test comment claims more than the assertions prove | ⚠️ Warning | WR-07, unfixed — see SC-4 |
| `packages/backend/src/spawn-plan.ts` | 289 | `comspec ?? ""` → falls back to bare `cmd.exe` when COMSPEC is absent or relative | ℹ️ Info | The CR-01 search-order exposure is narrowed, not eliminated. Deliberate (upstream cross-spawn does the same and `buildSpawnPlan` owns the last-resort name), but worth knowing it is a narrowing. The new leg proves a real Windows host does supply an absolute value |

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|---|---|---|---|
| PRV-01 | Claude chat end-to-end on Windows (blocking must-have) | ⚠️ PARTIAL | Spawn contract measured on real Windows at HEAD, incl. the interpreter path; no turn, no CLI binary, no LLRT |
| PRV-02 | `.cmd` shims spawn via `cmd.exe /d /s /c` argv, never `shell:true` | ✓ SATISFIED | SC-2 above |
| PRV-03 | Gemini/Codex registration with token hygiene + guaranteed `mcp remove` | ⚠️ DEVIATION | Removal guarantee met; Codex ships the literal token instead of a reference/file |
| PRV-04 | Gemini/Codex/Copilot usable on Windows, Gemini gated | ⚠️ PARTIAL | Windows skip arm deleted; Gemini's own real-machine gate open and unowned |
| PRV-05 | Approval channel or sensitive tools off + stated | ✓ SATISFIED | SC-4 above; Gemini verdict is source-cited, not measured |
| UX-01 | Picker accepts `.exe`/`.cmd` | ✓ SATISFIED | SC-6 above |

No orphaned requirements: REQUIREMENTS.md maps exactly PRV-01…05 + UX-01 to Phase 7, and all six are claimed by the phase's plans.

## Notes on what the phase's own verification did and did not catch

1. **CR-01 (`cmd.exe` by bare name, on the branch carrying a live Caido token) passed every gate
   this phase built for itself.** The phase built an unusually strong apparatus — pure modules split
   out specifically because `index.ts` is unassertable, source-scan tests, measured CI runs, a red
   run kept as evidence. None of it looked at *which interpreter* was spawned, because every gate
   was pointed at the argv and none at the `file`. The lesson is not "the review caught it" but that
   a gate suite can be dense and still be uniformly aimed one argument to the left of the defect.
   The new CR-01 leg is the first gate in this phase aimed at `file`, and its
   `expect(plan.file).not.toEqual("cmd.exe")` is what makes it one.

2. **The too-narrow sweep check (WR-04) is the same shape.** Grepping for the three gates the plan
   named found the three gates the plan named; the two the code carried were invisible to a check
   derived from the plan rather than from the code. Both were caught by reading code, not by any
   automated gate — which is why I re-read the sweep and the five spawn sites directly, and why I
   read `345b4f5`'s diff and pulled the CI log lines myself rather than accepting the closure report.

3. **On the relayed 07-05 checkpoint:** weighed at its true strength, which is low for what it
   nominally covers. A human approved shipped wording *as text*. Nobody built the plugin, loaded it
   in Caido, or saw the rendered card. The phase records this honestly (commit `c677fe7` spells out
   what is and is not attested), so this is not a misrepresentation — but D-08's
   one-voice-across-three-surfaces requirement has been checked by reading three files, not by
   comparing three rendered surfaces. Carried as a human verification item.

4. **On bisectability:** several intermediate commits (the `available` → `capability` migration) do
   not typecheck standalone. Recorded honestly in the summaries. HEAD is green on all three gates,
   so this costs nothing today; it will cost a `git bisect` across `f45e033..aa84094` if one is ever
   needed in that range.

## Summary

**No gaps remain.** The one gap raised on the first pass is closed with evidence I verified
independently — the run is at HEAD, all five legs green with zero failed steps, the win32 suite
executed six cases on a real Windows host, and the WR-08 gate printed its pass line for the first
time. The added CR-01 leg is correctly constructed and aimed at the argument that was actually
vulnerable.

**The phase goal is substantially achieved.** The `.cmd` spawning contract is real, measured on
real Windows at the shipped commit, and now includes the interpreter path that the Critical fix
changed. The Gemini/Codex approval gap is closed per-CLI with the Codex floor properly failed-closed
and stated in three places. The POSIX wrapper is genuinely deleted against every literal gate.

**What is still not achieved is the phase goal's first clause — "complete the Claude end-to-end
critical path".** That path is complete in code and unexercised end-to-end by anything. Report
PRV-01 at that strength and no higher, exactly as 07-VALIDATION.md § *Vehicle caveat* instructs.

**Residual list (explicit, updated):**

1. ~~No Windows CI run covers HEAD~~ — **CLOSED** by run `32708029055` @ `345b4f5`.
2. ~~`spawn-plan.win32.test.ts` never passes `comspec`~~ — **CLOSED** by commit `345b4f5`.
3. No CLI binary executed anywhere in this phase; no Claude turn on Windows. **(SC-1 residual, reporter-owned, unowned in roadmap)**
4. `index.ts` unimportable under vitest; all its wiring is source-scan + compiler asserted. This
   also bounds the CR-01 closure: `getComspec()`'s own composition (`readParentEnv()` +
   `host?.platform`) is still unexecuted; the *selector* it calls is now measured. **(structural; Phase 9 owns the `caido:plugin` alias)**
5. Caido's LLRT never executed — `windowsVerbatimArguments` source-verified only; assumption A2 open. **(structural)**
6. Gemini's SC-5 real-machine gate open, **and owned by no later phase's success criteria**. **(roadmap gap)**
7. SC-1's reporter confirmation likewise owned by no later phase's success criteria. **(roadmap gap)**
8. SC-3 deviation: literal Caido token at rest in `~/.codex/config.toml` and on the `codex mcp add` argv. Approved; roadmap text unamended by choice. **(accepted trade)**
9. Crash residual unbounded in practice between a hard kill and the next start. **(source-verified idempotence only)**
10. WR-07 unfixed: D-05's "Drift's half" test asserts on a proxy object and its comment overstates it. **(warning)**
11. WR-03 unfixed: a failed `mcp remove` is erased from the provider card when `mcp add` also fails. **(warning — accepted out of scope by the fixer)**
12. 07-05 checkpoint approved as a relayed text read; no rendered card was observed. **(human item)**

---

_Verified: 2026-08-24 (initial pass at `02b403f`; re-verified after gap closure at `345b4f5`)_
_Verifier: Claude (gsd-verifier)_
