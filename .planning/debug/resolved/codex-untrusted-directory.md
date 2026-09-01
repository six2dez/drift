---
status: resolved
trigger: "Continue Phase 8 evidence acquisition; a real Caido Codex turn exits before cancellation or timeout can be measured"
created: 2026-09-01T19:14:54Z
updated: 2026-09-01T19:35:21Z
---

## Current Focus

hypothesis: confirmed and fixed — Drift omitted Codex's --skip-git-repo-check flag while Caido launches the CLI outside a trusted repository
test: focused provider-launch regression plus real-Caido Codex cancellation and timeout runs
expecting: Codex accepts Caido's non-repository working directory and remains available for lifecycle enforcement
next_action: none
bug_class: integration
tdd_checkpoint:
  test_file: "packages/backend/src/provider-launch.test.ts"
  test_name: "allows Codex to run from Caido's non-repository working directory"
  status: "green"
  failure_output: "expected the argv to contain --skip-git-repo-check; received exec --color never -"

## Symptoms

expected: a Codex turn launched from Drift remains alive long enough to execute the user's prompt and can be terminated by Stop or the configured absolute timeout
actual: the provider exits immediately before executing the prompt, so no cancellation or timeout causal measurement is possible
errors: "Not inside a trusted directory and --skip-git-repo-check was not specified."
reproduction: "In real Caido, select Codex CLI in Drift and send any prompt while Caido's process working directory is not a trusted Git repository"
started: present since buildCodexLaunchArgs was introduced in commit 7b6de78

## Eliminated

- hypothesis: the Codex binary is missing or unavailable
  reason: Drift resolved and invoked Codex; the CLI itself emitted its repository trust refusal

- hypothesis: the prompt, MCP attachment, or Caido token caused the exit
  reason: Codex refused before prompt execution and named only the missing repository-check override

## Evidence

- timestamp: 2026-09-01T19:13:32Z
  checked: real Caido turn launched through Drift with Codex CLI selected
  found: the user prompt was recorded, Codex exited immediately, and the assistant bubble contained the trusted-directory refusal
  implication: the defect is on the provider-launch boundary, before lifecycle cancellation or timeout logic

- timestamp: 2026-09-01T19:14:54Z
  checked: installed Codex CLI 0.151.0 help and Drift's provider argument builder
  found: codex exec documents --skip-git-repo-check as allowing execution outside a Git repository; buildCodexLaunchArgs returns only exec, --color, never, and stdin marker
  implication: the missing fixed argument is both necessary for Caido's launch context and sufficient to address the observed refusal

- timestamp: 2026-09-01T19:14:54Z
  checked: git history for provider-launch.ts
  found: the fixed Codex argv has been unchanged since its initial introduction in commit 7b6de78
  implication: this is an original integration omission, not a regression from the Phase 8 lifecycle changes

- timestamp: 2026-09-01T19:15:26Z
  checked: focused provider-launch regression before the production change
  found: 10 tests passed and the new Codex non-repository assertion failed solely because --skip-git-repo-check was absent
  implication: the regression oracle is live, narrow, and directly tied to the confirmed root cause

- timestamp: 2026-09-01T19:27:11Z
  checked: focused provider-launch and lifecycle wiring suites after the production changes
  found: 95/95 tests passed, including the 11/11 provider-launch cases; typecheck, lint, and production build also passed
  implication: the fixed argv is covered without weakening the existing provider contracts

- timestamp: 2026-09-01T19:19:46Z
  checked: real-Caido Codex turn after installing the rebuilt plugin
  found: Codex started from Caido's working directory, spawned its MCP child, and remained live until the Drift Stop action; the prior trusted-directory refusal did not recur
  implication: the fix works at the integration boundary that originally failed, not only in the pure argument builder

## Resolution

root_cause: buildCodexLaunchArgs omitted Codex exec's documented --skip-git-repo-check option even though Caido starts the provider from a working directory that is not a trusted Git repository
fix: add --skip-git-repo-check to the fixed Codex exec argv
verification: focused regression 11/11; combined provider and lifecycle wiring suites 95/95; typecheck, lint, and build green; real-Caido Codex turn started and stayed live until lifecycle enforcement
files_changed: packages/backend/src/provider-launch.ts, packages/backend/src/provider-launch.test.ts

## Prevention

why_not_caught: the existing test snapshotted the incomplete argv and no test expressed the required non-repository Caido launch context
recurrence_guard: focused test "allows Codex to run from Caido's non-repository working directory"
