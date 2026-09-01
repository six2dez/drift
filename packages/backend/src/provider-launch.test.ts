import { describe, expect, it } from "vitest";
import {
  CLAUDE_DISALLOWED_TOOLS,
  buildClaudeLaunchArgs,
  buildClaudeSessionInstructions,
  buildCodexLaunchArgs,
  buildCopilotLaunchArgs,
  buildGeminiLaunchArgs,
} from "./provider-launch";

const DEFAULT_TOOLS = ["search_history", "get_current_context"] as const;

describe("buildClaudeSessionInstructions", () => {
  it("tells the model to use mcp__drift__* tools when MCP is attached", () => {
    const out = buildClaudeSessionInstructions(true);
    expect(out).toContain("mcp__drift__");
    expect(out).toContain("one at a time");
  });

  it("tells the model MCP is not attached when it is not", () => {
    const out = buildClaudeSessionInstructions(false);
    expect(out).toContain("not attached");
    expect(out).not.toContain("only supported live Caido access path");
  });
});

describe("buildClaudeLaunchArgs", () => {
  it("produces the base Claude flags without --resume or --mcp-config when MCP is absent", () => {
    const args = buildClaudeLaunchArgs({
      allowedToolNames: DEFAULT_TOOLS,
      resumeSessionId: undefined,
      mcpConfigPath: undefined,
      hasMcpAttached: false,
    });
    expect(args).toEqual([
      "-p",
      "--verbose",
      "--output-format",
      "stream-json",
      "--disable-slash-commands",
      "--append-system-prompt",
      buildClaudeSessionInstructions(false),
      "--disallowedTools",
      CLAUDE_DISALLOWED_TOOLS,
      "--allowedTools",
      "mcp__drift__search_history,mcp__drift__get_current_context",
    ]);
    expect(args).not.toContain("--resume");
    expect(args).not.toContain("--mcp-config");
  });

  it("appends --resume <sid> when a resume session id is provided", () => {
    const args = buildClaudeLaunchArgs({
      allowedToolNames: DEFAULT_TOOLS,
      resumeSessionId: "session-abc",
      mcpConfigPath: undefined,
      hasMcpAttached: false,
    });
    expect(args).toContain("--resume");
    expect(args[args.indexOf("--resume") + 1]).toBe("session-abc");
  });

  it("appends --strict-mcp-config --mcp-config <path> when an MCP config path is provided", () => {
    const args = buildClaudeLaunchArgs({
      allowedToolNames: DEFAULT_TOOLS,
      resumeSessionId: undefined,
      mcpConfigPath: "/tmp/drift/mcp-chat-1.json",
      hasMcpAttached: true,
    });
    expect(args).toContain("--strict-mcp-config");
    const idx = args.indexOf("--mcp-config");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("/tmp/drift/mcp-chat-1.json");
  });

  it("prefixes every allowed tool with mcp__drift__", () => {
    const args = buildClaudeLaunchArgs({
      allowedToolNames: ["send_request", "create_finding"],
      resumeSessionId: undefined,
      mcpConfigPath: undefined,
      hasMcpAttached: false,
    });
    const allowedIdx = args.indexOf("--allowedTools");
    expect(args[allowedIdx + 1]).toBe(
      "mcp__drift__send_request,mcp__drift__create_finding",
    );
  });
});

describe("buildGeminiLaunchArgs", () => {
  it("returns text output and the drift MCP filter when MCP is attached", () => {
    expect(buildGeminiLaunchArgs({ hasMcpAttached: true })).toEqual([
      "--output-format",
      "text",
      "--allowed-mcp-server-names",
      "drift",
      "-p",
      ".",
    ]);
  });

  it("omits the MCP filter when MCP is not attached", () => {
    expect(buildGeminiLaunchArgs({ hasMcpAttached: false })).toEqual([
      "--output-format",
      "text",
      "-p",
      ".",
    ]);
  });
});

describe("buildCodexLaunchArgs", () => {
  it("allows Codex to run from Caido's non-repository working directory", () => {
    expect(buildCodexLaunchArgs()).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-",
    ]);
  });
});

describe("buildCopilotLaunchArgs", () => {
  it("returns -p --quiet with no MCP flag when no config path is provided", () => {
    expect(buildCopilotLaunchArgs({ mcpConfigPath: undefined })).toEqual([
      "-p",
      "--quiet",
    ]);
  });

  it("appends --additional-mcp-config @<path> when a config path is provided", () => {
    expect(
      buildCopilotLaunchArgs({ mcpConfigPath: "/tmp/drift/copilot-mcp-1.json" }),
    ).toEqual([
      "-p",
      "--quiet",
      "--additional-mcp-config",
      "@/tmp/drift/copilot-mcp-1.json",
    ]);
  });
});
