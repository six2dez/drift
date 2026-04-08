import { defineStore } from "pinia";
import { ref } from "vue";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type ProviderStatus,
  type McpServerInfo,
} from "shared";
import { useSDK } from "../plugins/sdk";

type StoredData = { settings: Settings };

export const useSettingsStore = defineStore("settings", () => {
  const sdk = useSDK();
  const settings = ref<Settings>(DEFAULT_SETTINGS);
  const providerStatuses = ref<ProviderStatus[]>([]);
  const mcpStatus = ref<McpServerInfo | null>(null);
  const loading = ref(false);
  const initError = ref<string | null>(null);

  async function initialize() {
    loading.value = true;
    initError.value = null;

    try {
      // Load settings from frontend storage (persists across reinstalls)
      let storageWorking = false;
      try {
        const stored = await sdk.storage.get() as StoredData | undefined;
        if (stored?.settings !== undefined) {
          settings.value = { ...DEFAULT_SETTINGS, ...stored.settings };
          storageWorking = true;
        }
      } catch (storageErr) {
        initError.value = `Storage load failed: ${String(storageErr)}`;
      }

      // Sync settings to backend
      await sdk.backend.updateSettings(settings.value);

      // Fetch provider statuses and MCP status
      const results = await Promise.allSettled([
        sdk.backend.getProviderStatuses(),
        sdk.backend.getMcpStatus(),
      ]);

      const pResult = results[0]?.status === "fulfilled" ? results[0].value : null;
      const mResult = results[1]?.status === "fulfilled" ? results[1].value : null;

      if (pResult?.kind === "Ok") providerStatuses.value = pResult.value;
      if (mResult?.kind === "Ok") mcpStatus.value = mResult.value;

      const errors: string[] = [];
      if (results[0]?.status === "rejected")
        errors.push(`providers: ${String(results[0].reason)}`);
      if (pResult?.kind === "Error" && pResult.error !== "")
        errors.push(`providers: ${pResult.error}`);
      if (results[1]?.status === "rejected")
        errors.push(`mcp: ${String(results[1].reason)}`);

      const msg = errors.join("; ").trim();
      if (msg.length > 0) initError.value = msg;
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
    // Update local state
    settings.value = { ...settings.value, ...input };

    // Persist to frontend storage (survives reinstalls)
    try {
      await sdk.storage.set({ settings: settings.value } as StoredData);
    } catch (e) {
      sdk.window.showToast(`Failed to persist settings: ${String(e)}`, { variant: "error" });
    }

    // Sync to backend
    try {
      await sdk.backend.updateSettings(settings.value);
    } catch {}
  }

  async function refreshProviders() {
    try {
      const result = await sdk.backend.getProviderStatuses();
      if (result.kind === "Ok") providerStatuses.value = result.value;
    } catch {}
  }

  async function toggleMcp(): Promise<string | undefined> {
    try {
      if (mcpStatus.value?.running) {
        const stopResult = await sdk.backend.stopMcpServer();
        if (stopResult.kind === "Error") return stopResult.error;
      } else {
        const startResult = await sdk.backend.startMcpServer();
        if (startResult.kind === "Error") return startResult.error;
      }
      const result = await sdk.backend.getMcpStatus();
      if (result.kind === "Ok") mcpStatus.value = result.value;
      return undefined;
    } catch (e) {
      return String(e);
    }
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
