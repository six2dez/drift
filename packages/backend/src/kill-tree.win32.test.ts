import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { buildKillTreePlan, DEFAULT_TASKKILL } from "./kill-plan";

// LIF-01's behavioural proof, and the only place in this phase where a WINDOWS
// process tree is actually torn down rather than described. It imports the SAME
// `buildKillTreePlan` that `index.ts` calls and deliberately re-derives NOTHING:
// a locally spelled termination argv would make this file agree with itself
// instead of with production, which is the rule
// `mcp-server-spec.spawn.test.ts:12-19` states and the reason the builder is
// shared at all.
//
// The skeleton — the single timeout constant, the temp-dir array with an
// `afterEach` that removes each recursively, the runtime-built fixtures with
// nothing committed, and the never-hang wrapper — is lifted structurally from
// `spawn-plan.win32.test.ts`, which is this repository's first conditionally
// gated file and the precedent for the `describe.skipIf` below. The fixture
// TREE is the structural sibling of `kill-tree.posix.test.ts`; nothing is
// imported from it, because each platform suite owns its own fixtures, the
// convention `spawn-plan.win32.test.ts` already follows.
//
// VEHICLE CAVEAT — READ THIS BEFORE CITING A GREEN RUN OF THIS FILE. Stated
// before any result, in Phase 3's vehicle-caveat voice, because the distinction
// is the whole reason the caveat exists.
//
// A green run here proves that the argv the PRODUCTION builder emits terminates
// a real Windows process tree on a real Windows host, under NODE.
//
// It does NOT prove `index.ts`'s WIRING of that argv: `index.ts` declares no
// `caido:plugin` alias and cannot be imported by any test this project can run,
// so no case below executes a single line of the orchestrator that calls
// `buildKillTreePlan` in production; the wiring is asserted statically in
// `index.source.test.ts`. It does NOT prove Caido's LLRT, which no CI leg in
// this repository executes. And it does NOT prove a real Drift turn on a real
// Windows desktop — ROADMAP Phase 10 SC-5 owns that, and the criterion there
// correctly guards the substitution trap: another green CI run does not satisfy
// it.
//
// Naming note, so a reader does not go looking for a third level: "parent" and
// "grandchild" are named RELATIVE TO THE TEST PROCESS, matching
// `kill-tree.posix.test.ts`. The pid this file hands the builder is the parent's;
// the grandchild is that parent's own child, and it is the stand-in for the
// `CAIDO_TOKEN`-bearing `node mcp-server.mjs`.

// One constant, referenced by every case as `it`'s third argument, so a future
// raise cannot apply to one of them only. 15 s rather than 5 s because Windows
// runners are materially slower at process creation and the security scanner
// reads a freshly written script — the correct response to that is a bigger
// budget, not a retry, which would convert a real hang into a flake that passes
// on the second attempt.
const SPAWN_TIMEOUT_MS = 15000;

// Long enough for a termination to be delivered and for the targets to leave the
// process table, and bounded so a failure is a failure rather than a hang.
const SETTLE_MS = 1000;

// The fixture processes idle for this long and then exit on their own, so a
// failed case leaks nothing on a shared runner even if every termination in it
// misses (threat T-08-17).
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

// A positive-pid signal-0 liveness probe. On Windows libuv answers signal 0 with
// `GetExitCodeProcess`, so a process that has been terminated reports dead even
// while this process still holds a handle to it — which is exactly what the two
// assertions in case 1 need.
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

type RunResult = {
  // NULL is reachable — a process ended by a signal reports no code — and the
  // type says so rather than papering over it with `?? 1`. Case 3's whole
  // assertion is that a NUMBER came back, and that assertion is only falsifiable
  // if the null is representable here.
  code: number | null;
  stderr: string;
  pid: number | undefined;
};

// Always clears its timer and never hangs: on the timeout it terminates the
// child and rejects, so a stuck case fails the leg rather than holding it.
async function runToCompletion(
  file: string,
  args: string[],
  windowsVerbatimArguments: boolean,
): Promise<RunResult> {
  return await new Promise<RunResult>((resolve, reject) => {
    // No `cmd.exe`, no interpreter, and no argument-splitting option:
    // `taskkill.exe` is a genuine PE executable and takes `buildSpawnPlan`'s
    // direct-spawn arm. Routing it through an interpreter would also break the
    // repo-wide Phase 7 security gate (07-SECURITY T-07-01).
    const child = spawn(file, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsVerbatimArguments,
    });
    const pid = child.pid;
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("the spawned process did not exit within the timeout"));
    }, SPAWN_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, pid });
    });
  });
}

// A pid that is guaranteed to be gone by the time it is returned: the process is
// run to completion through the wrapper above, so its exit is OBSERVED rather
// than assumed after a sleep.
async function createDeadPid(): Promise<number> {
  const result = await runToCompletion(
    process.execPath,
    ["-e", "process.exit(0)"],
    false,
  );
  if (result.pid === undefined) {
    throw new Error("the dead-pid probe did not spawn");
  }
  return result.pid;
}

type FixtureTree = {
  parentPid: number;
  grandchildPid: number;
  parentExited: Promise<void>;
};

// Built at runtime with NOTHING committed — the convention
// `spawn-plan.win32.test.ts`, `kill-tree.posix.test.ts` and
// `command-resolution.test.ts` already follow.
async function spawnFixtureTree(): Promise<FixtureTree> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drift-kill-tree-win32-"));
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
      "// open - the test reads exactly one line and must not wait on a second",
      "// writer.",
      'const child = spawn(process.execPath, [process.argv[2]], { stdio: "ignore" });',
      "// BOTH pids on one line: the parent's own, so the test can confirm the",
      "// handle it holds and the process that reported are the same one, and the",
      "// grandchild's, which no handle in the test process can supply.",
      'process.stdout.write(String(process.pid) + " " + String(child.pid) + "\\n");',
      `setTimeout(() => { process.exit(0); }, ${String(FIXTURE_LIFETIME_MS)});`,
      "",
    ].join("\n"),
    "utf-8",
  );

  const parent = spawn(process.execPath, [parentPath, grandchildPath], {
    stdio: ["ignore", "pipe", "ignore"],
    // FALSE, and stated rather than omitted: `shouldDetachProviderSpawn`
    // answers false on win32 because the walk below is indifferent to process
    // groups. This fixture is deliberately the shape production produces there.
    detached: false,
  });

  const parentPid = parent.pid;
  if (parentPid === undefined) throw new Error("fixture parent did not spawn");
  strayPids.push(parentPid);

  // Resolved from the EXIT EVENT rather than from a liveness probe, the same
  // reason `kill-tree.posix.test.ts` gives: the event is the unambiguous signal
  // that the handle this process holds has been reaped.
  const parentExited = new Promise<void>((resolve) => {
    parent.on("exit", () => resolve());
  });

  const reported = await new Promise<number[]>((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(
      () => reject(new Error("fixture parent produced no pid line")),
      SPAWN_TIMEOUT_MS / 2,
    );
    parent.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const newline = buffered.indexOf("\n");
      if (newline === -1) return;
      clearTimeout(timer);
      const parsed = buffered
        .slice(0, newline)
        .trim()
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10));
      if (
        parsed.length === 2 &&
        parsed.every((v) => Number.isInteger(v) && v > 0)
      ) {
        resolve(parsed);
      } else {
        reject(new Error("fixture parent produced an unusable pid line"));
      }
    });
  });

  const reportedParentPid = reported[0] as number;
  const grandchildPid = reported[1] as number;
  if (reportedParentPid !== parentPid) {
    throw new Error("fixture parent reported a pid other than its own");
  }
  strayPids.push(grandchildPid);

  return { parentPid, grandchildPid, parentExited };
}

describe.skipIf(process.platform !== "win32")(
  "win32 process-tree termination (LIF-01)",
  () => {
    it(
      "the plan's argv brings down a real process tree",
      async () => {
        const tree = await spawnFixtureTree();

        // Through the PRODUCTION builder. The termination argv is never spelled
        // in this file - that is the point of importing it, and an acceptance
        // criterion greps for the absence of the switch literal (threat T-08-02).
        const plan = buildKillTreePlan({
          pid: tree.parentPid,
          platform: "win32",
          env: process.env,
          rung: "kill",
        });
        expect(plan.kind).toBe("spawn");
        if (plan.kind !== "spawn") throw new Error("unreachable");

        await runToCompletion(
          plan.file,
          plan.args,
          plan.windowsVerbatimArguments,
        );
        await tree.parentExited;
        await settle();

        expect(isAlive(tree.parentPid)).toBe(false);
        expect(isAlive(tree.grandchildPid)).toBe(false);

        // PITFALL 5's RESIDUAL, named here rather than papered over. The tree
        // switch walks the ParentProcessId relation recorded in the process
        // table, so a descendant whose INTERMEDIATE parent has already exited is
        // no longer reachable from the original pid and is not terminated. This
        // case deliberately keeps the intermediate ALIVE, which is the shape
        // production hits in practice; the dead-intermediate hole is accepted
        // and recorded in `08-SECURITY.md` as AR-01, because the correct
        // primitive is a Windows Job Object that neither LLRT nor Node exposes
        // without a native addon the QuickJS runtime constraint bans.
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "resolves taskkill.exe by absolute path from the runner's own SystemRoot",
      async () => {
        // Assumption A7 turned into a MEASUREMENT on the one host that can
        // answer it. Nothing is spawned in this case, so the pid is an inert
        // literal rather than a live target.
        const plan = buildKillTreePlan({
          pid: 4321,
          platform: "win32",
          env: process.env,
          rung: "kill",
        });
        expect(plan.kind).toBe("spawn");
        if (plan.kind !== "spawn") throw new Error("unreachable");

        const systemRoot = (
          process.env.SystemRoot ??
          process.env.SYSTEMROOT ??
          ""
        ).trim();

        const tookFallbackArm = systemRoot === "";

        // A runner without a system root is a real ANSWER to A7, not a reason to
        // fail - so the fallback arm is asserted instead of the absolute one, and
        // the log says which arm was taken so the measurement is readable rather
        // than inferred from a green tick.
        console.log(
          tookFallbackArm
            ? "[measurement] the runner supplied no system root; the builder took its bare-name fallback arm"
            : `[measurement] the runner's system root resolved the killer to ${plan.file}`,
        );

        // ONE unconditional assertion over both arms, described as DATA. Written
        // as an `if` with an `expect` in each branch it trips
        // `vitest/no-conditional-expect`, which `pnpm lint` runs at
        // `--max-warnings 0` - and the rule is right: a branch that returns early
        // is a branch that can silently assert nothing.
        expect(
          tookFallbackArm
            ? { isBareKillerName: plan.file === DEFAULT_TASKKILL }
            : {
                endsWithSystem32Killer: plan.file.endsWith(
                  "\\System32\\taskkill.exe",
                ),
                existsOnDisk: existsSync(plan.file),
              },
        ).toEqual(
          tookFallbackArm
            ? { isBareKillerName: true }
            : { endsWithSystem32Killer: true, existsOnDisk: true },
        );
      },
      SPAWN_TIMEOUT_MS,
    );

    it(
      "[measurement] records taskkill's exit code and stderr for an already-dead pid",
      async () => {
        // ── RESERVED: the measured dead-pid result ────────────────────────
        //
        // Microsoft Learn documents no exit or return codes for taskkill; the
        // commonly-repeated 0/128/1 mapping is community knowledge. This block
        // is the slot where the MEASURED value and the run that produced it are
        // written after the first real windows-latest run, in the shape
        // `spawn-plan.ts:47-62` uses for its RED and GREEN URLs. It is empty on
        // purpose - an empty slot is visibly unfilled, a guessed number is not.
        //
        //   RUN   <windows-latest run URL — to be filled in a follow-up commit>
        //   CODE  <measured exit code — to be filled in a follow-up commit>
        //   TEXT  <measured first stderr line — to be filled in a follow-up commit>
        //
        // 08-RESEARCH.md assumption A2 is rated LOW **because** nothing in this
        // codebase branches on this value. It becomes HIGH the moment something
        // does. A non-zero exit during a cancel is the expected case as often as
        // not, because the pid frequently exits on its own between the decision
        // and the spawn - so the value below is a datum for a later phase, never
        // a control-flow input for this one.
        const deadPid = await createDeadPid();

        const plan = buildKillTreePlan({
          pid: deadPid,
          platform: "win32",
          env: process.env,
          rung: "kill",
        });
        expect(plan.kind).toBe("spawn");
        if (plan.kind !== "spawn") throw new Error("unreachable");

        const result = await runToCompletion(
          plan.file,
          plan.args,
          plan.windowsVerbatimArguments,
        );
        const firstStderrLine = result.stderr.split(/\r?\n/)[0] ?? "";

        console.log(
          `[measurement] taskkill against an already-dead pid: code=${String(result.code)} stderr=${JSON.stringify(firstStderrLine)}`,
        );

        // The ONLY assertion, and it is about the binary having resolved and run
        // at all - not about the value. Falsifiable because `code` is
        // `number | null`: a process ended by a signal, or one that never ran,
        // does not answer with a number.
        expect(typeof result.code).toBe("number");
      },
      SPAWN_TIMEOUT_MS,
    );
  },
);
