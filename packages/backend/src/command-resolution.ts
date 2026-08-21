import { readdir, stat } from "fs/promises";
import path from "path";

import {
  getExecutableNames,
  joinPath,
  type Platform,
  type WindowsNamedRoots,
} from "./platform";

// Catalogue row P-06. The nvm-windows installer's own symlink default, verified
// from coreybutler/nvm-windows `nvm.iss`, which seeds the symlink page with this
// exact string and then appends %NVM_SYMLINK% to PATH. This is the only
// drive-qualified literal in the module; every other Windows location is built
// from a named environment root so it cannot be wrong about where the user's
// profile lives. See the row that emits it for why it is kept despite being on
// PATH already.
const NVM_WINDOWS_SYMLINK_DIR = "C:\\nvm4w\\nodejs";

// The ONLY profile-root directory name extractHomeDir recognises on Windows.
// Compared lowercased on both sides because Windows filesystems are
// case-insensitive; see the non-claims recorded at the arm that reads it.
const WINDOWS_PROFILE_DIR_NAME = "Users";

// How many version directories per version-manager root the win32 arm EMITS.
//
// 3 is a COST bound chosen by the planner and is not a measurement — nobody
// timed a Windows resolution to arrive at it. The reasoning it rests on: the
// walk is a FALLBACK for a broken PATH (the nvm-windows installer puts its
// symlink directory on PATH, so the PATH search normally answers first), each
// additional version directory costs up to four `stat` calls once the extension
// ladder is applied to it, D-09 already grows the location count, and Windows is
// the platform where `stat` is slowest. The walk is kept rather than dropped
// because a broken PATH is the case it exists for.
//
// The bound is applied to the EMISSION, in the pure builder, rather than to the
// listing in the impure caller — that is Q3's own wording ("bound the win32
// emission"), it is where the per-directory cost actually lives, and it is the
// only place a five-entries-become-three assertion can be written from literal
// inputs on a Linux runner.
//
// The existing reverse-LEXICAL sort is NOT semver-correct: a v9 entry sorts
// after a v10 entry, so "newest" here means "lexically last". That is
// pre-existing POSIX behaviour which CMP-01 forbids changing there, and it is
// mirrored on win32 for symmetry rather than fixed — fixing it is a behaviour
// change on macOS and Linux that RES-01 does not ask for.
//
// POSIX emission stays UNBOUNDED. Applying this bound there would be exactly the
// CMP-01 regression this phase must not ship.
const WIN32_VERSION_WALK_LIMIT = 3;

// Version directory NAMES discovered by the impure caller, per version manager.
// Bare directory names as read from disk, never full paths: the joining is the
// pure builder's job, which is what keeps the win32 version rows assertable on a
// Linux runner where none of these directories can exist.
export type WindowsVersionDirs = {
  nvmWindows: string[];
  fnmModern: string[];
  fnmLegacy: string[];
  voltaNodeImages: string[];
};

const EMPTY_WINDOWS_VERSION_DIRS: WindowsVersionDirs = {
  nvmWindows: [],
  fnmModern: [],
  fnmLegacy: [],
  voltaNodeImages: [],
};

// Actionable install / resolution hint per provider. These surface inside the
// chat error banner and in Settings → CLI Providers so a user who hits
// "CLI not found" does not have to guess which package to install.
const PROVIDER_INSTALL_HINTS: Record<string, string> = {
  "claude-cli":
    "Install Claude Code with `curl -fsSL https://claude.ai/install.sh | bash`, or set the absolute binary path in Settings → CLI Providers.",
  "gemini-cli":
    "Install Gemini CLI with `npm install -g @google/gemini-cli`, or set the absolute binary path in Settings → CLI Providers.",
  "codex-cli":
    "Install Codex CLI with `npm install -g @openai/codex`, or set the absolute binary path in Settings → CLI Providers.",
  "copilot-cli":
    "Install GitHub Copilot CLI with `gh extension install github/gh-copilot`, or set the absolute binary path in Settings → CLI Providers.",
};

export function getProviderInstallHint(providerId: string): string {
  return (
    PROVIDER_INSTALL_HINTS[providerId] ??
    "Install the CLI for this provider, or set the absolute binary path in Settings → CLI Providers."
  );
}

export function formatProviderUnavailableMessage(
  providerId: string,
  cause: string,
): string {
  return `${cause}. ${getProviderInstallHint(providerId)}`;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}

// ── D-07: the pure candidate-dedup key, and the ladder it declines ─────────
//
// Windows filesystems are case-INSENSITIVE (and case-preserving), so
// "C:\\Program Files\\nodejs\\node.exe" and "c:/program files/nodejs/node.exe"
// name one file. Folding case and separator into a comparison KEY collapses the
// two, while the ORIGINAL spelling is what stays in the array and what is later
// stat-ed and spawned. The key is never an emitted value.
//
// WHAT WAS REJECTED, and why — this is the half a later reader cannot
// reconstruct from the code alone. 04-D-04 expected Phase 6 to become the first
// caller of runtime-probe.ts's canonicalisation ladder. That was DECLINED here:
//   * it would put asynchronous filesystem I/O on a pre-probe hot path, reached
//     from a provider status check at plugin load;
//   * it would lean on a rung the constrained runtime is not known to have
//     (no realpath symbol is declared in the LLRT fs surface at all);
//   * it would be unexercisable on the Linux runner this project actually has;
//   * and it would buy a saving the resolution cache mostly absorbs.
// The case 04-D-04 anticipated is real — an 8.3 SHORT-FORM profile directory
// compared against its long form, which no pure string rule can collapse. It
// does not arise here: this phase never compares a temp-directory-derived path
// against an environment-derived one. The ONLY comparison it makes is between
// candidate strings inside this accumulator, where a missed deduplication costs
// one extra existence check and never a wrong answer. The ladder therefore
// stays exported and uncalled, with its own preservation note beside it.
//
// WHY THE FOLD IS win32-ONLY, never applied on `undefined`. The failure modes
// are not symmetric. A missed dedup costs one stat; an over-eager fold DROPS a
// real candidate. macOS is case-insensitive by default and Linux is not, so
// folding on an unknown platform could collapse two genuinely distinct POSIX
// paths — and a POSIX path differing only in case names a different file. This
// is the deliberate opposite of D-08's union-when-unknown rule, where the cheap
// failure is an extra candidate rather than a missing one.
export function foldCandidateKey(
  value: string,
  platform: Platform | undefined,
): string {
  if (platform !== "win32") return value;
  return value.toLowerCase().split("\\").join("/");
}

export function pushUniqueCandidate(
  candidates: string[],
  candidate: string | undefined,
  platform: Platform | undefined,
): void {
  const normalized = candidate?.trim();
  if (normalized === undefined || normalized === "") return;
  const key = foldCandidateKey(normalized, platform);
  for (const existing of candidates) {
    if (foldCandidateKey(existing, platform) === key) return;
  }
  candidates.push(normalized);
}

// Collapse "." and ".." against a POSIX "/" separator, with no dependence on
// the host platform. This exists because `path.normalize` is platform-FLAVOURED:
// on a win32 host it rewrites "/Users/six2dez/.local/bin/claude" to
// "\\Users\\six2dez\\.local\\bin\\claude", so neither prefix arm in
// extractHomeDir below can ever match and the function silently returns
// undefined for every input it was written to recognise.
//
// MEASURED, not precautionary — this is what took the first real `windows-latest`
// leg red, on run 32376894337's sibling CI run 32376894371 (2026-08-20):
//   AssertionError: expected undefined to be '/Users/six2dez'
//
// `path.posix.normalize` would be the one-line fix on Node and is deliberately
// NOT used: Caido's LLRT `path` surface exposes no `posix` namespace at all
// (@caido/quickjs-types/src/llrt/path.d.ts declares a flat surface whose only
// separator affordance is `sep`). Reaching for an API the shipping runtime does
// not have is the same class of error as trusting a published type that omits a
// capability — see 05-RESEARCH.md § Pitfall 7. Phase 4's platform.ts sets the
// precedent this follows: a pure path decision imports nothing.
//
// This normaliser itself is POSIX-only and deliberately stays that way. The
// Windows profile shape "C:\\Users\\<name>" (RES-03) is recognised by a SEPARATE
// arm inside extractHomeDir below, which runs BEFORE this normaliser and uses
// explicit character tests rather than a second, drive-aware normaliser.
function normalizePosixPath(input: string): string {
  const isAbsolute = input.startsWith("/");
  const out: string[] = [];
  for (const segment of input.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbsolute) out.push("..");
      continue;
    }
    out.push(segment);
  }
  return `${isAbsolute ? "/" : ""}${out.join("/")}`;
}

export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  const normalized = candidatePath?.trim();
  if (normalized === undefined || normalized === "") return undefined;

  // ── The Windows profile arm (RES-03, D-06) ──────────────────────────────
  //
  // Runs on the TRIMMED input, BEFORE the POSIX normalisation below, and returns
  // only on a match — so the POSIX route through this function is byte-for-byte
  // the one it has always been, which is what CMP-01 pins. Ordering it first is
  // deliberate, not incidental: a backslash-spelled path happens to survive
  // normalizePosixPath unchanged today (that normaliser splits on "/" only), but
  // relying on that accident would couple the two arms silently.
  //
  // The function stays PLATFORM-BLIND — one string in, no injected platform —
  // matching isAbsolutePath's `platform: undefined` arm. getKnownHomeDirs is
  // reachable from a provider status check at plugin load, BEFORE the runtime
  // probe sets the host facts, so every pre-probe call site would pass undefined
  // anyway and this shape-sniffing arm would be needed regardless.
  //
  // Recognition is by explicit character tests and never a regular expression
  // containing a backslash, for the readability reason isAbsolutePath and
  // getTempRoot already state.
  //
  // NON-CLAIMS, recorded beside the code that makes them rather than only in a
  // planning document:
  //   * A UNC path ("\\\\server\\share\\...") is deliberately NOT recognised.
  //     A network share has no C:\\Users\\<name> analogue, so inferring a home
  //     directory from one would be unsourced guessing — and would seed every
  //     candidate row from a remote root. This follows the module's existing
  //     allow-list discipline: return undefined for anything unrecognised
  //     rather than guess.
  //   * Only a profile directory literally named "Users" is recognised. A
  //     redirected or non-default profile root is a KNOWN, accepted
  //     non-recognition, not a gap to be filled by guessing another name.
  const driveLetter = normalized[0] ?? "";
  const isDriveLetter =
    (driveLetter >= "A" && driveLetter <= "Z") ||
    (driveLetter >= "a" && driveLetter <= "z");
  const driveSeparator = normalized[2] ?? "";
  if (
    isDriveLetter &&
    normalized[1] === ":" &&
    (driveSeparator === "\\" || driveSeparator === "/")
  ) {
    // Split the remainder on BOTH separator spellings, dropping empty segments.
    // Win32 accepts either interchangeably, so both must be understood here.
    const remainder = normalized.slice(3);
    const segments: string[] = [];
    let segment = "";
    for (let index = 0; index < remainder.length; index += 1) {
      const character = remainder[index] ?? "";
      if (character === "\\" || character === "/") {
        if (segment !== "") segments.push(segment);
        segment = "";
        continue;
      }
      segment += character;
    }
    if (segment !== "") segments.push(segment);

    // A "." or ".." segment REJECTS the whole input rather than collapsing it.
    // The POSIX arm reaches the same outcome by normalising first and then
    // failing the prefix test; matching that here would mean shipping a second,
    // drive-aware normaliser this phase has no other use for.
    const hasTraversal = segments.some((part) => part === "." || part === "..");
    const profile = segments[0];
    const user = segments[1];
    if (
      !hasTraversal &&
      profile !== undefined &&
      user !== undefined &&
      profile.toLowerCase() === WINDOWS_PROFILE_DIR_NAME.toLowerCase()
    ) {
      // The separator that ARRIVED is the separator emitted, and both segments
      // are emitted in their ORIGINAL casing: Windows is case-PRESERVING as
      // well as case-insensitive, so echoing the caller's own spelling keeps
      // the result comparable to the string it was derived from.
      return `${driveLetter}:${driveSeparator}${profile}${driveSeparator}${user}`;
    }
  }

  const resolved = normalizePosixPath(normalized);

  if (resolved.startsWith("/Users/")) {
    const parts = resolved.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
  }

  if (resolved.startsWith("/home/")) {
    const parts = resolved.split("/").filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
  }

  return undefined;
}

// The impure half of the D-05 sweep. The walk itself is unchanged — the
// sorted-then-reversed listing, the dot-prefix skip, the per-entry catch that
// ignores a broken entry, and the directory-existence guard all behave exactly
// as before. Only the SPELLING moved: every path is now built for the TARGET
// platform through joinPath instead of through the host-flavoured module join,
// so a Windows version directory is not spelled with the runner's separator.
// On POSIX the emitted strings are byte-identical, which is what makes this a
// sweep rather than a behaviour change — and what the two CMP-01 blocks pin.
async function listVersionDirectories(input: {
  root: string;
  platform: Platform | undefined;
}): Promise<string[]> {
  const entries = (await readdir(input.root)).sort().reverse();
  const versions: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    try {
      const entryStat = await stat(
        joinPath({ platform: input.platform, segments: [input.root, entry] }),
      );
      if (entryStat.isDirectory()) versions.push(entry);
    } catch {
      // Ignore broken or transient entries while probing candidate paths.
    }
  }
  return versions;
}

export async function collectVersionManagerCommandCandidates(input: {
  homeDir: string;
  command: string;
  platform: Platform | undefined;
}): Promise<string[]> {
  const candidates: string[] = [];
  const join = (segments: string[]): string =>
    joinPath({ platform: input.platform, segments });

  const nvmDir = join([input.homeDir, ".nvm", "versions", "node"]);
  if (await pathExists(nvmDir)) {
    const versions = await listVersionDirectories({
      root: nvmDir,
      platform: input.platform,
    });
    for (const version of versions) {
      pushUniqueCandidate(
        candidates,
        join([nvmDir, version, "bin", input.command]),
        input.platform,
      );
    }
  }

  const fnmDir = join([input.homeDir, ".fnm", "node-versions"]);
  if (await pathExists(fnmDir)) {
    const versions = await listVersionDirectories({
      root: fnmDir,
      platform: input.platform,
    });
    for (const version of versions) {
      pushUniqueCandidate(
        candidates,
        join([fnmDir, version, "installation", "bin", input.command]),
        input.platform,
      );
    }
  }

  return candidates;
}

// The sourced Windows install-location table, extracted so BOTH builders share
// exactly one copy of it. A provider CLI and `node` live in the same places on
// Windows; only the node-ONLY rows (the MSI directory, the Volta node image)
// differ, and those stay in the node builder.
//
// Pure and synchronous: the version directory NAMES arrive already discovered.
//
// `emitRootlessLiteral` is a parameter rather than a platform test because the
// two callers answer it differently for the same reason — see the row itself.
function buildWindowsInstallLocationCandidates(input: {
  command: string;
  roots: WindowsNamedRoots;
  windowsVersionDirs: WindowsVersionDirs | undefined;
  emitRootlessLiteral: boolean;
}): string[] {
  const candidates: string[] = [];
  // Both the separator and the extension ladder are pinned to the literal
  // "win32" even when the host platform is unknown: they are properties of the
  // Windows ROW, not of the host. A row spelled with the runner's separator
  // would make every assertion below a test of the runner.
  const windowsNames = getExecutableNames({
    command: input.command,
    platform: "win32",
  });
  const win32 = (segments: string[]): string =>
    joinPath({ platform: "win32", segments });

  // Emit one candidate per ladder spelling for ONE location, then move on —
  // that is D-11's location-major ordering, and it is what the whole-array
  // assertion in the test file pins. An absent root emits nothing at all
  // (T-06-T02) — never a candidate with an empty prefix, which would resolve
  // against the process working directory, a directory the user never chose.
  const emitLocation = (
    root: string | undefined,
    segments: string[],
  ): void => {
    if (root === undefined) return;
    for (const name of windowsNames) {
      pushUniqueCandidate(
        candidates,
        win32([root, ...segments, name]),
        "win32",
      );
    }
  };

  // ── The sourced Windows install-location table (D-09 / D-11 / D-12) ──
  //
  // D-12 is cite-or-drop: every row below names the installer script, package
  // source or first-party document it came from. A row that could not be
  // sourced is NOT here — it is recorded as a non-claim at the bottom of this
  // comment instead, so a later reader finds the reason beside the table
  // rather than having to re-derive it.
  //
  // THREE ROWS CORRECT THE ROADMAP, and the corrections win. D-09's own text
  // calls its inline sketch "roughly (the exact set is D-12's deliverable)",
  // so this is D-12 working as designed rather than a silent divergence:
  //   * nvm-windows lives under LOCAL application data, not roaming. Verified
  //     from coreybutler/nvm-windows `nvm.iss` (DefaultDirName={localappdata}\nvm,
  //     then NVM_HOME written to {app}).
  //   * nvm-windows' symlink default is C:\nvm4w\nodejs, not %ProgramFiles%\nodejs.
  //     Verified from the same `nvm.iss`; the installer's README warns that
  //     pointing it at a physical directory FAILS.
  //   * fnm's modern base is under ROAMING application data, not local.
  //     Verified from Schniz/fnm `src/directories.rs` plus etcetera 0.8.0's own
  //     doctest mapping APPDATA to data_dir(). (The fnm rows themselves land in
  //     the version walk below.)
  //
  // DROPPED under D-12, recorded here as explicit non-claims:
  //   * roaming-appdata nvm — no source found for any nvm-windows release
  //     defaulting there; the installer's own script defaults under local
  //     application data (see the correction above).
  //   * Program Files\Volta — sourced, but it holds the volta.exe binary
  //     itself, not a Node or provider CLI, so it resolves nothing this
  //     module looks for.
  //   * asdf on native Windows — no native build exists; asdf's own FAQ scopes
  //     Windows support to WSL2. The POSIX ~/.asdf/shims row above is
  //     deliberately untouched.
  //   * user-profile .volta on win32 — the POSIX analogy, unsourced for
  //     Windows. Volta's Windows home is under local application data, which
  //     is the row actually emitted below.

  // P-01. npm's own documentation states the default global prefix on Windows
  // is the roaming application-data npm directory, and that on Windows
  // executables are placed DIRECTLY into the prefix where Unix links them into
  // {prefix}/bin — so a `bin` segment here would be wrong.
  // Source: docs.npmjs.com/cli/v11/configuring-npm/folders.
  emitLocation(input.roots.appData, ["npm"]);

  // P-19. The Claude Code native installer's Windows location. Its uninstall
  // instructions name this path verbatim ($env:USERPROFILE\.local\bin\claude.exe),
  // which also confirms the extension is .exe — the ladder hits its first rung
  // here. Source: code.claude.com/docs/en/setup, § Uninstall → Native → Windows.
  emitLocation(input.roots.userProfile, [".local", "bin"]);

  // P-11 / P-12. Volta's shim directory. Home verified from volta-cli/volta
  // `crates/volta-core/src/layout/windows.rs` (data_local_dir() + "Volta");
  // shim directory from `crates/volta-layout/src/v4.rs` ("bin": shim_dir).
  // Volta's Windows shims carry the .cmd spelling — the same v4.rs appends
  // ".cmd" to the tool name under cfg(windows). Phase 3 measured a DIRECT
  // spawn of that spelling throwing synchronously
  // (.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
  // § P1-CMD), so this phase RESOLVES the shim and claims nothing more:
  // making it launchable is PRV-02 in Phase 7.
  emitLocation(input.roots.localAppData, ["Volta", "bin"]);

  // P-16. pnpm's Windows data directory, verified from @pnpm/config
  // `lib/dirs.js` getDataDir — whose per-platform table also confirms the two
  // POSIX pnpm rows already above (Library/pnpm on darwin, .local/share/pnpm
  // elsewhere) are correct.
  emitLocation(input.roots.localAppData, ["pnpm"]);

  // P-16, the same function's fallback arm when LOCALAPPDATA is unset.
  emitLocation(input.roots.userProfile, [".pnpm"]);

  // P-15. Bun. Same shape as the POSIX ~/.bun/bin row above.
  // Source: bun.com/docs/installation (its Windows PATH fix references
  // "$env:USERPROFILE\.bun\bin").
  emitLocation(input.roots.userProfile, [".bun", "bin"]);

  // P-17. scoop, per-user. Verified from ScoopInstaller/Install `install.ps1`
  // ("$env:USERPROFILE\scoop" then "$SCOOP_DIR\shims").
  emitLocation(input.roots.userProfile, ["scoop", "shims"]);

  // P-18. scoop, machine-wide, from the same script
  // ("$env:ProgramData\scoop"). ProgramData is not one of D-09's three user
  // variables, so it gets its own row for exactly the reason the program-files
  // row in the node builder does.
  emitLocation(input.roots.programData, ["scoop", "shims"]);

  // ── Version-manager rows ──
  //
  // The directory NAMES arrive already discovered from the thin impure caller;
  // only the spelling happens here. Each list is bounded to the newest
  // WIN32_VERSION_WALK_LIMIT entries — see that constant for why the number is
  // a cost bound rather than a measurement, and why POSIX stays unbounded.
  const versionDirs = input.windowsVersionDirs ?? EMPTY_WINDOWS_VERSION_DIRS;
  const newest = (entries: string[]): string[] =>
    entries.slice(0, WIN32_VERSION_WALK_LIMIT);

  // P-04 / P-05. nvm-windows keeps node.exe DIRECTLY in the version directory:
  // there is no `bin` segment, unlike the POSIX ~/.nvm row above. The entry
  // name already carries its `v` prefix because that is how the installer
  // names the directory — verified from coreybutler/nvm-windows `nvm.go`,
  // filepath.Join(env.root, "v"+version).
  for (const version of newest(versionDirs.nvmWindows)) {
    emitLocation(input.roots.localAppData, ["nvm", version]);
  }

  // P-08 / P-10. fnm's modern base is under ROAMING application data — this
  // CORRECTS the roadmap, and the source is fnm's own directory strategy
  // (Schniz/fnm `src/directories.rs` calling etcetera's data_dir(), which on
  // Windows is APPDATA).
  //
  // NO `bin` SEGMENT ON WINDOWS. fnm appends `bin` only on non-Windows —
  // `src/commands/exec.rs` guards it with cfg(not(windows)) — while the
  // version path itself is installations_dir/<v>/installation
  // (`src/config.rs`, `src/version.rs`). The POSIX fnm row above keeps its
  // `bin` segment and must not be "tidied up" to match this one; the two
  // layouts genuinely differ, and the test file pins both halves.
  for (const version of newest(versionDirs.fnmModern)) {
    emitLocation(input.roots.appData, [
      "fnm",
      "node-versions",
      version,
      "installation",
    ]);
  }

  // P-09. fnm's legacy base, which fnm itself still probes — a user upgraded
  // from an older fnm has this layout. Same missing `bin` segment.
  for (const version of newest(versionDirs.fnmLegacy)) {
    emitLocation(input.roots.userProfile, [
      ".fnm",
      "node-versions",
      version,
      "installation",
    ]);
  }

  // Volta node images (P-13) are node-only and belong to the node builder, not
  // here: a provider CLI never lives under tools\image\node.

  // P-06 — the ONE deliberate drive-qualified literal in this module, and it
  // is the nvm-windows installer's own default rather than a guess: `nvm.iss`
  // seeds the symlink page with C:\nvm4w\nodejs and appends %NVM_SYMLINK% to
  // PATH. Because the installer puts it on PATH, the PATH search normally
  // answers first — this row is the broken-PATH fallback.
  //
  // It is gated on the LITERAL "win32" rather than on the union arm above,
  // and that is not an oversight. Every other row here vanishes when its root
  // is absent, which is exactly why the union arm is CMP-01-safe on POSIX: no
  // Windows root variable is set there, so no win32 row can fire. This row
  // depends on no variable, so in the pre-probe `undefined` arm it would fire
  // on a Linux host and break the byte-identity the three CMP-01 tests pin. On
  // a real Windows host the RUN-05 probe has resolved by the time a launch
  // resolves a command, and a broken-PATH fallback is the last thing a
  // pre-probe status check needs.
  if (input.emitRootlessLiteral) {
    emitLocation(NVM_WINDOWS_SYMLINK_DIR, []);
  }
  return candidates;
}

// PURE. Zero I/O, synchronous, and the SC-5 seam (D-10): the Windows list is
// byte-for-byte assertable from literal inputs on the Linux runner, where
// C:\Users\x\AppData\Roaming\npm cannot exist.
//
// Injecting a filesystem dependency object instead was REJECTED (D-10): the
// tests would then assert against a mocked filesystem, so a fake that drifts
// from real directory-listing semantics weakens the SC-5 evidence silently
// instead of failing loudly. The real `readdir`/`stat` therefore stay in the
// thin impure caller below, which feeds this function its findings.
//
// Every path here is spelled through joinPath for the TARGET platform (D-05),
// never through the host-flavoured module join it replaces. The POSIX arm's
// output is pinned byte-identical to the pre-split list by the CMP-01 block in
// command-resolution.test.ts.
//
// The platform arms are a UNION when the platform is unknown: `undefined` (the
// pre-probe state, reachable from a provider status check at plugin load) emits
// the POSIX rows first and the win32 rows after, never interleaved. This is the
// same union-when-unknown rule isAbsolutePath and D-06/D-08 already follow, and
// it is CMP-01-safe on POSIX because no Windows root variable is set there, so
// every win32 row is skipped and the list is byte-identical to today's.
export function buildCommandCandidatePaths(input: {
  platform: Platform | undefined;
  command: string;
  pathResolution?: string;
  homeDirs: string[];
  roots: WindowsNamedRoots;
  versionCandidatesByHomeDir: Record<string, string[]>;
  windowsVersionDirs?: WindowsVersionDirs;
}): string[] {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, input.pathResolution, input.platform);

  if (input.platform !== "win32") {
    const posix = (segments: string[]): string =>
      joinPath({ platform: input.platform, segments });

    pushUniqueCandidate(
      candidates,
      posix(["/opt/homebrew/bin", input.command]),
      input.platform,
    );
    pushUniqueCandidate(
      candidates,
      posix(["/usr/local/bin", input.command]),
      input.platform,
    );
    pushUniqueCandidate(
      candidates,
      posix(["/usr/bin", input.command]),
      input.platform,
    );
    pushUniqueCandidate(
      candidates,
      posix(["/bin", input.command]),
      input.platform,
    );

    for (const homeDir of [...new Set(input.homeDirs)]) {
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".local", "bin", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".volta", "bin", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".asdf", "shims", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".npm-global", "bin", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".bun", "bin", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, "Library", "pnpm", input.command]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".local", "share", "pnpm", input.command]),
        input.platform,
      );
      for (const candidate of input.versionCandidatesByHomeDir[homeDir] ?? []) {
        pushUniqueCandidate(candidates, candidate, input.platform);
      }
    }
  }

  if (input.platform === "win32" || input.platform === undefined) {
    // The whole win32 table lives in the shared helper above. The rootless
    // nvm-windows literal is emitted only when the platform is KNOWN to be
    // win32: every other row vanishes with its absent root, which is precisely
    // why this union arm stays CMP-01-safe on POSIX, and a rootless row would
    // be the one thing able to fire on a Linux host in the pre-probe state.
    for (const candidate of buildWindowsInstallLocationCandidates({
      command: input.command,
      roots: input.roots,
      windowsVersionDirs: input.windowsVersionDirs,
      emitRootlessLiteral: input.platform === "win32",
    })) {
      pushUniqueCandidate(candidates, candidate, input.platform);
    }
  }

  return candidates;
}

// The win32 half of the version walk, and the only place it does I/O. It reuses
// listVersionDirectories rather than adding a second listing implementation, so
// the reverse-sorted order, the dot-prefix skip and the per-entry catch that
// ignores a broken entry are the SAME code the POSIX walk runs (T-06-T05).
//
// It returns bare directory NAMES. Nothing here decides how many of them get
// emitted — that is WIN32_VERSION_WALK_LIMIT's job in the pure builder, where it
// can be asserted from literal inputs.
async function listWindowsVersionDirs(input: {
  platform: Platform | undefined;
  roots: WindowsNamedRoots;
}): Promise<WindowsVersionDirs> {
  const found: WindowsVersionDirs = {
    nvmWindows: [],
    fnmModern: [],
    fnmLegacy: [],
    voltaNodeImages: [],
  };
  if (input.platform !== "win32" && input.platform !== undefined) return found;

  const listIfPresent = async (
    root: string | undefined,
    segments: string[],
  ): Promise<string[]> => {
    if (root === undefined) return [];
    const dir = joinPath({ platform: "win32", segments: [root, ...segments] });
    if (!(await pathExists(dir))) return [];
    return listVersionDirectories({ root: dir, platform: "win32" });
  };

  found.nvmWindows = await listIfPresent(input.roots.localAppData, ["nvm"]);
  found.fnmModern = await listIfPresent(input.roots.appData, [
    "fnm",
    "node-versions",
  ]);
  found.fnmLegacy = await listIfPresent(input.roots.userProfile, [
    ".fnm",
    "node-versions",
  ]);
  found.voltaNodeImages = await listIfPresent(input.roots.localAppData, [
    "Volta",
    "tools",
    "image",
    "node",
  ]);
  return found;
}

// The thin impure caller (D-10). Every filesystem call in the command-candidate
// path lives HERE; the ordered list itself is built by the pure function above.
export async function getCommandExecutableCandidates(input: {
  command: string;
  platform: Platform | undefined;
  pathResolution?: string;
  homeDirs: string[];
  roots: WindowsNamedRoots;
}): Promise<string[]> {
  const versionCandidatesByHomeDir: Record<string, string[]> = {};
  for (const homeDir of [...new Set(input.homeDirs)]) {
    versionCandidatesByHomeDir[homeDir] = await collectVersionManagerCommandCandidates({
      homeDir,
      command: input.command,
      platform: input.platform,
    });
  }

  const windowsVersionDirs = await listWindowsVersionDirs({
    platform: input.platform,
    roots: input.roots,
  });

  return buildCommandCandidatePaths({
    ...input,
    versionCandidatesByHomeDir,
    windowsVersionDirs,
  });
}

// PURE. The node counterpart of buildCommandCandidatePaths, and pure for the same
// SC-5 reason: the win32 node list has to be assertable from literal inputs on
// the Linux runner, where C:\Program Files\nodejs cannot exist.
//
// Node gets its own builder rather than a `command: "node"` call into the one
// above because its POSIX list genuinely differs — an exec path and a
// provider-adjacent sibling at the front, no /bin row, no .npm-global row, and a
// different home-directory order. That list is pre-Phase-6 behaviour and the
// CMP-01 block for this function pins it byte-for-byte.
export function buildNodeCandidatePaths(input: {
  platform: Platform | undefined;
  execPath?: string;
  pathResolution?: string;
  homeDirs: string[];
  roots: WindowsNamedRoots;
  providerAdjacentDirs: string[];
  versionCandidatesByHomeDir: Record<string, string[]>;
  windowsVersionDirs?: WindowsVersionDirs;
}): string[] {
  const candidates: string[] = [];

  pushUniqueCandidate(candidates, input.execPath, input.platform);
  pushUniqueCandidate(candidates, input.pathResolution, input.platform);

  // Q4, second half. The DIRECTORIES arrive already derived by the thin impure
  // caller, which is what lets this row be spelled for the target platform and
  // asserted on Linux. On win32 the sibling gains the full extension ladder: a
  // bare `node` beside a `claude.cmd` is not a Windows executable name.
  //
  // On POSIX — and in the pre-probe `undefined` arm — the ladder has exactly one
  // rung, so the emitted string is byte-identical to the pre-Phase-6 one.
  const siblingNames =
    input.platform === "win32"
      ? getExecutableNames({ command: "node", platform: "win32" })
      : ["node"];
  for (const providerDir of input.providerAdjacentDirs) {
    for (const name of siblingNames) {
      pushUniqueCandidate(
        candidates,
        joinPath({ platform: input.platform,
        segments: [providerDir, name] }),
        input.platform,
      );
    }
  }

  if (input.platform !== "win32") {
    const posix = (segments: string[]): string =>
      joinPath({ platform: input.platform, segments });

    pushUniqueCandidate(candidates, "/opt/homebrew/bin/node", input.platform);
    pushUniqueCandidate(candidates, "/usr/local/bin/node", input.platform);
    pushUniqueCandidate(candidates, "/usr/bin/node", input.platform);

    for (const homeDir of [...new Set(input.homeDirs)]) {
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".volta", "bin", "node"]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".asdf", "shims", "node"]),
        input.platform,
      );
      pushUniqueCandidate(
        candidates,
        posix([homeDir, ".local", "bin", "node"]),
        input.platform,
      );
      for (const candidate of input.versionCandidatesByHomeDir[homeDir] ?? []) {
        pushUniqueCandidate(candidates, candidate, input.platform);
      }
    }
  }

  if (input.platform === "win32") {
    const windowsNames = getExecutableNames({
      command: "node",
      platform: "win32",
    });
    const emitLocation = (
      root: string | undefined,
      segments: string[],
    ): void => {
      if (root === undefined) return;
      for (const name of windowsNames) {
        pushUniqueCandidate(
          candidates,
          joinPath({ platform: "win32",
          segments: [root, ...segments, name] }),
          input.platform,
        );
      }
    };

    // ── The node-ONLY Windows rows ──
    //
    // P-13, the Volta node IMAGE, and it is emitted BEFORE the Volta shim row
    // that arrives with the shared table below. Research § Pitfall 3: Volta's
    // Windows shims carry the .cmd spelling, and Phase 3 measured a direct spawn
    // of that spelling throwing synchronously
    // (.planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
    // § P1-CMD), so reaching the real node.exe first is a genuine reduction in
    // Phase 7's cmd.exe surface rather than a cosmetic reordering. This row is
    // NOT in the roadmap; it was added on the strength of Volta's own layout
    // crate (volta-cli/volta `crates/volta-layout/src/v4.rs`, the image dir
    // tree, with the node image bin dir having no `bin` segment under
    // cfg(windows)). It does not make Phase 6 responsible for SPAWNING anything:
    // PRV-02 still owns the shim case, this row merely makes it rarer.
    const versionDirs = input.windowsVersionDirs ?? EMPTY_WINDOWS_VERSION_DIRS;
    for (const version of versionDirs.voltaNodeImages.slice(
      0,
      WIN32_VERSION_WALK_LIMIT,
    )) {
      emitLocation(input.roots.localAppData, [
        "Volta",
        "tools",
        "image",
        "node",
        version,
      ]);
    }

    // P-02, the Node MSI directory. Microsoft's Node-on-Windows page names it,
    // but the STRONGER evidence is Phase 3's own P1-WHERE measurement, which
    // returned this exact directory as its second line on a real windows-latest
    // host — see
    // .planning/phases/03-ci-spike-prove-llrt-basics-on-windows/03-FINDINGS.md
    // § P1-WHERE. (Cite the findings file, never the CI artifact behind it.)
    emitLocation(input.roots.programFiles, ["nodejs"]);

    // P-03. ASSUMPTION under D-12, tagged as such because no first-party
    // statement ties a current Node installer to the x86 tree. It is kept anyway
    // for WOW64 bitness: on 64-bit Windows a 32-bit process sees the
    // program-files variable pointing at the x86 tree while a 64-bit process
    // does not, so reading BOTH variables is the arm that survives whichever
    // bitness Caido's backend host turns out to be. The cost is one stat, which
    // PERF-03's resolution cache absorbs.
    emitLocation(input.roots.programFilesX86, ["nodejs"]);

    // Absent-root behaviour, stated because it is a REAL case rather than a
    // hypothetical: ProgramFiles, ProgramFiles(x86) and ProgramData are ordinary
    // inherited variables, they are NOT among libuv's eleven back-filled names,
    // and Phase 3's P3-VARS measured only USERPROFILE, APPDATA and LOCALAPPDATA.
    // An absent variable skips its row entirely — never a candidate with an
    // empty prefix, which would be a relative path resolving against the process
    // working directory.

    // P-06, the rootless nvm-windows symlink default, ahead of the shared table
    // for node specifically because the installer puts it on PATH and it points
    // at a real node.exe. The shared table emits it again at its end, where
    // pushUniqueCandidate drops the duplicate.
    emitLocation(NVM_WINDOWS_SYMLINK_DIR, []);

    for (const candidate of buildWindowsInstallLocationCandidates({
      command: "node",
      roots: input.roots,
      windowsVersionDirs: input.windowsVersionDirs,
      emitRootlessLiteral: true,
    })) {
      pushUniqueCandidate(candidates, candidate, input.platform);
    }
  }

  return candidates;
}

// The thin impure caller for node (D-10), mirroring getCommandExecutableCandidates.
export async function getNodeExecutableCandidates(input: {
  platform: Platform | undefined;
  execPath?: string;
  pathResolution?: string;
  homeDirs: string[];
  roots: WindowsNamedRoots;
  absoluteProviderCommands: string[];
}): Promise<string[]> {
  const versionCandidatesByHomeDir: Record<string, string[]> = {};
  for (const homeDir of [...new Set(input.homeDirs)]) {
    versionCandidatesByHomeDir[homeDir] = await collectVersionManagerCommandCandidates({
      homeDir,
      command: "node",
      platform: input.platform,
    });
  }

  // Q4, first half. `path.dirname` is the ONE deliberate module-path exception
  // in this file and it survives the D-05 sweep intact:
  //
  //   * D-05's sweep names every JOIN and does not name `dirname`.
  //   * This call is host-flavoured BY DESIGN. On a real Windows host the module
  //     is win32-flavoured, the provider command is "C:\...\claude.cmd", and only
  //     a win32-flavoured dirname finds its directory. The comment in
  //     command-resolution.test.ts records the real windows-latest CI red that
  //     taught this.
  //   * It was moved OUT of the pure builder specifically so the builder's win32
  //     sibling row stays assertable from LITERAL directories on the Linux
  //     runner — leaving the derivation inside would have made that row a test of
  //     the runner, which is the exact hazard D-05 exists to kill.
  //
  // Do not "finish the sweep" here. This one is deliberate.
  const providerAdjacentDirs = input.absoluteProviderCommands.map((commandPath) =>
    path.dirname(commandPath),
  );

  const windowsVersionDirs = await listWindowsVersionDirs({
    platform: input.platform,
    roots: input.roots,
  });

  return buildNodeCandidatePaths({
    ...input,
    providerAdjacentDirs,
    versionCandidatesByHomeDir,
    windowsVersionDirs,
  });
}
