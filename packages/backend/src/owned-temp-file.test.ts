import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupOwnedPaths, writeOwnedTempFile } from "./owned-temp-file";

function errnoError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drift-owned-temp-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(
    roots.map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("owned atomic temporary files", () => {
  it("owns both paths before writing and publishes complete bytes by rename", async () => {
    const root = await createTempRoot();
    const finalPath = join(root, "mcp-chat.json");
    const stagingPath = join(root, "mcp-chat.json.unique.tmp");
    const owners = new Set<string>();
    const content = '{"token":"complete"}\n';
    const observations: string[] = [];

    const published = await writeOwnedTempFile({
      owners,
      finalPath,
      stagingPath,
      writeStaged: async (path) => {
        observations.push("write");
        expect(owners).toEqual(new Set([finalPath, stagingPath]));
        await expect(stat(finalPath)).rejects.toMatchObject({ code: "ENOENT" });
        await writeFile(path, content, { mode: 0o600 });
      },
      promote: async (staged, final) => {
        observations.push("promote");
        expect(owners).toEqual(new Set([finalPath, stagingPath]));
        await rename(staged, final);
      },
      remove: async (path) => {
        await rm(path, { force: true });
      },
    });

    expect(published).toBe(finalPath);
    expect(observations).toEqual(["write", "promote"]);
    expect(owners).toEqual(new Set([finalPath]));
    await expect(readFile(finalPath, "utf8")).resolves.toBe(content);
    await expect(stat(stagingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains a partial staging file as owned when write and removal fail", async () => {
    const root = await createTempRoot();
    const finalPath = join(root, "mcp-chat.json");
    const stagingPath = join(root, "mcp-chat.json.partial.tmp");
    const owners = new Set<string>();
    const promote = vi.fn(async (): Promise<void> => undefined);

    await expect(
      writeOwnedTempFile({
        owners,
        finalPath,
        stagingPath,
        writeStaged: async (path) => {
          expect(owners).toEqual(new Set([finalPath, stagingPath]));
          await writeFile(path, '{"token":', { mode: 0o600 });
          throw errnoError("EIO", "partial write");
        },
        promote,
        remove: async (path) => {
          if (path === stagingPath) {
            throw errnoError("EACCES", "staging file is locked");
          }
          await rm(path, { force: true });
        },
      }),
    ).rejects.toThrow("partial write");

    expect(promote).not.toHaveBeenCalled();
    expect(owners).toEqual(new Set([stagingPath]));
    await expect(readFile(stagingPath, "utf8")).resolves.toBe('{"token":');

    await cleanupOwnedPaths({
      owners,
      remove: async (path) => {
        await rm(path, { force: true });
      },
    });
    expect(owners.size).toBe(0);
    await expect(stat(stagingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains every unconfirmed path when promotion and cleanup fail", async () => {
    const root = await createTempRoot();
    const finalPath = join(root, "mcp-chat.json");
    const stagingPath = join(root, "mcp-chat.json.rename.tmp");
    const owners = new Set<string>();

    await expect(
      writeOwnedTempFile({
        owners,
        finalPath,
        stagingPath,
        writeStaged: async (path) => {
          await writeFile(path, "complete", { mode: 0o600 });
        },
        promote: async () => {
          throw errnoError("EBUSY", "rename blocked");
        },
        remove: async () => {
          throw errnoError("EPERM", "cleanup blocked");
        },
      }),
    ).rejects.toThrow("rename blocked");

    expect(owners).toEqual(new Set([finalPath, stagingPath]));
    await expect(readFile(stagingPath, "utf8")).resolves.toBe("complete");
    await expect(stat(finalPath)).rejects.toMatchObject({ code: "ENOENT" });

    await cleanupOwnedPaths({
      owners,
      remove: async (path) => {
        await rm(path, { force: true });
      },
    });
    expect(owners.size).toBe(0);
  });

  it("keeps an unlink-failed file owned until a later cleanup succeeds", async () => {
    const root = await createTempRoot();
    const configPath = join(root, "mcp-chat.json");
    await writeFile(configPath, "sensitive", { mode: 0o600 });
    const owners = new Set([configPath]);

    await cleanupOwnedPaths({
      owners,
      remove: async () => {
        throw errnoError("EACCES", "unlink blocked");
      },
    });

    expect(owners).toEqual(new Set([configPath]));
    await expect(readFile(configPath, "utf8")).resolves.toBe("sensitive");

    await cleanupOwnedPaths({
      owners,
      remove: async (path) => {
        await rm(path, { force: true });
      },
    });
    expect(owners.size).toBe(0);
    await expect(stat(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps ownership after an overlapping cleanup fails", async () => {
    const root = await createTempRoot();
    const configPath = join(root, "mcp-chat.json");
    await writeFile(configPath, "sensitive", { mode: 0o600 });
    const owners = new Set([configPath]);
    let allowFirstRemoval: () => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const firstCanRemove = new Promise<void>((resolve) => {
      allowFirstRemoval = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });

    const firstCleanup = cleanupOwnedPaths({
      owners,
      remove: async (path) => {
        markFirstStarted();
        await firstCanRemove;
        await rm(path, { force: true });
      },
    });
    const firstOutcome = firstCleanup.then(
      () => "finished" as const,
      () => "failed" as const,
    );

    try {
      await expect(
        Promise.race([
          firstStarted.then(() => "started" as const),
          firstOutcome,
        ]),
      ).resolves.toBe("started");

      await cleanupOwnedPaths({
        owners,
        remove: async () => {
          throw errnoError("EACCES", "overlapping unlink blocked");
        },
      });
      expect(owners).toEqual(new Set([configPath]));
      await expect(readFile(configPath, "utf8")).resolves.toBe("sensitive");
    } finally {
      allowFirstRemoval();
      await firstOutcome;
    }

    expect(owners.size).toBe(0);
    await expect(stat(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
