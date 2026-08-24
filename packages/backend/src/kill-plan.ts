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
// The one import is `./platform`, and it is here for exactly one reason, in the
// `spawn-plan.ts` house style of justifying each import a module allows:
// `Platform` is the narrow three-member union that `buildKillTreePlan` and
// `shouldDetachProviderSpawn` gate on, and restating that union here would let
// the two copies drift. Deliberately NOT imported: `os` and `process` (Phase 4
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
// MEASUREMENT — AND THE TWO THINGS THAT WERE **NOT** MEASURED. `spawn-plan.ts`
// records its measured verdicts at :40-80 in this slot; the honest entry here is
// an absence, and it is written as one rather than softened. Phase 8's Wave-0
// spike (plan 08-01) built a probe to close assumptions A1 and A6 on a real
// Caido install; the maintainer waived its hardware checkpoint on 2026-08-24
// without supplying readings, so the probe was bundled and never executed. The
// two verdict lines, quoted verbatim from `08-SPIKE.md`:
//
//   A1 — does the shipped Caido LLRT honour `detached: true`?
//        Caido version: **not recorded — spike not run**
//        Verdict:       **OPEN — not measured**
//   A6 — is the CLI's MCP child in the CLI's process group?
//        `claude` pid / `mcp-server.mjs` pgid: **not recorded — spike not run**
//        Verdict:       **OPEN — not measured**
//
// So the POSIX arm below rests on SOURCE ANALYSIS only —
// `caido/dependency-llrt`, branch `caido`, commit `a5b021c`,
// `modules/llrt_child_process/src/lib.rs:448,462,512-521`, which calls
// `command.process_group(0)` on unix for a detached spawn, making pgid equal the
// child pid. That source was read; it was never executed under the runtime a
// user actually runs, and no CI leg in this repository can execute it. If the
// shipped fork differs, the group reference below names a group that was never
// created and every CI leg stays green while LIF-02 goes unclosed. Recorded
// decision OQ-2 (`08-02-PLAN.md`) — `killTree` keeps the single-pid signal
// ALONGSIDE this plan's group spawn — is the only remaining protection, and it
// degrades a total regression into the partial one that ships today rather than
// preventing one. Do not delete that rung on the grounds that it looks
// redundant.

import { type Platform } from "./platform";

// The rung of the two-step ladder a POSIX caller is on. Windows has no second
// rung and says so at its own branch below.
export type KillRung = "term" | "kill";

// One decision, four projections — the discriminated union CLAUDE.md names as
// the house convention, keyed on `kind`. The `spawn` arm mirrors `SpawnPlan`'s
// three projections exactly (`file`, `args`, `windowsVerbatimArguments`) so
// `index.ts` consumes a kill plan and a launch plan with the same three lines.
// The `none` arm carries no `file` and no `args` ON PURPOSE: a refusal that
// still exposed an argv could be spawned by a call site that forgot to switch on
// `kind`, which is the SC-1 guard defeating itself.
export type KillTreePlan =
  | { kind: "none"; reason: "no-pid" }
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
export const DEFAULT_TASKKILL = "taskkill.exe";

// The ONLY way a pid becomes a termination spawn on this codebase.
//
// BRANCH ORDER IS PART OF THE CONTRACT: refusal, then win32, then POSIX with
// `undefined` folded into it. Reordering these changes behaviour, not style.
export function buildKillTreePlan(input: {
  pid: number | undefined;
  platform: Platform | undefined;
  env: Record<string, string | undefined>;
  rung: KillRung;
}): KillTreePlan {
  // REFUSAL FIRST, per the fail-closed branch order `planMcpCliRegistration`
  // established. SC-1's "guarded against an undefined pid" lives here and
  // NOWHERE else, and that is precisely what makes it testable: `index.ts`
  // cannot be imported under vitest, so a guard written at the call site is a
  // guard no assertion can reach (Pitfall 3).
  //
  // The three rejected shapes each have their own reason, and none of them is
  // hypothetical: `undefined` is what `ChildProcess.pid` reads once the child
  // has been reaped; `0` means "every process in MY OWN group" on POSIX, i.e.
  // Drift signalling itself; a NEGATIVE value is already a group reference, so
  // accepting one would let a caller aim at a group nobody asked for. A
  // non-integer (NaN, 1.5) cannot be a pid at all.
  if (
    input.pid === undefined ||
    !Number.isInteger(input.pid) ||
    input.pid <= 0
  ) {
    return { kind: "none", reason: "no-pid" };
  }

  // THEN win32. The literal "win32" only — `undefined` falls through to the
  // POSIX arm below, deliberately.
  if (input.platform === "win32") {
    // Read the system root from the INJECTED env under both spellings, first
    // non-empty trimmed value winning. Windows' own environment lookup is
    // case-insensitive so one spelling would do on the real platform; the unit
    // test runs on Linux, where a plain object lookup is case-SENSITIVE, so both
    // are read here. That is D-P4's whole point and `getWhichCommand`
    // (`platform.ts:255-294`) is the shipped precedent it copies: taking an
    // `env` RECORD rather than a resolved `systemRoot` scalar keeps this
    // Windows-only fallback inside a test's reach instead of stranding it in
    // `index.ts`.
    let systemRoot = "";
    for (const name of ["SystemRoot", "SYSTEMROOT"]) {
      const value = input.env[name]?.trim();
      if (value === undefined || value === "") continue;
      systemRoot = value;
      break;
    }

    // Strip every trailing separator BY HAND rather than with `path`, which
    // resolves to its POSIX flavour on the Linux CI runner. A root that already
    // carries one must not produce a doubled separator, and — as at
    // `getWhichCommand` — there is deliberately NO bare-drive guard: a segment
    // is being APPENDED here rather than a root preserved, so reducing "D:\" to
    // "D:" yields the correct "D:\System32\…".
    let root = systemRoot;
    while (root.length > 0) {
      const last = root[root.length - 1];
      if (last !== "\\" && last !== "/") break;
      root = root.slice(0, -1);
    }

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
      // Absolute path when a root is known, bare name only as a last resort.
      file: root === "" ? DEFAULT_TASKKILL : `${root}\\System32\\${DEFAULT_TASKKILL}`,
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
