import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const createFindingTool: McpTool = {
  name: "create_finding",
  description:
    "Create a security finding in Caido associated with an HTTP request. " +
    "Use this to report vulnerabilities or interesting observations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      requestId: {
        type: "string",
        description: "The HTTP request ID this finding is associated with",
      },
      title: {
        type: "string",
        description: "Finding title (e.g., 'SQL Injection in login endpoint')",
      },
      description: {
        type: "string",
        description: "Detailed description of the finding",
      },
      reporter: {
        type: "string",
        description: "Who/what reported this finding (default: 'Drift')",
      },
      dedupeKey: {
        type: "string",
        description: "Deduplication key to prevent duplicate findings for the same issue",
      },
    },
    required: ["requestId", "title"],
  },
};

export async function executeCreateFinding(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const requestId = args["requestId"] as string;
  const title = args["title"] as string;
  const description = (args["description"] as string) ?? "";
  const reporter = (args["reporter"] as string) ?? "Drift";
  const dedupeKey = (args["dedupeKey"] as string) ?? undefined;

  const query = `
    mutation($input: CreateFindingInput!) {
      createFinding(input: $input) {
        finding {
          id
          title
          reporter
          createdAt
        }
      }
    }
  `;

  const data = await client.query<{
    createFinding: {
      finding: {
        id: string;
        title: string;
        reporter: string;
        createdAt: string;
      };
    };
  }>(query, {
    input: {
      requestId,
      title,
      description,
      reporter,
      ...(dedupeKey ? { dedupeKey } : {}),
    },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data.createFinding.finding, null, 2),
      },
    ],
  };
}

export const listFindingsTool: McpTool = {
  name: "list_findings",
  description: "List all security findings in the current Caido project.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of findings to return (default: 50)",
      },
    },
  },
};

export async function executeListFindings(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const limit = Math.min((args["limit"] as number) ?? 50, 200);

  const query = `
    query($first: Int) {
      findings(first: $first) {
        edges {
          node {
            id
            title
            reporter
            host
            path
            createdAt
          }
        }
      }
    }
  `;

  const data = await client.query<{
    findings: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          reporter: string;
          host: string;
          path: string;
          createdAt: string;
        };
      }>;
    };
  }>(query, { first: limit });

  const findings = data.findings.edges.map((e) => e.node);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(findings, null, 2),
      },
    ],
  };
}
