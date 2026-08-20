---
phase: 05-kill-shell-wrappers
plan: 01
subsystem: infra
tags: [mcp, spawn, windows, llrt, pure-module, vitest, json-rpc, stdio]

# Dependency graph
requires:
  - phase: 04-platform-foundation
    provides: "platform.ts's buildSpawnEnv (the single parent-merge point) and the narrow Platform union"
  - phase: 03-ci-spike-prove-llrt-basics-on-windows
    provides: "the measured P0-ENV replace-not-merge result the L-4 rationale is built on"
provides:
  - "packages/backend/src/mcp-server-spec.ts — the phase keystone as a pure, importable module with all 8 exports"
  - "buildMcpServerSpec: the single source of command/args/env for every Drift-owned MCP spawn"
  - "buildMcpDriftVars: buildMcpRuntimeEnv reproduced key-for-key and order-for-order, with no module-state reads"
  - "toMcpConfigDocument: one spec, two config callers (Claude and Copilot)"
  - "planMcpCliRegistration: the win32 gate that makes the surviving POSIX wrapper unreachable"
  - "formatSpawnDebugLine and findExpandableEnvKeys: the D-11 and T-05-02 guards as pure predicates"
  - "mcp-server-spec.spawn.test.ts — HLT-01 and HLT-02 proven against the real assets/mcp-server.mjs"
affects: [05-04 config-and-spawn rewiring, 05-05 provider launch conversion, 05-02 windows-latest CI leg, 05-06 phase report]

actuals:
  tokens: 8552   # chars/4 over the three files actually changed (34,209 chars)
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure spec module with every input injected — the sixth-plus instance of the Phase 4 house pattern"
    - "Two deliberately distinct projections of one launch decision (merged env for spawn, drift dict for config documents)"
    - "Integration test that imports the PRODUCTION builder rather than reimplementing it"

key-files:
  created:
    - packages/backend/src/mcp-server-spec.ts
    - packages/backend/src/mcp-server-spec.test.ts
    - packages/backend/src/mcp-server-spec.spawn.test.ts
  modified: []

key-decisions:
  - "No requirement marked Complete — all eight exports have zero production call sites; requirements.ready-ids returned 0/5"
  - "MCP_TOOL_NAMES imported from ./mcp-runtime, not packages/shared/src as the plan's read_first stated"
  - "The spawn test's shared helper allows EVERY tool, mirroring runSharedMcpSelfTest, because mcp-server.mjs:613 filters tools/list by the allowlist"
  - "JsonRpcResponse declared in task 3 rather than task 1 — a type with no reader fails eslint --max-warnings 0"

patterns-established:
  - "Pattern 1: the L-4 rationale lives AT the env line, naming the Rust source, so the 'obvious' simplification is visibly forbidden"
  - "Pattern 2: a security predicate is proven by a falsifiability partner (the token VALUE asserted absent), not by inspection"
  - "Pattern 3: an integration test file states its own evidentiary ceiling in its header, in Phase 3's vehicle-caveat voice"

requirements-completed: []

coverage:
  - id: D1
    description: "buildMcpServerSpec returns the injected node executable as command, the script as the sole arg, and an env that is the parent block with driftVars overlaid (V-1, V-2)"
    requirement: "RUN-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpServerSpec returns the injected node executable as command and the script as the sole arg"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpServerSpec merges the parent environment, and a drift key of the same name overrides it"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildMcpDriftVars reproduces index.ts:1013 buildMcpRuntimeEnv key-for-key AND in insertion order, DRIFT_ALLOWLIST_ACTIVE included unconditionally (V-3, CMP-01, T-05-01)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#buildMcpDriftVars carries every DRIFT_ key mcp-server.mjs reads, in the shipping insertion order"
        status: pass
    human_judgment: false
  - id: D3
    description: "One spec, two config callers — toMcpConfigDocument projects driftVars (never the merged env) into the document Claude and Copilot both write (V-4, T-05-04)"
    requirement: "RUN-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#toMcpConfigDocument is one spec, two callers — Claude and Copilot receive deeply equal documents"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#toMcpConfigDocument carries the drift dict and NOT the parent-merged block into the config file"
        status: pass
    human_judgment: false
  - id: D4
    description: "The POSIX wrapper path is unreachable on win32 and the skip reason names the provider and Phase 7 verbatim; an unknown platform fails closed (V-8, V-9)"
    requirement: "CMP-01"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration makes the shared wrapper path unreachable on win32, before wrapperPath is even considered"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration skip reason names Phase 7 and the provider, verbatim"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#planMcpCliRegistration fails closed on an unknown platform rather than falling through to the POSIX arm"
        status: pass
    human_judgment: false
  - id: D5
    description: "The spawn debug line renders key NAMES only and can never carry a value; findExpandableEnvKeys names the keys Claude Code would expand (V-10, T-05-02, T-05-03)"
    requirement: "RUN-02"
    verification:
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#formatSpawnDebugLine never logs an env value — it takes key NAMES and renders them sorted"
        status: pass
      - kind: unit
        ref: "packages/backend/src/mcp-server-spec.test.ts#findExpandableEnvKeys names the keys Claude Code would expand inside a config env field"
        status: pass
    human_judgment: false
  - id: D6
    description: "The PRODUCTION buildMcpServerSpec spawns a real node against the real assets/mcp-server.mjs; --validate-auth returns {ok:true} and tools/list + get_environment + search_history all succeed over stdio JSON-RPC (V-12, V-13)"
    requirement: "HLT-01"
    verification:
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec spawn authenticates against a stub Caido via --validate-auth"
        status: pass
      - kind: integration
        ref: "packages/backend/src/mcp-server-spec.spawn.test.ts#mcp-server-spec spawn drives all three self-test methods over stdio JSON-RPC"
        status: pass
    human_judgment: false
  - id: D7
    description: "The env contract UNDER LLRT, where Rust's make_envp performs no libuv back-fill (V-22) — the property the merge exists to protect"
    requirement: "RUN-02"
    verification: []
    human_judgment: true
    rationale: "The Node vehicle back-fills eleven required_vars on Windows, so a regression to a bare drift-only env dict passes every test in this plan. The mitigation is a static gate over index.ts's spawn sites, which lands with the wiring in 05-04/05-05 — nothing this plan produced can prove it."

duration: 9min
completed: 2026-08-20
status: complete
---

# Phase 5 Plan 1: MCP Server Spec Module Summary

**The phase keystone as an eight-export pure module — `buildMcpServerSpec` merges the parent environment through `buildSpawnEnv`, `buildMcpDriftVars` reproduces `buildMcpRuntimeEnv` order-for-order, and the production builder's output spawns the real `assets/mcp-server.mjs` to `{ok:true}` and through all three self-test methods.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-20T12:32:33Z
- **Completed:** 2026-08-20T12:41:00Z
- **Tasks:** 3
- **Files modified:** 3 (all created)

## Accomplishments

- `packages/backend/src/mcp-server-spec.ts` exists with all eight exports, **zero I/O, zero module-state reads and exactly one import** (`./platform`). `grep -cE '^import'` returns 1 and `grep -c 'export function\|export type'` returns 8 — both executed, not inferred.
- The **production** `buildMcpServerSpec` is what the integration test spawns. `--validate-auth` returns `{ok:true}` against a loopback stub (HLT-01), and the same spec drives `tools/list`, `get_environment` and `search_history` over stdio JSON-RPC (HLT-02). There is exactly **one** `buildMcpServerSpec(` call site in that file, so no second copy of the spec logic can void the evidence.
- The exported surface shipped **byte-identical to the plan's `<interfaces>` contract** — plans 05-04 and 05-05 are written against these names and shapes and need no adjustment.
- Suite **263 → 278 tests / 31 files / 0 failures**. `pnpm -r typecheck` exits 0 and `pnpm lint` exits 0 at `--max-warnings 0`. `index.ts`, `platform.ts` and `provider-launch.ts` are byte-untouched (`git diff --stat` empty).

## Exported signatures as shipped

These are the contract 05-04 and 05-05 consume. Copied from the source, not from the plan:

```ts
export type McpServerSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
  driftVars: Record<string, string>;
};

export function buildMcpDriftVars(input: {
  caidoUrl: string;
  caidoToken: string;
  contextFilePath: string | undefined;
  allowedToolNames: string[];
  confirmationRequiredToolNames: string[];
  confirmSensitiveActions: boolean;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Record<string, string>;

export function buildMcpServerSpec(input: {
  nodeExecutable: string;
  mcpScriptPath: string;
  driftVars: Record<string, string>;
  parentEnv: Record<string, string | undefined>;
}): McpServerSpec;

export function toMcpConfigDocument(spec: McpServerSpec): {
  mcpServers: {
    drift: { command: string; args: string[]; env: Record<string, string> };
  };
};

export type McpCliRegistration =
  | { kind: "Register"; wrapperPath: string }
  | { kind: "Skip"; reason: string };

export function planMcpCliRegistration(input: {
  platform: Platform | undefined;
  cli: "gemini" | "codex";
  wrapperPath: string | undefined;
}): McpCliRegistration;

export function formatSpawnDebugLine(input: {
  command: string;
  args: string[];
  injectedKeys: string[];
}): string;

export function findExpandableEnvKeys(
  driftVars: Record<string, string>,
): string[];
```

The two win32 skip reasons, asserted with `toBe` on the whole sentence:

- `Drift MCP is not yet supported for Gemini on Windows (Phase 7).`
- `Drift MCP is not yet supported for Codex on Windows (Phase 7).`

## Measured suite count

| | Test files | Tests | Failures |
|---|---|---|---|
| Baseline, measured immediately before task 1 | 29 | 263 | 0 |
| After task 1 | 31 | 267 | 0 |
| After task 2 | 31 | 277 | 0 |
| **After task 3 (final)** | **31** | **278** | **0** |

No existing test was edited, removed or made obsolete. `provider-launch.test.ts` — the CMP-01 tripwire — is byte-unchanged.

## The evidentiary ceiling

Written verbatim into `mcp-server-spec.spawn.test.ts`'s header, and repeated here because 05-06's report must carry it and a reader must not be able to inflate it:

> It proves the spec, the server and the spawn contract.
>
> It does NOT prove `index.ts`'s WIRING of them: `index.ts` cannot be imported under vitest (no `caido:plugin` alias), so no test here executes a single line of the orchestrator that will call `buildMcpServerSpec` in production. Nor is a green run here evidence that a real Claude CLI connects to Drift on Windows — that is PRV-01 and it belongs to Phase 7. And the environment contract it exercises is the NODE one: libuv back-fills eleven `required_vars` on Windows, so a regression to a bare drift-only `env` dict would pass every assertion in this file while breaking under Caido's LLRT (finding L-4). The gate for that is static, not this file.

## Task Commits

1. **Task 1 (tracer): end-to-end — the production spec spawns the real MCP server and authenticates** — `8b0e7dc` (feat)
2. **Task 2 (tdd): config projection, win32 registration predicate, debug formatter, expansion guard** — `0f60624` (feat, tests written RED first: 10 failing → 10 passing)
3. **Task 3: expand the spawn test to the three self-test methods (HLT-02)** — `1cc9a08` (test)

**Tracer feedback gate:** after task 1's commit the tracer `<verify>` was re-run end-to-end before any expansion task, and passed (2 files / 4 tests / 0 failures).

## Files Created/Modified

- `packages/backend/src/mcp-server-spec.ts` — the eight-export pure keystone. Zero I/O, one import.
- `packages/backend/src/mcp-server-spec.test.ts` — 13 unit cases covering V-1…V-4 and V-8…V-10.
- `packages/backend/src/mcp-server-spec.spawn.test.ts` — 2 integration cases covering V-12 and V-13 against the real server.

## Decisions Made

- **No requirement was marked Complete.** All eight exports have **zero production call sites**: `index.ts` still calls `writeMcpWrapper` and `buildMcpRuntimeEnv`, and nothing in it imports `mcp-server-spec`. `requirements.ready-ids` independently returned **0/5** — plans 05-03, 05-04, 05-05 and 05-06 all declare overlapping IDs and have no SUMMARY yet. This is the eleventh consecutive plan in this project making the "building the instrument is not shipping the behaviour" call, after Phase 3's CI-02 and Phase 4's 04-01…04-10.
- **`spec.env` and `spec.driftVars` are two deliberately distinct projections and must not be unified.** The spawn path MUST merge (finding L-4); the config path must NOT, because the external CLI already gives its own child the parent environment and merging would write the user's whole environment into a token-bearing `0o600` JSON file (T-05-04). The decision is commented at `toMcpConfigDocument`'s `env` line so the "obvious" unification is visibly a forbidden one, and a dedicated case asserts a parent-only key reaches `spec.env` but not the document.
- **`planMcpCliRegistration` branches platform-first.** An unknown platform and `win32` both `Skip` **before** `wrapperPath` is considered, so there is no input at all on which a win32 host reaches the wrapper arm — a stronger property than "win32 usually skips", and the one D-02's tripwire needs.
- **`formatSpawnDebugLine` has no parameter through which a value could arrive.** That is the design, not a discipline. The rejected alternative (a redaction regex over the merged env) is recorded at the function with its reason: it fails **open**, protecting only the keys someone thought to enumerate.
- **The `${` needle in `findExpandableEnvKeys` is assembled from two string parts** so the source never carries a literal expansion sequence a downstream tool could mangle — the same class of hazard as 04-07's NUL byte, applied preventively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `MCP_TOOL_NAMES` is not exported from `packages/shared/src/`**

- **Found during:** Task 3
- **Issue:** The task's `read_first` pointed at `packages/shared/src/` for "the `MCP_TOOL_NAMES` export used to assert tool discovery". `grep -rn 'MCP_TOOL_NAMES' packages/` returns exactly one definition, and it is `packages/backend/src/mcp-runtime.ts:19` (`MCP_TOOL_DEFINITIONS.map((tool) => tool.name)`). `shared` exports the *definitions*, not the names.
- **Fix:** Imported `MCP_TOOL_NAMES` from `./mcp-runtime`. The plan's actual requirement — "import it rather than restating the list, so a shared-constant change cannot silently narrow the assertion" — is fully satisfied, since `mcp-runtime.ts`'s constant is derived from `shared`'s `MCP_TOOL_DEFINITIONS`. It is also the same constant `index.ts:1954`'s real self-test compares against.
- **Files modified:** `packages/backend/src/mcp-server-spec.spawn.test.ts`
- **Verification:** `grep -c 'MCP_TOOL_NAMES'` returns 3; the case asserts all 18 names are discovered.
- **Committed in:** `1cc9a08`

**2. [Rule 3 - Blocking] A type declared in task 1 with its first reader in task 2/3 fails `--max-warnings 0`**

- **Found during:** Task 1
- **Issue:** The transport-test skeleton the plan says to copy "wholesale" carries a `JsonRpcResponse` type, but task 1's single `--validate-auth` case parses a `{ok:boolean}` and never uses it. `tsc` does not flag an unused type alias, but `@typescript-eslint/no-unused-vars` does, and `pnpm lint` runs at `--max-warnings 0` — so task 1 failed its own acceptance gate with `'JsonRpcResponse' is defined but never used`.
- **Fix:** Removed the type from the task-1 tree and reinstated it in task 3, where the JSON-RPC drain loop reads it. This is 04-09's `stdoutDroppedChars` and 04-08's `probeRuntime`/`genUUID` lesson recurring: this repo's lint configuration makes a forward-declared binding a hard build failure, so a task boundary must not strand one.
- **Files modified:** `packages/backend/src/mcp-server-spec.spawn.test.ts`
- **Verification:** `pnpm lint` exits 0 at every commit in this plan, task 1 included.
- **Committed in:** `8b0e7dc` (removal) and `1cc9a08` (reinstatement)

**3. [Rule 2 - Missing Critical] Task 1's helper allowlist made task 3's tool-discovery assertion unsatisfiable**

- **Found during:** Task 3
- **Issue:** Task 1's spec helper set `allowedToolNames: ["get_environment", "search_history"]`. With `DRIFT_ALLOWLIST_ACTIVE=1`, `mcp-server.mjs:613` **filters `tools/list` by the allowlist**, so `tools/list` would have returned 2 tools and task 3's mandated "contains every name in `MCP_TOOL_NAMES`" assertion could never pass. Widening the assertion instead would have been the wrong fix: a narrowed allowlist makes a server that genuinely lost tools indistinguishable from a correctly configured one.
- **Fix:** Widened the single shared helper to `allowedToolNames: [...MCP_TOOL_NAMES]`, mirroring `runSharedMcpSelfTest` (`index.ts:1928`), which builds a policy with all six permission groups enabled. `--validate-auth` is indifferent to the allowlist, so task 1's case is unaffected, and the plan's one-construction-site rule is preserved (`grep -c 'buildMcpServerSpec('` is still 1).
- **Files modified:** `packages/backend/src/mcp-server-spec.spawn.test.ts`
- **Verification:** Both spawn cases green; the reason is commented at the widened field so it is not "simplified" back.
- **Committed in:** `1cc9a08`

**4. [Rule 3 - Blocking] Task 1's prose and its own acceptance criteria disagreed on case count**

- **Found during:** Task 1
- **Issue:** The `<action>` said to create `mcp-server-spec.test.ts` "with only the two tracer-level unit cases in this task", while the same task's `<acceptance_criteria>` demanded a key-order parity assertion — `expect(Object.keys(vars)).toEqual([...])` — *inside `mcp-server-spec.test.ts`*, which is a third case.
- **Fix:** Shipped three cases in task 1, placing the key-order assertion under the title `carries every DRIFT_ key…` that task 2's `-t` gate would need anyway. The gate is what is executed, so the gate wins over the prose.
- **Files modified:** `packages/backend/src/mcp-server-spec.test.ts`
- **Verification:** Task 1's key-order criterion and task 2's `-t "carries every DRIFT_ key"` both pass.
- **Committed in:** `8b0e7dc`

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical)
**Impact on plan:** No scope creep and no contract change. The exported surface is byte-identical to the plan's `<interfaces>` block, `index.ts`/`platform.ts`/`provider-launch.ts` are untouched, and every one of the plan's own acceptance criteria was **executed** rather than inferred from the diff.

## Issues Encountered

None. Every task's `<verify>` passed on its first run, and no fix loop exceeded one attempt.

One thing worth recording for 05-04 and 05-05, because it is a live trap rather than a problem encountered: the spawn integration test is the most convincing artifact this phase will produce and it **cannot** catch a bare-dict `env` regression (Pitfall 4 / V-22). The static gate over `index.ts`'s spawn sites is not optional garnish for those plans — it is the only vehicle-independent evidence the phase will have for its central claim.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

**Ready for 05-02 (the `windows-latest` CI leg) and, in wave 2, for 05-04 and 05-05.**

- The API those plans are written against is shipped exactly as specified. No signature adjustment is needed.
- `mcp-server-spec.spawn.test.ts` is the file 05-02's Windows leg will execute for V-16/V-17; it uses only `os.tmpdir()`, `process.execPath` and `fileURLToPath(new URL(...))`, so it carries no POSIX assumption of its own. Its timeout constant is already 15000 ms for Windows process-creation cost.
- **Open, and owned by 05-04/05-05:** every export here still has zero production call sites. `RUN-01`, `RUN-02`, `HLT-01`, `HLT-02` and `CMP-01` remain Pending, confirmed mechanically by `requirements.ready-ids` returning 0/5.
- **Open, and owned by 05-06:** the three probe-surfaced edges the plan routes to the report task, plus the evidentiary-ceiling sentence quoted above.

## Self-Check: PASSED

- `[ -f packages/backend/src/mcp-server-spec.ts ]` — FOUND
- `[ -f packages/backend/src/mcp-server-spec.test.ts ]` — FOUND
- `[ -f packages/backend/src/mcp-server-spec.spawn.test.ts ]` — FOUND
- `git log --oneline --all | grep 8b0e7dc` — FOUND
- `git log --oneline --all | grep 0f60624` — FOUND
- `git log --oneline --all | grep 1cc9a08` — FOUND
- Plan `<verification>` re-run at close: suite 278/278 green; `pnpm -r typecheck` exit 0; `pnpm lint` exit 0; `git diff --stat` over `index.ts`/`platform.ts`/`provider-launch.ts` empty; `grep -cE '^import' mcp-server-spec.ts` = 1.

---
*Phase: 05-kill-shell-wrappers*
*Completed: 2026-08-20*
