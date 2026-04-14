// Prompt construction, redaction helpers, and verdict parsing for the
// Drift scanner subsystem. All functions are pure so they can be unit
// tested without touching the Caido SDK.

import type {
  ScannerConfidence,
  ScannerInjectionPoint,
  ScannerSeverity,
  ScannerSettings,
  ScannerVulnerabilityClass,
} from "shared";
import { SCANNER_CONFIRMABLE_CLASSES } from "shared";

const REDACTED = "[redacted]";

const SENSITIVE_HEADER_NAMES: readonly string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-session-id",
];

// Allowlist of field/parameter names that we redact in URL query
// strings and in body payloads (form-urlencoded, JSON string leaves).
// The rest of the body/URL is left intact so the scanner still sees
// real injection surface — the goal is to strip obvious secrets, not
// to nuke the entire request.
const SENSITIVE_FIELD_NAMES: readonly RegExp[] = [
  /^token$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^id[_-]?token$/i,
  /^api[_-]?key$/i,
  /^apikey$/i,
  /^password$/i,
  /^passwd$/i,
  /^pwd$/i,
  /^secret$/i,
  /^client[_-]?secret$/i,
  /^auth$/i,
  /^authorization$/i,
  /^key$/i,
  /^sig$/i,
  /^signature$/i,
  /^session$/i,
  /^sessionid$/i,
  /^jwt$/i,
  /^bearer$/i,
];

function isSensitiveFieldName(name: string): boolean {
  const trimmed = name.trim();
  for (const pattern of SENSITIVE_FIELD_NAMES) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// Case-insensitive regex blacklist for generic, low-signal finding
// titles. Applied to ALL classes (rule 5) and extra-strict to
// className === "other" (rule 6). Extending this list should be rare.
export const GENERIC_NOISE_TITLE_PATTERNS: readonly RegExp[] = [
  /missing[\s\-_]*(security\s+)?header/i,
  /verbose\s+error/i,
  /possible\s+vuln(erability)?/i,
  /weak\s+password\s+policy/i,
];

// Extra patterns applied only when className === "other".
export const OTHER_ONLY_NOISE_PATTERNS: readonly RegExp[] = [
  /information\s+disclosure/i,
  /insecure\s+cookie/i,
];

export type RawHttpMessage = {
  method: string;
  url: string;
  headers: Record<string, string[]>;
  body: string;
};

export type RawHttpResponse = {
  statusCode: number;
  headers: Record<string, string[]>;
  body: string;
};

export type PassiveVerdict =
  | { accepted: false; reason: string }
  | {
      accepted: true;
      className: ScannerVulnerabilityClass;
      title: string;
      severity: ScannerSeverity;
      confidence: ScannerConfidence;
      description: string;
      evidence: string;
    };

type RawPassiveVerdict = {
  vulnerable?: unknown;
  className?: unknown;
  title?: unknown;
  severity?: unknown;
  confidence?: unknown;
  description?: unknown;
  evidence?: unknown;
};

export function redactRequest(
  message: RawHttpMessage,
  enabled: boolean,
): RawHttpMessage {
  if (!enabled) return message;
  const contentType = firstHeaderValue(message.headers, "content-type") ?? "";
  return {
    ...message,
    url: redactUrl(message.url),
    headers: redactHeaders(message.headers),
    body: redactBody(message.body, contentType),
  };
}

export function redactResponse(
  response: RawHttpResponse,
  enabled: boolean,
): RawHttpResponse {
  if (!enabled) return response;
  const contentType = firstHeaderValue(response.headers, "content-type") ?? "";
  return {
    ...response,
    headers: redactHeaders(response.headers),
    body: redactBody(response.body, contentType),
  };
}

function redactHeaders(headers: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, values] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.includes(lower)) {
      out[name] = values.map(() => REDACTED);
    } else {
      out[name] = [...values];
    }
  }
  return out;
}

function firstHeaderValue(
  headers: Record<string, string[]>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, values] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return values[0];
  }
  return undefined;
}

// Redact sensitive query-string values in a URL. Keeps the key
// visible (so the scanner still sees "there's an api_key param") but
// masks the value. Non-sensitive params pass through unchanged.
export function redactUrl(url: string): string {
  const questionIndex = url.indexOf("?");
  if (questionIndex === -1) return url;
  const base = url.slice(0, questionIndex);
  const queryAndFragment = url.slice(questionIndex + 1);
  const hashIndex = queryAndFragment.indexOf("#");
  const queryPart = hashIndex === -1 ? queryAndFragment : queryAndFragment.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : queryAndFragment.slice(hashIndex);
  if (queryPart === "") return url;
  const rewritten = queryPart
    .split("&")
    .map((pair) => {
      if (pair === "") return pair;
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      const decoded = safeDecode(key);
      if (isSensitiveFieldName(decoded)) {
        return `${key}=${REDACTED}`;
      }
      return pair;
    })
    .join("&");
  return `${base}?${rewritten}${fragment}`;
}

// Redact sensitive values inside a request/response body. Only
// touches well-known text content types (form-urlencoded + JSON).
// Anything else passes through as-is so the scanner can still see
// injection surface.
export function redactBody(body: string, contentType: string): string {
  if (body === "") return body;
  const lower = contentType.toLowerCase();
  if (lower.includes("application/x-www-form-urlencoded")) {
    return redactFormBody(body);
  }
  if (lower.includes("application/json")) {
    return redactJsonBody(body);
  }
  return body;
}

function redactFormBody(body: string): string {
  return body
    .split("&")
    .map((pair) => {
      if (pair === "") return pair;
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      const decoded = safeDecode(key);
      if (isSensitiveFieldName(decoded)) {
        return `${key}=${REDACTED}`;
      }
      return pair;
    })
    .join("&");
}

function redactJsonBody(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  const masked = maskJsonValue(parsed);
  try {
    return JSON.stringify(masked);
  } catch {
    return body;
  }
}

function maskJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskJsonValue(item));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (isSensitiveFieldName(key) && typeof v === "string") {
        out[key] = REDACTED;
      } else {
        out[key] = maskJsonValue(v);
      }
    }
    return out;
  }
  return value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function formatRawMessage(message: RawHttpMessage): string {
  const head = `${message.method} ${message.url}`;
  const headerLines = Object.entries(message.headers)
    .flatMap(([name, values]) => values.map((v) => `${name}: ${v}`))
    .join("\n");
  const body = message.body.length > 0 ? `\n\n${message.body}` : "";
  return `${head}\n${headerLines}${body}`;
}

export function formatRawResponse(response: RawHttpResponse): string {
  const head = `HTTP ${String(response.statusCode)}`;
  const headerLines = Object.entries(response.headers)
    .flatMap(([name, values]) => values.map((v) => `${name}: ${v}`))
    .join("\n");
  const body = response.body.length > 0 ? `\n\n${response.body}` : "";
  return `${head}\n${headerLines}${body}`;
}

export function buildPassivePrompt(input: {
  request: RawHttpMessage;
  response: RawHttpResponse;
  settings: ScannerSettings;
}): string {
  const { request, response, settings } = input;
  const rawRequest = formatRawMessage(redactRequest(request, settings.redactionEnabled));
  const rawResponse = formatRawResponse(redactResponse(response, settings.redactionEnabled));
  return [
    "You are a Caido security triage agent. You receive exactly ONE HTTP request + response pair.",
    "Decide whether it shows evidence of a well-known web vulnerability.",
    "",
    "Return ONLY a single JSON object and NOTHING ELSE — no prose, no markdown fences.",
    "Two shapes are valid:",
    '  {"vulnerable": false}',
    "  {",
    '    "vulnerable": true,',
    '    "className": "reflected-xss" | "error-sqli" | "lfi" | "ssti" | "open-redirect" | "other",',
    '    "title": "short specific title",',
    '    "severity": "info" | "low" | "medium" | "high" | "critical",',
    '    "confidence": "low" | "medium" | "high",',
    '    "description": "explanation with at least 40 characters",',
    '    "evidence": "one concrete line of observed response content that proves the verdict"',
    "  }",
    "",
    "Rules (read carefully, followed strictly):",
    "- Only set vulnerable=true if you see concrete evidence in the response body, not speculation.",
    "- Never flag missing security headers alone.",
    "- Never flag generic error pages without specific DB/stack leakage.",
    '- Use className "other" only as a narrow escape hatch for high-evidence findings that do not fit the five named classes. Prefer a specific class whenever possible.',
    '- When unsure, return {"vulnerable": false}.',
    "",
    "=== REQUEST ===",
    rawRequest,
    "",
    "=== RESPONSE ===",
    rawResponse,
  ].join("\n");
}

export function buildActivePlanPrompt(input: {
  request: RawHttpMessage;
  classes: readonly ScannerVulnerabilityClass[];
  injectionPoints: readonly ScannerInjectionPoint[];
  maxPayloads: number;
  settings: ScannerSettings;
}): string {
  const { request, classes, injectionPoints, maxPayloads, settings } = input;
  const rawRequest = formatRawMessage(redactRequest(request, settings.redactionEnabled));
  const classList = classes
    .filter((c) => c !== "other")
    .filter((c) => (SCANNER_CONFIRMABLE_CLASSES as readonly string[]).includes(c))
    .join(", ");
  const injectionPointList = injectionPoints
    .map((point) => `  - ${point.kind}:${point.name}`)
    .join("\n");
  return [
    "You are a Caido security active-scan payload planner. You receive ONE HTTP request and must propose concrete payloads Drift can replay.",
    `Generate at most ${String(maxPayloads)} high-signal payloads across the following classes: ${classList}.`,
    "",
    "INJECTION POINTS — these are the ONLY fields you may target. Drift already verified each one exists in the request; do not invent new fields.",
    injectionPointList,
    "",
    "Return ONLY a JSON array and NOTHING ELSE — no prose, no markdown fences. Each item:",
    "  {",
    '    "className": "reflected-xss" | "error-sqli" | "lfi" | "ssti" | "open-redirect",',
    '    "injectionPoint": "<one of the ids listed above, verbatim>",',
    '    "payload": "the exact payload string",',
    '    "marker": "drift-<8 random alphanumerics>"',
    "  }",
    "",
    "Rules:",
    "- One payload per array element. Do not bundle multiple payloads into one string.",
    "- `injectionPoint` MUST match one of the ids above exactly. Any item with an unknown injection point will be dropped by Drift.",
    "- Include a short unique marker per payload so Drift can detect reflection deterministically.",
    "- For SSTI use an arithmetic probe Drift can verify ({{7*7}}, ${2+3}, #{6*6}, <%= 3*4 %>).",
    "- For LFI use canonical probes (../../../../etc/passwd, ../../boot.ini).",
    "- For error-SQLi use classic quote/tautology strings ('OR 1=1--).",
    "- For open-redirect use an attacker-controlled absolute URL (https://drift-scanner.invalid/).",
    "- Do NOT return verdicts. Drift will confirm each payload itself.",
    "",
    "=== REQUEST ===",
    rawRequest,
  ].join("\n");
}

// Parse a passive verdict returned by the LLM. Strict: any rule failure
// produces { accepted: false, reason }. The caller uses that to bump
// counters and skip creating a finding.
export function parsePassiveVerdict(input: {
  raw: string;
  confidenceThreshold: "medium" | "high";
}): PassiveVerdict {
  const trimmed = input.raw.trim();
  if (trimmed === "") return { accepted: false, reason: "empty response" };

  const json = extractJsonObject(trimmed);
  if (json === undefined) return { accepted: false, reason: "no json object found" };

  let parsed: RawPassiveVerdict;
  try {
    parsed = JSON.parse(json) as RawPassiveVerdict;
  } catch {
    return { accepted: false, reason: "malformed json" };
  }

  if (parsed.vulnerable !== true) {
    return { accepted: false, reason: "vulnerable flag is not true" };
  }

  const className = coerceClassName(parsed.className);
  if (className === undefined) {
    return { accepted: false, reason: "className missing or invalid" };
  }

  const title = coerceNonEmptyString(parsed.title);
  if (title === undefined) {
    return { accepted: false, reason: "title missing" };
  }

  const severity = coerceSeverity(parsed.severity);
  if (severity === undefined) {
    return { accepted: false, reason: "severity missing or invalid" };
  }

  const confidence = coerceConfidence(parsed.confidence);
  if (confidence === undefined) {
    return { accepted: false, reason: "confidence missing or invalid" };
  }

  if (!meetsConfidenceThreshold(confidence, input.confidenceThreshold)) {
    return { accepted: false, reason: `confidence below threshold (${confidence} < ${input.confidenceThreshold})` };
  }

  const evidence = coerceNonEmptyString(parsed.evidence);
  if (evidence === undefined) {
    return { accepted: false, reason: "evidence missing" };
  }

  const description = coerceNonEmptyString(parsed.description) ?? "";

  // Rule 5: generic noise blacklist applies to all classes.
  for (const pattern of GENERIC_NOISE_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return {
        accepted: false,
        reason: `title matches generic-noise blacklist: ${pattern.source}`,
      };
    }
  }

  // Rule 6: `className === "other"` gets the stricter bar.
  if (className === "other") {
    if (confidence !== "high") {
      return {
        accepted: false,
        reason: "className=other requires confidence=high",
      };
    }
    if (evidence.length < 16) {
      return {
        accepted: false,
        reason: "className=other requires evidence length >= 16",
      };
    }
    if (description.length < 40) {
      return {
        accepted: false,
        reason: "className=other requires description length >= 40",
      };
    }
    for (const pattern of OTHER_ONLY_NOISE_PATTERNS) {
      if (pattern.test(title)) {
        return {
          accepted: false,
          reason: `className=other title matches extra blacklist: ${pattern.source}`,
        };
      }
    }
  }

  return {
    accepted: true,
    className,
    title,
    severity,
    confidence,
    description,
    evidence,
  };
}

function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start, end + 1);
}

export function extractJsonArray(text: string): string | undefined {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return undefined;
  return text.slice(start, end + 1);
}

function coerceClassName(value: unknown): ScannerVulnerabilityClass | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as ScannerVulnerabilityClass;
  const allowed: readonly ScannerVulnerabilityClass[] = [
    "reflected-xss",
    "error-sqli",
    "lfi",
    "ssti",
    "open-redirect",
    "other",
  ];
  return allowed.includes(normalized) ? normalized : undefined;
}

function coerceSeverity(value: unknown): ScannerSeverity | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const allowed: readonly ScannerSeverity[] = ["info", "low", "medium", "high", "critical"];
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as ScannerSeverity)
    : undefined;
}

function coerceConfidence(value: unknown): ScannerConfidence | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const allowed: readonly ScannerConfidence[] = ["low", "medium", "high"];
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as ScannerConfidence)
    : undefined;
}

function coerceNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function meetsConfidenceThreshold(
  confidence: ScannerConfidence,
  threshold: "medium" | "high",
): boolean {
  if (threshold === "high") return confidence === "high";
  return confidence === "medium" || confidence === "high";
}
