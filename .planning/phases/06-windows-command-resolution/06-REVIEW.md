---
phase: 06-windows-command-resolution
reviewed: 2026-08-21T14:45:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - packages/backend/src/platform.ts
  - packages/backend/src/platform.test.ts
  - packages/backend/src/command-resolution.ts
  - packages/backend/src/command-resolution.test.ts
  - packages/backend/src/index.ts
  - packages/backend/src/runtime-probe.ts
  - packages/shared/src/cli-providers.ts
  - packages/frontend/src/views/HelpView.vue
  - README.md
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-08-21T14:45:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Verification baseline: `pnpm typecheck` clean, `pnpm lint` clean (`--max-warnings 0`),
`vitest run` 408/408 green. The pure-helper split (`buildCommandCandidatePaths` /
`buildNodeCandidatePaths`) is genuinely I/O-free — grep for `await`/`stat(`/`readdir(` inside
both bodies returns nothing — and the CMP-01 blocks assert whole ordered arrays with `toEqual`
rather than `toContain`, which is the right shape for that evidence.

I independently re-derived the D-05 byte-identity claim rather than trusting the test: a
brute-force comparison of `joinPath({platform:"linux", …})` against `path.join(…)` across every
POSIX suffix list in the module × 6 home-dir spellings × 4 command spellings produced **0
divergences**. The `pushUniqueCandidate` fold is correctly win32-only, `rankPathSearchHits`'s
non-win32 arm is byte-identical to the `split("\n",1)[0].trim()` it replaces, `out.head` is
confirmed to be the raw retained prefix (never the rendered truncation marker), and the
timeout/close/error settle logic has no double-resolve and no cleared-timer leak. I found **no
POSIX behavioural regression**.

The problems are all on the Windows side of the seam, and two of them are serious.

The phase correctly diagnosed the synchronous-`EINVAL` hazard and correctly fixed it in
`spawnAndWait` — then left the *same unguarded shape* at the one spawn a Windows user reaches
first: the provider launch in `sendCliMessage`. Phase 6 is precisely what makes
`%APPDATA%\npm\<cli>.cmd` resolvable, and the shared install table this phase added tells Windows
users to run the `npm install -g` command that produces exactly that file. So CR-01 is not a
tail case; it is the mainline Windows path. The review context's "a refused `.cmd` degrading to
`{code: 1}` is intended graceful degradation" covers `spawnAndWait` only — it does not cover
`index.ts:3640`, where the failure is an unhandled RPC rejection, a session left without a
terminal state, and token-bearing runtime files never cleaned up.

CR-02 is a trust-boundary question the new install-location catalogue opens: two of the rows are
directories that a non-administrator can create on a default Windows install, and a binary found
there is executed with `CAIDO_TOKEN` in its environment.

The remaining warnings are consistency defects between the pre-probe and post-probe worlds — a
distinction this phase introduced (`host` is assigned only inside `startMcpServer`, so
`host?.platform` is `undefined` for the entire life of the plugin until MCP starts) and did not
fully carry through to the cache key or to the node builder.

## Critical Issues

### CR-01: The provider spawn can reject the `sendCliMessage` RPC, strand the session, and leak token-bearing temp files

**File:** `packages/backend/src/index.ts:3634-3644` (the `return new Promise(...)` executor and
the `spawnWithEnv(resolved, args, …)` inside it)

**Issue:**

```ts
return new Promise<Result<SendCliMessageOutput>>((resolve) => {
  const proc = spawnWithEnv(resolved, args, { env: buildSpawnEnv({...}), stdio: [...] });
```

`spawnWithEnv` is a bare cast of `child_process.spawn` (`index.ts:2029`), with no guard. Phase 6's
own comment at `spawnAndWait` (`index.ts:2578-2600`) states the mechanism exactly right: on
Windows, Node ≥ 18.20.2 throws `EINVAL` **synchronously** from the CVE-2024-27980 guard for a
direct `.cmd`/`.bat` spawn, and a synchronous throw inside a Promise executor rejects the promise
rather than firing `proc.on("error")`. The `spawn_error` handler at `index.ts:4136-4141` — which
does the right thing (`finalize(err(...))`) — is therefore unreachable for this failure.

The `catch (e)` at `index.ts:4143` does **not** catch it either: `try { return somePromise } catch {}`
does not catch that promise's rejection (only `return await` would). The async function resolves
*with* the rejected promise, so `sendCliMessage` rejects.

Trigger, and why it is the mainline path rather than an edge:

1. This phase's `getExecutableNames` ladder and `rankPathSearchHits` make `%APPDATA%\npm\gemini.cmd`
   resolvable — the P-01 row added at `command-resolution.ts:510`.
2. `npm install -g @google/gemini-cli` — the exact string this phase's new
   `PROVIDER_INSTALL_COMMANDS.win32` tells the user to run — creates `gemini.cmd` there and no
   `.exe`, so the `.cmd` rung is what the ladder returns.
3. `resolveCommand` returns it, `sendCliMessage` spawns it directly, Node throws, RPC rejects.

Consequences beyond the rejection, all inside the executor that never ran:
- `setSessionState("error", …)` / `finalize()` never execute, so no terminal session state is
  published — the frontend's session never leaves its spawning state.
- `activeProcesses.set(input.sessionId, proc)` never runs, so `cancelCliMessage` cannot clean up.
- `createSessionRuntimeFiles` (`index.ts:3255`) and the Claude/Copilot MCP config JSON have already
  been written by this point; `finalize`'s `rm` calls (`index.ts:3858-3864`, `4198-4199`) are the
  only deleters. The token-bearing `mcp-<chatId>.json` and the per-session approval/activity files
  are left on disk.

**Fix:** Mirror the guard `spawnAndWait` already carries — one try/catch, no shell option, no
extension check (Phase 7 still owns launchability):

```ts
return new Promise<Result<SendCliMessageOutput>>((resolve) => {
  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawnWithEnv(resolved, args, {
      env: buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars }),
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    // PRV-02 / Phase 7 owns making a .cmd launchable. This arm only restores the
    // documented contract: a refused spawn becomes a Drift error, not a rejected RPC.
    const message = `Spawn error: ${String(e)}`;
    setSessionState("error", message, { reasonCode: "spawn_error" });
    finalize(err(message));   // finalize already removes runtimeFiles + the MCP config
    return;
  }
  // ...unchanged
```

`finalize` is declared above the returned promise, so it is in scope; if it is not, hoist the
`rm` cleanup into the catch arm explicitly. Add a unit test that makes the injected spawn throw
synchronously and asserts the returned promise **resolves** to an `Error` result.

---

### CR-02: Two new candidate roots are non-administrator-writable, and a binary found there is executed with `CAIDO_TOKEN` in its environment

**File:** `packages/backend/src/command-resolution.ts:553` (`emitLocation(input.roots.programData, ["scoop", "shims"])`)
and `packages/backend/src/command-resolution.ts:24` / `:614` / `:965` (`NVM_WINDOWS_SYMLINK_DIR = "C:\\nvm4w\\nodejs"`)

**Issue:** Every other row in the new catalogue is under `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`
(the user's own trust domain) or `%ProgramFiles%` (admin-only). These two are not:

- `C:\ProgramData` carries a default ACE granting `Authenticated Users` create-subdirectory rights.
  If scoop is not installed machine-wide, `C:\ProgramData\scoop\shims\` does not exist and **any**
  local account can create it and drop `gemini.exe` there.
- `C:\` root grants `BUILTIN\Users` create-folder rights, so `C:\nvm4w\nodejs\` is likewise
  creatable by a non-administrator when nvm-windows is not installed.

Because the ladder emits `.exe` first, a planted `gemini.exe` is preferred over anything else in
that directory. The exploit needs no privilege escalation and no admin:

1. Victim has not installed (say) Gemini CLI. Today Drift reports it unavailable and stops.
2. Attacker with any local account creates `C:\ProgramData\scoop\shims\gemini.exe`.
3. Drift's provider status check now reports Gemini CLI **available** at that path.
4. On the next turn `sendCliMessage` spawns it with
   `buildSpawnEnv({ parentEnv, driftVars: injectedDriftVars })` — which carries `CAIDO_URL` and
   `CAIDO_TOKEN` (`buildMcpRuntimeEnv`, `index.ts:3253-3259`).

The node path is the same shape: a planted `C:\nvm4w\nodejs\node.exe` that answers `--version`
with exit 0 becomes the MCP server's interpreter and receives `spec.env` (parent-merged
`CAIDO_TOKEN`) at `index.ts:2159`. This is CWE-426/427 (untrusted search path) with session-token
disclosure as the payload — directly against PROJECT.md's "runtime temp files carry the Caido
token" security constraint, one layer up.

**Fix:** Pick one, and record it beside the row (the module's cite-or-drop discipline already has
the right shape for this):

```ts
// SECURITY: %ProgramData% is non-admin-writable by default (Authenticated Users
// hold create-subdirectory on C:\ProgramData), and a candidate resolved here is
// spawned with CAIDO_TOKEN in its environment. Dropped rather than ordered last:
// the row only wins when the CLI is genuinely absent, which is exactly the case
// a planted binary exploits.
// emitLocation(input.roots.programData, ["scoop", "shims"]);
```

Preferred: drop the `programData` row (machine-wide scoop is the rarer install) and gate the
`C:\nvm4w\nodejs` row on the presence of `NVM_HOME`/`NVM_SYMLINK` in the parent env, so it is
emitted only when nvm-windows is actually installed. If either row is kept, the trade-off must be
an explicit recorded non-claim naming the token exposure, not silence.

## Warnings

### WR-01: `resolveCommand`'s PATH-search spawn is the same unguarded Promise-executor shape the phase just fixed elsewhere

**File:** `packages/backend/src/index.ts:1600-1608`

**Issue:** `const child = spawn(searchCommand.command, searchCommand.args(command));` sits inside
`new Promise((resolve) => { … })` with no try/catch. The comment at `index.ts:1587-1590` explicitly
leans on the async error handler for the Windows pre-probe case:

> "The `error` handler below is what makes the POSIX arm safe on Windows: the POSIX binary cannot
> be spawned there, and the handler turns that into a fall-through to the candidate walk instead of
> a throw."

That is the exact assumption `spawnAndWait`'s new guard argues you may not make about this runtime
("Whether Caido's constrained runtime does the same is unverified in EITHER direction"). Two
concrete throwers exist even on stock Node:

- `spawn` throws `ERR_INVALID_ARG_VALUE` **synchronously** when the command or any argument
  contains a NUL byte. `command` here is `currentSettings.providers[id].command`, rehydrated from
  persisted JSON — the same untrusted-blob argument `getNodeExecutable` already makes at
  `index.ts:2666-2682`.
- LLRT's `child_process` is a Rust shim; whether an `ENOENT` on `which` surfaces as an `error`
  event or a synchronous throw is unverified, and the win32 arm now spawns a different binary
  (`where.exe`) on that same unverified surface.

`resolveWithCache` re-throws (`resolution-cache.ts:165-173`, `finally` with no `catch`), so the
rejection travels `resolveCommand → checkProvider → Promise.all(…) → getProviderStatuses` and
reaches the frontend as a rejected RPC, taking all four provider statuses down with it.

**Fix:** Same one-guard shape as `spawnAndWait`:

```ts
const pathResolution = await new Promise<string | undefined>((resolve) => {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(searchCommand.command, searchCommand.args(command));
  } catch {
    // Same fall-through the "error" handler produces: no PATH hit, walk candidates.
    resolve(undefined);
    return;
  }
  // ...unchanged
```

---

### WR-02: The resolution cache does not distinguish pre-probe from post-probe results, so a Windows user can be told Node is missing when it is not

**File:** `packages/backend/src/index.ts:1569` (`key: \`cmd:${command}\``),
`packages/backend/src/index.ts:2732` (`key: "node"`), `packages/backend/src/index.ts:617` (`host = facts`)

**Issue:** `host` is assigned in exactly one place — inside `startMcpServer` (`index.ts:2944` →
`probeRuntime` → `:617`). Before that, `host?.platform` is `undefined` for the whole plugin
lifetime. Phase 6 made resolution *materially* platform-dependent for the first time: a different
search binary (`getWhichCommand`), a different timeout (1000 ms vs 5000 ms), and — for node — a
different candidate set (see WR-03). The cache keys did not move with it, and
`clearResolutionCache` is invoked only on a provider-command signature change
(`index.ts:1852`, `:4533`), never on the probe transition.

Concrete failure, in a plausible Windows troubleshooting order:

1. User opens Settings → Diagnostics. `getDiagnostics` (`index.ts:4290`) calls
   `getCachedNodeExecutable()` **pre-probe**.
2. `buildNodeCandidatePaths` runs with `platform: undefined`, which emits **no** Windows rows
   (WR-03), so `C:\Program Files\nodejs\node.exe` — the directory Phase 3's P1-WHERE actually
   measured — is never a candidate. Resolution returns `undefined`.
3. `resolveWithCache` writes the negative entry under key `"node"`
   ("Writes `undefined` too — that IS the negative cache"), TTL `RESOLUTION_NEGATIVE_TTL_MS` = 30 s.
4. User clicks Start MCP within 30 s. `requireNodeExecutable` → `getCachedNodeExecutable()` reads
   the stale pre-probe `undefined` and returns
   `"Drift could not locate a Node.js executable to launch the MCP server. Install the Node.js LTS
   build from nodejs.org…"` — on a machine where Node is installed and would have resolved.

That is the exact class of false negative this milestone exists to eliminate.

**Fix:** Invalidate on the transition, in `probeRuntime` right where `host` is assigned:

```ts
// PERF-03 entries computed pre-probe were resolved with a different search binary,
// a different timeout and a narrower candidate set. They are not answers to the
// same question, so they are dropped rather than aged out.
const wasUnprobed = host === undefined;
host = facts;
if (wasUnprobed) clearResolutionCache(resolutionCache);
```

(Equivalent alternative: fold `host?.platform ?? "unprobed"` into both cache keys. Prefer the
explicit clear — one site, and it cannot drift out of sync with a third key added later.)

---

### WR-03: `buildNodeCandidatePaths` omits the union-when-unknown arm its sibling has, with no recorded reason

**File:** `packages/backend/src/command-resolution.ts:894` (`if (input.platform === "win32") {`)
vs `packages/backend/src/command-resolution.ts:723` (`if (input.platform === "win32" || input.platform === undefined) {`)

**Issue:** `buildCommandCandidatePaths` unions both arms on `undefined` and documents it at length.
`buildNodeCandidatePaths` gates its entire Windows block on the literal `"win32"`. The consequence
is that the node-ONLY rows — `%ProgramFiles%\nodejs` (P-02, the one Phase 3 measured),
`%ProgramFiles(x86)%\nodejs` (P-03), the Volta node image (P-13), `C:\nvm4w\nodejs` — are
unreachable in every pre-probe call, which on Windows is every call outside `startMcpServer`.

The CMP-01 test at `command-resolution.test.ts:938` (`"reproduces it before the platform probe has
run"`) passes `roots: {}`, so it pins the POSIX-only output without ever exercising the case where
Windows roots *are* set pre-probe. No summary in `06-01`…`06-07` records this as a decision — I
grepped for it — so it reads as an omission rather than a declined option. It also compounds WR-02.

**Fix:** Either union it for symmetry, keeping the rootless `C:\nvm4w\nodejs` literal gated on the
literal `"win32"` for the same CMP-01 reason `buildWindowsInstallLocationCandidates` already uses:

```ts
if (input.platform === "win32" || input.platform === undefined) {
  // ...node-only rows; the rootless literal stays behind `input.platform === "win32"`
```

…and add a test asserting the pre-probe node list with `roots` populated. Or, if the asymmetry is
intentional, write the non-claim next to the arm the way D-07 is written next to `foldCandidateKey`
— and note that `getDiagnostics` is a real pre-probe caller of node resolution, so the "the probe
has resolved before any launch resolves a command" argument in `06-02-SUMMARY.md:186` does not
cover it.

---

### WR-04: `spawnAndWait` still has no timeout, and Phase 6 newly feeds it `.cmd`/`.bat`/bare-name candidates

**File:** `packages/backend/src/index.ts:2559-2649` (no `setTimeout` anywhere in the body),
consumed at `packages/backend/src/index.ts:2700` (`await spawnAndWait(candidate, ["--version"])`)

**Issue:** The new try/catch covers the *throw* shape of a hostile candidate. It does not cover the
*hang* shape, and `spawnAndWait` has no time budget at all — unlike `resolveCommand`, which
explicitly grew one this phase. `stdio` is `["pipe","pipe","pipe"]` and stdin is never written or
ended, so any candidate that reads stdin blocks forever.

Phase 6 is what makes this reachable: `getNodeExecutable` walks ~100 Windows candidates and spawns
`--version` on every one that passes `fileExists`, and the ladder now includes `node.bat`,
`node.cmd`, and a **bare `node`** rung (`getExecutableNames`, `platform.ts:330-337`) that on
Windows matches npm's Cygwin shell script rather than an executable. A `.bat` that reaches `pause`,
an AV-interposed shim, or a script waiting on stdin hangs `startMcpServer` indefinitely with no
recovery path — and `startMcpServer` is awaited by an RPC handler, which under the documented
QuickJS constraint means no `setInterval` in the backend fires while it is suspended.

**Fix:** Give `spawnAndWait` the same bounded budget the sibling site just got:

```ts
const timeout = setTimeout(() => {
  if (settled) return;
  settled = true;
  try { proc.kill("SIGKILL"); } catch { /* ignore */ }
  resolve({ code: 1, stdout: renderBoundedBuffer(stdout), stderr: renderBoundedBuffer(stderr) });
}, host?.platform === "win32" ? WIN32_PATH_SEARCH_TIMEOUT_MS : POSIX_PATH_SEARCH_TIMEOUT_MS);
```

with a `settled` guard on `close`/`error` mirroring `resolveCommand`. If a shared budget is wrong
for `mcp add` (its slowest caller), give the version-probe loop its own bound rather than leaving
the walk unbounded.

---

### WR-05: `getKnownHomeDirs` now returns `%APPDATA%`/`%LOCALAPPDATA%` as home directories, and the "costs a POSIX machine nothing" claim is an environment assumption

**File:** `packages/backend/src/platform.ts:457-474` (`getHomeDirCandidates`),
consumed at `packages/backend/src/index.ts:1735-1743`

**Issue:** Two separate problems from one change.

*(a) Semantic.* `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` are returned as peers in a list named
`homeDirs`, and `getCommandExecutableCandidates` crosses **every** entry with POSIX version-manager
layouts (`collectVersionManagerCommandCandidates`, `command-resolution.ts:381`). That produces
`C:\Users\x\AppData\Roaming\.nvm\versions\node` and `C:\Users\x\AppData\Local\.fnm\node-versions`
— paths no installer produces, each costing a `pathExists`. D-09's own argument against the flat
array ("leaves a reviewer unable to distinguish an intentional candidate from a cartesian-product
artifact") applies here verbatim; the named-roots discipline was applied to the win32 table but
not to the home-dir list feeding the shared version walk.

*(b) CMP-01 surface.* The comments assert three times that the union "costs a POSIX machine
nothing" because "the wrong platform's names are simply absent." That is an assumption about the
environment, not an invariant. WSL2 with `WSLENV` forwarding exports translated
`USERPROFILE`/`APPDATA` values (`/mnt/c/Users/x/…`) into Linux processes; Wine and several
cross-toolchain shells do the same. On such a host, pre-probe, the POSIX arm of
`buildCommandCandidatePaths` builds `/mnt/c/Users/x/.local/bin/claude` and
`/mnt/c/Users/x/AppData/Roaming/.local/bin/claude` — the first of which can genuinely exist, would
be returned as the resolved provider command, and is a Windows PE that cannot exec from Linux.
Every extra candidate is also a DrvFs `stat`, which is orders of magnitude slower than a native one.

**Fix:** Keep the union (D-08's reasoning for it is sound) but stop conflating roles:

```ts
// Only USERPROFILE names a HOME. APPDATA/LOCALAPPDATA are install roots and are
// consumed through getWindowsNamedRoots; crossing them with POSIX version-manager
// layouts produces paths no installer creates.
const windowsNames = ["USERPROFILE"];
```

and, for (b), either filter home candidates whose shape does not match the target arm before
handing them to the POSIX suffix list, or downgrade the three "costs a POSIX machine nothing"
comments to name the WSLENV/Wine exception explicitly rather than asserting absence.

## Info

### IN-01: `emitLocation` is implemented twice

**File:** `packages/backend/src/command-resolution.ts:453-467` and
`packages/backend/src/command-resolution.ts:900-916`

**Issue:** The same root-guard + ladder-loop + `pushUniqueCandidate` helper is written out in both
`buildWindowsInstallLocationCandidates` and `buildNodeCandidatePaths`'s win32 arm. Two copies of
the "an absent root emits nothing, never an empty prefix" invariant means a future fix can land in
one and not the other.

**Fix:** Extract one module-level `emitWindowsLocation({ candidates, root, segments, names })` and
call it from both.

---

### IN-02: `rankPathSearchHits` discards extensionless PATH hits that the candidate ladder still considers valid

**File:** `packages/backend/src/platform.ts:401-404`

**Issue:** The win32 arm drops any line that does not end in `.exe`/`.cmd`/`.bat`. `where.exe`
returns exact-name matches for extensionless files too, so a PATH-resolvable extensionless binary
can never be resolved via the PATH search — while `getExecutableNames` (`platform.ts:330-337`)
deliberately keeps the bare name as the final ladder rung for exactly that case. The two readers of
`WINDOWS_EXECUTABLE_EXTENSIONS` disagree about whether a bare name is a valid answer.

**Fix:** Either give the bare-name case a rank after `.bat` in the ranker, or note at
`getExecutableNames`'s bare-name rung that it is intentionally directory-walk-only and unreachable
via PATH search.

---

### IN-03: `getWhichCommand`'s bare-name fallback silently reintroduces the PATH-hijack the absolute path exists to prevent

**File:** `packages/backend/src/platform.ts:291` (`return { command: "where.exe", args }`),
`packages/backend/src/index.ts:1577-1579`

**Issue:** The call-site comment says the absolute form avoids "trusting a bare name that any
writable PATH entry could satisfy (T-06-T22)". When `SystemRoot`/`SYSTEMROOT` are absent the
function returns exactly that untrusted bare name, and nothing records that the security property
was dropped for this resolve. The fallback's *availability* is documented and tested; its
*security consequence* is not.

**Fix:** Add one clause to the comment stating that the fallback trades the hijack-resistance for
availability, and consider surfacing it in `getDiagnostics` (a boolean, not the value) so a support
bundle shows which arm was taken.

---

### IN-04: `listWindowsVersionDirs` does pre-probe I/O whose result the node builder never reads

**File:** `packages/backend/src/command-resolution.ts:765` (`if (input.platform !== "win32" && input.platform !== undefined) return found;`),
consumed at `packages/backend/src/command-resolution.ts:1027`

**Issue:** For node with `platform: undefined`, the four `pathExists` + `readdir` walks run and the
resulting `windowsVersionDirs` is then ignored, because `buildNodeCandidatePaths` reads it only
inside the `=== "win32"` arm (WR-03). On POSIX the roots are absent so it costs nothing; on a
Windows pre-probe call it is up to four directory listings whose output is discarded.

**Fix:** Falls out of WR-03. If the union arm is added, the work becomes useful; if the asymmetry
is kept deliberately, skip the walk for node when `platform !== "win32"`.

---

_Reviewed: 2026-08-21T14:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
