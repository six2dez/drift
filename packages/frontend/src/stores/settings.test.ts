import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { DEFAULT_SETTINGS, type McpServerInfo } from "shared";
import { INIT_REQUEST_TIMEOUT_MS } from "../utils/promise-timeout";

const mockSdk = {
  backend: {
    syncCaidoSessionToken: vi.fn(),
    syncCaidoHistoryContext: vi.fn(),
    updateSettings: vi.fn(),
    getProviderStatuses: vi.fn(),
    getMcpStatus: vi.fn(),
    startMcpServer: vi.fn(),
    stopMcpServer: vi.fn(),
    runMcpSelfTest: vi.fn(),
    onEvent: vi.fn(() => ({ stop: vi.fn() })),
  },
  filters: {
    getCurrentFilter: vi.fn(() => undefined),
    onCurrentFilterChange: vi.fn(() => ({ stop: vi.fn() })),
  },
  projects: {
    onCurrentProjectChange: vi.fn(() => ({ stop: vi.fn() })),
  },
  httpHistory: {
    getQuery: vi.fn(() => ""),
    getScopeId: vi.fn(() => ""),
  },
  storage: {
    get: vi.fn(),
    set: vi.fn(),
  },
  window: {
    showToast: vi.fn(),
  },
};

vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
}));

import { useSettingsStore } from "./settings";

function createMcpStatus(): McpServerInfo {
  return {
    running: true,
    host: "127.0.0.1",
    port: 9877,
    token: "",
    toolCount: 18,
    supportedToolCount: 18,
    toolNames: [],
    url: "stdio:///tmp/drift",
    authState: "valid",
    authSource: "session",
    authMessage: "",
    uiContext: {
      projectId: "project-1",
      filterId: "",
      filterName: "",
      filterQuery: "",
      historyQuery: "",
      historyScopeId: "",
    },
    overrideContext: {
      projectId: "",
    },
    effectiveContext: {
      projectId: "project-1",
      filterId: "",
      filterName: "",
      filterQuery: "",
      historyQuery: "",
      historyScopeId: "",
      overrideProjectId: "",
      overrideActive: false,
      scopeSource: "ui",
    },
    selfTestResults: {
      "claude-cli": {
        providerId: "claude-cli",
        state: "passed",
        startedAt: 1,
        finishedAt: 2,
        durationMs: 1,
        cliReady: true,
        cliMessage: "/usr/local/bin/claude",
        error: "",
        checks: [],
      },
    },
    toolPolicy: {
      enabledGroups: {
        read: true,
        replay: true,
        findings: true,
        environment: true,
        intercept: true,
        workflow: true,
      },
      confirmSensitiveActions: true,
      allowedToolNames: [],
      confirmationRequiredToolNames: [],
    },
  };
}

function createStoppedMcpStatus(): McpServerInfo {
  return {
    ...createMcpStatus(),
    running: false,
    toolCount: 0,
  };
}

describe("settings store", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => null),
      },
    });
    setActivePinia(createPinia());
    mockSdk.backend.syncCaidoSessionToken.mockReset().mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.syncCaidoHistoryContext.mockReset().mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.updateSettings.mockReset().mockResolvedValue({ kind: "Ok", value: DEFAULT_SETTINGS });
    mockSdk.backend.getProviderStatuses.mockReset().mockResolvedValue({ kind: "Ok", value: [] });
    mockSdk.backend.getMcpStatus.mockReset().mockResolvedValue({ kind: "Ok", value: createMcpStatus() });
    mockSdk.backend.startMcpServer.mockReset().mockResolvedValue({ kind: "Ok", value: createMcpStatus() });
    mockSdk.backend.stopMcpServer.mockReset().mockResolvedValue({ kind: "Ok", value: undefined });
    mockSdk.backend.runMcpSelfTest.mockReset().mockResolvedValue({ kind: "Ok", value: {} });
    mockSdk.backend.onEvent.mockClear();
    mockSdk.filters.getCurrentFilter.mockReset().mockReturnValue(undefined);
    mockSdk.filters.onCurrentFilterChange.mockClear();
    mockSdk.projects.onCurrentProjectChange.mockClear();
    mockSdk.httpHistory.getQuery.mockReset().mockReturnValue("");
    mockSdk.httpHistory.getScopeId.mockReset().mockReturnValue("");
    mockSdk.storage.get.mockReset().mockResolvedValue(undefined);
    mockSdk.storage.set.mockReset().mockResolvedValue(undefined);
    mockSdk.window.showToast.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes an empty provider id to the backend when running the live test for all providers", async () => {
    const store = useSettingsStore();

    await store.runMcpSelfTest();

    expect(mockSdk.backend.runMcpSelfTest).toHaveBeenCalledWith("");
  });

  it("marks provider readiness as warn when at least one enabled provider is available", () => {
    const store = useSettingsStore();
    store.settings = {
      ...DEFAULT_SETTINGS,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        "claude-cli": { command: "claude", enabled: true },
        "gemini-cli": { command: "gemini", enabled: true },
        "codex-cli": { command: "codex", enabled: false },
        "copilot-cli": { command: "copilot", enabled: false },
      },
    };
    store.providerStatuses = [
      { id: "claude-cli", available: true, resolvedPath: "/usr/local/bin/claude" },
      {
        id: "gemini-cli",
        available: false,
        error: "\"gemini\" not found in PATH or common install locations",
      },
      { id: "codex-cli", available: false, error: "Disabled" },
      { id: "copilot-cli", available: false, error: "Disabled" },
    ];
    store.mcpStatus = createMcpStatus();

    const providerCheck = store.readinessChecks.find((check) => check.id === "providers");

    expect(providerCheck?.status).toBe("warn");
    expect(providerCheck?.detail).toContain("1 enabled provider(s) are available");
  });

  it("times out provider availability during initialization instead of blocking forever", async () => {
    vi.useFakeTimers();
    try {
      mockSdk.backend.getProviderStatuses.mockImplementation(() => new Promise(() => undefined));
      const store = useSettingsStore();

      const initializePromise = store.initialize();
      await vi.advanceTimersByTimeAsync(INIT_REQUEST_TIMEOUT_MS + 1);
      await initializePromise;

      expect(store.loading).toBe(false);
      expect(store.initError).toContain("Checking provider availability timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries provider availability in the background after initialization", async () => {
    vi.useFakeTimers();
    try {
      let callCount = 0;
      mockSdk.backend.getProviderStatuses.mockImplementation(async () => {
        callCount += 1;
        return {
          kind: "Ok" as const,
          value: callCount === 1
            ? []
            : [{ id: "claude-cli", available: true, resolvedPath: "/Users/test/.local/bin/claude" }],
        };
      });

      const store = useSettingsStore();
      await store.initialize();
      expect(store.providerStatuses).toEqual([]);

      await vi.advanceTimersByTimeAsync(751);
      await Promise.resolve();

      expect(store.providerStatuses).toEqual([
        { id: "claude-cli", available: true, resolvedPath: "/Users/test/.local/bin/claude" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts MCP automatically in the background when enabled and not running", async () => {
    vi.useFakeTimers();
    try {
      let running = false;
      mockSdk.backend.getMcpStatus.mockImplementation(async () => ({
        kind: "Ok" as const,
        value: running ? createMcpStatus() : createStoppedMcpStatus(),
      }));
      mockSdk.backend.startMcpServer.mockImplementation(async () => {
        running = true;
        return { kind: "Ok" as const, value: createMcpStatus() };
      });

      const store = useSettingsStore();
      await store.initialize();

      expect(mockSdk.backend.startMcpServer).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(751);
      await Promise.resolve();

      expect(mockSdk.backend.startMcpServer).toHaveBeenCalledTimes(1);
      expect(store.mcpStatus?.running).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears stale provider init errors after a successful refresh", async () => {
    const store = useSettingsStore();
    store.initError = "providers: Error: Checking provider availability timed out after 5000ms";
    mockSdk.backend.getProviderStatuses.mockResolvedValue({
      kind: "Ok",
      value: [{ id: "claude-cli", available: true, resolvedPath: "/Users/test/.local/bin/claude" }],
    });

    await store.refreshProviders();

    expect(store.initError).toBeNull();
  });

  it("drops legacy `scanner` key from storage during init", async () => {
    mockSdk.storage.get.mockResolvedValue({
      settings: {
        ...DEFAULT_SETTINGS,
        // Simulate a pre-removal install where scanner config survived
        // in storage. The store must load without error and strip the
        // key so the next save rewrites storage without it.
        scanner: {
          passiveEnabled: true,
          activeEnabled: false,
          maxPerMinute: 30,
        },
        activeProvider: "gemini-cli",
      },
    });

    const store = useSettingsStore();
    await store.initialize();

    expect(store.initError).toBeNull();
    expect(store.settings.activeProvider).toBe("gemini-cli");
    expect((store.settings as Record<string, unknown>).scanner).toBeUndefined();
  });

  it("treats absent browser storage as no token", async () => {
    // Node >= 25 test environments and restricted webviews both produce this
    // shape: `window` exists, `localStorage` was never installed on it.
    vi.stubGlobal("window", {});
    const store = useSettingsStore();

    await store.syncCaidoRuntimeContext();

    expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
  });

  it("treats a throwing localStorage getter as no token", async () => {
    // Storage disabled by enterprise policy, Safari private mode, and
    // sandboxed webview origins throw on the property read itself, before
    // getItem is ever reached.
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    const store = useSettingsStore();

    await expect(store.syncCaidoRuntimeContext()).resolves.not.toThrow();
    expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
  });

  it("treats a storage object without getItem as no token", async () => {
    // A partial or page-injected stub is not a Storage; calling getItem on it
    // would be a TypeError.
    vi.stubGlobal("window", { localStorage: {} });
    const store = useSettingsStore();

    await store.syncCaidoRuntimeContext();

    expect(mockSdk.backend.syncCaidoSessionToken).toHaveBeenCalledWith("");
  });
});
