# Drift — security model

This document describes what Drift trusts, what it does not, and the data flow
that happens when you chat with it. Read it before wiring Drift into a
production Caido workstation or before auditing the plugin.

If you think you have found a security issue, see **[Reporting a
vulnerability](#reporting-a-vulnerability)** at the bottom.

---

## What Drift is

Drift is a Caido plugin that spawns **locally installed AI CLIs** (Claude
Code, Gemini CLI, Codex CLI, GitHub Copilot CLI) as child processes and wires
them to the Caido HTTP API through an embedded MCP server. The plugin ships
as frontend + backend JavaScript that runs inside Caido's plugin sandbox.

Drift never contacts an Anthropic / Google / OpenAI / GitHub endpoint on its
own. Any network traffic is driven by the CLI you configured.

---

## Trust boundaries

| Component | Trusted? | Why |
|---|---|---|
| Caido SDK (`@caido/sdk-backend`, `@caido/sdk-frontend`) | Yes | Same trust as Caido itself — the plugin is running inside your logged-in Caido session. |
| The local CLI binary Drift spawns | Yes | You installed it. Drift verifies the path resolves to an existing executable before spawning and passes it via `spawn` without a shell. |
| The Caido session token | Yes, but redacted | Drift picks up the active Caido session token, forwards it to the MCP server subprocess via env var, and redacts it from every diagnostics export and session debug log. |
| User chat input | No | Treated as untrusted text. It is never concatenated into shell strings; it is written to the CLI's stdin. |
| Model output (assistant text) | No | Rendered through `markdown-it` with `html: false` and `DOMPurify.sanitize` before reaching the DOM. No raw HTML is trusted from the model. |
| MCP tool call arguments | No | Every sensitive tool call (see [Approval flow](#approval-flow)) is shown in a confirmation dialog with its formatted arguments before it runs. |
| CLI stdout text | Partial | Claude Code uses a structured `stream-json` parser. Gemini / Codex / Copilot emit text output — we display it but never execute it. |
| Attachment raw HTTP text | No | Stored only in memory (not persisted). Rendered as `<pre>` text, never interpreted. |

---

## Data flow

```
user prompt  ─┐
              ├─► frontend (ChatView) ─► backend.sendCliMessage(stdin)
attachment    ┘                                 │
                                                ▼
                                  spawn(cli, [args])  ───► child process
                                                │               │
                                                │               ▼
                                                │      --mcp-config  ──► drift MCP server (node subprocess)
                                                │               │
                                                │               ▼
                                                │      Caido HTTP API (localhost)
                                                ▼
                                  stdout chunks (stream-json for Claude, text for others)
                                                │
                                                ▼
                                  parsed → ChatMessage → rendered
```

Nothing in this pipeline sends data to a remote Drift-operated endpoint:
Drift has no telemetry, no analytics, no crash reporting, no "phone home".
All traffic is either (a) local (Caido ↔ MCP), (b) local (plugin ↔ CLI), or
(c) driven by the CLI itself when it calls its upstream model API.

### What Drift writes to disk

| Path | Contents | Lifetime |
|---|---|---|
| Caido's plugin SQLite DB (`drift_settings` table) | chats + settings JSON blobs | Until you uninstall Drift (survives plugin reinstall). |
| `pluginPath/chats.json`, `pluginPath/settings.json` | Backup JSON copies of the above | Until uninstall / overwrite. |
| `/tmp/drift-mcp-<uuid>/mcp-server.mjs` | Copy of the embedded MCP server script | Per plugin launch; removed on plugin stop. |
| `/tmp/drift-mcp-<uuid>/mcp-<chatId>.json` | Claude per-chat MCP config | Per turn; removed on session finalize. |
| `/tmp/drift-mcp-<uuid>/mcp-wrapper-<sessionId>.sh` | Shell wrapper that exec's the MCP server with the Caido token injected as env var | Per turn; removed on session finalize. `CAIDO_TOKEN` is redacted from every log export. |
| `/tmp/drift-session-<sessionId>.log` | Per-session provider lifecycle log | **Opt-in only**: created only when Settings → Process → *Session debug log* is on. Removed on session end. |
| `~/.gemini/settings.json` (mutated) | Adds `mcpServers.drift` entry | Written on MCP start, removed on stop (even if Gemini provider is later disabled — tracked-paths map handles cleanup independent of current enabled flag). |

Chat persistence deliberately **strips the raw attachment body** before
saving so reload does not materialize arbitrary HTTP payloads to disk.

---

## Attack surface Drift was designed to defend against

### Prompt injection into MCP tool calls

The model can be coerced (by content in an HTTP response it reviewed, or by
attacker-controlled prompt fragments) to try a sensitive MCP tool call. Drift's
defenses:

1. **Explicit tool allowlist**. Claude receives `--allowedTools mcp__drift__X,mcp__drift__Y,...` with every tool listed by name — no wildcards. A model cannot call MCP tools outside that list.
2. **Explicit disallowed tools**. Claude's native filesystem / shell / web tools (`Bash`, `Read`, `Write`, `Edit`, `WebFetch`, `WebSearch`, ...) are explicitly passed in `--disallowedTools` so a wandering model cannot shell out.
3. **Approval dialog for sensitive tools**. `send_request`, `create_finding`, `set_environment`, `intercept_pause`, `intercept_resume`, `run_workflow` are tagged sensitive and require a per-call user approval by default. The dialog shows the tool name, group, and formatted arguments before any network call is issued.
4. **Session approvals are in-memory only**. When the user picks "Allow for session", the approval is cached only for the current `sessionId`; reload of the plugin or restart of the session forces re-approval. Approvals are never persisted to disk.
5. **Tool-safety groups**. The user can disable entire groups (replay, findings, environment, intercept, workflow) from Settings. The backend's MCP runtime rejects disabled-group calls even if the model attempts them.

### Command injection against the CLI subprocess

- `spawn()` is used **without `shell: true`**. User prompts go to the CLI's stdin, not to argv or shell.
- Every `args[]` entry is a constant, a validated config value, or a path generated by Drift itself. No user-facing string is ever concatenated into argv.
- Absolute binary paths are verified with `fs.stat` before spawning.
- The `/tmp` wrapper script is generated by Drift (no user input in it) and chmod'd +x before rename — a classic atomic file-write pattern.

### XSS / content rendering

- Assistant markdown is piped through `markdown-it` with `html: false`, then passed through `DOMPurify.sanitize` before `v-html` rendering.
- User message bodies are rendered as text (`{{ content }}`), not HTML.
- Attachment previews render as `<pre>` text; no markdown or HTML interpretation.
- Code blocks are syntax-highlighted with `highlight.js` applied to the already-sanitized output.

### Secret handling

- `CAIDO_TOKEN` is injected into MCP wrapper env via a generated shell script. The script lives in the per-plugin `/tmp/drift-mcp-<uuid>/` directory and is removed at finalize.
- Any time the session debug log or diagnostics export reads back the wrapper / config, the token value is replaced with `[redacted]` before the data is written / exported.
- The plugin never writes secrets to the SQLite DB or the JSON backup files.

### Persistence-layer SQLi

`loadSetting` / `saveSetting` use string-interpolated SQL because the Caido
SQLite binding does not expose parameterized queries on this handle. Inputs
are constrained at the call site (`key` is always a hardcoded constant:
`"settings"` or `"chats"`) and the `value` is JSON with single quotes
escaped per SQLite string-literal rules. A code comment flags this contract.

---

## Approval flow

Every sensitive MCP tool call (`send_request`, `create_finding`,
`set_environment`, `intercept_pause`, `intercept_resume`, `run_workflow`)
flows through this path:

1. Model emits the tool call.
2. Backend checks: group enabled? Sensitive + confirmation required?
3. If confirmation required, backend emits `mcp-tool-approval` event.
4. Frontend `ApprovalDialog` renders with tool name, group, sensitive badge,
   formatted arguments, message.
5. User picks **Allow once**, **Allow for session**, or **Deny**. Closing the
   dialog (Esc, X, click outside) equals Deny.
6. Response is sent back through `respondToMcpToolApproval`.
7. Backend gates the tool execution on the returned boolean.
8. If the session is closed, restarted, or the plugin reloads, session-level
   approvals are cleared.

---

## Threat model — out of scope

Drift does **not** defend against:

- A compromised local CLI binary (installed by the user).
- A compromised Caido instance.
- Malicious OS-level manipulation of `/tmp` while Drift is running (standard
  `/tmp` permissions apply).
- Model output that convinces the *user* to approve a dangerous action —
  this is a social-engineering class not addressable by the plugin.
- Logging by the upstream CLI (Claude Code, Gemini CLI, ...): whatever those
  CLIs log or ship upstream is outside Drift's control.

---

## Reporting a vulnerability

Please do not open a public GitHub issue for security reports.

Send details to **six2dez@gmail.com** with subject `Drift security report`.
Include reproduction steps, affected Drift version, Caido version, and CLI
provider if relevant. A redacted diagnostics bundle
(Settings → Diagnostics → Download Diagnostics Report) helps a lot — it is
auto-redacted of tokens and credentials.

I will acknowledge in 72 h and aim to ship a fix within 14 days for anything
exploitable.
