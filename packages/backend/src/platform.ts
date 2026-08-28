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

// The Windows system root, DERIVED from the host temp directory's drive letter
// rather than read from the environment.
//
// WHY THIS EXISTS AT ALL — and this is a MEASUREMENT, not a worry. The
// 2026-08-27 diagnostics from a shipping Caido install report
// `parentEnvKeyCount: 0`: the environment the backend sees is EMPTY. It arrives
// alongside three other absences from the same restricted `process` shim
// (`kill`, `version`, `versions`), and four absences are a sandbox POLICY rather
// than a host quirk — a policy very unlikely to differ by platform. So every
// environment-sourced Windows system root in this codebase (`getWhichCommand`'s,
// `buildKillTreePlan`'s, `selectComspec`'s) resolves to nothing on a real
// install and falls through to a BARE executable name, which Windows resolves
// through a search order that includes the working directory Caido's plugin host
// chose (T-08-03). That is the shipping path, not the exceptional one — while
// every CI leg stays green, because Node populates the environment.
//
// `os.tmpdir()` is the ONE non-environment source of a Windows path this runtime
// offers, and it is confirmed working on the very install that reported the
// empty environment (`runtimeOsPlatform: ok (gating)`, with `mcpTempDir`
// correctly resolved beneath it). On Windows it is drive-qualified, so the drive
// letter is readable and `<drive>:\Windows` follows.
//
// THIS IS A DERIVATION, NOT A MEASUREMENT, and it is written as one. `TEMP` can
// be redirected to a drive other than the one Windows is installed on, in which
// case the root derived here is WRONG (T-08-35, accepted). The asymmetry is the
// entire argument: a wrong ABSOLUTE path fails the spawn LOUDLY, with a
// file-not-found a diagnostics report shows, whereas a bare name resolves
// SILENTLY through a search order that includes a directory Drift does not
// choose — on a security tester's machine. A loud wrong answer beats a quiet
// compromised one, and the bare name stays reachable and tested BENEATH this
// rung, which is what makes SC-1's "last resort" clause true rather than merely
// written.
//
// The literal "Windows" is NOT the kind of hardcode `getWhichCommand`'s header
// rejects. That header rejects a drive-QUALIFIED literal, because the drive is
// the part that actually varies between machines — and the drive is exactly what
// is read at runtime here. The directory name beneath it is fixed by the OS.
//
// No `platform` parameter, deliberately: the derivation is SHAPE-based, every
// POSIX temp root falls out empty on its own, and a platform gate would create a
// second place the win32 decision is written.
export function deriveWindowsSystemRoot(input: {
  tmpdir: string | undefined;
}): string {
  const tmpdir = typeof input.tmpdir === "string" ? input.tmpdir.trim() : "";
  if (tmpdir === "") return "";

  // Explicit character tests rather than a regular expression — the same rule
  // `isAbsolutePath` and `getTempRoot` already follow, and for the same reason:
  // the win32 spellings have to stay readable and assertable from a POSIX host.
  const first = tmpdir[0] ?? "";
  const isDriveLetter =
    (first >= "A" && first <= "Z") || (first >= "a" && first <= "z");
  if (!isDriveLetter || tmpdir[1] !== ":") return "";

  // A drive-RELATIVE prefix ("C:", "C:tmp") is not a rooted path and derives
  // nothing, matching `isAbsolutePath`'s treatment of the identical string. A
  // UNC path never reaches this line: its first character is a separator rather
  // than a letter, so it carries no drive letter to derive from at all.
  const third = tmpdir[2] ?? "";
  if (third !== "\\" && third !== "/") return "";

  return `${first.toUpperCase()}:\\Windows`;
}

// The file to hand `spawn` for a Windows SYSTEM binary — `taskkill.exe`,
// `where.exe`, `cmd.exe` — resolved through ONE ladder written in ONE place.
//
// The ladder: the injected environment under the native casing, then the
// SCREAMING casing, first non-empty trimmed value winning; then `fallbackRoot`
// (see `deriveWindowsSystemRoot` above); then, only when both are empty after
// stripping, the BARE `binary`. The bare rung is the documented last resort
// (T-08-03) and is kept reachable and tested rather than deleted — it is simply
// no longer the FIRST thing an empty environment reaches, which is the whole
// point of the rung between.
//
// CONSOLIDATED, not merely extracted. `getWhichCommand`'s win32 arm carried this
// ladder and `buildKillTreePlan`'s win32 arm carried a second copy of it, comment
// for comment. Two copies of a security decision are two copies that can diverge,
// and the one that diverges is the one nobody re-read — so the reasoning travels
// with the code rather than being paraphrased at either former site.
export function resolveWindowsSystemBinary(input: {
  env: Record<string, string | undefined>;
  fallbackRoot: string;
  binary: string;
}): string {
  // A NON-STRING `fallbackRoot` is coerced to empty BEFORE the ladder runs, and
  // this is required rather than defensive padding. `packages/backend/tsconfig.json`
  // excludes `./src/**/*.test.ts`, so the compiler never checks a test call site,
  // and vitest transpiles one without type-checking it. A test that was not
  // updated to pass the new required member therefore arrives here at RUNTIME
  // carrying the absent-value primitive JavaScript hands a missing argument.
  // Without this coercion, composing the path below interpolates that
  // primitive's NAME as text and yields a plausible-looking absolute path that
  // resolves to nothing — in the one function whose entire purpose is to stop a
  // bare name reaching Windows' search order. With it, the input falls through
  // to the bare name: still wrong, but LOUDLY wrong and documented.
  //
  // The asymmetry is specific rather than general, and worth stating so nobody
  // "simplifies" it away: `buildKillTreePlan`'s win32 arm already reached its
  // bare-name constant on an EMPTY root, so today's empty value was always safe.
  // The absent one would not have been.
  const fallbackRoot =
    typeof input.fallbackRoot === "string" ? input.fallbackRoot : "";

  // Casing: Windows' own environment lookup is case-insensitive, so on the real
  // platform one spelling would do. The unit test runs on Linux, where a plain
  // object lookup is case-SENSITIVE, so both spellings are read — native first,
  // first non-empty trimmed value winning — and the test asserts the canonical
  // one. getWindowsNamedRoots below reads its mixed-case variables the same way.
  let systemRoot = "";
  for (const name of ["SystemRoot", "SYSTEMROOT"]) {
    const value = input.env[name]?.trim();
    if (value === undefined || value === "") continue;
    systemRoot = value;
    break;
  }

  // The DERIVED rung, between the measurement and the bare name. Trimmed by the
  // same present-but-empty rule the environment read applies, so a whitespace-
  // only fallback counts as absent rather than composing a rootless path.
  if (systemRoot === "") systemRoot = fallbackRoot.trim();

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

  // Explicit string logic with the win32 separator spelled here, not joinPath:
  // this is one fixed join, and routing it through the other decision helper
  // would make platform.ts's two helpers mutually dependent for no gain.
  if (root === "") return input.binary;
  return `${root}\\System32\\${input.binary}`;
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
// UPDATED 2026-08-27 (G-01), and the update is the point rather than a tidy-up:
// the question above is now ANSWERED, unfavourably. The environment Caido's
// backend actually sees is EMPTY, so the bare name was not a rarely-reached
// fallback here — it was the expected Windows answer. `systemRootFallback` is
// the rung that sits between, and it is a REQUIRED member so the compiler forces
// every call site to state one (T-08-36, the CR-01 failure shape). The casing
// ladder, the trailing-separator strip and the reasoning behind both now live in
// `resolveWindowsSystemBinary` above, which `buildKillTreePlan`'s win32 arm calls
// as well — one implementation instead of two copies that can diverge.
export function getWhichCommand(input: {
  platform: Platform | undefined;
  env: Record<string, string | undefined>;
  systemRootFallback: string;
}): { command: string; args: (cmd: string) => string[] } {
  const args = (cmd: string) => [cmd];

  // The literal "win32" only: `undefined` is pre-probe and takes the POSIX arm
  // below. Only ONE binary can actually be spawned, so unlike
  // getHomeDirCandidates there is no union answer available here — and the
  // POSIX arm is the one that keeps a PATH-only binary resolving on macOS and
  // Linux during a pre-probe provider check, which is CMP-01 surface.
  if (input.platform === "win32") {
    return {
      command: resolveWindowsSystemBinary({
        env: input.env,
        fallbackRoot: input.systemRootFallback,
        binary: "where.exe",
      }),
      args,
    };
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
  // NON-CLAIM, recorded here rather than deleted, because a later reader will
  // otherwise see an unconsumed root and "finish the job" by adding a row for
  // it. As of the CR-02 fix this root has NO consumer: the one row that used it,
  // machine-wide scoop at %ProgramData%\scoop\shims, was DROPPED for security
  // (C:\ProgramData grants Authenticated Users create-subdirectory by default,
  // so any local account can plant a binary there, and a resolved binary is
  // spawned with CAIDO_TOKEN in its environment). The full reasoning lives
  // beside the dropped-rows list in command-resolution.ts.
  //
  // The variable READ is not the hazard and is kept: reading an environment
  // value emits no candidate. Emitting a candidate under it is the hazard, and
  // that is what was removed. Do not add a %ProgramData% row back without a
  // trust-domain argument that answers the one above.
  const programData = read(["ProgramData", "PROGRAMDATA"]);
  if (programData !== undefined) roots.programData = programData;
  return roots;
}

// Is nvm-windows actually INSTALLED on this machine?
//
// The signal is the installer's own environment contract: coreybutler/nvm-windows
// `nvm.iss` writes NVM_HOME (the install root) and NVM_SYMLINK (the symlink
// directory it then appends to PATH). Neither name exists on a machine that
// never ran that installer.
//
// This is a PRESENCE test, never a value read: the answer it gates is the
// drive-qualified literal C:\nvm4w\nodejs, which is the installer's own default
// and is spelled at the catalogue row. Returning the NVM_SYMLINK value instead
// would be a different and larger change - a user-settable environment variable
// deciding which directory Drift spawns from - and is deliberately not made
// here.
//
// Why the gate exists at all (CR-02): C:\ grants BUILTIN\Users create-folder
// rights, so C:\nvm4w\nodejs is creatable by a non-administrator on a machine
// where nvm-windows was never installed - and a binary resolved from it is
// spawned with CAIDO_TOKEN in its environment. Gating on these two names keeps
// the coverage for real nvm-windows users (who have them set) while removing
// the row from every machine that does not.
//
// `env` is an INPUT, exactly like getWindowsNamedRoots' - never a `process.env`
// read - so the answer stays assertable from literal inputs on the Linux runner
// and the candidate builders it feeds stay I/O-free (D-10 / SC-5).
export function isNvmWindowsInstalled(input: {
  env: Record<string, string | undefined>;
}): boolean {
  // Both spellings of each name, native first, for the same reason
  // getWindowsNamedRoots reads both: Windows' own process.env is
  // case-INsensitive while the plain object lookup on the Linux test runner is
  // not. Empty and whitespace-only values count as ABSENT — the same
  // present-but-empty rule the roots reader applies, so an unset-but-declared
  // variable cannot switch the row on.
  for (const name of ["NVM_HOME", "NVM_SYMLINK", "nvm_home", "nvm_symlink"]) {
    const value = input.env[name]?.trim();
    if (value !== undefined && value !== "") return true;
  }
  return false;
}

// The Windows command interpreter, chosen from the parent environment.
//
// WHY THIS EXISTS AT ALL. `buildSpawnPlan`'s cmd.exe arm falls back to the BARE
// name "cmd.exe" — upstream cross-spawn's `process.env.comspec || 'cmd.exe'`,
// with the fallback kept and the environment read left to the caller. A bare
// application name is resolved by `CreateProcess` through a search order that
// includes the CURRENT WORKING DIRECTORY, and Caido's plugin host chooses that
// directory, not Drift. That arm is the one that spawns the provider CLI with
// `buildSpawnEnv(...)` in its environment and `codex mcp add ... --env
// CAIDO_TOKEN=<literal>` on its argv, so a `cmd.exe` planted in the working
// directory would be handed a live Caido session token. This function is what
// lets every call site pass the ABSOLUTE interpreter instead of relying on that
// search order.
//
// BOTH SPELLINGS, and this is not defensive noise. `process.env` is
// case-INsensitive on Windows only; cmd.exe itself exports the variable as
// `ComSpec`; and Caido's backend runtime is LLRT rather than Node, so a
// `.COMSPEC` property access against whatever object that runtime hands back is
// not guaranteed to reach a `ComSpec` key. Reading the names explicitly is the
// same rule getWindowsNamedRoots and isNvmWindowsInstalled already apply, for
// the same reason, and it keeps the answer assertable from literal inputs on the
// Linux runner.
//
// `env` is an INPUT, never an environment read of its own — the read belongs at
// index.ts's I/O boundary. The returned path is DATA for a spawn and must never
// be rendered into a log or diagnostic (T-04-04).
//
// UPDATED 2026-08-27 (G-01), and this is the most severe of the three consumers
// the update touches. Phase 7's CR-01 mitigation — the whole reason this
// function exists — reads an environment that is EMPTY on every real install
// (measured, `parentEnvKeyCount: 0`). So the loop below found nothing, returned
// `undefined`, and `buildSpawnPlan` fell back to the bare "cmd.exe": the exact
// search-order hole this function was written to close, silently reopened by the
// runtime rather than by an edit. `systemRootFallback` is the rung that closes
// it for real, and it is a REQUIRED member so the compiler forces every call
// site to state an answer (T-08-36, which is CR-01's own failure shape).
//
// This is the branch that carries a live CAIDO_TOKEN into a spawn. Of the three
// consumers sharing this fix, it is the one whose bare name would be handed the
// credential.
export function selectComspec(input: {
  env: Record<string, string | undefined>;
  platform: Platform | undefined;
  systemRootFallback: string;
}): string | undefined {
  // Only win32. `undefined` (pre-probe, or a platform normalizePlatform refused)
  // and the POSIX platforms never reach buildSpawnPlan's interpreter arm, so an
  // interpreter chosen for them could only ever be wrong — and a POSIX host that
  // happens to export COMSPEC (Wine, an msys shell) must not be able to push a
  // value into a plan that is a byte-identical passthrough there (CMP-01).
  if (input.platform !== "win32") return undefined;

  for (const name of ["COMSPEC", "ComSpec", "comspec"]) {
    const value = input.env[name]?.trim();
    // Empty and whitespace-only count as ABSENT, the same present-but-empty rule
    // the roots reader applies.
    if (value === undefined || value === "") continue;
    // FAIL CLOSED on the first spelling that carries a value: a RELATIVE
    // %COMSPEC% re-opens the exact search-order hole this function exists to
    // close, so it is refused here rather than passed on to the spawn. Falling
    // through to the next spelling instead would let a relative value be
    // "corrected" by another casing of the same variable, which is a rule nobody
    // could predict from the outside.
    return isAbsolutePath({ value, platform: input.platform })
      ? value
      : undefined;
  }

  // No spelling carried a value — the case a real install always takes. Before
  // giving up, try the DERIVED root.
  //
  // `env` is passed DELIBERATELY EMPTIED here. This function's variable is
  // COMSPEC, not a system root: the environment has already been consulted
  // above, under all three spellings, and consulting it a second time under a
  // different name would mean a machine that exports `SystemRoot` but no
  // `COMSPEC` silently gets an interpreter chosen by a variable no caller of
  // this function ever mentioned. One environment read per function, and this
  // one already had its turn.
  const derived = resolveWindowsSystemBinary({
    env: {},
    fallbackRoot: input.systemRootFallback,
    binary: "cmd.exe",
  });

  // Only a DRIVE-ABSOLUTE result is returned, by the same rule the loop above
  // applies to a value it read: an interpreter that is not absolute is resolved
  // through the search order this function exists to bypass, so returning one
  // would close nothing. When the fallback is empty the call above hands back
  // the bare "cmd.exe", which fails this check and falls to the line below —
  // which is correct, and is why that line is unchanged.
  if (isAbsolutePath({ value: derived, platform: input.platform })) {
    return derived;
  }

  // `undefined` rather than a literal, because buildSpawnPlan owns the
  // last-resort bare name and there is exactly one place that decision should be
  // written. Unchanged by G-01: the rung above sits BEFORE this line, not in
  // place of it.
  return undefined;
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
  identityFallback: PosixIdentityFallback;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.parentEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  // Derived identity is a FLOOR, never an override: a real parent value wins over
  // it, and drift's own variables win over both. So on a host whose environment
  // is readable this call is byte-identical to what it returned before.
  return { ...derivePosixIdentity(input.identityFallback), ...merged, ...input.driftVars };
}

// The POSIX identity a spawned child needs when `parentEnv` is EMPTY (G-01).
//
// `homeDir` is DERIVED — `extractHomeDir(pluginPath)` and the provider command
// paths — never read from the environment, because the environment being empty
// is the whole condition this exists for. Same shape as
// `getWindowsSystemRootFallback`: a required member on the input so every call
// site must answer the question rather than inherit a silent default, which is
// the discipline plan 08-08 established for `systemRootFallback`.
export type PosixIdentityFallback = {
  platform: Platform | undefined;
  homeDir: string | undefined;
};

// MEASURED, 2026-08-28, macOS 25.6.0, Caido 0.58.2, Claude Code 2.1.250.
// `env -i claude -p` reports "Not logged in - Please run /login"; `env -i
// USER=<name> claude -p` succeeds. HOME and PATH are neither sufficient nor
// required for it — USER alone flips the result, because the credential lives in
// the macOS Keychain and the lookup is keyed on the user name. With `parentEnv`
// empty on every real Caido install, the provider CLI therefore cannot
// authenticate AT ALL: not a degraded experience, a total functional break, and
// the reason no cancel/timeout reading could be taken on real hardware.
//
// PATH is deliberately NOT synthesised here. Every executable Drift hands to a
// spawn is already resolved to an absolute path, so a synthesised PATH would buy
// no capability while re-opening exactly the bare-name search order that
// T-08-03/T-08-33/T-08-34 closed. Absence of PATH is safe; a guessed one is not.
//
// Returns {} for anything unrecognised rather than guessing a name, matching
// extractHomeDir's allow-list discipline.
export function derivePosixIdentity(input: PosixIdentityFallback): Record<string, string> {
  // win32 needs nothing from here: libuv back-fills USERNAME and USERPROFILE
  // among its eleven `required_vars`, which is why the Windows gap this module
  // documents is APPDATA/LOCALAPPDATA and not identity.
  if (input.platform === "win32") return {};

  const homeDir = input.homeDir?.trim();
  if (homeDir === undefined || homeDir === "") return {};
  if (!homeDir.startsWith("/")) return {};

  const segments = homeDir.split("/").filter((segment) => segment !== "");
  // Exactly the two POSIX shapes extractHomeDir recognises: /Users/<name> and
  // /home/<name>. A deeper or shallower path is not a home directory and its
  // last segment is not a user name.
  if (segments.length !== 2) return {};
  const root = segments[0];
  const name = segments[1];
  if (root !== "Users" && root !== "home") return {};
  if (name === undefined || name === "") return {};

  // LOGNAME alongside USER because POSIX tools split between the two and the
  // cost of the second key is nil.
  return { HOME: `/${root}/${name}`, USER: name, LOGNAME: name };
}
