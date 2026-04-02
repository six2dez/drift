import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { randomUUID } from "crypto";
import type { McpServerInfo, Settings } from "shared";
import { CaidoGraphQLClient } from "./caido-client";
import {
  type JsonRpcRequest,
  type McpTool,
  type McpToolResult,
  jsonRpcSuccess,
  jsonRpcError,
} from "./protocol";
import {
  searchHistoryTool,
  executeSearchHistory,
  getRequestTool,
  executeGetRequest,
} from "./tools/history";
import {
  sendRequestTool,
  executeSendRequest,
  createReplaySessionTool,
  executeCreateReplaySession,
} from "./tools/replay";
import {
  createFindingTool,
  executeCreateFinding,
  listFindingsTool,
  executeListFindings,
} from "./tools/findings";
import {
  getScopeTool,
  executeGetScope,
  checkScopeTool,
  executeCheckScope,
} from "./tools/scope";
import {
  getEnvironmentTool,
  executeGetEnvironment,
  setEnvironmentTool,
  executeSetEnvironment,
} from "./tools/environment";
import { runWorkflowTool, executeRunWorkflow } from "./tools/workflows";
import {
  interceptControlTool,
  executeInterceptControl,
} from "./tools/intercept";

type ToolExecutor = (
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
) => Promise<McpToolResult>;

const TOOL_REGISTRY: Array<{
  tool: McpTool;
  execute: ToolExecutor;
}> = [
  // History
  { tool: searchHistoryTool, execute: executeSearchHistory },
  { tool: getRequestTool, execute: executeGetRequest },
  // Replay
  { tool: sendRequestTool, execute: executeSendRequest },
  { tool: createReplaySessionTool, execute: executeCreateReplaySession },
  // Findings
  { tool: createFindingTool, execute: executeCreateFinding },
  { tool: listFindingsTool, execute: executeListFindings },
  // Scope
  { tool: getScopeTool, execute: executeGetScope },
  { tool: checkScopeTool, execute: executeCheckScope },
  // Environment
  { tool: getEnvironmentTool, execute: executeGetEnvironment },
  { tool: setEnvironmentTool, execute: executeSetEnvironment },
  // Workflows
  { tool: runWorkflowTool, execute: executeRunWorkflow },
  // Intercept
  { tool: interceptControlTool, execute: executeInterceptControl },
];

class McpServer {
  private server: Server | null = null;
  private client: CaidoGraphQLClient | null = null;
  private token: string = "";
  private host: string = "127.0.0.1";
  private port: number = 9877;
  private sseClients = new Set<ServerResponse>();

  async start(settings: Settings): Promise<McpServerInfo> {
    if (this.server) {
      throw new Error("MCP server already running");
    }

    this.host = settings.mcp.host;
    this.port = settings.mcp.port;
    this.token = randomUUID();
    this.client = new CaidoGraphQLClient(settings.caidoApi);

    if (!this.client.isConfigured()) {
      throw new Error(
        "Caido API token not configured. Set it in Drift settings."
      );
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err) => {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "EADDRINUSE") {
          reject(
            new Error(`Port ${this.port} is already in use`)
          );
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, this.host, () => {
        const info = this.getInfo();
        resolve(info);
      });
    });
  }

  stop(): void {
    // Close all SSE connections
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.client = null;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getInfo(): McpServerInfo {
    return {
      running: this.isRunning(),
      host: this.host,
      port: this.port,
      token: this.token,
      toolCount: TOOL_REGISTRY.length,
      url: `http://${this.host}:${this.port}`,
    };
  }

  getToken(): string {
    return this.token;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Auth check (skip for OPTIONS)
    if (!this.checkAuth(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(req.url ?? "/", `http://${this.host}:${this.port}`);

    if (req.method === "GET" && url.pathname === "/sse") {
      this.handleSSE(req, res);
    } else if (req.method === "POST" && url.pathname === "/message") {
      this.handleMessage(req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  private checkAuth(req: IncomingMessage): boolean {
    const auth = req.headers["authorization"];
    if (!auth) return false;
    const parts = auth.split(" ");
    return parts[0] === "Bearer" && parts[1] === this.token;
  }

  private handleSSE(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send the endpoint event so the client knows where to POST
    const endpoint = `http://${this.host}:${this.port}/message`;
    res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

    this.sseClients.add(res);

    // Keepalive every 30s to prevent proxy/load-balancer timeouts
    const keepalive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepalive);
      }
    }, 30000);

    res.on("close", () => {
      clearInterval(keepalive);
      this.sseClients.delete(res);
    });
  }

  private async handleMessage(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await readBody(req);
      const rpc = JSON.parse(body) as JsonRpcRequest;

      const response = await this.handleRpc(rpc);

      if (response === null) {
        // Notification - acknowledge with 202, no body
        res.writeHead(202);
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      }
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify(
          jsonRpcError(null, -32700, (err as Error).message)
        )
      );
    }
  }

  private async handleRpc(
    rpc: JsonRpcRequest
  ): Promise<ReturnType<typeof jsonRpcSuccess> | null> {
    switch (rpc.method) {
      case "initialize":
        return jsonRpcSuccess(rpc.id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "drift-mcp",
            version: "0.1.0",
          },
        });

      case "notifications/initialized":
      case "notifications/cancelled":
        // Notifications don't get responses per JSON-RPC 2.0 spec
        return null;

      case "ping":
        return jsonRpcSuccess(rpc.id, {});

      case "tools/list":
        return jsonRpcSuccess(rpc.id, {
          tools: TOOL_REGISTRY.map((r) => ({
            name: r.tool.name,
            description: r.tool.description,
            inputSchema: r.tool.inputSchema,
          })),
        });

      case "tools/call": {
        const params = rpc.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const entry = TOOL_REGISTRY.find(
          (r) => r.tool.name === params.name
        );

        if (!entry) {
          return jsonRpcSuccess(rpc.id, {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${params.name}`,
              },
            ],
            isError: true,
          });
        }

        if (!this.client) {
          return jsonRpcSuccess(rpc.id, {
            content: [
              {
                type: "text",
                text: "Caido API client not initialized",
              },
            ],
            isError: true,
          });
        }

        try {
          const result = await entry.execute(
            this.client,
            params.arguments ?? {}
          );
          return jsonRpcSuccess(rpc.id, result);
        } catch (err) {
          return jsonRpcSuccess(rpc.id, {
            content: [
              {
                type: "text",
                text: `Tool error: ${(err as Error).message}`,
              },
            ],
            isError: true,
          });
        }
      }

      default:
        return jsonRpcError(rpc.id, -32601, `Method not found: ${rpc.method}`);
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// Singleton
let _server: McpServer | undefined;

export function getMcpServer(): McpServer {
  if (!_server) {
    _server = new McpServer();
  }
  return _server;
}
