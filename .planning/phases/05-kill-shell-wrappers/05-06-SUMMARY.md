---
phase: 05-kill-shell-wrappers
plan: 06
subsystem: infra
tags: [ci, windows-latest, evidence, validation-contract, non-claims, requirements, phase-close]

# Dependency graph
requires:
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-02's authored windows-latest leg, the reduced `caido-dev build` script and .gitattributes"
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-05's completed rewrite — the .sh count at 1 and the chmod spawn count at 1"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "D-11/D-12/D-13 — how a CI claim is recorded, and the log-extraction pipeline that must be validated before it is trusted"
provides:
  - "05-REPORT.md — the phase report, leading with its five non-claims and three flagged assumptions"
  - "05-VALIDATION.md at status `validated` — V-1..V-19 green and executed, V-20..V-24 untouched as non-claims"
  - "A real green windows-latest run behind V-16..V-19, with per-step conclusions and proving log lines"
  - "timeout-minutes derived from three measured runs, with the run URLs beside the value"
  - "A Build step that asserts dist/plugin_package.zip by path rather than by caido-dev's pathless prose"
  - "extractHomeDir made platform-independent — the first production defect the Windows leg ever caught"
  - "REQUIREMENTS.md: RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01, CI-01, CI-03 Complete with per-row evidence and residual non-claims"
affects: [phase-06, phase-07, phase-09, phase-10]

actuals:
  # chars/4 over the six files actually changed, whole-file basis — the same
  # basis 05-01, 05-03, 05-04 and 05-05 used, so the phase's samples stay
  # comparable. 05-REPORT.md is 39,880 of the 104,168 chars, i.e. this plan's
  # dominant artifact is prose, not code, which is what a phase-close plan is.
  tokens: 26042
  tasks: 4
  commits: 7

tech-stack:
  added: []
  patterns:
    - "A log-extraction pipeline is validated against an independently-known nonzero expected count BEFORE any claim is drawn through it, and re-validated per job log"
    - "A red CI run is READ, not retried — and its failures are fixed at the layer that actually owns them, which may be the test rather than the code"
    - "A gate correction is DECLARED with its reason in both the contract and the report; a threshold is never quietly retuned to pass"
    - "A phase report leads with its non-claims, because the most convincing artifact attracts the most unearned confidence"

key-files:
  created:
    - .planning/phases/05-kill-shell-wrappers/05-REPORT.md
  modified:
    - .github/workflows/ci.yml
    - .planning/phases/05-kill-shell-wrappers/05-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - packages/backend/src/command-resolution.ts
    - packages/backend/src/command-resolution.test.ts

key-decisions:
  - "V-5's published gate was proven VACUOUS by measurement on the pre-phase commit — it returns its expected 2 before any work — and corrected to a comment-stripped quote-agnostic form expecting 1"
  - "V-6 was CLOSED rather than corrected: 05-05 took the count to 1, matching the published expectation exactly; only the view hardened"
  - "The first windows-latest run was red for neither candidate cause named in advance, and the two failures were fixed at two different layers — one code defect, one test defect"
  - "path.posix.normalize was rejected as the extractHomeDir fix: Caido's LLRT path surface exposes no posix namespace"
  - "All eight requirements marked Complete, each with its evidence basis and its residual non-claims written into REQUIREMENTS.md so they survive the phase boundary"
  - "The cold-cache-is-pessimistic rationale for timeout-minutes was disproven by the second measurement and corrected in the file rather than left standing"

patterns-established:
  - "Pattern: an absence gate runs comment-stripped; a dated-notice gate stays RAW, because there the comments are the subject"
  - "Pattern: a two-sided gate — non-zero raw count AND empty allow-list filter — because the filter alone passes vacuously on a file with no sites at all"
  - "Pattern: a human read is recorded WITH ITS PROVENANCE, so a later reader can tell a relayed approval from a first-hand attestation"

requirements-completed: [RUN-01, RUN-02, RUN-04, HLT-01, HLT-02, CMP-01, CI-01, CI-03]

coverage:
  - id: D1
    description: "All nine phase-wide static gates executed with raw output recorded, never inferred from a diff"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "Gates 1-9 executed at 4b70d85; raw output in 05-REPORT.md section 3 and in this SUMMARY"
        status: pass
    human_judgment: false
  - id: D2
    description: "05-VALIDATION.md reconciled with what shipped — V-5 corrected as vacuous with its count change, V-6 closed, V-1..V-19 green"
    requirement: "CMP-01"
    verification:
      - kind: other
        ref: "V-5 vacuity proven by measurement on cd22833 (published form returns its expected 2 pre-phase); contract status draft -> validated"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real windows-latest run with per-step conclusions and the log line proving each mechanism"
    requirement: "CI-01"
    verification:
      - kind: integration
        ref: "https://github.com/six2dez/drift/actions/runs/32378434081 — Verify (Windows) success, 10/10 steps success, 84s"
        status: pass
    human_judgment: false
  - id: D4
    description: "V-16/V-17/V-19 rest on the Test step's own summary line, with both integration cases proven executed rather than skipped"
    requirement: "HLT-02"
    verification:
      - kind: integration
        ref: "run 32378434081 Test step: 'Test Files 31 passed (31)' / 'Tests 290 passed (290)', 0 skips, mcp-server-spec.spawn.test.ts (2 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "V-18 rests on the built artifact asserted BY PATH, not on caido-dev's pathless success line"
    requirement: "CI-01"
    verification:
      - kind: integration
        ref: "run 32378434081 Build step: '-rw-r--r-- 1 runneradmin 197121 2487350 Aug 20 14:10 dist/plugin_package.zip'"
        status: pass
    human_judgment: false
  - id: D6
    description: "CI-03 satisfied in substance: the first real run was red, was read rather than retried, and its two failures were fixed at the correct layer each"
    requirement: "CI-03"
    verification:
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#extracts home directories from macOS and Linux-style paths"
        status: pass
      - kind: unit
        ref: "packages/backend/src/command-resolution.test.ts#builds node candidates from known homes and provider-adjacent paths"
        status: pass
      - kind: other
        ref: "POSIX equivalence of the extractHomeDir replacement proven over 28 inputs — zero divergences"
        status: pass
    human_judgment: false
  - id: D7
    description: "The phase's five bucket-N rows and three flagged assumptions are stated as explicit non-claims, in a document that leads with them"
    requirement: "RUN-02"
    verification:
      - kind: other
        ref: "05-REPORT.md section 1 is the first substantive section; V-20..V-24 each carry a reason and a closing condition; the D-08 caveat carries both halves"
        status: pass
    human_judgment: false
  - id: D8
    description: "index.ts's WIRING of the keystone is correct (V-21) — the criterion whose only possible evidence is a person reading a diff"
    verification: []
    human_judgment: true
    rationale: "Closed by a dated HUMAN READ recorded in 05-REPORT.md section 7.2, explicitly labelled as a human read and not as a gate result. Recorded WITH ITS PROVENANCE: the approval reached the executor through the orchestrating workflow rather than being observed first-hand. No test executes a single line of the diff, so this remains a human-judgment row permanently."
  - id: D9
    description: "The env contract under the real Caido LLRT runtime, and behaviour on a real Windows Caido install"
    verification: []
    human_judgment: true
    rationale: "V-22 and V-23, both permanent non-claims for this phase. Every Windows result here was measured on Node, where libuv back-fills eleven required_vars; the vehicle-independent static Gate 4 is the only control. Closes only in Phase 9/10 on a real Windows Caido install."

duration: 2h 17min
completed: 2026-08-20
status: complete
---

# Phase 5 Plan 6: Phase-Closing Evidence Summary

**Nine static gates executed with their raw output, a validation contract reconciled against the code rather than the plan's intent, and V-16…V-19 resting on a real `windows-latest` run that went red first, was read rather than retried, and exposed a genuine production defect in a file this phase had never touched.**

## Performance

- **Duration:** 2 h 17 min (15:53 → 18:10 local, including one blocking human checkpoint)
- **Tasks:** 4 of 4
- **Files modified:** 6 (1 created, 5 modified)
- **CI runs consumed:** 4 (1 red, 3 green)

## The nine gates — executed, raw output

Run over `packages/backend/src/index.ts` at `4b70d85`. Comment-stripped view is `sed -e 's://.*::'`. Every number is literal command output; none is read off a diff. Phase 4 recorded two exact-count gates silently zeroed by a formatter-shaped argument wrap while typecheck, lint and the suite all stayed green — that is why these are run.

### Gate 1 — shell literals (V-5) → **1**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c '\.sh'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n '\.sh'
1082:  return path.join(mcpTempDir, "mcp-wrapper.sh");
```

Ladder across the phase: **5 → 3 → 2 → 1**. The survivor is `getMcpWrapperPath`'s own literal.

### Gate 2 — chmod discrimination (V-6) → **1 spawn / 15 whole-file**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'spawnAndWait("chmod"'
1
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n 'spawnAndWait("chmod"'
1372:  const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);
$ grep -c 'chmod' packages/backend/src/index.ts
15
```

**The whole-file count of 15 is deliberately non-zero and that is the correct result.** `enforceOwnerOnlyDir` reaches `chmod` through the `fs/promises` **namespace**, not a shell spawn; it re-asserts `0o700` on the token-bearing temp dir and feeds a fail-closed check. A plan whose compliance evidence was `grep -c chmod` → `0` would have deleted a POSIX security control and called it success.

```
$ git show cd22833:packages/backend/src/index.ts | awk '/^async function enforceOwnerOnlyDir/,/^}$/' > /tmp/e_base.txt
$ awk '/^async function enforceOwnerOnlyDir/,/^}$/' packages/backend/src/index.ts > /tmp/e_now.txt
$ diff /tmp/e_base.txt /tmp/e_now.txt
  DIFF: EMPTY — byte-identical (25 lines)
```

### Gate 3 — site inventory (V-7) → **matches exactly**

```
$ grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(\|callMcpMethod(\|writeChatMcpConfig(" packages/backend/src/index.ts
824:async function writeChatMcpConfig(
1354:async function writeMcpWrapper(spec: McpServerSpec): Promise<string | undefined> {
1386:async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult> {
1755:  const validation = await validateCaidoAuth(spec.value);
1762:  await tryRegisterMcpForProviders(spec.value, sdk);
1987:async function callMcpMethod(
2226:    const toolsList = await callMcpMethod(spec.value, {
2260:      const response = await callMcpMethod(spec.value, {
2589:async function tryRegisterMcpForProviders(spec: McpServerSpec, sdk: BackendSDK): Promise<void> {
2592:      ? await writeMcpWrapper(spec)
2860:  const validation = await validateCaidoAuth(spec.value);
2875:  await tryRegisterMcpForProviders(spec.value, sdk);
3071:          const cfgFile = await writeChatMcpConfig(
3120:          const cfgFile = await writeChatMcpConfig(
```

`writeMcpWrapper` 1 def + 1 call; `validateCaidoAuth` 1 + 2; `tryRegisterMcpForProviders` 1 + 2; `callMcpMethod` 1 + 2; `writeChatMcpConfig` 1 + 2. **No call site passes a path** — all pass `spec.value`.

### Gate 4 — the parent-spread gate (V-22), two-sided → **raw 4, filter empty**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -cE '(^|[[:space:],{(])env:'
4
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -nE '(^|[[:space:],{(])env:'
1388:    env: spec.env,
1998:      env: spec.env,
2405:        : spawnWithEnv(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env });
3412:        env: buildSpawnEnv({

$ ... | grep -v 'env: spec\.env' | grep -v 'env: buildSpawnEnv(' | grep -v 'env: options\.env'
[no output — exit 1]
```

Both halves required: the filter alone passes vacuously on a file with no env sites at all.

### Gate 5 — dated deletion notices → **4**

```
$ grep -rn 'DELETED IN PHASE [0-9]\+ (' .github/workflows packages/backend/src | wc -l
4
.github/workflows/windows-llrt-probe.yml:1:# TEMPORARY — DELETED IN PHASE 9 (D-02).
packages/backend/src/index.ts:860:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:967:// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
packages/backend/src/index.ts:1334:// DELETED IN PHASE 7 (PRV-03).
```

Stays a **raw** count on purpose: here the comments *are* the subject, so stripping them would make it vacuously pass forever.

### Gate 6 — the launch indirection is gone → **0, 0, 0, 0**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchCommand'         → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchArgs'            → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'launchScriptPreview'   → 0
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'writeLaunchScript'     → 0
```

All four are **also 0 on the raw file** — stronger than the criterion requires. Threat T-05-20 (critical) discharged.

### Gate 7 — the CMP-01 tripwire (V-11) → **no change, passes**

```
$ git diff --stat cd22833 -- packages/backend/src/provider-launch.ts packages/backend/src/provider-launch.test.ts
[empty]
$ pnpm exec vitest run packages/backend/src/provider-launch.test.ts
Test Files  1 passed (1)
Tests       11 passed (11)
```

### Gate 8 — line endings (V-15) → **both present**

```
$ grep -q 'eol=lf' .gitattributes     → PRESENT
$ grep -q 'text=auto' .gitattributes  → PRESENT
```

### Gate 9 — the suite and both static checks (V-14) → **green**

```
$ pnpm -r typecheck   → exit 0
$ pnpm lint           → exit 0   (eslint . --max-warnings 0)
$ pnpm exec vitest run
Test Files  31 passed (31)
Tests       290 passed (290)
Duration    824ms
```

## Test count: 263 → 290, and every removed test named

**Zero tests were removed as obsolete.** The criterion asks each removal to be named individually; there are none, and that was verified mechanically rather than asserted:

```
$ git diff --diff-filter=D --name-only cd22833..HEAD -- '*.test.ts'
NONE
$ git diff cd22833..HEAD -- '*.test.ts' | grep -E '^-\s*(it|test)\('
-  it("marks os.platform and os.tmpdir as gating and realpath and windowsEnv as reported only", …
```

That single `-it(` line is one half of an **in-place rename**, not a deletion — its `+` partner reads `…realpath, windowsEnv and parentEnv as reported only`. The word `gating` is preserved verbatim because `04-VALIDATION.md` addresses that row by a `-t "gating"` substring selector.

The `+27` is 05-01's 15 new cases plus 05-03's 12.

## The two gate corrections — declared, not retuned

### V-5 was VACUOUS, and its expected value changes 2 → 1

The published form `test "$(grep -c '\.sh"' packages/backend/src/index.ts)" -eq 2` was **already satisfied on the pre-phase tree**:

```
$ git show cd22833:packages/backend/src/index.ts | grep -c '\.sh"'
2
$ git show cd22833:packages/backend/src/index.ts | grep -n '\.sh"'
923:  return path.join(mcpTempDir, "mcp-wrapper.sh");
1184:  const wrapperPath = path.join(mcpTempDir, options?.name ?? "mcp-wrapper.sh");
```

It counts only double-quote-terminated occurrences and is blind to the three template-literal forms that were the actual deletion targets. The corrected form returns **5** on that same pre-phase tree (`:923`, `:1184`, `:1720`, `:2734`, `:2885`). A gate that passes on the tree it exists to discriminate against proves nothing.

Its expected value is **1**, not 2, because `writeMcpWrapper`'s inline join was replaced by a call to `getMcpWrapperPath()` — one literal, one owner. A third, incidental reason the published form could not stand: it returns **1** on the shipped tree, so it would now fail against its own published expectation.

### V-6 was CLOSED, not corrected

`.planning/WINDOWS.md` item 2 was opened at 05-04's close when the count was 2 against an expectation of 1. 05-05 took it to **1**, so the published value is factually correct at the phase boundary and was left alone. Only the view hardened to comment-stripped, so a rationale comment naming the call cannot inflate it — the defect that bit twice in 05-04 and twice more in 05-05.

## The Windows CI evidence

### The log-extraction pipeline was validated before it was trusted

Three Phase 3 plans hit a silently-empty pipeline, which reads identically to a proof that failed. Pipeline used throughout:

```
cut -f3- | perl -pe 's/\x1b\[[0-9;]*m//g' | perl -pe 's/^\xef\xbb\xbf//' \
         | perl -pe 's/^\d{4}-\d{2}-\d{2}T[\d:.]+Z //'
```

Validated against an **independently-known nonzero expected count** — the `Set up job` step prints exactly one `Current runner version:` line — and **re-validated against each of the three job logs**, not just the first:

```
$ grep -c '^Current runner version:' <raw log>                 → 0    ← the silent-empty failure mode
$ <raw log> | <pipeline> | grep -c '^Current runner version:'  → 1    ← the expected nonzero
Current runner version: '2.336.0'
```

### The first run was RED — read, not retried

**[Run 32376894371](https://github.com/six2dez/drift/actions/runs/32376894371)**, head `aa56d94`. `Verify (Windows)`: steps 1–8 `success`, **step 9 `Test` `failure`**, step 10 `Build` `skipped`.

**Neither candidate cause named in advance was the cause.** Research named spawn timing and pnpm long paths (assumption A3). `Install dependencies` concluded `success`, and the spawn tests **passed**:

```
✓ packages/backend/src/mcp-server-spec.spawn.test.ts (2 tests) 681ms
    ✓ authenticates against a stub Caido via --validate-auth 453ms
```

The cause was two failures in `command-resolution.test.ts`, a file **untouched by this phase**, at **two different layers**:

```
FAIL … > extracts home directories from macOS and Linux-style paths
AssertionError: expected undefined to be '/Users/six2dez' // Object.is equality

FAIL … > builds node candidates from known homes and provider-adjacent paths
AssertionError: expected [ '/usr/local/bin/node', …(6) ] to include '/Users/six2dez/.local/bin/node'
```

**Failure 1 — production code defect.** `extractHomeDir` classified POSIX prefixes but normalised with `path.normalize`, which is platform-**flavoured**: on win32 it rewrites `/Users/x/…` to `\Users\x\…`, so both prefix arms were dead and every input returned `undefined`. Replaced with a self-contained POSIX segment collapse. **`path.posix.normalize` was rejected deliberately** — Caido's LLRT `path` surface exposes no `posix` namespace (`@caido/quickjs-types/src/llrt/path.d.ts` declares a flat surface whose only separator affordance is `sep`), and reaching for an API the shipping runtime lacks is the same class of error as trusting a published type that omits a capability (§ Pitfall 7). POSIX behaviour proven **identical over 28 inputs** spanning `.`, `..`, doubled and trailing separators — **zero divergences**, so CMP-01 holds. Teaching it about `C:\Users\<name>` is **RES-03, Phase 6**, and is not claimed.

**Failure 2 — test defect.** `getNodeExecutableCandidates` derives its sibling with `path.join(path.dirname(cmd), "node")`, host-flavoured **by design** and correct on a real Windows host where the command is `C:\…\claude.cmd`. The assertion hard-coded a POSIX literal that could only hold when `path` was POSIX. The fixture now uses a **second** temp dir — deliberately not `homeDir`, since the `homeDirs` loop already emits `<homeDir>/.local/bin/node` and an assertion underneath it would still pass with the provider loop deleted. Falsifiability re-proven by deleting that loop: the test fails.

Getting this distinction right *is* CI-03. Weakening assertion 1 would have hidden a real bug; "fixing" the code for assertion 2 would have broken correct Windows behaviour.

### The authoritative green run

**[Run 32378434081](https://github.com/six2dez/drift/actions/runs/32378434081)**, head `4b70d85`, run conclusion **success**. All five jobs `success`: `Verify (Windows)` (84 s), Node 20 / 22 / 24 / 26.

`Verify (Windows)` per-step conclusions by name — all `success`: `Set up job`, `Checkout`, `Setup pnpm`, `Setup Node`, `Gate: no secret material in CI configuration`, `Install dependencies`, `Typecheck`, `Lint`, `Test`, `Build`, `Post Setup Node`, `Post Setup pnpm`, `Post Checkout`, `Complete job`.

**The proving log lines, verbatim.**

Secret gate — proof it *executed*, not merely that the step was green (T-05-27):

```
Gate passed: no Caido token reference and no GitHub secrets expression in .github/workflows/ci.yml or .github/workflows/windows-llrt-probe.yml
```

Test step — **this one line carries V-16, V-17 and V-19**:

```
 Test Files  31 passed (31)
      Tests  290 passed (290)
```

31 files / 290 tests match the local post-phase count **exactly**. Recorded separately, because "green" and "ran" are different claims: the two integration cases were **executed, not skipped** — `grep -icE 'skipped|todo'` over the whole Test step returns **0**, and the spawn file reports its full case count:

```
 ✓ packages/backend/src/mcp-server-spec.spawn.test.ts (2 tests) 570ms
     ✓ authenticates against a stub Caido via --validate-auth 364ms
```

Build step — **V-18**, artifact named by path:

```
[*] Plugin package zip file created successfully
-rw-r--r-- 1 runneradmin 197121 2487350 Aug 20 14:10 dist/plugin_package.zip
```

`caido-dev`'s own success line names no path, so alone it proves *a* zip, not the one `release.yml` signs. The `test -f dist/plugin_package.zip && ls -l` was added to the step for exactly that reason.

### `timeout-minutes`: 20 → 6, and the obvious rationale was wrong

| Run | pnpm store cache | Duration |
|---|---|---|
| [32377727473](https://github.com/six2dez/drift/actions/runs/32377727473) | **cold** — `pnpm cache is not found` | **87 s** |
| [32378144861](https://github.com/six2dez/drift/actions/runs/32378144861) | **warm** — `Cache restored successfully` | **91 s** |
| [32378434081](https://github.com/six2dez/drift/actions/runs/32378434081) | warm | **84 s** |

**The warm run was slower than the cold one.** The pnpm store cache is therefore not the dominant term and a cold cache is **not** the worst case — install is ~8 s of a ~90 s job either way. The first draft of the `ci.yml` comment asserted "cold is the pessimistic install case"; the second measurement disproved it and the comment was **corrected rather than left standing**. 6 minutes is ~4× the measured ~90 s. The run URLs and both durations sit beside the value.

Stated at the value so nobody later raises it for the wrong reason: a slow spawn fails its own test timeout (15 000 ms in the spawn test, 5 000 ms in the transport tests) long before this fires. It bounds a hang, nothing else.

### Scratch-branch hygiene (T-05-26)

No `git add -A` anywhere in this plan's command history; every stage was a targeted `git add <path>`. The one untracked file — `.planning/milestone.lock`, the orchestrator's session lock carrying a pid and session id — was never staged and never published, the same call 05-02 made.

Teardown proven rather than assumed. `git ls-remote` exits 0 whether or not its glob matched, so the output was captured and discriminated with `test -z`, alongside the full **unfiltered** listing:

```
$ GLOB=$(git ls-remote --heads origin 'scratch/*')
---BEGIN---
---END---
RESULT: EMPTY by test -z — no scratch branch survives
(bare exit status of ls-remote, which is 0 either way and proves nothing: 0)

$ git ls-remote --heads origin
0cd81f3c0cf31bb4f7c4916bf595ec07a358b628	refs/heads/fix/security-hotfixes
2d8cf16004b40a30dfd7721d99f2bf3e2b19e270	refs/heads/main
```

## Requirement statuses — evidence, not inference

Driven by `requirements.ready-ids`, which returned **8/8 ready, 0 blocked** — every sibling plan in this phase has a SUMMARY, so the shared-ID gate no longer holds any of them. Marking was `requirements.mark-complete`, never a hand edit.

| ID | Status | Evidence basis | Residual non-claim |
|---|---|---|---|
| RUN-01 | **Complete** | Gates 1, 2, 3, 6; V-1; V-12/V-16 green | V-21, V-23 |
| RUN-02 | **Complete** | V-2, V-3, V-4, V-10; two-sided Gate 4; V-16 | **V-22** |
| RUN-04 | **Complete** | Structural: the write→exec pairs are **eliminated**, not retried. `withFsRetry` gained its 2nd production call site | **V-20** — real Defender lock, Phase 9/10 |
| HLT-01 | **Complete** | V-12 local + **V-16 on `windows-latest`**; site inventory shows neither call site passes a path | V-21 |
| HLT-02 | **Complete** | V-13 local + **V-17 on `windows-latest`**; both cases executed, not skipped | V-21 |
| CMP-01 | **Complete** | Tripwire byte-unchanged and passing; 263 → 290 with zero removals; `enforceOwnerOnlyDir` byte-identical; typecheck + lint 0 | — |
| CI-01 | **Complete** | Run 32378434081 green; artifact asserted by path; timeout measured | Phase 9: required-for-merge, probe deletion, `caido:plugin` alias |
| CI-03 | **Complete** | `.gitattributes`; `shell: bash` pinned (14 assertions, exit 0); **and the red-run diagnosis above** | — |

**What "Complete" means here, recorded in `REQUIREMENTS.md` itself so it survives the phase boundary:** the evidence this phase was designed to produce exists and was executed. It does **not** mean confirmed on a real Windows Caido install.

Coverage recomputed after the edit rather than restated — checkbox IDs **43**, traceability rows **43**, mapped **43**, unmapped **0**. `git diff .planning/REQUIREMENTS.md` shows **no status change for any requirement outside this phase's eight IDs**.

## The blocking human read

Task 4 was a `checkpoint:human-verify` at `gate="blocking"`. It was **not** self-approved: the executor halted, returned the full checkpoint payload (the section to read, the exact `git diff` command, the three questions, the mechanical findings already in hand, and the two judgement calls most worth overturning), and resumed only on the returned approval.

Both reads are recorded in `05-REPORT.md` § 7 as **dated HUMAN READS, explicitly labelled as human reads and never as gate results** — the distinction V-21 exists to preserve, following Phase 4's RUN-05 precedent.

**Provenance is recorded alongside them**, deliberately: the approval reached the executor **through the orchestrating workflow**, the designed channel for a checkpoint answer, rather than being observed first-hand by the executor. A relayed human read is still a human read, but it is a weaker record than the reader's own signed note, and this phase does not round evidence upward. § 7 says so in those terms and invites the reader to amend it directly if a stronger attestation is wanted.

- **§ 7.1 Legibility** — approved, **no wording change requested**. The non-claims section stands as written, ordering included.
- **§ 7.2 V-21 code review** — all three questions **affirmative**, no code issue found, nothing sent back: (1) no spawn hands a child an unmerged env; (2) no removal in `finalize()` can reach the user's `claude` binary — guard and removal died together; (3) the wrapper is unreachable on win32 on **both** paths, because the guard lives inside `tryRegisterMcpForProviders` and both call sites inherit it.
- **§ 7.3** — two judgement calls put to the reviewer explicitly and **reviewed rather than merely shipped**: the `injectedDriftVars` gating (approved as intended behaviour) and **RUN-04 Complete** (not overturned). RUN-04's structural argument and V-20's non-claim are kept adjacent by design so the basis travels with the verdict.

## Task Commits

1. **Task 1: reconcile the validation contract** — `aa56d94` (docs)
2. **Task 2a: fix the red Windows run at two layers** — `4805e0d` (fix)
3. **Task 2b: measured `timeout-minutes` + artifact assertion** — `01325cf` (ci)
4. **Task 2b′: correct the timeout rationale after the second measurement** — `4b70d85` (ci)
5. **Task 2c: close V-16…V-19 on the real run** — `ecc83a6` (docs)
6. **Task 3: `05-REPORT.md` + the eight requirements** — `b29a913` (docs)
7. **Task 4: both dated human reads, ledger close, this SUMMARY** — this commit (docs)

## Files Created/Modified

- `.planning/phases/05-kill-shell-wrappers/05-REPORT.md` *(created)* — non-claims first, then flagged assumptions, gates, corrections, CI evidence, forward-looking notes, human reads, and only then what the phase claims.
- `.planning/phases/05-kill-shell-wrappers/05-VALIDATION.md` — V-1…V-19 green with the command that proved each; V-5 and V-6 reconciled; V-20…V-24 untouched; `status: validated`.
- `.planning/REQUIREMENTS.md` — eight requirements Complete with per-row evidence and residual non-claims.
- `.github/workflows/ci.yml` — `timeout-minutes` 20 → 6 with three measured runs beside it; Build step asserts the artifact by path.
- `packages/backend/src/command-resolution.ts` — `normalizePosixPath` replaces the platform-flavoured `path.normalize` in `extractHomeDir`.
- `packages/backend/src/command-resolution.test.ts` — the node-candidate assertion de-POSIXed onto a second temp dir, staying falsifiable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The first `windows-latest` run was red, in a file this phase had never touched**

- **Found during:** Task 2
- **Issue:** `command-resolution.test.ts` failed twice on `windows-latest`. Out of scope by the letter of the scope-boundary rule — the file is byte-untouched by Phase 5 — but the task's entire `<done>` is "V-16 through V-19 rest on a real run", which is unreachable while the leg is red. CI-03's wording ("green for the *right* reasons") makes fixing it the task, not a detour.
- **Fix:** Two fixes at two layers, deliberately not one. `extractHomeDir`'s `path.normalize` → a self-contained POSIX segment collapse (production defect); the node-candidate assertion → a second temp dir instead of a POSIX literal (test defect).
- **Verification:** POSIX equivalence over 28 inputs, zero divergences; falsifiability of the changed assertion re-proven by deleting the production loop; 290 green locally and on `windows-latest`.
- **Committed in:** `4805e0d`

**2. [Rule 1 - Bug] My own `timeout-minutes` rationale was disproven by the next measurement**

- **Found during:** Task 2
- **Issue:** The comment committed in `01325cf` asserted that 87 s was "the pessimistic install case" because that run had a cold pnpm cache. The next run, with a **warm** cache, took **91 s** — slower. The stated mechanism was wrong even though the value was fine.
- **Fix:** Recorded both measurements and the inference they actually support: the cache is not the dominant term and cold is not the worst case. The value stayed at 6.
- **Committed in:** `4b70d85`
- **Why it is recorded rather than quietly amended:** this plan's whole subject is not letting a plausible-sounding claim stand unmeasured.

**3. [Rule 3 - Blocking] Task 1's acceptance criterion could not be met before task 2 ran**

- **Found during:** Task 1
- **Issue:** Task 1's criteria require every row V-1…V-19 to carry a non-pending status, but V-16…V-19 are the `windows-latest` rows and no run existed yet. Meeting the criterion literally would have meant pre-filling a CI claim, which the same plan's prohibitions forbid outright.
- **Fix:** The prohibition won. Task 1 marked V-1…V-15 green and V-16…V-19 explicitly `⏳ awaiting the task-2 run — never pre-filled (Phase 3 D-11)`; task 2 filled them from the real run and moved the contract to `validated`.

**4. [Rule 2 - Missing Critical] V-18 rested on a log line that names no path**

- **Found during:** Task 2
- **Issue:** The criterion asks the run's artifact or log to confirm `dist/plugin_package.zip`. The Windows job uploads nothing (the `drift-plugin` artifact comes from the ubuntu legs), and `caido-dev` prints only "Plugin package zip file created successfully" — proving *a* zip, not the one `release.yml` signs.
- **Fix:** Added `test -f dist/plugin_package.zip` + `ls -l` to the Windows Build step, converting V-18 from a tick into a claim.
- **Committed in:** `01325cf`

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 bug, 1 missing-critical).
**Impact:** One production defect fixed in a file outside the phase's original scope, with POSIX behaviour proven unchanged. No gate threshold was relaxed, no test was removed, and no requirement was marked Complete on a claim no gate executed.

## Every test file edit, with its reason

**One file, one test, one reason.** `packages/backend/src/command-resolution.test.ts` — the *"builds node candidates from known homes and provider-adjacent paths"* case had its fixture and one assertion moved off a hard-coded POSIX literal (`/Users/six2dez/.local/bin/claude` → a second `mkdtemp` root). **The assertion was not weakened**: it still names the expected directory and filename explicitly, and it still fails when the production `absoluteProviderCommands` loop is deleted — re-proven by doing exactly that. `provider-launch.test.ts`, the CMP-01 tripwire, is byte-unchanged.

## Known Stubs

**None.** No placeholder, no TODO, and no unwired surface was introduced. The report's non-claims are not stubs — they are stated limits with named owners and closing conditions.

## Broken-windows ledger

`.planning/WINDOWS.md` items **2, 3, 4 and 5** closed by this plan; `open_count` is **0**, `fixed_count` **5**.

- **item 2** — V-6's expected chmod count: closed rather than corrected (05-05 made the published 1 factually right).
- **item 3** — the `redactDebugText` count: reconciled by measurement (4 → 3), with the property the criterion guards asserted **directly** instead — both `.replace` arms byte-identical to the pre-phase tree.
- **item 4** — the spawn's `driftVars` gate: recorded in `05-REPORT.md` § 6.4 and put to the reviewer explicitly (§ 7.3).
- **item 5** — the V-21 ceiling: closed by the dated human code review in § 7.2, with its provenance recorded.

## Issues Encountered

None that blocked past their fix. Two worth carrying forward:

1. **The Windows leg found a real bug on its very first run, in a file no gate in this phase was pointed at.** That is the argument for D-07 (pulling CI-01 forward) landing as measured fact rather than as a plan. It is also a caution: gates confirm what someone thought to ask, and this defect was found by *running the code on the platform*, not by any grep.

2. **A relayed approval is not the same evidentiary object as a first-hand one.** § 7 records that distinction rather than smoothing it, because the phase's own thesis is that the *kind* of evidence must stay legible. Anyone re-reading § 7 later should know they are reading a checkpoint answer routed through a workflow, and can strengthen it by amending the section directly.

## Next Phase Readiness

**Phase 5 is complete.** All six plans have SUMMARYs; the validation contract is `validated`; eight requirements are Complete with their evidence recorded.

- **Phase 6 (RES-01/02/03, UX-02)** inherits a green Windows regression net from its first commit, and one item pre-named for it: `extractHomeDir` still returns `undefined` for `C:\Users\<name>` — that is **RES-03** and it is now the only reason the function exists on Windows at all.
- **Phase 7 (PRV-01…05, UX-01)** inherits the surviving POSIX wrapper behind three dated `DELETED IN PHASE 7 (PRV-03)` notices and a numbered roadmap criterion, **plus a live cleanup obligation**: a Phase-≤5 Drift persisted `mcp add drift -- <wrapper>` entries in Gemini's and Codex's own config files, and deleting the wrapper without `mcp remove` leaves users pointing at a path that no longer exists.
- **Phase 9** inherits: make the Windows job required for merge; delete the probe workflow and script, at which point the secret gate's third arm fires on `grep` status 2 and must be **re-pointed, not removed**; and the deferred `caido:plugin` vitest alias — the one change that would raise V-21 above "a human read the diff".
- **Phase 10** must treat **UX-04 as untouched**: LLRT does not parse `windowsHide` at all, so no spawn converted here partially satisfies it.
- **Phase 2** should treat **SEC-02 as a severity bump**: Claude's `mcp-<chatId>.json` is now token-bearing, so a traversal-shaped `chatId` writes the session token to an attacker-chosen path rather than a wrapper reference.
- **Open, and unclosable in this repo:** whether any of it works on a real Windows Caido install. V-23, and the original reporter's confirmation in Phase 9/10.

## Self-Check: PASSED

- `[ -f .planning/phases/05-kill-shell-wrappers/05-REPORT.md ]` — FOUND
- `[ -f .planning/phases/05-kill-shell-wrappers/05-VALIDATION.md ]` — FOUND
- `[ -f .planning/REQUIREMENTS.md ]` — FOUND
- `[ -f .github/workflows/ci.yml ]` — FOUND
- `[ -f packages/backend/src/command-resolution.ts ]` — FOUND
- commits `aa56d94`, `4805e0d`, `01325cf`, `4b70d85`, `ecc83a6`, `b29a913` — all FOUND in `git log`
- Plan `<verification>` re-run at close: nine gates executed with output recorded; run 32378434081 green with per-step conclusions and proving log lines; V-1…V-19 green and V-20…V-24 untouched; `05-REPORT.md` leads with non-claims and carries the D-08 caveat plus three flagged assumptions; coverage recomputed to 43 mapped / 0 unmapped with no out-of-phase change; scratch branch provably gone by `test -z` plus the full unfiltered listing; both human reads dated, labelled as human reads, and carrying their provenance.

---
*Phase: 05-kill-shell-wrappers*
*Completed: 2026-08-20*
