import { describe, expect, it, vi } from "vitest";
import {
  analyzeErrorSqli,
  analyzeLfi,
  analyzeOpenRedirect,
  analyzeReflectedXss,
  analyzeResponse,
  analyzeSsti,
  type ResponseAnalyzerInput,
} from "./response-analyzer";
import {
  GENERIC_NOISE_TITLE_PATTERNS,
  OTHER_ONLY_NOISE_PATTERNS,
  buildActivePlanPrompt,
  buildPassivePrompt,
  parsePassiveVerdict,
  redactBody,
  redactRequest,
  redactResponse,
  redactUrl,
} from "./scanner-prompts";
import {
  extractInjectionPoints,
  mutateFormBody,
  mutateHeaderValue,
  mutateJsonBody,
  mutateQueryParam,
  parseInjectionPointId,
} from "./injection-points";
import { createScannerQueue } from "./scanner-queue";
import {
  DEFAULT_SCANNER_SETTINGS,
  migrateScannerSettings,
  type ScannerVulnerabilityClass,
} from "shared";

function makeAnalyzerInput(
  overrides: Partial<ResponseAnalyzerInput>,
): ResponseAnalyzerInput {
  return {
    className: "reflected-xss",
    payload: "",
    marker: "drift-marker1",
    response: { statusCode: 200, headers: {}, body: "" },
    ...overrides,
  };
}

// ── response-analyzer ─────────────────────────────────────────────

describe("response analyzer — reflected XSS", () => {
  it("confirms when payload with dangerous context is reflected verbatim", () => {
    const result = analyzeReflectedXss(
      makeAnalyzerInput({
        payload: `"><svg/onload=alert(1)>`,
        response: {
          statusCode: 200,
          headers: {},
          body: `<html><p>query="><svg/onload=alert(1)></p></html>`,
        },
      }),
    );
    expect(result.verdict).toBe("confirmed");
    expect(result.evidence).toContain("svg/onload");
  });

  it("downgrades to suspicious when only the marker reflects", () => {
    const result = analyzeReflectedXss(
      makeAnalyzerInput({
        payload: `<svg>`,
        marker: "drift-canary-42",
        response: {
          statusCode: 200,
          headers: {},
          body: `hello drift-canary-42 world`,
        },
      }),
    );
    expect(result.verdict).toBe("suspicious");
  });

  it("returns negative when payload is escaped", () => {
    const result = analyzeReflectedXss(
      makeAnalyzerInput({
        payload: `<svg>`,
        marker: "drift-canary-1",
        response: {
          statusCode: 200,
          headers: {},
          body: `hello &lt;svg&gt; world`,
        },
      }),
    );
    expect(result.verdict).toBe("negative");
  });
});

describe("response analyzer — error SQLi", () => {
  it("confirms on MySQL error signature", () => {
    const result = analyzeErrorSqli(
      makeAnalyzerInput({
        className: "error-sqli",
        response: {
          statusCode: 500,
          headers: {},
          body: `You have an error in your SQL syntax; check the manual`,
        },
      }),
    );
    expect(result.verdict).toBe("confirmed");
  });

  it("confirms on PostgreSQL error signature", () => {
    const result = analyzeErrorSqli(
      makeAnalyzerInput({
        className: "error-sqli",
        response: {
          statusCode: 500,
          headers: {},
          body: `PostgreSQL.*ERROR: syntax error at or near`,
        },
      }),
    );
    expect(result.verdict).toBe("confirmed");
  });

  it("returns negative on generic error text", () => {
    const result = analyzeErrorSqli(
      makeAnalyzerInput({
        className: "error-sqli",
        response: {
          statusCode: 500,
          headers: {},
          body: `An internal error occurred. Please try again later.`,
        },
      }),
    );
    expect(result.verdict).toBe("negative");
  });
});

describe("response analyzer — LFI", () => {
  it("confirms when /etc/passwd content is returned", () => {
    const result = analyzeLfi(
      makeAnalyzerInput({
        className: "lfi",
        response: {
          statusCode: 200,
          headers: {},
          body: `root:x:0:0:root:/root:/bin/bash\nbin:x:1:1:bin:/bin:/sbin/nologin`,
        },
      }),
    );
    expect(result.verdict).toBe("confirmed");
  });

  it("returns negative on generic directory listing", () => {
    const result = analyzeLfi(
      makeAnalyzerInput({
        className: "lfi",
        response: {
          statusCode: 200,
          headers: {},
          body: `index.html\nstyles.css`,
        },
      }),
    );
    expect(result.verdict).toBe("negative");
  });
});

describe("response analyzer — SSTI", () => {
  it("confirms when {{7*7}} evaluates to 49", () => {
    const result = analyzeSsti(
      makeAnalyzerInput({
        className: "ssti",
        payload: `{{7*7}}`,
        response: { statusCode: 200, headers: {}, body: `hello 49 world` },
      }),
    );
    expect(result.verdict).toBe("confirmed");
  });

  it("is negative when template is echoed literally", () => {
    const result = analyzeSsti(
      makeAnalyzerInput({
        className: "ssti",
        payload: `{{7*7}}`,
        response: { statusCode: 200, headers: {}, body: `hello {{7*7}} world` },
      }),
    );
    expect(result.verdict).toBe("negative");
  });

  it("is negative without a recognisable probe", () => {
    const result = analyzeSsti(
      makeAnalyzerInput({
        className: "ssti",
        payload: `hello`,
        response: { statusCode: 200, headers: {}, body: `hello` },
      }),
    );
    expect(result.verdict).toBe("negative");
  });
});

describe("response analyzer — open redirect", () => {
  it("confirms when Location header starts with attacker input", () => {
    const result = analyzeOpenRedirect(
      makeAnalyzerInput({
        className: "open-redirect",
        payload: `https://drift-scanner.invalid/`,
        response: {
          statusCode: 302,
          headers: { Location: ["https://drift-scanner.invalid/foo"] },
          body: "",
        },
      }),
    );
    expect(result.verdict).toBe("confirmed");
  });

  it("is suspicious when payload appears inside but not as prefix", () => {
    const result = analyzeOpenRedirect(
      makeAnalyzerInput({
        className: "open-redirect",
        payload: `https://drift-scanner.invalid/`,
        response: {
          statusCode: 302,
          headers: {
            Location: ["https://legit.com?next=https://drift-scanner.invalid/"],
          },
          body: "",
        },
      }),
    );
    expect(result.verdict).toBe("suspicious");
  });

  it("is negative on 200 with no redirect surface", () => {
    const result = analyzeOpenRedirect(
      makeAnalyzerInput({
        className: "open-redirect",
        payload: `https://drift-scanner.invalid/`,
        response: { statusCode: 200, headers: {}, body: "no redirect here" },
      }),
    );
    expect(result.verdict).toBe("negative");
  });
});

describe("response analyzer — dispatch", () => {
  it("other class is always negative", () => {
    const result = analyzeResponse(
      makeAnalyzerInput({ className: "other" }),
    );
    expect(result.verdict).toBe("negative");
  });
});

// ── scanner-prompts / parser ──────────────────────────────────────

describe("parsePassiveVerdict", () => {
  const threshold = "medium" as const;

  it("accepts a well-formed verdict for a concrete class", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "error-sqli",
      title: "MySQL error leak on /api/search",
      severity: "high",
      confidence: "high",
      description: "The response body contained a raw MySQL syntax error exposing query internals to anyone.",
      evidence: "You have an error in your SQL syntax",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(true);
    if (verdict.accepted) {
      expect(verdict.className).toBe("error-sqli");
      expect(verdict.confidence).toBe("high");
    }
  });

  it("rejects malformed json", () => {
    const verdict = parsePassiveVerdict({
      raw: "not a json",
      confidenceThreshold: threshold,
    });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects when vulnerable=false", () => {
    const verdict = parsePassiveVerdict({
      raw: JSON.stringify({ vulnerable: false }),
      confidenceThreshold: threshold,
    });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects when confidence is below threshold", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "error-sqli",
      title: "Something",
      severity: "medium",
      confidence: "low",
      description: "Some description here that is longer than forty characters easily.",
      evidence: "PostgreSQL.*ERROR",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects when evidence is empty", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "error-sqli",
      title: "Something",
      severity: "medium",
      confidence: "high",
      description: "Some description here that is longer than forty characters easily.",
      evidence: "",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects when title matches a generic-noise blacklist phrase", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "error-sqli",
      title: "Missing security header",
      severity: "medium",
      confidence: "high",
      description: "Some description here that is longer than forty characters easily.",
      evidence: "No X-Frame-Options",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects className=other with confidence=medium", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "other",
      title: "Weird auth flow behaviour observed",
      severity: "medium",
      confidence: "medium",
      description: "An unusually lenient auth flow that may allow session fixation or replay.",
      evidence: "Cookie accepted before login",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects className=other with short evidence", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "other",
      title: "Weird auth flow",
      severity: "high",
      confidence: "high",
      description: "An unusually lenient auth flow that may allow session fixation or replay.",
      evidence: "short",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects className=other with a 'information disclosure' title", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "other",
      title: "Information disclosure in stack trace",
      severity: "high",
      confidence: "high",
      description: "A long enough description that beats the forty character minimum for other.",
      evidence: "Full stack trace leaked in body",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(false);
  });

  it("accepts className=other under strict rules", () => {
    const raw = JSON.stringify({
      vulnerable: true,
      className: "other",
      title: "Auth bypass via trailing slash",
      severity: "high",
      confidence: "high",
      description: "The protected handler compares paths exactly and a trailing slash bypasses the check.",
      evidence: "200 OK returned on /admin/ while /admin is 401",
    });
    const verdict = parsePassiveVerdict({ raw, confidenceThreshold: threshold });
    expect(verdict.accepted).toBe(true);
  });
});

describe("generic-noise title blacklist", () => {
  it("matches each documented phrase", () => {
    const hits = [
      "Missing security header",
      "missing-header",
      "Verbose error leaking internals",
      "possible vuln",
      "Possible Vulnerability found",
      "Weak password policy",
    ];
    for (const title of hits) {
      const matched = GENERIC_NOISE_TITLE_PATTERNS.some((p) => p.test(title));
      expect(matched, `should match ${title}`).toBe(true);
    }
  });

  it("other-only blacklist matches the extra phrases", () => {
    const hits = ["Information disclosure in error", "Insecure cookie flags"];
    for (const title of hits) {
      const matched = OTHER_ONLY_NOISE_PATTERNS.some((p) => p.test(title));
      expect(matched, `should match ${title}`).toBe(true);
    }
  });
});

// ── redaction ─────────────────────────────────────────────────────

describe("redaction", () => {
  it("strips sensitive headers when enabled", () => {
    const redacted = redactRequest(
      {
        method: "GET",
        url: "https://example.test/",
        headers: {
          Host: ["example.test"],
          Authorization: ["Bearer secret123"],
          Cookie: ["session=abc"],
        },
        body: "",
      },
      true,
    );
    expect(redacted.headers["Authorization"]?.[0]).toBe("[redacted]");
    expect(redacted.headers["Cookie"]?.[0]).toBe("[redacted]");
    expect(redacted.headers["Host"]?.[0]).toBe("example.test");
  });

  it("leaves headers alone when disabled", () => {
    const redacted = redactResponse(
      {
        statusCode: 200,
        headers: { "Set-Cookie": ["session=abc"] },
        body: "",
      },
      false,
    );
    expect(redacted.headers["Set-Cookie"]?.[0]).toBe("session=abc");
  });

  it("redacts sensitive query string values but keeps the rest", () => {
    const url = "https://example.test/api?q=hello&api_key=SECRET&lang=en";
    const redacted = redactUrl(url);
    expect(redacted).toContain("api_key=[redacted]");
    expect(redacted).toContain("q=hello");
    expect(redacted).toContain("lang=en");
    expect(redacted).not.toContain("SECRET");
  });

  it("handles url with fragment", () => {
    const url = "https://example.test/api?token=abc123#/route";
    const redacted = redactUrl(url);
    expect(redacted).toContain("token=[redacted]");
    expect(redacted.endsWith("#/route")).toBe(true);
  });

  it("handles url with no query string", () => {
    expect(redactUrl("https://example.test/plain")).toBe("https://example.test/plain");
  });

  it("redacts sensitive form body fields", () => {
    const body = "user=alice&password=hunter2&lang=en";
    const out = redactBody(body, "application/x-www-form-urlencoded");
    expect(out).toContain("password=[redacted]");
    expect(out).toContain("user=alice");
    expect(out).not.toContain("hunter2");
  });

  it("redacts sensitive JSON body string leaves", () => {
    const body = JSON.stringify({
      user: { name: "alice", password: "hunter2", api_key: "SECRET" },
      query: "hello",
    });
    const out = redactBody(body, "application/json");
    const parsed = JSON.parse(out);
    expect(parsed.user.password).toBe("[redacted]");
    expect(parsed.user.api_key).toBe("[redacted]");
    expect(parsed.user.name).toBe("alice");
    expect(parsed.query).toBe("hello");
  });

  it("leaves non-text body content types intact", () => {
    const body = "binaryish-data-with-password-in-it";
    expect(redactBody(body, "application/octet-stream")).toBe(body);
    expect(redactBody(body, "image/png")).toBe(body);
  });

  it("redactRequest applies url + body redaction when enabled", () => {
    const redacted = redactRequest(
      {
        method: "POST",
        url: "https://example.test/login?api_key=SECRET",
        headers: {
          "Content-Type": ["application/x-www-form-urlencoded"],
          Authorization: ["Bearer xyz"],
        },
        body: "user=alice&password=hunter2",
      },
      true,
    );
    expect(redacted.url).toContain("api_key=[redacted]");
    expect(redacted.body).toContain("password=[redacted]");
    expect(redacted.body).toContain("user=alice");
    expect(redacted.headers["Authorization"]?.[0]).toBe("[redacted]");
  });
});

// ── prompts smoke ──────────────────────────────────────────────────

describe("prompt builders", () => {
  it("passive prompt contains both sections and valid JSON schema preamble", () => {
    const prompt = buildPassivePrompt({
      request: { method: "GET", url: "https://example.test/", headers: {}, body: "" },
      response: { statusCode: 200, headers: {}, body: "" },
      settings: { ...DEFAULT_SCANNER_SETTINGS },
    });
    expect(prompt).toContain("=== REQUEST ===");
    expect(prompt).toContain("=== RESPONSE ===");
    expect(prompt).toContain("vulnerable");
    expect(prompt).toContain("Return ONLY a single JSON object");
  });

  it("active plan prompt lists the five confirmable classes and the discovered injection points", () => {
    const classes: ScannerVulnerabilityClass[] = [
      "reflected-xss",
      "error-sqli",
      "lfi",
      "ssti",
      "open-redirect",
    ];
    const prompt = buildActivePlanPrompt({
      request: { method: "POST", url: "https://example.test/login", headers: {}, body: "" },
      classes,
      injectionPoints: [
        { kind: "query", name: "q" },
        { kind: "body", name: "user" },
        { kind: "header", name: "Referer" },
      ],
      maxPayloads: 5,
      settings: { ...DEFAULT_SCANNER_SETTINGS },
    });
    for (const c of classes) {
      expect(prompt).toContain(c);
    }
    expect(prompt).toContain("injectionPoint");
    expect(prompt).toContain("marker");
    // The discovered points must appear verbatim in the prompt.
    expect(prompt).toContain("query:q");
    expect(prompt).toContain("body:user");
    expect(prompt).toContain("header:Referer");
    // And the prompt must explicitly instruct the model to stay in
    // the allowlist.
    expect(prompt).toContain("INJECTION POINTS");
    expect(prompt).toContain("dropped by Drift");
  });
});

// ── injection points ──────────────────────────────────────────────

describe("injection points", () => {
  it("extracts query params", () => {
    const points = extractInjectionPoints({
      method: "GET",
      url: "https://example.test/search?q=hi&lang=en",
      headers: {},
      body: "",
      host: "example.test",
      path: "/search",
      query: "q=hi&lang=en",
    });
    expect(points).toContainEqual({ kind: "query", name: "q" });
    expect(points).toContainEqual({ kind: "query", name: "lang" });
  });

  it("extracts body form params", () => {
    const points = extractInjectionPoints({
      method: "POST",
      url: "https://example.test/login",
      headers: { "content-type": ["application/x-www-form-urlencoded"] },
      body: "user=alice&pass=wonderland",
      host: "example.test",
      path: "/login",
      query: "",
    });
    expect(points).toContainEqual({ kind: "body", name: "user" });
    expect(points).toContainEqual({ kind: "body", name: "pass" });
  });

  it("extracts JSON leaf paths", () => {
    const points = extractInjectionPoints({
      method: "POST",
      url: "https://example.test/api",
      headers: { "content-type": ["application/json"] },
      body: JSON.stringify({ user: { name: "alice", age: 30 }, tags: ["x", "y"] }),
      host: "example.test",
      path: "/api",
      query: "",
    });
    expect(points.some((p) => p.kind === "body" && p.name === "/user/name")).toBe(true);
    expect(points.some((p) => p.kind === "body" && p.name === "/tags/0")).toBe(true);
  });

  it("mutates a query param without touching others", () => {
    const result = mutateQueryParam(
      {
        method: "GET",
        url: "https://example.test/search?q=hi&lang=en",
        headers: {},
        body: "",
        host: "example.test",
        path: "/search",
        query: "q=hi&lang=en",
      },
      "q",
      `"><svg>`,
    );
    expect(result).toBeDefined();
    expect(result?.query).toContain("q=%22%3E%3Csvg%3E");
    expect(result?.query).toContain("lang=en");
    expect(result?.url.startsWith("https://example.test/search?")).toBe(true);
  });

  it("mutateQueryParam returns undefined when the param does not exist", () => {
    const result = mutateQueryParam(
      {
        method: "GET",
        url: "https://example.test/search?q=hi",
        headers: {},
        body: "",
        host: "example.test",
        path: "/search",
        query: "q=hi",
      },
      "nonexistent",
      "payload",
    );
    expect(result).toBeUndefined();
  });

  it("mutates a form body param", () => {
    const body = mutateFormBody("user=alice&pass=foo", "pass", "' OR 1=1--");
    expect(body).toBeDefined();
    // encodeURIComponent does NOT escape the apostrophe character.
    expect(body).toContain("pass='%20OR%201%3D1--");
    expect(body).toContain("user=alice");
  });

  it("mutateFormBody returns undefined when the field does not exist", () => {
    expect(mutateFormBody("user=alice&pass=foo", "nonexistent", "payload")).toBeUndefined();
  });

  it("mutates a JSON leaf at a slash path", () => {
    const body = mutateJsonBody(
      JSON.stringify({ user: { name: "alice" } }),
      "/user/name",
      "bob",
    );
    expect(body).toBeDefined();
    expect(JSON.parse(body!)).toEqual({ user: { name: "bob" } });
  });

  it("mutateJsonBody returns undefined when the path does not exist", () => {
    expect(
      mutateJsonBody(
        JSON.stringify({ user: { name: "alice" } }),
        "/user/email",
        "bob@example",
      ),
    ).toBeUndefined();
  });

  it("mutateJsonBody returns undefined when the path resolves to a non-string leaf", () => {
    expect(
      mutateJsonBody(
        JSON.stringify({ user: { age: 30 } }),
        "/user/age",
        "payload",
      ),
    ).toBeUndefined();
  });

  it("mutateJsonBody returns undefined on malformed JSON", () => {
    expect(mutateJsonBody("not a json", "/x", "payload")).toBeUndefined();
  });

  it("mutates a header value", () => {
    const out = mutateHeaderValue(
      { Referer: ["https://legit.test/"] },
      "Referer",
      "https://drift-scanner.invalid/",
    );
    expect(out).toBeDefined();
    expect(out?.Referer).toEqual(["https://drift-scanner.invalid/"]);
  });

  it("mutateHeaderValue returns undefined when the header does not exist", () => {
    expect(
      mutateHeaderValue({ Referer: ["https://legit.test/"] }, "X-NonExistent", "payload"),
    ).toBeUndefined();
  });

  it("parses injection point ids", () => {
    expect(parseInjectionPointId("query:q")).toEqual({ kind: "query", name: "q" });
    expect(parseInjectionPointId("body:/user/name")).toEqual({
      kind: "body",
      name: "/user/name",
    });
    expect(parseInjectionPointId("header:Referer")).toEqual({
      kind: "header",
      name: "Referer",
    });
    expect(parseInjectionPointId("bad")).toBeUndefined();
    expect(parseInjectionPointId("mystery:x")).toBeUndefined();
  });
});

// ── scanner queue ─────────────────────────────────────────────────

describe("scanner queue", () => {
  function makeJob(
    kind: "passive" | "active",
    host: string,
    handler: (ctx: { emitFinding: Function; reportError: Function; markAnalyzed: Function; reportProviderMissing: Function }) => Promise<void>,
  ) {
    const jobId = `job-${Math.random().toString(36).slice(2, 8)}`;
    if (kind === "passive") {
      return {
        jobId,
        kind: "passive" as const,
        enqueuedAt: Date.now(),
        host,
        requestId: "req-1",
        handler: handler as (ctx: any) => Promise<void>,
      };
    }
    return {
      jobId,
      kind: "active" as const,
      enqueuedAt: Date.now(),
      host,
      requestId: "req-1",
      handler: handler as (ctx: any) => Promise<void>,
      onResolve: () => {},
      onReject: () => {},
    };
  }

  it("processes an enqueued job", async () => {
    const queue = createScannerQueue(
      {
        onStatusChanged: () => {},
        onFinding: () => {},
        initialStatus: { passiveEnabled: true, activeEnabled: false, frontendEngaged: true },
      },
      { maxConcurrent: 1, maxPerMinute: 10, maxPerHostPerMinute: 5 },
    );
    const ran = vi.fn().mockResolvedValue(undefined);
    const result = queue.enqueue(makeJob("passive", "example.test", ran));
    expect(result.accepted).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toHaveBeenCalled();
  });

  it("rejects enqueues when the global per-minute budget is exhausted", () => {
    const queue = createScannerQueue(
      {
        onStatusChanged: () => {},
        onFinding: () => {},
        initialStatus: { passiveEnabled: true, activeEnabled: false, frontendEngaged: true },
      },
      { maxConcurrent: 1, maxPerMinute: 2, maxPerHostPerMinute: 5 },
    );
    const noop = vi.fn().mockResolvedValue(undefined);
    queue.enqueue(makeJob("passive", "a.test", noop));
    queue.enqueue(makeJob("passive", "b.test", noop));
    const third = queue.enqueue(makeJob("passive", "c.test", noop));
    expect(third.accepted).toBe(false);
    if (!third.accepted) {
      expect(third.reason).toContain("global rate limit");
    }
  });

  it("rejects enqueues when the per-host budget is exhausted", () => {
    const queue = createScannerQueue(
      {
        onStatusChanged: () => {},
        onFinding: () => {},
        initialStatus: { passiveEnabled: true, activeEnabled: false, frontendEngaged: true },
      },
      { maxConcurrent: 1, maxPerMinute: 50, maxPerHostPerMinute: 2 },
    );
    const noop = vi.fn().mockResolvedValue(undefined);
    queue.enqueue(makeJob("passive", "a.test", noop));
    queue.enqueue(makeJob("passive", "a.test", noop));
    const third = queue.enqueue(makeJob("passive", "a.test", noop));
    expect(third.accepted).toBe(false);
    if (!third.accepted) {
      expect(third.reason).toContain("per-host rate limit");
    }
  });

  it("recordInvalidVerdict bumps the invalidVerdicts counter", () => {
    let lastStatus: any = null;
    const queue = createScannerQueue(
      {
        onStatusChanged: (s) => { lastStatus = s; },
        onFinding: () => {},
        initialStatus: { passiveEnabled: true, activeEnabled: false, frontendEngaged: true },
      },
      { maxConcurrent: 1, maxPerMinute: 10, maxPerHostPerMinute: 5 },
    );
    expect(queue.getStatus().invalidVerdicts).toBe(0);
    queue.recordInvalidVerdict("malformed json");
    expect(queue.getStatus().invalidVerdicts).toBe(1);
    expect(lastStatus.invalidVerdicts).toBe(1);
    queue.recordInvalidVerdict("low confidence");
    expect(queue.getStatus().invalidVerdicts).toBe(2);
  });

  it("enters provider cooldown and rejects subsequent enqueues without spawning", async () => {
    const queue = createScannerQueue(
      {
        onStatusChanged: () => {},
        onFinding: () => {},
        initialStatus: { passiveEnabled: true, activeEnabled: false, frontendEngaged: true },
      },
      { maxConcurrent: 1, maxPerMinute: 50, maxPerHostPerMinute: 50 },
    );
    const first = vi.fn().mockImplementation(async (ctx: any) => {
      ctx.reportProviderMissing("Claude Code binary not found.");
    });
    queue.enqueue(makeJob("passive", "a.test", first));
    await new Promise((r) => setTimeout(r, 10));

    const second = vi.fn().mockResolvedValue(undefined);
    const secondResult = queue.enqueue(makeJob("passive", "a.test", second));
    expect(secondResult.accepted).toBe(false);
    if (!secondResult.accepted) {
      expect(secondResult.reason).toContain("Claude Code unavailable");
    }
    expect(second).not.toHaveBeenCalled();
  });
});

// ── scanner settings migration ────────────────────────────────────

describe("migrateScannerSettings", () => {
  it("returns defaults when passed undefined", () => {
    const result = migrateScannerSettings(undefined);
    expect(result).toEqual(DEFAULT_SCANNER_SETTINGS);
  });

  it("returns defaults when passed a non-object", () => {
    expect(migrateScannerSettings("junk")).toEqual(DEFAULT_SCANNER_SETTINGS);
    expect(migrateScannerSettings(42)).toEqual(DEFAULT_SCANNER_SETTINGS);
    expect(migrateScannerSettings(null)).toEqual(DEFAULT_SCANNER_SETTINGS);
  });

  it("renames activeTimeoutSeconds to jobTimeoutSeconds", () => {
    const result = migrateScannerSettings({
      activeTimeoutSeconds: 90,
    });
    expect(result.jobTimeoutSeconds).toBe(90);
    // Does not leak the old field.
    expect((result as Record<string, unknown>).activeTimeoutSeconds).toBeUndefined();
  });

  it("prefers jobTimeoutSeconds when both old and new fields coexist", () => {
    const result = migrateScannerSettings({
      activeTimeoutSeconds: 90,
      jobTimeoutSeconds: 60,
    });
    expect(result.jobTimeoutSeconds).toBe(60);
  });

  it("drops the legacy providerId field entirely", () => {
    const result = migrateScannerSettings({
      providerId: "gemini-cli",
      passiveEnabled: true,
    });
    expect((result as Record<string, unknown>).providerId).toBeUndefined();
    expect(result.passiveEnabled).toBe(true);
  });

  it("preserves all other known fields verbatim", () => {
    const result = migrateScannerSettings({
      passiveEnabled: true,
      activeEnabled: true,
      maxPerMinute: 50,
      confidenceThreshold: "high",
      redactionEnabled: false,
    });
    expect(result.passiveEnabled).toBe(true);
    expect(result.activeEnabled).toBe(true);
    expect(result.maxPerMinute).toBe(50);
    expect(result.confidenceThreshold).toBe("high");
    expect(result.redactionEnabled).toBe(false);
    // Untouched fields keep their defaults.
    expect(result.maxConcurrent).toBe(DEFAULT_SCANNER_SETTINGS.maxConcurrent);
  });
});
