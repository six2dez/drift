import { CliProvider } from "./cli-providers";
import {
  DEFAULT_MCP_PERMISSION_SETTINGS,
  type McpPermissionSettings,
} from "./mcp";

export type CaidoApiConfig = {
  url: string;
};

export type McpConfig = {
  enabled: boolean;
  port: number;
  host: string;
};

export type Settings = {
  providers: Record<string, { command: string; enabled: boolean }>;
  activeProvider: string;
  caidoApi: CaidoApiConfig;
  mcp: McpConfig;
  mcpPermissions: McpPermissionSettings;
  maxHistoryMessages: number;
  maxHistoryChars: number;
  processTimeoutSeconds: number;
  debugLogging: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  providers: {
    [CliProvider.Claude]: { command: "claude", enabled: true },
    [CliProvider.Gemini]: { command: "gemini", enabled: true },
    [CliProvider.Codex]: { command: "codex", enabled: true },
    [CliProvider.Copilot]: { command: "copilot", enabled: true },
  },
  activeProvider: CliProvider.Claude,
  caidoApi: { url: "http://localhost:8080" },
  mcp: { enabled: true, port: 9877, host: "127.0.0.1" },
  mcpPermissions: {
    enabledGroups: { ...DEFAULT_MCP_PERMISSION_SETTINGS.enabledGroups },
    confirmSensitiveActions: DEFAULT_MCP_PERMISSION_SETTINGS.confirmSensitiveActions,
  },
  maxHistoryMessages: 10,
  maxHistoryChars: 20000,
  processTimeoutSeconds: 120,
  debugLogging: false,
};
