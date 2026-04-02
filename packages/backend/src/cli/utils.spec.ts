import { describe, it, expect } from "vitest";
import { stripAnsiCodes, buildCliHistory, filterEchoedInput } from "./utils";
import type { ChatMessage } from "shared";

describe("stripAnsiCodes", () => {
  it("returns empty string for empty input", () => {
    expect(stripAnsiCodes("")).toBe("");
  });

  it("strips CSI color codes", () => {
    expect(stripAnsiCodes("\u001B[31mred\u001B[0m")).toBe("red");
  });

  it("strips bold/underline codes", () => {
    expect(stripAnsiCodes("\u001B[1mbold\u001B[22m")).toBe("bold");
  });

  it("strips OSC sequences", () => {
    expect(stripAnsiCodes("\u001B]0;title\u0007text")).toBe("text");
  });

  it("strips leftover bracket codes", () => {
    expect(stripAnsiCodes("[0mhello[1m")).toBe("hello");
  });

  it("preserves plain text", () => {
    expect(stripAnsiCodes("hello world")).toBe("hello world");
  });

  it("handles mixed content", () => {
    const input = "\u001B[32m✓\u001B[0m Test passed [0min 2ms";
    expect(stripAnsiCodes(input)).toBe("✓ Test passed in 2ms");
  });
});

describe("buildCliHistory", () => {
  const makeMsg = (role: string, content: string): ChatMessage => ({
    id: "1",
    role: role as "user" | "assistant",
    content,
    timestamp: Date.now(),
    providerId: "claude-cli",
  });

  it("returns empty for no history", () => {
    expect(buildCliHistory([], 10, 20000)).toBe("");
  });

  it("formats messages as role: content", () => {
    const msgs = [makeMsg("user", "hello"), makeMsg("assistant", "hi")];
    const result = buildCliHistory(msgs, 10, 20000);
    expect(result).toContain("user: hello");
    expect(result).toContain("assistant: hi");
  });

  it("limits to maxMessages", () => {
    const msgs = Array.from({ length: 20 }, (_, i) =>
      makeMsg("user", `msg ${i}`)
    );
    const result = buildCliHistory(msgs, 5, 100000);
    // Should only have last 5 messages
    expect(result).toContain("msg 15");
    expect(result).toContain("msg 19");
    expect(result).not.toContain("msg 14");
  });

  it("limits to maxChars", () => {
    const msgs = [
      makeMsg("user", "a".repeat(100)),
      makeMsg("assistant", "b".repeat(100)),
    ];
    // maxChars = 50, should only include the last message (truncated)
    const result = buildCliHistory(msgs, 10, 50);
    // Result includes "assistant: " prefix (12) + up to 50 chars content + "\n\n" (2)
    expect(result.length).toBeLessThanOrEqual(70);
  });

  it("ends with double newline", () => {
    const msgs = [makeMsg("user", "test")];
    const result = buildCliHistory(msgs, 10, 20000);
    expect(result).toMatch(/\n\n$/);
  });
});

describe("filterEchoedInput", () => {
  it("removes lines that match prompt", () => {
    const prompt = "Hello world\nHow are you";
    const stdout = "Hello world\nI'm fine\nHow are you\nThanks";
    expect(filterEchoedInput(stdout, prompt)).toBe("I'm fine\nThanks");
  });

  it("handles empty stdout", () => {
    expect(filterEchoedInput("", "prompt")).toBe("");
  });

  it("handles empty prompt", () => {
    expect(filterEchoedInput("output line", "")).toBe("output line");
  });

  it("trims whitespace from lines", () => {
    const prompt = "hello";
    const stdout = "  hello  \n  world  ";
    expect(filterEchoedInput(stdout, prompt)).toBe("world");
  });

  it("ignores blank lines", () => {
    const stdout = "line1\n\n\nline2\n\n";
    expect(filterEchoedInput(stdout, "")).toBe("line1\nline2");
  });
});
