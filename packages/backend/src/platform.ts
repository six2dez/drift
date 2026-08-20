// Pure OS-decision helpers for the native-Windows port. Two properties are
// load-bearing here and both are mechanically checkable: this module performs
// ZERO I/O, and it carries ZERO import statements — `grep -c '^import'` over
// this file returns 0, which is the machine form of the "no I/O" claim (SC-1).
// `platform` is therefore always an INJECTED parameter, never read from `os` or
// `process`: D-02 puts the single `os` read in index.ts behind the RUN-05 probe.
// That injection is the whole point — the maintainer cannot test native Windows
// locally, so every win32 branch has to be provable by the Linux/macOS CI runner,
// and anything left un-injected is unverifiable by construction.
//
// Not imported, deliberately: `os` (D-02, above) and `path`. None of the exports
// below needs `path`, and `getTempRoot` strips separators with explicit string
// logic *because* `path` resolves to its POSIX flavour on the Linux runner and
// would not strip a Windows-shaped trailing backslash. An unused import is also a
// hard build failure here (tsconfig `noUnusedLocals` → TS6133; `pnpm lint` runs
// at `--max-warnings 0`), so the zero-import property is self-enforcing.

// The narrow union is deliberate — NOT `NodeJS.Platform`. Widening it to every
// value Node can report would let an unrecognised platform flow silently into
// the POSIX arm, which on Windows *is* the reported bug reintroduced one layer
// up. Keeping the union at three members is what forces the explicit
// `normalizePlatform` check at the single `os.platform()` call site, which is
// exactly where D-06's "an unrecognised value gates MCP start" rule belongs.
// (D-01 also offered a `createPlatformProfile()` aggregate descriptor and
// rejected it: every caller would have had to supply inputs it does not have.)
export type Platform = "win32" | "darwin" | "linux";

// Allow-list gate, modelled on `command-resolution.ts`'s `extractHomeDir`:
// return `undefined` for anything unrecognised rather than guessing. Caido's
// LLRT hardcodes PLATFORM at compile time — "darwin", "win32", and otherwise
// `std::env::consts::OS`, whose third arm can yield "freebsd" or "android".
// Such a value must NOT fall through to the POSIX arm (D-06 / RUN-05); the
// caller gates MCP start on `undefined` and says so out loud.
export function normalizePlatform(
  value: string | undefined,
): Platform | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized === "") return undefined;
  if (
    normalized === "win32" ||
    normalized === "darwin" ||
    normalized === "linux"
  ) {
    return normalized;
  }
  return undefined;
}

// Normalises the host temp root to a form safe to append a path segment to.
// Node's `os.tmpdir()` has stripped trailing separators on every platform since
// v2.0.0, but Caido's LLRT does not: there `os.tmpdir()` is
// `std::env::temp_dir()`, i.e. GetTempPath2 on Windows, documented to return a
// path ENDING IN A BACKSLASH ("C:\TEMP\"), and $TMPDIR on macOS, which launchd
// conventionally sets with a trailing slash. Without this strip the production
// path is `C:\Users\x\AppData\Local\Temp\/drift-mcp-abc` while every CI run
// looks clean.
//
// The strip is explicit string logic, never `path.normalize`/`path.join`: the
// unit tests run on Linux where `path` is POSIX-flavoured and would leave a
// Windows trailing backslash in place, so the win32 case would be untestable
// exactly where it matters. It is also separator-agnostic on purpose — both
// spellings are stripped on all three platforms, since the runtime rather than
// the OS decides which one comes back. `platform` stays in the signature (D-01,
// locked) so `getSweepRoots` can forward `input` unchanged.
export function getTempRoot(input: {
  platform: Platform;
  tmpdir: string;
}): string {
  let root = input.tmpdir.trim();
  // Guarded so a root is never reduced to nothing: stop at length 1 (so "/"
  // stays "/") and stop when the remainder is a bare drive (so "C:\" stays
  // "C:\", which is a real path, while "C:" alone is drive-relative and is not).
  while (root.length > 1) {
    const last = root[root.length - 1];
    if (last !== "/" && last !== "\\") break;
    const remaining = root.slice(0, -1);
    if (remaining.endsWith(":")) break;
    root = remaining;
  }
  return root;
}

// Absolute-path recognition that does not depend on which FLAVOUR of `path` the
// host resolved to.
//
// The problem this replaces: `path.isAbsolute` follows the module's own
// platform. This file already refuses to import `path` on the stated grounds
// that it "resolves to its POSIX flavour on the Linux runner" — and if that is
// true of the runner it may be true of Caido's LLRT, which is precisely the
// unknown Phase 4 exists to stop guessing about. A POSIX-flavoured
// `path.isAbsolute("C:\\Users\\x\\AppData\\Roaming\\npm\\claude.cmd")` returns
// FALSE, so a Windows user who configures an absolute provider command falls
// through to a `which` spawn — a binary that does not exist on Windows — and is
// told the command is unresolvable.
//
// `platform` is INJECTED like everything else here, so both branches are
// provable from the Linux runner. `undefined` means the RUN-05 probe has not run
// yet (resolveCommand is reachable from a provider status check before MCP
// start), and it accepts EITHER spelling on purpose: the two behaviours a caller
// picks between are "stat this path" and "spawn a PATH search", and when the
// platform is unknown the stat is both the cheaper answer and the one that fails
// safe — a wrong guess costs one failed stat and then falls through.
//
// Explicit character tests, never a regex with backslashes, for the same reason
// getTempRoot strips separators by hand: the win32 spellings must stay readable
// and testable on a POSIX host.
export function isAbsolutePath(input: {
  value: string;
  platform: Platform | undefined;
}): boolean {
  const value = input.value;
  if (value === "") return false;

  const first = value[0] ?? "";
  const isPosixAbsolute = first === "/";

  // "C:\", "C:/" — a drive-qualified root. A bare "C:" is drive-RELATIVE and is
  // deliberately excluded, matching getTempRoot's treatment of the same string.
  const driveLetter =
    (first >= "A" && first <= "Z") || (first >= "a" && first <= "z");
  const third = value[2] ?? "";
  const isDriveAbsolute =
    driveLetter && value[1] === ":" && (third === "\\" || third === "/");

  // A leading separator: a UNC "\\server\share" or a rooted "\dir", both of which
  // Node's win32 path.isAbsolute also accepts.
  const isRooted = first === "\\" || first === "/";

  if (input.platform === "win32") return isDriveAbsolute || isRooted;
  if (input.platform === undefined) {
    return isPosixAbsolute || isDriveAbsolute || isRooted;
  }
  return isPosixAbsolute;
}

// Every directory the orphan sweep must scan for leftover `drift-mcp-*` dirs.
//
// The second arm is the security-relevant part and the entire CMP-02 proof: the
// shipped 0.1.0 wrote token-bearing `drift-mcp-*` directories to a hardcoded
// /tmp. On macOS `os.tmpdir()` is /var/folders/…, so the moment this milestone
// switches to `os.tmpdir()` those directories stop being swept — a Caido token
// left readable on disk for as long as the machine keeps /tmp. Scanning /tmp as
// well on non-win32 keeps them reachable after upgrade. win32 gets no such arm:
// there is no legacy Windows install to clean up, and /tmp is not a Windows path.
export function getSweepRoots(input: {
  platform: Platform;
  tmpdir: string;
}): string[] {
  const roots = [getTempRoot(input)];
  if (input.platform !== "win32" && !roots.includes("/tmp")) roots.push("/tmp");
  return roots;
}

// The binary that answers "where does this command live on PATH".
//
// "where.exe", not a bare "where": Phase 3's P1-WHERE measured it on a real
// windows-latest host. Two facts from that measurement belong to Phase 6 and are
// deliberately NOT implemented here — recorded so Phase 6 does not re-derive
// them (source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md,
// § P1-WHERE):
//   1. the measured invocation was by ABSOLUTE path,
//      C:\Windows\System32\where.exe;
//   2. the output was 2 CRLF-split lines, so the parse must split on /\r?\n/ —
//      multi-line output is confirmed real, not hypothetical.
export function getWhichCommand(input: { platform: Platform }): {
  command: string;
  args: (cmd: string) => string[];
} {
  if (input.platform === "win32") {
    return { command: "where.exe", args: (cmd: string) => [cmd] };
  }
  return { command: "which", args: (cmd: string) => [cmd] };
}

// ".exe" first because Phase 6 (SC-2) requires preferring a real executable over
// a shim. ".cmd"/".bat" are the pair Phase 3's P1-CMD proved cannot be spawned
// directly: Node >= 18.20.2 throws EINVAL SYNCHRONOUSLY from the CVE-2024-27980
// guard, which is why Phase 7 routes them through `cmd.exe /d /s /c` and why a
// try/catch around the spawn() call is required rather than only an error
// handler. Phase 4 ships the list and nothing else (D-03: shape, not data).
export const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat"] as const;

// Candidate filenames to probe for a command, in preference order. POSIX has
// exactly one answer; Windows needs the extension ladder because PATHEXT
// resolution does not happen for a spawn by explicit path.
export function getExecutableNames(input: {
  command: string;
  platform: Platform;
}): string[] {
  const command = input.command.trim();
  if (command === "") return [];
  if (input.platform !== "win32") return [command];

  // Already extensioned (case-insensitively — "claude.CMD" is what a real
  // %PATH% entry can look like): take it as given rather than producing
  // "claude.CMD.exe".
  const lowered = command.toLowerCase();
  if (
    WINDOWS_EXECUTABLE_EXTENSIONS.some((extension) =>
      lowered.endsWith(extension),
    )
  ) {
    return [command];
  }

  // Bare name last, as a final fallback for anything already extension-free and
  // directly executable.
  return [
    ...new Set([
      ...WINDOWS_EXECUTABLE_EXTENSIONS.map(
        (extension) => `${command}${extension}`,
      ),
      command,
    ]),
  ];
}

// WHICH environment variables name a home-ish directory, per platform. Per D-03
// this ships the variable NAMES only — the install-location candidate arrays
// built from them (%APPDATA%\npm, nvm-windows, scoop, …) stay in Phase 6's
// `command-resolution.ts`, which this phase does not touch.
//
// Phase 3's P3-VARS confirmed USERPROFILE, APPDATA and LOCALAPPDATA are all
// present and non-empty in the parent process on windows-latest.
export function getHomeDirCandidates(input: {
  platform: Platform;
  env: Record<string, string | undefined>;
}): string[] {
  const names =
    input.platform === "win32"
      ? ["USERPROFILE", "APPDATA", "LOCALAPPDATA"]
      : ["HOME"];

  const candidates: string[] = [];
  for (const name of names) {
    const value = input.env[name]?.trim();
    if (value === undefined || value === "") continue;
    candidates.push(value);
  }
  return [...new Set(candidates)];
}

// The environment block for a spawned child: the parent block first, drift's own
// variables overlaid on top.
//
// The parent spread is not defensive padding, it is a measured requirement
// (SC-9). Phase 3 re-measured P0-ENV with a parent-only marker on
// windows-latest and the child reported PARENT-CLEARED — the spawn `env` option
// REPLACES the parent block on Windows exactly as it does on POSIX. libuv
// back-fills only eleven `required_vars` (HOMEDRIVE, HOMEPATH, LOGONSERVER,
// PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN, USERNAME, USERPROFILE,
// WINDIR), and APPDATA/LOCALAPPDATA are NOT among them — which are precisely
// what the Windows nvm/fnm candidate paths need. So `{ ...driftVars }` alone is
// a defect on EITHER platform, not a Windows-only one. Source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md and
// https://github.com/six2dez/drift/actions/runs/31780073574
//
// `parentEnv` is an input rather than a `process.env` read so the SC-9 assertion
// stays a pure unit test. This returns data only and must never be used to
// render an environment into a log or diagnostic (T-04-04).
export function buildSpawnEnv(input: {
  parentEnv: Record<string, string | undefined>;
  driftVars: Record<string, string>;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.parentEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  return { ...merged, ...input.driftVars };
}
