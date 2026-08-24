---
phase: 8
slug: process-lifecycle
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `08-RESEARCH.md` § *Validation Architecture* by `/gsd-plan-phase 8`.
> The per-task map below is a **seed**: task IDs are filled once the planner has emitted
> them. Where the seed turns out to be wrong, mark the correction as a correction rather
> than silently overwriting it — the `07-VALIDATION.md` convention.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root) — `resolve.alias` contains **only** `vue` and `pinia`; **no `caido:plugin` alias**, deferred to Phase 9 |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Typecheck** | `pnpm -r typecheck` |
| **Lint** | `pnpm lint` (`eslint . --max-warnings 0`) |
| **Measured runtime** | Measured 2026-08-24: 36 test files, **534 tests — 528 passed, 6 skipped** (the 6 are `spawn-plan.win32.test.ts`, correctly skipped off win32); vitest-reported duration **971 ms**, wall clock ~1.8 s. The `Verify (Windows)` job is ~90 s end to end with `timeout-minutes: 6` (`ci.yml`). |

**There is no `test` package script.** `package.json` defines `typecheck`, `lint`, `lint:fix`,
`format`, `build`, `watch` only — the same correction `07-VALIDATION.md` had to make. Both CI legs
invoke `pnpm exec vitest run`; use that spelling.

**Platform note — the constraint that governs this phase.** `packages/backend/src/index.ts`
(**5,240 lines**) is **not importable under vitest**. Every behaviour that must be tested belongs in
a pure module; everything left in `index.ts` is verified by comment-stripped source counts
(`index.source.test.ts`'s balanced-paren `callArgumentTexts` scanner is the established vehicle) and
by the compiler — strictly weaker than an executed assertion, and labelled as such in every row
below that relies on it.

**Baseline for CMP-01.** 534 tests at HEAD. At phase close the count must have **grown, with zero
tests removed as obsolete**, verified mechanically — the check `05-REPORT.md` used for the
263 → 290 transition.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run <the task's own suite>` + `pnpm -r typecheck` — < 5 s
- **After every plan:** `pnpm exec vitest run` + `pnpm lint` — ~2 s locally
- **Before `/gsd-verify-work`:** full suite green on **both** the ubuntu matrix (Node 20/22/24/26)
  and the `windows-latest` leg, with the run URL, per-step conclusions and the win32 execution log
  line recorded — the `07-VALIDATION.md` § *Windows evidence* format
- **Max feedback latency:** < 5 s locally; ~90 s for the Windows leg

---

## Per-Task Verification Map

> Task IDs are `{pending}` until the planner emits them. Every row already carries its automated
> command, so filling the ID column is the only remaining work.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {pending} | {01} | 0 | LIF-01 / SC-1 | — | `buildKillTreePlan` on win32 emits `%SystemRoot%\System32\taskkill.exe` with `["/pid","<n>","/t","/f"]`, `windowsVerbatimArguments: false`; trailing separators stripped; bare-name fallback when SystemRoot is empty | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {01} | 0 | SC-1 | T-08-02 | `pid: undefined`, `NaN`, `0` and negatives all return `{ kind: "none", reason: "no-pid" }` — the guard, in the one place a test can reach it | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {01} | 0 | LIF-02 / SC-2 | — | POSIX arm emits `kill` with `["-TERM","--","-<n>"]`; `"kill"` rung emits `-KILL`; **`undefined` platform takes the POSIX arm** (CMP-01) | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {01} | 0 | SC-2 | — | `shouldDetachProviderSpawn` returns `false` on `"win32"` and `true` on `"darwin"`, `"linux"` and `undefined` | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 0 | LIF-02 / SC-3 (POSIX half) | T-08-01 | **Behavioural.** Control: no `detached` + single-pid kill → grandchild **survives**. Then: `detached` + the production plan's argv → parent **and** grandchild die | integration (skipIf win32) | `pnpm exec vitest run packages/backend/src/kill-tree.posix.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 0 | LIF-01 / SC-3 (Windows half) | T-08-01 | `taskkill.exe` resolves and runs on a real Windows host; **exit code and stderr for an already-dead pid are RECORDED** (measurement, not assertion) | integration (skipIf ≠ win32) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.test.ts` — **only executes on the `windows-latest` leg** | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 0 | LIF-01 / SC-3 | — | The win32 suite **actually ran** on the Windows host — a `--reporter=json` gate with the three arms (`pending > 0`, `total === 0`, `passed !== total`) | CI gate | new `ci.yml` step, mirroring `Gate: the win32 spawn-plan suite actually ran` | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 0 | LIF-01 / SC-3 | — | The gate itself still exists and points at a file that exists — runs on **every** platform, so a deleted gate is noticed on Linux | unit (static) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.gate.test.ts` — mirrors `spawn-plan.win32.gate.test.ts` | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 1+ | SC-4 | T-08-01 | In `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`, the kill statement precedes every `rm` | static gate | `awk '/^async function cleanupMcpRuntime/,/^}/' packages/backend/src/index.ts \| sed -e 's://.*::' \| grep -n 'killTree\|rm('` — assert the `killTree` line number is lower than every `rm(` line number | ✅ (`awk`+`sed` pattern from 07-VALIDATION) | ⬜ pending |
| {pending} | {pending} | 1+ | SC-4 | T-08-01 | `cleanupMcpRuntime` kills at all — the marker changes from seam to implementation | static gate | `awk '/^async function cleanupMcpRuntime/,/^}/' … \| grep -c 'killTree'` ≥ 1 | ✅ | ⬜ pending |
| {pending} | {pending} | 1+ | SC-1 / SC-2 wiring | — | All five in-scope sites route through `killTree`; the three out-of-scope leaf sites still call `proc.kill` directly | static gate | extend `packages/backend/src/index.source.test.ts` with a `killTree(` call-site count of 5 (or the count the reviewer measures) | ✅ (file exists) | ⬜ pending |
| {pending} | {pending} | 0 | Pitfall 1 — the LLRT trap | T-08-03 | **`process.kill(-` appears nowhere.** The only vehicle-independent control against the Node-green/LLRT-broken regression | static gate | `test "$(grep -rc 'process\.kill(-' packages/backend/src \| grep -v ':0$' \| wc -l \| tr -d ' ')" = 0` | ❌ W0 | ⬜ pending |
| {pending} | {pending} | 1+ | C-4 | — | `shell: true` still appears nowhere (the shipped Phase 7 gate, re-run) | static gate | `test "$(grep -rn 'shell: *true' packages/ --include='*.ts' \| wc -l \| tr -d ' ')" = 0` | ✅ | ⬜ pending |
| {pending} | {pending} | last | SC-5 / CMP-01 | — | Full suite green on all five legs; test count **grew** from 534 with zero removals; typecheck and lint clean | regression | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | ✅ | ⬜ pending |
| {pending} | {pending} | last | SC-5 | — | The frontend cancel-race guard is byte-unchanged — the user-visible `[Cancelled]` semantics | tripwire | `git diff --stat <pre-phase> -- packages/frontend/src/views/ChatView.cancel.test.ts packages/frontend/src/views/ChatView.vue` is empty | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/src/kill-plan.ts` + `kill-plan.test.ts` — LIF-01, LIF-02, SC-1, SC-2
- [ ] `packages/backend/src/kill-tree.posix.test.ts` + a runtime-built fork-a-grandchild fixture
      (built by the test, **not** committed — the `spawn-plan.win32.test.ts` precedent) — LIF-02, SC-3
- [ ] `packages/backend/src/kill-tree.win32.test.ts` (skipIf ≠ win32) — LIF-01, SC-3
- [ ] `packages/backend/src/kill-tree.win32.gate.test.ts` + the matching `ci.yml` gate step — the false-green guard
- [ ] **Spike (strongly recommended):** a temporary diagnostics path that reports, from a **real Caido
      install on macOS/Linux**, (a) `typeof process.kill`, (b) that a `detached: true` spawn's group
      kill reaches a grandchild, and (c) the `pgid` of a real CLI's MCP child
      (`ps -o pid,ppid,pgid,comm`). This is the **only** available closure for assumptions **A1** and
      **A6**, the two highest-risk items in `08-RESEARCH.md`, and it runs on hardware the maintainer
      already owns.

No framework install is needed. No shared fixture module is needed beyond the per-file fixtures above.

---

## Vehicle caveat — what this phase's evidence will NOT cover

Written in the voice Phase 3 § *Vehicle caveat* and `07-VALIDATION.md` established, and deliberately
not softened.

1. **It will not prove `index.ts`'s wiring.** No test executes `cancelCliMessage`, `closeCliSession`,
   `cleanupMcpRuntime` or the timeout handler. What is proven at those sites is *the source text
   delivers the right arguments in the right order*, by comment-stripped `awk`-scoped counts and by
   the compiler. That is the strongest available substitute; it is not a test.
2. **It will not prove Caido's LLRT.** `detached` and `process.kill`'s `u32` typing are
   **source-verified and never executed**. Every CI leg runs Node. Assumption A2 (Phase 5's) stays
   open, and this phase adds **A1** and **A6** to it. The Wave 0 spike is the cheapest partial
   closure and it covers POSIX only.
3. **It will not prove that any real CLI's MCP child is in the killed group.** No CLI binary is
   executed anywhere in this project's CI. A6 is untested by construction.
4. **It will not prove SC-3 on Windows behaviourally.** A CI job proves the *spawn contract* — that
   the right `taskkill` argv is built and reaches `spawn`. It does not prove a real turn's tree came
   down. That belongs beside Phase 10 SC-5.
5. **It will not prove the `/T` residual is bounded in practice.** Pitfall 5's dead-intermediate-parent
   hole is a source-and-community claim; nothing observes how often it bites.

---

## Manual-Only Verifications

| Behavior | Requirement | Owning phase | Gates this phase? | Test Instructions |
|----------|-------------|--------------|-------------------|-------------------|
| A real cancel on macOS/Linux leaves no `node mcp-server.mjs` behind | LIF-02 / SC-3 | **Phase 8 (this one)** | **Yes** — recommend a `checkpoint:human-verify` | Start a Claude turn in Caido, note `pgrep -f mcp-server.mjs`, click Stop, re-run `pgrep`. Expect zero. **Cheap, decisive, and on hardware the maintainer owns.** |
| A real cancel on native Windows leaves no `node.exe` behind | LIF-01 / SC-3 | **Phase 10** | **No** — hardware-blocked (C-5) | Reporter or any Windows user: start a turn, cancel, check Task Manager for orphaned `node.exe`. |
| LLRT honours `detached` on the shipped Caido build | A1 | **Phase 8** | **Recommended** — the Wave 0 spike | See Wave 0 item 5. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (local) / ~90s (Windows leg)
- [ ] Task ID column filled from the emitted PLAN.md files
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
