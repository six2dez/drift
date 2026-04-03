import type { CaidoGraphQLClient } from "../caido-client";
import type { McpTool, McpToolResult } from "../protocol";

export const getEnvironmentTool: McpTool = {
  name: "get_environment",
  description:
    "List all Caido environments and their variables. " +
    "Environments store test variables like tokens, hostnames, etc.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function executeGetEnvironment(
  client: CaidoGraphQLClient,
  _args: Record<string, unknown>
): Promise<McpToolResult> {
  const query = `
    query {
      environments {
        id
        name
        variables {
          name
          value
        }
      }
    }
  `;

  const data = await client.query<{
    environments: Array<{
      id: string;
      name: string;
      variables: Array<{ name: string; value: string }>;
    }>;
  }>(query);

  return {
    content: [
      { type: "text", text: JSON.stringify(data.environments, null, 2) },
    ],
  };
}

export const setEnvironmentTool: McpTool = {
  name: "set_environment",
  description:
    "Create or update a variable in a Caido environment. " +
    "If the variable exists it will be updated, otherwise created.",
  inputSchema: {
    type: "object" as const,
    properties: {
      environmentId: {
        type: "string",
        description: "The environment ID to modify",
      },
      name: {
        type: "string",
        description: "Variable name",
      },
      value: {
        type: "string",
        description: "Variable value",
      },
    },
    required: ["environmentId", "name", "value"],
  },
};

export async function executeSetEnvironment(
  client: CaidoGraphQLClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const environmentId = args["environmentId"] as string;
  const name = args["name"] as string;
  const value = args["value"] as string;

  // Try to update first, if it fails create
  const updateQuery = `
    mutation($id: ID!, $input: UpdateEnvironmentInput!) {
      updateEnvironment(id: $id, input: $input) {
        environment {
          id
          name
          variables {
            name
            value
          }
        }
      }
    }
  `;

  try {
    const data = await client.query<{
      updateEnvironment: {
        environment: {
          id: string;
          name: string;
          variables: Array<{ name: string; value: string }>;
        };
      };
    }>(updateQuery, {
      id: environmentId,
      input: {
        variables: [{ name, value, kind: "PLAIN" }],
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              action: "updated",
              environment: data.updateEnvironment.environment,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to set variable "${name}" in environment ${environmentId}: ${(err as Error).message}. ` +
            `Verify the environment ID exists (use get_environment to list them).`,
        },
      ],
      isError: true,
    };
  }
}
