<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { CLI_PROVIDER_DISPLAY_NAMES, type CliProvider, type StoredChat } from "shared";
import Button from "primevue/button";

const props = defineProps<{
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
const filter = ref("");

const filteredChats = computed(() => {
  const query = filter.value.trim().toLowerCase();
  if (query === "") return props.chats;
  const searchMessageContent = query.length >= 3;
  return props.chats.filter((chat) => {
    if (chat.title.toLowerCase().includes(query)) return true;
    if (searchMessageContent) {
      const firstMessage = chat.messages[0]?.content ?? "";
      if (firstMessage.toLowerCase().includes(query)) return true;
    }
    return false;
  });
});

const isFiltering = computed(() => filter.value.trim() !== "");

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

    <div class="px-2 pb-2">
      <div class="relative">
        <i class="fas fa-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-surface-500" />
        <input
          v-model="filter"
          type="text"
          placeholder="Filter chats"
          aria-label="Filter chats"
          class="w-full rounded border border-surface-700 bg-surface-800 pl-6 pr-2 py-1 text-xs text-surface-100 placeholder:text-surface-500 outline-none focus:border-surface-500"
        >
      </div>
      <div
        v-if="isFiltering"
        class="mt-1 px-1 text-[10px] text-surface-500"
      >
        {{ filteredChats.length }} of {{ chats.length }}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div
        v-for="chat in filteredChats"
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
      <div
        v-else-if="filteredChats.length === 0"
        class="px-3 py-4 text-xs text-surface-400 text-center"
      >
        No chats match "{{ filter.trim() }}"
      </div>
    </div>
  </div>
</template>
