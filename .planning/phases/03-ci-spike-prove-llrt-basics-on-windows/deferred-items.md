# Phase 3 — Deferred Items

Out-of-scope discoveries logged during execution. Not fixed here; recorded so they are not
rediscovered as new findings.

## Pre-existing ROADMAP.md formatting defects (not touched)

Found during plan 03-01's state-update step, both pre-existing in the committed file and both
outside this plan's `files_modified`:

1. **`.planning/ROADMAP.md` line 100** — `**Plans**: 5 plans (4 waves)Plans:` is missing a
   newline before the trailing `Plans:`. Cosmetic; the Wave/plan checklist below it renders fine.
2. **`.planning/ROADMAP.md` Phase 999.1 (Backlog)** — its `**Plans:** 6/6 plans complete` line
   is wrong for a backlog entry whose only plan row is `- [ ] TBD` (its sibling 999.2 reads
   `**Plans:** 0 plans`).

## Tooling defect that touches item 2 above

`gsd-tools roadmap update-plan-progress 03` rewrote the **backlog** Phase 999.1 `**Plans:**`
line instead of (or in addition to) the Phase 3 one — it replaced `6/6 plans complete` with
`1/5 plans executed`. Plan 03-01 reverted that specific line to its committed text and left the
pre-existing oddity alone. Expect the same mis-targeted rewrite on every future
`update-plan-progress` run in this repo, and check the backlog section's diff before committing.
