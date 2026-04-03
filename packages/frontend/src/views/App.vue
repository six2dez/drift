<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useChatStore } from "../stores/chat";
import { CliProvider } from "shared";
import ChatView from "./ChatView.vue";
import SettingsView from "./SettingsView.vue";
import Button from "primevue/button";

const activeTab = ref<"chat" | "settings">("chat");
const settingsStore = useSettingsStore();
const chatStore = useChatStore();
const ready = ref(false);
const initError = ref<string | undefined>(undefined);

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
    <div class="flex items-center px-4 py-2 border-b border-surface-700 gap-3">
      <span class="text-base font-bold text-surface-100">Drift</span>
      <span class="text-xs text-surface-500">CLI AI Agent</span>
      <div class="flex-1" />
      <Button
        label="Chat"
        icon="fas fa-comments"
        :severity="activeTab === 'chat' ? undefined : 'secondary'"
        :text="activeTab !== 'chat'"
        size="small"
        @click="activeTab = 'chat'"
      />
      <Button
        label="Settings"
        icon="fas fa-cog"
        :severity="activeTab === 'settings' ? undefined : 'secondary'"
        :text="activeTab !== 'settings'"
        size="small"
        @click="activeTab = 'settings'"
      />
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
      <i class="fas fa-spinner fa-spin mr-2" /> Loading...
    </div>
    <div v-else class="flex-1 overflow-hidden">
      <ChatView v-if="activeTab === 'chat'" />
      <SettingsView v-else />
    </div>
  </div>
</template>
