export const CliProvider = {
  Claude: "claude-cli",
  Gemini: "gemini-cli",
  Codex: "codex-cli",
  Copilot: "copilot-cli",
} as const;

export type CliProvider = (typeof CliProvider)[keyof typeof CliProvider];

export const CLI_PROVIDER_DISPLAY_NAMES: Record<CliProvider, string> = {
  [CliProvider.Claude]: "Claude Code",
  [CliProvider.Gemini]: "Gemini CLI",
  [CliProvider.Codex]: "Codex CLI",
  [CliProvider.Copilot]: "Copilot CLI",
};

export const CLI_PROVIDER_DEFAULT_COMMANDS: Record<CliProvider, string> = {
  [CliProvider.Claude]: "claude",
  [CliProvider.Gemini]: "gemini",
  [CliProvider.Codex]: "codex",
  [CliProvider.Copilot]: "copilot",
};

// One install command per platform family. `posix` covers macOS and Linux, which
// install every one of these CLIs identically; `win32` covers Windows. Two arms
// holding ONE command each, rather than a list per arm: the hint is an
// error-banner sentence, not documentation, and a single monospace span is what
// the frontend help panel can render. Where a vendor offers several first-party
// Windows routes, the arm carries the one that vendor's own install block
// presents first.
export type ProviderInstallCommands = {
  posix: string;
  win32: string;
};

// Actionable install command per provider. This table lived in the backend's
// command-resolution module until now. It moved here because these strings reach
// THREE surfaces — the chat error banner, Settings → CLI Providers, and the
// frontend help panel — and were hand-copied into each one, while the backend
// table was about to gain a second platform arm and double that drift surface.
//
// Keyed by the CliProvider union above, not by bare string literals: that keying
// is what makes an omitted provider — or an omitted platform arm — a compile
// error rather than a runtime gap in a user-facing error message.
//
// The module stays DATA ONLY: no imports, no I/O. It is loaded by both Caido's
// constrained backend runtime and the browser frontend, and has to keep loading
// in both. Rendering lives in the backend's hint renderer and in the help panel.
//
// CHANGELOG.md records the commands version 0.1.0 shipped. It is deliberately
// NOT wired to this table and must NOT be retro-edited: it is a record of what
// shipped, not a claim about what to install today.
export const PROVIDER_INSTALL_COMMANDS: Record<CliProvider, ProviderInstallCommands> = {
  // macOS/Linux: unchanged, byte for byte, from the string shipping today.
  // Windows: the PowerShell one-liner that fetches and runs the Windows install
  // script — the form the vendor's own tabbed install block leads with.
  // [VERIFIED: code.claude.com/docs/en/setup, § Install Claude Code]
  [CliProvider.Claude]: {
    posix: "curl -fsSL https://claude.ai/install.sh | bash",
    win32: "irm https://claude.ai/install.ps1 | iex",
  },
  // The same global package install on both arms, unchanged from today.
  // [VERIFIED: github.com/google-gemini/gemini-cli README, § Install globally
  // with npm] — checked against Google's OWN repository, not the npm registry
  // alone, because registry resolution does not confer verification: a
  // slopsquatted name also resolves. The research carried this name in from the
  // shipping codebase tagged [ASSUMED] for exactly that reason; the first-party
  // check clears the tag. The string itself is unchanged either way — the tag
  // and the citation are all that moved.
  [CliProvider.Gemini]: {
    posix: "npm install -g @google/gemini-cli",
    win32: "npm install -g @google/gemini-cli",
  },
  // The same global package install on both arms, unchanged from today.
  // [CITED: github.com/openai/codex README]. The concern recorded earlier about
  // a missing Windows build is RESOLVED: the package now publishes both Windows
  // architecture variants (codex-win32-x64 and codex-win32-arm64) as optional
  // dependencies scoped to the same publisher, so this hint needs no Windows
  // caveat. The vendor also offers a PowerShell installer; it is deliberately
  // not carried here, because its documented invocation relaxes a Windows
  // script-running setting and that guidance belongs to UX-03 / Phase 10.
  [CliProvider.Codex]: {
    posix: "npm install -g @openai/codex",
    win32: "npm install -g @openai/codex",
  },
  // D-14. The current package install, on BOTH arms. It REPLACES the `gh` CLI
  // extension command Drift has been printing (github/gh-copilot), and the
  // replacement is not Windows-only: UX-02's own wording is "replacing". That
  // extension was deprecated on 2025-10-25 in favour of the standalone CLI, and
  // its upstream repository was archived read-only on 2025-10-30 — so the string
  // shipping today points macOS and Linux users at a dead repository just as
  // surely as it would point a Windows user there. Shipping the right command on
  // one platform while knowingly leaving the wrong one on the others would be a
  // deliberate defect against the entire current user base.
  // [VERIFIED: docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli]
  // for the replacement; [VERIFIED: github.com/github/gh-copilot] for both dates
  // — its own banner carries the deprecation notice and the archive date.
  [CliProvider.Copilot]: {
    posix: "npm install -g @github/copilot",
    win32: "npm install -g @github/copilot",
  },
};

export type ProviderConfig = {
  command: string;
  enabled: boolean;
};

// Whether Drift's per-session approval + activity channel actually reaches the
// MCP server a given CLI spawns. Shaped like `planMcpCliRegistration`'s
// discriminated union (mcp-server-spec.ts) rather than a bare boolean, so the
// no-channel arm is forced to carry the sentence that explains itself.
//
// Approvals and the activity trace are ONE channel (D-07): `waitForApproval`
// in mcp-server.mjs refuses when EITHER per-session file path is empty, so
// there is exactly one verdict, one sentence and one pair of env keys.
export type McpApprovalChannel =
  | { kind: "Delivered" }
  | { kind: "None"; limitation: string };

// The single source of truth for what each CLI can do with Drift's MCP server.
// ONE table, TWO surfaces (D-04): the tool policy sent to that CLI, and the
// sentence the user reads on the Settings → CLI Providers card. A second
// hand-maintained list is the failure mode this table exists to prevent.
//
// Keyed by the CliProvider union, so an omitted provider is a compile error
// rather than a runtime `undefined` that would silently reach the fail-closed
// arm meant for genuinely unknown ids.
//
// The verdicts below are SOURCE-VERIFIED, never measured: the upstream
// implementations were read, no CLI binary was executed. Report them at that
// strength and no higher (D-05's vehicle caveat).
export const PROVIDER_MCP_APPROVAL_CHANNELS: Record<CliProvider, McpApprovalChannel> = {
  // Claude Code receives DRIFT_ACTIVITY_FILE / DRIFT_APPROVALS_FILE directly in
  // the per-session `--mcp-config` document Drift writes for it, so the channel
  // does not depend on environment inheritance at all.
  [CliProvider.Claude]: { kind: "Delivered" },
  // Gemini forwards its OWN process environment to the stdio MCP server it
  // spawns, and Drift already injects the per-session vars into the gemini
  // child, so both keys arrive without any new Drift mechanism.
  // [VERIFIED: google-gemini/gemini-cli packages/core/src/tools/mcp-client.ts,
  // stdio branch of the transport factory — `finalEnv` is seeded from
  // `sanitizeEnvironment({...process.env, ...extensionEnv})`.]
  // A redaction pass DOES run there
  // [VERIFIED: google-gemini/gemini-cli packages/core/src/services/environmentSanitization.ts,
  // NEVER_ALLOWED_NAME_PATTERNS], but none of its name patterns (/TOKEN/i,
  // /SECRET/i, /KEY/i, /AUTH/i, …) match DRIFT_ACTIVITY_FILE or
  // DRIFT_APPROVALS_FILE, so the two Drift per-session keys survive it.
  // RE-CHECK POINT, not a settled fact: google-gemini/gemini-cli#28863 is OPEN
  // and moves toward MORE sanitization, and the sanitizer's strict mode (set by
  // GITHUB_SHA / SURFACE=Github) drops everything outside a 25-name allow-list
  // that contains no DRIFT_*. If that PR lands, re-read the deny list here.
  [CliProvider.Gemini]: { kind: "Delivered" },
  // Codex does NOT forward. Its launcher calls `env_clear()` unconditionally and
  // rebuilds the child environment from a fixed whitelist plus whatever the
  // config names, so no DRIFT_* or CAIDO_* variable reaches the MCP server.
  // [VERIFIED: openai/codex codex-rs/rmcp-client/src/stdio_server_launcher.rs —
  // `.env_clear().envs(&envs)`; codex-rs/rmcp-client/src/utils.rs
  // `create_env_for_mcp_server` builds `envs` from DEFAULT_ENV_VARS.]
  // The `env_vars` config array WOULD have carried names rather than values and
  // solved this, but no registration flag can add to that whitelist: the entire
  // stdio option surface of `codex mcp add` is `--env KEY=VALUE`
  // [VERIFIED: openai/codex codex-rs/cli/src/mcp_cmd.rs, AddMcpStdioArgs], and
  // its `-c` config overrides are validated but "not currently applied".
  //
  // This is a positive negative result, not an inconclusive one — the sentence
  // says so, and must not be softened to "could not be determined".
  [CliProvider.Codex]: {
    kind: "None",
    limitation:
      "Drift is registered with Codex CLI and Codex can use Drift's read-only tools, but Codex builds a clean environment for the MCP servers it starts, so Drift cannot deliver approval prompts to it and sensitive tools are turned off.",
  },
  // Copilot receives the per-session values in the `env` dictionary of the
  // `--additional-mcp-config` document Drift writes for it, so — like Claude —
  // the channel does not ride environment inheritance.
  [CliProvider.Copilot]: { kind: "Delivered" },
};

// D-06, the THIRD instance of the house fail-closed pattern, not a fresh
// judgement: `planMcpCliRegistration` returns `Skip` on an unknown platform
// rather than falling through to the POSIX arm, and the MCP server's allowlist
// treats an empty list as deny-all. The asymmetry that justifies it: failing
// closed costs a capability the user might have, and never grants one they do
// not — and the tools in question are the SENSITIVE group (replay, intercept,
// workflow, findings, environment).
//
// The non-happy branch is written FIRST and the branch ORDER is part of the
// contract: there is no input at all on which an unrecognised id reaches the
// table read.
export function providerMcpApprovalChannel(id: string): McpApprovalChannel {
  if (!isCliProvider(id)) {
    return {
      kind: "None",
      limitation:
        "Drift could not recognise this CLI provider, so sensitive tools are turned off.",
    };
  }
  return PROVIDER_MCP_APPROVAL_CHANNELS[id];
}

function isCliProvider(id: string): id is CliProvider {
  // `Object.values(...).includes(...)` rather than an `in` check: `in` walks the
  // prototype chain, so "toString" and "constructor" would read as known ids.
  return (Object.values(CliProvider) as string[]).includes(id);
}

// What this provider can DO, not merely whether it is present.
//
// PD-01: `available: boolean` answered a narrower question than the product now
// needs. A Codex that is installed, resolved and registered but cannot receive
// approval prompts is a genuinely WORKING provider with a stated limitation —
// and the only advisory channel the old shape had was `error`, which paints the
// status dot red and tells the user their working provider is broken. The
// limitation is not an error and must never ride the error channel.
//
// The boolean is not deprecated alongside this field, it is REMOVED: leaving it
// would let a stale consumer keep compiling against the narrower question. It
// survives only as the derived `isProviderUsable` predicate below.
export type ProviderCapability = "available" | "limited" | "unavailable";

export type ProviderStatus = {
  id: string;
  capability: ProviderCapability;
  resolvedPath?: string;
  error?: string;
  // Present only on a "limited" reading. Every sentence written here must read
  // as "registered, but limited" ON ITS OWN — the skip-reason map that also
  // feeds it carries no kind discriminator (D-08).
  limitation?: string;
};

// The demoted boolean. An absent status is not usable; a limited one IS.
export function isProviderUsable(status: ProviderStatus | undefined): boolean {
  return status !== undefined && status.capability !== "unavailable";
}
