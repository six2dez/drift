import { defineStore } from "pinia";
import { ref } from "vue";
import type { Settings, ProviderStatus, McpServerInfo } from "shared";
import { useSDK } from "../plugins/sdk";

export const useSettingsStore = defineStore("settings", () => {
  const sdk = useSDK();
  const settings = ref<Settings | null>(null);
  const providerStatuses = ref<ProviderStatus[]>([]);
  const mcpStatus = ref<McpServerInfo | null>(null);
  const loading = ref(false);
  const initError = ref<string | null>(null);

  async function initialize() {
    loading.value = true;
    initError.value = null;

    try {
      const results = await Promise.allSettled([
        sdk.backend.getSettings(),
        sdk.backend.getProviderStatuses(),
        sdk.backend.getMcpStatus(),
      ]);

      const sResult = results[0]?.status === "fulfilled" ? results[0].value : null;
      const pResult = results[1]?.status === "fulfilled" ? results[1].value : null;
      const mResult = results[2]?.status === "fulfilled" ? results[2].value : null;

      if (sResult?.kind === "Ok") settings.value = sResult.value;
      if (pResult?.kind === "Ok") providerStatuses.value = pResult.value;
      if (mResult?.kind === "Ok") mcpStatus.value = mResult.value;
    } catch (err) {
      initError.value = (err as Error).message;
    }

    loading.value = false;

    // Listen for real-time MCP status changes
    try {
      sdk.backend.onEvent("mcp-status", (event) => {
        mcpStatus.value = {
          running: event.running,
          port: event.port,
          toolCount: event.toolCount,
          host: mcpStatus.value?.host ?? "127.0.0.1",
          token: mcpStatus.value?.token ?? "",
          url: mcpStatus.value?.url ?? "",
        };
      });
    } catch {
      // onEvent may not be available in all SDK versions
    }
  }

  async function updateSettings(input: Partial<Settings>) {
    try {
      const result = await sdk.backend.updateSettings(input);
      if (result.kind === "Ok") settings.value = result.value;
    } catch {
      // Silently fail, settings will be stale
    }
  }

  async function refreshProviders() {
    try {
      const result = await sdk.backend.getProviderStatuses();
      if (result.kind === "Ok") providerStatuses.value = result.value;
    } catch {
      // Silently fail
    }
  }

  async function toggleMcp() {
    try {
      if (mcpStatus.value?.running) {
        await sdk.backend.stopMcpServer();
      } else {
        await sdk.backend.startMcpServer();
      }
      const result = await sdk.backend.getMcpStatus();
      if (result.kind === "Ok") mcpStatus.value = result.value;
    } catch {
      // Silently fail
    }
  }

  function isProviderAvailable(providerId: string): boolean {
    return providerStatuses.value.find((p) => p.id === providerId)?.available ?? false;
  }

  return {
    settings,
    providerStatuses,
    mcpStatus,
    loading,
    initError,
    initialize,
    updateSettings,
    refreshProviders,
    toggleMcp,
    isProviderAvailable,
  };
});
