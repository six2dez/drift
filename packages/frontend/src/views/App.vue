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

    if (chatStore.chats.length === 0) {
      const raw = settingsStore.settings?.activeProvider ?? CliProvider.Claude;
      const validProviders = Object.values(CliProvider) as string[];
      const providerId = validProviders.includes(raw) ? raw : CliProvider.Claude;
      chatStore.createChat(providerId);
    } else {
      chatStore.activeChatId = chatStore.chats[0]?.id ?? null;
    }
  } catch (err) {
    initError.value = `Init failed: ${(err as Error).message}`;
  }

  ready.value = true;
});
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%; width: 100%; background: #141414;">
    <!-- Header -->
    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #333;">
      <span style="font-size: 16px; font-weight: 600; color: #e0e0e0;">Drift</span>
      <span style="font-size: 11px; color: #888;">CLI AI Agent</span>
      <div style="flex: 1;" />
      <button
        v-for="tab in (['chat', 'settings'] as const)"
        :key="tab"
        style="padding: 4px 12px; font-size: 13px; border-radius: 4px; border: none; cursor: pointer; text-transform: capitalize;"
        :style="{
          background: activeTab === tab ? '#6366f1' : 'transparent',
          color: activeTab === tab ? '#fff' : '#aaa',
        }"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Init error -->
    <div v-if="initError" style="margin: 8px 16px 0; padding: 8px 12px; font-size: 12px; color: #f87171; background: #1c1917; border: 1px solid #7f1d1d; border-radius: 6px;">
      {{ initError }}
    </div>

    <!-- Content -->
    <div v-if="!ready" style="flex: 1; display: flex; align-items: center; justify-content: center; color: #888;">
      Loading...
    </div>
    <div v-else style="flex: 1; overflow: hidden;">
      <ChatView v-if="activeTab === 'chat'" />
      <SettingsView v-else />
    </div>
  </div>
</template>
