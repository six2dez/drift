# Requirements: Drift — Native Windows Milestone

**Defined:** 2026-06-26
**Core Value:** The user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data — on native Windows as well as macOS/Linux.

## v1 Requirements

Requirements for the native-Windows milestone. Each maps to exactly one roadmap phase.

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

### Lifecycle (LIF)

- [ ] **LIF-01**: On Windows, cancelling or timing out a turn terminates the whole process tree (`taskkill /pid <pid> /T /F`), leaving no orphaned token-bearing process

### Validation (CI)

- [ ] **CI-01**: A `windows-latest` CI job builds the plugin and runs vitest (the permanent regression net)
- [ ] **CI-02**: A Phase-1 CI spike proves the 7 LLRT assertions (spawn `env` passthrough, `os.tmpdir()`/`os.platform()`, `.cmd` EINVAL behavior, `where` parsing, `os` import specifier, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, `crypto.randomUUID`) before any production port code is built on them
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
| New MCP tools or non-Windows features | Milestone is platform parity + Windows polish only |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (to be filled by roadmapper) | | |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: (pending roadmap)
- Unmapped: (pending roadmap)

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-06-26 after initial definition*
