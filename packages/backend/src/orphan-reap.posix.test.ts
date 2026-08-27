import { type ChildProcess, spawn } from "child_process";
import { mkdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildOrphanKillPlan,
  buildSessionOrphanScanPlan,
  MCP_SERVER_SCRIPT_NAME,
  MCP_TEMP_DIR_PREFIX,
  parseOrphanScanPids,
} from "./kill-plan";

// The behavioural proof for the ORPHAN reap — the mechanism that terminates a
// token-bearing `mcp-server.mjs` Drift did not spawn, whose parent Drift did not
// spawn either, and on which Drift holds no handle (UAT gap 4). It imports the
// SAME `buildSessionOrphanScanPlan`, `parseOrphanScanPids` and
// `buildOrphanKillPlan` that `index.ts` calls, and deliberately re-derives
// NOTHING: a locally spelled pattern would make this file agree with itself
// instead of with production, which is the rule
// `mcp-server-spec.spawn.test.ts:12-19` states and the reason the builders are
// shared at all.
//
// VEHICLE CAVEAT — READ THIS BEFORE CITING A GREEN RUN OF THIS FILE. Stated
// before any result, in the voice `kill-tree.posix.test.ts` uses, because the
// distinction is the whole reason the caveat exists.
//
// This runs under NODE, and it executes NOT ONE LINE of `index.ts`, which
// declares no `caido:plugin` alias and cannot be imported by any test this
// project can run. What a green run proves is precisely this: the production
// pattern SELECTS the right process and TERMINATES it, and REJECTS the two wrong
// ones. What it does not prove is that Caido's LLRT can spawn `pgrep` at all, or
// that `reapMcpOrphans`'s own spawn/timeout/classify wiring behaves on that
// runtime — the classification is asserted separately and purely in
// `kill-plan.test.ts`, and the wiring is a residual this suite does not reach.
//
// Note also what this mechanism does NOT depend on, because it is the point of
// the phase: no process GROUP is referenced anywhere below. A6 was measured
// FALSE on 2026-08-27 (codex pid 43921 in pgid 43752, its `mcp-server.mjs` child
// pid 44284 in pgid 44284), so the fixtures are spawned detached — into neither
// the test's group nor their parent's — precisely to prove the reap reaches them
// anyway.

// One constant, referenced by every case as `it`'s third argument, so a future
// raise cannot apply to one of them only.
const ORPHAN_REAP_TIMEOUT_MS = 15000;

// Long enough for a signal to be delivered and for the target to be reaped, and
// bounded so a failure is a failure rather than a hang. Used SYMMETRICALLY by
// the proof and by BOTH controls: each waits exactly as long before asserting
// its fixture's state, so no result can be an artefact of a different budget.
const SETTLE_MS = 1000;

// The fixtures idle for this long and then exit on their own, so a failed case
// leaks nothing even if every kill in it misses.
const FIXTURE_LIFETIME_MS = 20000;

// Two 20-hex tokens of exactly the shape `genShortToken` (`index.ts`) emits.
// Distinct, because the whole of CONTROL 1 is that a marker which is not the one
// scanned for does not match.
const TOKEN_A = "a1b2c3d4e5f60718293a";
const TOKEN_B = "0f9e8d7c6b5a49382716";

// The deliberately WRONG prefix for CONTROL 2: right script name, right token,
// directory prefix that is not Drift's. It is spelled here because this test
// CREATES the fixture; the production prefix comes from the imported constant.
const DECOY_PREFIX = "drift-not-mcp-";

const tempDirs: string[] = [];
const strayPids: number[] = [];

afterEach(async () => {
  for (const pid of strayPids.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

// A positive-pid signal-0 liveness probe. `0` sends no signal and only performs
// the existence and permission checks, so a throw means "no such process" in
// every case this file can produce. Wrapped because the throw is the answer.
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

type Fixture = { dirName: string; pid: number };

// Built at runtime with NOTHING committed — the convention
// `kill-tree.posix.test.ts` and `command-resolution.test.ts` already follow. The
// shape is the one UAT gap 4 measured: `node <root>/<dirName>/mcp-server.mjs`,
// spawned DETACHED so it is in neither this process's group nor its parent's,
// which is exactly the situation a group signal cannot reach.
async function spawnMcpFixture(
  root: string,
  dirName: string,
): Promise<Fixture> {
  const dir = path.join(root, dirName);
  await mkdir(dir, { recursive: true });

  const scriptPath = path.join(dir, MCP_SERVER_SCRIPT_NAME);
  await writeFile(
    scriptPath,
    [
      "// Idles, then exits on its own so a failed case leaks nothing.",
      `setTimeout(() => { process.exit(0); }, ${String(FIXTURE_LIFETIME_MS)});`,
      "",
    ].join("\n"),
    "utf-8",
  );

  const child: ChildProcess = spawn(process.execPath, [scriptPath], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  const pid = child.pid;
  if (pid === undefined) throw new Error("fixture did not spawn");
  strayPids.push(pid);
  return { dirName, pid };
}

// The enumerator, run for real from the PRODUCTION plan. The pattern is never
// spelled in this file — that is the point of importing the builder.
function runScan(dirName: string): Promise<number[]> {
  const plan = buildSessionOrphanScanPlan({
    platform: process.platform === "linux" ? "linux" : "darwin",
    sessionDirName: dirName,
  });
  if (plan.kind !== "spawn") {
    throw new Error(`expected a scan plan, received kind=${plan.kind}`);
  }

  return new Promise((resolve, reject) => {
    const scanner = spawn(plan.file, plan.args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    const timer = setTimeout(
      () => reject(new Error("scan did not answer")),
      ORPHAN_REAP_TIMEOUT_MS / 2,
    );
    scanner.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    scanner.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    scanner.on("close", () => {
      clearTimeout(timer);
      // Through the PRODUCTION parser, with this test's own pid excluded for the
      // same reason `reapMcpOrphans` passes an exclusion list at all.
      resolve(parseOrphanScanPids({ stdout: out, excludePids: [process.pid] }));
    });
  });
}

// Kill each returned pid through the PRODUCTION plan. The operand is positive
// because `buildOrphanKillPlan` renders it so; nothing here re-spells it.
function killThroughPlan(pids: number[]): void {
  for (const pid of pids) {
    const plan = buildOrphanKillPlan({ pid, platform: "darwin" });
    if (plan.kind !== "spawn") continue;
    spawn(plan.file, plan.args, { stdio: "ignore" });
  }
}

describe.skipIf(process.platform === "win32")(
  "POSIX orphan reap by argv marker (LIF-02 / UAT gap 4)",
  () => {
    // All three fixtures are created and reaped inside ONE arrangement per case,
    // so the proof and both controls observe the SAME reap rather than three
    // separate ones — a control that watched a different reap would prove
    // nothing about this one.
    async function arrangeAndReap(): Promise<{
      target: Fixture;
      otherToken: Fixture;
      wrongPrefix: Fixture;
    }> {
      const root = path.join(
        os.tmpdir(),
        `drift-orphan-reap-${String(process.pid)}-${String(Date.now())}`,
      );
      await mkdir(root, { recursive: true });
      tempDirs.push(root);

      const target = await spawnMcpFixture(
        root,
        `${MCP_TEMP_DIR_PREFIX}${TOKEN_A}`,
      );
      const otherToken = await spawnMcpFixture(
        root,
        `${MCP_TEMP_DIR_PREFIX}${TOKEN_B}`,
      );
      const wrongPrefix = await spawnMcpFixture(
        root,
        `${DECOY_PREFIX}${TOKEN_A}`,
      );

      killThroughPlan(await runScan(`${MCP_TEMP_DIR_PREFIX}${TOKEN_A}`));
      await settle();

      return { target, otherToken, wrongPrefix };
    }

    it(
      "terminates the marked MCP child even though it is in its own process group",
      async () => {
        const fixtures = await arrangeAndReap();

        expect(isAlive(fixtures.target.pid)).toBe(false);
      },
      ORPHAN_REAP_TIMEOUT_MS,
    );

    it(
      "CONTROL: an mcp-server.mjs under a DIFFERENT drift-mcp token survives",
      async () => {
        // Without this the blast radius is unbounded: a pattern that matched
        // `mcp-server\.mjs` alone would pass the case above and take every MCP
        // server on the machine with it, including another Caido project's.
        const fixtures = await arrangeAndReap();

        expect(isAlive(fixtures.otherToken.pid)).toBe(true);
      },
      ORPHAN_REAP_TIMEOUT_MS,
    );

    it(
      "CONTROL: an mcp-server.mjs under a DIFFERENT directory prefix survives",
      async () => {
        // Right script name, right token, wrong prefix. This is the half of the
        // identity that a pattern anchored only on the token would lose.
        const fixtures = await arrangeAndReap();

        expect(isAlive(fixtures.wrongPrefix.pid)).toBe(true);
      },
      ORPHAN_REAP_TIMEOUT_MS,
    );
  },
);
