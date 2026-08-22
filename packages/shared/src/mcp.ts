export type McpAuthState = "unknown" | "valid" | "invalid" | "error";
export type McpAuthSource = "session" | "none";

export const MCP_TOOL_PERMISSION_GROUPS = [
  "read",
  "replay",
  "findings",
  "environment",
  "intercept",
  "workflow",
] as const;

export type McpToolPermissionGroup = (typeof MCP_TOOL_PERMISSION_GROUPS)[number];

export type McpPermissionGroups = Record<McpToolPermissionGroup, boolean>;

export type McpPermissionSettings = {
  enabledGroups: McpPermissionGroups;
  confirmSensitiveActions: boolean;
};

export const DEFAULT_MCP_PERMISSION_GROUPS: McpPermissionGroups = {
  read: true,
  replay: true,
  findings: true,
  environment: true,
  intercept: true,
  workflow: true,
};

export const DEFAULT_MCP_PERMISSION_SETTINGS: McpPermissionSettings = {
  enabledGroups: { ...DEFAULT_MCP_PERMISSION_GROUPS },
  confirmSensitiveActions: true,
};

export const MCP_TOOL_DEFINITIONS = [
  { name: "search_history", label: "Search history", group: "read", sensitive: false },
  { name: "get_current_context", label: "Current context", group: "read", sensitive: false },
  { name: "list_projects", label: "List projects", group: "read", sensitive: false },
  { name: "select_project", label: "Select project", group: "read", sensitive: false },
  { name: "clear_context_override", label: "Clear override", group: "read", sensitive: false },
  { name: "get_request", label: "Get request", group: "read", sensitive: false },
  { name: "send_request", label: "Send request", group: "replay", sensitive: true },
  { name: "create_finding", label: "Create finding", group: "findings", sensitive: true },
  { name: "list_findings", label: "List findings", group: "read", sensitive: false },
  { name: "get_scope", label: "Get scope", group: "read", sensitive: false },
  { name: "check_scope", label: "Check scope", group: "read", sensitive: false },
  { name: "create_replay_session", label: "Create replay session", group: "replay", sensitive: false },
  { name: "get_environment", label: "Get environment", group: "environment", sensitive: false },
  { name: "set_environment", label: "Set environment", group: "environment", sensitive: true },
  { name: "intercept_status", label: "Intercept status", group: "intercept", sensitive: false },
  { name: "intercept_pause", label: "Pause intercept", group: "intercept", sensitive: true },
  { name: "intercept_resume", label: "Resume intercept", group: "intercept", sensitive: true },
  { name: "run_workflow", label: "Run workflow", group: "workflow", sensitive: true },
] as const satisfies ReadonlyArray<{
  name: string;
  label: string;
  group: McpToolPermissionGroup;
  sensitive: boolean;
}>;

export type McpToolDefinition = (typeof MCP_TOOL_DEFINITIONS)[number];
export type McpToolName = McpToolDefinition["name"];

// DERIVED from the shipped tool definitions above, never restated. This is the
// single source that both the tool policy and the fail-closed Codex allowlist
// read; a second hand-written list of sensitive tool names is exactly the
// failure mode it exists to prevent — the two would drift the first time a tool
// flips its `sensitive` flag, and the half that went stale would be the one
// deciding a security posture.
export const SENSITIVE_MCP_TOOL_NAMES: readonly string[] = MCP_TOOL_DEFINITIONS
  .filter((tool) => tool.sensitive)
  .map((tool) => tool.name);

// Returns `names` without any sensitive tool, ORDER AND DUPLICATES PRESERVED.
// An input of only sensitive names yields an empty array — the deny-all shape
// the MCP server's `DRIFT_ALLOWLIST_ACTIVE` treats as "offer nothing".
export function excludeSensitiveToolNames(names: readonly string[]): string[] {
  const sensitive = new Set<string>(SENSITIVE_MCP_TOOL_NAMES);
  return names.filter((name) => !sensitive.has(name));
}

export type McpToolPolicy = {
  enabledGroups: McpPermissionGroups;
  confirmSensitiveActions: boolean;
  allowedToolNames: string[];
  confirmationRequiredToolNames: string[];
};

export type McpToolActivityState = "success" | "error" | "denied";

export type McpToolActivity = {
  id: string;
  toolName: string;
  toolLabel: string;
  group: McpToolPermissionGroup;
  sensitive: boolean;
  state: McpToolActivityState;
  occurredAt: number;
  durationMs: number | null;
  argumentsSummary: string;
  resultSummary: string;
};

export type McpToolApprovalRequest = {
  sessionId: string;
  approvalId: string;
  toolName: string;
  toolLabel: string;
  group: McpToolPermissionGroup;
  argumentsSummary: string;
  message: string;
  sensitive: boolean;
};

export type CaidoContextSnapshot = {
  projectId: string;
  filterId: string;
  filterName: string;
  filterQuery: string;
  historyQuery: string;
  historyScopeId: string;
};

export type CaidoContextOverride = {
  projectId: string;
};

export type EffectiveCaidoContext = CaidoContextSnapshot & {
  overrideProjectId: string;
  overrideActive: boolean;
  scopeSource: "ui" | "cleared-by-override";
};

export type StoredMcpContext = {
  uiContext: CaidoContextSnapshot;
  overrideContext: CaidoContextOverride;
};

export type McpSelfTestState = "idle" | "running" | "passed" | "failed";

export type McpSelfTestCheck = {
  name: string;
  label: string;
  ok: boolean;
  message: string;
  durationMs: number | null;
};

export type McpSelfTestResult = {
  providerId: string;
  state: McpSelfTestState;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  cliReady: boolean;
  cliMessage: string;
  error: string;
  checks: McpSelfTestCheck[];
};

export type McpSelfTestResults = Record<string, McpSelfTestResult>;

export type McpServerInfo = {
  running: boolean;
  host: string;
  port: number;
  token: string;
  toolCount: number;
  supportedToolCount: number;
  toolNames: string[];
  url: string;
  authState: McpAuthState;
  authSource: McpAuthSource;
  authMessage: string;
  uiContext: CaidoContextSnapshot;
  overrideContext: CaidoContextOverride;
  effectiveContext: EffectiveCaidoContext;
  selfTestResults: McpSelfTestResults;
  toolPolicy: McpToolPolicy;
};
