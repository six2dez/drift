# Drift - AI agents + scanner for Caido

Drift runs locally-installed AI CLI tools (Claude Code, Gemini CLI, Codex CLI, Copilot CLI) inside Caido with live access to your Caido session via an embedded MCP server, and ships AI-driven passive + active scanners that write findings directly to Caido's native Findings panel.

**No API keys needed** — Drift uses CLI tools already authenticated on your machine. Every chat turn and every scanner job runs against a local CLI; traffic never leaves your box for a remote LLM-hosting service.

## Features

### Chat

- **4 CLI backends**: Claude Code (with session resume), Gemini CLI, Codex CLI, Copilot CLI
- **MCP tools**: 18 Caido tools exposed to every provider via stdio
- **Caido integration**: command palette, context menus on requests/responses ("Analyze Request", "Find Vulnerabilities", "Analyze Response", "Analyze JavaScript", "Active scan this request")
- **Structured HTTP handoff**: analysis actions keep the visible prompt short and attach raw request/response material as a separate chat attachment
- **Context visibility**: the header shows the current Caido UI context plus any explicit MCP project override
- **Tool safety**: per-group enables plus optional confirmation for sensitive MCP actions (`send_request`, `create_finding`, `set_environment`, intercept controls, `run_workflow`)
- **MCP activity trace**: assistant replies show which Caido tools were called and how they ended
- **Live MCP test**: Settings can verify tool discovery plus live `get_environment` and `search_history` calls before you trust a provider session
- **Chat persistence**: conversations saved via SQLite with JSON backup; persistence failures surfaced rather than silently swallowed
- **Streaming output** with real cancellation, a spawn-time timeout watchdog, and per-chat session lifecycle status
- **Cancel-safe turns**: pressing Stop never duplicates the assistant message even if the provider resolves after SIGTERM
- **Context-menu queue**: a context-menu action fired while another turn is streaming is queued with a toast, drained when the current turn finishes, and cleared if you press Stop
- **In-app Help tab**: prerequisites, setup walkthrough, troubleshooting, prompt examples, and scanner documentation
- **Diagnostics report**: one-click copy/download of a redacted diagnostics bundle for bug reports
- **Session debug log (opt-in)**: a checkbox in Settings > Process streams per-session provider lifecycle events to `/tmp/drift-session-<id>.log` and deletes the file when the session ends

### Scanner

- **Passive scanner** subscribes to in-scope intercept responses and runs them through a bounded filter pipeline (scope, static assets, MIME, body size, endpoint fingerprint dedup, `sdk.findings.exists` short-circuit, global + per-host rate limit) before spending a single LLM call
- **Active scanner** is a manual "Active scan this request" context-menu action: Drift discovers real injection points deterministically, passes them to the LLM as an explicit allowlist, runs the returned payloads through Caido's replay engine, and confirms each response with deterministic rules before creating a finding
- **Deterministic confirmation**: the LLM never judges its own payloads — reflected XSS, error-based SQLi, LFI, SSTI, and open redirect are each confirmed by regex / status / Location rules, and findings always point at the proof replay
- **Serialized active queue**: two rapid "Active scan this request" clicks run back-to-back on a frontend promise chain — never concurrently — and the "Active scan running" spinner stays on for the entire chain
- **URL + body redaction**: a name-based allowlist masks sensitive query params and form/JSON fields (`token`, `api_key`, `password`, `secret`, `jwt`, …) in every scanner prompt; the toggle in Settings controls the full surface
- **Bounded cost**: per-host and global rate limits, concurrency cap, response body cap, endpoint fingerprint LRU dedup, and an `invalidVerdicts` counter that surfaces malformed LLM output
- **Scanner tab** with a live status card (queue / in-flight / analyzed / findings / cooldown), a "Last active scan" card (payloads sent / confirmed / errors / truncation), and a recent-findings stream
- **Provider cooldown**: if the `claude-cli` binary is not resolvable, the scanner queue enters a 60-second cooldown so a broken path does not produce log spam
- **Findings write-through**: confirmed findings land in Caido's native Findings panel via `sdk.findings.create` AND the in-app stream; a badge marks anything that could not be written through

## Installation

```bash
pnpm install
pnpm build
```

Install `dist/drift.zip` in Caido via Plugins > Install from file.

## Configuration

### CLI Providers

In Settings, set the command path for each CLI tool. Drift first tries the configured command via Caido's inherited `PATH`, then probes common install locations (Homebrew, `~/.local/bin`, Volta, asdf, nvm, fnm). Use a full path (for example `/Users/you/.local/bin/claude`) to pin a specific binary explicitly.

| Provider | Resume | MCP | Scanner | Status |
|----------|--------|-----|---------|--------|
| Claude Code | Yes (`--session-id`/`--resume`) | Yes (per-invocation stdio config) | Yes (passive + active) | Stable |
| Gemini CLI | No | Yes (registered wrapper) | No | Supported |
| Codex CLI | No | Yes (registered wrapper) | No | Supported |
| Copilot CLI | No | Yes (`--additional-mcp-config`) | No | Supported |

All four providers share the same MCP/runtime contract: if a provider is enabled and installed, Drift exposes the same 18 MCP tools, the same effective Caido context model, and the same live-test semantics. The scanner subsystem is hardcoded to `claude-cli` in v1 — other providers still work for chat.

### MCP Server

1. Open Drift inside an authenticated Caido UI session — Drift picks up your active Caido session token automatically, no manual auth setup required.
2. Click Settings > MCP Server > Start.
3. Open a new chat after MCP is running. Drift mirrors the currently selected Caido project plus the active HTTP History preset/query/scope for history searches, and exposes an explicit project override when an MCP tool selects a different project.
4. Use **Run Self-Test** in Settings if you want Drift to verify tool discovery plus live `get_environment` and `search_history` calls before chatting.
5. Use **Health check** in Settings to run the preflight checklist, and **Diagnostics** to copy or download a redacted diagnostics report if something fails.

Registration of the Drift MCP server into each external tool's config file (Gemini, Codex) respects the command path you configured and the provider's `enabled` flag, and Drift tracks what it actually wrote so the cleanup on stop never leaks stale `mcpServers.drift` entries in `~/.gemini/settings.json` etc. The diagnostics report surfaces both the registered CLI paths and any CLIs Drift intentionally skipped.

### Scanner

Drift ships two AI-driven scanners. Both use `claude-cli` spawned headlessly (no MCP attached; the raw request/response is baked into the prompt) and create findings directly via `sdk.findings.create`.

- **Passive** subscribes to `onInterceptResponse` and analyses every new in-scope response that survives the filter pipeline. The LLM returns a structured JSON verdict; Drift creates a finding only if the verdict is well-formed, has real evidence, clears the configured confidence threshold, and dedupes against a `(method, host, pathTemplate, class)` key plus an hour-long endpoint fingerprint LRU.
- **Active** fires from the **Active scan this request** context menu on a Request or RequestRow. Drift enumerates the request's real injection points (query params, form body pairs, JSON string leaves, a curated header allowlist), passes the list to the LLM as an explicit allowlist, runs the returned payloads through Caido's replay engine, and confirms each response deterministically before creating a finding. The finding's request always points at the proof replay Drift sent.

Both scanners are **off by default**. Enable them from Settings > Scanner or from the toggles in the Scanner tab. The scanner subsystem only runs while Drift's page is open in Caido — Caido suspends plugin work when the page is hidden, so closing Drift pauses passive analysis and drops incoming events. The Scanner tab shows a live "Drift visible" tag so you know whether work is actually happening.

Scanner settings (Settings > Scanner):

| Setting | Meaning |
|---------|---------|
| Passive / Active toggles | Master enable/disable per scanner |
| Redaction | URL query-param values and sensitive fields in form/JSON bodies are masked in every scanner prompt |
| Skip static assets | Drop `.css` / `.js` / `.png` / … responses before the LLM |
| Scope only | Drop out-of-scope responses (passive) and refuse out-of-scope targets (active) |
| Confidence threshold | `medium` or `high` — passive verdicts below the threshold are rejected |
| Global rate (per min) | Cap across all hosts |
| Per-host rate (per min) | Cap per destination host |
| Max concurrent jobs | Worker concurrency in the scanner queue |
| Max response body (bytes) | Responses larger than this are skipped before the LLM |
| Max active payloads | Cap on payloads the LLM may propose per active scan |
| Scanner job timeout (s) | Timeout applied to every scanner CLI invocation (passive and active) |

Scanner safety rails:

- **Injection-point allowlist** — the active scanner's prompt lists the discovered injection points verbatim. Any plan item whose `injectionPoint` is not in that set is dropped, and every mutator helper (`mutateQueryParam`, `mutateFormBody`, `mutateJsonBody`, `mutateHeaderValue`) returns `undefined` when the target field does not exist. The scanner never fabricates attack surface that wasn't in the original request.
- **Redaction** — `redactUrl` masks sensitive query-param values (`token`, `access_token`, `api_key`, `password`, `secret`, `auth`, `jwt`, `session`, …). `redactBody` walks form-urlencoded pairs and JSON string leaves to mask the same allowlist. `redactHeaders` handles headers. All three respect the Settings toggle.
- **Serial active queue** — the context menu enqueues "Active scan this request" requests and the frontend scanner store runs them on a promise chain so two rapid clicks execute sequentially. The in-progress spinner is driven by a counter over the full chain, not a boolean around a single RPC.
- **Provider cooldown** — a missing or broken Claude binary triggers a 60-second queue cooldown instead of hammering the CLI on every response.
- **Dedup** — passive work is deduped by `(method, host, pathTemplate, sortedQueryKeys)` within an hour-long LRU window, and both scanners dedupe final findings by `(method, host, pathTemplate, class)` so repeated triggers on the same endpoint do not stack.

### Operational UX

- **Health check** checks provider resolution, Caido auth, MCP runtime state, live-test results, and current Caido context sync in one place.
- **Tool safety** lets you disable MCP capability groups and require confirmation before sensitive actions such as findings, environment changes, replay, intercept, or workflow mutations.
- **Diagnostics report** exports provider status, MCP status, registered CLI paths, effective Caido context, persistence issues, scanner state, and chat/session summaries without including tokens or secrets.
- **Session lifecycle** in chat makes it visible whether the current chat has a live provider session, whether MCP was attached to the last turn, and why the last turn stopped or failed.
- **Chat polish** includes rename, copy/export, delete confirmation, and better automatic titles for request/response-driven chats.
- **Session debug log (opt-in)** Settings > Process exposes a checkbox that, when enabled, streams per-line provider lifecycle events to `/tmp/drift-session-<id>.log` and deletes the file when the session ends. Off by default — no trace is written and nothing is buffered in memory until you flip it on.

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
| MCP auth failed | Open any Caido page to refresh the session token and retry |
| History/context looks wrong | Run `get_current_context`, clear any override, and rerun the Health check |
| Provider session feels stuck | Restart or close the chat session from the chat header |
| Scanner idle even though traffic is flowing | Verify the Drift tab is open (the Scanner tab's "Drift visible" tag must be green), verify `Passive: On`, and check the status card for rate-limit or cooldown messages |
| Scanner shows "Claude unavailable — retrying in Ns" | Fix the `claude-cli` command path in Settings > CLI Providers; the queue retries automatically after the cooldown |
| Active scan returns "No injection points discovered" | The request had no query params, form/JSON body fields, or allowlisted headers to inject into — pick a request with real parameters |
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
- **Request context menu**: "Analyze Request", "Find Vulnerabilities", "Active scan this request"
- **Response context menu**: "Analyze Response", "Analyze JavaScript"
- **Request row context menu** (history, sitemap): "Analyze Request", "Find Vulnerabilities", "Active scan this request"

The analysis actions keep the visible user prompt short and send the raw HTTP request/response as a structured attachment for provider analysis. If you trigger an action while another turn is already streaming, Drift queues it (with a toast) and fires it as soon as the current turn finishes; pressing Stop drops anything still queued so it cannot fire after a cancel.

**Active scan this request** bypasses the chat flow entirely: Drift switches to the Scanner tab and runs a full plan → payload → confirm → finding pipeline as a background job. Two rapid clicks run back-to-back (never concurrently) on a serialized promise chain, and the "Last active scan" card shows payloads sent, confirmed count, and any error for whichever scan most recently settled.

## Known Limitations

- Settings persist via SQLite when available, with JSON file backup
- Session resume only works with Claude Code
- Scanner (passive and active) only runs while Drift's page is open in Caido — Caido suspends plugin work when the page is hidden
- Scanner v1 uses `claude-cli` exclusively; other providers still work for chat but cannot run scanner jobs
- Caido's QuickJS backend runtime restricts available Node.js modules

## Development

```bash
pnpm install
pnpm build              # Build plugin (produces dist/drift.zip)
pnpm watch              # Caido dev watch mode
pnpm -r typecheck       # Type-check shared, backend, and frontend workspaces
pnpm exec vitest run    # Run the full unit + Vue mount test suite
```

The frontend tests use `@vue/test-utils` with `happy-dom` to mount `ChatView` against a stubbed Caido SDK and Pinia stores. Coverage includes the cancel-race guard, the context-menu queue drain, the queue-clear-on-cancel path, the scanner-store serialization chain for back-to-back active scans (two clicks run sequentially, one failed scan does not poison the chain), and the settings-store migration helper.

Backend tests cover Claude print-mode parsing, command resolution, MCP runtime, persistence, live MCP transport semantics, and the scanner subsystem: injection-point extraction, mutator `undefined` contract when target fields are missing, passive/active prompts, URL/body/header redaction, the deterministic response analyzer for all five confirmable classes, `migrateScannerSettings` legacy-field renames, and the `invalidVerdicts` counter wiring.

## Release QA checklist

1. **Provider resolution:** in Settings, confirm Claude, Gemini, Codex, and Copilot resolve correctly or are intentionally disabled.
2. **Health check:** run Health check and verify provider checks, Caido auth, MCP runtime, live-test state, and context sync.
3. **Per-provider chat smoke:** for each enabled provider, start a fresh chat and verify `Use get_current_context...` returns the expected project/filter/scope state, `Show me the last 5 requests...` returns history, and MCP activity is shown on the reply.
4. **Structured HTTP handoff:** use a request/response context-menu analysis action and verify the attachment chip appears in chat and the reply reflects the attached material.
5. **Cancel race:** start a long-running turn, press Stop mid-stream, and confirm only a single `[Cancelled]` assistant message appears (no late duplicate when the provider eventually exits).
6. **Context-menu queue:** while a turn is streaming, fire two analysis actions on different requests; confirm the toast, that queued prompts run sequentially after the active turn, and that pressing Stop drops anything still queued.
7. **Session debug log:** with the flag off (default), confirm `/tmp/drift-session-*.log` is not created during a turn. Toggle it on, run a turn, end the session, and confirm the log file is removed.
8. **MCP registration footprint:** with Gemini disabled, start MCP and confirm `~/.gemini/settings.json` is not mutated. Enable Gemini with a specific command path, start MCP, confirm `mcpServers.drift` was registered against that exact path. Disable Gemini, stop MCP, and confirm the entry is cleaned up (the tracked-paths map ignores the current `enabled` flag).
9. **Passive scanner smoke:** enable passive scanning, browse an in-scope target, and confirm findings appear in both Caido's Findings panel and the Scanner tab's recent-findings stream. Confirm static assets and non-text responses are skipped (no LLM calls in logs).
10. **Active scanner smoke:** right-click a request with real parameters, pick "Active scan this request", and verify the Scanner tab shows the "Last active scan" card with payloads sent / confirmed / errors. Fire two clicks back-to-back on different requests and confirm they run sequentially (not concurrently).
11. **Injection-point allowlist:** run an active scan on a request with a single query param; with `debugLogging` on, inspect `/tmp/drift-scanner-<jobId>.log` and confirm the prompt shows only that param in the allowlist and any LLM-proposed points outside the set are dropped.
12. **Redaction:** active-scan a request with `?api_key=SECRET123` and a JSON body containing `"password":"hunter2"`; with `debugLogging` on, confirm the scanner prompt shows `api_key=[redacted]` and `"password":"[redacted]"`.
13. **Provider cooldown:** with an invalid Claude path, enable passive scanning, browse, and confirm the Scanner status card shows "Claude unavailable — retrying in Ns" instead of failing silently.
14. **Diagnostics:** export a diagnostics report and confirm it contains provider/MCP/registered-paths/scanner/chat data without secrets.
15. **Tests:** `pnpm -r typecheck` and `pnpm exec vitest run` both pass.

## License

MIT
