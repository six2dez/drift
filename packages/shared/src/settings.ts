import { z } from "zod";

import { CliProvider, ProviderConfigSchema } from "./cli-providers";

export const CaidoApiConfigSchema = z.object({
  url: z.string().default("http://localhost:8080"),
  token: z.string().default(""),
});
export type CaidoApiConfig = z.infer<typeof CaidoApiConfigSchema>;

export const McpConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().min(1024).max(65535).default(9877),
  host: z.string().default("127.0.0.1"),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

export const SettingsSchema = z.object({
  providers: z.record(z.string(), ProviderConfigSchema).default(() => ({
    [CliProvider.Claude]: { command: "claude", enabled: true },
    [CliProvider.Gemini]: { command: "gemini", enabled: true },
    [CliProvider.Codex]: { command: "codex", enabled: true },
    [CliProvider.Copilot]: { command: "copilot", enabled: true },
  })),
  activeProvider: z.string().default(CliProvider.Claude),
  caidoApi: CaidoApiConfigSchema.default({}),
  mcp: McpConfigSchema.default({}),
  maxHistoryMessages: z.number().int().min(1).max(50).default(10),
  maxHistoryChars: z.number().int().min(1000).max(100000).default(20000),
  processTimeoutSeconds: z.number().int().min(10).max(600).default(120),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const UpdateSettingsSchema = SettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
