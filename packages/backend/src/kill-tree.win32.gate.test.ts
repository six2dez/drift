import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// ── LIF-01: the assertion that the win32 kill-tree suite's CI gate still exists ─
//
// `kill-tree.win32.test.ts` is the ONLY behavioural evidence for LIF-01's
// termination mechanism on Windows. The maintainer cannot run native Windows, so
// there is no second source and no manual fallback: if that file does not
// EXECUTE on the windows-latest leg, the mechanism is unverified and nothing
// says so.
//
// It is gated by `describe.skipIf(process.platform !== "win32")`, which means its
// failure mode is silence. A filename that drifts out of vitest's default include
// glob, an inverted predicate, or a move under an excluded path all leave the
// Windows leg green with zero Windows coverage — a false green on the one
// platform nobody can check by hand (threat T-08-15).
//
// ci.yml re-runs that one file with the JSON reporter and fails the leg unless
// the report shows tests actually ran. THIS file guards the guard: the gate
// itself could be deleted in a routine CI tidy-up, and its absence would be as
// silent as the failure it prevents. This suite runs on every platform, which is
// the point — the Linux legs are where a deleted gate gets noticed.
//
// What it cannot do, stated plainly: it asserts the gate's PRESENCE and that it
// points at a file that exists. It does not run the gate. The gate's own
// behaviour is exercised only on the Windows runner, and its three-arm shape is
// copied unchanged from the Phase 7 step whose arms were checked by hand against
// four report shapes.

const repoRoot = new URL("../../../", import.meta.url);
const ciWorkflow = readFileSync(
  fileURLToPath(new URL(".github/workflows/ci.yml", repoRoot)),
  "utf-8",
);

const WIN32_SUITE_PATH = "packages/backend/src/kill-tree.win32.test.ts";

// The Phase 8 anchors, and the Phase 7 anchors they must not collide with
// (recorded decision D-P2). Spelled as constants so the sixth case below reads
// as the comparison it is.
const KILL_TREE_GATE_STEP = "Gate: the win32 kill-tree suite actually ran";
const KILL_TREE_REPORT = "win32-kill-tree-report.json";
const SPAWN_PLAN_GATE_STEP = "Gate: the win32 spawn-plan suite actually ran";
const SPAWN_PLAN_REPORT = "win32-report.json";

describe("the windows CI leg asserts the win32 kill-tree suite ran (LIF-01)", () => {
  it("carries a gate step for it", () => {
    expect(ciWorkflow).toContain(KILL_TREE_GATE_STEP);
  });

  it("re-runs the suite under the JSON reporter, which is what makes the count readable", () => {
    // A bare `vitest run` reports nothing about WHICH files executed, and its
    // exit status is 0 for a fully skipped file. The count has to be read.
    expect(ciWorkflow).toContain(WIN32_SUITE_PATH);
    expect(ciWorkflow).toContain("--reporter=json");
  });

  it("fails on a skipped, uncollected or partly-failing run", () => {
    // The three ways the leg could go green with nothing proven.
    expect(ciWorkflow).toContain("pending > 0");
    expect(ciWorkflow).toContain("total === 0");
    expect(ciWorkflow).toContain("passed !== total");
  });

  it("names a suite path that exists — a rename must not leave the gate pointing at nothing", () => {
    expect(existsSync(fileURLToPath(new URL(WIN32_SUITE_PATH, repoRoot)))).toBe(
      true,
    );
  });

  it("still needs the gate: the suite is platform-gated and skips silently elsewhere", () => {
    // The falsifiability partner. If someone removes the `skipIf`, this test
    // fails and the gate's justification has to be re-read rather than assumed.
    const suite = readFileSync(
      fileURLToPath(new URL(WIN32_SUITE_PATH, repoRoot)),
      "utf-8",
    );
    expect(suite).toContain('describe.skipIf(process.platform !== "win32")');
  });

  // THE SIXTH CASE, unique to Phase 8, and the direct closure of the collision
  // D-P2 records. The three arms above (`--reporter=json`, `pending > 0`,
  // `total === 0`, `passed !== total`) are word-for-word what
  // `spawn-plan.win32.gate.test.ts` already asserts, so on those strings alone
  // EITHER step satisfies BOTH suites — and either could then be deleted with
  // both suites still green, which is a gate that is green because its twin
  // exists. Pinning both step names and both report filenames, and asserting the
  // filenames differ, is what makes each gate falsifiable on its own step.
  it("cannot be satisfied by the Phase 7 gate step, nor it by this one", () => {
    expect(ciWorkflow).toContain(KILL_TREE_GATE_STEP);
    expect(ciWorkflow).toContain(SPAWN_PLAN_GATE_STEP);
    expect(ciWorkflow).toContain(KILL_TREE_REPORT);
    expect(ciWorkflow).toContain(SPAWN_PLAN_REPORT);
    expect(KILL_TREE_REPORT).not.toEqual(SPAWN_PLAN_REPORT);
  });
});
