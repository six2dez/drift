// Extraction and mutation helpers for the active scanner. Given a
// saved Caido Request, enumerate the injection points Drift should
// propose to the LLM, then synthesize a RequestSpec with a payload
// substituted into a specific point.
//
// Intentionally narrow in v1: query string params, urlencoded body
// params, JSON body leaf strings, and a curated subset of headers.

import type { ScannerInjectionPoint, ScannerInjectionPointKind } from "shared";

type ParsedQuery = Array<[string, string]>;

export type InjectionSource = {
  method: string;
  url: string;
  headers: Record<string, string[]>;
  body: string;
  host: string;
  path: string;
  query: string;
};

// Headers we're willing to inject into. Keep tight — cookies and auth
// are off-limits because a scanner that mangles them would cause real
// auth failures and poison the session.
const HEADER_INJECTION_ALLOWLIST: readonly string[] = [
  "referer",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-original-url",
  "x-rewrite-url",
];

export function extractInjectionPoints(source: InjectionSource): ScannerInjectionPoint[] {
  const points: ScannerInjectionPoint[] = [];

  const query = parseQueryString(source.query);
  for (const [name] of query) {
    points.push({ kind: "query", name });
  }

  const contentType = getHeaderValue(source.headers, "content-type") ?? "";
  if (source.body.length > 0) {
    if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
      for (const [name] of parseQueryString(source.body)) {
        points.push({ kind: "body", name });
      }
    } else if (contentType.toLowerCase().includes("application/json")) {
      try {
        const parsed = JSON.parse(source.body) as unknown;
        for (const path of collectJsonStringPaths(parsed)) {
          points.push({ kind: "body", name: path });
        }
      } catch {
        // Non-JSON body labelled as json — fall through, no body points.
      }
    }
  }

  for (const headerName of HEADER_INJECTION_ALLOWLIST) {
    if (getHeaderValue(source.headers, headerName) !== undefined) {
      points.push({ kind: "header", name: headerName });
    }
  }

  return dedupePoints(points);
}

// All four mutate helpers return `undefined` when the target field
// or path does not exist in the source. The scanner treats undefined
// as "skip this payload entirely" — never synthesize a field the
// original request did not have, because a scanner that manufactures
// attack surface is misleading.

export function mutateQueryParam(
  source: InjectionSource,
  paramName: string,
  payload: string,
): { query: string; url: string } | undefined {
  const pairs = parseQueryString(source.query);
  let replaced = false;
  const out: ParsedQuery = pairs.map(([name, value]) => {
    if (name === paramName && !replaced) {
      replaced = true;
      return [name, payload];
    }
    return [name, value];
  });
  if (!replaced) return undefined;
  const newQuery = serializeQuery(out);
  const url = rebuildUrl(source.url, newQuery);
  return { query: newQuery, url };
}

export function mutateFormBody(
  body: string,
  paramName: string,
  payload: string,
): string | undefined {
  const pairs = parseQueryString(body);
  let replaced = false;
  const out: ParsedQuery = pairs.map(([name, value]) => {
    if (name === paramName && !replaced) {
      replaced = true;
      return [name, payload];
    }
    return [name, value];
  });
  if (!replaced) return undefined;
  return serializeQuery(out);
}

// Replace a JSON string leaf identified by a slash-delimited path.
// Returns undefined if the path does not resolve to an existing
// string leaf in the source body.
export function mutateJsonBody(
  body: string,
  path: string,
  payload: string,
): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const segments = path.split("/").filter((s) => s !== "");
  if (!jsonPathExists(parsed, segments)) return undefined;
  const mutated = setJsonPath(parsed, segments, payload);
  return JSON.stringify(mutated);
}

export function mutateHeaderValue(
  headers: Record<string, string[]>,
  name: string,
  payload: string,
): Record<string, string[]> | undefined {
  const lower = name.toLowerCase();
  let existingKey: string | undefined;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      existingKey = k;
      break;
    }
  }
  if (existingKey === undefined) return undefined;
  const out: Record<string, string[]> = {};
  for (const [k, values] of Object.entries(headers)) {
    out[k] = k === existingKey ? [payload] : [...values];
  }
  return out;
}

// ── internals ───────────────────────────────────────────────────────

function parseQueryString(raw: string): ParsedQuery {
  if (raw === "") return [];
  const out: ParsedQuery = [];
  for (const pair of raw.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      out.push([safeDecode(pair), ""]);
    } else {
      out.push([safeDecode(pair.slice(0, eq)), safeDecode(pair.slice(eq + 1))]);
    }
  }
  return out;
}

function serializeQuery(pairs: ParsedQuery): string {
  return pairs
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function getHeaderValue(
  headers: Record<string, string[]>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, values] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return values[0];
    }
  }
  return undefined;
}

function collectJsonStringPaths(value: unknown, prefix: string = ""): string[] {
  if (typeof value === "string") {
    return prefix === "" ? [] : [prefix];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    value.forEach((item, index) => {
      out.push(...collectJsonStringPaths(item, `${prefix}/${String(index)}`));
    });
    return out;
  }
  if (typeof value === "object" && value !== null) {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      out.push(...collectJsonStringPaths(v, `${prefix}/${k}`));
    }
    return out;
  }
  return [];
}

function setJsonPath(value: unknown, segments: string[], payload: string): unknown {
  if (segments.length === 0) return payload;
  const [head, ...rest] = segments;
  if (head === undefined) return value;
  if (Array.isArray(value)) {
    const index = Number.parseInt(head, 10);
    if (!Number.isFinite(index) || index < 0 || index >= value.length) return value;
    const copy = [...value];
    copy[index] = setJsonPath(copy[index], rest, payload);
    return copy;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (!(head in obj)) return value;
    return { ...obj, [head]: setJsonPath(obj[head], rest, payload) };
  }
  return value;
}

function jsonPathExists(value: unknown, segments: string[]): boolean {
  if (segments.length === 0) return typeof value === "string";
  const [head, ...rest] = segments;
  if (head === undefined) return false;
  if (Array.isArray(value)) {
    const index = Number.parseInt(head, 10);
    if (!Number.isFinite(index) || index < 0 || index >= value.length) return false;
    return jsonPathExists(value[index], rest);
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (!(head in obj)) return false;
    return jsonPathExists(obj[head], rest);
  }
  return false;
}

function rebuildUrl(originalUrl: string, newQuery: string): string {
  const questionIndex = originalUrl.indexOf("?");
  const base = questionIndex === -1 ? originalUrl : originalUrl.slice(0, questionIndex);
  return newQuery === "" ? base : `${base}?${newQuery}`;
}

function dedupePoints(points: ScannerInjectionPoint[]): ScannerInjectionPoint[] {
  const seen = new Set<string>();
  const out: ScannerInjectionPoint[] = [];
  for (const point of points) {
    const key = `${point.kind}:${point.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(point);
  }
  return out;
}

export function parseInjectionPointId(id: string): ScannerInjectionPoint | undefined {
  const sep = id.indexOf(":");
  if (sep <= 0) return undefined;
  const kindRaw = id.slice(0, sep);
  const name = id.slice(sep + 1);
  if (name === "") return undefined;
  if (kindRaw !== "query" && kindRaw !== "body" && kindRaw !== "header") return undefined;
  return { kind: kindRaw as ScannerInjectionPointKind, name };
}
