# Project Research Summary

**Project:** Drift — Native Windows Milestone
**Domain:** Cross-platform Caido plugin (LLRT/QuickJS runtime) spawning Node MCP server + AI CLIs on native Windows
**Researched:** 2026-06-26
**Confidence:** HIGH for core spawn mechanics, CVE facts, MCP config shapes, and per-CLI distribution; MEDIUM for Caido LLRT behavior on Windows (CI-verify required before building)

---

## Executive Summary

Drift's Windows failure is not one bug but two distinct classes of breakage. The first and already-diagnosed class is the POSIX shell-wrapper indirection: `writeMcpWrapper` calls `chmod +x` (which does not exist on Windows), then spawns a `.sh` file (which Windows cannot execute). The fix — spawn `node.exe` directly and pass env via `spawn`'s `env` option — is architecturally correct, is exactly how Claude Desktop, VS Code, and Cursor launch stdio MCP servers, and is confirmed safe in Caido's documented `child_process.spawn` API. The second class is the `.cmd` EINVAL trap: npm-global shims for Gemini, Copilot, and (fallback) Claude/Codex resolve to `.cmd` files, and Node ≥ 18.20.2/20.12.2/21.7.3 throws `EINVAL` when a `.cmd` is spawned directly without a shell (CVE-2024-27980). This second class affects provider launch in `sendCliMessage` and `mcp add` registration subprocesses — it is entirely separate from the MCP server spawn fix and will bite after the first fix lands.

The recommended approach is a single-keystone architecture: `buildMcpServerSpec()` returns `{ command: <absNode>, args: [<absMjs>], env: {...} }` and every consumer — self-test, Claude config JSON, Copilot config JSON, `gemini mcp add`, `codex mcp add` — is derived from that one spec. The MCP server is always launched as `node.exe` (a real PE executable), bypassing both `.cmd` EINVAL and any shell entirely. Provider binaries that resolve to `.cmd` shims are handled by a separate `buildSpawnSpec()` helper that uses `cmd.exe /d /s /c <shimAbsPath> <args>` with `shell:false` — never `shell:true` with dynamic args. Binary discovery replaces `which` with `where.exe` and augments with explicit Windows install-location candidates built from `os.homedir()`/`%APPDATA%`/`%LOCALAPPDATA%`.

The critical unknown is Caido's LLRT runtime behavior on Windows. Every load-bearing assumption — that `spawn({env})` passes env to the child, that `os.tmpdir()`/`os.platform()` return real Windows values, that `os` is importable as a bare specifier — is documented at module-surface level but unverified at runtime, because LLRT is explicitly partial and "not a drop-in Node replacement." The recommended Phase 1 is therefore a thin CI spike on `windows-latest` that proves these four primitives before any production code is written on top of them. Skipping the spike risks building a complete port on an assumption that fails only at first real-machine test.

---

## Key Findings

### Recommended Stack

Drift's stack does not change for this milestone. The Windows port is API-substitution inside the existing Caido/LLRT runtime — no new runtime dependencies needed; the fix actually removes dependencies (`bash`, `chmod`, `which`, the `.sh` wrapper layer). The relevant runtime facts are:

- **Caido backend runtime (LLRT / QuickJS):** All needed modules are documented as present (`os`, `child_process`, `fs/promises`, `path`, `crypto`) but every one is marked partial. Treat no LLRT API as Node-identical without CI proof.
- **`node.exe` (absolute path, resolved via `where`):** The linchpin. A real PE executable on every Windows Node install method — spawnable directly, no shell, no EINVAL, no injection surface.
- **`where.exe` (Windows built-in, System32):** Replaces `which`. Honors `PATHEXT` so it finds `.exe` and `.cmd`. Returns CRLF-separated matches — parse with `/\r?\n/` and prefer `.exe` over `.cmd` when multiple matches exist.
- **`cmd.exe` (`%ComSpec%`):** Correct fallback for `.cmd`/`.bat` provider shims. Used as `spawn(comspec, ["/d","/s","/c", shimAbsPath, ...args], { shell: false })`.
- **`os` module:** `tmpdir()`, `homedir()`, `platform()` — confirmed exposed by Caido's documented `extra/os` module. Prefer `os.platform()` over `process.platform` (`os.platform()` is documented; `process.platform` is only partial in LLRT).
- **Node.js user system (≥ 20.12.2 in practice):** CVE-2024-27980 EINVAL guard is active everywhere. Assume it; design around it.

**Version threshold:** MCP server (`mcp-server.mjs`) requires Node ≥ 18. Provider CLIs: Gemini ≥ 20, Codex ≥ 22, Copilot ≥ 22 (approximate). Claude Code native installer bundles no system Node — Drift still needs a separate `node.exe ≥ 18` for `mcp-server.mjs`.

### Expected Features

**Must-have (table stakes — Claude-first definition of done):**
- TS1 — Direct `node.exe` MCP spawn (kills `chmod`/bash/`.sh`; root cause fix)
- TS4 — `os.tmpdir()` everywhere (replaces 3 hardcoded `/tmp` sites)
- TS3 — Windows node + CLI resolution (`where`/`PATHEXT`/`USERPROFILE` + Windows install dirs)
- TS5 — Shell-free env injection (token reaches MCP subprocess without a bash export wrapper)
- TS6 — Green health check + auth validation on Windows for the Claude path
- TS8 — Correct Windows install hints per CLI, including the Copilot product correction (`@github/copilot`, not the deprecated `gh copilot` extension EOL 2025-10-25)
- Claude end-to-end: `claude.exe` (native installer) launched with `--mcp-config` JSON containing `{command: <absNode>, args: [<absMjs>], env: {...}}`

**Should-have (in-milestone, gates the remaining 3 CLIs):**
- TS2 — `.cmd`-aware provider spawning (`buildSpawnSpec`, `cmd.exe /c` for batch shims)
- TS7 — Windows process cancellation (`taskkill /pid <pid> /T /F` instead of signal)
- TS9 — Node prerequisite detection/messaging for users who installed Claude via native installer
- Gemini/Codex/Copilot registration on Windows with token hygiene

**Windows polish (WP1–WP4):** Binary picker accepting `.exe`/`.cmd`; auto-discovery of Windows install locations; not-on-PATH detection; install docs page.

**Defer:**
- WP5 — Explicit `icacls` ACL hardening (per-user `%TEMP%` ACL accepted as baseline trade-off)
- WP6 — Windows-specific diagnostics expansion

**Anti-features (do not build):** Require WSL; keep any bash/`.sh` indirection; `{shell:true}` with dynamic args; bundle or auto-install Node/CLIs; silently persist Caido token in `~/.gemini`/`~/.codex` without cleanup.

### Architecture Approach

The target architecture has one keystone: `buildMcpServerSpec()` returns `{ command: absNode, args: [absMjs], env: { CAIDO_*, DRIFT_* } }` and every consumer derives from it. All platform logic lives in a new pure `platform.ts` module that takes `(platform, env)` as arguments — never reads `os.platform()` itself — making Windows behavior unit-testable on a Linux CI runner. The orchestrator `index.ts` does all I/O, reads `os.platform()` and `process.env` once, and passes them to the pure helpers.

**Major components:**
1. `platform.ts` (new, pure) — `isWindows`, `tempRoot`, `whichToolName`, `homeDirsFromEnv`, `executableCandidateNames`, `buildSpawnSpec`; fully unit-testable without a Windows machine
2. `buildMcpServerSpec()` (new, in `index.ts`) — single source of truth for MCP server launch; all five consumers derive from this
3. `command-resolution.ts` (extended) — Windows install-location candidates, `C:\Users\` shape in `extractHomeDir`, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` in `getKnownHomeDirs`, `where` branch
4. `spawnNode()` (new, in `index.ts`) — single spawn chokepoint for the MCP server; owns retry-on-EPERM logic for AV race mitigation
5. **All deleted:** `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call, every `.sh` filename

**Build dependency order (ARCHITECTURE.md Phases A–F):** A (platform.ts + os.tmpdir) → B (kill wrappers + direct spawn) → C (Windows resolution) → D (provider spawn + registration) → E (signals + polish) → F (Windows CI net)

### Critical Pitfalls

1. **`shell:true` with dynamic args reopens CVE-2024-27980** — Even with "controlled" argv, `%TEMP%` paths include the username: `C:\Users\First Last\AppData\...` or `C:\Program Files (x86)\...` flow into cmd.exe unescaped. Ban `shell:true` with dynamic args; use `cmd.exe /d /s /c <shimPath> <args>` argv array with `shell:false` instead.

2. **ENOENT without extension, EINVAL with it — the `.cmd` squeeze** — Node does not consult `PATHEXT` for bare command names (`spawn("claude")` misses `claude.cmd`). But resolving to `claude.cmd` and spawning it directly throws `EINVAL` on Node ≥ 18.20.2. Resolution: always resolve to absolute path with extension; branch on extension to decide spawn strategy. Keep POSIX path byte-for-byte unchanged behind `platform !== "win32"` guards.

3. **AV file-lock race (Defender EPERM/EBUSY on rename/spawn)** — Windows Defender holds a transient exclusive handle on freshly-written files. Drift's write→rename→spawn hot path will see intermittent `EPERM`/`EBUSY`. Mitigation: copy `mcp-server.mjs` to temp **once at MCP start and reuse**, not per-turn; wrap rename/spawn in bounded retry (5 attempts, 50–500 ms backoff) catching `EPERM`/`EBUSY`/`UNKNOWN`.

4. **Orphaned process trees — `proc.kill()` abandons children on Windows** — Windows has no POSIX signals. `kill('SIGKILL')` terminates only the immediate process; the CLI's child `node mcp-server.mjs` (holding the Caido token in its env) survives as an orphan. Fix: `spawn("taskkill", ["/pid", pid, "/T", "/F"])` in the Windows branch.

5. **Token relocation, not removal — `0o600` is a no-op on Windows** — The env-injection refactor moves the token from bash scripts to MCP config JSON and (for Gemini/Codex) to `~/.gemini/settings.json` / `~/.codex/config.toml`. File mode `0o600`/`0o700` is silently ignored on Windows. Per-user `%TEMP%` ACL is the accepted baseline for Drift's temp dir; `mcp add`-persisted config in home dirs has no equivalent protection.

---

## Reconciled Decision Points

Four areas where the four research docs left open choices. Each is resolved here with a single recommended approach.

### Decision Point 1: `.cmd` Provider Spawn Strategy

**The tension:** STACK and PITFALLS recommend `cmd.exe /d /s /c <shimAbsPath> <args>` with `shell:false`. ARCHITECTURE's `buildSpawnSpec` example returns `{ shell: isBatch }` (i.e., `shell:true` for `.cmd` files), arguing this is safe because Drift controls provider argv and the prompt travels via stdin.

**Recommendation: avoid `shell:true`; use `cmd.exe /d /s /c` argv array** (STACK + PITFALLS win over ARCHITECTURE).

ARCHITECTURE's "Drift controls provider argv" argument is true for prompt content, but not fully true for path arguments. `%TEMP%` resolves to `C:\Users\<username>\AppData\Local\Temp` and a username of `First Last` or `Jo & Co` causes `cmd.exe` to mis-split or re-interpret args when `shell:true` concatenates them into a single command string. The `cmd.exe /d /s /c` array form with `shell:false` avoids this because Node uses Windows `CreateProcess` argument quoting for each array element.

Concretely, `buildSpawnSpec` should return:

```ts
if (isBatch) {
  const comspec = env.ComSpec ?? process.env.ComSpec ?? "cmd.exe";
  return { command: comspec, args: ["/d", "/s", "/c", resolvedAbsPath, ...args], shell: false };
}
return { command: resolvedAbsPath, args, shell: false };
```

**Preferred path (avoids cmd.exe entirely):** When a `.cmd` shim can be traced to its underlying `node <js-entry>`, spawn `node.exe <js-entry>` directly. Reserve the `cmd.exe /c` form for shims where the underlying entry cannot be reliably detected.

**Residual risk:** Even with the `cmd.exe /c` argv array, some edge cases (args containing `%VAR%`-style tokens, unusual cmd.exe flag interactions) can misbehave. The invariant to preserve: keep user-derived content exclusively on stdin, never in argv. Document this in code comments so it is not accidentally broken.

### Decision Point 2: Token Hygiene for Gemini/Codex `mcp add`

**The problem:** `gemini mcp add -e CAIDO_TOKEN=<rawtoken>` and `codex mcp add --env CAIDO_TOKEN=<rawtoken>` persist their config to `~/.gemini/settings.json` and `~/.codex/config.toml` — outside Drift's `%TEMP%` sweep area, with POSIX modes ignored on Windows, surviving until `mcp remove` is explicitly run.

**Recommended mitigation: `${CAIDO_TOKEN}` variable reference in registration** (ARCHITECTURE recommendation; supported by Gemini's documented `$VAR`/`${VAR}` expansion).

For Gemini: register with `-e CAIDO_TOKEN=${CAIDO_TOKEN}` (a variable reference, not the raw secret). The persisted `settings.json` holds only `${CAIDO_TOKEN}`. When Gemini later spawns the MCP server, Drift sets the real `CAIDO_TOKEN` in the spawn env (already done in `sendCliMessage`'s `runtimeEnv`), and Gemini expands it. If a user runs Gemini outside Drift, the token is empty — MCP auth fails, no secret leak.

For Codex: Gemini's `${VAR}` expansion is documented. Codex's equivalent is not clearly documented — whether `codex mcp add --env CAIDO_TOKEN=${CAIDO_TOKEN}` defers expansion to spawn time is a CI-verify item. If unconfirmed, the fallback is the `DRIFT_TOKEN_FILE` indirection:
1. Drift writes `{ "CAIDO_TOKEN": "<raw>" }` to `<mcpTempDir>/mcp-secrets.json` (in the per-user temp dir, swept on stop)
2. Register `--env DRIFT_TOKEN_FILE=<path>` (not the token itself) in `codex mcp add`
3. `mcp-server.mjs` reads the token from that file on startup (it already reads `DRIFT_CONTEXT_FILE` with this exact pattern — extend it)

**Always run `mcp remove`:** Guarantee that `gemini mcp remove drift` and `codex mcp remove drift` run during cleanup/stop. A failed `mcp remove` should be logged as a warning with instructions for the user to manually clean up, not silently dropped.

Claude and Copilot require none of this — their config JSON lives in Drift's temp dir and Drift owns its lifetime.

### Decision Point 3: Must-Prove on `windows-latest` CI Before Building

All four docs independently flag that LLRT behavior on Windows is unverified. This is the consolidated, prioritized must-prove list. These 7 assertions should be the entire content of Phase 1.

**P0 — Fatal if wrong (proves the entire fix is viable):**
1. `spawn(nodeAbsPath, [mcpScriptPath], { env: { SENTINEL: "ok" } })` — child receives `process.env.SENTINEL === "ok"`. This is the single most critical test: if LLRT does not pass `env` to the child, the entire "direct spawn + env injection" architecture needs a fallback (a minimal `.cmd` launcher that `set`s env vars — only if CI forces it).
2. `os.tmpdir()` returns a string starting with a drive letter (e.g., `C:\`) and the path exists on disk. `os.platform()` returns `"win32"`. Both inside the Caido backend runtime on a Windows host.

**P1 — Shapes the provider spawn strategy:**
3. Attempt `spawn("dummy.cmd", [])` from LLRT — record whether it throws `EINVAL`, runs, or hangs. Whether LLRT reproduces the EINVAL guard determines whether the `buildSpawnSpec` branch is mandatory or just good practice.
4. Spawn `where.exe node` from LLRT — assert stdout is non-empty, split on `/\r?\n/`, and the first match is a valid `.exe` path. Confirms `where` is spawnable from LLRT and its CRLF output is parseable.

**P2 — Shapes encoding and import approach:**
5. `import { tmpdir, homedir, platform } from "os"` resolves without error in LLRT (bare `"os"` specifier, matching the shipping codebase convention). If `"node:os"` is required instead, all imports need the prefix.

**P3 — Security and env completeness:**
6. `process.env.USERPROFILE`, `process.env.APPDATA`, `process.env.LOCALAPPDATA` are all non-empty strings inside LLRT on Windows.
7. `typeof globalThis.crypto?.randomUUID === "function"` — confirms the `crypto.randomUUID()` upgrade for temp dir naming is viable.

### Decision Point 4: Landmine-to-Phase Mapping and Critical Path to Claude

**Critical path: Claude on Windows = Phases 1 + 2 + 3 + 4 + [Phase 5 provider-spawn slice]**

```
Phase 1 (CI Spike: prove LLRT basics)
    |
Phase 2 (Platform Foundation: os.tmpdir, temp naming, AV retry, platform.ts)
    |
Phase 3 (Kill Shell Wrappers: buildMcpServerSpec, direct node spawn, env injection)
    --> Self-test + health check green on Windows for node/mjs path
    --> MCP server attaches to Claude via --mcp-config JSON with node.exe command
    |
Phase 4 (Windows Command Resolution: where, PATHEXT, USERPROFILE, CRLF-safe, candidate paths)
    --> node.exe + claude.exe (or claude.cmd) resolvable on Windows
    |
Phase 5 provider-spawn slice (buildSpawnSpec for launching the claude binary itself)
    --> Claude provider spawnable end-to-end
    |
    *** CLAUDE MVP UNLOCKED ***
```

Phases 6–8 unlock the remaining 3 CLIs, process lifecycle hardening, and polish.

---

## Implications for Roadmap

### Phase 1: CI Spike — Prove LLRT Basics on Windows
**Rationale:** All four research docs agree: building a complete port on LLRT assumptions that fail at first real-machine test is the highest-risk scenario. The CI spike has near-zero implementation cost and unblocks confident building of all subsequent phases.
**Delivers:** A required `windows-latest` CI job with 7 targeted assertions (Decision Point 3). Green = confirmed that `spawn({env})` and `os.*` work in LLRT on Windows.
**Addresses:** PITFALLS Pitfall 8 (QuickJS runtime gaps), STACK CI-VERIFY checklist, PROJECT.md open question about `os.tmpdir()` / `process.platform` availability.
**Avoids:** Building 6+ phases on an assumption that fails only at the reporter's machine.
**Research flag: YES — this phase IS the research.** No deeper planning research needed; it is a self-contained spike.

### Phase 2: Platform Foundation
**Rationale:** Establishes the pure helpers and OS-abstraction layer that every subsequent phase depends on. The AV-retry and copy-once changes should ship before the reporter re-tests.
**Delivers:** `platform.ts` (pure, fully unit-tested); all 3 `/tmp` hardcodes replaced with `os.tmpdir()`; temp-path naming shortened for MAX_PATH safety (shorter UUID, drop redundant `drift-` prefix inside already-namespaced dir); AV-retry wrapper (5 attempts, 50–500 ms backoff on EPERM/EBUSY); `crypto.randomUUID()` for temp dir names (if CI confirmed); runtime probe at MCP start (fail-loud with Caido version if `os.tmpdir()` or `spawn` are missing).
**Addresses:** TS4, PITFALLS P7 (MAX_PATH), PITFALLS P3 (AV race), PITFALLS P8 (QuickJS gap diagnostics).
**Research flag: NO** — well-documented Node/Windows APIs.

### Phase 3: Kill Shell Wrappers
**Rationale:** This is the direct fix for the reported bug. After this phase, the MCP self-test and health check pass on Windows for the Claude path.
**Delivers:** `buildMcpServerSpec()` and `spawnNode()`; rewrite of `validateCaidoAuth` + `callMcpMethod` to spawn `node.exe` directly with `env`; rewrite of Claude/Copilot config writers to embed `{command,args,env}` JSON; deletion of `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, all `chmod` calls, all `.sh` files. Zero POSIX regressions (snapshot tests stay green).
**Addresses:** TS1, TS5, TS6, PITFALLS P1 (shell:true ban) and P2 (EINVAL/ENOENT, POSIX regression guard).
**Research flag: NO** — design fully specified in ARCHITECTURE.md.

### Phase 4: Windows Command Resolution
**Rationale:** Claude (even native `.exe`) and all CLIs need `node.exe` to be locatable. Depended on by Phase 5.
**Delivers:** `command-resolution.ts` extended with Windows install candidates (npm global `%APPDATA%\npm`, native `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows dirs, `%ProgramFiles%\nodejs`); `where`-not-`which` branch; CRLF-safe `where` output parsing; `.exe`-over-`.cmd` preference via `executableCandidateNames`; `C:\Users\` shape in `extractHomeDir`; `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` in `getKnownHomeDirs`. TS8: correct Windows install hints per CLI (including Copilot product fix). `.gitattributes` for CRLF stability.
**Addresses:** TS3, TS8, TS9, WP2, WP4, PITFALLS P2 (ENOENT squeeze), PITFALLS P6 (CRLF).
**Research flag: NO** for Windows install paths. MEDIUM for Volta/fnm/nvm-windows edge cases — verify candidate list against current installer docs at build time.

### Phase 5: Provider Spawn and Registration
**Rationale:** Completes the Claude critical path and adds the remaining 3 CLIs. Highest-risk phase due to Gemini Windows reliability issues.
**Delivers:** `buildSpawnSpec()` integrated into `sendCliMessage` (Decision Point 1: `cmd.exe /d /s /c` argv array for `.cmd` shims, direct spawn for `.exe`); rewrite of `registerMcpWithCli` to pass `node.exe + mcp-server.mjs + env` via `-e`/`--env` flags; `${CAIDO_TOKEN}` reference strategy for Gemini; `DRIFT_TOKEN_FILE` indirection for Codex (if `${VAR}` expansion unconfirmed); guaranteed `mcp remove` on cleanup; WP1 binary picker accepting `.exe`/`.cmd`.
**Addresses:** TS2, TS9, PITFALLS P1, P5, P5b; FEATURES matrix for Gemini/Codex/Copilot.
**Research flag: YES for Gemini** — open issues for "MCP Disconnected on Windows despite valid stdio" and "broken settings.json." Treat Gemini-on-Windows as best-effort; gate on a real-machine check. Codex `${VAR}` expansion also needs CI confirmation.

### Phase 6: Process Lifecycle
**Rationale:** Makes cancel/timeout actually stop work on Windows. Without this, every cancelled turn leaks an orphan `node.exe` holding the Caido token.
**Delivers:** `killTree(proc)` helper: Windows branch uses `spawn("taskkill", ["/pid", pid, "/T", "/F"])` with guard for undefined pid; POSIX branch keeps existing SIGTERM→SIGKILL ladder. All kill sites in `index.ts` updated. Session finalize calls `killTree` for all tracked pids before sweeping temp files.
**Addresses:** TS7, PITFALLS P4 (orphaned process trees), security (token-bearing orphan MCP process survives session).
**Research flag: NO** — `taskkill` is a well-documented Windows built-in.

### Phase 7: CI Hardening
**Rationale:** Locks in all gains as a permanent regression net. Can begin in parallel with Phase 5 (CI setup is independent of provider code).
**Delivers:** Required `windows-latest` CI job (build + vitest, `pnpm/action-setup@v4` + `actions/setup-node@v4 cache:pnpm`, `shell: bash` pinned); `.gitattributes` (`* text=auto eol=lf`); snapshot tests normalized for `\r?\n` on Windows; `mcp-server.*.test.ts` integration spawn tests confirmed running on Windows runner.
**Addresses:** PITFALLS P9 (CI windows-latest gotchas), PITFALLS P6 (CRLF in CI), PROJECT.md requirement.
**Research flag: NO** — GitHub Actions Windows runner behavior is well-documented.

### Phase 8: Windows Polish
**Rationale:** Completes the "first-class Windows install" scope beyond bare parity.
**Delivers:** WP3 Windows prerequisites docs (native-installer recommendation for Claude, PowerShell `Set-ExecutionPolicy RemoteSigned` note, Node 18+ requirement, Codex npm win32 optional-dep caveat); WP4 not-on-PATH detection for Claude native installer; WP6 Windows-aware diagnostics (resolved binary, spawn strategy used, `mcp add` skip reason); `windowsHide: true` on all spawns.
**Addresses:** TS8 polish, TS9 improved messaging, WP3, WP4, WP6, UX pitfalls.
**Research flag: NO** — UX copy and file-system probes.

### Phase Ordering Rationale

- **Phase 1 must be first** because every subsequent phase depends on confirmed LLRT behavior. Running it later means discovering failures after weeks of implementation.
- **Phase 2 before Phase 3** because `buildMcpServerSpec` needs `os.tmpdir()` and the AV-retry wrapper from the platform foundation.
- **Phase 3 before Phase 4** because Windows command resolution is meaningless if the spawn call itself still goes through a POSIX shell.
- **Phase 4 before Phase 5** because `buildSpawnSpec` needs resolved absolute paths with extensions.
- **Phase 5 before Phase 6** because the process-lifecycle kill needs to know which processes were spawned.
- **Phase 7 can begin in parallel with Phase 5** but should be complete before Phase 8.
- **Claude MVP = Phases 1–4 + Phase 5 provider-spawn slice.** Remaining phases follow in order.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (CI Spike):** This phase IS the research. Its 7 assertions resolve the LLRT unknowns all other phases depend on. Results must feed back to the roadmap before Phase 2 begins.
- **Phase 5 (Gemini registration):** Open GitHub issues for Gemini Windows MCP reliability are unresolved. Plan a real-machine confirmation checkpoint before calling Gemini done. Codex `${VAR}` expansion needs CI confirmation.

Phases with standard patterns (skip research-phase):
- **Phases 2–4, 6–8:** Well-documented Node/Windows APIs; design fully specified in research docs.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (runtime facts) | HIGH for Node/Windows/LLRT module surface; LOW for LLRT Windows runtime behavior | Module presence is documented by Caido; exact behavior on Windows is unverified — Phase 1 CI spike converts this to HIGH |
| Features (per-CLI facts) | HIGH for Claude/Codex; MEDIUM-HIGH for Copilot; MEDIUM for Gemini Windows | Claude native installer + MCP config shape confirmed from official docs. Gemini Windows MCP has open reliability issues. Copilot version-fragile (regressed in 1.0.56-1). |
| Architecture (design patterns) | HIGH | `buildMcpServerSpec` keystone, `platform.ts` pure-helpers pattern, and comparable-tool canon all confirmed against official docs and production MCP host behavior. |
| Pitfalls (risk identification) | HIGH for CVE/spawn/kill/CI pitfalls; MEDIUM for AV timing | CVE-2024-27980 EINVAL behavior, `taskkill` semantics, and CI autocrlf are well-documented. AV file-lock timing is mechanism-documented but exact Node errno behavior is community-corroborated, not a single authoritative source. |

**Overall confidence:** MEDIUM-HIGH. The design is sound and well-grounded. The single gap is LLRT Windows runtime behavior — specifically whether `spawn({env})` passes env to the child. Phase 1 converts this from MEDIUM to HIGH.

### Gaps to Address

- **LLRT `spawn` env passthrough (P0 risk):** Not CI-verified on Windows. If LLRT does not honor `env`, the fallback is a minimal `.cmd` wrapper that `set`s env vars (documented in STACK.md; only build if CI forces it). Phase 1 resolves this.
- **Codex `${VAR}` expansion in `mcp add`:** Not clearly documented. Phase 1 CI or early Phase 5 spike should confirm. Fallback is `DRIFT_TOKEN_FILE` indirection.
- **Gemini Windows MCP reliability:** Open GitHub issues are unresolved — a live CLI bug outside Drift's control. Plan a real-machine confirmation checkpoint; Gemini may remain best-effort for this milestone.
- **Copilot `--additional-mcp-config` flag:** Confirmed from community sources but not on the canonical GitHub docs page fetched. Verify against `copilot --help` in Phase 5.
- **macOS regression on `os.tmpdir()`:** `os.tmpdir()` on macOS returns `/var/folders/...` (not `/tmp`). The existing orphan-sweep (`readdir("/tmp")`) must handle this — verify in Phase 3 that the `os.tmpdir()` replacement does not break the macOS sweep logic.

---

## Sources

### Primary (HIGH confidence)
- Node.js child_process API — `.cmd`/`.bat` EINVAL rules, `env`, `windowsHide`, injection warnings — https://nodejs.org/api/child_process.html
- Node.js CVE-2024-27980 April 2024 security release — https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
- Node.js DEP0190 — `shell:true` with args deprecated — https://nodejs.org/api/deprecations.html
- Caido — spawning a process guide — https://developer.caido.io/guides/spawning_process.html
- Caido — extra/os module reference — https://developer.caido.io/reference/modules/extra/os.html
- Caido — QuickJS/LLRT module reference index — https://developer.caido.io/reference/modules/
- caido/dependency-llrt — confirms runtime = LLRT; all modules partial — https://github.com/caido/dependency-llrt
- Claude Code setup (native Windows installer, `claude.exe`) — https://code.claude.com/docs/en/setup
- Claude Code MCP docs (`--mcp-config` JSON shape) — https://code.claude.com/docs/en/mcp
- GitHub Copilot CLI — Add MCP servers — https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
- Gemini CLI MCP servers (`-e/--env`, `$VAR`/`%VAR%` expansion) — https://geminicli.com/docs/tools/mcp-server/
- OpenAI Codex MCP (`mcp add --env`) — https://developers.openai.com/codex/mcp
- BatBadBut writeup — why hand-escaping cmd.exe is unsafe — https://flatt.tech/research/posts/batbadbut-you-cant-securely-execute-commands-on-windows/
- VS Code MCP configuration reference — https://code.visualstudio.com/docs/agents/reference/mcp-configuration

### Secondary (MEDIUM confidence)
- Gemini Windows MCP open issues ("Disconnected despite valid stdio", "broken settings.json") — https://github.com/google-gemini/gemini-cli/issues/25992 and #15551
- GitHub Copilot CLI #3576 — Windows stdio MCP `spawn EINVAL` regression — https://github.com/github/copilot-cli/issues/3576
- `gh copilot` extension deprecation (EOL 2025-10-25) — https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension/
- Volta/fnm/nvm-windows/Bun/Scoop Windows install paths — per-tool install docs
- Windows `%TEMP%` per-user ACL behavior — https://learn.microsoft.com/en-us/answers/questions/5517216/
- Copilot `--additional-mcp-config` flag — deepwiki/inventivehq (verify against `copilot --help` in Phase 5)

### Tertiary (LOW confidence — verify at build time)
- Codex `${VAR}` env expansion behavior in `mcp add` — not clearly documented; Phase 1/5 spike needed
- Exact Node-version floors per CLI (Gemini 20+, Codex 22+, Copilot ~22+) — from install docs; confirm at build time
- LLRT `crypto.randomUUID()` availability — inferred from module listing; Phase 1 CI assertion needed

---
*Research completed: 2026-06-26*
*Ready for roadmap: yes*
