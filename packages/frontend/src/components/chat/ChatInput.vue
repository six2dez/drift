<script setup lang="ts">
import { ref } from "vue";
import { CliProvider, CLI_PROVIDER_DISPLAY_NAMES } from "shared";
import { useSettingsStore } from "../../stores/settings";
import { CHAT_WORKFLOW_GROUPS } from "../../chat-workflows";
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

function fillTemplate(template: string) {
  input.value = template;
}

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
    <div class="mb-3 grid gap-2 lg:grid-cols-3">
      <div
        v-for="group in CHAT_WORKFLOW_GROUPS"
        :key="group.id"
        class="rounded-lg border border-surface-700 bg-surface-900/50 px-3 py-2"
      >
        <div class="mb-1 flex items-center justify-between gap-2">
          <div class="text-xs font-medium text-surface-100">{{ group.label }}</div>
          <div class="text-[11px] text-surface-500">{{ group.actions.length }} workflows</div>
        </div>
        <div class="mb-2 text-[11px] leading-relaxed text-surface-400">
          {{ group.description }}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="action in group.actions"
            :key="action.id"
            :disabled="isStreaming"
            class="flex items-center gap-1 rounded border border-surface-600 px-2 py-1 text-xs text-surface-300 transition-colors hover:border-surface-500 hover:bg-surface-700 hover:text-surface-100 disabled:opacity-50"
            :title="action.description"
            @click="fillTemplate(action.template)"
          >
            <i :class="action.icon" style="font-size: 10px;" />
            {{ action.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Provider selector -->
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

    <!-- Input + send -->
    <div class="flex items-end gap-2">
      <Textarea
        v-model="input"
        :disabled="isStreaming"
        placeholder="Ask Drift to review, validate, or draft. Enter sends, Shift+Enter adds a newline."
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
