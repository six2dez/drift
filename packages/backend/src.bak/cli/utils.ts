import { existsSync, accessSync, constants } from "fs";
import { join } from "path";
import type { ChatMessage } from "shared";

/**
 * Strip ANSI escape codes from text.
 * Ported from burp-ai-agent/backends/cli/CliBackend.kt
 */
export function stripAnsiCodes(text: string): string {
  if (!text) return text;
  let result = text;
  // CSI sequences: ESC [ ... letter
  result = result.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, "");
  // OSC sequences: ESC ] ... BEL
  result = result.replace(/\u001B\][^\u0007]*\u0007/g, "");
  // Other escape sequences
  result = result.replace(
    /\u001B[><=][^\u0007\u001B\\]*[\u0007\u001B\\]/g,
    ""
  );
  // Leftover bracket codes
  result = result.replace(/\[\d+m/g, "");
  return result;
}

/**
 * Build a text transcript from chat history for stateless CLIs.
 * Ported from burp-ai-agent ChatSessionManager.buildCliHistory()
 */
export function buildCliHistory(
  history: ChatMessage[],
  maxMessages: number,
  maxChars: number
): string {
  if (history.length === 0) return "";

  const trimmed = history.slice(-maxMessages);
  // Build from newest to oldest, then reverse (avoids O(n^2) unshift)
  const reversed: ChatMessage[] = [];
  let total = 0;

  for (let i = trimmed.length - 1; i >= 0; i--) {
    const msg = trimmed[i]!;
    const len = msg.role.length + 2 + msg.content.length;
    if (total + len > maxChars && reversed.length > 0) break;
    if (len > maxChars && reversed.length === 0) {
      reversed.push({
        ...msg,
        content: msg.content.slice(0, Math.max(maxChars, 1)),
      });
      break;
    }
    reversed.push(msg);
    total += len;
  }

  reversed.reverse();
  return reversed.map((m) => `${m.role}: ${m.content}`).join("\n") + "\n\n";
}

/**
 * Filter echoed input lines from CLI output.
 */
export function filterEchoedInput(
  stdout: string,
  prompt: string
): string {
  const inputLines = new Set(
    prompt
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
  );

  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !inputLines.has(l))
    .join("\n")
    .trim();
}

/**
 * Resolve a command name to an absolute path by searching PATH.
 * Ported from burp-ai-agent CliBackend.resolveCommand()
 */
export function resolveCommand(
  command: string,
  extraPath?: string
): string | null {
  // If already absolute, verify it exists
  if (command.startsWith("/")) {
    return existsSync(command) ? command : null;
  }

  const pathEnv = [extraPath, process.env["PATH"]].filter(Boolean).join(":");
  const dirs = pathEnv.split(":").filter((d) => d.length > 0);

  for (const dir of dirs) {
    const candidate = join(dir, command);
    try {
      if (existsSync(candidate)) {
        accessSync(candidate, constants.X_OK);
        return candidate;
      }
    } catch {
      // not executable, continue
    }
  }

  return null;
}

/**
 * Build an enhanced PATH that includes common local bin directories.
 */
export function buildEnhancedPath(): string {
  const home = process.env["HOME"] ?? "";
  const commonDirs = [
    `${home}/.local/bin`,
    `${home}/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    `${home}/.cargo/bin`,
    `${home}/.nvm/current/bin`,
  ];

  const systemPath = process.env["PATH"] ?? "";
  const allDirs = [...commonDirs, ...systemPath.split(":")];
  return [...new Set(allDirs.filter((d) => d.length > 0))].join(":");
}
