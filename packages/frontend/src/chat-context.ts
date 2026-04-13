import { computed, ref } from "vue";
import type {
  HttpContextAttachment,
  HttpContextPayload,
  HttpContextSource,
} from "shared";

export type PendingChatInput = {
  text: string;
  httpContext?: HttpContextPayload;
  attachment?: HttpContextAttachment;
};

// Queue of context-menu-driven prompts. Commands registered in `index.ts`
// enqueue items here; `App.vue` watches the head to force-switch the active
// tab to Chat, and `ChatView.vue` watches the head to consume and auto-send.
// A queue (rather than a single slot) is required because the user can
// trigger another context-menu command while a turn is already streaming —
// ChatView re-enqueues the new payload and drains it when the current turn
// finishes, so no action is silently dropped.
export const pendingChatInputQueue = ref<PendingChatInput[]>([]);

export const pendingChatInput = computed<PendingChatInput | undefined>(
  () => pendingChatInputQueue.value[0],
);

export function enqueuePendingChatInput(ctx: PendingChatInput): void {
  pendingChatInputQueue.value = [...pendingChatInputQueue.value, ctx];
}

export function consumePendingChatInput(): PendingChatInput | undefined {
  const q = pendingChatInputQueue.value;
  if (q.length === 0) return undefined;
  const [head, ...rest] = q;
  pendingChatInputQueue.value = rest;
  return head;
}

export function clearPendingChatInputQueue(): void {
  if (pendingChatInputQueue.value.length === 0) return;
  pendingChatInputQueue.value = [];
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function extractCaidoText(ctx: unknown, key: "request" | "response"): string {
  try {
    const c = ctx as Record<string, unknown>;
    const obj = c[key] as Record<string, unknown> | undefined;
    if (obj === undefined) return stringifyUnknown(ctx);

    if (typeof obj["getRaw"] === "function") {
      const raw = (obj as { getRaw: () => { toText: () => string } }).getRaw();
      if (typeof raw?.toText === "function") return raw.toText();
    }

    const body = typeof obj["getBody"] === "function"
      ? ((obj as { getBody: () => { toText: () => string } | undefined }).getBody()?.toText() ?? "")
      : "";

    if (key === "request" && typeof obj["getMethod"] === "function" && typeof obj["getUrl"] === "function") {
      const method = (obj as { getMethod: () => string }).getMethod();
      const url = (obj as { getUrl: () => string }).getUrl();
      return `${method} ${url}\n${body}`;
    }
    if (key === "response" && typeof obj["getCode"] === "function") {
      return `HTTP ${(obj as { getCode: () => number }).getCode()}\n\n${body}`;
    }

    if (typeof obj["raw"] === "string") return obj["raw"] as string;
    return stringifyUnknown(ctx);
  } catch {
    return String(ctx);
  }
}

export function createHttpContextPayload(
  source: HttpContextSource,
  label: string,
  raw: string,
): HttpContextPayload | undefined {
  const normalizedRaw = raw.trim();
  if (normalizedRaw === "") return undefined;
  return {
    source,
    label: label.trim(),
    raw: normalizedRaw,
  };
}

export function createHttpContextAttachment(
  payload: HttpContextPayload | undefined,
): HttpContextAttachment | undefined {
  if (payload === undefined) return undefined;
  return {
    source: payload.source,
    label: payload.label,
    size: payload.raw.length,
  };
}

export function createPendingChatInput(
  text: string,
  httpContext?: HttpContextPayload,
): PendingChatInput {
  const normalizedText = text.trim();
  return {
    text: normalizedText,
    httpContext,
    attachment: createHttpContextAttachment(httpContext),
  };
}

export function buildPendingChatInput(input: {
  text: string;
  source: HttpContextSource;
  label: string;
  rawContext: string;
}): PendingChatInput {
  return createPendingChatInput(
    input.text,
    createHttpContextPayload(input.source, input.label, input.rawContext),
  );
}
