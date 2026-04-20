export interface ParsedHttpRequest {
  method: string;
  // Either an absolute URL (when Caido's fallback shape is used) or an
  // origin-relative path (standard raw HTTP/1.1).
  pathOrUrl: string;
  httpVersion: string | undefined;
  headers: Array<[name: string, value: string]>;
  body: string;
}

// Parses the raw HTTP request shapes Drift captures:
//   1. Full raw:  "GET /path HTTP/1.1\nHost: x\n...\n\n<body>" — CRLF or LF.
//   2. Fallback:  "GET http://x/path\n<body>" — used when Caido SDK only
//      exposes getMethod/getUrl/getBody (no getRaw).
// Returns `undefined` when the input does not look like an HTTP request.
export function parseHttpRequest(raw: string): ParsedHttpRequest | undefined {
  const normalized = raw.replace(/\r\n/g, "\n").trimStart();
  const boundary = normalized.indexOf("\n\n");
  const head = boundary === -1 ? normalized : normalized.slice(0, boundary);
  const body = boundary === -1 ? "" : normalized.slice(boundary + 2);

  const lines = head.split("\n");
  const requestLine = lines[0]?.trim() ?? "";
  if (requestLine === "") return undefined;

  const fullMatch = /^([A-Z]+)\s+(\S+)\s+HTTP\/([\d.]+)$/.exec(requestLine);
  const shortMatch = /^([A-Z]+)\s+(\S+)$/.exec(requestLine);
  const match = fullMatch ?? shortMatch;
  if (match === null) return undefined;

  const method = match[1] ?? "";
  const pathOrUrl = match[2] ?? "";
  if (method === "" || pathOrUrl === "") return undefined;
  const httpVersion = fullMatch ? fullMatch[3] : undefined;

  const headers: Array<[string, string]> = [];
  if (fullMatch) {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key === "") continue;
      headers.push([key, value]);
    }
  }

  return { method, pathOrUrl, httpVersion, headers, body };
}

function shellQuote(value: string): string {
  // Wrap in single quotes; escape existing single quotes by closing, inserting
  // an escaped quote, and reopening — the standard POSIX shell trick.
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface ToCurlOptions {
  // Used only when the parsed request has a relative path + Host header.
  // Caido does not expose the scheme in its raw request shape, so we default
  // to https and let the user adjust if they were on plain http.
  defaultScheme?: "http" | "https";
}

export function toCurl(
  parsed: ParsedHttpRequest,
  options?: ToCurlOptions,
): string | undefined {
  const scheme = options?.defaultScheme ?? "https";

  let url: string;
  if (/^https?:\/\//i.test(parsed.pathOrUrl)) {
    url = parsed.pathOrUrl;
  } else {
    const host = parsed.headers.find(([k]) => k.toLowerCase() === "host")?.[1];
    if (host === undefined || host === "") return undefined;
    const pathPart = parsed.pathOrUrl.startsWith("/")
      ? parsed.pathOrUrl
      : `/${parsed.pathOrUrl}`;
    url = `${scheme}://${host}${pathPart}`;
  }

  const parts: string[] = ["curl"];
  if (parsed.method !== "GET") {
    parts.push("-X", parsed.method);
  }
  parts.push(shellQuote(url));
  for (const [key, value] of parsed.headers) {
    const k = key.toLowerCase();
    // curl rebuilds Host from the URL and Content-Length from the payload, so
    // keeping the originals would duplicate or misreport them.
    if (k === "host" || k === "content-length") continue;
    parts.push("-H", shellQuote(`${key}: ${value}`));
  }
  if (parsed.body.length > 0) {
    parts.push("--data-raw", shellQuote(parsed.body));
  }
  return parts.join(" ");
}

export function rawHttpRequestToCurl(
  raw: string,
  options?: ToCurlOptions,
): string | undefined {
  const parsed = parseHttpRequest(raw);
  if (parsed === undefined) return undefined;
  return toCurl(parsed, options);
}
