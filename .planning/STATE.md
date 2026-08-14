---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 04-04 (activity-tail.ts + activity-tail.test.ts); next: 04-05"
last_updated: "2026-08-14T12:53:17.834Z"
last_activity: 2026-08-14 -- 04-04 complete (PERF-02 activity-tail.ts offset cursor + byte-safe partial line + 20-case activity-tail.test.ts)
progress:
  total_phases: 21
  completed_phases: 2
  total_plans: 22
  completed_plans: 15
  percent: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-26)

**Core value:** The user's local AI CLI must reliably start, attach to Caido via the MCP server, and run tools against live Caido data — on native Windows as well as macOS/Linux.
**Current focus:** Phase 4 — Platform Foundation

## Current Position

Phase: 4 (Platform Foundation) — EXECUTING
Plan: 5 of 11
Status: Executing Phase 4
Last activity: 2026-08-14 -- 04-04 complete (PERF-02 activity-tail.ts offset cursor + byte-safe partial line + 20-case activity-tail.test.ts)

Progress: [██░░░░░░░░] 20% (2 of 10 milestone phases)

## Performance Metrics

**Velocity:**

- Total plans completed: 19 (plus 1 quick task)
- Average duration: ~10 min
- Total execution time: ~2.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 6 | - | - |
| 03 | 5 | - | - |
| 04 | 4 of 11 | - | - |

**Recent Trend:**

- Last 5 plans: 03-05 (8 min, 2 tasks, 2 files, 0 CI runs — evidence transcription only), 04-01 (10 min, 2 tasks, 2 files, 0 CI runs — a pure module and its unit tests, verified entirely locally), 04-02 (7 min, 2 tasks, 2 files, 0 CI runs — same shape as 04-01, and faster because the pure-module + sibling-test pattern was already established), 04-03 (9 min, 2 tasks + 1 legibility fix, 2 files, 0 CI runs — the third pure-module plan in a row; the extra 2 min went on the mandated manual read of the rendered failure message, which is what found the fix), 04-04 (7 min, 2 tasks, 2 files, 0 CI runs — the fourth pure-module plan in a row and the fastest yet; the only new work was the byte-level UTF-8 reasoning, and both tasks passed their own verify on the first run)
- Trend: steady; 01-06 is the longest (21 min) because it waits on three real CI runs and a three-Node local pre-flight. 03-03 came in at 9 min despite needing two real `windows-latest` runs — the Windows probe job completes in 16-18s, so the CI wait is far cheaper than the ubuntu matrix. 03-04 waited on four runs (2 Windows probe + 2 ubuntu matrix) and still finished in 11 min for the same reason. 03-05 burned no runner at all: it only re-queried the six existing run records and transcribed their measured output.

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
- [Phase 03]: [03-02]: The probe workflow declares `permissions: contents: read`, a deliberate divergence from ci.yml, which declares none and inherits the write-capable default on same-repo pushes. Artifact upload authenticates with ACTIONS_RUNTIME_TOKEN, so read-only should suffice; plan 03-03's real run is what confirms it. If `Upload probe results` fails on permissions, widen the block and re-run — do not delete the step. **CONFIRMED 2026-08-13 (03-03):** `Upload probe results` concluded `success` under `contents: read` on [run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047); the block did not need widening.
- [Phase 03]: [03-03]: `actions/setup-node@v5` defaults `package-manager-cache: true` and auto-enables dependency caching from `package.json`'s `packageManager` field, then shells out to the named package manager — so any Windows job in this repo without a `pnpm/action-setup` step dies at `Setup Node` with `Unable to locate executable file: pnpm`. `ci.yml` is not a counter-example: it runs `pnpm/action-setup@v6` first. The input is new in `@v5` (under `@v4` caching was opt-in via `cache:` alone), so static review against `ci.yml` cannot catch this. The probe workflow sets `package-manager-cache: false` rather than adding a pnpm step, preserving its zero-dependency design.
- [Phase 03]: [03-03]: On Windows the spawn `env` option does NOT clear `PATH` (child reported `PATH-VISIBLE`), the opposite of the darwin measurement (`PATH-ABSENT`). The mechanism is NOT a merge: libuv `src/win/process.c` `make_program_env()` back-fills exactly eleven `required_vars` from the parent when absent — `HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR`. `APPDATA` and `LOCALAPPDATA` are **not** on that list, and those are exactly the variables `command-resolution.ts` needs for the Windows nvm/fnm paths. Phases 4-8 must still spread `...process.env` (or name variables explicitly) for anything outside the eleven; the probe's own "need not spread" wording over-generalises the measurement.
- [Phase 03]: [03-03]: `os.tmpdir()` on the runner returned the 8.3 short form `C:\Users\RUNNER~1\AppData\Local\Temp` while `USERPROFILE` returned the long form `C:\Users\runneradmin`. Both valid, both on disk, not string-comparable — Phase 4-8 code comparing a temp path against a profile-derived path must normalise first.
- [Phase 03]: [03-03]: `gh run view --log` prefixes every line with `<job>\t<step>\t<timestamp>`, and BSD `sed` does not interpret `\t` in a character class, so `sed -E 's/^[^\t]*\t[^\t]*\t//'` is a silent no-op on macOS and the following anchored grep returns nothing — indistinguishable from a proof that failed. Strip the prefix with `cut -f3-` (tab is cut's default delimiter) and set `LC_ALL=C` for multi-byte content. This is `[01-06]` issue 2 recurring in a new form. **CORRECTED 2026-08-13 (03-04):** `cut -f3-` alone is still incomplete — the timestamp is separated from the content by a *space*, not a tab, so it is part of field 3 and survives the cut, and an anchored grep still returns 0. BSD `sed` also does not interpret `\x1b`, so the ANSI strip is a second silent no-op. The full working form is `cut -f3- | perl -pe 's/\x1b\[[0-9;]*m//g' | perl -pe 's/^\d{4}-\d{2}-\d{2}T[\d:.]+Z //'`. Third recurrence of the same class in three plans — **the durable rule is to validate any log-extraction pipeline against an independently-known nonzero expected count before trusting its result.**
- [Phase 03]: [03-04]: Falsifying two gates that sit in the same job requires two commits, not one. The D-10 gate step (4) precedes the probe step (5), and a GitHub Actions step with no `if:` defaults to `if: success()`, so a single commit carrying both defects fails at the gate and SKIPS the probe — destroying the probe-exit-path proof, which needs the failing step to be `Run LLRT Windows primitive probe` specifically. Both negative branches were cut from the same baseline `0a05174`, never from each other. Measured, not predicted: the gate-negative run shows that skip directly.
- [Phase 03]: [03-04]: Deliberate-defect mutations are made only AFTER switching to a throwaway branch, so the defect never exists in a commit on the working branch by construction and the "revert" is a branch switch. Net-zero is then proven by comparing each file's blob hash on the working branch against the value recorded before the edit, backed by a marker `grep -c` returning 0 — never by eyeballing a restore. Both mutations here were destroyed with their branches and survive only in the run records.
- [Phase 03]: [03-04]: A deliberate defect pushed to a PUBLIC remote must be self-labelling in the artefact a later reader will actually see. The probe mutation targeted P0-TMP rather than P0-ENV because D-05 makes a `FAIL [P0-ENV]` line a project-stopping blocker and a fabricated one in a permanent run record is a trap. The D-10 canary was a YAML comment naming a nonexistent secret and containing the literal `CANARY` plus the plan number, so the text the gate quotes into the public log announces itself — a Caido-token-shaped string was deliberately not used because that is the shape a reader would mistake for a real leak.
- [Phase 03]: [03-04]: `if: always()` on an upload step is only provable on a RED run — on a green run an unconditional upload and a conditional one are indistinguishable. `if-no-files-found: error` is only provable when the results file is genuinely absent. The two need different runs and neither can be demonstrated by the run that produced the positive result.
- [Phase 03]: [03-05]: P1-CMD returned the `spawn-threw-sync` / `EINVAL` surface on `windows-latest` — Node's CVE-2024-27980 guard refuses a direct `.cmd` spawn and throws **synchronously**, so a `try`/`catch` around the `spawn()` call itself is required, not just an `error`-event handler. Phases 4-8 must route every `.cmd`/`.bat` target through `spawn("cmd.exe", ["/c", target, ...args])` behind an `os.platform() === "win32"` guard (CMP-01/CMP-02 keep the POSIX path untouched). This lands directly on `command-resolution.ts`, whose Windows nvm/fnm candidates are `.cmd` shims. Canonical citable source — the CI artifacts expire 2026-09-12 and cannot be cited from a PLAN.md: `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md`.
- [Phase 03]: [03-05]: `.github/workflows/windows-llrt-probe.yml` and `scripts/windows-llrt-probe.mjs` are **deleted in Phase 9** when CI-01 lands the permanent `windows-latest` regression job (D-02) — explicit debt with a due date. The one property that must survive the deletion is the **D-10 no-secret-material gate** (three-branch `grep`: status 0 = match fails, status 1 = clean passes, anything else including a missing or unreadable target fails), the only part of Phase 3 observed to bite ([run 31703717548](https://github.com/six2dez/drift/actions/runs/31703717548)) and the only part Phases 4-8 depend on silently. Phase 9's replacement job must carry it forward rather than drop it.
- [Phase 03]: [03-04]: `git ls-remote --heads origin 'scratch/*'` exits **0 whether or not the glob matched**, so a bare `echo "empty=$?"` after it prints 0 even with every scratch branch still alive on the public remote. Teardown must capture the output into a variable and discriminate with `test -z`, and must record the full *unfiltered* `git ls-remote --heads origin` listing alongside it so an empty match is provably empty rather than a mistyped pattern. The same `test -z` form applies to `git status --porcelain`, which also exits 0 regardless of what it printed.
- [Phase 04]: [04-01]: platform.ts imports NOTHING — not os (D-02 keeps the single read in index.ts), not path (POSIX-flavoured on the Linux runner, so it cannot strip a Windows trailing backslash). `grep -c '^import'` returning 0 IS SC-1's no-I/O claim in mechanically checkable form; an unused import would also fail noUnusedLocals (TS6133) and eslint --max-warnings 0, breaking the task's own verify.
- [Phase 04]: [04-01]: RUN-03/CMP-02/RUN-05 were NOT marked complete after this plan. Plans 04-08 and 04-11 carry the same ids, index.ts still hardcodes /tmp at :337/:1681/:1685/:1716, and no runtime probe exists yet — building the instrument is not shipping the behaviour. Same call Phase 3 made for CI-02 after plan 1 of 5.
- [Phase 04]: [04-01]: getTempRoot accepts platform but deliberately does not branch on it — the runtime, not the OS, decides the separator shape (LLRT's GetTempPath2 tmpdir ends in a backslash; Node has stripped separators since v2.0.0). The strip is explicit string logic guarding "/" and "C:\\", because path.normalize is a POSIX no-op on the test runner exactly where win32 needs it.
- [Phase 04]: [04-02]: fs-retry.ts imports nothing and does no I/O — the sleep is an INJECTED parameter, which is the only way SC-3's ladder is assertable: a real Defender lock cannot be induced deterministically on any CI runner, so the proof is reading back what the orchestrator asked to sleep for ([50,100] on success at the third attempt, the full [50,100,200,400,750] on give-up).
- [Phase 04]: [04-02]: RUN-04 was NOT marked complete. withFsRetry has zero production call sites — plans 04-08 (which wraps the real mkdir+writeFile at index.ts:1717-1720) and 04-11 carry the same id. Same call 04-01 made for RUN-03/CMP-02/RUN-05 and Phase 3 made for CI-02: building the instrument is not shipping the behaviour.
- [Phase 04]: [04-02]: The transient-FS set is an allow-list (EPERM/EBUSY/EACCES/UNKNOWN, from libuv src/win/error.c), never a deny-list. ENOSPC and EROFS are excluded on purpose so a full or read-only volume produces an honest error immediately instead of a 1.5 s stall on every MCP start (T-04-11); ENOENT is excluded because a missing parent is a real bug.
- [Phase 04]: [04-03]: runtime-probe.ts imports exactly one thing — path — and the grep pair that proves it (^import returns 1, ^import path from "path";$ returns 1) IS the D-02 claim in mechanical form. No os (the single read stays in index.ts so an LLRT gap is a loud MCP-start error, not a module-evaluation throw that kills the whole plugin), no fs (normalizePathForCompare's rungs are INJECTED because that surface is unproven under LLRT), no ./platform (raw strings and booleans only, which is what let it build in the same wave as platform.ts).
- [Phase 04]: [04-03]: The probe report distinguishes 'not probed' from 'absent' by construction. Plan 04-08 cannot probe realpath ladder rung 1 at all — that needs a module-scope bare "fs" import which is not source-verified for Caido's LLRT and would kill the plugin at load — so buildProbeReport takes a realpathRungNote carrying the weaker claim verbatim, and a test forbids the word 'absent' in that detail. A report written to be pasted into a public bug report must never assert a measurement Drift did not make.
- [Phase 04]: [04-03]: RUN-05 was NOT marked complete. All eight runtime-probe.ts exports have zero production call sites; index.ts has no probe, no os import, and nothing fails loud at MCP start yet. Plans 04-08 and 04-11 carry the same id. Third consecutive Phase 4 plan making this call after 04-01 (RUN-03/CMP-02/RUN-05) and 04-02 (RUN-04), matching Phase 3's CI-02 precedent.
- [Phase 04]: [04-04]: activity-tail.ts deliberately owns its own open/stat/read/close with `open` INJECTED, breaking the phase's 'all I/O stays in index.ts' rule. index.ts has zero direct test coverage and 04-VALIDATION.md grades the truncation-reset and no-new-bytes rows as INTEGRATION tests against a real file, so owning the I/O in a testable module is the only thing that makes those two rows provable at all. The pure decisions (planActivityRead, consumeActivityChunk) are still separately exported and separately tested. Do not 'fix' this back into index.ts.
- [Phase 04]: [04-04]: The activity cursor's `partial` is a Buffer, never a string — the ONE field of the claude-print.ts analog (`buffer: string`, :90) that must not be copied. JSON.stringify does not escape non-ASCII, so a read boundary landing inside an em-dash, an IDN hostname or a non-ASCII response snippet bakes a permanent U+FFFD if the remainder is decoded per chunk. The -t "utf-8" case asserts the naive string decode IS lossy at the chosen index BEFORE asserting the Buffer carry is not, so it cannot pass vacuously.
- [Phase 04]: [04-04]: Two ceilings, not one. ACTIVITY_MAX_TICK_BYTES (1 MiB) clamps a single allocation; ACTIVITY_PARTIAL_MAX_BYTES (4 MiB) clamps a remainder that accumulates ACROSS ticks — 100 ticks of 1 MiB still reach 100 MiB in cursor.partial. Same value and same drop-whole-and-count policy as plan 04-06's CLAUDE_LINE_BUFFER_MAX_CHARS, deliberately: identical hazard shape, identical answer. The intended asymmetry is that 04-06 counts UTF-16 code units (string buffer) while this counts bytes (Buffer remainder). Do not merge them.
- [Phase 04]: [04-04]: PERF-02 was NOT marked complete. index.ts:2158 still readFile()s the whole growing activity file every 250 ms and all eight activity-tail.ts exports have zero production call sites; 04-08 carries the integration. Fourth consecutive Phase 4 plan making this call after 04-01 (RUN-03/CMP-02/RUN-05), 04-02 (RUN-04) and 04-03 (RUN-05), matching Phase 3's CI-02 precedent.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet. Eleven items are parked in the ROADMAP backlog (999.1-999.11): nine from the 2026-08-12 review, plus 999.10 (type-check the test files) and 999.11 (repo-wide Prettier sweep, which collides with the Phase 5-8 spawn-path fence) found during Phase 1 research and planning.

### Blockers/Concerns

[Issues that affect future work]

- RESOLVED 2026-08-12 (plan 01-06): the test suite is no longer red on Node >= 25, and the blind spot that hid it is **proven** closed rather than assumed. The suite is green on all four majors on real CI — 23 files / 131 tests / 0 failed on Node 20.20.2, 22.23.1, 24.19.0 and 26.7.0 ([run 31605493233](https://github.com/six2dez/drift/actions/runs/31605493233)). The closure was verified by a revert-proof, not by a passing build: on a throwaway branch that removed *only* the `settings.ts` storage guard and the `vitest.setup.ts` shim, `Verify (Node 26)` went **red at the Test step** with the exact historical signature (5 failed in `ChatView.mount.test.ts` — four "expected 1 call, got 0" plus the `TypeError: Cannot read properties of undefined (reading 'getItem')`) while Node 20/22/24 stayed **green** ([run 31606402559](https://github.com/six2dez/drift/actions/runs/31606402559)). CI no longer hides the failure by pinning Node 20: the Node 26 leg is what catches it. Later phases can trust the validation signal.
- OPEN DECISION (user, outside git) — supersedes assumption A7, whose premise is **false**. A7 assumed branch protection on `main` required the old check name `Typecheck, test, build`, so the Phase 1 job rename would have left it matching nothing. Measured read-only on 2026-08-12 (plan 01-06 task 3): `GET repos/six2dez/drift/branches/main/protection` → **404 "Branch not protected"**, `GET repos/six2dez/drift/rulesets` → **`[]`**, `GET repos/six2dez/drift/branches/main` → `protected: false`. There is no required-check name to update — `main` has **no** classic protection and **no** rulesets, so it was never merge-guarded and the rename broke nothing. The real gap is therefore a *new* decision, not a rename cleanup: **should `main` get branch protection at all?** If yes, the four required-check names to use are `Verify (Node 20)`, `Verify (Node 22)`, `Verify (Node 24)`, `Verify (Node 26)` — all four now proven to run and pass on a real push ([run 31605493233](https://github.com/six2dez/drift/actions/runs/31605493233)). Not actioned: creating protection was outside plan 01-06's authorization.
- `check_scope` is wrong in both directions for real Caido glob scope patterns (verified). Users can act on bad in-scope/out-of-scope answers until Phase 2 ships.
- RESOLVED 2026-08-13 (plan 03-05): Windows `spawn` **env-passthrough** — `spawn(node, [script], { env })` — is **proven** on a real `windows-latest` host ([run 31702392047](https://github.com/six2dez/drift/actions/runs/31702392047), Windows Server 2025 / 10.0.26100, Node v24.18.1; measured in plan 03-03, verdict recorded here). Verbatim: `PASS [P0-ENV]: child received SENTINEL=drift-probe-sentinel-1786625796867 through the spawn env option; that option merged into the parent environment (child reported PATH-VISIBLE)`. **Replace-versus-merge, the detail Phase 4 actually builds against:** the `env` option *replaces* on both platforms; what differs is a Windows-only libuv back-fill of exactly eleven `required_vars` (`HOMEDRIVE, HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN, USERNAME, USERPROFILE, WINDIR`), which is why the child saw `PATH-VISIBLE` here and `PATH-ABSENT` on darwin. **CONFIRMED BY MEASUREMENT 2026-08-14:** the quoted line above is from the original probe, whose discriminator read `PATH` — one of the eleven back-filled names — and so could never have distinguished replace from merge (`03-REVIEW.md` CR-01). The corrected probe reads a parent-only marker outside the eleven and returned **`PARENT-CLEARED`** on `windows-latest` ([run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574)): `PASS [P0-ENV]: … measured on win32, that option replaced the parent environment (parent-only marker PARENT-CLEARED; PATH PATH-VISIBLE, which is back-filled on Windows and therefore not evidence)`. The "replaces on both platforms" reading — previously source analysis — is now measured on both. `APPDATA` and `LOCALAPPDATA` are **not** on that list — exactly what `command-resolution.ts` needs for the Windows nvm/fnm paths — so Phase 4 must pass `{ ...process.env, ...driftVars }`, never `{ ...driftVars }`. The `.cmd`-launcher fallback named in the original entry is therefore **not required** for env injection. Vehicle caveat: Node, not LLRT — faithful for this assertion because LLRT's `child_process` reaches the same Windows `CreateProcess` through `tokio::process::Command` and its `env` option has no Windows-specific branch. Canonical verdict, all seven assertions with verbatim lines, run URLs and both falsifiability proofs: `03-FINDINGS.md`.
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

Last session: 2026-08-14T12:53:17.829Z
Stopped at: Completed 04-04 (activity-tail.ts + activity-tail.test.ts); next: 04-05
Resume file: .planning/phases/04-platform-foundation/04-05-PLAN.md

**Live on the public remote: nothing of ours.** Plan 03-04 tore down all three `scratch/*` branches (`ci-proof-windows-probe`, `ci-proof-windows-probe-negative`, `ci-proof-windows-gate-negative`) locally and remotely. Asserted with a `test -z` discrimination over the captured glob (`scratch-glob-empty=0`) plus the full unfiltered listing, which now shows only `main` at `2d8cf16` and the pre-existing, unrelated `fix/security-hotfixes` at `0cd81f3`. `origin/main` was never pushed by this phase and is still `2d8cf16`; local `main` is 23 commits ahead and deliberately unpushed. **Re-verified 2026-08-13 (plan 03-05):** the remote still lists only `main` `2d8cf16` and the pre-existing `fix/security-hotfixes` `0cd81f3`, and all eight Phase 3 run records (4 probe + 4 `CI` control) still resolve with their recorded conclusions — which is what makes the URLs in `03-FINDINGS.md` valid citations after the branches were deleted. The probe **artifacts** do not survive: they expire 2026-09-12, which is why D-11 required the committed findings document.

**Still untracked:** `IMPROVEMENT-PLAN.md` at the repo root — the June 2026 review document, now fully absorbed into this roadmap. Plan `01-06` did **not** commit or delete it (it is a user file outside that plan's `files_modified`). Instead 01-06 used targeted `git add <path>` rather than `git add -A` on every scratch branch, so the file was never staged and never pushed to the public remote. Its literal "`git status --porcelain` is empty" assertions were satisfied in the path-scoped form. **Decide before the next phase:** commit it, delete it, or add it to `.gitignore` — a bare `git add -A` anywhere would otherwise publish it.
