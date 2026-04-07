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
  <!-- User message -->
  <div
    v-if="message.role === 'user'"
    class="group relative max-w-[80%] ml-auto px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-primary-600 text-white"
  >
    <div class="whitespace-pre-wrap">{{ message.content }}</div>
  </div>

  <!-- Assistant message -->
  <div
    v-else
    class="group relative max-w-[85%] mr-auto px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
    style="background: #1a1f2e; color: #e8eaed; border: 1px solid #2d3348;"
  >
    <div
      v-html="renderedHtml"
      style="line-height: 1.7;"
      class="max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-2 [&_code]:text-xs [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic"
    />
    <button
      class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded transition-opacity"
      style="background: #2d3348; color: #9ca3b0;"
      @click="copyContent"
    >
      {{ copied ? 'Copied!' : 'Copy' }}
    </button>
  </div>
</template>

<style scoped>
:deep(pre) {
  background: #0d1117 !important;
  color: #c9d1d9 !important;
}
:deep(code) {
  color: #7ee787 !important;
}
:deep(a) {
  color: #58a6ff !important;
}
:deep(strong) {
  color: #ffffff !important;
}
:deep(blockquote) {
  border-color: #3d4450 !important;
  color: #9ca3b0 !important;
}
</style>
