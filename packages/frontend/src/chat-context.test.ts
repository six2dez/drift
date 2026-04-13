import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPendingChatInput,
  clearPendingChatInputQueue,
  consumePendingChatInput,
  createHttpContextAttachment,
  createHttpContextPayload,
  enqueuePendingChatInput,
  extractCaidoText,
  pendingChatInput,
  pendingChatInputQueue,
} from "./chat-context";

describe("chat-context helpers", () => {
  it("extracts raw request text from getRaw", () => {
    const text = extractCaidoText({
      request: {
        getRaw: () => ({
          toText: () => "GET / HTTP/1.1\nHost: example.com",
        }),
      },
    }, "request");

    expect(text).toContain("GET / HTTP/1.1");
  });

  it("extracts structured response text when raw is not available", () => {
    const text = extractCaidoText({
      response: {
        getCode: () => 200,
        getBody: () => ({
          toText: () => "{\"ok\":true}",
        }),
      },
    }, "response");

    expect(text).toBe("HTTP 200\n\n{\"ok\":true}");
  });

  it("creates structured http context payloads and attachments", () => {
    const payload = createHttpContextPayload("request", "HTTP request", "GET / HTTP/1.1");
    const attachment = createHttpContextAttachment(payload);

    expect(payload).toEqual({
      source: "request",
      label: "HTTP request",
      raw: "GET / HTTP/1.1",
    });
    expect(attachment).toEqual({
      source: "request",
      label: "HTTP request",
      size: 14,
    });
  });

  describe("pending chat input queue", () => {
    beforeEach(() => {
      clearPendingChatInputQueue();
    });

    it("enqueues items in FIFO order and consumes them one at a time", () => {
      enqueuePendingChatInput({ text: "first" });
      enqueuePendingChatInput({ text: "second" });
      enqueuePendingChatInput({ text: "third" });

      expect(pendingChatInputQueue.value.length).toBe(3);
      expect(pendingChatInput.value?.text).toBe("first");

      expect(consumePendingChatInput()?.text).toBe("first");
      expect(pendingChatInput.value?.text).toBe("second");

      expect(consumePendingChatInput()?.text).toBe("second");
      expect(consumePendingChatInput()?.text).toBe("third");
      expect(consumePendingChatInput()).toBeUndefined();
      expect(pendingChatInput.value).toBeUndefined();
    });

    it("clears the full queue on explicit reset", () => {
      enqueuePendingChatInput({ text: "a" });
      enqueuePendingChatInput({ text: "b" });
      clearPendingChatInputQueue();

      expect(pendingChatInputQueue.value.length).toBe(0);
      expect(consumePendingChatInput()).toBeUndefined();
    });
  });

  it("builds pending chat input with separate instruction text and raw context", () => {
    const pending = buildPendingChatInput({
      text: "Analyze this request",
      source: "request-row",
      label: "HTTP request",
      rawContext: "POST /login HTTP/1.1\nHost: app.local",
    });

    expect(pending.text).toBe("Analyze this request");
    expect(pending.httpContext?.source).toBe("request-row");
    expect(pending.httpContext?.raw).toContain("POST /login");
    expect(pending.attachment?.label).toBe("HTTP request");
  });
});
