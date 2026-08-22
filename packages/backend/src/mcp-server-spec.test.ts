import {
  SENSITIVE_MCP_TOOL_NAMES,
  excludeSensitiveToolNames,
  providerMcpApprovalChannel,
} from "shared";
import { describe, expect, it } from "vitest";

import {
  CAIDO_TOKEN_REFERENCE,
  MCP_CLI_ENV_FLAG,
  MCP_CLI_REGISTRATION_SCOPES,
  buildMcpCliRegistrationArgv,
  buildMcpCliRegistrationEnv,
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

// ── Phase 7 (PRV-03) registration fixtures ──────────────────────────
//
// A token that is deliberately NOT JWT-shaped and NOT a substring of any other
// fixture value, so "the Gemini argv contains no element containing the token"
// is a real search rather than a coincidence.
const REGISTRATION_TOKEN = "SUPER-SECRET-CAIDO-SESSION-TOKEN-VALUE";

const GEMINI_CHANNEL = providerMcpApprovalChannel("gemini-cli");
const CODEX_CHANNEL = providerMcpApprovalChannel("codex-cli");

const NODE_EXECUTABLE = "C:\\Program Files\\nodejs\\node.exe";
const MCP_SCRIPT_PATH = "C:\\Temp\\drift-mcp-abc\\mcp-server.mjs";

// A policy that carries BOTH sensitive and non-sensitive names, in a fixed
// order, so the Codex filter's "removes exactly the sensitive ones, order
// preserved" property is observable.
const FULL_POLICY_TOOL_NAMES = [
  "search_history",
  "send_request",
  "get_environment",
  "set_environment",
  "intercept_status",
  "run_workflow",
];

// The two per-session paths are supplied ON PURPOSE. D-03 / T-07-13: the builder
// must strip them STRUCTURALLY rather than trust its caller, because a future
// caller handing it a full per-session set is exactly the mistake predicted.
function makeRegistrationDriftVars(caidoToken = REGISTRATION_TOKEN) {
  return buildMcpDriftVars({
    caidoUrl: "http://127.0.0.1:8080",
    caidoToken,
    contextFilePath: "/tmp/drift-mcp-x/mcp-context.json",
    allowedToolNames: FULL_POLICY_TOOL_NAMES,
    confirmationRequiredToolNames: ["send_request", "run_workflow"],
    confirmSensitiveActions: true,
    activityFilePath: "/tmp/drift-mcp-x/mcp-activity-s1.jsonl",
    approvalsFilePath: "/tmp/drift-mcp-x/mcp-approvals-s1.json",
  });
}

function makeGeminiEnv(caidoToken = REGISTRATION_TOKEN) {
  return buildMcpCliRegistrationEnv({
    cli: "gemini",
    driftVars: makeRegistrationDriftVars(caidoToken),
    approvalChannel: GEMINI_CHANNEL,
    caidoToken,
  });
}

function makeCodexEnv(caidoToken = REGISTRATION_TOKEN) {
  return buildMcpCliRegistrationEnv({
    cli: "codex",
    driftVars: makeRegistrationDriftVars(caidoToken),
    approvalChannel: CODEX_CHANNEL,
    caidoToken,
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

describe("buildMcpCliRegistrationEnv", () => {
  it("strips the two per-session file keys for BOTH CLIs even when the caller supplies them", () => {
    // D-03 / T-07-13. The `driftVars` handed in DOES carry both paths — the
    // builder removes them structurally rather than trusting its caller,
    // because "we pass the env explicitly, so pass all of it" is the obvious
    // and wrong instinct. For Gemini those two keys arrive by INHERITANCE and a
    // registration-time value would clobber a live one with a path from a dead
    // session; for Codex the channel is dead anyway.
    const supplied = makeRegistrationDriftVars();
    expect(Object.keys(supplied)).toContain("DRIFT_ACTIVITY_FILE");
    expect(Object.keys(supplied)).toContain("DRIFT_APPROVALS_FILE");

    for (const env of [makeGeminiEnv(), makeCodexEnv()]) {
      expect(Object.keys(env)).not.toContain("DRIFT_ACTIVITY_FILE");
      expect(Object.keys(env)).not.toContain("DRIFT_APPROVALS_FILE");
    }
  });

  it("preserves the shipping Drift key ORDER minus the stripped per-session pair", () => {
    // The Drift-variables byte shape is a CMP-01 surface (the config-document
    // path asserts it above). This projection must not reorder it.
    for (const env of [makeGeminiEnv(), makeCodexEnv()]) {
      expect(Object.keys(env)).toEqual([
        "CAIDO_URL",
        "CAIDO_TOKEN",
        "DRIFT_CONTEXT_FILE",
        "DRIFT_ALLOWLIST_ACTIVE",
        "DRIFT_ALLOWED_TOOLS",
        "DRIFT_CONFIRMATION_REQUIRED_TOOLS",
        "DRIFT_CONFIRM_SENSITIVE_ACTIONS",
      ]);
    }
  });

  it("gives Codex a sensitive-filtered allowlist derived from the shared filter, not a second list", () => {
    // D-06's fail-closed expressed as a PAYLOAD: a tool absent from the
    // allowlist is never even offered (mcp-server.mjs getAvailableTools filters
    // tools/list on it), which is cleaner than offering it and refusing at call
    // time. DRIFT_ALLOWLIST_ACTIVE stays "1", which is what makes an empty
    // allowlist mean deny-all rather than allow-all.
    const env = makeCodexEnv();
    expect(env.DRIFT_ALLOWED_TOOLS).toBe(
      excludeSensitiveToolNames(FULL_POLICY_TOOL_NAMES).join(","),
    );
    expect(env.DRIFT_ALLOWED_TOOLS).toBe(
      "search_history,get_environment,intercept_status",
    );
    for (const sensitive of SENSITIVE_MCP_TOOL_NAMES) {
      expect(env.DRIFT_ALLOWED_TOOLS?.split(",")).not.toContain(sensitive);
    }
    expect(env.DRIFT_ALLOWLIST_ACTIVE).toBe("1");
    // There is no channel to confirm through, so nothing may be marked as
    // needing confirmation and the confirm flag is off.
    expect(env.DRIFT_CONFIRMATION_REQUIRED_TOOLS).toBe("");
    expect(env.DRIFT_CONFIRM_SENSITIVE_ACTIONS).toBe("0");
  });

  it("gives Gemini the full policy allowlist, sensitive names included", () => {
    const env = makeGeminiEnv();
    expect(env.DRIFT_ALLOWED_TOOLS).toBe(FULL_POLICY_TOOL_NAMES.join(","));
    expect(env.DRIFT_ALLOWED_TOOLS?.split(",")).toContain("run_workflow");
    expect(env.DRIFT_CONFIRMATION_REQUIRED_TOOLS).toBe(
      "send_request,run_workflow",
    );
    expect(env.DRIFT_CONFIRM_SENSITIVE_ACTIONS).toBe("1");
  });

  it("carries a token REFERENCE for Gemini — exactly one expandable key, and it is the token", () => {
    const env = makeGeminiEnv();
    expect(env.CAIDO_TOKEN).toBe(CAIDO_TOKEN_REFERENCE);
    expect(env.CAIDO_TOKEN).not.toBe(REGISTRATION_TOKEN);
    // The EXACT array, not merely "non-empty": an unexpected SECOND expandable
    // key is precisely the failure this guard exists for, and Gemini expands
    // every value it is handed from its own un-sanitized parent environment.
    expect(findExpandableEnvKeys(env)).toEqual(["CAIDO_TOKEN"]);
  });

  it("carries the LITERAL token for Codex, with no reference syntax anywhere in the payload", () => {
    // Codex performs NO expansion on its read path, so reference text would be
    // handed to the MCP server verbatim AS the token — always, not only when
    // unset. The fixture token carries BOTH opener characters (`$` and `{`)
    // without forming the two-character opener, so a green result cannot come
    // from a token that simply has no braces in it.
    const openerBearingToken = "tok$en{with-both-opener-characters";
    const env = makeCodexEnv(openerBearingToken);
    expect(env.CAIDO_TOKEN).toBe(openerBearingToken);
    expect(findExpandableEnvKeys(env)).toEqual([]);
    expect(Object.values(env)).not.toContain(CAIDO_TOKEN_REFERENCE);
  });
});

describe("buildMcpCliRegistrationArgv", () => {
  it("puts every Gemini flag BEFORE the positionals and ends with node then the script", () => {
    // gemini's yargs parserConfiguration sets `unknown-options-as-args`, so
    // anything after the `<name> <commandOrUrl>` positionals is swallowed as a
    // SERVER argument rather than parsed as a flag.
    const argv = buildMcpCliRegistrationArgv({
      cli: "gemini",
      registrationEnv: makeGeminiEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });

    expect(argv.slice(0, 4)).toEqual(["mcp", "add", "--scope", "user"]);
    expect(MCP_CLI_REGISTRATION_SCOPES.gemini).toEqual(["--scope", "user"]);

    const nameIndex = argv.indexOf("drift");
    expect(nameIndex).toBeGreaterThan(3);
    // Every flag pair precedes the server name.
    expect(argv.lastIndexOf(MCP_CLI_ENV_FLAG.gemini)).toBeLessThan(nameIndex);
    expect(argv.slice(nameIndex)).toEqual([
      "drift",
      NODE_EXECUTABLE,
      MCP_SCRIPT_PATH,
    ]);
    expect(argv.slice(-2)).toEqual([NODE_EXECUTABLE, MCP_SCRIPT_PATH]);
  });

  it("puts the Codex server name first, then the flag pairs, then the separator", () => {
    const argv = buildMcpCliRegistrationArgv({
      cli: "codex",
      registrationEnv: makeCodexEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });

    expect(argv.slice(0, 3)).toEqual(["mcp", "add", "drift"]);
    // Codex's `command` positional is `trailing_var_arg`, so the flags must sit
    // before the `--` separator.
    expect(argv.indexOf("--")).toBeGreaterThan(2);
    expect(argv.lastIndexOf(MCP_CLI_ENV_FLAG.codex)).toBeLessThan(
      argv.indexOf("--"),
    );
    expect(argv.slice(argv.indexOf("--"))).toEqual([
      "--",
      NODE_EXECUTABLE,
      MCP_SCRIPT_PATH,
    ]);
    // The other CLI takes no scope argument: its removal and its write both
    // operate on one global configuration home.
    expect(MCP_CLI_REGISTRATION_SCOPES.codex).toEqual([]);
  });

  it("uses each CLI's OWN env-flag spelling, not a shared one", () => {
    // `codex mcp add` has no `-e` short flag at all; `gemini mcp add` has both.
    expect(MCP_CLI_ENV_FLAG.gemini).toBe("-e");
    expect(MCP_CLI_ENV_FLAG.codex).toBe("--env");
    expect(MCP_CLI_ENV_FLAG.gemini).not.toBe(MCP_CLI_ENV_FLAG.codex);

    const gemini = buildMcpCliRegistrationArgv({
      cli: "gemini",
      registrationEnv: makeGeminiEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });
    const codex = buildMcpCliRegistrationArgv({
      cli: "codex",
      registrationEnv: makeCodexEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });

    expect(gemini).toContain("-e");
    expect(gemini).not.toContain("--env");
    expect(codex).toContain("--env");
    expect(codex).not.toContain("-e");
    expect(gemini).toContain(
      `DRIFT_CONTEXT_FILE=/tmp/drift-mcp-x/mcp-context.json`,
    );
  });

  it("omits an empty-valued key from the flag pairs entirely, for both CLIs", () => {
    // gemini's `-e` parser does `curr.split('=')` and then `if (key && value)`,
    // so an empty value drops the key silently; the MCP server defaults it
    // anyway. Omitting it makes the argv reflect what is actually delivered.
    const geminiEnv = {
      ...makeGeminiEnv(),
      DRIFT_CONFIRMATION_REQUIRED_TOOLS: "",
    };
    const gemini = buildMcpCliRegistrationArgv({
      cli: "gemini",
      registrationEnv: geminiEnv,
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });
    expect(gemini).not.toContain("DRIFT_CONFIRMATION_REQUIRED_TOOLS=");
    expect(
      gemini.filter((element) =>
        element.startsWith("DRIFT_CONFIRMATION_REQUIRED_TOOLS"),
      ),
    ).toEqual([]);

    // Codex's payload already forces that key empty (no confirmation channel),
    // so the same omission must hold there without any extra arrangement.
    const codex = buildMcpCliRegistrationArgv({
      cli: "codex",
      registrationEnv: makeCodexEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });
    expect(
      codex.filter((element) =>
        element.startsWith("DRIFT_CONFIRMATION_REQUIRED_TOOLS"),
      ),
    ).toEqual([]);
    // The flag count matches the number of non-empty keys, for both CLIs.
    expect(gemini.filter((element) => element === "-e")).toHaveLength(5);
    expect(codex.filter((element) => element === "--env")).toHaveLength(5);
  });

  it("never puts the Caido token BYTES on Gemini's command line", () => {
    // T-07-04: an `mcp add` argument list is readable by any process that can
    // enumerate arguments on the host. The reference shape buys exactly this.
    const argv = buildMcpCliRegistrationArgv({
      cli: "gemini",
      registrationEnv: makeGeminiEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });

    for (const element of argv) {
      expect(element).not.toContain(REGISTRATION_TOKEN);
    }
    expect(argv).toContain(`CAIDO_TOKEN=${CAIDO_TOKEN_REFERENCE}`);

    // The counterpart, so the case above is not a claim about both CLIs: Codex
    // DOES carry the bytes, and that exposure is the accepted residual.
    const codex = buildMcpCliRegistrationArgv({
      cli: "codex",
      registrationEnv: makeCodexEnv(),
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
    });
    expect(codex).toContain(`CAIDO_TOKEN=${REGISTRATION_TOKEN}`);
  });
});

describe("planMcpCliRegistration", () => {
  function planFor(input: {
    platform: "win32" | "darwin" | "linux" | undefined;
    cli: "gemini" | "codex";
    spawnEnvToken?: string | undefined;
    caidoToken?: string;
  }) {
    const registrationEnv =
      input.cli === "gemini"
        ? makeGeminiEnv(input.caidoToken)
        : makeCodexEnv(input.caidoToken);
    return planMcpCliRegistration({
      platform: input.platform,
      cli: input.cli,
      registrationEnv,
      argv: buildMcpCliRegistrationArgv({
        cli: input.cli,
        registrationEnv,
        nodeExecutable: NODE_EXECUTABLE,
        mcpScriptPath: MCP_SCRIPT_PATH,
      }),
      spawnEnvToken:
        "spawnEnvToken" in input ? input.spawnEnvToken : REGISTRATION_TOKEN,
    });
  }

  it("returns the REGISTER arm on win32 — the Phase 5 Windows skip is gone", () => {
    // This is the requirement (PRV-03 / SC-3), so it is asserted on win32
    // specifically rather than inferred from the POSIX arms.
    for (const cli of ["gemini", "codex"] as const) {
      const result = planFor({ platform: "win32", cli });
      expect(result.kind).toBe("Register");
      expect(result.kind === "Register" ? result.argv.slice(-2) : []).toEqual([
        NODE_EXECUTABLE,
        MCP_SCRIPT_PATH,
      ]);
    }
  });

  it("registers on win32, darwin and linux alike, carrying the planned argv", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const result = planFor({ platform, cli: "gemini" });
      expect(result.kind).toBe("Register");
      expect(result.kind === "Register" ? result.argv[0] : "").toBe("mcp");
    }
  });

  it("fails closed on an unknown platform rather than falling through to the POSIX arm", () => {
    // The branch ORDER is part of the contract: this arm is still written
    // first, so no other input can reach the register arm ahead of it.
    const result = planFor({ platform: undefined, cli: "gemini" });
    expect(result.kind).toBe("Skip");
    expect(result.kind === "Skip" ? result.reason : "").toContain(
      "host platform",
    );
  });

  it("refuses Codex when its payload carries ANY expandable reference", () => {
    const result = planFor({
      platform: "linux",
      cli: "codex",
      caidoToken: "abc" + "$" + "{HOME}def",
    });
    expect(result.kind).toBe("Skip");
    const reason = result.kind === "Skip" ? result.reason : "";
    expect(reason).toContain("Codex");
    expect(reason).toContain("CAIDO_TOKEN");
    // Value-free: the reason names the KEY, never the token bytes (05-D-11).
    expect(reason).not.toContain("HOME}def");
  });

  it("refuses Gemini when the reference is used and the spawn environment carries no token", () => {
    for (const spawnEnvToken of [undefined, "", "   "]) {
      const result = planFor({
        platform: "linux",
        cli: "gemini",
        spawnEnvToken,
      });
      expect(result.kind).toBe("Skip");
      const reason = result.kind === "Skip" ? result.reason : "";
      expect(reason).toContain("Gemini");
      expect(reason).toContain("CAIDO_TOKEN");
    }
  });

  it("registers Gemini when the reference is used and the spawn environment carries a non-empty token", () => {
    // Both directions, deliberately: the negative case above would pass just as
    // well for a planner that never registers anything at all.
    const result = planFor({
      platform: "linux",
      cli: "gemini",
      spawnEnvToken: REGISTRATION_TOKEN,
    });
    expect(result.kind).toBe("Register");
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
