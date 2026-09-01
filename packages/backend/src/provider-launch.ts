// Pure helpers that build provider-specific CLI launch arguments. The caller
// owns all side effects (writing MCP wrappers/configs, resolving binaries,
// handling auth token failures) and just passes the finalized paths in.
// Keeping this file free of I/O is what makes the per-provider snapshot
// tests possible — a regression in the argv of any provider shows up as a
// failed test before it can ship.

export const CLAUDE_DISALLOWED_TOOLS =
  "Bash,Edit,Glob,Grep,MultiEdit,NotebookEdit,Read,Skill,Task,TodoWrite,ToolSearch,WebFetch,WebSearch,Write";

export function buildClaudeSessionInstructions(hasMcpAttached: boolean): string {
  return [
    "You are running inside Drift, a Caido plugin.",
    hasMcpAttached
      ? "The only supported live Caido access path in this session is the attached Drift MCP server. Use only the attached mcp__drift__* tools for live Caido data."
      : "No Drift MCP server is attached in this session. If the user asks for live Caido data, explain that Drift MCP is not attached for this turn.",
    "Call MCP tools one at a time, never in parallel within a single assistant message.",
    "Do not present progress-only or tool-loading updates as your user-facing answer.",
  ].join(" ");
}

export interface ClaudeLaunchInput {
  allowedToolNames: readonly string[];
  resumeSessionId: string | undefined;
  mcpConfigPath: string | undefined;
  hasMcpAttached: boolean;
}

export function buildClaudeLaunchArgs(input: ClaudeLaunchInput): string[] {
  const sessionInstructions = buildClaudeSessionInstructions(input.hasMcpAttached);
  const args: string[] = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--disable-slash-commands",
    "--append-system-prompt",
    sessionInstructions,
    "--disallowedTools",
    CLAUDE_DISALLOWED_TOOLS,
    "--allowedTools",
    input.allowedToolNames.map((name) => `mcp__drift__${name}`).join(","),
  ];
  if (input.resumeSessionId !== undefined) {
    args.push("--resume", input.resumeSessionId);
  }
  if (input.mcpConfigPath !== undefined) {
    args.push("--strict-mcp-config", "--mcp-config", input.mcpConfigPath);
  }
  return args;
}

export interface GeminiLaunchInput {
  hasMcpAttached: boolean;
}

export function buildGeminiLaunchArgs(input: GeminiLaunchInput): string[] {
  const args: string[] = ["--output-format", "text"];
  if (input.hasMcpAttached) {
    args.push("--allowed-mcp-server-names", "drift");
  }
  args.push("-p", ".");
  return args;
}

export function buildCodexLaunchArgs(): string[] {
  return ["exec", "--skip-git-repo-check", "--color", "never", "-"];
}

export interface CopilotLaunchInput {
  mcpConfigPath: string | undefined;
}

export function buildCopilotLaunchArgs(input: CopilotLaunchInput): string[] {
  const args: string[] = ["-p", "--quiet"];
  if (input.mcpConfigPath !== undefined) {
    args.push("--additional-mcp-config", `@${input.mcpConfigPath}`);
  }
  return args;
}
