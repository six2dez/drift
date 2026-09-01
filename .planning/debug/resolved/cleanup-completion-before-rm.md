---
status: resolved
trigger: "ok, pues arregla"
created: 2026-09-01T12:35:46Z
updated: 2026-09-01T15:10:30+02:00
---

## Current Focus

hypothesis: confirmed and resolved — cleanup treated void kill/reap issuance as completion, so recursive removal had no happens-before edge from process terminal events
test: completed — automated completion-order oracle, full project gates, and real-Caido human verification all passed
expecting: satisfied — Stop returns promptly, provider/MCP children terminate, deferred cleanup completes before root removal, and MCP restarts cleanly
next_action: none — session archived and recurrence guard recorded in the durable debug knowledge base
bug_class: concurrency
reasoning_checkpoint:
  hypothesis: "cleanupMcpRuntimeGeneration starts recursive rm before provider/tree/reap terminal events because killTree and reapMcpOrphans expose only issuance (void), so statement order is mistaken for completion order"
  confirming_evidence:
    - "The production-wired harness observed directSignalIssued/treeKillSpawned/reapScanSpawned=true but providerExitComplete/treeKillComplete/reapScanComplete=false at rm in a deterministic run"
    - "The cleanup source calls void killTree/reapMcpOrphans and immediately awaits rm; neither helper returns a completion-bearing value"
    - "Caido's established status/session pumps document that directly awaiting child callbacks inside the initiating RPC can starve those callbacks"
  falsification_test: "If the same production-wired harness can observe rm starting while any of the three controlled terminal flags is false after explicit completion accounting is wired, the hypothesis is wrong or the barrier is incomplete"
  fix_rationale: "A generation-scoped barrier makes the destructive transition depend on observed terminal outcomes rather than call order, while callback-driven finalization lets the initiating stop RPC yield so Caido can deliver those outcomes"
  blind_spots: "Native Windows callback delivery cannot be exercised locally; fail-closed refusal/timeout paths will be unit-tested and existing Windows lifecycle gates must remain green"
  candidate_causes:
    - "code: cleanup helpers return void and cleanup immediately removes the captured root"
    - "environment: Caido/QuickJS starves child callbacks awaited inside an RPC, ruling out the otherwise-obvious direct Promise barrier"
    - "config/data: no setting or input shape changes the ordering; the synthetic token and isolated root reproduce with default lifecycle policy"
  and_gate: "no — the missing code-level completion edge alone causes the violation under any schedule where child completion is delayed; QuickJS starvation constrains the repair but is not required for the bug"
tdd_checkpoint:
  test_file: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts"
  test_name: "waits for kill and reap completion before recursive token-root removal"
  status: "green"
  failure_output: "Pre-fix: AssertionError expected false to be true; post-fix DRIFT_COMPLETION_ORDER_OBSERVATION requirementSatisfied=true"

## Symptoms

expected: every tracked provider is dead and the generation-scoped orphan reap is complete before recursive removal of its token-source root begins
actual: recursive removal starts while provider exit, tree-killer close, and orphan-scan close are all pending
errors: "DRIFT_COMPLETION_ORDER_OBSERVATION requirementSatisfied=false; explicit harness exits 1 on the favorable assertion"
reproduction: "pnpm exec vitest run --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts --reporter=verbose"
started: present in the current Phase 8 fire-and-forget cleanup design; demonstrated on commit 730c09f

## Eliminated

## Evidence

- timestamp: 2026-09-01T12:35:46Z
  checked: production-wired completion-order harness
  found: signal and both helpers were issued, but all three completion flags were false at recursive rm entry in four identical runs
  implication: statement ordering is not a completion barrier

- timestamp: 2026-09-01T12:35:46Z
  checked: packages/backend/src/index.ts cleanupMcpRuntimeGeneration
  found: killTree and reapMcpOrphans return void; await rm follows immediately; source comments explicitly disclaim completion ordering
  implication: root cause is in orchestration semantics, not test timing

- timestamp: 2026-09-01T12:45:00Z
  checked: repository status before production work
  found: pre-existing modified planning files and multiple untracked planning artifacts are present; the production tree is not reported modified
  implication: changes must be limited to the cleanup production code, its tests/harness if strictly necessary, and this debug session without disturbing unrelated planning work

- timestamp: 2026-09-01T12:45:00Z
  checked: symbol and caller search across backend and explicit harness artifacts
  found: cleanupMcpRuntimeGeneration is the central teardown; cleanupMcpRuntime serializes calls, while killTree and reapMcpOrphans have independent asynchronous callbacks and many lifecycle callers pump state through status/session RPCs
  implication: the fix belongs in teardown orchestration and must preserve generation guards across concurrent stop/start paths

- timestamp: 2026-09-01T12:51:00Z
  checked: full explicit harness scheduler and cleanup/reap/killTree implementations
  found: rm observes provider exit, tree-killer close, and reap-scanner close; production exposes none of those completions, while the harness deliberately holds all controlled-child completions until stop returns
  implication: simply converting helpers to Promise and awaiting them inside stop would create a deadlock and violate the constrained-runtime liveness requirement; cleanup completion must be decoupled from the initiating RPC

- timestamp: 2026-09-01T12:51:00Z
  checked: mcp-lifecycle generation and teardown state
  found: the lifecycle module already has epoch guards, exact provider-start lease retirement, and a FIFO operation tail, but no pending cleanup state or child-completion accounting
  implication: statement ordering cannot be repaired solely by the existing epoch primitives; a completion-bearing state transition is needed

- timestamp: 2026-09-01T13:00:00Z
  checked: harness verification contract and frontend polling behavior
  found: verification explicitly requires a non-starving state-machine boundary; the settings toggle calls getMcpStatus immediately after stop, and getMcpStatus is already the established frontend-driven child-callback pump for self-tests
  implication: cleanup can return after issuance and finalize from later terminal callbacks/status wakeups without blocking the stop RPC; the harness scheduler must release its controlled child completions after stop returns while retaining the favorable assertion

- timestamp: 2026-09-01T13:00:00Z
  checked: common bug patterns and failure taxonomy
  found: the symptom matches Async/Timing race condition and invalid state-transition patterns; reproduction is deterministic under the adverse scheduler
  implication: this is a concurrency-class Bohrbug under controlled scheduling, routed first through completion/ordering analysis rather than SBFL

- timestamp: 2026-09-01T13:05:00Z
  checked: unchanged explicit completion-order harness on the current production tree
  found: deterministic RED in 152 ms; direct signal, tree-killer spawn, and reap-scan spawn were true, while provider exit, tree-killer close, and reap-scan close were false at recursive rm; only the favorable requirementSatisfied assertion failed
  implication: the regression oracle is live and non-vacuous, and the root cause reproduces independently of the prior report

- timestamp: 2026-09-01T13:05:00Z
  checked: SBFL eligibility
  found: the dedicated harness has one failing test and no passing per-test coverage population
  implication: spectrum-based localization is skipped; it cannot produce a meaningful Ochiai ranking for this session

- timestamp: 2026-09-01T13:32:00Z
  checked: harness schedule compatibility with the required non-starving design
  found: the original scheduler held all terminal events until finally but copied removals[0] before finally, so no legitimate deferred fix could make its favorable assertion green
  implication: the controlled schedule was minimally corrected to release terminal events after stop returns and wait for deferred rm; production wiring, observation fields, non-vacuity checks, and requirementSatisfied === true remain unchanged

- timestamp: 2026-09-01T13:38:00Z
  checked: cleanup-barrier unit tests after the production change
  found: 23/23 mcp-lifecycle tests passed, including empty, all-safe, fail-closed, duplicate, and unknown completion boundaries
  implication: the pure coordination state does not authorize removal early and terminal-event duplication cannot reverse a settled disposition

- timestamp: 2026-09-01T13:38:00Z
  checked: explicit production-wired completion-order harness after the production change
  found: GREEN in 140 ms with exactly one removal and providerExitComplete/treeKillComplete/reapScanComplete/requirementSatisfied all true
  implication: the original security predicate is satisfied while stop still returns before the harness releases any child completion

- timestamp: 2026-09-01T13:42:00Z
  checked: exact working-tree diff after targeted formatting
  found: Prettier rewrote thousands of unrelated lines in the previously clean index.ts because the file is not currently normalized to default Prettier output
  implication: formatter noise must be removed before verification so review and guardrail signals measure only the lifecycle fix

- timestamp: 2026-09-01T13:47:00Z
  checked: focused index source, lifecycle, and kill-plan suites after restoring a narrow production diff
  found: 215/220 passed; all five failures are stale source-shape assertions expecting rm inside cleanupMcpRuntimeGeneration or exactly two hasTrackedProcessExited calls
  implication: behavioral logic remains green; source gates must be upgraded from statement-order checks to the new completion-barrier/removal-helper contract

- timestamp: 2026-09-01T13:55:00Z
  checked: focused suites and compilation after updating source contracts
  found: 220/220 focused tests passed and all three workspace typechecks completed successfully
  implication: source gates now assert the barrier-to-removal edge, and the production change is type-correct across backend, frontend, and shared packages

- timestamp: 2026-09-01T13:55:00Z
  checked: platform-specific fail-closed review
  found: Windows intentionally has no argv orphan enumerator; unsupported-platform is now treated as an explicit not-applicable completion while bad-marker, timeout, stale, spawn, and kill failures remain fail-closed
  implication: normal Windows stop/restart is not permanently blocked, while uncertain POSIX teardown retains the token-source root

- timestamp: 2026-09-01T14:00:00Z
  checked: repeated oracle and release gates
  found: explicit harness passed 3/3 with identical favorable observations; typecheck, lint, and production build exited zero; pnpm test is not defined in package.json
  implication: the oracle is stable and compile/lint/package gates are clean; the full suite must be invoked directly with pnpm exec vitest run as documented by the project

- timestamp: 2026-09-01T14:05:00Z
  checked: full Vitest suite
  found: 42 files passed, 2 native-Windows files skipped; 805 tests passed and 8 skipped
  implication: adjacent functionality across the complete project remains green

- timestamp: 2026-09-01T14:05:00Z
  checked: mutation-tool and no-op/deletion guardrail availability
  found: no Stryker dependency or configuration exists; the focused diff is additive (453 insertions, 39 deletions), preserves the favorable assertion verbatim, and replaces immediate removal with completion accounting rather than deleting behavior
  implication: mutation signal must be recorded skipped due to unavailable infrastructure; no-op/deletion signal passes

- timestamp: 2026-09-01T14:10:00Z
  checked: scoped revert-and-reconfirm guardrail
  found: with only this fix stashed, the original harness returned requirementSatisfied=false and exited 1; after restoring the exact stash, the same harness returned requirementSatisfied=true and exited 0
  implication: this production/test change, rather than unrelated workspace state, is causally responsible for closing the completion-order defect

- timestamp: 2026-09-01T14:15:00Z
  checked: final scoped diff and workspace preservation audit
  found: git diff --check passed; the favorable assertion remains verbatim; only the five intended tracked implementation/test artifacts are changed by this task, while pre-existing planning modifications and untracked artifacts remain present and untouched
  implication: the fix is reviewable, contains no whitespace errors, and preserves the handoff boundary

- timestamp: 2026-09-01T15:07:18+02:00
  checked: fresh pre-archive verification boundary
  found: completion-order oracle passed 3/3 with requirementSatisfied=true; full Vitest passed 805 tests with 8 native-Windows skips; typecheck, lint, and production build exited zero
  implication: the committed handoff is backed by fresh regression, adjacent-suite, compilation, lint, and packaging evidence

- timestamp: 2026-09-01T15:08:30+02:00
  checked: real-Caido human verification checkpoint
  found: the user confirmed the original live-provider Stop and MCP restart workflow is fixed
  implication: the repair is verified end-to-end in the runtime environment that local automation cannot reproduce

- timestamp: 2026-09-01T15:10:30+02:00
  checked: semantic debug-recall indexing
  found: the mempalace CLI is not installed in this environment; the resolved-session entry was written successfully to .planning/debug/knowledge-base.md
  implication: semantic indexing is skipped explicitly and the durable keyword-recall fallback remains available

## Resolution

root_cause: cleanupMcpRuntimeGeneration mistakes kill/reap invocation order for completion order because killTree and reapMcpOrphans return void; recursive removal therefore has no happens-before edge from provider exit, tree-killer close, or orphan-reap settlement
fix: added a generation-scoped callback completion barrier; provider exit, tree-killer settlement, orphan-scan settlement, and spawned orphan-killer settlement now gate recursive removal; uncertain outcomes retain the root fail-closed and block replacement start; the harness releases controlled completions only after Stop yields
verification:
  target_test:
    result: pass
    evidence: "explicit completion-order harness passed 3/3 plus post-revert reconfirm; all completion flags and requirementSatisfied were true"
  mutation_check:
    result: skipped
    reason_if_skipped: "no Stryker dependency or configuration exists in the repository"
    mutant_killed: null
  no_op_deletion:
    result: pass
    deletion_justified_by_rca: false
    evidence: "additive completion state machine; favorable assertion unchanged; destructive rm moved behind the barrier rather than removed or short-circuited"
  adjacent_tests:
    result: pass
    suites_run:
      - "focused index.source + mcp-lifecycle + kill-plan: 220/220"
      - "full Vitest: 805 passed, 8 native-Windows skipped"
      - "workspace typecheck"
      - "ESLint --max-warnings 0"
      - "Caido production build"
  revert_and_reconfirm:
    result: pass
    bug_returned_on_revert: true
    fixed_on_reapply: true
  human_verification:
    result: pass
    environment: real Caido workflow with a live provider turn, MCP Stop, and restart
    evidence: "user response: confirmed fixed"
  guardrail_verdict: accepted
oracle_type: specified
files_changed:
  - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts
  - packages/backend/src/index.ts
  - packages/backend/src/index.source.test.ts
  - packages/backend/src/mcp-lifecycle.ts
  - packages/backend/src/mcp-lifecycle.test.ts

## Prevention

causal_branches:
  code:
    - "cleanupMcpRuntimeGeneration issued direct signals, tree kills, and an orphan scan through void helpers"
    - "because those helpers exposed no completion-bearing state, the cleanup function could only sequence invocation statements"
    - "recursive rm was therefore reachable without proof that token-consuming processes had reached terminal outcomes"
  environment:
    - "Caido's constrained event loop may withhold child callbacks while the initiating RPC is awaiting"
    - "because a direct Promise wait can deadlock Stop, the completion boundary must be callback-driven and advanced by later host/status turns"
    - "the previous harness did not model that required yield-and-resume boundary, so it first exposed the race but could not accept a valid deferred repair"
  verification:
    - "existing source tests asserted statement shape and immediate cleanup rather than the security predicate at recursive removal"
    - "because no production-wired test observed provider, tree-killer, and orphan-reap terminal state at rm entry, invocation order was mistaken for completion order"
and_gate: "no — the code-level missing completion edge independently caused unsafe removal; the runtime environment constrained the safe repair design but was not required to trigger the defect"
why_not_caught: "no pre-existing gate exercised the production-wired completion predicate at recursive token-root removal; source-shape tests encoded invocation order instead"
recurrence_guard: "the regression test .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts: waits for kill and reap completion before recursive token-root removal, backed by the MCP cleanup completion barrier unit cases in packages/backend/src/mcp-lifecycle.test.ts"
