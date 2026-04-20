<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { McpToolApprovalRequest } from "shared";

const props = defineProps<{
  event: McpToolApprovalRequest | null;
}>();

const emit = defineEmits<{
  decide: [{ approved: boolean; remember: "once" | "session" }];
}>();

function handleDeny() {
  emit("decide", { approved: false, remember: "once" });
}

function handleAllowOnce() {
  emit("decide", { approved: true, remember: "once" });
}

function handleAllowSession() {
  emit("decide", { approved: true, remember: "session" });
}

function handleKey(e: KeyboardEvent) {
  if (props.event === null) return;
  if (e.key === "Escape") {
    e.preventDefault();
    handleDeny();
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
    v-if="event"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click.self="handleDeny"
  >
    <div
      class="max-w-lg w-full bg-surface-800 border border-surface-600 rounded-lg shadow-xl p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drift-approval-title"
    >
      <div class="flex items-start gap-2 mb-3">
        <i class="fas fa-shield-halved text-amber-400 mt-0.5" />
        <h3
          id="drift-approval-title"
          class="text-sm font-semibold text-surface-100 flex-1"
        >
          Approve MCP tool call
        </h3>
        <button
          class="text-surface-400 hover:text-surface-100 leading-none p-1"
          aria-label="Deny and close"
          @click="handleDeny"
        >
          <i class="fas fa-xmark" />
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
        <span class="rounded bg-surface-700 px-2 py-0.5 font-medium text-surface-100">
          {{ event.toolLabel }}
        </span>
        <span class="rounded bg-surface-700 px-2 py-0.5 text-surface-300">
          {{ event.group }}
        </span>
        <span
          v-if="event.sensitive"
          class="rounded bg-amber-900/40 border border-amber-700 px-2 py-0.5 text-amber-300"
        >
          sensitive
        </span>
      </div>

      <p
        v-if="event.message"
        class="mb-3 text-sm text-surface-200 leading-relaxed"
      >
        {{ event.message }}
      </p>

      <div class="mb-4">
        <div class="text-[11px] uppercase tracking-wide text-surface-500 mb-1">
          Arguments
        </div>
        <pre
          class="font-mono text-xs bg-surface-900 border border-surface-700 rounded p-2 overflow-auto max-h-40 text-surface-300 whitespace-pre-wrap"
        >{{ event.argumentsSummary || "(none)" }}</pre>
      </div>

      <div class="flex flex-wrap gap-2 justify-end text-sm">
        <button
          class="text-surface-400 hover:text-surface-200 px-3 py-1.5"
          @click="handleDeny"
        >
          Deny
        </button>
        <button
          class="rounded border border-surface-600 hover:bg-surface-700 text-surface-100 px-3 py-1.5"
          @click="handleAllowSession"
        >
          Allow for session
        </button>
        <button
          class="rounded bg-primary-700 hover:bg-primary-600 text-white px-3 py-1.5"
          @click="handleAllowOnce"
        >
          Allow once
        </button>
      </div>

      <div class="mt-2 text-[11px] text-surface-500 text-right">
        Session approvals are in-memory only and clear when the session ends or the plugin reloads.
      </div>
    </div>
  </div>
</template>
