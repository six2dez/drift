import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatMessage, StoredChat } from "shared";
import { useSDK } from "../plugins/sdk";

export const useChatStore = defineStore("chat", () => {
  const sdk = useSDK();

  const chats = ref<StoredChat[]>([]);
  const activeChatId = ref<string | null>(null);
  const sessionIds = ref<Record<string, string>>({});

  const activeChat = computed(() =>
    chats.value.find((c) => c.id === activeChatId.value) ?? null
  );

  const activeMessages = computed(() => activeChat.value?.messages ?? []);

  async function loadChats() {
    try {
      const result = await sdk.backend.getChats();
      if (result.kind === "Ok") {
        chats.value = result.value;
      }
    } catch {
      // Backend not ready or failed, start with empty chats
      chats.value = [];
    }
  }

  function createChat(providerId: string): string {
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const chat: StoredChat = {
      id,
      title: "New Chat",
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

    if (chat.title === "New Chat" && message.role === "user") {
      chat.title = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
    }
  }

  async function saveActiveChat() {
    if (!activeChat.value) return;
    try {
      await sdk.backend.saveChat(activeChat.value);
    } catch {
      // Persistence failed, chat still in memory
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await sdk.backend.deleteChat(chatId);
    } catch {
      // Continue with local deletion even if backend fails
    }
    chats.value = chats.value.filter((c) => c.id !== chatId);
    if (activeChatId.value === chatId) {
      activeChatId.value = chats.value[0]?.id ?? null;
    }
  }

  function updateProvider(chatId: string, providerId: string) {
    const chat = chats.value.find((c) => c.id === chatId);
    if (chat !== undefined) {
      chat.providerId = providerId;
    }
  }

  function setSessionId(chatId: string, sid: string) {
    sessionIds.value[chatId] = sid;
  }

  function getSessionId(chatId: string): string | undefined {
    return sessionIds.value[chatId];
  }

  function clearSession(chatId: string) {
    const sid = sessionIds.value[chatId];
    if (sid) {
      sdk.backend.closeCliSession({ sessionId: sid }).catch(() => {});
      delete sessionIds.value[chatId];
    }
  }

  return {
    chats,
    activeChatId,
    activeChat,
    activeMessages,
    loadChats,
    createChat,
    addMessage,
    saveActiveChat,
    deleteChat,
    updateProvider,
    setSessionId,
    getSessionId,
    clearSession,
  };
});
