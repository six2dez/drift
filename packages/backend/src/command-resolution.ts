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

export function pushUniqueCandidate(candidates: string[], candidate: string | undefined): void {
  const normalized = candidate?.trim();
  if (normalized === undefined || normalized === "") return;
  if (!candidates.includes(normalized)) candidates.push(normalized);
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
// This does NOT teach the function about "C:\\Users\\<name>". That is RES-03
// and it belongs to Phase 6.
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
      pushUniqueCandidate(candidates, join([nvmDir, version, "bin", input.command]));
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
      );
    }
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
}): string[] {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, input.pathResolution);

  if (input.platform !== "win32") {
    const posix = (segments: string[]): string =>
      joinPath({ platform: input.platform, segments });

    pushUniqueCandidate(candidates, posix(["/opt/homebrew/bin", input.command]));
    pushUniqueCandidate(candidates, posix(["/usr/local/bin", input.command]));
    pushUniqueCandidate(candidates, posix(["/usr/bin", input.command]));
    pushUniqueCandidate(candidates, posix(["/bin", input.command]));

    for (const homeDir of [...new Set(input.homeDirs)]) {
      pushUniqueCandidate(candidates, posix([homeDir, ".local", "bin", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, ".volta", "bin", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, ".asdf", "shims", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, ".npm-global", "bin", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, ".bun", "bin", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, "Library", "pnpm", input.command]));
      pushUniqueCandidate(candidates, posix([homeDir, ".local", "share", "pnpm", input.command]));
      for (const candidate of input.versionCandidatesByHomeDir[homeDir] ?? []) {
        pushUniqueCandidate(candidates, candidate);
      }
    }
  }

  if (input.platform === "win32" || input.platform === undefined) {
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
        pushUniqueCandidate(candidates, win32([root, ...segments, name]));
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
    if (input.platform === "win32") {
      emitLocation(NVM_WINDOWS_SYMLINK_DIR, []);
    }
  }

  return candidates;
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

  return buildCommandCandidatePaths({ ...input, versionCandidatesByHomeDir });
}

export async function getNodeExecutableCandidates(input: {
  // No `platform` field yet: this signature gains one in plan 06-02's T-06-06.
  // Until it does, every joinPath in the body below takes a temporary POSIX-arm
  // pass-through — see the comment beside them.
  execPath?: string;
  pathResolution?: string;
  homeDirs: string[];
  absoluteProviderCommands: string[];
}): Promise<string[]> {
  const candidates: string[] = [];

  pushUniqueCandidate(candidates, input.execPath);
  pushUniqueCandidate(candidates, input.pathResolution);

  for (const commandPath of input.absoluteProviderCommands) {
    // `path.dirname` is the ONE deliberate module-path exception in this file and
    // it survives the D-05 sweep: D-05 names every join and does not name
    // `dirname`, and this call is host-flavoured BY DESIGN — on a real Windows
    // host the command is "C:\...\claude.cmd" and only a win32-flavoured dirname
    // finds its directory. Plan 06-02's T-06-06 relocates this derivation and
    // writes the exception down beside it. Do not "finish the sweep" here.
    pushUniqueCandidate(
      candidates,
      joinPath({
        platform: undefined,
        segments: [path.dirname(commandPath), "node"],
      }),
    );
  }

  pushUniqueCandidate(candidates, "/opt/homebrew/bin/node");
  pushUniqueCandidate(candidates, "/usr/local/bin/node");
  pushUniqueCandidate(candidates, "/usr/bin/node");

  // Every `platform: undefined` below is a TEMPORARY POSIX-arm pass-through, not
  // a platform that was defaulted on purpose. This function does not hold a
  // platform yet — its public signature gains one in plan 06-02's T-06-06, which
  // substitutes the real RUN-05 probe value at each of these sites. It is
  // CMP-01-safe in the meantime because joinPath's POSIX arm IS the pre-sweep
  // spelling, so the emitted strings are byte-identical to today's on POSIX.
  const posix = (segments: string[]): string =>
    joinPath({ platform: undefined, segments });

  for (const homeDir of [...new Set(input.homeDirs)]) {
    pushUniqueCandidate(candidates, posix([homeDir, ".volta", "bin", "node"]));
    pushUniqueCandidate(candidates, posix([homeDir, ".asdf", "shims", "node"]));
    pushUniqueCandidate(candidates, posix([homeDir, ".local", "bin", "node"]));
    for (const candidate of await collectVersionManagerCommandCandidates({
      homeDir,
      command: "node",
      platform: undefined,
    })) {
      pushUniqueCandidate(candidates, candidate);
    }
  }

  return candidates;
}
