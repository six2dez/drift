import { type ChildProcess, spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { buildKillTreePlan, shouldDetachProviderSpawn } from "./kill-plan";

// LIF-02's behavioural proof, and the only place in this phase where a process
// tree is actually torn down rather than described. It imports the SAME
// `buildKillTreePlan` and `shouldDetachProviderSpawn` that `index.ts` calls, and
// deliberately re-derives NOTHING: a locally spelled argv would make this file
// agree with itself instead of with production, which is the rule
// `mcp-server-spec.spawn.test.ts:12-19` states and the reason the builder is
// shared at all.
//
// VEHICLE CAVEAT — READ THIS BEFORE CITING A GREEN RUN OF THIS FILE. Stated
// before any result, in Phase 3's vehicle-caveat voice, because the distinction
// is the whole reason the caveat exists.
//
// This runs under NODE. Node's `detached: true` is `setsid()`; Caido's LLRT is
// `setpgid(0, 0)`. BOTH yield a pgid equal to the child's own pid, and that is
// the ONLY property the group-kill argv depends on — so the MECHANISM transfers.
// The RUNTIME does not. No CI leg in this repository executes LLRT, and Phase
// 8's Wave-0 spike that would have closed the question on real hardware was
// waived on 2026-08-24 without being run, so assumption A1 ("the shipped Caido
// LLRT honours `detached`") reads **OPEN — not measured** in `08-SPIKE.md`.
//
// So: a green run here proves that the production plan's argv brings down a real
// process group on the platform the shipping user base runs. It does NOT prove
// that Caido's LLRT creates that group in the first place, and it does NOT prove
// that a real provider CLI keeps its `mcp-server.mjs` child inside it (A6, also
// **OPEN — not measured**). Nor does it execute one line of `index.ts`, which
// declares no `caido:plugin` alias and cannot be imported by any test this
// project can run; the wiring is asserted statically in `index.source.test.ts`.

// One constant, referenced by every case as `it`'s third argument, so a future
// raise cannot apply to one of them only. Process creation plus two settles is
// well under this on every runner measured; the budget is deliberately generous
// rather than retried, which would turn a real hang into a flake that passes on
// the second attempt.
const KILL_TREE_TIMEOUT_MS = 15000;

// Long enough for a signal to be delivered and for the target to be reaped, and
// bounded so a failure is a failure rather than a hang. Used SYMMETRICALLY by
// both cases: the control waits exactly as long before asserting the grandchild
// is still alive as the proof waits before asserting it is not, so neither
// result can be an artefact of a different budget.
const SETTLE_MS = 1000;

// The fixture children idle for this long and then exit on their own, so a
// failed case leaks nothing even if every kill in it misses.
const FIXTURE_LIFETIME_MS = 20000;

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

type FixtureTree = {
  parentPid: number;
  grandchildPid: number;
  parentExited: Promise<void>;
};

// A positive-pid signal-0 liveness probe. `0` sends no signal and only performs
// the existence and permission checks, so a throw means "no such process" in
// every case this file can produce (the fixtures are our own children, so EPERM
// is not reachable here). Wrapped because the throw is the answer.
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

// Built at runtime with NOTHING committed — the convention
// `spawn-plan.win32.test.ts` and `command-resolution.test.ts` already follow.
// The shape is the one LIF-02 is about: Drift spawns a provider CLI (the
// parent), and the provider CLI spawns the token-bearing MCP server (the
// grandchild). The grandchild here stands in for `node mcp-server.mjs`.
async function spawnFixtureTree(options: {
  detached: boolean;
}): Promise<FixtureTree> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-kill-tree-"));
  tempDirs.push(dir);

  const grandchildPath = path.join(dir, "grandchild.mjs");
  await writeFile(
    grandchildPath,
    [
      "// Idles, then exits on its own so a failed case leaks nothing.",
      `setTimeout(() => { process.exit(0); }, ${String(FIXTURE_LIFETIME_MS)});`,
      "",
    ].join("\n"),
    "utf-8",
  );

  const parentPath = path.join(dir, "parent.mjs");
  await writeFile(
    parentPath,
    [
      'import { spawn } from "node:child_process";',
      "// stdio is ignored so the grandchild never holds this process's pipes",
      "// open — the test reads exactly one line and must not wait on a second",
      "// writer.",
      'const child = spawn(process.execPath, [process.argv[2]], { stdio: "ignore" });',
      'process.stdout.write(String(child.pid) + "\\n");',
      `setTimeout(() => { process.exit(0); }, ${String(FIXTURE_LIFETIME_MS)});`,
      "",
    ].join("\n"),
    "utf-8",
  );

  const parent: ChildProcess = spawn(
    process.execPath,
    [parentPath, grandchildPath],
    {
      stdio: ["ignore", "pipe", "ignore"],
      detached: options.detached,
    },
  );

  const parentPid = parent.pid;
  if (parentPid === undefined) throw new Error("fixture parent did not spawn");
  strayPids.push(parentPid);

  // Resolved from the EXIT EVENT rather than from a liveness probe: a killed
  // child of this process is a zombie until the runtime reaps it, and signal 0
  // succeeds against a zombie. Probing the parent's pid would therefore report a
  // dead process as alive.
  const parentExited = new Promise<void>((resolve) => {
    parent.on("exit", () => resolve());
  });

  const grandchildPid = await new Promise<number>((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(
      () => reject(new Error("fixture parent produced no pid line")),
      KILL_TREE_TIMEOUT_MS / 2,
    );
    parent.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const newline = buffered.indexOf("\n");
      if (newline === -1) return;
      clearTimeout(timer);
      const parsed = Number.parseInt(buffered.slice(0, newline).trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) resolve(parsed);
      else reject(new Error("fixture parent produced an unusable pid line"));
    });
  });
  strayPids.push(grandchildPid);

  return { parentPid, grandchildPid, parentExited };
}

describe.skipIf(process.platform === "win32")(
  "POSIX process-group termination (LIF-02)",
  () => {
    // THE FALSIFYING PARTNER, and it comes first because it is what makes the
    // second case mean anything. It reproduces today's shipped defect: a
    // single-pid kill against a non-detached parent leaves the grandchild — the
    // stand-in for the `CAIDO_TOKEN`-bearing `mcp-server.mjs` — running.
    //
    // If this case ever goes green BY THE GRANDCHILD DYING ANYWAY, do not
    // "fix" it by relaxing the assertion: the premise of LIF-02 would be wrong
    // and the case below would be proving nothing.
    //
    // Measured on darwin (arm64, Node 20) on 2026-08-24: the grandchild
    // SURVIVES.
    it(
      "CONTROL: without detached, a single-pid kill leaves the grandchild alive",
      async () => {
        const tree = await spawnFixtureTree({ detached: false });

        process.kill(tree.parentPid, "SIGKILL");
        await tree.parentExited;
        await settle();

        expect(isAlive(tree.grandchildPid)).toBe(true);
      },
      KILL_TREE_TIMEOUT_MS,
    );

    it(
      "with detached + the plan's group kill, the grandchild dies with the parent",
      async () => {
        const tree = await spawnFixtureTree({
          detached: shouldDetachProviderSpawn("linux"),
        });

        // Through the PRODUCTION builder. The argv is never spelled in this
        // file — that is the point of importing it.
        const plan = buildKillTreePlan({
          pid: tree.parentPid,
          platform: "linux",
          env: {},
          rung: "term",
        });
        expect(plan.kind).toBe("spawn");
        if (plan.kind !== "spawn") throw new Error("unreachable");

        spawn(plan.file, plan.args, { stdio: "ignore" });
        await tree.parentExited;
        await settle();

        expect(isAlive(tree.grandchildPid)).toBe(false);
      },
      KILL_TREE_TIMEOUT_MS,
    );
  },
);
