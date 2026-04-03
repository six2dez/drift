import type { DefineAPI, SDK, DefineEvents } from "caido:plugin";
import { readFile, writeFile } from "fs/promises";
import path from "path";

// === Inline types (avoid Zod import) ===

type ProviderConfig = { command: string; enabled: boolean };
type CaidoApiConfig = { url: string; token: string };
type McpConfig = { enabled: boolean; port: number; host: string };

type Settings = {
  providers: Record<string, ProviderConfig>;
  activeProvider: string;
  caidoApi: CaidoApiConfig;
  mcp: McpConfig;
  maxHistoryMessages: number;
  maxHistoryChars: number;
  processTimeoutSeconds: number;
};

type ProviderStatus = {
  id: string;
  available: boolean;
  resolvedPath?: string;
  error?: string;
};

type McpServerInfo = {
  running: boolean;
  host: string;
  port: number;
  token: string;
  toolCount: number;
  url: string;
};

type StoredChat = {
  id: string;
  title: string;
  messages: unknown[];
  providerId: string;
  cliSessionId: string | null;
  createdAt: number;
  updatedAt: number;
};

type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> { return { kind: "Ok", value }; }
function err<T>(error: string): Result<T> { return { kind: "Error", error }; }

// === Default settings ===

const DEFAULT_SETTINGS: Settings = {
  providers: {
    "claude-cli": { command: "claude", enabled: true },
    "gemini-cli": { command: "gemini", enabled: true },
    "codex-cli": { command: "codex", enabled: true },
    "copilot-cli": { command: "copilot", enabled: true },
  },
  activeProvider: "claude-cli",
  caidoApi: { url: "http://localhost:8080", token: "" },
  mcp: { enabled: true, port: 9877, host: "127.0.0.1" },
  maxHistoryMessages: 10,
  maxHistoryChars: 20000,
  processTimeoutSeconds: 120,
};

// === Simple persistence ===

let pluginPath = "";
let currentSettings: Settings = { ...DEFAULT_SETTINGS };
let currentChats: StoredChat[] = [];

async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    const filePath = path.join(pluginPath, `${filename}.json`);
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

async function saveJson(filename: string, data: unknown): Promise<void> {
  try {
    const filePath = path.join(pluginPath, `${filename}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2));
  } catch {
    // Persistence failed silently
  }
}

// === CLI availability check ===

function checkCliAvailability(command: string): ProviderStatus & { id: string } {
  try {
    const { existsSync, accessSync, constants } = require("fs");
    const { join } = require("path");

    // Build enhanced PATH
    const home = process.env["HOME"] ?? "";
    const extraDirs = [
      `${home}/.local/bin`, `${home}/bin`, "/opt/homebrew/bin",
      "/usr/local/bin", `${home}/.cargo/bin`,
    ];
    const pathEnv = [...extraDirs, ...(process.env["PATH"] ?? "").split(":")].filter(Boolean);

    // If absolute path
    if (command.startsWith("/")) {
      if (existsSync(command)) {
        return { id: "", available: true, resolvedPath: command };
      }
      return { id: "", available: false, error: `Not found: ${command}` };
    }

    // Search PATH
    for (const dir of pathEnv) {
      const candidate = join(dir, command);
      try {
        if (existsSync(candidate)) {
          accessSync(candidate, constants.X_OK);
          return { id: "", available: true, resolvedPath: candidate };
        }
      } catch { continue; }
    }

    return { id: "", available: false, error: `"${command}" not found in PATH` };
  } catch (e) {
    return { id: "", available: false, error: String(e) };
  }
}

// === API functions ===

type BackendEvents = DefineEvents<{
  "cli-output-chunk": (data: { sessionId: string; delta: string; stream: "stdout" | "stderr" }) => void;
  "cli-session-state": (data: { sessionId: string; state: string; error?: string }) => void;
  "mcp-status": (data: { running: boolean; port: number; toolCount: number }) => void;
}>;

type BackendSDK = SDK<API, BackendEvents>;

function getSettings(_sdk: BackendSDK): Result<Settings> {
  return ok(currentSettings);
}

async function updateSettings(_sdk: BackendSDK, input: Partial<Settings>): Promise<Result<Settings>> {
  currentSettings = { ...currentSettings, ...input };
  await saveJson("settings", currentSettings);
  return ok(currentSettings);
}

function getProviderStatuses(_sdk: BackendSDK): Result<ProviderStatus[]> {
  const providers = ["claude-cli", "gemini-cli", "codex-cli", "copilot-cli"];
  const statuses = providers.map((id) => {
    const config = currentSettings.providers[id];
    if (!config?.enabled || !config?.command) {
      return { id, available: false, error: "Disabled" };
    }
    const result = checkCliAvailability(config.command);
    return { ...result, id };
  });
  return ok(statuses);
}

function checkProviderAvailability(_sdk: BackendSDK, providerId: string): Result<ProviderStatus> {
  const config = currentSettings.providers[providerId];
  if (!config?.enabled || !config?.command) {
    return ok({ id: providerId, available: false, error: "Disabled" });
  }
  const result = checkCliAvailability(config.command);
  return ok({ ...result, id: providerId });
}

function getMcpStatus(_sdk: BackendSDK): Result<McpServerInfo> {
  return ok({ running: false, host: "127.0.0.1", port: 9877, token: "", toolCount: 0, url: "" });
}

async function startMcpServer(_sdk: BackendSDK): Promise<Result<McpServerInfo>> {
  return err("MCP server not yet available in this build");
}

function stopMcpServer(_sdk: BackendSDK): Result<void> {
  return ok(undefined);
}

// Chat persistence
function getChat(_sdk: BackendSDK, chatId: string): Result<StoredChat | undefined> {
  return ok(currentChats.find((c) => c.id === chatId));
}

function getChats(_sdk: BackendSDK): Result<StoredChat[]> {
  return ok(currentChats);
}

async function saveChat(_sdk: BackendSDK, chat: StoredChat): Promise<Result<void>> {
  const idx = currentChats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) { currentChats[idx] = chat; } else { currentChats.push(chat); }
  await saveJson("chats", currentChats);
  return ok(undefined);
}

async function deleteChat(_sdk: BackendSDK, chatId: string): Promise<Result<void>> {
  currentChats = currentChats.filter((c) => c.id !== chatId);
  await saveJson("chats", currentChats);
  return ok(undefined);
}

// CLI session stubs (will be implemented properly once backend loads)
async function createCliSession(sdk: BackendSDK, input: { providerId: string; chatId: string }): Promise<Result<string>> {
  const config = currentSettings.providers[input.providerId];
  if (!config?.command) return err(`Provider ${input.providerId} not configured`);

  const avail = checkCliAvailability(config.command);
  if (!avail.available) return err(`CLI not found: ${config.command}. ${avail.error ?? ""}`);

  const sessionId = `drift-${Date.now()}`;
  return ok(sessionId);
}

async function sendCliMessage(sdk: BackendSDK, input: { sessionId: string; chatId: string; text: string; history?: unknown[]; httpContext?: string }): Promise<Result<string>> {
  try {
    const { spawn } = await import("child_process");

    // Find the provider from settings
    const chat = currentChats.find(c => c.id === input.chatId);
    const providerId = (chat as { providerId?: string } | undefined)?.providerId ?? currentSettings.activeProvider;
    const config = currentSettings.providers[providerId];
    if (!config?.command) return err("Provider not configured");

    const avail = checkCliAvailability(config.command);
    if (!avail.available || !avail.resolvedPath) return err(`CLI not found: ${config.command}`);

    // Build command based on provider
    const cmd = avail.resolvedPath;
    let args: string[];
    switch (providerId) {
      case "claude-cli":
        args = ["-p"];
        break;
      case "gemini-cli":
        args = ["--output-format", "text", "-p", "."];
        break;
      case "codex-cli":
        args = ["exec", "--color", "never", "-"];
        break;
      case "copilot-cli":
        args = ["-p", "--quiet"];
        break;
      default:
        args = [];
    }

    // Build environment
    const home = process.env["HOME"] ?? "";
    const extraPath = [
      `${home}/.local/bin`, `${home}/bin`, "/opt/homebrew/bin", "/usr/local/bin",
    ].join(":");
    const env = {
      ...process.env,
      PATH: `${extraPath}:${process.env["PATH"] ?? ""}`,
      CI: "1", NO_COLOR: "1", TERM: "dumb", FORCE_COLOR: "0",
    };

    return new Promise<Result<string>>((resolve) => {
      const proc = spawn(cmd, args, {
        env,
        cwd: home || "/tmp",
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve(err("Process timed out"));
      }, currentSettings.processTimeoutSeconds * 1000);

      proc.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        sdk.api.send("cli-output-chunk", {
          sessionId: input.sessionId,
          delta: text,
          stream: "stdout",
        });
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.stdin?.write(input.text + "\n");
      proc.stdin?.end();

      proc.on("close", (code) => {
        clearTimeout(timeout);
        const output = stdout.trim() || stderr.trim() || `(exit code: ${code})`;
        resolve(ok(output));
      });

      proc.on("error", (e) => {
        clearTimeout(timeout);
        resolve(err(`Spawn error: ${e.message}`));
      });
    });
  } catch (e) {
    return err(`sendCliMessage failed: ${String(e)}`);
  }
}

function cancelCliMessage(_sdk: BackendSDK, _sessionId: string): Result<void> {
  return ok(undefined);
}

function closeCliSession(_sdk: BackendSDK, _input: { sessionId: string }): Result<void> {
  return ok(undefined);
}

function getCliSessionState(_sdk: BackendSDK, sessionId: string): Result<{ sessionId: string; state: string }> {
  return ok({ sessionId, state: "running" });
}

// === API type and init ===

export type API = DefineAPI<{
  getSettings: typeof getSettings;
  updateSettings: typeof updateSettings;
  getProviderStatuses: typeof getProviderStatuses;
  checkProviderAvailability: typeof checkProviderAvailability;
  getMcpStatus: typeof getMcpStatus;
  startMcpServer: typeof startMcpServer;
  stopMcpServer: typeof stopMcpServer;
  getChat: typeof getChat;
  getChats: typeof getChats;
  saveChat: typeof saveChat;
  deleteChat: typeof deleteChat;
  createCliSession: typeof createCliSession;
  sendCliMessage: typeof sendCliMessage;
  cancelCliMessage: typeof cancelCliMessage;
  closeCliSession: typeof closeCliSession;
  getCliSessionState: typeof getCliSessionState;
}>;

export type BackendEventsExport = BackendEvents;

export function init(sdk: SDK<API, BackendEvents>) {
  pluginPath = sdk.meta.path();

  // Load persisted data
  loadJson<Settings>("settings", DEFAULT_SETTINGS).then((s) => { currentSettings = s; });
  loadJson<StoredChat[]>("chats", []).then((c) => { currentChats = c; });

  // Register APIs
  sdk.api.register("getSettings", getSettings);
  sdk.api.register("updateSettings", updateSettings);
  sdk.api.register("getProviderStatuses", getProviderStatuses);
  sdk.api.register("checkProviderAvailability", checkProviderAvailability);
  sdk.api.register("getMcpStatus", getMcpStatus);
  sdk.api.register("startMcpServer", startMcpServer);
  sdk.api.register("stopMcpServer", stopMcpServer);
  sdk.api.register("getChat", getChat);
  sdk.api.register("getChats", getChats);
  sdk.api.register("saveChat", saveChat);
  sdk.api.register("deleteChat", deleteChat);
  sdk.api.register("createCliSession", createCliSession);
  sdk.api.register("sendCliMessage", sendCliMessage);
  sdk.api.register("cancelCliMessage", cancelCliMessage);
  sdk.api.register("closeCliSession", closeCliSession);
  sdk.api.register("getCliSessionState", getCliSessionState);
}
