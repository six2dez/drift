import { describe, expect, it } from "vitest";
import { parseHttpRequest, rawHttpRequestToCurl, toCurl } from "./http-parse";

describe("parseHttpRequest", () => {
  it("parses a full GET request with headers and no body", () => {
    const raw = [
      "GET /api/users/123 HTTP/1.1",
      "Host: example.com",
      "Authorization: Bearer abc",
      "User-Agent: drift/test",
      "",
      "",
    ].join("\r\n");
    const parsed = parseHttpRequest(raw);
    expect(parsed).toEqual({
      method: "GET",
      pathOrUrl: "/api/users/123",
      httpVersion: "1.1",
      headers: [
        ["Host", "example.com"],
        ["Authorization", "Bearer abc"],
        ["User-Agent", "drift/test"],
      ],
      body: "",
    });
  });

  it("parses a POST request with a JSON body", () => {
    const raw = [
      "POST /api/login HTTP/1.1",
      "Host: example.com",
      "Content-Type: application/json",
      "Content-Length: 27",
      "",
      `{"user":"alice","pw":"hi"}`,
    ].join("\n");
    const parsed = parseHttpRequest(raw);
    expect(parsed?.method).toBe("POST");
    expect(parsed?.body).toBe(`{"user":"alice","pw":"hi"}`);
    expect(parsed?.headers).toContainEqual(["Content-Type", "application/json"]);
  });

  it("accepts the Caido fallback shape: METHOD ABSOLUTE_URL", () => {
    const raw = "GET https://example.com/api/ping\n";
    const parsed = parseHttpRequest(raw);
    expect(parsed).toEqual({
      method: "GET",
      pathOrUrl: "https://example.com/api/ping",
      httpVersion: undefined,
      headers: [],
      body: "",
    });
  });

  it("returns undefined for garbage that doesn't look like HTTP", () => {
    expect(parseHttpRequest("hello world")).toBeUndefined();
    expect(parseHttpRequest("")).toBeUndefined();
    expect(parseHttpRequest("GET")).toBeUndefined();
  });
});

describe("toCurl", () => {
  it("builds a curl one-liner for a GET without body", () => {
    const curl = toCurl({
      method: "GET",
      pathOrUrl: "/api/users/123",
      httpVersion: "1.1",
      headers: [
        ["Host", "example.com"],
        ["Authorization", "Bearer abc"],
      ],
      body: "",
    });
    expect(curl).toBe(
      "curl 'https://example.com/api/users/123' -H 'Authorization: Bearer abc'",
    );
  });

  it("uses -X for non-GET methods and --data-raw for bodies", () => {
    const curl = toCurl({
      method: "POST",
      pathOrUrl: "/api/login",
      httpVersion: "1.1",
      headers: [
        ["Host", "example.com"],
        ["Content-Type", "application/json"],
        ["Content-Length", "27"],
      ],
      body: `{"user":"alice"}`,
    });
    expect(curl).toBe(
      "curl -X POST 'https://example.com/api/login' -H 'Content-Type: application/json' --data-raw '{\"user\":\"alice\"}'",
    );
  });

  it("uses absolute URL when pathOrUrl is already absolute", () => {
    const curl = toCurl({
      method: "GET",
      pathOrUrl: "https://example.com/api/ping",
      httpVersion: undefined,
      headers: [],
      body: "",
    });
    expect(curl).toBe("curl 'https://example.com/api/ping'");
  });

  it("escapes single quotes in values", () => {
    const curl = toCurl({
      method: "POST",
      pathOrUrl: "/comment",
      httpVersion: "1.1",
      headers: [["Host", "example.com"]],
      body: "it's a body",
    });
    expect(curl).toContain("'it'\\''s a body'");
  });

  it("respects a custom scheme when provided", () => {
    const curl = toCurl(
      {
        method: "GET",
        pathOrUrl: "/api",
        httpVersion: "1.1",
        headers: [["Host", "localhost:8080"]],
        body: "",
      },
      { defaultScheme: "http" },
    );
    expect(curl).toBe("curl 'http://localhost:8080/api'");
  });

  it("returns undefined for a relative path without a Host header", () => {
    const curl = toCurl({
      method: "GET",
      pathOrUrl: "/api",
      httpVersion: "1.1",
      headers: [],
      body: "",
    });
    expect(curl).toBeUndefined();
  });
});

describe("rawHttpRequestToCurl", () => {
  it("end-to-end: raw HTTP text → curl string", () => {
    const raw = [
      "GET /search?q=hello HTTP/1.1",
      "Host: example.com",
      "Accept: application/json",
      "",
      "",
    ].join("\r\n");
    const curl = rawHttpRequestToCurl(raw);
    expect(curl).toBe(
      "curl 'https://example.com/search?q=hello' -H 'Accept: application/json'",
    );
  });
});
