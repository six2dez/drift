import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

type GraphqlPayload = {
  query: string;
  variables?: Record<string, unknown>;
};

type JsonRpcResponse = {
  id?: number;
  result?: {
    content?: Array<{ text?: string }>;
    tools?: Array<{ name?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-context-"));
  tempDirs.push(dir);
  return dir;
}

async function startMockCaidoServer() {
  const graphqlCalls: GraphqlPayload[] = [];
  let selectedProjectId = "ui-project";

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || req.url !== "/graphql") {
      res.statusCode = 404;
      res.end();
      return;
    }

    let body = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      const payload = JSON.parse(body) as GraphqlPayload;
      graphqlCalls.push(payload);

      if (payload.query.includes("selectProject")) {
        selectedProjectId = String(payload.variables?.id ?? "");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          data: {
            selectProject: {
              currentProject: {
                project: {
                  id: selectedProjectId,
                  name: selectedProjectId === "alt-project" ? "Alt Project" : "UI Project",
                },
              },
              error: null,
            },
          },
        }));
        return;
      }

      if (payload.query.includes("projects{id name status version}")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          data: {
            projects: [
              { id: "ui-project", name: "UI Project", status: "READY", version: "1" },
              { id: "alt-project", name: "Alt Project", status: "READY", version: "1" },
            ],
            currentProject: {
              project: {
                id: selectedProjectId,
              },
            },
          },
        }));
        return;
      }

      if (payload.query.includes("requests(")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          data: {
            requests: {
              edges: [],
            },
          },
        }));
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        data: {
          environments: [],
        },
      }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind mock Caido server.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    graphqlCalls,
    getSelectedProjectId: () => selectedProjectId,
  };
}

async function runSingleMcpRequest(input: {
  caidoUrl: string;
  contextFile: string;
  request: Record<string, unknown>;
}) {
  const scriptPath = fileURLToPath(new URL("../assets/mcp-server.mjs", import.meta.url));
  const proc = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      CAIDO_URL: input.caidoUrl,
      CAIDO_TOKEN: "session-token",
      DRIFT_CONTEXT_FILE: input.contextFile,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const requestId = typeof input.request.id === "number" ? input.request.id : 2;
  let response: JsonRpcResponse | undefined;

  await new Promise<void>((resolve, reject) => {
    let stdoutBuffer = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      reject(new Error(`Timed out waiting for MCP responses. ${stderr}`));
    }, 10000);

    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        if (line === "") continue;
        const parsed = JSON.parse(line) as JsonRpcResponse;
        if (parsed.id === requestId) {
          response = parsed;
          clearTimeout(timeout);
          resolve();
        }
      }
    });

    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      if (response !== undefined) return;
      clearTimeout(timeout);
      reject(new Error(`MCP server exited early (${String(code)}): ${stderr}`));
    });

    proc.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "drift-test", version: "1.0.0" },
      },
    })}\n`);
    proc.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })}\n`);
    proc.stdin.write(`${JSON.stringify(input.request)}\n`);
  });

  proc.stdin.end();
  await new Promise<void>((resolve) => {
    proc.on("close", () => resolve());
  });

  if (response === undefined) {
    throw new Error("MCP server did not return a response.");
  }

  return response;
}

function getResponseText(response: JsonRpcResponse) {
  return response.result?.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

describe("mcp-server context tools", () => {
  it("exposes effective context, lists projects, and persists project overrides", async () => {
    const tempDir = await createTempDir();
    const contextFile = path.join(tempDir, "mcp-context.json");
    await writeFile(
      contextFile,
      JSON.stringify({
        uiContext: {
          projectId: "ui-project",
          filterId: "filter-1",
          filterName: "Interesting",
          filterQuery: "status:200",
          historyQuery: "host:example.com",
          historyScopeId: "scope-ui",
        },
        overrideContext: {
          projectId: "",
        },
      }),
    );

    const mockCaido = await startMockCaidoServer();

    try {
      const initialContext = JSON.parse(getResponseText(await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_current_context", arguments: {} } },
      })));
      const listedProjects = JSON.parse(getResponseText(await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } },
      })));
      const selectedProject = JSON.parse(getResponseText(await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "select_project", arguments: { id: "alt-project" } } },
      })));
      const overriddenContext = JSON.parse(getResponseText(await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_current_context", arguments: {} } },
      })));
      await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "search_history", arguments: { limit: 1 } } },
      });
      await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "clear_context_override", arguments: {} } },
      });
      const clearedContext = JSON.parse(getResponseText(await runSingleMcpRequest({
        caidoUrl: mockCaido.url,
        contextFile,
        request: { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "get_current_context", arguments: {} } },
      })));

      expect(initialContext.effectiveContext.projectId).toBe("ui-project");
      expect(initialContext.effectiveContext.historyScopeId).toBe("scope-ui");

      expect(listedProjects.projects).toHaveLength(2);
      expect(listedProjects.projects.find((project: { id: string }) => project.id === "ui-project")?.isCurrent).toBe(true);

      expect(selectedProject.project.id).toBe("alt-project");
      expect(selectedProject.overrideActive).toBe(true);
      expect(overriddenContext.overrideContext.projectId).toBe("alt-project");
      expect(overriddenContext.effectiveContext.projectId).toBe("alt-project");
      expect(overriddenContext.effectiveContext.historyScopeId).toBe("");

      const searchHistoryCall = mockCaido.graphqlCalls.find((call) =>
        call.query.includes("requests(first:$first,filter:$filter,scopeId:$scopeId)"),
      );
      expect(searchHistoryCall?.variables?.scopeId).toBeUndefined();
      const serializedFilter = JSON.stringify(searchHistoryCall?.variables?.filter ?? "");
      expect(serializedFilter).toContain("status:200");
      expect(serializedFilter).toContain("host:example.com");

      expect(clearedContext.overrideContext.projectId).toBe("");
      expect(clearedContext.effectiveContext.projectId).toBe("ui-project");
      expect(mockCaido.getSelectedProjectId()).toBe("alt-project");

      const storedContext = JSON.parse(await readFile(contextFile, "utf-8"));
      expect(storedContext.overrideContext.projectId).toBe("");
    } finally {
      await new Promise<void>((resolve, reject) => {
        mockCaido.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
