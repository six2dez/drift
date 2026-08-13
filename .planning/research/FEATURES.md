# Feature Research

**Domain:** Native Windows support for a Caido plugin that shells out to local AI CLIs (Claude Code / Gemini / Codex / Copilot) and bridges them to a bundled Node MCP server
**Researched:** 2026-06-26
**Confidence:** HIGH on per-CLI distribution + MCP-wiring facts; MEDIUM on exact Node-version floors and version-fragile CLI bugs

> Scope note: this milestone is the **Windows delta** on a plugin that already works on macOS/Linux/WSL. "Feature" here = what "Windows supported" must concretely deliver. Differentiators are reframed as **Windows polish** (beyond bare parity). Claude Code is the **blocking must-have**; Gemini/Codex/Copilot are best-effort.

---

## TL;DR for the roadmap

1. The project's stated fix ("drop the `.sh`/`chmod`/bash wrapper, spawn `node` directly") is correct and closes the **reported** bug — but it only fixes the **MCP-server side**. There is a **second, under-documented class of Windows breakage**: spawning the **CLI binaries themselves**. Three of the four CLIs are distributed as npm **`.cmd` shims** on Windows, and modern Node throws **`EINVAL` when you `spawn()` a `.cmd`/`.bat` without a shell** (CVE-2024-27980 mitigation). This is a distinct table-stake, not covered by the wrapper removal.
2. **Claude is genuinely the lowest-risk provider** — and the right blocking choice — because its native installer produces a real `claude.exe` (no `.cmd` EINVAL) and its MCP wiring is a **pure JSON file** (`--mcp-config`), with no `mcp add` subprocess and no token written into the user's home config.
3. **Gemini is the highest-risk** Windows provider (minimal-env subprocess spawning, absolute-node-path requirement, multiple open "MCP Disconnected on Windows" and "broken settings.json" issues).
4. A **correctness bug** to fix in passing: the in-repo Copilot install hint (`gh extension install github/gh-copilot`) points at the **deprecated** `gh copilot` extension (EOL **2025-10-25**, no MCP). Drift actually drives the **new standalone `@github/copilot`** CLI. The hint is wrong on every OS, not just Windows.

---

## Feature Landscape

### Table Stakes (Required for "Windows Supported")

Missing any of these = the milestone is not done. These are non-negotiable.

| # | Feature | Why Expected (user-visible) | Complexity | Risk | Notes |
|---|---------|------------------------------|------------|------|-------|
| TS1 | **MCP runtime launches via direct `node.exe` spawn** (no `.sh`, no `chmod`, no bash) | The exact reported failure: "failed to run the mcp server and check the health mcp." `chmod` doesn't exist on Windows → the launcher errors before anything runs | HIGH (core re-architecture) | Med | Pass env via spawn `env:` + config-JSON `env`. Already the maintainer's Key Decision; removes 3 landmines at once |
| TS2 | **`.cmd`-shim-aware CLI spawning** (no `EINVAL`) | Gemini/Copilot (always) and npm-installed Claude/Codex resolve to `*.cmd`. `spawn("gemini.cmd", …)` throws `EINVAL` on Node ≥18.20.2/20.12.2/21 | MED-HIGH | **HIGH** | The hidden second bug. Fix = resolve `.cmd`→`node <js-entry>` (no-shell, safest) **or** `cmd /c <cmd> <args>` / `{shell:true}` with strict arg-escaping. Applies to provider launch **and** `gemini`/`codex mcp add` registration |
| TS3 | **Windows node + CLI resolution** | If the binary can't be found, the user gets "CLI not found" even though it's installed | MED | Med | `where` not `which`; honor `PATHEXT` (`.exe`/`.cmd`/`.bat`/`.ps1`); use `USERPROFILE` (not `HOME`); add Windows install dirs (see auto-discovery list below) |
| TS4 | **Cross-platform temp dir** (`os.tmpdir()`) | `/tmp` does not exist on Windows → runtime dir, orphan sweep, and debug logs all fail with `ENOENT` | LOW | Low | Replaces hardcoded `/tmp` in 3 places. Confirm `os.tmpdir()`/`process.platform` exist in Caido's QuickJS runtime (open question in PROJECT.md constraints) |
| TS5 | **Shell-free MCP env injection** | The Caido token + `DRIFT_*` vars must reach the MCP subprocess without a bash `export` wrapper | MED | Med | Claude/Copilot: JSON `env` block. Gemini: `gemini mcp add -e K=V …`. Codex: `codex mcp add --env K=V …`. Self-test/auth: spawn `node mcp-server.mjs --validate-auth` with `env:` |
| TS6 | **Working health/self-test + auth validation on Windows** | The user literally reported "check the health mcp" failing. The green/red self-test must pass | MED | Med | `validateCaidoAuth` + `callMcpMethod` must spawn `node mcp-server.mjs` directly instead of the `.sh` wrapper. This is the user-facing "it works" signal |
| TS7 | **Process cancellation on Windows** | Stop/cancel button must actually kill a hung CLI | LOW-MED | Low | `proc.kill()` ignores `"SIGTERM"`/`"SIGKILL"` args on Windows. Consider `taskkill /PID <pid> /T /F` to kill the child-process tree (CLIs spawn the MCP server as a grandchild) |
| TS8 | **Correct, actionable Windows "not found / install with X" guidance** | A bash/curl install command shown to a Windows user is dead text | LOW | Low | Per-CLI **PowerShell/npm** commands (table below). **Fix the wrong Copilot hint.** This is the cheapest high-trust win |
| TS9 | **Documented Node.js prerequisite on Windows** | A user who installed Claude via the **native** installer may have **no Node at all** — but the MCP server is `mcp-server.mjs` and still needs `node.exe ≥18` | LOW | Med | Native Claude/Codex bundles its own runtime and does **not** give Drift a general-purpose `node`. Drift must locate/require a separate `node.exe` |

### Windows Polish (Beyond Bare Parity — the maintainer's chosen "+polish" scope)

First-class native-Windows install experience. Valued, not strictly required to call the bug fixed.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| WP1 | **Binary-path picker accepts `.exe`/`.cmd`/`.bat`/`.ps1`** | User can point Drift at a non-PATH install in two clicks | LOW-MED | File-dialog filter `*.exe;*.cmd;*.bat;*.ps1` + "All files". Validate the picked path through TS2/TS3 so a picked `.cmd` still spawns |
| WP2 | **Auto-discovery of Windows install locations** | "It just found my CLI" — no manual config | MED | Probe: `%APPDATA%\npm\` (npm globals — the big one), `%USERPROFILE%\.local\bin\` (native Claude/Codex), `%LOCALAPPDATA%\Programs\`, `C:\Program Files\nodejs\` (node), Volta `%LOCALAPPDATA%\Volta\bin`, fnm/nvm-windows dirs |
| WP3 | **Windows prerequisites / install docs page** | New Windows users self-serve | LOW | Cover: native-installer recommendation for Claude, npm `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` gotcha, Node 18+ requirement, Codex npm win32 optional-dep caveat |
| WP4 | **"Installed but not on PATH" detection (Claude Windows)** | Known Claude bug: native installer sometimes doesn't add `%USERPROFILE%\.local\bin` to PATH | LOW-MED | If resolution fails, probe the known native path directly and offer one-click "use this path" / PATH-fix guidance |
| WP5 | **Windows token-on-disk hardening** | `0o600`/`0o700` are **no-ops** on Windows; the Caido token sits world-readable in `%TEMP%` | MED (security) | Use a per-user-ACL'd dir (e.g. under `%LOCALAPPDATA%`) or accept-and-document the trade-off. Avoid `mcp add` persisting the token into home config longer than the session (see AF5) |
| WP6 | **Windows-aware diagnostics / support bundle** | Faster remote debugging (maintainer can't test Windows locally) | LOW-MED | Surface: resolved binary + whether `.exe` vs `.cmd`, node path, which spawn strategy was used (`node`/`cmd /c`/`shell`), and any `mcp add` skip reason |

### Anti-Features (Do NOT Build)

| # | Anti-Feature | Why It's Tempting | Why It's Wrong | Do Instead |
|---|--------------|-------------------|----------------|------------|
| AF1 | **Require / shell into WSL** (`wsl.exe …`) | WSL "already works" and is Linux | Defeats the entire milestone — the gap is **native** Windows. WSL path already supported and explicitly out of scope | Spawn native Windows processes directly |
| AF2 | **Keep using bash / `.sh` / `chmod`** (e.g. detect Git-Bash) | Smallest diff to existing code | This **is** the root cause; Git-Bash is not guaranteed present and re-introduces POSIX assumptions | Direct `node.exe` spawn with `env:` (TS1) |
| AF3 | **`{shell:true}` with unsanitized args** to dodge `EINVAL` | One-line fix for the `.cmd` problem | `cmd.exe`/PowerShell quoting ≠ POSIX; re-opens a command-injection surface (the very CVE being mitigated) | Prefer no-shell `node <js-entry>`; if `cmd /c` is unavoidable, pass an explicit arg array and escape per Windows rules |
| AF4 | **Bundle or auto-install Node / the CLIs** | "Make it just work" | Breaks the local-first, no-API-key, user-owns-auth model; bloats the signed plugin; store-policy risk | Detect + give a correct Windows install command (TS8) |
| AF5 | **Silently persist the Caido token in home configs** | `gemini/codex mcp add` is the easy registration path | `mcp add` writes the token into `~/.gemini/settings.json` / `~/.codex/config.toml` in plaintext, surviving the session | Always `mcp remove` on stop; prefer file-based MCP config (Claude/Copilot) where possible; treat as an explicit trade-off, not a default leak |
| AF6 | **Hardcode drive letters / backslashes / PowerShell-only invocation** | Quick Windows "fix" | Users run cmd **or** PowerShell; paths vary by machine | `path.join`, `os.homedir()`, env vars; resolve programmatically, never assume the parent shell |

---

## Per-CLI Windows Reality Matrix (the core of this research)

| CLI | Windows distribution | Resolved binary on Windows | `.cmd` shim? | Direct-`spawn` `EINVAL` risk | MCP wiring on Windows | Win MCP risk |
|-----|----------------------|----------------------------|--------------|------------------------------|-----------------------|--------------|
| **Claude Code** ⭐ *blocking* | **Native:** `irm https://claude.ai/install.ps1 \| iex` → `%USERPROFILE%\.local\bin\claude.exe` (no Node needed). **npm:** `@anthropic-ai/claude-code` → `%APPDATA%\npm\claude.cmd` | `.exe` (native) **or** `.cmd` (npm) | only via npm | **No** if native `.exe`; **Yes** if npm `.cmd` | `--strict-mcp-config --mcp-config <file.json>` → `{"mcpServers":{"drift":{"type":"stdio","command":"<node.exe>","args":["<mcp-server.mjs>",…],"env":{…}}}}`. **Pure file** — no subprocess, no home-config token write | **LOW** ✅ Cleanest path. **Recommend native installer** to dodge `.cmd` entirely |
| **Gemini CLI** | **npm only:** `@google/gemini-cli` (Node **20+**) → `%APPDATA%\npm\gemini.cmd` | `.cmd` **always** | **always** | **Yes** (always) | `gemini mcp add drift -e CAIDO_TOKEN=… -e CAIDO_URL=… -- <node.exe> <mcp-server.mjs>` → writes `~/.gemini/settings.json`; cleanup `gemini mcp remove drift`. Use `-e` flags (no `$VAR` substitution; pass literals) | **HIGH** ⚠ Spawns MCP child with a **minimal/sanitized env** → must register **absolute** `node.exe`; open issues: "MCP Disconnected on Windows despite valid stdio," `mcp add` generating unloadable `settings.json`; token persists in settings.json |
| **Codex CLI** | **Native:** `install.sh` / winget → `codex.exe` (Rust, no Node). **npm:** `@openai/codex` (Node **22+**) → `%APPDATA%\npm\codex.cmd` (⚠ known `@openai/codex-win32-x64` optional-dep failure) | `.exe` (native) **or** `.cmd` (npm) | only via npm | **No** if native `.exe`; **Yes** if npm `.cmd` | `codex mcp add drift --env CAIDO_TOKEN=… -- <node.exe> <mcp-server.mjs>` → writes `~/.codex/config.toml` (`[mcp_servers.drift]`). Use **absolute** exe path if not found on PATH | **MEDIUM** Native Windows is officially supported/recommended as of 2026; token persists in `config.toml`; npm install path has the win32 optional-dep pitfall |
| **GitHub Copilot CLI** | **npm only:** `@github/copilot` (recent Node, **~22+**) → `%APPDATA%\npm\copilot.cmd`. **NOT** the deprecated `gh copilot` extension (EOL **2025-10-25**, no MCP) | `.cmd` **always** | **always** | **Yes** (always) | `--additional-mcp-config <file.json>` (highest precedence) **or** `~/.copilot/mcp-config.json` → `{"mcpServers":{"drift":{"type":"local","command":"<node.exe>","args":[…],"env":{…}}}}`. A `copilot mcp add` subcommand now also exists | **MED-HIGH** ⚠ Version-fragile Windows stdio spawn (regressed in 1.0.56-1: `spawn EINVAL`/`ENOENT` for `.cmd`/`npx` MCP commands). Registering `node.exe` (real exe) avoids it, but the surface is flaky. **In-repo install hint is the wrong product** |

**Cross-cutting consequence:** Drift registers the MCP server's `command` as a **real `node.exe`** (absolute path), so the CLIs' own spawning of the MCP child sidesteps the `.cmd` EINVAL trap. The EINVAL trap still applies to **Drift spawning the CLI binaries** (Gemini/Copilot always; npm Claude/Codex) — that's TS2.

### Correct Windows install commands (for TS8 — replace the Unix hints)

| CLI | Windows install command shown to user |
|-----|----------------------------------------|
| Claude Code | `irm https://claude.ai/install.ps1 \| iex`  *(recommended; native `.exe`)* — or `npm install -g @anthropic-ai/claude-code` |
| Gemini CLI | `npm install -g @google/gemini-cli`  *(Node 20+)* |
| Codex CLI | `npm install -g @openai/codex`  *(Node 22+)* — or download the native binary / `winget` |
| Copilot CLI | `npm install -g @github/copilot`  *(Node 22+)* — **NOT** `gh extension install github/gh-copilot` |

---

## Feature Dependencies

```
TS4 (os.tmpdir)
   └──enables──> TS1 (direct node spawn) ──enables──> TS5 (env injection) ──enables──> TS6 (health/self-test) ✅ user-visible "it works"

TS3 (Windows resolution: where/PATHEXT/USERPROFILE)
   ├──required by──> TS2 (.cmd-aware spawning)
   └──required by──> WP2 (auto-discovery) ──enables──> WP1 (path picker validation), WP4 (not-on-PATH detection)

TS2 (.cmd-aware spawning)
   ├──required by──> Gemini registration (gemini.cmd)
   ├──required by──> Codex/Copilot/npm-Claude launch + registration
   └──NOT required by──> native-Claude (claude.exe) launch  ← why Claude is the safe blocking path

WP5 (token-on-disk hardening) ──conflicts──> AF5 (mcp add persists token to home config)
```

### Dependency Notes

- **TS1 → TS5 → TS6:** the health self-test is just the direct-node-spawn path exercised with `--validate-auth`; you cannot get a green check without TS1+TS5. This chain **is** the reported bug.
- **TS3 underpins everything Windows-resolution:** TS2, WP1, WP2, WP4 all assume `where`/`PATHEXT`/`USERPROFILE` semantics exist first.
- **Claude's independence from TS2** is the strategic point: the blocking provider can ship green **before** the `.cmd` spawning work lands, as long as the user uses the native installer.
- **WP5 vs AF5:** hardening the token on disk is partly undone if Gemini/Codex registration writes the token into home config; sequence WP5 with the registration design.

---

## MVP Definition

### Launch With (this milestone = "Windows supported")

The blocking definition of done, Claude-first and lowest-risk:

- [ ] **TS1** — direct `node.exe` MCP spawn (kills `chmod`/bash/`.sh`)
- [ ] **TS4** — `os.tmpdir()` everywhere (`/tmp` gone)
- [ ] **TS3** — Windows node + CLI resolution (`where`/`PATHEXT`/`USERPROFILE` + Windows dirs)
- [ ] **TS5** — shell-free env injection (token reaches MCP subprocess)
- [ ] **TS6** — green health/self-test + auth validation on `windows-latest` **for the Claude path** — *the blocking acceptance test*
- [ ] **TS8** — correct Windows install hints (incl. Copilot fix)
- [ ] **Claude end-to-end on native `claude.exe`** via `--mcp-config` JSON(node.exe,args,env) — **the must-have**

> Claude clears MVP **without TS2**, because the native installer yields a real `.exe`. That is exactly why it's the right blocking provider.

### Add After Claude Is Green (still in-milestone, best-effort)

- [ ] **TS2** — `.cmd`-aware spawning — *the gate for Gemini/Copilot and npm-installed Claude/Codex*
- [ ] **TS7** — Windows process cancellation (`taskkill /T`)
- [ ] **TS9** — Node prerequisite handling/messaging
- [ ] **Gemini registration on Windows** (`mcp add -e … -- node …`) — flag as fragile (see matrix)
- [ ] **Codex registration on Windows** (`mcp add --env … -- node …`)
- [ ] **Copilot via `--additional-mcp-config`** (real `@github/copilot`)
- [ ] **WP1–WP4** polish (picker, auto-discovery, docs, not-on-PATH detection)

### Future Consideration (defer)

- [ ] **WP5** Windows token-ACL hardening — security improvement; ship behind the functional fix unless the store review blocks on it
- [ ] **WP6** Windows-aware diagnostics expansion — valuable for remote debugging but not gating

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| TS1 direct `node` spawn | HIGH | HIGH | MED | **P1** |
| TS6 health/self-test (Claude) | HIGH | MED | MED | **P1** |
| TS3 Windows resolution | HIGH | MED | MED | **P1** |
| TS4 `os.tmpdir()` | HIGH | LOW | LOW | **P1** |
| TS5 env injection | HIGH | MED | MED | **P1** |
| TS8 correct install hints | MED | LOW | LOW | **P1** |
| TS2 `.cmd`-aware spawning | HIGH | MED-HIGH | **HIGH** | **P1/P2** (P1 the moment any non-native CLI is targeted) |
| TS9 Node prerequisite messaging | MED | LOW | MED | **P2** |
| TS7 Windows cancellation | MED | LOW-MED | LOW | **P2** |
| Gemini Win registration | MED | MED | **HIGH** | **P2** |
| Codex Win registration | MED | MED | MED | **P2** |
| Copilot Win registration | MED | MED | MED-HIGH | **P2** |
| WP1 path picker `.exe`/`.cmd` | MED | LOW-MED | LOW | **P2** |
| WP2 auto-discovery | MED | MED | LOW | **P2** |
| WP3 Windows docs | MED | LOW | LOW | **P2** |
| WP4 not-on-PATH detection | MED | LOW-MED | LOW | **P2/P3** |
| WP5 token-on-disk hardening | MED | MED | MED | **P3** |
| WP6 Windows diagnostics | LOW-MED | LOW-MED | LOW | **P3** |

**Priority key:** P1 = blocking for "Windows supported" (Claude). P2 = in-milestone, makes all-4-CLIs + polish real. P3 = defer.

---

## Risk / Uncertainty Flags (for the roadmap to schedule deeper phase research)

- **HIGH — `.cmd` EINVAL spawning (TS2):** the under-documented second bug. The "spawn node directly" decision does **not** cover spawning the CLI binaries. Decide early: resolve `.cmd`→`node <js>` (preferred, no-shell) vs `cmd /c` (shell-quoting hazard). Affects Gemini/Copilot/npm-Claude/npm-Codex.
- **HIGH — Gemini Windows MCP reliability:** minimal-env subprocess spawning + absolute-path requirement + open "Disconnected despite valid stdio" and "unloadable settings.json" issues. Treat Gemini-on-Windows as best-effort and gate on a real-machine check.
- **MED — Copilot version fragility:** native Windows stdio MCP spawn regressed within point releases (1.0.51 ok → 1.0.56-1 broke). Pin expectations to a recent version; document minimum.
- **MED — Caido QuickJS runtime gaps:** PROJECT.md flags that `os.tmpdir()` / `process.platform` availability in Caido's backend runtime is **unconfirmed**. TS4 and all platform branching depend on it — verify before building.
- **MED — token persistence via `mcp add`:** Gemini/Codex registration writes the Caido token into home-config files; reconcile with WP5 and ensure `mcp remove` on stop.
- **LOW — Codex "experimental" vs "supported" drift:** OpenAI's current Codex Windows page says native is supported/recommended; older sources say experimental. Treat as supported-with-caveats.

---

## Competitor / Prior-Art Reference (how other Node tools solve the Windows spawn problem)

| Problem | Common solution in the ecosystem | Our approach |
|---------|----------------------------------|--------------|
| `spawn` of `.cmd`/`.bat` → `EINVAL` | `cross-spawn` (wraps via `cmd /c`, handles arg-escaping) — used by most cross-platform Node CLIs | Prefer resolving `.cmd`→`node <js-entry>`; adopt `cross-spawn`-style handling only where a shim must be run as-is |
| stdio MCP server can't find `node`/`npx` | Register the **absolute** path to the executable; `cmd /c npx …` pattern in config JSON | Register absolute `node.exe` + `mcp-server.mjs` path; never register bare `npx`/`.cmd` |
| `which` missing on Windows | `where` / parse `PATH`+`PATHEXT` manually | TS3 |

---

## Sources

**HIGH confidence (official docs / multi-source-confirmed / reproduced GitHub issues):**
- Node.js April 2024 security release & CVE-2024-27980 (`.cmd`/`.bat` `EINVAL` without `shell`) — https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2 ; https://seclists.org/oss-sec/2024/q2/79 ; https://nodejs.org/api/child_process.html
- Claude Code native Windows installer + binary path `%USERPROFILE%\.local\bin\claude.exe` — https://code.claude.com/docs/en/setup ; https://github.com/anthropics/claude-code/issues/42337 ; https://github.com/anthropics/claude-code/issues/25577
- Claude Code MCP `--mcp-config` JSON (`type/command/args/env`), `add-json`, stdio — https://code.claude.com/docs/en/mcp
- `@anthropic-ai/claude-code` npm — https://www.npmjs.com/package/@anthropic-ai/claude-code
- Gemini CLI install (Node 20+, `npm i -g @google/gemini-cli`) + `mcp add -e` — https://www.npmjs.com/package/@google/gemini-cli ; https://github.com/google-gemini/gemini-cli ; https://geminicli.com/docs/tools/mcp-server/
- Gemini Windows MCP issues (Disconnected despite valid stdio; broken settings.json; minimal-env spawn) — https://github.com/google-gemini/gemini-cli/issues/25992 ; https://github.com/google-gemini/gemini-cli/issues/15551 ; https://github.com/google-gemini/gemini-cli/issues/4675
- Codex CLI Windows (native supported) + `mcp add --env` + `config.toml` — https://developers.openai.com/codex/windows ; https://developers.openai.com/codex/mcp ; https://github.com/openai/codex
- Codex npm win32 optional-dep pitfall — https://www.npmjs.com/package/@openai/codex ; https://inventivehq.com/blog/how-to-install-codex-cli
- Copilot CLI `@github/copilot` install + MCP `mcp-config.json` (`type/command/args/env`, `~/.copilot/`) — https://www.npmjs.com/package/@github/copilot ; https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers ; https://github.com/github/copilot-cli
- Copilot Windows stdio MCP spawn EINVAL regression — https://github.com/github/copilot-cli/issues/3576
- `gh copilot` extension deprecation (EOL 2025-10-25, replaced by standalone CLI) — https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension/

**MEDIUM confidence (community/aggregator-confirmed, single canonical source, or version-sensitive):**
- Copilot `--additional-mcp-config` flag + precedence — https://deepwiki.com/github/copilot-cli/5.3-mcp-server-configuration ; https://inventivehq.com/knowledge-base/copilot/how-to-set-up-mcp-servers (not present on the canonical GitHub docs page fetched — verify against `copilot --help` in-phase)
- Exact Node-version floors per CLI (Gemini 20+, Codex 22+, Copilot ~22+) — from install docs; confirm at build time
- npm global shim location `%APPDATA%\npm\<tool>.cmd` — standard npm-on-Windows behavior

---
*Feature research for: native Windows support, Drift (Caido ↔ local AI CLI MCP bridge)*
*Researched: 2026-06-26*
