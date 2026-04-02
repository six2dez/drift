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
  <div class="border-t border-surface-200 dark:border-surface-700 p-3">
    <!-- Provider selector -->
    <div class="flex items-center gap-2 mb-2">
      <select
        :value="provider"
        class="text-xs px-2 py-1 rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
        @change="(e: Event) => emit('update:provider', (e.target as HTMLSelectElement).value)"
      >
        <option
          v-for="p in allProviders"
          :key="p"
          :value="p"
        >
          {{ settingsStore.isProviderAvailable(p) ? '' : '  ' }}{{ CLI_PROVIDER_DISPLAY_NAMES[p] }}{{ settingsStore.isProviderAvailable(p) ? '' : ' (not found)' }}
        </option>
      </select>
      <span
        class="w-1.5 h-1.5 rounded-full"
        :class="settingsStore.isProviderAvailable(provider) ? 'bg-green-500' : 'bg-red-500'"
      />
    </div>

    <!-- Input area -->
    <div class="flex items-end gap-2">
      <textarea
        v-model="input"
        :disabled="isStreaming"
        placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
        rows="2"
        class="flex-1 px-3 py-2 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100 resize-none focus:outline-none focus:border-primary-500"
        @keydown="handleKeydown"
      />
      <button
        v-if="isStreaming"
        class="px-4 py-2 text-sm rounded bg-red-500 text-white hover:bg-red-600"
        @click="emit('cancel')"
      >
        Stop
      </button>
      <button
        v-else
        :disabled="!input.trim() || !settingsStore.isProviderAvailable(provider)"
        class="px-4 py-2 text-sm rounded bg-primary-500 text-white disabled:opacity-50 hover:bg-primary-600"
        @click="handleSend"
      >
        Send
      </button>
    </div>
  </div>
</template>
