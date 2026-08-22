import { describe, expect, it } from "vitest";
import {
  CliProvider,
  PROVIDER_MCP_APPROVAL_CHANNELS,
  isProviderUsable,
  providerMcpApprovalChannel,
  type McpApprovalChannel,
  type ProviderCapability,
} from "./cli-providers";
import {
  MCP_TOOL_DEFINITIONS,
  SENSITIVE_MCP_TOOL_NAMES,
  excludeSensitiveToolNames,
} from "./mcp";

// `packages/shared/src` loads in BOTH Caido's constrained backend runtime and
// the browser, so everything asserted here is plain data plus pure functions.
// That is also why this suite can exist at all: `index.ts` cannot be imported
// under vitest, so the capability level and the per-CLI approval-channel table
// were deliberately placed here rather than in the backend (D-04).
//
// The describe/it titles are a CONTRACT with 07-VALIDATION.md, which addresses
// rows by `-t "<name>"` — renaming one silently unhooks a requirement.

describe("PROVIDER_MCP_APPROVAL_CHANNELS", () => {
  it("has an entry for every provider in the CliProvider union", () => {
    const providerIds = Object.values(CliProvider);
    expect(Object.keys(PROVIDER_MCP_APPROVAL_CHANNELS).sort()).toEqual(
      [...providerIds].sort(),
    );
    for (const id of providerIds) {
      expect(PROVIDER_MCP_APPROVAL_CHANNELS[id]).toBeDefined();
    }
  });

  it("reports a working inherited channel for Gemini", () => {
    expect(PROVIDER_MCP_APPROVAL_CHANNELS[CliProvider.Gemini]).toEqual({
      kind: "Delivered",
    });
  });

  it("reports no channel for Codex, with a limitation sentence", () => {
    const channel = PROVIDER_MCP_APPROVAL_CHANNELS[CliProvider.Codex];
    expect(channel.kind).toBe("None");
    if (channel.kind !== "None") throw new Error("unreachable");
    expect(channel.limitation.trim()).not.toBe("");
  });

  it("reports a working channel for Claude and Copilot, whose config documents carry the per-session files directly", () => {
    expect(PROVIDER_MCP_APPROVAL_CHANNELS[CliProvider.Claude]).toEqual({
      kind: "Delivered",
    });
    expect(PROVIDER_MCP_APPROVAL_CHANNELS[CliProvider.Copilot]).toEqual({
      kind: "Delivered",
    });
  });

  it("states Codex's limitation as a positive negative result, not as an inconclusive one", () => {
    const channel = PROVIDER_MCP_APPROVAL_CHANNELS[CliProvider.Codex];
    if (channel.kind !== "None") throw new Error("unreachable");
    // The evidence is source-verified (`env_clear()` then a fixed whitelist), so
    // the sentence must name the MECHANISM. "could not be determined" would
    // round a strong negative down to an inconclusive one.
    expect(channel.limitation).toContain("clean environment");
    expect(channel.limitation.toLowerCase()).not.toContain("could not be determined");
    expect(channel.limitation.toLowerCase()).not.toContain("unknown");
  });

  it("carries no limitation sentence that claims the provider is unregistered or unsupported (D-08)", () => {
    // The map that renders these sentences carries no kind discriminator, so
    // every sentence must read as "registered, but limited" ON ITS OWN, beside
    // 05-D-03's older "not yet supported" sentence for a different state.
    const forbidden = [
      "not registered",
      "never registered",
      "not attached",
      "not yet supported",
      "not supported",
      "unsupported",
      "no provider config",
    ];
    const entries = Object.values(PROVIDER_MCP_APPROVAL_CHANNELS);
    expect(entries.length).toBeGreaterThan(0);
    for (const channel of entries) {
      if (channel.kind !== "None") continue;
      const sentence = channel.limitation.toLowerCase();
      for (const phrase of forbidden) {
        expect(sentence).not.toContain(phrase);
      }
      // ...and it must positively confirm the attachment.
      expect(sentence).toContain("registered");
    }
  });
});

describe("providerMcpApprovalChannel", () => {
  it("returns the table entry for a known provider id", () => {
    for (const id of Object.values(CliProvider)) {
      expect(providerMcpApprovalChannel(id)).toEqual(
        PROVIDER_MCP_APPROVAL_CHANNELS[id],
      );
    }
  });

  it("fails closed on an empty provider id", () => {
    const channel = providerMcpApprovalChannel("");
    expect(channel.kind).toBe("None");
    if (channel.kind !== "None") throw new Error("unreachable");
    expect(channel.limitation.trim()).not.toBe("");
  });

  it("fails closed on an arbitrary unknown provider id", () => {
    const channel = providerMcpApprovalChannel("aider-cli");
    expect(channel.kind).toBe("None");
    if (channel.kind !== "None") throw new Error("unreachable");
    expect(channel.limitation.trim()).not.toBe("");
  });

  it("never returns the working arm for an id outside the union", () => {
    for (const id of ["", "aider-cli", "__proto__", "constructor", "toString"]) {
      const channel: McpApprovalChannel = providerMcpApprovalChannel(id);
      expect(channel.kind).not.toBe("Delivered");
    }
  });
});

describe("isProviderUsable", () => {
  // Exhaustive record keyed by the union: a future FOURTH capability member is
  // a compile error here rather than an untested branch.
  const USABLE_BY_CAPABILITY: Record<ProviderCapability, boolean> = {
    available: true,
    limited: true,
    unavailable: false,
  };

  it("agrees with the capability level for every member of the union", () => {
    for (const [capability, expected] of Object.entries(USABLE_BY_CAPABILITY)) {
      expect(
        isProviderUsable({
          id: "claude-cli",
          capability: capability as ProviderCapability,
        }),
      ).toBe(expected);
    }
  });

  it("treats an absent status as not usable", () => {
    expect(isProviderUsable(undefined)).toBe(false);
  });

  it("treats a limited provider as usable — a stated limitation is not a failure (PD-01)", () => {
    expect(
      isProviderUsable({
        id: "codex-cli",
        capability: "limited",
        resolvedPath: "/usr/local/bin/codex",
        limitation: "anything",
      }),
    ).toBe(true);
  });
});

describe("SENSITIVE_MCP_TOOL_NAMES", () => {
  it("equals exactly the names the shipped tool definitions mark sensitive", () => {
    // Computed from MCP_TOOL_DEFINITIONS rather than restated, so a tool flipped
    // to sensitive updates both sides at once.
    const expected = MCP_TOOL_DEFINITIONS.filter((tool) => tool.sensitive).map(
      (tool) => tool.name as string,
    );
    expect([...SENSITIVE_MCP_TOOL_NAMES]).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("contains no tool the definitions mark non-sensitive", () => {
    const nonSensitive = MCP_TOOL_DEFINITIONS.filter((tool) => !tool.sensitive).map(
      (tool) => tool.name as string,
    );
    for (const name of nonSensitive) {
      expect(SENSITIVE_MCP_TOOL_NAMES).not.toContain(name);
    }
  });
});

describe("excludeSensitiveToolNames", () => {
  it("removes exactly the sensitive names and preserves order and duplicates of the rest", () => {
    const input = [
      "search_history",
      "send_request",
      "get_request",
      "search_history",
      "run_workflow",
      "list_projects",
    ];
    expect(excludeSensitiveToolNames(input)).toEqual([
      "search_history",
      "get_request",
      "search_history",
      "list_projects",
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(excludeSensitiveToolNames([])).toEqual([]);
  });

  it("returns an empty array when every input name is sensitive — the deny-all shape", () => {
    expect(excludeSensitiveToolNames([...SENSITIVE_MCP_TOOL_NAMES])).toEqual([]);
  });

  it("passes through a name that is not a known tool at all", () => {
    expect(excludeSensitiveToolNames(["not_a_tool", "send_request"])).toEqual([
      "not_a_tool",
    ]);
  });
});
