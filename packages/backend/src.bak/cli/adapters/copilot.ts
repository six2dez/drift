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
  buildCliHistory,
  filterEchoedInput,
  resolveCommand,
  buildEnhancedPath,
  stripAnsiCodes,
} from "../utils";
import type { BuildCommandInput, ProviderAdapter, RequestContext } from "./types";

/**
 * Copilot CLI adapter (EXPERIMENTAL).
 * Ported from burp-ai-agent CliBackend.buildCopilotCommand()
 *
 * Uses -p flag for stdin prompt and --quiet for clean output.
 * Stateless: no session resume.
 * MCP config: via temp config file - format may need adjustment per Copilot CLI version.
 */
class CopilotAdapter implements ProviderAdapter {
  readonly id = CliProvider.Copilot;
  readonly displayName = "Copilot CLI";
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
    const args = [input.command];
    args.push("-p");     // read from stdin
    args.push("--quiet"); // suppress metadata output
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
      env["DRIFT_MCP_URL"] = url;
    }

    return env;
  }

  bootstrapMcpConfig(mcpConfig: McpConfig, token: string): TempMcpConfig {
    // Copilot MCP config - use temp config file
    const tempDir = mkdtempSync(join(tmpdir(), "drift-copilot-mcp-"));
    const configPath = join(tempDir, "mcp-config.json");

    const config = {
      mcpServers: {
        drift: {
          url: `http://${mcpConfig.host}:${mcpConfig.port}/sse`,
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
        MCP_CONFIG: configPath,
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

    // Copilot is stateless - prepend history
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
    const stripped = stripAnsiCodes(stdout);
    return filterEchoedInput(stripped, prompt);
  }

  extractResumeState(): ResumeState | null {
    return null; // stateless
  }

  cleanup(tempConfig: TempMcpConfig | null): void {
    if (tempConfig?.configDir) {
      try {
        rmSync(tempConfig.configDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  }
}

let _adapter: CopilotAdapter | undefined;
export function getCopilotAdapter(): CopilotAdapter {
  if (!_adapter) _adapter = new CopilotAdapter();
  return _adapter;
}
