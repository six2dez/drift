---
status: resolved
phase: 03-ci-spike-prove-llrt-basics-on-windows
source: [03-VERIFICATION.md]
started: 2026-08-13T14:04:02Z
updated: 2026-08-14T07:55:00Z
---

## Current Test

[complete — all 5 items resolved 2026-08-14]

## Tests

### 1. CR-01 disposition — fix the P0-ENV replace-vs-merge discriminator, or accept as-is
expected: A recorded decision. Option (a) leave as-is; option (b) extend the probe with a non-back-filled marker variable before Phase 4 writes spawn code.
result: **FIXED, then re-measured — option (b).** Commit `2f4db6a` replaced the `PATH` discriminator with `DRIFT_PROBE_PARENT_ONLY`, a marker set in the parent, omitted from the child's supplied block, and absent from libuv's eleven `required_vars`. Re-run on `windows-latest` ([run 31780073574](https://github.com/six2dez/drift/actions/runs/31780073574)) returned **`PARENT-CLEARED`** — the `env` option **replaces** the parent block on Windows, as on POSIX. This **overturned** the original probe's "merged" reading, which was an artifact of libuv back-filling `PATH`. `03-FINDINGS.md` and `STATE.md` amended (`896137d`); the "Not measured" gap for non-`required_vars` survival is now **closed by measurement**.

### 2. CR-02 disposition — tighten the P1-CMD classifier, or accept as-is
expected: A decision on whether a future Windows re-run with a locked-down TEMP could produce a false conclusive before Phase 9 deletes the file.
result: **FIXED — tightened.** Commit `4d5eae2` added a platform-first guard (off-Windows → `FAIL indeterminate`) and a `CONCLUSIVE_CMD_ERRNOS` allowlist on Windows. This immediately proved its worth: WR-03's later `0o700` fix made the fixture executable, flipping the darwin surface from `error`/`EACCES` to `throw`/`ENOEXEC` — and `ENOEXEC` *is* in the allowlist. Without CR-02's platform-first ordering, WR-03 would have silently promoted darwin to a false `PASS` on a gating ID. The Windows path is unchanged: `throw`/`EINVAL` from the CVE-2024-27980 guard still classifies conclusive, confirmed on run 31780073574.

### 3. SC-4 — does ROADMAP.md itself need amending before Phase 4 begins?
expected: Either an amended ROADMAP.md, or an explicit decision that `03-FINDINGS.md` + STATE.md satisfy SC-4's "feeds back to this roadmap".
result: **AMENDED.** SC-4's wording is literal and the concrete gaps were real, so the roadmap was updated rather than waived. Three changes: (a) Phase 3 gained a **Results** table with all four run URLs plus the three findings that bind later phases — ROADMAP carried 0 run URLs before, 6 now; (b) Phase 4 gained success criteria **9** (every `env`-supplying `spawn` site must spread `{ ...process.env, ...driftVars }`, with a test) and **10** (normalise with `realpathSync.native` before profile-path comparisons); (c) Phase 9 SC-1's stale `pnpm/action-setup@v4` + `actions/setup-node@v4` pins — replaced by Phase 1 with `@v6`/`@v5` — were corrected and annotated with Phase 3's `package-manager-cache` lesson, and a new SC-1a requires the D-10 three-branch secret gate to be carried forward rather than dropped when the probe workflow is deleted under D-02.

### 4. Confirm or reject the SC-2 override
expected: Explicit acceptance or correction of "measured under Node v24.18.1 on windows-latest rather than inside the Caido backend runtime".
result: **ACCEPTED.** The override stands as the verifier recorded it. The qualifier is unreachable — no standalone LLRT Windows binary exists (upstream dropped the target at `v0.6.0-beta`; `caido/dependency-llrt` publishes no releases) and Caido headless in CI requires a paid Teams plan. The ceiling was accepted in `03-CONTEXT.md` § Claude's Discretion; D-08's non-LLRT labelling is the adopted mitigation and the labels survived onto the archived artifact. `03-FINDINGS.md` § *ROADMAP success-criterion gap — stated plainly* records the gap under its own heading so no future reader mistakes the criterion for literally met.

### 5. Confirm the LLRT-on-real-Caido fidelity item stays deferred
expected: No action now; Phase 9/10 remains the target.
result: **CONFIRMED DEFERRED.** Real-machine confirmation from the original Windows reporter (@0xMRK0S, reported 2026-06-24) or a real Windows Caido install remains targeted at Phase 9/10. It was considered as a completion gate for this phase and declined because it depends on a third party and could block Phase 4 indefinitely. Already recorded in `03-CONTEXT.md` § Deferred Ideas and `03-FINDINGS.md` § Residual risk.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

No gaps. Items 1 and 2 were resolved by fixing rather than accepting, and the fix to item 1
overturned the phase's original P0-ENV conclusion — the `env` option replaces the parent block on
Windows, so Phase 4 must spread `{ ...process.env, ...driftVars }`. That is now encoded as Phase 4
success criterion 9 rather than living only in a findings document.
