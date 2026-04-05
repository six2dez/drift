#!/usr/bin/env node
/**
 * Drift MCP Server — stdio transport
 * Standalone script spawned by Claude Code via --mcp-config.
 * Calls Caido's GraphQL API to provide security tools.
 *
 * Environment: CAIDO_URL, CAIDO_TOKEN
 */

const CAIDO_URL = process.env.CAIDO_URL || "http://localhost:8080";
const CAIDO_TOKEN = process.env.CAIDO_TOKEN || "";

// ── GraphQL client ──────────────────────────────────────────────────

async function graphql(query, variables = {}) {
  const res = await fetch(`${CAIDO_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CAIDO_TOKEN ? { Authorization: `Bearer ${CAIDO_TOKEN}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
  return json.data;
}

// ── Tools ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_history",
    description: "Search HTTP request/response history using HTTPQL filter syntax. Example: req.method.eq:\"POST\"",
    inputSchema: { type: "object", properties: { filter: { type: "string" }, limit: { type: "number" } } },
    execute: async (args) => {
      const data = await graphql(`query($first:Int,$filter:HTTPQL){requests(first:$first,filter:$filter){edges{node{id method host path query isTls createdAt response{statusCode roundtripTime length}}}}}`, { first: Math.min(args.limit || 20, 100), filter: args.filter || undefined });
      const rows = data.requests.edges.map((e) => { const r = e.node; return { id: r.id, method: r.method, url: `${r.isTls ? "https" : "http"}://${r.host}${r.path}${r.query ? "?" + r.query : ""}`, status: r.response?.statusCode, time: r.response?.roundtripTime, size: r.response?.length }; });
      return JSON.stringify(rows, null, 2);
    },
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

// ── MCP JSON-RPC stdio transport ────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handleMessage(msg) {
  switch (msg.method) {
    case "initialize":
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "drift-mcp", version: "0.1.0" } } });
      break;
    case "notifications/initialized":
    case "notifications/cancelled":
      break; // no response for notifications
    case "ping":
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      break;
    case "tools/list":
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) } });
      break;
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Unknown tool: ${msg.params?.name}` }], isError: true } });
        break;
      }
      try {
        const text = await tool.execute(msg.params?.arguments || {});
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
      } catch (e) {
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true } });
      }
      break;
    }
    default:
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method: ${msg.method}` } });
  }
}

// ── Read stdin line by line ─────────────────────────────────────────

let buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (line.length > 0) {
      try {
        handleMessage(JSON.parse(line));
      } catch {
        // invalid JSON, skip
      }
    }
  }
});
process.stdin.on("end", () => process.exit(0));
