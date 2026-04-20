import { describe, expect, it, vi } from "vitest";
import {
  consumeClaudePrintChunk,
  createClaudePrintState,
  didClaudeStopWithoutResult,
  finalizeClaudePrintOutput,
  getClaudePrintRecoveryMode,
  getClaudePrintUsage,
} from "./claude-print";

describe("claude print parsing", () => {
  it("captures the Claude session id, text deltas, and final result text", () => {
    const onText = vi.fn();
    const onSessionId = vi.fn();
    const chunks = [
      `${JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "session-123",
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-123",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Hello",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-123",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: " world",
          },
        },
      })}`,
      `\n${JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-123",
        result: "Hello world",
      })}\n`,
    ];

    let state = createClaudePrintState();
    for (const chunk of chunks) {
      state = consumeClaudePrintChunk(state, chunk, { onText, onSessionId });
    }

    expect(state.sessionId).toBe("session-123");
    expect(state.streamedText).toBe("Hello world");
    expect(state.assistantText).toBe("");
    expect(state.completed).toBe(true);
    expect(state.isError).toBe(false);
    expect(didClaudeStopWithoutResult(state)).toBe(false);
    expect(getClaudePrintRecoveryMode(state)).toBeNull();
    expect(finalizeClaudePrintOutput(state)).toBe("Hello world");
    expect(onSessionId).toHaveBeenCalledWith("session-123");
    expect(onText).toHaveBeenNthCalledWith(1, "Hello");
    expect(onText).toHaveBeenNthCalledWith(2, " world");
  });

  it("marks Claude results as completed even when the final result text is empty", () => {
    const state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-456",
        result: "",
      })}\n`,
    );

    expect(state.sessionId).toBe("session-456");
    expect(state.completed).toBe(true);
    expect(state.isError).toBe(false);
    expect(finalizeClaudePrintOutput(state)).toBe("");
  });

  it("uses assistant text as fallback output and enables assistant recovery mode", () => {
    const onText = vi.fn();
    const state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "assistant",
        session_id: "session-789",
        message: {
          content: [
            { type: "text", text: "Ready to help." },
          ],
        },
      })}\n`,
      { onText },
    );

    expect(state.sessionId).toBe("session-789");
    expect(state.streamedText).toBe("");
    expect(state.assistantText).toBe("Ready to help.");
    expect(getClaudePrintRecoveryMode(state)).toBe("assistant");
    expect(finalizeClaudePrintOutput(state)).toBe("Ready to help.");
    expect(onText).toHaveBeenCalledWith("Ready to help.");
  });

  it("does not treat assistant text that accompanies tool use as a recoverable answer", () => {
    let state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "assistant",
        session_id: "session-tools",
        message: {
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Checking Caido history..." },
            { type: "tool_use", id: "tool-1" },
          ],
        },
      })}\n`,
    );

    expect(state.pendingToolUseIds).toEqual(["tool-1"]);
    expect(state.assistantText).toBe("");
    expect(getClaudePrintRecoveryMode(state)).toBeNull();

    state = consumeClaudePrintChunk(
      state,
      `${JSON.stringify({
        type: "user",
        session_id: "session-tools",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tool-1", text: "ok" },
          ],
        },
      })}\n`,
    );

    expect(state.pendingToolUseIds).toEqual([]);
    expect(state.assistantText).toBe("");
    expect(finalizeClaudePrintOutput(state)).toBe("");
    expect(getClaudePrintRecoveryMode(state)).toBeNull();
  });

  it("drops provisional streamed text once a tool-use block starts and only recovers final post-tool text", () => {
    let state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-stream-tools",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Let me fetch the tool schemas first.",
          },
        },
      })}\n`,
    );

    expect(state.streamedText).toBe("Let me fetch the tool schemas first.");
    expect(getClaudePrintRecoveryMode(state)).toBe("streamed");

    state = consumeClaudePrintChunk(
      state,
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-stream-tools",
        event: {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "tool-1",
          },
        },
      })}\n`,
    );

    expect(state.streamedText).toBe("");
    expect(state.pendingToolUseIds).toEqual(["tool-1"]);
    expect(getClaudePrintRecoveryMode(state)).toBeNull();

    state = consumeClaudePrintChunk(
      state,
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-stream-tools",
        event: {
          type: "content_block_start",
          content_block: {
            type: "tool_result",
            tool_use_id: "tool-1",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-stream-tools",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Here are the last 5 requests.",
          },
        },
      })}\n`,
    );

    expect(state.pendingToolUseIds).toEqual([]);
    expect(state.streamedText).toBe("Here are the last 5 requests.");
    expect(getClaudePrintRecoveryMode(state)).toBe("streamed");
    expect(finalizeClaudePrintOutput(state)).toBe("Here are the last 5 requests.");
  });

  it("treats message_stop with end_turn as a valid completion even without result", () => {
    let state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-message-stop",
        event: {
          type: "message_start",
          message: {
            stop_reason: null,
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-message-stop",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Final answer",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-message-stop",
        event: {
          type: "message_delta",
          delta: {
            stop_reason: "end_turn",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-message-stop",
        event: {
          type: "message_stop",
        },
      })}\n`,
    );

    expect(state.messageStopped).toBe(true);
    expect(state.stopReason).toBe("end_turn");
    expect(didClaudeStopWithoutResult(state)).toBe(true);
    expect(getClaudePrintRecoveryMode(state)).toBe("streamed");
    expect(finalizeClaudePrintOutput(state)).toBe("Final answer");
  });

  it("clears stale pending tool ids when a new assistant message starts after tool use", () => {
    let state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-tool-cycle",
        event: {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "tool-1",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-tool-cycle",
        event: {
          type: "message_delta",
          delta: {
            stop_reason: "tool_use",
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-tool-cycle",
        event: {
          type: "message_stop",
        },
      })}\n`,
    );

    expect(state.pendingToolUseIds).toEqual(["tool-1"]);
    expect(didClaudeStopWithoutResult(state)).toBe(false);

    state = consumeClaudePrintChunk(
      state,
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-tool-cycle",
        event: {
          type: "message_start",
          message: {
            stop_reason: null,
          },
        },
      })}\n${JSON.stringify({
        type: "stream_event",
        session_id: "session-tool-cycle",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Done after tools",
          },
        },
      })}\n`,
    );

    expect(state.pendingToolUseIds).toEqual([]);
    expect(getClaudePrintRecoveryMode(state)).toBe("streamed");
    expect(finalizeClaudePrintOutput(state)).toBe("Done after tools");
  });

  it("captures usage tokens from the final result event", () => {
    const chunk = `${JSON.stringify({
      type: "assistant",
      session_id: "session-usage",
      message: {
        content: [{ type: "text", text: "done" }],
        usage: {
          input_tokens: 1200,
          output_tokens: 450,
          cache_read_input_tokens: 800,
        },
      },
    })}\n${JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "session-usage",
      result: "done",
      usage: {
        input_tokens: 1210,
        output_tokens: 460,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 100,
      },
    })}\n`;
    const state = consumeClaudePrintChunk(createClaudePrintState(), chunk);
    expect(getClaudePrintUsage(state)).toEqual({
      inputTokens: 1210,
      outputTokens: 460,
      cacheReadTokens: 800,
      cacheCreationTokens: 100,
    });
  });

  it("returns undefined usage when the stream did not report tokens", () => {
    const state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-no-usage",
        result: "hi",
      })}\n`,
    );
    expect(getClaudePrintUsage(state)).toBeUndefined();
  });

  it("exposes streamed recovery mode when Claude has visible text but no result", () => {
    const state = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "stream_event",
        session_id: "session-stream",
        event: {
          type: "content_block_delta",
          delta: {
            type: "text_delta",
            text: "Partial output",
          },
        },
      })}\n`,
    );

    expect(state.streamedText).toBe("Partial output");
    expect(state.assistantText).toBe("");
    expect(getClaudePrintRecoveryMode(state)).toBe("streamed");
    expect(finalizeClaudePrintOutput(state)).toBe("Partial output");
  });
});
