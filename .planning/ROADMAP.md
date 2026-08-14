# Roadmap: Drift — Hardening + Native Windows Milestone

## Overview

This milestone has two layers. **Phases 1–2 are a pre-port hardening layer** added 2026-08-12 after a full-codebase review: the test suite is red on Node ≥ 25, `pnpm lint` has never run, and a handful of correctness and security defects ship today on macOS/Linux. Entering a platform port with an untrustworthy CI signal makes every `windows-latest` failure ambiguous, so the signal gets restored first and the POSIX-side defects get fixed before the port starts rewriting the same code paths.

**Phases 3–10 are the original brownfield platform port**, not new-feature work: Drift already ships on macOS/Linux, and the entire MCP launch path in `packages/backend/src/index.ts` is POSIX-only. The journey takes the launch path from "`chmod` + `#!/bin/bash` + `.sh` spawn" to "direct `node.exe` spawn + structured `env` injection," extends command/binary resolution to Windows, hardens process lifecycle, and locks everything behind a permanent `windows-latest` CI net.

Two things shape the port's order. First, Caido's LLRT/QuickJS runtime behavior on Windows is unverified, so **Phase 3 is a CI spike** that proves the seven load-bearing primitives before any production code is built on them. Second, the **blocking must-have is Claude on Windows end-to-end (PRV-01)** — its critical path is **Phases 3 → 4 → 5 → 6 + the provider-spawn slice of Phase 7**. Phases 8–10 unlock the remaining three CLIs' lifecycle hardening, the permanent CI gate, and first-class Windows install polish.

**Validation mechanism:** the maintainer cannot test native Windows locally, so `windows-latest` CI (build + vitest, including the `mcp-server.*.test.ts` integration spawn tests) is the source of truth for every port phase, supplemented where possible by the original reporter confirming on a real machine. Phases 1–2 are validated on the existing Linux/macOS runners.

**Milestone invariant (CMP-01 / CMP-02):** every phase must preserve existing macOS/Linux behavior — the POSIX launch path stays byte-for-byte unchanged behind `os.platform()` guards, and the existing snapshot/unit tests must stay green. CMP-01 and CMP-02 each anchor to one phase below for traceability, but the invariant is enforced in every phase.

**Phase 2 boundary constraint:** Phase 2 must not touch the spawn-path code that Phases 5–8 rewrite (`renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, the `chmod` calls). Its scope was chosen so the two layers cannot collide. Items from the review that *do* live in that code — POSIX process-tree kill, temp-path plumbing, buffer bounds — are folded into Phases 4 and 8 instead.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Restore the Verification Signal** - Green suite on Node 20/22/24/26, real ESLint in CI, CI on every branch (completed 2026-08-13)
- [ ] **Phase 2: POSIX Correctness & Hardening** - Fix `check_scope`, `list_workflows`, settings-churn, token blast radius, and the frontend quick wins
- [x] **Phase 3: CI Spike — Prove LLRT Basics on Windows** - Prove the 7 LLRT runtime primitives on `windows-latest` before writing any port code (completed 2026-08-14)
- [ ] **Phase 4: Platform Foundation** - Pure `platform.ts`, `os.tmpdir()` everywhere, AV-retry, fail-loud runtime probe, bounded buffers
- [ ] **Phase 5: Kill Shell Wrappers** - Direct `node` spawn + `env` injection; the headline bug fix; health check green on Windows
- [ ] **Phase 6: Windows Command Resolution** - `where`/`PATHEXT`/install-location discovery of `node.exe` and provider CLIs
- [ ] **Phase 7: Provider Spawn & Registration** - Claude end-to-end (MVP) + safe `.cmd` spawning + Gemini/Codex/Copilot registration and approval channel
- [ ] **Phase 8: Process Lifecycle** - Process-tree death on Windows *and* POSIX so cancel/timeout leaves no token-bearing orphan
- [ ] **Phase 9: CI Hardening** - Required `windows-latest` job green for the right reasons (`.gitattributes`, `\r?\n`-safe snapshots)
- [ ] **Phase 10: Windows Polish** - Install/prereqs docs, not-on-PATH detection, Windows-aware diagnostics, `windowsHide`

## Phase Details

### Phase 1: Restore the Verification Signal

**Goal**: Make the test/lint/CI trio a trustworthy gate again, so every later phase — especially the Windows spike and the port — is validated by signal instead of noise.
**Depends on**: Nothing (first phase)
**Requirements**: SIG-01, SIG-02, SIG-03
**Success Criteria** (what must be TRUE):

  1. `pnpm exec vitest run` is green on Node 20, 22, 24 **and 26**. The five `ChatView.mount.test.ts` failures are gone, and `window.localStorage` (`packages/frontend/src/stores/settings.ts:72`) is read through a guard that tolerates an environment where storage is absent or throws — a runtime hazard in a restricted webview, not just a test artifact.
  2. `pnpm lint` invokes a real, installed ESLint with a committed flat config covering TypeScript and Vue, and passes with `--max-warnings 0`. The CI lint invocation carries no `--fix` — a linter that rewrites source and then reports success is a false pass.
  3. CI runs typecheck → lint → test → build on push and pull request for **every** branch (not only `main`), across a Node 20/22/24/**26** matrix with `fail-fast: false`, and a lint failure fails the job.
  4. The blind spot that hid this — CI pinned to a single Node version — is closed, and that closure is *proven*: on a scratch branch, reverting only the guard and the shim must turn the Node 26 leg red while 20/22/24 stay green.

**Plans**: 6 plansPlans:
**Wave 1**

- [x] 01-01-PLAN.md — Production storage guard in settings.ts + three guard unit tests (SIG-01e/f/g)
- [x] 01-02-PLAN.md — vitest.setup.ts Web Storage shim, setupFiles wiring, shim-inertness test (SIG-01i)
- [x] 01-03-PLAN.md — ESLint 10 toolchain: 8 exact-pinned devDeps, eslint.config.mjs, lint/lint:fix scripts, doc sync

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Clear lint debt to 0/0, prove the gate bites, cross-version green gate on Node 22/24/26
- [x] 01-05-PLAN.md — ci.yml four-leg Node matrix on every branch + release.yml lint step

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-06-PLAN.md — CI proofs: first green matrix run, SIG-03e lint-failure proof, SIG-03f revert-proof, A7 hand-off

**Research flag**: DONE — `01-RESEARCH.md` (2026-08-12). It corrected the brief: the failure appears on **Node ≥ 25**, not ≥ 22 (Node 25.0.0 unflagged Web Storage; measured 125/125 green on 22.23.2 and 24.13.0, 5 red on 26.7.0). Root cause is vitest's `getWindowKeys()` dropping any happy-dom window key that already exists on the Node global — `localStorage` is not in its allow-list, and is still absent in vitest 4.1.10, so upgrading does not help. Fix is a production guard **plus** a `vitest.setup.ts` shim (both measured green). Lint debt measured at 4 errors / 20 warnings — 0/0 after the recommended rule config.

### Phase 2: POSIX Correctness & Hardening

**Goal**: Fix the user-facing correctness and security defects that ship today on macOS/Linux, before the port starts rewriting the same files — without touching the spawn path Phases 5–8 own.
**Depends on**: Phase 1
**Requirements**: COR-01, COR-02, COR-03, COR-04, COR-05, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, PERF-01
**Success Criteria** (what must be TRUE):

  1. `check_scope` answers correctly for real Caido scope patterns: `*.target.com` matches `api.target.com` (today it returns *out of scope*), and `target.com` does **not** match `target.com.attacker.net` (today it returns *in scope*). Matching is anchored, glob-aware, and evaluated against the parsed hostname rather than the whole URL, with denylist precedence preserved. Both directions are covered by tests.
  2. The agent can discover convert workflows (`list_workflows`) and therefore actually use `run_workflow`, which today requires an ID no tool can produce.
  3. Saving a single setting only reruns the work that change requires. Toggling a permission group no longer clears Claude session resume across all chats, no longer re-runs `validateCaidoAuth`, and no longer re-registers Gemini/Codex (today every save does all three, because the frontend always posts the full settings object and the backend's `input.caidoApi !== undefined` guard never filters).
  4. Claude's system prompt advertises only the tools the active policy allows, instead of the hardcoded list of all 18.
  5. The Caido token reaches only the MCP server process — the redundant `CAIDO_TOKEN` export in the provider launch environment is removed, verified per provider (each already receives it through its own wrapper, config `env` dict, or registered wrapper).
  6. `sessionId` and `chatId` are validated against a strict character set before being interpolated into filesystem paths; model-rendered links cannot navigate the Caido webview away from the plugin; the dead `DRIFT_CONFIRM_SENSITIVE_ACTIONS` env var is wired or removed; tool metadata (group + `sensitive`) cannot silently desync between `shared/mcp.ts` and `mcp-server.mjs`; a failed chat load no longer hides persisted chats behind an auto-created empty chat.
  7. Markdown rendering allocates one parser for the message list rather than one `MarkdownIt` + highlight.js instance per bubble.
  8. Nothing in this phase modifies `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, or the `chmod` calls — the code Phases 5–8 replace.

**Plans**: 3 plans (provisional)
**Research flag**: NO — every item was traced to a specific file and line during the 2026-08-12 review, and the two scope-matching failures were reproduced.

### Phase 3: CI Spike — Prove LLRT Basics on Windows

**Goal**: De-risk the whole port by proving on a real Windows host that Caido's LLRT runtime exposes the seven primitives every later phase depends on — before any production code is written on top of them.
**Depends on**: Phase 1 (a trustworthy CI baseline to add the job to)
**Requirements**: CI-02
**Success Criteria** (what must be TRUE):

  1. A `windows-latest` CI job runs a self-contained LLRT probe and reports all 7 assertions, with the P0 `spawn(node, [script], { env })` env-passthrough result (child sees `SENTINEL`) explicitly PASS or FAIL.
  2. The probe confirms `os.tmpdir()` returns a drive-lettered path that exists on disk and `os.platform()` returns `"win32"` inside the Caido backend runtime.
  3. The probe records the remaining assertions: `.cmd` direct-spawn behavior (EINVAL / runs / hangs), `where.exe` spawnability + CRLF output parse, bare `"os"` import resolution, `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` presence, and `crypto.randomUUID` availability.
  4. Results are captured as a CI log/artifact that confirms the direct-spawn + env-injection architecture (or triggers the documented `.cmd`-launcher fallback) and feeds back to this roadmap before Phase 4 begins.

**Plans**: 5 plans (4 waves)Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Write the seven-assertion Node probe (four-surface spawn classifier, D-05/D-06/D-07 exit contract) and ignore its output file
- [x] 03-02-PLAN.md — Write the windows-latest probe workflow (bare triggers, ci.yml-matched pins, D-10 secret gate) and prove its structure against ci.yml

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-03-PLAN.md — Local pre-flight, then run the probe on a real windows-latest host and capture all seven assertion lines with the run URL

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — Falsifiability: break the probe on purpose, prove the job goes red and the artifact still uploads, then revert and tear down

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — Write 03-FINDINGS.md from the measured output and settle the P0-ENV blocker in STATE.md

**Research flag**: YES — this phase IS the research. Its results resolve the LLRT unknowns all other port phases depend on and must feed back before Phase 4.

**Results** (SC-4 feedback, 2026-08-14). Canonical verdict with all seven assertions verbatim: `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md` — cite that file, not the CI artifacts, which expire 2026-09-12.

| Run | Purpose | Conclusion |
|---|---|---|
| [31702392047](https://github.com/six2dez/drift/actions/runs/31702392047) | First authoritative run — 7/7 PASS, exit 0 | success |
| [31703442673](https://github.com/six2dez/drift/actions/runs/31703442673) | Falsifiability: probe FAIL reddens the job, artifact still uploads | failure — INTENDED |
| [31703717548](https://github.com/six2dez/drift/actions/runs/31703717548) | Falsifiability: the D-10 secret gate bites | failure — INTENDED |
| [31780073574](https://github.com/six2dez/drift/actions/runs/31780073574) | Re-run after code-review fixes — **authoritative for P0-ENV/P0-TMP** | success |

Three results bind the later phases, and Phase 4's criteria below encode the first:

1. **The spawn `env` option REPLACES the parent block on Windows, as on POSIX** (measured: parent-only marker returned `PARENT-CLEARED`). libuv back-fills only eleven `required_vars`; `APPDATA`/`LOCALAPPDATA` are not among them.
2. **Direct `.cmd` spawn is unusable** — Node ≥ 18.20.2 throws `EINVAL` synchronously from the CVE-2024-27980 guard. A `cmd.exe /c` branch is mandatory, and a `try`/`catch` around `spawn()` is required, not just an `error` handler.
3. **`os.tmpdir()` returns the 8.3 short form** (`C:\Users\RUNNER~1\...`) while `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` return long form — not string-comparable; normalise with `realpathSync.native` before any `startsWith`/`===`.

### Phase 4: Platform Foundation

**Goal**: Establish the pure platform-abstraction layer and OS-portable temp/runtime plumbing that every later phase builds on, without changing macOS/Linux behavior.
**Depends on**: Phase 3
**Requirements**: RUN-03, RUN-04, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):

  1. A new pure `platform.ts` module (platform injected as a parameter, no I/O) is fully unit-tested on the Linux CI runner, covering temp root, `which`/`where` selection, home dirs, and executable candidate names.
  2. All three hardcoded `/tmp` sites (runtime dir, orphan sweep, debug logs) resolve through `os.tmpdir()`, and the existing macOS orphan-sweep still finds Drift's dirs under `/var/folders/...` (CMP-02).
  3. The write→spawn hot path copies `mcp-server.mjs` once at MCP start (not per turn) and retries on `EPERM`/`EBUSY`/`UNKNOWN` with bounded backoff (~5 attempts, 50–500 ms); temp-path/filename scheme is shortened for MAX_PATH safety.
  4. At MCP start, a runtime-capability probe fails loud with an actionable message including the Caido/runtime version when a required primitive (e.g. `os.tmpdir()`) is missing, instead of failing cryptically.
  5. The MCP activity file is read incrementally from a byte offset instead of being fully re-read and re-parsed every 250 ms tick (PERF-02).
  6. Provider and Node binary resolution is cached with a short TTL, invalidated when a provider command changes, instead of spawning `which` and walking version-manager directories on every turn (PERF-03).
  7. `stdout`/`stderr` accumulation and the Claude stream parser's buffers are bounded with marked truncation, so a runaway CLI cannot exhaust the Caido backend's memory (PERF-04).
  8. Existing macOS/Linux unit and snapshot tests stay green.
  9. Every `spawn` call site that supplies an `env` option spreads the parent block — `{ ...process.env, ...driftVars }`, never `{ ...driftVars }` — and a test asserts it. Phase 3 measured that the `env` option **replaces** the parent environment on Windows as well as POSIX ([run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574), parent-only marker `PARENT-CLEARED`); libuv back-fills only eleven `required_vars`, and `APPDATA`/`LOCALAPPDATA` — the two `command-resolution.ts` needs for the Windows nvm/fnm candidate paths — are **not** among them.
  10. Path comparisons against a profile-derived path normalise both sides with `realpathSync.native` first: Phase 3 measured `os.tmpdir()` returning the 8.3 short form (`C:\Users\RUNNER~1\...`) while `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` return the long form, so the two spellings are not string-comparable.

**Plans**: 11 plans (5 waves)
Plans:
**Wave 1** *(seven independent pure modules — no shared files, fully parallel)*

- [x] 04-01-PLAN.md — `platform.ts` + tests: D-01's discrete pure OS-decision functions, `getSweepRoots`' legacy `/tmp` arm (CMP-02), `normalizePlatform`, `buildSpawnEnv` (SC-9)
- [x] 04-02-PLAN.md — `fs-retry.ts` + tests: the RUN-04 transient-FS classifier and the bounded 1,500 ms ladder with an injected sleep
- [x] 04-03-PLAN.md — `runtime-probe.ts` + tests: D-06's gate table as data, D-08's version block, the failure message, and D-04's `normalizePathForCompare` ladder (SC-10)
- [x] 04-04-PLAN.md — `activity-tail.ts` + tests: PERF-02's byte cursor, partial-line carry, and the exact-length `Buffer.alloc` the LLRT `copy_from_slice` constraint demands
- [x] 04-05-PLAN.md — `bounded-buffer.ts` + tests: PERF-04 site A — `appendBounded` with three retention policies and **five** exported caps covering **six** total-volume accumulator sites (the sixth, `resolveCommand`'s `out`, reuses `SPAWN_STDOUT_MAX_CHARS`), plus `drainCompleteLines` for the one line-drain site. Corrected from "four per-site caps": the inventory grep is blind to `index.ts:862` and `:1268`
- [x] 04-06-PLAN.md — `claude-print.ts` bound + split-once refactor: PERF-04 site B, the 4 MiB drop path and the O(n^2) slicing fix
- [x] 04-07-PLAN.md — `resolution-cache.ts` + tests: PERF-03's TTL cache with an injected clock, negative caching, and signature invalidation

**Wave 2** *(blocked on 04-01, 04-02, 04-03)*

- [x] 04-08-PLAN.md — `index.ts`: the single guarded `os` read (D-02), the probe wrapping the real first write (D-05/D-06/D-07/D-08), all three `/tmp` sites onto `os.tmpdir()`, and the D-06/D-08 diagnostics fields

**Wave 3** *(blocked on 04-04, 04-05, 04-08)*

- [x] 04-09-PLAN.md — `index.ts`: PERF-02's offset read replacing the 250 ms whole-file re-parse, plus **six** of PERF-04's seven accumulator sites — five total-volume ones through `appendBounded`, and `callMcpMethod`'s JSON-RPC drain buffer through `drainCompleteLines`. (The earlier "four bounded accumulators" wording was the first of two undercounts the plan itself corrected: `grep -n "stdout += \|stderr += "` sees only five of the seven, and is structurally blind to `stdoutBuffer +=` and to `out +=`. Site 7, `resolveCommand`'s `out`, is 04-10's.)

**Wave 4** *(blocked on 04-07, 04-09)*

- [x] 04-10-PLAN.md — `index.ts`: PERF-03 wiring — one cache for both resolution paths (deleting the infinite `lastNodeExecutable`, so for node it is a **tightening**), invalidation on provider-command change, bypass on the manual Check button, and `getDiagnostics` rewired off its direct resolver call. **Also PERF-04's seventh and last site** — `resolveCommand`'s `out`, the one the inventory grep is blind to — bounded in the same edit, so the phase-wide `out += \|stderr += ` pattern now reaches `0` and 04-11's Gate 7 grades seven of seven

**Wave 5** *(blocked on 04-06, 04-10)*

- [ ] 04-11-PLAN.md — Phase gates (no hardcoded `/tmp`, probe ordering, SC-9 cross-check, D-04 survival, `pnpm build`, CMP-01 tripwire) + the blocking human read of the RUN-05 failure message

**Research flag**: NO — well-documented Node/Windows APIs; Phase 3 confirms the LLRT surface (see its Results table). `04-RESEARCH.md` (2026-08-14) went further and read Caido's own LLRT fork source, which overturned three planning assumptions: `realpath` is **absent** from `caido/dependency-llrt@main`'s `fs` module, so SC-10's ladder always lands on `path.resolve` under Caido (ship the shape, report the rung); LLRT's `os.tmpdir()` can return a **trailing backslash** where Node strips it, so every temp path uses `path.join`; and LLRT's `FileHandle.read` panics unless the buffer is sized exactly to the read length, which is unobservable on Node.

**Planning note**: the provisional "2 plans" estimate is superseded. `04-RESEARCH.md` § *Validation Architecture* is the reason: six of the seven requirements land in `index.ts`, which is 3,004 lines with **zero** direct test coverage, and the maintainer cannot test native Windows locally. Splitting each behaviour into a pure module with an injected `platform` moves 33 of 37 criteria into the Linux-provable bucket — ~94% of the phase — versus leaving them unverifiable by construction. The extra plans are what buy that ratio.

### Phase 5: Kill Shell Wrappers

**Goal**: Replace the POSIX shell-wrapper launch indirection with a single direct-`node`-spawn keystone so the MCP self-test and health check pass on Windows for the Claude path — the direct fix for the reported bug — with zero POSIX regressions.
**Depends on**: Phase 4 (can proceed in parallel with Phase 6)
**Requirements**: RUN-01, RUN-02, HLT-01, HLT-02, CMP-01
**Success Criteria** (what must be TRUE):

  1. The MCP server launches via a single `buildMcpServerSpec()` → `spawnNode()` path that spawns `node` directly with `env`; `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call, and every `.sh` file are deleted from the codebase.
  2. On `windows-latest` CI, `validateCaidoAuth` (HLT-01) and the MCP self-test of `tools/list`, `get_environment`, `search_history` (HLT-02) pass for the Claude `node`/`mjs` path.
  3. The Caido token and `DRIFT_*` vars reach the MCP server only via the spawn `env` option / config-JSON `env` field — no shell `export` wrapper — verified by the integration spawn test.
  4. The macOS/Linux launch path is unchanged behind `os.platform()` guards and the existing `provider-launch` exact-snapshot tests stay green (CMP-01).

**Plans**: 2 plans (provisional)
**Research flag**: NO — design fully specified in `research/ARCHITECTURE.md`.

### Phase 6: Windows Command Resolution

**Goal**: Make `node.exe` and the provider CLIs reliably locatable on real Windows machines so the Phase 5 spec can be populated with absolute, correctly-extensioned paths.
**Depends on**: Phase 4 (can proceed in parallel with Phase 5)
**Requirements**: RES-01, RES-02, RES-03, UX-02
**Success Criteria** (what must be TRUE):

  1. On Windows, Drift locates `node.exe` via `where` plus Windows install-location candidates (`%APPDATA%\npm`, `%USERPROFILE%\.local\bin`, Volta/Bun/pnpm/scoop/nvm-windows, `%ProgramFiles%\nodejs`).
  2. Drift resolves provider CLI binaries to an absolute path with explicit extension, preferring `.exe` over `.cmd`, parsing `where`'s CRLF/multi-line output `\r`-safely.
  3. Home-dir detection recognizes `C:\Users\<name>` and reads `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, while macOS/Linux `HOME` resolution is unchanged.
  4. A "CLI / Node not found" error shows correct per-provider Windows install commands, including the corrected `@github/copilot` guidance (replacing the deprecated `gh copilot` extension hint).
  5. Extended `command-resolution` unit tests cover the Windows cases and run green on the Linux CI runner.

**Plans**: 2 plans (provisional)
**Research flag**: NO for Windows install paths (build-time note: re-verify the Volta/fnm/nvm-windows candidate list against current installer docs).

### Phase 7: Provider Spawn & Registration

**Goal**: Complete the Claude end-to-end critical path (the blocking must-have) and bring up the remaining three CLIs — spawning `.cmd` shims safely, registering external CLIs with token hygiene, and closing the Gemini/Codex approval gap.
**Depends on**: Phase 5, Phase 6
**Requirements**: PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, UX-01
**Success Criteria** (what must be TRUE):

  1. On Windows, a user can run a Claude Code chat end-to-end with the Drift MCP attached — the blocking must-have (PRV-01), exercised via the Windows CI spawn path and confirmed on the reporter's machine where possible.
  2. Provider `.cmd` shims spawn via a `cmd.exe /d /s /c <shim> <args>` argv array with `shell:false` (or the underlying `node.exe` entry directly); `shell:true` with dynamic args appears nowhere in the spawn path.
  3. Gemini and Codex registration passes `node.exe` + args + `env` via `-e`/`--env` with token hygiene (`${CAIDO_TOKEN}` reference, or `DRIFT_TOKEN_FILE` indirection for Codex), and `mcp remove` is guaranteed to run on cleanup (a failed remove is logged, not dropped).
  4. Gemini and Codex either get a per-session approval/activity channel like Claude and Copilot, or their sensitive tools are disabled and that limitation is stated in-product and in the README (PRV-05). Today they are registered against the shared wrapper with no `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE`, so every sensitive tool fails closed with an unexplained error and no MCP activity trace ever reaches the chat.
  5. Gemini, Codex, and Copilot are usable on Windows on a best-effort basis, with Gemini's status gated on a real-machine confirmation checkpoint.
  6. The provider binary-path picker accepts `.exe`/`.cmd` paths.

**Plans**: 3 plans (provisional)
**Research flag**: YES for Gemini — open GitHub issues for Windows MCP reliability are unresolved; plan a real-machine confirmation checkpoint and treat Gemini as best-effort. Codex `${VAR}` expansion in `mcp add` needs CI confirmation (fallback: `DRIFT_TOKEN_FILE`).

### Phase 8: Process Lifecycle

**Goal**: Make cancel/timeout actually stop work on **both** platforms so no orphaned token-bearing process survives a turn.
**Depends on**: Phase 7
**Requirements**: LIF-01, LIF-02
**Success Criteria** (what must be TRUE):

  1. A platform-branched `killTree(proc)` terminates the whole process tree on Windows via `spawn("taskkill", ["/pid", pid, "/T", "/F"])` (guarded against undefined pid).
  2. On POSIX the same guarantee holds: the CLI's MCP child — which carries `CAIDO_TOKEN` in its environment — is killed with the parent, via `detached: true` + process-group signalling, instead of today's single-pid SIGTERM→SIGKILL ladder that leaves it to the CLI's own cleanup (LIF-02).
  3. Cancelling or timing out a turn leaves zero lingering `node.exe`/provider processes on either platform — no orphaned MCP process holding the Caido token.
  4. Session finalize / `stopMcpServer` kills all tracked pids before sweeping the temp dir, so token-bearing processes die before their env-source files are removed.
  5. macOS/Linux cancellation and timeout semantics visible to the user are unchanged and existing tests stay green.

**Plans**: 1 plan (provisional)
**Research flag**: NO — `taskkill` is a well-documented Windows built-in; POSIX process groups are standard.

### Phase 9: CI Hardening

**Goal**: Lock in every gain as a permanent, trustworthy regression net — a required `windows-latest` CI job that is green for the right reasons.
**Depends on**: Phases 5–7 (CI exercises their code; the job setup itself can begin in parallel with Phase 7)
**Requirements**: CI-01, CI-03
**Success Criteria** (what must be TRUE):

  1. A `windows-latest` CI job builds the plugin and runs vitest, with action pins matching `ci.yml` as it exists then — currently `pnpm/action-setup@v6` + `actions/setup-node@v5` (Phase 1 replaced the `@v4` pins this criterion originally named; `@v4` also drags in the deprecated Node 20 actions runtime) — `cache: pnpm`, and `shell: bash` pinned on cross-platform steps. Note from Phase 3: `actions/setup-node@v5` defaults `package-manager-cache: true` and auto-enables pnpm caching from `packageManager`, which fails the job at `Setup Node` unless `pnpm/action-setup` runs first or the input is set to `false`.
  1a. The **D-10 no-secret-material gate** from Phase 3's probe workflow is carried forward into this job rather than dropped when `windows-llrt-probe.yml` is deleted (D-02). It must keep its three-branch form: `grep` status 0 = match → fail, status 1 = clean → pass, anything else (including a missing or unreadable target) → fail. It is the only part of Phase 3 observed to bite ([run 31703717548](https://github.com/six2dez/drift/actions/runs/31703717548)) and the only part Phases 4-8 depend on silently.

  2. A repo `.gitattributes` (`* text=auto eol=lf`) is in place and snapshot assertions are `\r?\n`-tolerant, so Windows CI passes for code reasons, not line-ending artifacts.
  3. The `mcp-server.*.test.ts` integration spawn tests actually execute on the Windows runner and pass.
  4. The full `ubuntu/macos/windows` matrix is green and the Windows job is required for merge.

**Plans**: 1 plan (provisional)
**Research flag**: NO — GitHub Actions Windows runner behavior is well-documented.

### Phase 10: Windows Polish

**Goal**: Complete the "first-class native Windows install" scope beyond bare parity — install docs, install-location discovery messaging, and Windows-aware diagnostics.
**Depends on**: Phases 6–9
**Requirements**: UX-03, UX-04
**Success Criteria** (what must be TRUE):

  1. A Windows install + prerequisites doc covers Node ≥ 18, the Claude native installer, the PowerShell `Set-ExecutionPolicy RemoteSigned` note, and the Codex npm win32 optional-dep caveat.
  2. Drift detects and messages the "not on PATH" case for the Claude native installer instead of failing opaquely.
  3. Windows-aware diagnostics surface the resolved binary, the spawn strategy used, and any `mcp add` skip reason in the support bundle / session log.
  4. `windowsHide: true` is set on every spawn so no console windows flash on Windows.

**Plans**: 1 plan (provisional)
**Research flag**: NO — UX copy and file-system probes.

## Critical Path

**Claude on Windows end-to-end (PRV-01, the blocking must-have)** = Phase 1 → Phase 3 → Phase 4 → Phase 5 → Phase 6 + the provider-spawn slice of Phase 7.

Phase 2 is **not** on the critical path — it is user-facing correctness work on the current platforms and may run in parallel with Phase 3 if capacity allows. It is sequenced before the port because it touches files the port will rewrite, and doing it after would mean rebasing the fixes onto a changed launch path.

```
Phase 1 (Restore the Verification Signal: green suite, real lint, CI matrix)
   ├─> Phase 2 (POSIX Correctness & Hardening)   [parallel, off the critical path]
   └─> Phase 3 (CI Spike: prove LLRT primitives)
         └─> Phase 4 (Platform Foundation: os.tmpdir, AV-retry, runtime probe, bounded buffers)
               └─> Phase 5 (Kill Shell Wrappers: direct node spawn + env)  ──> health check green on Windows
                     └─> Phase 6 (Windows Command Resolution: where/install dirs)
                           └─> Phase 7 [provider-spawn slice: buildSpawnSpec for the claude binary]
                                 └─> *** CLAUDE MVP UNLOCKED ***
```

Phases 8–10 follow: process-lifecycle hardening on both platforms, the permanent CI gate, and Windows install polish.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10.
Parallelism opportunities: Phase 2 may run alongside Phase 3 (both depend only on Phase 1); Phase 6 may run alongside Phase 5 (both depend only on Phase 4); Phase 9 CI setup may begin alongside Phase 7.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Restore the Verification Signal | 6/6 | Complete    | 2026-08-13 |
| 2. POSIX Correctness & Hardening | 0/3 | Not started | - |
| 3. CI Spike — Prove LLRT Basics on Windows | 5/5 | Complete    | 2026-08-14 |
| 4. Platform Foundation | 10/11 | In Progress | - |
| 5. Kill Shell Wrappers | 0/2 | Not started | - |
| 6. Windows Command Resolution | 0/2 | Not started | - |
| 7. Provider Spawn & Registration | 0/3 | Not started | - |
| 8. Process Lifecycle | 0/1 | Not started | - |
| 9. CI Hardening | 0/1 | Not started | - |
| 10. Windows Polish | 0/1 | Not started | - |

*Plan counts are provisional and refined by `/gsd-plan-phase`.*

## Backlog

Unsequenced ideas from the 2026-08-12 codebase review. Not ready for active planning; promote with `/gsd-review-backlog`.

### Phase 999.1: Event-driven sendCliMessage refactor (BACKLOG)

**Goal:** [Captured for future planning] `sendCliMessage` holds an RPC promise open for the entire turn, and Caido's runtime does not deliver `child_process` callbacks or run `setInterval` while an RPC awaits. Every pumping workaround exists because of this: the 1.5 s frontend keep-alive, `activeSelfTestPoll`, `sessionWatchdogs`, and the 250 ms heartbeat. Returning a `turnId` immediately and delivering results over the existing event channel would delete the whole problem class (~300 lines). Deliberately sequenced after the port — it collides head-on with Phases 5 and 8.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.2: Scope gate and rich approval preview for send_request (BACKLOG)

**Goal:** [Captured for future planning] Depends on the Phase 2 `check_scope` fix. Add an opt-in server-side gate that blocks out-of-scope sends, and replace the `raw=812 chars` approval summary with request line + Host + a bounded body preview and an OUT OF SCOPE badge. Today the user approves replay traffic without seeing what is being sent.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Additional MCP tools — response-body search and sitemap (BACKLOG)

**Goal:** [Captured for future planning] `search_response_bodies` (grep across response bodies — the highest-value missing capability for secret and endpoint discovery) and sitemap access. `list_workflows` from the same review is already scheduled in Phase 2 as COR-02.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Create finding from chat (BACKLOG)

**Goal:** [Captured for future planning] A button that takes the hypothesis and evidence from a turn and pre-fills `create_finding`. Closes the Review → Validate → **Report** loop the README already advertises.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: Drift Explain request view mode (BACKLOG)

**Goal:** [Captured for future planning] Register `sdk.ui.addRequestViewMode` so History/Replay/Search get a "Drift: Explain" tab that summarizes the selected request without opening the chat.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.6: Idle-based turn timeout (BACKLOG)

**Goal:** [Captured for future planning] The 120 s absolute `processTimeoutSeconds` default is too short for an agentic turn with several tool calls. Cut on stdout silence rather than total duration.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.7: Replay session reuse in send_request (BACKLOG)

**Goal:** [Captured for future planning] `send_request` creates a new Caido replay session per call, so fifty agent requests leave fifty sessions in the user's Replay list. Reuse a single Drift session, or make session creation opt-in.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.8: Transparent search_history and truncation markers (BACKLOG)

**Goal:** [Captured for future planning] `search_history` silently ANDs the active Caido UI filter into every query, so the agent gets zero results and cannot tell why. Return the effective filter in the response and offer a flag to ignore it. Related: `get_request` truncates responses at 50 000 chars with no marker.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.9: Chat UX minors (BACKLOG)

**Goal:** [Captured for future planning] Keyboard shortcuts via `sdk.shortcuts`; token usage accounting for all four providers (only Claude parses `usage` today); chat export to an H1/Bugcrowd report template; replace the remaining `window.confirm` in `ChatView.vue` with the existing custom modal.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.10: Type-check the test files (BACKLOG)

**Goal:** [Captured for future planning] Both package tsconfigs carry `exclude: ["./src/**/*.test.ts"]`, so ~3,538 lines of test code are never type-checked — real signal debt found during Phase 1 research. Deliberately kept out of Phase 1: it is a distinct change with its own error surface, and folding it in would blur what "Phase 1 green" means. Related: adopting Vitest 5 once stable ships, which obsoletes the `vitest.setup.ts` storage shim.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.11: Repo-wide Prettier sweep (BACKLOG)

**Goal:** [Captured for future planning] Measured during Phase 1 planning: 46 files under `packages/**/src` are not Prettier-clean, including `packages/backend/src/index.ts`, `provider-launch.ts`, `command-resolution.ts`, `packages/frontend/src/index.ts` and `MessageBubble.vue`. Running `pnpm format` repo-wide rewrites the bodies of `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote` and the `chmod` call sites — the exact code the Phase 5-8 scope fence (see Overview, "Phase 2 boundary constraint") holds byte-stable — so it was deliberately kept out of Phase 1, which only `--check`s the five files it creates or formats. This is its own change with its own commit and a large, purely-whitespace diff; sequence it **after** Phase 8 so it cannot collide with the spawn-path rewrite. Pair it with a `prettier --check` step in CI once the tree is clean.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
