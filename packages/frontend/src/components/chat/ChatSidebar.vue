<script setup lang="ts">
import { nextTick, ref } from "vue";
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider, type StoredChat } from "shared";
import Button from "primevue/button";

defineProps<{
  chats: StoredChat[];
  activeChatId: string | null;
}>();

const emit = defineEmits<{
  select: [chatId: string];
  create: [];
  delete: [chatId: string];
  rename: [chatId: string, title: string];
}>();

const editingChatId = ref<string | null>(null);
const editingTitle = ref("");

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function startRenaming(chat: StoredChat) {
  editingChatId.value = chat.id;
  editingTitle.value = chat.title;
  await nextTick();
}

function finishRenaming(chatId: string) {
  emit("rename", chatId, editingTitle.value);
  editingChatId.value = null;
  editingTitle.value = "";
}

function cancelRenaming() {
  editingChatId.value = null;
  editingTitle.value = "";
}
</script>

<template>
  <div class="flex flex-col h-full bg-surface-900 border-r border-surface-700">
    <div class="p-2">
      <Button
        label="New Chat"
        icon="fas fa-plus"
        class="w-full"
        size="small"
        severity="secondary"
        outlined
        @click="emit('create')"
      />
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-for="chat in chats"
        :key="chat.id"
        class="group flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-surface-700 hover:bg-surface-700"
        :class="{ 'bg-surface-700': chat.id === activeChatId }"
        @click="emit('select', chat.id)"
      >
        <div class="flex-1 min-w-0">
          <input
            v-if="editingChatId === chat.id"
            v-model="editingTitle"
            class="w-full rounded border border-surface-500 bg-surface-800 px-2 py-1 text-xs text-surface-100 outline-none"
            autofocus
            @click.stop
            @blur="finishRenaming(chat.id)"
            @keydown.enter.prevent="finishRenaming(chat.id)"
            @keydown.esc.prevent="cancelRenaming"
          >
          <div v-else class="truncate text-surface-100 text-xs">{{ chat.title }}</div>
          <div class="flex items-center gap-1 text-xs text-surface-400">
            <span>{{ CLI_PROVIDER_DISPLAY_NAMES[chat.providerId as CliProvider]?.split(' ')[0] }}</span>
            <span>&middot;</span>
            <span>{{ formatTime(chat.updatedAt) }}</span>
          </div>
        </div>
        <Button
          icon="fas fa-pen"
          text
          rounded
          size="small"
          severity="secondary"
          class="opacity-0 group-hover:opacity-100"
          @click.stop="startRenaming(chat)"
        />
        <Button
          icon="fas fa-times"
          text
          rounded
          size="small"
          severity="danger"
          class="opacity-0 group-hover:opacity-100"
          @click.stop="emit('delete', chat.id)"
        />
      </div>

      <div v-if="chats.length === 0" class="px-3 py-4 text-xs text-surface-400 text-center">
        No chats yet
      </div>
    </div>
  </div>
</template>
