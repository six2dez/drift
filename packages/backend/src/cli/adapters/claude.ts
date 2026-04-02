import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
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
  filterEchoedInput,
  resolveCommand,
  buildEnhancedPath,
  stripAnsiCodes,
} from "../utils";
import type { BuildCommandInput, ProviderAdapter, RequestContext } from "./types";

/**
 * Claude Code CLI adapter.
 * Ported from burp-ai-agent ClaudeCliBackendFactory + CliBackend.buildClaudeCommand()
 *
 * Session resume: --session-id <uuid> on first message, --resume <uuid> on follow-ups
 * MCP config: --mcp-config <tmpfile>
 * Print mode: -p flag (non-interactive, text output)
 */
class ClaudeAdapter implements ProviderAdapter {
  readonly id = CliProvider.Claude;
  readonly displayName = "Claude Code";
  readonly supportsResume = true;

  detectAvailability(config: ProviderConfig): AvailabilityResult {
    if (!config.command || !config.enabled) {
      return {
        available: false,
        error: "Provider disabled or no command configured",
      };
    }

    const resolved = resolveCommand(config.command, buildEnhancedPath());
    if (!resolved) {
      return {
        available: false,
        error: `Command "${config.command}" not found in PATH`,
      };
    }

    return { available: true, resolvedPath: resolved };
  }

  buildCommand(input: BuildCommandInput): string[] {
    const args = [input.command, "-p"];

    // Add MCP config if available
    if (input.tempMcpConfig) {
      args.push("--mcp-config", input.tempMcpConfig.configPath);
    }

    if (input.cliSessionId) {
      // Follow-up message: resume existing conversation
      args.push("--resume", input.cliSessionId);
    }
    // For first message, session ID is passed by the session manager
    // via --session-id flag appended externally

    return args;
  }

  buildEnvironment(mcpConfig: McpConfig | null): Record<string, string> {
    const env: Record<string, string> = {
      PATH: buildEnhancedPath(),
      CI: "1",
      NO_COLOR: "1",
      TERM: "dumb",
      FORCE_COLOR: "0",
      CLICOLOR: "0",
    };

    if (mcpConfig) {
      const url = `http://${mcpConfig.host}:${mcpConfig.port}/mcp`;
      env["DRIFT_MCP_URL"] = url;
    }

    return env;
  }

  bootstrapMcpConfig(mcpConfig: McpConfig, token: string): TempMcpConfig {
    const tempDir = mkdtempSync(join(tmpdir(), "drift-claude-mcp-"));
    const configPath = join(tempDir, "mcp-config.json");

    const config = {
      mcpServers: {
        drift: {
          type: "sse",
          url: `http://${mcpConfig.host}:${mcpConfig.port}/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });

    return {
      configPath,
      configDir: tempDir,
      envVars: {
        DRIFT_MCP_CONFIG: configPath,
      },
    };
  }

  buildPrompt(
    text: string,
    _history: ChatMessage[],
    context: RequestContext | null
  ): string {
    const parts: string[] = [];

    if (context) {
      parts.push(
        [
          "[Current HTTP Request]",
          `${context.method} ${context.url}`,
          `Headers:\n${context.headers}`,
          context.body ? `Body:\n${context.body}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    // Claude with --resume manages its own context, so we don't prepend history
    // History is only useful for first message or if resume fails
    parts.push(text);
    return parts.join("\n\n");
  }

  parseOutput(stdout: string, prompt: string): string {
    const stripped = stripAnsiCodes(stdout);
    return filterEchoedInput(stripped, prompt);
  }

  extractResumeState(
    processExitCode: number | null,
    cliSessionId: string | null
  ): ResumeState | null {
    // Session ID is managed by the session manager (passed via --session-id)
    // If process exited cleanly, the session is valid for resume
    if (
      (processExitCode === 0 || processExitCode === null) &&
      cliSessionId
    ) {
      return { cliSessionId };
    }
    return null;
  }

  cleanup(tempConfig: TempMcpConfig | null): void {
    if (tempConfig?.configDir) {
      try {
        rmSync(tempConfig.configDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }
  }
}

let _adapter: ClaudeAdapter | undefined;

export function getClaudeAdapter(): ClaudeAdapter {
  if (!_adapter) {
    _adapter = new ClaudeAdapter();
  }
  return _adapter;
}
