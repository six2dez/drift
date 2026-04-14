// Passive scanner: subscribes to onInterceptResponse, runs an
// aggressive filter pipeline, and enqueues surviving targets onto
// the shared scanner queue. The actual LLM call + finding creation
// is driven by a handler the queue's worker invokes.
//
// The scanner does NOT use MCP. The prompt is built with the raw
// request+response baked in by Drift, the headless CLI turn reads
// it on stdin, and the verdict is parsed + confirmed locally.

import type { SDK } from "caido:plugin";
import { randomUUID } from "crypto";
import type {
  ScannerRecentFinding,
  ScannerSettings,
} from "shared";
import type { ScannerQueue } from "./scanner-queue";
import {
  buildPassivePrompt,
  parsePassiveVerdict,
  type RawHttpMessage,
  type RawHttpResponse,
} from "./scanner-prompts";
import {
  runHeadlessCliTurn,
  scannerDebugLogPath,
} from "./headless-cli";
import {
  buildPassiveDedupeKey,
  normalizePathTemplate,
} from "./scanner-dedupe";

type PassiveSdk = SDK;

// Caido Request and Response types flow through the SDK typings.
// We extract the concrete types from the onInterceptResponse callback
// signature so we don't have to import from caido:utils.
type InterceptResponseCallback = Parameters<
  PassiveSdk["events"]["onInterceptResponse"]
>[0];
type CaidoRequestArg = Parameters<InterceptResponseCallback>[1];
type CaidoResponseArg = Parameters<InterceptResponseCallback>[2];

// Static asset extension blacklist — pathTemplate or query tail is
// inspected before any LLM involvement.
const STATIC_ASSET_EXT = /\.(css|js|mjs|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|ico|map)(\?|$)/i;

// MIME types we refuse to analyze (non-text bodies aren't useful).
const MIME_DENY = [
  /^image\//i,
  /^video\//i,
  /^audio\//i,
  /^font\//i,
  /^application\/octet-stream/i,
  /^application\/zip/i,
  /^application\/x-gzip/i,
  /^application\/pdf/i,
];

// Endpoint fingerprint LRU (method + host + pathTemplate + sortedQueryKeys).
// Used to suppress repeated LLM calls on the same effective endpoint
// within an hour-long window.
const FINGERPRINT_TTL_MS = 60 * 60 * 1000;
const FINGERPRINT_LRU_CAP = 1024;
const fingerprintLru = new Map<string, number>();

export type PassiveScannerDeps = {
  sdk: PassiveSdk;
  queue: ScannerQueue;
  getSettings: () => ScannerSettings;
  isEngaged: () => boolean;
  isDebugLogging: () => boolean;
  resolveScannerBinary: () => Promise<string | undefined>;
};

export function registerPassiveScanner(deps: PassiveScannerDeps): void {
  const sdk = deps.sdk;
  sdk.events.onInterceptResponse(async (_sdk, request, response) => {
    try {
      await handlePassiveResponse(deps, sdk, request, response);
    } catch (error) {
      sdk.console.log(
        `[drift scanner] passive handler threw: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

async function handlePassiveResponse(
  deps: PassiveScannerDeps,
  sdk: PassiveSdk,
  request: CaidoRequestArg,
  response: CaidoResponseArg,
): Promise<void> {
  const settings = deps.getSettings();
  if (!settings.passiveEnabled) return;
  if (!deps.isEngaged()) return;

  if (settings.scopeOnly) {
    try {
      if (!sdk.requests.inScope(request)) return;
    } catch {
      return;
    }
  }

  const method = request.getMethod();
  const host = request.getHost();
  const path = request.getPath();
  const query = request.getQuery();
  const url = request.getUrl();

  if (settings.skipStaticAssets) {
    if (STATIC_ASSET_EXT.test(path) || STATIC_ASSET_EXT.test(url)) return;
  }

  const contentType = firstHeader(response.getHeaders(), "content-type") ?? "";
  for (const pattern of MIME_DENY) {
    if (pattern.test(contentType)) return;
  }

  const statusCode = response.getCode();
  if (statusCode === 204 || statusCode === 304) return;

  const responseBody = response.getBody()?.toText() ?? "";
  if (responseBody.length > settings.maxBodyBytes) return;

  const fingerprint = buildEndpointFingerprint(method, host, path, query);
  const now = Date.now();
  const last = fingerprintLru.get(fingerprint);
  if (last !== undefined && now - last < FINGERPRINT_TTL_MS) return;
  rememberFingerprint(fingerprint, now);

  try {
    if (await sdk.findings.exists({ reporter: "drift-passive", request })) return;
  } catch {
    // Treat findings.exists errors as a miss — we'd rather re-analyze
    // than silently drop a potential finding.
  }

  const requestBody = request.getBody()?.toText() ?? "";
  const rawRequest: RawHttpMessage = {
    method,
    url,
    headers: request.getHeaders(),
    body: requestBody,
  };
  const rawResponse: RawHttpResponse = {
    statusCode,
    headers: response.getHeaders(),
    body: responseBody,
  };

  const prompt = buildPassivePrompt({
    request: rawRequest,
    response: rawResponse,
    settings,
  });

  const jobId = `passive-${randomUUID()}`;
  const enqueued = deps.queue.enqueue({
    jobId,
    kind: "passive",
    enqueuedAt: Date.now(),
    host,
    requestId: request.getId(),
    handler: async (ctx) => {
      const claudeBinaryPath = await deps.resolveScannerBinary();
      if (claudeBinaryPath === undefined) {
        ctx.reportProviderMissing(
          "Claude Code binary not found. Install it or fix the command path in Settings > CLI Providers.",
        );
        return;
      }
      ctx.markAnalyzed();
      try {
        const result = await runHeadlessCliTurn({
          jobId,
          claudeBinaryPath,
          prompt,
          timeoutMs: settings.jobTimeoutSeconds * 1000,
          debugLogPath: deps.isDebugLogging()
            ? scannerDebugLogPath(jobId)
            : undefined,
        });
        const verdict = parsePassiveVerdict({
          raw: result.text,
          confidenceThreshold: settings.confidenceThreshold,
        });
        if (!verdict.accepted) {
          sdk.console.log(`[drift scanner] passive skipped ${jobId}: ${verdict.reason}`);
          deps.queue.recordInvalidVerdict(verdict.reason);
          return;
        }
        const dedupeKey = buildPassiveDedupeKey(
          method,
          host,
          normalizePathTemplate(path),
          verdict.className,
        );
        let createdInCaido = false;
        try {
          await sdk.findings.create({
            title: verdict.title,
            description: `${verdict.description}\n\nEvidence: ${verdict.evidence}`,
            reporter: "drift-passive",
            dedupeKey,
            request,
          });
          createdInCaido = true;
        } catch (error) {
          ctx.reportError(
            `findings.create failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const recent: ScannerRecentFinding = {
          id: randomUUID(),
          jobId,
          occurredAt: Date.now(),
          kind: "passive",
          title: verdict.title,
          severity: verdict.severity,
          className: verdict.className,
          url,
          requestId: request.getId(),
          dedupeKey,
          evidence: verdict.evidence,
          description: verdict.description,
          createdInCaido,
        };
        ctx.emitFinding(recent);
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        ctx.reportError(`passive job ${jobId} failed: ${message}`);
      }
    },
  });

  if (!enqueued.accepted) {
    sdk.console.log(`[drift scanner] passive drop ${jobId}: ${enqueued.reason}`);
  }
}

// ── helpers ────────────────────────────────────────────────────────

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

function buildEndpointFingerprint(
  method: string,
  host: string,
  path: string,
  query: string,
): string {
  const template = normalizePathTemplate(path);
  const sortedQueryKeys = query === ""
    ? ""
    : query
        .split("&")
        .map((p) => p.split("=")[0] ?? "")
        .filter((p) => p !== "")
        .sort()
        .join(",");
  return `${method} ${host} ${template}?${sortedQueryKeys}`;
}

function rememberFingerprint(fp: string, now: number): void {
  fingerprintLru.delete(fp);
  fingerprintLru.set(fp, now);
  while (fingerprintLru.size > FINGERPRINT_LRU_CAP) {
    const oldestKey = fingerprintLru.keys().next().value;
    if (oldestKey === undefined) break;
    fingerprintLru.delete(oldestKey);
  }
}

