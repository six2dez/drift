import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatMessage, CliSessionStateEvent, StoredChat } from "shared";
import { useSDK } from "../plugins/sdk";
import { INIT_REQUEST_TIMEOUT_MS, withTimeout } from "../utils/promise-timeout";

const DEFAULT_CHAT_TITLE = "New Chat";

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateTitle(value: string, maxLength = 60): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function inferPromptTitle(content: string): string | undefined {
  const normalized = compactWhitespace(content);
  if (normalized === "") return undefined;

  if (/last\s+\d+\s+requests?/i.test(normalized) || /search_history/i.test(normalized)) {
    return "History review";
  }
  if (/get_current_context|current context|override/i.test(normalized)) {
    return "Context review";
  }
  if (/list .*findings?|findings?.*details/i.test(normalized)) {
    return "Findings review";
  }
  if (/proof[- ]of[- ]concept|generate .*poc/i.test(normalized)) {
    return "PoC generation";
  }
  if (/bug bounty report|write a .*report/i.test(normalized)) {
    return "Report drafting";
  }

  return truncateTitle(normalized);
}

function deriveChatTitle(message: ChatMessage): string {
  const promptTitle = inferPromptTitle(message.content);
  const attachmentLabel = compactWhitespace(message.httpContextAttachment?.label ?? "");

  if (attachmentLabel !== "") {
    if (/javascript/i.test(attachmentLabel)) return "JavaScript analysis";
    if (/response/i.test(attachmentLabel)) return "HTTP response analysis";
    if (/vulnerab/i.test(message.content)) return "HTTP request vulnerability review";
    if (/request/i.test(attachmentLabel)) return "HTTP request analysis";
    if (promptTitle !== undefined) {
      return truncateTitle(`${attachmentLabel}: ${promptTitle}`);
    }
    return truncateTitle(attachmentLabel);
  }

  return promptTitle ?? DEFAULT_CHAT_TITLE;
}

export const useChatStore = defineStore("chat", () => {
  const sdk = useSDK();

  const chats = ref<StoredChat[]>([]);
  const activeChatId = ref<string | null>(null);
  const sessionIds = ref<Record<string, string>>({});
  const sessionStates = ref<Record<string, CliSessionStateEvent>>({});
  const initError = ref<string | null>(null);
  const persistenceError = ref<string | null>(null);

  const activeChat = computed(() =>
    chats.value.find((c) => c.id === activeChatId.value) ?? null
  );

  const activeMessages = computed(() => activeChat.value?.messages ?? []);
  const activeSessionState = computed(() =>
    activeChatId.value !== null ? sessionStates.value[activeChatId.value] ?? null : null
  );

  function setPersistenceError(message: string, toastVariant: "warning" | "error" = "error") {
    persistenceError.value = message;
    sdk.window.showToast(message, { variant: toastVariant });
  }

  function clearPersistenceError() {
    persistenceError.value = null;
  }

  async function loadChats() {
    try {
      const result = await withTimeout(
        sdk.backend.getChats(),
        INIT_REQUEST_TIMEOUT_MS,
        "Loading saved chats",
      );
      if (result.kind === "Ok") {
        chats.value = result.value;
        initError.value = null;
      } else {
        chats.value = [];
        initError.value = result.error;
      }
    } catch (error) {
      chats.value = [];
      initError.value = `Failed to load chats: ${String(error)}`;
    }
  }

  function createChat(providerId: string): string {
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chat: StoredChat = {
      id,
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      providerId: providerId as StoredChat["providerId"],
      cliSessionId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    chats.value = [chat, ...chats.value];
    activeChatId.value = id;
    return id;
  }

  function addMessage(chatId: string, message: ChatMessage) {
    const chat = chats.value.find((c) => c.id === chatId);
    if (!chat) return;
    chat.messages = [...chat.messages, message];
    chat.updatedAt = Date.now();

    if (chat.title === DEFAULT_CHAT_TITLE && message.role === "user") {
      chat.title = deriveChatTitle(message);
    }
  }

  async function saveChatById(chatId: string) {
    const chat = chats.value.find((entry) => entry.id === chatId);
    if (chat === undefined) return;
    try {
      const result = await sdk.backend.saveChat(chat);
      if (result.kind === "Error") {
        setPersistenceError(`Failed to persist the chat. Changes remain in memory only. ${result.error}`);
        return;
      }
      clearPersistenceError();
    } catch (error) {
      setPersistenceError(`Failed to persist the chat. Changes remain in memory only. ${String(error)}`);
    }
  }

  async function saveActiveChat() {
    if (!activeChat.value) return;
    await saveChatById(activeChat.value.id);
  }

  async function deleteChat(chatId: string) {
    try {
      const result = await sdk.backend.deleteChat(chatId);
      if (result.kind === "Error") {
        setPersistenceError(`Failed to delete the chat from persistent storage. The chat was removed only from the current session. ${result.error}`);
      } else {
        clearPersistenceError();
      }
    } catch (error) {
      setPersistenceError(`Failed to delete the chat from persistent storage. The chat was removed only from the current session. ${String(error)}`);
    }
    chats.value = chats.value.filter((c) => c.id !== chatId);
    delete sessionIds.value[chatId];
    delete sessionStates.value[chatId];
    if (activeChatId.value === chatId) {
      activeChatId.value = chats.value[0]?.id ?? null;
    }
  }

  function updateProvider(chatId: string, providerId: string) {
    const chat = chats.value.find((c) => c.id === chatId);
    if (chat !== undefined) {
      chat.providerId = providerId;
      chat.updatedAt = Date.now();
    }
  }

  async function renameChat(chatId: string, title: string) {
    const chat = chats.value.find((entry) => entry.id === chatId);
    if (chat === undefined) return;
    const normalizedTitle = compactWhitespace(title);
    chat.title = normalizedTitle === "" ? DEFAULT_CHAT_TITLE : truncateTitle(normalizedTitle, 80);
    chat.updatedAt = Date.now();
    await saveChatById(chatId);
  }

  function setSessionId(chatId: string, sid: string) {
    sessionIds.value[chatId] = sid;
  }

  function getSessionId(chatId: string): string | undefined {
    return sessionIds.value[chatId];
  }

  function setSessionState(event: CliSessionStateEvent) {
    sessionStates.value[event.chatId] = event;
    sessionIds.value[event.chatId] = event.sessionId;
  }

  function getSessionState(chatId: string): CliSessionStateEvent | undefined {
    return sessionStates.value[chatId];
  }

  async function refreshSessionState(chatId: string) {
    const sid = sessionIds.value[chatId];
    if (!sid) return;
    try {
      const result = await sdk.backend.getCliSessionState(sid);
      if (result.kind === "Error") {
        setPersistenceError(`Failed to refresh the CLI session status for chat ${chatId}. ${result.error}`, "warning");
        return;
      }
      if (result.value === undefined) {
        delete sessionStates.value[chatId];
        return;
      }
      setSessionState(result.value);
    } catch (error) {
      setPersistenceError(`Failed to refresh the CLI session status for chat ${chatId}. ${String(error)}`, "warning");
    }
  }

  async function closeSession(chatId: string) {
    const sid = sessionIds.value[chatId];
    if (sid === undefined) {
      delete sessionStates.value[chatId];
      return;
    }
    try {
      const result = await sdk.backend.closeCliSession({ sessionId: sid });
      if (result.kind === "Error") {
        setPersistenceError(`Failed to close the CLI session cleanly for chat ${chatId}. ${result.error}`, "warning");
      }
    } catch (error) {
      setPersistenceError(`Failed to close the CLI session cleanly for chat ${chatId}. ${String(error)}`, "warning");
    } finally {
      delete sessionIds.value[chatId];
    }
  }

  function clearSession(chatId: string) {
    void closeSession(chatId);
  }

  async function restartSession(chatId: string) {
    await closeSession(chatId);
    sessionStates.value[chatId] = {
      chatId,
      sessionId: "",
      providerId:
        chats.value.find((chat) => chat.id === chatId)?.providerId ?? "unknown",
      state: "stopped",
      reason: "Session reset. The next message will start a fresh provider turn.",
      mcpAttached: false,
      updatedAt: Date.now(),
    };
    delete sessionIds.value[chatId];
  }

  function clearSessionState(chatId: string) {
    delete sessionStates.value[chatId];
  }

  return {
    chats,
    activeChatId,
    activeChat,
    activeMessages,
    activeSessionState,
    initError,
    persistenceError,
    loadChats,
    createChat,
    addMessage,
    saveActiveChat,
    saveChatById,
    deleteChat,
    updateProvider,
    renameChat,
    setSessionId,
    getSessionId,
    setSessionState,
    getSessionState,
    refreshSessionState,
    closeSession,
    restartSession,
    clearSession,
    clearSessionState,
    clearPersistenceError,
  };
});
