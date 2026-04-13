import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectVersionManagerCommandCandidates,
  extractHomeDir,
  getCommandExecutableCandidates,
  getNodeExecutableCandidates,
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

  it("builds node candidates from known homes and provider-adjacent paths", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);

    const candidates = await getNodeExecutableCandidates({
      execPath: "/usr/local/bin/node",
      pathResolution: "/opt/homebrew/bin/node",
      homeDirs: [homeDir],
      absoluteProviderCommands: ["/Users/six2dez/.local/bin/claude"],
    });

    expect(candidates).toContain("/usr/local/bin/node");
    expect(candidates).toContain("/opt/homebrew/bin/node");
    expect(candidates).toContain("/Users/six2dez/.local/bin/node");
    expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "node"));
  });
});
