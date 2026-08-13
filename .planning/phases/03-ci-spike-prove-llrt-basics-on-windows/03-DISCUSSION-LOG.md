# Phase 3: CI Spike — Prove LLRT Basics on Windows - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 03-ci-spike-prove-llrt-basics-on-windows
**Areas discussed:** Triggers and job lifetime, Probe failure policy, How results feed back

---

## Entry condition

Phase 3 already had `03-RESEARCH.md` and `03-01-PLAN.md`, created without user context.

| Option | Description | Selected |
|--------|-------------|----------|
| Discuss and replan after | Capture decisions in CONTEXT.md, then regenerate the plan | ✓ |
| View the existing plan first | Show 03-01-PLAN.md, decide after | |
| Cancel the discussion | Skip to executing the existing plan | |

**Notes:** During analysis, the existing plan and research were found to have been written
against the **pre-Phase-1** CI. Concretely: `branches: [main]` triggers (Phase 1 removed the
filter), `@v4` action pins (now `@v5`/`@v6`), and `node-version: 20` described as "matches
ci.yml exactly" (now a 20/22/24/26 matrix). The plan also justifies threat mitigation T-01-02
with "no new third-party actions beyond what ci.yml already trusts" — a premise that is now
false — and three of its automated gates grep for `@v4` strings. This strengthened the case for
replanning.

Also corrected during analysis: an initial framing that the plan "silently substituted" Node.js
for LLRT was **wrong**. `03-RESEARCH.md` documents fidelity per assertion with a residual-risk
column, marks P2-OS as `PARTIAL — by structural analysis`, and verifies LLRT's resolver in the
Rust source. The substitution is documented, not hidden.

---

## Triggers and job lifetime

### When the job runs

| Option | Description | Selected |
|--------|-------------|----------|
| Push/PR on every branch | Bare `on: push` + `pull_request`, matching ci.yml after Phase 1 | ✓ |
| `workflow_dispatch` only | Manual; but the existing plan explicitly forbids `workflow_dispatch` | |
| Both | Bare push/PR plus manual re-run | |

**User's choice:** Push/PR on every branch.
**Notes:** The deciding argument was that a workflow only runs from the branch it lives on, so
`branches: [main]` would mean never seeing the probe result on the branch where it is developed.

### Lifetime

| Option | Description | Selected |
|--------|-------------|----------|
| Lives until Phase 9, then deleted | Early net during Phases 4-8; removed when CI-01 lands | ✓ |
| Deleted as soon as it reports | Run, record verdict, remove in the next PR | |
| Kept indefinitely | Becomes de facto CI | |

**User's choice:** Lives until Phase 9, then deleted — explicit debt with a due date.

### Location

| Option | Description | Selected |
|--------|-------------|----------|
| Own workflow file | `.github/workflows/windows-llrt-probe.yml` | ✓ |
| A job inside ci.yml | All CI in one place | |

**User's choice:** Own workflow file. Phase 9 deletes one file without touching the quality
gate, and a red probe does not pollute the four `Verify (Node N)` legs.

### Action pins

| Option | Description | Selected |
|--------|-------------|----------|
| Match post-Phase-1 ci.yml | checkout@v5, setup-node@v5, upload-artifact@v5, pnpm/action-setup@v6 | ✓ |
| Keep @v4 as the plan says | Fewer deltas from the written plan | |

**User's choice:** Match post-Phase-1 ci.yml — keeps T-01-02's justification true and avoids the
deprecated Node 20 actions runtime.

---

## Probe failure policy

### P1-CMD

| Option | Description | Selected |
|--------|-------------|----------|
| Informational but must be CONCLUSIVE | Any of the three outcomes is fine; an indeterminate result breaks the job | ✓ |
| Purely informational | Record whatever happens, including "inconclusive" | |
| Promote to P0 | Anything other than EINVAL breaks | |

**User's choice:** Informational but conclusive.
**Notes:** P1-CMD is not pass/fail — its outcome selects the architecture (direct spawn vs
`.cmd` launcher) for Phases 4-8. An ambiguous result is worse than a clear negative because it
leaves Phase 4 with no basis.

### P2-OS and P3-UUID

| Option | Description | Selected |
|--------|-------------|----------|
| Informational, labelled non-LLRT | Output says explicitly it measured Node, not LLRT | ✓ |
| Informational, no special label | Same as other P1/P2/P3 assertions | |
| Drop them from the probe | If they can't measure LLRT, don't measure | |

**User's choice:** Informational and labelled.
**Notes:** Both are runtime properties, not OS properties, and the probe runs on Node. The label
prevents a future reader of the artifact from believing LLRT itself was tested.

### P0-ENV

| Option | Description | Selected |
|--------|-------------|----------|
| Break the job and block Phase 4 | Exit != 0 plus an explicit blocker in STATE.md | ✓ |
| Break the job, no formal blocker | Red, but no annotation | |
| Record only | Artifact captures it, job passes | |

**User's choice:** Break and block. It is the one result that invalidates the chosen
env-injection architecture.

### Sentinel hardening

| Option | Description | Selected |
|--------|-------------|----------|
| Dummy sentinel + gate that verifies it | Keep the automated no-secrets assertion | ✓ |
| Dummy sentinel only | Trust that no secret is added later | |

**User's choice:** Keep the gate, so the property stays true if the files are edited in
Phases 4-8.

---

## How results feed back

### Where the verdict lives

| Option | Description | Selected |
|--------|-------------|----------|
| Committed document in the phase | Seven assertions + run URL + proving log line | ✓ |
| CI artifact only | `probe-results.txt` with `if: always()` | |
| Document + update ROADMAP/STATE | The above plus architecture decision recorded upstream | |

**User's choice:** Committed document.
**Notes:** The artifact expires in 30 days and cannot be cited from a `PLAN.md`; Phases 4-8 need
a canonical, durable reference. This applies decision `[01-06]` from Phase 1 verbatim.

### Who writes it

| Option | Description | Selected |
|--------|-------------|----------|
| Claude writes it after reading the real run | Measured data only | ✓ |
| Plan generates a skeleton, user fills it | Empty rows filled from the artifact | |
| The probe emits the markdown itself | Automatic, but needs committing back from the runner | |

**User's choice:** Written after reading the real run — no template filled before results exist.

### What closes the phase

| Option | Description | Selected |
|--------|-------------|----------|
| A real, green run of all seven assertions | Recorded with URL | ✓ |
| Files exist and YAML is valid | Static verification | |
| Green run + reporter confirmation on a real machine | Closes the LLRT fidelity gap | |

**User's choice:** A real run.
**Notes:** "The files exist" is precisely the false-green pattern Phase 1 eliminated.

---

## Claude's Discretion

- **LLRT fidelity ceiling** — offered as a gray area and not selected, so the Node.js vehicle
  stands on the reasoning already in `03-RESEARCH.md`. D-08's labelling requirement is the
  mitigation actually adopted; no third-party confirmation gates Phase 4.
- Probe Node version, per-assertion timeouts, concurrency group, `shell: bash` vs native
  PowerShell — planner's choice, subject to D-04.
- Exact filename and internal structure of the findings document.

## Deferred Ideas

- Real-machine confirmation from the original Windows bug reporter (@0xMRK0S, 2026-06-24) —
  considered as a completion gate and declined; depends on a third party and could block Phase 4
  indefinitely. Worth doing before the Windows port ships (Phase 9 or 10).
- Making the probe a permanent regression net — that is CI-01 in Phase 9.
- Extending the probe to compare Windows against POSIX legs — out of scope for a de-risking spike.
