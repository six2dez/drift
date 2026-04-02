import type { DefineAPI, SDK } from "caido:plugin";

import {
  cancelCliMessage,
  checkProviderAvailability,
  closeCliSession,
  createCliSession,
  getCliSessionState,
  getProviderStatuses,
  sendCliMessage,
} from "./api/cli";
import { deleteChat, getChat, getChats, saveChat } from "./api/chats";
import { getMcpStatus, startMcpServer, stopMcpServer } from "./api/mcp";
import { getSettings, updateSettings } from "./api/settings";
import { setSDK } from "./sdk";
import { getChatsStore } from "./stores/chats";
import { getSettingsStore } from "./stores/settings";
import type { BackendEvents } from "./types";

export * from "./types";

export type API = DefineAPI<{
  // CLI Sessions
  createCliSession: typeof createCliSession;
  sendCliMessage: typeof sendCliMessage;
  cancelCliMessage: typeof cancelCliMessage;
  closeCliSession: typeof closeCliSession;
  getCliSessionState: typeof getCliSessionState;

  // Providers
  getProviderStatuses: typeof getProviderStatuses;
  checkProviderAvailability: typeof checkProviderAvailability;

  // MCP Server
  startMcpServer: typeof startMcpServer;
  stopMcpServer: typeof stopMcpServer;
  getMcpStatus: typeof getMcpStatus;

  // Settings
  getSettings: typeof getSettings;
  updateSettings: typeof updateSettings;

  // Chat Persistence
  getChat: typeof getChat;
  getChats: typeof getChats;
  saveChat: typeof saveChat;
  deleteChat: typeof deleteChat;
}>;

export function init(sdk: SDK<API, BackendEvents>) {
  setSDK(sdk);

  const settingsStore = getSettingsStore();
  const chatsStore = getChatsStore();

  settingsStore.initialize();
  chatsStore.initialize();

  // CLI Sessions
  sdk.api.register("createCliSession", createCliSession);
  sdk.api.register("sendCliMessage", sendCliMessage);
  sdk.api.register("cancelCliMessage", cancelCliMessage);
  sdk.api.register("closeCliSession", closeCliSession);
  sdk.api.register("getCliSessionState", getCliSessionState);

  // Providers
  sdk.api.register("getProviderStatuses", getProviderStatuses);
  sdk.api.register("checkProviderAvailability", checkProviderAvailability);

  // MCP Server
  sdk.api.register("startMcpServer", startMcpServer);
  sdk.api.register("stopMcpServer", stopMcpServer);
  sdk.api.register("getMcpStatus", getMcpStatus);

  // Settings
  sdk.api.register("getSettings", getSettings);
  sdk.api.register("updateSettings", updateSettings);

  // Chat Persistence
  sdk.api.register("getChat", getChat);
  sdk.api.register("getChats", getChats);
  sdk.api.register("saveChat", saveChat);
  sdk.api.register("deleteChat", deleteChat);
}
