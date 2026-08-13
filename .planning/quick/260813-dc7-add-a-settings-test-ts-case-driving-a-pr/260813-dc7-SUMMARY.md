---
phase: quick-260813-dc7
plan: 01
subsystem: testing
tags: [vitest, pinia, mutation-testing, localStorage, caido-token]

# Dependency graph
requires:
  - phase: 01-restore-the-verification-signal
    provides: the `readBrowserStorageItem` guard, the three tolerance tests (SIG-01e/f/g), and the verification report that recorded gap G1
provides:
  - Forward-direction coverage of the `CAIDO_AUTHENTICATION` storage guard — a present token is now driven through `readBrowserStorageItem` and the trimmed `accessToken` is pinned
  - Coverage of the malformed-JSON branch, including the warning toast (previously zero-coverage)
  - Coverage of the non-string `getItem` return arm
  - An executed-and-reverted mutation proof recording the exact mutated-run shape
  - A corrected SIG-01h row in `01-VALIDATION.md` that no longer asserts coverage the suite did not have
affects: [01-restore-the-verification-signal re-verification, phase 03 windows CI spike]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutation proof as an execution gate: apply the mutant, prove it landed with `git diff --stat`, assert the specific failure shape, revert, gate on `git diff --quiet`"
    - "Assert on the forwarding direction, not just the tolerance direction — a test that asserts the same value a broken read produces cannot detect a regression"

key-files:
  created: []
  modified:
    - packages/frontend/src/stores/settings.test.ts
    - .planning/phases/01-restore-the-verification-signal/01-VALIDATION.md

key-decisions:
  - "The SIG-01h automated command uses the table's existing `…` shorthand instead of repeating the full path, because spelling out `settings.test.ts` on that row would have put the row and the Wave 0 bullet both in scope of the plan's own `grep -n 'settings.test.ts' | grep -c 'SIG-01h'` → 1 gate"
  - "No production code was changed — the gap was a missing test, not a broken guard; `settings.ts` ends byte-identical to the pre-task HEAD"

patterns-established:
  - "Falsifiability gate: a test added to close a mutation-survivability gap must be shown failing under the mutant before the task is considered done"

# Metrics
duration: 4min
completed: 2026-08-13
---

# Quick Task 260813-dc7: Close the storage-guard forwarding gap — Summary

**Three appended cases in `settings.test.ts` make `readBrowserStorageItem`'s forwarding direction falsifiable — under `if (key !== "__never__") return undefined;` the file now reports 2 failed / 11 passed where it previously stayed fully green.**

## Performance

- **Duration:** 4 min (262 s)
- **Started:** 2026-08-13T07:44:33Z
- **Completed:** 2026-08-13T07:48:55Z
- **Tasks:** 2
- **Files modified:** 2

## Measured Values

Every number below was observed, not asserted.

| Measurement | Before | After |
|---|---|---|
| `settings.test.ts` tests | 10 passed | **13 passed** |
| Full suite | 23 files / 131 tests (phase-01 baseline) | **23 files / 134 tests, 0 failed** |
| `pnpm lint` | exit 0, 0 errors / 0 warnings | **exit 0, 0 errors / 0 warnings** |
| `settings.test.ts` line count | 332 | **378** |

### Mutation proof (gap G1 evidence)

The mutation `if (key !== "__never__") return undefined;` was inserted at `settings.ts:35`, immediately inside the `readBrowserStorageItem` body.

1. **Landing check** — `git diff --stat -- packages/frontend/src/stores/settings.ts` → `1 file changed, 1 insertion(+)`. The insertion was also read back with `git diff` to confirm placement inside the function body, before any failure was interpreted.
2. **Targeted run** — `pnpm exec vitest run … -t "forwards the parsed accessToken"` → `1 failed | 12 skipped (13)`, with
   `AssertionError` showing the call recorded as `""` where `"tok-123"` was expected.
3. **Whole-file shape** — `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts` →

   ```
   Failed Tests 2
   FAIL … > settings store > forwards the parsed accessToken when storage holds a real token
   FAIL … > settings store > pushes an empty token and warns when the stored value is not valid JSON
   Test Files  1 failed (1)
        Tests  2 failed | 11 passed (13)
   ```

   **Exactly the 2 failed / 11 passed the plan derived.** Test A died on the token value; Test B died on the missing toast (a broken read returns early on the empty-raw branch and never reaches the parse). Test C survived by design — it asserts `""`, so it covers a different arm.
4. **Revert** — `git checkout -- packages/frontend/src/stores/settings.ts` then `git diff --quiet -- packages/frontend/src/stores/settings.ts` → **exit 0** (`REVERTED CLEAN`). Re-confirmed against the pre-task HEAD: `git diff --quiet aee377c HEAD -- packages/frontend/src/stores/settings.ts` → **exit 0**, i.e. byte-identical.

Before this change the same mutation left the whole suite green — that is precisely what made the guard's forwarding direction unfalsifiable.

## Accomplishments

- **Test A (the mutant-killer):** storage holds `{"accessToken":"  tok-123  "}` → asserts `syncCaidoSessionToken` received `"tok-123"` (trimmed, not the raw JSON) and that `getItem` was called with `"CAIDO_AUTHENTICATION"`. That key string now appears in the repo in a test as well as in production code, so a rename cannot silently pass.
- **Test B:** non-JSON stored value → asserts both the `""` push and `showToast(stringContaining("Failed to read the current Caido session token"), { variant: "warning" })`. This branch had zero coverage.
- **Test C:** `getItem` returns the number `42` → asserts `""`, covering the false arm of the `typeof value === "string"` ternary.
- **Append-only proven:** the diff is a single hunk `@@ -329,4 +329,50 @@` with **0 removed lines**. The shared `beforeEach`/`afterEach` and the three existing guard tests (SIG-01e/f/g) are untouched and still pass.
- **`01-VALIDATION.md` corrected:** SIG-01h no longer claims pre-existing `vi.stubGlobal` coverage (that stub returns `null`), now names the real test command and is marked `❌ Wave 0`; the Wave 0 bullet lists six `settings.test.ts` cases; the false-pass table gained the mechanism the verifier actually measured.

## Task Commits

1. **Task 1: Append three falsifying cases and prove the mutant dies** — `6a5d31b` (test)
2. **Task 2: Correct the SIG-01h row and the false-pass table** — `6d1943d` (docs)

`01-VALIDATION.md` was committed as part of Task 2 rather than left for the orchestrator's docs commit: it is an explicit `files_modified` deliverable of this plan and Task 2's only artifact, so leaving it uncommitted would have left that task with no commit. It is not one of the excluded GSD artifacts (SUMMARY.md / STATE.md / PLAN.md), none of which this executor touched.

## Files Created/Modified

- `packages/frontend/src/stores/settings.test.ts` — three appended `it()` blocks covering the forwarding direction, the malformed-JSON branch, and the non-string `getItem` arm (332 → 378 lines)
- `.planning/phases/01-restore-the-verification-signal/01-VALIDATION.md` — SIG-01h row corrected, Wave 0 bullet extended to six cases, one row added to the false-pass table

## Decisions Made

- **The SIG-01h command uses the `…` shorthand.** The plan's Edit 1 text spelled out `pnpm exec vitest run packages/frontend/src/stores/settings.test.ts -t "forwards the parsed accessToken"`, but the plan's own Task 2 gate `grep -n 'settings.test.ts' "$V" | grep -c 'SIG-01h'` expects **1** — and Edit 2 puts `SIG-01h` on the Wave 0 bullet, which already contains `settings.test.ts`. A full path on the row would have made that count 2. The row therefore uses `` `… -t "forwards the parsed accessToken"` ``, the shorthand rows SIG-01f and SIG-01g already use, resolving to the same command via SIG-01e's full path directly above. All seven Task 2 gates pass.
- **The SIG-01h `Exists?` cell avoids the literal string `✅ exists`.** Edit 1 asked for the row to state it was wrongly recorded as `` ✅ exists (`vi.stubGlobal`) ``, but the gate `grep 'SIG-01h' | grep -c '✅ exists'` requires **0** on any SIG-01h line. The correction is stated as "was mis-recorded as pre-existing `vi.stubGlobal` coverage; that stub returns `null`, so nothing drove a present token through the guard" — the claim is denied plainly without reproducing the forbidden literal.
- **No production code touched.** The gap was diagnosed as missing-test, not broken-code, and the guard is correct by inspection. `settings.ts` was mutated only inside the falsifiability proof and reverted within the same task.

## Deviations from Plan

The two decisions above are wording adjustments made to satisfy the plan's own automated gates where the prose instruction and the gate were in tension. Both were resolved in favour of the gate, which is the binding contract, while preserving the stated intent. No deviation rule fired: no bug was found, no critical functionality was missing, nothing blocked execution, and no architectural change was needed.

**Total deviations:** 0 auto-fixed. 2 prose-vs-gate reconciliations in Task 2.
**Impact on plan:** None on scope or behaviour. No scope creep.

## Threat Model Compliance

- **T-Q1-01 (Tampering — `settings.ts` during the proof):** mitigated as specified. The mandatory `git checkout --` was run, `git diff --quiet` exited 0, `git diff --quiet aee377c HEAD` exited 0, and `git status --porcelain` shows no entry for `settings.ts`. The file was verified clean immediately before each of the two commits, so no commit was ever made with the mutation applied. The fail-closed `pushCaidoSessionToken("")` → `startMcpServer` abort path at `index.ts:1696-1702` is untouched, and Tests B and C now assert that empty-token sink directly.
- **T-Q1-02 (supply chain):** no package install ran. No new import was added — `vi`, `expect`, `it`, `useSettingsStore` and `mockSdk` were already in scope.
- **T-Q1-03 (`tok-123` literal):** synthetic, non-secret, structurally identical to the fake paths already committed in this file.
- **T-Q1-04 (Repudiation — an unproven proof):** mitigated. The `git diff --stat` landing check ran *before* the failure assertion, and the observed counts are recorded verbatim above.

No new trust boundary, network surface, or dependency was introduced. No threat flags raised.

## Issues Encountered

None. The mutated run produced exactly the predicted 2 failed / 11 passed on the first attempt, so no fix-attempt budget was consumed.

## Known Stubs

None.

## Success Criteria

- [x] `settings.test.ts` gained exactly three tests, appended, lines 1-331 unchanged (single hunk `@@ -329,4 +329,50 @@`, 0 removed lines)
- [x] Test A asserts `syncCaidoSessionToken` received `"tok-123"` and `getItem` was called with `"CAIDO_AUTHENTICATION"`
- [x] Test B asserts both the `""` push and the `showToast` warning
- [x] Test C asserts `""` for a non-string `getItem` return
- [x] Under the mutation the file reports 2 failed / 11 passed — the forwarding direction is falsifiable
- [x] Mutation reverted; `settings.ts` byte-identical to HEAD (`git diff --quiet` exit 0, also against `aee377c`)
- [x] Full suite 23 files / 134 tests green; `pnpm lint` exit 0 at 0/0
- [x] `01-VALIDATION.md` SIG-01h no longer says `✅ exists`, names the real test command, marked `❌ Wave 0`
- [x] Assertion map still 24 rows (7 columns intact); false-pass table gained one SIG-01 row (4 → 5)
- [x] No production file and no other planning document changed
- [x] `IMPROVEMENT-PLAN.md` never staged — both commits used targeted `git add <path>`

## Next Phase Readiness

Gap G1 from `01-VERIFICATION.md` is closed with executed evidence. Phase 01 re-verification can now confirm 31/32 → the forwarding direction of the `CAIDO_AUTHENTICATION` guard is no longer mutation-survivable. `01-VERIFICATION.md` was deliberately not edited — re-verification owns it.

Unchanged carry-forward: `IMPROVEMENT-PLAN.md` is still untracked at the repo root (`.planning/STATE.md:112`). It was neither staged nor committed here. The "commit it, delete it, or gitignore it" decision remains open before the next phase.

## Self-Check: PASSED

- `packages/frontend/src/stores/settings.test.ts` — FOUND
- `.planning/phases/01-restore-the-verification-signal/01-VALIDATION.md` — FOUND
- `.planning/quick/260813-dc7-add-a-settings-test-ts-case-driving-a-pr/260813-dc7-SUMMARY.md` — FOUND
- Commit `6a5d31b` — FOUND in `git log --all`
- Commit `6d1943d` — FOUND in `git log --all`
- All three new test titles present exactly once each in `settings.test.ts`
- `git status --porcelain` — only this SUMMARY (untracked, orchestrator's docs commit) and the pre-existing untracked `IMPROVEMENT-PLAN.md`; no entry for `settings.ts`

---
*Quick task: 260813-dc7*
*Completed: 2026-08-13*
