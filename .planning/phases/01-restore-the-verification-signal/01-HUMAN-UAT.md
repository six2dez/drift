---
status: resolved
phase: 01-restore-the-verification-signal
source: [01-VERIFICATION.md]
started: 2026-08-13T10:05:00Z
updated: 2026-08-13T10:18:00Z
resolved_by:
  run: https://github.com/six2dez/drift/actions/runs/31690000562
  sha: 1cb1cb6
  result: all four legs success; Verify (Node 20) on v20.20.2 reported 23 files / 134 tests
---

## Current Test

[none — resolved by CI run 31690000562]

## Tests

### 1. Confirm the `Verify (Node 20)` leg is green at 134 tests

expected: Pushing branch `fix/security-hotfixes` (currently local-only, no upstream) triggers
the four-leg matrix. The `Verify (Node 20)` job concludes `success` with 23 files / 134 tests,
matching the 134 measured locally on Node 22.23.2, 24.13.0 and 26.7.0.

why human: No Node 20 binary exists on this machine (`~/.nvm/versions/node/` holds only
v24.13.0; no `node@20` in Homebrew) and the branch has never been pushed, so no CI run has
executed the three tests added by quick task `260813-dc7`. The prior CI proof run
[31605493233](https://github.com/six2dez/drift/actions/runs/31605493233) proved Node 20 green
at the **131**-test state; the only delta since is `settings.test.ts +46/-0`.

risk: Low on structural grounds. `settings.test.ts` carries no `@vitest-environment` docblock,
runs in the `node` environment, and stubs `window` itself — so it never touches the ambient
Web Storage that is the sole Node-version-conditional behaviour in this phase. Formally
unmeasured on that leg, however, and this is the phase whose entire purpose is not to accept
unmeasured claims.

resolves automatically: yes, on the next push of this branch.

result: PASSED — CI run
[31690000562](https://github.com/six2dez/drift/actions/runs/31690000562) on `1cb1cb6`.
`Verify (Node 20)` acquired `v20.20.2` and reported **23 files / 134 tests passed**, matching
the local measurement on 22.23.2 / 24.13.0 / 26.7.0. All four legs concluded `success`.

Incidentally confirmed on the same run: the `Upload plugin artifact` step on the Node 24 leg
succeeded with `dist/plugin_package.zip` (artifact `drift-plugin`, 600904 bytes). Since that
step carries `if-no-files-found: error`, it independently proves the `ci.yml` path fix made
during the `main` merge was both necessary and correct.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Phase verification scored 32/32 must-haves with `gaps: []`. This file tracks a
measurement that requires CI, not a defect.

## Note on cross-Node measurement integrity

While re-verifying, the verifier found that Homebrew's `node@23`, `node@24` and `node@25` on
this machine are identical 50320-byte shims that all report `v26.7.0`. Only `node@22`
(v22.23.2) and nvm's `v24.13.0` are genuine distinct majors. Local multi-Node claims should
therefore be limited to 22 / 24 / 26 — anything broader needs CI. Earlier plan-level claims of
a local three-major green gate were measured against these shims in part.
