import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  CliProvider,
  type AvailabilityResult,
  type ChatMessage,
  type McpConfig,
  type ProviderConfig,
  type ResumeState,
  type TempMcpConfig,
} from "shared";

import {
  buildCliHistory,
  filterEchoedInput,
  resolveCommand,
  buildEnhancedPath,
  stripAnsiCodes,
} from "../utils";
import type { BuildCommandInput, ProviderAdapter, RequestContext } from "./types";

// Track output files per session to avoid singleton state pollution
const pendingOutputFiles = new Map<string, string>();

/**
 * Codex CLI adapter.
 * Ported from burp-ai-agent CliBackend.buildCodexExecCommand()
 *
 * Uses `codex exec` subcommand with --output-last-message for clean output.
 * Stateless: no session resume.
 * MCP config: via env vars MCP_SERVER_URL + MCP_TOKEN
 */
class CodexAdapter implements ProviderAdapter {
  readonly id = CliProvider.Codex;
  readonly displayName = "Codex CLI";
  readonly supportsResume = false;

  detectAvailability(config: ProviderConfig): AvailabilityResult {
    if (!config.command || !config.enabled) {
      return { available: false, error: "Provider disabled or no command configured" };
    }
    const resolved = resolveCommand(config.command, buildEnhancedPath());
    if (!resolved) {
      return { available: false, error: `Command "${config.command}" not found in PATH` };
    }
    return { available: true, resolvedPath: resolved };
  }

  buildCommand(input: BuildCommandInput): string[] {
    // Create temp file for output, keyed by a unique command invocation
    const tempDir = mkdtempSync(join(tmpdir(), "drift-codex-out-"));
    const outputFile = join(tempDir, "output.txt");

    // Store for later retrieval in parseOutput, keyed by output file path
    // The command args include the path, so parseOutput can find it
    pendingOutputFiles.set(outputFile, outputFile);

    const args = [
      input.command,
      "exec",
      "--color", "never",
      "--skip-git-repo-check",
      "--output-last-message", outputFile,
      "-", // read from stdin
    ];
    return args;
  }

  buildEnvironment(mcpConfig: McpConfig | null): Record<string, string> {
    const env: Record<string, string> = {
      PATH: buildEnhancedPath(),
      NO_COLOR: "1",
      TERM: "dumb",
    };

    if (mcpConfig) {
      const url = `http://${mcpConfig.host}:${mcpConfig.port}/mcp`;
      env["MCP_SERVER_URL"] = url;
    }

    return env;
  }

  bootstrapMcpConfig(mcpConfig: McpConfig, token: string): TempMcpConfig {
    return {
      configPath: "",
      envVars: {
        MCP_SERVER_URL: `http://${mcpConfig.host}:${mcpConfig.port}/sse`,
        MCP_TOKEN: token,
      },
    };
  }

  buildPrompt(
    text: string,
    history: ChatMessage[],
    context: RequestContext | null
  ): string {
    const parts: string[] = [];

    if (context) {
      parts.push(
        `[Current HTTP Request]\n${context.method} ${context.url}\nHeaders:\n${context.headers}`
      );
    }

    if (history.length > 0) {
      const historyText = buildCliHistory(history, 10, 20000);
      if (historyText) {
        parts.push(`[Conversation History]\n${historyText}`);
      }
    }

    parts.push(text);
    return parts.join("\n\n");
  }

  parseOutput(stdout: string, prompt: string): string {
    // Find the output file from the command args embedded in stdout context
    // We check all pending output files
    for (const [key, outputFile] of pendingOutputFiles) {
      if (existsSync(outputFile)) {
        try {
          const fileText = readFileSync(outputFile, "utf-8").trim();
          cleanupOutputFile(outputFile);
          pendingOutputFiles.delete(key);
          if (fileText.length > 0) {
            return fileText;
          }
        } catch {
          cleanupOutputFile(outputFile);
          pendingOutputFiles.delete(key);
        }
      }
    }

    // Fallback: parse stdout
    const stripped = stripAnsiCodes(stdout);
    return filterEchoedInput(stripped, prompt);
  }

  extractResumeState(): ResumeState | null {
    return null;
  }

  cleanup(_tempConfig: TempMcpConfig | null): void {
    // Cleanup any remaining output files for this adapter
    for (const [key, outputFile] of pendingOutputFiles) {
      cleanupOutputFile(outputFile);
      pendingOutputFiles.delete(key);
    }
  }
}

function cleanupOutputFile(outputFile: string): void {
  try {
    const dir = dirname(outputFile);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best effort */ }
}

let _adapter: CodexAdapter | undefined;
export function getCodexAdapter(): CodexAdapter {
  if (!_adapter) _adapter = new CodexAdapter();
  return _adapter;
}
