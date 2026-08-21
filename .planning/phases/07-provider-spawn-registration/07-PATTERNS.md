# Phase 7: Provider Spawn & Registration - Pattern Map

**Mapped:** 2026-08-21
**Files analyzed:** 8 (3 new, 5 modified)
**Analogs found:** 8 / 8 (7 exact, 1 partial)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/backend/src/spawn-plan.ts` (NEW) | utility (pure module) | transform | `packages/backend/src/platform.ts` (zero-import purity + injected `platform`), `mcp-server-spec.ts` (decision-shape) | exact |
| `packages/backend/src/spawn-plan.test.ts` (NEW) | test (unit) | transform | `packages/backend/src/platform.test.ts`, `mcp-server-spec.test.ts` | exact |
| `packages/backend/src/spawn-plan.win32.test.ts` (NEW) | test (integration, win32-gated) | request-response (real spawn) | `packages/backend/src/mcp-server-spec.spawn.test.ts` (skeleton + caveat header), `mcp-server.transport.test.ts` (temp dir / timeout / SIGKILL) | exact |
| `packages/shared/src/cli-providers.ts` or `mcp.ts` (MODIFY — D-04 flag + predicate) | config (data table) + utility (pure predicate) | transform | `cli-providers.ts` `PROVIDER_INSTALL_COMMANDS` (data-only, `Record<CliProvider, …>` keying) + `mcp-server-spec.ts` `planMcpCliRegistration` (fail-closed predicate) | exact |
| `packages/backend/src/mcp-server-spec.ts` (MODIFY — registration payload, `formatMcpRemoveFailure`) | service (pure builder) | transform | `planMcpCliRegistration` / `formatSpawnDebugLine` in the same file | exact |
| `packages/backend/src/index.ts` (MODIFY — 4 spawn sites, startup sweep, SC-7 deletions) | controller (orchestration/I-O) | event-driven + request-response | `sweepOrphanedMcpTempDirs` (startup sweep), `registerMcpWithCli` / `unregisterMcpFromCli` (registration spawns) | exact |
| `packages/frontend/src/views/SettingsView.vue` (MODIFY — D-08 sentence, UX-01 placeholder) | component | request-response (store-backed) | the `getStatus(pid)?.resolvedPath` / `?.error` blocks in the same file, lines 329-335 | exact |
| `README.md` (MODIFY — D-08 line) | config/doc | — | README lines 43-44, the Phase-5 05-D-03 skip sentences | partial |

---

## Pattern Assignments

### `packages/backend/src/spawn-plan.ts` (pure module, transform)

**Primary analog:** `packages/backend/src/platform.ts` — for the module header and purity contract.
**Secondary analog:** `packages/backend/src/mcp-server-spec.ts` — for the returned decision object and the fail-closed branch order.

**Module-header pattern** (`platform.ts:1-16`) — this is the *convention this repo's pure modules are recognised by*: a mechanically-checkable purity claim (`grep -c '^import'` returns N), a statement of *why* the module exists outside `index.ts`, and an explicit "deliberately NOT imported" list:

```ts
// Pure OS-decision helpers for the native-Windows port. Two properties are
// load-bearing here and both are mechanically checkable: this module performs
// ZERO I/O, and it carries ZERO import statements — `grep -c '^import'` over
// this file returns 0, which is the machine form of the "no I/O" claim (SC-1).
// `platform` is therefore always an INJECTED parameter, never read from `os` or
// `process`: D-02 puts the single `os` read in index.ts behind the RUN-05 probe.
// That injection is the whole point — the maintainer cannot test native Windows
// locally, so every win32 branch has to be provable by the Linux/macOS CI runner,
// and anything left un-injected is unverifiable by construction.
//
// Not imported, deliberately: `os` (D-02, above) and `path`. None of the exports
// below needs `path`, and `getTempRoot` strips separators with explicit string
// logic *because* `path` resolves to its POSIX flavour on the Linux runner and
// would not strip a Windows-shaped trailing backslash. An unused import is also a
// hard build failure here (tsconfig `noUnusedLocals` → TS6133; `pnpm lint` runs
// at `--max-warnings 0`), so the zero-import property is self-enforcing.
```

The same file's `mcp-server-spec.ts:1-24` variant states the *count* of allowed imports (`'^import'` returns 1) and justifies that one import by name. `spawn-plan.ts` will import at most `type Platform` from `./platform`, so it should use the **`mcp-server-spec.ts` one-import form**, naming `Platform` and justifying it, plus a "deliberately NOT imported: `path`, `os`, `process`, `child_process`" list. **`cross-spawn`'s MIT attribution + upstream URL belongs in this same header** (RESEARCH Q3).

**Injected-platform union pattern** (`platform.ts:18-26`) — the narrow three-member union and the reason it is not `NodeJS.Platform`:

```ts
// The narrow union is deliberate — NOT `NodeJS.Platform`. Widening it to every
// value Node can report would let an unrecognised platform flow silently into
// the POSIX arm, which on Windows *is* the reported bug reintroduced one layer
// up. ...
export type Platform = "win32" | "darwin" | "linux";
```

`buildSpawnPlan` takes `platform: Platform | undefined`. **Reuse this type; do not redeclare it.**

**Decision-object + POSIX-passthrough pattern** (`platform.ts:600-612`, `rankPathSearchHits`) — the exact shape of the CMP-01 byte-identity arm, including the `undefined`-takes-the-POSIX-arm comment that Pitfall F requires:

```ts
  // Non-win32, `undefined` INCLUDED: the POSIX search tool has single-answer
  // semantics, so the ranking arm must be a no-op there and return exactly what
  // the single-line extraction this replaces returned. That byte-identity is
  // D-01's CMP-01 obligation. `undefined` (pre-probe) takes this arm because
  // only one binary can actually be spawned, so no union answer exists here —
  if (input.platform !== "win32") {
    const first = input.lines[0]?.trim() ?? "";
    return first === "" ? [] : [first];
  }
```

**Convention encoded:** the non-win32 arm is written FIRST, returns the pre-existing behaviour byte-identically, and carries the CMP-01 comment naming `undefined` explicitly.

**Fail-closed / explicit-branch-order pattern** (`mcp-server-spec.ts:170-215`) — the `{kind}` discriminated union D-06 follows, with the branch-order contract stated:

```ts
export type McpCliRegistration =
  | { kind: "Register"; wrapperPath: string }
  | { kind: "Skip"; reason: string };

// Allow-list gate in `normalizePlatform`'s shape: return the explicit non-happy
// case rather than falling through. The branch ORDER is part of the contract —
// an unknown platform and win32 both Skip BEFORE `wrapperPath` is considered, so
// there is no input at all on which a win32 host reaches the wrapper arm.
export function planMcpCliRegistration(input: {
  platform: Platform | undefined;
  cli: "gemini" | "codex";
  wrapperPath: string | undefined;
}): McpCliRegistration {
  if (input.platform === undefined) {
    // Fail closed. Caido's LLRT hardcodes PLATFORM at compile time and its third
    // arm is `std::env::consts::OS`, which can yield "freebsd" or "android" —
    // values that must never flow silently into the POSIX arm (RUN-05).
    return {
      kind: "Skip",
      reason:
        "Drift could not determine the host platform, so MCP registration was skipped.",
    };
  }
```

**Constant-assembly pattern for dangerous literals** (`mcp-server-spec.ts:245-248`) — directly relevant to `spawn-plan.ts`'s metachar regex and any literal `%`-sequence:

```ts
// The two-character opener is assembled from separate string parts so this
// source file never carries a literal variable-reference sequence that a
// downstream tool — a shell heredoc, a template renderer, an editor snippet
// expander — could mangle on its way through.
const EXPANSION_OPENER = "$" + "{";
```

**Return-shape target** (from RESEARCH Q3/Q5, no existing analog — this is new):
`buildSpawnPlan({ command, args, platform }) → { file, args, windowsVerbatimArguments }`.
Model the *object* on `McpServerSpec` (`mcp-server-spec.ts:37-42`), which is the house's "one decision, several projections" type:

```ts
export type McpServerSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
  driftVars: Record<string, string>;
};
```

---

### `packages/backend/src/spawn-plan.test.ts` (unit test, transform)

**Analog:** `packages/backend/src/platform.test.ts` and `mcp-server-spec.test.ts` — identical header convention.

**Imports + header** (`mcp-server-spec.test.ts:1-18`):

```ts
import { describe, expect, it } from "vitest";

import {
  buildMcpDriftVars,
  buildMcpServerSpec,
  findExpandableEnvKeys,
  formatSpawnDebugLine,
  planMcpCliRegistration,
  toMcpConfigDocument,
} from "./mcp-server-spec";

// Every input below is passed as a literal, which is the entire point of
// `mcp-server-spec.ts` being pure: the module reads no `process.env`, no `os`
// and no module-level singleton, so the whole spec contract — including the
// Windows-relevant parts — is provable on the Linux CI runner. The describe/it
// titles are a CONTRACT with 05-VALIDATION.md, which addresses each row by
// `-t "<name>"` — renaming one silently unhooks a requirement from its
// verification.
```

**Conventions encoded:** (1) `import { describe, expect, it } from "vitest"` — never `test`, never a global; (2) a header stating why the literals make the win32 branch provable on Linux; (3) **the describe/it titles are a contract with `07-VALIDATION.md`** — the planner must say so in the plan.

**Assertion style** (`provider-launch.test.ts:33-40`) — `toEqual` on the full argv array. **There are zero snapshots in this repo; do not introduce one** (RESEARCH's "provider-launch-style snapshot tests" wording notwithstanding — the actual house form is `toEqual`):

```ts
    expect(args).toEqual([
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
```

**Descriptive `it` titles** (`platform.test.ts:26-42`) — titles state the *behaviour and its reason*, not the method name:

```ts
describe("getTempRoot", () => {
  it("strips the trailing backslash GetTempPath2 returns on Windows", () => {
  it("leaves an already-clean Linux tmpdir untouched", () => {
```

---

### `packages/backend/src/spawn-plan.win32.test.ts` (integration test, win32-gated)

**Analog:** `packages/backend/src/mcp-server-spec.spawn.test.ts` (the shared-production-builder shape and the caveat header) + `mcp-server.transport.test.ts` (the skeleton it was lifted from).

**Imports** (`mcp-server-spec.spawn.test.ts:1-10`) — the cross-platform real-spawn import set:

```ts
import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
```

**Shared-builder + vehicle-caveat header** (`mcp-server-spec.spawn.test.ts:12-40`) — copy this structure verbatim in shape; D-05 requires the caveat be written in this voice:

```ts
// D-08's integration proof, and the only place in this phase where the spec is
// executed rather than inspected. It imports the SAME `buildMcpServerSpec` that
// `index.ts` calls and spawns a real `node` ... deliberately no local
// re-derivation of `command`, `args` or `env`. A second copy of the
// spec-building logic inside this file would make the test agree with itself
// instead of with production, which is the whole point of sharing the builder.
//
// The skeleton (temp dir + `afterEach` rm, the loopback HTTP stub on an
// ephemeral port, the newline-drain loop, the timeout-plus-SIGKILL guard) is
// lifted from `mcp-server.transport.test.ts`, which already runs cross-platform
// via `os.tmpdir()` and `process.execPath`.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — read this before citing a green
// run of it. In Phase 3's vehicle-caveat voice, ...
```

**Temp-dir + cleanup pattern** (`mcp-server-spec.spawn.test.ts:70`, `mcp-server.transport.test.ts:25`):

```ts
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-spec-"));
```
paired with an `afterEach` `rm(dir, { recursive: true, force: true })`. Use `drift-spawn-plan-` as the prefix.

**Timeout constant pattern** (`mcp-server-spec.spawn.test.ts:41-49`) — one constant, with the Windows-slowness reasoning and the explicit rejection of retries:

```ts
// One constant, referenced by every case, so a future raise cannot apply to one
// of them only. 15 s rather than the transport test's 5 s because Windows
// runners are materially slower at process creation and Defender scans a
// freshly written script — the correct response to that is a bigger budget, not
// a retry, which would convert a real hang into a flake that passes on the
// second attempt.
const SPAWN_TIMEOUT_MS = 15000;
```

**GAP — no win32 gating precedent exists.** `grep -rn "skipIf\|runIf\|describe.skip" packages/backend/src/*.test.ts` returns **nothing**. Every existing test is unconditionally cross-platform. RESEARCH Q5 item 3 asks for `describe.skipIf(process.platform !== "win32")`; that is a **new convention this phase introduces**, and the plan should say so and carry a comment justifying it (CMP-01: the POSIX legs stay byte-identical). It is the one place in this phase where there is no analog to copy.

---

### `packages/shared/src/*` (D-04 capability flag + predicate) — config + pure predicate

**Analog A — the data table:** `packages/shared/src/cli-providers.ts` `PROVIDER_INSTALL_COMMANDS`. This is the closest existing "per-provider static table that reaches several surfaces" and its header states exactly the argument D-04 makes:

```ts
// Actionable install command per provider. This table lived in the backend's
// command-resolution module until now. It moved here because these strings reach
// THREE surfaces — the chat error banner, Settings → CLI Providers, and the
// frontend help panel — and were hand-copied into each one, ...
//
// Keyed by the CliProvider union above, not by bare string literals: that keying
// is what makes an omitted provider — or an omitted platform arm — a compile
// error rather than a runtime gap in a user-facing error message.
//
// The module stays DATA ONLY: no imports, no I/O. It is loaded by both Caido's
// constrained backend runtime and the browser frontend, and has to keep loading
// in both. Rendering lives in the backend's hint renderer and in the help panel.
export const PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands> = {
```

**Conventions encoded:** `Record<CliProvider, T>` keying (omission = compile error); a per-entry comment carrying the `[VERIFIED: <url>]` / `[CITED: …]` citation tag — which is exactly what D-05's per-CLI upstream citation requires, and where the gemini-cli PR #28863 "re-check here" note belongs; and the DATA-ONLY / no-imports rule (`packages/shared/src` must load in QuickJS *and* the browser).

**Analog B — the predicate:** `planMcpCliRegistration` (quoted above). If D-04 lands as a predicate rather than a bare record, use the `{kind: "…"} | {kind: "…"; reason}` union and the fail-closed-first branch order.

**Barrel export:** `packages/shared/src/index.ts` is a flat `export * from "./x"` list — add nothing if the flag lands in an already-exported module (`cli-providers.ts` and `mcp.ts` both are):

```ts
export * from "./cli-providers";
export * from "./messages";
export * from "./mcp";
export * from "./result";
export * from "./settings";
```

**Sensitive-tool source of truth** (`packages/shared/src/mcp.ts:36-60`) — Codex's fail-closed allowlist must be derived from `MCP_TOOL_DEFINITIONS`' `sensitive: true` entries, not a second hand-written list:

```ts
export const MCP_TOOL_DEFINITIONS = [
  { name: "send_request", label: "Send request", group: "replay", sensitive: true },
  { name: "set_environment", label: "Set environment", group: "environment", sensitive: true },
  ...
] as const satisfies ReadonlyArray<{ name: string; label: string; group: McpToolPermissionGroup; sensitive: boolean }>;
```

---

### `packages/backend/src/mcp-server-spec.ts` (MODIFY — registration payload + `formatMcpRemoveFailure`)

**Analog:** the same file's own exports.

**Registration payload:** extend `planMcpCliRegistration`'s union (quoted above). Its win32 arm currently returns the 05-D-03 Skip sentence; PRV-03 replaces it. Note the existing comment records *why* the sentence names the phase — the D-08 replacement sentences inherit that voice:

```ts
    // Names the provider in display casing AND names the phase: a Windows user
    // who reads "not yet supported ... (Phase 7)" learns this is sequenced work
    // rather than a dead end (D-03). The same sentence is surfaced in-product
    // through `skippedMcpCliReasons` and in the README.
    return {
      kind: "Skip",
      reason: `Drift MCP is not yet supported for ${MCP_CLI_DISPLAY_NAMES[input.cli]} on Windows (Phase 7).`,
    };
```

**Logging builder** (`mcp-server-spec.ts:217-243`) — the exact template for SC-3's `formatMcpRemoveFailure`. The load-bearing property is *structural*: **no parameter through which a value could arrive**:

```ts
// D-11's session-debug line. It takes key NAMES and has no parameter through
// which a value could arrive — that is the design, not a discipline anyone has
// to remember. `platform.ts:262` states the same rule at the merge point ...
//
// Rejected, and recorded here so it is not re-proposed: dumping the merged
// environment through a redaction regex. A regex over a whole environment fails
// OPEN — it protects only the keys someone thought to enumerate, and the keys
// nobody enumerated are exactly the ones a future variable will be added under.
export function formatSpawnDebugLine(input: {
  command: string;
  args: string[];
  injectedKeys: string[];
}): string {
  return [
    `spawn command=${input.command}`,
    `args=${JSON.stringify(input.args)}`,
    `injectedEnvKeys=${[...input.injectedKeys].sort().join(",")}`,
  ].join(" ");
}
```

`formatMcpRemoveFailure({ cli, scope, code })` — three scalars, no `stderr` parameter. That is Pitfall G's fix expressed as a signature.

**`${VAR}` guard to call, never re-derive** (`mcp-server-spec.ts:250-261`) — extend its *call sites* to the Gemini/Codex payloads:

```ts
export function findExpandableEnvKeys(
  driftVars: Record<string, string>,
): string[] {
  return Object.entries(driftVars)
    .filter(([, value]) => value.includes(EXPANSION_OPENER))
    .map(([key]) => key)
    .sort();
}
```

---

### `packages/backend/src/index.ts` (MODIFY — 4 spawn sites, startup sweep, SC-7 deletions)

**Section delimiter convention** (`index.ts:151, 248, 2033, 2580, …`) — ASCII box headers, padded to a fixed column with `─`:

```
// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────
// ── MCP server spec keystone ────────────────────────────────────────
// ── MCP registration helpers for Gemini/Codex ───────────────────────
```

The registration/sweep work belongs under the existing `// ── MCP registration helpers for Gemini/Codex ───` header at `:2580`; a new top-level section needs a new box header in this exact style.

**Result convention** (`index.ts:157-163`):

```ts
type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> {
  return { kind: "Ok", value };
}
function err<T>(error: string): Result<T> {
  return { kind: "Error", error };
}
```

Every RPC handler returns `Result<T>`; internal helpers (`registerMcpWithCli`, `unregisterMcpFromCli`) return bare `boolean`/`void` and never throw.

**Startup-sweep pattern — the direct sibling for Q4's stale-entry sweep** (`index.ts:2929-2958`). Copy the comment structure (what is being cleaned, why it is safe to run here, why each iteration gets its own try/catch) and the per-root isolation:

```ts
// Remove orphaned drift-mcp-* dirs left by a previous run that did not stop
// cleanly (crash, hard kill). Those dirs hold the token-bearing wrapper
// scripts, so leaking them is a credential-exposure risk. Safe to run here:
// startMcpServer is only entered when MCP is not already running, ...
//
// Each root gets its OWN try/catch, so a missing or unreadable legacy root
// cannot abort the sweep of the real one.
async function sweepOrphanedMcpTempDirs(
  sdk: BackendSDK,
  hostFacts: HostFacts,
): Promise<void> {
  for (const root of getSweepRoots(hostFacts)) {
    try {
      ...
    } catch (error) {
      sdk.console.error(`[drift] Failed to sweep orphaned MCP temp dirs in ${root}: ${String(error)}`);
    }
  }
}
```

**Convention encoded:** `sdk.console.error` with a `[drift] ` prefix; `.catch(() => undefined)` on best-effort per-item work; the sweep takes injected `hostFacts` rather than reading `os`.

**Registration site to modify** (`index.ts:2803-2827`) — both spawns, the `[drift] ` log line, and the Pitfall G `stderr` interpolation that must be decided on:

```ts
async function registerMcpWithCli(
  cli: "gemini" | "codex",
  cliBinary: string,
  mcpScript: string,
  sdk: BackendSDK,
): Promise<boolean> {
  // Best-effort pre-clean — an old "drift" entry in the CLI's config
  // is normal (previous Drift session); ignore its exit code.
  await spawnAndWait(cliBinary, ["mcp", "remove", "drift"]);
  const result = await spawnAndWait(cliBinary, [
    "mcp", "add", "drift", "--", mcpScript,
  ]);
  sdk.console.log(
    `[drift] ${cli} mcp add via ${cliBinary}: code=${result.code} ${result.stderr.trim()}`,
  );
  ...
  skippedMcpCliReasons.set(
    cli,
    `mcp add exited with code ${String(result.code)}: ${result.stderr.trim() || "no stderr"}`,
  );
```

**Module-level state convention** (`index.ts:2788-2801`) — `Map` singletons with a comment stating the lifetime:

```ts
// Tracks the resolved binary path that Drift used for each successful
// MCP registration in the current session. ...
const registeredMcpCliPaths = new Map<"gemini" | "codex", string>();
// Reasons each CLI was skipped during the last register attempt, for
// diagnostics surfacing. Written by tryRegisterMcpForProviders.
const skippedMcpCliReasons = new Map<"gemini" | "codex", string>();

type McpCliProviderId = "gemini-cli" | "codex-cli";
const MCP_CLI_TO_PROVIDER: Record<"gemini" | "codex", McpCliProviderId> = {
  gemini: "gemini-cli",
  codex: "codex-cli",
};
```

`skippedMcpCliReasons`' comment says "for diagnostics surfacing" — D-08 widens that; **update the comment when the map's meaning widens**, since it is the only place the map's contract is written down.

**Spawn-site pattern PRV-02 replaces — provider launch** (`index.ts:3719-3727`). Note `buildSpawnEnv` is already the merge point; `buildSpawnPlan` slots between `resolved`/`args` and `spawnWithEnv`:

```ts
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawnWithEnv(resolved, args, {
          env: buildSpawnEnv({
            parentEnv: readParentEnv(),
            driftVars: injectedDriftVars,
          }),
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (e) {
        const message = `Spawn error: ${String(e)}`;
```

**Spawn-site pattern — `spawnAndWait`** (`index.ts:2618-2650`). Its comment block already names PRV-02 as the owner of the seam and enumerates what is *deliberately absent* — the plan should replace that "deliberately absent" paragraph, not leave it contradicting the new code:

```ts
    // What this guard does NOT do, stated plainly: it does not make a `.cmd`
    // launchable. A `.cmd` Windows refuses now resolves as exit code 1, which the
    // node validation loop reads as "not a working executable" and steps past -
    // graceful degradation, not launchability. Making a `.cmd` actually launch is
    // PRV-02 in Phase 7, which owns the cmd.exe branch; this token is here so
    // PRV-02 can find the seam by search rather than re-inventorying every spawn
    // in this file. ...
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc =
        options?.env === undefined
          ? spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] })
          : spawnWithEnv(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env });
```

**Greppable-key convention that constrains how `windowsVerbatimArguments` is passed** (`index.ts:2044-2062` + `:2616`) — options are written as explicit literal object keys, never a conditional spread, because a static gate greps for them:

```ts
type SpawnWithEnv = (
  command: string,
  args: string[],
  options: Record<"env", Record<string, string>> & {
    stdio: ["pipe", "pipe", "pipe"];
  },
) => ChildProcessWithoutNullStreams;
const spawnWithEnv = spawn as unknown as SpawnWithEnv;
```

> "The forwarding is written as two explicit spawn calls rather than a conditional spread so that `env: options.env` survives as a greppable object KEY: the phase gate asserts every env handed to a child process is `spec.env`, `buildSpawnEnv(...)` or this forwarded value, and a spread would hide it."

**Convention encoded:** the `SpawnWithEnv` type must be widened to carry `windowsVerbatimArguments`, and the option must appear as a literal key at each call site — not spread from the plan object — or Phase 5's static gate stops matching. RESEARCH's own gate proposal ("no `spawnWithEnv(`/`spawn(` call in `index.ts` passes a raw resolved command") is the same class of control.

**Provider-status producer D-08 must extend** (`index.ts:1778-1799`) — where the reason sentence has to be merged in:

```ts
async function checkProvider(
  id: string,
  options?: { bypassCache?: boolean },
): Promise<ProviderStatus> {
  const config = currentSettings.providers[id];
  if (!config?.enabled || !config?.command) {
    return { id, available: false, error: "Disabled" };
  }
  const resolved = await resolveCommand(config.command, options);
  if (resolved === undefined) {
      return { id, available: false, error: isAbsolutePath({ ... }) ? ... : ... };
    }
    return { id, available: true, resolvedPath: resolved };
}
```

Note `ProviderStatus` (`packages/shared/src/cli-providers.ts`) is `{ id, available, resolvedPath?, error? }`. **A registered-but-limited provider is `available: true`** — so the D-08 sentence cannot ride `error` without turning the dot red. That is a shared-type decision the planner must make explicitly (add an optional field vs reuse `error`).

---

### `packages/frontend/src/views/SettingsView.vue` (component, D-08 + UX-01)

**Analog:** the adjacent blocks in the same file, `SettingsView.vue:329-335`:

```vue
          <div class="flex items-center gap-2">
            <label class="text-xs text-surface-400 w-16">Command:</label>
            <InputText
              :modelValue="store.settings.providers[pid]?.command ?? ''"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateProviderCommand(pid, (e.target as HTMLInputElement).value)"
            />
          </div>
          <div v-if="getStatus(pid)?.resolvedPath !== undefined" class="mt-1 text-xs text-surface-400">
            {{ getStatus(pid)?.resolvedPath }}
          </div>
          <div v-if="getStatus(pid)?.error !== undefined" class="mt-1 text-xs text-red-400">
            {{ getStatus(pid)?.error }}
          </div>
```

**Conventions encoded:** `v-if="getStatus(pid)?.X !== undefined"` (explicit `!== undefined`, never truthiness); `class="mt-1 text-xs text-surface-{400}"` for neutral info, `text-red-400` for errors — the D-08 limitation sentence is *neither* (the provider is available), so it wants a third, warning-toned class (`text-amber-400` in this palette) added as a fourth sibling `div`. The UX-01 hint is a `placeholder` attribute on the existing `InputText` — no new element, no validator (RESEARCH Q5 recommends against frontend validation).

---

### `README.md` (D-08 line)

**Analog:** `README.md:43-44` — the provider table rows that already carry the 05-D-03 sentence:

```
| Gemini CLI | No | Yes (registered wrapper) | **Experimental** — text output, mutates `~/.gemini/settings.json` on start/stop. Drift MCP is not yet supported for Gemini on Windows (Phase 7). |
| Codex CLI | No | Yes (pre-registered via `codex mcp add`) | **Experimental** — text output, thin wiring. Drift MCP is not yet supported for Codex on Windows (Phase 7). |
```

**Convention encoded:** the limitation is one sentence appended to the provider's existing table cell, in the same voice as the in-product `skippedMcpCliReasons` string. Both rows' "(Phase 7)" clauses are now *satisfied* and must be replaced, not merely appended to — Codex gains the fail-closed sentence, Gemini loses the caveat. `README.md:38` is the prose paragraph where Q4's "after a crash a `drift` entry may persist in `~/.gemini`/`~/.codex`" note belongs.

---

## Shared Patterns

### The pure-module purity contract
**Source:** `platform.ts:1-16`, `mcp-server-spec.ts:1-24`
**Apply to:** `spawn-plan.ts`, the shared-package D-04 predicate
Every pure module opens with (a) a mechanically-checkable claim (`grep -c '^import'` returns N), (b) *why* it is not in `index.ts` (index.ts is un-importable under vitest; the maintainer cannot test native Windows), and (c) an explicit "deliberately NOT imported" list with a reason per omission. A new pure module without this reads as foreign.

### Comments record the rejected alternative
**Source:** `mcp-server-spec.ts:222-227` ("Rejected, and recorded here so it is not re-proposed: dumping the merged environment through a redaction regex. A regex over a whole environment fails OPEN — …"), `platform.ts:23-25` ("D-01 also offered a `createPlatformProfile()` aggregate descriptor and rejected it: …")
**Apply to:** every non-obvious choice in this phase — `cross-spawn` declined, `${CAIDO_TOKEN}` vs literal for Gemini, site 3′ left degrading, no shim-parsing.
The convention is the *reason* plus the *failure mode*, not just the verdict.

### Fail closed on an unknown, non-happy branch first
**Source:** `mcp-server-spec.ts:181-199`, `platform.ts:28-45` (`normalizePlatform`)
**Apply to:** D-04's capability predicate, `buildSpawnPlan`'s `platform: undefined` arm.
`undefined` never falls through to the POSIX arm; the branch ORDER is stated as part of the contract.

### CMP-01 byte-identity on the POSIX arm
**Source:** `platform.ts:600-611` (`rankPathSearchHits`)
**Apply to:** `buildSpawnPlan` — the `platform !== "win32"` arm (including `undefined`) returns `{ file: command, args, windowsVerbatimArguments: false }` and is asserted with `toEqual`, not assumed (Pitfall F).

### Key names, never values, in anything user- or log-facing
**Source:** `mcp-server-spec.ts:217-243` (`formatSpawnDebugLine`), `platform.ts:610` ("returns data only and must never be used to render an environment into a log or diagnostic (T-04-04)")
**Apply to:** `formatMcpRemoveFailure`, and the Pitfall G decision on `index.ts:2825-2828`'s `result.stderr` interpolation.
Enforce structurally (no parameter can carry a value), not by discipline.

### `[VERIFIED: …]` / `[CITED: …]` citation tags inside source comments
**Source:** `cli-providers.ts` `PROVIDER_INSTALL_COMMANDS` entries
**Apply to:** the D-04 capability flag's per-CLI entries — this is where D-05's per-CLI upstream citation and the gemini-cli PR #28863 "re-check here" note live.

### `Record<Union, T>` keying so an omission is a compile error
**Source:** `cli-providers.ts` (`Record<CliProvider, …>`), `index.ts:2797` (`Record<"gemini" | "codex", McpCliProviderId>`)
**Apply to:** the D-04 flag table.

### Test-file header as a contract with the VALIDATION doc
**Source:** `platform.test.ts:18-24`, `mcp-server-spec.test.ts:12-18`
**Apply to:** all three new/extended test files. Titles are addressed by `-t "<name>"` from `07-VALIDATION.md`; renaming one silently unhooks a requirement.

---

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| win32 gating in a test file (`describe.skipIf(process.platform !== "win32")`) | test | — | **No precedent.** `grep -rn "skipIf\|runIf\|describe.skip" packages/backend/src/*.test.ts` returns nothing; every existing test runs unconditionally on all legs. This phase introduces the convention — the plan should say so and justify it (CMP-01: POSIX legs stay byte-identical). |
| A fixture `.cmd` argument-echo shim | test fixture | file-I/O | No fixture *files* exist in the repo; every test writes what it needs into an `os.tmpdir()` `mkdtemp` dir at runtime (`mcp-server-spec.spawn.test.ts:70`, `command-resolution.test.ts:77`). Follow that — write the `.cmd` at runtime, do not commit a fixture file. |
| The cmd.exe escaping algorithm itself | utility | transform | Nothing in the repo escapes for a shell (`shellQuote` at `index.ts:1041` is POSIX single-quote and is being DELETED by SC-7). The source is cross-spawn's `lib/util/escape.js`, ported verbatim under MIT attribution — RESEARCH Q3 quotes it in full. |
| A `ProviderStatus` field for "available but limited" | model | — | `ProviderStatus` (`packages/shared/src/cli-providers.ts`) has only `available`/`resolvedPath`/`error`; there is no third, non-error advisory channel. Extending it is a new shape, not a copy. |

---

## Metadata

**Analog search scope:** `packages/backend/src/`, `packages/shared/src/`, `packages/frontend/src/views/`, `README.md`
**Files scanned:** 36 source + test files enumerated; 9 read in depth
**Pattern extraction date:** 2026-08-21
