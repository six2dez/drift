---
phase: 7
slug: provider-spawn-registration
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-21
filled: 2026-08-22
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `07-RESEARCH.md` § *Validation Architecture*; filled by 07-05 task 2 once
> every task id existed. Where the seed was wrong, the correction is marked as a correction
> rather than silently overwritten.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/spawn-plan.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Typecheck** | `pnpm -r typecheck` |
| **Lint** | `pnpm lint` (`eslint . --max-warnings 0`) |
| **Measured runtime** | full suite ~3s locally; the `Verify (Windows)` job is ~90s wall clock end to end |

**Correction (2026-08-22, 07-05 task 2).** The seeded rows named a `test` package script as the
full-suite command and a bare `vitest` passthrough as the quick one. **This repository defines no
`test` script** — `package.json` carries `typecheck`, `lint`, `lint:fix`, `format`, `build` and
`dev` only — so that invocation fails rather than running the suite. Both CI legs invoke `pnpm exec vitest run`
(`.github/workflows/ci.yml`, `Test` step on the ubuntu matrix and on `Verify (Windows)`), and that
is the invocation recorded above. The seed was checked against the workflow file, not assumed.

**Platform note — the load-bearing one for this phase.** `packages/backend/src/index.ts` is **not
importable under vitest** (no `caido:plugin` alias; deferred to Phase 9). Every behaviour that must
be tested therefore belongs in a pure module, and everything left in `index.ts` is verified by
comment-stripped source counts and by the compiler — which is strictly weaker than an executed
assertion and is labelled as such in every row below that relies on it. PRV-01's only real Windows
evidence lives on the `windows-latest` CI leg Phase 5 landed as blocking (05-D-07); it cannot be
produced on the maintainer's machine.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run <the task's own suite>` + `pnpm -r typecheck`
- **After every plan:** `pnpm exec vitest run` + `pnpm lint`
- **Before `/gsd-verify-work`:** full suite green on **both** the ubuntu matrix (Node 20/22/24/26)
  and the `windows-latest` leg — see § *Windows evidence* for the recorded run
- **Max feedback latency:** < 5s for a single-file run; ~3s for the whole local suite

Measured continuity across the phase: every one of the fifteen tasks below carries an automated
command, and no three consecutive tasks lack one.

---

## Per-Task Verification Map

Every task in plans 07-01 … 07-05, with the requirement it serves, the behaviour it had to
establish, and the command that proves it. "Exists" is the state on disk at phase close.

| Task | Req | Behavior | Test Type | Automated Command | Exists |
|---|---|---|---|---|---|
| **07-01 T1** — spawn plan module + `index.ts` wiring | PRV-02, UX-01, CMP-01 | `.cmd`/`.bat` → `cmd.exe /d /s /c "<escaped>"` + `windowsVerbatimArguments: true`; `.exe` → direct; POSIX and `undefined` platform byte-identical | unit | `pnpm exec vitest run packages/backend/src/spawn-plan.test.ts` (20 cases) | ✅ |
| **07-01 T2** — win32 integration file | PRV-01, PRV-02 | A real fixture `.cmd` round-trips the hazard set byte-identically; a DIRECT spawn of the same shim throws EINVAL (falsifiability) | integration (win32-gated) | `pnpm exec vitest run packages/backend/src/spawn-plan.win32.test.ts` (5 cases; SKIPPED off win32 by design) | ✅ |
| **07-01 T3** — measure A1 on `windows-latest` | PRV-01 | Escaping depth measured, not guessed; the caret-pass-removed leg discriminates | integration (win32-gated) + CI record | `gh run view 32563543158 --json jobs` — job `Verify (Windows)` success, step `Test` success; the same gate is RED on run 32563348727 | ✅ |
| **07-02 T1** — capability level + approval-channel table | PRV-04, PRV-05 | Three-level `ProviderCapability`; one table decides both the tool policy and the card sentence; **fails closed on an unknown id, including prototype-chain ids** | unit | `pnpm exec vitest run packages/shared/src/cli-providers.test.ts` (19 cases) | ✅ |
| **07-02 T2** — backend migration + D-08 wire | PRV-04 | `skippedMcpCliReasons` reaches `checkProvider` → `getProviderStatuses`; the refusal in `mcp-server.mjs` names key NAMES only | static + typecheck | `pnpm -r typecheck` (the boolean removal makes every stale read a compile error); `grep -c 'D-08' packages/backend/src/index.ts` ≥ 1 | ✅ |
| **07-02 T3** — provider card + UX-01 hint | PRV-04, UX-01 | Amber dot for `limited`; a fourth conditional detail element renders the limitation; the command field gains a placeholder and **no** validator | unit + static | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` (13 cases); `grep -c 'isProviderUsable' packages/frontend/src/views/SettingsView.vue` ≥ 1 | ✅ |
| **07-03 T1** — registration payload, argv, both guards | PRV-03, PRV-05 | Per-CLI `mcp add` argv and env; per-session keys stripped structurally; Codex refused on ANY expandable reference; Gemini refused on an unbacked reference | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` | ✅ |
| **07-03 T2** — register through the plan; delete the wrapper | PRV-03 | Both registration spawns route through `buildSpawnPlan` and deliver the verbatim flag; the POSIX wrapper and its four rendering functions are gone in the same commit | static + typecheck | `awk '/^async function registerMcpWithCli/,/^}/' packages/backend/src/index.ts \| grep -c 'windowsVerbatimArguments'` = 2; `pnpm -r typecheck` | ✅ |
| **07-03 T3** — SC-7 deletion checklist | SC-7 | Four wrapper symbols, the last permission-bit spawn, the comment-stripped `.sh` count and the three deletion notices all reach 0 | static gate | see § *SC-7 deletion checklist* below | ✅ |
| **07-04 T1** — removal policy + value-free failure line | PRV-03, PRV-04 | Both Gemini scopes in a stable order and one unscoped Codex removal; classifier reads only exit code + CLI; formatter carries three scalars and no path | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` (39 cases in the file) | ✅ |
| **07-04 T2** — unconditional startup sweep | PRV-03 | The sweep reads no `enabled` flag, no `registeredMcpCliPaths`, no platform condition, and runs before the registration loop | static | `awk '/^async function sweepStaleMcpCliRegistrations/,/^}/' packages/backend/src/index.ts \| sed -e 's://.*::' \| grep -cE 'enabled\|registeredMcpCliPaths\|=== "win32"'` = 0 | ✅ |
| **07-04 T3** — OQ-3 comments + deferred seams | — | The three comments record the OQ-3 decision; `LIF-01 SEAM` marks exactly two sites; the console-window marker stays at one | static | `grep -c 'LIF-01 SEAM' packages/backend/src/index.ts` = 2; `grep -c 'console window' …` = 1 | ✅ |
| **07-05 T1** — README rows | PRV-04, PRV-05 | No pre-phase "not yet supported" sentence survives; both rows describe executable + args + env; the crash-residue line names the token, both config files and the manual commands | static | `test "$(grep -c 'not yet supported' README.md)" = 0 && grep -q 'crash' README.md && pnpm lint` | ✅ |
| **07-05 T2** — this document + research correction | PRV-01, PRV-04, PRV-05 | The contract names the commands this repo has; the research artifact carries the same correction and a resolved open-questions section | static | `grep -q 'pnpm exec vitest run' 07-VALIDATION.md && test "$(grep -c 'pnpm[ ]test' 07-RESEARCH.md)" = 0 && grep -q 'RESOLVED' 07-RESEARCH.md` — the bracket expression is deliberate and matches the same text: written literally, this document would match its own gate, the self-non-matching property `ci.yml`'s secret gate documents | ✅ |
| **07-05 T3** — `windows-latest` run on the phase tree | PRV-01 | All four Linux legs and the Windows leg green; the Windows-gated cases RAN rather than skipped | CI record | `gh run view "$RID" --json jobs` with an assertion that every job conclusion is `success` AND zero steps concluded `failure` | ✅ — see § *Windows evidence* |
| **07-05 checkpoint** — the limitation sentence a Codex user reads | PRV-05, UX-01, D-08 | The sentence disambiguates "registered, but limited" from "never registered" **on its own** | human read | none — no gate can reach it; see § *Manual-Only Verifications* | ⏳ pending |

### Rows the seed did not anticipate

| Req | Behavior | Test Type | Automated Command |
|---|---|---|---|
| PRV-05 / D-06 | The capability predicate's **fail-closed cases**: an empty id, an arbitrary unknown id, and the three prototype-chain ids (`__proto__`, `constructor`, `toString`) never return the working arm | unit | `pnpm exec vitest run packages/shared/src/cli-providers.test.ts` |
| PRV-03 | The registration planner's **two refusal arms**, both written above the register arm: Codex refused on any expandable reference; Gemini refused on a reference with no non-empty token in Drift's own spawn environment — asserted in **both** directions | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` |
| PRV-03 | The removal policy's **dual-scope output**: both Gemini scopes in a stable order with the flag before the positional, one unscoped Codex removal, identical output on win32/darwin/linux/`undefined`, and a fresh array per call | unit | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts` |
| PRV-04 | The failure formatter's **value-free signature**: three scalars, a `satisfies Parameters<typeof fn>[0]` pin so a fourth member is a compile error at the test site, and `not.toMatch(/[/\\]/)` so no path shape survives | unit + typecheck | `pnpm exec vitest run packages/backend/src/mcp-server-spec.test.ts`; `pnpm -r typecheck` |
| SC-7 | The **deletion checklist counts**, each beside its measured pre-phase value at `4203dbd` rather than assumed | static gate | see below |

### SC-7 deletion checklist

Re-run at phase close. Pre-phase column measured against `4203dbd`, the last commit before any
Phase 7 code — not read off the roadmap.

| Gate | Command | Pre-phase | Now |
|---|---|---|---|
| `renderExportExecScript` | `grep -c 'renderExportExecScript' packages/backend/src/index.ts` | 2 | 0 |
| `shellQuote` | `grep -c 'shellQuote' packages/backend/src/index.ts` | 3 | 0 |
| `writeMcpWrapper` | `grep -c 'writeMcpWrapper' packages/backend/src/index.ts` | 4 | 0 |
| `getMcpWrapperPath` | `grep -c 'getMcpWrapperPath' packages/backend/src/index.ts` | 3 | 0 |
| last permission-bit spawn | `grep -c 'spawnAndWait("chmod"' packages/backend/src/index.ts` | 1 | 0 |
| shell-script extension | `sed -e 's://.*::' packages/backend/src/index.ts \| grep -c '\.sh'` | 1 | 0 |
| deletion notices, repo-wide | `grep -rc 'DELETED IN PHASE 7 (PRV-03)' . --exclude-dir=node_modules --exclude-dir=.planning --exclude-dir=.git` | 3 | 0 |

Two deliberate survivors, confirmed present and out of scope: `enforceOwnerOnlyDir`'s `fs/promises`
namespace `chmod` (a POSIX security control, not a shell spawn) and
`.github/workflows/windows-llrt-probe.yml`'s `DELETED IN PHASE 9 (D-02)` header (Phase 9's debt).

---

## Wave 0 Requirements

- [x] `packages/backend/src/spawn-plan.ts` + `spawn-plan.test.ts` — PRV-02, UX-01 (07-01 T1)
- [x] `packages/backend/src/spawn-plan.win32.test.ts` + a fixture `.cmd` echo shim — PRV-01
      (07-01 T2; the shim is built at runtime by the test rather than committed as a fixture file)
- [x] The D-04 capability flag + predicate in `packages/shared/src` and its test — PRV-05
      (07-02 T1: `packages/shared/src/cli-providers.ts` + `cli-providers.test.ts`)
- [x] Extend `mcp-server-spec.test.ts` (registration argv) and `mcp-server-spec.spawn.test.ts`
      (per-session env reach) — PRV-03, PRV-05 (07-03 T1)

All four items complete; each file was confirmed present on disk with `[ -f ]` at phase close.
No framework install was needed and no shared fixture module was needed.

---

## Vehicle caveat — what this phase's evidence does NOT cover

Written in the voice Phase 3 § *Vehicle caveat* and 05-D-08 established, and deliberately not
softened. **Five things this phase did not prove:**

1. **It does not prove `index.ts`'s wiring.** `packages/backend/src/index.ts` cannot be imported
   under vitest (no `caido:plugin` alias; deferred to Phase 9), so nothing in CI executes
   `sendCliMessage`, `registerMcpWithCli`, `unregisterMcpFromCli` or
   `sweepStaleMcpCliRegistrations`. What the phase proves at those sites is delivery of the right
   arguments *as written in the source*, by comment-stripped `awk`-scoped counts and by the
   compiler. That is the strongest available substitute and the house accepts it — it is not a
   test and this document does not call it one.
2. **It does not prove Caido's own runtime.** `windowsVerbatimArguments` is source-verified in
   Caido's LLRT fork (`modules/llrt_child_process/src/lib.rs`, branch `caido`) and declared in the
   vendored `@caido/quickjs-types` surface, and was **never executed** there. Every CI leg runs
   Node, not LLRT. Assumption A2 stays open; only a real Windows Caido closes it.
3. **It does not prove that any installed CLI forwarded its environment.** The Gemini and Codex
   approval-channel verdicts are read out of `mcp-client.ts` / `environmentSanitization.ts` and
   `stdio_server_launcher.rs` / `utils.rs` / `mcp_cmd.rs` respectively. **No CLI binary was
   executed anywhere in this phase.** What is established is that Drift supplies the variables and
   that the CLI's source forwards (or clears) them — not that a specific installed version on a
   specific machine did so. Report PRV-05 at that strength and no higher (D-05, Pitfall E).
4. **It does not prove a real Claude Code turn on a real Windows desktop.** A CI spawn contract is
   not a turn. Nothing in CI attaches a real CLI to Drift.
5. **It does not prove the crash residual is bounded in practice.** The startup sweep is
   unconditional and the removal is exit-zero idempotent, and both properties are source-verified;
   nothing observes what a hard kill actually leaves behind. Between a kill and the next start a
   live Caido session token sits in `~/.codex/config.toml`.

**The residual, and who owns it.** PRV-01's end-to-end claim rests on the reporter confirmation
(@0xMRK0S running a chat turn on native Windows). SC-1 marks that *"where possible"* and
07-CONTEXT.md places it in **Phase 9/10**. It is **not** a gate on Phase 7 and this phase must not
be reported as having closed the milestone's blocking must-have end to end.

### Windows evidence — the phase's single strongest record

Recorded as a claim, not a tick: the run URL, every job leg's conclusion, the `Verify (Windows)`
job's per-step conclusions, and the log line proving the win32-gated cases RAN on that host.

**Phase-tree run (07-05 task 3), 2026-08-22.** Scratch branch
`scratch/ci-proof-07-05-phase-close` at `19a6c8e`, pushed to `origin` and torn down afterwards.

- **Run URL:** <https://github.com/six2dez/drift/actions/runs/32567316779> (workflow `CI`, event
  `push`, head SHA `19a6c8eaf8ba60bf1564911ffc216290196734eb`)
- **Job conclusions — all five legs `success`:** `Verify (Node 20)`, `Verify (Node 22)`,
  `Verify (Node 24)`, `Verify (Node 26)`, `Verify (Windows)`
- **`Verify (Windows)` per-step conclusions:** `Gate: no secret material in CI configuration`
  **success** · `Install dependencies` **success** · `Typecheck` **success** · `Lint` **success** ·
  `Test` **success** · `Build` **success** (every other step in the job — setup and post steps —
  also `success`)
- **Steps concluding `failure` anywhere in the run:** **0**
- **Log lines proving the win32-gated cases RAN rather than skipped** (extracted from the job log,
  ANSI- and timestamp-stripped):

  ```
  ✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 639ms
  Test Files  34 passed (34)
       Tests  491 passed (491)
  ```

  491 on Windows against **486 passed / 5 skipped** on the maintainer's macOS host — the delta is
  exactly the five win32 cases. The only occurrence of the string `skip` anywhere in the Windows job
  log is pnpm's `resolution step is skipped`; no vitest case skipped on that host.
- **Build artifact asserted, not inferred:** `-rw-r--r-- 1 runneradmin 197121 2531026 Aug 22 10:21
  dist/plugin_package.zip` — the `test -f` on the exact path release.yml signs.
- **The gate DISCRIMINATES, and that was checked rather than assumed.** `gh` exits 0 on any
  successful API call whatever the run concluded, so the assertion is on the data: every job
  conclusion `success` AND zero steps concluding `failure`. Run against 07-01's known-RED run
  [32563348727](https://github.com/six2dez/drift/actions/runs/32563348727) the same two checks
  return `failure,success` and `1` — the gate goes red on a red run.
- **The log-extraction pipeline was validated before any count from it was trusted** (the standing
  rule from STATE `[03-03]`/`[03-04]`, and 07-01's fourth recurrence of the same class): the cleaned
  stream was first checked to yield exactly one `Test Files` line and one `Tests` totals line — an
  independently known non-zero control — before the `491` was read off it. Both the real-escape and
  the literal `^[` ANSI forms are stripped, because `gh run view --log` emits the latter.
- **Comparison against the run 07-01 recorded** ([32563543158](https://github.com/six2dez/drift/actions/runs/32563543158),
  `Tests 444 passed (444)`): **no leg regressed**, and no leg that was green there is red here. The
  count grew 444 → 491, which is exactly the 19 cases 07-02 added, the 14 07-04 added, and the
  cases 07-03 added to `mcp-server-spec.test.ts` — growth, not replacement.
- **Sibling workflow, recorded for completeness:** the same push also fired
  `Windows LLRT Primitive Probe`
  ([32567316768](https://github.com/six2dez/drift/actions/runs/32567316768)) — job
  `Windows LLRT primitive assertions (CI-02)` **success**. It is Phase 3's instrument, not a Phase 7
  gate, and it is stamped for deletion in Phase 9.

**Teardown, asserted on the specific name.** After deleting the branch locally and on `origin`, the
full **unfiltered** `git ls-remote --heads origin` listing was:

```
0cd81f3c0cf31bb4f7c4916bf595ec07a358b628	refs/heads/fix/security-hotfixes
2d8cf16004b40a30dfd7721d99f2bf3e2b19e270	refs/heads/main
3f7c7b3816c0cdd3b8936afdcccc723cb1591151	refs/heads/scratch/ci-06-07-phase-close
```

`scratch/ci-proof-07-05-phase-close` is absent — discriminated on the exact name, not on a
`scratch/*` glob, because a glob listing exits 0 whether or not it matched (STATE `[03-04]`).
`scratch/ci-06-07-phase-close` is **pre-existing**, created by an earlier phase, outside this plan's
authorisation to delete, and named here so a later reader does not mistake it for this plan's
leftover. Nothing was staged for the push: the branch carried only already-committed history, so
the untracked `.planning/` documents in the working tree could not reach the public remote.

**Earlier runs kept on the record**, because a green run alone proves less:
[32563348727](https://github.com/six2dez/drift/actions/runs/32563348727) — RED, and it is the
measurement that falsified 07-01's escaping-depth prediction;
[32563543158](https://github.com/six2dez/drift/actions/runs/32563543158) — the reshaped green run,
job `Verify (Windows)` success, step `Test` success, log line
`✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 508ms` with `Tests 444 passed (444)`.

---

## Manual-Only Verifications

| Behavior | Requirement | Owning phase | Gates this phase? | Test Instructions |
|----------|-------------|--------------|-------------------|-------------------|
| A real Claude Code turn end-to-end on a Windows desktop with Drift MCP attached | PRV-01 / SC-1 | **Phase 9/10** | **No** — SC-1 says "where possible"; CI proves the spawn contract, not `index.ts`'s wiring of it | Reporter (@0xMRK0S) runs a chat turn on native Windows; confirm MCP attached and a Drift tool returns data. |
| Gemini's real-machine Windows reliability | PRV-04 / SC-5 | **Phase 9/10** | **No** — status wording is best-effort by roadmap decision; A5 records that the unresolved-issue premise was searched by title only and not reproduced | Real-machine confirmation checkpoint; status gated, phase not blocked. |
| Codex's sensitive-tool limitation reads correctly in-product | PRV-05 / D-08 | **Phase 7 (this plan)** | **Yes** — 07-05's `checkpoint:human-verify` | Open Settings → CLI Providers → Codex. Confirm the dot is amber (not red), the resolved path shows, and the limitation sentence disambiguates "registered, but limited" from "never registered" without leaning on any other field. Then confirm the README row says the same thing. |

The first two rows were unscheduled in the seed and are now placed in their owning phase with their
non-gating status stated. The third was unscheduled and is now this plan's checkpoint.

---

## Validation Sign-Off

- [x] All tasks have an `<automated>` verify or a Wave 0 dependency — fifteen tasks, fifteen
      commands; the sixteenth item is the human checkpoint, which by construction has none.
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify.
- [x] Wave 0 covers all MISSING references — all four items complete, each confirmed on disk.
- [x] No watch-mode flags — every command is `vitest run`, never `vitest`.
- [x] Feedback latency < 30s — measured ~3s for the whole local suite.
- [x] `nyquist_compliant: true` set in frontmatter.

**Blocking reasons:** none for the flags above. **One item is deliberately left open and is not a
flag:** the 07-05 human read of the Codex limitation sentence. It is the phase's one criterion no
gate can reach, it is recorded as ⏳ pending in the map, and `status: validated` above refers to the
*validation contract* being complete and honest — not to that read having happened.

**Approval:** contract filled and re-measured 2026-08-22 (07-05 task 2). The human read is tracked
separately in the 07-05 summary with its provenance.
