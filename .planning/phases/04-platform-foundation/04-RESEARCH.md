# Phase 4: Platform Foundation - Research

**Researched:** 2026-08-14
**Domain:** Cross-platform Node/LLRT runtime plumbing — temp-path portability, Windows filesystem-lock tolerance, incremental file tailing, bounded buffers, resolution caching
**Confidence:** MEDIUM-HIGH (LLRT surface now source-verified against Caido's own fork; Windows *runtime* behaviour still inferred, never executed)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Discrete pure functions taking an `{ ...input }` object param — no descriptor object, no composition helper.** This matches `command-resolution.ts`'s existing `getCommandExecutableCandidates({ ...input })` convention, so the two modules Phases 5–8 both import read the same way. Each function is independently unit-testable on the Linux CI runner with `platform` passed as a literal, and callers pull only the subset they have inputs for.

  The agreed shape:

  ```ts
  // packages/backend/src/platform.ts — every function takes platform explicitly, no I/O
  export type Platform = "win32" | "darwin" | "linux";

  export function getTempRoot(
    input: { platform: Platform; tmpdir: string },
  ): string;

  export function getWhichCommand(
    input: { platform: Platform },
  ): { command: string; args: (cmd: string) => string[] };

  export function getHomeDirCandidates(
    input: { platform: Platform; env: Record<string, string | undefined> },
  ): string[];

  export function getExecutableNames(
    input: { command: string; platform: Platform },
  ): string[];
  ```

  A `createPlatformProfile()` aggregate was offered and **rejected** — every caller would have to supply all inputs even for the one field it needs.

- **D-02: `os` is touched in exactly ONE place — the RUN-05 capability probe at MCP start — and the result is cached in a module-level `let`. Every downstream site reads the cache, never `os`.**

  Rationale, and it is the load-bearing part: a module-level `const HOST = { platform: os.platform(), tmpdir: os.tmpdir() }` evaluated at plugin load means that **if Caido's LLRT lacks `os`, the throw happens during module evaluation and the entire Drift plugin dies** — chat and settings included, frontend renders a dead panel — and RUN-05 never gets to speak. Reading lazily inside the probe degrades the same gap to a loud, actionable MCP-start error, and makes the probe *authoritative* rather than decorative: it is the only code that can observe the failure.

  ```ts
  // index.ts
  let host: { platform: Platform; tmpdir: string } | undefined;

  function probeRuntime(): Result<HostFacts> {
    try {
      const platform = os.platform();
      const tmpdir = os.tmpdir();
      if (typeof tmpdir !== "string" || tmpdir === "") return err(RUNTIME_PROBE_ERROR);
      host = { platform, tmpdir };
      return ok(host);
    } catch (error) {
      return err(RUNTIME_PROBE_ERROR);
    }
  }
  ```

  Calling `os.*` at each site was rejected for the same reason: it leaves the probe unable to guarantee that the sites it validated are the sites that run.

- **D-03: The Phase 4 / Phase 6 line is SHAPE versus DATA.**

  - **Phase 4 ships:** all four pure functions, with their POSIX behavior byte-identical to today and fully unit-tested, **plus the platform-invariant Windows primitives** — `which` vs `where` binary name, the `.exe`/`.cmd` extension list, and *which env var names* to read for home dirs.
  - **Phase 6 fills:** the install-location candidate arrays (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`), the `where` CRLF parse, and UX-02 copy — **extending the same functions, not restructuring them.**

  This keeps the roadmap's requirement traceability honest (RES-01/02/03 stay Phase 6) and stops Phase 4 silently becoming a two-phase change.

- **D-04: `normalizePathForCompare()` ships as an IMPURE helper OUTSIDE `platform.ts`,** with a guarded fallback ladder: `realpathSync.native` → `fs/promises.realpath` → `path.resolve`. `platform.ts` stays I/O-free per SC-1.

  **`realpath` availability joins the probe's measured set** (reported, not gating — see D-06), so an LLRT gap is loud at MCP start rather than a silent wrong answer in Phase 6.

  Stated plainly for the planner: **no path comparison in Phase 4's own code actually needs this yet.** The orphan sweep compares two paths both derived from the same cached `host.tmpdir`, so they are string-identical by construction. SC-10 names it as a Phase 4 criterion because Phase 6 is where the 8.3-versus-long-form mismatch bites (`os.tmpdir()` → `C:\Users\RUNNER~1\…` versus `USERPROFILE` → `C:\Users\runneradmin`). Phase 4 ships and probes the helper; Phase 6 is its first caller. Do not "clean up" the unused export.

  Note the new import surface: `realpathSync.native` comes from `node:fs` (sync), while `index.ts` imports only `fs/promises` today. The ladder exists precisely because that surface is unproven under LLRT.

- **D-05: Hard-fail on EVERY OS. One code path, one message. No POSIX degrade-to-`/tmp` arm.**

  This was checked against CMP-01/CMP-02 and is **not** a regression in practice: if `os` is genuinely absent from Caido's LLRT, the POSIX path cannot reach `os.tmpdir()` either. Silently falling back to hardcoded `/tmp` on darwin/linux would mean shipping a build whose Windows path is dead while POSIX quietly works — **the exact failure mode this milestone exists to kill**, and the one that let the reported bug ship in the first place. A two-armed policy also doubles the test surface and hides a real LLRT gap on the platforms most users run.

- **D-06: The gate rule is "a primitive with a working fallback REPORTS; a primitive without one GATES."**

  | Primitive | Gates MCP start? | Why |
  |---|---|---|
  | `os.platform()` returns a recognised value | **Yes** | Nothing downstream branches correctly without it; an unrecognised value silently takes the POSIX arm, which on Windows *is* the current bug reintroduced one layer up |
  | `os.tmpdir()` usable (see D-07) | **Yes** | Every runtime file depends on it |
  | `realpath` availability | No — report | D-04's ladder already degrades to `path.resolve` |
  | `USERPROFILE` / `APPDATA` / `LOCALAPPDATA` on `win32` | No — report | Phase 6's inputs, platform-conditional, no Phase 4 consumer |

  Every result — gating or not — lands in the probe message **and** in `getDiagnostics`, so an LLRT gap is visible without blocking MCP for a capability nothing consumes yet.

- **D-07: The probe WRAPS THE REAL FIRST WRITE. There is no separate canary file.**

  `startMcpServer` already does `mkdir(mcpTempDir, { recursive: true, mode: 0o700 })` followed immediately by `writeFile(mcpScriptLocal, …)` (`index.ts:1717–1720`). **That** is the `os.tmpdir()` assertion — the probe wraps the real work and reports its failure with the actionable message.

  Three things fall out, and they are why this beat both alternatives:
  1. **Zero extra I/O** at MCP start.
  2. The failure it catches is **the actual one users hit** — a read-only or Defender-locked temp dir passes a `stat()`-only check and then dies at the copy with the cryptic error RUN-05 exists to replace.
  3. **RUN-04 and RUN-05 become one mechanism.** The `EPERM`/`EBUSY`/`UNKNOWN` bounded-backoff retry ladder (~5 attempts, 50–500 ms) lives exactly here, wrapping the same write. A separate canary was rejected because it can itself trip the AV write-then-access race it exists to detect — a false negative on precisely the machines that matter.

- **D-08: The message carries a best-effort version block, each read individually guarded, rendering `"unavailable"` for anything that fails.** Sources, in the absence of any Caido version: `process.version` / `process.versions`, `os.platform()` + `os.release()`, and **Drift's own version read from the plugin manifest at `pluginPath`**.

  This satisfies SC-4's intent without inventing a Caido version that does not exist, and produces exactly the string a Windows bug reporter should paste into an issue. It surfaces in the MCP status message, `sdk.console`, and `getDiagnostics` — which already collects this shape of field (`index.ts:2750`+).

  SC-4's literal wording ("including the Caido/runtime version") should be read as satisfied by this block. If a verifier reads it strictly, the honest note is: **the SDK exposes no Caido version; this is the closest available substitute**, not an omission.

### Claude's Discretion

The user reviewed and declined to discuss these. Planner decides, with the defaults below recorded as the discussed-and-agreed starting point — **not** as unexamined gaps.

- **Legacy `/tmp` sweep arm on POSIX — default: SHIP IT.** Switching to `os.tmpdir()` moves macOS to `/var/folders/…`, so token-bearing `drift-mcp-*` directories left behind by the currently-shipped 0.1.0 in `/tmp` would **never be swept again** after upgrade. This was surfaced explicitly during the discussion as the one skipped item with a *security* consequence rather than a tuning one, and the user chose "ready for context" with this default stated. `sweepOrphanedMcpTempDirs` should scan `os.tmpdir()` **and**, on non-`win32`, also `/tmp` when it differs — same `drift-mcp-*` filter, same `!== mcpTempDir` guard. CMP-02 already requires the macOS `/var/folders/…` case to keep working.
- **Temp-path / filename shortening for MAX_PATH (SC-3).** Today: `drift-mcp-<36-char uuid>` plus `mcp-activity-drift-<13-digit ms>.jsonl`. Trimming the random component trades guessability for path length, and `genUUID` is `Math.random`-based already (`CONCERNS.md` § *genUUID Uses `Math.random`*). Planner picks the scheme; do not shorten the random component to the point where the temp dir name becomes trivially enumerable.
- **PERF-04 buffer bounds** — cap size, keep-head vs keep-tail vs both-ends, and the truncation marker text. Two distinct sites with possibly different policies: the `stdout`/`stderr` accumulators (`index.ts:1524–1525`, `2484`, `2573`) and `claude-print.ts`'s line buffer (`claude-print.ts:150–160`), where the hazard is a single never-terminated line rather than total volume.
- **PERF-03 resolution cache** — TTL length, and whether *negative* (not-found) results are cached too. Note the trade-off: not caching misses means the expensive version-manager directory walk repeats every turn precisely in the slowest case; caching them means a freshly-installed `node` stays invisible for the TTL. Invalidation on provider-command change is required by SC-6 either way.
- **PERF-02 activity-file offset read** — mechanism (`open()` + `read()` from a byte offset versus a stream; note `open` is already imported and `createReadStream` is not) and partial-line buffering across ticks. Must handle offset > size by resetting.
- **`getSessionDebugLogPath` when `host` is unset.** D-02 means `host` is only populated at MCP start, but a chat turn can run with MCP never started. **Default: return `undefined` (no debug log)** when `host` is unset — `debugLogging` is opt-in, so silently skipping is acceptable and strictly better than reintroducing a hardcoded `/tmp`. The orphan sweep has no such problem: it runs *inside* `startMcpServer`, so ordering the probe first is sufficient.
- **Small `platform.ts` shape details** — narrow `Platform` union versus `NodeJS.Platform`, and whether `getWhichCommand` returns a full spawn spec or just a binary name. Raised and left to the planner.

### Deferred Ideas (OUT OF SCOPE)

- **Phase 2 (POSIX Correctness & Hardening) is still `Not started`** while Phase 4 is being planned. The roadmap places it off the critical path, so this is legitimate sequencing — but flagged here because **SEC-02** ("`sessionId` and `chatId` validated against a strict character set before being interpolated into filesystem paths") lands on **exactly the filenames SC-3 shortens**. Phase 4 does **not** absorb SEC-02; if the filename scheme changes here, Phase 2's validation must be re-checked against the new scheme rather than the old one.
- **`genUUID` → `crypto.randomUUID`** — **Blocked by Phase 3's P3-UUID:** a Node-vehicle result with zero source-level LLRT confirmation. Revisit only when a later phase measures `randomUUID` *inside* Caido. Not this phase.
- **Explicit `icacls` ACL hardening of the Windows temp dir (HRD-01)** — already deferred to v2 in STATE.md. Phase 4 relies on the per-user `%TEMP%` ACL baseline; the POSIX `0o700`/`0o600` modes are silently ignored on Windows and that is the accepted trade-off.
- **Event-driven `sendCliMessage` refactor (backlog 999.1)** — would delete the 250 ms heartbeat that PERF-02 is optimising. Deliberately sequenced after the port.
- **Repo-wide Prettier sweep (backlog 999.11)** — rewrites `renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote`, which the Phase 5–8 scope fence holds byte-stable. Stays sequenced after Phase 8.
- **Real-machine confirmation from the original Windows reporter (@0xMRK0S)** — belongs to Phase 9 or 10.

### Anti-Goals (explicitly NOT researched, per the phase brief)

- The launch-path rewrite (`renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` / `shellQuote` / `chmod` / direct-node spawn) — **Phase 5**.
- Windows install-location candidate lists, `where.exe` parsing, provider install commands — **Phase 6**.
- `taskkill` / process-tree kill — **Phase 8**.
- Replacing `genUUID` with `crypto.randomUUID` — blocked by Phase 3's P3-UUID.

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **RUN-03** | `os.tmpdir()` for runtime, context, log, and orphan-sweep paths instead of hardcoded `/tmp` | § *LLRT Surface Risk* (source-verified `os.tmpdir` in Caido's fork); § *Pitfall 1* (LLRT returns a **trailing separator** where Node does not — always `path.join`, never template concatenation); § *Runtime State Inventory* (the legacy `/tmp` sweep arm) |
| **RUN-04** | Temp-file write→spawn path tolerates the Windows AV write-then-exec race (copy once at start; bounded retry on `EPERM`/`EBUSY`) | § *Windows Transient-Filesystem-Error Taxonomy* (libuv error mapping, three ecosystem retry precedents, the recommended ladder); § *Code Example 2* |
| **RUN-05** | Fail loud at MCP start with an actionable message when a required runtime capability is missing | § *Code Example 1* (probe wrapping the real first write); § *LLRT Surface Risk* (`process.versions.node === "0.0.0"` is a free LLRT-vs-Node discriminator for D-08); `detectPluginVersion()` **already exists** at `index.ts:455` |
| **CMP-02** | The `os.tmpdir()` substitution does not break the macOS/Linux orphan-sweep | § *Runtime State Inventory*; § *Pitfall 1*; § *Validation Architecture* (Linux-runner-provable via injected `tmpdir`) |
| **PERF-02** | Activity file read incrementally from a byte offset | § *Code Example 3*; § *Pitfall 3* (**the LLRT `copy_from_slice` constraint — buffer must be sized exactly to `length`**); § *Pitfall 4* (torn UTF-8 across the read boundary) |
| **PERF-03** | Provider/Node binary resolution cached with a short TTL, invalidated on command change | § *Don't Hand-Roll* + § *Resolution Cache Design* (note: `lastNodeExecutable` is already an **infinite, never-invalidated** cache — this is a *replacement*, not an addition) |
| **PERF-04** | `stdout`/`stderr` accumulation and the Claude stream parser use bounded buffers with marked truncation | § *Bounded Buffer Design* (per-site caps + retention policy); § *Pitfall 5* (the claude-print hazard is **O(n²) slicing plus an unterminated line**, not total volume) |

Also encoded as Phase 4 success criteria and treated as first-class here:

| SC | Description | Research Support |
|----|-------------|------------------|
| **SC-9** | Every `spawn` site supplying `env` spreads `{ ...process.env, ...driftVars }`, with a test asserting it | § *Code Example 4* (extract `buildSpawnEnv()` as a pure function so SC-9 gets a real assertion instead of a grep) |
| **SC-10** | Path comparisons against a profile-derived path normalise with `realpathSync.native` first | § *LLRT Surface Risk* (**no `realpath` anywhere in Caido's LLRT fork** — the ladder will land on `path.resolve` under Caido, source-verified) |

</phase_requirements>

---

## Summary

Phase 4 is a brownfield plumbing phase with an unusual property: **its riskiest dependency is a runtime nobody can execute.** Phase 3 measured the Windows *platform* faithfully on Node, but Caido runs a fork of AWS LLRT and no standalone LLRT Windows binary exists. This research closes a large part of that gap a different way — by reading `caido/dependency-llrt@main`'s Rust source directly. The results are decisive and mostly good news, but they also overturn one assumption the roadmap encodes.

**What the source says.** `os.platform()`, `os.tmpdir()`, `os.release()`, `os.version()`, `os.homedir()` are all declared **unconditionally** (no cargo feature gate) in Caido's fork — D-02's probe will find them. `process.version`, `process.versions`, `process.platform` and `process.env` exist; `process.execPath` **does not**, which means `getNodeExecutable()`'s `execPath` candidate has always been dead under Caido. `fs/promises.open` and a `FileHandle` with positional `read()` **do** exist in the fork's code (its `API.md` is stale and omits them), so PERF-02's mechanism is available. And **`realpath` / `realpathSync` do not exist anywhere in the fork's `fs` module** — SC-10's `realpathSync.native` will never fire under Caido and D-04's ladder will always land on `path.resolve`. That is not a reason to drop the ladder (Phase 6 needs the *shape*, and `path.resolve` is a legitimate rung) but it is a reason to stop calling it a normalisation guarantee.

**Two new hazards the Phase 3 Node-vehicle probe could not see.** First, LLRT's `os.tmpdir()` is `std::env::temp_dir()`, which on Windows is `GetTempPath2` — documented to return a path **ending in a backslash** — and on macOS is `$TMPDIR`, conventionally ending in a slash. Node's `os.tmpdir()` has stripped trailing separators since v2.0.0. So the *same call* returns a differently-shaped string under Caido than under the CI vehicle. `path.join` normalises it (source-verified in the fork's `join_resolve_path`); template-literal concatenation does not. Second, LLRT's `FileHandle.read` ends with `dst_buf[offset..].copy_from_slice(&buf)`, which in Rust **panics** unless the requested `length` exactly equals `buffer.byteLength - offset`. PERF-02 must allocate its buffer to the exact read size.

**What is smaller than the roadmap implies.** SC-3's "MAX_PATH shortening" addresses a risk with roughly **135 characters of headroom** at the measured worst case (124 chars on the CI runner's 8.3 temp root). It only bites if `%TMP%` is redirected past ~171 characters. The shortening is cheap insurance worth taking — but the planner should take it without collapsing the random component and without touching the `mcp-activity-<sessionId>` / `copilot-mcp-<chatId>` filenames, which Phase 2's SEC-02 will validate.

**The structural recommendation that decides whether this phase is verifiable at all.** Six of the seven requirements land in `index.ts` — 3 004 lines with **zero** direct test coverage, and the maintainer cannot test native Windows locally. Phase 4 must therefore repeat the repo's existing five-module pure/impure split for every new behaviour: a pure core (`platform.ts`, the retry-decision function, the activity-tail state machine, the bounded-append helper, the failure-message formatter, `buildSpawnEnv`) plus a thin I/O shell in `index.ts`. Done that way, essentially all of Phase 4 is provable on the Linux runner. Done otherwise, it ships unverified.

**Primary recommendation:** Build Phase 4 as **six small pure modules with sibling `.test.ts` files plus a thin `index.ts` shell** — `platform.ts` (D-01's four functions), `fs-retry.ts` (RUN-04 decision + delay ladder), `activity-tail.ts` (PERF-02 offset/partial-line state machine), `bounded-buffer.ts` (PERF-04), `resolution-cache.ts` (PERF-03), and `runtime-probe.ts` (RUN-05 report/message formatting) — and drive every Windows branch from an injected `platform` parameter so the Linux CI runner proves it.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OS-difference decisions (temp root, which/where, home-dir env names, executable extensions) | **Pure helper module** (`platform.ts`) | — | Platform is an injected parameter → Linux CI proves Windows behaviour (the only validation vehicle that exists) |
| Reading `os.platform()` / `os.tmpdir()` | **Caido backend runtime** (`index.ts`, inside `startMcpServer`) | — | D-02: exactly one site, guarded, cached; module-eval-time reads would kill the whole plugin |
| Transient-FS-error classification + backoff schedule | **Pure helper** (`fs-retry.ts`) | `index.ts` performs the actual `mkdir`/`writeFile`/`rename` | The *decision* ("is this retryable, how long do I wait") is pure; the syscall is not |
| Activity-file offset + partial-line state | **Pure helper** (`activity-tail.ts`) | `index.ts` owns `open`/`read`/`close` | Mirrors `claude-print.ts` exactly — the repo's proven pattern for a stateful stream parser |
| Buffer bounding + truncation marking | **Pure helper** (`bounded-buffer.ts`) | `index.ts` calls it in the `data` handlers | Pure string/byte arithmetic; the only reason it is not pure today is that it is inline |
| Binary-resolution caching | **Pure helper** (cache keying/TTL with injected clock) | `index.ts` owns `spawn("which")` + `stat` | Injected `now()` makes TTL expiry deterministic in tests |
| Runtime probe report + failure message | **Pure helper** (`runtime-probe.ts` formatter) | `index.ts` collects the facts | The formatter is what a bug reporter pastes; it must be snapshot-tested |
| Spawn `env` construction (SC-9) | **Pure helper** (`buildSpawnEnv`) | `index.ts` passes it to `spawn` | Turns SC-9 from "grep for `...process.env`" into an assertable unit test |
| Orphan sweep of `drift-mcp-*` dirs | **Caido backend runtime** (`index.ts`) | `platform.ts` supplies the roots to scan | Filesystem enumeration is inherently I/O; the *root list* is a pure function of `(platform, tmpdir)` |
| The MCP server's own file writes (activity JSONL, approvals) | **MCP server process** (`mcp-server.mjs`, real Node) | — | Runs under the user's Node, not LLRT — unchanged by this phase |

---

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `./CLAUDE.md`. Treat with the same authority as CONTEXT.md's locked decisions.

| # | Directive | Phase 4 consequence |
|---|-----------|---------------------|
| C-1 | Backend runs in Caido's constrained JS runtime. **No Zod**, no dynamic `require`, no `import.meta`, no `crypto`, no native addons | `Result<T>` stays inline; no validation library for the probe; `genUUID` hex loop stays |
| C-2 | "Whether `os.tmpdir()` and `process.platform` are available in that runtime is an **open research question** for planning — confirm before relying on them" | **Addressed** — see § *LLRT Surface Risk*. Source-verified present in `caido/dependency-llrt@main`; still not executed |
| C-3 | Must preserve existing macOS/Linux behavior. **No POSIX regressions** | Every new branch is `platform === "win32"`-gated or a strict superset of today's behaviour; `provider-launch.test.ts` exact snapshots must not move |
| C-4 | The maintainer **cannot test native Windows locally**. Validation is CI on `windows-latest` (build + vitest) plus reporter confirmation | Drives the entire § *Validation Architecture*: platform must be an injected parameter |
| C-5 | Runtime temp files carry the Caido token (`0o600`/`0o700`). Windows ignores POSIX modes — need a Windows equivalent or an accepted trade-off | HRD-01 is deferred to v2; the accepted trade-off is the per-user `%TEMP%` ACL. **Source-verified:** LLRT's `set_mode` is a total no-op on non-unix and returns `Ok(())` — the modes are safe to leave unconditional, no platform guard needed |
| C-6 | kebab-case source files; `PascalCase` types; `camelCase` functions; `SCREAMING_SNAKE_CASE` module constants; `type` preferred over `interface` | `platform.ts`, `fs-retry.ts`, `activity-tail.ts`, `bounded-buffer.ts` etc. |
| C-7 | Pure helpers split from I/O for testability — five existing instances, each with a sibling `.test.ts` | The single most important structural directive for this phase (see § *Architecture Patterns*) |
| C-8 | The `Result<T>` discriminated union `{ kind: "Ok" } \| { kind: "Error" }` | `probeRuntime()` returns this; `startMcpServer` already branches on it at `:1724–1728` |
| C-9 | `pnpm lint` runs `eslint . --max-warnings 0` and **never** auto-fixes on the CI path | Any new module must be lint-clean at 0 warnings before it is considered done |
| C-10 | ASCII box headers delimit top-level sections in `index.ts` | New sections (e.g. `// ── Runtime probe ───…`) follow the same style |
| C-11 | Shell security: never `shell:true` with dynamic args | Not a Phase 4 concern (no new spawns), but the pre-existing `research/ARCHITECTURE.md` `buildSpawnSpec(... shell:true)` sketch is **superseded** — see § *Anti-Patterns* |
| C-12 | GSD workflow enforcement — no direct repo edits outside a GSD command | Planner/executor concern, noted |

**Project skills:** None. `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, `.codex/skills/` — none exist in this repo (verified 2026-08-14).

---

## Standard Stack

### Core

**This phase adds no dependencies.** Every primitive it needs is a Node/LLRT built-in already reachable from the backend bundle.

| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `os` (built-in) | n/a | `platform()`, `tmpdir()`, `release()` for the D-02 probe and D-08 version block | The only portable temp-root source. Source-verified present in `caido/dependency-llrt@main` `modules/llrt_os/src/lib.rs` **[VERIFIED: caido/dependency-llrt source]** |
| `fs/promises` (built-in) | n/a | `open` + `FileHandle.read(buffer, offset, length, position)` for PERF-02; `mkdir`/`writeFile`/`rename` for RUN-04 | Already imported at `index.ts:2` (`open as openFile`). `createReadStream` is **not** available in LLRT — positional `read` is the only offset mechanism **[VERIFIED: caido/dependency-llrt `modules/llrt_fs/src/lib.rs:46,151` + `file_handle.rs:116`]** |
| `node:fs` (built-in, sync) | n/a | `realpathSync.native` — D-04's first ladder rung | **Not present in Caido's LLRT fork.** The ladder must survive its absence **[VERIFIED: no `realpath` symbol anywhere in the fork's `llrt_fs` module]** |
| `path` (built-in) | n/a | `join`, `resolve`, `sep`, `isAbsolute` | `join` normalises a trailing separator (source-verified: `join_resolve_path` truncates a trailing sep before appending). `sep` and `relative` exist in the fork's source though its `API.md` omits them **[VERIFIED: `modules/llrt_path/src/lib.rs:528,532`]** |
| `buffer` (built-in) | n/a | `Buffer.alloc`, `Buffer.concat`, `subarray`, `toString(enc, start, end)`, `lastIndexOf` (via `Uint8Array`) for PERF-02's byte-safe partial-line buffer | Already imported at `index.ts:4`. All four are listed in Caido's fork `API.md` § *buffer* **[VERIFIED: caido/dependency-llrt API.md]** |
| vitest | 4.0.18 | The only test runner | Already the repo standard; root `vitest.config.ts`, `setupFiles: ["./vitest.setup.ts"]` **[VERIFIED: repo]** |

### Supporting

| Module | Version | Purpose | When to Use |
|--------|---------|---------|-------------|
| `process` (global) | n/a | `version` / `versions` / `platform` / `env` for D-08 | Access through the existing `globalThis as typeof globalThis & { process?: … }` guard pattern (`index.ts:1532`, `:2838`) — never a bare `process.` reference |
| `sdk.console` | n/a | Emitting the probe report | Already the logging channel |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `open()` + positional `read()` (PERF-02) | `createReadStream(path, { start })` | **Rejected: not available.** `createReadStream` is absent from Caido's LLRT `fs` surface, and `index.ts` does not import it today |
| `open()` + positional `read()` (PERF-02) | Keep `readFile` but diff against a remembered length | Still reads the whole growing file every 250 ms — that *is* the bottleneck PERF-02 names |
| Hand-rolled retry ladder (RUN-04) | `graceful-fs` | **Rejected: cannot be used.** It patches the global `fs` via monkey-patching and is an npm dependency the QuickJS backend bundle cannot take. Its *policy* is still the best available reference — see § *Windows Transient-Filesystem-Error Taxonomy* |
| Hand-rolled retry ladder (RUN-04) | `fs.rm`'s built-in `maxRetries`/`retryDelay` | Only exists on `rm`, not `mkdir`/`writeFile`/`rename`; and **LLRT's `rm` implements neither option** (source-verified: `modules/llrt_fs/src/rm.rs` reads only `recursive` and `force`) |
| Narrow `Platform = "win32" \| "darwin" \| "linux"` union (D-01) | `NodeJS.Platform` | The narrow union forces an explicit normalisation step at the one `os.platform()` call site, which is exactly where D-06's "unrecognised value gates" check belongs. **Recommend the narrow union** |
| Module-level `let host` (D-02) | Passing `HostFacts` through every call site | Rejected in CONTEXT; also inconsistent with the repo's module-level-singleton norm |

**Installation:**

```bash
# None. Phase 4 adds zero packages.
```

**Version verification:** Not applicable — no packages added. Toolchain confirmed present locally: Node `v26.7.0`, pnpm `9.0.0`, vitest `4.0.18` (`.nvmrc` pins `20`; CI matrix is 20/22/24/26).

---

## Package Legitimacy Audit

> **Not applicable.** Phase 4 installs no external packages. Every module it uses (`os`, `fs/promises`, `node:fs`, `path`, `buffer`, `process`) is a runtime built-in already present in the bundle or in Caido's LLRT fork.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

`graceful-fs` and `write-file-atomic` are **cited as design references only** and must not be installed — the Caido backend bundle cannot take npm runtime dependencies, and both rely on patching the global `fs`.

---

## Architecture Patterns

### System Architecture Diagram

```text
                      ┌─────────────────────────────────────────────┐
   Caido plugin host  │  init(sdk)  — pluginPath, assetsPath, db     │
                      │  detectPluginVersion() → pluginVersion       │  (already exists, index.ts:455)
                      └────────────────────┬────────────────────────┘
                                           │
                     startMcpServer(sdk)   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  1. token check ──▶ 2. asset exists ──▶ 3. ★ probeRuntime()               │
   │                                              │                            │
   │                          ┌───────────────────┴──────────────────┐         │
   │                          │  os.platform()  os.tmpdir()          │         │
   │                          │  (try/catch, ONE site, D-02)         │         │
   │                          └───────────────────┬──────────────────┘         │
   │                    gates ◀───────────────────┤                            │
   │                    reports ───▶ probeReport ─┤ realpath? WIN env vars?     │
   │                          ┌───────────────────▼──────────────────┐         │
   │                          │  let host = { platform, tmpdir }     │◀────────┼── ONLY writer
   │                          └───────────────────┬──────────────────┘         │
   │                                              │                            │
   │  4. sweepOrphanedMcpTempDirs(host)  ◀────────┤  (MOVED after the probe)   │
   │       roots = getSweepRoots({platform, tmpdir})                           │
   │  5. mcpTempDir = path.join(getTempRoot({platform,tmpdir}), "drift-mcp-…") │
   │  6. ★ withFsRetry(() => mkdir + writeFile(mcp-server.mjs))   ← D-07       │
   │       └── fails ▶ err(formatProbeFailure(hostFacts, versionBlock))  ← D-08│
   │  7. requireNodeExecutable() ──▶ resolutionCache (PERF-03)                 │
   │  8. writeMcpContextFile / writeMcpWrapper / validateCaidoAuth  (unchanged)│
   └───────────────────────────────────────────────────────────────────────────┘
                                           │
                     sendCliMessage(sdk)   ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │  spawn(provider) ──┬─▶ stdout data ──▶ ★ appendBounded()  (PERF-04)       │
   │                    │                    └─▶ consumeClaudePrintChunk       │
   │                    │                          (★ bounded line buffer)     │
   │                    ├─▶ stderr data ──▶ ★ appendBounded()  (PERF-04)       │
   │                    │                                                      │
   │  250 ms setInterval ─┐                                                    │
   │  heartbeat (RPC)  ───┼─▶ flushActivities()                                │
   │  finalize()       ───┘        │                                           │
   │                               ▼                                           │
   │        ★ open(activity.jsonl) → stat → read(from cursor.offset)           │
   │              → consumeActivityChunk(cursor, bytes)  (PERF-02, pure)       │
   │              → close()                                                    │
   │                    ▲                                                      │
   │                    │ appendFileSync per event                             │
   │            ┌───────┴────────┐                                             │
   │            │ mcp-server.mjs │  (separate Node process — NOT LLRT)         │
   │            └────────────────┘                                             │
   └───────────────────────────────────────────────────────────────────────────┘

   ★ = new or rewritten in Phase 4
```

### Recommended Project Structure

```text
packages/backend/src/
├── platform.ts            # NEW — D-01's four pure functions + getSweepRoots
├── platform.test.ts       # NEW
├── fs-retry.ts            # NEW — isTransientFsError() + getRetryDelays() + withFsRetry(op, deps)
├── fs-retry.test.ts       # NEW
├── activity-tail.ts       # NEW — createActivityCursor() + consumeActivityChunk() (pure)
├── activity-tail.test.ts  # NEW
├── bounded-buffer.ts      # NEW — appendBounded() (pure)
├── bounded-buffer.test.ts # NEW
├── resolution-cache.ts    # NEW — createResolutionCache({ now }) (injected clock)
├── resolution-cache.test.ts # NEW
├── runtime-probe.ts       # NEW — buildProbeReport() + formatProbeFailure() (pure formatting)
├── runtime-probe.test.ts  # NEW
├── index.ts               # MODIFIED — the thin I/O shell + the single `import os from "os"`
├── claude-print.ts        # MODIFIED — bounded line buffer + O(n²) slicing fix
├── claude-print.test.ts   # EXTENDED — regression net for the above
└── command-resolution.ts  # UNTOUCHED in Phase 4 (Phase 6 fills its Windows arrays)
```

Six new module pairs is more files than the roadmap's "2 plans (provisional)" implies. That is deliberate: **each one converts a requirement from unverifiable to verifiable**, and every one of them is small (30–90 lines). The planner may merge `runtime-probe.ts` into `platform.ts` only if `platform.ts` stays I/O-free (SC-1) — the report formatter is pure, so this is legal, but it muddles D-01's four-function surface and is not recommended.

### Pattern 1: Pure core, thin I/O shell (the repo's existing convention)

**What:** The *decision* is a pure exported function with a sibling `.test.ts`; the *syscall* stays in `index.ts`.
**When to use:** Every single new behaviour in this phase. Five modules already follow it (`provider-launch.ts`, `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`, `persistence.ts`).
**Why it is load-bearing here:** `index.ts` is 3 004 lines with **zero** direct test coverage (`CONCERNS.md` § *`index.ts` Has Zero Direct Test Coverage`), and the maintainer cannot run Windows. Anything left inline in `index.ts` is unverified by construction.

```ts
// Source: existing repo convention — packages/backend/src/command-resolution.ts:105
export async function getCommandExecutableCandidates(input: {
  command: string;
  pathResolution?: string;
  homeDirs: string[];
}): Promise<string[]> { /* pure-ish: no spawn, no which */ }

// index.ts:877 supplies the I/O results as inputs
const candidates = await getCommandExecutableCandidates({
  command, pathResolution, homeDirs: getKnownHomeDirs(),
});
```

### Pattern 2: Stateful stream parser as `(state, chunk) => state`

**What:** A frozen-ish state object threaded through a pure reducer, exactly like `consumeClaudePrintChunk(state, chunk, handlers)`.
**When to use:** PERF-02's offset + partial-line tracking.
**Why:** It makes truncation-reset, partial-line carry-over and duplicate suppression testable without a filesystem. `claude-print.test.ts` (393 lines) is the proof that this pattern tests well in this repo.

### Pattern 3: Injected clock for TTL

**What:** `createResolutionCache({ now: () => Date.now(), ttlMs })` rather than reading `Date.now()` inline.
**When to use:** PERF-03.
**Why:** Deterministic expiry tests without `vi.useFakeTimers()` fighting the 250 ms `setInterval` elsewhere in the suite. (The repo already uses `vi.useFakeTimers()` in frontend store tests, so either works — injection is simply cheaper here.)

### Pattern 4: Retry-as-a-decision, not retry-as-a-loop

**What:** Split RUN-04 into (a) `isTransientFsError(error): boolean`, (b) `getRetryDelays(): readonly number[]`, and (c) `withFsRetry(op, { delays, sleep })` where `sleep` is injected.
**When to use:** RUN-04 / D-07.
**Why:** (a) and (b) are trivially unit-testable against synthetic error objects, and (c) is testable with `sleep: async () => {}` plus an op that throws `EPERM` twice then succeeds. **This is the only way to prove SC-3's retry ladder actually fires**, because a real Defender lock cannot be induced deterministically in CI on any runner.

### Anti-Patterns to Avoid

- **Reading `os.*` at module scope.** `const HOST = { platform: os.platform() }` at the top of `index.ts` kills the *entire plugin* on an LLRT gap — chat, settings, everything — and RUN-05 never speaks. D-02 exists for this. **Verified applicable:** the backend currently imports `os` nowhere, so this phase introduces the first load of that module into Caido's runtime.
- **Template-literal path concatenation.** `` `${host.tmpdir}/drift-mcp-${id}` `` is wrong under LLRT because `os.tmpdir()` there may already end in a separator (see § *Pitfall 1*), and wrong on Windows because `/` is the wrong separator for anything that later gets shown to a user or compared. Always `path.join`.
- **`{ ...driftVars }` without the parent spread.** Phase 3 measured `PARENT-CLEARED` on `windows-latest` ([run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574)) — the `env` option *replaces* on Windows exactly as on POSIX, and `APPDATA`/`LOCALAPPDATA` are not among libuv's eleven back-filled names. `{ ...driftVars }` alone is a defect on **either** platform, not a Windows-only one.
- **`shell: true` with dynamic args.** `.planning/research/ARCHITECTURE.md:75` proposes `buildSpawnSpec()` returning `{ command, args, shell }` with `shell:true` for batch shims. That predates Phase 3 and is **superseded** by REQUIREMENTS PRV-02 (`cmd.exe /d /s /c` argv array, never `shell:true`) and by the CVE-2024-27980 finding. It is Phase 7 scope anyway — do not import that sketch into Phase 4.
- **Naming `platform.ts`'s functions from the older research doc.** `.planning/research/ARCHITECTURE.md:269` lists `isWindows`, `tempRoot`, `whichToolName`, `homeDirsFromEnv`, `executableCandidateNames`, `buildSpawnSpec`. CONTEXT.md **D-01 supersedes all six names.** Use `getTempRoot`, `getWhichCommand`, `getHomeDirCandidates`, `getExecutableNames` exactly as written.
- **Adding a `platform !== "win32"` guard around `mode: 0o700` / `0o600`.** Unnecessary. Source-verified: LLRT's `set_mode` is a no-op returning `Ok(())` on non-unix, and Node silently ignores `mode` on Windows. Adding the guard doubles the branch count for zero behaviour change and risks a POSIX regression.
- **Holding the activity-file handle open across ticks.** On Windows an open handle blocks `rm()` of the file at `finalize()` → `EBUSY`. Open and close per tick.
- **"Cleaning up" the unused `normalizePathForCompare` export.** CONTEXT D-04 states explicitly that Phase 6 is its first caller. A lint rule for unused exports would flag it — it must not be deleted.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Temp-root discovery | `platform === "win32" ? process.env.TEMP : "/tmp"` | `os.tmpdir()` (via the D-02 probe cache) | `%TMP%` beats `%TEMP%` on Windows; SYSTEM processes get `C:\Windows\SystemTemp`; macOS uses per-user `/var/folders/…`. `GetTempPath2` encodes a four-level fallback chain no hand-rolled branch reproduces **[CITED: learn.microsoft.com GetTempPath2W]** |
| Path joining across separators | String concatenation with `"/"` or `"\\"` | `path.join` / `path.resolve` | LLRT's `join_resolve_path` already truncates a trailing separator and uses `MAIN_SEPARATOR`; hand-rolled concat produces `C:\…\Temp\/drift-mcp-x` under LLRT |
| Line-oriented incremental file reading | Manual `readFile` + `slice(lastLength)` | `open()` + positional `read()` + a byte-level partial buffer | Whole-file re-read *is* the PERF-02 bottleneck; string-level slicing corrupts multi-byte UTF-8 at chunk boundaries |
| Transient Windows FS-error classification | `if (error.message.includes("EPERM"))` | A code-set check against `EPERM \| EBUSY \| EACCES \| UNKNOWN` on `(error as NodeJS.ErrnoException).code` | libuv maps `ERROR_SHARING_VIOLATION` and `ERROR_LOCK_VIOLATION` → `EBUSY`, `ERROR_ACCESS_DENIED` → `EPERM`, `ERROR_ELEVATION_REQUIRED`/`ERROR_CANT_ACCESS_FILE` → `EACCES`, and **anything unmapped → `UNKNOWN`**. Message matching misses all of it **[VERIFIED: libuv/src/win/error.c v1.x]** |
| Backoff schedule | An ad-hoc `setTimeout(fn, Math.random()*1000)` | A fixed, exported delay array (`getRetryDelays()`) | Testable, reviewable, and the shape is what SC-3 grades |
| UUID generation | `crypto.randomUUID()` | The existing `genUUID()` hex loop at `index.ts:829` | Blocked by Phase 3's P3-UUID (node-vehicle result, zero LLRT confirmation in either direction) |
| Plugin-version detection for D-08 | A new manifest reader | **`detectPluginVersion()` already exists** at `index.ts:455` and populates `pluginVersion` (`:129`) at init (`:2957`) | It already walks four candidate paths (`manifest.json`, `../manifest.json`, `package.json`, `../../package.json`) with per-candidate `try`/`catch`. D-08 just reads the module variable |
| Process/OS facts for D-08 | Bare `process.version` | The existing `globalThis as typeof globalThis & { process?: … }` guard shape at `index.ts:2838` | Already the repo's defensive pattern for an uncertain runtime; `exportSupportBundle` uses exactly this for `platform`/`arch`/`version` |
| Re-entrancy protection on the activity flush | A new lock | The existing closure-local `readingActivities` boolean at `index.ts:2151` | Already correct and already per-session by closure scope |
| Per-session cursor storage | A new `Map<sessionId, cursor>` | A closure-local `const cursor = { offset: 0, partial: EMPTY }` inside `sendCliMessage` | All three callers (`setInterval` `:2261`, `runWatchdog` `:2273`, `finalize` `:2363`) close over the same scope — per-session by construction, and it dies with the turn. A Map would need explicit cleanup and could leak |

**Key insight:** Almost everything this phase needs already exists in the file, one abstraction level down. The work is *extraction and hardening*, not invention — which is also why the pure/impure split is cheap here rather than a rewrite.

---

## Runtime State Inventory

> This phase is a path migration: `/tmp/drift-mcp-*` → `os.tmpdir()/drift-mcp-*`. Runtime state survives that change.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | **None.** SQLite (`drift_settings` table: keys `settings`, `chats`) stores no filesystem paths — verified by reading `loadJson`/`saveJson` (`index.ts:219–254`) and `getPersistenceDbHandle`. `pluginPath/settings.json` + `chats.json` backups likewise contain no temp paths | None |
| **Live service config** | **`gemini mcp add drift -- <wrapperPath>` and `codex mcp add drift`** write an absolute `/tmp/drift-mcp-<uuid>/mcp-wrapper.sh` path into the CLIs' own config files, outside git and outside Drift's control (`index.ts:1587–1590`). After the temp root moves, a *stale* registration from a previous run points at a path that no longer exists. **Mitigating fact:** `registerMcpWithCli` already does a best-effort `mcp remove drift` before every `mcp add` (`:1587`), and registration re-runs on every `startMcpServer`. So a stale entry is overwritten on the next MCP start, not orphaned indefinitely | **Code edit only** — no migration. Confirm the pre-clean `mcp remove` stays in place; do not add a separate migration step |
| **OS-registered state** | **None.** No Task Scheduler / launchd / systemd / pm2 registration. Drift's only long-lived process is the MCP server, spawned per session and killed with the turn | None |
| **Secrets / env vars** | **None renamed.** `CAIDO_URL`, `CAIDO_TOKEN`, `DRIFT_CONTEXT_FILE`, `DRIFT_ALLOWLIST_ACTIVE`, `DRIFT_ALLOWED_TOOLS`, `DRIFT_CONFIRMATION_REQUIRED_TOOLS`, `DRIFT_CONFIRM_SENSITIVE_ACTIONS`, `DRIFT_ACTIVITY_FILE`, `DRIFT_APPROVALS_FILE` all keep their names. Their *values* become `os.tmpdir()`-rooted, which is transparent to `mcp-server.mjs` (it reads whatever path it is given) | None |
| **Build artifacts** | **None stale.** `dist/plugin_package/` and `dist/drift.zip` are rebuilt from source by `caido-dev build`; no compiled path constants | None |
| **★ Orphaned filesystem state (the real one)** | **`/tmp/drift-mcp-*` directories left by the currently-shipped 0.1.0.** These carry the Caido token inside `mcp-wrapper.sh`. After the switch, `sweepOrphanedMcpTempDirs` scans `os.tmpdir()` — which on **macOS is `/var/folders/…`, not `/tmp`** — so those legacy dirs would *never be swept again*. This is a credential-exposure regression introduced by the fix | **Data migration required.** Ship the legacy sweep arm: on non-`win32`, also scan `/tmp` when it differs from `host.tmpdir`, same `drift-mcp-*` filter, same `!== mcpTempDir` guard. CONTEXT records this as Claude's Discretion with default **SHIP IT** |

**The canonical question, answered:** after every file in the repo is updated, the only runtime state still holding the old string is (a) token-bearing `/tmp/drift-mcp-*` directories on existing macOS/Linux installs, and (b) a stale `drift` MCP entry in Gemini's/Codex's own config, which self-heals on the next `startMcpServer`. (a) needs a deliberate sweep arm; (b) does not.

---

## Windows Transient-Filesystem-Error Taxonomy (RUN-04 / D-07)

This is the phase's highest-value external research question. Answers, with provenance.

### Which error codes actually appear

libuv's Windows error translator is the authority, because it is what turns a Win32 `GetLastError()` into the `.code` string Node exposes **[VERIFIED: libuv/src/win/error.c, v1.x branch]**:

| Win32 error | libuv result | Node `.code` | Typical AV/indexer cause |
|---|---|---|---|
| `ERROR_SHARING_VIOLATION` | `UV_EBUSY` | `EBUSY` | Defender holds the file open with a share mode that excludes your access |
| `ERROR_LOCK_VIOLATION` | `UV_EBUSY` | `EBUSY` | Byte-range lock held by the scanner |
| `ERROR_PIPE_BUSY` | `UV_EBUSY` | `EBUSY` | (not relevant to file writes) |
| `ERROR_ACCESS_DENIED` | `UV_EPERM` | `EPERM` | The most common Defender/indexer symptom; also a genuinely read-only dir |
| `ERROR_PRIVILEGE_NOT_HELD` | `UV_EPERM` | `EPERM` | Non-transient |
| `ERROR_ELEVATION_REQUIRED` | `UV_EACCES` | `EACCES` | Non-transient |
| `ERROR_CANT_ACCESS_FILE` | `UV_EACCES` | `EACCES` | Can be transient (redirected/offline file) |
| **anything unmapped** | **`UV_UNKNOWN`** | **`UNKNOWN`** | Third-party AV filter drivers returning nonstandard NTSTATUS values land here — which is exactly why the roadmap names `UNKNOWN` |

> **Important caveat:** Caido's LLRT does **not** use libuv. It uses `tokio::fs` / `std::fs`, which surface `std::io::Error` from the same Win32 calls. The *Win32* error is identical; the *string* LLRT attaches may not be. LLRT's `fs` wrappers throw via `or_throw_msg(&ctx, "…")` with a human message rather than a structured `.code`. **Plan defensively: classify on `error.code` when present, and fall back to a message-substring check for the four codes.** This is one place where a message check is justified rather than lazy. `[ASSUMED]` — inferred from `llrt_utils::result::ResultExt` usage in the fork; not measured.

**Recommended code set for `isTransientFsError`:** `EPERM`, `EBUSY`, `EACCES`, `UNKNOWN`. Do **not** include `ENOENT` (a missing parent is a real bug), `ENOSPC`, or `EROFS` (retrying a read-only volume just delays the honest error by 1.5 s).

### Which operations need the ladder

| Operation | Needs retry? | Evidence |
|---|---|---|
| `mkdir(dir, { recursive, mode })` | **Yes** | Directory creation trips the same filter-driver path; npm's arborist retries `EPERM`/`EACCES`/`EBUSY` around bin-link creation |
| `writeFile(path, content)` | **Yes** | The primary D-07 site — `mcp-server.mjs` is a fresh executable-ish file, exactly what real-time scanning targets |
| **`rename(tmp → final)`** | **Yes — this is the single best-documented case** | `fs.rename` uses `MoveFileEx`, which is not atomic and honours share modes. graceful-fs patches it specifically; npm's `write-file-atomic` issue #227 exists because it *doesn't*. Drift's `writeLaunchScript` does exactly `.tmp` → `rename` (`index.ts:307–316`) |
| `spawn(justWrittenFile)` | **Probably — but out of Phase 4 scope** | Phase 3 measured `EINVAL` from the CVE-2024-27980 `.cmd` guard, not an AV lock. `EPERM`/`EBUSY` "from a Defender handle" is named in the probe's own P1-CMD copy as an equally-conclusive surface. Phase 5 owns the spawn path — record the taxonomy here, apply it there |
| `rm(dir, { recursive, force })` | **Yes, but best-effort only** | `cleanupMcpRuntime` already catches and logs. **LLRT's `rm` supports no `maxRetries`** (source-verified), and a failed cleanup leaves a token-bearing dir that the *next* start's sweep will remove. Do not add a blocking ladder here |

### What backoff shape actually works

Three ecosystem precedents, all real code:

| Source | Codes | Shape | Total budget |
|---|---|---|---|
| **graceful-fs** `polyfills.js` (rename only) | `EACCES`, `EPERM`, `EBUSY` | start 0 ms, `+10 ms` per retry, capped at 100 ms, poll `fs.stat(to)` between tries | **60 000 ms** |
| **npm/cli PR #9028** (arborist bin-links) | `EPERM`, `EACCES`, `EBUSY`, gated on `process.platform === 'win32'` | `{ retries: 5, minTimeout: 500 }` via `promise-retry` (default factor 2 → 500/1000/2000/4000/8000) | ~15 500 ms |
| **Node `fs.rm`** built-in | `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY`, `EPERM` | linear: `retryDelay * attempt`, defaults `maxRetries: 0`, `retryDelay: 100` | opt-in |

**Verdict on ROADMAP SC-3's "~5 attempts, 50–500 ms":** **directionally correct, and the right choice for this specific site — but only because of where it sits.** The two long-budget precedents (60 s, 15.5 s) are batch tools where a 60-second stall is invisible. Drift's ladder wraps `startMcpServer`, which the user is *watching* — a 15-second freeze on the "Start MCP" button is a worse UX than an actionable error. SC-3's shape sums to ≤ 1.5 s, which is inside the human tolerance for a button press and covers the observed Defender scan window for a ~30 KB file.

**Recommended concrete ladder:**

```ts
// fs-retry.ts
export const FS_RETRY_DELAYS_MS = [50, 100, 200, 400, 750] as const;  // 5 retries, 1500 ms total
```

Rationale for each choice, so the planner can defend or change it:
- **6 total attempts (1 + 5 retries)** matches SC-3's "~5 attempts" reading either way.
- **Geometric-ish growth** rather than graceful-fs's linear `+10 ms`: graceful-fs polls a `stat` between tries so its short delays are cheap; Drift does not, so short delays would burn attempts inside one scan window.
- **1 500 ms ceiling** is the number to defend. It is well under the user-perceptible-stall threshold on a button press and an order of magnitude under either npm precedent. If the reporter's real machine still fails, the *right* escalation is to widen this array — which is why it is an exported constant, not an inline literal.
- **Do not add jitter.** Drift is a single writer to a private per-run directory; there is no thundering herd, and jitter would make the test non-deterministic for zero benefit.

---

## MAX_PATH Budgeting (SC-3)

### The real limit

`MAX_PATH` is 260 **including** the terminating NUL, so 259 usable characters for a fully-qualified path **[CITED: learn.microsoft.com/windows/win32/fileio/maximum-file-path-limitation]**. Getting past it requires *both* the `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` DWORD **and** a `longPathAware` application manifest — and Drift controls neither, because the process is Caido's. **Assume 259 and do not rely on long-path opt-in.**

One helpful bound: `GetTempPath2W`'s documented maximum return is `MAX_PATH+1` (261), so `os.tmpdir()` is itself constrained on Windows in the common case.

### The measured budget

Longest path Drift constructs today, decomposed:

| Component | Chars | Source |
|---|---:|---|
| Temp root — CI runner 8.3 form `C:\Users\RUNNER~1\AppData\Local\Temp` | **36** | Phase 3 P0-TMP, measured |
| Temp root — realistic long form `C:\Users\alexander.hamilton\AppData\Local\Temp` | 46 | worst realistic profile name |
| `\` + `drift-mcp-` + 36-char UUID | **47** | `index.ts:1716` |
| `\` + longest leaf: `copilot-mcp-chat-<13 digits>-<4 chars>.json` | **41** | `index.ts:2004`, chatId from `chat.ts:121` |
| **Worst case total** | **124 – 134** | |
| **Headroom against 259** | **125 – 135** | |

Other leaves, for completeness: `mcp-activity-drift-<13>.jsonl` = 38, `mcp-approvals-drift-<13>.json` = 38, `provider-launch-drift-<13>.sh` = 38, `mcp-wrapper-drift-<13>.sh` = 34, `mcp-<chatId>.json` = 32, `mcp-context.json` = 16, `mcp-server.mjs` = 14.

**Verdict: MAX_PATH is a LOW-probability risk for Drift, not a live defect.** It only bites when the temp root itself exceeds `259 − 88 = 171` characters — i.e. `%TMP%` redirected to a deep roaming profile, a UNC share, or a Citrix/VDI redirect. That is real but rare, and it is not what the reported Windows bug was.

### Recommended scheme

Change **only** the directory component; leave every filename alone.

```
BEFORE: drift-mcp-<36-char UUID>          → 46 chars + separator = 47
AFTER:  drift-mcp-<20 hex chars>          → 30 chars + separator = 31   (saves 16)
```

Why this specific shape:
1. **Keeps the `drift-mcp-` prefix.** The orphan sweep filters on `name.startsWith("drift-mcp-")` (`index.ts:1684`). Keeping the prefix means the new build's sweep still finds *old* 0.1.0 directories — which is the same property the legacy `/tmp` arm exists to preserve. Changing the prefix would silently orphan every pre-upgrade token-bearing dir.
2. **20 hex characters = 80 bits nominal**, far past any local-attacker enumeration budget inside the seconds-long window before the `0o700` mode lands. Honest caveat: the *real* entropy is bounded by `Math.random()`'s PRNG state, not by the string length — a longer name buys no additional security, which is precisely why shortening it costs nothing.
3. **Does not touch `mcp-activity-<sessionId>` / `copilot-mcp-<chatId>`.** Phase 2's SEC-02 will validate `sessionId`/`chatId` against a strict charset *before* they are interpolated into paths. Changing their derivation here would force SEC-02 to be re-designed against a moving target. CONTEXT flags exactly this coupling.
4. New worst case: **36 + 31 + 41 = 108 chars**, headroom 151, and the temp root may now be up to 187 characters before anything breaks.

### The cheap guard-rail worth adding

The one thing Drift genuinely cannot know is how long *this user's* temp root is. Convert it from an unknowable into a diagnostic: have the RUN-05 probe **report** (never gate — D-06) the temp-root length and the projected worst-case path length. Two integers in the probe report and `getDiagnostics`, zero extra I/O, and it turns "MAX_PATH might bite someone" into a line a bug reporter pastes.

---

## PERF-02: Offset-Tailing Design

### Mechanism

`open()` + `FileHandle.read(buffer, offset, length, position)` — not a stream. `createReadStream` is absent from Caido's LLRT `fs` surface and is not imported by `index.ts`; `open as openFile` already is (`index.ts:2`, used at `:371`).

### The algorithm

```
per tick (guarded by the existing `readingActivities` flag):
  handle = await openFile(path, "r")
  try:
    size = (await handle.stat()).size
    if size < cursor.offset:  cursor.reset()        # truncation / rotation
    if size === cursor.offset: return                # nothing new — the common case
    length = min(size - cursor.offset, MAX_TICK_BYTES)
    buffer = Buffer.alloc(length)                    # ← EXACT size. See Pitfall 3.
    { bytesRead } = await handle.read(buffer, 0, length, cursor.offset)
    cursor.offset += bytesRead
    { events, cursor } = consumeActivityChunk(cursor, buffer.subarray(0, bytesRead))
  finally:
    await handle.close()
```

`consumeActivityChunk` is the pure part and lives in `activity-tail.ts`:

```
consumeActivityChunk(cursor, bytes):
  merged   = Buffer.concat([cursor.partial, bytes])
  lastNL   = merged.lastIndexOf(0x0A)
  if lastNL === -1: return { events: [], cursor: { ...cursor, partial: merged } }
  complete = merged.subarray(0, lastNL).toString("utf-8")
  partial  = merged.subarray(lastNL + 1)             # ← stays a Buffer. See Pitfall 4.
  events   = complete.split("\n").filter(nonEmpty).flatMap(safeJsonParse)
  return { events, cursor: { offset: cursor.offset, partial } }
```

### Design notes

- **State lives in a closure, not a Map.** All three callers — the 250 ms `setInterval` (`index.ts:2261`), `runWatchdog` (`:2273`), and `finalize()` (`:2363`) — close over the same `sendCliMessage` scope, so `const cursor = { offset: 0, partial: EMPTY_BUFFER }` is per-session by construction and dies with the turn. A Map would need explicit cleanup and could leak on an unhandled path.
- **`seenActivityIds` stays.** The offset makes re-delivery unlikely, not impossible (a truncation reset re-reads from 0). The existing dedupe Set at `index.ts:2150` is the correctness backstop and must not be removed as "now redundant".
- **Open/close per tick, not a persistent handle.** 4 opens/second is negligible; a held handle blocks `rm(activityFilePath)` at `finalize()` on Windows with `EBUSY`.
- **`MAX_TICK_BYTES`** bounds the per-tick allocation. 1 MiB is generous — the writer emits one `JSON.stringify(event)` line per tool call.
- **The file is pre-created** (`writeFile(activityFilePath, "")`, `index.ts:615`), so `ENOENT` is not the normal path — but keep the surrounding `try`/`catch` (it is best-effort by design).
- **Partial lines are real, not theoretical.** `mcp-server.mjs` writes with `appendFileSync(file, JSON.stringify(event) + "\n")` (`mcp-server.mjs:82`) — a single append, but `resultSummary` can be large enough that the reader observes a torn write.

---

## PERF-04: Bounded Buffer Design

Two sites, two genuinely different hazards. Treating them with one policy is the mistake to avoid.

### Site A — the `stdout` / `stderr` accumulators

`index.ts:1524–1525` (`spawnAndWait`), `:2484` (`stdout += text`), `:2573` (`stderr += text`). Hazard: **total volume**. A runaway CLI can grow an unbounded string in the Caido backend's heap.

| Accumulator | Recommended cap | Retention | Rationale |
|---|---|---|---|
| `sendCliMessage` **stdout** | **2 MiB** | **both ends** (1 MiB head + 1 MiB tail) | For gemini/codex/copilot this string *is* the chat answer (`index.ts:2332`, `:2340`). The opening of an answer matters to a reader and so does the conclusion; a middle-drop preserves both. 2 MiB is ~20× a long answer while bounding heap |
| `sendCliMessage` **stderr** | **256 KiB** | **tail** | stderr is diagnostics; the *last* error is the actionable one, and warnings pile up ahead of it |
| `spawnAndWait` **stdout** | **1 MiB** | **head** | Consumers read line 1 (`which` output, `node --version`) or a short `mcp add` acknowledgement |
| `spawnAndWait` **stderr** | **256 KiB** | **tail** | Same reasoning as above |

Marker convention — one string, greppable, byte-count included so a reader knows what they lost:

```
\n…[drift: truncated 4194304 bytes]…\n
```

Note that Node's own precedent (`child_process.exec` `maxBuffer`, default 1 MiB) **kills the child** on overflow. Drift must not: killing the CLI mid-answer converts a cosmetic problem into a lost turn. Truncate and keep reading.

### Site B — `claude-print.ts`'s line buffer (`:148–160`)

Hazard is **not** total volume. It is (1) a single never-terminated line, and (2) an O(n²) slicing loop that the current code runs on *every* chunk.

```ts
// claude-print.ts:153-160 — today
let newlineIndex = nextState.buffer.indexOf("\n");
while (newlineIndex !== -1) {
  const line = nextState.buffer.slice(0, newlineIndex).trim();
  nextState = { ...nextState, buffer: nextState.buffer.slice(newlineIndex + 1) };  // ← copies the whole remainder, per line
  newlineIndex = nextState.buffer.indexOf("\n");                                    // ← rescans from 0, per line
  …
}
```

For a chunk containing *k* lines totalling *n* characters this is O(k·n) in copying **plus** k full object spreads. Claude's `stream-json` emits many small events per chunk, so k is routinely 10–50.

**Two distinct fixes, both required:**

1. **Bound the buffer.** Cap at **4 MiB**. On exceed, **drop the buffer entirely** and increment a `droppedBytes` counter on the state — do *not* truncate-and-parse, because a truncated JSON line is unparseable and would just be silently discarded by the existing `catch { continue; }`. Surface `droppedBytes` in the finalised text and in diagnostics so a dropped tool result is visible rather than a silent hole. 4 MiB is deliberately generous: a legitimate `tool_result` content block can be large, and dropping a real one is worse than holding it briefly.
2. **Fix the slicing.** Split the concatenated buffer on `"\n"` once per chunk, `pop()` the trailing fragment as the new buffer, and iterate the complete lines. Behaviour-identical, O(n) instead of O(k·n), and one state spread per *chunk* instead of per *line*.

`claude-print.test.ts` (393 lines) is the regression net for (2) — it must stay green byte-for-byte, and new cases should cover the (1) drop path.

---

## PERF-03: Resolution Cache Design

### The asymmetry the planner must know first

**Node resolution is already cached — infinitely, and with no invalidation at all.**

```ts
// index.ts:1558-1562
async function requireNodeExecutable(): Promise<Result<string>> {
  const nodeExecutable = lastNodeExecutable || await getNodeExecutable();
  …
}
```

`lastNodeExecutable` (`index.ts:119`) is set on success and never cleared except inside `getNodeExecutable()` itself on total failure. It survives settings saves, MCP restarts, and provider changes. So for `node`, PERF-03 is **replacing an unbounded cache with a bounded one** — a *tightening*, not an addition. For providers, `resolveCommand` (`index.ts:848`) has no cache at all and does the full `spawn("which")` + version-manager directory walk on every `checkProvider` call.

Both must go through the same cache, or the phase produces two inconsistent behaviours.

### Recommended policy

| Aspect | Recommendation | Rationale |
|---|---|---|
| **Positive TTL** | **5 minutes** | A resolved binary path is stable across a work session. A stale hit costs one failed spawn, and `getNodeExecutable` already re-walks when the cached path fails |
| **Negative TTL** | **30 seconds** — cache misses too, but briefly | CONTEXT names the real trade-off: not caching misses repeats the *expensive* walk (readdir + stat per version dir per home dir) precisely in the slow case. 30 s bounds the "I just installed node and Drift can't see it" window to something a user will not notice, while collapsing the repeated walk during a burst of turns |
| **Invalidation (required by SC-6)** | Clear the whole cache when **any** `providers[*].command` differs from the previous settings object | Cheap and total. Per-key invalidation invites a missed key |
| **Explicit bypass** | `checkProviderAvailability` (the user's manual "Check" button) **must bypass the cache** | This is the escape hatch that makes any TTL choice safe. The user who just installed a CLI presses this button; if it returns a cached miss, the cache is a bug rather than an optimisation |
| **Diagnostics** | Add `nodeExecutableCachedAt` / cache-age fields to `getDiagnostics` | Turns a confusing stale result into a self-explaining one |
| **Clock** | Injected `now()` | Deterministic expiry tests |

---

## Common Pitfalls

### Pitfall 1: `os.tmpdir()` returns a trailing separator under LLRT but not under Node

**What goes wrong:** Every Phase 3 measurement and every local test runs under Node, where `os.tmpdir()` has stripped trailing separators since v2.0.0 (documented as a breaking change: *"This function is now cross-platform consistent and no longer returns a path with a trailing slash on any platform"*). Under Caido's LLRT, `os.tmpdir()` is `std::env::temp_dir()`, which is `GetTempPath2` on Windows — **"The returned string ends with a backslash, for example, `C:\TEMP\`"** — and `$TMPDIR` on macOS, which launchd conventionally sets *with* a trailing slash. Code that passes on CI silently produces `C:\Users\x\AppData\Local\Temp\/drift-mcp-abc` in production.

**Why it happens:** Node normalises; Rust does not. Phase 3's vehicle caveat ("the platform is measured, the runtime is inferred") covers exactly this class, and this is the first concrete instance of it.

**How to avoid:**
- **Always `path.join`.** LLRT's `join_resolve_path` explicitly truncates a trailing separator before appending (source-verified). Never template-literal concatenation.
- **Never assert on the shape of `host.tmpdir`.** A test asserting "no trailing separator" would pass on CI and be wrong about production.
- **Treat `getTempRoot({ platform, tmpdir })` as the normaliser.** It is the natural home for a defensive trailing-separator strip, and being pure it is trivially testable with both spellings as inputs.

**Warning signs:** a doubled separator in any logged path; `readdir` succeeding while a `startsWith` comparison against the same root returns false.

### Pitfall 2: `os.platform()` returning a value the narrow union does not cover

**What goes wrong:** D-06 gates on "`os.platform()` returns a recognised value" precisely because an unrecognised one silently takes the POSIX arm — which on Windows *is* the reported bug reintroduced one layer up.

**Why it happens:** Caido's LLRT hardcodes `PLATFORM` at compile time: `"darwin"` on macOS, `"win32"` on Windows, and `std::env::consts::OS` everywhere else (source-verified, `libs/llrt_utils/src/sysinfo.rs`). That third arm yields `"linux"` on Linux — but also `"freebsd"`, `"android"`, etc. on other targets. Node's `os.platform()` documents `'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32'` plus experimental `'android'`.

**How to avoid:** Normalise once, at the probe, with an explicit allow-list check. Gate on failure per D-06. Do **not** widen `Platform` to `NodeJS.Platform` to "handle" it — the narrow union is what forces the check to exist.

**Warning signs:** a `switch` on platform with a `default:` that falls through to POSIX behaviour.

### Pitfall 3: LLRT's `FileHandle.read` panics unless `length === buffer.byteLength - offset`

**What goes wrong:** The read returns garbage, throws an opaque error, or aborts the Rust host.

**Why it happens:** LLRT's implementation ends with

```rust
let mut buf = vec![0u8; length];
// … read into buf …
dst_buf[offset..].copy_from_slice(&buf);
```

`copy_from_slice` requires source and destination slice lengths to match exactly. `validate_length_offset` only checks `length <= buffer_length - offset`, so a *smaller* explicit `length` passes validation and then panics. Node has no such constraint, so this cannot be caught by any local or CI test.

**How to avoid:** allocate the buffer to the exact number of bytes you intend to read, pass `offset = 0`, and pass `length = buffer.byteLength` (or omit `length` and let it default). Never reuse one large buffer with a smaller per-read `length`. Also note the source comment `position: Opt<Option<u64>>, // -1 is not supported` — pass a non-negative offset or `null`, never `-1`.

**Warning signs:** none observable on Node. This is a "get it right by construction" pitfall — put the constraint in a comment beside the `Buffer.alloc` call.

### Pitfall 4: torn multi-byte UTF-8 at the read boundary

**What goes wrong:** A tool result containing non-ASCII text (a hostname with an IDN, a response body snippet, an em-dash in a summary) gets a permanent U+FFFD replacement character where a read boundary fell mid-codepoint.

**Why it happens:** `JSON.stringify` does **not** escape non-ASCII by default — it emits raw UTF-8. If the partial-line remainder is carried across ticks as a *string*, the decode already happened and the damage is permanent.

**How to avoid:** carry the partial remainder as a `Buffer`, not a string. Decode only the complete-line prefix (`merged.subarray(0, lastNL).toString("utf-8")`). `Buffer.concat`, `subarray`, `toString(enc, start, end)` and `lastIndexOf` are all confirmed present in Caido's LLRT `buffer` surface.

**Warning signs:** `` in activity summaries, appearing only for long tool results.

### Pitfall 5: fixing the claude-print buffer bound without fixing the slicing

**What goes wrong:** The memory leak is capped but the CPU cost stays, and under Caido's single-threaded event loop that cost blocks the very RPC keep-alive the watchdog depends on.

**Why it happens:** the two problems look like one. Bounding the buffer addresses the never-terminated-line case; it does nothing for the per-line `slice` + spread in the normal case.

**How to avoid:** treat them as two changes with two tests — a bound test (feed 5 MiB with no newline, assert drop + counter) and a behaviour-preservation test (the existing 393-line suite must stay green after the split-once refactor).

**Warning signs:** UI streaming that stutters proportionally to the length of the response so far.

### Pitfall 6: the probe running after the sweep

**What goes wrong:** `sweepOrphanedMcpTempDirs` currently runs at `index.ts:1710`, *before* `mcpTempDir` is assigned at `:1716`. After the change the sweep needs `host.tmpdir`, so if the probe has not run yet it either crashes or silently sweeps nothing.

**How to avoid:** reorder — probe first, then sweep, then temp-dir creation. CONTEXT's *Integration Points* states this explicitly. Note also that the sweep's existing `dir !== mcpTempDir` guard is comparing against an `undefined` `mcpTempDir` at that point today, which is harmless only because every candidate is a string.

**Warning signs:** orphan dirs accumulating; a `TypeError` on `undefined.tmpdir` at MCP start.

### Pitfall 7: assuming Caido's LLRT matches its own `API.md`

**What goes wrong:** A capability is written off as absent (or assumed present) on the strength of a stale document.

**Why it happens:** `caido/dependency-llrt@main`'s `API.md` **omits** `fs/promises.open`, `lstat`, `lstatSync`, `path.sep` and `path.relative` — all of which are declared in the same repository's Rust source. The document trails the code.

**How to avoid:** for any capability this phase depends on, read `modules/llrt_*/src/*.rs` and check the `declare.declare("…")` / `exports.set("…")` lists, not `API.md`. And keep the honest ceiling in view: the fork's `main` was last pushed 2026-04-22 and Caido may ship a different commit — **source analysis raises confidence, it does not close the gap.** Only a real Windows Caido install does that (Phase 9/10).

**Warning signs:** a plan that cites `API.md` as evidence of absence.

### Pitfall 8: `process.execPath` is undefined under Caido

**What goes wrong:** `getNodeExecutableCandidates({ execPath: processRef.process?.execPath, … })` (`index.ts:1536`) contributes nothing in production, so the first and most reliable candidate is always missing.

**Why it happens:** Caido's LLRT `process` object sets `env`, `cwd`, `argv0`, `argv`, `id`, `platform`, `arch`, `hrtime`, `release`, `version`, `versions`, `exitCode`, `exit`, `kill` — and **not** `execPath` (source-verified, `modules/llrt_process/src/lib.rs`).

**How to avoid:** nothing to fix in Phase 4 — the optional chaining already handles it and `pushUniqueCandidate` drops `undefined`. But **do not** treat `execPath` as a fallback when reasoning about Phase 6's resolution ordering, and do not "restore" it as a Windows candidate. Record it so Phase 6 does not rediscover it the hard way.

**Warning signs:** a Phase 6 plan that assumes `process.execPath` gives a free `node.exe` on Windows.

---

## Code Examples

### 1. The runtime probe wrapping the real first write (RUN-05 + RUN-04, D-02/D-05/D-06/D-07)

```ts
// index.ts — new section, ASCII box header per CLAUDE.md convention
// ── Runtime probe ───────────────────────────────────────────────────
import os from "os";                       // the FIRST os import in the backend bundle
import { getTempRoot, type Platform } from "./platform";
import { withFsRetry } from "./fs-retry";
import { buildProbeReport, formatProbeFailure } from "./runtime-probe";

type HostFacts = { platform: Platform; tmpdir: string };

let host: HostFacts | undefined;           // D-02: the ONLY cache; every site reads this
let lastProbeReport: Record<string, string> = {};

function probeRuntime(): Result<HostFacts> {
  let platform: string | undefined;
  let tmpdir: string | undefined;
  try {
    platform = os.platform();              // D-06: gates
    tmpdir = os.tmpdir();                  // D-06: gates
  } catch {
    // fall through with both undefined — D-05: hard-fail on EVERY OS
  }

  const normalized = normalizePlatform(platform);          // pure, from platform.ts
  const facts =
    normalized !== undefined && typeof tmpdir === "string" && tmpdir !== ""
      ? { platform: normalized, tmpdir }
      : undefined;

  // D-06: reported, never gating. Each read individually guarded.
  lastProbeReport = buildProbeReport({
    platform, tmpdir,
    realpathAvailable: detectRealpathAvailability(),        // ladder rung 1 presence only
    windowsEnv: normalized === "win32" ? readWindowsEnvNames() : undefined,
    version: readVersionBlock(),                            // D-08
  });

  if (facts === undefined) return err(formatProbeFailure(lastProbeReport));
  host = facts;
  return ok(facts);
}

// D-08: every read individually guarded, "unavailable" on failure.
// detectPluginVersion() already exists (index.ts:455) and populates pluginVersion (:129).
function readVersionBlock(): Record<string, string> {
  const g = globalThis as typeof globalThis & {
    process?: { version?: string; versions?: Record<string, string> };
  };
  const safe = <T,>(read: () => T | undefined): string => {
    try { const v = read(); return v === undefined ? "unavailable" : String(v); }
    catch { return "unavailable"; }
  };
  return {
    driftVersion: pluginVersion || "unavailable",
    processVersion: safe(() => g.process?.version),
    // "0.0.0" here means LLRT, not Node — a free runtime discriminator for bug reports.
    versionsNode: safe(() => g.process?.versions?.["node"]),
    versionsLlrt: safe(() => g.process?.versions?.["llrt"]),
    osPlatform: safe(() => os.platform()),
    osRelease: safe(() => os.release()),
  };
}
```

Then, in `startMcpServer`, **replacing** `:1710–1720` and preserving the existing ordering contract:

```ts
  // ORDER MATTERS: probe first — the sweep needs host.tmpdir (Pitfall 6).
  const probe = probeRuntime();
  if (probe.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", probe.error);
    return err(probe.error);
  }

  await sweepOrphanedMcpTempDirs(sdk, probe.value);

  mcpTempDir = path.join(getTempRoot(probe.value), `drift-mcp-${genShortToken()}`);
  const mcpScriptLocal = path.join(mcpTempDir, "mcp-server.mjs");

  // D-07: the probe IS this write. RUN-04's ladder and RUN-05's assertion are one mechanism.
  const written = await withFsRetry(async () => {
    await mkdir(mcpTempDir!, { recursive: true, mode: 0o700 });   // mode: no-op on Windows, safe
    await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"));
  });
  if (written.kind === "Error") {
    const message = formatProbeFailure({ ...lastProbeReport, firstWrite: written.error });
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }
```

### 2. The retry ladder as three testable pieces (RUN-04)

```ts
// fs-retry.ts — pure decision + injected sleep
export const FS_RETRY_DELAYS_MS = [50, 100, 200, 400, 750] as const;   // 1500 ms total

const TRANSIENT_CODES = new Set(["EPERM", "EBUSY", "EACCES", "UNKNOWN"]);

export function isTransientFsError(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  // LLRT surfaces fs failures as messages rather than structured .code values,
  // so a substring fallback is justified here specifically.
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [...TRANSIENT_CODES].some((c) => message.includes(c));
}

export async function withFsRetry<T>(
  operation: () => Promise<T>,
  deps?: { delays?: readonly number[]; sleep?: (ms: number) => Promise<void> },
): Promise<Result<T>> {
  const delays = deps?.delays ?? FS_RETRY_DELAYS_MS;
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try { return ok(await operation()); }
    catch (error) {
      lastError = error;
      if (!isTransientFsError(error) || attempt === delays.length) break;
      await sleep(delays[attempt]!);
    }
  }
  return err(String(lastError));
}
```

Test shape that makes SC-3 provable on Linux:

```ts
it("retries a transient EPERM and succeeds on the third attempt", async () => {
  const slept: number[] = [];
  let calls = 0;
  const result = await withFsRetry(
    async () => {
      calls += 1;
      if (calls < 3) { const e = new Error("EPERM") as NodeJS.ErrnoException; e.code = "EPERM"; throw e; }
      return "ok";
    },
    { sleep: async (ms) => { slept.push(ms); } },
  );
  expect(result).toEqual({ kind: "Ok", value: "ok" });
  expect(slept).toEqual([50, 100]);
});
```

### 3. Offset tailing with a byte-safe partial line (PERF-02)

```ts
// activity-tail.ts — pure
export type ActivityCursor = { offset: number; partial: Buffer };
export const createActivityCursor = (): ActivityCursor => ({ offset: 0, partial: Buffer.alloc(0) });

export function consumeActivityChunk(
  cursor: ActivityCursor,
  bytes: Buffer,
): { cursor: ActivityCursor; lines: string[] } {
  const merged = Buffer.concat([cursor.partial, bytes]);
  const lastNewline = merged.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    return { cursor: { offset: cursor.offset, partial: merged }, lines: [] };
  }
  const complete = merged.subarray(0, lastNewline).toString("utf-8");
  return {
    cursor: { offset: cursor.offset, partial: merged.subarray(lastNewline + 1) },
    lines: complete.split("\n").map((l) => l.trim()).filter((l) => l !== ""),
  };
}
```

```ts
// index.ts — inside sendCliMessage, replacing the readFile at :2158
const MAX_TICK_BYTES = 1024 * 1024;
let cursor = createActivityCursor();      // closure-local ⇒ per-session by construction

const flushActivities = async () => {
  if (runtimeFiles === undefined || readingActivities) return;
  readingActivities = true;
  let handle: Awaited<ReturnType<typeof openFile>> | undefined;
  try {
    handle = await openFile(runtimeFiles.activityFilePath, "r");
    const { size } = await handle.stat();
    if (size < cursor.offset) cursor = createActivityCursor();      // truncation / rotation
    if (size === cursor.offset) return;
    const length = Math.min(size - cursor.offset, MAX_TICK_BYTES);
    // Buffer sized EXACTLY to `length`: LLRT's FileHandle.read does
    // dst_buf[offset..].copy_from_slice(&buf), which requires the lengths to match.
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, cursor.offset);
    cursor.offset += bytesRead;
    const consumed = consumeActivityChunk(cursor, buffer.subarray(0, bytesRead));
    cursor = consumed.cursor;
    for (const line of consumed.lines) { /* parse → dedupe via seenActivityIds → emit */ }
  } catch {
    // Best-effort only — unchanged contract.
  } finally {
    await handle?.close().catch(() => undefined);   // per-tick close: a held handle blocks rm() on Windows
    readingActivities = false;
  }
};
```

### 4. Making SC-9 assertable rather than greppable

```ts
// platform.ts (or a tiny env.ts) — pure
export function buildSpawnEnv(
  parentEnv: Record<string, string | undefined>,
  driftVars: Record<string, string>,
): Record<string, string> {
  // Phase 3 measured PARENT-CLEARED on windows-latest: the env option REPLACES
  // the parent block on Windows exactly as on POSIX. libuv back-fills only eleven
  // names and APPDATA/LOCALAPPDATA are not among them.
  // Source: .planning/phases/03-.../03-FINDINGS.md § "P0-ENV — replace versus merge"
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  return { ...merged, ...driftVars };
}
```

```ts
it("preserves parent variables that libuv does not back-fill on Windows", () => {
  const env = buildSpawnEnv(
    { APPDATA: "C:\\Users\\x\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" },
    { CAIDO_TOKEN: "t" },
  );
  expect(env["APPDATA"]).toBe("C:\\Users\\x\\AppData\\Roaming");
  expect(env["LOCALAPPDATA"]).toBe("C:\\Users\\x\\AppData\\Local");
  expect(env["CAIDO_TOKEN"]).toBe("t");
});
```

### 5. The sweep roots as a pure function (RUN-03 + CMP-02)

```ts
// platform.ts — pure; the legacy /tmp arm is the security-relevant part
export function getSweepRoots(input: { platform: Platform; tmpdir: string }): string[] {
  const roots = [getTempRoot(input)];
  // 0.1.0 wrote token-bearing dirs to /tmp. On macOS os.tmpdir() is /var/folders/…,
  // so without this arm those dirs would never be swept again after upgrade.
  if (input.platform !== "win32" && !roots.includes("/tmp")) roots.push("/tmp");
  return roots;
}
```

```ts
it("adds the legacy /tmp arm on macOS where tmpdir is /var/folders", () => {
  expect(getSweepRoots({ platform: "darwin", tmpdir: "/var/folders/ab/cd/T/" }))
    .toEqual(["/var/folders/ab/cd/T", "/tmp"]);
});
it("does not add /tmp on Windows", () => {
  expect(getSweepRoots({ platform: "win32", tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp\\" }))
    .toEqual(["C:\\Users\\x\\AppData\\Local\\Temp"]);
});
it("does not duplicate /tmp on Linux", () => {
  expect(getSweepRoots({ platform: "linux", tmpdir: "/tmp" })).toEqual(["/tmp"]);
});
```

These three tests are the entire CMP-02 proof, and every one of them runs on the Linux CI runner.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 4 |
|---|---|---|---|
| `os.tmpdir()` returns a trailing slash | Node strips it on every platform | **Node v2.0.0** | Node and LLRT now disagree — Pitfall 1 |
| `.cmd`/`.bat` spawnable directly | Node throws `EINVAL` synchronously from the CVE-2024-27980 guard | **Node ≥ 18.20.2** | Phases 6–7; Phase 4 only ships D-03's extension-list primitive |
| MAX_PATH is an absolute 260 | Opt-in long paths via `LongPathsEnabled` **plus** a `longPathAware` manifest | Windows 10 1607 | Drift controls neither → assume 259 |
| `GetTempPath` | `GetTempPath2` (SYSTEM processes get `C:\Windows\SystemTemp`) | Windows 11 22000 / Server 2022; backported to 1607 by KB5053594 (March 2025) | LLRT's `env::temp_dir()` uses it |
| `fs.rename` retried by patching global `fs` (graceful-fs) | Explicit per-call retry with an injected sleep | ongoing | Drift cannot monkey-patch `fs` in the Caido bundle — hand-roll the ladder, borrow the policy |
| `environmentMatchGlobs` in `vitest.config.ts` | **Removed in Vitest 4**, not deprecated — per-file `// @vitest-environment` docblocks only | vitest 4 | Already handled in this repo; TESTING.md's snippet at lines 71–79 is stale relative to `vitest.config.ts` |

**Deprecated / outdated in this repo's own docs:**
- `.planning/codebase/TESTING.md` § *Environment Configuration* still shows `environmentMatchGlobs`; `vitest.config.ts` documents its removal. Ignore TESTING.md on this point.
- `.planning/research/ARCHITECTURE.md:75` (`buildSpawnSpec` → `shell:true`) is superseded by REQUIREMENTS PRV-02 and Phase 3's P1-CMD.
- `.planning/research/ARCHITECTURE.md:269` function names are superseded by CONTEXT D-01.
- `CONTEXT.md` cites `getKnownHomeDirs` at `index.ts:888`; it is at **`:890`** on `1c25cde`. Every other line reference in CONTEXT verified accurate.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Caido ships a build of `dependency-llrt` close enough to `main` (last pushed 2026-04-22) that the source-verified `os`/`fs`/`process`/`path` surfaces hold | LLRT Surface Risk | The probe's gating primitives could still be absent. **Mitigated by design** — D-02/D-05 make that a loud MCP-start error, not a dead plugin |
| A2 | Caido enables LLRT's `os` module and its `system`/`network`/`statistics` cargo features are irrelevant (the primitives Drift needs are ungated) | LLRT Surface Risk | Only gated symbols (`hostname`, `cpus`, `uptime`, `loadavg`, `machine`) would be missing; none are used |
| A3 | LLRT surfaces fs errors as messages rather than structured `.code` values | RUN-04 taxonomy | `isTransientFsError`'s substring fallback is dead code — harmless. The reverse (only `.code`, no message) is also handled |
| A4 | `os.tmpdir()` under LLRT on Windows/macOS carries a trailing separator | Pitfall 1 | If wrong, `path.join` is still correct — the recommendation is safe either way |
| A5 | Windows profile directory names stay under ~50 characters in practice, so the MAX_PATH budget holds | MAX_PATH Budgeting | A redirected `%TMP%` is the real risk; the recommended probe *report* of temp-root length converts it into a diagnostic |
| A6 | `Math.random()` in Caido's QuickJS is seeded well enough that a 20-hex-char temp-dir token is not enumerable within the creation window | MAX_PATH Budgeting | A weak seed would make the *current* 36-char UUID equally weak — shortening does not change the risk class. `CONCERNS.md` already flags `genUUID` |
| A7 | A single `appendFileSync` of a JSON line from `mcp-server.mjs` can be observed torn by the reader | PERF-02 | If never torn, the partial-line buffer is inert — costs nothing |
| A8 | 1 500 ms is inside user tolerance for the "Start MCP" button, and covers the observed Defender window for a ~30 KB file | RUN-04 backoff | If the reporter's machine still fails, widen `FS_RETRY_DELAYS_MS` — which is why it is an exported constant |
| A9 | 2 MiB / 256 KiB / 4 MiB caps are generous for real chat answers and tool results | PERF-04 | A truncated legitimate answer. Mitigated by the explicit byte-count marker making truncation visible rather than silent |
| A10 | 5 min positive / 30 s negative TTL matches Drift's turn cadence | PERF-03 | Mitigated by the mandatory cache bypass on `checkProviderAvailability` |
| A11 | Rust `std::fs` transparently handles >MAX_PATH paths via verbatim `\\?\` conversion, so LLRT's fs calls are less MAX_PATH-bound than `CreateProcess` | MAX_PATH Budgeting | Only affects how *conservative* the budget needs to be; the arithmetic already assumes the strict 259 limit |

---

## Open Questions

1. **Does Caido's shipped LLRT build match `caido/dependency-llrt@main`?**
   - What we know: the fork exists, is not archived, last pushed 2026-04-22, and its Rust source declares every primitive Phase 4 depends on. Its own `API.md` is demonstrably stale relative to that source.
   - What's unclear: which commit Caido actually bundles, and whether Caido's plugin sandbox restricts module access on top of what LLRT exposes.
   - Recommendation: **do not treat source analysis as measurement.** Every Phase 4 plan carries Phase 3's vehicle caveat verbatim. The probe's *reported* (non-gating) fields are the mechanism that will answer this the first time a real user runs it — design the report so the answer is legible.

2. **Is `realpath` genuinely absent from Caido's LLRT, or merely undocumented like `open`?**
   - What we know: `open`, `lstat`, `path.sep`, `path.relative` are all absent from `API.md` but present in the source. `realpath` is absent from **both** — no `realpath` symbol anywhere in `modules/llrt_fs/`.
   - What's unclear: nothing, for upstream `main`. Only whether Caido's build adds it.
   - Recommendation: build D-04's ladder assuming it lands on `path.resolve` under Caido. Have the probe **report** which rung was reached (`realpathSync.native` / `fs.realpath` / `path.resolve`) so Phase 6 designs against the measured answer rather than the hoped one. **This is the highest-value single field in the probe report.**

3. **Can the RUN-04 ladder ever be observed firing on real hardware?**
   - What we know: the mechanism is unit-provable with an injected error. A real Defender lock cannot be induced deterministically on a GitHub runner.
   - What's unclear: whether the chosen delays are long enough on a cold, heavily-scanned machine.
   - Recommendation: log every retry attempt through `sdk.console` with the code and the attempt index, and put the retry count in `getDiagnostics`. Then the reporter's next bug report answers it for free. Treat the delay array as tunable-on-evidence.

4. **Should Phase 4 add a `windows-latest` CI leg, or wait for Phase 9's CI-01?**
   - What we know: CI-01 is Phase 9. Phase 3's probe workflow still exists but is scoped to the seven assertions and is deleted in Phase 9.
   - What's unclear: whether the planner considers Phase 4's Windows-only assertions (real `os.tmpdir()` shape, real path lengths) worth pulling CI-01 forward.
   - Recommendation: **do not pull CI-01 forward.** With the pure/impure split, everything Phase 4 needs to prove is Linux-provable, and the genuinely Windows-only facts were already measured by Phase 3's P0-TMP. Adding a Windows leg here duplicates Phase 9's scope for marginal signal.

5. **Does `mcp-runtime.ts` need a companion change for the trailing-separator case?**
   - What we know: `serializeMcpRuntimeContext` writes paths into `mcp-context.json`, consumed by `mcp-server.mjs` under real Node.
   - What's unclear: nothing found — the context file carries project/filter identifiers, not temp paths (verified by reading `buildMcpRuntimeEnv` at `index.ts:577`).
   - Recommendation: no change. Recorded so the planner does not re-derive it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build, test, typecheck | ✓ | v26.7.0 local; CI matrix 20/22/24/26; `.nvmrc` pins 20 | — |
| pnpm | all scripts | ✓ | 9.0.0 (`packageManager`-pinned) | — |
| vitest | every new `.test.ts` | ✓ | 4.0.18 | — |
| TypeScript / `vue-tsc` | `pnpm typecheck` | ✓ | 5.5.4 / 3.2.5 | — |
| ESLint | `pnpm lint --max-warnings 0` | ✓ | 10.8.1, flat config at `eslint.config.mjs` | — |
| `os` module in Caido's LLRT | RUN-05 probe (D-02) | **source-verified, not executed** | `caido/dependency-llrt@main` | **None — D-05 hard-fails by design.** This is the phase's single hard dependency |
| `fs/promises.open` + `FileHandle.read` in Caido's LLRT | PERF-02 | **source-verified, not executed** | ibid. | Fall back to today's whole-file `readFile` if the probe reports `open` unavailable — but no such fallback is planned, and the existing `catch` already degrades to "no activities this tick" |
| `realpathSync.native` in Caido's LLRT | D-04 ladder rung 1 | **✗ — verified absent from the fork's source** | — | `path.resolve` (ladder rung 3, present) |
| `windows-latest` CI runner | Windows-only assertions | ✗ (Phase 9 / CI-01) | — | Phase 3's already-measured P0-TMP result, cited from `03-FINDINGS.md` |
| Real Windows Caido install | closing the LLRT residual risk | ✗ | — | Deferred to Phase 9/10 (reporter confirmation) |

**Missing dependencies with no fallback:**
- None that block *this phase's* execution. `os` under LLRT is unproven, but D-05's hard-fail is the deliberate, agreed handling — an absent `os` produces an actionable error rather than a blocked phase.

**Missing dependencies with fallback:**
- `realpathSync.native` → `path.resolve` (D-04's ladder is designed for exactly this).
- `windows-latest` runner → Phase 3's recorded measurements plus injected-parameter tests on Linux.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | `vitest.config.ts` (repo root; `setupFiles: ["./vitest.setup.ts"]`) |
| Quick run command | `pnpm exec vitest run packages/backend/src/platform.test.ts packages/backend/src/fs-retry.test.ts packages/backend/src/activity-tail.test.ts packages/backend/src/bounded-buffer.test.ts packages/backend/src/resolution-cache.test.ts packages/backend/src/runtime-probe.test.ts` |
| Full suite command | `pnpm exec vitest run` |
| Static gates | `pnpm -r typecheck` and `pnpm lint` (`--max-warnings 0`, no `--fix`) |

### The hard constraint this section is designed around

**The maintainer cannot test native Windows locally**, and `windows-latest` CI (CI-01) does not land until Phase 9. Every Phase 4 criterion is therefore classified below into exactly one of three buckets:

- **L** — provable on the existing Linux/macOS runner, because `platform` is an injected parameter.
- **W** — needs a Windows runner (which this phase does not have).
- **N** — not provable in CI at all, on any runner.

Getting almost everything into **L** is the *purpose* of the pure/impure split recommended throughout this document. Anything left inline in `index.ts` falls into **N** by default.

### Phase Requirements → Test Map

| Req ID | Behavior | Bucket | Test Type | Automated Command | File Exists? |
|--------|----------|--------|-----------|-------------------|-------------|
| RUN-03 | `getTempRoot({platform,tmpdir})` returns the tmpdir with any trailing separator normalised, for all three platforms | **L** | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getTempRoot"` | ❌ Wave 0 |
| RUN-03 | `getSweepRoots` yields `[tmpdir]` on win32, `[tmpdir, "/tmp"]` on darwin, `["/tmp"]` on linux | **L** | unit | `… -t "getSweepRoots"` | ❌ Wave 0 |
| RUN-03 | `getWhichCommand` returns `which` on POSIX and `where` on win32 | **L** | unit | `… -t "getWhichCommand"` | ❌ Wave 0 |
| RUN-03 | `getExecutableNames` returns `[command]` on POSIX and the `.exe`/`.cmd` list on win32 | **L** | unit | `… -t "getExecutableNames"` | ❌ Wave 0 |
| RUN-03 | `getHomeDirCandidates` reads `HOME` on POSIX and `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` on win32 | **L** | unit | `… -t "getHomeDirCandidates"` | ❌ Wave 0 |
| RUN-03 | No hardcoded `/tmp` remains except the deliberate legacy sweep arm | **L** | static | `! grep -n '"/tmp"' packages/backend/src/index.ts` (the only permitted occurrence is in `platform.ts`'s `getSweepRoots`) | ❌ Wave 0 |
| RUN-03 | The real `os.tmpdir()` is drive-lettered and exists on Windows | **W** | — | **Already measured** — Phase 3 P0-TMP, cite `03-FINDINGS.md`; do not re-prove |
| RUN-04 | `isTransientFsError` accepts `EPERM`/`EBUSY`/`EACCES`/`UNKNOWN` and rejects `ENOENT`/`ENOSPC` | **L** | unit | `pnpm exec vitest run packages/backend/src/fs-retry.test.ts -t "isTransientFsError"` | ❌ Wave 0 |
| RUN-04 | `withFsRetry` retries a transient failure and succeeds, sleeping the exact ladder | **L** | unit | `… -t "retries a transient"` | ❌ Wave 0 |
| RUN-04 | `withFsRetry` does **not** retry a non-transient failure (exactly one attempt) | **L** | unit | `… -t "does not retry"` | ❌ Wave 0 |
| RUN-04 | `withFsRetry` gives up after the ladder and returns `Error` | **L** | unit | `… -t "gives up"` | ❌ Wave 0 |
| RUN-04 | `FS_RETRY_DELAYS_MS` has ~5 entries summing ≤ 1 500 ms (SC-3's shape) | **L** | unit | `… -t "ladder shape"` | ❌ Wave 0 |
| RUN-04 | A **real** Defender lock is survived on real hardware | **N** | — | Not inducible in CI. Mitigation: log every retry with code + attempt index and surface the count in `getDiagnostics` so a bug report answers it |
| RUN-05 | `formatProbeFailure` renders every version-block field, `"unavailable"` for each that throws | **L** | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "unavailable"` | ❌ Wave 0 |
| RUN-05 | `buildProbeReport` marks `os.platform`/`os.tmpdir` as gating and `realpath`/win-env as reported (D-06) | **L** | unit | `… -t "gating"` | ❌ Wave 0 |
| RUN-05 | `normalizePlatform` rejects an unrecognised value rather than falling through to POSIX (Pitfall 2) | **L** | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "normalizePlatform"` | ❌ Wave 0 |
| RUN-05 | The probe actually runs before the sweep and before `mcpTempDir` assignment | **L** | static | Ordered-`grep` assertion over `startMcpServer`, or a comment-anchored line-order check | ❌ Wave 0 |
| RUN-05 | The failure message is legible to a real bug reporter | **N** | manual | Human read of one rendered example. Justification: legibility is not machine-assertable |
| CMP-02 | macOS sweep still finds `drift-mcp-*` under `/var/folders/…` **and** legacy `/tmp` | **L** | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getSweepRoots"` | ❌ Wave 0 |
| CMP-02 / CMP-01 | Existing suite stays green (the real regression net) | **L** | regression | `pnpm exec vitest run` — 134 tests must stay green; `provider-launch.test.ts` exact snapshots must not move | ✅ exists |
| PERF-02 | `consumeActivityChunk` carries a partial line across chunks | **L** | unit | `pnpm exec vitest run packages/backend/src/activity-tail.test.ts -t "partial"` | ❌ Wave 0 |
| PERF-02 | A multi-byte UTF-8 sequence split across chunks survives intact (Pitfall 4) | **L** | unit | `… -t "utf-8"` | ❌ Wave 0 |
| PERF-02 | `offset > size` resets the cursor (truncation/rotation) | **L** | integration | `… -t "truncation"` — real `mkdtemp` file, matching `command-resolution.test.ts`'s existing style | ❌ Wave 0 |
| PERF-02 | Re-reading after no writes yields zero new lines (the 250 ms common case) | **L** | integration | `… -t "no new bytes"` | ❌ Wave 0 |
| PERF-02 | `Buffer.alloc(length)` with `length === buffer.byteLength` (Pitfall 3) | **L** | static | Code review + an anchored comment. **Not observable on Node** — the constraint is LLRT-only |
| PERF-03 | A positive result is cached and not re-resolved within TTL | **L** | unit | `pnpm exec vitest run packages/backend/src/resolution-cache.test.ts -t "within TTL"` | ❌ Wave 0 |
| PERF-03 | Expiry re-resolves after the injected clock advances past TTL | **L** | unit | `… -t "expires"` | ❌ Wave 0 |
| PERF-03 | Negative results use the shorter TTL | **L** | unit | `… -t "negative"` | ❌ Wave 0 |
| PERF-03 | Changing any `providers[*].command` clears the cache (SC-6) | **L** | unit | `… -t "invalidates on command change"` | ❌ Wave 0 |
| PERF-03 | `checkProviderAvailability` bypasses the cache | **L** | unit | `… -t "bypass"` | ❌ Wave 0 |
| PERF-04 | `appendBounded` returns the input unchanged below the cap | **L** | unit | `pnpm exec vitest run packages/backend/src/bounded-buffer.test.ts -t "below the cap"` | ❌ Wave 0 |
| PERF-04 | Above the cap: head + marker + tail, total ≤ cap + marker length | **L** | unit | `… -t "both ends"` | ❌ Wave 0 |
| PERF-04 | The marker carries the dropped byte count | **L** | unit | `… -t "marker"` | ❌ Wave 0 |
| PERF-04 | Claude line buffer drops and counts a >4 MiB unterminated line | **L** | unit | `pnpm exec vitest run packages/backend/src/claude-print.test.ts -t "unterminated"` | ✅ file exists, cases ❌ Wave 0 |
| PERF-04 | The split-once refactor is behaviour-identical | **L** | regression | `pnpm exec vitest run packages/backend/src/claude-print.test.ts` — all existing cases green, unmodified | ✅ exists |
| SC-9 | `buildSpawnEnv` preserves `APPDATA`/`LOCALAPPDATA` and overlays drift vars | **L** | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "buildSpawnEnv"` | ❌ Wave 0 |
| SC-9 | Every `spawn` site supplying `env` uses `buildSpawnEnv` | **L** | static | `grep -c "spawn(" packages/backend/src/index.ts` cross-checked against `buildSpawnEnv` call sites |  ❌ Wave 0 |
| SC-10 | The realpath ladder falls through to `path.resolve` when both upper rungs are absent | **L** | unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts -t "ladder"` — inject fake fs functions | ❌ Wave 0 |
| SC-10 | 8.3 short-name expansion produces a comparable path | **W** | — | Windows-only by nature. Phase 3 already measured the *divergence*; expansion itself is Phase 6's problem |

**Bucket tally: L = 33, W = 2 (both already answered by Phase 3), N = 2 (both mitigated by diagnostics/logging rather than left open).**

That ratio is the deliverable of this section: with the pure/impure split, Phase 4 is ~94 % provable on hardware the maintainer actually has.

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run packages/backend/src/<the-module-touched>.test.ts` — sub-second, no excuse to skip.
- **Per wave merge:** `pnpm -r typecheck && pnpm lint && pnpm exec vitest run` — the full 134-test suite plus both static gates. `pnpm lint` must pass at `--max-warnings 0`; a new module with an unused export (`normalizePathForCompare`, deliberately uncalled per D-04) may need an explicit eslint-disable with a comment citing D-04 rather than deletion.
- **Phase gate:** full suite green on the CI Node 20/22/24/26 matrix **plus `pnpm build`**, before `/gsd-verify-work`. The build matters here specifically because this phase adds the first `import os from "os"` to the backend bundle — a bundler resolution failure would be invisible to vitest.

### Wave 0 Gaps

- [ ] `packages/backend/src/platform.test.ts` — covers RUN-03, CMP-02, SC-9, RUN-05 (`normalizePlatform`)
- [ ] `packages/backend/src/fs-retry.test.ts` — covers RUN-04
- [ ] `packages/backend/src/activity-tail.test.ts` — covers PERF-02
- [ ] `packages/backend/src/bounded-buffer.test.ts` — covers PERF-04 (site A)
- [ ] `packages/backend/src/resolution-cache.test.ts` — covers PERF-03
- [ ] `packages/backend/src/runtime-probe.test.ts` — covers RUN-05, SC-10
- [ ] New cases appended to `packages/backend/src/claude-print.test.ts` — covers PERF-04 (site B)
- [ ] Framework install: **none needed** — vitest 4.0.18 is present and configured
- [ ] Shared fixtures: **none needed** — the `mkdtemp` + `afterEach` cleanup pattern in `command-resolution.test.ts:17–21` is the template for `activity-tail.test.ts`'s two integration cases
- [ ] `.gitattributes` (`eol=lf`): **not needed for Phase 4** — nothing in this phase asserts on generated newline-bearing content. CI-03 owns it in Phase 9

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth logic changes; `validateCaidoAuth` is untouched |
| V3 Session Management | no | `sessionId` semantics unchanged (Phase 2 SEC-02 owns its validation) |
| V4 Access Control | **yes** | POSIX `0o700`/`0o600` on the token-bearing temp dir. **Source-verified:** LLRT's `set_mode` is a no-op on non-unix, so the modes are safe to leave unconditional; the Windows control is the per-user `%TEMP%` ACL baseline (`icacls` hardening = HRD-01, deferred to v2 with the trade-off accepted in STATE.md) |
| V5 Input Validation | **partial** | `sessionId`/`chatId` charset validation is **Phase 2's SEC-02**, not this phase. Phase 4's obligation is *not to move the goalposts* — hence the recommendation to change only the directory component and leave the filenames alone |
| V6 Cryptography | **yes** | The temp-dir random token. `genUUID()` is `Math.random`-based (`CONCERNS.md`). Phase 3's P3-UUID **blocks** substituting `crypto.randomUUID`. The 20-hex-char recommendation is entropy-neutral: it shortens a string whose real entropy is PRNG-bounded either way |
| V7 Error Handling & Logging | **yes** | D-08's version block and D-06's probe report land in `sdk.console`, `getDiagnostics` **and** the user-visible MCP status message. **They must never carry `CAIDO_TOKEN`.** `redactDebugText` (`index.ts:349`) exists for the debug log; the probe report is a *different* surface and needs its own no-secrets discipline. Every field is a version string, a path, or a boolean — no env-var dumping |
| V12 File & Resource | **yes** | Bounded buffers (PERF-04) are literally a resource-exhaustion control; `MAX_TICK_BYTES` (PERF-02) bounds a per-tick allocation |
| V14 Configuration | **yes** | Phase 3's D-10 no-secret-material CI gate must keep passing — Phases 4–8 depend on it silently. Any workflow or script edited by this phase is in its scan set |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Local token disclosure via a world-readable temp dir | Information Disclosure | `0o700`/`0o600` on POSIX; per-user `%TEMP%` ACL on Windows (HRD-01 deferred) |
| **Orphaned token-bearing directories never swept after the tmpdir change** | Information Disclosure | **The legacy `/tmp` sweep arm** — the one security-relevant item on CONTEXT's discretion list, default SHIP IT |
| Temp-dir name prediction → race to read the token before the mode lands | Information Disclosure / Elevation | 20 hex chars ≈ 80 bits nominal; the true bound is `Math.random`'s PRNG. `mkdir` with `mode: 0o700` closes the window on POSIX. **Do not shorten below 16 hex chars** |
| Path traversal via `sessionId`/`chatId` interpolation | Tampering | **Phase 2's SEC-02.** Phase 4 must not make it harder — keep the filename derivations stable |
| Memory exhaustion from a runaway CLI (backend DoS) | Denial of Service | PERF-04's bounded buffers with marked truncation; do **not** copy Node's `exec` precedent of killing the child |
| CPU exhaustion via O(n²) buffer slicing blocking the single-threaded event loop | Denial of Service | The claude-print split-once refactor — arguably more urgent than the memory bound, because the event loop *is* the watchdog |
| Secret leakage into a public bug report via the D-08 version block | Information Disclosure | Version strings, paths and booleans only — never `process.env` enumeration. Note `mcp-server.mjs` already avoids enumerating `process.env` (it reads named keys), and Phase 3's D-10 gate enforces the same discipline in CI |
| Stale MCP registration pointing at a deleted wrapper path | Denial of Service (self) | The existing best-effort `mcp remove drift` before every `mcp add` (`index.ts:1587`) — verify it survives this phase |

---

## Sources

### Primary (HIGH confidence)

- **`caido/dependency-llrt@main` Rust source** — read directly, the strongest evidence in this document:
  - `modules/llrt_os/src/lib.rs` — `os` declarations (`platform`, `tmpdir`, `release`, `version`, `homedir`, `type`, `userInfo` all ungated); `get_tmp_dir()` = `env::temp_dir()`
  - `modules/llrt_os/src/windows.rs` — `get_release()` via `OsVersion::current()`; `EOL = "\r\n"`
  - `libs/llrt_utils/src/sysinfo.rs` — `PLATFORM` compile-time const (`"darwin"` / `"win32"` / `std::env::consts::OS`)
  - `modules/llrt_fs/src/lib.rs` — `fs/promises` declares `open`, `lstat` (absent from the fork's own `API.md`); **no `realpath`**
  - `modules/llrt_fs/src/file_handle.rs` — `FileHandle.read` with `position`, the `copy_from_slice` length constraint, and the `// -1 is not supported` comment
  - `modules/llrt_fs/src/chmod.rs` — `set_mode` is a total no-op on `not(unix)`
  - `modules/llrt_fs/src/mkdir.rs`, `write_file.rs`, `rm.rs` — `mode` handling; `rm` supports only `recursive`/`force`, no `maxRetries`
  - `modules/llrt_path/src/lib.rs` — `join_resolve_path` truncates a trailing separator; `sep`/`relative` declared though undocumented
  - `modules/llrt_process/src/lib.rs` — `process.versions = { llrt, node: "0.0.0" }`; **no `execPath`**
- **`libuv/src/win/error.c` (v1.x)** — Win32 → `UV_E*` mapping; unmapped → `UV_UNKNOWN`
- **`isaacs/node-graceful-fs` `polyfills.js`** — the Windows rename retry: `EACCES`/`EPERM`/`EBUSY`, `+10 ms` capped at 100 ms, 60 s budget, aborts when `fs.stat(to)` succeeds
- **nodejs.org/api/os.html** — `os.tmpdir()` v2.0.0 breaking change ("no longer returns a path with a trailing slash on any platform"); `os.platform()` value set
- **nodejs.org/api/fs.html** — `filehandle.read(buffer, offset, length, position)` and the `read([options])` form
- **learn.microsoft.com — `GetTempPath2W`** — "The returned string ends with a backslash"; the four-level TMP/TEMP/USERPROFILE/Windows fallback; max return `MAX_PATH+1` (261); SYSTEM → `C:\Windows\SystemTemp`
- **learn.microsoft.com — Maximum Path Length Limitation** — MAX_PATH = 260; long paths need `LongPathsEnabled` **and** a `longPathAware` manifest
- **doc.rust-lang.org `std::env::temp_dir`** — Windows = `GetTempPath2`/`GetTempPath`; Unix = `$TMPDIR`, Darwin = `confstr(_CS_DARWIN_USER_TEMP_DIR)`
- **Repo ground truth (commit `1c25cde`)** — `packages/backend/src/index.ts`, `command-resolution.ts`, `claude-print.ts`, `assets/mcp-server.mjs`, `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `packages/frontend/src/stores/chat.ts`
- **`.planning/phases/03-.../03-FINDINGS.md`** — the canonical Phase 3 verdict (P0-ENV `PARENT-CLEARED`, P0-TMP 8.3 short form, P1-CMD `EINVAL`, P3-UUID caveat) and its vehicle caveat

### Secondary (MEDIUM confidence)

- **npm/cli PR #9028** (arborist bin-links Windows EPERM) — `{ retries: 5, minTimeout: 500 }` for `EPERM`/`EACCES`/`EBUSY` gated on `process.platform === 'win32'`
- **npm/write-file-atomic issue #227** — `fs.rename` EPERM under transient Windows locks; documents graceful-fs's "destination must not exist" retry limitation
- **nodejs/node issue #50753** — Node and long paths on Windows even with `LongPathsEnabled`
- **nodejs.org/api/child_process.html** — `maxBuffer` default 1 MiB and the kill-on-overflow behaviour (the precedent Drift deliberately does *not* follow)
- **`caido/dependency-llrt` GitHub repo metadata** — fork of `awslabs/llrt`, default branch `main`, last pushed 2026-04-22, not archived

### Tertiary (LOW confidence — flagged for validation)

- Rust `std::fs`'s automatic verbatim (`\\?\`) conversion for >MAX_PATH paths (A11) — inferred from Rust path-prefix documentation, not confirmed in `std`'s source
- LLRT surfacing fs errors as messages rather than structured `.code` values (A3) — inferred from `or_throw_msg` usage in the fork; mitigated by handling both forms
- macOS `$TMPDIR` conventionally carrying a trailing slash (A4) — widely observed, not cited from an Apple source; the `path.join` recommendation is correct either way

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — no new packages; every built-in confirmed against Caido's own LLRT fork source
- **LLRT surface:** MEDIUM-HIGH — source-verified against `caido/dependency-llrt@main`, but *never executed*, and Caido's shipped commit is unknown. Strictly better than Phase 3's Node-vehicle inference, still not measurement
- **Windows FS-error taxonomy (RUN-04):** HIGH for the codes (libuv source), MEDIUM for the ladder shape (three ecosystem precedents, none from a UI-latency context like Drift's)
- **MAX_PATH budgeting:** HIGH — arithmetic over measured components; the only soft input is how long a user's `%TMP%` might be
- **PERF-02 mechanism:** HIGH — `open` + positional `read` source-verified in the fork; the `copy_from_slice` constraint read straight from the Rust
- **PERF-04 / PERF-03 tuning:** MEDIUM — the *mechanisms* are certain, the *numbers* are judgement calls made explicit and exported as constants so they are tunable on evidence
- **Architecture / validation strategy:** HIGH — the pure/impure split is the repo's own established convention with five working instances

**Research date:** 2026-08-14
**Valid until:** 2026-09-13 (30 days). Earlier triggers for re-validation: Caido shipping a new LLRT build; the first real Windows Caido run producing a probe report (which would upgrade several MEDIUM findings to measured); Phase 9's `windows-latest` job landing.
