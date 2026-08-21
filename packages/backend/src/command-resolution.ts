import { readdir, stat } from "fs/promises";
import path from "path";

import {
  getExecutableNames,
  joinPath,
  type Platform,
  type WindowsNamedRoots,
} from "./platform";

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

    // Catalogue row P-01. npm's own documentation states the default global
    // prefix on Windows is the roaming application-data npm directory, and that
    // on Windows executables are placed DIRECTLY into the prefix where Unix
    // links them into {prefix}/bin — so a `bin` segment here would be wrong.
    // Source: docs.npmjs.com/cli/v11/configuring-npm/folders.
    //
    // D-11 is location-major: all four spellings of this one location are
    // emitted before any later location. An absent root emits nothing at all
    // (T-06-T02) — never a candidate with an empty prefix, which would resolve
    // against the process working directory.
    const appData = input.roots.appData;
    if (appData !== undefined) {
      for (const name of windowsNames) {
        pushUniqueCandidate(candidates, win32([appData, "npm", name]));
      }
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
