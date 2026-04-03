<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import MessageList from "../components/chat/MessageList.vue";
import ChatInput from "../components/chat/ChatInput.vue";
import CliStatus from "../components/chat/CliStatus.vue";
import ChatSidebar from "../components/chat/ChatSidebar.vue";
import { useSDK } from "../plugins/sdk";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";

import { CliProvider, type ChatMessage, type CliOutputChunkEvent } from "shared";

const sdk = useSDK();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();

const isStreaming = ref(false);
const streamingContent = ref("");
const errorMessage = ref<string | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);

let messageCounter = Date.now();
let eventUnsub: (() => void) | null = null;

const currentProvider = computed(() =>
  chatStore.activeChat?.providerId ?? CliProvider.Claude
);

onMounted(() => {
  eventUnsub = sdk.backend.onEvent("cli-output-chunk", handleOutputChunk);
});

onUnmounted(() => {
  eventUnsub?.();
});

// Auto-scroll on new messages
watch(
  () => chatStore.activeMessages.length,
  () => nextTick(scrollToBottom)
);
watch(streamingContent, () => nextTick(scrollToBottom));

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function handleOutputChunk(event: CliOutputChunkEvent) {
  const sid = chatStore.activeChatId
    ? chatStore.getSessionId(chatStore.activeChatId)
    : null;
  if (!sid || event.sessionId !== sid) return;
  if (event.stream === "stdout") {
    streamingContent.value += event.delta;
  }
}

async function handleSend(text: string) {
  if (isStreaming.value || !text.trim()) return;
  errorMessage.value = null;

  const chatId = chatStore.activeChatId;
  if (!chatId) return;

  // Add user message
  const userMsg: ChatMessage = {
    id: `msg-${++messageCounter}`,
    role: "user",
    content: text,
    timestamp: Date.now(),
    providerId: currentProvider.value as ChatMessage["providerId"],
  };
  chatStore.addMessage(chatId, userMsg);

  // Create session if needed
  let sid = chatStore.getSessionId(chatId);
  if (!sid) {
    const result = await sdk.backend.createCliSession({
      providerId: currentProvider.value as ChatMessage["providerId"],
      chatId,
    });
    if (result.kind === "Error") {
      errorMessage.value = result.error;
      return;
    }
    sid = result.value;
    chatStore.setSessionId(chatId, sid);
  }

  // Send
  isStreaming.value = true;
  streamingContent.value = "";

  try {
    const result = await sdk.backend.sendCliMessage({
      sessionId: sid,
      chatId,
      text,
      history: chatStore.activeMessages.slice(-10),
    });

    if (result.kind === "Error") {
      // Fix #9: Errors go to banner, not chat messages
      errorMessage.value = result.error;
    } else {
      const assistantMsg: ChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "assistant",
        content: result.value || streamingContent.value || "(no response)",
        timestamp: Date.now(),
        providerId: currentProvider.value as ChatMessage["providerId"],
      };
      chatStore.addMessage(chatId, assistantMsg);
    }

    // Persist
    await chatStore.saveActiveChat();
  } catch (err) {
    errorMessage.value = (err as Error).message;
  } finally {
    isStreaming.value = false;
    streamingContent.value = "";
  }
}

async function handleCancel() {
  const chatId = chatStore.activeChatId;
  if (!chatId) return;
  const sid = chatStore.getSessionId(chatId);
  if (sid) {
    await sdk.backend.cancelCliMessage(sid);
  }
  isStreaming.value = false;

  if (streamingContent.value.trim()) {
    const partialMsg: ChatMessage = {
      id: `msg-${++messageCounter}`,
      role: "assistant",
      content: streamingContent.value + "\n\n[Cancelled]",
      timestamp: Date.now(),
      providerId: currentProvider.value as ChatMessage["providerId"],
    };
    chatStore.addMessage(chatId, partialMsg);
  }
  streamingContent.value = "";
}

function handleNewChat() {
  if (chatStore.activeChatId) {
    chatStore.clearSession(chatStore.activeChatId);
  }
  const providerId = settingsStore.settings?.activeProvider ?? CliProvider.Claude;
  chatStore.createChat(providerId);
  errorMessage.value = null;
  streamingContent.value = "";
}

function handleSelectChat(chatId: string) {
  chatStore.activeChatId = chatId;
  errorMessage.value = null;
  streamingContent.value = "";
}

async function handleDeleteChat(chatId: string) {
  chatStore.clearSession(chatId);
  await chatStore.deleteChat(chatId);
  if (chatStore.chats.length === 0) {
    handleNewChat();
  }
}

function handleProviderChange(provider: string) {
  if (!chatStore.activeChatId) return;
  if (provider !== currentProvider.value) {
    chatStore.clearSession(chatStore.activeChatId);
  }
}
</script>

<template>
  <div style="display: flex; height: 100%;">
    <!-- Sidebar -->
    <ChatSidebar
      :chats="chatStore.chats"
      :active-chat-id="chatStore.activeChatId"
      @select="handleSelectChat"
      @create="handleNewChat"
      @delete="handleDeleteChat"
    />

    <!-- Main chat area -->
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      <CliStatus
        :provider-id="currentProvider"
        :is-streaming="isStreaming"
      />

      <!-- Error banner -->
      <div
        v-if="errorMessage"
        style="margin: 8px 16px 0; padding: 8px 12px; font-size: 12px; color: #f87171; background: #1c1917; border: 1px solid #7f1d1d; border-radius: 6px; display: flex; align-items: center; gap: 8px;"
      >
        <span style="flex: 1;">{{ errorMessage }}</span>
        <button
          style="color: #fca5a5; font-size: 11px; text-decoration: underline; background: none; border: none; cursor: pointer;"
          @click="errorMessage = null"
        >
          Dismiss
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" style="flex: 1; overflow-y: auto;">
        <MessageList :messages="chatStore.activeMessages" />

        <!-- Streaming indicator -->
        <div v-if="isStreaming" style="padding: 0 16px 8px;">
          <div
            v-if="streamingContent"
            style="max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 13px; white-space: pre-wrap; background: #2a2a2a; color: #ccc; opacity: 0.7;"
          >
            {{ streamingContent }}<span style="animation: pulse 1s infinite;">|</span>
          </div>
          <div v-else style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #888; padding: 8px 0;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #eab308; display: inline-block; animation: pulse 1s infinite;" />
            Waiting for response...
          </div>
        </div>
      </div>

      <!-- Input -->
      <ChatInput
        :provider="currentProvider"
        :is-streaming="isStreaming"
        @send="handleSend"
        @cancel="handleCancel"
        @update:provider="handleProviderChange"
      />
    </div>
  </div>
</template>
