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
  <div style="display: flex; flex-direction: column; height: 100%; width: 180px; border-right: 1px solid #333; flex-shrink: 0;">
    <div style="padding: 8px;">
      <button
        style="width: 100%; padding: 6px 12px; font-size: 13px; border-radius: 6px; background: #6366f1; color: white; border: none; cursor: pointer;"
        @click="emit('create')"
      >
        + New Chat
      </button>
    </div>

    <div style="flex: 1; overflow-y: auto;">
      <div
        v-for="chat in chats"
        :key="chat.id"
        style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #222;"
        :style="{ background: chat.id === activeChatId ? '#2a2a2a' : 'transparent' }"
        @click="emit('select', chat.id)"
        @mouseenter="($event.currentTarget as HTMLElement).style.background = chat.id === activeChatId ? '#2a2a2a' : '#1e1e1e'"
        @mouseleave="($event.currentTarget as HTMLElement).style.background = chat.id === activeChatId ? '#2a2a2a' : 'transparent'"
      >
        <div style="flex: 1; min-width: 0;">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e0e0e0; font-size: 12px;">
            {{ chat.title }}
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #888;">
            <span>{{ CLI_PROVIDER_DISPLAY_NAMES[chat.providerId as CliProvider]?.split(' ')[0] }}</span>
            <span>&middot;</span>
            <span>{{ formatTime(chat.updatedAt) }}</span>
          </div>
        </div>
        <button
          style="font-size: 14px; color: #666; background: none; border: none; cursor: pointer; padding: 0 4px;"
          @click.stop="emit('delete', chat.id)"
        >
          &times;
        </button>
      </div>

      <div v-if="chats.length === 0" style="padding: 16px 12px; font-size: 11px; color: #666; text-align: center;">
        No chats yet
      </div>
    </div>
  </div>
</template>
