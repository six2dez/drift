# External Integrations

**Analysis Date:** 2026-06-26

## AI CLI Providers (Spawned External Processes)

Drift spawns local AI CLIs as child processes via `child_process.spawn` from `packages/backend/src/index.ts`. The CLI processes are tracked in the `activeProcesses` Map (sessionId → ChildProcess). All CLIs receive input via stdin and stream output on stdout/stderr.

**Supported providers** (defined in `packages/shared/src/cli-providers.ts`):

### Claude Code (`claude-cli`)
- **Default command:** `claude`
- **Invocation:** `spawn(resolved, buildClaudeLaunchArgs(input))` where args are built in `packages/backend/src/provider-launch.ts`
- **Key CLI flags:**
  - `-p` — print mode (non-interactive)
  - `--verbose`
  - `--output-format stream-json` — streaming JSON output parsed by `packages/backend/src/claude-print.ts`
  - `--disable-slash-commands`
  - `--append-system-prompt <text>` — injects Drift session instructions
  - `--disallowedTools Bash,Edit,Glob,Grep,MultiEdit,NotebookEdit,Read,Skill,Task,TodoWrite,ToolSearch,WebFetch,WebSearch,Write` — removes Claude's file-system tools
  - `--allowedTools mcp__drift__<name>,...` — restricts to Drift MCP tools matching the user's permission policy
  - `--resume <sessionId>` — session resumption (optional)
  - `--strict-mcp-config --mcp-config <path>` — points Claude at the per-chat MCP config JSON (optional, only when MCP is running)
- **MCP wiring:** A per-session shell wrapper (`mcp-wrapper-<sessionId>.sh`) and per-chat JSON config (`mcp-<chatId>.json`) are written to `mcpTempDir` before each spawn. The JSON config contains `{"mcpServers":{"drift":{"command":"<wrapperPath>"}}}`.
- **Output parsing:** Claude's `stream-json` format is consumed by `consumeClaudePrintChunk` / `finalizeClaudePrintOutput` in `packages/backend/src/claude-print.ts`

### Gemini CLI (`gemini-cli`)
- **Default command:** `gemini`
- **Invocation:** args from `buildGeminiLaunchArgs` in `packages/backend/src/provider-launch.ts`
- **Key CLI flags:**
  - `--output-format text`
  - `--allowed-mcp-server-names drift` — added only when MCP is running
  - `-p .` — prompt from stdin
- **MCP wiring:** Registration via `gemini mcp add drift -- <wrapperPath>` (run once at MCP start); cleanup via `gemini mcp remove drift`. Tracked in `registeredMcpCliPaths` Map.
- **Output:** Plain text streamed on stdout

### Codex CLI (`codex-cli`)
- **Default command:** `codex`
- **Invocation:** args from `buildCodexLaunchArgs` in `packages/backend/src/provider-launch.ts`
- **Key CLI flags:** `exec --color never -`
- **MCP wiring:** Registration via `codex mcp add drift -- <wrapperPath>` (same mechanism as Gemini)
- **Output:** Plain text streamed on stdout

### GitHub Copilot CLI (`copilot-cli`)
- **Default command:** `copilot`
- **Invocation:** args from `buildCopilotLaunchArgs` in `packages/backend/src/provider-launch.ts`
- **Key CLI flags:**
  - `-p --quiet`
  - `--additional-mcp-config @<configPath>` — JSON file containing `{"mcpServers":{"drift":{"command":"<nodeExec>","args":["<mcpScriptPath>"],"env":{...}}}}` with full env vars embedded
- **MCP wiring:** Config file with explicit `node` + `mcp-server.mjs` invocation (Copilot does not support `mcp add`); env vars baked into the JSON config
- **Output:** Plain text streamed on stdout

**CLI resolution:** All provider commands are resolved via `resolveCommand()` in `packages/backend/src/index.ts`, which uses `which` plus an extensive candidate list (`/opt/homebrew/bin`, `~/.nvm`, `~/.fnm`, `~/.volta`, `~/.asdf`, `~/.npm-global`, `~/.bun`, `~/Library/pnpm`, etc.) defined in `packages/backend/src/command-resolution.ts`.

**Install hints per provider** (surfaced in UI error banners):
- Claude Code: `curl -fsSL https://claude.ai/install.sh | bash`
- Gemini CLI: `npm install -g @google/gemini-cli`
- Codex CLI: `npm install -g @openai/codex`
- Copilot CLI: `gh extension install github/gh-copilot`

---

## Bundled MCP Server (`mcp-server.mjs`)

**Location:** `packages/backend/assets/mcp-server.mjs` (829 lines)

**Runtime:** Standard Node.js process (not QuickJS). The backend copies the file to a UUID-named temp dir (`/tmp/drift-mcp-<uuid>/mcp-server.mjs`) at MCP start time. A Node.js executable is located at runtime via `requireNodeExecutable()` in `packages/backend/src/index.ts`.

**Transport:** MCP JSON-RPC 2.0 over stdio. The server reads newline-delimited JSON from stdin and writes responses to stdout.

**Protocol version:** `2024-11-05` (declared in `initialize` response at line 712 of `mcp-server.mjs`)

**Authentication at startup:**
- Run with `--validate-auth` flag: makes a lightweight GraphQL probe (`query{requests(first:1){edges{node{id}}}}`) and exits with JSON result + code 0/1
- The backend wrapper (`validateCaidoAuth`) calls this before registering MCP with providers

**Environment variables consumed by `mcp-server.mjs`:**
| Variable | Purpose |
|---|---|
| `CAIDO_URL` | Caido GraphQL endpoint (default `http://localhost:8080`) |
| `CAIDO_TOKEN` | Bearer token for Caido GraphQL API |
| `DRIFT_CONTEXT_FILE` | Path to JSON file with active Caido project/filter context |
| `DRIFT_ACTIVITY_FILE` | Path to JSONL file; tool call results are appended here |
| `DRIFT_APPROVALS_FILE` | Path to JSON file; backend writes approval decisions, MCP reads them |
| `DRIFT_ALLOWLIST_ACTIVE` | `"1"` when Drift permission policy is active; empty = standalone mode |
| `DRIFT_ALLOWED_TOOLS` | Comma-separated list of allowed tool names |
| `DRIFT_CONFIRMATION_REQUIRED_TOOLS` | Comma-separated tool names requiring user confirmation |
| `DRIFT_CONFIRM_SENSITIVE_ACTIONS` | `"1"` to require confirmation for sensitive tools |
| `DRIFT_GRAPHQL_TIMEOUT_MS` | Override GraphQL request timeout (default 15000ms) |

**Wrapper shell script (`mcp-wrapper.sh`):**
Generates a bash script that `export`s all env vars and `exec`s `node mcp-server.mjs "$@"`. Written to `mcpTempDir` with mode `0o700`. Used as the entry point passed to AI CLIs. A per-session variant (`mcp-wrapper-<sessionId>.sh`) is written for Claude with session-specific tool policy and activity/approvals file paths.

**18 MCP Tools** (defined in `packages/shared/src/mcp.ts` as `MCP_TOOL_DEFINITIONS`):

| Tool Name | Group | Sensitive |
|---|---|---|
| `search_history` | read | no |
| `get_current_context` | read | no |
| `list_projects` | read | no |
| `select_project` | read | no |
| `clear_context_override` | read | no |
| `get_request` | read | no |
| `list_findings` | read | no |
| `get_scope` | read | no |
| `check_scope` | read | no |
| `create_replay_session` | replay | no |
| `send_request` | replay | yes |
| `create_finding` | findings | yes |
| `get_environment` | environment | no |
| `set_environment` | environment | yes |
| `intercept_status` | intercept | no |
| `intercept_pause` | intercept | yes |
| `intercept_resume` | intercept | yes |
| `run_workflow` | workflow | yes |

**Tool approval flow:**
1. MCP server appends an `approval-request` event to `DRIFT_ACTIVITY_FILE` (JSONL)
2. Backend polls the file via activity tick loop; sends `mcp-tool-approval` event to frontend
3. User approves/denies in UI; backend calls `respondToMcpToolApproval` which writes to `DRIFT_APPROVALS_FILE` (JSON)
4. MCP server polls `DRIFT_APPROVALS_FILE` every 250ms for up to 30s

---

## Caido HTTP / GraphQL API

**Used by:** `packages/backend/assets/mcp-server.mjs` (at runtime when tools are called) and indirectly by the backend for auth validation.

**Endpoint:** `${CAIDO_URL}/graphql` (POST)

**Auth:** `Authorization: Bearer ${CAIDO_TOKEN}` header

**Token source:** The backend captures the Caido session token via `syncCaidoSessionToken` RPC (called by the frontend after it extracts the token from the active Caido browser session). Stored in `sessionCaidoToken` module-level variable in `packages/backend/src/index.ts`.

**URL config:** Stored in `Settings.caidoApi.url` (default `http://localhost:8080`); user-configurable in the Drift settings UI. Passed as `CAIDO_URL` env var to the MCP server wrapper.

**GraphQL operations used** (all in `mcp-server.mjs`):

| Operation | Purpose |
|---|---|
| `query{requests(first:$first,...)}` | `search_history` tool |
| `query{request(id:$id){...raw...}}` | `get_request` tool |
| `mutation createReplaySession` | `send_request` and `create_replay_session` tools |
| `mutation sendReplaySession` | `send_request` tool |
| `mutation createFinding` | `create_finding` tool |
| `query{findings(first:$first)}` | `list_findings` tool |
| `query{scopes{...}}` | `get_scope` and `check_scope` tools |
| `query{environments{...}}` | `get_environment` tool |
| `mutation updateEnvironment` | `set_environment` tool |
| `query{interceptOptions}` | `intercept_status` tool |
| `mutation pauseIntercept` | `intercept_pause` tool |
| `mutation resumeIntercept` | `intercept_resume` tool |
| `mutation runConvertWorkflow` | `run_workflow` tool |
| `query{projects} query{currentProject}` | `list_projects` tool |
| `mutation selectProject` | `select_project` tool and context syncing |
| `query{requests(first:1)}` | Auth validation probe (`--validate-auth`) |

**Error handling:** GraphQL errors extract `extensions.CAIDO.code` and `extensions.CAIDO.reason` to distinguish `AUTHORIZATION`/`INVALID_TOKEN` errors from generic errors.

**Timeout:** Default 15000ms per request; overridable via `DRIFT_GRAPHQL_TIMEOUT_MS` env var. Auth probe uses a hardcoded 5000ms timeout.

---

## SQLite Persistence (via Caido SDK)

**Used by:** `packages/backend/src/index.ts`, `packages/backend/src/persistence.ts`

**SDK entry point:** `sdk.meta.db()` — returns Caido's project-scoped SQLite handle. Typed via `PersistenceDbHandle` in `packages/backend/src/persistence.ts`.

**Interface:**
```typescript
type PersistenceDbHandle = {
  execute(sql: string): Promise<void>;
  query(sql: string): Promise<unknown[]>;
};
```
Note: Caido's SQLite binding does not expose parameterized queries; string values are escaped manually via `escapeSqliteLiteral()` (replaces `'` → `''`). Input is constrained to hardcoded key names (`"settings"`, `"chats"`), never attacker-controlled.

**Table:** `drift_settings (key TEXT PRIMARY KEY, value TEXT)`
- Stores JSON blobs for `settings` and `chats` keys
- Created with `CREATE TABLE IF NOT EXISTS` on first access
- Survives plugin reinstalls (project-scoped SQLite persists in Caido's data directory)

**Fallback:** If SQLite is unavailable, falls back to JSON files in the plugin data directory (`pluginPath/settings.json`, `pluginPath/chats.json`). Both paths are written on every save for redundancy.

**Legacy cleanup:** On init, drops `drift_scanner_occurrences` table if present (removed feature from earlier versions).

---

## MCP Registration Into External CLIs

**Applies to:** Gemini CLI and Codex CLI only (both support `mcp add`/`mcp remove` subcommands). Claude uses `--mcp-config` flag instead. Copilot uses `--additional-mcp-config` flag.

**Registration flow (on `startMcpServer`):**
1. Backend resolves the CLI binary (e.g., `gemini`, `codex`) via `resolveCommand()`
2. Calls `<binary> mcp remove drift` (best-effort pre-clean of stale entries)
3. Calls `<binary> mcp add drift -- <wrapperPath>` via `spawnAndWait()`
4. On success, stores binary path in `registeredMcpCliPaths` Map

**Unregistration flow (on `stopMcpServer` or `cleanupMcpRuntime`):**
- Calls `<storedBinary> mcp remove drift` for each registered CLI
- Uses the stored binary path (not the current settings value) so cleanup works even if user disables the provider after registration

**Skip conditions:**
- Provider not in settings
- Provider disabled in Drift settings
- CLI binary not resolvable

**Diagnostic tracking:** Skipped registration reasons stored in `skippedMcpCliReasons` Map; surfaced in the diagnostics/support bundle RPC.

---

## Caido Plugin SDK Integration

**Frontend SDK** (`packages/frontend/src/types.ts`):
- `@caido/sdk-frontend` 0.55.3
- Used to register commands (`CMD.open`, `CMD.analyzeRequest`, etc.), consume backend RPC calls, and subscribe to backend events

**Backend SDK** (`packages/backend/src/index.ts`):
- `@caido/sdk-backend` 0.55.3
- `sdk.meta.path()` — plugin data directory path (for JSON file persistence)
- `sdk.meta.assetsPath()` — path to plugin asset files (locates `mcp-server.mjs`)
- `sdk.meta.db()` — SQLite database handle
- `sdk.api.register(name, handler)` — registers 18 RPC handlers
- `sdk.api.send(eventName, data)` — pushes events to frontend (5 event types)
- `sdk.events.onProjectChange(handler)` — reacts to Caido project switches
- `sdk.projects.getCurrent()` — reads active Caido project on init and project change
- `sdk.console.log/error` — logs to Caido's plugin console

---

## Temp Directory Management

**Location:** `/tmp/drift-mcp-<uuid>/` (created with mode `0o700`)

**Contents per session:**
- `mcp-server.mjs` — copy of `packages/backend/assets/mcp-server.mjs`
- `mcp-context.json` — current Caido project/filter context (read by MCP server)
- `mcp-wrapper.sh` — shared wrapper for Gemini/Codex self-test and auth validation
- `mcp-wrapper-<sessionId>.sh` — per-session wrapper for Claude (with session-specific env)
- `mcp-<chatId>.json` — per-chat MCP config for Claude (references wrapper path)
- `copilot-mcp-<chatId>.json` — per-chat MCP config for Copilot (embeds full env)
- `mcp-activity-<sessionId>.jsonl` — tool call activity log (append-only)
- `mcp-approvals-<sessionId>.json` — user approval decisions (read by MCP server)
- `mcp-self-test-<id>.sh` — ephemeral script for MCP self-test calls (deleted after use)

**Security:** All files and the directory use mode `0o700`/`0o600` to prevent other local users from reading the Caido token. Temp files carrying the token (wrappers, Copilot configs) use mode `0o600`. Executable scripts use mode `0o700`.

**Cleanup:**
- Active cleanup: `rm(mcpTempDir, { recursive: true, force: true })` on `stopMcpServer` / `cleanupMcpRuntime`
- Orphan sweep: On `startMcpServer`, `sweepOrphanedMcpTempDirs()` removes all `/tmp/drift-mcp-*` directories left by previous sessions (e.g. after crash)

**Debug session logs:** When `debugLogging` is enabled in settings, per-session logs are written to `/tmp/drift-session-<sessionId>.log` (append mode, auto-deleted on session close).

---

## Environment Configuration

**Required at runtime (no .env file — local-first, no API keys):**
- The user's local AI CLI must be installed and on PATH (or configured with absolute path in settings)
- Caido must be running at `Settings.caidoApi.url` (default `http://localhost:8080`)
- A Caido session must be active (Drift captures the token from the browser session automatically via `syncCaidoSessionToken`)
- Node.js ≥ 18 must be available on the host system (for spawning `mcp-server.mjs`)

**No secrets stored:** All sensitive values (Caido token) are held in memory only (`sessionCaidoToken`) and passed transiently as env vars to child processes.

---

*Integration audit: 2026-06-26*
