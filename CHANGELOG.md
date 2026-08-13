# Changelog

All notable changes to Drift are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Deny-by-default MCP allowlist.** Disabling every tool-permission group left the allowlist empty, which the embedded MCP server treated as "allow all" — inverting the user's intent and exposing all tools. Empty now means deny-all (gated behind a `DRIFT_ALLOWLIST_ACTIVE` flag so the unconfigured standalone server still works); Claude's `--allowedTools` no longer falls back to the full tool set either. Covered by new `mcp-server.allowlist.test.ts`.
- **Hardened temp-file handling.** The `/tmp/drift-mcp-<uuid>` dir is created `0o700`, token-bearing wrapper/launch scripts `0o700`, and other token-carrying temp files `0o600`, so other local users can no longer read the Caido session token. Orphaned `drift-mcp-*` dirs from an unclean shutdown are swept on MCP start.

### Fixed

- **Init race.** Settings and chats loaded without being awaited, so an early RPC could clobber freshly-pushed settings or surface an empty chat list (causing the UI to auto-create a chat that hid persisted ones). State handlers now await the initial load.
- **Cross-chat streaming/error bleed.** A turn started in one chat could paint its streaming bubble or error banner into another chat after switching mid-turn. Streaming output and errors are now scoped to the chat that owns the turn.

### Added

- Tool-safety settings now warn when every permission group is disabled, clarifying that the MCP server attaches but exposes no tools.

## [0.1.0] — 2026-04-16

First public release.

### Added

#### CLI + MCP core

- Chat interface that drives four local CLI backends: Claude Code (with session resume via `--session-id`/`--resume`), Gemini CLI, Codex CLI, Copilot CLI.
- Embedded MCP server exposing 18 Caido tools over stdio: `search_history`, `get_current_context`, `list_projects`, `select_project`, `clear_context_override`, `get_request`, `send_request`, `create_replay_session`, `create_finding`, `list_findings`, `get_scope`, `check_scope`, `get_environment`, `set_environment`, `run_workflow`, `intercept_status`, `intercept_pause`, `intercept_resume`.
- Provider maturity classification: Claude Code is **Stable**; Gemini, Codex, and Copilot are **Experimental** (functional but depend on upstream CLI text output).

#### Caido integration

- Command palette entry, sidebar item, and context menus on requests, responses, and request rows (`Review Request`, `Build Test Plan`, `Review Response`, `Inspect JavaScript`).
- Review → Validate → Report chat workflow paradigm with curated prompts for manual web security testing.
- Structured HTTP handoff: analysis actions attach raw request/response material as chat attachments instead of bloating the visible prompt.
- Context-menu action queue: a second action fired during streaming is queued with a toast and drained when the current turn finishes.
- Cancel-safe turns: pressing Stop never duplicates the assistant message even if the provider resolves after SIGTERM.

#### Tool safety

- Per-group MCP capability enables (Read, Replay, Findings, Environment, Intercept, Workflow).
- **Custom approval dialog** (replaces `window.confirm`) for sensitive actions (`send_request`, `create_finding`, `set_environment`, intercept controls, `run_workflow`) with formatted arguments, explicit "Allow once / Allow for session / Deny" buttons, and Esc-to-deny.
- Session approval memory: in-memory only, cleared on session close, restart, or plugin reload.

#### Chat UX

- Empty state with Review / Validate / Report workflow cards to onboard first-time users.
- Workflow grid above the composer auto-collapses after the first message and can be toggled manually.
- **Syntax highlighting** on fenced code blocks (highlight.js + github-dark-dimmed) with prefix-wrapped styles.
- Clickable attachment chip opens a preview modal with the raw HTTP text and a **Copy as curl** button (parses raw HTTP, builds a shell-safe one-liner, skips `Host`/`Content-Length` so curl can rebuild them).
- Sidebar search / filter (title + first-message content when the query is 3+ chars) with a counter and empty state.
- Scroll-to-latest floating indicator: auto-scroll is suppressed when the user has scrolled up, and a floating "New content" button appears to jump to the bottom on demand.
- **Retry** button on the error banner: re-sends the last failed prompt + attachment without requiring the user to re-type.
- **Token usage meter** on Claude replies: parses `usage` from Claude's `stream-json` and renders a `~3.2k in / 1.1k out` footer (cache tokens shown when present).
- Chat persistence via SQLite with JSON file backup; persistence failures surfaced rather than silently swallowed.
- Rename, copy-to-clipboard, and Markdown export per chat.

#### Streaming lifecycle

- Streaming output with real cancellation, spawn-time timeout watchdog, per-chat session lifecycle status.
- Opt-in session debug log written to `/tmp/drift-session-<id>.log` and cleaned up when the session ends.
- MCP activity trace rendered on each assistant reply (tool, group, duration, args / result summary, sensitive badge).

#### Settings and diagnostics

- Live MCP self-test (tool discovery + `get_environment` + `search_history`) per provider from Settings.
- Health check covering provider resolution, Caido auth, MCP runtime, live-test state, and Caido context sync.
- Redacted diagnostics report export (provider status, MCP status, registered CLI paths, effective Caido context, persistence issues, chat / session summaries — no tokens, no secrets).
- In-app Help tab with prerequisites, first-time setup, context-menu walkthrough, chat-turn mechanics, provider maturity notes, troubleshooting cards, and a settings cheat sheet.
- Actionable CLI-not-found messages: the error banner now includes the provider-specific install command (`curl -fsSL claude.ai/install.sh | bash`, `npm install -g @google/gemini-cli`, `npm install -g @openai/codex`, `gh extension install github/gh-copilot`).

#### Documentation

- `docs/SECURITY.md` — threat model, trust boundaries, data flow, attack surface, approval flow, and vulnerability-reporting contact.
- `docs/cookbook.md` — seven worked recipes (IDOR, auth bypass, data-leak audit, weak cookies, JS endpoint discovery, race condition, finding → report).
- README section linking both docs.

#### Infrastructure

- GitHub Actions CI: `pnpm install --frozen-lockfile` + typecheck + vitest + build + `dist/drift.zip` artifact upload on push and PR against `main`.
- `.nvmrc` pinned to Node 20; `engines` and `packageManager` in `package.json`.
- Release metadata aligned: version `0.1.0` in both `package.json` and `caido.config.ts`; repository / bugs / homepage URLs set.

### Changed

- Extracted all provider-specific CLI launch arguments (`claude-cli`, `gemini-cli`, `codex-cli`, `copilot-cli`) into a pure `provider-launch` module with snapshot tests for every provider × MCP-attached combination. Makes regressions in argv surfacable before they ship.
- `loadSetting` / `saveSetting` SQL helpers documented as non-attacker-reachable (keys are hardcoded constants) and centralized their escape logic in an `escapeSqliteLiteral` helper to pre-empt reviewer flags.

### Removed

- Standalone Scanner view and passive / active scanner runners. The plugin is now chat-only; scanner-style workflows are expressed through Validate / Report prompts instead.
- Legacy `drift_scanner_occurrences` SQLite table is dropped on startup for users upgrading from pre-0.1 dev builds.

### Security

- `--allowedTools` is passed to Claude Code spawns with an explicit `mcp__drift__*` allowlist (no wildcards).
- `--disallowedTools` blocks Claude's native filesystem / shell / web tools (`Bash`, `Edit`, `Glob`, `Grep`, `MultiEdit`, `NotebookEdit`, `Read`, `Skill`, `Task`, `TodoWrite`, `ToolSearch`, `WebFetch`, `WebSearch`, `Write`) from being called inside a Drift session.
- Markdown rendered in chat is piped through `markdown-it` with `html: false`, then passed through `DOMPurify.sanitize` before reaching the DOM.
- `CAIDO_TOKEN` values in generated shell wrappers and JSON configs are redacted before being written to the session debug log or included in a diagnostics export.
- Chat persistence strips the in-memory attachment `content` field before saving so HTTP bodies do not land in storage; reloading leaves the chip visible but the preview disabled.
