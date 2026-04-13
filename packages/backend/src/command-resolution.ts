import { readdir, stat } from "fs/promises";
import path from "path";

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

export function extractHomeDir(candidatePath: string | undefined): string | undefined {
  const normalized = candidatePath?.trim();
  if (normalized === undefined || normalized === "") return undefined;
  const resolved = path.normalize(normalized);

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
