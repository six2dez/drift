# Deferred Items — Phase 01

Out-of-scope discoveries found while executing this phase. Not fixed here (they are
not caused by this phase's changes); logged so they are not lost.

## 1. `ROADMAP.md` progress-writer corrupted two lines

**Found during:** plan 01-06 state updates
**Severity:** cosmetic / misleading planning doc, no code impact

Two lines in `.planning/ROADMAP.md` look like a prior automated progress update wrote
into the wrong anchor:

| Line | Current text | Expected |
|---|---|---|
| `:51` | `**Plans**: 6 plansPlans:` | `**Plans**: 6 plans` followed by a newline and `Plans:` |
| `:268` | Under **Phase 999.1 (BACKLOG)**: `**Plans:** 5/6 plans executed` | `**Plans:** 0 plans`, matching every other 999.x backlog entry |

Line 268 is the more misleading of the two: it reports a *backlog* phase as 5/6 executed.
The count `5/6` is Phase 1's plan count at the time, so the writer targeted the wrong
section heading.

**Not fixed here** because neither line was produced by this phase's work and blind-editing
a doc that an SDK writer owns risks a second, harder-to-spot corruption. Fix alongside the
next `roadmap` tooling change, or verify the writer's anchor logic first.

## 2. `IMPROVEMENT-PLAN.md` still untracked at the repo root

**Found during:** plan 01-06 task 1
**Severity:** low, but it blocks a literal "clean working tree" assertion and is a
publish hazard on a public repo

Carried since before this phase (STATE.md Session Continuity, and 01-05's coordination
notes). Plan 01-06 deliberately did not commit or delete it — it is a user file outside
that plan's `files_modified` — and instead used targeted `git add <path>` on every scratch
branch so it was never staged or pushed.

**Decision still needed:** commit it, delete it, or add it to `.gitignore`. Until then a
bare `git add -A` anywhere in this repo would publish it to the public remote. Tracked in
STATE.md Session Continuity.
</content>
