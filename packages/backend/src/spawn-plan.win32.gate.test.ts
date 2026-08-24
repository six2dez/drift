import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// ── WR-08: the assertion that the win32 suite's CI gate still exists ─
//
// `spawn-plan.win32.test.ts` is the ONLY evidence for PRV-01/PRV-02's cmd.exe
// escaping contract. The maintainer cannot run native Windows, so there is no
// second source and no manual fallback: if that file does not EXECUTE on the
// windows-latest leg, the contract is unverified and nothing says so.
//
// It is gated by `describe.skipIf(process.platform !== "win32")`, which means
// its failure mode is silence. A filename that drifts out of vitest's default
// include glob, an inverted predicate, or a move under an excluded path all
// leave the Windows leg green with zero Windows coverage — a false green on the
// one platform nobody can check by hand.
//
// ci.yml now re-runs that one file with the JSON reporter and fails the leg
// unless the report shows tests actually ran. THIS file guards the guard: the
// gate itself could be deleted in a routine CI tidy-up, and its absence would be
// as silent as the failure it prevents. This suite runs on every platform, which
// is the point — the Linux legs are where a deleted gate gets noticed.
//
// What it cannot do, stated plainly: it asserts the gate's PRESENCE and that it
// points at a file that exists. It does not run the gate. The gate's own
// behaviour was checked by hand against four report shapes (5 skipped → fail,
// 5 passed → pass, 0 collected → fail, 4 of 5 passed → fail) and is otherwise
// exercised only on the Windows runner.

const repoRoot = new URL("../../../", import.meta.url);
const ciWorkflow = readFileSync(
  fileURLToPath(new URL(".github/workflows/ci.yml", repoRoot)),
  "utf-8",
);

const WIN32_SUITE_PATH = "packages/backend/src/spawn-plan.win32.test.ts";

describe("the windows CI leg asserts the win32 spawn-plan suite ran (WR-08)", () => {
  it("carries a gate step for it", () => {
    expect(ciWorkflow).toContain(
      "Gate: the win32 spawn-plan suite actually ran",
    );
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
    expect(
      existsSync(fileURLToPath(new URL(WIN32_SUITE_PATH, repoRoot))),
    ).toBe(true);
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
});
