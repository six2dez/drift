<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import Card from "primevue/card";
import Button from "primevue/button";
import Tag from "primevue/tag";
import { useSettingsStore } from "../stores/settings";
import { useScannerStore } from "../stores/scanner";
import {
  consumePendingActiveScan,
  pendingActiveScanQueue,
} from "../scanner-context";

const settingsStore = useSettingsStore();
const scannerStore = useScannerStore();

onMounted(async () => {
  await scannerStore.refresh();
});

// Drain any queued active scan requests coming from the context menu.
watch(
  () => pendingActiveScanQueue.value.length,
  async (length) => {
    if (length === 0) return;
    const pending = consumePendingActiveScan();
    if (pending === undefined) return;
    await scannerStore.runActiveScan(pending.requestId);
  },
  { immediate: true },
);

const scanner = computed(() => settingsStore.settings?.scanner);
const status = computed(() => scannerStore.status);

const passiveLabel = computed(() =>
  scanner.value?.passiveEnabled === true ? "On" : "Off",
);
const activeLabel = computed(() =>
  scanner.value?.activeEnabled === true ? "On" : "Off",
);

const cooldownRemaining = computed(() => {
  const until = status.value.providerCooldownUntil;
  if (until === undefined) return 0;
  const remainingMs = until - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
});

async function togglePassive() {
  if (scanner.value === undefined) return;
  await settingsStore.updateSettings({
    scanner: { ...scanner.value, passiveEnabled: !scanner.value.passiveEnabled },
  });
  await scannerStore.refresh();
}

async function toggleActive() {
  if (scanner.value === undefined) return;
  await settingsStore.updateSettings({
    scanner: { ...scanner.value, activeEnabled: !scanner.value.activeEnabled },
  });
  await scannerStore.refresh();
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return "danger";
    case "high": return "danger";
    case "medium": return "warning";
    case "low": return "info";
    case "info": return "secondary";
    default: return "secondary";
  }
}

function formatRelative(ts: number) {
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 1000) return "just now";
  if (delta < 60000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3600000) return `${Math.round(delta / 60000)}m ago`;
  return `${Math.round(delta / 3600000)}h ago`;
}
</script>

<template>
  <div class="mx-auto h-full w-full overflow-y-auto p-4" style="max-width: 1040px;">
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Scanner</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <p class="text-xs text-surface-400 mb-3">
          The Drift scanner runs while the Drift plugin page is open in
          Caido. Close Drift and incoming responses stop being analysed
          until you come back. Findings land in Caido's native Findings
          panel AND stream below.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <Tag
            :value="`Passive: ${passiveLabel}`"
            :severity="scanner?.passiveEnabled ? 'success' : 'secondary'"
            class="cursor-pointer"
            @click="togglePassive"
          />
          <Tag
            :value="`Active: ${activeLabel}`"
            :severity="scanner?.activeEnabled ? 'success' : 'secondary'"
            class="cursor-pointer"
            @click="toggleActive"
          />
          <Tag
            :value="status.frontendEngaged ? 'Drift visible' : 'Drift hidden'"
            :severity="status.frontendEngaged ? 'success' : 'warning'"
          />
          <Tag
            v-if="cooldownRemaining > 0"
            :value="`Claude unavailable — retrying in ${cooldownRemaining}s`"
            severity="danger"
          />
          <div class="flex-1" />
          <Button
            label="Reset stats"
            icon="fas fa-rotate-left"
            text
            size="small"
            @click="scannerStore.resetStats()"
          />
          <Button
            label="Clear recent"
            icon="fas fa-broom"
            text
            size="small"
            @click="scannerStore.clearRecentFindings()"
          />
        </div>
        <div class="mt-3 grid grid-cols-4 gap-2 text-xs text-surface-300">
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-surface-500">Queue</div>
            <div class="text-base text-surface-100">{{ status.queueSize }}</div>
          </div>
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-surface-500">In flight</div>
            <div class="text-base text-surface-100">{{ status.inFlight }}</div>
          </div>
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-surface-500">Analyzed</div>
            <div class="text-base text-surface-100">{{ status.analyzed }}</div>
          </div>
          <div class="rounded border border-surface-700 px-3 py-2">
            <div class="text-surface-500">Findings</div>
            <div class="text-base text-surface-100">{{ status.findingsCreated }}</div>
          </div>
        </div>
        <p
          v-if="status.lastError"
          class="mt-3 text-xs text-red-400"
        >
          <i class="fas fa-triangle-exclamation mr-1" />
          {{ status.lastError }}
        </p>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Last active scan</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div v-if="scannerStore.activeScanInFlight" class="flex items-center gap-2 text-xs text-surface-300">
          <i class="fas fa-spinner fa-spin" />
          Active scan in progress…
        </div>
        <div v-else-if="scannerStore.lastActiveResult === undefined" class="text-xs text-surface-400">
          No active scan has run yet. Right-click any request in Caido and choose "Active scan this request" to kick one off.
        </div>
        <div v-else class="flex flex-col gap-2 text-xs text-surface-300">
          <div class="flex flex-wrap items-center gap-2">
            <Tag
              :value="`Payloads sent: ${scannerStore.lastActiveResult.payloadsSent}`"
              severity="secondary"
            />
            <Tag
              :value="`Confirmed: ${scannerStore.lastActiveResult.confirmed}`"
              :severity="scannerStore.lastActiveResult.confirmed > 0 ? 'success' : 'secondary'"
            />
            <Tag
              v-if="scannerStore.lastActiveResult.truncated"
              value="Truncated (hit maxActivePayloads cap)"
              severity="warning"
            />
          </div>
          <p
            v-if="scannerStore.lastActiveResult.error"
            class="text-red-400"
          >
            <i class="fas fa-triangle-exclamation mr-1" />
            {{ scannerStore.lastActiveResult.error }}
          </p>
          <p
            v-else-if="scannerStore.lastActiveResult.confirmed === 0"
            class="text-surface-400"
          >
            No confirmed vulnerabilities on this request. Review the recent findings list below if you expected one.
          </p>
          <p
            v-else
            class="text-green-400"
          >
            {{ scannerStore.lastActiveResult.confirmed }} confirmed finding{{ scannerStore.lastActiveResult.confirmed === 1 ? '' : 's' }} created — see the list below.
          </p>
        </div>
      </template>
    </Card>

    <h2 class="text-lg font-semibold text-surface-100 mb-3">Recent findings</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }">
      <template #content>
        <div
          v-if="scannerStore.recentFindings.length === 0"
          class="text-xs text-surface-400"
        >
          No scanner findings yet. Enable passive scanning or run a manual active scan from a request's context menu.
        </div>
        <div v-else class="flex flex-col gap-2">
          <div
            v-for="finding in scannerStore.recentFindings"
            :key="finding.id"
            class="rounded border border-surface-700 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <Tag :value="finding.severity" :severity="severityColor(finding.severity)" />
              <Tag :value="finding.kind" severity="secondary" />
              <span class="text-sm text-surface-100">{{ finding.title }}</span>
              <div class="flex-1" />
              <span class="text-[11px] text-surface-500">{{ formatRelative(finding.occurredAt) }}</span>
            </div>
            <div class="mt-1 text-xs text-surface-400 break-all">
              {{ finding.url }}
            </div>
            <div class="mt-1 text-xs text-surface-300">
              <span class="text-surface-500">Evidence:</span> {{ finding.evidence }}
            </div>
            <div v-if="!finding.createdInCaido" class="mt-1 text-[11px] text-amber-400">
              Not persisted to Caido's Findings panel (create failed).
            </div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>
