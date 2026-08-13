# Codebase Concerns

**Analysis Date:** 2026-06-26

---

## HEADLINE: MCP Launch Path Is Entirely POSIX-Only — Zero Windows Support

The entire MCP server lifecycle — temp directory creation, wrapper script writing, launch, auth validation, and self-test — uses POSIX-exclusive APIs, hardcoded Unix paths, and shell conventions that do not exist on Windows. The store submission claims "tested on Windows" but there is no code path that could survive on Windows. A real user (@0xMRK0S) already hit "failed to run the mcp server and check the health mcp" — this is the exact symptom of these failures.

Every cross-platform landmine is documented below with file:line references.

### 1. Hardcoded `/tmp` for the MCP temp directory

**`packages/backend/src/index.ts:1716`**
```ts
mcpTempDir = `/tmp/drift-mcp-${genUUID()}`;
await mkdir(mcpTempDir, { recursive: true, mode: 0o700 });
```

Windows has no `/tmp`. The correct cross-platform equivalent is `os.tmpdir()` from Node's `os` module (maps to `%TEMP%` on Windows). Every downstream operation that writes into `mcpTempDir` inherits this breakage.

**`packages/backend/src/index.ts:1681`**
```ts
const entries = await readdir("/tmp");
```

`sweepOrphanedMcpTempDirs` hardcodes `/tmp` a second time. On Windows this fails with `ENOENT`, so orphaned credential-bearing temp dirs are never cleaned up (a credential-exposure risk on Unix too if the process is killed before the sweep).

**`packages/backend/src/index.ts:337`**
```ts
return `/tmp/drift-session-${sessionId}.log`;
```

`getSessionDebugLogPath` hardcodes `/tmp` for debug session logs. Log files are never written on Windows because the path does not exist.

### 2. `#!/bin/bash` wrapper scripts — `renderExportExecScript` and `writeLaunchScript`

**`packages/backend/src/index.ts:329`**
```ts
function renderExportExecScript(...): string {
  return [
    "#!/bin/bash",
    ...Object.entries(envVars).map(([key, value]) => `export ${key}=${shellQuote(value)}`),
    `exec ${shellQuote(command)} ...`,
  ].join("\n");
}
```

The generated wrapper content is a bash script. Every path that writes a launch script calls this function:

- **`index.ts:308`** `writeLaunchScript` writes `provider-launch-${sessionId}.sh` (provider launch for every send)
- **`index.ts:755`** `writeMcpWrapper` writes `mcp-wrapper.sh` / `mcp-wrapper-${sessionId}.sh` (Claude's per-session MCP wrapper)
- **`index.ts:1178`** `callMcpMethod` writes `mcp-self-test-${requestId}.sh` (self-test launcher)

These `.sh` files have no meaning on Windows. The shell is bash/sh; Windows has neither by default.

### 3. `chmod +x` — does not exist on Windows

**`packages/backend/src/index.ts:311`**
```ts
const chmodResult = await spawnAndWait("chmod", ["+x", tempScriptPath]);
if (chmodResult.code !== 0) {
  await rm(tempScriptPath, { force: true });
  return undefined;
}
```

**`packages/backend/src/index.ts:771`**
```ts
const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);
if (chmodResult.code !== 0) {
  await rm(tempWrapperPath, { force: true });
  return undefined;
}
```

`chmod` does not exist on Windows. The `spawn("chmod", ...)` call triggers a `proc.on("error")` event, which resolves with `code: 1`. Both `writeLaunchScript` and `writeMcpWrapper` return `undefined` on chmod failure, which then causes the callers to return error messages like "Failed to create MCP wrapper script." and "Drift could not prepare the provider launcher…" — exactly what the user reported.

This is the single most immediate cause of the reported Windows failures.

### 4. Spawning `.sh` wrapper directly in `validateCaidoAuth` and `callMcpMethod`

**`packages/backend/src/index.ts:781`**
```ts
async function validateCaidoAuth(wrapperPath: string): Promise<CaidoValidationResult> {
  const result = await spawnAndWait(wrapperPath, ["--validate-auth"]);
```

**`packages/backend/src/index.ts:1191`**
```ts
const proc = spawn(launchPath, [], {
  stdio: ["pipe", "pipe", "pipe"],
});
```

Both functions spawn the `.sh` wrapper as an executable directly. Windows cannot execute a `.sh` file — there is no `#!` interpreter dispatch. Even if `chmod` were fixed, this step would still fail.

### 5. `resolveCommand` uses `which` — no Windows equivalent

**`packages/backend/src/index.ts:853`**
```ts
const child = spawn("which", [command]);
```

`which` does not exist on Windows. The Windows equivalent is `where`. The call silently fails (the `proc.on("error")` handler resolves to `undefined`) so command resolution falls through to static path candidates — which are also all Unix paths (see #6).

### 6. All static command candidate paths are Unix-only

**`packages/backend/src/command-resolution.ts:113–115`**
```ts
pushUniqueCandidate(candidates, path.join("/opt/homebrew/bin", input.command));
pushUniqueCandidate(candidates, path.join("/usr/local/bin", input.command));
pushUniqueCandidate(candidates, path.join("/usr/bin", input.command));
pushUniqueCandidate(candidates, path.join("/bin", input.command));
```

**`packages/backend/src/command-resolution.ts:149–151`** (`getNodeExecutableCandidates`) repeats the same pattern.

No Windows candidate paths are included. On Windows, CLIs like Claude Code install to `%APPDATA%\npm\claude.cmd`, `%LOCALAPPDATA%\Programs\...`, or similar. No `.exe` / `.cmd` suffixes are tried. Even if the user has `claude` in their PATH, `resolveCommand` produces no matching candidates because the executable file on Windows is `claude.cmd`, not `claude`.

### 7. `extractHomeDir` only matches `/Users/` and `/home/`

**`packages/backend/src/command-resolution.ts:52–62`**
```ts
if (resolved.startsWith("/Users/")) { ... }
if (resolved.startsWith("/home/")) { ... }
return undefined;
```

On Windows, user home paths are `C:\Users\<name>`. This function returns `undefined` for any Windows path, so all home-relative candidate paths (`.volta`, `.nvm`, `.asdf`, `.bun`, `.npm-global`, etc.) are never probed.

### 8. `getKnownHomeDirs` only reads `process.env.HOME`

**`packages/backend/src/index.ts:895–896`**
```ts
processRef.process?.env?.HOME,
```

On Windows, the home directory is `process.env.USERPROFILE` (or `HOMEDRIVE` + `HOMEPATH`). `HOME` is not set by default on Windows. `getKnownHomeDirs` returns an empty array on Windows, so every version-manager candidate path fails.

### 9. Provider install hints reference Unix install scripts

**`packages/backend/src/command-resolution.ts:9`**
```ts
"Install Claude Code with `curl -fsSL https://claude.ai/install.sh | bash`..."
```

The install hint shown to Windows users in the Settings UI references a bash/curl install command that does not work on Windows. Users receive actionless error messages.

### 10. `registerMcpWithCli` passes the `.sh` wrapper path to external CLIs

**`packages/backend/src/index.ts:1588–1590`**
```ts
const result = await spawnAndWait(cliBinary, [
  "mcp", "add", "drift", "--", mcpScript,
]);
```

`mcpScript` is the path to the `.sh` wrapper. When Gemini CLI or Codex CLI later attempt to invoke that MCP server entry, they try to execute the `.sh` file — which fails on Windows for the same reasons as above.

### 11. SIGTERM / SIGKILL — Windows ignores signal arguments

**`packages/backend/src/index.ts:2404–2408`** (process cancellation), and also at lines `859`, `1207`, `1263`, `2649`, `2678`.

```ts
proc.kill("SIGTERM");
// ...
proc.kill("SIGKILL");
```

On Windows, `ChildProcess.kill()` accepts no signal argument — the argument is silently ignored. SIGKILL does nothing; `SIGTERM` does nothing. Spawned provider processes that hang cannot be cancelled or forcibly terminated on Windows.

### 12. Hardcoded `.sh` extension in wrapper path helpers

**`packages/backend/src/index.ts:487`**
```ts
return path.join(mcpTempDir, "mcp-wrapper.sh");
```

**`packages/backend/src/index.ts:755`**
```ts
const wrapperPath = path.join(mcpTempDir, options?.name ?? "mcp-wrapper.sh");
```

**`packages/backend/src/index.ts:1946`** `mcp-wrapper-${input.sessionId}.sh`
**`packages/backend/src/index.ts:2097`** `provider-launch-${input.sessionId}.sh`
**`packages/backend/src/index.ts:1178`** `mcp-self-test-${requestId}.sh`

All wrapper/launch script filenames use `.sh`. On Windows, these would need to be `.cmd` or `.ps1` files (or the approach needs to change entirely to spawning `node` directly without a wrapper script).

### Fix Approach for the Entire Windows Block

The root architectural problem is using bash scripts as the env-var injection layer between the backend and the MCP subprocess. The cross-platform fix is to replace bash wrapper scripts with direct `node` spawning with `env:` options:

```ts
// Instead of writing a .sh wrapper and executing it:
const proc = spawn(nodeExecutable, [mcpScriptPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, ...runtimeEnv },
});
```

This eliminates the need for `chmod`, bash, `.sh` files, and `which`. The temp dir should use `os.tmpdir()`, home resolution should check `USERPROFILE` alongside `HOME`, and command resolution should add `.cmd`/`.exe` suffixes and Windows-typical install paths.

---

## Tech Debt

### Manual SQLite String Escaping

**Files:** `packages/backend/src/index.ts:188–213`

The Caido SQLite binding (`sdk.meta.db()`) does not expose parameterized queries. Both `loadSetting` and `saveSetting` use a hand-rolled `escapeSqliteLiteral` that replaces `'` with `''`:

```ts
function escapeSqliteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
// Used as:
await db.execute(`INSERT OR REPLACE INTO drift_settings (key, value) VALUES ('${escapeSqliteLiteral(key)}', '${escapeSqliteLiteral(value)}')`);
```

The comment correctly notes that both the `key` (`"settings"` or `"chats"`) and `value` (serialized JSON) are controlled at the call site and never attacker-reachable. However, the pattern is fragile: any future call that passes an attacker-influenced string would be silently injectable. The fix requires either Caido exposing parameterized queries or restricting this pattern architecturally so that it can never receive external input.

### `genUUID` Uses `Math.random`, Not Crypto

**Files:** `packages/backend/src/index.ts:828–844`

```ts
/** Generate UUID v4 without crypto module */
function genUUID(): string {
  // ...
  uuid += hex[(Math.random() * 4 | 8)]; // variant
  uuid += hex[(Math.random() * 16 | 0)];
```

`Math.random()` is not cryptographically secure. The UUID is used as the suffix for `mcpTempDir` (line 1716), which is the directory that holds the Caido session token inside bash wrappers. A predictable UUID means a local attacker who can guess the temp directory name could potentially read the token before the permission `0o700` mode blocks it. Caido's QuickJS runtime avoids `require("crypto")` (Zod already crashed it per the comment at line 68), but `globalThis.crypto.randomUUID()` or `globalThis.crypto.getRandomValues()` are standard Web APIs available in modern QuickJS environments and should be attempted as a safer alternative.

### Session ID Uses `Date.now()` — No Randomness

**Files:** `packages/backend/src/index.ts:1829`

```ts
const sessionId = `drift-${Date.now()}`;
```

Session IDs are millisecond timestamps with no random component. Two `createCliSession` calls that arrive within the same millisecond (e.g., two browser tabs racing on mount) produce the same session ID. `sessionSnapshots`, `activeProcesses`, and `sessionWatchdogs` all use this ID as a key, so one session would silently overwrite the other's state.

---

## Known Bugs

### `activeSelfTestPoll` — Brittle Single-Slot Polling Workaround

**Files:** `packages/backend/src/index.ts:113–115`, `1190`, `1218–1252`

```ts
// Pump handler for an in-flight MCP self-test call. Only one self-test
// can run at a time, so a single slot is enough.
let activeSelfTestPoll: (() => void) | undefined;
```

`callMcpMethod` stores a poll handler in this module-level variable so that `getMcpStatus` (called by the frontend keep-alive ping every ~1.5 seconds) can manually check whether a child process has exited — because Caido's QuickJS runtime does not reliably deliver `child_process` data/close events while an outer RPC `await` is pending.

This workaround is fragile in several ways:
- If the user closes the settings panel and stops pinging `getMcpStatus`, the self-test hangs until its 10-second timeout.
- The slot is module-level, so a second concurrent self-test call would overwrite `activeSelfTestPoll` and the first test would never finalize.
- There is no test that exercises the `activeSelfTestPoll` path; if Caido's runtime behavior changes, this will silently break.

The same pattern is replicated for the main session watchdog via `sessionWatchdogs` (line 2278) and `getCliSessionState` (line 2712), which has identical fragility.

### `writeTemp` / `writeLaunchScript` Atomic Write Leaves `.tmp` Residue on Crash

**Files:** `packages/backend/src/index.ts:299–317`

```ts
const tempScriptPath = `${scriptPath}.tmp`;
await writeFile(tempScriptPath, content, { mode: 0o700 });
const chmodResult = await spawnAndWait("chmod", ["+x", tempScriptPath]);
if (chmodResult.code !== 0) {
  await rm(tempScriptPath, { force: true });
  return undefined;
}
await rename(tempScriptPath, scriptPath);
```

If the process is killed between `writeFile` and `rename`, the `.tmp` file is left in the temp directory with the Caido token inside. `sweepOrphanedMcpTempDirs` removes entire `drift-mcp-*` directories but does not explicitly clean up `.tmp` residue left inside a directory that is still "current" from a prior session.

---

## Security Considerations

### Caido Session Token Written to Bash Scripts in `/tmp`

**Files:** `packages/backend/src/index.ts:329–332`, `755–777`

The Caido session token is embedded as a shell variable in the `#!/bin/bash` wrapper scripts written into `/tmp/drift-mcp-<uuid>/`. Although the directory is created with `mode: 0o700` and files with `0o600`/`0o700`, the token is plaintext inside files on disk for the lifetime of the MCP server session (i.e., until the user explicitly stops the MCP server or Caido exits). On systems with multiple local users or backup agents, this is an information-exposure risk.

Additionally, as noted above, `genUUID()` uses `Math.random`, making the temp directory name guessable in principle. A race between directory creation and first use could be exploited by a local attacker.

**Current mitigation:** `0o700` parent directory, `0o600` file permissions, `sweepOrphanedMcpTempDirs` on startup.

**Recommendations:** Use `crypto.randomUUID()` for the temp directory name; consider in-memory environment variable injection instead of writing tokens to disk (see Fix Approach above).

### Shell Injection Surface in `renderExportExecScript`

**Files:** `packages/backend/src/index.ts:320–333`, `398–400`

```ts
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}
```

`shellQuote` uses POSIX single-quote escaping. This is correct for bash but does not handle null bytes (`\0`) embedded in values. It also does not quote the environment variable *key names* (`export ${key}=...`), relying on the fact that keys are all controlled constants (`CAIDO_TOKEN`, `CAIDO_URL`, `DRIFT_*`). This assumption is load-bearing — any future path that passes a dynamic key would introduce injection.

### `escapeSqliteLiteral` Key Argument Is Not Validated

**Files:** `packages/backend/src/index.ts:188–212`

The key argument is always `"settings"` or `"chats"` (both hardcoded string literals). The pattern is safe today but has no enforcement mechanism at the type level (the function accepts `string`). Any future use with a dynamic key string would be injectable.

---

## Performance Bottlenecks

### Full Chat Array Serialized and Written on Every Message

**Files:** `packages/backend/src/index.ts:1788`, `1812`

```ts
const persistenceError = await saveJson("chats", currentChats);
```

`saveJson` serializes the entire `currentChats` array (all chats, all messages) to JSON and writes it to both SQLite and a `.json` file on every `saveChat` and `deleteChat` call. As the chat history grows, this becomes an O(n) write on every message. There is no incremental or per-chat persistence — one large chat with long assistant responses (each potentially several kilobytes) causes full-array serialization on every turn.

### `sendCliMessage` Reads Entire Activity Log File on Every 250ms Tick

**Files:** `packages/backend/src/index.ts:2154–2185`, `2261–2264`

```ts
const activityInterval = setInterval(() => {
  if (runtimeFiles !== undefined) void flushActivities();
  heartbeat();
}, 250);
```

`flushActivities` reads the entire JSONL activity file from disk every 250ms while a session is running. For long-running tool-heavy sessions with many activities, this reads a growing file repeatedly instead of tailing from an offset.

---

## Fragile Areas

### `index.ts` Has Zero Direct Test Coverage

**Files:** `packages/backend/src/index.ts` (3004 lines)

None of the test files directly import or test functions from `index.ts`. All tests cover isolated helper modules:
- `mcp-runtime.test.ts` — `buildSelfTestResult`, `parseMcpRuntimeContext`
- `provider-launch.test.ts` — `buildClaudeLaunchArgs`, `buildGeminiLaunchArgs`, etc.
- `command-resolution.test.ts` — `extractHomeDir`, `getCommandExecutableCandidates`
- `claude-print.test.ts` — `consumeClaudePrintChunk`

Functions like `startMcpServer`, `writeMcpWrapper`, `validateCaidoAuth`, `callMcpMethod`, `sendCliMessage`, `createCliSession`, `writeLaunchScript`, and `sweepOrphanedMcpTempDirs` are completely untested. Any regression in these paths is silent until a user reports it.

**Risk:** High. This is where the Windows bug lives, where the token is handled, and where all process lifecycle logic runs.

### Module-Level Mutable Singletons — No Isolation Between Tests or Invocations

**Files:** `packages/backend/src/index.ts:92–132`

```ts
let mcpTempDir: string | undefined;
let mcpAuthState: McpAuthState = "unknown";
let sessionCaidoToken = "";
const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>();
const sessionSnapshots = new Map<string, CliSessionStateEvent>();
let activeSelfTestPoll: (() => void) | undefined;
```

All state is in module-level `let` / `const Map` variables. There is no reset mechanism. Because `index.ts` cannot be tested in isolation (Caido's `SDK` type is not mockable from outside the plugin framework), accumulated state from one test run can leak into another, and any failure in `init()` leaves stale state for subsequent RPC calls.

### `spawnAndWait` Does Not Have a Timeout

**Files:** `packages/backend/src/index.ts:1519–1528`

```ts
function spawnAndWait(cmd: string, args: string[]): Promise<...> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    // ...
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}
```

`spawnAndWait` has no timeout. It is used for `chmod +x`, `gemini mcp add`, `codex mcp remove`, and `node --version`. A hung subprocess (e.g., `gemini mcp add drift` waiting for network or user input) would block the entire MCP startup sequence indefinitely.

### `Caido Runtime Event Loop` Workarounds Are Load-Bearing

**Files:** `packages/backend/src/index.ts:2261–2278`, `2702–2721`

The `heartbeat` function, `sessionWatchdogs` map, and `getCliSessionState` RPC side-effect are all workarounds for Caido's QuickJS runtime not running `setInterval` callbacks while an RPC handler is awaiting. These comments are scattered through the code:

```ts
// Caido's plugin runtime does not run pending setInterval callbacks
// during RPC handling, so without this the heartbeat/flushActivities
// only run while the child process is actively producing stdout.
```

If Caido changes its runtime scheduling behavior (upgrade, regression, or different plugin host version), the entire session watchdog mechanism could stop working silently. There is no test that validates the watchdog fires under the RPC-blocking condition.

---

## Test Coverage Gaps

### `startMcpServer` / `stopMcpServer` — Untested

- What's not tested: full MCP lifecycle (temp dir creation, wrapper writing, auth validation, cleanup)
- Files: `packages/backend/src/index.ts:1694–1766`
- Risk: regressions to the Windows-breaking path ship silently; auth validation changes are undetected
- Priority: High

### `sendCliMessage` Provider Branching — Untested

- What's not tested: per-provider args construction, MCP wrapper injection, launch script writing, process lifecycle
- Files: `packages/backend/src/index.ts:1847–2642`
- Risk: provider-specific regressions (e.g., Copilot MCP config injection) are invisible
- Priority: High

### `callMcpMethod` Self-Test Polling — Untested

- What's not tested: `activeSelfTestPoll` path; behavior when `close` event is not delivered
- Files: `packages/backend/src/index.ts:1168–1329`
- Risk: the workaround for Caido's event loop silently stops working
- Priority: Medium

### `resolveCommand` / `getKnownHomeDirs` — Partial Coverage

- What's not tested: the `which` fallback; `getKnownHomeDirs` integration
- Files: `packages/backend/src/index.ts:848–900`
- Risk: PATH resolution regressions; no test exercises Windows failure path
- Priority: Medium

---

*Concerns audit: 2026-06-26*
