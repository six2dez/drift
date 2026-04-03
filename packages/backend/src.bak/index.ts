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
  console.log("[drift] init() called");
  setSDK(sdk);

  try {
    console.log("[drift] meta.path =", sdk.meta.path());
  } catch (e) {
    console.error("[drift] sdk.meta.path() failed:", e);
  }

  // Pre-initialize stores (async, fire-and-forget)
  try {
    getSettingsStore().initialize().catch((e: unknown) => {
      console.error("[drift] settings init failed:", e);
    });
    getChatsStore().initialize().catch((e: unknown) => {
      console.error("[drift] chats init failed:", e);
    });
  } catch (e) {
    console.error("[drift] store creation failed:", e);
  }

  console.log("[drift] registering APIs...");

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
