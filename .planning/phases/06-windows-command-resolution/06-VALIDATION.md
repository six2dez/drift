---
phase: 6
slug: windows-command-resolution
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` § *Validation Architecture*. The planner fills the
> Per-Task Verification Map once task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (root devDependency — already present) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Gate commands** | `pnpm -r typecheck` and `pnpm lint` (`eslint . --max-warnings 0`, never `--fix`) |
| **Estimated runtime** | Quick: sub-second (both files pure or temp-dir-local). Full suite: seconds. |

**The SC-5 structural argument** — `platform.test.ts` is 100% literal-input pure tests needing no
filesystem; `command-resolution.test.ts` is currently a *mix* (its two version-manager tests create
real directories). **D-10's pure/impure split is what lets the new Windows cases follow
`platform.test.ts`'s shape instead.** Every win32 assertion targets `buildCommandCandidatePaths` with
literal roots and literal `discoveredVersions`, so the Linux runner asserts the exact strings a
Windows box would produce. `C:\...` need never exist for the test to be real evidence.

---

## Sampling Rate

- **After every task commit:** `pnpm exec vitest run packages/backend/src/command-resolution.test.ts packages/backend/src/platform.test.ts`
- **After every plan wave:** `pnpm exec vitest run && pnpm -r typecheck && pnpm lint`
- **Before `/gsd-verify-work 6`:** full suite green on **both** CI legs — `Verify (Node 20/22/24/26)`
  and the blocking `Verify (Windows)` leg. SC-5 only requires the Linux runner; the Windows leg runs
  the same pure tests as a free second data point.
- **Max feedback latency:** < 5 seconds for the quick command.

---

## Per-Task Verification Map

Filled by `/gsd-plan-phase 6` on 2026-08-21. Task IDs follow this repository's existing in-code
marker convention (`T-04-25`, `T-04-04`, …): phase-wide sequential, so a task can be cited from a
source comment. Threat IDs refer to the `<threat_model>` register in the owning plan.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T-06-01 | 06-01 | 1 | RES-01, RES-03 | T-06-T02, T-06-T03 | Absent named root emits no candidate — never an empty-prefix relative path; no env value logged at the new seam | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts packages/backend/src/command-resolution.test.ts` | ✅ both | ⬜ pending |
| T-06-02 | 06-01 | 1 | CMP-01 | — | — | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "CMP-01"` | ✅ | ⬜ pending |
| T-06-03 | 06-01 | 1 | CMP-01 | — | — | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t "CMP-01"` | ✅ | ⬜ pending |
| T-06-04 | 06-02 | 2 | RES-01 | T-06-T06 | Absent `%ProgramFiles%` / `%ProgramData%` skips its row entirely | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts` | ✅ | ⬜ pending |
| T-06-05 | 06-02 | 2 | RES-01 | T-06-T05, T-06-T07 | Version walk reuses the guarded, dot-skipping listing helper; win32 emission bounded | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts` | ✅ | ⬜ pending |
| T-06-06 | 06-02 | 2 | RES-01 | T-06-T08 | Volta node image ordered ahead of the `.cmd` shim so a real `node.exe` wins | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts` | ✅ | ⬜ pending |
| T-06-07 | 06-03 | 2 | RES-02 | T-06-T10 | A line that is not extension-terminated produces no candidate — the `INFO:` sentence and the truncated partial line both | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "rankPathSearchHits"` | ✅ | ⬜ pending |
| T-06-08 | 06-03 | 2 | RES-02 | T-06-T11, T-06-T12 | Search binary resolved by absolute path under the machine's own `SystemRoot`; bare-name fallback reachable and tested | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getWhichCommand"` | ✅ (`:147`) | ⬜ pending |
| T-06-09 | 06-03 | 2 | RES-03 | T-06-T13 | Returns data only; no home-dir value is rendered into a log or diagnostic | unit | `pnpm exec vitest run packages/backend/src/platform.test.ts -t "getHomeDirCandidates"` | ✅ (`:212`) | ⬜ pending |
| T-06-10 | 06-04 | 3 | RES-03 | T-06-T14, T-06-T15 | Traversal segments and UNC shapes both yield `undefined` — no home inferred outside the profile tree or from a network share | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t "home director"` | ✅ (`:22`) | ⬜ pending |
| T-06-11 | 06-04 | 3 | RES-03 | T-06-T16 | Fold applies on the literal win32 platform only, so no genuinely distinct POSIX candidate is dropped | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t "foldCandidateKey"` | ✅ | ⬜ pending |
| T-06-12 | 06-04 | 3 | RES-03 | T-06-T17 | `normalizePathForCompare` preserved and uncalled, with the decline recorded beside the export | source assertion + unit | `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts` | ✅ (`:531`) | ⬜ pending |
| T-06-13 | 06-05 | 4 | RES-02 | T-06-T20, T-06-T21, T-06-T22 | No env VALUE logged (05-D-11); platform-aware timeout kills the child on expiry; binary invoked by absolute path | suite + gates † | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | n/a † | ⬜ pending |
| T-06-14 | 06-05 | 4 | RES-02 | T-06-T18 | Rendered buffer form never read at the PATH-search site; exit-code gate kept; shared size limit unchanged | suite + gates † | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | n/a † | ⬜ pending |
| T-06-15 | 06-05 | 4 | RES-03 | T-06-T20 | Defensive `globalThis` env accessor retained; no bare `process.env` read introduced | suite + gates † | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | n/a † | ⬜ pending |
| T-06-16 | 06-06 | 5 | UX-02 | T-06-SC, T-06-T25 | Every install command carries a first-party citation; the one unsourced name keeps its `[ASSUMED]` tag and an unchanged string; module stays data-only | unit + typecheck | `pnpm -r typecheck && pnpm lint && pnpm exec vitest run` | ✅ | ⬜ pending |
| T-06-17 | 06-06 | 5 | UX-02 | T-06-T24 | The archived-repository install command is absent from every package source directory | unit | `pnpm exec vitest run packages/backend/src/command-resolution.test.ts -t "install hint"` | ⚠️ **inverts `:73`** | ⬜ pending |
| T-06-18 | 06-06 | 5 | UX-02 | T-06-T23 | `lastNodeSearchCandidates` never reaches the user-facing banner | suite + gates † | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | n/a † | ⬜ pending |
| T-06-19 | 06-07 | 6 | UX-02 | T-06-T26, T-06-T27 | Both live surfaces render from one table, so a command cannot be corrected in one and left stale in the other | build + gates † | `pnpm -r typecheck && pnpm lint && pnpm exec vitest run && pnpm build` | n/a † | ⬜ pending |
| T-06-20 | 06-07 | 6 | UX-02, CMP-01 | T-06-T28 | Phase closed on cited run evidence from both CI legs, not on a claim | suite + gates + CI | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint && pnpm build` | n/a † | ⬜ pending |

† `packages/backend/src/index.ts` has **no unit-test file** in this repository — it is the
integration seam, and all seven of its Phase 4 predecessors were verified the same way. Those rows
are covered by the full suite plus the workspace typecheck plus the zero-warning lint gate, and by
the per-task source assertions in each plan's `<acceptance_criteria>`. The pure DECISIONS those rows
wire are each unit-tested one layer down, in `platform.test.ts` (T-06-07, T-06-08, T-06-09) and
`command-resolution.test.ts` (T-06-01 … T-06-06, T-06-10, T-06-11) — which is the whole reason
D-10 split them out. Sampling continuity holds: every task in the phase has an `<automated>` verify
and no three consecutive tasks lack one.

### Requirement → behavior source rows (from RESEARCH § Validation Architecture)

| Req | Behavior to assert | Test file | New? |
|---|---|---|---|
| RES-01 | `buildCommandCandidatePaths({platform:"win32", command:"node", roots:{…literals}})` emits the exact ordered named-root list, backslash-separated | `command-resolution.test.ts` | ❌ new |
| RES-01 | `%ProgramFiles%` / `ProgramData` absent from `roots` ⇒ those rows are skipped, never emitted with an empty prefix | `command-resolution.test.ts` | ❌ new |
| RES-01 | nvm/fnm/Volta version walks emit `<root>\v<v>\node.exe`, `<base>\node-versions\<v>\installation\node.exe` (**no `bin`**), `<home>\tools\image\node\<v>\node.exe` | `command-resolution.test.ts` | ❌ new |
| RES-02 | `rankPathSearchHits` orders `.exe` → `.cmd` → `.bat` across CRLF-split input; PATH order within an extension | `platform.test.ts` | ❌ new |
| RES-02 | `rankPathSearchHits` discards non-extension-terminated lines — the `INFO: Could not find files…` line and a truncated partial final line | `platform.test.ts` | ❌ new |
| RES-02 | `getWhichCommand({platform:"win32", env:{SystemRoot:"D:\\Windows"}})` → `D:\Windows\System32\where.exe`; empty/missing ⇒ bare `where.exe`; POSIX arm byte-identical | `platform.test.ts:147` | ✅ describe exists |
| RES-03 | `extractHomeDir("C:\\Users\\six\\.local\\bin\\claude.exe")` → `C:\Users\six`; the `C:/Users/…` spelling too; `\\server\share\…` ⇒ `undefined` (explicit non-claim) | `command-resolution.test.ts:22` | ✅ `it` exists |
| RES-03 | `getHomeDirCandidates({platform: undefined, env:{HOME, USERPROFILE, APPDATA, LOCALAPPDATA}})` returns all four, deduped | `platform.test.ts:212` | ✅ describe exists |
| UX-02 | `getProviderInstallHint({providerId:"copilot-cli", platform:"linux"})` contains `@github/copilot` and does **NOT** contain `gh extension install` | `command-resolution.test.ts:73` | ⚠️ **inverts an existing assertion** |
| UX-02 | Every provider has both a `posix` and a `win32` hint; unknown provider still gets the generic hint | `command-resolution.test.ts` | ❌ new |
| **CMP-01** | `joinPath({platform:"linux", segments})` is **byte-identical** to `path.join(...segments)` for every POSIX suffix at `command-resolution.ts:149-161` and `:185-195` | `platform.test.ts` | ❌ new — **the CMP-01 proof** |
| **CMP-01** | `buildCommandCandidatePaths({platform:"linux", …})` reproduces the existing `getCommandExecutableCandidates` order exactly | `command-resolution.test.ts` | ❌ new — the D-10 split's regression net |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each item is now assigned to the plan and task that closes it.

- [x] **No new test files needed** — both target files already exist. Confirmed at plan time.
- [x] **The real Wave 0 gap is the D-10 seam itself:** until `buildCommandCandidatePaths` is a pure
      export, the win32 cases cannot be written at all. **Sequence the split before the data.**
      → Closed by **T-06-01** (plan 06-01, wave 1), which is the phase's tracer task and ships the
      seam with exactly one sourced named-root row before any catalogue data arrives in wave 2.
- [x] `platform.test.ts` has no `describe` for `joinPath` or `rankPathSearchHits` — new blocks
      following the existing one-describe-per-export convention.
      → `joinPath` by **T-06-01**; `rankPathSearchHits` by **T-06-07** (plan 06-03, wave 2).
- [x] `command-resolution.test.ts:73` asserts the deprecated Copilot install command is present.
      **This is the only existing assertion Phase 6 makes false.** It must be a deliberate,
      commented inversion citing D-14 — never a silent edit.
      → Closed by **T-06-17** (plan 06-06, wave 5), whose acceptance criteria require the D-14
      reference and the 2025-10-30 archive date to appear in the test file beside the inverted
      assertion, and require the deprecated command to be absent from every package source
      directory.
- [x] Framework install: none — Vitest 4.0.18 already present.

**Two additional Wave-0-shaped gaps found at plan time**, both closed inside wave 1 rather than
deferred:

- [x] `command-resolution.test.ts` has no test asserting one helper's output equals another
      implementation's output — the shape both CMP-01 proofs need.
      → **T-06-02** (the `joinPath` POSIX byte-identity table) and **T-06-03** (the pure builder's
      POSIX order regression net), both in plan 06-01, wave 1. 06-CONTEXT § *Specific Ideas*
      forbids leaving either to review.
- [x] Three existing tests change call shape when the builders are split (`:29-45`, `:47-66`,
      `:90-122`). These are mechanical updates with every expected value preserved, and the comment
      at `:94-107` — which records the real `windows-latest` red — must survive byte-identical.
      → **T-06-01**, with the comment-preservation gate in **T-06-06**.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Windows resolution of `node.exe` and a provider CLI | RES-01, RES-02 | The maintainer cannot test native Windows locally (PROJECT.md § Constraints). CI proves the pure logic; only a real machine proves the catalogue matches a real install. | Deferred to the reporter check in Phase 9/10 — **not claimed by this phase.** |
| `where.exe` latency under Defender (the D-04 number) | RES-02 | No latency measurement exists anywhere; the chosen win32 timeout is headroom, not evidence. | Not verifiable in CI. The code comment must say the number is an estimate, not a measurement. |

All other phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
