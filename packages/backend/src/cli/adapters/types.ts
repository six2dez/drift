import type {
  AvailabilityResult,
  ChatMessage,
  CliProvider,
  McpConfig,
  ProviderConfig,
  ResumeState,
  TempMcpConfig,
} from "shared";

export type BuildCommandInput = {
  command: string;
  text: string;
  cliSessionId: string | null;
  isFirstMessage: boolean;
  tempMcpConfig: TempMcpConfig | null;
};

export type RequestContext = {
  method: string;
  url: string;
  headers: string;
  body: string;
};

export interface ProviderAdapter {
  readonly id: CliProvider;
  readonly displayName: string;
  readonly supportsResume: boolean;

  detectAvailability(config: ProviderConfig): AvailabilityResult;

  buildCommand(input: BuildCommandInput): string[];

  buildEnvironment(mcpConfig: McpConfig | null): Record<string, string>;

  bootstrapMcpConfig(mcpConfig: McpConfig, token: string): TempMcpConfig;

  buildPrompt(
    text: string,
    history: ChatMessage[],
    context: RequestContext | null
  ): string;

  parseOutput(stdout: string, prompt: string): string;

  extractResumeState(
    processExitCode: number | null,
    cliSessionId: string | null
  ): ResumeState | null;

  cleanup(tempConfig: TempMcpConfig | null): void;
}
