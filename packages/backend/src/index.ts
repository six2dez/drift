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
import type { BackendEvents } from "./types";

export * from "./types";

export type API = DefineAPI<{
  createCliSession: typeof createCliSession;
  sendCliMessage: typeof sendCliMessage;
  cancelCliMessage: typeof cancelCliMessage;
  closeCliSession: typeof closeCliSession;
  getCliSessionState: typeof getCliSessionState;
  getProviderStatuses: typeof getProviderStatuses;
  checkProviderAvailability: typeof checkProviderAvailability;
  startMcpServer: typeof startMcpServer;
  stopMcpServer: typeof stopMcpServer;
  getMcpStatus: typeof getMcpStatus;
  getSettings: typeof getSettings;
  updateSettings: typeof updateSettings;
  getChat: typeof getChat;
  getChats: typeof getChats;
  saveChat: typeof saveChat;
  deleteChat: typeof deleteChat;
}>;

export function init(sdk: SDK<API, BackendEvents>) {
  setSDK(sdk);

  // Initialize stores - these are lazy singletons, safe to fail
  try {
    const { getSettingsStore } = require("./stores/settings") as typeof import("./stores/settings");
    const { getChatsStore } = require("./stores/chats") as typeof import("./stores/chats");
    const settingsStore = getSettingsStore();
    const chatsStore = getChatsStore();
    settingsStore.initialize().catch(() => {});
    chatsStore.initialize().catch(() => {});
  } catch {
    // Stores will be lazily created on first API call
  }

  // Register all API endpoints
  sdk.api.register("createCliSession", createCliSession);
  sdk.api.register("sendCliMessage", sendCliMessage);
  sdk.api.register("cancelCliMessage", cancelCliMessage);
  sdk.api.register("closeCliSession", closeCliSession);
  sdk.api.register("getCliSessionState", getCliSessionState);
  sdk.api.register("getProviderStatuses", getProviderStatuses);
  sdk.api.register("checkProviderAvailability", checkProviderAvailability);
  sdk.api.register("startMcpServer", startMcpServer);
  sdk.api.register("stopMcpServer", stopMcpServer);
  sdk.api.register("getMcpStatus", getMcpStatus);
  sdk.api.register("getSettings", getSettings);
  sdk.api.register("updateSettings", updateSettings);
  sdk.api.register("getChat", getChat);
  sdk.api.register("getChats", getChats);
  sdk.api.register("saveChat", saveChat);
  sdk.api.register("deleteChat", deleteChat);
}
