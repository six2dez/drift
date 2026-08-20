import { readdir, stat } from "fs/promises";
import path from "path";

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

async function listVersionDirectories(root: string): Promise<string[]> {
  const entries = (await readdir(root)).sort().reverse();
  const versions: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    try {
      const entryStat = await stat(path.join(root, entry));
      if (entryStat.isDirectory()) versions.push(entry);
    } catch {
      // Ignore broken or transient entries while probing candidate paths.
    }
  }
  return versions;
}

export async function collectVersionManagerCommandCandidates(
  homeDir: string,
  command: string,
): Promise<string[]> {
  const candidates: string[] = [];

  const nvmDir = path.join(homeDir, ".nvm", "versions", "node");
  if (await pathExists(nvmDir)) {
    const versions = await listVersionDirectories(nvmDir);
    for (const version of versions) {
      pushUniqueCandidate(candidates, path.join(nvmDir, version, "bin", command));
    }
  }

  const fnmDir = path.join(homeDir, ".fnm", "node-versions");
  if (await pathExists(fnmDir)) {
    const versions = await listVersionDirectories(fnmDir);
    for (const version of versions) {
      pushUniqueCandidate(candidates, path.join(fnmDir, version, "installation", "bin", command));
    }
  }

  return candidates;
}

export async function getCommandExecutableCandidates(input: {
  command: string;
  pathResolution?: string;
  homeDirs: string[];
}): Promise<string[]> {
  const candidates: string[] = [];
  pushUniqueCandidate(candidates, input.pathResolution);

  pushUniqueCandidate(candidates, path.join("/opt/homebrew/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/usr/local/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/usr/bin", input.command));
  pushUniqueCandidate(candidates, path.join("/bin", input.command));

  for (const homeDir of [...new Set(input.homeDirs)]) {
    pushUniqueCandidate(candidates, path.join(homeDir, ".local", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".volta", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".asdf", "shims", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".npm-global", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".bun", "bin", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, "Library", "pnpm", input.command));
    pushUniqueCandidate(candidates, path.join(homeDir, ".local", "share", "pnpm", input.command));
    for (const candidate of await collectVersionManagerCommandCandidates(homeDir, input.command)) {
      pushUniqueCandidate(candidates, candidate);
    }
  }

  return candidates;
}

export async function getNodeExecutableCandidates(input: {
  execPath?: string;
  pathResolution?: string;
  homeDirs: string[];
  absoluteProviderCommands: string[];
}): Promise<string[]> {
  const candidates: string[] = [];

  pushUniqueCandidate(candidates, input.execPath);
  pushUniqueCandidate(candidates, input.pathResolution);

  for (const commandPath of input.absoluteProviderCommands) {
    pushUniqueCandidate(candidates, path.join(path.dirname(commandPath), "node"));
  }

  pushUniqueCandidate(candidates, "/opt/homebrew/bin/node");
  pushUniqueCandidate(candidates, "/usr/local/bin/node");
  pushUniqueCandidate(candidates, "/usr/bin/node");

  for (const homeDir of [...new Set(input.homeDirs)]) {
    pushUniqueCandidate(candidates, path.join(homeDir, ".volta", "bin", "node"));
    pushUniqueCandidate(candidates, path.join(homeDir, ".asdf", "shims", "node"));
    pushUniqueCandidate(candidates, path.join(homeDir, ".local", "bin", "node"));
    for (const candidate of await collectVersionManagerCommandCandidates(homeDir, "node")) {
      pushUniqueCandidate(candidates, candidate);
    }
  }

  return candidates;
}
