# Requirements: Drift — Hardening + Native Windows Milestone

**Defined:** 2026-06-26
**Extended:** 2026-08-12 — pre-port hardening requirements (SIG, COR, SEC, PERF) added from a full-codebase review; Windows requirements re-targeted after the roadmap renumber (phases 1–8 became 3–10)
**Core Value:** The user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data — on native Windows as well as macOS/Linux.

## v1 Requirements

Requirements for the hardening + native-Windows milestone. Each maps to exactly one roadmap phase.

### Signal (SIG) — added 2026-08-12

- [x] **SIG-01**: `pnpm exec vitest run` is green on Node 20, 22, 24 and **26**, and `window.localStorage` is accessed through a guard that tolerates an environment where storage is absent or throws *(amended 2026-08-12: the failure appears on Node ≥ 25, not ≥ 22 — a 20/22/24 matrix satisfies the original wording without fixing anything)*
- [x] **SIG-02**: `pnpm lint` invokes a real, installed ESLint with a committed flat config for TypeScript and Vue, passes with `--max-warnings 0`, and carries no `--fix` on the CI path; CI fails on lint errors
- [x] **SIG-03**: CI runs typecheck → lint → test → build on push and pull request for every branch, across a Node 20/22/24/**26** matrix with `fail-fast: false`, and the closure of the blind spot is proven by a revert-test on a scratch branch

### Correctness (COR) — added 2026-08-12

- [ ] **COR-01**: `check_scope` evaluates Caido glob scope patterns correctly and anchored against the parsed hostname — `*.target.com` matches `api.target.com`, and `target.com` does not match `target.com.attacker.net` — with denylist precedence preserved
- [ ] **COR-02**: The agent can discover convert workflows (`list_workflows`), so `run_workflow` is usable without a manually supplied ID
- [ ] **COR-03**: Saving settings only reruns the work the change requires — no MCP teardown, no CLI re-registration, and no loss of Claude session resume on unrelated edits
- [ ] **COR-04**: Claude's injected system prompt advertises only the tools the active permission policy allows
- [ ] **COR-05**: A failed chat load does not hide persisted chats behind an auto-created empty chat

### Security (SEC) — added 2026-08-12

- [ ] **SEC-01**: The Caido token is present only in the MCP server process environment, not in the provider CLI process environment
- [ ] **SEC-02**: `sessionId` and `chatId` are validated against a strict character set before being interpolated into filesystem paths
- [ ] **SEC-03**: Links rendered from model output cannot navigate the Caido webview away from the plugin
- [ ] **SEC-04**: No dead security configuration — `DRIFT_CONFIRM_SENSITIVE_ACTIONS` is either wired to real behavior or removed
- [ ] **SEC-05**: Tool metadata (permission group + `sensitive` flag) cannot silently desync between `shared/mcp.ts` and `mcp-server.mjs`

### Performance (PERF) — added 2026-08-12

- [ ] **PERF-01**: Markdown rendering allocates one parser for the message list, not one `MarkdownIt` + highlight.js instance per message bubble
- [x] **PERF-02**: The MCP activity file is read incrementally from a byte offset instead of being fully re-read and re-parsed on every watchdog tick
- [x] **PERF-03**: Provider and Node binary resolution is cached with a short TTL, invalidated on command change, instead of re-probing on every turn
- [x] **PERF-04**: `stdout`/`stderr` accumulation and the Claude stream parser use bounded buffers with marked truncation

### Runtime (RUN)

- [x] **RUN-01**: On native Windows, the Drift MCP server starts with no POSIX dependency — `node` is spawned directly, with no `chmod`, no `#!/bin/bash` wrapper, and no `.sh` execution
- [x] **RUN-02**: On Windows, the MCP environment (Caido token, `DRIFT_*` vars) reaches the MCP server via the spawn `env` option / config-JSON `env` field, not a shell `export` wrapper
- [x] **RUN-03**: Drift uses `os.tmpdir()` for its runtime, context, log, and orphan-sweep paths instead of a hardcoded `/tmp` (works on Windows, macOS, Linux)
- [x] **RUN-04**: Drift's temp-file write→spawn path tolerates the Windows AV write-then-exec race (copy `mcp-server.mjs` once at start; bounded retry on `EPERM`/`EBUSY`)
- [x] **RUN-05**: At MCP start, Drift fails loud with an actionable message (incl. Caido/runtime version) if a required runtime capability is missing, instead of failing cryptically

### Health (HLT)

- [x] **HLT-01**: On Windows, MCP auth validation (`validateCaidoAuth`) succeeds for the Claude path
- [x] **HLT-02**: On Windows, the MCP self-test (tools/list, get_environment, search_history) passes for the Claude path

### Resolution (RES)

- [x] **RES-01**: On Windows, Drift locates `node.exe` via `where` plus Windows install locations (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`)
- [x] **RES-02**: On Windows, Drift resolves provider CLI binaries to an absolute path with explicit extension (`.exe`/`.cmd`), preferring `.exe`, parsing `where` CRLF output
- [x] **RES-03**: Home-dir detection recognizes `C:\Users\<name>` and uses `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`

### Providers (PRV)

- [ ] **PRV-01**: On Windows, the user can run a **Claude Code** chat end-to-end with the Drift MCP attached (blocking must-have / MVP)
- [ ] **PRV-02**: On Windows, Drift spawns provider `.cmd` shims safely via a `cmd.exe /d /s /c` argv array (never `shell:true` with dynamic args), or the underlying `node.exe` entry directly
- [ ] **PRV-03**: On Windows, Drift registers the MCP server with Gemini and Codex passing `node.exe` + args + env, with token hygiene (`${CAIDO_TOKEN}` reference or `DRIFT_TOKEN_FILE` indirection) and a guaranteed `mcp remove` on cleanup
- [ ] **PRV-04**: Gemini, Codex, and Copilot are usable on Windows — best-effort where the CLI's own Windows behavior is the blocker (Gemini gated on a real-machine check)
- [ ] **PRV-05**: Gemini and Codex either receive a per-session approval/activity channel like Claude and Copilot, or have their sensitive tools disabled with the limitation stated in-product and in the README *(added 2026-08-12)*

### Lifecycle (LIF)

- [x] **LIF-01**: On Windows, cancelling or timing out a turn terminates the whole process tree (`taskkill /pid <pid> /T /F`), leaving no orphaned token-bearing process
- [x] **LIF-02**: On POSIX, cancelling or timing out a turn also terminates the CLI's MCP child (which carries `CAIDO_TOKEN`), via process-group signalling rather than a single-pid signal *(added 2026-08-12)*

### Validation (CI)

- [x] **CI-01**: A `windows-latest` CI job builds the plugin and runs vitest (the permanent regression net)
- [x] **CI-02**: A CI spike proves the 7 LLRT assertions (spawn `env` passthrough, `os.tmpdir()`/`os.platform()`, `.cmd` EINVAL behavior, `where` parsing, `os` import specifier, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, `crypto.randomUUID`) before any production port code is built on them
- [x] **CI-03**: Windows CI is green for the *right* reasons — `.gitattributes` (`eol=lf`), `\r?\n`-tolerant snapshot assertions, pinned shell

### UX / Polish (UX)

- [ ] **UX-01**: The provider binary-path picker accepts `.exe`/`.cmd` paths on Windows
- [x] **UX-02**: "CLI / Node not found" guidance shows correct Windows install commands per provider (including the Copilot `@github/copilot` correction, replacing the deprecated `gh copilot` extension hint)
- [ ] **UX-03**: Windows install + prerequisites docs (Node ≥ 18, Claude native installer, PowerShell execution-policy note, Codex npm win32 optional-dep caveat)
- [ ] **UX-04**: Windows-aware diagnostics (resolved binary, spawn strategy used, `mcp add` skip reason) and `windowsHide: true` on all spawns

### Compatibility (CMP)

- [x] **CMP-01**: All existing macOS/Linux behavior is preserved — POSIX launch path unchanged behind `platform` guards; existing snapshot/unit tests stay green
- [x] **CMP-02**: The `os.tmpdir()` substitution does not break the macOS/Linux orphan-sweep (macOS tmpdir is `/var/folders/...`, not `/tmp`)

### Plugin Bridge (PBR) — added 2026-08-21

<!-- Phases 11-13. Reaches the user's *installed plugins*, a surface no Caido agent tool
     (official skill or community MCP) currently touches. See .planning/research/PLUGIN-BRIDGE.md
     for the measured evidence behind PBR-01 and PBR-02. -->

- [ ] **PBR-01**: Drift can enumerate the installed plugin packages and, for each backend plugin, the RPC functions it registers — with arity and parameter names where they can be resolved. Source cascade: npm spec package (`@caido-community/<manifestId>`, 3 of 75 plugins) → extraction from the installed bundle → names-only
- [ ] **PBR-02**: The extractor matches the *receiver*, so `sdk.api.register` (RPC-callable) is never confused with `sdk.commands.register` (frontend command-palette entries). In the 2026-08-21 sample, 14 plugins registered only commands and a name-only grep would have offered them as callable
- [ ] **PBR-03**: The plugins root is derived as `path.dirname(sdk.meta.path())` and reaches the MCP process through the existing spawn `env` block — no hardcoded path, no platform branch, no re-derivation inside the MCP process (which has no `sdk`)
- [ ] **PBR-04**: A `plugin_call` tool invokes a backend function via `callFunction({ name, arguments })`, dropping the Caido-injected `sdk` first parameter from every extracted signature before it is offered as a tool argument
- [ ] **PBR-05**: Invocation is gated by the existing tool-safety machinery — discovery is free, invocation is opt-in per plugin, and mutating-looking actions require confirmation. The sample contains `deleteSession`, `deleteNote`, `clearScans`, `stopAgent`
- [ ] **PBR-06**: A `plugin_events` tool subscribes to backend plugin events (`subscribeEvent` / `createdPluginEvent`) and surfaces them into the chat turn
- [ ] **PBR-07**: The bridge is validated end-to-end against the three spec-backed plugins (Scanner, QuickSSRF, Autorize) **and** at least two plugins with no spec package
- [ ] **PBR-08**: Discovery degrades honestly — a function whose signature cannot be resolved is reported as unknown-arity, never guessed. `plugin_call` must not present an invented schema as a validated one

## v2 Requirements

Deferred to a future release. Tracked but not in this milestone's roadmap.

### Hardening (HRD)

- **HRD-01**: Explicit `icacls` ACL hardening of the Windows temp dir (beyond the per-user `%TEMP%` ACL baseline)
- **HRD-02**: Expanded Windows-specific diagnostics / support-bundle fields

### Packaging (PKG)

- **PKG-01**: Windows installer / packaging niceties (e.g. signed MSI, winget manifest)

## Out of Scope

Explicitly excluded for this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Requiring WSL | Native Windows is the goal; WSL is Linux and already works |
| Keeping any bash / `.sh` wrapper indirection | It is the root cause of the Windows failure |
| `shell:true` with dynamic args | Command-injection / CVE-2024-27980 re-exposure; banned |
| Bundling or auto-installing Node or the CLIs | The user provides their own CLI + Node; out of scope and a trust/size concern |
| New MCP feature work beyond the correctness gaps | `list_workflows` (COR-02) ships because `run_workflow` is unusable without it; `search_response_bodies`, sitemap access, and the chat/UX features from the 2026-08-12 review are parked in the ROADMAP backlog (999.x) **Amended 2026-08-21:** the Plugin Bridge (PBR, Phases 11-13) is a deliberate, scoped exception — it is the one MCP surface neither the official Caido skill nor any community MCP implements. |
| The event-driven `sendCliMessage` refactor | Collides head-on with Phases 5 and 8; parked as backlog 999.1 until the port lands |

## Traceability

Which phases cover which requirements. Every v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIG-01 | Phase 1 | Complete |
| SIG-02 | Phase 1 | Complete |
| SIG-03 | Phase 1 | Complete |
| COR-01 | Phase 2 | Pending |
| COR-02 | Phase 2 | Pending |
| COR-03 | Phase 2 | Pending |
| COR-04 | Phase 2 | Pending |
| COR-05 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| PERF-01 | Phase 2 | Pending |
| CI-02 | Phase 3 | Complete |
| RUN-03 | Phase 4 | Complete |
| RUN-04 | Phase 5 | Complete |
| RUN-05 | Phase 4 | Complete |
| CMP-02 | Phase 4 | Complete |
| PERF-02 | Phase 4 | Complete |
| PERF-03 | Phase 4 | Complete |
| PERF-04 | Phase 4 | Complete |
| RUN-01 | Phase 5 | Complete |
| RUN-02 | Phase 5 | Complete |
| HLT-01 | Phase 5 | Complete |
| HLT-02 | Phase 5 | Complete |
| CMP-01 | Phase 5 | Complete |
| RES-01 | Phase 6 | Complete |
| RES-02 | Phase 6 | Complete |
| RES-03 | Phase 6 | Complete |
| UX-02 | Phase 6 | Complete |
| PRV-01 | Phase 7 | Pending |
| PRV-02 | Phase 7 | Pending |
| PRV-03 | Phase 7 | Pending |
| PRV-04 | Phase 7 | Pending |
| PRV-05 | Phase 7 | Pending |
| UX-01 | Phase 7 | Pending |
| LIF-01 | Phase 8 | Complete |
| LIF-02 | Phase 8 | Complete |
| CI-01 | Phase 5 | Complete |
| CI-03 | Phase 5 | Complete |
| UX-03 | Phase 10 | Pending |
| UX-04 | Phase 10 | Pending |
| PBR-01 | Phase 11 | Pending |
| PBR-02 | Phase 11 | Pending |
| PBR-03 | Phase 11 | Pending |
| PBR-08 | Phase 11 | Pending |
| PBR-04 | Phase 12 | Pending |
| PBR-05 | Phase 12 | Pending |
| PBR-06 | Phase 13 | Pending |
| PBR-07 | Phase 13 | Pending |

**Coverage:**

- v1 requirements: 43 REQ-IDs (24 original Windows-port IDs + 19 added 2026-08-12: SIG-01…03, COR-01…05, SEC-01…05, PERF-01…04, PRV-05, LIF-02)
- Mapped to phases: 43
- Unmapped: 0

**Phase → requirement rollup:**

- Phase 1 (Restore the Verification Signal): SIG-01, SIG-02, SIG-03
- Phase 2 (POSIX Correctness & Hardening): COR-01, COR-02, COR-03, COR-04, COR-05, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, PERF-01
- Phase 3 (CI Spike): CI-02
- Phase 4 (Platform Foundation): RUN-03, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04
- Phase 5 (Kill Shell Wrappers): RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01, CI-01, CI-03
- Phase 6 (Windows Command Resolution): RES-01, RES-02, RES-03, UX-02
- Phase 7 (Provider Spawn & Registration): PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, UX-01
- Phase 8 (Process Lifecycle): LIF-01, LIF-02
- Phase 9 (CI Hardening): no requirement IDs of its own — both of the IDs it used to own were pulled forward into Phase 5 during Phase 5 planning (see the note below). The phase narrows to making the Windows leg required-for-merge and green for the right reasons, and to deleting the temporary probe workflow.
- Phase 10 (Windows Polish): UX-03, UX-04

**Re-targeted to Phase 5 at the close of Phase 4:**

- **RUN-04** — *"Drift's temp-file write→**spawn** path tolerates the Windows AV write-then-exec
  race (copy `mcp-server.mjs` once at start; bounded retry on `EPERM`/`EBUSY`)."* The parenthetical
  half **is** shipped: the one-time `mcp-server.mjs` staging copy is wrapped in `withFsRetry`
  (`packages/backend/src/index.ts:2467`), the sole production call site, with a 6-attempt /
  ~1,500 ms ladder that logs code + attempt index and surfaces `mcpFirstWriteAttempts` in
  `getDiagnostics`. The headline half is **not**: the write→**exec** pair that
  `04-RESEARCH.md` names the single best-documented AV case is the `.tmp` write → `chmod +x` →
  `rename` → spawn sequence in `writeLaunchScript` (`index.ts:728`) and `writeMcpWrapper`
  (`index.ts:1172`), and both are still unwrapped — deliberately, because they are inside the bash
  wrapper that **Phase 5** rewrites, and Phase 4's own CMP-01 scope fence (04-11 Gate 6) forbids
  touching them. Marking RUN-04 complete now would claim coverage of the exact path that is fenced
  off. Re-assigned to **Phase 5** in the traceability table and in both rollups at the close of Phase 4,
  so the phase that can edit those two sites owns it structurally, not just in this paragraph. The
  rewrite is what makes them editable; real-machine confirmation comes from the original reporter in
  Phase 9/10.

**Pulled forward into Phase 5 during Phase 5 planning (2026-08-20):**

- **CI-01** — *"A `windows-latest` CI job builds the plugin and runs vitest (the permanent
  regression net)."* Phase 5 is the first phase with **real Windows behaviour to protect** — it
  rewrites the MCP launch path off the bash wrapper — and every later phase inherits the net from
  the moment it exists, so landing it at the end would leave Phases 5-8 unguarded on the OS the
  whole port is for. The alternative was to extend `windows-llrt-probe.yml`, and that is worse on
  both counts: its own header stamps it *DELETED IN PHASE 9*, and Phase 3's D-03 deliberately keeps
  its output off the merge gate — so SC-2's evidence would sit in a job nobody must heed and then
  vanish. Landed in `.github/workflows/ci.yml` as a **blocking** sibling job to `verify`
  (`Verify (Windows)`, `windows-latest`, Node 20), carrying the D-10 no-secret-material gate in its
  three-arm form so that gate outlives the probe rather than dying with it. Re-assigned to
  **Phase 5** in the traceability table and in both rollups — the same structural move RUN-04 got at
  the close of Phase 4, not a paragraph alone. Status stays **Pending**: plan 05-02 *authors* the
  leg, plan 05-06 runs it and records the run URL and the per-step conclusions.

- **CI-03** — *"Windows CI is green for the right reasons — `.gitattributes` (`eol=lf`),
  `\r?\n`-tolerant snapshot assertions, pinned shell."* Three measurements taken during Phase 5
  discussion (D-09) are what make this cheap enough to land now and blocking from day one rather
  than as a narrow subset: **no snapshot matchers exist anywhere in the repo** (`toMatchSnapshot`,
  `toMatchInlineSnapshot` and `toMatchFileSnapshot` return zero matches — the "exact-snapshot"
  `provider-launch` tests are `toEqual` on argv arrays and are line-ending-immune); **exactly one
  test reads a file from disk** (`mcp-server.context.test.ts`) and it writes that file itself into a
  temp dir; and **no `.gitattributes` existed**. So the whole 278-test suite can be required on the
  Windows leg immediately — a narrow-but-blocking subset would have left the rest unguarded until
  Phase 9, and a `continue-on-error` leg is the weakness D-07 already rejected one layer up.
  `.gitattributes` (`* text=auto eol=lf`) is landed in Phase 5 as prophylaxis, because the surviving
  POSIX MCP wrapper still emits newline-joined shell text that Phase 7 will test. Status stays
  **Pending** for the same reason as CI-01.

- **What remains in Phase 9 after this move:** making the Windows job **required for merge** (a
  branch-protection change, not a workflow change) and green for the right reasons; deleting
  `.github/workflows/windows-llrt-probe.yml` and `scripts/windows-llrt-probe.mjs` — at which point
  the new gate's third arm fires on `grep` status 2 and must be re-pointed, which is exactly why the
  probe file is still in its scan-target list; and the deferred `caido:plugin` vitest alias, the one
  item that would raise SC-2's fidelity by making `index.ts` importable in tests. Phase 9 therefore
  owns no requirement IDs of its own, which is a narrowing, not an emptying.

**Closed at the end of Phase 5 (2026-08-20) — each with its evidence basis:**

Marked Complete by plan 05-06 after the phase gates were **executed** (not inferred from a diff)
and a real `windows-latest` run was read. The full record is
`.planning/phases/05-kill-shell-wrappers/05-REPORT.md`; the per-row contract is
`05-VALIDATION.md`, status `validated`, rows V-1 … V-19 green.

**What "Complete" means here, stated once so it is not over-read.** It means *the evidence this
phase was designed to produce exists and was executed*. It does **not** mean confirmed on a real
Windows Caido install. Every row below is bounded by the phase's five explicit non-claims
(V-20 … V-24 in `05-REPORT.md` § 1) — in particular: `index.ts` is not importable under vitest, so
its **wiring** of this machinery is evidenced by static gates and a dated human code review, not by
an executing test (V-21); and every Windows result was measured on **Node, not on Caido's LLRT**
(V-22/V-23).

- **RUN-01** — *no POSIX dependency; `node` spawned directly, no `chmod`, no `#!/bin/bash`, no
  `.sh` execution.* Evidence: comment-stripped `.sh` literal count **1** (the survivor is
  `getMcpWrapperPath`'s own, POSIX Gemini/Codex only, unreachable on win32 and headed
  `DELETED IN PHASE 7 (PRV-03)`); `spawnAndWait("chmod"` count **1**, likewise inside the
  win32-guarded wrapper; `launchCommand` / `launchArgs` / `launchScriptPreview` /
  `writeLaunchScript` all **0 on the raw file**; site inventory matching the expected definition
  and call-site set; V-1 and V-12/V-16 green. Residual: V-21, V-23.

- **RUN-02** — *env reaches the server via spawn `env` / config-JSON `env`, not a shell `export`.*
  Evidence: V-2, V-3, V-4, V-10 green as unit tests over the pure spec module; the **two-sided**
  parent-spread gate (raw `env:` count 4, allow-list filter empty) — the only vehicle-independent
  control the phase has; V-16 green. Residual: **V-22** — the Node vehicle back-fills eleven
  `required_vars`, so a bare-dict regression would pass every executing test in this repo. The
  static gate is what stands between that regression and a shipped release.

- **RUN-04** — *temp-file write→spawn path tolerates the Windows AV write-then-exec race.* Marked
  Complete on a **structural** argument, written here so it survives the phase boundary. The
  parenthetical half was already shipped in Phase 4: the one-time `mcp-server.mjs` staging copy
  runs inside `withFsRetry`'s 6-attempt / ~1,500 ms ladder with `mcpFirstWriteAttempts` surfaced in
  `getDiagnostics`. The headline half — the write→`chmod`→`rename`→exec pairs in `writeLaunchScript`
  and `writeMcpWrapper` that `04-RESEARCH.md` names the single best-documented AV case, and which
  Phase 4's CMP-01 scope fence forbade touching — is now satisfied because **those pairs no longer
  exist on any Windows-reachable path**: `writeLaunchScript` is deleted outright, and
  `writeMcpWrapper` is POSIX-only behind a win32 guard proven by a unit test on the predicate. The
  race is *eliminated* rather than tolerated, which is a stronger result than the ladder. Separately,
  the ladder gained its **second** production call site (`writeTemp`, covering the token-bearing
  Claude and Copilot config writes), so it is no longer one refactor away from inert, with its
  attempt count in a distinct `mcpTempWriteAttempts` field. **Residual, and explicitly not claimed:
  V-20** — a real Defender lock on real hardware is not inducible on any CI runner. Real-machine
  confirmation from the original Windows reporter is **Phase 9/10**.

- **HLT-01** — *`validateCaidoAuth` succeeds on Windows for the Claude path.* Evidence: V-12 green
  locally and **V-16 green on `windows-latest`** — the production `buildMcpServerSpec` output spawns
  the real `assets/mcp-server.mjs` and `--validate-auth` returns `{ok:true}`; plus the site
  inventory showing `validateCaidoAuth` has one definition and two call sites, **neither of which
  passes a path**. Residual: V-21 — the two-line `index.ts` wrapper over those proven inputs is
  evidenced by grep and human review, not by an executing test.

- **HLT-02** — *MCP self-test (`tools/list`, `get_environment`, `search_history`) passes on
  Windows.* Evidence: V-13 green locally and **V-17 green on `windows-latest`**, over stdio
  JSON-RPC against the real server, with both integration cases recorded as **executed, not
  skipped**. Residual: V-21.

- **CMP-01** — *all existing macOS/Linux behaviour preserved.* Evidence: the `provider-launch`
  tripwire is **byte-unchanged** across the whole phase (`git diff --stat` against the pre-phase
  commit is empty) and passes unedited; the suite went **263 → 290** with **zero tests removed as
  obsolete**, verified mechanically rather than asserted; `enforceOwnerOnlyDir`'s `fs/promises`
  namespace `chmod` is byte-identical, and the whole-file `chmod` count stays deliberately
  **non-zero** (15) because a zero there would mean a POSIX security control had been deleted;
  `pnpm -r typecheck` and `pnpm lint --max-warnings 0` both exit 0. The Gemini/Codex POSIX wrapper
  was **kept** rather than deleted precisely to avoid a live CMP-01 regression for two shipping
  providers on the platforms the entire user base runs today (D-01).

- **CI-01** — *a `windows-latest` job builds the plugin and runs vitest.* Evidence: the blocking
  `Verify (Windows)` leg exists in `ci.yml` and is green on [run 32378434081](https://github.com/six2dez/drift/actions/runs/32378434081), with per-step
  conclusions recorded by name and the artifact asserted **by path** —
  `-rw-r--r-- 1 runneradmin 197121 2487350 Aug 20 14:10 dist/plugin_package.zip` — rather than by
  `caido-dev`'s pathless success line. `timeout-minutes` is now **6**, derived from three measured
  runs (87 s cold cache, 91 s warm, 84 s), with the run URLs beside the value.
  **What remains for Phase 9:** making the job **required for merge** (a branch-protection change,
  not a workflow change), deleting `.github/workflows/windows-llrt-probe.yml` and
  `scripts/windows-llrt-probe.mjs` — at which point the secret gate's third arm fires on `grep`
  status 2 and must be **re-pointed, not removed** — and the deferred `caido:plugin` vitest alias,
  the one change that would raise V-21's fidelity by making `index.ts` importable in tests.

- **CI-03** — *Windows CI is green for the **right** reasons.* Evidence: `.gitattributes`
  (`* text=auto eol=lf`) landed (V-15); `shell: bash` pinned on every run step in the job and
  asserted by `.github/scripts/check-ci-windows-job.sh` (14 assertions, exit 0); and — the
  substantive part — the **first** real run was **red**, was read rather than retried, and the two
  failures were fixed at the correct layer. One was a genuine production defect (`extractHomeDir`
  normalised with the platform-flavoured `path.normalize`, so both of its prefix arms were dead on
  win32); the other was a test that hard-coded a POSIX literal against a helper that is
  host-flavoured by design. Weakening the first assertion would have hidden a real bug; "fixing"
  the code for the second would have broken correct Windows behaviour. Distinguishing them is
  exactly what this requirement asks for. Note this touched `command-resolution.ts`, which had
  been untouched by Phase 5 until then; teaching `extractHomeDir` about `C:\Users\<name>` remains
  **RES-03, Phase 6**, and is not claimed here.

---
*Requirements defined: 2026-06-26*
*Last updated: 2026-08-21 — Plugin Bridge (PBR-01…PBR-08) added for Phases 11-13, grounded in .planning/research/PLUGIN-BRIDGE.md. 2026-08-20 — Phase 5 closed: RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01, CI-01 and CI-03 marked Complete by plan 05-06, each with the evidence basis and residual non-claims recorded in the section above. Earlier the same day: Phase 4 closed (RUN-03, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04) with RUN-04 re-targeted to Phase 5, and CI-01/CI-03 pulled forward from Phase 9 into Phase 5 by plan 05-02*
