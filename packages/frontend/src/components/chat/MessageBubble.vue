<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import type { ChatMessage } from "shared";

const props = defineProps<{
  message: ChatMessage;
}>();

const copied = ref(false);
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

const renderedHtml = computed(() => {
  if (props.message.role === "user") return "";
  return DOMPurify.sanitize(md.render(props.message.content));
});

async function copyContent() {
  try {
    await navigator.clipboard.writeText(props.message.content);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch {
    // clipboard not available
  }
}
</script>

<template>
  <div
    class="group relative max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed"
    :class="message.role === 'user'
      ? 'ml-auto bg-primary-600 text-white'
      : 'mr-auto bg-surface-700 text-surface-100 border border-surface-600'"
  >
    <div v-if="message.role === 'user'" class="whitespace-pre-wrap">
      {{ message.content }}
    </div>
    <div
      v-else
      class="prose prose-sm prose-invert max-w-none [&_pre]:bg-surface-800 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_code]:text-xs"
      v-html="renderedHtml"
    />
    <button
      class="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded transition-opacity bg-surface-600 text-surface-300 hover:text-surface-100"
      @click="copyContent"
    >
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </div>
</template>
