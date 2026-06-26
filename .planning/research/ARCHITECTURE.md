# Architecture Research

**Domain:** Cross-platform process-launch architecture for an MCP host (Caido plugin spawning a local Node MCP server + 4 AI CLIs)
**Researched:** 2026-06-26
**Confidence:** HIGH (core mechanism, MCP-config shapes, comparable-tool pattern, and Caido runtime API all confirmed against official docs; specific MEDIUM/LOW flags called out inline)

---

## TL;DR for the roadmap

Replace the POSIX `#!/bin/bash` wrapper layer with **direct `node` spawning + env passed through `spawn`'s `env` option** (for Drift-owned processes) and through the **MCP config JSON `env` field / `mcp add --env` flags** (for the external CLIs). This is not a workaround — it is exactly how every comparable MCP host (Claude Desktop, VS Code, Cursor, Continue) launches stdio servers. Two facts make the refactor safe inside Caido's QuickJS runtime, and both are now confirmed against Caido's own docs:

1. **Caido's `child_process.spawn` accepts an `env` option** (default `process.env`) and supports `shell: true`. ([Caido — spawning a process](https://developer.caido.io/guides/spawning_process.html))
2. **Caido exposes an `os` module** with `tmpdir()`, `homedir()`, `platform()`, `arch()`, `type()` — so `os.tmpdir()`/`os.platform()` replace hardcoded `/tmp` and unblock all platform branching. ([Caido — extra/os](https://developer.caido.io/reference/modules/extra/os.html)) **This resolves the open question in PROJECT.md ("Whether `os.tmpdir()` and `process.platform` are available… is an open research question").** Use `os.platform()` (documented) rather than `process.platform` (not documented for the Caido runtime).

The keystone is a single `buildMcpServerSpec()` that returns `{ command: <abs node>, args: [<abs mcp-server.mjs>], env }`. Every consumer — self-test, Claude config, Copilot config, `gemini mcp add`, `codex mcp add` — derives from that one spec. The only residual Windows hazard is the `.cmd` shim EINVAL on **provider** spawns (not the MCP server), which a small `buildSpawnSpec()` helper handles.

---

## Standard Architecture

### System Overview — target launch architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Backend plugin (Caido QuickJS runtime)  packages/backend/src/        │
│                                                                      │
│  index.ts (orchestrator: all I/O, spawn calls, module state)        │
│     │                                                                │
│     │ calls (pure, platform-aware, unit-tested)                      │
│     ▼                                                                │
│  ┌──────────────┐   ┌────────────────────┐   ┌───────────────────┐  │
│  │ platform.ts  │   │ command-resolution │   │ provider-launch   │  │
│  │ (NEW)        │   │ .ts (EXTEND win32) │   │ .ts (unchanged)   │  │
│  │ isWindows,   │   │ candidate paths +  │   │ argv builders     │  │
│  │ tempRoot,    │   │ .exe/.cmd suffixes │   │ per provider      │  │
│  │ whichTool,   │   │ USERPROFILE home   │   └───────────────────┘  │
│  │ homeDirsFrom │   └────────────────────┘                          │
│  │ Env,         │                                                   │
│  │ execCandidate│        ┌──────────────────────────────────────┐  │
│  │ Names,       │◀──────▶│  buildMcpServerSpec()  ← KEYSTONE     │  │
│  │ buildSpawnSpec│       │  { command:<absNode>,                │  │
│  └──────────────┘        │    args:[<absMjs>], env:{...} }      │  │
│                          └───────┬───────────┬───────────┬──────┘  │
│                                  │           │           │         │
│             spawnNode()  ◀───────┘           │           │         │
│             (self-test + health)   writeChatMcpConfig    mcp add   │
│                   │                 (Claude / Copilot)  (gemini/   │
│                   │                       │              codex)    │
└───────────────────┼───────────────────────┼──────────────┼────────┘
                    │ spawn(node, [mjs],     │ JSON env     │ --env /
                    │   { env, stdio })      │ field        │ -e flags
                    ▼                        ▼              ▼
            ┌────────────────┐   ┌────────────────┐  ┌────────────────┐
            │ mcp-server.mjs │   │ claude / copilot│  │ gemini / codex │
            │ (node.exe —    │   │ spawn(provider, │  │ spawn(provider,│
            │  real PE exe,  │   │  args,{env,     │  │  args,{env,    │
            │  no .cmd)      │   │  shell?})       │  │  shell?})      │
            └────────────────┘   └───────┬─────────┘  └───────┬────────┘
                                         │ launches            │ launches
                                         ▼                     ▼
                                   node mcp-server.mjs   node mcp-server.mjs
                                   (from config env)     (from registered cmd)
```

**What disappears:** `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod +x` call, every `.sh` filename, and the `mcp-self-test-*.sh` path. Env is no longer serialized into a script; it is handed to `spawn`/config JSON as a structured `Record<string,string>`.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `platform.ts` (**new**, pure) | Every OS branch as a pure function of `(platform, env)`: temp root, which/where, home dirs, executable candidate names, `.cmd` spawn handling | `os.platform()` injected as a param; returns strings/booleans/specs — no I/O |
| `buildMcpServerSpec()` (**new**, in `index.ts` or a thin module) | Single source of truth for *how the MCP server is launched*: `{ command, args, env }` | Returns the resolved node path + mjs path + runtime env dict |
| `spawnNode()` (**new**, in `index.ts`) | The one chokepoint that spawns the MCP server for the self-test/health check | `spawn(spec.command, [...spec.args, "--validate-auth"], { env: {...process.env, ...spec.env}, stdio })` |
| `buildSpawnSpec()` (**new**, pure in `platform.ts`) | Decide how to spawn a *provider* binary that may be a `.cmd`/`.bat` shim on Windows | Returns `{ command, args, shell }`; sets `shell:true` for batch shims |
| `command-resolution.ts` (**extend**) | Candidate executable paths incl. Windows install locations + `.exe`/`.cmd` suffixes; `C:\Users\` home extraction | Pure path lists; `index.ts` checks existence |
| `provider-launch.ts` (**unchanged**) | Per-provider argv arrays | Already pure; no OS branching needed |
| `index.ts` (orchestrator) | All I/O: `os.tmpdir()`, file writes, the actual `spawn`, `which`/`where`, env reading | Supplies `os.platform()`/`process.env` to the pure helpers |
| `mcp-server.mjs` (**minimal/none**) | Reads `CAIDO_URL`/`CAIDO_TOKEN`/`DRIFT_*` from `process.env` (already env-driven) | No change required; env now arrives via spawn `env` instead of bash `export` |

---

## Recommended Project Structure

```
packages/backend/src/
├── index.ts                  # orchestrator — owns I/O, spawn, os.* calls, state
├── platform.ts               # NEW — pure OS-difference helpers (+ platform.test.ts)
├── command-resolution.ts     # EXTEND — add Windows candidates / suffixes / home
├── provider-launch.ts        # unchanged — pure argv builders
├── mcp-runtime.ts            # unchanged — pure policy/context/serialization
├── claude-print.ts           # unchanged — stream-json parser
├── persistence.ts            # unchanged
└── assets/
    └── mcp-server.mjs         # unchanged (already env-driven via process.env)
```

### Structure Rationale

- **`platform.ts` is new and pure.** It mirrors the existing convention exactly (CONVENTIONS.md "Pure Helpers Split for Testability"): the *decision* (which name, which path, shell or not) is a pure function of `(platform, env)`; the *I/O* (calling `os.platform()`, `spawn`, `stat`) stays in `index.ts`. This keeps the new Windows logic unit-testable on a Linux CI runner — you can assert `buildSpawnSpec({command:"C:\\x\\claude.cmd", platform:"win32"}).shell === true` without a Windows machine, which matters because the maintainer cannot test native Windows locally.
- **`command-resolution.ts` is extended, not replaced.** It already owns candidate path lists; Windows install locations and `.exe`/`.cmd` suffixes are the same kind of pure data. Its existing `*.test.ts` is where the Windows-path cases land.
- **`buildMcpServerSpec()` and `spawnNode()` live in `index.ts`** because they touch resolved absolute paths and the live env. Keep them tiny so the bulk of branching is in the pure modules.
- **`mcp-server.mjs` needs no change** — it already reads everything from `process.env`. That is precisely why direct env injection works: the server never cared *how* the env got there, only that `process.env.CAIDO_TOKEN` etc. are set.

---

## Architectural Patterns

### Pattern 1: Node-direct spawn with structured env injection (the keystone)

**What:** Stop generating an intermediate shell script. Spawn the real `node` binary directly and pass env as a `Record<string,string>` to `spawn`'s `env` option. For external CLIs, pass the same dict through their MCP-config `env` field.

**When to use:** Every Drift-owned launch of the MCP server (self-test, health check). It is the cross-platform default and removes the `chmod`/`.sh`/`bash`/`which` dependency chain in one move.

**Trade-offs:** `env` *replaces* the child environment (Node semantics; Caido documents the default as `process.env`). You must spread the parent env so PATH/HOME survive: `env: { ...process.env, ...injected }`. (MEDIUM: confirm `process.env` is fully populated — incl. `PATH` — inside Caido's QuickJS host; the codebase already reads `process.env.HOME`/`process.execPath`, so `process.env` exists, but completeness is unverified. Spread it to be safe.)

**Example:**
```typescript
// Drift-owned MCP server spawn (self-test / health) — replaces validateCaidoAuth's .sh spawn
const spec = buildMcpServerSpec();           // { command: absNode, args: [absMjs], env }
const proc = spawn(spec.command, [...spec.args, "--validate-auth"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, ...spec.env },       // merge, don't replace
});
// node.exe is a real PE executable → no .cmd EINVAL, no shell needed, works on all 3 OSes.
```

### Pattern 2: One MCP server spec, many consumers

**What:** `buildMcpServerSpec()` returns `{ command, args, env }` once; every attachment path is a projection of it.

**When to use:** Always — it guarantees Claude, Copilot, Gemini, Codex, and the self-test all launch the *same* server the *same* way, so a Windows fix in one place fixes all five.

**Trade-offs:** None significant; it is strictly less duplication than today's five script-writing sites.

**Example:**
```typescript
const spec = buildMcpServerSpec(); // command=C:\...\node.exe args=[C:\...\mcp-server.mjs] env={CAIDO_*, DRIFT_*}

// Claude / Copilot: write the spec straight into MCP config JSON (env field)
await writeChatMcpConfig("mcp-<chatId>.json", { ...spec });   // → { mcpServers: { drift: spec } }

// Gemini: gemini mcp add -e K=V ... drift -- <spec.command> <spec.args...>
// Codex:  codex  mcp add drift --env K=V ... -- <spec.command> <spec.args...>

// Self-test: spawnNode(spec, ["--validate-auth"])
```

### Pattern 3: Platform decisions as pure functions of `(platform, env)`

**What:** No helper reads `os.platform()` or `process.env` itself; `index.ts` reads them once and passes them in. Same shape as the existing `getKnownHomeDirs()` → `command-resolution.ts` split.

**When to use:** All of `platform.ts`. It is what makes Windows behavior testable from Linux CI.

**Example:**
```typescript
// platform.ts (pure, fully unit-tested)
export type Plat = "win32" | "darwin" | "linux" | string;

export const whichToolName = (p: Plat) => (p === "win32" ? "where" : "which");

export function homeDirsFromEnv(env: Record<string,string|undefined>, p: Plat): string[] {
  if (p === "win32") {
    const up = env.USERPROFILE;
    const hd = env.HOMEDRIVE && env.HOMEPATH ? env.HOMEDRIVE + env.HOMEPATH : undefined;
    return [up, hd].filter((v): v is string => !!v && v.trim() !== "");
  }
  return [env.HOME].filter((v): v is string => !!v && v.trim() !== "");
}

export function executableCandidateNames(command: string, p: Plat): string[] {
  if (p !== "win32" || command.includes(".")) return [command];
  // npm/native shims on Windows: prefer real executables before batch shims
  return [`${command}.exe`, command, `${command}.cmd`, `${command}.ps1`, `${command}.bat`];
}
```

### Pattern 4: `.cmd`/`.bat` provider spawn handling (the only residual Windows hazard)

**What:** Since Node ≥18.20/20.12 (the CVE-2024-27980 fix), `spawn("foo.cmd", args)` throws `EINVAL` unless `shell: true` is set or you invoke `cmd.exe /c foo.cmd`. ([Node April 2024 security release](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2), [nodejs/node#52681](https://github.com/nodejs/node/issues/52681)) This bites **provider** binaries (npm-global `claude.cmd`/`gemini.cmd`/`copilot.cmd`) — **not** the MCP server (real `node.exe`) and **not** the self-test.

**When to use:** Only in the provider spawn in `sendCliMessage` and the `mcp add` invocations. `buildSpawnSpec()` decides; `index.ts` passes `shell` into `spawn`.

**Trade-offs:** `shell:true` is safe here because **Drift controls the provider argv** — the user's prompt is written to `proc.stdin`, never passed as an argument (see `index.ts` `sendCliMessage`: `proc.stdin.write(prompt)`). The argv is only Drift's own flag arrays from `provider-launch.ts` plus Drift-generated temp paths. The residual edge is **paths containing spaces** under `shell:true` (Node's shell quoting is imperfect — this is why `cross-spawn` exists, which Drift cannot import as a QuickJS runtime dep). Mitigations: (a) order candidates to prefer real executables (`claude.exe` / native `~/.local/bin/claude`) over `.cmd`; (b) Drift already copies `mcp-server.mjs` into the temp dir specifically to avoid spaces in config-referenced paths.

**Example:**
```typescript
// platform.ts (pure)
export function buildSpawnSpec(i: { command: string; args: string[]; platform: Plat }) {
  const lower = i.command.toLowerCase();
  const isBatch = i.platform === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"));
  // Drift-controlled argv (prompt goes via stdin), so shell:true is acceptable.
  return { command: i.command, args: i.args, shell: isBatch };
}

// index.ts
const s = buildSpawnSpec({ command: resolved, args, platform: os.platform() });
const proc = spawn(s.command, s.args, { stdio, env: { ...process.env, ...runtimeEnv }, shell: s.shell });
```

---

## Data Flow

### Per-CLI env + command injection (the answer to question 1)

All four CLIs accept a `command` + `args` + `env` triple. The token and `DRIFT_*` policy vars travel in `env`, never in a shell script. Confirmed shapes and Windows specifics:

| Consumer | Mechanism | Concrete shape | Windows specifics | Confidence |
|----------|-----------|----------------|-------------------|------------|
| **(a) Drift self-test** (`validateCaidoAuth`, `callMcpMethod`) | Direct `spawn` with `env` | `spawn(absNode, [absMjs, "--validate-auth"], { env:{...process.env, CAIDO_*, DRIFT_*} })` | `node.exe` is a real PE exe → **no `.cmd`, no shell, no EINVAL.** Just resolve node via `where`/candidates. | HIGH — Caido `spawn` documents `env` + `process.env` default ([Caido spawn](https://developer.caido.io/guides/spawning_process.html)) |
| **(b) Claude Code** `--mcp-config <file>` `--strict-mcp-config` | JSON `env` field | `{ "mcpServers": { "drift": { "type":"stdio", "command":absNode, "args":[absMjs], "env":{...} } } }` | Identical JSON on all OSes; `command` is an absolute node path (real exe). No `cmd /c` needed. | HIGH ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)) |
| **(c) Copilot** `--additional-mcp-config @<file>` | JSON `env` field | `{ "mcpServers": { "drift": { "type":"local", "command":absNode, "args":[absMjs], "env":{...} } } }` | Same JSON cross-platform; `@`-prefixed path arg. Already how Drift does it. | HIGH ([GitHub Copilot CLI — add MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)) |
| **(d) Gemini** `gemini mcp add` | `-e/--env KEY=val` (repeatable) + command + args | `gemini mcp add -e CAIDO_URL=… -e CAIDO_TOKEN='${CAIDO_TOKEN}' … drift <absNode> <absMjs>` | Works on Windows; node is a real exe. Env supports `$VAR`/`${VAR}` (all platforms) **and `%VAR%` (Windows)** expansion at server launch. | HIGH ([Gemini CLI — MCP servers](https://geminicli.com/docs/tools/mcp-server/)) |
| **(d) Codex** `codex mcp add` | `--env KEY=VAL` (repeatable) + `--` + command + args | `codex mcp add drift --env CAIDO_URL=… --env CAIDO_TOKEN=… -- <absNode> <absMjs>`; persists to `~/.codex/config.toml` `[mcp_servers.drift]` `command`/`args`/`env` | Works on Windows; node is a real exe. (MEDIUM: whether codex expands `${VAR}` inside `env` is not clearly documented — see token-hygiene note.) | HIGH for flag shape ([Codex — MCP](https://developers.openai.com/codex/mcp)); MEDIUM for env-expansion |

**The `mcp add` / config `command` is always the absolute `node` path**, so when Gemini/Codex/Claude/Copilot *later launch* the server, they exec a real `node.exe` — never a `.cmd` — so the EINVAL hazard never reaches the server. The only place a `.cmd` is invoked is Drift spawning the **provider CLI itself** (Pattern 4) and the `gemini`/`codex` binary for `mcp add` (same handling).

### Token-hygiene consideration for Gemini/Codex (decision point for the roadmap)

`gemini mcp add` / `codex mcp add` **persist** their config into the user's own `~/.gemini/settings.json` / `~/.codex/config.toml` — *outside* Drift's `0o600` temp dir and not swept on stop. Inlining the token via `-e CAIDO_TOKEN=<raw>` therefore *regresses* token hygiene vs. today (where the token lives only in the Drift-owned wrapper).

- **Recommended:** register `env: { CAIDO_TOKEN: "${CAIDO_TOKEN}" }` (a *reference*, not the secret) and have Drift set the real `CAIDO_TOKEN` in the **spawn env when it launches gemini/codex for the chat turn** (`sendCliMessage` already passes `runtimeEnv`). Gemini documents this expansion explicitly. The persisted config holds only `${CAIDO_TOKEN}`; the secret stays in process env. Bonus: if the user runs gemini *outside* Drift, the var is empty and the drift server simply fails auth — no leak.
- **Codex fallback** (if `${VAR}` expansion is unconfirmed): pass a non-secret `DRIFT_TOKEN_FILE=<temp>/mcp-secrets.json` env var and have `mcp-server.mjs` read the token from that Drift-owned file (it already reads `DRIFT_CONTEXT_FILE` — same pattern). This keeps the secret in Drift's temp dir on all OSes. Otherwise: accept inline `--env` as a documented trade-off (no worse than today's on-disk token, just a different location).
- **Claude/Copilot need none of this** — their config JSON lives in Drift's `0o600` temp dir, so the token in `env` there is already as protected as today.

### Launch flow: before → after

```
BEFORE (POSIX-only):
  build env dict → renderExportExecScript("#!/bin/bash\nexport K=V\nexec node mjs $@")
    → writeFile(.sh, 0o700) → spawnAndWait("chmod","+x",.sh) → rename
    → spawn(.sh)                       ✗ chmod/bash/.sh/which all absent on Windows

AFTER (cross-platform):
  build env dict → buildMcpServerSpec() → { command:absNode, args:[absMjs], env }
    → spawn(absNode,[absMjs], { env:{...process.env,...injected} })   ✓ all OSes
    (external CLIs: same spec → JSON env field / --env flags)
```

### Comparable-tool pattern (the answer to question 2)

Every mainstream stdio-MCP host uses the **same canonical shape** — `command` + `args` + `env`, transported as JSON:

```jsonc
// Claude Desktop claude_desktop_config.json / VS Code .vscode/mcp.json /
// Cursor .cursor/mcp.json / Continue — all converge on this:
{ "mcpServers": {                 // VS Code uses "servers"; field names otherwise identical
    "name": {
      "type": "stdio",            // VS Code/Claude; Copilot uses "local"
      "command": "node",          // or an ABSOLUTE path to node/python/the binary
      "args": ["/abs/path/server.js"],
      "env": { "API_KEY": "..." } // secrets live here, never on the command line
} } }
```

**The Windows rule comparable tools document:** wrap the command in `cmd /c` *only when the command is `npx` or another `.cmd`/`.bat` shim* — `"command":"cmd","args":["/c","npx","-y","@scope/server"]` — otherwise you get `spawn npx ENOENT`/`EINVAL`. When the command is an **absolute path to a real executable (`node.exe`, `python.exe`), you spawn it directly with no wrapper.** ([Claude Desktop Windows `cmd /c` requirement — SuperClaude#390](https://github.com/SuperClaude-Org/SuperClaude_Framework/issues/390), [Claude Code MCP on Windows fix guide](https://mcp.directory/blog/claude-code-mcp-on-windows-native-wsl-2026-complete-fix-guide); [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration); [Cursor MCP setup](https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide))

**Pattern Drift should mirror — and why Drift's case is *cleaner* than the npx examples:** Drift bundles its own `mcp-server.mjs` and resolves the real `node` binary, so its `command` is **an absolute path to `node.exe`, never `npx`/`.cmd`.** That means Drift sidesteps the `cmd /c` wrapper entirely for the MCP server on every OS — the exact best-practice the docs steer toward ("absolute paths… solve a lot of 'server not found' failures"). Drift only needs `.cmd` handling for the *provider* binaries it launches, which the comparable hosts don't do at all (they only ever spawn the MCP server, not a second CLI).

---

## Build Order (dependency-ordered) — the answer to question 3

Each phase is independently shippable and (except E's spawn rewiring) verifiable by `vitest` on a Linux runner via the pure helpers. Windows CI (`windows-latest`) is the acceptance gate for the end-to-end behavior.

| # | Phase | Changes | Depends on | Removes landmine(s) | Test surface |
|---|-------|---------|------------|---------------------|--------------|
| **A** | **Platform foundation** | Add `platform.ts` (`isWindows`, `tempRoot` via `os.tmpdir()`, `whichToolName`, `homeDirsFromEnv`, `executableCandidateNames`, `buildSpawnSpec`). Introduce `import os from "os"`. Replace 3 hardcoded `/tmp` sites (mcpTempDir, sweep, debug log) with `os.tmpdir()`. | — | #1 (hardcoded `/tmp`) | `platform.test.ts` (pure) |
| **B** | **Kill the wrappers** | Add `buildMcpServerSpec()` + `spawnNode()`. Rewrite `validateCaidoAuth` + `callMcpMethod` to spawn `node` directly with `env`. Rewrite Claude/Copilot config writers to embed `{command,args,env}`. Delete `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, all `chmod` + `.sh`. | A | #2,#3,#4,#12 + self-test `.sh` | self-test/health paths; config JSON snapshot tests |
| **C** | **Windows command resolution** | Extend `command-resolution.ts`: Windows install candidates (`%APPDATA%\npm`, `%LOCALAPPDATA%\Programs`, `%ProgramFiles%\nodejs`, scoop/winget, native `~/.local/bin`), `.exe`/`.cmd`/`.ps1` suffixes via `executableCandidateNames`, `C:\Users\` in `extractHomeDir`, `USERPROFILE` in `getKnownHomeDirs`. Branch `which`→`where`. | A | #5,#6,#7,#8 | `command-resolution.test.ts` (extend) |
| **D** | **Provider + registration safety** | Use `buildSpawnSpec` for the provider spawn in `sendCliMessage` (handles `.cmd`). Rewrite `registerMcpWithCli` to pass `node + mjs + env` via `-e`/`--env` (per token-hygiene note) instead of the `.sh` path. | B, C | #10 + provider `.cmd` EINVAL | provider argv/spec tests |
| **E** | **Signals + polish** | `proc.kill()` without signal-arg reliance (Windows uses TerminateProcess; consider `taskkill /T /F` for trees); Windows install hints; binary picker accepts `.exe`/`.cmd`; debug-log path via `os.tmpdir()`. | A–D | #9,#11 | hint/text tests |
| **F** | **Windows CI net** | `windows-latest` job: build + `vitest`. Permanent regression gate. | A–E | — | full suite on Windows |

**Critical path:** A → B unblocks the headline bug (the `chmod`/`.sh` failure the user hit). A → C can run in parallel with B. D needs both. E and F are polish/validation. **A and B together are the minimum to make Claude (the blocking must-have) launch on Windows**, because Claude attaches purely via the config-JSON `env` path (no `mcp add`, no provider-side `.cmd` until D's provider spawn — which Claude *also* needs, so D's provider-spawn slice is on Claude's critical path too; C is needed for Claude to resolve `node`/`claude` on Windows). Net: **Claude on Windows = A + B + C + the provider-spawn slice of D.**

---

## Platform Support Matrix

| Target | Status after refactor | Notes |
|--------|----------------------|-------|
| macOS / Linux (existing) | **Must stay green** | `os.tmpdir()` differs from `/tmp` on macOS (`/var/folders/...`) — verify the sweep + debug-log paths still resolve; otherwise behavior-identical. No bash/chmod means one fewer failure mode. |
| Native Windows | **New target** | Claude is the blocking must-have; all four are in scope. Validated via `windows-latest` CI + (best-effort) the original reporter. |
| WSL | Already works (it is Linux) | Out of scope; no change. |

---

## Anti-Patterns

### Anti-Pattern 1: Re-introducing a shell wrapper "to set env"
**What people do:** Generate a `.bat`/`.ps1` as the Windows analog of the `.sh` wrapper.
**Why it's wrong:** It rebuilds the exact indirection the refactor removes — now with two script dialects to maintain, two quoting models, and new injection surface. `spawn`'s `env` option already does this natively and is what every comparable host uses.
**Do this instead:** Pass `env` as a `Record<string,string>` to `spawn`/config JSON. No script.

### Anti-Pattern 2: `cmd /c node ...` or `shell:true` for the MCP server
**What people do:** Wrap the *node* spawn in `cmd /c` "for Windows safety."
**Why it's wrong:** `node.exe`/`node` is a real executable — it never needs a shell. Adding `cmd /c` re-introduces quoting hazards (spaces in `AppData\Local\Temp\<user>` paths) and a `windowsHide` flicker for zero benefit.
**Do this instead:** Spawn the absolute node path directly. Reserve shell handling for *provider* `.cmd` shims only (Pattern 4).

### Anti-Pattern 3: `shell:true` with user-derived argv
**What people do:** Set `shell:true` everywhere and pass prompt text as an argument.
**Why it's wrong:** Shell metacharacters in user input become command injection.
**Do this instead:** Keep the prompt on `stdin` (Drift already does). `shell:true` is only acceptable because the provider argv is 100% Drift-controlled — preserve that invariant.

### Anti-Pattern 4: `process.platform` / hardcoded separators for OS detection
**What people do:** Branch on `process.platform` or sniff `/` vs `\`.
**Why it's wrong:** `process.platform` is undocumented for Caido's QuickJS host; path sniffing is brittle.
**Do this instead:** Use `os.platform()` (documented in Caido's `extra/os`) and `path` (already cross-platform). Inject the platform value into pure helpers.

### Anti-Pattern 5: Relying on `0o600`/`0o700` for token protection on Windows
**What people do:** Assume the `mode` argument secures the token file.
**Why it's wrong:** Windows ignores POSIX `mode` silently.
**Do this instead:** Lean on `os.tmpdir()` resolving to the **per-user** `%LOCALAPPDATA%\Temp` (already ACL'd to the user) as the accepted Windows equivalent; keep passing `mode` for POSIX (harmless no-op on Windows). Document this as the accepted trade-off PROJECT.md anticipates.

---

## Integration Points

### External Services (the 4 CLIs)

| CLI | Attach method | Env transport | Windows note |
|-----|---------------|---------------|--------------|
| Claude Code | `--mcp-config @file` + `--strict-mcp-config` | config JSON `env` | `command` = abs node; provider binary may be native (`~/.local/bin/claude`, real exe) or npm `claude.cmd` (needs Pattern 4). npm is now deprecated in favor of native. ([Claude Code setup](https://code.claude.com/docs/en/setup)) |
| Copilot | `--additional-mcp-config @file` | config JSON `env` | `command` = abs node; provider binary often `copilot.cmd` (Pattern 4). |
| Gemini | `gemini mcp add` (persisted) | `-e KEY=val` + `${VAR}`/`%VAR%` expansion | `command` = abs node; `gemini.cmd` shim (Pattern 4 for the `mcp add` call). |
| Codex | `codex mcp add` (persisted to `config.toml`) | `--env KEY=VAL` | `command` = abs node; binary is `codex.exe` (standalone) or `codex.cmd` (npm shim → Rust binary). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `index.ts` ↔ `platform.ts` | Direct calls; `index.ts` supplies `os.platform()` + `process.env` | Keeps `platform.ts` pure/testable |
| `buildMcpServerSpec()` ↔ consumers | Returns one `{command,args,env}`; consumers project it | Single source of truth for server launch |
| backend ↔ `mcp-server.mjs` | `process.env` (CAIDO_*, DRIFT_*) + on-disk context/activity/approval files | Unchanged; env now arrives via `spawn env`/config, not `export` |
| backend ↔ gemini/codex config | `mcp add` writes to `~/.gemini`/`~/.codex` | Token-hygiene decision point (use `${VAR}` reference, not raw secret) |

---

## Sources

**Caido runtime (authoritative — resolves PROJECT.md's open question):**
- [Caido — Spawning a process](https://developer.caido.io/guides/spawning_process.html) — `spawn` supports `{ shell: true }`; HIGH
- [Caido — extra/os module](https://developer.caido.io/reference/modules/extra/os.html) — `tmpdir()`, `homedir()`, `platform()`, `arch()`, `type()`, `release()`, `version()`, `EOL`; types `@caido/quickjs-types`; HIGH
- [Caido — child_process module concept](https://developer.caido.io/concepts/modules/child_process.html) — `spawn` "similar to Node, with differences"; `env` default `process.env`, `cwd`, `shell`, `stdio`, `detached`; HIGH

**Windows `.cmd` EINVAL (the residual hazard):**
- [Node.js — April 2024 security releases (CVE-2024-27980)](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2) — `.cmd`/`.bat` spawn now EINVAL without `shell:true`; HIGH
- [nodejs/node#52681 — EINVAL on Windows](https://github.com/nodejs/node/issues/52681); [Node child_process docs](https://nodejs.org/api/child_process.html); HIGH

**MCP config shapes per CLI:**
- [Claude Code — Connect to MCP](https://code.claude.com/docs/en/mcp); [Claude Code — Advanced setup (Windows native vs npm `.cmd`)](https://code.claude.com/docs/en/setup); HIGH
- [GitHub Copilot CLI — Add MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers); HIGH
- [Gemini CLI — MCP servers (`-e/--env`, `$VAR`/`%VAR%` expansion)](https://geminicli.com/docs/tools/mcp-server/); HIGH
- [OpenAI Codex — MCP (`mcp add --env`)](https://developers.openai.com/codex/mcp); [Codex — Config reference (`[mcp_servers.*]`)](https://developers.openai.com/codex/config-reference); HIGH (flags) / MEDIUM (`${VAR}` expansion)

**Comparable-tool canonical pattern (`command`/`args`/`env`, `cmd /c` for npx):**
- [Claude Desktop Windows `cmd /c` requirement (SuperClaude#390)](https://github.com/SuperClaude-Org/SuperClaude_Framework/issues/390); [Claude Code MCP on Windows — fix guide](https://mcp.directory/blog/claude-code-mcp-on-windows-native-wsl-2026-complete-fix-guide); MEDIUM
- [VS Code — MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration); HIGH
- [Cursor — MCP setup & config (2026)](https://www.truefoundry.com/blog/mcp-servers-in-cursor-setup-configuration-and-security-guide); [FastMCP — MCP JSON configuration](https://gofastmcp.com/integrations/mcp-json-configuration); MEDIUM

**Provider distribution on Windows (`.exe` vs `.cmd`):**
- [Codex CLI — Windows (native binary / npm shim → Rust)](https://developers.openai.com/codex/windows); [claudian#428 — npm Claude resolves to `cli.js` not `.cmd`](https://github.com/YishenTu/claudian/issues/428); MEDIUM

---
*Architecture research for: cross-platform MCP/CLI process-launch refactor (Drift Windows-parity milestone)*
*Researched: 2026-06-26*
