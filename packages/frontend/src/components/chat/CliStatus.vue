<script setup lang="ts">
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider } from "shared";

defineProps<{
  providerId: string;
  isStreaming: boolean;
}>();
</script>

<template>
  <div style="display: flex; align-items: center; gap: 8px; padding: 4px 16px; border-bottom: 1px solid #333; font-size: 11px; color: #888;">
    <span
      style="width: 6px; height: 6px; border-radius: 50%; display: inline-block;"
      :style="{ background: isStreaming ? '#eab308' : '#22c55e' }"
    />
    <span style="color: #ccc;">{{ CLI_PROVIDER_DISPLAY_NAMES[providerId as CliProvider] ?? providerId }}</span>
    <span v-if="isStreaming" style="color: #eab308;">Streaming...</span>
    <span v-else>Ready</span>
  </div>
</template>
