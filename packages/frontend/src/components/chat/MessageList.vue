<script setup lang="ts">
import type { ChatMessage } from "shared";
import MessageBubble from "./MessageBubble.vue";

defineProps<{
  messages: ChatMessage[];
  examples?: readonly string[];
}>();

const emit = defineEmits<{
  "use-example": [text: string];
}>();
</script>

<template>
  <div class="flex flex-col gap-3 p-4">
    <div v-if="messages.length === 0" class="text-center text-surface-400 py-8">
      <i class="fas fa-comments text-2xl mb-2" />
      <p class="text-sm">Send a message to start chatting</p>
      <div
        v-if="examples && examples.length > 0"
        class="mt-4 flex flex-wrap justify-center gap-2"
      >
        <button
          v-for="example in examples"
          :key="example"
          class="rounded-full border border-surface-600 px-3 py-1 text-xs text-surface-300 transition-colors hover:border-surface-500 hover:bg-surface-800 hover:text-surface-100"
          @click="emit('use-example', example)"
        >
          {{ example }}
        </button>
      </div>
      <div class="mx-auto mt-5 max-w-2xl text-left">
        <div class="grid gap-2 md:grid-cols-3">
          <div class="rounded border border-surface-700 bg-surface-900/60 px-3 py-2 text-xs">
            <div class="mb-1 font-medium text-surface-100">Live test passed</div>
            <div>It proves tool discovery plus live <span class="font-mono">get_environment</span> and <span class="font-mono">search_history(limit: 1)</span>, not every mutating tool.</div>
          </div>
          <div class="rounded border border-surface-700 bg-surface-900/60 px-3 py-2 text-xs">
            <div class="mb-1 font-medium text-surface-100">Context overrides</div>
            <div>Drift follows the Caido UI context until an MCP project override is selected. While the override is active, that project wins.</div>
          </div>
          <div class="rounded border border-surface-700 bg-surface-900/60 px-3 py-2 text-xs">
            <div class="mb-1 font-medium text-surface-100">Recovery</div>
            <div>If things look wrong, run the health check, restart or close the chat session, and export the diagnostics report from Settings.</div>
          </div>
        </div>
      </div>
    </div>
    <MessageBubble v-for="msg in messages" :key="msg.id" :message="msg" />
  </div>
</template>
