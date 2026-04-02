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

const GEMINI_NOISE_PATTERNS = [
  "loaded cached credentials.",
  "mcp server 'drift':",
  "error during discovery for mcp server",
  "hook registry initialized with",
  "loading extension:",
  "listening for changes",
  "supports tool updates",
  "send over your first target",
];

function isGeminiNoiseLine(line: string): boolean {
  const lower = line.toLowerCase();
  if (GEMINI_NOISE_PATTERNS.some((p) => lower.includes(p))) return true;
  if (
    lower.startsWith("error executing tool ") &&
    lower.includes("tool execution denied by policy")
  )
    return true;
  if (lower.includes("ready.") && lower.includes("standing by")) return true;
  return false;
}

/**
 * Gemini CLI adapter.
 * Ported from burp-ai-agent CliBackend.buildGeminiCommand()
 *
 * Stateless: no session resume, history prepended to prompt.
 * MCP config: via GEMINI_CONFIG_DIR env var pointing to temp dir with config.json
 */
class GeminiAdapter implements ProviderAdapter {
  readonly id = CliProvider.Gemini;
  readonly displayName = "Gemini CLI";
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
    args.push("--output-format", "text");
    args.push("-p", "."); // read from stdin
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
    // Gemini uses a config dir with config.json containing mcpServers
    const tempDir = mkdtempSync(join(tmpdir(), "drift-gemini-mcp-"));
    const configPath = join(tempDir, "config.json");

    const config = {
      mcpServers: {
        drift: {
          uri: `http://${mcpConfig.host}:${mcpConfig.port}/sse`,
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
        GEMINI_CONFIG_DIR: tempDir,
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

    // Gemini is stateless - prepend history
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
    const lines = stripped.split("\n");
    const inputLines = new Set(
      prompt.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
    );

    return lines
      .map((l) => l.trim())
      .filter(
        (l) => l.length > 0 && !inputLines.has(l) && !isGeminiNoiseLine(l)
      )
      .join("\n")
      .trim();
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

let _adapter: GeminiAdapter | undefined;
export function getGeminiAdapter(): GeminiAdapter {
  if (!_adapter) _adapter = new GeminiAdapter();
  return _adapter;
}
