# Phase 5: Kill Shell Wrappers - Research

**Researched:** 2026-08-20
**Domain:** Cross-platform process launch (direct `node` spawn + structured `env` injection) inside Caido's LLRT/QuickJS runtime, plus the first permanent `windows-latest` CI leg
**Confidence:** HIGH for the runtime surface and the CI mechanics (both read from primary source or measured in this session); MEDIUM for the Windows AV read-race; LOW for nothing load-bearing

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: The shared `mcp-wrapper.sh` SURVIVES on darwin/linux, for Gemini and Codex only, behind an `os.platform()` guard. On `win32`, their registration is skipped with a stated reason.** `renderExportExecScript` (`:749`), `shellQuote` (`:834`), `writeMcpWrapper` (`:1172`) and one `chmod` call survive this phase. **SC-1's wording is amended** from "every `.sh` file is deleted from the codebase" to "deleted from the Claude and self-test paths." `writeLaunchScript` (`:728`) still dies — see D-04.
- **D-02: The survivor is fenced by BOTH a roadmap re-target AND a code tripwire.** (1) Amend Phase 5 SC-1 and add an explicit Phase 7 success criterion deleting the remainder. (2) Head each surviving function with a literal `DELETED IN PHASE 7 (PRV-03)` block, and add a test asserting the wrapper path is **unreachable on `win32`**.
- **D-03: The Windows skip is stated in-product AND in the README.** Reuse `skippedMcpCliReasons` (`index.ts:2240`) so the provider status carries a real sentence — "Drift MCP is not yet supported for Gemini/Codex on Windows (Phase 7)" — and add a matching README line.
- **D-04: `provider-launch-<sessionId>.sh` (`index.ts:2884`) is converted to a direct spawn on ALL platforms — no platform branch.** `spawn(resolved, args, { env: buildSpawnEnv({ parentEnv: process.env, driftVars: runtimeEnv }), stdio: ["pipe","pipe","pipe"] })`. **Cleanup:** delete the `launchCommand`/`launchArgs` indirection and the `if (launchCommand !== resolved)` branch at `:3308` together.
- **D-05: The unverified "is `process.env` complete under LLRT?" risk is REPORTED, not gated.** Add `PATH`-presence and a `process.env` key count to Phase 4's runtime probe as reported, non-gating results, surfaced in `getDiagnostics`. The fallback is real and must be stated in the plan: the MCP server is spawned by absolute `node` path and `mcp-server.mjs` spawns nothing itself, so a missing `PATH` cannot break the Phase 5 health-check path.
- **D-06: `buildMcpServerSpec()` lands in a PURE MODULE, not `index.ts`.**
- **D-07: CI-01's PERMANENT `windows-latest` build+vitest job is pulled forward into `ci.yml` NOW, as a blocking leg.**
- **D-08: SC-2 is proved by the pure spec module PLUS an integration spawn test that SHARES the production builder — with the vehicle caveat recorded verbatim.** It proves the **spec**, the **server** and the **spawn contract** on Windows — **not `index.ts`'s wiring of them.**
- **D-09: The Windows leg is BLOCKING from day one, and Phase 5 lands `.gitattributes`.** Re-target **CI-03** into Phase 5 in the traceability table.
- **D-10: Claude's `mcp-<chatId>.json` carries the LITERAL token in its `env` field — byte-identical to what `copilot-mcp-<chatId>.json` already does.**
- **D-11: The session debug log logs command + args + injected env KEY NAMES — never values.** The wrapper-content dump at `index.ts:2910` has no successor; the config-content dump at `:2920` stays as-is.

### Claude's Discretion

- **RUN-04 is satisfied structurally, by deletion.** Planner decides whether the MCP **config JSON** writes also earn a retry ladder; they are read by the CLI, not exec'd, so the AV write-then-exec race does not apply.
- **Whether `buildMcpRuntimeEnv` (`index.ts:1013`) also moves into the pure spec module.** Moving it makes the whole env dict Linux-testable, but it reads `currentSettings` today, so settings would have to be injected.
- **Plan split.** The roadmap's provisional count is **2**. Treat 2 as provisional, not binding.
- **Naming/lifecycle of the surviving Gemini/Codex wrapper** (`getMcpWrapperPath`, `:921`).
- **Whether `redactDebugText`'s shell arm** (`(CAIDO_TOKEN=)'[^']*'`) is removed as dead.

### Deferred Ideas (OUT OF SCOPE)

- Alias `caido:plugin` in `vitest.config.ts` so `index.ts` becomes importable — natural home Phase 9.
- Gemini/Codex `--env`/`-e` registration and `DRIFT_TOKEN_FILE` indirection — Phase 7 PRV-03.
- `.cmd`/`.bat` `EINVAL` guard on provider spawns (`buildSpawnSpec`) — Phase 7 PRV-02.
- Gemini/Codex per-session approval + activity channel — Phase 7 PRV-05.
- `icacls` ACL hardening of the Windows temp dir (HRD-01) — v2.
- Phase 2's **SEC-02** (`sessionId`/`chatId` character-set validation) — not absorbed here.
- Repo-wide Prettier sweep (backlog 999.11) — sequenced after Phase 8.
- Real-machine confirmation from @0xMRK0S — Phase 9/10.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **RUN-01** | On native Windows, the Drift MCP server starts with no POSIX dependency — `node` spawned directly, no `chmod`, no `#!/bin/bash` wrapper, no `.sh` execution | § *Complete Site Inventory* names all 12 edit sites incl. **the one CONTEXT.md missed** (`refreshActiveMcpRuntime`, `:1541`). § *Pitfall 1* separates the two shell `chmod` spawns from Phase 4's `fs.chmod` namespace call that must NOT be deleted |
| **RUN-02** | The MCP env (token, `DRIFT_*`) reaches the server via spawn `env` / config-JSON `env`, not a shell `export` | § *LLRT Runtime Surface* finding **L-2** — source-verified that LLRT's `spawn` honours `env` via `env_clear()` + `envs()`. Finding **L-4** is the one that changes the plan: Rust does **not** back-fill libuv's eleven `required_vars`, so `buildSpawnEnv`'s parent spread is load-bearing *harder* under LLRT than the Node vehicle can show |
| **RUN-04** | Temp-file write→spawn path tolerates the Windows AV race | § *RUN-04 After the Rewrite* — the write→**read** case is materially weaker than write→**exec** (share-mode compatibility + the app-compat handle being `.EXE`-specific). Recommendation and its cost are both stated |
| **HLT-01** | On Windows, `validateCaidoAuth` succeeds for the Claude path | § *Validation Architecture* rows V-12/V-15 — D-08's integration test asserts `--validate-auth` → `{ok:true}` against a local stub, on both runners. § *Code Examples* #2 gives the shape |
| **HLT-02** | On Windows, the MCP self-test (`tools/list`, `get_environment`, `search_history`) passes for the Claude path | Same test; § *Code Examples* #2. `mcp-server.transport.test.ts:124-190` is the working cross-platform template |
| **CMP-01** | macOS/Linux behaviour preserved; existing tests stay green | § *CMP-01 Tripwires* — measured baseline **263 tests / 29 files / 779 ms, green** (this session). D-04's POSIX-identical argument is examined and holds, with one caveat (§ *Pitfall 5*) |
| **CI-01** *(pulled forward, D-07)* | A `windows-latest` job builds the plugin and runs vitest | § *The `windows-latest` CI Leg* — **the root `build` script cannot run on Windows**, and § *Finding C-1* shows (measured) that its POSIX tail is redundant, which makes the leg cheap |
| **CI-03** *(pulled forward, D-09)* | Windows CI green for the right reasons — `.gitattributes`, `\r?\n`-tolerant assertions, pinned shell | § *Verifying D-09's Measurement* — re-measured independently this session; all three claims confirmed, plus two additional Windows-green risks D-09 did not measure |
</phase_requirements>

---

## Summary

Three findings change what the plan should contain, and none of them re-litigates a locked decision.

**First, the runtime surface is now source-verified rather than MEDIUM-flagged, and it moved in an unexpected direction.** `research/ARCHITECTURE.md` § *Pattern 1* flags at MEDIUM: *"confirm `process.env` is fully populated — incl. `PATH` — inside Caido's QuickJS host."* Reading `caido/dependency-llrt@main` directly this session settles it: `process.env` is built from `std::env::vars()` with **no filtering**, so it is exactly as complete as the Caido host process's own environment. But the same read surfaced something the discussion could not have known: LLRT's `spawn` implements the `env` option as `command.env_clear(); command.envs(env);` on a Rust `std::process::Command`, and **Rust's Windows `make_envp` writes exactly the supplied map with no back-fill** — unlike libuv, which silently restores eleven names including `PATH` and `SYSTEMROOT`. Phase 3 measured `PARENT-CLEARED` on Node and concluded "the `env` option replaces, spread `process.env`". That conclusion is *correct and stronger under the real runtime than under the vehicle that proved it* — and it means a regression to a bare `driftVars` dict would pass every test on Node CI and fail on a real Windows Caido install. That asymmetry belongs in a static gate, not a comment.

**Second, the `windows-latest` leg is blocked by a POSIX shell one-liner nobody has needed to look at — and the fix is a deletion, not a port.** `package.json:25`'s `build` script chains `cp -r`, `2>/dev/null`, `;`, `rm -f`, `cd` and `zip -r`; on `windows-latest` the script shell is `cmd.exe` (pnpm's `scriptShell` default is `null`), `zip` is absent from the runner image's software manifest, and none of those verbs exist. Measured this session: `caido-dev build` **on its own** already emits `dist/plugin_package.zip` with `backend/assets/mcp-server.mjs` inside it and an entry-name set identical to the full script's — because `caido.config.ts:30` already declares the asset glob and `caido-dev`'s own JSZip bundler picks it up. The POSIX tail is dead weight left over from before that glob existed. Reducing `build` to `caido-dev build` makes D-07's leg work with zero shell porting, and is the difference between a cheap CI slice and a Phase-9-sized one.

**Third, `index.ts` has a third `writeMcpWrapper` → `validateCaidoAuth` pair that CONTEXT.md's site list does not name.** `refreshActiveMcpRuntime` (`index.ts:1541`) runs on **settings save** (`:1521`) and on **Caido token sync** (`:1596`), writes the shared `mcp-wrapper.sh`, validates auth through it, and calls `cleanupMcpRuntime` on failure. If the plan converts only the two sites CONTEXT.md names (`:2524–2532` and `:2729`), then on Windows the first token refresh after a successful start tears down a working MCP runtime. This is the single highest-value codebase finding in this document.

**Primary recommendation:** build the spec module around a `buildMcpServerSpec({ nodeExecutable, mcpScriptPath, runtimeEnv, parentEnv })` → `{ command, args, env }` signature whose `env` is produced by `buildSpawnEnv`, route **all three** `writeMcpWrapper` sites and **both** `validateCaidoAuth` sites through it, reduce the root `build` script to `caido-dev build`, and make "every `env`-supplying spawn goes through `buildSpawnEnv`" a static gate rather than a convention.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deciding *how* the MCP server is launched (`{command,args,env}`) | **Pure module** (new, D-06) | — | Injected inputs only; the whole point of D-06 is that `index.ts` is unverifiable by construction |
| Merging parent env with Drift vars | **Pure module** (`platform.ts:262` `buildSpawnEnv`) | — | Already exists and is unit-tested (Phase 4 SC-9). No call site hand-rolls the spread (CONTEXT.md domain fact 2) |
| Projecting the spec into Claude/Copilot config JSON | **Pure module** (spec module) | `index.ts` writes the file | Pattern 2 (one spec, many consumers) is only real if the projection itself is testable |
| Actually spawning (`spawn`, `stdio`, event wiring) | **`index.ts` orchestrator** | — | I/O and module-level state live here by house convention (Phase 4 D-01/D-02) |
| Resolving the absolute `node` path | **`command-resolution.ts` + `index.ts`** | Phase 6 extends | Phase 5 consumes whatever `resolveCommand` returns (CONTEXT.md § *Explicitly NOT this phase*) |
| Deciding whether Gemini/Codex register at all | **Pure module** (platform predicate) | `index.ts` acts | D-02 demands a test asserting the wrapper path is unreachable on `win32` — that needs a pure predicate to assert against |
| Rendering the spawn debug line | **Pure module** (new formatter) | `index.ts` appends | D-11 forbids values in the log; a pure formatter is the only way to assert "keys, never values" |
| Windows platform truth (build + suite green) | **CI (`windows-latest`)** | — | The maintainer cannot test native Windows locally (PROJECT.md § *Constraints*) |
| Caido LLRT runtime truth | **Nothing available** | Source analysis + Phase 9/10 real-machine check | The vehicle caveat. See § *Validation Architecture* bucket **N** |

---

## Project Constraints (from CLAUDE.md)

Directives extracted from `./CLAUDE.md` that constrain this phase. The planner must verify compliance; none of the findings below contradicts any of them.

| Directive | Source | Bearing on Phase 5 |
|---|---|---|
| Preserve existing macOS/Linux behaviour; no POSIX regressions | § *Constraints* | CMP-01. D-04's POSIX-identical claim is examined in § *Pitfall 5* |
| Backend runs in a constrained JS runtime; only use Node APIs Caido actually provides. Zod crashes QuickJS | § *Constraints*, § *Backend Constraints* | The spec module must be plain TS with no schema library. Confirmed: `spawn` options `env`, `stdio`, `cwd`, `shell`, `detached`, `windowsVerbatimArguments`, `uid`/`gid` are supported; **`windowsHide` is not** (§ finding L-3) |
| No Zod, no dynamic `require`, no `import.meta`, no `crypto` | § *Architectural Constraints* | The new module inherits this. `genUUID`'s hex loop stays (Phase 3 P3-UUID) |
| Runtime temp files carry the Caido token (`0o600`/`0o700`); Windows ignores POSIX modes | § *Constraints* | D-10. `writeTemp` (`index.ts:691-699`) already applies both modes; the mode args stay unconditional (Phase 4 T-04-30) |
| kebab-case source files; test file mirrors its source | § *Naming Patterns* | The new module is e.g. `mcp-server-spec.ts` + `mcp-server-spec.test.ts` |
| `type` preferred over `interface`; discriminated unions use a `kind` field | § *Naming Patterns* | The spec type is a plain `type` |
| ASCII box headers delimit top-level sections in `index.ts` | § *Code Style* | Any new top-level section in `index.ts` follows this |
| `pnpm lint` runs `eslint . --max-warnings 0` and never auto-fixes; `pnpm typecheck` runs `tsc --noEmit` + `vue-tsc --noEmit` | § *Configuration* | Both are phase gates. `noUnusedLocals` means a deleted function's now-orphaned helper is a **build failure**, not a warning — plan the deletions as a set |
| Pure helpers split from I/O for testability | § *Pure Helpers Split* | D-06 is the ~12th instance |
| The maintainer cannot test native Windows locally; validation is CI on `windows-latest` | § *Constraints* | The entire § *Validation Architecture* is designed around this |

---

## Standard Stack

**This phase adds no runtime dependencies.** It deletes code and moves logic into an existing pure-module pattern. The stack below is what the phase *uses*, all already present at the versions shown.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `child_process` (Caido-provided) | LLRT `main` | `spawn` with the `env` option | The only launch primitive Caido exposes; source-verified to honour `env` **[VERIFIED: caido/dependency-llrt@main modules/llrt_child_process/src/lib.rs:468-475, read this session]** |
| `vitest` | 4.0.18 | Unit + integration spawn tests | Already the repo's runner; `vitest.config.ts` at root **[VERIFIED: package.json:44, vitest.config.ts]** |
| `os` (Caido-provided) | LLRT `main` | `platform()`, `tmpdir()` | Phase 4 already reads it exactly once and caches in `host` (Phase 4 D-02) |
| `@caido-community/dev` | 0.1.6 | `caido-dev build` — bundler + JSZip packager | Already the build tool; measured this session to produce the complete zip unaided |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pnpm/action-setup` | `@v6` | pnpm on the CI runner | Must run **before** `actions/setup-node@v5` — see § *CI Gotcha C-2* |
| `actions/setup-node` | `@v5` | Node 20 on the CI runner | `cache: pnpm` only works if pnpm already exists |
| `actions/checkout` | `@v5` | — | Matches `ci.yml:28` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `caido-dev build` alone as the whole `build` script | Keep the POSIX tail, add `scriptShell` = Git Bash in `.npmrc` | Gives you `cp`/`rm` on Windows but **still no `zip`** (absent from the runner image manifest). Solves nothing and adds a shell dependency to every contributor's machine |
| `caido-dev build` alone | Rewrite the tail as `scripts/build-package.mjs` in Node | Correct if the tail did something; measured, it does not (§ *Finding C-1*). Writing a Node script to reproduce a no-op is pure cost |
| A pure `mcp-server-spec.ts` module | `buildMcpServerSpec()` inline in `index.ts` (what `research/ARCHITECTURE.md` offers as an option) | **Locked closed by D-06.** Inline = bucket **N**, unverifiable by construction |
| `buildSpawnEnv({ parentEnv: process.env, … })` | `{ ...process.env, ...vars }` at each call site | Locked closed by CONTEXT.md domain fact 2. And § finding L-4 shows the consequence of getting it wrong is *invisible on the Node CI vehicle* |

**Installation:** none. `pnpm install --frozen-lockfile` is unchanged; `pnpm-lock.yaml` is not touched by this phase.

---

## Package Legitimacy Audit

**This phase installs no external packages.** No `npm install`, no lockfile change, no new `devDependencies` entry. The Package Legitimacy Gate is therefore **not applicable**, and no package name in this document was sourced from a registry search.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no packages added)* | — | — | — | — | — | — |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

The three GitHub Actions referenced (`pnpm/action-setup@v6`, `actions/setup-node@v5`, `actions/checkout@v5`) are **already pinned in this repo's `ci.yml`** at exactly those major versions **[VERIFIED: .github/workflows/ci.yml:28-42, read this session]** — the Windows leg reuses the existing pins rather than introducing new supply-chain surface. ROADMAP § *Phase 9 SC-1* records why `@v4` was replaced (deprecated Node 20 actions runtime).

---

## LLRT Runtime Surface — the source read this phase depends on

Phase 4's `04-RESEARCH.md` set the standard here by reading `caido/dependency-llrt@main`'s Rust source directly and overturning three planning assumptions. The same read was done for Phase 5's surface. **Every finding below was obtained by downloading the file and grepping it in this session** — not from `API.md`, which `04-RESEARCH.md` § *Pitfall 7* documents as trailing the code.

### L-1 — `process.env` is the COMPLETE parent environment. The MEDIUM flag is resolved.

`research/ARCHITECTURE.md` § *Pattern 1* is the source of D-05: *"MEDIUM: confirm `process.env` is fully populated — incl. `PATH` — inside Caido's QuickJS host."*

```rust
let env_map: HashMap<String, String> = env::vars().collect();
…
let env_obj = env_map.into_js(ctx)?;
let env_proxy = Proxy::with_target(ctx.clone(), env_obj)?;
env_proxy.setter(Func::from(env_proxy_setter))?;
process.set("env", env_proxy)?;
```

**[VERIFIED: caido/dependency-llrt@main `modules/llrt_process/src/lib.rs:148,158-163`, downloaded and read this session]**

`std::env::vars()` is the whole block, unfiltered. **`process.env` under LLRT is exactly as complete as the environment of the Caido process itself.** The plain `Object` behind a setter-only `Proxy` means `Object.entries(process.env)` — which is what `buildSpawnEnv` iterates (`platform.ts:266`) — works normally.

**What this does and does not license.** It closes "does LLRT curate `process.env`?" (it does not). It does **not** close "does the Caido host process have a useful `PATH`?" — a different question with a real negative case: a macOS app launched from Finder/Dock inherits a minimal `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), which is precisely why `command-resolution.ts` carries hardcoded candidate paths at all. So D-05's reported probe metric should be **`PATH` entry count**, not a `PATH`-present boolean: "present but 4 entries" is the interesting Windows/macOS signal, and a boolean cannot express it. `[VERIFIED: source]` for the LLRT half; the host-process half is `[ASSUMED]` (A1) until a real Windows Caido install reports.

Note also: the proxy setter writes to the JS target only — it does **not** call `std::env::set_var`. `process.env.X = "y"` therefore does not affect a later child's inherited block. Irrelevant to Drift (which always supplies `env` explicitly) but worth knowing before anyone "fixes" a missing var that way.

### L-2 — LLRT's `spawn` DOES honour `env`, and it REPLACES the parent block.

```rust
if let Some(env) = opts.get_optional::<_, HashMap<String, Coerced<String>>>("env")? {
    let env: HashMap<String, String> = env
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    command.env_clear();
    command.envs(env);
}
```

**[VERIFIED: caido/dependency-llrt@main `modules/llrt_child_process/src/lib.rs:468-475`, downloaded and read this session]**

This is the load-bearing confirmation for RUN-02: the mechanism that replaces the `#!/bin/bash` `export` wrapper is real in the runtime Drift actually runs on, not merely in the Node vehicle Phase 3 measured. `env_clear()` + `envs()` is replace semantics, matching Phase 3's `PARENT-CLEARED` result (`03-FINDINGS.md` § *P0-ENV — replace versus merge*, [run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574)) and matching `buildSpawnEnv`'s existing comment at `platform.ts:246-261`.

### L-3 — Supported `spawn` options, exhaustively. `windowsHide` is NOT among them.

Parsed from the same file, options block `lib.rs:395-505`:

| Option | Supported by LLRT | Note |
|---|---|---|
| `env` | **yes** | replace semantics (L-2) |
| `stdio` | **yes** | string form *and* the `["pipe","pipe","pipe"]` array form Drift uses (`lib.rs:477-501`) |
| `cwd` | yes | `command.current_dir` |
| `shell` | yes | `true` → `"cmd.exe"` on Windows / `"/bin/sh"` elsewhere; a string is used verbatim |
| `detached` | yes | Windows sets `creation_flags(0x00000008)` = `DETACHED_PROCESS`; Unix `process_group(0)` |
| `windowsVerbatimArguments` | yes | Windows only |
| `uid` / `gid` | yes | `#[cfg(unix)]` only |
| **`windowsHide`** | **NO** | **not parsed at all** |

**[VERIFIED: `modules/llrt_child_process/src/lib.rs:395-505`]**

Two consequences. **(a) Phase 5's spawn shape is fully supported** — `{ env, stdio: ["pipe","pipe","pipe"] }` is exactly what LLRT parses, so the keystone needs nothing exotic. **(b) UX-04's `windowsHide: true` on all spawns (Phase 10) is a silent no-op under LLRT.** Passing it is harmless (unknown keys are ignored), but it will not suppress a console window. Phase 5 does not own UX-04 — record it so Phase 10 does not discover it by shipping. **Also note for Phase 7:** `shell: true` maps to a bare `"cmd.exe"` with `windowsVerbatimArguments` force-enabled and a lone `"` prepended (`prepare_shell_args`, `lib.rs:56-90`) — it does **not** emit ROADMAP Phase 7 SC-2's `cmd.exe /d /s /c` argv. Phase 7's plan must construct that argv itself rather than rely on `shell: true`.

### L-4 — **The finding that changes the plan.** Rust does not back-fill libuv's eleven `required_vars`.

`03-FINDINGS.md` records that libuv's Windows `make_program_env()` back-fills eleven names — `HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR` — into any supplied block. That is a **Node/libuv** behaviour. LLRT does not use libuv; it uses `std::process::Command`, whose Windows environment-block builder is:

```rust
fn make_envp(maybe_env: Option<BTreeMap<EnvKey, OsString>>) -> io::Result<(*mut c_void, Vec<u16>)> {
    // On Windows we pass an "environment block" which is not a char**, but
    // rather a concatenation of null-terminated k=v\0 sequences, with a final
    // \0 to terminate.
    if let Some(env) = maybe_env {
        let mut blk = Vec::new();
        // If there are no environment variables to set then signal this by
        // pushing a null.
        if env.is_empty() {
            blk.push(0);
        }
        for (k, v) in env {
            ensure_no_nuls(k.os_string)?;
            blk.extend(k.utf16);
            blk.push('=' as u16);
            blk.extend(ensure_no_nuls(v)?.encode_wide());
            blk.push(0);
        }
        blk.push(0);
```

**[VERIFIED: rust-lang/rust@master `library/std/src/sys/process/windows.rs:908-929`, downloaded and read this session]** — the map is written verbatim; there is no `required_vars` analogue anywhere in the function. `Command::env_clear`'s own documentation confirms the intent without qualification: *"Clears all explicitly set environment variables and **prevents inheriting any parent process environment variables**."* **[CITED: doc.rust-lang.org/std/process/struct.Command.html#method.env_clear]**

**Why this matters more than it first appears.** It creates a *vehicle-shaped blind spot in the opposite direction from the usual one*:

| | Node (vitest, CI, D-08's test) | LLRT (production, real Windows Caido) |
|---|---|---|
| `spawn(cmd, args, { env: driftVarsOnly })` | child still gets `PATH`, `SYSTEMROOT`, `TEMP`, … (libuv back-fill) | child gets **only** `driftVars`. No `PATH`, no `SYSTEMROOT`, no `TEMP` |
| Symptom of a bare-dict regression | **none — tests pass** | `node.exe` may fail to initialise; any child of it certainly will |

A future edit that "simplifies" a call site to `env: runtimeEnv` is **green on every runner this project has, on both operating systems, and broken only on the machine of the user who filed the bug.** That is the exact failure class Phase 4 restructured itself to avoid.

**Recommendation (planner):** make "every `spawn` call passing `env` obtains it from `buildSpawnEnv`" a **static gate in the phase-gate set**, not a code-review convention. Phase 4's `04-RESEARCH.md` already listed this as SC-9's static check (`grep -c "spawn(" … cross-checked against buildSpawnEnv call sites`); Phase 5 is where the call-site count grows, so this is the phase to make it mechanical. § *Code Examples* #4 gives a concrete gate.

### L-5 — LLRT spawn failures are ASYNCHRONOUS and carry no `.code`.

```rust
Err(err) => {
    let ctx3 = ctx.clone();
    let err_message = format!("Child process failed to spawn \"{}\". {}", command, err);
    ctx.spawn_exit(async move {
        if !instance3.borrow().emitter.has_listener_str("error") {
            return Err(Exception::throw_message(&ctx3, &err_message));
        }
        let ex = Exception::from_message(ctx3.clone(), &err_message)?;
        ChildProcess::emit_str(This(instance3), &ctx3, "error", vec![ex.into()], false)?;
        Ok(())
    })?;
},
```

**[VERIFIED: `modules/llrt_child_process/src/lib.rs:293-312`]**

Three planner-relevant consequences:

1. **`spawn()` does not throw synchronously under LLRT.** `03-FINDINGS.md`'s P1-CMD result — *"spawn() threw synchronously with EINVAL … a `try`/`catch` around `spawn()`, not just an `error` handler"* — is a **Node** property (CVE-2024-27980's guard). CONTEXT.md's canonical-refs entry #2 states Phase 7 owns the fix; this note narrows it: on the real runtime the failure arrives as an `error` **event**, so Phase 7 will need *both* forms. Phase 5 must simply not claim provider spawns work on Windows — which D-04 already respects.
2. **An `error` listener must be attached synchronously.** If none exists when the deferred task runs, LLRT throws an exception with no JS frame to catch it. Every existing site does this correctly (`spawnAndWait` `:2129`, `callMcpMethod`'s promise, `sendCliMessage`'s `proc.on("error")`). Any **new** `spawnNode` chokepoint must too — this is a hard requirement, not a nicety.
3. **`error.code` is undefined under LLRT.** The error is `Exception::from_message` with the text `Child process failed to spawn "<cmd>". <io error>`. Any classification (`ENOENT`, `EINVAL`, `EPERM`) must fall back to message-substring matching — the same defensive shape `04-RESEARCH.md` A3 prescribed for `isTransientFsError` and which `fs-retry.ts` already implements. Reuse that convention rather than inventing a second one.

---

## Claude Code's `--mcp-config` Contract (D-10)

D-10 makes Claude's `mcp-<chatId>.json` carry the literal token in `env`, converging on the shape `copilot-mcp-<chatId>.json` already emits at `index.ts:2796`. Confirmed against the official docs:

| Question | Answer | Evidence |
|---|---|---|
| Does a stdio server entry support `env`? | **Yes.** `env` is a first-class field: `{"type":"stdio","command":"/path/to/weather-cli","args":[…],"env":{"CACHE_DIR":"/tmp"}}` | **[CITED: code.claude.com/docs/en/mcp — `claude mcp add-json` example]** |
| Is `type` required for stdio? | **No.** *"Claude Code reads an entry with no `type` as a stdio server."* Drift's current config omits it and is correct as-is | **[CITED: code.claude.com/docs/en/mcp § Option 1]** |
| Does `--mcp-config` accept a file path? | Yes — *"Load MCP servers from JSON files or strings (space-separated)"*, example `claude --mcp-config ./mcp.json` | **[CITED: code.claude.com/docs/en/cli-reference]** |
| What does `--strict-mcp-config` do? | *"Only use MCP servers from `--mcp-config`, ignoring all other MCP configurations."* | **[CITED: code.claude.com/docs/en/cli-reference]** |
| Does `--strict-mcp-config` interfere with `env`? | **No.** It scopes *which servers load*, not how a loaded server's fields are interpreted. Drift already passes both flags together (`provider-launch.ts:47`) and the Copilot path already ships `env` | **[CITED: same]** — the two flags are orthogonal in the docs; no interaction is documented |
| Any Windows-specific note on the JSON? | The docs steer to an **absolute path to a real executable**; the `cmd /c` wrapper is documented only for `npx`/`.cmd` commands. Drift's `command` is an absolute `node` path, so it needs no wrapper on any OS | **[CITED: research/ARCHITECTURE.md § *Comparable-tool pattern*, itself citing the Claude Code MCP docs]** |

**One genuine hazard the discussion did not surface — read this before writing the token into `env`.** Claude Code performs **environment-variable expansion inside the `env` field**:

> **Expansion locations:** Environment variables can be expanded in: `command` … `args` … **`env`: environment variables passed to the server** …
> **Supported syntax:** `${VAR}` … `${VAR:-default}`
> *"If a referenced environment variable isn't set and has no default value, the config still loads: Claude Code reports a missing-variable warning for that server in `claude mcp list` output and uses the unexpanded `${VAR}` text as-is."*

**[CITED: code.claude.com/docs/en/mcp § *Environment variable expansion in `.mcp.json`*]**

So a literal `CAIDO_TOKEN` value containing the two-character sequence `${` would be silently rewritten or left mangled — and the failure mode is a **silently unauthenticated MCP server**, which is exactly the failure mode D-10 rejected `${CAIDO_TOKEN}` indirection for. Caido session tokens are JWT-shaped base64url (`[A-Za-z0-9_.-]`), so this is very unlikely in practice; but "very unlikely" is what a `checkpoint` or a two-line guard is for, not what a silent assumption is for. See § *Pitfall 3*. `[VERIFIED: docs]` for the expansion behaviour; `[ASSUMED]` (A2) for the token's character set — Drift reads it from `window.localStorage.CAIDO_AUTHENTICATION` and never constrains it.

Corollary the planner can bank: because expansion is documented for `env`, Phase 7's PRV-03 token-hygiene plan for Claude (if it ever wants one) has a supported mechanism. It does not change D-10.

---

## The `windows-latest` CI Leg (D-07 / D-09)

### Finding C-1 — **`pnpm build` cannot run on `windows-latest` today, and the fix is a deletion.** *(MEASURED this session)*

```
"build": "caido-dev build && cp -r packages/backend/assets/* dist/plugin_package/backend/assets/ 2>/dev/null; rm -f dist/plugin_package.zip dist/drift.zip && cd dist/plugin_package && zip -r ../plugin_package.zip . -x '*.DS_Store'"
```
**[VERIFIED: package.json:25, read this session]**

Every verb after `caido-dev build` is POSIX: `cp -r`, glob `*`, `2>/dev/null`, `;` sequencing, `rm -f`, `cd`, `zip -r`, `-x '*.DS_Store'`. Three independent reasons it fails on the Windows runner:

1. **The script shell is `cmd.exe`, not bash.** pnpm's `scriptShell` setting *"Default: null"*, described as *"The shell to use for scripts run with the `pnpm run` command"* **[CITED: pnpm.io/settings/other]** — i.e. the platform default, `%ComSpec%`. The workflow-step `shell: bash` does **not** change this: it governs the `run:` block, not the shell `pnpm run` spawns for the script body.
2. **`zip` is absent from the runner image.** The Windows Server 2025 image manifest lists `7zip 26.02` under *Tools* and Git-for-Windows bash under *Shells*; **no `zip` entry appears anywhere in the software list.** **[VERIFIED: actions/runner-images@main `images/windows/Windows2025-Readme.md`, downloaded and grepped this session — `grep -ni zip` returns only `7zip 26.02`]**
3. `shellEmulator` would not rescue it. *"When `true`, pnpm will use a JavaScript implementation of a bash-like shell to execute scripts."* **[CITED: pnpm.io/settings/other]** — it parses bash *syntax*; it does not supply `cp`/`rm`/`zip` binaries.

**The measurement that makes this cheap.** Run this session, on this checkout:

```
$ rm -rf dist && pnpm exec caido-dev build          # exit 0
$ find dist -type f
dist/plugin_package.zip
dist/plugin_package/backend/assets/mcp-server.mjs
dist/plugin_package/backend/index.js
dist/plugin_package/frontend/index.css
dist/plugin_package/frontend/index.js
dist/plugin_package/manifest.json

$ diff <(unzip -Z1 caido-dev-only.zip | sort) <(unzip -Z1 full-pnpm-build.zip | sort)
IDENTICAL NAME SETS      # and byte lengths match entry-for-entry
```

`caido-dev build` **on its own** already emits `dist/plugin_package.zip` containing `backend/assets/mcp-server.mjs` — because `caido.config.ts:30` declares `assets: ["./packages/backend/assets/**/*"]` **[VERIFIED: caido.config.ts:30]**, `caido-dev` copies each declared asset into the plugin dir (`node_modules/@caido-community/dev/dist/cli.js:177-192`) and then zips the whole tree with JSZip (`:275-287`) **[VERIFIED: read this session]**. The `cp -r` re-copies files that are already there; the `rm -f` deletes `caido-dev`'s zip; the `zip -r` rebuilds an equivalent one with a POSIX binary.

**Recommendation:** reduce `build` to `caido-dev build`. Two facts make this safe rather than bold: (a) the entry-name sets and byte lengths are identical, measured above; (b) `release.yml` consumes `dist/plugin_package.zip` and reads `manifest.json` out of it with `unzip -p` on its own runner (`.github/workflows/release.yml:47,67,76`) **[VERIFIED: read this session]** — it depends on the artifact, not on how it was zipped. Two incidental cleanups fall out: `dist/drift.zip` is referenced only in the `rm -f` and is **never produced by anything**, and CLAUDE.md § *Configuration* still describes it as "the final deliverable" — a stale line worth correcting while the planner is here.

**If the planner declines to touch `build`,** the only remaining options are (i) drop `build` from the Windows leg — which contradicts CI-01's wording *"builds the plugin and runs vitest"* and D-07's "build+vitest job", or (ii) port the tail to a Node script that shells out to `7z` on Windows. Both are strictly worse than deleting a no-op.

### Finding C-2 — the `setup-node` / `action-setup` ordering trap, already paid for once

ROADMAP § *Phase 9 SC-1* and `windows-llrt-probe.yml:80-101` both record this, from a real failed run:

> *"MEASURED, not precautionary. Without this line the step fails with `Unable to locate executable file: pnpm` and the probe never runs at all — observed on run 31702174047 (2026-08-13) … setup-node@v5 defaults `package-manager-cache` to true and auto-enables dependency caching whenever package.json carries a `packageManager` field."*

**[VERIFIED: .github/workflows/windows-llrt-probe.yml:80-101, read this session]**

For Phase 5's leg the resolution is the **`ci.yml` shape, not the probe's**: `pnpm/action-setup@v6` first, then `actions/setup-node@v5` with `cache: pnpm` — exactly `ci.yml:31-42`, whose comment already says *"Must stay ahead of Setup Node, whose pnpm store cache needs the pnpm binary to already exist."* Do **not** copy the probe's `package-manager-cache: false`; that line exists only because the probe deliberately installs nothing.

### Finding C-3 — shell and step mechanics

- The default shell for `run:` on a Windows runner is **pwsh**, not bash. **[CITED: docs.github.com — workflow syntax, `jobs.<id>.steps[*].shell`]**
- `shell: bash` on Windows resolves to **Git-for-Windows bash**, invoked as `bash --noprofile --norc -eo pipefail {0}` — identical to other platforms. **[CITED: same]** `pipefail` is why `windows-llrt-probe.yml:168-183` pins it; ROADMAP Phase 9 SC-1 requires *"`shell: bash` pinned on cross-platform steps"*.
- Pin `timeout-minutes`. The probe uses `10` (`windows-llrt-probe.yml:56`) with a stated reason: a hung spawn would otherwise hold a Windows runner for the 360-minute default. A build+full-suite leg needs more headroom — **`20` is a defensible starting point**; the honest move is to set it from the first real run's duration (Phase 3 D-11/D-12 discipline: record after reading the run).
- **Carry the D-10 no-secret-material gate.** ROADMAP § *Phase 9 SC-1a* requires it to survive `windows-llrt-probe.yml`'s deletion, keeping its **three-branch** form (`grep` status 0 → fail, 1 → pass, anything else → fail), because *"An if/else would route that 2 into the pass arm and silently green-light exactly the Phase 4-8 edit this gate exists to catch."* **[VERIFIED: .github/workflows/windows-llrt-probe.yml:152-166]** D-07 moves CI-01's job forward; the planner should decide explicitly whether the gate moves with it now or waits for Phase 9's deletion. **Recommendation: now** — a gate that scans two files which no longer exist after Phase 9 is a gate that fails on `grep` status 2, and this phase's job is the natural new home. Note it must be re-pointed at whatever files are in scope, and re-verified to remain self-non-matching.

### Verifying D-09's Measurement

D-09 asserts three things. **All three re-measured independently this session; all three confirmed.**

| D-09 claim | Result | Evidence |
|---|---|---|
| `toMatchSnapshot`/`toMatchInlineSnapshot` appear nowhere in the repo | **CONFIRMED** | `grep -rn "toMatchSnapshot\|toMatchInlineSnapshot\|toMatchFileSnapshot" --include=*.ts --include=*.mjs --include=*.vue .` (node_modules excluded) → **zero matches** |
| Exactly one test reads a file, and writes it itself into a temp dir | **CONFIRMED** | `grep -rln "readFile\|readFileSync" --include=*.test.ts packages` → **only `mcp-server.context.test.ts`**, which creates its input via `mkdtemp(path.join(os.tmpdir(), …))` + `writeFile` (`:31`, and `command-resolution.test.ts:30` uses the same idiom) |
| No `.gitattributes` today | **CONFIRMED** | `ls .gitattributes` → *No such file or directory* |
| *(implied)* the `provider-launch` "exact-snapshot" tests are `toEqual` on argv arrays | **CONFIRMED** | `provider-launch.test.ts` asserts with `toEqual`/`toBe` on string arrays; no newline-bearing fixture. Line-ending-immune |

**Two additional Windows-green risks D-09 did not measure.** Neither is a reason to narrow the leg; both are reasons to expect the *first* run to be red and to read it rather than retry it.

1. **Timing.** `mcp-server.transport.test.ts` uses a hard `5000 ms` timeout around a real `node` + `.mjs` child (`:137`), and `mcp-server.allowlist.test.ts` / `.context.test.ts` spawn the same way. The full suite is **779 ms on this macOS host** (measured below); Windows runners are materially slower at process creation, and Defender scans a freshly-written `.mjs`. This, not line endings, is the likeliest first-run failure. Mitigation if it bites: raise the constant, do not add a retry.
2. **pnpm on Windows + long paths.** `pnpm install --frozen-lockfile` builds a deep `node_modules/.pnpm/…` tree; Windows `MAX_PATH` is 260 unless long-path support is enabled (`04-RESEARCH.md` § *MAX_PATH Budgeting* covers the runtime side of this). `[ASSUMED]` (A3) — not measured; the honest plan is to expect it as a candidate cause if `Install dependencies` is where the leg first goes red, not to pre-emptively work around it.

`.gitattributes` content, per ROADMAP Phase 9 SC-2 and D-09: `* text=auto eol=lf`. Given the measurements above, its job in Phase 5 is **prophylactic** — nothing currently asserts on newline-bearing generated content — and it is correct to land it anyway, because the surviving `renderExportExecScript` still emits `\n`-joined shell text (`index.ts:757-761`) and Phase 7 will test the Gemini/Codex wrapper.

---

## Architecture Patterns

### System Architecture Diagram

```
                     ┌──────────────────────────────────────────────────┐
   settings save ───▶│ refreshActiveMcpRuntime  index.ts:1541            │  ◀── THE SITE
   token sync ──────▶│   (called :1521 and :1596)                        │      CONTEXT.md
                     └────────────────────┬─────────────────────────────┘      MISSED
   "Start MCP" ─────▶┌────────────────────┴─────────────────────────────┐
                     │ startMcpServer           index.ts:~2400-2546      │
                     └────────────────────┬─────────────────────────────┘
   chat turn ───────▶┌────────────────────┴─────────────────────────────┐
                     │ sendCliMessage           index.ts:~2660-3320      │
                     └────────────────────┬─────────────────────────────┘
                                          │  all three converge on
                                          ▼
              ┌─────────────────────────────────────────────────────────┐
              │  buildMcpServerSpec()   ← KEYSTONE, PURE MODULE (D-06)  │
              │  in:  { nodeExecutable, mcpScriptPath,                  │
              │         runtimeEnv, parentEnv }                          │
              │  out: { command: <abs node>,                             │
              │         args:    [<abs mcp-server.mjs>],                 │
              │         env:     buildSpawnEnv({parentEnv, driftVars}) } │
              └───┬──────────────┬───────────────┬──────────────────┬────┘
                  │              │               │                  │
        (a) spawnNode      (b) Claude       (c) Copilot      (d) Gemini/Codex
            (index.ts)         config JSON      config JSON       registration
                  │              │               │                  │
                  │              │  {mcpServers:{drift:{command,args,env}}}
                  │              │               │                  │
                  ▼              ▼               ▼                  ▼
        spawn(spec.command,  mcp-<chatId>   copilot-mcp-      POSIX ONLY (D-01)
              spec.args,       .json          <chatId>.json    mcp-wrapper.sh
              {env:spec.env,      │               │            ── DELETED IN
               stdio:[p,p,p]})    │               │               PHASE 7 ──
                  │               │               │                  │
                  │  ┌────────────┴───────────────┴──────────────────┤
                  │  │  external CLI reads config / registration      │
                  │  │  and launches the server itself                │
                  ▼  ▼                                                ▼
            ┌───────────────────────────────────────────────────────────┐
            │  node  mcp-server.mjs   (unchanged — already env-driven)  │
            │  --validate-auth  ▸ {ok:true|false}          → HLT-01      │
            │  stdio JSON-RPC   ▸ tools/list, get_environment,           │
            │                     search_history            → HLT-02     │
            └───────────────────────────────────────────────────────────┘

  win32 guard (D-01/D-03):  (d) is skipped; skippedMcpCliReasons carries the
                            sentence naming Phase 7.
  DELETED:                  writeLaunchScript, the mcp-self-test-<id>.sh write,
                            the Claude session mcp-wrapper-<sid>.sh, the
                            provider-launch-<sid>.sh, launchCommand/launchArgs,
                            and finalize()'s `launchCommand !== resolved` branch.
```

### Recommended Project Structure

```
packages/backend/src/
├── index.ts                  # orchestrator — spawn, file writes, module state
├── mcp-server-spec.ts        # NEW (D-06) — buildMcpServerSpec + the two config
│                             #   projections + the win32 registration predicate
├── mcp-server-spec.test.ts   # NEW — the pure unit tests
├── mcp-server-spec.spawn.test.ts  # NEW (D-08) — integration: imports the SAME
│                             #   builder, spawns it against a local HTTP stub
├── platform.ts               # unchanged — buildSpawnEnv (:262) is consumed here
├── provider-launch.ts        # UNCHANGED — the CMP-01 tripwire. Do not touch.
├── runtime-probe.ts          # EXTEND — D-05's reported PATH/env-count metric
└── assets/mcp-server.mjs     # unchanged
.gitattributes                # NEW (D-09)
.github/workflows/ci.yml      # EXTEND — the windows-latest job (D-07)
```

Naming follows the repo convention (kebab-case, sibling `.test.ts`, CLAUDE.md § *Naming Patterns*). The dotted `mcp-server-spec.spawn.test.ts` mirrors the existing `mcp-server.transport.test.ts` / `.context.test.ts` / `.allowlist.test.ts` family.

### Pattern 1: One spec, five consumers (`research/ARCHITECTURE.md` § *Pattern 2*)

**What:** `buildMcpServerSpec()` returns `{command, args, env}` once; the self-test, the health check, Claude's config, Copilot's config and (POSIX-only) the Gemini/Codex registration are all *projections* of it.

**When to use:** always in this phase. CONTEXT.md § *Specific Ideas* is explicit: *"Write the Claude config through the **same** `buildMcpServerSpec()` projection Copilot uses — one spec, two callers — rather than two writers that happen to agree today."*

**Why the shape is not a design decision:** `index.ts:2792-2803` already writes exactly `{ command: nodeExecutable.value, args: [mcpScriptPath], env: buildMcpRuntimeEnv({…}) }` for Copilot **[VERIFIED: index.ts:2792-2803, read this session]**. `buildMcpServerSpec` generalises shipping code.

**Example:**
```typescript
// mcp-server-spec.ts — pure, zero I/O, injected inputs only
export type McpServerSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export function buildMcpServerSpec(input: {
  nodeExecutable: string;
  mcpScriptPath: string;
  runtimeEnv: Record<string, string>;      // from buildMcpRuntimeEnv
  parentEnv: Record<string, string | undefined>; // process.env, injected
}): McpServerSpec {
  return {
    command: input.nodeExecutable,
    args: [input.mcpScriptPath],
    // NEVER `{ ...input.runtimeEnv }`. See finding L-4: a bare dict is green on
    // Node CI (libuv back-fills eleven names) and broken under LLRT (Rust's
    // make_envp writes the map verbatim).
    env: buildSpawnEnv({ parentEnv: input.parentEnv, driftVars: input.runtimeEnv }),
  };
}

// The config-JSON projection — the SAME function Copilot and Claude both call.
export function toMcpConfigDocument(spec: McpServerSpec): {
  mcpServers: { drift: { command: string; args: string[]; env: Record<string, string> } };
} {
  return { mcpServers: { drift: { command: spec.command, args: spec.args, env: spec.env } } };
}
```

> **Open design question for the planner, worth deciding deliberately:** should the **config-JSON** projection carry `spec.env` (parent-merged, ~50-100 keys incl. the whole user environment) or only `runtimeEnv` (the ~9 `DRIFT_*`/`CAIDO_*` keys)? Copilot ships `buildMcpRuntimeEnv(...)` alone today (`:2796`). The spawn path **must** merge (L-4); the config path arguably **must not** — the CLI already gives its child the parent environment, and writing the user's full environment into a `0o600` JSON file materially widens what a support bundle or a stray `cat` exposes. **Recommendation: keep the two projections distinct** — `spec.env` for `spawnNode`, `spec.driftVars` for the config documents — and give the spec type both fields. This preserves Copilot's current byte-shape (CMP-01) and is the smaller blast radius under D-10.

### Pattern 2: Platform decisions as pure predicates (Phase 4 D-01/D-02)

D-02 requires *"a test asserting the wrapper path is **unreachable on `win32`**."* An `if (host.platform === "win32") return;` inside `tryRegisterMcpForProviders` (`index.ts:2276`) cannot be asserted — `index.ts` is not importable (CONTEXT.md domain fact 5). Extract the decision:

```typescript
// mcp-server-spec.ts
export type McpCliRegistration =
  | { kind: "Register"; wrapperPath: string }
  | { kind: "Skip"; reason: string };

export function planMcpCliRegistration(input: {
  platform: Platform;
  cli: "gemini" | "codex";
  wrapperPath: string | undefined;
}): McpCliRegistration {
  if (input.platform === "win32") {
    return {
      kind: "Skip",
      // D-03: names the phase, not just the limitation.
      reason: `Drift MCP is not yet supported for ${input.cli === "gemini" ? "Gemini" : "Codex"} on Windows (Phase 7).`,
    };
  }
  if (input.wrapperPath === undefined) {
    return { kind: "Skip", reason: "MCP runtime is not running." };
  }
  return { kind: "Register", wrapperPath: input.wrapperPath };
}
```

Now D-02's tripwire is one `expect(planMcpCliRegistration({platform:"win32",…}).kind).toBe("Skip")` and D-03's sentence is assertable verbatim. The discriminated `kind` union matches CLAUDE.md § *Naming Patterns*.

### Pattern 3: Dated deletion notices as literal, greppable strings (D-02)

CONTEXT.md § *Specific Ideas*: *"The `DELETED IN PHASE 7 (PRV-03)` header (D-02) is a **literal string**, matching `windows-llrt-probe.yml`'s `TEMPORARY — DELETED IN PHASE 9 (D-02)` so both are greppable by the same pattern."* The in-repo precedent is real and its rationale is stated in the file: *"the due date is named literally because an undated 'temporary' comment becomes permanent"* **[VERIFIED: .github/workflows/windows-llrt-probe.yml:1-5]**.

Suggested pattern for a phase-gate `grep`: `DELETED IN PHASE [0-9]+ \(` — matches both, and a count assertion (`== 4` after this phase: the probe workflow header plus the three surviving functions) turns the discipline into a check.

### Anti-Patterns to Avoid

- **Re-introducing a `.bat`/`.ps1` "Windows wrapper".** `research/ARCHITECTURE.md` § *Anti-Pattern 1*. `spawn`'s `env` does this natively and is source-confirmed under LLRT (L-2).
- **`cmd /c node …` or `shell: true` for the MCP server.** `node`/`node.exe` is a real PE executable. § *Anti-Pattern 2*. And under LLRT `shell: true` gives you a bare `cmd.exe` with verbatim args (L-3) — worse, not safer.
- **Classifying a spawn failure on `error.code`.** Undefined under LLRT (L-5). Match the message, as `fs-retry.ts` already does.
- **`env: runtimeEnv` at any call site.** The regression is invisible on every runner this project has (L-4).
- **Deleting `enforceOwnerOnlyDir`'s `chmod` while deleting "every `chmod` call".** See § *Pitfall 1* — it is a different mechanism and it is Phase 4's, load-bearing on POSIX.
- **Reimplementing the spec inside the D-08 test.** CONTEXT.md § *Specific Ideas*: *"If a reviewer can point at a second copy of the spec-building logic inside the test, the test is not evidence."*

---

## Complete Site Inventory

Every reference to the machinery this phase removes, enumerated with `grep` over `packages/backend/src/index.ts` **[VERIFIED: read this session; CONTEXT.md's list is a subset]**. Cross-check the plan against this table, not against CONTEXT.md's narrative list.

| Symbol | Definition | Call sites | Fate |
|---|---|---|---|
| `writeMcpWrapper` | `:1172` | `:1564` **(refreshActiveMcpRuntime — NOT in CONTEXT.md)**, `:2524` (startMcpServer), `:2729` (Claude session) | Definition **survives** for D-01's POSIX Gemini/Codex wrapper. `:1564` and `:2524` become `buildMcpServerSpec()`; `:2729` is deleted outright (Claude gets `env` in its JSON) |
| `validateCaidoAuth` | `:1209` | `:1571` **(refreshActiveMcpRuntime — NOT in CONTEXT.md)**, `:2531` | Signature changes from `(wrapperPath)` to `(spec)`; **both** call sites convert |
| `tryRegisterMcpForProviders` | `:2276` | `:1578` **(refreshActiveMcpRuntime)**, `:2543` | Both gain D-01's platform guard. Skipping one leaves a win32 hole on the settings-save path |
| `writeLaunchScript` | `:728` | `:1719` (self-test `.sh`), `:2884` (provider launch `.sh`) | **DELETED** entirely, with both call sites |
| `renderExportExecScript` | `:749` | `:737` (inside `writeLaunchScript` — dies with it), `:1194` (inside `writeMcpWrapper` — survives), `:2883` (`launchScriptPreview` — dies with D-11) | **Survives**, headed by the `DELETED IN PHASE 7 (PRV-03)` block |
| `shellQuote` | `:834` | `:759`, `:760` (both inside `renderExportExecScript`) | **Survives** (D-01) |
| `getMcpWrapperPath` | `:921` | `:1921` (`runSharedMcpSelfTest`) | Its only consumer stops using it once the self-test takes a spec. **Planner's call** (Claude's Discretion): keep it as the Gemini/Codex wrapper accessor, or inline it. `noUnusedLocals` forces a decision either way |
| `spawnAndWait("chmod", …)` | — | `:740` (in `writeLaunchScript`), `:1200` (in `writeMcpWrapper`) | `:740` dies; `:1200` **survives** (D-01). SC-1's "every `chmod` call" is 2, not 3 — see § *Pitfall 1* |
| `.sh` path literals | — | `:923` `mcp-wrapper.sh`, `:1184` `mcp-wrapper.sh`, `:1720` `mcp-self-test-<id>.sh`, `:2734` `mcp-wrapper-<sid>.sh`, `:2885` `provider-launch-<sid>.sh` | Reduced from **5 to 2** (`:923`, `:1184`) |
| `launchCommand` / `launchArgs` | `:2879-2895` | `:3082` (spawn), `:3308` (finalize cleanup) | **Deleted together** — CONTEXT.md domain fact 3: a bare `rm(launchCommand)` left behind would delete the user's `claude` binary |
| `buildMcpRuntimeEnv` | `:1013` | `:1186`, `:1929`, `:2695`, `:2796` | Unchanged unless the planner moves it (Claude's Discretion). It reads `currentSettings.caidoApi.url` and `getMcpContextFilePath()` — **two** module-state reads to inject, not one |
| `redactDebugText` shell arm | `:786` | — | Becomes dead once `:2883`'s preview goes. Cosmetic; planner decides (Claude's Discretion) |

**`refreshActiveMcpRuntime` in full** (`index.ts:1541-1580`): resolves the token, resolves node, writes the context file, **`writeMcpWrapper` → `validateCaidoAuth` → `tryRegisterMcpForProviders`**, and calls `cleanupMcpRuntime` on any failure. Reached from `saveSettings` (`:1521`) and `syncCaidoSessionToken` (`:1596`). On Windows, with `mcp-wrapper.sh` unexecutable, an unconverted `:1571` returns `ok:false` → `cleanupMcpRuntime` → **a working MCP runtime is torn down the first time the user saves settings or Caido rotates the session token.** The frontend polls `syncCaidoSessionToken` as part of its keep-alive (CLAUDE.md § *Data Flow*), so this is not a rare path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merging parent env with Drift's vars | `{ ...process.env, ...vars }` at each call site | `buildSpawnEnv({ parentEnv, driftVars })` — `platform.ts:262` | Already unit-tested (Phase 4 SC-9); carries the T-04-04 no-logging rule in its own comment; and finding L-4 makes the spread's absence invisible to CI |
| Retrying a transient FS error | A bespoke loop around the config write | `withFsRetry` — `fs-retry.ts`, sole call site `index.ts:2467` | Phase 4's ladder (6 attempts / ~1 500 ms), already classifies LLRT's message-shaped errors, already surfaces `mcpFirstWriteAttempts` in diagnostics |
| Writing a token-bearing temp file | `writeFile` with ad-hoc modes | `writeTemp(dir, name, content)` — `index.ts:691` | Already `mkdir 0o700` + `writeFile 0o600`, with the reasoning in-comment |
| Writing an MCP config document | A second JSON writer for Claude | `writeChatMcpConfig` — `index.ts:711` | Already emits `{mcpServers:{drift:server}}` and **already accepts an optional `env`** (`:715`). Claude's path just starts passing it |
| Detecting the OS | `process.platform` | `os.platform()` → `normalizePlatform` → cached `host` | `process.platform` is undocumented for Caido; `normalizePlatform` (`platform.ts:34`) fails closed on an unrecognised value (Phase 4 D-06) |
| Zipping the plugin package | `zip -r` / a Node zip writer | `caido-dev build` | Measured this session to already do it, with JSZip, cross-platform (§ *Finding C-1*) |
| Detecting a spawn failure | `try { spawn() } catch` alone | `try`/`catch` **and** a synchronous `proc.on("error", …)` | Node throws sync for the `.cmd` guard; LLRT emits async (L-5). Both forms are needed, and the listener must be attached synchronously |

**Key insight:** every item above already exists in this repo. Phase 5 is a *deletion* phase; the highest-risk failure mode is not "we built the wrong thing" but "we rebuilt a thing that was already there, slightly differently, at a site that is not test-reachable."

---

## Common Pitfalls

### Pitfall 1: Deleting the wrong `chmod`

**What goes wrong:** SC-1 says *"every `chmod` call"* is deleted. A `grep -n chmod index.ts` returns **five** regions: `:660-676` (a `fs/promises` **namespace** call inside `enforceOwnerOnlyDir`), `:740-741` and `:1200-1201` (two `spawnAndWait("chmod", ["+x", …])` shell spawns).
**Why it happens:** the word is the same; the mechanism is not.
**How to avoid:** `:660-676` is **Phase 4's** `enforceOwnerOnlyDir` — it re-asserts `0o700` on the token-bearing temp dir and its result feeds a fail-closed check at `index.ts:2500-2506`. It reaches `chmod` through the namespace deliberately (`index.ts:660-671`, the comment says so) and it is **skipped on win32** already. Deleting it removes a POSIX security control — a CMP-01 regression dressed as SC-1 compliance. Only the two `spawnAndWait("chmod", …)` sites are in scope, and only `:740` actually dies (D-01 keeps `:1200`).
**Warning signs:** a plan whose SC-1 evidence is `grep -c chmod index.ts` → `0`. The correct post-phase count is **non-zero**.

### Pitfall 2: Converting only the two `validateCaidoAuth` sites CONTEXT.md names

**What goes wrong:** `refreshActiveMcpRuntime` (`:1541`) keeps the wrapper path; on Windows a settings save or token refresh tears down a working runtime via `cleanupMcpRuntime`.
**Why it happens:** CONTEXT.md's canonical-refs list names `:2524–2532` and `:2729` and is otherwise exhaustive, so it reads as complete.
**How to avoid:** work from § *Complete Site Inventory*. `grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(" packages/backend/src/index.ts` is the mechanical form and belongs in the phase gates.
**Warning signs:** a plan that mentions `startMcpServer` and `sendCliMessage` but never `refreshActiveMcpRuntime` or `syncCaidoSessionToken`.

### Pitfall 3: `${…}` inside the token, expanded by Claude Code

**What goes wrong:** Claude Code expands `${VAR}` inside `env` values (§ *Claude Code's `--mcp-config` Contract*). A token containing `${` is rewritten, or left literal with only a `claude mcp list` warning — producing a **silently unauthenticated** MCP server, the exact failure mode D-10's rejection of `${CAIDO_TOKEN}` cited.
**Why it happens:** the token is opaque to Drift; nothing validates its charset.
**How to avoid:** cheapest correct guard is a one-line assertion at the write site — if `caidoToken.includes("${")`, fail loud with an actionable message rather than writing a config that will fail silently. This is *not* the `${CAIDO_TOKEN}` indirection D-10 rejected; it is a guard against accidental expansion of a literal.
**Warning signs:** a plan whose only token handling is "write it into `env`".

### Pitfall 4: Believing the D-08 test proves the env contract

**What goes wrong:** the integration test spawns via Node (vitest), where libuv back-fills eleven names. A regression to `env: runtimeEnv` **passes it** (L-4).
**Why it happens:** the test is the most convincing artifact in the phase, so it attracts more confidence than it earns.
**How to avoid:** pair it with a **static** gate (§ *Code Examples* #4) and state the limit in D-08's caveat alongside the `index.ts`-wiring limit.
**Warning signs:** SC-3's evidence being the integration test alone.

### Pitfall 5: "POSIX-identical" is true for the process, not for the file

**What goes wrong:** D-04 argues the provider-script → direct-spawn conversion is *"behaviourally identical"* on POSIX — child PID, pipes and effective env all match. That holds for the **spawned process**. What also disappears is the **file** `provider-launch-<sid>.sh`, and with it `finalize()`'s `if (launchCommand !== resolved)` cleanup (`:3308`) and the debug dump at `:2883`.
**Why it happens:** the equivalence argument is about `spawn`, and it is correct about `spawn`.
**How to avoid:** treat the three as one change set. CONTEXT.md domain fact 3 already flags the `:3308` hazard; the debug-log side is D-11's. `noUnusedLocals` + `--max-warnings 0` means a half-done deletion is a **build failure**, which is the good news: the compiler enforces the set.
**Warning signs:** a plan with a task for the spawn conversion and a separate, later task for the cleanup.

### Pitfall 6: Assuming `windowsHide` works

**What goes wrong:** UX-04 requires `windowsHide: true` on all spawns. LLRT does not parse it (L-3), so a console window can still flash on the user's machine while the code reads as if it were handled.
**Why it happens:** it is a valid Node option and passes typecheck.
**How to avoid:** not Phase 5's requirement — but if the planner adds it opportunistically to new spawn sites, add the source-cited comment beside it so Phase 10 does not treat its presence as coverage.
**Warning signs:** UX-04 being marked partially satisfied by Phase 5.

### Pitfall 7: Reading `API.md` instead of the Rust source

`04-RESEARCH.md` § *Pitfall 7* — `caido/dependency-llrt@main`'s `API.md` omits capabilities the same repo's source declares. Every LLRT claim in this document was taken from `modules/llrt_*/src/*.rs`. And the honest ceiling holds unchanged: **the fork's `main` may not be the commit Caido ships.** Source analysis raises confidence; it does not close the gap. Only a real Windows Caido install does (Phase 9/10).

---

## RUN-04 After the Rewrite

CONTEXT.md leaves the planner one question: *"Planner decides whether the MCP config JSON writes also earn a retry ladder; they are read by the CLI, not exec'd, so the AV write-then-exec race does not apply."* Here is a fact-based answer.

### What the structural half already delivers

REQUIREMENTS.md § *Re-targeted to Phase 5* names the unfinished half precisely: *"the `.tmp` write → `chmod +x` → `rename` → spawn sequence in `writeLaunchScript` (`index.ts:728`) and `writeMcpWrapper` (`index.ts:1172`), and both are still unwrapped."* `04-RESEARCH.md` § *Which operations need the ladder* rates `rename(tmp → final)` **"Yes — this is the single best-documented case"**, because `fs.rename` uses `MoveFileEx`, which is not atomic and honours share modes.

Phase 5 removes that sequence from the Claude and self-test paths entirely:

| Write→exec pair | Fate | Effect on RUN-04 |
|---|---|---|
| `writeLaunchScript` `:736-743` (self-test `.sh`) | **deleted** | The `.tmp`→`chmod`→`rename`→spawn race stops existing on this path |
| `writeLaunchScript` `:736-743` (provider launch `.sh`) | **deleted** | Same |
| `writeMcpWrapper` `:1192-1204` (Claude session wrapper) | **deleted** (Claude uses config `env`) | Same |
| `writeMcpWrapper` `:1192-1204` (shared Gemini/Codex wrapper) | **survives, POSIX-only** (D-01) | **Unreachable on Windows by construction** — the platform where the race exists |
| `mcp-server.mjs` staging copy `:2467` | already inside `withFsRetry` | Unchanged, already covered |

**Net: after this phase, no write→exec pair remains on any Windows-reachable path.** RUN-04's headline half is satisfied by deletion plus a platform guard, which is a stronger result than a retry ladder — a race you cannot enter needs no backoff.

### Does the config-JSON write→READ deserve a ladder?

Two distinct sub-questions, and they have different answers.

**(a) The reader is not Drift.** The `mcp-<chatId>.json` read is performed by the Claude CLI process, which Drift spawns. Drift cannot retry a read it does not perform. A `withFsRetry` around `writeChatMcpConfig` therefore protects the **write** — it does nothing at all for the CLI's read. Any plan that justifies the ladder by "the CLI might fail to read it" is reasoning about a failure the ladder cannot reach.

**(b) The write→read race is materially weaker than write→exec.** Three reasons, in descending order of authority:

1. **Share-mode compatibility.** `ERROR_SHARING_VIOLATION` arises when *"the share access flags are incompatible."* An AV or EDR sensor typically holds a scanned file with a read-oriented share mode; a subsequent reader opening `GENERIC_READ` with `FILE_SHARE_READ` is compatible with it. Microsoft's Defender-for-Endpoint guidance describes the conflicting case specifically as *"mssense.exe may open a file with a read-only sharing mode, and when another application attempts to lock the file **with write permission**, it results in Access Denied"* — the conflict is with a *writer*, not a reader. `[CITED: web search summary of Microsoft Defender for Endpoint conflict guidance]` — MEDIUM confidence; the mechanism is well documented, the specific phrasing came via search rather than a primary Microsoft page.
2. **The best-documented post-write handle contention is `.EXE`-specific.** Microsoft KB 2503886: *"Application Compatibility attempts to check if the .EXE file requires any application compatibility shims when it is accessed. This causes the system to obtain a handle to the file … Explorer cannot copy the file because it is in use."* **[CITED: learn.microsoft.com/en-us/troubleshoot/windows-server/performance/copying-exe-files-sharing-violation-error-folder-in-use]** This mechanism does not fire for a `.json`.
3. **The one file that *is* executed is already covered.** `mcp-server.mjs` is written once at start, inside `withFsRetry` (`:2467`), and is read by `node` as a script rather than launched via `CreateProcess` as an image.

### Recommendation

**Extend `withFsRetry` to `writeTemp` (`index.ts:691`), not to the config writers individually.** Rationale:

- It is **one** edit that covers every token-bearing temp write — the Claude config, the Copilot config, the context file, the per-session activity/approval files — instead of N per-call-site decisions the next phase will have to repeat.
- The failure it actually guards is the *write* (`mkdir` + `writeFile` under a Defender handle), which `04-RESEARCH.md` rates **"Yes"** for both operations, and which is the failure Drift can genuinely retry.
- The cost is bounded and already characterised: the ladder is 6 attempts / ~1 500 ms total (`FS_RETRY_DELAYS_MS`), chosen precisely because it sits inside human tolerance for a button press.
- It makes `withFsRetry`'s production call-site count **greater than one**, which retires a real code-health concern: today a ladder with a single call site is one refactor away from being inert.

**The honest cost, stated so the planner can decline:** `writeTemp` is on the per-turn hot path (`writeChatMcpConfig` runs on every Claude/Copilot send), so a transient error now costs up to 1.5 s of a chat turn instead of failing fast. If the planner prefers a narrower scope, the next-best option is `withFsRetry` around `writeChatMcpConfig` only, and **explicitly recording in the phase report that RUN-04's headline half was satisfied structurally** — which is true either way, and is the claim the requirement actually makes.

---

## Runtime State Inventory

Phase 5 rewrites a launch path rather than renaming an identifier, but it **deletes files that exist at runtime** and changes what external CLIs have persisted. Each category answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | **None.** No database key, collection name or user id changes. The SQLite persistence layer (`persistence.ts`) stores settings and chats, neither of which references a wrapper path — verified by `grep` for `.sh` across `packages/backend/src`: matches only in `index.ts` at the five path literals in § *Complete Site Inventory* | none |
| **Live service config** | **Yes — `~/.gemini/settings.json` and `~/.codex/config.toml`.** `registerMcpWithCli` (`:2249`) runs `mcp add drift -- <wrapperPath>` and these CLIs **persist** the entry outside Drift's temp dir. A stale entry points at a `drift-mcp-<token>` path from a previous session | **None in Phase 5, deliberately.** D-01 keeps the wrapper on POSIX so the persisted entry stays valid; `unregisterMcpFromCli` (`:2311`) already removes on cleanup. On win32 D-01 skips registration, so nothing new is persisted. **Phase 7 (PRV-03) owns the migration** — it must `mcp remove` any entry a Phase-≤5 Drift left behind, since a user upgrading mid-phase can have a stale `drift` entry pointing at a deleted `.sh` |
| **OS-registered state** | **None.** Drift registers no scheduled task, service, launchd plist or pm2 process. Confirmed: no `schtasks`/`launchctl`/`systemctl`/`pm2` reference anywhere in `packages/` | none |
| **Secrets / env vars** | **The Caido token relocates, it does not change name.** It moves from `mcp-wrapper-<sid>.sh`'s `export CAIDO_TOKEN=…` and `mcp-self-test-<id>.sh` into (a) the spawn `env` dict, in memory, and (b) `mcp-<chatId>.json`'s `env` field, `0o600`. `CAIDO_TOKEN` / `CAIDO_URL` / every `DRIFT_*` name is **unchanged**, so `mcp-server.mjs:12-38` needs no edit. D-10's net accounting holds: files that ever hold the token go **down** (the self-test `.sh` disappears entirely) | **None.** But the plan should state the invariant: `mcp-server.mjs` is not edited in this phase |
| **Build artifacts** | **`dist/` only**, which is gitignored (`.gitignore:2`). If the planner adopts § *Finding C-1*, `dist/drift.zip` — referenced only by the `rm -f` and produced by nothing — stops being mentioned; **CLAUDE.md § *Configuration* still calls it "the final deliverable"** and should be corrected in the same change | Update CLAUDE.md's stale `dist/drift.zip` line |
| **Orphaned runtime files on a user's disk** | `drift-mcp-*` directories from a previous Drift version may contain `mcp-wrapper-*.sh`, `mcp-self-test-*.sh`, `provider-launch-*.sh` | **Already handled** — `cleanupMcpRuntime` (`:2323`) removes `mcpTempDir` recursively, and `startMcpServer`'s sweep deletes every non-current `drift-mcp-*` under the temp roots. No new sweep logic needed; the existing one is filename-agnostic |

---

## Code Examples

### 1. The keystone, wired into all three orchestration sites

```typescript
// index.ts — one helper, three callers. `host` is Phase 4's cached os read (D-02).
async function requireMcpServerSpec(): Promise<Result<McpServerSpec>> {
  const mcpScriptPath = getTempMcpScriptPath();
  if (mcpScriptPath === undefined) return err("Drift MCP runtime is not running.");
  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") return err(NO_TOKEN_MESSAGE);
  const nodeExecutable = await requireNodeExecutable();
  if (nodeExecutable.kind === "Error") return err(nodeExecutable.error);

  return ok(buildMcpServerSpec({
    nodeExecutable: nodeExecutable.value,
    mcpScriptPath,
    runtimeEnv: buildMcpRuntimeEnv({ caidoToken }),
    parentEnv: process.env,          // injected — the pure module never reads it
  }));
}

// startMcpServer (index.ts:2524-2532) — was writeMcpWrapper -> validateCaidoAuth
const spec = await requireMcpServerSpec();
if (spec.kind === "Error") { await cleanupMcpRuntime(sdk, "error", spec.error); return err(spec.error); }
const validation = await validateCaidoAuth(spec.value);

// refreshActiveMcpRuntime (index.ts:1564-1571) — THE SITE CONTEXT.md MISSES.
// Identical shape. Reached from saveSettings (:1521) and syncCaidoSessionToken (:1596).
const spec = await requireMcpServerSpec();
if (spec.kind === "Error") { await cleanupMcpRuntime(sdk, "error", spec.error); return spec.error; }
const validation = await validateCaidoAuth(spec.value);
```

### 2. `spawnNode` — the single chokepoint, and D-08's test target

```typescript
// index.ts — the ONLY place the MCP server is spawned by Drift itself.
function spawnNode(spec: McpServerSpec, extraArgs: string[]) {
  // stdio array form and env are both source-confirmed under LLRT
  // (modules/llrt_child_process/src/lib.rs:468-501).
  const proc = spawn(spec.command, [...spec.args, ...extraArgs], {
    env: spec.env,                       // already parent-merged by buildSpawnEnv
    stdio: ["pipe", "pipe", "pipe"],
  });
  // MANDATORY and MANDATORILY SYNCHRONOUS. Under LLRT a spawn failure is
  // delivered asynchronously and, with no listener registered, is thrown into
  // the runtime with no JS frame to catch it (lib.rs:293-312). The error carries
  // a message, never a `.code`.
  proc.on("error", (error) => { /* record; classify on message, not code */ });
  return proc;
}
```

```typescript
// mcp-server-spec.spawn.test.ts (D-08) — imports the PRODUCTION builder.
// Shape copied from mcp-server.transport.test.ts:124-190, which already runs
// cross-platform via os.tmpdir() + process.execPath.
import { buildMcpServerSpec } from "./mcp-server-spec";     // ← the same function index.ts calls

const spec = buildMcpServerSpec({
  nodeExecutable: process.execPath,                          // real node, both OSes
  mcpScriptPath: fileURLToPath(new URL("../assets/mcp-server.mjs", import.meta.url)),
  runtimeEnv: { CAIDO_URL: stub.url, CAIDO_TOKEN: "session-token", DRIFT_CONTEXT_FILE: contextFile,
                DRIFT_ALLOWLIST_ACTIVE: "1", DRIFT_ALLOWED_TOOLS: MCP_TOOL_NAMES.join(",") },
  parentEnv: process.env,
});

// HLT-01
const proc = spawn(spec.command, [...spec.args, "--validate-auth"], { env: spec.env, stdio: [...] });
// mcp-server.mjs:698-707 writes JSON to stdout then exits 0/1.
expect(JSON.parse(stdout)).toMatchObject({ ok: true });

// HLT-02 — same spec, no extra arg: initialize -> notifications/initialized ->
// tools/list, then tools/call get_environment and search_history.
```

*If a reviewer can point at a second copy of the spec-building logic inside this file, the test is not evidence (CONTEXT.md § Specific Ideas).*

### 3. D-11's debug line — keys, never values

```typescript
// mcp-server-spec.ts (pure, therefore assertable)
export function formatSpawnDebugLine(input: {
  command: string;
  args: string[];
  injectedKeys: string[];       // KEY NAMES ONLY. platform.ts:262's T-04-04 rule:
}): string {                    // buildSpawnEnv "returns data only and must never be
  return [                      // used to render an environment into a log or diagnostic".
    `spawn command=${input.command}`,
    `args=${JSON.stringify(input.args)}`,
    `injectedEnvKeys=${[...input.injectedKeys].sort().join(",")}`,
  ].join(" ");
}
// Test: expect(formatSpawnDebugLine({… injectedKeys:["CAIDO_TOKEN"]}))
//         .not.toContain(theTokenValue)
// A whole-env redaction regex was rejected in D-11 because it fails OPEN: it
// protects only the keys someone thought to enumerate.
```

### 4. The static gate finding L-4 demands

```bash
# Phase gate. Every spawn that supplies `env` must obtain it from buildSpawnEnv.
# Rationale, in one line so it survives: a bare dict is GREEN on Node CI
# (libuv back-fills eleven required_vars) and BROKEN under LLRT (Rust's
# make_envp writes the map verbatim — library/std/src/sys/process/windows.rs:908).
env_spawns=$(grep -c 'env: ' packages/backend/src/index.ts)
merged=$(grep -c 'buildSpawnEnv(' packages/backend/src/index.ts)
test "$env_spawns" -le "$merged" || { echo "an env-supplying spawn bypasses buildSpawnEnv"; exit 1; }

# D-02's dated-deletion discipline, made mechanical.
grep -rn 'DELETED IN PHASE [0-9]\+ (' .github/workflows packages/backend/src

# SC-1 as amended by D-01: exactly two .sh literals survive, both mcp-wrapper.sh.
test "$(grep -c '\.sh"' packages/backend/src/index.ts)" -eq 2
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generate a shell script that `export`s env and `exec`s the server | `command` + `args` + `env` handed to `spawn` / written into config JSON | The universal stdio-MCP convention (Claude Desktop, VS Code, Cursor, Continue all converge on it) | This phase. `research/ARCHITECTURE.md` § *Comparable-tool pattern* |
| Wrap every Windows MCP command in `cmd /c` | `cmd /c` **only** for `npx`/`.cmd`/`.bat`; absolute paths to real executables spawn directly | Post-CVE-2024-27980 (Node ≥ 18.20.2) | Drift's `command` is an absolute `node` path, so it needs no wrapper on any OS — cleaner than the `npx` examples in every comparable host's docs |
| `type` required in MCP config entries | Absent `type` is read as stdio; only a `url` without `type` is an error | Claude Code ≥ v2.1.202 (error text changed in that release) | Drift's config omits `type` and stays correct |
| `zip`/`cp` shell tail after the bundler | `caido-dev build` bundles **and** zips via JSZip | `@caido-community/dev` gained the asset glob + JSZip packager | § *Finding C-1* — the tail is a no-op today |

**Deprecated / outdated in this repo:**
- `dist/drift.zip` — named in `package.json`'s `rm -f` and in CLAUDE.md § *Configuration*, **produced by nothing**. `release.yml` signs `dist/plugin_package.zip`.
- `windows-llrt-probe.yml` — headed `TEMPORARY — DELETED IN PHASE 9 (D-02)`. D-07 lands its successor now; only Phase 9 deletes it.
- `redactDebugText`'s shell arm (`index.ts:786`) — dead once nothing dumps shell-shaped content (Claude's Discretion).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| **A1** | The Caido host process's own environment contains a usable `PATH` on Windows | § *LLRT L-1* | LOW for Phase 5 — D-05 already states the fallback: the MCP server is spawned by absolute `node` path and `mcp-server.mjs` spawns nothing, so a thin `PATH` cannot break the health check. It bites Phase 7's provider CLI (PRV-01). This is exactly why D-05 REPORTS rather than GATES |
| **A2** | The Caido session token never contains the two characters `${` | § *Claude Code contract*, § *Pitfall 3* | MEDIUM — the failure is a silently unauthenticated MCP server. Mitigated by a one-line guard at the write site. Drift reads the token from `window.localStorage` and constrains nothing |
| **A3** | `pnpm install --frozen-lockfile` completes on `windows-latest` without long-path or optional-dep trouble | § *Verifying D-09's Measurement* | MEDIUM — would make D-07's leg red on the install step, before any Phase 5 code runs. Not pre-emptively worked around; named so the first red run is read correctly |
| **A4** | `zip` is genuinely absent from the Windows runner (inferred from its absence in the image manifest, which is not the same as a `where zip` returning nothing) | § *Finding C-1* | LOW — the recommendation (delete the tail) is correct regardless, since the tail is a measured no-op. Only matters if the planner keeps the tail |
| **A5** | The commit of `caido/dependency-llrt` that Caido actually ships matches `main`, whose last push `04-RESEARCH.md` records as 2026-04-22 | § *LLRT Runtime Surface* (all findings) | MEDIUM — this is `04-RESEARCH.md` § *Pitfall 7*'s standing ceiling, unchanged. Source analysis raises confidence; only a real Windows Caido install closes it (Phase 9/10) |
| **A6** | `--strict-mcp-config` does not alter how a loaded server's `env` field is processed | § *Claude Code contract* | LOW — no interaction is documented, and Drift already ships both flags together with a working Copilot `env` precedent. Absence of documentation is not proof of absence |
| **A7** | Reducing `build` to `caido-dev build` does not change the release artifact in any way `release.yml` or the Caido store pipeline notices | § *Finding C-1* | LOW-MEDIUM — entry names and byte lengths were measured identical, but zip *metadata* (ordering, timestamps, directory entries) differs, and the store pipeline signs the bytes. **Verify by running the release workflow's sign+extract steps against the new zip before merging**, per the store-release discipline |

---

## Open Questions

1. **Does the config-JSON projection carry the parent-merged `env` or only `driftVars`?**
   - What we know: the spawn path must merge (L-4). Copilot ships `buildMcpRuntimeEnv(...)` alone today (`:2796`), and CMP-01 says do not move it.
   - What's unclear: nothing about correctness — it is a blast-radius judgement about writing the user's whole environment into a `0o600` file that D-10 already makes token-bearing.
   - Recommendation: keep the projections distinct (spec carries both `env` and `driftVars`); the config documents use `driftVars`. Preserves Copilot's byte-shape exactly.

2. **Does the D-10 no-secret-material gate move into `ci.yml` now, or wait for Phase 9?**
   - What we know: ROADMAP § *Phase 9 SC-1a* requires it to survive `windows-llrt-probe.yml`'s deletion, in its three-branch form. D-07 moves the job it was destined for.
   - What's unclear: whether Phase 5 wants to own re-pointing its scan targets (which must stay self-non-matching).
   - Recommendation: move it now with the job. A gate whose targets vanish in Phase 9 fails on `grep` status 2 — the third arm exists precisely to catch that.

3. **Does `buildMcpRuntimeEnv` move into the pure module?** (Claude's Discretion, raised in CONTEXT.md.)
   - What we know: it reads **two** pieces of module state, not one — `currentSettings.caidoApi.url` (`:1024`) and `getMcpContextFilePath()` (`:1026`), which itself reads `mcpTempDir`.
   - What's unclear: whether four call sites' worth of injection churn is worth making ~9 env keys Linux-assertable.
   - Recommendation: **move it**, taking `{ caidoUrl, contextFilePath, caidoToken, toolPolicy, activityFilePath, approvalsFilePath }`. It converts the phase's central data structure from bucket N to bucket L, and the injection is mechanical.

4. **What `timeout-minutes` for the Windows leg?**
   - What we know: the probe uses 10 for a dependency-free single step; this leg adds install + typecheck + lint + 263 tests + build.
   - Recommendation: start at 20, then set it from the first real run's measured duration and record the run URL beside it (Phase 3 D-11/D-12/D-13).

---

## Environment Availability

Probed on the maintainer's host this session.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | `v26.7.0` (`.nvmrc` pins `20`; CI matrix covers 20/22/24/26) | — |
| pnpm | build, test | ✓ | `9.0.0` (matches `packageManager`) | — |
| git | CI, `.gitattributes` | ✓ | `2.55.0` | — |
| `zip` | current `build` script tail | ✓ locally | — | **Absent on `windows-latest`** — see § *Finding C-1*; the fallback is to delete the tail |
| `caido-dev` | build | ✓ | `@caido-community/dev` 0.1.6 | — |
| vitest | tests | ✓ | 4.0.18 — **263 tests / 29 files / 0 failures / 779 ms** (measured this session) | — |
| `claude` CLI | manual UAT only | ✓ | — | Not required by any automated Phase 5 criterion |
| A native Windows machine | HLT-01/HLT-02 real-machine proof | ✗ | — | `windows-latest` CI (D-07) + reporter confirmation in Phase 9/10. **This is the constraint the whole validation architecture is built around** |
| Caido on Windows / LLRT on Windows | closing the vehicle caveat | ✗ | — | **No fallback exists.** No standalone LLRT Windows binary; headless Caido in CI needs a paid Teams plan (`03-FINDINGS.md` § *Vehicle caveat*) |

**Missing dependencies with no fallback:** a real Windows Caido runtime. Bucket **N** below; D-08's caveat is the adopted mitigation.
**Missing dependencies with fallback:** `zip` on Windows (delete the tail); a native Windows machine (`windows-latest` CI).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` (repo root; `setupFiles: ["./vitest.setup.ts"]`) |
| Quick run command | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts packages/backend/src/platform.test.ts packages/backend/src/provider-launch.test.ts` |
| Full suite command | `pnpm exec vitest run` — **measured baseline 263 tests / 29 files / 0 failures / 779 ms** |
| Static gates | `pnpm -r typecheck` and `pnpm lint` (`--max-warnings 0`, never `--fix`) |
| New in this phase | `windows-latest` leg of `ci.yml` running the same three commands plus `pnpm build` |

### The hard constraint this section is designed around

Two facts, both load-bearing:

1. **The maintainer cannot test native Windows locally** (PROJECT.md § *Constraints*). D-07 changes this by pulling CI-01 forward — Phase 5 is the **first** phase with a Windows runner. That moves criteria out of the old "W = unreachable" bucket and into "W = reachable, on CI".
2. **`index.ts` is 4,003 lines with zero direct test coverage.** No test file imports it, and `vitest.config.ts` declares no `caido:plugin` alias (CONTEXT.md domain fact 5, re-verified this session). SC-2 names `validateCaidoAuth` (`:1209`) and the self-test, both of which live there. Anything left inline in `index.ts` is bucket **N** by construction, and D-08 is how that gap is closed *honestly* rather than papered over.

Buckets, following `04-RESEARCH.md`'s scheme with W's meaning updated:

- **L** — provable on the existing Linux/macOS runner, because inputs are injected.
- **W** — needs the `windows-latest` runner, **which this phase lands**.
- **N** — not provable in CI at all, on any runner available to this project.

### Phase Requirements → Test Map

| # | Req | Behavior | Bucket | Test Type | Automated Command | Exists? |
|---|-----|----------|--------|-----------|-------------------|---------|
| V-1 | RUN-01 | `buildMcpServerSpec` returns `{command: node, args: [mjs], env}` from injected inputs | **L** | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts -t "buildMcpServerSpec"` | ❌ Wave 0 |
| V-2 | RUN-02 | The spec's `env` is the parent block merged with `driftVars` — a parent-only key survives, a drift key overrides | **L** | unit | `… -t "merges the parent environment"` | ❌ Wave 0 |
| V-3 | RUN-02 | The spec's env carries `CAIDO_URL`, `CAIDO_TOKEN` and every `DRIFT_*` key `mcp-server.mjs:12-38` reads | **L** | unit | `… -t "carries every DRIFT_ key"` | ❌ Wave 0 |
| V-4 | RUN-01/02 | Claude's and Copilot's config documents are the **same projection** of one spec (Pattern 2) | **L** | unit | `… -t "one spec, two callers"` | ❌ Wave 0 |
| V-5 | RUN-01 | `writeLaunchScript`, `mcp-self-test-*.sh`, `mcp-wrapper-<sid>.sh`, `provider-launch-<sid>.sh` are gone; exactly **2** `.sh` literals survive | **L** | static | `test "$(grep -c '\.sh"' packages/backend/src/index.ts)" -eq 2` | ❌ Wave 0 |
| V-6 | RUN-01 | Exactly **one** `spawnAndWait("chmod"` survives, and `enforceOwnerOnlyDir`'s namespace `chmod` is untouched (§ *Pitfall 1*) | **L** | static | `test "$(grep -c 'spawnAndWait("chmod"' …)" -eq 1` + blob-identity check on `:660-690` | ❌ Wave 0 |
| V-7 | RUN-01 | **All three** `writeMcpWrapper` call sites and **both** `validateCaidoAuth` call sites are accounted for (§ *Pitfall 2*) | **L** | static | `grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(" …` compared against the expected line set | ❌ Wave 0 |
| V-8 | CMP-01 (D-01/D-02) | `planMcpCliRegistration({platform:"win32"})` returns `Skip` — the wrapper path is unreachable on win32 | **L** | unit | `… -t "unreachable on win32"` | ❌ Wave 0 |
| V-9 | CMP-01 (D-03) | The win32 skip reason names the provider **and** Phase 7, verbatim | **L** | unit | `… -t "skip reason names Phase 7"` | ❌ Wave 0 |
| V-10 | RUN-02 (D-11) | The spawn debug line contains injected env **key names** and never a value | **L** | unit | `… -t "never logs an env value"` | ❌ Wave 0 |
| V-11 | CMP-01 | `provider-launch` argv arrays are byte-identical (the CMP-01 tripwire) | **L** | regression | `pnpm exec vitest run packages/backend/src/provider-launch.test.ts` — **must not be edited** | ✅ exists |
| V-12 | HLT-01 | The **production** spec spawns and `--validate-auth` returns `{ok:true}` against a local HTTP stub | **L** | integration | `pnpm exec vitest run packages/backend/src/mcp-server-spec.spawn.test.ts -t "validate-auth"` | ❌ Wave 0 |
| V-13 | HLT-02 | `tools/list`, `get_environment`, `search_history` all succeed over the spawned spec | **L** | integration | `… -t "self-test methods"` | ❌ Wave 0 |
| V-14 | CMP-01 | Existing suite stays green — the real regression net | **L** | regression | `pnpm exec vitest run` — 263 must stay green, minus any test made obsolete by a deletion (state each removal explicitly) | ✅ exists |
| V-15 | CI-03 (D-09) | `.gitattributes` exists with `* text=auto eol=lf` | **L** | static | `grep -q 'eol=lf' .gitattributes` | ❌ Wave 0 |
| V-16 | HLT-01 (SC-2) | **V-12 passes on `windows-latest`** | **W** | integration | the Windows leg's `pnpm exec vitest run` | ❌ Wave 0 (job) |
| V-17 | HLT-02 (SC-2) | **V-13 passes on `windows-latest`** | **W** | integration | same | ❌ Wave 0 (job) |
| V-18 | CI-01 | `pnpm build` succeeds on `windows-latest` | **W** | build | the Windows leg's `Build` step — **requires § *Finding C-1*** | ❌ Wave 0 (job) |
| V-19 | CI-03 | The **whole** 263-test suite is green on `windows-latest`, for code reasons | **W** | regression | the Windows leg's `Test` step | ❌ Wave 0 (job) |
| V-20 | RUN-04 | A **real** Defender lock is survived on real hardware | **N** | — | Not inducible in CI (`04-RESEARCH.md` verdict, unchanged). Mitigation: RUN-04 is satisfied **structurally** here — no write→exec pair remains on any Windows-reachable path — plus `mcpFirstWriteAttempts` in diagnostics |
| V-21 | SC-2 | **`index.ts`'s WIRING** of `buildMcpServerSpec`/`spawnNode` into the three orchestration sites | **N** | — | `index.ts` is not importable. Mitigation: D-08's caveat, verbatim, in the plan *and* the phase report; plus V-5/V-6/V-7's static gates and code review. **Deferred:** the `caido:plugin` alias (Phase 9) |
| V-22 | RUN-02 | The env contract **under LLRT**, where Rust's `make_envp` does not back-fill (finding L-4) | **N** | — | The Node vehicle back-fills eleven names, so a bare-dict regression passes V-2, V-12 *and* V-16. Mitigation: the § *Code Examples* #4 static gate, which is vehicle-independent |
| V-23 | RUN-01 | Behaviour under the real Caido LLRT runtime at all | **N** | — | `03-FINDINGS.md` § *Vehicle caveat*, carried verbatim per CONTEXT.md canonical-refs #3. Closes only in Phase 9/10 with a real Windows Caido install |
| V-24 | PRV-01 | A real Claude CLI reading `mcp-<chatId>.json` and connecting on Windows | **N** *(out of scope)* | — | **Phase 7.** Phase 5 claims the health check only (CONTEXT.md § *Explicitly NOT this phase*). Do not let the D-08 test's green be read as this |

**Bucket tally: L = 15, W = 4, N = 5.** 15/24 = **63 % provable on hardware the maintainer has**; 19/24 = **79 % provable in CI once D-07's leg lands**. Compare Phase 4's 33 L / 2 W / 2 N.

**The ratio is worse than Phase 4's, and that is the honest reading, not a failure.** Phase 4 was *building* pure modules — nearly everything it produced was injectable by construction. Phase 5 is *rewiring an orchestrator* that cannot be imported. Three of the five **N** rows (V-21, V-22, V-23) are the same underlying gap seen from three angles: **the thing being changed lives in `index.ts`, and the runtime it must work on cannot be executed by any test this project can run.** D-08 exists precisely to state that rather than dress around it, and D-06 exists to keep the bucket from being larger. The two mitigations that actually move the needle are already decided: the pure spec module (D-06) and the static gates. The one that would move it further — the `caido:plugin` alias — was deliberately deferred with a reason (`CONCERNS.md`: module-level singletons with no reset mechanism between tests).

**One number the planner should watch:** if V-21's mitigation ends up being "code review", the phase has one criterion whose only evidence is a human reading a diff. That is acceptable *once* and only when stated as such — the same discipline Phase 4 applied to its RUN-05 legibility criterion, which was closed by a dated real human read recorded as a human read.

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` — sub-second; no excuse to skip.
- **Per wave merge:** `pnpm -r typecheck && pnpm lint && pnpm exec vitest run` — all 263 plus both static gates. Note `noUnusedLocals` + `--max-warnings 0` turn a half-finished deletion set into a hard failure; that is a feature (§ *Pitfall 5*).
- **Phase gate:** the full CI matrix green — four `Verify (Node N)` legs **plus** the new `windows-latest` leg — before `/gsd-verify-work`, with the static gates from § *Code Examples* #4 executed, not inferred from diffs (Phase 4's Gate discipline). Every CI claim carries its run URL and the log line proving the mechanism, written **after** reading the real run (Phase 3 D-11/D-12/D-13).

### Wave 0 Gaps

- [ ] `packages/backend/src/mcp-server-spec.ts` + `mcp-server-spec.test.ts` — covers V-1…V-4, V-8…V-10
- [ ] `packages/backend/src/mcp-server-spec.spawn.test.ts` — covers V-12, V-13 (and V-16, V-17 on the Windows leg). Template: `mcp-server.transport.test.ts:124-190`
- [ ] `.gitattributes` (`* text=auto eol=lf`) — covers V-15
- [ ] `.github/workflows/ci.yml` — the `windows-latest` job — covers V-16…V-19. **Blocked on § *Finding C-1*** (the `build` script) for V-18
- [ ] The static-gate script or Makefile target holding V-5, V-6, V-7 and § *Code Examples* #4 — these must be **executed** at the phase gate, not asserted in prose
- [ ] `runtime-probe.ts` extension for D-05's reported `PATH`-entry-count / env-key-count metric (non-gating, per Phase 4 D-06)
- [ ] Framework install: **none needed** — vitest 4.0.18 present and configured
- [ ] Shared fixtures: **none needed** — the local-HTTP-stub + `mkdtemp` + `afterEach` pattern already exists in `mcp-server.transport.test.ts:20-22,43-88`

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **yes** | The Caido bearer token is the whole auth story. Phase 5 relocates it from a `0o700` `.sh` to a `0o600` `.json` in the same `0o700` dir, and **deletes one file that held it** (`mcp-self-test-<id>.sh`). D-10's net-reduction accounting is correct |
| V3 Session Management | no | No session state changes; `cliSessions` and `sessionRuntimeFiles` are untouched |
| V4 Access Control | **yes** | `DRIFT_ALLOWED_TOOLS` / `DRIFT_CONFIRMATION_REQUIRED_TOOLS` / `DRIFT_ALLOWLIST_ACTIVE` now travel in the spawn `env` and the config `env`. **`mcp-server.mjs:38`'s fail-closed contract must survive:** `ALLOWLIST_ACTIVE = process.env.DRIFT_ALLOWLIST_ACTIVE === "1"`, and an empty allowlist with the flag set means deny-all. A spec that drops the flag silently **fails open** — every tool exposed. Worth a dedicated unit assertion (folded into V-3) |
| V5 Input Validation | **yes** | `mcp-<chatId>.json`'s filename interpolates `chatId` into a path. **SEC-02 (Phase 2, still `Not started`) owns validating it**, and D-10 makes that file token-bearing — CONTEXT.md § *Deferred Ideas* states plainly that Phase 5 does not absorb SEC-02 but "slightly raises the stakes on it." Record the raised stakes in the phase report so Phase 2's planner sees it |
| V6 Cryptography | no | No crypto in scope. `genUUID`'s hex loop stays (Phase 3 P3-UUID has zero LLRT confirmation in either direction) |
| V7 Error Handling & Logging | **yes** | D-11 is the control: keys never values. `platform.ts:262`'s T-04-04 comment is the standing rule. The rejected alternative (regex-redact a whole environment) **fails open** — it protects only the keys someone thought to enumerate |
| V12 Files & Resources | **yes** | `0o700` dir + `0o600` file, unconditional (`writeTemp:692-697`). On win32 both are silently ignored; the per-user `%TEMP%` ACL is the accepted baseline and `icacls` hardening (HRD-01) is v2. Settled in Phase 4; not reopened |
| V14 Configuration | **yes** | The new `windows-latest` CI leg. Reuse `ci.yml`'s existing action pins; carry the D-10 no-secret-material gate in its **three-branch** form |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via a shell-interpolated prompt | Tampering / EoP | **Structurally impossible after D-04** — the prompt goes to `proc.stdin` (`sendCliMessage`), never argv, and the last shell interpolation on the Claude path (`renderExportExecScript` + `shellQuote`) is deleted from it. This phase *reduces* the attack surface |
| `shell: true` with dynamic argv | Tampering / EoP | Banned outright (REQUIREMENTS.md § *Out of Scope*). Not used by any Phase 5 site. Note L-3: LLRT's `shell: true` is a bare `cmd.exe` with verbatim args — even less safe than Node's |
| Token disclosure via a temp file | Information Disclosure | `0o700`/`0o600` on POSIX; per-user `%TEMP%` ACL on Windows; `finalize()` (`:3300-3311`) removes the config on turn end; `cleanupMcpRuntime` removes the whole dir. **Net file count holding the token goes down** this phase |
| Token disclosure via the debug log or support bundle | Information Disclosure | D-11 (key names only) + T-04-04 (`buildSpawnEnv` output must never be rendered into a log) + `redactDebugText`'s JSON arm for the config dump at `:2920` |
| Token disclosure via a persisted external-CLI config | Information Disclosure | `gemini mcp add` / `codex mcp add` write to `~/.gemini`/`~/.codex`, **outside** Drift's temp dir and not swept. D-01 keeps the status quo (a wrapper *path*, not the token, is persisted). Phase 7 PRV-03 owns the fix |
| Fail-open tool allowlist | EoP | `DRIFT_ALLOWLIST_ACTIVE=1` must be present in every projection of the spec. `mcp-server.mjs:32-38` |
| Silently unauthenticated MCP server via `${}` expansion | Spoofing | § *Pitfall 3* — Claude Code expands `${VAR}` inside `env`. Guard the literal token at the write site |
| Deleting the user's `claude` binary | Denial of Service | CONTEXT.md domain fact 3 — `finalize()`'s `rm(launchCommand)` **must** be deleted together with the `launchCommand` indirection, never left bare |

---

## Sources

### Primary (HIGH confidence — downloaded and read in this session)

- **`caido/dependency-llrt@main` Rust source**, the strongest evidence in this document:
  - `modules/llrt_child_process/src/lib.rs:468-475` — the `env` option: `command.env_clear(); command.envs(env);` (finding L-2)
  - `modules/llrt_child_process/src/lib.rs:395-505` — the full supported-options set; **`windowsHide` absent** (L-3)
  - `modules/llrt_child_process/src/lib.rs:56-90` — `prepare_shell_args`: `shell:true` → bare `cmd.exe`, verbatim args, no `/d /s /c` (L-3, Phase 7 note)
  - `modules/llrt_child_process/src/lib.rs:293-312` — spawn failure is **async**, message-only, no `.code` (L-5)
  - `modules/llrt_process/src/lib.rs:148,158-163` — `process.env` = `std::env::vars()`, unfiltered, behind a setter-only Proxy (L-1)
- **`rust-lang/rust@master` `library/std/src/sys/process/windows.rs:908-933`** — `make_envp` writes the supplied map verbatim; **no libuv-style `required_vars` back-fill** (L-4)
- **`actions/runner-images@main` `images/windows/Windows2025-Readme.md`** — Windows Server 2025 software manifest; `7zip 26.02` present, **no `zip` entry**; Git-for-Windows bash at `C:\Program Files\Git\bin\bash.exe`
- **Repo ground truth, read at HEAD `5f10bea`:** `packages/backend/src/index.ts` (all sites in § *Complete Site Inventory*), `platform.ts:200-271`, `provider-launch.ts`, `runtime-probe.ts:30-110,282-340`, `mcp-server.transport.test.ts:1-190`, `assets/mcp-server.mjs:1-45,698-707`, `package.json`, `caido.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/windows-llrt-probe.yml`, `node_modules/@caido-community/dev/dist/cli.js:170-290`
- **Measurements taken this session:** `pnpm exec caido-dev build` vs `pnpm build` zip comparison (identical entry names + byte lengths); `pnpm exec vitest run` = 263/29/0/779 ms; the three D-09 re-verifications (`toMatchSnapshot` = 0 matches, one file-reading test, no `.gitattributes`); `node --version` `v26.7.0`, `pnpm --version` `9.0.0`
- **`.planning/phases/03-…/03-FINDINGS.md`** — the canonical Phase 3 verdict (P0-ENV `PARENT-CLEARED` on [run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574), the eleven `required_vars`, P1-CMD `EINVAL`, § *Vehicle caveat*). Cited per CONTEXT.md canonical-refs; artifacts expire 2026-09-12
- **`.planning/phases/04-platform-foundation/04-RESEARCH.md`** — the Windows transient-FS taxonomy, the `withFsRetry` ladder shape, Pitfall 7 (`API.md` trails the source), Pitfall 8 (`process.execPath` undefined under Caido), and the Validation-Architecture bucket scheme this section follows

### Secondary (MEDIUM confidence — official documentation, fetched this session)

- **code.claude.com/docs/en/mcp** — the stdio `{type,command,args,env}` shape; "an entry with no `type` is read as a stdio server"; § *Environment variable expansion in `.mcp.json`* naming `env` as an expansion location and describing the missing-variable warning
- **code.claude.com/docs/en/cli-reference** — `--mcp-config` ("Load MCP servers from JSON files or strings") and `--strict-mcp-config` ("Only use MCP servers from `--mcp-config`, ignoring all other MCP configurations")
- **pnpm.io/settings/other** — `scriptShell` (default `null`) and `shellEmulator` (default `false`, "a JavaScript implementation of a bash-like shell")
- **docs.github.com — workflow syntax, `jobs.<id>.steps[*].shell`** — pwsh is the Windows default; `shell: bash` maps to Git-for-Windows bash, invoked `bash --noprofile --norc -eo pipefail {0}`
- **doc.rust-lang.org/std/process/struct.Command.html** — `env_clear`: "prevents inheriting any parent process environment variables"; no Windows back-fill note
- **learn.microsoft.com — KB 2503886, "Copying .EXE files may result in a sharing violation"** — the app-compat handle mechanism, `.EXE`-specific
- **`research/ARCHITECTURE.md`** (the binding design doc) — § *TL;DR*, § *System Overview* "what disappears", § *Component Responsibilities*, § *Pattern 1* (D-05's source), § *Pattern 2*, § *Comparable-tool pattern*, § *Anti-Patterns 1-5*

### Tertiary (LOW confidence — flagged for validation)

- Microsoft Defender for Endpoint share-mode conflict phrasing (`mssense.exe` opening read-only-share, conflicting with a *writer*) — reached via web search summary, not a primary Microsoft page. The mechanism is standard Win32 share-mode semantics; the specific wording is not verified against a canonical source (§ *RUN-04*, reason 1)
- `zip`'s absence from `windows-latest` inferred from the image manifest rather than a `where zip` on a live runner (A4)
- pnpm long-path behaviour on `windows-latest` (A3) — not measured; named as a candidate first-red-run cause

---

## Metadata

**Confidence breakdown:**

- **LLRT runtime surface:** HIGH — every claim read from the Rust source this session, with file and line. Ceiling unchanged: the shipped Caido commit may differ from `main` (A5), so this raises confidence rather than closing the gap (`04-RESEARCH.md` § *Pitfall 7*).
- **Codebase site inventory:** HIGH — enumerated by `grep` over `index.ts` at HEAD, with line numbers. The `refreshActiveMcpRuntime` finding is directly checkable.
- **CI mechanics:** HIGH for the build-script finding (measured end-to-end this session, including the zip comparison); HIGH for the `setup-node`/`action-setup` ordering (already paid for on [run 31702174047](https://github.com/six2dez/drift/actions/runs/31702174047)); MEDIUM for install-step risks on Windows (A3, A4).
- **Claude `--mcp-config` contract:** MEDIUM-HIGH — official docs, quoted. The `${}`-expansion hazard is documented behaviour; only the token's charset is assumed (A2).
- **RUN-04 write-then-read:** MEDIUM — the structural argument is HIGH (the pairs are deleted or platform-fenced, which is checkable); the AV share-mode asymmetry rests on one primary MS Learn page plus standard Win32 semantics.
- **Validation architecture:** HIGH for the bucket assignments (each traces to a concrete importability or vehicle fact); the L/W/N tally is a judgement the planner may refine as criteria are split.

**Research date:** 2026-08-20
**Valid until:** 2026-09-19 (30 days). Re-verify sooner if: `caido/dependency-llrt` publishes a new `main`; `@caido-community/dev` is upgraded past 0.1.6 (§ *Finding C-1*'s measurement is version-specific); or Claude Code changes its `--mcp-config` schema.
