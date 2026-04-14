import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  DEFAULT_SETTINGS,
  migrateScannerSettings,
  type McpToolPermissionGroup,
  type Settings,
  type ProviderStatus,
  type McpServerInfo,
  type SupportBundleOutput,
} from "shared";
import { useSDK } from "../plugins/sdk";
import { INIT_REQUEST_TIMEOUT_MS, withTimeout } from "../utils/promise-timeout";

const POST_INIT_BOOTSTRAP_DELAY_MS = 750;

type StoredData = { settings: Settings };
type SubscriptionHandle = { stop: () => void };
type ReadinessCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nextAction: string;
};

export const useSettingsStore = defineStore("settings", () => {
  const sdk = useSDK();
  const settings = ref<Settings>(DEFAULT_SETTINGS);
  const providerStatuses = ref<ProviderStatus[]>([]);
  const mcpStatus = ref<McpServerInfo | null>(null);
  const loading = ref(false);
  const initError = ref<string | null>(null);
  const preflightRunning = ref(false);
  const preflightError = ref<string | null>(null);
  const supportBundleRunning = ref(false);
  let mcpStatusUnsub: SubscriptionHandle | undefined;
  let filterChangeUnsub: SubscriptionHandle | undefined;
  let projectChangeUnsub: SubscriptionHandle | undefined;
  let postInitBootstrapHandle: ReturnType<typeof setTimeout> | undefined;

  function clearInitErrorPrefix(prefix: string) {
    if (initError.value === null || initError.value.trim() === "") return;
    const remaining = initError.value
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "" && !part.startsWith(prefix));
    initError.value = remaining.length > 0 ? remaining.join("; ") : null;
  }

  function appendInitErrorPrefix(prefix: string, message: string) {
    const detail = message.trim();
    if (detail === "") return;
    clearInitErrorPrefix(prefix);
    initError.value =
      initError.value !== null && initError.value.trim() !== ""
        ? `${initError.value}; ${prefix} ${detail}`
        : `${prefix} ${detail}`;
  }

  async function pushCaidoSessionToken(token: string) {
    const result = await withTimeout(
      sdk.backend.syncCaidoSessionToken(token),
      INIT_REQUEST_TIMEOUT_MS,
      "Syncing the Caido session token",
    );
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
  }

  async function syncCaidoSessionToken() {
    const raw = window.localStorage.getItem("CAIDO_AUTHENTICATION");
    if (raw === null || raw.trim() === "") {
      await pushCaidoSessionToken("");
      return;
    }

    let token = "";
    try {
      const parsed = JSON.parse(raw) as { accessToken?: string };
      token = typeof parsed.accessToken === "string"
        ? parsed.accessToken.trim()
        : "";
    } catch (error) {
      await pushCaidoSessionToken("");
      sdk.window.showToast(`Failed to read the current Caido session token: ${String(error)}`, {
        variant: "warning",
      });
      return;
    }

    await pushCaidoSessionToken(token);
  }

  async function syncCaidoHistoryContext() {
    const currentFilter = sdk.filters.getCurrentFilter();
    const result = await withTimeout(
      sdk.backend.syncCaidoHistoryContext({
        filterId: currentFilter?.id ?? "",
        filterName: currentFilter?.name ?? "",
        filterQuery: currentFilter?.query ?? "",
        historyQuery: sdk.httpHistory.getQuery() ?? "",
        historyScopeId: sdk.httpHistory.getScopeId() ?? "",
      }),
      INIT_REQUEST_TIMEOUT_MS,
      "Syncing the current Caido history context",
    );
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
  }

  async function syncCaidoRuntimeContext() {
    await syncCaidoSessionToken();
    await syncCaidoHistoryContext();
  }

  async function refreshMcpStatus() {
    const result = await withTimeout(
      sdk.backend.getMcpStatus(),
      INIT_REQUEST_TIMEOUT_MS,
      "Fetching the MCP status",
    );
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
    mcpStatus.value = result.value;
    clearInitErrorPrefix("mcp:");
  }

  async function refreshProvidersInternal(options?: {
    silent?: boolean;
  }) {
    try {
      const result = await withTimeout(
        sdk.backend.getProviderStatuses(),
        INIT_REQUEST_TIMEOUT_MS,
        "Refreshing provider availability",
      );
      if (result.kind === "Ok") {
        providerStatuses.value = result.value;
        clearInitErrorPrefix("providers:");
        return;
      }
      appendInitErrorPrefix("providers:", result.error);
      if (options?.silent !== true) {
        sdk.window.showToast(`Failed to refresh provider availability: ${result.error}`, {
          variant: "warning",
        });
      }
    } catch (error) {
      appendInitErrorPrefix("providers:", String(error));
      if (options?.silent !== true) {
        sdk.window.showToast(`Failed to refresh provider availability: ${String(error)}`, {
          variant: "warning",
        });
      }
    }
  }

  async function ensureMcpStartedOnBootstrap() {
    if (!settings.value.mcp.enabled || mcpStatus.value?.running) return;

    try {
      await syncCaidoRuntimeContext();
      const startResult = await withTimeout(
        sdk.backend.startMcpServer(),
        INIT_REQUEST_TIMEOUT_MS,
        "Starting the MCP runtime",
      );
      if (startResult.kind === "Error") {
        appendInitErrorPrefix("mcp:", startResult.error);
        await refreshMcpStatus().catch(() => undefined);
        return;
      }
      await refreshMcpStatus();
    } catch (error) {
      appendInitErrorPrefix("mcp:", String(error));
    }
  }

  async function runPostInitBootstrap() {
    await refreshProvidersInternal({ silent: true });
    await refreshMcpStatus().catch((error) => {
      appendInitErrorPrefix("mcp:", String(error));
    });
    await ensureMcpStartedOnBootstrap();
    await refreshProvidersInternal({ silent: true });
  }

  function schedulePostInitBootstrap() {
    if (postInitBootstrapHandle !== undefined) {
      clearTimeout(postInitBootstrapHandle);
    }
    postInitBootstrapHandle = setTimeout(() => {
      postInitBootstrapHandle = undefined;
      void runPostInitBootstrap();
    }, POST_INIT_BOOTSTRAP_DELAY_MS);
  }

  function ensureSubscriptions() {
    if (mcpStatusUnsub === undefined) {
      mcpStatusUnsub = sdk.backend.onEvent("mcp-status", (event: McpServerInfo) => {
        mcpStatus.value = event;
      });
    }

    if (filterChangeUnsub === undefined) {
      filterChangeUnsub = sdk.filters.onCurrentFilterChange(() => {
        void syncCaidoHistoryContext().catch((error) => {
          sdk.window.showToast(`Failed to sync the current Caido filter: ${String(error)}`, {
            variant: "warning",
          });
        });
        void refreshMcpStatus().catch(() => undefined);
      });
    }

    if (projectChangeUnsub === undefined) {
      projectChangeUnsub = sdk.projects.onCurrentProjectChange(() => {
        void syncCaidoHistoryContext().catch((error) => {
          sdk.window.showToast(`Failed to sync the current Caido history context: ${String(error)}`, {
            variant: "warning",
          });
        });
        void refreshMcpStatus().catch(() => undefined);
      });
    }
  }

  async function initialize() {
    loading.value = true;
    initError.value = null;

    try {
      // Load settings from frontend storage (persists across reinstalls).
      // Normalize the scanner sub-object via the shared migration helper
      // so legacy field names (activeTimeoutSeconds, providerId) get
      // rewritten/dropped here rather than riding along via shallow merge.
      try {
        const stored = await sdk.storage.get() as StoredData | undefined;
        if (stored?.settings !== undefined) {
          const merged: Settings = { ...DEFAULT_SETTINGS, ...stored.settings };
          merged.scanner = migrateScannerSettings(
            (stored.settings as { scanner?: unknown }).scanner,
          );
          settings.value = merged;
        }
      } catch (storageErr) {
        initError.value = `Storage load failed: ${String(storageErr)}`;
      }

      await syncCaidoRuntimeContext();
      ensureSubscriptions();

      // Sync settings to backend
      const syncResult = await withTimeout(
        sdk.backend.updateSettings(settings.value),
        INIT_REQUEST_TIMEOUT_MS,
        "Syncing Drift settings",
      );
      if (syncResult.kind === "Error") {
        initError.value = syncResult.error;
      }

      // Fetch provider statuses and MCP status
      const results = await Promise.allSettled([
        withTimeout(
          sdk.backend.getProviderStatuses(),
          INIT_REQUEST_TIMEOUT_MS,
          "Checking provider availability",
        ),
        refreshMcpStatus(),
      ]);

      const pResult = results[0]?.status === "fulfilled" ? results[0].value : null;

      if (pResult?.kind === "Ok") providerStatuses.value = pResult.value;

      const errors: string[] = [];
      if (results[0]?.status === "rejected")
        errors.push(`providers: ${String(results[0].reason)}`);
      if (pResult?.kind === "Error" && pResult.error !== "")
        errors.push(`providers: ${pResult.error}`);
      if (results[1]?.status === "rejected")
        errors.push(`mcp: ${String(results[1].reason)}`);

      const msg = errors.join("; ").trim();
      if (msg.length > 0) initError.value = msg;

      schedulePostInitBootstrap();
    } catch (err) {
      initError.value = (err as Error).message;
    }

    loading.value = false;
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
      await syncCaidoRuntimeContext();
      const result = await sdk.backend.updateSettings(settings.value);
      if (result.kind === "Error") {
        sdk.window.showToast(result.error, { variant: "error" });
      }
      await refreshMcpStatus().catch(() => undefined);
    } catch (e) {
      sdk.window.showToast(`Failed to sync settings: ${String(e)}`, { variant: "error" });
    }
  }

  async function refreshProviders() {
    await refreshProvidersInternal();
  }

  async function runMcpSelfTest(providerId?: string): Promise<string | undefined> {
    // Pump the backend plugin's event loop while the self-test is in
    // flight. Caido suspends plugin timers and child_process events when
    // the plugin is idle, so the spawn-based callMcpMethod inside
    // runSharedMcpSelfTest would otherwise hang forever waiting for stdout
    // events that never fire. Each incoming RPC wakes the backend and
    // lets those pending events drain — same pattern as the ChatView
    // keep-alive ping during streaming.
    const keepAliveHandle = setInterval(() => {
      void sdk.backend.getMcpStatus().catch(() => undefined);
    }, 1500);
    try {
      const result = await sdk.backend.runMcpSelfTest(providerId ?? "");
      if (result.kind === "Error") return result.error;
      await refreshMcpStatus();
      return undefined;
    } catch (error) {
      return String(error);
    } finally {
      clearInterval(keepAliveHandle);
    }
  }

  async function toggleMcp(): Promise<string | undefined> {
    let actionError: string | undefined;
    try {
      if (mcpStatus.value?.running) {
        const stopResult = await sdk.backend.stopMcpServer();
        if (stopResult.kind === "Error") actionError = stopResult.error;
      } else {
        await syncCaidoRuntimeContext();
        const startResult = await sdk.backend.startMcpServer();
        if (startResult.kind === "Error") actionError = startResult.error;
      }
      await refreshMcpStatus();
      return actionError;
    } catch (e) {
      return String(e);
    }
  }

  async function runPreflight(): Promise<string | undefined> {
    preflightRunning.value = true;
    preflightError.value = null;
    try {
      await refreshProviders();
      await syncCaidoRuntimeContext();
      await refreshMcpStatus();
      if (!mcpStatus.value?.running) {
        const startResult = await sdk.backend.startMcpServer();
        if (startResult.kind === "Error") {
          preflightError.value = startResult.error;
          return preflightError.value;
        }
        await refreshMcpStatus();
      }
      const selfTestError = await runMcpSelfTest();
      preflightError.value = selfTestError ?? null;
      await refreshProviders();
      await refreshMcpStatus();
      return selfTestError;
    } catch (error) {
      preflightError.value = String(error);
      return preflightError.value;
    } finally {
      preflightRunning.value = false;
    }
  }

  async function updateMcpPermissionGroup(group: McpToolPermissionGroup, enabled: boolean) {
    await updateSettings({
      mcpPermissions: {
        ...settings.value.mcpPermissions,
        enabledGroups: {
          ...settings.value.mcpPermissions.enabledGroups,
          [group]: enabled,
        },
      },
    });
  }

  async function updateSensitiveActionConfirmations(enabled: boolean) {
    await updateSettings({
      mcpPermissions: {
        ...settings.value.mcpPermissions,
        confirmSensitiveActions: enabled,
      },
    });
  }

  async function exportSupportBundle(): Promise<SupportBundleOutput> {
    supportBundleRunning.value = true;
    try {
      const result = await sdk.backend.exportSupportBundle();
      if (result.kind === "Error") {
        throw new Error(result.error);
      }
      return result.value;
    } finally {
      supportBundleRunning.value = false;
    }
  }

  const readinessChecks = computed<ReadinessCheck[]>(() => {
    const enabledProviderIds = Object.entries(settings.value.providers)
      .filter(([, provider]) => provider.enabled)
      .map(([providerId]) => providerId);
    const availableEnabledProviderIds = enabledProviderIds.filter((providerId) =>
      providerStatuses.value.find((status) => status.id === providerId)?.available
    );
    const unavailableProviders = enabledProviderIds.filter((providerId) =>
      !providerStatuses.value.find((status) => status.id === providerId)?.available
    );
    const providerCheck: ReadinessCheck =
      enabledProviderIds.length === 0
        ? {
          id: "providers",
          label: "CLI providers",
          status: "fail",
            detail: "No provider is enabled.",
            nextAction: "Enable at least one configured provider.",
          }
        : availableEnabledProviderIds.length === 0
          ? {
            id: "providers",
            label: "CLI providers",
            status: "fail",
            detail: `Enabled, but none resolve successfully. Unavailable: ${unavailableProviders.join(", ")}.`,
            nextAction: "Fix at least one command path or disable the unavailable providers.",
          }
        : unavailableProviders.length === 0
          ? {
            id: "providers",
            label: "CLI providers",
            status: "pass",
            detail: `${enabledProviderIds.length} enabled provider(s) resolved successfully.`,
            nextAction: "None.",
          }
          : {
            id: "providers",
            label: "CLI providers",
            status: "warn",
            detail: `${availableEnabledProviderIds.length} enabled provider(s) are available. Unavailable: ${unavailableProviders.join(", ")}.`,
            nextAction: "You can keep working with the available providers, or fix/disable the unavailable ones.",
          };

    const authCheck: ReadinessCheck =
      mcpStatus.value?.authState === "valid"
        ? {
          id: "auth",
          label: "Caido auth",
          status: "pass",
          detail: `Authenticated via ${mcpStatus.value.authSource}.`,
          nextAction: "None.",
        }
        : mcpStatus.value?.authState === "invalid" || mcpStatus.value?.authState === "error"
          ? {
            id: "auth",
            label: "Caido auth",
            status: "fail",
            detail: mcpStatus.value.authMessage || "Drift could not validate the current Caido token.",
            nextAction: "Open any Caido page to refresh the session token.",
          }
          : {
            id: "auth",
            label: "Caido auth",
            status: "warn",
            detail: "Authentication has not been validated yet.",
            nextAction: "Start MCP or run the preflight.",
          };

    const mcpCheck: ReadinessCheck =
      mcpStatus.value?.running
        ? {
          id: "mcp",
          label: "MCP runtime",
          status: "pass",
          detail: `${mcpStatus.value.toolCount}/${mcpStatus.value.supportedToolCount} tools currently exposed.`,
          nextAction: "None.",
        }
        : {
          id: "mcp",
          label: "MCP runtime",
          status: "fail",
          detail: "The MCP runtime is currently stopped.",
          nextAction: "Start MCP from Settings or run the preflight.",
        };

    const enabledSelfTests = availableEnabledProviderIds
      .map((providerId) => mcpStatus.value?.selfTestResults?.[providerId])
      .filter((result) => result !== undefined);
    const selfTestCheck: ReadinessCheck =
      availableEnabledProviderIds.length === 0
        ? {
          id: "self-test",
          label: "Live MCP test",
          status: "warn",
          detail: "At least one enabled provider must be available before running the live MCP test.",
          nextAction: "Fix one provider command first, then run the health check again.",
        }
        : enabledSelfTests.length === 0
        ? {
          id: "self-test",
          label: "Live MCP test",
          status: "warn",
          detail: "No live MCP test has been run for the available providers yet.",
          nextAction: "Run the health check or the live test.",
        }
        : enabledSelfTests.every((result) => result?.state === "passed")
          ? {
            id: "self-test",
            label: "Live MCP test",
            status: "pass",
            detail: "All available providers passed the latest live MCP test.",
            nextAction: "None.",
          }
          : enabledSelfTests.some((result) => result?.state === "running")
            ? {
              id: "self-test",
              label: "Live MCP test",
              status: "warn",
              detail: "A live MCP test is still running.",
              nextAction: "Wait for the current live test to finish.",
            }
            : {
              id: "self-test",
              label: "Live MCP test",
              status: "fail",
              detail: "At least one available provider failed the latest live MCP test.",
              nextAction: "Inspect the failed provider checks below and rerun the live test after fixing them.",
            };

    const effectiveContext = mcpStatus.value?.effectiveContext;
    const contextCheck: ReadinessCheck =
      effectiveContext !== undefined && effectiveContext.projectId !== ""
        ? {
          id: "context",
          label: "Caido context sync",
          status: "pass",
          detail: effectiveContext.overrideActive
            ? `Synced with override on project ${effectiveContext.projectId}.`
            : `Synced on project ${effectiveContext.projectId}.`,
          nextAction: effectiveContext.overrideActive
            ? "Clear the override if you want Drift to follow the Caido UI project again."
            : "None.",
        }
        : {
          id: "context",
          label: "Caido context sync",
          status: "warn",
          detail: "No active Caido project is synced yet.",
          nextAction: "Open a Caido project and rerun the preflight.",
        };

    return [providerCheck, authCheck, mcpCheck, selfTestCheck, contextCheck];
  });

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
    preflightRunning,
    preflightError,
    supportBundleRunning,
    readinessChecks,
    initialize,
    updateSettings,
    updateMcpPermissionGroup,
    updateSensitiveActionConfirmations,
    refreshProviders,
    refreshMcpStatus,
    runPreflight,
    runMcpSelfTest,
    toggleMcp,
    syncCaidoHistoryContext,
    syncCaidoRuntimeContext,
    isProviderAvailable,
    exportSupportBundle,
  };
});
