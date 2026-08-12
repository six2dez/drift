# Requirements: Drift — Hardening + Native Windows Milestone

**Defined:** 2026-06-26
**Extended:** 2026-08-12 — pre-port hardening requirements (SIG, COR, SEC, PERF) added from a full-codebase review; Windows requirements re-targeted after the roadmap renumber (phases 1–8 became 3–10)
**Core Value:** The user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data — on native Windows as well as macOS/Linux.

## v1 Requirements

Requirements for the hardening + native-Windows milestone. Each maps to exactly one roadmap phase.

### Signal (SIG) — added 2026-08-12

- [ ] **SIG-01**: `pnpm exec vitest run` is green on Node 20, 22 and 24, and `window.localStorage` is accessed through a guard that tolerates an environment where storage is absent or throws
- [ ] **SIG-02**: `pnpm lint` invokes a real, installed ESLint with a committed flat config for TypeScript and Vue, and CI fails on lint errors
- [ ] **SIG-03**: CI runs typecheck → lint → test → build on push and pull request for every branch, across a Node 20/22/24 matrix

### Correctness (COR) — added 2026-08-12

- [ ] **COR-01**: `check_scope` evaluates Caido glob scope patterns correctly and anchored against the parsed hostname — `*.target.com` matches `api.target.com`, and `target.com` does not match `target.com.attacker.net` — with denylist precedence preserved
- [ ] **COR-02**: The agent can discover convert workflows (`list_workflows`), so `run_workflow` is usable without a manually supplied ID
- [ ] **COR-03**: Saving settings only reruns the work the change requires — no MCP teardown, no CLI re-registration, and no loss of Claude session resume on unrelated edits
- [ ] **COR-04**: Claude's injected system prompt advertises only the tools the active permission policy allows
- [ ] **COR-05**: A failed chat load does not hide persisted chats behind an auto-created empty chat

### Security (SEC) — added 2026-08-12

- [ ] **SEC-01**: The Caido token is present only in the MCP server process environment, not in the provider CLI process environment
- [ ] **SEC-02**: `sessionId` and `chatId` are validated against a strict character set before being interpolated into filesystem paths
- [ ] **SEC-03**: Links rendered from model output cannot navigate the Caido webview away from the plugin
- [ ] **SEC-04**: No dead security configuration — `DRIFT_CONFIRM_SENSITIVE_ACTIONS` is either wired to real behavior or removed
- [ ] **SEC-05**: Tool metadata (permission group + `sensitive` flag) cannot silently desync between `shared/mcp.ts` and `mcp-server.mjs`

### Performance (PERF) — added 2026-08-12

- [ ] **PERF-01**: Markdown rendering allocates one parser for the message list, not one `MarkdownIt` + highlight.js instance per message bubble
- [ ] **PERF-02**: The MCP activity file is read incrementally from a byte offset instead of being fully re-read and re-parsed on every watchdog tick
- [ ] **PERF-03**: Provider and Node binary resolution is cached with a short TTL, invalidated on command change, instead of re-probing on every turn
- [ ] **PERF-04**: `stdout`/`stderr` accumulation and the Claude stream parser use bounded buffers with marked truncation

### Runtime (RUN)

- [ ] **RUN-01**: On native Windows, the Drift MCP server starts with no POSIX dependency — `node` is spawned directly, with no `chmod`, no `#!/bin/bash` wrapper, and no `.sh` execution
- [ ] **RUN-02**: On Windows, the MCP environment (Caido token, `DRIFT_*` vars) reaches the MCP server via the spawn `env` option / config-JSON `env` field, not a shell `export` wrapper
- [ ] **RUN-03**: Drift uses `os.tmpdir()` for its runtime, context, log, and orphan-sweep paths instead of a hardcoded `/tmp` (works on Windows, macOS, Linux)
- [ ] **RUN-04**: Drift's temp-file write→spawn path tolerates the Windows AV write-then-exec race (copy `mcp-server.mjs` once at start; bounded retry on `EPERM`/`EBUSY`)
- [ ] **RUN-05**: At MCP start, Drift fails loud with an actionable message (incl. Caido/runtime version) if a required runtime capability is missing, instead of failing cryptically

### Health (HLT)

- [ ] **HLT-01**: On Windows, MCP auth validation (`validateCaidoAuth`) succeeds for the Claude path
- [ ] **HLT-02**: On Windows, the MCP self-test (tools/list, get_environment, search_history) passes for the Claude path

### Resolution (RES)

- [ ] **RES-01**: On Windows, Drift locates `node.exe` via `where` plus Windows install locations (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`)
- [ ] **RES-02**: On Windows, Drift resolves provider CLI binaries to an absolute path with explicit extension (`.exe`/`.cmd`), preferring `.exe`, parsing `where` CRLF output
- [ ] **RES-03**: Home-dir detection recognizes `C:\Users\<name>` and uses `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`

### Providers (PRV)

- [ ] **PRV-01**: On Windows, the user can run a **Claude Code** chat end-to-end with the Drift MCP attached (blocking must-have / MVP)
- [ ] **PRV-02**: On Windows, Drift spawns provider `.cmd` shims safely via a `cmd.exe /d /s /c` argv array (never `shell:true` with dynamic args), or the underlying `node.exe` entry directly
- [ ] **PRV-03**: On Windows, Drift registers the MCP server with Gemini and Codex passing `node.exe` + args + env, with token hygiene (`${CAIDO_TOKEN}` reference or `DRIFT_TOKEN_FILE` indirection) and a guaranteed `mcp remove` on cleanup
- [ ] **PRV-04**: Gemini, Codex, and Copilot are usable on Windows — best-effort where the CLI's own Windows behavior is the blocker (Gemini gated on a real-machine check)
- [ ] **PRV-05**: Gemini and Codex either receive a per-session approval/activity channel like Claude and Copilot, or have their sensitive tools disabled with the limitation stated in-product and in the README *(added 2026-08-12)*

### Lifecycle (LIF)

- [ ] **LIF-01**: On Windows, cancelling or timing out a turn terminates the whole process tree (`taskkill /pid <pid> /T /F`), leaving no orphaned token-bearing process
- [ ] **LIF-02**: On POSIX, cancelling or timing out a turn also terminates the CLI's MCP child (which carries `CAIDO_TOKEN`), via process-group signalling rather than a single-pid signal *(added 2026-08-12)*

### Validation (CI)

- [ ] **CI-01**: A `windows-latest` CI job builds the plugin and runs vitest (the permanent regression net)
- [ ] **CI-02**: A CI spike proves the 7 LLRT assertions (spawn `env` passthrough, `os.tmpdir()`/`os.platform()`, `.cmd` EINVAL behavior, `where` parsing, `os` import specifier, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, `crypto.randomUUID`) before any production port code is built on them
- [ ] **CI-03**: Windows CI is green for the *right* reasons — `.gitattributes` (`eol=lf`), `\r?\n`-tolerant snapshot assertions, pinned shell

### UX / Polish (UX)

- [ ] **UX-01**: The provider binary-path picker accepts `.exe`/`.cmd` paths on Windows
- [ ] **UX-02**: "CLI / Node not found" guidance shows correct Windows install commands per provider (including the Copilot `@github/copilot` correction, replacing the deprecated `gh copilot` extension hint)
- [ ] **UX-03**: Windows install + prerequisites docs (Node ≥ 18, Claude native installer, PowerShell execution-policy note, Codex npm win32 optional-dep caveat)
- [ ] **UX-04**: Windows-aware diagnostics (resolved binary, spawn strategy used, `mcp add` skip reason) and `windowsHide: true` on all spawns

### Compatibility (CMP)

- [ ] **CMP-01**: All existing macOS/Linux behavior is preserved — POSIX launch path unchanged behind `platform` guards; existing snapshot/unit tests stay green
- [ ] **CMP-02**: The `os.tmpdir()` substitution does not break the macOS/Linux orphan-sweep (macOS tmpdir is `/var/folders/...`, not `/tmp`)

## v2 Requirements

Deferred to a future release. Tracked but not in this milestone's roadmap.

### Hardening (HRD)

- **HRD-01**: Explicit `icacls` ACL hardening of the Windows temp dir (beyond the per-user `%TEMP%` ACL baseline)
- **HRD-02**: Expanded Windows-specific diagnostics / support-bundle fields

### Packaging (PKG)

- **PKG-01**: Windows installer / packaging niceties (e.g. signed MSI, winget manifest)

## Out of Scope

Explicitly excluded for this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Requiring WSL | Native Windows is the goal; WSL is Linux and already works |
| Keeping any bash / `.sh` wrapper indirection | It is the root cause of the Windows failure |
| `shell:true` with dynamic args | Command-injection / CVE-2024-27980 re-exposure; banned |
| Bundling or auto-installing Node or the CLIs | The user provides their own CLI + Node; out of scope and a trust/size concern |
| New MCP feature work beyond the correctness gaps | `list_workflows` (COR-02) ships because `run_workflow` is unusable without it; `search_response_bodies`, sitemap access, and the chat/UX features from the 2026-08-12 review are parked in the ROADMAP backlog (999.x) |
| The event-driven `sendCliMessage` refactor | Collides head-on with Phases 5 and 8; parked as backlog 999.1 until the port lands |

## Traceability

Which phases cover which requirements. Every v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIG-01 | Phase 1 | Pending |
| SIG-02 | Phase 1 | Pending |
| SIG-03 | Phase 1 | Pending |
| COR-01 | Phase 2 | Pending |
| COR-02 | Phase 2 | Pending |
| COR-03 | Phase 2 | Pending |
| COR-04 | Phase 2 | Pending |
| COR-05 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| PERF-01 | Phase 2 | Pending |
| CI-02 | Phase 3 | Pending |
| RUN-03 | Phase 4 | Pending |
| RUN-04 | Phase 4 | Pending |
| RUN-05 | Phase 4 | Pending |
| CMP-02 | Phase 4 | Pending |
| PERF-02 | Phase 4 | Pending |
| PERF-03 | Phase 4 | Pending |
| PERF-04 | Phase 4 | Pending |
| RUN-01 | Phase 5 | Pending |
| RUN-02 | Phase 5 | Pending |
| HLT-01 | Phase 5 | Pending |
| HLT-02 | Phase 5 | Pending |
| CMP-01 | Phase 5 | Pending |
| RES-01 | Phase 6 | Pending |
| RES-02 | Phase 6 | Pending |
| RES-03 | Phase 6 | Pending |
| UX-02 | Phase 6 | Pending |
| PRV-01 | Phase 7 | Pending |
| PRV-02 | Phase 7 | Pending |
| PRV-03 | Phase 7 | Pending |
| PRV-04 | Phase 7 | Pending |
| PRV-05 | Phase 7 | Pending |
| UX-01 | Phase 7 | Pending |
| LIF-01 | Phase 8 | Pending |
| LIF-02 | Phase 8 | Pending |
| CI-01 | Phase 9 | Pending |
| CI-03 | Phase 9 | Pending |
| UX-03 | Phase 10 | Pending |
| UX-04 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 43 REQ-IDs (24 original Windows-port IDs + 19 added 2026-08-12: SIG-01…03, COR-01…05, SEC-01…05, PERF-01…04, PRV-05, LIF-02)
- Mapped to phases: 43
- Unmapped: 0

**Phase → requirement rollup:**
- Phase 1 (Restore the Verification Signal): SIG-01, SIG-02, SIG-03
- Phase 2 (POSIX Correctness & Hardening): COR-01, COR-02, COR-03, COR-04, COR-05, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, PERF-01
- Phase 3 (CI Spike): CI-02
- Phase 4 (Platform Foundation): RUN-03, RUN-04, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04
- Phase 5 (Kill Shell Wrappers): RUN-01, RUN-02, HLT-01, HLT-02, CMP-01
- Phase 6 (Windows Command Resolution): RES-01, RES-02, RES-03, UX-02
- Phase 7 (Provider Spawn & Registration): PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, UX-01
- Phase 8 (Process Lifecycle): LIF-01, LIF-02
- Phase 9 (CI Hardening): CI-01, CI-03
- Phase 10 (Windows Polish): UX-03, UX-04

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-08-12 — hardening requirements added and Windows requirements re-targeted after the phase renumber*
