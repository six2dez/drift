<!-- refreshed: 2026-06-26 -->
# Architecture

**Analysis Date:** 2026-06-26

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                      Caido Browser UI (host)                         │
│   Vue3 + Pinia frontend  `packages/frontend/src/`                    │
│   FrontendSDK  →  sdk.backend.*(RPC)  /  sdk.backend.onEvent(…)     │
└──────────────────┬───────────────────────────────────────────────────┘
                   │  Caido plugin RPC bridge  (DefineAPI / DefineEvents)
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│               Backend plugin process  (QuickJS / Caido runtime)      │
│   `packages/backend/src/index.ts`  — single module, no ES modules   │
│                                                                      │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────────┐  │
│  │  Settings & │  │  MCP runtime   │  │  CLI session manager     │  │
│  │  Chats      │  │  startMcpServer│  │  sendCliMessage          │  │
│  │  (SQLite +  │  │  (temp dir,    │  │  spawn(launchScript.sh)  │  │
│  │  JSON file) │  │  wrapper.sh,   │  │  watchdog/heartbeat      │  │
│  └─────────────┘  │  auth, reg.)   │  └───────────┬──────────────┘  │
│                   └───────┬────────┘              │                  │
└───────────────────────────┼───────────────────────┼──────────────────┘
                            │ spawn (stdio)          │ spawn (stdio)
                   ┌────────▼───────┐      ┌────────▼───────────────┐
                   │  mcp-server.mjs│      │  CLI provider process  │
                   │  (Node.js,     │      │  claude / gemini /     │
                   │  /tmp/drift-*/ │      │  codex / copilot       │
                   │  stdio MCP)    │      │  spawned via .sh       │
                   └────────────────┘      │  wrapper or direct     │
                                           └────────────────────────┘
                                                    │
                                          JSONL activity file +
                                          JSON approvals file
                                          in /tmp/drift-mcp-<uuid>/
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Frontend `init` | Mount Vue app, register Caido commands/menus, navigate to `/drift` | `packages/frontend/src/index.ts` |
| `useChatStore` | Chat CRUD, session ID mapping, streaming state, session state events | `packages/frontend/src/stores/chat.ts` |
| `useSettingsStore` | Settings sync, MCP status polling, Caido token sync, provider statuses | `packages/frontend/src/stores/settings.ts` |
| `useApprovalsStore` | Pending MCP tool approval queue, one-at-a-time dialog flow | `packages/frontend/src/stores/approvals.ts` |
| `ChatView.vue` | Main chat UI, send turn, stream output, handle approvals, session lifecycle | `packages/frontend/src/views/ChatView.vue` |
| Backend `init` | Register all RPC handlers, load persisted data, subscribe to project changes | `packages/backend/src/index.ts:2952` |
| `startMcpServer` | Full MCP runtime bootstrap (see dedicated section below) | `packages/backend/src/index.ts:1694` |
| `sendCliMessage` | Build prompt + args, write launch scripts, spawn CLI, watchdog output | `packages/backend/src/index.ts:1847` |
| `mcp-runtime.ts` | Pure helpers: tool policy, context serialization, self-test result builders | `packages/backend/src/mcp-runtime.ts` |
| `command-resolution.ts` | `which`-based binary resolution + version-manager fallbacks | `packages/backend/src/command-resolution.ts` |
| `provider-launch.ts` | Pure arg-builders per CLI provider (no I/O) | `packages/backend/src/provider-launch.ts` |
| `claude-print.ts` | Stateful parser for Claude Code's `stream-json` output format | `packages/backend/src/claude-print.ts` |
| `persistence.ts` | Thin wrapper around Caido's SQLite handle | `packages/backend/src/persistence.ts` |
| `mcp-server.mjs` | Standalone Node.js MCP server (stdio transport, GraphQL → Caido) | `packages/backend/assets/mcp-server.mjs` |
| `shared` | TypeScript types and constants shared between frontend and backend | `packages/shared/src/` |

## Pattern Overview

**Overall:** Event-driven plugin with a POSIX shell-wrapper bridge between a constrained QuickJS runtime and external Node.js / CLI processes.

**Key Characteristics:**
- Backend runs inside Caido's QuickJS runtime — no native Node.js APIs beyond what Caido exposes; notably no `import.meta`, no dynamic `require`, no Zod (crashes QuickJS).
- All inter-process communication to/from the MCP server and CLI providers goes through `child_process.spawn` with `stdio: ['pipe','pipe','pipe']`.
- Caido's plugin runtime does NOT reliably deliver `child_process` data/close callbacks while an RPC handler is awaiting. The watchdog / heartbeat pattern uses frontend keep-alive RPCs (`getCliSessionState`, `getMcpStatus`) to pump pending state.
- MCP context (project, history filter) is shared between the backend and `mcp-server.mjs` exclusively through a JSON file on disk (`/tmp/drift-mcp-<uuid>/mcp-context.json`).
- Tool approvals are communicated from backend → MCP server through a JSON file (`mcp-approvals-<sessionId>.json`). The MCP server polls this file synchronously before executing a sensitive tool.
- Tool activity is reported from MCP server → backend through an append-only JSONL file (`mcp-activity-<sessionId>.jsonl`).

## Layers

**Frontend (Vue3 + Pinia):**
- Purpose: User-facing chat interface inside Caido's sidebar panel
- Location: `packages/frontend/src/`
- Contains: Vue SFCs, Pinia stores, chat-context helpers, command/menu registration
- Depends on: `shared` types, Caido Frontend SDK (`@caido/sdk-frontend`), PrimeVue
- Used by: Caido browser host

**Backend (QuickJS plugin runtime):**
- Purpose: All business logic — MCP lifecycle, CLI spawning, persistence, event emission
- Location: `packages/backend/src/`
- Contains: Single entry module (`index.ts`) plus helpers in 6 companion modules
- Depends on: `shared` types, Caido backend SDK (`caido:plugin`), Node.js `child_process` / `fs/promises` (shimmed by Caido)
- Used by: Caido plugin host

**MCP Server (Node.js subprocess):**
- Purpose: Standalone JSON-RPC 2.0 MCP server that translates tool calls into Caido GraphQL API requests
- Location: `packages/backend/assets/mcp-server.mjs` (bundled asset, copied to `/tmp` at runtime)
- Contains: 829-line self-contained `.mjs` file — GraphQL client, tool handlers, approval polling, activity logging
- Depends on: `CAIDO_URL`, `CAIDO_TOKEN`, `DRIFT_*` env vars; reads/writes files in `/tmp/drift-mcp-<uuid>/`
- Used by: CLI providers (via `mcp-wrapper.sh`), self-test (via `callMcpMethod`)

**Shared types:**
- Purpose: Single source of truth for types shared between frontend and backend
- Location: `packages/shared/src/`
- Contains: `MCP_TOOL_DEFINITIONS`, `Settings`, `StoredChat`, `ChatMessage`, event types
- Depends on: nothing (pure TypeScript declarations + constants)

## `startMcpServer` — Full Bootstrap Trace

Function: `startMcpServer` at `packages/backend/src/index.ts:1694`

**Step 1 — Prerequisites**
- Reads `sessionCaidoToken` (set by frontend via `syncCaidoSessionToken` RPC). Aborts if empty.
- Checks `packages/backend/assets/mcp-server.mjs` exists on disk.

**Step 2 — Sweep orphaned temp dirs** (`sweepOrphanedMcpTempDirs`, line 1679)
- Reads `/tmp` via `readdir("/tmp")` (POSIX: `/tmp` hardcoded).
- Deletes every `/tmp/drift-mcp-*` directory that is not the current `mcpTempDir`.

**Step 3 — Create temp dir** (line 1716)
- Sets `mcpTempDir = /tmp/drift-mcp-<uuid>` (POSIX: `/tmp` hardcoded).
- Creates directory with `mkdir(mcpTempDir, { recursive: true, mode: 0o700 })` — POSIX octal permissions.

**Step 4 — Copy MCP script** (line 1719–1720)
- Reads `mcp-server.mjs` from `assetsPath` (Caido-provided plugin asset path).
- Writes copy to `/tmp/drift-mcp-<uuid>/mcp-server.mjs` — needed because the asset path may contain spaces that break some CLI arg parsers.

**Step 5 — Refresh project context** (`refreshProjectContext`, line 1722)
- Calls `sdk.projects.getCurrent()` and writes `mcp-context.json` to the temp dir.

**Step 6 — Resolve Node.js** (`getNodeExecutable`, line 1531)
- Calls `resolveCommand("node")` which spawns `which node` with a 1-second timeout (POSIX: `which` binary).
- Augments `which` result with fallback candidates from `getNodeExecutableCandidates` (`command-resolution.ts:134`): `process.execPath`, sibling `node` in provider binary directories, then hardcoded POSIX paths:
  - `/opt/homebrew/bin/node` (macOS Homebrew)
  - `/usr/local/bin/node`
  - `/usr/bin/node`
  - `~/.volta/bin/node`, `~/.asdf/shims/node`, `~/.local/bin/node`
  - `~/.nvm/versions/node/<version>/bin/node` (probed via `readdir`)
  - `~/.fnm/node-versions/<version>/installation/bin/node`

**Step 7 — Write context file** (`writeMcpContextFile`, line 1730)
- Serializes `currentCaidoHistoryContext` + `currentCaidoContextOverride` as JSON.
- Writes to `/tmp/drift-mcp-<uuid>/mcp-context.json` (mode inherits from parent dir `0o700`).

**Step 8 — Write MCP wrapper** (`writeMcpWrapper`, line 1736)
- Calls `renderExportExecScript(nodeExecutable, [mcpScriptPath], runtimeEnv, { passThroughArgs: true })`.
- `renderExportExecScript` produces a `#!/bin/bash` script with `export KEY='value'` lines and `exec <cmd> <args> "$@"` (POSIX: `#!/bin/bash` shebang, `exec`, `$@` syntax).
- Writes to `/tmp/drift-mcp-<uuid>/mcp-wrapper.sh.tmp` with mode `0o700` (POSIX octal).
- Spawns `chmod +x <path>` via `spawnAndWait` (POSIX: `chmod` binary).
- Atomically renames `.tmp` → final path.

Env vars injected into the wrapper:
| Variable | Purpose |
|----------|---------|
| `CAIDO_URL` | Caido API base URL (e.g. `http://localhost:8080`) |
| `CAIDO_TOKEN` | Bearer token extracted from `window.localStorage.CAIDO_AUTHENTICATION` |
| `DRIFT_CONTEXT_FILE` | Path to `mcp-context.json` in temp dir |
| `DRIFT_ALLOWLIST_ACTIVE` | `"1"` — signals that an empty allowlist means deny-all |
| `DRIFT_ALLOWED_TOOLS` | Comma-separated allowed tool names |
| `DRIFT_CONFIRMATION_REQUIRED_TOOLS` | Comma-separated tools requiring user confirmation |
| `DRIFT_CONFIRM_SENSITIVE_ACTIONS` | `"1"` or `"0"` |
| `DRIFT_ACTIVITY_FILE` | Path to per-session `mcp-activity-<id>.jsonl` |
| `DRIFT_APPROVALS_FILE` | Path to per-session `mcp-approvals-<id>.json` |

**Step 9 — Auth validation** (`validateCaidoAuth`, line 1743)
- Spawns `wrapperPath --validate-auth` via `spawnAndWait`.
- The `mcp-server.mjs` handles `--validate-auth` by making a minimal GraphQL call to Caido and returning `{ok: true|false, ...}` as JSON on stdout.
- Sets `mcpAuthState` to `"valid"`, `"invalid"`, or `"error"`.

**Step 10 — Register MCP with CLI providers** (`tryRegisterMcpForProviders`, line 1755)
- For `gemini-cli` and `codex-cli` only (not Claude/Copilot which use `--mcp-config` flags):
  - Resolves provider binary via `resolveCommand`.
  - Runs `<binary> mcp remove drift` (best-effort cleanup).
  - Runs `<binary> mcp add drift -- <wrapperPath>` to register the wrapper as an MCP server named `"drift"`.
  - Stores resolved binary path in `registeredMcpCliPaths` map for cleanup.

## Data Flow

### Primary Turn Flow (Claude Code example)

1. User sends message in `ChatView.vue` → calls `sdk.backend.sendCliMessage(...)` RPC
2. `sendCliMessage` (`index.ts:1847`) resolves the CLI binary with `resolveCommand`
3. Creates per-session runtime files: `mcp-activity-<sessionId>.jsonl` and `mcp-approvals-<sessionId>.json` in `mcpTempDir` (`createSessionRuntimeFiles`, line 606)
4. Writes per-session MCP wrapper `mcp-wrapper-<sessionId>.sh` with session-specific `DRIFT_ACTIVITY_FILE` / `DRIFT_APPROVALS_FILE` env vars
5. Writes MCP config JSON `mcp-<chatId>.json` pointing at the session wrapper
6. Writes provider launch script `provider-launch-<sessionId>.sh` (wraps the CLI binary with all env vars)
7. Spawns `provider-launch-<sessionId>.sh` via `spawn(launchCommand, [], { stdio: ['pipe','pipe','pipe'] })`
8. Writes prompt to `proc.stdin` and closes it
9. For Claude: parses `stream-json` output via `consumeClaudePrintChunk` in `claude-print.ts`; emits `cli-output-chunk` events to frontend on each text delta
10. `setInterval` (250ms) + `sessionWatchdog` pump `flushActivities()`: reads the JSONL file and emits `mcp-tool-activity` / `mcp-tool-approval` events
11. When `proc.close` fires: `finalizeFromProcessEnd` resolves the RPC with `{ content, mcpActivities, usage }`
12. Frontend `ChatView` receives the resolved RPC and persists the message via `saveChat`

### MCP Tool Call Flow (inside the spawned CLI)

1. Claude Code sends a JSON-RPC `tools/call` request over its own stdin/stdout to the MCP server process
2. `mcp-server.mjs` receives the request, checks `DRIFT_ALLOWED_TOOLS`, checks `DRIFT_CONFIRMATION_REQUIRED_TOOLS`
3. If confirmation required: appends `{type:"approval-request", approvalId, ...}` to `DRIFT_ACTIVITY_FILE` and polls `DRIFT_APPROVALS_FILE` up to 60 seconds
4. Backend `flushActivities()` reads the JSONL, emits `mcp-tool-approval` event to frontend
5. User clicks Approve/Deny in `ApprovalDialog.vue` → `sdk.backend.respondToMcpToolApproval(...)` RPC
6. Backend writes decision to `mcp-approvals-<sessionId>.json`
7. `mcp-server.mjs` poll reads the decision file and proceeds or aborts the tool
8. Tool executes Caido GraphQL API call using `CAIDO_URL` / `CAIDO_TOKEN`
9. Appends `{type:"tool-result", ...}` to activity JSONL
10. Returns JSON-RPC response to Claude Code

### Context Sync Flow

1. Frontend `useSettingsStore` subscribes to Caido filter/project change events
2. On change: calls `syncCaidoHistoryContext` or `syncCaidoSessionToken` RPC
3. Backend calls `writeMcpContextFile()` — writes `mcp-context.json` atomically
4. `mcp-server.mjs` reads `DRIFT_CONTEXT_FILE` on every relevant tool call (`get_current_context`, `search_history`, etc.)

### Per-Provider MCP Attachment Strategy

| Provider | MCP attachment method |
|----------|-----------------------|
| Claude Code | `--mcp-config mcp-<chatId>.json` + `--strict-mcp-config`; session wrapper written fresh each turn |
| Gemini CLI | `gemini mcp add drift -- <wrapperPath>` at startup; `--allowed-mcp-server-names drift` per turn |
| Codex CLI | `gemini/codex mcp add drift` at startup; no per-turn flag |
| GitHub Copilot | `--additional-mcp-config @copilot-mcp-<chatId>.json`; config embeds Node path + env dict (no wrapper script) |

**State Management:**
- Backend: module-level `let` variables (single-threaded QuickJS). Maps for active processes, session snapshots, watchdogs, runtime files.
- Frontend: Pinia stores (reactivity graph). No shared global state outside stores.

## Key Abstractions

**MCP wrapper script (`mcp-wrapper.sh`):**
- Purpose: Executable bash script that `export`s all required env vars and `exec`s `node mcp-server.mjs "$@"`
- Location at runtime: `/tmp/drift-mcp-<uuid>/mcp-wrapper.sh` (shared) and `/tmp/drift-mcp-<uuid>/mcp-wrapper-<sessionId>.sh` (per-session)
- Pattern: Generated by `renderExportExecScript` (`index.ts:320`), written atomically via `.tmp` rename

**Provider launch script (`provider-launch-<sessionId>.sh`):**
- Purpose: Bash wrapper that `export`s `CAIDO_TOKEN` and tool-policy env vars into the CLI provider subprocess
- Location at runtime: `/tmp/drift-mcp-<uuid>/provider-launch-<sessionId>.sh`
- Pattern: Written via `writeLaunchScript` (`index.ts:299`) when `runtimeFiles !== undefined`

**Runtime files (per session):**
- `mcp-activity-<sessionId>.jsonl` — append-only log of MCP tool events written by `mcp-server.mjs`, read by backend watchdog
- `mcp-approvals-<sessionId>.json` — dictionary of `{ [approvalId]: { approved, decidedAt } }` written by backend, polled by `mcp-server.mjs`
- Both files live in `/tmp/drift-mcp-<uuid>/` and are deleted when the session finalizes

**Debug log:**
- Path: `/tmp/drift-session-<sessionId>.log` (POSIX `/tmp` hardcoded in `getSessionDebugLogPath`, `index.ts:336`)
- Written only when `currentSettings.debugLogging === true`

## Entry Points

**Backend `init`:**
- Location: `packages/backend/src/index.ts:2952`
- Triggers: Caido plugin host on plugin load
- Responsibilities: Sets `pluginPath`/`assetsPath`, initializes SQLite, loads persisted settings+chats, registers all RPC handlers, calls `refreshProjectContext`, subscribes to `sdk.events.onProjectChange`

**Frontend `init`:**
- Location: `packages/frontend/src/index.ts:32`
- Triggers: Caido browser host on plugin load
- Responsibilities: Creates Vue app, mounts PrimeVue + Pinia, registers Caido sidebar/commands/context-menus

## Architectural Constraints

- **Threading:** Single-threaded event loop (QuickJS). No worker threads. `setInterval` callbacks do not fire while an outer `await` is suspended in an RPC handler — this is the root cause of the frontend keep-alive polling pattern (`getCliSessionState`, `getMcpStatus` called every ~1.5s).
- **Global state:** All backend state is module-level `let`/`const` in `packages/backend/src/index.ts`. Key singletons: `mcpTempDir`, `currentSettings`, `activeProcesses`, `sessionSnapshots`, `sessionWatchdogs`, `sessionRuntimeFiles`, `registeredMcpCliPaths`, `db`.
- **Circular imports:** None detected. `index.ts` imports from all four helper modules; helpers only import from `shared`.
- **QuickJS constraint:** No Zod, no dynamic `require`, no `import.meta`, no native addons. The `Result<T>` type is defined inline in `index.ts` rather than imported to avoid Zod.
- **Path spaces:** Caido's plugin asset path contains "Application Support" (macOS). The code explicitly copies `mcp-server.mjs` to `/tmp` to avoid spaces in paths passed to CLI `--mcp-config` flags (comment at `index.ts:1712`).

## POSIX Surface — Every Place That Must Change for Windows

The following are all POSIX-specific assumptions in the codebase. A native Windows port must replace each one:

| Location | POSIX assumption | Windows equivalent needed |
|----------|-----------------|--------------------------|
| `index.ts:1716` | `mcpTempDir = /tmp/drift-mcp-<uuid>` | `%TEMP%\drift-mcp-<uuid>` or `os.tmpdir()` |
| `index.ts:1681–1691` | `readdir("/tmp")`, filters `drift-mcp-*` | Scan `os.tmpdir()` |
| `index.ts:336` | `getSessionDebugLogPath` returns `/tmp/drift-session-*.log` | `os.tmpdir()` |
| `index.ts:328–333` | `renderExportExecScript` emits `#!/bin/bash`, `export KEY=VALUE`, `exec cmd "$@"` | PowerShell/CMD `.bat` or `.ps1` with `$env:KEY=VALUE`; `&` operator; no `"$@"` |
| `index.ts:311–317`, `index.ts:743–778` | `writeLaunchScript` / `writeMcpWrapper` call `chmod +x` via `spawnAndWait("chmod", ["+x", ...])` | Windows does not use chmod; executable bit not applicable |
| `index.ts:263`, `index.ts:769` | `mode: 0o700` / `mode: 0o600` on `mkdir`/`writeFile` | Windows ACL-based permissions; Node `mode` is silently ignored on Windows |
| `index.ts:848–888` | `resolveCommand` spawns `which <command>` with 1s timeout | `where.exe` on Windows; or use `cross-spawn`/`which` npm package |
| `command-resolution.ts:53–62` | `extractHomeDir` recognizes `/Users/` and `/home/` prefixes only | Recognize `C:\Users\` prefix |
| `command-resolution.ts:87–102` | NVM path: `~/.nvm/versions/node/<v>/bin/<cmd>` | Windows NVM path: `%APPDATA%\nvm\<v>\<cmd>.cmd` |
| `command-resolution.ts:94–102` | fnm path: `~/.fnm/node-versions/<v>/installation/bin/<cmd>` | `%LOCALAPPDATA%\fnm\node-versions\<v>\installation\<cmd>.cmd` |
| `command-resolution.ts:113–125` | Hardcoded POSIX paths: `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/bin`, `~/.bun/bin`, `~/Library/pnpm` | Windows install locations: `%ProgramFiles%\nodejs`, scoop paths, etc. |
| `provider-launch.ts:8` | `CLAUDE_DISALLOWED_TOOLS` list includes POSIX-specific Claude tools (Bash, Glob, etc.) | Verify Claude Code Windows tool names match |
| `mcp-server.mjs:11–39` | Reads `CAIDO_URL`, `CAIDO_TOKEN`, `DRIFT_*` from `process.env` — env vars injected via bash `export` | On Windows, env vars must be injected differently (no bash wrapper); Copilot uses the `env` dict approach which is already cross-platform |

## Anti-Patterns

### RPC-during-await event loop starvation

**What happens:** `setInterval` callbacks (the 250ms heartbeat in `sendCliMessage`) do not fire while a QuickJS RPC handler is `await`ing. The watchdog that detects a dead child process goes dormant during any concurrent RPC.
**Why it's wrong:** The CLI process can exit while an unrelated RPC is outstanding, leaving the session permanently stuck in `"running"` state.
**Do this instead:** The codebase already works around this correctly — `getCliSessionState` RPC calls `sessionWatchdogs.get(sessionId)()` synchronously, and `getMcpStatus` calls `activeSelfTestPoll()`. Any new long-running async work must expose a similar pump callable from an RPC keep-alive. See `index.ts:2712`.

### Module-level mutable singletons for all backend state

**What happens:** `mcpTempDir`, `currentSettings`, all Maps, are plain `let` variables at module scope in a 3000-line file.
**Why it's wrong:** Makes state interactions hard to reason about and test; no encapsulation.
**Do this instead:** New backend state should be grouped into small typed objects and passed explicitly rather than accessed via closure. The helper modules (`mcp-runtime.ts`, `command-resolution.ts`) already demonstrate the pure-function pattern; extend this to new state slices.

## Error Handling

**Strategy:** All RPC handlers return `Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string }` — never throw across the RPC boundary. Internal helpers use `Promise`-based error handling; critical paths catch and convert to `err(message)`.

**Patterns:**
- `spawnAndWait` always resolves (never rejects); exit code is in the returned object.
- `writeMcpWrapper` / `writeLaunchScript` return `undefined` on failure rather than throwing.
- `cleanupMcpRuntime` is called defensively on any setup failure to prevent orphaned temp dirs.
- SQLite operations use `try/catch` and record failures via `recordPersistenceIssue` without surfacing to the user unless critical.

## Cross-Cutting Concerns

**Logging:** `sdk.console.log/error` for backend diagnostics (visible in Caido's plugin console). `appendSessionDebugLog` for per-session debug traces written to `/tmp/drift-session-<sessionId>.log` when `debugLogging` is enabled.
**Validation:** No Zod (QuickJS incompatible). Inline type guards and `typeof` checks throughout. The `parseMcpRuntimeContext` in `mcp-runtime.ts` handles malformed JSON gracefully.
**Authentication:** Caido bearer token read from `window.localStorage.CAIDO_AUTHENTICATION.accessToken` by the frontend and pushed to backend via `syncCaidoSessionToken` RPC. Token is injected into all child processes via `CAIDO_TOKEN` env var in bash wrapper scripts.

---

*Architecture analysis: 2026-06-26*
