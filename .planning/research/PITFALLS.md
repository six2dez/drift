# Pitfalls Research

**Domain:** Native Windows port of a Node-spawning Caido plugin (CLI launcher + token-bearing temp files + stdio MCP server), running in Caido's QuickJS runtime
**Researched:** 2026-06-26
**Confidence:** HIGH for the spawn/CVE/kill/CI core (Node advisories + reproduced in production CLIs + grounded in Drift's own code); MEDIUM for antivirus-timing and Caido-QuickJS runtime specifics (mechanism is documented, exact behavior is unverifiable without a real Windows Caido host)

> Scope note: The *obvious* POSIX breakages (`/tmp`, `chmod`, `#!/bin/bash`, `which`, `0o700`, `.sh` spawn) are already inventoried in `.planning/codebase/CONCERNS.md`. This document is the **second-order** layer: the things that still bite **after** those fixes land, plus the regressions the fix itself can introduce. Every pitfall is tied to Drift's actual launch path (`packages/backend/src/index.ts`, `command-resolution.ts`).

---

## Critical Pitfalls

### Pitfall 1: `shell: true` reintroduces command injection when spawning `.cmd` shims

**What goes wrong:**
On Windows, the four target CLIs are npm/installer shims — `claude.cmd`, `gemini.cmd`, `codex.cmd`, `copilot.cmd` (or `npx.cmd`). Node refuses to spawn a `.cmd`/`.bat` directly (see Pitfall 2), so the tempting one-line fix is to add `{ shell: true }` to the existing `spawn(launchCommand, launchArgs, …)` (`index.ts:2188`) and `spawnAndWait` (`index.ts:1521`). With `shell: true` on Windows, Node runs the command through `cmd.exe /c` and **every argument is re-parsed by the shell**. Drift's args carry: the MCP config path, the comma-joined tool allowlist (`--allowedTools mcp__drift__search_history,…`), the system prompt, and resolved file paths under `%TEMP%`. Any of these containing a shell metacharacter (`&`, `|`, `^`, `<`, `>`, `(`, `)`, `"`, `%VAR%`) is now interpreted, not passed literally — quoting bugs at best, command injection at worst. This is the *exact* vulnerability (CVE-2024-27980 / "BatBadBut") that the Node mitigation exists to prevent, now re-opened by the developer.

**Why it happens:**
`shell: true` is the first hit on every "spawn EINVAL Windows" search and the literal remediation sentence in the Node advisory ("if the input is sanitized, pass `{ shell: true }`"). Developers skip the "if sanitized" clause. Drift looks safe because the *token* travels via `env:` (not args) and tool names look like fixed constants — but the **file paths are not constant**: `%TEMP%` resolves to `C:\Users\<username>\AppData\Local\Temp`, so a username containing a space, `&`, `(`, or `'` (e.g. `C:\Users\Jo & Co\…`, `C:\Program Files (x86)\nodejs\node.exe`) flows straight into the shell-parsed command line. "Works on the maintainer's clean VM, fails/injects on the reporter's machine."

**How to avoid:**
- **Never** pass `{ shell: true }` together with interpolated/dynamic arguments. Treat `shell: true` as banned in this codebase.
- For Node-launchable targets (the MCP server, the self-test), spawn the resolved **`node.exe`** with an **argument array and no shell** — `.exe` is exempt from the EINVAL rule, so this is both safe and injection-free. This is already the planned refactor; keep it strict.
- For the external `.cmd` CLIs that *must* be run, route through cmd explicitly with an argument array, not a concatenated string: `spawn("cmd.exe", ["/d", "/s", "/c", cmdFilePath, ...args], { windowsHide: true })`. cmd still applies its own parsing, so additionally quote args that contain whitespace/metacharacters, or adopt `cross-spawn` (which wraps `.cmd` via `cmd /c` with vetted escaping) **if** it bundles and runs under Caido's QuickJS (verify — see Pitfall 8).
- Add a unit-testable `buildSpawnPlan(command, args, platform)` pure helper that returns `{ file, args, shell:false }` and encodes the platform branch, so the escaping logic is covered by `provider-launch`-style snapshot tests instead of living inline in `index.ts`.

**Warning signs:**
- `{ shell: true }` appearing anywhere in a diff that also passes dynamic args.
- A test username/temp path with a space or `(x86)` "mysteriously" breaks only on Windows.
- Snapshot of the resolved launch line (`index.ts:2143` logs `Resolved launch: …`) shows a single concatenated string rather than a clean argv array.

**Phase to address:** **P1 (runtime-foundation refactor)** for the safe-spawn helper + ban; exercised and verified in **P3 (provider launch + MCP registration)**.

---

### Pitfall 2: The `.cmd` "squeeze" — `ENOENT` without the extension, `EINVAL` with it (and the inverse POSIX regression)

**What goes wrong:**
Two failure modes flank the same call, reproduced verbatim in the GitHub Copilot CLI's own Windows MCP bug (`spawn("npx")` → `Error: spawn npx ENOENT`; `spawn("npx.cmd")` → `Error: spawn EINVAL`):
1. **ENOENT:** `child_process.spawn` on Windows does **not** consult `PATHEXT`. `spawn("claude", …)` fails with `ENOENT` even though `claude.cmd` is on `PATH`, because Node looks for a file literally named `claude`. So command resolution *must* return the full filename including extension.
2. **EINVAL:** Once resolution correctly yields `claude.cmd`, spawning it directly (no shell) throws `Error: spawn EINVAL` on every patched Node — **≥ 18.20.2, ≥ 20.12.2, ≥ 21.7.3 and all newer** (CVE-2024-27980). Drift declares `engines.node >= 20` and the maintainer runs v24.13.0, so **the patched behavior is guaranteed, not hypothetical**. This hits `index.ts:2188` (provider launch), `index.ts:1547` (the `--version` probe inside `resolveCommand`), and `index.ts:1587-1645` (`gemini/codex mcp remove|add`).

**The inverse regression (the fix breaking POSIX):** a careless cross-platform patch reintroduces *macOS/Linux* failures:
- Appending `.exe`/`.cmd` suffixes unconditionally → resolution fails on POSIX (`claude.cmd` doesn't exist there).
- `shell: true` unconditionally → on POSIX, Node runs `/bin/sh -c` and **collapses the argv array into one string**, so any path with a space (the macOS asset path literally contains `Application Support`, which is why `index.ts` already copies `mcp-server.mjs` to temp) breaks, and injection returns on POSIX too.
- A `cmd /c` wrapper that isn't gated on `process.platform === "win32"` → `spawn cmd ENOENT` on macOS/Linux.
- Swapping `which` → `where` without a branch → `where` doesn't exist on POSIX (and `which` doesn't on Windows).

**Why it happens:**
The ENOENT and EINVAL errors look like two different bugs, so they get two different "quick fixes" that fight each other. And because the maintainer **cannot test native Windows locally** (PROJECT.md constraint), the POSIX regression is the only half that's observable on their machine — so the Windows-shaped fix ships untested against POSIX in the same breath.

**How to avoid:**
- Centralize **all** platform divergence in two pure helpers: `resolveExecutable()` (returns full path *with* extension on Windows, bare on POSIX) and `buildSpawnPlan()` (decides direct-`node` vs `cmd /c` vs direct-exec). Branch on `process.platform` **once**, inside these helpers.
- Prefer the architecture that sidesteps the squeeze entirely: spawn **`node.exe <script>`** for everything Drift controls (MCP server + self-test). `node.exe` is a real executable, never a `.cmd` → no ENOENT, no EINVAL, no shell. The squeeze then only remains for the *external* provider binaries, narrowing the risky surface to one code path.
- Keep the existing POSIX path **byte-for-byte unchanged** when `platform !== "win32"`; the `provider-launch.test.ts` exact-`toEqual` snapshots are the regression net — do not let the Windows branch perturb them.

**Warning signs:**
- `Error: spawn EINVAL` or `spawn <name> ENOENT` in the Caido plugin console or session debug log.
- macOS/Linux snapshot tests in `provider-launch.test.ts` start failing after a "Windows" commit (that's the inverse regression surfacing).
- `resolveCommand` returns a path with no extension on Windows.

**Phase to address:** **P2 (command/binary resolution)** for the ENOENT/extension half; **P1 + P3** for the EINVAL-safe spawn and the POSIX-regression guard.

---

### Pitfall 3: Antivirus / Windows Defender locks a freshly-written temp file, causing intermittent spawn/rename failures

**What goes wrong:**
Drift's hot path is **write-then-immediately-execute**: on MCP start it copies `mcp-server.mjs` into `%TEMP%\drift-mcp-<uuid>\` and then spawns `node` against it; on every turn it writes `mcp-<chatId>.json` / `copilot-mcp-<chatId>.json` and the per-session files, then launches the CLI that reads them; the atomic-write helper does `writeFile(x.tmp)` → `rename(x.tmp, x)`. Windows Defender's real-time protection scans a file **synchronously on close/first-access**, holding a transient exclusive handle. If Drift races that scan, it sees intermittent `EPERM: operation not permitted, rename`, `EBUSY`, or `UNKNOWN` on the rename, or a spawn/read that fails because the `.mjs` is briefly locked. Because the scan duration depends on file size, machine load, and AV vendor, this is the canonical **non-deterministic "fails 1 in 20 launches on the reporter's machine, never on mine."**

**Why it happens:**
On POSIX there is effectively no scanner holding write/exec locks, so the write→exec pattern is reliable and nobody adds retries. The same code on Windows is a race against an OS-level scanner the developer can't see. Defender is on by default on every consumer Windows install, and security tooling (Drift's own audience — pentesters — often run *additional* EDR/AV) makes it worse, not better.

**How to avoid:**
- Wrap the write→rename→(spawn/read) sequence in a **bounded retry with small backoff** specifically catching `EPERM`/`EBUSY`/`UNKNOWN` (e.g., 5 attempts, 50→500 ms). This is the standard, accepted Windows mitigation; treat these errno values as "transient, retry," not "fatal."
- **Widen the scan window:** copy `mcp-server.mjs` to its temp path **once at MCP start and reuse it** for the lifetime of the server, instead of re-copying per turn — the file is then scanned once, long before it's executed under time pressure. (The per-turn churn is the *config JSON*, which is small and read by the CLI, not exec'd — lower risk.)
- Prefer **in-memory env injection over on-disk config** wherever the channel allows it (also helps Pitfall 5): a file that's never written can't be locked.
- Do **not** try to defeat AV (adding exclusions, etc.) from the plugin — out of scope and a security smell. Retry + reuse is the contract.

**Warning signs:**
- Sporadic `EPERM`/`EBUSY` on `rename` or `spawn` in the session debug log with no code change between success and failure.
- Failures correlate with "first launch after boot" or "first launch after install" (cold scanner cache).
- The original reporter (@0xMRK0S) sees flaky health-check passes/fails on retry.

**Phase to address:** **P1 (runtime foundation)** — the retry/backoff write helper and the copy-once-reuse change belong with the temp-dir refactor. This is the highest-leverage anti-flake fix; ship it before asking the reporter to re-test.

---

### Pitfall 4: Orphaned process trees — `proc.kill()` does not reap children on Windows

**What goes wrong:**
Windows has no POSIX signals; `ChildProcess.kill('SIGTERM' | 'SIGKILL')` ignores the signal argument and force-terminates **only the immediate process, never its descendants**. Drift's kill sites (`index.ts:1207`, `1263`, `1801`, `2400-2409`, `2649-2678`) assume a signal-driven graceful-then-forceful shutdown. On Windows, when a turn times out or the user cancels, the provider process tree is `cmd.exe → claude.cmd → node → (its child MCP server `node mcp-server.mjs`)`. Killing the top of that tree leaves the real worker **and the MCP server holding the Caido token in its environment** running as orphans. Symptoms: cancellation "succeeds" in the UI but the turn keeps running; `node.exe` accumulates in Task Manager; the token-bearing MCP process survives session end; the next launch races a zombie; `processTimeoutSeconds` never actually stops the work.

**Why it happens:**
`proc.kill('SIGKILL')` *looks* cross-platform and even "works" (the parent dies), so the bug is invisible in a quick smoke test — the orphans are silent. The graceful→forceful SIGTERM-then-SIGKILL ladder (`requestGracefulShutdown`, `index.ts:2403`) is pure POSIX semantics that degrade to "kill the wrapper, abandon the tree" on Windows. The intermediate `cmd.exe` shim layer (from Pitfall 1's fix) *adds* a tree level, making it worse.

**How to avoid:**
- Add a platform-branched `killTree(proc)`:
  - **Windows:** `spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true })` — `/T` kills the whole tree, `/F` forces it. (`taskkill` is `taskkill.exe`, safe to spawn directly.)
  - **POSIX:** keep the existing SIGTERM→SIGKILL ladder; optionally spawn the provider `{ detached: true }` and `process.kill(-proc.pid)` to reap the group.
- Minimize tree depth on Windows by spawning the MCP server as **`node.exe` directly** (no shell/cmd layer) so there's no extra process to orphan for Drift's own subprocess.
- On session finalize / `stopMcpServer` / plugin shutdown, call `killTree` for any tracked pid in `activeProcesses` before deleting temp dirs, so the token-bearing process is gone before its env-source files are swept.
- `proc.pid` can be `undefined` if the spawn failed; guard before `taskkill`.

**Warning signs:**
- Cancelled/timed-out turns keep emitting output or the UI stays "running."
- Lingering `node.exe` / provider processes in Task Manager after closing a chat.
- The MCP self-test's 10 s timeout (`index.ts:1204-1211`) fires but a worker survives.

**Phase to address:** **P4 (process lifecycle)**, with the no-extra-shell-layer spawn decided in **P1/P3**.

---

### Pitfall 5: The env-injection refactor **relocates** the on-disk token, it does not remove it — and Windows ignores `0o600`

**What goes wrong:**
The headline fix ("pass env via spawn `env` + MCP config JSON `env`") removes the token from the `.sh` wrappers, which feels like a security win. But the token doesn't disappear from disk — it **moves**:
- **Claude:** `writeChatMcpConfig("mcp-<chatId>.json", …)` (`index.ts:1956`) today points at a wrapper with empty `args`. Post-refactor it must become `{ command: node, args:[mcpScript], env:{ CAIDO_TOKEN, … } }` → the token is now plaintext inside `mcp-<chatId>.json`.
- **Copilot:** `copilot-mcp-<chatId>.json` (`index.ts:2003-2014`) **already** embeds `env: { CAIDO_TOKEN }` on disk today.
- **Gemini/Codex:** `mcp add drift -- <command>` (`index.ts:1588`) writes the server entry into the **CLI's own config** (`~/.gemini/…`, `~/.codex/…`) — i.e. the token lands **outside** `%TEMP%`, in a persistent user-config location that Drift's `sweepOrphanedMcpTempDirs` never cleans, surviving until `mcp remove`.

On Windows the existing `mode: 0o600`/`0o700` is **silently ignored** — Node accepts the option and does nothing. Protection then rests entirely on the default per-user ACL of `%TEMP%` (which restricts to the user + SYSTEM + Administrators). That baseline is real but: (a) other local admins / SYSTEM-context EDR/backup agents can still read it, (b) the Gemini/Codex path escapes `%TEMP%` entirely, and (c) `genUUID()` uses `Math.random` (CONCERNS.md), so the directory name is guessable, weakening the "create then chmod" race protection that no longer exists on Windows anyway.

**Why it happens:**
"Removed the token from the bash script" reads as "removed the token from disk." The Copilot path already normalized writing the token to JSON, so the pattern looks blessed. And `0o600` in the code makes it *look* like file perms are handled, masking that the option is a no-op on Windows.

**How to avoid:**
- **Prefer the zero-disk channel where it exists.** The self-test and any Drift-spawned `node` MCP server should receive the token **only via the `env:` option of `spawn`** — never written to a file. This genuinely removes disk exposure for those paths and is enabled by the same refactor.
- For external CLIs that *require* a config file (Claude `--mcp-config`, Copilot `--additional-mcp-config`), **minimize lifetime**: write the config, let the CLI start, then delete it as soon as the CLI has read it / on turn finalize — don't leave token-bearing JSON for the whole session.
- On Windows, set restrictive ACLs explicitly rather than trusting an ignored `0o600`: create the per-session dir and `icacls <dir> /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F"` (or the SID equivalent), or document the per-user `%TEMP%` ACL as the accepted trade-off (PROJECT.md allows an "accepted trade-off"). Pick one explicitly; don't leave it implicit.
- For Gemini/Codex, guarantee `mcp remove drift` runs on cleanup/uninstall so the token doesn't persist in `~/.gemini`/`~/.codex`; treat a failed `mcp remove` as a security event worth logging.
- Use `crypto.randomUUID()` / `crypto.getRandomValues()` for the temp dir name if Caido's runtime exposes Web Crypto (CONCERNS.md tech-debt item), removing the guessable-name angle.

**Warning signs:**
- `grep CAIDO_TOKEN` over `%TEMP%\drift-mcp-*` or `~/.gemini`/`~/.codex` finds a live token after a session ends.
- The redaction regex at `index.ts:351-352` (which already covers both `CAIDO_TOKEN='…'` and `"CAIDO_TOKEN":"…"`) is the tell that the token exists in *both* shapes — the JSON shape is the one that survives the refactor.
- Token-bearing files remain after a crash (no atomic cleanup on the rename-residue path, CONCERNS.md).

**Phase to address:** **P5 (token security on Windows)**, but the env-only-for-self-test decision is made in **P1** and must not regress.

---

### Pitfall 5b: Paths with spaces and parentheses break argument and config construction

**What goes wrong:**
Windows install/temp paths routinely contain spaces and shell-special characters: `C:\Program Files\nodejs\node.exe`, `C:\Program Files (x86)\…` (parentheses!), `C:\Users\First Last\AppData\…`, `%LOCALAPPDATA%\Programs\…`. Three distinct breakages: (1) if any of these flow through `shell: true`/`cmd /c` unquoted, the space splits the argument and `(x86)` parens are cmd grouping operators (Pitfall 1); (2) when these paths are embedded into the **MCP config JSON** as `command`/`args`, a backslash path must be a valid JSON string — `JSON.stringify` handles escaping, but **hand-built** JSON or string-concatenated config would corrupt `C:\Users\…` into invalid escapes; (3) some CLIs' own `--mcp-config` parsers historically choke on spaces in the path — which is *why* Drift already copies `mcp-server.mjs` to a temp dir (`index.ts` comment), but `%TEMP%` itself contains `C:\Users\First Last\…`, so the space is back.

**Why it happens:**
The macOS asset path's `Application Support` space taught the team to copy-to-temp, but on Windows the *temp root itself* has a space (the username), so the mitigation is incomplete. Parentheses are not on most developers' radar as shell metacharacters.

**How to avoid:**
- Pass paths as **discrete argv elements**, never interpolated into a command string; with `node.exe <script>` + args array there's no shell to mis-split.
- Always build config via `JSON.stringify` (Drift already does at `index.ts:292`) — never hand-concatenate JSON containing Windows paths.
- If a provider's `--mcp-config` parser still struggles with spaces, prefer an 8.3 short-path or quote per that provider's documented rules — but first confirm the direct-`node`-spawn path avoids passing the spaced path to a shell at all.

**Warning signs:** `is not recognized as an internal or external command` (cmd split a path), JSON parse errors in a CLI reading the config, failures only for users whose Windows display name has a space.

**Phase to address:** **P1** (argv discipline) and **P3** (per-provider config).

---

### Pitfall 6: CRLF contamination — in `where` output, in generated JSON/scripts, and via git autocrlf

**What goes wrong:**
Three CRLF traps converge on a Windows port:
1. **`where` output:** the `where.exe` replacement for `which` returns results **CRLF-terminated and possibly multi-line** (e.g. `where node` can list `node.exe` *and* a `node.cmd`). Splitting on `\n` without stripping `\r` yields a path like `"C:\…\node.exe\r"`, which then fails to spawn with `ENOENT`. Taking only the first line can also pick a `.cmd` over the `.exe`.
2. **Generated files:** if any generated launcher/config is written with `\n` and later consumed by a tool expecting `\r\n` (or vice-versa), parsing breaks. (Direct-`node` spawn removes the *script* case, but JSON configs and any `.cmd` we emit are still affected.)
3. **CI / git autocrlf:** on `windows-latest`, `git` checkout with `core.autocrlf=true` rewrites `\n`→`\r\n`, which silently breaks **exact-string snapshot tests** (`provider-launch.test.ts`, `claude-print.test.ts`) and any fixture compared byte-for-byte — tests fail on Windows CI for reasons unrelated to the code under test.

**Why it happens:**
Line endings are invisible in editors and diffs. The `which`→`where` swap is treated as a drop-in, but the output format differs (CRLF, multi-line). Git's autocrlf is on by default in many Windows setups and on the hosted runner unless configured.

**How to avoid:**
- Parse `where` output with `.split(/\r?\n/).map(s => s.trim()).filter(Boolean)` and **prefer `.exe` over `.cmd`** for `node`; validate each candidate with `fs` before use.
- Add a repo `.gitattributes`: `* text=auto eol=lf` plus explicit `*.mjs`, fixtures, and any `*.sh` as `eol=lf`; this makes checkout deterministic across OSes and protects the snapshot tests.
- In CI, set `git config --global core.autocrlf false` before checkout, or rely on `.gitattributes`.
- Make snapshot tests newline-agnostic where the value isn't itself testing newlines (normalize `\r\n`→`\n` before compare).

**Warning signs:** `spawn …\r ENOENT`; snapshot diffs that show `\r` or "no visible difference"; tests green on macOS/Linux CI but red on `windows-latest` with whitespace-only diffs.

**Phase to address:** **P2** (`where` parsing) and **P6** (CI line-ending hardening).

---

### Pitfall 7: `MAX_PATH` (260) blowups in `%TEMP%\drift-mcp-<uuid>\…`

**What goes wrong:**
Windows' default `MAX_PATH` is 260 characters. Drift's runtime paths nest a UUID dir under a per-user temp root and then add long filenames: `C:\Users\<longname>\AppData\Local\Temp\drift-mcp-<uuid>\mcp-wrapper-drift-<timestamp>.sh` / `copilot-mcp-<chatId>.json`. With a long username, a long `%TEMP%` redirect, or long chat/session IDs, the full path can exceed 260, and `fs` operations fail with `ENAMETOOLONG` / `ENOENT` even though the code is correct. `LongPathsEnabled` (registry/Group Policy) lifts the limit to ~32 767 via the `\\?\` prefix, but it is **off by default** and Node only honors it for paths it doesn't normalize away — so you cannot assume it.

**Why it happens:**
POSIX temp paths are short (`/tmp/drift-mcp-<uuid>/…`) so length is never a concern; the Windows temp root alone is ~50+ chars before Drift adds anything, and the UUID + descriptive filenames eat the budget fast.

**How to avoid:**
- Keep generated filenames **short**: drop the redundant `drift-` prefixes inside an already-`drift-mcp-<uuid>` dir; consider a short hash instead of `drift-${Date.now()}` session IDs (which also fixes the same-millisecond collision in CONCERNS.md).
- Don't deeply nest; keep the per-session files one level under the uuid dir (already the case — keep it).
- If a path may exceed 260, prefix with `\\?\` for `fs` calls on Windows (and pass absolute paths), but treat this as a fallback, not the primary plan.
- Add a guard that logs an actionable error if a constructed runtime path length approaches 260, rather than failing opaquely.

**Warning signs:** `ENAMETOOLONG`, or `ENOENT` for a path that visibly exists, on machines with long usernames or redirected `%TEMP%`.

**Phase to address:** **P1** (temp-path/filename scheme) — decide the naming when `os.tmpdir()` replaces `/tmp`.

---

### Pitfall 8: Caido's QuickJS runtime may not expose the Node APIs the branch logic assumes — discovered only at runtime on a real Windows host

**What goes wrong:**
The backend runs in Caido's constrained QuickJS runtime, not Node — no Zod, no dynamic `require`, no `import.meta` (ARCHITECTURE.md). The entire Windows port hinges on three runtime facts that are **unverified on a real Windows Caido**: that `process.platform` actually reports `"win32"`, that `os.tmpdir()` exists and returns `%TEMP%`, and that `process.env.USERPROFILE`/`APPDATA`/`LOCALAPPDATA` are populated. PROJECT.md explicitly flags this as an open question. If any is missing/wrong, the platform branch silently takes the wrong path: e.g. `process.platform` undefined → the code keeps doing POSIX things on Windows; `os.tmpdir()` absent → temp-dir creation throws deep in startup; `path` behaving as POSIX-only → `path.join` emits `/` separators that `where`/`cmd` reject. Because the maintainer can't run Caido on Windows, these surface only when the reporter hits them, as an opaque "failed to run the mcp server."

**Why it happens:**
`os.tmpdir()`/`process.platform` are assumed-universal Node primitives; nobody expects them to be missing. But Caido shims `child_process`/`fs` (ARCHITECTURE.md notes it provides only what it exposes), so "available in Node" ≠ "available here." Third-party helpers (`cross-spawn`, `which`, `tree-kill`) compound the risk — they may reference APIs the shim lacks and fail at import/runtime.

**How to avoid:**
- **Feature-detect, then fail loudly.** At MCP-start, probe the primitives and, on a Windows host where one is missing, return a specific, actionable error string ("Drift needs `os.tmpdir()` but Caido's runtime didn't provide it on this Windows build — please report with your Caido version") instead of a generic failure. Add the probe results to the support bundle (`index.ts:2921`).
- Capture `process.platform`, `os.tmpdir()`, `process.versions`, and key env vars in the session debug log and the support bundle so a remote reporter's logs answer the open question without the maintainer needing a Windows box.
- Prefer **standard library + small in-repo helpers** over npm spawn-wrappers, so nothing depends on an API the shim might lack; if you must use `cross-spawn`, smoke-test that it imports and runs under QuickJS in CI's build step before relying on it.
- Don't hard-fail the whole plugin on a missing optional API (e.g. debug log path) — degrade gracefully and only hard-fail where the token/launch genuinely can't proceed.

**Warning signs:** generic "failed to run the mcp server" with no errno; behavior that implies the POSIX branch ran on Windows (e.g. a `/tmp/...` path in a Windows reporter's log); a third-party import that throws at plugin load.

**Phase to address:** **P1** (runtime probing + fail-loud), feeding **P6** (CI can't catch QuickJS-on-Windows gaps — only a real host can, so the fail-loud diagnostics are the substitute).

---

### Pitfall 9: CI on `windows-latest` passes/fails for the wrong reasons (shell, separators, pnpm)

**What goes wrong:**
The `windows-latest` GitHub runner defaults the `run:` shell to **`pwsh` (PowerShell Core)**, not bash. Any workflow `run:` step written with bash syntax (`export X=…`, `FOO=bar cmd`, `&&` chains that assume sh, heredocs, `$(...)`) silently misbehaves or errors on Windows. Separately, tests that hardcode POSIX assumptions fail on Windows for environmental reasons: a test asserting a path equals `/tmp/...` or splitting on `/`, a fixture compared with `\n` (Pitfall 6), or `process.execPath`-based MCP integration tests (`mcp-server.*.test.ts`) that assume forward-slash paths. And pnpm must be installed on the runner (`pnpm/action-setup` + `actions/setup-node` with `cache: pnpm`) or the build step fails before any test runs — and Corepack/`packageManager` pinning (`pnpm@9.0.0`) must match.

**Why it happens:**
The maintainer validates on macOS/Linux where the default shell is bash and `/` is the separator; the same workflow YAML behaves differently on the Windows runner. CI is the **only** Windows validation Drift has (PROJECT.md), so a CI that's green for the wrong reason gives false confidence that native Windows works.

**How to avoid:**
- Pin `shell: bash` explicitly on any cross-platform `run:` step (bash is available on the Windows runner), or write steps as pwsh-safe. Use a matrix (`os: [ubuntu-latest, windows-latest, macos-latest]`) so the same steps run everywhere.
- Set up pnpm with `pnpm/action-setup@v4` (version matching `packageManager`) **before** `actions/setup-node@v4` with `cache: 'pnpm'`; run `pnpm install --frozen-lockfile`.
- Audit tests for POSIX assumptions: replace hardcoded `/tmp` and `/`-splits with `os.tmpdir()` and `path.sep`/`path.join`; the existing temp-dir test helper already uses `os.tmpdir()` (TESTING.md) — extend that discipline to assertions.
- Add `.gitattributes` (Pitfall 6) so checkout doesn't rewrite line endings under the tests.
- Make the Windows CI job **required** for merge, and ensure it actually exercises the spawn paths it can (the `mcp-server.*.test.ts` integration tests spawn real `node` — those *do* run on Windows and are the closest proxy to the real launch path).

**Warning signs:** Windows CI green while a Windows user still fails (CI not exercising the real path); `run:` steps erroring with PowerShell parse messages; `pnpm: command not found` on the runner; snapshot diffs that are whitespace-only.

**Phase to address:** **P6 (CI on `windows-latest`)** — stand this up early so every later phase has the regression net PROJECT.md depends on.

---

## Technical Debt Patterns

Shortcuts that look reasonable mid-refactor but cost later.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `{ shell: true }` to make `.cmd` spawn "just work" | One-line fix, EINVAL gone | Re-opens CVE-2024-27980 injection; breaks on spaced/`(x86)` paths; corrupts POSIX argv | **Never** with dynamic args |
| Keep writing the token to MCP config JSON because Copilot already does | No new code; "consistent" | Token persists on disk on Windows with `0o600` ignored; broadens exposure | Only with short-lived config + explicit ACL/accepted-trade-off doc |
| `proc.kill('SIGKILL')` everywhere, ship it | Compiles, parent dies, looks fine | Orphaned token-bearing process trees on Windows; cancel/timeout don't really stop work | Never on Windows; use `taskkill /T /F` |
| Treat `which`→`where` as a drop-in | Fast | CRLF/multi-line output → `\r`-suffixed paths → ENOENT | Never without CRLF-safe parsing |
| Depend on `cross-spawn`/`tree-kill`/`which` npm pkgs | Battle-tested escaping/tree-kill | May not import/run under Caido QuickJS; supply-chain + bundle size | Only after a CI smoke-test proves it runs in the runtime |
| Hardcode `process.platform === 'win32'` branches inline across `index.ts` | Quick | Untestable, scattered, easy to miss one site → POSIX regression | Only behind pure helpers with unit tests |

## Integration Gotchas

Per-provider and per-service mistakes specific to Drift's launch/registration paths.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Claude Code** (`--mcp-config`) | Replace `.sh` wrapper with `node`+env but leave token in `mcp-<chatId>.json` for the whole session | Embed env via JSON (`JSON.stringify`), delete config on turn finalize; spawn the resolved `claude.cmd` EINVAL-safely |
| **Gemini / Codex** (`mcp add drift -- …`) | Register a command the CLI later spawns as a `.cmd`/`.sh`, or that writes the token into `~/.gemini`/`~/.codex` persistently | Register `node <mcpScript>` with env the CLI supports; guarantee `mcp remove` on cleanup; verify the CLI itself spawns it EINVAL-safe (Copilot CLI had this exact bug) |
| **GitHub Copilot** (`--additional-mcp-config`) | Already embeds token in `copilot-mcp-<chatId>.json`; assume that's fine on Windows | Minimize config lifetime + set ACLs; it's the template for the Windows token-on-disk risk |
| **`node` resolution** | Pick first `where node` line (may be `node.cmd` or `\r`-suffixed) | CRLF-split, prefer `.exe`, validate with `fs`; fall back to `process.execPath` only if it's a real node |
| **External CLI spawning Drift's MCP server** | Assume the CLI runs the registered stdio server fine on Windows | The CLI may hit the same `.cmd`/`npx` ENOENT/EINVAL squeeze (proven in Copilot CLI #3576); register a `node`-based command, not `npx`/a `.cmd` |

## Performance / Reliability Traps

Windows-specific reliability cliffs (less about scale, more about flakiness).

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-copy `mcp-server.mjs` per turn into AV's path | Intermittent `EPERM`/`EBUSY`/spawn fail under Defender | Copy once at MCP start, reuse; retry-on-EPERM | Any Windows box with real-time AV (i.e. ~all) |
| No retry on `rename`/`spawn` of fresh files | Flaky 1-in-N launch failures | Bounded backoff retry on `EPERM/EBUSY/UNKNOWN` | Cold scanner cache (first launch after boot/install) |
| Synchronous full-file reads of growing JSONL each tick (CONCERNS.md) | CPU/IO climbs in long sessions | Tail from offset | Long tool-heavy sessions (cross-platform, worse on slow Windows FS) |
| Orphan `node.exe` accumulation | Memory/handle growth, port/file contention | `killTree` on finalize | Every cancelled/timed-out turn on Windows |

## Security Mistakes

Beyond OWASP basics — specific to a token-bearing local launcher on Windows.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trust `mode: 0o600`/`0o700` on Windows | Silently no-op; token files readable per `%TEMP%` ACL only | Set ACLs with `icacls` or document the per-user-temp trade-off explicitly |
| Token persists in MCP config JSON for the whole session | Local admin/EDR/backup reads it; survives crash as residue | Prefer `env:`-only; short-lived config; atomic cleanup incl. `.tmp` residue |
| Token written outside `%TEMP%` via `gemini/codex mcp add` | Persists in user CLI config, unswept | Always `mcp remove` on cleanup; log failures |
| `genUUID()` via `Math.random` for temp dir name | Guessable dir; weak race protection (no chmod gate on Windows) | `crypto.randomUUID()` / `getRandomValues()` if runtime exposes it |
| `shell:true` with paths containing user-controlled segments | Command injection (CVE-2024-27980 class) | Argv arrays, no shell; `cmd /c` only with vetted escaping |
| Leave token-bearing process alive after kill | Token resident in orphan's env | `taskkill /T /F` the whole tree before sweeping files |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Spawning `cmd.exe`/CLIs flashes console windows | Black windows pop on every turn | Pass `windowsHide: true` to every `spawn` |
| Unix install hints on Windows (`curl … | bash`, CONCERNS.md #9) | Actionless errors for Windows users | Windows-specific install guidance (`npm i -g`, winget/scoop, `where`) |
| Binary-path picker only accepts extensionless/Unix paths | Can't point at `claude.cmd`/`node.exe` | Accept `.exe`/`.cmd`; validate the file exists and is runnable |
| Generic "failed to run the mcp server" (the original report) | User can't self-diagnose | Fail loud with errno + which step + remediation; attach to support bundle |

## "Looks Done But Isn't" Checklist

- [ ] **Provider launch on Windows:** spawns `claude.cmd` without `ENOENT` (full extension) **and** without `EINVAL` (not a bare `.cmd` direct-spawn) — verify with a real `.cmd` on PATH, not just `node`.
- [ ] **No `shell: true`** anywhere a dynamic arg/path is passed — grep the diff.
- [ ] **POSIX unchanged:** `provider-launch.test.ts` exact snapshots still green on macOS/Linux after the Windows branch.
- [ ] **AV resilience:** write→rename→spawn has bounded retry; `mcp-server.mjs` copied once not per-turn.
- [ ] **Process tree death:** cancel/timeout leaves **zero** lingering `node.exe`/provider processes in Task Manager.
- [ ] **Token off disk where possible:** self-test/direct MCP spawn uses `env:` only; `grep CAIDO_TOKEN %TEMP%` is empty after session end.
- [ ] **`mcp remove`** actually runs for Gemini/Codex so the token isn't left in `~/.gemini`/`~/.codex`.
- [ ] **CRLF:** `where` output parsed `\r`-safe; `.gitattributes` present; snapshot tests newline-stable on Windows CI.
- [ ] **Runtime probe:** `process.platform`/`os.tmpdir()` confirmed present on a real Windows Caido (or fail-loud diagnostic ships).
- [ ] **CI matrix** includes `windows-latest`, is **required**, uses `shell: bash` for bash steps and `pnpm/action-setup`, and actually runs the `mcp-server.*.test.ts` spawn integration tests.
- [ ] **`windowsHide: true`** on all spawns (no console flashes).
- [ ] **Long paths:** runtime filenames short enough to stay under 260 with a long username.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shipped `shell:true` injection | MEDIUM | Revert to argv/`cmd /c`; audit for exploited paths; patch release; note in CHANGELOG |
| Orphaned process trees | LOW–MEDIUM | Add `killTree` (`taskkill /T /F`); ship a "kill stale Drift processes" action; users end-task meanwhile |
| Token left on disk | MEDIUM | Tighten to `env:`-only + short-lived config + `icacls`; instruct affected users to rotate Caido session / clear `%TEMP%\drift-mcp-*` and CLI MCP config |
| AV flakiness reported | LOW | Add retry/backoff + copy-once; ask reporter to retry; only then consider docs about AV exclusions (user-side, not plugin-side) |
| POSIX regression from Windows fix | LOW | Caught by existing snapshots if CI matrix exists; gate Windows logic behind `platform === 'win32'` |
| QuickJS API missing on Windows | HIGH (needs a real host) | Fail-loud diagnostic + support bundle → remote reporter supplies logs → targeted shim/workaround |

## Pitfall-to-Phase Mapping

Suggested phase themes for the roadmap (names, not fixed numbers): **P1** Runtime-foundation refactor (direct `node` spawn + env injection + `os.tmpdir()` + safe-spawn/safe-kill helpers + runtime probe) · **P2** Command/binary resolution on Windows · **P3** Provider launch + MCP registration on Windows · **P4** Process lifecycle (tree kill, cancel, timeout) · **P5** Token security on Windows · **P6** CI on `windows-latest` · **P7** Windows polish + docs.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. `shell:true` injection | P1 (helper/ban) → P3 (use) | Diff grep for `shell:true`+args; injection unit test on spaced/`(x86)`/`&` paths |
| 2. EINVAL/ENOENT squeeze + inverse POSIX regression | P2 (resolution) + P1/P3 (spawn) | Real `.cmd`-on-PATH launch on Windows CI; macOS/Linux snapshots still green |
| 3. AV file-lock race | **P1** (do first) | Retry helper unit-tested; reporter confirms reduced flakiness; copy-once verified |
| 4. Orphaned process trees | P4 | Task Manager shows no orphans after cancel/timeout on Windows |
| 5. Token relocated/on-disk + `0o600` no-op | P5 (env-only decided in P1) | `grep CAIDO_TOKEN %TEMP%`/CLI config empty post-session; ACL set or trade-off documented |
| 5b. Spaces/parens in paths | P1 (argv) + P3 (config) | Test under `C:\Users\First Last` + `Program Files (x86)` node |
| 6. CRLF (where/JSON/git) | P2 (where) + P6 (CI) | `.gitattributes` present; `where` parse test; Windows snapshots stable |
| 7. MAX_PATH 260 | P1 (naming scheme) | Test with long username/redirected `%TEMP%`; no `ENAMETOOLONG` |
| 8. QuickJS runtime gaps | P1 (probe + fail-loud) | Diagnostics in support bundle from a real Windows Caido reporter |
| 9. CI windows-latest gotchas | **P6** (do early) | Required Windows job green for the *right* reasons; integration spawn tests run |

## Sources

- Node.js — April 10 2024 Security Releases (CVE-2024-27980; `EINVAL` for `.bat`/`.cmd` without `shell`): https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2 — HIGH
- CVE-2024-27980 detail (command injection via args; patched ≥18.20.2 / ≥20.12.2 / ≥21.7.3): https://nvd.nist.gov/vuln/detail/CVE-2024-27980 , https://www.herodevs.com/vulnerability-directory/cve-2024-27980 — HIGH
- oss-sec disclosure (BatBadBut incomplete-fix relationship): https://seclists.org/oss-sec/2024/q2/79 — HIGH
- GitHub Copilot CLI #3576 — Windows stdio MCP `spawn npx ENOENT` / `spawn npx.cmd EINVAL`, `cmd /c` + cross-spawn workarounds (direct mirror of Drift's situation): https://github.com/github/copilot-cli/issues/3576 — HIGH
- nexe #1091 / node-red #4653 / GitbookIO #606 — real-world `spawn EINVAL` after 20.12.2/21.7.3 on Windows: https://github.com/nexe/nexe/issues/1091 — HIGH
- Node.js child_process docs (signals ignored on Windows; `kill` semantics; `windowsHide`, `windowsVerbatimArguments`, `detached`): https://nodejs.org/api/child_process.html — HIGH
- "Killing process families with node" (Windows needs `taskkill /T /F`; POSIX `process.kill(-pid)` with `detached`): https://medium.com/@almenon214/killing-processes-with-node-772ffdd19aad — MEDIUM
- nodejs/node #50753 + microsoft/nodejs-guidelines #108 — `MAX_PATH` 260 / `LongPathsEnabled` / `\\?\` on Windows: https://github.com/nodejs/node/issues/50753 — HIGH
- Microsoft Learn — Defender real-time protection synchronous file access / exclusions (write-then-access lock mechanism): https://learn.microsoft.com/en-us/defender-endpoint/troubleshoot-mdav-scan-issues — MEDIUM (mechanism documented; exact Node errno corroborated by community reports, not a single authoritative doc)
- GitHub Changelog — default `run` shell on Windows runners is PowerShell/`pwsh`: https://github.blog/changelog/2019-10-17-github-actions-default-shell-on-windows-runners-is-changing-to-powershell/ — HIGH
- actions/checkout #135 & #226, GitHub Docs "Configuring Git to handle line endings" — `core.autocrlf` breaking tests on Windows CI: https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings — HIGH
- cross-spawn (wraps `.cmd`/`.bat` via `cmd /c` with escaping; the de-facto cross-platform spawn): https://www.npmjs.com/package/cross-spawn — MEDIUM (verify it runs under Caido QuickJS before depending on it)
- Drift source (grounding): `packages/backend/src/index.ts` (spawn `2188`, self-test `1191`-`1264`, kills `1207`/`1801`/`2400`-`2409`/`2649`-`2678`, token in JSON `2003`-`2014` + redaction `351`-`352`, Claude config `1956`, `spawnAndWait` `1519`-`1528`), `packages/backend/src/command-resolution.ts` (`extractHomeDir` `47`-`63`, candidates `105`-`119`); `.planning/codebase/CONCERNS.md`, `ARCHITECTURE.md`, `TESTING.md`, `PROJECT.md` — HIGH

---
*Pitfalls research for: native Windows port of a Node-spawning, token-bearing, MCP-server-hosting Caido plugin*
*Researched: 2026-06-26*
