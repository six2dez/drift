# Drift - CLI AI Agent for Caido

Drift is a Caido plugin that lets you use locally-installed AI CLI tools (Claude Code, Gemini CLI, Codex CLI, Copilot CLI) directly inside Caido, with MCP integration for full access to Caido's capabilities.

**No API keys needed** - Drift uses the CLI tools already authenticated on your machine.

## Features

- **4 CLI backends**: Claude Code, Gemini CLI, Codex CLI, Copilot CLI (experimental)
- **MCP server**: Exposes 12 Caido tools to CLI agents (search history, replay requests, create findings, manage scope, environments, workflows, intercept)
- **Session resume**: Claude Code maintains multi-turn context via `--resume`
- **Chat persistence**: Conversations are saved and restored across sessions
- **Streaming output**: See CLI responses in real-time
- **Isolated config**: Never modifies your global CLI configuration

## Installation

1. Build the plugin:
   ```bash
   pnpm install
   pnpm build
   ```

2. Install `dist/plugin_package.zip` in Caido via the plugin manager

## Configuration

### CLI Providers

In Drift Settings, configure the command path for each CLI tool. Drift will auto-detect which tools are installed.

### Caido API (for MCP)

To enable MCP tools, you need a Caido Personal Access Token (PAT):

1. Go to Caido Settings > API Keys
2. Generate a new token
3. Enter the token in Drift Settings > Caido API > Token

### MCP Server

Click "Start" in Drift Settings > MCP Server to enable CLI tools to interact with Caido. The server runs on `localhost:9877` by default.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_history` | Search HTTP history with HTTPQL filters |
| `get_request` | Get full raw request/response by ID |
| `send_request` | Send an HTTP request via Caido replay |
| `create_replay_session` | Create replay session from request ID |
| `create_finding` | Create a security finding |
| `list_findings` | List all findings |
| `get_scope` | List scope definitions |
| `check_scope` | Check if URL is in scope |
| `get_environment` | List environments and variables |
| `set_environment` | Set environment variables |
| `run_workflow` | Execute a convert workflow |
| `intercept_control` | Pause/resume/status of intercept |

## Development

```bash
pnpm install
pnpm build    # Build plugin
pnpm watch    # Watch mode
```

## License

MIT
