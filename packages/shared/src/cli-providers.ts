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

export type ProviderStatus = {
  id: string;
  available: boolean;
  resolvedPath?: string;
  error?: string;
};
