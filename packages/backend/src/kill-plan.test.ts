import { describe, expect, it } from "vitest";

import {
  buildKillTreePlan,
  DEFAULT_TASKKILL,
  type KillTreePlan,
  shouldDetachProviderSpawn,
} from "./kill-plan";

// Every input below is passed as a LITERAL, which is the entire point of
// `kill-plan.ts` being pure: the module reads no `process.env`, no OS module and
// no module-level singleton, so the whole Windows termination contract —
// including the `%SystemRoot%` casing fallback that only matters on Windows — is
// provable on the Linux CI runner. The maintainer cannot test native Windows
// locally, so this file IS the win32 proof for the argv shape; the real-host
// evidence is the separate, win32-gated suite plan 08-04 adds.
//
// That reach is exactly what recorded decision D-P4 bought. `buildKillTreePlan`
// takes an `env` RECORD rather than a resolved `systemRoot` scalar precisely so
// the dual-casing read below sits inside a test's reach instead of stranded in
// `index.ts`, which declares no `caido:plugin` alias and cannot be imported by
// any test this project can run.
//
// The describe/it titles are a CONTRACT with `08-VALIDATION.md`, whose
// Per-Task Verification Map addresses these rows by `-t "<name>"` — renaming one
// silently unhooks a requirement from its verification.

// A stock Windows install sets %SystemRoot% to exactly this.
const SYSTEM_ROOT = "C:\\Windows";
// Some environments (a value typed by hand into the System Properties dialog, or
// one round-tripped through a script that appends a separator) carry a trailing
// backslash. It must not produce a doubled separator.
const SYSTEM_ROOT_TRAILING = "C:\\Windows\\";
// A bare drive root: Windows installed to a second volume, where %SystemRoot%
// reduces to a drive letter plus a separator and nothing else. Stripping the
// trailing separator must leave "D:" so the join yields "D:\System32\…".
const SYSTEM_ROOT_BARE_DRIVE = "D:\\";

const TASKKILL_ON_C = "C:\\Windows\\System32\\taskkill.exe";
const TASKKILL_ON_D = "D:\\System32\\taskkill.exe";

// The pid every case uses, so the RENDERED forms — "4321" on win32 and "-4321"
// on POSIX — are recognisable at a glance.
const PID = 4321;

// Narrows the union without an `as`, so a refusal reaching an argv assertion
// fails with a readable message instead of a property access on `never`.
function expectSpawn(
  plan: KillTreePlan,
): Extract<KillTreePlan, { kind: "spawn" }> {
  if (plan.kind !== "spawn") {
    throw new Error(`expected a spawn plan, received kind=${plan.kind}`);
  }
  return plan;
}

describe("buildKillTreePlan — the refusal arms return no-pid (SC-1)", () => {
  // Asserted on EVERY platform and BOTH rungs, because the refusal is the first
  // branch and must not be reachable around: a guard that only holds on the arm
  // someone remembered to test is not a guard.
  const everyShape = [
    { platform: "win32" as const, rung: "term" as const },
    { platform: "win32" as const, rung: "kill" as const },
    { platform: "darwin" as const, rung: "term" as const },
    { platform: "darwin" as const, rung: "kill" as const },
    { platform: "linux" as const, rung: "term" as const },
    { platform: "linux" as const, rung: "kill" as const },
    { platform: undefined, rung: "term" as const },
    { platform: undefined, rung: "kill" as const },
  ];

  // The five unusable shapes, each with the reason it is not hypothetical.
  const REFUSED = [
    {
      label: "an undefined pid — what ChildProcess.pid reads once the child is reaped",
      pid: undefined,
    },
    { label: "NaN — a parse that failed, not a process", pid: Number.NaN },
    { label: "0 — on POSIX that means every process in Drift's own group", pid: 0 },
    { label: "-1 — already a group reference, and one nobody asked for", pid: -1 },
    { label: "1.5 — a non-integer cannot be a pid", pid: 1.5 },
  ];

  // The assertions are written INLINE rather than behind a helper on purpose:
  // `vitest/expect-expect` cannot see through a helper, and this project lints at
  // `--max-warnings 0`, so a helper would have to be registered in the ESLint
  // config for a gain of five lines. The second half of each body — the absence
  // of `file` and `args` — is not redundant with the first: a future widening of
  // the union could add an argv to the refusal arm, and a call site that forgot
  // to switch on `kind` would then spawn it, which is the SC-1 guard defeating
  // itself.
  it.each(REFUSED)("refuses $label", ({ pid }) => {
    for (const shape of everyShape) {
      const plan = buildKillTreePlan({
        pid,
        platform: shape.platform,
        env: { SystemRoot: SYSTEM_ROOT },
        rung: shape.rung,
      });
      expect(plan).toEqual({ kind: "none", reason: "no-pid" });
      expect(plan).not.toHaveProperty("file");
      expect(plan).not.toHaveProperty("args");
    }
  });
});

describe("buildKillTreePlan — the win32 arm resolves taskkill by absolute path (LIF-01 / SC-1)", () => {
  it("emits the rooted taskkill path, the /t /f argv and verbatim-arguments false", () => {
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: SYSTEM_ROOT },
        rung: "term",
      }),
    );

    expect(plan.file).toBe(TASKKILL_ON_C);
    expect(plan.args).toEqual(["/pid", "4321", "/t", "/f"]);
    // TRUE here would be a defect: nothing in this argv was escaped by the
    // module, so the runtime's own quoting is the correct one.
    expect(plan.windowsVerbatimArguments).toBe(false);
  });

  it("renders the pid as a decimal STRING inside args, never at the call site", () => {
    // The positive half of Pitfall 3. Keeping the rendering inside the pure
    // module is what makes `String(undefined)` unreachable — and this assertion
    // is what proves the rendering is here at all.
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: SYSTEM_ROOT },
        rung: "kill",
      }),
    );

    expect(plan.args).toContain("4321");
    expect(plan.args.every((argument) => typeof argument === "string")).toBe(true);
  });

  it("strips a trailing separator instead of doubling it", () => {
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: SYSTEM_ROOT_TRAILING },
        rung: "term",
      }),
    );

    expect(plan.file).toBe(TASKKILL_ON_C);
    expect(plan.file).not.toContain("\\\\System32");
  });

  it("reduces a bare drive root to its drive letter", () => {
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: SYSTEM_ROOT_BARE_DRIVE },
        rung: "term",
      }),
    );

    expect(plan.file).toBe(TASKKILL_ON_D);
  });

  it("reads the upper-case SYSTEMROOT spelling when it is the only one present", () => {
    // Windows' own lookup is case-insensitive, so on the real platform one
    // spelling would do. This test runs on Linux, where a plain object lookup is
    // case-SENSITIVE — which is the whole reason D-P4 passes the env record in
    // rather than a resolved scalar. Without that decision this line could not
    // exist anywhere a test can run.
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SYSTEMROOT: SYSTEM_ROOT },
        rung: "term",
      }),
    );

    expect(plan.file).toBe(TASKKILL_ON_C);
  });

  it("falls back to the bare name when the environment carries no root at all", () => {
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: {},
        rung: "term",
      }),
    );

    expect(plan.file).toBe(DEFAULT_TASKKILL);
    // Pinned as data: the fallback literal is a last resort that Windows
    // resolves through a search order including the working directory the plugin
    // host chose, so a silent change to it is a security-relevant change.
    expect(DEFAULT_TASKKILL).toBe("taskkill.exe");
  });

  it("treats a whitespace-only root as absent rather than joining onto it", () => {
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: "   " },
        rung: "term",
      }),
    );

    expect(plan.file).toBe(DEFAULT_TASKKILL);
  });

  it("emits byte-identical plans for both rungs — there is no graceful rung on Windows", () => {
    // LLRT maps every signal name to one TerminateProcess and consumes its kill
    // sender on the first call, so a two-rung ladder here would read as
    // graceful-then-forceful while being forceful-then-nothing (Pitfall 4).
    const term = buildKillTreePlan({
      pid: PID,
      platform: "win32",
      env: { SystemRoot: SYSTEM_ROOT },
      rung: "term",
    });
    const kill = buildKillTreePlan({
      pid: PID,
      platform: "win32",
      env: { SystemRoot: SYSTEM_ROOT },
      rung: "kill",
    });

    expect(term).toEqual(kill);
  });
});

describe("buildKillTreePlan — the POSIX arm signals a process group (LIF-02 / SC-2 / CMP-01)", () => {
  // `undefined` is IN this loop, not excluded from it: a pre-probe platform, or
  // one normalizePlatform refused to recognise, must take the arm that cannot
  // regress the shipping user base — the same rule as buildSpawnPlan's
  // non-win32-first branch.
  const posixPlatforms = ["darwin", "linux", undefined] as const;

  it("emits kill with a SIGTERM group operand on darwin, linux and an undefined platform", () => {
    for (const platform of posixPlatforms) {
      const plan = expectSpawn(
        buildKillTreePlan({ pid: PID, platform, env: {}, rung: "term" }),
      );

      expect(plan.file).toBe("kill");
      // `--` terminates option parsing so the negative operand is read as an
      // operand rather than as an unknown flag.
      expect(plan.args).toEqual(["-TERM", "--", "-4321"]);
      expect(plan.windowsVerbatimArguments).toBe(false);
    }
  });

  it("emits the SIGKILL operand on the same three platforms for the kill rung", () => {
    for (const platform of posixPlatforms) {
      const plan = expectSpawn(
        buildKillTreePlan({ pid: PID, platform, env: {}, rung: "kill" }),
      );

      expect(plan.file).toBe("kill");
      expect(plan.args).toEqual(["-KILL", "--", "-4321"]);
    }
  });

  it("renders the group reference as a negative decimal STRING inside args", () => {
    // The POSIX half of Pitfall 3's positive assertion. The minus sign belongs
    // to the RENDERING, in here, and not to a template literal at a call site.
    const plan = expectSpawn(
      buildKillTreePlan({ pid: PID, platform: "darwin", env: {}, rung: "term" }),
    );

    expect(plan.args).toContain("-4321");
    expect(plan.args).not.toContain("4321");
  });

  it("ignores the environment entirely on the POSIX arm", () => {
    // A Windows root leaking into a POSIX plan would be a sign the branches had
    // been merged. `kill` is resolved by name here on purpose: it is a POSIX
    // utility on PATH with no fixed absolute location across macOS and Linux.
    const withRoot = buildKillTreePlan({
      pid: PID,
      platform: "linux",
      env: { SystemRoot: SYSTEM_ROOT, SYSTEMROOT: SYSTEM_ROOT },
      rung: "term",
    });
    const withoutRoot = buildKillTreePlan({
      pid: PID,
      platform: "linux",
      env: {},
      rung: "term",
    });

    expect(withRoot).toEqual(withoutRoot);
  });
});

describe("shouldDetachProviderSpawn — only the provider spawn gets its own group (SC-2)", () => {
  it("returns false on win32, where taskkill walks parentage instead", () => {
    expect(shouldDetachProviderSpawn("win32")).toBe(false);
  });

  it("returns true on darwin, linux and an undefined platform (CMP-01)", () => {
    for (const platform of ["darwin", "linux", undefined] as const) {
      expect(shouldDetachProviderSpawn(platform)).toBe(true);
    }
  });
});
