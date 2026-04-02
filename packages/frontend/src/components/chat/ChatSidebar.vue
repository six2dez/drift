<script setup lang="ts">
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider, type StoredChat } from "shared";

defineProps<{
  chats: StoredChat[];
  activeChatId: string | null;
}>();

const emit = defineEmits<{
  select: [chatId: string];
  create: [];
  delete: [chatId: string];
}>();

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
</script>

<template>
  <div class="flex flex-col h-full border-r border-surface-200 dark:border-surface-700 w-56">
    <!-- New chat button -->
    <div class="p-2">
      <button
        class="w-full px-3 py-1.5 text-sm rounded bg-primary-500 text-white hover:bg-primary-600"
        @click="emit('create')"
      >
        + New Chat
      </button>
    </div>

    <!-- Chat list -->
    <div class="flex-1 overflow-y-auto">
      <div
        v-for="chat in chats"
        :key="chat.id"
        class="group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b border-surface-100 dark:border-surface-800"
        :class="chat.id === activeChatId
          ? 'bg-surface-100 dark:bg-surface-800'
          : 'hover:bg-surface-50 dark:hover:bg-surface-900'"
        @click="emit('select', chat.id)"
      >
        <div class="flex-1 min-w-0">
          <div class="truncate text-surface-900 dark:text-surface-100">
            {{ chat.title }}
          </div>
          <div class="flex items-center gap-1 text-xs text-surface-400">
            <span>{{ CLI_PROVIDER_DISPLAY_NAMES[chat.providerId as CliProvider] }}</span>
            <span>&middot;</span>
            <span>{{ formatTime(chat.updatedAt) }}</span>
          </div>
        </div>
        <button
          class="opacity-0 group-hover:opacity-100 text-xs text-surface-400 hover:text-red-500 px-1"
          @click.stop="emit('delete', chat.id)"
        >
          &times;
        </button>
      </div>

      <div v-if="chats.length === 0" class="px-3 py-4 text-xs text-surface-400 text-center">
        No chats yet
      </div>
    </div>
  </div>
</template>
