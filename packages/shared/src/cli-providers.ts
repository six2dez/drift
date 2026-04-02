import { z } from "zod";

export const CliProvider = {
  Claude: "claude-cli",
  Gemini: "gemini-cli",
  Codex: "codex-cli",
  Copilot: "copilot-cli",
} as const;

export type CliProvider = (typeof CliProvider)[keyof typeof CliProvider];

export const CliProviderSchema = z.enum([
  CliProvider.Claude,
  CliProvider.Gemini,
  CliProvider.Codex,
  CliProvider.Copilot,
]);

export const CLI_PROVIDER_DISPLAY_NAMES: Record<CliProvider, string> = {
  [CliProvider.Claude]: "Claude Code",
  [CliProvider.Gemini]: "Gemini CLI",
  [CliProvider.Codex]: "Codex CLI",
  [CliProvider.Copilot]: "Copilot CLI (experimental)",
};

export const CLI_PROVIDER_DEFAULT_COMMANDS: Record<CliProvider, string> = {
  [CliProvider.Claude]: "claude",
  [CliProvider.Gemini]: "gemini",
  [CliProvider.Codex]: "codex",
  [CliProvider.Copilot]: "copilot",
};

export const ProviderConfigSchema = z.object({
  command: z.string().min(1),
  enabled: z.boolean(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderStatusSchema = z.object({
  id: CliProviderSchema,
  available: z.boolean(),
  resolvedPath: z.string().optional(),
  error: z.string().optional(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export type AvailabilityResult = {
  available: boolean;
  resolvedPath?: string;
  error?: string;
};

export type ResumeState = {
  cliSessionId: string;
};
