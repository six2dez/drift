import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const runWorkflowTool: McpTool = {
  name: "run_workflow",
  description:
    "Execute a Caido convert workflow by its ID on a given input string. " +
    "Convert workflows transform request/response data (encode, decode, etc.).",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "The workflow ID to execute",
      },
      input: {
        type: "string",
        description: "The input data to process through the workflow",
      },
    },
    required: ["id", "input"],
  },
};

export async function executeRunWorkflow(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const id = args["id"] as string;
  const input = args["input"] as string;

  const query = `
    mutation($id: ID!, $input: Blob!) {
      runConvertWorkflow(id: $id, input: $input) {
        output
        error
      }
    }
  `;

  const data = await client.query<{
    runConvertWorkflow: {
      output: string;
      error?: string;
    };
  }>(query, { id, input });

  if (data.runConvertWorkflow.error) {
    return {
      content: [
        {
          type: "text",
          text: `Workflow error: ${data.runConvertWorkflow.error}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      { type: "text", text: data.runConvertWorkflow.output },
    ],
  };
}
