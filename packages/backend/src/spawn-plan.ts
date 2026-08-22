// The Windows spawn plan: given a resolved command, its argv and the host
// platform, decide WHAT file to hand `spawn`, WITH which argument array, and
// whether the runtime must be told the arguments are already escaped. Three
// properties are load-bearing here and all three are mechanically checkable.
// This module performs ZERO I/O; it reads no module state; and it carries
// exactly ONE import statement — `grep -cE '^import'` over this file returns 1,
// which is the machine form of both claims at once. `platform` and `comspec`
// are INJECTED parameters, never read from `os`, `process` or the environment.
//
// The one import is `./platform`, and it is here for exactly two reasons, in the
// `mcp-server-spec.ts` house style of justifying each import a module allows:
// `Platform` is the narrow three-member union `buildSpawnPlan` gates on, and
// `WINDOWS_EXECUTABLE_EXTENSIONS` is the SHIPPED extension list that
// `CMD_INTERPRETED_EXTENSIONS` below filters — 06-CONTEXT binds PRV-02 to
// consume what the resolver returns and never to re-derive an extension set, so
// that constant is READ here rather than restated. Deliberately NOT imported:
// `path` (the command already arrives OS-native from `resolveCommand`, and
// `path` resolves to its POSIX flavour on the Linux CI runner where it would
// corrupt a Windows path), `os`, `process` and `child_process`. A module that
// touches none of them has no hidden input a test cannot supply. An unused
// import is also a hard build failure here (tsconfig `noUnusedLocals` → TS6133;
// `pnpm lint` runs at `--max-warnings 0`), so the import count is self-enforcing.
//
// WHY THIS LIVES OUTSIDE `index.ts`. `index.ts` is ~4,900 lines, declares no
// `caido:plugin` alias for vitest and therefore cannot be imported by any test
// this project can run — so escaping logic left inside it is unverifiable by
// construction. The maintainer also cannot test native Windows locally, which
// makes "unverifiable by construction" the same thing as "unverified on the only
// platform this milestone is about". The escaping is only provable here.
//
// ATTRIBUTION. `escapeCmdCommand`, `escapeCmdArgument`, `needsDoubleEscape` and
// the `/d /s /c` assembly are PORTED from `cross-spawn` (moxystudio/node-cross-
// spawn, v7.0.6, MIT licence), not derived:
//   https://github.com/moxystudio/node-cross-spawn/blob/master/lib/util/escape.js
//   https://github.com/moxystudio/node-cross-spawn/blob/master/lib/parse.js
// The package itself was evaluated in 07-RESEARCH.md § Package Legitimacy Audit
// and deliberately NOT ADOPTED as a dependency (Phase 7 installs nothing); its
// algorithm is reproduced here under that licence instead. Two deliberate
// divergences from upstream, both recorded so nobody "restores" them:
//   1. No path-normalisation call. Upstream runs `path.normalize` on the command;
//      Drift's command already arrives OS-native from `resolveCommand`, and the
//      POSIX-flavoured normaliser on the Linux runner would corrupt it.
//   2. The interpreter name is an injected `comspec` parameter rather than a
//      read of `process.env.comspec`, because this module reads no environment.
//
// MEASUREMENT — the A1 verdict (npm-global shim escaping depth) and the two
// adjacency edge probes are recorded at `needsDoubleEscape` below, with the
// `windows-latest` runs that measured them.
//
// MEASURED ON A REAL WINDOWS HOST, in the style `ci.yml` uses for its measured
// timeout. Both runs are `Verify (Windows)` on `windows-latest`, Node 20, driving
// `spawn-plan.win32.test.ts` against a real `cmd.exe` and a runtime-built
// npm-GLOBAL-shaped `.cmd` shim (`@ECHO off` / `SETLOCAL` / `"node" "script" %*`)
// sitting in a directory whose name carries a space and a parenthesis pair:
//
//   RED   https://github.com/six2dez/drift/actions/runs/32563348727
//         job `Verify (Windows)` = failure, step `Test` = failure. The
//         falsification, kept because it is the evidence.
//   GREEN https://github.com/six2dez/drift/actions/runs/32563543158
//         job `Verify (Windows)` = success, step `Test` = success,
//         `✓ packages/backend/src/spawn-plan.win32.test.ts (5 tests) 508ms`,
//         `Tests 444 passed (444)` with no skips — the win32 cases RAN on that
//         host rather than being gated out.
//
// 1. A1 — ESCAPING DEPTH FOR AN npm-GLOBAL SHIM: this module ships upstream's
//    heuristic unchanged, which SINGLE-escapes a global shim (the double escape
//    is reserved for `node_modules/.bin`). The hazard set round-trips
//    byte-identically under it. The predicted discriminator did NOT hold: the
//    OPPOSITE (double) depth round-trips byte-identically too, because each
//    argument keeps its own quote pair through the shim's `%*` and cmd treats
//    metacharacters inside quotes as ordinary text. Depth is therefore not
//    load-bearing on this shim shape — but the caret pass ITSELF is, and the
//    win32 file's "caret pass removed" leg proves it by watching cmd expand a
//    literal `%TEMP%`.
// 2. EMPTY-STRING EDGE PROBE: an empty-string argument SURVIVES the round trip
//    as its own distinct argv element — it neither vanishes nor merges with a
//    neighbour (PRV-02 empty).
// 3. SINGLE-SPACE EDGE PROBE: a single-space argument SURVIVES the round trip as
//    its own distinct argv element with its space intact (PRV-02 adjacency).

import { WINDOWS_EXECUTABLE_EXTENSIONS, type Platform } from "./platform";

// The interpreter cmd.exe is invoked as when no COMSPEC is injected. Upstream
// spells this `process.env.comspec || 'cmd.exe'`; the environment read is the
// caller's job here, so only the fallback literal lives in this module.
export const DEFAULT_COMSPEC = "cmd.exe";

// Extensions that are NOT programs — Windows can locate them on PATH but
// `CreateProcess` cannot execute them, which is why Node >= 18.20.2 refuses a
// direct spawn with a SYNCHRONOUS EINVAL (CVE-2024-27980 guard; measured on a
// real windows-latest host, 03-FINDINGS.md § P1-CMD). Anything left after this
// filter is a real executable and is spawned directly.
const DIRECTLY_SPAWNABLE_EXTENSIONS: readonly string[] = [".exe"];

// The subset of the SHIPPED extension list that cmd.exe must interpret. Derived
// by filtering `WINDOWS_EXECUTABLE_EXTENSIONS` rather than restating ".cmd" and
// ".bat": 06-CONTEXT binds PRV-02 to consume exactly what the resolver returns,
// so adding a fourth extension to the resolver's ladder automatically extends
// the interpreter branch instead of silently bypassing it.
export const CMD_INTERPRETED_EXTENSIONS: readonly string[] =
  WINDOWS_EXECUTABLE_EXTENSIONS.filter(
    (extension) => !DIRECTLY_SPAWNABLE_EXTENSIONS.includes(extension),
  );

// Upstream's `metaCharsRegExp` character class, exported as DATA so the escaping
// regex below and the unit test both read one source. Widening this set updates
// the implementation and its expectation together instead of leaving the test
// asserting a stale alphabet.
//
// Note which characters are in here and why they matter to Drift specifically:
// the SPACE and the parentheses protect `C:\Program Files (x86)\…`; the
// AMPERSAND and the apostrophe-adjacent punctuation protect a `%TEMP%` path
// under a username Drift does not control; the PERCENT stops literal
// `%TEMP%`-shaped text from being re-expanded by cmd; and the COMMA protects the
// comma-joined MCP tool allowlist. Source:
// http://www.robvanderwoude.com/escapechars.php via cross-spawn.
export const CMD_META_CHARACTERS: readonly string[] = [
  "(",
  ")",
  "]",
  "[",
  "%",
  "!",
  "^",
  '"',
  "`",
  "<",
  ">",
  "&",
  "|",
  ";",
  ",",
  " ",
  "*",
  "?",
];

// The regex is BUILT from the exported set rather than written as a literal, so
// the set stays the single source of truth. Only the four characters that are
// special inside a character class need escaping here.
const META_CHARS_REG_EXP = new RegExp(
  `([${CMD_META_CHARACTERS.join("").replace(/[\\\]^-]/g, "\\$&")}])`,
  "g",
);

// Upstream `lib/parse.js`:
//   const isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
// Ported verbatim, INCLUDING the unescaped dot before `bin` — that is upstream's
// own text and this is a port, not a derivation. Do not "fix" it: the whole
// point of porting is that the shape is the shape 200M weekly downloads have
// exercised for a decade.
const IS_CMD_SHIM_REG_EXP = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;

// Upstream's heuristic, verbatim in intent: a cmd-shim under `node_modules/.bin`
// proxies its arguments with `%*`, so the caret escapes are consumed once when
// cmd.exe is first invoked and the proxied text is parsed a SECOND time — hence
// the double escape. A globally installed shim (`%APPDATA%\npm\claude.cmd`,
// which is what `npm i -g @anthropic-ai/claude-code` produces) is NOT under
// `node_modules\.bin`, so upstream single-escapes it.
//
// MEASURED, NOT ASSUMED — 07-RESEARCH.md left this open as question A1 because
// npm's global and local shims come from the same generator and the contradiction
// was unresolved in the sources.
//
//   VERDICT (run 32563543158, windows-latest): upstream's heuristic is KEPT.
//   A global shim is SINGLE-escaped and the hazard set round-trips
//   byte-identically. The depth is not the discriminator A1 expected — the
//   double depth round-trips too (run 32563348727 falsified the prediction) —
//   so this predicate is retained on the strength of upstream's decade of use
//   rather than because the alternative was measured to break. See the
//   MEASURED block in this file's header for the mechanism and for the
//   empty-string and single-space edge-probe outcomes.
export function needsDoubleEscape(command: string): boolean {
  return IS_CMD_SHIM_REG_EXP.test(command);
}

// Upstream `lib/util/escape.js` `escapeCommand`, verbatim.
//
// The caret pass ONLY, and deliberately no surrounding quotes: `/s` strips the
// FIRST and LAST quote of the whole command line, so the command is quoted by
// the line's outer pair in `buildSpawnPlan` and never by itself. Quoting it here
// would spend the `/s` allowance on the command and leave the final argument
// unterminated.
export function escapeCmdCommand(value: string): string {
  // Escape meta chars
  return value.replace(META_CHARS_REG_EXP, "^$1");
}

// Upstream `lib/util/escape.js` `escapeArgument`, verbatim, with upstream's own
// explanatory comments kept beside each step.
//
// The two backslash replacements are written in upstream's BACKTRACKING-SAFE
// form (moxystudio/node-cross-spawn#160). The shape is load-bearing, not
// stylistic: the obvious `/(\\*)"/g` form hangs on specially crafted input. This
// is a port — do not "simplify" either regex.
export function escapeCmdArgument(
  value: string,
  doubleEscapeMetaChars: boolean,
): string {
  // Convert to string
  let argument = `${value}`;

  // Algorithm below is based on https://qntm.org/cmd
  // It's slightly altered to disable JS backtracking to avoid hanging on
  // specially crafted input
  // Please see https://github.com/moxystudio/node-cross-spawn/pull/160

  // Sequence of backslashes followed by a double quote:
  // double up all the backslashes and escape the double quote
  argument = argument.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');

  // Sequence of backslashes followed by the end of the string
  // (which will become a double quote later):
  // double up all the backslashes
  argument = argument.replace(/(?=(\\+?)?)\1$/, "$1$1");

  // All other backslashes occur literally

  // Quote the whole thing:
  argument = `"${argument}"`;

  // Escape meta chars
  argument = argument.replace(META_CHARS_REG_EXP, "^$1");

  // Double escape meta chars if necessary
  if (doubleEscapeMetaChars) {
    argument = argument.replace(META_CHARS_REG_EXP, "^$1");
  }

  return argument;
}

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

// The ONLY way a resolved provider binary becomes a spawn on this codebase.
//
// Branch order is part of the contract and the non-win32 arm is written FIRST.
export function buildSpawnPlan(input: {
  command: string;
  args: string[];
  platform: Platform | undefined;
  comspec?: string;
}): SpawnPlan {
  // Non-win32, `undefined` INCLUDED: on macOS and Linux the spawn must be
  // byte-identical to what shipped before this module existed — same file, same
  // argv array, no interpreter — and that byte-identity is CMP-01's obligation
  // (Pitfall F, the POSIX inverse regression). `undefined` (pre-probe, or a
  // platform `normalizePlatform` refused to recognise) takes this arm because
  // there is exactly one thing that can be spawned and it is the command the
  // resolver returned; inventing a cmd.exe layer for a host that may not be
  // Windows would be the reported bug reintroduced one layer up.
  //
  // The argv is COPIED rather than returned by reference: a caller mutating the
  // plan must not reach back into the array `sendCliMessage` built.
  if (input.platform !== "win32") {
    return {
      file: input.command,
      args: [...input.args],
      windowsVerbatimArguments: false,
    };
  }

  // Case-insensitively, because a real `%PATH%` entry can read `claude.CMD`.
  const lowered = input.command.toLowerCase();
  const isInterpreted = CMD_INTERPRETED_EXTENSIONS.some((extension) =>
    lowered.endsWith(extension),
  );

  // A real executable, or a command with no extension at all: nothing for cmd to
  // interpret, so it is spawned directly and the runtime keeps its own MSVC
  // quoting. Claude's native Windows installer emits `claude.exe`, so the most
  // common PRV-01 configuration never touches cmd.exe at all.
  if (!isInterpreted) {
    return {
      file: input.command,
      args: [...input.args],
      windowsVerbatimArguments: false,
    };
  }

  // The cmd.exe plan. Phase 10 owns the console-window flash this branch
  // introduces (UX-04, `windowsHide`) and Phase 8 owns the extra process-tree
  // level it adds to a cancel (LIF-01, `taskkill /T /F`). Marked, deliberately
  // not acted on here.
  const doubleEscapeMetaChars = needsDoubleEscape(input.command);
  const parts = [
    escapeCmdCommand(input.command),
    ...input.args.map((argument) =>
      escapeCmdArgument(argument, doubleEscapeMetaChars),
    ),
  ];
  // ONE outer quote pair around the WHOLE line — `/s`'s unconditional "strip the
  // first and last quote, leave the rest unchanged" replaces the five-clause
  // heuristic cmd would otherwise apply, and Drift cannot satisfy that
  // heuristic's "no special characters" clause because the paths carry a
  // username it does not control. `/d` disables the per-user AutoRun key, which
  // on a security tester's machine is more likely than average to hold something
  // (T-07-02). With an empty argument list `parts` is the command alone, so the
  // join contributes no trailing separator.
  const comspec = input.comspec ?? "";
  return {
    file: comspec === "" ? DEFAULT_COMSPEC : comspec,
    args: ["/d", "/s", "/c", `"${parts.join(" ")}"`],
    windowsVerbatimArguments: true,
  };
}
