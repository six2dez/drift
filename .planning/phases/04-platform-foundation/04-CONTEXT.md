# Phase 4: Platform Foundation - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the pure platform-abstraction layer and OS-portable temp/runtime plumbing that Phases 5–8
build on, **without changing macOS/Linux behavior** — plus the four robustness/perf items folded in
from the 2026-08-12 review (RUN-04, PERF-02, PERF-03, PERF-04).

Requirements: **RUN-03, RUN-04, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04.**

**Explicitly NOT this phase:**

- The launch-path rewrite (`renderExportExecScript` / `writeMcpWrapper` / `writeLaunchScript` /
  `shellQuote` / the `chmod` calls / direct-`node` spawn) — that is **Phase 5**. Phase 4 introduces
  `platform.ts` and the temp/runtime plumbing those functions *will* consume, but does not delete
  or rewrite them.
- Windows install-location candidate arrays, `where.exe` CRLF parsing, and UX-02 copy — **Phase 6**
  (see D-03 for the exact line).
- Process-tree kill / `taskkill` — **Phase 8**.

### Three code facts verified during this discussion — planners must not re-derive them

1. **`mcp-server.mjs` is already copied once at MCP start**, at `packages/backend/src/index.ts:1719`,
   inside `startMcpServer` — not per turn. SC-3's "copies once at MCP start (not per turn)" is
   **already true today**. The real remaining SC-3 work is the AV retry ladder and the MAX_PATH
   filename shortening.
2. **The backend imports `os` nowhere.** `grep 'from "os"'` over `packages/backend/src/*.ts` matches
   only three *test* files. Phase 4 introduces the first `import … from "os"` that Caido's LLRT
   runtime will actually load. Phase 3's P2-OS proved the bare `"os"` specifier resolves — under
   Node, on the CI vehicle, not under LLRT.
3. **`sdk.meta` exposes only `db()`, `path()`, and `assetsPath()`** (`index.ts:173`, `2953`, `2954`).
   There is **no Caido version** anywhere in the SDK surface. SC-4's "including the Caido/runtime
   version" has no direct source — see D-08 for what replaces it.

</domain>

<decisions>
## Implementation Decisions

### `platform.ts` surface

- **D-01: Discrete pure functions taking an `{ ...input }` object param — no descriptor object,
  no composition helper.** This matches `command-resolution.ts`'s existing
  `getCommandExecutableCandidates({ ...input })` convention, so the two modules Phases 5–8 both
  import read the same way. Each function is independently unit-testable on the Linux CI runner
  with `platform` passed as a literal, and callers pull only the subset they have inputs for.

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

  A `createPlatformProfile()` aggregate was offered and **rejected** — every caller would have to
  supply all inputs even for the one field it needs.

- **D-02: `os` is touched in exactly ONE place — the RUN-05 capability probe at MCP start — and
  the result is cached in a module-level `let`. Every downstream site reads the cache, never `os`.**

  Rationale, and it is the load-bearing part: a module-level `const HOST = { platform: os.platform(),
  tmpdir: os.tmpdir() }` evaluated at plugin load means that **if Caido's LLRT lacks `os`, the throw
  happens during module evaluation and the entire Drift plugin dies** — chat and settings included,
  frontend renders a dead panel — and RUN-05 never gets to speak. Reading lazily inside the probe
  degrades the same gap to a loud, actionable MCP-start error, and makes the probe *authoritative*
  rather than decorative: it is the only code that can observe the failure.

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

  Calling `os.*` at each site was rejected for the same reason: it leaves the probe unable to
  guarantee that the sites it validated are the sites that run.

- **D-03: The Phase 4 / Phase 6 line is SHAPE versus DATA.**

  - **Phase 4 ships:** all four pure functions, with their POSIX behavior byte-identical to today
    and fully unit-tested, **plus the platform-invariant Windows primitives** — `which` vs `where`
    binary name, the `.exe`/`.cmd` extension list, and *which env var names* to read for home dirs.
  - **Phase 6 fills:** the install-location candidate arrays (`%APPDATA%\npm`,
    `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`), the
    `where` CRLF parse, and UX-02 copy — **extending the same functions, not restructuring them.**

  This keeps the roadmap's requirement traceability honest (RES-01/02/03 stay Phase 6) and stops
  Phase 4 silently becoming a two-phase change.

- **D-04: `normalizePathForCompare()` ships as an IMPURE helper OUTSIDE `platform.ts`,** with a
  guarded fallback ladder: `realpathSync.native` → `fs/promises.realpath` → `path.resolve`.
  `platform.ts` stays I/O-free per SC-1.

  **`realpath` availability joins the probe's measured set** (reported, not gating — see D-06), so
  an LLRT gap is loud at MCP start rather than a silent wrong answer in Phase 6.

  Stated plainly for the planner: **no path comparison in Phase 4's own code actually needs this
  yet.** The orphan sweep compares two paths both derived from the same cached `host.tmpdir`, so
  they are string-identical by construction. SC-10 names it as a Phase 4 criterion because Phase 6
  is where the 8.3-versus-long-form mismatch bites (`os.tmpdir()` → `C:\Users\RUNNER~1\…` versus
  `USERPROFILE` → `C:\Users\runneradmin`). Phase 4 ships and probes the helper; Phase 6 is its first
  caller. Do not "clean up" the unused export.

  Note the new import surface: `realpathSync.native` comes from `node:fs` (sync), while `index.ts`
  imports only `fs/promises` today. The ladder exists precisely because that surface is unproven
  under LLRT.

### Runtime capability probe (RUN-05) — failure policy

- **D-05: Hard-fail on EVERY OS. One code path, one message. No POSIX degrade-to-`/tmp` arm.**

  This was checked against CMP-01/CMP-02 and is **not** a regression in practice: if `os` is
  genuinely absent from Caido's LLRT, the POSIX path cannot reach `os.tmpdir()` either. Silently
  falling back to hardcoded `/tmp` on darwin/linux would mean shipping a build whose Windows path is
  dead while POSIX quietly works — **the exact failure mode this milestone exists to kill**, and the
  one that let the reported bug ship in the first place. A two-armed policy also doubles the test
  surface and hides a real LLRT gap on the platforms most users run.

- **D-06: The gate rule is "a primitive with a working fallback REPORTS; a primitive without one
  GATES."**

  | Primitive | Gates MCP start? | Why |
  |---|---|---|
  | `os.platform()` returns a recognised value | **Yes** | Nothing downstream branches correctly without it; an unrecognised value silently takes the POSIX arm, which on Windows *is* the current bug reintroduced one layer up |
  | `os.tmpdir()` usable (see D-07) | **Yes** | Every runtime file depends on it |
  | `realpath` availability | No — report | D-04's ladder already degrades to `path.resolve` |
  | `USERPROFILE` / `APPDATA` / `LOCALAPPDATA` on `win32` | No — report | Phase 6's inputs, platform-conditional, no Phase 4 consumer |

  Every result — gating or not — lands in the probe message **and** in `getDiagnostics`, so an LLRT
  gap is visible without blocking MCP for a capability nothing consumes yet.

- **D-07: The probe WRAPS THE REAL FIRST WRITE. There is no separate canary file.**

  `startMcpServer` already does `mkdir(mcpTempDir, { recursive: true, mode: 0o700 })` followed
  immediately by `writeFile(mcpScriptLocal, …)` (`index.ts:1717–1720`). **That** is the `os.tmpdir()`
  assertion — the probe wraps the real work and reports its failure with the actionable message.

  Three things fall out, and they are why this beat both alternatives:
  1. **Zero extra I/O** at MCP start.
  2. The failure it catches is **the actual one users hit** — a read-only or Defender-locked temp dir
     passes a `stat()`-only check and then dies at the copy with the cryptic error RUN-05 exists to
     replace.
  3. **RUN-04 and RUN-05 become one mechanism.** The `EPERM`/`EBUSY`/`UNKNOWN` bounded-backoff retry
     ladder (~5 attempts, 50–500 ms) lives exactly here, wrapping the same write. A separate canary
     was rejected because it can itself trip the AV write-then-access race it exists to detect —
     a false negative on precisely the machines that matter.

- **D-08: The message carries a best-effort version block, each read individually guarded, rendering
  `"unavailable"` for anything that fails.** Sources, in the absence of any Caido version:
  `process.version` / `process.versions`, `os.platform()` + `os.release()`, and **Drift's own version
  read from the plugin manifest at `pluginPath`**.

  This satisfies SC-4's intent without inventing a Caido version that does not exist, and produces
  exactly the string a Windows bug reporter should paste into an issue. It surfaces in the MCP status
  message, `sdk.console`, and `getDiagnostics` — which already collects this shape of field
  (`index.ts:2750`+).

  SC-4's literal wording ("including the Caido/runtime version") should be read as satisfied by this
  block. If a verifier reads it strictly, the honest note is: **the SDK exposes no Caido version;
  this is the closest available substitute**, not an omission.

### Claude's Discretion

The user reviewed and declined to discuss these. Planner decides, with the defaults below recorded
as the discussed-and-agreed starting point — **not** as unexamined gaps.

- **Legacy `/tmp` sweep arm on POSIX — default: SHIP IT.** Switching to `os.tmpdir()` moves macOS to
  `/var/folders/…`, so token-bearing `drift-mcp-*` directories left behind by the currently-shipped
  0.1.0 in `/tmp` would **never be swept again** after upgrade. This was surfaced explicitly during
  the discussion as the one skipped item with a *security* consequence rather than a tuning one, and
  the user chose "ready for context" with this default stated. `sweepOrphanedMcpTempDirs` should scan
  `os.tmpdir()` **and**, on non-`win32`, also `/tmp` when it differs — same `drift-mcp-*` filter, same
  `!== mcpTempDir` guard. CMP-02 already requires the macOS `/var/folders/…` case to keep working.
- **Temp-path / filename shortening for MAX_PATH (SC-3).** Today: `drift-mcp-<36-char uuid>` plus
  `mcp-activity-drift-<13-digit ms>.jsonl`. Trimming the random component trades guessability for
  path length, and `genUUID` is `Math.random`-based already (`CONCERNS.md` § *genUUID Uses
  `Math.random`*). Planner picks the scheme; do not shorten the random component to the point where
  the temp dir name becomes trivially enumerable.
- **PERF-04 buffer bounds** — cap size, keep-head vs keep-tail vs both-ends, and the truncation
  marker text. Two distinct sites with possibly different policies: the `stdout`/`stderr`
  accumulators (`index.ts:1524–1525`, `2484`, `2573`) and `claude-print.ts`'s line buffer
  (`claude-print.ts:150–160`), where the hazard is a single never-terminated line rather than total
  volume.
- **PERF-03 resolution cache** — TTL length, and whether *negative* (not-found) results are cached
  too. Note the trade-off: not caching misses means the expensive version-manager directory walk
  repeats every turn precisely in the slowest case; caching them means a freshly-installed `node`
  stays invisible for the TTL. Invalidation on provider-command change is required by SC-6 either way.
- **PERF-02 activity-file offset read** — mechanism (`open()` + `read()` from a byte offset versus a
  stream; note `open` is already imported and `createReadStream` is not) and partial-line buffering
  across ticks. Must handle offset > size by resetting.
- **`getSessionDebugLogPath` when `host` is unset.** D-02 means `host` is only populated at MCP
  start, but a chat turn can run with MCP never started. **Default: return `undefined` (no debug log)
  when `host` is unset** — `debugLogging` is opt-in, so silently skipping is acceptable and strictly
  better than reintroducing a hardcoded `/tmp`. The orphan sweep has no such problem: it runs
  *inside* `startMcpServer`, so ordering the probe first is sufficient.
- **Small `platform.ts` shape details** — narrow `Platform` union versus `NodeJS.Platform`, and
  whether `getWhichCommand` returns a full spawn spec or just a binary name. Raised and left to the
  planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3's measured verdict — binding on this phase's architecture

- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — **the canonical
  citation. Cite this file, never the CI artifacts, which expire 2026-09-12.** Four results bind
  Phase 4 directly:
  1. The spawn `env` option **REPLACES** the parent block on Windows exactly as on POSIX — measured
     via a parent-only marker returning `PARENT-CLEARED` on
     [run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574). libuv back-fills
     only eleven `required_vars`; **`APPDATA` and `LOCALAPPDATA` are not among them**, and those are
     precisely what `command-resolution.ts` needs for the Windows nvm/fnm paths. **Every `spawn` call
     site supplying `env` must spread `{ ...process.env, ...driftVars }`, never `{ ...driftVars }`**
     (SC-9), with a test asserting it.
  2. `os.tmpdir()` returns the **8.3 short form** (`C:\Users\RUNNER~1\…`) while `USERPROFILE` returns
     the long form — **not string-comparable** (SC-10, and the reason for D-04).
  3. Direct `.cmd` spawn throws `EINVAL` **synchronously** from Node's CVE-2024-27980 guard — a
     `try`/`catch` around `spawn()` is required, not just an `error` handler. (Lands in Phases 6–7,
     but D-03's extension-list primitive is where it starts.)
  4. **P3-UUID does NOT license removing the custom hex-loop UUID generator** at `index.ts:829`. It
     is a Node-vehicle result with no source-level LLRT confirmation in either direction — the only
     assertion of the seven with none. **Keep the hex loop.**
  - Read also its § *Vehicle caveat*: the platform is measured, the runtime is inferred. Every Phase 4
    plan citing this document carries the same caveat.
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-CONTEXT.md` — Phase 3's decisions
  D-01…D-13, notably **D-10** (the no-secret-material CI gate that Phases 4–8 depend on silently)
  and **D-11/D-12/D-13** (a CI claim is recorded with its run URL and the log line proving the
  mechanism, written *after* reading the real run, never pre-filled).

### Requirements and roadmap

- `.planning/REQUIREMENTS.md` — RUN-03, RUN-04, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04 are this
  phase. RES-01/02/03 + UX-02 are **Phase 6** and set the D-03 boundary.
- `.planning/ROADMAP.md` § *Phase 4: Platform Foundation* — the ten success criteria, including
  **SC-9** (spread `...process.env`) and **SC-10** (`realpathSync.native` normalisation), which encode
  Phase 3's measurements. Also § *Overview* for the CMP-01/CMP-02 milestone invariant and the
  **Phase 2 boundary constraint**.
- `.planning/PROJECT.md` § *Constraints* — the QuickJS/LLRT runtime constraint, the
  "maintainer cannot test native Windows locally" validation constraint, and the Windows temp-file
  ACL security note.

### Codebase ground truth

- `.planning/codebase/CONCERNS.md` — the 12-item cross-platform landmine inventory with `file:line`.
  Items **1** (the three hardcoded `/tmp` sites), the *Performance Bottlenecks* § on the 250 ms
  full-file activity read, and the *Tech Debt* § on `genUUID`/`Math.random` are directly in scope.
- `.planning/codebase/ARCHITECTURE.md` — the `startMcpServer` bootstrap trace and the
  "POSIX Surface — Every Place That Must Change for Windows" table.
- `packages/backend/src/index.ts` — the three `/tmp` sites are **`:337`** (`getSessionDebugLogPath`),
  **`:1681`/`:1685`** (`sweepOrphanedMcpTempDirs`), **`:1716`** (`mcpTempDir`).

### Design already specified for the NEXT phase — read for direction, do not implement

- `.planning/research/ARCHITECTURE.md` — Phase 5's `buildMcpServerSpec()` → `spawnNode()` design.
  Phase 4 must leave `platform.ts` shaped so Phase 5 can consume it without restructuring.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`packages/backend/src/command-resolution.ts`** — the `getCommandExecutableCandidates({ ...input })`
  signature is the convention D-01 copies. Its `extractHomeDir` (`:52–62`) and static candidate lists
  (`:113–125`) are the functions D-03 says Phase 4 *shapes* and Phase 6 *fills*.
- **The `Result<T>` discriminated union** (`{ kind: "Ok" } | { kind: "Error" }`, inline in `index.ts`
  to avoid Zod) — `probeRuntime()` returns this shape; `startMcpServer` already branches on it for
  `requireNodeExecutable()` (`index.ts:1724–1728`).
- **`writeTemp()`** (`index.ts:262–270`) — already does `mkdir(0o700)` + `writeFile(0o600)`. The
  natural home for the D-07 retry ladder, alongside the raw `writeFile` at `:1720`.
- **`getDiagnostics()`** (`index.ts:2750`+) — already collects a flat `Record<string, string>` of
  `pluginPath` / `assetsPath` / `mcpTempDir` / auth state. D-08's version block and D-06's reported
  (non-gating) capabilities slot straight in.
- **`cleanupMcpRuntime()`** — already called defensively on every `startMcpServer` failure path. A
  probe failure returns through the same route.

### Established Patterns

- **Pure helpers split from I/O for testability** — five modules already follow this
  (`provider-launch.ts`, `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`,
  `persistence.ts`), each with a sibling `.test.ts`. `platform.ts` + `platform.test.ts` is the sixth
  instance of an existing pattern, not a new one.
- **QuickJS constraints are absolute:** no Zod, no dynamic `require`, no `import.meta`, no `crypto`.
  D-02's guarded `os` read is the same defensive posture that produced the hand-rolled `genUUID`.
- **Claims are recorded with evidence, not ticks** (`[01-06]`, carried through Phase 3) — any CI claim
  in this phase needs its run URL, per-leg and per-step conclusion, and the log line proving the
  mechanism.
- **Module-level mutable singletons** are the norm for backend state (`mcpTempDir`, `currentSettings`,
  `activeProcesses`, …). D-02's `let host` is consistent with this, not a new anti-pattern — but note
  `CONCERNS.md` flags the class as having no reset mechanism between tests.

### Integration Points

- **New file:** `packages/backend/src/platform.ts` + `packages/backend/src/platform.test.ts`.
- **`index.ts:1717–1720`** — where `mkdir` + the `mcp-server.mjs` copy happen. D-07 makes this the
  probe site and the RUN-04 retry site simultaneously. **Order: probe must run before
  `sweepOrphanedMcpTempDirs`**, which currently runs at `:1710` — the sweep needs `host.tmpdir`, so it
  moves after the probe.
- **`index.ts:337`** `getSessionDebugLogPath` — reads the cache; returns `undefined` when `host` is
  unset (Claude's Discretion default above).
- **`index.ts:848–875`** `resolveCommand` — the `which` spawn. Phase 4 supplies
  `getWhichCommand({ platform })`; **Phase 6** rewires the parse. PERF-03's cache wraps this function.
- **`index.ts:2154–2185`** `flushActivities` — the PERF-02 offset read. It is called from a 250 ms
  `setInterval` (`:2262`), from the heartbeat (`:2275`), and from `finalize()` (`:2363`); the offset
  state must be per-session and survive across all three.
- **`index.ts:1524–1525`, `:2484`, `:2573`** and **`claude-print.ts:150–160`** — the four PERF-04
  buffer sites.
- **Test-suite guard:** the existing `provider-launch` exact-snapshot tests are the CMP-01 tripwire.
  Nothing in Phase 4 should move them.

</code_context>

<specifics>
## Specific Ideas

- The `platform.ts` signatures in D-01 are the agreed shape, chosen from a side-by-side comparison —
  write them as given rather than re-deriving.
- The `probeRuntime()` sketch in D-02 is the agreed structure: `try`/`catch` around both `os` reads,
  an explicit `typeof tmpdir !== "string" || tmpdir === ""` check, cache-on-success, `Result<T>` out.
- The probe's reported-but-not-gating results (D-06) should be phrased so a user can paste them into
  a bug report unmodified — same intent as Phase 3's machine-parseable assertion lines.
- **`{ ...driftVars }` without the parent spread is a defect on either platform**, not a Windows-only
  one. Phase 3's `03-FINDINGS.md` § *Hand-off to Phase 4* says this in as many words. SC-9 wants a
  test asserting it.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 2 (POSIX Correctness & Hardening) is still `Not started`** while Phase 4 is being planned.
  The roadmap places it off the critical path, so this is legitimate sequencing — but flagged here
  because **SEC-02** ("`sessionId` and `chatId` validated against a strict character set before being
  interpolated into filesystem paths") lands on **exactly the filenames SC-3 shortens**. Phase 4 does
  **not** absorb SEC-02; if the filename scheme changes here, Phase 2's validation must be re-checked
  against the new scheme rather than the old one. Raised, and the user chose to proceed with Phase 4.
- **`genUUID` → `crypto.randomUUID`** — tempting while touching the temp-dir naming, and
  `CONCERNS.md` recommends it. **Blocked by Phase 3's P3-UUID:** a Node-vehicle result with zero
  source-level LLRT confirmation. Revisit only when a later phase measures `randomUUID` *inside*
  Caido. Not this phase.
- **Explicit `icacls` ACL hardening of the Windows temp dir (HRD-01)** — already deferred to v2 in
  STATE.md § *Deferred Items*. Phase 4 relies on the per-user `%TEMP%` ACL baseline; the POSIX
  `0o700`/`0o600` modes are silently ignored on Windows and that is the accepted trade-off.
- **Event-driven `sendCliMessage` refactor (backlog 999.1)** — would delete the 250 ms heartbeat that
  PERF-02 is optimising. Deliberately sequenced after the port; PERF-02's offset read is the correct
  interim fix, not a competing design.
- **Repo-wide Prettier sweep (backlog 999.11)** — rewrites `renderExportExecScript` /
  `writeMcpWrapper` / `writeLaunchScript` / `shellQuote`, which the Phase 5–8 scope fence holds
  byte-stable. Stays sequenced after Phase 8.
- **Real-machine confirmation from the original Windows reporter (@0xMRK0S)** — carried from Phase 3's
  deferred list; belongs to Phase 9 or 10. It is what finally closes the LLRT residual risk that every
  Phase 4 decision here is inferring around.

</deferred>

---

*Phase: 04-platform-foundation*
*Context gathered: 2026-08-14*
