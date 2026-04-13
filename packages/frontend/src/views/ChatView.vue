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
import {
  CliProvider,
  CLI_PROVIDER_DISPLAY_NAMES,
  type ChatMessage,
  type CliOutputChunkEvent,
  type CliSessionStateEvent,
  type McpToolApprovalRequestEvent,
} from "shared";
import {
  clearPendingChatInputQueue,
  consumePendingChatInput,
  pendingChatInputQueue,
  type PendingChatInput,
} from "../chat-context";

const sdk = useSDK();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();

const isStreaming = ref(false);
const streamingContent = ref("");
const errorMessage = ref<string | undefined>(undefined);
const messagesContainer = ref<HTMLElement | undefined>(undefined);
const cancelledSessionIds = new Set<string>();
let currentTurnId = 0;

let messageCounter = Date.now();
let eventUnsubs: Array<{ stop: () => void }> = [];
const chatExamples = [
  "Show me the last 5 requests in the active Caido context and summarize anything interesting.",
  "Use get_current_context and explain the current project, filter, scope, and whether an override is active.",
  "If the current setup is degraded, summarize the MCP/session state and tell me the next recovery step.",
] as const;

const currentProvider = computed(() =>
  chatStore.activeChat?.providerId ?? CliProvider.Claude
);

const currentProviderName = computed(() =>
  CLI_PROVIDER_DISPLAY_NAMES[currentProvider.value as CliProvider] ?? currentProvider.value
);
const currentSessionState = computed(() => chatStore.activeSessionState);
const hasSession = computed(() =>
  chatStore.activeChatId !== null && chatStore.getSessionId(chatStore.activeChatId) !== undefined
);

onMounted(() => {
  eventUnsubs = [
    sdk.backend.onEvent("cli-output-chunk", handleOutputChunk),
    sdk.backend.onEvent("cli-session-state", (event: CliSessionStateEvent) => {
      chatStore.setSessionState(event);
    }),
    sdk.backend.onEvent("mcp-tool-approval", (event: McpToolApprovalRequestEvent) => {
      void handleApprovalRequest(event);
    }),
  ];
});

// Auto-send whenever a context-menu command enqueues a payload. The watcher
// re-fires when the queue length changes, so a second click during an active
// turn is preserved in the queue and drained when the current turn finishes.
// `immediate: true` handles the initial mount case where an item was already
// enqueued before the view mounted.
watch(
  () => pendingChatInputQueue.value.length,
  (length) => {
    if (length === 0) return;
    if (isStreaming.value) {
      // Leave the item in the queue; the finally block of the active turn
      // drains it. Only warn the user once per streaming session.
      sdk.window.showToast("Action queued — will send after the current turn finishes.", {
        variant: "info",
      });
      return;
    }
    const pending = consumePendingChatInput();
    if (pending === undefined) return;
    // Defer so any reactive state that fires from the same tick (e.g. the
    // tab switch in App.vue) settles before we kick off the network call.
    setTimeout(() => void handleSend(pending), 100);
  },
  { immediate: true },
);

onUnmounted(() => {
  eventUnsubs.forEach((unsub) => unsub.stop());
  eventUnsubs = [];
});

watch(() => chatStore.activeMessages.length, () => nextTick(scrollToBottom));
watch(streamingContent, () => nextTick(scrollToBottom));
watch(() => chatStore.activeChatId, (chatId) => {
  if (chatId !== null) {
    void chatStore.refreshSessionState(chatId);
  }
});

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

async function handleApprovalRequest(event: McpToolApprovalRequestEvent) {
  const currentSessionId =
    chatStore.activeChatId !== null
      ? chatStore.getSessionId(chatStore.activeChatId)
      : undefined;
  const isActiveSession = currentSessionId !== undefined && currentSessionId === event.sessionId;
  const approved = isActiveSession
    ? window.confirm(
      `${event.message}\n\nTool: ${event.toolLabel}\nGroup: ${event.group}\nArguments: ${event.argumentsSummary || "(none)"}`,
    )
    : false;

  const result = await sdk.backend.respondToMcpToolApproval({
    sessionId: event.sessionId,
    approvalId: event.approvalId,
    approved,
  });
  if (result.kind === "Error") {
    errorMessage.value = result.error;
  }
}

async function handleSend(text: string | PendingChatInput) {
  const payload: PendingChatInput =
    typeof text === "string"
      ? { text }
      : text;

  if (isStreaming.value || payload.text.trim() === "") return;
  const myTurn = ++currentTurnId;
  isStreaming.value = true;
  streamingContent.value = "";
  errorMessage.value = undefined;
  const chatId = chatStore.activeChatId;
  if (chatId === null) {
    isStreaming.value = false;
    return;
  }

  const userMsg: ChatMessage = {
    id: `msg-${++messageCounter}`,
    role: "user",
    content: payload.text,
    timestamp: Date.now(),
    providerId: currentProvider.value,
    httpContextAttachment: payload.attachment,
  };
  chatStore.addMessage(chatId, userMsg);

  try {
    await chatStore.saveActiveChat();

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
      await chatStore.refreshSessionState(chatId);
    }

    await settingsStore.syncCaidoRuntimeContext();

    // Wake the backend plugin event loop periodically while streaming.
    // Caido suspends plugin timers when the plugin is idle, so without
    // this ping the backend's heartbeat/watchdog intervals never fire
    // after Claude stops emitting stdout (e.g. when the child process
    // hangs mid-turn). A lightweight getCliSessionState RPC pumps the
    // event loop and lets pending timers run.
    const sessionId = sid;
    const keepAliveHandle = setInterval(() => {
      void sdk.backend.getCliSessionState(sessionId).catch(() => undefined);
    }, 1500);

    try {
      const result = await sdk.backend.sendCliMessage({
        sessionId,
        chatId,
        text: payload.text,
        history: chatStore.activeMessages,
        httpContext: payload.httpContext,
      });

      if (cancelledSessionIds.has(sessionId)) {
        cancelledSessionIds.delete(sessionId);
      } else if (result.kind === "Error") {
        errorMessage.value = result.error;
      } else {
        const assistantMsg: ChatMessage = {
          id: `msg-${++messageCounter}`,
          role: "assistant",
          content: result.value.content || streamingContent.value || "(no response)",
          timestamp: Date.now(),
          providerId: currentProvider.value,
          mcpActivities: result.value.mcpActivities,
        };
        chatStore.addMessage(chatId, assistantMsg);
      }
    } finally {
      clearInterval(keepAliveHandle);
    }
    await chatStore.refreshSessionState(chatId);
    await chatStore.saveActiveChat();
  } catch (e) {
    errorMessage.value = String(e);
  } finally {
    await chatStore.refreshSessionState(chatId).catch(() => undefined);
    await settingsStore.refreshMcpStatus().catch(() => undefined);
    if (myTurn === currentTurnId) {
      isStreaming.value = false;
      streamingContent.value = "";
      const next = consumePendingChatInput();
      if (next !== undefined) {
        setTimeout(() => void handleSend(next), 0);
      }
    }
  }
}

async function handleCancel() {
  const chatId = chatStore.activeChatId;
  if (chatId === null) return;
  clearPendingChatInputQueue();
  const sid = chatStore.getSessionId(chatId);
  if (sid !== undefined) {
    cancelledSessionIds.add(sid);
    await sdk.backend.cancelCliMessage(sid);
  }
  await chatStore.refreshSessionState(chatId);
  const trailing = streamingContent.value.trim();
  chatStore.addMessage(chatId, {
    id: `msg-${++messageCounter}`,
    role: "assistant",
    content: trailing !== "" ? `${streamingContent.value}\n\n[Cancelled]` : "[Cancelled]",
    timestamp: Date.now(),
    providerId: currentProvider.value,
  });
  isStreaming.value = false;
  streamingContent.value = "";
}

function handleNewChat() {
  if (chatStore.activeChatId !== null) {
    void chatStore.closeSession(chatStore.activeChatId);
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
  const chat = chatStore.chats.find((entry) => entry.id === chatId);
  const confirmed = window.confirm(
    `Delete chat "${chat?.title ?? "Untitled chat"}"? This removes the saved conversation for this workspace.`,
  );
  if (!confirmed) return;
  await chatStore.closeSession(chatId);
  await chatStore.deleteChat(chatId);
  if (chatStore.chats.length === 0) handleNewChat();
}

async function handleRenameChat(chatId: string, title: string) {
  await chatStore.renameChat(chatId, title);
}

async function handleRestartSession() {
  const chatId = chatStore.activeChatId;
  if (chatId === null) return;
  await chatStore.restartSession(chatId);
  errorMessage.value = undefined;
  streamingContent.value = "";
}

async function handleCloseSession() {
  const chatId = chatStore.activeChatId;
  if (chatId === null) return;
  await chatStore.closeSession(chatId);
  errorMessage.value = undefined;
  streamingContent.value = "";
}

function buildChatMarkdown() {
  const chat = chatStore.activeChat;
  if (chat === null) return undefined;
  const lines = [
    `# ${chat.title}`,
    `Provider: ${CLI_PROVIDER_DISPLAY_NAMES[chat.providerId as CliProvider] ?? chat.providerId}`,
    `Date: ${new Date(chat.createdAt).toLocaleString()}`,
    "",
    ...chat.messages.flatMap((message) => {
      const sections = [
        `## ${message.role === "user" ? "User" : "Assistant"}`,
      ];
      if (message.httpContextAttachment) {
        sections.push(
          `Attachment: ${message.httpContextAttachment.label} (${message.httpContextAttachment.size} bytes)`,
        );
      }
      sections.push("", message.content);
      if (message.mcpActivities && message.mcpActivities.length > 0) {
        sections.push(
          "",
          "### MCP activity",
          ...message.mcpActivities.map((activity) =>
            `- ${activity.toolLabel} [${activity.state}]${activity.resultSummary ? ` - ${activity.resultSummary}` : ""}`,
          ),
        );
      }
      return sections;
    }),
  ];
  return lines.join("\n\n");
}

async function handleCopyChat() {
  const markdown = buildChatMarkdown();
  if (markdown === undefined) return;
  try {
    await navigator.clipboard.writeText(markdown);
    sdk.window.showToast("Conversation copied to the clipboard.", { variant: "success" });
  } catch (error) {
    errorMessage.value = `Failed to copy the conversation. ${String(error)}`;
  }
}

function handleExportChat() {
  const chat = chatStore.activeChat;
  const markdown = buildChatMarkdown();
  if (chat === null || markdown === undefined) return;
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `drift-${chat.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleProviderChange(provider: string) {
  if (chatStore.activeChatId === null) return;
  if (provider !== currentProvider.value) {
    void chatStore.closeSession(chatStore.activeChatId);
    chatStore.updateProvider(chatStore.activeChatId, provider);
  }
}

defineExpose({
  handleSend,
  handleCancel,
  isStreaming,
  streamingContent,
  errorMessage,
});
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
        @rename="handleRenameChat"
      />
    </SplitterPanel>

    <SplitterPanel :size="80" class="overflow-hidden">
      <div class="flex flex-col h-full">
        <div class="flex items-center border-b border-surface-700">
          <CliStatus
             :provider-id="currentProvider"
             :is-streaming="isStreaming"
             :mcp-status="settingsStore.mcpStatus"
             :session-state="currentSessionState"
             class="flex-1"
           />
           <div v-if="hasSession" class="flex items-center gap-1 mr-2">
             <Button
               icon="fas fa-rotate-right"
               text
               rounded
               size="small"
               severity="secondary"
               :disabled="isStreaming"
               title="Restart session"
               @click="handleRestartSession"
             />
             <Button
               icon="fas fa-xmark"
               text
               rounded
               size="small"
               severity="secondary"
               :disabled="isStreaming"
               title="Close session"
               @click="handleCloseSession"
             />
           </div>
            <Button
              v-if="chatStore.activeMessages.length > 0"
              icon="fas fa-copy"
              text
              rounded
              size="small"
              severity="secondary"
              class="mr-1"
              title="Copy conversation"
              @click="handleCopyChat"
            />
            <Button
              v-if="chatStore.activeMessages.length > 0"
              icon="fas fa-download"
             text
             rounded
             size="small"
            severity="secondary"
            class="mr-2"
            @click="handleExportChat"
          />
        </div>

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
          <MessageList
            :messages="chatStore.activeMessages"
            :examples="chatExamples"
            @use-example="handleSend"
          />
          <div v-if="isStreaming" class="px-4 pb-2">
            <div
              v-if="streamingContent !== ''"
              class="max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-surface-700 text-surface-100 border border-surface-600"
            >
              {{ streamingContent }}<span class="animate-pulse text-primary-400">|</span>
            </div>
            <div v-else class="flex items-center gap-2 text-xs text-surface-400 py-3 px-1">
              <span class="flex gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style="animation-delay: 0ms;" />
                <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style="animation-delay: 150ms;" />
                <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-bounce" style="animation-delay: 300ms;" />
              </span>
              Waiting for {{ currentProviderName }}...
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
