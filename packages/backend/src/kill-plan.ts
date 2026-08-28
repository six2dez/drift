// The termination plan: given a pid, the host platform and the parent
// environment, decide WHAT file to hand `spawn`, WITH which argument array, to
// bring down a whole process TREE — or refuse, explicitly, when there is
// nothing to kill. The two smaller decisions on the same subject live here for
// the same reason: whether the provider spawn takes its own process group
// (`shouldDetachProviderSpawn`) and whether a deferred rung's target is still
// the process we spawned (`hasTrackedProcessExited`). Three properties are
// load-bearing here and all three are
// mechanically checkable. This module performs ZERO I/O; it reads no module
// state; and it carries exactly ONE import statement — `grep -cE '^import'`
// over this file returns 1, which is the machine form of both claims at once.
// `pid`, `platform`, `env` and `rung` are INJECTED parameters, never read from
// the runtime.
//
// The one import is `./platform`, and it is here for exactly two reasons, in the
// `spawn-plan.ts` house style of justifying each import a module allows:
// `Platform` is the narrow three-member union that `buildKillTreePlan` and
// `shouldDetachProviderSpawn` gate on, and restating that union here would let
// the two copies drift; and `resolveWindowsSystemBinary` is the system-binary
// ladder this module's win32 arm used to carry its OWN copy of, comment for
// comment. Widening an EXISTING named import rather than adding a second
// statement is deliberate — the zero-other-imports property above is asserted by
// `grep -cE '^import'` returning 1, and a second statement would break a claim
// that has nothing to do with what was actually added. Deliberately NOT imported: `os` and `process` (Phase 4
// D-02 gives `index.ts` the one guarded runtime read of either, and a module
// that touches neither has no hidden input a test cannot supply), `path` (it
// resolves to its POSIX flavour on the Linux CI runner, where it would corrupt
// a Windows path — the same reason `platform.ts` spells its backslash join by
// hand), and `child_process` (a module that cannot spawn has no hidden effect a
// test cannot see). An unused import is also a hard build failure here (tsconfig
// `noUnusedLocals` → TS6133; `pnpm lint` runs at `--max-warnings 0`), so the
// import count is self-enforcing.
//
// WHY THIS LIVES OUTSIDE `index.ts`. `index.ts` is 5,244 lines (measured at
// commit 0f0564a, this plan's base), declares no `caido:plugin` alias for vitest
// and therefore cannot be imported by any test this project can run — so a
// termination argv assembled inside it is unverifiable by construction. The
// maintainer also cannot test native Windows locally, which makes "unverifiable
// by construction" the same thing as "unverified on the only platform this
// milestone is about". 08-RESEARCH.md § Pitfall 3 names the concrete failure:
// `String(undefined)` is the word "undefined", and `taskkill /pid undefined /t
// /f` is a silent no-op with a non-zero exit nobody reads. Both the GUARD and
// the RENDERING of the pid therefore live HERE, where `kill-plan.test.ts`
// reaches every arm from literal inputs.
//
// MEASUREMENT — **CORRECTION, 2026-08-27.** This slot carried an ABSENCE for
// most of this phase. It now carries readings, taken on real hardware during
// UAT. The superseded text is PRESERVED below as a block quote and is NEVER
// deleted — the `07-VALIDATION.md` marked-correction convention, and the same
// reason `spawn-plan.ts` keeps its own falsified prediction at :40-80: deleting
// it would hide that a measurement was planned, budgeted, deferred and finally
// taken. Every line prefixed `// > ` below is SUPERSEDED and is not a live claim
// of this module; everything not so prefixed is.
//
// SUPERSEDED (written 2026-08-24, after the hardware checkpoint was waived):
//
// > MEASUREMENT — AND THE TWO THINGS THAT WERE **NOT** MEASURED. `spawn-plan.ts`
// > records its measured verdicts at :40-80 in this slot; the honest entry here
// > is an absence, and it is written as one rather than softened. Phase 8's
// > Wave-0 spike (plan 08-01) built a probe to close assumptions A1 and A6 on a
// > real Caido install; the maintainer waived its hardware checkpoint on
// > 2026-08-24 without supplying readings, so the probe was bundled and never
// > executed. The two verdict lines, quoted verbatim from `08-SPIKE.md`:
// >
// >   A1 — does the shipped Caido LLRT honour `detached: true`?
// >        Caido version: **not recorded — spike not run**
// >        Verdict:       **OPEN — not measured**
// >   A6 — is the CLI's MCP child in the CLI's process group?
// >        `claude` pid / `mcp-server.mjs` pgid: **not recorded — spike not run**
// >        Verdict:       **OPEN — not measured**
//
// LIVE VERDICTS (2026-08-27, probe build 68199fa installed in a real macOS
// Caido, darwin 25.6.0; recorded in `08-UAT.md` tests 1 and 2):
//
//   A1 — does the shipped Caido LLRT honour `detached: true`?
//        Reading: `spikeDetachedGroupKill: "grandchild-died (detached honoured)"`
//        Verdict: **CLOSED FAVOURABLY — measured**
//   A6 — is the CLI's MCP child in the CLI's process group?
//        Reading:  PID   PPID  PGID  ARGS
//                 43921  43752 43752 …/codex
//                 44284  43921 44284 …/node …/drift-mcp-<token>/mcp-server.mjs
//        Verdict: **FALSIFIED — measured**
//
// WHAT EACH VERDICT CHANGES HERE.
//
// A1 CLOSED FAVOURABLY. The POSIX arm below no longer rests on SOURCE ANALYSIS
// alone. The source is still the mechanism — `caido/dependency-llrt`, branch
// `caido`, commit `a5b021c`,
// `modules/llrt_child_process/src/lib.rs:448,462,512-521`, which calls
// `command.process_group(0)` on unix for a detached spawn, making pgid equal the
// child pid — but it is now CORROBORATED by execution on the runtime a user
// actually runs. The failure mode that paragraph warned about (a shipped fork
// that ignores `detached`, so the group reference names a group that was never
// created while every CI leg stays green) did not occur.
//
// Recorded decision OQ-2 (`08-02-PLAN.md`) — `killTree` keeps the single-pid
// signal ALONGSIDE the group spawn — SURVIVES A1's closure, but its reason
// changes and the new reason must be written down or the rung will read as
// redundant to the next person: it is no longer defence against an UNMEASURED
// runtime, it is defence against a FUTURE Caido that rebases its LLRT fork. One
// measurement closes a version, not a dependency. Do not delete that rung.
//
// A6 FALSIFIED, and this is the one that changed the mechanism. The provider CLI
// (codex, pid 43921) sat in process group 43752 while its own `mcp-server.mjs`
// child (pid 44284) sat in group 44284 — a group of its own. A group signal
// aimed at the CLI's group therefore CANNOT reach the token-bearing child, and
// OQ-2's single-pid rung does not rescue it either because that rung signals the
// CLI, not the child. The caveat `08-UAT.md` records travels with the verdict:
// this is ONE provider (Codex), on an instance Drift did not spawn, and Claude
// Code — the active provider — remains unmeasured. That is why the group kill
// above is KEPT rather than replaced: it is still correct wherever the child
// does stay in the CLI's group.
//
// The answer to A6 is the ORPHAN REAP at the foot of this file, which identifies
// Drift's MCP children by their own argv and signals POSITIVE single pids. GD-01
// requires that path to remain independent of process groups; the group
// reference above is the one place in this module where a negative operand is
// correct, and it is correct for a different mechanism.
//
// ONE MORE READING, because it changes why an absent import was right. The same
// probe found `typeof process.kill === "undefined"`, `process.env` empty, and
// `process.version` / `process.versions` unavailable — four independent readings
// that are not four coincidences. Caido's plugin sandbox re-exports a heavily
// restricted `process` shim; this is a POLICY of the sandbox, not a property of
// LLRT, whose own `llrt_process` source does define `kill`. So this module's
// refusal to import `process` at all was correct for a STRONGER reason than the
// one originally written: not "a module that touches neither has no hidden input
// a test cannot supply", but "the runtime does not supply it in the first
// place".

import { type Platform, resolveWindowsSystemBinary } from "./platform";

// The rung of the two-step ladder a POSIX caller is on. Windows has no second
// rung and says so at its own branch below.
export type KillRung = "term" | "kill";

// Every reason a plan builder in this module can REFUSE, in one union so the
// `none` arm has a single vocabulary rather than one per builder. Widened by
// plan 08-06 from the original lone `no-pid`; every existing consumer only ever
// reads `plan.reason` into a log line, so no call site changes shape.
//
//   * `no-pid`                — the pid is unusable (see `isUnusablePid`).
//   * `unsupported-platform`  — win32, at a builder that has no Windows arm.
//   * `bad-marker`            — the session directory name failed its shape
//                               check, so no scan pattern was composed at all.
//   * `session-active`        — a class-wide scan was asked for while a live
//                               session's own MCP child would match it.
export type KillPlanRefusal =
  | "no-pid"
  | "unsupported-platform"
  | "bad-marker"
  | "session-active";

// One decision, four projections — the discriminated union CLAUDE.md names as
// the house convention, keyed on `kind`. The `spawn` arm mirrors `SpawnPlan`'s
// three projections exactly (`file`, `args`, `windowsVerbatimArguments`) so
// `index.ts` consumes a kill plan and a launch plan with the same three lines.
// The `none` arm carries no `file` and no `args` ON PURPOSE: a refusal that
// still exposed an argv could be spawned by a call site that forgot to switch on
// `kind`, which is the SC-1 guard defeating itself.
export type KillTreePlan =
  | { kind: "none"; reason: KillPlanRefusal }
  | {
      kind: "spawn";
      file: string;
      args: string[];
      windowsVerbatimArguments: boolean;
    };

// The fallback killer name, spelled once. Mirrors `spawn-plan.ts`'s
// DEFAULT_COMSPEC exactly, including its note: reading the environment is the
// CALLER's job, so only the fallback literal lives in this module. A bare name
// is resolved by Windows through a search order that includes the working
// directory the plugin host chose, so it is the LAST resort and never the
// preference (T-08-03).
//
// KEPT, and the distinction matters. G-01 did not find this constant wrong; it
// found that an empty environment reached it FIRST rather than last, which made
// "last resort" a description of the code's shape rather than of its behaviour.
// The derived-root rung above it is what makes the phrase true. Do not delete
// this arm to "finish" that fix: a host where no root can be read AND none can
// be derived still has to be handed something, and a loud bare name is what it
// gets.
export const DEFAULT_TASKKILL = "taskkill.exe";

// THE pid refusal, spelled ONCE. Both `buildKillTreePlan` and
// `buildOrphanKillPlan` call this rather than each carrying its own four-part
// check, because two copies of a fail-closed guard are two copies that can
// diverge — and the one that diverges is the one nobody re-read.
//
// The four rejected shapes each have their own reason, and none of them is
// hypothetical: `undefined` is what `ChildProcess.pid` reads once the child has
// been reaped; `0` means "every process in MY OWN group" on POSIX, i.e. Drift
// signalling itself; a NEGATIVE value is already a group reference, so accepting
// one would let a caller aim at a group nobody asked for. A non-integer (NaN,
// 1.5) cannot be a pid at all.
function isUnusablePid(pid: number | undefined): boolean {
  return pid === undefined || !Number.isInteger(pid) || pid <= 0;
}

// The ONLY way a pid becomes a termination spawn on this codebase.
//
// BRANCH ORDER IS PART OF THE CONTRACT: refusal, then win32, then POSIX with
// `undefined` folded into it. Reordering these changes behaviour, not style.
export function buildKillTreePlan(input: {
  pid: number | undefined;
  platform: Platform | undefined;
  env: Record<string, string | undefined>;
  systemRootFallback: string;
  rung: KillRung;
}): KillTreePlan {
  // REFUSAL FIRST, per the fail-closed branch order `planMcpCliRegistration`
  // established. SC-1's "guarded against an undefined pid" lives in
  // `isUnusablePid` above and NOWHERE else, and that is precisely what makes it
  // testable: `index.ts` cannot be imported under vitest, so a guard written at
  // the call site is a guard no assertion can reach (Pitfall 3).
  if (isUnusablePid(input.pid)) {
    return { kind: "none", reason: "no-pid" };
  }

  // THEN win32. The literal "win32" only — `undefined` falls through to the
  // POSIX arm below, deliberately.
  if (input.platform === "win32") {
    // The system-binary ladder, through the ONE implementation in `platform.ts`.
    // This arm used to carry its own copy of it — the dual-casing read and the
    // hand-written trailing-separator strip, comment for comment — and
    // `getWhichCommand` carried the other. Two copies of a security decision are
    // two copies that can diverge, and the one that diverges is the one nobody
    // re-read. D-P4's point is unchanged and is what makes this call possible:
    // taking an `env` RECORD rather than a resolved `systemRoot` scalar keeps
    // this Windows-only decision inside a test's reach instead of stranding it
    // in `index.ts`.
    //
    // `systemRootFallback` is the rung BETWEEN that read and the bare name, and
    // it exists because the read returns nothing on a real install: measured
    // 2026-08-27, `parentEnvKeyCount: 0`. It is a REQUIRED member so the
    // compiler forces every call site to state an answer (T-08-36).

    // /t = "Ends the specified process and any child processes started by it."
    // /f = "Specifies that processes be forcefully ended." Both quoted from the
    // Microsoft Learn `taskkill` reference.
    //
    // THERE IS NO GRACEFUL RUNG ON WINDOWS, and `input.rung` is therefore
    // deliberately unread on this branch: LLRT maps every signal name to one
    // `TerminateProcess` and consumes its kill sender on the first call
    // (08-RESEARCH.md § Q4, Pitfall 4), so a two-rung ladder here would read as
    // graceful-then-forceful while being forceful-then-nothing. Do not "restore
    // symmetry" by branching on the rung.
    return {
      kind: "spawn",
      // Absolute path when a root is known or derivable, bare name only as a
      // genuine last resort — reachable and tested, never the first answer.
      file: resolveWindowsSystemBinary({
        env: input.env,
        fallbackRoot: input.systemRootFallback,
        binary: DEFAULT_TASKKILL,
      }),
      args: ["/pid", String(input.pid), "/t", "/f"],
      // FALSE, and it is a statement rather than a placeholder. Simple switches
      // and a decimal integer: nothing in this argv was escaped by this module,
      // so the runtime's own MSVC-convention quoting is correct and `true` here
      // would be a defect (Phase 7, Pitfall B).
      windowsVerbatimArguments: false,
    };
  }

  // THEN POSIX, with `undefined` INCLUDED as the fall-through. The POSIX arm is
  // the one that must not regress — macOS and Linux are the shipping user base
  // (CMP-01) — so a pre-probe platform, or one `normalizePlatform` refused to
  // recognise, takes the arm whose behaviour is already known to work. This is
  // the same rule as `buildSpawnPlan`'s non-win32-first branch.
  //
  // Three things about the argv, all of them load-bearing:
  //
  //   1. The NEGATIVE operand is a PROCESS GROUP reference, not a pid. It only
  //      reaches the CLI's MCP child because the provider was spawned detached
  //      (`shouldDetachProviderSpawn` below), which under LLRT is
  //      `process_group(0)` and therefore makes pgid equal the child pid. Take
  //      `detached` away and this argv names a group that does not exist.
  //   2. `--` terminates option parsing, so `kill` reads `-<pid>` as an OPERAND
  //      rather than as a flag. Without it the negative number is an unknown
  //      option and nothing is signalled.
  //   3. This is a SPAWN of the OS `kill` utility, and NOT the runtime's own
  //      negative-pid signalling form — process.kill(-pid, …) — deliberately.
  //      Caido's LLRT types that parameter as a Rust `u32` and rquickjs
  //      range-checks it through `f64`, so a negative value raises an
  //      `Underflow` conversion error there while working perfectly under Node:
  //      green on every CI leg this repository has, broken on every real
  //      install, and swallowed by the `catch { /* already dead */ }` every kill
  //      site in this codebase writes. See 08-RESEARCH.md § Q2 and § Pitfall 1.
  //      DO NOT "simplify" this back into a signal; `index.source.test.ts`
  //      carries a comment-stripped gate that will go red on every leg if you
  //      do.
  return {
    kind: "spawn",
    file: "kill",
    args: [
      input.rung === "kill" ? "-KILL" : "-TERM",
      "--",
      `-${String(input.pid)}`,
    ],
    // Nothing here was escaped by this module, and the flag is inert off win32
    // in any case. Stated rather than omitted, for the same reason the win32 arm
    // states it.
    windowsVerbatimArguments: false,
  };
}

// Has the process WE SPAWNED finished? The deferred forceful rung's IDENTITY
// guard, and the reason it has to exist at all: `isPidAlive` (`index.ts`) proves
// LIVENESS, and a pid the OS has REASSIGNED is alive. Signal 0 answers "does a
// process with this number exist and may I signal it", which is `true` for a
// stranger holding the number — so a liveness probe discriminated only the
// harmless dead-and-not-yet-reused case and passed in the dangerous one. On
// win32 the `/t /f` argv would then take an unrelated process's WHOLE TREE
// (threat T-08-04, review CR-02).
//
// Identity cannot come from the number, so it comes from the HANDLE — and the
// handle's answers arrive here as INJECTED scalars for exactly the reason
// `buildKillTreePlan` takes `platform` and `env` rather than reading them: the
// decision is then reachable from literal inputs, and `index.ts`, which no test
// in this project can import, keeps only the property reads.
//
// THREE INPUTS, BECAUSE NO SINGLE ONE COVERS BOTH RUNTIMES. This is the part
// that must not be "simplified" back to a bare `exitCode !== null`:
//
//   * NODE's `ChildProcess` carries `exitCode` (a number once the process has
//     exited, `null` while it runs) and `signalCode` (the signal name once it
//     was killed by one, else `null`). Authoritative and immediate — and Node
//     is the only vehicle any CI leg in this repository runs.
//   * CAIDO'S LLRT `ChildProcess` carries NEITHER. Source-verified twice over:
//     `caido/dependency-llrt` branch `caido`, `modules/llrt_child_process/src/
//     lib.rs` defines `pid` and `kill` on the class and nothing else, and
//     `@caido/quickjs-types`'s `child_process.d.ts` declares that same surface —
//     which is why `tsc --noEmit` REJECTS `proc.exitCode` in this codebase.
//     There both reads are `undefined`, and `undefined !== null` is TRUE: an
//     `exitCode !== null` guard would return early for every pid on every real
//     install, silently disabling the forceful rung while staying green on all
//     five CI legs. That is finding L-4's failure shape verbatim, and it is the
//     same trap `kill-plan.ts`'s POSIX arm documents for the negative-pid form.
//   * `observedExitEvent` is what LLRT DOES supply: the `exit` event it emits on
//     the handle (`lib.rs`'s `emit_str(..., "exit", ...)`). Only the process we
//     spawned can fire it, so it is identity in the same sense. The caller
//     records it; best-effort under Caido, whose runtime does not reliably
//     deliver child_process callbacks while an RPC is awaiting.
//
// `undefined` therefore resolves toward NOT EXITED at both scalar reads, which
// keeps this strictly subtractive relative to the rung that ships today
// (CMP-01): it can skip a kill on evidence, never on ignorance.
export function hasTrackedProcessExited(input: {
  observedExitEvent: boolean;
  exitCode: number | null | undefined;
  signalCode: string | null | undefined;
}): boolean {
  if (input.observedExitEvent) return true;
  if (typeof input.exitCode === "number") return true;
  return typeof input.signalCode === "string";
}

// Whether the provider CLI spawn should be given its own process group.
//
// win32 gets `false` for two independent reasons, either of which alone would
// settle it: `taskkill /t` walks `ParentProcessId` and is INDIFFERENT to process
// groups, so detaching buys nothing there; and LLRT's win32 arm implements the
// option as `DETACHED_PROCESS` rather than `CREATE_NEW_PROCESS_GROUP`, which
// would perturb the console-attachment contract Phase 7 measured on a real
// windows-latest host.
//
// `undefined` takes the POSIX arm for CMP-01, the same rule as
// `buildKillTreePlan` above: the platform that must not regress is the one an
// unrecognised value falls into.
export function shouldDetachProviderSpawn(
  platform: Platform | undefined,
): boolean {
  return platform !== "win32";
}

// ── The orphan reap: identity without a handle and without a group ──
//
// Everything above answers "how do I kill a process I SPAWNED". Everything below
// answers a harder question this phase's UAT forced open on 2026-08-27: how do I
// kill a token-bearing `mcp-server.mjs` that Drift did NOT spawn, whose parent
// Drift did not spawn either, and on which Drift holds no handle at all (UAT gap
// 4)? `killTree` cannot: it walks `activeProcesses`, and such a process is not
// in it.
//
// THE IDENTITY IS THE ARGV, and it is three things rather than one: Drift's own
// per-session temp directory name (`drift-mcp-` plus a session-unique hex
// token), the MCP server script name, and THEIR ADJACENCY — the directory
// immediately containing the script. That triple appears verbatim on the command
// line of every MCP server Drift's own staging produced and on nothing else on
// the machine. It is deliberately NOT image-name matching: a scan that could
// select a `node` process not started from a drift-mcp directory is forbidden
// (T-08-21), which is why the marker's SHAPE is validated here, before any
// pattern is composed, rather than trusted from the caller.
//
// GD-01 — this path must remain independent of PROCESS GROUPS. A6 was measured
// FALSE (see the CORRECTION block at the top of this file), so a group reference
// cannot be relied on to reach the child. Every operand rendered below is a
// single POSITIVE pid. If a future edit reintroduces a negative operand here it
// has reintroduced the falsified assumption, and `kill-plan.test.ts` carries the
// case that goes red when it does.

// The two halves of the marker, spelled ONCE in this codebase. `index.ts`
// imports both rather than repeating either, so the directory Drift CREATES and
// the pattern the reaper SEARCHES FOR cannot drift apart — which they silently
// would if the prefix lived as a bare literal at each site.
export const MCP_TEMP_DIR_PREFIX = "drift-mcp-";
export const MCP_SERVER_SCRIPT_NAME = "mcp-server.mjs";

// The accepted token body. `genShortToken` (`index.ts`) emits 20 lowercase hex
// characters; the range is widened at both ends so a future token length change
// does not silently turn every scan into a `bad-marker` refusal, and bounded at
// both ends so an unbounded run of hex cannot be presented as a marker.
const MCP_TOKEN_MIN_CHARS = 8;
const MCP_TOKEN_MAX_CHARS = 64;

// Lowercase hex, by hand rather than by `RegExp`. The point is not economy: a
// character this predicate accepts is a character that will be embedded in the
// enumerator's PATTERN, so the accept set and the "no metacharacter can reach
// the enumerator" claim (T-08-22) are the same statement. Written as an explicit
// range test, that statement is readable in one line.
function isLowerHexChar(character: string): boolean {
  return (
    (character >= "0" && character <= "9") ||
    (character >= "a" && character <= "f")
  );
}

// THE BLAST-RADIUS GUARD (T-08-21, and the answer OQ-3 asked for). A marker that
// is empty, prefix-only, too short, too long, upper-cased, or carrying a path
// separator or a regular-expression metacharacter is REFUSED, and no pattern is
// composed at all. That refusal is what makes it impossible for a corrupted or
// absent `mcpTempDir` to degrade into a scan that selects processes at large:
// there is no "fall back to a looser pattern" arm, because a looser pattern is
// the failure this guard exists to prevent.
function isValidSessionDirName(name: string): boolean {
  if (!name.startsWith(MCP_TEMP_DIR_PREFIX)) return false;
  const token = name.slice(MCP_TEMP_DIR_PREFIX.length);
  if (token.length < MCP_TOKEN_MIN_CHARS) return false;
  if (token.length > MCP_TOKEN_MAX_CHARS) return false;
  for (const character of token) {
    if (!isLowerHexChar(character)) return false;
  }
  return true;
}

// The script half of the pattern, with its dot escaped so it matches a literal
// dot rather than any character. Derived from the constant rather than spelled a
// second time, so renaming the script cannot leave a stale pattern behind.
function escapedScriptName(): string {
  return MCP_SERVER_SCRIPT_NAME.split(".").join("\\.");
}

// The one place a scan pattern is composed. Both scan builders route through it,
// so the two anchors and their adjacency are guaranteed present in every pattern
// this module can produce — a builder that composed its own could omit one.
function composeOrphanScanPattern(tokenBody: string): string {
  return `${MCP_TEMP_DIR_PREFIX}${tokenBody}/${escapedScriptName()}`;
}

// The enumerator. `pgrep` and not `ps`, for three reasons recorded in
// `08-06-PLAN.md` § Enumeration strategy and worth keeping here because the
// tempting substitution is `ps`: `pgrep` returns one integer per line and so has
// no parsing surface over argv the user's own processes influence; it exits 1
// with empty output when nothing matched, which is a DISTINGUISHABLE outcome the
// no-op ladder branches on, where `ps` exits 0 whether or not the row is there;
// and its output scales with MATCHES (expected 0-3) rather than with the size of
// the process table. It is a base-system utility on macOS and on every Linux
// distribution Drift supports, so no dependency is added.
const ORPHAN_SCAN_FILE = "pgrep";
// `-f` matches against the FULL COMMAND LINE. Without it `pgrep` matches only
// the process NAME, which for `node <dir>/mcp-server.mjs` is `node` — the exact
// mistake `08-SPIKE.md` § Step 3 corrects for `ps -eo comm`, and it would turn
// this scan into the image-name matching the threat model forbids.
const ORPHAN_SCAN_FULL_COMMAND_LINE_FLAG = "-f";
// End-of-options, so a pattern is read as an OPERAND even if some future marker
// shape could begin with a dash. Same role as `--` in the POSIX kill argv above.
const END_OF_OPTIONS = "--";

// The SESSION scan: find the MCP children of ONE staged session, named by its
// own temp directory.
//
// Branch order is part of the contract here as it is at `buildKillTreePlan`:
// platform refusal, then marker refusal, then the accepted path.
export function buildSessionOrphanScanPlan(input: {
  platform: Platform | undefined;
  sessionDirName: string | undefined;
}): KillTreePlan {
  // win32 gets NO ENUMERATOR, and that is a decision rather than an omission:
  // `tasklist` does not print command lines, `wmic` is removed from current
  // Windows, and spawning PowerShell from the plugin is a surface this phase
  // will not open. It is also not a gap in the Windows termination path —
  // `taskkill /t` walks `ParentProcessId` and is INDIFFERENT to process groups,
  // so A6 was never a Windows question. What remains unreachable there is the
  // foreign-parented orphan class, recorded as AR-04 by plan 08-10.
  //
  // The literal "win32" ONLY: `undefined` falls through to the POSIX arm, the
  // same CMP-01 rule `buildKillTreePlan` states.
  if (input.platform === "win32") {
    return { kind: "none", reason: "unsupported-platform" };
  }

  if (
    input.sessionDirName === undefined ||
    !isValidSessionDirName(input.sessionDirName)
  ) {
    return { kind: "none", reason: "bad-marker" };
  }

  return {
    kind: "spawn",
    file: ORPHAN_SCAN_FILE,
    args: [
      ORPHAN_SCAN_FULL_COMMAND_LINE_FLAG,
      END_OF_OPTIONS,
      // The validated marker is used WHOLE: it already carries the prefix, so
      // recomposing it from the prefix plus a slice would be a second spelling
      // of the same string.
      `${input.sessionDirName}/${escapedScriptName()}`,
    ],
    // FALSE, and stated rather than omitted for the same reason both arms of
    // `buildKillTreePlan` state it: nothing in this argv was escaped by this
    // module, and the flag is inert off win32 in any case.
    windowsVerbatimArguments: false,
  };
}

// The PREVIOUS-RUN scan: find MCP children left by a run that is over, named by
// the token CLASS rather than by one token. Plan 08-07 is its only consumer.
export function buildPreviousRunOrphanScanPlan(input: {
  platform: Platform | undefined;
  currentSessionDirName: string | undefined;
}): KillTreePlan {
  if (input.platform === "win32") {
    return { kind: "none", reason: "unsupported-platform" };
  }

  // THE ARM THAT KEEPS THIS SAFE. A class-wide pattern matches the LIVE
  // session's own MCP child as readily as a dead run's, so it may only ever run
  // when no runtime is staged. Refusing here rather than filtering pids
  // afterwards is deliberate: a filter is a second thing that can be got wrong,
  // and the cost of getting it wrong is killing the MCP server of the turn the
  // user is watching.
  if (input.currentSessionDirName !== undefined) {
    return { kind: "none", reason: "session-active" };
  }

  return {
    kind: "spawn",
    file: ORPHAN_SCAN_FILE,
    args: [
      ORPHAN_SCAN_FULL_COMMAND_LINE_FLAG,
      END_OF_OPTIONS,
      composeOrphanScanPattern(
        `[0-9a-f]{${String(MCP_TOKEN_MIN_CHARS)},${String(MCP_TOKEN_MAX_CHARS)}}`,
      ),
    ],
    windowsVerbatimArguments: false,
  };
}

// The enumerator's stdout, turned into pids — the only place text from another
// process becomes a number this codebase will signal (T-08-23).
export function parseOrphanScanPids(input: {
  stdout: string;
  excludePids: number[];
}): number[] {
  const seen = new Set<number>();
  const pids: number[] = [];
  // Carriage-return-tolerant: split on the newline and trim the remainder, so a
  // "123\r\n" line yields 123 rather than a parse of "123\r".
  for (const rawLine of input.stdout.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const parsed = Number.parseInt(line, 10);
    if (!Number.isInteger(parsed)) continue;
    // THE FLOOR IS 1, NOT 0, and both excluded values have their own reason: `0`
    // is a process-GROUP reference on POSIX (signalling it would signal Drift's
    // own group) and `1` is init. Neither can ever be a Drift MCP child, so
    // neither is a value this list may carry — and a floor of 0 would let the
    // group reference back in through the parser after the builders spent this
    // whole module refusing it.
    if (parsed <= 1) continue;
    if (input.excludePids.includes(parsed)) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    pids.push(parsed);
  }
  return pids;
}

// One orphan, one kill. The operand is a POSITIVE single pid.
export function buildOrphanKillPlan(input: {
  pid: number | undefined;
  platform: Platform | undefined;
}): KillTreePlan {
  // The SHARED refusal, first, in the same branch-order-is-contract style
  // `buildKillTreePlan` uses. Proven from BOTH callers in `kill-plan.test.ts`.
  if (isUnusablePid(input.pid)) {
    return { kind: "none", reason: "no-pid" };
  }

  if (input.platform === "win32") {
    return { kind: "none", reason: "unsupported-platform" };
  }

  return {
    kind: "spawn",
    file: "kill",
    args: [
      // No graceful rung, deliberately. This path only ever runs against a
      // process Drift has ALREADY decided must not survive — a token-bearing MCP
      // server with no turn behind it — so a two-rung ladder would double the
      // spawn count for no observable difference.
      "-KILL",
      END_OF_OPTIONS,
      // POSITIVE. This operand names a SINGLE PROCESS and deliberately NOT a
      // process group. Assumption A6 — "the provider CLI's MCP child sits in the
      // CLI's process group" — was measured FALSE on 2026-08-27: codex pid 43921
      // sat in pgid 43752 while its `mcp-server.mjs` child pid 44284 sat in pgid
      // 44284, its own group. A group reference cannot reach a child that made
      // its own group, which is exactly why this whole path exists. Rendering
      // this operand negative would reintroduce the falsified assumption.
      String(input.pid),
    ],
    windowsVerbatimArguments: false,
  };
}

// What the enumerator's outcome MEANS — the no-op arms and the one reaping arm,
// as a pure function.
//
// FOUR NO-OP ARMS AT 08-06, FIVE SINCE 2026-08-27. `scan-stale` was added by
// review WR-03 and is documented at the FRESHNESS BOUND block below. The count is stated rather than left implicit because
// `08-06-PLAN.md` must_haves truth 4 names four, and `08-SECURITY.md`'s T-08-24
// row carried the same number — both are historical records of what was true
// when they were written, and the correction travels here and in T-08-24's
// marked amendment rather than by rewriting the plan.
//
// IT IS A FUNCTION FOR ONE REASON AND THE REASON IS TESTABILITY. `reapMcpOrphans`
// lives in `index.ts`, which declares no `caido:plugin` alias and cannot be
// imported by any test this project can run, so a four-arm ladder written inline
// there is a decision no assertion can reach — the same argument that put the pid
// refusal in `buildKillTreePlan` rather than at its call site (Pitfall 3).
// `08-06-PLAN.md` must_haves truth 4 names all four arms; this function is where
// they are reachable.
export type OrphanScanOutcome =
  | { kind: "reap"; kill: true; pids: number[] }
  | { kind: "noop"; kill: false; reason: OrphanScanNoopReason };

export type OrphanScanNoopReason =
  | "enumerator-unavailable"
  | "scan-timeout"
  | "scan-stale"
  | "scan-failed"
  | "no-match";

// THE FRESHNESS BOUND, and the hazard it exists for (review WR-03).
//
// A pid is not an identity. This module spends `hasTrackedProcessExited`'s whole
// docblock on that fact — `isPidAlive` proves LIVENESS, and a pid the OS has
// REASSIGNED is alive — and T-08-04 exists because a reused number handed to a
// forceful kill takes a stranger's process. The orphan reap has the SAME hazard
// on a path with no handle at all: `pgrep` samples the process table and exits,
// Drift's `close` handler fires some time later, and `kill -KILL -- <pid>` is
// spawned for numbers nobody re-verified. The operand is `-KILL` and the target
// is a process this module's own comment says Drift "has ALREADY decided must
// not survive", so a reused pid dies with no recourse. Drift's user population
// runs high-fan-out tooling (`xargs -P`, `ffuf`, `nuclei`), where pid-table
// churn in the thousands per second is ordinary.
//
// WHAT THIS BOUND DOES, STATED EXACTLY SO IT IS NOT MISREAD AS A CLOSURE. The
// caller already arms a `setTimeout` for the same duration, so in the ordinary
// case the window is bounded. What is NOT bounded is the case that matters: when
// Caido's event loop is starved — the condition CLAUDE.md names, and the reason
// the frontend keep-alive exists — neither the timer nor the `close` callback
// runs, and whichever becomes runnable FIRST when the loop drains decides the
// outcome. If `close` wins, today's code kills on pids sampled arbitrarily long
// ago. Measuring the age on the WALL CLOCK and refusing above the budget makes
// the bound hold whether or not the timer fired, which turns an unbounded window
// into a stated one.
//
// WHAT IT DOES NOT DO: within the budget, a reused pid is still reachable. The
// two closures the review proposed were both rejected, and the reasons are
// recorded here rather than in a commit message nobody re-reads:
//
//   * `pkill -f -- <pattern>` matches and signals inside ONE process, so the
//     window really does close — but it signals every match AT KILL TIME rather
//     than the frozen list `pgrep` returned. A user who clicks Stop and
//     immediately starts a new turn (the ordinary interaction) would have the
//     NEW turn's MCP child killed, which is T-08-27 — the precise harm the idle
//     gate exists to prevent, traded in at a far higher probability than the
//     reuse it removes.
//   * A `ps -p <pid> -o command=` identity re-check before the signal costs one
//     more spawn AND one more child-process `close` delivery per orphan. Whether
//     Caido's LLRT delivers the FIRST one is recorded in this phase as an
//     unrun-verify residual; gating the kill on a SECOND unverified delivery
//     multiplies the chance the orphan is never signalled at all, which is
//     LIF-02 — the reported bug this whole mechanism exists to fix.
//
// So the residual is accepted and named rather than hidden: a pid reused inside
// the budget is still signalled. The budget is the caller's scan timeout,
// injected rather than duplicated here.

export function classifyOrphanScanOutcome(input: {
  spawnThrew: boolean;
  exitCode: number | null | undefined;
  timedOut: boolean;
  pids: number[];
  scanAgeMs: number;
  scanFreshnessBudgetMs: number;
}): OrphanScanOutcome {
  // `spawn` throws SYNCHRONOUSLY for an unspawnable file, which is what a host
  // with no `pgrep` produces. Such a host is exactly as well served as it is at
  // HEAD: the reaper is strictly additive and removes no termination path.
  if (input.spawnThrew) {
    return { kind: "noop", kill: false, reason: "enumerator-unavailable" };
  }

  // Treated as unavailable rather than retried. A retry would double the spawn
  // count on a teardown path for a scan that is best-effort by construction.
  if (input.timedOut) {
    return { kind: "noop", kill: false, reason: "scan-timeout" };
  }

  // THE FRESHNESS ARM, above every arm that can reach a kill. See the FRESHNESS
  // BOUND block above this function: this is the timer's bound re-stated on the wall clock, so it holds
  // on a starved event loop where the timer did not get to fire first.
  //
  // BOTH SCALARS ARE CHECKED FOR SHAPE, not just for size, and an unusable value
  // on either resolves toward STALE — the same subtractive rule
  // `shouldReapSessionOrphans` and `hasTrackedProcessExited` follow. A NaN age is
  // what a caller subtracting from an unset timestamp produces, and a wrong
  // number is not evidence that these pids are fresh. A non-positive budget is
  // the caller's error and is likewise not evidence.
  if (!Number.isInteger(input.scanFreshnessBudgetMs)) {
    return { kind: "noop", kill: false, reason: "scan-stale" };
  }
  if (input.scanFreshnessBudgetMs <= 0) {
    return { kind: "noop", kill: false, reason: "scan-stale" };
  }
  if (!Number.isFinite(input.scanAgeMs)) {
    return { kind: "noop", kill: false, reason: "scan-stale" };
  }
  if (input.scanAgeMs > input.scanFreshnessBudgetMs) {
    return { kind: "noop", kill: false, reason: "scan-stale" };
  }

  // Exit 1 is `pgrep`'s DOCUMENTED "no process matched", and it is deliberately
  // NOT distinguished from any other non-zero exit: both outcomes reap nothing,
  // so a separate reason would be a distinction with no consequence, and one
  // more arm for a future edit to get wrong. `undefined` — the code a killed or
  // never-closed child leaves — takes the same arm, fail-closed.
  if (input.exitCode === undefined || input.exitCode === null) {
    return { kind: "noop", kill: false, reason: "scan-failed" };
  }
  if (input.exitCode !== 0) {
    return { kind: "noop", kill: false, reason: "scan-failed" };
  }

  if (input.pids.length === 0) {
    return { kind: "noop", kill: false, reason: "no-match" };
  }

  // THE ONLY arm that kills, and it is reached only by exit 0 carrying at least
  // one pid the parser accepted. The DEFAULT of this ladder is `noop`: any input
  // combination it does not recognise kills nothing.
  return { kind: "reap", kill: true, pids: input.pids };
}

// Whether an idle-time orphan reap may fire at all.
//
// It sits with `hasTrackedProcessExited` and `shouldDetachProviderSpawn` above
// rather than with the scan builders, because it is the same KIND of thing they
// are: one small decision, taken from injected scalars, whose whole reason for
// living outside `index.ts` is that a test can reach it there.
//
// WHAT THE FIRST SCALAR IS FOR. The marker the session scan searches on is the
// shared `mcpTempDir` directory name, and EVERY concurrent session's MCP child
// carries it — Drift stages one temp directory per runtime, not one per chat. So
// a marker-wide reap cannot tell one session's child from another's AS THE ARGV
// IS COMPOSED TODAY, and firing it while any session is live would kill the MCP
// server of a turn the user is watching (T-08-27).
//
// THE CORRECTION A READER WHO CHECKS WILL FIND, STATED HERE SO THEY DO NOT HAVE
// TO. "argv cannot distinguish sessions" is FALSE for two of the four providers,
// and one of them is the maintainer's active provider. For `claude-cli` and
// `copilot-cli` Drift AUTHORS the `args` array itself — `buildMcpServerSpec`
// (`mcp-server-spec.ts`) sets `args: [mcpScriptPath]`, and `toMcpConfigDocument`
// projects it into the PER-CHAT `mcp-<chatId>.json` / `copilot-mcp-<chatId>.json`
// that `writeChatMcpConfig` writes (`index.ts:3960` and `:4009`). A per-chat
// token appended to that array would appear verbatim on the child's command line
// and make the scan SESSION-PRECISE for those two, retiring this gate for them;
// `mcp-server.mjs` reads `process.argv` only for `--validate-auth`, so the extra
// token is inert. The claim holds only for `gemini-cli` and `codex-cli`, which
// share ONE `mcp add drift` registration with no per-chat document, and for
// Drift's own `callMcpMethod` spawn, which has no chat at all.
//
// So this gate is a SCOPE DECISION, not a constraint, and the case it leaves
// uncovered is recorded as residual **AR-07** (plan 08-10) and as threat
// T-08-50: with two or more sessions live, cancelling one leaves its
// token-bearing MCP child to the process-group path UAT measured FALSE (A6), and
// that orphan survives until the LAST session closes and this gate opens. Naming
// it here is the point — a reader of this predicate sees what it does not cover
// instead of inferring that nothing is missing.
//
// WHAT THE SECOND SCALAR IS FOR. `callMcpMethod` spawns `node
// <mcpTempDir>/mcp-server.mjs` DIRECTLY for the MCP self-test, and its argv is
// byte-identical to a CLI's child. At teardown that is correct — everything must
// die. At an idle reap it is not: a concurrent self-test would be killed and
// surface to the user as a self-test failure with no visible cause (T-08-28). A
// pid EXCLUSION LIST was rejected for this: a stale pid in such a list would
// shield a genuine orphan that later reused the number, which is T-08-04's
// failure shape pointed the wrong way. A depth COUNTER cannot go stale in that
// direction.
//
// EXACT ZEROS, NOT TRUTHINESS, on both inputs. A negative or non-integer value
// on either scalar means the caller's arithmetic is wrong, and a wrong count is
// not evidence that nothing is running — so anything other than a pair of exact
// zeros returns FALSE. An unknown resolves toward NOT REAPING, the same
// subtractive rule `hasTrackedProcessExited` states: this predicate can skip a
// kill on ignorance, never add one.
export function shouldReapSessionOrphans(input: {
  activeSessionCount: number;
  directMcpCallDepth: number;
}): boolean {
  if (!Number.isInteger(input.activeSessionCount)) return false;
  if (!Number.isInteger(input.directMcpCallDepth)) return false;
  if (input.activeSessionCount !== 0) return false;
  return input.directMcpCallDepth === 0;
}

// ── Liveness, as a THREE-valued determination (08-VERIFICATION.md gap 1) ──
//
// THE FINDING THESE THREE HELPERS EXIST FOR, and it is a finding rather than a
// style note. Phase 8's Wave-0 probe decided assumption A1 with one expression:
//
//     const alive = signalRef.process?.kill?.(grandchildPid, 0) ?? false;
//
// and then reported `alive` as one of two verdict strings. The SAME diagnostics
// run, five lines earlier in the SAME report, measured
// `spikeProcessKillType: "undefined"` — Caido's sandbox exposes no
// `process.kill`. With the primitive absent the optional chain yields
// `undefined`, `?? false` makes `alive === false`, and the string that reads as
// a favourable answer was emitted UNCONDITIONALLY. The probe could not print the
// other string on the runtime it was run on, so its A1 verdict was RETRACTED on
// 2026-08-28 (see the LIVE VERDICTS block at the head of this file).
//
// THE RULE THIS PHASE EARNED, stated once, here, where the decision now lives:
// an assertion whose red input requires hardware must state what a CANNOT-TELL
// answer looks like, and must never coalesce it into either verdict. A `??`, an
// `||` or a `default:` on the liveness path is the bug — not a shortcut that
// happens to be wrong, the bug itself, because each of them manufactures a
// definite answer out of an absent one.
//
// Every other consumer of that same `process.kill` absence WAS traced correctly
// (`08-SECURITY.md` § G-02 works through its effect on `isPidAlive` in detail).
// The one consumer nobody traced was the probe's own verdict line — in this
// file's own subject area, three modules away from the careful reasoning at
// `hasTrackedProcessExited`.
//
// WHY HERE. Same argument as every other decision in this module: the probe
// lives in `index.ts`, which declares no `caido:plugin` alias and cannot be
// imported by any test this project can run, so a verdict computed inline there
// is a verdict no assertion can reach (Pitfall 3). Lifted out, it is proven by
// an executed totality case over its whole input domain. Plan 08-15's probe
// patch composes these rather than re-deriving them.
//
// THE MODULE'S SINGLE-IMPORT PROPERTY IS UNCHANGED by this block: it adds no
// second import statement, so `grep -cE '^import'` over this file still returns
// 1 and it is still `./platform`.

// The three answers, and the third is a first-class result rather than an error
// case. `inconclusive` is what the 2026-08-27 probe should have returned and
// could not express.
export type LivenessVerdict = "alive" | "dead" | "inconclusive";

// The reason vocabulary, CLOSED in the same way `OrphanScanNoopReason` is closed
// — an enumerable union rather than free prose, so a reason cannot become a
// sentence that leaks a pid, a path or an environment value into a diagnostics
// string (T-08-59).
//
//   * `enumerator-unavailable` — the enumerator could not be spawned at all.
//   * `probe-timeout`          — it was spawned and did not finish.
//   * `no-exit-code`           — it left `undefined` (LLRT) or `null` (a
//                                signalled child under Node): no result at all.
//   * `unrecognised-exit-code` — an exit code the enumerator does not document,
//                                so the instrument misbehaved.
//   * `unusable-pid`           — the caller asked about a pid that cannot exist.
//   * `contradictory-output`   — the exit code and the printed rows disagree.
//   * `matched-running`        — the ONE shape that establishes presence.
//   * `matched-zombie`         — a row that exists but names a reaped process.
//   * `successful-non-match`   — the ONE shape that establishes absence.
export type LivenessReason =
  | "enumerator-unavailable"
  | "probe-timeout"
  | "no-exit-code"
  | "unrecognised-exit-code"
  | "unusable-pid"
  | "contradictory-output"
  | "matched-running"
  | "matched-zombie"
  | "successful-non-match";

// One verdict, one reason. The reason travels WITH the verdict rather than being
// logged separately, because an `inconclusive` with no cause attached is what a
// reader turns back into a guess.
export type LivenessObservation = {
  verdict: LivenessVerdict;
  reason: LivenessReason;
};

// The enumerator's exit codes, named rather than spelled at the branch. `ps -p`
// exits 0 when it printed a row for the pid and 1 when the pid is not in the
// table; ANY other code is the instrument misbehaving and is not evidence.
const PROBE_EXIT_MATCHED = 0;
const PROBE_EXIT_NO_MATCH = 1;

// One row of the enumerator's output, or nothing. `undefined` here means "no
// line in this output was a row for the requested pid" — deliberately NOT "the
// process is gone", which is the distinction the whole block is about.
type ProbeRow = { zombie: boolean };

// Find the target row by PID EQUALITY, scanning every line.
//
// TWO PROPERTIES, BOTH LOAD-BEARING, BOTH WITH A CASE IN `kill-plan.test.ts`:
//
//   1. The pid is compared as a NUMBER. A containment test would read a row for
//      4428 or 442840 as an answer about 44284, and pid adjacency is not a
//      hypothetical on a machine running high-fan-out tooling.
//   2. EVERY line is scanned. A read of `stdout.split("\n")[0]` is wrong on any
//      host whose first line is a header, a warning or a blank — and it fails
//      toward `inconclusive`, which is safe but silently blinds the probe.
//
// A line that does not begin with a decimal integer is NOISE and is skipped. It
// is not a negative answer; treating it as one is the coalescing defect again,
// relocated into the parser.
function findProbeRow(stdout: string, pid: number): ProbeRow | undefined {
  for (const rawLine of stdout.split("\n")) {
    // Carriage-return-tolerant, for the same reason `parseOrphanScanPids` is.
    const fields = rawLine
      .trim()
      .split(/\s+/)
      .filter((field) => field !== "");
    const pidField = fields[0];
    if (pidField === undefined) continue;
    // EVERY character must be a digit. "44284abc" is not a pid field, and
    // `Number.parseInt` would happily return 44284 from it.
    let allDigits = true;
    for (const character of pidField) {
      if (character < "0" || character > "9") {
        allDigits = false;
        break;
      }
    }
    if (!allDigits) continue;
    if (Number.parseInt(pidField, 10) !== pid) continue;
    // The second whitespace-delimited field is the process state. A leading `Z`
    // is a zombie: the entry survives, the process does not. Presence of the ROW
    // alone would call a reaped grandchild alive. A row with no state field at
    // all is still a row, so it counts as presence.
    const stateField = fields[1];
    return { zombie: stateField !== undefined && stateField.startsWith("Z") };
  }
  return undefined;
}

// What a spawned liveness probe's outcome MEANS.
//
// BRANCH ORDER IS THE CONTRACT, ordered exactly as `classifyOrphanScanOutcome`
// orders its own: unspawnable first, timeout second, then the caller's own bad
// input, then the arms that can reach a definite answer. Reordering these
// changes behaviour, not style.
//
// THE DEFAULT OF THIS LADDER IS `inconclusive`. There are exactly three arms
// that can return anything else, and each of them requires a positive
// observation to be reached.
export function classifyLivenessObservation(input: {
  spawnThrew: boolean;
  exitCode: number | null | undefined;
  timedOut: boolean;
  stdout: string;
  pid: number | undefined;
}): LivenessObservation {
  // THE ARM THAT IS GAP 1. A host with no enumerator — or a sandbox that
  // refuses the spawn — has told us NOTHING about the pid. The withdrawn probe
  // wrote `?? false` here and called it "not alive".
  if (input.spawnThrew) {
    return { verdict: "inconclusive", reason: "enumerator-unavailable" };
  }

  // A probe that did not finish measured nothing. Same class as above, one arm
  // to the right, and just as tempting to fold into "not alive".
  if (input.timedOut) {
    return { verdict: "inconclusive", reason: "probe-timeout" };
  }

  // The module's shared pid refusal, reused rather than re-spelled. A question
  // about a pid that cannot exist has no answer — and specifically it does not
  // have the answer "the process is gone".
  if (isUnusablePid(input.pid)) {
    return { verdict: "inconclusive", reason: "unusable-pid" };
  }

  // `undefined` is what Caido's LLRT `ChildProcess` leaves (it defines `pid` and
  // `kill` and nothing else) and `null` is what a signalled child leaves under
  // Node. Neither is an enumeration result, and `undefined !== null` being TRUE
  // is exactly the trap `hasTrackedProcessExited` documents above.
  if (input.exitCode === undefined || input.exitCode === null) {
    return { verdict: "inconclusive", reason: "no-exit-code" };
  }

  if (
    input.exitCode !== PROBE_EXIT_MATCHED &&
    input.exitCode !== PROBE_EXIT_NO_MATCH
  ) {
    return { verdict: "inconclusive", reason: "unrecognised-exit-code" };
  }

  // `input.pid` survived `isUnusablePid` above, so it is a positive integer
  // here; the local narrows it for the compiler without an `as`.
  const pid = input.pid ?? 0;
  const row = findProbeRow(input.stdout, pid);

  if (input.exitCode === PROBE_EXIT_MATCHED) {
    // An enumerator that reports success and prints no row for the pid is
    // contradicting itself. That is NOT evidence of absence — folding it into
    // `dead` would rebuild gap 1 out of a different operator.
    if (row === undefined) {
      return { verdict: "inconclusive", reason: "contradictory-output" };
    }
    return row.zombie
      ? { verdict: "dead", reason: "matched-zombie" }
      : { verdict: "alive", reason: "matched-running" };
  }

  // Exit 1 — the DOCUMENTED "no such process". This is the one negative outcome
  // that carries information, and it is why the probe spawns an enumerator
  // instead of calling a primitive the sandbox does not supply.
  if (row !== undefined) {
    // The instrument said "no such process" and then printed it. Both halves
    // cannot be true, so neither is trusted.
    return { verdict: "inconclusive", reason: "contradictory-output" };
  }
  return { verdict: "dead", reason: "successful-non-match" };
}

// The probe's own spawn plan: a process-table lookup for ONE pid, printing the
// pid and the process state with no header.
//
// It returns the module's existing `KillTreePlan` union rather than a new one,
// so it inherits the refusal vocabulary and every consumer keeps the same three
// projections it already switches on.
//
// THE BARE NAME IS A DELIBERATE, BOUNDED ACCEPTANCE (T-08-55, same class as
// T-08-03). `ps` is resolved through whatever PATH the host supplies. Two things
// bound it. FIRST, SCOPE: this builder is consumed ONLY by an uncommitted local
// diagnostic build — plan 08-15's patch file, applied by a maintainer on their
// own machine — and by nothing on any shipping path. SECOND, DESIGN: a hijacked
// binary cannot produce a WRONG verdict, only an absent one, because
// `classifyLivenessObservation` above requires a row whose PARSED PID EQUALS the
// requested pid and does not trust a bare exit code. A binary that exits 0 with
// unrelated or empty output yields `inconclusive`.
export function buildLivenessProbePlan(input: {
  pid: number | undefined;
  platform: Platform | undefined;
}): KillTreePlan {
  // The SHARED refusal first, in the same branch-order-is-contract style
  // `buildOrphanKillPlan` uses, and proven from this caller too.
  if (isUnusablePid(input.pid)) {
    return { kind: "none", reason: "no-pid" };
  }

  // The literal "win32" only; `undefined` falls through to the POSIX arm, the
  // CMP-01 rule this module states everywhere else. A1 is a POSIX assumption in
  // the first place — it is about `process_group(0)`, an option the win32 arm
  // never takes — so there is nothing for this probe to ask there.
  if (input.platform === "win32") {
    return { kind: "none", reason: "unsupported-platform" };
  }

  return {
    kind: "spawn",
    file: "ps",
    args: [
      // `pid=,state=` — the two fields the classifier reads, with the trailing
      // `=` suppressing each column header. A header line would be noise the
      // parser skips anyway, but asking for one and then skipping it is two
      // decisions where one will do.
      "-o",
      "pid=,state=",
      // POSITIVE, and a SINGLE pid. No process-group reference appears anywhere
      // in this argv, deliberately: A1 asks whether a group exists at all, and a
      // probe that poses the question with a group reference cannot answer it.
      "-p",
      String(input.pid),
    ],
    // FALSE, and stated rather than omitted for the same reason every other
    // builder in this module states it: nothing here was escaped by this module,
    // and the flag is inert off win32 in any case.
    windowsVerbatimArguments: false,
  };
}

// The exact string the probe writes into its diagnostics field.
//
// THE FIRST TWO ARE BYTE-IDENTICAL to what the 2026-08-27 run produced, on
// purpose: a re-run on fixed hardware must be COMPARABLE with the withdrawn
// reading, and a silently reworded string would make the old and new readings
// two different measurements of two different things.
//
// THE THIRD IS THE WHOLE POINT. It shares no verdict word with either of the
// other two — no "died", no "survived", no "honoured" — so a reader skimming a
// diagnostics report cannot mistake a non-answer for either outcome. That
// mistake, made once, is what this entire block exists to prevent.
export function formatSpikeVerdict(observation: LivenessObservation): string {
  if (observation.verdict === "alive") {
    return "grandchild-survived (detached NOT honoured)";
  }
  if (observation.verdict === "dead") {
    return "grandchild-died (detached honoured)";
  }
  return `inconclusive: ${observation.reason} — the probe could not tell whether the target is still in the process table`;
}
