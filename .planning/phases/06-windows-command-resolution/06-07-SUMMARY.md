---
phase: 06-windows-command-resolution
plan: 07
subsystem: ux-copy
tags: [help-panel, shared-package, vue, phase-gate, evidence, windows, ux-02]

requires:
  - phase: 06-windows-command-resolution
    plan: 06
    provides: "`PROVIDER_INSTALL_COMMANDS`, `ProviderInstallCommands` and `CLI_PROVIDER_DISPLAY_NAMES` exported from `packages/shared/src/cli-providers.ts` through the existing barrel — the table this plan renders the help panel from"
  - phase: 06-windows-command-resolution
    plan: 05
    provides: "the corrected `platform.ts` / `command-resolution.ts` / `runtime-probe.ts` comment sites this plan's phase-wide gate verifies by search"
  - phase: 05-kill-shell-wrappers
    provides: "the blocking `Verify (Windows)` CI leg on `windows-latest`, without which this plan's second evidence gate could not be satisfied (T-06-20's precondition)"
provides:
  - "`HelpView.vue`'s install-command list rendered from `PROVIDER_INSTALL_COMMANDS` via a `v-for` over the `CliProvider` union — D-15's frontend half, closing the second and last live surface that could lie to a user mid-session"
  - "Zero occurrences of the archived `gh` extension Copilot command anywhere in the repository outside `CHANGELOG.md`, which is a historical record and was not retro-edited"
  - "A README configuration sentence that names the Windows probed set in summary form and points at the source for the catalogue, rather than duplicating it"
  - "Phase-close evidence: both CI legs green on the phase HEAD, cited by job name and run identifier; all four stale in-repo comments verified corrected by search; all five scope fences verified intact"
affects: [phase-07-launch, phase-09-real-machine, phase-10-ux]

actuals:
  tokens: 1187
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A static help surface renders BOTH platform arms, labelled, rather than branching: the panel has no platform value available to it, so showing both is the honest answer and the same union-when-unknown rule this phase applies at five other sites."
    - "Rendering a user-facing list by iterating the domain union (`Object.values(CliProvider)`) rather than hand-listing its members — hand-listing would preserve exactly the drift the shared table exists to remove."
    - "Prose that would duplicate a sourced catalogue points at the source instead. The README names the Windows probe set in three summary phrases and defers to `command-resolution.ts`, where every row carries its own citation."
    - "A phase-close evidence gate that re-checks by SEARCH what earlier plans claimed to have corrected, and reports the search's own defects rather than adjusting the search until it passes."

key-files:
  created: []
  modified:
    - packages/frontend/src/views/HelpView.vue
    - README.md

key-decisions:
  - "The plan's repository-wide absence gate is MALFORMED and is reported as failing-as-written rather than silently corrected. Its filter is `grep -v '^./.planning'`, but `grep -rl <pat> .` on this host emits paths with no `./` prefix, so the anchor never matches and nine `.planning` files leak into the output. The underlying property the gate exists to prove IS satisfied — both the corrected-anchor form (`^\\.planning`) and a `git grep` over tracked files output exactly `CHANGELOG.md`. Both forms are recorded below so a reader can tell a gate defect from a repository defect."
  - "06-06's inherited conclusion — that scoping the check to `packages/**` keeps CHANGELOG.md as its sole hit — is INCORRECT as worded, and was caught by running it rather than trusting it. `CHANGELOG.md` sits at the repository root, not under `packages/`, so scoping to `packages/**` yields ZERO hits and would prove nothing about the changelog. The correct fence is the corrected-anchor or tracked-files form."
  - "06-06's inherited note that `packages/*/dist/index.js` carries the deprecated string is now MOOT rather than merely true-or-false: after T-06-19 and a rebuild the frontend bundle carries `@github/copilot` twice and the archived command zero times. The gitignore half of the note was verified independently and holds (`git check-ignore` resolves to `.gitignore:2:dist/`)."
  - "The help panel's platform labels are rendered with the file's existing class vocabulary only. `HelpView.vue` uses exactly two surface text colours; introducing a third for the labels would have been a redesign, and the plan scoped this to a data-source change."
  - "The CI evidence was produced by pushing a `scratch/ci-06-07-phase-close` branch at the phase HEAD — the same mechanism Phase 5 used for its Windows proof. `main` is 198 commits ahead of `origin/main`, so no CI run existed for ANY Phase 6 commit before this; citing an older run would have cited evidence that never saw this phase's code."

patterns-established:
  - "Report a gate's literal result AND the corrected form, side by side, when the gate text is at fault. Adjusting the gate until it passes and reporting only the pass destroys the reader's ability to distinguish a bad gate from a bad repository."
  - "Verify an inherited finding by re-running it, not by restating it. Two of the three findings 06-06 handed forward changed status when actually executed: one was moot, one was incorrect as worded."
  - "Prove a zero-returning comment gate is non-vacuous by positively locating the CORRECTED comment at each of the four sites. A deleted comment and a corrected comment both return 0."

requirements-completed: [UX-02]

coverage:
  - id: D1
    description: "The frontend help panel renders its install-command list from the shared table, so it cannot drift from the backend error banner"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "grep -Ec 'from \"shared\"' packages/frontend/src/views/HelpView.vue returns 1; grep -Ec 'CLI_PROVIDER_DISPLAY_NAMES' returns 2 (import + use); grep -Ec 'v-for' returns 1"
        status: pass
      - kind: other
        ref: "grep -Ec 'npm install -g|claude.ai/install|install.ps1' packages/frontend/src/views/HelpView.vue returns 0 — no install command is hardcoded in the view"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck exits 0 (vue-tsc resolves PROVIDER_INSTALL_COMMANDS[providerId] against the Record<CliProvider, ...> keying); pnpm build exits 0 and the rebuilt frontend bundle contains '@github/copilot' twice"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adding a fifth provider to the shared union reaches this list with no edit to HelpView.vue"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "The list is `Object.values(CliProvider).map(...)` rendered by one v-for; no provider id, display name or command literal appears in the view. Verified by the three greps in D1 plus reading the block."
        status: pass
    human_judgment: false
  - id: D3
    description: "The archived Copilot extension command appears in no source file under any package and in no user-facing document, while CHANGELOG.md's historical entry is untouched"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "Corrected-anchor form: grep -rl 'gh extension install' --include='*.ts' --include='*.vue' --include='*.mjs' --include='*.md' . | grep -v node_modules | grep -v '^\\.planning' outputs exactly CHANGELOG.md"
        status: pass
      - kind: other
        ref: "Tracked-files form: git grep -l 'gh extension install' -- . ':(exclude).planning' outputs exactly CHANGELOG.md"
        status: pass
      - kind: other
        ref: "git diff --name-only CHANGELOG.md and git diff HEAD --name-only CHANGELOG.md are both empty; grep -c 'gh extension install' CHANGELOG.md still returns 1"
        status: pass
      - kind: other
        ref: "grep -rn 'gh extension install' packages/frontend/src returns 0 lines"
        status: pass
    human_judgment: false
  - id: D4
    description: "All four in-repo comments this phase makes false are corrected in place, verified by search rather than by assertion"
    verification:
      - kind: other
        ref: "grep -c 'belongs to Phase 6' command-resolution.ts = 0; grep -c 'NOT implemented here' platform.ts = 0; grep -c 'which this phase does not touch' platform.ts = 0; grep -c 'Phase 6 compares exactly those' runtime-probe.ts = 0"
        status: pass
      - kind: other
        ref: "Non-vacuity: all three files present (1041 / 568 / 721 lines) and the CORRECTED comment located at each site — command-resolution.ts:240 now describes the recognised Windows profile shape, platform.ts:432 now reads 'Phase 6 wires this function to that module's callers', platform.ts:300 hands cmd.exe routing to Phase 7, runtime-probe.ts:677 carries the preserved export"
        status: pass
    human_judgment: false
  - id: D5
    description: "The five scope fences this phase drew still hold at phase close"
    verification:
      - kind: other
        ref: "windowsHide: 0 occurrences under packages/*/src and packages/backend/assets, while three UX-04 / Phase 10 marker comments exist (index.ts:180, :1601, :1607)"
        status: pass
      - kind: other
        ref: "Nothing claims .cmd is launchable: command-resolution.ts:527 reads 'making it launchable is PRV-02 in Phase 7'; index.ts:2607-2610 marks the seam for PRV-02 without implementing it"
        status: pass
      - kind: other
        ref: "grep -Eci 'ExecutionPolicy' returns 0 across packages/*/src and 0 in README.md; the UX-03 rejection is recorded at index.ts:185 and cli-providers.ts:81"
        status: pass
      - kind: other
        ref: "No binary-path-picker work: grep -rn 'UX-01' packages/*/src returns nothing, and no picker validation code was added"
        status: pass
      - kind: other
        ref: "D-07 preserved export: grep -Ec 'export async function normalizePathForCompare' runtime-probe.ts returns 1 and grep -rc 'normalizePathForCompare' index.ts returns 0; grep -c '^import' platform.ts returns 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "The full suite, the workspace typecheck, the lint gate and the build are green on BOTH continuous-integration legs before the phase is claimed complete"
    verification:
      - kind: unit
        ref: "Local: pnpm exec vitest run — 408 passed across 31 files; pnpm -r typecheck exit 0; pnpm lint exit 0 (--max-warnings 0); pnpm build exit 0"
        status: pass
      - kind: integration
        ref: "CI run 32481129011 @ 3f7c7b3816c0cdd3b8936afdcccc723cb1591151 — job 'Verify (Windows)' (windows-latest, job id 96767522062) success, Test step reporting '31 passed (31) / 408 passed (408)'"
        status: pass
      - kind: integration
        ref: "CI run 32481129011 — jobs 'Verify (Node 20)' 96767522331, 'Verify (Node 22)' 96767522176, 'Verify (Node 24)' 96767522152, 'Verify (Node 26)' 96767522262, all success"
        status: pass
    human_judgment: false
  - id: D7
    description: "The deferred README Copilot edit is closed as a verified no-op rather than left looking undone"
    verification:
      - kind: other
        ref: "grep -ci in README.md returns 0 for each of 'gh extension install', 'gh extension', 'gh-copilot' and 'gh copilot' — the README never named the deprecated command"
        status: pass
    human_judgment: false
  - id: D8
    description: "The README's probed-locations sentence is accurate on Windows, and no Windows install/prerequisite section or execution-policy caveat was pulled forward"
    verification:
      - kind: other
        ref: "README.md:38 contains 1 case-insensitive 'windows' hit inside the CLI Providers paragraph; the heading count is 19 before and 19 after (grep -c '^#'); grep -Eci 'ExecutionPolicy' README.md returns 0"
        status: pass
    human_judgment: false
  - id: D9
    description: "A Windows user reading the in-app help panel can actually run the commands it shows, on a real Windows machine"
    verification: []
    human_judgment: true
    rationale: "Cannot be executed here or in CI. The maintainer has no Windows machine (PROJECT.md § Constraints), and the windows-latest leg builds and tests the plugin rather than running a third-party CLI install. Every command carries a first-party citation in `packages/shared/src/cli-providers.ts`, but whether each vendor's install block still leads with that form on the day a user reads the panel closes only on the Phase 9/10 real-machine report."

duration: 12min
completed: 2026-08-21
status: complete
---

# Phase 06 Plan 07: The Help Panel Joins the Error Banner, and the Phase Closes on Search Results Summary

**Drift's in-app help panel now renders its install commands from the same shared table the backend error banner does — closing the second and last surface that could lie to a user mid-session — and the phase closes on gates that were run, including two inherited findings that changed status when actually executed.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-21T12:10:32Z
- **Completed:** 2026-08-21T12:22:30Z
- **Tasks:** 2 (2 commits)
- **Files modified:** 2

## Accomplishments

- **D-15 is complete.** `HelpView.vue`'s four hand-written install items are now one `v-for` over `Object.values(CliProvider)`, reading `PROVIDER_INSTALL_COMMANDS` and `CLI_PROVIDER_DISPLAY_NAMES` from `shared` with the bare specifier the frontend already uses. The panel and the error banner render the same data, so a command corrected in one can no longer go stale in the other. The union is iterated rather than its four members hand-listed — hand-listing would have preserved exactly the drift the table exists to remove.
- **The archived Copilot command is gone from the repository except where it belongs.** `HelpView.vue:221` was its last live home outside the changelog. Both the corrected-anchor grep and a `git grep` over tracked files now output exactly one path: `CHANGELOG.md`, which records what version 0.1.0 shipped and was not retro-edited (`git diff --name-only CHANGELOG.md` empty; its single hit intact). The rebuilt frontend bundle confirms the change reached the artifact: `@github/copilot` twice, the archived command zero times.
- **The panel shows both platform arms, labelled, and one command where they are equal.** Claude is the only provider whose arms differ, so it is the only item that renders two labelled routes. The panel is static help with no platform value available to it, so it does not guess — the same union-when-unknown rule this phase applies at five other sites.
- **The README's probed-locations sentence is accurate on Windows, in three phrases and no more.** It names the roaming application-data npm prefix, the user profile's local binary directory, and the version-manager / package-manager locations, then points at the source where every catalogue row carries its own citation. Duplicating the catalogue in prose would have recreated the drift surface D-15 spent a plan removing. Heading count 19 before, 19 after; no execution-policy caveat.
- **The deferred README Copilot edit is closed as a verified no-op.** Four token searches (`gh extension install`, `gh extension`, `gh-copilot`, `gh copilot`) all return 0 against `README.md`. The README never named the deprecated command, so there was nothing to correct — recorded here with the search rather than left looking undone.
- **All four stale comments are verified corrected, and verified non-vacuously.** All four phrase greps return 0, and because a deleted comment also returns 0, the corrected comment was positively located at each of the four sites. The five scope fences (`windowsHide`, `.cmd` launchability, execution-policy copy, binary-path picker, `normalizePathForCompare` preserved-and-uncalled) all hold.
- **Both CI legs are green on the phase HEAD.** Run **32481129011** at `3f7c7b3816c0cdd3b8936afdcccc723cb1591151`: **`Verify (Windows)`** (`windows-latest`, job `96767522062`) reporting **31 files / 408 tests passed**, and the ubuntu matrix **`Verify (Node 20)`** `96767522331`, **`Verify (Node 22)`** `96767522176`, **`Verify (Node 24)`** `96767522152`, **`Verify (Node 26)`** `96767522262`, all success. That Windows leg running the full suite green is ROADMAP SC-5's second data point, obtained free.

## Task Commits

1. **T-06-19: The help panel renders from the shared install-command table (D-15)** — `9cd83d5`
   `feat(06-07): render the help panel's install list from the shared table (D-15)`
2. **T-06-20: Readme prose accuracy and the phase evidence gate** — `3f7c7b3`
   `docs(06-07): say which locations Drift probes on Windows (D-15 boundary)`

## Files Created/Modified

- `packages/frontend/src/views/HelpView.vue` — `+45 / -16`. The `<script setup>` block gains its first `from "shared"` import and a `installCommands` list built by mapping the provider union; the template's four `<li>` items become one `v-for`. The card structure, the surrounding prose, and the file's two-colour class vocabulary are unchanged.
- `README.md` — one sentence in § *Configuration → CLI Providers* extended with the Windows probe set. Nothing else in the paragraph moved.

## Decisions Made

- **The plan's repository-wide absence gate is reported as failing-as-written.** It filters with `grep -v '^./.planning'`, but `grep -rl <pattern> .` emits paths without a `./` prefix on this host, so the anchor never matches and nine `.planning/**/*.md` files leak into the output. The gate was not quietly rewritten until it passed; the literal output, the cause, and two correct forms are all recorded below.
- **Two of the three findings inherited from 06-06 changed status when re-run.** They were verified rather than taken on trust, as the execution context required, and re-running them was the only reason the change was noticed.
- **The CI evidence required a push, and the phase-5 mechanism was reused rather than invented.** `main` is 198 commits ahead of `origin/main` — nothing from Phase 4, 5 or 6 has been pushed — so no CI run had ever seen this phase's code. A `scratch/ci-06-07-phase-close` branch at the phase HEAD is exactly what Phase 5 pushed for its Windows proof (`scratch/ci-05-06-windows-proof`, runs 32377727473 / 32378144861 / 32378434081). The branch is left in place so the cited SHA stays reachable on the remote; the run identifiers are the citation, not an expiring artifact.
- **The platform labels use only the classes already in the file.** `HelpView.vue` uses exactly two surface text colours across 44 + 20 occurrences. A third colour for the labels would have been a redesign; the plan scoped this to a data-source change, so the labels render as plain text inheriting the list's colour.

## Deviations from Plan

**1. [Rule 1 — Bug] T-06-20's repository-wide absence gate has a broken path anchor and was reported, not silently repaired**

- **Found during:** T-06-20, step 3/the acceptance-criteria run.
- **Issue:** The criterion reads
  `grep -rl 'gh extension install' --include='*.ts' --include='*.vue' --include='*.mjs' --include='*.md' . | grep -v node_modules | grep -v '^./.planning'`
  and states the output must be "only the changelog path". Run literally, it outputs **ten** paths: `CHANGELOG.md` plus nine `.planning` files. The cause is the anchor, not the repository: `grep -rl <pattern> .` on this host emits `CHANGELOG.md` and `.planning/research/FEATURES.md` — **no `./` prefix** — so `^./.planning` can never match. (`.` in the pattern is also an unescaped any-char, which is harmless here only because the anchor already fails.)
- **Fix:** The gate was NOT edited to pass. Both the broken form and two correct forms were run and are recorded:
  - corrected anchor `grep -v '^\.planning'` → exactly `CHANGELOG.md`
  - `git grep -l 'gh extension install' -- . ':(exclude).planning'` → exactly `CHANGELOG.md` (and this form excludes `dist/` and `node_modules` by construction, which is the more robust fence for the future)
  The property the criterion exists to prove is therefore **satisfied**; the criterion's text is what is defective.
- **Files modified:** none — this is a plan-text defect, not a code defect.
- **Verification:** the three command outputs above, plus `grep -rn 'gh extension install' packages/frontend/src` returning zero lines.
- **Commit:** n/a (no code change).

**2. [Rule 1 — Bug] 06-06's inherited `packages/**` scoping advice is incorrect as worded**

- **Found during:** T-06-20, verifying the two notes 06-06 left for this task.
- **Issue:** 06-06-SUMMARY concludes that "scoping T-06-20's check to `packages/**` keeps CHANGELOG.md as its sole sanctioned surviving hit". Run literally, `packages/**` yields **zero** hits — `CHANGELOG.md` lives at the repository root, not under `packages/`, so that scoping proves nothing at all about the changelog and would have made the gate vacuous.
- **Fix:** Not adopted. The corrected-anchor and `git grep` forms above are used instead; both include the repository root and both output exactly `CHANGELOG.md`. Recorded so the next reader does not inherit the same advice a third time.
- **Files modified:** none.
- **Verification:** `packages/**` hits `[]`; corrected forms `CHANGELOG.md`.

**3. [Rule 1 — Bug] 06-06's inherited `dist/` note is now moot, and only its gitignore half was still verifiable**

- **Found during:** T-06-20, verifying the same two notes.
- **Issue:** 06-06 warned that `packages/*/dist/index.js` also carries the deprecated string. At 06-06's HEAD that was true. After T-06-19 and a rebuild it is **false**: `grep -rl 'gh extension install' packages | grep '/dist/'` returns nothing, and the frontend bundle carries `@github/copilot` twice instead. The note's other half — that `dist/` is gitignored — was verified independently and **holds** (`git check-ignore -v packages/frontend/dist/index.js` → `.gitignore:2:dist/`).
- **Fix:** No action needed; recorded because a future reader re-running the check on a *stale* build tree would still hit the artifact, and because the disappearance of the string from the rebuilt bundle is itself end-to-end evidence that T-06-19 reached the shipped artifact.
- **Files modified:** none.
- **Verification:** the two greps above and the `git check-ignore` output.

**Total deviations:** 3, all Rule 1, all in gate/hand-off text rather than in code — 0 code changes required. **Impact:** none on the shipped change; the phase's absence property is proven by two independent, correct commands. No architectural decisions were needed, no packages were installed, no checkpoints were reached, and no authentication gates occurred.

## The phase's non-claims, stated as non-claims

Recorded explicitly rather than implied by silence, continuing the practice Phase 5 established:

1. **No Windows path in this phase was exercised against a real Windows install.** The maintainer has no Windows machine (PROJECT.md § *Constraints*), and the `windows-latest` CI leg builds and tests the plugin — it does not run a version manager, a package manager or a third-party CLI installer. What is proven is the **spelling** of every catalogue row, each against a first-party source cited in the code beside it. That those directories **exist** on a real user's machine is not proven and closes only on the Phase 9/10 real-machine report.
2. **Nothing in this phase makes a resolved shim launchable.** Phase 6 resolves to `.cmd` / `.bat` / `.ps1` paths; spawning them through `cmd.exe /d /s /c` is PRV-02 and belongs to Phase 7. The seam is marked in the source (`command-resolution.ts:527`, `index.ts:2607-2610`) so Phase 7 finds it by grep, but no artifact this phase produces claims a resolved shim can be launched.
3. **The Windows search timeout is a headroom estimate, not a measurement.** `WIN32_PATH_SEARCH_TIMEOUT_MS = 5000` is bounded by two numbers already in this codebase; nobody timed `where.exe` on a real Windows host. This is `WINDOWS.md` entry 8, deliberately left **open** as an `unrun-verify`, and it closes on the same Phase 9/10 real-machine report.

## Issues Encountered

- **Every acceptance criterion in both tasks was executed, and the one that failed as written is reported as failing** rather than adjusted until green — see Deviation 1. This plan carried the phase's closing evidence gate, so a gate quietly rewritten to pass would have destroyed the thing the gate exists to produce.
- **The four comment gates were proved non-vacuous before their zeros were believed.** A deleted comment and a corrected comment both return 0 for a stale phrase, so each of the four sites was positively located and its corrected text read.
- **`git push -u` retargeted `main`'s upstream as a side effect** when the scratch branch was pushed; it was immediately restored to `origin/main` (`git branch --set-upstream-to=origin/main main`, verified). No commit, no force-push, no branch deletion.
- **No `git stash`, no `git clean`, no worktree operations, no `--no-verify`.** The concurrent session's `.planning/` edits (`PROJECT.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, `milestone.lock`, the untracked phase 11–13 directories and `research/`) were left untouched and appear in neither commit. `STATE.md`, `ROADMAP.md` and `CHANGELOG.md` were not written by this executor.
- **`git diff --diff-filter=D --name-only HEAD~2 HEAD` is empty** — nothing was deleted.

## Known Stubs

None. Stub scan across every added line in both commits (`TODO|FIXME|placeholder|coming soon|not available|= []|= {}`) returns zero matches.

The `UX-01` / `UX-03` / `UX-04` / `PRV-02` references in the surrounding source comments are deliberately **not** stubs — they name work that D-13 and D-16 explicitly scoped out of this phase, tagged with the owning requirement ID so the later phase finds each site by grep.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or schema change at a trust boundary was introduced. The plan's four registered threats all carry their mitigation in shipped code:

- **T-06-SC** (package names in help-panel copy): this plan installs nothing and introduces no new command string. It renders the table whose provenance 06-06 established, every row carrying a first-party citation. Removing the hardcoded list IS the mitigation — a hand-copied command cannot be corrected in one place.
- **T-06-T26** (a stale command surviving in one surface): closed. Both live surfaces read one table, and the repository-wide absence property is proven by two independent correct commands.
- **T-06-T27** (shared package gaining browser-hostile content): the shared module gained nothing this plan; `grep -c '^import'` on `cli-providers.ts` is still 0, and `pnpm build` exercises the frontend bundle, which builds and carries the correct strings.
- **T-06-T28** (phase closed without evidence): closed. Run `32481129011` and its five job identifiers are cited above, on the phase HEAD SHA, with the Windows leg's own test counts quoted from its log.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **ROADMAP SC-4 is fully closed.** Both live install-command surfaces — the backend error banner (06-06) and the in-app help panel (this plan) — render the same per-platform data from one shared table, and the archived Copilot command survives only in the changelog.
- **ROADMAP SC-5 is closed with a second data point.** The extended candidate-resolution tests run green on the Linux matrix and, free, on `windows-latest`: 408 tests, 31 files, on the blocking Windows leg.
- **Open, and deliberately so:** `WINDOWS.md` entry 8 (`WIN32_PATH_SEARCH_TIMEOUT_MS` as a headroom estimate) stays open as an `unrun-verify`, and coverage row D9 stays `human_judgment: true`. Both close on the Phase 9/10 real-machine report from the original reporter.
- **Handed to Phase 7:** PRV-02 (`cmd.exe /d /s /c` launch of resolved shims) and UX-01 (binary-path picker accepting `.exe` / `.cmd`), both marked in source by requirement ID. **Handed to Phase 10:** UX-03 (execution-policy guidance) and UX-04 (searched-location diagnostics), likewise marked.
- **Note for whoever ships this:** `main` is 198 commits ahead of `origin/main`. The `scratch/ci-06-07-phase-close` branch carries the phase HEAD on the remote purely as CI evidence; it is not a release path.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- Both modified files and `06-07-SUMMARY.md` present on disk.
- Both commits present in `git log`: `9cd83d5`, `3f7c7b3`.
- `git diff --name-only HEAD~2 HEAD` lists exactly `README.md` and
  `packages/frontend/src/views/HelpView.vue`. `CHANGELOG.md`, `STATE.md` and
  `ROADMAP.md` are untouched and unstaged, as are the concurrent session's
  `.planning/` edits.
- `git diff --diff-filter=D --name-only HEAD~2 HEAD` is empty — nothing was deleted.
- Every acceptance criterion in both tasks was executed. The one that fails as
  written (T-06-20's repository-wide absence gate) is reported as failing, with
  its cause and two correct forms, rather than adjusted to pass.
- `pnpm exec vitest run` 408 passed (31 files); `pnpm -r typecheck`, `pnpm lint`
  and `pnpm build` all exit 0 locally, and CI run `32481129011` is green on both
  legs at the phase HEAD.
