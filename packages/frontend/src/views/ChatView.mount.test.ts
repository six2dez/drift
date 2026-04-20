// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

type DeferredResult = {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
};

function createDeferred(): DeferredResult {
  let resolveFn: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve) => {
    resolveFn = resolve;
  });
  return { promise, resolve: resolveFn };
}

const eventUnsub = { stop: vi.fn() };

const mockSdk = {
  backend: {
    // Event stream subscriptions used in onMounted.
    onEvent: vi.fn(() => eventUnsub),
    // Chat store init paths.
    getChats: vi.fn().mockResolvedValue({ kind: "Ok", value: [] }),
    saveChat: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    deleteChat: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    closeCliSession: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    getCliSessionState: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    // Settings store init paths.
    updateSettings: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    getProviderStatuses: vi.fn().mockResolvedValue({ kind: "Ok", value: [] }),
    getMcpStatus: vi.fn().mockResolvedValue({ kind: "Ok", value: { running: false, toolCount: 0, supportedToolCount: 0 } }),
    syncCaidoHistoryContext: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    syncCaidoSessionToken: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    startMcpServer: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    // CLI lifecycle.
    createCliSession: vi.fn().mockResolvedValue({ kind: "Ok", value: "session-1" }),
    sendCliMessage: vi.fn(),
    cancelCliMessage: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
    respondToMcpToolApproval: vi.fn().mockResolvedValue({ kind: "Ok", value: undefined }),
  },
  window: {
    showToast: vi.fn(),
  },
  storage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
  projects: {
    onCurrentProjectChange: vi.fn(() => ({ stop: vi.fn() })),
  },
  filters: {
    getCurrentFilter: vi.fn(() => undefined),
  },
  httpHistory: {
    getQuery: vi.fn(() => ""),
    getScopeId: vi.fn(() => ""),
  },
  console: {
    log: vi.fn(),
  },
};

vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
  SDKPlugin: { install: () => undefined },
}));

// Importing after the mock is declared so that modules pulling in `useSDK`
// see the stubbed backend instead of throwing on the real inject() call.
import ChatView from "./ChatView.vue";
import { useChatStore } from "../stores/chat";
import { useApprovalsStore } from "../stores/approvals";
import {
  clearPendingChatInputQueue,
  enqueuePendingChatInput,
} from "../chat-context";
import type { McpToolApprovalRequestEvent } from "shared";

const globalStubs = {
  Splitter: { template: "<div><slot /></div>" },
  SplitterPanel: { template: "<div><slot /></div>" },
  Button: { template: "<button><slot /></button>" },
  ChatSidebar: { template: "<div />" },
  ChatInput: { template: "<div />" },
  CliStatus: { template: "<div />" },
  MessageList: { template: "<div />" },
  ApprovalDialog: { template: "<div />" },
  AttachmentPreview: { template: "<div />" },
};

type MountedWrapper = ReturnType<typeof mount>;
const activeWrappers: MountedWrapper[] = [];

function mountChatView(): MountedWrapper {
  const wrapper = mount(ChatView, {
    global: {
      stubs: globalStubs,
    },
  });
  activeWrappers.push(wrapper);
  return wrapper;
}

describe("ChatView integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearPendingChatInputQueue();
    // Fully reset implementations AND call history so tests don't leak
    // deferred promises via the default mockReturnValue.
    for (const fn of Object.values(mockSdk.backend)) {
      (fn as ReturnType<typeof vi.fn>).mockReset?.();
    }
    mockSdk.window.showToast.mockReset();
    eventUnsub.stop.mockClear();
    mockSdk.backend.onEvent.mockReturnValue(eventUnsub);
    mockSdk.backend.getChats.mockResolvedValue({ kind: "Ok", value: [] });
    mockSdk.backend.saveChat.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.deleteChat.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.closeCliSession.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.getCliSessionState.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.updateSettings.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.getProviderStatuses.mockResolvedValue({ kind: "Ok", value: [] });
    mockSdk.backend.getMcpStatus.mockResolvedValue({
      kind: "Ok",
      value: { running: false, toolCount: 0, supportedToolCount: 0 },
    });
    mockSdk.backend.syncCaidoHistoryContext.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.syncCaidoSessionToken.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.startMcpServer.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.createCliSession.mockResolvedValue({ kind: "Ok", value: "session-1" });
    mockSdk.backend.cancelCliMessage.mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.respondToMcpToolApproval.mockResolvedValue({ kind: "Ok", value: undefined });
  });

  afterEach(() => {
    while (activeWrappers.length > 0) {
      activeWrappers.pop()?.unmount();
    }
    clearPendingChatInputQueue();
  });

  it("does not add an assistant message when a turn is cancelled before the backend resolves", async () => {
    const deferred = createDeferred();
    mockSdk.backend.sendCliMessage.mockReturnValue(deferred.promise);

    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleSend: (text: string) => Promise<void>;
      handleCancel: () => Promise<void>;
    };
    const chatStore = useChatStore();
    chatStore.createChat("claude-cli");

    const sendPromise = vm.handleSend("hola").catch(() => undefined);
    await flushPromises();

    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(1);

    await vm.handleCancel();

    // Backend finally resolves long after the cancel — the late result must
    // be discarded, not appended as a second assistant message.
    deferred.resolve({
      kind: "Ok",
      value: {
        content: "late claude output that must be dropped",
        mcpActivities: [],
      },
    });
    await sendPromise;
    await nextTick();

    const assistantMessages = chatStore.activeMessages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toContain("[Cancelled]");
    expect(
      assistantMessages[0]?.content.includes("late claude output"),
    ).toBe(false);
  });

  it("drains a context-menu payload enqueued while a previous turn is streaming", async () => {
    const firstTurn = createDeferred();
    const secondTurn = createDeferred();
    mockSdk.backend.sendCliMessage
      .mockReturnValueOnce(firstTurn.promise)
      .mockReturnValueOnce(secondTurn.promise);

    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleSend: (text: string) => Promise<void>;
    };
    const chatStore = useChatStore();
    chatStore.createChat("claude-cli");

    const firstSend = vm.handleSend("first user message");
    await flushPromises();

    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(1);

    enqueuePendingChatInput({ text: "queued from context menu" });
    await flushPromises();

    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(1);
    const queuedToasts = mockSdk.window.showToast.mock.calls.filter((call) =>
      typeof call[0] === "string" && call[0].toLowerCase().includes("queue"),
    );
    expect(queuedToasts.length).toBeGreaterThan(0);

    // First turn finishes — finally block drains the queue and triggers
    // a second sendCliMessage with the context-menu payload.
    firstTurn.resolve({
      kind: "Ok",
      value: { content: "first reply", mcpActivities: [] },
    });
    await firstSend;
    await nextTick();
    // Allow the setTimeout(0) drain to run.
    await new Promise((r) => setTimeout(r, 5));
    await nextTick();
    await nextTick();

    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(2);
    expect(mockSdk.backend.sendCliMessage.mock.calls[1]?.[0]).toMatchObject({
      text: "queued from context menu",
    });

    secondTurn.resolve({
      kind: "Ok",
      value: { content: "second reply", mcpActivities: [] },
    });
    await nextTick();
    await nextTick();
  });

  it("skips the approval dialog when the tool is already session-approved", async () => {
    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleApprovalRequest: (event: McpToolApprovalRequestEvent) => Promise<void>;
      pendingApproval: unknown;
    };
    const chatStore = useChatStore();
    const approvalsStore = useApprovalsStore();
    chatStore.createChat("claude-cli");
    // Simulate that the backend already bound this chat to session-1
    // (the createCliSession mock returns "session-1" in setup).
    const activeChatId = chatStore.activeChatId!;
    chatStore.setSessionId(activeChatId, "session-1");
    approvalsStore.allowForSession("session-1", "replay", "send_request");

    await vm.handleApprovalRequest({
      sessionId: "session-1",
      approvalId: "ap-1",
      toolName: "send_request",
      toolLabel: "Send request",
      group: "replay",
      argumentsSummary: "",
      message: "",
      sensitive: true,
    });
    await flushPromises();

    expect(vm.pendingApproval).toBe(null);
    expect(mockSdk.backend.respondToMcpToolApproval).toHaveBeenCalledWith({
      sessionId: "session-1",
      approvalId: "ap-1",
      approved: true,
    });
  });

  it("re-sends the last failed payload when Retry is triggered", async () => {
    mockSdk.backend.sendCliMessage
      .mockResolvedValueOnce({ kind: "Error", value: undefined, error: "boom" })
      .mockResolvedValueOnce({
        kind: "Ok",
        value: { content: "second attempt reply", mcpActivities: [] },
      });

    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleSend: (text: string) => Promise<void>;
      handleRetry: () => void;
      errorMessage: string | undefined;
      lastFailedInput: unknown;
    };
    const chatStore = useChatStore();
    chatStore.createChat("claude-cli");

    await vm.handleSend("first try");
    await flushPromises();
    expect(vm.errorMessage).toBe("boom");
    expect(vm.lastFailedInput).toMatchObject({ text: "first try" });
    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(1);

    vm.handleRetry();
    await flushPromises();
    // After a successful retry, lastFailedInput clears and a second assistant message lands.
    expect(vm.lastFailedInput).toBe(undefined);
    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(2);
    const assistantMessages = chatStore.activeMessages.filter((m) => m.role === "assistant");
    expect(assistantMessages.at(-1)?.content).toBe("second attempt reply");
  });

  it("auto-denies approval requests for an inactive session", async () => {
    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleApprovalRequest: (event: McpToolApprovalRequestEvent) => Promise<void>;
      pendingApproval: unknown;
    };
    const chatStore = useChatStore();
    chatStore.createChat("claude-cli");
    const activeChatId = chatStore.activeChatId!;
    chatStore.setSessionId(activeChatId, "session-A");

    await vm.handleApprovalRequest({
      sessionId: "session-B",
      approvalId: "ap-2",
      toolName: "create_finding",
      toolLabel: "Create finding",
      group: "findings",
      argumentsSummary: "",
      message: "",
      sensitive: true,
    });
    await flushPromises();

    expect(vm.pendingApproval).toBe(null);
    expect(mockSdk.backend.respondToMcpToolApproval).toHaveBeenCalledWith({
      sessionId: "session-B",
      approvalId: "ap-2",
      approved: false,
    });
  });

  it("clears queued context-menu items when the user explicitly cancels", async () => {
    const deferred = createDeferred();
    mockSdk.backend.sendCliMessage.mockReturnValue(deferred.promise);

    const wrapper = mountChatView();
    const vm = wrapper.vm as unknown as {
      handleSend: (text: string) => Promise<void>;
      handleCancel: () => Promise<void>;
    };
    const chatStore = useChatStore();
    chatStore.createChat("claude-cli");

    const pending = vm.handleSend("first prompt").catch(() => undefined);
    await flushPromises();

    enqueuePendingChatInput({ text: "should be dropped by cancel" });
    await flushPromises();

    await vm.handleCancel();
    await flushPromises();

    deferred.resolve({
      kind: "Ok",
      value: { content: "late reply", mcpActivities: [] },
    });
    await pending;
    await flushPromises();
    // Give any drain setTimeout a window to fire.
    await new Promise((r) => setTimeout(r, 10));
    await flushPromises();

    // Only the original sendCliMessage should have fired: the queued item
    // must be dropped because the user explicitly stopped the session.
    expect(mockSdk.backend.sendCliMessage).toHaveBeenCalledTimes(1);
    const assistantMessages = chatStore.activeMessages.filter(
      (m) => m.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.content).toContain("[Cancelled]");
  });
});
