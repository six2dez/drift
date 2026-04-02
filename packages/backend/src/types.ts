import { type DefineEvents, type SDK } from "caido:plugin";
import type {
  CliOutputChunkEvent,
  CliSessionStateEvent,
  McpStatusEvent,
} from "shared";

import { type API } from ".";

export type BackendSDK = SDK<API, BackendEvents>;
export type BackendEvents = DefineEvents<{
  "cli-output-chunk": (data: CliOutputChunkEvent) => void;
  "cli-session-state": (data: CliSessionStateEvent) => void;
  "mcp-status": (data: McpStatusEvent) => void;
}>;
