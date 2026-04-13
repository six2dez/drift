import { createServer } from "http";
import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

type JsonRpcResponse = {
  id?: number;
  result?: {
    content?: Array<{ text?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempContextFile() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-mcp-transport-"));
  tempDirs.push(dir);
  const contextFile = path.join(dir, "mcp-context.json");
  await writeFile(contextFile, JSON.stringify({
    uiContext: {
      projectId: "",
      filterId: "",
      filterName: "",
      filterQuery: "",
      historyQuery: "",
      historyScopeId: "",
    },
    overrideContext: {
      projectId: "",
    },
  }));
  return contextFile;
}

async function startDelayedCaidoServer() {
  const server = createServer((req, res) => {
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
      const payload = JSON.parse(body) as { query: string };
      setTimeout(() => {
        res.setHeader("Content-Type", "application/json");
        if (payload.query.includes("environments")) {
          res.end(JSON.stringify({
            data: {
              environments: [
                { id: "env-1", name: "Default", variables: [] },
              ],
            },
          }));
          return;
        }
        res.end(JSON.stringify({ data: {} }));
      }, 150);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind delayed Caido server.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function startHungCaidoServer() {
  const server = createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/graphql") {
      res.statusCode = 404;
      res.end();
      return;
    }

    req.resume();
    // Intentionally never end the response to simulate a stuck GraphQL call.
    void res;
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind hung Caido server.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("mcp-server transport", () => {
  it("drains in-flight tool calls after stdin closes", async () => {
    const contextFile = await createTempContextFile();
    const delayedCaido = await startDelayedCaidoServer();
    const scriptPath = fileURLToPath(new URL("../assets/mcp-server.mjs", import.meta.url));

    try {
      const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
        const proc = spawn(process.execPath, [scriptPath], {
          env: {
            ...process.env,
            CAIDO_URL: delayedCaido.url,
            CAIDO_TOKEN: "session-token",
            DRIFT_CONTEXT_FILE: contextFile,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdoutBuffer = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          reject(new Error(`Timed out waiting for drained response. ${stderr}`));
        }, 5000);

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
            if (parsed.id === 2) {
              clearTimeout(timeout);
              resolve(parsed);
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

        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "drift-transport-test", version: "1.0.0" },
          },
        })}\n`);
        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        })}\n`);
        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "get_environment",
            arguments: {},
          },
        })}\n`);
        proc.stdin.end();
      });

      expect(response.result?.isError).not.toBe(true);
      expect(response.result?.content?.[0]?.text ?? "").toContain("Default");
    } finally {
      await new Promise<void>((resolve, reject) => {
        delayedCaido.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it("returns a tool error when Caido never responds", async () => {
    const contextFile = await createTempContextFile();
    const hungCaido = await startHungCaidoServer();
    const scriptPath = fileURLToPath(new URL("../assets/mcp-server.mjs", import.meta.url));

    try {
      const response = await new Promise<JsonRpcResponse>((resolve, reject) => {
        const proc = spawn(process.execPath, [scriptPath], {
          env: {
            ...process.env,
            CAIDO_URL: hungCaido.url,
            CAIDO_TOKEN: "session-token",
            DRIFT_CONTEXT_FILE: contextFile,
            DRIFT_GRAPHQL_TIMEOUT_MS: "200",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdoutBuffer = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          reject(new Error(`Timed out waiting for timeout response. ${stderr}`));
        }, 5000);

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
            if (parsed.id === 2) {
              clearTimeout(timeout);
              resolve(parsed);
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

        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "drift-timeout-test", version: "1.0.0" },
          },
        })}\n`);
        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        })}\n`);
        proc.stdin.write(`${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "search_history",
            arguments: { limit: 5 },
          },
        })}\n`);
        proc.stdin.end();
      });

      expect(response.result?.isError).toBe(true);
      expect(response.result?.content?.[0]?.text ?? "").toContain("timed out");
    } finally {
      await new Promise<void>((resolve, reject) => {
        hungCaido.server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
