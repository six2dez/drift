import { defineStore } from "pinia";
import { ref } from "vue";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type ProviderStatus,
  type McpServerInfo,
} from "shared";
import { useSDK } from "../plugins/sdk";

export const useSettingsStore = defineStore("settings", () => {
  const sdk = useSDK();
  // Start with default settings so UI is always usable
  const settings = ref<Settings>(DEFAULT_SETTINGS);
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

      const sResult =
        results[0]?.status === "fulfilled" ? results[0].value : null;
      const pResult =
        results[1]?.status === "fulfilled" ? results[1].value : null;
      const mResult =
        results[2]?.status === "fulfilled" ? results[2].value : null;

      if (sResult?.kind === "Ok") settings.value = sResult.value;
      if (pResult?.kind === "Ok") providerStatuses.value = pResult.value;
      if (mResult?.kind === "Ok") mcpStatus.value = mResult.value;

      // Collect errors for debugging (only real errors, not empty ones)
      const errors: string[] = [];
      if (results[0]?.status === "rejected")
        errors.push(`settings: ${String(results[0].reason)}`);
      if (sResult?.kind === "Error" && sResult.error !== "")
        errors.push(`settings: ${sResult.error}`);
      if (results[1]?.status === "rejected")
        errors.push(`providers: ${String(results[1].reason)}`);
      if (pResult?.kind === "Error" && pResult.error !== "")
        errors.push(`providers: ${pResult.error}`);
      if (results[2]?.status === "rejected")
        errors.push(`mcp: ${String(results[2].reason)}`);
      if (mResult?.kind === "Error" && mResult.error !== "")
        errors.push(`mcp: ${mResult.error}`);

      if (errors.length > 0) {
        initError.value = errors.join("; ");
      }
    } catch (err) {
      initError.value = (err as Error).message;
    }

    loading.value = false;

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
      // onEvent not available
    }
  }

  async function updateSettings(input: Partial<Settings>) {
    try {
      const result = await sdk.backend.updateSettings(input);
      if (result.kind === "Ok") settings.value = result.value;
    } catch {}
  }

  async function refreshProviders() {
    try {
      const result = await sdk.backend.getProviderStatuses();
      if (result.kind === "Ok") providerStatuses.value = result.value;
    } catch {}
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
    } catch {}
  }

  function isProviderAvailable(providerId: string): boolean {
    return (
      providerStatuses.value.find((p) => p.id === providerId)?.available ??
      false
    );
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
