import { z } from "zod";

export const McpServerInfoSchema = z.object({
  running: z.boolean(),
  host: z.string(),
  port: z.number(),
  token: z.string(),
  toolCount: z.number(),
  url: z.string(),
});
export type McpServerInfo = z.infer<typeof McpServerInfoSchema>;

export type TempMcpConfig = {
  configPath: string;
  configDir?: string;
  envVars: Record<string, string>;
};
