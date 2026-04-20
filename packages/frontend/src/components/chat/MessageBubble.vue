<script setup lang="ts">
import { computed, ref } from "vue";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import markdownItHighlightjs from "markdown-it-highlightjs";
import type { ChatMessage } from "shared";

const props = defineProps<{
  message: ChatMessage;
}>();

const emit = defineEmits<{
  "preview-attachment": [attachment: NonNullable<ChatMessage["httpContextAttachment"]>];
}>();

const copied = ref(false);
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.use(markdownItHighlightjs, { hljs, inline: true, auto: true });

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

function formatAttachmentSize(size: number | undefined): string {
  if (size === undefined || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

const usageSummary = computed<string | undefined>(() => {
  const usage = props.message.usage;
  if (usage === undefined) return undefined;
  if (usage.inputTokens <= 0 && usage.outputTokens <= 0) return undefined;
  const parts = [
    `${formatTokenCount(usage.inputTokens)} in`,
    `${formatTokenCount(usage.outputTokens)} out`,
  ];
  if (usage.cacheReadTokens !== undefined && usage.cacheReadTokens > 0) {
    parts.push(`${formatTokenCount(usage.cacheReadTokens)} cached`);
  }
  return parts.join(" / ");
});

function getActivityStateClass(state: string | undefined): string {
  switch (state) {
    case "success":
      return "text-green-400";
    case "denied":
      return "text-amber-400";
    default:
      return "text-red-400";
  }
}

function formatActivityDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || durationMs < 0) return "";
  return `${durationMs} ms`;
}
</script>

<template>
  <!-- User message -->
  <div
    v-if="message.role === 'user'"
    class="group relative max-w-[80%] ml-auto px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-primary-600 text-white"
  >
    <button
      v-if="message.httpContextAttachment"
      :disabled="!message.httpContextAttachment.content"
      class="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-700/80 px-2 py-1 text-[11px] hover:bg-primary-600 disabled:cursor-default disabled:hover:bg-primary-700/80"
      :title="message.httpContextAttachment.content ? 'Preview attachment' : 'Content unavailable (chat was reloaded)'"
      @click="emit('preview-attachment', message.httpContextAttachment)"
    >
      <i class="fas fa-paperclip" />
      <span>{{ message.httpContextAttachment.label }}</span>
      <span class="text-primary-100/70">{{ formatAttachmentSize(message.httpContextAttachment.size) }}</span>
    </button>
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
    <div
      v-if="message.mcpActivities && message.mcpActivities.length > 0"
      class="mt-3 border-t border-surface-700/70 pt-3"
    >
      <div class="mb-2 text-[11px] uppercase tracking-wide text-surface-500">
        MCP activity
      </div>
      <div class="flex flex-col gap-2">
        <div
          v-for="activity in message.mcpActivities"
          :key="activity.id"
          class="rounded border border-surface-700/70 px-2 py-2 text-xs"
        >
          <div class="flex items-center gap-2">
            <i class="fas fa-circle text-[7px]" :class="getActivityStateClass(activity.state)" />
            <span class="text-surface-100">{{ activity.toolLabel }}</span>
            <span class="text-surface-500">{{ activity.group }}</span>
            <span v-if="activity.sensitive" class="text-amber-400">sensitive</span>
            <div class="flex-1" />
            <span class="text-surface-500">{{ formatActivityDuration(activity.durationMs) }}</span>
          </div>
          <div v-if="activity.argumentsSummary" class="mt-1 text-surface-400">
            Args: {{ activity.argumentsSummary }}
          </div>
          <div v-if="activity.resultSummary" class="mt-1 text-surface-300">
            {{ activity.resultSummary }}
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="usageSummary"
      class="mt-2 text-[10px] font-mono text-surface-500"
    >
      {{ usageSummary }}
    </div>
    <button
      class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-xs px-2 py-1 rounded transition-opacity"
      style="background: #2d3348; color: #9ca3b0;"
      @click="copyContent"
    >
      {{ copied ? 'Copied!' : 'Copy' }}
    </button>
  </div>
</template>

<style>
@import "highlight.js/styles/github-dark-dimmed.css";
</style>

<style scoped>
:deep(pre) {
  background: #0d1117 !important;
  color: #c9d1d9 !important;
}
:deep(pre code.hljs) {
  background: transparent !important;
  padding: 0 !important;
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
