---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-08-13T12:47:30.000Z"
last_activity: 2026-08-13 -- Plan 03-02 complete (windows-latest probe workflow, static-only)
progress:
  total_phases: 21
  completed_phases: 1
  total_plans: 11
  completed_plans: 8
  percent: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** The user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data — on native Windows as well as macOS/Linux.
**Current focus:** Phase 03 — CI Spike — Prove LLRT Basics on Windows

## Current Position

Phase: 03 (CI Spike — Prove LLRT Basics on Windows) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-08-13 -- Plan 03-02 complete (windows-latest probe workflow, static-only)

Progress: [█░░░░░░░░░] 10% (1 of 10 milestone phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 8 (plus 1 quick task)
- Average duration: ~10 min
- Total execution time: ~1.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 6 | - | - |
| 03 | 2 of 5 | 10min | 5min |

**Recent Trend:**

- Last 5 plans: 01-04 (12 min), 01-05 (6 min), 01-06 (21 min), 03-01 (4 min, 2 tasks, 2 files), 03-02 (6 min, 2 tasks, 1 file)
- Trend: steady; 01-06 is the longest because it waits on three real CI runs and a three-Node local pre-flight. 03-01 and 03-02 are short because each writes one file and measures it locally — the expensive Phase 3 plans are 03-03 and 03-04, which wait on real `windows-latest` runs.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Review 2026-08-12]: A full-codebase review found the suite red on Node >= 25, `pnpm lint` never wired, and correctness/security defects shipping on macOS/Linux. Two hardening phases were prepended and the Windows phases renumbered 1-8 -> 3-10, so the port starts from a trustworthy CI signal. (The review's first diagnosis said Node >= 22; Phase 1 research corrected it to >= 25 — Node 25.0.0 unflagged Web Storage. The original wording made SIG-01 satisfiable without fixing anything.)
- [Review 2026-08-12]: Phase 2 is scoped to avoid the spawn path Phases 5-8 rewrite. Review items that live in that code (POSIX process-tree kill, temp plumbing, buffer bounds) were folded into Phases 4 and 8 instead of Phase 2.
- [Review 2026-08-12]: GSD has no "insert integer phase at the front" operation — `phase insert` only creates decimals and only `phase remove` renumbers. The renumber was done manually with explicit user authorization and verified with `validate consistency`.
- [Roadmap]: Phase 3 is a CI spike — prove the 7 LLRT primitives on `windows-latest` before writing any port code; results feed back before Phase 4.
- [Roadmap]: Critical path to the blocking must-have (Claude on Windows, PRV-01) = Phases 1->3->4->5->6 + the provider-spawn slice of Phase 7.
- [Roadmap]: CMP-01/CMP-02 are milestone invariants — every phase preserves macOS/Linux; POSIX launch path stays unchanged behind `os.platform()` guards.
- [01-06]: A CI claim is recorded with its run URL, per-leg conclusion, per-step conclusion and the log line proving the mechanism — never just a green tick. Phase 3's `windows-latest` spike reuses this pattern verbatim (scratch branch → push → `gh run view --json jobs` → delete).
- [01-06]: Version-discrimination proofs must assert the *negative* legs stay green. An all-red run discriminates nothing, which is why the `settings.ts` `let token: string;` lint fix was deliberately kept during the SIG-03f revert.
- [01-06]: Scratch branches pushed to the public `origin` use targeted `git add <path>`, never `git add -A` — an untracked local document at the repo root would otherwise be published. Branch names are `scratch/ci-proof-*` so a single glob confirms none survive.
- [Phase 03]: [03-01]: The probe's env-passthrough result records replace-vs-merge explicitly (darwin: the spawn env option REPLACED the parent block, child reported PATH-ABSENT), because Phases 4-8 cannot recover that from a bare PASS and it decides whether their spawn options must spread ...process.env.
- [Phase 03]: [03-01]: Probe output uses single emission — pass()/fail() only record, and the === Summary === block (iterating a frozen ASSERTION_IDS array) is the sole producer of PASS/FAIL lines, so a whole-file grep counts exactly 1 per ID and a never-reached assertion emits FAIL ... not reached instead of vanishing.
- [Phase 03]: [03-01]: CI-02 stays Pending until a real windows-latest run records all seven assertion lines (D-13). All five Phase 3 plans carry requirements: [CI-02], so the executor's default mark-complete after plan 1 of 5 was reverted — building the instrument is not proving the platform.
- [Phase 03]: [03-02]: The D-10 secret gate branches three ways on grep's status, not two — 0 (match) fails, 1 (clean) passes, and anything else including 2 (missing or unreadable target) fails. grep exits 2 on a renamed file, and an if/else routes that into the pass arm, green-lighting exactly the Phase 4-8 edit the gate exists to catch. Both target paths are additionally asserted with `test -f` before the scan, so a rename fails loudly rather than being inferred from an exit status.
- [Phase 03]: [03-02]: Every exact-count check over a file that is required to carry "why" comments must be anchored (`^[[:space:]]*key:`) or run over a comment-filtered stream. The workflow's mandated comments quote the very literals its checks count ("no branches filter", "`shell: bash` is mandatory", "`pnpm install --frozen-lockfile`", "keep `error`, not `warn`"), so the naive unanchored forms report a correct file as broken. `>=` threshold checks are left unanchored on purpose — a comment can only push a count above its threshold.
- [Phase 03]: [03-02]: The probe workflow declares `permissions: contents: read`, a deliberate divergence from ci.yml, which declares none and inherits the write-capable default on same-repo pushes. Artifact upload authenticates with ACTIONS_RUNTIME_TOKEN, so read-only should suffice; plan 03-03's real run is what confirms it. If `Upload probe results` fails on permissions, widen the block and re-run — do not delete the step.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet. Eleven items are parked in the ROADMAP backlog (999.1-999.11): nine from the 2026-08-12 review, plus 999.10 (type-check the test files) and 999.11 (repo-wide Prettier sweep, which collides with the Phase 5-8 spawn-path fence) found during Phase 1 research and planning.

### Blockers/Concerns

[Issues that affect future work]

- RESOLVED 2026-08-12 (plan 01-06): the test suite is no longer red on Node >= 25, and the blind spot that hid it is **proven** closed rather than assumed. The suite is green on all four majors on real CI — 23 files / 131 tests / 0 failed on Node 20.20.2, 22.23.1, 24.19.0 and 26.7.0 ([run 31605493233](https://github.com/six2dez/drift/actions/runs/31605493233)). The closure was verified by a revert-proof, not by a passing build: on a throwaway branch that removed *only* the `settings.ts` storage guard and the `vitest.setup.ts` shim, `Verify (Node 26)` went **red at the Test step** with the exact historical signature (5 failed in `ChatView.mount.test.ts` — four "expected 1 call, got 0" plus the `TypeError: Cannot read properties of undefined (reading 'getItem')`) while Node 20/22/24 stayed **green** ([run 31606402559](https://github.com/six2dez/drift/actions/runs/31606402559)). CI no longer hides the failure by pinning Node 20: the Node 26 leg is what catches it. Later phases can trust the validation signal.
- OPEN DECISION (user, outside git) — supersedes assumption A7, whose premise is **false**. A7 assumed branch protection on `main` required the old check name `Typecheck, test, build`, so the Phase 1 job rename would have left it matching nothing. Measured read-only on 2026-08-12 (plan 01-06 task 3): `GET repos/six2dez/drift/branches/main/protection` → **404 "Branch not protected"**, `GET repos/six2dez/drift/rulesets` → **`[]`**, `GET repos/six2dez/drift/branches/main` → `protected: false`. There is no required-check name to update — `main` has **no** classic protection and **no** rulesets, so it was never merge-guarded and the rename broke nothing. The real gap is therefore a *new* decision, not a rename cleanup: **should `main` get branch protection at all?** If yes, the four required-check names to use are `Verify (Node 20)`, `Verify (Node 22)`, `Verify (Node 24)`, `Verify (Node 26)` — all four now proven to run and pass on a real push ([run 31605493233](https://github.com/six2dez/drift/actions/runs/31605493233)). Not actioned: creating protection was outside plan 01-06's authorization.
- `check_scope` is wrong in both directions for real Caido glob scope patterns (verified). Users can act on bad in-scope/out-of-scope answers until Phase 2 ships.
- LLRT `spawn({env})` env-passthrough on Windows is unverified (P0 risk). Phase 3 resolves it; if it fails, the documented fallback is a minimal `.cmd` launcher that `set`s env vars.
- Gemini-on-Windows MCP reliability has open upstream issues — treat as best-effort, gate Phase 7 on a real-machine check. Codex `${VAR}` expansion in `mcp add` needs CI confirmation.
- RESOLVED 2026-08-12: the requirement-count discrepancy ("22 v1 requirements" vs 24 enumerated) is reconciled — REQUIREMENTS.md now enumerates and maps 43.
- RESOLVED 2026-08-13 (quick 260813-dc7): Phase 01 verification gap G1 (SIG-01h) is closed. `readBrowserStorageItem()` was mutation-survivable in the forwarding direction — no test drove a *present* token through it, so a regression killing Caido token pickup would have shipped green. Three append-only cases added to `settings.test.ts` (forwarding, JSON-parse failure, non-string `getItem`). Falsifiability proven, not assumed: with `if (key !== "__never__") return undefined;` at `settings.ts:35` the suite reports **2 failed / 11 passed** (Test C survives by design); mutation reverted and confirmed byte-identical. Suite 131 → **134 tests**, lint still 0/0.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260813-dc7 | Close the SIG-01h forwarding gap — make the storage guard falsifiable, correct 01-VALIDATION.md | 2026-08-13 | 6d1943d | [260813-dc7-add-a-settings-test-ts-case-driving-a-pr](./quick/260813-dc7-add-a-settings-test-ts-case-driving-a-pr/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Hardening | HRD-01: explicit `icacls` ACL hardening of Windows temp dir | v2 | 2026-06-26 |
| Hardening | HRD-02: expanded Windows-specific diagnostics / support-bundle fields | v2 | 2026-06-26 |
| Packaging | PKG-01: Windows installer/packaging niceties (signed MSI, winget) | v2 | 2026-06-26 |
| Architecture | Event-driven `sendCliMessage` refactor — collides with Phases 5/8 | backlog 999.1 | 2026-08-12 |
| Features | Scope gate, response-body search, finding-from-chat, request view mode, and other review features | backlog 999.2-999.9 | 2026-08-12 |

## Session Continuity

Last session: 2026-08-13T12:47:30.000Z
Stopped at: Completed 03-02-PLAN.md
Resume file: .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-03-PLAN.md

**Still untracked:** `IMPROVEMENT-PLAN.md` at the repo root — the June 2026 review document, now fully absorbed into this roadmap. Plan `01-06` did **not** commit or delete it (it is a user file outside that plan's `files_modified`). Instead 01-06 used targeted `git add <path>` rather than `git add -A` on every scratch branch, so the file was never staged and never pushed to the public remote. Its literal "`git status --porcelain` is empty" assertions were satisfied in the path-scoped form. **Decide before the next phase:** commit it, delete it, or add it to `.gitignore` — a bare `git add -A` anywhere would otherwise publish it.
