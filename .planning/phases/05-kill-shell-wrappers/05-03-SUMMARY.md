---
phase: 05-kill-shell-wrappers
plan: 03
subsystem: diagnostics
tags: [runtime-probe, process-env, path, diagnostics, llrt, windows]

requires:
  - phase: 04-platform-foundation
    provides: "runtime-probe.ts's D-06 gate table (PROBE_CAPABILITIES), CAPABILITY_PURPOSE, buildProbeMetrics, formatProbeReportFields, and the 04-03 not-probed-versus-absent honesty rule"
provides:
  - "A fifth PROBE_CAPABILITIES row, `parentEnv` (label `Parent process environment`, `gating: false`)"
  - "Two integer metrics on `ProbeReport.metrics`: `parentEnvKeyCount` and `parentEnvPathEntryCount`"
  - "An OPTIONAL `parentEnv?: Record<string, string | undefined>` input on `buildProbeReport`"
  - "Three new flattened diagnostics fields: `runtimeParentEnv`, `parentEnvKeyCount`, `parentEnvPathEntryCount`"
  - "`CAPABILITY_PURPOSE` is now exported so row-versus-purpose drift is assertable at runtime"
affects: [05-04 (supplies process.env from index.ts's single probe site), 05-06 (reads the resulting diagnostics fields), 07-provider-launch (PRV-01 is where a thin PATH actually bites)]

actuals:
  tokens: 12994
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Three-state measurement reporting: `counted` / `absent` / `notProbed` as a discriminated union, so a report cannot claim a measurement it did not take"
    - "Environment measured by COUNT, never enumerated — integers and status words only on a surface pasted into public bug reports"

key-files:
  created: []
  modified:
    - packages/backend/src/runtime-probe.ts
    - packages/backend/src/runtime-probe.test.ts

key-decisions:
  - "The parentEnv row REPORTS and never GATES. It is a diagnostic, not a control."
  - "`unavailable` marks a measurement never taken; `absent` marks a measurement taken whose subject was not there. Two words, two meanings, one test asserting they differ."
  - "The PATH separator is chosen from the platform, never sniffed from the content; with no platform the count renders not-probed rather than a confidently wrong integer."
  - "The PATH key is resolved case-insensitively so a Windows block spelling it `Path` is measured, not reported absent."
  - "`CAPABILITY_PURPOSE` was exported (beyond the plan's artifact list) so the suite can assert one purpose clause per capability row at runtime, not just via the compiler's Record exhaustiveness."

patterns-established:
  - "Pattern: a reported (non-gating) probe row carries a gating-invariance test asserting `report.ok` survives its worst case — the mechanical form of REPORTS-never-GATES"
  - "Pattern: no-leak assertions guard with a non-empty premise before their `not.toContain` conditions, so they cannot pass vacuously against an empty string"

requirements-completed: []

coverage:
  - id: D1
    description: "A fifth `parentEnv` capability row exists, is classified non-gating, and has a matching CAPABILITY_PURPOSE clause"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#registers a fifth non-gating capability with a matching purpose clause"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#marks os.platform and os.tmpdir as gating and realpath, windowsEnv and parentEnv as reported only"
        status: pass
    human_judgment: false
  - id: D2
    description: "`parentEnvKeyCount` and `parentEnvPathEntryCount` report integers, with a platform-chosen separator and a case-insensitive PATH lookup"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#counts keys and colon-separated PATH entries on a POSIX platform"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#resolves the PATH key case-insensitively and splits on the semicolon on win32"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#chooses the separator from the platform, not by guessing from the content"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#drops empty and whitespace-only PATH segments"
        status: pass
    human_judgment: false
  - id: D3
    description: "The three states — not probed, absent, counted — are distinguishable by assertion rather than by convention (T-05-11)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#renders not probed and absent as different strings, not the same string twice"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#distinguishes an absent PATH variable from an environment it never probed"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#reports the key count but not the PATH entry count when the platform is unknown"
        status: pass
    human_judgment: false
  - id: D4
    description: "The row emits integers and status words only — no key name, no value, no path — through to the flattened diagnostics fields (T-05-10)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#never emits an environment key name or value"
        status: pass
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#leaks neither a key name nor a value through the flattened diagnostics fields"
        status: pass
    human_judgment: false
  - id: D5
    description: "The new row cannot block MCP start: `report.ok` is unaffected by its worst outcome (T-05-12)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#REPORTS and never GATES: the worst parentEnv outcome leaves report.ok true"
        status: pass
    human_judgment: false
  - id: D6
    description: "macOS/Linux behaviour preserved — the existing suite stays green and index.ts is untouched (CMP-01)"
    requirement: "CMP-01"
    verification:
      - kind: unit
        ref: "pnpm exec vitest run (290 passed / 31 files, from a 278 baseline)"
        status: pass
      - kind: other
        ref: "git diff --stat packages/backend/src/index.ts (empty)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The measured claim holds on a REAL Caido host — i.e. that the Caido process's own environment carries a usable PATH on Windows"
    verification: []
    human_judgment: true
    rationale: "Standing [ASSUMED] A1. The LLRT half is source-verified (process.env is std::env::vars(), unfiltered); the Caido-host half is not, and only a real Windows Caido install reports it. Nothing in this repo can close it."

duration: 9 min
completed: 2026-08-20
status: complete
---

# Phase 05 Plan 03: parentEnv Reported Probe Row Summary

**D-05's unverified "is `process.env` complete under LLRT?" risk is now a pasteable, non-gating measurement: a fifth `parentEnv` capability row plus two integer metrics that count environment keys and PATH entries without ever naming a key or printing a value.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-20T12:57:00Z
- **Completed:** 2026-08-20T13:06:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## REPORTS, never GATES — and what actually closes the hole

**This metric reports. It does not gate.** Nothing in this plan can block MCP start, and that is deliberate, not an oversight. Per Phase 4's D-06, a primitive with a working fallback REPORTS; one without a fallback GATES. **The fallback here is real:** the MCP server is spawned by an ABSOLUTE `node` path, and `mcp-server.mjs` spawns nothing itself — so a thin or entirely absent `PATH` cannot break the Phase 5 health-check path. It can only bite the provider CLI, which is Phase 7's PRV-01. Gating on it would refuse to start Drift on a runtime where the health check demonstrably works, which is D-05's explicitly rejected alternative.

**This metric is also not the control for the bare-dict regression.** RESEARCH § L-4 is the real hazard: Rust's Windows `make_envp` writes the supplied map verbatim with **no libuv-style back-fill**, so a regression to `env: driftVars` (dropping `buildSpawnEnv`'s parent spread) would be green on every runner this project has and broken only under the real Caido runtime. **The vehicle-independent static gate over `index.ts`'s spawn sites is what catches that** — it lands in 05-04/05-05/05-06, not here. Do not read this row as closing that hole; it is a diagnostic that helps a user's bug report be legible, nothing more.

## Accomplishments

- Added the fifth `PROBE_CAPABILITIES` row `parentEnv` (`gating: false`) with its D-06 REPORT-versus-GATE reasoning in the entry comment, plus the matching `CAPABILITY_PURPOSE` clause worded for a bug reporter.
- Added `countPathEntries` and `describeParentEnvCapability`, both pure and both driven by an INJECTED environment — which is why a Linux runner proves the Windows-shaped `Path` block.
- Extended `buildProbeMetrics` to emit `parentEnvKeyCount` and `parentEnvPathEntryCount`, and `buildProbeReport`'s input with an OPTIONAL `parentEnv?`, so `probeRuntime()` in `index.ts` compiles untouched (05-04 wires it).
- Made the three states falsifiable: `not probed` (never measured), `absent` (measured, not there) and a counted integer render as distinct strings, asserted by inequality rather than by convention.
- Held the T-04-04/T-05-10 line: the row emits integers and status words only. The module header now says so explicitly — counting is not enumerating.

## Exact metric key names and detail strings as shipped

Plan 05-04 wires the input and 05-06 reads the resulting diagnostics fields, so these are recorded verbatim.

**Metric keys on `report.metrics`:**

| Key | Rendered when |
|---|---|
| `parentEnvKeyCount` | `String(Object.keys(parentEnv).length)` when supplied; `"unavailable"` when `parentEnv` is omitted |
| `parentEnvPathEntryCount` | the integer when counted; `"absent"` when the block has no PATH key under any casing; `"unavailable"` when never probed OR when the platform is unknown (separator unknowable) |

**Flattened `getDiagnostics` field names** (produced by the untouched `formatProbeReportFields`): `runtimeParentEnv`, `parentEnvKeyCount`, `parentEnvPathEntryCount`. The `runtimeParentEnv` value takes the standard shape `ok (reported): <detail>`.

**Detail strings, verbatim** (`base` = `` `parent environment carries ${keyCount} keys` ``):

| State | Detail |
|---|---|
| not probed | `the parent process environment was not probed` |
| PATH absent | `` `${base}; the PATH variable is absent from that block` `` |
| platform unknown | `` `${base}; the PATH entry count was not probed because the platform is unrecognised, so the separator is unknowable` `` |
| counted | `` `${base}; PATH carries ${count} entries` `` |

Marker constants: `UNAVAILABLE = "unavailable"` (pre-existing, reused for the never-measured case per plan) and the new `ABSENT = "absent"` (measured, subject not there). `PATH_VARIABLE_NAME = "PATH"` is the ONLY environment key name this module is permitted to print.

## Task Commits

1. **Task 1 (RED): failing tests for the parentEnv row** — `92da98b` (test)
2. **Task 1 (GREEN): parentEnv row, metrics and helpers** — `127d64a` (feat)
3. **Task 2: not-probed/absent, no-leak and gating-invariance cases** — `fdfaec0` (test)

No REFACTOR commit — the GREEN implementation needed no cleanup.

**Plan metadata:** `b8d4b92` (docs: SUMMARY.md + STATE.md + ROADMAP.md)

## Every test file edit, with its reason

The plan requires each edit to be enumerated so that "changed to accommodate a new row" stays distinguishable from "changed to accommodate a regression". All five edits below are the former; none relaxes an assertion.

**Edits to EXISTING assertions** (all in `127d64a`, because Task 1's `<verify>` requires the file green):

1. **`it("marks os.platform and os.tmpdir as gating and realpath and windowsEnv as reported only")` → title now reads `...realpath, windowsEnv and parentEnv as reported only`.** Reason: a fifth reported row joined the set. The word `gating` is preserved verbatim because `04-VALIDATION.md` addresses this row by the `-t "gating"` substring selector, and renaming it away would silently unhook RUN-05 from its proof.
2. **Same test: `.toEqual(["realpath", "windowsEnv"])` → `.toEqual(["realpath", "windowsEnv", "parentEnv"])`.** Reason: the new row is non-gating, so it belongs in the reported partition. The gating partition assertion (`["os.platform", "os.tmpdir"]`) was NOT touched — nothing about the gating set changed, and that is the load-bearing half.
3. **`it("computes tempRootLength and projectedWorstCasePathLength")`: both `report.metrics` `toEqual` objects gained `parentEnvKeyCount: "unavailable"` and `parentEnvPathEntryCount: "unavailable"`.** Reason: `toEqual` is an exact-shape assertion and two metrics were added. `probeInput()` supplies no `parentEnv`, so both correctly render the never-measured marker. The `tempRootLength: "36"` / `projectedWorstCasePathLength: "108"` values are unchanged — the MAX_PATH budget arithmetic was not touched.
4. **`it("flattens capabilities under a runtime prefix...")`: the `Object.keys(fields)` list gained `"runtimeParentEnv"` after `"runtimeWindowsEnv"`, and `"parentEnvKeyCount"`, `"parentEnvPathEntryCount"` after `"projectedWorstCasePathLength"`.** Reason: `formatProbeReportFields` was NOT modified — it flattens `report.capabilities` and `report.metrics` verbatim, so three new fields appear automatically. The positions confirm the fixed render order survived.
5. **Import list gained `CAPABILITY_PURPOSE`.** Reason: the plan's verification requires asserting from inside the suite that `CAPABILITY_PURPOSE` has an entry for every capability name, which needs the constant reachable.

**New tests added** — 9 in `92da98b` (Task 1's behaviour list plus the constant-integrity case) and 3 in `fdfaec0` (Task 2's three falsifiable shapes). Test count moved 278 → 290 across the whole suite; 25 → 28 in this file for Task 2's additions.

## Files Modified

- `packages/backend/src/runtime-probe.ts` — fifth capability row, `CAPABILITY_PURPOSE` entry and export, `ABSENT`/`PATH_VARIABLE_NAME` constants, `PathEntryCount` union, `countPathEntries`, `renderPathEntryCount`, `describeParentEnvCapability`, extended `buildProbeMetrics` and `buildProbeReport`, extended module-header security paragraph.
- `packages/backend/src/runtime-probe.test.ts` — 12 new tests, 5 reconciliation edits (enumerated above).

## Decisions Made

- **`unavailable` for never-probed, `absent` for measured-and-missing.** The plan directed reuse of the module's existing not-available marker for the not-probed case and a distinct string for absent. That mapping is now enforced by an inequality assertion, so a future implementation that renders one string for both fails.
- **Platform-unknown yields not-probed for the PATH entry count, but the key count is still reported.** The separator is a function of the platform; the key count is not. Reporting what is knowable and refusing to guess the rest is the honest split.
- **The PATH key is resolved by scanning for the first key whose uppercase form is `PATH`.** A case-sensitive lookup would report the variable absent on Windows — the one platform this release exists to fix.
- **PATH-key absence is decided before the platform check.** Absence is determinable without a separator, so it is reported as the real measurement it is, rather than being masked by an unknown platform.
- **`CAPABILITY_PURPOSE` was exported.** This is one export beyond the plan's `<artifacts_this_phase_produces>` list. The plan's own `<verification>` item 5 requires asserting from inside the suite that the purpose record has an entry for every capability name, which is not reachable otherwise. The constant is a static map of English sentences already rendered into user-facing failure text — no secret surface is added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Task 1's TDD GREEN step broke three pre-existing assertions that Task 2 was scheduled to fix**

- **Found during:** Task 1 (GREEN step)
- **Issue:** The plan assigns "reconcile every existing assertion that assumed four capability rows" to Task 2, but Task 1's own `<verify>` (`pnpm exec vitest run packages/backend/src/runtime-probe.test.ts`, 0 failures) and its acceptance criteria (`pnpm -r typecheck` and `pnpm lint` exit 0) cannot be satisfied while three assertions are red. The task ordering is internally inconsistent.
- **Fix:** Performed the three structural reconciliations (edits 1–4 above) inside Task 1's GREEN commit, which is the earliest point they can exist. Task 2 then delivered its three falsifiable cases as specified. Every edit is enumerated with its reason above, which is the substantive requirement Task 2 carried.
- **Files modified:** `packages/backend/src/runtime-probe.test.ts`
- **Verification:** `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts` → 25 passed at Task 1, 28 at Task 2; whole suite 290 passed.
- **Committed in:** `127d64a`

**2. [Rule 3 - Blocker] `describeParentEnvCapability`'s required-but-undefined parameter rejected `buildProbeReport`'s optional field**

- **Found during:** Task 1 (acceptance gate)
- **Issue:** `tsc --noEmit` failed with TS2345 — `parentEnv` is optional on `buildProbeReport`'s input but was declared `Record<...> | undefined` (required) on the helper, and TypeScript does not consider an optional property assignable to a required one holding `undefined`.
- **Fix:** Made the helper's `parentEnv` optional too (`parentEnv?:`), mirroring `buildProbeReport`. This also makes "the caller passed nothing" and "the caller passed `undefined`" the same not-probed state, which is the intended semantics.
- **Files modified:** `packages/backend/src/runtime-probe.ts`
- **Verification:** `pnpm -r typecheck` → Done for both packages; `pnpm lint` → 0 at `--max-warnings 0`.
- **Committed in:** `127d64a`

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 - blocking issues). **Impact:** None on the plan's contract. Neither changed a behaviour the plan specified; both were mechanical consequences of the plan's own acceptance gates.

## Standing caveat — [ASSUMED] A1

Recorded verbatim per the plan's `<output>` requirement:

> **A1: The Caido host process's own environment contains a usable `PATH` on Windows.** RESEARCH finding L-1 settles the LLRT half by source read — `process.env` under LLRT is `std::env::vars()`, unfiltered, so it is exactly as complete as the environment of the Caido process itself `[VERIFIED: caido/dependency-llrt@main modules/llrt_process/src/lib.rs:148,158-163]`. It does **not** settle whether the Caido HOST process has a usable `PATH`, which has a real negative case: a macOS app launched from Finder/Dock inherits four entries (`/usr/bin:/bin:/usr/sbin:/sbin`), which is precisely why `command-resolution.ts` carries hardcoded candidate paths at all. The host-process half is `[ASSUMED]` and **only a real Windows Caido install closes it** (Phase 9/10). This is exactly why D-05 REPORTS rather than GATES, and exactly why the metric is an entry COUNT rather than a presence boolean — "present but 4 entries" is the interesting signal and a boolean cannot express it.

## Verification Results

| Check | Result |
|---|---|
| `pnpm exec vitest run packages/backend/src/runtime-probe.test.ts` | 28 passed, 0 failures |
| `pnpm exec vitest run` (whole suite) | **290 passed / 31 files, 0 failures** (baseline was 278) |
| `pnpm -r typecheck` | exit 0 (backend `tsc`, frontend `vue-tsc`) |
| `pnpm lint` | exit 0 at `--max-warnings 0` |
| `git diff --stat 92da98b~1..HEAD` | touches only `runtime-probe.ts` and `runtime-probe.test.ts` |
| `git diff --stat packages/backend/src/index.ts` | empty — index.ts untouched |
| From inside the suite | `PROBE_CAPABILITIES.length === 5`, `parentEnv` entry non-gating, `CAPABILITY_PURPOSE` keys equal the capability names |

## Known Stubs

None. Every symbol added by this plan is fully implemented and exercised by a test. `buildProbeReport`'s `parentEnv` input has no production caller yet **by design** — the plan makes it OPTIONAL specifically so this plan ships independently, and plan **05-04** supplies `process.env` from `index.ts`'s single probe site. This mirrors the Phase 4 precedent where probe exports landed one plan ahead of their wiring.

## Requirements

**RUN-02 and CMP-01 were NOT marked complete.** RUN-02's substance is that the MCP env reaches the server via spawn `env` / config-JSON `env` rather than a shell `export` — plans 05-04/05-05/05-06 carry that, and this plan only adds its diagnostic. CMP-01 spans the whole phase. Both ids are declared by sibling plans in this phase, so the shared-ID gate holds them until the last declaring plan finishes. This matches the standing Phase 3/Phase 4 precedent of not flipping an id complete on the plan that merely touched it.

## Next

Ready for **05-04**, which supplies `parentEnv: process.env` from `index.ts`'s single probe site and lands the static spawn-site gate that is the actual control for the bare-dict regression.

## Self-Check: PASSED

- `packages/backend/src/runtime-probe.ts` — FOUND
- `packages/backend/src/runtime-probe.test.ts` — FOUND
- commit `92da98b` — FOUND
- commit `127d64a` — FOUND
- commit `fdfaec0` — FOUND
