# Drift - Security copilot / MCP assistant for Caido

Drift runs locally-installed AI CLI tools (Claude Code, Gemini CLI, Codex CLI, Copilot CLI) inside Caido with live access to your Caido session via an embedded MCP server.

**No API keys needed** — Drift uses CLI tools already authenticated on your machine. Every chat turn runs against a local CLI; traffic never leaves your box for a remote LLM-hosting service.

## Features

- **4 CLI backends**: Claude Code (with session resume), Gemini CLI, Codex CLI, Copilot CLI
- **MCP tools**: 18 Caido tools exposed to every provider via stdio
- **Caido integration**: command palette, context menus on requests/responses ("Review Request", "Build Test Plan", "Review Response", "Inspect JavaScript")
- **Structured HTTP handoff**: analysis actions keep the visible prompt short and attach raw request/response material as a separate chat attachment
- **Context visibility**: the header shows the current Caido UI context plus any explicit MCP project override
- **Tool safety**: per-group enables plus optional confirmation for sensitive MCP actions (`send_request`, `create_finding`, `set_environment`, intercept controls, `run_workflow`)
- **MCP activity trace**: assistant replies show which Caido tools were called and how they ended
- **Live MCP test**: Settings can verify tool discovery plus live `get_environment` and `search_history` calls before you trust a provider session
- **Chat persistence**: conversations saved via SQLite with JSON backup; persistence failures surfaced rather than silently swallowed
- **Streaming output** with real cancellation, a spawn-time timeout watchdog, and per-chat session lifecycle status
- **Cancel-safe turns**: pressing Stop never duplicates the assistant message even if the provider resolves after SIGTERM
- **Context-menu queue**: a context-menu action fired while another turn is streaming is queued with a toast, drained when the current turn finishes, and cleared if you press Stop
- **In-app Help tab**: prerequisites, setup walkthrough, troubleshooting, prompt examples
- **Diagnostics report**: one-click copy/download of a redacted diagnostics bundle for bug reports
- **Session debug log (opt-in)**: a checkbox in Settings > Process streams per-session provider lifecycle events to `/tmp/drift-session-<id>.log` and deletes the file when the session ends

## Installation

```bash
pnpm install
pnpm build
```

Install `dist/drift.zip` in Caido via Plugins > Install from file.

## Configuration

### CLI Providers

In Settings, set the command path for each CLI tool. Drift first tries the configured command via Caido's inherited `PATH`, then probes common install locations (Homebrew, `~/.local/bin`, Volta, asdf, nvm, fnm). On Windows it probes the Windows equivalents instead — the roaming application-data npm prefix, the user profile's local binary directory, and the usual version-manager and package-manager locations; the full catalogue lives in the source beside its citations rather than being duplicated here. Use a full path (for example `/Users/you/.local/bin/claude`) to pin a specific binary explicitly.

| Provider | Resume | MCP | Status |
|----------|--------|-----|--------|
| Claude Code | Yes (`--session-id`/`--resume`) | Yes (per-invocation stdio config) | **Stable** — structured `stream-json` parser, dedicated tests, watchdog recovery |
| Gemini CLI | No | Yes — `gemini mcp add --scope user` writes the validated `node` executable, the Drift MCP server script and an explicit `--env` environment into `~/.gemini/settings.json` | **Experimental** — text output; the entry is written on start and removed on stop. Approvals and the MCP activity trace work here: Gemini forwards its own process environment to the stdio MCP servers it starts, so Drift's per-session keys arrive. That is established by reading gemini-cli's source, not by measuring an installed binary on a machine — and its environment sanitisation is tightening upstream (google-gemini/gemini-cli#28863), so treat the channel as best-effort rather than guaranteed. |
| Codex CLI | No | Yes — `codex mcp add` writes the validated `node` executable, the Drift MCP server script and an explicit `--env` environment into `~/.codex/config.toml` | **Experimental** — text output. Drift is registered with Codex CLI and Codex can use Drift's read-only tools, but Codex builds a clean environment for the MCP servers it starts, so Drift cannot deliver approval prompts to it and sensitive tools are turned off. That is a positive result read out of Codex's own source, not a measurement and not an inconclusive probe. |
| Copilot CLI | No | Yes (`--additional-mcp-config`) | **Experimental** — text output, per-chat MCP config file |

All four providers share the same MCP/runtime contract: if a provider is enabled and installed, Drift exposes the same effective Caido context model and the same live-test semantics, and Drift starts the MCP server the same way for each — the validated `node` executable plus the server script plus an explicit environment, never a generated shell script. The one difference is the tool set: Codex is offered the read-only tools only, for the reason its row gives. The **Experimental** providers are functional today but depend on their upstream CLI's text output; an upstream change can break parsing silently. Run **Settings → MCP Server → Run Self-Test** against each provider before trusting it for production work.

**After a crash or a hard kill, a Drift entry can survive in an external CLI's configuration.** Drift removes its `drift` entry from `~/.gemini/settings.json` and `~/.codex/config.toml` when a session ends, but a Drift that is killed outright never runs that cleanup. The Codex entry carries your Caido session token in plain text (the Gemini entry carries a `${CAIDO_TOKEN}` reference, not the token bytes). The next Drift start sweeps both CLIs unconditionally — every scope Drift has ever written, before it registers anything — so the leftover entry is removed then. To remove it by hand instead, run the same commands Drift prints if a removal fails: `gemini mcp remove --scope user drift`, `gemini mcp remove --scope project drift`, and `codex mcp remove drift`.

### MCP Server

1. Open Drift inside an authenticated Caido UI session — Drift picks up your active Caido session token automatically, no manual auth setup required.
2. Click Settings > MCP Server > Start.
3. Open a new chat after MCP is running. Drift mirrors the currently selected Caido project plus the active HTTP History preset/query/scope for history searches, and exposes an explicit project override when an MCP tool selects a different project.
4. Use **Run Self-Test** in Settings if you want Drift to verify tool discovery plus live `get_environment` and `search_history` calls before chatting.
5. Use **Health check** in Settings to run the preflight checklist, and **Diagnostics** to copy or download a redacted diagnostics report if something fails.

Registration of the Drift MCP server into each external tool's config file (Gemini, Codex) respects the command path you configured and the provider's `enabled` flag. Cleanup does not depend on Drift remembering what it wrote: every Drift start removes the `drift` entry from both CLIs across every scope Drift has ever written, before it registers anything, and a removal that exits non-zero is reported as a security line carrying the exact command to run by hand. What that does not cover is the window between a hard kill and the next start — see the note under the provider table. The diagnostics report surfaces the registered CLI paths, any CLIs Drift intentionally skipped, and any removal that failed.

### Operational UX

- **Health check** checks provider resolution, Caido auth, MCP runtime state, live-test results, and current Caido context sync in one place.
- **Tool safety** lets you disable MCP capability groups and require confirmation before sensitive actions such as findings, environment changes, replay, intercept, or workflow mutations.
- **Diagnostics report** exports provider status, MCP status, registered CLI paths, effective Caido context, persistence issues, and chat/session summaries without including tokens or secrets.
- **Session lifecycle** in chat makes it visible whether the current chat has a live provider session, whether MCP was attached to the last turn, and why the last turn stopped or failed.
- **Chat workflows** emphasize review, validation, and reporting instead of broad scan-style prompts, with better automatic titles for request/response-driven chats.
- **Chat polish** includes rename, copy/export, delete confirmation, and workflow-oriented empty states and composer presets.
- **Session debug log (opt-in)** Settings > Process exposes a checkbox that, when enabled, streams per-line provider lifecycle events to `/tmp/drift-session-<id>.log` and deletes the file when the session ends. Off by default — no trace is written and nothing is buffered in memory until you flip it on.

### Prompt examples

- `Review this HTTP request as a manual security tester. Summarize what it does and propose the next 3 tests to run in Caido.`
- `Help me validate a security hypothesis in the active Caido context. Build a focused test plan with payloads and confirmation criteria.`
- `Draft a structured security finding from the current hypothesis or evidence.`
- `I'm not seeing the expected Caido tools or context. Summarize the MCP/session state and tell me the next recovery step.`

### Live test semantics

A passed live test means Drift could start the selected provider against the real MCP contract, discover tools, call `get_environment`, and run `search_history(limit: 1)` with the current auth/context. It does **not** prove every mutating tool, every approval flow, or every provider prompt shape.

### Context override semantics

Drift mirrors the active Caido UI project/filter/query/scope by default. If an MCP tool explicitly selects a different project, Drift keeps using that override until it is cleared. While the override is active, the override project wins and any incompatible history scope is cleared rather than guessed.

### Common recovery paths

| Symptom | Next step |
|---------|-----------|
| Provider unavailable | Fix the command path in Settings > CLI Providers or disable that provider |
| MCP auth failed | Open any Caido page to refresh the session token and retry |
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
- **Request context menu**: "Review Request", "Build Test Plan"
- **Response context menu**: "Review Response", "Inspect JavaScript"
- **Request row context menu** (history, sitemap): "Review Request", "Build Test Plan"

The analysis actions keep the visible user prompt short and send the raw HTTP request/response as a structured attachment for provider analysis. If you trigger an action while another turn is already streaming, Drift queues it (with a toast) and fires it as soon as the current turn finishes; pressing Stop drops anything still queued so it cannot fire after a cancel.

## Known Limitations

- Settings persist via SQLite when available, with JSON file backup
- Session resume only works with Claude Code
- Caido's QuickJS backend runtime restricts available Node.js modules

## Screenshots

<img width="3116" height="1955" alt="Screenshot 2026-04-20 at 17 58 17" src="https://github.com/user-attachments/assets/c3134a52-ce92-42f0-9f38-2b66c3fe0891" />
<img width="3117" height="1948" alt="Screenshot 2026-04-20 at 17 59 38" src="https://github.com/user-attachments/assets/0c6b50ac-0736-4447-a3f8-b3cb8cc4be53" />


## Development

```bash
pnpm install
pnpm build              # Build plugin (produces dist/drift.zip)
pnpm watch              # Caido dev watch mode
pnpm -r typecheck       # Type-check shared, backend, and frontend workspaces
pnpm exec vitest run    # Run the full unit + Vue mount test suite
```

The frontend tests use `@vue/test-utils` with `happy-dom` to mount `ChatView` against a stubbed Caido SDK and Pinia stores. Coverage includes the cancel-race guard, the context-menu queue drain, and the queue-clear-on-cancel path.

Backend tests cover Claude print-mode parsing, command resolution, MCP runtime, persistence, and live MCP transport semantics.

## Release QA checklist

1. **Provider resolution:** in Settings, confirm Claude, Gemini, Codex, and Copilot resolve correctly or are intentionally disabled.
2. **Health check:** run Health check and verify provider checks, Caido auth, MCP runtime, live-test state, and context sync.
3. **Per-provider chat smoke:** for each enabled provider, start a fresh chat and verify a review or validation prompt returns the expected project/filter/scope-aware answer and that MCP activity is shown on the reply.
4. **Structured HTTP handoff:** use a request/response context-menu review action and verify the attachment chip appears in chat and the reply reflects the attached material.
5. **Cancel race:** start a long-running turn, press Stop mid-stream, and confirm only a single `[Cancelled]` assistant message appears (no late duplicate when the provider eventually exits).
6. **Context-menu queue:** while a turn is streaming, fire two analysis actions on different requests; confirm the toast, that queued prompts run sequentially after the active turn, and that pressing Stop drops anything still queued.
7. **Session debug log:** with the flag off (default), confirm `/tmp/drift-session-*.log` is not created during a turn. Toggle it on, run a turn, end the session, and confirm the log file is removed.
8. **MCP registration footprint:** with Gemini disabled, start MCP and confirm `~/.gemini/settings.json` is not mutated. Enable Gemini with a specific command path, start MCP, confirm `mcpServers.drift` was registered against that exact path. Disable Gemini, stop MCP, and confirm the entry is cleaned up (the tracked-paths map ignores the current `enabled` flag).
9. **Diagnostics:** export a diagnostics report and confirm it contains provider/MCP/registered-paths/chat data without secrets.
10. **Tests:** `pnpm -r typecheck` and `pnpm exec vitest run` both pass.

## Documentation

- **[docs/SECURITY.md](docs/SECURITY.md)** — threat model, data flow, attack surface, and how to report vulnerabilities.
- **[docs/cookbook.md](docs/cookbook.md)** — 7 real workflow recipes (IDOR, auth bypass, data-leak audit, JS endpoint discovery, race conditions, finding → report).

## License

MIT
