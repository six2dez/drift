import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectVersionManagerCommandCandidates,
  extractHomeDir,
  formatProviderUnavailableMessage,
  getCommandExecutableCandidates,
  getNodeExecutableCandidates,
  getProviderInstallHint,
} from "./command-resolution";

describe("command resolution helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("extracts home directories from macOS and Linux-style paths", () => {
    expect(extractHomeDir("/Users/six2dez/.local/bin/claude")).toBe("/Users/six2dez");
    expect(extractHomeDir("/home/test/.volta/bin/codex")).toBe("/home/test");
    expect(extractHomeDir("/Users/../../../tmp/claude")).toBeUndefined();
    expect(extractHomeDir("claude")).toBeUndefined();
  });

  it("collects version manager command candidates", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    await mkdir(path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin"), { recursive: true });
    await mkdir(path.join(homeDir, ".fnm", "node-versions", "v20.5.0", "installation", "bin"), {
      recursive: true,
    });

    const candidates = await collectVersionManagerCommandCandidates(homeDir, "claude");

    expect(candidates).toContain(
      path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin", "claude"),
    );
    expect(candidates).toContain(
      path.join(homeDir, ".fnm", "node-versions", "v20.5.0", "installation", "bin", "claude"),
    );
  });

  it("builds command candidates from PATH and common install locations", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    await mkdir(path.join(homeDir, ".nvm", "versions", "node", "v18.0.0", "bin"), { recursive: true });

    const candidates = await getCommandExecutableCandidates({
      command: "claude",
      pathResolution: "/opt/homebrew/bin/claude",
      homeDirs: [homeDir],
    });

    expect(candidates[0]).toBe("/opt/homebrew/bin/claude");
    expect(candidates).toContain(path.join(homeDir, ".local", "bin", "claude"));
    expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "claude"));
    expect(candidates).toContain(path.join(homeDir, ".asdf", "shims", "claude"));
    expect(candidates).toContain(path.join(homeDir, "Library", "pnpm", "claude"));
    expect(candidates).toContain(
      path.join(homeDir, ".nvm", "versions", "node", "v18.0.0", "bin", "claude"),
    );
  });

  it("returns an actionable install hint for every known provider", () => {
    expect(getProviderInstallHint("claude-cli")).toContain("claude.ai/install.sh");
    expect(getProviderInstallHint("gemini-cli")).toContain("@google/gemini-cli");
    expect(getProviderInstallHint("codex-cli")).toContain("@openai/codex");
    expect(getProviderInstallHint("copilot-cli")).toContain("gh extension install");
  });

  it("returns a generic hint for unknown providers", () => {
    const hint = getProviderInstallHint("unknown-cli");
    expect(hint).toContain("Install the CLI");
    expect(hint).toContain("Settings");
  });

  it("appends the install hint to the cause in formatProviderUnavailableMessage", () => {
    const message = formatProviderUnavailableMessage(
      "claude-cli",
      "CLI not found: claude",
    );
    expect(message.startsWith("CLI not found: claude")).toBe(true);
    expect(message).toContain("claude.ai/install.sh");
  });

  it("builds node candidates from known homes and provider-adjacent paths", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);

    // The provider directory is a SECOND temp dir, deliberately not homeDir.
    // getNodeExecutableCandidates already emits `<homeDir>/.local/bin/node`
    // from its homeDirs loop, so asserting a provider-adjacent path underneath
    // homeDir would still pass with the absoluteProviderCommands loop deleted.
    // A separate root is what keeps this assertion falsifiable.
    //
    // It is built with path.join rather than written as a "/Users/..." literal
    // because getNodeExecutableCandidates derives the sibling with
    // path.join(path.dirname(cmd), "node") — host-flavoured by design, and
    // correct on a real Windows host where the command is "C:\...\claude.cmd".
    // The POSIX literal this replaced could only ever hold when `path` was
    // POSIX, so it failed the first real windows-latest run (CI run
    // 32376894371, 2026-08-20) for the test's reasons, not the code's:
    //   expected [ '/usr/local/bin/node', …(6) ] to include '/Users/six2dez/.local/bin/node'
    const providerDir = await mkdtemp(path.join(os.tmpdir(), "drift-provider-"));
    tempDirs.push(providerDir);

    const candidates = await getNodeExecutableCandidates({
      execPath: "/usr/local/bin/node",
      pathResolution: "/opt/homebrew/bin/node",
      homeDirs: [homeDir],
      absoluteProviderCommands: [path.join(providerDir, "claude")],
    });

    expect(candidates).toContain("/usr/local/bin/node");
    expect(candidates).toContain("/opt/homebrew/bin/node");
    expect(candidates).toContain(path.join(providerDir, "node"));
    expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "node"));
  });
});
