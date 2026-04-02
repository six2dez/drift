<script setup lang="ts">
import { onMounted } from "vue";
import { useSettingsStore } from "../stores/settings";
import { CliProvider, CLI_PROVIDER_DISPLAY_NAMES } from "shared";

const store = useSettingsStore();

const allProviders = [
  CliProvider.Claude,
  CliProvider.Gemini,
  CliProvider.Codex,
  CliProvider.Copilot,
] as const;

onMounted(() => store.initialize());

async function updateProviderCommand(providerId: string, command: string) {
  if (!store.settings) return;
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing) providers[providerId] = { ...existing, command };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function toggleProvider(providerId: string) {
  if (!store.settings) return;
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing) providers[providerId] = { ...existing, enabled: !existing.enabled };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function updateCaidoApiUrl(url: string) {
  if (!store.settings) return;
  await store.updateSettings({ caidoApi: { ...store.settings.caidoApi, url } });
}

async function updateCaidoApiToken(token: string) {
  if (!store.settings) return;
  await store.updateSettings({ caidoApi: { ...store.settings.caidoApi, token } });
}

async function updateTimeout(val: string) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 10) await store.updateSettings({ processTimeoutSeconds: n });
}

async function updateMaxHistory(val: string) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) await store.updateSettings({ maxHistoryMessages: n });
}
</script>

<template>
  <div class="p-4 overflow-y-auto h-full max-w-2xl">
    <div v-if="store.loading" class="text-surface-400">Loading...</div>

    <div v-else-if="store.settings" class="space-y-6">
      <!-- CLI Providers -->
      <section>
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-100">CLI Providers</h2>
          <button
            class="text-xs px-2 py-0.5 rounded bg-surface-200 dark:bg-surface-700 text-surface-500 hover:text-surface-800 dark:hover:text-surface-200"
            @click="store.refreshProviders()"
          >
            Refresh
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="pid in allProviders"
            :key="pid"
            class="p-3 rounded border border-surface-200 dark:border-surface-700"
          >
            <div class="flex items-center gap-3 mb-2">
              <span
                class="w-2 h-2 rounded-full"
                :class="store.isProviderAvailable(pid) ? 'bg-green-500' : 'bg-red-500'"
              />
              <span class="font-medium text-surface-900 dark:text-surface-100">
                {{ CLI_PROVIDER_DISPLAY_NAMES[pid] }}
              </span>
              <div class="flex-1" />
              <button
                class="text-xs px-2 py-1 rounded"
                :class="store.settings.providers[pid]?.enabled
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-300'"
                @click="toggleProvider(pid)"
              >
                {{ store.settings.providers[pid]?.enabled ? 'Enabled' : 'Disabled' }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs text-surface-400 w-16">Command:</label>
              <input
                :value="store.settings.providers[pid]?.command ?? ''"
                class="flex-1 px-2 py-1 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
                @change="(e: Event) => updateProviderCommand(pid, (e.target as HTMLInputElement).value)"
              />
            </div>
            <div
              v-if="store.providerStatuses.find(s => s.id === pid)?.resolvedPath"
              class="mt-1 text-xs text-surface-400"
            >
              {{ store.providerStatuses.find(s => s.id === pid)?.resolvedPath }}
            </div>
            <div
              v-if="store.providerStatuses.find(s => s.id === pid)?.error"
              class="mt-1 text-xs text-red-500"
            >
              {{ store.providerStatuses.find(s => s.id === pid)?.error }}
            </div>
          </div>
        </div>
      </section>

      <!-- Caido API -->
      <section>
        <h2 class="text-lg font-semibold mb-3 text-surface-900 dark:text-surface-100">Caido API</h2>
        <div class="p-3 rounded border border-surface-200 dark:border-surface-700 space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600 dark:text-surface-300 w-16">URL:</label>
            <input
              :value="store.settings.caidoApi.url"
              class="flex-1 px-2 py-1 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
              placeholder="http://localhost:8080"
              @change="(e: Event) => updateCaidoApiUrl((e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600 dark:text-surface-300 w-16">Token:</label>
            <input
              :value="store.settings.caidoApi.token"
              type="password"
              class="flex-1 px-2 py-1 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
              placeholder="Your Caido PAT token"
              @change="(e: Event) => updateCaidoApiToken((e.target as HTMLInputElement).value)"
            />
          </div>
          <p class="text-xs text-surface-400">
            Required for MCP tools. Generate a PAT in Caido &gt; Settings &gt; API Keys.
          </p>
        </div>
      </section>

      <!-- MCP Server -->
      <section>
        <h2 class="text-lg font-semibold mb-3 text-surface-900 dark:text-surface-100">MCP Server</h2>
        <div class="p-3 rounded border border-surface-200 dark:border-surface-700 space-y-2">
          <div class="flex items-center gap-3">
            <span
              class="w-2 h-2 rounded-full"
              :class="store.mcpStatus?.running ? 'bg-green-500' : 'bg-surface-500'"
            />
            <span class="text-sm text-surface-900 dark:text-surface-100">
              {{ store.mcpStatus?.running
                ? `Running on port ${store.mcpStatus.port} (${store.mcpStatus.toolCount} tools)`
                : 'Stopped' }}
            </span>
            <div class="flex-1" />
            <button
              class="text-xs px-3 py-1 rounded"
              :class="store.mcpStatus?.running
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-green-600 text-white hover:bg-green-700'"
              @click="store.toggleMcp()"
            >
              {{ store.mcpStatus?.running ? 'Stop' : 'Start' }}
            </button>
          </div>
          <p class="text-xs text-surface-400">
            Exposes Caido tools to CLI agents: search history, replay requests, create findings, manage scope, environment, workflows, and intercept.
          </p>
        </div>
      </section>

      <!-- Process Settings -->
      <section>
        <h2 class="text-lg font-semibold mb-3 text-surface-900 dark:text-surface-100">Process</h2>
        <div class="p-3 rounded border border-surface-200 dark:border-surface-700 space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600 dark:text-surface-300">Timeout (s):</label>
            <input
              :value="store.settings.processTimeoutSeconds"
              type="number"
              min="10"
              class="w-20 px-2 py-1 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
              @change="(e: Event) => updateTimeout((e.target as HTMLInputElement).value)"
            />
          </div>
          <div class="flex items-center gap-2">
            <label class="text-sm text-surface-600 dark:text-surface-300">Max history msgs:</label>
            <input
              :value="store.settings.maxHistoryMessages"
              type="number"
              min="1"
              class="w-20 px-2 py-1 text-sm rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-surface-100"
              @change="(e: Event) => updateMaxHistory((e.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
