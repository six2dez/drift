---
phase: 5
slug: kill-shell-wrappers
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-20
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` § *Validation Architecture*. Read that section for the
> full rationale behind every bucket assignment — this file is the contract, that section
> is the argument.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root; `setupFiles: ["./vitest.setup.ts"]`) |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts packages/backend/src/platform.test.ts packages/backend/src/provider-launch.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Static gates** | `pnpm -r typecheck` and `pnpm lint` (`--max-warnings 0`, never `--fix`) |
| **Estimated runtime** | Quick: sub-second. Full suite: **measured baseline 263 tests / 29 files / 0 failures / 779 ms** |
| **New in this phase** | A `windows-latest` leg of `ci.yml` running the same commands plus `pnpm build` (D-07) |

---

## The constraint this strategy is designed around

Two facts, both load-bearing:

1. **The maintainer cannot test native Windows locally** (PROJECT.md § *Constraints*).
   **D-07 changes this**: Phase 5 pulls CI-01 forward, so this is the **first** phase with a
   Windows runner. Criteria that were "unreachable" in Phase 4 become "reachable, on CI".
2. **`index.ts` is 4,003 lines with zero direct test coverage.** No test file imports it and
   `vitest.config.ts` declares no `caido:plugin` alias (re-verified during research). SC-2 names
   `validateCaidoAuth` (`index.ts:1209`) and the self-test, both of which live there. **Anything
   left inline in `index.ts` is bucket N by construction** — D-06 (pure spec module) exists to
   keep that bucket small and D-08 exists to state the remainder honestly.

| Bucket | Meaning | Count |
|---|---|---|
| **L** | Provable on the existing Linux/macOS runner, because inputs are injected | **15** |
| **W** | Needs the `windows-latest` runner — **which this phase lands** | **4** |
| **N** | Not provable in CI on any runner available to this project | **5** |

**15/24 = 63 % provable on hardware the maintainer has; 19/24 = 79 % once D-07's leg lands.**
Phase 4 scored 33 L / 2 W / 2 N.

**The worse ratio is the honest reading, not a regression in rigour.** Phase 4 was *building*
pure modules, so nearly everything it produced was injectable by construction. Phase 5 is
*rewiring an orchestrator that cannot be imported*. Three of the five N rows (V-21, V-22, V-23)
are one underlying gap seen from three angles: the thing being changed lives in `index.ts`, and
the runtime it must work on cannot be executed by any test this project can run.

---

## Per-Requirement Verification Map

Task IDs are filled in by `/gsd-plan-phase`'s planner output; the rows below are the contract
each task must map onto.

| # | Req | Behavior | Bucket | Test Type | Automated Command | File Exists | Status |
|---|-----|----------|--------|-----------|-------------------|-------------|--------|
| V-1 | RUN-01 | `buildMcpServerSpec` returns `{command: node, args: [mjs], env}` from injected inputs | L | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts -t "buildMcpServerSpec"` | ❌ W0 | ⬜ pending |
| V-2 | RUN-02 | The spec's `env` is the parent block merged with `driftVars` — a parent-only key survives, a drift key overrides | L | unit | `… -t "merges the parent environment"` | ❌ W0 | ⬜ pending |
| V-3 | RUN-02 | The spec's env carries `CAIDO_URL`, `CAIDO_TOKEN` and every `DRIFT_*` key `mcp-server.mjs:12-38` reads — **including `DRIFT_ALLOWLIST_ACTIVE`** | L | unit | `… -t "carries every DRIFT_ key"` | ❌ W0 | ⬜ pending |
| V-4 | RUN-01/02 | Claude's and Copilot's config documents are the **same projection** of one spec | L | unit | `… -t "one spec, two callers"` | ❌ W0 | ⬜ pending |
| V-5 | RUN-01 | `writeLaunchScript`, `mcp-self-test-*.sh`, `mcp-wrapper-<sid>.sh`, `provider-launch-<sid>.sh` are gone; exactly **2** `.sh` literals survive | L | static | `test "$(grep -c '\.sh"' packages/backend/src/index.ts)" -eq 2` | ❌ W0 | ⬜ pending |
| V-6 | RUN-01 | Exactly **one** `spawnAndWait("chmod"` survives; `enforceOwnerOnlyDir`'s namespace `chmod` untouched | L | static | `test "$(grep -c 'spawnAndWait("chmod"' …)" -eq 1` + blob-identity check on `:660-690` | ❌ W0 | ⬜ pending |
| V-7 | RUN-01 | **All three** `writeMcpWrapper` sites and **both** `validateCaidoAuth` sites accounted for | L | static | `grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(" …` vs expected line set | ❌ W0 | ⬜ pending |
| V-8 | CMP-01 (D-01/D-02) | `planMcpCliRegistration({platform:"win32"})` returns `Skip` — wrapper path unreachable on win32 | L | unit | `… -t "unreachable on win32"` | ❌ W0 | ⬜ pending |
| V-9 | CMP-01 (D-03) | The win32 skip reason names the provider **and** Phase 7, verbatim | L | unit | `… -t "skip reason names Phase 7"` | ❌ W0 | ⬜ pending |
| V-10 | RUN-02 (D-11) | The spawn debug line contains injected env **key names** and never a value | L | unit | `… -t "never logs an env value"` | ❌ W0 | ⬜ pending |
| V-11 | CMP-01 | `provider-launch` argv arrays byte-identical — the CMP-01 tripwire | L | regression | `pnpm exec vitest run packages/backend/src/provider-launch.test.ts` — **must not be edited** | ✅ exists | ⬜ pending |
| V-12 | HLT-01 | The **production** spec spawns and `--validate-auth` returns `{ok:true}` against a local HTTP stub | L | integration | `pnpm exec vitest run packages/backend/src/mcp-server-spec.spawn.test.ts -t "validate-auth"` | ❌ W0 | ⬜ pending |
| V-13 | HLT-02 | `tools/list`, `get_environment`, `search_history` all succeed over the spawned spec | L | integration | `… -t "self-test methods"` | ❌ W0 | ⬜ pending |
| V-14 | CMP-01 | Existing suite stays green — the real regression net | L | regression | `pnpm exec vitest run` — 263 stay green, minus any test made obsolete by a deletion (**state each removal explicitly**) | ✅ exists | ⬜ pending |
| V-15 | CI-03 (D-09) | `.gitattributes` exists with `* text=auto eol=lf` | L | static | `grep -q 'eol=lf' .gitattributes` | ❌ W0 | ⬜ pending |
| V-16 | HLT-01 (SC-2) | **V-12 passes on `windows-latest`** | W | integration | the Windows leg's `Test` step | ❌ W0 (job) | ⬜ pending |
| V-17 | HLT-02 (SC-2) | **V-13 passes on `windows-latest`** | W | integration | same | ❌ W0 (job) | ⬜ pending |
| V-18 | CI-01 | `pnpm build` succeeds on `windows-latest` | W | build | the Windows leg's `Build` step — **requires 05-RESEARCH.md § Finding C-1** | ❌ W0 (job) | ⬜ pending |
| V-19 | CI-03 | The **whole** 263-test suite is green on `windows-latest`, for code reasons | W | regression | the Windows leg's `Test` step | ❌ W0 (job) | ⬜ pending |

---

## Manual-Only / Unverifiable (bucket N) — stated, not hidden

| # | Req | Behavior | Why not automatable | Mitigation |
|---|-----|----------|---------------------|------------|
| V-20 | RUN-04 | A **real** Defender lock is survived on real hardware | Not inducible in CI (`04-RESEARCH.md` verdict, unchanged) | RUN-04 is satisfied **structurally**: after the rewrite no write→exec pair remains on any Windows-reachable path. Plus `mcpFirstWriteAttempts` in `getDiagnostics` |
| V-21 | SC-2 | `index.ts`'s **wiring** of `buildMcpServerSpec`/`spawnNode` into the three orchestration sites | `index.ts` is not importable under vitest | D-08's caveat verbatim in the plan **and** the phase report; V-5/V-6/V-7 static gates; code review. **Deferred:** the `caido:plugin` alias (Phase 9) |
| V-22 | RUN-02 | The env contract **under LLRT**, where Rust's `make_envp` performs no libuv back-fill | The Node vehicle back-fills eleven names, so a bare-dict regression passes V-2, V-12 **and** V-16 | A vehicle-independent **static gate** asserting every `env`-supplying spawn spreads the parent block. This is the finding that most changes the plan |
| V-23 | RUN-01 | Behaviour under the real Caido LLRT runtime at all | No standalone LLRT Windows binary; headless Caido needs a paid plan | `03-FINDINGS.md` § *Vehicle caveat*, carried verbatim. Closes only in Phase 9/10 on a real Windows Caido install |
| V-24 | PRV-01 | A real Claude CLI reading `mcp-<chatId>.json` and connecting on Windows | **Out of scope — Phase 7** | Phase 5 claims the health check only. **Do not let V-12/V-16's green be reported as this.** |

> **One number the planner should watch.** If V-21's mitigation ends up being "code review", this
> phase has one criterion whose only evidence is a human reading a diff. That is acceptable *once*
> and only when stated as such — the same discipline Phase 4 applied to its RUN-05 legibility
> criterion, closed by a dated real human read recorded as a human read.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` — sub-second; no excuse to skip.
- **After every plan wave:** `pnpm -r typecheck && pnpm lint && pnpm exec vitest run` — all 263 plus both static gates. `noUnusedLocals` + `--max-warnings 0` turn a half-finished deletion set into a hard failure; that is a feature.
- **Before `/gsd-verify-work`:** the full CI matrix green — four `Verify (Node N)` legs **plus** the new `windows-latest` leg — with the static gates **executed, not inferred from diffs**.
- **Max feedback latency:** < 1 s local; one CI round-trip for the W bucket.
- **Evidence discipline (Phase 3 D-11/D-12/D-13):** every CI claim carries its run URL and the log line proving the mechanism, written **after** reading the real run, never pre-filled.

---

## Wave 0 Requirements

- [ ] `packages/backend/src/mcp-server-spec.ts` + `mcp-server-spec.test.ts` — covers V-1…V-4, V-8…V-10
- [ ] `packages/backend/src/mcp-server-spec.spawn.test.ts` — covers V-12, V-13 (and V-16, V-17 on the Windows leg). Template: `mcp-server.transport.test.ts:124-190`
- [ ] `.gitattributes` (`* text=auto eol=lf`) — covers V-15
- [ ] `.github/workflows/ci.yml` `windows-latest` job — covers V-16…V-19. **Blocked on 05-RESEARCH.md § Finding C-1** (the `build` script) for V-18
- [ ] The static-gate script/target holding V-5, V-6, V-7 and the V-22 parent-spread gate — **executed** at the phase gate, not asserted in prose
- [ ] `runtime-probe.ts` extension for D-05's reported `PATH`-entry-count / env-key-count metric (non-gating, per Phase 4 D-06)
- [ ] Framework install: **none needed** — vitest 4.0.18 present and configured
- [ ] Shared fixtures: **none needed** — the local-HTTP-stub + `mkdtemp` + `afterEach` pattern already exists in `mcp-server.transport.test.ts:20-22,43-88`

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 1 s locally
- [ ] Every bucket-N row above appears in the phase report as an explicit non-claim
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
