# Phase 8: Process Lifecycle — Pattern Map

**Mapped:** 2026-08-24
**Files analyzed:** 8 (5 created, 3 modified)
**Analogs found:** 8 / 8 (7 exact, 1 partial — see § *No Analog Found* for the one sub-pattern with no precedent)

Sources for the file list: `08-RESEARCH.md` § *Architecture Patterns → The module split*, § *Code Examples*, § *Current Kill Surface*, § *Validation Architecture*; `08-VALIDATION.md` § *Wave 0 Requirements* + § *Per-Task Verification Map*. There is no `08-CONTEXT.md`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/backend/src/kill-plan.ts` (new) | utility (pure decision module) | transform (inputs → plan) | `packages/backend/src/spawn-plan.ts` | **exact** |
| `packages/backend/src/kill-plan.test.ts` (new) | test (unit, pure) | transform | `packages/backend/src/spawn-plan.test.ts` | **exact** |
| `packages/backend/src/kill-tree.posix.test.ts` (new) | test (integration, real spawn) | event-driven / process | `packages/backend/src/mcp-server-spec.spawn.test.ts` (skeleton) + `spawn-plan.win32.test.ts` (skipIf + runtime fixture) | **exact** |
| `packages/backend/src/kill-tree.win32.test.ts` (new) | test (integration, platform-gated) | event-driven / process | `packages/backend/src/spawn-plan.win32.test.ts` | **exact** |
| `packages/backend/src/kill-tree.win32.gate.test.ts` (new) | test (static, guards the CI gate) | file-I/O (reads `ci.yml`) | `packages/backend/src/spawn-plan.win32.gate.test.ts` | **exact** |
| `packages/backend/src/index.ts` (modified) | orchestrator (I/O + module state) | request-response + process lifecycle | itself — `spawnAndWait` / provider-spawn block (`index.ts:4253-4290`), `SpawnWithEnv` (`index.ts:1993-2011`), `getComspec` (`index.ts:589-592`) | **exact (self-analog)** |
| `packages/backend/src/index.source.test.ts` (modified) | test (static source scan) | transform | itself — the `buildSpawnPlan` / `classifyMcpRemoveExit` blocks | **exact (self-analog)**; the *line-ordering* assertion has **no precedent** |
| `.github/workflows/ci.yml` (modified) | config (CI) | batch | `ci.yml:225-252` `Gate: the win32 spawn-plan suite actually ran` | **exact** |

Also implied by RESEARCH and worth the planner's attention, though not new files:
- `packages/backend/src/platform.ts` — **read-only analog**, not modified. `Platform` is imported from it (`platform.ts:26`).
- `packages/backend/CLAUDE.md`-referenced pure-helper split table in the **root `CLAUDE.md`** gains a sixth row (`kill-plan.ts`). Documentation edit, named in RESEARCH § *The module split*.

---

## Pattern Assignments

### `packages/backend/src/kill-plan.ts` (utility, transform)

**Analog:** `packages/backend/src/spawn-plan.ts` — same role (pure plan-builder consumed by an `index.ts` spawn), same data flow, most recent precedent (Phase 7).

**Imports pattern** — exactly one import, and it must be `./platform` (`spawn-plan.ts:1-22` states the rule; the import line itself):
```ts
import { type Platform, WINDOWS_EXECUTABLE_EXTENSIONS } from "./platform";
```
For `kill-plan.ts` only the type is needed: `import { type Platform } from "./platform";`. `grep -cE '^import'` over the file must return **1** — the module header claims it and `noUnusedLocals` + `--max-warnings 0` enforce it.

**Module-header pattern** (`spawn-plan.ts:1-29`) — four mandatory paragraphs, in this order:
```ts
// The Windows spawn plan: given a resolved command, its argv and the host
// platform, decide WHAT file to hand `spawn`, WITH which argument array, and
// whether the runtime must be told the arguments are already escaped. Three
// properties are load-bearing here and all three are mechanically checkable.
// This module performs ZERO I/O; it reads no module state; and it carries
// exactly ONE import statement — `grep -cE '^import'` over this file returns 1,
// which is the machine form of both claims at once. `platform` and `comspec`
// are INJECTED parameters, never read from `os`, `process` or the environment.
//
// The one import is `./platform`, and it is here for exactly two reasons, ...
// Deliberately NOT imported:
// `path` (the command already arrives OS-native from `resolveCommand`, and
// `path` resolves to its POSIX flavour on the Linux CI runner where it would
// corrupt a Windows path), `os`, `process` and `child_process`. ...
//
// WHY THIS LIVES OUTSIDE `index.ts`. `index.ts` is ~4,900 lines, declares no
// `caido:plugin` alias for vitest and therefore cannot be imported by any test
// this project can run — so escaping logic left inside it is unverifiable by
// construction. ...
```
RESEARCH § *Module header* already drafts the `kill-plan.ts` wording (`08-RESEARCH.md:600-621`). Note `spawn-plan.ts` says "~4,900 lines"; the measured figure now is **5,240** — use the current number.

**Return-shape pattern** (`spawn-plan.ts:237-243`) — flat type + the "three projections travel together" comment:
```ts
// One decision, three projections — modelled on `McpServerSpec`'s shape. `file`
// and `args` are what `spawn` receives; `windowsVerbatimArguments` is what the
// runtime must be told so it does NOT re-quote a line this module has already
// escaped. All three travel together precisely so a call site cannot take two of
// them and forget the third (Pitfall B).
export type SpawnPlan = {
  file: string;
  args: string[];
  windowsVerbatimArguments: boolean;
};
```
`kill-plan.ts` diverges deliberately: it needs the `kind`-keyed **discriminated union** CLAUDE.md names as the house convention, because termination has a real "nothing to do" arm. Shape from `08-RESEARCH.md:625-628`:
```ts
export type KillTreePlan =
  | { kind: "none"; reason: "no-pid" }
  | { kind: "spawn"; file: string; args: string[]; windowsVerbatimArguments: boolean };
```

**Branch-order pattern** (`spawn-plan.ts:245-270`) — the contract-bearing comment plus non-win32-first:
```ts
// The ONLY way a resolved provider binary becomes a spawn on this codebase.
//
// Branch order is part of the contract and the non-win32 arm is written FIRST.
export function buildSpawnPlan(input: { ... }): SpawnPlan {
  // Non-win32, `undefined` INCLUDED: on macOS and Linux the spawn must be
  // byte-identical to what shipped before this module existed ... and that
  // byte-identity is CMP-01's obligation (Pitfall F, the POSIX inverse
  // regression). `undefined` (pre-probe, or a platform `normalizePlatform`
  // refused to recognise) takes this arm ...
  if (input.platform !== "win32") { ... }
```
Copy the *shape* but invert the ordering rule per RESEARCH: **refusal arms first**, then `win32`, then POSIX-including-`undefined` as the fall-through.

**`%SystemRoot%` join pattern — copy, do not import** (`platform.ts:255-294`, `getWhichCommand`):
```ts
  if (input.platform === "win32") {
    let systemRoot = "";
    for (const name of ["SystemRoot", "SYSTEMROOT"]) {
      const value = input.env[name]?.trim();
      if (value === undefined || value === "") continue;
      systemRoot = value;
      break;
    }
    // Strip every trailing separator before joining, so a root that already
    // carries one does not produce a doubled separator. ... a segment is being
    // APPENDED here rather than a root preserved, so reducing "D:\" to "D:"
    // yields the correct "D:\System32\…" instead of a doubled separator.
    let root = systemRoot;
    while (root.length > 0) {
      const last = root[root.length - 1];
      if (last !== "\\" && last !== "/") break;
      root = root.slice(0, -1);
    }
    // Explicit string logic with the win32 separator spelled here, not joinPath ...
    if (root === "") return { command: "where.exe", args };
    return { command: `${root}\\System32\\where.exe`, args };
  }
  return { command: "which", args };
```
Two divergences the planner must decide and record: `kill-plan.ts` takes a **`systemRoot?: string` scalar**, not an `env` record (RESEARCH § *Code Examples*), so the dual-casing loop moves to the `index.ts` call site (`readParentEnv().SystemRoot ?? readParentEnv().SYSTEMROOT`). The dual-casing read is the reason `getWhichCommand` takes `env` — if the planner keeps the scalar signature, the casing fallback is untested by `kill-plan.test.ts` and must be asserted at the `index.source.test.ts` call site instead.

**Fallback-literal pattern** (`spawn-plan.ts` `DEFAULT_COMSPEC`): a SCREAMING_SNAKE_CASE exported constant for the bare name, with the "reading the environment is the caller's job" note. Mirror as `DEFAULT_TASKKILL = "taskkill.exe"`.

**Sibling pure-decision export** — `shouldDetachProviderSpawn(platform)`. Nearest analog is `platform.ts`'s `getWhichCommand` (a boolean/scalar decision derived from an injected `platform`); RESEARCH drafts the body and its justifying comment at `08-RESEARCH.md:636-645`.

---

### `packages/backend/src/kill-plan.test.ts` (test, unit)

**Analog:** `packages/backend/src/spawn-plan.test.ts`

**Imports + preamble pattern** (`spawn-plan.test.ts:1-24`):
```ts
import { describe, expect, it } from "vitest";

import { buildSpawnPlan, CMD_INTERPRETED_EXTENSIONS, ... } from "./spawn-plan";

// Every input below is passed as a literal, which is the entire point of
// `spawn-plan.ts` being pure: the module reads no `process.env`, no `os` and no
// module-level singleton, so the whole cmd.exe contract — including the parts
// that only matter on Windows — is provable on the Linux CI runner. ...
//
// The describe/it titles are a CONTRACT with 07-VALIDATION.md, which addresses
// each row by `-t "<name>"` — renaming one silently unhooks a requirement from
// its verification.
```
The last paragraph is load-bearing for Phase 8: `08-VALIDATION.md`'s Per-Task map addresses rows by behaviour text, so the `describe`/`it` titles must be chosen to match and then never renamed.

**Platform-loop pattern** (`spawn-plan.test.ts:40-60`) — the exact vehicle for VALIDATION's "`undefined` platform takes the POSIX arm (CMP-01)" row:
```ts
describe("buildSpawnPlan — POSIX passthrough (CMP-01)", () => {
  it("returns the command and argv unchanged on darwin, linux and an undefined platform", () => {
    for (const platform of ["darwin", "linux", undefined] as const) {
      const plan = buildSpawnPlan({ command: "/usr/local/bin/claude", args, platform });
      expect(plan.file).toEqual("/usr/local/bin/claude");
      ...
      expect(plan.windowsVerbatimArguments).toBe(false);
    }
  });
```
Reuse verbatim for both `buildKillTreePlan`'s POSIX arm and `shouldDetachProviderSpawn`.

**Windows-literal fixture pattern** (`spawn-plan.test.ts:26-30`) — Windows paths as module constants with the "what npm actually produces" justification:
```ts
const GLOBAL_SHIM = "C:\\Users\\jo\\AppData\\Roaming\\npm\\claude.cmd";
const NATIVE_EXE  = "C:\\Users\\jo\\AppData\\Local\\Programs\\claude\\claude.exe";
```
`kill-plan.test.ts` equivalent: `const SYSTEM_ROOT = "C:\\Windows";` plus a trailing-separator variant (`"C:\\Windows\\"`) and a bare-drive variant (`"D:\\"`).

---

### `packages/backend/src/kill-tree.posix.test.ts` (test, integration)

**Analogs (two, combined):** `mcp-server-spec.spawn.test.ts` for the skeleton; `spawn-plan.win32.test.ts` for the `skipIf` gate and the runtime-built fixture.

**Preamble pattern — "what this proves and what it does not"** (`mcp-server-spec.spawn.test.ts:12-39`):
```ts
// D-08's integration proof, and the only place in this phase where the spec is
// executed rather than inspected. It imports the SAME `buildMcpServerSpec` that
// `index.ts` calls ... and deliberately no local re-derivation of `command`,
// `args` or `env`. A second copy of the spec-building logic inside this file
// would make the test agree with itself instead of with production, which is
// the whole point of sharing the builder.
//
// The skeleton (temp dir + `afterEach` rm, ... the timeout-plus-SIGKILL guard)
// is lifted from `mcp-server.transport.test.ts`, which already runs
// cross-platform via `os.tmpdir()` and `process.execPath`.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — read this before citing a green
// run of it. ...
// It does NOT prove `index.ts`'s WIRING of them ...
```
Phase 8's version must additionally carry the **LLRT vehicle caveat** drafted at `08-RESEARCH.md` § *The POSIX behavioural test* (Node's `setsid()` vs LLRT's `setpgid(0,0)`).

**Temp-dir + cleanup pattern** (`spawn-plan.win32.test.ts:78-84`):
```ts
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
```

**Runtime-built fixture pattern** (`spawn-plan.win32.test.ts:90-131`) — nothing committed; the test writes a `.mjs` under `mkdtemp` and drives it with `process.execPath`:
```ts
// Built at runtime — this repo commits no fixture files (the convention
// `command-resolution.test.ts` already follows for its version-manager trees).
async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "drift-spawn-plan-"));
  tempDirs.push(root);
  const dir = path.join(root, "sh im (x86)");
  await mkdir(dir, { recursive: true });
  const scriptPath = path.join(dir, "report-argv.mjs");
  await writeFile(scriptPath, [ 'import { writeFileSync } from "node:fs";', ... ].join("\n"), "utf-8");
  ...
}
```
Phase 8's fixture is a *fork-a-grandchild* script (parent `.mjs` spawns a child `.mjs`, both idle, parent reports both pids). Prefix `drift-kill-tree-`.

**Timeout + never-hang pattern** (`spawn-plan.win32.test.ts:53-58, 135-157`):
```ts
// One constant, referenced by every case, so a future raise cannot apply to one
// of them only. 15 s rather than the transport test's 5 s because Windows
// runners are materially slower ...
const SPAWN_TIMEOUT_MS = 15000;

async function runToCompletion(file, args, windowsVerbatimArguments): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(file, args, { stdio: ["ignore","pipe","pipe"], windowsVerbatimArguments });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("spawn did not exit within the timeout")); }, SPAWN_TIMEOUT_MS);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
}
```
Per-`it` timeout is passed as the third argument to `it(...)`, e.g. `it("…", async () => {...}, SPAWN_TIMEOUT_MS)`.

**Gate pattern** (`spawn-plan.win32.test.ts:163`): `describe.skipIf(process.platform !== "win32")(...)`. Phase 8's POSIX file inverts it: `describe.skipIf(process.platform === "win32")(...)`.

**Falsifiability-partner pattern** (`spawn-plan.win32.test.ts:188-211`) — the "refuses a DIRECT spawn … the falsifiability leg" case. Phase 8's equivalent is the CONTROL case: no `detached` + single-pid kill → grandchild **survives**. `08-RESEARCH.md` drafts it verbatim.

**Never re-derive production logic** — the test must call `buildKillTreePlan(...)` and spawn `plan.file, plan.args`, never a locally written argv. Stated as a rule at `mcp-server-spec.spawn.test.ts:12-19`.

---

### `packages/backend/src/kill-tree.win32.test.ts` (test, integration, platform-gated)

**Analog:** `packages/backend/src/spawn-plan.win32.test.ts` — same file shape, same gate, same purpose.

Reuse everything above (`tempDirs`/`afterEach`, `SPAWN_TIMEOUT_MS`, `runToCompletion`, `describe.skipIf(process.platform !== "win32")`) plus:

**Measurement-recording pattern** (`spawn-plan.win32.test.ts:213-232` and the `spawn-plan.ts:47-62` header block) — the house way of writing down a measured, previously-unknown value with its run URLs:
```ts
// THIS CASE ASSERTED THE OPPOSITE UNTIL A REAL RUNNER SAID OTHERWISE, and
// the original expectation is left described here because deleting it
// would hide the measurement. 07-RESEARCH.md's open question A1 predicted
// that escaping depth would DISCRIMINATE ... Run 32563348727 measured that BOTH
// depths round-trip the full hazard set byte-identically on windows-latest.
```
and, in the module header:
```
//   RED   https://github.com/six2dez/drift/actions/runs/32563348727
//         job `Verify (Windows)` = failure, step `Test` = failure. The
//         falsification, kept because it is the evidence.
//   GREEN https://github.com/six2dez/drift/actions/runs/32563543158
```
Phase 8 uses this for `taskkill`'s **undocumented exit code on an already-dead pid**: record the measurement and its run URL; do not branch on it.

---

### `packages/backend/src/kill-tree.win32.gate.test.ts` (test, static)

**Analog:** `packages/backend/src/spawn-plan.win32.gate.test.ts` (74 lines) — copy structurally in full, changing only the suite path and gate-step name.

**Imports + repo-root pattern** (`spawn-plan.win32.gate.test.ts:1-3, 30-36`):
```ts
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../../", import.meta.url);
const ciWorkflow = readFileSync(
  fileURLToPath(new URL(".github/workflows/ci.yml", repoRoot)),
  "utf-8",
);

const WIN32_SUITE_PATH = "packages/backend/src/spawn-plan.win32.test.ts";
```

**The five cases** (`spawn-plan.win32.gate.test.ts:38-73`) — copy all five, one for one:
```ts
describe("the windows CI leg asserts the win32 spawn-plan suite ran (WR-08)", () => {
  it("carries a gate step for it", () => {
    expect(ciWorkflow).toContain("Gate: the win32 spawn-plan suite actually ran");
  });

  it("re-runs the suite under the JSON reporter, which is what makes the count readable", () => {
    expect(ciWorkflow).toContain(WIN32_SUITE_PATH);
    expect(ciWorkflow).toContain("--reporter=json");
  });

  it("fails on a skipped, uncollected or partly-failing run", () => {
    expect(ciWorkflow).toContain("pending > 0");
    expect(ciWorkflow).toContain("total === 0");
    expect(ciWorkflow).toContain("passed !== total");
  });

  it("names a suite path that exists — a rename must not leave the gate pointing at nothing", () => {
    expect(existsSync(fileURLToPath(new URL(WIN32_SUITE_PATH, repoRoot)))).toBe(true);
  });

  it("still needs the gate: the suite is platform-gated and skips silently elsewhere", () => {
    const suite = readFileSync(fileURLToPath(new URL(WIN32_SUITE_PATH, repoRoot)), "utf-8");
    expect(suite).toContain('describe.skipIf(process.platform !== "win32")');
  });
});
```
**Caveat pattern** to carry over verbatim in spirit (`spawn-plan.win32.gate.test.ts:24-28`): *"it asserts the gate's PRESENCE and that it points at a file that exists. It does not run the gate."* Plus the "this suite runs on every platform, which is the point — the Linux legs are where a deleted gate gets noticed" justification.

**Naming collision warning for the planner:** if both gate steps use the literal `--reporter=json` and the same three arm strings, the two gate tests' `toContain` assertions will pass against *each other's* step. Make the Phase 8 step name distinct (`Gate: the win32 kill-tree suite actually ran`) and assert that exact string.

---

### `packages/backend/src/index.ts` (orchestrator, modified)

**Analog:** itself. Five patterns to copy from within the file.

**Section-header pattern (C-10)** — ASCII box headers delimit new top-level sections; e.g. `// ── Process lifecycle (LIF-01 / LIF-02) ─────────────────────────────`.

**`SpawnWithEnv` required-option pattern** (`index.ts:1993-2011`) — this is the exact precedent for adding `detached` as a **required** member:
```ts
// `windowsVerbatimArguments` is REQUIRED, not optional, and that is the whole
// point of declaring it here (Phase 7, PRV-02). ... an OPTIONAL flag is the
// precise shape it describes: a default that is silently wrong at the one site
// that forgot it. Required makes forgetting a compile error and forces every
// call site to state its answer out loud (T-07-03).
type SpawnWithEnv = (
  command: string,
  args: string[],
  options: Record<"env", Record<string, string>> & {
    stdio: ["pipe", "pipe", "pipe"];
    windowsVerbatimArguments: boolean;
  },
) => ChildProcessWithoutNullStreams;
const spawnWithEnv = spawn as unknown as SpawnWithEnv;
```
Add `detached: boolean;` to that intersection. Three call sites must then answer: `index.ts:2141` (`callMcpMethod`) → `false`, `index.ts:2641` (`spawnAndWait`) → `false`, `index.ts:4259` (provider spawn) → `shouldDetachProviderSpawn(host?.platform)`.

**Plan-consumed-never-hardcoded pattern** (`index.ts:4253-4269`), the exact block Phase 8 edits:
```ts
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawnWithEnv(spawnPlan.file, spawnPlan.args, {
          env: buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars }),
          stdio: ["pipe", "pipe", "pipe"],
          // Taken from the plan, never hardcoded: it is true exactly when the
          // plan assembled and escaped a cmd.exe command line itself, and false
          // on every direct spawn (all of POSIX, and a Windows `.exe`).
          windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments,
        });
      } catch (e) {
        const message = `Spawn error: ${String(e)}`;
        ...
      }
```
The `try`/`catch` **around the spawn call itself** (not an `error` handler) is the C-8 / Pitfall 9 pattern — copy it into `killTree`.

**Environment-read-at-the-boundary pattern** (`index.ts:589-592`) — the pure module never reads env; a one-line `index.ts` helper does:
```ts
// The value is handed to a spawn and never rendered: readParentEnv's contract
function getComspec(): string { ... }
  return selectComspec({ env: readParentEnv(), platform: host?.platform });
```
Mirror for `SystemRoot`: a `getSystemRoot()` one-liner over `readParentEnv()` (handling both casings), fed into `buildKillTreePlan`. Doing so also makes the casing fallback assertable from `index.source.test.ts` in the same shape as the `selectComspec` assertion.

**The five in-scope call sites to rewire** (`08-RESEARCH.md` § *Current Kill Surface* rows 4–8), current text at each:
- `index.ts:3688` `deleteChat` session loop — `try { proc.kill("SIGTERM"); } catch { /* already dead */ }`, then `rm` at `:3691-3695`
- `index.ts:4526` `sendCliMessage` absolute timeout — kill written *after* `finalize(err(...))` at `:4525`
- `index.ts:4531`/`:4534` `requestGracefulShutdown` — SIGTERM then SIGKILL at 3000 ms
- `index.ts:4807`/`:4809` `cancelCliMessage` — the Stop button; the current shape is:
```ts
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    }, 3000);
    activeProcesses.delete(sessionId);
```
- `index.ts:4836` `closeCliSession` — SIGTERM with no SIGKILL rung, then two `rm`s at `:4842-4843`

The three out-of-scope leaf sites (`index.ts:1596`, `:2182`, `:2235`) keep the bare `proc.kill(...)` and must stay countable as such.

**Signature-preservation constraint:** `cancelCliMessage` is `function cancelCliMessage(sdk, sessionId): Result<void>` — synchronous (`index.ts:4803`). `killTree` must be fire-and-forget so this stays true (Pitfall 7).

---

### `packages/backend/src/index.source.test.ts` (test, static source scan, modified)

**Analog:** itself. The scanner is already in place — do not rewrite it, extend below it.

**Preamble already covers Phase 8's need** (`index.source.test.ts:5-30`), including why comments are stripped first:
```ts
// This suite therefore asserts on the SOURCE TEXT, and says so plainly rather
// than dressing itself up as a behavioural test. It proves that a required
// argument appears at every call site of a given function and that the number of
// call sites is the number the reviewer counted. It proves NOTHING about what
// those arguments evaluate to at runtime ...
//
// COMMENTS ARE STRIPPED FIRST, and that is load-bearing rather than tidy ...
```

**The two existing helpers to reuse unchanged** (`index.source.test.ts:41-77`): `stripCommentLines(source)` and `callArgumentTexts(source, name)` (balanced-paren extraction, one entry per call site), plus `const code = stripCommentLines(indexSource);`.

**Call-site count + per-site argument pattern** (`index.source.test.ts:79-107`) — the exact template for the `killTree(` row in VALIDATION:
```ts
// The count is asserted too. A sixth site added without `comspec` fails the
// per-site check; a sixth site added WITH it still fails this count, which is
// the point — a new spawn of a provider binary is a decision that should be read
// by a human, not absorbed silently by a passing suite.
describe("index.ts wires COMSPEC into every buildSpawnPlan call site (CR-01)", () => {
  const calls = callArgumentTexts(code, "buildSpawnPlan");

  it("has exactly the five call sites the review inventoried", () => {
    expect(calls).toHaveLength(5);
  });

  it("passes `comspec` at every one of them", () => {
    for (const call of calls) {
      expect(call).toContain("comspec: getComspec()");
    }
  });

  it("resolves the interpreter through the pure selector, not inline", () => {
    const helper = callArgumentTexts(code, "selectComspec");
    expect(helper).toHaveLength(1);
    expect(helper[0]).toContain("env: readParentEnv()");
    expect(helper[0]).toContain("platform: host?.platform");
  });
});
```

**Whole-file occurrence-count pattern** (`index.source.test.ts:159-171`) — for counting things that are not call sites (the three remaining bare `proc.kill(` leaf sites, the `detached:` answers):
```ts
    expect(code.match(/outcome === "unusable"/g)).toHaveLength(3);
    expect(code.match(/spawned: true/g)).toHaveLength(1);
    expect(code.match(/spawned: false/g)).toHaveLength(2);
```

**Regex-per-site pattern** (`index.source.test.ts:151-155`), when the argument text varies:
```ts
    for (const call of calls) {
      expect(call).toMatch(/spawnFailed: !\w+\.spawned/);
    }
```

**⚠ No precedent for the line-ordering assertion.** `08-VALIDATION.md` needs "the `killTree` line number is lower than every `rm(` line number" inside `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`. Nothing in `index.source.test.ts` measures **positions**; `callArgumentTexts` returns argument *text*, discarding offsets. Two options, both new work the planner must scope:
1. A **shell gate** in `ci.yml` / the plan's verify block, which is what VALIDATION currently specifies: `awk '/^async function cleanupMcpRuntime/,/^}/' packages/backend/src/index.ts | sed -e 's://.*::' | grep -n 'killTree\|rm('`. The `awk`+`sed` scoping idiom is precedent from `07-VALIDATION.md`, not from a test file.
2. A **new helper in `index.source.test.ts`** — e.g. `functionBody(code, "cleanupMcpRuntime")` returning the brace-scoped slice, then compare `body.indexOf("killTree(")` against `body.indexOf("rm(")`. This is more robust than `awk` and runs on every leg, but the helper does not exist yet. Note `sed 's://.*::'` also strips `//` inside string literals — a real hazard in a file carrying URLs — which the in-test `stripCommentLines` explicitly avoids (`index.source.test.ts:36-40`). **Recommend option 2**, modelled on the existing scanner.

---

### `.github/workflows/ci.yml` (config, modified)

**Analog:** `.github/workflows/ci.yml:225-252`, the shipped `Gate: the win32 spawn-plan suite actually ran` step. Copy in full:
```yaml
      - name: 'Gate: the win32 spawn-plan suite actually ran'
        shell: bash
        run: |
          # Written to the runner temp dir, not the checkout: `pnpm build` runs
          # after this step and must package exactly what a release does.
          report="$RUNNER_TEMP/win32-report.json"
          pnpm exec vitest run packages/backend/src/spawn-plan.win32.test.ts \
            --reporter=json --outputFile="$report"
          # Three conditions, and each one fails a different way of going green
          # with nothing executed: pending>0 is the skipIf still gating; total=0
          # is the file no longer being collected at all (a glob or path change);
          # passed<total is a real failure the reporter would otherwise let
          # through, since this step reads the file rather than the exit status.
          node -e '
            const fs = require("fs");
            const report = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
            const passed = report.numPassedTests ?? 0;
            const pending = report.numPendingTests ?? 0;
            const total = report.numTotalTests ?? 0;
            if (pending > 0 || total === 0 || passed !== total) {
              console.error(
                "Gate failed: the win32 spawn-plan suite did not execute cleanly on this host " +
                  JSON.stringify({ passed, pending, total })
              );
              process.exit(1);
            }
            console.log("Gate passed: the win32 spawn-plan suite ran " + total + " tests on this host.");
          ' "$report"
```
Change for Phase 8: step name → `Gate: the win32 kill-tree suite actually ran`; suite path → `packages/backend/src/kill-tree.win32.test.ts`; report file → `$RUNNER_TEMP/win32-kill-tree-report.json` (a distinct name, since the two steps run in the same job); the two log strings → "kill-tree". Placement: immediately after the existing gate, before the `Build` step at `ci.yml:265`.

---

## Shared Patterns

### The Result pattern
**Source:** `packages/backend/src/index.ts` (inline, to avoid Zod which crashes QuickJS); CLAUDE.md § *The Result Pattern*
**Apply to:** every `index.ts` function Phase 8 touches
`cancelCliMessage` and `closeCliSession` return `Result<void>` and end in `return ok(undefined);`. `killTree` itself returns `void` — it is fire-and-forget (Pitfall 7) and must **not** be promoted to `Result` or `Promise`, because doing so changes an RPC signature and reintroduces the RPC-during-await starvation class. `KillTreePlan`'s `{ kind: "none" } | { kind: "spawn" }` is the *same discriminated-union convention*, not a `Result`.

### Pure-helper split (CLAUDE.md § *Pure Helpers Split for Testability*)
**Source:** root `CLAUDE.md`; the table currently lists `provider-launch.ts`, `mcp-runtime.ts`, `command-resolution.ts`, `claude-print.ts`, `persistence.ts` (RESEARCH's fuller version lists `platform.ts`, `spawn-plan.ts`, `mcp-server-spec.ts`, `command-resolution.ts`, `fs-retry.ts`).
**Apply to:** a documentation edit adding the sixth row:

| Pure helper module | What it owns | `index.ts` owns |
|---|---|---|
| `packages/backend/src/kill-plan.ts` | the platform-branched termination argv + the refusal cases + the `detached` decision | spawning the killer, ordering kill-before-sweep, reading `activeProcesses` |

### Never-reject spawn + synchronous-throw guard
**Source:** `index.ts:2632-2660` (`spawnAndWait`), `index.ts:4265` (provider spawn `catch`)
**Apply to:** `killTree`'s spawn
```ts
      } catch (e) {
        const message = `Spawn error: ${String(e)}`;
        ...
      }
```
`spawn()` throws **synchronously** for EINVAL and NUL-in-path; a throw inside a Promise executor rejects the promise and no `error` handler can fire. Also note `spawnAndWait` has **no timeout** (Pitfall 8) — do not `await` it during cleanup.

### Injected platform, never read
**Source:** `platform.ts:26` (`export type Platform = "win32" | "darwin" | "linux";`), `spawn-plan.ts:1-8` header claim, `index.ts` `host?.platform`
**Apply to:** `kill-plan.ts` (imports the type only) and every `index.ts` call site (passes `host?.platform`). C-3 / D-02: exactly one `os` read exists in the repo and it stays behind the RUN-05 probe.

### Static gates as the vehicle-independent control
**Source:** `index.source.test.ts` preamble; the shipped `grep -rn 'shell: *true' packages/ --include='*.ts'` gate (07-SECURITY T-07-01)
**Apply to:** the new `process.kill(-` gate (Pitfall 1) and the `killTree` call-site counts. The rule these encode: a regression that is *green under Node and broken under LLRT* can only be caught by reading the source text.

### Comment style
**Source:** every module above
**Apply to:** all new code. This codebase writes long *why*-comments that name the requirement ID, the pitfall number and the research document (`LIF-01`, `CMP-01`, `Pitfall 7`, `08-RESEARCH.md § Q2`), and explicitly instructs future readers not to "simplify" a deliberate shape. Terse code with no justification will read as foreign here.

---

## No Analog Found

| File / sub-pattern | Role | Data Flow | Reason |
|---|---|---|---|
| **Line-ordering assertion** inside `index.source.test.ts` (kill before `rm`) | test (static) | transform | The existing `callArgumentTexts` scanner returns argument *text* and discards offsets; nothing in the repo asserts statement **order** in `index.ts`. Requires a new `functionBody`-style helper, or the `awk`+`sed` shell gate `08-VALIDATION.md` currently specifies (an idiom from `07-VALIDATION.md`, with no in-test precedent). See § `index.source.test.ts`. |
| **`describe.skipIf(process.platform === "win32")`** (POSIX-gated suite) | test | — | The inverse gate exists (`spawn-plan.win32.test.ts:163`), so the idiom is precedented; but no POSIX-only suite exists yet, and `spawn-plan.win32.gate.test.ts` has no counterpart guarding a POSIX-gated file. The POSIX suite runs on 4 of 5 CI legs, so a silent skip is far less likely — no gate test is recommended for it. |
| **Fire-and-forget `killTree` with `.on("close")` logging only** | orchestrator | event-driven | Every existing spawn in `index.ts` is either awaited (`spawnAndWait`) or long-lived and tracked (`activeProcesses`). A spawn that is deliberately neither is new. RESEARCH § *The orchestrator glue* drafts it; there is no shipped shape to copy. |
| **Recording an undocumented vendor exit code** (`taskkill`) | test | — | Partially precedented: `spawn-plan.win32.test.ts` records a *measurement with run URLs*, but for a boolean round-trip, not for a numeric exit code. Reuse the recording *style*; the assertion shape ("record, do not branch") is new. |

---

## Metadata

**Analog search scope:** `packages/backend/src/` (36 files listed), `.github/workflows/ci.yml`, root `CLAUDE.md`
**Files read this session:** `spawn-plan.ts` (header + return shape + branch order), `spawn-plan.test.ts` (1-70), `spawn-plan.win32.test.ts` (1-230), `spawn-plan.win32.gate.test.ts` (full), `index.source.test.ts` (full), `platform.ts` (250-300, type export), `mcp-server-spec.spawn.test.ts` (1-45), `index.ts` (1993-2011, 4255-4310, 4795-4845), `ci.yml` (225-265)
**Analogs selected:** 4 primary (`spawn-plan.ts`, `spawn-plan.win32.test.ts`, `index.source.test.ts`, `ci.yml` gate step) + 3 supporting (`platform.ts`, `mcp-server-spec.spawn.test.ts`, `spawn-plan.win32.gate.test.ts`)
**Pattern extraction date:** 2026-08-24
