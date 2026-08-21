---
phase: 06-windows-command-resolution
verified: 2026-08-21T14:50:00Z
status: human_needed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: null
deferred:
  - truth: "A resolved `.cmd` shim can actually be launched on Windows"
    addressed_in: "Phase 7"
    evidence: "Phase 7 SC-2: 'Provider `.cmd` shims spawn via a `cmd.exe /d /s /c <shim> <args>` argv array with `shell:false` (or the underlying `node.exe` entry directly)'. Phase 6 explicitly and repeatedly declines this claim in-source (spawnAndWait comment, Volta P-11/P-12 comment, getKnownHomeDirs comment)."
  - truth: "The Windows PATH-search spawn suppresses the console-window flash"
    addressed_in: "Phase 10"
    evidence: "UX-04 marker present in-source at index.ts:1601-1607 naming Phase 10 as owner; `windowsHide` appears in zero source files, which is the scope fence holding."
  - truth: "The `where.exe` search-candidate list is surfaced to the user in the not-found banner"
    addressed_in: "Phase 10"
    evidence: "D-16 rejects it explicitly and names UX-04 / Phase 10; `lastNodeSearchCandidates` is retained and read by getDiagnostics."
human_verification:
  - test: "On a real Windows machine carrying each supported installer layout (npm-global, Claude native, Volta, pnpm, Bun, scoop user + machine, nvm-windows, fnm modern + legacy, Node MSI), call resolveCommand / getNodeExecutable and confirm each catalogue row names a directory that actually exists on disk."
    expected: "The candidate the resolver selects is the path that actually exists; no supported layout resolves to undefined."
    why_human: "The phase proves the catalogue's SPELLING (byte-exact, from literal inputs, on Linux), never its EXISTENCE. windows-latest carries none of these layouts and the maintainer has no Windows machine (PROJECT.md § Constraints). A wrong path fails as a silent stat miss, never an error. Closes on the Phase 9/10 real-machine report. NOT CLAIMED BY THIS PHASE."
  - test: "On a real Windows host with real-time antivirus enabled, time a COLD `where.exe` spawn (process creation included) and compare against WIN32_PATH_SEARCH_TIMEOUT_MS = 5000."
    expected: "A cold PATH search completes well inside 5000 ms, or the constant is revised with the measured figure."
    why_human: "WINDOWS.md entry 8 is deliberately OPEN. The number is an explicit headroom estimate bounded by three values this codebase already accepts (1000 ms POSIX floor, 10 s self-test ceiling, 30 s negative TTL) and the source comment says so verbatim: 'This is a headroom estimate, not a measurement, and nothing later may cite it as evidence.' NOT CLAIMED BY THIS PHASE."
  - test: "On a real Windows host, place the same command name under two different extensions on two PATH entries, run `where.exe`, and record (a) the cross-extension output order and (b) which stream carries the no-match informational line."
    expected: "Either answer is acceptable — the ranker's explicit sort and the two independent guards (exit-code gate + extension-termination filter) are correct under every ordering."
    why_human: "Undocumented by Microsoft and by ss64; Phase 3's measurement could not discriminate (both measured lines carried the same extension). Resolved by DESIGN, not by evidence — confidence upgrade only, not a blocker."
  - test: "MAINTAINER DECISION (security): decide the disposition of the two non-administrator-writable candidate roots this phase added — `%ProgramData%\\scoop\\shims` (command-resolution.ts:553) and `C:\\nvm4w\\nodejs` (NVM_WINDOWS_SYMLINK_DIR, :24 / :614 / :965)."
    expected: "One of: (a) drop the programData row and gate the nvm4w row on NVM_HOME/NVM_SYMLINK presence, or (b) keep them with an explicit recorded non-claim beside each row naming the CAIDO_TOKEN exposure. Silence is not one of the options under this module's own cite-or-drop discipline."
    why_human: "Judgment call on a security/coverage trade-off. Verified in code: neither row carries a security note, and every other row in the catalogue is under the user's own trust domain or admin-only. A binary resolved from either row is spawned with CAIDO_URL/CAIDO_TOKEN in its environment (buildSpawnEnv at index.ts:3640; spec.env at :2159). Directly touches PROJECT.md's stated token-handling constraint. See 06-REVIEW.md CR-02."
  - test: "MAINTAINER DECISION (ownership): decide whether the two remaining unguarded Promise-executor spawns — the provider spawn at index.ts:3640 and the PATH-search spawn at index.ts:1600 — are closed in Phase 6 or handed to Phase 7 with a recorded marker."
    expected: "Either the one-guard shape spawnAndWait already carries is mirrored at both sites, or a recorded non-claim + greppable marker is added naming the owning phase — matching how this phase handled every other deferral (UX-04, PRV-02, D-07)."
    why_human: "Verifier assessment below concludes this is a Phase 6 defect in kind but NOT a phase-goal blocker; the fix-vs-defer call belongs to the maintainer. See the § Verifier Assessment section."
---

# Phase 6: Windows Command Resolution — Verification Report

**Phase Goal:** Make `node.exe` and the provider CLIs reliably locatable on real Windows machines so the Phase 5 spec can be populated with absolute, correctly-extensioned paths.
**Verified:** 2026-08-21T14:50:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

**Verdict in one line: the phase goal is achieved.** All five ROADMAP success criteria hold in the
codebase, verified against source rather than against SUMMARY prose. Five items require human
resolution — three of them are the phase's own explicitly recorded non-claims (real-machine
existence, the timeout estimate, the `where.exe` cross-extension order), and two are maintainer
decisions arising from the code review. Separately, the phase carries real defects that do not
block the goal; they are reported in their own section rather than folded into the verdict.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | On Windows, Drift locates `node.exe` via `where` plus Windows install-location candidates | ✓ VERIFIED | `buildNodeCandidatePaths` win32 arm (`command-resolution.ts:894-990`) emits P-13 Volta node image → P-02 `%ProgramFiles%\nodejs` → P-03 `%ProgramFiles(x86)%\nodejs` → P-06 `C:\nvm4w\nodejs`, then the full shared table. Wired at `index.ts:2656-2695` (`getNodeExecutableCandidates` → `fileExists` → `spawnAndWait --version`). `getWhichCommand` win32 arm supplies the search binary. **Roadmap-vs-research corrections verified row by row against 06-RESEARCH § Named-Root Table:** nvm-windows under `%LOCALAPPDATA%\nvm` (P-04), symlink `C:\nvm4w\nodejs` (P-06), fnm modern under `%APPDATA%\fnm` (P-08) — all three present in code as corrected, all three carrying their installer-source citation inline. |
| SC-2 | Provider CLIs resolve to an absolute path with explicit extension, `.exe` over `.cmd`, `\r`-safe multi-line parse | ✓ VERIFIED | `rankPathSearchHits` (`platform.ts:380-427`) ranks every line by `WINDOWS_EXECUTABLE_EXTENSIONS` with an **explicit** `order` tie-break (not relying on `Array.sort` stability under a constrained engine). Wired at `index.ts:1670-1678`: `out.head.split(/\r?\n/)` → `ranked[0]`, gated on `code === 0`. `getExecutableNames` supplies the `.exe`→`.cmd`→`.bat`→bare ladder to the directory walk. Non-win32 arm returns `lines[0].trim()` — byte-identical to the `split("\n",1)[0]` it replaces. |
| SC-3 | Home-dir detection recognizes `C:\Users\<name>` and reads `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, **while macOS/Linux `HOME` is unchanged** | ✓ VERIFIED | `extractHomeDir` (`command-resolution.ts:258-337`) gains a platform-blind drive-letter arm accepting **both** separator spellings, returning the separator it was given, rejecting `.`/`..` traversal, with the UNC and non-`Users` non-recognitions recorded beside the code. `getHomeDirCandidates` (`platform.ts:457-474`) unions both name sets on `undefined`. Wired at `getKnownHomeDirs` (`index.ts:1734-1743`) — the POSIX `process.env.HOME` hardcode is gone. **CMP-01 half verified non-vacuously** — see truth 6 and 8. |
| SC-4 | "CLI / Node not found" shows correct per-provider Windows install commands, incl. the `@github/copilot` correction | ✓ VERIFIED | `PROVIDER_INSTALL_COMMANDS` in `packages/shared/src/cli-providers.ts`, typed `Record<CliProvider, ProviderInstallCommands>` so an omitted arm is a compile error. Copilot = `npm install -g @github/copilot` on **both** arms (D-14). `getProviderInstallHint` has win32 / posix / union-when-unknown arms. `NODE_EXECUTABLE_ERROR` split into `getNodeExecutableError(platform)` with a win32 arm naming nodejs.org LTS + `winget install OpenJS.NodeJS.LTS` (D-16). Both live surfaces render from the one table (backend banner + `HelpView.vue`). |
| SC-5 | Extended `command-resolution` unit tests cover the Windows cases and run green on the Linux CI runner | ✓ VERIFIED | `platform.test.ts` 114 tests + `command-resolution.test.ts` 43 tests = **157 green**; full suite **408/408 green** locally at HEAD. CI run **32481129011** at `3f7c7b3`: `Verify (Node 20/22/24/26)` all success, and `Verify (Windows)` (job `96767522062`) success. Log line read first-hand: `Test Files 31 passed (31)` / `Tests 408 passed (408)`. |
| 6 | `joinPath({platform:'linux', …})` is byte-identical to `path.join(…)` for every POSIX suffix the builders emit (CMP-01 proof 1) | ✓ VERIFIED | `platform.test.ts:768-781` — 23 rows × 2 assertions, oracle is `path.posix.join` (made POSIX **by construction**, not by accident of runner, after WINDOWS.md entry 7). Non-vacuous: real oracle, real literal rows, whole-string `toBe`. Independently re-derived by the code reviewer at 0 divergences. |
| 7 | The candidate builders are genuinely PURE — SC-5's whole evidence architecture (D-10) | ✓ VERIFIED | Mechanically checked, not read: function bodies extracted by brace-matching and scanned for `await` / `stat(` / `readdir(` / `pathExists` / `process.` — **0 hits** in `buildCommandCandidatePaths` (97 lines), `buildNodeCandidatePaths` (158), `buildWindowsInstallLocationCandidates` (194). No `deps` object is injected into any of them. All I/O sits in `getCommandExecutableCandidates` / `getNodeExecutableCandidates` / `listWindowsVersionDirs`. |
| 8 | The pre-split POSIX candidate ORDER is preserved string-for-string (CMP-01 proof 2) | ✓ VERIFIED | `command-resolution.test.ts:681-765` — `CMP_01_POSIX_CANDIDATES` is a 12-entry POSIX **literal** array asserted with whole-array `toEqual` (never `toContain`, which cannot detect reordering) across linux / darwin / pre-probe `undefined` / duplicate-homeDir. A fourth case pins that win32 rows **append** after POSIX rows rather than interleaving. Non-vacuous. |
| 9 | Cite-or-drop (D-12): every win32 row carries an inline source; every unsourced path is a recorded non-claim | ✓ VERIFIED | Every `emitLocation` in `buildWindowsInstallLocationCandidates` is preceded by a P-nn citation naming the installer script / package source / first-party doc. DROP rows recorded in the table header comment: roaming-appdata nvm (P-07, unsourced), `%ProgramFiles%\Volta` (P-14, holds volta.exe only), asdf on native Windows (P-20), userprofile `.volta` on win32. P-03 is kept and **tagged `[ASSUMPTION]` in-source**. |
| 10 | `spawnAndWait`'s documented never-rejects invariant holds now that the resolver emits `.cmd`/`.bat` | ✓ VERIFIED | `index.ts:2613-2629` — `let proc; try { proc = spawn(...) } catch { resolve({code:1, …}); return; }`. Deliberately absent, and stated as such: any shell option, any interpreter wrapper, any extension check. The comment states plainly that this does **not** make a `.cmd` launchable. |
| 11 | `platform.ts` still has zero imports and performs zero I/O | ✓ VERIFIED | `grep -c "^import "` → **0**. No `require`, no `process.`, no fs/spawn call anywhere in the file (the only matches are the word "spawn" inside comments). |
| 12 | All five scope fences intact | ✓ VERIFIED | `windowsHide` → **0 occurrences** repo-wide, while a `UX-04 / Phase 10` marker sits at the new PATH-search spawn (`index.ts:1601-1607`). No claim anywhere that a `.cmd` is launchable — the three places it could have crept in (spawnAndWait, Volta P-11/P-12, getKnownHomeDirs) each explicitly disclaim it. `normalizePathForCompare` still exported at `runtime-probe.ts:677`, with **zero production callers**, and the preservation reason is recorded beside the export. No execution-policy copy on any surface. |
| 13 | The four stale in-repo comments are corrected in place | ✓ VERIFIED | Verified by search, non-vacuously: `grep` for the stale phrasings (`Phase 6 does not`, `Phase 6 will call`, `not implemented here`, `zero-caller`) → **0 hits**, and the **corrected** text was positively located at each site. `runtime-probe.ts` first-caller banner now records D-07's decline (commit `b8e287c`, comment-only, +23/-5). `platform.ts` phase references at :297/:300/:302/:361/:432 are all accurate as of this phase. |
| 14 | The archived Copilot command is gone everywhere except the untouched CHANGELOG | ✓ VERIFIED | `gh-copilot` / `gh extension install` / `gh copilot` across `packages/**` + `README.md`: the only hits are two explanatory comments and two negative test assertions. `CHANGELOG.md:75` retains the 0.1.0 record **unedited** — the prohibition holding, not a miss. `README.md` returns 0 for all four deprecated tokens. |
| 15 | Suite, typecheck and lint green on both CI legs | ✓ VERIFIED | Local at HEAD: `vitest run` 408/408, `pnpm typecheck` clean (tsc + vue-tsc), `pnpm lint` clean at `--max-warnings 0`. CI at `3f7c7b3`: Typecheck / Lint / Test / Build all success on `windows-latest` **and** on ubuntu Node 20/22/24/26. The two commits between `3f7c7b3` and HEAD are **docs-only** (`git diff --stat` → `06-07-SUMMARY.md`, `06-REVIEW.md`), so the CI run covers HEAD's source exactly. |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified).

### What this score does NOT certify

Stated plainly because the phase's own discipline demands it, and because a clean 15/15 could
otherwise be misread:

- **No Windows machine has run this code.** The evidence is the pure logic (byte-exact, from literal
  inputs, on Linux) plus a green build-and-test on `windows-latest`. The catalogue's **spelling** is
  proven; its **existence** on a real install is not, and is not claimed.
- **`WIN32_PATH_SEARCH_TIMEOUT_MS = 5000` is an estimate, not a measurement.** WINDOWS.md entry 8 is
  correctly left OPEN. Nothing downstream may cite it as evidence — the source comment says so.
- **The `where.exe` cross-extension output order is unmeasured.** The code is correct under every
  answer by design (explicit ranking + two independent guards), which is a different and weaker claim
  than having measured it. The phase says so.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/platform.ts` | `joinPath`, `getWhichCommand`, `rankPathSearchHits`, `getHomeDirCandidates`, `getWindowsNamedRoots`, `WINDOWS_EXECUTABLE_EXTENSIONS`, `getExecutableNames` | ✓ VERIFIED | All present and exported. 0 imports, 0 I/O. Consumed by `command-resolution.ts` and `index.ts`. |
| `packages/backend/src/platform.test.ts` | Windows cases + CMP-01 byte-identity | ✓ VERIFIED | 114 tests green; 143 win32/Windows-shaped references. |
| `packages/backend/src/command-resolution.ts` | Pure builders, sourced win32 catalogue, `extractHomeDir` win32 arm, `foldCandidateKey`, `getProviderInstallHint` | ✓ VERIFIED | All present. Only surviving `path`-module call is the ONE deliberate `path.dirname` at :1027, documented as the exception. |
| `packages/backend/src/command-resolution.test.ts` | Windows catalogue + CMP-01 order + hint assertions | ✓ VERIFIED | 43 tests green; 197 win32/Windows references; whole-array `toEqual` assertions. |
| `packages/backend/src/index.ts` | `resolveCommand` wiring, `getKnownHomeDirs`, `getNodeExecutableError`, `spawnAndWait` guard, timeout constants | ✓ VERIFIED | All wired. See Key Link table. |
| `packages/backend/src/runtime-probe.ts` | `normalizePathForCompare` preserved, uncalled, reason recorded | ✓ VERIFIED | Exported at :677, 0 production callers, D-07 decline recorded in-source. |
| `packages/shared/src/cli-providers.ts` | Install-command table keyed by the provider union | ✓ VERIFIED | `PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands>`. Data only — no imports, no I/O. |
| `packages/frontend/src/views/HelpView.vue` | Renders the install list from the shared table | ✓ VERIFIED | `import { … } from "shared"`; `Object.values(CliProvider).map(...)` + one `v-for`. Zero hardcoded install commands. |
| `README.md` | Windows probe-set prose, no deprecated command | ✓ VERIFIED | § CLI Providers line 38 names the Windows set in summary form and defers to the source; 0 deprecated-command hits. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts resolveCommand` | `getWhichCommand` | `{platform: host?.platform, env: readParentEnv()}` → `spawn` | ✓ WIRED | `index.ts:1596-1600`. Turns Phase 4's zero-caller export into shipped behaviour. |
| `index.ts resolveCommand` | `rankPathSearchHits` | `out.head.split(/\r?\n/)` → `ranked[0]`, gated on `code === 0` | ✓ WIRED | `index.ts:1670-1678`. `renderBoundedBuffer` is NOT used here — prohibition holds. |
| `index.ts resolveCommand` | `buildCommandCandidatePaths` | `getCommandExecutableCandidates` (thin impure caller) | ✓ WIRED | `index.ts:1695-1701`. The SC-5 seam. |
| `index.ts getKnownHomeDirs` | `getHomeDirCandidates` + `extractHomeDir` | union of env names + pluginPath + provider commands | ✓ WIRED | `index.ts:1734-1743`. POSIX `HOME` hardcode removed. |
| `index.ts getNodeExecutable` | `buildNodeCandidatePaths` | `getNodeExecutableCandidates({platform, roots, …})` | ✓ WIRED | `index.ts:2656-2695`. `roots` from `getWindowsNamedRoots({env: readParentEnv()})`. |
| `index.ts requireNodeExecutable` | `getNodeExecutableError(host?.platform)` | MCP start failure message | ✓ WIRED | `index.ts:2748`. |
| shared `PROVIDER_INSTALL_COMMANDS` | `getProviderInstallHint` → `formatProviderUnavailableMessage` | chat error banner + Settings provider status | ✓ WIRED | `command-resolution.ts:105-155`. |
| shared `PROVIDER_INSTALL_COMMANDS` | `HelpView.vue` | `Object.values(CliProvider).map` + `v-for` | ✓ WIRED | `HelpView.vue:25-33`, `:239`. Second live surface closed. |
| `buildCommandCandidatePaths` | `pushUniqueCandidate` → `foldCandidateKey` | win32-only case+separator fold | ✓ WIRED | Fold correctly gated on `"win32"`, never on `undefined` — asserted by the "keeps BOTH POSIX paths that differ only in case" test at `:991`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `HelpView.vue` | `installCommands` | `PROVIDER_INSTALL_COMMANDS` (shared module constant) | Yes — 4 providers × 2 arms, verified in the rebuilt bundle (`@github/copilot` ×2, archived command ×0) | ✓ FLOWING |
| `resolveCommand` | `pathResolution` | live `spawn(where.exe/which)` stdout → `rankPathSearchHits` | Yes — real spawn, real ranking, no static fallback | ✓ FLOWING |
| `getNodeExecutable` | `candidates` | `buildNodeCandidatePaths` fed by real `readdir` version walk | Yes — `listWindowsVersionDirs` does real `pathExists` + `listVersionDirectories` | ✓ FLOWING |
| provider status banner | `error` string | `formatProviderUnavailableMessage` → shared table | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-6 test files green | `npx vitest run …/command-resolution.test.ts …/platform.test.ts` | `157 passed (157)` | ✓ PASS |
| Full suite green at HEAD | `npx vitest run` | `31 files / 408 passed` | ✓ PASS |
| Workspace typecheck | `pnpm typecheck` | shared / backend / frontend all "Done" | ✓ PASS |
| Lint gate | `pnpm lint` (`--max-warnings 0`) | exit 0, no output | ✓ PASS |
| Candidate builders are I/O-free | brace-matched body extraction + impurity grep | 0 hits across all 3 builders | ✓ PASS |
| CI claim resolves and says what is claimed | `gh run view 32481129011` + `gh run view --job 96767522062 --log` | `headSha 3f7c7b3…`, `Verify (Windows)` conclusion `success`, log: `Tests 408 passed (408)` | ✓ PASS |
| Commits since the cited CI run touch no source | `git diff --stat 3f7c7b3..HEAD` | 2 files, both `.planning/**/*.md` | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exists in this repository and no phase-6 plan declares one.
**Step 7c: SKIPPED (no probes declared or discoverable).** The phase's runnable evidence is the
vitest suite and the CI legs, both executed above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **RES-01** | 06-01, 06-02 | Locate `node.exe` via `where` + Windows install locations | ✓ SATISFIED (spelling) / ? NEEDS HUMAN (existence) | Truth SC-1 + truth 9. The plans' own `flagged_assumptions` mark the real-machine existence check `unresolved` for Phase 9/10 — carried forward as human item 1, not silently passed. |
| **RES-02** | 06-03, 06-05 | Absolute path + explicit extension, `.exe` preferred, CRLF-safe | ✓ SATISFIED | Truth SC-2. Residual `where.exe` cross-extension ordering is designed-around, not measured — human item 3. |
| **RES-03** | 06-01, 06-03, 06-04 | Home-dir detection recognizes `C:\Users\<name>`, uses `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` | ✓ SATISFIED | Truth SC-3. Empty-input, traversal, UNC and encoding/dedup edges all covered and tested. |
| **UX-02** | 06-06, 06-07 | Correct Windows install commands per provider incl. the `@github/copilot` correction | ✓ SATISFIED | Truths SC-4 + 14. The Gemini package-name provenance flag was **closed**: `cli-providers.ts` now cites `github.com/google-gemini/gemini-cli` (first-party repo), upgrading the `[ASSUMED]` tag rather than leaving it. |
| **CMP-01** | (cross-cutting, closed in Phase 5) | macOS/Linux behaviour preserved | ✓ SATISFIED, with one caveat | Truths 6 + 8 are the non-vacuous proofs. Caveat: WR-05(b) below — the in-source claim that the union "costs a POSIX machine nothing" is an environment assumption, not an invariant. |

**No ORPHANED requirements.** `REQUIREMENTS.md` maps exactly RES-01, RES-02, RES-03, UX-02 to
Phase 6, and every one is claimed by at least one plan's `requirements` field.

**Observation (not a gap):** `REQUIREMENTS.md` still shows these four as `Pending` / unchecked. No
phase-6 plan lists `REQUIREMENTS.md` in `files_modified`, so the ledger update is owned by the
phase-close/ship step, not by any plan under verification here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` in any file this phase modified | — | **None found.** All 9 modified files scanned. |
| `index.ts` | 2669 | `MISSING_COMMAND_PLACEHOLDER` | ℹ️ Info | Not a stub marker. A named sentinel constant (`"\u0000unset"`) defined in `resolution-cache.ts:198`, pre-existing, referenced in a comment explaining a defensive read. No action. |

**Debt-marker gate: PASS.** Zero unreferenced debt markers introduced by this phase.

## Verifier Assessment — the code review's two Critical findings

The instruction was to judge these independently rather than inherit or dismiss the reviewer's
framing. I reproduced both findings in source before forming a view.

### CR-01 (provider spawn) — reproduced; a Phase 6 defect in kind, NOT a phase-goal blocker

Confirmed in code at `index.ts:3633-3645`: `return new Promise<Result<…>>((resolve) => { const proc =
spawnWithEnv(resolved, args, {…}) … })`, unguarded, inside a `try { … } catch (e)` at `:4143`. The
reviewer's JavaScript reasoning is correct on both legs: a synchronous throw inside a Promise
executor is captured by the `Promise` constructor and becomes a **rejection** (so `proc.on("error")`
at `:4132` never fires), and `return <rejected promise>` from an `async` function adopts that
rejection **without** passing through the enclosing `try`/`catch` (only `return await` would).

Where I part company with a pure "Phase 7 owns it" reading:

- **Phase 6 created the reachability.** Before this phase, on Windows nothing resolved — the resolver
  hardcoded POSIX directories and spawned `which`. `sendCliMessage` never reached a spawn because the
  provider was reported unavailable. Phase 6 is what makes `%APPDATA%\npm\<cli>.cmd` resolvable, and
  the install table it added tells Windows users to run the exact `npm install -g` that creates that
  file and no `.exe`. The reviewer's "mainline, not tail" characterisation holds.
- **The phase already accepted this class of ownership.** `spawnAndWait`'s new guard exists precisely
  because "this stopped being unreachable in Phase 6" — the phase's own words. Fixing one of three
  instances of an identical hazard whose reachability you introduced is an incomplete fix, not a
  deferral. This repo's own discipline (D-07's shape) is that a declined option is recorded beside
  the code; at `:3640` and `:1600` there is neither a guard nor a recorded non-claim nor a marker.
- **But the distinction the prompt draws is the right one, and it cuts both ways.** PRV-02 owns
  making a `.cmd` **launchable**; the never-rejects contract is a different property. And Phase 7
  SC-2 *structurally* removes CR-01's specific mainline trigger — once the spawn goes through
  `cmd.exe /d /s /c`, the CVE-2024-27980 guard is not tripped. So the `.cmd`-EINVAL half is genuinely
  deferred with roadmap evidence. What is **not** covered by any later phase's success criteria is
  the residual: any *other* synchronous throw (a NUL byte in a rehydrated persisted provider command —
  the same untrusted-blob argument `getNodeExecutable` already defends against at `:2666-2682`; or
  LLRT's unverified `child_process` shim) still rejects the RPC, strands the session with no terminal
  state, leaves `activeProcesses` unset so `cancelCliMessage` cannot clean up, and — the part that
  matters most against PROJECT.md's security constraint — leaves the **token-bearing**
  `mcp-<chatId>.json` and per-session approval/activity files on disk, because `finalize`'s `rm` calls
  never run.
- **Does it block the phase goal?** No. The goal is locatability, and locatability is achieved and
  proven. This is a defect that travels *with* the new capability, not a failure of it.

**Verdict: WARNING, owned by Phase 6 in kind, with the `.cmd` trigger deferrable to Phase 7 SC-2.**
Routed to the maintainer as a fix-vs-record-and-hand-off decision (human item 5), because either
resolution is defensible and only one of them is currently in evidence — silence is not.

### WR-01 (PATH-search spawn) — same shape, lower trigger probability, but inside Phase 6's own seam

Confirmed at `index.ts:1600`: `const child = spawn(searchCommand.command, searchCommand.args(command));`
unguarded inside `new Promise((resolve) => { … })`. This one sits in `resolveCommand` — the seam
Phase 6 built — and the comment immediately above it explicitly leans on the async `error` handler for
the Windows pre-probe case, which is the very assumption the new `spawnAndWait` guard argues you may
not make about this runtime.

Probability check, done independently: on stock Node, `spawn("which", …)` on Windows surfaces ENOENT
as an **event**, not a synchronous throw; the CVE guard applies to `.cmd`/`.bat` targets, and neither
`which` nor `where.exe` is one. So the realistic synchronous throwers are the NUL-byte argument case
and LLRT's unverified shim. Lower probability than CR-01 — but the blast radius is larger:
`resolveWithCache` re-throws, so the rejection travels `resolveCommand → checkProvider →
Promise.all → getProviderStatuses` and takes **all four** provider statuses down as one rejected RPC.
That is the exact symptom class this milestone exists to eliminate.

**Verdict: WARNING.** Same decision as CR-01, same human item.

### CR-02 (untrusted search path) — reproduced; the most consequential open item

Verified in source: `emitLocation(input.roots.programData, ["scoop", "shims"])` at
`command-resolution.ts:553` and `NVM_WINDOWS_SYMLINK_DIR = "C:\\nvm4w\\nodejs"` at `:24`, emitted at
`:614` and `:965`. I checked the reviewer's "or silence" branch specifically: **neither row carries a
security note**, while every other row in the catalogue lives under `USERPROFILE`/`APPDATA`/
`LOCALAPPDATA` (the user's own trust domain) or `%ProgramFiles%` (admin-only). The ladder emits
`.exe` first, so a planted `gemini.exe` wins its directory. A binary resolved from either row is
spawned with `CAIDO_URL`/`CAIDO_TOKEN` in its environment.

Two things temper it, and both should be on the record rather than used to wave it away: the exploit
requires a *local account on the victim's machine* (on the single-user pentester desktop that is the
user themselves; on a shared or domain-joined box it is real), and P-18 was sourced, so D-12 permits
it — the reviewer's actual point is that **sourced ≠ safe**, which is correct and is a gap in D-12's
bar rather than a violation of it.

**Verdict: WARNING, escalated to a maintainer decision (human item 4).** Not a goal blocker — SC-1's
own roadmap prose names scoop — but this module's cite-or-drop discipline makes an unrecorded
security trade-off the one outcome that is not available.

## Other defects confirmed (not goal blockers)

| Ref | Confirmed in source | Assessment |
|-----|--------------------|------------|
| **WR-02** | `host` is assigned at exactly one site (`index.ts:617`, inside `probeRuntime`, reached only from `startMcpServer`). Cache keys are `cmd:${command}` (`:1570`) and `"node"` (`:2733`). `clearResolutionCache` appears **zero times** in `index.ts` — only `syncResolutionCacheSignature` (provider-signature change) does. `getDiagnostics` calls `getCachedNodeExecutable()` at `:4290`, pre-probe. | **Real.** Combined with WR-03, a Windows user who opens Diagnostics before ever starting MCP caches a negative `"node"` entry for 30 s and can then be told Node is missing on a machine where it is installed. Narrows SC-1 to a conditional false-negative window; does not falsify the mechanism, which is why SC-1 stays VERIFIED rather than FAILED. Worth closing before Phase 7 leans on node resolution. |
| **WR-03** | `buildNodeCandidatePaths:894` gates on literal `"win32"`; `buildCommandCandidatePaths:723` unions `"win32" || undefined`. Verified by direct read. No summary in 06-01…06-07 records the asymmetry as a decision. | **Real, and it is the asymmetry that makes WR-02 bite.** Provider CLIs *do* resolve pre-probe on Windows (D-08 working as designed); only **node** loses its Windows rows. Either union it or write the non-claim beside the arm in D-07's shape. |
| **WR-04** | `spawnAndWait` (`:2559-2649`) has no `setTimeout` in its body; consumed at `:2700` as `await spawnAndWait(candidate, ["--version"])` inside the candidate walk. `stdio` is all-pipe and stdin is never ended. | **Real.** The new guard covers the *throw* shape, not the *hang* shape. Phase 6 newly feeds this loop `.bat`/`.cmd`/bare-name candidates. Partially overlaps Phase 7 SC-2 (which removes the `.cmd` case) but the missing time budget itself is owned by nobody. |
| **WR-05** | `getHomeDirCandidates` returns `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` as peers into a list named `homeDirs`, which `collectVersionManagerCommandCandidates` crosses with POSIX layouts. The "costs a POSIX machine nothing" claim appears three times in-source. | **Real but narrow.** WSLENV forwarding is opt-in and Wine is rare, so the ordinary POSIX case is byte-identical and the tests prove it. Flagged chiefly because an *asserted invariant* that is actually an *environment assumption* is precisely the kind of overclaim this project's discipline forbids elsewhere. Downgrade the comment or filter by shape. |
| **IN-01 / IN-02 / IN-03 / IN-04** | Duplicated `emitLocation`; ranker drops extensionless hits the ladder still accepts; `getWhichCommand`'s bare-name fallback silently drops the hijack-resistance the absolute path exists for; `listWindowsVersionDirs` does pre-probe I/O the node builder discards. | Confirmed as described. Housekeeping and comment-accuracy; none affects the goal. IN-03 is the one worth a one-clause comment now, since it is a security property being dropped without a note. |

## Human Verification Required

Five items. Three are the phase's own recorded non-claims — they are listed here so they stay visible,
**not** because the phase failed to do something it promised. Two are maintainer decisions.

### 1. Real-machine catalogue existence (RES-01)

**Test:** On a Windows machine carrying each supported installer layout (npm-global, Claude native,
Volta, pnpm, Bun, scoop user + machine, nvm-windows, fnm modern + legacy, Node MSI), call
`resolveCommand` for that provider and `getNodeExecutable`, and confirm the selected candidate is a
path that exists on disk.
**Expected:** No supported layout resolves to `undefined`.
**Why human:** The phase proves SPELLING, never EXISTENCE. `windows-latest` carries none of these
layouts; the maintainer has no Windows machine. A wrong path fails as a silent `stat` miss.
Closes on the Phase 9/10 real-machine report. **Explicitly not claimed by this phase.**

### 2. `WIN32_PATH_SEARCH_TIMEOUT_MS` headroom (WINDOWS.md entry 8 — deliberately OPEN)

**Test:** Time a cold `where.exe` spawn on a real Windows host with real-time AV enabled.
**Expected:** Well inside 5000 ms, or the constant is revised with the measured figure.
**Why human:** No such figure exists in this repository or in any first-party source found. The
source comment already forbids citing it as evidence. **Not claimed by this phase.**

### 3. `where.exe` cross-extension output order and no-match stream (RES-02)

**Test:** Two PATH entries, same command name, different extensions; record output order and which
stream carries the no-match line.
**Expected:** Any answer — the ranking and the two guards are correct under all of them.
**Why human:** Undocumented upstream; Phase 3's measurement could not discriminate. Confidence
upgrade only, not a blocker.

### 4. Security decision on the two non-admin-writable catalogue rows (CR-02)

**Test:** Decide the disposition of `%ProgramData%\scoop\shims` and `C:\nvm4w\nodejs`.
**Expected:** Drop the `programData` row and gate `C:\nvm4w\nodejs` on `NVM_HOME`/`NVM_SYMLINK`
presence, **or** keep both with an explicit recorded non-claim beside each row naming the
`CAIDO_TOKEN` exposure.
**Why human:** A coverage-versus-exposure trade-off touching PROJECT.md's token constraint. Verified:
neither row currently carries a note. Under this module's own cite-or-drop discipline, silence is the
one outcome not available.

### 5. Ownership decision on the two remaining unguarded spawns (CR-01, WR-01)

**Test:** Decide whether `index.ts:3640` and `index.ts:1600` get the one-guard shape `spawnAndWait`
already carries, or a recorded non-claim plus a greppable marker naming the owning phase.
**Expected:** Either — but one of them, in evidence.
**Why human:** Verifier assessment above concludes this is a Phase 6 defect *in kind* while the
`.cmd` trigger is structurally deferrable to Phase 7 SC-2. The fix-vs-defer call is the maintainer's.

## Gaps Summary

**No gaps.** No must-have truth failed, no artifact is missing or a stub, no key link is unwired, no
debt marker was introduced, and no anti-pattern rises to blocker. The phase goal — reliably locating
`node.exe` and the provider CLIs on Windows with absolute, correctly-extensioned paths — is achieved
in the codebase, and the evidence architecture the phase argued for (pure builders, byte-exact
assertions from literal inputs, a Linux runner that is not being tested in place of Windows) holds up
under independent checking rather than merely being asserted in the summaries.

Two things distinguish this phase from a routine pass and are worth recording:

1. **The claims carry their evidence.** The CI citation resolves and says what it claims — run
   `32481129011`, commit `3f7c7b3`, `Verify (Windows)` job `96767522062`, log line
   `Tests 408 passed (408)`, with the only later commits being docs-only. The three roadmap-path
   corrections match the installer sources they cite. The two CMP-01 proofs are non-vacuous. The
   purity claim survives a mechanical check, not just a reading. 06-07 even reported its own
   phase-close gate as *malformed* rather than adjusting it until it passed.
2. **The defects are real and are reported separately, as instructed.** CR-02 in particular is a new
   token-exposure surface this phase opened with no recorded trade-off, and CR-01/WR-01 leave an
   invariant this phase itself restored at one site unguarded at two others. None of them falsifies
   a phase-6 must-have. All of them should be resolved — by a fix or by a recorded non-claim —
   before Phase 7 builds the spawn path on top of this resolver.

Status is `human_needed` rather than `passed` because the human-verification section is non-empty,
per the decision tree. It is **not** `gaps_found`: nothing here needs replanning.

---

_Verified: 2026-08-21T14:50:00Z_
_Verifier: Claude (gsd-verifier)_
