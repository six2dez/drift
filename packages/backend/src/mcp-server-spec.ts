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

  // WR-06. The FAIL-CLOSED guard, and the only one on this path that can
  // actually fire in production.
  //
  // `buildMcpCliRegistrationArgv` DROPS any pair whose value is "" — deliberately,
  // because gemini's own parser discards `KEY=` anyway and an argv that claims to
  // deliver something it does not is worse than one that says nothing. The
  // consequence nobody had written down: an empty CAIDO_TOKEN produces a
  // `codex mcp add` argv with NO CAIDO_TOKEN flag at all, `mcp-server.mjs`
  // defaults the variable to "", and the server starts SILENTLY UNAUTHENTICATED
  // in the user's own `~/.codex/config.toml`. That is exactly the failure mode
  // 05-D-10 rejected `${VAR}` indirection to avoid, arrived at by a different
  // road.
  //
  // The Gemini arm above cannot catch it: it is gated on
  // MCP_CLI_EXPANDS_ENV_REFERENCES, which is false for Codex. So this check is
  // deliberately CLI-INDEPENDENT and reads `registrationEnv` — the dict that is
  // actually written into the CLI's configuration file — rather than any
  // environment a caller composed on the side. Gemini's payload carries the
  // reference literal, which is non-empty, so this is a no-op there and the
  // symmetry costs nothing.
  //
  // Why it lives HERE and not at the call site: today the case is unreachable
  // only because requireMcpServerSpec refuses an empty token, and that function
  // is in `index.ts` — a file no test this project can run is able to import. A
  // safety property whose only proof is an invariant in an unassertable file is
  // not a proven property. Moving the refusal into the pure layer is what makes
  // it one, and it is the same argument the whole module rests on.
  //
  // Value-free by construction, like every other reason in this module: the
  // sentence names the KEY and never the bytes (05-D-11).
  if ((input.registrationEnv[CAIDO_TOKEN_KEY] ?? "").trim() === "") {
    return {
      kind: "Skip",
      reason: `Drift did not register with ${MCP_CLI_DISPLAY_NAMES[input.cli]} CLI: the registration would carry no ${CAIDO_TOKEN_KEY}, so the MCP server would start authenticated as nobody.`,
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

// ── Scopes, named once ─────────────────────────────────────────────
//
// Both CLIs' configuration lives under a SCOPE, and the register path and the
// remove path read the same names from here. That is the whole point: a scope
// Drift can write and cannot remove is exactly the orphan holding a live Caido
// session token that PRV-03 exists to prevent, and two lists that agree today
// are not the same thing as one list that cannot disagree.
export const MCP_CLI_UNSCOPED = "unscoped";

// `user` and `project` are Gemini's two settings scopes; `unscoped` is the
// marker for a CLI whose configuration is a single global file and which
// therefore takes no scope argument at all.
export type McpCliRemovalScope = "user" | "project" | typeof MCP_CLI_UNSCOPED;

// Every scope name this module can produce, so the remediation record below is
// TOTAL over the type rather than partial with a fallback nobody exercises.
const MCP_CLI_REMOVAL_SCOPE_VALUES: readonly McpCliRemovalScope[] = [
  "user",
  "project",
  MCP_CLI_UNSCOPED,
];

// One scope name in, that CLI's scope arguments out. The flag SPELLING lives
// here and nowhere else, so the registration argv, the removal argv and the
// remediation command a user pastes are all the same three characters.
function mcpCliScopeArgs(scope: McpCliRemovalScope): string[] {
  return scope === MCP_CLI_UNSCOPED ? [] : ["--scope", scope];
}

// The scope each CLI's registration WRITES into. Read by
// `MCP_CLI_REGISTRATION_SCOPES` below and by the removal scope list, which is
// what makes "a scope Drift writes is always a scope Drift removes" structural.
const MCP_CLI_WRITE_SCOPE: Record<McpCliName, McpCliRemovalScope> = {
  gemini: "user",
  codex: MCP_CLI_UNSCOPED,
};

// The scopes a REMOVAL must cover — necessarily a SUPERSET of the write scope,
// and the write scope is read from the record above rather than repeated.
//
// Drift wrote Gemini's entry into the working-directory (`project`) scope on
// every release up to and including Phase 5, because it passed no `--scope` at
// all and that is the default. Removing only the user scope would leave every
// pre-upgrade entry in place — and a workspace entry SHADOWS the user one, so
// the stale record would win (07-RESEARCH.md § Q4 DEFECT 1, Pitfall D).
//
// Sweeping the working-directory scope unconditionally is safe, and the concern
// that it might not be was real and specific: `gemini mcp add` carries a guard
// that terminates the process with a non-zero status when the scope is
// `project` and the working directory IS the user's home, and Drift passes no
// working directory — so a plugin host launched from the user profile would
// trip it on every start and paint a permanent, false credential-may-remain
// banner on the provider card. That guard is ADD-ONLY.
// [VERIFIED: google-gemini/gemini-cli — `packages/cli/src/commands/mcp/add.ts:41-48`
//   is the only site carrying the `inHome` / `process.exit(1)` guard.
//   `packages/cli/src/commands/mcp/remove.ts:26-30` carries NO such guard and,
//   for a server name that is not present, logs a debug line and RETURNS:
//   `if (!mcpServers[name]) { debugLogger.log(...); return; }` — an ordinary
//   zero exit. Read from that project's source during this plan's research run,
//   not recalled: the sweep's entire signal quality rests on it, and
//   `classifyMcpRemoveExit` below is the backstop for the day it changes.]
const MCP_CLI_REMOVAL_SCOPE_NAMES: Record<
  McpCliName,
  readonly McpCliRemovalScope[]
> = {
  // The write scope FIRST, then the historical one. Stable order so a log
  // reading is reproducible.
  gemini: [MCP_CLI_WRITE_SCOPE.gemini, "project"],
  codex: [MCP_CLI_WRITE_SCOPE.codex],
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
  gemini: mcpCliScopeArgs(MCP_CLI_WRITE_SCOPE.gemini),
  codex: mcpCliScopeArgs(MCP_CLI_WRITE_SCOPE.codex),
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

// ── Removal: the policy, the classifier and the security line ───────
//
// 07-03 moved a live Caido session token into two external CLI configuration
// files that live OUTSIDE the temp root `sweepOrphanedMcpTempDirs` watches.
// Everything below is the other half of that trade. It is pure for the same
// reason the registration half is: `index.ts`, where the removal actually runs,
// declares no `caido:plugin` alias and cannot be imported by any test this
// project can run, so a policy decided there is unverifiable by construction.

// One scope and the complete argv that removes Drift's entry from it.
export type McpCliRemovalPlanEntry = {
  scope: McpCliRemovalScope;
  argv: string[];
};

// The argv builder both the policy and the remediation string read, so the
// operation name, the flag ordering and the server name are written once.
function buildMcpCliRemovalArgv(scope: McpCliRemovalScope): string[] {
  return ["mcp", "remove", ...mcpCliScopeArgs(scope), MCP_CLI_SERVER_NAME];
}

// Every removal one CLI needs, in a stable order.
//
// The policy carries NO notion of what is currently registered, and that is
// deliberate rather than lazy: both CLIs' removal implementations exit ZERO
// whether or not an entry existed (Codex prints "No MCP server named 'drift'
// found." and returns `Ok(())` without even rewriting its config; Gemini logs a
// debug line and returns), so an unconditional removal is idempotent and needs
// no state to consult. State would be worse than useless here — the entry this
// most needs to remove is the one a CRASHED Drift left behind, which by
// definition no live map remembers.
//
// `platform` is accepted and DELIBERATELY not read. Every other predicate in
// this module fails closed by skipping on an unknown platform; this one inverts
// that, because the cost of skipping a removal is a credential left behind
// rather than a capability withheld. The parameter is here so that inversion is
// assertable — and so a future platform gate has to be added on purpose, past
// this comment, rather than slipped in.
export function planMcpCliRemoval(input: {
  cli: McpCliName;
  platform: Platform | undefined;
}): McpCliRemovalPlanEntry[] {
  return MCP_CLI_REMOVAL_SCOPE_NAMES[input.cli].map((scope) => ({
    scope,
    // A fresh array per call. A caller that mutates what it was handed must not
    // be able to change what the next caller removes.
    argv: buildMcpCliRemovalArgv(scope),
  }));
}

// What a removal spawn's exit code MEANS. Two members, and the first one is
// named for what Drift can actually observe: a zero exit tells it the CLI's
// configuration no longer carries a `drift` entry, and says NOTHING about
// whether one was deleted or was never there. Distinguishing those would take
// the CLI's own stdout — the one input this path refuses to accept.
// A THIRD member, added for WR-05. `unusable` is "the removal never ran", and it
// is a different fact from "the removal ran and failed" in the only way that
// matters here: the first says nothing about whether a credential remains, and
// the second says one may.
export type McpRemoveOutcome = "removed-or-absent" | "failed" | "unusable";

// The structural backstop for the day upstream changes.
//
// Only `"failed"` reaches the security formatter. Today the common case cannot
// produce it: the scope entry above records, from that project's source, that
// `gemini mcp remove` carries no home-directory guard and returns cleanly for
// an absent server. This function exists so a future upstream guard cannot
// silently convert the unconditional sweep into a permanent false banner on the
// provider card — a warning that fires on every start teaches the user to
// ignore the one message that matters, which would defeat SC-3's whole point.
//
// WR-05: the exit code ALONE could not tell those two apart, and the gap was not
// theoretical. `spawnAndWait` resolves a SYNTHETIC `code: 1` when the spawn threw
// or emitted `error` - an EINVAL, an ENOENT, a binary deleted between resolve and
// spawn. Classifying that as `failed` put "a Caido session token may remain" on
// the provider card and in the console on EVERY start, which is precisely the
// alarm-fatigue outcome the paragraph above names as the thing to prevent. So the
// caller now hands over whether the process started at all, and only a removal
// that genuinely RAN can produce `failed`.
//
// `spawnFailed` is REQUIRED rather than optional, deliberately. An optional flag
// defaulting to false would let a new call site silently reintroduce the defect
// while every existing assertion stayed green - which is how the missing
// `comspec` shipped (CR-01).
//
// The residual, recorded rather than papered over: a removal that DID run and
// exited non-zero for a reason that is not a removal failure - a `gemini` old
// enough to reject `--scope` on `mcp remove`, a CLI with no `mcp remove`
// subcommand - is still classified `failed`. Separating those needs the CLI's own
// stderr, and this path refuses to accept output text on purpose (T-07-05): a CLI
// that echoes its configuration back on an error would put a live token onto the
// provider card and into the support bundle. A false SECURITY line is the
// cheaper of the two failures, and it is bounded by the scope entries above being
// source-verified against each CLI's current implementation.
//
// Its inputs are the exit code, the CLI and whether the spawn started. No output
// text, so it keeps the same no-value-parameter property the formatter has, and a
// future maintainer who wants to match on stderr has to widen the signature to do
// it.
//
// `cli` is accepted and DELIBERATELY not read, in the same voice planMcpCliRemoval
// uses for its `platform`: the parameter is here so a per-CLI classification has
// to be added on purpose, past this comment, rather than slipped in.
export function classifyMcpRemoveExit(input: {
  cli: McpCliName;
  exitCode: number;
  spawnFailed: boolean;
}): McpRemoveOutcome {
  if (input.spawnFailed) return "unusable";
  return input.exitCode === 0 ? "removed-or-absent" : "failed";
}

function buildMcpCliRemoveRemediation(
  cli: McpCliName,
): Record<McpCliRemovalScope, string> {
  const commands = {} as Record<McpCliRemovalScope, string>;
  for (const scope of MCP_CLI_REMOVAL_SCOPE_VALUES) {
    commands[scope] = [cli, ...buildMcpCliRemovalArgv(scope)].join(" ");
  }
  return commands;
}

// The paste-able command per CLI and scope, derived from the SAME argv builder
// the policy uses. A scope rename therefore moves the removal and the user's
// remediation together, or neither — it cannot leave the user holding a command
// that does not work. Total over every scope name the type allows, so the
// formatter needs no fallback branch nobody exercises.
export const MCP_CLI_REMOVE_REMEDIATION: Record<
  McpCliName,
  Record<McpCliRemovalScope, string>
> = {
  gemini: buildMcpCliRemoveRemediation("gemini"),
  codex: buildMcpCliRemoveRemediation("codex"),
};

// WR-04. The line for the case the sweep CANNOT cover, and the reason it has to
// exist at all.
//
// `sweepStaleMcpCliRegistrations` calls itself unconditional and lists the four
// gates it deliberately does not carry. It carries two it never mentioned: an
// empty command field, and a command `resolveCommand` cannot resolve. Both are
// unavoidable — the sweep removes an entry by SHELLING THE CLI'S OWN `mcp
// remove`, so with no binary there is no removal to run — but the residual they
// leave is the highest-value case the sweep exists for. Drift is hard-killed
// while Codex is registered; the user then uninstalls, renames or moves the
// binary, or clears the field; every subsequent start silently skips the
// removal; and a literal Caido session token stays in `~/.codex/config.toml`
// forever — outside the temp root, outside `sweepOrphanedMcpTempDirs`, and
// outside every promise the README makes.
//
// So the residual is SAID OUT LOUD, with the paste-able commands. The wording
// differs per CLI because the exposure genuinely does: Codex's entry embeds the
// token bytes, Gemini's carries a reference that expands from an environment
// Drift no longer supplies. Both are worth removing; only one is a credential
// sitting in a file.
//
// CONDITIONAL by construction — "if Drift ever registered" — because that is the
// honest claim. Drift cannot know across process lifetimes whether it ever
// registered with a CLI it can no longer even locate: `registeredMcpCliPaths` is
// process-lifetime state and the run that crashed took its record with it. The
// alternative was to say nothing, which is what shipped.
//
// Value-free like every other renderer here: it takes a CLI name and reads two
// module tables. The user's command string is NOT a parameter — it would be the
// one value on this path that a support bundle should not necessarily carry, and
// naming the CLI is enough to act on.
export function formatMcpSweepBlockedResidual(input: {
  cli: McpCliName;
}): string {
  // The scopes THIS CLI's policy removes, not every scope the type allows: a
  // codex user must not be handed `codex mcp remove --scope user drift`, which
  // that CLI does not accept. Read from the same table planMcpCliRemoval
  // iterates, so a new scope reaches the sweep and this sentence together.
  const commands = MCP_CLI_REMOVAL_SCOPE_NAMES[input.cli]
    .map((scope) => MCP_CLI_REMOVE_REMEDIATION[input.cli][scope])
    .join(", ");
  const exposure = MCP_CLI_EXPANDS_ENV_REFERENCES[input.cli]
    ? `that entry carries a ${CAIDO_TOKEN_KEY} reference rather than the token bytes, and it can shadow the entry Drift writes next`
    : `that entry carries your Caido session token in plain text`;
  return (
    `[drift] Drift could not locate the ${input.cli} CLI, so it could not remove ` +
    `a Drift MCP entry from that CLI's own configuration. If Drift ever ` +
    `registered with ${input.cli} on this machine, ${exposure}. Remove it with: ` +
    commands
  );
}

// The line for the THIRD outcome (WR-05), and the reason it is a separate
// function rather than a softer parameter on the one below: the two sentences
// make opposite claims. `formatMcpRemoveFailure` says a credential MAY REMAIN;
// this one says only that Drift could not run the removal, which is what the
// evidence actually supports when no process ever started. A single renderer
// with a flag would have made it possible to emit the security wording for a
// spawn that never happened, which is the defect.
//
// No "SECURITY" marker and no remediation command. A user cannot act on a
// removal that failed to start the way they can act on one that ran and failed -
// the CLI's own binary is what is in question - and putting the paste-able
// command here would spend the one alarm SC-3 reserves for a real residual.
//
// Same three-scalar shape as every other renderer in this module: no parameter
// through which output text could arrive (T-07-05).
export function formatMcpRemoveUnusable(input: {
  cli: McpCliName;
  scope: McpCliRemovalScope;
}): string {
  const where =
    input.scope === MCP_CLI_UNSCOPED
      ? `${input.cli} is unscoped`
      : `scope=${input.scope}`;
  return (
    `[drift] ${input.cli} mcp remove (${where}) could not be started, so no ` +
    `removal ran. This is not a report that anything was left behind.`
  );
}

// SC-3's "a failed remove is logged, not dropped", rendered.
//
// THREE SCALARS, and the safety comes from there being no parameter through
// which a value can arrive — not from anyone remembering the rule. This is the
// same design `formatSpawnDebugLine` above states for the session debug line,
// and the same rule `platform.ts:262` states at the merge point.
//
// Rejected, and recorded here so it is not re-proposed: passing the CLI's
// stderr through a redaction pass. It fails for exactly the reason this file
// already gives for rejecting a whole-environment redaction regex — it protects
// only what someone thought to enumerate — and a CLI that echoes its own
// configuration back on an error is precisely the case nobody enumerated. The
// text would land in `skippedMcpCliReasons`, which renders on the Settings ->
// CLI Providers card and is exported in the support bundle (T-07-05).
export function formatMcpRemoveFailure(input: {
  cli: McpCliName;
  scope: McpCliRemovalScope;
  exitCode: number;
}): string {
  const where =
    input.scope === MCP_CLI_UNSCOPED
      ? `${input.cli} is unscoped`
      : `scope=${input.scope}`;
  return (
    `[drift] SECURITY: ${input.cli} mcp remove (${where}) exited ` +
    `${String(input.exitCode)} — a Drift MCP entry carrying a Caido session ` +
    `token may remain in this CLI's configuration. Remove it with: ` +
    MCP_CLI_REMOVE_REMEDIATION[input.cli][input.scope]
  );
}

// T-07-08. Every outstanding scope, not just the first one iteration happened to
// yield.
//
// The single-scope caller this replaces read `[...outstanding.keys()][0]`, so a
// CLI whose removal failed in BOTH of its scopes named one of them and left the
// other unmentioned — with a live token behind it. Gemini is the CLI that has
// two scopes, and a stale `project` entry shadowing a `user` one is exactly the
// upgrade case the dual-scope sweep exists for, so the truncation landed on the
// case it was least affordable on.
//
// Returns `undefined` rather than an empty string when nothing is outstanding:
// the caller's two branches are "there is a security line" and "there is not",
// and an empty string is a value that reads as the first while behaving as the
// second.
//
// Iteration order is the map's insertion order, which
// `recordMcpCliRemovalOutcome` fills in the order `planMcpCliRemoval` yields —
// `MCP_CLI_REMOVAL_SCOPE_NAMES[cli]` — so it is stable and the rendered text
// does not reshuffle between two runs that failed identically.
//
// Joined on a SENTENCE BOUNDARY, not a bare space. Each line ends with a
// paste-able remediation command, and running that command straight into the
// next line's `[drift] SECURITY:` leaves the user selecting where one command
// stops by eye. The whole point of carrying the command is that it can be
// copied without thought.
const REMOVE_FAILURE_SEPARATOR = "\n";

export function formatMcpRemoveFailures(input: {
  cli: McpCliName;
  outstanding: ReadonlyMap<McpCliRemovalScope, number>;
}): string | undefined {
  const lines = [...input.outstanding.entries()].map(([scope, exitCode]) =>
    formatMcpRemoveFailure({ cli: input.cli, scope, exitCode }),
  );
  return lines.length === 0
    ? undefined
    : lines.join(REMOVE_FAILURE_SEPARATOR);
}
