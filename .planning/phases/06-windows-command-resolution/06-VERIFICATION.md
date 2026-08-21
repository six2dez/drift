---
phase: 06-windows-command-resolution
verified: 2026-08-21T15:30:00Z
status: passed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  pass: 2
  previous_status: human_needed
  previous_score: 15/15
  scope: "Not a re-derivation of the 15 must-haves. Confirms the two post-verification fixes are real in source and that nothing they touched regressed."
  human_items_resolved:
    - "Item 4 (CR-02, security) — fixed in f18be4d. Verified in source at all four sites."
    - "Item 5 (CR-01/WR-01, ownership) — fixed in 44c957f. Verified in source at both sites."
  human_items_blocked:
    - "Item 1 (real-machine catalogue existence) — blocked_by: physical-device"
    - "Item 2 (cold where.exe latency vs the 5000 ms estimate) — blocked_by: physical-device"
    - "Item 3 (where.exe cross-extension ordering) — blocked_by: physical-device"
  gaps_closed:
    - "CR-01/WR-01: the provider spawn and the PATH-search spawn now carry spawnAndWait's guard shape; the token-bearing mcp-<chatId>.json is removed on a synchronous spawn throw."
    - "CR-02: %ProgramData%\\scoop\\shims emits no candidate; C:\\nvm4w\\nodejs is gated on isNvmWindowsInstalled at both node-builder emission sites."
  gaps_remaining: []
  regressions: []
  new_warnings:
    - "CI evidence no longer covers HEAD. The cited run (32481129011) is at 3f7c7b3; 44c957f and f18be4d are SOURCE commits after it and have zero CI runs. `Verify (Windows)` has not seen the +11 tests. Mitigation measured (path->path.win32 shim, zero delta vs 3f7c7b3), not assumed. Ship-step gate, not a phase gap."
deferred:
  - truth: "A resolved `.cmd` shim can actually be launched on Windows"
    addressed_in: "Phase 7"
    evidence: "Phase 7 SC-2: 'Provider `.cmd` shims spawn via a `cmd.exe /d /s /c <shim> <args>` argv array with `shell:false` (or the underlying `node.exe` entry directly)'. Phase 6 explicitly and repeatedly declines this claim in-source (spawnAndWait comment, the new provider-spawn guard at index.ts:3703-3707, Volta P-11/P-12 comment, getKnownHomeDirs comment)."
  - truth: "The Windows PATH-search spawn suppresses the console-window flash"
    addressed_in: "Phase 10"
    evidence: "UX-04 marker present in-source at index.ts:1602-1608 naming Phase 10 as owner; `windowsHide` appears in zero source files, which is the scope fence holding."
  - truth: "The `where.exe` search-candidate list is surfaced to the user in the not-found banner"
    addressed_in: "Phase 10"
    evidence: "D-16 rejects it explicitly and names UX-04 / Phase 10; `lastNodeSearchCandidates` is retained and read by getDiagnostics."
  - truth: "The Windows candidate catalogue names directories that EXIST on a real install (RES-01 existence half)"
    addressed_in: "Phase 9/10 real-machine report"
    evidence: "06-UAT.md test 1, result `blocked`, blocked_by `physical-device`. The phase's own recorded non-claim: it proves SPELLING, never EXISTENCE. Maintainer has no Windows machine (PROJECT.md § Constraints)."
  - truth: "`WIN32_PATH_SEARCH_TIMEOUT_MS = 5000` is adequate for a cold `where.exe` spawn under real-time AV"
    addressed_in: "Phase 9/10 real-machine report"
    evidence: "06-UAT.md test 2, result `blocked`, blocked_by `physical-device`. WINDOWS.md entry 8 correctly still OPEN; the source comment forbids citing the number as evidence."
  - truth: "`where.exe`'s cross-extension output order and no-match stream are measured"
    addressed_in: "Phase 9/10 real-machine report"
    evidence: "06-UAT.md test 3, result `blocked`, blocked_by `physical-device`. Resolved by DESIGN (explicit ranker sort + exit-code gate + extension-termination filter), correct under every ordering; confidence upgrade only."
---

# Phase 6: Windows Command Resolution — Verification Report

**Phase Goal:** Make `node.exe` and the provider CLIs reliably locatable on real Windows machines so the Phase 5 spec can be populated with absolute, correctly-extensioned paths.
**Verified:** 2026-08-21T15:30:00Z (pass 2 — re-verification after two post-verification fixes)
**Status:** passed
**Re-verification:** Yes — pass 1 (2026-08-21T14:50:00Z) returned `human_needed` at 15/15 with five human items. All five are now resolved: two fixed in code, three recorded `blocked` on physical-device in `06-UAT.md`.

**Verdict in one line: the phase goal is achieved and the two maintainer decisions shipped as real code.** All five ROADMAP success criteria still hold, both fixes were reproduced in source rather than taken from their commit messages, and no invariant this phase argued for regressed. One new warning is recorded below — the cited CI run no longer covers HEAD — with a measured mitigation and a ship-step action.

---

## Re-Verification (pass 2) — what was checked in source vs taken from commit messages

Everything below was reproduced by reading the working tree at `a2c3543` and by running commands
first-hand. Commit messages were used only to locate what to look at, never as evidence.

### 1. CR-01 / WR-01 — the guard at both sites (`44c957f`) — **HOLDS**

| Check | Result | Evidence (read in source, not in the commit message) |
|---|---|---|
| Provider spawn carries the guard | ✓ | `index.ts:3719-3745`. `let proc: ChildProcessWithoutNullStreams; try { proc = spawnWithEnv(...) } catch (e) { ... return; }` — the same `let`-declare / `try`-assign / `catch`-resolve / `return` shape `spawnAndWait` already used, not a second idiom. |
| PATH-search spawn carries the guard | ✓ | `index.ts:1628-1636`. `let child: ChildProcessWithoutNullStreams; try { child = spawn(searchCommand.command, searchCommand.args(command)); } catch { resolve(undefined); return; }`. Same shape. |
| `child.on("error")` preserved byte-for-byte | ✓ | The `44c957f` hunk at this site is `@@ -1605,7 +1605,35 @@` — exactly one line removed (the bare `const child = spawn(...)`), 29 added. The handler is untouched and now sits at `index.ts:1710`. |
| **The executor rejected 06-REVIEW's own suggested fix — is its reasoning right?** | ✓ **The executor is correct, and the review's premise is factually wrong** | 06-REVIEW.md:134 asserts "`finalize` is declared above the returned promise, so it is in scope." In source, `const finalize = (result) => {...}` is at **`index.ts:3940`**, and the Promise executor it lives in **begins at `index.ts:3669`** (`return new Promise<Result<SendCliMessageOutput>>((resolve) => {`). The spawn is at `:3721`. So at the spawn, `finalize` is a `const` in the *same* executor scope, not yet initialised — TDZ. Calling it throws `ReferenceError` synchronously inside the executor and rejects the exact promise the guard exists to keep resolving. **Stronger than the executor claimed:** the catch arm `return`s, so line 3940 is never evaluated on that path at all — the binding is never initialised, so the ReferenceError would be permanent rather than a race. The executor took 06-REVIEW's own stated fallback (`:134-135`: "if it is not, hoist the `rm` cleanup into the catch arm explicitly"). |
| **Does the inline `rm` cleanup actually mirror `finalize`'s?** | ✓ **Both blocks present; the token leak is closed** | Catch arm (`:3737-3743`) vs `finalize` (`:3956-3968`): `runtimeFiles !== undefined` → `sessionRuntimeFiles.delete(input.sessionId)` + `rm(runtimeFiles.activityFilePath, {force:true})` + `rm(runtimeFiles.approvalsFilePath, {force:true})`; then `claudeMcpConfigPath !== undefined` → `rm(claudeMcpConfigPath, {force:true})`; then `disposeSessionDebugLog(...)`; then `resolve(...)`. Same two blocks, same order, same `.catch(() => undefined)` swallow. The **token-bearing `mcp-<chatId>.json` is removed**, which is the whole point of the finding. |
| Are `finalize`'s *unmirrored* statements a real omission? | ✓ No — provably nothing to clear | `finalize` also does `clearTimeout(timeout)` / `clearInterval(activityInterval)` / `sessionWatchdogs.delete` / `activeProcesses.delete` / `flushActivities({drain:true})`. Every one of those bindings is created **after** the spawn: `activeProcesses.set` `:3761`, `settled` `:3799`, `activityInterval` `:3852`, `sessionWatchdogs.set` `:3869`, `timeout` `:3977`. At `:3737` there is no timer, no interval, no registry entry and no activity to flush. |
| Is the catch arm itself TDZ-safe? | ✓ | Everything it touches is declared in the **enclosing function** scope, before the executor: `setSessionState` `:3247`, `runtimeFiles` `:3290`, `sessionDebugLogPath` `:3300`, `claudeMcpConfigPath` `:3301`. |
| Is there a **third** unguarded Promise-executor spawn? | ✓ Checked and correctly out of scope | `index.ts:2192` (`callMcpMethod`) is also `spawnWithEnv` inside `new Promise((resolve, reject) => {`. It is materially different: it is a **reject-carrying** promise by design, and both call sites `await` it inside `try/catch` (`:2421-2451` and `:2454+`). A synchronous throw lands in the channel the function already uses. "Both sites" was therefore the complete set for the never-rejects invariant. |
| Nothing claims `.cmd` is launchable | ✓ | All four `launchable` hits repo-wide are disclaimers (`command-resolution.ts:560`, `index.ts:1760`, `:2637`, `:3703`). `PRV-02` markers at `command-resolution.ts:560`, `:991`, `index.ts:2640-2643`, `:3705-3707`. |
| No executing test for the fix | ⚠️ Accurate, structurally forced | Verified: `vitest.config.ts` declares aliases for `vue` and `pinia` only — there is **no `caido:plugin` alias**, so `index.ts` genuinely cannot be imported under vitest. 06-REVIEW's requested unit test ("make the injected spawn throw synchronously and assert the promise resolves") is impossible without a refactor. The reason is recorded in-source and in `mcp-server-spec.spawn.test.ts:33`, and matches WINDOWS.md entry 5's class. |
| ℹ️ Commit-message inaccuracy | Cosmetic | `44c957f` says "Both carry the PRV-02 marker." Only the provider site does. The PATH-search site instead correctly states the `.cmd` EINVAL does not apply there (neither `which` nor `where.exe` is a `.cmd`), which is why a PRV-02 marker would be inapposite. No functional impact. |

### 2. CR-02 — the attack surface (`f18be4d`) — **HOLDS**

| Check | Result | Evidence |
|---|---|---|
| `%ProgramData%\scoop\shims` emits no candidate | ✓ | `command-resolution.ts:585` is the **commented-out** `// emitLocation(input.roots.programData, ["scoop", "shims"]);`. `grep -n programData packages/backend/src/command-resolution.ts` returns **that one commented line and nothing else** — no other consumer, no other suffix. |
| `C:\nvm4w\nodejs` gated at **both** node-builder emission sites | ✓ | `NVM_WINDOWS_SYMLINK_DIR` is emitted at exactly two places. Site A — shared table: `command-resolution.ts:663` `if (input.emitRootlessLiteral && input.nvmWindowsInstalled) { emitLocation(NVM_WINDOWS_SYMLINK_DIR, []); }` (`:664`). Site B — node-specific pre-table row: `:1044` `if (input.nvmWindowsInstalled) { emitLocation(NVM_WINDOWS_SYMLINK_DIR, []); }` (`:1045`). The executor's "either alone leaves the row reachable through the other" is correct: the node builder passes through **both** paths. |
| The gate arrives as **injected input**, never a `process.env` read in a builder | ✓ | `nvmWindowsInstalled: boolean` is a **required** (non-optional) field on all four signatures: `:438` (`buildWindowsInstallLocationCandidates`), `:702` (`buildCommandCandidatePaths`), `:856` (`getCommandExecutableCandidates`), `:896` (`buildNodeCandidatePaths`), `:1071` (`getNodeExecutableCandidates`). Computed only at the two I/O boundaries: `index.ts:1734` and `index.ts:2701`, both `isNvmWindowsInstalled({ env: readParentEnv() })`. `isNvmWindowsInstalled` (`platform.ts:578`) takes `env` as an input — `platform.ts` still contains zero `process` reads. |
| Both removals recorded as in-code non-claims naming the security reason (D-12 cite-or-drop) | ✓ | Four recorded sites: the `SECURITY` block at `command-resolution.ts:506-535` (names `CAIDO_URL`/`CAIDO_TOKEN`, the default ACLs, CWE-426/427, and why ordering-the-rows-last was rejected); the dropped-row note at `:581-585`; the nvm-gate note at `:1037-1044`; and the **no-consumer** non-claim on the surviving `programData` root at `platform.ts:536-548`. The "or silence" branch this report flagged in pass 1 is closed. |
| Gate semantics | ✓ Sound | `isNvmWindowsInstalled` is an OR-presence test over `NVM_HOME` / `NVM_SYMLINK` in both case spellings, treating empty/whitespace as absent. It is a **presence** test, not a value read — the emitted path stays the installer's own literal rather than a user-settable directory, which is recorded as a deliberate non-change at `platform.ts:566-572`. |

### 3. Invariants that must not have regressed — **none did**

| Invariant | Result | Evidence |
|---|---|---|
| Builders are I/O-free (SC-5's whole evidence argument) | ✓ | Re-run mechanically at HEAD, brace-matched body extraction with comment lines stripped, scanned for `await` / `stat(` / `readdir(` / `pathExists` / `process.`: `buildCommandCandidatePaths` 90 lines → **0 hits**; `buildNodeCandidatePaths` 161 → **0**; `buildWindowsInstallLocationCandidates` 229 → **0**. No `deps` object injected into any of them. |
| `platform.ts` has zero imports | ✓ | `grep -c "^import "` → **0**. The only `process.` / `require` matches in the file are inside comments (`:493`, `:575`, `:582`, `:609`). |
| The three CMP-01 byte-identity tests still green **and non-vacuous** | ✓ | `command-resolution.test.ts:834-892` — linux / darwin / pre-probe `undefined`, each a whole-array `toEqual(CMP_01_POSIX_CANDIDATES)` against a **12-entry POSIX literal** (`:801-816`). `f18be4d` changed **no assertion** in them: the only edit was adding `nvmWindowsInstalled: false` to the shared `cmp01PosixInput` fixture. The append-after and duplicate-homeDir cases are likewise untouched. `platform.test.ts`'s `joinPath` CMP-01 block (`path.posix.join` oracle) was not touched at all — `f18be4d`'s platform-test diff is exactly two hunks: one import line and one new `describe`. |
| Judgement: is the added gate-ON CMP-01 case justified? | ✓ Justification holds, and the test does not depend on it | The WSLENV rationale is real but opt-in (a user must list `NVM_HOME` in `WSLENV` for it to forward), so "not hypothetical" is a fair but not strong claim. It does not matter: the test's actual content is that the new input **cannot widen the POSIX arm under any value** — it asserts the same 12-entry literal for `linux` / `darwin` / `undefined` with the gate ON. The realistic collision is the one the sibling decoy test catches: POSIX `nvm` sets **`NVM_DIR`**, which `isNvmWindowsInstalled` correctly does **not** match (`platform.test.ts` "ignores unrelated variables, including a same-prefix decoy", which also excludes `NVM_HOME_DIR`). That is the assertion that actually protects CMP-01, and it exists. |
| Test delta 408 → 419 is real added coverage | ✓ Exactly +11, all new | Measured first-hand: `platform.test.ts` **114 → 120** (+6 `isNvmWindowsInstalled` cases) and `command-resolution.test.ts` **43 → 48** (+4 CR-02 regression, +1 CMP-01 gate-ON) = 168 for the two phase-6 files, +11 overall. Nothing was deleted. |
| Changed expectations changed because BEHAVIOUR changed, not to pass | ✓ Verified line by line | (a) `36 → 32`: one whole location × the 4-spelling ladder left the catalogue — arithmetic, and the test title was renamed to say so. (b) The four `C:\ProgramData\scoop\shims\claude.*` rows were removed from a **whole-array `toEqual`**, and `WIN32_ROOTS` **still populates `programData`** — so the fixture still supplies the variable and the row's absence is a strictly *stronger* assertion than dropping the root would have been. (c) The location-major ordering test re-anchored from machine-wide scoop (now deleted) to per-user scoop; the ordering claim itself (`fixed locations < version rows < rootless literal`) is character-for-character unchanged. (d) The case-fold test lost exactly one `.CMD` line, matching the same deletion. **None of these is a weakened assertion:** the new CR-02 block uses `candidates.filter(c => c.includes("ProgramData")).toEqual([])` — whole-root absence under any future suffix, not a single-spelling `not.toContain` — and restores T-06-T02 to its strongest form (`toEqual([])` with no roots and the gate off). |
| Previously-recorded open defects unchanged (no silent scope creep) | ✓ | WR-02: `clearResolutionCache` still appears **0** times in `index.ts`. WR-03: the asymmetry stands — `buildCommandCandidatePaths` unions at `:776` (`"win32" || undefined`) while `buildNodeCandidatePaths` gates on the literal at `:958`. Scope fence 12: `normalizePathForCompare` still has **zero** production callers. These remain open WARNINGs, as recorded in pass 1. |
| Suite / typecheck / lint | ✓ | Run first-hand at HEAD: `pnpm exec vitest run` → **31 files / 419 passed (419)**; `pnpm -r typecheck` → shared / backend / frontend all "Done", exit **0**; `pnpm lint` (`eslint . --max-warnings 0`) → exit **0**, no output. |
| Debt markers introduced by the two fixes | ✓ None | `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` / `PLACEHOLDER` across all five touched files → **0** (the pre-existing `MISSING_COMMAND_PLACEHOLDER` sentinel excluded, as in pass 1). |
| Scope fence: `windowsHide` | ✓ | Still **0** occurrences across `packages/` and `README.md`. |

### 4. NEW WARNING — the cited CI run no longer covers HEAD

Pass 1's truth 15 rested on an explicit clause: *"The two commits between `3f7c7b3` and HEAD are
docs-only … so the CI run covers HEAD's source exactly."* **That clause is now false.** `44c957f`
and `f18be4d` are source commits landed after `3f7c7b3` (+102 net lines in `index.ts`, ~+150 in
`command-resolution.ts` / `platform.ts`, +248 in the two test files).

Checked, not assumed: `gh run list --commit <sha>` returns **zero runs** for `44c957f`, `f18be4d`,
`b9c8f4e` and `a2c3543`. The only CI evidence for this phase remains run `32481129011` at
`3f7c7b3`, obtained by pushing the scratch branch `origin/scratch/ci-06-07-phase-close`; `main` is
207 commits behind local HEAD. So **`Verify (Windows)` has never seen the +11 tests**, and this repo
has a 2-for-2 record of that exact leg catching host-path-flavour bugs in exactly these two files
(WINDOWS.md entries 6 and 7).

**Mitigation — measured, not asserted.** I reproduced entry 7's own measurement technique: a
`path` → `path.win32` alias shim, run against both `command-resolution.test.ts` and
`platform.test.ts`, at HEAD **and** at the CI-green commit `3f7c7b3` (isolated git worktree, since
removed).

| Tree | Result under the win32-path shim |
|---|---|
| `3f7c7b3` (CI-green) | 2 failed / 41 passed in `command-resolution.test.ts`; `platform.test.ts` 114/114 |
| HEAD `a2c3543` | 2 failed / 166 passed across both files; `platform.test.ts` 120/120 |

The two failures are **identical in both trees** — the same pre-existing `mkdtemp`-backed
integration assertions (`command-resolution.test.ts:98` and `:127`), which fail only because the
shim puts a win32 path module over a POSIX filesystem, a combination `windows-latest` does not
produce. **Delta = zero.** All 11 new tests pass under the win32 flavour, which is expected: every
one of them is built from literal strings and touches no `path` module and no `process.platform`.

**Classification: WARNING, not a gap.** No must-have failed and no artifact is missing; the
freshness of one evidence citation lapsed, and the residual risk was measured down rather than
waved away.

**Ship-step action (blocking before Phase 7):** `Verify (Windows)` and the ubuntu matrix must be
green at HEAD. This is the push/PR step's job — CI triggers on push to `main` — not a phase gap to
replan.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | On Windows, Drift locates `node.exe` via `where` plus Windows install-location candidates | ✓ VERIFIED | `buildNodeCandidatePaths` win32 arm (`command-resolution.ts:958-1055`) emits P-13 Volta node image → P-02 `%ProgramFiles%\nodejs` → P-03 `%ProgramFiles(x86)%\nodejs` → P-06 `C:\nvm4w\nodejs` **(now gated on `isNvmWindowsInstalled`, CR-02)**, then the full shared table. Wired at `index.ts:2696-2701` (`getNodeExecutableCandidates` → `fileExists` → `spawnAndWait --version`). `getWhichCommand` win32 arm supplies the search binary. **Roadmap-vs-research corrections verified row by row against 06-RESEARCH § Named-Root Table:** nvm-windows under `%LOCALAPPDATA%\nvm` (P-04), symlink `C:\nvm4w\nodejs` (P-06), fnm modern under `%APPDATA%\fnm` (P-08) — all present as corrected, each carrying its installer-source citation inline. Pass 2: the catalogue lost one row (machine-wide scoop) by maintainer decision; SC-1's roadmap prose names scoop, and per-user scoop is retained, so the criterion still holds. |
| SC-2 | Provider CLIs resolve to an absolute path with explicit extension, `.exe` over `.cmd`, `\r`-safe multi-line parse | ✓ VERIFIED | `rankPathSearchHits` (`platform.ts:380-427`) ranks every line by `WINDOWS_EXECUTABLE_EXTENSIONS` with an **explicit** `order` tie-break (not relying on `Array.sort` stability under a constrained engine). Wired at `index.ts:1700-1708`: `out.head.split(/\r?\n/)` → `ranked[0]`, gated on `code === 0`. `getExecutableNames` supplies the `.exe`→`.cmd`→`.bat`→bare ladder to the directory walk. Non-win32 arm returns `lines[0].trim()` — byte-identical to the `split("\n",1)[0]` it replaces. |
| SC-3 | Home-dir detection recognizes `C:\Users\<name>` and reads `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, **while macOS/Linux `HOME` is unchanged** | ✓ VERIFIED | `extractHomeDir` (`command-resolution.ts:258-337`) gains a platform-blind drive-letter arm accepting **both** separator spellings, returning the separator it was given, rejecting `.`/`..` traversal, with the UNC and non-`Users` non-recognitions recorded beside the code. `getHomeDirCandidates` (`platform.ts:457-474`) unions both name sets on `undefined`. Wired at `getKnownHomeDirs` (`index.ts:1764-1773`) — the POSIX `process.env.HOME` hardcode is gone. **CMP-01 half verified non-vacuously** — see truths 6 and 8. |
| SC-4 | "CLI / Node not found" shows correct per-provider Windows install commands, incl. the `@github/copilot` correction | ✓ VERIFIED | `PROVIDER_INSTALL_COMMANDS` in `packages/shared/src/cli-providers.ts`, typed `Record<CliProvider, ProviderInstallCommands>` so an omitted arm is a compile error. Copilot = `npm install -g @github/copilot` on **both** arms (D-14). `getProviderInstallHint` has win32 / posix / union-when-unknown arms. `NODE_EXECUTABLE_ERROR` split into `getNodeExecutableError(platform)` with a win32 arm naming nodejs.org LTS + `winget install OpenJS.NodeJS.LTS` (D-16). Both live surfaces render from the one table (backend banner + `HelpView.vue`). Untouched by either fix. |
| SC-5 | Extended `command-resolution` unit tests cover the Windows cases and run green on the Linux CI runner | ✓ VERIFIED | `platform.test.ts` **120** tests + `command-resolution.test.ts` **48** tests = **168 green**; full suite **419/419 green** locally at HEAD (was 157 / 408 at pass 1; the +11 delta is audited above and is all new coverage). CI run **32481129011** at `3f7c7b3`: `Verify (Node 20/22/24/26)` all success, `Verify (Windows)` (job `96767522062`) success, log line read first-hand `Tests 408 passed (408)`. **Caveat added in pass 2:** that run predates the two fix commits — see § 4 above for the measured host-flavour mitigation and the blocking ship-step action. |
| 6 | `joinPath({platform:'linux', …})` is byte-identical to `path.join(…)` for every POSIX suffix the builders emit (CMP-01 proof 1) | ✓ VERIFIED | `platform.test.ts` — 23 rows × 2 assertions, oracle is `path.posix.join` (made POSIX **by construction**, not by accident of runner, after WINDOWS.md entry 7). Non-vacuous: real oracle, real literal rows, whole-string `toBe`. Independently re-derived by the code reviewer at 0 divergences. **Untouched by `f18be4d`** (that commit's platform-test diff is one import line plus one new `describe`). |
| 7 | The candidate builders are genuinely PURE — SC-5's whole evidence architecture (D-10) | ✓ VERIFIED | Re-checked mechanically **at HEAD, after the CR-02 change**: brace-matched body extraction, comments stripped, scanned for `await` / `stat(` / `readdir(` / `pathExists` / `process.` — **0 hits** in `buildCommandCandidatePaths` (90 lines), `buildNodeCandidatePaths` (161), `buildWindowsInstallLocationCandidates` (229). The new gate arrives as an injected `boolean`, computed at `index.ts:1734` / `:2701`; no `deps` object is injected into any builder. All I/O still sits in `getCommandExecutableCandidates` / `getNodeExecutableCandidates` / `listWindowsVersionDirs`. |
| 8 | The pre-split POSIX candidate ORDER is preserved string-for-string (CMP-01 proof 2) | ✓ VERIFIED | `command-resolution.test.ts:801-892` — `CMP_01_POSIX_CANDIDATES` is a 12-entry POSIX **literal** array asserted with whole-array `toEqual` (never `toContain`, which cannot detect reordering) across linux / darwin / pre-probe `undefined` / duplicate-homeDir, plus the win32-rows-append case. Non-vacuous. Pass 2 adds a **fifth** case pinning byte-identity with the CR-02 gate ON. |
| 9 | Cite-or-drop (D-12): every win32 row carries an inline source; every unsourced path is a recorded non-claim | ✓ VERIFIED | Every `emitLocation` in `buildWindowsInstallLocationCandidates` is preceded by a P-nn citation naming the installer script / package source / first-party doc. DROP rows recorded in the table header comment: roaming-appdata nvm (P-07, unsourced), `%ProgramFiles%\Volta` (P-14, holds volta.exe only), asdf on native Windows (P-20), userprofile `.volta` on win32, and — added by CR-02 — machine-wide scoop (P-18, **sourced and dropped anyway**, with the SECURITY block at `:506-535` recording that sourced ≠ safe). P-03 is kept and **tagged `[ASSUMPTION]` in-source**. |
| 10 | `spawnAndWait`'s documented never-rejects invariant holds now that the resolver emits `.cmd`/`.bat` | ✓ VERIFIED | `index.ts:2613-2629` — `let proc; try { proc = spawn(...) } catch { resolve({code:1, …}); return; }`. Deliberately absent, and stated as such: any shell option, any interpreter wrapper, any extension check. **Pass 2 extends this truth:** the same shape now covers the provider spawn (`:3719-3745`) and the PATH-search spawn (`:1628-1636`), and the third executor spawn (`callMcpMethod`, `:2192`) was checked and is correctly exempt because it is reject-carrying and both callers `await` inside `try/catch`. |
| 11 | `platform.ts` still has zero imports and performs zero I/O | ✓ VERIFIED | `grep -c "^import "` → **0** at HEAD, after `f18be4d` added `isNvmWindowsInstalled` to it. No `require`, no `process.`, no fs/spawn call anywhere in the file (the only matches are inside comments). |
| 12 | All five scope fences intact | ✓ VERIFIED | `windowsHide` → **0 occurrences** repo-wide, while a `UX-04 / Phase 10` marker sits at the PATH-search spawn (`index.ts:1602-1608`). No claim anywhere that a `.cmd` is launchable — all four `launchable` hits are disclaimers, and the new provider-spawn guard adds a fifth explicit one (`:3702-3707`). `normalizePathForCompare` still exported at `runtime-probe.ts:677` with **zero production callers** and its preservation reason recorded. No execution-policy copy on any surface. |
| 13 | The four stale in-repo comments are corrected in place | ✓ VERIFIED | Verified by search, non-vacuously: `grep` for the stale phrasings (`Phase 6 does not`, `Phase 6 will call`, `not implemented here`, `zero-caller`) → **0 hits**, and the **corrected** text was positively located at each site. `runtime-probe.ts` first-caller banner records D-07's decline (commit `b8e287c`, comment-only, +23/-5). |
| 14 | The archived Copilot command is gone everywhere except the untouched CHANGELOG | ✓ VERIFIED | `gh-copilot` / `gh extension install` / `gh copilot` across `packages/**` + `README.md`: the only hits are two explanatory comments and two negative test assertions. `CHANGELOG.md:75` retains the 0.1.0 record **unedited** — the prohibition holding, not a miss. `README.md` returns 0 for all four deprecated tokens. |
| 15 | Suite, typecheck and lint green | ✓ VERIFIED, with the pass-2 caveat | Local at HEAD, run first-hand: `vitest run` **419/419**, `pnpm -r typecheck` exit 0 (tsc + vue-tsc), `pnpm lint` exit 0 at `--max-warnings 0`. CI at `3f7c7b3`: Typecheck / Lint / Test / Build all success on `windows-latest` **and** ubuntu Node 20/22/24/26. **The pass-1 clause "the commits since that run are docs-only" no longer holds** — see § 4. |

**Score:** 15/15 truths verified (0 present-but-behaviour-unverified).

### What this score does NOT certify

Stated plainly because the phase's own discipline demands it, and because a clean 15/15 could
otherwise be misread:

- **No Windows machine has run this code.** The evidence is the pure logic (byte-exact, from literal
  inputs, on Linux/macOS) plus a green build-and-test on `windows-latest` **at `3f7c7b3`, not at
  HEAD**. The catalogue's **spelling** is proven; its **existence** on a real install is not, and is
  not claimed. (06-UAT test 1, `blocked`.)
- **`WIN32_PATH_SEARCH_TIMEOUT_MS = 5000` is an estimate, not a measurement.** WINDOWS.md entry 8 is
  correctly left OPEN. Nothing downstream may cite it as evidence — the source comment says so.
  (06-UAT test 2, `blocked`.)
- **The `where.exe` cross-extension output order is unmeasured.** The code is correct under every
  answer by design (explicit ranking + two independent guards), which is a different and weaker
  claim than having measured it. (06-UAT test 3, `blocked`.)
- **The CR-01/WR-01 guard has no executing test.** `index.ts` cannot be imported under vitest (no
  `caido:plugin` alias — verified in `vitest.config.ts`). Its evidence is source review, typecheck
  and lint. This matches the class WINDOWS.md entry 5 already records for Phase 5.
- **`Verify (Windows)` has not run at HEAD.** See § 4. The host-flavour risk was measured down to a
  zero delta; it was not eliminated.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/platform.ts` | `joinPath`, `getWhichCommand`, `rankPathSearchHits`, `getHomeDirCandidates`, `getWindowsNamedRoots`, `WINDOWS_EXECUTABLE_EXTENSIONS`, `getExecutableNames`, **`isNvmWindowsInstalled`** | ✓ VERIFIED | All present and exported. 0 imports, 0 I/O, after the CR-02 addition. Consumed by `command-resolution.ts` and `index.ts`. |
| `packages/backend/src/platform.test.ts` | Windows cases + CMP-01 byte-identity + CR-02 gate | ✓ VERIFIED | **120** tests green; the CMP-01 `joinPath` block untouched by `f18be4d`. |
| `packages/backend/src/command-resolution.ts` | Pure builders, sourced win32 catalogue, `extractHomeDir` win32 arm, `foldCandidateKey`, `getProviderInstallHint`, **CR-02 gate threading + SECURITY non-claims** | ✓ VERIFIED | All present. Only surviving `path`-module call is the ONE deliberate `path.dirname`, documented as the exception. |
| `packages/backend/src/command-resolution.test.ts` | Windows catalogue + CMP-01 order + hint assertions + **CR-02 regression fence** | ✓ VERIFIED | **48** tests green; whole-array `toEqual` assertions retained; new `filter(...).toEqual([])` absence fences. |
| `packages/backend/src/index.ts` | `resolveCommand` wiring, `getKnownHomeDirs`, `getNodeExecutableError`, `spawnAndWait` guard, timeout constants, **guards at both remaining executor spawns, CR-02 gate computation** | ✓ VERIFIED | All wired. See Key Link table and § 1/§ 2 above. |
| `packages/backend/src/runtime-probe.ts` | `normalizePathForCompare` preserved, uncalled, reason recorded | ✓ VERIFIED | Exported at `:677`, 0 production callers, D-07 decline recorded in-source. Untouched by both fixes. |
| `packages/shared/src/cli-providers.ts` | Install-command table keyed by the provider union | ✓ VERIFIED | `PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands>`. Data only. Untouched by both fixes. |
| `packages/frontend/src/views/HelpView.vue` | Renders the install list from the shared table | ✓ VERIFIED | `import { … } from "shared"`; `Object.values(CliProvider).map(...)` + one `v-for`. Zero hardcoded install commands. Untouched. |
| `README.md` | Windows probe-set prose, no deprecated command | ✓ VERIFIED | § CLI Providers names the Windows set in summary form and defers to the source; 0 deprecated-command hits. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts resolveCommand` | `getWhichCommand` | `{platform: host?.platform, env: readParentEnv()}` → `spawn` | ✓ WIRED | `index.ts:1597-1600`. Turns Phase 4's zero-caller export into shipped behaviour. |
| `index.ts resolveCommand` | `spawn` guard | `let child; try { child = spawn(...) } catch { resolve(undefined); return; }` | ✓ WIRED | `index.ts:1628-1636`. **New in pass 2 (`44c957f`).** `child.on("error")` at `:1710` preserved byte-for-byte. |
| `index.ts resolveCommand` | `rankPathSearchHits` | `out.head.split(/\r?\n/)` → `ranked[0]`, gated on `code === 0` | ✓ WIRED | `index.ts:1700-1708`. `renderBoundedBuffer` is NOT used here — prohibition holds. |
| `index.ts resolveCommand` | `buildCommandCandidatePaths` | `getCommandExecutableCandidates` (thin impure caller) | ✓ WIRED | `index.ts:1725-1735`, now carrying `nvmWindowsInstalled: isNvmWindowsInstalled({env: readParentEnv()})`. The SC-5 seam. |
| `index.ts getKnownHomeDirs` | `getHomeDirCandidates` + `extractHomeDir` | union of env names + pluginPath + provider commands | ✓ WIRED | `index.ts:1764-1773`. POSIX `HOME` hardcode removed. |
| `index.ts getNodeExecutable` | `buildNodeCandidatePaths` | `getNodeExecutableCandidates({platform, roots, nvmWindowsInstalled, …})` | ✓ WIRED | `index.ts:2694-2701`. `roots` and the gate both from `readParentEnv()`. |
| `index.ts requireNodeExecutable` | `getNodeExecutableError(host?.platform)` | MCP start failure message | ✓ WIRED | MCP start failure path. |
| `index.ts sendCliMessage` | provider spawn guard | `let proc; try { proc = spawnWithEnv(...) } catch (e) { setSessionState("error", …, {reasonCode:"spawn_error"}); rm(runtimeFiles.*); rm(claudeMcpConfigPath); resolve(err(...)) }` | ✓ WIRED | `index.ts:3719-3745`. **New in pass 2 (`44c957f`).** Mirrors `finalize`'s two `rm` blocks (`:3956-3968`); `finalize` itself is unreachable at that point (TDZ, `const` at `:3940`). |
| `platform.ts isNvmWindowsInstalled` | `buildWindowsInstallLocationCandidates` + `buildNodeCandidatePaths` | injected `nvmWindowsInstalled: boolean` (required field) | ✓ WIRED | Gate applied at **both** emission sites, `command-resolution.ts:663` and `:1044`. |
| shared `PROVIDER_INSTALL_COMMANDS` | `getProviderInstallHint` → `formatProviderUnavailableMessage` | chat error banner + Settings provider status | ✓ WIRED | `command-resolution.ts:105-155`. |
| shared `PROVIDER_INSTALL_COMMANDS` | `HelpView.vue` | `Object.values(CliProvider).map` + `v-for` | ✓ WIRED | Second live surface closed. |
| `buildCommandCandidatePaths` | `pushUniqueCandidate` → `foldCandidateKey` | win32-only case+separator fold | ✓ WIRED | Fold correctly gated on `"win32"`, never on `undefined` — asserted by the "keeps BOTH POSIX paths that differ only in case" test. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `HelpView.vue` | `installCommands` | `PROVIDER_INSTALL_COMMANDS` (shared module constant) | Yes — 4 providers × 2 arms, verified in the rebuilt bundle (`@github/copilot` ×2, archived command ×0) | ✓ FLOWING |
| `resolveCommand` | `pathResolution` | live `spawn(where.exe/which)` stdout → `rankPathSearchHits` | Yes — real spawn, real ranking, no static fallback; the new catch arm resolves `undefined`, which is the same fall-through the `error` handler already produced | ✓ FLOWING |
| `getNodeExecutable` | `candidates` | `buildNodeCandidatePaths` fed by real `readdir` version walk | Yes — `listWindowsVersionDirs` does real `pathExists` + `listVersionDirectories` | ✓ FLOWING |
| `buildNodeCandidatePaths` | `nvmWindowsInstalled` | `isNvmWindowsInstalled({env: readParentEnv()})` at `index.ts:2701` | Yes — real parent-environment read at the I/O boundary, injected as a literal into the pure builder | ✓ FLOWING |
| provider status banner | `error` string | `formatProviderUnavailableMessage` → shared table | Yes | ✓ FLOWING |

### Behavioral Spot-Checks (re-run at HEAD `a2c3543`)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-6 test files green | `pnpm exec vitest run …/command-resolution.test.ts …/platform.test.ts` | `168 passed (168)` — 120 + 48 | ✓ PASS |
| Full suite green at HEAD | `pnpm exec vitest run` | `31 files / 419 passed (419)` | ✓ PASS |
| Workspace typecheck | `pnpm -r typecheck` | shared / backend / frontend all "Done", exit 0 | ✓ PASS |
| Lint gate | `pnpm lint` (`--max-warnings 0`) | exit 0, no output | ✓ PASS |
| Candidate builders are I/O-free **after** the CR-02 change | brace-matched body extraction + impurity grep | 0 hits across all 3 builders (90 / 161 / 229 lines) | ✓ PASS |
| `platform.ts` still importless | `grep -c "^import " platform.ts` | `0` | ✓ PASS |
| `%ProgramData%` emits nothing | `grep -n programData command-resolution.ts` | one **commented** `emitLocation` at `:585`, no other consumer | ✓ PASS |
| nvm4w gated at **both** sites | `grep -n NVM_WINDOWS_SYMLINK_DIR command-resolution.ts` | 3 hits: const `:24`, guarded emit `:664` (behind `:663`), guarded emit `:1045` (behind `:1044`) | ✓ PASS |
| `finalize` TDZ claim | read `index.ts:3669` (executor start), `:3721` (spawn), `:3940` (`const finalize`) | Confirmed — `finalize` is a `const` inside the same executor, declared 219 lines below the spawn | ✓ PASS |
| Third executor spawn is exempt | read `index.ts:2190-2192`, callers `:2421`, `:2454` | reject-carrying promise; both callers `await` inside `try/catch` | ✓ PASS |
| No CI run covers the fixes | `gh run list --commit <sha>` ×4 | zero runs for `44c957f`, `f18be4d`, `b9c8f4e`, `a2c3543` | ⚠️ WARNING (§ 4) |
| Host-path-flavour risk of the new tests | `path`→`path.win32` alias shim, run at HEAD and at `3f7c7b3` | identical 2 pre-existing `mkdtemp` failures in both trees; all 11 new tests pass | ✓ PASS (zero delta) |
| Debt markers in the 5 touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | 0 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exists in this repository and no phase-6 plan declares one.
**Step 7c: SKIPPED (no probes declared or discoverable).** The phase's runnable evidence is the
vitest suite and the CI legs.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| **RES-01** | 06-01, 06-02 | Locate `node.exe` via `where` + Windows install locations | ✓ SATISFIED (spelling) / ⏸ deferred (existence) | Truth SC-1 + truth 9. The real-machine existence check is `blocked` on physical-device in 06-UAT.md and closes on the Phase 9/10 report — recorded as a deferred non-claim, not a gap. CR-02 narrowed the catalogue by one row and gated a second; both are recorded decisions with in-source security non-claims. |
| **RES-02** | 06-03, 06-05 | Absolute path + explicit extension, `.exe` preferred, CRLF-safe | ✓ SATISFIED | Truth SC-2. Residual `where.exe` cross-extension ordering is designed-around, not measured — `blocked`, deferred. |
| **RES-03** | 06-01, 06-03, 06-04 | Home-dir detection recognizes `C:\Users\<name>`, uses `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` | ✓ SATISFIED | Truth SC-3. Empty-input, traversal, UNC and encoding/dedup edges all covered and tested. |
| **UX-02** | 06-06, 06-07 | Correct Windows install commands per provider incl. the `@github/copilot` correction | ✓ SATISFIED | Truths SC-4 + 14. Untouched by both fixes. |
| **CMP-01** | (cross-cutting, closed in Phase 5) | macOS/Linux behaviour preserved | ✓ SATISFIED, with one caveat | Truths 6 + 8 are the non-vacuous proofs, now with a fifth case pinning byte-identity under the CR-02 gate, and a `NVM_DIR` decoy test that keeps POSIX `nvm` from tripping it. Caveat unchanged: WR-05(b), the in-source claim that the union "costs a POSIX machine nothing", is an environment assumption rather than an invariant. |

**No ORPHANED requirements.** `REQUIREMENTS.md` maps exactly RES-01, RES-02, RES-03, UX-02 to
Phase 6, and every one is claimed by at least one plan's `requirements` field.

**Observation (not a gap):** `REQUIREMENTS.md` still shows these four as `Pending` / unchecked. No
phase-6 plan lists `REQUIREMENTS.md` in `files_modified`, so the ledger update is owned by the
phase-close/ship step.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD` / `FIXME` / `XXX` / `TODO` / `HACK` in any file this phase modified, including the 5 touched by the two fixes | — | **None found.** |
| `index.ts` | ~2709 | `MISSING_COMMAND_PLACEHOLDER` | ℹ️ Info | Not a stub marker. A named sentinel constant (`"\u0000unset"`) defined in `resolution-cache.ts:198`, pre-existing, referenced in a comment explaining a defensive read. No action. |
| `44c957f` commit message | — | Says "Both carry the PRV-02 marker"; only the provider site does | ℹ️ Info | Cosmetic. The PATH-search site correctly states the `.cmd` EINVAL does not apply there, so a PRV-02 marker would be inapposite. Code is right; the message overstates by one clause. |

**Debt-marker gate: PASS.** Zero unreferenced debt markers introduced by this phase or by either fix.

## Verifier Assessment — the code review's Critical findings, and their resolution

### CR-01 (provider spawn) — **RESOLVED in `44c957f`**

Pass 1 reproduced the defect at the then-`index.ts:3633-3645` and judged it a Phase 6 defect *in
kind* but not a phase-goal blocker, routing the fix-vs-defer call to the maintainer. The maintainer
chose **close in Phase 6**. Pass 2 verified the fix in source at `index.ts:3719-3745`:

- The guard shape matches `spawnAndWait`'s exactly — no second idiom.
- **The executor's rejection of 06-REVIEW's suggested `finalize(err(message))` is correct**, and the
  review's supporting premise ("`finalize` is declared above the returned promise") is factually
  wrong: `const finalize` is at `:3940`, inside the executor that starts at `:3669`. The catch arm
  additionally `return`s before `:3940` is ever evaluated, so the binding is never initialised on
  that path — the `ReferenceError` would be permanent, not a race. The executor used the review's
  own stated fallback (06-REVIEW.md:134-135).
- **The token leak the finding exists to close is closed.** Both `rm` blocks are present and mirror
  `finalize`'s: the `runtimeFiles` pair (activity + approvals, with `sessionRuntimeFiles.delete`)
  and the token-bearing `claudeMcpConfigPath`. `finalize`'s unmirrored statements are all timer/
  registry teardown for bindings that do not yet exist at the spawn (`:3761`, `:3799`, `:3852`,
  `:3869`, `:3977`).
- The remaining honest gap is evidential, not structural: no test executes the arm, because
  `index.ts` is not importable under vitest. Verified, recorded, and matching WINDOWS.md entry 5.

### WR-01 (PATH-search spawn) — **RESOLVED in `44c957f`**

Verified at `index.ts:1628-1636`. Same shape; the catch arm resolves `undefined`, which is
byte-identically the fall-through the untouched `error` handler at `:1710` already produced. The
blast radius pass 1 described (`resolveWithCache` re-throw → `getProviderStatuses` taking all four
provider statuses down as one rejected RPC) is closed.

### CR-02 (untrusted search path) — **RESOLVED in `f18be4d`**

Pass 1 called this "the most consequential open item" and noted that neither row carried a security
note — silence being the one outcome the module's own cite-or-drop discipline did not allow. The
maintainer chose **option (a)**. Pass 2 verified all four legs: the `%ProgramData%` row emits
nothing (`command-resolution.ts:585`, commented, no other consumer); `C:\nvm4w\nodejs` is gated at
**both** emission sites (`:663`/`:664` and `:1044`/`:1045`); the gate is an injected required
`boolean` computed at the two `index.ts` I/O boundaries, so purity survives; and both removals carry
in-code non-claims naming the `CAIDO_TOKEN` exposure, the default Windows ACLs, CWE-426/427, and why
ordering-the-rows-last was rejected. The surviving unconsumed `programData` root carries its own
"do not add a row back without a trust-domain argument" note at `platform.ts:536-548`.

## Other defects confirmed in pass 1 — still open, unchanged by the two fixes

| Ref | Status at HEAD | Assessment |
|-----|----------------|------------|
| **WR-02** (`clearResolutionCache` never called from `index.ts`) | **Still open.** `grep -c clearResolutionCache index.ts` → **0**. | Combined with WR-03, a Windows user who opens Diagnostics before ever starting MCP caches a negative `"node"` entry for 30 s. Narrows SC-1 to a conditional false-negative window; does not falsify the mechanism. Worth closing before Phase 7 leans on node resolution. |
| **WR-03** (node builder gates on literal `"win32"`, command builder unions `win32 \|\| undefined`) | **Still open.** `command-resolution.ts:776` unions; `:958` gates on the literal. | Real, and it is the asymmetry that makes WR-02 bite. Either union it or write the non-claim beside the arm in D-07's shape. |
| **WR-04** (`spawnAndWait` has no time budget) | **Still open.** | The guard covers the *throw* shape, not the *hang* shape. Partially overlaps Phase 7 SC-2; the missing time budget itself is owned by nobody. |
| **WR-05** (the "costs a POSIX machine nothing" claim is an environment assumption) | **Still open.** | Narrow. Flagged because an *asserted invariant* that is actually an *environment assumption* is the kind of overclaim this project's discipline forbids elsewhere. Note that `f18be4d`'s new decoy test (`NVM_DIR` must not trip the gate) is exactly the right shape for this class, applied to the new input. |
| **IN-01 / IN-02 / IN-03 / IN-04** | **Still open.** | Housekeeping and comment-accuracy; none affects the goal. IN-03 remains the one worth a one-clause comment, since it is a security property being dropped without a note. |

## Human Verification — dispositions (all five resolved)

Pass 1 raised five items. `06-UAT.md` (committed at `a2c3543`, status `partial`: 2 passed,
0 issues, 3 blocked) records the maintainer's disposition for each. Pass 2 verified the two "pass"
dispositions against the code rather than against the UAT prose.

| # | Item | Disposition | Verified in pass 2 |
|---|------|-------------|--------------------|
| 1 | Real-machine catalogue existence (RES-01) | `blocked` / `physical-device` — closes on the Phase 9/10 real-machine report | N/A — a recorded **non-claim**, not a gap. The phase proves spelling, never existence, and says so in-source. |
| 2 | Cold `where.exe` latency vs the 5000 ms estimate | `blocked` / `physical-device` — WINDOWS.md entry 8 stays OPEN by design | N/A — recorded non-claim. Entry 8 confirmed still `open` in the ledger. |
| 3 | `where.exe` cross-extension order / no-match stream | `blocked` / `physical-device` — confidence upgrade only | N/A — recorded non-claim. The design is correct under every ordering. |
| 4 | Security decision on the two non-admin-writable rows (CR-02) | `pass` — option (a), commit `f18be4d` | ✓ Verified in source at all four legs — see § 2. |
| 5 | Ownership decision on the two unguarded spawns (CR-01/WR-01) | `pass` — close in Phase 6, commit `44c957f` | ✓ Verified in source at both sites, including the executor's disputed TDZ reasoning and the `rm` mirror — see § 1. |

**The three `blocked` items are recorded non-claims, not gaps.** They are carried in this report's
`deferred` frontmatter with their closing artifact (the Phase 9/10 real-machine report). A phase
whose only outstanding items are hardware-blocked non-claims it explicitly declined to claim is not
`gaps_found`, and re-planning them would be re-planning a claim nobody made.

**WINDOWS.md entry 8 stays OPEN**, deliberately and correctly. Entries 9 (CR-01/WR-01) and 10
(CR-02) are recorded `fixed`, and both were re-derived here from source rather than accepted from
the ledger.

## Gaps Summary

**No gaps.** No must-have truth failed, no artifact is missing or a stub, no key link is unwired, no
debt marker was introduced, and no anti-pattern rises to blocker. The phase goal — reliably locating
`node.exe` and the provider CLIs on Windows with absolute, correctly-extensioned paths — is achieved
in the codebase, and the evidence architecture the phase argued for (pure builders, byte-exact
assertions from literal inputs, a Linux runner that is not being tested in place of Windows) still
holds after the two fixes rather than being asserted to.

Three things distinguish this pass and are worth recording:

1. **The two fixes are real, and the more interesting one is the executor's refusal.** `44c957f`
   declined 06-REVIEW's own suggested `finalize(err(message))`. That refusal was checked here and is
   correct — the review's premise about `finalize`'s scope is wrong in source, and the executor's
   substitute (the review's own stated fallback) reproduces both `rm` blocks, including the
   token-bearing one. This is a case where the implementer was right and the reviewer was not, and
   said so with the reason recorded in-source so it cannot be "simplified" back.
2. **The test delta is coverage, not accommodation.** 408 → 419 is exactly +11 new tests; the four
   changed expectations changed because a whole catalogue location was deleted, and each of them is
   the same strength or stronger afterwards — most pointedly, `WIN32_ROOTS` still *supplies*
   `programData` so that "emits no `%ProgramData%` row" distinguishes a removed row from a removed
   fixture.
3. **One evidence citation went stale and is recorded rather than papered over.** The CI run this
   report cited in pass 1 predates both fixes, so `Verify (Windows)` has not seen the new tests. The
   risk was measured down to a zero delta with the same shim technique WINDOWS.md entry 7 used, not
   argued away — but a green CI leg at HEAD remains a blocking ship-step action before Phase 7.

Status is `passed`: all 15 must-haves verified, both maintainer decisions shipped and independently
re-derived from source, no regressions, and the only outstanding items are three hardware-blocked
non-claims the phase explicitly declined to make.

---

_Verified: 2026-08-21T15:30:00Z (pass 2 — re-verification)_
_Verifier: Claude (gsd-verifier)_
