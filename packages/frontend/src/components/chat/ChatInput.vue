<script setup lang="ts">
import { ref } from "vue";
import { CliProvider, CLI_PROVIDER_DISPLAY_NAMES } from "shared";
import { useSettingsStore } from "../../stores/settings";
import Button from "primevue/button";
import Select from "primevue/select";
import Textarea from "primevue/textarea";

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

const providerOptions = Object.values(CliProvider).map((p) => ({
  value: p,
  label: CLI_PROVIDER_DISPLAY_NAMES[p],
}));

function handleSend() {
  const text = input.value.trim();
  if (text === "" || props.isStreaming) return;
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
  <div class="border-t border-surface-700 p-3">
    <div class="flex items-center gap-2 mb-2">
      <Select
        :modelValue="provider"
        :options="providerOptions"
        optionLabel="label"
        optionValue="value"
        class="text-xs"
        @update:modelValue="(v: string) => emit('update:provider', v)"
      />
      <i
        class="fas fa-circle text-xs"
        :class="settingsStore.isProviderAvailable(provider) ? 'text-green-500' : 'text-red-500'"
      />
    </div>
    <div class="flex items-end gap-2">
      <Textarea
        v-model="input"
        :disabled="isStreaming"
        placeholder="Type your message... (Enter to send, Shift+Enter for newline)"
        rows="2"
        class="flex-1"
        autoResize
        @keydown="handleKeydown"
      />
      <Button
        v-if="isStreaming"
        label="Stop"
        icon="fas fa-stop"
        severity="danger"
        size="small"
        @click="emit('cancel')"
      />
      <Button
        v-else
        label="Send"
        icon="fas fa-paper-plane"
        severity="secondary"
        size="small"
        :disabled="input.trim() === '' || !settingsStore.isProviderAvailable(provider)"
        @click="handleSend"
      />
    </div>
  </div>
</template>
