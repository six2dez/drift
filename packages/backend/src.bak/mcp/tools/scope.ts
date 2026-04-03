import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const getScopeTool: McpTool = {
  name: "get_scope",
  description: "List all scope definitions in the current Caido project.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function executeGetScope(
  client: CaidoGraphQLClient,
  _args: Record<string, unknown>
): Promise<McpToolResult> {
  const query = `
    query {
      scopes {
        id
        name
        allowlist
        denylist
      }
    }
  `;

  const data = await client.query<{
    scopes: Array<{
      id: string;
      name: string;
      allowlist: string[];
      denylist: string[];
    }>;
  }>(query);

  return {
    content: [{ type: "text", text: JSON.stringify(data.scopes, null, 2) }],
  };
}

export const checkScopeTool: McpTool = {
  name: "check_scope",
  description:
    "Check if a given URL is within any defined scope. " +
    "Useful for verifying targets before testing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "The URL to check against defined scopes",
      },
    },
    required: ["url"],
  },
};

export async function executeCheckScope(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const url = args["url"] as string;

  // Get all scopes and check manually
  const query = `
    query {
      scopes {
        id
        name
        allowlist
        denylist
      }
    }
  `;

  const data = await client.query<{
    scopes: Array<{
      id: string;
      name: string;
      allowlist: string[];
      denylist: string[];
    }>;
  }>(query);

  const results = data.scopes.map((scope) => {
    const inAllowlist = scope.allowlist.some((pattern) => {
      try {
        return new RegExp(pattern).test(url);
      } catch {
        return url.includes(pattern);
      }
    });

    const inDenylist = scope.denylist.some((pattern) => {
      try {
        return new RegExp(pattern).test(url);
      } catch {
        return url.includes(pattern);
      }
    });

    return {
      scope: scope.name,
      inScope: inAllowlist && !inDenylist,
      matchedAllow: inAllowlist,
      matchedDeny: inDenylist,
    };
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ url, results }, null, 2) }],
  };
}
