# Phase 4: Platform Foundation - Pattern Map

**Mapped:** 2026-08-14
**Files analyzed:** 15 (12 new, 3 modified)
**Analogs found:** 15 / 15 files — 2 *sub-patterns* have no in-repo precedent (see § No Analog Found)

> **Read this before planning.** Every new module in this phase is the **sixth through eleventh instance
> of a pattern the repo already runs five times**: a pure helper module with a sibling `.test.ts`, with
> all I/O left behind in `index.ts`. Nothing here is a new architecture. The excerpts below are the exact
> code the new files should read like.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/backend/src/platform.ts` | utility (pure OS-decision helpers) | transform | `packages/backend/src/command-resolution.ts` | **exact** — D-01 copies its `({ ...input })` signature verbatim |
| `packages/backend/src/platform.test.ts` | test (unit) | — | `packages/backend/src/provider-launch.test.ts` | **exact** — exact-equality assertions on pure array/string output |
| `packages/backend/src/fs-retry.ts` | utility (policy decision + injected-dep orchestrator) | file-I/O adjacent | `packages/backend/src/command-resolution.ts` (`pathExists`) | role-match (decision half); **no analog** for `withFsRetry` |
| `packages/backend/src/fs-retry.test.ts` | test (unit) | — | `packages/backend/src/persistence.test.ts` | role-match — `vi.fn()` injected fakes |
| `packages/backend/src/activity-tail.ts` | utility (stateful stream reducer) | streaming | `packages/backend/src/claude-print.ts` | **exact** — same `createXState()` + `consumeXChunk(state, chunk)` shape |
| `packages/backend/src/activity-tail.test.ts` | test (unit + 2 integration) | — | `claude-print.test.ts` (state threading) + `command-resolution.test.ts` (`mkdtemp`/`afterEach`) | **exact** (composite) |
| `packages/backend/src/bounded-buffer.ts` | utility (truncation) | transform | `index.ts:340–347` `summarizeDebugChunk` | role-match — the repo's only existing truncate-with-marker helper |
| `packages/backend/src/bounded-buffer.test.ts` | test (unit) | — | `packages/backend/src/mcp-runtime.test.ts` | **exact** |
| `packages/backend/src/resolution-cache.ts` | store (TTL cache, injected clock) | CRUD | `index.ts:119`+`:1558–1562` (`lastNodeExecutable` — the cache being *replaced*) | role-match; **no analog** for a closure factory |
| `packages/backend/src/resolution-cache.test.ts` | test (unit) | — | `packages/backend/src/persistence.test.ts` | role-match |
| `packages/backend/src/runtime-probe.ts` | utility (report/message formatter + `normalizePathForCompare`) | transform | `packages/backend/src/mcp-runtime.ts` (`buildSelfTestResult`, `buildMcpServerInfo`) | **exact** — same `build*(input: {…}): Shape` formatter convention |
| `packages/backend/src/runtime-probe.test.ts` | test (unit) | — | `packages/backend/src/mcp-runtime.test.ts` | **exact** |
| `packages/backend/src/index.ts` **(MODIFIED)** | entry module / RPC shell | request-response + file-I/O + process-spawn | itself (`startMcpServer`, `getDiagnostics`) | in-file self-analog |
| `packages/backend/src/claude-print.ts` **(MODIFIED)** | stateful stream parser | streaming | itself (`consumeClaudePrintChunk`) | in-file self-analog |
| `packages/backend/src/claude-print.test.ts` **(EXTENDED)** | test (unit) | — | itself — 393 existing lines, **must stay green byte-for-byte** | in-file self-analog |

**Not modified in Phase 4:** `packages/backend/src/command-resolution.ts` (Phase 6 fills its Windows arrays — D-03),
`renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / `chmod` call sites (Phase 5 scope fence).

**Analog recency check** (prefer current patterns over legacy): `command-resolution.ts`, `provider-launch.ts`,
`claude-print.ts` were all last touched `2026-04-20 7b6de78`; `mcp-runtime.ts` and `persistence.ts` at `2026-04-13 c2e09ef`;
`index.ts` at `2026-08-12 ae249dc`. All five pure modules are current, none legacy.

---

## Pattern Assignments

### `packages/backend/src/platform.ts` (utility, transform)

**Analog:** `packages/backend/src/command-resolution.ts` — D-01 states this module's `({ ...input })`
signature is the convention to copy, "so the two modules Phases 5–8 both import read the same way."

**Imports pattern** (`command-resolution.ts:1–2`) — note: *no* barrel, *no* path alias, bare Node built-ins,
`import path from "path"` (default import, not `node:path`):

```typescript
import { readdir, stat } from "fs/promises";
import path from "path";
```

`platform.ts` is I/O-free per SC-1 → it should import **only** `path`. Do **not** import `os` here (D-02: `os` is
read in exactly one place, and that place is `index.ts`).

**Object-param signature pattern** (`command-resolution.ts:105–118`) — this is the exact shape D-01 mandates:

```typescript
export async function getCommandExecutableCandidates(input: {
  command: string;
  pathResolution?: string;
  homeDirs: string[];
}): Promise<string[]> {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, input.pathResolution);

  pushUniqueCandidate(candidates, path.join("/opt/homebrew/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/usr/local/bin", input.command));
  ...
  for (const homeDir of [...new Set(input.homeDirs)]) {
```

Copy: `input.x` accessed through the param object (never destructured in the signature), `path.join` for every
constructed path (never template concatenation — Pitfall 1), `[...new Set(...)]` for de-duplication.

**Guarded-normalisation pattern** (`command-resolution.ts:41–63`) — the model for `getTempRoot`'s
trailing-separator strip and for `normalizePlatform`'s allow-list gate:

```typescript
export function pushUniqueCandidate(candidates: string[], candidate: string | undefined): void {
  const normalized = candidate?.trim();
  if (normalized === undefined || normalized === "") return;
  if (!candidates.includes(normalized)) candidates.push(normalized);
}

export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  const normalized = candidatePath?.trim();
  if (normalized === undefined || normalized === "") return undefined;
  const resolved = path.normalize(normalized);

  if (resolved.startsWith("/Users/")) {
    const parts = resolved.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
  }
  ...
  return undefined;   // ← explicit "unrecognised" arm, no POSIX fall-through
}
```

Note `extractHomeDir` **returns `undefined` for anything it does not recognise** rather than guessing.
That is precisely the posture Pitfall 2 / D-06 wants from `normalizePlatform`.

**Where `buildSpawnEnv` (SC-9) lives:** `platform.ts`. `04-VALIDATION.md:99` pins its test to
`packages/backend/src/platform.test.ts -t "buildSpawnEnv"`. Its analog for shape is
`index.ts:577–604` `buildMcpRuntimeEnv` — same `input: {…}` → `Record<string, string>` contract:

```typescript
function buildMcpRuntimeEnv(input: {
  caidoToken: string;
  toolPolicy?: McpToolPolicy;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Record<string, string> {
  const toolPolicy = input.toolPolicy ?? getCurrentMcpToolPolicy();
  return {
    CAIDO_URL: currentSettings.caidoApi.url,
    CAIDO_TOKEN: input.caidoToken,
    ...(getMcpContextFilePath() !== undefined
      ? { DRIFT_CONTEXT_FILE: getMcpContextFilePath()! }
      : {}),
    DRIFT_ALLOWLIST_ACTIVE: "1",
    ...
  };
}
```

⚠️ `buildMcpRuntimeEnv` reads module state (`currentSettings`, `getMcpContextFilePath()`) — **`buildSpawnEnv`
must not**. Take `parentEnv` as an input so the SC-9 assertion (`APPDATA`/`LOCALAPPDATA` survive) is a pure unit test.

⚠️ **Current fact the planner needs:** `grep -n "spawn(" packages/backend/src/index.ts` returns
`:853`, `:1191`, `:1521`, `:2188` — and **none of them passes an `env` option today** (env reaches the child
through the bash `export` wrapper). So SC-9's "every spawn site supplying `env`" is currently a **forward-looking
guarantee for Phase 5**, and the static half of the SC-9 check (`04-VALIDATION.md:100`) will be counting zero
call sites in Phase 4. Ship `buildSpawnEnv` + its unit test; do not invent an `env:` option to satisfy the grep.

---

### `packages/backend/src/platform.test.ts` (test, unit)

**Analog:** `packages/backend/src/provider-launch.test.ts` — pure-function exact-equality assertions.

**Test structure pattern** (`provider-launch.test.ts:1–11`, `:28–50`):

```typescript
import { describe, expect, it } from "vitest";
import {
  CLAUDE_DISALLOWED_TOOLS,
  buildClaudeLaunchArgs,
  ...
} from "./provider-launch";

const DEFAULT_TOOLS = ["search_history", "get_current_context"] as const;

describe("buildClaudeLaunchArgs", () => {
  it("produces the base Claude flags without --resume or --mcp-config when MCP is absent", () => {
    const args = buildClaudeLaunchArgs({ ... });
    expect(args).toEqual([
      "-p",
      "--verbose",
      ...
    ]);
    expect(args).not.toContain("--resume");
  });
});
```

Copy: one top-level `describe` **per exported function** (`describe("buildClaudeLaunchArgs")`,
`describe("buildGeminiLaunchArgs")`, …). This matters operationally — `04-VALIDATION.md` addresses every
Phase 4 test by `-t "<name>"` (`-t "getTempRoot"`, `-t "getSweepRoots"`, `-t "normalizePlatform"`,
`-t "buildSpawnEnv"`), so **the `describe`/`it` titles are a contract with the validation map**, not free text.

Copy also: `toEqual([...])` full-array equality over `toContain` spot checks wherever the output is finite.

---

### `packages/backend/src/fs-retry.ts` (utility, file-I/O adjacent)

**Analog (decision half):** `packages/backend/src/command-resolution.ts:32–39` — the repo's swallow-and-classify idiom:

```typescript
async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}
```

**Analog (error-message constant):** `index.ts:82–88` — actionable, user-facing, `SCREAMING_SNAKE_CASE`,
module-level, exported so a test can assert against it rather than a string literal:

```typescript
const NODE_EXECUTABLE_ERROR =
  "Drift could not locate a Node.js executable to launch the MCP server. Restart Caido from an environment where Node.js is available.";
const CLAUDE_ASSISTANT_RECOVERY_IDLE_MS = 1500;
const CLAUDE_STREAM_RECOVERY_IDLE_MS = 8000;
```

`FS_RETRY_DELAYS_MS` follows this: module-level, `as const`, **exported** (RESEARCH § *What backoff shape actually
works*: "which is why it is an exported constant, not an inline literal" — and `04-VALIDATION.md:75` asserts on
its shape directly).

**The site the ladder wraps** (`index.ts:262–270`) — `writeTemp` already does the `mkdir(0o700)` + `writeFile(0o600)`
pair D-07 names. Note the comment style: *why*, not *what*:

```typescript
async function writeTemp(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const fp = path.join(dir, name);
  // 0o600: these temp files can carry the Caido token (e.g. the Copilot MCP
  // config embeds it). The 0o700 parent dir already blocks other users, but
  // restrict the file too as defense-in-depth.
  await writeFile(fp, content, { mode: 0o600 });
  return fp;
}
```

**And the raw pair inside `startMcpServer`** (`index.ts:1716–1720`) — D-07's exact probe/retry site:

```typescript
  mcpTempDir = `/tmp/drift-mcp-${genUUID()}`;
  await mkdir(mcpTempDir, { recursive: true, mode: 0o700 });

  const mcpScriptLocal = path.join(mcpTempDir, "mcp-server.mjs");
  await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"));
```

Both `mode:` options stay unconditional — RESEARCH § *Anti-Patterns*: adding a `platform !== "win32"` guard
"doubles the branch count for zero behaviour change and risks a POSIX regression."

**Error handling / logging pattern to copy for retry logging** (`index.ts:1689–1691`, `:1660–1667`) — `sdk.console.error`,
`[drift]` prefix, `String(error)`:

```typescript
  } catch (error) {
    sdk.console.error(`[drift] Failed to sweep orphaned MCP temp dirs: ${String(error)}`);
  }
```

---

### `packages/backend/src/fs-retry.test.ts` (test, unit)

**Analog:** `packages/backend/src/persistence.test.ts` (the whole 21-line file) — the repo's only
injected-fake unit test, and the shape for `withFsRetry(op, { delays, sleep })`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { getPersistenceDbHandle } from "./persistence";

describe("persistence helpers", () => {
  it("rejects unsupported db handles", () => {
    expect(getPersistenceDbHandle(undefined)).toBeUndefined();
    expect(getPersistenceDbHandle({})).toBeUndefined();
    expect(getPersistenceDbHandle({ execute: vi.fn() })).toBeUndefined();
  });

  it("accepts db handles with execute and query methods", () => {
    const handle = {
      execute: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
    };
    expect(getPersistenceDbHandle(handle)).toBe(handle);
  });
});
```

Copy: `vi.fn(async () => …)` for injected async deps; assert call counts on the fake (`expect(op).toHaveBeenCalledTimes(1)`
for `-t "does not retry"`, `expect(sleep.mock.calls.flat()).toEqual([...FS_RETRY_DELAYS_MS])` for `-t "sleeping the exact ladder"`).
**Do not** use `vi.useFakeTimers()` here — injection is the pattern (`04-RESEARCH.md` § *Pattern 3*), and the repo
reserves fake timers for the frontend store tests (`packages/frontend/src/stores/settings.test.ts:186`).

---

### `packages/backend/src/activity-tail.ts` (utility, streaming)

**Analog:** `packages/backend/src/claude-print.ts` — RESEARCH § *Pattern 2* calls it out by name:
"Mirrors `claude-print.ts` exactly — the repo's proven pattern for a stateful stream parser."

**State + factory pattern** (`claude-print.ts:89–117`) — exported `type`, exported `createXState()`,
every field initialised explicitly (no `Partial`, no optionals except genuine ones):

```typescript
export type ClaudePrintState = {
  buffer: string;
  sessionId: string;
  streamedText: string;
  ...
  usage: ClaudeUsage | undefined;
};

export function createClaudePrintState(): ClaudePrintState {
  return {
    buffer: "",
    sessionId: "",
    ...
    usage: undefined,
  };
}
```

→ `createActivityCursor(): ActivityCursor` with `{ offset: 0, partial: <empty Buffer> }`.
⚠️ Pitfall 4: `partial` must be a `Buffer`, not a `string` — `claude-print.ts`'s `buffer: string` is the
*one* field of this analog you must **not** copy.

**Reducer signature pattern** (`claude-print.ts:140–151`) — `(state, chunk, handlers?) => state`, spread-to-new-state,
never mutate:

```typescript
export function consumeClaudePrintChunk(
  state: ClaudePrintState,
  chunk: string,
  handlers?: {
    onText?: (delta: string) => void;
    onSessionId?: (sessionId: string) => void;
  },
): ClaudePrintState {
  let nextState: ClaudePrintState = {
    ...state,
    buffer: state.buffer + chunk,
  };
```

**Line-splitting + tolerant-parse pattern** (`claude-print.ts:153–169`) — and note this is *also* the
O(k·n) hazard PERF-04 site B fixes, so `activity-tail.ts` should be written **split-once from the start**:

```typescript
  let newlineIndex = nextState.buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = nextState.buffer.slice(0, newlineIndex).trim();
    nextState = { ...nextState, buffer: nextState.buffer.slice(newlineIndex + 1) };
    newlineIndex = nextState.buffer.indexOf("\n");

    if (line === "") continue;

    let parsed: ClaudeStreamEvent;
    try {
      parsed = JSON.parse(line) as ClaudeStreamEvent;
    } catch {
      continue;                    // ← tolerant: a bad line is skipped, never thrown
    }
```

**The exact record format being tailed** — writer and current reader:

```typescript
// packages/backend/assets/mcp-server.mjs:82 — the writer
appendFileSync(DRIFT_ACTIVITY_FILE, `${JSON.stringify(event)}\n`);
```

```typescript
// index.ts:622–634 — the current whole-file parser; consumeActivityChunk replaces its input,
// not its semantics. Keep the trim + skip-empty + swallow-bad-JSON behaviour identical.
function parseRuntimeActivityEvents(raw: string): RuntimeActivityEvent[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as RuntimeActivityEvent];
      } catch {
        return [];
      }
    });
}
```

**The I/O shell it replaces** (`index.ts:2154–2185`) — `readFile` whole-file, guarded by a closure-local
re-entrancy flag declared at `:2151`. RESEARCH § *Don't Hand-Roll* says keep both the flag and the
`seenActivityIds` Set (`:2150`):

```typescript
    const collectedActivities: McpToolActivity[] = [];
    const seenActivityIds = new Set<string>();
    let readingActivities = false;
    ...
    const flushActivities = async () => {
      if (runtimeFiles === undefined || readingActivities) return;
      readingActivities = true;
      try {
        const raw = await readFile(runtimeFiles.activityFilePath, "utf-8");   // ← PERF-02 replaces this line
        const events = parseRuntimeActivityEvents(raw);
        for (const event of events) {
          if (seenActivityIds.has(event.id)) continue;
          seenActivityIds.add(event.id);
          ...
        }
      } catch {
        // Best-effort only.
      } finally {
        readingActivities = false;
      }
    };
```

**The three callers that must share one cursor** (`index.ts:2261–2278`, `:2363`) — all close over the same
`sendCliMessage` scope, so `const cursor = createActivityCursor()` beside `let readingActivities = false` at `:2151`
is per-session by construction:

```typescript
      const activityInterval = setInterval(() => {
        if (runtimeFiles !== undefined) void flushActivities();
        heartbeat();
      }, 250);
      ...
      const runWatchdog = async () => {
        if (settled) return;
        if (runtimeFiles !== undefined) await flushActivities();
        heartbeat();
      };
      sessionWatchdogs.set(input.sessionId, runWatchdog);
```

```typescript
      // index.ts:2361–2364, inside finalize()
        void (async () => {
          appendSessionDebugLog(sessionDebugLogPath, "finalize(): flushActivities start");
          await flushActivities();
```

**Existing `open` import to reuse** (`index.ts:2`) — already aliased, no new import needed:

```typescript
import { readFile, writeFile, open as openFile, stat, mkdir, rm, rename, readdir } from "fs/promises";
```

---

### `packages/backend/src/activity-tail.test.ts` (test, unit + integration)

**Analog A — state threading across chunks** (`claude-print.test.ts:49–52`):

```typescript
    let state = createClaudePrintState();
    for (const chunk of chunks) {
      state = consumeClaudePrintChunk(state, chunk, { onText, onSessionId });
    }
```

That loop is the template for the `-t "partial"` and `-t "utf-8"` cases: feed a record split across two chunks,
assert nothing emits on chunk 1 and the whole record emits on chunk 2.

**Analog B — the `mkdtemp` + `afterEach` integration harness** (`command-resolution.test.ts:1–21`), named by
`04-VALIDATION.md:121–123` as the template for this file's two integration cases:

```typescript
import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ... } from "./command-resolution";

describe("command resolution helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("collects version manager command candidates", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    ...
```

Variant with `splice(0)` at file scope, if the harness needs to sit outside the `describe`
(`mcp-server.transport.test.ts:18–22`):

```typescript
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
```

Note `import os from "os"` is already present in **test** files (`command-resolution.test.ts:2`,
`mcp-server.transport.test.ts:4`) — that is not the "first `os` import" D-02 talks about, which is a
**source**-file import in `index.ts`.

---

### `packages/backend/src/bounded-buffer.ts` (utility, transform)

**Analog:** `index.ts:340–347` `summarizeDebugChunk` — the repo's only existing truncate-with-marker helper,
already head-retention with a default cap constant:

```typescript
function summarizeDebugChunk(text: string, maxChars = DEBUG_CHUNK_PREVIEW_CHARS): string {
  const compact = text
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}
```

Copy: the `if (x.length <= cap) return x;` early return (this is literally `04-VALIDATION.md:94`'s
`-t "below the cap"` behaviour — "returns the input unchanged below the cap"), and the module-level cap constant
(`DEBUG_CHUNK_PREVIEW_CHARS`, `index.ts:88`).

**The four call sites to convert:**

```typescript
// index.ts:1521–1525 — spawnAndWait (site A, caps: stdout 1 MiB head / stderr 256 KiB tail)
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
```

```typescript
// index.ts:2482–2493 — sendCliMessage stdout (site A, cap 2 MiB both-ends)
      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        lastStdoutAt = Date.now();
        appendSessionDebugLog(sessionDebugLogPath, `[stdout] ${summarizeDebugChunk(text)}`);
        appendSessionDebugLog(sessionDebugLogPath, `[stdout-raw] ${text.slice(0, 400)}`);
```

```typescript
// index.ts:2571–2581 — sendCliMessage stderr (site A, cap 256 KiB tail)
      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        appendSessionDebugLog(sessionDebugLogPath, `[stderr] ${summarizeDebugChunk(text)}`);
        appendSessionDebugLog(sessionDebugLogPath, `[stderr-raw] ${text.slice(0, 400)}`);
```

The `let stdout = ""` / `let stderr = ""` declarations for the `sendCliMessage` pair are at `index.ts:2205–2206`.
`text.slice(0, 400)` at `:2492`/`:2580` is the existing ad-hoc bound — leave it, it is a *log preview*, not the accumulator.

---

### `packages/backend/src/resolution-cache.ts` (store, CRUD)

**Analog (what is being replaced):** `index.ts:119–120` + `:1558–1562` — the existing infinite,
never-invalidated cache. Read both before designing the replacement:

```typescript
// index.ts:119–120 — module-level singletons, the repo's norm for backend state
let lastNodeExecutable = "";
let lastNodeSearchCandidates: string[] = [];
```

```typescript
// index.ts:1558–1562 — the read-through with no TTL and no invalidation
async function requireNodeExecutable(): Promise<Result<string>> {
  const nodeExecutable = lastNodeExecutable || await getNodeExecutable();
  if (nodeExecutable === undefined) return err(NODE_EXECUTABLE_ERROR);
  return ok(nodeExecutable);
}
```

**The second consumer, which has no cache at all** (`index.ts:848–888` `resolveCommand`) — the spawn + walk
PERF-03 wraps. Both consumers must go through the one cache:

```typescript
async function resolveCommand(command: string): Promise<string | undefined> {
  if (path.isAbsolute(command)) {
    return await fileExists(command) ? command : undefined;
  }
  const pathResolution = await new Promise<string | undefined>((resolve) => {
    const child = spawn("which", [command]);
    ...
  });

  const candidates = await getCommandExecutableCandidates({
    command,
    pathResolution,
    homeDirs: getKnownHomeDirs(),
  });

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return undefined;
}
```

**The bypass site (`04-VALIDATION.md:93`, `-t "bypass"`)** — `index.ts:1104–1109`. It is a two-line RPC handler;
the bypass flag has to thread through `checkProvider` (`index.ts:902–918`) to reach the cache:

```typescript
async function checkProviderAvailability(
  _sdk: BackendSDK,
  providerId: string
): Promise<Result<ProviderStatus>> {
  return ok(await checkProvider(providerId));
}
```

**Where the cache-age diagnostics land** — `index.ts:2771`+, a flat `Record<string, string>` with
`||`-defaulted `"none"` strings:

```typescript
  const info: Record<string, string> = {
    pluginPath,
    assetsPath,
    ...
    nodeExecutable: nodeExecutable || "not found",
    nodeSearchCandidates: lastNodeSearchCandidates.join(", ") || "none",
```

⚠️ **Shape warning — read § No Analog Found before writing this file.** RESEARCH proposes
`createResolutionCache({ now, ttlMs })` returning closures. **The backend has no closure-factory precedent.**
Its proven shape is `createXState()` returning a plain object + free functions taking that object
(`claude-print.ts:103–117` / `:140`). Either is defensible; the planner should choose deliberately and say why.

---

### `packages/backend/src/runtime-probe.ts` (utility, transform)

**Analog:** `packages/backend/src/mcp-runtime.ts` — the repo's formatter module. Two excerpts.

**`build*(input: {…}): Shape` formatter pattern** (`mcp-runtime.ts:251–276`) — derived fields computed inside,
`trimToString` normalisation, no I/O, no throw:

```typescript
export function buildSelfTestResult(input: {
  providerId: string;
  startedAt: number | null;
  finishedAt: number;
  cliReady: boolean;
  cliMessage: string;
  checks: McpSelfTestCheck[];
  error?: string;
}): McpSelfTestResult {
  const error = trimToString(input.error);
  const passed = error === "" && input.cliReady && input.checks.every((check) => check.ok);
  return {
    providerId: input.providerId,
    state: passed ? "passed" : "failed",
    ...
    durationMs:
      input.startedAt === null
        ? null
        : Math.max(0, input.finishedAt - input.startedAt),
    ...
  };
}
```

→ `buildProbeReport(input: { platform; tmpdir; realpathAvailable; winEnv; … }): ProbeReport` with a
`gating` / `reported` split per D-06, and `formatProbeFailure(report, versionBlock): string`.

**The named-check-list constant pattern** (`mcp-runtime.ts:21–25`) — the model for the probe's capability list,
so the report renders in a fixed order and tests can iterate it:

```typescript
export const MCP_SELF_TEST_CHECKS = [
  { name: "tools/list", label: "Tool discovery" },
  { name: "get_environment", label: "Environment read" },
  { name: "search_history", label: "History search" },
] as const;
```

**Total-failure default pattern** (`mcp-runtime.ts:177–200`) — never throw, always return a well-formed empty
shape. This is exactly D-08's `"unavailable"` semantics:

```typescript
export function parseMcpRuntimeContext(raw: string | undefined): StoredMcpContext {
  if (raw === undefined || raw.trim() === "") {
    return { uiContext: createEmptyCaidoContextSnapshot(), overrideContext: createEmptyCaidoContextOverride() };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { uiContext: createEmptyCaidoContextSnapshot(), overrideContext: createEmptyCaidoContextOverride() };
  }
  ...
```

**D-08's version-block sources — three of the four already exist. Do not rewrite them.**

```typescript
// index.ts:455–476 — detectPluginVersion(): per-candidate try/catch, "unknown" fallback.
// Already called at init (:2957) and its result cached in `pluginVersion` (:129).
// D-08 reads the module variable; it does NOT need a new manifest reader.
async function detectPluginVersion(): Promise<string> {
  const candidates = [
    path.join(pluginPath, "manifest.json"),
    path.join(pluginPath, "..", "manifest.json"),
    path.join(pluginPath, "package.json"),
    path.join(pluginPath, "..", "..", "package.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (typeof parsed.version === "string" && parsed.version.trim() !== "") {
        return parsed.version.trim();
      }
    } catch {
      // Keep trying other candidates.
    }
  }

  return "unknown";
}
```

```typescript
// index.ts:2838–2844 + :2861–2865 — the mandatory `globalThis` guard for `process`.
// NEVER write a bare `process.version`. This is the shape to copy.
  const runtimeProcess = globalThis as typeof globalThis & {
    process?: {
      platform?: string;
      arch?: string;
      version?: string;
    };
  };
  ...
    environment: {
      platform: runtimeProcess.process?.platform ?? "unknown",
      arch: runtimeProcess.process?.arch ?? "unknown",
      nodeVersion: runtimeProcess.process?.version ?? "unknown",
    },
```

Same idiom, narrower, at `index.ts:890–894` (`getKnownHomeDirs`) and `:1531–1534` (`getNodeExecutable`):

```typescript
function getKnownHomeDirs(): string[] {
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return [
    processRef.process?.env?.HOME,
    extractHomeDir(pluginPath),
    ...Object.values(currentSettings.providers).map((provider) => extractHomeDir(provider.command)),
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
}
```

**`normalizePathForCompare` (D-04, SC-10) lives HERE, not in `platform.ts`.** Evidence:
`04-VALIDATION.md:101` routes its test to `runtime-probe.test.ts -t "ladder"` with "inject fake fs functions".
It is impure by design (D-04) and must accept its `fs` rungs as injected params so the ladder is testable.
Its lint exemption is mandated by `04-VALIDATION.md:138–143` — an `eslint-disable` **citing D-04**, never a deletion.

---

### `packages/backend/src/runtime-probe.test.ts` (test, unit)

**Analog:** `packages/backend/src/mcp-runtime.test.ts:1–13`, `:116–164` — one `describe` for the module,
`it` per behaviour, `toMatchObject` for partial shape and `toEqual` for exact round-trips:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildMcpToolPolicy,
  buildMcpServerInfo,
  buildSelfTestResult,
  ...
} from "./mcp-runtime";

describe("mcp-runtime", () => {
  it("merges and detects ui context changes", () => {
    ...
    expect(next).toMatchObject({ projectId: "project-1", filterName: "In scope", ... });
    expect(hasCaidoContextChanged(current, next)).toBe(true);
```

⚠️ For `formatProbeFailure`, prefer explicit `toContain` assertions over `toMatchInlineSnapshot`.
There are **no snapshot files anywhere in this repo** — `provider-launch.test.ts`'s "exact snapshots"
are literal `toEqual([...])` arrays, not vitest snapshots. Introducing `.snap` artifacts would be a new pattern.

---

### `packages/backend/src/index.ts` (MODIFIED — entry module, request-response + file-I/O)

**Analog: itself.** `index.ts` has zero direct test coverage, so every excerpt below is a *contract to preserve*,
not a pattern to extend. Keep new logic in the pure modules.

**Import block** (`index.ts:1–5`, then `:30–66`) — bare specifiers, default `path`, then local modules in a
fixed order. The new `import os from "os"` goes with the built-ins at the top (D-02 forbids a module-scope
`os.platform()` *call*; the `import` itself is fine and unavoidable):

```typescript
import type { DefineAPI, SDK, DefineEvents } from "caido:plugin";
import { readFile, writeFile, open as openFile, stat, mkdir, rm, rename, readdir } from "fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Buffer } from "buffer";
import path from "path";
```

Local-module import order to append to (`index.ts:30–66`): `./provider-launch` → `./mcp-runtime` →
`./command-resolution` → `./claude-print` → `./persistence`. Six new imports slot in after `./persistence`.

**`Result<T>` — the shape `probeRuntime()` returns** (`index.ts:68–80`). Note the ASCII box header (C-10) and
the "inline to avoid Zod" comment that explains *why* it is not imported:

```typescript
// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────

type CaidoValidationResult =
  | { ok: true; authState: "valid"; message: "" }
  | { ok: false; authState: "invalid" | "error"; message: string };

type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> {
  return { kind: "Ok", value };
}
function err<T>(error: string): Result<T> {
  return { kind: "Error", error };
}
```

**How callers branch on it** (`index.ts:1724–1728`) — this is the exact shape `probeRuntime()`'s call site copies,
including the `cleanupMcpRuntime` on the failure arm:

```typescript
  const nodeExecutable = await requireNodeExecutable();
  if (nodeExecutable.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", nodeExecutable.error);
    return err(nodeExecutable.error);
  }
```

Three more instances of the identical arm at `:1730–1734`, `:1736–1741`, `:1743–1747` — with the
`const message = "…"` → `cleanupMcpRuntime` → `return err(message)` triple:

```typescript
  if ((await writeMcpContextFile()) === undefined) {
    const message = "Failed to create MCP context file.";
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }
```

**`startMcpServer` prologue — where the probe inserts** (`index.ts:1694–1720`). Pitfall 6: **probe before sweep**;
the sweep at `:1710` needs `host.tmpdir`, and `mcpTempDir` at `:1716` needs `getTempRoot`:

```typescript
async function startMcpServer(sdk: BackendSDK): Promise<Result<McpServerInfo>> {
  // Check prerequisites
  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") { ... return err(message); }

  // Check if MCP server asset exists
  const mcpScript = path.join(assetsPath, "mcp-server.mjs");
  if (!(await fileExists(mcpScript))) {
    return err("MCP server script not found in plugin assets.");
  }

  await sweepOrphanedMcpTempDirs(sdk);                      // ← MOVES after the probe

  // Use /tmp for MCP configs - Caido plugin path has spaces ("Application Support")
  // which breaks Claude Code's --mcp-config path parsing.
  // 0o700 so other local users cannot read the token-bearing wrapper/config
  // files written inside.
  mcpTempDir = `/tmp/drift-mcp-${genUUID()}`;               // ← RUN-03 + SC-3 site; use path.join
  await mkdir(mcpTempDir, { recursive: true, mode: 0o700 }); // ← D-07 retry site
```

**`sweepOrphanedMcpTempDirs`** (`index.ts:1673–1692`) — the three-line `filter`/`map`/`filter` chain the legacy-`/tmp`
arm extends. `getSweepRoots({ platform, tmpdir })` supplies the root list; everything else stays:

```typescript
// Remove orphaned /tmp/drift-mcp-* dirs left by a previous run that did not
// stop cleanly (crash, hard kill). Those dirs hold the token-bearing wrapper
// scripts, so leaking them is a credential-exposure risk. ...
async function sweepOrphanedMcpTempDirs(sdk: BackendSDK): Promise<void> {
  try {
    const entries = await readdir("/tmp");
    await Promise.all(
      entries
        .filter((name) => name.startsWith("drift-mcp-"))
        .map((name) => path.join("/tmp", name))
        .filter((dir) => dir !== mcpTempDir)
        .map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)),
    );
  } catch (error) {
    sdk.console.error(`[drift] Failed to sweep orphaned MCP temp dirs: ${String(error)}`);
  }
}
```

The `startsWith("drift-mcp-")` filter is why SC-3 must keep the `drift-mcp-` prefix when shortening the UUID.

**`genUUID` — keep the hex loop** (`index.ts:828–844`). Phase 3's P3-UUID does **not** license replacing it.
SC-3's shortening changes the *consumer*, not this function:

```typescript
/** Generate UUID v4 without crypto module */
function genUUID(): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    ...
  }
  return uuid;
}
```

**`getSessionDebugLogPath`** (`index.ts:335–338`) — the third hardcoded `/tmp`. Note it *already* returns
`string | undefined`, so the "return `undefined` when `host` is unset" default costs one extra guard:

```typescript
function getSessionDebugLogPath(sessionId: string): string | undefined {
  if (!currentSettings.debugLogging) return undefined;
  return `/tmp/drift-session-${sessionId}.log`;
}
```

**`getDiagnostics` — where D-06/D-08 fields land** (`index.ts:2750–2751`, `:2771–2778`, `:2821–2832`).
The flat `Record<string, string>` with `?? "not set (…)"` / `|| "none"` defaults:

```typescript
async function getDiagnostics(_sdk: BackendSDK): Promise<Result<Record<string, string>>> {
  ...
  const info: Record<string, string> = {
    pluginPath,
    assetsPath,
    mcpScript,
    mcpScriptExists: String(mcpScriptExists),
    mcpTempDir: mcpTempDir ?? "not set (MCP not started)",
    mcpTempScript: mcpTempScript ?? "not set (MCP not started)",
    mcpContextFile: getMcpContextFilePath() ?? "not set (MCP not started)",
    ...
```

And the **already-existing write probe** at the tail (`index.ts:2821–2832`) — worth reading before implementing
D-07, because it is the shape D-07 explicitly rejects as a *standalone canary* (it is fine here: diagnostics is
user-triggered, not on the MCP-start hot path):

```typescript
  if (mcpTempDir !== undefined) {
    info["mcpTempScriptExists"] =
      String(mcpTempScript !== undefined && await fileExists(mcpTempScript));
    const testCfg = path.join(mcpTempDir, "test-diag.json");
    try {
      await writeTemp(mcpTempDir, "test-diag.json", "test");
      info["tempDirWritable"] = "yes";
      await rm(testCfg);
    } catch (e) {
      info["tempDirWritable"] = `no: ${String(e)}`;
    }
  }
```

---

### `packages/backend/src/claude-print.ts` (MODIFIED — stateful stream parser, streaming)

**Analog: itself.** Two changes, both PERF-04 site B, both confined to `consumeClaudePrintChunk`'s prologue and
loop (`claude-print.ts:148–160`) — quoted in full under `activity-tail.ts` above. Nothing else in the file moves.

1. **Bound the buffer.** Add a `droppedBytes: number` field to `ClaudePrintState` (`:89–101`) and initialise it
   in `createClaudePrintState()` (`:103–117`). Both are exported, so the new field is part of the module's
   public shape — check `index.ts:2207` (`let claudePrintState = createClaudePrintState()`) and `:2495–2496`
   for the consumer.
2. **Split once.** Replace the `indexOf`/`slice` loop with a single `split("\n")` + `pop()` for the remainder.

**The invariant the refactor must preserve** — `line` is `.trim()`ed before parse, empty lines `continue`,
bad JSON `continue`s silently. `claude-print.test.ts` (393 lines, 11 `it`s) is the regression net and
`04-VALIDATION.md:98` requires it green **unmodified**.

**Finalizers that read the state** (`claude-print.ts:322–346`) — `droppedBytes` surfacing should follow this style,
and adding it must not change these four return values for any existing test input:

```typescript
export function finalizeClaudePrintOutput(state: ClaudePrintState): string {
  return state.finalText || state.streamedText.trim() || state.assistantText.trim();
}

export function getClaudePrintUsage(state: ClaudePrintState): ClaudeUsage | undefined {
  return state.usage;
}
```

---

## Shared Patterns

### The pure/impure split (applies to ALL six new modules)

**Source:** `packages/backend/src/command-resolution.ts:105–109` + its caller `index.ts:877–881`.
**Apply to:** every new module in this phase.

```typescript
// command-resolution.ts:105 — pure: no spawn, no which, no stat on the decision path
export async function getCommandExecutableCandidates(input: {
  command: string;
  pathResolution?: string;
  homeDirs: string[];
}): Promise<string[]> { ... }
```

```typescript
// index.ts:877–881 — the I/O shell supplies the results of I/O as plain inputs
  const candidates = await getCommandExecutableCandidates({
    command,
    pathResolution,                  // ← from spawn("which")
    homeDirs: getKnownHomeDirs(),    // ← from process.env + settings
  });
```

This is the phase's single most important directive (`04-RESEARCH.md` § *Pattern 1*, C-7): `index.ts` is
3,004 lines with zero test coverage and the maintainer cannot run Windows, so **anything left inline in
`index.ts` is unverified by construction** and falls into `04-VALIDATION.md`'s bucket **N**.

### Header comment explaining *why the module is pure*

**Source:** `packages/backend/src/provider-launch.ts:1–6`
**Apply to:** `platform.ts`, `fs-retry.ts`, `activity-tail.ts`, `bounded-buffer.ts`, `resolution-cache.ts`, `runtime-probe.ts`

```typescript
// Pure helpers that build provider-specific CLI launch arguments. The caller
// owns all side effects (writing MCP wrappers/configs, resolving binaries,
// handling auth token failures) and just passes the finalized paths in.
// Keeping this file free of I/O is what makes the per-provider snapshot
// tests possible — a regression in the argv of any provider shows up as a
// failed test before it can ship.
```

Every new module gets an equivalent 4–6 line header naming the caller's responsibilities and the reason
purity buys testability. For `platform.ts` this doubles as the SC-1 record.

### Naming conventions (C-6, verified against all five analogs)

| Element | Convention | Verified instances |
|---|---|---|
| Source file | kebab-case | `command-resolution.ts`, `provider-launch.ts`, `claude-print.ts`, `mcp-runtime.ts` |
| Test file | `<source>.test.ts`, sibling | all five |
| Exported function | camelCase, verb prefix `get*`/`build*`/`create*`/`normalize*`/`parse*`/`consume*`/`resolve*` | `getCommandExecutableCandidates`, `buildSelfTestResult`, `createClaudePrintState`, `normalizeUsage`, `parseMcpRuntimeContext`, `consumeClaudePrintChunk` |
| Boolean predicate | `is*` / `has*` / `did*` | `isToolUseContentType`, `hasCaidoContextChanged`, `didClaudeStopWithoutResult` |
| Module constant | SCREAMING_SNAKE_CASE, `as const` for arrays | `CLAUDE_DISALLOWED_TOOLS`, `MCP_SELF_TEST_CHECKS`, `NODE_EXECUTABLE_ERROR`, `DEBUG_CHUNK_PREVIEW_CHARS` |
| Object shape | `type`, not `interface` | `ClaudePrintState`, `PersistenceDbHandle`, `Result<T>` (`interface` appears only in `provider-launch.ts:22` for `ClaudeLaunchInput`) |
| Discriminated union | string-literal `kind` field | `Result<T>` (`index.ts:74`) |

### Error handling

**Source:** `index.ts:74–80` (`Result<T>`), `command-resolution.ts:32–39` (swallow-and-classify),
`index.ts:1689–1691` (`sdk.console.error` with `[drift]` prefix + `String(error)`).
**Apply to:** `fs-retry.ts` (returns `Result` or throws — planner picks), `runtime-probe.ts` (`Result<HostFacts>` per D-02),
and every new `index.ts` failure arm (must route through `cleanupMcpRuntime`).

Pure modules **never** touch `sdk.console` — they return data; `index.ts` logs it. Verified: zero `sdk` references
across all five existing pure modules.

### Comment style

**Source:** `index.ts:265–267`, `:1673–1678`, `:2265–2272`; `claude-print.ts:70–74`.
Comments explain **why**, and often record a runtime constraint or a past bug. Examples to imitate:
`"// 0o600: these temp files can carry the Caido token…"`, `"// Caido's plugin runtime does not run pending
setInterval callbacks during RPC handling…"`. Pitfall 3 (the LLRT `copy_from_slice` panic) is unobservable on
Node — `04-VALIDATION.md:88` grades it as a **static/code-review** item, so the anchored comment beside
`Buffer.alloc(length)` *is* the deliverable.

### Test-file conventions

**Source:** `eslint.config.mjs:66` and the five existing test files.

```javascript
  // no-focused-tests is the reason this is here: a committed describe.only or
  // it.only reduces the suite to one test and still reports green. Grep cannot
  // see .each.only.
  { files: ["**/*.test.ts"], ...vitest.configs.recommended },
```

- Import from `"vitest"` explicitly (`describe, expect, it` — plus `vi`, `afterEach` as needed). No globals.
- Relative sibling import: `from "./command-resolution"` — no extension, no alias.
- Backend tests run in the default **node** environment; only frontend files carry
  `// @vitest-environment happy-dom` (see `vitest.config.ts` comment).
- `vitest.config.ts` has **no `include` glob** — a new `*.test.ts` under `packages/backend/src/` is picked up
  automatically. No config change needed for the six new test files.
- No `.snap` files exist in this repo. Do not introduce snapshot files.

---

## No Analog Found

Two **sub-patterns** (not whole files) have no precedent in the codebase. The planner should use
`04-RESEARCH.md` § *Code Examples* for these and make the shape choice explicitly.

| Sub-pattern | Home file | Why no analog | Nearest partial |
|---|---|---|---|
| `withFsRetry(op, { delays, sleep })` — higher-order async orchestrator with an injected `sleep` | `fs-retry.ts` | The backend has no dependency-injected async wrapper anywhere. Every existing async helper calls its I/O directly | `spawnAndWait` (`index.ts:1519–1529`) for the "always resolves, never rejects" contract; `pathExists` (`command-resolution.ts:32–39`) for swallow-and-classify. Neither takes an injected dep |
| `createResolutionCache({ now, ttlMs })` returning closures | `resolution-cache.ts` | No backend module returns an object of closures. The repo's proven shape is `createXState(): PlainObject` + free functions taking that object (`claude-print.ts:103–117`, `:140`). Closure factories exist only in the **frontend** (Pinia `defineStore(() => …)`) | `createClaudePrintState()` + `consumeClaudePrintChunk(state, …)` — a state-object variant would be consistent with the backend; `getPersistenceDbHandle` (`persistence.ts:6–13`) for the returned-handle idea |

Also worth recording, though not a missing analog:

- **`buildSpawnEnv` has no live consumer in Phase 4.** No `spawn()` site in `index.ts` passes `env` today
  (verified: `:853`, `:1191`, `:1521`, `:2188` — none has an `env` key). Env reaches children through the bash
  `export` wrapper, which is Phase 5's to rewrite. Ship the pure function + unit test; the static cross-check in
  `04-VALIDATION.md:100` will be counting zero call sites.
- **`normalizePathForCompare` has no caller in Phase 4** by design (D-04; Phase 6 is its first caller).
  `04-VALIDATION.md:138–143` mandates an `eslint-disable` citing D-04 if `--max-warnings 0` trips on it.
  Do not delete it.

---

## Scope Fence Notes for the Planner

Three places where an analog exists but is **deliberately out of scope**:

| Site | Why it looks in scope | Verdict |
|---|---|---|
| `writeLaunchScript` `.tmp` → `rename` (`index.ts:299–318`) and `writeMcpWrapper`'s identical pair (`:743–778`) | `04-RESEARCH.md` § *Which operations need the ladder* calls `rename` "the single best-documented case" for RUN-04 | **Phase 5.** `04-CONTEXT.md` § *Phase Boundary* fences `writeLaunchScript` / `writeMcpWrapper` / `renderExportExecScript` / `shellQuote` / `chmod` byte-stable. Record the taxonomy in `fs-retry.ts`; apply it at those sites in Phase 5 |
| `command-resolution.ts:113–125` static POSIX candidate arrays | `getHomeDirCandidates` / `getExecutableNames` in `platform.ts` look like they belong here | **Phase 6 fills the data; Phase 4 ships the shape** (D-03). `command-resolution.ts` is UNTOUCHED this phase |
| `renderExportExecScript` (`index.ts:320–333`) `#!/bin/bash` + `export` + `exec "$@"` | The most obviously non-portable code in the file | **Phase 5.** Not a Phase 4 file |

---

## Metadata

**Analog search scope:** `packages/backend/src/` (all 16 files), `packages/backend/assets/mcp-server.mjs` (activity
record format only), `vitest.config.ts`, `vitest.setup.ts`, `eslint.config.mjs`
**Files scanned:** 20
**Files read in full:** `command-resolution.ts`, `command-resolution.test.ts`, `provider-launch.ts`,
`provider-launch.test.ts`, `persistence.ts`, `persistence.test.ts`, `claude-print.ts`, `claude-print.test.ts`,
`mcp-runtime.ts`, `mcp-runtime.test.ts`
**Files read in targeted ranges:** `index.ts` (13 non-overlapping regions covering every site named in
`04-CONTEXT.md` § *Integration Points*)
**Pattern extraction date:** 2026-08-14
