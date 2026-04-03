import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const sendRequestTool: McpTool = {
  name: "send_request",
  description:
    "Send an HTTP request through Caido's replay functionality. " +
    "Provide a raw HTTP request string and connection details. " +
    "Returns the response received.",
  inputSchema: {
    type: "object" as const,
    properties: {
      raw: {
        type: "string",
        description:
          "Raw HTTP request (e.g., 'GET /path HTTP/1.1\\r\\nHost: example.com\\r\\n\\r\\n')",
      },
      host: {
        type: "string",
        description: "Target host (e.g., 'example.com')",
      },
      port: {
        type: "number",
        description: "Target port (default: 443 for TLS, 80 otherwise)",
      },
      isTls: {
        type: "boolean",
        description: "Use TLS/HTTPS (default: true)",
      },
    },
    required: ["raw", "host"],
  },
};

export async function executeSendRequest(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const raw = args["raw"] as string;
  const host = args["host"] as string;
  const isTls = (args["isTls"] as boolean) ?? true;
  const port = (args["port"] as number) ?? (isTls ? 443 : 80);

  // Create a replay session with raw request
  const createQuery = `
    mutation($input: CreateReplaySessionInput!) {
      createReplaySession(input: $input) {
        session {
          id
          activeEntry { id }
        }
      }
    }
  `;

  const createData = await client.query<{
    createReplaySession: {
      session: { id: string; activeEntry: { id: string } };
    };
  }>(createQuery, {
    input: {
      requestSource: {
        raw,
        connection: { host, port, isTLS: isTls },
      },
    },
  });

  const sessionId = createData.createReplaySession.session.id;

  // Send the request
  const sendQuery = `
    mutation($id: ID!, $input: SendReplaySessionInput!) {
      sendReplaySession(id: $id, input: $input) {
        entry {
          id
          response {
            statusCode
            roundtripTime
            length
            raw
          }
          error
        }
      }
    }
  `;

  const sendData = await client.query<{
    sendReplaySession: {
      entry: {
        id: string;
        response?: {
          statusCode: number;
          roundtripTime: number;
          length: number;
          raw: string;
        };
        error?: string;
      };
    };
  }>(sendQuery, {
    id: sessionId,
    input: { raw, connection: { host, port, isTLS: isTls } },
  });

  const entry = sendData.sendReplaySession.entry;

  if (entry.error) {
    return {
      content: [
        { type: "text", text: `Request failed: ${entry.error}` },
      ],
      isError: true,
    };
  }

  if (!entry.response) {
    return {
      content: [{ type: "text", text: "No response received" }],
      isError: true,
    };
  }

  const resp = entry.response;
  const responseText = resp.raw.length > 50000
    ? resp.raw.slice(0, 50000) + "\n... [truncated]"
    : resp.raw;

  return {
    content: [
      {
        type: "text",
        text: [
          `Status: ${resp.statusCode}`,
          `Time: ${resp.roundtripTime}ms`,
          `Size: ${resp.length} bytes`,
          `Session ID: ${sessionId}`,
          "",
          responseText,
        ].join("\n"),
      },
    ],
  };
}

export const createReplaySessionTool: McpTool = {
  name: "create_replay_session",
  description:
    "Create a new Caido replay session from an existing request ID. " +
    "Useful for setting up repeated testing of a specific request.",
  inputSchema: {
    type: "object" as const,
    properties: {
      requestId: {
        type: "string",
        description: "Source request ID from history",
      },
    },
    required: ["requestId"],
  },
};

export async function executeCreateReplaySession(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const requestId = args["requestId"] as string;

  const query = `
    mutation($input: CreateReplaySessionInput!) {
      createReplaySession(input: $input) {
        session {
          id
          name
          activeEntry { id }
        }
      }
    }
  `;

  const data = await client.query<{
    createReplaySession: {
      session: { id: string; name: string; activeEntry: { id: string } };
    };
  }>(query, {
    input: { requestSource: { id: requestId } },
  });

  const session = data.createReplaySession.session;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            sessionId: session.id,
            name: session.name,
            entryId: session.activeEntry.id,
          },
          null,
          2
        ),
      },
    ],
  };
}
