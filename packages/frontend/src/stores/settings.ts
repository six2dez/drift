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

  async function initialize() {
    loading.value = true;
    const [sResult, pResult, mResult] = await Promise.all([
      sdk.backend.getSettings(),
      sdk.backend.getProviderStatuses(),
      sdk.backend.getMcpStatus(),
    ]);
    if (sResult.kind === "Ok") settings.value = sResult.value;
    if (pResult.kind === "Ok") providerStatuses.value = pResult.value;
    if (mResult.kind === "Ok") mcpStatus.value = mResult.value;
    loading.value = false;

    // Fix #11: Listen for real-time MCP status changes
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
  }

  async function updateSettings(input: Partial<Settings>) {
    const result = await sdk.backend.updateSettings(input);
    if (result.kind === "Ok") settings.value = result.value;
  }

  async function refreshProviders() {
    const result = await sdk.backend.getProviderStatuses();
    if (result.kind === "Ok") providerStatuses.value = result.value;
  }

  async function toggleMcp() {
    if (mcpStatus.value?.running) {
      await sdk.backend.stopMcpServer();
    } else {
      await sdk.backend.startMcpServer();
    }
    const result = await sdk.backend.getMcpStatus();
    if (result.kind === "Ok") mcpStatus.value = result.value;
  }

  function isProviderAvailable(providerId: string): boolean {
    return providerStatuses.value.find((p) => p.id === providerId)?.available ?? false;
  }

  return {
    settings,
    providerStatuses,
    mcpStatus,
    loading,
    initialize,
    updateSettings,
    refreshProviders,
    toggleMcp,
    isProviderAvailable,
  };
});
