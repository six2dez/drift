import { Result, type McpServerInfo } from "shared";

import type { BackendSDK } from "../types";
import { getMcpServer } from "../mcp/server";
import { getSettingsStore } from "../stores/settings";

export async function startMcpServer(
  sdk: BackendSDK
): Promise<Result<McpServerInfo>> {
  try {
    const settings = getSettingsStore().getSettings();
    const server = getMcpServer();

    if (server.isRunning()) {
      return Result.ok(server.getInfo());
    }

    const info = await server.start(settings);

    sdk.api.send("mcp-status", {
      running: true,
      port: info.port,
      toolCount: info.toolCount,
    });

    return Result.ok(info);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function stopMcpServer(sdk: BackendSDK): Result<void> {
  try {
    const server = getMcpServer();
    server.stop();

    sdk.api.send("mcp-status", {
      running: false,
      port: 0,
      toolCount: 0,
    });

    return Result.ok(undefined);
  } catch (error) {
    return Result.err((error as Error).message);
  }
}

export function getMcpStatus(_sdk: BackendSDK): Result<McpServerInfo> {
  try {
    const server = getMcpServer();
    return Result.ok(server.getInfo());
  } catch (error) {
    return Result.err((error as Error).message);
  }
}
