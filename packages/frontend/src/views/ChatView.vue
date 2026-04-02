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
  <div class="flex h-full">
    <!-- Sidebar -->
    <ChatSidebar
      :chats="chatStore.chats"
      :active-chat-id="chatStore.activeChatId"
      @select="handleSelectChat"
      @create="handleNewChat"
      @delete="handleDeleteChat"
    />

    <!-- Main chat area -->
    <div class="flex flex-col flex-1 min-w-0">
      <!-- Status bar -->
      <div class="flex items-center gap-2">
        <CliStatus
          :provider-id="currentProvider"
          :is-streaming="isStreaming"
          class="flex-1"
        />
      </div>

      <!-- Error banner -->
      <div
        v-if="errorMessage"
        class="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded flex items-center gap-2"
      >
        <span class="flex-1">{{ errorMessage }}</span>
        <button
          class="text-red-300 hover:text-white text-xs underline"
          @click="errorMessage = null"
        >
          Dismiss
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="flex-1 overflow-y-auto">
        <MessageList :messages="chatStore.activeMessages" />

        <!-- Streaming indicator -->
        <div v-if="isStreaming" class="px-4 pb-2">
          <div
            v-if="streamingContent"
            class="max-w-[85%] mr-auto px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 opacity-70"
          >
            {{ streamingContent }}<span class="animate-pulse">|</span>
          </div>
          <div v-else class="flex items-center gap-2 text-xs text-surface-400 py-2">
            <span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
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
