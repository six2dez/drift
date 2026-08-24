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
