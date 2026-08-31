---
phase: quick-260831-vep
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts
  - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts
  - .planning/quick/260831-vep-create-a-faithful-completion-order-harne/260831-vep-VERIFICATION.md
  - .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
autonomous: true
requirements: [LIF-01, LIF-02]
gap_closure: false
evidence_only: true

must_haves:
  truths:
    - "The harness enters production through init() and registered public RPC handlers, including a real startMcpServer -> createCliSession -> sendCliMessage -> stopMcpServer lifecycle."
    - "Only host boundaries are controlled: child_process completion timing, os platform/temp root, and observation of recursive fs.rm entry."
    - "The observation separately records signal issuance, provider exit completion, tree-killer completion, orphan-scan completion, and token-root removal start."
    - "The result is classified against the exact SC-4 predicate: provider kill/reap completion must precede recursive removal of the runtime root."
    - "An unfavorable result remains unfavorable; it is recorded as an actionable implementation gap and does not close LIF-01 or LIF-02."
    - "The harness cannot touch live Drift processes or real token-bearing temp roots."
  artifacts:
    - path: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts"
      provides: "Deterministic, production-wired completion-order harness"
      contains: "token_root_remove_started"
    - path: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts"
      provides: "Isolated Vitest entry point excluded from the normal suite"
      contains: "completion-order.harness.ts"
    - path: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/260831-vep-VERIFICATION.md"
      provides: "Raw observation, controls, command, hashes, and verdict"
      contains: "SC-4"
    - path: ".planning/phases/08-process-lifecycle/08-VERIFICATION-3.md"
      provides: "Additive current Phase 8 verdict after the evidence acquisition"
      contains: "gaps_found"
  key_links:
    - from: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts"
      to: "packages/backend/src/index.ts"
      via: "dynamic import followed by init() and captured sdk.api.register handlers"
      pattern: 'init\(sdk'
    - from: "packages/backend/src/index.ts"
      to: ".planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts"
      via: "mocked fs/promises.rm records completion flags at the production recursive-removal boundary"
      pattern: 'await rm\(cleanupTempDir'
---

<objective>
Acquire the third outstanding Phase 8 evidence item: execute a faithful harness that
determines whether provider-tree termination and the MCP orphan reap have completed
before Drift begins recursively removing the runtime directory containing token-source
files.

This is an evidence task, not authorization to redesign lifecycle production code. The
harness must be able to falsify SC-4. If it observes removal before either completion,
record `gaps_found`, leave LIF-01/LIF-02 open, and stop at the implementation boundary.

The normal Vitest suite must not discover this controlled adverse-schedule probe. It is
run only through its dedicated config and uses an isolated temporary root plus synthetic
token material.
</objective>

<context>
@packages/backend/src/index.ts
@packages/backend/src/index.source.test.ts
@.planning/phases/08-process-lifecycle/08-VERIFICATION-2.md
@.planning/phases/08-process-lifecycle/08-REVIEW-2.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build and execute the controlled completion-order harness</name>
  <files>
    .planning/quick/260831-vep-create-a-faithful-completion-order-harne/completion-order.harness.ts
    .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts
  </files>
  <action>
    Build a one-test Vitest harness outside the default test glob. Dynamically import the
    real backend entry module, call init() with a minimal fake SDK, and drive only the
    registered public RPC handlers. Use an isolated real temp/assets/plugin fixture.

    Mock child_process.spawn at the host boundary. Ordinary prerequisite probes settle
    successfully; startup pgrep settles with no match; the provider child accepts the
    signal but withholds exit/close; the group killer withholds close; and the teardown
    pgrep withholds close. Mock fs/promises.rm only to observe entry into recursive removal
    of the generated drift-mcp-* root, then delegate to the real implementation.

    At that boundary capture all completion flags and emit one JSON observation. Release
    every held fake child afterward so no timer/handle leaks. Assert non-vacuity controls:
    runtime started, provider was tracked, a forceful signal was issued, a tree killer was
    spawned, teardown pgrep was spawned, and exactly one target-root removal was observed.
    Assert the SC-4 predicate itself, so a current-tree violation produces a non-zero probe
    and cannot be mistaken for passing evidence.
  </action>
  <verify>
    <automated>
      pnpm exec vitest run --config .planning/quick/260831-vep-create-a-faithful-completion-order-harne/vitest.harness.config.ts --reporter=verbose
      # EXPECTATION: pass only if providerExitComplete, treeKillComplete and
      # reapScanComplete are all true at token_root_remove_started. A failure is a valid
      # evidence result and must be preserved verbatim.
    </automated>
  </verify>
  <done>
    The dedicated command executes exactly one production-wired probe, produces a complete
    JSON observation, and either proves SC-4 or fails specifically on its completion-order
    assertion after all non-vacuity controls pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Record and independently classify the evidence</name>
  <files>
    .planning/quick/260831-vep-create-a-faithful-completion-order-harne/260831-vep-VERIFICATION.md
    .planning/phases/08-process-lifecycle/08-VERIFICATION-3.md
  </files>
  <action>
    Record the exact command, exit status, raw JSON observation, harness/config SHA-256,
    isolation controls, and the SC-4 predicate. Inspect the harness for vacuous mocks and
    verify the production call path and removal hook independently. Classify as `passed`
    only when every required completion flag was true at removal start; otherwise classify
    as `gaps_found` and name the earliest violating event. Create additive
    `08-VERIFICATION-3.md` so `08-VERIFICATION-2.md` no longer remains the current verdict:
    carry forward its verified truths, change SC-4 from behavior-unverified to failed, list
    one actionable gap, and reduce the remaining acquisitions from three to two. Do not edit
    the historical 08-VERIFICATION.md, PROJECT.md, production source, or requirement status.
  </action>
  <verify>
    <automated>
      pnpm exec vitest run packages/backend/src/index.source.test.ts packages/backend/src/kill-tree.posix.test.ts packages/backend/src/orphan-reap.posix.test.ts
      pnpm lint
      git diff --check -- .planning/quick/260831-vep-create-a-faithful-completion-order-harne
    </automated>
  </verify>
  <done>
    The verification artifact contains enough raw evidence to reproduce and audit the
    result, preserves an unfavorable result without relabeling it, and existing targeted
    lifecycle tests plus lint remain green.
  </done>
</task>

</tasks>

<verification>
The evidence is valid only if the harness observes the production recursive rm boundary,
all adverse scheduling controls are reached, and the one-test command's exit code agrees
with the recorded SC-4 verdict. Existing statement-order tests are controls, not runtime
completion evidence.
</verification>

<success_criteria>
- One isolated, reproducible harness executes through Drift's public backend API.
- Completion and issuance are recorded as different events.
- The harness fails closed on incomplete kill/reap ordering.
- The exact raw result and hashes are preserved in the quick verification artifact.
- No production source, historical verifier file, PROJECT.md, or pre-existing untracked
  artifact is modified.
</success_criteria>

<output>
After execution, create `260831-vep-SUMMARY.md` and `260831-vep-VERIFICATION.md` in this
quick-task directory. Do not claim Phase 8 complete from this acquisition alone.
</output>
