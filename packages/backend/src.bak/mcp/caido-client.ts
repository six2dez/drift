import type { CaidoApiConfig } from "shared";

/**
 * Lightweight GraphQL client for Caido's API.
 * Uses fetch() to call Caido's GraphQL endpoint with PAT auth.
 */
export class CaidoGraphQLClient {
  private url: string;
  private token: string;

  constructor(config: CaidoApiConfig) {
    this.url = `${config.url}/graphql`;
    this.token = config.token;
  }

  async query<T = unknown>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `Caido GraphQL request failed: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `Caido GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`
      );
    }

    return json.data as T;
  }

  isConfigured(): boolean {
    return this.token.length > 0;
  }
}
