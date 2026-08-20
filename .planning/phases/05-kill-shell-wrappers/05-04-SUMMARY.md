---
phase: 05-kill-shell-wrappers
plan: 04
subsystem: backend-orchestrator
tags: [mcp, spawn, windows, llrt, keystone, config-projection, win32-guard]

# Dependency graph
requires:
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-01's mcp-server-spec.ts — buildMcpServerSpec, buildMcpDriftVars, toMcpConfigDocument, planMcpCliRegistration, findExpandableEnvKeys"
  - phase: 05-kill-shell-wrappers
    provides: "plan 05-03's optional parentEnv input on buildProbeReport"
  - phase: 04-platform-foundation
    provides: "platform.ts's buildSpawnEnv (the single parent-merge point), the cached `host` os read, withFsRetry"
provides:
  - "requireMcpServerSpec(options?) — the ONE keystone index.ts reaches the MCP server through"
  - "spawnAndWait(cmd, args, options?) — an OPTIONAL env parameter; ~8 other call sites untouched"
  - "validateCaidoAuth(spec) and callMcpMethod(spec, request) — direct `node` spawns with env"
  - "writeChatMcpConfig(name, spec, sdk) — one projection, two callers, plus the T-05-13 expansion guard"
  - "writeMcpWrapper(spec) — the surviving POSIX wrapper, headed DELETED IN PHASE 7 (PRV-03)"
  - "tryRegisterMcpForProviders(spec, sdk) — the win32 guard lives here, so BOTH call sites inherit it"
affects: [05-05 provider launch conversion, 05-06 phase report, 07-provider-launch]

actuals:
  # chars/4 over the two files actually changed, on the same whole-file basis
  # 05-01 and 05-03 used. NOTE the honest caveat: index.ts is 179,645 chars and
  # this plan rewrote ~30,538 chars of it, so this number measures the FILES
  # touched, not the work done. On a changed-hunk basis it would be ~7,600.
  # Recorded on the sibling basis so the phase's samples stay comparable.
  tokens: 48304
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "One keystone, many projections: a single Result-returning spec builder feeding three orchestration sites and two config writers"
    - "A capability the published type surface omits is narrowed with an exact-shape function alias, not widened with `any`"
    - "A static gate's match set is kept free of non-value lines by construction (Record<\"env\", …> instead of an `env:` member)"

key-files:
  created: []
  modified:
    - packages/backend/src/index.ts
    - README.md

key-decisions:
  - "writeChatMcpConfig gained a third `sdk` parameter beyond the plan's <interfaces> contract, because the plan's own <action> requires the expansion guard to log through sdk.console.error"
  - "A SpawnWithEnv function alias was added: @caido/quickjs-types declares SpawnOptions WITHOUT `env`, though LLRT's runtime honours it (finding L-2)"
  - "refreshActiveMcpRuntime keeps its own explicit token check so the 'invalid' auth state is not downgraded to a generic 'error'"
  - "V-6 in 05-VALIDATION.md expects ONE surviving chmod spawn; the correct post-05-04 number is 2. Recorded for 05-06, not silently retuned here"

patterns-established:
  - "Pattern: a temporary intermediate shape carries a comment naming the task that deletes it, so a half-finished conversion cannot be mistaken for a design"
  - "Pattern: a byte-shape parity claim is demonstrated by running both documents through JSON.stringify and comparing, never by reading the diff"

requirements-completed: []

coverage:
  - id: D1
    description: "One requireMcpServerSpec keystone reached from ALL THREE orchestration sites — startMcpServer, refreshActiveMcpRuntime and the shared self-test (RUN-01)"
    requirement: "RUN-01"
    verification:
      - kind: other
        ref: "Gate A: grep -n site inventory — writeMcpWrapper 1+1, validateCaidoAuth 1+2, tryRegisterMcpForProviders 1+2, no call site passes a path"
        status: pass
    human_judgment: true
    rationale: "index.ts is not importable under vitest (no caido:plugin alias), so no test executes this wiring. The static gates are the evidence — bucket N row V-21."
  - id: D2
    description: "The token and DRIFT_* reach the server through the spawn `env` option and the config-JSON `env` field, never a shell export, on the Claude and self-test paths (RUN-02)"
    requirement: "RUN-02"
    verification:
      - kind: other
        ref: "Gate B: comment-stripped `.sh` literal count 5 -> 2; Gate D: every env: line is spec.env / buildSpawnEnv( / options.env"
        status: pass
    human_judgment: true
    rationale: "Same ceiling as D1. The env CONTRACT is proven on the pure side by 05-01; its wiring here is proven only statically."
  - id: D3
    description: "validateCaidoAuth and the three self-test methods run against a directly spawned node (HLT-01, HLT-02)"
    requirement: "HLT-01"
    verification:
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec spawn authenticates against a stub Caido via --validate-auth"
        status: pass
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec spawn drives all three self-test methods over stdio JSON-RPC"
        status: pass
    human_judgment: true
    rationale: "Those two cases prove the SPEC drives a real server. They do not execute index.ts's validateCaidoAuth or callMcpMethod, which is what this plan changed."
  - id: D4
    description: "Claude's mcp-<chatId>.json and Copilot's copilot-mcp-<chatId>.json are one projection of one spec, and Copilot's document is byte-identical to what it wrote before (RUN-02, CMP-01, D-10)"
    requirement: "CMP-01"
    verification:
      - kind: other
        ref: "Executed before/after JSON.stringify comparison for a fixture input — identical, 696 bytes (raw output in this SUMMARY)"
        status: pass
    human_judgment: false
  - id: D5
    description: "On win32 no POSIX wrapper is written and no chmod is spawned; the skip reason names the provider and Phase 7 verbatim, in-product and in the README (CMP-01, D-01/D-02/D-03)"
    requirement: "CMP-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration makes the shared wrapper path unreachable on win32, before wrapperPath is even considered"
        status: pass
      - kind: other
        ref: "Mechanical word-identity check: both README sentences reproduced from planMcpCliRegistration's template — MATCH"
        status: pass
    human_judgment: true
    rationale: "The PREDICATE is unit-tested. That index.ts consults it, and that the wrapper write itself sits behind `host.platform !== \"win32\"`, is static-gate evidence only."
  - id: D6
    description: "A literal token carrying the variable-reference opener fails loud at the write site instead of producing a silently unauthenticated MCP server (T-05-13)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#findExpandableEnvKeys names the keys Claude Code would expand inside a config env field"
        status: pass
    human_judgment: true
    rationale: "The predicate is proven; that writeChatMcpConfig calls it before the write is proven only by grep (count 2 — the import and the one call)."
  - id: D7
    description: "probeRuntime supplies process.env to buildProbeReport, so D-05's PATH-entry and env-key counts appear in getDiagnostics"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/runtime-probe.test.ts#counts keys and colon-separated PATH entries on a POSIX platform"
        status: pass
    human_judgment: true
    rationale: "runtime-probe.ts's counting is unit-tested with an injected env. That index.ts injects the REAL process.env is static-gate evidence (parentEnv count 4, two of them call sites)."
  - id: D8
    description: "macOS/Linux behaviour preserved — 290 tests green, provider-launch.ts and provider-launch.test.ts byte-unchanged, enforceOwnerOnlyDir byte-identical"
    requirement: "CMP-01"
    verification:
      - kind: other
        ref: "pnpm exec vitest run — 290 passed / 31 files / 0 failures, identical to the end-of-wave-1 total"
        status: pass
      - kind: other
        ref: "git diff --stat over provider-launch.ts / provider-launch.test.ts — empty; enforceOwnerOnlyDir diff vs HEAD~2 — empty"
        status: pass
    human_judgment: false

duration: 11 min
completed: 2026-08-20
status: complete
---

# Phase 5 Plan 4: The Spec Keystone and the Health Path Summary

**`index.ts`'s MCP health path now runs through one `requireMcpServerSpec()` keystone at all three orchestration sites, with the Caido token reaching the server through the spawn `env` option and the config-JSON `env` field — the Claude session wrapper and the self-test launch script are gone, and the surviving POSIX wrapper is unreachable on win32.**

## The evidentiary ceiling (V-21) — read this before any other section

`index.ts` is **not importable under vitest** — there is no `caido:plugin` alias in `vitest.config.ts` and no test file imports it. **Nothing in this plan is covered by a test that executes it.** Not one line of `requireMcpServerSpec`, the converted `validateCaidoAuth`, the converted `callMcpMethod`, the rewritten `writeChatMcpConfig` or the win32 guard inside `tryRegisterMcpForProviders` runs in the test suite.

What *is* proven, and by whom: plan 05-01 proved the **spec**, the **server** and the **spawn contract** — `buildMcpServerSpec`'s output spawns the real `assets/mcp-server.mjs` to `{ok:true}` and drives all three self-test methods over stdio JSON-RPC. What is **not** proven is `index.ts`'s **wiring** of them.

That gap is bucket **N**, row **V-21**, and its only mitigations are the four static gates executed below and a human code review. The 290 green tests in this plan are a **regression** signal (nothing that was covered broke); they are not coverage of anything this plan wrote. Do not report this plan as more than that in 05-06.

A second, independent ceiling applies to the env contract (**V-22**): the integration evidence spawns through **Node**, where libuv back-fills eleven `required_vars` on Windows. A regression to a bare drift-only `env` dict would pass every test this repo has and break only under Caido's LLRT, where Rust's `make_envp` writes the supplied map verbatim. **Gate D below is the only vehicle-independent control for that**, which is why it is run two-sided.

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-20T13:14:52Z
- **Completed:** 2026-08-20T13:25:27Z
- **Tasks:** 3 of 3
- **Files modified:** 2

## The four gates, executed — raw output

Run at the end of task 2, over `packages/backend/src/index.ts`. Every number below is the literal output of the command shown, not a reading of the diff. Phase 4 recorded two exact-count gates silently zeroed by a formatter-shaped argument wrap while typecheck, lint and the suite all stayed green; that is why these are executed.

### Gate A — site inventory (V-7)

```
$ grep -n "writeMcpWrapper(\|validateCaidoAuth(\|tryRegisterMcpForProviders(\|callMcpMethod(\|writeChatMcpConfig(" packages/backend/src/index.ts
762:async function writeChatMcpConfig(
1259:async function writeMcpWrapper(spec: McpServerSpec): Promise<string | undefined> {
1291:async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult> {
1660:  const validation = await validateCaidoAuth(spec.value);
1667:  await tryRegisterMcpForProviders(spec.value, sdk);
1892:async function callMcpMethod(
2131:    const toolsList = await callMcpMethod(spec.value, {
2165:      const response = await callMcpMethod(spec.value, {
2494:async function tryRegisterMcpForProviders(spec: McpServerSpec, sdk: BackendSDK): Promise<void> {
2497:      ? await writeMcpWrapper(spec)
2765:  const validation = await validateCaidoAuth(spec.value);
2780:  await tryRegisterMcpForProviders(spec.value, sdk);
2976:          const cfgFile = await writeChatMcpConfig(
3025:          const cfgFile = await writeChatMcpConfig(
```

Line-for-line against the expected set:

| Symbol | Expected | Measured | Where |
|---|---|---|---|
| `writeMcpWrapper` | 1 definition + 1 call | `1259` def, `2497` call | the single call is inside `tryRegisterMcpForProviders`, behind the platform guard |
| `validateCaidoAuth` | 1 definition + 2 calls | `1291` def, `1660` + `2765` | `1660` = `refreshActiveMcpRuntime`, `2765` = `startMcpServer`. **Neither passes a path** — both pass `spec.value` |
| `tryRegisterMcpForProviders` | 1 definition + 2 calls | `2494` def, `1667` + `2780` | same two orchestration sites. **Neither passes a path** |
| `callMcpMethod` | 1 definition + 2 calls | `1892` def, `2131` + `2165` | both inside `runSharedMcpSelfTest`, both spec-taking |
| `writeChatMcpConfig` | 1 definition + 2 calls | `762` def, `2976` + `3025` | `2976` = Claude, `3025` = Copilot — one projection, two callers |

**PASS.** The site CONTEXT.md's narrative list missed — `refreshActiveMcpRuntime`, reached from a settings save and from `syncCaidoSessionToken` (which the frontend polls as keep-alive) — is converted. Had it been left on the wrapper, the first token refresh on Windows would have torn down a working MCP runtime through its `cleanupMcpRuntime` call.

### Gate B — shell-literal count (V-5, corrected form)

The gate as written in `05-VALIDATION.md` (`grep -c '\.sh"'`) counts double-quoted occurrences only and already returns 2 at HEAD, so it is vacuous. The comment-stripped, quote-agnostic form was run instead:

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c '\.sh'
2

$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n '\.sh'
993:  return path.join(mcpTempDir, "mcp-wrapper.sh");
3111:        `provider-launch-${input.sessionId}.sh`,
```

**PASS — exactly 2, and it landed on the predicted ladder.**

| Stage | Count | Which literals |
|---|---|---|
| HEAD (measured before any edit) | **5** | `:923` `getMcpWrapperPath`, `:1184` `writeMcpWrapper`'s inline join, `:1720` the self-test `.sh`, `:2734` the Claude session wrapper, `:2885` provider-launch |
| After task 1 | **3** | task 1 deleted `:1184` (default now `getMcpWrapperPath()`) and `:1720` (the `mcp-self-test-<id>.sh` write) |
| After task 2 | **2** | task 2 deleted `:2734` (the Claude session wrapper) |
| Plan 05-05 will take it to | 1 | `provider-launch-<sid>.sh`; `getMcpWrapperPath`'s literal stands until Phase 7 |

The two survivors are `getMcpWrapperPath`'s own literal (`:993` now — the Gemini/Codex wrapper D-01 keeps alive) and the provider-launch template (`:3111` now — plan 05-05 deletes it).

### Gate C — chmod discrimination (V-6, § Pitfall 1)

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -c 'spawnAndWait("chmod"'
2

$ sed -e 's://.*::' packages/backend/src/index.ts | grep -n 'spawnAndWait("chmod"'
810:  const chmodResult = await spawnAndWait("chmod", ["+x", tempScriptPath]);
1277:  const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);

$ grep -c 'chmod' packages/backend/src/index.ts
16
```

**PASS.** Neither chmod spawn dies in this plan: `:810` lives in `writeLaunchScript` (plan 05-05 deletes it with the provider-launch conversion) and `:1277` lives in `writeMcpWrapper`, which D-01 keeps alive on POSIX until Phase 7.

`enforceOwnerOnlyDir` proven untouched by extracting its function body from `HEAD~2` (the pre-plan commit) and from the working tree and diffing:

```
$ git show HEAD~2:packages/backend/src/index.ts | awk '/^async function enforceOwnerOnlyDir/,/^}$/' > /tmp/e_base.txt
$ awk '/^async function enforceOwnerOnlyDir/,/^}$/' packages/backend/src/index.ts > /tmp/e_now.txt
$ diff /tmp/e_base.txt /tmp/e_now.txt
  diff: EMPTY — byte-identical (25 lines)
```

**The post-phase whole-file `chmod` count is deliberately non-zero (16), and that is the correct result.** `enforceOwnerOnlyDir` reaches `chmod` through the `fs/promises` **namespace**, not through a shell spawn; it re-asserts `0o700` on the token-bearing temp dir and feeds a fail-closed check. A plan whose SC-1 evidence was `grep -c chmod` → `0` would have deleted a POSIX security control and called it compliance.

**Discrepancy recorded for 05-06, not corrected here.** `05-VALIDATION.md` row V-6 reads *"Exactly **one** `spawnAndWait("chmod"` survives"*. The correct number **after this plan** is 2; it becomes 1 only after plan 05-05 deletes `writeLaunchScript`. V-6 is a post-PHASE gate stated against a mid-phase boundary. `git diff --stat .planning/phases/05-kill-shell-wrappers/05-VALIDATION.md` is **empty** — no threshold was touched in this plan, per task 3's rule.

### Gate D — the parent-spread gate (V-22), two-sided

**Half 1 — the raw count must be non-zero, so the filter cannot pass vacuously:**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -cE '(^|[[:space:],{(])env:'
3

$ sed -e 's://.*::' packages/backend/src/index.ts | grep -nE '(^|[[:space:],{(])env:'
1293:    env: spec.env,
1903:      env: spec.env,
2310:        : spawnWithEnv(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: options.env });
```

**Half 2 — the three-entry allow-list filter must print nothing:**

```
$ sed -e 's://.*::' packages/backend/src/index.ts | grep -E '(^|[[:space:],{(])env:' \
    | grep -v 'env: spec\.env' | grep -v 'env: buildSpawnEnv(' | grep -v 'env: options\.env'
[no output]
```

**PASS, both halves.** The task-1 temporary fourth allow-list entry (`env: buildMcpRuntimeEnv(`) matches **nothing** at this point, which is the positive confirmation that the Copilot conversion is complete — its `:2796` site is gone.

**Why this gate is vehicle-independent and the integration test is not:** the test spawns through Node, where libuv back-fills eleven `required_vars` into whatever block you supply, so a regression to a bare drift-only dict starts a working child and passes every assertion; under Caido's LLRT there is no libuv and Rust's `make_envp` writes the map verbatim, so the same regression is broken only on the machine of the user who filed the bug.

## Copilot config byte-shape parity — demonstrated, not asserted

Run as a scratch vitest case importing the **production** `buildMcpDriftVars`, `buildMcpServerSpec` and `toMcpConfigDocument`, then deleted before commit (it is not part of the shipped suite). BEFORE is the exact literal `index.ts:2791-2803` handed to `writeChatMcpConfig` at HEAD, run through the same `JSON.stringify(…, null, 2)`; AFTER is `JSON.stringify(toMcpConfigDocument(spec), null, 2)`.

```
=== BEFORE ===                          === AFTER ===
{                                       {
  "mcpServers": {                         "mcpServers": {
    "drift": {                              "drift": {
      "command": "/usr/local/bin/node",       "command": "/usr/local/bin/node",
      "args": [                               "args": [
        "/tmp/drift-mcp-abc/mcp-server.mjs"     "/tmp/drift-mcp-abc/mcp-server.mjs"
      ],                                      ],
      "env": {                                "env": {
        "CAIDO_URL": …                          "CAIDO_URL": …
        "CAIDO_TOKEN": …                        "CAIDO_TOKEN": …
        "DRIFT_CONTEXT_FILE": …                 "DRIFT_CONTEXT_FILE": …
        "DRIFT_ALLOWLIST_ACTIVE": "1"           "DRIFT_ALLOWLIST_ACTIVE": "1"
        "DRIFT_ALLOWED_TOOLS": …                "DRIFT_ALLOWED_TOOLS": …
        "DRIFT_CONFIRMATION_REQUIRED_TOOLS": …  "DRIFT_CONFIRMATION_REQUIRED_TOOLS": …
        "DRIFT_CONFIRM_SENSITIVE_ACTIONS": "1"  "DRIFT_CONFIRM_SENSITIVE_ACTIONS": "1"
        "DRIFT_ACTIVITY_FILE": …                "DRIFT_ACTIVITY_FILE": …
        "DRIFT_APPROVALS_FILE": …               "DRIFT_APPROVALS_FILE": …
      }                                       }
    }                                       }
  }                                       }
}                                       }

=== IDENTICAL: true   byteLength: 696 ===
```

The fixture's `parentEnv` deliberately carried a key named `SECRET` that appears in **neither** document — the T-05-16 property that the config projection reads `spec.driftVars` and never the parent-merged `spec.env`.

## Exact signatures as shipped

Plan 05-05 is written against these. Copied from the source, not from the plan.

```ts
async function requireMcpServerSpec(options?: {
  toolPolicy?: McpToolPolicy;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Promise<Result<McpServerSpec>>;

function spawnAndWait(
  cmd: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<{ code: number; stdout: string; stderr: string }>;

async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult>;

async function callMcpMethod(
  spec: McpServerSpec,
  request: Record<string, unknown>,
): Promise<{ response: JsonRpcResponse; durationMs: number }>;

// NOTE the third parameter — see Deviation 2.
async function writeChatMcpConfig(
  name: string,
  spec: McpServerSpec,
  sdk: BackendSDK,
): Promise<string | undefined>;

async function writeMcpWrapper(spec: McpServerSpec): Promise<string | undefined>;

async function tryRegisterMcpForProviders(
  spec: McpServerSpec,
  sdk: BackendSDK,
): Promise<void>;

// New, and available to 05-05 for the provider spawn conversion — see Deviation 1.
type SpawnWithEnv = (
  command: string,
  args: string[],
  options: Record<"env", Record<string, string>> & { stdio: ["pipe", "pipe", "pipe"] },
) => ChildProcessWithoutNullStreams;
const spawnWithEnv = spawn as unknown as SpawnWithEnv;

// Also new, and the guarded parent-env read 05-05 should reuse rather than re-derive.
function readParentEnv(): Record<string, string | undefined>;

// New module constants.
const NO_CAIDO_TOKEN_MESSAGE: string;          // the one no-token sentence, was inline at 4 sites
const MCP_RUNTIME_NOT_RUNNING_MESSAGE: string; // "Drift MCP runtime is not running."
```

## Accomplishments

- **One keystone, three orchestration sites.** `requireMcpServerSpec` resolves `getTempMcpScriptPath()` → `getEffectiveCaidoToken()` → `requireNodeExecutable()` and returns `buildMcpServerSpec({…, parentEnv: readParentEnv() })`. `startMcpServer`, `refreshActiveMcpRuntime` and `runSharedMcpSelfTest` all reach the server through it, plus both config writers.
- **The self-test `.sh` no longer exists.** `callMcpMethod` lost its `envVars` parameter, the `mcp-self-test-<requestId>.sh` write, the `launchPath` local and the `cleanupLaunchScript` helper and all three calls to it. That was a **third** token-bearing file on disk; combined with the Claude session wrapper's deletion, the phase is a net reduction in files that ever hold the token (D-10), not a relocation.
- **`buildMcpRuntimeEnv` is a thin adapter** over the pure `buildMcpDriftVars`, with its two module-state reads (`currentSettings.caidoApi.url` and `getMcpContextFilePath()`) injected. The env dict's key set, insertion order and unconditional `DRIFT_ALLOWLIST_ACTIVE` are now unit-tested in `mcp-server-spec.test.ts` rather than unverifiable here.
- **The win32 guard has exactly one home.** `tryRegisterMcpForProviders` obtains the wrapper path itself — `host !== undefined && host.platform !== "win32" ? await writeMcpWrapper(spec) : undefined` — so **both** call sites inherit it and no `.sh` is written and no `chmod` is spawned on Windows. A wrapper-write failure is now a **skip reason**, never an MCP-start failure.
- **The expansion guard is at the write site.** `writeChatMcpConfig` calls `findExpandableEnvKeys(spec.driftVars)` and refuses the write with an actionable `sdk.console.error` naming **KEY names only** (D-11 / T-04-04), telling the user to re-authenticate in Caido.
- **D-05's metric is wired.** `probeRuntime` passes `parentEnv: readParentEnv()` to `buildProbeReport`, so `runtimeParentEnv`, `parentEnvKeyCount` and `parentEnvPathEntryCount` now appear in `getDiagnostics` with real values instead of `unavailable`.
- **The surviving wrapper carries its due date.** `writeMcpWrapper` is headed with the literal string `DELETED IN PHASE 7 (PRV-03)`, matching `windows-llrt-probe.yml`'s `DELETED IN PHASE 9 (D-02)` so both are greppable by one pattern.
- **Suite 290 / 31 files / 0 failures** — identical to the end-of-wave-1 total (05-01's 278 + 05-03's 12). This plan adds no tests, so any movement would have been a regression. `pnpm -r typecheck` exits 0 and `pnpm lint` exits 0 at `--max-warnings 0`.

## Verification Results

| Check | Result |
|---|---|
| `pnpm -r typecheck` | exit 0 (shared, backend `tsc`, frontend `vue-tsc`) |
| `pnpm lint` | exit 0 at `--max-warnings 0` |
| `pnpm exec vitest run` | **290 passed / 31 files / 0 failures** |
| Gate A — site inventory | PASS (1+1, 1+2, 1+2; no call site passes a path) |
| Gate B — `.sh` count | PASS (5 → 3 → **2**) |
| Gate C — chmod discrimination | PASS (2 spawns, whole-file 16, `enforceOwnerOnlyDir` byte-identical) |
| Gate D — parent-spread, two-sided | PASS (raw 3 ≥ 2; filter empty) |
| Copilot byte-shape parity | PASS (identical, 696 bytes, executed) |
| `grep -c 'requireMcpServerSpec'` | 6 (≥ 4 required) |
| `grep -c 'writeLaunchScript('` | 2 (definition + the one surviving provider-launch caller) |
| `grep -c 'parentEnv'` | 4, two of them call sites (`requireMcpServerSpec`, `probeRuntime`) |
| `grep -c 'toMcpConfigDocument'` / `findExpandableEnvKeys` / `planMcpCliRegistration` | 2 each (the import and the one call) |
| `grep -c 'writeChatMcpConfig('` | 3 (definition + Claude + Copilot) |
| `grep -c 'claudeMcpWrapperPath'` (comment-stripped) | 0 |
| `grep -c 'Phase 7' README.md` | 2 (both provider rows) |
| README ↔ `planMcpCliRegistration` sentence identity | MATCH for both Gemini and Codex (checked mechanically against the source template) |
| `git diff --stat` over `provider-launch.ts` / `provider-launch.test.ts` | empty |
| `git diff --stat` over `05-VALIDATION.md` | empty — no gate threshold changed |
| `git diff --stat` overall | touches only `packages/backend/src/index.ts` and `README.md` |

## Task Commits

1. **Task 1: the spec keystone and the health path** — `56405ee` (feat)
2. **Task 2: both config writers on one projection, the win32 guard, the Claude `.sh` deleted** — `35f61f5` (feat)
3. **Task 3: execute the gates and record the ceiling** — no code delta by design; its deliverable is the four gate sections and the V-21 paragraph above, and it ships with this SUMMARY's commit. An empty commit was deliberately not created.

## Files Modified

- `packages/backend/src/index.ts` — +402 / −187. New: `readParentEnv`, `SpawnWithEnv`/`spawnWithEnv`, the `── MCP server spec keystone ──` section with `requireMcpServerSpec`, `NO_CAIDO_TOKEN_MESSAGE`, `MCP_RUNTIME_NOT_RUNNING_MESSAGE`. Changed: `buildMcpRuntimeEnv`, `spawnAndWait`, `validateCaidoAuth`, `callMcpMethod`, `runSharedMcpSelfTest`, `writeChatMcpConfig`, `writeMcpWrapper`, `tryRegisterMcpForProviders`, `startMcpServer`, `refreshActiveMcpRuntime`, `probeRuntime`. Deleted: the self-test `.sh` write + `launchPath` + `cleanupLaunchScript`, the Claude session wrapper + `claudeMcpWrapperPath` + its debug dump + its `finalize()` removal, `writeMcpWrapper`'s `options` parameter, `runSharedMcpSelfTest`'s `getMcpWrapperPath()` preamble and `selfTestEnv`.
- `README.md` — the D-03 Windows sentence in the Gemini CLI and Codex CLI Status cells.

## Decisions Made

- **`writeChatMcpConfig` takes `sdk`.** The plan's `<interfaces>` block declares `(name, spec)` while the same plan's `<action>` requires the expansion guard to log "through `sdk.console.error`". Those cannot both hold. The `<action>` won, because the guard's whole value is the actionable message reaching the user's Caido log — see Deviation 2.
- **`refreshActiveMcpRuntime` keeps its own token check.** Folding it into `requireMcpServerSpec`'s single error channel would have downgraded the `"invalid"` auth state (reauthenticate in Caido — recoverable) into a generic `"error"`, and that state is user-visible in the MCP status panel. The check is three lines and the granularity is worth them.
- **`startMcpServer`'s explicit `requireNodeExecutable()` was deleted, `refreshActiveMcpRuntime`'s token check was not.** Different reasons: the node resolve was pure duplication (the keystone resolves node and returns the same `NODE_EXECUTABLE_ERROR` through the same cleanup-and-err shape), whereas the token check carries information the keystone's error channel cannot express.
- **The `SpawnWithEnv` option type is written `Record<"env", …>` rather than as an `env:` member.** Identical type — a required `env` of `Record<string, string>` — but it keeps Gate D's match set free of a permanent non-value line. A type declaration is not an environment handed to a child process, and a gate that permanently matches noise is a gate someone relaxes later.
- **V-6's expected count was left alone.** It reads "exactly one" surviving chmod spawn; the correct number at this plan's boundary is 2. Per task 3's rule, that is 05-06's correction to make in `05-VALIDATION.md`, not this plan's — and the file is byte-unchanged here.
- **No requirement marked Complete.** RUN-01, RUN-02, HLT-01, HLT-02 and CMP-01 are each declared by sibling plans in this phase (05-05, 05-06) that have no SUMMARY yet, so the shared-ID gate holds them. This is also the honest call on its own terms: the phase's central claim is not shippable until 05-05 converts the provider launch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Caido's `SpawnOptions` type declares no `env`, though the runtime honours it**

- **Found during:** Task 1
- **Issue:** `pnpm -r typecheck` failed with `TS2769: … Object literal may only specify known properties, and 'env' does not exist in type 'SpawnOptions'` at both new env-supplying spawn sites, cascading into ~12 `Property 'x' does not exist on type 'never'` errors as TypeScript collapsed the overload intersection. `@caido/quickjs-types` `src/llrt/child_process.d.ts:239-255` declares `SpawnOptions extends ProcessEnvOptions` where `ProcessEnvOptions` is `{ uid?, gid?, cwd? }` — **no `env` anywhere**. This is `05-RESEARCH.md` § Pitfall 7 in the flesh: the published type surface omits a capability the same project's Rust source declares. Finding L-2 verified the runtime **does** read `env` and replaces the parent block with it.
- **Fix:** Added a `SpawnWithEnv` function alias naming the exact call shape this file uses, plus `const spawnWithEnv = spawn as unknown as SpawnWithEnv`. Deliberately **not** `as any` and **not** a widened `SpawnOptions`: `env` stays a required, type-checked `Record<string, string>` at both sites rather than becoming an unchecked hole. The rationale, with the `.d.ts` line range and the LLRT source reference, is commented at the declaration.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `pnpm -r typecheck` exit 0; both call sites still match Gate D's allow-list.
- **Committed in:** `56405ee`
- **Note for 05-05:** the provider spawn conversion (D-04) will hit this same wall. `spawnWithEnv` is already there; do not add a second cast.

**2. [Rule 2 - Missing Critical] `writeChatMcpConfig` had no channel for the expansion guard's message**

- **Found during:** Task 2
- **Issue:** The plan requires the T-05-13 guard to log "an actionable message through `sdk.console.error`" from inside `writeChatMcpConfig`, but the plan's own `<interfaces>` block gives that function the signature `(name, spec)` — no `sdk`. The function had no `sdk` and `index.ts` has no module-level SDK reference. Returning `undefined` silently would have left the user with the generic "Drift could not prepare the Claude MCP configuration file." and no way to learn *why*, which is precisely the silent failure the guard exists to convert into a loud one.
- **Fix:** Added `sdk: BackendSDK` as a third parameter. Both call sites live inside `sendCliMessage`, which already receives `sdk`, so the change is mechanical. The plan's own acceptance gate (`grep -c 'writeChatMcpConfig('` is 3) is unaffected.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** `grep -c 'writeChatMcpConfig('` → 3; `findExpandableEnvKeys` count → 2 (the import and the one call, inside `writeChatMcpConfig`); typecheck and lint clean.
- **Committed in:** `35f61f5`
- **Contract note for 05-05:** the shipped signature is `(name, spec, sdk)`, not the `(name, spec)` in 05-04's `<interfaces>` block.

**3. [Rule 1 - Bug] Two comment references silently inflated exact-count gates**

- **Found during:** Task 2's acceptance gate
- **Issue:** `grep -c 'toMcpConfigDocument'` returned **3** against an expected 2, and `grep -c 'planMcpCliRegistration'` likewise, because explanatory comments I had written named both symbols in prose. Both gates run over the **raw** file, not the comment-stripped view.
- **Fix:** Reworded both comments to describe the helper without carrying its identifier ("the projection helper in mcp-server-spec.ts", "a pure predicate in mcp-server-spec.ts"). The **code** was changed, not the gate — this is exactly the case task 3 warns about, and the failing number was a real signal that the file said the symbol more times than it used it.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** both counts now 2, with `grep -n` confirming one import line and one call line each.
- **Committed in:** `35f61f5`

**4. [Rule 1 - Bug] The `SpawnWithEnv` type declaration polluted Gate D's match set**

- **Found during:** Task 1's acceptance gate
- **Issue:** Gate D's allow-list filter printed `    env: Record<string, string>;` — the type declaration's member. The gate enumerates every place an environment is handed to a **child process**; a type annotation is not one, and leaving it there would have put a permanent false positive into a control that only matters if it stays clean.
- **Fix:** Rewrote the option type as `Record<"env", Record<string, string>> & { stdio: [...] }`. Identical type, no `env:` token, gate signal restored. Again the code moved, not the gate.
- **Files modified:** `packages/backend/src/index.ts`
- **Verification:** Gate D half 2 prints nothing; half 1 is 3.
- **Committed in:** `56405ee`

### Behaviour changes worth naming (not defects)

- **The Claude/Copilot session-state text on a missing token changed** from `"No Caido access token is available for this provider turn."` to the longer, actionable `NO_CAIDO_TOKEN_MESSAGE`. This is the plan's explicit instruction ("route its error through the existing `setSessionState` + `err` shape rather than inventing new text") — `requireMcpServerSpec` produces one message, and the session state now shows the one that tells the user what to do. The `err(...)` return text is unchanged at both sites.
- **`startMcpServer` and `refreshActiveMcpRuntime` no longer emit `"Failed to create MCP wrapper script."` / `"Settings were saved, but Drift failed to refresh the MCP wrapper. Restart the MCP server."`** There is no wrapper on that path to fail. A wrapper failure is now a per-CLI skip reason, which is the intended D-01 semantics.
- **`buildMcpRuntimeEnv` went from four call sites to two** (`requireMcpServerSpec` and the provider `runtimeEnv` at the launch-script site). The other two were the self-test env and the Copilot config env, both of which now flow through the spec. Plan 05-05 removes the launch-script one.

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing-critical, 1 bug-class ×2 gate-signal defects).
**Impact:** One contract change worth flagging to 05-05 (`writeChatMcpConfig`'s third parameter). No scope creep, no test edited or removed, and every acceptance criterion in all three tasks was **executed** with its output recorded rather than inferred from the diff.

## Every test file edit, with its reason

**None.** No test file was created, edited or removed by this plan. `provider-launch.test.ts` — the CMP-01 tripwire — is byte-unchanged, confirmed by `git diff --stat`. The suite total is identical to the end-of-wave-1 figure (290), which is the intended result for a plan that adds no tests.

One scratch test file (`packages/backend/src/copilot-parity.scratch.test.ts`) existed transiently to produce the byte-shape comparison above and was **deleted before the task-2 commit**; `git status --short` shows no such file and it appears in no commit.

## Known Stubs

None. Two intentionally temporary shapes existed *between* commits and both are gone:

- Task 1 left a local `writeMcpWrapper(...)` call immediately before each `tryRegisterMcpForProviders` call, each carrying a comment naming task 2 as its deleter. Task 2 deleted both when the guard moved inside the helper. Neither survives at HEAD (`grep -n 'writeMcpWrapper('` returns exactly the definition and the one guarded call).
- Task 1's Gate D allow-list carried a fourth entry (`env: buildMcpRuntimeEnv(`) for the Copilot writer that task 1 deliberately did not touch. At task 3 the three-entry form passes, which is the positive proof the Copilot conversion completed.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: informational | `packages/backend/src/index.ts` | `SpawnWithEnv` is a type assertion over `spawn`. It narrows rather than widens (the `env` property stays required and typed), but it is an unchecked bridge to a runtime capability the type surface denies. If Caido's typings ever gain `env`, delete the alias rather than keeping both. |

No new network endpoint, auth path, file-access pattern or schema change was introduced. The two token-bearing file classes are unchanged in kind and reduced in count.

## SEC-02 — raised stakes, for Phase 2's planner

Recorded per the plan's `<output>` requirement and threat row T-05-19.

`chatId` is interpolated directly into `mcp-${input.chatId}.json` and `copilot-mcp-${input.chatId}.json`, both written into the `0o700` runtime directory. **After this plan, Claude's file carries the literal Caido session token** (D-10) where before it carried only a path to a wrapper. Validating `sessionId`/`chatId` against a strict character set before path interpolation is **SEC-02, owned by Phase 2**, which is still `Not started`. Phase 5 does not absorb it — but the consequence of a traversal-shaped `chatId` moved from "writes a config pointing at a wrapper" to "writes the session token to an attacker-chosen path". Phase 2's planner should treat this as a severity bump, not a new finding.

## Issues Encountered

None that blocked. Every task's `<verify>` passed after the fixes recorded above, and no fix loop exceeded one attempt.

One thing worth carrying forward, because it is a live trap rather than a problem encountered: **this plan's central claim has no executable proof and cannot acquire one in this phase.** The four static gates are not paperwork around a tested change; they are the entire evidence base for RUN-01's wiring. If 05-06 or a reviewer weakens one of them to accommodate an implementation, the phase loses its only vehicle-independent control and nobody will notice until a Windows user reports it. Task 3's correction-versus-capitulation test exists for exactly that moment; two of this plan's four deviations were gate-signal defects caught by it working as intended.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for 05-05 (the provider launch conversion) and, after it, 05-06.**

- The signatures 05-05 is written against are shipped as listed above, with **one deviation**: `writeChatMcpConfig` is `(name, spec, sdk)`.
- `spawnWithEnv` and `readParentEnv` already exist for 05-05's `spawn(resolved, args, { env: buildSpawnEnv({ parentEnv, driftVars: runtimeEnv }), stdio: [...] })` conversion. Reuse them; a second cast or a second guarded `process.env` read would defeat the point.
- 05-05 must take Gate B's `.sh` count from **2 to 1** (`provider-launch-<sid>.sh` at `:3111`) and Gate C's chmod-spawn count from **2 to 1** (`writeLaunchScript`'s at `:810`), and must delete `launchCommand`/`launchArgs`, `lastSpawnArgs`'s composition, the `launchScriptPreview` debug dump and `finalize()`'s `if (launchCommand !== resolved)` branch **as one set** — a bare `rm(launchCommand)` left behind would delete the user's `claude` binary.
- **Open, and owned by 05-06:** V-6's expected chmod count (see Gate C), the V-21/V-22 ceiling paragraphs above (to be carried verbatim, not softened), and the SEC-02 note for Phase 2.
- **Open, and unclosable in this repo:** whether any of this works on a real Windows Caido install. That is PRV-01/Phase 7 and the original reporter's confirmation in Phase 9/10.

## Self-Check: PASSED

- `[ -f packages/backend/src/index.ts ]` — FOUND
- `[ -f README.md ]` — FOUND
- `[ -f .planning/phases/05-kill-shell-wrappers/05-04-SUMMARY.md ]` — FOUND
- `git log --oneline --all | grep 56405ee` — FOUND
- `git log --oneline --all | grep 35f61f5` — FOUND
- Plan `<verification>` re-run at close: typecheck exit 0; lint exit 0 at `--max-warnings 0`; vitest 290/290 green; all four gates re-executed with the output recorded above; `git diff --stat` touches only `index.ts` and `README.md`; the V-21 ceiling paragraph is present and states what is NOT proven before what is.

---
*Phase: 05-kill-shell-wrappers*
*Completed: 2026-08-20*
