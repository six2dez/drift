---
phase: 01-restore-the-verification-signal
plan: 01
subsystem: testing
tags: [vue, pinia, vitest, localstorage, web-storage, node-25, caido-webview]

# Dependency graph
requires: []
provides:
  - "readBrowserStorageItem() — a total browser-storage read in packages/frontend/src/stores/settings.ts that absorbs absent / null / throwing-getter / no-getItem / non-string-value"
  - "syncCaidoSessionToken rewired onto the guard; every storage failure mode routes to the existing fail-closed pushCaidoSessionToken(\"\") sink"
  - "SIG-01e/f/g — three falsifiable guard unit tests selectable by the VALIDATION.md -t substrings"
  - "The 5 ChatView.mount.test.ts failures on Node >= 25 are closed; full suite 128/128 green on Node 26.7.0"
affects: [01-02-storage-shim, 01-04-lint-and-settled-state, 03-windows-ci-spike]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total function returning `undefined` for every failure mode (joins parseHttpRequest / extractHomeDir family)"
    - "Host-object reads go through `globalThis.window?.x` so vi.stubGlobal(\"window\", ...) stays the test seam"

key-files:
  created: []
  modified:
    - packages/frontend/src/stores/settings.ts
    - packages/frontend/src/stores/settings.test.ts

key-decisions:
  - "Used `//` line comments rather than the JSDoc block shown in RESEARCH.md — the frontend package has zero JSDoc blocks; http-parse.ts is the analog"
  - "Kept `await expect(...).resolves.not.toThrow()` as written in the plan after measuring that the `.resolves` half is what enforces non-rejection in Vitest 4.0.18"
  - "Falsified the guard rather than trusting a green run: reverting it turns exactly the 3 new tests red, and reverting settings.ts alone reproduces exactly the documented 5 ChatView failures"

patterns-established:
  - "Pattern: browser/host globals are never read directly — a module-scope total reader wraps the property access in try/catch and returns undefined"
  - "Pattern: a new guard ships with a measured negative control (revert the guard, confirm the new tests go red and pre-existing tests stay green)"

requirements-completed: [SIG-01]

# Metrics
duration: 12min
completed: 2026-08-12
---

# Phase 1 Plan 01: Make the Browser-Storage Read Total Summary

**`readBrowserStorageItem()` turns every `window.localStorage` failure mode into `undefined` routed to the fail-closed empty-token push — closing the 5 `ChatView.mount.test.ts` failures on Node >= 25 and taking the suite to 128/128 on Node 26.7.0.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-12T13:22:00Z (approx, worktree setup)
- **Completed:** 2026-08-12T13:34:31Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- The single production read of `window.localStorage` (`settings.ts:72`) is now total. It absorbs all three documented webview failure modes plus two more (`null` storage, non-string `getItem` return).
- Every failure mode reaches `pushCaidoSessionToken("")`, so a storage failure can never leave MCP believing it is authenticated. No "skip the push" branch was introduced.
- Three unit tests (SIG-01e/f/g) make the guard falsifiable independently of the ChatView mount tests — including the *throwing getter* case that no integration test exercises.
- The dead `let token = ""` initialiser (one of the four measured ESLint `no-useless-assignment` errors) is cleared.
- **Measured:** full suite on Node 26.7.0 went from 8 failed / 120 passed (with the new tests present and the guard reverted) to **128 passed / 0 failed**.

## Task Commits

1. **Task 1: Make the browser-storage read total in settings.ts** — `70e72f9` (fix)
2. **Task 2: Add the three guard unit tests (SIG-01e/f/g)** — `c6bf736` (test)

## Files Created/Modified

- `packages/frontend/src/stores/settings.ts` — added `type BrowserStorage` and the module-scope `readBrowserStorageItem()`; rewired `syncCaidoSessionToken` onto it; `let token = ""` → `let token: string`.
- `packages/frontend/src/stores/settings.test.ts` — appended three `it` blocks inside the existing `describe("settings store", ...)`. Append-only: zero removed/changed lines.

## Final shape of `readBrowserStorageItem` (required by the plan's `<output>`)

```ts
type BrowserStorage = { getItem: (key: string) => string | null };

// Reads one key from the host's local storage.
// Drift's frontend runs inside a Caido webview where storage can be absent,
// disabled by enterprise policy, or throw on property access (restricted
// origins, Safari private mode). Node >= 25 test environments hit the same
// "absent" path. Every failure collapses to `undefined` so a missing token
// degrades to "not signed in" instead of aborting syncCaidoRuntimeContext()
// and, with it, the entire send-a-message flow.
function readBrowserStorageItem(key: string): string | undefined {
  try {
    const storage = (globalThis as { window?: { localStorage?: BrowserStorage } })
      .window?.localStorage;
    if (storage === undefined || storage === null) return undefined;
    if (typeof storage.getItem !== "function") return undefined;
    const value = storage.getItem(key);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}
```

Call site (`syncCaidoSessionToken`):

```ts
const raw = readBrowserStorageItem("CAIDO_AUTHENTICATION");
if (raw === undefined || raw.trim() === "") {
  await pushCaidoSessionToken("");
  return;
}
```

## Test counts for `settings.test.ts` (required by the plan's `<output>`)

| Point | Tests | Result |
|-------|-------|--------|
| Pre-task baseline (before any edit) | 7 | 7 passed, 0 failed |
| After Task 1 (guard only) | 7 | 7 passed, 0 failed — SIG-01h, count unchanged |
| After Task 2 (guard + 3 new tests) | 10 | 10 passed, 0 failed — baseline + 3 exactly |

## `packages/backend/src/index.ts` was NOT touched (required by the plan's `<output>`)

Confirmed three ways:

- `git status --porcelain packages/backend/src/index.ts` → empty.
- `git diff --name-only 06ea0e5 HEAD` → exactly `packages/frontend/src/stores/settings.ts` and `packages/frontend/src/stores/settings.test.ts`, nothing else.
- V2-inv structural assertions against the fail-closed sink all hold (below).

## Verification Results

### Plan `<verification>` block

| # | Command | Expected | Actual |
|---|---------|----------|--------|
| 1 | `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` | 0 failed, baseline + 3 | **10 passed, 0 failed** ✅ |
| 2 | `… -t "absent browser storage"` | 1 passed | **1 passed, 9 skipped** ✅ |
| 3 | `… -t "throwing localStorage"` | 1 passed | **1 passed, 9 skipped** ✅ |
| 4 | `… -t "without getItem"` | 1 passed | **1 passed, 9 skipped** ✅ |
| 5 | `pnpm -r typecheck` | exit 0 | **exit 0** (tsc shared + backend, vue-tsc frontend) ✅ |
| 6 | `git status --porcelain -- <the 2 plan paths>` | only those paths | **empty — both committed; whole-tree `git status --porcelain` is also empty** ✅ |

### Task 1 acceptance criteria

| Assertion | Expected | Actual |
|-----------|----------|--------|
| `grep -c 'readBrowserStorageItem' settings.ts` | ≥ 2 | **2** ✅ |
| `grep -v '^\s*//' settings.ts \| grep -c 'window\.localStorage\.getItem'` | 0 | **0** ✅ |
| `grep -c 'window?\.localStorage' settings.ts` | ≥ 1 | **1** ✅ |
| `grep -v '^\s*//' settings.ts \| grep -c 'let token = ""'` | 0 | **0** ✅ |
| SIG-01h — suite green, count unchanged | 0 failed, 7 | **7 passed** ✅ |
| `pnpm -r typecheck` | exit 0 | **exit 0** ✅ |

### V2-inv — fail-closed sink intact

| Assertion | Expected | Actual |
|-----------|----------|--------|
| `grep -c 'async function startMcpServer' index.ts` | 1 | **1** (line 1694 — anchor unique) ✅ |
| `grep -A 10 'async function startMcpServer' … \| grep -c 'caidoToken === ""'` | 1 | **1** ✅ |
| `… \| grep -c 'setMcpAuthStatus("invalid", message)'` | 1 | **1** ✅ |
| `… \| grep -c 'return err(message)'` | 1 | **1** ✅ |
| `grep -c 'No Caido access token is available' index.ts` | 6 | **6** — baseline unchanged ✅ |
| `git status --porcelain packages/backend/src/index.ts` | empty | **empty** ✅ |
| `grep -c 'pushCaidoSessionToken("")' settings.ts` | ≥ 2 | **2** (absent-storage branch + JSON-parse-failure branch) ✅ |

### Task 2 acceptance criteria

| Assertion | Expected | Actual |
|-----------|----------|--------|
| SIG-01e / SIG-01f / SIG-01g by `-t` selector | 1 passed each | **1 passed each** ✅ |
| SIG-01h — whole file green at baseline + 3 | 10 | **10 passed** ✅ |
| `grep -c 'describe(' settings.test.ts` | 1 | **1** — no nested describe ✅ |
| `git diff -- settings.test.ts \| grep -E '^-' \| grep -v '^---' \| wc -l` | 0 | **0** — append-only ✅ |
| `grep -c '@vitest-environment' settings.test.ts` | 0 | **0** ✅ |
| `grep -c 'store\.init(' settings.test.ts` | 0 | **0** ✅ |

### CMP-inv — scope fence

`git diff --name-only 06ea0e5..HEAD` returns exactly the two `files_modified` paths. No file in the Phase 5–8 spawn path (`renderExportExecScript`, `writeMcpWrapper`, `writeLaunchScript`, `shellQuote`, any `chmod` call site) was read-modified or touched.

## Negative controls (the part that makes this falsifiable)

The plan's threat register flags T-01-03: *"the guard works" claimed from the absence of a crash*. Two negative controls were run rather than accepting a green suite at face value.

**Control 1 — revert the guard body, keep the tests.** Replaced `readBrowserStorageItem`'s body with the original unguarded read:

```
✓ 7 pre-existing tests            (unchanged)
× treats absent browser storage as no token
    → TypeError: Cannot read properties of undefined (reading 'getItem')
× treats a throwing localStorage getter as no token
    → AssertionError: promise rejected "DOMException{ stack: 'SecurityError:…' }" instead of resolving
× treats a storage object without getItem as no token
    → TypeError: storage.getItem is not a function
```

Exactly the 3 new tests go red, each for its own distinct reason, and all 7 pre-existing tests stay green. The guard was then restored via `git checkout -- packages/frontend/src/stores/settings.ts` and re-verified at 10/10.

**Control 2 — revert `settings.ts` to the phase base commit, run the full suite.** This reproduces the phase's founding claim on this exact machine (Node 26.7.0):

```
Test Files  2 failed | 20 passed (22)
     Tests  8 failed | 120 passed (128)

FAIL settings.test.ts  › (the 3 new guard tests)
FAIL ChatView.mount.test.ts › does not add an assistant message when a turn is cancelled before the backend resolves
FAIL ChatView.mount.test.ts › drains a context-menu payload enqueued while a previous turn is streaming
FAIL ChatView.mount.test.ts › re-sends the last failed payload when Retry is triggered
FAIL ChatView.mount.test.ts › does not surface a background turn's error in the chat that is now active
FAIL ChatView.mount.test.ts › clears queued context-menu items when the user explicitly cancels
```

Exactly the 5 documented `ChatView.mount.test.ts` failures. Restoring `settings.ts` → **22 files / 128 tests, all passing**. This is direct evidence that this plan's guard — the product fix, not a test-harness change — is what closes SIG-01's Node ≥ 25 failure.

## Decisions Made

1. **`//` line comments instead of RESEARCH.md's JSDoc block.** Verified `grep -rn '^\s*/\*\*' packages/frontend/src --include=*.ts` returns zero matches — the frontend package uses no JSDoc anywhere. `packages/frontend/src/utils/http-parse.ts:12-16` (the plan's designated analog) uses `//`. Content of the comment is unchanged from RESEARCH's wording.
2. **Kept `await expect(...).resolves.not.toThrow()` verbatim.** Reading `@vitest/expect@4.0.18` (`dist/index.js:1482-1500`) suggested `.toThrow()` with no argument short-circuits into chai's `throws`, which requires a function — implying the assertion might error. It does not: `.resolves` (`dist/index.js:1653-1670`) awaits and rethrows a rejection as `AssertionError: promise rejected "…" instead of resolving` *before* the matcher runs. Negative control 1 proves the assertion is load-bearing (that test fails when the guard is removed), so the plan's text was kept as written rather than substituted.
3. **`BrowserStorage` placed last in the type block.** Keeps the existing `StoredData` / `SubscriptionHandle` / `ReadinessCheck` lines byte-identical; the type sits immediately above its only consumer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the lockfile-pinned dependency tree in the worktree**

- **Found during:** Task 1 (before first verification run)
- **Issue:** This plan executes in a git worktree (`.claude/worktrees/agent-a5143b37c750a59dd`) with no `node_modules`. Every `<verify>` command in the plan (`pnpm exec vitest`, `pnpm -r typecheck`) was unrunnable.
- **Fix:** `pnpm install --frozen-lockfile --prefer-offline`. No package was added, removed, or resolved anew — `pnpm-lock.yaml` was already up to date ("resolution step is skipped"), so this restores the exact declared tree. The package-install exclusion in Rule 3 (slopsquatting guard) does not apply: no new or renamed package name was introduced.
- **Files modified:** None tracked. `node_modules/` is gitignored; `git status --porcelain` is empty.
- **Verification:** `pnpm exec vitest run` and `pnpm -r typecheck` both execute; whole-tree git status clean.
- **Committed in:** N/A (no tracked file changed)

---

**Total deviations:** 1 auto-fixed (1 blocking — environment restore only)
**Impact on plan:** No scope creep. No source behaviour was added beyond the plan text; both source edits are exactly as specified.

## Issues Encountered

1. **Worktree base commit mismatch.** The worktree spawned with HEAD at `91f71f7` ("fix(release): name release assets…"), whose merge-base with the expected phase base `06ea0e5` was `f20a3c8` — i.e. HEAD was not a descendant of the phase base and was missing all five `.planning` commits. Resolved per the startup protocol: HEAD assertion passed first (branch `worktree-agent-a5143b37c750a59dd`, in-namespace, not protected, not detached), working tree was clean, then `git reset --hard 06ea0e5` corrected the base. No work was lost.

2. **Plan text describes a shared working tree; execution got an isolated worktree.** The plan's CMP-inv criterion is written around `workflow.use_worktrees: false` ("plans 01-02 and 01-03 run concurrently in this same working tree"), and prescribes a path-scoped `git status` because a bare one could never pass for more than one of the three. In this worktree the constraint is strictly weaker — nothing from a sibling plan is present — so **both** the path-scoped and the bare whole-tree `git status --porcelain` are empty. The stronger assertion is recorded above. The repo-wide settled-state check remains plan `01-04` task 3's job.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-01-01 (Spoofing — stale good token while MCP believes it is authed) | mitigate | **Covered.** No "skip the push" branch exists; both failure branches call `pushCaidoSessionToken("")`. V2-inv confirms `startMcpServer`'s empty-token abort is structurally intact and the whole-file count is still 6. |
| T-01-02 (Tampering — page-injected or partial storage stub) | mitigate | **Covered.** `typeof storage.getItem !== "function"` rejects partial stubs (asserted by SIG-01g); `typeof value === "string"` rejects non-string returns; the value still flows through the existing `JSON.parse` try/catch. |
| T-01-03 (Repudiation — "guard works" inferred from no crash) | mitigate | **Covered, and then some.** SIG-01e/f/g assert guard behaviour directly, and both negative controls above prove the tests detect the bug rather than merely coexisting with the fix. |
| T-01-04 (Info disclosure — token literals in fixtures) | accept | **Held.** The three new tests assert only on `""`. No token-shaped literal was added; existing fixtures are unchanged. |
| T-01-SC (package legitimacy) | n/a | **Held.** No package was added. The one install restored the existing lockfile tree with `--frozen-lockfile`. |

## Known Stubs

None. No placeholder values, empty-collection literals, or TODO markers were introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **SIG-01's product half is closed.** The guard is in place, unit-proven, and typecheck-clean.
- **Note for plan `01-02` (Vitest Web Storage shim):** the full suite is *already* 128/128 green on Node 26.7.0 with only this plan landed. The shim is therefore no longer load-bearing for turning the suite green; its remaining value is (a) restoring working `localStorage` for DOM-env tests that need real storage rather than an absent one, and (b) SIG-01i, which asserts the shim is inert when storage already works. `01-02` should re-measure rather than assume it is fixing a red suite.
- **Note for plan `01-04` (lint + settled state):** one of the four measured `no-useless-assignment` errors (`settings.ts:78`) is already cleared here. The remaining one in `packages/backend/src/index.ts:710` is untouched by this plan, and the `No Caido access token is available` count is still 6 as `01-04`'s baseline expects.
- **Note for `01-03`/`01-04`:** `.planning/` and the two source files are the only things this plan touched; `IMPROVEMENT-PLAN.md` (flagged in STATE.md as blocking `01-06`'s clean-status assertions) is **not** present in this worktree and was not addressed here.
- No blockers.

---
*Phase: 01-restore-the-verification-signal*
*Completed: 2026-08-12*
