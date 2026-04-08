# Drift - CLI AI Agent for Caido

Drift lets you use locally-installed AI CLI tools (Claude Code, Gemini CLI, Codex CLI, Copilot CLI) directly inside Caido, with MCP integration for full access to Caido's security testing capabilities.

**No API keys needed** - uses CLI tools already authenticated on your machine.

## Features

- **4 CLI backends**: Claude Code (with session resume), Gemini CLI, Codex CLI, Copilot CLI (experimental)
- **MCP tools**: 14 Caido tools exposed to CLI agents via stdio MCP transport
- **Caido integration**: command palette, context menus on requests/responses, "Send to Drift" and "Ask Drift about this request"
- **Chat persistence**: conversations saved across sessions
- **Streaming output**: real-time CLI response display
- **Process management**: real cancellation, timeout handling

## Installation

```bash
pnpm install
pnpm build
```

Install `dist/plugin_package.zip` in Caido via Plugins > Install from file.

## Configuration

### CLI Providers

In Settings, set the command path for each CLI tool. Use full paths (e.g., `/Users/you/.local/bin/claude`) if the tool isn't in Caido's inherited PATH.

**Provider support:**

| Provider | Resume | MCP | Status |
|----------|--------|-----|--------|
| Claude Code | Yes (`--session-id`/`--resume`) | Yes (per-invocation stdio config) | Stable |
| Gemini CLI | No | Experimental (registered wrapper) | Experimental |
| Codex CLI | No | Experimental (registered wrapper) | Experimental |
| Copilot CLI | No | Experimental (`--additional-mcp-config`) | Experimental |

### MCP Server (for Claude Code)

To give Claude access to Caido tools:

1. Set your Caido PAT in Settings > Caido API > Token
2. Click Settings > MCP Server > Start
3. Chat with Claude - it will have access to 14 Caido tools

### MCP Tools

| Tool | Description |
|------|-------------|
| `search_history` | Search HTTP history with HTTPQL filters |
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

## Known Limitations

- Settings reset on plugin reinstall (stored in plugin directory)
- Session resume only works with Claude Code
- Non-Claude MCP integrations are experimental
- Caido's QuickJS backend runtime restricts available Node.js modules

## Development

```bash
pnpm install
pnpm build    # Build plugin
pnpm watch    # Watch mode
```

## License

MIT
