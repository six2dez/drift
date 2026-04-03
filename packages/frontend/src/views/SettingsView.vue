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
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing) providers[providerId] = { ...existing, command };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function toggleProvider(providerId: string) {
  const providers = { ...store.settings.providers };
  const existing = providers[providerId];
  if (existing)
    providers[providerId] = { ...existing, enabled: !existing.enabled };
  await store.updateSettings({ providers });
  await store.refreshProviders();
}

async function updateCaidoApiUrl(url: string) {
  await store.updateSettings({
    caidoApi: { ...store.settings.caidoApi, url },
  });
}

async function updateCaidoApiToken(token: string) {
  await store.updateSettings({
    caidoApi: { ...store.settings.caidoApi, token },
  });
}

async function updateTimeout(val: string) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 10)
    await store.updateSettings({ processTimeoutSeconds: n });
}

async function updateMaxHistory(val: string) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1)
    await store.updateSettings({ maxHistoryMessages: n });
}

const inputStyle =
  "flex: 1; padding: 4px 8px; font-size: 13px; border-radius: 4px; border: 1px solid #555; background: #1e1e1e; color: #e0e0e0; outline: none;";
const labelStyle = "font-size: 13px; color: #aaa; width: 60px; flex-shrink: 0;";
const sectionStyle =
  "padding: 12px; border-radius: 6px; border: 1px solid #333;";
</script>

<template>
  <div style="padding: 16px; overflow-y: auto; height: 100%; max-width: 640px;">
    <!-- Init error -->
    <div
      v-if="store.initError"
      style="margin-bottom: 12px; padding: 8px 12px; font-size: 12px; color: #f87171; background: #1c1917; border: 1px solid #7f1d1d; border-radius: 6px;"
    >
      Backend: {{ store.initError }}
    </div>

    <!-- Loading -->
    <div v-if="store.loading" style="color: #888;">Loading...</div>

    <div v-else style="display: flex; flex-direction: column; gap: 24px;">
      <!-- CLI Providers -->
      <section>
        <div
          style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;"
        >
          <h2 style="font-size: 16px; font-weight: 600; color: #e0e0e0; margin: 0;">
            CLI Providers
          </h2>
          <button
            style="font-size: 11px; padding: 2px 8px; border-radius: 4px; background: #333; color: #aaa; border: none; cursor: pointer;"
            @click="store.refreshProviders()"
          >
            Refresh
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div v-for="pid in allProviders" :key="pid" :style="sectionStyle">
            <div
              style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;"
            >
              <span
                style="width: 8px; height: 8px; border-radius: 50%; display: inline-block;"
                :style="{
                  background: store.isProviderAvailable(pid)
                    ? '#22c55e'
                    : '#ef4444',
                }"
              />
              <span style="font-weight: 500; color: #e0e0e0; font-size: 14px;">
                {{ CLI_PROVIDER_DISPLAY_NAMES[pid] }}
              </span>
              <div style="flex: 1;" />
              <button
                style="font-size: 11px; padding: 4px 8px; border-radius: 4px; border: none; cursor: pointer;"
                :style="{
                  background: store.settings.providers[pid]?.enabled
                    ? '#6366f1'
                    : '#333',
                  color: store.settings.providers[pid]?.enabled
                    ? '#fff'
                    : '#aaa',
                }"
                @click="toggleProvider(pid)"
              >
                {{
                  store.settings.providers[pid]?.enabled
                    ? "Enabled"
                    : "Disabled"
                }}
              </button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label :style="labelStyle">Command:</label>
              <input
                :value="store.settings.providers[pid]?.command ?? ''"
                :style="inputStyle"
                @change="
                  (e: Event) =>
                    updateProviderCommand(
                      pid,
                      (e.target as HTMLInputElement).value
                    )
                "
              />
            </div>
            <div
              v-if="
                store.providerStatuses.find((s) => s.id === pid)?.resolvedPath
              "
              style="margin-top: 4px; font-size: 11px; color: #666;"
            >
              {{
                store.providerStatuses.find((s) => s.id === pid)?.resolvedPath
              }}
            </div>
            <div
              v-if="store.providerStatuses.find((s) => s.id === pid)?.error"
              style="margin-top: 4px; font-size: 11px; color: #ef4444;"
            >
              {{ store.providerStatuses.find((s) => s.id === pid)?.error }}
            </div>
          </div>
        </div>
      </section>

      <!-- Caido API -->
      <section>
        <h2
          style="font-size: 16px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px 0;"
        >
          Caido API
        </h2>
        <div :style="sectionStyle">
          <div
            style="display: flex; flex-direction: column; gap: 8px;"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <label :style="labelStyle">URL:</label>
              <input
                :value="store.settings.caidoApi.url"
                :style="inputStyle"
                placeholder="http://localhost:8080"
                @change="
                  (e: Event) =>
                    updateCaidoApiUrl(
                      (e.target as HTMLInputElement).value
                    )
                "
              />
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label :style="labelStyle">Token:</label>
              <input
                :value="store.settings.caidoApi.token"
                type="password"
                :style="inputStyle"
                placeholder="Your Caido PAT token"
                @change="
                  (e: Event) =>
                    updateCaidoApiToken(
                      (e.target as HTMLInputElement).value
                    )
                "
              />
            </div>
            <p style="font-size: 11px; color: #666; margin: 4px 0 0 0;">
              Required for MCP tools. Generate a PAT in Caido &gt; Settings
              &gt; API Keys.
            </p>
          </div>
        </div>
      </section>

      <!-- MCP Server -->
      <section>
        <h2
          style="font-size: 16px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px 0;"
        >
          MCP Server
        </h2>
        <div :style="sectionStyle">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span
              style="width: 8px; height: 8px; border-radius: 50%; display: inline-block;"
              :style="{
                background: store.mcpStatus?.running ? '#22c55e' : '#666',
              }"
            />
            <span style="font-size: 13px; color: #e0e0e0;">
              {{
                store.mcpStatus?.running
                  ? `Running on port ${store.mcpStatus.port} (${store.mcpStatus.toolCount} tools)`
                  : "Stopped"
              }}
            </span>
            <div style="flex: 1;" />
            <button
              style="font-size: 11px; padding: 4px 12px; border-radius: 4px; border: none; cursor: pointer;"
              :style="{
                background: store.mcpStatus?.running ? '#ef4444' : '#16a34a',
                color: '#fff',
              }"
              @click="store.toggleMcp()"
            >
              {{ store.mcpStatus?.running ? "Stop" : "Start" }}
            </button>
          </div>
          <p style="font-size: 11px; color: #666; margin: 8px 0 0 0;">
            Exposes Caido tools to CLI agents: history, replay, findings, scope,
            environment, workflows, intercept.
          </p>
        </div>
      </section>

      <!-- Process Settings -->
      <section>
        <h2
          style="font-size: 16px; font-weight: 600; color: #e0e0e0; margin: 0 0 12px 0;"
        >
          Process
        </h2>
        <div :style="sectionStyle">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 13px; color: #aaa;">Timeout (s):</label>
              <input
                :value="store.settings.processTimeoutSeconds"
                type="number"
                min="10"
                style="width: 80px; padding: 4px 8px; font-size: 13px; border-radius: 4px; border: 1px solid #555; background: #1e1e1e; color: #e0e0e0; outline: none;"
                @change="
                  (e: Event) =>
                    updateTimeout((e.target as HTMLInputElement).value)
                "
              />
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <label style="font-size: 13px; color: #aaa;"
                >Max history msgs:</label
              >
              <input
                :value="store.settings.maxHistoryMessages"
                type="number"
                min="1"
                style="width: 80px; padding: 4px 8px; font-size: 13px; border-radius: 4px; border: 1px solid #555; background: #1e1e1e; color: #e0e0e0; outline: none;"
                @change="
                  (e: Event) =>
                    updateMaxHistory((e.target as HTMLInputElement).value)
                "
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
