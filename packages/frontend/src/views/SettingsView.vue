<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useSettingsStore } from "../stores/settings";
import { useSDK } from "../plugins/sdk";
import { CliProvider, CLI_PROVIDER_DISPLAY_NAMES } from "shared";
import Card from "primevue/card";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import Button from "primevue/button";
import Tag from "primevue/tag";

const store = useSettingsStore();
const sdk = useSDK();
const mcpError = ref<string | undefined>(undefined);

const allProviders = [
  CliProvider.Claude,
  CliProvider.Gemini,
  CliProvider.Codex,
  CliProvider.Copilot,
] as const;

onMounted(() => store.initialize());

async function updateProviderCommand(providerId: string, command: string) {
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing !== undefined) providers[providerId] = { ...existing, command };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function toggleProvider(providerId: string) {
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing !== undefined) providers[providerId] = { ...existing, enabled: !existing.enabled };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function updateCaidoApi(field: "url" | "token", value: string) {
  await store.updateSettings({ caidoApi: { ...store.settings.caidoApi, [field]: value } });
}

async function updateNumber(field: "processTimeoutSeconds" | "maxHistoryMessages", value: number) {
  await store.updateSettings({ [field]: value });
}

function getStatus(pid: string) {
  return store.providerStatuses.find((s) => s.id === pid);
}
</script>

<template>
  <div class="p-4 overflow-y-auto h-full" style="max-width: 700px;">
    <!-- Init error -->
    <div
      v-if="store.initError"
      class="mb-4 px-3 py-2 text-xs text-red-400 bg-red-950 border border-red-800 rounded"
    >
      {{ store.initError }}
    </div>

    <!-- CLI Providers -->
    <div class="flex items-center gap-2 mb-3">
      <h2 class="text-lg font-semibold text-surface-100">CLI Providers</h2>
      <Button
        label="Refresh"
        icon="fas fa-sync"
        text
        size="small"
        @click="store.refreshProviders()"
      />
    </div>

    <div class="flex flex-col gap-3 mb-6">
      <Card
        v-for="pid in allProviders"
        :key="pid"
        :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }"
      >
        <template #content>
          <div class="flex items-center gap-3 mb-2">
            <i
              class="fas fa-circle text-xs"
              :class="getStatus(pid)?.available ? 'text-green-500' : 'text-red-500'"
            />
            <span class="font-medium text-surface-100">
              {{ CLI_PROVIDER_DISPLAY_NAMES[pid] }}
            </span>
            <div class="flex-1" />
            <Tag
              :value="store.settings.providers[pid]?.enabled ? 'Enabled' : 'Disabled'"
              :severity="store.settings.providers[pid]?.enabled ? 'success' : 'secondary'"
              class="cursor-pointer"
              @click="toggleProvider(pid)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-surface-400 w-16">Command:</label>
            <InputText
              :modelValue="store.settings.providers[pid]?.command ?? ''"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateProviderCommand(pid, (e.target as HTMLInputElement).value)"
            />
          </div>
          <div v-if="getStatus(pid)?.resolvedPath !== undefined" class="mt-1 text-xs text-surface-400">
            {{ getStatus(pid)?.resolvedPath }}
          </div>
          <div v-if="getStatus(pid)?.error !== undefined" class="mt-1 text-xs text-red-400">
            {{ getStatus(pid)?.error }}
          </div>
        </template>
      </Card>
    </div>

    <!-- Caido API -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Caido API</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300 w-14">URL:</label>
            <InputText
              :modelValue="store.settings.caidoApi.url"
              placeholder="http://localhost:8080"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateCaidoApi('url', (e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300 w-14">Token:</label>
            <InputText
              :modelValue="store.settings.caidoApi.token"
              type="password"
              placeholder="Your Caido PAT token"
              class="flex-1 p-inputtext-sm"
              @change="(e: Event) => updateCaidoApi('token', (e.target as HTMLInputElement).value)"
            />
          </div>
          <p class="text-xs text-surface-400">
            Required for MCP tools. Generate a PAT in Caido > Settings > API Keys.
          </p>
        </div>
      </template>
    </Card>

    <!-- MCP Server -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">MCP Server</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }" class="mb-6">
      <template #content>
        <div class="flex items-center gap-3">
          <i
            class="fas fa-circle text-xs"
            :class="store.mcpStatus?.running ? 'text-green-500' : 'text-surface-500'"
          />
          <span class="text-sm text-surface-100">
            {{ store.mcpStatus?.running
              ? `Running (${store.mcpStatus.toolCount} tools)`
              : "Stopped" }}
          </span>
          <div class="flex-1" />
          <Button
            :label="store.mcpStatus?.running ? 'Stop' : 'Start'"
            :icon="store.mcpStatus?.running ? 'fas fa-stop' : 'fas fa-play'"
            :severity="store.mcpStatus?.running ? 'danger' : 'success'"
            size="small"
            @click="store.toggleMcp().then(e => { mcpError = e; })"
          />
        </div>
        <p v-if="mcpError" class="text-xs text-red-400 mt-2">
          {{ mcpError }}
        </p>
        <p v-if="store.mcpStatus?.running" class="text-xs text-green-400 mt-2">
          <i class="fas fa-check-circle mr-1" />
          Claude Code will have access to 14 Caido tools when chatting. Make sure Caido API token is set above.
        </p>
        <p v-else class="text-xs text-surface-400 mt-2">
          Start to give Claude Code access to Caido tools (search history, replay requests, create findings, etc.). Requires Caido API token.
        </p>
      </template>
    </Card>

    <!-- Process -->
    <h2 class="text-lg font-semibold text-surface-100 mb-3">Process</h2>
    <Card :pt="{ body: { class: 'p-3' }, content: { class: 'p-0' } }">
      <template #content>
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300">Timeout (s):</label>
            <InputNumber
              :modelValue="store.settings.processTimeoutSeconds"
              :min="10"
              :max="600"
              class="w-24"
              inputClass="p-inputtext-sm"
              @update:modelValue="(v: number) => updateNumber('processTimeoutSeconds', v)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-300">Max history msgs:</label>
            <InputNumber
              :modelValue="store.settings.maxHistoryMessages"
              :min="1"
              :max="50"
              class="w-24"
              inputClass="p-inputtext-sm"
              @update:modelValue="(v: number) => updateNumber('maxHistoryMessages', v)"
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>
