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

// Joins path segments for the TARGET platform, with the separator taken ONLY
// from the injected `platform` (D-05). Backslash on the literal "win32",
// forward slash otherwise — `undefined` included, since POSIX is the non-win32
// arm and is what every pre-probe caller wants.
//
// Hand-rolled for exactly the reason getTempRoot strips separators by hand: the
// `path` module is platform-FLAVOURED, so on the Linux CI runner it would spell
// a Windows candidate as "C:\Users\x/.local/bin/claude". Win32 APIs accept that,
// so it is not a runtime break — the reason to fix it is EVIDENCE. With a
// module join the candidate strings differ by HOST rather than by target
// platform, so a Linux-runner assertion cannot state what a Windows box will
// produce and SC-5 degrades into a test of the runner.
//
// The one-line namespace fix does not exist on the shipping runtime: Caido's
// LLRT `path` declares NO posix and NO win32 namespace at all — its
// PlatformPath interface (@caido/quickjs-types@0.25.4, src/llrt/path.d.ts)
// returns zero matches for either name. Reading the separator from the module's
// own separator property is forbidden here for the same reason: it reports the
// HOST's flavour, which is the exact bug this function exists to eliminate.
//
// The POSIX output is asserted BYTE-IDENTICAL to the module-based join it
// replaces — that equality is the CMP-01 proof for the sweep, per D-05 and
// 06-CONTEXT § Specific Ideas, and it lives in this file's "CMP-01" describe
// block rather than being left to review.
//
// Deliberately does NOT collapse "." or ".." — no POSIX suffix list in
// command-resolution.ts contains either, and normalising would break the
// byte-identity proof rather than serve it.
export function joinPath(input: {
  platform: Platform | undefined;
  segments: string[];
}): string {
  const separator = input.platform === "win32" ? "\\" : "/";

  // Both spellings are recognised at a seam on BOTH platforms, on the same
  // grounds as getTempRoot's separator-agnostic strip: the runtime rather than
  // the OS decides which spelling an inherited value arrives in.
  const isSeparator = (character: string): boolean =>
    character === "/" || character === "\\";

  let joined = "";
  let isFirst = true;
  for (const segment of input.segments) {
    const trimmed = segment.trim();
    if (trimmed === "") continue;

    // The first surviving segment keeps its own leading separator verbatim, so
    // an absolute POSIX segment stays absolute and a "C:\" root stays rooted.
    if (isFirst) {
      joined = trimmed;
      isFirst = false;
      continue;
    }

    let next = trimmed;
    while (next.length > 0 && isSeparator(next[0] ?? "")) next = next.slice(1);
    if (next === "") continue;

    let head = joined;
    while (head.length > 0 && isSeparator(head[head.length - 1] ?? "")) {
      head = head.slice(0, -1);
    }

    joined = `${head}${separator}${next}`;
  }

  return joined;
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

// The binary that answers "where does this command live on PATH", and — on
// Windows — the absolute path it is invoked by.
//
// "where.exe", not a bare "where", and invoked by ABSOLUTE path: Phase 3's
// P1-WHERE measured both on a real windows-latest host, where the binary
// resolved a command across 2 CRLF-split lines (source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md,
// § P1-WHERE — the committed findings document, never the CI artifacts, which
// expire 2026-09-12). The multi-line half of that measurement is answered by
// rankPathSearchHits above; this function answers the invocation half.
//
// The literal drive-qualified path Phase 3 measured is REJECTED as a hardcode.
// It breaks on any machine where Windows is not on that drive or lives under a
// non-default root, and it breaks in the worst available way: the spawn fails,
// and a fully working CLI is reported to the user as "not found on PATH". The
// root is therefore read from the machine's own environment, and the measured
// literal survives only as the thing that told us the shape.
//
// The bare-name fallback is load-bearing, not defensive padding. The system-root
// variable's guaranteed presence rests on libuv's eleven back-filled
// required_vars — quoted verbatim in buildSpawnEnv's comment below — and that
// back-fill is libuv's, i.e. Node's. Whether Caido's constrained runtime does
// the same is unverified in EITHER direction, exactly as P2-OS and P3-UUID are
// node-vehicle results rather than measurements of the shipping runtime. So the
// fallback arm must be reachable and tested rather than treated as dead code,
// and it is.
//
// Casing: Windows' own environment lookup is case-insensitive, so on the real
// platform one spelling would do. The unit test runs on Linux, where a plain
// object lookup is case-SENSITIVE, so both spellings are read — native first,
// first non-empty trimmed value winning — and the test asserts the canonical
// one. getWindowsNamedRoots below reads its mixed-case variables the same way.
export function getWhichCommand(input: {
  platform: Platform | undefined;
  env: Record<string, string | undefined>;
}): { command: string; args: (cmd: string) => string[] } {
  const args = (cmd: string) => [cmd];

  // The literal "win32" only: `undefined` is pre-probe and takes the POSIX arm
  // below. Only ONE binary can actually be spawned, so unlike
  // getHomeDirCandidates there is no union answer available here — and the
  // POSIX arm is the one that keeps a PATH-only binary resolving on macOS and
  // Linux during a pre-probe provider check, which is CMP-01 surface.
  if (input.platform === "win32") {
    let systemRoot = "";
    for (const name of ["SystemRoot", "SYSTEMROOT"]) {
      const value = input.env[name]?.trim();
      if (value === undefined || value === "") continue;
      systemRoot = value;
      break;
    }

    // Strip every trailing separator before joining, so a root that already
    // carries one does not produce a doubled separator. Unlike getTempRoot's
    // strip there is no bare-drive guard, and deliberately: a segment is being
    // APPENDED here rather than a root preserved, so reducing "D:\" to "D:"
    // yields the correct "D:\System32\…" instead of a doubled separator.
    let root = systemRoot;
    while (root.length > 0) {
      const last = root[root.length - 1];
      if (last !== "\\" && last !== "/") break;
      root = root.slice(0, -1);
    }

    // Explicit string logic with the win32 separator spelled here, not
    // joinPath: this is one fixed two-segment join, and routing it through the
    // other decision helper would make platform.ts's two helpers mutually
    // dependent for no gain.
    if (root === "") return { command: "where.exe", args };
    return { command: `${root}\\System32\\where.exe`, args };
  }
  return { command: "which", args };
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

// Named rather than inline so the signature stays on ONE line. An inline object
// parameter forces prettier to close it as `}): string[] {`, a line that begins
// with a brace in column 0 — which silently ends any `awk '/…/,/^}/'` range at
// the signature, so a gate meant to read this function's BODY would read its
// first line instead and pass or fail for the wrong reason.
type PathSearchHitsInput = {
  lines: string[];
  platform: Platform | undefined;
};

// Ranks every line of a PATH-search result and returns the survivors in
// preference order — .exe hits first, then .cmd, then .bat (the order of
// WINDOWS_EXECUTABLE_EXTENSIONS, read from the constant and never restated).
//
// (a) The ranking exists BECAUSE the search tool's cross-extension output order
// is undocumented. Microsoft's `where` page describes the PATH and extension
// search but says nothing about the order of the printed results, and Phase 3's
// measurement returned two lines that carried the SAME extension, so it cannot
// discriminate PATH-major from PATHEXT-major. "First line wins" would therefore
// make SC-2's executable-over-shim preference an accident of the machine's PATH
// rather than an implemented behaviour — on a box where the shim sits earlier in
// PATH, the shim would win and Phase 7 would route it through a command
// interpreter for no reason.
//
// (b) The contract needs only two facts, and both hold: the tool emits EVERY
// hit (measured — two lines), and within a single extension it walks PATH in
// order (documented). Neither fact is the undocumented one, which is why the
// sort is stable and the within-extension tie-break is simply the input order.
//
// (c) The extension-termination filter is the SECOND of two independent guards
// against a line that is not a path reaching a path consumer. The first is the
// exit-code gate at the call site, which is not taken on a no-match; this one is
// the guard that survives a future loosening of that gate, and it is also what
// discards the partial final line the bounded output buffer leaves behind above
// its cap. Both are asserted in tests.
//
// (d) Source for the measurement:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
// § P1-WHERE — the committed findings document, never the CI artifacts, which
// expire 2026-09-12.
export function rankPathSearchHits(input: PathSearchHitsInput): string[] {
  // Non-win32, `undefined` INCLUDED: the POSIX search tool has single-answer
  // semantics, so the ranking arm must be a no-op there and return exactly what
  // the single-line extraction this replaces returned. That byte-identity is
  // D-01's CMP-01 obligation. `undefined` (pre-probe) takes this arm because
  // only one binary can actually be spawned, so no union answer exists here —
  // unlike getHomeDirCandidates, where one does.
  if (input.platform !== "win32") {
    const first = input.lines[0]?.trim() ?? "";
    return first === "" ? [] : [first];
  }

  const ranked: { value: string; rank: number; order: number }[] = [];
  for (const line of input.lines) {
    // Trim before matching: the measured output was CRLF-split, so a lone
    // carriage return rides on every line but the last.
    const value = line.trim();
    if (value === "") continue;
    // Lowercased for the MATCH only; the original spelling is what is returned,
    // because that is the string the OS was given and must be handed back.
    const lowered = value.toLowerCase();
    const rank = WINDOWS_EXECUTABLE_EXTENSIONS.findIndex((extension) =>
      lowered.endsWith(extension),
    );
    if (rank === -1) continue;
    ranked.push({ value, rank, order: ranked.length });
  }

  // Explicit order tie-break rather than relying on Array.prototype.sort being
  // stable: the guarantee is only specified since ES2019 and this runs under a
  // constrained engine, so the property the contract depends on is written down
  // rather than assumed.
  ranked.sort((left, right) =>
    left.rank === right.rank
      ? left.order - right.order
      : left.rank - right.rank,
  );
  return ranked.map((entry) => entry.value);
}

// Named rather than inline for the same reason PathSearchHitsInput above is: an
// inline object parameter closes as `}): string[] {`, a brace in column 0 that
// silently ends a body-extracting `awk '/…/,/^}/'` range at the signature.
type HomeDirCandidatesInput = {
  platform: Platform | undefined;
  env: Record<string, string | undefined>;
};

// WHICH environment variables name a home-ish directory, per platform. Per
// 04-D-03 this ships the variable NAMES only: the install-location candidate
// arrays built from them (%APPDATA%\npm, nvm-windows, scoop, …) live in
// `command-resolution.ts`, which is where the SHAPE-versus-DATA line puts them,
// and Phase 6 wires this function to that module's callers.
//
// Phase 3's P3-VARS confirmed USERPROFILE, APPDATA and LOCALAPPDATA are all
// present and non-empty in the parent process on windows-latest (source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
// § P3-VARS — the committed findings document, never the CI artifacts, which
// expire 2026-09-12).
//
// `undefined` — pre-probe — reads BOTH name sets, POSIX first. This is the
// THIRD site applying the same union-when-unknown rule: the other two are
// isAbsolutePath's `undefined` arm above and command-resolution.ts's
// platform-blind shape-sniffing in extractHomeDir. All three read alike, so a
// reader who has met one has met them all. Whichever variables the machine
// actually sets decide the answer, because the wrong platform's names are
// simply absent — which is exactly why the union costs a POSIX machine nothing
// and is asserted as such.
//
// Defaulting to the POSIX name set pre-probe was REJECTED, with the sharpest
// reason available: on Windows every provider status check that runs BEFORE MCP
// start would read only a variable Windows does not set, so the Settings panel
// shows all four CLIs unavailable — which is very close to the symptom this
// milestone exists to fix. Gating resolution on the runtime probe instead was
// rejected too: pre-probe checks would then lose the version-manager and
// install-location fallbacks on EVERY platform, which is a macOS/Linux
// regression (CMP-01), not a Windows-only cost.
export function getHomeDirCandidates(input: HomeDirCandidatesInput): string[] {
  const posixNames = ["HOME"];
  const windowsNames = ["USERPROFILE", "APPDATA", "LOCALAPPDATA"];
  const names =
    input.platform === "win32"
      ? windowsNames
      : input.platform === undefined
        ? [...posixNames, ...windowsNames]
        : posixNames;

  const candidates: string[] = [];
  for (const name of names) {
    const value = input.env[name]?.trim();
    if (value === undefined || value === "") continue;
    candidates.push(value);
  }
  return [...new Set(candidates)];
}

// The Windows install roots, read by NAME from an injected environment (D-09's
// input shape).
//
// Per 04-D-03 this ships variable NAMES only: the suffix lists built from these
// roots (npm's prefix, nvm-windows, fnm, Volta, scoop, …) stay in
// command-resolution.ts, which is where the SHAPE-versus-DATA line puts them.
//
// Phase 3's P3-VARS measured USERPROFILE, APPDATA and LOCALAPPDATA all present
// and non-empty in the parent process on windows-latest (source:
// .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
// § P3-VARS — the findings file, never the CI artifacts, which expire
// 2026-09-12). ProgramFiles, ProgramFiles(x86) and ProgramData are NOT among
// libuv's eleven back-filled required variables and were NOT covered by
// P3-VARS, so a missing one must degrade to SKIPPING its row — never to a
// drive-letter literal, which is Pitfall 4.
//
// Three of these are spelled mixed-case by Windows itself. Windows' own
// process.env is case-INsensitive, but the plain object lookup this function
// does on the Linux test runner is not — so both spellings are read, native
// first, first non-empty wins. The unit test can then assert the canonical
// spelling while the real platform works under either.
//
// No SystemRoot field: D-02 gives that variable to getWhichCommand, and two
// readers of one variable is the duplication this file's discipline forbids.
export type WindowsNamedRoots = {
  userProfile?: string;
  appData?: string;
  localAppData?: string;
  programFiles?: string;
  programFilesX86?: string;
  programData?: string;
};

export function getWindowsNamedRoots(input: {
  env: Record<string, string | undefined>;
}): WindowsNamedRoots {
  const read = (names: string[]): string | undefined => {
    for (const name of names) {
      const value = input.env[name]?.trim();
      if (value === undefined || value === "") continue;
      return value;
    }
    return undefined;
  };

  const roots: WindowsNamedRoots = {};
  // Assigned only when present: an absent root must emit NO candidate at all
  // (T-06-T02). A present-but-empty prefix would produce a relative path that
  // resolves against the process working directory — a directory the user never
  // chose.
  const userProfile = read(["USERPROFILE"]);
  if (userProfile !== undefined) roots.userProfile = userProfile;
  const appData = read(["APPDATA"]);
  if (appData !== undefined) roots.appData = appData;
  const localAppData = read(["LOCALAPPDATA"]);
  if (localAppData !== undefined) roots.localAppData = localAppData;
  const programFiles = read(["ProgramFiles", "PROGRAMFILES"]);
  if (programFiles !== undefined) roots.programFiles = programFiles;
  const programFilesX86 = read(["ProgramFiles(x86)", "PROGRAMFILES(X86)"]);
  if (programFilesX86 !== undefined) roots.programFilesX86 = programFilesX86;
  const programData = read(["ProgramData", "PROGRAMDATA"]);
  if (programData !== undefined) roots.programData = programData;
  return roots;
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
