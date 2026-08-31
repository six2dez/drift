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

export async function inspectRequiredMcpRuntimeArtifacts(
  _input: McpRuntimeArtifactInspection,
): Promise<McpRuntimeArtifactPresence> {
  throw new Error("MCP runtime artifact validation is not implemented");
}
