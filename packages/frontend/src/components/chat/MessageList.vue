<script setup lang="ts">
import type { ChatMessage } from "shared";
import MessageBubble from "./MessageBubble.vue";

defineProps<{
  messages: ChatMessage[];
}>();
</script>

<template>
  <div class="flex flex-col gap-3 p-4">
    <div v-if="messages.length === 0" class="text-center text-surface-400 py-8">
      <i class="fas fa-comments text-2xl mb-2" />
      <p class="text-sm">Send a message to start chatting</p>
    </div>
    <MessageBubble v-for="msg in messages" :key="msg.id" :message="msg" />
  </div>
</template>
