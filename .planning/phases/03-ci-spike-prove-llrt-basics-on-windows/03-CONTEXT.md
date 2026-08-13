# Phase 3: CI Spike — Prove LLRT Basics on Windows - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

De-risk the Windows port by proving, on a real `windows-latest` host, that the seven OS/runtime
primitives every later phase depends on behave as assumed — **before** any production port code
is written on top of them.

CI-only. Zero files under `packages/*/src` are created or modified. The deliverable is a probe
script, a CI job, and a recorded verdict — not product code.

**Note on the vehicle:** no standalone LLRT Windows binary exists (upstream dropped it at
v0.6.0-beta; `caido/dependency-llrt` has no published releases), so the probe runs on Node.js.
`03-RESEARCH.md` documents fidelity per assertion and this was accepted as-is — see
Claude's Discretion below.

</domain>

<decisions>
## Implementation Decisions

### Triggers and job lifetime

- **D-01: Bare `on: push` + `pull_request`, no branch filter.** The existing `03-01-PLAN.md`
  specifies `branches: [main]` and justifies it as "identical to ci.yml" — that justification is
  **stale**. Phase 1 removed the branch filter from `ci.yml` precisely because a workflow only
  runs from the branch it lives on, so filtering to `main` meant no feature branch was ever
  verified. Copying the old filter would reintroduce the exact blind spot Phase 1 just closed,
  and the probe would never run on the branch where it is being developed.

- **D-02: The workflow lives until Phase 9, then is deleted.** It serves as an early net while
  Phases 4-8 write the port code. When Phase 9 lands CI-01 (the permanent `windows-latest`
  regression job), this workflow is removed. This is explicit debt with a due date — not an
  indefinite fixture, and not a delete-immediately spike.

- **D-03: Its own workflow file** — `.github/workflows/windows-llrt-probe.yml`, separate from
  `ci.yml`. Two reasons: Phase 9 can delete one file without touching the quality gate, and a
  red probe does not pollute the status of the four `Verify (Node N)` legs that are the real
  merge signal.

- **D-04: Action pins must match `ci.yml` as it exists after Phase 1** —
  `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v5`,
  `pnpm/action-setup@v6`. The existing plan pins everything to `@v4` and uses that to justify
  threat mitigation T-01-02 ("no new third-party actions beyond what ci.yml already trusts") —
  a premise that is now false. The `@v4` pins would also drag in the deprecated Node 20 actions
  runtime.

### Probe failure policy

- **D-05: P0-ENV failing breaks the job AND is recorded as an explicit blocker in STATE.md.**
  This assertion proves `spawn(node, [script], { env })` passes the environment to the child.
  If it fails on Windows, Drift's whole env-injection architecture collapses. Phase 4 does not
  start until the fallback (a minimal `.cmd` launcher that `set`s the variables) is decided.
  It is the one result that must never pass unnoticed.

- **D-06: P0-TMP gates the exit code**, as the existing plan already specified.

- **D-07: P1-CMD does NOT gate the exit code, but MUST be conclusive.** Its three outcomes —
  EINVAL / runs / hangs — are all legitimate, and each selects a different architecture for
  Phases 4-8. So a "wrong" answer is not a failure. But if the probe cannot determine *which*
  of the three occurred (ambiguous timeout, unexpected error), that **does** break the job: an
  indeterminate P1-CMD leaves Phase 4 with no architectural basis, which is worse than a clear
  negative.

- **D-08: P2-OS and P3-UUID are informational and must be labelled non-LLRT in their output.**
  Both are properties of the *runtime*, not the OS, and the probe runs on Node. Their output
  lines must say so explicitly — e.g. `P2-OS PASS (node-vehicle; LLRT verified by source
  analysis)`. Without the label, someone reading the artifact months later will believe LLRT
  itself was tested.

- **D-09: P1-WHERE and P3-VARS are informational**, no gate.

- **D-10: Sentinel stays a dummy string** (`drift-probe-sentinel-<timestamp>`), never a real
  token — and the automated gate asserting that neither `CAIDO_TOKEN` nor `secrets.` appears in
  the workflow or the probe is **kept**, so the property stays true if these files are edited
  during Phases 4-8.

### How results feed back

- **D-11: The verdict is a committed document in the phase directory** (e.g. `03-FINDINGS.md`),
  not only the CI artifact. It records all seven assertions with their result, the run URL, and
  the log line proving the mechanism. Rationale: the artifact expires after 30 days and cannot
  be cited from a `PLAN.md`, whereas Phases 4-8 need to reference this verdict as the canonical
  basis for their architecture. This applies decision `[01-06]` from Phase 1 verbatim: *a CI
  claim is recorded with its run URL, per-leg conclusion, per-step conclusion and the log line
  proving the mechanism — never just a green tick.*

- **D-12: The verdict is written after reading the real run**, from measured output — never
  pre-filled from a template before results exist. Same discipline used for the three Phase 1
  CI proofs.

- **D-13: The phase is complete only when a real CI run has produced all seven assertion lines**,
  recorded with URL. "The files exist and the YAML is valid" is explicitly **not** sufficient —
  that is the false-green pattern Phase 1 existed to eliminate. Static validation (actionlint,
  file existence) is necessary but not sufficient.

### Claude's Discretion

- **LLRT fidelity ceiling — accepted as-is, not further mitigated.** The user declined to
  discuss this area, which means the Node.js vehicle stands on the reasoning already in
  `03-RESEARCH.md`: P0-ENV and P0-TMP are faithful because LLRT's `child_process` uses
  `tokio::process::Command` → the same Windows `CreateProcess` that Node uses via libuv, and
  LLRT's `env` option calls `env_clear()` + `envs()` with no Windows-specific branch. P2-OS is
  closed by source analysis of LLRT's resolver (`name.trim_start_matches("node:")`). No
  real-machine confirmation from the original Windows bug reporter is required as a gate for
  Phase 4. D-08's labelling requirement is the mitigation actually adopted.
- Probe Node version, per-assertion timeouts, concurrency group, and `shell: bash` vs native
  PowerShell were not discussed — planner's choice, subject to D-04.
- Exact filename and internal structure of the findings document (D-11) — planner's choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 inputs
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-RESEARCH.md` — the fidelity
  analysis per assertion, the vehicle decision (Node.js, not LLRT), and the LLRT Rust source
  verification. Note §"Standard Stack" pins Node 20 and `setup-node@v4`, both superseded by D-04.
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-01-PLAN.md` — the existing plan.
  **Written before Phase 1 landed; its CI assumptions are stale.** D-01 and D-04 supersede its
  trigger and action-pin sections, and three of its automated gates (`grep -q
  "actions/checkout@v4"` etc.) would now fail or pass for the wrong reason.
- `.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-VALIDATION.md` — Nyquist
  validation criteria for this phase.

### CI ground truth (post-Phase 1)
- `.github/workflows/ci.yml` — the authority on current triggers, action pins, and the
  `Verify (Node N)` job naming. Read this rather than trusting any plan's description of it.
- `.planning/phases/01-restore-the-verification-signal/01-06-SUMMARY.md` — the
  scratch-branch → push → `gh run view --json jobs` → delete pattern that D-11/D-12 reuse.

### Requirements
- `.planning/REQUIREMENTS.md` — CI-02 (this phase). CI-01 is Phase 9 and is what D-02's
  deletion is waiting for.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/ci.yml`: the four-leg matrix job is the structural template for the probe
  job (checkout → pnpm → setup-node → run), and the authority for action pins under D-04.
- The Phase 1 CI-proof workflow (scratch branch → push → query `gh run view --json jobs` →
  delete branch) is directly reusable for producing D-11's findings document.

### Established Patterns
- **Claims are recorded with evidence, not ticks** (`[01-06]` in STATE.md). D-11/D-12/D-13 are
  this pattern applied to Phase 3.
- **Version-discrimination proofs must assert the negative legs stay green** (`[01-06]`) —
  relevant if the probe is ever extended to compare Windows against POSIX.
- **Targeted `git add <path>`, never `git add -A`** (`[01-06]`) — the repo is public and
  `IMPROVEMENT-PLAN.md` sits untracked at the root (now also `.gitignore`d).
- No Zod / no dynamic `require` / no `import.meta` in backend code — not binding here, since the
  probe is a standalone script run by Node in CI, not code loaded by Caido's QuickJS runtime.

### Integration Points
- New files only: `scripts/windows-llrt-probe.mjs` and
  `.github/workflows/windows-llrt-probe.yml`. Nothing under `packages/*/src` is touched.
- The probe's P0-ENV result determines the architecture for Phases 4-8's spawn path — the same
  code region CMP-01/CMP-02 protect on macOS/Linux.

</code_context>

<specifics>
## Specific Ideas

- The probe's output must be machine-parseable PASS/FAIL lines keyed by assertion ID
  (`P0-ENV`, `P0-TMP`, `P1-CMD`, `P1-WHERE`, `P2-OS`, `P3-VARS`, `P3-UUID`), as the existing
  plan already specifies — with D-08's non-LLRT label appended on P2-OS and P3-UUID.
- `if: always()` on the artifact upload is essential: the results matter most precisely when the
  probe exits non-zero.

</specifics>

<deferred>
## Deferred Ideas

- **Real-machine confirmation from the original Windows bug reporter** (@0xMRK0S, reported
  2026-06-24: MCP server fails to start / health check fails on Windows). Considered as a
  completion gate for this phase and declined — it depends on a third party and could block
  Phase 4 indefinitely. Still valuable as a check before the Windows port ships; belongs in
  Phase 9 or 10.
- **Making the probe a permanent regression net.** That is CI-01 in Phase 9; D-02 deliberately
  keeps this workflow temporary to avoid two jobs with overlapping purpose.
- **Extending the probe to compare Windows against POSIX legs** — out of scope for a
  de-risking spike.

</deferred>

---

*Phase: 03-ci-spike-prove-llrt-basics-on-windows*
*Context gathered: 2026-08-13*
