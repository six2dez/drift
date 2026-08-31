import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  inspectRequiredMcpRuntimeArtifacts,
  type McpRuntimeArtifactInspection,
  type McpRuntimePathInfo,
} from "./mcp-runtime-artifacts";

function errnoError(code: string, message: string): Error {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "drift-runtime-artifacts-"));
  tempRoots.push(root);
  return root;
}

function artifactPaths(root: string): {
  tempDir: string;
  scriptPath: string;
  contextPath: string;
} {
  return {
    tempDir: root,
    scriptPath: join(root, "mcp-server.mjs"),
    contextPath: join(root, "mcp-context.json"),
  };
}

function realInspection(root: string): McpRuntimeArtifactInspection {
  return {
    ...artifactPaths(root),
    statPath: stat,
    openReadable: async (path) => open(path, "r"),
    readText: async (path) => readFile(path, "utf8"),
  };
}

const directoryInfo: McpRuntimePathInfo = {
  isDirectory: () => true,
  isFile: () => false,
};

const fileInfo: McpRuntimePathInfo = {
  isDirectory: () => false,
  isFile: () => true,
};

const nonRegularInfo: McpRuntimePathInfo = {
  isDirectory: () => false,
  isFile: () => false,
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(
    roots.map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("required MCP runtime artifact validation", () => {
  it("accepts a real directory, readable script, and object context", async () => {
    const root = await createTempRoot();
    const paths = artifactPaths(root);
    await writeFile(paths.scriptPath, "export {};\n", { mode: 0o600 });
    await writeFile(paths.contextPath, '{"projectId":"1"}\n', {
      mode: 0o600,
    });

    await expect(
      inspectRequiredMcpRuntimeArtifacts(realInspection(root)),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: true,
      runtimeContextPresent: true,
    });
  });

  it("rejects directories installed at both required file paths", async () => {
    const root = await createTempRoot();
    const paths = artifactPaths(root);
    await mkdir(paths.scriptPath);
    await mkdir(paths.contextPath);

    await expect(
      inspectRequiredMcpRuntimeArtifacts(realInspection(root)),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: false,
      runtimeContextPresent: false,
    });
  });

  it("rejects missing required files without throwing", async () => {
    const root = await createTempRoot();

    await expect(
      inspectRequiredMcpRuntimeArtifacts(realInspection(root)),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: false,
      runtimeContextPresent: false,
    });
  });

  it.each(["{", "null", "[]", "42", '"scalar"'])(
    "rejects malformed or non-object context bytes: %s",
    async (contextBytes) => {
      const root = await createTempRoot();
      const paths = artifactPaths(root);
      await writeFile(paths.scriptPath, "export {};\n", { mode: 0o600 });
      await writeFile(paths.contextPath, contextBytes, { mode: 0o600 });

      await expect(
        inspectRequiredMcpRuntimeArtifacts(realInspection(root)),
      ).resolves.toEqual({
        runtimeDirectoryPresent: true,
        runtimeScriptPresent: true,
        runtimeContextPresent: false,
      });
    },
  );

  it("returns false fields for stat failures without invoking readers", async () => {
    const openReadable = vi.fn(async () => ({
      close: async (): Promise<void> => undefined,
    }));
    const readText = vi.fn(async () => "{}");

    await expect(
      inspectRequiredMcpRuntimeArtifacts({
        tempDir: "/runtime",
        scriptPath: "/runtime/mcp-server.mjs",
        contextPath: "/runtime/mcp-context.json",
        statPath: async () => {
          throw errnoError("EACCES", "metadata denied");
        },
        openReadable,
        readText,
      }),
    ).resolves.toEqual({
      runtimeDirectoryPresent: false,
      runtimeScriptPresent: false,
      runtimeContextPresent: false,
    });
    expect(openReadable).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });

  it("rejects injected script-open and context-read EACCES errors", async () => {
    const statPath = vi.fn(async (path: string) =>
      path === "/runtime" ? directoryInfo : fileInfo,
    );

    await expect(
      inspectRequiredMcpRuntimeArtifacts({
        tempDir: "/runtime",
        scriptPath: "/runtime/mcp-server.mjs",
        contextPath: "/runtime/mcp-context.json",
        statPath,
        openReadable: async () => {
          throw errnoError("EACCES", "script read denied");
        },
        readText: async () => "{}",
      }),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: false,
      runtimeContextPresent: true,
    });

    await expect(
      inspectRequiredMcpRuntimeArtifacts({
        tempDir: "/runtime",
        scriptPath: "/runtime/mcp-server.mjs",
        contextPath: "/runtime/mcp-context.json",
        statPath,
        openReadable: async () => ({
          close: async (): Promise<void> => undefined,
        }),
        readText: async () => {
          throw errnoError("EACCES", "context read denied");
        },
      }),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: true,
      runtimeContextPresent: false,
    });
  });

  it("rejects non-regular required objects before opening or reading", async () => {
    const openReadable = vi.fn(async () => ({
      close: async (): Promise<void> => undefined,
    }));
    const readText = vi.fn(async () => "{}");

    await expect(
      inspectRequiredMcpRuntimeArtifacts({
        tempDir: "/runtime",
        scriptPath: "/runtime/mcp-server.mjs",
        contextPath: "/runtime/mcp-context.json",
        statPath: async (path) =>
          path === "/runtime" ? directoryInfo : nonRegularInfo,
        openReadable,
        readText,
      }),
    ).resolves.toEqual({
      runtimeDirectoryPresent: true,
      runtimeScriptPresent: false,
      runtimeContextPresent: false,
    });
    expect(openReadable).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });

  it("returns all false when no runtime path is installed", async () => {
    const statPath = vi.fn(async () => directoryInfo);

    await expect(
      inspectRequiredMcpRuntimeArtifacts({
        tempDir: undefined,
        scriptPath: undefined,
        contextPath: undefined,
        statPath,
        openReadable: async () => ({
          close: async (): Promise<void> => undefined,
        }),
        readText: async () => "{}",
      }),
    ).resolves.toEqual({
      runtimeDirectoryPresent: false,
      runtimeScriptPresent: false,
      runtimeContextPresent: false,
    });
    expect(statPath).not.toHaveBeenCalled();
  });
});

const canEnforcePosixReadMode =
  process.platform !== "win32" &&
  typeof process.getuid === "function" &&
  process.getuid() !== 0;

describe.skipIf(!canEnforcePosixReadMode)("real unreadable artifact", () => {
  it("rejects a chmod-unreadable regular script", async () => {
    const root = await createTempRoot();
    const paths = artifactPaths(root);
    await writeFile(paths.scriptPath, "export {};\n", { mode: 0o600 });
    await writeFile(paths.contextPath, "{}\n", { mode: 0o600 });
    await chmod(paths.scriptPath, 0o000);

    try {
      await expect(
        inspectRequiredMcpRuntimeArtifacts(realInspection(root)),
      ).resolves.toEqual({
        runtimeDirectoryPresent: true,
        runtimeScriptPresent: false,
        runtimeContextPresent: true,
      });
    } finally {
      await chmod(paths.scriptPath, 0o600);
    }
  });
});
