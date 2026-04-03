import type { CaidoGraphQLClient } from "../caido-client";
import { getStringArg, getNumberArg, type McpTool, type McpToolResult } from "../protocol";

export const searchHistoryTool: McpTool = {
  name: "search_history",
  description:
    "Search HTTP request/response history in Caido using HTTPQL filter syntax. " +
    "Example filters: 'req.method.eq:\"POST\"', 'resp.code.eq:200', " +
    "'req.host.cont:\"example.com\"'. Returns request metadata with IDs for further inspection.",
  inputSchema: {
    type: "object" as const,
    properties: {
      filter: {
        type: "string",
        description:
          "HTTPQL filter query. Examples: req.method.eq:\"GET\", resp.code.gte:400, req.host.cont:\"api\"",
      },
      limit: {
        type: "number",
        description: "Maximum number of results (default: 20, max: 100)",
      },
    },
  },
};

export async function executeSearchHistory(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const filter = getStringArg(args, "filter", "") ?? "";
  const limit = Math.min(getNumberArg(args, "limit", 20) ?? 20, 100);

  const query = `
    query($first: Int, $filter: HTTPQL) {
      requests(first: $first, filter: $filter) {
        edges {
          node {
            id
            method
            host
            path
            query
            isTls
            createdAt
            response {
              statusCode
              roundtripTime
              length
            }
          }
        }
      }
    }
  `;

  const data = await client.query<{
    requests: {
      edges: Array<{
        node: {
          id: string;
          method: string;
          host: string;
          path: string;
          query: string;
          isTls: boolean;
          createdAt: string;
          response?: {
            statusCode: number;
            roundtripTime: number;
            length: number;
          };
        };
      }>;
    };
  }>(query, { first: limit, filter: filter || undefined });

  const results = data.requests.edges.map((e) => {
    const r = e.node;
    const scheme = r.isTls ? "https" : "http";
    const url = `${scheme}://${r.host}${r.path}${r.query ? "?" + r.query : ""}`;
    return {
      id: r.id,
      method: r.method,
      url,
      status: r.response?.statusCode ?? null,
      time: r.response?.roundtripTime ?? null,
      size: r.response?.length ?? null,
      createdAt: r.createdAt,
    };
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(results, null, 2),
      },
    ],
  };
}

export const getRequestTool: McpTool = {
  name: "get_request",
  description:
    "Get the full raw HTTP request and response for a specific request ID. " +
    "Returns the complete request/response including headers and body.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "The request ID from search_history results",
      },
    },
    required: ["id"],
  },
};

export async function executeGetRequest(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const id = args["id"] as string;

  const query = `
    query($id: ID!) {
      request(id: $id) {
        id
        method
        host
        path
        query
        port
        isTls
        raw
        createdAt
        response {
          statusCode
          roundtripTime
          length
          raw
        }
      }
    }
  `;

  const data = await client.query<{
    request: {
      id: string;
      method: string;
      host: string;
      path: string;
      query: string;
      port: number;
      isTls: boolean;
      raw: string;
      createdAt: string;
      response?: {
        statusCode: number;
        roundtripTime: number;
        length: number;
        raw: string;
      };
    } | null;
  }>(query, { id });

  if (!data.request) {
    return {
      content: [{ type: "text", text: `Request ${id} not found` }],
      isError: true,
    };
  }

  const r = data.request;
  const parts = [`=== REQUEST (ID: ${r.id}) ===`, r.raw];

  if (r.response) {
    parts.push(
      `\n=== RESPONSE (${r.response.statusCode}, ${r.response.roundtripTime}ms, ${r.response.length} bytes) ===`
    );
    // Truncate response if too large
    const responseRaw = r.response.raw;
    if (responseRaw.length > 50000) {
      parts.push(responseRaw.slice(0, 50000) + "\n... [truncated]");
    } else {
      parts.push(responseRaw);
    }
  }

  return {
    content: [{ type: "text", text: parts.join("\n") }],
  };
}
