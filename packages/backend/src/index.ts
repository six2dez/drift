import type { DefineAPI, SDK, DefineEvents } from "caido:plugin";
import { readFile, writeFile, stat, mkdir, rm } from "fs/promises";
import { spawn } from "child_process";
import path from "path";

// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────

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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  providerId: string;
};

type StoredChat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  providerId: string;
  cliSessionId: string | null;
  createdAt: number;
  updatedAt: number;
};

type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> {
  return { kind: "Ok", value };
}
function err<T>(error: string): Result<T> {
  return { kind: "Error", error };
}

// ── Defaults ────────────────────────────────────────────────────────

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

// ── State ───────────────────────────────────────────────────────────

let pluginPath = "";
let assetsPath = "";
let currentSettings: Settings = { ...DEFAULT_SETTINGS };
let currentChats: StoredChat[] = [];
const cliSessions = new Map<string, string>();        // chatId → cliSessionId (resume)
const activeProcesses = new Map<string, { kill: (s?: string) => boolean }>(); // sessionId → ChildProcess
const sessionStates = new Map<string, "starting" | "running" | "stopped" | "error">();
let mcpTempDir: string | undefined;

// ── Persistence ─────────────────────────────────────────────────────

async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  try {
    const data = await readFile(path.join(pluginPath, `${filename}.json`), "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

async function saveJson(filename: string, data: unknown): Promise<void> {
  try {
    await writeFile(path.join(pluginPath, `${filename}.json`), JSON.stringify(data, null, 2));
  } catch {
    // silent
  }
}

// ── Async helpers ───────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function writeTemp(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const fp = path.join(dir, name);
  await writeFile(fp, content);
  return fp;
}

/** Generate UUID v4 without crypto module */
function genUUID(): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4"; // version 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 | 8)]; // variant
    } else {
      uuid += hex[(Math.random() * 16 | 0)];
    }
  }
  return uuid;
}

// ── CLI resolution (async via `which`) ──────────────────────────────

function resolveCommand(command: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("which", [command]);
    let out = "";
    child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    child.on("close", (code) => {
      resolve(code === 0 && out.trim() !== "" ? out.trim() : undefined);
    });
    child.on("error", () => resolve(undefined));
  });
}

async function checkProvider(id: string): Promise<ProviderStatus> {
  const config = currentSettings.providers[id];
  if (!config?.enabled || !config?.command) {
    return { id, available: false, error: "Disabled" };
  }
  const resolved = await resolveCommand(config.command);
  if (resolved === undefined) {
    return { id, available: false, error: `"${config.command}" not found in PATH` };
  }
  return { id, available: true, resolvedPath: resolved };
}

// ── Events ──────────────────────────────────────────────────────────

type BackendEvents = DefineEvents<{
  "cli-output-chunk": (data: {
    sessionId: string;
    delta: string;
    stream: "stdout" | "stderr";
  }) => void;
  "cli-session-state": (data: {
    sessionId: string;
    state: string;
    error?: string;
  }) => void;
  "mcp-status": (data: {
    running: boolean;
    port: number;
    toolCount: number;
  }) => void;
}>;

type BackendSDK = SDK<API, BackendEvents>;

// ── API: Settings ───────────────────────────────────────────────────

function getSettings(_sdk: BackendSDK): Result<Settings> {
  return ok(currentSettings);
}

async function updateSettings(
  _sdk: BackendSDK,
  input: Partial<Settings>
): Promise<Result<Settings>> {
  currentSettings = { ...currentSettings, ...input };
  await saveJson("settings", currentSettings);
  return ok(currentSettings);
}

// ── API: Providers ──────────────────────────────────────────────────

async function getProviderStatuses(_sdk: BackendSDK): Promise<Result<ProviderStatus[]>> {
  const ids = ["claude-cli", "gemini-cli", "codex-cli", "copilot-cli"];
  const statuses = await Promise.all(ids.map(checkProvider));
  return ok(statuses);
}

async function checkProviderAvailability(
  _sdk: BackendSDK,
  providerId: string
): Promise<Result<ProviderStatus>> {
  return ok(await checkProvider(providerId));
}

// ── API: MCP ────────────────────────────────────────────────────────

function getMcpStatus(_sdk: BackendSDK): Result<McpServerInfo> {
  const ready = mcpTempDir !== undefined;
  return ok({
    running: ready,
    host: currentSettings.mcp.host,
    port: currentSettings.mcp.port,
    token: "",
    toolCount: ready ? 14 : 0,
    url: ready ? `stdio://${assetsPath}/mcp-server.mjs` : "",
  });
}

async function startMcpServer(sdk: BackendSDK): Promise<Result<McpServerInfo>> {
  // Check prerequisites
  if (!currentSettings.caidoApi.token) {
    return err("Caido API token not configured. Set it in Settings > Caido API.");
  }

  // Check if MCP server asset exists
  const mcpScript = path.join(assetsPath, "mcp-server.mjs");
  if (!(await fileExists(mcpScript))) {
    return err("MCP server script not found in plugin assets.");
  }

  // Create temp dir for MCP configs
  mcpTempDir = path.join(pluginPath, "mcp-tmp-" + genUUID());
  await mkdir(mcpTempDir, { recursive: true });

  sdk.console.log(`[drift] MCP ready. Script: ${mcpScript}, temp: ${mcpTempDir}`);
  sdk.api.send("mcp-status", { running: true, port: 0, toolCount: 14 });

  return ok({
    running: true,
    host: currentSettings.mcp.host,
    port: 0,
    token: "",
    toolCount: 14,
    url: `stdio://${mcpScript}`,
  });
}

async function stopMcpServer(sdk: BackendSDK): Promise<Result<void>> {
  if (mcpTempDir !== undefined) {
    try { await rm(mcpTempDir, { recursive: true, force: true }); } catch { /* silent */ }
    mcpTempDir = undefined;
  }
  sdk.api.send("mcp-status", { running: false, port: 0, toolCount: 0 });
  return ok(undefined);
}

// ── API: Chats ──────────────────────────────────────────────────────

function getChat(_sdk: BackendSDK, chatId: string): Result<StoredChat | undefined> {
  return ok(currentChats.find((c) => c.id === chatId));
}

function getChats(_sdk: BackendSDK): Result<StoredChat[]> {
  return ok(currentChats);
}

async function saveChat(_sdk: BackendSDK, chat: StoredChat): Promise<Result<void>> {
  const idx = currentChats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) {
    currentChats[idx] = chat;
  } else {
    currentChats.push(chat);
  }
  await saveJson("chats", currentChats);
  return ok(undefined);
}

async function deleteChat(_sdk: BackendSDK, chatId: string): Promise<Result<void>> {
  currentChats = currentChats.filter((c) => c.id !== chatId);
  cliSessions.delete(chatId);
  await saveJson("chats", currentChats);
  return ok(undefined);
}

// ── API: CLI Sessions ───────────────────────────────────────────────

async function createCliSession(
  sdk: BackendSDK,
  input: { providerId: string; chatId: string }
): Promise<Result<string>> {
  const status = await checkProvider(input.providerId);
  if (!status.available) {
    return err(`CLI not found: ${status.error}`);
  }

  const sessionId = `drift-${Date.now()}`;
  sdk.console.log(`[drift] session created: ${sessionId} for ${input.providerId}`);
  return ok(sessionId);
}

async function sendCliMessage(
  sdk: BackendSDK,
  input: {
    sessionId: string;
    chatId: string;
    text: string;
    history?: ChatMessage[];
    httpContext?: string;
  }
): Promise<Result<string>> {
  try {
    const chat = currentChats.find((c) => c.id === input.chatId);
    const providerId =
      chat?.providerId ?? currentSettings.activeProvider;
    const config = currentSettings.providers[providerId];
    if (!config?.command) return err("Provider not configured");

    const resolved = await resolveCommand(config.command);
    if (resolved === undefined) return err(`CLI not found: ${config.command}`);

    // Check if first message BEFORE setting session (for system prompt injection)
    const isFirstMsg = !cliSessions.has(input.chatId);

    // ── Build args per provider ──
    const args: string[] = [];

    switch (providerId) {
      case "claude-cli": {
        args.push("-p");

        // Session resume
        let sid = cliSessions.get(input.chatId);
        if (sid !== undefined) {
          args.push("--resume", sid);
        } else {
          sid = genUUID();
          args.push("--session-id", sid);
          cliSessions.set(input.chatId, sid);
        }

        // MCP config (write once per chat, reuse on subsequent messages)
        if (mcpTempDir !== undefined) {
          const mcpScript = path.join(assetsPath, "mcp-server.mjs");
          const cfgFile = path.join(mcpTempDir, `mcp-${input.chatId}.json`);
          if (!(await fileExists(cfgFile)) && await fileExists(mcpScript)) {
            await writeTemp(mcpTempDir, `mcp-${input.chatId}.json`, JSON.stringify({
              mcpServers: {
                drift: {
                  type: "stdio",
                  command: "node",
                  args: [mcpScript],
                  env: {
                    CAIDO_URL: currentSettings.caidoApi.url,
                    CAIDO_TOKEN: currentSettings.caidoApi.token,
                  },
                },
              },
            }, null, 2));
          }
          if (await fileExists(cfgFile)) {
            args.push("--mcp-config", cfgFile);
          }
        }
        break;
      }
      case "gemini-cli":
        args.push("--output-format", "text", "-p", ".");
        break;
      case "codex-cli":
        args.push("exec", "--color", "never", "-");
        break;
      case "copilot-cli":
        args.push("-p", "--quiet");
        break;
    }

    // ── Build prompt with context ──
    let prompt = "";

    // Add provider-specific system prompt (first message or stateless providers)
    if (isFirstMsg || providerId !== "claude-cli") {
      switch (providerId) {
        case "claude-cli":
          prompt += "You are a security assistant integrated with Caido (a web security proxy). ";
          if (mcpTempDir !== undefined) {
            prompt += "You have MCP tools connected to this Caido instance. When the user asks about HTTP requests, traffic, or security testing, USE the MCP tools directly - do not say you cannot access them. Available tools: search_history (search HTTP traffic with HTTPQL filters), get_request (get full raw request/response by ID), send_request (replay HTTP requests), create_finding (report vulnerabilities), list_findings, get_scope, check_scope, get_environment, set_environment, create_replay_session, intercept_status, intercept_pause, intercept_resume, run_workflow. For example, to get the last 5 requests, call search_history with no filter and limit 5. ";
          }
          break;
        case "gemini-cli":
          prompt += "You are a security assistant. The user is working with Caido, a web security proxy. Help them analyze HTTP requests/responses, identify vulnerabilities, and suggest security improvements. ";
          break;
        case "codex-cli":
          prompt += "You are a security code assistant. The user is working with Caido for web security testing. Help them analyze requests, write exploit code, and identify vulnerabilities. ";
          break;
        case "copilot-cli":
          prompt += "You are a security assistant helping with web application security testing via Caido proxy. ";
          break;
      }
      prompt += "\n\n";
    }

    if (input.httpContext !== undefined && input.httpContext !== "") {
      prompt += `[Current HTTP Request/Response]\n${input.httpContext}\n\n`;
    }

    // For stateless providers, prepend truncated conversation history
    if (providerId !== "claude-cli" && input.history !== undefined && input.history.length > 0) {
      const maxMsgs = currentSettings.maxHistoryMessages;
      const maxChars = currentSettings.maxHistoryChars;
      const recent = input.history.slice(-maxMsgs);
      let historyText = "";
      let totalChars = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        const m = recent[i]!;
        const line = `${m.role}: ${m.content}\n`;
        if (totalChars + line.length > maxChars && historyText.length > 0) break;
        historyText = line + historyText;
        totalChars += line.length;
      }
      if (historyText.length > 0) {
        prompt += `[Conversation History]\n${historyText}\n`;
      }
    }

    prompt += input.text;

    // ── Spawn process ──
    sessionStates.set(input.sessionId, "running");
    return new Promise<Result<string>>((resolve) => {
      const proc = spawn(resolved, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Track for cancellation
      activeProcesses.set(input.sessionId, proc);

      let stdout = "";
      let stderr = "";

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        activeProcesses.delete(input.sessionId);
        sessionStates.set(input.sessionId, "error");
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
        const text = chunk.toString();
        stderr += text;
        // Stream stderr too so user sees warnings/errors in real-time
        sdk.api.send("cli-output-chunk", {
          sessionId: input.sessionId,
          delta: text,
          stream: "stderr",
        });
      });

      proc.stdin?.write(prompt + "\n");
      proc.stdin?.end();

      proc.on("close", (code) => {
        clearTimeout(timeout);
        activeProcesses.delete(input.sessionId);
        sessionStates.set(input.sessionId, "stopped");
        const output =
          stdout.trim() || stderr.trim() || `(exit code: ${code})`;
        resolve(ok(output));
      });

      proc.on("error", (e) => {
        clearTimeout(timeout);
        activeProcesses.delete(input.sessionId);
        sessionStates.set(input.sessionId, "error");
        resolve(err(`Spawn error: ${e.message}`));
      });
    });
  } catch (e) {
    return err(`sendCliMessage failed: ${String(e)}`);
  }
}

function cancelCliMessage(sdk: BackendSDK, sessionId: string): Result<void> {
  const proc = activeProcesses.get(sessionId);
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    }, 3000);
    activeProcesses.delete(sessionId);
    sessionStates.set(sessionId, "stopped");
    sdk.console.log(`[drift] cancelled session ${sessionId}`);
  }
  return ok(undefined);
}

function closeCliSession(
  sdk: BackendSDK,
  input: { sessionId: string }
): Result<void> {
  // Kill process if still running
  const proc = activeProcesses.get(input.sessionId);
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    activeProcesses.delete(input.sessionId);
  }
  sessionStates.delete(input.sessionId);
  sdk.console.log(`[drift] closed session ${input.sessionId}`);
  return ok(undefined);
}

function getCliSessionState(
  _sdk: BackendSDK,
  sessionId: string
): Result<{ sessionId: string; state: string }> {
  const state = sessionStates.get(sessionId) ?? "stopped";
  return ok({ sessionId, state });
}

// ── API type + init ─────────────────────────────────────────────────

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
  assetsPath = sdk.meta.assetsPath();
  sdk.console.log(`[drift] init — plugin: ${pluginPath}, assets: ${assetsPath}`);

  // Load persisted data
  loadJson<Settings>("settings", DEFAULT_SETTINGS).then((s) => {
    currentSettings = s;
    sdk.console.log("[drift] settings loaded");
  });
  loadJson<StoredChat[]>("chats", []).then((c) => {
    currentChats = c;
    sdk.console.log(`[drift] ${c.length} chats loaded`);
  });

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
