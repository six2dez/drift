---
phase: 7
slug: provider-spawn-registration
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `07-RESEARCH.md` § *Validation Architecture*. The planner fills the
> Per-Task Verification Map once task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm vitest run packages/backend/src/spawn-plan.test.ts` |
| **Full suite command** | `pnpm test` (`vitest run`) |
| **Estimated runtime** | ~10s quick / full suite per existing baseline |

**Platform note — the load-bearing one for this phase.** `packages/backend/src/index.ts` is **not
importable under vitest** (no `caido:plugin` alias; deferred to Phase 9). Every behaviour that must
be tested therefore belongs in a pure module. PRV-01's only real evidence lives on the
`windows-latest` CI leg Phase 5 landed as blocking (05-D-07) — it cannot be produced on the
maintainer's machine.

---

## Sampling Rate

- **After every task commit:** `pnpm vitest run packages/backend/src/spawn-plan.test.ts` + `pnpm typecheck`
- **After every plan wave:** `pnpm test` + `pnpm lint`
- **Before `/gsd-verify-work`:** full suite green on **both** the ubuntu matrix and the
  `windows-latest` leg
- **Max feedback latency:** < 30s for the quick command

---

## Per-Task Verification Map

*Populated by the planner once task IDs exist. Requirement → behaviour → command mapping below is
the contract those tasks must satisfy.*

| Req | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| PRV-02 | `.cmd` → `cmd.exe /d /s /c "<escaped>"` + `windowsVerbatimArguments:true`; `.exe` → direct passthrough | unit | `pnpm vitest run packages/backend/src/spawn-plan.test.ts` | ❌ W0 |
| PRV-02 / CMP-01 | POSIX and `undefined` platform return the passthrough **byte-identically** | unit | same file | ❌ W0 |
| PRV-01 | A real fixture `.cmd` spawns and echoes the hazard-set arguments back intact | integration (win32-gated) | `pnpm vitest run packages/backend/src/spawn-plan.win32.test.ts` | ❌ W0 |
| PRV-01 | Direct spawn of the same fixture **throws EINVAL** — falsifiability leg | integration (win32-gated) | same file | ❌ W0 |
| PRV-03 | Registration argv for gemini/codex: correct flags, `--scope user`, **no** `DRIFT_ACTIVITY_FILE`/`DRIFT_APPROVALS_FILE` (D-03), **no** `${` for codex | unit | `pnpm vitest run packages/backend/src/mcp-server-spec.test.ts` | ⚠️ extend |
| PRV-05 | `runtimeEnv` including both per-session paths reaches the built spawn env (D-05, Drift's half) | unit | `pnpm vitest run packages/backend/src/mcp-server-spec.spawn.test.ts` | ⚠️ extend |
| PRV-05 / D-04 | Capability predicate: enabled for gemini, disabled for codex, **fails closed on an unknown provider** (D-06) | unit | `pnpm vitest run packages/shared/...` | ❌ W0 |
| UX-01 | An absolute `.cmd` and an absolute `.exe` each produce the right plan | unit | `spawn-plan.test.ts` | ❌ W0 |
| SC-7 | Four symbols gone; comment-stripped `.sh` count 0; `DELETED IN PHASE 7` notices 3→0 | static gate | `grep -c` per the roadmap checklist | ❌ W0 |

---

## Wave 0 Requirements

- [ ] `packages/backend/src/spawn-plan.ts` + `spawn-plan.test.ts` — PRV-02, UX-01
- [ ] `packages/backend/src/spawn-plan.win32.test.ts` + a fixture `.cmd` echo shim — PRV-01
- [ ] The D-04 capability flag + predicate in `packages/shared/src` and its test — PRV-05
- [ ] Extend `mcp-server-spec.test.ts` (registration argv) and `mcp-server-spec.spawn.test.ts`
      (per-session env reach) — PRV-03, PRV-05

*No framework install needed; no shared fixture module needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A real Claude Code turn end-to-end on a Windows desktop with Drift MCP attached | PRV-01 / SC-1 | CI proves the spawn contract, not `index.ts`'s wiring of it (05-D-08 vehicle caveat). SC-1 says "where possible" — this is **not** a phase gate. | Reporter (@0xMRK0S) runs a chat turn on native Windows; confirm MCP attached and a Drift tool returns data. Phase 9/10. |
| Gemini's real-machine Windows reliability | PRV-04 / SC-5 | Upstream Windows MCP issues are unresolved; Gemini is best-effort by roadmap decision. | Real-machine confirmation checkpoint; status gated, phase not blocked. |
| Codex sensitive-tool limitation reads correctly in-product | PRV-05 / D-08 | The sentence's clarity is a human judgement; the *predicate* behind it is unit-tested. | Open Settings → provider card for Codex; confirm the limitation sentence renders and disambiguates from "not registered". |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
