<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useChatStore } from "../stores/chat";
import { CliProvider } from "shared";
import ChatView from "./ChatView.vue";
import SettingsView from "./SettingsView.vue";
import TabMenu from "primevue/tabmenu";

const activeTab = ref(0);
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const ready = ref(false);
const initError = ref<string | undefined>(undefined);

const tabs = [
  { label: "Chat", icon: "fas fa-comments" },
  { label: "Settings", icon: "fas fa-cog" },
];

onMounted(async () => {
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
</script>

<template>
  <div class="flex flex-col h-full w-full bg-surface-800">
    <!-- Header -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-surface-700">
      <span class="text-lg font-semibold text-surface-100">Drift</span>
      <span class="text-xs text-surface-400">CLI AI Agent</span>
      <div class="flex-1" />
      <TabMenu v-model:activeIndex="activeTab" :model="tabs" />
    </div>

    <!-- Init error -->
    <div
      v-if="initError !== undefined"
      class="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded"
    >
      {{ initError }}
    </div>

    <!-- Content -->
    <div v-if="!ready" class="flex-1 flex items-center justify-center text-surface-400">
      Loading...
    </div>
    <div v-else class="flex-1 overflow-hidden">
      <ChatView v-if="activeTab === 0" />
      <SettingsView v-else />
    </div>
  </div>
</template>
