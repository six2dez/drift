# Phase 8: Process Lifecycle — Research

**Researched:** 2026-08-24
**Domain:** Child-process termination across Caido's LLRT runtime, POSIX process groups, and Windows `taskkill`
**Confidence:** HIGH on the codebase map and the LLRT runtime surface (both source-read this session); MEDIUM on Windows `taskkill` semantics (vendor-documented behaviour, undocumented exit codes); LOW on anything requiring a real Windows host.

---

## Summary

The ROADMAP marks this phase *"Research flag: NO — `taskkill` is a well-documented Windows built-in; POSIX process groups are standard."* That is true of the primitives and **false of the mechanism this phase was going to use to reach them**. The single most important finding in this document is a correction to success criterion 2.

Reading Caido's LLRT fork at the commit Phase 7 pinned, `detached: true` **is** supported and does exactly what LIF-02 needs on POSIX — `command.process_group(0)`, i.e. `setpgid(0,0)`, making the provider CLI a process-group leader whose pgid equals its pid. But the only signalling primitive the runtime exposes, `process.kill(pid, signal)`, types `pid` as a Rust `u32` and rquickjs converts it through `f64` **with a range check**. `process.kill(-pid, "SIGTERM")` — the canonical spelling of "signal the group", and the spelling any planner would reach for — throws an `Underflow` conversion error under Caido's runtime. It works perfectly under Node, which is the only vehicle any CI leg in this repository runs. That is finding L-4 from Phase 5 recurring exactly: **a regression that is green on every runner this project has and broken only on the runtime it ships into.**

The measured way through is a spawn, not a signal: `detached: true` at the provider spawn, then `spawn("/bin/kill", ["-TERM", "--", "-<pid>"])` to signal the group. Measured on darwin this session — with `detached` and the group kill, both the CLI and its grandchild die; without them (today's shipped behaviour) the grandchild **survives a single-pid SIGKILL**, which is LIF-02 reproduced. That design also makes both platform arms the same shape — "build an argv, spawn an OS utility" — which is what makes the whole thing testable in a pure module, the constraint that actually governs this phase.

The ordering bug in criterion 4 is real and is already marked in the source. `cleanupMcpRuntime` (`index.ts:3399`) removes the token-bearing temp directory and **kills nothing at all** — a `LIF-01 SEAM / Phase 8` comment at `index.ts:3407` says so in as many words. Two more sites, `closeCliSession` (`index.ts:4828`) and `deleteChat`'s session loop (`index.ts:3686`), issue an async `SIGTERM` and then immediately `rm` the per-session approval and activity files the surviving MCP child is still polling.

**Primary recommendation:** add one pure module `packages/backend/src/kill-plan.ts` that turns `(pid, platform, systemRoot, rung)` into a spawn plan or an explicit refusal, wire it at the five in-scope call sites in `index.ts`, set `detached: true` on the provider spawn on non-win32 only, and reverse the kill/sweep order at the three sites where files are removed. Prove POSIX behaviourally with a real integration test on the runners the user base actually runs; prove Windows on the existing blocking `windows-latest` leg with a WR-08-style execution gate; claim nothing about Caido's LLRT that was not read out of its source.

---

## User Constraints

**No `08-CONTEXT.md` exists.** The maintainer deliberately skipped the discuss-phase pass because the ROADMAP success criteria are already explicit (stated in the research brief). There are therefore no locked decisions, no discretion areas and no deferred ideas to copy. The ROADMAP's five success criteria and the two requirement IDs below are the binding input, and everything in this document that is not one of those is a recommendation the planner may overrule.

One consequence worth stating: **success criterion 2 names a mechanism, not just an outcome** — *"via `detached: true` + process-group signalling"*. This research confirms the first half and finds the obvious spelling of the second half unusable under Caido's runtime. § *Open Question OQ-1* frames the choice; the planner should treat SC-2's mechanism clause as amendable in the Phase 5 SC-1 / Phase 7 SC-2 amend-in-place tradition rather than as fixed.

---

## Phase Requirements

| ID | Description (verbatim from REQUIREMENTS.md) | Research Support |
|----|---------------------------------------------|------------------|
| **LIF-01** | *"On Windows, cancelling or timing out a turn terminates the whole process tree (`taskkill /pid <pid> /T /F`), leaving no orphaned token-bearing process"* | § *Windows: `taskkill` specifics* (argv, path resolution, exit codes, `/T` semantics and its documented blind spot); § *Current Kill Surface* rows 4–8 (the five call sites that must route through the new plan); § *Pitfall 4* (LLRT `kill()` on Windows is single-process `TerminateProcess` **and** is one-shot) |
| **LIF-02** | *"On POSIX, cancelling or timing out a turn also terminates the CLI's MCP child (which carries `CAIDO_TOKEN`), via process-group signalling rather than a single-pid signal"* | § *The load-bearing unknown* (LLRT honours `detached`; `process.kill(-pid)` throws); § *Measured experiment* (control reproduces the defect, the recommended mechanism fixes it); § *Pitfall 1* (the Node-green / LLRT-broken asymmetry) |

Success criteria 3, 4 and 5 have no requirement ID of their own and ride on these two. SC-4's ordering fix is the security-relevant half and is treated as first-class throughout — see § *Security Domain*, threat T-08-01.

---

## Project Constraints (from CLAUDE.md)

Extracted as actionable directives. The planner must verify compliance against each.

| # | Directive | Source section | Bearing on Phase 8 |
|---|-----------|----------------|--------------------|
| C-1 | **No POSIX regressions.** macOS/Linux is the shipping user base. | *Constraints → Compatibility* | Governs SC-5. `detached: true` is a real behaviour change on POSIX (see § *Pitfall 6*) and must be justified, not slipped in. |
| C-2 | **Only use Node APIs Caido actually provides.** The backend runs in a constrained QuickJS/LLRT runtime; no Zod, no `import.meta`, no dynamic `require`, no native addons. | *Constraints → Runtime*; *Architecture → Architectural Constraints* | The entire § *The load-bearing unknown* section exists to satisfy this. `detached` and `process.kill` were both source-verified rather than assumed. |
| C-3 | **`crypto` and `os` are avoided project-wide**; `os` is read exactly once, in `index.ts`, behind the RUN-05 probe (D-02). | *Key Dependencies*; Phase 4 D-02 | `kill-plan.ts` must take `platform` and `systemRoot` as **injected parameters**. It must import neither `os` nor `process`. |
| C-4 | **`shell: true` with dynamic args is banned** (CVE-2024-27980 / injection). | REQUIREMENTS *Out of Scope*; PRV-02 | `taskkill.exe` and `kill` are real executables and must be spawned directly. No `shell` option anywhere in the new code. |
| C-5 | **Windows cannot be tested locally.** Validation is `windows-latest` CI (build + vitest) plus, where possible, the original reporter on a real machine. | *Constraints → Testing* | Every Windows claim in this document is tagged with whether CI can reach it. See § *Validation Architecture*. |
| C-6 | **kebab-case file names; camelCase functions; `build*`/`get*`/`is*` prefixes; `type` over `interface`; discriminated unions keyed on `kind`.** | *Conventions → Naming Patterns* | `kill-plan.ts`, `buildKillTreePlan`, and a `{ kind: "spawn" } \| { kind: "none" }` return shape. |
| C-7 | **Pure helpers are split out of `index.ts` for testability**, with the split table in CLAUDE.md naming five existing modules. | *Conventions → Pure Helpers Split for Testability* | Phase 8 adds a sixth row. See § *Architecture Patterns → The module split*. |
| C-8 | **`spawnAndWait` always resolves, never rejects.** A synchronous `spawn()` throw must be caught, because a throw inside a Promise executor rejects the promise and no `error` handler can fire. | *Error Handling*; `index.ts:2632-2660` | The new kill spawn must carry the same `try`/`catch`. `taskkill.exe` missing, or a NUL byte in a path, throws synchronously. |
| C-9 | **`sessionId` / `chatId` are untrusted and are validated before path interpolation** (SEC-02, pending in Phase 2). | REQUIREMENTS SEC-02 | A pid is a number, not a string, and must be **rendered by the pure module**, never string-concatenated at the call site. See § *Pitfall 3*. |
| C-10 | **ASCII box headers delimit new top-level sections in `index.ts`.** | *Conventions → Code Style* | A `── Process lifecycle ───` header for `killTree` and its helpers. |
| C-11 | **All backend state is module-level `let`/`const` in a single-threaded runtime.** Key singletons named: `activeProcesses`, `sessionWatchdogs`, `sessionRuntimeFiles`. | *Architecture → Architectural Constraints* | The pid inventory in § *Runtime State Inventory* is drawn from exactly these. |
| C-12 | **GSD workflow enforcement** — no direct repo edits outside a GSD command. | *GSD Workflow Enforcement* | Procedural; the planner already satisfies it. |

**No CLAUDE.md directive conflicts with anything recommended below.** The closest tension is C-1 versus `detached: true`, resolved in § *Pitfall 6* by scoping the flag to non-win32 and covering it with a real behavioural test on the affected platforms.

---

## Architectural Responsibility Map

Drift is not a web app; the tiers here are process/runtime boundaries.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide *what* to spawn to terminate a tree (argv, refusal) | **Pure module** (`kill-plan.ts`) | — | The only tier a test can reach. `index.ts` is unimportable under vitest (`vitest.config.ts` declares no `caido:plugin` alias), so a decision left in the orchestrator is unverifiable by construction. |
| Perform the termination (spawn, signal, ignore errors) | **Backend orchestrator** (`index.ts`) | — | Requires `child_process` and module-level pid state. Cannot be moved; must be covered by static source gates plus a human read. |
| Own the pid → session mapping | **Backend orchestrator** (`activeProcesses`, `index.ts:286`) | — | Module-level singleton by C-11. |
| Set `detached` at spawn time | **Backend orchestrator** (`index.ts:4259`) | Pure module supplies the boolean | The flag is a spawn option; the *decision* (`platform !== "win32"`) belongs in the pure module so the Linux runner can assert it. |
| Order kill-before-sweep | **Backend orchestrator** (`cleanupMcpRuntime`, `closeCliSession`, `deleteChat`) | — | Statement order in an async function. Only a static gate can see it; see § *Validation Architecture* row V-08-06. |
| Terminate the MCP grandchild that holds `CAIDO_TOKEN` | **Operating system** (process group / job-less `taskkill /T`) | — | Drift never learns that pid: the CLI spawns it, not Drift. See § *Runtime State Inventory*. |
| Prove it worked on Windows | **`windows-latest` CI leg** | Real-machine reporter (Phase 10) | C-5. |

---

## Standard Stack

**This phase installs nothing.** Every primitive it needs is either already imported by `packages/backend/src/index.ts` or is an operating-system binary.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `child_process` (Caido-provided LLRT module) | `caido/dependency-llrt` branch `caido` @ `a5b021c` | `spawn` — the only launch primitive Caido exposes; the only way to invoke `taskkill.exe` / `kill` | Already the sole spawn path in this codebase (`index.ts:3`). `detached` source-verified honoured **[VERIFIED: caido/dependency-llrt@caido `modules/llrt_child_process/src/lib.rs:462, 512-521`, downloaded and read this session]** |
| `taskkill.exe` | Windows built-in (all supported Windows) | `/pid <n> /t /f` — terminate a process and its children | Vendor-documented; the roadmap already names it **[CITED: learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill]** |
| `kill(1)` | POSIX / util-linux / BSD | `-TERM -- -<pgid>` — signal a process group | POSIX-standard utility; measured working on darwin this session (§ *Measured experiment*, case C) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `packages/backend/src/platform.ts` | in-repo | `Platform` union, `getWhichCommand`'s `%SystemRoot%\System32\…` join pattern | Import `type Platform` into `kill-plan.ts`; **copy** the SystemRoot-strip-and-join logic pattern rather than importing `getWhichCommand` (different binary, different args) |
| `packages/backend/src/spawn-plan.ts` | in-repo | `SpawnPlan` shape precedent (`{ file, args, windowsVerbatimArguments }`) | The kill plan's spawn arm should mirror this shape so `index.ts` consumes both identically |
| `packages/backend/src/index.ts` `spawnAndWait` (`:2570`) | in-repo | Bounded-buffer, never-rejects spawn helper with the synchronous-throw guard | The natural executor for the kill spawn — but see § *Pitfall 8*: it has **no timeout**, so a fire-and-forget wrapper may be preferable |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `spawn("/bin/kill", ["-TERM","--","-<pid>"])` | `process.kill(-pid, "SIGTERM")` | **Ruled out.** Throws under Caido's LLRT (`f64 → u32` Underflow). Green on Node, broken in production. See § *The load-bearing unknown*. |
| `spawn("/bin/kill", …)` | `process.kill(4294967296 - pid, sig)` — the two's-complement wrap spelling | **Ruled out, and measured.** Passes LLRT's range check and wraps correctly in `pid as i32`, but **Node rejects it**: `The "pid" argument must be of type number. Received type number (4294881050)`. It is untestable on every vehicle this repo has — the exact inverse defect. Measured this session. |
| `spawn("/bin/kill", …)` | Recursive `pgrep -P <pid>` walk, killing leaves first | More spawns, more code, and racy — a process can fork between the walk and the kill. The process group is atomic. Keep as a documented fallback only if `kill(1)` proves unresolvable on some host. |
| `spawn("taskkill.exe", …)` on Windows | A Windows **Job Object** with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | The correct Windows primitive and immune to the dead-intermediate-parent hole (§ *Pitfall 5*), but it requires Win32 API calls that neither LLRT nor Node exposes without a native addon — banned by C-2. Not available. |
| Any of the above | Adding a dependency such as `tree-kill` or `terminate` | The backend bundle runs in LLRT; a dependency that reaches for `os`, `process.platform` or `execSync` would break there, and Phase 7 set the precedent of **porting an algorithm under licence rather than adding a dependency** (`spawn-plan.ts` ports cross-spawn's escaping). Zero packages is the house answer. |

**Installation:**

```bash
# none — this phase adds no dependency to any package.json
```

**Version verification:** not applicable; no registry package is recommended.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

The Package Legitimacy Gate was not run because there is nothing to run it against. Recorded explicitly rather than omitted, so a reader can tell "audited, empty" from "skipped".

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none)* | — | — | — | — | — | — |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

If a plan later proposes a dependency (e.g. `tree-kill`), the gate **must** be run at that point, and the LLRT-compatibility objection in § *Alternatives Considered* must be answered first.

---

## The load-bearing unknown, resolved — what Caido's runtime actually supports

The research brief flags this as the item where a wrong confident answer silently invalidates the phase. It is now **source-verified**, using the same method Phase 4 and Phase 5 established: download the Rust source of Caido's LLRT fork and read it, rather than trusting `API.md` or the vendored type declarations, both of which are documented as trailing the code (`04-RESEARCH.md` § *Pitfall 7*).

Everything below is from `caido/dependency-llrt`, branch **`caido`**, the branch and repository `07-RESEARCH.md:1535` pins at commit `a5b021c51d1521f32018d3f3f2e70291df50501d` (2026-04-22). Files were downloaded and grepped **this session**.

### Q1 — Does `spawn` accept `detached: true` under Caido's LLRT? **YES.**

**[VERIFIED: caido/dependency-llrt@caido `modules/llrt_child_process/src/lib.rs:448, 462, 512-521`, downloaded and read this session]**

```rust
let mut detached = false;
// …
detached = opts.get_optional("detached")?.unwrap_or(false);
// …
if detached {
    #[cfg(unix)]
    {
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        // DETACHED_PROCESS = 0x00000008
        command.creation_flags(0x00000008);
    }
}
```

On unix this is `setpgid(0, 0)`: the child becomes the leader of a **new process group whose pgid equals its pid**, and everything it spawns inherits that group. That is precisely the property LIF-02 needs.

Two divergences from Node that the planner must not paper over:

- **Node uses `setsid()`, LLRT uses `setpgid()`.** libuv's `UV_PROCESS_DETACHED` calls `setsid()`, creating a new *session* as well as a new group. LLRT creates only a new group in the same session. **For `kill(-pid)` the two are equivalent** — both produce `pgid == child pid` — so evidence gathered under Node transfers for this specific purpose. It does not transfer for controlling-terminal behaviour, which Drift does not use. `[VERIFIED: source read this session for LLRT; ASSUMED for libuv's setsid, from training knowledge — but the equivalence claim only needs the LLRT half, which was read]`
- **On Windows, LLRT sets `DETACHED_PROCESS` only; Node sets `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`.** Irrelevant to `taskkill /T`, which walks the parent-child relation and not process groups — but it *is* the reason § *Recommendation* scopes `detached` to non-win32: there is no Windows benefit and a non-zero risk of perturbing the console-attachment contract Phase 7 just measured.

### Q2 — Does `process.kill(-pid, signal)` work under Caido's LLRT? **NO. It throws.** This is the finding that changes the plan.

**[VERIFIED: `modules/llrt_process/src/lib.rs:197-199` + `libs/llrt_utils/src/signals.rs:88-95, 127` + rquickjs @ the exact pinned commit `111951b1a31075bdff46684e0ff29f37ff2a04b2`, `core/src/value/convert/from.rs:143-157, 249-261, 286` — all four files downloaded and read this session]**

`process.kill` exists and is exported both as a global property and as a `"process"` module member:

```rust
process.set(
    "kill",
    Func::from(|ctx, pid, signal| signals::kill(&ctx, pid, signal)),
)?;
// …
globals.set("process", process)?;
```

Its `pid` parameter is typed `u32`:

```rust
pub fn kill(ctx: &Ctx<'_>, pid: u32, signal: Opt<Value<'_>>) -> Result<bool> {
```

and rquickjs converts JS numbers to `u32` **through `f64`, with an explicit range check**:

```rust
from_js_impls! {
    val:
    i32: i8 u8 i16 u16,
    f64: u32 u64 i64 usize isize,
}
```

which expands, for `u32`, to:

```rust
let num = <f64>::from_js(ctx, value)?;
number_match_range(num, u32::MIN as f64, u32::MAX as f64, "f64", "u32")?;
Ok(num as u32)
```

and `number_match_range` is:

```rust
if val < min {
    Err(Error::new_from_js_message(from, to, "Underflow"))
} else if val > max {
    Err(Error::new_from_js_message(from, to, "Overflow"))
} else {
    Ok(())
}
```

A negative pid is `< 0`, so it fails the `< min` arm and raises an `Underflow` conversion error before `libc::kill` is ever reached.

**Why this is dangerous rather than merely inconvenient.** `process.kill(-pid, sig)` works flawlessly under Node — it is the documented POSIX group-signalling idiom, and § *Measured experiment* case in the first probe confirms it kills the group on darwin. Every vitest leg in this repository runs Node. A plan that ships `process.kill(-pid, …)` would therefore be **green on all five CI legs and broken on every real Caido install**. That is finding L-4 from `05-RESEARCH.md` recurring verbatim: *"a regression to a bare `driftVars` dict would pass every test on Node CI and fail on a real Windows Caido install."* The house answer there was a vehicle-independent **static gate**; the same answer applies here (§ *Validation Architecture* row V-08-09).

### Q3 — Are `detached` and `windowsHide` in the vendored type surface? **`detached`: no. `windowsHide`: no, and it is a runtime no-op too.**

**[VERIFIED: `node_modules/.pnpm/@caido+quickjs-types@0.25.4/node_modules/@caido/quickjs-types/src/llrt/child_process.d.ts:239-255`, read this session]**

```ts
interface ProcessEnvOptions {
  uid?: number | undefined;
  gid?: number | undefined;
  cwd?: string | undefined;
}
interface SpawnOptions extends ProcessEnvOptions {
  stdio?: StdioOptions | undefined;
  shell?: boolean | string | undefined;
  windowsVerbatimArguments?: boolean | undefined;
}
```

No `env`, no `detached`, no `windowsHide`. This is § *Pitfall 7* from `04-RESEARCH.md` again — the published type surface omits capabilities the same project's source declares — and `index.ts` already has the sanctioned workaround: the narrowed `SpawnWithEnv` alias at `index.ts:2003-2011`, which declares exactly the call shape this file uses.

```ts
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

Add `detached: boolean` to that intersection as a **required** member, for the reason the comment above `windowsVerbatimArguments` already gives at `index.ts:1995-2002`: an optional flag is *"a default that is silently wrong at the one site that forgot it"*, and required makes forgetting a compile error. Note the consequence: `SpawnWithEnv` has **three** call sites (`index.ts:2141` `callMcpMethod`, `index.ts:2641` `spawnAndWait`, `index.ts:4259` the provider spawn), so making it required forces all three to state an answer — which is the desired outcome, since only one of them should say `true`.

**Bonus finding for Phase 10, recorded here so it is not lost:** `windowsHide` is read **nowhere** in LLRT's option parsing (the full read set is `gid`, `uid`, `detached`, `cwd`, `env`, `stdio`, `shell`, `windowsVerbatimArguments`). UX-04's *"`windowsHide: true` on every spawn"* is therefore a **no-op under Caido's runtime**, and `detached`'s `DETACHED_PROCESS` flag is the only console-suppression lever LLRT exposes. Phase 10's problem, not this phase's — but it means a future planner should not "fix" Phase 8 by reaching for `windowsHide`.

### Q4 — What does `ChildProcess.kill()` actually do under LLRT? **Single process, and on Windows it is one-shot.**

**[VERIFIED: `modules/llrt_child_process/src/lib.rs:157-180, 343-345`, read this session]**

```rust
fn kill(&mut self, ctx: Ctx<'js>, signal: Opt<Value<'js>>) -> Result<bool> {
    if let Some(pid) = self.pid {
        #[cfg(unix)]
        {
            return kill(&ctx, pid, signal);
        }

        #[cfg(windows)]
        {
            let signal = parse_signal(signal.0)?;
            if signal == 0 {
                return kill_process_raw(pid, 0)
                    .map(|_| true)
                    .or_else(|_| Ok(false));
            }

            if let Some(tx) = self.kill_tx.take() {
                return Ok(tx.send(()).is_ok());
            }
        }
    }

    Ok(false)
}
```

Three consequences, none of which is visible from the type surface:

1. **`self.pid` is always positive** and there is no parameter through which a caller could pass a group. `proc.kill()` can never signal a tree. This forecloses the "just make `ChildProcess.kill` do the right thing" idea.
2. **On Windows `kill_tx.take()` consumes the sender**, so the *second* call to `proc.kill()` returns `false` and does nothing. Drift's SIGTERM → SIGKILL ladder (`index.ts:4529-4535`, `index.ts:4807-4810`) therefore has a **dead second rung on Windows under LLRT**. It is not merely redundant, it is inert.
3. **On Windows every non-zero signal is the same signal.** `signals.rs:44` defines `static WINDOWS_SIGTERM: i32 = -1;` and `parse_signal` maps `"SIGINT" | "SIGTERM" | "SIGKILL" | "SIGQUIT" | "SIGHUP" | "SIGUSR1"` all to it; the kill path then does `TerminateProcess(handle, 1)`. So `proc.kill("SIGTERM")` on Windows is already a hard, ungraceful kill of the immediate child — which under a `.cmd` provider is **`cmd.exe`**, not the CLI. That is LIF-01 in one sentence.

### Q5 — Is there a liveness probe available? **Yes: `process.kill(pid, 0)`.**

**[VERIFIED: `libs/llrt_utils/src/signals.rs:88-95, 98-123, 127-149`, read this session]** Signal `0` takes a dedicated path on both platforms — `libc::kill(pid, 0)` on unix, `OpenProcess`/`CloseHandle` with no `TerminateProcess` on Windows — and the wrapper converts a not-found error into `Ok(false)` rather than throwing. This is a positive-pid call and so is **not** affected by the `u32` finding. It is usable for a diagnostics field or a post-kill assertion, wrapped in `try`/`catch` (an `EPERM` on unix still throws).

### What is still genuinely unknown

| Unknown | Why it cannot be closed here | Cheapest experiment |
|---|---|---|
| Whether Caido ships the `caido` branch at `a5b021c` | `04-RESEARCH.md` § *Pitfall 7*'s standing ceiling. Source analysis raises confidence; it does not close the gap. The fork publishes no releases (`07-RESEARCH.md:1376`). | **Load the built plugin in Caido on macOS/Linux and run one turn**, with a temporary diagnostics line reporting `typeof process.kill` and the result of a `detached: true` spawn + group kill against a `sleep`-and-fork fixture. The maintainer owns this hardware; it costs one `pnpm build` and one chat turn, and it is on **exactly the platform LIF-02 targets**. Strongly recommended as a Wave 1 spike task. |
| Whether `taskkill.exe` exit codes distinguish already-dead from access-denied | MS Learn documents **no** exit codes (§ *Windows: `taskkill` specifics*). The maintainer has no Windows host (C-5). | A win32-gated integration test that spawns `taskkill /pid <a pid that just exited> /t /f` and **records** the exit code and stderr, exactly as `spawn-plan.win32.test.ts` measured escaping depth on runs 32563348727/32563543158. Measure it; do not branch on it until measured. |
| Whether `kill(1)` exists at a stable path on every Linux Drift runs on | Only darwin was measured this session. | Cheap belt-and-braces: resolve through the existing `resolveCommand` machinery with a `/bin/kill` fallback, and treat a failed resolve as a logged degradation rather than a hard error. |

---

## Measured experiment — the POSIX mechanism, on real processes

Run on darwin (the maintainer's platform) under Node this session. A fixture parent spawns a grandchild; both idle. The grandchild stands in for the MCP server that carries `CAIDO_TOKEN`.

| Case | Spawn options | Killer | Parent dead? | **Grandchild dead?** |
|---|---|---|---|---|
| **A — control: today's shipped behaviour** | *(none)* | `process.kill(pid, "SIGKILL")` | yes | **NO — survives** |
| **B — the wrap spelling** | `detached: true` | `process.kill(2**32 - pid, "SIGTERM")` | no | no — **the call threw**: `The "pid" argument must be of type number. Received type number (4294881050)` |
| **C — recommended** | `detached: true` | `spawn("/bin/kill", ["-TERM", "--", "-<pid>"])` | yes | **yes** |
| **D — reference only** | `detached: true` | `process.kill(-pid, "SIGTERM")` | yes | yes — *but throws under LLRT, see Q2* |

**Case A is the falsifiable reproduction of LIF-02** and belongs in the test suite as the negative control: without `detached`, a single-pid kill leaves the token-bearing grandchild running. **Case B is dead** — it is the only spelling that satisfies LLRT's range check, and Node refuses it, so it can never be tested. **Case C is the recommendation.** Case D is what SC-2's wording implies and what a planner would otherwise write.

Confidence: **HIGH** for the mechanism on darwin under Node (executed, reproducible). **MEDIUM** for Linux (same POSIX semantics, not executed — CI will execute it). **MEDIUM→HIGH** for LLRT: `process_group(0)` was source-read, and the `kill(1)` half is an OS binary invocation with no runtime involvement beyond `spawn`, which LLRT indisputably supports.

---

## Current Kill Surface — every site that terminates a child, with citations

`packages/backend/src/index.ts` is **5,240 lines**. Eight sites call `.kill()`. Five are in Phase 8's scope; three are leaf spawns Drift owns end to end and that the Phase 7 OQ-3 comment at `index.ts:2624-2629` explicitly excludes from tree termination.

| # | Site | Line | Code | Scope | Notes |
|---|------|------|------|-------|-------|
| 1 | `resolveCommand` PATH-search timeout | `index.ts:1596` | `try { child.kill("SIGKILL"); } catch { /* ignore */ }` | **out** | `where.exe` / `which`. Leaf process, no tree. Excluded by `index.ts:2624-2629`. |
| 2 | `callMcpMethod` timeout | `index.ts:2182` | `try { proc.kill("SIGKILL"); } catch { /* ignore */ }` | **out** | Drift-owned `node mcp-server.mjs`, spawned directly. Leaf. |
| 3 | `callMcpMethod` `finish()` | `index.ts:2235` | `try { proc.kill("SIGTERM"); } catch { /* ignore */ }` | **out** | Same process, graceful path after `stdin.end()`. |
| 4 | `deleteChat` session loop | `index.ts:3688` | `try { proc.kill("SIGTERM"); } catch { /* already dead */ }` | **IN** | **No SIGKILL follow-up at all.** Then `rm`s the runtime files three lines later (`index.ts:3691-3695`). Ordering defect. |
| 5 | `sendCliMessage` absolute timeout | `index.ts:4526` | `try { proc.kill("SIGKILL"); } catch { /* already dead */ }` | **IN** | Runs **after** `finalize(err("Process timed out"))` on line 4525. Ordering defect. |
| 6 | `requestGracefulShutdown` | `index.ts:4531`, `index.ts:4534` | `SIGTERM` then `SIGKILL` after 3000 ms | **IN** | The Claude post-tool quiescence path. Second rung inert on Windows (Q4). |
| 7 | **`cancelCliMessage`** | `index.ts:4807`, `index.ts:4809` | `SIGTERM` then `SIGKILL` after 3000 ms | **IN** | **The user-facing Stop button.** `activeProcesses.delete` at `index.ts:4811`. Does not touch runtime files — relies on the child's `close` handler reaching `finalize`. |
| 8 | `closeCliSession` | `index.ts:4836` | `try { proc.kill("SIGTERM"); } catch { /* already dead */ }` | **IN** | **No SIGKILL follow-up.** `rm`s the runtime files at `index.ts:4842-4843`. Ordering defect. |

### Which pids are tracked, and which are not

| State | Declaration | Holds | Killable today? |
|---|---|---|---|
| `activeProcesses` | `index.ts:286` — `new Map<string, ChildProcessWithoutNullStreams>(); // sessionId → ChildProcess` | The provider CLI child (or `cmd.exe` on a Windows `.cmd` path). Set at `index.ts:4303`. | Yes — pid via `proc.pid`. **The only tracked pid in the codebase.** |
| `sessionWatchdogs` | `index.ts:288` | Pump callbacks, **not** processes | n/a |
| `sessionRuntimeFiles` | `index.ts:317` | Activity/approval **file paths**, not pids | n/a |
| MCP server process | **not tracked anywhere** | `startMcpServer` (`index.ts:3461`) stages `mcp-server.mjs` and registers CLIs; it **never spawns a persistent server**. The MCP process is spawned *by the CLI*, from the config Drift wrote. | **NO — Drift never learns its pid.** This is why a process-group / `/T` mechanism is the only option: the token-bearing process is reachable only through its ancestry. |
| `callMcpMethod` / self-test children | local `const proc` | Short-lived Drift-owned MCP invocations | Yes, locally scoped. Out of scope. |

The token these orphans hold is real and traceable: `buildMcpRuntimeEnv` (`index.ts:1235-1252`) puts `caidoToken` into the DRIFT vars, which reach the MCP process through the Claude/Copilot config `env` field and through Gemini/Codex registration.

### The process tree, post-Phase 5 and post-Phase 7

Phase 5 (D-04, `05-CONTEXT.md:100-107`) removed the shell wrapper on **all** platforms, so the POSIX tree is one level shallower than the roadmap's Phase 2-era description. Phase 7 (PRV-02) added a `cmd.exe` level on the Windows `.cmd` path only — `spawn-plan.ts:291-293` marks it:

> ```
> // The cmd.exe plan. Phase 10 owns the console-window flash this branch
> // introduces (UX-04, `windowsHide`) and Phase 8 owns the extra process-tree
> // level it adds to a cancel (LIF-01, `taskkill /T /F`). Marked, deliberately
> // not acted on here.
> ```

```
POSIX (darwin, linux) — 2 levels below Drift
  Caido backend (LLRT)
    └─ claude | gemini | codex | copilot          ← activeProcesses, pid known
         └─ node mcp-server.mjs   [CAIDO_TOKEN]   ← pid UNKNOWN to Drift

Windows, provider resolved to .exe — 2 levels
  Caido backend (LLRT)
    └─ claude.exe                                  ← activeProcesses, pid known
         └─ node.exe mcp-server.mjs [CAIDO_TOKEN]  ← pid UNKNOWN

Windows, provider resolved to .cmd/.bat — 3 levels  (buildSpawnPlan's interpreter arm)
  Caido backend (LLRT)
    └─ cmd.exe /d /s /c "<escaped>"                ← activeProcesses, pid known — THIS is what proc.kill() hits
         └─ node.exe …\claude.cmd's target
              └─ node.exe mcp-server.mjs [CAIDO_TOKEN]
```

Today `proc.kill()` reaches only the first box on each diagram. On the three-level Windows shape it kills `cmd.exe` and leaves two node processes, one of them holding the Caido session token.

---

## The ordering bug in criterion 4 — concretely

Three sites remove a token-bearing file while a token-bearing process may still be alive. The first is already annotated in the source as Phase 8's.

### Site 1 — `cleanupMcpRuntime` kills nothing at all

`index.ts:3399-3423`. The comment is Phase 7's deliberate hand-off (07-04 T3 gated it at exactly two occurrences of the `LIF-01 SEAM` marker):

```ts
async function cleanupMcpRuntime(
  sdk: BackendSDK,
  authState: McpAuthState = "unknown",
  authMessage = "",
): Promise<void> {
  await unregisterMcpFromCli("gemini", sdk);
  await unregisterMcpFromCli("codex", sdk);

  // LIF-01 SEAM / Phase 8 (process lifecycle) owns a requirement that lands HERE: the
  // provider process tree must be terminated BEFORE the temp-directory removal
  // below, or a surviving MCP child keeps the Caido token in its environment
  // while the files it was reading are deleted underneath it. The seam is marked
  // and NOT acted on — the statement order in this function is deliberately
  // unchanged by this phase, and no termination is added here. Grep LIF-01.
  if (mcpTempDir !== undefined) {
    try {
      await rm(mcpTempDir, { recursive: true, force: true });
    } catch (error) {
      sdk.console.error(`[drift] Failed to remove MCP temp dir ${mcpTempDir}: ${String(error)}`);
    }
    mcpTempDir = undefined;
  }
  cliSessions.clear();
  setMcpAuthStatus(authState, authMessage);
  await publishMcpStatus(sdk);
}
```

`stopMcpServer` (`index.ts:3650-3653`) is a two-line delegation to it:

```ts
async function stopMcpServer(sdk: BackendSDK): Promise<Result<void>> {
  await cleanupMcpRuntime(sdk);
  return ok(undefined);
}
```

So SC-4 — *"Session finalize / `stopMcpServer` kills all tracked pids before sweeping the temp dir"* — is **entirely unimplemented today**, not merely mis-ordered. `cleanupMcpRuntime` is also reached from the `startMcpServer` failure path (`index.ts:3486`), which makes the fix load-bearing on more than the Stop button.

### Site 2 — `closeCliSession`: async SIGTERM, then immediate `rm`

`index.ts:4828-4844`:

```ts
  const proc = activeProcesses.get(input.sessionId);
  const snapshot = getSessionSnapshot(input.sessionId);
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    activeProcesses.delete(input.sessionId);
  }
  const runtimeFiles = sessionRuntimeFiles.get(input.sessionId);
  if (runtimeFiles !== undefined) {
    sessionRuntimeFiles.delete(input.sessionId);
    void rm(runtimeFiles.activityFilePath, { force: true }).catch(() => undefined);
    void rm(runtimeFiles.approvalsFilePath, { force: true }).catch(() => undefined);
  }
```

`SIGTERM` to the CLI does not synchronously reap the MCP grandchild — and here it does not reap the CLI either, because there is no SIGKILL rung. The `rm` runs on the next tick. The MCP server polls `DRIFT_APPROVALS_FILE` synchronously before every sensitive tool (CLAUDE.md § *Pattern Overview*), so it observes the file vanishing while still holding the token.

### Site 3 — `deleteChat`'s session loop, same shape

`index.ts:3686-3696`: `SIGTERM`, `activeProcesses.delete`, then `rm` both runtime files. No SIGKILL rung.

### And the timeout path finalizes before it kills

`index.ts:4519-4527`:

```ts
      const timeout = setTimeout(() => {
        if (settled) return;
        setSessionState("error", "Process timed out.", { … });
        finalize(err("Process timed out"));
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, currentSettings.processTimeoutSeconds * 1000);
```

`finalize` (`index.ts:4482-4517`) schedules `rm` of the activity file, the approvals file and the token-bearing Claude MCP config inside a `void (async () => { … })()`. The kill is synchronous and lands first in practice, but the *written order* is finalize-then-kill and SC-4 asks for the reverse. Reordering these two statements is a one-line change and a static gate can see it.

---

## Windows: `taskkill` specifics

### Argv and semantics

**[CITED: learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill]** — fetched this session. Documented syntax:

```
taskkill [/s <computer> [/u [<domain>\]<username> [/p [<password>]]]] {[/fi <filter>] [...] [/pid <processID> | /im <imagename>]} [/f] [/t]
```

| Flag | Vendor text |
|---|---|
| `/pid <processID>` | *"Specifies the process ID of the process to be terminated."* |
| `/t` | *"Ends the specified process and any child processes started by it."* |
| `/f` | *"Specifies that processes be forcefully ended."* |

Both flags are required for Drift's case. Without `/f`, taskkill asks windowed processes to close via a window message; Drift's children are console processes with piped stdio and no message pump, so a non-forced kill is unreliable. The roadmap's spelling `["/pid", pid, "/T", "/F"]` is correct; Windows switch parsing is case-insensitive, so `/t /f` and `/T /F` are equivalent. The pid **must be rendered as a string** in the argv array.

### Does it need a shell? No — and it must not have one.

`taskkill.exe` is a genuine PE executable, so `buildSpawnPlan`'s direct-spawn arm applies (`spawn-plan.ts:280-290`: anything not in `CMD_INTERPRETED_EXTENSIONS` is spawned directly). It must **not** go through `cmd.exe`, and it must not use `shell: true` — C-4, and PRV-02's `shell:true`-appears-nowhere property is asserted repo-wide by `grep -rn "shell: *true" packages/` returning 0 (07-SECURITY T-07-01). Adding one here would break a shipped security gate. `windowsVerbatimArguments` should be **`false`**: the arguments are a switch and a decimal integer, with no metacharacters, so the runtime's own quoting is correct and safe.

### Reaching the binary

Do **not** spawn the bare name `taskkill`. Phase 6 established the pattern for exactly this problem at `platform.ts:255-294` (`getWhichCommand`), and the reasoning transfers unchanged — a bare name is resolved through `%PATH%`, which on a security tester's machine is more likely than average to contain something. Mirror it:

```
%SystemRoot%\System32\taskkill.exe     (SystemRoot or SYSTEMROOT, trailing separators stripped)
taskkill.exe                           (fallback when neither variable is set)
```

`%SystemRoot%` reaches the backend through `readParentEnv()` (`index.ts:564`), the same accessor `getWhichCommand`'s caller uses at `index.ts:1522-1528`. Note the Phase 4 SC-9 contract: the spawn `env` **replaces** the parent block under both Node and LLRT, so if the kill spawn passes an `env` at all it must spread the parent — but it has no reason to pass one, and `spawnAndWait`'s no-`env` arm (`index.ts:2637-2640`) already inherits correctly.

### Exit codes — measure, do not assume

**The Microsoft Learn reference documents no exit or return codes.** The commonly-repeated mapping (0 = success, 128 = not found, 1 = access denied) is community knowledge, not vendor documentation, and this document will not launder it into a `[VERIFIED]` claim. `[ASSUMED]`

**Recommendation: do not branch on the exit code in v1.** A non-zero exit from `taskkill` during a cancel is the *expected* case as often as not, because the pid frequently exited on its own between the decision and the spawn. Treat any non-zero as "log at debug and continue," in the spirit of `spawnAndWait`'s never-reject contract and the WR-05 `spawned` discriminator (`index.ts:2560-2569`) that already distinguishes "the process ran and exited 1" from "there was never a process." **Then measure the real codes** in the win32-gated integration test and record them, in exactly the way `spawn-plan.ts:63-79` records the A1 escaping-depth measurement with its two run URLs. A later phase can branch on measured values.

### `/T`'s documented blind spot

`/t` ends *"any child processes started by it"* — it walks the parent-child relation recorded in the process table. If an intermediate process has **already exited**, its surviving children are no longer reachable from the original pid and are not terminated; the reported error text is *"The process with PID N (child process of PID M) could not be terminated. Reason: There is no running instance of the task."* `[ASSUMED — community/issue-tracker evidence only; see Sources § Tertiary]`

For Drift's three-level `.cmd` shape this matters: if `cmd.exe` exits (having launched the CLI and returned) before the cancel arrives, `taskkill /T` on the tracked `cmd.exe` pid finds nothing. In practice `cmd.exe /c` waits for its child, so this window is narrow — but it is not zero, and it is the reason a Windows Job Object would be the correct primitive if LLRT exposed one (it does not; § *Alternatives Considered*). **Record this as an accepted residual**, do not paper over it.

---

## Architecture Patterns

### System architecture — where a cancel travels

```
  User clicks Stop in ChatView.vue:351
        │  await sdk.backend.cancelCliMessage(sid)
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ index.ts  cancelCliMessage (:4803)   ── ORCHESTRATOR ──      │
  │   proc = activeProcesses.get(sessionId)        (:4804)       │
  │   ┌──────────────────────────────────────────┐              │
  │   │ NEW: killTree(proc, "term")               │              │
  │   └──────────────┬───────────────────────────┘              │
  └──────────────────┼──────────────────────────────────────────┘
                     │  pid, host?.platform, systemRoot, rung
                     ▼
        ┌────────────────────────────────────────┐
        │ kill-plan.ts  buildKillTreePlan()      │   ── PURE, TESTABLE ──
        │   pid undefined ──────► { kind:"none", reason:"no-pid" }
        │   platform === "win32" ► { kind:"spawn",
        │                            file: <SystemRoot>\System32\taskkill.exe,
        │                            args: ["/pid", "<n>", "/t", "/f"],
        │                            windowsVerbatimArguments: false }
        │   otherwise ──────────► { kind:"spawn",
        │                            file: "kill",
        │                            args: ["-TERM"|"-KILL", "--", "-<n>"],
        │                            windowsVerbatimArguments: false }
        └──────────────┬─────────────────────────┘
                       │  plan
                       ▼
        ┌────────────────────────────────────────┐
        │ index.ts   spawn(plan.file, plan.args)  │  fire-and-forget,
        │   try/catch around the synchronous throw│  errors logged only
        └──────────────┬─────────────────────────┘
                       ▼
  ═══════════════ OS boundary ════════════════════════════════
   POSIX: SIGTERM → process group (pgid == CLI pid, from detached:true)
          ├─ claude                      dies
          └─ node mcp-server.mjs  ◄── dies WITH it   [LIF-02 closed]
   Win32: taskkill /T walks ParentProcessId
          ├─ cmd.exe                     dies
          └─ node.exe …                  dies
               └─ node.exe mcp-server.mjs  dies      [LIF-01 closed]
  ═══════════════════════════════════════════════════════════
                       │
                       ▼  only AFTER the tree is down
  ┌─────────────────────────────────────────────────────────────┐
  │ rm(approvalsFilePath) · rm(activityFilePath)                │
  │ rm(claudeMcpConfigPath) · rm(mcpTempDir, recursive)         │  [SC-4]
  └─────────────────────────────────────────────────────────────┘
```

### The module split — matching Phases 4/5/6/7, not inventing one

CLAUDE.md § *Pure Helpers Split for Testability* names five modules. Phase 8 adds a sixth row to that table:

| Pure helper module | What it owns | `index.ts` owns |
|---|---|---|
| `packages/backend/src/platform.ts` | OS decisions from an injected `platform` | the single `os` read |
| `packages/backend/src/spawn-plan.ts` | `cmd.exe` escaping + the interpreter decision | calling `spawn` with the plan |
| `packages/backend/src/mcp-server-spec.ts` | the MCP launch spec, registration argv, removal policy | writing files, spawning |
| `packages/backend/src/command-resolution.ts` | candidate path lists | calling `where`/`which` |
| `packages/backend/src/fs-retry.ts` | the transient-FS classifier + ladder | the actual writes |
| **`packages/backend/src/kill-plan.ts` (NEW)** | **the platform-branched termination argv + the refusal cases + the `detached` decision** | **spawning the killer, ordering kill-before-sweep, reading `activeProcesses`** |

**Why this split and not "just put a `killTree` in `index.ts`".** `07-VALIDATION.md` § *Platform note* states it as the phase-governing constraint, and `05-RESEARCH.md` § *Planning note* quantifies the alternative: *"anything left inside it is bucket N by construction."* `vitest.config.ts` declares no `caido:plugin` alias (confirmed by reading the file this session — the `resolve.alias` block contains only `vue` and `pinia`), so `index.ts` cannot be imported by any test this project can run. The maintainer also cannot run native Windows. A `taskkill` argv assembled inside `index.ts` would be unverifiable on the only platform this milestone is about.

### Module header — the house pattern `kill-plan.ts` must follow

`platform.ts:1-16` and `spawn-plan.ts:1-27` establish a recognisable convention: a **mechanically checkable purity claim**, a statement of **why the module exists outside `index.ts`**, and an explicit **"deliberately NOT imported"** list.

```ts
// The termination plan: given a pid, the host platform and the Windows system
// root, decide WHAT to spawn to bring down a whole process tree — or refuse,
// explicitly, when there is nothing to kill. Three properties are load-bearing
// and all three are mechanically checkable. This module performs ZERO I/O; it
// reads no module state; and it carries exactly ONE import statement —
// `grep -cE '^import' ` over this file returns 1. `platform`, `pid` and
// `systemRoot` are INJECTED parameters, never read from `os` or `process`.
//
// Deliberately NOT imported: `os` and `process` (D-02 gives index.ts the single
// os read), `path` (it resolves to its POSIX flavour on the Linux CI runner and
// would corrupt a Windows path — the same reason platform.ts:498 spells the
// backslash join by hand), and `child_process` (a module that cannot spawn has
// no hidden effect a test cannot see). An unused import is a hard build failure
// here (tsconfig noUnusedLocals → TS6133; `pnpm lint` at --max-warnings 0), so
// the import count is self-enforcing.
//
// WHY THIS LIVES OUTSIDE index.ts: index.ts is 5,240 lines, declares no
// caido:plugin alias for vitest and cannot be imported by any test this project
// can run. The maintainer cannot test native Windows locally, which makes
// "unverifiable by construction" the same thing as "unverified on the only
// platform this milestone is about".
```

### Return shape — a discriminated union, per C-6

`spawn-plan.ts:238-242` returns one flat shape because there is always something to spawn. Termination has a genuine "nothing to do" case (`proc.pid === undefined`, SC-1's explicit guard), and swallowing it into a sentinel string would lose the reason. Use the `kind`-keyed union CLAUDE.md already names as the house convention:

```ts
export type KillTreePlan =
  | { kind: "none"; reason: "no-pid" | "unsupported-platform" }
  | { kind: "spawn"; file: string; args: string[]; windowsVerbatimArguments: boolean };
```

Branch order matters and is part of the contract: **the refusal arms are written first**, matching `planMcpCliRegistration`'s fail-closed shape (07-VALIDATION § *Rows the seed did not anticipate*) and `buildSpawnPlan`'s non-win32-first rule.

### Pattern: `detached` as a pure decision, applied at an impure site

```ts
// kill-plan.ts — testable on the Linux runner
export function shouldDetachProviderSpawn(platform: Platform | undefined): boolean {
  // win32 does NOT need it: taskkill /T walks ParentProcessId and is indifferent
  // to process groups, while LLRT's win32 arm sets DETACHED_PROCESS (not
  // CREATE_NEW_PROCESS_GROUP) and would change the console-attachment contract
  // Phase 7 measured. `undefined` (pre-probe) takes the POSIX arm, because the
  // POSIX arm is the one that must not regress (CMP-01).
  return platform !== "win32";
}
```

```ts
// index.ts:4259 — the only site that flips it on
proc = spawnWithEnv(spawnPlan.file, spawnPlan.args, {
  env: buildSpawnEnv({ parentEnv: readParentEnv(), driftVars: injectedDriftVars }),
  stdio: ["pipe", "pipe", "pipe"],
  windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments,
  detached: shouldDetachProviderSpawn(host?.platform),   // LIF-02
});
```

The other two `SpawnWithEnv` call sites (`index.ts:2141`, `index.ts:2641`) pass `detached: false` — they spawn Drift-owned leaves that must stay in Drift's own group so they die with it.

### Anti-patterns to avoid

- **`process.kill(-pid, sig)`.** The single highest-risk line this phase could ship. Green on Node, throws under Caido's LLRT. § *Q2*.
- **`shell: true` anywhere.** Reintroduces CVE-2024-27980 and breaks a shipped repo-wide gate. C-4.
- **Branching on `taskkill`'s exit code before measuring it.** § *Windows: exit codes*.
- **Making `cancelCliMessage` `async` "because the kill is a spawn."** It is `Result<void>`, not `Promise<Result<void>>`, at `index.ts:4803`, and it returns to the frontend immediately today. A fire-and-forget kill preserves that. See § *Pitfall 7*.
- **Deleting the SIGTERM→SIGKILL ladder because "the tree kill is forceful."** The POSIX graceful rung is real user-visible behaviour (the CLI flushes partial output on SIGTERM, which is what `ChatView.cancel.test.ts:45` calls *"whatever output it had when SIGTERM hit"*). SC-5 forbids changing it. Signal the **group** with SIGTERM first, then the group with SIGKILL.
- **A `killTree` that reads `os.platform()` itself.** C-3 / D-02: one guarded `os` read, in `index.ts`, behind the RUN-05 probe. Inject `host?.platform`.
- **String-concatenating the pid into an argv element at the call site.** § *Pitfall 3*.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Terminate a Windows process tree | A recursive `wmic`/`tasklist` PPID walk in TypeScript | `taskkill /pid <n> /t /f` | One vendor-supported spawn instead of a racy N-spawn walk. The roadmap already names it and MS documents `/t`. |
| Terminate a POSIX process tree | A `pgrep -P` recursion, or parsing `ps` output | `detached: true` + `kill -TERM -- -<pgid>` | The kernel does the tree walk atomically at `setpgid` time. A userspace walk races every `fork()`. |
| Decide whether a pid is still alive | Parsing `ps`/`tasklist` output | `process.kill(pid, 0)` — source-verified available on both LLRT platforms (§ *Q5*) | No spawn, no parsing, no output-format drift. Wrap in `try`/`catch` for `EPERM`. |
| Escape a path for the killer | New escaping code | Nothing — `taskkill.exe` and `kill` take a switch and an integer, spawned **directly** | Escaping exists for `cmd.exe`'s re-parse. There is no `cmd.exe` on this path, so introducing escaping would be adding the hazard, not handling it. |
| Cross-platform spawn compatibility | Adding `cross-spawn` / `tree-kill` / `terminate` | Port the algorithm under licence, as `spawn-plan.ts` already does for cross-spawn | Phase 7 set this precedent explicitly (`spawn-plan.ts:31-38`) and the bundle ships into LLRT, where a dependency reaching for `os`/`process.platform`/`execSync` breaks. |
| Bound the killer's output | New buffering | `spawnAndWait`'s existing `createBoundedBuffer` path (`index.ts:2578-2586`) | PERF-04 already solved this for every spawn in the file. |

**Key insight:** every custom solution in this domain is a userspace re-implementation of a kernel guarantee, and it loses the atomicity that makes the guarantee worth having. The one thing that genuinely must be hand-rolled is the *decision* about which OS mechanism to invoke — which is exactly what belongs in the pure module.

---

## Runtime State Inventory

This is not a rename phase, but the question the inventory asks — *"what runtime state survives after the code change lands?"* — is this phase's entire subject matter. Adapted accordingly, and every category answered explicitly.

| Category | Items found | Action required |
|---|---|---|
| **Live processes Drift tracks** | `activeProcesses` (`index.ts:286`), keyed by `sessionId`, holding the provider CLI child (or `cmd.exe`). One entry per running turn. Set at `index.ts:4303`; deleted at `:3689`, `:4493`, `:4811`, `:4837`. | Route every kill of these through `killTree`. Five call sites (§ *Current Kill Surface* rows 4–8). |
| **Live processes Drift does NOT track** | **The MCP server child holding `CAIDO_TOKEN`.** Spawned by the CLI from Drift's config; its pid never reaches Drift. Verified: `startMcpServer` (`index.ts:3461-3560`) stages the script and registers CLIs — there is no persistent-server spawn anywhere in it. | **Cannot be killed by pid — only by tree/group.** This is the whole justification for LIF-01/LIF-02's mechanism. |
| **Token-bearing files on disk** | `<tmp>/drift-mcp-<id>/mcp-context.json`; `mcp-activity-<sessionId>.jsonl` and `mcp-approvals-<sessionId>.json` (`index.ts:1261-1262`); `mcp-<chatId>.json` (Claude) and `copilot-mcp-<chatId>.json`. All under a `0o700` Drift-created dir. | Must be removed **after** the tree is down, not before (SC-4). Three sites to reorder. |
| **Token-bearing files outside Drift's temp dir** | `~/.codex/config.toml` holds the **literal** token (07-SECURITY AR-01); `~/.gemini/settings.json` holds a `${CAIDO_TOKEN}` **reference** in two scopes. | **Out of Phase 8 scope.** Owned by `sweepStaleMcpCliRegistrations` (`index.ts:3300`) at start and `unregisterMcpFromCli` at cleanup. Named here so the planner does not widen scope into it. |
| **OS-registered state** | **None.** Drift registers no scheduled task, service, launchd plist or pm2 entry. Verified by absence: no `launchctl`, `schtasks`, `sc.exe` or `pm2` reference exists anywhere in `packages/`. | None. |
| **Orphan residue from a previous run** | `sweepOrphanedMcpTempDirs` (`index.ts:3441-3460`) removes `drift-mcp-*` directories from both sweep roots at every start. It sweeps **directories, not processes** — a surviving MCP process from a previous Caido run keeps its token and its now-deleted context file. | Consider (but do not necessarily ship) extending the start-up sweep. **Recommend deferring**: identifying "a Drift MCP process from a previous run" requires image-name matching that could kill an unrelated `node`. Record as a residual, not a task. |
| **Build artifacts / installed packages** | None affected. This phase adds one source file and edits one. | None. |

**The canonical question for this phase:** *after the user clicks Stop, what still holds `CAIDO_TOKEN` in its environment?* Today, on both platforms, the answer is the MCP server child. On Windows it is joined by the CLI itself and, on a `.cmd` path, by nothing else only because `cmd.exe` was the one thing that died.

---

## Common Pitfalls

### Pitfall 1 — The Node-green / LLRT-broken asymmetry (the phase's defining hazard)

**What goes wrong:** the plan ships `process.kill(-pid, "SIGTERM")`. Every vitest leg passes. On a real Caido install the call throws an rquickjs conversion error, the group is never signalled, and the orphan the phase exists to prevent survives — silently, because the throw is inside a `try { … } catch { /* already dead */ }` that this codebase writes at every kill site.
**Why it happens:** the type surface says nothing (`SpawnOptions` omits the whole area), the Node vehicle behaves correctly, and the idiom is the textbook one.
**How to avoid:** use the spawn-based mechanism (§ *Measured experiment* case C), and add a **static gate** — `grep -c 'process\.kill(-' packages/backend/src` must be `0` — because it is the only vehicle-independent control available. This is the identical remedy `05-RESEARCH.md` finding L-4 prescribed for the bare-`env`-dict regression, and that gate is still standing.
**Warning signs:** any diff that adds a unary minus in front of a pid; any test that asserts group-kill behaviour by calling `process.kill` directly rather than through the plan.

### Pitfall 2 — PID reuse

**What goes wrong:** a session's process exits and is reaped; the OS reassigns its pid; a late `killTree` (the 3-second SIGKILL rung, or a cancel that races the `close` handler) terminates an unrelated process. On Windows with `/T` it terminates that process's whole tree.
**Why it happens:** the SIGKILL rung fires on a bare `setTimeout` with no liveness re-check (`index.ts:4808-4810`), and `activeProcesses.delete` happens *before* it.
**How to avoid:** re-check `activeProcesses` membership (or `process.kill(pid, 0)`, § *Q5*) inside the deferred rung before acting; capture the pid once, at plan-build time, rather than reading `proc.pid` again later. On POSIX the group form is slightly safer — a pgid is only reusable once the leader has exited *and* the numeric pid has cycled.
**Warning signs:** a deferred kill that reads `proc.pid` inside the timeout callback instead of a captured `const`.

### Pitfall 3 — Interpolating the pid at the call site

**What goes wrong:** `args: ["/pid", String(proc.pid), …]` written in `index.ts`. The rendering escapes the pure module, so no test covers the `undefined` case, and SC-1's *"guarded against undefined pid"* becomes an assertion about a line no test can reach — `String(undefined)` is `"undefined"`, and `taskkill /pid undefined /t /f` is a silent no-op with a non-zero exit nobody reads.
**How to avoid:** `buildKillTreePlan` takes `pid: number | undefined` and owns both the guard and the rendering. `index.ts` passes `proc.pid` through untouched and switches on `plan.kind`.
**Warning signs:** any `String(` or template literal containing `pid` in `index.ts`'s new code.

### Pitfall 4 — Assuming the SIGTERM→SIGKILL ladder still means something on Windows

**What goes wrong:** the ladder is kept as-is on Windows on the theory that it is harmless. It is worse than harmless: under LLRT the second rung is **inert** (`kill_tx.take()` consumes the sender, § *Q4*), and the first rung is already a hard `TerminateProcess` of `cmd.exe` — so the code reads as graceful-then-forceful while being forceful-then-nothing.
**How to avoid:** on win32 issue **one** `taskkill /t /f` and drop the second rung, or make the rung a re-issue of the same plan rather than a `proc.kill`. Document which, in the source, so a later reader does not "restore symmetry."

### Pitfall 5 — `taskkill /T` cannot reach a grandchild whose parent already exited

**What goes wrong:** on the three-level `.cmd` shape, if `cmd.exe` has exited the tree walk finds nothing and the token-bearing node process survives.
**How to avoid:** it cannot be fully avoided without a Job Object, which LLRT does not expose. Accept it, record it as a residual in `08-SECURITY.md`, and note that `cmd.exe /c` normally waits for its child so the window is narrow. Prefer resolving providers to `.exe` where possible — Phase 6 already prefers `.exe` over `.cmd` (RES-02), which shortens the tree by one level and shrinks this window as a side effect. `[ASSUMED — the /T limitation is community-evidenced, not vendor-documented]`

### Pitfall 6 — `detached: true` is a real POSIX behaviour change (CMP-01 surface)

**What goes wrong:** the provider child moves into its own process group and stops receiving signals delivered to Caido's group. If Caido is launched from a terminal and the user presses Ctrl-C, the CLI child no longer dies with it — the inverse of the orphan problem this phase is fixing.
**Why it is nonetheless the right call:** Caido ships as a desktop application, not a terminal foreground job, so the group-signal path is not how it is normally stopped; `mcp-server-spec.ts:766` already records that a hard-killed Drift is *"the highest-value case the sweep exists for."* And the counterweight is decisive: without it, the token-bearing MCP grandchild survives **every** cancel, which is measured (case A), not hypothetical.
**How to avoid the regression:** scope `detached` to the provider spawn only, leave the two Drift-owned leaf spawns at `false`, and cover both cases with the integration test so the boundary is asserted rather than remembered.

### Pitfall 7 — Making the cancel RPC asynchronous

**What goes wrong:** `cancelCliMessage` is declared `function cancelCliMessage(sdk, sessionId): Result<void>` (`index.ts:4803`) — **synchronous**. Awaiting a kill spawn inside it changes the signature to `Promise<Result<void>>`. Caido's RPC layer tolerates that (the frontend already `await`s it at `ChatView.vue:351`), but it introduces a window in which the RPC is pending while Caido's runtime is single-threaded and does not deliver `child_process` callbacks during an awaiting RPC (CLAUDE.md § *Anti-Patterns → RPC-during-await event-loop starvation*). That is the failure class the whole keep-alive/watchdog apparatus exists to work around; adding a new instance of it during a *cancel* is the worst possible place.
**How to avoid:** make `killTree` **fire-and-forget** — build the plan, spawn, attach no `await`, log on the `error` event — and keep every calling signature exactly as it is. SC-5's *"cancellation semantics visible to the user are unchanged"* then holds by construction.

### Pitfall 8 — `spawnAndWait` has no timeout

**What goes wrong:** `spawnAndWait` (`index.ts:2570-2683`) resolves on `close` or `error` and has **no timer**. A `taskkill.exe` that hangs (a stuck handle, an unresponsive process) holds the returned promise forever. If a caller awaits it during cleanup, cleanup never completes.
**How to avoid:** either use `spawnAndWait` without awaiting it (`void spawnAndWait(...)`), or spawn directly with the C-8 `try`/`catch` guard. Do not `await` a kill during `cleanupMcpRuntime`.

### Pitfall 9 — Forgetting the synchronous `spawn()` throw

**What goes wrong:** `spawn()` throws **synchronously** for EINVAL (`.cmd` under the CVE-2024-27980 guard) and for a NUL byte in the path; inside a Promise executor that rejects the promise and no `error` handler can ever fire. `index.ts:2632-2660` and `index.ts:4257-4290` both document this at length; it is a recurring defect class in this file.
**How to avoid:** wrap the kill spawn in `try`/`catch` even though `taskkill.exe` and `kill` are `.exe`/ELF binaries that should not trip the guard — a missing `%SystemRoot%` producing an unspawnable path is the realistic case.

### Pitfall 10 — Reordering `finalize()` and the kill without re-reading `finalize`

**What goes wrong:** `finalize` (`index.ts:4482-4517`) is a `const` arrow declared **lower in the same executor** than the spawn guard, and `index.ts:4252-4256` records a real bug from exactly this: calling it earlier hits its temporal dead zone and throws a `ReferenceError` synchronously inside the executor. Moving the kill *before* `finalize(...)` in the timeout handler is safe (both are after the declaration); moving `finalize` is not.
**How to avoid:** at `index.ts:4519-4527` swap only the two statements — `proc.kill` becomes `killTree`, and it moves above `finalize(err(...))`. Change nothing about where `finalize` is declared.

---

## Code Examples

All examples are patterns to follow, composed from this repository's own shipped code plus the source-verified LLRT behaviour above. They are illustrative, not copy-paste-ready.

### The pure plan builder

```ts
// packages/backend/src/kill-plan.ts
// (module header per § Architecture Patterns)
import { type Platform } from "./platform";

export type KillRung = "term" | "kill";

export type KillTreePlan =
  | { kind: "none"; reason: "no-pid" }
  | { kind: "spawn"; file: string; args: string[]; windowsVerbatimArguments: boolean };

// The fallback interpreter name, spelled once. Mirrors spawn-plan.ts's
// DEFAULT_COMSPEC: the environment read is the caller's job, so only the
// fallback literal lives in this module.
export const DEFAULT_TASKKILL = "taskkill.exe";

export function buildKillTreePlan(input: {
  pid: number | undefined;
  platform: Platform | undefined;
  systemRoot?: string;
  rung: KillRung;
}): KillTreePlan {
  // REFUSAL FIRST, per the fail-closed branch order planMcpCliRegistration
  // established. SC-1's "guarded against undefined pid" lives here and nowhere
  // else, which is what makes it testable. `pid` must also be a positive
  // integer: a negative one would be a group reference nobody asked for, and
  // 0 means "my own group" on POSIX — i.e. suicide.
  if (input.pid === undefined || !Number.isInteger(input.pid) || input.pid <= 0) {
    return { kind: "none", reason: "no-pid" };
  }

  if (input.platform === "win32") {
    // Resolved by absolute path, never the bare name — the reasoning at
    // platform.ts:255-294 (getWhichCommand) applies unchanged. Trailing
    // separators are stripped by hand, not with `path`, because `path` resolves
    // to its POSIX flavour on the Linux CI runner.
    let root = input.systemRoot ?? "";
    while (root.length > 0) {
      const last = root[root.length - 1];
      if (last !== "\\" && last !== "/") break;
      root = root.slice(0, -1);
    }
    const file = root === "" ? DEFAULT_TASKKILL : `${root}\\System32\\${DEFAULT_TASKKILL}`;
    // /t = "Ends the specified process and any child processes started by it."
    // /f = "Specifies that processes be forcefully ended." Both quoted from the
    // Microsoft Learn taskkill reference. There is no graceful rung on Windows:
    // LLRT maps every signal name to one TerminateProcess, so a two-rung ladder
    // here would be theatre.
    return {
      kind: "spawn",
      file,
      args: ["/pid", String(input.pid), "/t", "/f"],
      // Simple switches and a decimal integer: no metacharacters, so the
      // runtime's own MSVC-convention quoting is correct. TRUE here would be a
      // defect — nothing in these args was escaped by this module.
      windowsVerbatimArguments: false,
    };
  }

  // POSIX, `undefined` INCLUDED — the pre-probe arm must be the one that cannot
  // regress (CMP-01), same rule as buildSpawnPlan's non-win32-first branch.
  //
  // The negative argument is a PROCESS GROUP reference and depends on the
  // provider having been spawned with `detached: true` (LLRT: process_group(0),
  // so pgid === pid). `--` terminates option parsing so `kill` reads `-<pid>`
  // as an operand rather than as a flag.
  //
  // This is a SPAWN and not `process.kill(-pid, …)` deliberately: Caido's LLRT
  // types process.kill's pid as u32 and rquickjs range-checks it through f64,
  // so a negative pid throws "Underflow" there while working perfectly under
  // Node — green on every CI leg this repo has, broken in production. See
  // 08-RESEARCH.md § Q2. Do not "simplify" this back.
  return {
    kind: "spawn",
    file: "kill",
    args: [input.rung === "kill" ? "-KILL" : "-TERM", "--", `-${String(input.pid)}`],
    windowsVerbatimArguments: false,
  };
}

export function shouldDetachProviderSpawn(platform: Platform | undefined): boolean {
  return platform !== "win32";
}
```

### The orchestrator glue

```ts
// packages/backend/src/index.ts
// ── Process lifecycle (LIF-01 / LIF-02) ─────────────────────────────

// Fire-and-forget by construction (Pitfall 7): every caller of this function is
// on a cancel/close/timeout path, and Caido's runtime does not deliver
// child_process callbacks while an RPC awaits — so awaiting a kill during a
// cancel would reintroduce the exact starvation class the watchdog exists for.
// Nothing here returns a promise and no caller's signature changes.
function killTree(proc: ChildProcessWithoutNullStreams, rung: KillRung): void {
  const plan = buildKillTreePlan({
    // Captured ONCE, here. Reading proc.pid again inside a deferred rung is
    // Pitfall 2 (pid reuse).
    pid: proc.pid,
    platform: host?.platform,
    systemRoot: readParentEnv().SystemRoot ?? readParentEnv().SYSTEMROOT,
    rung,
  });

  // Best effort at the process itself either way: on POSIX this is the
  // pre-existing single-pid behaviour, preserved so a failed group signal is
  // never a total regression (CMP-01).
  try { proc.kill(rung === "kill" ? "SIGKILL" : "SIGTERM"); } catch { /* already dead */ }

  if (plan.kind === "none") {
    sdk.console.log(`[drift lifecycle] no tree kill: ${plan.reason}`);
    return;
  }

  // C-8 / Pitfall 9: spawn() throws SYNCHRONOUSLY for an unspawnable path, and
  // a throw here would escape into a cancel handler that has no catch.
  try {
    const killer = spawnWithEnv(plan.file, plan.args, { … , detached: false });
    // Non-zero is the EXPECTED case as often as not — the pid frequently exited
    // between the decision and the spawn. Logged, never branched on: the exit
    // codes are undocumented by Microsoft and unmeasured by this project.
    killer.on("close", (code) =>
      sdk.console.log(`[drift lifecycle] tree kill exited code=${String(code)}`));
    killer.on("error", (e) =>
      sdk.console.log(`[drift lifecycle] tree kill spawn error: ${e.message}`));
  } catch (e) {
    sdk.console.log(`[drift lifecycle] tree kill threw synchronously: ${String(e)}`);
  }
}
```

### The SC-4 reordering — `cleanupMcpRuntime`

```ts
async function cleanupMcpRuntime(sdk, authState = "unknown", authMessage = ""): Promise<void> {
  await unregisterMcpFromCli("gemini", sdk);
  await unregisterMcpFromCli("codex", sdk);

  // LIF-01/LIF-02 (SC-4). The seam Phase 7 marked here is now ACTED ON: every
  // tracked pid dies BEFORE the directory holding its env-source files is
  // removed. The reverse order leaves a token-bearing MCP child reading files
  // that vanish underneath it — the credential-exposure case, not a tidiness
  // one. Do not move the rm above this loop.
  for (const [sessionId, proc] of activeProcesses.entries()) {
    killTree(proc, "kill");
    activeProcesses.delete(sessionId);
  }

  if (mcpTempDir !== undefined) {
    try {
      await rm(mcpTempDir, { recursive: true, force: true });
    } catch (error) { … }
    mcpTempDir = undefined;
  }
  …
}
```

### The POSIX behavioural test — with its own falsifying control

```ts
// packages/backend/src/kill-tree.posix.test.ts
// Skeleton lifted from mcp-server-spec.spawn.test.ts (temp dir + afterEach rm,
// os.tmpdir(), process.execPath), the house pattern for a real-spawn test.
//
// VEHICLE CAVEAT, stated before any result is cited: this runs under NODE.
// Node's detached:true is setsid(); Caido's LLRT is setpgid(0,0). BOTH yield
// pgid === child pid, which is the only property `kill -- -<pid>` depends on,
// so the mechanism transfers — but the RUNTIME does not, and no CI leg in this
// repository executes LLRT (assumption A2, open since Phase 5).

describe.skipIf(process.platform === "win32")("POSIX process-group termination (LIF-02)", () => {
  it("CONTROL: without detached, a single-pid kill leaves the grandchild alive", async () => {
    // The falsifying partner. If this ever goes green-by-passing — i.e. the
    // grandchild dies anyway — the whole premise of LIF-02 is wrong and the
    // next test proves nothing. Measured 2026-08-24 on darwin: survives.
    const { parentPid, grandchildPid } = await spawnFixtureTree({ detached: false });
    process.kill(parentPid, "SIGKILL");
    await settle();
    expect(isAlive(grandchildPid)).toBe(true);
  });

  it("with detached + the plan's group kill, the grandchild dies with the parent", async () => {
    const { parentPid, grandchildPid } = await spawnFixtureTree({
      detached: shouldDetachProviderSpawn("linux"),
    });
    // Through the PRODUCTION builder — never a locally re-derived argv, or the
    // test agrees with itself instead of with production (the rule
    // mcp-server-spec.spawn.test.ts:12-19 states).
    const plan = buildKillTreePlan({ pid: parentPid, platform: "linux", rung: "term" });
    expect(plan.kind).toBe("spawn");
    spawn(plan.file, plan.args, { stdio: "ignore" });
    await settle();
    expect(isAlive(parentPid)).toBe(false);
    expect(isAlive(grandchildPid)).toBe(false);
  });
});
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|---|---|---|---|
| POSIX provider launched through a generated `provider-launch-<id>.sh` (`export` + `exec`) | Direct `spawn(resolved, args, { env })` on **all** platforms, no shell | Phase 5, D-04 (`05-CONTEXT.md:100-107`) | The POSIX tree is **one level shallower** than the roadmap's Phase-2-era description. `activeProcesses` now holds the CLI itself, not a `bash` wrapper — so `detached` on that spawn puts the CLI at the head of the group, which is exactly right. |
| Windows `.cmd` unspawnable (EINVAL) | `cmd.exe /d /s /c "<escaped>"` + `windowsVerbatimArguments: true` | Phase 7, PRV-02 (`spawn-plan.ts:246-315`) | Adds a `cmd.exe` level on Windows `.cmd` paths only. `spawn-plan.ts:291-293` hands that level to this phase by name. |
| Hardcoded `/tmp` | `os.tmpdir()` through `getTempRoot(hostFacts)` | Phase 4, RUN-03 | Nothing to change here; the kill plan touches no path except `%SystemRoot%`. |
| Bare-name `which` spawn | `%SystemRoot%\System32\where.exe` by absolute path | Phase 6, `platform.ts:255-294` | The precedent `taskkill` must follow. |
| Optional `windowsVerbatimArguments` | **Required** member on `SpawnWithEnv` (`index.ts:1995-2011`) | Phase 7, T-07-03 | The precedent `detached` should follow: required, so every call site states its answer. |

**Deprecated / superseded:**

- **`taskkill` replaces the old `kill` tool on Windows.** *"This command replaces the kill tool."* **[CITED: learn.microsoft.com/…/taskkill]** — do not reach for a Windows `kill.exe`.
- **`process.kill(-pid, …)` as the group idiom** — correct for Node, **unusable under Caido's LLRT**. See § *Q2*. This is the single most important superseded assumption in the phase.
- **`windowsHide`** — declared nowhere in LLRT's option parsing; a no-op under Caido. Relevant to Phase 10 (UX-04), noted here so it is not mistaken for an available lever.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| **A1** | Caido ships the `caido` branch of `dependency-llrt` at or near `a5b021c` (2026-04-22), so the `detached` / `process.kill` findings describe the runtime users actually run. | § *The load-bearing unknown* (all of it) | **The phase's central mechanism.** If Caido ships an older fork without `detached`, LIF-02 has no POSIX mechanism at all and the phase needs a redesign. This is `04-RESEARCH.md` § *Pitfall 7*'s standing ceiling, unchanged and unclosable by research. **Mitigation: the Wave 1 spike in § *What is still genuinely unknown* closes it on the maintainer's own hardware for the cost of one build.** |
| **A2** | `taskkill`'s exit codes distinguish already-dead from access-denied. | § *Windows: exit codes* | Low, **because the recommendation is not to branch on them.** Becomes high the moment a plan does. |
| **A3** | `taskkill /T` cannot reach a grandchild whose intermediate parent has exited. | § *`/T`'s documented blind spot*, Pitfall 5 | Medium. Community-evidenced only. If wrong, the residual is smaller than recorded — an error in the safe direction. |
| **A4** | `kill(1)` is present and accepts `-TERM -- -<pgid>` on every Linux Drift supports. | § *Measured experiment* case C | Medium. Measured on **darwin only** this session. If absent on some host, the group kill silently no-ops. **Mitigation: run the integration test on the ubuntu CI legs, which turns this into a measurement.** |
| **A5** | libuv's `UV_PROCESS_DETACHED` calls `setsid()` (the basis for the Node-vs-LLRT divergence note). | § *Q1* | Low. Training knowledge, not source-read this session. The load-bearing half — that LLRT calls `process_group(0)` — **was** read, and the conclusion (`pgid === pid` under both) holds regardless. |
| **A6** | The provider CLIs do not themselves place their MCP child in a different process group. | § *Measured experiment*, the whole POSIX mechanism | **Medium-high, and untested.** If Claude Code or Gemini calls `setsid()` on its MCP child, the group kill misses it and LIF-02 is not closed. No CLI binary is executed anywhere in this project's CI (07-VALIDATION § *Vehicle caveat* item 3). **Mitigation: the same Wave 1 spike can check this with one real turn plus `ps -o pid,pgid,comm`.** Strongly recommend the planner schedule it. |
| **A7** | `%SystemRoot%` is present in the environment Caido's backend sees on Windows. | § *Reaching the binary* | Low. Phase 3 measured `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` present (P3-VARS) and `getWhichCommand` already depends on `SystemRoot` in shipped code with a bare-name fallback. The same fallback covers it here. |

---

## Open Questions

1. **OQ-1 — Does the planner amend SC-2's mechanism clause, or satisfy it literally?**
   - *What we know:* `detached: true` works under LLRT (source-verified). "Process-group signalling" is achievable — but only by spawning `kill`, not by `process.kill(-pid)`.
   - *What's unclear:* whether the roadmap author intended `process.kill(-pid)` specifically. The wording *"`detached: true` + process-group signalling"* is satisfied by the spawn form on a plain reading.
   - *Recommendation:* **satisfy it literally with the spawn form, and amend SC-2 in place** to name the mechanism and the reason — the Phase 5 SC-1 / Phase 7 SC-2 precedent (`05-CONTEXT.md` D-02). An unamended criterion invites a later reader to "fix" the code back to the broken spelling.

2. **OQ-2 — Should the POSIX arm keep a single-pid signal alongside the group signal?**
   - *What we know:* the group signal subsumes the single-pid one when `detached` took effect. If `detached` silently failed (an older LLRT, A1), the group form signals a group that does not exist and nothing dies at all.
   - *Recommendation:* **keep both** — `proc.kill(sig)` first, then the group spawn — as the § *Code Examples* glue shows. It costs one syscall and converts a total regression into a partial one. Note it explicitly as defence against A1, not as belt-and-braces.

3. **OQ-3 — Should the start-up sweep kill orphan processes, not just orphan directories?**
   - *What we know:* `sweepOrphanedMcpTempDirs` (`index.ts:3441`) removes residue directories but never processes. A hard-killed Caido leaves an MCP process holding a live token indefinitely.
   - *What's unclear:* how to identify "a Drift MCP process from a previous run" without image-name matching that could terminate an unrelated `node`.
   - *Recommendation:* **out of scope for Phase 8.** Record as a residual in `08-SECURITY.md`. Killing by image name is the kind of blast-radius decision that needs its own discuss-phase.

4. **OQ-4 — Does `cancelCliMessage` remain synchronous?**
   - *Recommendation:* **yes**, via fire-and-forget (Pitfall 7). This is the cheapest way to satisfy SC-5 by construction, and the planner should state it as a decision so the next reader does not "improve" it into an `await`.

5. **OQ-5 — How is SC-3 (*"zero lingering processes on either platform"*) evidenced?**
   - *What we know:* POSIX is fully evidenceable — the integration test in § *Code Examples* proves it on the ubuntu and macOS legs. Windows is not: no CI leg spawns a real CLI, and `index.ts` is unimportable.
   - *Recommendation:* claim SC-3 **PARTIAL** at phase close — proven on POSIX by execution, evidenced on Windows only for the *spawn contract* (that the right `taskkill` argv is built and delivered) — and route the behavioural half to Phase 10's real-machine confirmation, alongside SC-5 and SC-6 there. Say this in the plan, not at verification time.

---

## Environment Availability

Probed on the maintainer's darwin host this session. Windows rows are the CI runner's, not measured locally (C-5).

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | vitest, all CI legs | ✓ | v20+ (`.nvmrc` pins 20; CI matrix 20/22/24/26) | — |
| pnpm | build, test | ✓ | 9.0.0 (`packageManager`) | — |
| Vitest | the whole validation strategy | ✓ | 4.0.18 | — |
| `/bin/kill` | the POSIX group kill | ✓ (darwin, measured working) | system | Resolve via `resolveCommand("kill")`; on failure, degrade to the single-pid signal and log |
| `kill(1)` on Linux | same, on the ubuntu legs | **unmeasured** | — | Same. The integration test turns this into a measurement on the first CI run. |
| `taskkill.exe` | LIF-01 | **unmeasured** — present on every supported Windows by definition | — | Bare-name spawn if `%SystemRoot%` is unset |
| A native Windows Caido install | SC-3's behavioural half, A1, A6 | ✗ | — | **No fallback.** `windows-latest` CI proves the spawn contract only; the reporter confirmation is Phase 10 SC-5/SC-6. |
| Caido's LLRT binary as a test vehicle | A1, A6 | ✗ | — | **No fallback.** Upstream dropped the Windows target at `v0.6.0-beta` and `caido/dependency-llrt` publishes no releases (`07-RESEARCH.md:1376`). Source analysis plus the § *Wave 1 spike* on a **real macOS/Linux Caido** are the only substitutes — and the spike is genuinely available, unlike the Windows case. |

**Missing dependencies with no fallback:** a native Windows Caido install (SC-3 behavioural half); an executable LLRT vehicle in CI.
**Missing dependencies with fallback:** `kill(1)` on Linux (fallback: single-pid signal + logged degradation).

---

## Validation Architecture

Seeds `08-VALIDATION.md`. Modelled on `07-VALIDATION.md`, including its honesty about what CI can and cannot reach.

### Test Framework

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (repo root) — `resolve.alias` contains **only** `vue` and `pinia`; **no `caido:plugin` alias**, deferred to Phase 9 |
| **Quick run command** | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` |
| **Full suite command** | `pnpm exec vitest run` |
| **Typecheck** | `pnpm -r typecheck` |
| **Lint** | `pnpm lint` (`eslint . --max-warnings 0`) |
| **Measured runtime** | **Measured this session:** 36 test files, **534 tests — 528 passed, 6 skipped** (the 6 are `spawn-plan.win32.test.ts`, correctly skipped off win32), vitest-reported duration **971 ms**, wall clock **~1.8 s**. The `Verify (Windows)` job is ~90 s end to end with `timeout-minutes: 6` (`ci.yml`). |

**There is no `test` package script.** `package.json` defines `typecheck`, `lint`, `lint:fix`, `format`, `build`, `watch` only — the same correction `07-VALIDATION.md` had to make. Both CI legs invoke `pnpm exec vitest run`; use that spelling.

**Platform note — the constraint that governs this phase.** `packages/backend/src/index.ts` (**5,240 lines**) is **not importable under vitest**. Every behaviour that must be tested belongs in a pure module; everything left in `index.ts` is verified by comment-stripped source counts (`index.source.test.ts`'s balanced-paren `callArgumentTexts` scanner is the established vehicle) and by the compiler — strictly weaker than an executed assertion, and labelled as such in every row that relies on it.

**Baseline for CMP-01.** 534 tests at HEAD. At phase close the count must have **grown, with zero tests removed as obsolete**, verified mechanically — the check `05-REPORT.md` used for the 263 → 290 transition.

### Phase Requirements → Test Map

| Req / SC | Behavior | Test type | Automated command | File exists? |
|---|---|---|---|---|
| **LIF-01 / SC-1** | `buildKillTreePlan` on win32 emits `%SystemRoot%\System32\taskkill.exe` with `["/pid","<n>","/t","/f"]`, `windowsVerbatimArguments: false`; trailing separators stripped; bare-name fallback when SystemRoot is empty | unit | `pnpm exec vitest run packages/backend/src/kill-plan.test.ts` | ❌ Wave 0 |
| **SC-1** | `pid: undefined`, `NaN`, `0` and negatives all return `{ kind: "none", reason: "no-pid" }` — the guard, in the one place a test can reach it | unit | same | ❌ Wave 0 |
| **LIF-02 / SC-2** | POSIX arm emits `kill` with `["-TERM","--","-<n>"]`; `"kill"` rung emits `-KILL`; **`undefined` platform takes the POSIX arm** (CMP-01) | unit | same | ❌ Wave 0 |
| **SC-2** | `shouldDetachProviderSpawn` returns `false` on `"win32"` and `true` on `"darwin"`, `"linux"` and `undefined` | unit | same | ❌ Wave 0 |
| **LIF-02 / SC-3 (POSIX half)** | **Behavioural.** Control: no `detached` + single-pid kill → grandchild **survives**. Then: `detached` + the production plan's argv → parent **and** grandchild die | integration (skipIf win32) | `pnpm exec vitest run packages/backend/src/kill-tree.posix.test.ts` | ❌ Wave 0 |
| **LIF-01 / SC-3 (Windows half)** | `taskkill.exe` resolves and runs on a real Windows host; **exit code and stderr for an already-dead pid are RECORDED** (measurement, not assertion) | integration (skipIf ≠ win32) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.test.ts` — **only executes on the `windows-latest` leg** | ❌ Wave 0 |
| **LIF-01 / SC-3** | The win32 suite **actually ran** on the Windows host — a `--reporter=json` gate with the three arms (`pending > 0`, `total === 0`, `passed !== total`) | CI gate | new `ci.yml` step, mirroring `Gate: the win32 spawn-plan suite actually ran` | ❌ Wave 0 |
| **LIF-01 / SC-3** | The gate itself still exists and points at a file that exists — runs on **every** platform, so a deleted gate is noticed on Linux | unit (static) | `pnpm exec vitest run packages/backend/src/kill-tree.win32.gate.test.ts` — mirrors `spawn-plan.win32.gate.test.ts` | ❌ Wave 0 |
| **SC-4** | In `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`, the kill statement precedes every `rm` | static gate | `awk '/^async function cleanupMcpRuntime/,/^}/' packages/backend/src/index.ts \| sed -e 's://.*::' \| grep -n 'killTree\|rm(' ` — assert the `killTree` line number is lower than every `rm(` line number | ✅ (`awk`+`sed` pattern from 07-VALIDATION) |
| **SC-4** | `cleanupMcpRuntime` kills at all — the marker changes from seam to implementation | static gate | `awk '/^async function cleanupMcpRuntime/,/^}/' … \| grep -c 'killTree'` ≥ 1 | ✅ |
| **SC-1/SC-2 wiring** | All five in-scope sites route through `killTree`; the three out-of-scope leaf sites still call `proc.kill` directly | static gate | extend `packages/backend/src/index.source.test.ts` with a `killTree(` call-site count of 5 (or the count the reviewer measures) | ✅ (file exists) |
| **Pitfall 1 — the LLRT trap** | **`process.kill(-` appears nowhere.** The only vehicle-independent control against the Node-green/LLRT-broken regression | static gate | `test "$(grep -rc 'process\.kill(-' packages/backend/src \| grep -v ':0$' \| wc -l \| tr -d ' ')" = 0` | ❌ Wave 0 |
| **C-4** | `shell: true` still appears nowhere (the shipped Phase 7 gate, re-run) | static gate | `test "$(grep -rn 'shell: *true' packages/ --include='*.ts' \| wc -l \| tr -d ' ')" = 0` | ✅ |
| **SC-5 / CMP-01** | Full suite green on all five legs; test count **grew** from 534 with zero removals; typecheck and lint clean | regression | `pnpm exec vitest run && pnpm -r typecheck && pnpm lint` | ✅ |
| **SC-5** | The frontend cancel-race guard is byte-unchanged — the user-visible `[Cancelled]` semantics | tripwire | `git diff --stat <pre-phase> -- packages/frontend/src/views/ChatView.cancel.test.ts packages/frontend/src/views/ChatView.vue` is empty | ✅ |

### Sampling Rate

- **After every task commit:** `pnpm exec vitest run <the task's own suite>` + `pnpm -r typecheck` — < 5 s
- **After every plan:** `pnpm exec vitest run` + `pnpm lint` — ~2 s locally
- **Before `/gsd-verify-work`:** full suite green on **both** the ubuntu matrix (Node 20/22/24/26) and the `windows-latest` leg, with the run URL, per-step conclusions and the win32 execution log line recorded — the `07-VALIDATION.md` § *Windows evidence* format
- **Max feedback latency:** < 5 s locally; ~90 s for the Windows leg

### Wave 0 Requirements

- [ ] `packages/backend/src/kill-plan.ts` + `kill-plan.test.ts` — LIF-01, LIF-02, SC-1, SC-2
- [ ] `packages/backend/src/kill-tree.posix.test.ts` + a runtime-built fork-a-grandchild fixture (built by the test, **not** committed — the `spawn-plan.win32.test.ts` precedent) — LIF-02, SC-3
- [ ] `packages/backend/src/kill-tree.win32.test.ts` (skipIf ≠ win32) — LIF-01, SC-3
- [ ] `packages/backend/src/kill-tree.win32.gate.test.ts` + the matching `ci.yml` gate step — the false-green guard
- [ ] **Spike (strongly recommended):** a temporary diagnostics path that reports, from a **real Caido install on macOS/Linux**, (a) `typeof process.kill`, (b) that a `detached: true` spawn's group kill reaches a grandchild, and (c) the `pgid` of a real CLI's MCP child (`ps -o pid,ppid,pgid,comm`). This is the **only** available closure for assumptions **A1** and **A6**, the two highest-risk items in this document, and it runs on hardware the maintainer already owns.

No framework install is needed. No shared fixture module is needed beyond the per-file fixtures above.

### Vehicle caveat — what this phase's evidence will NOT cover

Written in the voice Phase 3 § *Vehicle caveat* and `07-VALIDATION.md` established, and deliberately not softened.

1. **It will not prove `index.ts`'s wiring.** No test executes `cancelCliMessage`, `closeCliSession`, `cleanupMcpRuntime` or the timeout handler. What is proven at those sites is *the source text delivers the right arguments in the right order*, by comment-stripped `awk`-scoped counts and by the compiler. That is the strongest available substitute; it is not a test.
2. **It will not prove Caido's LLRT.** `detached` and `process.kill`'s `u32` typing are **source-verified and never executed**. Every CI leg runs Node. Assumption A2 (Phase 5's) stays open, and this phase adds **A1** and **A6** to it. The Wave 0 spike is the cheapest partial closure and it covers POSIX only.
3. **It will not prove that any real CLI's MCP child is in the killed group.** No CLI binary is executed anywhere in this project's CI. A6 is untested by construction.
4. **It will not prove SC-3 on Windows behaviourally.** A CI job proves the *spawn contract* — that the right `taskkill` argv is built and reaches `spawn`. It does not prove a real turn's tree came down. That belongs beside Phase 10 SC-5.
5. **It will not prove the `/T` residual is bounded in practice.** Pitfall 5's dead-intermediate-parent hole is a source-and-community claim; nothing observes how often it bites.

### Manual-Only Verifications

| Behavior | Requirement | Owning phase | Gates this phase? | Instructions |
|---|---|---|---|---|
| A real cancel on macOS/Linux leaves no `node mcp-server.mjs` behind | LIF-02 / SC-3 | **Phase 8 (this one)** | **Yes** — recommend a `checkpoint:human-verify` | Start a Claude turn in Caido, note `pgrep -f mcp-server.mjs`, click Stop, re-run `pgrep`. Expect zero. **This is cheap, decisive, and on hardware the maintainer owns.** |
| A real cancel on native Windows leaves no `node.exe` behind | LIF-01 / SC-3 | **Phase 10** | **No** — hardware-blocked (C-5) | Reporter or any Windows user: start a turn, cancel, check Task Manager for orphaned `node.exe`. |
| LLRT honours `detached` on the shipped Caido build | A1 | **Phase 8** | **Recommended** — the Wave 0 spike | See Wave 0 item 5. |

---

## Security Domain

`workflow.security_block_on` is not set in `.planning/config.json`; Phase 7 used `asvs_level: 1`, `block_on: high`. Assume the same.

### The threat this phase exists to close

**An orphaned process retaining `CAIDO_TOKEN` in its environment after the user cancelled.** Characterised for the planner's `<threat_model>` block:

- **Asset:** the Caido session token, extracted from `window.localStorage.CAIDO_AUTHENTICATION` and injected into the MCP server's environment by `buildMcpRuntimeEnv` (`index.ts:1235-1252`). It is a **bearer** credential for the Caido GraphQL API with the full authority of the logged-in user.
- **Attack surface:** an orphan is a long-lived process holding a live bearer token in its environment block, on a machine whose owner believes the operation was stopped. `/proc/<pid>/environ` is owner-readable on Linux; a local process running as the same user can read it on any platform. It also holds an open stdio pipe and, on POSIX, may re-inherit the terminal.
- **What an orphan can still do:** everything Drift's ~18 tools can do — `search_history` over the user's entire proxy traffic (including credentials captured in flight), `send_request` replay against live targets from the user's own machine and IP, `create_finding`, environment reads. The tool policy is delivered by environment variable at spawn (`DRIFT_ALLOWED_TOOLS` etc.), so **a policy tightened after the orphan was spawned does not apply to it** — the orphan runs under the policy that was in force when it started.
- **What it can no longer do:** its context file has been deleted by the temp sweep, so context-dependent tools degrade — but the token is in memory, not in that file, so authentication is unaffected. **Deleting the file does not revoke anything.**
- **STRIDE:** *Information Disclosure* (token at rest in a live process environment) chained to *Elevation of Privilege* (an unattended agent retains proxy and replay authority past the point of user consent). Cancellation is a consent-withdrawal action; a mechanism that leaves the agent running defeats it.
- **Required mitigation ordering — this is the SC-4 requirement restated as a security control:** **terminate the whole tree, then remove the files.** The reverse order is worse than doing nothing in one specific way: it destroys the evidence (which pid, which session, which policy) while leaving the capability. Deleting a token-bearing file is not revocation; killing the process that read it is.
- **Residual, to be recorded rather than mitigated:** (a) Pitfall 5's dead-intermediate-parent hole on Windows; (b) a hard-killed Caido leaves an orphan no start-up sweep touches (OQ-3); (c) real revocation would require rotating the Caido session token, which Drift cannot do.

### Applicable ASVS categories (L1)

| ASVS category | Applies | Standard control for this phase |
|---|---|---|
| V2 Authentication | indirectly | The token is Caido's session credential; Drift only transports it. Nothing here mints or validates it. |
| V3 Session Management | **yes** | **Session termination must actually terminate.** A cancelled session whose agent keeps running is a session-invalidation failure. This is the phase's ASVS anchor. |
| V4 Access Control | **yes** | The tool allowlist is delivered at spawn time and is immutable for that process's life. Killing the process is the only enforcement of a *narrowed* policy. |
| V5 Input Validation | **yes** | The pid reaches an argv. It must be validated as a positive integer **inside the pure module** (`Number.isInteger` + `> 0`), never string-concatenated at the call site. `%SystemRoot%` is attacker-influenceable in principle and is only ever path-joined, never interpreted. |
| V6 Cryptography | no | No cryptographic operation in this phase. |
| V7 Error Handling & Logging | **yes** | Kill diagnostics must be **value-free**: pid, exit code, platform — never an environment value or a token-bearing path. The `formatMcpRemoveFailure` "three scalars, `not.toMatch(/[/\\]/)`" precedent (07-VALIDATION) applies directly. |
| V12 Files & Resources | **yes** | The `rm` ordering. Removing a file another live process is reading is the defect SC-4 names. |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---|---|---|
| Orphaned process retaining a bearer credential | InfoDisc → EoP | Process-tree termination; kill **before** removing env-source files |
| Command injection through a spawn | Tampering / EoP | No `shell` option anywhere; direct `.exe`/ELF spawn; pid rendered from a validated integer, never interpolated (C-4, PRV-02) |
| PID reuse — terminating an unrelated process | DoS | Re-check liveness (`process.kill(pid, 0)`) inside deferred rungs; capture pid once at plan-build time; prefer the group form on POSIX (Pitfall 2) |
| Untrusted `%PATH%` supplying a hostile `taskkill` | Spoofing / EoP | Resolve `%SystemRoot%\System32\taskkill.exe` by absolute path, per the `getWhichCommand` precedent (`platform.ts:255-294`) |
| Credential leakage through diagnostics | InfoDisc | Value-free log lines; no environment dump; the existing `redactDebugText` boundary is not widened by this phase |
| Silent failure of a security control | — | The `grep -c 'process\.kill(-'` = 0 static gate. A control that fails green is worse than no control, and this one fails green on every runner the project has (Pitfall 1) |

---

## Sources

### Primary (HIGH confidence — source read this session)

- **`caido/dependency-llrt`, branch `caido`** (the branch and repo `07-RESEARCH.md:1535` pins at `a5b021c51d1521f32018d3f3f2e70291df50501d`, 2026-04-22). Downloaded and grepped this session:
  - `modules/llrt_child_process/src/lib.rs` — `detached` → `process_group(0)` / `creation_flags(0x08)` (`:448, :462, :512-521`); `ChildProcess.kill` (`:157-180`); `pid` set synchronously at `:215`; `windowsVerbatimArguments` → `raw_arg` (`:433-441`); `wait_for_process`'s `kill_rx` → `child.kill()` (`:343-345`)
  - `modules/llrt_process/src/lib.rs` — `process.kill` bound at `:197-199`, `globals.set("process", …)` at `:214`, module export declared at `:236`
  - `libs/llrt_utils/src/signals.rs` — `pub fn kill(ctx, pid: u32, …)` (`:127`); `kill_process_raw` unix/windows arms (`:88-95`, `:98-123`); `WINDOWS_SIGTERM = -1` (`:44`); `parse_signal` (`:46-86`)
- **`DelSkayn/rquickjs` @ `111951b1a31075bdff46684e0ff29f37ff2a04b2`** — the exact commit `caido/dependency-llrt`'s `Cargo.lock:2856-2858` pins. `core/src/value/convert/from.rs:143-157` (`number_match_range`), `:249-261` (the `val:` macro arm), `:283-287` (`f64: u32 …`). **This is the file that settles Q2.**
- **This repository, read this session:** `packages/backend/src/index.ts` (all cited line numbers verified by `sed -n`), `spawn-plan.ts`, `platform.ts`, `index.source.test.ts`, `spawn-plan.win32.gate.test.ts`, `mcp-server-spec.spawn.test.ts`, `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `node_modules/.pnpm/@caido+quickjs-types@0.25.4/…/llrt/child_process.d.ts` and `…/llrt/process.d.ts`
- **Executed measurement, darwin, this session:** the four-case process-group experiment in § *Measured experiment*, including the case-B `The "pid" argument must be of type number. Received type number (4294881050)` rejection and the case-A control reproducing LIF-02
- **Executed measurement:** `pnpm exec vitest run` → 36 files, 534 tests, 528 passed / 6 skipped, 971 ms

### Secondary (MEDIUM confidence — vendor documentation)

- **[CITED: learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill]** — syntax, `/pid`, `/t`, `/f` semantics, and the *"This command replaces the kill tool"* note. Fetched this session. **Documents no exit codes.**

### In-repo planning artifacts (HIGH confidence for project facts, read this session)

- `.planning/ROADMAP.md` (Phase 8 §, plus Phases 5/7/9/10 for the ownership chain)
- `.planning/REQUIREMENTS.md` (LIF-01, LIF-02, and the Phase 5 closure record)
- `.planning/phases/03-…/03-FINDINGS.md` (vehicle caveat, P0-ENV, P1-CMD)
- `.planning/phases/05-…/05-RESEARCH.md` (findings L-2, L-4), `05-CONTEXT.md` (D-04)
- `.planning/phases/07-…/07-RESEARCH.md` (the LLRT commit pin), `07-VALIDATION.md` (contract format), `07-VERIFICATION.md`, `07-SECURITY.md`, `07-PATTERNS.md`
- `./CLAUDE.md`

### Tertiary (LOW confidence — flagged, not relied on)

- WebSearch results on `taskkill /T` and grandchildren whose parent has exited: [learnmandu.com/blog/taskkill](https://learnmandu.com/blog/taskkill), [electron-userland/electron-builder#2894](https://github.com/electron-userland/electron-builder/issues/2894), [gitlab-org/gitlab-runner!1797](https://gitlab.com/gitlab-org/gitlab-runner/-/merge_requests/1797). Forum and issue-tracker level. Used only for Pitfall 5, which is recorded as `[ASSUMED]` (A3) and mitigated by acceptance rather than by code.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Current kill surface / ordering bug | **HIGH** | Every site opened with `sed -n` and quoted verbatim; the `LIF-01 SEAM` comment names the defect itself |
| LLRT `detached` support | **HIGH** | Rust source downloaded and read at the pinned branch; bounded only by A1 (which fork Caido ships) |
| LLRT `process.kill(-pid)` throws | **HIGH** | Three files read, including rquickjs at the exact `Cargo.lock`-pinned commit |
| POSIX group-kill mechanism | **HIGH** on darwin (executed, with a falsifying control); **MEDIUM** on Linux (unexecuted, A4) |
| `taskkill` argv and `/t` semantics | **MEDIUM** | Vendor-documented, unexecuted (C-5) |
| `taskkill` exit codes | **LOW** | Undocumented by the vendor. **Recommendation is not to branch on them.** |
| `/T` dead-parent limitation | **LOW** | Community evidence only (A3) |
| That a real CLI's MCP child lands in the killed group | **LOW** | A6 — no CLI binary is executed anywhere in this project. **The highest-value open item.** |
| Module split / testability strategy | **HIGH** | Four phases of in-repo precedent, all read this session |
| Validation architecture | **HIGH** | Framework, config, commands, counts and runtime all measured, not assumed |

**Research date:** 2026-08-24
**Valid until:** 2026-09-23 (30 days). Re-verify sooner if `caido/dependency-llrt` pushes a new `caido` branch (every Q1–Q5 finding is commit-specific), if `@caido/quickjs-types` moves past 0.25.4, or if Phase 9 lands the `caido:plugin` vitest alias — which would make `index.ts` importable and materially change § *Validation Architecture*.
