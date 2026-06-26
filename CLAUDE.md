<!-- GSD:project-start source:PROJECT.md -->
## Project

**Drift**

Drift is a Caido plugin that turns the user's own local AI CLIs (Claude Code / Gemini / Codex / Copilot) into a security copilot for manual web-app testing. It runs a local MCP server that exposes ~18 Caido-aware tools (history search, request replay, findings, environment, intercept, workflows) to those CLIs — local-first, no API keys, using the user's existing CLI auth and Caido session token. It's for pentesters and bug-bounty hunters who already live in Caido.

**Core Value:** A working bridge: the user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data. If the MCP runtime doesn't launch, nothing else matters.

### Constraints

- **Compatibility**: Must preserve existing macOS/Linux behavior — the current user base ships on those. No POSIX regressions.
- **Runtime**: Backend runs in Caido's constrained JS runtime (comments note Zod crashes QuickJS). Only use Node APIs Caido actually provides. Whether `os.tmpdir()` and `process.platform` are available in that runtime is an open research question for planning — confirm before relying on them.
- **Testing**: The maintainer cannot test native Windows locally. Validation is CI on `windows-latest` (build + vitest) plus, where possible, the original reporter confirming the fix on a real machine.
- **Security**: Runtime temp files carry the Caido token (today `0o600`/`0o700`). Windows ignores POSIX modes — need a Windows-appropriate equivalent (per-user temp dir ACLs) or an accepted trade-off.
- **Store**: Must stay compliant with the Caido developer policy and the signed release pipeline (`plugin_package.zip` + `.sig`, unprefixed tag).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.5.4 — all three packages (`packages/backend`, `packages/frontend`, `packages/shared`)
- JavaScript (ES module) — `packages/backend/assets/mcp-server.mjs` (plain `.mjs`, not TypeScript; intentionally standalone so it can run under any Node without a build step)
## Runtime
- Node.js ≥ 20 (enforced in `package.json` `engines` field; CI pins Node 20 via `actions/setup-node`)
- `.nvmrc` pins `20` for local development
- Caido's QuickJS-based backend runtime. The backend bundle is loaded by Caido as an ES module inside a constrained JavaScript environment. Key constraint: Zod crashes QuickJS, so no Zod or similar schema-validation libraries are used. Comment in `packages/backend/src/index.ts` line 68: `// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────`. UUID generation also avoids `crypto` module (custom hex loop at line 829 of `index.ts`).
- pnpm 9.0.0 (enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` present (lockfileVersion `9.0`)
## Frameworks
- Vue 3.5.29 — UI framework; `packages/frontend/src/index.ts` creates the app with `createApp`
- PrimeVue 4.1.0 — component library, used unstyled with `Classic` preset from `@caido/primevue`
- Pinia 3.0.4 — state management; `packages/frontend/src/stores/`
- Tailwind CSS 3.4.13 with `tailwindcss-primeui` and `@caido/tailwindcss`
- PostCSS with `postcss-prefixwrap` to scope all styles under `#plugin--drift` (avoids Caido style collisions)
- Config: `caido.config.ts` (PostCSS inline in Vite config)
- `markdown-it` 14.1.1 with `markdown-it-highlightjs` for syntax highlighting in chat messages
- `highlight.js` ^11.11.1 — code highlighting
- `dompurify` 3.3.3 — sanitizes rendered HTML output before injection
- Vitest 4.0.18 — test runner and assertion library
- `@vue/test-utils` ^2.4.6 — Vue component test helpers
- `happy-dom` ^20.8.9 — DOM environment for frontend tests
- Config: `vitest.config.ts` at repo root
- Vite 6.0.7 — bundler for the frontend package
- `@caido-community/dev` 0.1.6 (`caido-dev`) — Caido-specific build wrapper that orchestrates the monorepo build into `dist/plugin_package/`; invoked via `caido-dev build` and `caido-dev watch`
- `@vitejs/plugin-vue` 6.0.1 — Vue SFC support in Vite
- `vue-tsc` 3.2.5 — type-checking for Vue SFCs (`packages/frontend`)
## Key Dependencies
- `@caido/sdk-backend` 0.55.3 — backend plugin API (`caido:plugin` virtual import resolves from this); provides `SDK`, `DefineAPI`, `DefineEvents` types and runtime hooks (`sdk.meta`, `sdk.api`, `sdk.events`, `sdk.projects`, `sdk.console`)
- `@caido/sdk-frontend` 0.55.3 — frontend plugin API and `FrontendSDK` type; `packages/frontend/src/types.ts`
- `@caido/primevue` 0.3.3 — Caido-themed PrimeVue component set; imported in frontend as `Classic` preset and Tailwind content glob
- `@caido/tailwindcss` 0.1.0 — Caido-specific Tailwind plugin
- `fs/promises`: `readFile`, `writeFile`, `open`, `stat`, `mkdir`, `rm`, `rename`, `readdir` — `packages/backend/src/index.ts` line 2
- `child_process`: `spawn`, `ChildProcessWithoutNullStreams` — `packages/backend/src/index.ts` line 3
- `buffer`: `Buffer` — `packages/backend/src/index.ts` line 4
- `path` — `packages/backend/src/index.ts` line 5
- `fs/promises`: `readdir`, `stat` — `packages/backend/src/command-resolution.ts` line 1
- `path` — `packages/backend/src/command-resolution.ts` line 2
- `os` — **not used** (home directory detection is done via `process.env.HOME` and path inference from `pluginPath`/provider binary paths)
- `crypto` — **not used** (UUID generation uses a custom hex loop to avoid crypto availability uncertainty in QuickJS)
- `node:fs`: `appendFileSync`, `readFileSync`, `writeFileSync` — synchronous I/O for activity log and approval files (only sync methods; no `fs/promises`)
- `fetch` — global (Node 18+ built-in) for Caido GraphQL HTTP calls
- `backend: workspace:*` — frontend imports backend types directly (TypeScript path only, not at runtime)
- `shared: workspace:*` — shared types consumed by both frontend and backend
## Configuration
- `caido.config.ts` — authoritative plugin manifest (id, name, version, author); controls backend assets glob, frontend Vite config, and plugin package structure
- Root `tsconfig.json`: `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `isolatedModules`, target `esnext`, `moduleResolution: bundler`
- `packages/backend/tsconfig.json`: extends root, adds `@caido/sdk-backend` types, excludes test files
- Frontend uses `vue-tsc` for type-checking
- `dist/plugin_package/` — produced by `caido-dev build`
- `dist/drift.zip` — final deliverable created by the `build` script in root `package.json`; `packages/backend/assets/` is copied into `dist/plugin_package/backend/assets/` post-build
- ESLint: `eslint ./packages/**/src --fix` (config file not detected in root; likely in individual packages or inherited)
- Prettier 3.8.1: formats `*.{vue,ts,js,json}` files under `packages/**/src`
## Platform Requirements
- Node.js 20 (`.nvmrc`)
- pnpm 9.x
- macOS or Linux (release signing uses `openssl pkeyutl` and `zip`)
- Installed as a Caido plugin; the backend bundle runs inside Caido's embedded QuickJS runtime
- The MCP server (`mcp-server.mjs`) is spawned as a separate Node.js process on the user's system; requires Node ≥ 18 on the host
- Local AI CLIs (`claude`, `gemini`, `codex`, `copilot`) must be separately installed by the user
## Release / Signing Pipeline
- Triggers on push/PR to `main`
- Runs: typecheck → `vitest run` → `pnpm build`
- Uploads `dist/drift.zip` as a GitHub artifact (14-day retention)
- Manual `workflow_dispatch`, restricted to `main` branch only
- Runs: typecheck → test → build
- Signs `dist/drift.zip` with Ed25519 using `openssl pkeyutl` and the `PRIVATE_KEY` repository secret
- Produces `dist/drift.zip.sig`
- Extracts version from `manifest.json` inside the zip (via `python3`)
- Creates GitHub release via `caido/action-release@v1` with both `drift.zip` and `drift.zip.sig` as artifacts
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all TypeScript source files: `provider-launch.ts`, `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`
- PascalCase for Vue single-file components: `ChatInput.vue`, `MessageBubble.vue`, `ApprovalDialog.vue`
- Test files mirror their source: `provider-launch.test.ts` sits next to `provider-launch.ts`
- camelCase throughout: `buildClaudeLaunchArgs`, `escapeSqliteLiteral`, `collectVersionManagerCommandCandidates`
- Verb-noun prefix convention: `build*`, `create*`, `get*`, `normalize*`, `resolve*`, `render*`
- Boolean predicates: `is*` or `has*` — `hasCaidoContextChanged`, `isFileNotFound`
- camelCase: `mcpTempDir`, `sessionCaidoToken`, `currentSettings`
- Module-level mutable state uses `let`; stable references use `const`
- Module-level constants: SCREAMING_SNAKE_CASE — `CLAUDE_DISALLOWED_TOOLS`, `NODE_EXECUTABLE_ERROR`, `DEFAULT_CHAT_TITLE`
- PascalCase: `ClaudeLaunchInput`, `McpPermissionGroups`, `PersistenceDbHandle`
- Discriminated union members use string literal `kind` field: `{ kind: "Ok" }` / `{ kind: "Error" }`
- `type` preferred over `interface` for object shapes; `interface` appears only in `persistence.ts` for duck-typed handle
## Code Style
- Prettier 3.8.1 (`prettier` in root devDependencies)
- Run: `pnpm format` — formats `packages/**/src/**/*.{vue,ts,js,json}`
- No `.prettierrc` committed — default Prettier settings apply (2-space indent, double quotes)
- ESLint present (`pnpm lint` calls `eslint ./packages/**/src --fix`)
- No project-level ESLint config file; relies on default rules
- `pnpm typecheck` runs `tsc --noEmit` (backend) and `vue-tsc --noEmit` (frontend)
- `index.ts` uses ASCII box headers to delimit logical sections:
- Use this style when adding new top-level sections to `packages/backend/src/index.ts`
## Backend Constraints (QuickJS Runtime)
## The Result Pattern
## Security-Conscious File Permissions
- **Directories holding sensitive temp files:** `0o700` (rwx owner only)
- **Sensitive temp files (MCP config, context file):** `0o600` (rw owner only)
- **Executable launch scripts and wrappers:** `0o700` (rwx owner only)
## Pure Helpers Split for Testability
| Pure helper module | What it owns | `index.ts` owns |
|---|---|---|
| `packages/backend/src/provider-launch.ts` | CLI argument arrays for each provider | spawning the process |
| `packages/backend/src/mcp-runtime.ts` | MCP context normalization, policy building, serialization | writing files, publishing events |
| `packages/backend/src/command-resolution.ts` | Candidate path lists for NVM/fnm/volta/asdf | calling `which`, checking file existence |
| `packages/backend/src/claude-print.ts` | Claude `--print` stream state machine | buffering stdin chunks from child process |
| `packages/backend/src/persistence.ts` | Duck-typed DB handle validator | SQL execution |
## Import Organization
## Error Handling
## Shell Security
## Logging
## Comments
## Module Design
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Backend runs inside Caido's QuickJS runtime — no native Node.js APIs beyond what Caido exposes; notably no `import.meta`, no dynamic `require`, no Zod (crashes QuickJS).
- All inter-process communication to/from the MCP server and CLI providers goes through `child_process.spawn` with `stdio: ['pipe','pipe','pipe']`.
- Caido's plugin runtime does NOT reliably deliver `child_process` data/close callbacks while an RPC handler is awaiting. The watchdog / heartbeat pattern uses frontend keep-alive RPCs (`getCliSessionState`, `getMcpStatus`) to pump pending state.
- MCP context (project, history filter) is shared between the backend and `mcp-server.mjs` exclusively through a JSON file on disk (`/tmp/drift-mcp-<uuid>/mcp-context.json`).
- Tool approvals are communicated from backend → MCP server through a JSON file (`mcp-approvals-<sessionId>.json`). The MCP server polls this file synchronously before executing a sensitive tool.
- Tool activity is reported from MCP server → backend through an append-only JSONL file (`mcp-activity-<sessionId>.jsonl`).
## Layers
- Purpose: User-facing chat interface inside Caido's sidebar panel
- Location: `packages/frontend/src/`
- Contains: Vue SFCs, Pinia stores, chat-context helpers, command/menu registration
- Depends on: `shared` types, Caido Frontend SDK (`@caido/sdk-frontend`), PrimeVue
- Used by: Caido browser host
- Purpose: All business logic — MCP lifecycle, CLI spawning, persistence, event emission
- Location: `packages/backend/src/`
- Contains: Single entry module (`index.ts`) plus helpers in 6 companion modules
- Depends on: `shared` types, Caido backend SDK (`caido:plugin`), Node.js `child_process` / `fs/promises` (shimmed by Caido)
- Used by: Caido plugin host
- Purpose: Standalone JSON-RPC 2.0 MCP server that translates tool calls into Caido GraphQL API requests
- Location: `packages/backend/assets/mcp-server.mjs` (bundled asset, copied to `/tmp` at runtime)
- Contains: 829-line self-contained `.mjs` file — GraphQL client, tool handlers, approval polling, activity logging
- Depends on: `CAIDO_URL`, `CAIDO_TOKEN`, `DRIFT_*` env vars; reads/writes files in `/tmp/drift-mcp-<uuid>/`
- Used by: CLI providers (via `mcp-wrapper.sh`), self-test (via `callMcpMethod`)
- Purpose: Single source of truth for types shared between frontend and backend
- Location: `packages/shared/src/`
- Contains: `MCP_TOOL_DEFINITIONS`, `Settings`, `StoredChat`, `ChatMessage`, event types
- Depends on: nothing (pure TypeScript declarations + constants)
## `startMcpServer` — Full Bootstrap Trace
- Reads `sessionCaidoToken` (set by frontend via `syncCaidoSessionToken` RPC). Aborts if empty.
- Checks `packages/backend/assets/mcp-server.mjs` exists on disk.
- Reads `/tmp` via `readdir("/tmp")` (POSIX: `/tmp` hardcoded).
- Deletes every `/tmp/drift-mcp-*` directory that is not the current `mcpTempDir`.
- Sets `mcpTempDir = /tmp/drift-mcp-<uuid>` (POSIX: `/tmp` hardcoded).
- Creates directory with `mkdir(mcpTempDir, { recursive: true, mode: 0o700 })` — POSIX octal permissions.
- Reads `mcp-server.mjs` from `assetsPath` (Caido-provided plugin asset path).
- Writes copy to `/tmp/drift-mcp-<uuid>/mcp-server.mjs` — needed because the asset path may contain spaces that break some CLI arg parsers.
- Calls `sdk.projects.getCurrent()` and writes `mcp-context.json` to the temp dir.
- Calls `resolveCommand("node")` which spawns `which node` with a 1-second timeout (POSIX: `which` binary).
- Augments `which` result with fallback candidates from `getNodeExecutableCandidates` (`command-resolution.ts:134`): `process.execPath`, sibling `node` in provider binary directories, then hardcoded POSIX paths:
- Serializes `currentCaidoHistoryContext` + `currentCaidoContextOverride` as JSON.
- Writes to `/tmp/drift-mcp-<uuid>/mcp-context.json` (mode inherits from parent dir `0o700`).
- Calls `renderExportExecScript(nodeExecutable, [mcpScriptPath], runtimeEnv, { passThroughArgs: true })`.
- `renderExportExecScript` produces a `#!/bin/bash` script with `export KEY='value'` lines and `exec <cmd> <args> "$@"` (POSIX: `#!/bin/bash` shebang, `exec`, `$@` syntax).
- Writes to `/tmp/drift-mcp-<uuid>/mcp-wrapper.sh.tmp` with mode `0o700` (POSIX octal).
- Spawns `chmod +x <path>` via `spawnAndWait` (POSIX: `chmod` binary).
- Atomically renames `.tmp` → final path.
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
- Spawns `wrapperPath --validate-auth` via `spawnAndWait`.
- The `mcp-server.mjs` handles `--validate-auth` by making a minimal GraphQL call to Caido and returning `{ok: true|false, ...}` as JSON on stdout.
- Sets `mcpAuthState` to `"valid"`, `"invalid"`, or `"error"`.
- For `gemini-cli` and `codex-cli` only (not Claude/Copilot which use `--mcp-config` flags):
## Data Flow
### Primary Turn Flow (Claude Code example)
### MCP Tool Call Flow (inside the spawned CLI)
### Context Sync Flow
### Per-Provider MCP Attachment Strategy
| Provider | MCP attachment method |
|----------|-----------------------|
| Claude Code | `--mcp-config mcp-<chatId>.json` + `--strict-mcp-config`; session wrapper written fresh each turn |
| Gemini CLI | `gemini mcp add drift -- <wrapperPath>` at startup; `--allowed-mcp-server-names drift` per turn |
| Codex CLI | `gemini/codex mcp add drift` at startup; no per-turn flag |
| GitHub Copilot | `--additional-mcp-config @copilot-mcp-<chatId>.json`; config embeds Node path + env dict (no wrapper script) |
- Backend: module-level `let` variables (single-threaded QuickJS). Maps for active processes, session snapshots, watchdogs, runtime files.
- Frontend: Pinia stores (reactivity graph). No shared global state outside stores.
## Key Abstractions
- Purpose: Executable bash script that `export`s all required env vars and `exec`s `node mcp-server.mjs "$@"`
- Location at runtime: `/tmp/drift-mcp-<uuid>/mcp-wrapper.sh` (shared) and `/tmp/drift-mcp-<uuid>/mcp-wrapper-<sessionId>.sh` (per-session)
- Pattern: Generated by `renderExportExecScript` (`index.ts:320`), written atomically via `.tmp` rename
- Purpose: Bash wrapper that `export`s `CAIDO_TOKEN` and tool-policy env vars into the CLI provider subprocess
- Location at runtime: `/tmp/drift-mcp-<uuid>/provider-launch-<sessionId>.sh`
- Pattern: Written via `writeLaunchScript` (`index.ts:299`) when `runtimeFiles !== undefined`
- `mcp-activity-<sessionId>.jsonl` — append-only log of MCP tool events written by `mcp-server.mjs`, read by backend watchdog
- `mcp-approvals-<sessionId>.json` — dictionary of `{ [approvalId]: { approved, decidedAt } }` written by backend, polled by `mcp-server.mjs`
- Both files live in `/tmp/drift-mcp-<uuid>/` and are deleted when the session finalizes
- Path: `/tmp/drift-session-<sessionId>.log` (POSIX `/tmp` hardcoded in `getSessionDebugLogPath`, `index.ts:336`)
- Written only when `currentSettings.debugLogging === true`
## Entry Points
- Location: `packages/backend/src/index.ts:2952`
- Triggers: Caido plugin host on plugin load
- Responsibilities: Sets `pluginPath`/`assetsPath`, initializes SQLite, loads persisted settings+chats, registers all RPC handlers, calls `refreshProjectContext`, subscribes to `sdk.events.onProjectChange`
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
### Module-level mutable singletons for all backend state
## Error Handling
- `spawnAndWait` always resolves (never rejects); exit code is in the returned object.
- `writeMcpWrapper` / `writeLaunchScript` return `undefined` on failure rather than throwing.
- `cleanupMcpRuntime` is called defensively on any setup failure to prevent orphaned temp dirs.
- SQLite operations use `try/catch` and record failures via `recordPersistenceIssue` without surfacing to the user unless critical.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
