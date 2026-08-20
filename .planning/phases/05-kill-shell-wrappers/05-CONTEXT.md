# Phase 5: Kill Shell Wrappers - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the POSIX shell-wrapper launch indirection with a single direct-`node`-spawn keystone
(`buildMcpServerSpec()` → `spawnNode()`) so the MCP self-test and health check pass on **Windows**
for the Claude path — the direct fix for the reported bug — with **zero POSIX regressions**.

Requirements: **RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01** — plus **CI-01 and CI-03 pulled
forward from Phase 9** (D-07/D-09 below; re-target them in the REQUIREMENTS.md traceability table
the same way RUN-04 was re-targeted at the close of Phase 4).

**Explicitly NOT this phase:**

- The `.cmd`/`.bat` shim `EINVAL` guard on **provider** spawns (`buildSpawnSpec`) — **Phase 7**
  (PRV-02). Phase 5 converts the provider spawn's *shape* (D-04) and leaves the Windows extension
  hazard to the phase that owns it.
- Gemini/Codex `--env`/`-e` registration and `DRIFT_TOKEN_FILE` indirection — **Phase 7** (PRV-03),
  whose Codex `${VAR}` expansion the roadmap already marks research-required. See D-01.
- Windows install-location candidates, `where` CRLF parsing, `.exe`-over-`.cmd` preference —
  **Phase 6** (RES-01/02/03). Phase 5 consumes whatever `resolveCommand` returns.
- Process-tree kill / `taskkill` — **Phase 8**.
- Claude end-to-end on Windows (PRV-01) — **Phase 7**. Phase 5 claims the **health check** only.

### Five code facts verified during this discussion — planners must not re-derive them

1. **Copilot already emits the target shape.** `index.ts:2792` writes
   `copilot-mcp-<chatId>.json` as `{ command: <node>, args: [<mjs>], env: buildMcpRuntimeEnv(...) }`.
   This is the working, shipping template for `buildMcpServerSpec()` — not new design. Claude's
   config writer converges on it; it does not invent a shape.
2. **`platform.ts:262` already ships `buildSpawnEnv({ parentEnv, driftVars })`** — Phase 4's SC-9
   merge, already unit-tested. Every new spawn site in this phase calls it. Do not hand-roll
   `{ ...process.env, ...vars }` at a call site.
3. **`finalize()`'s provider-script cleanup is guarded by `if (launchCommand !== resolved)`**
   (`index.ts:3308`). After D-04's conversion that condition is **permanently false**. The branch
   must be **deleted together with the `launchCommand`/`launchArgs` indirection**. Leaving a bare
   `rm(launchCommand)` behind would delete the user's `claude` binary.
4. **`callMcpMethod` writes a THIRD token-bearing script** — `mcp-self-test-<id>.sh`
   (`index.ts:1719`) — whenever `envVars` are supplied, which `runSharedMcpSelfTest`
   (`index.ts:1917`) always does. `spawnNode` passes env directly, so this file stops existing:
   a net **reduction** in token blast radius, not a relocation.
5. **`index.ts` is not importable under vitest.** No test file imports it, and `vitest.config.ts`
   declares no `caido:plugin` alias. SC-2 names `validateCaidoAuth` (`index.ts:1208`) and the
   self-test, both of which live there. D-08 is how that gap is closed honestly.

</domain>

<decisions>
## Implementation Decisions

### Gemini/Codex fallout — what happens when `mcp-wrapper.sh` dies

- **D-01: The shared `mcp-wrapper.sh` SURVIVES on darwin/linux, for Gemini and Codex only, behind
  an `os.platform()` guard. On `win32`, their registration is skipped with a stated reason.**

  The load-bearing fact: `registerMcpWithCli` (`index.ts:2249`) runs `mcp add drift -- <wrapper>`,
  and the wrapper's `export` lines are the **sole** carrier of `CAIDO_URL` / `CAIDO_TOKEN` /
  `DRIFT_ALLOWED_TOOLS` for those two CLIs. Deleting it without also landing Phase 7's
  `--env`/`-e` work is a live **CMP-01 regression** for two shipping providers on the platforms
  the entire user base runs today.

  Rejected: **pulling Phase 7 SC-3 forward.** It would make SC-1 literally true, but it means
  landing the one item the roadmap explicitly marks *research-required* (Codex `${VAR}` expansion
  needs CI confirmation) unverified, on a path with no Windows CI and no critical-path pressure.
  Rejected: **failing them closed** against a bare `node mcp-server.mjs` — literal SC-1 compliance
  bought with a real macOS/Linux regression.

  **Consequence the planner must accept:** `renderExportExecScript` (`:749`), `shellQuote`
  (`:834`), `writeMcpWrapper` (`:1172`) and one `chmod` call survive this phase. **SC-1's wording
  is amended** from "every `.sh` file is deleted from the codebase" to "deleted from the Claude and
  self-test paths." `writeLaunchScript` (`:728`) still dies — see D-04.

- **D-02: The survivor is fenced by BOTH a roadmap re-target AND a code tripwire.** A guarded
  "temporary" survivor with no owner is exactly the thing that becomes permanent — a discipline
  this repo already practises literally, in `windows-llrt-probe.yml`'s header
  (*"the due date is named literally because an undated 'temporary' comment becomes permanent"*).

  1. **Roadmap/requirements:** amend Phase 5 SC-1 as above, and add an explicit **Phase 7**
     success criterion that deletes the remainder. Same move as the RUN-04 re-target at Phase 4's
     close — structural ownership in the traceability table, not a paragraph.
  2. **Code:** head each surviving function with a literal `DELETED IN PHASE 7 (PRV-03)` block,
     and add a test asserting the wrapper path is **unreachable on `win32`**.

- **D-03: The Windows skip is stated in-product AND in the README.** Reuse the existing
  `skippedMcpCliReasons` map (`index.ts:2240`) so the provider status carries a real sentence —
  "Drift MCP is not yet supported for Gemini/Codex on Windows (Phase 7)" — and add a matching
  README line. This is deliberately the **same shape Phase 7 SC-4 already demands** for the
  sensitive-tool gap ("stated in-product and in the README"), so the two land in one voice.

  Rejected: diagnostics-only (a brand-new Windows user never looks); hiding the providers on
  `win32` (frontend/settings work Phase 5 has no other reason to touch, and it silently drops a
  provider the user may have installed).

### The provider launch script

- **D-04: `provider-launch-<sessionId>.sh` (`index.ts:2884`) is converted to a direct spawn on
  ALL platforms — no platform branch.**

  ```ts
  spawn(resolved, args, {
    env: buildSpawnEnv({ parentEnv: process.env, driftVars: runtimeEnv }),
    stdio: ["pipe", "pipe", "pipe"],
  })
  ```

  On POSIX this is **behaviourally identical** — the script only exported-then-`exec`'d, so child
  PID, pipes and effective env all match — and is therefore fully exercised by the existing
  macOS/Linux suite. That is the opposite of shipping Windows-only code no CI can reach, which is
  the trap Phase 4 restructured itself to avoid. It kills `writeLaunchScript` and hands Phase 7 a
  clean seam whose only remaining Windows work is PRV-02's `.cmd` guard.

  Note the honest accounting: because D-01 keeps `renderExportExecScript`/`shellQuote` alive
  anyway, this conversion now buys the deletion of `writeLaunchScript` **alone** — a smaller prize
  than SC-1 implies. It is still correct, because this is the one `.sh` that literally cannot
  execute on Windows, so Phase 7 cannot spawn a provider until it is gone.

  Rejected: win32-only conversion (permanently doubles the launch path and creates a Windows-only
  arm no CI exercises); deferring wholly to Phase 7 (softens SC-1 a second time in one phase).

  **Cleanup:** delete the `launchCommand`/`launchArgs` indirection and the
  `if (launchCommand !== resolved)` branch at `:3308` together. See domain fact 3.

- **D-05: The unverified "is `process.env` complete under LLRT?" risk is REPORTED, not gated.**

  `research/ARCHITECTURE.md` § *Pattern 1* flags this at **MEDIUM** confidence:
  *"confirm `process.env` is fully populated — incl. `PATH` — inside Caido's QuickJS host."*
  Today the `.sh` inherits a real shell environment; after this phase every child receives a dict
  Drift builds from `process.env` **as LLRT sees it**. Phase 3 measured env-replacement on Node,
  not LLRT.

  Add `PATH`-presence and a `process.env` key count to Phase 4's runtime probe as **reported,
  non-gating** results, surfaced in `getDiagnostics` — exactly per Phase 4's **D-06** rule
  ("a primitive with a working fallback REPORTS; one without GATES"). The fallback is real and
  must be stated in the plan: **the MCP server is spawned by absolute `node` path and
  `mcp-server.mjs` spawns nothing itself, so a missing `PATH` cannot break the Phase 5
  health-check path.** It can only bite the provider CLI, which is Phase 7's PRV-01.

  Rejected: gating MCP start on `PATH` — it would refuse to start on a runtime where the health
  check demonstrably works.

### Windows CI evidence for SC-2

- **D-06: `buildMcpServerSpec()` lands in a PURE MODULE, not `index.ts`.**
  `research/ARCHITECTURE.md` offers "`index.ts` or a thin module". The pure module wins for the
  same reason Phase 4 split seven of them: `index.ts` has zero test coverage and cannot be
  imported, so anything left inside it is unverifiable by construction. This is the sixth-plus
  instance of an existing house pattern, not a new one.

- **D-07: CI-01's PERMANENT `windows-latest` build+vitest job is pulled forward into `ci.yml`
  NOW, as a blocking leg.**

  Phase 5 is the first phase with real Windows behaviour to protect, and every later phase
  inherits the net. It also replaces `windows-llrt-probe.yml` with something that **outlives** it,
  rather than investing in a vehicle already stamped *DELETED IN PHASE 9*. Phase 9 then narrows to
  what it is actually for: making the job **required** and green for the right reasons.

  Rejected: extending the LLRT probe (its header says it installs nothing *deliberately*; D-03 of
  Phase 3 means its output pollutes no merge gate — so SC-2's evidence would sit in a job nobody
  must look at, then vanish). Rejected: a third temporary workflow (same continuity problem).

- **D-08: SC-2 is proved by the pure spec module PLUS an integration spawn test that SHARES the
  production builder — with the vehicle caveat recorded verbatim.**

  The test imports **the same `buildMcpServerSpec` `index.ts` calls**, feeds it fixture inputs,
  then spawns `spec.command` / `spec.args` with `spec.env` against a local HTTP stub — the exact
  shape `mcp-server.transport.test.ts` already uses, already cross-platform via `os.tmpdir()`. It
  asserts `--validate-auth` returns `{ok:true}` (HLT-01) and that `tools/list`, `get_environment`
  and `search_history` succeed (HLT-02). **Sharing the builder is what stops the test drifting
  from production**; a reimplementation would prove nothing.

  **Caveat to write into the plan and the phase report, in Phase 3's *vehicle caveat* voice:**
  this proves the **spec**, the **server** and the **spawn contract** on Windows — **not
  `index.ts`'s wiring of them.** Do not report SC-2 as more than that.

  Rejected for this phase: aliasing `caido:plugin` in `vitest.config.ts` to make `index.ts`
  importable. It is the highest-fidelity read of SC-2's wording and would pay off for every later
  phase, but it drags a 4,003-line module of module-level singletons — which `CONCERNS.md` flags
  as having **no reset mechanism between tests** — into the test process, in the same phase that
  is rewriting its launch path. Carried to *Deferred Ideas*.

- **D-09: The Windows leg is BLOCKING from day one, and Phase 5 lands `.gitattributes`.**

  Measured during this discussion, and the reason this is cheap rather than a Phase-9-sized job:
  **`toMatchSnapshot`/`toMatchInlineSnapshot` appear nowhere in the repo** (the "exact-snapshot"
  `provider-launch` tests are `toEqual` on argv arrays, immune to line endings); **exactly one test
  reads a file** (`mcp-server.context.test.ts`) and it writes that file itself into a temp dir; and
  there is **no `.gitattributes` today**. Land `.gitattributes` plus any `\r?\n`-safe assertions
  needed, and re-target **CI-03** into Phase 5 in the traceability table.

  Rejected: a narrow-but-blocking subset (leaves the rest of the suite unguarded on Windows until
  Phase 9); non-blocking `continue-on-error` (a job nobody must heed is the weakness already
  rejected one layer up in D-07).

### Token on disk

- **D-10: Claude's `mcp-<chatId>.json` carries the LITERAL token in its `env` field — byte-identical
  to what `copilot-mcp-<chatId>.json` already does.**

  Phase 5 introduces **no new exposure class**; it moves one file's worth of token from a `0o700`
  `.sh` to a `0o600` `.json`, in the same `0o700`/`%TEMP%` directory, with the same lifetime and
  the same `finalize()` cleanup (`index.ts:3300`). Combined with domain fact 4 (the self-test `.sh`
  disappearing entirely), the phase is a **net reduction** in files that ever hold the token.

  Windows note, already settled in Phase 4 and not reopened: POSIX modes are silently ignored on
  `win32`; the per-user `%TEMP%` ACL is the accepted baseline, and `icacls` hardening (HRD-01) is
  deferred to v2.

  Rejected: `${CAIDO_TOKEN}` indirection now — it makes config correctness depend on a
  variable-expansion behaviour the roadmap already says needs CI confirmation, and its failure mode
  is a **silently unauthenticated** MCP server rather than a loud error. Rejected:
  `DRIFT_TOKEN_FILE` for every provider — the right end state, and what Phase 7 wants for Codex,
  but a **new cross-provider mechanism designed in the phase whose job is deleting mechanisms**,
  and it would require teaching `mcp-server.mjs` to read it.

- **D-11: The session debug log logs command + args + injected env KEY NAMES — never values.**

  This is not a fresh judgement call. `platform.ts:262` already carries the rule as a comment:
  `buildSpawnEnv` *"returns data only and must never be used to render an environment into a log or
  diagnostic (T-04-04)"*. The wrapper-content dump at `index.ts:2910` has no successor because
  there is no wrapper; the **config**-content dump at `:2920` stays as-is, since
  `redactDebugText`'s JSON arm already covers it.

  Rejected: dumping the full merged env redacted — it contradicts T-04-04, and a regex redactor
  over a whole environment **fails open**: it protects the keys someone thought to enumerate.
  Rejected: dropping the spawn logging entirely — it goes blind for exactly the providers whose env
  arrives only via `spawn`, which is where a Windows env problem surfaces first.

### Claude's Discretion

Recorded as the discussed-and-agreed starting point — **not** unexamined gaps.

- **RUN-04 is satisfied structurally, by deletion.** The write→`chmod`→`rename`→exec pairs
  `04-RESEARCH.md` names as the best-documented AV case are `writeLaunchScript` (`:728`) and
  `writeMcpWrapper` (`:1172`) — the very sites this phase removes from the Claude/self-test path.
  The surviving one-time `mcp-server.mjs` staging copy is **already** inside `withFsRetry`
  (`index.ts:2467`). Planner decides whether the MCP **config JSON** writes also earn a retry
  ladder; they are read by the CLI, not exec'd, so the AV write-then-exec race does not apply.
- **Whether `buildMcpRuntimeEnv` (`index.ts:1013`) also moves into the pure spec module.** Moving
  it makes the whole env dict Linux-testable, but it reads `currentSettings` today, so settings
  would have to be injected. Raised, and left to the planner.
- **Plan split.** The roadmap's provisional count is **2**. This discussion added a CI leg, a
  `.gitattributes`/CI-03 slice, a pure-module extraction and an integration spawn test. Treat 2 as
  provisional, not binding.
- **Naming/lifecycle of the surviving Gemini/Codex wrapper** now that the self-test no longer uses
  it (`getMcpWrapperPath`, `:921`). Raised and left to the planner.
- **Whether `redactDebugText`'s shell arm** (`(CAIDO_TOKEN=)'[^']*'`) is removed as dead once no
  code dumps shell-shaped content. Cosmetic; planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The design already specified for THIS phase — binding

- `.planning/research/ARCHITECTURE.md` — the `buildMcpServerSpec()` → `spawnNode()` keystone.
  § *TL;DR* and § *System Overview* (the "what disappears" list), § *Component Responsibilities*,
  and **§ *Pattern 1*, whose MEDIUM-confidence `process.env` completeness flag is the source of
  D-05**. § *Pattern 2* is the one-spec-many-consumers rule the config writers must follow.

### Phase 3's measured verdict — binding on every spawn site

- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — **cite this file,
  never the CI artifacts, which expire 2026-09-12.** Three results bind Phase 5:
  1. The spawn `env` option **REPLACES** the parent block on Windows as on POSIX
     (marker `PARENT-CLEARED`, [run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574));
     libuv back-fills only eleven `required_vars` and `APPDATA`/`LOCALAPPDATA` are **not** among
     them. Every new `env`-supplying spawn goes through `buildSpawnEnv`.
  2. Direct `.cmd` spawn throws `EINVAL` **synchronously** from Node's CVE-2024-27980 guard — a
     `try`/`catch` around `spawn()`, not just an `error` handler. Phase 7 owns the fix; Phase 5
     must not accidentally claim provider spawns work on Windows.
  3. § *Vehicle caveat* — the platform is measured, the runtime is inferred. **D-08's caveat is
     the same discipline; carry it verbatim.**
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-CONTEXT.md` — **D-10** (the
  no-secret-material CI gate this phase's new Windows leg inherits) and **D-11/D-12/D-13** (a CI
  claim is recorded with its run URL and the log line proving the mechanism, written *after*
  reading the real run, never pre-filled). **D-02/D-03** there are why `windows-llrt-probe.yml`
  is a separate file — read before touching it.

### Phase 4's decisions — the substrate this phase consumes

- `.planning/phases/04-platform-foundation/04-CONTEXT.md` — **D-01** (`platform.ts`'s
  `{ ...input }` convention), **D-02** (`os` read exactly once, cached in `host`), **D-05/D-06**
  (the hard-fail policy and the REPORT-vs-GATE rule that D-05 above applies), **D-07** (the probe
  wraps the real first write; RUN-04 and RUN-05 are one mechanism).

### Requirements and roadmap

- `.planning/REQUIREMENTS.md` — RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01 are this phase.
  **Read the § *Re-targeted to Phase 5 at the close of Phase 4* note in full** — it names
  `writeLaunchScript` (`:728`) and `writeMcpWrapper` (`:1172`) as RUN-04's unfinished half and
  explains why. **This phase adds CI-01 and CI-03 to that table** (D-07/D-09).
- `.planning/ROADMAP.md` § *Phase 5: Kill Shell Wrappers* (the four success criteria — **SC-1's
  wording is amended by D-01/D-02**), § *Phase 6*, § *Phase 7* (the PRV-02/PRV-03 boundary D-01 and
  D-04 lean on), § *Phase 9* (CI-01/CI-03, now partly here), and § *Critical Path*.
- `.planning/PROJECT.md` § *Constraints* — the QuickJS/LLRT constraint, "the maintainer cannot test
  native Windows locally", and the Windows temp-file ACL trade-off.

### Codebase ground truth

- `.planning/codebase/ARCHITECTURE.md` — the `startMcpServer` bootstrap trace and the
  § *POSIX Surface — Every Place That Must Change for Windows* table.
- `.planning/codebase/CONCERNS.md` — in particular the module-level-singleton item (no reset
  mechanism between tests), which is why D-08 defers the `caido:plugin` alias.
- `packages/backend/src/index.ts` — the sites this phase edits:
  `writeLaunchScript` **:728**, `renderExportExecScript` **:749**, `shellQuote` **:834**,
  `getMcpWrapperPath` **:921**, `buildMcpRuntimeEnv` **:1013**, `writeMcpWrapper` **:1172**,
  `validateCaidoAuth` **:1208**, `callMcpMethod` **:1710** (self-test `.sh` at **:1719**),
  `runSharedMcpSelfTest` **:1917**, `skippedMcpCliReasons` **:2240**, `registerMcpWithCli` **:2249**,
  the `startMcpServer` wrapper+validate pair **:2524–2532**, the Claude session wrapper **:2729**,
  the Copilot config writer (**the template**) **:2792**, the provider launch script **:2884**,
  the debug dumps **:2910/:2920**, and `finalize()`'s cleanup **:3300–3311**.
- `packages/backend/src/platform.ts:262` — `buildSpawnEnv`, and the **T-04-04** comment that
  decides D-11.
- `packages/backend/src/mcp-server.transport.test.ts` — the integration-spawn test shape D-08
  copies (local HTTP stub, `os.tmpdir()` temp dir, real `node` + `.mjs` child).
- `.github/workflows/ci.yml` (the four Node legs D-07 adds a Windows job beside) and
  `.github/workflows/windows-llrt-probe.yml` (**read its header** — the dated-deletion discipline
  D-02 copies).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`index.ts:2792`, the Copilot MCP config writer** — already emits
  `{ command, args, env }`. `buildMcpServerSpec()` generalises **this**, shipping code, rather than
  designing something new. Claude's writer becomes a second caller.
- **`platform.ts:262` `buildSpawnEnv({ parentEnv, driftVars })`** — Phase 4's SC-9 merge, already
  unit-tested on Linux. Every new spawn site uses it; no call site hand-rolls the spread.
- **`index.ts:1013` `buildMcpRuntimeEnv`** — already produces the exact `Record<string,string>` the
  spec's `env` field needs, and already has four callers (`:1186`, `:1929`, `:2695`, `:2796`).
  The spec consumes it unchanged unless the planner moves it (Claude's Discretion).
- **`writeChatMcpConfig` (`index.ts:711`)** — already writes `{ mcpServers: { drift: server } }`
  via `writeTemp` (`mkdir 0o700` + `writeFile 0o600`) and already accepts an optional `env`. Claude's
  path starts passing `env`; the function itself barely changes.
- **`withFsRetry` (`fs-retry.ts`, sole call site `index.ts:2467`)** — Phase 4's RUN-04 ladder,
  available if the planner extends it to the config-JSON writes.
- **`skippedMcpCliReasons` (`index.ts:2240`)** — the existing mechanism D-03 reuses for the Windows
  Gemini/Codex message; it already feeds diagnostics.
- **`mcp-server.transport.test.ts` / `.context.test.ts` / `.allowlist.test.ts`** — three existing
  tests that already spawn `node mcp-server.mjs` with env against a stub, on any platform. D-08's
  test is a fourth instance of a working pattern.

### Established Patterns

- **Pure helpers split from I/O for testability** — now ~11 modules, each with a sibling
  `.test.ts`. D-06's spec module is another instance, not a new idea.
- **Platform decisions are pure functions of `(platform, env)`**; `index.ts` reads `os`/`process.env`
  once and passes them in (Phase 4 D-01/D-02).
- **REPORT vs GATE** (Phase 4 D-06) — D-05 applies it to `process.env` completeness.
- **Dated deletion notices** — `windows-llrt-probe.yml`'s header is the in-repo precedent D-02 copies.
- **Claims are recorded with evidence, not ticks** — every CI claim carries its run URL and the log
  line proving the mechanism (Phase 3 D-11/D-12/D-13).
- **QuickJS constraints are absolute:** no Zod, no dynamic `require`, no `import.meta`, no `crypto`.

### Integration Points

- **New:** a pure module exporting `buildMcpServerSpec()` (+ its `.test.ts`), and the D-08
  integration spawn test.
- **New:** a `windows-latest` job in `.github/workflows/ci.yml`, plus `.gitattributes` at the repo
  root.
- **`index.ts:2524–2532`** — `startMcpServer`'s `writeMcpWrapper` → `validateCaidoAuth` pair
  becomes `buildMcpServerSpec()` → `spawnNode(spec, ["--validate-auth"])`. The Gemini/Codex
  registration below it keeps the wrapper on POSIX (D-01).
- **`index.ts:1710–1740` `callMcpMethod`** — drops the `writeLaunchScript` branch entirely and
  takes the spec, passing env to `spawn` directly. `runSharedMcpSelfTest` (`:1917`) follows.
- **`index.ts:2729–2760`** — the Claude session wrapper is replaced by writing the spec into
  `mcp-<chatId>.json`'s `env`, exactly as Copilot does at `:2792`.
- **`index.ts:2878–2896`** — the provider spawn conversion (D-04), and **`:3308`** its paired
  cleanup deletion.
- **Test-suite guard:** the `provider-launch` exact-`toEqual` tests are the CMP-01 tripwire.
  Nothing here should move them.

</code_context>

<specifics>
## Specific Ideas

- Write the Claude config through the **same** `buildMcpServerSpec()` projection Copilot uses —
  one spec, two callers — rather than two writers that happen to agree today.
- The D-08 integration test must import the **production** builder. If a reviewer can point at a
  second copy of the spec-building logic inside the test, the test is not evidence.
- D-08's caveat is written into the plan **and** the phase report, phrased so a reader cannot
  mistake it for a full end-to-end Windows claim: it proves the spec, the server and the spawn
  contract — not `index.ts`'s wiring.
- The `DELETED IN PHASE 7 (PRV-03)` header (D-02) is a **literal string**, matching
  `windows-llrt-probe.yml`'s "TEMPORARY — DELETED IN PHASE 9 (D-02)" so both are greppable by the
  same pattern.
- D-03's user-facing sentence should name the phase, not just the limitation — a Windows user who
  reads "not yet supported … (Phase 7)" knows it is sequenced work, not a dead end.

</specifics>

<deferred>
## Deferred Ideas

- **Alias `caido:plugin` in `vitest.config.ts` so `index.ts` becomes importable.** The
  highest-fidelity way to satisfy SC-2's literal wording, and it would pay off for every phase
  after this one. Deferred out of Phase 5 because it drags a 4,003-line module of module-level
  singletons — flagged in `CONCERNS.md` as having no reset mechanism between tests — into the test
  process during the very phase that rewrites its launch path. Natural home: Phase 9, alongside the
  CI hardening it would strengthen.
- **Gemini/Codex `--env`/`-e` registration and `DRIFT_TOKEN_FILE` indirection** — Phase 7 PRV-03,
  and the work that finally deletes D-01's surviving wrapper.
- **`.cmd`/`.bat` `EINVAL` guard on provider spawns (`buildSpawnSpec`)** — Phase 7 PRV-02, the only
  Windows work left on the seam D-04 opens.
- **Gemini/Codex per-session approval + activity channel** — Phase 7 PRV-05. Related but distinct:
  the shared wrapper is built without `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE` (`index.ts:2524`),
  so those two CLIs' sensitive tools fail closed with no activity trace. D-01 keeps that status quo
  on POSIX; it does not fix or worsen it.
- **`icacls` ACL hardening of the Windows temp dir (HRD-01)** — deferred to v2 in STATE.md. The
  per-user `%TEMP%` ACL is the accepted baseline for D-10's token file.
- **Phase 2 (POSIX Correctness & Hardening) is still `Not started`** while Phase 5 is planned. Its
  **SEC-02** (`sessionId`/`chatId` validated against a strict character set before path
  interpolation) applies to `mcp-<chatId>.json`, which D-10 makes token-bearing for Claude. Phase 5
  does not absorb SEC-02 — but it slightly raises the stakes on it.
- **Repo-wide Prettier sweep (backlog 999.11)** — would rewrite the functions D-01 holds byte-stable
  behind a deletion notice. Stays sequenced after Phase 8.
- **Real-machine confirmation from the original Windows reporter (@0xMRK0S)** — Phase 9/10. It is
  what finally closes the LLRT residual risk that D-05 and D-08 both reason around.

</deferred>

---

*Phase: 05-kill-shell-wrappers*
*Context gathered: 2026-08-20*
