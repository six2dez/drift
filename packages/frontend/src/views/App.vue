<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useChatStore } from "../stores/chat";
import { useScannerStore } from "../stores/scanner";
import { CliProvider } from "shared";
import ChatView from "./ChatView.vue";
import SettingsView from "./SettingsView.vue";
import HelpView from "./HelpView.vue";
import ScannerView from "./ScannerView.vue";
import { pendingChatInputQueue } from "../chat-context";
import { pendingActiveScanQueue } from "../scanner-context";

const activeTab = ref<"chat" | "scanner" | "settings" | "help">("chat");
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const scannerStore = useScannerStore();
const ready = ref(false);
const initError = ref<string | undefined>(undefined);

// Force-switch to the chat tab whenever a context-menu command enqueues
// a pending payload. Without this, a click on "Analyze Request" while
// the user is currently looking at Settings or Help would deposit the
// prompt into ChatView but leave it invisible behind the active tab.
watch(
  () => pendingChatInputQueue.value.length,
  (length) => {
    if (length > 0) activeTab.value = "chat";
  },
);

// Same pattern for active-scan requests coming from the context menu.
watch(
  () => pendingActiveScanQueue.value.length,
  (length) => {
    if (length > 0) activeTab.value = "scanner";
  },
);

const mcpBadgeLabel = computed(() => {
  if (!settingsStore.settings.mcp.enabled) return "MCP Disabled";
  if (settingsStore.mcpStatus?.running) {
    return `MCP ${settingsStore.mcpStatus.toolCount}/${settingsStore.mcpStatus.supportedToolCount}`;
  }
  if (
    settingsStore.mcpStatus?.authState === "invalid" ||
    settingsStore.mcpStatus?.authState === "error"
  ) {
    return "MCP Auth Error";
  }
  if (settingsStore.loading) return "MCP Checking";
  return "MCP Stopped";
});

const mcpBadgeClass = computed(() => {
  if (!settingsStore.settings.mcp.enabled) {
    return "border-surface-600 text-surface-500 hover:text-surface-300";
  }
  if (settingsStore.mcpStatus?.running) {
    return "border-green-700 text-green-300 hover:text-green-200";
  }
  if (
    settingsStore.mcpStatus?.authState === "invalid" ||
    settingsStore.mcpStatus?.authState === "error"
  ) {
    return "border-red-800 text-red-300 hover:text-red-200";
  }
  return "border-amber-700 text-amber-300 hover:text-amber-200";
});

const mcpDotClass = computed(() => {
  if (!settingsStore.settings.mcp.enabled) return "bg-surface-500";
  if (settingsStore.mcpStatus?.running) return "bg-green-400";
  if (
    settingsStore.mcpStatus?.authState === "invalid" ||
    settingsStore.mcpStatus?.authState === "error"
  ) {
    return "bg-red-400";
  }
  return "bg-amber-400";
});

onMounted(async () => {
  // The scanner-engaged gate is tied to the whole Drift plugin page
  // lifecycle, NOT to the Scanner tab being active. A user on the
  // Chat tab with passive scanning enabled still gets findings —
  // closing the Drift page is what halts them.
  void scannerStore.setEngaged(true);
  void scannerStore.refresh();
  try {
    await Promise.allSettled([
      settingsStore.initialize(),
      chatStore.loadChats(),
    ]);
    if (chatStore.chats.length === 0) {
      const raw = settingsStore.settings?.activeProvider ?? CliProvider.Claude;
      const valid = Object.values(CliProvider) as string[];
      chatStore.createChat(valid.includes(raw) ? raw : CliProvider.Claude);
    } else {
      chatStore.activeChatId = chatStore.chats[0]?.id ?? null;
    }
  } catch (e) {
    initError.value = `Init failed: ${String(e)}`;
  }
  ready.value = true;
});

onUnmounted(() => {
  void scannerStore.setEngaged(false);
});
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-800">
    <!-- Header -->
    <div class="flex items-center px-4 py-2 border-b border-surface-700 gap-3">
      <span class="text-base font-bold text-surface-100">Drift</span>
      <span class="text-xs text-surface-500">CLI AI Agent</span>
      <button
        class="ml-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] transition-colors"
        :class="mcpBadgeClass"
        @click="activeTab = 'settings'"
      >
        <span class="h-1.5 w-1.5 rounded-full" :class="mcpDotClass" />
        {{ mcpBadgeLabel }}
      </button>
      <div class="flex-1" />
      <button
        class="px-3 py-1.5 text-sm rounded flex items-center gap-1.5"
        :class="activeTab === 'chat'
          ? 'bg-primary-600 text-white'
          : 'text-surface-400 hover:text-surface-200'"
        @click="activeTab = 'chat'"
      >
        <i class="fas fa-comments" /> Chat
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded flex items-center gap-1.5"
        :class="activeTab === 'scanner'
          ? 'bg-primary-600 text-white'
          : 'text-surface-400 hover:text-surface-200'"
        @click="activeTab = 'scanner'"
      >
        <i class="fas fa-radar" /> Scanner
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded flex items-center gap-1.5"
        :class="activeTab === 'settings'
          ? 'bg-primary-600 text-white'
          : 'text-surface-400 hover:text-surface-200'"
        @click="activeTab = 'settings'"
      >
        <i class="fas fa-cog" /> Settings
      </button>
      <button
        class="px-3 py-1.5 text-sm rounded flex items-center gap-1.5"
        :class="activeTab === 'help'
          ? 'bg-primary-600 text-white'
          : 'text-surface-400 hover:text-surface-200'"
        @click="activeTab = 'help'"
      >
        <i class="fas fa-circle-question" /> Help
      </button>
    </div>

    <!-- Init error -->
    <div
      v-if="initError || chatStore.initError || (activeTab === 'chat' && settingsStore.initError)"
      class="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded"
    >
      {{ initError || chatStore.initError || settingsStore.initError }}
    </div>

    <!-- Content -->
    <div v-if="!ready" class="flex-1 flex items-center justify-center text-surface-400">
      <i class="fas fa-spinner fa-spin mr-2" /> Loading...
    </div>
    <div v-else class="flex-1 overflow-hidden">
      <div v-show="activeTab === 'chat'" class="h-full">
        <ChatView />
      </div>
      <div v-show="activeTab === 'scanner'" class="h-full overflow-y-auto">
        <ScannerView />
      </div>
      <div v-show="activeTab === 'settings'" class="h-full overflow-y-auto">
        <SettingsView />
      </div>
      <div v-show="activeTab === 'help'" class="h-full overflow-y-auto">
        <HelpView />
      </div>
    </div>
  </div>
</template>
