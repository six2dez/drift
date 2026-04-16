<script setup lang="ts">
import type { ChatMessage } from "shared";
import MessageBubble from "./MessageBubble.vue";
import type { EmptyChatWorkflow } from "../../chat-workflows";

defineProps<{
  messages: ChatMessage[];
  workflows?: readonly EmptyChatWorkflow[];
}>();

const emit = defineEmits<{
  "use-example": [text: string];
}>();
</script>

<template>
  <div class="flex flex-col gap-3 p-4">
    <div v-if="messages.length === 0" class="text-center text-surface-400 py-8">
      <i class="fas fa-comments text-2xl mb-2" />
      <p class="text-sm text-surface-300">Start with a workflow</p>
      <div
        v-if="workflows && workflows.length > 0"
        class="mx-auto mt-5 grid max-w-4xl gap-3 text-left md:grid-cols-3"
      >
        <div
          v-for="workflow in workflows"
          :key="workflow.id"
          class="rounded-xl border border-surface-700 bg-surface-900/60 px-4 py-4"
        >
          <div class="mb-2 text-sm font-medium text-surface-100">{{ workflow.label }}</div>
          <div class="mb-3 text-xs leading-relaxed text-surface-400">
            {{ workflow.description }}
          </div>
          <button
            class="rounded-full border border-surface-600 px-3 py-1 text-xs text-surface-300 transition-colors hover:border-surface-500 hover:bg-surface-800 hover:text-surface-100"
            @click="emit('use-example', workflow.template)"
          >
            {{ workflow.cta }}
          </button>
        </div>
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
