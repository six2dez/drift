import { spawn } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSpawnPlan,
  escapeCmdArgument,
  escapeCmdCommand,
  needsDoubleEscape,
} from "./spawn-plan";

// PRV-01's integration proof, and the only place in this phase where the spawn
// plan is EXECUTED rather than inspected. It imports the SAME `buildSpawnPlan`,
// `escapeCmdCommand` and `escapeCmdArgument` that `index.ts` calls and drives a
// real `cmd.exe` against a real npm-global-shaped `.cmd` shim — no fixture file
// is committed, and deliberately no local re-derivation of the escaping. A
// second copy of the caret rules inside this file would make the test agree with
// itself instead of with production, which is the whole point of sharing the
// builder.
//
// The skeleton (temp dir + `afterEach` rm, the single timeout constant, the
// timeout-plus-SIGKILL guard) is lifted from `mcp-server-spec.spawn.test.ts`,
// which was itself lifted from `mcp-server.transport.test.ts`.
//
// A NEW CONVENTION FOR THIS REPO, stated so it is a decision rather than a
// drift: this is the first conditionally-gated test file here — a repo-wide
// search for `skipIf`/`runIf`/`describe.skip` returned nothing before it. The
// gate is justified by CMP-01: the macOS and Linux legs must stay byte-identical
// to the pre-Phase-7 tree, and a `cmd.exe` assertion cannot run on them at all.
// On POSIX every case below reports as SKIPPED, which is a visible non-result
// rather than a silent pass.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — read this before citing a green
// run of it. In Phase 3's vehicle-caveat voice, because the distinction is the
// whole reason the caveat exists:
//
//   It proves the spawn plan, the escaping and the cmd.exe argument contract on
//   Windows, under Node.
//
// It does NOT prove `index.ts`'s WIRING of them: `index.ts` cannot be imported
// under vitest (no `caido:plugin` alias), so no test here executes a single line
// of the orchestrator that calls `buildSpawnPlan` in production. It does NOT
// prove Caido's LLRT: `windowsVerbatimArguments` is source-verified in the fork
// and declared in the vendored type surface, but has never been EXECUTED under
// LLRT (assumption A2). And it does NOT prove a real Claude Code CLI attached to
// Drift on a real Windows desktop — SC-1 marks that "where possible" and
// 07-CONTEXT.md places it in Phase 9/10.

// One constant, referenced by every case, so a future raise cannot apply to one
// of them only. 15 s rather than the transport test's 5 s because Windows
// runners are materially slower at process creation and the security scanner
// reads a freshly written script — the correct response to that is a bigger
// budget, not a retry, which would convert a real hang into a flake that passes
// on the second attempt.
const SPAWN_TIMEOUT_MS = 15000;

// The hazard set, as SEPARATE argv elements. Every row is a character class
// 07-RESEARCH.md § Q3 names as reaching cmd's parser from Drift's own arguments.
const HAZARD_ARGS = [
  // A space, an ampersand and a parenthesised segment, all inside one path —
  // the `%TEMP%` shape under a username Drift does not control.
  "C:\\Program Files (x86)\\Jo & Co\\Temp\\drift-mcp-1\\mcp-context.json",
  // Must arrive UNEXPANDED. If cmd expands it, this element comes back as a
  // real temp path instead of the literal text.
  "%TEMP%\\not-expanded",
  // The comma-joined MCP tool allowlist. The comma is in the metacharacter set.
  "mcp__drift__search_history,mcp__drift__replay_request",
  // Pipe, angle brackets, a caret and an embedded double-quoted phrase.
  'a|b<c>d^e "quoted phrase" f',
  // The empty and adjacency edge probes (PRV-02).
  "",
  " ",
];

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

type Fixture = {
  shimPath: string;
  scriptPath: string;
  outputPath: string;
};

// Built at runtime — this repo commits no fixture files (the convention
// `command-resolution.test.ts` already follows for its version-manager trees).
async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), "drift-spawn-plan-"));
  tempDirs.push(root);
  // The directory NAME carries a space and a parenthesis pair on purpose, so the
  // shim path itself exercises `escapeCmdCommand`'s rule and not only the
  // argument rule.
  const dir = path.join(root, "sh im (x86)");
  await mkdir(dir, { recursive: true });

  const outputPath = path.join(dir, "received-argv.json");
  const scriptPath = path.join(dir, "report-argv.mjs");
  await writeFile(
    scriptPath,
    [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(process.argv.slice(2)), "utf-8");`,
      "",
    ].join("\n"),
    "utf-8",
  );

  // Shaped like an npm GLOBAL shim rather than a hand-rolled echo: echoing off,
  // a local scope, then the node executable invoked on the reporter script
  // followed by `%*`. That second parse of the proxied text is the entire
  // mechanism behind open question A1 — a shim that read its arguments directly
  // would answer a different question.
  const shimPath = path.join(dir, "claude.cmd");
  await writeFile(
    shimPath,
    [
      "@ECHO off",
      "SETLOCAL",
      `"${process.execPath}" "${scriptPath}" %*`,
      "",
    ].join("\r\n"),
    "utf-8",
  );

  return { shimPath, scriptPath, outputPath };
}

async function runToCompletion(
  file: string,
  args: string[],
  windowsVerbatimArguments: boolean,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments,
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("spawn did not exit within the timeout"));
    }, SPAWN_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}

async function readReceivedArgv(outputPath: string): Promise<string[]> {
  return JSON.parse(await readFile(outputPath, "utf-8")) as string[];
}

describe.skipIf(process.platform !== "win32")("buildSpawnPlan on a real cmd.exe", () => {
  it(
    "round-trips the hazard set through an npm-global-shaped .cmd shim byte-identically",
    async () => {
      const fixture = await createFixture();

      const plan = buildSpawnPlan({
        command: fixture.shimPath,
        args: HAZARD_ARGS,
        platform: "win32",
      });

      expect(plan.windowsVerbatimArguments).toBe(true);
      const code = await runToCompletion(
        plan.file,
        plan.args,
        plan.windowsVerbatimArguments,
      );

      expect(code).toEqual(0);
      expect(await readReceivedArgv(fixture.outputPath)).toEqual(HAZARD_ARGS);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "refuses a DIRECT spawn of the same .cmd with a synchronous EINVAL — the falsifiability leg for the cmd.exe branch",
    async () => {
      const fixture = await createFixture();

      // The refusal is THROWN synchronously from spawn() by Node's
      // CVE-2024-27980 guard, not emitted as an "error" event, so the try must
      // wrap the spawn CALL (03-FINDINGS.md § P1-CMD). Without this case a green
      // suite proves nothing about whether the cmd.exe branch was needed at all,
      // and a future refactor could silently revert to the direct spawn on a
      // machine where it happens to work.
      let caught: NodeJS.ErrnoException | undefined;
      try {
        const child = spawn(fixture.shimPath, HAZARD_ARGS, {
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.kill("SIGKILL");
      } catch (error) {
        caught = error as NodeJS.ErrnoException;
      }

      expect(caught).toBeDefined();
      expect(caught?.code).toEqual("EINVAL");
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "does NOT round-trip under the opposite double-escaping choice — the falsifiability leg for the escaping",
    async () => {
      const fixture = await createFixture();

      // The module ships upstream's heuristic, which single-escapes a global
      // shim. This case drives the SAME production escaping primitives with the
      // OPPOSITE depth and asserts the round trip breaks. Case one alone could
      // pass under either choice; case one plus this one says the shipped choice
      // is the correct one.
      const shipped = needsDoubleEscape(fixture.shimPath);
      const parts = [
        escapeCmdCommand(fixture.shimPath),
        ...HAZARD_ARGS.map((argument) => escapeCmdArgument(argument, !shipped)),
      ];

      let received: string[] | undefined;
      try {
        await runToCompletion(
          "cmd.exe",
          ["/d", "/s", "/c", `"${parts.join(" ")}"`],
          true,
        );
        received = await readReceivedArgv(fixture.outputPath);
      } catch {
        // A non-zero exit or an unwritten output file is itself the negative
        // result this case is looking for.
        received = undefined;
      }

      expect(received).not.toEqual(HAZARD_ARGS);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "spawns a real .exe directly with no interpreter and still round-trips the hazard set",
    async () => {
      const fixture = await createFixture();

      // The `.exe` arm PRV-01 actually reaches on a native-installer Claude.
      const plan = buildSpawnPlan({
        command: process.execPath,
        args: [fixture.scriptPath, ...HAZARD_ARGS],
        platform: "win32",
      });

      expect(plan.file).toEqual(process.execPath);
      expect(plan.file.toLowerCase().endsWith("cmd.exe")).toBe(false);
      expect(plan.args).toEqual([fixture.scriptPath, ...HAZARD_ARGS]);
      expect(plan.windowsVerbatimArguments).toBe(false);

      const code = await runToCompletion(
        plan.file,
        plan.args,
        plan.windowsVerbatimArguments,
      );

      expect(code).toEqual(0);
      expect(await readReceivedArgv(fixture.outputPath)).toEqual(HAZARD_ARGS);
    },
    SPAWN_TIMEOUT_MS,
  );
});
