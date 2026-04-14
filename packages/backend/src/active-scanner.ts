// Manual single-request active scanner. Triggered from the context
// menu "Active scan this request". Uses the LLM to propose payloads
// (phase A), sends each via sdk.requests.send, then confirms
// deterministically via response-analyzer. Creates findings only
// for confirmed verdicts, always pointing at the proof replay.

import type { SDK } from "caido:plugin";
import { randomUUID } from "crypto";
import {
  type ActiveScanResult,
  type ScannerRecentFinding,
  type ScannerSettings,
  type ScannerVulnerabilityClass,
} from "shared";
import {
  analyzeResponse,
  type ResponseAnalyzerResult,
} from "./response-analyzer";
import {
  buildActivePlanPrompt,
  extractJsonArray,
  type RawHttpMessage,
} from "./scanner-prompts";
import {
  extractInjectionPoints,
  mutateFormBody,
  mutateHeaderValue,
  mutateJsonBody,
  mutateQueryParam,
  parseInjectionPointId,
  type InjectionSource,
} from "./injection-points";
import type { ScannerQueue } from "./scanner-queue";
import {
  runHeadlessCliTurn,
  scannerDebugLogPath,
} from "./headless-cli";
import { buildActiveDedupeKey, normalizePathTemplate } from "./scanner-dedupe";

type ActiveSdk = SDK;

// Pull concrete Caido types off the SDK method signatures instead of
// importing from caido:utils. The saved request type comes from
// requests.get's return, and the request-spec type from the result of
// Request#toSpec on that same request.
type FetchedRequestResponse = NonNullable<
  Awaited<ReturnType<ActiveSdk["requests"]["get"]>>
>;
type CaidoRequest = FetchedRequestResponse["request"];
type CaidoRequestSpec = ReturnType<CaidoRequest["toSpec"]>;

type PayloadPlanItem = {
  className: ScannerVulnerabilityClass;
  injectionPointId: string;
  payload: string;
  marker: string;
};

export type ActiveScannerDeps = {
  sdk: ActiveSdk;
  queue: ScannerQueue;
  getSettings: () => ScannerSettings;
  isEngaged: () => boolean;
  isDebugLogging: () => boolean;
  resolveScannerBinary: () => Promise<string | undefined>;
};

export async function runActiveScanOnRequest(
  deps: ActiveScannerDeps,
  input: { requestId: string },
): Promise<ActiveScanResult> {
  const sdk = deps.sdk;
  const jobId = `active-${randomUUID()}`;
  const settings = deps.getSettings();
  const result: ActiveScanResult = {
    jobId,
    payloadsSent: 0,
    confirmed: 0,
    findings: [],
    truncated: false,
  };

  // Pre-flight BEFORE queue enqueue so (a) rate limiting sees the
  // real host, and (b) trivially-failing scans (out of scope, no
  // injection points, binary missing) fail fast without consuming
  // a queue slot or reaching the LLM.
  if (!deps.isEngaged()) {
    result.error = "Drift is not engaged.";
    return result;
  }
  const fetched = await sdk.requests.get(input.requestId);
  if (fetched === undefined) {
    result.error = `Request ${input.requestId} not found in Caido.`;
    return result;
  }
  const baseRequest = fetched.request;
  if (settings.scopeOnly) {
    try {
      if (!sdk.requests.inScope(baseRequest)) {
        result.error = "Request is out of scope.";
        return result;
      }
    } catch {
      // non-fatal — if the scope check throws, proceed and let the
      // downstream analyzer decide.
    }
  }

  const source: InjectionSource = {
    method: baseRequest.getMethod(),
    url: baseRequest.getUrl(),
    headers: baseRequest.getHeaders(),
    body: baseRequest.getBody()?.toText() ?? "",
    host: baseRequest.getHost(),
    path: baseRequest.getPath(),
    query: baseRequest.getQuery(),
  };

  const injectionPoints = extractInjectionPoints(source);
  if (injectionPoints.length === 0) {
    result.error = "No injection points discovered.";
    return result;
  }

  // Build the plan prompt WITH the discovered injection points, so
  // the LLM is told up front "only target these, don't invent". We
  // filter the returned plan against this same allowlist as a
  // belt-and-braces catch downstream.
  const allowedInjectionPointIds = new Set(
    injectionPoints.map((p) => `${p.kind}:${p.name}`),
  );

  return new Promise<ActiveScanResult>((resolve) => {
    const enqueueResult = deps.queue.enqueue({
      jobId,
      kind: "active",
      enqueuedAt: Date.now(),
      host: source.host,
      requestId: input.requestId,
      onResolve: () => resolve(result),
      onReject: (error) => {
        result.error = error.message;
        resolve(result);
      },
      handler: async (ctx) => {
        const claudeBinaryPath = await deps.resolveScannerBinary();
        if (claudeBinaryPath === undefined) {
          ctx.reportProviderMissing(
            "Claude Code binary not found. Install it or fix the command path in Settings > CLI Providers.",
          );
          result.error = "Claude Code binary not found.";
          return;
        }

        ctx.markAnalyzed();

        const rawRequest: RawHttpMessage = {
          method: source.method,
          url: source.url,
          headers: source.headers,
          body: source.body,
        };

        const prompt = buildActivePlanPrompt({
          request: rawRequest,
          classes: ["reflected-xss", "error-sqli", "lfi", "ssti", "open-redirect"],
          injectionPoints,
          maxPayloads: settings.maxActivePayloads,
          settings,
        });

        let planResponse: { text: string };
        try {
          planResponse = await runHeadlessCliTurn({
            jobId,
            claudeBinaryPath,
            prompt,
            timeoutMs: settings.jobTimeoutSeconds * 1000,
            debugLogPath: deps.isDebugLogging() ? scannerDebugLogPath(jobId) : undefined,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : JSON.stringify(error);
          result.error = `Payload planning failed: ${message}`;
          ctx.reportError(result.error);
          return;
        }

        const plan = parsePayloadPlan(planResponse.text, settings.maxActivePayloads);
        if (plan.truncated) result.truncated = true;
        if (plan.items.length === 0) {
          result.error = "LLM returned no usable payloads.";
          ctx.reportError(result.error);
          return;
        }

        for (const item of plan.items) {
          // Primary guard: the LLM must stay within the discovered
          // allowlist. Anything else is a plan hallucination.
          if (!allowedInjectionPointIds.has(item.injectionPointId)) {
            continue;
          }
          const point = parseInjectionPointId(item.injectionPointId);
          if (point === undefined) continue;
          // Defense in depth: mutate helpers also return undefined
          // when the target field is absent.
          const spec = buildMutatedSpec(baseRequest, source, point, item.payload);
          if (spec === undefined) continue;

          let replay;
          try {
            replay = await sdk.requests.send(spec, { save: true });
          } catch (error) {
            ctx.reportError(
              `requests.send failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            continue;
          }
          result.payloadsSent += 1;

          const analyzed: ResponseAnalyzerResult = analyzeResponse({
            className: item.className,
            payload: item.payload,
            marker: item.marker,
            response: {
              statusCode: replay.response.getCode(),
              headers: replay.response.getHeaders(),
              body: replay.response.getBody()?.toText() ?? "",
            },
          });

          if (analyzed.verdict !== "confirmed") continue;

          result.confirmed += 1;
          const dedupeKey = buildActiveDedupeKey(
            source.method,
            source.host,
            normalizePathTemplate(source.path),
            item.className,
            item.injectionPointId,
          );
          let createdInCaido = false;
          try {
            await sdk.findings.create({
              title: `${classLabel(item.className)} confirmed on ${source.method} ${source.host}${source.path}`,
              description: `Injection point: ${item.injectionPointId}\nPayload: ${item.payload}\nEvidence: ${analyzed.evidence}`,
              reporter: "drift-active",
              dedupeKey,
              request: replay.request,
            });
            createdInCaido = true;
          } catch (error) {
            ctx.reportError(
              `findings.create failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          const finding: ScannerRecentFinding = {
            id: randomUUID(),
            jobId,
            occurredAt: Date.now(),
            kind: "active",
            title: `${classLabel(item.className)} confirmed on ${source.method} ${source.host}${source.path}`,
            severity: severityFor(item.className),
            className: item.className,
            url: replay.request.getUrl(),
            requestId: replay.request.getId(),
            dedupeKey,
            evidence: analyzed.evidence,
            description: `Injection point: ${item.injectionPointId}. Payload: ${item.payload}.`,
            createdInCaido,
          };
          result.findings.push(finding);
          ctx.emitFinding(finding);
        }
      },
    });

    if (!enqueueResult.accepted) {
      result.error = enqueueResult.reason;
      resolve(result);
    }
  });
}

// ── helpers ────────────────────────────────────────────────────────

function parsePayloadPlan(
  raw: string,
  cap: number,
): { items: PayloadPlanItem[]; truncated: boolean } {
  const jsonArray = extractJsonArray(raw);
  if (jsonArray === undefined) return { items: [], truncated: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonArray);
  } catch {
    return { items: [], truncated: false };
  }
  if (!Array.isArray(parsed)) return { items: [], truncated: false };
  const items: PayloadPlanItem[] = [];
  let truncated = false;
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const className = coerceConfirmableClass(e.className);
    if (className === undefined) continue;
    const injectionPointId = typeof e.injectionPoint === "string" ? e.injectionPoint : undefined;
    const payload = typeof e.payload === "string" ? e.payload : undefined;
    const marker = typeof e.marker === "string" ? e.marker : undefined;
    if (injectionPointId === undefined || payload === undefined || marker === undefined) continue;
    if (items.length >= cap) {
      truncated = true;
      break;
    }
    items.push({ className, injectionPointId, payload, marker });
  }
  return { items, truncated };
}

function coerceConfirmableClass(value: unknown): ScannerVulnerabilityClass | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase() as ScannerVulnerabilityClass;
  if (
    normalized === "reflected-xss" ||
    normalized === "error-sqli" ||
    normalized === "lfi" ||
    normalized === "ssti" ||
    normalized === "open-redirect"
  ) {
    return normalized;
  }
  return undefined;
}

function classLabel(className: ScannerVulnerabilityClass): string {
  switch (className) {
    case "reflected-xss": return "Reflected XSS";
    case "error-sqli": return "Error-based SQL injection";
    case "lfi": return "Local file inclusion";
    case "ssti": return "Server-side template injection";
    case "open-redirect": return "Open redirect";
    case "other": return "Other";
  }
}

function severityFor(className: ScannerVulnerabilityClass): ScannerRecentFinding["severity"] {
  switch (className) {
    case "reflected-xss": return "medium";
    case "error-sqli": return "high";
    case "lfi": return "high";
    case "ssti": return "critical";
    case "open-redirect": return "medium";
    case "other": return "low";
  }
}

function buildMutatedSpec(
  baseRequest: CaidoRequest,
  source: InjectionSource,
  point: { kind: "query" | "body" | "header"; name: string },
  payload: string,
): CaidoRequestSpec | undefined {
  if (point.kind === "query") {
    const mutated = mutateQueryParam(source, point.name, payload);
    if (mutated === undefined) return undefined;
    const spec = baseRequest.toSpec();
    spec.setQuery(mutated.query);
    return spec;
  }
  if (point.kind === "body") {
    const contentType = firstHeader(source.headers, "content-type") ?? "";
    if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
      const mutatedBody = mutateFormBody(source.body, point.name, payload);
      if (mutatedBody === undefined) return undefined;
      const spec = baseRequest.toSpec();
      spec.setBody(mutatedBody);
      return spec;
    }
    if (contentType.toLowerCase().includes("application/json")) {
      const mutatedBody = mutateJsonBody(source.body, point.name, payload);
      if (mutatedBody === undefined) return undefined;
      const spec = baseRequest.toSpec();
      spec.setBody(mutatedBody);
      return spec;
    }
    return undefined;
  }
  if (point.kind === "header") {
    const mutatedHeaders = mutateHeaderValue(source.headers, point.name, payload);
    if (mutatedHeaders === undefined) return undefined;
    const spec = baseRequest.toSpec();
    // Preserve the original casing of the header name when calling
    // setHeader — find the key whose lowercase matches the point.
    const existingKey = Object.keys(mutatedHeaders).find(
      (k) => k.toLowerCase() === point.name.toLowerCase(),
    );
    if (existingKey === undefined) return undefined;
    const newValue = (mutatedHeaders[existingKey] ?? [])[0] ?? payload;
    spec.setHeader(existingKey, newValue);
    return spec;
  }
  return undefined;
}

function firstHeader(
  headers: Record<string, string[]>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, values] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return values[0];
  }
  return undefined;
}
