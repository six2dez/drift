import { describe, expect, it } from "vitest";
import {
  buildMcpToolPolicy,
  buildMcpServerInfo,
  buildSelfTestResult,
  createEmptyCaidoContextOverride,
  createEmptyCaidoContextSnapshot,
  hasCaidoContextChanged,
  mergeCaidoContextSnapshot,
  parseMcpRuntimeContext,
  resolveEffectiveCaidoContext,
  serializeMcpRuntimeContext,
} from "./mcp-runtime";

describe("mcp-runtime", () => {
  it("merges and detects ui context changes", () => {
    const current = createEmptyCaidoContextSnapshot();
    const next = mergeCaidoContextSnapshot(current, {
      projectId: "project-1",
      filterName: "In scope",
      historyQuery: "status:200",
    });

    expect(next).toMatchObject({
      projectId: "project-1",
      filterName: "In scope",
      historyQuery: "status:200",
    });
    expect(hasCaidoContextChanged(current, next)).toBe(true);
    expect(hasCaidoContextChanged(next, next)).toBe(false);
  });

  it("parses legacy flat context files", () => {
    const context = parseMcpRuntimeContext(
      JSON.stringify({
        projectId: "project-flat",
        filterQuery: "status:500",
      }),
    );

    expect(context.uiContext.projectId).toBe("project-flat");
    expect(context.uiContext.filterQuery).toBe("status:500");
    expect(context.overrideContext.projectId).toBe("");
  });

  it("round-trips stored context with overrides", () => {
    const raw = serializeMcpRuntimeContext(
      {
        projectId: "project-ui",
        filterId: "f-1",
        filterName: "Interesting",
        filterQuery: "status:200",
        historyQuery: "host:api.local",
        historyScopeId: "scope-1",
      },
      {
        projectId: "project-override",
      },
    );

    expect(parseMcpRuntimeContext(raw)).toEqual({
      uiContext: {
        projectId: "project-ui",
        filterId: "f-1",
        filterName: "Interesting",
        filterQuery: "status:200",
        historyQuery: "host:api.local",
        historyScopeId: "scope-1",
      },
      overrideContext: {
        projectId: "project-override",
      },
    });
  });

  it("clears scope when a project override is active", () => {
    const effective = resolveEffectiveCaidoContext(
      {
        projectId: "project-ui",
        filterId: "f-1",
        filterName: "UI filter",
        filterQuery: "status:302",
        historyQuery: "host:example.com",
        historyScopeId: "scope-ui",
      },
      {
        projectId: "project-override",
      },
    );

    expect(effective.projectId).toBe("project-override");
    expect(effective.overrideActive).toBe(true);
    expect(effective.historyScopeId).toBe("");
    expect(effective.scopeSource).toBe("cleared-by-override");
  });

  it("builds filtered tool policies with confirmation only on sensitive tools", () => {
    const policy = buildMcpToolPolicy({
      enabledGroups: {
        read: true,
        replay: false,
        findings: true,
        environment: false,
        intercept: false,
        workflow: false,
      },
      confirmSensitiveActions: true,
    });

    expect(policy.allowedToolNames).toContain("search_history");
    expect(policy.allowedToolNames).toContain("create_finding");
    expect(policy.allowedToolNames).not.toContain("send_request");
    expect(policy.confirmationRequiredToolNames).toEqual(["create_finding"]);
  });

  it("builds self-test results and mcp status with effective context", () => {
    const selfTest = buildSelfTestResult({
      providerId: "claude-cli",
      startedAt: 100,
      finishedAt: 180,
      cliReady: true,
      cliMessage: "/usr/local/bin/claude",
      checks: [
        {
          name: "tools/list",
          label: "Tool discovery",
          ok: true,
          message: "18 tools",
          durationMs: 12,
        },
      ],
    });

    const status = buildMcpServerInfo({
      running: true,
      cleanupState: "pending",
      host: "127.0.0.1",
      port: 0,
      token: "",
      url: "stdio:///tmp/drift/mcp-server.mjs",
      authState: "valid",
      authSource: "session",
      authMessage: "",
      uiContext: {
        ...createEmptyCaidoContextSnapshot(),
        projectId: "ui-project",
        historyScopeId: "scope-1",
      },
      overrideContext: {
        ...createEmptyCaidoContextOverride(),
        projectId: "override-project",
      },
      selfTestResults: {
        "claude-cli": selfTest,
      },
    });

    expect(selfTest.state).toBe("passed");
    expect(selfTest.durationMs).toBe(80);
    expect(status.toolCount).toBeGreaterThan(14);
    expect(status.cleanupState).toBe("pending");
    expect(status.authSource).toBe("session");
    expect(status.effectiveContext.projectId).toBe("override-project");
    expect(status.effectiveContext.historyScopeId).toBe("");
    expect(status.selfTestResults["claude-cli"]?.state).toBe("passed");
  });
});
