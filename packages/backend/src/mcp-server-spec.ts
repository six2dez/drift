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
// The one import is `./platform`, and it is here for one reason, in the
// `runtime-probe.ts` house style of justifying each import a module allows:
// `buildSpawnEnv` is the single parent-merge point finding L-4 makes load-bearing
// (see `buildMcpServerSpec` below). Deliberately NOT imported: `os` (D-02
// keeps the single `os` read in index.ts, behind the RUN-05 probe), `fs`, `path`
// and any read of `process` — a module that touches none of them has no hidden
// input a test cannot supply.

import { buildSpawnEnv } from "./platform";

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
