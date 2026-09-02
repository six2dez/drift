import {
  CaidoContextOverride,
  CaidoContextSnapshot,
  DEFAULT_MCP_PERMISSION_GROUPS,
  EffectiveCaidoContext,
  MCP_TOOL_DEFINITIONS,
  type McpAuthSource,
  McpAuthState,
  type McpCleanupState,
  type McpPermissionGroups,
  type McpPermissionSettings,
  McpSelfTestCheck,
  McpSelfTestResult,
  McpSelfTestResults,
  McpServerInfo,
  type McpToolPolicy,
  StoredMcpContext,
} from "shared";

export const MCP_TOOL_NAMES = MCP_TOOL_DEFINITIONS.map((tool) => tool.name);

export const MCP_SELF_TEST_CHECKS = [
  { name: "tools/list", label: "Tool discovery" },
  { name: "get_environment", label: "Environment read" },
  { name: "search_history", label: "History search" },
] as const;

export function trimToString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createEmptyCaidoContextSnapshot(): CaidoContextSnapshot {
  return {
    projectId: "",
    filterId: "",
    filterName: "",
    filterQuery: "",
    historyQuery: "",
    historyScopeId: "",
  };
}

export function createEmptyCaidoContextOverride(): CaidoContextOverride {
  return {
    projectId: "",
  };
}

export function normalizeMcpPermissionGroups(
  input: Partial<McpPermissionGroups> | undefined,
): McpPermissionGroups {
  return {
    read: input?.read ?? DEFAULT_MCP_PERMISSION_GROUPS.read,
    replay: input?.replay ?? DEFAULT_MCP_PERMISSION_GROUPS.replay,
    findings: input?.findings ?? DEFAULT_MCP_PERMISSION_GROUPS.findings,
    environment: input?.environment ?? DEFAULT_MCP_PERMISSION_GROUPS.environment,
    intercept: input?.intercept ?? DEFAULT_MCP_PERMISSION_GROUPS.intercept,
    workflow: input?.workflow ?? DEFAULT_MCP_PERMISSION_GROUPS.workflow,
  };
}

export function normalizeMcpPermissionSettings(
  input: Partial<McpPermissionSettings> | undefined,
): McpPermissionSettings {
  return {
    enabledGroups: normalizeMcpPermissionGroups(input?.enabledGroups),
    confirmSensitiveActions:
      typeof input?.confirmSensitiveActions === "boolean"
        ? input.confirmSensitiveActions
        : true,
  };
}

export function buildMcpToolPolicy(
  input: Partial<McpPermissionSettings> | undefined,
): McpToolPolicy {
  const settings = normalizeMcpPermissionSettings(input);
  const allowedToolNames = MCP_TOOL_DEFINITIONS
    .filter((tool) => settings.enabledGroups[tool.group])
    .map((tool) => tool.name);
  const confirmationRequiredToolNames = settings.confirmSensitiveActions
    ? MCP_TOOL_DEFINITIONS
      .filter((tool) =>
        settings.enabledGroups[tool.group] &&
        tool.sensitive
      )
      .map((tool) => tool.name)
    : [];

  return {
    enabledGroups: settings.enabledGroups,
    confirmSensitiveActions: settings.confirmSensitiveActions,
    allowedToolNames,
    confirmationRequiredToolNames,
  };
}

export function normalizeCaidoContextSnapshot(
  input: Partial<CaidoContextSnapshot> | undefined,
): CaidoContextSnapshot {
  return {
    projectId: trimToString(input?.projectId),
    filterId: trimToString(input?.filterId),
    filterName: trimToString(input?.filterName),
    filterQuery: trimToString(input?.filterQuery),
    historyQuery: trimToString(input?.historyQuery),
    historyScopeId: trimToString(input?.historyScopeId),
  };
}

export function normalizeCaidoContextOverride(
  input: Partial<CaidoContextOverride> | undefined,
): CaidoContextOverride {
  return {
    projectId: trimToString(input?.projectId),
  };
}

export function mergeCaidoContextSnapshot(
  current: CaidoContextSnapshot,
  update: Partial<CaidoContextSnapshot>,
): CaidoContextSnapshot {
  return normalizeCaidoContextSnapshot({
    ...current,
    ...update,
  });
}

export function hasCaidoContextChanged(
  previous: CaidoContextSnapshot,
  next: CaidoContextSnapshot,
): boolean {
  return (
    previous.projectId !== next.projectId ||
    previous.filterId !== next.filterId ||
    previous.filterName !== next.filterName ||
    previous.filterQuery !== next.filterQuery ||
    previous.historyQuery !== next.historyQuery ||
    previous.historyScopeId !== next.historyScopeId
  );
}

export function resolveEffectiveCaidoContext(
  uiContext: CaidoContextSnapshot,
  overrideContext: CaidoContextOverride,
): EffectiveCaidoContext {
  const normalizedUiContext = normalizeCaidoContextSnapshot(uiContext);
  const normalizedOverride = normalizeCaidoContextOverride(overrideContext);
  const overrideProjectId = normalizedOverride.projectId;
  const overrideActive =
    overrideProjectId !== "" &&
    overrideProjectId !== normalizedUiContext.projectId;

  return {
    ...normalizedUiContext,
    projectId: overrideActive ? overrideProjectId : normalizedUiContext.projectId,
    historyScopeId: overrideActive ? "" : normalizedUiContext.historyScopeId,
    overrideProjectId,
    overrideActive,
    scopeSource: overrideActive ? "cleared-by-override" : "ui",
  };
}

export function serializeMcpRuntimeContext(
  uiContext: CaidoContextSnapshot,
  overrideContext: CaidoContextOverride,
): string {
  return JSON.stringify(
    {
      uiContext: normalizeCaidoContextSnapshot(uiContext),
      overrideContext: normalizeCaidoContextOverride(overrideContext),
    } satisfies StoredMcpContext,
    null,
    2,
  );
}

export function parseMcpRuntimeContext(raw: string | undefined): StoredMcpContext {
  if (raw === undefined || raw.trim() === "") {
    return {
      uiContext: createEmptyCaidoContextSnapshot(),
      overrideContext: createEmptyCaidoContextOverride(),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      uiContext: createEmptyCaidoContextSnapshot(),
      overrideContext: createEmptyCaidoContextOverride(),
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {
      uiContext: createEmptyCaidoContextSnapshot(),
      overrideContext: createEmptyCaidoContextOverride(),
    };
  }

  const objectValue = parsed as Partial<
    StoredMcpContext &
    CaidoContextSnapshot & {
      uiContext?: Partial<CaidoContextSnapshot>;
      overrideContext?: Partial<CaidoContextOverride>;
    }
  >;

  const uiContext =
    objectValue.uiContext !== undefined
      ? normalizeCaidoContextSnapshot(objectValue.uiContext)
      : normalizeCaidoContextSnapshot(objectValue);

  return {
    uiContext,
    overrideContext: normalizeCaidoContextOverride(objectValue.overrideContext),
  };
}

export function createEmptySelfTestResults(): McpSelfTestResults {
  return {};
}

export function createSelfTestCheck(name: string, label: string): McpSelfTestCheck {
  return {
    name,
    label,
    ok: false,
    message: "",
    durationMs: null,
  };
}

export function createIdleSelfTestResult(providerId: string): McpSelfTestResult {
  return {
    providerId,
    state: "idle",
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    cliReady: false,
    cliMessage: "",
    error: "",
    checks: MCP_SELF_TEST_CHECKS.map((check) =>
      createSelfTestCheck(check.name, check.label)
    ),
  };
}

export function buildSelfTestResult(input: {
  providerId: string;
  startedAt: number | null;
  finishedAt: number;
  cliReady: boolean;
  cliMessage: string;
  checks: McpSelfTestCheck[];
  error?: string;
}): McpSelfTestResult {
  const error = trimToString(input.error);
  const passed = error === "" && input.cliReady && input.checks.every((check) => check.ok);
  return {
    providerId: input.providerId,
    state: passed ? "passed" : "failed",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs:
      input.startedAt === null
        ? null
        : Math.max(0, input.finishedAt - input.startedAt),
    cliReady: input.cliReady,
    cliMessage: input.cliMessage,
    error,
    checks: input.checks,
  };
}

export function buildMcpServerInfo(input: {
  running: boolean;
  cleanupState?: McpCleanupState;
  host: string;
  port: number;
  token: string;
  url: string;
  authState: McpAuthState;
  authSource: McpAuthSource;
  authMessage: string;
  uiContext: CaidoContextSnapshot;
  overrideContext: CaidoContextOverride;
  selfTestResults?: McpSelfTestResults;
  toolNames?: readonly string[];
  toolPolicy?: McpToolPolicy;
}): McpServerInfo {
  const toolPolicy = input.toolPolicy ?? buildMcpToolPolicy(undefined);
  const toolNames = [...(input.toolNames ?? toolPolicy.allowedToolNames)];
  return {
    running: input.running,
    cleanupState: input.cleanupState ?? "idle",
    host: input.host,
    port: input.port,
    token: input.token,
    toolCount: toolNames.length,
    supportedToolCount: MCP_TOOL_DEFINITIONS.length,
    toolNames,
    url: input.url,
    authState: input.authState,
    authSource: input.authSource,
    authMessage: input.authMessage,
    uiContext: normalizeCaidoContextSnapshot(input.uiContext),
    overrideContext: normalizeCaidoContextOverride(input.overrideContext),
    effectiveContext: resolveEffectiveCaidoContext(
      input.uiContext,
      input.overrideContext,
    ),
    selfTestResults: input.selfTestResults ?? createEmptySelfTestResults(),
    toolPolicy,
  };
}
