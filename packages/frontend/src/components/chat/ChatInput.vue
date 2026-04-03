<script setup lang="ts">
import { ref } from "vue";
import { CliProvider, CLI_PROVIDER_DISPLAY_NAMES } from "shared";
import { useSettingsStore } from "../../stores/settings";

const props = defineProps<{
  provider: string;
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
  cancel: [];
  "update:provider": [provider: string];
}>();

const settingsStore = useSettingsStore();
const input = ref("");

const allProviders = [
  CliProvider.Claude,
  CliProvider.Gemini,
  CliProvider.Codex,
  CliProvider.Copilot,
];

function handleSend() {
  const text = input.value.trim();
  if (!text || props.isStreaming) return;
  emit("send", text);
  input.value = "";
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}
</script>

<template>
  <div style="border-top: 1px solid #333; padding: 12px;">
    <!-- Provider selector -->
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
      <select
        :value="provider"
        style="font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #555; background: #1e1e1e; color: #e0e0e0;"
        @change="(e: Event) => emit('update:provider', (e.target as HTMLSelectElement).value)"
      >
        <option
          v-for="p in allProviders"
          :key="p"
          :value="p"
          style="color: #e0e0e0; background: #1e1e1e;"
        >
          {{ CLI_PROVIDER_DISPLAY_NAMES[p] }}{{ settingsStore.isProviderAvailable(p) ? '' : ' (not found)' }}
        </option>
      </select>
      <span
        style="width: 6px; height: 6px; border-radius: 50%; display: inline-block;"
        :style="{ background: settingsStore.isProviderAvailable(provider) ? '#22c55e' : '#ef4444' }"
      />
    </div>

    <!-- Input area -->
    <div style="display: flex; align-items: flex-end; gap: 8px;">
      <textarea
        v-model="input"
        :disabled="isStreaming"
        placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
        rows="2"
        style="flex: 1; padding: 8px 12px; font-size: 13px; border-radius: 6px; border: 1px solid #555; background: #1e1e1e; color: #e0e0e0; resize: none; outline: none; font-family: inherit;"
        @keydown="handleKeydown"
      />
      <button
        v-if="isStreaming"
        style="padding: 8px 16px; font-size: 13px; border-radius: 6px; background: #ef4444; color: white; border: none; cursor: pointer;"
        @click="emit('cancel')"
      >
        Stop
      </button>
      <button
        v-else
        :disabled="!input.trim() || !settingsStore.isProviderAvailable(provider)"
        style="padding: 8px 16px; font-size: 13px; border-radius: 6px; background: #6366f1; color: white; border: none; cursor: pointer;"
        :style="{ opacity: (!input.trim() || !settingsStore.isProviderAvailable(provider)) ? 0.5 : 1 }"
        @click="handleSend"
      >
        Send
      </button>
    </div>
  </div>
</template>
