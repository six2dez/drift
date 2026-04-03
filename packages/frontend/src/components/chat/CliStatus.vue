<script setup lang="ts">
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider } from "shared";

defineProps<{
  providerId: string;
  isStreaming: boolean;
}>();
</script>

<template>
  <div class="flex items-center gap-2 px-4 py-1.5 border-b border-surface-700 text-xs text-surface-400">
    <i
      class="fas fa-circle"
      style="font-size: 6px;"
      :class="isStreaming ? 'text-yellow-500' : 'text-green-500'"
    />
    <span class="text-surface-200">{{ CLI_PROVIDER_DISPLAY_NAMES[providerId as CliProvider] ?? providerId }}</span>
    <span v-if="isStreaming" class="text-yellow-500">Streaming...</span>
    <span v-else>Ready</span>
  </div>
</template>
