import { describe, expect, it } from "vitest";

import {
  buildMcpDriftVars,
  buildMcpServerSpec,
} from "./mcp-server-spec";

// Every input below is passed as a literal, which is the entire point of
// `mcp-server-spec.ts` being pure: the module reads no `process.env`, no `os`
// and no module-level singleton, so the whole spec contract — including the
// Windows-relevant parts — is provable on the Linux CI runner. The describe/it
// titles are a CONTRACT with 05-VALIDATION.md, which addresses each row by
// `-t "<name>"` — renaming one silently unhooks a requirement from its
// verification.

const PARENT_ENV: Record<string, string | undefined> = {
  PATH: "/usr/bin:/bin",
  SYSTEMROOT: "C:\\WINDOWS",
  DRIFT_TEST_PARENT_ONLY: "parent-value",
  DRIFT_TEST_UNDEFINED: undefined,
};

function makeDriftVars(): Record<string, string> {
  return buildMcpDriftVars({
    caidoUrl: "http://127.0.0.1:8080",
    caidoToken: "fixture-token",
    contextFilePath: "/tmp/drift-mcp-x/mcp-context.json",
    allowedToolNames: ["search_history", "get_environment"],
    confirmationRequiredToolNames: ["send_request"],
    confirmSensitiveActions: true,
    activityFilePath: "/tmp/drift-mcp-x/mcp-activity-s1.jsonl",
    approvalsFilePath: "/tmp/drift-mcp-x/mcp-approvals-s1.json",
  });
}

describe("buildMcpServerSpec", () => {
  it("returns the injected node executable as command and the script as the sole arg", () => {
    const spec = buildMcpServerSpec({
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      mcpScriptPath: "C:\\Temp\\drift-mcp-abc\\mcp-server.mjs",
      driftVars: makeDriftVars(),
      parentEnv: PARENT_ENV,
    });

    expect(spec.command).toBe("C:\\Program Files\\nodejs\\node.exe");
    expect(spec.args).toEqual(["C:\\Temp\\drift-mcp-abc\\mcp-server.mjs"]);
    // The config projection carries the drift dict, never the merged block.
    expect(spec.driftVars).toEqual(makeDriftVars());
  });

  it("merges the parent environment, and a drift key of the same name overrides it", () => {
    const spec = buildMcpServerSpec({
      nodeExecutable: "/usr/bin/node",
      mcpScriptPath: "/tmp/drift-mcp-abc/mcp-server.mjs",
      driftVars: { ...makeDriftVars(), PATH: "/drift/override/bin" },
      parentEnv: PARENT_ENV,
    });

    // The parent survives — this is the property finding L-4 makes
    // load-bearing, and the one a bare `env: driftVars` regression breaks
    // silently under LLRT while staying green here.
    expect(spec.env.DRIFT_TEST_PARENT_ONLY).toBe("parent-value");
    expect(spec.env.SYSTEMROOT).toBe("C:\\WINDOWS");
    // The drift value wins on a collision, and the parent value does not
    // survive alongside it.
    expect(spec.env.PATH).toBe("/drift/override/bin");
    expect(
      Object.keys(spec.env).filter((key) => key === "PATH"),
    ).toHaveLength(1);
    // An undefined parent value is dropped rather than stringified.
    expect(Object.keys(spec.env)).not.toContain("DRIFT_TEST_UNDEFINED");
  });
});

describe("buildMcpDriftVars", () => {
  it("carries every DRIFT_ key mcp-server.mjs reads, in the shipping insertion order", () => {
    // Order, not just membership: `JSON.stringify` walks insertion order, so
    // the Copilot config document's byte shape (a CMP-01 surface) depends on
    // this list matching `index.ts`'s `buildMcpRuntimeEnv` exactly.
    expect(Object.keys(makeDriftVars())).toEqual([
      "CAIDO_URL",
      "CAIDO_TOKEN",
      "DRIFT_CONTEXT_FILE",
      "DRIFT_ALLOWLIST_ACTIVE",
      "DRIFT_ALLOWED_TOOLS",
      "DRIFT_CONFIRMATION_REQUIRED_TOOLS",
      "DRIFT_CONFIRM_SENSITIVE_ACTIONS",
      "DRIFT_ACTIVITY_FILE",
      "DRIFT_APPROVALS_FILE",
    ]);
    // The fail-open guard, asserted by value: absent, `mcp-server.mjs:613`
    // hands out all 18 tools when the allowlist is empty.
    expect(makeDriftVars().DRIFT_ALLOWLIST_ACTIVE).toBe("1");
  });
});
