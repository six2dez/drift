# Phase 7: Provider Spawn & Registration — Research

**Researched:** 2026-08-21
**Domain:** Windows process spawning of npm `.cmd` shims from a constrained JS runtime; external-CLI MCP registration surfaces (`gemini mcp add`, `codex mcp add`) and their environment-forwarding semantics
**Confidence:** HIGH for Q1–Q4 (upstream source read this session, file + line cited); MEDIUM for the LLRT-vehicle half of Q3 (Caido's LLRT fork source read, never executed on Windows); see per-finding tags.

**Confidence tag legend** — used on every claim below, per 03-FINDINGS.md's vehicle-caveat discipline:

| Tag | Means |
|---|---|
| **measured** | Observed executing, on a real host, in this repo's record |
| **source-verified** | The upstream implementation was read this session; file + line + commit cited |
| **documented** | An official doc says so; the implementation was not read |
| **unverified** | Inferred, recollected, or reasoned — NOT established |

---

<user_constraints>
## User Constraints (from 07-CONTEXT.md)

### Locked Decisions — research informs HOW, never WHETHER

- **D-01:** Phase 7 aims for a REAL approval/activity channel for Gemini/Codex, with per-CLI
  disable-and-state as the floor. Decided **per CLI** — Gemini and Codex may reach different verdicts.
- **D-02:** The carrier is **ENV INHERITANCE** from the Drift-spawned CLI process — verified, then
  relied upon. No new indirection is built. (Rejected: session-pointer file; per-turn re-registration.)
- **D-03:** **LOCKED CONSEQUENCE FOR PRV-03** — the Gemini/Codex `--env`/`-e` registration must NOT
  carry `DRIFT_ACTIVITY_FILE` or `DRIFT_APPROVALS_FILE`. Registration-time values would name a file
  that does not exist yet **and** clobber the inherited per-session value. These two keys are
  inheritance-only.
- **D-04:** A STATIC per-provider capability flag in `packages/shared/src` drives the posture, AND
  `mcp-server.mjs:623`'s message is upgraded **regardless and unconditionally**.
- **D-05:** Evidence = an AUTOMATED test for Drift's half (sharing the production builder, 05-D-08's
  shape) + a **CITED upstream source per CLI** for the CLI's half (06-D-12). A citation, not a
  recollection. The vehicle caveat is written verbatim into the plan and phase report.
- **D-06:** When the evidence is inconclusive for a CLI, the flag **FAILS CLOSED** — sensitive tools
  off. House pattern (`planMcpCliRegistration` on `undefined` platform; `DRIFT_ALLOWLIST_ACTIVE`).
- **D-07:** Approvals and the activity trace are ONE channel; both are in scope for SC-4.
- **D-08:** The limitation is stated through `skippedMcpCliReasons` + a README line — and wiring that
  map to `getProviderStatuses` / the provider card in `SettingsView.vue` is **work this phase owns**.
  The map's meaning **widens** (not-registered vs registered-but-limited); the sentences must
  disambiguate on their own.

### Claude's Discretion (offered and not selected — OPEN, not settled)

- **`.cmd` spawn strategy (PRV-02).** Roadmap SC-2 names the shape; PITFALLS § Pitfall 1 adds that
  `cmd.exe` re-parses its own arguments even in argv form. The EINVAL surface is **three** sites.
- **Token hygiene and the guaranteed `mcp remove` (PRV-03 / SC-3).** (a) literal token vs
  `${CAIDO_TOKEN}` vs `DRIFT_TOKEN_FILE`; (b) `unregisterMcpFromCli` returns early unless
  `registeredMcpCliPaths` holds an entry from *this process run*.
- **PRV-01 evidence and Gemini's SC-5 gating.** Fixture `.cmd` on `PATH` through the production
  spawn builder; SC-1's reporter confirmation is *where possible* and must not become a gate.

### Deferred Ideas (OUT OF SCOPE — do not research, do not plan)

Manual real-run env pass-through confirmation on macOS · session-pointer file in `mcp-server.mjs` ·
a distinct per-provider capability notice in the frontend · `icacls` ACL hardening (HRD-01, v2) ·
aliasing `caido:plugin` in `vitest.config.ts` (Phase 9) · Phase 2 SEC-02 · `windowsHide: true`
(UX-04, Phase 10) · process-tree kill (LIF-01, Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRV-01 | Claude Code chat end-to-end on Windows with Drift MCP attached | **Q3** (`.cmd` spawn incantation + escaping); **Q5** (CI vehicle). Claude's *native* Windows installer emits `claude.exe` — the `.exe` arm needs no `cmd.exe` at all, so PRV-01 has a short path and a long path. |
| PRV-02 | Spawn provider `.cmd` shims via `cmd.exe /d /s /c` argv, never `shell:true` | **Q3**. The SC-2 wording is **incomplete**: `windowsVerbatimArguments: true` plus explicit `^`-escaping is required, otherwise the runtime's own quoting fights cmd's re-parse. |
| PRV-03 | Register MCP with Gemini/Codex via `node.exe` + args + env, token hygiene, guaranteed `mcp remove` | **Q2** (real flag surfaces, no `${VAR}` for Codex, expansion-with-silent-empty for Gemini); **Q4** (`--scope` defect, idempotent removes). |
| PRV-04 | Gemini/Codex/Copilot usable on Windows, best-effort | **Q2/Q4**; open upstream Windows MCP issues catalogued for the honest status wording. |
| PRV-05 | Gemini/Codex get an approval/activity channel, or sensitive tools off + stated | **Q1** — the headline result: **Gemini forwards, Codex does not.** Split verdict. |
| UX-01 | Provider binary-path picker accepts `.exe`/`.cmd` | **Q5**. `resolveCommand`'s absolute arm already accepts them; the real content of SC-6 is that a pinned `.cmd` must *launch*, not merely resolve. |

</phase_requirements>

## Summary

Four of the five open questions resolved against upstream source read this session; the fifth
(PRV-01 evidence / UX-01) resolved against this repo's own code. The two findings that change what
the plan does:

**1. D-02's inheritance bet splits.** Gemini CLI builds the stdio MCP server's environment as
`{...process.env}` (sanitized) + config `env`, so `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE`
**do** arrive — source-verified. Codex calls `.env_clear()` and rebuilds the block from a fixed
`DEFAULT_ENV_VARS` whitelist plus explicitly-named `env_vars` plus literal `env` — so the two paths
**do not** arrive, and there is **no `codex mcp add` CLI flag that sets `env_vars`**. Under D-06,
Codex fails closed; Gemini gets the real channel. That is a per-CLI verdict, exactly what D-01
provided for.

**2. SC-2's spawn shape is under-specified and will not work as literally written.** `cmd.exe /d /s
/c <shim> <args>` as a plain argv array with default options is wrong: both Node (libuv) and Caido's
LLRT apply MSVC-convention quoting to each element, and cmd.exe then re-parses the result with its
own, different rules. The vetted incantation — cross-spawn's, unchanged for a decade —
is `cmd.exe` + `["/d","/s","/c", '"' + escapedCommand + " " + escapedArgs.join(" ") + '"']` with
**`windowsVerbatimArguments: true`**. Caido's LLRT fork honours that option (`command.raw_arg(...)`,
source-verified in the `caido` branch), and it is declared in the `@caido/quickjs-types` SpawnOptions
this repo already vendors. `windowsHide` is *not* declared there; `windowsVerbatimArguments` is.

Two further plan-relevant defects were found in Drift's *existing* registration code, neither
previously inventoried: `gemini mcp add`/`remove` default to **`--scope project`** (writes
`<cwd>/.gemini/settings.json`, and hard-errors `exit 1` when cwd is the home directory), and gemini's
`--env` parser **truncates a value at the first `=`**.

**Primary recommendation:** Port cross-spawn's escaping algorithm into a new pure module
`packages/backend/src/spawn-plan.ts` (do not add the dependency), give Gemini the real PRV-05 channel
via env inheritance, fail Codex closed under D-06, and add `--scope user` + an unconditional
best-effort dual-scope `mcp remove` sweep at MCP start.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide `.exe` vs `.cmd` vs `.bat` spawn shape | Pure backend module (`spawn-plan.ts`) | — | `index.ts` is un-importable under vitest; the escaping is the part that must be unit-tested (05-D-08 / 06 house pattern) |
| Execute the spawn | `index.ts` orchestration | — | I/O boundary; already holds the sync-throw guards at `:2649` and `:3722` |
| Per-CLI PRV-05 capability verdict | `packages/shared/src` (data + pure predicate) | Backend tool-policy builder | D-04; one source for the tool policy and the user-facing sentence |
| `mcp add` / `mcp remove` payload | Pure module (extend `mcp-server-spec.ts`) | `index.ts` spawns it | `planMcpCliRegistration` already owns this decision shape |
| Stale-entry sweep | `index.ts` (startup, next to `sweepOrphanedMcpTempDirs`) | — | Needs process spawning; the *policy* (which scopes, which CLIs) can be pure |
| Stating the limitation | `getProviderStatuses` → `SettingsView.vue` provider card | README | D-08; 05-D-03 explicitly rejected diagnostics-only |

---

# Q1 — Do `gemini` and `codex` forward their own process environment to the stdio MCP server they spawn?

**Verdict: SPLIT. Gemini: YES (source-verified). Codex: NO (source-verified).**

This is D-05's "CLI half", and D-05 requires a citation per CLI. Both citations below are upstream
source files read this session via `gh api`, with the path and line range given.

## Gemini CLI — forwards the full parent environment, minus a name/value redaction pass

**[VERIFIED: google-gemini/gemini-cli `packages/core/src/tools/mcp-client.ts`, stdio branch of the
transport factory]** — file last touched commit `93844dfa10f6d71edc09be40dfde205edfbcc939`
(2026-06-18); latest release at time of research `v0.56.0` (2026-08-19).
<https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/mcp-client.ts>

Verbatim, from the `if (mcpServerConfig.command)` branch:

```ts
    const extensionEnv = getExtensionEnvironment(mcpServerConfig.extension);
    const expansionEnv = { ...process.env, ...extensionEnv };

    // 1. Sanitize the base process environment to prevent unintended leaks of system-wide secrets.
    const sanitizedEnv = sanitizeEnvironment(expansionEnv, {
      ...cliConfig.sanitizationConfig,
      enableEnvironmentVariableRedaction: true,
    });

    const finalEnv: Record<string, string> = {
      [GEMINI_CLI_IDENTIFICATION_ENV_VAR]:
        GEMINI_CLI_IDENTIFICATION_ENV_VAR_VALUE,
      ...extensionEnv,
    };
    for (const [key, value] of Object.entries(sanitizedEnv)) {
      if (value !== undefined) {
        finalEnv[key] = value;
      }
    }

    // Expand and merge explicit environment variables from the MCP configuration.
    if (mcpServerConfig.env) {
      for (const [key, value] of Object.entries(mcpServerConfig.env)) {
        finalEnv[key] = expandEnvVars(value, expansionEnv);
      }
    }

    const transport: Transport = new McpComplianceTransport(
      new StdioClientTransport({
        command: mcpServerConfig.command,
        args: mcpServerConfig.args || [],
        env: finalEnv,
        cwd: mcpServerConfig.cwd,
        stderr: 'pipe',
      }),
    );
```

`finalEnv` starts from **the gemini process's own `process.env`**, so any variable Drift injects into
the gemini child at `index.ts:3722` reaches the MCP server — *unless the sanitizer drops it*.
**Confidence: source-verified.**

### What the sanitizer drops — this is the part that decides the verdict

**[VERIFIED: google-gemini/gemini-cli `packages/core/src/services/environmentSanitization.ts`]** —
file last touched commit `d33170931c3be6384b10f68c7a151767ead055b1` (2026-03-26).
<https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/services/environmentSanitization.ts>

Redaction is **hard-on** at the MCP stdio site (`enableEnvironmentVariableRedaction: true` is a
literal in the call above, not a setting). The name-pattern deny list, verbatim:

```ts
export const NEVER_ALLOWED_NAME_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /KEY/i,
  /AUTH/i,
  /CREDENTIAL/i,
  /CREDS/i,
  /PRIVATE/i,
  /CERT/i,
] as const;
```

Applying that to Drift's nine `driftVars` (the keys are quoted verbatim from
`packages/backend/src/mcp-server-spec.ts:180-211`, `buildMcpDriftVars`):

| Drift key | Matches a deny pattern? | Survives inheritance into the MCP server? |
|---|---|---|
| `CAIDO_URL` | no | **yes** |
| `CAIDO_TOKEN` | **yes — `/TOKEN/i`** | **NO — redacted** |
| `DRIFT_CONTEXT_FILE` | no | **yes** |
| `DRIFT_ALLOWLIST_ACTIVE` | no | **yes** |
| `DRIFT_ALLOWED_TOOLS` | no | **yes** |
| `DRIFT_CONFIRMATION_REQUIRED_TOOLS` | no | **yes** |
| `DRIFT_CONFIRM_SENSITIVE_ACTIONS` | no | **yes** |
| `DRIFT_ACTIVITY_FILE` | no | **yes** ← D-02's target |
| `DRIFT_APPROVALS_FILE` | no | **yes** ← D-02's target |

**D-02 holds for Gemini.** `DRIFT_ACTIVITY_FILE` and `DRIFT_APPROVALS_FILE` reach the stdio MCP
server through inheritance, with no new Drift mechanism. **Confidence: source-verified** (the
implementation was read; it was not executed against a real gemini install).

**Consequence the planner must carry:** `CAIDO_TOKEN` is redacted out of the inherited block, so it
**must** be supplied through the registration `env` — which is applied *after* sanitization
(`finalEnv[key] = expandEnvVars(...)` runs last). This is not optional: without it the Gemini MCP
server starts with `CAIDO_TOKEN=""` and every tool fails. See Q2 for the two shapes that value can take.

### Two conditions that silently widen the redaction — flag both at the site

1. **Strict mode.** `const isStrictSanitization = !!processEnv['GITHUB_SHA'] || processEnv['SURFACE'] === 'Github';`
   In strict mode *everything* not in `ALWAYS_ALLOWED_ENVIRONMENT_VARIABLES` (a 25-name list that
   contains no `DRIFT_*`) is dropped — so the channel dies. Drift users are not in CI, but any
   Drift **CI test** that shells a real gemini would trip this. **Confidence: source-verified.**
2. **Upstream churn.** PR
   [google-gemini/gemini-cli#28863](https://github.com/google-gemini/gemini-cli/issues/28863)
   — *"fix(extensions): prompt for consent on environment changes and sanitize runtime-altering
   environment variables"* — is **open** as of 2026-08-20 and moves in the direction of *more*
   sanitization. D-05's caveat already covers this ("not that a specific installed CLI version on a
   specific machine did so"), but the flag's comment should name this PR so a future maintainer knows
   where to re-check. **Confidence: documented** (issue title and state read from the API; the diff
   was not read).

## Codex CLI — does NOT forward. `env_clear()` then an explicit whitelist.

**[VERIFIED: openai/codex `codex-rs/rmcp-client/src/utils.rs:16-59`, `create_env_for_mcp_server`]**
<https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/utils.rs>

```rust
pub(crate) fn create_env_for_mcp_server(
    extra_env: Option<HashMap<OsString, OsString>>,
    env_vars: &[McpServerEnvVar],
) -> Result<HashMap<OsString, OsString>> {
    let additional_env_vars = local_stdio_env_var_names(env_vars)?;
    let mut env: HashMap<OsString, OsString> = DEFAULT_ENV_VARS
        .iter()
        .copied()
        .chain(additional_env_vars)
        .filter_map(|var| env::var_os(var).map(|value| (OsString::from(var), value)))
        .collect();
```

and, in the launcher that consumes it,
**[VERIFIED: openai/codex `codex-rs/rmcp-client/src/stdio_server_launcher.rs:275-288`]**:

```rust
        let envs = create_env_for_mcp_server(env, &env_vars).map_err(io::Error::other)?;
        ...
            let mut command = Command::new(&resolved_program);
            ...
                .env_clear()
                .envs(&envs)
```

`.env_clear()` is explicit and unconditional. The only variables that reach the MCP server are:

1. `DEFAULT_ENV_VARS` — on Windows this is `codex_protocol::shell_environment::WINDOWS_CORE_ENV_VARS`
   (`PATH`, `PATHEXT`, `SHELL`, `COMSPEC`, `SYSTEMROOT`, …); on Unix the literal list
   `HOME, LOGNAME, PATH, SHELL, USER, __CF_USER_TEXT_ENCODING, LANG, LC_ALL, TERM, TMPDIR, TZ`
   (`codex-rs/rmcp-client/src/utils.rs:163-179`). **No `DRIFT_*`, no `CAIDO_*`.**
2. Names listed in the config's **`env_vars`** array — value taken from codex's own environment at
   spawn time.
3. Literal `env` key/values from the config (highest precedence).

**D-02 is FALSIFIED for Codex.** `DRIFT_ACTIVITY_FILE` and `DRIFT_APPROVALS_FILE` do **not** reach
the MCP server through inheritance. **Confidence: source-verified.**

### The one thing that *would* have rescued Codex, and why it does not

`env_vars` is exactly the shape D-03 needs — it carries **names, not values**, so it is set once at
registration and resolves per-spawn from codex's own environment. It would have satisfied D-02 and
D-03 simultaneously.

**But there is no CLI flag for it.** From
**[VERIFIED: openai/codex `codex-rs/cli/src/mcp_cmd.rs:116-133`, `AddMcpStdioArgs`]** the *entire*
stdio option surface of `codex mcp add` is:

```rust
pub struct AddMcpStdioArgs {
    /// Command to launch the MCP server.
    /// Use --url for a streamable HTTP server.
    #[arg(
            trailing_var_arg = true,
            num_args = 0..,
        )]
    pub command: Vec<String>,

    /// Environment variables to set when launching the server.
    /// Only valid with stdio servers.
    #[arg(
        long,
        value_parser = parse_env_pair,
        value_name = "KEY=VALUE",
    )]
    pub env: Vec<(String, String)>,
}
```

`--env` only. No `--env-var`, no `--env-vars`. And `run_add` (`mcp_cmd.rs:332-339`) *validates*
`CliConfigOverrides` but the source comment says they are "not currently applied", so
`codex mcp add -c mcp_servers.drift.env_vars=[...]` does not work either.
**Confidence: source-verified.**

The only remaining route to `env_vars` is for Drift to hand-edit `~/.codex/config.toml` — a new
cross-provider mechanism, in a TOML the CLI owns and rewrites (`ConfigEditsBuilder::replace_mcp_servers`,
`mcp_cmd.rs:507-511`), touching a file outside `%TEMP%`. That is a materially larger and riskier
change than PRV-05's budget, and it re-opens exactly the "stale token entry outside `%TEMP%`" hazard
D-02 rejected per-turn re-registration for.

### D-06 verdict per CLI

| CLI | Inheritance | D-04 capability flag | Sensitive tools |
|---|---|---|---|
| **Gemini** | **holds** (source-verified) | `true` | **enabled** — real approval/activity channel |
| **Codex** | **falsified** (source-verified) | `false` | **disabled** — D-06 fail-closed, limitation stated per D-08 |

This is *not* the inconclusive-evidence arm of D-06 — it is a positive negative result, which is
stronger. The D-08 sentence for Codex should say so ("Codex builds a clean environment for MCP
servers, so Drift cannot deliver approval prompts to it"), not the vaguer "could not be determined".

### Drift's half of D-05 — already true, and already testable

The premise (07-CONTEXT.md fact 2) checks out against current code:
`index.ts:3479` `const injectedDriftVars: Record<string, string> = runtimeFiles === undefined ? {} : runtimeEnv;`
merged at `:3722` through `buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars })`.
`buildSpawnEnv` is `platform.ts:612`, pure and already unit-tested. Drift's half needs a test that
asserts the two keys are present in the built block for a session with runtime files — extending
`mcp-server-spec.spawn.test.ts` is the cheapest home (it already imports the production builders and
runs on the `windows-latest` leg). **Confidence: measured** (read from the current tree this session).

---

# Q2 — Codex/Gemini `mcp add`: the real env-passing surface, and does `${VAR}` expansion exist?

**Verdict: both CLIs' surfaces established from source. `${VAR}` — Codex: NO expansion at all
(literal text passes through). Gemini: YES, and a missing variable resolves to the EMPTY STRING —
the exact silently-unauthenticated failure mode 05-D-10 rejected.**

## Codex

### CLI surface

**[VERIFIED: openai/codex `codex-rs/cli/src/mcp_cmd.rs:88-96, 116-133`]**
<https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs>

```rust
#[command(override_usage = "codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)")]
pub struct AddArgs {
    /// Name for the MCP server configuration.
    pub name: String,
    ...
```

- Flag is **`--env`** — long form only. **There is no `-e` short flag.** SC-3's "`-e`/`--env`" is
  correct for Gemini and **wrong for Codex**.
- Repeatable (`pub env: Vec<(String, String)>`), `KEY=VALUE`.
- Must appear **before the `--` separator**, because `command` is `trailing_var_arg = true`.
- Server name is validated: `!name.is_empty() && chars are ascii_alphanumeric | '-' | '_'`
  (`mcp_cmd.rs:1082-1092`). `drift` passes.

Value parsing is correct (unlike Gemini's — see below):

```rust
fn parse_env_pair(raw: &str) -> Result<(String, String), String> {
    let mut parts = raw.splitn(2, '=');
```

`splitn(2, '=')` — a value containing `=` survives intact. **Confidence: source-verified.**

### `${VAR}` expansion — does not exist

The value from `--env` lands in the config's `env` map and is handed to
`create_env_for_mcp_server` as `extra_env`, which does `env.insert(name, value)` verbatim
(`utils.rs:39-53`, quoted in Q1). There is no expansion pass anywhere on that path, and the official
docs do not mention one either
(<https://learn.chatgpt.com/docs/extend/mcp?surface=cli>, fetched 2026-08-21 — the
`developers.openai.com/codex/mcp` URL 308-redirects here).

**So `--env CAIDO_TOKEN='${CAIDO_TOKEN}'` for Codex would write the six literal characters
`${CAIDO_TOKEN}` into `config.toml` and hand them to the MCP server as the token.** That is not the
"unset reference left as text" hazard 05-D-10 described — it is worse: it happens *always*, not only
when unset. **`${CAIDO_TOKEN}` is definitively off the table for Codex.**
**Confidence: source-verified** (absence of an expansion call on the read path) **+ documented**
(docs silent).

### Where it persists, and the schema

`~/.codex/config.toml`, overridable by the `CODEX_HOME` env var
(**[VERIFIED: openai/codex `codex-rs/utils/home-dir/src/lib.rs:13-18`]**):

```rust
pub fn find_codex_home() -> std::io::Result<AbsolutePathBuf> {
    let codex_home_env = std::env::var("CODEX_HOME")
        .ok()
        .filter(|val| !val.is_empty());
    find_codex_home_from_env(codex_home_env.as_deref())
}
```

Because Drift's `spawnAndWait` passes no `env` option, `CODEX_HOME` is inherited from Caido's
process for both `mcp add` and `mcp remove` — so the two agree by construction. Good: no work needed.

`[mcp_servers.NAME]` stdio fields, per the official reference: `command` (required), `args`, `env`,
`env_vars`, `cwd`, `experimental_environment`, plus `startup_timeout_sec` (default 10s),
`tool_timeout_sec` (default 60s), `enabled`, `required`, `enabled_tools`, `disabled_tools`,
`default_tools_approval_mode`. **Confidence: documented**
(<https://learn.chatgpt.com/docs/extend/mcp?surface=cli>).

### Recommended Codex registration payload

Given Q1's fail-closed verdict, Codex still needs a *working read-only* MCP attachment (PRV-03/PRV-04
are separate from PRV-05). The payload:

```
codex mcp add drift \
  --env CAIDO_URL=<url> \
  --env CAIDO_TOKEN=<literal token> \
  --env DRIFT_CONTEXT_FILE=<path> \
  --env DRIFT_ALLOWLIST_ACTIVE=1 \
  --env DRIFT_ALLOWED_TOOLS=<non-sensitive subset only> \
  --env DRIFT_CONFIRMATION_REQUIRED_TOOLS= \
  --env DRIFT_CONFIRM_SENSITIVE_ACTIONS=0 \
  -- <node.exe> <mcpScriptPath>
```

- **Literal token** — the only shape that works (05-D-10 already blessed the literal for Claude's
  JSON; this is the same trade with a *worse* storage location, hence Q4's remove guarantee).
- **No `DRIFT_ACTIVITY_FILE` / `DRIFT_APPROVALS_FILE`** — D-03, and now doubly justified: they would
  be permanently-wrong values *and* the channel is dead anyway.
- **`DRIFT_ALLOWED_TOOLS` must exclude the sensitive group for Codex** — this is the concrete
  mechanism of D-06's fail-closed. `mcp-server.mjs:613` `getAvailableTools()` filters on
  `ALLOWED_TOOL_NAMES`, so an allowlist without the sensitive names means those tools are never even
  *offered* to Codex, which is a cleaner posture than offering them and refusing at call time.
  The sensitive set is quoted verbatim from `packages/backend/assets/mcp-server.mjs:604-609`:
  `set_environment`, `intercept_pause`, `intercept_resume`, `run_workflow` (`sensitive: true`).
- Drift already ships the fail-loud guard for the wrong shape: `findExpandableEnvKeys`
  (`mcp-server-spec.ts:254-262`) returns any key whose value contains `${`. **Run it on the Codex
  payload too**, not just the config-document path — it is the mechanical enforcement of the
  paragraph above.

### `DRIFT_TOKEN_FILE` — scoped, and recommended AGAINST for this phase

SC-3 names it as the fallback. It is not needed: Codex's `--env` carries a literal value correctly,
so there is no functional gap for `DRIFT_TOKEN_FILE` to fill. Its only benefit is keeping the token
out of `~/.codex/config.toml`.

Cost if the planner wants it anyway: `packages/backend/assets/mcp-server.mjs:13` currently reads
`const CAIDO_TOKEN = process.env.CAIDO_TOKEN || "";` — a **frozen-at-start** read, like the two
per-session paths (07-CONTEXT.md fact 3) and unlike `DRIFT_CONTEXT_FILE`'s per-call
`loadStoredContext` (`:174`). Teaching it a token file means: a new env key, a `readFileSync` with a
try/catch, a decision about frozen-vs-per-call re-read (per-call is what makes token *rotation* work
and is the only reason to prefer a file at all), and a matching write+lifetime+cleanup in `index.ts`.
That is a new cross-provider mechanism — precisely what 05-D-10 declined to build in the phase whose
job was deleting mechanisms, and the same argument applies here. **Recommend: defer; record in
Deferred Ideas as the natural companion to HRD-01 (v2).**

## Gemini

### CLI surface

**[VERIFIED: google-gemini/gemini-cli `packages/cli/src/commands/mcp/add.ts:140-180`]**
<https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/commands/mcp/add.ts>

```ts
export const addCommand: CommandModule = {
  command: 'add <name> <commandOrUrl> [args...]',
  ...
      .option('scope', {
        alias: 's',
        describe: 'Configuration scope (user or project)',
        type: 'string',
        default: 'project',
        choices: ['user', 'project'],
      })
      ...
      .option('env', {
        alias: 'e',
        describe: 'Set environment variables (e.g. -e KEY=value)',
        type: 'array',
        string: true,
        nargs: 1,
      })
```

- **`-e` / `--env`**, repeatable, `nargs: 1` — one `KEY=VALUE` per flag.
- `--scope` / `-s`, **default `project`** — see Q4, this is a defect in Drift's current invocation.
- `parserConfiguration({'unknown-options-as-args': true, 'populate--': true})` — so **flags must
  precede the positionals**; anything after `<name> <commandOrUrl>` is swallowed as a server arg.
  Drift's current `["mcp","add","drift","--",wrapperPath]` therefore becomes
  `["mcp","add","--scope","user","-e","K=V",...,"drift","--",nodePath,scriptPath]`.

**Confidence: source-verified.**

### DEFECT — gemini's `--env` parser truncates at the first `=`

Same file, in `addMcpServer`:

```ts
        env: env?.reduce(
          (acc, curr) => {
            const [key, value] = curr.split('=');
            if (key && value) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        ),
```

`curr.split('=')` with destructuring takes only the **second** element. Two consequences:

1. A value containing `=` is **silently truncated** — `"CAIDO_TOKEN=abc="` yields `["CAIDO_TOKEN","abc",""]`
   → `value = "abc"`. Half a token, no error.
2. An **empty** value (`"KEY="`) fails `if (key && value)` and the key is **dropped entirely**.
   This matters directly: Drift's `DRIFT_CONFIRMATION_REQUIRED_TOOLS` is `[].join(",")` = `""`
   whenever no tool requires confirmation (`mcp-server-spec.ts:203-204`). Passing it via `-e` is a
   no-op, which is harmless *here* (the `.mjs` defaults it to `""` anyway) but is exactly the kind of
   asymmetry that bites when a future key's empty value is meaningful.

Drift's current Caido token is `JSON.parse(localStorage.CAIDO_AUTHENTICATION).accessToken`
(`packages/frontend/src/stores/settings.ts:100-103`) — a JWT, base64url, which does not use `=`
padding. So truncation is a **latent** hazard rather than a live one today.
**Confidence: source-verified** for the parser; **unverified** for the assertion that no Caido build
ever emits an `=` in `accessToken` — do not state that as fact.

**Planner action:** this is a strong argument for the `${CAIDO_TOKEN}` shape on Gemini (below), which
sidesteps the parser entirely by never putting the token bytes on the command line.

### `${VAR}` expansion — YES, and a missing variable becomes `""`

**[VERIFIED: google-gemini/gemini-cli `packages/core/src/utils/envExpansion.ts`]**
<https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/envExpansion.ts>

```
 * Supports POSIX/Bash syntax ($VAR, ${VAR}).
 * Note: Windows syntax (%VAR%) is not natively supported by dotenv-expand.
 *
 * @param str - The string containing environment variable placeholders.
 * @param env - A record of environment variable names and their values.
 * @returns The string with environment variables expanded. Missing variables resolve to an empty string.
```

It is `dotenv-expand`, plus a Windows-only pre-pass `str.replace(/%(\w+)%/g, (_, name) => env[name] ?? '')`.

The expansion source is `expansionEnv`, **not** `sanitizedEnv` — re-reading the Q1 quote,
`finalEnv[key] = expandEnvVars(value, expansionEnv)` where
`const expansionEnv = { ...process.env, ...extensionEnv };`. So `${CAIDO_TOKEN}` in a gemini MCP
config **does** resolve, from gemini's *un*-sanitized parent environment — which is exactly the
environment Drift controls at `index.ts:3722`. **Confidence: source-verified.**

### The `${CAIDO_TOKEN}` decision for Gemini — a genuine trade, stated honestly

| | Literal token in `~/.gemini/settings.json` | `${CAIDO_TOKEN}` reference |
|---|---|---|
| Token bytes on disk outside `%TEMP%` | **yes**, until `mcp remove` | **no** |
| Survives the `split('=')` truncation defect | only because JWTs lack `=` | **yes** — no `=` in the value |
| Token rotation between MCP starts | stale until re-registered | **resolves fresh at every spawn** |
| Failure mode when the variable is absent | n/a | **`CAIDO_TOKEN=""` → silently unauthenticated** |
| 05-D-10 precedent | blessed (for Claude's JSON) | **explicitly rejected** |

**Recommendation: use `${CAIDO_TOKEN}` for Gemini, but only if the plan also lands the loud check** —
and note that 05-D-10's rejection was made when the expansion behaviour was *unconfirmed*; it is now
source-verified, which is new information, not a re-litigation. The silent-empty risk is real but
**bounded**: the variable's presence in the gemini child's environment is Drift's own
`injectedDriftVars`, gated on `runtimeFiles !== undefined`, and Drift can assert it. Concretely:
`buildSpawnEnv`'s output already contains `CAIDO_TOKEN` whenever MCP is attached, so a pure
predicate over the spawn block ("if the registration uses `${CAIDO_TOKEN}`, the spawn env MUST
contain a non-empty `CAIDO_TOKEN`") is unit-testable and fails loud at the spawn site rather than
inside gemini.

**If the planner prefers not to reopen 05-D-10 at all: use the literal token for Gemini too.** That
is a defensible, cheaper choice and is what SC-3 will accept — it just leaves a live token in
`~/.gemini/settings.json` between sessions, which raises Q4's remove guarantee from important to
load-bearing. Record whichever is chosen with its reason; do not leave it implicit.

### Where it persists

`Storage.getGlobalSettingsPath()` = `<homedir>/.gemini/settings.json` for `--scope user`;
`<cwd>/.gemini/settings.json` for `--scope project`
(**[VERIFIED: google-gemini/gemini-cli `packages/core/src/config/storage.ts:57-59, 78-80, 163, 293-295`]**).
`loadSettings(workspaceDir: string = process.cwd())` (`packages/cli/src/config/settings.ts:755-762`).

## Recommended Gemini registration payload

```
gemini mcp add --scope user \
  -e CAIDO_URL=<url> \
  -e CAIDO_TOKEN='${CAIDO_TOKEN}'   # or the literal — decide and record \
  -e DRIFT_CONTEXT_FILE=<path> \
  -e DRIFT_ALLOWLIST_ACTIVE=1 \
  -e DRIFT_ALLOWED_TOOLS=<full policy, sensitive included> \
  -e DRIFT_CONFIRMATION_REQUIRED_TOOLS=<...> \
  -e DRIFT_CONFIRM_SENSITIVE_ACTIONS=<0|1> \
  drift <node.exe> <mcpScriptPath>
```

**No `DRIFT_ACTIVITY_FILE` / `DRIFT_APPROVALS_FILE` (D-03)** — for Gemini they arrive by inheritance,
and passing them here would clobber the per-session value with a registration-time one. This is the
case D-03's warning ("we pass the env explicitly, so pass all of it") was written for; put the
comment at the site.

Note `gemini mcp add` takes `<commandOrUrl> [args...]` as **positionals**, so the `--` separator
Drift uses today is optional but harmless (`populate--` merges it into `args`).

---

# Q3 — `.cmd` spawn (PRV-02): the concrete incantation and its argument-quoting rules

**Verdict: SC-2's shape is necessary but NOT sufficient. The working incantation needs a fourth
element SC-2 does not name — `windowsVerbatimArguments: true` — plus explicit `^`-escaping that
Drift must perform itself.**

## Why the plain argv array is wrong

Two independent quoting layers stack, and SC-2's wording only accounts for zero of them:

1. **The runtime's layer.** Neither Node nor LLRT passes an argv *array* to Windows — Windows
   `CreateProcess` takes a single command-line **string**. Both runtimes therefore join and quote.
   Node/libuv applies the MSVC CRT convention; Rust's `std::process::Command` (which LLRT uses)
   applies the same convention via `append_arg`. Neither escapes cmd metacharacters, because neither
   knows the child is a shell.
2. **cmd.exe's layer.** `cmd.exe` re-parses `<string>` after `/c` with **different** rules: `&`, `|`,
   `<`, `>`, `(`, `)`, `^` are operators, and `%VAR%` is expanded — *including inside double quotes*.

So `spawn("cmd.exe", ["/d","/s","/c", "C:\\Users\\Jo & Co\\...\\claude.cmd", ...args])` produces a
command line where the runtime's quotes protect the path from *word splitting* but not from cmd's
operator scan and `%`-expansion in every position the runtime chose not to quote.

**[CITED: Microsoft Learn — `cmd`, "Remarks"]**
<https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd>
(doc `ms.date` 2025-05-23, updated 2025-10-22), verbatim:

> The ampersand `&`, pipe `|`, and parentheses `( )` are special characters that must be preceded by
> the escape character `^` or quotation marks when you pass them as arguments.

> You must use quotation marks around the following special characters: & < > [ ] | { } ^ = ; ! ' + , ` ~ [white space].

**Confidence: documented.**

## What `/d /s /c` each buy — and the `/s` contract, which is the load-bearing one

From the same page, verbatim:

| Switch | Microsoft's wording |
|---|---|
| `/c` | "Carries out the command specified by `<string>` and then exits the command processor." |
| `/s` | "When used with `/c` or `/k`, triggers special non-parsing rules that strip the first and last quotes (`"`) around the `<string>` but leaves the rest of the command unchanged." |
| `/d` | "Disables execution of AutoRun commands." |

And, verbatim, the rule `/s` exists to replace:

> If you specify `/c` or `/k`, the `cmd` processes, the remainder of `<string>`, and the quotation
> marks are preserved only if all of the following conditions are met:
> - You don't also use `/s`.
> - You use exactly one set of quotation marks.
> - You don't use any special characters within the quotation marks, for example: & < > ( ) @ ^ |.
> - You use one or more white-space characters within the quotation marks.
> - The `<string>` within quotation marks is the name of an executable file.
>
> If the previous conditions aren't met, `<string>` is processed by examining the first character to
> verify whether it's an opening quotation mark. If the first character is an opening quotation mark,
> it's stripped along with the closing quotation mark. Any text following the closing quotation marks
> is preserved.

**Read that carefully — it is why `/s` is mandatory, not stylistic.** Without `/s`, whether cmd strips
the outer quotes depends on a five-clause heuristic whose third clause ("no special characters") is
exactly what Drift *cannot* guarantee, since the paths come from `%TEMP%` under a username Drift does
not control. `/s` replaces the heuristic with an unconditional "strip the first and last quote,
leave the rest alone", which makes the contract deterministic: **wrap the whole command in one outer
quote pair, escape everything inside yourself.**

`/d` matters for a security-tooling audience specifically: without it, cmd executes
`HKCU\Software\Microsoft\Command Processor\AutoRun` before anything else. On a pentester's machine
that key is more likely than average to hold something. `/d` is a hardening flag, not a nicety.

**Confidence: documented** (all three from the Microsoft reference above).

## The vetted incantation

`cross-spawn` has shipped this for a decade at ~200M weekly downloads; its `parseNonShell` is the
reference implementation.

**[VERIFIED: moxystudio/node-cross-spawn `lib/parse.js`, `parseNonShell`]**
<https://github.com/moxystudio/node-cross-spawn/blob/master/lib/parse.js> (v7.0.6, MIT):

```js
        // Need to double escape meta chars if the command is a cmd-shim located in `node_modules/.bin/`
        // The cmd-shim simply calls execute the package bin file with NodeJS, proxying any argument
        // Because the escape of metachars with ^ gets interpreted when the cmd.exe is first called,
        // we need to double escape them
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);

        // Normalize posix paths into OS compatible paths (e.g.: foo/bar -> foo\bar)
        // This is necessary otherwise it will always fail with ENOENT in those cases
        parsed.command = path.normalize(parsed.command);

        // Escape command & arguments
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));

        const shellCommand = [parsed.command].concat(parsed.args).join(' ');

        parsed.args = ['/d', '/s', '/c', `"${shellCommand}"`];
        parsed.command = process.env.comspec || 'cmd.exe';
        parsed.options.windowsVerbatimArguments = true; // Tell node's spawn that the arguments are already escaped
```

**[VERIFIED: moxystudio/node-cross-spawn `lib/util/escape.js`]**
<https://github.com/moxystudio/node-cross-spawn/blob/master/lib/util/escape.js>:

```js
// See http://www.robvanderwoude.com/escapechars.php
const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;

function escapeCommand(arg) {
    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, '^$1');

    return arg;
}

function escapeArgument(arg, doubleEscapeMetaChars) {
    // Convert to string
    arg = `${arg}`;

    // Algorithm below is based on https://qntm.org/cmd
    // It's slightly altered to disable JS backtracking to avoid hanging on specially crafted input
    // Please see https://github.com/moxystudio/node-cross-spawn/pull/160 for more information

    // Sequence of backslashes followed by a double quote:
    // double up all the backslashes and escape the double quote
    arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

    // Sequence of backslashes followed by the end of the string
    // (which will become a double quote later):
    // double up all the backslashes
    arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1');

    // All other backslashes occur literally

    // Quote the whole thing:
    arg = `"${arg}"`;

    // Escape meta chars
    arg = arg.replace(metaCharsRegExp, '^$1');

    // Double escape meta chars if necessary
    if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, '^$1');
    }

    return arg;
}
```

**Confidence: source-verified.**

### The four rules, restated for Drift's actual arguments

1. **The whole command line goes inside ONE outer quote pair**, which `/s` strips. Everything inside
   is Drift's responsibility.
2. **Each argument**: double backslashes before a `"` and at end-of-string, escape embedded `"` as
   `\"`, wrap in `"…"`, **then prefix every character in `[()\][%!^"`<>&|;, *?]` with `^`**.
   Note the set includes `%` and a **space** — this is what protects
   `C:\Users\Jo & Co\AppData\Local\Temp\drift-mcp-…` and `C:\Program Files (x86)\…`, and what stops
   `%TEMP%`-shaped literal text from being re-expanded by cmd.
3. **The command (shim) path** gets `escapeCommand` — `^`-escaping only, *no* surrounding quotes.
   (Quoting it would defeat `/s`'s "first and last quote" rule, which applies to the whole string.)
4. **`windowsVerbatimArguments: true`** — without it the runtime re-quotes the already-escaped
   string and destroys it.

### Drift's specific arguments, checked against the set

| Argument | Risky characters present? | Handled by |
|---|---|---|
| `%TEMP%`-derived paths (`mcp-<chatId>.json`, per-session files) | space, `&`, `(`, `)`, `'`, `%` — via the username segment (PITFALLS § Pitfall 1) | rule 2's `^`-escape + outer quotes |
| Comma-joined allowlist `mcp__drift__search_history,…` | `,` **is in the metachar set** | rule 2 |
| The system prompt / user text | arbitrary — the highest-risk input | rule 2. Note it is passed as a discrete argv element today; keep it that way |
| Resolved shim path (`claude.cmd`) | space, `(`, `)` from `C:\Program Files (x86)\…` | rule 3 |

## The double-escape trap — cross-spawn's heuristic MISSES Drift's target

cross-spawn double-escapes only when
`isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i` matches. Drift's targets are
**globally** installed CLIs: `npm i -g @anthropic-ai/claude-code` puts `claude.cmd` in
`%APPDATA%\npm\`, **not** under `node_modules\.bin\`. cross-spawn would therefore single-escape it.

The reason the double escape exists is the cmd-shim's `%*` argument proxying — the shim's own line
ends `"%_prog%" <args> <target> %*`
(**[VERIFIED: npm/cmd-shim `lib/index.js:117-119`]**
<https://github.com/npm/cmd-shim/blob/main/lib/index.js>), and `%*` re-inserts the raw text for a
second parse. **Whether npm's *global* shims need the same double escape as its `node_modules/.bin`
shims is NOT established by this research** — the template is the same generator, which suggests yes,
but cross-spawn's own heuristic says no, and I did not find an authoritative statement resolving the
contradiction. **Confidence: unverified.**

**Planner action:** this is a concrete, cheap CI question. The `windows-latest` leg can write a
fixture `.cmd` shim that echoes `%*` back and assert the round-trip for an argument containing
`& ( ) space %` under both single and double escaping. That converts an unverified guess into a
measured fact in one test — and it is the *same* test Q5 needs anyway.

## Does Caido's runtime honour `windowsVerbatimArguments`? — YES, source-verified in the fork

This is the finding that makes the whole incantation viable under LLRT rather than only under Node.

**Type surface** — **[VERIFIED: `node_modules/.pnpm/@caido+quickjs-types@0.25.4/node_modules/@caido/quickjs-types/src/llrt/child_process.d.ts:244-254]**, read in this repo this session, verbatim:

```ts
  interface SpawnOptions extends ProcessEnvOptions {
    /**
     * Can be set to 'pipe', 'inherit', or 'ignore', or an array of these strings.
     * If passed as an array, the first element is used for `stdin`, the second for
     * `stdout`, and the third for `stderr`.
     *
     * @default 'pipe'
     */
    stdio?: StdioOptions | undefined;
    shell?: boolean | string | undefined;
    windowsVerbatimArguments?: boolean | undefined;
  }
```

`windowsVerbatimArguments` **is** declared. `windowsHide` is **not** — which corroborates the comment
Phase 6 left at `index.ts:1603-1608` and keeps UX-04 correctly in Phase 10.

**Runtime** — **[VERIFIED: caido/dependency-llrt `modules/llrt_child_process/src/lib.rs:396-400, 433-440`,
branch `caido` @ `a5b021c51d1521f32018d3f3f2e70291df50501d` (2026-04-22)]**
<https://github.com/caido/dependency-llrt/blob/caido/modules/llrt_child_process/src/lib.rs>

```rust
    let mut windows_verbatim_arguments = if let Some(opts) = &opts {
        opts.get_optional::<&str, bool>("windowsVerbatimArguments")?
            .unwrap_or_default()
    } else {
        false
    };
```

```rust
    let mut command = StdCommand::new(cmd.clone());
    if let Some(args) = &command_args {
        #[cfg(windows)]
        if windows_verbatim_arguments {
            command.raw_arg(args.join(" "));
        } else {
            command.args(args);
        }
```

`raw_arg(args.join(" "))` appends the joined argv **verbatim**, with no quoting — precisely what
cross-spawn's already-escaped `["/d","/s","/c","\"…\""]` needs. Identical in the `caido2` branch.
**Confidence: source-verified** (the Caido fork's own branch, not upstream). It was **not executed**
— the vehicle caveat below applies.

**Vehicle caveat, in 03-FINDINGS.md's voice:** this establishes that Caido's LLRT fork *declares* and
*implements* `windowsVerbatimArguments` in source, and that Node implements it too. It does **not**
establish that a Drift build running inside a real Windows Caido spawns a `.cmd` successfully. No
LLRT Windows binary was executed by this research, and none is obtainable (03-FINDINGS § Vehicle
caveat). Report PRV-02 as no more than that.

**CMP-01 note:** the `raw_arg` branch is `#[cfg(windows)]`-gated, and Node documents that
`windowsVerbatimArguments` "is ignored on Unix"
(<https://nodejs.org/api/child_process.html>). Setting it unconditionally is therefore a POSIX no-op —
but the *spawn plan* must still be platform-branched, because `cmd.exe` does not exist on POSIX
(PITFALLS § Pitfall 2's inverse regression).

**LLRT bonus finding, and a reinforcement of the `shell:true` ban:** the same file's
`prepare_shell_args` (`lib.rs:57-103`) shows that LLRT's `shell: true` on Windows already builds
`cmd.exe /d /s /c "<cmd> <args> "` and sets `windows_verbatim_arguments = true` — **with zero
escaping of the arguments**. So `shell: true` under Caido's runtime is *more* dangerous than under
Node, not less. PITFALLS § Pitfall 1's ban is correct and now has a second, runtime-specific reason.
**Confidence: source-verified.**

## Alternative: resolve the underlying `node.exe` entry beside the shim

**Trade-off, stated as asked.**

**For:** sidesteps cmd.exe parsing entirely — no escaping module, no second quoting layer, no
`%`-expansion hazard. Removes a process-tree level (`cmd.exe → claude.cmd → node → mcp-server.mjs`
becomes `node → …`), which is a direct gift to Phase 8's `taskkill /T /F` work and to Phase 10's
console-flash count. `node.exe` is exempt from the CVE-2024-27980 guard, so no EINVAL. Drift already
resolves a validated `node.exe` (`getNodeExecutable`, `index.ts:2732-2742`).

**Against:** it depends on the shim layout being stable, and it is **not**. Derivation would mean
parsing the `.cmd` text for the `"%dp0%\…"` target on npm's template
(**[VERIFIED: npm/cmd-shim `lib/index.js:109-119`]** — `SET "_prog=…"` then
`"%_prog%" <args> <target> %*`), and pnpm, yarn and bun all emit different shims; Volta and Claude's
native installer emit `.exe` (no JS entry to find at all). One parser per package manager, each
silently breaking on an upstream template change, for four different CLIs.

**Recommendation: cmd.exe primary; do NOT build shim-parsing this phase.** But add the cheap half of
the win: **prefer an already-resolved `.exe` and never route it through cmd.exe.**
`WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"]` (`platform.ts:387`, `.exe` first "because
Phase 6 (SC-2) requires preferring a real executable over a shim") already makes the resolver hand
back `.exe` when both exist, and Claude Code's *native* Windows installer places
`%USERPROFILE%\.local\bin\claude.exe` (**documented**:
<https://code.claude.com/docs/en/setup>). So the most common PRV-01 configuration never touches
cmd.exe at all. The `cmd.exe` branch is the compatibility path for npm-global installs, not the
primary one — say so in the plan, because it reframes PRV-01's risk.

## `cross-spawn` as a dependency — recommend AGAINST, port the algorithm instead

`cross-spawn@7.0.6`, MIT, 201.8M weekly downloads, repo `github.com/moxystudio/node-cross-spawn`,
no `postinstall`, not deprecated — legitimacy verdict **OK** (see § Package Legitimacy Audit).
It is not a supply-chain concern. The reasons to decline are architectural:

1. **It would not be used for its main job.** cross-spawn's value is `parse()` + `resolveCommand()` +
   shebang detection; Drift already owns resolution (Phase 6, `platform.ts` + `command-resolution.ts`)
   and 06-CONTEXT is explicit that PRV-02 "consumes whatever `resolveCommand` returns and must not
   re-derive extensions". Adopting cross-spawn re-derives all of it.
2. **It reaches for APIs the runtime may lack.** It requires `fs`, `path`, `which`, `isexe`,
   `shebang-command`. PITFALLS § Pitfall 8 and the technical-debt table are explicit: "Only after a
   CI smoke-test proves it runs in the runtime." That smoke test is a whole task, to buy ~45 lines.
3. **Its `node_modules/.bin` heuristic is wrong for Drift's targets** (see the double-escape trap
   above) — so it would need overriding anyway.
4. **The house pattern is a pure in-repo module.** Seven of them exist for exactly this reason
   (`index.ts` is un-importable under vitest). The escaping is *the* part that must be unit-tested.

**Recommendation:** create `packages/backend/src/spawn-plan.ts` exporting a pure
`buildSpawnPlan({ command, args, platform }) → { file, args, windowsVerbatimArguments }`, with
cross-spawn's `escape.js` algorithm ported verbatim and the MIT attribution + upstream URL in the
header comment. This is PITFALLS § Pitfall 1's own recommendation ("Add a unit-testable
`buildSpawnPlan(command, args, platform)` pure helper … so the escaping logic is covered by
`provider-launch`-style snapshot tests instead of living inline in `index.ts`").

## The EINVAL site inventory — CORRECTED

07-CONTEXT.md and PITFALLS § Pitfall 2 both name three sites. **Two are right; the third is
misidentified.** Verified against the current tree this session:

| # | Site | Line | Exposed? | Notes |
|---|---|---|---|---|
| 1 | Provider launch — `sendCliMessage`'s `spawnWithEnv(resolved, args, …)` | `index.ts:3722` | **YES** | Already has the sync-throw `try/catch` (05-D-04). PRV-02 makes it *succeed*. |
| 2 | `registerMcpWithCli` — `spawnAndWait(cliBinary, ["mcp","add",…])` and its pre-clean `["mcp","remove","drift"]` | `index.ts:2811`, `:2812` | **YES** | `cliBinary` is a resolved `gemini.cmd`/`codex.cmd` on Windows. |
| 2b | `unregisterMcpFromCli` — `spawnAndWait(storedPath, ["mcp","remove","drift"])` | `index.ts:2899` | **YES** | Same binary; a *separate* call site from 2. Both need the plan. |
| 3 | ~~"the provider `--version` probe inside `checkProvider`/`resolveCommand`"~~ | — | **DOES NOT EXIST** | `checkProvider` (`index.ts:1778-1799`) only calls `resolveCommand`; it runs **no** `--version` probe. |
| 3′ | **The real third site:** `getNodeExecutable`'s validation loop — `spawnAndWait(candidate, ["--version"])` | `index.ts:2737` | **YES** | Candidates include `.cmd`/`.bat` since Phase 6. This validates **node**, not the provider. |
| 4 | `resolveCommand`'s `where.exe` spawn | `index.ts:1630` | **no** | `where.exe` is an `.exe`. Has a sync-throw guard for NUL bytes / LLRT ENOENT, correctly for a different reason. |

Two corrections the planner must carry:

- **Site 3 is `getNodeExecutable`, not a provider version probe.** Its comment at `index.ts:2640-2645`
  already states the current behaviour honestly: a refused `.cmd` "resolves as exit code 1, which the
  node validation loop reads as 'not a working executable' and steps past — graceful degradation, not
  launchability." **Decide explicitly whether PRV-02 changes that.** Arguments: a `node.cmd` shim
  (nvm-windows emits one) currently gets skipped, so a user whose only node is a shim has no working
  node at all. Against: `node.exe` is almost always present beside it, and routing node itself through
  cmd.exe re-adds the tree level for *every* Drift MCP spawn. **Recommendation: leave site 3′ as
  graceful degradation, and say so in the plan** — but the planner must make that a decision, not an
  omission, because "a fix covering only the first leaves PRV-03 broken" is the warning and site 3′
  is where it is quietly *not* broken.
- **`registerMcpWithCli` has two spawns, not one** (`:2811` pre-clean + `:2812` add). A plan that
  converts only `:2812` leaves the pre-clean throwing EINVAL — and Q4 makes that pre-clean
  load-bearing.

---

# Q4 — Guaranteed `mcp remove` (SC-3), including stale and orphaned entries

**Verdict: both CLIs expose a parseable list surface AND make an unconditional `mcp remove`
idempotent and exit-0. The unconditional best-effort remove is therefore sufficient — but Drift's
current pre-clean does NOT satisfy the roadmap's stale-entry requirement, for two reasons neither
07-CONTEXT nor PITFALLS names.**

## Is an unconditional `mcp remove drift` safe and idempotent?

**Codex: yes, exit 0, source-verified.**
**[VERIFIED: openai/codex `codex-rs/cli/src/mcp_cmd.rs:490-518`, `run_remove`]**

```rust
    let removed = servers.remove(&name).is_some();

    if removed {
        ConfigEditsBuilder::new(&codex_home)
            .replace_mcp_servers(&servers)
            .apply()
            .await
            ...
    }

    if removed {
        println!("Removed global MCP server '{name}'.");
    } else {
        println!("No MCP server named '{name}' found.");
```

Absent entry → prints a message, returns `Ok(())`, **exit code 0**. It does not even rewrite the
config. Safe to run every startup.

**Gemini: yes, returns early, source-verified.**
**[VERIFIED: google-gemini/gemini-cli `packages/cli/src/commands/mcp/remove.ts:26-30`]**

```ts
  if (!mcpServers[name]) {
    debugLogger.log(`Server "${name}" not found in ${scope} settings.`);
    return;
  }
```

**Confidence: source-verified for both.** So no `mcp list`/`mcp get` parsing is required — which is
good, because parsing would add two more EINVAL-exposed spawns for no gain.

For completeness, both list surfaces do exist and are machine-readable if a future phase wants them:
`codex mcp list --json` and `codex mcp get <name> --json` (`mcp_cmd.rs:72-87`);
`gemini mcp list` (`packages/cli/src/commands/mcp/list.ts`). **Do not use them this phase.**

## DEFECT 1 — `gemini mcp add`/`remove` default to `--scope project`, and Drift passes no scope

This is the finding that most changes the plan, and it was not in any prior inventory.

Drift's current calls (`index.ts:2811-2814`, verbatim from the tree this session):

```ts
  await spawnAndWait(cliBinary, ["mcp", "remove", "drift"]);
  const result = await spawnAndWait(cliBinary, [
    "mcp", "add", "drift", "--", mcpScript,
  ]);
```

No `--scope`. Per Q2's quote of `add.ts`, `scope` defaults to `'project'`, which maps to
`SettingScope.Workspace` → `storage.getWorkspaceSettingsPath()` = **`<process.cwd()>/.gemini/settings.json`**
(`packages/core/src/config/storage.ts:163, 293-295`). `spawnAndWait` passes no `cwd` option, so the
cwd is whatever Caido's plugin-host process has.

Three consequences:

1. **The token lands in an arbitrary directory** — `<Caido's cwd>/.gemini/settings.json`. Not
   `~/.gemini`, and certainly not `%TEMP%`. PITFALLS § Pitfall 5's "outside `%TEMP%`, unswept" is
   *understated*: the location is not even predictable.
2. **`gemini mcp add` hard-fails when cwd is the home directory.** Verbatim, `add.ts:41-48`:

   ```ts
     const settings = loadSettings(process.cwd());
     const inHome = settings.workspace.path === settings.user.path;

     if (scope === 'project' && inHome) {
       debugLogger.error(
         'Error: Please use --scope user to edit settings in the home directory.',
       );
       process.exit(1);
     }
   ```
   If a Caido build launches with cwd = the user profile — plausible on Windows — registration exits
   1 and Drift reports "mcp add exited with code 1" with that error string. That is a *live,
   plausible* Windows failure mode for PRV-03 that has nothing to do with EINVAL.
3. **A registration made from one cwd is invisible to a gemini run from another.** Since Drift also
   spawns gemini with no `cwd`, the two agree today — but any future change to Drift's spawn cwd
   silently detaches the MCP server, with no error anywhere.

**Recommendation (high confidence, low cost): pass `--scope user` on both `mcp add` and
`mcp remove`.** It puts the entry in `~/.gemini/settings.json` — a stable, sweepable, documented
location — makes the `inHome` guard unreachable, and makes the registration cwd-independent.
Flags must precede the positionals (Q2), so:
`["mcp","add","--scope","user", ...envFlags, "drift", nodeExe, scriptPath]`.

## DEFECT 2 — the pre-clean does not run on the paths that matter

`registerMcpWithCli:2811`'s best-effort `mcp remove` is reached **only** from
`tryRegisterMcpForProviders` (`index.ts:2845-2884`), and only *after* four gates that each `continue`
past it:

1. `providerConfig === undefined` → skip
2. **`!providerConfig.enabled` → skip** ← a user who disabled Gemini after a crash never gets cleaned
3. `resolveCommand(...) === undefined` → skip ← a user who uninstalled/moved the CLI never gets cleaned
4. `planMcpCliRegistration(...).kind === "Skip"` → skip ← **today this is every Windows host**

So the roadmap's requirement — *"Phase 7 must also `mcp remove` any stale `drift` entry a Phase-≤5
Drift left pointing at a deleted `.sh`"* — is **not** satisfied by the existing pre-clean. The
Phase-≤5 stale entry exists precisely on POSIX machines where Gemini/Codex *were* registered against
`mcp-wrapper.sh`; if the user has since disabled the provider, gate 2 keeps the stale entry forever.

And `unregisterMcpFromCli` (`index.ts:2889-2903`) confirms the crash gap, verbatim:

```ts
  const storedPath = registeredMcpCliPaths.get(cli);
  if (storedPath === undefined) {
    // We never registered this CLI in this session — nothing to do.
    return;
  }
```

`registeredMcpCliPaths` is a module-level `Map` (`index.ts:2792`) — process-lifetime only. A crash,
a hard kill, or a Caido restart loses it, and the `drift` entry with a live token survives in
`~/.gemini` / `~/.codex`, where `sweepOrphanedMcpTempDirs` (`index.ts:2938-2958`, which iterates
`getSweepRoots(hostFacts)`) never looks. **Confidence: measured** (read from the current tree).

## Recommended design — a startup sweep, sibling to `sweepOrphanedMcpTempDirs`

Add an unconditional best-effort sweep at MCP start, **outside** all four gates:

```
for cli of ["gemini", "codex"]:
    resolved = resolveCommand(settings.providers[MCP_CLI_TO_PROVIDER[cli]]?.command)   # ignore `enabled`
    if resolved === undefined: record a skip reason; continue
    for scope of scopesFor(cli):        # gemini: ["user", "project"]; codex: [ — none — ]
        spawnAndWait(<spawn plan for resolved>, ["mcp", "remove", "drift", ...scopeFlag])
```

Design notes:

- **Deliberately ignores `enabled`** — same reasoning `unregisterMcpFromCli`'s own comment already
  gives ("if we previously registered, we clean up, even if the user disabled the provider
  afterwards"), extended across process lifetimes.
- **Gemini needs BOTH scopes.** A Phase-≤5 Drift wrote into *project* scope (no `--scope` passed);
  a Phase-7 Drift writes into *user* scope. Removing only `user` orphans every pre-upgrade entry.
  This is the concrete mechanism of the roadmap's stale-`.sh` requirement.
- **Codex needs no scope flag** — `run_remove` operates on the global `CODEX_HOME` config only.
- It runs next to `sweepOrphanedMcpTempDirs` in `startMcpServer`, so the "clean up other people's
  residue at startup" pattern has one home rather than two.
- **`cleanupMcpRuntime` (`index.ts:2906-2936`) keeps calling `unregisterMcpFromCli` for the current
  session** — this sweep is additive, not a replacement. Note for Phase 8: LIF-01 will need
  `killTree` *before* the temp-dir `rm` in that same function; leave the ordering seam marked.

## SC-3's "a failed remove is logged, not dropped" — concrete logging shape

PITFALLS § Pitfall 5 says "treat a failed `mcp remove` as a security event worth logging", and
05-D-11 bounds it to key names, never values. `formatSpawnDebugLine` (`mcp-server-spec.ts:228-243`)
is the existing precedent — "It takes key NAMES and has no parameter through which a value could
arrive — that is the design, not a discipline anyone has to remember."

**Recommendation: a pure `formatMcpRemoveFailure()` in `mcp-server-spec.ts` with the same
no-value-parameter property**, emitting to `sdk.console.error` (not `.log` — this is the security
event) and to `skippedMcpCliReasons`:

```
[drift] SECURITY: gemini mcp remove drift (scope=user) exited 1 — a Drift MCP entry carrying a
Caido session token may remain in the CLI's configuration. Remove it with:
  gemini mcp remove --scope user drift
```

Four properties, each deliberate:

1. **Names the CLI, the scope and the exit code** — all safe, all diagnostic.
2. **Carries no path and no stderr text.** `result.stderr` is currently interpolated straight into
   `skippedMcpCliReasons` at `index.ts:2825-2828`; a CLI that echoes its config back on error would
   put the token into a support bundle. Either drop stderr from the security line or route it through
   `redactDebugText`. **Flag this as an existing 05-D-11 near-miss the planner should decide on.**
3. **Gives the user the exact remediation command** — PITFALLS § UX ("Fail loud with errno + which
   step + remediation").
4. **Reaches the user, not just diagnostics.** Per D-08's fact 5, `skippedMcpCliReasons` currently
   reaches only `getDiagnostics` (`:4473`); D-08 already owns wiring it to `getProviderStatuses`, so
   this line rides that same wire for free — but only if it is written *into the map*, not only to
   the console. Say so in the plan.

Also worth stating in the README line D-08 already requires: after a Drift crash, a `drift` entry may
persist in `~/.gemini/settings.json` or `~/.codex/config.toml`, and the next Drift start removes it.

## Upstream Windows reliability — the honest PRV-04 / SC-5 status

Queried 2026-08-21 via the GitHub API. **Confidence: documented** (issue titles/states read; no
issue body was read, so do not paraphrase their content).

| Repo | Signal | Bearing |
|---|---|---|
| github/copilot-cli **#3576** — *"Windows: stdio MCP servers fail to spawn (spawn npx ENOENT / EINVAL) in 1.0.56-1"* — **OPEN**, updated 2026-07-28 | The direct mirror PITFALLS names. Still open. | Copilot's own MCP spawn may fail on Windows regardless of what Drift registers. Registering `node.exe` (not `npx`) is Drift's mitigation and is already the plan. |
| openai/codex — **10+ open** Windows MCP issues, e.g. #38754 *"Local stdio MCP servers are repeatedly spawned and not reaped within a single task"* (2026-08-21), #29079 *"leaves Node/MCP helper processes alive until memory pressure makes PC unresponsive"* (2026-08-19), #37402 *"MCP fleet kill/respawn cycles (taskkill /T /F storms …)"* (2026-08-20) | Codex-on-Windows MCP **process lifecycle** is actively broken upstream. | Reinforces "best-effort" for Codex on Windows — and is a **Phase 8 input**, since orphaned token-bearing MCP processes are LIF-01's exact subject. Not Phase 7's to fix. |
| google-gemini/gemini-cli | **No open Windows-MCP-specific issue found** by title or by `mcp windows state:open` search. Historical `spawn EINVAL` issues (#10147, #9755, #10450, #18408, #13604) are all **closed**. | The roadmap's "open GitHub issues for Windows MCP reliability are unresolved" for Gemini was **not reproduced** by this search. |

**Consequence for SC-5 — stated carefully.** A search finding nothing is weak evidence, not
absence of a problem: I searched issue **titles** and a two-term query, not bodies, and gemini-cli
carries a very large issue backlog. The correct read is **"the specific unresolved-issue premise
behind SC-5's gate was not confirmed"** — which is a reason to keep SC-5's real-machine checkpoint
(it is cheap and it is the only true Windows evidence available), not a reason to drop it. It does,
however, mean Gemini need not be pre-emptively degraded relative to Codex on *reliability* grounds —
and Q1 already gives Gemini the *better* PRV-05 outcome of the two.

---

# Q5 — PRV-01 evidence and UX-01

## PRV-01 CI vehicle — the proposed shape is right; three additions make it prove more

**The proposal validated:** a fixture `.cmd` shim placed on `PATH` in the `windows-latest` job, driven
through the **production** spawn builder, with 05-D-08's vehicle caveat. Confirmed as the correct
shape.

**Does a fixture `.cmd` on PATH reproduce the EINVAL condition faithfully?** Yes, with one precision.
03-FINDINGS § P1-CMD **measured** `spawn-threw-sync — spawn() threw synchronously with EINVAL` on
`windows-latest` (Windows Server 2025 / 10.0.26100, Node `v24.18.1` — far past the 18.20.2 guard
threshold). The trigger is the *file extension* of the spawn target, not its location or content, so
a fixture `.cmd` reproduces it exactly. Note the fixture does **not** need to be on `PATH` at all for
the EINVAL half — Drift always spawns a resolved absolute path (`resolveCommand`). Putting it on
`PATH` tests Phase 6's resolution, which is already done; the *spawn* test only needs the file.
**Confidence: measured** (Phase 3) for the EINVAL trigger; **measured** (this session) for the
resolver's absolute-path arm.

**Existing files to model on** — both already cross-platform via `os.tmpdir()`:
- `packages/backend/src/mcp-server-spec.spawn.test.ts` — 05-D-08's shared-production-builder shape;
  its header already states the caveat in the exact voice to reuse.
- `packages/backend/src/mcp-server.transport.test.ts` — the loopback-HTTP-stub + newline-drain +
  timeout-plus-SIGKILL skeleton the above was lifted from.

The Windows leg in `.github/workflows/ci.yml` (`runs-on: windows-latest`, line 81) runs `Typecheck`,
`Lint`, `Test`, `Build` — so a new vitest file lands on it with no workflow change.
**Confidence: measured** (read this session).

### Three additions

1. **Make the fixture `.cmd` an argument-echo, and assert the round trip.** A shim that does
   `@echo off` + `echo %*` (or writes each `%1..%9` to a file) turns the test from "the spawn did not
   throw" into "the arguments arrived byte-identical". Feed it Drift's actual hazard set in one
   argument: a path with a space, `&`, `(`, `)`, `'`, a literal `%TEMP%`, and a comma-joined
   allowlist. **This is the only way the escaping is actually verified**, and it simultaneously
   answers Q3's open double-escape question — the one unverified item in this research.
2. **Assert the negative.** A companion case spawning the same fixture *directly* must throw
   `EINVAL`. Without it, a green suite proves nothing about whether the `cmd.exe` branch was needed —
   this is Phase 3's runs-3-and-4 falsifiability discipline applied at unit scale, and it is what
   stops a future refactor silently reverting to the direct spawn on a machine where it happens to work.
3. **Gate the whole file on `process.platform === "win32"`** (`describe.skipIf`), so the POSIX legs
   stay byte-identical — CMP-01, and the same guard shape `platform.test.ts` conventions already use.

**Vehicle caveat, to be written verbatim into the plan and the phase report** (D-05's voice, adapted):

> This proves the **spawn plan**, the **escaping** and the **`cmd.exe` contract** on Windows under
> **Node** — not `index.ts`'s wiring of them (`index.ts` cannot be imported under vitest), not
> Caido's LLRT (`windowsVerbatimArguments` is source-verified in the fork, never executed), and not
> that a real Claude Code CLI connected to Drift on a real Windows desktop. PRV-01's end-to-end claim
> rests on the reporter confirmation, which SC-1 marks *where possible* and 07-CONTEXT.md places in
> Phase 9/10.

### The gap this vehicle cannot close, named plainly

Nothing in CI executes `sendCliMessage`. The path from `resolveCommand`'s answer → `buildSpawnPlan` →
`spawnWithEnv` at `index.ts:3722` is unexercised by construction. **Mitigation available at zero
extra cost:** make `buildSpawnPlan` the *only* way `index.ts` reaches `spawn` on the provider path,
and add a static gate to the phase's verification — `grep` asserting that no `spawnWithEnv(`/`spawn(`
call in `index.ts` passes a raw resolved command. That is the same class of two-sided static gate
Phase 5 used for the parent-env spread (REQUIREMENTS.md line ~282: "the **two-sided** parent-spread
gate … the only vehicle-independent control the phase has"). It is not a test, and the plan should
not call it one — but it is the strongest available substitute and the house already accepts it.

## UX-01 / SC-6 — the minimum honest interpretation

**Established this session, from the tree:**

- There is **no picker**. `SettingsView.vue:322-330` is a bare `InputText` bound to
  `providers[pid].command` with an `@change` handler and **zero validation** — confirmed by reading
  the file; nothing in `packages/frontend/src` validates the value. (07-CONTEXT fact 6, verified.)
- `resolveCommand`'s absolute-path arm (`index.ts:1543-1559`) accepts **any** absolute path that
  `fileExists`:
  ```ts
    if (isAbsolutePath({ value: command, platform: host?.platform })) {
      return await fileExists(command) ? command : undefined;
    }
  ```
  It performs **no extension check at all** — so `C:\Users\x\AppData\Roaming\npm\claude.cmd` and
  `C:\Users\x\.local\bin\claude.exe` both already resolve. 06-D-06's `isAbsolutePath` drive-letter
  arm is what makes that true pre-probe.
- `checkProvider` (`index.ts:1778-1799`) reports `available: true` + `resolvedPath` on that basis,
  and `SettingsView.vue:329-331` already renders `resolvedPath`. So a pinned `.cmd` **already shows
  as available today**.

**Therefore SC-6 requires almost nothing in the resolver — and that is the trap.** A user pinning
`claude.cmd` sees a green dot and the resolved path, then every turn fails with `spawn EINVAL`. The
picker "accepting" the path is already true and already misleading.

**Recommended minimum honest interpretation of UX-01 — three items, in priority order:**

1. **The substance: a pinned `.cmd` must LAUNCH.** UX-01 is satisfied by PRV-02, not by frontend
   work. If `buildSpawnPlan` routes `.cmd`/`.bat` through `cmd.exe`, the green dot becomes true.
   *This is the whole requirement.* State it that way in the plan so it is not mistaken for UI work.
2. **A test that proves it, in a pure module.** `buildSpawnPlan({ command: "C:\\Program Files (x86)\\npm\\claude.cmd", args: [...], platform: "win32" })`
   must return `{ file: "cmd.exe", args: ["/d","/s","/c", <escaped>], windowsVerbatimArguments: true }`,
   and the same call with `claude.exe` must return `{ file: <the exe>, args, windowsVerbatimArguments: false }`
   — a direct spawn, no cmd layer. Plus `platform: undefined` and `platform: "darwin"` returning the
   POSIX passthrough byte-identically (CMP-01). This is testable; `resolveCommand` is not.
3. **A field hint, and only a hint.** Add `placeholder` / helper text to the `InputText` — on Windows,
   something like *"e.g. `claude`, or a full path such as `C:\Users\you\.local\bin\claude.exe`"*.
   **Recommend AGAINST adding frontend validation**: the frontend has no filesystem access, cannot
   know the host platform reliably, and `checkProvider` already returns a precise per-case error
   (`"…" does not exist` for an absolute path vs `"…" not found in PATH or common install locations`,
   `index.ts:1788-1796`). A second, weaker validator in the UI would contradict the good one.
   This also keeps the phase's frontend surface to exactly what D-08 already opens — a placeholder
   attribute plus D-08's status sentence — rather than opening a new one.

**What SC-6 does NOT require:** a file-browser dialog, extension allow-listing in the UI, or widening
any existing validator (there is none to widen). If the roadmap's word "picker" is read literally, it
overstates what exists; the plan should say so once rather than build a picker to match the noun.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Escaping arguments for `cmd.exe` | A bespoke `quote()` you reason your way to | **Port cross-spawn's `escape.js` verbatim** (MIT, attribute it) | It encodes the backslash-before-quote doubling *and* the `^` metachar pass *and* the `/s` outer-quote contract. Every hand-rolled version misses one — usually `%` or the trailing-backslash case. |
| Merging the parent environment into a spawn | `{ ...process.env, ...vars }` | **`buildSpawnEnv`** (`platform.ts:612`) | Phase 4's single merge point, unit-tested; 03-FINDINGS § P0-ENV **measured** that the `env` option REPLACES the parent block on Windows (`PARENT-CLEARED`), and LLRT does `env_clear()` (source-verified, `lib.rs:473-474`). |
| Deciding whether to register a CLI | A fresh `if (platform === "win32")` in `index.ts` | **`planMcpCliRegistration`** (`mcp-server-spec.ts:183`) | Already owns the decision with `skippedMcpCliReasons`-shaped reasons and the fail-closed `undefined` arm D-06 follows. Its win32 arm is what PRV-03 replaces. |
| Detecting a `${VAR}` reference in an env payload | A new regex | **`findExpandableEnvKeys`** (`mcp-server-spec.ts:254`) | Ships already, is pure, and its comment records exactly why the shape is dangerous. Extend its *call sites* to the Gemini/Codex payloads; do not write a second one. |
| Deriving Windows executable extensions | A new list in the spawn module | **`WINDOWS_EXECUTABLE_EXTENSIONS`** (`platform.ts:387`) | 06-CONTEXT is explicit that PRV-02 "consumes whatever `resolveCommand` returns and must not re-derive extensions". The list's own comment already names Phase 7 as its consumer. |
| Retrying a write→exec against Defender | A new backoff loop | **`withFsRetry`** (`fs-retry.ts`) | Already wraps the `mcp-server.mjs` staging copy. |
| Logging what was spawned | Interpolating the env or stderr | **`formatSpawnDebugLine`** (`mcp-server-spec.ts:228`) | Has no parameter through which a value can arrive — 05-D-11 enforced structurally rather than by discipline. |

**Key insight:** every mechanism this phase needs already exists in a pure module except the cmd.exe
escaping. Phase 7 is one new pure module plus wiring — if the plan grows a second new module, that is
a signal to re-read this table.

## Common Pitfalls

### Pitfall A: fixing the provider spawn and leaving the registration spawns EINVAL
**What goes wrong:** `index.ts:3722` gets `buildSpawnPlan`; `:2811`, `:2812` and `:2899` do not.
Claude works; Gemini/Codex registration silently fails with exit 1 — which is PRV-03's entire point.
**How to avoid:** route *all four* through the plan (see Q3's corrected site table). **Warning sign:**
a diff that touches `sendCliMessage` but not `registerMcpWithCli`.

### Pitfall B: `windowsVerbatimArguments` omitted, so the runtime re-quotes the escaped string
**What goes wrong:** the `^` sequences get wrapped in another quote layer; cmd sees literal carets.
**Warning sign:** `'^' is not recognized as an internal or external command`, or arguments arriving
with visible `^` characters. **How to avoid:** the option is part of the plan object's return value,
not a call-site decision.

### Pitfall C: passing `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE` in the registration env
D-03. The instinct is "we pass env explicitly, so pass all of it". For Gemini it converts a **working**
inherited channel into a permanently-wrong one pointing at a file from a dead session.
**Warning sign:** a `--env DRIFT_ACTIVITY_FILE=` or `-e DRIFT_APPROVALS_FILE=` anywhere in the diff.
A `grep` gate for those two strings in the registration builder is cheap and exact.

### Pitfall D: removing only the `user` scope for Gemini
Q4 DEFECT 1. Pre-upgrade entries live in *project* scope. **Warning sign:** an upgrading user still
has a `drift` entry after Phase 7 ships.

### Pitfall E: reporting PRV-05 as more than D-05 licenses
The caveat is mandatory and verbatim. Gemini's channel is **source-verified**, not **measured** — no
gemini binary was executed by this research, and gemini-cli PR #28863 is open and moving toward more
sanitization.

### Pitfall F: the POSIX inverse regression
PITFALLS § Pitfall 2. `buildSpawnPlan` must return the POSIX passthrough **byte-identically** for
`platform !== "win32"`, `undefined` included, and `provider-launch.test.ts`'s `toEqual` argv
snapshots are the net. Assert the equality, do not assume it.

### Pitfall G: `result.stderr` interpolated into a user-visible reason string
`index.ts:2825-2828` does this today. A CLI that echoes its config on error puts the token into a
support bundle. 05-D-11 near-miss — decide explicitly (drop it, or route through `redactDebugText`).

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|---|---|---|---|
| `spawn("claude.cmd")` directly | Refused with `EINVAL` | Node ≥ 18.20.2 / 20.12.2 / 21.7.3 (CVE-2024-27980, 2024-04-10) | Mandatory `cmd.exe` branch — 03-FINDINGS § P1-CMD, **measured** |
| `claude` installed only via npm (`claude.cmd`) | Native installer → `%USERPROFILE%\.local\bin\claude.exe`, the method Anthropic "primarily tests and supports" | 2025→2026 | The most common PRV-01 configuration **never touches cmd.exe**. Reframes PRV-01's risk downward. **documented** (<https://code.claude.com/docs/en/setup>) |
| MCP stdio servers inherit the parent env | Both Gemini and Codex now filter it — Gemini by name/value redaction, Codex by `env_clear()` + whitelist | ongoing, tightening | D-02's split verdict; and the reason the flag needs a "re-check here" comment |

**Deprecated / not applicable:** `${CAIDO_TOKEN}` for **Codex** — no expansion exists, the literal
text would be delivered as the token.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `cmd.exe` (`%COMSPEC%`) | PRV-02 | ✓ on every Windows host | — | none needed; `cmd.exe` bare name if `%COMSPEC%` unset (cross-spawn's own fallback) |
| `node.exe` | PRV-03 registration payload | ✓ (Drift already resolves + validates it, `index.ts:2732-2742`) | ≥ 18 | `requireNodeExecutable` already errors loudly |
| `gemini` / `codex` CLI | PRV-03/04 | user-supplied | — | `skippedMcpCliReasons` (already wired to the reason map) |
| `windows-latest` runner | PRV-01 evidence | ✓ blocking leg in `ci.yml:81` since Phase 5 | Windows Server 2025 / 10.0.26100 | none |
| LLRT Windows binary | true-vehicle verification | ✗ | — | **No fallback.** 03-FINDINGS: upstream dropped the Windows target at `v0.6.0-beta`; `caido/dependency-llrt` publishes no releases. Source analysis + the Phase 9/10 reporter confirmation are the only substitutes. |
| `cross-spawn` npm package | (considered) | ✓ | 7.0.6 | **Not adopted** — algorithm ported instead (Q3) |

**Missing with no fallback:** the LLRT Windows vehicle. This is the standing residual risk of the
whole milestone, not something Phase 7 introduces or can close.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 4.0.18 |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `pnpm exec vitest run packages/backend/src/spawn-plan.test.ts` |
| Full suite command | `pnpm exec vitest run` |

**CORRECTED 2026-08-22 (during 07-05 planning/execution, against `.github/workflows/ci.yml`).** Both
rows originally named a `test` package script and a bare `vitest` passthrough. **This repository
defines no `test` script** — `package.json` carries `typecheck`, `lint`, `lint:fix`, `format`,
`build` and `dev` — so that invocation fails instead of running the suite. `pnpm exec vitest run` is what both CI legs invoke (`Test` step,
ubuntu matrix and `Verify (Windows)`). Later phases read this table; the correction is dated so a
reader can tell it from the original.

### Phase Requirements → Test Map
| Req | Behavior | Type | Command | Exists? |
|---|---|---|---|---|
| PRV-02 | `.cmd` → `cmd.exe /d /s /c "<escaped>"` + `windowsVerbatimArguments:true`; `.exe` → direct | unit | `pnpm vitest run packages/backend/src/spawn-plan.test.ts` | ❌ Wave 0 |
| PRV-02 / CMP-01 | POSIX + `undefined` platform return the passthrough byte-identically | unit | same file | ❌ Wave 0 |
| PRV-01 | A real fixture `.cmd` spawns and echoes hazard-set arguments back intact | integration (win32-gated) | `pnpm vitest run packages/backend/src/spawn-plan.win32.test.ts` | ❌ Wave 0 |
| PRV-01 | Direct spawn of the same fixture **throws EINVAL** (falsifiability) | integration (win32-gated) | same file | ❌ Wave 0 |
| PRV-03 | Registration argv for gemini/codex: correct flags, `--scope user`, no `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE`, no `${` for codex | unit | `pnpm vitest run packages/backend/src/mcp-server-spec.test.ts` | ⚠️ extend |
| PRV-05 | `runtimeEnv` (incl. both per-session paths) reaches the built spawn env | unit | `pnpm vitest run packages/backend/src/mcp-server-spec.spawn.test.ts` | ⚠️ extend |
| PRV-05 / D-04 | The capability predicate returns enabled for gemini, disabled for codex, and **fails closed on an unknown provider** | unit | `pnpm vitest run packages/shared/...` | ❌ Wave 0 |
| UX-01 | An absolute `.cmd` and an absolute `.exe` each produce the right plan | unit | `spawn-plan.test.ts` | ❌ Wave 0 |
| SC-7 | The four symbols are gone; `.sh` count 0; notice count 3→0 | static gate | `grep -c` per the roadmap checklist | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run packages/backend/src/spawn-plan.test.ts` + `pnpm typecheck`
- **Per wave merge:** `pnpm exec vitest run` + `pnpm lint` (corrected 2026-08-22 — see the
  test-framework table above; the `test` script this line used to name does not exist here)
- **Phase gate:** full suite green on **both** the ubuntu matrix and the `windows-latest` leg before
  `/gsd-verify-work`. The Windows leg is where PRV-01's only real evidence lives.

### Wave 0 Gaps
- [ ] `packages/backend/src/spawn-plan.ts` + `spawn-plan.test.ts` — PRV-02, UX-01
- [ ] `packages/backend/src/spawn-plan.win32.test.ts` + a fixture `.cmd` echo shim — PRV-01
- [ ] The D-04 capability flag + predicate in `packages/shared/src` and its test — PRV-05
- [ ] Extensions to `mcp-server-spec.test.ts` (registration argv) and `mcp-server-spec.spawn.test.ts`
      (per-session env reach) — PRV-03, PRV-05
- [ ] No framework install needed; no `conftest`-equivalent needed (vitest, no shared fixture module)

## Security Domain

### Applicable ASVS categories

| Category | Applies | Standard control here |
|---|---|---|
| V5 Input Validation | **yes** | Every argument reaching `cmd.exe` is escaped by the ported cross-spawn algorithm; `shell:true` banned with dynamic args (CVE-2024-27980 class) |
| V6 Cryptography | no | No crypto introduced. The `Math.random` UUID debt stays out of scope (03-FINDINGS P3-UUID: keep the hex loop) |
| V2/V3 Auth/Session | indirect | The Caido session token is the credential; hygiene is PRV-03's `mcp remove` guarantee |
| V4 Access Control | **yes** | D-06's fail-closed allowlist — Codex's `DRIFT_ALLOWED_TOOLS` excludes the sensitive group |
| V7 Error/Logging | **yes** | 05-D-11: key names never values; `formatSpawnDebugLine`'s no-value-parameter design; the Pitfall G stderr near-miss |

### Threat patterns for this stack

| Pattern | STRIDE | Mitigation |
|---|---|---|
| Command injection via `shell:true` + interpolated `%TEMP%` path | Elevation of Privilege | Argv arrays, `windowsVerbatimArguments` + explicit escaping, `shell:true` banned. Reinforced: LLRT's own `shell:true` does zero escaping (Q3) |
| AutoRun hijack on `cmd.exe` invocation | Elevation of Privilege | **`/d`** — disables `HKCU\…\Command Processor\AutoRun`. Non-optional for a pentester audience |
| Token persisting in `~/.gemini` / `~/.codex` after a crash | Information Disclosure | Q4's unconditional dual-scope startup sweep + the SC-3 security log line |
| Token bytes on the `mcp add` **command line** (visible to any process listing argv) | Information Disclosure | An argument for `${CAIDO_TOKEN}` on Gemini (Q2) — it keeps the token off the command line entirely. Not available for Codex. **Worth weighing; not previously raised** |
| Token echoed back through a CLI's stderr into `skippedMcpCliReasons` | Information Disclosure | Pitfall G — drop or redact `result.stderr` |
| Silently unauthenticated MCP server from an unexpanded/empty `${VAR}` | Spoofing / Tampering | `findExpandableEnvKeys` fail-loud; **hard rule: never `${…}` for Codex** |

## Package Legitimacy Audit

Phase 7 as recommended installs **no new packages**. `cross-spawn` was evaluated and **declined on
architectural grounds** (Q3), with its escaping algorithm ported under MIT attribution instead. The
audit is recorded because the evaluation happened.

| Package | Registry | Age | Downloads | Source repo | Verdict | Disposition |
|---|---|---|---|---|---|---|
| `cross-spawn` | npm | 7.0.6 published 2024-11-18 | 201,756,959/wk | github.com/moxystudio/node-cross-spawn | **OK** (no postinstall, not deprecated) | **NOT ADOPTED** — algorithm ported, MIT attributed |

**Removed due to [SLOP]:** none. **Flagged [SUS]:** none.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | npm **global** cmd-shims need the same double `^`-escape as `node_modules/.bin` shims (cross-spawn's regex says no; the shim template suggests yes) | Q3 | Under- or over-escaped arguments on the npm-global Claude/Gemini/Codex path. **Cheap to close: the Q5 echo-shim test answers it.** Do not ship a guess — measure it. |
| A2 | Caido's LLRT ships compiled for a Windows target with the `#[cfg(windows)]` `raw_arg` branch active | Q3 | `windowsVerbatimArguments` silently ignored → escaping destroyed. Only a real Windows Caido closes this (Phase 9/10). |
| A3 | Caido `accessToken` values never contain `=` | Q2 | Gemini's `split('=')` truncates the token → silently unauthenticated. Mitigated entirely by choosing `${CAIDO_TOKEN}` for Gemini. |
| A4 | Caido's plugin-host cwd on Windows is not the user's home directory | Q4 | `gemini mcp add` exits 1 with "Please use --scope user". **Mitigated entirely by passing `--scope user`** — which is the recommendation, so this assumption need never be load-bearing. |
| A5 | No open gemini-cli Windows-MCP issue exists (title/query search only; bodies not read) | Q4 | SC-5's premise is weaker than the roadmap assumes. Recommendation already keeps the checkpoint, so low risk. |

## Open Questions — ALL THREE RESOLVED (2026-08-22)

> **Status: RESOLVED.** Each question below was answered during Phase 7 execution. The original
> reasoning is left intact — it is why the question was open, and it is still worth reading — with
> the resolution added above each one. Do not reopen these without new evidence.

1. **Does an npm-global `.cmd` shim need single or double `^`-escaping?** (A1)

   > **RESOLVED — 07-01 task 3, measured on `windows-latest`, and the measurement FALSIFIED the
   > prediction.** Both depths round-trip the full hazard set byte-identically
   > ([run 32563348727](https://github.com/six2dez/drift/actions/runs/32563348727) is the red run
   > that proved it; [32563543158](https://github.com/six2dez/drift/actions/runs/32563543158) is the
   > reshaped green one). Escaping *depth* is not the discriminator; escaping *itself* is. The module
   > keeps upstream's single-escape heuristic and a NEW falsifiability leg — the same shim with the
   > caret pass removed — replaced the false assertion. Recorded with both run URLs in the
   > `packages/backend/src/spawn-plan.ts` module header and in 07-01-SUMMARY.md § *The measurement*.
   - Known: cross-spawn double-escapes only for `node_modules/.bin/*.cmd`; the reason (`%*` re-parse)
     applies to the same generator's global output.
   - Unclear: whether the second cmd parse actually occurs for the global template.
   - **Recommendation:** answer it in CI with the Q5 echo shim before choosing. One test, both answers.

2. **`${CAIDO_TOKEN}` or the literal token for Gemini?**

   > **RESOLVED — 07-01/07-03's recorded decisions, and split per CLI.** Gemini takes the
   > **`${CAIDO_TOKEN}` reference** *plus* the assertion this recommendation asks for: registration
   > is REFUSED when the reference is used and Drift's own spawn environment carries no non-empty
   > token, asserted in both directions. Codex takes the **literal** token — not by preference but
   > because Codex performs no expansion anywhere on its read path, so a reference would become the
   > token. That choice was a `checkpoint:decision` answered by the user (`literal-plus-guarantees`)
   > and it **deviates knowingly from ROADMAP SC-3**, which authorises only a `${VAR}` reference or a
   > token-file indirection; the user was offered an SC-3 amendment and declined it, so the roadmap
   > text stands and the deviation is recorded rather than edited away. See 07-03-SUMMARY.md
   > § *The checkpoint, and the roadmap deviation it creates*, and the `MCP_CLI_EXPANDS_ENV_REFERENCES`
   > table in `packages/backend/src/mcp-server-spec.ts`.
   - Known: expansion works, resolves from the *un*sanitized parent env, and a missing variable
     becomes `""` (all source-verified). Literal works but rides a `split('=')` parser and persists.
   - Unclear: whether reopening 05-D-10 is wanted here. 05-D-10 was decided when the behaviour was
     unconfirmed; it now is.
   - **Recommendation:** `${CAIDO_TOKEN}` **plus** a pure assertion that the spawn env carries a
     non-empty `CAIDO_TOKEN` whenever the registration uses the reference. If the planner prefers not
     to reopen it, the literal is defensible — record which, and why.

3. **Does site 3′ (`getNodeExecutable`'s `--version` loop) get the cmd.exe plan?**

   > **RESOLVED — NO, and it is written down as a decision (OQ-3).** `buildSpawnPlan` is applied at
   > CALL SITES, never inside `spawnAndWait`; putting it inside would silently capture this candidate
   > loop and the `where.exe` path search, adding a process-tree level to every Drift spawn — a
   > direct cost to Phase 8's `taskkill /T /F` and Phase 10's console-flash count. Decided in
   > 07-01's recorded decisions and transcribed as a comment at all three affected sites by 07-04
   > task 3 (`packages/backend/src/index.ts`: the shared spawn helper, the node-validation candidate
   > loop, the path-search spawn). The loop keeps degrading gracefully, deliberately.
   - Known: it currently degrades gracefully (a `.cmd` node candidate scores exit 1 and is skipped).
   - Unclear: whether any real user has *only* a `node.cmd`.
   - **Recommendation:** leave it degrading, and write that down as a decision. It keeps every Drift
     MCP spawn one tree level shallower, which Phase 8 will thank us for.

## Sources

### Primary — upstream source read this session (HIGH)
- google-gemini/gemini-cli `packages/core/src/tools/mcp-client.ts` (stdio transport env construction) — commit `93844dfa10f6d71edc09be40dfde205edfbcc939`, 2026-06-18 — <https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/mcp-client.ts>
- google-gemini/gemini-cli `packages/core/src/services/environmentSanitization.ts` — commit `d33170931c3be6384b10f68c7a151767ead055b1`, 2026-03-26
- google-gemini/gemini-cli `packages/core/src/utils/envExpansion.ts`, `packages/core/src/config/storage.ts`, `packages/cli/src/config/settings.ts`, `packages/cli/src/commands/mcp/{add,remove,list}.ts`
- openai/codex `codex-rs/rmcp-client/src/utils.rs`, `codex-rs/rmcp-client/src/stdio_server_launcher.rs`, `codex-rs/protocol/src/shell_environment.rs`, `codex-rs/cli/src/mcp_cmd.rs`, `codex-rs/utils/home-dir/src/lib.rs` — <https://github.com/openai/codex>
- caido/dependency-llrt `modules/llrt_child_process/src/lib.rs`, branch `caido` @ `a5b021c51d1521f32018d3f3f2e70291df50501d`, 2026-04-22 — <https://github.com/caido/dependency-llrt/blob/caido/modules/llrt_child_process/src/lib.rs>
- moxystudio/node-cross-spawn `lib/parse.js`, `lib/util/escape.js` (v7.0.6, MIT) — <https://github.com/moxystudio/node-cross-spawn>
- npm/cmd-shim `lib/index.js` — <https://github.com/npm/cmd-shim/blob/main/lib/index.js>
- `@caido/quickjs-types@0.25.4` `src/llrt/child_process.d.ts` — read from this repo's `node_modules`

### Primary — official documentation (HIGH/MEDIUM)
- Microsoft Learn — `cmd` (`/c`, `/s`, `/d`, quote-processing rules), doc updated 2025-10-22 — <https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd>
- Node.js — Child process (`windowsVerbatimArguments`, `.bat`/`.cmd` handling) — <https://nodejs.org/api/child_process.html>
- OpenAI Codex — MCP CLI and configuration reference — <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
- Claude Code — Advanced setup / native installer — <https://code.claude.com/docs/en/setup>

### Secondary — issue trackers, titles+state only (MEDIUM)
- github/copilot-cli **#3576** (OPEN, 2026-07-28) — <https://github.com/github/copilot-cli/issues/3576>
- openai/codex Windows MCP lifecycle issues: #38754, #37402, #37453, #29079, #33946, #38825, #21761
- google-gemini/gemini-cli **#28863** (OPEN) — env sanitization tightening; **#5828** (CLOSED 2025-12-03)

### In-repo ground truth (HIGH — read this session)
`packages/backend/src/index.ts` (`:1543` `resolveCommand`, `:1630`, `:1778` `checkProvider`, `:2062` `SpawnWithEnv`, `:2592` `spawnAndWait`, `:2737`, `:2792`, `:2803` `registerMcpWithCli`, `:2845` `tryRegisterMcpForProviders`, `:2889` `unregisterMcpFromCli`, `:2906` `cleanupMcpRuntime`, `:2938` `sweepOrphanedMcpTempDirs`, `:3479`, `:3722`) · `mcp-server-spec.ts` (`:180` `buildMcpDriftVars`, `:183` `planMcpCliRegistration`, `:228` `formatSpawnDebugLine`, `:254` `findExpandableEnvKeys`) · `platform.ts` (`:255` `getWhichCommand`, `:387` `WINDOWS_EXECUTABLE_EXTENSIONS`, `:612` `buildSpawnEnv`) · `assets/mcp-server.mjs` (`:12-38`, `:79`, `:88`, `:174`, `:604-609`, `:613`, `:623`) · `packages/frontend/src/views/SettingsView.vue:300-336` · `packages/frontend/src/stores/settings.ts:92-113` · `.github/workflows/ci.yml:72-220` · `.planning/phases/03-…/03-FINDINGS.md` · `.planning/research/PITFALLS.md`

## Metadata

**Confidence breakdown:**
- Q1 (env forwarding): **HIGH** — both CLIs' implementations read, cited to file+line+commit
- Q2 (registration surfaces): **HIGH** — flag structs and parsers read verbatim
- Q3 (cmd.exe): **HIGH** for the incantation and the LLRT option handling (source-verified in Caido's
  own fork branch); **LOW** for the global-shim double-escape question (A1, explicitly open)
- Q4 (`mcp remove`): **HIGH** — both `run_remove` implementations read; the `--scope` defect and the
  four-gate pre-clean gap verified against the current tree
- Q5 (PRV-01 / UX-01): **HIGH** — resolved entirely against this repo's own code and Phase 3's
  measured EINVAL result

**Research date:** 2026-08-21
**Valid until:** 2026-09-20 for the Drift-internal findings; **2026-09-04** for the external-CLI
findings — gemini-cli and codex both ship weekly and both have open PRs touching MCP env handling.
Re-verify Q1 and Q2 against the citations above before shipping if the phase slips past that.

---

## RESEARCH COMPLETE

**Phase:** 7 — Provider Spawn & Registration
**Confidence:** HIGH (one explicit open item: A1, closeable in CI)

### Key findings
- **PRV-05 splits per CLI.** Gemini forwards its (redaction-filtered) parent env to stdio MCP servers → D-02 holds, real channel, sensitive tools on. Codex calls `.env_clear()` and rebuilds from a whitelist, and **no `codex mcp add` flag can set `env_vars`** → D-02 falsified, D-06 fail-closed. Both source-verified.
- **SC-2's spawn shape is incomplete.** `cmd.exe /d /s /c` argv alone does not work; it needs `windowsVerbatimArguments: true` + explicit `^`-escaping. Caido's LLRT fork honours that option (`raw_arg`, source-verified, branch `caido`), and `@caido/quickjs-types` declares it.
- **`${CAIDO_TOKEN}`: no expansion whatsoever in Codex** (literal text delivered as the token — hard rule: never). **Gemini expands it** from its un-sanitized parent env, with a missing variable resolving to `""`.
- **Two undiscovered defects in Drift's existing registration:** `gemini mcp add`/`remove` default to `--scope project` (arbitrary cwd; hard `exit 1` when cwd is `$HOME`), and gemini's `-e` parser truncates values at the first `=`.
- **The EINVAL site list is corrected:** the third site is `getNodeExecutable`'s `--version` loop (`index.ts:2737`), not a provider version probe (`checkProvider` runs none), and `registerMcpWithCli` has **two** spawns, not one.
- **UX-01 is already satisfied in the resolver and is therefore misleading today** — a pinned `.cmd` shows green then fails at spawn. SC-6's real content is PRV-02.

### File created
`/Users/six2dez/Tools/drift/.planning/phases/07-provider-spawn-registration/07-RESEARCH.md`

### Confidence assessment
| Area | Level | Reason |
|---|---|---|
| Standard stack | HIGH | No new packages; `cross-spawn` evaluated (OK) and declined with reasons |
| Architecture (spawn plan + pure module) | HIGH | Follows the seven-module house pattern; PITFALLS names the same helper |
| CLI env semantics | HIGH | Upstream source read, cited to file/line/commit — 06-D-12 satisfied |
| cmd.exe escaping | HIGH / LOW split | Algorithm vetted; global-shim double-escape open (A1) |
| Pitfalls | HIGH | Grounded in Drift's current tree plus Phase 3's measured results |

### Open questions
A1 (global-shim double escape — closeable by the Q5 echo-shim CI test) · `${CAIDO_TOKEN}` vs literal for Gemini (a real trade, both defensible, recommendation given) · whether site 3′ gets the cmd.exe plan (recommend: no, but decide explicitly).

### Ready for planning
Research complete. The planner should note that D-01's per-CLI landing zone is **exercised** — Gemini and Codex reach different verdicts — and that Q3/Q4 add work to PRV-02 and PRV-03 that the roadmap's 3-plan provisional count may not have anticipated.




