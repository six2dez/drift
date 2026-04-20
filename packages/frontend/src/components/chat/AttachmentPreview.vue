<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { HttpContextAttachment } from "shared";
import { rawHttpRequestToCurl } from "../../utils/http-parse";

const props = defineProps<{
  attachment: HttpContextAttachment | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const copied = ref(false);
const copiedCurl = ref(false);

const curlCommand = computed<string | undefined>(() => {
  if (props.attachment === null) return undefined;
  if (props.attachment.source === "response") return undefined;
  if (props.attachment.content === undefined) return undefined;
  return rawHttpRequestToCurl(props.attachment.content);
});

async function handleCopy() {
  if (props.attachment?.content === undefined) return;
  try {
    await navigator.clipboard.writeText(props.attachment.content);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // clipboard not available — ignore silently, same contract as MessageBubble.
  }
}

async function handleCopyCurl() {
  if (curlCommand.value === undefined) return;
  try {
    await navigator.clipboard.writeText(curlCommand.value);
    copiedCurl.value = true;
    setTimeout(() => {
      copiedCurl.value = false;
    }, 1500);
  } catch {
    // clipboard not available
  }
}

function handleKey(e: KeyboardEvent) {
  if (props.attachment === null) return;
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKey);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKey);
});
</script>

<template>
  <div
    v-if="attachment"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click.self="emit('close')"
  >
    <div
      class="max-w-3xl w-full bg-surface-800 border border-surface-600 rounded-lg shadow-xl flex flex-col"
      style="max-height: 80vh;"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drift-attachment-title"
    >
      <div class="flex items-center gap-2 border-b border-surface-700 px-4 py-2.5">
        <i class="fas fa-paperclip text-surface-400" />
        <h3
          id="drift-attachment-title"
          class="text-sm font-semibold text-surface-100 flex-1 truncate"
        >
          {{ attachment.label }}
        </h3>
        <button
          v-if="curlCommand !== undefined"
          class="text-xs text-surface-300 hover:text-surface-100 px-2 py-1 rounded hover:bg-surface-700"
          :title="curlCommand"
          @click="handleCopyCurl"
        >
          <i class="fas fa-terminal mr-1" />
          {{ copiedCurl ? "Copied!" : "Copy as curl" }}
        </button>
        <button
          class="text-xs text-surface-300 hover:text-surface-100 px-2 py-1 rounded hover:bg-surface-700"
          @click="handleCopy"
        >
          <i class="fas fa-copy mr-1" />
          {{ copied ? "Copied!" : "Copy" }}
        </button>
        <button
          class="text-surface-400 hover:text-surface-100 leading-none p-1"
          aria-label="Close"
          @click="emit('close')"
        >
          <i class="fas fa-xmark" />
        </button>
      </div>

      <pre
        class="font-mono text-xs bg-surface-900 text-surface-300 overflow-auto p-4 flex-1 whitespace-pre-wrap break-words"
      >{{ attachment.content ?? "(content unavailable — chat was reloaded)" }}</pre>
    </div>
  </div>
</template>
