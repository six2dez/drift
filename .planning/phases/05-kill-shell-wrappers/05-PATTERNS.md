# Phase 5: Kill Shell Wrappers - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 9 (3 new source/test, 4 modified source, 2 new non-source)
**Analogs found:** 8 / 9 (`.gitattributes` has no analog — none exists in the repo)

This phase is a **rewire, not a greenfield build**. Every pattern below is extracted from code that
already ships. Where RESEARCH.md § *Complete Site Inventory* gave a line number it was verified at
HEAD; the two corrections found during verification are called out in § *Line-Anchor Verification*.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/backend/src/mcp-server-spec.ts` **(NEW)** | utility (pure module) | transform | `packages/backend/src/platform.ts` | exact (structure) + `index.ts:2791-2802` (content) |
| `packages/backend/src/mcp-server-spec.test.ts` **(NEW)** | test (pure unit) | transform | `packages/backend/src/platform.test.ts` | exact |
| `packages/backend/src/mcp-server-spec.spawn.test.ts` **(NEW)** | test (integration spawn) | request-response over stdio | `packages/backend/src/mcp-server.transport.test.ts:124-190` | exact |
| `packages/backend/src/index.ts` **(MOD)** | orchestrator / controller | event-driven + process I/O | itself — `:2791` (Copilot writer) is the in-file template | exact |
| `packages/backend/src/runtime-probe.ts` **(MOD)** | utility (pure formatter) | transform | itself — existing `ProbeCapabilityResult` rows | exact |
| `packages/backend/src/runtime-probe.test.ts` **(MOD)** | test | transform | itself | exact |
| `package.json` **(MOD — `build` script)** | config | batch | `.github/workflows/release.yml` consumption contract | role-match |
| `.github/workflows/ci.yml` **(MOD — windows job)** | config (CI) | batch | the `verify` job in the same file + `windows-llrt-probe.yml` | exact |
| `.gitattributes` **(NEW)** | config | — | **none — no `.gitattributes` exists in this repo** | none |
| `README.md` **(MOD — D-03 line)** | docs | — | `README.md:41-44` provider table | exact |

---

## Pattern Assignments

### `packages/backend/src/mcp-server-spec.ts` (NEW — pure module, transform)

**Structural analog:** `packages/backend/src/platform.ts`
**Content analog:** `packages/backend/src/index.ts:2791-2802` (the Copilot MCP config writer)

#### Content pattern to generalise — the shipping shape (`index.ts:2791-2802`)

This is the single most important excerpt in the phase. `buildMcpServerSpec()` generalises **this**;
it does not invent a shape.

```typescript
          const cfgFile = await writeChatMcpConfig(
            `copilot-mcp-${input.chatId}.json`,
            {
              command: nodeExecutable.value,
              args: [mcpScriptPath],
              env: buildMcpRuntimeEnv({
                caidoToken,
                toolPolicy,
                activityFilePath: runtimeFiles?.activityFilePath,
                approvalsFilePath: runtimeFiles?.approvalsFilePath,
              }),
            },
          );
```

Note the guard block immediately above it (`index.ts:2782-2790`) — `caidoToken === ""` → `err(...)`,
then `requireNodeExecutable()` → `kind === "Error"` → `err(...)`. That is the exact preamble
`requireMcpServerSpec()` (RESEARCH § *Code Examples* #1) absorbs, and it appears **verbatim three
times today** (`:2721-2729` Claude, `:2782-2790` Copilot, `:1545-1556` refresh). Collapsing the
triplicate is a side benefit of the keystone, not a separate task.

#### Module-header pattern (`platform.ts:1-16`)

Copy this shape of header — it states the mechanically-checkable properties of the module, not just
its purpose:

```typescript
// Pure OS-decision helpers for the native-Windows port. Two properties are
// load-bearing here and both are mechanically checkable: this module performs
// ZERO I/O, and it carries ZERO import statements — `grep -c '^import'` over
// this file returns 0, which is the machine form of the "no I/O" claim (SC-1).
// `platform` is therefore always an INJECTED parameter, never read from `os` or
// `process`: D-02 puts the single `os` read in index.ts behind the RUN-05 probe.
```

`mcp-server-spec.ts` differs in one respect the header must state: it **does** carry one import
(`buildSpawnEnv` from `./platform`), so the zero-import claim is replaced by "zero I/O; `parentEnv`
is injected, never read from `process`." `runtime-probe.ts:9-18` is the precedent for a header that
justifies each import it does allow.

#### The `{ ...input }` injected-parameter convention (`platform.ts:262-269`)

Every exported function takes a single object parameter. No positional args, no module state:

```typescript
export function buildSpawnEnv(input: {
  parentEnv: Record<string, string | undefined>;
  driftVars: Record<string, string>;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.parentEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  return { ...merged, ...input.driftVars };
}
```

**This is the function every new spawn site must call** (CONTEXT.md domain fact 2). The comment
above it (`platform.ts:243-261`) carries both the SC-9 rationale and the **T-04-04 rule that decides
D-11**:

```typescript
// `parentEnv` is an input rather than a `process.env` read so the SC-9 assertion
// stays a pure unit test. This returns data only and must never be used to
// render an environment into a log or diagnostic (T-04-04).
```

#### Discriminated-union pattern for `planMcpCliRegistration` (D-02)

House convention is a string-literal `kind` field (CLAUDE.md § *Naming Patterns*), already used by
`Result<T>` throughout `index.ts` (`{ kind: "Ok" } / { kind: "Error" }`) and by
`runtime-probe.ts`'s `RealpathRung`. Follow `normalizePlatform`'s allow-list-gate shape
(`platform.ts:35-45`): return the explicit non-happy case rather than falling through.

---

### `packages/backend/src/mcp-server-spec.test.ts` (NEW — test, transform)

**Analog:** `packages/backend/src/platform.test.ts`

**Imports + intent-header pattern** (`platform.test.ts:1-18`):

```typescript
import { describe, expect, it } from "vitest";
import {
  buildSpawnEnv,
  getExecutableNames,
  // …named imports, alphabetised
} from "./platform";

// Every Windows branch below is exercised with `platform` passed as a literal,
// which is the entire point of `platform.ts` being pure: the maintainer cannot
// run native Windows, so this suite is the win32 proof and it runs on the Linux
// CI runner. The describe/it titles are a CONTRACT with 04-VALIDATION.md, which
// addresses each row by `-t "<name>"` — renaming one silently unhooks a
// requirement from its verification.
```

**Test-body pattern** (`platform.test.ts:20-38`) — one `describe` per exported function, `it` titles
that state the *behaviour and its reason*, not the input:

```typescript
describe("getTempRoot", () => {
  it("strips the trailing backslash GetTempPath2 returns on Windows", () => {
    expect(
      getTempRoot({
        platform: "win32",
        tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp\\",
      }),
    ).toBe("C:\\Users\\x\\AppData\\Local\\Temp");
  });
```

**Apply to:** `buildMcpServerSpec` (asserting the parent spread is present — the L-4 regression
tripwire), `planMcpCliRegistration` (`platform: "win32"` literal → `kind: "Skip"`, which is D-02's
"unreachable on win32" assertion), and `formatSpawnDebugLine` (`.not.toContain(tokenValue)`).

---

### `packages/backend/src/mcp-server-spec.spawn.test.ts` (NEW — integration test, stdio request-response)

**Analog:** `packages/backend/src/mcp-server.transport.test.ts` — copy its skeleton wholesale.

**Imports** (`mcp-server.transport.test.ts:1-7`) — note `os` + `path` + `fileURLToPath`, which is
what makes the file cross-platform without a single conditional:

```typescript
import { createServer } from "http";
import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
```

**Temp-dir + cleanup pattern** (`:18-40`) — cross-platform via `os.tmpdir()`, registered for
`afterEach` teardown:

```typescript
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempContextFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-transport-"));
  tempDirs.push(dir);
  const contextFile = path.join(dir, "mcp-context.json");
  await writeFile(contextFile, JSON.stringify({ /* uiContext / overrideContext */ }));
  return contextFile;
}
```

**Local HTTP stub pattern** (`:42-60`, ending at `:127-131`) — a real `http` server bound to an
ephemeral port; the URL is handed to the child as `CAIDO_URL`:

```typescript
const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/graphql") { res.statusCode = 404; res.end(); return; }
  let body = "";
  req.setEncoding("utf-8");
  req.on("data", (chunk: string) => { body += chunk; });
  req.on("end", () => { /* … respond … */ });
});
// …
return { server, url: `http://127.0.0.1:${address.port}` };
```

**Spawn + line-drain + timeout pattern** (`:139-190`) — this is the block D-08's test reshapes:

```typescript
const proc = spawn(process.execPath, [scriptPath], {
  env: {
    ...process.env,
    CAIDO_URL: delayedCaido.url,
    CAIDO_TOKEN: "session-token",
    DRIFT_CONTEXT_FILE: contextFile,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderr = "";
const timeout = setTimeout(() => {
  try { proc.kill("SIGKILL"); } catch { /* ignore */ }
  reject(new Error(`Timed out waiting for drained response. ${stderr}`));
}, 5000);

proc.stdout.setEncoding("utf-8");
proc.stdout.on("data", (chunk: string) => {
  stdoutBuffer += chunk;
  let newlineIndex = stdoutBuffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    newlineIndex = stdoutBuffer.indexOf("\n");
    if (line === "") continue;
    const parsed = JSON.parse(line) as JsonRpcResponse;
    if (parsed.id === 2) { clearTimeout(timeout); resolve(parsed); }
  }
});

proc.on("error", (error) => { clearTimeout(timeout); reject(error); });
```

**The one mandated divergence (D-08):** the `env:` object literal above must be replaced by
`spec.env` from the **imported production** `buildMcpServerSpec`, and `scriptPath` becomes
`spec.args[0]`. A second copy of the spec logic inside the test voids the evidence
(CONTEXT.md § *Specific Ideas*).

**Also copy:** the `\n`-terminated JSON-RPC write sequence at `:174-195`
(`initialize` → `notifications/initialized` → `tools/call`) and `proc.stdin.end()`. The `5000` ms
constant is the RESEARCH § *Verifying D-09* first-run Windows risk — raise it, never add a retry.

---

### `packages/backend/src/index.ts` (MOD — orchestrator)

Analogs are **in-file**. Five distinct patterns to copy or delete.

#### 1. The config-JSON writer that already accepts `env` (`index.ts:711-724`)

`writeChatMcpConfig` needs almost no change; Claude's caller just starts passing `env`:

```typescript
async function writeChatMcpConfig(
  name: string,
  server: { command: string; args: string[]; env?: Record<string, string> },
): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  if (!(await fileExists(server.command))) return undefined;
  return writeTemp(mcpTempDir, name, JSON.stringify({ mcpServers: { drift: server } }, null, 2));
}
```

Note `fileExists(server.command)`: today Claude's `command` is the wrapper `.sh`; after the rewrite
it is the absolute `node` path, so this guard keeps working and gains meaning.

#### 2. The token-bearing temp write (`index.ts:691-699`) — D-10's mode discipline

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

D-10 is literally true because of this function: Claude's `mcp-<chatId>.json` already goes through
it. Nothing here changes; the comment's "e.g. the Copilot MCP config" is worth widening to name
Claude too.

#### 3. The site being replaced — Claude's session wrapper (`index.ts:2729-2750`)

Delete the `writeMcpWrapper` call and its failure branch; keep the `writeChatMcpConfig` call and give
it the Copilot shape from § *Content pattern* above:

```typescript
          const sessionWrapperPath = await writeMcpWrapper(
            mcpScriptPath, nodeExecutable.value, caidoToken,
            { name: `mcp-wrapper-${input.sessionId}.sh`, toolPolicy, activityFilePath: …, approvalsFilePath: … },
          );
          if (sessionWrapperPath === undefined) { /* err */ }
          const cfgFile = await writeChatMcpConfig(`mcp-${input.chatId}.json`, {
            command: sessionWrapperPath,
            args: [],                       // ← becomes [mcpScriptPath], + env:
          });
```

`claudeMcpWrapperPath` disappears with it — which also removes the `finalize()` cleanup at `:3304`
and the debug dump at `:2903-2910`.

#### 4. The provider spawn conversion (D-04) — delete-as-one-set (`:2878-2896`, `:3082`, `:3308`)

The three sites are a **single change set**; `noUnusedLocals` + `--max-warnings 0` turns a half-done
deletion into a build failure, which is the enforcement mechanism.

```typescript
    // :2878-2896 — DELETE the whole indirection
    let launchCommand = resolved;
    let launchArgs = args;
    let launchScriptPreview = "";
    if (runtimeFiles !== undefined) {
      launchScriptPreview = renderExportExecScript(resolved, args, runtimeEnv);
      const launchScriptPath = await writeLaunchScript(`provider-launch-${input.sessionId}.sh`, resolved, args, runtimeEnv);
      if (launchScriptPath === undefined) { /* err */ }
      launchCommand = launchScriptPath;
      launchArgs = [];
    }

    // :3082 — becomes spawn(resolved, args, { env: buildSpawnEnv({…}), stdio: [...] })
      const proc = spawn(launchCommand, launchArgs, { stdio: ["pipe", "pipe", "pipe"] });

    // :3308 — DELETE. After the conversion this condition is permanently false;
    // a bare rm(launchCommand) left behind would delete the user's `claude` binary.
          if (launchCommand !== resolved) {
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${launchCommand}`);
            await rm(launchCommand, { force: true }).catch(() => undefined);
          }
```

`lastSpawnArgs = [launchCommand, ...launchArgs]` at `:2897` is a fourth member of the set.

#### 5. `spawnAndWait` has NO `env` parameter — **planner must extend it** (`index.ts:2105-2107`)

Verified at HEAD and **not noted in RESEARCH.md's site inventory**:

```typescript
function spawnAndWait(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
```

`validateCaidoAuth` (`index.ts:1209`) is `spawnAndWait(wrapperPath, ["--validate-auth"])` — it works
today only because the wrapper carries the env in its `export` lines. Changing its signature to take
a spec therefore requires `spawnAndWait` to accept and forward an `env` option (optional third
parameter, so its other ~8 call sites are untouched). Follow the "PUBLIC shape unchanged" discipline
its own comment at `:2122-2123` already states.

#### 6. Error-handling pattern for a new spawn chokepoint (`index.ts:2124-2130` + LLRT L-5)

`spawnAndWait`'s `proc.on("close", …)` resolve-never-reject shape is the house convention. RESEARCH
finding L-5 adds a hard requirement for any new `spawnNode`: an `error` listener attached
**synchronously**, and classification by **message substring, never `error.code`** — reuse
`fs-retry.ts`'s existing message-matching convention rather than inventing a second one.

#### 7. Retry ladder, if the planner extends it to config writes (`index.ts:2467-2480`)

```typescript
  const written = await withFsRetry(
    async () => {
      await mkdir(tempDir, { recursive: true, mode: 0o700 });
      await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"));
    },
    {
      onRetry: (info) => {
        sdk.console.error(
          `[drift] Transient filesystem error staging the MCP server (attempt ${String(info.attempt)}, code ${info.code}); retrying in ${String(info.delayMs)}ms`,
        );
      },
    },
  );
  lastFirstWriteAttempts = written.attempts;
```

Sole call site today. The comment block above it (`:2455-2466`) is also the precedent for the
**"both `mode:` options stay UNCONDITIONAL"** rule (T-04-30) that D-10 depends on.

#### 8. The Windows-skip message channel (`index.ts:2241`, written at `:2270-2273`)

```typescript
const skippedMcpCliReasons = new Map<"gemini" | "codex", string>();
// …
  skippedMcpCliReasons.set(
    cli,
    `mcp add exited with code ${String(result.code)}: ${result.stderr.trim() || "no stderr"}`,
  );
```

Set-and-`sdk.console.log` pairs appear five times in `tryRegisterMcpForProviders` (`:2276-2300`) —
copy that pair shape exactly for D-03's win32 skip. The reason string must name the phase, not just
the limitation.

---

### `packages/backend/src/runtime-probe.ts` (MOD — D-05's reported metric)

**Analog:** the module itself. Two in-file rules bind the new `PATH`-entry-count / env-key-count row:

```typescript
// Security (V7 / T-04-04): every field this module emits is a version string, a
// path, a boolean or an integer. It never enumerates the process environment and
// never carries the Caido token. … Windows profile variables therefore render as
// presence booleans BY NAME, never as values, because their values contain the
// user's real account name.
```
(`runtime-probe.ts:20-26`)

```typescript
// ── D-06's gate table, encoded as DATA rather than as control flow ──────────
// The rule: a primitive with a working fallback REPORTS; a primitive without one
// GATES. Encoding it as a fixed-order array (the MCP_SELF_TEST_CHECKS shape at
// mcp-runtime.ts:21-25) means three things at once — the report always renders
// identically, a test can iterate it, and the classification is assertable
// instead of being implied by an `if` somewhere in a 3,000-line file.
```
(`runtime-probe.ts:30-36`)

D-05's metric is a **count**, not a boolean, and enters as a new row in that data table with
REPORT classification. RESEARCH § L-1 is explicit about why a boolean is insufficient: "present but
4 entries" is the interesting macOS/Windows signal.

---

### `.github/workflows/ci.yml` (MOD — the `windows-latest` job)

**Analog A:** the `verify` job in the same file (`ci.yml:18-56`). Copy step order and action pins:

```yaml
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      # Must stay ahead of Setup Node, whose pnpm store cache needs the pnpm
      # binary to already exist. No version input: pnpm 9.0.0 is derived from
      # package.json's packageManager field.
      - name: Setup pnpm
        uses: pnpm/action-setup@v6

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      # … Typecheck / Lint / Test (`pnpm exec vitest run`) / Build (`pnpm build`)
```

Do **not** copy `windows-llrt-probe.yml`'s `package-manager-cache: false` — that line exists only
because the probe deliberately installs nothing (RESEARCH § C-2).

**Analog B:** `.github/workflows/windows-llrt-probe.yml` for the Windows-runner specifics:

- `runs-on: windows-latest` + `timeout-minutes` with a stated reason (`:56-57`; probe uses `10`,
  RESEARCH recommends `20` for build+suite, set from the first real run).
- `permissions: contents: read` (`:48-49`) — a deliberate divergence from `ci.yml`, with its
  rationale in-comment.
- `shell: bash` pinning, with the reason stated (`:169-174`):
  > ``shell: bash`` is mandatory here and not stylistic. GitHub Actions maps it to
  > `bash --noprofile --norc -eo pipefail {0}` on every OS including Windows, and pipefail is what
  > makes the pipeline return the probe's exit code instead of tee's.
- **The three-arm no-secret-material gate** (`:145-166`) — copy verbatim, re-pointed at the files in
  scope. The middle-arm reasoning is load-bearing:
  ```bash
          status=0
          grep -nE 'CAIDO_(TOKEN)|secret(s)\.' <targets> || status=$?
          # Three arms, not two. grep exits 0 on a match, 1 on no match, and 2
          # when a target is missing or unreadable. An if/else would route that 2
          # into the pass arm and silently green-light exactly the Phase 4-8 edit
          # this gate exists to catch. Do NOT collapse the third arm into the
          # second.
          if [ "$status" -eq 0 ]; then … exit 1
          elif [ "$status" -eq 1 ]; then … pass
          else … exit 1
          fi
  ```

**Analog C (D-02's deletion notice):** `windows-llrt-probe.yml:1-5` is the literal in-repo precedent
for the `DELETED IN PHASE 7 (PRV-03)` headers:

```yaml
# TEMPORARY — DELETED IN PHASE 9 (D-02).
# This workflow is a de-risking spike with a due date, not a permanent fixture.
# It is removed in Phase 9, when requirement CI-01 lands the permanent
# windows-latest build+vitest regression job. The due date is named literally
# because an undated "temporary" comment becomes permanent: Phase 9, CI-01.
```

Match the em-dash-and-parenthesised-ID form so `grep -rn 'DELETED IN PHASE [0-9]\+ ('` finds both.

---

### `.gitattributes` (NEW — config)

**No analog. None exists in this repo** (re-confirmed at HEAD). Content is fixed by ROADMAP Phase 9
SC-2 / D-09: `* text=auto eol=lf`. Its role in Phase 5 is prophylactic — nothing currently asserts on
newline-bearing generated content — but the surviving `renderExportExecScript` still emits
`\n`-joined shell text (`index.ts:757-761`) and Phase 7 will test it.

---

### `README.md` (MOD — D-03's user-facing sentence)

**Analog:** the provider table at `README.md:41-44`, where per-provider caveats already live:

```markdown
| Gemini CLI | No | Yes (registered wrapper) | **Experimental** — text output, mutates `~/.gemini/settings.json` on start/stop |
| Codex CLI | No | Yes (pre-registered via `codex mcp add`) | **Experimental** — text output, thin wiring |
```

The Windows limitation belongs in the Status cells of these two rows (and/or the paragraph at `:46`),
phrased identically to the `skippedMcpCliReasons` string so the two land in one voice.

---

## Shared Patterns

### Env merging — the one non-negotiable

**Source:** `packages/backend/src/platform.ts:262-269` (`buildSpawnEnv`)
**Apply to:** every new or converted `spawn` call that supplies `env` — the MCP spec, the provider
spawn (D-04), `spawnAndWait`'s new `env` path.

```typescript
env: buildSpawnEnv({ parentEnv: process.env, driftVars: runtimeEnv })
```

Never `{ ...process.env, ...vars }` at a call site, never a bare `env: runtimeEnv`. RESEARCH § L-4:
a bare dict is **green on every runner this project has** and broken only under LLRT. This is why
the phase gate is a static `grep`, not a review convention.

### Result / early-return error handling

**Source:** `index.ts` throughout — e.g. `:2726-2729`, `:1552-1556`
**Apply to:** every new `index.ts` function.

```typescript
          const nodeExecutable = await requireNodeExecutable();
          if (nodeExecutable.kind === "Error") {
            setSessionState("error", nodeExecutable.error);
            return err(nodeExecutable.error);
          }
```

In `refreshActiveMcpRuntime` the same shape returns a **message string** and calls
`cleanupMcpRuntime` first (`index.ts:1552-1556`) — that variant is what the converted `:1564`/`:1571`
site keeps.

### Comments that state the mechanically-checkable property

**Source:** `platform.ts:1-16`, `runtime-probe.ts:1-26`, `index.ts:2455-2466`, `index.ts:692-694`
**Apply to:** the new module header, the deletion notices, and the D-11 debug formatter.

The house voice is: state the rule, then state *why the obvious simplification is wrong*, then cite
the decision ID (`T-04-04`, `D-02`, `SC-9`, `PRV-03`). A comment that only says what the code does is
below the bar set by every module in this package.

### Naming and file layout

**Source:** CLAUDE.md § *Naming Patterns*, confirmed by the 13 sibling pairs in
`packages/backend/src/`.

kebab-case source, sibling `.test.ts`, dotted variant for a second test surface
(`mcp-server.transport.test.ts` / `.context.test.ts` / `.allowlist.test.ts` → `mcp-server-spec.spawn.test.ts`).
`type` over `interface`; `kind` string-literal discriminants; verb-noun function names
(`build*`, `plan*`, `format*`).

---

## Line-Anchor Verification

RESEARCH.md § *Complete Site Inventory* was treated as authoritative and re-verified at HEAD. Two
corrections and one addition:

| Symbol | RESEARCH says | Verified at HEAD | Note |
|---|---|---|---|
| Copilot config writer | `:2792` | **`:2791`** (`const cfgFile = await writeChatMcpConfig(`) | one line off; block runs `:2791-2802` |
| `validateCaidoAuth` | `:1209` (inventory) / `:1208` (CONTEXT) | **`:1209`** | inventory is right, CONTEXT.md is one off |
| `spawnAndWait` | not in inventory | **`:2105`** | **takes no `env` parameter** — signature must be extended for `validateCaidoAuth(spec)`. See § *index.ts pattern 5* |

All other anchors used above (`:691`, `:711`, `:728`, `:749`, `:1013`, `:1541`, `:1564`, `:1571`,
`:2241`, `:2249`, `:2729`, `:2878`, `:3082`, `:3308`, `platform.ts:262`,
`mcp-server.transport.test.ts:124-190`) confirmed correct at HEAD.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.gitattributes` | config | — | No `.gitattributes` exists in this repo. Content is fully specified by ROADMAP Phase 9 SC-2 (`* text=auto eol=lf`); no pattern extraction needed |

Everything else in this phase has a working in-repo analog. RESEARCH § *Don't Hand-Roll* states the
consequence plainly: the highest-risk failure mode here is not "we built the wrong thing" but "we
rebuilt a thing that was already there, slightly differently, at a site that is not test-reachable."

---

## Metadata

**Analog search scope:** `packages/backend/src/`, `.github/workflows/`, `package.json`, `README.md`,
repo root
**Files scanned:** 9 read in full or in targeted ranges (`index.ts` via 8 non-overlapping `sed`
ranges), 27 listed in `packages/backend/src/`
**Pattern extraction date:** 2026-08-20
