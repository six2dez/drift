import { CliProvider } from "./cli-providers";

export type CaidoApiConfig = {
  url: string;
  token: string;
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
  maxHistoryMessages: number;
  maxHistoryChars: number;
  processTimeoutSeconds: number;
};

export const DEFAULT_SETTINGS: Settings = {
  providers: {
    [CliProvider.Claude]: { command: "claude", enabled: true },
    [CliProvider.Gemini]: { command: "gemini", enabled: true },
    [CliProvider.Codex]: { command: "codex", enabled: true },
    [CliProvider.Copilot]: { command: "copilot", enabled: true },
  },
  activeProvider: CliProvider.Claude,
  caidoApi: { url: "http://localhost:8080", token: "" },
  mcp: { enabled: true, port: 9877, host: "127.0.0.1" },
  maxHistoryMessages: 10,
  maxHistoryChars: 20000,
  processTimeoutSeconds: 120,
};
