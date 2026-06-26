# Drift

## What This Is

Drift is a Caido plugin that turns the user's own local AI CLIs (Claude Code / Gemini / Codex / Copilot) into a security copilot for manual web-app testing. It runs a local MCP server that exposes ~18 Caido-aware tools (history search, request replay, findings, environment, intercept, workflows) to those CLIs — local-first, no API keys, using the user's existing CLI auth and Caido session token. It's for pentesters and bug-bounty hunters who already live in Caido.

## Core Value

A working bridge: the user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data. If the MCP runtime doesn't launch, nothing else matters.

## Requirements

### Validated

<!-- Shipped in 0.1.0 and relied upon. Locked. -->

- ✓ MCP server bridging Caido ↔ local AI CLIs, ~18 tools across permission groups (read / replay / findings / environment / intercept / workflow) — 0.1.0
- ✓ Four CLI providers: Claude Code, Gemini, Codex, Copilot — 0.1.0
- ✓ Per-tool permission groups + sensitive-action approval flow — 0.1.0
- ✓ Caido session-token auth + MCP health self-test (tools/list, get_environment, search_history) — 0.1.0
- ✓ Project-scoped SQLite persistence (settings + chats), survives plugin reinstalls — 0.1.0
- ✓ Local-first, no API keys (uses the user's own CLI auth) — 0.1.0
- ✓ Vue frontend (chat UI + settings) and signed Caido plugin packaging/release pipeline — 0.1.0
- ✓ Runs on macOS and Linux (incl. WSL) — 0.1.0

### Active

<!-- This milestone: native Windows support (parity + polish). All 4 CLIs, Claude blocking. -->

- [ ] MCP runtime launches on **native Windows** — replace POSIX shell-wrapper indirection (`#!/bin/bash` + `chmod +x` + direct `.sh` spawn) with direct `node` spawn, env passed via spawn `env` + MCP config JSON `env`
- [ ] MCP health check / self-test passes on Windows (`validateCaidoAuth`, `callMcpMethod`)
- [ ] Node + CLI binary resolution works on Windows (`where` instead of `which`, `.exe`/`.cmd`, `%USERPROFILE%`/`%APPDATA%`/`%LOCALAPPDATA%` install locations)
- [ ] Cross-platform temp dir (`os.tmpdir()`) for the runtime dir + orphan sweep + debug logs (no hardcoded `/tmp`)
- [ ] All 4 CLIs usable on Windows — **Claude is the blocking must-have**; Gemini/Codex/Copilot best-effort where their own CLI has Windows quirks
- [ ] MCP registration into external CLIs works on Windows (`gemini`/`codex mcp add` get a runnable command + env, not a `.sh`)
- [ ] **Windows polish:** binary-path picker accepts `.exe`/`.cmd`; Windows install + prerequisites docs; friendlier "CLI/Node not found" guidance for Windows paths
- [ ] CI on `windows-latest` (build + vitest) as a permanent regression net
- [ ] Zero regressions on macOS/Linux (existing snapshot/unit tests stay green)

### Out of Scope

- New MCP tools or features unrelated to Windows — keep this milestone focused on platform parity
- WSL-specific work — WSL already works (it's Linux); the gap is *native* Windows
- Changing the Caido SDK / plugin runtime itself — outside our control
- Non-Node-launchable providers — the architecture assumes CLIs that node can spawn

## Context

- Existing, shipping plugin. Store submission is PR caido/store#89; the `0.1.0` release was just re-cut with correct assets (`plugin_package.zip` + signature) and is awaiting merge.
- A native-Windows user (@0xMRK0S on X) reported "failed to run the mcp server and check the health mcp." Root cause already diagnosed: the entire MCP launch path in `packages/backend/src/index.ts` is POSIX-only with zero Windows branches. The exact first failure is `writeMcpWrapper` calling `spawnAndWait("chmod", …)`, which doesn't exist on Windows.
- Full landmine inventory (12 cross-platform issues, each with `file:line`) lives in `.planning/codebase/CONCERNS.md`. Architecture/flow in `.planning/codebase/ARCHITECTURE.md`; test setup in `.planning/codebase/TESTING.md`.

## Constraints

- **Compatibility**: Must preserve existing macOS/Linux behavior — the current user base ships on those. No POSIX regressions.
- **Runtime**: Backend runs in Caido's constrained JS runtime (comments note Zod crashes QuickJS). Only use Node APIs Caido actually provides. Whether `os.tmpdir()` and `process.platform` are available in that runtime is an open research question for planning — confirm before relying on them.
- **Testing**: The maintainer cannot test native Windows locally. Validation is CI on `windows-latest` (build + vitest) plus, where possible, the original reporter confirming the fix on a real machine.
- **Security**: Runtime temp files carry the Caido token (today `0o600`/`0o700`). Windows ignores POSIX modes — need a Windows-appropriate equivalent (per-user temp dir ACLs) or an accepted trade-off.
- **Store**: Must stay compliant with the Caido developer policy and the signed release pipeline (`plugin_package.zip` + `.sig`, unprefixed tag).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Drop the POSIX shell-wrapper indirection; spawn `node` directly and pass env via spawn `env` + MCP config JSON `env` | `chmod` / `#!/bin/bash` / direct `.sh` spawn are the root Windows failures; direct spawn is fully cross-platform and removes 3 landmines at once | — Pending |
| Milestone scope = parity **+** Windows polish | User choice: close the bug *and* make native Windows a first-class install (path picker, docs, prereq UX) | — Pending |
| Target all 4 CLIs, with Claude as the blocking must-have | Claude is the primary provider; Gemini/Codex/Copilot are best-effort if their own CLI behaves oddly on Windows | — Pending |
| Validate via CI on `windows-latest` | Maintainer can't test native Windows; CI is the permanent regression net and the source of truth for "it builds + tests pass on Windows" | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-26 after initialization*
