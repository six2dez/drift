# Changelog

All notable changes to Drift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-16

First public release.

### Added
- Chat interface that drives four local CLI backends: Claude Code (with session resume via `--session-id`/`--resume`), Gemini CLI, Codex CLI, Copilot CLI.
- Embedded MCP server exposing 18 Caido tools over stdio: `search_history`, `get_current_context`, `list_projects`, `select_project`, `clear_context_override`, `get_request`, `send_request`, `create_replay_session`, `create_finding`, `list_findings`, `get_scope`, `check_scope`, `get_environment`, `set_environment`, `run_workflow`, `intercept_status`, `intercept_pause`, `intercept_resume`.
- Caido integration: command palette entry, context menus on requests, responses, and request rows (`Review Request`, `Build Test Plan`, `Review Response`, `Inspect JavaScript`).
- Review → Validate → Report chat workflows with curated prompts for manual web security testing.
- Structured HTTP handoff: analysis actions attach raw request/response material as chat attachments instead of bloating the visible prompt.
- Per-provider tool-safety controls: disable MCP capability groups, optional confirmation for sensitive actions (`send_request`, `create_finding`, `set_environment`, intercept controls, `run_workflow`).
- MCP activity trace rendered on assistant replies.
- Live MCP self-test (tool discovery + `get_environment` + `search_history`) from Settings.
- Health check covering provider resolution, Caido auth, MCP runtime, live-test state, and Caido context sync.
- Chat persistence via SQLite with JSON file backup; persistence issues surfaced instead of silently swallowed.
- Streaming output with real cancellation, spawn-time timeout watchdog, per-chat session lifecycle status, cancel-safe turns, context-menu action queue.
- Opt-in session debug log written to `/tmp/drift-session-<id>.log` and cleaned up when the session ends.
- Redacted diagnostics report export (provider status, MCP status, registered CLI paths, effective Caido context, persistence issues, chat/session summaries — no tokens).
- In-app Help tab with setup, troubleshooting, and prompt examples.

### Removed
- Standalone Scanner view and passive/active scanner runners. The plugin is now chat-only; scanner-style workflows are expressed through the Validate/Report chat prompts instead.
- Legacy `drift_scanner_occurrences` SQLite table is dropped on startup for users upgrading from pre-0.1 dev builds.

### Security
- `--allowedTools` is passed to Claude Code spawns with an explicit `mcp__drift__*` allowlist rather than a wildcard.
- Markdown rendered in chat is piped through `markdown-it` with `html: false` and `DOMPurify.sanitize` before insertion into the DOM.
- `CAIDO_TOKEN` values in generated shell wrappers and JSON configs are redacted before being written to the session debug log.
