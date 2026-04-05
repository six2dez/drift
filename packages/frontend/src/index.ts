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

// ── Extract raw text from Caido context objects ─────────────────────

function extractRequestText(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    // Try Caido SDK Request object (has methods)
    const req = c["request"] as Record<string, unknown> | undefined;
    if (req !== undefined) {
      // Try getRaw().toText() pattern (Caido SDK Request type)
      if (typeof req["getRaw"] === "function") {
        const raw = (req as { getRaw: () => { toText: () => string } }).getRaw();
        if (typeof raw?.toText === "function") return raw.toText();
      }
      // Try getMethod + getUrl + getHeaders pattern
      if (typeof req["getMethod"] === "function" && typeof req["getUrl"] === "function") {
        const method = (req as { getMethod: () => string }).getMethod();
        const url = (req as { getUrl: () => string }).getUrl();
        const headers = typeof req["getHeaders"] === "function"
          ? JSON.stringify((req as { getHeaders: () => Record<string, string[]> }).getHeaders(), null, 2)
          : "";
        const body = typeof req["getBody"] === "function"
          ? ((req as { getBody: () => { toText: () => string } | undefined }).getBody()?.toText() ?? "")
          : "";
        return `${method} ${url}\n${headers}\n\n${body}`;
      }
      // Try plain .raw string
      if (typeof req["raw"] === "string") return req["raw"] as string;
    }
    return JSON.stringify(ctx);
  } catch {
    return String(ctx);
  }
}

function extractResponseText(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    const resp = c["response"] as Record<string, unknown> | undefined;
    if (resp !== undefined) {
      if (typeof resp["getRaw"] === "function") {
        const raw = (resp as { getRaw: () => { toText: () => string } }).getRaw();
        if (typeof raw?.toText === "function") return raw.toText();
      }
      if (typeof resp["getCode"] === "function") {
        const code = (resp as { getCode: () => number }).getCode();
        const body = typeof resp["getBody"] === "function"
          ? ((resp as { getBody: () => { toText: () => string } | undefined }).getBody()?.toText() ?? "")
          : "";
        return `HTTP ${code}\n\n${body}`;
      }
      if (typeof resp["raw"] === "string") return resp["raw"] as string;
    }
    return JSON.stringify(ctx);
  } catch {
    return String(ctx);
  }
}

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
  sdk.sidebar.registerItem("Drift", "/drift", { icon: "fas fa-terminal" });

  // ── Commands ──────────────────────────────────────────────────────

  sdk.commands.register(CMD.open, {
    name: "Open Drift",
    run: () => sdk.navigation.goTo("/drift"),
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeRequest, {
    name: "Analyze Request",
    run: (ctx: unknown) => {
      const raw = extractRequestText(ctx);
      setPendingContext(
        `Analyze the following HTTP request for security issues, misconfigurations, and potential vulnerabilities. Look for: injection points, authentication issues, sensitive data exposure, IDOR, SSRF, and other OWASP Top 10 issues.\n\n${raw}`
      );
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeResponse, {
    name: "Analyze Response",
    run: (ctx: unknown) => {
      const raw = extractResponseText(ctx);
      setPendingContext(
        `Analyze the following HTTP response for security issues. Look for: information disclosure, security headers missing, sensitive data in response, error messages leaking internals, and potential vulnerabilities.\n\n${raw}`
      );
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.findVulns, {
    name: "Find Vulnerabilities",
    run: (ctx: unknown) => {
      const raw = extractRequestText(ctx);
      setPendingContext(
        `Perform a thorough security analysis of this HTTP request. For each potential vulnerability found:\n1. Identify the vulnerability type\n2. Explain the attack vector\n3. Suggest a test payload\n4. Rate the severity (Critical/High/Medium/Low)\n\nRequest:\n${raw}`
      );
      sdk.navigation.goTo("/drift");
    },
    group: "Drift",
  });

  sdk.commands.register(CMD.analyzeJS, {
    name: "Analyze JavaScript",
    run: (ctx: unknown) => {
      const raw = extractResponseText(ctx);
      setPendingContext(
        `Analyze the following JavaScript/response for security issues. Look for: API endpoints, hardcoded secrets, tokens, credentials, internal URLs, debug information, DOM XSS sinks/sources, and sensitive data.\n\n${raw}`
      );
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
