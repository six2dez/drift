import { z } from "zod";

import { CliProviderSchema } from "./cli-providers";

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  timestamp: z.number(),
  providerId: CliProviderSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const StoredChatSchema = z.object({
  id: z.string().min(1),
  title: z.string().default("New Chat"),
  messages: z.array(ChatMessageSchema),
  providerId: CliProviderSchema,
  cliSessionId: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type StoredChat = z.infer<typeof StoredChatSchema>;

// Backend → Frontend events
export const CliOutputChunkEventSchema = z.object({
  sessionId: z.string().min(1),
  delta: z.string(),
  stream: z.enum(["stdout", "stderr"]),
});
export type CliOutputChunkEvent = z.infer<typeof CliOutputChunkEventSchema>;

export const CliSessionStateEventSchema = z.object({
  sessionId: z.string().min(1),
  state: z.enum(["starting", "running", "stopped", "error"]),
  error: z.string().optional(),
  exitCode: z.number().optional(),
});
export type CliSessionStateEvent = z.infer<typeof CliSessionStateEventSchema>;

export const McpStatusEventSchema = z.object({
  running: z.boolean(),
  port: z.number(),
  toolCount: z.number(),
});
export type McpStatusEvent = z.infer<typeof McpStatusEventSchema>;

// API input types
export const CreateCliSessionInputSchema = z.object({
  providerId: CliProviderSchema,
  chatId: z.string().min(1),
});
export type CreateCliSessionInput = z.infer<typeof CreateCliSessionInputSchema>;

export const SendCliMessageInputSchema = z.object({
  sessionId: z.string().min(1),
  chatId: z.string().min(1),
  text: z.string().min(1),
  history: z.array(ChatMessageSchema).default([]),
  httpContext: z.string().optional(),
});
export type SendCliMessageInput = z.infer<typeof SendCliMessageInputSchema>;

export const CloseCliSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});
export type CloseCliSessionInput = z.infer<typeof CloseCliSessionInputSchema>;
