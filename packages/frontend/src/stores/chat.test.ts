import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { INIT_REQUEST_TIMEOUT_MS } from "../utils/promise-timeout";

const mockSdk = {
  backend: {
    getChats: vi.fn(),
    saveChat: vi.fn(),
    deleteChat: vi.fn(),
    closeCliSession: vi.fn(),
    getCliSessionState: vi.fn(),
  },
  window: {
    showToast: vi.fn(),
  },
};

vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
}));

import { useChatStore } from "./chat";

describe("chat store persistence", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockSdk.backend.getChats.mockReset();
    mockSdk.backend.saveChat.mockReset();
    mockSdk.backend.deleteChat.mockReset();
    mockSdk.backend.closeCliSession.mockReset();
    mockSdk.backend.getCliSessionState.mockReset();
    mockSdk.window.showToast.mockReset();
  });

  it("surfaces chat load failures", async () => {
    mockSdk.backend.getChats.mockResolvedValue({
      kind: "Error",
      error: "storage unavailable",
    });

    const store = useChatStore();
    await store.loadChats();

    expect(store.chats).toEqual([]);
    expect(store.initError).toBe("storage unavailable");
  });

  it("times out chat loading so app initialization can continue", async () => {
    vi.useFakeTimers();
    try {
      mockSdk.backend.getChats.mockImplementation(() => new Promise(() => undefined));
      const store = useChatStore();

      const loadPromise = store.loadChats();
      await vi.advanceTimersByTimeAsync(INIT_REQUEST_TIMEOUT_MS + 1);
      await loadPromise;

      expect(store.chats).toEqual([]);
      expect(store.initError).toContain("Loading saved chats timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces save failures while keeping the chat in memory", async () => {
    mockSdk.backend.saveChat.mockResolvedValue({
      kind: "Error",
      error: "sqlite write failed",
    });

    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    store.addMessage(chatId, {
      id: "msg-1",
      role: "user",
      content: "hello",
      timestamp: Date.now(),
      providerId: "claude-cli",
    });

    await store.saveActiveChat();

    expect(store.persistenceError).toContain("sqlite write failed");
    expect(store.chats).toHaveLength(1);
    expect(mockSdk.window.showToast).toHaveBeenCalledTimes(1);
  });

  it("derives workflow titles from attached HTTP review prompts", () => {
    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    store.addMessage(chatId, {
      id: "msg-1",
      role: "user",
      content: "Review this HTTP request as a manual security tester. Summarize what the request does, identify the most relevant attack surfaces, and propose the next 3 manual tests to run in Caido.",
      timestamp: Date.now(),
      providerId: "claude-cli",
      httpContextAttachment: {
        source: "request",
        label: "HTTP request",
        size: 128,
      },
    });

    expect(store.chats[0]?.title).toBe("Request review");
  });

  it("derives report-oriented titles from freeform prompts", () => {
    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    store.addMessage(chatId, {
      id: "msg-1",
      role: "user",
      content: "Write a bug bounty style report for [FINDING_ID_OR_TITLE_OR_HYPOTHESIS]. Include title, severity, affected asset, summary, impact, evidence, steps to reproduce, PoC notes, and remediation.",
      timestamp: Date.now(),
      providerId: "claude-cli",
    });

    expect(store.chats[0]?.title).toBe("Report draft");
  });

  it("surfaces delete failures but removes the chat locally", async () => {
    mockSdk.backend.deleteChat.mockRejectedValue(new Error("disk full"));

    const store = useChatStore();
    const chatId = store.createChat("claude-cli");

    await store.deleteChat(chatId);

    expect(store.persistenceError).toContain("disk full");
    expect(store.chats).toEqual([]);
    expect(mockSdk.window.showToast).toHaveBeenCalledTimes(1);
  });

  it("surfaces session cleanup failures", async () => {
    mockSdk.backend.closeCliSession.mockResolvedValue({
      kind: "Error",
      error: "session cleanup failed",
    });

    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    store.setSessionId(chatId, "session-1");
    store.clearSession(chatId);

    await Promise.resolve();

    expect(store.getSessionId(chatId)).toBeUndefined();
    expect(store.persistenceError).toContain("session cleanup failed");
    expect(mockSdk.window.showToast).toHaveBeenCalledTimes(1);
  });

  it("tracks rich session state snapshots", async () => {
    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    mockSdk.backend.getCliSessionState.mockResolvedValue({
      kind: "Ok",
      value: {
        chatId,
        sessionId: "session-1",
        providerId: "claude-cli",
        state: "running",
        reason: "Provider turn running.",
        mcpAttached: true,
        updatedAt: 123,
      },
    });

    store.setSessionId(chatId, "session-1");
    await store.refreshSessionState(chatId);

    expect(store.getSessionState(chatId)).toMatchObject({
      sessionId: "session-1",
      state: "running",
      mcpAttached: true,
    });
    expect(store.activeSessionState).toMatchObject({
      sessionId: "session-1",
      state: "running",
    });
  });

  it("renames chats and persists the new title", async () => {
    mockSdk.backend.saveChat.mockResolvedValue({
      kind: "Ok",
      value: undefined,
    });

    const store = useChatStore();
    const chatId = store.createChat("claude-cli");
    await store.renameChat(chatId, "Review auth flow");

    expect(store.chats[0]?.title).toBe("Review auth flow");
    expect(mockSdk.backend.saveChat).toHaveBeenCalledTimes(1);
  });
});
