<script setup lang="ts">
import { computed } from "vue";
import {
  CLI_PROVIDER_DISPLAY_NAMES,
  type CliProvider,
  type CliSessionStateEvent,
  type McpServerInfo,
} from "shared";

const props = defineProps<{
  providerId: string;
  isStreaming: boolean;
  mcpStatus?: McpServerInfo | null;
  sessionState?: CliSessionStateEvent | null;
}>();

const contextSummary = computed(() => {
  const effective = props.mcpStatus?.effectiveContext;
  if (effective === undefined) return "Caido context unavailable";

  const parts = [
    effective.projectId !== "" ? `Project ${effective.projectId}` : "Project none",
    effective.filterName !== "" ? `Filter ${effective.filterName}` : "Filter none",
    effective.historyScopeId !== "" ? `Scope ${effective.historyScopeId}` : "Scope none",
  ].filter((part) => part !== "");

  return parts.join(" | ");
});

const toolPolicySummary = computed(() => {
  const status = props.mcpStatus;
  if (status === undefined || status === null) return "MCP status unavailable";
  const confirmation = status.toolPolicy.confirmSensitiveActions
    ? "confirm sensitive"
    : "no confirmations";
  return `MCP ${status.toolCount}/${status.supportedToolCount} | ${confirmation}`;
});

const sessionSummary = computed(() => {
  const session = props.sessionState;
  if (session === undefined || session === null) {
    return "Session idle";
  }

  const labels: Record<CliSessionStateEvent["state"], string> = {
    starting: "starting",
    running: "running",
    stopped: "stopped",
    error: "error",
  };
  const summaryLabel =
    session.reasonCode === "completed_without_result"
      ? "recovered"
      : labels[session.state];
  return `Session ${summaryLabel}${session.mcpAttached ? " | MCP attached" : " | no MCP"}`;
});

const sessionReason = computed(() => {
  const session = props.sessionState;
  if (session === undefined || session === null) {
    return undefined;
  }
  if (session.reasonCode === "completed_without_result") {
    return "Claude finished with visible output but missed the final result event. Drift recovered the turn automatically.";
  }
  if (
    session.state === "error" ||
    session.reasonCode === "timeout" ||
    session.reasonCode === "spawn_error" ||
    session.reasonCode === "cancelled"
  ) {
    return session.reason;
  }
  return undefined;
});
</script>

<template>
  <div class="flex flex-col gap-0.5 px-4 py-1.5 text-xs text-surface-400">
    <div class="flex items-center gap-2">
      <i
        class="fas fa-circle"
        style="font-size: 6px;"
        :class="isStreaming ? 'text-yellow-500' : 'text-green-500'"
      />
      <span class="text-surface-200">
        {{ CLI_PROVIDER_DISPLAY_NAMES[providerId as CliProvider] ?? providerId }}
      </span>
      <span v-if="isStreaming" class="text-yellow-500">Streaming...</span>
      <span v-else>Ready</span>
      <span
        v-if="mcpStatus?.effectiveContext.overrideActive"
        class="text-amber-400"
      >
        Override active
      </span>
    </div>
    <div class="truncate text-[11px] text-surface-500">
      {{ contextSummary }}
    </div>
    <div class="truncate text-[11px] text-surface-500">
      {{ toolPolicySummary }}
    </div>
    <div class="truncate text-[11px] text-surface-500">
      {{ sessionSummary }}
    </div>
    <div v-if="sessionReason" class="truncate text-[11px] text-surface-500">
      {{ sessionReason }}
    </div>
  </div>
</template>
