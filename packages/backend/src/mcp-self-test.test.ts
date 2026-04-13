import { describe, expect, it } from "vitest";
import {
  buildSelfTestResult,
  createIdleSelfTestResult,
} from "./mcp-runtime";

describe("mcp self-test shaping", () => {
  it("creates idle self-test results with the expected checks", () => {
    const result = createIdleSelfTestResult("claude-cli");

    expect(result.state).toBe("idle");
    expect(result.checks.map((check) => check.name)).toEqual([
      "tools/list",
      "get_environment",
      "search_history",
    ]);
  });

  it("passes only when cli readiness and all checks succeed", () => {
    const result = buildSelfTestResult({
      providerId: "claude-cli",
      startedAt: 100,
      finishedAt: 175,
      cliReady: true,
      cliMessage: "/usr/local/bin/claude",
      checks: [
        {
          name: "tools/list",
          label: "Tool discovery",
          ok: true,
          message: "18 tools discovered",
          durationMs: 10,
        },
        {
          name: "get_environment",
          label: "Environment read",
          ok: true,
          message: "[]",
          durationMs: 12,
        },
      ],
    });

    expect(result.state).toBe("passed");
    expect(result.durationMs).toBe(75);
  });

  it("fails when the provider cli is unavailable", () => {
    const result = buildSelfTestResult({
      providerId: "copilot-cli",
      startedAt: 50,
      finishedAt: 90,
      cliReady: false,
      cliMessage: "\"copilot\" not found in PATH",
      checks: [
        {
          name: "tools/list",
          label: "Tool discovery",
          ok: true,
          message: "18 tools discovered",
          durationMs: 8,
        },
      ],
      error: "\"copilot\" not found in PATH",
    });

    expect(result.state).toBe("failed");
    expect(result.error).toContain("copilot");
  });

  it("fails when a tool call fails even if the cli is available", () => {
    const result = buildSelfTestResult({
      providerId: "gemini-cli",
      startedAt: 1,
      finishedAt: 21,
      cliReady: true,
      cliMessage: "/usr/local/bin/gemini",
      checks: [
        {
          name: "tools/list",
          label: "Tool discovery",
          ok: true,
          message: "18 tools discovered",
          durationMs: 4,
        },
        {
          name: "search_history",
          label: "History search",
          ok: false,
          message: "AUTHORIZATION/INVALID_TOKEN",
          durationMs: 6,
        },
      ],
      error: "search_history: AUTHORIZATION/INVALID_TOKEN",
    });

    expect(result.state).toBe("failed");
    expect(result.error).toContain("search_history");
  });
});
