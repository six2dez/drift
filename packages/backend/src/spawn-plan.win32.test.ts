import { spawn } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { selectComspec } from "./platform";
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
        comspec: selectComspec({
          env: process.env,
          platform: "win32",
          systemRootFallback: "",
        }),
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
    "round-trips under the OPPOSITE double-escaping depth as well — the A1 measurement, recorded rather than assumed",
    async () => {
      const fixture = await createFixture();

      // THIS CASE ASSERTED THE OPPOSITE UNTIL A REAL RUNNER SAID OTHERWISE, and
      // the original expectation is left described here because deleting it
      // would hide the measurement. 07-RESEARCH.md's open question A1 predicted
      // that escaping depth would DISCRIMINATE on an npm-global-shaped shim: one
      // depth round-trips, the other corrupts. Run 32563348727 measured that BOTH
      // depths round-trip the full hazard set byte-identically on
      // windows-latest.
      //
      // The mechanism, now that the answer is in hand: after `/s` strips the one
      // outer quote pair, each argument is still wrapped in its OWN quote pair,
      // and `%*` proxies those quotes into the shim's second parse. Inside
      // quotes cmd treats `&`, `|`, `<` and `>` as ordinary text, so the quoting
      // — not the caret depth — is what survives the second parse. The extra
      // caret layer is consumed harmlessly.
      //
      // What this does NOT license: dropping the caret pass. Escaping depth is
      // not load-bearing on THIS shim shape; escaping ITSELF is, and the next
      // case is the leg that proves it. The module keeps upstream's heuristic
      // unchanged, because a depth that is merely harmless here is still the
      // depth a decade of cross-spawn use has exercised everywhere else.
      const shipped = needsDoubleEscape(fixture.shimPath);
      expect(shipped).toBe(false);

      const parts = [
        escapeCmdCommand(fixture.shimPath),
        ...HAZARD_ARGS.map((argument) => escapeCmdArgument(argument, !shipped)),
      ];
      const code = await runToCompletion(
        "cmd.exe",
        ["/d", "/s", "/c", `"${parts.join(" ")}"`],
        true,
      );

      expect(code).toEqual(0);
      expect(await readReceivedArgv(fixture.outputPath)).toEqual(HAZARD_ARGS);
    },
    SPAWN_TIMEOUT_MS,
  );

  it(
    "does NOT round-trip with the caret pass removed — the falsifiability leg for the escaping",
    async () => {
      const fixture = await createFixture();

      // Without this case a green suite proves nothing about whether the
      // escaping was needed at all, and a future refactor could delete the caret
      // pass and stay green. It drives the same shim with the same production
      // command escaping but hands the argument through BARE quoting — the
      // `"…"` wrap with no caret pass — and asserts cmd mangles it.
      //
      // Deliberately ONE argument, and deliberately the percent one. The full
      // hazard set unescaped carries `&`, `|`, `<` and `>` outside any quote
      // pair, which would make cmd run and redirect fragments of a Drift
      // argument on the CI runner's filesystem. A falsifiability leg must not
      // be the most dangerous line in the suite; `%` discriminates just as
      // sharply and expands to text rather than to an action.
      const percentArgument = "%TEMP%\\not-expanded";
      expect(HAZARD_ARGS).toContain(percentArgument);

      const parts = [
        escapeCmdCommand(fixture.shimPath),
        `"${percentArgument}"`,
      ];
      const code = await runToCompletion(
        "cmd.exe",
        ["/d", "/s", "/c", `"${parts.join(" ")}"`],
        true,
      );

      expect(code).toEqual(0);
      expect(await readReceivedArgv(fixture.outputPath)).not.toEqual([
        percentArgument,
      ]);
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

  // CR-01's leg, added after a post-execution code review found that every
  // production call site omitted `comspec`, so `file` was always the BARE
  // literal `cmd.exe` — resolved by a Windows search order that includes the
  // current working directory, on the one branch that carries a literal Caido
  // session token to `codex mcp add`.
  //
  // Why this leg exists at all, stated plainly: the fix landed with zero
  // real-Windows coverage. `platform.test.ts` proves `selectComspec` picks the
  // right STRING from an injected dict on any host, and the source scan proves
  // the argument is PRESENT at all five call sites — but neither proves the
  // value that arrives on a real Windows machine is a spawnable interpreter.
  // Every gate this phase built was aimed one argument to the left of the
  // defect; this is the one aimed at `file`.
  //
  // It reads the REAL environment rather than an injected fixture, because the
  // property under test is "what a genuine Windows host supplies", which an
  // injected dict cannot falsify.
  it(
    "resolves an ABSOLUTE interpreter from the real environment and executes through it (CR-01)",
    async () => {
      const fixture = await createFixture();

      const comspec = selectComspec({
        env: process.env,
        platform: "win32",
        // EMPTY on purpose, and this is the discriminating choice rather than a
        // placeholder. The property under test is "what a genuine Windows host
        // supplies in its environment"; handing this call a derived fallback
        // would let the assertion below pass through the fallback rung even if
        // the environment read had regressed, which is precisely the failure
        // this case exists to catch. The derived rung is proven from literal
        // inputs in platform.test.ts, where it can be falsified.
        systemRootFallback: "",
      });

      // The discriminating assertion. A regression that drops the env read
      // returns `undefined` here, `buildSpawnPlan` falls back to the bare
      // literal, and the round-trip below would still pass — which is exactly
      // how the Critical survived every other gate. Assert the interpreter is
      // absolute BEFORE proving it runs.
      expect(comspec).toBeDefined();
      expect(path.isAbsolute(comspec as string)).toBe(true);
      expect((comspec as string).toLowerCase()).toContain("cmd.exe");

      const plan = buildSpawnPlan({
        command: fixture.shimPath,
        args: HAZARD_ARGS,
        platform: "win32",
        comspec,
      });

      // The plan carries the resolved absolute path, NOT the fallback literal.
      expect(plan.file).toEqual(comspec);
      expect(plan.file).not.toEqual("cmd.exe");

      const code = await runToCompletion(
        plan.file,
        plan.args,
        plan.windowsVerbatimArguments,
      );

      // An absolute interpreter must round-trip the hazard set identically to
      // the bare one: the fix closes a resolution hole and changes nothing
      // about the escaping contract.
      expect(code).toEqual(0);
      expect(await readReceivedArgv(fixture.outputPath)).toEqual(HAZARD_ARGS);
    },
    SPAWN_TIMEOUT_MS,
  );
});
