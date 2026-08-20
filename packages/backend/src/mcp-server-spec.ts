// The launch spec for Drift's own MCP server: what to run, with which
// arguments, and under which environment. Three properties are load-bearing and
// all three are mechanically checkable. This module performs ZERO I/O; it reads
// no module state; and it carries exactly ONE import statement — `grep -cE
// '^import'` over this file returns 1, which is the machine form of both claims
// at once. `parentEnv`, the node path, the script path and every policy value
// are INJECTED parameters, never read from `process`, `os` or a module-level
// singleton.
//
// That injection is the whole reason this lives outside `index.ts`. `index.ts`
// is 4,000 lines, declares no `caido:plugin` alias for vitest and therefore
// cannot be imported by any test this project can run — so anything left inside
// it is unverifiable by construction (D-06). The maintainer also cannot test
// native Windows locally, which makes "unverifiable by construction" the same
// thing as "unverified on the only platform this milestone is about".
//
// The one import is `./platform`, and it is here for exactly two reasons, in the
// `runtime-probe.ts` house style of justifying each import a module allows:
// `buildSpawnEnv` is the single parent-merge point finding L-4 makes load-bearing
// (see `buildMcpServerSpec` below), and `Platform` is the narrow three-member
// union `planMcpCliRegistration` gates on. Deliberately NOT imported: `os` (D-02
// keeps the single `os` read in index.ts, behind the RUN-05 probe), `fs`, `path`
// and any read of `process` — a module that touches none of them has no hidden
// input a test cannot supply.

import { buildSpawnEnv, type Platform } from "./platform";

// Two projections of one launch decision, deliberately distinct.
//
// `env` is the parent-merged block and is what `spawn` receives. `driftVars` is
// the ~9-key dict and is what the MCP *config documents* receive. The spawn path
// MUST merge (finding L-4, below); the config path must NOT — the external CLI
// already hands its own child the parent environment, so writing the user's whole
// environment into a token-bearing `0o600` JSON file would widen the blast radius
// of a support bundle or a stray read for no functional gain (T-05-04). Keeping
// both on one object is what lets a single spec drive the spawn site and both
// config writers without either caller choosing the wrong one.
export type McpServerSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
  driftVars: Record<string, string>;
};

// The ~9 `DRIFT_*`/`CAIDO_*` variables `assets/mcp-server.mjs:12-38` reads.
//
// This reproduces `index.ts`'s `buildMcpRuntimeEnv` key-for-key AND in the same
// insertion order, with every module-state read replaced by a parameter:
// `currentSettings.caidoApi.url` → `caidoUrl`, `getMcpContextFilePath()` →
// `contextFilePath`, and the three `toolPolicy` reads → `allowedToolNames`,
// `confirmationRequiredToolNames`, `confirmSensitiveActions`. Order is asserted
// rather than assumed (`Object.keys(...)` `toEqual` in the sibling test) because
// `JSON.stringify` walks insertion order, and the Copilot config document's byte
// shape is a CMP-01 surface that must not change when it starts flowing through
// here.
//
// The three conditional spreads are also part of that byte shape: an absent value
// OMITS its key rather than emitting an empty string, exactly as the shipping
// function does.
export function buildMcpDriftVars(input: {
  caidoUrl: string;
  caidoToken: string;
  contextFilePath: string | undefined;
  allowedToolNames: string[];
  confirmationRequiredToolNames: string[];
  confirmSensitiveActions: boolean;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Record<string, string> {
  return {
    CAIDO_URL: input.caidoUrl,
    CAIDO_TOKEN: input.caidoToken,
    ...(input.contextFilePath !== undefined
      ? { DRIFT_CONTEXT_FILE: input.contextFilePath }
      : {}),
    // Unconditional, and the literal one-character string "1". This is the flag
    // that tells the server its allowlist is intentionally configured:
    // `mcp-server.mjs:613` returns EVERY tool when the flag is absent and the
    // allowlist is empty. So a spec that drops this key does not fail closed —
    // it silently exposes all 18 tools, including every sensitive one, to a
    // user who turned every permission group off (T-05-01).
    DRIFT_ALLOWLIST_ACTIVE: "1",
    DRIFT_ALLOWED_TOOLS: input.allowedToolNames.join(","),
    DRIFT_CONFIRMATION_REQUIRED_TOOLS:
      input.confirmationRequiredToolNames.join(","),
    DRIFT_CONFIRM_SENSITIVE_ACTIONS: input.confirmSensitiveActions ? "1" : "0",
    ...(input.activityFilePath !== undefined
      ? { DRIFT_ACTIVITY_FILE: input.activityFilePath }
      : {}),
    ...(input.approvalsFilePath !== undefined
      ? { DRIFT_APPROVALS_FILE: input.approvalsFilePath }
      : {}),
  };
}

// The keystone. One spec, and every consumer reads it rather than rebuilding it.
export function buildMcpServerSpec(input: {
  nodeExecutable: string;
  mcpScriptPath: string;
  driftVars: Record<string, string>;
  parentEnv: Record<string, string | undefined>;
}): McpServerSpec {
  return {
    command: input.nodeExecutable,
    args: [input.mcpScriptPath],
    // The parent block is merged in, ALWAYS, and only ever through
    // `buildSpawnEnv`. The obvious simplification — handing the child
    // `input.driftVars` directly, since those are the only variables the server
    // reads — is the one edit this module exists to make impossible.
    //
    // Under Node the simplification is invisible: libuv's Windows
    // `make_program_env()` back-fills eleven `required_vars` (HOMEDRIVE,
    // HOMEPATH, LOGONSERVER, PATH, SYSTEMDRIVE, SYSTEMROOT, TEMP, USERDOMAIN,
    // USERNAME, USERPROFILE, WINDIR) into whatever block you supply, so the
    // child still starts and every assertion still passes. Under Caido's LLRT
    // there is no libuv at all: `std::process::Command` builds the block with
    // Rust's `make_envp`, which writes the supplied map VERBATIM and has no
    // `required_vars` analogue anywhere in the function
    // (rust-lang/rust `library/std/src/sys/process/windows.rs:908-929`), and
    // `Command::env_clear` documents the same intent — it "prevents inheriting
    // any parent process environment variables".
    //
    // So a bare drift-only dict is GREEN on every runner this project has, on
    // both operating systems, and broken only under the real Caido runtime on
    // the machine of the user who filed the bug. That asymmetry is why the merge
    // has a single named home instead of being spelled out at each call site.
    env: buildSpawnEnv({
      parentEnv: input.parentEnv,
      driftVars: input.driftVars,
    }),
    driftVars: input.driftVars,
  };
}

// The MCP config document both external-CLI paths write: Claude's
// `mcp-<chatId>.json` (`--mcp-config`) and Copilot's `copilot-mcp-<chatId>.json`
// (`--additional-mcp-config`). One spec, one projection, two callers — which is
// what stops the two documents drifting apart the way they could while each
// write site assembled its own object.
export function toMcpConfigDocument(spec: McpServerSpec): {
  mcpServers: {
    drift: { command: string; args: string[]; env: Record<string, string> };
  };
} {
  return {
    mcpServers: {
      drift: {
        command: spec.command,
        args: spec.args,
        // `driftVars`, NEVER `spec.env`. The spawn projection merges the parent
        // block because the child would otherwise start with almost no
        // environment under LLRT; this projection must not, because the
        // external CLI already gives its own child the parent environment and
        // the only thing merging would add here is the user's entire
        // environment, written verbatim into a token-bearing file on disk
        // (T-05-04). The "obvious" unification of the two projections is
        // therefore a forbidden one.
        env: spec.driftVars,
      },
    },
  };
}

// Whether the shared POSIX `mcp-wrapper.sh` may be handed to `gemini mcp add` /
// `codex mcp add`. D-01 keeps that wrapper alive on POSIX because its `export`
// lines are the SOLE carrier of CAIDO_URL/CAIDO_TOKEN/DRIFT_* for those two
// CLIs; deleting it before Phase 7's `--env`/`-e` work would be a live CMP-01
// regression for two shipping providers on the platforms the whole user base
// runs today.
export type McpCliRegistration =
  | { kind: "Register"; wrapperPath: string }
  | { kind: "Skip"; reason: string };

const MCP_CLI_DISPLAY_NAMES: Record<"gemini" | "codex", string> = {
  gemini: "Gemini",
  codex: "Codex",
};

// Allow-list gate in `normalizePlatform`'s shape: return the explicit non-happy
// case rather than falling through. The branch ORDER is part of the contract —
// an unknown platform and win32 both Skip BEFORE `wrapperPath` is considered, so
// there is no input at all on which a win32 host reaches the wrapper arm.
export function planMcpCliRegistration(input: {
  platform: Platform | undefined;
  cli: "gemini" | "codex";
  wrapperPath: string | undefined;
}): McpCliRegistration {
  if (input.platform === undefined) {
    // Fail closed. Caido's LLRT hardcodes PLATFORM at compile time and its third
    // arm is `std::env::consts::OS`, which can yield "freebsd" or "android" —
    // values that must never flow silently into the POSIX arm (RUN-05).
    return {
      kind: "Skip",
      reason:
        "Drift could not determine the host platform, so MCP registration was skipped.",
    };
  }
  if (input.platform === "win32") {
    // Names the provider in display casing AND names the phase: a Windows user
    // who reads "not yet supported ... (Phase 7)" learns this is sequenced work
    // rather than a dead end (D-03). The same sentence is surfaced in-product
    // through `skippedMcpCliReasons` and in the README.
    return {
      kind: "Skip",
      reason: `Drift MCP is not yet supported for ${MCP_CLI_DISPLAY_NAMES[input.cli]} on Windows (Phase 7).`,
    };
  }
  if (input.wrapperPath === undefined) {
    return {
      kind: "Skip",
      reason:
        "Drift's shared MCP wrapper was not written, so MCP registration was skipped.",
    };
  }
  return { kind: "Register", wrapperPath: input.wrapperPath };
}

// D-11's session-debug line. It takes key NAMES and has no parameter through
// which a value could arrive — that is the design, not a discipline anyone has
// to remember. `platform.ts:262` states the same rule at the merge point:
// `buildSpawnEnv` "returns data only and must never be used to render an
// environment into a log or diagnostic (T-04-04)".
//
// Rejected, and recorded here so it is not re-proposed: dumping the merged
// environment through a redaction regex. A regex over a whole environment fails
// OPEN — it protects only the keys someone thought to enumerate, and the keys
// nobody enumerated are exactly the ones a future variable will be added under.
export function formatSpawnDebugLine(input: {
  command: string;
  args: string[];
  injectedKeys: string[];
}): string {
  return [
    `spawn command=${input.command}`,
    `args=${JSON.stringify(input.args)}`,
    `injectedEnvKeys=${[...input.injectedKeys].sort().join(",")}`,
  ].join(" ");
}

// The two-character opener is assembled from separate string parts so this
// source file never carries a literal variable-reference sequence that a
// downstream tool — a shell heredoc, a template renderer, an editor snippet
// expander — could mangle on its way through.
const EXPANSION_OPENER = "$" + "{";

// The keys a config document must not be written with. Claude Code performs
// environment-variable expansion INSIDE a stdio server's `env` field
// (code.claude.com/docs/en/mcp § "Environment variable expansion in .mcp.json"),
// and an unset reference is left as unexpanded text with only a
// `claude mcp list` warning. Either way the server starts with a token that is
// not the token — i.e. a SILENTLY unauthenticated MCP server, which is the exact
// failure mode D-10 rejected `${CAIDO_TOKEN}` indirection for. This predicate is
// pure so the write site can fail loud instead (T-05-02).
export function findExpandableEnvKeys(
  driftVars: Record<string, string>,
): string[] {
  return Object.entries(driftVars)
    .filter(([, value]) => value.includes(EXPANSION_OPENER))
    .map(([key]) => key)
    .sort();
}
