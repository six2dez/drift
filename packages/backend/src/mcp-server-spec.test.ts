import {
  SENSITIVE_MCP_TOOL_NAMES,
  excludeSensitiveToolNames,
  providerMcpApprovalChannel,
} from "shared";
import { describe, expect, it } from "vitest";

import { buildSpawnEnv } from "./platform";

import {
  CAIDO_TOKEN_REFERENCE,
  MCP_CLI_ENV_FLAG,
  MCP_CLI_REGISTRATION_SCOPES,
  MCP_CLI_REMOVE_REMEDIATION,
  MCP_CLI_UNSCOPED,
  type McpCliRemovalScope,
  buildMcpCliRegistrationArgv,
  buildMcpCliRegistrationEnv,
  buildMcpDriftVars,
  buildMcpServerSpec,
  classifyMcpRemoveExit,
  findExpandableEnvKeys,
  formatMcpRemoveFailure,
  formatMcpRemoveFailures,
  formatMcpRemoveUnusable,
  formatMcpSweepBlockedResidual,
  formatSpawnDebugLine,
  planMcpCliRegistration,
  planMcpCliRemoval,
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
    // The flag count matches the number of non-empty keys, for both CLIs: the
    // seven-key payload minus the one key forced empty.
    expect(gemini.filter((element) => element === "-e")).toHaveLength(6);
    expect(codex.filter((element) => element === "--env")).toHaveLength(6);
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

  it("refuses Codex when an empty token would produce an argv with no CAIDO_TOKEN (WR-06)", () => {
    // The reachable guard. buildMcpCliRegistrationArgv DROPS a pair whose value
    // is "" rather than emitting `KEY=`, so an empty token yields a
    // `codex mcp add` argv with no CAIDO_TOKEN flag at all, mcp-server.mjs
    // defaults it to "", and the server starts SILENTLY UNAUTHENTICATED inside
    // the user's own ~/.codex/config.toml. The Gemini arm cannot catch this: it
    // is gated on MCP_CLI_EXPANDS_ENV_REFERENCES, which is false for Codex.
    for (const caidoToken of ["", "   "]) {
      const result = planFor({ platform: "linux", cli: "codex", caidoToken });
      expect(result.kind).toBe("Skip");
      const reason = result.kind === "Skip" ? result.reason : "";
      expect(reason).toContain("Codex");
      expect(reason).toContain("CAIDO_TOKEN");
      expect(reason).toContain("authenticated as nobody");
    }
  });

  it("the same guard is CLI-INDEPENDENT — it fires for Gemini on an empty payload too", () => {
    // Gemini's payload carries the REFERENCE literal, so an empty caidoToken
    // never reaches its CAIDO_TOKEN value and the case above cannot express
    // this. The guard reads `registrationEnv` — the dict actually written into
    // the CLI's configuration — so it is driven directly here rather than
    // through a builder that cannot produce the input.
    const registrationEnv = { ...makeGeminiEnv(), CAIDO_TOKEN: "" };
    const result = planMcpCliRegistration({
      platform: "linux",
      cli: "gemini",
      registrationEnv,
      argv: buildMcpCliRegistrationArgv({
        cli: "gemini",
        registrationEnv,
        nodeExecutable: NODE_EXECUTABLE,
        mcpScriptPath: MCP_SCRIPT_PATH,
      }),
      spawnEnvToken: REGISTRATION_TOKEN,
    });
    expect(result.kind).toBe("Skip");
    const reason = result.kind === "Skip" ? result.reason : "";
    expect(reason).toContain("Gemini");
    expect(reason).toContain("authenticated as nobody");
  });

  it("still registers BOTH CLIs when the payload carries a token", () => {
    // The falsifiability partner: a planner that refused everything would pass
    // the two cases above just as well.
    for (const cli of ["gemini", "codex"] as const) {
      expect(
        planFor({ platform: "linux", cli, spawnEnvToken: REGISTRATION_TOKEN }).kind,
      ).toBe("Register");
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

// WR-01 — the loud check's REACHABILITY, asserted instead of assumed.
//
// The cases above prove the predicate by feeding `spawnEnvToken` synthetically.
// That proves the branch, and nothing at all about whether production can ever
// reach it. This block composes the value the way index.ts now does — the same
// production builders, in the same order — and records the answer honestly: with
// a spec in hand it CANNOT be empty, so the check in planMcpCliRegistration is a
// structural backstop rather than a live gate.
//
// Written down here rather than left implicit because the failure this replaces
// was a guard that LOOKED load-bearing: the comment at its call site named the
// wrong environment (WR-02) and the value it read could not vary. If a future
// refactor makes this composition able to yield an empty string, this test fails
// and the backstop becomes a gate again — which is the notice a maintainer needs.
describe("the environment the registration reference expands from (WR-01)", () => {
  it("always carries the token while a spec exists", () => {
    const driftVars = buildMcpDriftVars({
      caidoUrl: "http://127.0.0.1:8080",
      caidoToken: REGISTRATION_TOKEN,
      contextFilePath: "/tmp/drift-mcp-x/mcp-context.json",
      allowedToolNames: FULL_POLICY_TOOL_NAMES,
      confirmationRequiredToolNames: [],
      confirmSensitiveActions: false,
    });

    // index.ts's composition: the parent block, drift's variables overlaid.
    // requireMcpServerSpec refuses an empty token BEFORE a spec is built, so
    // driftVars.CAIDO_TOKEN is non-empty by the time any of this runs, and
    // buildSpawnEnv overlays it last.
    expect(
      buildSpawnEnv({ parentEnv: PARENT_ENV, driftVars }).CAIDO_TOKEN,
    ).toBe(REGISTRATION_TOKEN);

    // The overlay wins even against a parent that carries its own value, which
    // is what makes the outcome independent of the machine Drift runs on.
    expect(
      buildSpawnEnv({
        parentEnv: { ...PARENT_ENV, CAIDO_TOKEN: "" },
        driftVars,
      }).CAIDO_TOKEN,
    ).toBe(REGISTRATION_TOKEN);
  });

  it("is NOT the MCP server's own block, which is what the call site used to pass", () => {
    // The two environments are different compositions built at different times.
    // `spec.env` belongs to the node process Drift spawns for the MCP server;
    // the CLI child's block is assembled in sendCliMessage. They agree on
    // CAIDO_TOKEN today, and that agreement is a coincidence of both overlaying
    // the same driftVars — not the identity the old comment claimed.
    const driftVars = buildMcpDriftVars({
      caidoUrl: "http://127.0.0.1:8080",
      caidoToken: REGISTRATION_TOKEN,
      contextFilePath: "/tmp/drift-mcp-x/mcp-context.json",
      allowedToolNames: FULL_POLICY_TOOL_NAMES,
      confirmationRequiredToolNames: [],
      confirmSensitiveActions: false,
      activityFilePath: "/tmp/drift-mcp-x/mcp-activity-s1.jsonl",
      approvalsFilePath: "/tmp/drift-mcp-x/mcp-approvals-s1.json",
    });
    const spec = buildMcpServerSpec({
      nodeExecutable: NODE_EXECUTABLE,
      mcpScriptPath: MCP_SCRIPT_PATH,
      driftVars,
      parentEnv: PARENT_ENV,
    });

    // The CLI child gets NO per-session keys at registration time (D-03): those
    // files do not exist until sendCliMessage creates them. The MCP server's
    // block, built from the same driftVars later in a session, does.
    const registrationTimeChildEnv = buildSpawnEnv({
      parentEnv: PARENT_ENV,
      driftVars: spec.driftVars,
    });
    expect(registrationTimeChildEnv.CAIDO_TOKEN).toBe(spec.env.CAIDO_TOKEN);
    expect(registrationTimeChildEnv).not.toBe(spec.env);
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

// ── The removal policy and its security line (Phase 7, PRV-03 / SC-3) ──
//
// This is the other half of the trade recorded at 07-03's decision checkpoint:
// a live Caido session token now rests in `~/.codex/config.toml`, outside the
// temp root Drift sweeps. What bounds that residual is the removal running
// unconditionally at every start, across every scope, on every platform — and
// a failure being a SECURITY event the user can see rather than a dropped
// best-effort call. Every one of those properties is asserted below, because
// `index.ts`, where the sweep runs, cannot be imported under vitest.

describe("planMcpCliRemoval", () => {
  it("returns BOTH Gemini scopes, in a stable order, with the user scope first", () => {
    // Two scopes for a HISTORICAL reason, not a hypothetical one: a Drift from
    // before this phase passed no `--scope` at all, so its entries landed in
    // the working-directory scope, while a Drift from this phase onward writes
    // the user scope. Removing only the user scope would leave every
    // pre-upgrade entry in place, holding a credential, forever.
    const entries = planMcpCliRemoval({ cli: "gemini", platform: "linux" });
    expect(entries.map((entry) => entry.scope)).toEqual(["user", "project"]);
    // The order is pinned so a log reading is reproducible across runs.
    expect(entries[0]?.argv).toEqual([
      "mcp",
      "remove",
      "--scope",
      "user",
      "drift",
    ]);
    expect(entries[1]?.argv).toEqual([
      "mcp",
      "remove",
      "--scope",
      "project",
      "drift",
    ]);
  });

  it("puts the Gemini scope flag BEFORE the positional, matching that CLI's parser", () => {
    // Same ordering rule the registration argv obeys: gemini's yargs command is
    // `remove <name>` under `unknown-options-as-args`, so a flag after the
    // positional is swallowed as an argument rather than parsed.
    for (const entry of planMcpCliRemoval({ cli: "gemini", platform: "win32" })) {
      expect(entry.argv.indexOf("--scope")).toBeLessThan(
        entry.argv.indexOf("drift"),
      );
      expect(entry.argv.at(-1)).toBe("drift");
    }
  });

  it("returns exactly ONE unscoped removal for Codex — its config home is global", () => {
    const entries = planMcpCliRemoval({ cli: "codex", platform: "linux" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.scope).toBe(MCP_CLI_UNSCOPED);
    expect(entries[0]?.argv).toEqual(["mcp", "remove", "drift"]);
    // No scope flag anywhere: `codex mcp remove` takes none.
    expect(entries[0]?.argv).not.toContain("--scope");
  });

  it("removes the scope Drift WRITES — the register and remove paths cannot disagree", () => {
    // The orphan this whole plan exists to prevent is a scope Drift can write
    // and cannot remove. Asserted against the registration record rather than
    // against a literal, so a scope rename moves both or neither.
    const writtenScope = MCP_CLI_REGISTRATION_SCOPES.gemini.at(-1);
    expect(
      planMcpCliRemoval({ cli: "gemini", platform: "linux" }).map(
        (entry) => entry.scope,
      ),
    ).toContain(writtenScope);
    // Codex writes with no scope, so the unscoped removal is its counterpart.
    expect(MCP_CLI_REGISTRATION_SCOPES.codex).toEqual([]);
    expect(
      planMcpCliRemoval({ cli: "codex", platform: "linux" })[0]?.scope,
    ).toBe(MCP_CLI_UNSCOPED);
  });

  it("returns IDENTICAL output for win32, darwin, linux and an undefined platform", () => {
    // The fail-closed instinct INVERTS here. Every other predicate in this
    // module skips on an unknown platform; this one must not, because the cost
    // of skipping a removal is a credential left behind rather than a
    // capability withheld. The undefined case is asserted explicitly for that
    // reason — it is the arm `planMcpCliRegistration` deliberately refuses on.
    for (const cli of ["gemini", "codex"] as const) {
      const baseline = planMcpCliRemoval({ cli, platform: "linux" });
      for (const platform of ["win32", "darwin", undefined] as const) {
        expect(planMcpCliRemoval({ cli, platform })).toEqual(baseline);
      }
    }
  });

  it("returns a FRESH array on each call — mutating one result cannot poison the next", () => {
    const first = planMcpCliRemoval({ cli: "gemini", platform: "linux" });
    first[0]?.argv.push("--poisoned");
    first.pop();
    const second = planMcpCliRemoval({ cli: "gemini", platform: "linux" });
    expect(second).toHaveLength(2);
    expect(second[0]?.argv).not.toContain("--poisoned");
  });
});

describe("classifyMcpRemoveExit", () => {
  it("NEVER returns the failed outcome for a zero exit", () => {
    // Both CLIs exit zero whether or not an entry existed — source-verified,
    // and the property that makes an unconditional sweep safe. A classifier
    // that called a clean start a failure would paint a permanent
    // credential-may-remain banner on the provider card, which destroys exactly
    // the signal SC-3 exists to create.
    for (const cli of ["gemini", "codex"] as const) {
      expect(
        classifyMcpRemoveExit({ cli, exitCode: 0, spawnFailed: false }),
      ).not.toBe("failed");
    }
  });

  it("ALWAYS returns the failed outcome for a non-zero exit", () => {
    // The other direction, and it is not optional: a classifier that suppressed
    // everything would pass the case above while destroying the whole signal.
    // This is the property WR-05's fix had to preserve — a REAL removal failure
    // must still reach the security line, whatever else changed around it.
    for (const cli of ["gemini", "codex"] as const) {
      for (const exitCode of [1, 2, 127, -1]) {
        expect(
          classifyMcpRemoveExit({ cli, exitCode, spawnFailed: false }),
        ).toBe("failed");
      }
    }
  });

  it("returns the unusable outcome when the spawn never started (WR-05)", () => {
    // spawnAndWait resolves a SYNTHETIC `code: 1` for a spawn that threw or
    // emitted `error`. Read as an exit status it is indistinguishable from a
    // real failure, and the sweep that consumes it runs at EVERY MCP start — so
    // an EINVAL used to mean a permanent "a token may remain" banner. The
    // discriminator, not the code, is what separates them.
    for (const cli of ["gemini", "codex"] as const) {
      for (const exitCode of [0, 1, 2, 127, -1]) {
        expect(
          classifyMcpRemoveExit({ cli, exitCode, spawnFailed: true }),
        ).toBe("unusable");
      }
    }
  });

  it("reads ONLY the exit code, the CLI and the spawn discriminator — no parameter can carry output text", () => {
    // The same structural property the failure formatter has. `stdout` and
    // `stderr` are on every spawn result this classifier is fed, and a CLI
    // echoing its own configuration back on an error is precisely the case
    // nobody enumerated (T-07-05). The WR-05 widening added a BOOLEAN, which
    // keeps that property intact.
    expect(classifyMcpRemoveExit).toHaveLength(1);
    const input = { cli: "gemini", exitCode: 1, spawnFailed: false } as const;
    expect(Object.keys(input).sort()).toEqual([
      "cli",
      "exitCode",
      "spawnFailed",
    ]);
    expect(classifyMcpRemoveExit(input)).toBe("failed");
  });
});

describe("formatMcpSweepBlockedResidual", () => {
  it("hands the user only the removal commands their CLI actually accepts", () => {
    // The failure this guards: `codex mcp remove --scope user drift` is not a
    // command Codex takes, and a remediation line a user cannot paste is worse
    // than none. The commands come from the same per-CLI policy the sweep
    // iterates, so a scope reaches the removal and this sentence together.
    for (const cli of ["gemini", "codex"] as const) {
      const line = formatMcpSweepBlockedResidual({ cli });
      for (const { scope } of planMcpCliRemoval({ cli, platform: "linux" })) {
        expect(line).toContain(MCP_CLI_REMOVE_REMEDIATION[cli][scope]);
      }
    }
    // Concretely, and in both directions.
    expect(formatMcpSweepBlockedResidual({ cli: "codex" })).toContain(
      "codex mcp remove drift",
    );
    expect(formatMcpSweepBlockedResidual({ cli: "codex" })).not.toContain(
      "--scope",
    );
    const gemini = formatMcpSweepBlockedResidual({ cli: "gemini" });
    expect(gemini).toContain("gemini mcp remove --scope user drift");
    expect(gemini).toContain("gemini mcp remove --scope project drift");
  });

  it("describes each CLI's ACTUAL exposure rather than one averaged sentence", () => {
    // Codex's entry embeds the token bytes; Gemini's carries a reference that
    // expands from an environment Drift is no longer supplying. Both are worth
    // removing, only one is a credential sitting in a file, and telling a Gemini
    // user their token is in plain text would be false.
    expect(formatMcpSweepBlockedResidual({ cli: "codex" })).toContain(
      "plain text",
    );
    expect(formatMcpSweepBlockedResidual({ cli: "gemini" })).not.toContain(
      "plain text",
    );
    expect(formatMcpSweepBlockedResidual({ cli: "gemini" })).toContain(
      "CAIDO_TOKEN",
    );
  });

  it("states the claim CONDITIONALLY, because Drift cannot know across restarts", () => {
    // `registeredMcpCliPaths` is process-lifetime state, so a run that crashed
    // took its record with it. "If Drift ever registered" is the strongest true
    // claim available; asserting the entry exists would be a guess.
    for (const cli of ["gemini", "codex"] as const) {
      expect(formatMcpSweepBlockedResidual({ cli })).toContain(
        "If Drift ever registered",
      );
    }
  });

  it("has no parameter through which the user's command string could arrive", () => {
    // The one value on this path a support bundle should not necessarily carry.
    // Naming the CLI is enough to act on (T-07-05).
    expect(formatMcpSweepBlockedResidual).toHaveLength(1);
    const input = { cli: "codex" } as const;
    expect(Object.keys(input)).toEqual(["cli"]);
  });
});

describe("formatMcpRemoveUnusable", () => {
  it("makes no security claim and offers no remediation command", () => {
    // The whole point of the third outcome. A removal that never started is not
    // evidence that anything was left behind, and saying so anyway is what
    // spends the one alarm SC-3 reserves for a real residual.
    for (const cli of ["gemini", "codex"] as const) {
      // Every scope the policy actually removes, read from the policy itself so
      // a new scope cannot slip past this assertion.
      for (const { scope } of planMcpCliRemoval({ cli, platform: "linux" })) {
        const line = formatMcpRemoveUnusable({ cli, scope });
        expect(line).toContain("[drift]");
        expect(line).toContain(cli);
        expect(line).not.toContain("SECURITY");
        expect(line).not.toContain("may remain");
        expect(line).not.toContain(MCP_CLI_REMOVE_REMEDIATION[cli][scope]);
      }
    }
  });

  it("names the same scope wording the failure line uses", () => {
    // One vocabulary across both renderers, so a user reading the log does not
    // have to learn two ways of naming the same place.
    expect(formatMcpRemoveUnusable({ cli: "gemini", scope: "project" })).toContain(
      "scope=project",
    );
    expect(
      formatMcpRemoveUnusable({ cli: "codex", scope: MCP_CLI_UNSCOPED }),
    ).toContain("codex is unscoped");
  });

  it("has no parameter through which output text could arrive", () => {
    expect(formatMcpRemoveUnusable).toHaveLength(1);
    const input = { cli: "codex", scope: MCP_CLI_UNSCOPED } as const;
    expect(Object.keys(input).sort()).toEqual(["cli", "scope"]);
  });
});

describe("formatMcpRemoveFailure", () => {
  // Values shaped to look like a leak IF one were possible. None of them has a
  // parameter to arrive through, which is the point being asserted.
  const LEAK_SHAPED_TOKEN = "eyJhbGciOiJIUzI1NiJ9.super-secret-caido-token";
  const LEAK_SHAPED_PATH = "/Users/someone/.codex/config.toml";
  const LEAK_SHAPED_STDERR = `error: could not write CAIDO_TOKEN=${LEAK_SHAPED_TOKEN}`;

  it("names the CLI, the scope, the exit code and the exact remediation command", () => {
    const line = formatMcpRemoveFailure({
      cli: "gemini",
      scope: "project",
      exitCode: 1,
    });
    expect(line).toContain("[drift]");
    expect(line).toContain("SECURITY");
    expect(line).toContain("gemini");
    expect(line).toContain("project");
    expect(line).toContain("1");
    expect(line).toContain("Caido session token");
    // The remediation command is asserted against the POLICY's own argv, never
    // against a hand-written string: a scope rename must not be able to leave
    // the user with a command that does not work.
    const entry = planMcpCliRemoval({ cli: "gemini", platform: undefined }).find(
      (candidate) => candidate.scope === "project",
    );
    expect(entry).toBeDefined();
    const expectedCommand = ["gemini", ...(entry?.argv ?? [])].join(" ");
    expect(expectedCommand).toBe("gemini mcp remove --scope project drift");
    expect(line.endsWith(expectedCommand)).toBe(true);
    expect(MCP_CLI_REMOVE_REMEDIATION.gemini.project).toBe(expectedCommand);
  });

  it("says the CLI is unscoped for Codex rather than inventing a scope name", () => {
    const line = formatMcpRemoveFailure({
      cli: "codex",
      scope: MCP_CLI_UNSCOPED,
      exitCode: 2,
    });
    expect(line).toContain("codex");
    expect(line).toContain("unscoped");
    expect(line).not.toContain("--scope");
    expect(line.endsWith("codex mcp remove drift")).toBe(true);
    expect(MCP_CLI_REMOVE_REMEDIATION.codex[MCP_CLI_UNSCOPED]).toBe(
      "codex mcp remove drift",
    );
  });

  it("carries no path, no environment value and no CLI output", () => {
    for (const cli of ["gemini", "codex"] as const) {
      for (const scope of ["user", "project", MCP_CLI_UNSCOPED] as const) {
        const line = formatMcpRemoveFailure({ cli, scope, exitCode: 1 });
        expect(line).not.toContain(LEAK_SHAPED_TOKEN);
        expect(line).not.toContain(LEAK_SHAPED_PATH);
        expect(line).not.toContain(LEAK_SHAPED_STDERR);
        // Nothing that looks like an absolute path at all — the resolved binary
        // is deliberately absent, unlike the registration log line.
        expect(line).not.toMatch(/[/\\]/);
      }
    }
  });

  it("pins the signature to THREE scalars — a fourth member must be a deliberate act", () => {
    // Arity ONE (a single object parameter), so a positional `stderr` cannot be
    // bolted on without touching every call site.
    expect(formatMcpRemoveFailure).toHaveLength(1);
    const input = {
      cli: "gemini",
      scope: "user",
      exitCode: 1,
    } satisfies Parameters<typeof formatMcpRemoveFailure>[0];
    // Exactly three members, named. TypeScript's excess-property check rejects
    // a fourth supplied here, so "no value can arrive" is enforced by the
    // compiler rather than by anyone remembering the rule (05-D-11).
    expect(Object.keys(input).sort()).toEqual(["cli", "exitCode", "scope"]);
    expect(formatMcpRemoveFailure(input)).toContain("exited 1");
  });

  it("covers every scope the policy can produce, for both CLIs", () => {
    // Falsifiability partner for the remediation assertions above: whatever the
    // policy returns, the remediation record has a command for it. A scope the
    // policy can emit but the user cannot be told how to clean is the silent
    // half of this plan's failure mode.
    for (const cli of ["gemini", "codex"] as const) {
      for (const entry of planMcpCliRemoval({ cli, platform: undefined })) {
        const scope: McpCliRemovalScope = entry.scope;
        expect(MCP_CLI_REMOVE_REMEDIATION[cli][scope]).toBe(
          [cli, ...entry.argv].join(" "),
        );
      }
    }
  });
});

describe("formatMcpRemoveFailures", () => {
  // T-07-08. The caller this replaces read `[...outstanding.keys()][0]`, so a
  // gemini whose removal failed in BOTH scopes named one and left a live token
  // behind the other unmentioned.
  it("names EVERY outstanding scope, not just the first", () => {
    const line = formatMcpRemoveFailures({
      cli: "gemini",
      outstanding: new Map<McpCliRemovalScope, number>([
        ["user", 1],
        ["project", 3],
      ]),
    });

    expect(line).toBeDefined();
    // Both scopes, both exit codes, and both remediation commands — the
    // discriminating assertion is `project`, which the single-scope form
    // dropped whenever `user` was recorded first.
    expect(line).toContain("scope=user");
    expect(line).toContain("scope=project");
    expect(line).toContain("exited 1");
    expect(line).toContain("exited 3");
    expect(line).toContain(MCP_CLI_REMOVE_REMEDIATION.gemini.user);
    expect(line).toContain(MCP_CLI_REMOVE_REMEDIATION.gemini.project);
    // The separator is part of the contract, not cosmetics: each line ENDS with
    // a paste-able remediation command, so joining on a bare space would run
    // that command straight into the next line's `[drift] SECURITY:` and leave
    // the user finding the boundary by eye. `toContain` above passes under any
    // separator, so without this the fix would be unguarded.
    expect(line).toContain(`${MCP_CLI_REMOVE_REMEDIATION.gemini.user}\n`);
    expect(line?.split("\n")).toHaveLength(2);
  });

  it("returns undefined — not an empty string — when nothing is outstanding", () => {
    // The caller branches on "is there a security line". An empty string reads
    // as one and behaves as none, which is how a wipe gets reintroduced.
    expect(
      formatMcpRemoveFailures({ cli: "codex", outstanding: new Map() }),
    ).toBeUndefined();
  });

  it("inherits the value-free property from the single-scope formatter", () => {
    const line = formatMcpRemoveFailures({
      cli: "gemini",
      outstanding: new Map<McpCliRemovalScope, number>([["user", 1]]),
    });
    expect(line).toBeDefined();
    // No path separator anywhere: the multi-scope wrapper must not become the
    // place a path re-enters the message (T-07-05).
    expect(line).not.toMatch(/[/\\]/);
  });
});
