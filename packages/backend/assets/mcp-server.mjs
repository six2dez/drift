#!/usr/bin/env node
/**
 * Drift MCP Server — stdio transport
 * Standalone script spawned by Claude Code via --mcp-config.
 * Calls Caido's GraphQL API to provide security tools.
 *
 * Environment: CAIDO_URL, CAIDO_TOKEN
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const CAIDO_URL = process.env.CAIDO_URL || "http://localhost:8080";
const CAIDO_TOKEN = process.env.CAIDO_TOKEN || "";
const DRIFT_CONTEXT_FILE = process.env.DRIFT_CONTEXT_FILE || "";
const DRIFT_ACTIVITY_FILE = process.env.DRIFT_ACTIVITY_FILE || "";
const DRIFT_APPROVALS_FILE = process.env.DRIFT_APPROVALS_FILE || "";
const DEFAULT_GRAPHQL_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.DRIFT_GRAPHQL_TIMEOUT_MS || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15000;
})();
const ALLOWED_TOOL_NAMES = new Set(
  (process.env.DRIFT_ALLOWED_TOOLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== ""),
);
const CONFIRMATION_REQUIRED_TOOL_NAMES = new Set(
  (process.env.DRIFT_CONFIRMATION_REQUIRED_TOOLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== ""),
);

// ── GraphQL client ──────────────────────────────────────────────────

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createId(prefix = "evt") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function summarizeText(value, maxLength = 220) {
  const normalized = normalizeText(String(value)).replace(/\s+/g, " ");
  if (normalized === "") return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function summarizeArguments(args) {
  if (args === undefined || args === null || typeof args !== "object") {
    return summarizeText(args ?? "");
  }

  return summarizeText(
    Object.entries(args).map(([key, value]) => {
      if (typeof value === "string") {
        if (key === "raw") return `${key}=${value.length} chars`;
        return `${key}=${summarizeText(value, 60)}`;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return `${key}=${String(value)}`;
      }
      if (Array.isArray(value)) return `${key}=[${value.length}]`;
      if (typeof value === "object" && value !== null) return `${key}={...}`;
      return `${key}=${String(value ?? "")}`;
    }).join(", "),
  );
}

function appendActivityEvent(event) {
  if (DRIFT_ACTIVITY_FILE === "") return;
  try {
    appendFileSync(DRIFT_ACTIVITY_FILE, `${JSON.stringify(event)}\n`);
  } catch {
    // Best-effort only.
  }
}

function readApprovalDecisions() {
  if (DRIFT_APPROVALS_FILE === "") return {};
  try {
    return JSON.parse(readFileSync(DRIFT_APPROVALS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createEmptyUiContext() {
  return {
    projectId: "",
    filterId: "",
    filterName: "",
    filterQuery: "",
    historyQuery: "",
    historyScopeId: "",
  };
}

function createEmptyOverrideContext() {
  return {
    projectId: "",
  };
}

function normalizeUiContext(value) {
  return {
    projectId: normalizeText(value?.projectId),
    filterId: normalizeText(value?.filterId),
    filterName: normalizeText(value?.filterName),
    filterQuery: normalizeText(value?.filterQuery),
    historyQuery: normalizeText(value?.historyQuery),
    historyScopeId: normalizeText(value?.historyScopeId),
  };
}

function normalizeOverrideContext(value) {
  return {
    projectId: normalizeText(value?.projectId),
  };
}

function parseStoredContext(parsed) {
  if (parsed === undefined || parsed === null || typeof parsed !== "object") {
    return {
      uiContext: createEmptyUiContext(),
      overrideContext: createEmptyOverrideContext(),
    };
  }

  if ("uiContext" in parsed || "overrideContext" in parsed) {
    return {
      uiContext: normalizeUiContext(parsed.uiContext),
      overrideContext: normalizeOverrideContext(parsed.overrideContext),
    };
  }

  return {
    uiContext: normalizeUiContext(parsed),
    overrideContext: createEmptyOverrideContext(),
  };
}

function resolveEffectiveContext(uiContext, overrideContext) {
  const normalizedUiContext = normalizeUiContext(uiContext);
  const normalizedOverrideContext = normalizeOverrideContext(overrideContext);
  const overrideProjectId = normalizedOverrideContext.projectId;
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

function loadStoredContext() {
  if (DRIFT_CONTEXT_FILE === "") {
    return {
      uiContext: createEmptyUiContext(),
      overrideContext: createEmptyOverrideContext(),
    };
  }

  try {
    return parseStoredContext(JSON.parse(readFileSync(DRIFT_CONTEXT_FILE, "utf-8")));
  } catch {
    return {
      uiContext: createEmptyUiContext(),
      overrideContext: createEmptyOverrideContext(),
    };
  }
}

function writeStoredContext(nextContext) {
  const normalized = {
    uiContext: normalizeUiContext(nextContext.uiContext),
    overrideContext: normalizeOverrideContext(nextContext.overrideContext),
  };

  if (DRIFT_CONTEXT_FILE !== "") {
    writeFileSync(DRIFT_CONTEXT_FILE, `${JSON.stringify(normalized, null, 2)}\n`);
  }

  return normalized;
}

function updateStoredContext(updater) {
  const current = loadStoredContext();
  return writeStoredContext(updater(current));
}

function loadContextState() {
  const stored = loadStoredContext();
  return {
    uiContext: stored.uiContext,
    overrideContext: stored.overrideContext,
    effectiveContext: resolveEffectiveContext(stored.uiContext, stored.overrideContext),
  };
}

function buildEffectiveHistoryFilter(contextState, explicitFilter) {
  const parts = [
    normalizeText(contextState.effectiveContext.filterQuery),
    normalizeText(contextState.effectiveContext.historyQuery),
    normalizeText(explicitFilter),
  ].filter((value) => value !== "");

  if (parts.length === 0) return undefined;
  return parts.map((part) => `(${part})`).join(" AND ");
}

function formatGraphqlErrors(errors) {
  let caidoCode = "";
  let caidoReason = "";

  const message = errors.map((error) => {
    const code = error.extensions?.CAIDO?.code;
    const reason = error.extensions?.CAIDO?.reason;
    if (!caidoCode && typeof code === "string") caidoCode = code;
    if (!caidoReason && typeof reason === "string") caidoReason = reason;
    const suffix = [code, reason].filter(Boolean).join("/");
    return suffix ? `${error.message} [${suffix}]` : error.message;
  }).join(", ");

  return { message, caidoCode, caidoReason };
}

async function graphqlRaw(query, variables = {}, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_GRAPHQL_TIMEOUT_MS;
  const controller = timeoutMs !== undefined ? new AbortController() : undefined;
  const timeoutId = timeoutMs !== undefined
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const res = await fetch(`${CAIDO_URL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CAIDO_TOKEN ? { Authorization: `Bearer ${CAIDO_TOKEN}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      ...(controller !== undefined ? { signal: controller.signal } : {}),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
    const json = await res.json();
    if (json.errors?.length) {
      const formatted = formatGraphqlErrors(json.errors);
      const error = new Error(formatted.message);
      error.caidoCode = formatted.caidoCode;
      error.caidoReason = formatted.caidoReason;
      throw error;
    }
    return json.data;
  } catch (error) {
    if (error?.name === "AbortError" && timeoutMs !== undefined) {
      throw new Error(`GraphQL request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

let selectedProjectId = "";

async function ensureProjectContext() {
  const contextState = loadContextState();
  const projectId = normalizeText(contextState.effectiveContext.projectId);
  if (projectId === "") {
    selectedProjectId = "";
    return contextState;
  }
  if (projectId === selectedProjectId) return contextState;

  const data = await graphqlRaw(
    `mutation($id:ID!){selectProject(id:$id){currentProject{project{id name}} error{__typename ... on ProjectUserError{code projectReason:reason} ... on UnknownIdUserError{code id} ... on OtherUserError{code}}}}`,
    { id: projectId },
  );

  const projectError = data.selectProject?.error;
  if (projectError) {
    const details = [
      normalizeText(projectError.code),
      normalizeText(projectError.projectReason),
      normalizeText(projectError.id),
    ].filter((value) => value !== "").join("/");
    throw new Error(
      `Failed to select the current Caido project ${projectId}${details !== "" ? ` [${details}]` : ""}. Refresh Drift or switch projects in Caido to resync the active context.`,
    );
  }

  selectedProjectId = projectId;
  return contextState;
}

async function graphql(query, variables = {}) {
  await ensureProjectContext();
  return graphqlRaw(query, variables);
}

async function validateAuth() {
  try {
    await graphqlRaw(`query{requests(first:1){edges{node{id}}}}`, {}, { timeoutMs: 5000 });
    return { ok: true, message: "", caidoCode: "", caidoReason: "" };
  } catch (error) {
    return {
      ok: false,
      message: error.message,
      caidoCode: error.caidoCode || "",
      caidoReason: error.caidoReason || "",
    };
  }
}

async function listProjects() {
  const data = await graphqlRaw(
    `query{projects{id name status version} currentProject{project{id}}}`,
  );
  const currentProjectId = normalizeText(data.currentProject?.project?.id);
  const projects = Array.isArray(data.projects) ? data.projects : [];
  return projects.map((project) => ({
    id: normalizeText(project.id),
    name: normalizeText(project.name),
    status: normalizeText(project.status),
    version: normalizeText(project.version),
    isCurrent: normalizeText(project.id) === currentProjectId,
  }));
}

async function selectProject(projectId) {
  const normalizedProjectId = normalizeText(projectId);
  if (normalizedProjectId === "") {
    throw new Error("Project ID is required.");
  }

  const data = await graphqlRaw(
    `mutation($id:ID!){selectProject(id:$id){currentProject{project{id name}} error{__typename ... on ProjectUserError{code projectReason:reason} ... on UnknownIdUserError{code id} ... on OtherUserError{code}}}}`,
    { id: normalizedProjectId },
  );

  const projectError = data.selectProject?.error;
  if (projectError) {
    const details = [
      normalizeText(projectError.code),
      normalizeText(projectError.projectReason),
      normalizeText(projectError.id),
    ].filter((value) => value !== "").join("/");
    throw new Error(
      `Failed to select project ${normalizedProjectId}${details !== "" ? ` [${details}]` : ""}.`,
    );
  }

  const selectedProject = data.selectProject?.currentProject?.project;
  if (selectedProject === undefined) {
    throw new Error(`Caido did not return a project after selecting ${normalizedProjectId}.`);
  }

  const updatedContext = updateStoredContext((current) => ({
    uiContext: current.uiContext,
    overrideContext: {
      projectId:
        normalizeText(current.uiContext.projectId) === normalizeText(selectedProject.id)
          ? ""
          : normalizeText(selectedProject.id),
    },
  }));

  selectedProjectId = normalizeText(selectedProject.id);
  return {
    project: {
      id: normalizeText(selectedProject.id),
      name: normalizeText(selectedProject.name),
    },
    overrideActive: updatedContext.overrideContext.projectId !== "",
  };
}

function clearContextOverride() {
  updateStoredContext((current) => ({
    uiContext: current.uiContext,
    overrideContext: createEmptyOverrideContext(),
  }));
  selectedProjectId = "";
  return loadContextState();
}

// ── Tools ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_history",
    description: "Search HTTP request/response history using HTTPQL filter syntax. Drift applies the effective Caido context first (UI context plus any explicit project override), then adds any extra filter you provide.",
    inputSchema: { type: "object", properties: { filter: { type: "string" }, limit: { type: "number" } } },
    execute: async (args) => {
      const contextState = await ensureProjectContext();
      const filterStr = buildEffectiveHistoryFilter(contextState, args.filter);
      const data = await graphqlRaw(
        `query($first:Int,$filter:HTTPQLInput,$scopeId:ID){requests(first:$first,filter:$filter,scopeId:$scopeId){edges{node{id method host path query isTls createdAt response{statusCode roundtripTime length}}}}}`,
        {
          first: Math.min(args.limit || 20, 100),
          filter: filterStr != null ? { code: filterStr } : undefined,
          scopeId: normalizeText(contextState.effectiveContext.historyScopeId) || undefined,
        },
      );
      const rows = data.requests.edges.map((e) => { const r = e.node; return { id: r.id, method: r.method, url: `${r.isTls ? "https" : "http"}://${r.host}${r.path}${r.query ? "?" + r.query : ""}`, status: r.response?.statusCode, time: r.response?.roundtripTime, size: r.response?.length }; });
      return JSON.stringify(rows, null, 2);
    },
  },
  {
    name: "get_current_context",
    description: "Show the current Drift Caido context, including UI-synced context, any active override, and the effective context used for tool calls.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify(loadContextState(), null, 2),
  },
  {
    name: "list_projects",
    description: "List Caido projects with id/name/status/version and flag the current UI-selected project.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify({ projects: await listProjects() }, null, 2),
  },
  {
    name: "select_project",
    description: "Select a Caido project override for Drift MCP tool calls. This does not change the Caido UI selection; it sets an explicit Drift override until cleared.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async (args) => JSON.stringify(await selectProject(args.id), null, 2),
  },
  {
    name: "clear_context_override",
    description: "Clear any explicit Drift context override and return to the Caido UI context.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => JSON.stringify(clearContextOverride(), null, 2),
  },
  {
    name: "get_request",
    description: "Get the full raw HTTP request and response for a specific request ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: async (args) => {
      const data = await graphql(`query($id:ID!){request(id:$id){id method host path raw createdAt response{statusCode roundtripTime length raw}}}`, { id: args.id });
      if (!data.request) return `Request ${args.id} not found`;
      const r = data.request;
      let out = `=== REQUEST (${r.id}) ===\n${r.raw}`;
      if (r.response) { out += `\n=== RESPONSE (${r.response.statusCode}) ===\n${r.response.raw.slice(0, 50000)}`; }
      return out;
    },
  },
  {
    name: "send_request",
    description: "Send an HTTP request through Caido replay. Provide raw HTTP request, host, port, isTls.",
    inputSchema: { type: "object", properties: { raw: { type: "string" }, host: { type: "string" }, port: { type: "number" }, isTls: { type: "boolean" } }, required: ["raw", "host"] },
    execute: async (args) => {
      const isTls = args.isTls !== false;
      const port = args.port || (isTls ? 443 : 80);
      const data = await graphql(`mutation($input:CreateReplaySessionInput!){createReplaySession(input:$input){session{id}}}`, { input: { requestSource: { raw: args.raw, connection: { host: args.host, port, isTLS: isTls } } } });
      const sid = data.createReplaySession.session.id;
      const send = await graphql(`mutation($id:ID!,$input:SendReplaySessionInput!){sendReplaySession(id:$id,input:$input){entry{response{statusCode roundtripTime raw}error}}}`, { id: sid, input: { raw: args.raw, connection: { host: args.host, port, isTLS: isTls } } });
      const entry = send.sendReplaySession.entry;
      if (entry.error) return `Error: ${entry.error}`;
      const resp = entry.response;
      return `Status: ${resp.statusCode} | Time: ${resp.roundtripTime}ms\n\n${resp.raw.slice(0, 50000)}`;
    },
  },
  {
    name: "create_finding",
    description: "Create a security finding associated with a request ID.",
    inputSchema: { type: "object", properties: { requestId: { type: "string" }, title: { type: "string" }, description: { type: "string" }, reporter: { type: "string" } }, required: ["requestId", "title"] },
    execute: async (args) => {
      const data = await graphql(`mutation($input:CreateFindingInput!){createFinding(input:$input){finding{id title reporter createdAt}}}`, { input: { requestId: args.requestId, title: args.title, description: args.description || "", reporter: args.reporter || "Drift" } });
      return JSON.stringify(data.createFinding.finding, null, 2);
    },
  },
  {
    name: "list_findings",
    description: "List all security findings.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    execute: async (args) => {
      const data = await graphql(`query($first:Int){findings(first:$first){edges{node{id title reporter host path createdAt}}}}`, { first: Math.min(args.limit || 50, 200) });
      return JSON.stringify(data.findings.edges.map((e) => e.node), null, 2);
    },
  },
  {
    name: "get_scope",
    description: "List all scope definitions.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const data = await graphql(`query{scopes{id name allowlist denylist}}`);
      return JSON.stringify(data.scopes, null, 2);
    },
  },
  {
    name: "check_scope",
    description: "Check if a URL is within any defined scope.",
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    execute: async (args) => {
      const data = await graphql(`query{scopes{id name allowlist denylist}}`);
      const results = data.scopes.map((s) => {
        const inAllow = s.allowlist.some((p) => { try { return new RegExp(p).test(args.url); } catch { return args.url.includes(p); } });
        const inDeny = s.denylist.some((p) => { try { return new RegExp(p).test(args.url); } catch { return args.url.includes(p); } });
        return { scope: s.name, inScope: inAllow && !inDeny };
      });
      return JSON.stringify({ url: args.url, results }, null, 2);
    },
  },
  {
    name: "create_replay_session",
    description: "Create a Caido replay session from an existing request ID.",
    inputSchema: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"] },
    execute: async (args) => {
      const data = await graphql(`mutation($input:CreateReplaySessionInput!){createReplaySession(input:$input){session{id name}}}`, { input: { requestSource: { id: args.requestId } } });
      return JSON.stringify(data.createReplaySession.session, null, 2);
    },
  },
  {
    name: "get_environment",
    description: "List all environments and variables.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const data = await graphql(`query{environments{id name variables{name value}}}`);
      return JSON.stringify(data.environments, null, 2);
    },
  },
  {
    name: "set_environment",
    description: "Set a variable in an environment.",
    inputSchema: { type: "object", properties: { environmentId: { type: "string" }, name: { type: "string" }, value: { type: "string" } }, required: ["environmentId", "name", "value"] },
    execute: async (args) => {
      const data = await graphql(`mutation($id:ID!,$input:UpdateEnvironmentInput!){updateEnvironment(id:$id,input:$input){environment{id name variables{name value}}}}`, { id: args.environmentId, input: { variables: [{ name: args.name, value: args.value, kind: "PLAIN" }] } });
      return JSON.stringify(data.updateEnvironment.environment, null, 2);
    },
  },
  {
    name: "intercept_status",
    description: "Get intercept proxy status.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      const data = await graphql(`query{interceptOptions{request{enabled}response{enabled}}}`);
      return JSON.stringify(data.interceptOptions, null, 2);
    },
  },
  {
    name: "intercept_pause",
    description: "Pause HTTP intercept.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      await graphql(`mutation{pauseIntercept{request{enabled}response{enabled}}}`);
      return "Intercept paused";
    },
  },
  {
    name: "intercept_resume",
    description: "Resume HTTP intercept.",
    inputSchema: { type: "object", properties: {} },
    execute: async () => {
      await graphql(`mutation{resumeIntercept{request{enabled}response{enabled}}}`);
      return "Intercept resumed";
    },
  },
  {
    name: "run_workflow",
    description: "Execute a Caido convert workflow.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, input: { type: "string" } }, required: ["id", "input"] },
    execute: async (args) => {
      const data = await graphql(`mutation($id:ID!,$input:Blob!){runConvertWorkflow(id:$id,input:$input){output error}}`, { id: args.id, input: args.input });
      if (data.runConvertWorkflow.error) return `Error: ${data.runConvertWorkflow.error}`;
      return data.runConvertWorkflow.output;
    },
  },
];

const TOOL_METADATA = {
  search_history: { label: "Search history", group: "read", sensitive: false },
  get_current_context: { label: "Current context", group: "read", sensitive: false },
  list_projects: { label: "List projects", group: "read", sensitive: false },
  select_project: { label: "Select project", group: "read", sensitive: false },
  clear_context_override: { label: "Clear override", group: "read", sensitive: false },
  get_request: { label: "Get request", group: "read", sensitive: false },
  send_request: { label: "Send request", group: "replay", sensitive: true },
  create_finding: { label: "Create finding", group: "findings", sensitive: true },
  list_findings: { label: "List findings", group: "read", sensitive: false },
  get_scope: { label: "Get scope", group: "read", sensitive: false },
  check_scope: { label: "Check scope", group: "read", sensitive: false },
  create_replay_session: { label: "Create replay session", group: "replay", sensitive: false },
  get_environment: { label: "Get environment", group: "environment", sensitive: false },
  set_environment: { label: "Set environment", group: "environment", sensitive: true },
  intercept_status: { label: "Intercept status", group: "intercept", sensitive: false },
  intercept_pause: { label: "Pause intercept", group: "intercept", sensitive: true },
  intercept_resume: { label: "Resume intercept", group: "intercept", sensitive: true },
  run_workflow: { label: "Run workflow", group: "workflow", sensitive: true },
};

function getAvailableTools() {
  if (ALLOWED_TOOL_NAMES.size === 0) return TOOLS;
  return TOOLS.filter((tool) => ALLOWED_TOOL_NAMES.has(tool.name));
}

async function waitForApproval(toolName, argsSummary) {
  const metadata = TOOL_METADATA[toolName] || {
    label: toolName,
    group: "read",
    sensitive: true,
  };
  if (DRIFT_APPROVALS_FILE === "" || DRIFT_ACTIVITY_FILE === "") {
    throw new Error(`Sensitive tool confirmation is unavailable for ${toolName}.`);
  }

  const approvalId = createId("approval");
  appendActivityEvent({
    type: "approval-request",
    id: createId("event"),
    approvalId,
    occurredAt: Date.now(),
    toolName,
    toolLabel: metadata.label,
    group: metadata.group,
    sensitive: metadata.sensitive,
    argumentsSummary: argsSummary,
    message: `Approve sensitive MCP tool ${toolName}?`,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const approvals = readApprovalDecisions();
    const decision = approvals[approvalId];
    if (decision && typeof decision.approved === "boolean") {
      return decision.approved;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for confirmation of ${toolName}.`);
}

// ── MCP JSON-RPC stdio transport ────────────────────────────────────

const SHUTDOWN_DRAIN_TIMEOUT_MS = 1000;
const inFlightRequests = new Set();
let stdinClosed = false;
let shutdownTimer;

function send(msg) {
  return new Promise((resolve, reject) => {
    process.stdout.write(JSON.stringify(msg) + "\n", (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });
}

function clearShutdownTimer() {
  if (shutdownTimer !== undefined) {
    clearTimeout(shutdownTimer);
    shutdownTimer = undefined;
  }
}

function exitWhenIdle() {
  if (!stdinClosed || inFlightRequests.size > 0) return;
  clearShutdownTimer();
  process.exit(0);
}

function scheduleDrainShutdown() {
  if (!stdinClosed || inFlightRequests.size === 0 || shutdownTimer !== undefined) return;
  shutdownTimer = setTimeout(() => {
    process.exit(0);
  }, SHUTDOWN_DRAIN_TIMEOUT_MS);
}

function trackInFlight(promise) {
  inFlightRequests.add(promise);
  promise.finally(() => {
    inFlightRequests.delete(promise);
    exitWhenIdle();
  });
}

if (process.argv.includes("--validate-auth")) {
  const result = await validateAuth();
  await new Promise((resolve, reject) => {
    process.stdout.write(JSON.stringify(result) + "\n", (error) => {
      if (error) reject(error);
      else resolve(undefined);
    });
  });
  process.exit(result.ok ? 0 : 1);
}

async function handleMessage(msg) {
  switch (msg.method) {
    case "initialize":
      await send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "drift-mcp", version: "0.1.0" } } });
      break;
    case "notifications/initialized":
    case "notifications/cancelled":
      break; // no response for notifications
    case "ping":
      await send({ jsonrpc: "2.0", id: msg.id, result: {} });
      break;
    case "tools/list":
      await send({ jsonrpc: "2.0", id: msg.id, result: { tools: getAvailableTools().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
      break;
    case "tools/call": {
      const tool = getAvailableTools().find((t) => t.name === msg.params?.name);
      if (!tool) {
        await send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Tool unavailable in the current Drift permission profile: ${msg.params?.name}` }], isError: true } });
        break;
      }

      const metadata = TOOL_METADATA[tool.name] || {
        label: tool.name,
        group: "read",
        sensitive: false,
      };
      const startedAt = Date.now();
      const argsSummary = summarizeArguments(msg.params?.arguments || {});

      try {
        if (CONFIRMATION_REQUIRED_TOOL_NAMES.has(tool.name)) {
          const approved = await waitForApproval(tool.name, argsSummary);
          if (!approved) {
            const deniedMessage = `Action denied by user confirmation for ${tool.name}.`;
            appendActivityEvent({
              type: "tool-result",
              id: createId("event"),
              occurredAt: Date.now(),
              toolName: tool.name,
              toolLabel: metadata.label,
              group: metadata.group,
              sensitive: metadata.sensitive,
              state: "denied",
              durationMs: Date.now() - startedAt,
              argumentsSummary: argsSummary,
              resultSummary: deniedMessage,
            });
            await send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Error: ${deniedMessage}` }], isError: true } });
            break;
          }
        }

        const text = await tool.execute(msg.params?.arguments || {});
        appendActivityEvent({
          type: "tool-result",
          id: createId("event"),
          occurredAt: Date.now(),
          toolName: tool.name,
          toolLabel: metadata.label,
          group: metadata.group,
          sensitive: metadata.sensitive,
          state: "success",
          durationMs: Date.now() - startedAt,
          argumentsSummary: argsSummary,
          resultSummary: summarizeText(text),
        });
        await send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
      } catch (e) {
        appendActivityEvent({
          type: "tool-result",
          id: createId("event"),
          occurredAt: Date.now(),
          toolName: tool.name,
          toolLabel: metadata.label,
          group: metadata.group,
          sensitive: metadata.sensitive,
          state: "error",
          durationMs: Date.now() - startedAt,
          argumentsSummary: argsSummary,
          resultSummary: summarizeText(e.message),
        });
        await send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } });
      }
      break;
    }
    default:
      await send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method: ${msg.method}` } });
   }
}

// ── Read stdin line by line ─────────────────────────────────────────

let buffer = "";

function processLine(line) {
  if (line.length === 0) return;
  try {
    const pending = handleMessage(JSON.parse(line));
    trackInFlight(pending);
  } catch {
    // invalid JSON, skip
  }
}

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    processLine(line);
  }
});
process.stdin.on("end", () => {
  stdinClosed = true;
  processLine(buffer.trim());
  buffer = "";
  exitWhenIdle();
  scheduleDrainShutdown();
});
