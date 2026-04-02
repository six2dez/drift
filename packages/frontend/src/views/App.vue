<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useChatStore } from "../stores/chat";
import { CliProvider } from "shared";
import ChatView from "./ChatView.vue";
import SettingsView from "./SettingsView.vue";

const activeTab = ref<"chat" | "settings">("chat");
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const ready = ref(false);
const initError = ref<string | null>(null);

onMounted(async () => {
  try {
    await Promise.allSettled([
      settingsStore.initialize(),
      chatStore.loadChats(),
    ]);

    // Create a default chat if none exist
    if (chatStore.chats.length === 0) {
      const raw = settingsStore.settings?.activeProvider ?? CliProvider.Claude;
      const validProviders = Object.values(CliProvider) as string[];
      const providerId = validProviders.includes(raw) ? raw : CliProvider.Claude;
      chatStore.createChat(providerId);
    } else {
      chatStore.activeChatId = chatStore.chats[0]?.id ?? null;
    }
  } catch (err) {
    initError.value = `Initialization failed: ${(err as Error).message}`;
  }

  // Always set ready to true so the UI is usable
  ready.value = true;
});
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-0 dark:bg-surface-950">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-surface-200 dark:border-surface-700">
      <span class="text-lg font-semibold text-surface-900 dark:text-surface-100">Drift</span>
      <span class="text-xs text-surface-400">CLI AI Agent</span>
      <div class="flex-1" />
      <button
        class="px-3 py-1 text-sm rounded"
        :class="activeTab === 'chat' ? 'bg-primary-500 text-white' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'"
        @click="activeTab = 'chat'"
      >
        Chat
      </button>
      <button
        class="px-3 py-1 text-sm rounded"
        :class="activeTab === 'settings' ? 'bg-primary-500 text-white' : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800'"
        @click="activeTab = 'settings'"
      >
        Settings
      </button>
    </div>

    <!-- Init error -->
    <div v-if="initError" class="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded">
      {{ initError }}
    </div>

    <!-- Content -->
    <div v-if="!ready" class="flex-1 flex items-center justify-center text-surface-400">
      Loading...
    </div>
    <div v-else class="flex-1 overflow-hidden">
      <ChatView v-if="activeTab === 'chat'" />
      <SettingsView v-else />
    </div>
  </div>
</template>
