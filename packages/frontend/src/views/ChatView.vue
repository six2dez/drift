<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import Button from "primevue/button";
import MessageList from "../components/chat/MessageList.vue";
import ChatInput from "../components/chat/ChatInput.vue";
import CliStatus from "../components/chat/CliStatus.vue";
import ChatSidebar from "../components/chat/ChatSidebar.vue";
import { useSDK } from "../plugins/sdk";
import { useChatStore } from "../stores/chat";
import { useSettingsStore } from "../stores/settings";
import { getPendingContext } from "../index";
import { CliProvider, type ChatMessage, type CliOutputChunkEvent } from "shared";

const sdk = useSDK();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();

const isStreaming = ref(false);
const streamingContent = ref("");
const errorMessage = ref<string | undefined>(undefined);
const messagesContainer = ref<HTMLElement | undefined>(undefined);

let messageCounter = Date.now();
let eventUnsub: (() => void) | undefined;

const currentProvider = computed(() =>
  chatStore.activeChat?.providerId ?? CliProvider.Claude
);

onMounted(() => {
  eventUnsub = sdk.backend.onEvent("cli-output-chunk", handleOutputChunk);

  // Auto-send if navigated from context menu with pending context
  const pending = getPendingContext();
  if (pending !== undefined) {
    // Small delay to let the component fully mount
    setTimeout(() => handleSend(pending), 100);
  }
});

onUnmounted(() => {
  eventUnsub?.();
});

watch(() => chatStore.activeMessages.length, () => nextTick(scrollToBottom));
watch(streamingContent, () => nextTick(scrollToBottom));

function scrollToBottom() {
  if (messagesContainer.value !== undefined) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function handleOutputChunk(event: CliOutputChunkEvent) {
  const sid = chatStore.activeChatId !== null
    ? chatStore.getSessionId(chatStore.activeChatId)
    : undefined;
  if (sid === undefined || event.sessionId !== sid) return;
  // Show both stdout and stderr in streaming view
  streamingContent.value += event.delta;
}

async function handleSend(text: string) {
  if (isStreaming.value || text.trim() === "") return;
  errorMessage.value = undefined;
  const chatId = chatStore.activeChatId;
  if (chatId === null) return;

  const userMsg: ChatMessage = {
    id: `msg-${++messageCounter}`,
    role: "user",
    content: text,
    timestamp: Date.now(),
    providerId: currentProvider.value,
  };
  chatStore.addMessage(chatId, userMsg);

  let sid = chatStore.getSessionId(chatId);
  if (sid === undefined) {
    const result = await sdk.backend.createCliSession({
      providerId: currentProvider.value,
      chatId,
    });
    if (result.kind === "Error") {
      errorMessage.value = result.error;
      return;
    }
    sid = result.value;
    chatStore.setSessionId(chatId, sid);
  }

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
      errorMessage.value = result.error;
    } else {
      const assistantMsg: ChatMessage = {
        id: `msg-${++messageCounter}`,
        role: "assistant",
        content: result.value || streamingContent.value || "(no response)",
        timestamp: Date.now(),
        providerId: currentProvider.value,
      };
      chatStore.addMessage(chatId, assistantMsg);
    }
    await chatStore.saveActiveChat();
  } catch (e) {
    errorMessage.value = String(e);
  } finally {
    isStreaming.value = false;
    streamingContent.value = "";
  }
}

async function handleCancel() {
  const chatId = chatStore.activeChatId;
  if (chatId === null) return;
  const sid = chatStore.getSessionId(chatId);
  if (sid !== undefined) {
    await sdk.backend.cancelCliMessage(sid);
  }
  isStreaming.value = false;
  if (streamingContent.value.trim() !== "") {
    chatStore.addMessage(chatId, {
      id: `msg-${++messageCounter}`,
      role: "assistant",
      content: streamingContent.value + "\n\n[Cancelled]",
      timestamp: Date.now(),
      providerId: currentProvider.value,
    });
  }
  streamingContent.value = "";
}

function handleNewChat() {
  if (chatStore.activeChatId !== null) {
    chatStore.clearSession(chatStore.activeChatId);
  }
  chatStore.createChat(settingsStore.settings?.activeProvider ?? CliProvider.Claude);
  errorMessage.value = undefined;
  streamingContent.value = "";
}

function handleSelectChat(chatId: string) {
  chatStore.activeChatId = chatId;
  errorMessage.value = undefined;
  streamingContent.value = "";
}

async function handleDeleteChat(chatId: string) {
  chatStore.clearSession(chatId);
  await chatStore.deleteChat(chatId);
  if (chatStore.chats.length === 0) handleNewChat();
}

function handleProviderChange(provider: string) {
  if (chatStore.activeChatId === null) return;
  if (provider !== currentProvider.value) {
    chatStore.clearSession(chatStore.activeChatId);
    chatStore.updateProvider(chatStore.activeChatId, provider);
  }
}
</script>

<template>
  <Splitter class="h-full border-none">
    <SplitterPanel :size="20" :minSize="15" class="overflow-hidden">
      <ChatSidebar
        :chats="chatStore.chats"
        :active-chat-id="chatStore.activeChatId"
        @select="handleSelectChat"
        @create="handleNewChat"
        @delete="handleDeleteChat"
      />
    </SplitterPanel>

    <SplitterPanel :size="80" class="overflow-hidden">
      <div class="flex flex-col h-full">
        <CliStatus :provider-id="currentProvider" :is-streaming="isStreaming" />

        <!-- Error -->
        <div
          v-if="errorMessage !== undefined"
          class="mx-3 mt-2 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded flex items-center gap-2"
        >
          <span class="flex-1">{{ errorMessage }}</span>
          <Button
            label="Dismiss"
            text
            size="small"
            severity="danger"
            @click="errorMessage = undefined"
          />
        </div>

        <!-- Messages -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto">
          <MessageList :messages="chatStore.activeMessages" />
          <div v-if="isStreaming" class="px-4 pb-2">
            <div
              v-if="streamingContent !== ''"
              class="max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-surface-700 text-surface-100 opacity-70"
            >
              {{ streamingContent }}<span class="animate-pulse">|</span>
            </div>
            <div v-else class="flex items-center gap-2 text-xs text-surface-400 py-2">
              <i class="fas fa-spinner fa-spin" />
              Waiting for response...
            </div>
          </div>
        </div>

        <ChatInput
          :provider="currentProvider"
          :is-streaming="isStreaming"
          @send="handleSend"
          @cancel="handleCancel"
          @update:provider="handleProviderChange"
        />
      </div>
    </SplitterPanel>
  </Splitter>
</template>
