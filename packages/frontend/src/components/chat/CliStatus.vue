<script setup lang="ts">
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider } from "shared";

defineProps<{
  providerId: string;
  isStreaming: boolean;
}>();
</script>

<template>
  <div class="flex items-center gap-2 px-4 py-1.5 border-b border-surface-200 dark:border-surface-700 text-xs text-surface-400">
    <span
      class="w-1.5 h-1.5 rounded-full"
      :class="isStreaming ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'"
    />
    <span>{{ CLI_PROVIDER_DISPLAY_NAMES[providerId as CliProvider] ?? providerId }}</span>
    <span v-if="isStreaming" class="text-yellow-500">Streaming...</span>
    <span v-else>Ready</span>
  </div>
</template>
