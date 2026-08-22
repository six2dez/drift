// The launch spec for Drift's own MCP server: what to run, with which
// arguments, and under which environment. Three properties are load-bearing and
// all three are mechanically checkable. This module performs ZERO I/O; it reads
// no module state; and it carries exactly TWO import statements — `grep -cE
// '^import'` over this file returns 2, which is the machine form of both claims
// at once. `parentEnv`, the node path, the script path and every policy value
// are INJECTED parameters, never read from `process`, `os` or a module-level
// singleton.
//
// The count was 1 until Phase 7 (PRV-03) added the Gemini/Codex registration
// payload below. The number is stated rather than omitted because the COUNT is
// this module's purity statement, and a stale number is worse than no number:
// each import has to earn its place by name, in the paragraph below.
//
// That injection is the whole reason this lives outside `index.ts`. `index.ts`
// is 4,000 lines, declares no `caido:plugin` alias for vitest and therefore
// cannot be imported by any test this project can run — so anything left inside
// it is unverifiable by construction (D-06). The maintainer also cannot test
// native Windows locally, which makes "unverifiable by construction" the same
// thing as "unverified on the only platform this milestone is about".
//
// The first import is `./platform`, and it is here for exactly two reasons, in
// the `runtime-probe.ts` house style of justifying each import a module allows:
// `buildSpawnEnv` is the single parent-merge point finding L-4 makes load-bearing
// (see `buildMcpServerSpec` below), and `Platform` is the narrow three-member
// union `planMcpCliRegistration` gates on.
//
// The second is `shared`, added by Phase 7 for the registration payload, and it
// is the reason the payload builder is allowed to live here at all: 07-CONTEXT
// D-04's per-CLI approval-channel table and 07-02's `excludeSensitiveToolNames`
// are what decide Codex's allowlist, and the alternative — computing the
// filtered list at the `index.ts` call site and passing it in — would put a
// SECOND hand-maintained sensitive-tool list one import away from the shipped
// one. `shared` is itself zero-import data plus pure predicates (it loads in the
// browser and in QuickJS unchanged), so depending on it adds no hidden input.
//
// Deliberately NOT imported: `os` (D-02 keeps the single `os` read in index.ts,
// behind the RUN-05 probe), `fs`, `path`, `child_process` and any read of
// `process` — a module that touches none of them has no hidden input a test
// cannot supply.

import { type McpApprovalChannel, excludeSensitiveToolNames } from "shared";

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

// The two CLIs Drift registers EXTERNALLY, by shelling their own `mcp add`.
// Claude and Copilot are not here: they receive a config document Drift writes
// itself (`toMcpConfigDocument` above), so they never take this path.
export type McpCliName = "gemini" | "codex";

// Whether `gemini mcp add` / `codex mcp add` may be run, and with what.
//
// The register arm carries the COMPLETE argv — every flag, the server name, the
// positionals — rather than a path. Until Phase 7 it carried the shared POSIX
// `mcp-wrapper.sh` path, because that script's `export` lines were the sole
// carrier of CAIDO_URL/CAIDO_TOKEN/DRIFT_* for these two CLIs. PRV-03 replaces
// that carrier with the CLIs' own `-e`/`--env` surface, which is what allows the
// wrapper — and the four functions that rendered it — to be deleted in the same
// commit as this reshape (SC-7).
export type McpCliRegistration =
  | { kind: "Register"; argv: string[] }
  | { kind: "Skip"; reason: string };

const MCP_CLI_DISPLAY_NAMES: Record<McpCliName, string> = {
  gemini: "Gemini",
  codex: "Codex",
};

// Allow-list gate in `normalizePlatform`'s shape: return the explicit non-happy
// case rather than falling through. The branch ORDER is part of the contract —
// every refusal is written BEFORE the register arm, so there is no input at all
// on which a hazardous payload reaches a spawn.
//
// The win32 arm that lived here through Phase 5 is GONE. It returned
// "Drift MCP is not yet supported for <CLI> on Windows (Phase 7)."; the phase
// that sentence named has now landed, and Windows takes exactly the same
// register arm as darwin and linux (PRV-03, SC-3).
export function planMcpCliRegistration(input: {
  platform: Platform | undefined;
  cli: McpCliName;
  registrationEnv: Record<string, string>;
  argv: string[];
  spawnEnvToken: string | undefined;
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

  // T-07-04 / the Codex half of the token decision. This CLI performs NO
  // expansion anywhere on its read path, so any `${...}` sequence in its payload
  // would be handed to the MCP server VERBATIM as the value — always, not merely
  // when the referenced variable is unset. Refuse rather than register a server
  // that authenticates with six literal characters.
  //
  // The shipped detector is called; no second regex is written here. Its output
  // is a list of KEY names, which is also what makes the reason value-free
  // (05-D-11): there is no parameter through which a token could arrive.
  if (!MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli]) {
    const expandable = findExpandableEnvKeys(input.registrationEnv);
    if (expandable.length > 0) {
      return {
        kind: "Skip",
        reason: `Drift did not register with ${MCP_CLI_DISPLAY_NAMES[input.cli]} CLI: the value of ${expandable.join(", ")} carries a variable-reference sequence, and ${MCP_CLI_DISPLAY_NAMES[input.cli]} performs no expansion, so that text would be delivered to the MCP server as the value itself.`,
      };
    }
  }

  // The loud check, and the reason 05-D-10's rejection of reference indirection
  // could be reopened at all: the reference resolves from the CLI's own
  // UN-sanitized parent environment, and a MISSING variable resolves to the
  // empty string — a silently unauthenticated MCP server. Drift controls that
  // environment, so Drift can assert it instead of hoping.
  if (
    MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli] &&
    input.registrationEnv[CAIDO_TOKEN_KEY] === CAIDO_TOKEN_REFERENCE &&
    (input.spawnEnvToken ?? "").trim() === ""
  ) {
    return {
      kind: "Skip",
      reason: `Drift did not register with ${MCP_CLI_DISPLAY_NAMES[input.cli]} CLI: the registration refers to ${CAIDO_TOKEN_KEY} rather than embedding it, and Drift's own spawn environment carries no ${CAIDO_TOKEN_KEY}, so the MCP server would start authenticated as nobody.`,
    };
  }

  return { kind: "Register", argv: input.argv };
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

// ── Gemini/Codex registration payload (Phase 7, PRV-03) ─────────────
//
// Everything below turns ONE Drift-variables dict into the two CLIs' own
// `mcp add` surfaces. It is pure, so it is provable on the Linux CI runner —
// which matters more here than anywhere else in this module, because the
// registration path is the one PRV-03 changes on Windows and `index.ts`, where
// it is called, is not importable under vitest.

const CAIDO_TOKEN_KEY = "CAIDO_TOKEN";

// The reference Gemini expands. Assembled from `EXPANSION_OPENER` — the same
// two-character constant `findExpandableEnvKeys` matches on — rather than
// written as a second literal, so the detector and the thing it detects can
// never disagree, and so this source file still carries no literal
// variable-reference sequence for a downstream tool to mangle.
export const CAIDO_TOKEN_REFERENCE = `${EXPANSION_OPENER}${CAIDO_TOKEN_KEY}}`;

// Which CLI expands `${VAR}` inside a registered server's environment. Both
// verdicts are source-verified, and the pair is read by BOTH the payload builder
// (which substitutes the reference) and the planner (which refuses a reference
// on the CLI that cannot expand it) — one table, two readers.
//
// [VERIFIED: google-gemini/gemini-cli packages/core/src/utils/envExpansion.ts]
//   dotenv-expand over `{ ...process.env, ...extensionEnv }`; a MISSING variable
//   resolves to the empty string, which is why the planner's loud check exists.
// [VERIFIED: openai/codex codex-rs/rmcp-client/src/utils.rs
//   `create_env_for_mcp_server` — `env.insert(name, value)` verbatim, and there
//   is no expansion pass anywhere on that read path.]
const MCP_CLI_EXPANDS_ENV_REFERENCES: Record<McpCliName, boolean> = {
  gemini: true,
  codex: false,
};

// Each CLI's environment-flag spelling. Stated per CLI rather than shared:
// `codex mcp add` has NO `-e` short form at all — its only stdio option is
// `--env KEY=VALUE`
// [VERIFIED: openai/codex codex-rs/cli/src/mcp_cmd.rs, AddMcpStdioArgs] — while
// `gemini mcp add` declares `.option('env', { alias: 'e', … })`
// [VERIFIED: google-gemini/gemini-cli packages/cli/src/commands/mcp/add.ts].
export const MCP_CLI_ENV_FLAG: Record<McpCliName, string> = {
  gemini: "-e",
  codex: "--env",
};

// The scope arguments each CLI's registration WRITE takes.
//
// Gemini's `--scope` DEFAULTS TO `project`, and Drift passed no scope at all
// before this plan. That default resolves to `<process.cwd()>/.gemini/settings.json`
// — not `~/.gemini`, and not anywhere Drift sweeps — and `gemini mcp add`
// HARD-ERRORS with `process.exit(1)` when the working directory IS the home
// directory ("Please use --scope user to edit settings in the home directory").
// Caido's plugin host chooses that cwd, not Drift. So the explicit user scope is
// a DEFECT FIX, not a preference: without it registration can fail on a
// perfectly healthy machine, and when it succeeds it writes a token-bearing
// entry to an unpredictable directory.
// [VERIFIED: google-gemini/gemini-cli packages/cli/src/commands/mcp/add.ts:41-48
//   and packages/core/src/config/storage.ts:163, 293-295]
//
// Codex takes none: its config home is a single global file (`~/.codex/config.toml`,
// or `$CODEX_HOME`), so there is no scope to choose.
// [VERIFIED: openai/codex codex-rs/utils/home-dir/src/lib.rs:13-18]
export const MCP_CLI_REGISTRATION_SCOPES: Record<McpCliName, string[]> = {
  gemini: ["--scope", "user"],
  codex: [],
};

// The scopes a REMOVAL must cover — necessarily a superset of the write scope.
//
// Drift wrote Gemini's entry into the PROJECT scope on every release up to and
// including Phase 5 (no `--scope` argument, hence the default). Removing only
// the user scope after this plan would leave that stale entry in place, still
// pointing at the `mcp-wrapper.sh` this same commit deletes — and a workspace
// entry shadows the user one, so the stale record would win. Both scopes, always
// (07-RESEARCH.md § Pitfall D). 07-04's unconditional startup sweep reads this
// same table rather than restating it.
export const MCP_CLI_REMOVAL_SCOPES: Record<McpCliName, string[][]> = {
  gemini: [
    ["--scope", "user"],
    ["--scope", "project"],
  ],
  codex: [[]],
};

// The registered server name. Both CLIs validate it; `drift` is ASCII
// alphanumeric and passes Codex's `name` check.
export const MCP_CLI_SERVER_NAME = "drift";

// D-03's two keys, named once. See the strip step in the builder below.
const PER_SESSION_ENV_KEYS: readonly string[] = [
  "DRIFT_ACTIVITY_FILE",
  "DRIFT_APPROVALS_FILE",
];

// The registration environment for one CLI: one Drift-variables dict in, one
// per-CLI projection out. Key insertion order is preserved throughout, because
// the Drift-variables byte shape is a CMP-01 surface asserted elsewhere in this
// module and there is no reason for this projection to reorder it.
export function buildMcpCliRegistrationEnv(input: {
  cli: McpCliName;
  driftVars: Record<string, string>;
  approvalChannel: McpApprovalChannel;
  caidoToken: string;
}): Record<string, string> {
  const payload: Record<string, string> = {};

  for (const [key, value] of Object.entries(input.driftVars)) {
    // ── D-03: strip the per-session pair, unconditionally ──
    //
    // Structurally, not by trusting the caller. The obvious instinct is "we pass
    // the environment explicitly, so pass all of it", and that instinct is
    // exactly what this step exists against. A registration-time
    // DRIFT_ACTIVITY_FILE would (a) name a file that does not exist yet, and
    // (b) CLOBBER the live per-session value the CLI inherits at spawn time with
    // a path from a dead session — converting a working approval channel into a
    // permanently-wrong one. For Codex the channel is dead either way; for
    // Gemini it is the whole mechanism (T-07-13).
    if (PER_SESSION_ENV_KEYS.includes(key)) continue;
    payload[key] = value;
  }

  if (input.approvalChannel.kind === "None") {
    // ── D-06's fail-closed, expressed as a PAYLOAD rather than as a runtime
    // refusal ──
    //
    // A tool absent from DRIFT_ALLOWED_TOOLS is never even LISTED to this CLI
    // (`getAvailableTools` in assets/mcp-server.mjs filters `tools/list` on the
    // allowlist), which is a cleaner posture than offering a sensitive tool and
    // refusing it mid-turn — especially for a CLI with no channel to ask
    // through. The filter is the SHARED one derived from the shipped tool
    // definitions; a second hand-written list of sensitive names is the failure
    // mode `excludeSensitiveToolNames` exists to prevent.
    //
    // DRIFT_ALLOWLIST_ACTIVE stays "1". That flag is what makes an empty
    // allowlist mean deny-all rather than allow-all, so dropping it here would
    // turn the strictest case into the most permissive one.
    const allowed = payload.DRIFT_ALLOWED_TOOLS ?? "";
    payload.DRIFT_ALLOWED_TOOLS = excludeSensitiveToolNames(
      allowed === "" ? [] : allowed.split(","),
    ).join(",");
    // Nothing may be marked as requiring confirmation, and the confirm flag goes
    // off: there is no channel to confirm THROUGH, so a tool flagged for
    // confirmation here would simply fail at call time with the unexplained
    // error PRV-05 exists to remove.
    payload.DRIFT_CONFIRMATION_REQUIRED_TOOLS = "";
    payload.DRIFT_CONFIRM_SENSITIVE_ACTIONS = "0";
  }

  payload[CAIDO_TOKEN_KEY] = MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli]
    ? // A REFERENCE, not bytes. Three things this buys, all of them properties
      // the literal does not have: no credential in the CLI's settings file, no
      // credential on the `mcp add` argument list (readable by any process that
      // can enumerate arguments), and no traversal of gemini's `curr.split('=')`
      // value parser — which silently truncates at the first `=` and would hand
      // the MCP server half a token with no error. The cost is the
      // unset-variable failure mode, which the planner above refuses.
      CAIDO_TOKEN_REFERENCE
    : // The literal. The only shape that works for a CLI with no expansion at
      // all, and the accepted residual recorded at the plan's decision
      // checkpoint: the bytes rest in the CLI's own configuration file, outside
      // the swept temp root, until the removal on cleanup or 07-04's
      // unconditional startup sweep takes them out.
      input.caidoToken;

  return payload;
}

// The complete `mcp add` argv for one CLI — everything after the binary itself.
export function buildMcpCliRegistrationArgv(input: {
  cli: McpCliName;
  registrationEnv: Record<string, string>;
  nodeExecutable: string;
  mcpScriptPath: string;
}): string[] {
  const flagPairs: string[] = [];
  for (const [key, value] of Object.entries(input.registrationEnv)) {
    // An empty value is DROPPED rather than emitted as `KEY=`. Gemini's parser
    // does `if (key && value)` after splitting, so it discards such a pair
    // anyway, and the MCP server defaults every one of these keys to "". Making
    // the argv reflect what is actually delivered keeps the two from disagreeing
    // — and keeps a future key whose empty value IS meaningful from looking
    // delivered when it is not.
    if (value === "") continue;
    flagPairs.push(MCP_CLI_ENV_FLAG[input.cli], `${key}=${value}`);
  }

  if (input.cli === "gemini") {
    // FLAGS BEFORE THE POSITIONALS, and this ordering is load-bearing rather
    // than stylistic: gemini's yargs command is `add <name> <commandOrUrl>
    // [args...]` under `parserConfiguration({'unknown-options-as-args': true})`,
    // so anything appearing after the two positionals is swallowed as a SERVER
    // argument instead of being parsed as a flag. A `-e` after `drift` would be
    // passed to the MCP server as argv, not applied to the registration.
    return [
      "mcp",
      "add",
      ...MCP_CLI_REGISTRATION_SCOPES.gemini,
      ...flagPairs,
      MCP_CLI_SERVER_NAME,
      input.nodeExecutable,
      input.mcpScriptPath,
    ];
  }

  // Codex: the name is a leading positional and `command` is `trailing_var_arg`,
  // so the flags sit between the name and the `--` separator, and everything
  // after `--` is the command line the CLI will spawn.
  return [
    "mcp",
    "add",
    MCP_CLI_SERVER_NAME,
    ...flagPairs,
    "--",
    input.nodeExecutable,
    input.mcpScriptPath,
  ];
}
