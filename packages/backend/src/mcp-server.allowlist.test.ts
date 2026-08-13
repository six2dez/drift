import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// These tests spawn the real embedded MCP server and exercise the server-side
// tool allowlist — the actual enforcement boundary (independent of any
// provider's own --allowedTools flag). They focus on the methods that resolve
// BEFORE any GraphQL call (tools/list, and tools/call against a tool outside
// the allowlist), so no Caido backend is required.

type JsonRpcResponse = {
  id?: number;
  result?: {
    tools?: Array<{ name?: string }>;
    content?: Array<{ text?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
};

const scriptPath = fileURLToPath(new URL("../assets/mcp-server.mjs", import.meta.url));

// Send initialize + a single request, resolve with the response whose id matches.
function callServer(
  env: Record<string, string>,
  request: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const requestId = typeof request.id === "number" ? request.id : 2;
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, CAIDO_TOKEN: "session-token", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      reject(new Error(`Timed out waiting for allowlist response. ${stderr}`));
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
        if (parsed.id === requestId) {
          clearTimeout(timeout);
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
          resolve(parsed);
        }
      }
    });

    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk: string) => { stderr += chunk; });
    proc.on("error", (error) => { clearTimeout(timeout); reject(error); });

    proc.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "drift-allowlist-test", version: "1.0.0" } },
    })}\n`);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    proc.stdin.write(`${JSON.stringify(request)}\n`);
    proc.stdin.end();
  });
}

describe("mcp-server tool allowlist", () => {
  it("tools/list reflects DRIFT_ALLOWED_TOOLS", async () => {
    const response = await callServer(
      { DRIFT_ALLOWLIST_ACTIVE: "1", DRIFT_ALLOWED_TOOLS: "search_history,get_current_context" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    );
    const names = (response.result?.tools ?? []).map((tool) => tool.name);
    expect(names).toEqual(["search_history", "get_current_context"]);
  });

  it("rejects tools/call for a tool outside the allowlist", async () => {
    const response = await callServer(
      { DRIFT_ALLOWLIST_ACTIVE: "1", DRIFT_ALLOWED_TOOLS: "search_history" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "send_request", arguments: { raw: "GET / HTTP/1.1", host: "example.com" } } },
    );
    expect(response.result?.isError).toBe(true);
    expect(response.result?.content?.[0]?.text ?? "").toContain("unavailable");
  });

  // Regression: disabling every permission group yields an empty allowlist.
  // With the active flag set, that must DENY all tools, not expose them all.
  it("denies all tools when the allowlist is active but empty", async () => {
    const listResponse = await callServer(
      { DRIFT_ALLOWLIST_ACTIVE: "1", DRIFT_ALLOWED_TOOLS: "" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    );
    expect(listResponse.result?.tools ?? []).toEqual([]);

    const callResponse = await callServer(
      { DRIFT_ALLOWLIST_ACTIVE: "1", DRIFT_ALLOWED_TOOLS: "" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_history", arguments: { limit: 1 } } },
    );
    expect(callResponse.result?.isError).toBe(true);
    expect(callResponse.result?.content?.[0]?.text ?? "").toContain("unavailable");
  });

  // Backward-compat: with no allowlist env at all (standalone/unconfigured),
  // every tool is exposed so the server stays usable outside Drift's wiring.
  it("exposes every tool when the allowlist flag is absent", async () => {
    const response = await callServer(
      {},
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    );
    expect((response.result?.tools ?? []).length).toBe(18);
  });
});
