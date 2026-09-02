---
status: resolved
trigger: "vale, pues arregla los bloqueos actuales"
created: 2026-09-01T22:21:57+02:00
updated: 2026-09-02T08:57:23+02:00
---

## Current Focus

hypothesis: confirmed — teardown issued the orphan scan correctly, but the frontend performed only one status refresh; if that RPC arrived before pgrep closed, no further wake-up reached Caido before the 1 s freshness budget expired, so a real match was rejected as scan-stale and the token root was retained fail-closed
test: passed — the patched build killed a detached marker-matching fixture, removed the captured runtime root, and recorded kind=reap exit=0 attempted=1 ageMs=109 in real Caido
expecting: satisfied — the frontend's 100 ms condition loop pumped child-process callbacks before the freshness bound without weakening the backend's stale-pid refusal
next_action: none — Phase 8 is 20/20 and the 0.2.0 candidate is release-ready; main push/release remains an explicit maintainer action

## Symptoms

expected: the final release SHA has a new unprefixed version, passes the permanent native-Windows lifecycle gate, and has no lifecycle requirement marked complete without matching evidence
actual: the current package still resolves to the already-published immutable 0.1.0 tag, HEAD has no remote CI run, and Phase 8 remains human_needed at 18/20 with LIF-01 and LIF-02 unchecked
errors: no executed release failure; the deterministic collision is that release.yml derives tag 0.1.0 from the package while GitHub already has an immutable 0.1.0 release
reproduction: inspect Git/remote state, caido.config.ts and release.yml, then compare REQUIREMENTS.md with 08-VERIFICATION-5.md and the native lifecycle suites
started: after the Phase 8 post-fix verification was recorded on 2026-09-01

## Eliminated

- hypothesis: LIF-02 is blocked only by stale requirement prose
  reason: a real Caido teardown returned pgrep exit 0 but recorded scan-stale at ageMs=22750 and left the detached matching fixture alive

- hypothesis: the production argv-marker or kill plans cannot select and terminate a detached MCP-shaped process
  reason: the focused POSIX behavioural suites passed 5/5, including both blast-radius controls; the real Caido diagnostic exit 0 separately proves the shipping scanner selected the fixture

## Evidence

- timestamp: 2026-09-01T22:23:25+02:00
  checked: focused POSIX process-group and argv-marker behavioural suites
  found: 2 files passed, 5 tests passed; the marked detached child died while the different-token and different-prefix controls survived
  implication: the pure production plans and OS primitives work; the unresolved boundary is Caido orchestration

- timestamp: 2026-09-01T22:27:35+02:00
  checked: real Caido 0.58.2 teardown with one detached marker-matching fixture in its own process group
  found: Stop set MCP to stopped, but diagnostics recorded kind=noop reason=scan-stale exit=0 attempted=0 ageMs=22750 and the fixture remained alive
  implication: pgrep executed and matched, but callback starvation aged a valid result past the safety budget before classification

- timestamp: 2026-09-01T22:30:03+02:00
  checked: new frontend regression before the pump implementation
  found: expected two getMcpStatus calls but observed one; the focused test failed exactly at the call-count assertion
  implication: the UI had no second wake-up after an early pending status response

- timestamp: 2026-09-01T22:31:08+02:00
  checked: focused frontend, MCP status builder, backend source-wiring suites and workspace typecheck after the change
  found: 106 tests passed and all three workspace typechecks passed
  implication: cleanup state reaches the frontend and the polling loop stops on idle or reports failed-closed

- timestamp: 2026-09-01T22:23:14+02:00
  checked: GitHub Actions CI and Windows LLRT Primitive Probe on candidate SHA 0509d9d
  found: both workflows completed successfully
  implication: native Windows evidence exists for the pre-patch candidate and must be repeated on the final code SHA

- timestamp: 2026-09-02T08:33:55+02:00
  checked: patched package installed in Caido 0.58.2 with a detached, separately grouped, bounded-lifetime process carrying the active session runtime marker in its argv and no token
  found: Stop returned with the fixture dead, zero marker matches, and the captured runtime directory removed; diagnostics recorded kind=reap exit=0 attempted=1 ageMs=109
  implication: the shipping scanner, classifier, killer, completion barrier, and frontend callback pump executed causally in the constrained runtime before token-root removal

- timestamp: 2026-09-02T08:37:08+02:00
  checked: fresh local release gates after the real-Caido proof and 0.2.0 metadata change
  found: full Vitest passed 810 tests with 8 native-Windows skips; all workspace typechecks, lint, build, ZIP creation, and manifest version 0.2.0 passed
  implication: the runtime fix has no observed local regression and the immutable 0.1.0 tag collision is removed

- timestamp: 2026-09-02T08:37:43+02:00
  checked: final candidate publication boundary
  found: code/release candidate SHA 9aa22bb was pushed only to scratch/ci-08-release-readiness-final; main was not pushed and no release was created
  implication: GitHub Actions can now provide native Windows evidence against the exact code candidate without publishing it

- timestamp: 2026-09-02T08:39:13+02:00
  checked: CI run 33599694679 and Windows LLRT run 33599694508 on candidate 9aa22bb
  found: Windows and Node 20/22/24/26 all succeeded; Windows ran 812 tests with 6 POSIX skips, the native kill-tree file passed 2/2, the live parent/grandchild behavioral case passed, the killer resolved to C:\Windows\System32\taskkill.exe, and the exact-count/identity gate fired
  implication: SC-1 and the Windows half of SC-3 have native behavior evidence rather than skipped or static proxy evidence

- timestamp: 2026-09-02T08:53:28+02:00
  checked: three fresh completion-order harness processes
  found: every process observed direct signal issuance, provider exit, tree-killer spawn/completion, reap scan spawn/completion, and requirementSatisfied=true before token_root_remove_started
  implication: the faithful adverse-schedule harness and the real-Caido fixture agree on completion-before-removal

- timestamp: 2026-09-02T08:57:23+02:00
  checked: fresh full release gates and living verdict/security controls after closing LIF-01/LIF-02
  found: Vitest 810 passed/8 skipped, typecheck, lint, build/ZIP 0.2.0, verdict live/self-test, threat live/self-test/self-scan, independent 32-case matrix, and diff check all passed after rebasing the package audit to 9aa22bb
  implication: the closure records are internally consistent and the release candidate retains zero open blocking threats

## Resolution

root_cause: three independent release blockers remained — immutable tag 0.1.0 would collide; native Windows behavior had never executed; and Caido callback starvation left a valid orphan scan stale because Settings issued only one post-Stop status refresh
fix: bump release metadata to 0.2.0; publish cleanupState through the backend/shared contract; pump getMcpStatus at 100 ms until idle/failed-closed/bounded timeout; preserve the backend freshness refusal and completion barrier; close the living Windows/LIF records only after native and real-Caido evidence existed
verification: pre-fix real Caido reproduced scan-stale with exit=0 and a live fixture; post-fix real Caido recorded kind=reap exit=0 attempted=1 ageMs=109 with target death and root removal; completion harness passed 3/3; local 810/8 plus typecheck/lint/build passed; native Windows 2/2 and all CI jobs passed; verdict/threat adversarial gates passed
files_changed: packages/backend/src/index.ts, packages/backend/src/index.source.test.ts, packages/backend/src/mcp-runtime.ts, packages/backend/src/mcp-runtime.test.ts, packages/frontend/src/stores/settings.ts, packages/frontend/src/stores/settings.test.ts, packages/shared/src/mcp.ts, packages/backend/assets/mcp-server.mjs, package.json, caido.config.ts, CHANGELOG.md, and current Phase 8 planning/evidence records

## Prevention

why_not_caught: Node delivers the child close callback without Caido's RPC-await starvation, the frontend had no regression requiring a second status pump, and prior Windows runs either did not exist or skipped the native suite while portable gates stayed green
recurrence_guard: frontend pending-to-idle and failed-closed pump tests; backend/source cleanupState wiring tests; permanent exact-count and behavioral-identity Windows gate; package-head threat audit gate; faithful completion-order harness; additive 08-VERIFICATION-6.md evidence boundary
