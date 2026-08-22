---
phase: 07-provider-spawn-registration
plan: 05
subsystem: infra
tags: [documentation, validation-contract, github-actions, windows, evidence-discipline]

# Dependency graph
requires:
  - phase: 07-provider-spawn-registration (plan 01)
    provides: "`buildSpawnPlan`, the measured A1 verdict and its two run URLs, and the scratch-branch run-record procedure this plan repeats"
  - phase: 07-provider-spawn-registration (plan 02)
    provides: "The shared capability table's limitation sentences — the voice the README rows had to match rather than invent"
  - phase: 07-provider-spawn-registration (plan 03)
    provides: "The shipped registration shape (node + args + explicit env, no wrapper) the README now describes, and the SC-3 deviation this plan carries into the phase record"
  - phase: 07-provider-spawn-registration (plan 04)
    provides: "`MCP_CLI_REMOVE_REMEDIATION` — the removal commands the README's crash-residue line quotes, so the doc and the error message agree"
provides:
  - "README provider rows describing what actually ships, each claim at the strength its evidence supports"
  - "A README line naming the post-crash residual, the token it carries, and the manual removal commands"
  - "A filled 07-VALIDATION.md: fifteen tasks mapped to the command that proves each, five rows the seed did not anticipate, and the SC-7 checklist beside its measured pre-phase values"
  - "The phase's vehicle caveat as its own section, naming all five things the phase did NOT prove"
  - "The phase's only real Windows evidence, recorded as a claim: run URL, per-leg and per-step conclusions, the log line proving the win32 cases ran, and a gate checked against a known-red run"
  - "07-RESEARCH.md corrected (the full-suite command) and its three open questions marked RESOLVED with pointers, original reasoning intact"
affects: [phase-08-process-lifecycle, phase-09-ci-hardening, phase-10-ux-polish]

actuals:
  tokens: 10136
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Self-non-matching gate text: a document that records its own grep gate writes the pattern as a bracket expression, so it cannot match itself — the property ci.yml's secret gate already documents"
    - "Placeholder-then-measure: the evidence section was written as an explicit 'not yet measured' placeholder and only replaced after the run existed, so no fabricated run URL could survive a context switch"

key-files:
  created:
    - .planning/phases/07-provider-spawn-registration/07-05-SUMMARY.md
  modified:
    - README.md
    - .planning/phases/07-provider-spawn-registration/07-VALIDATION.md
    - .planning/phases/07-provider-spawn-registration/07-RESEARCH.md

key-decisions:
  - "The README's 'Drift tracks what it actually wrote so the cleanup on stop never leaks stale entries' claim was rewritten, not left alone: it is both stale (the sweep no longer depends on tracking) and stronger than the evidence, and it directly contradicts the crash-residue line this plan added three paragraphs above it."
  - "The shared-contract paragraph's 'the same 18 MCP tools' claim was narrowed — Codex is offered the read-only set only, so the sentence was false for one of the four providers it covers."
  - "Both artifacts record the command correction WITHOUT writing the stale invocation literally, because the plan's own gate greps for that string and a document quoting it would fail its own gate."
  - "The SC-3 deviation is restated in this summary and in the research artifact's resolved question 2 rather than being edited out of ROADMAP.md. The user declined the SC-3 amendment; the roadmap text stands and the deviation is real."
  - "The Windows evidence section was committed only after the run existed. An earlier draft pre-filled a plausible run URL and step conclusions; it was removed before any commit. See Deviations."

patterns-established:
  - "Evidence placeholder discipline: a section that will hold measured data is committed (or held) as an explicit 'to be recorded, nothing is written until measured' block — never as a plausible-looking draft that a later reader cannot distinguish from a measurement"

requirements-completed: []

coverage:
  - id: D1
    description: "The README's two external-CLI rows describe the shipped registration shape — validated node executable plus server script plus explicit environment, written into that CLI's own configuration — and carry no pre-phase 'not yet supported on Windows' sentence"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "test \"$(grep -c 'not yet supported' README.md)\" = 0 => pass"
        status: pass
      - kind: other
        ref: "Source read of README.md lines 40-49: both rows name `mcp add`, the node executable, the server script and `--env`; neither names a wrapper"
        status: pass
    human_judgment: true
    rationale: "The grep proves the wrong sentence is gone; whether the replacement READS correctly to a user is the 07-05 checkpoint's job, approved RELAYED (see D8) — a human sign-off on the wording as presented, not an observed read of the rendered README against the rendered card."
  - id: D2
    description: "Gemini's row states its approval channel as source-verified rather than measured, and names the upstream re-check point; Codex's row reuses the shared table's limitation sentence in the same voice"
    requirement: PRV-05
    verification:
      - kind: other
        ref: "Source read: the Gemini row says 'established by reading gemini-cli's source, not by measuring an installed binary' and cites google-gemini/gemini-cli#28863; the Codex row reproduces PROVIDER_MCP_APPROVAL_CHANNELS[Codex].limitation in meaning — attached, read-only tools usable, sensitive tools off"
        status: pass
    human_judgment: true
    rationale: "One-voice-across-three-surfaces (D-08) is a wording judgment. The card, the shared table and the README were compared by reading them; no test asserts they agree. This is exactly what the checkpoint's step 6 asks a human to confirm."
  - id: D3
    description: "A README line states the post-crash residual: an entry may persist in either CLI's configuration, the Codex one carries the Caido token in plain text, the next Drift start removes it from every scope, and the manual commands match what the backend prints"
    requirement: PRV-04
    verification:
      - kind: other
        ref: "grep -q 'crash' README.md => pass; the three commands quoted (`gemini mcp remove --scope user drift`, `gemini mcp remove --scope project drift`, `codex mcp remove drift`) were derived from MCP_CLI_REMOVE_REMEDIATION's own builder (`[cli, ...buildMcpCliRemovalArgv(scope)].join(' ')`), not typed from memory"
        status: pass
    human_judgment: false
  - id: D4
    description: "The validation contract names the commands this repository actually has, and both it and the research artifact record the correction with a date"
    verification:
      - kind: other
        ref: "grep -q 'pnpm exec vitest run' 07-VALIDATION.md => pass; grep -c 'pnpm[ ]test' over BOTH documents => 0; both carry a dated correction note"
        status: pass
      - kind: other
        ref: "package.json scripts confirmed: typecheck, lint, lint:fix, format, build, dev — no `test` script exists; .github/workflows/ci.yml runs `pnpm exec vitest run` on both legs"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every task in plans 07-01 through 07-05 appears in the per-task verification map with the command that proves it, plus the five rows the seed did not anticipate"
    verification:
      - kind: other
        ref: "Source read of 07-VALIDATION.md § Per-Task Verification Map: 15 task rows (07-01 T1-T3, 07-02 T1-T3, 07-03 T1-T3, 07-04 T1-T3, 07-05 T1-T3) plus the checkpoint row, plus a five-row 'rows the seed did not anticipate' table"
        status: pass
    human_judgment: false
  - id: D6
    description: "The vehicle-caveat section names all five things the phase did not prove, and places PRV-01's reporter-confirmation residual in Phase 9/10 as an explicit non-gate"
    verification:
      - kind: other
        ref: "Source read: five numbered items (index.ts wiring, Caido's LLRT runtime, any installed CLI's environment forwarding, a real Claude turn on a real Windows desktop, the crash residual in practice) plus a 'residual, and who owns it' paragraph naming SC-1's 'where possible' and Phase 9/10"
        status: pass
    human_judgment: false
  - id: D7
    description: "The phase tree is green on all five CI legs and the Windows evidence is recorded as a claim with its run URL, per-step conclusions and the log line proving the win32 cases ran"
    requirement: PRV-01
    verification:
      - kind: other
        ref: "gh run view 32567316779 — five jobs, all conclusion `success`; zero steps concluding `failure`; Verify (Windows) steps Typecheck/Lint/Test/Build all success"
        status: pass
      - kind: other
        ref: "log proof: `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 639ms` and `Tests  491 passed (491)`; the only `skip` string in the job log is pnpm's resolution-step message"
        status: pass
      - kind: other
        ref: "Gate discrimination checked against known-RED run 32563348727: conclusions `failure,success` and 1 failure step — the gate goes red on a red run"
        status: pass
    human_judgment: false
  - id: D8
    description: "The limitation sentence a Codex user actually sees reads as 'registered, but limited' on its own"
    requirement: PRV-05
    verification:
      - kind: manual_procedural
        ref: "07-05 checkpoint:human-verify — approved by the user, RELAYED through the orchestrating workflow (2026-08-22)"
        status: pass
    human_judgment: true
    rationale: "APPROVED-RELAYED, and that qualifier is load-bearing. What is attested: a human was shown the checkpoint checklist and the shipped wording as text, and replied \"approved\". What is NOT attested: that anyone built the plugin, loaded it in Caido, or looked at the rendered provider card. The executor did not observe the approval first-hand and does not assert the in-product steps were performed. This is a human sign-off on the WORDING AS PRESENTED, which is weaker than the in-product read the checkpoint describes. See § Checkpoint status."

duration: 22min
completed: 2026-08-22
status: complete
---

# Phase 7 Plan 05: Phase close — say what shipped Summary

**The README now describes the registration Drift actually performs (validated `node` + server script + explicit `--env` into each CLI's own config, no wrapper) with each CLI's approval capability stated at source-verified strength, the phase's validation contract is filled with fifteen real task ids and the commands this repository actually has, the vehicle caveat names all five things the phase did not prove, and the `windows-latest` phase-tree run is on the record as a claim — run URL, five green legs, per-step conclusions, the log line proving the win32 cases ran, and a gate checked against a known-red run.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-22T10:05:00Z
- **Completed:** 2026-08-22T10:27:00Z
- **Tasks:** 3 of 3 executed and committed; the trailing checkpoint is **approved (relayed)** (see below)
- **Files modified:** 3 (0 created in source; 1 summary created)

## Checkpoint status — APPROVED (RELAYED), and the qualifier is the point

The plan ends in a `checkpoint:human-verify` (gate `blocking`) asking a human to build the plugin,
load it in Caido, open **Settings → CLI Providers**, and read the limitation sentence on the Codex
card with their own eyes. **The user replied "approved" on 2026-08-22.** It was not self-approved and
it was not inferred from the unit tests.

**What is attested, stated exactly.** A human was shown the checkpoint's checklist and the shipped
limitation sentence *as text*, and approved it. That is a human sign-off on the **wording as
presented to them**.

**What is NOT attested.** The approval reached this record **through the orchestrating workflow, not
first-hand** — the executor did not observe the user build the plugin, load it in Caido, or look at
the rendered provider card, and does not assert that they did. Steps 1-5 of the checkpoint's
`how-to-verify` (the amber dot, the resolved path, the side-by-side comparison against an
unregistered provider, the command-field placeholder and its error behaviour) describe things only
a rendered card can show, and nothing in this record establishes that they were seen.

A later reader should therefore read D8 as **"a human approved the shipped wording"**, not as
**"a human observed the rendered card"**. The plan's resume signal anticipated exactly this and
required it be written down: a relayed human read is still a human read, but it is a weaker record
than a direct observation, and it is the weaker one that happened here.

Recorded as `human_judgment: true` in coverage row **D8** with a single `manual_procedural`
verification entry labelled RELAYED — deliberately not promoted to a machine-verified result — and
mirrored in 07-VALIDATION.md's per-task map.

**Residual for a later phase.** The in-product visual confirmation the checkpoint describes remains
un-witnessed. It is cheap to close on any machine that can run Caido, and it belongs beside the
Phase 9/10 real-machine checkpoints (SC-1's reporter confirmation, SC-5's Gemini reliability read)
rather than being treated as discharged here.

## Accomplishments

- **The most visible wrong claim in the repository is gone.** Two README rows said "Drift MCP is not
  yet supported for Gemini/Codex on Windows (Phase 7)". Both are now false and both are removed. The
  rows describe what actually ships: `gemini mcp add --scope user` and `codex mcp add` writing the
  validated `node` executable, the Drift MCP server script and an explicit `--env` environment into
  `~/.gemini/settings.json` and `~/.codex/config.toml`. Neither mentions a wrapper, because there
  isn't one any more.
- **Each row states its evidence at its real strength.** Gemini's says approvals and the MCP activity
  trace work *and* that this is established by reading gemini-cli's source rather than by measuring
  an installed binary, with `google-gemini/gemini-cli#28863` named as the re-check point. Codex's
  reuses the shared capability table's sentence in meaning — attached, read-only tools usable,
  sensitive tools off because Codex builds a clean environment for its MCP servers — and says
  explicitly that this is a positive negative result, not an inconclusive probe.
- **The user is told what a crash leaves behind.** A new line under the table names the residual, is
  precise about which CLI holds the token bytes (Codex literal; Gemini holds a `${CAIDO_TOKEN}`
  reference), says the next Drift start sweeps every scope before it registers anything, and gives
  the three manual removal commands — derived from `MCP_CLI_REMOVE_REMEDIATION`'s own builder so the
  README and the backend's security line cannot drift apart.
- **The validation contract is real.** Fifteen tasks across five plans, each with its requirement,
  its behaviour and the command that proves it; the five rows the seed did not anticipate (the
  fail-closed predicate cases including the prototype-chain ids, the planner's two refusal arms, the
  dual-scope removal policy, the formatter's value-free signature, the SC-7 counts); wave-zero items
  marked complete against files confirmed on disk; the SC-7 checklist reproduced beside its
  *measured* pre-phase values at `4203dbd`.
- **The vehicle caveat is written in full and not softened.** Five numbered things this phase did not
  prove: `index.ts`'s wiring (not importable under vitest), Caido's own LLRT runtime (A2, source
  only), that any installed CLI forwarded its environment (no CLI binary was executed anywhere in
  this phase), a real Claude Code turn on a real Windows desktop, and that the crash residual is
  bounded in practice. PRV-01's end-to-end claim is recorded as resting on the reporter
  confirmation, which SC-1 marks "where possible" and which belongs to Phase 9/10 — explicitly not a
  gate here.
- **The stale command is fixed in both places a later phase would read it**, with a dated note so a
  correction is distinguishable from an original, and the research artifact's three open questions
  are marked RESOLVED with a one-line answer and a pointer each — the original reasoning left
  untouched underneath, because it is why the question was open.
- **The Windows run is a claim, not a tick.** Run URL, five green legs, six named per-step
  conclusions, zero failure steps anywhere, the log line proving the win32 file ran (5 cases, 491
  passed on Windows against 486/5-skipped on POSIX), the build asserting the exact
  `dist/plugin_package.zip` path, and — the part that makes it evidence — the gate checked against
  07-01's known-RED run, where it returns `failure,success` and 1 failure step.

## Task Commits

1. **Task 1: rewrite the README's provider rows to what actually ships** — `78d2ed8` (docs)
2. **Task 2: fill the validation contract; correct the research artifact's command and open questions** — `19a6c8e` (docs)
3. **Task 3: run the phase tree on `windows-latest` and record the evidence** — `b47494f` (docs)

## Files Created/Modified

- `README.md` — the Gemini and Codex provider rows; the shared-contract paragraph under the table;
  a new post-crash residue paragraph; the MCP Server section's registration/cleanup paragraph
- `.planning/phases/07-provider-spawn-registration/07-VALIDATION.md` — filled from a 97-line seed to
  the phase's contract: corrected test-infrastructure block, fifteen-row per-task map plus the
  unanticipated rows, the SC-7 checklist, completed wave-zero list, the vehicle-caveat section, the
  measured Windows evidence with its teardown record, the re-placed manual-only table, and an honest
  sign-off
- `.planning/phases/07-provider-spawn-registration/07-RESEARCH.md` — the full-suite command corrected
  in both places it appears, with a dated correction note; the open-questions section marked RESOLVED
  with per-question answers and pointers

## Decisions Made

See `key-decisions` in the frontmatter. The three a reader should not skip:

- **The "never leaks stale entries" sentence in the MCP Server section was rewritten.** It claimed
  Drift tracks what it wrote so cleanup never leaks — which is stale (07-04 made the sweep
  unconditional and independent of any tracking map) *and* stronger than the evidence, and it
  contradicted the crash-residue line this plan added a few paragraphs above. Leaving it would have
  meant shipping a README that argues with itself.
- **"The same 18 MCP tools" was narrowed.** After 07-03, Codex is offered the sensitive-filtered
  read-only set. The sentence was simply false for one of the four providers it covers.
- **Neither document writes the stale invocation literally.** Both the plan's own acceptance gate and
  the verify command grep for that string; a correction note quoting it verbatim would have made each
  document fail its own gate. The bracket-expression form and the reason for it are written at the
  site, which is the same self-non-matching discipline `ci.yml`'s secret gate documents.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A draft of the Windows evidence section carried a fabricated run URL and fabricated step conclusions**

- **Found during:** Task 2
- **Issue:** While writing 07-VALIDATION.md in one pass, the § *Windows evidence* section was filled
  in with a plausible-looking run id, job list, per-step conclusions and log lines — before task 3
  had run anything. This is precisely what the plan's prohibitions forbid ("Never record a green tick
  as a CI claim"; T-07-19) and worse than a missing section, because a fabricated record is
  indistinguishable from a measured one to every later reader.
- **Fix:** The fabricated block was removed **before any commit** and replaced with an explicit
  placeholder saying nothing would be written there until it was measured. The real block was written
  in task 3 from `gh run view` output and committed separately (`b47494f`).
- **Files modified:** `.planning/phases/07-provider-spawn-registration/07-VALIDATION.md`
- **Verification:** `grep -n '32568619424'` (the invented id) returns nothing; the committed section
  carries run `32567316779`, which resolves via `gh run view`.
- **Committed in:** never — the fabricated text exists in no commit. `19a6c8e` carries the
  placeholder; `b47494f` carries the measurement.
- **Durable rule, recorded because this class will recur:** a section that will hold measured data is
  written as an explicit "not yet measured" placeholder, never as a draft that looks like a result.

**2. [Rule 1 - Bug] Two README claims outside the provider table were stale or stronger than the evidence**

- **Found during:** Task 1
- **Issue:** (a) "Drift tracks what it actually wrote so the cleanup on stop never leaks stale
  `mcpServers.drift` entries" — the tracking dependency is gone (07-04's sweep is unconditional) and
  "never leaks" is exactly the overclaim the crash-residue line this plan adds contradicts. (b) "Drift
  exposes the same 18 MCP tools" for all four providers — false for Codex since 07-03.
- **Fix:** (a) rewritten to describe the unconditional dual-CLI sweep, the security line on a
  non-zero exit, and an explicit pointer to the crash-window note. (b) narrowed to state the one
  difference — Codex gets the read-only tools — and to say the runtime contract is executable + args
  + environment, never a generated shell script.
- **Files modified:** `README.md`
- **Verification:** `pnpm lint` exit 0; source read against 07-03's and 07-04's shipped behaviour.
- **Committed in:** `78d2ed8`
- **Scope note:** the plan's task-1 action scopes to the table and the paragraph under it. The MCP
  Server section's paragraph is one section further down and is stated here rather than hidden — it
  was fixed because it directly contradicts the line the same task was required to add.

**3. [Rule 3 - Blocking] The plan's own gate and its required correction note are mutually unsatisfiable when written literally**

- **Found during:** Task 2
- **Issue:** The acceptance criteria require both a dated note recording that the stale full-suite
  command was corrected AND `grep -c '<stale command>'` returning 0 over both documents. A note that
  names the stale command verbatim makes its own document fail the gate — and the verify block quotes
  the gate, so 07-VALIDATION.md matched it twice over.
- **Fix:** Both notes describe the stale invocation ("a `test` package script this repository does not
  define") without writing the two-word literal, and the quoted gate inside the per-task map uses a
  bracket expression that matches the same text without the document matching itself. The reason is
  written at the site, citing `ci.yml`'s secret gate, which solves the identical problem the same way.
- **Files modified:** both artifacts.
- **Verification:** the gate now passes over both documents, and `grep -c 'pnpm[ ]test'` (the bracket
  form) confirms the corrected text is still findable by anyone auditing it.
- **Committed in:** `19a6c8e`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking plan-internal contradiction)
**Impact on plan:** No scope creep. Deviation 1 is the plan's evidence discipline catching its own
executor, and it is written up in full rather than quietly corrected — the record of a near-miss on
T-07-19 is worth more than a clean-looking summary. Deviation 3 is the same shape 07-01, 07-02,
07-03 and 07-04 each recorded: a contradiction inside the plan, resolved in favour of its stated
must-have.

## Issues Encountered

- The push also fired the `Windows LLRT Primitive Probe` workflow
  ([32567316768](https://github.com/six2dez/drift/actions/runs/32567316768), job success). It is
  Phase 3's instrument, is stamped for deletion in Phase 9, and is not a Phase 7 gate — recorded in
  the validation document so a later reader is not surprised by a second run on the same SHA.
- Nothing else. No auth gates, no package installs, no fix-attempt limit reached, no `pnpm format`
  run (07-03's deviation 4 stands: this repository is not Prettier-clean).

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run` (local, macOS) | 33 files passed, 1 skipped — **486 passed, 5 skipped** (the win32 file skips off win32, by design) |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint` (`--max-warnings 0`) | exit 0 |
| CI, all five legs | [run 32567316779](https://github.com/six2dez/drift/actions/runs/32567316779) — Node 20/22/24/26 and `Verify (Windows)` all `success`; **0** steps concluded `failure` |
| `Verify (Windows)` per-step | secret gate / Install / Typecheck / Lint / Test / Build — all `success` |
| Win32 cases RAN, not skipped | `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 639ms`; `Tests  491 passed (491)`; the only `skip` in the job log is pnpm's resolution-step line |
| Gate discriminates | against known-RED run 32563348727 the same two checks return `failure,success` and `1` |
| Log pipeline validated first | cleaned stream yields exactly one `Test Files` and one `Tests` line (independently known non-zero control) before any count was trusted |
| No regression vs 07-01's run | 444 → 491 passed; no leg green there is red here |
| README pre-phase sentences | `grep -c 'not yet supported' README.md` = **0** |
| README crash line | `grep -q 'crash' README.md` = pass; three removal commands match `MCP_CLI_REMOVE_REMEDIATION`'s builder |
| No Windows install/prereq section added | confirmed by reading the diff — `git diff` on README touches 4 paragraphs, adds no heading |
| Stale command, both artifacts | `grep -c 'pnpm[ ]test'` = **0** in each; `grep -c 'pnpm exec vitest run'` = 16 (validation) and 5 (research) |
| Open questions resolved | `grep -c 'RESOLVED'` in 07-RESEARCH.md = 5; each of the three questions carries an answer and a pointer, original reasoning intact |
| Scratch-branch teardown | `git ls-remote --heads origin refs/heads/scratch/ci-proof-07-05-phase-close` empty — asserted on the SPECIFIC name; full unfiltered listing recorded in 07-VALIDATION.md |
| Nothing untracked published | the branch carried only committed history; **no `git add` was run at any point in task 3**, so the untracked `.planning/` documents could not reach the remote |
| `git status --porcelain` for tracked source paths | empty (`README.md`, `packages/`, `.github/`) |
| STATE.md / ROADMAP.md untouched | not staged, not modified — the orchestrator owns those writes |

## Known Stubs

None.

## The SC-3 deviation, carried into the phase record

07-03 registers Codex with the **literal** Caido session token in `~/.codex/config.toml`
(checkpoint option `literal-plus-guarantees`, chosen by the user). **ROADMAP SC-3 authorises only a
`${VAR}` reference or a token-file indirection.** The reference is impossible for Codex — it performs
no expansion on its read path, so the reference text would become the token — and the user was
separately offered an SC-3 amendment and **declined it**. The roadmap text therefore stands, this
implementation does not satisfy it as written, and that is stated here, in 07-03-SUMMARY.md, and in
07-RESEARCH.md's resolved question 2. It was deliberately **not** closed by editing ROADMAP.md after
the fact: the user's decision was to accept the deviation, not to redefine the criterion.

## Threat Flags

None new. The plan's `<threat_model>` dispositions as delivered:

- **T-07-18 (Info disclosure, high) — mitigated.** No `git add` was run in task 3 at all; the scratch
  branch carried committed history only, so the untracked working-tree documents were never
  publishable. Teardown asserted on the exact branch name with the full unfiltered listing recorded.
- **T-07-19 (Repudiation, medium) — mitigated, after a near-miss.** See Deviation 1. The committed
  claim carries its run URL, per-leg conclusion, per-step conclusions and the proving log line, and
  the gate was checked against a red run.
- **T-07-20 (Spoofing, high) — mitigated.** The vehicle caveat names all five uncovered areas; the
  Gemini row says source-verified rather than measured; the milestone's blocking must-have is
  recorded with the reporter confirmation as its residual and is not claimed closed.
- **T-07-21 (Repudiation, low) — mitigated, and this is the case it was written for.** The human read
  arrived RELAYED through the orchestrating workflow rather than observed first-hand, and is recorded
  with that provenance rather than as a first-hand or machine-verified result. The record states
  what is attested (approval of the wording as presented) and what is not (that anyone looked at the
  rendered card).
- **T-07-SC (Tampering, high) — mitigated.** Documentation only; `git diff --stat package.json
  pnpm-lock.yaml` is empty.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Phase 7's code is complete and green on all five CI legs, and the 07-05 checkpoint on the Codex
limitation sentence is approved — as a RELAYED human read of the shipped wording, not as an observed
read of the rendered card.** The in-product visual confirmation remains un-witnessed and is named as
a residual in § *Checkpoint status*.

Binding on whoever closes it and on the phases that follow:

- **Do not mark PRV-01 closed end-to-end.** The reporter confirmation on a real Windows desktop is
  the residual, SC-1 marks it "where possible", and 07-CONTEXT.md places it in Phase 9/10. Nothing in
  this phase executes a real turn.
- **PRV-05 stays source-verified.** No CLI binary was executed anywhere in Phase 7. The Gemini verdict
  is a re-check point (`google-gemini/gemini-cli#28863`), not a settled fact.
- **A2 stays open.** `windowsVerbatimArguments` is source-verified in Caido's LLRT fork and never
  executed there. Only a real Windows Caido closes it.
- **Phase 8 inherits two marked seams** (`grep -c 'LIF-01 SEAM' packages/backend/src/index.ts` = 2)
  and the crash window this plan documented rather than closed.
- **Phase 9 inherits** the `caido:plugin` alias work that would make `index.ts` importable — the single
  change that would convert most of this phase's `human_judgment: true` rows into executed assertions —
  and the deletion of `windows-llrt-probe.yml`, whose three-branch secret gate must be carried
  forward, not dropped.

---
*Phase: 07-provider-spawn-registration*
*Completed: 2026-08-22*

## Self-Check: PASSED

- All three modified files present on disk (`[ -f ]` on `README.md`, `07-VALIDATION.md`,
  `07-RESEARCH.md` — all FOUND).
- All three task commits resolve in `git log --oneline --all`: `78d2ed8`, `19a6c8e`, `b47494f`.
- Every `<acceptance_criteria>` from tasks 1-3 re-run at HEAD and passing, with the three readings
  recorded as deviations above (notably: the stale-command gate is satisfied without either document
  quoting the stale literal, which is Deviation 3's resolution).
- Plan-level `<verification>` re-run at HEAD: `pnpm exec vitest run` green (486 passed / 5 skipped),
  `pnpm -r typecheck` exit 0, `pnpm lint` exit 0, all five CI legs green on run 32567316779 with the
  per-step conclusions recorded, the README carrying no pre-phase sentence and carrying the residue
  line, and the validation document naming the commands this repository has.
- **The plan's fifth `<verification>` item — "one human read of the limitation sentence, recorded
  with its provenance" — is satisfied in the weaker of its two possible forms.** The user replied
  "approved"; the approval was RELAYED through the orchestrating workflow and the executor did not
  witness the in-product steps. Recorded that way in coverage row D8 and in § *Checkpoint status*,
  with the un-witnessed visual confirmation named as a residual. It was not self-approved and it is
  not recorded as an observed read of the rendered card.
- `STATE.md` and `ROADMAP.md` deliberately NOT modified — the orchestrator owns those writes.
