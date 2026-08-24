# Roadmap: Drift — Hardening + Native Windows Milestone

## Overview

This milestone has two layers. **Phases 1–2 are a pre-port hardening layer** added 2026-08-12 after a full-codebase review: the test suite is red on Node ≥ 25, `pnpm lint` has never run, and a handful of correctness and security defects ship today on macOS/Linux. Entering a platform port with an untrustworthy CI signal makes every `windows-latest` failure ambiguous, so the signal gets restored first and the POSIX-side defects get fixed before the port starts rewriting the same code paths.

**Phases 3–10 are the original brownfield platform port**, not new-feature work: Drift already ships on macOS/Linux, and the entire MCP launch path in `packages/backend/src/index.ts` is POSIX-only. The journey takes the launch path from "`chmod` + `#!/bin/bash` + `.sh` spawn" to "direct `node.exe` spawn + structured `env` injection," extends command/binary resolution to Windows, hardens process lifecycle, and locks everything behind a permanent `windows-latest` CI net.

Two things shape the port's order. First, Caido's LLRT/QuickJS runtime behavior on Windows is unverified, so **Phase 3 is a CI spike** that proves the seven load-bearing primitives before any production code is built on them. Second, the **blocking must-have is Claude on Windows end-to-end (PRV-01)** — its critical path is **Phases 3 → 4 → 5 → 6 + the provider-spawn slice of Phase 7**. Phases 8–10 unlock the remaining three CLIs' lifecycle hardening, the permanent CI gate, and first-class Windows install polish.

**Phases 11-13 are a third layer**, added 2026-08-21: the **Plugin Bridge**. Drift's ~18 tools all wrap *core* Caido capabilities; none reach the plugins the user has installed, which is where most of the domain power in a real Caido setup lives. Neither the official `caido-mode` skill nor any community MCP reaches them either — all of them stop at listing. The bridge is sequenced last because it is feature work and the Windows port is the blocking must-have, but it depends only on Phase 4's spawn-env contract and can be pulled forward if the port stalls. Its evidence base is `.planning/research/PLUGIN-BRIDGE.md`, which measures 305 callable plugin functions across 22 backends on the maintainer's own installation.

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
- [x] **Phase 4: Platform Foundation** - Pure `platform.ts`, `os.tmpdir()` everywhere, AV-retry, fail-loud runtime probe, bounded buffers (completed 2026-08-20)
- [x] **Phase 5: Kill Shell Wrappers** - Direct `node` spawn + `env` injection; the headline bug fix; health check green on Windows (completed 2026-08-20)
- [x] **Phase 6: Windows Command Resolution** - `where`/`PATHEXT`/install-location discovery of `node.exe` and provider CLIs (completed 2026-08-21)
- [ ] **Phase 7: Provider Spawn & Registration** - Claude end-to-end (MVP) + safe `.cmd` spawning + Gemini/Codex/Copilot registration and approval channel
- [ ] **Phase 8: Process Lifecycle** - Process-tree death on Windows *and* POSIX so cancel/timeout leaves no token-bearing orphan
- [ ] **Phase 9: CI Hardening** - Required `windows-latest` job green for the right reasons (`.gitattributes`, `\r?\n`-safe snapshots)
- [ ] **Phase 10: Windows Polish** - Install/prereqs docs, not-on-PATH detection, Windows-aware diagnostics, `windowsHide`
- [ ] **Phase 11: Plugin Capability Discovery** - Turn installed plugins into a machine-readable capability catalogue (spec package -> bundle extraction -> names-only)
- [ ] **Phase 12: Plugin Call Bridge** - `plugin_call` with the injected-`sdk` offset handled and the blast radius bounded by the existing safety machinery
- [ ] **Phase 13: Plugin Events & Bridge Validation** - `plugin_events` subscription plus end-to-end proof against spec-backed *and* spec-less plugins

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
**Requirements**: RUN-03, RUN-05, CMP-02, PERF-02, PERF-03, PERF-04
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

- [x] 04-11-PLAN.md — Phase gates (no hardcoded `/tmp`, probe ordering, SC-9 cross-check, D-04 survival, `pnpm build`, CMP-01 tripwire) + the blocking human read of the RUN-05 failure message

**Research flag**: NO — well-documented Node/Windows APIs; Phase 3 confirms the LLRT surface (see its Results table). `04-RESEARCH.md` (2026-08-14) went further and read Caido's own LLRT fork source, which overturned three planning assumptions: `realpath` is **absent** from `caido/dependency-llrt@main`'s `fs` module, so SC-10's ladder always lands on `path.resolve` under Caido (ship the shape, report the rung); LLRT's `os.tmpdir()` can return a **trailing backslash** where Node strips it, so every temp path uses `path.join`; and LLRT's `FileHandle.read` panics unless the buffer is sized exactly to the read length, which is unobservable on Node.

**Planning note**: the provisional "2 plans" estimate is superseded. `04-RESEARCH.md` § *Validation Architecture* is the reason: six of the seven requirements land in `index.ts`, which is 3,004 lines with **zero** direct test coverage, and the maintainer cannot test native Windows locally. Splitting each behaviour into a pure module with an injected `platform` moves 33 of 37 criteria into the Linux-provable bucket — ~94% of the phase — versus leaving them unverifiable by construction. The extra plans are what buy that ratio.

### Phase 5: Kill Shell Wrappers

**Goal**: Replace the POSIX shell-wrapper launch indirection with a single direct-`node`-spawn keystone so the MCP self-test and health check pass on Windows for the Claude path — the direct fix for the reported bug — with zero POSIX regressions.
**Depends on**: Phase 4 (can proceed in parallel with Phase 6)
**Requirements**: RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01, **CI-01**, **CI-03** *(the last two pulled forward from Phase 9 by 05-CONTEXT.md D-07/D-09; re-targeted in REQUIREMENTS.md by plan 05-02)*
**Success Criteria** (what must be TRUE):

  1. The MCP server launches via a single `buildMcpServerSpec()` → spec-to-spawn path that runs `node` directly with `env`. `writeLaunchScript`, the self-test launcher (`mcp-self-test-<id>.sh`), the Claude session wrapper (`mcp-wrapper-<sessionId>.sh`) and the provider launch script (`provider-launch-<sessionId>.sh`) are deleted from the codebase, together with **one** of the two `spawnAndWait("chmod", …)` spawns. `renderExportExecScript`, `shellQuote`, `writeMcpWrapper` and the remaining `chmod` spawn **survive** on darwin and linux for Gemini and Codex only, behind a platform guard, each headed by a literal `DELETED IN PHASE 7 (PRV-03)` notice — see Phase 7 SC-7, which owns their deletion. *(**Amended 2026-08-20** by plan 05-05 task 3, per 05-CONTEXT.md **D-01/D-02**. The original wording claimed `renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, every `chmod` call and every `.sh` file were deleted. Deleting the survivors now — before Phase 7 lands `--env`/`-e` registration for Gemini and Codex — would be a live CMP-01 regression for two shipping providers on the platforms the entire user base runs today, because the wrapper's `export` lines are their sole carrier of `CAIDO_URL`/`CAIDO_TOKEN`/`DRIFT_*`. Note also that the whole-file `chmod` count stays deliberately **non-zero**: `enforceOwnerOnlyDir`'s `fs/promises` namespace call is a POSIX security control, not a shell spawn, and is out of scope.)*
  2. On `windows-latest` CI, `validateCaidoAuth` (HLT-01) and the MCP self-test of `tools/list`, `get_environment`, `search_history` (HLT-02) pass for the Claude `node`/`mjs` path.
  3. On every **Drift-owned** MCP launch — the self-test, the health check, and the Claude and Copilot config documents — the Caido token and `DRIFT_*` vars reach the MCP server via the spawn `env` option / config-JSON `env` field, with no shell `export` wrapper, verified by the integration spawn test. *(**Amended 2026-08-20** by the phase-5 verifier. The original wording said "only via", which is false for the **Gemini/Codex** path that SC-1 deliberately keeps: their `mcp add` registration still points at the surviving POSIX `mcp-wrapper.sh`, whose `export` lines remain their sole env carrier until Phase 7 SC-7 lands `--env`/`-e`. The claim is true of every path this phase converted; it was never true of the one it deliberately did not.)*
  4. macOS/Linux behaviour is preserved and the existing `provider-launch` exact-`toEqual` tests stay green (CMP-01). *(**Amended 2026-08-20** by the phase-5 verifier. The original wording said "unchanged behind `os.platform()` guards", which mis-describes what shipped in two ways. First, per **D-04** the provider launch was converted to a direct spawn on **all** platforms with **no** platform guard — deliberately, because a win32-only arm would be code no CI could reach. Second, "unchanged" is true of the argv arrays, which the tripwire proves byte-identical, but the **env delivery mechanism did change** on POSIX: from the launch script's `export` lines to the spawn `env` option. That half is in `index.ts`, which no test imports, so it is covered by manual UAT rather than by the tripwire — see `05-VERIFICATION.md`.)*

**Results — what this phase does NOT claim** (recorded 2026-08-20 by plan 05-05, in the voice of Phase 3's Results table, so the claim boundary is on the roadmap and not only in a plan summary):

| Claimed here | Not claimed here | Where it closes |
|---|---|---|
| The MCP **health check** on the Claude path — `validateCaidoAuth` and the three self-test methods — through a direct `node` spawn with `env` | A real **Claude CLI** connecting to the Drift MCP server end-to-end on Windows | Phase 7, **PRV-01** |
| The launch **shape**: no `.sh`, no `chmod`, no `#!/bin/bash` on any Windows-reachable path, proven by static gates and a `windows-latest` build+vitest leg | That any of it works under the **real Caido LLRT runtime** — unverified in either direction; CI spawns through Node, where libuv back-fills environment names LLRT does not | Phase 9/10, on a real Windows Caido install, with the original reporter's confirmation |
| macOS/Linux behaviour preserved, existing suite green | Gemini/Codex on Windows — registration is **skipped** there with a stated reason | Phase 7, **PRV-03** |

**Plans**: 6/6 plans complete (4 waves)
Plans:
**Wave 1** *(three independent slices — no shared files, fully parallel)*

- [x] 05-01-PLAN.md — TRACER: pure `mcp-server-spec.ts` (`buildMcpServerSpec`, `buildMcpDriftVars`, `toMcpConfigDocument`, `planMcpCliRegistration`, `formatSpawnDebugLine`, `findExpandableEnvKeys`) + unit suite + the D-08 integration spawn test proving `--validate-auth` and the three self-test methods through the PRODUCTION builder against the real `assets/mcp-server.mjs`
- [x] 05-02-PLAN.md — CI-01/CI-03: reduce `build` to `caido-dev build` (measured byte-parity first), land `.gitattributes`, author the blocking `windows-latest` job with the carried-forward three-arm no-secret-material gate, re-target CI-01/CI-03 in REQUIREMENTS.md. Authors the leg; 05-06 runs it
- [x] 05-03-PLAN.md — D-05's reported, non-gating parent-environment metric in `runtime-probe.ts`: PATH entry count and env key count as integers, with `not probed` and `absent` distinguishable by construction

**Wave 2** *(blocked on 05-01 and 05-03)*

- [x] 05-04-PLAN.md — `index.ts` health path: `requireMcpServerSpec`, `spawnAndWait`'s optional env, spec-taking `validateCaidoAuth`/`callMcpMethod`, **all three** `writeMcpWrapper` sites and **both** `validateCaidoAuth` sites (incl. `refreshActiveMcpRuntime`, the one CONTEXT.md missed), both config writers on one projection, the `${}`-expansion guard, and the win32 registration skip stated in-product and in the README

**Wave 3** *(blocked on 05-04 — same file)*

- [x] 05-05-PLAN.md — `index.ts` provider slice: D-04's direct spawn on all platforms, the `launchCommand`/`launchArgs`/`finalize()` cleanup deleted AS ONE SET, `writeLaunchScript` gone, `withFsRetry` around `writeTemp` (RUN-04 structurally), three literal `DELETED IN PHASE 7 (PRV-03)` notices, and the SC-1 amendment + new Phase 7 criterion in this roadmap

**Wave 4** *(blocked on 05-02 and 05-05)*

- [x] 05-06-PLAN.md — Phase gates executed with raw output, the real `windows-latest` run recorded with its URL/per-step conclusions/log lines, `timeout-minutes` set from the measurement, 05-VALIDATION.md reconciled (V-5's published gate is vacuous), `05-REPORT.md` leading with the non-claims, and a blocking human read of the ceiling + the V-21 code review

**Research flag**: NO — design fully specified in `research/ARCHITECTURE.md`; `05-RESEARCH.md` (2026-08-20) went further and read `caido/dependency-llrt@main` and `rust-lang/rust` source directly. Three findings changed the plan: (1) Rust's Windows `make_envp` writes the supplied map **verbatim** with no libuv-style back-fill of the eleven `required_vars`, so a regression to a drift-only `env` dict is **green on every runner this project has** and broken only under the real Caido runtime — the control is a vehicle-independent static gate, not the integration test; (2) `pnpm build` **cannot run on `windows-latest`** today (the script chains `cp`/`rm`/`cd`/`zip` under `cmd.exe`, and `zip` is absent from the runner image) and the fix is a measured **deletion** — `caido-dev build` alone already emits an identical zip; (3) `index.ts` has a **third** `writeMcpWrapper` → `validateCaidoAuth` pair in `refreshActiveMcpRuntime` (`:1541`), reached from settings save and token sync, that CONTEXT.md's site list does not name — converting only the two named sites means the first token refresh on Windows tears down a working MCP runtime.

**Planning note**: the provisional "2 plans" estimate is superseded. The discussion added a CI leg (D-07), a `.gitattributes`/CI-03 slice (D-09), a pure-module extraction (D-06) and an integration spawn test (D-08); research then added the `build`-script blocker and the third orchestration site. The split is driven by one constraint: `index.ts` is 4,003 lines with zero direct test coverage and cannot be imported under vitest, so anything left inside it is bucket **N** by construction. Waves 2 and 3 are sequential only because they share that file, and the D-04 change set inside wave 3 is deliberately one task and one commit — `noUnusedLocals` plus `--max-warnings 0` turn a half-done deletion set into a build failure, which is the enforcement mechanism.

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

**Plans**: 7 plans

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Substrate: `joinPath`, `getWindowsNamedRoots`, the pure/impure candidate-builder split (D-05/D-10), wired end to end by a tracer, plus both CMP-01 byte-identity proofs *(wave 1)*

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — The sourced Windows install-location catalogue, the bounded version-manager walks, and the node-specific rows (D-09/D-11/D-12) *(wave 2)*
- [x] 06-03-PLAN.md — `rankPathSearchHits`, `getWhichCommand` by absolute path, `getHomeDirCandidates` union (D-01/D-02/D-08) *(wave 2)*

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-04-PLAN.md — Windows home-dir recognition, the win32 dedup fold, and the recorded non-claims (D-06/D-07) *(wave 3)*

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-05-PLAN.md — Wire the PATH search at the `resolveCommand` seam: binary, multi-line parse, ranking, platform-aware timeout (D-01–D-04, D-08) *(wave 4)*

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-06-PLAN.md — The shared install-command table, the platform-armed hint renderer, the Copilot correction, the Node error's Windows arm (D-13–D-16) *(wave 5)*

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 06-07-PLAN.md — The help panel renders from the shared table, readme prose accuracy, and the phase evidence gate (D-15) *(wave 6)*

**Research flag**: NO for Windows install paths (build-time note: re-verify the Volta/fnm/nvm-windows candidate list against current installer docs). **Done — 06-RESEARCH.md § *Windows Install-Location Catalogue* verified every row against the installer's own source and CORRECTED three of SC-1's paths: nvm-windows lives under `%LOCALAPPDATA%\nvm` (not `%APPDATA%`), its symlink is `C:\nvm4w\nodejs` (not `%ProgramFiles%\nodejs`, which survives as the Node MSI row), and fnm's modern base is `%APPDATA%\fnm` (not `%LOCALAPPDATA%`). Those corrections supersede the SC-1 list above, per D-09's own deferral to D-12's deliverable.**

### Phase 7: Provider Spawn & Registration

**Goal**: Complete the Claude end-to-end critical path (the blocking must-have) and bring up the remaining three CLIs — spawning `.cmd` shims safely, registering external CLIs with token hygiene, and closing the Gemini/Codex approval gap.
**Depends on**: Phase 5, Phase 6
**Requirements**: PRV-01, PRV-02, PRV-03, PRV-04, PRV-05, UX-01
**Success Criteria** (what must be TRUE):

  1. On Windows, a user can run a Claude Code chat end-to-end with the Drift MCP attached — the blocking must-have (PRV-01), exercised via the Windows CI spawn path and confirmed on the reporter's machine where possible.
  2. Provider `.cmd` shims spawn via `cmd.exe` with `["/d", "/s", "/c", '"' + escapedCommand + " " + escapedArgs.join(" ") + '"']` and **`windowsVerbatimArguments: true`**, with `shell:false` (or the underlying `node.exe` entry directly); `shell:true` with dynamic args appears nowhere in the spawn path. *(Amended 2026-08-21 during Phase 7 planning, per `07-RESEARCH.md` Q3 — the original wording named a plain argv array, which is **not sufficient**: both Node/libuv and Caido's LLRT apply MSVC-convention quoting per element and `cmd.exe` then re-parses the result under its own different rules, so the arguments arrive corrupted. `windowsVerbatimArguments: true` plus explicit `^`-escaping of the cmd metacharacter set is the vetted contract; the option is source-verified as honoured in Caido's LLRT fork (`command.raw_arg(…)`) and declared in the `@caido/quickjs-types` `SpawnOptions` this repo vendors. Same amend-in-place precedent as Phase 5 SC-1 per 05-CONTEXT.md D-02.)*
  3. Gemini and Codex registration passes `node.exe` + args + `env` via `-e`/`--env` with token hygiene (`${CAIDO_TOKEN}` reference, or `DRIFT_TOKEN_FILE` indirection for Codex), and `mcp remove` is guaranteed to run on cleanup (a failed remove is logged, not dropped).
  4. Gemini and Codex either get a per-session approval/activity channel like Claude and Copilot, or their sensitive tools are disabled and that limitation is stated in-product and in the README (PRV-05). Today they are registered against the shared wrapper with no `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE`, so every sensitive tool fails closed with an unexplained error and no MCP activity trace ever reaches the chat.
  5. Gemini, Codex, and Copilot are usable on Windows on a best-effort basis, with Gemini's status gated on a real-machine confirmation checkpoint.
  6. The provider binary-path picker accepts `.exe`/`.cmd` paths.
  7. Once Gemini and Codex register with `node` + args + `env` (SC-3 above), the shared POSIX wrapper and the functions that render it are **deleted**: `renderExportExecScript`, `shellQuote` and `writeMcpWrapper` no longer exist in `packages/backend/src/index.ts`, `getMcpWrapperPath` goes with them, the **last** `spawnAndWait("chmod", …)` spawn is gone, and `mcp-wrapper.sh` is written by no code path on any platform. Checkable: `grep -c` for each of those four symbols returns 0, the comment-stripped `.sh` count in `index.ts` reaches 0, and the repository-wide count of `DELETED IN PHASE 7 (PRV-03)` notices drops from 3 to 0 (the `DELETED IN PHASE 9` probe-workflow header is Phase 9's and is untouched). `enforceOwnerOnlyDir`'s `fs/promises` namespace `chmod` is explicitly **out of scope** and must remain. *(Added 2026-08-20 by plan 05-05 task 3, per 05-CONTEXT.md **D-01/D-02** — the structural owner for the survivors Phase 5 SC-1 no longer claims. Phase 7 must also `mcp remove` any stale `drift` entry a Phase-≤5 Drift left pointing at a deleted `.sh`.)*

**Plans**: 5 plans

Plans:

- [ ] 07-01-PLAN.md — Tracer: launch a Windows `.cmd` provider shim end-to-end through a new pure `buildSpawnPlan`, and measure the escaping on a real `windows-latest` run (PRV-01, PRV-02, UX-01)
- [ ] 07-02-PLAN.md — Promote `ProviderStatus` to a capability level, add the per-CLI approval-channel table, and state the limitation on the provider card (PRV-04, PRV-05, UX-01)
- [ ] 07-03-PLAN.md — Register Gemini/Codex with `node` + args + `env` on every platform, and delete the POSIX wrapper in the same commit (SC-7) (PRV-03, PRV-04, PRV-05)
- [ ] 07-04-PLAN.md — Guaranteed `mcp remove`: unconditional dual-scope startup sweep plus a value-free security log line (PRV-03, PRV-04)
- [ ] 07-05-PLAN.md — Phase close: README rows, validation contract, the recorded Windows run and its vehicle caveat (PRV-01, PRV-04, PRV-05)

**Research flag**: RESOLVED 2026-08-21 by `07-RESEARCH.md`. Gemini: no open Windows-MCP issue was found by title/query search (bodies not read — weak evidence, so SC-5's real-machine checkpoint is KEPT, in Phase 9/10). Codex `${VAR}` expansion **does not exist at all** — source-verified; the reference text would be delivered verbatim as the token, so it is definitively off the table. `DRIFT_TOKEN_FILE` is recommended against for this phase and the resulting token-at-rest trade is escalated to a blocking `checkpoint:decision` in plan 07-03.

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

**Plans**: 2/5 plans executed

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — Wave-0 spike: close assumptions A1 (does the shipped Caido LLRT honour `detached`?) and A6 (is the CLI's MCP child in the CLI's process group?) on real hardware, then delete the probe (LIF-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-02-PLAN.md — Tracer: a POSIX cancel takes the token-bearing grandchild with it — `kill-plan.ts`, `killTree`, `detached` at the provider spawn, and the behavioural proof with its falsifying control (LIF-01, LIF-02)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 08-03-PLAN.md — Expand to every in-scope kill site and close SC-4: kill-before-sweep at `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`, with a positional source gate (LIF-01, LIF-02)
- [ ] 08-04-PLAN.md — Windows evidence: the win32-gated integration suite, the recorded `taskkill` exit code, and a `--reporter=json` CI gate with anchors distinct from Phase 7's (LIF-01)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 08-05-PLAN.md — Phase close: amend SC-2 in place, the sixth pure-helper row, the validation task-ID fill with its seed corrections, `08-SECURITY.md`, and the real-hardware confirmation (LIF-01, LIF-02)

**Research flag**: RESOLVED 2026-08-24 by `08-RESEARCH.md`. The primitives are indeed standard; the **mechanism** was not. `detached: true` is source-verified honoured by Caido's LLRT fork (`command.process_group(0)`), but the canonical group-signalling spelling `process.kill(-pid, sig)` **throws** there — LLRT types `pid` as `u32` and rquickjs range-checks through `f64`, raising `Underflow` before `libc::kill` is reached — while working perfectly under Node, the only vehicle any CI leg in this repository runs. SC-2 is amended in place by plan 08-05 accordingly (see the criterion's own note).

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
  5. **PRV-01 is confirmed by a real Claude Code turn on a real Windows desktop** — a human starts a chat, the Drift MCP attaches, and a Drift tool returns live Caido data. Not CI: a CI job proves the *spawn contract*, and `packages/backend/src/index.ts` cannot be imported under vitest, so no automated leg in this milestone reaches the wiring or the LLRT runtime the code ships into. Where the original reporter (@0xMRK0S, reported 2026-06-24) is unavailable, any Windows user's confirmation satisfies this; what does **not** satisfy it is another green CI run. *(Added 2026-08-24 at Phase 7 close, per `07-VERIFICATION.md` § roadmap_gaps. Phase 7 held SC-1 at PARTIAL for exactly this reason and its artifacts deferred the confirmation to "Phase 9/10" — which named it nowhere, so the milestone could have completed with the blocking must-have never confirmed by anyone on real hardware.)*
  6. **Gemini's Windows status is resolved by a real-machine check** and its best-effort label either lifted or restated with the measured reason. Phase 7 SC-5 gated Gemini's status on this check and it has not happened; upstream Windows MCP reliability issues remain unresolved, so the outcome may legitimately be "still best-effort" — but recorded as a measurement rather than an assumption. *(Added 2026-08-24 at Phase 7 close, same source as SC-5 above.)*

**Plans**: 1 plan (provisional)
**Research flag**: NO — UX copy and file-system probes. SC-5 and SC-6 are human confirmations, not research; they depend on a third party and should be scheduled early enough in the phase that a slow reply does not block it.

### Phase 11: Plugin Capability Discovery

**Goal**: Turn the user's installed plugin set into a machine-readable capability catalogue — which packages ship a backend, what RPC functions each registers, and with what arity — without a hand-maintained registry and without guessing.
**Depends on**: Phase 4 (the `{ ...process.env, ...driftVars }` spawn-env contract from SC-9, which PBR-03 rides on). Sequenced after Phase 10 by roadmap position, **not** by a technical dependency on Phases 5-10 — it may be pulled forward if the port stalls.
**Requirements**: PBR-01, PBR-02, PBR-03, PBR-08
**Success Criteria** (what must be TRUE):

  1. The plugins root is derived as `path.dirname(sdk.meta.path())` — no hardcoded path, no platform branch — and reaches the MCP process through the existing spawn `env` block. It is **never** re-derived inside `mcp-server.mjs`, which has no `sdk`.
  2. A discovery module enumerates installed packages via the `pluginPackages` query and, for each backend plugin, produces its registered function list.
  3. The extractor matches the **receiver**, not the method name: only `sdk.api.register` yields callable functions. A fixture containing `sdk.commands.register` yields zero. In the 2026-08-21 sample, 14 of 69 installed plugins registered only command-palette entries, and a name-only grep would have offered them as callable.
  4. Two-pass extraction (`api.register("name", handlerIdent)` then `function handlerIdent(params)`) resolves parameter names for at least 95% of discovered functions. Measured baseline on the maintainer's 69-plugin installation: 303 of 305 (99%).
  5. When `@caido-community/<manifestId>` is installed, its `Spec` is preferred over extraction; both sources normalise to one internal shape, so downstream code cannot tell which path produced an entry.
  6. A function whose signature cannot be resolved is emitted as **unknown-arity**, never guessed (PBR-08).
  7. Results are cached and invalidated on plugin version change — reuse `resolution-cache.ts` rather than adding a second cache.

**Plans**: 3 plans (provisional)
**Research flag**: PARTIAL — the mechanism is already measured (`.planning/research/PLUGIN-BRIDGE.md`). The open question is whether regex extraction is trustworthy enough or a real JS parser is required. Resolve during planning, not execution.

### Phase 12: Plugin Call Bridge

**Goal**: Make the catalogue actionable — one `plugin_call` tool that can invoke any discovered backend function, with the argument offset handled correctly and the blast radius bounded by Drift's existing tool-safety machinery.
**Depends on**: Phase 11
**Requirements**: PBR-04, PBR-05
**Success Criteria** (what must be TRUE):

  1. `plugin_call` invokes through `callFunction({ name, arguments })`, and a test asserts the Caido-injected `sdk` first parameter is **dropped**: `apiGetProviders(_sdk)` is called with zero arguments, `createSession(_sdk, providerId)` with exactly one. Getting this wrong offsets every argument by one and is the single most likely silent defect in the phase.
  2. The bridge adds a **bounded** number of MCP tools (3), not one tool per discovered function. The 305-function catalogue is *data* returned by `plugin_capabilities`; exposing it as tools would swamp every provider's context window.
  3. Failure modes are distinguished for the agent: `PluginFunctionCallError` (transport, unregistered name, backend threw) versus a plugin's own `Result`-shaped functional failure. `{ kind: "Error" }` is a `quickssrf` convention, **not** an SDK contract, and must not be hard-coded as the error shape.
  4. Discovery is free; invocation is opt-in per plugin. A newly installed plugin is discoverable but not callable until the user enables it.
  5. Mutating-looking actions route through the existing sensitive-action confirmation flow. The measured corpus contains `deleteSession`, `deleteNote`, `clearScans`, `clearAllTemplates` and `stopAgent`.
  6. Multi-backend packages are disambiguated by passing `manifestId` to `callFunction`.
  7. `plugin_call` never presents an inferred argument schema as a validated one — PBR-08 enforced at the tool boundary, not only in discovery.

**Plans**: 2 plans (provisional)
**Research flag**: NO — the SDK surface and wire format are documented and verified.

### Phase 13: Plugin Events and Bridge Validation

**Goal**: Close the loop with event subscription, then prove the whole bridge against real plugins — both the three that publish a spec package and at least two that do not.
**Depends on**: Phase 12
**Requirements**: PBR-06, PBR-07
**Success Criteria** (what must be TRUE):

  1. `plugin_events` subscribes via `subscribeEvent` / `createdPluginEvent`, buffered through the Phase 4 `bounded-buffer.ts` caps rather than an unbounded accumulator.
  2. Subscriptions die with the chat session — none outlives the turn that created it, matching the Phase 8 lifecycle discipline for spawned processes.
  3. End-to-end invocation is proven against the three spec-backed plugins: **Scanner**, **QuickSSRF** and **Autorize**.
  4. End-to-end invocation is proven against **at least two plugins with no spec package**, driven purely by extracted signatures. This is the criterion that decides whether extraction is real or wishful.
  5. The existing MCP self-test / health check covers the bridge: tool discovery plus one live `plugin_capabilities` call.
  6. Help tab and README state plainly what the bridge can and cannot know — names and arity, **not** types or semantics — so the limitation is the user's to reason about rather than a surprise.

**Stopping rule**: if criteria 3 and 4 cannot both be met, the bridge ships **discovery-only** (`plugin_capabilities`) and `plugin_call` / `plugin_events` are cut rather than shipped unreliable. A bridge that invokes third-party code with guessed arguments is worse than no bridge.

**Plans**: 2 plans (provisional)
**Research flag**: NO — validation against live plugins, not investigation.

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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13.
Parallelism opportunities: Phase 2 may run alongside Phase 3 (both depend only on Phase 1); Phase 6 may run alongside Phase 5 (both depend only on Phase 4); Phase 9 CI setup may begin alongside Phase 7; Phases 11-13 (Plugin Bridge) depend only on Phase 4 and may be pulled forward if the port stalls.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Restore the Verification Signal | 6/6 | Complete    | 2026-08-13 |
| 2. POSIX Correctness & Hardening | 0/3 | Not started | - |
| 3. CI Spike — Prove LLRT Basics on Windows | 5/5 | Complete    | 2026-08-14 |
| 4. Platform Foundation | 11/11 | Complete    | 2026-08-20 |
| 5. Kill Shell Wrappers | 6/6 | Complete   | 2026-08-20 |
| 6. Windows Command Resolution | 7/7 | Complete    | 2026-08-21 |
| 7. Provider Spawn & Registration | 0/3 | Not started | - |
| 8. Process Lifecycle | 2/5 | In Progress|  |
| 9. CI Hardening | 0/1 | Not started | - |
| 10. Windows Polish | 0/1 | Not started | - |
| 11. Plugin Capability Discovery | 0/3 | Not started | - |
| 12. Plugin Call Bridge | 0/2 | Not started | - |
| 13. Plugin Events & Bridge Validation | 0/2 | Not started | - |

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
