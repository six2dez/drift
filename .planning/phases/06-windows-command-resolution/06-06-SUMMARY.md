---
phase: 06-windows-command-resolution
plan: 06
subsystem: ux-copy
tags: [install-hints, shared-package, deprecation-fix, windows, cmp-01, ux-02]

requires:
  - phase: 06-windows-command-resolution
    plan: 05
    provides: "`host?.platform` threaded at every seam in index.ts — the shape this plan copies at the two provider-unavailable call sites and at the Node-executable requirement helper"
  - phase: 06-windows-command-resolution
    plan: 04
    provides: "the current shape of command-resolution.ts and its test file, both of which this plan also edits"
  - phase: 04-platform-foundation
    provides: "the `Platform` union (`win32 | darwin | linux`) and the union-when-unknown rule this plan applies for the fourth and fifth time"
provides:
  - "`PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands>` in `packages/shared/src/cli-providers.ts` — ONE install-command table, keyed by the provider union, so a missing provider or a missing platform arm is a compile error rather than a runtime gap in a user-facing error banner"
  - "`ProviderInstallCommands = { posix: string; win32: string }` — the two-arm shape, one command per arm"
  - "`getProviderInstallHint({ providerId, platform })` — composes the sentence from the shared display-name record plus the table's arm; macOS/Linux output for Claude, Gemini and Codex is byte-identical to the strings shipping today, asserted with full-sentence equality"
  - "`formatProviderUnavailableMessage({ providerId, cause, platform })` — same cause-full-stop-space-hint separator, platform threaded through"
  - "`getNodeExecutableError(platform)` replacing the `NODE_EXECUTABLE_ERROR` constant — macOS/Linux arm byte-identical (verified mechanically against the literal at HEAD~1), Windows arm naming the vendor LTS installer and the verified `OpenJS.NodeJS.LTS` winget identifier"
  - "The archived `gh`-extension Copilot install command is gone from EVERY file under `packages/backend/src` and `packages/shared/src`, on every platform arm — the correction ships to macOS and Linux users too, because the defect exists there today"
  - "The Gemini package name's `[ASSUMED]` provenance tag is CLEARED against Google's own repository README, with the citation recorded in the source beside the string"
affects: [06-07, phase-07-launch, phase-09-real-machine, phase-10-ux]

actuals:
  tokens: 4772
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Data in the shared package, rendering in each consumer: the command strings are keyed by the provider union in `shared`, while the sentence composition lives in the backend renderer (and, from 06-07, in the frontend help panel). The shared module stays import-free and I/O-free so it keeps loading in both Caido's constrained backend runtime and the browser."
    - "Recording a deliberate copy CONSEQUENCE in the source, not only in the commit: unifying on one display-name record changed the Copilot label, so the renderer says so where a reviewer diffing the output will read it."
    - "Inverting a live test assertion with the justification immediately above it — which decision, what the removed string pointed at, the dates, and why a copy fix is not the POSIX behaviour regression CMP-01 forbids."
    - "Asserting against a deprecated string by its distinctive FRAGMENTS rather than its full phrase, when a later plan runs a repository-wide absence check on that full phrase and a historical record is its only sanctioned surviving hit."
    - "Mechanical CMP-01 proof for an untestable module: extract the old literal from the previous commit with `git show` and compare it against the composed value, rather than eyeballing two strings."

key-files:
  created: []
  modified:
    - packages/shared/src/cli-providers.ts
    - packages/backend/src/command-resolution.ts
    - packages/backend/src/command-resolution.test.ts
    - packages/backend/src/index.ts

key-decisions:
  - "The Gemini `[ASSUMED]` tag was CLEARED, not carried. T-06-16 required one first-party documentation check before the string landed. Google's own repository README (github.com/google-gemini/gemini-cli, § Install globally with npm) quotes `npm install -g @google/gemini-cli` verbatim, which is a first-party source rather than the registry lookup the research had. The string itself is unchanged either way — only the tag and the citation moved, exactly as the plan required."
  - "The Copilot product label changed from the hand-written \"GitHub Copilot CLI\" to the shared \"Copilot CLI\". That is the deliberate price of composing from one display-name record instead of four hand-written sentences, paid on the single string D-14 replaces wholesale anyway. It is stated in a source comment so a reviewer diffing the output does not read it as an accident."
  - "The unknown-platform arm names BOTH commands only when the arms DIFFER. Three of the four providers install identically on both platforms, so labelling one command twice would be noise in an error banner. Claude is the only provider whose pre-probe hint carries two routes."
  - "The inverted Copilot assertion asserts against the deprecated command by two fragments (`gh extension`, `gh-copilot`) instead of the full phrase. Spelling the full phrase would leave a second hit for plan 06-07's repository-wide absence check, whose only sanctioned surviving hit is the CHANGELOG entry that must not be retro-edited. The two fragments together are a strictly stronger guard, not a weaker one."
  - "The Node error's rejected option is recorded ABOVE the function rather than inside it. `lastNodeSearchCandidates` is named in prose so D-16's rejection is visible rather than forgotten, and placing it outside the function body means BOTH the comment-filtered and the unfiltered forms of the gate return 0 — the invariant does not depend on which grep flavour runs it."
  - "No test file was created for the shared table. Its behaviour is compile-time (a missing arm cannot type-check) plus the full-sentence equality assertions in `command-resolution.test.ts`, which is exactly the artifact list and acceptance criteria the plan specifies. `index.ts` remains untestable under vitest, so `getNodeExecutableError`'s CMP-01 claim was proved by extracting the old literal from HEAD~1 and comparing."

patterns-established:
  - "Print the awk-extracted range and eyeball it BEFORE reading a gate's number — the fourth wave to apply it. Both awk-scoped gates here had their range printed first: the shared table's 50-line range terminating on its own `};`, and the Node error's 12-line range terminating on the function's own closing brace."
  - "Where a gate is comment-filtered because the task's own action mandates a comment containing the forbidden token, run the unfiltered form TOO. Here both forms return 0 because the mandated comment sits above the function, so the presence of the comment was confirmed separately by a direct grep rather than inferred."
  - "Design the source AROUND a literal-string acceptance gate rather than reformatting to satisfy one. `PROVIDER_INSTALL_COMMANDS`' declaration is kept on one 88-column line because the gate greps for a contiguous `... Record<CliProvider` and prettier would have broken it — consistent with the repo's pre-existing 80-column divergences, which lint does not enforce."

requirements-completed: [UX-02]

coverage:
  - id: D1
    description: "One install-command table lives in the shared package, keyed by the provider union, so omitting a provider or a platform arm is a compile error rather than a runtime gap"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "grep -Eq 'export const PROVIDER_INSTALL_COMMANDS: Record<CliProvider' packages/shared/src/cli-providers.ts succeeds; the awk range (printed first, 50 lines, terminating on its own `};`) returns 4 for 'CliProvider\\.', 4 for 'posix:' and 4 for 'win32:'"
        status: pass
      - kind: other
        ref: "pnpm -r typecheck exits 0 across all three packages — the Record<CliProvider, ...> keying is what makes an omitted arm fail here"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#returns a non-empty hint for every provider on every platform arm (drives off Object.values(CliProvider) × three platform arms)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Copilot hint names the current package on EVERY platform; the archived extension command it replaces appears nowhere under packages/backend/src or packages/shared/src"
    requirement: "UX-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#names the current Copilot package, not the archived extension, on every platform (loops linux, darwin, win32 and undefined)"
        status: pass
      - kind: other
        ref: "grep -rc 'gh extension install' packages/backend/src packages/shared/src reports 0 for every file (the test file included — the guard asserts against fragments, not the full phrase)"
        status: pass
      - kind: other
        ref: "awk '/Copilot/,/}/' packages/shared/src/cli-providers.ts | grep -c '@github/copilot' returns 2 — both arms carry the current package"
        status: pass
    human_judgment: false
  - id: D3
    description: "getProviderInstallHint takes a provider id and a platform, and its rendered macOS/Linux output for Claude, Gemini and Codex is byte-identical to the strings shipping today (CMP-01)"
    requirement: "UX-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#reproduces the macOS/Linux install hint shipping today, byte for byte — three toBe() equality assertions on the FULL sentence, not substring checks"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#returns the Windows install route on win32"
        status: pass
      - kind: unit
        ref: "pnpm exec vitest run — 408 passed across 31 files (402 before this plan, +6 net new)"
        status: pass
    human_judgment: false
  - id: D4
    description: "On an unknown platform the hint shows BOTH spellings rather than guessing — the fourth application of the union-when-unknown rule — and ONE command where the arms are equal"
    requirement: "UX-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#names BOTH routes when the platform is unknown and the arms differ"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#names ONE command when the platform is unknown and the arms are equal (full-sentence equality on the Gemini hint)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Node-not-found message has a Windows arm naming a real Windows install route, and its macOS/Linux arm is byte-identical to the string shipping today"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "Mechanical CMP-01 check: the old NODE_EXECUTABLE_ERROR literal extracted from `git show HEAD~1:packages/backend/src/index.ts` compared against NODE_NOT_FOUND_SENTENCE + ' ' + NODE_REMEDY_POSIX — BYTE-IDENTICAL: True"
        status: pass
      - kind: other
        ref: "grep -Eq 'function getNodeExecutableError' succeeds; grep -c 'NODE_EXECUTABLE_ERROR' returns 0 (unfiltered, comments included); grep -c 'OpenJS.NodeJS.LTS' returns 1; grep -Eq 'getNodeExecutableError\\(host\\?\\.platform\\)' succeeds"
        status: pass
    human_judgment: false
  - id: D6
    description: "No searched-candidate path list and no script-execution caveat reached user-facing copy (T-06-T23, D-16, UX-03 boundary)"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "awk '/function getNodeExecutableError/,/^}/' (range PRINTED first: 12 lines, terminating on the function's own brace) returns 0 for 'lastNodeSearchCandidates' both FILTERED and UNFILTERED, and 0 for 'ExecutionPolicy'; the mandated rejection comment naming that variable is confirmed present at index.ts:177"
        status: pass
      - kind: other
        ref: "grep -Eci 'ExecutionPolicy' packages/shared/src/cli-providers.ts returns 0 — the Codex PowerShell installer's documented invocation is deliberately not carried into the hint"
        status: pass
    human_judgment: false
  - id: D7
    description: "The one existing assertion this phase makes false is inverted deliberately, with the reason recorded beside it in the test file"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "grep -Ec 'D-14' packages/backend/src/command-resolution.test.ts returns 1 and grep -Ec '2025-10-30' returns 1, both inside the comment block immediately above the inverted assertion"
        status: pass
    human_judgment: false
  - id: D8
    description: "The historical changelog entry recording what version 0.1.0 shipped is not retro-edited"
    requirement: "UX-02"
    verification:
      - kind: other
        ref: "git diff --name-only CHANGELOG.md is empty, and git diff --name-only HEAD~4 HEAD lists only the four source files this plan owns"
        status: pass
    human_judgment: false
  - id: D9
    description: "A Windows user reading the corrected error banner can actually run the commands it names on a real Windows machine"
    verification: []
    human_judgment: true
    rationale: "Cannot be executed here. The maintainer has no Windows machine (PROJECT.md § Constraints) and CI on windows-latest builds and tests the plugin rather than running a PowerShell install of a third-party CLI. Every command is sourced against first-party documentation with the citation in the source, and the winget identifier is verified against the package repository's own manifest directory — but whether the vendor install block still leads with that form on the day a user reads the banner closes only on the Phase 9/10 real-machine report."

duration: 8min
completed: 2026-08-21
status: complete
---

# Phase 06 Plan 06: One Install-Command Table, Two Platform Arms, Zero Dead Repositories Summary

**Drift's "CLI / Node not found" guidance now comes from a single table in the shared package with a Windows arm per provider — and it no longer tells any user, on any platform, to install from a repository that has been archived read-only since 2025-10-30.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-21T12:00:19Z
- **Completed:** 2026-08-21T12:07:51Z
- **Tasks:** 3 (4 commits — T-06-17 is TDD, so it is a RED commit plus a GREEN commit)
- **Files modified:** 4

## Accomplishments

- **The commands live in one place, keyed so a missing platform arm cannot compile.** `PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands>` sits in `packages/shared/src/cli-providers.ts` beside the display-name and default-command records it is keyed alongside. The barrel already re-exported that module, so no barrel edit was needed. The previous backend table was a `Record<string, string>` — it could silently lose a provider; this one cannot, and it could not have gained a second platform arm without doubling a drift surface that was already four copies wide.
- **The live defect is closed on every platform, which is the whole point of D-14.** The Copilot hint pointed at `github/gh-copilot`, deprecated 2025-10-25 and archived read-only 2025-10-30. Shipping a Windows fix while knowingly leaving macOS and Linux users pointed at a dead repository would have been a deliberate defect against the entire *current* user base — UX-02's own wording is "replacing". Both arms now carry `npm install -g @github/copilot`, and the archived command appears in no file under `packages/backend/src` or `packages/shared/src`.
- **CMP-01 stopped being an inspection claim and became a test.** The three unchanged macOS/Linux hints are asserted with `toBe()` on the full sentence rather than `toContain()` on a fragment. A substring check would have passed even if the renderer silently reworded a product label or dropped the settings suffix — which matters here precisely because the renderer *does* change one product label deliberately.
- **The Gemini provenance tag was cleared honestly rather than assumed away.** The research tagged `@google/gemini-cli` `[ASSUMED]` because it came from Drift's own shipping code plus a registry lookup, and registry resolution does not confer verification — a slopsquatted name also resolves. T-06-16 required one first-party check before the string landed. Google's own repository README quotes the command verbatim, so the tag is cleared and the citation is recorded in the source. The string itself never moved; only the tag and the citation did.
- **The Node error stopped being shell-shaped on the platform this phase exists to fix.** `getNodeExecutableError(platform)` keeps the first sentence on both arms, keeps the macOS/Linux second sentence byte-identical (verified mechanically against the literal at `HEAD~1`, not by eye), and gives Windows the vendor LTS installer plus the `OpenJS.NodeJS.LTS` winget identifier verified against `microsoft/winget-pkgs`. This is the exact message the original Windows reporter would have read.
- **Nothing user-facing gained a path list or an execution-policy caveat.** Both boundaries D-16 and D-13 drew — `lastNodeSearchCandidates` (UX-04 / Phase 10) and the PowerShell script-running guidance (UX-03 / Phase 10) — are absent from the shipped copy, and both are named in comments as *considered and rejected* so a later reader does not re-litigate them from scratch.
- **408 tests green across 31 files** (402 before, +6 net new), `pnpm -r typecheck` and `pnpm lint` both exit 0.

## Task Commits

1. **T-06-16: The shared per-platform install-command table (D-15, D-14)** — `7bbb677`
   `feat(06-06): move the install-command table to shared, with a Windows arm (D-15, D-14)`
2. **T-06-17 (RED): failing tests for the platform-armed hint renderer** — `2c49b4a`
   `test(06-06): add failing tests for the platform-armed hint renderer (D-13, D-14)` — 7 failing assertions
3. **T-06-17 (GREEN): the renderer** — `abd35b7`
   `feat(06-06): render the install hint from the shared table, per platform (D-13)`
4. **T-06-18: The Node-not-found message gets a Windows arm (D-16)** — `ec2faac`
   `feat(06-06): give the Node-not-found message a Windows arm (D-16)`

## Files Created/Modified

- `packages/shared/src/cli-providers.ts` — `+80`. New exported type `ProviderInstallCommands` and new exported `PROVIDER_INSTALL_COMMANDS`, each command carrying its first-party citation in the comment above it, plus the explicit non-claim that CHANGELOG.md is not wired to the table and must not be retro-edited. Zero imports, zero I/O — it still loads in both Caido's backend runtime and the browser.
- `packages/backend/src/command-resolution.ts` — `+99 / -43`-ish. The local `PROVIDER_INSTALL_HINTS` table is deleted; `getProviderInstallHint` and `formatProviderUnavailableMessage` take object parameters carrying a platform; the settings suffix and the generic fallback are extracted as named constants and preserved byte-identically.
- `packages/backend/src/command-resolution.test.ts` — `+155`. Nine install-hint tests replacing three, including the deliberately inverted Copilot assertion.
- `packages/backend/src/index.ts` — `+73`. `getNodeExecutableError` and its three sentence constants replace `NODE_EXECUTABLE_ERROR`; the two provider-unavailable call sites and the Node-executable requirement helper thread `host?.platform`; the two comments that named the deleted constant now name the function.

## Decisions Made

- **The `[ASSUMED]` tag on the Gemini package name was cleared, not carried forward.** The plan allowed either outcome and forbade changing the string in either case. The first-party check (Google's own repository README, § *Install globally with npm*) confirmed the name, so the citation is now in the source and the tag is gone. Had the check failed, the string would have stayed exactly as it ships and the tag would have stayed with it.
- **The Copilot product label change is deliberate and is stated in the source.** Composing from `CLI_PROVIDER_DISPLAY_NAMES` yields "Copilot CLI" where the hand-written table said "GitHub Copilot CLI". The other three display names already matched their hand-written labels character for character, which is why three of four sentences are byte-identical and one is not. The renderer comment says so, so a reviewer diffing the output reads it as a consequence rather than a slip.
- **The unknown-platform arm names both commands only when the arms differ.** Claude is the only provider with distinct arms, so it is the only one whose pre-probe hint carries two labelled routes; the other three name one command. Duplicating an identical command under two platform labels would be noise in an error banner.
- **`PROVIDER_INSTALL_COMMANDS`' declaration stays on one 88-column line.** The acceptance gate greps for a contiguous `export const PROVIDER_INSTALL_COMMANDS: Record<CliProvider`, and prettier at 80 columns would break that after `Record<`. Lint does not enforce prettier in this repo and 80-column divergences are pre-existing and widespread, so the one-line form is consistent with the file's neighbours. `pnpm format` was deliberately not run.
- **The rejected-option comment for the Node error sits above the function, not inside it.** That makes the comment-filtered gate and the unfiltered gate agree at 0, so the invariant (no CODE path puts the candidate list in user-facing copy) does not depend on the grep flavour available on the runner. Presence of the mandated comment was then confirmed by a separate direct grep, per the precedent 06-05 set.

## Deviations from Plan

**1. [Rule 3 — Blocking] The inverted Copilot assertion asserts against two fragments of the deprecated command, not its full phrase**

- **Found during:** T-06-17, reconciling two of the task's own acceptance criteria against each other.
- **Issue:** The action requires "an assertion that it does NOT contain it", which naively means writing `not.toContain("gh extension install")`. But the task's own absence gate requires `grep -rc 'gh extension install' packages/backend/src packages/shared/src` to report `0` **for every file** — and the test file is under `packages/backend/src`. Writing the literal phrase would fail that gate. Worse, it would survive into plan 06-07's T-06-20 repository-wide check, whose stated sole expected surviving hit is the CHANGELOG entry that must not be retro-edited — so the guard would become the thing that breaks the check it exists to support.
- **Fix:** The assertion is `expect(hint).not.toContain("gh extension")` **and** `expect(hint).not.toContain("gh-copilot")`, run across all four platform arms. Two fragments together are a strictly stronger guard than the single full phrase: they reject `gh extension add`, `gh extension install`, and any bare `gh-copilot` reference alike. The comment above the assertion records *why* the phrase is not spelled out, so the next reader does not "helpfully" restore it.
- **Files modified:** `packages/backend/src/command-resolution.test.ts`
- **Commit:** `abd35b7` (recorded in the commit body)

No other deviations. No architectural decisions were needed, no packages were installed, no checkpoints were reached, and no authentication gates occurred.

## Issues Encountered

- **Both `awk`-scoped gates had their extracted range PRINTED and eyeballed before any number was read**, per the precedent this phase established after the trap bit three earlier waves. The shared table's range extracted 50 lines and terminated on its own `};` (line 50 confirmed as the table's closing brace, not a signature). The Node error's range extracted 12 lines and terminated on the function's own closing brace. Neither result was vacuous.
- **The `awk '/Copilot/,/}/'` gate was reasoned about before the comment was written, not after.** That range restarts on every line containing "Copilot" and closes on the next line containing `}`, so a Copilot comment spelling `@github/copilot` would have inflated the count past 2. The explanatory comment therefore names the replacement by citation rather than by package string, and the shared table's header comment deliberately does not mention Copilot at all. Verified empirically: the gate returns exactly 2.
- **The plan's line references were stale by one wave, as expected.** It cites the inverted assertion at `command-resolution.test.ts:73` and the hint table at `command-resolution.ts:4-16`; 06-04's edits had moved them to `:134` and `:71-96`. Symbols were located by name, not by line number.
- **One stub-scan hit over the added lines is a false positive.** `` cause: `CLI not available: ${status.error}` `` matches the "not available" pattern; it is the pre-existing cause string moved verbatim into the object parameter, not a stub.
- **No `git stash`, no `git clean`, no worktree operations, no `--no-verify`.** The concurrent session's `.planning/` edits (`PROJECT.md`, `REQUIREMENTS.md`, `STATE.md`, `config.json`, and the untracked phase 11–13 directories, `milestone.lock`, `research/`) were left untouched and appear in no commit here. `git diff --diff-filter=D --name-only HEAD~4 HEAD` is empty — nothing was deleted. `STATE.md` and `ROADMAP.md` were not written by this executor; the orchestrator owns them.

## Known Stubs

None. Stub scan across every added line: the single `TODO|FIXME|placeholder|coming soon|not available` match is the pre-existing `CLI not available:` cause string, described above.

The `UX-03` and `UX-04` references in the new comments are deliberately NOT stubs — they name copy and diagnostics that D-13 and D-16 explicitly scoped out of this phase, tagged with the requirement ID of the phase that owns them so Phase 10 finds them by grep.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was introduced. All four boundaries in the plan's `<threat_model>` carry their mitigation in shipped code:

- **T-06-SC** (package names in install-hint copy): every command in the table carries a first-party citation in the comment beside it. `@anthropic-ai`-adjacent, `@github/copilot`, `@openai/codex` and `OpenJS.NodeJS.LTS` were `[VERIFIED]` by the research; `@google/gemini-cli` was `[ASSUMED]` and this plan cleared it against Google's own repository README. No unsourced package name was introduced. **No package was installed by this plan** — it changes the strings Drift *prints*, nothing more.
- **T-06-T23** (searched-candidate list → user-facing message): `lastNodeSearchCandidates` appears in no code path inside `getNodeExecutableError`; both the filtered and unfiltered gate forms return 0, and the rejection is recorded in prose above the function.
- **T-06-T24** (a stale install command as a spoofing surface): closed on every platform. An install command naming an archived repository can be re-registered or shadowed by a third party, which is why D-14 is not Windows-scoped. The backend/shared absence check passes here; the repository-wide check is 06-07's T-06-20.
- **T-06-T25** (shared table gaining a runtime dependency): `grep -Ec '^import' packages/shared/src/cli-providers.ts` returns 0. The module is still data-only and still loads in both the constrained backend runtime and the browser.

## Note for plan 06-07's repository-wide check

`packages/frontend/src/views/HelpView.vue:221` still carries the archived command — that is 06-07's to fix, and this plan's absence check was correctly scoped to `packages/backend/src` and `packages/shared/src` for exactly that reason.

Two practical notes for T-06-20, so it is not surprised at run time:

1. **`packages/*/dist/index.js` also contains the string, and `dist/` is gitignored** (`.gitignore:2`). A `grep -r` from the repository root will hit build artifacts unless the check excludes `dist/` or scopes itself to tracked files.
2. **`CHANGELOG.md` is not the only remaining Markdown hit.** `.planning/research/FEATURES.md`, `.planning/codebase/INTEGRATIONS.md`, `06-VALIDATION.md`, `06-CONTEXT.md`, `06-PATTERNS.md`, `06-RESEARCH.md`, `06-06-PLAN.md` and `06-07-PLAN.md` all name it, correctly, as the thing being removed. Scoping T-06-20's check to `packages/**` keeps CHANGELOG.md as its sole sanctioned surviving hit exactly as the plan intends.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **ROADMAP SC-4 is satisfied at the backend:** a "CLI / Node not found" error now shows correct per-provider Windows install commands, including the corrected Copilot guidance, and the Node message has a Windows arm. The frontend half of the same surface lands in 06-07.
- **The shared table is ready to wire.** `PROVIDER_INSTALL_COMMANDS` and `ProviderInstallCommands` are exported through the existing barrel; `HelpView.vue` can render `posix`/`win32` arms from it without a new module or a new dependency.
- **Open, and deliberately so:** whether the vendor install blocks still lead with these forms on the day a real user reads the banner is coverage row D9 (`human_judgment: true`), closing on the Phase 9/10 real-machine report. The execution-policy caveat (UX-03) and the searched-location diagnostics (UX-04) remain Phase 10's, named in source comments at both sites.

---
*Phase: 06-windows-command-resolution*
*Completed: 2026-08-21*

## Self-Check: PASSED

- All four modified source files and `06-06-SUMMARY.md` present on disk.
- All four commits present in `git log`: `7bbb677`, `2c49b4a`, `abd35b7`, `ec2faac`.
- `git diff --name-only HEAD~4 HEAD` lists exactly the four source files this plan owns.
  `CHANGELOG.md`, `STATE.md` and `ROADMAP.md` are untouched and unstaged, as are the
  concurrent session's `.planning/` edits.
- `git diff --diff-filter=D --name-only HEAD~4 HEAD` is empty — nothing was deleted.
- Every acceptance criterion in all three tasks was run. Both `awk`-scoped gates had their
  extracted range printed and eyeballed before the result was read.
- `pnpm exec vitest run` 408 passed (31 files); `pnpm -r typecheck` and `pnpm lint` both exit 0.
