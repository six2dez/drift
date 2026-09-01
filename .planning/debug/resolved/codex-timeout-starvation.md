---
status: resolved
trigger: "Phase 8 real-Caido timeout acquisition; a Codex turn configured for 10 seconds completed naturally after sleep 60"
created: 2026-09-01T19:25:12Z
updated: 2026-09-01T19:35:21Z
---

## Current Focus

hypothesis: confirmed and fixed — the absolute timeout depended only on a starvable backend setTimeout callback while the pumped heartbeat ignored the deadline
test: source-wiring TDD plus a repeated real-Caido 10-second Codex timeout with an external 250 ms process watcher
expecting: timer and heartbeat share one kill-before-finalize expiry path, and real Caido reaches zero provider/MCP processes near the configured deadline
next_action: none
bug_class: integration
tdd_checkpoint:
  test_file: "packages/backend/src/index.source.test.ts"
  test_name: "enforces the absolute deadline from the keep-alive-pumped heartbeat"
  status: "green"
  failure_output: "RED: 4 new assertions failed because the shared expiry function, heartbeat deadline check, and timer routing were absent; GREEN: 84/84 source-wiring tests passed"

## Symptoms

expected: a Drift-spawned Codex turn with processTimeoutSeconds=10 is killed near the configured deadline, returns a timeout error, and leaves no provider or MCP process
actual: the provider and MCP remained alive beyond 32 seconds, Codex completed sleep 60 naturally, and the UI rendered TIMEOUT_PROBE_DONE instead of a timeout
errors: no error was emitted; the missing timeout is the defect
reproduction: "In real Caido, select Codex CLI, set CLI process timeout to 10 seconds, and send a prompt that executes sleep 60"
started: unknown; the timer-only absolute timeout predates this live Phase 8 measurement

## Eliminated

- hypothesis: the setting failed to persist or is expressed in minutes
  reason: the real UI showed 10, the backend multiplies processTimeoutSeconds by 1000, and the default is 120 seconds

- hypothesis: the provider ended before the deadline or the watcher missed its process tree
  reason: the watcher observed the provider at 19:21:57.811Z, its MCP child at 19:21:58.068Z, and both still alive at 19:22:17.214Z; the UI later rendered the requested TIMEOUT_PROBE_DONE completion

## Evidence

- timestamp: 2026-09-01T19:21:57Z
  checked: clean-baseline real-Caido Codex timeout run with processTimeoutSeconds=10
  found: provider pid 65208 was spawned by Caido and MCP pid 65232 was spawned by the provider in a distinct process group
  implication: the test exercised the real Drift-to-Codex-to-MCP topology rather than a proxy harness

- timestamp: 2026-09-01T19:22:17Z
  checked: sanitized 250 ms process watcher after the configured deadline
  found: provider, MCP, and Codex code-mode host were all still alive, with global MCP count one
  implication: the absolute timeout did not terminate the turn

- timestamp: 2026-09-01T19:24:05Z
  checked: real Drift UI and process table after natural completion
  found: the UI contained TIMEOUT_PROBE_DONE and all target processes were gone only after Codex completed the requested sleep
  implication: this was a missed deadline, not delayed cleanup after a timeout

- timestamp: 2026-09-01T19:25:12Z
  checked: frontend keep-alive, getCliSessionState, heartbeat, and absolute-timeout wiring
  found: getCliSessionState pumps heartbeat every approximately 1.5 seconds, but heartbeat only detects process exit and Claude-specific silence; the absolute deadline exists solely in setTimeout
  implication: Caido timer starvation bypasses the only absolute-deadline enforcement path even though the explicit keep-alive pump is active

- timestamp: 2026-09-01T19:26:13Z
  checked: new source-wiring regression before the production change
  found: 80 existing tests passed and all four new timeout assertions failed for the expected missing shared-expiry and heartbeat-deadline wiring
  implication: the regression was red for the observed root cause rather than for unrelated lifecycle behavior

- timestamp: 2026-09-01T19:27:02Z
  checked: focused source-wiring suite and typecheck after the change
  found: 84/84 tests passed and all three workspace packages typechecked
  implication: both wake-up paths share the guarded expiry without breaking the existing lifecycle wiring

- timestamp: 2026-09-01T19:31:38Z
  checked: rebuilt plugin installed in real Caido, Codex CLI selected, processTimeoutSeconds=10, clean global MCP baseline, prompt executing sleep 60
  found: provider appeared at 19:31:38.339Z, MCP child appeared at 19:31:38.603Z in its own process group, and both were absent with global MCP count zero at 19:31:48.419Z
  implication: the keep-alive-pumped deadline killed and reaped the real provider topology approximately 10.24 seconds after Send, long before natural completion

- timestamp: 2026-09-01T19:32:00Z
  checked: Drift UI and diagnostics after the fixed timeout
  found: the UI reported Process timed out, no TIMEOUT_FIXED_PROBE_DONE completion marker existed, activeSessions was zero, and lastOrphanReap recorded kind=noop reason=scan-failed exit=1 attempted=0
  implication: the turn was classified as a timeout and reached the idle cleanup boundary; exit 1 is the current no-match diagnostic spelling, so it does not claim the reap itself found a survivor

## Resolution

root_cause: sendCliMessage enforced processTimeoutSeconds only through setTimeout, but Caido can starve that callback while the send RPC awaits the provider; getCliSessionState already pumped heartbeat every approximately 1.5 seconds, yet heartbeat never compared the current time with the absolute deadline
fix: snapshot processDeadlineAt when the turn starts, enforce it from heartbeat, and route both heartbeat and native timer wake-ups through one expireTimedOutTurn function that kills before finalize removes token-bearing files
verification: TDD red 4 expected failures; green 84/84 source-wiring tests; combined focused suites 95/95; typecheck, lint, and build green; real-Caido 10-second run reached zero provider/MCP processes at 10.24 seconds and rendered Process timed out
files_changed: packages/backend/src/index.ts, packages/backend/src/index.source.test.ts

## Prevention

why_not_caught: Node-based tests run timers normally and the existing source gate checked timer kill-before-finalize ordering, but no gate required the Caido keep-alive path to enforce the deadline
recurrence_guard: source-wiring block "enforces one kill-before-finalize timeout from timer and heartbeat" plus the resolved real-Caido measurement in this record
