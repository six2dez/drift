import { Classic } from "@caido/primevue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";

// Shared state for context passing between commands and the chat
let pendingContext: string | undefined;

export function getPendingContext(): string | undefined {
  const ctx = pendingContext;
  pendingContext = undefined;
  return ctx;
}

export function setPendingContext(ctx: string) {
  pendingContext = ctx;
}

// Command IDs
const CMD_OPEN = "drift.open";
const CMD_SEND_REQUEST = "drift.send-request";
const CMD_SEND_RESPONSE = "drift.send-response";
const CMD_ASK_REQUEST = "drift.ask-about-request";

export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);

  app.use(PrimeVue, {
    unstyled: true,
    pt: Classic,
  });

  const pinia = createPinia();
  app.use(pinia);
  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, {
    height: "100%",
    width: "100%",
  });

  root.id = "plugin--drift";
  app.mount(root);

  sdk.navigation.addPage("/drift", {
    body: root,
  });

  sdk.sidebar.registerItem("Drift", "/drift", {
    icon: "fas fa-terminal",
  });

  // ── Commands ──────────────────────────────────────────────────────

  sdk.commands.register(CMD_OPEN, {
    name: "Open Drift",
    run: () => sdk.navigation.goTo("/drift"),
    group: "Drift",
  });

  sdk.commands.register(CMD_SEND_REQUEST, {
    name: "Send Request to Drift",
    run: (context: { request: { raw: string } }) => {
      setPendingContext(context.request.raw);
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD_SEND_RESPONSE, {
    name: "Send Response to Drift",
    run: (context: { response: { raw: string } }) => {
      setPendingContext(context.response.raw);
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD_ASK_REQUEST, {
    name: "Ask Drift about this request",
    run: (context: { request: { raw: string } }) => {
      setPendingContext(
        `Analyze the following HTTP request for security issues:\n\n${context.request.raw}`
      );
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  // ── Command Palette ───────────────────────────────────────────────

  sdk.commandPalette.register(CMD_OPEN);

  // ── Context Menus ─────────────────────────────────────────────────

  sdk.menu.registerItem({
    type: "Request",
    commandId: CMD_SEND_REQUEST,
    leadingIcon: "fas fa-terminal",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: CMD_ASK_REQUEST,
    leadingIcon: "fas fa-robot",
  });

  sdk.menu.registerItem({
    type: "Response",
    commandId: CMD_SEND_RESPONSE,
    leadingIcon: "fas fa-terminal",
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: CMD_SEND_REQUEST,
    leadingIcon: "fas fa-terminal",
  });
};
