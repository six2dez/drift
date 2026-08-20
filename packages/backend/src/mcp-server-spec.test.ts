import { describe, expect, it } from "vitest";

import {
  buildMcpDriftVars,
  buildMcpServerSpec,
  findExpandableEnvKeys,
  formatSpawnDebugLine,
  planMcpCliRegistration,
  toMcpConfigDocument,
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

describe("toMcpConfigDocument", () => {
  it("is one spec, two callers — Claude and Copilot receive deeply equal documents", () => {
    const spec = buildMcpServerSpec({
      nodeExecutable: "/usr/bin/node",
      mcpScriptPath: "/tmp/drift-mcp-abc/mcp-server.mjs",
      driftVars: makeDriftVars(),
      parentEnv: PARENT_ENV,
    });

    const claude = toMcpConfigDocument(spec);
    const copilot = toMcpConfigDocument(spec);

    expect(claude).toEqual(copilot);
    expect(claude.mcpServers.drift.command).toBe("/usr/bin/node");
    expect(claude.mcpServers.drift.args).toEqual([
      "/tmp/drift-mcp-abc/mcp-server.mjs",
    ]);
    expect(claude.mcpServers.drift.env).toEqual(makeDriftVars());
  });

  it("carries the drift dict and NOT the parent-merged block into the config file", () => {
    // T-05-04. The spawn path merges; the config path must not. A parent key
    // reaching this document would put the user's whole environment into a
    // token-bearing JSON file on disk.
    const spec = buildMcpServerSpec({
      nodeExecutable: "/usr/bin/node",
      mcpScriptPath: "/tmp/drift-mcp-abc/mcp-server.mjs",
      driftVars: makeDriftVars(),
      parentEnv: PARENT_ENV,
    });

    expect(spec.env.DRIFT_TEST_PARENT_ONLY).toBe("parent-value");
    expect(
      Object.keys(toMcpConfigDocument(spec).mcpServers.drift.env),
    ).not.toContain("DRIFT_TEST_PARENT_ONLY");
  });
});

describe("planMcpCliRegistration", () => {
  it("makes the shared wrapper path unreachable on win32, before wrapperPath is even considered", () => {
    for (const cli of ["gemini", "codex"] as const) {
      expect(
        planMcpCliRegistration({
          platform: "win32",
          cli,
          wrapperPath: "/anything",
        }).kind,
      ).toBe("Skip");
    }
  });

  it("skip reason names Phase 7 and the provider, verbatim", () => {
    const gemini = planMcpCliRegistration({
      platform: "win32",
      cli: "gemini",
      wrapperPath: "/anything",
    });
    const codex = planMcpCliRegistration({
      platform: "win32",
      cli: "codex",
      wrapperPath: "/anything",
    });

    // `toBe` on the whole sentence, not `toContain` on a fragment: D-03's point
    // is that a Windows user reads "not yet supported ... (Phase 7)" and learns
    // this is sequenced work rather than a dead end, and a fragment match would
    // let the sentence rot around the fragment.
    expect(gemini.kind === "Skip" ? gemini.reason : "").toBe(
      "Drift MCP is not yet supported for Gemini on Windows (Phase 7).",
    );
    expect(codex.kind === "Skip" ? codex.reason : "").toBe(
      "Drift MCP is not yet supported for Codex on Windows (Phase 7).",
    );
  });

  it("registers on darwin and linux when the shared wrapper exists", () => {
    for (const platform of ["darwin", "linux"] as const) {
      expect(
        planMcpCliRegistration({
          platform,
          cli: "gemini",
          wrapperPath: "/tmp/drift-mcp-abc/mcp-wrapper.sh",
        }),
      ).toEqual({
        kind: "Register",
        wrapperPath: "/tmp/drift-mcp-abc/mcp-wrapper.sh",
      });
    }
  });

  it("skips with a stated reason when the shared wrapper was not written", () => {
    const result = planMcpCliRegistration({
      platform: "linux",
      cli: "codex",
      wrapperPath: undefined,
    });
    expect(result.kind).toBe("Skip");
    expect(result.kind === "Skip" ? result.reason : "").toContain(
      "shared MCP wrapper",
    );
  });

  it("fails closed on an unknown platform rather than falling through to the POSIX arm", () => {
    const result = planMcpCliRegistration({
      platform: undefined,
      cli: "gemini",
      wrapperPath: "/tmp/drift-mcp-abc/mcp-wrapper.sh",
    });
    expect(result.kind).toBe("Skip");
    expect(result.kind === "Skip" ? result.reason : "").toContain(
      "host platform",
    );
  });
});

describe("formatSpawnDebugLine", () => {
  it("never logs an env value — it takes key NAMES and renders them sorted", () => {
    const fixtureToken = "eyJhbGciOiJIUzI1NiJ9.super-secret-caido-token";
    const line = formatSpawnDebugLine({
      command: "/usr/bin/node",
      args: ["/tmp/drift-mcp-abc/mcp-server.mjs"],
      injectedKeys: ["DRIFT_ALLOWED_TOOLS", "CAIDO_TOKEN"],
    });

    // The falsifiability partner: the token's KEY is in the line, its VALUE
    // cannot be — the function has no parameter through which a value could
    // arrive. That is the design (D-11 / T-04-04), not a discipline.
    expect(line).not.toContain(fixtureToken);
    expect(line).toContain("CAIDO_TOKEN");
    expect(line).toContain("DRIFT_ALLOWED_TOOLS");
    // Sorted, so the rendered line is stable across runs.
    expect(line).toContain("CAIDO_TOKEN,DRIFT_ALLOWED_TOOLS");
    expect(line).toContain("/usr/bin/node");
  });
});

describe("findExpandableEnvKeys", () => {
  it("names the keys Claude Code would expand inside a config env field", () => {
    // Claude Code expands variable references inside a stdio server's `env`.
    // A token carrying the opener is rewritten or left mangled, and the result
    // is a SILENTLY unauthenticated MCP server (T-05-02).
    const opener = "$" + "{";
    expect(
      findExpandableEnvKeys({
        CAIDO_TOKEN: `abc${opener}HOME}def`,
        CAIDO_URL: "http://127.0.0.1:8080",
        DRIFT_ALLOWED_TOOLS: `${opener}TOOLS}`,
      }),
    ).toEqual(["CAIDO_TOKEN", "DRIFT_ALLOWED_TOOLS"]);
  });

  it("returns an empty array for a JWT-shaped token", () => {
    expect(
      findExpandableEnvKeys({
        CAIDO_TOKEN:
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        DRIFT_ALLOWLIST_ACTIVE: "1",
      }),
    ).toEqual([]);
  });
});
