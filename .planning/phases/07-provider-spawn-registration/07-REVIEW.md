---
phase: 07-provider-spawn-registration
reviewed: 2026-08-22T16:07:37Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - packages/backend/assets/mcp-server.mjs
  - packages/backend/src/index.ts
  - packages/backend/src/mcp-server-spec.ts
  - packages/backend/src/mcp-server-spec.test.ts
  - packages/backend/src/mcp-server-spec.spawn.test.ts
  - packages/backend/src/spawn-plan.ts
  - packages/backend/src/spawn-plan.test.ts
  - packages/backend/src/spawn-plan.win32.test.ts
  - packages/frontend/src/stores/settings.ts
  - packages/frontend/src/stores/settings.test.ts
  - packages/frontend/src/views/SettingsView.vue
  - packages/shared/src/cli-providers.ts
  - packages/shared/src/cli-providers.test.ts
  - packages/shared/src/mcp.ts
  - README.md
findings:
  critical: 1
  warning: 8
  info: 7
  total: 16
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-08-22T16:07:37Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Where the phase is genuinely clean, briefly, so the findings below are read in
proportion:

- **The cross-spawn port is byte-correct.** I rebuilt `META_CHARS_REG_EXP` from
  `CMD_META_CHARACTERS` in a scratch Node process and diffed its output against
  upstream's literal `/([()\][%!^"`<>&|;, *?])/g` over a probe string carrying
  every metacharacter plus a backslash run and a hyphen — byte-identical.
  `escapeCmdArgument` and `escapeCmdCommand` are character-for-character upstream
  v7.0.6, including the two backtracking-safe backslash regexes and the
  no-`g`-flag on the second. `grep -cE '^import'` returns 1 as claimed.
- **`shell: true` appears nowhere.** No `shell` option exists at any spawn site in
  the backend.
- **The POSIX arm is a true passthrough.** `buildSpawnPlan` returns
  `{file: command, args: [...args], windowsVerbatimArguments: false}` for
  `darwin`, `linux` and `undefined`, with a copied argv. CMP-01 holds.
- **Deletion is complete.** `renderExportExecScript`, `shellQuote`,
  `writeMcpWrapper` and `getMcpWrapperPath` have no surviving references
  anywhere in `packages/` (the frontend's `shellQuote` in `http-parse.ts` is an
  unrelated curl-export helper; `enforceOwnerOnlyDir`'s namespace `chmod` is
  correctly retained). `rename` was dropped from the `fs/promises` import.
  Stale comments were rewritten rather than left.
- **Token-in-log discipline holds at the new sites.** `registerMcpWithCli` no
  longer interpolates `result.stderr`; `formatMcpRemoveFailure`,
  `formatSpawnDebugLine` and `planMcpCliRegistration`'s skip reasons are
  structurally value-free (no parameter through which text can arrive).
  `getDiagnostics`' new `mcpCliRemovalFailures` field carries scalars only.
- **Prototype-chain fail-closed is real and tested.** `isCliProvider` uses
  `Object.values(...).includes(...)`, and `cli-providers.test.ts:119-124` drives
  `__proto__`, `constructor`, `toString`. I found no remaining `in`/bracket
  lookup on a caller-supplied key anywhere in the diff.
- **Empty-allowlist-means-deny-all holds.** `DRIFT_ALLOWLIST_ACTIVE: "1"` is
  unconditional in `buildMcpDriftVars` and is never stripped by
  `buildMcpCliRegistrationEnv`; `getAvailableTools` (`mcp-server.mjs:612-615`)
  only falls back to the full set when the flag is absent.

The defects cluster in three places: the interpreter is resolved by bare name
rather than by absolute path (CR-01); the phase's headline safety predicate for
the Gemini `${CAIDO_TOKEN}` decision cannot fire in production and its comment
describes the wrong environment (WR-01/WR-02); and the credential-removal
machinery has three gaps between what its own comments/README promise and what
the code does (WR-03/WR-04/WR-05).

## Critical Issues

### CR-01: `cmd.exe` is spawned by bare name — untrusted search path on the one branch that carries a live Caido token

**File:** `packages/backend/src/spawn-plan.ts:86`, `packages/backend/src/spawn-plan.ts:309-312`
**Call sites:** `packages/backend/src/index.ts:2898`, `:2925`, `:3085`, `:3174`, `:3824`

**Issue:** `buildSpawnPlan` declares a `comspec?: string` parameter and falls back
to `DEFAULT_COMSPEC = "cmd.exe"` — a *bare filename*, not a path. **No production
call site passes `comspec`.** All five sites call
`buildSpawnPlan({ command, args, platform })`, so the interpreter is always the
literal `"cmd.exe"`, resolved by the OS search order.

On Windows, `CreateProcess` with a bare application name searches the
application directory and **the current working directory** before `%PATH%`
(libuv's `uv__search_path` reproduces this; Rust's `std::process::Command`, which
Caido's LLRT uses, passes `lpApplicationName = NULL` and inherits the same
order). Caido's plugin host chooses that cwd — Drift does not. A `cmd.exe`
planted there is executed instead of the system one, and this is the exact
branch that spawns:

- the provider CLI with `buildSpawnEnv(...)` in its environment, and
- `codex mcp add ... --env CAIDO_TOKEN=<literal token>` on its argv.

Upstream cross-spawn — which this module explicitly ports and which the header
quotes verbatim (`process.env.comspec || 'cmd.exe'`) — reads the environment for
exactly this reason. The port kept the fallback and dropped the read, and the
comment at `spawn-plan.ts:84-85` says so ("the environment read is the caller's
job here") while no caller ever does it. That makes `comspec` a dead parameter
whose absence is a security regression against the algorithm being ported.

**Fix:** read `COMSPEC` at the I/O boundary (`index.ts`, via the existing
`readParentEnv()`), validate it is absolute, and pass it at all five call sites.
Keep the bare-name literal only as a last resort.

```ts
// index.ts — one helper beside readParentEnv(), used at all five sites.
function getComspec(): string | undefined {
  const env = readParentEnv();
  // COMSPEC is the documented spelling; cmd.exe also exports `ComSpec`.
  const value = (env.COMSPEC ?? env.ComSpec ?? "").trim();
  // Absolute only: a relative COMSPEC re-opens the same search-order hole.
  return isAbsolutePath({ value, platform: host?.platform }) ? value : undefined;
}

const spawnPlan = buildSpawnPlan({
  command: resolved,
  args,
  platform: host?.platform,
  comspec: getComspec(),
});
```

`buildSpawnPlan` already handles `comspec === undefined`/`""` correctly, so no
change is needed in the pure module. Add a `spawn-plan.test.ts` case asserting
that an absolute injected comspec is used verbatim (one exists at
`spawn-plan.test.ts:169`; it just has no production caller to protect).

## Warnings

### WR-01: The Gemini `${CAIDO_TOKEN}` "loud check" is unreachable in production

**File:** `packages/backend/src/mcp-server-spec.ts:252-264`, `packages/backend/src/index.ts:3049`

**Issue:** The guard that 05-D-10's reopening rests on is:

```ts
MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli] &&
input.registrationEnv[CAIDO_TOKEN_KEY] === CAIDO_TOKEN_REFERENCE &&
(input.spawnEnvToken ?? "").trim() === ""
```

`spawnEnvToken` is fed `spec.env.CAIDO_TOKEN` (`index.ts:3049`).
`spec` comes from `requireMcpServerSpec`, which returns
`err(NO_CAIDO_TOKEN_MESSAGE)` when `getEffectiveCaidoToken() === ""`
(`index.ts:2020-2021`) — *before* the spec is constructed. `buildSpawnEnv`
(`platform.ts:617-624`) then overlays `driftVars` verbatim, so
`spec.env.CAIDO_TOKEN` is always exactly that non-empty token. **The third
clause can therefore never be true on any code path.**

The unit tests do not catch this because they supply the value synthetically:
`mcp-server-spec.test.ts:524` iterates `[undefined, "", "   "]` into
`spawnEnvToken` directly. The predicate is proven; its reachability is not.

**Fix:** point the check at the environment the CLI child actually receives, and
build that environment once. Either hoist the provider-child env construction so
registration can read it, or — cheaper and honest — assert the invariant instead
of pretending to test it:

```ts
// index.ts, tryRegisterMcpForProviders
// The registration reference expands from the env `sendCliMessage` gives the
// CLI child, NOT from spec.env. Pass that, or state why they cannot diverge.
spawnEnvToken: buildSpawnEnv({
  parentEnv: readParentEnv(),
  driftVars: spec.driftVars,
}).CAIDO_TOKEN,
```

### WR-02: Comment contradicts the code — `spec.env` is not the CLI child's environment

**File:** `packages/backend/src/index.ts:3046-3048`

**Issue:**

```ts
// The loud check's input. `spec.env` is the parent-merged block Drift
// hands the CLI child, so this is exactly the value a `${CAIDO_TOKEN}`
// reference would expand from at spawn time.
```

`spec.env` is built by `buildMcpServerSpec` (`mcp-server-spec.ts:115-150`) and is
the block handed to the **MCP server** `node` process (`callMcpMethod`,
`index.ts:2113-2128`). The **CLI child**'s block is built independently in
`sendCliMessage` (`index.ts:4071-4075`) from
`buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars })`,
where `injectedDriftVars = runtimeFiles === undefined ? {} : runtimeEnv`
(`index.ts:3804-3805`). The two are different objects built at different times,
and they diverge structurally whenever `runtimeFiles === undefined` — at which
point the CLI child carries **no** `CAIDO_TOKEN` at all and gemini expands the
reference to `""`.

Given the house rule that a comment contradicting the code is a real finding,
and that this comment is the sole justification for WR-01's guard shape, it must
be corrected together with WR-01.

**Fix:** rewrite the comment to name `buildMcpServerSpec` as the source and state
plainly which environment gemini expands from, or make the code match the comment
per WR-01.

### WR-03: A failed `mcp remove` is silently erased from the provider card when `mcp add` also fails

**File:** `packages/backend/src/index.ts:2967-2972`

**Issue:** The success branch goes to deliberate lengths to preserve the security
line ("Deleting the reason unconditionally here would erase the security line
written moments earlier in this same function — a silent wipe of the one message
SC-3 exists to deliver", `index.ts:2946-2951`). The failure branch two lines
later does exactly that:

```ts
skippedMcpCliReasons.set(
  cli,
  `Drift could not register with this CLI: "mcp add" exited with code ${String(result.code)}.`,
);
```

Sequence: pre-clean of `scope=project` fails (a stale entry holding a live token
survives) → `mcp add` also fails → the card shows only "could not register", and
the user is never told a credential may remain. `mcpCliRemovalFailures` still
holds it, but that reaches only the diagnostics bundle — the surface 05-D-03
explicitly rejected as sufficient.

**Fix:** compose rather than overwrite.

```ts
const outstanding = mcpCliRemovalFailures.get(cli);
const scope = [...(outstanding?.keys() ?? [])][0];
const exitCode = scope === undefined ? undefined : outstanding?.get(scope);
const addLine = `Drift could not register with this CLI: "mcp add" exited with code ${String(result.code)}.`;
skippedMcpCliReasons.set(
  cli,
  scope !== undefined && exitCode !== undefined
    ? `${addLine} ${formatMcpRemoveFailure({ cli, scope, exitCode })}`
    : addLine,
);
```

### WR-04: The "unconditional" startup sweep carries two undocumented gates, leaving a plaintext token behind indefinitely

**File:** `packages/backend/src/index.ts:3133-3142` (comment), `packages/backend/src/index.ts:3156-3167` (code), `README.md:47`

**Issue:** The comment enumerates four gates the sweep deliberately does **not**
carry and calls itself UNCONDITIONAL. The code carries two gates it does not
mention:

```ts
const command = providerConfig?.command;
if (command === undefined || command === "") continue;   // gate 5
const resolved = await resolveCommand(command);
if (resolved === undefined) { /* skip reason */ continue; } // gate 6
```

The README states the stronger promise: *"The next Drift start sweeps both CLIs
unconditionally — every scope Drift has ever written, before it registers
anything — so the leftover entry is removed then."*

The gap is concrete and is the highest-value case the sweep exists for: Drift is
hard-killed while Codex is registered → the user uninstalls, renames or moves the
`codex` binary (or clears the command field) → `resolveCommand` returns
`undefined` on every subsequent start → `~/.codex/config.toml` keeps a **literal
Caido session token** forever, outside `%TEMP%`, outside the ACL baseline, and
outside `sweepOrphanedMcpTempDirs`. The skip reason written at `index.ts:3164`
never renders either, because `checkProvider` short-circuits an unresolvable
command to `capability: "unavailable"` before `applyProviderLimitation` runs.

**Fix:** at minimum, correct the comment and the README to state the residual.
Better: when the sweep cannot resolve the CLI *and* Codex is the CLI, surface the
residual on a channel the user sees, e.g.

```ts
if (resolved === undefined) {
  sdk.console.error(
    `[drift] ${cli} could not be resolved, so a Drift MCP entry that may hold a ` +
    `Caido session token was not removed. Remove it with: ` +
    MCP_CLI_REMOVE_REMEDIATION[cli][MCP_CLI_WRITE_SCOPE[cli]]
  );
  continue;
}
```

### WR-05: `classifyMcpRemoveExit` cannot tell "removal failed" from "this CLI has no such command", producing a permanent false security banner

**File:** `packages/backend/src/mcp-server-spec.ts:656-661`, `packages/backend/src/index.ts:3186-3197`

**Issue:** `classifyMcpRemoveExit` is `exitCode === 0 ? "removed-or-absent" : "failed"`,
and `"failed"` goes straight to `formatMcpRemoveFailure` → `sdk.console.error` **and**
`skippedMcpCliReasons` → the provider card. Every non-zero exit is treated as
"a credential may remain", including:

- a `gemini` old enough not to accept `--scope` on `mcp remove` (yargs exits
  non-zero on an unknown option),
- a CLI with no `mcp remove` subcommand at all,
- `spawnAndWait`'s **synthetic** `code: 1` for a spawn that threw or emitted
  `error` (`index.ts:2612-2620`, `:2660-2666`) — i.e. an EINVAL/ENOENT, not a
  removal outcome at all.

Because `sweepStaleMcpCliRegistrations` runs unconditionally at every MCP start,
any of these produces the "SECURITY: … token may remain" line on **every** start.
The function's own docblock names this outcome as the thing to prevent: *"a
warning that fires on every start teaches the user to ignore the one message that
matters, which would defeat SC-3's whole point."* The verified-source backstop
only covers the case upstream keeps behaving as read.

**Fix:** distinguish "the removal ran and failed" from "the removal could not run"
by threading the spawn outcome, not just the code:

```ts
export type McpRemoveOutcome = "removed-or-absent" | "failed" | "unusable";

export function classifyMcpRemoveExit(input: {
  cli: McpCliName;
  exitCode: number;
  spawnFailed: boolean;      // spawnAndWait's synthetic code-1 paths
}): McpRemoveOutcome {
  if (input.spawnFailed) return "unusable";
  return input.exitCode === 0 ? "removed-or-absent" : "failed";
}
```

and have `spawnAndWait` return a discriminator (e.g. `{ code, spawned: boolean }`)
so a spawn that never started is not reported as a credential leak. Only `"failed"`
should reach `formatMcpRemoveFailure`.

### WR-06: An empty `CAIDO_TOKEN` would register Codex with no token at all — silently unauthenticated, with no fail-closed guard in the pure layer

**File:** `packages/backend/src/mcp-server-spec.ts:544-554`, `packages/backend/src/mcp-server-spec.ts:252-264`

**Issue:** `buildMcpCliRegistrationArgv` drops any pair whose value is `""`:

```ts
if (value === "") continue;
flagPairs.push(MCP_CLI_ENV_FLAG[input.cli], `${key}=${value}`);
```

`buildMcpCliRegistrationEnv` sets `payload[CAIDO_TOKEN_KEY] = input.caidoToken`
for Codex with no emptiness check. So `caidoToken === ""` yields a `codex mcp add`
argv with **no `CAIDO_TOKEN` at all** — `mcp-server.mjs` defaults it to `""` and
starts unauthenticated. That is precisely the failure mode 05-D-10 rejected and
that `planMcpCliRegistration`'s loud check exists to prevent — but the loud check
is gated on `MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli]`, so it never runs for
Codex.

Today this is unreachable only because of an invariant in an untestable file
(`requireMcpServerSpec`, `index.ts:2020-2021`). The phase's own stated design
principle is that a decision made inside `index.ts` is unverifiable by
construction; this safety property is exactly such a decision.

**Fix:** make the pure layer refuse, symmetrically with the Gemini arm:

```ts
// planMcpCliRegistration, before the register arm and after the expansion checks
if ((input.registrationEnv[CAIDO_TOKEN_KEY] ?? "").trim() === "") {
  return {
    kind: "Skip",
    reason: `Drift did not register with ${MCP_CLI_DISPLAY_NAMES[input.cli]} CLI: the registration would carry no ${CAIDO_TOKEN_KEY}, so the MCP server would start authenticated as nobody.`,
  };
}
```

with a `mcp-server-spec.test.ts` case per CLI.

### WR-07: The D-05 "Drift's half" test asserts on the wrong environment

**File:** `packages/backend/src/mcp-server-spec.spawn.test.ts:357-420`

**Issue:** The new `describe("mcp-server-spec per-session channel (D-05, Drift's half)")`
block claims to prove that "Drift *supplies* the variables" to the CLI child. It
asserts on `buildMcpServerSpec(...).env` — the environment of the **MCP server
node process**, not the environment of the **provider CLI**. D-02's whole
inheritance argument is about the CLI child, whose environment is assembled in
`sendCliMessage` (`index.ts:4071-4075`) from `buildMcpRuntimeEnv` +
`buildSpawnEnv` with `injectedDriftVars` — a composition this test never
exercises, and which contains the one branch that can drop the keys
(`runtimeFiles === undefined ? {} : runtimeEnv`, `index.ts:3804-3805`).

The vehicle caveat at the top of the block covers "the CLI's half"; it does not
cover this substitution. As written, a refactor that broke `injectedDriftVars`
would leave this test green.

**Fix:** either extract the provider-child env composition into a pure helper
(`buildProviderSpawnEnv({ parentEnv, runtimeEnv, hasRuntimeFiles })`) and assert
on that — including the `hasRuntimeFiles: false` case, which is the branch that
discriminates — or narrow the block's title and comment to say it proves the MCP
server's env only, and record the provider-child env as untested.

### WR-08: Nothing asserts the win32-gated suite actually ran on the Windows CI leg

**File:** `.github/workflows/ci.yml:202-204`, `packages/backend/src/spawn-plan.win32.test.ts:161`

**Issue:** `spawn-plan.win32.test.ts` is the *only* evidence for PRV-01/PRV-02's
escaping contract, and it is gated by
`describe.skipIf(process.platform !== "win32")`. The Windows leg runs a bare
`pnpm exec vitest run` with no assertion about which files executed. If the
filename drifts out of the default include glob, the `skipIf` predicate is
inverted by a refactor, or the file is moved under an excluded path, the leg
stays **green with zero Windows coverage** — the "suite that silently skips
everywhere" failure the file's own header (lines 27-33) says it is guarding
against.

The linux legs already report these 5 as skipped, so a per-run skip count is not
a usable signal on its own; the assertion has to be Windows-side.

**Fix:** make the Windows leg assert the file ran, e.g.

```yaml
      - name: Test
        shell: bash
        run: pnpm exec vitest run

      # The win32-gated suite is the only evidence for PRV-02's escaping. Assert
      # it EXECUTED here; a green run with it skipped is a false green.
      - name: 'Gate: the win32 spawn-plan suite actually ran'
        shell: bash
        run: |
          pnpm exec vitest run packages/backend/src/spawn-plan.win32.test.ts \
            --reporter=json --outputFile=win32-report.json
          node -e "
            const r = require('./win32-report.json');
            const n = r.numPassedTests ?? 0;
            if (r.numPendingTests > 0 || n < 5) {
              console.error('win32 suite skipped or under-ran: ' + JSON.stringify({n, pending: r.numPendingTests}));
              process.exit(1);
            }
          "
```

## Info

### IN-01: A console-log-shaped string is rendered verbatim as UI copy

**File:** `packages/backend/src/mcp-server-spec.ts:700-715`, `packages/frontend/src/views/SettingsView.vue:361-363`
**Issue:** `formatMcpRemoveFailure` returns `"[drift] SECURITY: gemini mcp remove (scope=user) exited 1 — …"`.
That whole string, `[drift]` prefix included, is written into `skippedMcpCliReasons`
and rendered in the Settings → CLI Providers card. D-08 requires these sentences
to read as product copy; a log prefix in the UI is the tell that one channel's
format was reused for two audiences.
**Fix:** split the renderer — `formatMcpRemoveFailureLog()` keeping the `[drift] `
prefix for `sdk.console.error`, and `formatMcpRemoveFailureNotice()` without it
for the map. Both derived from one body so they cannot diverge.

### IN-02: `MCP_CLI_REGISTRATION_SCOPES.codex` is dead

**File:** `packages/backend/src/mcp-server-spec.ts:447-450`, `packages/backend/src/mcp-server-spec.ts:575-583`
**Issue:** `buildMcpCliRegistrationArgv`'s Codex branch never spreads
`MCP_CLI_REGISTRATION_SCOPES.codex` (only the gemini branch reads its member at
`:564`). The record's stated purpose — making "a scope Drift writes is always a
scope Drift removes" structural — therefore holds for Gemini only; Codex's
member is an unread constant.
**Fix:** spread it in the Codex branch for symmetry (`[]` today, so the argv is
unchanged), which is what makes a future Codex scope flag automatically correct.

### IN-03: `classifyMcpRemoveExit`'s `cli` parameter is never read, and the comment says otherwise

**File:** `packages/backend/src/mcp-server-spec.ts:648-661`
**Issue:** The docblock states *"Its inputs are the exit code and the CLI"*, but
`input.cli` is not referenced in the body. `planMcpCliRemoval` handles the
identical situation correctly by declaring the omission out loud (`platform` is
accepted and DELIBERATELY not read, `:610-615`); this one does not.
**Fix:** add the same one-line "accepted and deliberately not read, so a
per-CLI classification has to be added on purpose" note.

### IN-04: `skippedMcpCliReasons` and `mcpCliRemovalFailures` are never cleared on runtime teardown

**File:** `packages/backend/src/index.ts:3213-3238`
**Issue:** `cleanupMcpRuntime` clears `mcpTempDir`, `registeredMcpCliPaths` (via
`unregisterMcpFromCli`) and the auth state, but leaves both new maps populated.
After MCP is stopped, the provider card keeps showing "Drift could not register
with this CLI…" / the security line for a runtime that no longer exists, and the
diagnostics bundle reports failures from a dead run.
**Fix:** clear both maps at the end of `cleanupMcpRuntime`, or gate
`applyProviderLimitation`'s source-2 read on `mcpTempDir !== undefined`.

### IN-05: The command-field placeholder shows a Windows path on every platform

**File:** `packages/frontend/src/views/SettingsView.vue:163-171`
**Issue:** `getCommandPlaceholder` always renders
`"claude — or a full path, e.g. C:\Users\you\AppData\Roaming\npm\claude.cmd"`.
macOS and Linux users — the entire current user base per CMP-01 — get a Windows
example. The comment justifies the absence of a validator, not the absence of a
platform arm; `PROVIDER_INSTALL_COMMANDS` (`cli-providers.ts:53`) already proves the shared package carries
a `posix`/`win32` split.
**Fix:** key the example off the same platform signal the install hint uses, or
drop the path example and keep only the bare command.

### IN-06: `DIRECTLY_SPAWNABLE_EXTENSIONS` omits `.com`, diverging silently from the port

**File:** `packages/backend/src/spawn-plan.ts:92`
**Issue:** Upstream cross-spawn's discriminator is `/\.(?:com|exe)$/i`; the port
uses `[".exe"]`. Harmless today because `WINDOWS_EXECUTABLE_EXTENSIONS`
(`platform.ts:303`) never emits `.com`, but the module's header lists exactly two
deliberate divergences from upstream and this is an undeclared third.
**Fix:** either add `.com` or record it as a third declared divergence with the
reason (the resolver cannot produce one).

### IN-07: An extension-less Windows command takes the direct-spawn arm, unlike upstream

**File:** `packages/backend/src/spawn-plan.ts:272-284`
**Issue:** `if (!isInterpreted) return { file: command, … }` sends a Windows
command with *no* extension straight to `spawn`. Upstream cross-spawn shells
anything that is not `.com`/`.exe`. `getExecutableNames` (`platform.ts:330-337`)
does emit the bare name as a final fallback, so `resolveCommand` can return one;
`CreateProcess` then appends only `.exe`, and a machine whose only install is
`claude.cmd` reached this way fails with ENOENT rather than launching.
**Fix:** the comment at `:277-281` claims "a command with no extension at all:
nothing for cmd to interpret" — which is the opposite of upstream's reasoning.
Either route the extension-less case through `cmd.exe` (upstream's behaviour) or
state why Drift's resolver guarantees an extension in practice.

---

_Reviewed: 2026-08-22T16:07:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
