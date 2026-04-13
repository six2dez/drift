# Drift - CLI AI Agent for Caido

Drift lets you use locally-installed AI CLI tools (Claude Code, Gemini CLI, Codex CLI, Copilot CLI) directly inside Caido, with MCP integration for full access to Caido's security testing capabilities.

**No API keys needed** - uses CLI tools already authenticated on your machine.

## Features

- **4 CLI backends**: Claude Code (with session resume), Gemini CLI, Codex CLI, Copilot CLI
- **MCP tools**: 18 Caido tools exposed to CLI agents via stdio MCP transport
- **Caido integration**: command palette, context menus on requests/responses, "Send to Drift" and "Ask Drift about this request"
- **Context visibility**: Drift shows the current Caido UI context plus any explicit MCP project override
- **Tool safety controls**: permission groups plus optional confirmation for sensitive MCP actions
- **MCP activity trace**: assistant replies show which Caido tools were called and how they ended
- **Live MCP test**: Settings can verify tool discovery and safe live Caido tool calls before you trust a provider session
- **Diagnostics report export**: one-click copy/download of redacted diagnostics for bug reports and support
- **Structured HTTP handoff**: context-menu actions attach raw request/response material separately from the user prompt
- **Chat persistence**: conversations saved across sessions, and persistence failures are surfaced instead of being silently ignored
- **Streaming output**: real-time CLI response display
- **Process management**: real cancellation, timeout handling, and per-chat session lifecycle status

## Installation

```bash
pnpm install
pnpm build
```

Install `dist/drift.zip` in Caido via Plugins > Install from file.

## Configuration

### CLI Providers

In Settings, set the command path for each CLI tool. Drift first tries the configured command via Caido's inherited `PATH`, then probes common install locations such as Homebrew, `~/.local/bin`, Volta, asdf, nvm, and fnm. Use a full path (for example, `/Users/you/.local/bin/claude`) if you want to pin a specific binary explicitly.

**Provider support:**

| Provider | Resume | MCP | Status |
|----------|--------|-----|--------|
| Claude Code | Yes (`--session-id`/`--resume`) | Yes (per-invocation stdio config) | Stable |
| Gemini CLI | No | Yes (registered wrapper) | Supported |
| Codex CLI | No | Yes (registered wrapper) | Supported |
| Copilot CLI | No | Yes (`--additional-mcp-config`) | Supported |

### MCP Server

To expose Caido tools to supported providers:

1. Open Drift inside an authenticated Caido UI session (Drift will use the current Caido session token automatically)
2. Click Settings > MCP Server > Start
3. If automatic session auth is unavailable, set a manual fallback token in Settings > Caido API > Token
4. Open a new chat after MCP is running. All supported providers will use the same Drift MCP surface. Drift mirrors the currently selected Caido project plus the active HTTP History preset/query/scope for history searches, and can expose an explicit project override when an MCP tool selects a different project.
5. Use **Run Self-Test** in Settings if you want Drift to verify tool discovery plus live `get_environment` and `search_history` calls before chatting.
6. Use **Health check** in Settings to run the preflight checklist, and **Diagnostics** to copy or download a redacted diagnostics report if something fails.

All four providers share the same MCP/runtime contract in v1: if a provider is enabled and installed, Drift exposes the same 18 MCP tools, the same effective Caido context model, and the same live-test semantics.

### Operational UX

- **Health check** checks provider resolution, Caido auth, MCP runtime state, live-test results, and current Caido context sync in one place.
- **Tool safety** lets you disable MCP capability groups and require confirmation before sensitive actions such as findings, environment changes, replay, intercept, or workflow mutations.
- **Diagnostics report** exports provider status, MCP status, effective context, persistence issues, and chat/session summaries without including tokens or secrets.
- **Session lifecycle** in chat makes it visible whether the current chat has a live provider session, whether MCP was attached to the last turn, and why the last turn stopped or failed.
- **Chat polish** includes rename, copy/export, delete confirmation, and better automatic titles for request/response-driven chats.

### Prompt examples

- `Show me the last 5 requests in the active Caido context and summarize anything interesting.`
- `Use get_current_context and explain the current project, filter, scope, and whether an override is active.`
- `Analyze this attached HTTP request for auth, access-control, injection, SSRF, and sensitive-data issues.`
- `I'm not seeing the expected Caido tools or context. Summarize the MCP/session state and tell me the next recovery step.`

### Live test semantics

A passed live test means Drift could start the selected provider against the real MCP contract, discover tools, call `get_environment`, and run `search_history(limit: 1)` with the current auth/context. It does **not** prove every mutating tool, every approval flow, or every provider prompt shape.

### Context override semantics

Drift mirrors the active Caido UI project/filter/query/scope by default. If an MCP tool explicitly selects a different project, Drift keeps using that override until it is cleared. While the override is active, the override project wins and any incompatible history scope is cleared rather than guessed.

### Common recovery paths

| Symptom | Next step |
|---------|-----------|
| Provider unavailable | Fix the command path in Settings > CLI Providers or disable that provider |
| MCP auth failed | Reauthenticate in Caido, then retry. If needed, set a manual fallback token |
| History/context looks wrong | Run `get_current_context`, clear any override, and rerun the Health check |
| Provider session feels stuck | Restart or close the chat session from the chat header |
| You need support evidence | Export the diagnostics report from Settings > Diagnostics |

### MCP Tools

| Tool | Description |
|------|-------------|
| `search_history` | Search HTTP history with HTTPQL filters while applying the effective Drift context (Caido UI context plus any active override) |
| `get_current_context` | Show the current UI context, override context, and effective context Drift is using |
| `list_projects` | List Caido projects and indicate the current UI-selected project |
| `select_project` | Set an explicit Drift project override for MCP tool calls |
| `clear_context_override` | Clear the explicit Drift project override and return to the Caido UI context |
| `get_request` | Get full raw request/response by ID |
| `send_request` | Send HTTP request via Caido replay |
| `create_replay_session` | Create replay session from request ID |
| `create_finding` | Create a security finding |
| `list_findings` | List all findings |
| `get_scope` | List scope definitions |
| `check_scope` | Check if URL is in scope |
| `get_environment` | List environments and variables |
| `set_environment` | Set environment variables |
| `run_workflow` | Execute a convert workflow |
| `intercept_status` | Get intercept proxy status |
| `intercept_pause` | Pause HTTP intercept |
| `intercept_resume` | Resume HTTP intercept |

## Caido Integration

- **Command Palette** (Ctrl/Cmd+Shift+P): "Open Drift"
- **Request context menu**: "Send Request to Drift", "Ask Drift about this request"
- **Response context menu**: "Send Response to Drift"
- **Request row context menu**: "Send Request to Drift"

Context-menu actions keep the visible user prompt short and send the raw HTTP request/response as a structured attachment for provider analysis.

## Known Limitations

- Settings persist via SQLite when available, with JSON file backup
- Session resume only works with Claude Code
- Caido's QuickJS backend runtime restricts available Node.js modules

## Development

```bash
pnpm install
pnpm build    # Build plugin
pnpm watch    # Watch mode
```

## Release QA checklist

1. **Provider resolution:** in Settings, confirm Claude, Gemini, Codex, and Copilot resolve correctly or are intentionally disabled.
2. **Health check:** run Health check and verify provider checks, Caido auth, MCP runtime, live-test state, and context sync.
3. **Per-provider smoke test:** for each enabled provider, start a fresh chat and verify:
   - `Use get_current_context...` returns the expected project/filter/scope state.
   - `Show me the last 5 requests...` returns history from the active effective context.
   - MCP activity is shown on the assistant reply.
4. **Structured HTTP handoff:** use a request/response context-menu action and verify the attachment chip appears in chat and the reply reflects the attached material.
5. **Session controls:** cancel a turn, restart a session, and close a session; confirm the status line explains what happened.
6. **Diagnostics:** export a diagnostics report and confirm it contains provider/MCP/context/session data without secrets.

## License

MIT
