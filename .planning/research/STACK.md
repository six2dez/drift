# Stack Research — Native Windows Runtime Facts

**Domain:** Cross-platform process launching from a constrained JS runtime (Caido/LLRT backend plugin spawning Node + AI CLIs + a stdio MCP server) on **native Windows**
**Researched:** 2026-06-26
**Confidence:** HIGH for Node/Windows runtime facts; MEDIUM-HIGH for install-location paths; **LOW (CI-verify) for the exact behavior of Caido's LLRT `child_process` shim** (see flags)

> Scope note: This is a *runtime-facts* dossier, not a greenfield stack pick. The macOS/Linux stack is unchanged and works. Everything below is the set of **Windows facts the port must respect**, written to be copy-pasteable into per-phase planning. Each fact carries a confidence level and, where the fact is about Caido's runtime rather than stock Node, a **CI-VERIFY** marker.

---

## TL;DR — The Decisions This Research Forces

1. **Drop the `.sh`/`chmod`/bash-wrapper layer entirely and spawn `node.exe` directly with `env:`.** `node.exe` is a real executable on every Windows install method → no `.cmd`, no `EINVAL`, no shell, no injection surface. This is both the cross-platform fix *and* the secure one (token never written to disk). Confirmed safe by Node docs + CVE advisory.
2. **Never spawn a bare command and never spawn a `.cmd`/`.bat` directly without a strategy.** Stock Node ≥ 18.20.2 / 20.12.2 / 21.7.3 **throws `EINVAL`** for direct `.cmd`/`.bat` spawn (CVE-2024-27980), and Node's spawn does **not** append `PATHEXT` for bare names. Resolve to an **absolute path with explicit extension** and branch on the extension.
3. **Use `os.tmpdir()` / `os.homedir()` / `os.platform()` — they exist in Caido's runtime.** Caido's backend runtime is **LLRT** and its docs explicitly expose an `os` module with `tmpdir()`, `homedir()`, `platform()`, `type()`, `EOL`. Prefer `os.platform()` over `process.platform` for branching.
4. **Treat Caido's `child_process` as *partially* Node-compatible.** LLRT marks `child_process` ⚠️ partial. Whether it honors `env`, `windowsHide`, the `EINVAL` guard, or `PATHEXT` is **not documented and MUST be verified on `windows-latest` CI** before the design depends on it.

---

## Recommended Stack (Windows runtime targets)

### Core Technologies

| Technology | Version / Threshold | Purpose | Why Recommended |
|------------|---------------------|---------|-----------------|
| Caido backend runtime (**LLRT**, QuickJS-based) | Ships with Caido ≥ 0.55.x | Hosts `packages/backend/src/index.ts` | It is what we run in. Exposes `child_process`, `fs`, `fs/promises`, `path`, `os`, `crypto`, `buffer`, `net`, `stream`, `url`, `events`, `timers`, `sqlite` — **all marked partial (⚠️)** in LLRT. (Caido module reference + caido/dependency-llrt) |
| Node.js (user's system Node, runs `mcp-server.mjs` + the CLIs) | **≥ 20.12.2** in practice (any current 20/22/24 LTS) | Real OS process spawned by the backend | Post-CVE-2024-27980 behavior is now universal. The MCP server only needs ≥ 18 to run, but the **`.cmd` `EINVAL` guard exists in every patched line**, so the port must assume it. |
| `node.exe` (resolved, absolute) | n/a | The thing we actually spawn for the MCP server | Real PE executable on every install method → spawnable directly, no shim/shell/EINVAL. **This is the linchpin of the fix.** |
| `where.exe` | Built into Windows (System32) | Binary discovery (replaces `which`) | Always present; honors `PATHEXT` so it finds `.exe` **and** `.cmd`. Returns newline-separated matches. |
| `cmd.exe` (`%ComSpec%`) | Built into Windows | Fallback launcher for `.cmd`/`.bat` provider shims | The only correct way to launch a `.cmd` shim when no real `.exe` exists. Used as `cmd.exe /d /s /c <shim> <args>`. |

### Supporting APIs (use these exact ones)

| API | Module | Purpose | Windows behavior to rely on |
|-----|--------|---------|-----------------------------|
| `os.tmpdir()` | `os` | Runtime dir, orphan sweep, debug logs — **replaces hardcoded `/tmp`** | Returns `%TEMP%` → normally `C:\Users\<user>\AppData\Local\Temp` (per-user, ACL-isolated). Reads `TEMP` then `TMP`; falls back to `%SystemRoot%\temp`. |
| `os.homedir()` | `os` | Home-relative candidate paths — **replaces `process.env.HOME`** | Uses `%USERPROFILE%` on Windows. (`HOME` is unset on Windows by default.) |
| `os.platform()` | `os` | Platform branching — **prefer over `process.platform`** | Returns `'win32'` / `'darwin'` / `'linux'`. Confirmed exposed by Caido's `os` module. |
| `os.EOL` | `os` | Only if generating text parsed line-by-line | `\r\n` on Windows. For JSONL data files keep an explicit `\n` instead (don't depend on platform EOL). |
| `path.*` (default export) | `path` | All path joins | On Windows the default `path` *is* `path.win32` (`\` separators, drive letters). Never hardcode `/` or `\`. |
| `spawn(file, args, opts)` | `child_process` | All process launches | Pass **absolute path + explicit extension**; set `env`, `windowsHide:true`, `stdio:['pipe','pipe','pipe']`. **CI-VERIFY** that Caido's LLRT honors `env`/`windowsHide`. |
| `process.env.USERPROFILE` / `APPDATA` / `LOCALAPPDATA` / `ProgramFiles` / `PATHEXT` / `ComSpec` | global `process` | Building Windows candidate install paths | `process` is ⚠️ partial in LLRT but `process.env` is already used today (`process.env.HOME`). **CI-VERIFY** these specific keys resolve. |

---

## Fact 1 — `child_process.spawn` on Windows (.exe vs .cmd/.bat)

**Confidence: HIGH** (official Node docs, Node security advisory, Tenable, oss-sec)

### The CVE-2024-27980 hard rule (this is the headline)
- Patched in **Node 18.20.2, 20.12.2, 21.7.3** (and every release after). CVSS **8.1 HIGH**. It was the completion of the "BatBadBut" fix.
- **Behavior:** passing a file ending in `.bat` or `.cmd` to `child_process.spawn` / `spawnSync` **without** `{ shell: true }` now **throws `EINVAL`**. This is intentional and not revertible in practice (`--security-revert=CVE-2024-27980` exists but is strongly discouraged).
- Practical consequence for Drift: `spawn("claude.cmd", args)` (npm-installed CLI shim) **fails outright** on any current Windows Node. This is one of the root reasons the current POSIX path can never work on Windows even after `chmod`/`.sh` are removed.

### How to launch each artifact type on Windows (from Node docs)

| Artifact | Correct launch | Notes |
|----------|----------------|-------|
| `node.exe`, `claude.exe`, `where.exe`, any `.exe` | `spawn(absExePath, args, { env, windowsHide:true })` | Real executable. **No shell. No EINVAL. No injection surface.** This is the target state for the MCP server and for native-installed Claude. |
| `.cmd` / `.bat` shim (npm/pnpm/volta/scoop shims) | `spawn(process.env.ComSpec ?? "cmd.exe", ["/d","/s","/c", shimPath, ...args], { env, windowsHide:true })` | `cmd.exe /c` is what Node docs and `exec()` do internally. Keep **all user-influenced text OFF argv** (see injection note). |
| `.cmd` / `.bat` via `shell:true` | `spawn(shimPath, args, { shell:true })` | **AVOID.** Works, but args are concatenated **unescaped** → command injection, and it is now deprecated (**DEP0190**). Only acceptable if every arg is fully controlled. |

### `shell:true` injection + DEP0190 (current, Node 24+)
- Node docs: *"If the `shell` option is enabled, do not pass unsanitized user input … Any input containing shell metacharacters may be used to trigger arbitrary command execution."*
- **DEP0190**: passing an `args` array together with `{ shell:true }` is deprecated precisely because the values are *space-joined, not escaped*. The documented replacement is to spawn `cmd.exe` with `["/c", file, ...args]` yourself.
- Windows-specific escaping is genuinely unsafe to hand-roll: `cmd.exe` uses caret (`^`) escaping, re-parses the command line, and `CreateProcess` *implicitly* invokes `cmd.exe` for batch files (the BatBadBut class of bugs). **Do not write a bespoke cmd escaper.**

### The safe pattern Drift should adopt
```ts
// MCP server — the primary fix. node.exe is a real .exe → safest possible.
const proc = spawn(nodeExeAbsPath, [mcpScriptPath, ...passThroughArgs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...baseEnv, ...runtimeEnv },   // token via env, NOT written to a wrapper file
  windowsHide: true,                     // avoid console-window flash in a GUI host
});

// CLI provider — branch on the resolved extension:
function spawnProvider(resolvedAbsPath: string, args: string[], env: Env) {
  const lower = resolvedAbsPath.toLowerCase();
  const isBatch = lower.endsWith(".cmd") || lower.endsWith(".bat");
  if (isBatch) {
    const comspec = env.ComSpec ?? process.env.ComSpec ?? "cmd.exe";
    return spawn(comspec, ["/d", "/s", "/c", resolvedAbsPath, ...args],
                 { stdio: ["pipe","pipe","pipe"], env, windowsHide: true });
  }
  return spawn(resolvedAbsPath, args,
               { stdio: ["pipe","pipe","pipe"], env, windowsHide: true });
}
```
**Why this is safe for Drift specifically:** the user's prompt already goes over `proc.stdin` (architecture step 8), so argv carries only controlled flags + UUID temp-dir paths — the injection surface on argv is near-zero. Keep it that way: never move prompt/free-text onto argv on Windows.

### CI-VERIFY (LLRT, not stock Node)
- ⚠️ **Does Caido's LLRT `child_process` reproduce the `EINVAL` guard?** Unknown. It may be stricter, looser, or different. Design as if it does (i.e., don't rely on direct `.cmd` spawn), and assert the real behavior in a `windows-latest` test.
- ⚠️ **Does LLRT honor `env`, `windowsHide`, and `stdio:['pipe','pipe','pipe']`?** `stdio` pipes already work cross-platform today. `env` is the load-bearing assumption of the whole fix — **prove it on CI first** (spawn `node -e "process.stdout.write(process.env.CAIDO_TOKEN||'MISSING')"` and assert the token round-trips).

---

## Fact 2 — Binary Resolution on Windows

**Confidence: HIGH** for `where`/`PATHEXT`/CreateProcess semantics; **MEDIUM-HIGH** for the per-tool install paths.

### `where` vs `which`, and the PATHEXT trap
- `which` does not exist on Windows. Use **`where`** (`where.exe`, System32, always on PATH). `where node` / `where claude` print **all** matches, newline-separated — pick deterministically (prefer `.exe` over `.cmd` when both appear).
- **Node's `spawn` does NOT consult `PATHEXT`** for bare command names (long-standing libuv behavior, nodejs/node#6671). So `spawn("claude", …)` will **not** find `claude.cmd`.
- **CreateProcess auto-appends `.exe` only** (not `.cmd`/`.bat`). So `spawn("node")`, `spawn("where")`, `spawn("claude")` *find a `.exe* if one exists, but silently miss a `.cmd`. (MEDIUM-HIGH — well-documented Win32 behavior.)
- **Rule:** always resolve to an **absolute path including the extension** before spawning. Treat "bare command works on my mac" as a guarantee that does **not** hold on Windows.

### Bare command vs absolute path
| | Bare (`"claude"`) | Absolute + ext (`C:\…\claude.exe`) |
|---|---|---|
| Finds `.exe` | yes (CreateProcess appends `.exe`) | yes |
| Finds `.cmd` | **no** | yes (you point straight at it) |
| Deterministic | no (PATH order, multiple matches) | **yes** |
| **Recommendation** | avoid | **always do this** |

### Where Node CLIs actually land on Windows (build the candidate list from these)

| Installer | Node / CLI location template | Shim type |
|-----------|------------------------------|-----------|
| **Claude Code native installer** (current, recommended; `irm https://claude.ai/install.ps1 \| iex`) | `%USERPROFILE%\.local\bin\claude.exe` | **real `.exe`** — easy case |
| npm global (Claude install is **deprecated** here) | `%APPDATA%\npm\<name>.cmd` (+ `.ps1`, plus extension-less shim) → `C:\Users\<u>\AppData\Roaming\npm` | `.cmd` |
| pnpm global | `%LOCALAPPDATA%\pnpm\<name>.exe` / `.cmd` → `C:\Users\<u>\AppData\Local\pnpm`; `PNPM_HOME` env points here | `.exe`/`.cmd` |
| Volta | `%USERPROFILE%\.volta\bin\<name>.exe` | `.exe` (shim) |
| fnm | `%APPDATA%\fnm\node-versions\<ver>\installation\<name>` + `%APPDATA%\fnm\aliases\default\` | `.exe`/`.cmd` |
| nvm-windows | symlink dir on PATH: newer default `C:\nvm4w\nodejs\`, older `C:\Program Files\nodejs\`; store `%APPDATA%\nvm\` (`NVM_HOME`/`NVM_SYMLINK`) | `node.exe`; CLIs via npm-global |
| Bun | `%USERPROFILE%\.bun\bin\<name>.exe` (and `.bunx`) | `.exe` |
| Scoop | `%USERPROFILE%\scoop\shims\<name>.exe` (apps under `…\scoop\apps\<app>\current\`) | `.exe` shim |
| winget / MSI Node | `C:\Program Files\nodejs\node.exe` | `node.exe` |

**Resolution recipe (replacing the Unix `which` + `/usr/local/bin` candidates):**
1. `where <cmd>` → take matches; if multiple, prefer `.exe` then `.cmd`.
2. Augment with explicit candidates built from `os.homedir()`, `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%ProgramFiles%`, `PNPM_HOME`, trying both `.exe` and `.cmd` suffixes for each base from the table above.
3. Validate existence with `fs.stat`; store the **absolute, extension-qualified** path.
4. `extractHomeDir` must recognize the `C:\Users\<name>\…` shape (drive-letter + `\Users\`), not just `/Users/` and `/home/`.

### CI-VERIFY
- ⚠️ Whether Caido's LLRT spawn appends `.exe`/consults `PATHEXT` at all is unknown → **always pass absolute+ext** so it never matters.
- ⚠️ Confirm `where.exe` is spawnable from LLRT and its stdout parses (newline-separated, possibly `\r\n`).

---

## Fact 3 — Temp Dirs, Paths, Permissions, Long Paths, CRLF

**Confidence: HIGH** for Node/`os` semantics and the "mode is ignored on Windows" fact; **MEDIUM** for ACL/long-path specifics.

| Topic | Windows fact | Action for Drift |
|-------|--------------|------------------|
| Temp dir | `os.tmpdir()` → `%TEMP%` = `C:\Users\<user>\AppData\Local\Temp` (per-user) | Replace all three hardcoded `/tmp` sites (`mcpTempDir`, `readdir("/tmp")` sweep, `getSessionDebugLogPath`) with `os.tmpdir()` joins. |
| File mode `0o700/0o600` | Node's `mode` argument is **effectively ignored on Windows** (NTFS uses ACLs, not POSIX bits). The chmod-style protection silently becomes a no-op. | Don't rely on `mode` for confidentiality on Windows. Rely on the **per-user `%TEMP%` ACL** (default grants only the user + SYSTEM + Administrators). **Better: don't write the token to disk at all** — the direct-`node`-spawn-with-`env` fix removes the on-disk token entirely. |
| Token-in-temp threat model | Per-user `%TEMP%` is *not* world-readable by other standard users by default, so it is a reasonable Windows equivalent of `0700`. Multi-admin / backup-agent exposure remains. | Accept per-user `%TEMP%` as the baseline; eliminate the disk-written token via `env:` injection (defense-in-depth). Optional hardening: explicit `icacls`/ACL — likely overkill, flag as out-of-scope polish. |
| Path separators | Default `path` module is `path.win32` on Windows (`\`, drive letters). | Never concatenate with `/` or `\` literals; always `path.join`. Don't string-compare paths with `startsWith("/")`. |
| Spaces in paths | `%USERPROFILE%`, `Program Files`, macOS `Application Support` all contain spaces. | Pass paths as **separate argv elements** (never build a single command string); keep copying `mcp-server.mjs` into the space-free temp dir (already done). If a `.cmd` must be launched via `cmd.exe /c`, the path still rides as its own argv element. |
| Long paths / `MAX_PATH` 260 | Legacy 260-char limit can bite: `C:\Users\<longname>\AppData\Local\Temp\drift-mcp-<uuid>\mcp-wrapper-<sessionId>.<ext>` is long. Win10+ supports long paths but only with opt-in / `\\?\` prefix. | Keep generated names **short**: shorter temp subdir, shorter UUID, short filenames. Avoid deep nesting. (MEDIUM — verify no path exceeds ~240 chars on CI.) |
| CRLF | `os.EOL` = `\r\n`. The legacy `.sh` generation assumed `\n`. | The `.sh`/wrapper generation is being deleted, so this mostly disappears. For data files (JSONL activity/approvals) use explicit `\n` and split on `/\r?\n/` when reading, so a CRLF write never breaks parsing. |
| UUID source | (related security note) `genUUID()` uses `Math.random` | Prefer `crypto.randomUUID()` — `crypto` is exposed by Caido's runtime (listed module). **CI-VERIFY** `globalThis.crypto.randomUUID` / `node:crypto` availability in LLRT. |

---

## Fact 4 — What Caido's Backend Runtime Actually Exposes (the critical unknown — ANSWERED, with CI flags)

**Confidence: HIGH that the modules exist; LOW that their behavior is Node-identical → CI-VERIFY the load-bearing ones.**

### Answered from official Caido docs + the LLRT source
- **Caido's backend runtime is AWS LLRT** (Low Latency Runtime: Rust + QuickJS), via **`github.com/caido/dependency-llrt`**. This is why Zod (heavy, Node-internals-dependent) crashes it — LLRT is *not* a drop-in Node.
- **Caido's QuickJS/LLRT module reference (`developer.caido.io/reference/modules/`) lists these as available:** `abort`, `buffer`, `child_process`, `console`, `crypto`, `dom-events`, `dns`, `events`, `fs`, `fs/promises`, `globals`, `http`, `https`, `net`, `os`, `path`, `sqlite`, `stream`, `stream/web`, `string_decoder`, `timers`, `url`.
- **The `os` module IS exposed** (`developer.caido.io/reference/modules/extra/os.html`) with: `arch()`, `homedir()`, `platform()`, `type()`, `release()`, `version()`, `tmpdir()`, and the `EOL` constant. Documented Windows returns: `homedir()` → `%USERPROFILE%`; `type()` → `'Windows_NT'`; `platform()` → `Platform` string (`'win32'`).
  - ⇒ **`os.tmpdir()`, `os.homedir()`, `os.platform()` are all available** — the planned fix's foundation is sound.
- **`process`**: not a standalone page in the module list, but it is a runtime global and `process.env.HOME` / `process.execPath` are already used in shipping code, so `process` exists. In LLRT it is marked **partial (⚠️)**.

### LLRT compatibility reality (every relevant module is ⚠️ partial)
Per `caido/dependency-llrt` / `awslabs/llrt` API matrix: `child_process`, `os`, `fs`, `fs/promises`, `path`, `process`, `crypto` are all **partially** supported. README: *"LLRT only supports a fraction of the Node.js APIs … NOT a drop-in replacement, nor will it ever be."* `buffer`, `stream`, `fs/promises` are noted as the more-complete ones; `child_process` and `fs` are explicitly called out as partial.

### What this means concretely (CI-VERIFY checklist for `windows-latest`)
| Assumption the fix depends on | Risk if wrong | CI test to write |
|-------------------------------|---------------|------------------|
| `spawn(node, [script], { env })` passes `env` to the child | **Fatal** — token/config never reach the MCP server | Spawn `node -e` that echoes a sentinel env var; assert it round-trips. |
| `os.tmpdir()` / `os.homedir()` return real Windows paths inside Caido | Temp dir + resolution break | Log both from the backend on Windows CI; assert they start with a drive letter and exist. |
| `os.platform()` returns `'win32'` (prefer over `process.platform`) | Wrong platform branch | Assert `os.platform()==="win32"` in CI; if using `process.platform`, assert it too. |
| LLRT `child_process` `EINVAL` behavior for `.cmd` | Provider launch strategy | Attempt a `.cmd` spawn on CI and record whether it throws / runs / hangs; this picks the provider-launch branch design. |
| `windowsHide:true` honored | Cosmetic (console flash) | Non-fatal; verify visually / accept as polish. |
| `crypto.randomUUID()` available | Falls back to `Math.random` | `typeof crypto.randomUUID === "function"` probe. |
| Exact import specifier for `os` (`"os"` vs `"node:os"`) | Build/import error | The shipping code imports `path` / `fs/promises` / `child_process` as **bare** specifiers, so `import { tmpdir, homedir, platform } from "os"` is the expected form — but **confirm the build resolves it** (the docs file it under an "extra" group). |

> **Bottom line for planning:** the *module surface* needed for the Windows fix is present in Caido's runtime, so the "spawn node directly + `os.tmpdir()` + `os.homedir()`" design is viable. But because every one of those modules is LLRT-*partial*, the first Windows phase must be a **thin spike that proves `spawn …{env}` and `os.*` on a real `windows-latest` runner** before the rest of the port is built on top. Do not treat any LLRT behavior as Node-guaranteed.

---

## Installation / Commands (Windows-relevant)

```bash
# No new runtime deps required for the core fix — it removes deps (bash, chmod, .sh, which).
# The port is API-substitution inside the existing Caido/LLRT runtime.

# Discovery primitives on Windows (spawned by the backend, not installed):
where node
where claude        # honors PATHEXT → finds claude.exe AND/OR claude.cmd

# Provider install commands to surface to Windows users (replace the curl|bash hints):
#   Claude Code (native, recommended): PowerShell →  irm https://claude.ai/install.ps1 | iex
#   (drops claude.exe in %USERPROFILE%\.local\bin)
```

**Optional library considered:** `cross-spawn` (handles `.cmd`/PATHEXT/escaping). See "What NOT to use" — recommended *against* for this codebase.

---

## Alternatives Considered

| Recommended | Alternative | When the alternative would win |
|-------------|-------------|-------------------------------|
| Spawn `node.exe` directly with `env:` (no wrapper) | Keep a generated launcher, but emit `.cmd`/`.ps1` instead of `.sh` | Only if Caido's LLRT spawn turns out **not** to honor `env:` (CI-VERIFY). Then fall back to a minimal `.cmd` that `set`s vars and calls node — accepting the disk-token tradeoff. |
| Hand-branch on extension + `cmd.exe /c` for shims | `cross-spawn` npm package | If provider resolution proves too messy across pnpm/volta/scoop shims *and* `cross-spawn` runs cleanly under LLRT (must be bundled + CI-proven). |
| `where.exe` for discovery | Bundle the `which` npm package (cross-platform) | If `where` parsing is flaky under LLRT, `which` (pure JS, reads `PATHEXT`) is a portable substitute — but adds a dep to a partial runtime. |
| `os.platform()` for branching | `process.platform` | Equivalent if CI proves `process.platform` works; `os.platform()` is the safer default since the `os` module is explicitly documented by Caido. |
| `crypto.randomUUID()` | Keep `Math.random` hex loop | Only if `crypto` is unavailable under LLRT (CI-VERIFY); current code already avoids `crypto` defensively. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `spawn(".cmd shim", args, { shell:true })` with any non-constant arg | Args are space-joined **unescaped** → command injection (DEP0190; CVE-class). | `cmd.exe /d /s /c <shim> <args>` with controlled argv, prompt on stdin; or resolve a real `.exe`. |
| Spawning `.cmd`/`.bat` directly without a strategy | **`EINVAL`** on Node ≥ 18.20.2/20.12.2/21.7.3 (CVE-2024-27980). | Branch on extension (see Fact 1 pattern). |
| Bare command names (`spawn("claude")`) | Node doesn't append `PATHEXT`; misses `.cmd`; non-deterministic with multiple matches. | Resolve absolute path **with extension** first. |
| `which`, `chmod`, `#!/bin/bash`, `.sh` wrappers | Don't exist / have no meaning on Windows (the literal cause of the reported failure). | `where` for discovery; **no wrapper at all** — direct `node` spawn. |
| Relying on `mode:0o700/0o600` for secrecy on Windows | Silently ignored (NTFS ACLs). | Per-user `%TEMP%` ACL + **don't write the token to disk** (env injection). |
| A hand-rolled `cmd.exe`/caret escaper | BatBadBut: cmd.exe re-parsing is famously un-escapable by hand. | Keep untrusted text off argv entirely; if escaping is unavoidable, use a vetted lib, not bespoke code. |
| Hardcoding `/tmp`, `/`, `$HOME`, `process.env.HOME` | All POSIX-only; empty/wrong on Windows. | `os.tmpdir()`, `path.join`, `os.homedir()`, `%USERPROFILE%`. |
| Trusting any LLRT API as Node-identical | LLRT is explicitly partial. | Prove load-bearing APIs on `windows-latest` CI first. |

---

## Stack Patterns by Variant

**If the resolved provider is a real `.exe` (native Claude, Volta/Bun/Scoop/pnpm `.exe` shims, `node.exe`):**
- Spawn it directly: `spawn(absExe, args, { env, windowsHide:true })`. No shell, no EINVAL, no injection. This is the happy path and covers the **blocking Claude provider** via the native installer.

**If the resolved provider is a `.cmd`/`.bat` (npm-global shims, some pnpm/fnm shims):**
- Spawn `cmd.exe /d /s /c <shimAbsPath> <args>` with `env` + `windowsHide:true`; keep the prompt on stdin. Acceptable because Drift's argv is controlled.

**If Caido LLRT spawn does NOT honor `env:` (worst case, decided by CI):**
- Minimal fallback: write a tiny `.cmd` (`@echo off` + `set KEY=VALUE` lines + `node "<script>" %*`) and launch it via `cmd.exe /c`. Re-introduces an on-disk token → mitigate with per-user `%TEMP%`, `crypto.randomUUID()` dir name, and prompt cleanup. **Only if CI forces it.**

**If registering MCP into external CLIs (`gemini`/`codex mcp add`):**
- Register **`node.exe` (absolute) + `[mcpScriptPath]` + an `env` dict**, never a script path. This is the same cross-platform shape Copilot already uses (`command` + `args` + `env` JSON). Avoids handing a `.sh`/`.cmd` to another tool. Exact `--env`/`-e` flag syntax per CLI is a per-phase detail.

---

## Version Compatibility

| Component | Threshold / value | Notes |
|-----------|-------------------|-------|
| Node (user system) — `.cmd` EINVAL guard active | ≥ **18.20.2 / 20.12.2 / 21.7.3** | Assume present everywhere in 2026. |
| Node — DEP0190 (`shell:true` arg deprecation) warning | Node **24+** | Cosmetic warning today; signals the long-term direction (avoid `shell:true`). |
| MCP server (`mcp-server.mjs`) minimum | Node ≥ 18 | Uses global `fetch` (Node 18+) + sync `fs`. |
| Caido runtime | LLRT (ships with Caido ≥ 0.55.x; plugin SDK 0.55.3) | All needed modules present but **partial**. |
| `os` / `where.exe` / `cmd.exe` | Windows 10/11 | `where`/`cmd` always present; long-path opt-in is Win10 1607+. |

---

## Sources

- **Node.js child_process API** — `https://nodejs.org/api/child_process.html` — `.bat`/`.cmd` launch rules, `shell` option, `windowsHide`, `windowsVerbatimArguments`, Windows command/`env` lookup, injection warnings — **HIGH**
- **Node.js April 2024 security release (CVE-2024-27980)** — `https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2` — EINVAL-on-`.bat`/`.cmd`, `shell:true` mitigation, `--security-revert` — **HIGH**
- **oss-sec CVE-2024-27980 advisory** — `https://seclists.org/oss-sec/2024/q2/79` — command-injection-via-args mechanism — **HIGH**
- **Tenable plugin 193573** — `https://www.tenable.com/plugins/nessus/193573` — exact fixed versions `18.20.2 / 20.12.2 / 21.7.3`, CVSS 8.1 — **HIGH**
- **Node.js commit "disallow direct .bat and .cmd file spawning"** — `https://github.com/nodejs/node/commit/9095c914ed` — the EINVAL implementation — **HIGH**
- **Node.js Deprecations (DEP0190)** — `https://nodejs.org/api/deprecations.html` + issue `https://github.com/nodejs/node/issues/58763` — `shell:true` args unescaped, `cmd.exe /c` replacement — **HIGH**
- **BatBadBut writeup (GMO Flatt Security)** — `https://flatt.tech/research/posts/batbadbut-you-cant-securely-execute-commands-on-windows/` — why hand-escaping cmd.exe is unsafe — **HIGH**
- **Node.js os API** — `https://nodejs.org/api/os.html` — `tmpdir()`/`homedir()`/`platform()` Windows semantics — **HIGH**
- **Caido — child_process module / Spawn a Process guide** — `https://developer.caido.io/concepts/modules/child_process.html` (404 at fetch; superseded) + `https://developer.caido.io/guides/spawning_process.html` — `spawn`, `shell` option, `exec` not implemented — **HIGH**
- **Caido — QuickJS/LLRT module reference index** — `https://developer.caido.io/reference/modules/` — full list of exposed modules (incl. `os`, `child_process`, `fs/promises`, `path`, `crypto`) — **HIGH**
- **Caido — `extra/os` module reference** — `https://developer.caido.io/reference/modules/extra/os.html` — `tmpdir/homedir/platform/type/EOL` + Windows returns — **HIGH**
- **Caido — backend SDK reference** — `https://developer.caido.io/reference/sdks/backend/` — SDK services; `sdk.env.getVar` — **HIGH** (for SDK), context for runtime
- **caido/dependency-llrt** — `https://github.com/caido/dependency-llrt` — confirms Caido runtime = LLRT; `child_process`/`os`/`fs`/`path`/`process`/`crypto` all ⚠️ partial — **HIGH**
- **awslabs/llrt API matrix** — `https://github.com/awslabs/llrt` (+ `API.md`) — partial-support semantics, "not a drop-in replacement" — **HIGH**
- **Node spawn ignores PATHEXT** — `https://github.com/nodejs/node/issues/6671` — bare names don't get `.cmd` — **MEDIUM-HIGH**
- **npm folders (global prefix on Windows)** — `https://docs.npmjs.com/cli/v11/configuring-npm/folders/` — `%APPDATA%\npm\*.cmd` — **HIGH**
- **Claude Code setup (native Windows installer)** — `https://code.claude.com/docs/en/setup` + `https://pq.hosting/en/help/install-claude-code-windows` — `%USERPROFILE%\.local\bin\claude.exe`, npm deprecated — **MEDIUM-HIGH**
- **Volta / fnm / nvm-windows / Bun / Scoop install locations** — `https://docs.volta.sh`, `https://github.com/Schniz/fnm`, `https://github.com/coreybutler/nvm-windows/wiki`, `https://bun.sh/docs/installation`, `https://github.com/ScoopInstaller/Scoop` — per-tool Windows bin paths — **MEDIUM**
- **Windows %TEMP% per-user ACL** — `https://learn.microsoft.com/en-us/answers/questions/5517216/` — default per-user temp ACL entries — **MEDIUM**

---
*Stack research for: native Windows runtime facts for the Drift Caido plugin port*
*Researched: 2026-06-26*
