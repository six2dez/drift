export const CliProvider = {
  Claude: "claude-cli",
  Gemini: "gemini-cli",
  Codex: "codex-cli",
  Copilot: "copilot-cli",
} as const;

export type CliProvider = (typeof CliProvider)[keyof typeof CliProvider];

export const CLI_PROVIDER_DISPLAY_NAMES: Record<CliProvider, string> = {
  [CliProvider.Claude]: "Claude Code",
  [CliProvider.Gemini]: "Gemini CLI",
  [CliProvider.Codex]: "Codex CLI",
  [CliProvider.Copilot]: "Copilot CLI",
};

export const CLI_PROVIDER_DEFAULT_COMMANDS: Record<CliProvider, string> = {
  [CliProvider.Claude]: "claude",
  [CliProvider.Gemini]: "gemini",
  [CliProvider.Codex]: "codex",
  [CliProvider.Copilot]: "copilot",
};

export type ProviderConfig = {
  command: string;
  enabled: boolean;
};

export type ProviderStatus = {
  id: string;
  available: boolean;
  resolvedPath?: string;
  error?: string;
};
