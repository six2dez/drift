# Codebase Structure

**Analysis Date:** 2026-06-26

## Directory Layout

```
drift/                              # Repo root
├── caido.config.ts                 # Caido plugin manifest + Vite/PostCSS config
├── package.json                    # Root pnpm workspace
├── pnpm-workspace.yaml             # Declares packages/*
├── pnpm-lock.yaml
├── tsconfig.json                   # Root TS config (references)
├── vitest.config.ts                # Root vitest config (covers all packages)
├── .planning/
│   └── codebase/                   # GSD analysis documents (this file)
├── docs/                           # User-facing documentation
├── dist/                           # Caido plugin build output (gitignored)
└── packages/
    ├── backend/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── assets/
    │   │   └── mcp-server.mjs      # Standalone MCP server (bundled Node.js script)
    │   └── src/
    │       ├── index.ts            # All RPC handlers, state, init() — 3005 lines
    │       ├── mcp-runtime.ts      # Pure helpers: tool policy, context serde, self-test
    │       ├── command-resolution.ts # Binary resolution: which, version managers, paths
    │       ├── provider-launch.ts  # Pure arg-builders per CLI provider
    │       ├── claude-print.ts     # Parser for Claude Code stream-json output
    │       ├── persistence.ts      # SQLite handle wrapper
    │       └── *.test.ts           # Co-located vitest unit tests
    ├── frontend/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts            # Frontend init: mount Vue, register Caido commands/menus
    │       ├── types.ts            # FrontendSDK type alias
    │       ├── chat-context.ts     # Pending chat input queue (context menu → chat)
    │       ├── chat-workflows.ts   # Canned security prompts (REVIEW_REQUEST_PROMPT etc.)
    │       ├── markdown-it.d.ts    # Type shim for markdown-it
    │       ├── plugins/
    │       │   └── sdk.ts          # Vue plugin: provide/inject for FrontendSDK
    │       ├── stores/
    │       │   ├── chat.ts         # useChatStore: chats, sessions, streaming state
    │       │   ├── settings.ts     # useSettingsStore: settings, MCP status, providers
    │       │   └── approvals.ts    # useApprovalsStore: pending tool approval queue
    │       ├── views/
    │       │   ├── App.vue         # Root Vue component: tab/view router
    │       │   ├── ChatView.vue    # Main chat UI: send, stream, approvals, session
    │       │   ├── SettingsView.vue # Provider + MCP config UI
    │       │   └── HelpView.vue    # Help/docs panel
    │       ├── components/
    │       │   └── chat/
    │       │       ├── ChatInput.vue        # Message composer + HTTP attachment
    │       │       ├── ChatSidebar.vue      # Chat list/management sidebar
    │       │       ├── MessageList.vue      # Scrollable message history
    │       │       ├── MessageBubble.vue    # Single message with MCP activity
    │       │       ├── CliStatus.vue        # Session state badge
    │       │       ├── ApprovalDialog.vue   # MCP tool confirmation modal
    │       │       └── AttachmentPreview.vue # HTTP context preview panel
    │       ├── styles/
    │       │   └── index.css       # Tailwind + custom CSS (scoped via #plugin--drift)
    │       └── utils/
    │           ├── http-parse.ts   # HTTP request/response text parser
    │           └── promise-timeout.ts # withTimeout() helper
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts            # Re-exports all shared modules
            ├── cli-providers.ts    # CliProvider enum, display names, default commands
            ├── mcp.ts              # MCP_TOOL_DEFINITIONS, permission types, McpServerInfo
            ├── messages.ts         # ChatMessage, StoredChat, CliSessionStateEvent, events
            ├── result.ts           # Result<T> type (if present; inline in backend too)
            └── settings.ts         # Settings type + DEFAULT_SETTINGS
```

## Directory Purposes

**`packages/backend/src/`:**
- Purpose: Backend plugin code running in Caido's QuickJS runtime
- Contains: One large entry module (`index.ts`) plus five focused helper modules; all test files co-located
- Key files: `index.ts` (3005 lines — all RPC API handlers and module-level state), `mcp-runtime.ts` (pure helpers, no I/O)

**`packages/backend/assets/`:**
- Purpose: Static files bundled with the plugin and served by Caido
- Contains: `mcp-server.mjs` — the Node.js MCP server copied into `/tmp` at runtime
- Key constraint: File is self-contained (no `node_modules`); deps are inlined or use Node.js builtins only

**`packages/frontend/src/stores/`:**
- Purpose: All reactive state for the Vue frontend
- Contains: Three Pinia stores covering chats, settings/MCP, and approvals

**`packages/frontend/src/views/`:**
- Purpose: Top-level Vue page components
- Contains: `ChatView.vue` (primary), `SettingsView.vue`, `HelpView.vue`, plus `App.vue` router shell

**`packages/frontend/src/components/chat/`:**
- Purpose: Reusable chat-scoped Vue components
- Contains: All UI building blocks — input, messages, sidebar, MCP dialogs

**`packages/shared/src/`:**
- Purpose: Zero-dependency TypeScript types and constants imported by both frontend and backend
- Key constraint: Must not import from frontend or backend; cannot use Zod or any runtime that differs between environments

**`dist/`:**
- Purpose: Final Caido plugin bundle output
- Generated: Yes — by `caido-dev build`
- Committed: No

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents used by `/gsd-plan-phase` and `/gsd-execute-phase`
- Generated: Yes — by `/gsd-map-codebase`
- Committed: Yes

## Key File Locations

**Entry Points:**
- `packages/backend/src/index.ts:2952` — backend `init(sdk)` called by Caido on plugin load
- `packages/frontend/src/index.ts:32` — frontend `init(sdk)` called by Caido browser host

**MCP Runtime Core:**
- `packages/backend/src/index.ts:1694` — `startMcpServer()` — full MCP bootstrap
- `packages/backend/src/index.ts:1847` — `sendCliMessage()` — CLI spawn + watchdog
- `packages/backend/src/index.ts:320` — `renderExportExecScript()` — bash wrapper generator
- `packages/backend/src/index.ts:743` — `writeMcpWrapper()` — MCP wrapper writer
- `packages/backend/src/index.ts:299` — `writeLaunchScript()` — provider launch script writer

**Binary Resolution:**
- `packages/backend/src/command-resolution.ts:105` — `getCommandExecutableCandidates()`
- `packages/backend/src/command-resolution.ts:134` — `getNodeExecutableCandidates()`
- `packages/backend/src/index.ts:848` — `resolveCommand()` — `which` + candidate probe

**Provider Args:**
- `packages/backend/src/provider-launch.ts:29` — `buildClaudeLaunchArgs()`
- `packages/backend/src/provider-launch.ts:57` — `buildGeminiLaunchArgs()`
- `packages/backend/src/provider-launch.ts:66` — `buildCodexLaunchArgs()`
- `packages/backend/src/provider-launch.ts:74` — `buildCopilotLaunchArgs()`

**MCP Server (subprocess):**
- `packages/backend/assets/mcp-server.mjs` — 829-line standalone Node.js MCP server

**Shared Types:**
- `packages/shared/src/mcp.ts` — `MCP_TOOL_DEFINITIONS`, `McpServerInfo`, permission types
- `packages/shared/src/messages.ts` — `ChatMessage`, `StoredChat`, `CliSessionStateEvent`
- `packages/shared/src/settings.ts` — `Settings`, `DEFAULT_SETTINGS`
- `packages/shared/src/cli-providers.ts` — `CliProvider` enum

**Configuration:**
- `caido.config.ts` — plugin manifest, Vite config, asset glob, CSS scoping via `#plugin--drift`
- `vitest.config.ts` — test runner config (covers all packages)
- `tsconfig.json` — root TypeScript project references

## Naming Conventions

**Files:**
- Backend helpers: `kebab-case.ts` (e.g. `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`)
- Test files: `<module>.test.ts` co-located with implementation (e.g. `command-resolution.test.ts`)
- Vue components: `PascalCase.vue` (e.g. `ChatView.vue`, `ApprovalDialog.vue`)
- Pinia stores: `camelCase.ts` (e.g. `chat.ts`, `settings.ts`)

**Functions (backend):**
- RPC handlers: `verbNoun` camelCase (e.g. `startMcpServer`, `sendCliMessage`, `getProviderStatuses`)
- Pure helpers: descriptive camelCase (e.g. `renderExportExecScript`, `buildMcpRuntimeEnv`, `extractHomeDir`)
- Internal helpers: verb-first camelCase (e.g. `writeMcpWrapper`, `validateCaidoAuth`, `sweepOrphanedMcpTempDirs`)

**Types:**
- Shared types: PascalCase (e.g. `McpServerInfo`, `StoredChat`, `CliSessionStateEvent`)
- Const enums: `SCREAMING_SNAKE_CASE` for arrays/constants (e.g. `MCP_TOOL_DEFINITIONS`, `DEFAULT_SETTINGS`)

**Runtime files (in `/tmp/drift-mcp-<uuid>/`):**
| File | Pattern |
|------|---------|
| MCP server script | `mcp-server.mjs` |
| MCP context | `mcp-context.json` |
| Shared MCP wrapper | `mcp-wrapper.sh` |
| Per-session wrapper | `mcp-wrapper-<sessionId>.sh` |
| Claude MCP config | `mcp-<chatId>.json` |
| Copilot MCP config | `copilot-mcp-<chatId>.json` |
| Provider launch script | `provider-launch-<sessionId>.sh` |
| Activity log | `mcp-activity-<sessionId>.jsonl` |
| Approvals file | `mcp-approvals-<sessionId>.json` |
| Self-test launcher | `mcp-self-test-<requestId>.sh` |
| Diagnostic write test | `test-diag.json` |

## Where to Add New Code

**New MCP tool (in the MCP server):**
- Add the tool definition to `packages/shared/src/mcp.ts:MCP_TOOL_DEFINITIONS`
- Implement the handler in `packages/backend/assets/mcp-server.mjs` following the existing tool handler pattern
- Update `MCP_SELF_TEST_CHECKS` in `packages/backend/src/mcp-runtime.ts` if a new self-test check is needed

**New CLI provider:**
- Add the provider ID to `packages/shared/src/cli-providers.ts:CliProvider`
- Add arg builder to `packages/backend/src/provider-launch.ts` following existing `build*LaunchArgs` pattern
- Add a `case` in the `switch (providerId)` block in `sendCliMessage` (`index.ts:1920`)
- Add MCP registration logic in `tryRegisterMcpForProviders` if the provider supports `mcp add` subcommands
- Add system prompt case in the `isFirstMsg` block (`index.ts:2034`)

**New backend RPC handler:**
- Define the function with signature `async function myHandler(sdk: BackendSDK, input: MyInput): Promise<Result<MyOutput>>`
- Add the type to `export type API = DefineAPI<{...}>` at `index.ts:2927`
- Register with `sdk.api.register("myHandler", myHandler)` in `init()` at `index.ts:2976`

**New frontend RPC call:**
- The `API` type from `packages/backend/src/index.ts` is re-exported as `"backend"` and consumed via `FrontendSDK` in `packages/frontend/src/types.ts`
- Call via `sdk.backend.myHandler(input)` — fully typed

**New Pinia store:**
- Create `packages/frontend/src/stores/<name>.ts` following the `defineStore("name", () => { ... })` setup-store pattern
- Provide the SDK via `useSDK()` (injected by `SDKPlugin` in `packages/frontend/src/plugins/sdk.ts`)

**New Vue component:**
- Place in `packages/frontend/src/components/chat/` for chat-specific UI
- Place in `packages/frontend/src/components/` for shared UI (currently none)
- Follow `PascalCase.vue` naming; co-locate test as `PascalCase.test.ts`

**Shared type/constant:**
- Add to the appropriate file in `packages/shared/src/`
- Re-export from `packages/shared/src/index.ts` if new file is created
- Do NOT use Zod or any runtime-only library — shared code runs in both QuickJS (backend) and V8 (frontend)

**Binary resolution fallback paths:**
- Add to `getCommandExecutableCandidates` or `getNodeExecutableCandidates` in `packages/backend/src/command-resolution.ts`
- New paths must be POSIX-format unless a Windows port changes the strategy

## Special Directories

**`packages/backend/assets/`:**
- Purpose: Files served as plugin assets by Caido
- Generated: `mcp-server.mjs` is hand-authored (not bundled from TS sources)
- Committed: Yes
- Runtime use: Backend reads `sdk.meta.assetsPath()` to find the directory, copies `mcp-server.mjs` to `/tmp` on `startMcpServer`

**`dist/`:**
- Purpose: Caido plugin bundle (`.zip` or directory)
- Generated: Yes — `pnpm build` via `caido-dev`
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: pnpm hoisted dependencies
- Generated: Yes — `pnpm install`
- Committed: No

---

*Structure analysis: 2026-06-26*
