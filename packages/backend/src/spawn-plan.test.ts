import { describe, expect, it } from "vitest";

import {
  buildSpawnPlan,
  CMD_INTERPRETED_EXTENSIONS,
  CMD_META_CHARACTERS,
  DEFAULT_COMSPEC,
  escapeCmdArgument,
  escapeCmdCommand,
  needsDoubleEscape,
} from "./spawn-plan";

// Every input below is passed as a literal, which is the entire point of
// `spawn-plan.ts` being pure: the module reads no `process.env`, no `os` and no
// module-level singleton, so the whole cmd.exe contract — including the parts
// that only matter on Windows — is provable on the Linux CI runner. The
// maintainer cannot test native Windows locally, so this file IS the win32
// proof for the escaping shape; `spawn-plan.win32.test.ts` is the separate,
// win32-gated proof that the shape survives a real cmd.exe.
//
// The describe/it titles are a CONTRACT with 07-VALIDATION.md, which addresses
// each row by `-t "<name>"` — renaming one silently unhooks a requirement from
// its verification.

// A Windows-shaped npm GLOBAL shim: `%APPDATA%\npm\claude.cmd` is what
// `npm i -g @anthropic-ai/claude-code` actually produces, and it is NOT under
// `node_modules\.bin\`. That distinction is the whole of the A1 question.
const GLOBAL_SHIM = "C:\\Users\\jo\\AppData\\Roaming\\npm\\claude.cmd";
const NATIVE_EXE = "C:\\Users\\jo\\AppData\\Local\\Programs\\claude\\claude.exe";

// The number of ARGUMENT SEPARATORS in an assembled command line: a space that
// is not itself an escaped metacharacter. Every space INSIDE an argument or a
// command carries a caret prefix, so this counts element boundaries only, which
// is what the adjacency probe needs (a whole-string match would not notice two
// elements merging into one).
function countSeparators(commandLine: string): number {
  return [...commandLine.matchAll(/(?<!\^) /g)].length;
}

describe("buildSpawnPlan — POSIX passthrough (CMP-01)", () => {
  it("returns the command and argv unchanged on darwin, linux and an undefined platform", () => {
    for (const platform of ["darwin", "linux", undefined] as const) {
      const args = ["-p", "--output-format", "stream-json", "hello world"];
      const plan = buildSpawnPlan({
        command: "/usr/local/bin/claude",
        args,
        platform,
      });

      expect(plan.file).toEqual("/usr/local/bin/claude");
      expect(plan.args).toEqual([
        "-p",
        "--output-format",
        "stream-json",
        "hello world",
      ]);
      expect(plan.windowsVerbatimArguments).toBe(false);
    }
  });

  it("returns a fresh argv array so a caller's array cannot be mutated through the plan", () => {
    const args = ["-p", "hi"];
    const plan = buildSpawnPlan({
      command: "/usr/local/bin/claude",
      args,
      platform: "darwin",
    });

    plan.args.push("mutated");

    expect(args).toEqual(["-p", "hi"]);
  });
});

describe("buildSpawnPlan — win32 direct spawn", () => {
  it("spawns a .exe directly with no cmd.exe layer and verbatim arguments off", () => {
    const plan = buildSpawnPlan({
      command: NATIVE_EXE,
      args: ["-p", "hi"],
      platform: "win32",
    });

    expect(plan.file).toEqual(NATIVE_EXE);
    expect(plan.args).toEqual(["-p", "hi"]);
    expect(plan.windowsVerbatimArguments).toBe(false);
  });

  it("spawns an extensionless command directly — there is nothing for cmd.exe to interpret", () => {
    const plan = buildSpawnPlan({
      command: "C:\\tools\\claude",
      args: ["-p", "hi"],
      platform: "win32",
    });

    expect(plan.file).toEqual("C:\\tools\\claude");
    expect(plan.args).toEqual(["-p", "hi"]);
    expect(plan.windowsVerbatimArguments).toBe(false);
  });
});

describe("buildSpawnPlan — win32 cmd.exe branch (SC-2)", () => {
  it("routes a .cmd shim through cmd.exe with /d /s /c, one outer quote pair and verbatim arguments on", () => {
    const plan = buildSpawnPlan({
      command: GLOBAL_SHIM,
      args: ["-p", "hi"],
      platform: "win32",
    });

    expect(plan.file).toEqual(DEFAULT_COMSPEC);
    expect(plan.args).toHaveLength(4);
    expect(plan.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    const commandLine = plan.args[3] ?? "";
    expect(commandLine.startsWith('"')).toBe(true);
    expect(commandLine.endsWith('"')).toBe(true);
    expect(plan.windowsVerbatimArguments).toBe(true);
  });

  it("matches the interpreted extensions case-insensitively so .CMD and .BAT take the cmd.exe branch", () => {
    for (const command of ["C:\\npm\\claude.CMD", "C:\\npm\\claude.BAT"]) {
      const plan = buildSpawnPlan({ command, args: [], platform: "win32" });

      expect(plan.file).toEqual(DEFAULT_COMSPEC);
      expect(plan.windowsVerbatimArguments).toBe(true);
    }
  });

  it("reads the shipped Windows extension list rather than restating it, minus the directly spawnable .exe", () => {
    expect(CMD_INTERPRETED_EXTENSIONS).toEqual([".cmd", ".bat"]);
  });

  it("emits no trailing separator when the argument list is empty", () => {
    const plan = buildSpawnPlan({
      command: "C:\\npm\\claude.cmd",
      args: [],
      platform: "win32",
    });

    expect(plan.args[3]).toEqual('"C:\\npm\\claude.cmd"');
    expect(countSeparators(plan.args[3] ?? "")).toEqual(0);
  });

  it("preserves argument order and keeps two byte-identical arguments in their original positions", () => {
    const plan = buildSpawnPlan({
      command: "C:\\npm\\claude.cmd",
      args: ["a", "b", "a", "c", "d"],
      platform: "win32",
    });

    expect(plan.args[3]).toEqual(
      '"C:\\npm\\claude.cmd ^"a^" ^"b^" ^"a^" ^"c^" ^"d^""',
    );
  });

  it("keeps an empty-string argument and a single-space argument as their own distinct elements", () => {
    const plan = buildSpawnPlan({
      command: "C:\\npm\\claude.cmd",
      args: ["", " ", "after"],
      platform: "win32",
    });

    // Three arguments after the command means exactly three separators; a
    // vanished or merged element would show up as two.
    expect(countSeparators(plan.args[3] ?? "")).toEqual(3);
    expect(plan.args[3]).toEqual(
      '"C:\\npm\\claude.cmd ^"^" ^"^ ^" ^"after^""',
    );
  });

  it("uses the injected comspec when one is supplied and falls back to cmd.exe otherwise", () => {
    const explicit = buildSpawnPlan({
      command: GLOBAL_SHIM,
      args: [],
      platform: "win32",
      comspec: "C:\\Windows\\System32\\cmd.exe",
    });
    expect(explicit.file).toEqual("C:\\Windows\\System32\\cmd.exe");

    const empty = buildSpawnPlan({
      command: GLOBAL_SHIM,
      args: [],
      platform: "win32",
      comspec: "",
    });
    expect(empty.file).toEqual("cmd.exe");

    const absent = buildSpawnPlan({
      command: GLOBAL_SHIM,
      args: [],
      platform: "win32",
    });
    expect(absent.file).toEqual("cmd.exe");
  });
});

describe("escapeCmdArgument", () => {
  it("caret-prefixes every character in the exported metacharacter set", () => {
    // Driven from the exported constant, so widening the set updates this
    // expectation instead of leaving it stale.
    for (const character of CMD_META_CHARACTERS) {
      expect(escapeCmdArgument(character, false)).toContain(`^${character}`);
    }
  });

  it("covers the characters Drift's own arguments actually carry", () => {
    for (const character of [
      " ",
      "&",
      "(",
      ")",
      ",",
      "|",
      "<",
      ">",
      "!",
      "^",
      "%",
    ]) {
      expect(CMD_META_CHARACTERS).toContain(character);
    }
  });

  it("caret-prefixes both percent signs so a literal %TEMP% cannot be re-expanded by cmd", () => {
    expect(escapeCmdArgument("%TEMP%", false)).toEqual('^"^%TEMP^%^"');
  });

  it("doubles a backslash run that ends the argument", () => {
    expect(escapeCmdArgument("C:\\foo\\", false)).toEqual('^"C:\\foo\\\\^"');
  });

  it("doubles a backslash run that precedes a double quote and escapes the quote", () => {
    expect(escapeCmdArgument('a\\"b', false)).toEqual('^"a\\\\\\^"b^"');
  });

  it("applies the caret pass twice when the double-escape flag is set", () => {
    expect(escapeCmdArgument("a b", true)).toEqual('^^^"a^^^ b^^^"');
  });
});

describe("escapeCmdCommand", () => {
  it("applies the caret pass only and adds no surrounding quotes, because /s strips the FIRST and LAST quote of the whole line", () => {
    const escaped = escapeCmdCommand(
      "C:\\Program Files (x86)\\npm\\claude.cmd",
    );

    expect(escaped).toEqual("C:\\Program^ Files^ ^(x86^)\\npm\\claude.cmd");
    expect(escaped.startsWith('"')).toBe(false);
    expect(escaped.endsWith('"')).toBe(false);
  });
});

describe("needsDoubleEscape", () => {
  it("is true for a node_modules/.bin cmd-shim, which re-parses its proxied arguments", () => {
    expect(
      needsDoubleEscape("C:\\project\\node_modules\\.bin\\claude.cmd"),
    ).toBe(true);
    expect(needsDoubleEscape("/project/node_modules/.bin/claude.cmd")).toBe(
      true,
    );
  });

  it("is false for an npm GLOBAL shim, which is Drift's actual target (open question A1)", () => {
    expect(needsDoubleEscape(GLOBAL_SHIM)).toBe(false);
    expect(needsDoubleEscape(NATIVE_EXE)).toBe(false);
  });
});
