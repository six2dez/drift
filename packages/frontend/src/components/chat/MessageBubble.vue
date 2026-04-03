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
  } catch {}
}
</script>

<template>
  <div
    style="position: relative; max-width: 85%; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5;"
    :style="{
      marginLeft: message.role === 'user' ? 'auto' : '0',
      marginRight: message.role === 'user' ? '0' : 'auto',
      background: message.role === 'user' ? '#6366f1' : '#2a2a2a',
      color: message.role === 'user' ? '#fff' : '#e0e0e0',
    }"
  >
    <div v-if="message.role === 'user'" style="white-space: pre-wrap;">
      {{ message.content }}
    </div>

    <div
      v-else
      v-html="renderedHtml"
      style="overflow-wrap: break-word;"
    />

    <button
      style="position: absolute; top: 4px; right: 4px; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #444; color: #aaa; border: none; cursor: pointer; opacity: 0; transition: opacity 0.2s;"
      @click="copyContent"
      @mouseenter="($event.currentTarget as HTMLElement).style.opacity = '1'"
      @mouseleave="($event.currentTarget as HTMLElement).style.opacity = '0'"
    >
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </div>
</template>
