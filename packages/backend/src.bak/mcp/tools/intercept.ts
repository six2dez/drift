import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const interceptControlTool: McpTool = {
  name: "intercept_control",
  description:
    "Control Caido's HTTP intercept proxy. " +
    "Get current status, pause, or resume request/response interception.",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        description: "Action to perform: 'status', 'pause', or 'resume'",
        enum: ["status", "pause", "resume"],
      },
    },
    required: ["action"],
  },
};

export async function executeInterceptControl(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const action = args["action"] as string;

  switch (action) {
    case "status": {
      const query = `
        query {
          interceptOptions {
            request { enabled }
            response { enabled }
          }
        }
      `;
      const data = await client.query<{
        interceptOptions: {
          request: { enabled: boolean };
          response: { enabled: boolean };
        };
      }>(query);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data.interceptOptions, null, 2),
          },
        ],
      };
    }

    case "pause": {
      const query = `
        mutation {
          pauseIntercept {
            request { enabled }
            response { enabled }
          }
        }
      `;
      const data = await client.query<{
        pauseIntercept: {
          request: { enabled: boolean };
          response: { enabled: boolean };
        };
      }>(query);

      return {
        content: [
          {
            type: "text",
            text: `Intercept paused: ${JSON.stringify(data.pauseIntercept)}`,
          },
        ],
      };
    }

    case "resume": {
      const query = `
        mutation {
          resumeIntercept {
            request { enabled }
            response { enabled }
          }
        }
      `;
      const data = await client.query<{
        resumeIntercept: {
          request: { enabled: boolean };
          response: { enabled: boolean };
        };
      }>(query);

      return {
        content: [
          {
            type: "text",
            text: `Intercept resumed: ${JSON.stringify(data.resumeIntercept)}`,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown action: ${action}. Use 'status', 'pause', or 'resume'.`,
          },
        ],
        isError: true,
      };
  }
}
