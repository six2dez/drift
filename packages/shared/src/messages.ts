import type {
  McpServerInfo,
  McpToolActivity,
  McpToolApprovalRequest,
} from "./mcp";

export type HttpContextSource = "request" | "response" | "request-row";

export type HttpContextPayload = {
  source: HttpContextSource;
  label: string;
  raw: string;
};

export type HttpContextAttachment = {
  source: HttpContextSource;
  label: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  providerId: string;
  httpContextAttachment?: HttpContextAttachment;
  mcpActivities?: McpToolActivity[];
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

export type CliSessionReasonCode =
  | "starting"
  | "running"
  | "completed"
  | "completed_without_result"
  | "cancelled"
  | "timeout"
  | "spawn_error"
  | "closed"
  | "error";

export type CliSessionStateEvent = {
  chatId: string;
  sessionId: string;
  providerId: string;
  state: "starting" | "running" | "stopped" | "error";
  reason: string;
  reasonCode?: CliSessionReasonCode;
  mcpAttached: boolean;
  recoveredFromPartialOutput?: boolean;
  updatedAt: number;
  exitCode?: number;
};

export type McpStatusEvent = McpServerInfo;
export type McpToolActivityEvent = {
  sessionId: string;
  activity: McpToolActivity;
};
export type McpToolApprovalRequestEvent = McpToolApprovalRequest;

export type CreateCliSessionInput = {
  providerId: string;
  chatId: string;
};

export type SendCliMessageInput = {
  sessionId: string;
  chatId: string;
  text: string;
  history?: ChatMessage[];
  httpContext?: HttpContextPayload;
};

export type SendCliMessageOutput = {
  content: string;
  mcpActivities: McpToolActivity[];
};

export type SupportBundleOutput = {
  fileName: string;
  content: string;
};

export type CloseCliSessionInput = {
  sessionId: string;
};
