type ClaudeRawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type ClaudeStreamEvent = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  session_id?: string;
  usage?: ClaudeRawUsage;
  message?: {
    stop_reason?: string;
    usage?: ClaudeRawUsage;
    content?: Array<{
      type?: string;
      text?: string;
      id?: string;
      tool_use_id?: string;
    }>;
  };
  event?: {
    type?: string;
    message?: {
      stop_reason?: string | null;
      usage?: ClaudeRawUsage;
    };
    delta?: {
      type?: string;
      text?: string;
      stop_reason?: string | null;
    };
    content_block?: {
      type?: string;
      id?: string;
      tool_use_id?: string;
    };
    usage?: ClaudeRawUsage;
  };
  result?: string;
};

export type ClaudeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

function normalizeUsage(raw: ClaudeRawUsage | undefined): ClaudeUsage | undefined {
  if (raw === undefined) return undefined;
  const inputTokens = typeof raw.input_tokens === "number" ? raw.input_tokens : undefined;
  const outputTokens = typeof raw.output_tokens === "number" ? raw.output_tokens : undefined;
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  const usage: ClaudeUsage = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
  };
  if (typeof raw.cache_read_input_tokens === "number") {
    usage.cacheReadTokens = raw.cache_read_input_tokens;
  }
  if (typeof raw.cache_creation_input_tokens === "number") {
    usage.cacheCreationTokens = raw.cache_creation_input_tokens;
  }
  return usage;
}

// Merge incoming usage into the running total. Claude emits partial usage
// counts during streaming (input_tokens once, output_tokens growing with
// each chunk) and a final consolidated payload with the `result` event.
// We keep the last non-undefined value for each field so the final totals
// overwrite the partials cleanly.
function mergeUsage(
  previous: ClaudeUsage | undefined,
  incoming: ClaudeUsage | undefined,
): ClaudeUsage | undefined {
  if (incoming === undefined) return previous;
  if (previous === undefined) return { ...incoming };
  return {
    inputTokens: incoming.inputTokens > 0 ? incoming.inputTokens : previous.inputTokens,
    outputTokens: incoming.outputTokens > 0 ? incoming.outputTokens : previous.outputTokens,
    cacheReadTokens: incoming.cacheReadTokens ?? previous.cacheReadTokens,
    cacheCreationTokens: incoming.cacheCreationTokens ?? previous.cacheCreationTokens,
  };
}

export type ClaudePrintState = {
  buffer: string;
  sessionId: string;
  streamedText: string;
  assistantText: string;
  finalText: string;
  completed: boolean;
  isError: boolean;
  pendingToolUseIds: string[];
  messageStopped: boolean;
  stopReason: string;
  usage: ClaudeUsage | undefined;
};

export function createClaudePrintState(): ClaudePrintState {
  return {
    buffer: "",
    sessionId: "",
    streamedText: "",
    assistantText: "",
    finalText: "",
    completed: false,
    isError: false,
    pendingToolUseIds: [],
    messageStopped: false,
    stopReason: "",
    usage: undefined,
  };
}

function normalizeToolId(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isToolUseContentType(value: string | undefined): boolean {
  return value === "tool_use" || value === "server_tool_use";
}

function isToolResultContentType(value: string | undefined): boolean {
  return value === "tool_result" || (typeof value === "string" && value.endsWith("_tool_result"));
}

function clearRecoverableText(state: ClaudePrintState): ClaudePrintState {
  if (state.streamedText === "" && state.assistantText === "") return state;
  return {
    ...state,
    streamedText: "",
    assistantText: "",
  };
}

export function consumeClaudePrintChunk(
  state: ClaudePrintState,
  chunk: string,
  handlers?: {
    onText?: (delta: string) => void;
    onSessionId?: (sessionId: string) => void;
  },
): ClaudePrintState {
  let nextState: ClaudePrintState = {
    ...state,
    buffer: state.buffer + chunk,
  };

  let newlineIndex = nextState.buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = nextState.buffer.slice(0, newlineIndex).trim();
    nextState = {
      ...nextState,
      buffer: nextState.buffer.slice(newlineIndex + 1),
    };
    newlineIndex = nextState.buffer.indexOf("\n");

    if (line === "") continue;

    let parsed: ClaudeStreamEvent;
    try {
      parsed = JSON.parse(line) as ClaudeStreamEvent;
    } catch {
      continue;
    }

    const sessionId = parsed.session_id?.trim() ?? "";
    if (sessionId !== "" && sessionId !== nextState.sessionId) {
      nextState = { ...nextState, sessionId };
      handlers?.onSessionId?.(sessionId);
    }

    const incomingUsage =
      normalizeUsage(parsed.usage) ??
      normalizeUsage(parsed.message?.usage) ??
      normalizeUsage(parsed.event?.usage) ??
      normalizeUsage(parsed.event?.message?.usage);
    if (incomingUsage !== undefined) {
      nextState = { ...nextState, usage: mergeUsage(nextState.usage, incomingUsage) };
    }

    if (parsed.type === "stream_event" && parsed.event?.type === "message_start") {
      nextState = {
        ...nextState,
        messageStopped: false,
        stopReason: "",
        ...(nextState.pendingToolUseIds.length > 0
          ? { pendingToolUseIds: [] }
          : {}),
      };
    }

    if (parsed.type === "stream_event" && parsed.event?.type === "message_delta") {
      const stopReason =
        parsed.event.delta?.stop_reason ??
        parsed.event.message?.stop_reason ??
        "";
      if (typeof stopReason === "string") {
        nextState = {
          ...nextState,
          stopReason,
        };
      }
    }

    if (parsed.type === "stream_event" && parsed.event?.type === "message_stop") {
      nextState = {
        ...nextState,
        messageStopped: true,
        ...(nextState.stopReason !== "tool_use" ? { pendingToolUseIds: [] } : {}),
      };
    }

    if (
      parsed.type === "stream_event" &&
      parsed.event?.type === "content_block_start"
    ) {
      const contentBlockType = parsed.event.content_block?.type;
      if (isToolUseContentType(contentBlockType)) {
        const nextPendingToolUseIds = new Set(nextState.pendingToolUseIds);
        const toolUseId = normalizeToolId(parsed.event.content_block?.id);
        if (toolUseId !== "") nextPendingToolUseIds.add(toolUseId);
        nextState = clearRecoverableText({
          ...nextState,
          pendingToolUseIds: [...nextPendingToolUseIds],
        });
      } else if (isToolResultContentType(contentBlockType)) {
        const nextPendingToolUseIds = new Set(nextState.pendingToolUseIds);
        const toolUseId = normalizeToolId(parsed.event.content_block?.tool_use_id);
        if (toolUseId !== "") nextPendingToolUseIds.delete(toolUseId);
        nextState = {
          ...nextState,
          pendingToolUseIds: [...nextPendingToolUseIds],
        };
      }
    }

    const textDelta =
      parsed.type === "stream_event" &&
      parsed.event?.type === "content_block_delta" &&
      parsed.event.delta?.type === "text_delta"
        ? parsed.event.delta.text ?? ""
        : "";
    if (textDelta !== "") {
      nextState = {
        ...nextState,
        streamedText: nextState.streamedText + textDelta,
      };
      handlers?.onText?.(textDelta);
    }

    if (parsed.type === "assistant") {
      const content = parsed.message?.content ?? [];
      const containsToolUse = content.some((part) => isToolUseContentType(part.type));
      const nextPendingToolUseIds = new Set(nextState.pendingToolUseIds);
      for (const part of content) {
        if (!isToolUseContentType(part.type)) continue;
        const toolUseId = normalizeToolId(part.id);
        if (toolUseId !== "") nextPendingToolUseIds.add(toolUseId);
      }
      nextState = containsToolUse || parsed.message?.stop_reason === "tool_use"
        ? clearRecoverableText({
          ...nextState,
          pendingToolUseIds: [...nextPendingToolUseIds],
        })
        : {
          ...nextState,
          pendingToolUseIds: [...nextPendingToolUseIds],
        };

      const assistantText = content
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("");
      if (assistantText !== "" && !containsToolUse && parsed.message?.stop_reason !== "tool_use") {
        const shouldEmitAssistantText =
          nextState.streamedText.trim() === "" &&
          nextState.assistantText.trim() === "";
        nextState = {
          ...nextState,
          assistantText,
        };
        if (shouldEmitAssistantText) {
          handlers?.onText?.(assistantText);
        }
      }
    }
    if (parsed.type === "user") {
      const nextPendingToolUseIds = new Set(nextState.pendingToolUseIds);
      for (const part of parsed.message?.content ?? []) {
        if (!isToolResultContentType(part.type)) continue;
        const toolUseId = normalizeToolId(part.tool_use_id);
        if (toolUseId !== "") nextPendingToolUseIds.delete(toolUseId);
      }
      nextState = {
        ...nextState,
        pendingToolUseIds: [...nextPendingToolUseIds],
      };
    }

    const resultText =
      parsed.type === "result" && typeof parsed.result === "string"
        ? parsed.result.trim()
        : "";
    if (parsed.type === "result") {
      nextState = {
        ...nextState,
        completed: true,
        isError: parsed.is_error === true,
        finalText: resultText,
      };
    }
  }

  return nextState;
}

export function finalizeClaudePrintOutput(state: ClaudePrintState): string {
  return state.finalText || state.streamedText.trim() || state.assistantText.trim();
}

export function getClaudePrintUsage(state: ClaudePrintState): ClaudeUsage | undefined {
  return state.usage;
}

export function getClaudePrintRecoveryMode(
  state: ClaudePrintState,
): "assistant" | "streamed" | null {
  if (
    state.completed ||
    (state.pendingToolUseIds.length > 0 && !(state.messageStopped && state.stopReason !== "tool_use"))
  ) {
    return null;
  }
  if (state.assistantText.trim() !== "") return "assistant";
  if (state.streamedText.trim() !== "") return "streamed";
  return null;
}

export function didClaudeStopWithoutResult(state: ClaudePrintState): boolean {
  return state.completed === false && state.messageStopped && state.stopReason !== "tool_use";
}
