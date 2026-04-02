<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import type { ChatMessage } from "shared";

const props = defineProps<{
  message: ChatMessage;
}>();

const copied = ref(false);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const renderedHtml = computed(() => {
  if (props.message.role === "user") return "";
  const raw = md.render(props.message.content);
  return DOMPurify.sanitize(raw);
});

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // fallback
  }
}
</script>

<template>
  <div
    class="group relative max-w-[85%] px-3 py-2 rounded-lg text-sm"
    :class="message.role === 'user'
      ? 'ml-auto bg-primary-500 text-white'
      : 'mr-auto bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100'"
  >
    <!-- User messages: plain text -->
    <div v-if="message.role === 'user'" class="whitespace-pre-wrap">
      {{ message.content }}
    </div>

    <!-- Assistant messages: rendered markdown -->
    <div
      v-else
      class="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-surface-200 [&_pre]:dark:bg-surface-900 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_code]:text-xs [&_a]:text-primary-400"
      v-html="renderedHtml"
    />

    <!-- Copy button -->
    <button
      class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-700 text-surface-500 hover:text-surface-800 dark:hover:text-surface-200 transition-opacity"
      @click="copyContent"
    >
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </div>
</template>
