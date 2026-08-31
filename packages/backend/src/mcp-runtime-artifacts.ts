export type McpRuntimeArtifactPresence = {
  runtimeDirectoryPresent: boolean;
  runtimeScriptPresent: boolean;
  runtimeContextPresent: boolean;
};

export type McpRuntimePathInfo = {
  isDirectory: () => boolean;
  isFile: () => boolean;
};

export type McpRuntimeReadableHandle = {
  close: () => Promise<void>;
};

export type McpRuntimeArtifactInspection = {
  tempDir: string | undefined;
  scriptPath: string | undefined;
  contextPath: string | undefined;
  statPath: (path: string) => Promise<McpRuntimePathInfo>;
  openReadable: (path: string) => Promise<McpRuntimeReadableHandle>;
  readText: (path: string) => Promise<string>;
};

async function isRuntimeDirectory(
  path: string | undefined,
  statPath: McpRuntimeArtifactInspection["statPath"],
): Promise<boolean> {
  if (path === undefined) return false;

  try {
    return (await statPath(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isReadableRegularFile(
  path: string | undefined,
  input: Pick<McpRuntimeArtifactInspection, "statPath" | "openReadable">,
): Promise<boolean> {
  if (path === undefined) return false;

  try {
    if (!(await input.statPath(path)).isFile()) return false;

    const handle = await input.openReadable(path);
    await handle.close();
    return true;
  } catch {
    return false;
  }
}

async function isReadableObjectContext(
  path: string | undefined,
  input: Pick<McpRuntimeArtifactInspection, "statPath" | "readText">,
): Promise<boolean> {
  if (path === undefined) return false;

  try {
    if (!(await input.statPath(path)).isFile()) return false;

    const parsed: unknown = JSON.parse(await input.readText(path));
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

export async function inspectRequiredMcpRuntimeArtifacts(
  input: McpRuntimeArtifactInspection,
): Promise<McpRuntimeArtifactPresence> {
  // T-08-93/T-08-94: reuse requires usable filesystem objects and a parseable
  // object context. Every probe fails closed without exposing context bytes.
  const [runtimeDirectoryPresent, runtimeScriptPresent, runtimeContextPresent] =
    await Promise.all([
      isRuntimeDirectory(input.tempDir, input.statPath),
      isReadableRegularFile(input.scriptPath, input),
      isReadableObjectContext(input.contextPath, input),
    ]);

  return {
    runtimeDirectoryPresent,
    runtimeScriptPresent,
    runtimeContextPresent,
  };
}
