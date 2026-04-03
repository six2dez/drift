import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import type {
  CliProvider,
  CliSessionStateEvent,
  ProviderStatus,
  SendCliMessageInput,
  Settings,
  TempMcpConfig,
} from "shared";
import { CliProvider as CliProviderEnum } from "shared";

import type { BackendSDK } from "../types";
import { getMcpServer } from "../mcp/server";
import type { ProviderAdapter } from "./adapters/types";
import { getClaudeAdapter } from "./adapters/claude";
import { getGeminiAdapter } from "./adapters/gemini";
import { getCodexAdapter } from "./adapters/codex";
import { getCopilotAdapter } from "./adapters/copilot";
import { stripAnsiCodes, resolveCommand, buildEnhancedPath } from "./utils";

const LARGE_PROMPT_THRESHOLD = 16 * 1024; // 16KB

type ActiveSession = {
  sessionId: string;
  chatId: string;
  providerId: CliProvider;
  cliSessionId: string | null;
  state: "starting" | "running" | "stopped" | "error";
  error?: string;
  activeProcess: { kill: (signal?: string) => void } | null;
  tempMcpConfig: TempMcpConfig | null;
  tempPromptFile: string | null;
};

class SessionManager {
  private sessions = new Map<string, ActiveSession>();
  private adapters = new Map<CliProvider, ProviderAdapter>();
  private sessionCounter = 0;

  constructor() {
    for (const adapter of [
      getClaudeAdapter(),
      getGeminiAdapter(),
      getCodexAdapter(),
      getCopilotAdapter(),
    ]) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  getAdapter(providerId: CliProvider): ProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${providerId}`);
    }
    return adapter;
  }

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  async createSession(
    sdk: BackendSDK,
    providerId: CliProvider,
    chatId: string,
    settings: Settings
  ): Promise<string> {
    // Reuse existing running session for this chat + provider
    for (const [id, session] of this.sessions) {
      if (
        session.chatId === chatId &&
        session.providerId === providerId &&
        session.state === "running"
      ) {
        return id;
      }
    }

    // Verify provider is available
    const adapter = this.getAdapter(providerId);
    const providerConfig = settings.providers[providerId];
    if (!providerConfig) {
      throw new Error(`Provider "${providerId}" not configured`);
    }
    const availability = adapter.detectAvailability(providerConfig);
    if (!availability.available) {
      throw new Error(
        `Provider "${providerId}" not available: ${availability.error}`
      );
    }

    const sessionId = `drift-${++this.sessionCounter}-${Date.now()}`;
    const session: ActiveSession = {
      sessionId,
      chatId,
      providerId,
      cliSessionId: null,
      state: "running",
      activeProcess: null,
      tempMcpConfig: null,
      tempPromptFile: null,
    };
    this.sessions.set(sessionId, session);

    sdk.api.send("cli-session-state", { sessionId, state: "running" });
    return sessionId;
  }

  async sendMessage(
    sdk: BackendSDK,
    input: SendCliMessageInput,
    settings: Settings
  ): Promise<string> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const adapter = this.getAdapter(session.providerId);
    const providerConfig = settings.providers[session.providerId];
    if (!providerConfig) {
      throw new Error(`Provider not configured: ${session.providerId}`);
    }

    // Resolve command to absolute path
    const resolvedPath = resolveCommand(
      providerConfig.command,
      buildEnhancedPath()
    );
    if (!resolvedPath) {
      throw new Error(
        `Command "${providerConfig.command}" not found in PATH`
      );
    }

    // Build prompt with context
    const context = input.httpContext
      ? { method: "", url: "", headers: input.httpContext, body: "" }
      : null;
    const prompt = adapter.buildPrompt(input.text, input.history, context);

    // Bootstrap MCP config if server is running and no config yet
    const mcpServer = getMcpServer();
    if (mcpServer.isRunning() && !session.tempMcpConfig) {
      try {
        session.tempMcpConfig = adapter.bootstrapMcpConfig(
          settings.mcp,
          mcpServer.getToken()
        );
      } catch {
        // MCP bootstrap failed, continue without MCP
      }
    }

    // Generate session ID for Claude on first message
    const isFirstMessage = session.cliSessionId === null;
    if (isFirstMessage && adapter.supportsResume) {
      session.cliSessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    // Build command with resolved path
    const command = adapter.buildCommand({
      command: resolvedPath,
      text: prompt,
      cliSessionId: session.cliSessionId,
      isFirstMessage,
      tempMcpConfig: session.tempMcpConfig,
    });

    // For first message with Claude, append --session-id
    if (isFirstMessage && adapter.supportsResume && session.cliSessionId) {
      command.push("--session-id", session.cliSessionId);
    }

    // Build environment with MCP env vars
    const env = {
      ...adapter.buildEnvironment(settings.mcp.enabled ? settings.mcp : null),
      ...(session.tempMcpConfig?.envVars ?? {}),
    };

    // Handle large prompts via temp file
    let stdinText = prompt;
    let tempPromptFile: string | null = null;

    if (prompt.length > LARGE_PROMPT_THRESHOLD) {
      try {
        const tempDir = mkdtempSync(join(tmpdir(), "drift-prompt-"));
        tempPromptFile = join(tempDir, "prompt.txt");
        writeFileSync(tempPromptFile, prompt, { mode: 0o600 });
        stdinText = `Please process the instructions in: ${tempPromptFile}`;
        session.tempPromptFile = tempPromptFile;
      } catch {
        // Fall back to sending via stdin if temp file fails
        stdinText = prompt;
        tempPromptFile = null;
      }
    }

    // Spawn process
    const { spawn } = await import("child_process");
    const [cmd, ...args] = command;

    return new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let proc: any;
      try {
        proc = spawn(cmd!, args, {
          env: { ...process.env, ...env },
          cwd: process.env["HOME"] ?? "/tmp",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        session.state = "error";
        session.error = `Failed to spawn CLI: ${(err as Error).message}`;
        reject(new Error(session.error));
        return;
      }

      session.activeProcess = proc;
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, settings.processTimeoutSeconds * 1000);

      proc.stdout?.on("data", (chunk: Buffer) => {
        const raw = chunk.toString();
        const cleaned = stripAnsiCodes(raw);
        stdout += raw;
        if (cleaned.length > 0) {
          sdk.api.send("cli-output-chunk", {
            sessionId: input.sessionId,
            delta: cleaned,
            stream: "stdout",
          });
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        const raw = chunk.toString();
        const cleaned = stripAnsiCodes(raw);
        stderr += raw;
        if (cleaned.length > 0) {
          sdk.api.send("cli-output-chunk", {
            sessionId: input.sessionId,
            delta: cleaned,
            stream: "stderr",
          });
        }
      });

      // Write prompt to stdin
      if (proc.stdin) {
        proc.stdin.write(stdinText);
        proc.stdin.write("\n");
        proc.stdin.end();
      }

      proc.on("close", (code) => {
        clearTimeout(timeout);
        session.activeProcess = null;
        cleanupTempFiles();

        if (timedOut) {
          session.state = "error";
          session.error = `Process timed out after ${settings.processTimeoutSeconds}s`;
          sdk.api.send("cli-session-state", {
            sessionId: input.sessionId,
            state: "error",
            error: session.error,
          });
          reject(new Error(session.error));
          return;
        }

        // Parse output through adapter
        const parsed = adapter.parseOutput(stdout, stdinText);

        // Update resume state
        const resumeState = adapter.extractResumeState(
          code,
          session.cliSessionId
        );
        if (resumeState) {
          session.cliSessionId = resumeState.cliSessionId;
        }

        if (code !== 0 && code !== null) {
          const cleanStderr = stripAnsiCodes(stderr).trim();
          session.error = cleanStderr || `CLI exited with code ${code}`;
          // Return whatever output we got, even on error
          resolve(parsed || session.error);
        } else {
          session.state = "running";
          resolve(parsed);
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        session.activeProcess = null;
        cleanupTempFiles();
        session.state = "error";
        session.error = err.message;
        sdk.api.send("cli-session-state", {
          sessionId: input.sessionId,
          state: "error",
          error: err.message,
        });
        reject(err);
      });

      function cleanupTempFiles() {
        if (tempPromptFile) {
          try {
            const dir = dirname(tempPromptFile);
            rmSync(dir, { recursive: true, force: true });
          } catch {
            // best effort
          }
          session.tempPromptFile = null;
        }
      }
    });
  }

  cancelMessage(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.activeProcess) return;

    try {
      session.activeProcess.kill("SIGTERM");
      // Force kill after 3 seconds
      setTimeout(() => {
        try {
          session.activeProcess?.kill("SIGKILL");
        } catch {
          // already dead
        }
      }, 3000);
    } catch {
      // process already gone
    }
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Kill active process
    this.cancelMessage(sessionId);

    // Cleanup adapter temp config
    const adapter = this.adapters.get(session.providerId);
    adapter?.cleanup(session.tempMcpConfig);

    // Cleanup prompt temp file
    if (session.tempPromptFile) {
      try {
        const dir = dirname(session.tempPromptFile);
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }

    session.state = "stopped";
    this.sessions.delete(sessionId);
  }

  getSessionState(sessionId: string): CliSessionStateEvent {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { sessionId, state: "stopped" };
    }
    return {
      sessionId: session.sessionId,
      state: session.state,
      error: session.error,
    };
  }

  getChatCliSessionId(chatId: string, providerId: CliProvider): string | null {
    for (const session of this.sessions.values()) {
      if (session.chatId === chatId && session.providerId === providerId) {
        return session.cliSessionId;
      }
    }
    return null;
  }

  checkAllProviders(settings: Settings): ProviderStatus[] {
    const allProviders: CliProvider[] = [
      CliProviderEnum.Claude,
      CliProviderEnum.Gemini,
      CliProviderEnum.Codex,
      CliProviderEnum.Copilot,
    ];
    return allProviders.map((id) => this.checkProvider(id, settings));
  }

  checkProvider(
    providerId: CliProvider,
    settings: Settings
  ): ProviderStatus {
    const adapter = this.adapters.get(providerId);
    const config = settings.providers[providerId];

    if (!adapter) {
      return {
        id: providerId,
        available: false,
        error: "Adapter not loaded yet",
      };
    }
    if (!config) {
      return {
        id: providerId,
        available: false,
        error: "Provider not configured",
      };
    }

    const result = adapter.detectAvailability(config);
    return {
      id: providerId,
      available: result.available,
      resolvedPath: result.resolvedPath,
      error: result.error,
    };
  }
}

let _manager: SessionManager | undefined;

export function getSessionManager(): SessionManager {
  if (!_manager) {
    _manager = new SessionManager();
  }
  return _manager;
}
