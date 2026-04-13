import { Classic } from "@caido/primevue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";
import {
  buildPendingChatInput,
  extractCaidoText,
  enqueuePendingChatInput,
} from "./chat-context";

// ── Command IDs ─────────────────────────────────────────────────────

const CMD = {
  open: "drift.open",
  analyzeRequest: "drift.analyze-request",
  analyzeResponse: "drift.analyze-response",
  findVulns: "drift.find-vulnerabilities",
  analyzeJS: "drift.analyze-js",
} as const;

export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);

  app.use(PrimeVue, { unstyled: true, pt: Classic });

  const pinia = createPinia();
  app.use(pinia);
  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, { height: "100%", width: "100%" });
  root.id = "plugin--drift";
  app.mount(root);

  sdk.navigation.addPage("/drift", { body: root });
  sdk.sidebar.registerItem("Drift", "/drift", { icon: "fas fa-hurricane" });

  // ── Commands ──────────────────────────────────────────────────────

  sdk.commands.register(CMD.open, {
    name: "Open Drift",
    run: () => sdk.navigation.goTo("/drift"),
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeRequest, {
    name: "Analyze Request",
    run: (ctx: unknown) => {
      const raw = extractCaidoText(ctx, "request");
      enqueuePendingChatInput(buildPendingChatInput({
        text: "Analyze this HTTP request for security issues, misconfigurations, and potential vulnerabilities. Focus on injection points, authentication issues, sensitive data exposure, IDOR, SSRF, and other OWASP Top 10 issues.",
        source: "request",
        label: "HTTP request",
        rawContext: raw,
      }));
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeResponse, {
    name: "Analyze Response",
    run: (ctx: unknown) => {
      const raw = extractCaidoText(ctx, "response");
      enqueuePendingChatInput(buildPendingChatInput({
        text: "Analyze this HTTP response for security issues. Look for information disclosure, missing security headers, sensitive data exposure, internal error leakage, and likely vulnerabilities.",
        source: "response",
        label: "HTTP response",
        rawContext: raw,
      }));
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.findVulns, {
    name: "Find Vulnerabilities",
    run: (ctx: unknown) => {
      const raw = extractCaidoText(ctx, "request");
      enqueuePendingChatInput(buildPendingChatInput({
        text: "Perform a thorough security analysis of this HTTP request. For each potential vulnerability, identify the type, explain the attack vector, suggest a test payload, and rate the severity.",
        source: "request-row",
        label: "HTTP request",
        rawContext: raw,
      }));
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeJS, {
    name: "Analyze JavaScript",
    run: (ctx: unknown) => {
      const raw = extractCaidoText(ctx, "response");
      enqueuePendingChatInput(buildPendingChatInput({
        text: "Analyze this JavaScript or HTTP response for security issues. Look for API endpoints, hardcoded secrets, tokens, credentials, internal URLs, debug information, DOM XSS sinks and sources, and sensitive data.",
        source: "response",
        label: "JavaScript or HTTP response",
        rawContext: raw,
      }));
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  // ── Command Palette ───────────────────────────────────────────────

  sdk.commandPalette.register(CMD.open);

  // ── Context Menus ─────────────────────────────────────────────────

  // Request context menus (editor view)
  sdk.menu.registerItem({
    type: "Request",
    commandId: CMD.analyzeRequest,
    leadingIcon: "fas fa-search",
  });

  sdk.menu.registerItem({
    type: "Request",
    commandId: CMD.findVulns,
    leadingIcon: "fas fa-bug",
  });

  // Response context menus
  sdk.menu.registerItem({
    type: "Response",
    commandId: CMD.analyzeResponse,
    leadingIcon: "fas fa-search",
  });

  sdk.menu.registerItem({
    type: "Response",
    commandId: CMD.analyzeJS,
    leadingIcon: "fas fa-code",
  });

  // Request row context menus (table/list view - history, sitemap)
  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: CMD.analyzeRequest,
    leadingIcon: "fas fa-search",
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: CMD.findVulns,
    leadingIcon: "fas fa-bug",
  });
};
