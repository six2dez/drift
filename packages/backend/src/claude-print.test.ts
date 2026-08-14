import { describe, expect, it, vi } from "vitest";
import {
  consumeClaudePrintChunk,
  createClaudePrintState,
  didClaudeStopWithoutResult,
  finalizeClaudePrintOutput,
  getClaudePrintRecoveryMode,
  getClaudePrintUsage,
} from "./claude-print";
// A SECOND import block from the same module rather than an edit to the one
// above, deliberately: 04-VALIDATION.md's PERF-04 behaviour-identical regression
// row grades this file as ADDITIONS ONLY. The 393 lines below it are the
// behaviour-identity proof for plan 04-06's split-once refactor, and a one-line
// edit to the import above would put a modified line inside that proof. Do not
// merge these two blocks back together while that row is the gate.
import {
  CLAUDE_LINE_BUFFER_MAX_CHARS,
  getClaudePrintDroppedChars,
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
    const state = consumeClaudePrintChunk(
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

// ── Appended by plan 04-06 — PERF-04 site B ─────────────────────────
//
// 04-VALIDATION.md addresses the drop path with `-t "unterminated"`, which is a
// SUBSTRING match against the `it` title. The word "unterminated" in the first
// case below is therefore a contract, not prose: rewording it to "unfinished" or
// "never-newline-terminated" reads correctly to a human while silently matching
// zero tests, and `vitest -t` exits 0 on an empty selector. Do not reword.
//
// The oversized inputs are built with `repeat()` off the exported constant, not
// from literals: a 4 MiB literal would be unreviewable, and deriving the size
// from the cap means a future tuning of the cap cannot leave a case silently
// under it.

describe("claude-print line buffer bounds", () => {
  it("uses the phase's one shared value for every unterminated-line cap", () => {
    // The mirror of bounded-buffer.test.ts's identically-purposed case. The two
    // siblings are MCP_SELFTEST_LINE_MAX_CHARS (bounded-buffer.ts, plan 04-05)
    // and ACTIVITY_PARTIAL_MAX_BYTES (activity-tail.ts, plan 04-04); all three
    // bound one hazard — a never-terminated line in a stream carrying
    // target-application content — so all three are 4 MiB by construction. The
    // assertion lives in the suite rather than in a one-off grep so a future
    // divergence has to be a deliberate act with its own rationale.
    expect(CLAUDE_LINE_BUFFER_MAX_CHARS).toBe(4 * 1024 * 1024);
    expect(CLAUDE_LINE_BUFFER_MAX_CHARS).toBe(4194304);
  });

  it("drops and counts an unterminated line larger than the buffer cap", () => {
    const onText = vi.fn();
    const onSessionId = vi.fn();
    const oversized = "x".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS + 1024);

    const state = consumeClaudePrintChunk(createClaudePrintState(), oversized, {
      onText,
      onSessionId,
    });

    expect(state.buffer).toBe("");
    expect(getClaudePrintDroppedChars(state)).toBe(
      CLAUDE_LINE_BUFFER_MAX_CHARS + 1024,
    );
    expect(getClaudePrintDroppedChars(state)).toBeGreaterThan(
      CLAUDE_LINE_BUFFER_MAX_CHARS,
    );
    // The remainder is dropped WHOLE, so nothing reached the parser and no
    // handler can have fired — a truncate-and-parse implementation would have
    // swallowed the fragment in the tolerant catch instead, silently.
    expect(onText).not.toHaveBeenCalled();
    expect(onSessionId).not.toHaveBeenCalled();
  });

  it("keeps an unterminated line below the cap buffered rather than dropping it", () => {
    const onText = vi.fn();
    const underCap = "z".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS - 1024);

    const state = consumeClaudePrintChunk(createClaudePrintState(), underCap, {
      onText,
    });

    expect(state.buffer).toHaveLength(underCap.length);
    // Identity asserted as a boolean so a failure prints `false !== true`
    // instead of dumping a multi-megabyte string diff.
    expect(state.buffer === underCap).toBe(true);
    expect(getClaudePrintDroppedChars(state)).toBe(0);
    expect(onText).not.toHaveBeenCalled();

    // Exactly AT the cap is still kept: the bound drops on `>`, not `>=`. This
    // pins the off-by-one that the two size-based cases above cannot see.
    const atCap = consumeClaudePrintChunk(
      createClaudePrintState(),
      "z".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS),
    );

    expect(atCap.buffer).toHaveLength(CLAUDE_LINE_BUFFER_MAX_CHARS);
    expect(getClaudePrintDroppedChars(atCap)).toBe(0);
  });

  it("does not drop when the oversized content is newline-terminated", () => {
    const onText = vi.fn();
    const onSessionId = vi.fn();
    const oversizedText = "y".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS + 1024);
    // The event line itself is over the cap and IS newline-terminated. An
    // implementation that bounded the pre-split concatenation would drop it
    // along with the complete lines that were about to be emitted; bounding only
    // the post-split remainder emits everything and drops nothing.
    const chunk = `${JSON.stringify({
      type: "stream_event",
      session_id: "session-oversized",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: oversizedText },
      },
    })}\n${JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "session-oversized",
      result: "done",
    })}\n`;

    expect(chunk.length).toBeGreaterThan(CLAUDE_LINE_BUFFER_MAX_CHARS);

    const state = consumeClaudePrintChunk(createClaudePrintState(), chunk, {
      onText,
      onSessionId,
    });

    expect(getClaudePrintDroppedChars(state)).toBe(0);
    expect(state.buffer).toBe("");
    expect(state.streamedText === oversizedText).toBe(true);
    expect(state.completed).toBe(true);
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onSessionId).toHaveBeenCalledWith("session-oversized");
    expect(finalizeClaudePrintOutput(state)).toBe("done");
  });

  it("accumulates droppedChars across successive unterminated overflows", () => {
    const first = "a".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS + 1);
    const second = "b".repeat(CLAUDE_LINE_BUFFER_MAX_CHARS + 4096);

    let state = consumeClaudePrintChunk(createClaudePrintState(), first);

    expect(state.buffer).toBe("");
    expect(getClaudePrintDroppedChars(state)).toBe(first.length);

    state = consumeClaudePrintChunk(state, second);

    expect(state.buffer).toBe("");
    expect(getClaudePrintDroppedChars(state)).toBe(
      first.length + second.length,
    );
  });

  it("appends the dropped-bytes notice to the finalized output only when something was dropped", () => {
    const clean = consumeClaudePrintChunk(
      createClaudePrintState(),
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-notice",
        result: "the answer",
      })}\n`,
    );

    expect(getClaudePrintDroppedChars(clean)).toBe(0);
    // Compared against a directly-constructed literal rather than against the
    // function's own earlier output: "unchanged when nothing was dropped" is the
    // property 04-VALIDATION.md's behaviour-identical row grades, and comparing
    // the function to itself would pass for any implementation.
    expect(finalizeClaudePrintOutput(clean)).toBe("the answer");

    const dropped = { ...clean, droppedChars: 4195328 };

    expect(finalizeClaudePrintOutput(dropped)).toBe(
      "the answer\n…[drift: dropped 4195328 bytes of unterminated Claude stream output]",
    );
    expect(
      finalizeClaudePrintOutput(dropped).endsWith(
        "bytes of unterminated Claude stream output]",
      ),
    ).toBe(true);
    expect(finalizeClaudePrintOutput(dropped)).toContain("4195328");
  });
});

describe("claude-print chunk splitting", () => {
  it("produces identical events whether a multi-event payload arrives in one chunk or byte by byte", () => {
    const payload = `${JSON.stringify({
      type: "system",
      subtype: "init",
      session_id: "session-split",
    })}\n${JSON.stringify({
      type: "stream_event",
      session_id: "session-split",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" },
      },
    })}\n${JSON.stringify({
      type: "stream_event",
      session_id: "session-split",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: " world" },
      },
    })}\n${JSON.stringify({
      type: "result",
      subtype: "success",
      session_id: "session-split",
      result: "Hello world",
    })}\n`;

    const collectFrom = (chunks: string[]) => {
      const texts: string[] = [];
      const sessionIds: string[] = [];
      let state = createClaudePrintState();
      for (const chunk of chunks) {
        state = consumeClaudePrintChunk(state, chunk, {
          onText: (delta) => {
            texts.push(delta);
          },
          onSessionId: (sessionId) => {
            sessionIds.push(sessionId);
          },
        });
      }
      return { texts, sessionIds, state };
    };

    const whole = collectFrom([payload]);
    const byteByByte = collectFrom(payload.split(""));

    expect(byteByByte.texts).toEqual(whole.texts);
    expect(byteByByte.sessionIds).toEqual(whole.sessionIds);
    expect(byteByByte.state.sessionId).toBe(whole.state.sessionId);
    expect(finalizeClaudePrintOutput(byteByByte.state)).toBe(
      finalizeClaudePrintOutput(whole.state),
    );

    // Non-vacuous by construction: two runs that both emitted nothing would
    // compare equal and prove nothing about the split, so each side is also
    // pinned to the expected values.
    expect(whole.texts).toEqual(["Hello", " world"]);
    expect(whole.sessionIds).toEqual(["session-split"]);
    expect(finalizeClaudePrintOutput(whole.state)).toBe("Hello world");
    expect(getClaudePrintDroppedChars(byteByByte.state)).toBe(0);
    expect(byteByByte.state.buffer).toBe("");
  });

  it("emits nothing for a chunk that is only whitespace and blank lines", () => {
    const onText = vi.fn();
    const onSessionId = vi.fn();

    const state = consumeClaudePrintChunk(
      createClaudePrintState(),
      "\n\n   \n\t\n  ",
      { onText, onSessionId },
    );

    expect(onText).not.toHaveBeenCalled();
    expect(onSessionId).not.toHaveBeenCalled();
    expect(state.streamedText).toBe("");
    expect(state.assistantText).toBe("");
    expect(state.completed).toBe(false);
    expect(getClaudePrintDroppedChars(state)).toBe(0);
    // The segment after the LAST "\n" becomes the new buffer with its whitespace
    // intact: `trim()` is applied per complete line inside the loop, never to
    // the carried remainder, because the rest of that line has not arrived yet.
    expect(state.buffer).toBe("  ");
    expect(finalizeClaudePrintOutput(state)).toBe("");
  });
});
