export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  providerId: string;
};

export type StoredChat = {
  id: string;
  title: string;
  messages: ChatMessage[];
  providerId: string;
  cliSessionId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CliOutputChunkEvent = {
  sessionId: string;
  delta: string;
  stream: "stdout" | "stderr";
};

export type CliSessionStateEvent = {
  sessionId: string;
  state: "starting" | "running" | "stopped" | "error";
  error?: string;
  exitCode?: number;
};

export type McpStatusEvent = {
  running: boolean;
  port: number;
  toolCount: number;
};

export type CreateCliSessionInput = {
  providerId: string;
  chatId: string;
};

export type SendCliMessageInput = {
  sessionId: string;
  chatId: string;
  text: string;
  history?: ChatMessage[];
  httpContext?: string;
};

export type CloseCliSessionInput = {
  sessionId: string;
};
