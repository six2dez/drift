# Phase 8 — deferred items

Out-of-scope discoveries made during execution. Logged, not fixed (executor scope boundary).

## `.planning/milestone.lock` is untracked and not gitignored

Found during: 08-01 T-08-01 commit.

The GSD tooling writes `.planning/milestone.lock` while a phase executes. It carries a
session id, a machine-local pid and a timestamp — pure runtime state. It has never been
tracked, no comparable lock file is tracked anywhere in the repo, and it is not listed in
`.gitignore`, so it shows up as untracked noise in every `git status` during a phase run.

Not fixed here: adding it to `.gitignore` is a repo-config change outside plan 08-01's
declared `files_modified` (`packages/backend/src/index.ts`, `08-SPIKE.md`). Committing the
file itself would be worse — it would bake a lock naming a dead pid into git history.

Suggested resolution: add `.planning/milestone.lock` to `.gitignore` in a standalone chore
commit, outside this phase.

## Registration hygiene — a token-bearing MCP registration Drift cannot withdraw

Found during: 08-10 Task 3, from the 2026-08-27 UAT diagnostics (gaps G-04 and the
`mcpCliRemovalFailures` observation).

Drift's `mcp add drift` registration persists in the provider CLI's **own** configuration. **Any
instance of that CLI on the machine can therefore launch Drift's MCP server on its own
initiative, with a live `CAIDO_TOKEN`**, without Drift spawning it, tracking it in
`activeProcesses`, or holding any handle on it. That is the route UAT gap G-04's orphan arrived
by: pid 44284 alive with `activeSessions: 0`, parented by a `codex` binary at a path Drift never
registered. Phase 8 closes this at the **process** layer — the argv-marker reap plans 08-06 and
08-07 shipped can now terminate such a process — but it does nothing at the **registration**
layer, so the same orphan can be created again a second later.

Not fixed here: recorded decision **GD-02** puts the registration layer explicitly out of scope
for Phase 8, which is a lifecycle phase. Whether Drift's registered MCP config *should* be usable
by CLI instances Drift did not spawn is a product decision with its own blast radius, and it is
not a question an executor answers inside a documentation plan. Recorded as accepted residual
**AR-06** in `08-SECURITY.md` (threat T-08-47, an accepted `high` with a named decider) rather
than left as an absence.

Suggested resolution: a registration-focused phase entered through `/gsd-discuss-phase`. Not
assigned to an existing phase, because assigning it would imply the decision had been made.

## The Gemini `mcp remove` failures — AR-06's live instance

Found during: 08-10 Task 3, same 2026-08-27 diagnostics report.

`mcpCliRemovalFailures: gemini: 2 failed (scope=user exit=127, scope=project exit=127)`. Drift
attempted to withdraw a Drift MCP registration **it had itself created**, at both the user and
the project scope, and **could not** — exit 127 at both. Drift's own message states that a Drift
MCP entry carrying a Caido session token may still be present in the Gemini CLI's configuration
on that machine. This is not a hypothetical: it is a **live token-at-rest condition** on the
maintainer's own install, and it is the concrete instance of the class AR-06 describes.

Not fixed here: this is Phase 7 (registration) territory, not Phase 8 (lifecycle), and plan 08-10
modifies no source at all. Exit 127 is "command not found", so the likely cause is binary
resolution at removal time rather than a Gemini-side refusal — which would make it the same
resolution family Phase 6 and Phase 8 plan 08-08 worked on, but that is a hypothesis and this
entry is not the place to test it.

Suggested resolution: clear the live condition by hand today —
`gemini mcp remove --scope user drift` and `gemini mcp remove --scope project drift` — and
diagnose the exit-127 resolution failure in the registration phase AR-06 points at.
