# Roadmap: Drift — Native Windows Milestone

## Overview

This milestone is a brownfield platform **port**, not new-feature work: Drift already ships on macOS/Linux, and the entire MCP launch path in `packages/backend/src/index.ts` is POSIX-only. The journey is eight dependency-ordered layers of a refactor that take the launch path from "`chmod` + `#!/bin/bash` + `.sh` spawn" to "direct `node.exe` spawn + structured `env` injection," extend command/binary resolution to Windows, harden process lifecycle, and lock everything behind a permanent `windows-latest` CI net.

Two things shape the order. First, Caido's LLRT/QuickJS runtime behavior on Windows is unverified, so **Phase 1 is a CI spike** that proves the seven load-bearing primitives before any production code is built on them. Second, the **blocking must-have is Claude on Windows end-to-end (PRV-01)** — its critical path is **Phases 1 → 2 → 3 → 4 + the provider-spawn slice of Phase 5**. Phases 6–8 unlock the remaining three CLIs' lifecycle hardening, the permanent CI gate, and first-class Windows install polish.

**Validation mechanism:** the maintainer cannot test native Windows locally, so `windows-latest` CI (build + vitest, including the `mcp-server.*.test.ts` integration spawn tests) is the source of truth for every phase, supplemented where possible by the original reporter confirming on a real machine.

**Milestone invariant (CMP-01 / CMP-02):** every phase must preserve existing macOS/Linux behavior — the POSIX launch path stays byte-for-byte unchanged behind `os.platform()` guards, and the existing snapshot/unit tests must stay green. CMP-01 and CMP-02 each anchor to one phase below for traceability, but the invariant is enforced in every phase.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: CI Spike — Prove LLRT Basics on Windows** - Prove the 7 LLRT runtime primitives on `windows-latest` before writing any port code
- [ ] **Phase 2: Platform Foundation** - Pure `platform.ts`, `os.tmpdir()` everywhere, AV-retry, fail-loud runtime probe
- [ ] **Phase 3: Kill Shell Wrappers** - Direct `node` spawn + `env` injection; the headline bug fix; health check green on Windows
- [ ] **Phase 4: Windows Command Resolution** - `where`/`PATHEXT`/install-location discovery of `node.exe` and provider CLIs
- [ ] **Phase 5: Provider Spawn & Registration** - Claude end-to-end (MVP) + safe `.cmd` spawning + Gemini/Codex/Copilot registration
- [ ] **Phase 6: Process Lifecycle** - `taskkill /T /F` process-tree death so cancel/timeout leaves no token-bearing orphan
- [ ] **Phase 7: CI Hardening** - Required `windows-latest` job green for the right reasons (`.gitattributes`, `\r?\n`-safe snapshots)
- [ ] **Phase 8: Windows Polish** - Install/prereqs docs, not-on-PATH detection, Windows-aware diagnostics, `windowsHide`

## Phase Details

### Phase 1: CI Spike — Prove LLRT Basics on Windows
**Goal**: De-risk the whole port by proving on a real Windows host that Caido's LLRT runtime exposes the seven primitives every later phase depends on — before any production code is written on top of them.
**Depends on**: Nothing (first phase)
**Requirements**: CI-02
**Success Criteria** (what must be TRUE):
  1. A `windows-latest` CI job runs a self-contained LLRT probe and reports all 7 assertions, with the P0 `spawn(node, [script], { env })` env-passthrough result (child sees `SENTINEL`) explicitly PASS or FAIL.
  2. The probe confirms `os.tmpdir()` returns a drive-lettered path that exists on disk and `os.platform()` returns `"win32"` inside the Caido backend runtime.
  3. The probe records the remaining assertions: `.cmd` direct-spawn behavior (EINVAL / runs / hangs), `where.exe` spawnability + CRLF output parse, bare `"os"` import resolution, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` presence, and `crypto.randomUUID` availability.
  4. Results are captured as a CI log/artifact that confirms the direct-spawn + env-injection architecture (or triggers the documented `.cmd`-launcher fallback) and feeds back to this roadmap before Phase 2 begins.
**Plans**: 1 plan (provisional)
**Research flag**: YES — this phase IS the research. Its results resolve the LLRT unknowns all other phases depend on and must feed back before Phase 2.

### Phase 2: Platform Foundation
**Goal**: Establish the pure platform-abstraction layer and OS-portable temp/runtime plumbing that every later phase builds on, without changing macOS/Linux behavior.
**Depends on**: Phase 1
**Requirements**: RUN-03, RUN-04, RUN-05, CMP-02
**Success Criteria** (what must be TRUE):
  1. A new pure `platform.ts` module (platform injected as a parameter, no I/O) is fully unit-tested on the Linux CI runner, covering temp root, `which`/`where` selection, home dirs, and executable candidate names.
  2. All three hardcoded `/tmp` sites (runtime dir, orphan sweep, debug logs) resolve through `os.tmpdir()`, and the existing macOS orphan-sweep still finds Drift's dirs under `/var/folders/...` (CMP-02).
  3. The write→spawn hot path copies `mcp-server.mjs` once at MCP start (not per turn) and retries on `EPERM`/`EBUSY`/`UNKNOWN` with bounded backoff (~5 attempts, 50–500 ms); temp-path/filename scheme is shortened for MAX_PATH safety.
  4. At MCP start, a runtime-capability probe fails loud with an actionable message including the Caido/runtime version when a required primitive (e.g. `os.tmpdir()`) is missing, instead of failing cryptically.
  5. Existing macOS/Linux unit and snapshot tests stay green.
**Plans**: 2 plans (provisional)
**Research flag**: NO — well-documented Node/Windows APIs; Phase 1 confirms the LLRT surface.

### Phase 3: Kill Shell Wrappers
**Goal**: Replace the POSIX shell-wrapper launch indirection with a single direct-`node`-spawn keystone so the MCP self-test and health check pass on Windows for the Claude path — the direct fix for the reported bug — with zero POSIX regressions.
**Depends on**: Phase 2 (can proceed in parallel with Phase 4)
**Requirements**: RUN-01, RUN-02, HLT-01, HLT-02, CMP-01
**Success Criteria** (what must be TRUE):
  1. The MCP server launches via a single `buildMcpServerSpec()` → `spawnNode()` path that spawns `node` directly with `env`; `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call, and every `.sh` file are deleted from the codebase.
  2. On `windows-latest` CI, `validateCaidoAuth` (HLT-01) and the MCP self-test of `tools/list`, `get_environment`, `search_history` (HLT-02) pass for the Claude `node`/`mjs` path.
  3. The Caido token and `DRIFT_*` vars reach the MCP server only via the spawn `env` option / config-JSON `env` field — no shell `export` wrapper — verified by the integration spawn test.
  4. The macOS/Linux launch path is unchanged behind `os.platform()` guards and the existing `provider-launch` exact-snapshot tests stay green (CMP-01).
**Plans**: 2 plans (provisional)
**Research flag**: NO — design fully specified in `research/ARCHITECTURE.md`.

### Phase 4: Windows Command Resolution
**Goal**: Make `node.exe` and the provider CLIs reliably locatable on real Windows machines so the Phase 3 spec can be populated with absolute, correctly-extensioned paths.
**Depends on**: Phase 2 (can proceed in parallel with Phase 3)
**Requirements**: RES-01, RES-02, RES-03, UX-02
**Success Criteria** (what must be TRUE):
  1. On Windows, Drift locates `node.exe` via `where` plus Windows install-location candidates (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`).
  2. Drift resolves provider CLI binaries to an absolute path with explicit extension, preferring `.exe` over `.cmd`, parsing `where`'s CRLF/multi-line output `\r`-safely.
  3. Home-dir detection recognizes `C:\Users\<name>` and reads `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, while macOS/Linux `HOME` resolution is unchanged.
  4. A "CLI / Node not found" error shows correct per-provider Windows install commands, including the corrected `@github/copilot` guidance (replacing the deprecated `gh copilot` extension hint).
  5. Extended `command-resolution` unit tests cover the Windows cases and run green on the Linux CI runner.
**Plans**: 2 plans (provisional)
**Research flag**: NO for Windows install paths (build-time note: re-verify the Volta/fnm/nvm-windows candidate list against current installer docs).

### Phase 5: Provider Spawn & Registration
**Goal**: Complete the Claude end-to-end critical path (the blocking must-have) and bring up the remaining three CLIs — spawning `.cmd` shims safely and registering external CLIs with token hygiene.
**Depends on**: Phase 3, Phase 4
**Requirements**: PRV-01, PRV-02, PRV-03, PRV-04, UX-01
**Success Criteria** (what must be TRUE):
  1. On Windows, a user can run a Claude Code chat end-to-end with the Drift MCP attached — the blocking must-have (PRV-01), exercised via the Windows CI spawn path and confirmed on the reporter's machine where possible.
  2. Provider `.cmd` shims spawn via a `cmd.exe /d /s /c <shim> <args>` argv array with `shell:false` (or the underlying `node.exe` entry directly); `shell:true` with dynamic args appears nowhere in the spawn path.
  3. Gemini and Codex registration passes `node.exe` + args + `env` via `-e`/`--env` with token hygiene (`${CAIDO_TOKEN}` reference, or `DRIFT_TOKEN_FILE` indirection for Codex), and `mcp remove` is guaranteed to run on cleanup (a failed remove is logged, not dropped).
  4. Gemini, Codex, and Copilot are usable on Windows on a best-effort basis, with Gemini's status gated on a real-machine confirmation checkpoint.
  5. The provider binary-path picker accepts `.exe`/`.cmd` paths.
**Plans**: 3 plans (provisional)
**Research flag**: YES for Gemini — open GitHub issues for Windows MCP reliability are unresolved; plan a real-machine confirmation checkpoint and treat Gemini as best-effort. Codex `${VAR}` expansion in `mcp add` needs CI confirmation (fallback: `DRIFT_TOKEN_FILE`).

### Phase 6: Process Lifecycle
**Goal**: Make cancel/timeout actually stop work on Windows so no orphaned token-bearing process survives a turn.
**Depends on**: Phase 5
**Requirements**: LIF-01
**Success Criteria** (what must be TRUE):
  1. A platform-branched `killTree(proc)` terminates the whole process tree on Windows via `spawn("taskkill", ["/pid", pid, "/T", "/F"])` (guarded against undefined pid) and keeps the existing SIGTERM→SIGKILL ladder on POSIX.
  2. Cancelling or timing out a turn on Windows leaves zero lingering `node.exe`/provider processes in Task Manager — no orphaned MCP process holding the Caido token.
  3. Session finalize / `stopMcpServer` kills all tracked pids before sweeping the temp dir, so token-bearing processes die before their env-source files are removed.
  4. macOS/Linux cancellation and timeout behavior is unchanged and existing tests stay green.
**Plans**: 1 plan (provisional)
**Research flag**: NO — `taskkill` is a well-documented Windows built-in.

### Phase 7: CI Hardening
**Goal**: Lock in every gain as a permanent, trustworthy regression net — a required `windows-latest` CI job that is green for the right reasons.
**Depends on**: Phases 3–5 (CI exercises their code; the job setup itself can begin in parallel with Phase 5)
**Requirements**: CI-01, CI-03
**Success Criteria** (what must be TRUE):
  1. A `windows-latest` CI job builds the plugin and runs vitest (`pnpm/action-setup@v4` + `actions/setup-node@v4` `cache:pnpm`, `shell: bash` pinned on cross-platform steps).
  2. A repo `.gitattributes` (`* text=auto eol=lf`) is in place and snapshot assertions are `\r?\n`-tolerant, so Windows CI passes for code reasons, not line-ending artifacts.
  3. The `mcp-server.*.test.ts` integration spawn tests actually execute on the Windows runner and pass.
  4. The full `ubuntu/macos/windows` matrix is green and the Windows job is required for merge.
**Plans**: 1 plan (provisional)
**Research flag**: NO — GitHub Actions Windows runner behavior is well-documented.

### Phase 8: Windows Polish
**Goal**: Complete the "first-class native Windows install" scope beyond bare parity — install docs, install-location discovery messaging, and Windows-aware diagnostics.
**Depends on**: Phases 4–7
**Requirements**: UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. A Windows install + prerequisites doc covers Node ≥ 18, the Claude native installer, the PowerShell `Set-ExecutionPolicy RemoteSigned` note, and the Codex npm win32 optional-dep caveat.
  2. Drift detects and messages the "not on PATH" case for the Claude native installer instead of failing opaquely.
  3. Windows-aware diagnostics surface the resolved binary, the spawn strategy used, and any `mcp add` skip reason in the support bundle / session log.
  4. `windowsHide: true` is set on every spawn so no console windows flash on Windows.
**Plans**: 1 plan (provisional)
**Research flag**: NO — UX copy and file-system probes.

## Critical Path

**Claude on Windows end-to-end (PRV-01, the blocking must-have)** = Phase 1 → Phase 2 → Phase 3 → Phase 4 + the provider-spawn slice of Phase 5.

```
Phase 1 (CI Spike: prove LLRT primitives)
   └─> Phase 2 (Platform Foundation: os.tmpdir, AV-retry, runtime probe)
         └─> Phase 3 (Kill Shell Wrappers: direct node spawn + env)   ──> health check green on Windows
               └─> Phase 4 (Windows Command Resolution: where/install dirs)
                     └─> Phase 5 [provider-spawn slice: buildSpawnSpec for the claude binary]
                           └─> *** CLAUDE MVP UNLOCKED ***
```

Phases 6–8 follow: process-lifecycle hardening, the permanent CI gate, and Windows install polish.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
Parallelism opportunities: Phase 4 may run alongside Phase 3 (both depend only on Phase 2); Phase 7 CI setup may begin alongside Phase 5.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. CI Spike — Prove LLRT Basics on Windows | 0/1 | Not started | - |
| 2. Platform Foundation | 0/2 | Not started | - |
| 3. Kill Shell Wrappers | 0/2 | Not started | - |
| 4. Windows Command Resolution | 0/2 | Not started | - |
| 5. Provider Spawn & Registration | 0/3 | Not started | - |
| 6. Process Lifecycle | 0/1 | Not started | - |
| 7. CI Hardening | 0/1 | Not started | - |
| 8. Windows Polish | 0/1 | Not started | - |

*Plan counts are provisional and refined by `/gsd-plan-phase`.*
