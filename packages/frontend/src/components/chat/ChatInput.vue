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

const quickActions = [
  { label: "List Findings", icon: "fas fa-flag", template: "List all findings with details (title, reporter, host, path, severity)" },
  { label: "Analyze Finding", icon: "fas fa-search", template: "Explain finding [FINDING_ID_OR_TITLE] in detail: root cause, exploitability, real-world impact, and suggested fix" },
  { label: "Generate PoC", icon: "fas fa-code", template: "Take finding [FINDING_ID_OR_TITLE] and generate a working proof-of-concept exploit with step-by-step reproduction instructions" },
  { label: "Write Report", icon: "fas fa-file-alt", template: "Write a bug bounty report for finding [FINDING_ID_OR_TITLE]. Include: title, severity (CVSS), description, impact, steps to reproduce, PoC, and remediation" },
  { label: "Find Vulns", icon: "fas fa-bug", template: "Search the last 20 HTTP requests and identify potential security vulnerabilities. For each, explain the issue and suggest a test" },
  { label: "Scan Scope", icon: "fas fa-crosshairs", template: "List the current scope and check which hosts have requests in history. Identify high-value targets for testing" },
];

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
    <!-- Quick action chips -->
    <div class="flex flex-wrap gap-1.5 mb-2">
      <button
        v-for="action in quickActions"
        :key="action.label"
        :disabled="isStreaming"
        class="flex items-center gap-1 px-2 py-1 text-xs rounded border border-surface-600 text-surface-300 hover:text-surface-100 hover:border-surface-500 hover:bg-surface-700 transition-colors disabled:opacity-50"
        @click="fillTemplate(action.template)"
      >
        <i :class="action.icon" style="font-size: 10px;" />
        {{ action.label }}
      </button>
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
