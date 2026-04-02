/**
 * MCP (Model Context Protocol) types for the JSON-RPC 2.0 protocol.
 * Implements the subset needed for tool serving via SSE transport.
 */

export type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type McpToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export function jsonRpcSuccess(
  id: string | number | null | undefined,
  result: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

/** Safely extract a typed argument from MCP tool args */
export function getStringArg(
  args: Record<string, unknown>,
  name: string,
  defaultValue?: string
): string | undefined {
  const val = args[name];
  if (typeof val === "string") return val;
  if (val === undefined || val === null) return defaultValue;
  return String(val);
}

export function getNumberArg(
  args: Record<string, unknown>,
  name: string,
  defaultValue?: number
): number | undefined {
  const val = args[name];
  if (typeof val === "number" && !isNaN(val)) return val;
  if (val === undefined || val === null) return defaultValue;
  const n = Number(val);
  return isNaN(n) ? defaultValue : n;
}

export function jsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}
